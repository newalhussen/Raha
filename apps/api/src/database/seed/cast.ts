import type { Organization, User, Vehicle } from '../entities';
import { Kit } from './kit';

/** +2519xxxxxxxx numbers for generated people. */
export const ph = (n: number) => `+2519${String(11_000_000 + n)}`;

export interface Person { user: User; vehicle?: Vehicle }

export interface World {
  // Raha staff
  tigist: User;
  dawitM: User;
  selamA: User;
  eden: User;
  // brokerages
  yonas: Organization;
  abay: Organization;
  yonasM: User;
  liya: User;
  samuelW: User;
  // shippers
  sheba: Organization;
  habesha: Organization;
  tana: Organization;
  ethioTextile: Organization;
  awashMills: Organization;
  messebo: Organization;
  buna: Organization;
  piassa: Organization;
  akaki: Organization;
  mojoFoods: Organization;
  shipperPool: Organization[];
  hanna: User;
  meron: User;
  dawitA: User;
  // fleets
  kebede: Organization;
  selam: Organization;
  awashFreight: Organization;
  gojjam: Organization;
  rift: Organization;
  kassahunOrg: Organization;
  meseretOrg: Organization;
  tesfaye: User;
  rahel: User;
  // drivers (and their trucks)
  abebe: Person;
  solomon: Person;
  birhanu: Person;
  yared: Person;
  kidist: Person;
  daniel: Person;
  mekdes: User;
  nardos: User;
  girma: Person;
  biniyam: Person;
  dereje: Person;
  kassahun: Person;
  mulugeta: Person;
  meronG: Person;
  fikru: Person;
  tsegaye: Person;
  meseret: Person;
  hailu: User;
  /** Everyone who drives a truck, for history generation. */
  fleetTrucks: Array<{ fleet: Organization; person: Person }>;
}

/**
 * The cast of Raha's pilot network. Names, plates and places follow the approved design so the screens read the same
 * as the mock-ups; everything else is plausible filler for realistic volume.
 */
