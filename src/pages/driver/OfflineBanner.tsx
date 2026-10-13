import { t } from '../supplier-driver-shared/t';

export function OfflineBanner({ online, pending, syncing }: { online: boolean; pending: number; syncing: boolean }) {
  if (online && pending === 0 && !syncing) return null;
  return (
    <div
      role="status"
      className={`mb-4 rounded-2xl px-4 py-3 font-body text-base font-semibold ${online ? 'bg-mustard/40 text-ink' : 'bg-chilli text-cream'}`}
    >
      {!online && t('driver.offline.banner', { count: pending })}
      {online && syncing && t('driver.offline.syncing', { count: pending })}
      {online && !syncing && pending > 0 && t('driver.offline.waiting', { count: pending })}
    </div>
  );
}
