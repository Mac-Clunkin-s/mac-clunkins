import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../components/Button';
import { FormError } from '../../components/FormField';
import { addCaseEvent, advanceCase, loadCaseDetail, loadCases } from './api';
import { useAdminData } from './hooks/useAdminData';
import { useNow } from './hooks/useNow';
import { CASE_FLOW, allowedNext, replyDueIn } from './logic/cases';
import type { CaseCostOwner, CaseResolution, CaseRow, CaseStatus } from './types';
import { t } from './i18n';
import { AdminLayout, DataTable, Empty, LoadState, Money, Pill, SectionTitle, Tabs, card, displayName, errorText, formatDateTime, input, tStatus, useConfirm } from './ui';

type Tab = CaseStatus | 'all';

export function ReplyTimer({ c, now }: { c: CaseRow; now: Date }) {
  if (c.status !== 'open') return <span className="text-ink/40">-</span>;
  const ms = replyDueIn(c.reply_due_at, now);
  if (ms === null) return <span className="text-ink/40">-</span>;
  const mins = Math.round(Math.abs(ms) / 60000);
  const text = `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, '0')}m`;
  return ms < 0 ? <Pill tone="bad">{t('admin.cases.overdue', { time: text })}</Pill> : <Pill tone={ms < 3_600_000 ? 'warn' : 'neutral'}>{t('admin.cases.dueIn', { time: text })}</Pill>;
}

export default function AdminCases() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>('all');
  const { data, loading, error, reload } = useAdminData(loadCases, []);
  const now = useNow();
  const all = data ?? [];
  const rows = tab === 'all' ? all : all.filter((c) => c.status === tab);
  const selected = all.find((c) => c.id === params.get('id')) ?? null;
  const counts = (s: CaseStatus) => all.filter((c) => c.status === s).length;

  return (
    <AdminLayout title={t('admin.cases.title')} subtitle={t('admin.cases.subtitle')}>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[{ value: 'all', label: t('admin.common.all'), count: all.length }, ...CASE_FLOW.map((s) => ({ value: s as Tab, label: tStatus('case', s), count: counts(s) }))]}
      />
      <div className="mt-4 grid gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3">
          <LoadState loading={loading} error={error} hasData={!!data}>
            <DataTable
              rows={rows}
              rowKey={(c) => c.id}
              onRowClick={(c) => setParams({ id: c.id })}
              empty={<Empty title={t('admin.cases.emptyTitle')} body={t('admin.cases.emptyBody')} />}
              columns={[
                { key: 'n', header: t('admin.cases.col.number'), render: (c) => <span className="font-semibold text-chilli">{c.number}</span> },
                { key: 'o', header: t('admin.cases.col.order'), render: (c) => c.order?.number ?? '-' },
                { key: 't', header: t('admin.cases.col.type'), render: (c) => t(`admin.caseType.${c.type}`) },
                { key: 's', header: t('admin.cases.col.status'), render: (c) => <Pill>{tStatus('case', c.status)}</Pill> },
                { key: 'r', header: t('admin.cases.col.reply'), render: (c) => <ReplyTimer c={c} now={now} /> },
                { key: 'c', header: t('admin.cases.col.costOwner'), render: (c) => (c.cost_to ? t(`admin.costOwner.${c.cost_to}`) : '-') },
                { key: 'a', header: t('admin.cases.col.amount'), render: (c) => (c.amount_cents !== null ? <Money cents={c.amount_cents} /> : '-') },
              ]}
            />
          </LoadState>
        </div>
        <div className="xl:col-span-2">
          {selected ? <CaseDetailPanel key={selected.id} c={selected} onChanged={reload} /> : <Empty title={t('admin.cases.pickTitle')} body={t('admin.cases.pickBody')} />}
        </div>
      </div>
    </AdminLayout>
  );
}

