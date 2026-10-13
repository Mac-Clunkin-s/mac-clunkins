-- Trigger and number-generator functions are never called through the API.
revoke execute on function public.handle_new_user(), public.guard_profile_privileges(), public.set_order_number(),
  public.set_case_number(), public.next_order_number(), public.next_case_number() from public, anon, authenticated;
revoke execute on function public.set_profile_status(uuid, public.profile_status, text) from public, anon;
grant execute on function public.set_profile_status(uuid, public.profile_status, text) to authenticated;
