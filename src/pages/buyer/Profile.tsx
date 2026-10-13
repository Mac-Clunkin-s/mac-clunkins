import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { FormError, SelectField, TextField } from '../../components/FormField';
import { PageSpinner } from '../../components/PageSpinner';
import type { AppLanguage } from '../../lib/types';
import { deleteAddress, listAddresses, listMyCases, setDefaultAddress, updateProfile } from './api';
import { BuyerLayout, Card } from './components/BuyerLayout';
import { useAsync } from './hooks/useAsync';
import { t } from './i18n-shim';
import { loadNotifyPrefs, saveNotifyPrefs, type NotifyPrefs } from './lib/notifyPrefs';

const LANGS: AppLanguage[] = ['en', 'zu', 'st', 'tn'];

export default function Profile() {
  const { profile, signOut } = useAuth();
  const addresses = useAsync(listAddresses, []);
  const cases = useAsync(listMyCases, []);
  const [businessName, setBusinessName] = useState(profile?.business_name ?? '');
  const [phone, setPhone] = useState(profile?.whatsapp_phone ?? '');
  const [pdma, setPdma] = useState(profile?.pdma_number ?? '');
  const [language, setLanguage] = useState<AppLanguage>(profile?.language ?? 'en');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setPrefs] = useState<NotifyPrefs>(loadNotifyPrefs);
  const [addrError, setAddrError] = useState<string | null>(null);

  if (!profile) return <PageSpinner />;

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setBusy(true);
    setSaved(false);
    setError(null);
    try {
      await updateProfile(profile.id, {
        business_name: businessName.trim() || null,
        whatsapp_phone: phone.trim() || null,
        pdma_number: pdma.trim() || null,
        language,
      });
      setSaved(true);
    } catch {
      setError(t('buyer.profile.saveError'));
    } finally {
      setBusy(false);
    }
  }

  async function addrAction(fn: () => Promise<void>) {
    setAddrError(null);
    try {
      await fn();
      addresses.reload();
    } catch {
      setAddrError(t('buyer.profile.addressError'));
    }
  }

  function togglePref(k: keyof NotifyPrefs) {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    saveNotifyPrefs(next);
  }

  return (
    <BuyerLayout>
      <h1 className="mb-5 font-heading text-2xl font-bold">{t('buyer.profile.title')}</h1>
      <div className="flex flex-col gap-4">
        <Card>
          <form onSubmit={(e) => void onSave(e)} className="flex flex-col gap-4">
            <h2 className="font-heading font-bold">{t('buyer.profile.business')}</h2>
            <p className="text-sm text-ink/70">{profile.full_name}</p>
            <TextField id="businessName" label={t('buyer.profile.businessName')} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
            <TextField id="phone" label={t('buyer.profile.phone')} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <div>
              <TextField id="pdma" label={t('buyer.profile.pdma')} value={pdma} onChange={(e) => setPdma(e.target.value)} />
              <p className="mt-1 text-xs text-ink/60">{t('buyer.profile.pdmaHelp')}</p>
            </div>
            <SelectField id="language" label={t('buyer.profile.language')} value={language} onChange={(e) => setLanguage(e.target.value as AppLanguage)}>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {t(`buyer.profile.lang.${l}`)}
                </option>
              ))}
            </SelectField>
            <FormError message={error} />
            {saved && (
              <p role="status" className="text-sm font-semibold text-emerald-700">
                {t('buyer.profile.saved')}
              </p>
            )}
            <Button type="submit" disabled={busy}>
              {t('buyer.profile.save')}
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="font-heading font-bold">{t('buyer.profile.addresses')}</h2>
          <FormError message={addrError} />
          {addresses.loading && <PageSpinner />}
          {addresses.data && addresses.data.length === 0 && (
            <p className="mt-1 text-sm text-ink/60">{t('buyer.profile.noAddresses')}</p>
          )}
          <ul className="mt-2 divide-y divide-ink/10">
            {(addresses.data ?? []).map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  {(a.label ? `${a.label}: ` : '') + `${a.street}, ${a.town}`}
                  {a.is_default && (
                    <span className="ml-2 rounded-full bg-mustard/30 px-2 py-0.5 text-xs font-semibold">
                      {t('buyer.profile.default')}
                    </span>
                  )}
                </span>
                <span className="flex gap-3">
                  {!a.is_default && (
                    <button type="button" className="font-semibold text-chilli" onClick={() => void addrAction(() => setDefaultAddress(profile.id, a.id))}>
                      {t('buyer.profile.makeDefault')}
                    </button>
                  )}
                  <button type="button" className="font-semibold text-ink/60" onClick={() => void addrAction(() => deleteAddress(a.id))}>
                    {t('buyer.profile.remove')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink/60">
            {t('buyer.profile.addAddressHint')}{' '}
            <Link to="/orders/new" className="font-semibold text-chilli">
              {t('buyer.nav.newOrder')}
            </Link>
          </p>
        </Card>

        <Card>
          <h2 className="font-heading font-bold">{t('buyer.profile.notifications')}</h2>
          <p className="text-xs text-ink/60">{t('buyer.profile.notificationsNote')}</p>
          {(['whatsapp', 'email', 'sms'] as const).map((k) => (
            <label key={k} className="mt-2 flex items-center gap-3 text-sm">
              <input type="checkbox" checked={prefs[k]} onChange={() => togglePref(k)} />
              {t(`buyer.profile.notify.${k}`)}
            </label>
          ))}
        </Card>

        <Card>
          <h2 className="font-heading font-bold">{t('buyer.profile.myCases')}</h2>
          {cases.data && cases.data.length === 0 && <p className="mt-1 text-sm text-ink/60">{t('buyer.profile.noCases')}</p>}
          <ul className="mt-2 divide-y divide-ink/10">
            {(cases.data ?? []).map((c) => (
              <li key={c.id} className="py-2">
                <Link to={`/cases/${c.id}`} className="flex items-center justify-between text-sm font-semibold hover:text-chilli">
                  <span>
                    {c.number} · {t(`buyer.caseType.${c.type}`)}
                  </span>
                  <span className="text-xs text-ink/60">{t(`buyer.caseStatus.${c.status}`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>

        <Button variant="secondary" onClick={() => void signOut()}>
          {t('buyer.nav.logout')}
        </Button>
      </div>
    </BuyerLayout>
  );
}
