alter table public.algorithms
add column if not exists total_rounds text;

update public.algorithms alg
set total_rounds = src.total_rounds
from (
  select distinct on (algorithm_id)
    algorithm_id,
    total_rounds
  from public.attacks
  where total_rounds is not null
    and btrim(total_rounds) <> ''
  order by algorithm_id, length(total_rounds) desc, total_rounds desc
) as src
where alg.id = src.algorithm_id
  and (alg.total_rounds is null or btrim(alg.total_rounds) = '');

update public.algorithms
set total_rounds = 'unspecified'
where total_rounds is null or btrim(total_rounds) = '';

alter table public.algorithms
alter column total_rounds set not null;

with extracted as (
  select
    att.id,
    max((attacked_match.match)[1]::numeric) as attacked_max,
    max((total_match.match)[1]::numeric) as total_max
  from public.attacks att
  join public.algorithms alg
    on alg.id = att.algorithm_id
  left join lateral regexp_matches(att.attacked_rounds, '([0-9]+(?:\.[0-9]+)?)', 'g') as attacked_match(match)
    on true
  left join lateral regexp_matches(alg.total_rounds, '([0-9]+(?:\.[0-9]+)?)', 'g') as total_match(match)
    on true
  group by att.id
)
update public.attacks att
set round_coverage = case
  when extracted.attacked_max is null or extracted.total_max is null or extracted.total_max = 0 then null
  else least(1, round(extracted.attacked_max / extracted.total_max, 4))
end
from extracted
where extracted.id = att.id;

alter table public.attacks
drop column if exists total_rounds,
drop column if exists note;
