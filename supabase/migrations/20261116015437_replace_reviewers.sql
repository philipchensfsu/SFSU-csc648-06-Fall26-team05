-- Owners remove or replace a reviewer on an open round, and removed slots
-- are kept as history (agreed with Marco on #97 for a later milestone).
--
-- change_reviewer(prd, round, reviewer, replacement):
-- - Owners and org admins (the same people who submit), on the PRD's open
--   round (in_review or changes_requested), holding the PRD lock.
-- - Only a reviewer who hasn't decided yet. Decisions stand: removing the
--   reviewer who requested changes would let owners skip a change request.
-- - With a replacement, the new reviewer gets a pending slot under the same
--   rules as submitting (active org member, not an owner unless the round
--   allows it, added as a viewer if they can't see the PRD).
-- - Without one, the reviewer is just removed; the last reviewer can't be
--   removed (replace them instead). If everyone left has approved and the
--   round is in review on the current version, the round is approved, as
--   when a reviewer is deactivated (M3's rule, kept until revisited).
-- - One reviewer_changed event notifies the removed and the added reviewer.
--
-- Removed slots move to review_slot_removal (who, when, by whom, why, and
-- who replaced them) instead of disappearing. drop_pending_review_slots
-- (a reviewer deactivated or removed from the PRD) now records them there
-- too, with no actor.
--
-- Errors raise P0001 with a fixed message the API maps: prd_not_found,
-- prd_manage_forbidden, round_not_found, round_not_open, reviewer_not_found,
-- reviewer_already_decided, last_reviewer, reviewer_not_in_organization,
-- already_a_reviewer, owner_cannot_review.
--
-- Apply after 20261116010138_comment_mentions. Adds a table and a function,
-- replaces the event_type check (adds reviewer_changed), record_prd_event and
-- drop_pending_review_slots. Changes no rows.

create table review_slot_removal (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references review_round(id) on delete cascade,
  prd_id uuid not null references prd(id) on delete cascade,
  reviewer_id uuid references profile(id) on delete set null,
  reviewer_name text,
  department_name text,
  -- removed or replaced by an owner; reviewer_deactivated or reviewer_removed
  -- when they lost access (drop_pending_review_slots).
  reason text not null check (reason in ('removed', 'replaced', 'reviewer_deactivated', 'reviewer_removed')),
  replaced_by uuid references profile(id) on delete set null,
  removed_by uuid references profile(id) on delete set null,  -- null: the system
  removed_at timestamptz not null default now()
);

create index review_slot_removal_round on review_slot_removal (round_id);

alter table review_slot_removal enable row level security;

create policy "view removed slots of visible prds" on review_slot_removal
  for select using (can_view_prd(prd_id));

revoke all on review_slot_removal from anon, authenticated;
grant select on review_slot_removal to authenticated;
grant select, insert, update, delete on review_slot_removal to service_role;

alter table prd_event drop constraint prd_event_event_type_check;
alter table prd_event add constraint prd_event_event_type_check check (event_type in (
  'created', 'version_saved', 'ai_applied',
  'member_added', 'member_role_changed', 'member_removed', 'team_added',
  'comment_added', 'mentioned', 'submitted', 'approved', 'changes_requested', 'round_approved', 'superseded',
  'reviewer_changed', 'work_status_changed'
));

-- As in 20261116010138_comment_mentions, plus reviewer_changed: the removed
-- and the added reviewer.
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
    when 'team_added' then
      array(select jsonb_array_elements_text(coalesce(p_payload -> 'user_ids', '[]'))::uuid)
    when 'comment_added' then
      array(select user_id from prd_member where prd_id = p_prd_id and role in ('owner', 'editor')
              and user_id::text not in (
                select jsonb_array_elements_text(coalesce(p_payload -> 'mentioned_user_ids', '[]'))))
    when 'mentioned' then
      array(select jsonb_array_elements_text(coalesce(p_payload -> 'user_ids', '[]'))::uuid)
    when 'submitted' then round_reviewers
    when 'approved' then owners
    when 'changes_requested' then owners
    when 'round_approved' then owners || round_reviewers
    when 'superseded' then
      array(select r from unnest(round_reviewers) r
            where r::text in (select jsonb_array_elements_text(coalesce(p_payload -> 'reviewer_ids', '[]'))))
    when 'reviewer_changed' then
      array[(p_payload ->> 'removed_reviewer_id')::uuid, (p_payload ->> 'added_reviewer_id')::uuid]
    when 'work_status_changed' then case when p_payload ->> 'status' = 'done' then owners else '{}' end
    else '{}'
  end;

  recipients := array(select distinct r from unnest(recipients) r
                      where r is not null and r is distinct from p_actor and can_view_prd_as(r, p_prd_id));

  perform notify_recipients(new_event, p_prd_id, p_event_type, p_actor, recipients);
  return new_event;
end;
$$;

create or replace function change_reviewer(target_prd uuid, target_round uuid, target_reviewer uuid,
                                           replacement uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row prd%rowtype;
  round_row review_round%rowtype;
  slot_row review_slot%rowtype;
begin
  select * into current_row from prd where id = target_prd for update;
  if not found or not can_view_prd(target_prd) then
    raise exception 'prd_not_found';
  end if;
  if not can_manage_prd(target_prd) then
    raise exception 'prd_manage_forbidden';
  end if;
  select * into round_row from review_round where id = target_round and prd_id = target_prd for update;
  if not found then
    raise exception 'round_not_found';
  end if;
  if round_row.state not in ('in_review', 'changes_requested') then
    raise exception 'round_not_open';
  end if;
  select * into slot_row from review_slot where round_id = target_round and reviewer_id = target_reviewer for update;
  if not found then
    raise exception 'reviewer_not_found';
  end if;
  if slot_row.state <> 'pending' then
    raise exception 'reviewer_already_decided';
  end if;

  if replacement is null then
    if not exists (select 1 from review_slot where round_id = target_round and reviewer_id <> target_reviewer) then
      raise exception 'last_reviewer';
    end if;
  else
    if not exists (select 1 from organization_member
                   where organization_id = current_row.organization_id and user_id = replacement and active) then
      raise exception 'reviewer_not_in_organization';
    end if;
    if exists (select 1 from review_slot where round_id = target_round and reviewer_id = replacement) then
      raise exception 'already_a_reviewer';
    end if;
    if not round_row.owner_review_allowed
       and exists (select 1 from prd_member where prd_id = target_prd and user_id = replacement and role = 'owner') then
      raise exception 'owner_cannot_review';
    end if;
  end if;

  insert into review_slot_removal (round_id, prd_id, reviewer_id, reviewer_name, department_name, reason,
                                   replaced_by, removed_by)
    values (target_round, target_prd, target_reviewer, slot_row.reviewer_name, slot_row.department_name,
            case when replacement is null then 'removed' else 'replaced' end, replacement, auth.uid());
  delete from review_slot where round_id = target_round and reviewer_id = target_reviewer;

  if replacement is not null then
    insert into prd_member (prd_id, user_id, role, granted_by)
      select target_prd, replacement, 'viewer', auth.uid() where not can_view_prd_as(replacement, target_prd)
      on conflict (prd_id, user_id) do nothing;
    insert into review_slot (round_id, prd_id, reviewer_id, reviewer_name, department_name)
      select target_round, target_prd, replacement, p.full_name, d.name
      from profile p
      join organization_member om on om.organization_id = current_row.organization_id and om.user_id = p.id
      left join department d on d.id = om.department_id
      where p.id = replacement;
  end if;

  perform record_prd_event(target_prd, 'reviewer_changed', auth.uid(),
                           jsonb_build_object('round_no', round_row.round_no, 'removed_reviewer_id', target_reviewer,
                                              'added_reviewer_id', replacement),
                           round_row.version_id, target_round);

  if replacement is null and round_row.state = 'in_review'
     and round_row.version_id = current_row.current_version_id
     and not exists (select 1 from review_slot where round_id = target_round and state <> 'approved') then
    update review_round set state = 'approved', completed_at = now() where id = target_round;
    update prd set status = 'final' where id = target_prd;
    perform record_prd_event(target_prd, 'round_approved', null,
                             jsonb_build_object('round_no', round_row.round_no, 'reviewer_id', null,
                                                'reason', 'reviewer_dropped', 'removed_reviewer_id', target_reviewer),
                             round_row.version_id, target_round);
  end if;
end;
$$;

revoke execute on function change_reviewer(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function change_reviewer(uuid, uuid, uuid, uuid) to authenticated, service_role;

-- As in 20261101015844_drop_deactivated_reviewers, but each dropped slot is
-- kept in review_slot_removal (no actor) instead of disappearing.
create or replace function drop_pending_review_slots(target_org uuid, target_user uuid, reason text,
                                                     target_prd uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  open_round record;
  superseded_event uuid;
begin
  for open_round in
    select r.id, r.prd_id, r.round_no, r.state, r.version_id
    from review_round r
    join review_slot s on s.round_id = r.id and s.reviewer_id = target_user and s.state = 'pending'
    join prd p on p.id = r.prd_id and p.organization_id = target_org
    where r.state in ('in_review', 'changes_requested') and (target_prd is null or r.prd_id = target_prd)
  loop
    perform 1 from prd where id = open_round.prd_id for update;
    insert into review_slot_removal (round_id, prd_id, reviewer_id, reviewer_name, department_name, reason)
      select round_id, prd_id, reviewer_id, reviewer_name, department_name, drop_pending_review_slots.reason
      from review_slot where round_id = open_round.id and reviewer_id = target_user;
    delete from review_slot where round_id = open_round.id and reviewer_id = target_user;

    if not exists (select 1 from review_slot where round_id = open_round.id) then
      update review_round set state = 'superseded' where id = open_round.id;
      update prd set status = 'draft' where id = open_round.prd_id;
      superseded_event := record_prd_event(
        open_round.prd_id, 'superseded', null,
        jsonb_build_object('round_no', open_round.round_no, 'reviewer_ids', '[]'::jsonb, 'continued', false,
                           'reason', reason, 'removed_reviewer_id', target_user),
        open_round.version_id, open_round.id);
      -- A superseded event notifies only the reviewers it lists; with nobody
      -- left, the owners need to know their PRD is back in draft.
      perform notify_recipients(superseded_event, open_round.prd_id, 'superseded', null, array(
        select user_id from prd_member
        where prd_id = open_round.prd_id and role = 'owner' and user_id <> target_user
          and can_view_prd_as(user_id, open_round.prd_id)));
    elsif open_round.state = 'in_review'
          and open_round.version_id = (select current_version_id from prd where id = open_round.prd_id)
          and not exists (select 1 from review_slot where round_id = open_round.id and state <> 'approved') then
      update review_round set state = 'approved', completed_at = now() where id = open_round.id;
      update prd set status = 'final' where id = open_round.prd_id;
      perform record_prd_event(open_round.prd_id, 'round_approved', null,
                               jsonb_build_object('round_no', open_round.round_no, 'reviewer_id', null,
                                                  'reason', reason, 'removed_reviewer_id', target_user),
                               open_round.version_id, open_round.id);
    end if;
  end loop;
end;
$$;
