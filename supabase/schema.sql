create extension if not exists pgcrypto;

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  proxy_token text unique not null,
  login_id text unique not null,
  password_hash text not null,
  budget_usd numeric(12,4) not null,
  cost_used numeric(14,6) not null default 0,
  tokens_used bigint not null default 0,
  created_at timestamptz not null default now()
);

-- Safe to re-run against a table created before login_id/password_hash existed.
alter table teams add column if not exists login_id text;
alter table teams add column if not exists password_hash text;

-- Migrating from the old token-only budget model: add the $ columns if missing,
-- then drop token_budget. Token counts aren't automatically convertible to $
-- (no historical per-model price breakdown), so existing token_budget values are
-- lost - set budget_usd for each team via the admin page after re-running this.
alter table teams add column if not exists budget_usd numeric(12,4) not null default 0;
alter table teams add column if not exists cost_used numeric(14,6) not null default 0;
alter table teams drop column if exists token_budget;

-- add column if not exists doesn't carry over the unique constraint, so enforce it
-- separately. This fails if duplicate login_id values already exist - dedupe them
-- first (e.g. via the admin page) before re-running this file.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'teams_login_id_key') then
    alter table teams add constraint teams_login_id_key unique (login_id);
  end if;
end $$;

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  login_id text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create or replace function record_usage(p_team_id uuid, p_tokens bigint, p_cost numeric)
returns void as $$
begin
  update teams
  set tokens_used = tokens_used + p_tokens,
      cost_used = cost_used + p_cost
  where id = p_team_id;
end;
$$ language plpgsql;
