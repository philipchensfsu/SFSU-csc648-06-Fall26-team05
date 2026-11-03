-- Names (and, for admins, emails) of an organization's members, for the
-- directory and org chart (Backend Tasks E02).
--
-- profile's RLS only shows a user their own row, so members couldn't see
-- each other's names. This returns just the fields the directory needs,
-- only to active members of that organization, and email only to its admins.

create or replace function org_directory_people(target_org uuid)
returns table (user_id uuid, full_name text, email text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         p.full_name,
         case when is_org_admin(target_org) then p.email end
  from organization_member m
  join profile p on p.id = m.user_id
  where m.organization_id = target_org
    and is_org_member(target_org)
$$;

revoke execute on function org_directory_people(uuid) from public, anon;
grant execute on function org_directory_people(uuid) to authenticated, service_role;
