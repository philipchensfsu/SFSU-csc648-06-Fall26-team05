-- Submitting a PRD for review (Backend Tasks E07).
--
-- An owner (or org admin) submits the PRD's current saved version with a
-- list of reviewers. That opens a numbered review round bound to that
-- version, with one slot per reviewer, and moves the PRD to in_review.
-- Reviewers then approve or request changes (E08).
--
-- - Reviewers are active members of the PRD's org. Anyone not already able
--   to view the PRD is added as a viewer, so they can read and comment.
-- - Owners can't review their own PRD, unless the PRD's owners are all of
--   the org's active members (nobody else could review it). That's decided
--   at submission and kept on the round, even if someone joins later.
-- - The reviewer list is frozen on the round: later membership changes
--   don't add or drop reviewers.
-- - A PRD has at most one current round (in_review, changes_requested or
--   approved). A new one can start only once the current one is
--   superseded, which S03/E09 does when reviewed content changes.
-- - Each reviewer's name and department are copied at submission.
--
-- E09 (Marco) calls these from save_prd, holding the PRD lock (Decision 9):
-- - an edit while in review: continue_review_round supersedes the round and
--   continues it on the new version with the same reviewers;
-- - an owner's edit to an approved PRD, with the confirmed reviewer list:
--   open_review_round(prd, actor, reviewers, true) after superseding the
--   approved round.
--
-- record_prd_event now notifies reviewers: submitted -> the round's
-- reviewers; round_approved -> owners and the round's reviewers;
-- superseded -> the round's reviewers listed in payload.reviewer_ids
-- (the ones whose approval was reset). A role change now also notifies the
-- person whose role changed (member_role_changed).
--
-- can_view_prd is redefined as can_view_prd_as for the caller, so the two
-- can't drift apart (same rule as before: a role on the PRD, or admin of its
-- org, while an active member of that org).
--
-- Errors raise P0001 with a fixed message the API maps: prd_not_found,
-- prd_manage_forbidden, stale_revision, no_saved_version, stale_version,
-- review_in_progress, empty_prd, no_reviewers, reviewer_not_in_organization,
-- owner_cannot_review; continue_review_round raises approved_round_needs_owner.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Apply after
-- 20261031110000_prd_comments. Adds tables and functions, and replaces
-- record_prd_event and can_view_prd.

create table review_round (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null references prd(id) on delete cascade,
  round_no integer not null check (round_no >= 1),
  version_id uuid not null references prd_version(id) on delete cascade,
  state text not null default 'in_review'
    check (state in ('in_review', 'changes_requested', 'approved', 'superseded')),
  -- True when the owners could be reviewers (they were the org's only
  -- active members at submission).
  owner_review_allowed boolean not null default false,
  submitted_by uuid references profile(id) on delete set null,
  submitted_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (prd_id, round_no)
);

create unique index review_round_one_current on review_round (prd_id) where state <> 'superseded';
create index review_round_prd_submitted on review_round (prd_id, submitted_at desc, id desc);

create table review_slot (
  round_id uuid not null references review_round(id) on delete cascade,
  prd_id uuid not null references prd(id) on delete cascade,
  reviewer_id uuid not null references profile(id) on delete cascade,
  reviewer_name text,
  department_name text,
  state text not null default 'pending' check (state in ('pending', 'approved', 'changes_requested')),
  decided_at timestamptz,
  primary key (round_id, reviewer_id)
);

create index review_slot_reviewer on review_slot (reviewer_id) where state = 'pending';

alter table review_round enable row level security;
alter table review_slot enable row level security;

create policy "view rounds of visible prds" on review_round
  for select using (can_view_prd(prd_id));
create policy "view slots of visible prds" on review_slot
  for select using (can_view_prd(prd_id));

revoke all on review_round, review_slot from anon, authenticated;
grant select on review_round, review_slot to authenticated;
grant select, insert, update, delete on review_round, review_slot to service_role;

alter table prd_event
  add constraint prd_event_round_id_fkey
  foreign key (round_id) references review_round(id) on delete set null;