export async function buildWorld(k: Kit): Promise<World> {
  // ── Raha Operations ──
  const staffPw = 'Raha-ops-2026!';
  const tigist = await k.staff({ name: 'Tigist Haile', phone: '+251911204118', email: 'tigist@raha.et', password: staffPw, role: 'admin' });
  const dawitM = await k.staff({ name: 'Dawit Mekonnen', phone: ph(901), email: 'dawit@raha.et', password: staffPw, role: 'verifier' });
  const selamA = await k.staff({ name: 'Selam Alemu', phone: ph(902), email: 'selam@raha.et', password: staffPw, role: 'support' });
  const eden = await k.staff({ name: 'Eden Worku', phone: ph(903), email: 'eden@raha.et', password: staffPw, role: 'finance' });

  // ── Brokerages ──
  const yonas = await k.org({ type: 'brokerage', name: 'Yonas Brokerage', city: 'Merkato, Addis Ababa', phone: ph(800) });
  const abay = await k.org({ type: 'brokerage', name: 'Abay Brokerage', city: 'Bole, Addis Ababa', phone: ph(801), verified: false, createdDaysAgo: 3 });
  const yonasM = await k.user({ name: 'Yonas Molla', phone: ph(810), seenMinutesAgo: 1 });
  const liya = await k.user({ name: 'Liya Tadesse', phone: ph(811), seenMinutesAgo: 6 });
  const samuelW = await k.user({ name: 'Samuel Wolde', phone: ph(812), seenMinutesAgo: 300 });
  await k.join(yonasM, yonas, 'owner');
  await k.join(liya, yonas, 'dispatcher');
  await k.join(samuelW, yonas, 'dispatcher');
  const abayOwner = await k.user({ name: 'Abel Getachew', phone: ph(813) });
  await k.join(abayOwner, abay, 'owner');

  // ── Shippers ──
  const sheba = await k.org({ type: 'shipper', name: 'Sheba Agro PLC', nameAm: 'ሼባ አግሮ', city: 'Bole Bulbula, Addis Ababa', phone: ph(700), managedBy: yonas });
  const habesha = await k.org({ type: 'shipper', name: 'Habesha Cement PLC', city: 'Addis Ababa', phone: ph(701) });
  const tana = await k.org({ type: 'shipper', name: 'Tana Pharma PLC', city: 'Addis Ababa', phone: ph(702), managedBy: yonas });
  const ethioTextile = await k.org({ type: 'shipper', name: 'Ethio Textile PLC', city: 'Hawassa Industrial Park', phone: ph(703), managedBy: yonas, verified: false, createdDaysAgo: 4 });
  const awashMills = await k.org({ type: 'shipper', name: 'Awash Mills PLC', city: 'Adama', phone: ph(704), managedBy: yonas });
  const messebo = await k.org({ type: 'shipper', name: 'Messebo Cement', city: 'Mekelle', phone: ph(705), managedBy: yonas });
  const buna = await k.org({ type: 'shipper', name: 'Buna Bank Facilities', city: 'Addis Ababa', phone: ph(706), managedBy: yonas });
  const piassa = await k.org({ type: 'shipper', name: 'Piassa Coffee Traders', city: 'Hawassa', phone: ph(707) });
  const akaki = await k.org({ type: 'shipper', name: 'Akaki Building Supplies', city: 'Akaki, Addis Ababa', phone: ph(708) });
  const mojoFoods = await k.org({ type: 'shipper', name: 'Mojo Foods PLC', city: 'Mojo', phone: ph(709) });
  const gojjamAgro = await k.org({ type: 'shipper', name: 'Gojjam Agro Union', city: 'Debre Markos', phone: ph(710) });
  const dugda = await k.org({ type: 'shipper', name: 'Dugda Flour Mills', city: 'Adama', phone: ph(711) });

  const meron = await k.user({ name: 'Meron Tadesse', phone: ph(720), seenMinutesAgo: 30 });
  const selamawit = await k.user({ name: 'Selamawit Bekele', phone: ph(721) });
  const hanna = await k.user({ name: 'Hanna Girma', phone: '+251911330207', seenMinutesAgo: 4 });
  const yosef = await k.user({ name: 'Yosef Hailu', phone: ph(722) });
  const bethlehem = await k.user({ name: 'Bethlehem Tesfaye', phone: ph(723) });
  const kaleb = await k.user({ name: 'Kaleb Fikre', phone: ph(724), neverLoggedIn: true });
  await k.join(meron, sheba, 'owner');
  await k.join(selamawit, sheba, 'manager');
  await k.join(hanna, sheba, 'staff');
  await k.join(yosef, sheba, 'staff');
  await k.join(bethlehem, sheba, 'staff');
  await k.join(kaleb, sheba, 'staff', 'invited');

  const dawitA = await k.user({ name: 'Dawit Alemu', phone: '+251916552090' });
  await k.join(dawitA, piassa, 'owner');
  for (const [org, name, n] of [
    [habesha, 'Mulugeta Assefa', 730],
    [tana, 'Rediet Abate', 731],
    [ethioTextile, 'Biruk Demeke', 732],
    [awashMills, 'Kedir Hussein', 733],
    [messebo, 'Tekle Gebre', 734],
    [buna, 'Abenet Girma', 735],
    [akaki, 'Yonatan Bekele', 736],
    [mojoFoods, 'Ruth Tafesse', 737],
    [gojjamAgro, 'Wondimu Zeleke', 738],
    [dugda, 'Hamza Abdella', 739],
  ] as const) {
    await k.join(await k.user({ name, phone: ph(n) }), org, 'owner');
  }
  await k.join(await k.user({ name: 'Hiwot Zeleke', phone: ph(740) }), tana, 'staff');
  await k.join(await k.user({ name: 'Seble Mekonnen', phone: ph(741) }), habesha, 'manager');

  // ── Fleets ──
  const kebede = await k.org({ type: 'fleet', name: 'Kebede Transport', nameAm: 'ከበደ ትራንስፖርት', city: 'Kality, Addis Ababa', phone: ph(600) });
  const selam = await k.org({ type: 'fleet', name: 'Selam Logistics', city: 'Addis Ababa', phone: ph(601) });
  const awashFreight = await k.org({ type: 'fleet', name: 'Awash Freight', city: 'Adama', phone: ph(602) });
  const gojjam = await k.org({ type: 'fleet', name: 'Gojjam Trans', city: 'Bahir Dar', phone: ph(603) });
  const rift = await k.org({ type: 'fleet', name: 'Rift Valley Haulage', city: 'Hawassa', phone: ph(604) });
  const tesfaye = await k.user({ name: 'Tesfaye Kebede', phone: ph(610), seenMinutesAgo: 12 });
  const rahel = await k.user({ name: 'Rahel Desta', phone: ph(611), seenMinutesAgo: 3 });
  await k.join(tesfaye, kebede, 'owner');
  await k.join(rahel, kebede, 'manager');
  for (const [org, name, n] of [
    [selam, 'Selamawit Girma', 612],
    [awashFreight, 'Hussen Ahmed', 613],
    [gojjam, 'Tadesse Belay', 614],
    [rift, 'Eyob Mulat', 615],
  ] as const) {
    await k.join(await k.user({ name, phone: ph(n) }), org, 'owner');
  }

  // driver + truck helper: joins the fleet as a driver and gets a verified profile
  const driverOf = async (fleet: Organization, name: string, phone: string, v: Parameters<Kit['vehicle']>[1] | null, o: { telegram?: boolean; trips?: number; grade?: string; home?: string } = {}): Promise<{ user: User; vehicle?: Vehicle }> => {
    const user = await k.user({ name, phone, telegram: o.telegram });
    await k.join(user, fleet, 'driver');
    await k.driver(user, { trips: o.trips ?? Math.floor(k.between(20, 220)), grade: o.grade, home: o.home ?? 'ADD' });
    if (!v) return { user };
    return { user, vehicle: await k.vehicle(fleet, { ...v, driver: user, home: v.home ?? o.home ?? 'ADD' }) };
  };

  // Kebede Transport — the fleet from the design
  const abebe = await driverOf(kebede, 'Abebe Kebede', '+251911204418', { plate: '3-48213 AA', model: 'Isuzu FSR', year: 2019, maxKg: 10_000, volume: 38 }, { trips: 212 });
  const solomon = await driverOf(kebede, 'Solomon Getachew', ph(620), { plate: '3-50917 AA', model: 'Sino HOWO', maxKg: 15_000, volume: 52, home: 'ADA' }, { trips: 340, grade: '6' });
  const birhanu = await driverOf(kebede, 'Birhanu Wolde', ph(621), { plate: '3-50922 AA', model: 'Sino HOWO', maxKg: 15_000, volume: 52 }, { telegram: true, trips: 128, grade: '6' });
  const yared = await driverOf(kebede, 'Yared Mamo', ph(622), { plate: '3-41108 AA', model: 'Isuzu NPR', maxKg: 5_000, volume: 20 }, { trips: 91, grade: '4' });
  const kidist = await driverOf(kebede, 'Kidist Alemayehu', ph(623), { plate: '3-41115 AA', model: 'Isuzu NPR', maxKg: 5_000, volume: 20 }, { trips: 64, grade: '4' });
  const daniel = await driverOf(kebede, 'Daniel Fikre', ph(624), { plate: '3-66042 AA', model: 'Isuzu FSR', maxKg: 10_000, volume: 38, home: 'HWS' }, { trips: 156 });
  await k.vehicle(kebede, { plate: '3-29981 AA', model: 'Mitsubishi Canter', maxKg: 8_000, volume: 30, status: 'off_road', note: 'Garage, Kality · clutch', home: 'ADD' });
  const mekdes = (await driverOf(kebede, 'Mekdes Abera', '+251922418006', null, { trips: 0 })).user;
  const nardos = (await driverOf(kebede, 'Nardos Bekele', ph(625), null, { trips: 12, grade: '5' })).user;
  await driverOf(kebede, 'Fikadu Lemma', ph(626), null, { trips: 40 });
  await driverOf(kebede, 'Tigabu Haile', ph(627), null, { trips: 55 });

  const girma = await driverOf(selam, 'Girma Bekele', ph(630), { plate: '3-22874 AA', model: 'Isuzu FSR', maxKg: 10_000, volume: 38 }, { trips: 110 });
  const biniyam = await driverOf(selam, 'Biniyam Assefa', ph(631), { plate: '3-30457 AA', model: 'Toyota Hilux', maxKg: 3_000, volume: 9, body: 'pickup' }, { trips: 73, grade: '3' });
  await driverOf(selam, 'Lemma Tolossa', ph(632), { plate: '3-44120 AA', model: 'Isuzu FSR', maxKg: 10_000, volume: 38, home: 'HWS' }, { trips: 98, home: 'HWS' });

  const dereje = await driverOf(awashFreight, 'Dereje Hailu', ph(640), { plate: '3-71820 AA', model: 'Sino HOWO', maxKg: 15_000, volume: 52, home: 'ADA' }, { trips: 201, grade: '6' });
  await driverOf(awashFreight, 'Ahmed Yusuf', ph(641), { plate: '3-35110 AA', model: 'Isuzu FSR', maxKg: 10_000, volume: 38, home: 'HWS' }, { trips: 77, home: 'HWS' });

  const mulugeta = await driverOf(gojjam, 'Mulugeta Ayele', ph(650), { plate: '3-19944 AM', model: 'Isuzu FTR', maxKg: 12_000, volume: 44, home: 'BDR' }, { trips: 164, home: 'BDR' });
  await k.vehicle(gojjam, { plate: '3-77310 AM', model: 'Sino HOWO', maxKg: 12_000, volume: 44, verified: false, home: 'BDR' });
  await driverOf(gojjam, 'Habtamu Desalegn', ph(651), { plate: '3-20118 AM', model: 'Isuzu FSR', maxKg: 10_000, volume: 38, home: 'BDR' }, { trips: 120, home: 'BDR' });

  const meronG = await driverOf(rift, 'Meron Getachew', ph(660), { plate: '3-80031 SD', model: 'Isuzu NPR', maxKg: 5_000, volume: 20, home: 'HWS' }, { trips: 59, home: 'HWS' });
  const fikru = await driverOf(rift, 'Fikru Tadesse', ph(661), { plate: '3-40298 DD', model: 'Isuzu FSR', maxKg: 10_000, volume: 38, home: 'DIR' }, { trips: 133, home: 'DIR' });
  const tsegaye = await driverOf(rift, 'Tsegaye Lemma', ph(662), { plate: '3-66710 OR', model: 'Isuzu FSR', maxKg: 10_000, volume: 38, home: 'JIM' }, { trips: 88, home: 'JIM' });
  await driverOf(rift, 'Zelalem Abate', ph(663), { plate: '3-62213 SD', model: 'Isuzu FSR', maxKg: 10_000, volume: 38, home: 'HWS' }, { trips: 102, home: 'HWS' });

  // owner-operators
  const kassahunOrg = await k.org({ type: 'fleet', name: 'Kassahun Demissie (owner-operator)', city: 'Adama', phone: ph(670) });
  const kassahunUser = await k.user({ name: 'Kassahun Demissie', phone: ph(670), telegram: true });
  await k.join(kassahunUser, kassahunOrg, 'owner');
  await k.driver(kassahunUser, { trips: 143, home: 'ADA' });
  const kassahun: Person = { user: kassahunUser, vehicle: await k.vehicle(kassahunOrg, { plate: '3-55102 AA', model: 'Isuzu FSR', maxKg: 7_000, volume: 28, driver: kassahunUser, home: 'ADA' }) };

  const meseretOrg = await k.org({ type: 'fleet', name: 'Meseret Tadesse (owner-operator)', city: 'Hawassa', phone: ph(671) });
  const meseretUser = await k.user({ name: 'Meseret Tadesse', phone: ph(671) });
  await k.join(meseretUser, meseretOrg, 'owner');
  await k.driver(meseretUser, { trips: 187, home: 'HWS' });
  const meseret: Person = { user: meseretUser, vehicle: await k.vehicle(meseretOrg, { plate: '3-61190 OR', model: 'Isuzu NPR', maxKg: 5_000, volume: 20, driver: meseretUser, home: 'HWS' }) };

  const hailu = await k.user({ name: 'Hailu Negash', phone: ph(672) });
  const hailuOrg = await k.org({ type: 'fleet', name: 'Hailu Negash (owner-operator)', city: 'Dire Dawa', phone: ph(672), verified: false, createdDaysAgo: 5 });
  await k.join(hailu, hailuOrg, 'owner');
  await k.driver(hailu, { verified: false });

  // Yonas Brokerage's truck network
  const network = [kassahun.vehicle!, meseret.vehicle!, girma.vehicle!, tsegaye.vehicle!, fikru.vehicle!, meronG.vehicle!];
  for (const v of network) {
    await k.ds.query(`INSERT INTO broker_network (broker_org_id, vehicle_id, note) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`, [yonas.id, v.id, null]);
  }

  const fleetTrucks = [
    { fleet: kebede, person: abebe },
    { fleet: kebede, person: solomon },
    { fleet: kebede, person: birhanu },
    { fleet: kebede, person: yared },
    { fleet: kebede, person: kidist },
    { fleet: kebede, person: daniel },
    { fleet: selam, person: girma },
    { fleet: selam, person: biniyam },
    { fleet: awashFreight, person: dereje },
    { fleet: gojjam, person: mulugeta },
    { fleet: rift, person: meronG },
    { fleet: rift, person: fikru },
    { fleet: rift, person: tsegaye },
    { fleet: kassahunOrg, person: kassahun },
    { fleet: meseretOrg, person: meseret },
  ];

  return {
    tigist, dawitM, selamA, eden,
    yonas, abay, yonasM, liya, samuelW,
    sheba, habesha, tana, ethioTextile, awashMills, messebo, buna, piassa, akaki, mojoFoods,
    shipperPool: [habesha, awashMills, messebo, akaki, mojoFoods, gojjamAgro, dugda, buna, tana],
    hanna, meron, dawitA,
    kebede, selam, awashFreight, gojjam, rift, kassahunOrg, meseretOrg, tesfaye, rahel,
    abebe, solomon, birhanu, yared, kidist, daniel, mekdes, nardos,
    girma, biniyam, dereje, kassahun, mulugeta, meronG, fikru, tsegaye, meseret, hailu,
    fleetTrucks,
  };
}
