alter table public.algorithms
add column if not exists design_paper text,
add column if not exists design_venue text,
add column if not exists design_url text;
