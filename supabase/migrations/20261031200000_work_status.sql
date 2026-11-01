-- E14 work status after approval (Marco), on Vineela's review rounds (#93/#94).
--
-- work_status tracks whether people are working on an approved PRD. It's
-- separate from review state: changing it never advances the revision,
-- creates a version or touches a review (Decision 9: work status isn't an
-- edit).
--
-- - Values: not_started (default), in_progress, done. Allowed changes:
--   not_started -> in_progress, in_progress -> done, done -> in_progress.
-- - Only while the PRD is approved (status final or assigned). After an edit
--   to an approved PRD (E09 sends it back to in_review), the value is kept
--   but frozen until it's approved again; prd_changed_since_approval reports
--   that state.
-- - Who: the PRD's owners and admins of its organization. Decided for M3 by
--   Vineela and Marco on 2026-10-31: v1.2 also allows assigned implementers,
--   but implementer assignments are deferred, so they're not included.
-- - set_prd_work_status is compare-and-set: the caller sends the status they
--   saw (from) and the new one (to); a different current status is
--   stale_work_status. It locks the PRD row like a save and records one
--   work_status_changed event through record_prd_event (#91), which notifies
--   the owners when the new status is done.
-- - Clients can't write the column directly: a trigger lets it change only
--   inside set_prd_work_status.
--
-- Errors raise P0001 with a fixed message the API maps: prd_not_found,
-- work_status_forbidden, not_approved, stale_work_status,
-- invalid_work_status, invalid_transition.
--
-- Apply after 20261031190000_e09_reapproval (and Vineela's review migrations).
-- Adds a column (default not_started for every PRD), a trigger and three
-- functions; no other data changes.

alter table prd
  add column work_status text not null default 'not_started'
    check (work_status in ('not_started', 'in_progress', 'done'));

-- Only set_prd_work_status changes work_status; it sets this flag for its
-- own transaction.
create or replace function guard_prd_work_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.work_status is distinct from old.work_status
     and coalesce(current_setting('nautilus.work_status_write', true), '') <> 'on' then
    raise exception 'work_status changes only through set_prd_work_status' using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

create trigger prd_work_status_guard before update of work_status on prd
  for each row execute function guard_prd_work_status();

-- True when the PRD was approved before and has been edited since, so it's
-- waiting for approval again (E08 marks an approved round's completed_at;
-- E09 supersedes it on the edit).
create or replace function prd_changed_since_approval(target_prd uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p.status not in ('final', 'assigned')
         and exists (select 1 from review_round r
                     where r.prd_id = p.id and r.state = 'superseded' and r.completed_at is not null)
  from prd p
  where p.id = target_prd and can_view_prd(target_prd)
$$;

-- Whether the caller may change the work status right now.
create or replace function can_update_work_status(target_prd uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((is_prd_owner(target_prd) or is_prd_org_admin(target_prd))
                  and (select status in ('final', 'assigned') from prd where id = target_prd), false)
$$;

create or replace function set_prd_work_status(target_prd uuid, from_status text, to_status text)
returns prd
language plpgsql
security definer
set search_path = public
as $$
declare
  current_row prd%rowtype;
  saved prd%rowtype;
begin
  select * into current_row from prd where id = target_prd for update;
  if not found or not can_view_prd(target_prd) then
    raise exception 'prd_not_found';
  end if;
  if not (is_prd_owner(target_prd) or is_prd_org_admin(target_prd)) then
    raise exception 'work_status_forbidden';
  end if;
  if to_status is null or to_status not in ('not_started', 'in_progress', 'done')
     or from_status is null or from_status not in ('not_started', 'in_progress', 'done') then
    raise exception 'invalid_work_status';
  end if;
  if current_row.status not in ('final', 'assigned') then
    raise exception 'not_approved';
  end if;
  if current_row.work_status <> from_status then
    raise exception 'stale_work_status';
  end if;
  if (from_status, to_status) not in (('not_started', 'in_progress'), ('in_progress', 'done'),
                                      ('done', 'in_progress')) then
    raise exception 'invalid_transition';
  end if;

  perform set_config('nautilus.work_status_write', 'on', true);
  update prd set work_status = to_status where id = target_prd returning * into saved;
  perform set_config('nautilus.work_status_write', '', true);

  perform record_prd_event(target_prd, 'work_status_changed', auth.uid(),
                           jsonb_build_object('from', from_status, 'to', to_status, 'status', to_status));
  return saved;
end;
$$;

revoke execute on function guard_prd_work_status() from public, anon, authenticated;
revoke execute on function prd_changed_since_approval(uuid), can_update_work_status(uuid),
  set_prd_work_status(uuid, text, text) from public, anon;
grant execute on function prd_changed_since_approval(uuid), can_update_work_status(uuid),
  set_prd_work_status(uuid, text, text) to authenticated, service_role;
