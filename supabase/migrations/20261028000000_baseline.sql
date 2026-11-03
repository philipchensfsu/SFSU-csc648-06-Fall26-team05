-- Baseline: the schema as of develop 90ec415, copied verbatim from
-- app/backend/schema.sql so `supabase db reset` can rebuild a local
-- database from scratch. Later changes go in new, timestamped migrations.
-- This file is for local and test databases; the hosted database already
-- has this schema and must not have it applied again.

-- Schema V2 for the AI PRD-generation tool (Milestone 2).
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query).
-- Replaces the M0 placeholder schema (profiles/prds) with the full set of
-- tables from Data Definitions V2: profile, project, prd, intake_answer,
-- attachment, prd_context, source, prd_version, generation_record.
--
-- Judgment calls made while implementing the spec (flag for team review):
--   * Engineer visibility into a PRD's child rows (intake_answer, attachment,
--     prd_context, source, prd_version, generation_record) mirrors visibility
--     into the parent prd itself (status final/assigned). The spec doesn't
--     split this out per-table, so this is the simplest consistent default.
--   * Engineer access to prd uses the status-rule option (final/assigned)
--     rather than a dedicated prd_access table, per the "defer sharing unless
--     needed for M2" decision.
--   * All owner_id/profile FKs cascade on delete for consistency with the
--     rest of the spec's cascade behavior; revisit if orphaning turns out to
--     be preferable for audit/history tables like prd_version.
--   * classification_suggestion and comment (Phase 2/3) are intentionally
--     not created here; they're out of scope for the M2 vertical prototype.
--
-- Table grants: as of 2026-10-30 Supabase no longer auto-grants Data API
-- access to new tables in `public`, so each table grants it explicitly
-- right after enabling RLS. Grants decide whether a role can touch the
-- table at all; RLS policies still decide which rows. `anon` gets nothing
-- because every data route requires a signed-in user.

create extension if not exists pgcrypto;

-- Drop the M0 placeholder tables (empty of real data).
drop table if exists prds cascade;
drop table if exists profiles cascade;

