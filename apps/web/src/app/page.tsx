import Link from 'next/link';
import { CapacityBar, Logo, RahaMark, buttonClass } from '@raha/ui';
import './marketing.css';

const STEPS = [
  { n: '01', title: 'Trucks post their space', text: 'Drivers, fleets and brokers mark where a truck is going and how much is free. One tap in the driver app, or a Telegram reply.', bar: { totalKg: 10, inkKg: 8, amberKg: 0, freeKg: 2 } },
  { n: '02', title: 'Businesses post cargo', text: 'Pickup, drop, weight, volume, ready time. Raha shows trucks that fit, with the driver, plate and verification status of each.', bar: { totalKg: 10, inkKg: 0, amberKg: 2, freeKg: 8 } },
  { n: '03', title: 'Delivered with proof', text: 'Pickup photo, corridor check-ins, and a delivery PIN from the receiver. Everyone sees the same record.', bar: { totalKg: 10, inkKg: 8, amberKg: 0.8, freeKg: 1.2 } },
];

const ROLES = [
  { id: 'shippers', kicker: 'WEB · SHIPPERS', title: 'Businesses', text: 'Book space, track by corridor, confirm delivery. Invite your logistics team under one company account.', href: '/login?intent=shipper' },
  { id: 'drivers', kicker: 'ANDROID · DRIVERS', title: 'Drivers', text: 'Loads that fit your empty space, big buttons, Amharic or English, works without signal.', href: '#get-the-app', amber: true },
  { id: 'fleets', kicker: 'WEB · FLEETS', title: 'Fleet owners', text: 'See every truck, every driver and every empty kilometre. Assign return loads in one click.', href: '/login?intent=fleet' },
  { id: 'brokers', kicker: 'WEB · BROKERS', title: 'Brokers & dispatchers', text: 'Your network and your relationships, on a match board. Log loads from calls, offer them to trucks with space.', href: '/login?intent=brokerage' },
];

