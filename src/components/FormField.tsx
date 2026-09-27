import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react';

const fieldClass =
  'w-full rounded-lg border border-ink/15 bg-white px-3 py-2 font-body text-ink placeholder:text-ink/40 focus:border-chilli focus:outline-none focus:ring-2 focus:ring-chilli/30';

export function TextField({
  label,
  id,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink/80">{label}</span>
      <input id={id} className={fieldClass} {...props} />
    </label>
  );
}

export function SelectField({
  label,
  id,
  children,
  ...props
}: { label: string; children: ReactNode } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink/80">{label}</span>
      <select id={id} className={fieldClass} {...props}>
        {children}
      </select>
    </label>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-chilli/10 px-3 py-2 text-sm text-chilli">
      {message}
    </p>
  );
}
