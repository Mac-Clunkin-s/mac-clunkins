import { Link } from 'react-router-dom';

const STEPS = [
  {
    title: '1. Order',
    body: 'Pick a bird type and quantity, drop a pin anywhere in South Africa, and get an instant quote.',
  },
  {
    title: '2. We source',
    body: 'McCluckin’s matches you to a nearby approved supplier and schedules a driver.',
  },
  {
    title: '3. Delivered',
    body: 'Your driver arrives with your live chickens; count them together and you’re done.',
  },
];

const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'zu', label: 'isiZulu' },
  { code: 'st', label: 'Sesotho' },
  { code: 'tn', label: 'Setswana' },
];

export default function Welcome() {
  return (
    <div className="flex min-h-screen flex-col bg-cream text-ink">
      <header className="flex items-center justify-between px-6 py-4 sm:px-10">
        <span className="font-heading text-xl font-bold text-chilli">McCluckin&rsquo;s</span>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only">Language</span>
          <select
            defaultValue="en"
            className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-sm"
            aria-label="Choose language"
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <main className="flex-1 px-6 sm:px-10">
        <section className="mx-auto max-w-3xl py-12 text-center sm:py-20">
          <h1 className="font-heading text-4xl font-extrabold leading-tight sm:text-5xl">
            Live chickens, delivered anywhere in South Africa.
          </h1>
          <p className="mx-auto mt-4 max-w-xl font-body text-lg text-ink/70">
            McCluckin&rsquo;s connects shisanyamas, kota shops, taverns and caterers to approved
            suppliers and a trusted delivery fleet &mdash; one order at a time.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/signup?role=buyer"
              className="rounded-full bg-chilli px-6 py-3 font-body font-semibold text-cream hover:bg-chilli/90"
            >
              Order now
            </Link>
            <Link
              to="/signup?role=supplier"
              className="rounded-full border border-ink/20 px-6 py-3 font-body font-semibold text-ink hover:bg-ink/5"
            >
              Supply chickens
            </Link>
            <Link
              to="/signup?role=driver"
              className="rounded-full border border-ink/20 px-6 py-3 font-body font-semibold text-ink hover:bg-ink/5"
            >
              Drive for us
            </Link>
          </div>
        </section>

        <section className="mx-auto grid max-w-4xl gap-6 pb-16 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.title} className="rounded-2xl bg-white p-6 shadow-sm">
              <h2 className="font-heading text-lg font-bold text-chilli">{step.title}</h2>
              <p className="mt-2 font-body text-sm text-ink/70">{step.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-ink/10 px-6 py-8 text-sm text-ink/60 sm:px-10">
        <div className="mx-auto flex max-w-4xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p>McCluckin&rsquo;s is a trading name of IdeaXec (Pty) Ltd. &middot; South Africa</p>
          <nav className="flex gap-4">
            <Link to="/legal/terms" className="hover:text-chilli">
              Terms
            </Link>
            <Link to="/legal/refunds" className="hover:text-chilli">
              Refund policy
            </Link>
            <Link to="/legal/privacy" className="hover:text-chilli">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