export default function Home() {
  return (
    <div className="mk">
      <div className="mk-dark">
        <header className="mk-head">
          <Link href="/" aria-label="Raha home" style={{ textDecoration: 'none' }}><Logo size={28} wordSize={22} /></Link>
          <nav className="mk-nav" aria-label="Sections">
            <a href="#shippers">Shippers</a>
            <a href="#drivers">Drivers &amp; fleets</a>
            <a href="#brokers">Brokers</a>
            <a href="#how">How matching works</a>
            <span className="amharic">አማርኛ</span>
          </nav>
          <div className="row gap-8">
            <Link href="/login" className={buttonClass({ variant: 'ghost', size: 'sm' })} style={{ color: 'var(--bone)' }}>Sign in</Link>
            <Link href="/login?intent=shipper" className={buttonClass({ variant: 'amber', size: 'sm' })}>Ship with Raha</Link>
          </div>
        </header>

        <section className="mk-hero">
          <div className="col gap-24" style={{ gap: 26 }}>
            <span className="kicker kicker-amber" style={{ color: 'var(--amber)', letterSpacing: '0.06em' }}>FREIGHT NETWORK · ETHIOPIA</span>
            <h1 className="display">Every truck on the road has room. We fill it.</h1>
            <p className="mk-lede">Raha matches cargo with trucks already heading your way, and with empty return legs. Businesses ship for less. Truck owners earn on space that used to travel empty.</p>
            <div className="row gap-10 wrap">
              <Link href="/login?intent=shipper" className={buttonClass({ variant: 'amber', size: 'lg' })}>Send a shipment →</Link>
              <Link href="/login?intent=fleet" className={buttonClass({ variant: 'outline', size: 'lg' })} style={{ color: 'var(--bone)', borderColor: 'var(--bone)' }}>I own trucks</Link>
            </div>
          </div>

          <div className="mk-live" aria-label="Example of a live match">
            <div className="row between mono xs" style={{ color: 'var(--stone)' }}><span>LIVE MATCH · ADDIS → HAWASSA</span><span>14:02</span></div>
            <div className="col gap-8">
              <div className="row between small"><span>Truck 3-48213 · Isuzu FSR 10 t</span><span className="mono">8 t aboard</span></div>
              <CapacityBar bar={{ totalKg: 10, inkKg: 8, amberKg: 0, freeKg: 2 }} height={30} />
            </div>
            <div className="row gap-12" aria-hidden>
              <span className="grow" style={{ height: 1, background: 'var(--graphite-3)' }} />
              <RahaMark size={34} />
              <span className="grow" style={{ height: 1, background: 'var(--graphite-3)' }} />
            </div>
            <div className="col gap-8">
              <div className="row between small"><span>Sheba Agro · 16 sacks coffee</span><span className="mono">800 kg</span></div>
              <CapacityBar bar={{ totalKg: 100, inkKg: 80, amberKg: 8, freeKg: 12 }} height={30} />
            </div>
            <div className="mk-stat3">
              <div><div style={{ color: 'var(--stone)' }}>Shipper pays</div><div className="mono mt-4" style={{ fontSize: 16 }}>ETB 6,400</div></div>
              <div><div style={{ color: 'var(--stone)' }}>vs dedicated truck</div><div className="mono mt-4" style={{ fontSize: 16, color: 'var(--amber)' }}>−38%</div></div>
              <div><div style={{ color: 'var(--stone)' }}>Truck utilized</div><div className="mono mt-4" style={{ fontSize: 16 }}>88%</div></div>
            </div>
          </div>
        </section>
      </div>

      <section className="mk-section" id="how">
        <div className="row between wrap gap-24" style={{ alignItems: 'flex-end' }}>
          <h2>How a match works</h2>
          <p className="muted pretty" style={{ maxWidth: 420, lineHeight: 1.5 }}>No new trucks, no new roads. Raha reads where capacity is already going and puts cargo on it.</p>
        </div>
        <div className="mk-steps">
          {STEPS.map((s) => (
            <div key={s.n}>
              <span className="mono-strong" style={{ fontSize: 13, color: 'var(--amber-ink)' }}>{s.n}</span>
              <div className="h2">{s.title}</div>
              <p className="soft" style={{ lineHeight: 1.55 }}>{s.text}</p>
              <div className="mt-auto"><CapacityBar bar={s.bar} height={16} /></div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ background: 'var(--paper)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)' }}>
        <div className="mk-section" style={{ paddingTop: 72, paddingBottom: 72 }}>
          <h2>Built for everyone who moves freight</h2>
          <div className="mk-roles">
            {ROLES.map((r) => (
              <Link key={r.id} id={r.id} href={r.href} className={`mk-role${r.amber ? ' amber' : ''}`}>
                <span className="kicker">{r.kicker}</span>
                <span className="h2">{r.title}</span>
                <span className="soft" style={{ lineHeight: 1.5, fontSize: 15 }}>{r.text}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="mk-section">
        <div className="mk-trust">
          <div className="col gap-20">
            <span className="kicker kicker-amber">TRUST, BUILT IN</span>
            <h2>You know who is carrying your cargo.</h2>
            <div className="col" style={{ borderTop: '1px solid var(--line)' }}>
              {[
                ['Verified', 'Drivers, trucks and companies are checked by Raha Operations: licence, Fayda ID, plate, trade licence.'],
                ['Photographed', 'Cargo is photographed at pickup and at delivery, time-stamped.'],
                ['PIN-confirmed', 'The receiver holds a 4-digit PIN sent by SMS. No PIN, no completed delivery.'],
              ].map(([k, v]) => (
                <div key={k} className="mk-trust-row">
                  <strong>{k}</strong>
                  <span className="soft" style={{ lineHeight: 1.5 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="row gap-20" style={{ background: 'var(--basalt)', padding: 40, justifyContent: 'center', alignItems: 'flex-end' }} aria-hidden>
            <div className="mk-phone">
              <div className="col gap-10" style={{ padding: '22px 14px 14px', flex: 1 }}>
                <span className="mono" style={{ fontSize: 9, color: 'var(--muted)' }}>STEP 5 OF 5</span>
                <span className="h3" style={{ fontSize: 17, lineHeight: 1.1 }}>Ask Dawit for the PIN</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginTop: 8 }}>
                  {['4', '7', '1', ''].map((d, i) => (
                    <span key={i} className="mono-strong" style={{ height: 44, display: 'grid', placeItems: 'center', fontSize: 20, border: `2px solid ${i === 3 ? 'var(--amber)' : 'var(--basalt)'}` }}>{d}</span>
                  ))}
                </div>
              </div>
              <div style={{ margin: 10, height: 44, background: 'var(--amber)', display: 'flex', alignItems: 'center', padding: '0 12px', fontWeight: 700, fontSize: 13 }}>Complete delivery →</div>
            </div>
            <div style={{ width: 180, background: 'var(--bone)', padding: 14, fontSize: 12, lineHeight: 1.5, borderRadius: '14px 14px 14px 3px', marginBottom: 60 }}>
              RAHA: Your coffee arrives ~17:45. Delivery PIN: <strong className="mono">4719</strong>
            </div>
          </div>
        </div>
      </section>

      <section className="mk-cta" id="get-the-app">
        <div className="inner">
          <h2 className="display" style={{ fontSize: 'clamp(30px, 4vw, 52px)', letterSpacing: '-0.025em', maxWidth: 780 }}>Now running Addis to Hawassa, Adama, Dire Dawa, Bahir Dar and Jimma.</h2>
          <div className="row gap-10 wrap">
            <Link href="/login?intent=shipper" className={buttonClass({ variant: 'ink', size: 'lg' })}>Create a company account</Link>
            <Link href="/login?intent=driver" className={buttonClass({ variant: 'outline', size: 'lg' })} style={{ borderColor: 'var(--basalt)', borderWidth: 2 }}>Get the driver app</Link>
          </div>
        </div>
      </section>

      <footer className="mk-foot">
        <div className="inner">
          <div className="row gap-10"><RahaMark size={22} /><span style={{ color: 'var(--bone)', fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 700, fontSize: 16 }}>raha</span><span style={{ marginLeft: 8 }}>Bole, Addis Ababa · support 8817</span></div>
          <div className="row gap-16 wrap">
            <Link href="/login">Sign in</Link>
            <span>Telegram @RahaFreight</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
