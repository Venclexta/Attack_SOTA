update public.attacks
set note = case
  when variant is null or btrim(variant) = '' then note
  when coalesce(note, '') ilike '%' || variant || '%' then note
  when coalesce(note, '') = '' then 'Variant detail: ' || variant || '.'
  else note || ' Variant detail: ' || variant || '.'
end
where variant is not null;

alter table public.attacks
drop column if exists variant;
