-- Conversational AI revisions (POST /api/prds/{id}/ai-revisions, team
-- agreement 2026-11-02): a proposal that may change several sections after a
-- chat, staged like section edits and review suggestions.
--
-- Adds 'ai_revision' to the proposal kinds an ai_proposal row may have. The
-- staging (ai_record_generation), taking (ai_take_proposal) and rejecting
-- functions don't depend on the kind, so nothing else changes here; the
-- backend's records.PROPOSAL_KINDS and acceptance.ACCEPTED_KINDS list it too.
--
-- Apply after the AI records migration (20261030121000). Replaces one check
-- constraint; no data changes (every existing row has one of the old kinds).

alter table ai_proposal drop constraint ai_proposal_kind_check;
alter table ai_proposal add constraint ai_proposal_kind_check
  check (kind in ('generate', 'ai_edit', 'review_suggestion', 'ai_revision'));
