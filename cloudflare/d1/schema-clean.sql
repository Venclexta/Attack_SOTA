pragma foreign_keys = on;
create table if not exists algorithms (
  id text primary key,
  name text not null,
  structure text not null,
  algorithm_year integer,
  design_paper text,
  design_venue text,
  design_url text,
  standard text not null default 'Research primitive',
  type text not null check (type in ('block', 'hash')),
  total_rounds text not null,
  tags text not null default '[]',
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
create table if not exists publications (
  id text primary key,
  venue text not null,
  year integer not null,
  title text not null,
  url text not null,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
create table if not exists attacks (
  id text primary key,
  algorithm_id text not null references algorithms(id) on delete cascade,
  publication_id text not null references publications(id) on delete restrict,
  attack text not null,
  model text not null,
  attacked_rounds text not null,
  round_coverage real,
  data_complexity text not null default '',
  time_complexity text not null default '',
  memory_complexity text not null default '',
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
create table if not exists admin_users (
  id text primary key,
  username text not null unique,
  email text not null unique,
  display_name text,
  role text not null default 'admin' check (role in ('admin')),
  is_active integer not null default 1,
  password_salt text not null,
  password_hash text not null,
  password_iterations integer not null default 100000,
  created_at text not null default current_timestamp,
  updated_at text not null default current_timestamp
);
create index if not exists attacks_algorithm_idx on attacks(algorithm_id);
create index if not exists attacks_coverage_idx on attacks(round_coverage desc);
create index if not exists publications_venue_year_idx on publications(venue, year desc);
create index if not exists algorithms_type_idx on algorithms(type);
create index if not exists algorithms_name_idx on algorithms(name);
create index if not exists admin_users_username_idx on admin_users(username);
create index if not exists admin_users_email_idx on admin_users(email);
