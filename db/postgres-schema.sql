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
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists publications (
  id text primary key,
  venue text not null,
  year integer not null,
  title text not null,
  url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists attacks (
  id text primary key,
  algorithm_id text not null references algorithms(id) on delete cascade,
  publication_id text not null references publications(id) on delete restrict,
  attack text not null,
  model text not null,
  attacked_rounds text not null,
  round_coverage numeric,
  data_complexity text not null,
  time_complexity text not null,
  memory_complexity text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists attacks_algorithm_idx on attacks(algorithm_id);
create index if not exists attacks_coverage_idx on attacks(round_coverage desc);
create index if not exists publications_venue_year_idx on publications(venue, year desc);
create index if not exists algorithms_type_idx on algorithms(type);
create index if not exists algorithms_tags_idx on algorithms using gin(tags);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text not null unique,
  display_name text,
  role text not null default 'admin' check (role in ('admin')),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists admin_users_username_idx on public.admin_users(username);
create index if not exists admin_users_email_idx on public.admin_users(email);

create or replace function public.is_admin(check_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = check_user
      and is_active = true
  );
$$;

grant execute on function public.is_admin(uuid) to anon, authenticated;

alter table algorithms enable row level security;
alter table publications enable row level security;
alter table attacks enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "public read algorithms" on algorithms;
create policy "public read algorithms"
on algorithms
for select
using (true);

drop policy if exists "public read publications" on publications;
create policy "public read publications"
on publications
for select
using (true);

drop policy if exists "public read attacks" on attacks;
create policy "public read attacks"
on attacks
for select
using (true);

drop policy if exists "admins can read directory" on public.admin_users;
create policy "admins can read directory"
on public.admin_users
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "authenticated write algorithms" on algorithms;
drop policy if exists "admins write algorithms" on algorithms;
create policy "admins write algorithms"
on algorithms
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "authenticated write publications" on publications;
drop policy if exists "admins write publications" on publications;
create policy "admins write publications"
on publications
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "authenticated write attacks" on attacks;
drop policy if exists "admins write attacks" on attacks;
create policy "admins write attacks"
on attacks
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
