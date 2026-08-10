begin;

update public.muscles
set name = replace(
  name,
  convert_from(decode('c3a2e282ace2809d', 'hex'), 'UTF8'),
  convert_from(decode('e28094', 'hex'), 'UTF8')
)
where encode(convert_to(name, 'UTF8'), 'hex') like '%c3a2e282ace2809d%';

do $$
begin
  if (select count(*) from public.muscles) <> 40
    or (select count(distinct name) from public.muscles) <> 40
    or exists (
      select 1
      from public.muscles
      where encode(convert_to(name, 'UTF8'), 'hex') like '%c3a2e282ace2809d%'
    )
    or (select count(*) from public.muscles where name like '%' || convert_from(decode('e28094', 'hex'), 'UTF8') || '%') <> 7
  then
    raise exception 'Muscle-name UTF-8 repair validation failed';
  end if;
end
$$;

commit;
