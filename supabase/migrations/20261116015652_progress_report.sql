-- Feature 10: the progress report's numbers and recent activity.
--
-- progress_report(team, project, owner, activity_limit) runs as the caller
-- (security invoker), so RLS limits it to the PRDs they can see: their own
-- PRDs, or every PRD of their organization for an org admin. The optional
-- filters narrow it further:
-- - team: the PRD's owning team (A08);
-- - project: the PRD's folder;
-- - owner: PRDs this person owns (a PRD with several owners counts for each).
--
-- It returns one jsonb object: the total; counts by status, work status and
-- priority; per-owner and per-owning-team counts by status; and the latest
-- events on those PRDs (newest first, at most activity_limit, 1–50). Names of
-- owners come from the directory in the API; team names come from team.
--
-- "Overdue" waits for the milestone decision (feature 10).
--
-- Apply after 20261102120000_ai_revision_proposals. Adds one function;
-- changes no rows.

create or replace function progress_report(p_team uuid default null, p_project uuid default null,
                                           p_owner uuid default null, p_activity_limit integer default 20)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with visible as (
    select p.id, p.title, p.status, p.work_status, p.priority, p.owning_team_id
    from prd p
    where (p_team is null or p.owning_team_id = p_team)
      and (p_project is null or p.project_id = p_project)
      and (p_owner is null or exists (select 1 from prd_member m
                                      where m.prd_id = p.id and m.user_id = p_owner and m.role = 'owner'))
  ),
  owners as (
    select m.user_id, v.status from visible v join prd_member m on m.prd_id = v.id and m.role = 'owner'
  ),
  activity as (
    select e.id, e.prd_id, v.title as prd_title, e.event_type, e.actor_id, e.actor_name, e.payload,
           e.version_id, e.round_id, e.comment_id, e.created_at
    from prd_event e join visible v on v.id = e.prd_id
    order by e.created_at desc, e.id desc
    limit greatest(1, least(coalesce(p_activity_limit, 20), 50))
  )
  select jsonb_build_object(
    'total', (select count(*) from visible),
    'by_status', (select coalesce(jsonb_object_agg(status, n), '{}')
                  from (select status, count(*) n from visible group by status) s),
    'by_work_status', (select coalesce(jsonb_object_agg(work_status, n), '{}')
                       from (select work_status, count(*) n from visible group by work_status) s),
    'by_priority', (select coalesce(jsonb_object_agg(coalesce(priority, 'none'), n), '{}')
                    from (select priority, count(*) n from visible group by priority) s),
    'by_owner', (select coalesce(jsonb_agg(o order by o.total desc, o.user_id), '[]') from (
                   select user_id, count(*) total, jsonb_object_agg(status, n) by_status
                   from (select user_id, status, count(*) n from owners group by user_id, status) s
                   group by user_id) o),
    'by_team', (select coalesce(jsonb_agg(t order by t.total desc, t.team_name nulls last), '[]') from (
                  select s.owning_team_id team_id, tm.name team_name, sum(s.n) total,
                         jsonb_object_agg(s.status, s.n) by_status
                  from (select owning_team_id, status, count(*) n from visible group by owning_team_id, status) s
                  left join team tm on tm.id = s.owning_team_id
                  group by s.owning_team_id, tm.name) t),
    'activity', (select coalesce(jsonb_agg(a order by a.created_at desc, a.id desc), '[]') from activity a)
  )
$$;

revoke execute on function progress_report(uuid, uuid, uuid, integer) from public, anon;
grant execute on function progress_report(uuid, uuid, uuid, integer) to authenticated, service_role;
