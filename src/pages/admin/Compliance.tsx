import { Link } from 'react-router-dom';
import { loadCompliance } from './api';
import { useAdminData } from './hooks/useAdminData';
import { daysUntil, pdmaDueDate } from './logic/dates';
import { t } from './i18n';
import { AdminLayout, DataTable, Empty, LoadState, Pill, SectionTitle, displayName, formatDate, formatDateTime, tStatus } from './ui';

export default function AdminCompliance() {
  const { data, loading, error } = useAdminData(loadCompliance, []);
  const now = new Date();
  return (
    <AdminLayout title={t('admin.compliance.title')} subtitle={t('admin.compliance.subtitle')}>
      <LoadState loading={loading} error={error} hasData={!!data}>
        {data && (
          <div className="flex flex-col gap-8">
            <section>
              <SectionTitle>{t('admin.compliance.pdma')}</SectionTitle>
              <DataTable
                rows={data.reports}
                rowKey={(r) => r.id}
                empty={<Empty title={t('admin.compliance.pdmaNone')} />}
                columns={[
                  { key: 'm', header: t('admin.compliance.month'), render: (r) => r.month.slice(0, 7) },
                  { key: 'd', header: t('admin.compliance.due'), render: (r) => formatDate(pdmaDueDate(r.month).toISOString()) },
                  { key: 's', header: t('admin.cases.col.status'), render: (r) => {
                    const late = r.status !== 'submitted' && pdmaDueDate(r.month) < now;
                    return <Pill tone={r.status === 'submitted' ? 'good' : late ? 'bad' : 'warn'}>{late ? t('admin.compliance.overdue') : tStatus('pdma', r.status)}</Pill>;
                  } },
                  { key: 'x', header: t('admin.compliance.submittedAt'), render: (r) => formatDateTime(r.submitted_at) },
                ]}
              />
            </section>

            <section>
              <SectionTitle>{t('admin.compliance.docs')}</SectionTitle>
              <DataTable
                rows={data.expiringDocs}
                rowKey={(d) => d.id}
                empty={<Empty title={t('admin.compliance.docsNone')} />}
                columns={[
                  { key: 'o', header: t('admin.compliance.owner'), render: (d) => <Link to="/admin/users" className="text-chilli hover:underline">{displayName(d.owner)}</Link> },
                  { key: 'k', header: t('admin.compliance.document'), render: (d) => t(`admin.doc.${d.kind}`) },
                  { key: 'e', header: t('admin.compliance.expires'), render: (d) => formatDate(d.expires_on) },
                  { key: 'l', header: t('admin.compliance.left'), render: (d) => {
                    const days = daysUntil(d.expires_on as string, now);
                    return <Pill tone={days < 0 ? 'bad' : 'warn'}>{days < 0 ? t('admin.review.expired') : t('admin.compliance.days', { count: days })}</Pill>;
                  } },
                ]}
              />
            </section>

            <section>
              <SectionTitle>{t('admin.compliance.permits')}</SectionTitle>
              <DataTable
                rows={data.expiringPermits}
                rowKey={(a) => a.id}
                empty={<Empty title={t('admin.compliance.permitsNone')} />}
                columns={[
                  { key: 'o', header: t('admin.orders.col.number'), render: (a) => <Link to={`/admin/orders/${a.order_id}`} className="font-semibold text-chilli hover:underline">{a.order_number ?? a.order_id.slice(0, 8)}</Link> },
                  { key: 'q', header: t('admin.orders.col.birds'), render: (a) => a.quantity },
                  { key: 'v', header: t('admin.compliance.validUntil'), render: (a) => formatDateTime(a.permit_valid_until) },
                  { key: 's', header: t('admin.cases.col.status'), render: (a) => <Pill tone={a.permit_valid_until && new Date(a.permit_valid_until) < now ? 'bad' : 'warn'}>{tStatus('allocation', a.status)}</Pill> },
                ]}
              />
            </section>

            <section>
              <SectionTitle>{t('admin.compliance.zones')}</SectionTitle>
              <DataTable
                rows={data.pausedInZones}
                rowKey={(z) => z.details.profile_id}
                empty={<Empty title={t('admin.compliance.zonesNone')} />}
                columns={[
                  { key: 'n', header: t('admin.match.col.supplier'), render: (z) => z.name },
                  { key: 'p', header: t('admin.orders.col.province'), render: (z) => z.details.province ?? '-' },
                  { key: 'z', header: t('admin.match.col.zone'), render: (z) => <Pill tone="bad">{t(`admin.zone.${z.details.avian_flu_zone}`)}</Pill> },
                  { key: 'r', header: t('admin.compliance.reason'), render: (z) => z.details.paused_reason ?? '-' },
                ]}
              />
            </section>

            <section>
              <SectionTitle>{t('admin.compliance.crossing')}</SectionTitle>
              <DataTable
                rows={data.crossingTrips}
                rowKey={(a) => a.id}
                empty={<Empty title={t('admin.compliance.crossingNone')} />}
                columns={[
                  { key: 'o', header: t('admin.orders.col.number'), render: (a) => <Link to={`/admin/orders/${a.order_id}`} className="font-semibold text-chilli hover:underline">{a.order_number ?? a.order_id.slice(0, 8)}</Link> },
                  { key: 'q', header: t('admin.orders.col.birds'), render: (a) => a.quantity },
                  { key: 'p', header: t('admin.compliance.movementPermit'), render: (a) => <Pill tone={a.movement_permit_path ? 'good' : 'bad'}>{a.movement_permit_path ? t('admin.compliance.permitOnFile') : t('admin.compliance.permitMissing')}</Pill> },
                ]}
              />
            </section>
          </div>
        )}
      </LoadState>
    </AdminLayout>
  );
}
