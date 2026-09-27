-- McCluckin's — extensions.
-- PostGIS lives in the `extensions` schema to match hosted Supabase, and every
-- reference to a PostGIS type in later migrations is schema-qualified so nothing
-- depends on search_path.

create schema if not exists extensions;

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

grant usage on schema extensions to public;
