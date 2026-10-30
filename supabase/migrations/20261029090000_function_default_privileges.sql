-- New functions start with no EXECUTE for clients (follows S02, which did
-- the same for tables).
--
-- Postgres lets PUBLIC execute every new function, and Supabase's default
-- privileges also grant EXECUTE on new functions in public to anon and
-- authenticated. A SECURITY DEFINER function left open that way can be
-- called by anyone through the Data API (/rest/v1/rpc), skipping RLS.
-- From here on, each migration grants EXECUTE explicitly to the roles that
-- need it. Existing functions keep their current grants.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"), as postgres. Safe to
-- rerun; changes no rows.

alter default privileges for role postgres in schema public
  revoke execute on functions from anon, authenticated;
alter default privileges for role postgres
  revoke execute on functions from public;
