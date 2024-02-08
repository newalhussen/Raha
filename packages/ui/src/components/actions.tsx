import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ButtonVariant = 'amber' | 'ink' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

/** Class string for anything that should look like a button (use it on <Link>/<a> too). One amber action per view. */
export function buttonClass({ variant = 'ink', size = 'md', block = false, spread = false }: { variant?: ButtonVariant; size?: ButtonSize; block?: boolean; spread?: boolean } = {}): string {
  return ['btn', `btn-${variant}`, size !== 'md' ? `btn-${size}` : '', block ? 'btn-block' : '', spread ? 'btn-spread' : ''].filter(Boolean).join(' ');
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  spread?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({ variant = 'ink', size = 'md', block, spread, loading, disabled, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={[buttonClass({ variant, size, block, spread }), className].filter(Boolean).join(' ')} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <span className="spin" aria-hidden /> : null}
      {children}
    </button>
  );
}
