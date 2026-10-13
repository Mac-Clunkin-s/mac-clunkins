import type { Page } from '@playwright/test';

/**
 * Privacy assertions for the one rule McCluckin's is built on: buyers, suppliers and drivers
 * never see each other's identities, prices or contact details. These run on the JSON that
 * actually crosses the network to the browser, so they catch a leak the RLS suite cannot — a
 * view or edge function that returns a column it should not.
 */

export type KeyMatcher = string | RegExp;

/** Anything with a Playwright-style async json(); url() is used only for error messages. */
export interface JsonResponseLike {
  json(): Promise<unknown>;
  url?(): string;
}

export interface AssertOptions {
  /** Dotted paths (e.g. "data.0.profile.phone") that are allowed even if their key matches. */
  allowPaths?: readonly (string | RegExp)[];
}

const matches = (key: string, matcher: KeyMatcher): boolean =>
  typeof matcher === 'string' ? key.toLowerCase() === matcher.toLowerCase() : matcher.test(key);

const isPathAllowed = (path: string, allow: AssertOptions['allowPaths']): boolean =>
  (allow ?? []).some((a) => (typeof a === 'string' ? a === path : a.test(path)));

/** Every object key in `payload` that matches a forbidden matcher, as dotted paths. */
export function findForbiddenKeys(
  payload: unknown,
  forbiddenKeys: readonly KeyMatcher[],
  options: AssertOptions = {},
): string[] {
  const found: string[] = [];
  const seen = new WeakSet<object>();

  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, path ? `${path}.${index}` : String(index)));
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const here = path ? `${path}.${key}` : key;
      if (forbiddenKeys.some((m) => matches(key, m)) && !isPathAllowed(here, options.allowPaths)) {
        found.push(here);
      }
      walk(value, here);
    }
  };

  walk(payload, '');
  return found;
}

const isResponseLike = (value: unknown): value is JsonResponseLike =>
  typeof value === 'object' && value !== null && typeof (value as JsonResponseLike).json === 'function';

/**
 * Throws if the response body (or an already-parsed payload) contains any forbidden key.
 * Non-JSON bodies cannot carry keys and are ignored.
 */
export async function assertNoForbiddenKeys(
  response: JsonResponseLike | unknown,
  forbiddenKeys: readonly KeyMatcher[],
  options: AssertOptions = {},
): Promise<void> {
  let payload: unknown = response;
  let where = 'payload';
  if (isResponseLike(response)) {
    where = response.url ? response.url() : 'response';
    try {
      payload = await response.json();
    } catch {
      return;
    }
  }
  const leaks = findForbiddenKeys(payload, forbiddenKeys, options);
  if (leaks.length > 0) {
    throw new Error(`Privacy leak in ${where}: forbidden key(s) ${leaks.join(', ')}`);
  }
}

/**
 * Forbidden key sets per viewing role. Patterns are intentionally broad (a leak is cheaper than a
 * false alarm). If a legitimate field trips one, allow that exact path with `allowPaths` and say
 * why in the spec — do not weaken the pattern. Tune these to the real column names as screens land.
 */
export const FORBIDDEN_FOR = {
  // Buyers never see supplier name/id/price.
  buyer: [/supplier/i, /^farm_?name$/i, /^(cost|wholesale|payout)(_|$)/i],
  // Suppliers never see buyer name/phone/address/price.
  supplier: [
    /^buyer/i,
    /^customer/i,
    /^delivery_(address|lat|lng|latitude|longitude|instructions)/i,
    /^address(_|$)/i,
    /^(retail|sell(ing)?|quote)_(price|total)/i,
    /^(buyer|customer)_?(price|total)/i,
  ],
  // Drivers never see supplier prices; buyers appear by first name only.
  driver: [
    /supplier.*(price|cost|rate)/i,
    /^(cost|wholesale|payout)(_|$)/i,
    /^buyer_?(last|full|sur)_?name$/i,
    /^buyer_?(email|phone)$/i,
  ],
} as const satisfies Record<string, readonly KeyMatcher[]>;

/** Values at these keys must be a single word — a first name, never "Thandi Mokoena". */
export function findNonFirstNames(payload: unknown, firstNameKeys: readonly string[]): string[] {
  const bad: string[] = [];
  const walk = (node: unknown, path: string): void => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, path ? `${path}.${i}` : String(i)));
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      const here = path ? `${path}.${key}` : key;
      if (firstNameKeys.some((k) => k.toLowerCase() === key.toLowerCase()) && typeof value === 'string') {
        if (/\s/.test(value.trim())) bad.push(here);
      }
      walk(value, here);
    }
  };
  walk(payload, '');
  return bad;
}

export interface NetworkRecorder {
  /** Number of JSON responses captured so far. */
  readonly count: number;
  /** Throws on the first leak found across everything captured. */
  assertClean(forbiddenKeys: readonly KeyMatcher[], options?: AssertOptions): Promise<void>;
  /** Throws if a buyer first-name key holds more than one word. */
  assertFirstNamesOnly(firstNameKeys: readonly string[]): Promise<void>;
  stop(): void;
}

/**
 * Starts capturing JSON API responses on `page` (anything whose URL passes `urlFilter`; by default
 * Supabase REST / RPC / edge-function calls; auth responses are skipped because they carry the
 * signed-in user's own profile). Bodies are read immediately so navigation cannot discard them.
 */
export function recordNetwork(
  page: Page,
  urlFilter: (url: string) => boolean = (url) => /\/(rest|functions)\/v1\//.test(url),
): NetworkRecorder {
  const captured: { url: string; body: unknown }[] = [];
  const pending: Promise<void>[] = [];

  const onResponse = (response: { url(): string; json(): Promise<unknown> }) => {
    if (!urlFilter(response.url())) return;
    pending.push(
      response.json().then(
        (body) => {
          captured.push({ url: response.url(), body });
        },
        () => undefined, // not JSON (204, HTML, preflight) — nothing to inspect
      ),
    );
  };
  page.on('response', onResponse);

  return {
    get count() {
      return captured.length;
    },
    async assertClean(forbiddenKeys, options) {
      await Promise.all(pending);
      for (const { url, body } of captured) {
        await assertNoForbiddenKeys({ json: async () => body, url: () => url }, forbiddenKeys, options);
      }
    },
    async assertFirstNamesOnly(firstNameKeys) {
      await Promise.all(pending);
      for (const { url, body } of captured) {
        const bad = findNonFirstNames(body, firstNameKeys);
        if (bad.length) throw new Error(`Non-first-name value in ${url}: ${bad.join(', ')}`);
      }
    },
    stop() {
      page.off('response', onResponse);
    },
  };
}
