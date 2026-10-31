-- Owning team and priority, with an AI suggestion (Backend Tasks A08; E05).
--
-- A PRD can have an owning team (a team of its organization) and a priority.
-- Neither is reviewed material: changing them makes no version, doesn't
-- move the content revision and doesn't affect review. The owning team is
-- not an assignment and grants no access.
--
-- Who sets them (v1.2 A08): the PRD's owner or an org admin
-- (can_manage_prd), by hand or by accepting a classifier suggestion.
-- Editors can still edit the document but not these two columns.
--
-- The classifier's suggestions live in classification_suggestion, written
-- only by the backend (like ai_proposal), so a suggestion proves a real
-- model call. Each one is bound to its requester, PRD and base revision and
-- is decided once.

-- -------------------------------------------------------------------------
-- 1. Columns and their rules
-- -------------------------------------------------------------------------

alter table prd
  add column owning_team_id uuid references team(id) on delete set null,
  add column priority text check (priority in ('low', 'medium', 'high', 'critical'));

-- On a change: only an owner or org admin (or the backend's own functions),
-- and the team must be an active team of the PRD's organization.
-- SECURITY INVOKER on purpose: current_user must be the caller (authenticated
-- for a browser, service_role for the backend, the owner role inside the
-- backend's definer functions). can_manage_prd is itself a definer helper,
-- and owners and org admins can read their organization's teams.
create or replace function check_prd_routing()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.owning_team_id is not distinct from old.owning_team_id
     and new.priority is not distinct from old.priority then
    return new;
  end if;
  if current_user not in ('postgres', 'service_role') and not can_manage_prd(new.id) then
    raise exception 'Only the PRD''s owners or an org admin can set its team and priority'
      using errcode = 'insufficient_privilege';
  end if;
  if new.owning_team_id is distinct from old.owning_team_id and new.owning_team_id is not null
     and not exists (select 1 from team
                     where id = new.owning_team_id and organization_id = new.organization_id
                       and archived_at is null) then
    raise exception 'The team must be an active team of the PRD''s organization'
      using errcode = 'check_violation', constraint = 'prd_owning_team';
  end if;
  return new;
end;
$$;

revoke execute on function check_prd_routing() from public, anon, authenticated;

create trigger prd_routing_check before update on prd
  for each row execute function check_prd_routing();

-- -------------------------------------------------------------------------
-- 2. Classifier records and suggestions
-- -------------------------------------------------------------------------

-- Additive trigger value for generation_record (v1.2 A02 lists it).
alter table generation_record drop constraint generation_record_trigger_check;
alter table generation_record add constraint generation_record_trigger_check
  check ("trigger" in ('initial_generation', 'chat_request', 'classification'));

create table classification_suggestion (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null references prd(id) on delete cascade,
  requested_by uuid references profile(id) on delete set null,
  base_revision integer not null check (base_revision >= 1),
  suggested_team_id uuid references team(id) on delete set null,
  suggested_priority text not null check (suggested_priority in ('low', 'medium', 'high', 'critical')),
  rationale text not null check (char_length(rationale) between 1 and 500),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  final_team_id uuid references team(id) on delete set null,
  final_priority text check (final_priority in ('low', 'medium', 'high', 'critical')),
  decided_by uuid references profile(id) on delete set null,
  decided_at timestamptz,
  generation_record_id uuid not null unique references generation_record(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null))
);

create index classification_suggestion_prd on classification_suggestion (prd_id, created_at desc);

alter table classification_suggestion enable row level security;
revoke all on classification_suggestion from anon, authenticated;
grant select on classification_suggestion to authenticated;
grant select, insert, update, delete on classification_suggestion to service_role;

-- People who can see a PRD can see its suggestion history (kept as feedback
-- for later prompts, v1.2 A08). Only the backend writes it.
create policy "view suggestions on prds you can view" on classification_suggestion
  for select using (can_view_prd(prd_id));

-- Records one classifier call for p_actor and, when it succeeded on the
-- current revision, stores its suggestion. Returns (generation_record_id,
-- suggestion_id, outcome): 'suggested', 'stale' (the PRD was saved meanwhile;
-- recorded, nothing stored) or 'recorded' (a failed call). Raises NT404 (not
-- visible), NT403 (not owner/org admin), NT422 (bad arguments or a team that
-- isn't an active team of the PRD's organization).
create or replace function ai_record_classification(
  p_actor uuid,
  p_prd_id uuid,
  p_base_revision integer,
  p_model text,
  p_prompt_version text,
  p_status text,
  p_error_code text,
  p_prompt_tokens integer,
  p_output_tokens integer,
  p_team_id uuid,
  p_priority text,
  p_rationale text
)
returns table (generation_record_id uuid, suggestion_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target prd;
  context_version_now integer;
  record_id uuid;
  new_suggestion uuid;
begin
  if p_actor is null or p_prd_id is null or p_base_revision is null or p_base_revision < 1 or p_model is null
     or p_status not in ('success', 'failed')
     or (p_status = 'failed') <> (p_error_code is not null)
     or (p_status = 'success') <> (p_priority is not null and p_rationale is not null) then
    raise exception 'Invalid classification record' using errcode = 'NT422';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);

  select * into target from prd where id = p_prd_id;
  if not found or not can_view_prd(p_prd_id) then
    raise exception 'PRD not found' using errcode = 'NT404';
  end if;
  if not can_manage_prd(p_prd_id) then
    raise exception 'Only the PRD''s owners or an org admin can classify it' using errcode = 'NT403';
  end if;
  if p_team_id is not null and not exists (
       select 1 from team where id = p_team_id and organization_id = target.organization_id and archived_at is null) then
    raise exception 'Suggested team is not an active team of this organization' using errcode = 'NT422';
  end if;

  select version into context_version_now from prd_context where prd_id = p_prd_id;
  insert into generation_record (prd_id, "trigger", model, prompt_version, context_version, status, error_message,
                                 requester_id, base_revision, prompt_tokens, output_tokens)
  values (p_prd_id, 'classification', p_model, p_prompt_version, context_version_now, p_status, p_error_code,
          p_actor, p_base_revision, p_prompt_tokens, p_output_tokens)
  returning id into record_id;

  if p_status = 'failed' then
    return query select record_id, null::uuid, 'recorded'::text;
    return;
  end if;
  if target.revision <> p_base_revision then
    return query select record_id, null::uuid, 'stale'::text;
    return;
  end if;
  insert into classification_suggestion (prd_id, requested_by, base_revision, suggested_team_id,
                                         suggested_priority, rationale, generation_record_id)
  values (p_prd_id, p_actor, p_base_revision, p_team_id, p_priority, p_rationale, record_id)
  returning id into new_suggestion;
  return query select record_id, new_suggestion, 'suggested'::text;
end;
$$;

-- The owner or an org admin decides a pending suggestion, once. Accepting
-- sets the PRD's owning team and priority (the suggested values, or the
-- adjusted ones passed in) and records both; rejecting records only the
-- decision. Neither makes a version or moves the revision. Raises NT404,
-- NT403, NTSUG (no such pending suggestion on this PRD: missing, another
-- PRD's, or already decided) and NT422 (bad decision or team).
create or replace function classification_decide(
  p_actor uuid,
  p_prd_id uuid,
  p_suggestion_id uuid,
  p_decision text,
  p_team_id uuid,
  p_set_team boolean,
  p_priority text
)
returns prd
language plpgsql
security definer
set search_path = public
as $$
declare
  target prd;
  suggestion classification_suggestion;
  final_team uuid;
  final_priority_value text;
  saved prd;
begin
  if p_decision not in ('accepted', 'rejected') then
    raise exception 'Unknown decision' using errcode = 'NT422';
  end if;
  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);

  -- Lock order: the PRD row, then its suggestion.
  select * into target from prd where id = p_prd_id for update;
  if not found or not can_view_prd(p_prd_id) then
    raise exception 'PRD not found' using errcode = 'NT404';
  end if;
  if not can_manage_prd(p_prd_id) then
    raise exception 'Only the PRD''s owners or an org admin can decide' using errcode = 'NT403';
  end if;
  select * into suggestion from classification_suggestion
  where id = p_suggestion_id and prd_id = p_prd_id for update;
  if not found or suggestion.status <> 'pending' then
    raise exception 'No pending suggestion' using errcode = 'NTSUG';
  end if;

  if p_decision = 'rejected' then
    update classification_suggestion set status = 'rejected', decided_by = p_actor, decided_at = now()
    where id = suggestion.id;
    return target;
  end if;

  final_team := case when p_set_team then p_team_id else suggestion.suggested_team_id end;
  final_priority_value := coalesce(p_priority, suggestion.suggested_priority);
  if final_priority_value not in ('low', 'medium', 'high', 'critical') then
    raise exception 'Unknown priority' using errcode = 'NT422';
  end if;
  if final_team is not null and not exists (
       select 1 from team where id = final_team and organization_id = target.organization_id and archived_at is null) then
    raise exception 'Team is not an active team of this organization' using errcode = 'NT422';
  end if;
  update prd set owning_team_id = final_team, priority = final_priority_value
  where id = p_prd_id returning * into saved;
  update classification_suggestion
  set status = 'accepted', final_team_id = final_team, final_priority = final_priority_value,
      decided_by = p_actor, decided_at = now()
  where id = suggestion.id;
  return saved;
end;
$$;

revoke execute on function
  ai_record_classification(uuid, uuid, integer, text, text, text, text, integer, integer, uuid, text, text),
  classification_decide(uuid, uuid, uuid, text, uuid, boolean, text)
from public, anon, authenticated;
grant execute on function
  ai_record_classification(uuid, uuid, integer, text, text, text, text, integer, integer, uuid, text, text),
  classification_decide(uuid, uuid, uuid, text, uuid, boolean, text)
to service_role;
