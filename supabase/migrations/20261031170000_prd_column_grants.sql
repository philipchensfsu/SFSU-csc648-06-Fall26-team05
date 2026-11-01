-- Clients can't forge a PRD's status, version pointer or ownership
-- (Backend Tasks S02, Decision 6).
--
-- Signed-in users could insert and update every column of prd through the
-- Data API, so anyone who could edit a PRD could set status = 'final'
-- (skipping review), point current_version_id at another version, or
-- rewrite owner_id. Now clients may write only what the API's own routes
-- send:
--   insert: id, title, description, owner_id, organization_id, project_id
--           (RLS still checks owner_id, the organization and the project)
--   update: title, description, content_json, content_text,
--           doc_schema_version, project_id, revision, ydoc_state
-- status, current_version_id, owner_id and organization_id change only
-- through our SECURITY DEFINER functions (S03 save, E07/E08 review), which
-- these grants don't affect. created_at and updated_at stay server-set.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Changes grants, not rows.
-- Pre-check: nothing else writes prd with a user's token (the frontend
-- goes through the API).

revoke insert, update on prd from authenticated;
grant insert (id, title, description, owner_id, organization_id, project_id) on prd to authenticated;
grant update (title, description, content_json, content_text, doc_schema_version, project_id, revision, ydoc_state)
  on prd to authenticated;
