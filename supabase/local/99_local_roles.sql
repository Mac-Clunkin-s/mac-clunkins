-- LOCAL ONLY. Runs after the migrations and the seed.
--
-- Hosted Supabase gives `service_role` blanket access through its own bootstrap; our
-- migrations deliberately do not grant it anything, so this file fills that in for
-- local parity. Nothing here relaxes an `anon` or `authenticated` privilege — if a
-- policy is wrong, the RLS suite still catches it.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Sanity check the phase's headline claim while the migration role is still connected:
-- RLS must be on for all 26 tables. Fails the whole `db:up` if it ever is not.
do $$
declare
  v_missing text;
begin
  select string_agg(c.relname, ', ' order by c.relname)
    into v_missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if v_missing is not null then
    raise exception 'row level security is not enabled on: %', v_missing;
  end if;
end
$$;
