-- S03 save core (Marco): one transaction for every title, description and
-- content save, with a revision check and a permanent version snapshot.
--
-- LOCAL ONLY for now. Nothing calls save_prd yet: today's PUT /api/prds/{id}
-- keeps its direct update, and this must not be applied to the hosted
-- database until the S03 cutover (Tiptap editor, DB07 conversion and the
-- route switch ship together). See the PR description for the contract with
-- the permission (D1/D3) and review (E07/E08) work.
--
-- Locking convention for every transaction that writes a PRD or its review
-- state: lock the prd row first (select ... for update), then that PRD's
-- review rows, then insert history/events. Never lock a second PRD in the
-- same transaction. Plain reads (profile, generation_record) take no locks.

-- -------------------------------------------------------------------------
-- Columns
-- -------------------------------------------------------------------------

-- Plain-text summary shown on cards; today it lives in content_json.description.
alter table prd
  add column description text check (char_length(description) <= 2000);

-- A version is the full saved state at one revision, so an approval can be
-- tied to exactly what the reviewer saw (title, description and content all
-- count as edits under D9). Metadata for GET /versions (v1.2 S03/S04):
--   version_no       1, 2, 3 ... per PRD, in save order;
--   saved_revision   the PRD revision this snapshot is;
--   created_by       the human who saved, also for accepted AI proposals;
--   changed_sections section types whose node changed, in document order;
--   change_summary   a short server-written line naming what changed:
--                    "Edited title, problem, non goals" (wording provisional).
alter table prd_version
  add column version_no integer check (version_no >= 1),
  add column saved_revision integer check (saved_revision >= 1),
  add column title text,
  add column description text,
  add column generation_record_id uuid references generation_record(id) on delete set null,
  add column changed_sections text[] not null default '{}',
  add column change_summary text check (char_length(change_summary) <= 300);

-- Versions outlive the person who saved them. Without this, anyone who
-- ever saved a version could not be deleted (the baseline FK has no ON
-- DELETE). Their own PRDs, and those PRDs' versions, still cascade away.
alter table prd_version
  drop constraint prd_version_created_by_fkey,
  add constraint prd_version_created_by_fkey
    foreign key (created_by) references profile(id) on delete set null;

-- A PRD that has never had content saved still gets versions when its title
-- or description changes.
alter table prd_version alter column content_json drop not null;

create unique index prd_version_prd_revision_key
  on prd_version (prd_id, saved_revision) where saved_revision is not null;
create unique index prd_version_prd_version_no_key
  on prd_version (prd_id, version_no) where version_no is not null;

-- Section types whose node differs between two documents, in the new
-- document's order, then removed ones. jsonb equality ignores key order, so
-- this compares canonical JSON. A legacy (v1) document counts as having no
-- sections, so every section of its first v2 save is "changed".
create or replace function prd_changed_sections(old_doc jsonb, new_doc jsonb)
returns text[]
language sql
immutable
set search_path = public
as $$
  with old_sections as (
    select s -> 'attrs' ->> 'type' as section_type, s as node, n
    from jsonb_array_elements(case when old_doc ->> 'type' = 'doc'
                                   then coalesce(old_doc -> 'content', '[]') else '[]' end)
         with ordinality as e(s, n)
  ), new_sections as (
    select s -> 'attrs' ->> 'type' as section_type, s as node, n
    from jsonb_array_elements(case when new_doc ->> 'type' = 'doc'
                                   then coalesce(new_doc -> 'content', '[]') else '[]' end)
         with ordinality as e(s, n)
  )
  select coalesce(array_agg(section_type order by position), '{}')
  from (
    select coalesce(new_sections.section_type, old_sections.section_type) as section_type,
           coalesce(new_sections.n, 1000 + old_sections.n) as position
    from old_sections full join new_sections using (section_type)
    where old_sections.node is distinct from new_sections.node
  ) changed;
$$;

-- -------------------------------------------------------------------------
-- Server-only history and AI records
-- -------------------------------------------------------------------------

-- Versions are permanent and written only by save_prd. Nothing in the app
-- writes prd_version today, so this changes no current behavior.
drop policy if exists "write prd versions" on prd_version;
drop policy if exists "delete prd versions" on prd_version;
revoke insert, update, delete on prd_version from authenticated;

-- generation_record proves AI text came from a real generation, so browsers
-- must not be able to insert their own (A02). Nothing in the app writes it
-- today; the AI routes will write it on the server. A02 (#67) drops the same
-- policy, so either migration can run first.
drop policy if exists "write generation records" on generation_record;
revoke insert, update, delete on generation_record from authenticated;

-- -------------------------------------------------------------------------
-- save_prd
-- -------------------------------------------------------------------------

-- Callable only with the service role, from the backend's prd_save.py, which
-- runs the document validator, derives content_text and collects the
-- ai_generated record ids first. A browser calling this directly would skip
-- that validation, so it gets no EXECUTE grant.
--
-- p_actor is the user the backend already authenticated (prd_save.py takes
-- the verified user object, never a raw id). The function sets it as the
-- request's JWT subject for this transaction, so the shared permission
-- helpers (can_view_prd and can_edit_prd, which read prd_role,
-- is_org_member and is_org_admin from auth.uid() since E03) answer for that
-- user exactly as they do under RLS. Change those helpers, not this
-- function, when the permission model changes.
--
-- Errors use custom SQLSTATEs that prd_save.py maps to API errors:
--   NT404 not found or not visible, NT403 visible but not editable,
--   NT409 stale revision, NT422 invalid AI provenance or arguments,
--   NTREV the PRD is approved (final or assigned), which needs E09.
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
  p_generation_record_id uuid
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
begin
  if p_actor is null or p_prd_id is null or p_base_revision is null then
    raise exception 'Missing actor, PRD or base revision' using errcode = 'NT422';
  end if;
  if p_origin is null or p_origin not in ('pm_edit', 'ai_generated') then
    raise exception 'Unknown save origin' using errcode = 'NT422';
  end if;
  if p_origin = 'ai_generated' and p_generation_record_id is null then
    raise exception 'An AI save needs its generation record' using errcode = 'NT422';
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
  if current_row.revision <> p_base_revision then
    raise exception 'Stale revision' using errcode = 'NT409';
  end if;

  -- D9 (E09): editing an approved PRD needs an owner and a confirmed
  -- reviewer list, and must not leave the old approval standing. Until E09
  -- exists, approved PRDs (final, assigned) are refused. PRDs in review can
  -- be saved: no review rounds or approvals exist before E07/E08, so there is
  -- nothing to reset yet; E09 adds the reset when they do. Status itself
  -- never changes here (D6).
  if current_row.status in ('final', 'assigned') then
    raise exception 'Editing an approved PRD needs the reapproval flow (E09)' using errcode = 'NTREV';
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

  return saved_row;
end;
$$;

revoke execute on function save_prd(uuid, uuid, integer, boolean, text, boolean, text, boolean,
                                    jsonb, text, uuid[], text, uuid)
  from public, anon, authenticated;
grant execute on function save_prd(uuid, uuid, integer, boolean, text, boolean, text, boolean,
                                   jsonb, text, uuid[], text, uuid)
  to service_role;
