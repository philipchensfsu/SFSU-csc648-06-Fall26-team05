-- Reviewer decisions (Backend Tasks E08).
--
-- Each reviewer on a round records one decision: approved or
-- changes_requested. Requesting changes needs an explanation, which is
-- saved as a comment on the round's version and linked from the slot. An
-- approval may carry an optional note, saved the same way.
--
-- - When every reviewer has approved and nobody requested changes, the
--   round is approved and the PRD becomes final. One change request moves
--   the round to changes_requested and blocks approval, but the others can
--   still decide. The PRD stays in_review until the round is superseded
--   (S03/E09) and resubmitted.
-- - A decision applies to the round's version, which must still be the
--   PRD's current version. It locks the PRD row like a save, so nobody can
--   approve content they haven't seen.
-- - Repeating the same decision (with the same explanation) succeeds and
--   changes nothing; a different one is 409.
-- - Owners can't decide on their own PRD unless the round allowed it
--   (owner_review_allowed), even if they became an owner after submission.
-- - Each decision records one event: approved or changes_requested to the
--   owners, or, for the last approval, a single round_approved to the
--   owners and reviewers. The explanation comment doesn't add a separate
--   comment_added notification.
--
-- Errors raise P0001 with a fixed message the API maps: prd_not_found,
-- round_not_found, round_not_current, stale_version, not_a_reviewer,
-- owner_cannot_review, invalid_decision, invalid_explanation,
-- invalid_section, decision_already_made.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Apply after
-- 20261031120000_review_rounds. Adds a column and a function.

alter table review_slot
  add column comment_id uuid references prd_comment(id) on delete set null;

create or replace function decide_review(target_prd uuid, target_round uuid, target_version uuid,
                                         decision text, explanation text, target_section text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row prd%rowtype;
  round_row review_round%rowtype;
  slot_row review_slot%rowtype;
  note text := nullif(btrim(explanation), '');
  previous_note text;
  dept uuid;
  new_comment uuid;
begin
  select * into current_row from prd where id = target_prd for update;
  if not found or not can_view_prd(target_prd) then
    raise exception 'prd_not_found';
  end if;
  select * into round_row from review_round where id = target_round and prd_id = target_prd for update;
  if not found then
    raise exception 'round_not_found';
  end if;
  if round_row.state = 'superseded' then
    raise exception 'round_not_current';
  end if;
  if target_version is distinct from round_row.version_id
     or round_row.version_id is distinct from current_row.current_version_id then
    raise exception 'stale_version';
  end if;
  select * into slot_row from review_slot where round_id = target_round and reviewer_id = auth.uid() for update;
  if not found then
    raise exception 'not_a_reviewer';
  end if;
  if is_prd_owner(target_prd) and not round_row.owner_review_allowed then
    raise exception 'owner_cannot_review';
  end if;
  if decision is null or decision not in ('approved', 'changes_requested') then
    raise exception 'invalid_decision';
  end if;
  if (decision = 'changes_requested' and note is null) or char_length(explanation) > 5000 then
    raise exception 'invalid_explanation';
  end if;
  if target_section is not null and target_section not in (
    'problem', 'goals', 'non_goals', 'target_users', 'user_stories',
    'requirements', 'success_metrics', 'risks', 'open_questions'
  ) then
    raise exception 'invalid_section';
  end if;

  if slot_row.state <> 'pending' then
    select nullif(btrim(body), '') into previous_note from prd_comment where id = slot_row.comment_id;
    if slot_row.state = decision and note is not distinct from previous_note then
      return;
    end if;
    raise exception 'decision_already_made';
  end if;

  if note is not null then
    select department_id into dept from organization_member
    where organization_id = current_row.organization_id and user_id = auth.uid() and active;
    insert into prd_comment (prd_id, version_id, section_type, author_id, author_name,
                             department_id, department_name, body)
      values (target_prd, round_row.version_id, target_section, auth.uid(),
              (select full_name from profile where id = auth.uid()),
              dept, (select name from department where id = dept), explanation)
      returning id into new_comment;
  end if;

  update review_slot set state = decision, decided_at = now(), comment_id = new_comment
  where round_id = target_round and reviewer_id = auth.uid();

  if decision = 'changes_requested' then
    update review_round set state = 'changes_requested' where id = target_round and state = 'in_review';
    perform record_prd_event(target_prd, 'changes_requested', auth.uid(),
                             jsonb_build_object('round_no', round_row.round_no, 'section_type', target_section),
                             round_row.version_id, target_round, new_comment);
  elsif round_row.state = 'in_review'
        and not exists (select 1 from review_slot where round_id = target_round and state <> 'approved') then
    update review_round set state = 'approved', completed_at = now() where id = target_round;
    update prd set status = 'final' where id = target_prd;
    perform record_prd_event(target_prd, 'round_approved', auth.uid(),
                             jsonb_build_object('round_no', round_row.round_no, 'reviewer_id', auth.uid()),
                             round_row.version_id, target_round, new_comment);
  else
    perform record_prd_event(target_prd, 'approved', auth.uid(),
                             jsonb_build_object('round_no', round_row.round_no),
                             round_row.version_id, target_round, new_comment);
  end if;
end;
$$;

grant execute on function decide_review(uuid, uuid, uuid, text, text, text) to authenticated, service_role;