-- Creates a round on the PRD's current version with one pending slot per
-- reviewer, copying each reviewer's name and department. Shared by
-- open_review_round and continue_review_round.
create or replace function create_review_round(p_prd_id uuid, p_reviewers uuid[], p_owner_review_allowed boolean,
                                               p_submitted_by uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row prd%rowtype;
  new_round uuid;
begin
  select * into current_row from prd where id = p_prd_id;
  insert into review_round (prd_id, round_no, version_id, owner_review_allowed, submitted_by)
    values (p_prd_id, (select coalesce(max(round_no), 0) + 1 from review_round where prd_id = p_prd_id),
            current_row.current_version_id, p_owner_review_allowed, p_submitted_by)
    returning id into new_round;
  insert into review_slot (round_id, prd_id, reviewer_id, reviewer_name, department_name)
    select new_round, p_prd_id, r, p.full_name, d.name
    from unnest(p_reviewers) r
    join profile p on p.id = r
    join organization_member om on om.organization_id = current_row.organization_id and om.user_id = r
    left join department d on d.id = om.department_id;
  return new_round;
end;
$$;

-- Opens a review round on the PRD's current version and moves the PRD to
-- in_review. The caller holds the PRD lock and has checked who may submit.
-- Returns the round's id.
create or replace function open_review_round(p_prd_id uuid, p_actor uuid, p_reviewers uuid[],
                                             p_resubmitted boolean default false)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row prd%rowtype;
  reviewers uuid[] := array(select distinct r from unnest(p_reviewers) r where r is not null);
  owners_are_everyone boolean;
  new_round uuid;
  next_round_no integer;
begin
  select * into current_row from prd where id = p_prd_id;
  if current_row.current_version_id is null then
    raise exception 'no_saved_version';
  end if;
  if exists (select 1 from review_round where prd_id = p_prd_id and state <> 'superseded') then
    raise exception 'review_in_progress';
  end if;
  if coalesce(jsonb_array_length((select content_json -> 'content' from prd_version
                                  where id = current_row.current_version_id)), 0) = 0 then
    raise exception 'empty_prd';
  end if;
  if cardinality(reviewers) = 0 then
    raise exception 'no_reviewers';
  end if;
  if exists (select 1 from unnest(reviewers) r
             where not exists (select 1 from organization_member
                               where organization_id = current_row.organization_id and user_id = r and active)) then
    raise exception 'reviewer_not_in_organization';
  end if;

  owners_are_everyone := not exists (
    select 1 from organization_member om
    where om.organization_id = current_row.organization_id and om.active
      and not exists (select 1 from prd_member pm
                      where pm.prd_id = p_prd_id and pm.user_id = om.user_id and pm.role = 'owner'));
  if not owners_are_everyone
     and exists (select 1 from prd_member
                 where prd_id = p_prd_id and role = 'owner' and user_id = any(reviewers)) then
    raise exception 'owner_cannot_review';
  end if;

  -- Reviewers need to read the PRD and comment on it.
  insert into prd_member (prd_id, user_id, role, granted_by)
    select p_prd_id, r, 'viewer', p_actor from unnest(reviewers) r
    where not can_view_prd_as(r, p_prd_id)
    on conflict (prd_id, user_id) do nothing;

  new_round := create_review_round(p_prd_id, reviewers, owners_are_everyone, p_actor);
  select round_no into next_round_no from review_round where id = new_round;

  update prd set status = 'in_review' where id = p_prd_id;

  perform record_prd_event(p_prd_id, 'submitted', p_actor,
                           jsonb_build_object('round_no', next_round_no, 'resubmitted', p_resubmitted),
                           current_row.current_version_id, new_round);
  return new_round;
end;
$$;

-- Submits the PRD's current version for review (owners and org admins).
create or replace function submit_prd_review(target_prd uuid, base_revision integer, target_version uuid,
                                             reviewer_ids uuid[])
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row prd%rowtype;
begin
  select * into current_row from prd where id = target_prd for update;
  if not found or not can_view_prd(target_prd) then
    raise exception 'prd_not_found';
  end if;
  if not can_manage_prd(target_prd) then
    raise exception 'prd_manage_forbidden';
  end if;
  if current_row.revision <> base_revision then
    raise exception 'stale_revision';
  end if;
  if current_row.current_version_id is null then
    raise exception 'no_saved_version';
  end if;
  if target_version is distinct from current_row.current_version_id then
    raise exception 'stale_version';
  end if;
  return open_review_round(target_prd, auth.uid(), reviewer_ids);
end;
$$;

-- E09's step when a PRD in review is edited (Decision 9): the open round is
-- superseded and a continuation round starts on the new version with the
-- same reviewers, so the PRD stays in review and nobody has to resubmit.
-- Every decision is reset; the old round keeps its decisions and the
-- explanation comments as history. Records no event: the caller (Marco's
-- save, holding the PRD lock, after writing the new version) records one
-- superseded event on old_round_id with payload.reviewer_ids =
-- reset_reviewer_ids, which notifies everyone who had decided.
--
-- - No open round, or the round is already on the current version: nothing
--   changes (old_round_id is null, or reset_reviewer_ids is empty).
-- - An approved round isn't continued (raises approved_round_needs_owner):
--   owners edit approved PRDs through the modal and open_review_round.
-- - Reviewers who left the org, lost access, or became owners the round
--   doesn't allow are dropped. The owner-review exception carries over.
-- - If the new version is empty, or no reviewers are left, there's no
--   continuation: the PRD goes back to draft (new_round_id is null).
create or replace function continue_review_round(p_prd_id uuid, p_actor uuid)
returns table (old_round_id uuid, new_round_id uuid, reset_reviewer_ids uuid[])
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row prd%rowtype;
  old_round review_round%rowtype;
  reset uuid[];
  keep uuid[];
  continuation uuid;
begin
  select * into current_row from prd where id = p_prd_id;
  select * into old_round from review_round where prd_id = p_prd_id and state <> 'superseded';
  if not found or old_round.version_id = current_row.current_version_id then
    return query select old_round.id, null::uuid, '{}'::uuid[];
    return;
  end if;
  if old_round.state = 'approved' then
    raise exception 'approved_round_needs_owner';
  end if;

  reset := array(select reviewer_id from review_slot
                 where round_id = old_round.id and state <> 'pending' order by reviewer_id);
  keep := array(select s.reviewer_id from review_slot s
                where s.round_id = old_round.id
                  and can_view_prd_as(s.reviewer_id, p_prd_id)
                  and (old_round.owner_review_allowed or not exists (
                    select 1 from prd_member pm
                    where pm.prd_id = p_prd_id and pm.user_id = s.reviewer_id and pm.role = 'owner')));
  update review_round set state = 'superseded' where id = old_round.id;

  if cardinality(keep) = 0 or coalesce(jsonb_array_length((select content_json -> 'content' from prd_version
                                                           where id = current_row.current_version_id)), 0) = 0 then
    update prd set status = 'draft' where id = p_prd_id;
  else
    continuation := create_review_round(p_prd_id, keep, old_round.owner_review_allowed, old_round.submitted_by);
  end if;
  return query select old_round.id, continuation, reset;
end;
$$;

-- As in 20261031110000 (with comment batching), plus reviewer recipients.
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
  round_reviewers uuid[] := array(select reviewer_id from review_slot where round_id = p_round_id);
  recipients uuid[];
begin
  insert into prd_event (prd_id, event_type, actor_id, actor_name, payload, version_id, round_id, comment_id)
    values (p_prd_id, p_event_type, p_actor, (select full_name from profile where id = p_actor),
            coalesce(p_payload, '{}'), p_version_id, p_round_id, p_comment_id)
    returning id into new_event;

  recipients := case p_event_type
    when 'member_added' then array[(p_payload ->> 'user_id')::uuid]
    when 'member_role_changed' then array[(p_payload ->> 'user_id')::uuid]
    when 'comment_added' then
      array(select user_id from prd_member where prd_id = p_prd_id and role in ('owner', 'editor'))
    when 'submitted' then round_reviewers
    when 'approved' then owners
    when 'changes_requested' then owners
    when 'round_approved' then owners || round_reviewers
    when 'superseded' then
      array(select r from unnest(round_reviewers) r
            where r::text in (select jsonb_array_elements_text(coalesce(p_payload -> 'reviewer_ids', '[]'))))
    when 'work_status_changed' then case when p_payload ->> 'status' = 'done' then owners else '{}' end
    else '{}'
  end;

  recipients := array(select distinct r from unnest(recipients) r
                      where r is not null and r is distinct from p_actor and can_view_prd_as(r, p_prd_id));

  perform notify_recipients(new_event, p_prd_id, p_event_type, p_actor, recipients);
  return new_event;
end;
$$;

-- One rule for "can this person view the PRD", asked for the caller.
-- create or replace keeps its grants and the RLS policies that call it.
create or replace function can_view_prd(target_prd_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select can_view_prd_as(auth.uid(), target_prd_id)
$$;

revoke execute on function open_review_round(uuid, uuid, uuid[], boolean), create_review_round(uuid, uuid[], boolean, uuid),
  continue_review_round(uuid, uuid) from public, anon, authenticated;
grant execute on function submit_prd_review(uuid, integer, uuid, uuid[]) to authenticated, service_role;
