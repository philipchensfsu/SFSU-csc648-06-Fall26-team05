-- Feature 02: add a whole team to a PRD at once.
--
-- Decided by Vineela on 2026-11-15:
-- - Snapshot: the team's current active members are added as ordinary
--   prd_member rows, once. People who join the team later get nothing, and
--   everyone added is managed individually afterwards. can_view_prd and RLS
--   don't change.
-- - Editor or viewer only: owners stay a per-person choice.
-- - One team_added event per call. Each person actually added gets one
--   notification from it.
--
-- add_team_to_prd(prd, team, role):
-- - Owners and org admins of the PRD's organization (lock_managed_prd, which
--   also takes the PRD lock, so it serializes with every other member write).
-- - The team must be in the PRD's organization and not archived.
-- - Inactive organization members are left out.
-- - Anyone already on the PRD is skipped, whatever their role: never
--   downgraded, never upgraded.
-- - Returns { added: [user_id], skipped: [user_id] }. When nobody is added
--   (an empty team, or everyone is already on it), nothing is recorded, so a
--   repeated request makes no second event.
--
-- Errors raise P0001 with a fixed message the API maps: prd_not_found,
-- prd_manage_forbidden, invalid_team_role, team_not_found.
--
-- Apply after 20261102120000_ai_revision_proposals. Replaces the event_type
-- check (adds team_added) and record_prd_event (adds its recipients), and adds
-- one function. Changes no rows.

alter table prd_event drop constraint prd_event_event_type_check;
alter table prd_event add constraint prd_event_event_type_check check (event_type in (
  'created', 'version_saved', 'ai_applied',
  'member_added', 'member_role_changed', 'member_removed', 'team_added',
  'comment_added', 'submitted', 'approved', 'changes_requested', 'round_approved', 'superseded',
  'work_status_changed'
));

-- As in 20261031120000_review_rounds, plus team_added: the people it added.
create or replace function record_prd_event(
  p_prd_id uuid,
  p_event_type text,
  p_actor uuid,
  p_payload jsonb default '{}',
  p_version_id uuid default null,
  p_round_id uuid default null,
  p_comment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_event uuid;
  owners uuid[] := array(select user_id from prd_member where prd_id = p_prd_id and role = 'owner');
  round_reviewers uuid[] := array(select reviewer_id from review_slot where round_id = p_round_id);
  recipients uuid[];
begin
  insert into prd_event (prd_id, event_type, actor_id, actor_name, payload, version_id, round_id, comment_id)
    values (p_prd_id, p_event_type, p_actor, (select full_name from profile where id = p_actor),
            coalesce(p_payload, '{}'), p_version_id, p_round_id, p_comment_id)
    returning id into new_event;

  recipients := case p_event_type
    when 'member_added' then array[(p_payload ->> 'user_id')::uuid]
    when 'member_role_changed' then array[(p_payload ->> 'user_id')::uuid]
    when 'team_added' then
      array(select jsonb_array_elements_text(coalesce(p_payload -> 'user_ids', '[]'))::uuid)
    when 'comment_added' then
      array(select user_id from prd_member where prd_id = p_prd_id and role in ('owner', 'editor'))
    when 'submitted' then round_reviewers
    when 'approved' then owners
    when 'changes_requested' then owners
    when 'round_approved' then owners || round_reviewers
    when 'superseded' then
      array(select r from unnest(round_reviewers) r
            where r::text in (select jsonb_array_elements_text(coalesce(p_payload -> 'reviewer_ids', '[]'))))
    when 'work_status_changed' then case when p_payload ->> 'status' = 'done' then owners else '{}' end
    else '{}'
  end;

  recipients := array(select distinct r from unnest(recipients) r
                      where r is not null and r is distinct from p_actor and can_view_prd_as(r, p_prd_id));

  perform notify_recipients(new_event, p_prd_id, p_event_type, p_actor, recipients);
  return new_event;
end;
$$;

create or replace function add_team_to_prd(target_prd uuid, target_team uuid, new_role text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  org uuid := lock_managed_prd(target_prd);
  team_name text;
  people uuid[];
  added uuid[];
  skipped uuid[];
begin
  if new_role is null or new_role not in ('editor', 'viewer') then
    raise exception 'invalid_team_role';
  end if;
  select name into team_name from team
  where id = target_team and organization_id = org and archived_at is null;
  if team_name is null then
    raise exception 'team_not_found';
  end if;

  people := array(
    select tm.user_id
    from team_member tm
    join organization_member om
      on om.organization_id = tm.organization_id and om.user_id = tm.user_id and om.active
    where tm.team_id = target_team and tm.organization_id = org
    order by tm.created_at, tm.user_id);
  skipped := array(select u from unnest(people) u
                   where exists (select 1 from prd_member where prd_id = target_prd and user_id = u));
  added := array(select u from unnest(people) u where not u = any(skipped));

  if cardinality(added) > 0 then
    insert into prd_member (prd_id, user_id, role, granted_by)
      select target_prd, u, new_role, auth.uid() from unnest(added) u;
    perform record_prd_event(target_prd, 'team_added', auth.uid(),
                             jsonb_build_object('team_id', target_team, 'team_name', team_name,
                                                'role', new_role, 'user_ids', to_jsonb(added)));
  end if;

  return jsonb_build_object('added', to_jsonb(added), 'skipped', to_jsonb(skipped));
end;
$$;

revoke execute on function add_team_to_prd(uuid, uuid, text) from public, anon;
grant execute on function add_team_to_prd(uuid, uuid, text) to authenticated, service_role;
