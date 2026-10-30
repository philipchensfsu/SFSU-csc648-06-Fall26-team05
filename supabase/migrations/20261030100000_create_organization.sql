-- Organization creation for new sign-ups (Backend Tasks E01).
--
-- A new account is asked for an organization name and becomes its admin.
-- create_organization() creates the organization and the creator's admin
-- membership in one transaction. It adds no department or team: an
-- organization may use departments, teams, both or neither, and admins set
-- that up later. Clients have no insert grants on the directory tables, so
-- this function is the only way in.
--
-- Teams may now exist without a department, for organizations that have
-- teams but no departments. A team's department, when set, is still in the
-- same organization (the composite foreign key from the directory tables).
--
-- Each account can create at most 3 organizations. A per-account lock makes
-- concurrent requests take turns, so the cap holds under concurrency. Going
-- over raises 'organization_limit' (P0001), which the API turns into a 409.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Adds a function and relaxes
-- one NOT NULL; changes no rows.

create or replace function create_organization(org_name text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  creator uuid := auth.uid();
  new_org uuid;
begin
  if creator is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('nautilus.create_organization:' || creator::text, 0));
  if (select count(*) from organization where created_by = creator) >= 3 then
    raise exception 'organization_limit';
  end if;

  insert into organization (name, created_by) values (btrim(org_name), creator) returning id into new_org;
  insert into organization_member (organization_id, user_id, access_role) values (new_org, creator, 'admin');
  return new_org;
end;
$$;

grant execute on function create_organization(text) to authenticated, service_role;

alter table team alter column department_id drop not null;
