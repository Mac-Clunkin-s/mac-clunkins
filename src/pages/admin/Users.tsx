import { useState } from 'react';
import { Button } from '../../components/Button';
import { FormError } from '../../components/FormField';
import { Link } from 'react-router-dom';
import {
  documentUrl, loadUserCounts, loadUserReview, loadUsers, setDocumentStatus, setProfileStatus, type UserTab,
} from './api';
import { useAdminData } from './hooks/useAdminData';
import { expiryState } from './logic/dates';
import type { Profile } from '../../lib/types';
import { t } from './i18n';
import { AdminLayout, Empty, LoadState, Pill, SectionTitle, Tabs, card, displayName, errorText, formatDate, tStatus, useConfirm } from './ui';

const TAB_ORDER: UserTab[] = ['pending', 'buyer', 'supplier', 'driver', 'admin'];

export default function AdminUsers() {
  const [tab, setTab] = useState<UserTab>('pending');
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const counts = useAdminData(async () => ({ data: await loadUserCounts(), error: null }), []);
  const users = useAdminData(() => loadUsers(tab) as Promise<{ data: Profile[] | null; error: null }>, [tab]);
  const { ask, dialog } = useConfirm();

  async function changeStatus(id: string, status: 'active' | 'suspended') {
    setBusy(id);
    const r = await setProfileStatus(id, status);
    setBusy(null);
    setMsg(errorText(r.error));
    if (!r.error) { users.reload(); counts.reload(); }
  }
  const reject = (u: Profile) => ask({ title: t('admin.users.rejectTitle'), body: t('admin.users.rejectBody', { name: u.full_name }), confirmLabel: t('admin.users.reject'), destructive: true, run: () => changeStatus(u.id, 'suspended') });
  const suspend = (u: Profile) => ask({ title: t('admin.users.suspendTitle'), body: t('admin.users.suspendBody', { name: u.full_name }), confirmLabel: t('admin.users.suspend'), destructive: true, run: () => changeStatus(u.id, 'suspended') });
  const activate = (u: Profile) => ask({ title: t('admin.users.activateTitle'), body: t('admin.users.activateBody', { name: u.full_name }), confirmLabel: t('admin.users.activate'), run: () => changeStatus(u.id, 'active') });

  const reviewed = (users.data ?? []).find((u) => u.id === reviewId) ?? null;

  return (
    <AdminLayout title={t('admin.users.title')} subtitle={t('admin.users.subtitle')}>
      <Tabs<UserTab>
        value={tab}
        onChange={(v) => { setTab(v); setReviewId(null); }}
        tabs={TAB_ORDER.map((v) => ({ value: v, label: t(`admin.users.tab.${v}`), count: counts.data?.[v] }))}
      />
      <div className="mt-4"><FormError message={msg} /></div>
      <div className="mt-2 grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <LoadState loading={users.loading} error={users.error} hasData={!!users.data}>
            {users.data && users.data.length === 0 ? <Empty title={t('admin.users.emptyTitle')} body={t(`admin.users.empty.${tab}`)} /> : (
              <ul className="flex flex-col gap-3">
                {(users.data ?? []).map((u) => (
                  <li key={u.id} className={`${card} !p-4 ${reviewId === u.id ? 'ring-2 ring-chilli/40' : ''}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex flex-wrap items-center gap-2 font-heading font-bold">
                          {u.full_name}
                          <Pill>{t(`admin.users.role.${u.role}`)}</Pill>
                          <Pill tone={u.status === 'active' ? 'good' : u.status === 'pending' ? 'warn' : 'bad'}>{tStatus('profile', u.status)}</Pill>
                        </p>
                        <p className="mt-1 font-body text-sm text-ink/60">{[u.business_name, u.whatsapp_phone, u.email].filter(Boolean).join(' - ') || t('admin.users.noDetails')}</p>
                        <p className="mt-1 font-body text-xs text-ink/40">{t('admin.users.signedUp', { date: formatDate(u.created_at) })}{u.pdma_number ? ` - PDMA ${u.pdma_number}` : ''}</p>
                      </div>
                      <div className="flex shrink-0 flex-wrap gap-2">
                        {(u.role === 'supplier' || u.role === 'driver') && <Button variant="secondary" onClick={() => setReviewId(u.id)}>{t('admin.users.review')}</Button>}
                        {u.status === 'pending' && <><Button disabled={busy === u.id} onClick={() => activate(u)}>{t('admin.users.approve')}</Button><Button variant="secondary" disabled={busy === u.id} onClick={() => reject(u)}>{t('admin.users.reject')}</Button></>}
                        {u.status === 'active' && u.role !== 'admin' && <Button variant="secondary" disabled={busy === u.id} onClick={() => suspend(u)}>{t('admin.users.suspend')}</Button>}
                        {u.status === 'suspended' && <Button disabled={busy === u.id} onClick={() => activate(u)}>{t('admin.users.reactivate')}</Button>}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </LoadState>
        </div>
        <div className="xl:col-span-2">
          {reviewed ? <ReviewPanel profile={reviewed} onClose={() => setReviewId(null)} ask={ask} onChanged={counts.reload} /> : <Empty title={t('admin.review.pickTitle')} body={t('admin.review.pickBody')} />}
        </div>
      </div>
      {dialog}
    </AdminLayout>
  );
}

function ReviewPanel({ profile, onClose, ask, onChanged }: { profile: Profile; onClose: () => void; ask: ReturnType<typeof useConfirm>['ask']; onChanged: () => void }) {
  const { data, loading, error, reload } = useAdminData(() => loadUserReview(profile.id), [profile.id]);
  const [msg, setMsg] = useState<string | null>(null);
  const flu = data?.supplier?.avian_flu_zone ?? 'none';

  async function setDoc(id: string, status: 'approved' | 'rejected') {
    const r = await setDocumentStatus(id, status, null);
    setMsg(errorText(r.error));
    if (!r.error) { reload(); onChanged(); }
  }
  async function open(path: string) {
    const url = await documentUrl(path);
    if (url) window.open(url, '_blank', 'noopener');
    else setMsg(t('admin.review.noUrl'));
  }

  return (
    <section className={card} aria-label={t('admin.review.title')}>
      <div className="flex items-start justify-between">
        <SectionTitle>{t('admin.review.title')} - {displayName(profile)}</SectionTitle>
        <button type="button" className="font-body text-sm text-ink/50 hover:text-ink" onClick={onClose}>{t('admin.common.close')}</button>
      </div>
      <FormError message={msg} />
      <LoadState loading={loading} error={error} hasData={!!data}>
        {data && (
          <>
            {data.supplier && (
              <p className="mb-3 font-body text-sm text-ink/70">
                {data.supplier.farm_name ?? '-'} - {data.supplier.province ?? '-'}{' '}
                <Pill tone={flu === 'none' ? 'good' : 'bad'}>{t(`admin.zone.${flu}`)}</Pill>{' '}
                {data.supplier.paused && <Pill tone="warn">{t('admin.review.paused')}</Pill>}
              </p>
            )}
            {data.documents.length === 0 ? <p className="font-body text-sm text-ink/60">{t('admin.review.noDocs')}</p> : (
              <ul className="flex flex-col gap-2">
                {data.documents.map((d) => {
                  const exp = expiryState(d.expires_on);
                  return (
                    <li key={d.id} className="rounded-xl bg-cream p-3 font-body text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold">{t(`admin.doc.${d.kind}`)}</span>
                        <Pill tone={d.status === 'approved' ? 'good' : d.status === 'rejected' ? 'bad' : d.status === 'uploaded' ? 'warn' : 'neutral'}>{tStatus('document', d.status)}</Pill>
                      </div>
                      <p className="mt-1 text-xs text-ink/60">
                        {d.expires_on ? t('admin.review.expires', { date: formatDate(d.expires_on) }) : t('admin.review.noExpiry')}{' '}
                        {exp === 'soon' && <Pill tone="warn">{t('admin.review.expiringSoon')}</Pill>}
                        {exp === 'expired' && <Pill tone="bad">{t('admin.review.expired')}</Pill>}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {d.file_path && <Button variant="secondary" onClick={() => void open(d.file_path as string)}>{t('admin.review.view')}</Button>}
                        <Button disabled={d.status === 'approved' || d.status === 'missing'} onClick={() => void setDoc(d.id, 'approved')}>{t('admin.review.approveDoc')}</Button>
                        <Button variant="secondary" disabled={d.status === 'rejected' || d.status === 'missing'} onClick={() => ask({ title: t('admin.review.rejectTitle'), body: t('admin.review.rejectBody', { kind: t(`admin.doc.${d.kind}`) }), confirmLabel: t('admin.review.rejectDoc'), destructive: true, run: () => setDoc(d.id, 'rejected') })}>{t('admin.review.rejectDoc')}</Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-3 font-body text-xs text-ink/50">{t('admin.review.note')} <Link to="/admin/compliance" className="text-chilli hover:underline">{t('admin.nav.compliance')}</Link></p>
          </>
        )}
      </LoadState>
    </section>
  );
}
