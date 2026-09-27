export function PageSpinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-cream text-ink">
      <div
        className="h-8 w-8 animate-spin rounded-full border-4 border-chilli/20 border-t-chilli"
        role="status"
        aria-label={label}
      />
      <p className="font-body text-sm text-ink/70">{label}</p>
    </div>
  );
}
