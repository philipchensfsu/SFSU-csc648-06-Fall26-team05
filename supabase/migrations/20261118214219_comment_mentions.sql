-- Feature 07: @mentions in PRD comments.
--
-- Decided by Vineela on 2026-11-15:
-- - Only people who can view the PRD can be mentioned (its members and org
--   admins). Anyone else rejects the whole comment (mention_without_access);
--   being mentioned never grants access.
-- - A comment with mentions records two events: comment_added as before
--   (owners and editors, batched), leaving out the people mentioned, and one
--   mentioned event that notifies each of them at once, never batched. So
--   nobody gets two notifications for one comment.
--
-- add_prd_comment gains `mentioned uuid[]` (default none, at most 20,
-- duplicates ignored). Mentioning yourself is allowed and notifies no one.
-- The mentioned person's name is copied at posting time, like the author's.
-- Mentions are stored in prd_comment_mention, readable by anyone who can
-- view the PRD.
--
-- Errors raise P0001 with a fixed message the API maps: the existing ones,
-- plus too_many_mentions and mention_without_access.
--
-- Apply after 20261116003328_team_assignment. Adds a table, replaces the
-- event_type check (adds mentioned), record_prd_event (mentioned recipients,
-- and comment_added leaves out the people mentioned) and add_prd_comment (a
-- new parameter, so the old four-argument version is dropped). Changes no rows.

create table prd_comment_mention (
  comment_id uuid not null references prd_comment(id) on delete cascade,
  user_id uuid not null references profile(id) on delete cascade,
  prd_id uuid not null references prd(id) on delete cascade,
  -- The person's name when they were mentioned.
  user_name text,
  primary key (comment_id, user_id)
);

create index prd_comment_mention_user on prd_comment_mention (user_id);

alter table prd_comment_mention enable row level security;

create policy "view mentions on visible prds" on prd_comment_mention
  for select using (can_view_prd(prd_id));

revoke all on prd_comment_mention from anon, authenticated;
grant select on prd_comment_mention to authenticated;
grant select, insert, update, delete on prd_comment_mention to service_role;

alter table prd_event drop constraint prd_event_event_type_check;
alter table prd_event add constraint prd_event_event_type_check check (event_type in (
  'created', 'version_saved', 'ai_applied',
  'member_added', 'member_role_changed', 'member_removed', 'team_added',
  'comment_added', 'mentioned', 'submitted', 'approved', 'changes_requested', 'round_approved', 'superseded',
  'work_status_changed'
));

-- As in 20261116003328_team_assignment, plus mentioned (the people in
-- payload.user_ids), and comment_added no longer notifies the people in
-- payload.mentioned_user_ids (they get the mentioned event instead).
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
      array(select user_id from prd_member where prd_id = p_prd_id and role in ('owner', 'editor')
              and user_id::text not in (
                select jsonb_array_elements_text(coalesce(p_payload -> 'mentioned_user_ids', '[]'))))
    when 'mentioned' then
      array(select jsonb_array_elements_text(coalesce(p_payload -> 'user_ids', '[]'))::uuid)
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

drop function add_prd_comment(uuid, uuid, text, text);

-- As in 20261031110000_prd_comments, plus mentions.
create function add_prd_comment(target_prd uuid, target_version uuid, target_section text, comment_body text,
                                mentioned uuid[] default '{}')
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row prd%rowtype;
  dept uuid;
  new_comment uuid;
  people uuid[] := array(select distinct u from unnest(coalesce(mentioned, '{}')) u where u is not null);
  event_payload jsonb;
begin
  select * into current_row from prd where id = target_prd for share;
  if not found or not can_view_prd(target_prd) then
    raise exception 'prd_not_found';
  end if;
  if current_row.current_version_id is null then
    raise exception 'no_saved_version';
  end if;
  if target_version is distinct from current_row.current_version_id then
    raise exception 'stale_version';
  end if;
  if target_section is not null and target_section not in (
    'problem', 'goals', 'non_goals', 'target_users', 'user_stories',
    'requirements', 'success_metrics', 'risks', 'open_questions'
  ) then
    raise exception 'invalid_section';
  end if;
  if comment_body is null or btrim(comment_body) = '' or char_length(comment_body) > 5000 then
    raise exception 'invalid_body';
  end if;
  if cardinality(people) > 20 then
    raise exception 'too_many_mentions';
  end if;
  if exists (select 1 from unnest(people) u where not can_view_prd_as(u, target_prd)) then
    raise exception 'mention_without_access';
  end if;

  select department_id into dept from organization_member
  where organization_id = current_row.organization_id and user_id = auth.uid() and active;

  insert into prd_comment (prd_id, version_id, section_type, author_id, author_name,
                           department_id, department_name, body)
    values (target_prd, target_version, target_section, auth.uid(),
            (select full_name from profile where id = auth.uid()),
            dept, (select name from department where id = dept), comment_body)
    returning id into new_comment;

  insert into prd_comment_mention (comment_id, user_id, prd_id, user_name)
    select new_comment, u, target_prd, (select full_name from profile where id = u) from unnest(people) u;

  event_payload := jsonb_build_object('section_type', target_section);
  if cardinality(people) > 0 then
    event_payload := event_payload || jsonb_build_object('mentioned_user_ids', to_jsonb(people));
  end if;
  perform record_prd_event(target_prd, 'comment_added', auth.uid(), event_payload,
                           target_version, null, new_comment);
  if cardinality(people) > 0 then
    perform record_prd_event(target_prd, 'mentioned', auth.uid(),
                             jsonb_build_object('section_type', target_section, 'user_ids', to_jsonb(people)),
                             target_version, null, new_comment);
  end if;
  return new_comment;
end;
$$;

revoke execute on function add_prd_comment(uuid, uuid, text, text, uuid[]) from public, anon;
grant execute on function add_prd_comment(uuid, uuid, text, text, uuid[]) to authenticated, service_role;
