-- A05 (Marco): accepting an AI proposal through the normal save.
--
-- Replaces save_prd (S03, 20261030140000_prd_save_core.sql) with the same
-- function plus acceptance. A save that names a generation_record_id must be
-- the requester's pending, unexpired proposal for this PRD and base revision
-- (ai_take_proposal, A02). It is used once, inside the save transaction, after
-- the PRD row lock (lock order: PRD, then proposal, then context). A failed
-- save leaves the proposal pending and the document untouched.
--
-- The backend (prd_save.py with ai/acceptance.py) validates the accepted
-- content, which the person may have edited, adds ai_generated marks only to
-- sections accepted exactly as proposed, and asks for the staged context
-- patch only when nothing was edited, so durable context never describes
-- model text that was discarded.
--
-- Same trust boundary as save_prd: service role only (the #55 exception,
-- still under review). Not wired into PUT /api/prds/{id}.

drop function save_prd(uuid, uuid, integer, boolean, text, boolean, text, boolean,
                       jsonb, text, uuid[], text, uuid);

create or replace function save_prd(
  p_actor uuid,
  p_prd_id uuid,
  p_base_revision integer,
  p_set_title boolean,
  p_title text,
  p_set_description boolean,
  p_description text,
  p_set_content boolean,
  p_content_json jsonb,
  p_content_text text,
  p_ai_generation_ids uuid[],
  p_origin text,
  p_generation_record_id uuid,
  p_apply_context_patch boolean
)
returns prd
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row prd;
  saved_row prd;
  new_title text;
  new_description text;
  new_content jsonb;
  new_content_text text;
  new_schema_version integer;
  new_version_id uuid;
  next_version_no integer;
  sections_changed text[];
  summary_parts text[] := '{}';
  accepted ai_proposal;
