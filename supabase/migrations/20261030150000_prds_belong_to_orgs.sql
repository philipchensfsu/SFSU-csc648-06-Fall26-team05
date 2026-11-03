-- Every PRD belongs to an organization (Backend Tasks E03, part 3).
--
-- Every account belongs to an organization (sign-up creates one, or the
-- member joins one with a code), and a new PRD belongs to its creator's
-- organization. PRDs made before organizations existed have none.
--
-- !! This DELETES every PRD without an organization, with everything
-- attached to it (intake answers, versions, context, sources, attachments,
-- generation records and roles). The team agreed on 2026-10-30 that the
-- hosted database holds only test data, so nothing is kept. Pre-check
-- (expect only test PRDs): select id, title, owner_id from prd
-- where organization_id is null;
--
-- Then organization_id becomes required and can't change, and a PRD's
-- people are always active members of its organization.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database").

delete from prd where organization_id is null;

alter table prd alter column organization_id set not null;

-- No more personal PRDs: everyone on a PRD is an active member of its org.
create or replace function check_prd_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from prd p
    join organization_member m on m.organization_id = p.organization_id
    where p.id = new.prd_id and m.user_id = new.user_id and m.active
  ) then
    raise exception 'People on a PRD must be active members of its organization'
      using errcode = 'check_violation', constraint = 'prd_member_same_org';
  end if;
  return new;
end;
$$;

-- The creator must be an active member of the PRD's org. (Its project is
-- checked by the prd_project_owner trigger.)
alter policy "create own prds" on prd
  with check (owner_id = auth.uid() and is_org_member(organization_id));

-- A PRD stays in the organization it was created in.
create or replace function keep_prd_organization()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'A PRD can''t move to another organization' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

revoke execute on function keep_prd_organization() from public, anon, authenticated;

create trigger prd_keep_organization before update on prd
  for each row execute function keep_prd_organization();
