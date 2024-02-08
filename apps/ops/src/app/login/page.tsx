'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, Field, Input, Logo } from '@raha/ui';
import { ApiError, postSession } from '@raha/web-kit/client';

function Form() {
  const router = useRouter();
  const next = useSearchParams().get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await postSession('staff-login', { email, password });
      router.replace(next && next.startsWith('/') && !next.startsWith('//') ? next : '/');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="col gap-20" style={{ width: 'min(100%, 380px)' }}>
      <Logo size={30} wordSize={24} tag="OPS" />
      <div className="col gap-6">
        <h1 className="h1" style={{ fontSize: 28 }}>Operations sign-in</h1>
        <p className="small muted">Raha staff only. Actions are logged with your name.</p>
      </div>
      <Field label="Work email"><Input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus placeholder="you@raha.et" /></Field>
      <Field label="Password"><Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      <Button type="submit" variant="amber" size="lg" block loading={busy} disabled={!email || !password}>Sign in</Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Suspense>
        <Form />
      </Suspense>
    </main>
  );
}
