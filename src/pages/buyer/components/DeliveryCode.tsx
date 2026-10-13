import { t } from '../i18n-shim';

/** The buyer's 4-digit handover code. Anything that is not exactly 4 digits is treated as "not issued". */
export function DeliveryCode({ code }: { code: string | null }) {
  const valid = !!code && /^\d{4}$/.test(code);
  if (!valid) {
    return <p className="text-sm text-ink/60">{t('buyer.track.codePending')}</p>;
  }
  return (
    <div>
      <p className="text-sm font-semibold">{t('buyer.track.codeTitle')}</p>
      <div
        data-testid="delivery-code"
        aria-label={t('buyer.track.codeAria', { code: (code as string).split('').join(' ') })}
        className="mt-2 flex gap-2"
      >
        {(code as string).split('').map((d, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="flex h-14 w-11 items-center justify-center rounded-xl bg-ink font-heading text-3xl font-bold text-mustard"
          >
            {d}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink/60">{t('buyer.track.codeHelp')}</p>
    </div>
  );
}
