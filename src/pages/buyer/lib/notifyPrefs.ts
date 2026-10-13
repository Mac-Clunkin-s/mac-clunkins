// STUB: there is no buyer-writable notification-preferences table yet (public.notifications is an outbound
// queue). Until one exists, choices persist in this browser only. Swap load/save for an API call later.
export interface NotifyPrefs {
  whatsapp: boolean;
  email: boolean;
  sms: boolean;
}

const KEY = 'mccluckins.buyer.notifyPrefs';
const DEFAULTS: NotifyPrefs = { whatsapp: true, email: true, sms: false };

export function loadNotifyPrefs(): NotifyPrefs {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<NotifyPrefs>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveNotifyPrefs(p: NotifyPrefs): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* private mode etc.: preference simply isn't remembered */
  }
}
