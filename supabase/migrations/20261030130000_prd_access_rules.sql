-- PRD access from per-PRD roles and org admins (Backend Tasks E03, part 2).
--
--              view  edit  delete
--   owner       yes   yes   yes
--   editor      yes   yes   no
--   viewer      yes   no    no
--   org admin   yes   yes   yes   (every PRD in their organization)
--
-- Roles count only while the person is an active member of the PRD's org
-- (prd_role). Everything that hangs off a PRD (intake answers, versions,
-- context, sources, attachments, generation records) already goes through
-- can_view_prd and can_edit_prd, so it follows the same rules.
--
-- The legacy profile.role ('pm', 'engineer', 'admin') stops granting
-- anything: the only admin is the org admin. Projects stay private to their
-- owner, and any signed-in user can create them. Profiles are each user's own.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Changes access, not rows.
-- Accounts that relied on profile.role = 'admin' lose that access.

create or replace function can_view_prd(target_prd_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select prd_role(target_prd_id) is not null or is_prd_org_admin(target_prd_id)
$$;

create or replace function can_edit_prd(target_prd_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(prd_role(target_prd_id) in ('owner', 'editor'), false) or is_prd_org_admin(target_prd_id)
$$;

-- Delete, and later inviting people and submitting for review.
create or replace function can_manage_prd(target_prd_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select is_prd_owner(target_prd_id) or is_prd_org_admin(target_prd_id)
$$;

grant execute on function can_manage_prd(uuid) to authenticated, service_role;

-- PRDs
drop policy "view accessible prds" on prd;
drop policy "pm admin create prds" on prd;
drop policy "pm admin update own prds" on prd;
drop policy "pm admin delete own prds" on prd;

create policy "view prds by role" on prd
  for select using (can_view_prd(id));

-- The creator becomes the owner (prd_add_creator). A PRD in an organization
-- needs the creator to be an active member of it, and its project must be
-- the creator's own.
create policy "create own prds" on prd
  for insert with check (
    owner_id = auth.uid()
    and (organization_id is null or is_org_member(organization_id))
    and project_matches_owner(project_id, owner_id)
  );

create policy "edit prds by role" on prd
  for update using (can_edit_prd(id))
  with check (can_edit_prd(id));

-- A PRD's project must belong to the PRD's owner (#46). Policies run with the
-- caller's access, and projects are private, so an org admin editing someone
-- else's PRD couldn't see its project. A trigger checks it instead, on create
-- and whenever the project or owner changes; clients can't call it.
create or replace function check_prd_project()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.project_id is not null
     and (tg_op = 'INSERT' or new.project_id is distinct from old.project_id or new.owner_id is distinct from old.owner_id)
     and not exists (select 1 from project where id = new.project_id and owner_id = new.owner_id) then
    raise exception 'A PRD''s project must belong to the PRD''s owner' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke execute on function check_prd_project() from public, anon, authenticated;

create trigger prd_project_owner before insert or update on prd
  for each row execute function check_prd_project();

create policy "delete prds by role" on prd
  for delete using (can_manage_prd(id));

-- Projects: private to their owner, for any signed-in user.
drop policy "view own projects or admin" on project;
drop policy "pm admin create projects" on project;
drop policy "pm admin update own projects" on project;
drop policy "pm admin delete own projects" on project;

create policy "view own projects" on project for select using (owner_id = auth.uid());
create policy "create own projects" on project for insert with check (owner_id = auth.uid());
create policy "update own projects" on project for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "delete own projects" on project for delete using (owner_id = auth.uid());

-- Profiles: each user's own.
drop policy "view own profile or admin" on profile;
drop policy "update own profile or admin" on profile;
drop policy "admin deletes profiles" on profile;

create policy "view own profile" on profile for select using (id = auth.uid());
create policy "update own profile" on profile for update using (id = auth.uid()) with check (id = auth.uid());

-- Deleting an account mustn't fail because the person is the only owner of
-- a PRD (Marco's note on #76). When the owner row goes away because the
-- account itself is being deleted, the PRD is left without an owner, and an
-- org admin, who can still manage it, adds one.
create or replace function check_prd_has_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from prd where id = old.prd_id)
     and exists (select 1 from profile where id = old.user_id)
     and not exists (select 1 from prd_member where prd_id = old.prd_id and role = 'owner') then
    raise exception 'A PRD needs at least one owner'
      using errcode = 'check_violation', constraint = 'prd_owner_required';
  end if;
  return null;
end;
$$;
