import { Link } from 'react-router-dom';
import { useSupabaseQuery } from '../lib/useQuery';
import { supabase } from '../lib/supabase';

// McCluckin's privacy & collection notice — v1 (IDE-21 workstream A, G5).
//
// This is a factual description of what our own schema collects, drawn from the
// migrations in supabase/migrations/, not a legal document drafted by counsel. Terms of
// service and the refund policy stay drafts pending legal review (see /legal/terms and
// /legal/refunds); this notice is the one document in that set that ships for real,
// because §3.1 requires it before a real signup can lawfully happen.
//
// Effective dates come from public.settings so a version bump is a data change, not a
// code change — see supabase/seed.sql.

const RETENTION_ROWS: { dataClass: string; retention: string; trigger: string }[] = [
  {
    dataClass: 'Identity and contact details, including WhatsApp number (all roles)',
    retention: 'Active account, plus 30 days',
    trigger: 'Account closure + 30 days. Fields referenced by a financial record we must keep are anonymised, not deleted.',
  },
  {
    dataClass: 'Delivery addresses, farm and pickup locations',
    retention: 'Active account, plus 30 days',
    trigger: 'Account closure + 30 days',
  },
  {
    dataClass: 'Driver location and trip traces',
    retention: '30 days after trip completion',
    trigger: 'Scheduled purge. Anonymised aggregates with no re-identification path may persist.',
  },
  {
    dataClass: 'Proof-of-delivery photographs',
    retention: '90 days after delivery; if a case is open at day 90, until it closes + 30 days; hard cap 180 days',
    trigger: 'Case-aware scheduled purge',
  },
  {
    dataClass: 'Bank details (suppliers and drivers)',
    retention: 'Account closure + 30 days, or the last pending payout settling + 30 days, whichever is later',
    trigger: 'Hard delete of the account/branch/number. The payout record keeps a masked last-4 only.',
  },
  {
    dataClass: 'Driver licence, PrDP and vehicle documents',
    retention: 'Validity expiry or account closure, whichever is later, plus 12 months',
    trigger: 'Kept to show a legally-required check was performed',
  },
  {
    dataClass: 'Orders, quotes, payments, transfers, refunds',
    retention: '5 years from the end of the tax year the transaction falls in',
    trigger: 'Statutory record-keeping period. A deletion request anonymises the personal fields and keeps the transaction.',
  },
  {
    dataClass: 'Your consent records',
    retention: '5 years after the consent ends (withdrawal or account closure)',
    trigger: 'Pseudonymised to a profile id after account deletion',
  },
  {
    dataClass: 'Notifications sent to you',
    retention: '12 months',
    trigger: 'Rolling purge',
  },
];

function useSetting(key: string): string | null {
  const { data } = useSupabaseQuery<{ value: unknown }[]>(
    () => supabase.from('settings').select('value').eq('key', key),
    [key],
  );
  const value = data?.[0]?.value;
  return typeof value === 'string' ? value : null;
}

