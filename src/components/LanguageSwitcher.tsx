import { LOCALES, isLocale } from '../i18n';
import { useLocale } from '../i18n/useLocale';

/**
 * Language picker. Styling matches the select on the Welcome page.
 * Not mounted anywhere yet — see docs/i18n.md for how to drop it into a header.
 */
export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale, t } = useLocale();

  return (
    <label className={`flex items-center gap-2 text-sm ${className}`.trim()}>
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={locale}
        onChange={(event) => {
          if (isLocale(event.target.value)) setLocale(event.target.value);
        }}
        className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-sm"
        aria-label={t('common.chooseLanguage')}
      >
        {LOCALES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export default LanguageSwitcher;
