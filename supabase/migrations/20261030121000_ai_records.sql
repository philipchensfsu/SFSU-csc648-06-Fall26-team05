-- AI generation records, durable context bounds and staged proposals
-- (Backend Tasks A02, DB01 AI part).
--
-- 1. generation_record is bound to the verified requester and the PRD revision
--    the request was based on, and only the backend writes it. A record with
--    status success is the proof that a real Gemini call happened, so a
--    browser must not be able to insert one (v1.2 S02/A02).
-- 2. prd_context stays one row per PRD, with a bounded, checked shape.
-- 3. ai_proposal stages a validated proposal (and any context patch) without
--    touching the PRD's saved content, review state or durable context. A
--    proposal is bound to one requester, PRD and base revision and can be
--    accepted once, inside the normal save (A05).
--
-- The write functions run with the service role from the backend
-- (ai/records.py), the same trusted-writer pattern as save_prd in #55. That
-- service-role path is an architecture exception still under review on #55;
-- this migration follows the same pattern and doesn't settle it.
--
-- Errors use custom SQLSTATEs that ai/records.py maps to API errors:
--   NT404 PRD not found or not visible, NT403 visible but not editable,
--   NT409 stale base revision, NT422 invalid arguments,
--   NTPRP proposal missing, not the caller's, already used, rejected or expired.

-- -------------------------------------------------------------------------
-- 1. generation_record
-- -------------------------------------------------------------------------

alter table generation_record
  add column requester_id uuid references profile(id) on delete set null,
  add column base_revision integer check (base_revision >= 1),
  add column prompt_tokens integer check (prompt_tokens >= 0),
  add column output_tokens integer check (output_tokens >= 0);

comment on column generation_record.error_message is
  'For failed records: the API error code only (for example ai_invalid_output), never provider text.';

-- Browsers could insert records for PRDs they can edit; now only the backend can.
drop policy if exists "write generation records" on generation_record;
revoke insert, update, delete on generation_record from authenticated;

create index if not exists generation_record_prd on generation_record (prd_id, created_at desc);
create index generation_record_requester on generation_record (requester_id, created_at desc);

-- -------------------------------------------------------------------------
-- 2. prd_context shape
-- -------------------------------------------------------------------------

-- Allowed keys and bounds for prd_context.context_json and for staged context
-- patches (which may also carry running_summary, a column on prd_context).
create or replace function ai_context_shape_ok(doc jsonb, allow_summary boolean)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  key text;
  value jsonb;
  item jsonb;
  max_items integer;
  max_chars integer;
