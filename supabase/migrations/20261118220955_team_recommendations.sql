-- AI-recommended teams for a PRD (M4/M5 feature 08(b), Marco), on feature 02's
-- add_team_to_prd (Vineela, 20261116003328_team_assignment).
--
-- Scope confirmed by Marco on 2026-11-17:
-- - The AI recommends up to three existing, active teams of the PRD's
--   organization, each with a reason.
-- - The owner selects which of them to add, each as editors or viewers.
--   Accepting calls add_team_to_prd for each selected team, so it skips
--   people already on the PRD and never downgrades (or upgrades) anyone. The
--   membership and team_added event logic stay in that one function.
-- - The single owning-team/priority classification (A08,
--   20261030170000_prd_routing) is a separate operation and is unchanged.
-- - Permissions and team eligibility are checked again at acceptance (by
--   add_team_to_prd, under the PRD lock).
--
-- Who: the PRD's owners and org admins (can_manage_prd), the same people
-- add_team_to_prd allows.
--
-- Recording: one generation_record per model call, with trigger
-- 'classification' (A08's trigger for "AI suggests teams for routing"; the
-- prompt version tells the two apart). This migration doesn't replace the
-- generation_record trigger check, so it can't undo #163's
-- discussion_summary value in either application order.
--
-- Errors:
-- - ai_record_team_recommendation (service role only) raises NT404, NT403 or
--   NT422, like ai_record_classification.
-- - decide_team_recommendation (the user's own token) raises P0001 with a
--   fixed message: recommendation_unavailable, invalid_decision,
--   invalid_selection, team_not_recommended, plus add_team_to_prd's
--   prd_not_found, prd_manage_forbidden, invalid_team_role and team_not_found.
--
-- Apply after 20261116003328_team_assignment. Adds a table and three
-- functions; changes no rows and replaces nothing.

-- -------------------------------------------------------------------------
-- 1. Recommendations
-- -------------------------------------------------------------------------

create table team_recommendation (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null references prd(id) on delete cascade,
  requested_by uuid references profile(id) on delete set null,
  base_revision integer not null check (base_revision >= 1),
  -- [{team_id, reason}], 1 to 3, in the model's order. Team ids stay as text
  -- here: a team deleted later just can't be accepted any more.
  teams jsonb not null check (jsonb_typeof(teams) = 'array' and jsonb_array_length(teams) between 1 and 3),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected')),
  -- Accepted only: [{team_id, role}] as chosen.
  selections jsonb,
  decided_by uuid references profile(id) on delete set null,
  decided_at timestamptz,
  generation_record_id uuid not null unique references generation_record(id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null)),
  check ((status = 'accepted') = (selections is not null))
);

create index team_recommendation_prd on team_recommendation (prd_id, created_at desc);

alter table team_recommendation enable row level security;
revoke all on team_recommendation from anon, authenticated;
grant select on team_recommendation to authenticated;
grant select, insert, update, delete on team_recommendation to service_role;

-- As for classification suggestions: people who can see the PRD can see its
-- history. Only the functions below write it.
create policy "view team recommendations on prds you can view" on team_recommendation
  for select using (can_view_prd(prd_id));

-- -------------------------------------------------------------------------
-- 2. Candidate teams
-- -------------------------------------------------------------------------

-- The teams the AI may choose from, read as the caller: every team of the
-- PRD's organization that isn't archived, with how many active members it
-- has and how many of them aren't on the PRD yet. Owners and org admins only.
-- SECURITY INVOKER: RLS on team, team_member, organization_member and
-- prd_member applies, and owners and admins can read all four.
create or replace function prd_team_candidates(target_prd uuid)
returns table (team_id uuid, name text, department text, active_members integer, new_members integer)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  org uuid;
begin
  select organization_id into org from prd where id = target_prd;
  if org is null or not can_view_prd(target_prd) then
    raise exception 'prd_not_found';
  end if;
  if not can_manage_prd(target_prd) then
    raise exception 'prd_manage_forbidden';
  end if;
  return query
    select t.id, t.name, d.name,
           count(om.user_id)::integer,
           count(om.user_id) filter (where pm.user_id is null)::integer
    from team t
    left join department d on d.id = t.department_id
    left join team_member tm on tm.team_id = t.id and tm.organization_id = t.organization_id
    left join organization_member om
      on om.organization_id = tm.organization_id and om.user_id = tm.user_id and om.active
    left join prd_member pm on pm.prd_id = target_prd and pm.user_id = om.user_id
    where t.organization_id = org and t.archived_at is null
    group by t.id, t.name, d.name
    order by t.name, t.id;
