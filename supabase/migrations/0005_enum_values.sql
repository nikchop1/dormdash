-- New enum values live in their own migration: Postgres won't let a value be used
-- in the same transaction that adds it.
alter type public.order_status add value if not exists 'customer_no_show';
alter type public.account_status add value if not exists 'banned';
alter type public.photo_kind add value if not exists 'door';
alter type public.photo_kind add value if not exists 'problem';
alter type public.photo_kind add value if not exists 'case';
