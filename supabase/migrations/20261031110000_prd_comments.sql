-- Flat comments on a PRD's saved version (Backend Tasks E06).
--
-- Anyone who can view a PRD can comment on it (owner, editor, viewer, org
-- admin). A comment belongs to the version that was current when it was
-- posted, so older comments stay readable with their version label. There
-- are no replies, edits, deletes, mentions or text anchors; a comment can
-- name one section type. Comments never create a version or reset a review.
--
-- add_prd_comment takes a share lock on the PRD row, so a save (which locks
-- it for update) can't slip in between the version check and the insert.
-- It records a comment_added event, which notifies owners and editors.
--
-- The author's name and department are copied when posting, so a later
-- name or department change doesn't rewrite who said what. Bodies are plain
-- text; the frontend escapes them.
--
-- Errors raise P0001 with a fixed message the API maps: prd_not_found,
-- no_saved_version, stale_version, invalid_section, invalid_body.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Apply after
-- 20261031100000_prd_events_notifications. Adds a table and a function.

create table prd_comment (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null references prd(id) on delete cascade,
  version_id uuid not null references prd_version(id) on delete cascade,
  -- The nine section types of docs/prd-document-format.md, or null for the
  -- whole PRD.
  section_type text check (section_type in (
    'problem', 'goals', 'non_goals', 'target_users', 'user_stories',
    'requirements', 'success_metrics', 'risks', 'open_questions'
  )),
  author_id uuid references profile(id) on delete set null,
  author_name text,
  department_id uuid references department(id) on delete set null,
  department_name text,
  body text not null check (btrim(body) <> '' and char_length(body) <= 5000),
  created_at timestamptz not null default now()
);

create index prd_comment_prd_created on prd_comment (prd_id, created_at, id);

alter table prd_comment enable row level security;

create policy "view comments of visible prds" on prd_comment
  for select using (can_view_prd(prd_id));

revoke all on prd_comment from anon, authenticated;
grant select on prd_comment to authenticated;
grant select, insert, update, delete on prd_comment to service_role;

alter table prd_event
  add constraint prd_event_comment_id_fkey
  foreign key (comment_id) references prd_comment(id) on delete set null;

-- Posts a comment on the PRD's current version. Returns the comment's id.
create or replace function add_prd_comment(target_prd uuid, target_version uuid, target_section text, comment_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row prd%rowtype;
  dept uuid;
  new_comment uuid;
begin
  select * into current_row from prd where id = target_prd for share;
  if not found or not can_view_prd(target_prd) then
    raise exception 'prd_not_found';
  end if;
  if current_row.current_version_id is null then
    raise exception 'no_saved_version';
  end if;
  if target_version is distinct from current_row.current_version_id then
    raise exception 'stale_version';
  end if;
  if target_section is not null and target_section not in (
    'problem', 'goals', 'non_goals', 'target_users', 'user_stories',
    'requirements', 'success_metrics', 'risks', 'open_questions'
  ) then
    raise exception 'invalid_section';
  end if;
  if comment_body is null or btrim(comment_body) = '' or char_length(comment_body) > 5000 then
    raise exception 'invalid_body';
  end if;

  select department_id into dept from organization_member
  where organization_id = current_row.organization_id and user_id = auth.uid() and active;

  insert into prd_comment (prd_id, version_id, section_type, author_id, author_name,
                           department_id, department_name, body)
    values (target_prd, target_version, target_section, auth.uid(),
            (select full_name from profile where id = auth.uid()),
            dept, (select name from department where id = dept), comment_body)
    returning id into new_comment;

  perform record_prd_event(target_prd, 'comment_added', auth.uid(),
                           jsonb_build_object('section_type', target_section),
                           target_version, null, new_comment);
  return new_comment;
end;
$$;

grant execute on function add_prd_comment(uuid, uuid, text, text) to authenticated, service_role;