end;
$$;

revoke execute on function prd_team_candidates(uuid) from public, anon;
grant execute on function prd_team_candidates(uuid) to authenticated, service_role;

-- -------------------------------------------------------------------------
-- 3. Recording a recommendation
-- -------------------------------------------------------------------------

-- Records one model call for p_actor and, when it succeeded, stores its
-- recommendation. p_base_revision is the revision whose content was sent to
-- the model. A save that landed while the model ran doesn't discard the
-- recommendation (content edits don't invalidate one); it keeps that older
-- base_revision so the frontend can show it predates the latest edits.
-- Returns (generation_record_id, recommendation_id, outcome): 'suggested', or
-- 'recorded' for a failed call.
create or replace function ai_record_team_recommendation(
  p_actor uuid,
  p_prd_id uuid,
  p_base_revision integer,
  p_model text,
  p_prompt_version text,
  p_status text,
  p_error_code text,
  p_prompt_tokens integer,
  p_output_tokens integer,
  p_teams jsonb
)
returns table (generation_record_id uuid, recommendation_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  target prd;
  context_version_now integer;
  record_id uuid;
  new_recommendation uuid;
begin
  if p_actor is null or p_prd_id is null or p_base_revision is null or p_base_revision < 1 or p_model is null
     or p_status is null or p_status not in ('success', 'failed')
     or (p_status = 'failed') <> (p_error_code is not null)
     or (p_status = 'success') <> (p_teams is not null) then
    raise exception 'Invalid team recommendation record' using errcode = 'NT422';
  end if;
  if p_teams is not null and (
       jsonb_typeof(p_teams) <> 'array' or jsonb_array_length(p_teams) not between 1 and 3
       or exists (select 1 from jsonb_array_elements(p_teams) e(item)
                  where jsonb_typeof(e.item) <> 'object'
                     or jsonb_typeof(e.item -> 'team_id') <> 'string'
                     or (e.item ->> 'team_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                     or jsonb_typeof(e.item -> 'reason') <> 'string'
                     or char_length(btrim(e.item ->> 'reason')) not between 1 and 300
                     or (select count(*) from jsonb_object_keys(e.item)) <> 2)
       or (select count(distinct e.item ->> 'team_id') from jsonb_array_elements(p_teams) e(item))
          <> jsonb_array_length(p_teams)) then
    raise exception 'Recommendations must be 1 to 3 distinct teams with reasons' using errcode = 'NT422';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);

  select * into target from prd where id = p_prd_id;
  if not found or not can_view_prd(p_prd_id) then
    raise exception 'PRD not found' using errcode = 'NT404';
  end if;
  if p_base_revision > target.revision then
    raise exception 'Base revision is newer than the PRD' using errcode = 'NT422';
  end if;
  if not can_manage_prd(p_prd_id) then
    raise exception 'Only the PRD''s owners or an org admin can add teams' using errcode = 'NT403';
  end if;
  if p_teams is not null and exists (
       select 1 from jsonb_array_elements(p_teams) e(item)
       where not exists (select 1 from team
                         where id = (e.item ->> 'team_id')::uuid and organization_id = target.organization_id
                           and archived_at is null)) then
    raise exception 'A recommended team is not an active team of this organization' using errcode = 'NT422';
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
  insert into team_recommendation (prd_id, requested_by, base_revision, teams, generation_record_id)
  values (p_prd_id, p_actor, p_base_revision, p_teams, record_id)
  returning id into new_recommendation;
  return query select record_id, new_recommendation, 'suggested'::text;
end;
$$;

revoke execute on function
  ai_record_team_recommendation(uuid, uuid, integer, text, text, text, text, integer, integer, jsonb)
from public, anon, authenticated;
grant execute on function
  ai_record_team_recommendation(uuid, uuid, integer, text, text, text, text, integer, integer, jsonb)
to service_role;

-- -------------------------------------------------------------------------
-- 4. Deciding
-- -------------------------------------------------------------------------

-- An owner or org admin decides a pending recommendation, once, with their
-- own token (auth.uid() is the actor).
-- - 'rejected': records the decision; nobody is added.
-- - 'accepted' with p_selections = [{team_id, role}] (1 to 3, distinct, each
--   one of the recommended teams, role editor or viewer): calls
--   add_team_to_prd for each, editors first, so someone in two selected
--   teams gets the higher of the two roles. add_team_to_prd rechecks the
--   caller and each team under the PRD lock and records each team's
--   team_added event. Any failure (a team archived since, a role refused,
--   access lost) rolls everything back and the recommendation stays pending.
-- Returns {status, results: [{team_id, role, added, skipped}]}. Membership
-- isn't content, so the PRD's revision doesn't have to match the one the
-- recommendation was made for.
create or replace function decide_team_recommendation(target_prd uuid, target_recommendation uuid,
                                                      decision text, selections jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec team_recommendation;
  chosen record;
  outcome jsonb;
  results jsonb := '[]';
begin
  perform lock_managed_prd(target_prd);  -- PRD lock first, then the recommendation
  select * into rec from team_recommendation
  where id = target_recommendation and prd_id = target_prd for update;
  if not found or rec.status <> 'pending' then
    raise exception 'recommendation_unavailable';
  end if;
  if decision is null or decision not in ('accepted', 'rejected') then
    raise exception 'invalid_decision';
  end if;

  if decision = 'rejected' then
    if selections is not null then
      raise exception 'invalid_selection';
    end if;
    update team_recommendation set status = 'rejected', decided_by = auth.uid(), decided_at = now()
    where id = rec.id;
    return jsonb_build_object('status', 'rejected', 'results', '[]'::jsonb);
  end if;

  if selections is null or jsonb_typeof(selections) <> 'array'
     or jsonb_array_length(selections) not between 1 and 3
     or exists (select 1 from jsonb_array_elements(selections) s(item)
                where jsonb_typeof(s.item) <> 'object'
                   or jsonb_typeof(s.item -> 'team_id') <> 'string'
                   or jsonb_typeof(s.item -> 'role') <> 'string')
     or (select count(distinct s.item ->> 'team_id') from jsonb_array_elements(selections) s(item))
        <> jsonb_array_length(selections) then
    raise exception 'invalid_selection';
  end if;
  if exists (select 1 from jsonb_array_elements(selections) s(item)
             where not exists (select 1 from jsonb_array_elements(rec.teams) t(item)
                               where t.item ->> 'team_id' = s.item ->> 'team_id')) then
    raise exception 'team_not_recommended';
  end if;

  for chosen in
    select s.item ->> 'team_id' as team_id, s.item ->> 'role' as role
    from jsonb_array_elements(selections) with ordinality s(item, position)
    order by (s.item ->> 'role') = 'editor' desc, s.position
  loop
    outcome := add_team_to_prd(target_prd, chosen.team_id::uuid, chosen.role);
    results := results || jsonb_build_array(jsonb_build_object(
      'team_id', chosen.team_id, 'role', chosen.role,
      'added', outcome -> 'added', 'skipped', outcome -> 'skipped'));
  end loop;

  update team_recommendation
  set status = 'accepted', selections = decide_team_recommendation.selections,
      decided_by = auth.uid(), decided_at = now()
  where id = rec.id;
  return jsonb_build_object('status', 'accepted', 'results', results);
end;
$$;

revoke execute on function decide_team_recommendation(uuid, uuid, text, jsonb) from public, anon;
grant execute on function decide_team_recommendation(uuid, uuid, text, jsonb) to authenticated, service_role;
