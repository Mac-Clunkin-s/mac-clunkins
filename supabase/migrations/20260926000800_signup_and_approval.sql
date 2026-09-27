-- McCluckin's — signup and admin approval.
--
-- Signup is server-side on purpose. The browser creates an auth user and passes its
-- chosen role and business details as user metadata; this trigger is what turns that
-- into a profile, and it is the thing that decides the status. A crafted signup
-- request cannot self-activate, and cannot mint an admin, because neither value is
-- read from the request.
--
-- The Brief, Roles and permissions: "New buyers, suppliers and drivers sign up
-- themselves but stay pending until an admin approves them." Buyers included.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta      jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_role_text text  := coalesce(v_meta ->> 'role', 'buyer');
  v_role      public.user_role;
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

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Second line of defence behind the column-scoped UPDATE grant on profiles: even a
-- caller who somehow holds the privilege cannot move their own role or status.
create or replace function public.guard_profile_privileges()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role, new.status) is distinct from (old.role, old.status) then
    if not (
      public.is_admin()
      or current_user in ('postgres', 'supabase_admin', 'service_role')
    ) then
      raise exception 'role and status are set by an admin, not by the account holder'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_privileges
  before update on public.profiles
  for each row execute function public.guard_profile_privileges();

-- ---------------------------------------------------------------------------
-- Admin approval / suspension
-- ---------------------------------------------------------------------------

-- The only supported way to change a profile's status. Validates the caller is an
-- active admin, records before and after in audit_log, and unpauses a supplier or
-- driver's detail row on approval.
create or replace function public.set_profile_status(
  p_profile_id uuid,
  p_status     public.profile_status,
  p_note       text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before public.profiles;
  v_after  public.profiles;
begin
  if not public.is_admin() then
    raise exception 'only an active admin may change a profile status'
      using errcode = '42501';
  end if;

  select * into v_before from public.profiles where id = p_profile_id for update;
  if v_before.id is null then
    raise exception 'profile % not found', p_profile_id using errcode = 'P0002';
  end if;

  if v_before.status = p_status then
    return v_before;                             -- no-op, nothing to audit
  end if;

  update public.profiles set status = p_status where id = p_profile_id
  returning * into v_after;

  if v_after.role = 'supplier' then
    update public.supplier_details
      set paused = (p_status <> 'active'),
          paused_reason = case when p_status = 'active' then null
                               else 'Account ' || p_status::text end
      where profile_id = p_profile_id;
  elsif v_after.role = 'driver' then
    update public.driver_details
      set paused = (p_status <> 'active'),
          paused_reason = case when p_status = 'active' then null
                               else 'Account ' || p_status::text end
      where profile_id = p_profile_id;
  end if;

  insert into public.audit_log (actor_id, action, entity, entity_id, before, after)
  values (
    auth.uid(),
    case p_status
      when 'active'    then 'profile.approved'
      when 'suspended' then 'profile.suspended'
      else 'profile.status_changed'
    end,
    'profiles',
    p_profile_id::text,
    jsonb_build_object('status', v_before.status, 'role', v_before.role),
    jsonb_build_object('status', v_after.status,  'role', v_after.role,
                       'note', p_note)
  );

  return v_after;
end;
$$;

revoke all on function public.set_profile_status(uuid, public.profile_status, text) from public;
grant execute on function public.set_profile_status(uuid, public.profile_status, text) to authenticated;