export default function PrivacyNotice() {
  const effectiveDate = useSetting('privacy_notice_effective_date');

  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-cream px-6 py-16 text-ink">
      <Link to="/" className="font-body text-sm text-chilli hover:underline">
        &larr; Back to McCluckin&rsquo;s
      </Link>
      <h1 className="mt-4 font-heading text-3xl font-bold">Privacy & collection notice</h1>
      <p className="mt-2 font-body text-sm text-ink/60">
        Version privacy_notice_v1 &middot; effective {effectiveDate ?? '…'}
      </p>

      <p className="mt-6 font-body text-ink/80">
        This notice describes what McCluckin&rsquo;s collects about you, why, how long we
        keep it, and how to ask for a copy or ask us to delete it. It covers buyers,
        suppliers, drivers and admins &mdash; the same platform, different roles.
      </p>

      <section className="mt-8">
        <h2 className="font-heading text-xl font-bold">What we collect, and why</h2>
        <p className="mt-2 font-body text-ink/80">
          Every account holds identity and contact details &mdash; your name, business
          name, WhatsApp number, email and preferred language &mdash; so we know who you
          are and can reach you about an order or a job. Beyond that, what we hold depends
          on your role:
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 font-body text-ink/80">
          <li>
            <strong>Buyers:</strong> delivery addresses (including the map location used to
            calculate distance and delivery fee), orders, quotes, payments, refunds,
            ratings and any case you raise about a delivery. If you resell more than five
            birds, your PDMA number.
          </li>
          <li>
            <strong>Suppliers:</strong> farm name and pickup location, PDMA number, avian
            flu zone status, prices and stock you list, job (allocation) details including
            load and permit photographs, compliance documents (licences, permits), and
            bank details for payout &mdash; encrypted at rest, and not yet collected while
            Phase 1 runs in test mode.
          </li>
          <li>
            <strong>Drivers:</strong> vehicle and licence details (registration, PrDP,
            operator card, insurance), trip records including pickup/delivery counts and
            photographs (disinfection and proof-of-delivery), and bank details for payout
            on the same encrypted, not-yet-collected basis as suppliers.
          </li>
          <li>
            <strong>Everyone:</strong> the consent records described below, and entries in
            our audit log when an admin changes your account&rsquo;s status.
          </li>
        </ul>
        <p className="mt-3 font-body text-ink/80">
          By design, buyers, suppliers and drivers never see each other&rsquo;s identities,
          prices or contact details through the app &mdash; that boundary is enforced at
          the database level, not just in what the screens show.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-heading text-xl font-bold">How long we keep it</h2>
        <p className="mt-2 font-body text-ink/80">
          Every data class has a retention period and a deletion trigger. Nothing is kept
          indefinitely.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] border-collapse font-body text-sm">
            <thead>
              <tr className="border-b border-ink/15 text-left">
                <th className="py-2 pr-4 font-semibold">Data</th>
                <th className="py-2 pr-4 font-semibold">Kept for</th>
                <th className="py-2 font-semibold">Then</th>
              </tr>
            </thead>
            <tbody>
              {RETENTION_ROWS.map((row) => (
                <tr key={row.dataClass} className="border-b border-ink/10 align-top">
                  <td className="py-2 pr-4">{row.dataClass}</td>
                  <td className="py-2 pr-4">{row.retention}</td>
                  <td className="py-2 text-ink/70">{row.trigger}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-heading text-xl font-bold">Where your data is processed</h2>
        <p className="mt-2 font-body text-ink/80">
          McCluckin&rsquo;s is a South African business, but{' '}
          <strong>your personal data is processed outside South Africa.</strong> Our
          website is served from Hostinger and holds no personal data itself. Your
          account, order and job data lives in one Supabase region outside South Africa,
          chosen for the lowest latency to Johannesburg when a South African region isn't
          available. We rely on our providers&rsquo; contractual data-protection terms as
          the primary safeguard for this transfer, and your acceptance of this notice at
          signup as a secondary, recorded basis. We do not use a second region, a
          cross-region replica, or multi-region storage.
        </p>
        <p className="mt-2 font-body text-ink/80">
          The parties who process your data on our behalf, and where: Supabase (database,
          login and file storage), Hostinger (website hosting) and Paystack (payments,
          test mode only in Phase 1).
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-heading text-xl font-bold">Your consent</h2>
        <p className="mt-2 font-body text-ink/80">
          When you sign up, we record your agreement to this notice and to our{' '}
          <Link to="/legal/terms" className="text-chilli hover:underline">
            terms of service
          </Link>{' '}
          separately, along with your acknowledgement that data is processed outside South
          Africa. We also record that you have been notified of service messages needed to
          run your orders or jobs &mdash; those aren&rsquo;t optional, because we can&rsquo;t
          run the service without telling you your order status. Marketing messages are a
          separate, independent choice: opt-in, off by default, and you may change it at
          any time. None of these are combined into a single "notifications" toggle.
          Every consent decision is kept as a permanent history, not overwritten &mdash;
          withdrawing or changing your mind adds a new record rather than erasing the old
          one.
        </p>
      </section>

      <section className="mt-8">
        <h2 className="font-heading text-xl font-bold">Getting a copy or asking us to delete it</h2>
        <p className="mt-2 font-body text-ink/80">
          Email us at{' '}
          <a href="mailto:privacy@mccluckins.co.za" className="text-chilli hover:underline">
            privacy@mccluckins.co.za
          </a>{' '}
          to ask for a copy of your data or to ask us to delete your account. We&rsquo;ll
          acknowledge your request within 5 business days and respond within 30 days. An
          export never includes another party&rsquo;s identity, prices or contact details,
          and any bank account number is masked to its last four digits. Deletion means a
          hard delete wherever the law allows it; where we&rsquo;re required to keep a
          financial record (see the table above), we anonymise your personal details on it
          and keep the transaction. Every deletion is itself logged, referencing your
          anonymised id, so the record of what happened survives even though you don&rsquo;t
          need to.
        </p>
      </section>
    </div>
  );
}
