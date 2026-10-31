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
-- Comment notifications are batched so a burst of comments doesn't flood
-- anyone's inbox: when a recipient still has an unread comment notification
-- from the same person on the same PRD, started less than 10 minutes ago,
-- its count goes up ("Ed left 3 comments") instead of a new one being
-- added. It keeps pointing at the first comment of the batch, and moves
-- to the top of the inbox, which now sorts by updated_at. A lock per PRD
-- and commenter makes two of their comments arriving at once take turns,
-- so the second joins the first one's batch.
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
-- 20261031100000_prd_events_notifications. Adds a table, a function and
-- two notification columns, rebuilds the inbox index on updated_at, and
-- replaces record_prd_event.

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

-- How many events a notification stands for, and when the latest arrived.
alter table notification
  add column event_count integer not null default 1 check (event_count >= 1),
  add column updated_at timestamptz not null default now();

-- The inbox sorts by the latest activity, so a growing batch comes back up.
drop index notification_inbox;
create index notification_inbox on notification (recipient_id, updated_at desc, id desc);

-- As in 20261031100000, plus comment batching.
create or replace function record_prd_event(
  p_prd_id uuid,
  p_event_type text,
  p_actor uuid,
  p_payload jsonb default '{}',
  p_version_id uuid default null,
  p_round_id uuid default null,
  p_comment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_event uuid;
  owners uuid[] := array(select user_id from prd_member where prd_id = p_prd_id and role = 'owner');
  recipients uuid[];
begin
  if p_event_type in ('submitted', 'round_approved', 'superseded') then
    raise exception 'event type % needs reviewers, which arrive with E07', p_event_type;
  end if;

  insert into prd_event (prd_id, event_type, actor_id, actor_name, payload, version_id, round_id, comment_id)
    values (p_prd_id, p_event_type, p_actor, (select full_name from profile where id = p_actor),
            coalesce(p_payload, '{}'), p_version_id, p_round_id, p_comment_id)
    returning id into new_event;

  recipients := case p_event_type
    when 'member_added' then array[(p_payload ->> 'user_id')::uuid]
    when 'comment_added' then
      array(select user_id from prd_member where prd_id = p_prd_id and role in ('owner', 'editor'))
    when 'approved' then owners
    when 'changes_requested' then owners
    when 'work_status_changed' then case when p_payload ->> 'status' = 'done' then owners end
    else '{}'
  end;
  recipients := array(select distinct r from unnest(recipients) r
                      where r is not null and r is distinct from p_actor and can_view_prd_as(r, p_prd_id));

  perform notify_recipients(new_event, p_prd_id, p_event_type, p_actor, recipients);
  return new_event;
end;
$$;

-- Adds one notification per recipient for an event, or for a comment, bumps
-- the recipient's open batch from the same person (see the header).
create or replace function notify_recipients(p_event uuid, p_prd_id uuid, p_event_type text, p_actor uuid,
                                             p_recipients uuid[])
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bumped uuid[] := '{}';
begin
  if p_event_type = 'comment_added' and p_actor is not null then
    -- One batch at a time per PRD and commenter, held until commit; the
    -- update below then sees a batch another transaction just started.
    perform pg_advisory_xact_lock(hashtextextended('nautilus.comment_batch:' || p_prd_id || ':' || p_actor, 0));
    with batch as (
      update notification n
      set event_count = n.event_count + 1, updated_at = now()
      from prd_event e
      where e.id = n.event_id and n.prd_id = p_prd_id and n.recipient_id = any(p_recipients)
        and n.read_at is null and n.created_at > now() - interval '10 minutes'
        and e.event_type = 'comment_added' and e.actor_id = p_actor
      returning n.recipient_id
    )
    select coalesce(array_agg(recipient_id), '{}') into bumped from batch;
  end if;

  insert into notification (event_id, recipient_id, prd_id)
    select p_event, r, p_prd_id from unnest(p_recipients) r
    where not r = any(bumped)
    on conflict (event_id, recipient_id) do nothing;
end;
$$;

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

revoke execute on function notify_recipients(uuid, uuid, text, uuid, uuid[]) from public, anon, authenticated;
grant execute on function add_prd_comment(uuid, uuid, text, text) to authenticated, service_role;
