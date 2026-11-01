-- What the caller may do with a PRD (Backend Tasks E03, capability fields).
--
-- prd_capabilities answers, for the signed-in caller, the questions the
-- frontend needs to show or hide buttons. Every flag comes from the same
-- helpers the routes and RLS policies use, so the flags can't promise
-- something the API then refuses:
--
--   can_view, can_comment  can see the PRD (viewers comment too)
--   can_edit               can_edit_prd (owner, editor, org admin); once
--                          the PRD is approved (final, assigned), owners only
--   can_delete, can_assign can_manage_prd (owner, org admin): delete, manage
--                          people, choose reviewers
--   can_submit_review      can_manage_prd, a saved, non-empty version, and
--                          no review round open (submit_prd_review's checks)
--   can_approve            an undecided slot on the current round, still on
--                          the PRD's current version, and not an owner the
--                          round bars (decide_review's checks)
--   can_request_ai         same as can_edit (the generation route's check;
--                          Marco to confirm for the other AI routes)
--
-- Marco adds can_update_work_status, can_request_classification and
-- can_set_routing with E14 and A08.
--
-- Returns null when the caller can't see the PRD.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Apply after
-- 20261101014220_org_member_admin. Adds a function.

create or replace function prd_capabilities(target_prd uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  current_row prd%rowtype;
  can_edit boolean;
  can_manage boolean;
  open_round review_round%rowtype;
begin
  select * into current_row from prd where id = target_prd;
  if not found or not can_view_prd(target_prd) then
    return null;
  end if;
  -- After approval only owners edit (Decision 9; E09's save refuses others).
  can_edit := can_edit_prd(target_prd)
              and (current_row.status not in ('final', 'assigned') or is_prd_owner(target_prd));
  can_manage := can_manage_prd(target_prd);
  select * into open_round from review_round where prd_id = target_prd and state <> 'superseded';

  return jsonb_build_object(
    'can_view', true,
    'can_comment', true,
    'can_edit', can_edit,
    'can_delete', can_manage,
    'can_assign', can_manage,
    'can_submit_review', can_manage and open_round.id is null
      and coalesce(jsonb_array_length((select content_json -> 'content' from prd_version
                                       where id = current_row.current_version_id)), 0) > 0,
    'can_approve', coalesce(
      open_round.state in ('in_review', 'changes_requested')
      and open_round.version_id = current_row.current_version_id
      and exists (select 1 from review_slot
                  where round_id = open_round.id and reviewer_id = auth.uid() and state = 'pending')
      and (open_round.owner_review_allowed or not is_prd_owner(target_prd)),
      false),
    'can_request_ai', can_edit
  );
end;
$$;

grant execute on function prd_capabilities(uuid) to authenticated, service_role;