begin
  if doc is null or jsonb_typeof(doc) <> 'object' then
    return false;
  end if;
  for key, value in select * from jsonb_each(doc) loop
    if key = 'running_summary' then
      if not allow_summary or jsonb_typeof(value) <> 'string'
         or char_length(value #>> '{}') > 4000 then
        return false;
      end if;
      continue;
    end if;
    if key in ('decisions', 'constraints', 'open_questions') then
      max_items := 50; max_chars := 500;
    elsif key = 'change_log' then
      max_items := 20; max_chars := 300;
    elsif key = 'source_ids' then
      max_items := 50; max_chars := 36;
    else
      return false;
    end if;
    if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > max_items then
      return false;
    end if;
    for item in select * from jsonb_array_elements(value) loop
      if jsonb_typeof(item) <> 'string'
         or char_length(item #>> '{}') not between 1 and max_chars then
        return false;
      end if;
      if key = 'source_ids' and (item #>> '{}')
         !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        return false;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

revoke execute on function ai_context_shape_ok(jsonb, boolean) from public, anon;
grant execute on function ai_context_shape_ok(jsonb, boolean) to authenticated, service_role;

alter table prd_context
  add constraint prd_context_shape check (ai_context_shape_ok(context_json, false));

-- Durable context changes only through the server: accepted proposals
-- (ai_apply_context_patch) and saves. Browsers keep read access to the
-- context of PRDs they can see, but can't write it directly, so it can't
-- drift from the proposals and generation records that refer to its version.
drop policy if exists "write prd context" on prd_context;
drop policy if exists "update prd context" on prd_context;
drop policy if exists "delete prd context" on prd_context;
revoke insert, update, delete on prd_context from authenticated;

-- -------------------------------------------------------------------------
-- 3. ai_proposal
-- -------------------------------------------------------------------------

create table ai_proposal (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null references prd(id) on delete cascade,
  requester_id uuid not null references profile(id) on delete cascade,
  kind text not null check (kind in ('generate', 'ai_edit', 'review_suggestion')),
  base_revision integer not null check (base_revision >= 1),
  -- generate: {title, description, content_json, doc_schema_version}.
  content jsonb not null check (jsonb_typeof(content) = 'object' and pg_column_size(content) <= 1200000),
  -- Staged only; merged into prd_context when the proposal is accepted.
  context_patch jsonb check (context_patch is null or ai_context_shape_ok(context_patch, true)),
  generation_record_id uuid not null unique references generation_record(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'rejected', 'expired')),
  expires_at timestamptz not null,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check ((status = 'pending') = (decided_at is null))
);

create index ai_proposal_prd on ai_proposal (prd_id, created_at desc);
create index ai_proposal_requester_pending on ai_proposal (requester_id) where status = 'pending';

-- Backend only: no client grants, no policies.
alter table ai_proposal enable row level security;
revoke all on ai_proposal from anon, authenticated;
grant select, insert, update, delete on ai_proposal to service_role;

-- -------------------------------------------------------------------------
-- 4. Functions
-- -------------------------------------------------------------------------

-- Records one AI request after the provider call, and stages its proposal.
-- p_actor is the user the backend already authenticated; it becomes the JWT
-- subject for this transaction so can_view_prd/can_edit_prd answer for them.
-- Recording needs view access (chat answers included); a proposal that could
-- change the document needs edit access.
-- outcome: 'staged' (proposal created), 'stale' (the PRD changed while the
-- model ran; recorded, nothing staged), 'recorded' (failure or no proposal).
create or replace function ai_record_generation(
  p_actor uuid,
  p_prd_id uuid,
  p_base_revision integer,
  p_trigger text,
  p_model text,
  p_prompt_version text,
  p_status text,
  p_error_code text,
  p_user_request text,
  p_prompt_tokens integer,
  p_output_tokens integer,
  p_proposal_kind text,
  p_proposal_content jsonb,
  p_context_patch jsonb,
  p_ttl_seconds integer
)
returns table (generation_record_id uuid, proposal_id uuid, outcome text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_revision integer;
  context_version_now integer;
  record_id uuid;
  new_proposal_id uuid;
begin
  if p_actor is null or p_prd_id is null or p_base_revision is null or p_base_revision < 1
     or p_model is null then
    raise exception 'Missing actor, PRD, base revision or model' using errcode = 'NT422';
  end if;
  if p_trigger is null or p_trigger not in ('initial_generation', 'chat_request') then
    raise exception 'Unknown trigger' using errcode = 'NT422';
  end if;
  if p_status is null or p_status not in ('success', 'failed') then
    raise exception 'Unknown status' using errcode = 'NT422';
  end if;
  if p_status = 'failed' and (p_error_code is null or p_proposal_kind is not null) then
    raise exception 'A failed record needs an error code and no proposal' using errcode = 'NT422';
  end if;
  if p_status = 'success' and p_error_code is not null then
    raise exception 'A successful record has no error code' using errcode = 'NT422';
  end if;
  if p_proposal_kind is null and (p_proposal_content is not null or p_context_patch is not null) then
    raise exception 'Proposal content needs a proposal kind' using errcode = 'NT422';
  end if;
  if p_proposal_kind is not null then
    if p_proposal_content is null then
      raise exception 'A proposal needs content' using errcode = 'NT422';
    end if;
    if p_ttl_seconds is null or p_ttl_seconds not between 60 and 86400 then
      raise exception 'Proposal lifetime must be 60 to 86400 seconds' using errcode = 'NT422';
    end if;
  end if;
  -- Initial generation always proposes a document; nothing else may.
  if p_status = 'success' and (p_trigger = 'initial_generation') <> (p_proposal_kind is not distinct from 'generate') then
    raise exception 'Initial generation and generate proposals go together' using errcode = 'NT422';
  end if;
  if p_context_patch is not null and not ai_context_shape_ok(p_context_patch, true) then
    raise exception 'Invalid context patch' using errcode = 'NT422';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);

  select revision into current_revision from prd where id = p_prd_id;
  if not found or not can_view_prd(p_prd_id) then
    raise exception 'PRD not found' using errcode = 'NT404';
  end if;
  if p_proposal_kind is not null and not can_edit_prd(p_prd_id) then
    raise exception 'Not allowed to edit this PRD' using errcode = 'NT403';
  end if;

  -- One context row per PRD. Two first requests racing both land on the same
  -- row; this only creates an empty row and never changes existing context.
  insert into prd_context (prd_id) values (p_prd_id) on conflict (prd_id) do nothing;
  select version into context_version_now from prd_context where prd_id = p_prd_id;

  insert into generation_record (prd_id, "trigger", model, prompt_version, context_version, status,
                                 error_message, user_request, requester_id, base_revision,
                                 prompt_tokens, output_tokens)
  values (p_prd_id, p_trigger, p_model, p_prompt_version, context_version_now, p_status,
          p_error_code, p_user_request, p_actor, p_base_revision, p_prompt_tokens, p_output_tokens)
  returning id into record_id;

  if p_proposal_kind is null then
    return query select record_id, null::uuid, 'recorded'::text;
    return;
  end if;
  if current_revision <> p_base_revision then
    return query select record_id, null::uuid, 'stale'::text;
    return;
  end if;
  if p_context_patch ? 'source_ids' and exists (
       select 1 from jsonb_array_elements_text(p_context_patch -> 'source_ids') as ids(id)
       where not exists (select 1 from source s where s.id = ids.id::uuid and s.prd_id = p_prd_id)) then
    raise exception 'Context patch names a source outside this PRD' using errcode = 'NT422';
  end if;

  insert into ai_proposal (prd_id, requester_id, kind, base_revision, content, context_patch,
                           generation_record_id, expires_at)
  values (p_prd_id, p_actor, p_proposal_kind, p_base_revision, p_proposal_content, p_context_patch,
          record_id, now() + make_interval(secs => p_ttl_seconds))
  returning id into new_proposal_id;

  return query select record_id, new_proposal_id, 'staged'::text;
end;
$$;

-- The requester discards a proposal. Repeating it is harmless; a proposal
-- that was already accepted or expired is reported, not changed.
create or replace function ai_reject_proposal(p_actor uuid, p_proposal_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal ai_proposal;
begin
  select * into proposal from ai_proposal where id = p_proposal_id for update;
  if not found or proposal.requester_id is distinct from p_actor then
    raise exception 'Proposal not found' using errcode = 'NTPRP';
  end if;
  if proposal.status <> 'pending' then
    return proposal.status;
  end if;
  if proposal.expires_at <= now() then
    update ai_proposal set status = 'expired', decided_at = now() where id = p_proposal_id;
    return 'expired';
  end if;
  update ai_proposal set status = 'rejected', decided_at = now() where id = p_proposal_id;
  return 'rejected';
end;
$$;

-- For A05: called only from inside the save transaction (save_prd, #55), after
-- it has locked the PRD row and checked edit access. Lock order: prd row, then
-- the proposal row. Marks the proposal accepted and returns it; any failure
-- raises, so the whole save rolls back and the proposal stays pending.
-- Not callable by any API role.
create or replace function ai_take_proposal(
  p_actor uuid,
  p_prd_id uuid,
  p_generation_record_id uuid,
  p_base_revision integer
)
returns ai_proposal
language plpgsql
security definer
set search_path = public
as $$
declare
  proposal ai_proposal;
begin
  select * into proposal from ai_proposal
  where generation_record_id = p_generation_record_id
  for update;
  if not found or proposal.requester_id is distinct from p_actor or proposal.prd_id <> p_prd_id then
    raise exception 'Proposal not found' using errcode = 'NTPRP';
  end if;
  if proposal.status <> 'pending' then
    raise exception 'Proposal was already %', proposal.status using errcode = 'NTPRP';
  end if;
  if proposal.expires_at <= now() then
    raise exception 'Proposal expired' using errcode = 'NTPRP';
  end if;
  if proposal.base_revision <> p_base_revision then
    raise exception 'Proposal was made for another revision' using errcode = 'NT409';
  end if;
  update ai_proposal set status = 'accepted', decided_at = now()
  where id = proposal.id
  returning * into proposal;
  return proposal;
end;
$$;

-- For A05: merges an accepted proposal's staged context patch into the PRD's
-- durable context, in the same transaction as the save. Provided lists
-- replace the stored ones, running_summary replaces the summary, change_log
-- entries are appended (newest 20 kept), and version advances.
-- Not callable by any API role.
create or replace function ai_apply_context_patch(p_prd_id uuid, p_patch jsonb)
returns prd_context
language plpgsql
security definer
set search_path = public
as $$
declare
  ctx prd_context;
  merged jsonb;
  log jsonb;
begin
  if p_patch is null then
    select * into ctx from prd_context where prd_id = p_prd_id;
    return ctx;
  end if;
  if not ai_context_shape_ok(p_patch, true) then
    raise exception 'Invalid context patch' using errcode = 'NT422';
  end if;
  if p_patch ? 'source_ids' and exists (
       select 1 from jsonb_array_elements_text(p_patch -> 'source_ids') as ids(id)
       where not exists (select 1 from source s where s.id = ids.id::uuid and s.prd_id = p_prd_id)) then
    raise exception 'Context patch names a source outside this PRD' using errcode = 'NT422';
  end if;

  insert into prd_context (prd_id) values (p_prd_id) on conflict (prd_id) do nothing;
  select * into ctx from prd_context where prd_id = p_prd_id for update;

  merged := ctx.context_json || (p_patch - 'running_summary' - 'change_log');
  if p_patch ? 'change_log' then
    select coalesce(jsonb_agg(entry order by position), '[]'::jsonb) into log
    from (
      select entry, position
      from jsonb_array_elements(coalesce(ctx.context_json -> 'change_log', '[]'::jsonb) || (p_patch -> 'change_log'))
           with ordinality as entries(entry, position)
      order by position desc
      limit 20
    ) newest;
    merged := merged || jsonb_build_object('change_log', log);
  end if;

  update prd_context
  set context_json = merged,
      running_summary = coalesce(p_patch ->> 'running_summary', running_summary),
      version = version + 1,
      updated_by = 'ai'
  where prd_id = p_prd_id
  returning * into ctx;
  return ctx;
end;
$$;

revoke execute on function
  ai_record_generation(uuid, uuid, integer, text, text, text, text, text, text, integer, integer,
                       text, jsonb, jsonb, integer),
  ai_reject_proposal(uuid, uuid),
  ai_take_proposal(uuid, uuid, uuid, integer),
  ai_apply_context_patch(uuid, jsonb)
from public, anon, authenticated;
-- Default privileges (#58) give service_role EXECUTE on new functions. These
-- two run only inside save_prd (a definer function), so no API role, the
-- service role included, may call them directly.
revoke execute on function
  ai_take_proposal(uuid, uuid, uuid, integer),
  ai_apply_context_patch(uuid, jsonb)
from service_role;
grant execute on function
  ai_record_generation(uuid, uuid, integer, text, text, text, text, text, text, integer, integer,
                       text, jsonb, jsonb, integer),
  ai_reject_proposal(uuid, uuid)
to service_role;
