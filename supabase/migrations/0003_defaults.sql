-- Default settings that every environment needs (production included).
insert into public.pricing_settings (id) values (1) on conflict (id) do nothing;

insert into public.feature_flags (key, enabled, description) values
  ('dining_halls_enabled', false, 'Show dining halls as pickup spots. Off until NYU dining policy is confirmed.'),
  ('scheduled_orders_enabled', true, 'Let customers schedule a delivery for later instead of ASAP.'),
  ('signups_open', true, 'Allow new accounts to be created.')
on conflict (key) do nothing;

insert into public.surge_windows (label, days, start_minute, end_minute, multiplier)
select * from (values
  ('Weeknight rush', '{0,1,2,3,4}'::int[], 21 * 60, 60, 1.5::double precision),
  ('Weekend nights', '{5,6}'::int[], 20 * 60, 120, 1.5::double precision)
) as v(label, days, start_minute, end_minute, multiplier)
where not exists (select 1 from public.surge_windows);
