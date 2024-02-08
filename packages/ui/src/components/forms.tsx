import type { InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export function Field({ label, hint, error, children, grow }: { label?: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; grow?: boolean }) {
  return (
    <label className="field" style={grow ? { flex: 1 } : undefined}>
      {label ? <span className="label">{label}</span> : null}
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="xs muted">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean; ref?: Ref<HTMLInputElement> }) {
  return <input className={['input', invalid ? 'input-error' : '', className].filter(Boolean).join(' ')} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={['textarea', className].filter(Boolean).join(' ')} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={['select', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </select>
  );
}

/** Input with a fixed prefix/suffix — "+251 | 91 120 4418", "800 | kg". */
export function InputGroup({ before, after, children }: { before?: ReactNode; after?: ReactNode; children: ReactNode }) {
  return (
    <div className="input-group">
      {before ? <span className="addon mono">{before}</span> : null}
      {children}
      {after ? <span className="addon after mono muted">{after}</span> : null}
    </div>
  );
}
