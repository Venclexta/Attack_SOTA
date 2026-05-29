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

alter table public.admin_users enable row level security;

drop policy if exists "admins can read directory" on public.admin_users;
create policy "admins can read directory"
on public.admin_users
for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists "authenticated write algorithms" on public.algorithms;
drop policy if exists "authenticated write publications" on public.publications;
drop policy if exists "authenticated write attacks" on public.attacks;

drop policy if exists "admins write algorithms" on public.algorithms;
create policy "admins write algorithms"
on public.algorithms
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admins write publications" on public.publications;
create policy "admins write publications"
on public.publications
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));

drop policy if exists "admins write attacks" on public.attacks;
create policy "admins write attacks"
on public.attacks
for all
to authenticated
using (public.is_admin(auth.uid()))
with check (public.is_admin(auth.uid()));
