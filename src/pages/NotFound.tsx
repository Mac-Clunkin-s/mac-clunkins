import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-cream px-6 text-center text-ink">
      <h1 className="font-heading text-3xl font-bold">Page not found</h1>
      <p className="font-body text-ink/60">That page doesn&rsquo;t exist, or you don&rsquo;t have access to it.</p>
      <Link to="/" className="font-body font-semibold text-chilli hover:underline">
        Back to McCluckin&rsquo;s
      </Link>
    </div>
  );
}
