-- Per-PRD roles (Backend Tasks E03, team decision 1).
--
-- Access to a PRD comes from the PRD itself, not the person's org role:
-- prd_member holds one row per person per PRD, with the role owner, editor
-- or viewer.
--   owner:  everything (edit, invite and remove people, submit, delete)
--   editor: view, comment, edit
--   viewer: view, comment
-- A PRD can have several owners and always keeps at least one. prd.owner_id
-- stays as "created by". Org admins' access to every PRD in their org comes
-- from the org role, not from rows here.
--
-- This migration only adds the roles: access rules still follow the old
-- helpers until the next E03 migration switches them over.
--
-- Rules, checked by triggers:
-- - The PRD's creator becomes its first owner automatically, and existing
--   PRDs get their owner row now.
-- - People on an org PRD must be active members of that org. A personal PRD
--   (no organization) has only its creator.
-- - Every PRD keeps at least one owner, checked at commit so an ownership
--   handover in one transaction works.
--
-- Clients can read the people on PRDs they can see, but can't write rows:
-- invites and role changes come with their routes (E04).
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Adds an owner row for
-- every existing PRD.

create table prd_member (
  prd_id uuid not null references prd(id) on delete cascade,
  user_id uuid not null references profile(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  granted_by uuid references profile(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (prd_id, user_id)
);

create index prd_member_user on prd_member (user_id);

-- The caller's role on a PRD, or null. On an org PRD it counts only while
-- the caller is an active member of that org.
create or replace function prd_role(target_prd uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select pm.role
  from prd_member pm
  join prd p on p.id = pm.prd_id
  where pm.prd_id = target_prd
    and pm.user_id = auth.uid()
    and (p.organization_id is null or is_org_member(p.organization_id))
$$;

create or replace function is_prd_owner(target_prd uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(prd_role(target_prd) = 'owner', false)
$$;

-- True when the caller is an admin of the PRD's organization.
create or replace function is_prd_org_admin(target_prd uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from prd
    where id = target_prd and organization_id is not null and is_org_admin(organization_id)
  )
$$;

grant execute on function prd_role(uuid), is_prd_owner(uuid), is_prd_org_admin(uuid) to authenticated, service_role;

-- People on an org PRD are active members of its org; a personal PRD has
-- only its creator.
create or replace function check_prd_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target prd%rowtype;
begin
  select * into target from prd where id = new.prd_id;
  if target.organization_id is null then
    if new.user_id <> target.owner_id then
      raise exception 'A personal PRD has only its creator'
        using errcode = 'check_violation', constraint = 'prd_member_personal';
    end if;
  elsif not exists (
    select 1 from organization_member
    where organization_id = target.organization_id and user_id = new.user_id and active
  ) then
    raise exception 'People on a PRD must be active members of its organization'
      using errcode = 'check_violation', constraint = 'prd_member_same_org';
  end if;
  return new;
end;
$$;

create trigger prd_member_check before insert or update on prd_member
  for each row execute function check_prd_member();

-- Every PRD that still exists keeps at least one owner.
create or replace function check_prd_has_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from prd where id = old.prd_id)
     and not exists (select 1 from prd_member where prd_id = old.prd_id and role = 'owner') then
    raise exception 'A PRD needs at least one owner'
      using errcode = 'check_violation', constraint = 'prd_owner_required';
  end if;
  return null;
end;
$$;

create constraint trigger prd_member_owner_required after update or delete on prd_member
  deferrable initially deferred for each row execute function check_prd_has_owner();

-- The creator becomes the first owner.
create or replace function add_prd_creator()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into prd_member (prd_id, user_id, role, granted_by) values (new.id, new.owner_id, 'owner', new.owner_id);
  return null;
end;
$$;

create trigger prd_add_creator after insert on prd
  for each row execute function add_prd_creator();

-- Internal: only the triggers call these.
revoke execute on function check_prd_member(), check_prd_has_owner(), add_prd_creator()
  from public, anon, authenticated;

-- Existing PRDs: their creator is their owner.
insert into prd_member (prd_id, user_id, role, granted_by)
  select id, owner_id, 'owner', owner_id from prd
  on conflict (prd_id, user_id) do nothing;

alter table prd_member enable row level security;
grant select on prd_member to authenticated;
grant select, insert, update, delete on prd_member to service_role;

create policy "see people on prds you can view" on prd_member
  for select using (can_view_prd(prd_id));
