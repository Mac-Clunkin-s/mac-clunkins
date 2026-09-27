-- McCluckin's — consent capture (G5, IDE-21 decision record, workstream A).
--
-- `consents` is append-only: withdrawal and re-consent write a new row, nothing is ever
-- updated or deleted. That is enforced here by policy, not by convention — no role holds
-- an UPDATE or DELETE grant on this table at all, including admins.
--
-- Every self-registered profile gets its consent rows written inside handle_new_user()'s
-- own transaction (see below), so a profile is structurally incapable of existing without
-- them. Only `profile_id` + a timestamp + a document version is captured — no IP address,
-- no user-agent; those would be new personal-data classes this table has no reason to hold.

create type public.consent_type as enum (
  'terms', 'privacy_notice', 'cross_border_transfer', 'service_messaging', 'marketing_messaging'
);

-- `service_messaging` is contract-necessity notice, not a choice, and is written as
-- source 'signup' alongside the rest. `settings` and `reconsent` exist now so a later
-- settings screen (marketing opt-out/in) or a document-version bump has somewhere to
-- write, without a migration to add the value at that point.
create type public.consent_source as enum ('signup', 'settings', 'reconsent');

create table public.consents (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles (id) on delete cascade,
  consent_type      public.consent_type not null,
  document_version  text not null,
  granted           boolean not null,
  source            public.consent_source not null,
  -- Points at the row this one replaces (withdrawal or re-consent). Null for the first
  -- record of its type. Never the other direction — nothing points backward into a row
  -- that superseded it, because nothing may be edited after the fact.
  superseded_by     uuid references public.consents (id),
  recorded_at       timestamptz not null default now()
);
create index consents_profile_id_idx on public.consents (profile_id);
create index consents_profile_type_idx on public.consents (profile_id, consent_type, recorded_at desc);

-- ---------------------------------------------------------------------------
-- RLS — owner reads own rows, admin reads all, nobody writes through the API
-- ---------------------------------------------------------------------------

alter table public.consents enable row level security;

-- Same posture as audit_log: readable by grant, but there is no INSERT/UPDATE/DELETE
-- grant to any client role at all. Every row comes from a security definer function
-- (handle_new_user() today), so the history cannot be forged, edited or removed via the
-- API even by an admin.
grant select on public.consents to authenticated;

create policy consents_read_own on public.consents
  for select to authenticated using (profile_id = auth.uid());
create policy consents_admin_read on public.consents
  for select to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Signup trigger — write the consent rows in the same transaction as the profile
-- ---------------------------------------------------------------------------

-- Replaces the version from 20260926000800_signup_and_approval.sql. Same shape, plus:
-- the consent rows for the four mandatory disclosures and the one opt-in, and an
-- audit_log entry recording that the write happened.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta            jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role_text       text  := coalesce(v_meta ->> 'role', 'buyer');
  v_role            public.user_role;
  v_marketing_opt_in boolean := coalesce((v_meta ->> 'marketing_opt_in')::boolean, false);
begin
  -- Admins are never self-signup. Anything that is not one of the three
  -- self-service roles is refused outright rather than silently downgraded.
  if v_role_text not in ('buyer', 'supplier', 'driver') then
    raise exception 'role % cannot be self-registered', v_role_text
      using errcode = '42501';
  end if;
  v_role := v_role_text::public.user_role;

  insert into public.profiles (
    id, role, status, full_name, business_name, business_type,
    whatsapp_phone, email, language, pdma_number
  ) values (
    new.id,
    v_role,
    'pending',                                    -- never taken from the request
    coalesce(nullif(v_meta ->> 'full_name', ''), 'New user'),
    nullif(v_meta ->> 'business_name', ''),
    case when nullif(v_meta ->> 'business_type', '') is null
         then null else (v_meta ->> 'business_type')::public.business_type end,
    nullif(coalesce(v_meta ->> 'whatsapp_phone', new.phone), ''),
    new.email,
    coalesce(nullif(v_meta ->> 'language', '')::public.app_language, 'en'),
    nullif(v_meta ->> 'pdma_number', '')
  );

  -- Give suppliers and drivers their detail row straight away, paused, so the
  -- onboarding screens have something to write into.
  if v_role = 'supplier' then
    insert into public.supplier_details (profile_id, paused, paused_reason)
    values (new.id, true, 'Awaiting approval');
  elsif v_role = 'driver' then
    insert into public.driver_details (profile_id, paused, paused_reason)
    values (new.id, true, 'Awaiting approval');
  end if;

  -- Consent capture (standard §3, §1.2). The signup form gates submission on a single
  -- checkbox covering terms + the privacy/collection notice, so every account reaching
  -- this point has agreed to all three mandatory-consent types below. Marketing is the
  -- one independent opt-in, default false, and is never inferred from the others.
  insert into public.consents (profile_id, consent_type, document_version, granted, source)
  values
    (new.id, 'terms',                 'terms_v1',           true,               'signup'),
    (new.id, 'privacy_notice',        'privacy_notice_v1',  true,               'signup'),
    (new.id, 'cross_border_transfer', 'privacy_notice_v1',  true,               'signup'),
    -- Contract necessity, not a choice: recorded as notified, never suppressible by the
    -- marketing opt-out.
    (new.id, 'service_messaging',     'privacy_notice_v1',  true,               'signup'),
    (new.id, 'marketing_messaging',   'privacy_notice_v1',  v_marketing_opt_in, 'signup');

  insert into public.audit_log (actor_id, action, entity, entity_id, after)
  values (
    new.id, 'consent.recorded', 'consents', new.id::text,
    jsonb_build_object(
      'source', 'signup',
      'marketing_messaging', v_marketing_opt_in
    )
  );

  return new;
end;
$$;
