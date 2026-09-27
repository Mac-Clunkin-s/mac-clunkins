import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary';

const base =
  'inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 font-body font-semibold transition disabled:cursor-not-allowed disabled:opacity-60';

const variants: Record<Variant, string> = {
  primary: 'bg-chilli text-cream hover:bg-chilli/90',
  secondary: 'bg-transparent text-ink border border-ink/20 hover:bg-ink/5',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: { variant?: Variant } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button className={`${base} ${variants[variant]} ${className}`} {...props} />;
}
