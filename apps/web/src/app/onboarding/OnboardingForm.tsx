'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Field, Icon, Input, Logo, type IconName } from '@raha/ui';
import { ApiError, api, postSession } from '@raha/web-kit/client';
import type { OrgType, SessionDto } from '@raha/contracts';

const TYPES: Array<{ type: OrgType; icon: IconName; title: string; text: string }> = [
  { type: 'shipper', icon: 'package', title: 'I send cargo', text: 'A business that needs goods moved: book space on trucks already heading your way.' },
  { type: 'fleet', icon: 'truck', title: 'I own trucks', text: 'A fleet or owner-operator: publish empty space and fill it, including return legs.' },
  { type: 'brokerage', icon: 'route', title: 'I broker loads', text: 'A dispatcher: log loads from calls and match them to trucks in your network.' },
];

export function OnboardingForm({ name, initialType }: { name: string; initialType: OrgType }) {
  const router = useRouter();
  const [type, setType] = useState<OrgType>(initialType);
  const [company, setCompany] = useState('');
  const [city, setCity] = useState('Addis Ababa');
  const [tin, setTin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (company.trim().length < 2) return setError('Enter your company name.');
    setBusy(true);
    setError(null);
    try {
      const session = await api<SessionDto>('orgs', { body: { type, name: company.trim(), city: city.trim() || undefined, tin: tin.trim() || undefined } });
      const created = session.memberships.filter((m) => m.organizationType === type).at(-1);
      if (created) await postSession('org', { orgId: created.organizationId });
      router.replace('/home');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not create the account. Try again.');
      setBusy(false);
    }
  }

  return (
    <main className="col" style={{ minHeight: '100vh', alignItems: 'center', padding: '40px 20px', gap: 32 }}>
      <Logo size={28} wordSize={22} tone="primary" />
      <form className="col gap-24" onSubmit={submit} style={{ width: 'min(100%, 720px)' }} noValidate>
        <div className="col gap-6">
          <span className="kicker kicker-amber">WELCOME{name ? `, ${name.split(' ')[0]!.toUpperCase()}` : ''}</span>
          <h1 className="h1">Set up your company account</h1>
          <p className="muted">You can invite your team after this. Raha Operations verifies companies before they can ship or publish space.</p>
        </div>
        <div className="grid-auto" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))' }} role="radiogroup" aria-label="Account type">
          {TYPES.map((t) => (
            <button key={t.type} type="button" role="radio" aria-checked={type === t.type} onClick={() => setType(t.type)} className="panel" style={{ padding: 18, textAlign: 'left', cursor: 'pointer', borderWidth: type === t.type ? 2 : 1, borderColor: type === t.type ? 'var(--ink)' : 'var(--border)', display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--surface)' }}>
              <span className="row between"><Icon name={t.icon} size={26} />{type === t.type ? <span className="tone-ink pill pill-mono">SELECTED</span> : null}</span>
              <span className="h3">{t.title}</span>
              <span className="small muted">{t.text}</span>
            </button>
          ))}
        </div>
        <div className="grid-auto">
          <Field label="Company name"><Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Sheba Agro PLC" autoFocus /></Field>
          <Field label="City"><Input value={city} onChange={(e) => setCity(e.target.value)} /></Field>
          <Field label="TIN (optional)" hint="10 digits. Needed for verification."><Input className="mono" value={tin} onChange={(e) => setTin(e.target.value.replace(/\D/g, '').slice(0, 10))} inputMode="numeric" /></Field>
        </div>
        {error ? <div className="notice error" role="alert">{error}</div> : null}
        <div className="row">
          <Button type="submit" variant="amber" size="lg" loading={busy}>Create account →</Button>
        </div>
      </form>
    </main>
  );
}

