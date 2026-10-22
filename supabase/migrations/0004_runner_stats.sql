-- A runner's public rating (average + count). Individual ratings stay private under
-- RLS; customers only need the aggregate to see who's bringing their food.
create or replace function public.runner_rating(rid uuid) returns double precision
language sql stable security definer set search_path = public as $$
  select avg(stars)::float8 from public.ratings where runner_id = rid;
$$;

create or replace function public.runner_rating_count(rid uuid) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.ratings where runner_id = rid;
$$;

grant execute on function public.runner_rating(uuid), public.runner_rating_count(uuid) to authenticated;
