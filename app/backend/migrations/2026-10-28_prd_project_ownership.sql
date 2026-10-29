-- A PRD may only be linked to a project owned by the PRD's own owner.
--
-- Before this, the prd insert policy checked only owner_id and role, and the
-- update policy had no WITH CHECK, so any signed-in user could create a PRD in
-- (or move one into) someone else's project. Foreign-key checks don't apply
-- RLS, so the project being invisible to them didn't stop it.
--
-- Run once in the Supabase SQL Editor. Safe to rerun; changes no rows.
-- schema.sql carries the same definitions for fresh setups.

begin;

-- SECURITY INVOKER (the default) on purpose: it runs under the caller's own
-- project RLS, so it can't be called directly to probe who owns a project.
create or replace function project_matches_owner(target_project_id uuid, target_owner_id uuid)
returns boolean
language sql
stable
set search_path = public
as $$
  select target_project_id is null
    or exists (
      select 1 from project
      where id = target_project_id and owner_id = target_owner_id
    )
$$;

revoke execute on function project_matches_owner(uuid, uuid) from public, anon;
grant execute on function project_matches_owner(uuid, uuid) to authenticated, service_role;

alter policy "pm admin create prds"
  on prd
  with check (
    owner_id = auth.uid()
    and current_profile_role() in ('pm', 'admin')
    and project_matches_owner(project_id, owner_id)
  );

-- Checks the PRD's owner rather than the caller, so an admin can still edit
-- someone else's PRD that sits in that person's project.
alter policy "pm admin update own prds"
  on prd
  with check (
    (
      (owner_id = auth.uid() and current_profile_role() = 'pm')
      or current_profile_role() = 'admin'
    )
    and project_matches_owner(project_id, owner_id)
  );

commit;
