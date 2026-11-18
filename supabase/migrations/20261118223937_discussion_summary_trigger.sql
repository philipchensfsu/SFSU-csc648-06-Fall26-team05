-- AI discussion summaries (M4 feature 05, POST /api/prds/{id}/discussion-summary).
--
-- A summary is recorded like a chat answer: one generation_record, no
-- proposal, and nothing else changes (no save, no proposal, no review state).
-- This adds the 'discussion_summary' trigger value and lets
-- ai_record_generation record it. Recording still needs view access to the
-- PRD, checked as the requester, so anyone who can view the PRD may ask.
--
-- ai_record_generation is otherwise unchanged from 20261030121000_ai_records
-- apart from two lines: the trigger list, and a new check that a summary
-- never stages a proposal. CREATE OR REPLACE keeps its grants (service_role
-- only); they're restated at the end anyway.
--
-- Apply after 20261102120000_ai_revision_proposals. Replaces one check
-- constraint and one function; no data changes (existing rows use the old
-- values).

alter table generation_record drop constraint generation_record_trigger_check;
alter table generation_record add constraint generation_record_trigger_check
  check ("trigger" in ('initial_generation', 'chat_request', 'classification', 'discussion_summary'));

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
  if p_trigger is null or p_trigger not in ('initial_generation', 'chat_request', 'discussion_summary') then
    raise exception 'Unknown trigger' using errcode = 'NT422';
  end if;
  -- A discussion summary is read-only: it never stages a proposal.
  if p_trigger = 'discussion_summary' and p_proposal_kind is not null then
    raise exception 'A discussion summary has no proposal' using errcode = 'NT422';
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

revoke execute on function
  ai_record_generation(uuid, uuid, integer, text, text, text, text, text, text, integer, integer,
                       text, jsonb, jsonb, integer)
from public, anon, authenticated;
grant execute on function
  ai_record_generation(uuid, uuid, integer, text, text, text, text, text, text, integer, integer,
                       text, jsonb, jsonb, integer)
to service_role;
