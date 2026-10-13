import { formatCountdown, remainingMs } from '../lib/quote';
import { useNow } from '../hooks/useNow';
import { t } from '../i18n-shim';

export function CountdownBadge({ expiresAt }: { expiresAt: string | null }) {
  const now = useNow();
  const left = remainingMs(expiresAt, now);
  if (!expiresAt) return null;
  if (left === 0) {
    return <p className="text-sm font-semibold text-chilli">{t('buyer.quote.expired')}</p>;
  }
  return (
    <p className="text-sm">
      {t('buyer.quote.heldFor')}{' '}
      <span data-testid="countdown" className="font-heading text-lg font-bold tabular-nums text-chilli">
        {formatCountdown(left)}
      </span>
    </p>
  );
}
