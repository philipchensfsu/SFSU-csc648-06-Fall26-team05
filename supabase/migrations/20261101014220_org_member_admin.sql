-- Org admins manage members (Backend Tasks E02, part 2).
--
-- update_org_member(org, user, changes) changes one member's access_role,
-- department_id, manager_id, title or active flag, in one transaction under
-- the per-organization directory lock. changes is a JSON object holding only
-- the fields to change; a null value clears department_id, manager_id or
-- title.
--
-- - An organization always keeps an active admin: demoting or deactivating
--   the last one raises last_admin. The lock makes two admins demoting each
--   other at the same time take turns, so the second one sees the first.
-- - Deactivating someone needs a decision about what they leave behind:
--   * their direct reports: replacement_manager_id moves them to another
--     active member, or null leaves them without a manager; without it,
--     has_direct_reports.
--   * PRDs where they're the only owner: transfer_owner_to makes another
--     active member an owner of them (recorded and notified like an invite
--     or role change); without it, owns_prds.
--   Both refusals list what's affected in the error detail (JSON).
--   Their department head and team lead positions are cleared.
-- - Reactivating someone who is active in another organization fails on the
--   one-active-membership index (one organization per account).
-- - Department and manager changes go through the directory's end-state
--   checks (no cycles, active managers, nothing in archived departments).
--
-- Errors raise P0001 with a fixed message the API maps: org_admin_required,
-- member_not_found, last_admin, has_direct_reports, owns_prds,
-- invalid_replacement, invalid_change.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Apply after
-- 20261031160000_org_structure_admin. Adds functions; changes no rows.

-- PRDs in the organization where the member is the only owner.
create or replace function prds_owned_only_by(target_org uuid, target_user uuid)
returns table (prd_id uuid, title text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.title
  from prd p
  join prd_member pm on pm.prd_id = p.id and pm.user_id = target_user and pm.role = 'owner'
  where p.organization_id = target_org
    and not exists (select 1 from prd_member other
                    where other.prd_id = p.id and other.role = 'owner' and other.user_id <> target_user)
  order by p.title, p.id
$$;

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
      -- Each PRD row is locked before its members change, as in E04.
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

revoke execute on function prds_owned_only_by(uuid, uuid) from public, anon, authenticated;
grant execute on function update_org_member(uuid, uuid, jsonb) to authenticated, service_role;
