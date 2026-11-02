-- Whether the caller can ask for revision suggestions from review feedback
-- (E12, POST /api/prds/{id}/review-suggestions), for the capability flag
-- can_request_review_suggestions.
--
-- True only when the route could succeed for this caller now:
-- - they're an owner of the PRD (E12 is owner-only, Backend Tasks v1.2;
--   broader than can_request_ai, which covers generate and section edits);
-- - the PRD has a saved version in the v2 format (the route answers
--   document_not_v2 otherwise);
-- - there's at least one comment on that current version (feedback must be
--   current-version comments).
-- AI being switched on or configured isn't known here: the route still
-- answers ai_disabled / ai_unavailable when it isn't.
--
-- Apply after the comments migration (20261031110000) and the PRD member
-- helpers. Adds a function; no data changes.

create or replace function can_request_review_suggestions(target_prd uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select is_prd_owner(p.id)
           and p.current_version_id is not null
           and p.doc_schema_version = 2
           and exists (select 1 from prd_comment c where c.prd_id = p.id and c.version_id = p.current_version_id)
    from prd p
    where p.id = target_prd and can_view_prd(target_prd)
  ), false)
$$;

revoke execute on function can_request_review_suggestions(uuid) from public, anon;
grant execute on function can_request_review_suggestions(uuid) to authenticated, service_role;
