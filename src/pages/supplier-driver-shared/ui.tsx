import type { ChangeEvent, ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { t } from './t';

export function SubNav({ items }: { items: { to: string; label: string }[] }) {
  return (
    <nav aria-label={t('common.navigation')} className="-mx-1 mb-6 flex gap-2 overflow-x-auto pb-1">
      {items.map((i) => (
        <NavLink
          key={i.to}
          to={i.to}
          className={({ isActive }) =>
            `inline-flex min-h-12 shrink-0 items-center rounded-full px-5 font-body text-sm font-semibold ${
              isActive ? 'bg-ink text-cream' : 'bg-white text-ink/70 hover:bg-ink/5'
            }`
          }
        >
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: { id: T; label: string; count?: number }[];
}) {
  return (
    <div role="tablist" className="flex gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={value === tab.id}
          onClick={() => onChange(tab.id)}
          className={`min-h-12 flex-1 rounded-full px-4 font-body text-sm font-semibold ${
            value === tab.id ? 'bg-chilli text-cream' : 'bg-white text-ink/70'
          }`}
        >
          {tab.label}
          {tab.count != null ? ` (${tab.count})` : ''}
        </button>
      ))}
    </div>
  );
}

export function Card({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm sm:p-5">
      {title && <h2 className="mb-3 font-heading text-lg font-bold">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, tone = 'ink' }: { label: string; value: string; tone?: 'ink' | 'chilli' }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm">
      <p className="font-body text-xs uppercase tracking-wide text-ink/60">{label}</p>
      <p className={`font-heading text-2xl font-bold ${tone === 'chilli' ? 'text-chilli' : ''}`}>{value}</p>
    </div>
  );
}

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'good' | 'warn' | 'bad' }) {
  const cls = {
    neutral: 'bg-ink/10 text-ink/70',
    good: 'bg-green-100 text-green-800',
    warn: 'bg-mustard/40 text-ink',
    bad: 'bg-chilli/15 text-chilli',
  }[tone];
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 font-body text-xs font-semibold uppercase tracking-wide ${cls}`}>
      {children}
    </span>
  );
}

export function FileField({
  label,
  accept = 'image/*',
  capture,
  done,
  onFile,
  disabled,
}: {
  label: string;
  accept?: string;
  capture?: 'environment' | 'user';
  done?: boolean;
  disabled?: boolean;
  onFile: (f: File) => void;
}) {
  function handle(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = '';
  }
  return (
    <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-xl border border-dashed border-ink/25 bg-cream px-4 py-3 font-body text-sm font-semibold">
      <span>{label}</span>
      <span className={done ? 'text-green-700' : 'text-ink/50'}>{done ? t('common.attached') : t('common.choose_file')}</span>
      <input type="file" accept={accept} capture={capture} disabled={disabled} onChange={handle} className="sr-only" />
    </label>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  id,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  step?: number;
  id: string;
}) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink/80">{label}</span>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-12 w-full rounded-lg border border-ink/15 bg-white px-3 py-2 font-body text-ink focus:border-chilli focus:outline-none focus:ring-2 focus:ring-chilli/30"
      />
    </label>
  );
}

export function Check({ label, checked, onChange, id }: { label: string; checked: boolean; onChange: (v: boolean) => void; id: string }) {
  return (
    <label htmlFor={id} className="flex min-h-12 items-center gap-3 font-body text-sm">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 accent-chilli" />
      {label}
    </label>
  );
}
