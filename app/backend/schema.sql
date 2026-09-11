-- Initial schema for the AI PRD-generation tool.
-- Run this in the Supabase SQL Editor (Project > SQL Editor > New query).
-- Covers only the core M0 flow: a PM signs in, submits product/feature
-- context, and gets back a generated PRD. Multi-project support, PRD
-- versioning, and org/team features are intentionally left out for now.

-- One row per authenticated user, extending Supabase's built-in auth.users
-- with app-specific fields.
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- One row per generated Product Requirements Document.
create table prds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  product_context text not null,
  content text,
  status text not null default 'draft' check (status in ('draft', 'generated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prds_user_id_idx on prds (user_id);

-- Row Level Security: users can only see and manage their own data.
alter table profiles enable row level security;
alter table prds enable row level security;

create policy "Users can view their own profile"
  on profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

create policy "Users can view their own PRDs"
  on prds for select
  using (auth.uid() = user_id);

create policy "Users can insert their own PRDs"
  on prds for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own PRDs"
  on prds for update
  using (auth.uid() = user_id);

create policy "Users can delete their own PRDs"
  on prds for delete
  using (auth.uid() = user_id);
