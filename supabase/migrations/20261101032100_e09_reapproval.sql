-- E09 reapproval in the save (Marco), on Vineela's review rounds (#93).
--
-- Replaces save_prd (20261101032000_save_events.sql) with the same function
-- plus Decision 9, using continue_review_round and open_review_round from
-- 20261031120000_review_rounds.sql (agreed with Vineela on 2026-10-31):
--
-- - Edit while a review round is open (in review or changes requested):
--   continue_review_round supersedes the round and continues it on the new
--   version with the same reviewers, every decision reset (the PRD stays in
--   review, nobody resubmits). If no reviewer can still take part, or the
--   edit empties the document, the PRD goes back to draft. The save records
--   one superseded event (payload.reviewer_ids = everyone who had decided).
-- - Edit to an approved PRD (final, assigned): owners only, with the
--   reviewer list confirmed in the edit modal (p_confirmed_reviewers). The
--   approved round is superseded and open_review_round starts the new one,
--   which records the single submitted event (resubmitted: true). Without a
--   confirmed list the save is refused (NTREV); non-owners get NTOWN, and a
--   list sent for a PRD that isn't approved gets NTCRL.
-- - Any other save: version_saved, or ai_applied for an accepted proposal.
--
-- One event per save: review events take precedence over the AI event; the
-- version keeps the AI provenance. Errors from Vineela's functions (P0001
-- messages like no_reviewers or owner_cannot_review) pass through to the API.
--
-- Same trust boundary as before: service role only, for the verified user.
-- Apply after 20261031120000_review_rounds and 20261101032000_save_events.
-- Replaces one function (new parameter); no data changes.

drop function save_prd(uuid, uuid, integer, boolean, text, boolean, text, boolean,
                       jsonb, text, uuid[], text, uuid, boolean);

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
  p_apply_context_patch boolean,
  p_confirmed_reviewers uuid[] default null
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
  version_summary text;
  accepted ai_proposal;
  changed_fields text[];
  approved boolean;
  continued record;
  event_payload jsonb;
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

  -- E09 (Decision 9): an approved PRD (final or assigned) is edited only by
  -- an owner, with the reviewer list confirmed in the edit modal; the save
  -- then starts a new round with them (below). A confirmed list on any
  -- other PRD is a mistake. Checked after the no-op return, so a save that
  -- changes nothing never needs a list.
  approved := current_row.status in ('final', 'assigned');
  if approved and not is_prd_owner(p_prd_id) then
    raise exception 'Only owners can edit an approved PRD' using errcode = 'NTOWN';
  end if;
  if approved and p_confirmed_reviewers is null then
    raise exception 'Confirm the reviewers for the new approval' using errcode = 'NTREV';
  end if;
  if not approved and p_confirmed_reviewers is not null then
    raise exception 'Only an approved PRD takes a confirmed reviewer list' using errcode = 'NTCRL';
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
  -- Name the changed sections (non_goals -> "non goals"), so the change
  -- log tells the AI which parts of its context may be stale.
  if cardinality(sections_changed) > 0 then
    summary_parts := summary_parts || array(select replace(t, '_', ' ') from unnest(sections_changed) as t);
  end if;

  version_summary := left(case when p_origin = 'ai_generated' then 'Accepted AI proposal: ' else 'Edited ' end
                          || coalesce(nullif(array_to_string(summary_parts, ', '), ''), 'content'), 300);

  insert into prd_version (prd_id, version_no, saved_revision, title, description, content_json,
                           doc_schema_version, created_by, origin, generation_record_id,
                           changed_sections, change_summary)
  values (p_prd_id, next_version_no, current_row.revision + 1, new_title, new_description, new_content,
          new_schema_version, p_actor, p_origin, p_generation_record_id, sections_changed,
          version_summary)
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

  -- Keep the PRD's AI memory in step with the document, whoever edits it:
  -- note the change in prd_context.change_log (newest 20 kept) and advance
  -- the context version, so a preview built on the old state isn't current.
  -- Lock order: the PRD row (above), then its context row.
  insert into prd_context (prd_id) values (p_prd_id) on conflict (prd_id) do nothing;
  update prd_context
  set context_json = jsonb_set(context_json, '{change_log}', (
        select coalesce(jsonb_agg(entry order by position), '[]'::jsonb)
        from (
          select entry, position
          from jsonb_array_elements(coalesce(context_json -> 'change_log', '[]'::jsonb)
                                    || jsonb_build_array(left(format('Version %s: %s', next_version_no,
                                                                     version_summary), 300)))
               with ordinality as entries(entry, position)
          order by position desc
          limit 20
        ) newest)),
      version = version + 1,
      updated_by = case when p_origin = 'ai_generated' then 'ai' else 'pm' end
  where prd_id = p_prd_id;

  -- One event per save (E13: one event per action), after the new version
  -- is written and under the PRD lock. Review state comes first:
  --   approved PRD + confirmed reviewers -> the approved round is superseded
  --     and open_review_round (#93) starts a new one; it records the single
  --     submitted event (resubmitted: true) to the confirmed reviewers;
  --   an open round (in review or changes requested) -> continue_review_round
  --     (#93) supersedes it and continues on this version with the same
  --     reviewers (or puts the PRD back to draft); this save records one
  --     superseded event that notifies everyone whose decision was reset;
  --   otherwise -> version_saved, or ai_applied for an accepted proposal.
  -- The review rules live in Vineela's functions; this only picks the event.
  -- AI provenance stays on the version (origin, generation_record_id), which
  -- every one of these events points at.
  changed_fields := case when new_title is distinct from current_row.title then array['title'] else '{}' end
                    || case when new_description is distinct from current_row.description
                            then array['description'] else '{}' end
                    || sections_changed;
  event_payload := jsonb_strip_nulls(jsonb_build_object(
    'version_no', next_version_no, 'changed', to_jsonb(changed_fields),
    'generation_record_id', p_generation_record_id));

  if approved then
    update review_round set state = 'superseded' where prd_id = p_prd_id and state <> 'superseded';
    perform open_review_round(p_prd_id, p_actor, p_confirmed_reviewers, true);
  else
    select * into continued from continue_review_round(p_prd_id, p_actor);
    if continued.old_round_id is not null then
      perform record_prd_event(
        p_prd_id, 'superseded', p_actor,
        event_payload || jsonb_build_object('reviewer_ids', to_jsonb(continued.reset_reviewer_ids),
                                            'continued', continued.new_round_id is not null),
        new_version_id, continued.old_round_id);
    else
      perform record_prd_event(
        p_prd_id, case when p_origin = 'ai_generated' then 'ai_applied' else 'version_saved' end,
        p_actor, event_payload, new_version_id);
    end if;
  end if;

  return saved_row;
end;
$$;

revoke execute on function save_prd(uuid, uuid, integer, boolean, text, boolean, text, boolean,
                                    jsonb, text, uuid[], text, uuid, boolean, uuid[])
  from public, anon, authenticated;
grant execute on function save_prd(uuid, uuid, integer, boolean, text, boolean, text, boolean,
                                   jsonb, text, uuid[], text, uuid, boolean, uuid[])
  to service_role;