begin
  if p_actor is null or p_prd_id is null or p_base_revision is null then
    raise exception 'Missing actor, PRD or base revision' using errcode = 'NT422';
  end if;
  if p_origin is null or p_origin not in ('pm_edit', 'ai_generated') then
    raise exception 'Unknown save origin' using errcode = 'NT422';
  end if;
  if (p_origin = 'ai_generated') <> (p_generation_record_id is not null) then
    raise exception 'Only an AI save names a generation record, and it must' using errcode = 'NT422';
  end if;
  if p_apply_context_patch and p_generation_record_id is null then
    raise exception 'Only an accepted proposal has a context patch' using errcode = 'NT422';
  end if;
  if p_set_content and (p_content_json is null or p_content_text is null) then
    raise exception 'Content saves need the document and its text' using errcode = 'NT422';
  end if;

  perform set_config('request.jwt.claim.sub', p_actor::text, true);
  perform set_config('request.jwt.claims',
                     json_build_object('sub', p_actor, 'role', 'authenticated')::text, true);

  -- Lock first, then decide: concurrent saves of one PRD queue here.
  select * into current_row from prd where id = p_prd_id for update;
  if not found or not can_view_prd(p_prd_id) then
    raise exception 'PRD not found' using errcode = 'NT404';
  end if;
  if not can_edit_prd(p_prd_id) then
    raise exception 'Not allowed to edit this PRD' using errcode = 'NT403';
  end if;
  -- A retry after a lost response: this requester's proposal was already
  -- accepted and its save is still the current version. Return that state
  -- instead of a confusing conflict; anything else falls through to 409.
  if p_generation_record_id is not null and current_row.revision <> p_base_revision
     and exists (select 1 from ai_proposal
                 where generation_record_id = p_generation_record_id and requester_id = p_actor
                   and prd_id = p_prd_id and status = 'accepted')
     and exists (select 1 from prd_version
                 where id = current_row.current_version_id
                   and generation_record_id = p_generation_record_id) then
    return current_row;
  end if;
  if current_row.revision <> p_base_revision then
    raise exception 'Stale revision' using errcode = 'NT409';
  end if;

  -- D9 (E09): editing a PRD in review resets approvals; editing an approved
  -- PRD needs an owner and a confirmed reviewer list. Until that is built on
  -- the review tables, refuse instead of saving without it.
  if current_row.status <> 'draft' then
    raise exception 'Saving a PRD in review or approved needs E09' using errcode = 'NTREV';
  end if;

  -- Every ai_generated mark (and the accepted generation) must point to a
  -- successful generation record for this PRD.
  if exists (
    select 1
    from unnest(coalesce(p_ai_generation_ids, '{}'::uuid[]) || p_generation_record_id) as ids(id)
    where ids.id is not null
      and not exists (
        select 1 from generation_record r
        where r.id = ids.id and r.prd_id = p_prd_id and r.status = 'success'
      )
  ) then
    raise exception 'Unknown or unsuccessful generation record' using errcode = 'NT422';
  end if;

  -- A05: use the proposal once, bound to this requester, PRD and base
  -- revision (NTPRP or NT409 otherwise). Any later failure rolls it back to
  -- pending. The backend asks for the staged context patch only when the
  -- person accepted the proposal unedited.
  if p_generation_record_id is not null then
    accepted := ai_take_proposal(p_actor, p_prd_id, p_generation_record_id, p_base_revision);
    if p_apply_context_patch then
      perform ai_apply_context_patch(p_prd_id, accepted.context_patch);
    end if;
  end if;

  new_title := case when p_set_title then p_title else current_row.title end;
  new_description := case when p_set_description then p_description else current_row.description end;
  new_content := case when p_set_content then p_content_json else current_row.content_json end;
  new_content_text := case when p_set_content then p_content_text else current_row.content_text end;
  new_schema_version := case when p_set_content then 2 else current_row.doc_schema_version end;

  -- Nothing changed: no new revision or version, so retries are harmless.
  if new_title is not distinct from current_row.title
     and new_description is not distinct from current_row.description
     and new_content is not distinct from current_row.content_json then
    return current_row;
  end if;

  select coalesce(max(version_no), 0) + 1 into next_version_no from prd_version where prd_id = p_prd_id;

  -- Content saved before this history existed (the legacy PUT writes no
  -- versions) is kept as a baseline snapshot, so the first save here never
  -- loses what was there.
  if current_row.content_json is not null or current_row.description is not null then
    if not exists (select 1 from prd_version
                   where prd_id = p_prd_id and saved_revision = current_row.revision) then
      insert into prd_version (prd_id, version_no, saved_revision, title, description, content_json,
                               doc_schema_version, created_by, origin, change_summary)
      values (p_prd_id, next_version_no, current_row.revision, current_row.title, current_row.description,
              current_row.content_json, current_row.doc_schema_version, null, 'checkpoint',
              'Saved before version history started');
      next_version_no := next_version_no + 1;
    end if;
  end if;

  sections_changed := case when p_set_content
                           then prd_changed_sections(current_row.content_json, new_content)
                           else '{}' end;
  if new_title is distinct from current_row.title then
    summary_parts := summary_parts || 'title'::text;
  end if;
  if new_description is distinct from current_row.description then
    summary_parts := summary_parts || 'description'::text;
  end if;
  if cardinality(sections_changed) > 0 then
    summary_parts := summary_parts || (cardinality(sections_changed)
                     || case when cardinality(sections_changed) = 1 then ' section' else ' sections' end);
  end if;

  insert into prd_version (prd_id, version_no, saved_revision, title, description, content_json,
                           doc_schema_version, created_by, origin, generation_record_id,
                           changed_sections, change_summary)
  values (p_prd_id, next_version_no, current_row.revision + 1, new_title, new_description, new_content,
          new_schema_version, p_actor, p_origin, p_generation_record_id, sections_changed,
          case when p_origin = 'ai_generated' then 'Accepted AI proposal: ' else 'Edited ' end
          || coalesce(nullif(array_to_string(summary_parts, ', '), ''), 'content'))
  returning id into new_version_id;

  update prd
  set title = new_title,
      description = new_description,
      content_json = new_content,
      content_text = new_content_text,
      doc_schema_version = new_schema_version,
      revision = current_row.revision + 1,
      current_version_id = new_version_id
  where id = p_prd_id
  returning * into saved_row;

  return saved_row;
end;
$$;

revoke execute on function save_prd(uuid, uuid, integer, boolean, text, boolean, text, boolean,
                                    jsonb, text, uuid[], text, uuid, boolean)
  from public, anon, authenticated;
grant execute on function save_prd(uuid, uuid, integer, boolean, text, boolean, text, boolean,
                                   jsonb, text, uuid[], text, uuid, boolean)
  to service_role;
