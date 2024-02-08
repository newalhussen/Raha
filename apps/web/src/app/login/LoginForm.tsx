'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button, Field, Input, InputGroup, Logo, Notice, RahaMark } from '@raha/ui';
import { ApiError, api } from '@raha/web-kit/client';
import { postSession } from '@raha/web-kit/client';
import { normalizeEthiopianPhone } from '@raha/contracts';

type Step = 'phone' | 'code' | 'name';

const INTENT_COPY: Record<string, { title: string; text: string }> = {
  shipper: { title: 'Ship with Raha', text: 'Sign in with your phone, then set up your company account. Your team can join under it.' },
  fleet: { title: 'Fill your empty space', text: 'Sign in, add your trucks and drivers, and publish space on the routes you already run.' },
  brokerage: { title: 'Run your match board', text: 'Sign in, bring your shippers and your truck network, and match loads from one screen.' },
  driver: { title: 'Drivers use the Raha Driver app', text: 'The driver app is for Android. Fleet owners and brokers can sign in here to manage trucks and drivers.' },
};

export function LoginForm({ next, intent }: { next: string | null; intent: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);
  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const normalized = normalizeEthiopianPhone(phone);
  const copy = intent ? INTENT_COPY[intent] : null;

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault();
    if (!normalized) return setError('Enter a valid Ethiopian mobile number, for example 091 120 4418.');
    setBusy(true);
    setError(null);
    try {
      const r = await postSession('otp/request', { phone: normalized });
      setDevCode(r.devCode ?? null);
      setResendIn(r.resendInSeconds ?? 30);
      setStep('code');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send the code. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (code.length !== 6) return setError('The code is 6 digits.');
    setBusy(true);
    setError(null);
    try {
      const r = await postSession('otp/verify', { phone: normalized, code });
      if (r.needsProfile) return setStep('name');
      go();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check the code. Try again.');
      setBusy(false);
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setError('Enter your full name.');
    setBusy(true);
    setError(null);
    try {
      await api('me', { method: 'PATCH', body: { fullName: name.trim() } });
      go();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save your name.');
      setBusy(false);
    }
  }

  function go() {
    const target = next ?? `/home${intent ? `?intent=${encodeURIComponent(intent)}` : ''}`;
    router.replace(target);
    router.refresh();
  }

  return (
    <main style={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
      <section style={{ background: 'var(--basalt)', color: 'var(--bone)', padding: '40px clamp(24px, 5vw, 64px)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 48 }}>
        <Link href="/" style={{ textDecoration: 'none' }}><Logo size={28} wordSize={22} /></Link>
        <div className="col gap-24" style={{ maxWidth: 520 }}>
          <span className="kicker" style={{ color: 'var(--amber)' }}>FREIGHT NETWORK · ETHIOPIA</span>
          <h1 className="display" style={{ fontSize: 'clamp(38px, 5vw, 64px)' }}>{copy?.title ?? 'Cargo meets capacity.'}</h1>
          <p style={{ fontSize: 17, lineHeight: 1.55, color: '#c9c4b8', maxWidth: 460 }}>{copy?.text ?? 'Sign in with your phone number. We text you a six-digit code. No passwords.'}</p>
        </div>
        <div className="row gap-12 mono xs" style={{ color: 'var(--stone)' }}><RahaMark size={18} />Support 8817 · Bole, Addis Ababa</div>
      </section>

      <section style={{ padding: '40px clamp(24px, 5vw, 64px)', display: 'grid', placeItems: 'center' }}>
        <div className="col gap-20" style={{ width: 'min(100%, 400px)' }}>
          {step === 'phone' ? (
            <form className="col gap-20" onSubmit={requestCode} noValidate>
              <div className="col gap-6">
                <h2 className="h1" style={{ fontSize: 28 }}>Sign in</h2>
                <p className="small muted">Phone number · ስልክ ቁጥር</p>
              </div>
              <Field label="Mobile number" error={error}>
                <InputGroup before="+251">
                  <Input className="mono" inputMode="tel" autoComplete="tel-national" autoFocus placeholder="91 120 4418" value={phone} onChange={(e) => setPhone(e.target.value)} aria-label="Mobile number" style={{ fontSize: 18 }} />
                </InputGroup>
              </Field>
              <Button type="submit" variant="amber" size="lg" block spread loading={busy}>Send code <span>→</span></Button>
              <p className="xs muted">We’ll text you a 6-digit code. Standard SMS rates may apply.</p>
            </form>
          ) : null}

          {step === 'code' ? (
            <form className="col gap-20" onSubmit={verify} noValidate>
              <div className="col gap-6">
                <h2 className="h1" style={{ fontSize: 28 }}>Enter the code</h2>
                <p className="small muted">Sent to <span className="mono" style={{ color: 'var(--ink)' }}>{normalized}</span></p>
              </div>
              <Field label="6-digit code" error={error}>
                <Input ref={codeRef} className="mono" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="000000" style={{ fontSize: 28, letterSpacing: '0.4em', height: 60, textAlign: 'center' }} aria-label="6-digit code" />
              </Field>
              {devCode ? <Notice>Development server: your code is <strong className="mono">{devCode}</strong>. <button type="button" className="btn btn-ghost btn-xs" onClick={() => setCode(devCode)}>Fill it in</button></Notice> : null}
              <Button type="submit" variant="amber" size="lg" block spread loading={busy} disabled={code.length !== 6}>Continue <span>→</span></Button>
              <div className="row between small">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setStep('phone'); setCode(''); setError(null); }}>← Change number</button>
                <button type="button" className="btn btn-ghost btn-sm" disabled={resendIn > 0 || busy} onClick={() => void requestCode()}>{resendIn > 0 ? `Resend in 0:${String(resendIn).padStart(2, '0')}` : 'Resend code'}</button>
              </div>
            </form>
          ) : null}

          {step === 'name' ? (
            <form className="col gap-20" onSubmit={saveName} noValidate>
              <div className="col gap-6">
                <h2 className="h1" style={{ fontSize: 28 }}>Welcome to Raha</h2>
                <p className="small muted">What should we call you?</p>
              </div>
              <Field label="Your full name" error={error}>
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Hanna Girma" autoComplete="name" />
              </Field>
              <Button type="submit" variant="amber" size="lg" block spread loading={busy}>Continue <span>→</span></Button>
            </form>
          ) : null}
        </div>
      </section>
    </main>
  );
}
