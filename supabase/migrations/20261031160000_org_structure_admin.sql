-- Org admins manage departments and teams (Backend Tasks E02, part 1).
--
-- Admins of an organization create, rename and archive its departments and
-- teams, pick department heads and team leads, and add people to teams or
-- remove them. Clients write the tables directly under these policies; the
-- column grants limit what can change (a row can't move to another
-- organization, and created_at stays). Nothing is deleted: archiving
-- replaces deletion.
--
-- The end-state rules from 20261029110000 still run on every change, under
-- the per-organization lock: a head is an active member of their
-- department, a lead is on their team, and an archived department or team
-- has no active members or teams. Team membership never changes anyone's
-- org membership or access.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Adds policies and grants;
-- changes no rows.

create policy "admins create departments" on department
  for insert with check (is_org_admin(organization_id));
create policy "admins update departments" on department
  for update using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

create policy "admins create teams" on team
  for insert with check (is_org_admin(organization_id));
create policy "admins update teams" on team
  for update using (is_org_admin(organization_id)) with check (is_org_admin(organization_id));

-- Only active members of the organization can be put on its teams.
create policy "admins add team members" on team_member
  for insert with check (
    is_org_admin(organization_id)
    and exists (select 1 from organization_member m
                where m.organization_id = team_member.organization_id and m.user_id = team_member.user_id
                  and m.active)
  );
create policy "admins remove team members" on team_member
  for delete using (is_org_admin(organization_id));

grant insert (organization_id, name) on department to authenticated;
grant update (name, head_id, archived_at) on department to authenticated;
grant insert (organization_id, name, department_id) on team to authenticated;
grant update (name, department_id, lead_id, archived_at) on team to authenticated;
grant insert (organization_id, team_id, user_id), delete on team_member to authenticated;
