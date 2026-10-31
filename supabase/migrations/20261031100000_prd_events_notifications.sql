-- PRD events and in-app notifications (Backend Tasks E10, and E13's event
-- table). The signature and recipients were agreed with Marco before this
-- was built (the event helper proposal, 2026-10-30).
--
-- Every action that changes a PRD records one prd_event row through
-- record_prd_event, inside the action's own transaction. The helper also
-- writes that event's notifications, so a failed action leaves neither and
-- a committed one leaves exactly one event.
--
-- - The helper picks the recipients from the event type; callers can't.
--   The actor, and anyone who can't view the PRD (including inactive org
--   members), never get one. Each person gets at most one per event.
-- - Clients can't call it. Only our SECURITY DEFINER functions do, and they
--   pass the actor they already verified.
-- - Producers return early when nothing changed, so a retried request never
--   reaches the helper and never makes a second event.
-- - The caller already holds the PRD lock; the helper never commits.
--
-- Notifications for PRDs the recipient can no longer view are hidden (not
-- deleted) from both the list and the unread count, and reappear if access
-- comes back. Events are readable by anyone who can view the PRD (the E13
-- timeline). Neither table has client writes; marking read goes through
-- mark_notification_read.
--
-- round_id and comment_id get their foreign keys with the review (E07) and
-- comment (E06) tables. submitted, round_approved and superseded notify
-- reviewers, so the helper refuses them until E07 adds reviewers.
--
-- This migration also records E04's member changes as events: inviting
-- someone notifies them. Setting a role someone already has now changes
-- nothing (it used to rewrite granted_by).
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Adds tables and
-- functions; changes no existing rows.

create table prd_event (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null references prd(id) on delete cascade,
  event_type text not null check (event_type in (
    'created', 'version_saved', 'ai_applied',
    'member_added', 'member_role_changed', 'member_removed',
    'comment_added', 'submitted', 'approved', 'changes_requested', 'round_approved', 'superseded',
    'work_status_changed'
  )),
  -- Null for system or AI actions, or once the account is deleted.
  actor_id uuid references profile(id) on delete set null,
  -- The actor's name when it happened, so it can be shown without reading
  -- their profile.
  actor_name text,
  -- Ids and short summaries only, never document content or emails.
  payload jsonb not null default '{}' check (jsonb_typeof(payload) = 'object'),
  version_id uuid references prd_version(id) on delete set null,
  round_id uuid,
  comment_id uuid,
  created_at timestamptz not null default now()
);

create index prd_event_prd_created on prd_event (prd_id, created_at desc, id desc);

create table notification (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references prd_event(id) on delete cascade,
  recipient_id uuid not null references profile(id) on delete cascade,
  prd_id uuid not null references prd(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique (event_id, recipient_id)
);

create index notification_inbox on notification (recipient_id, created_at desc, id desc);
create index notification_unread on notification (recipient_id) where read_at is null;

alter table prd_event enable row level security;
alter table notification enable row level security;

create policy "view events of visible prds" on prd_event
  for select using (can_view_prd(prd_id));

create policy "view own notifications of visible prds" on notification
  for select using (recipient_id = auth.uid() and can_view_prd(prd_id));

revoke all on prd_event, notification from anon, authenticated;
grant select on prd_event, notification to authenticated;
grant select, insert, update, delete on prd_event, notification to service_role;

-- can_view_prd for a given user rather than the caller: a role on the PRD,
-- or admin of its org, while an active member of that org.
create or replace function can_view_prd_as(target_user uuid, target_prd uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from prd p
    join organization_member om
      on om.organization_id = p.organization_id and om.user_id = target_user and om.active
    where p.id = target_prd
      and (om.access_role = 'admin'
           or exists (select 1 from prd_member pm where pm.prd_id = p.id and pm.user_id = target_user))
  )
$$;

-- Records one event and its notifications. Returns the event's id.
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

  insert into notification (event_id, recipient_id, prd_id)
    select distinct new_event, r, p_prd_id
    from unnest(recipients) r
    where r is not null and r is distinct from p_actor and can_view_prd_as(r, p_prd_id)
    on conflict (event_id, recipient_id) do nothing;

  return new_event;
end;
$$;

-- Marks one of the caller's notifications read. Repeating it keeps the
-- first read time. Returns false when it isn't theirs or is hidden.
create or replace function mark_notification_read(target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update notification set read_at = coalesce(read_at, now())
  where id = target and recipient_id = auth.uid() and can_view_prd(prd_id);
  return found;
end;
$$;

revoke execute on function can_view_prd_as(uuid, uuid),
  record_prd_event(uuid, text, uuid, jsonb, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function mark_notification_read(uuid) to authenticated, service_role;

-- E04 producers: the same checks as before, plus one event per real change.
create or replace function set_prd_member(target_prd uuid, target_user uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid := lock_managed_prd(target_prd);
  old_role text;
begin
  if new_role is null or new_role not in ('owner', 'editor', 'viewer') then
    raise exception 'invalid_role';
  end if;
  if not exists (select 1 from organization_member
                 where organization_id = org and user_id = target_user and active) then
    raise exception 'not_in_organization';
  end if;
  select role into old_role from prd_member where prd_id = target_prd and user_id = target_user;
  if old_role = new_role then
    return;
  end if;
  if old_role = 'owner'
     and not exists (select 1 from prd_member
                     where prd_id = target_prd and role = 'owner' and user_id <> target_user) then
    raise exception 'owner_required';
  end if;
  insert into prd_member (prd_id, user_id, role, granted_by)
    values (target_prd, target_user, new_role, auth.uid())
    on conflict (prd_id, user_id) do update set role = excluded.role, granted_by = excluded.granted_by;
  if old_role is null then
    perform record_prd_event(target_prd, 'member_added', auth.uid(),
                             jsonb_build_object('user_id', target_user, 'role', new_role));
  else
    perform record_prd_event(target_prd, 'member_role_changed', auth.uid(),
                             jsonb_build_object('user_id', target_user, 'from', old_role, 'to', new_role));
  end if;
end;
$$;

create or replace function remove_prd_member(target_prd uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  old_role text;
begin
  if target_user = auth.uid() and prd_role(target_prd) is not null then
    perform 1 from prd where id = target_prd for update;
  else
    perform lock_managed_prd(target_prd);
  end if;
  select role into old_role from prd_member where prd_id = target_prd and user_id = target_user;
  if old_role is null then
    return;
  end if;
  if old_role = 'owner' and not exists (select 1 from prd_member
                                        where prd_id = target_prd and role = 'owner' and user_id <> target_user) then
    raise exception 'owner_required';
  end if;
  delete from prd_member where prd_id = target_prd and user_id = target_user;
  perform record_prd_event(target_prd, 'member_removed', auth.uid(),
                           jsonb_build_object('user_id', target_user, 'role', old_role));
end;
$$;