function CaseDetailPanel({ c, onChanged }: { c: CaseRow; onChanged: () => void }) {
  const { data, loading, error, reload } = useAdminData(() => loadCaseDetail(c), [c.id, c.status]);
  const next = allowedNext(c.status);
  const [to, setTo] = useState<CaseStatus | ''>('');
  const [resolution, setResolution] = useState<CaseResolution | ''>('');
  const [amount, setAmount] = useState('');
  const [costTo, setCostTo] = useState<CaseCostOwner | ''>('');
  const [reply, setReply] = useState('');
  const [visible, setVisible] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const { ask, dialog } = useConfirm();

  const parsed = amount.trim() === '' ? null : Math.round(Number(amount) * 100);
  const amountCents = parsed !== null && Number.isFinite(parsed) ? parsed : null;

  async function send() {
    if (!reply.trim()) return;
    const r = await addCaseEvent(c.id, 'message', reply.trim(), visible);
    setMsg(errorText(r.error));
    if (!r.error) { setReply(''); reload(); }
  }

  function advance() {
    if (!to) return;
    const money = to === 'resolved' && (resolution === 'refund' || resolution === 'credit');
    ask({
      title: t('admin.cases.advanceTitle', { status: tStatus('case', to) }),
      body: money && amountCents !== null ? <span>{t('admin.cases.advanceMoney')} <Money cents={amountCents} strong /> ({t(`admin.costOwner.${costTo || 'mccluckins'}`)})</span> : t('admin.cases.advanceBody'),
      confirmLabel: t('admin.cases.advanceConfirm'),
      destructive: to === 'closed' || money,
      run: async () => {
        const r = await advanceCase({ caseId: c.id, from: c.status, to, resolution, amountCents, costTo });
        setMsg(errorText(r.error));
        if (!r.error) { setTo(''); onChanged(); }
      },
    });
  }

  const alloc = data?.allocations ?? [];
  const trips = data?.trips ?? [];
  const sum = (xs: (number | null)[]) => (xs.some((x) => x !== null) ? xs.reduce<number>((s, x) => s + (x ?? 0), 0) : null);
  const counts: [string, number | null][] = [
    [t('admin.cases.count.ordered'), c.order?.quantity ?? null],
    [t('admin.cases.count.buyer'), c.birds_affected],
    [t('admin.cases.count.supplier'), sum(alloc.map((a) => a.birds_counted))],
    [t('admin.cases.count.pickup'), sum(trips.map((x) => x.pickup_count))],
    [t('admin.cases.count.delivered'), sum(trips.map((x) => x.delivered_count))],
  ];

  return (
    <section className={card} aria-label={c.number}>
      <SectionTitle>{c.number} <Pill>{tStatus('case', c.status)}</Pill></SectionTitle>
      <p className="font-body text-sm text-ink/70">{displayName(c.raiser)} - {t(`admin.caseType.${c.type}`)}</p>
      {c.description && <p className="mt-2 font-body text-sm">{c.description}</p>}
      {c.photo_paths && c.photo_paths.length > 0 && <p className="mt-2 font-body text-xs text-ink/50">{t('admin.cases.photos', { count: c.photo_paths.length })}</p>}

      <h3 className="mt-4 font-heading text-sm font-bold">{t('admin.cases.whoCounted')}</h3>
      <table className="mt-1 w-full font-body text-sm"><tbody>
        {counts.map(([label, v]) => <tr key={label}><td className="py-0.5 text-ink/70">{label}</td><td className="py-0.5 text-right font-semibold">{v ?? '-'}</td></tr>)}
      </tbody></table>

      <FormError message={msg} />
      {next.length > 0 && (
        <div className="mt-4 rounded-xl bg-cream p-3">
          <label className="flex flex-col gap-1 font-body text-sm">{t('admin.cases.moveTo')}
            <select className={input} value={to} onChange={(e) => setTo(e.target.value as CaseStatus | '')}>
              <option value="">{t('admin.common.choose')}</option>
              {next.map((s) => <option key={s} value={s}>{tStatus('case', s)}</option>)}
            </select>
          </label>
          {to === 'resolved' && (
            <div className="mt-2 grid gap-2">
              <select className={input} aria-label={t('admin.cases.resolution')} value={resolution} onChange={(e) => setResolution(e.target.value as CaseResolution | '')}>
                <option value="">{t('admin.cases.resolution')}</option>
                {(['refund', 'credit', 'replacement', 'none'] as const).map((r) => <option key={r} value={r}>{t(`admin.resolution.${r}`)}</option>)}
              </select>
              <input className={input} aria-label={t('admin.cases.amount')} placeholder={t('admin.cases.amount')} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
              <select className={input} aria-label={t('admin.cases.costOwner')} value={costTo} onChange={(e) => setCostTo(e.target.value as CaseCostOwner | '')}>
                <option value="">{t('admin.cases.costOwner')}</option>
                {(['supplier', 'driver', 'mccluckins'] as const).map((o) => <option key={o} value={o}>{t(`admin.costOwner.${o}`)}</option>)}
              </select>
            </div>
          )}
          <Button className="mt-2" disabled={!to} onClick={advance}>{t('admin.cases.advance')}</Button>
        </div>
      )}

      <h3 className="mt-4 font-heading text-sm font-bold">{t('admin.cases.timeline')}</h3>
      <LoadState loading={loading} error={error} hasData={!!data}>
        <ol className="mt-1 flex flex-col gap-2">
          {(data?.events ?? []).map((e) => (
            <li key={e.id} className="rounded-lg bg-cream px-3 py-2 font-body text-sm">
              <span className="text-xs text-ink/50">{formatDateTime(e.created_at)} - {e.actor?.full_name ?? t('admin.order.system')} - {t(`admin.caseEvent.${e.kind}`)}</span>
              <p>{e.body}</p>
              <Pill tone={e.visible_to_buyer ? 'good' : 'neutral'}>{e.visible_to_buyer ? t('admin.cases.visibleToBuyer') : t('admin.cases.internal')}</Pill>
            </li>
          ))}
        </ol>
      </LoadState>
      <div className="mt-3 flex flex-col gap-2">
        <textarea className={input} rows={3} aria-label={t('admin.cases.reply')} placeholder={t('admin.cases.reply')} value={reply} onChange={(e) => setReply(e.target.value)} />
        <label className="flex items-center gap-2 font-body text-sm"><input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />{t('admin.cases.visibleToBuyer')}</label>
        <Button variant="secondary" disabled={!reply.trim()} onClick={() => void send()}>{t('admin.cases.send')}</Button>
      </div>
      {dialog}
    </section>
  );
}