-- Shared trigger: auto-update `updated_at` on every row update.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- =========================================================================
-- profile
-- =========================================================================
create table profile (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text check (char_length(full_name) <= 100),
  email text not null unique check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
  role text not null check (role in ('pm', 'engineer', 'admin')),
  team text check (char_length(team) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profile_set_updated_at
  before update on profile
  for each row execute function set_updated_at();

-- Auto-create a profile row whenever someone signs up through Supabase Auth.
-- Without this, a new auth.users row has no matching profile, and since
-- every RLS policy keys off profile.role, that user could authenticate but
-- couldn't create anything. Defaults new signups to 'pm' since the signup
-- form has no role picker; engineer/admin roles are assigned by an admin
-- afterward (e.g. via the Supabase dashboard) until a real admin UI exists.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profile (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    'pm'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Looks up the caller's role. SECURITY DEFINER so it can read `profile`
-- from inside that table's own RLS policies without recursing.
create or replace function current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profile where id = auth.uid()
$$;

alter table profile enable row level security;
grant select, insert, update, delete on profile to authenticated, service_role;

create policy "view own profile or admin"
  on profile for select
  using (id = auth.uid() or current_profile_role() = 'admin');

create policy "insert own profile"
  on profile for insert
  with check (id = auth.uid());

create policy "update own profile or admin"
  on profile for update
  using (id = auth.uid() or current_profile_role() = 'admin');

create policy "admin deletes profiles"
  on profile for delete
  using (current_profile_role() = 'admin');

-- =========================================================================
-- project
-- =========================================================================
create table project (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) <= 200),
  owner_id uuid not null references profile(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger project_set_updated_at
  before update on project
  for each row execute function set_updated_at();

alter table project enable row level security;
grant select, insert, update, delete on project to authenticated, service_role;

create policy "view own projects or admin"
  on project for select
  using (owner_id = auth.uid() or current_profile_role() = 'admin');

create policy "pm admin create projects"
  on project for insert
  with check (owner_id = auth.uid() and current_profile_role() in ('pm', 'admin'));

create policy "pm admin update own projects"
  on project for update
  using (
    (owner_id = auth.uid() and current_profile_role() = 'pm')
    or current_profile_role() = 'admin'
  );

create policy "pm admin delete own projects"
  on project for delete
  using (
    (owner_id = auth.uid() and current_profile_role() = 'pm')
    or current_profile_role() = 'admin'
  );

-- =========================================================================
-- prd
-- =========================================================================
create table prd (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) <= 200),
  owner_id uuid not null references profile(id) on delete cascade,
  project_id uuid references project(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'in_review', 'final', 'assigned')),
  -- FK to prd_version added below with ALTER TABLE, once prd_version exists
  -- (prd_version.prd_id references prd.id, so the two tables are circular).
  current_version_id uuid,
  content_json jsonb check (pg_column_size(content_json) <= 1048576),
  content_text text,
  ydoc_state bytea,
  doc_schema_version integer not null default 1,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger prd_set_updated_at
  before update on prd
  for each row execute function set_updated_at();

alter table prd enable row level security;
grant select, insert, update, delete on prd to authenticated, service_role;

create policy "view accessible prds"
  on prd for select
  using (
    owner_id = auth.uid()
    or current_profile_role() = 'admin'
    or (current_profile_role() = 'engineer' and status in ('final', 'assigned'))
  );

create policy "pm admin create prds"
  on prd for insert
  with check (owner_id = auth.uid() and current_profile_role() in ('pm', 'admin'));

create policy "pm admin update own prds"
  on prd for update
  using (
    (owner_id = auth.uid() and current_profile_role() = 'pm')
    or current_profile_role() = 'admin'
  );

create policy "pm admin delete own prds"
  on prd for delete
  using (
    (owner_id = auth.uid() and current_profile_role() = 'pm')
    or current_profile_role() = 'admin'
  );

-- Helpers shared by every table that hangs off a prd row.
create or replace function can_view_prd(target_prd_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from prd
    where id = target_prd_id
      and (
        owner_id = auth.uid()
        or current_profile_role() = 'admin'
        or (current_profile_role() = 'engineer' and status in ('final', 'assigned'))
      )
  )
$$;

create or replace function can_edit_prd(target_prd_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from prd
    where id = target_prd_id
      and (
        (owner_id = auth.uid() and current_profile_role() = 'pm')
        or current_profile_role() = 'admin'
      )
  )
$$;

-- =========================================================================
-- intake_answer
-- =========================================================================
create table intake_answer (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null references prd(id) on delete cascade,
  question_key text not null,
  answer_text text check (char_length(answer_text) <= 5000),
  skipped boolean not null default false,
  answered_at timestamptz not null default now(),
  unique (prd_id, question_key)
);

alter table intake_answer enable row level security;
grant select, insert, update, delete on intake_answer to authenticated, service_role;

create policy "view intake answers" on intake_answer for select using (can_view_prd(prd_id));
create policy "write intake answers" on intake_answer for insert with check (can_edit_prd(prd_id));
create policy "update intake answers" on intake_answer for update using (can_edit_prd(prd_id));
create policy "delete intake answers" on intake_answer for delete using (can_edit_prd(prd_id));

-- =========================================================================
-- attachment
-- =========================================================================
create table attachment (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null references prd(id) on delete cascade,
  file_name text not null,
  file_type text not null check (file_type in ('.txt', '.md', '.pdf', '.docx')),
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 5242880),
  storage_path text not null,
  uploaded_at timestamptz not null default now()
);

