-- A deactivated reviewer's pending slots are dropped (Vineela, 2026-11-01;
-- from Marco's review of #103).
--
-- A member who is deactivated loses access to the org's PRDs, so a review
-- slot they hadn't decided could never be decided and the round could never
-- complete. For M3, deactivation drops their *pending* slots on open rounds
-- (in review or changes requested); decisions they already made stay. Then,
-- per round:
-- - no reviewers left: the round is superseded and the PRD goes back to
--   draft (a superseded event, which notifies nobody);
-- - only approvals left, the round still in review and still on the PRD's
--   current version: the round is approved and the PRD becomes final, with
--   one round_approved event to the owners and the remaining reviewers;
-- - otherwise the round waits for the remaining reviewers, as before.
-- M4 replaces this with an owner action to remove or replace a reviewer.
--
-- update_org_member is redefined to call it, and gains a comment on why
-- locking several PRD rows there is safe (Marco's review of #103).
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Apply after
-- 20261101014220_org_member_admin and 20261101010606_review_decisions.
-- Replaces a function, adds one; changes no rows.

-- Drops the member's pending slots on the organization's open rounds and
-- settles each affected round. The caller holds the directory lock; each
-- PRD row is locked before its round changes (the save's lock order).
create or replace function drop_pending_review_slots(target_org uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  open_round record;
begin
  for open_round in
    select r.id, r.prd_id, r.round_no, r.state, r.version_id
    from review_round r
    join review_slot s on s.round_id = r.id and s.reviewer_id = target_user and s.state = 'pending'
    join prd p on p.id = r.prd_id and p.organization_id = target_org
    where r.state in ('in_review', 'changes_requested')
  loop
    perform 1 from prd where id = open_round.prd_id for update;
    delete from review_slot where round_id = open_round.id and reviewer_id = target_user;

    if not exists (select 1 from review_slot where round_id = open_round.id) then
      update review_round set state = 'superseded' where id = open_round.id;
      update prd set status = 'draft' where id = open_round.prd_id;
      perform record_prd_event(open_round.prd_id, 'superseded', auth.uid(),
                               jsonb_build_object('round_no', open_round.round_no, 'reviewer_ids', '[]'::jsonb,
                                                  'continued', false, 'reason', 'reviewer_deactivated'),
                               open_round.version_id, open_round.id);
    elsif open_round.state = 'in_review'
          and open_round.version_id = (select current_version_id from prd where id = open_round.prd_id)
          and not exists (select 1 from review_slot where round_id = open_round.id and state <> 'approved') then
      update review_round set state = 'approved', completed_at = now() where id = open_round.id;
      update prd set status = 'final' where id = open_round.prd_id;
      perform record_prd_event(open_round.prd_id, 'round_approved', auth.uid(),
                               jsonb_build_object('round_no', open_round.round_no, 'reason', 'reviewer_deactivated'),
                               open_round.version_id, open_round.id);
    end if;
  end loop;
end;
$$;

revoke execute on function drop_pending_review_slots(uuid, uuid) from public, anon, authenticated;

create or replace function update_org_member(target_org uuid, target_user uuid, changes jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row organization_member%rowtype;
  new_role text := coalesce(changes ->> 'access_role', null);
  deactivating boolean := changes ? 'active' and (changes ->> 'active')::boolean = false;
  replacement uuid := (changes ->> 'replacement_manager_id')::uuid;
  heir uuid := (changes ->> 'transfer_owner_to')::uuid;
  owned record;
  old_role text;
begin
  -- The same lock the directory triggers take, held until commit.
  perform pg_advisory_xact_lock(hashtextextended('nautilus.org_directory:' || target_org::text, 0));

  if not is_org_admin(target_org) then
    raise exception 'org_admin_required';
  end if;
  select * into current_row from organization_member where organization_id = target_org and user_id = target_user;
  if not found then
    raise exception 'member_not_found';
  end if;
  if exists (select 1 from jsonb_object_keys(changes) k
             where k not in ('access_role', 'department_id', 'manager_id', 'title', 'active',
                             'replacement_manager_id', 'transfer_owner_to')) then
    raise exception 'invalid_change';
  end if;

  -- The last active admin stays.
  if current_row.active and current_row.access_role = 'admin'
     and (deactivating or new_role = 'member')
     and not exists (select 1 from organization_member
                     where organization_id = target_org and active and access_role = 'admin'
                       and user_id <> target_user) then
    raise exception 'last_admin';
  end if;

  if deactivating and current_row.active then
    if exists (select 1 from organization_member
               where organization_id = target_org and manager_id = target_user and active) then
      if not changes ? 'replacement_manager_id' then
        raise exception 'has_direct_reports' using detail = (
          select jsonb_agg(user_id order by user_id)::text from organization_member
          where organization_id = target_org and manager_id = target_user and active);
      end if;
      if replacement is not null and (replacement = target_user or not exists (
          select 1 from organization_member where organization_id = target_org and user_id = replacement and active)) then
        raise exception 'invalid_replacement';
      end if;
      update organization_member set manager_id = replacement
      where organization_id = target_org and manager_id = target_user and active;
    end if;

    if exists (select 1 from prds_owned_only_by(target_org, target_user)) then
      if heir is null then
        raise exception 'owns_prds' using detail = (
          select jsonb_agg(jsonb_build_object('prd_id', o.prd_id, 'title', o.title))::text
          from prds_owned_only_by(target_org, target_user) o);
      end if;
      if heir = target_user or not exists (
          select 1 from organization_member where organization_id = target_org and user_id = heir and active) then
        raise exception 'invalid_replacement';
      end if;
      -- Each PRD row is locked before its members change, as in E04. Locking
      -- several PRDs in one transaction is safe only here: this runs under the
      -- organization's directory lock, and nothing that holds a PRD lock ever
      -- waits for that lock, so two of these can't deadlock with a save.
      for owned in select o.prd_id from prds_owned_only_by(target_org, target_user) o loop
        perform 1 from prd where id = owned.prd_id for update;
        select role into old_role from prd_member where prd_id = owned.prd_id and user_id = heir;
        insert into prd_member (prd_id, user_id, role, granted_by)
          values (owned.prd_id, heir, 'owner', auth.uid())
          on conflict (prd_id, user_id) do update set role = 'owner', granted_by = excluded.granted_by;
        if old_role is null then
          perform record_prd_event(owned.prd_id, 'member_added', auth.uid(),
                                   jsonb_build_object('user_id', heir, 'role', 'owner'));
        else
          perform record_prd_event(owned.prd_id, 'member_role_changed', auth.uid(),
                                   jsonb_build_object('user_id', heir, 'from', old_role, 'to', 'owner'));
        end if;
      end loop;
    end if;

    -- They can't decide any more: drop their pending review slots (M3).
    perform drop_pending_review_slots(target_org, target_user);

    update department set head_id = null where organization_id = target_org and head_id = target_user;
    update team set lead_id = null where organization_id = target_org and lead_id = target_user;
  end if;

  update organization_member set
    access_role = case when changes ? 'access_role' then new_role else access_role end,
    department_id = case when changes ? 'department_id' then (changes ->> 'department_id')::uuid else department_id end,
    manager_id = case when changes ? 'manager_id' then (changes ->> 'manager_id')::uuid else manager_id end,
    title = case when changes ? 'title' then changes ->> 'title' else title end,
    active = case when changes ? 'active' then (changes ->> 'active')::boolean else active end
  where organization_id = target_org and user_id = target_user;
end;
$$;
