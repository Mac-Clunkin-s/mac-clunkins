import type { ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';
import { Button } from './Button';

export function DashboardShell({
  roleLabel,
  children,
}: {
  roleLabel: string;
  children: ReactNode;
}) {
  const { profile, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="flex items-center justify-between border-b border-ink/10 bg-white px-6 py-4 sm:px-10">
        <div>
          <span className="font-heading text-lg font-bold text-chilli">McCluckin&rsquo;s</span>
          <span className="ml-2 rounded-full bg-mustard/30 px-2.5 py-0.5 font-body text-xs font-semibold uppercase tracking-wide text-ink/70">
            {roleLabel}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden font-body text-sm text-ink/70 sm:inline">
            {profile?.full_name ?? '…'}
          </span>
          <Button variant="secondary" onClick={() => void signOut()}>
            Log out
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8 sm:px-10">{children}</main>
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-ink/20 bg-white/60 px-6 py-12 text-center">
      <h2 className="font-heading text-lg font-bold">{title}</h2>
      <p className="mx-auto mt-2 max-w-md font-body text-sm text-ink/60">{body}</p>
    </div>
  );
}
