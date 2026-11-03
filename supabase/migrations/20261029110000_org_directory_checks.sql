-- End-state rules for the organization directory (Backend Tasks E01, DB03).
--
-- Checked when the transaction commits, so a change made in several steps
-- (move a head out of a department and pick a new head) only has to be
-- valid at the end. Every directory write first takes a per-organization
-- lock, so two concurrent changes that are each fine alone (A reports to B,
-- B reports to A) can't both commit. E02 routes and E15 reorganizations rely
-- on these rules instead of re-implementing them.
--
-- Violations raise check_violation (SQLSTATE 23514) with a constraint name
-- such as org_manager_cycle, which routes can turn into readable errors.

create or replace function lock_org_directory()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(
    hashtextextended('nautilus.org_directory:' || coalesce(new.organization_id, old.organization_id)::text, 0)
  );
  return coalesce(new, old);
end;
$$;

create or replace function check_org_directory(target_org uuid)
returns void
language plpgsql
set search_path = public
as $$
begin
  -- Active members must report to an active member.
  if exists (
    select 1 from organization_member m
    join organization_member boss
      on boss.organization_id = m.organization_id and boss.user_id = m.manager_id
    where m.organization_id = target_org and m.active and not boss.active
  ) then
    raise exception 'An active member reports to an inactive manager'
      using errcode = 'check_violation', constraint = 'org_manager_active';
  end if;

  -- Reporting lines must not loop back to where they started.
  if exists (
    with recursive chain (start_id, current_id, path) as (
      select user_id, manager_id, array[user_id]
      from organization_member
      where organization_id = target_org and manager_id is not null
      union all
      select c.start_id, m.manager_id, c.path || c.current_id
      from chain c
      join organization_member m
        on m.organization_id = target_org and m.user_id = c.current_id
      where m.manager_id is not null and not c.current_id = any (c.path)
    )
    select 1 from chain where current_id = start_id
  ) then
    raise exception 'Reporting lines would form a cycle'
      using errcode = 'check_violation', constraint = 'org_manager_cycle';
  end if;

  -- A department head is an active member of that department.
  if exists (
    select 1 from department d
    left join organization_member m
      on m.organization_id = d.organization_id and m.user_id = d.head_id
    where d.organization_id = target_org and d.head_id is not null
      and (not m.active or m.department_id is distinct from d.id)
  ) then
    raise exception 'A department head must be an active member of that department'
      using errcode = 'check_violation', constraint = 'org_department_head';
  end if;

  -- A team lead is an active member of that team.
  if exists (
    select 1 from team t
    left join organization_member m
      on m.organization_id = t.organization_id and m.user_id = t.lead_id
    left join team_member tm on tm.team_id = t.id and tm.user_id = t.lead_id
    where t.organization_id = target_org and t.lead_id is not null
      and (not m.active or tm.user_id is null)
  ) then
    raise exception 'A team lead must be an active member of that team'
      using errcode = 'check_violation', constraint = 'org_team_lead';
  end if;

  -- Archived departments and teams hold no active members or active teams.
  if exists (
    select 1 from organization_member m
    join department d on d.id = m.department_id
    where m.organization_id = target_org and m.active and d.archived_at is not null
  ) or exists (
    select 1 from team t
    join department d on d.id = t.department_id
    where t.organization_id = target_org and t.archived_at is null and d.archived_at is not null
  ) then
    raise exception 'An archived department still has active members or teams'
      using errcode = 'check_violation', constraint = 'org_department_archived';
  end if;

  if exists (
    select 1 from team_member tm
    join team t on t.id = tm.team_id
    join organization_member m
      on m.organization_id = tm.organization_id and m.user_id = tm.user_id
    where tm.organization_id = target_org and t.archived_at is not null and m.active
  ) then
    raise exception 'An archived team still has active members'
      using errcode = 'check_violation', constraint = 'org_team_archived';
  end if;
end;
$$;

-- SECURITY DEFINER so the check sees the whole organization, not just the
-- rows the writing user's RLS shows them. It only reads, and clients can't
-- call it directly (execute is revoked below; triggers don't need it).
create or replace function check_org_directory_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform check_org_directory(coalesce(new.organization_id, old.organization_id));
  return null;
end;
$$;

-- Internal: called only by the triggers below, never by clients.
revoke execute on function lock_org_directory(), check_org_directory(uuid), check_org_directory_trigger()
  from public, anon, authenticated;

create trigger organization_member_directory_lock before insert or update or delete on organization_member
  for each row execute function lock_org_directory();
create trigger department_directory_lock before insert or update or delete on department
  for each row execute function lock_org_directory();
create trigger team_directory_lock before insert or update or delete on team
  for each row execute function lock_org_directory();
create trigger team_member_directory_lock before insert or update or delete on team_member
  for each row execute function lock_org_directory();

create constraint trigger organization_member_directory_check after insert or update or delete on organization_member
  deferrable initially deferred for each row execute function check_org_directory_trigger();
create constraint trigger department_directory_check after insert or update on department
  deferrable initially deferred for each row execute function check_org_directory_trigger();
create constraint trigger team_directory_check after insert or update on team
  deferrable initially deferred for each row execute function check_org_directory_trigger();
create constraint trigger team_member_directory_check after insert or update or delete on team_member
  deferrable initially deferred for each row execute function check_org_directory_trigger();
