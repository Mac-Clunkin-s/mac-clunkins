import { useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Button } from '../../components/Button';
import { FormError } from '../../components/FormField';
import { PageSpinner } from '../../components/PageSpinner';
import { formatCents } from '../../lib/format';
import { getCase, replyToCase } from './api';
import { BuyerLayout, Card } from './components/BuyerLayout';
import { useAsync } from './hooks/useAsync';
import { t } from './i18n-shim';
import { formatDateTime } from './lib/dates';
import type { CaseStatus } from './types';

export const CASE_FLOW: CaseStatus[] = ['open', 'in_review', 'awaiting_info', 'resolved', 'closed'];

export default function CaseDetail() {
  const { id = '' } = useParams();
  const { profile } = useAuth();
  const location = useLocation();
  const photosFailed = (location.state as { photosFailed?: number } | null)?.photosFailed ?? 0;
  const myId = profile?.id ?? '';
  const { data, loading, error, reload } = useAsync(() => getCase(id, myId), [id, myId]);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  async function onReply(e: FormEvent) {
    e.preventDefault();
    if (!reply.trim() || !profile) return;
    setBusy(true);
    setReplyError(null);
    try {
      await replyToCase(id, profile.id, reply.trim());
      setReply('');
      reload();
    } catch {
      setReplyError(t('buyer.case.replyError'));
    } finally {
      setBusy(false);
    }
  }

  const c = data?.case;
  const step = c ? CASE_FLOW.indexOf(c.status) : -1;

  return (
    <BuyerLayout>
      {loading && !data && <PageSpinner label={t('buyer.case.loading')} />}
      <FormError message={error ? t('buyer.case.loadError') : null} />
      {c && data && (
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-sm text-ink/60">{t('buyer.case.number')}</p>
            <h1 className="font-heading text-2xl font-bold">{c.number}</h1>
            <p className="text-sm text-ink/70">{t(`buyer.caseType.${c.type}`)}</p>
          </div>

          {photosFailed > 0 && (
            <p role="status" className="rounded-lg bg-mustard/20 px-3 py-2 text-sm">
              {t('buyer.case.photosFailed', { n: photosFailed })}
            </p>
          )}

          <Card>
            <ol className="flex flex-wrap gap-2" aria-label={t('buyer.case.statusLabel')}>
              {CASE_FLOW.map((s, i) => (
                <li
                  key={s}
                  aria-current={i === step ? 'step' : undefined}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    i === step ? 'bg-chilli text-cream' : i < step ? 'bg-ink/10 text-ink' : 'bg-white text-ink/40 ring-1 ring-ink/10'
                  }`}
                >
                  {t(`buyer.caseStatus.${s}`)}
                </li>
              ))}
            </ol>
          </Card>

          {c.amount_cents !== null && (c.resolution === 'refund' || c.resolution === 'credit') && (
            <Card className="ring-1 ring-emerald-300">
              <p className="text-sm text-ink/60">
                {t(c.resolution === 'refund' ? 'buyer.case.expectedRefund' : 'buyer.case.expectedCredit')}
              </p>
              <p className="font-heading text-2xl font-bold" data-testid="expected-refund">
                {formatCents(c.amount_cents)}
              </p>
            </Card>
          )}

          <Card>
            <h2 className="font-heading font-bold">{t('buyer.case.timeline')}</h2>
            {data.events.length === 0 ? (
              <p className="mt-1 text-sm text-ink/60">{t('buyer.case.noEvents')}</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {data.events.map((e) =>
                  e.kind === 'message' ? (
                    <li
                      key={e.id}
                      className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                        e.actor_is_me ? 'self-end bg-ink text-cream' : 'self-start bg-mustard/25'
                      }`}
                    >
                      <p className="text-xs opacity-70">
                        {e.actor_is_me ? t('buyer.case.you') : t('buyer.case.team')} · {formatDateTime(e.created_at)}
                      </p>
                      <p>{e.body}</p>
                    </li>
                  ) : (
                    <li key={e.id} className="text-sm text-ink/70">
                      <span className="font-semibold">{t(`buyer.case.kind.${e.kind}`)}</span>
                      {e.body ? `: ${e.body}` : ''}
                      <span className="block text-xs text-ink/50">{formatDateTime(e.created_at)}</span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </Card>

          {c.status !== 'closed' && (
            <Card>
              <form onSubmit={(e) => void onReply(e)} className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-sm" htmlFor="reply">
                  <span className="font-medium text-ink/80">
                    {t(c.status === 'awaiting_info' ? 'buyer.case.replyNeeded' : 'buyer.case.reply')}
                  </span>
                  <textarea
                    id="reply"
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    className="rounded-lg border border-ink/15 bg-white px-3 py-2"
                  />
                </label>
                <FormError message={replyError} />
                <Button type="submit" disabled={busy || !reply.trim()}>
                  {t('buyer.case.send')}
                </Button>
              </form>
            </Card>
          )}

          {c.order_id && (
            <Link to={`/orders/${c.order_id}`} className="font-semibold text-chilli">
              {t('buyer.case.viewOrder')}
            </Link>
          )}
        </div>
      )}
    </BuyerLayout>
  );
}
