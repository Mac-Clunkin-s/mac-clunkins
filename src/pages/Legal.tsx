import { Link } from 'react-router-dom';

const COPY: Record<string, { title: string; body: string }> = {
  terms: {
    title: 'Terms of service',
    body: 'Draft — published here once legal review of the Compliance and onboarding tab is complete.',
  },
  refunds: {
    title: 'Refund policy',
    body: 'Draft — published here once the cancellation and refund rules are finalised.',
  },
  privacy: {
    title: 'Privacy',
    body: 'Draft — buyers, suppliers and drivers never see each other’s identities, prices or contact details. Full POPIA notice to follow.',
  },
};

export default function Legal({ page }: { page: keyof typeof COPY }) {
  const { title, body } = COPY[page];
  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-cream px-6 py-16 text-ink">
      <Link to="/" className="font-body text-sm text-chilli hover:underline">
        &larr; Back to McCluckin&rsquo;s
      </Link>
      <h1 className="mt-4 font-heading text-3xl font-bold">{title}</h1>
      <p className="mt-4 font-body text-ink/70">{body}</p>
    </div>
  );
}
