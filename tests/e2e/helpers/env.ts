// Environment access for E2E. Secrets come from the environment only — never from files in the
// repo. The service-role key bypasses RLS, so it is used here to create/clean test users and must
// never be given to the browser or committed.

export function supabaseUrl(): string | undefined {
  return process.env.E2E_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
}

export function serviceRoleKey(): string | undefined {
  return process.env.E2E_SUPABASE_SERVICE_ROLE_KEY;
}

/**
 * True when a real Supabase Auth + PostgREST backend is reachable with the seeded accounts.
 * Journey and privacy specs skip themselves otherwise (CI sets E2E_LIVE_BACKEND=1 only against a
 * `supabase start` stack or a dedicated staging project — never production).
 */
export function hasLiveBackend(): boolean {
  return process.env.E2E_LIVE_BACKEND === '1' && !!supabaseUrl();
}

export const SKIP_REASON =
  'needs a live Supabase backend: set E2E_LIVE_BACKEND=1, VITE_SUPABASE_URL (+ anon key) and seed it';