-- "Up to 5 attachments per PRD" is an application-layer check (a DB check
-- constraint can't count sibling rows); enforce it in the upload endpoint.

alter table attachment enable row level security;
grant select, insert, update, delete on attachment to authenticated, service_role;

create policy "view attachments" on attachment for select using (can_view_prd(prd_id));
create policy "write attachments" on attachment for insert with check (can_edit_prd(prd_id));
create policy "update attachments" on attachment for update using (can_edit_prd(prd_id));
create policy "delete attachments" on attachment for delete using (can_edit_prd(prd_id));

-- =========================================================================
-- prd_context
-- =========================================================================
create table prd_context (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null unique references prd(id) on delete cascade,
  context_json jsonb not null default '{}'::jsonb,
  running_summary text check (char_length(running_summary) <= 4000),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text not null default 'pm' check (updated_by in ('ai', 'pm'))
);

create trigger prd_context_set_updated_at
  before update on prd_context
  for each row execute function set_updated_at();

alter table prd_context enable row level security;
grant select, insert, update, delete on prd_context to authenticated, service_role;

create policy "view prd context" on prd_context for select using (can_view_prd(prd_id));
create policy "write prd context" on prd_context for insert with check (can_edit_prd(prd_id));
create policy "update prd context" on prd_context for update using (can_edit_prd(prd_id));
create policy "delete prd context" on prd_context for delete using (can_edit_prd(prd_id));

-- =========================================================================
-- source
-- =========================================================================
create table source (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null references prd(id) on delete cascade,
  url text not null check (char_length(url) <= 2048),
  title text check (char_length(title) <= 300),
  publisher text check (char_length(publisher) <= 200),
  excerpt text check (char_length(excerpt) <= 500),
  retrieved_at timestamptz not null default now(),
  verification_status text not null default 'unverified' check (verification_status in ('unverified', 'verified', 'failed')),
  added_by text not null check (added_by in ('ai', 'pm'))
);

alter table source enable row level security;
grant select, insert, update, delete on source to authenticated, service_role;

create policy "view sources" on source for select using (can_view_prd(prd_id));
create policy "write sources" on source for insert with check (can_edit_prd(prd_id));
create policy "update sources" on source for update using (can_edit_prd(prd_id));
create policy "delete sources" on source for delete using (can_edit_prd(prd_id));

-- =========================================================================
-- prd_version
-- =========================================================================
create table prd_version (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null references prd(id) on delete cascade,
  content_json jsonb not null,
  doc_schema_version integer not null,
  -- null if the snapshot/edit originated from the AI, not a PM.
  created_by uuid references profile(id),
  origin text not null check (origin in ('ai_generated', 'pm_edit', 'checkpoint')),
  created_at timestamptz not null default now()
);

-- Now that prd_version exists, close the circular FK from prd.
alter table prd
  add constraint prd_current_version_id_fkey
  foreign key (current_version_id) references prd_version(id) on delete set null;

alter table prd_version enable row level security;
grant select, insert, update, delete on prd_version to authenticated, service_role;

create policy "view prd versions" on prd_version for select using (can_view_prd(prd_id));
create policy "write prd versions" on prd_version for insert with check (can_edit_prd(prd_id));
create policy "delete prd versions" on prd_version for delete using (can_edit_prd(prd_id));
-- No update policy: versions are snapshots, never edited after insert.

-- =========================================================================
-- generation_record
-- =========================================================================
create table generation_record (
  id uuid primary key default gen_random_uuid(),
  prd_id uuid not null references prd(id) on delete cascade,
  -- "trigger" is a reserved word in Postgres, so it must stay quoted.
  "trigger" text not null check ("trigger" in ('initial_generation', 'chat_request')),
  model text not null,
  prompt_version text,
  context_version integer,
  grounding_used boolean not null default false,
  status text not null check (status in ('success', 'failed')),
  error_message text,
  user_request text check (char_length(user_request) <= 2000),
  created_at timestamptz not null default now()
);

alter table generation_record enable row level security;
grant select, insert, update, delete on generation_record to authenticated, service_role;

create policy "view generation records" on generation_record for select using (can_view_prd(prd_id));
create policy "write generation records" on generation_record for insert with check (can_edit_prd(prd_id));
-- No update/delete policy: this is an append-only audit/diagnostic log.
