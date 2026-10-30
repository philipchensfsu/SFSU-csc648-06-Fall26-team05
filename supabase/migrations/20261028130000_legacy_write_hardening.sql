-- Tighten access to the existing tables (Backend Tasks S02).
--
-- 1. The live database grants `anon` every privilege on every table, and
--    Supabase's default privileges do the same for any table created later.
--    RLS still hides rows from signed-out callers, but they need no table
--    access at all. Logged-in users never need TRUNCATE, REFERENCES or
--    TRIGGER, and TRUNCATE skips RLS entirely.
-- 2. Any user could change their own profile.role (and email), e.g. to
--    'admin'. Profiles are created by the handle_new_user trigger and roles
--    are assigned from the dashboard, so clients may only edit their name
--    and team.
-- 3. Engineers could read every PRD whose status was final or assigned.
--    PRDs stay owner-only (plus legacy admin) until E03/E04 add explicit
--    access and assignments.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"), as postgres, which owns
-- the tables and the default privileges. Safe to rerun; changes no rows.

begin;

-- 1. Grants on existing tables and on tables created later.
revoke all on profile, project, prd, intake_answer, attachment, prd_context,
  source, prd_version, generation_record from anon;
revoke truncate, references, trigger on profile, project, prd, intake_answer,
  attachment, prd_context, source, prd_version, generation_record from authenticated;

-- New tables get no access by default; each migration grants explicitly.
alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

-- The RLS helpers are only meaningful for a signed-in caller.
revoke execute on function current_profile_role(), can_view_prd(uuid), can_edit_prd(uuid)
  from public, anon;
grant execute on function current_profile_role(), can_view_prd(uuid), can_edit_prd(uuid)
  to authenticated, service_role;

-- 2. Profiles: no client inserts; updates limited to full_name and team.
revoke insert, update on profile from authenticated;
grant update (full_name, team) on profile to authenticated;

-- 3. Remove engineer visibility of final/assigned PRDs and their child rows.
alter policy "view accessible prds"
  on prd
  using (owner_id = auth.uid() or current_profile_role() = 'admin');

create or replace function can_view_prd(target_prd_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from prd
    where id = target_prd_id
      and (owner_id = auth.uid() or current_profile_role() = 'admin')
  )
$$;

commit;
