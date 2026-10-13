import { useMemo, useState } from 'react';
import { Button } from '../../components/Button';
import { formatCents } from '../../lib/format';
import { loadReportData } from './api';
import { useAdminData } from './hooks/useAdminData';
import { downloadCsv } from './logic/csv';
import { buildReport } from './logic/reports';
import { t } from './i18n';
import { AdminLayout, DataTable, Empty, LoadState, Money, SectionTitle, card, input } from './ui';

function Bars({ items }: { items: { label: string; a: number; b?: number }[] }) {
  const max = Math.max(1, ...items.map((i) => Math.max(i.a, i.b ?? 0)));
  return (
    <div className="flex h-40 items-end gap-1 overflow-x-auto" role="img" aria-label={t('admin.reports.chartAria')}>
      {items.map((i) => (
        <div key={i.label} className="flex min-w-[18px] flex-1 flex-col items-center justify-end gap-0.5" title={`${i.label}: ${formatCents(i.a)}${i.b !== undefined ? ` / ${formatCents(i.b)}` : ''}`}>
          <div className="flex h-32 w-full items-end gap-0.5">
            <div className="w-full rounded-t bg-chilli" style={{ height: `${(i.a / max) * 100}%` }} />
            {i.b !== undefined && <div className="w-full rounded-t bg-mustard" style={{ height: `${(Math.max(i.b, 0) / max) * 100}%` }} />}
          </div>
          <span className="font-body text-[10px] text-ink/50">{i.label.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export default function AdminReports() {
  const [days, setDays] = useState(30);
  const { data, loading, error } = useAdminData(() => loadReportData(days), [days]);
  const report = useMemo(() => (data ? buildReport(data) : null), [data]);

  function exportAll() {
    if (!report) return;
    downloadCsv(`report-${days}d.csv`, [
      [t('admin.reports.section.daily')], ['day', 'sales_zar', 'margin_zar'],
      ...report.daily.map((d) => [d.day, (d.salesCents / 100).toFixed(2), (d.marginCents / 100).toFixed(2)]),
      [], [t('admin.reports.section.areas')], ['province', 'birds'], ...report.byProvince.map((p) => [p.province, p.birds]),
      [], [t('admin.reports.section.buyers')], ['buyer', 'orders', 'spend_zar'], ...report.topBuyers.map((b) => [b.name, b.orders, (b.spendCents / 100).toFixed(2)]),
      [], [t('admin.reports.section.suppliers')], ['supplier', 'jobs', 'collected', 'rating'], ...report.suppliers.map((s) => [s.name, s.jobs, s.collected, s.rating]),
      [], [t('admin.reports.section.drivers')], ['driver', 'trips', 'delivered', 'rating'], ...report.drivers.map((d) => [d.name, d.trips, d.delivered, d.rating]),
    ]);
  }

  return (
    <AdminLayout
      title={t('admin.reports.title')}
      subtitle={t('admin.reports.subtitle')}
      actions={<>
        <select className={input} aria-label={t('admin.reports.range')} value={days} onChange={(e) => setDays(Number(e.target.value))}>
          {[30, 90, 365].map((d) => <option key={d} value={d}>{t('admin.reports.lastDays', { count: d })}</option>)}
        </select>
        <Button variant="secondary" disabled={!report} onClick={exportAll}>{t('admin.common.exportCsv')}</Button>
      </>}
    >
      <LoadState loading={loading} error={error} hasData={!!data}>
        {report && (
          <div className="flex flex-col gap-8">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              {[
                [t('admin.reports.kpi.orders'), String(report.kpis.orders)],
                [t('admin.reports.kpi.sales'), <Money key="s" cents={report.kpis.salesCents} />],
                [t('admin.reports.kpi.margin'), <span key="m"><Money cents={report.kpis.marginCents} /> ({report.kpis.marginPct}%)</span>],
                [t('admin.reports.kpi.birds'), String(report.kpis.birds)],
                [t('admin.reports.kpi.aov'), <Money key="a" cents={report.kpis.aov} />],
              ].map(([label, value]) => (
                <div key={String(label)} className={card}>
                  <p className="font-heading text-xl font-extrabold text-chilli">{value}</p>
                  <p className="font-body text-sm text-ink/60">{label}</p>
                </div>
              ))}
            </div>

            <section className={card}>
              <SectionTitle>{t('admin.reports.section.daily')}</SectionTitle>
              <p className="mb-2 font-body text-xs text-ink/50"><span className="text-chilli">&#9632;</span> {t('admin.reports.kpi.sales')} <span className="ml-3 text-mustard">&#9632;</span> {t('admin.reports.kpi.margin')}</p>
              {report.daily.length === 0 ? <Empty title={t('admin.reports.none')} /> : <Bars items={report.daily.map((d) => ({ label: d.day, a: d.salesCents, b: d.marginCents }))} />}
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section>
                <SectionTitle>{t('admin.reports.section.areas')}</SectionTitle>
                <DataTable rows={report.byProvince} rowKey={(r) => r.province} empty={<Empty title={t('admin.reports.none')} />}
                  columns={[{ key: 'p', header: t('admin.orders.col.province'), render: (r) => r.province }, { key: 'b', header: t('admin.orders.col.birds'), render: (r) => r.birds }]} />
              </section>
              <section>
                <SectionTitle>{t('admin.reports.section.buyers')}</SectionTitle>
                <DataTable rows={report.topBuyers} rowKey={(r) => r.name} empty={<Empty title={t('admin.reports.none')} />}
                  columns={[{ key: 'n', header: t('admin.orders.col.buyer'), render: (r) => r.name }, { key: 'o', header: t('admin.reports.kpi.orders'), render: (r) => r.orders }, { key: 's', header: t('admin.reports.spend'), render: (r) => <Money cents={r.spendCents} /> }]} />
              </section>
              <section>
                <SectionTitle>{t('admin.reports.section.suppliers')}</SectionTitle>
                <DataTable rows={report.suppliers} rowKey={(r) => r.id} empty={<Empty title={t('admin.reports.none')} />}
                  columns={[{ key: 'n', header: t('admin.match.col.supplier'), render: (r) => r.name }, { key: 'j', header: t('admin.reports.jobs'), render: (r) => r.jobs }, { key: 'c', header: t('admin.reports.collected'), render: (r) => `${r.collected}/${r.jobs}` }, { key: 'r', header: t('admin.reports.rating'), render: (r) => r.rating ?? '-' }]} />
              </section>
              <section>
                <SectionTitle>{t('admin.reports.section.drivers')}</SectionTitle>
                <DataTable rows={report.drivers} rowKey={(r) => r.id} empty={<Empty title={t('admin.reports.none')} />}
                  columns={[{ key: 'n', header: t('admin.schedule.driver'), render: (r) => r.name }, { key: 't', header: t('admin.reports.trips'), render: (r) => r.trips }, { key: 'd', header: t('admin.reports.delivered'), render: (r) => `${r.delivered}/${r.trips}` }, { key: 'r', header: t('admin.reports.rating'), render: (r) => r.rating ?? '-' }]} />
              </section>
            </div>
          </div>
        )}
      </LoadState>
    </AdminLayout>
  );
}
