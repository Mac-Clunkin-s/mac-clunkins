import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, type Page } from '@playwright/test';
import type { Account, Role } from './accounts';
import { serviceRoleKey, supabaseUrl } from './env';
import { ROUTES } from './routes';

/** Sign in through the real login form. Waits for the app to leave /login. */
export async function loginViaUi(page: Page, account: Pick<Account, 'email' | 'password'>): Promise<void> {
  await page.goto(ROUTES.login);
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Password').fill(account.password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

/** Service-role client for test setup/teardown. Throws if the key is not in the environment. */
export function adminClient(): SupabaseClient {
  const url = supabaseUrl();
  const key = serviceRoleKey();
  if (!url || !key) {
    throw new Error('E2E_SUPABASE_SERVICE_ROLE_KEY and a Supabase URL must be set in the environment');
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface CreatedUser {
  id: string;
  email: string;
  password: string;
}

let counter = 0;

/**
 * Creates a throwaway confirmed user through the admin API. `role` and `full_name` travel in
 * user_metadata for the signup trigger. Pair with deleteTestUser in afterAll/afterEach.
 */
export async function createTestUser(role: Exclude<Role, 'admin'>, fullName = 'E2E Tester'): Promise<CreatedUser> {
  const email = `e2e-${role}-${Date.now()}-${counter++}@mccluckins.test`;
  const password = `E2e!${Math.random().toString(36).slice(2)}A1`;
  const { data, error } = await adminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role, full_name: fullName },
  });
  if (error || !data.user) throw new Error(`createTestUser failed: ${error?.message ?? 'no user'}`);
  return { id: data.user.id, email, password };
}

export async function deleteTestUser(id: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) throw new Error(`deleteTestUser failed: ${error.message}`);
}
