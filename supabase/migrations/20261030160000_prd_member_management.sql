-- Managing who's on a PRD (Backend Tasks E04): invite people, change their
-- role, remove them.
--
-- Owners and org admins (can_manage_prd) add people from the PRD's org as
-- owner, editor or viewer, change roles and remove people; anyone can remove
-- themselves. Every PRD keeps at least one owner. Clients call these with
-- their own token; they still can't write prd_member directly.
--
-- Each function locks the PRD row first (the lock order agreed with S03).
-- Errors raise P0001 with a fixed message the API maps to a readable
-- response: prd_not_found, prd_manage_forbidden, invalid_role,
-- not_in_organization, owner_required.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Adds functions only.

-- The people on a PRD, with names, for anyone who can view it.
create or replace function prd_people(target_prd uuid)
returns table (user_id uuid, full_name text, role text, granted_by uuid, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select m.user_id, p.full_name, m.role, m.granted_by, m.created_at
  from prd_member m
  join profile p on p.id = m.user_id
  where m.prd_id = target_prd and can_view_prd(target_prd)
  order by m.created_at, m.user_id
$$;

-- Checks shared by both changes: the PRD is visible and the caller manages
-- it. Locks the PRD row. Returns its organization.
create or replace function lock_managed_prd(target_prd uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid;
begin
  select organization_id into org from prd where id = target_prd for update;
  if org is null or not can_view_prd(target_prd) then
    raise exception 'prd_not_found';
  end if;
  if not can_manage_prd(target_prd) then
    raise exception 'prd_manage_forbidden';
  end if;
  return org;
end;
$$;

-- Adds someone to a PRD with a role, or changes their role.
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
  if old_role = 'owner' and new_role <> 'owner'
     and not exists (select 1 from prd_member
                     where prd_id = target_prd and role = 'owner' and user_id <> target_user) then
    raise exception 'owner_required';
  end if;
  insert into prd_member (prd_id, user_id, role, granted_by)
    values (target_prd, target_user, new_role, auth.uid())
    on conflict (prd_id, user_id) do update set role = excluded.role, granted_by = excluded.granted_by;
end;
$$;

-- Removes someone from a PRD. Managers can remove anyone; anyone can leave.
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
end;
$$;

revoke execute on function lock_managed_prd(uuid) from public, anon, authenticated;
grant execute on function prd_people(uuid), set_prd_member(uuid, uuid, text), remove_prd_member(uuid, uuid)
  to authenticated, service_role;
