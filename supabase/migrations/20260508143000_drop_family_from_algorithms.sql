update public.algorithms
set structure = coalesce(nullif(structure, ''), family)
where structure is null or structure = '';

alter table public.algorithms
drop column if exists family;
