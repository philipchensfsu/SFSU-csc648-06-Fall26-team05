-- E05 detail read model (Marco): the parts of GET /api/prds/{id} that a
-- plain row read can't give the caller safely.
--
-- prd_read_model(prd) returns, for a PRD the caller can view:
--   current_version         { id, version_no } of the current saved version,
--                           or null before the first save
--   project                 { id, name } of the PRD's project, or null. Only
--                           the id and name: no sibling PRDs or counts, so a
--                           viewer who can't read the project row still sees
--                           which folder the PRD is in
--   owners                  [{ id, name }] of the PRD's owners, in name order
--                           (no emails)
--   changed_since_approval  approved before and edited since (E14 helper)
-- It returns null when the caller can't see the PRD.
--
-- The approval summary (E11) and capabilities (E03) come from Vineela's
-- approval_summary and prd_capabilities, which this doesn't repeat.
--
-- Apply after 20261101032200_work_status (prd_changed_since_approval) and
-- Vineela's 20261101015824_prd_capabilities. Adds a function; no data
-- changes.

create or replace function prd_read_model(target_prd uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'current_version', (select jsonb_build_object('id', v.id, 'version_no', v.version_no)
                        from prd_version v where v.id = p.current_version_id),
    'project', (select jsonb_build_object('id', pr.id, 'name', pr.name) from project pr where pr.id = p.project_id),
    'owners', coalesce((select jsonb_agg(jsonb_build_object('id', pm.user_id, 'name', pf.full_name)
                                         order by pf.full_name nulls last, pm.user_id)
                        from prd_member pm join profile pf on pf.id = pm.user_id
                        where pm.prd_id = p.id and pm.role = 'owner'), '[]'::jsonb),
    'changed_since_approval', coalesce(prd_changed_since_approval(p.id), false)
  )
  from prd p
  where p.id = target_prd and can_view_prd(target_prd)
$$;

revoke execute on function prd_read_model(uuid) from public, anon;
grant execute on function prd_read_model(uuid) to authenticated, service_role;
