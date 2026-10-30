-- Join codes: how members sign up into an existing organization.
--
-- Each organization has a random join code. Admins see it and share it, and
-- can regenerate it (the old code stops working). The member sign-up uses
-- join_organization(code) to join as a member with no department or team;
-- admins place them later if the organization uses those.
--
-- Codes are 12 characters from an alphabet without look-alikes (no 0/O,
-- 1/I/L), about 59 bits, so they can't be guessed. Only admins can read
-- them: members keep reading every other organization column.
--
-- A deactivated member can't rejoin with the code; an admin reactivates them.
--
-- Applied to the hosted database by hand (docs/local-development.md,
-- "Applying a migration to the hosted database"). Gives existing
-- organizations a code; changes no other rows.

create or replace function new_join_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  bytes bytea;
  code text := '';
  i int := 0;
begin
  -- Only bytes below 248 (8 x 31) are used, so every character is equally likely.
  while length(code) < 12 loop
    if i % 32 = 0 then
      bytes := extensions.gen_random_bytes(32);
    end if;
    if get_byte(bytes, i % 32) < 248 then
      code := code || substr(alphabet, 1 + get_byte(bytes, i % 32) % 31, 1);
    end if;
    i := i + 1;
  end loop;
  return code;
end;
$$;

alter table organization add column join_code text unique default new_join_code();
update organization set join_code = new_join_code() where join_code is null;
alter table organization alter column join_code set not null;

-- Members read every column except join_code.
revoke select on organization from authenticated;
grant select (id, name, created_by, created_at, updated_at) on organization to authenticated;

-- "k7qx-m2pa 9dzr" and "K7QXM2PA9DZR" are the same code.
create or replace function normalize_join_code(code text)
returns text
language sql
immutable
as $$
  select upper(regexp_replace(coalesce(code, ''), '[^A-Za-z0-9]', '', 'g'))
$$;

-- The code, for an admin of the organization; null for anyone else.
create or replace function org_join_code(target_org uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select join_code from organization where id = target_org and is_org_admin(target_org)
$$;

-- A new code for an admin of the organization; null for anyone else.
create or replace function regenerate_join_code(target_org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text;
begin
  if not is_org_admin(target_org) then
    return null;
  end if;
  update organization set join_code = new_join_code() where id = target_org returning join_code into code;
  return code;
end;
$$;

-- Joins the caller to the organization with this code, as a member.
-- Raises invalid_join_code (no such code) or membership_inactive (the caller
-- was deactivated there). Joining again while active is a no-op.
create or replace function join_organization(code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  target_org uuid;
  was_active boolean;
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = 'insufficient_privilege';
  end if;
  select id into target_org from organization where join_code = normalize_join_code(code);
  if target_org is null then
    raise exception 'invalid_join_code';
  end if;
  select active into was_active from organization_member where organization_id = target_org and user_id = caller;
  if was_active is false then
    raise exception 'membership_inactive';
  end if;
  if was_active is null then
    -- A concurrent join by the same user is a no-op too.
    insert into organization_member (organization_id, user_id, access_role) values (target_org, caller, 'member')
      on conflict (organization_id, user_id) do nothing;
  end if;
  return target_org;
end;
$$;

grant execute on function org_join_code(uuid), regenerate_join_code(uuid), join_organization(text)
  to authenticated, service_role;
