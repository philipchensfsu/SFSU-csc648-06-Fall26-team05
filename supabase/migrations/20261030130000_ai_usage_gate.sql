-- Per-user AI usage gate (Backend Tasks A07, DB08).
--
-- One small row per user, updated atomically, so every serverless instance
-- sees the same state (in-process counters don't work on Vercel). Before any
-- Gemini call the backend asks for admission:
--   - a cooldown between admitted requests;
--   - one active AI request per user, held as a lease that expires, so a
--     crashed request can't block the user for good;
--   - releasing needs the lease id, so an old request that finishes late
--     can't free a newer request's lease.
-- Provider retries happen inside one admitted request, so they never wait on
-- the gate themselves. The global off switch (AI_ENABLED) is checked by the
-- backend before admission. Manual editing never touches this table.
--
-- The functions act for auth.uid(), so the backend calls them with the
-- user's own token (no service role). Calling them directly only affects the
-- caller's own gate, and a lease id never leaves the backend.

create table ai_usage_gate (
  user_id uuid primary key references profile(id) on delete cascade,
  last_admitted_at timestamptz,
  lease_id uuid,
  lease_expires_at timestamptz,
  check ((lease_id is null) = (lease_expires_at is null))
);

alter table ai_usage_gate enable row level security;
revoke all on ai_usage_gate from anon, authenticated;
grant select, insert, update, delete on ai_usage_gate to service_role;

-- Admits the caller or says why not. Returns one row:
--   lease_id set: admitted; pass it to ai_release when done.
--   refused 'busy' or 'cooldown' with retry_after in whole seconds.
create or replace function ai_admit(p_cooldown_seconds integer, p_lease_seconds integer)
returns table (lease_id uuid, refused text, retry_after integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  gate ai_usage_gate;
  new_lease uuid;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_cooldown_seconds is null or p_cooldown_seconds not between 0 and 3600
     or p_lease_seconds is null or p_lease_seconds not between 10 and 3600 then
    raise exception 'Invalid gate settings' using errcode = '22023';
  end if;

  insert into ai_usage_gate (user_id) values (caller) on conflict (user_id) do nothing;
  -- Concurrent admissions for one user queue here.
  select * into gate from ai_usage_gate where user_id = caller for update;

  if gate.lease_id is not null and gate.lease_expires_at > now() then
    return query select null::uuid, 'busy'::text,
      greatest(1, ceil(extract(epoch from gate.lease_expires_at - now())))::integer;
    return;
  end if;
  if gate.last_admitted_at is not null
     and gate.last_admitted_at + make_interval(secs => p_cooldown_seconds) > now() then
    return query select null::uuid, 'cooldown'::text,
      greatest(1, ceil(extract(epoch from gate.last_admitted_at
                                        + make_interval(secs => p_cooldown_seconds) - now())))::integer;
    return;
  end if;

  -- Free, or the previous lease expired (a crashed request): take it over.
  new_lease := gen_random_uuid();
  update ai_usage_gate
  set last_admitted_at = now(),
      lease_id = new_lease,
      lease_expires_at = now() + make_interval(secs => p_lease_seconds)
  where user_id = caller;
  return query select new_lease, null::text, null::integer;
end;
$$;

-- Ends the caller's request. Only the current lease can be released, so a
-- request whose lease expired and was taken over can't free the new one.
-- Returns whether it released anything.
create or replace function ai_release(p_lease_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update ai_usage_gate
  set lease_id = null, lease_expires_at = null
  where user_id = auth.uid() and lease_id = p_lease_id;
  return found;
end;
$$;

revoke execute on function ai_admit(integer, integer), ai_release(uuid) from public, anon;
grant execute on function ai_admit(integer, integer), ai_release(uuid) to authenticated, service_role;
