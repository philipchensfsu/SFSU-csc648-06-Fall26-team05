-- Feature 04: link a Discord account to a Nautilus account, for the Discord bot.
--
-- Decided by Vineela on 2026-11-18:
-- - Account linking. A signed-in user creates a one-time code in Nautilus and
--   runs /link <code> in Discord; the bot sends the code and the Discord user
--   id to the backend, which stores the pair. Bot requests then run as the
--   linked user (the backend signs a short-lived token for them), so RLS still
--   decides what they see. The bot itself is Marco's (app/discord-bot/).
--
-- Link codes:
-- - 12 characters from the join-code alphabet (new_join_code, about 59 bits),
--   matched like join codes (normalize_join_code: any case, dashes, spaces).
-- - Stored only as a SHA-256 hash, valid for 10 minutes, used once. One per
--   person: a new code replaces the previous one.
--
-- Links:
-- - One Discord account per Nautilus account and the other way round.
--   Redeeming a code replaces the person's previous link, and moves a Discord
--   account that was linked to someone else (whoever runs /link controls
--   both accounts at that moment).
-- - A person can read and delete their own link (unlinking). Nobody writes
--   links directly: only redeem_discord_link_code, which only the backend's
--   service role may call, after it has checked the bot's secret.
-- - Linking grants nothing: access is checked when the bot uses the link.
--
-- Errors raise P0001 with a fixed message the API maps: not_authenticated,
-- invalid_link_code (unknown, used or expired), invalid_discord_user.
--
-- Apply after 20261116015652_progress_report. Adds two tables and two
-- functions; changes no rows.

create table discord_link (
  profile_id uuid primary key references profile(id) on delete cascade,
  -- A Discord user id (a "snowflake"): 17 to 20 digits.
  discord_user_id text not null unique check (discord_user_id ~ '^[1-9][0-9]{16,19}$'),
  linked_at timestamptz not null default now()
);

create table discord_link_code (
  profile_id uuid primary key references profile(id) on delete cascade,
  code_hash bytea not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table discord_link enable row level security;
alter table discord_link_code enable row level security;

revoke all on discord_link, discord_link_code from public, anon, authenticated;

-- People see and remove only their own link. Codes have no client access.
grant select, delete on discord_link to authenticated;
create policy discord_link_select_own on discord_link for select to authenticated
  using (profile_id = auth.uid());
create policy discord_link_delete_own on discord_link for delete to authenticated
  using (profile_id = auth.uid());

-- The backend looks links up for bot requests.
grant select on discord_link to service_role;

-- A new code for the caller, replacing any earlier one. Returns the code
-- itself only this once.
create or replace function create_discord_link_code()
returns table (code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_code text := new_join_code();
  expiry timestamptz := now() + interval '10 minutes';
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;
  insert into discord_link_code (profile_id, code_hash, expires_at)
  values (caller, extensions.digest(new_code, 'sha256'), expiry)
  on conflict (profile_id) do update
    set code_hash = excluded.code_hash, expires_at = excluded.expires_at, created_at = now();
  return query select new_code, expiry;
end;
$$;

-- Uses up a code and links the Discord account to its owner. Returns the
-- linked profile id. The backend calls it for the bot (service role only).
create or replace function redeem_discord_link_code(p_code text, p_discord_user_id text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed discord_link_code;
begin
  if p_discord_user_id is null or p_discord_user_id !~ '^[1-9][0-9]{16,19}$' then
    raise exception 'invalid_discord_user';
  end if;
  -- Two redeems of the same code: the second waits here, then finds it gone.
  select * into claimed from discord_link_code
  where code_hash = extensions.digest(normalize_join_code(p_code), 'sha256')
  for update;
  if not found or claimed.expires_at <= now() then
    raise exception 'invalid_link_code';
  end if;
  delete from discord_link_code where profile_id = claimed.profile_id;

  -- Serializes links of the same Discord account, so the unique check never
  -- surfaces as an error from a race.
  perform pg_advisory_xact_lock(hashtextextended('discord_link:' || p_discord_user_id, 0));
  delete from discord_link where discord_user_id = p_discord_user_id and profile_id <> claimed.profile_id;
  insert into discord_link (profile_id, discord_user_id) values (claimed.profile_id, p_discord_user_id)
  on conflict (profile_id) do update set discord_user_id = excluded.discord_user_id, linked_at = now();
  return claimed.profile_id;
end;
$$;

revoke execute on function create_discord_link_code(), redeem_discord_link_code(text, text)
  from public, anon, authenticated;
grant execute on function create_discord_link_code() to authenticated;
grant execute on function redeem_discord_link_code(text, text) to service_role;
