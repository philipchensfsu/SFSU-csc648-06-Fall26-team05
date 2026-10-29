-- Organizations, members, departments and teams (Backend Tasks E01, DB03).
--
-- Every PRD will belong to an organization; a solo user is an organization
-- with one member. This migration adds the directory tables and lets active
-- members read their own organization's directory. Writes come later
-- through guarded functions and admin routes (E01 organization creation,
-- E02), and end-state checks such as manager cycles are a separate
-- migration. profile stays the identity record: its legacy role and free-text
-- team grant no organization authority.
--
-- References between directory rows include organization_id, so a member,
-- department or team can only point at rows of the same organization.

create table organization (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  -- Counts toward the per-account creation cap; kept if the creator leaves.
  created_by uuid references profile(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table department (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  head_id uuid,
  -- Archiving replaces deletion so history keeps its attribution.
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table team (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organization(id) on delete cascade,
  department_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  lead_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, department_id) references department(organization_id, id)
);

create table organization_member (
  organization_id uuid not null references organization(id) on delete cascade,
  user_id uuid not null references profile(id) on delete cascade,
  active boolean not null default true,
  department_id uuid,
  -- member: creates PRDs; admin: also manages the organization. Access to a
  -- PRD comes from its own roles, not from this.
  access_role text not null default 'member' check (access_role in ('member', 'admin')),
  -- Independent of access_role and department.
  can_approve boolean not null default false,
  -- Reporting line only; being someone's manager grants no permission.
  manager_id uuid check (manager_id is null or manager_id <> user_id),
  title text check (char_length(title) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id),
  foreign key (organization_id, department_id) references department(organization_id, id),
  foreign key (organization_id, manager_id) references organization_member(organization_id, user_id)
);

-- Added after organization_member exists (the references are circular).
alter table department
  add foreign key (organization_id, head_id) references organization_member(organization_id, user_id);
alter table team
  add foreign key (organization_id, lead_id) references organization_member(organization_id, user_id);

create table team_member (
  organization_id uuid not null,
  team_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (team_id, user_id),
  foreign key (organization_id, team_id) references team(organization_id, id) on delete cascade,
  foreign key (organization_id, user_id) references organization_member(organization_id, user_id) on delete cascade
);

-- Nullable for now: existing personal projects and PRDs stay owner-only
-- until they are explicitly mapped to an organization (DB07).
alter table project add column organization_id uuid references organization(id);
alter table prd add column organization_id uuid references organization(id);

-- Active names are unique within an organization; archived ones may repeat.
create unique index department_active_name on department (organization_id, lower(name)) where archived_at is null;
create unique index team_active_name on team (organization_id, lower(name)) where archived_at is null;
create index organization_member_user on organization_member (user_id) where active;
create index team_member_user on team_member (organization_id, user_id);
create index team_department on team (department_id);
create index project_organization on project (organization_id);
create index prd_organization on prd (organization_id);

create trigger organization_set_updated_at before update on organization
  for each row execute function set_updated_at();
create trigger department_set_updated_at before update on department
  for each row execute function set_updated_at();
create trigger team_set_updated_at before update on team
  for each row execute function set_updated_at();
create trigger organization_member_set_updated_at before update on organization_member
  for each row execute function set_updated_at();

-- Membership helpers for RLS. SECURITY DEFINER so policies on
-- organization_member can call them without recursing; E03 builds the
-- permission predicates on top of these.
create or replace function is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_member
    where organization_id = target_org and user_id = auth.uid() and active
  )
$$;

create or replace function is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_member
    where organization_id = target_org and user_id = auth.uid() and active
      and access_role = 'admin'
  )
$$;

revoke execute on function is_org_member(uuid), is_org_admin(uuid) from public, anon;
grant execute on function is_org_member(uuid), is_org_admin(uuid) to authenticated, service_role;

-- Read-only for clients: active members see their organization's directory.
-- No insert/update/delete grants yet; writes arrive with their routes.
alter table organization enable row level security;
alter table department enable row level security;
alter table team enable row level security;
alter table organization_member enable row level security;
alter table team_member enable row level security;

revoke all on organization, department, team, organization_member, team_member from anon, authenticated;
grant select on organization, department, team, organization_member, team_member to authenticated;
grant select, insert, update, delete on organization, department, team, organization_member, team_member
  to service_role;

create policy "members view their organization" on organization
  for select using (is_org_member(id));
create policy "members view departments" on department
  for select using (is_org_member(organization_id));
create policy "members view teams" on team
  for select using (is_org_member(organization_id));
create policy "members view the member list" on organization_member
  for select using (is_org_member(organization_id));
create policy "members view team links" on team_member
  for select using (is_org_member(organization_id));
