-- 迁移 001：sessions / session_events 初始表结构（方案 §4 DDL）
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references sessions(id) on delete cascade,
  depth int not null default 0,
  status text not null default 'active',
  meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table if not exists session_events (
  session_id uuid not null references sessions(id) on delete cascade,
  seq int not null,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (session_id, seq)
);
