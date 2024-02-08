import Link from 'next/link';
import type { VerificationCaseDto, VerificationQueueDto, VerificationSubject } from '@raha/contracts';
import { Avatar, Photo } from '@raha/ui';
import { DecisionBar } from '@/components/DecisionBar';
import { api } from '@/lib/raha';

const TABS: Array<[VerificationSubject, string]> = [['driver', 'Drivers'], ['vehicle', 'Vehicles'], ['organization', 'Companies']];

export default async function Verification({ searchParams }: { searchParams: Promise<{ type?: string; case?: string }> }) {
  const { type: rawType, case: caseId } = await searchParams;
  const type = (['driver', 'vehicle', 'organization'].includes(rawType ?? '') ? rawType : 'driver') as VerificationSubject;
  const q = await api<VerificationQueueDto>(`/ops/verification?type=${type}`, { org: null });
  const selected = q.items.find((i) => i.caseId === caseId) ?? q.items[0];
  const c = selected ? await api<VerificationCaseDto>(`/ops/verification/${selected.caseId}`, { org: null }) : null;

  return (
    <main style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))' }}>
      <section style={{ borderRight: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div className="row gap-6 wrap" style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          {TABS.map(([t, label]) => (
            <Link key={t} href={`/verification?type=${t}`} className={`chip ${t === type ? '' : 'chip-off'}`} style={t === type ? { background: 'var(--bone)', color: 'var(--basalt)', fontWeight: 600, textDecoration: 'none' } : { textDecoration: 'none' }}>
              {label} · {q.counts[t]}
            </Link>
          ))}
        </div>
        {q.items.length === 0 ? <p className="p-20 small muted">Queue is empty.</p> : null}
        {q.items.map((i) => (
          <Link key={i.caseId} href={`/verification?type=${type}&case=${i.caseId}`} className="row between gap-10" style={{ padding: '14px 18px', borderBottom: '1px solid var(--graphite)', borderLeft: `3px solid ${i.caseId === selected?.caseId ? 'var(--amber)' : 'transparent'}`, background: i.caseId === selected?.caseId ? 'var(--graphite)' : 'transparent', textDecoration: 'none', color: 'inherit' }}>
            <div><div className="semi small">{i.name}</div><div className="xs muted">{i.subtitle}</div></div>
            <span className="mono xs muted">{i.ageLabel}</span>
          </Link>
        ))}
      </section>

      <section style={{ gridColumn: 'span 2', padding: 24, display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>
        {c ? (
          <>
            <div className="row between wrap gap-16" style={{ alignItems: 'flex-start' }}>
              <div className="row gap-14"><Avatar name={c.subject.initials} size={56} /><div><div className="h2" style={{ fontSize: 24 }}>{c.subject.name}</div><div className="small muted">{c.subject.subtitle}</div></div></div>
              <DecisionBar caseId={c.caseId} />
            </div>
            {c.missing.length ? <div className="notice">Missing: {c.missing.join(', ')}. Approval needs every document.</div> : null}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {c.documents.map((d) => (
                <div key={d.id} className="panel" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10, borderColor: d.hintState === 'check' ? 'var(--ops-orange)' : undefined }}>
                  <Photo src={d.url} tag={d.label} alt={d.label} />
                  <div className="row between xs"><span>{d.hint}</span><span className={d.hintState === 'ok' ? 'text-green' : 'text-red'}>{d.hintState === 'ok' ? '✓ ok' : 'Check'}</span></div>
                  {d.number ? <span className="mono xs muted">{d.number}{d.expiresOn ? ` · exp ${d.expiresOn}` : ''}</span> : null}
                </div>
              ))}
            </div>
            <div className="kv-grid">{c.facts.map((f) => <div key={f.label}><div className="k">{f.label}</div><div className={`mono ${f.ok ? 'text-green' : ''}`} style={{ marginTop: 4 }}>{f.value}</div></div>)}</div>
            <p className="small muted" style={{ lineHeight: 1.5 }}>Approval sends an SMS and Telegram message, and lets the fleet assign trips. Every decision is logged with reviewer and time.</p>
            {c.history.length ? <div className="xs muted">History: {c.history.map((h) => `${h.action}${h.by ? ` by ${h.by}` : ''}`).join(' · ')}</div> : null}
          </>
        ) : (
          <p className="muted">Select a case.</p>
        )}
      </section>
    </main>
  );
}
