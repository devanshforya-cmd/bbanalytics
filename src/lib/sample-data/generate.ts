/**
 * Test data for the staging period. Every record it makes carries `isSample: true` and an id that
 * starts with `sample_` (staff: `user_sample_`), so Settings → Test data can remove all of it in one go.
 *
 * The data is one simulated history rather than independent random lists: officers visit their
 * stores on a rhythm, stores sell down their shelves between visits, orders refill them, cheques
 * follow orders, and balances follow cheques. Dates run up to the day it is loaded.
 */
import { adToBs } from '../nepali-calendar';
import { dispatchFromOrder, paymentDueDate } from '../dispatch-flow';
import type {
  BeatItem, Branch, CallLabel, CallLog, CallOutcome, Cheque, ChequeStatus, Dispatch, Distributor, FacingAudit, FeedbackEntry,
  HandoverDocument, Influencer, InfluencerContent, MarketingSend, Product, Promotion, RecurringScheduleEntry, Retailer,
  ReviewCategory, SaleCampaign, SecondaryOrder, ShelfPhoto, StaffLiveLocation, StockCount, Task, Visit,
} from '../types';

export const SAMPLE_ID_PREFIX = 'sample_';
export const SAMPLE_USER_PREFIX = 'user_sample_';

export interface SampleUser {
  id: string; full_name: string; name: string; email: string; phone: string; role: 'SALES_OFFICER';
  territory: string; assigned_territory: string; reports_to_id: string | null; assigned_brands: string[]; duty_status: string; is_active: true;
}
export interface SampleRecord { collection: string; id: string; data: Record<string, any> & { id: string; isSample: true } }
export interface SampleSet { users: SampleUser[]; records: SampleRecord[]; summary: Record<string, number> }

export interface SampleOptions {
  todayAd: string;
  products: Product[];
  manager: { id: string; name: string };
  existingNiches?: string[];
  seed?: number;
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

function rng(seed: number) {
  let t = seed >>> 0;
  return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; };
}
const DAY = 86400000;
const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const bs = (dateAd: string) => { try { return adToBs(`${dateAd}T12:00:00`).formatted; } catch { return dateAd; } };
const at = (dateAd: string, hour: number, minute = 0) => new Date(`${dateAd}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+05:45`).toISOString();

/** Shared placeholder images in /public/sample, so test records stay small. */
function photo(kind: 'shelf-before' | 'shelf-after' | 'cheque' | 'document'): string {
  return `/sample/${kind}.svg`;
}

// ---------------------------------------------------------------------------------------------
// Cast
// ---------------------------------------------------------------------------------------------

const OFFICERS = [
  { key: 'rajan', name: 'Rajan Shrestha', phone: '9800000101', territory: 'Kathmandu East', city: 'Kathmandu', valley: 'Inside' as const, province: 'Bagmati' },
  { key: 'sunita', name: 'Sunita Maharjan', phone: '9800000102', territory: 'Lalitpur & Bhaktapur', city: 'Lalitpur', valley: 'Inside' as const, province: 'Bagmati' },
  { key: 'bikash', name: 'Bikash Gurung', phone: '9800000103', territory: 'Pokhara', city: 'Pokhara', valley: 'Outside' as const, province: 'Gandaki' },
];

const CHAINS = [
  { key: 'himal', name: 'Himal Mart Supermarkets', type: 'Retail Chain' as const, storeType: 'CHAIN_STORE' as const, city: 'Kathmandu', margin: 18, terms: '30 days credit' },
  { key: 'valley', name: 'Valley Fresh Mart', type: 'Retail Chain' as const, storeType: 'CHAIN_STORE' as const, city: 'Kathmandu', margin: 16, terms: '21 days credit' },
  { key: 'care', name: 'CarePlus Pharmacy Chain', type: 'Pharmacy Chain' as const, storeType: 'CHAIN_STORE' as const, city: 'Lalitpur', margin: 15, terms: '30 days credit' },
  { key: 'fewa', name: 'Fewa Trade Distributors', type: 'Distributor' as const, storeType: 'DISTRIBUTOR' as const, city: 'Pokhara', margin: 22, terms: '45 days credit' },
];

const BRANCHES = [
  { key: 'himal-baneshwor', chain: 'himal', name: 'Himal Mart Baneshwor', area: 'Baneshwor', city: 'Kathmandu', lat: 27.6915, lng: 85.3420, officer: 'rajan' },
  { key: 'himal-maharajgunj', chain: 'himal', name: 'Himal Mart Maharajgunj', area: 'Maharajgunj', city: 'Kathmandu', lat: 27.7360, lng: 85.3305, officer: 'rajan' },
  { key: 'himal-jawalakhel', chain: 'himal', name: 'Himal Mart Jawalakhel', area: 'Jawalakhel', city: 'Lalitpur', lat: 27.6726, lng: 85.3135, officer: 'sunita' },
  { key: 'himal-suryabinayak', chain: 'himal', name: 'Himal Mart Suryabinayak', area: 'Suryabinayak', city: 'Bhaktapur', lat: 27.6630, lng: 85.4280, officer: 'sunita' },
  { key: 'valley-thamel', chain: 'valley', name: 'Valley Fresh Mart Thamel', area: 'Thamel', city: 'Kathmandu', lat: 27.7152, lng: 85.3123, officer: 'rajan' },
  { key: 'valley-kupondole', chain: 'valley', name: 'Valley Fresh Mart Kupondole', area: 'Kupondole', city: 'Lalitpur', lat: 27.6870, lng: 85.3170, officer: 'sunita' },
  { key: 'care-chabahil', chain: 'care', name: 'CarePlus Chabahil', area: 'Chabahil', city: 'Kathmandu', lat: 27.7173, lng: 85.3466, officer: 'rajan' },
  { key: 'care-pulchowk', chain: 'care', name: 'CarePlus Pulchowk', area: 'Pulchowk', city: 'Lalitpur', lat: 27.6780, lng: 85.3188, officer: 'sunita' },
  { key: 'care-lakeside', chain: 'care', name: 'CarePlus Lakeside', area: 'Lakeside', city: 'Pokhara', lat: 28.2096, lng: 83.9585, officer: 'bikash' },
];

type Habit = 'steady' | 'big' | 'slow' | 'dormant' | 'late_payer' | 'new';
const RETAILERS: { key: string; name: string; type: Retailer['type']; category: string; area: string; city: string; lat: number; lng: number; officer: string; habit: Habit; owner: string }[] = [
  { key: 'r01', name: 'Shrestha Kirana Pasal', type: 'Kirana', category: 'Grocery', area: 'Koteshwor', city: 'Kathmandu', lat: 27.6789, lng: 85.3497, officer: 'rajan', habit: 'steady', owner: 'Ram Shrestha' },
  { key: 'r02', name: 'Sagun Cosmetics Centre', type: 'Cosmetics', category: 'Cosmetics', area: 'New Baneshwor', city: 'Kathmandu', lat: 27.6885, lng: 85.3352, officer: 'rajan', habit: 'big', owner: 'Sagun Karki' },
  { key: 'r03', name: 'Tinkune Health Pharmacy', type: 'Pharmacy', category: 'Pharmacy', area: 'Tinkune', city: 'Kathmandu', lat: 27.6858, lng: 85.3470, officer: 'rajan', habit: 'steady', owner: 'Dr. Anil Joshi' },
  { key: 'r04', name: 'Sinamangal Departmental Store', type: 'GT', category: 'Departmental', area: 'Sinamangal', city: 'Kathmandu', lat: 27.6955, lng: 85.3540, officer: 'rajan', habit: 'late_payer', owner: 'Hari Prasad Adhikari' },
  { key: 'r05', name: 'Boudha Beauty Store', type: 'Cosmetics', category: 'Cosmetics', area: 'Boudha', city: 'Kathmandu', lat: 27.7215, lng: 85.3620, officer: 'rajan', habit: 'slow', owner: 'Pema Lama' },
  { key: 'r06', name: 'Gaushala Fancy & General', type: 'GT', category: 'General store', area: 'Gaushala', city: 'Kathmandu', lat: 27.7080, lng: 85.3440, officer: 'rajan', habit: 'dormant', owner: 'Sita Thapa' },
  { key: 'r07', name: 'Old Baneshwor Medico', type: 'Pharmacy', category: 'Pharmacy', area: 'Old Baneshwor', city: 'Kathmandu', lat: 27.7000, lng: 85.3380, officer: 'rajan', habit: 'steady', owner: 'Bikram Rai' },
  { key: 'r08', name: 'Chabahil Glow Cosmetics', type: 'Cosmetics', category: 'Cosmetics', area: 'Chabahil', city: 'Kathmandu', lat: 27.7190, lng: 85.3490, officer: 'rajan', habit: 'new', owner: 'Anisha Gurung' },
  { key: 'r09', name: 'Jawalakhel Kirana', type: 'Kirana', category: 'Grocery', area: 'Jawalakhel', city: 'Lalitpur', lat: 27.6735, lng: 85.3145, officer: 'sunita', habit: 'steady', owner: 'Krishna Maharjan' },
  { key: 'r10', name: 'Pulchowk Pharma Point', type: 'Pharmacy', category: 'Pharmacy', area: 'Pulchowk', city: 'Lalitpur', lat: 27.6795, lng: 85.3175, officer: 'sunita', habit: 'big', owner: 'Dr. Rina Shakya' },
  { key: 'r11', name: 'Kumaripati Beauty Hub', type: 'Cosmetics', category: 'Cosmetics', area: 'Kumaripati', city: 'Lalitpur', lat: 27.6700, lng: 85.3200, officer: 'sunita', habit: 'steady', owner: 'Nisha Bajracharya' },
  { key: 'r12', name: 'Satdobato General Store', type: 'GT', category: 'General store', area: 'Satdobato', city: 'Lalitpur', lat: 27.6585, lng: 85.3250, officer: 'sunita', habit: 'late_payer', owner: 'Gopal Khadka' },
  { key: 'r13', name: 'Imadol Daily Needs', type: 'Kirana', category: 'Grocery', area: 'Imadol', city: 'Lalitpur', lat: 27.6630, lng: 85.3420, officer: 'sunita', habit: 'slow', owner: 'Maya Tamang' },
  { key: 'r14', name: 'Gwarko Medical Hall', type: 'Pharmacy', category: 'Pharmacy', area: 'Gwarko', city: 'Lalitpur', lat: 27.6660, lng: 85.3330, officer: 'sunita', habit: 'steady', owner: 'Suman Pradhan' },
  { key: 'r15', name: 'Bhaktapur Durbar Cosmetics', type: 'Cosmetics', category: 'Cosmetics', area: 'Durbar Square', city: 'Bhaktapur', lat: 27.6722, lng: 85.4281, officer: 'sunita', habit: 'dormant', owner: 'Rajesh Prajapati' },
  { key: 'r16', name: 'Thimi Fancy Pasal', type: 'GT', category: 'General store', area: 'Thimi', city: 'Bhaktapur', lat: 27.6800, lng: 85.3870, officer: 'sunita', habit: 'new', owner: 'Laxmi Duwal' },
  { key: 'r17', name: 'Lakeside Beauty Corner', type: 'Cosmetics', category: 'Cosmetics', area: 'Lakeside', city: 'Pokhara', lat: 28.2110, lng: 83.9570, officer: 'bikash', habit: 'big', owner: 'Sabina Gurung' },
  { key: 'r18', name: 'Mahendrapul Departmental', type: 'GT', category: 'Departmental', area: 'Mahendrapul', city: 'Pokhara', lat: 28.2196, lng: 83.9890, officer: 'bikash', habit: 'steady', owner: 'Dil Bahadur Thapa' },
  { key: 'r19', name: 'Chipledhunga Pharmacy', type: 'Pharmacy', category: 'Pharmacy', area: 'Chipledhunga', city: 'Pokhara', lat: 28.2230, lng: 83.9880, officer: 'bikash', habit: 'steady', owner: 'Dr. Prakash Poudel' },
  { key: 'r20', name: 'Prithvi Chowk Kirana', type: 'Kirana', category: 'Grocery', area: 'Prithvi Chowk', city: 'Pokhara', lat: 28.2090, lng: 83.9850, officer: 'bikash', habit: 'late_payer', owner: 'Bishnu Sharma' },
  { key: 'r21', name: 'Bagar Glamour Store', type: 'Cosmetics', category: 'Cosmetics', area: 'Bagar', city: 'Pokhara', lat: 28.2400, lng: 83.9890, officer: 'bikash', habit: 'slow', owner: 'Kabita Pun' },
  { key: 'r22', name: 'Srijana Chowk Medicos', type: 'Pharmacy', category: 'Pharmacy', area: 'Srijana Chowk', city: 'Pokhara', lat: 28.2160, lng: 83.9800, officer: 'bikash', habit: 'steady', owner: 'Ramesh Baral' },
  { key: 'r23', name: 'Lekhnath General Store', type: 'GT', category: 'General store', area: 'Lekhnath', city: 'Pokhara', lat: 28.1720, lng: 84.0490, officer: 'bikash', habit: 'dormant', owner: 'Tek Bahadur Adhikari' },
  { key: 'r24', name: 'Birauta Daily Mart', type: 'Kirana', category: 'Grocery', area: 'Birauta', city: 'Pokhara', lat: 28.1960, lng: 83.9720, officer: 'bikash', habit: 'new', owner: 'Gita Paudel' },
];

const BANKS = ['Nabil Bank', 'NIC Asia Bank', 'Global IME Bank', 'Himalayan Bank', 'Everest Bank', 'Prabhu Bank', 'Siddhartha Bank'];
const SKIPS = ['Store closed', 'Travel issue', 'No time', 'Other task assigned'] as const;

// ---------------------------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------------------------

export function generateSampleData(options: SampleOptions): SampleSet {
  const random = rng(options.seed ?? 20830804);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(random() * list.length)];
  const between = (min: number, max: number) => Math.round(min + random() * (max - min));
  const chance = (p: number) => random() < p;

  const today = Date.parse(`${options.todayAd}T00:00:00Z`);
  const dayAd = (offset: number) => iso(today - offset * DAY);
  const products = options.products.filter((product) => product.active !== false).slice(0, 8);
  if (!products.length) throw new Error('Add at least one active product before loading test data.');
  const brandCodes = [...new Set(products.map((product) => product.brandCode))];
  const manager = options.manager;

  const records: SampleRecord[] = [];
  const add = <T extends { id: string }>(collection: string, data: T) => { records.push({ collection, id: data.id, data: { ...data, isSample: true } as any }); return data; };
  const sid = (kind: string, key: string | number) => `${SAMPLE_ID_PREFIX}${kind}_${key}`;
  let soNumber = 9000, dpNumber = 9000, msNumber = 9000;

  // Staff --------------------------------------------------------------------------------------
  const officers = OFFICERS.map((o) => ({ ...o, id: `${SAMPLE_USER_PREFIX}${o.key}` }));
  const officer = (key: string) => officers.find((o) => o.key === key)!;
  const users: SampleUser[] = officers.map((o) => ({
    id: o.id, full_name: o.name, name: o.name, email: `${o.key}@sample.invalid`, phone: o.phone, role: 'SALES_OFFICER',
    territory: o.territory, assigned_territory: o.territory, reports_to_id: manager.id, assigned_brands: brandCodes, duty_status: 'ONLINE', is_active: true,
  }));

  const margin = (pct: number) => Object.fromEntries(brandCodes.map((code) => [code, { pct, type: 'MARKDOWN' as const }]));
  const contact = (key: string, name: string, role: string, phone: string) => ({ id: sid('contact', key), name, role: role as any, phone, isPrimary: true });

  // Chains and distributors --------------------------------------------------------------------
  const chains = CHAINS.map((c, index) => add<Distributor>('distributors', {
    id: sid('dist', c.key), name: c.name, type: c.type, storeType: c.storeType, city: c.city, address: `${c.city} head office`,
    province: c.city === 'Pokhara' ? 'Gandaki' : 'Bagmati', valley: c.city === 'Pokhara' ? 'Outside' : 'Inside',
    contactName: ['Suresh Agrawal', 'Bina Shah', 'Dr. Manoj KC', 'Hem Raj Gurung'][index], contactRole: 'Purchase Manager', contactPhone: `98510${String(20000 + index * 111)}`,
    contactEmail: `purchase@${c.key}.sample.invalid`, contacts: [contact(`dist-${c.key}`, ['Suresh Agrawal', 'Bina Shah', 'Dr. Manoj KC', 'Hem Raj Gurung'][index], 'Purchase Manager', `98510${String(20000 + index * 111)}`)],
    brandsCarried: brandCodes, defaultMargins: margin(c.margin), vatRegistered: true, hasBranches: c.key !== 'fewa', creditTerms: c.terms,
  }));
  const chainOf = (key: string) => chains[CHAINS.findIndex((c) => c.key === key)];

  // Stores -------------------------------------------------------------------------------------
  type Sim = {
    id: string; name: string; entityType: 'BRANCH' | 'RETAILER'; officer: ReturnType<typeof officer>; lat: number; lng: number; address: string;
    contactName: string; contactPhone: string; habit: Habit; marginPct: number; terms: string; city: string; area: string;
    distributorId?: string; distributorName?: string; storeType: string;
    shelf: Record<string, number>; sellPerDay: Record<string, number>; carried: string[];
    orders: SecondaryOrder[]; visits: Visit[]; cheques: Cheque[]; rhythm: number; startOffset: number; brandShare: number;
  };
  const sims: Sim[] = [];

  for (const b of BRANCHES) {
    const chain = CHAINS.find((c) => c.key === b.chain)!;
    const dist = chainOf(b.chain);
    const o = officer(b.officer);
    const manager = ['Kamal Thapa', 'Anju Shrestha', 'Prabin Karki', 'Sarita Rai', 'Nabin Lama', 'Puja Joshi', 'Dipesh KC', 'Roshni Shakya', 'Arjun Gurung'][BRANCHES.indexOf(b)];
    const phone = `98010${String(30000 + BRANCHES.indexOf(b) * 37)}`;
    add<Branch>('branches', {
      id: sid('branch', b.key), distributorId: dist.id, distributorName: dist.name, name: b.name, address: `${b.area}, ${b.city}`, city: b.city, area: b.area,
      lat: b.lat, lng: b.lng, assignedOfficerId: o.id, assignedOfficerName: o.name, contactName: manager, contactRole: 'Store Manager', contactPhone: phone,
      contacts: [contact(`branch-${b.key}`, manager, 'Store Manager', phone)], brandsAvailable: brandCodes, defaultMargins: margin(chain.margin),
      creditLimit: 400000,
    });
    sims.push({ id: sid('branch', b.key), name: b.name, entityType: 'BRANCH', officer: o, lat: b.lat, lng: b.lng, address: `${b.area}, ${b.city}`, contactName: manager, contactPhone: phone,
      habit: 'big', marginPct: chain.margin, terms: chain.terms, city: b.city, area: b.area, distributorId: dist.id, distributorName: dist.name, storeType: 'MT',
      shelf: {}, sellPerDay: {}, carried: products.map((p) => p.id), orders: [], visits: [], cheques: [], rhythm: 7, startOffset: between(150, 175), brandShare: 0.12 + random() * 0.1 });
  }

  for (const r of RETAILERS) {
    const o = officer(r.officer);
    const fewa = r.city === 'Pokhara' && r.type !== 'Pharmacy' ? chainOf('fewa') : undefined;
    const marginPct = r.type === 'Pharmacy' ? 12 : r.type === 'Cosmetics' ? 18 : 15;
    const terms = r.habit === 'late_payer' || r.habit === 'big' ? '15 days credit' : chance(0.5) ? 'Cash on delivery' : '7 days credit';
    const phone = `98${String(41000000 + RETAILERS.indexOf(r) * 1313).slice(0, 8)}`;
    add<Retailer>('retailers', {
      id: sid('retailer', r.key), name: r.name, type: r.type, storeType: r.habit === 'big' ? 'SAMT' : 'STANDALONE_RETAILER', category: r.category, city: r.city, area: r.area,
      province: r.city === 'Pokhara' ? 'Gandaki' : 'Bagmati', valley: r.city === 'Pokhara' ? 'Outside' : 'Inside', address: `${r.area}, ${r.city}`,
      lat: r.lat, lng: r.lng, distributorId: RETAILERS.indexOf(r) % 5 === 4 ? undefined : fewa?.id, distributorName: RETAILERS.indexOf(r) % 5 === 4 ? undefined : fewa?.name, assignedOfficerId: o.id, assignedOfficerName: o.name,
      contactName: r.owner, contactRole: 'Owner', contactPhone: phone, contacts: [contact(`retailer-${r.key}`, r.owner, 'Owner', phone)],
      brandsStocked: brandCodes, defaultMargins: margin(marginPct), vatRegistered: r.type !== 'Kirana', creditTerms: terms,
      creditLimit: r.habit === 'big' ? 150000 : 60000,
    });
    const carried = r.type === 'Pharmacy' ? products.filter((p, i) => i % 2 === 0 || /serum|acne/i.test(p.name)).map((p) => p.id) : products.map((p) => p.id).filter(() => chance(0.85));
    sims.push({ id: sid('retailer', r.key), name: r.name, entityType: 'RETAILER', officer: o, lat: r.lat, lng: r.lng, address: `${r.area}, ${r.city}`, contactName: r.owner, contactPhone: phone,
      habit: r.habit, marginPct, terms, city: r.city, area: r.area, distributorId: fewa?.id, distributorName: fewa?.name, storeType: 'GT',
      shelf: {}, sellPerDay: {}, carried: carried.length ? carried : [products[0].id], orders: [], visits: [], cheques: [],
      rhythm: r.habit === 'big' ? 7 : r.habit === 'slow' ? 14 : r.habit === 'new' ? 7 : 10,
      startOffset: r.habit === 'new' ? between(30, 50) : between(140, 175), brandShare: 0.05 + random() * 0.12 });
  }

  // Selling rates and opening shelves.
  for (const s of sims) for (const productId of s.carried) {
    const base = s.entityType === 'BRANCH' ? 3 + random() * 4 : s.habit === 'big' ? 1.2 + random() : s.habit === 'slow' ? 0.2 + random() * 0.3 : 0.4 + random() * 0.8;
    s.sellPerDay[productId] = Math.round(base * 10) / 10;
    s.shelf[productId] = Math.round(base * between(8, 18));
  }

  // Day-by-day history ---------------------------------------------------------------------------
  const unitPrice = (product: Product, marginPct: number) => Math.round((product.mrp || product.unitPrice || 0) * (1 - marginPct / 100));
  const stockCounts: StockCount[] = [], shelfPhotos: ShelfPhoto[] = [], calls: CallLog[] = [], facings: FacingAudit[] = [], beats: BeatItem[] = [];
  const pendingCheque: { store: Sim; order: SecondaryOrder }[] = [];

  for (const s of sims) {
    let nextVisit = s.startOffset;
    let lastFacing = 999;
    let lastOrderOffset = 999;
    for (let offset = s.startOffset; offset >= 0; offset -= 1) {
      const dateAd = dayAd(offset);
      // Shelves sell down every day (a bit faster at the end of the month and before festivals).
      for (const productId of s.carried) {
        const daily = s.sellPerDay[productId] * (0.6 + random() * 0.8);
        s.shelf[productId] = Math.max(0, Math.round((s.shelf[productId] - daily) * 10) / 10);
      }
      const weekday = new Date(`${dateAd}T12:00:00Z`).getUTCDay();
      const isVisitDay = offset === nextVisit;
      if (!isVisitDay) continue;
      nextVisit = offset - Math.max(3, s.rhythm + between(-2, 2));
      if (weekday === 6) { nextVisit = offset - 1; continue; } // Saturday off
      // Dormant stores stopped being visited and stopped ordering about 7 weeks ago.
      if (s.habit === 'dormant' && offset < 48) continue;
      if (offset === 0) continue; // today's visits live on the beat plan below

      const skipped = chance(s.officer.key === 'bikash' ? 0.12 : 0.07);
      const beatId = sid('beat', `${s.id.slice(SAMPLE_ID_PREFIX.length)}_${dateAd}`);
      {
        beats.push({ id: beatId, officerId: s.officer.id, dateAd, dateBs: bs(dateAd), sequence: 0, entityType: s.entityType, entityId: s.id, storeName: s.name,
          storeType: s.storeType, address: s.address, lat: s.lat, lng: s.lng, contactName: s.contactName, contactPhone: s.contactPhone, contacts: [],
          lastVisitDaysAgo: s.rhythm, pendingTasks: [], status: skipped ? 'SKIPPED' : 'VISITED', skipReason: skipped ? pick(SKIPS) : undefined,
          checkedInAt: skipped ? undefined : at(dateAd, 11), priority: s.habit === 'big' ? 'HIGH' : 'ROUTINE' } as BeatItem);
      }
      if (skipped) continue;

      const hour = between(10, 16), minute = between(0, 59);
      const duration = s.entityType === 'BRANCH' ? between(20, 55) : between(8, 30);
      const far = chance(0.04);
      const visit: Visit = {
        id: sid('visit', `${s.id.slice(SAMPLE_ID_PREFIX.length)}_${dateAd}`), officerId: s.officer.id, officerName: s.officer.name, entityType: s.entityType, entityId: s.id, storeName: s.name,
        checkInTime: at(dateAd, hour, minute), checkOutTime: new Date(Date.parse(at(dateAd, hour, minute)) + duration * 60000).toISOString(), durationMinutes: duration,
        lat: s.lat + (random() - 0.5) * 0.0006, lng: s.lng + (random() - 0.5) * 0.0006, distanceMeters: far ? between(250, 600) : between(4, 70),
        overrideFlag: far, overrideReason: far ? 'GPS drifted inside the building' : undefined, dateAd, dateBs: bs(dateAd),
      };
      s.visits.push(add('visits', visit));

      // Count the shelf on most visits.
      const counted = chance(0.65);
      if (counted) {
        const count: StockCount = {
          id: sid('count', `${s.id.slice(SAMPLE_ID_PREFIX.length)}_${dateAd}`), visitId: visit.id, officerId: s.officer.id, officerName: s.officer.name, entityType: s.entityType, entityId: s.id,
          storeName: s.name, dateAd, dateBs: bs(dateAd), createdAt: visit.checkOutTime!,
          items: s.carried.map((productId) => {
            const product = products.find((p) => p.id === productId)!;
            const previous = [...stockCounts].reverse().find((c) => c.entityId === s.id)?.items.find((i) => i.productId === productId)?.shelfQty ?? Math.round(s.shelf[productId]);
            const shelfQty = Math.round(s.shelf[productId]);
            return { productId, productName: product.name, brandCode: product.brandCode, shelfQty, previousQty: previous, flaggedDrop: previous > 0 && shelfQty < previous * 0.5, damagedQty: chance(0.05) ? 1 : 0 };
          }),
        };
        stockCounts.push(add('stockCounts', count));
      }

      // Order when shelves are getting thin (and sometimes anyway), unless the store has gone quiet.
      const thin = s.carried.filter((productId) => s.shelf[productId] < s.sellPerDay[productId] * (s.rhythm + 5));
      const orders = thin.length > 0 && chance(s.habit === 'slow' ? 0.55 : 0.85) || chance(0.15);
      if (orders && thin.length + 1 > 0) {
        const lines = (thin.length ? thin : [pick(s.carried)]).map((productId) => {
          const product = products.find((p) => p.id === productId)!;
          const target = s.sellPerDay[productId] * (s.rhythm + 10);
          let units = Math.max(s.entityType === 'BRANCH' ? 24 : 3, Math.round(target - s.shelf[productId]));
          units = s.entityType === 'BRANCH' ? Math.ceil(units / 12) * 12 : Math.ceil(units / 3) * 3;
          const price = unitPrice(product, s.marginPct);
          const free = s.entityType === 'RETAILER' && units >= 12 && chance(0.3) ? Math.floor(units / 12) : 0;
          return { productId, productName: product.name, brandCode: product.brandCode, cases: Math.floor(units / (product.caseSize || 72)), unitsPerCase: product.caseSize || 72,
            totalUnits: units, unitPrice: price, totalAmount: units * price, freeUnits: free || undefined, appliedScheme: free ? 'Buy 12 get 1' : undefined };
        });
        const total = lines.reduce((sum, line) => sum + line.totalAmount, 0);
        const age = offset;
        const cancelled = chance(0.04);
        const status: SecondaryOrder['status'] = cancelled ? 'CANCELLED' : age <= 2 ? 'PENDING_DISPATCH' : age <= 5 ? (chance(0.5) ? 'DISPATCHED' : 'DELIVERED') : 'DELIVERED';
        soNumber += 1;
        const order = add<SecondaryOrder>('secondaryOrders', {
          id: sid('so', soNumber), orderNumber: `SO-${soNumber}`, beatId, officerId: s.officer.id, officerName: s.officer.name,
          entityType: s.entityType, entityId: s.id, storeName: s.name, contactName: s.contactName, contactPhone: s.contactPhone,
          orderDateAd: dateAd, orderDateBs: bs(dateAd), items: lines, totalAmount: total, totalUnits: lines.reduce((sum, line) => sum + line.totalUnits, 0),
          status, distributorId: s.distributorId, distributorName: s.distributorName, paymentTerms: s.terms,
          brandMargins: Object.fromEntries(brandCodes.map((code) => [code, { pct: s.marginPct, type: 'MARKDOWN' as const }])),
          notes: cancelled ? 'Store cancelled: stock arrived from another supplier' : undefined, createdAt: visit.checkOutTime!,
        });
        s.orders.push(order);
        lastOrderOffset = offset;
        if (!cancelled) {
          // Goods land a couple of days later; a pending order has not landed yet.
          if (status === 'DELIVERED') for (const line of lines) s.shelf[line.productId] += line.totalUnits + (line.freeUnits || 0);
          if (!/cash/i.test(s.terms)) pendingCheque.push({ store: s, order });
        }
      }

      // Shelf photos, facings and calls.
      if (chance(0.3)) shelfPhotos.push(add<ShelfPhoto>('shelfPhotos', {
        id: sid('photo', `${s.id.slice(SAMPLE_ID_PREFIX.length)}_${dateAd}`), visitId: visit.id, officerId: s.officer.id, officerName: s.officer.name, entityType: s.entityType, entityId: s.id, storeName: s.name,
        beforePhotoUrls: [photo('shelf-before')], afterPhotoUrls: [photo('shelf-after')],
        rackSection: pick(['Main eye-level rack', 'Counter display', 'Personal care aisle', 'Floor display stand']), dateAd, dateBs: bs(dateAd), createdAt: visit.checkOutTime!,
      }));
      if (offset < lastFacing - 28) {
        lastFacing = offset;
        const own = between(2, 9);
        const rivals = [{ brandName: 'Nivea', isOwnBrand: false, facingCount: between(4, 12) }, { brandName: 'Dove', isOwnBrand: false, facingCount: between(3, 10) }, { brandName: 'Himalaya', isOwnBrand: false, facingCount: between(2, 8) }];
        const all = [{ brandName: 'Forya', isOwnBrand: true, facingCount: own }, ...rivals];
        facings.push(add<FacingAudit>('facingAudits', { id: sid('facing', `${s.id.slice(SAMPLE_ID_PREFIX.length)}_${dateAd}`), storeId: s.id, storeName: s.name, officerId: s.officer.id, dateAd, dateBs: bs(dateAd),
          facings: all, ownSharePct: Math.round((own / all.reduce((sum, f) => sum + f.facingCount, 0)) * 100), createdAt: visit.checkOutTime! }));
      }
    }
    // Phone calls between visits.
    for (let offset = s.startOffset - 3; offset > 0; offset -= between(9, 20)) {
      const dateAd = dayAd(offset);
      const label: CallLabel = pick(['Order Taking', 'Payment Follow-up', 'Stock Inquiry', 'General Check-in', 'No Answer', 'Complaint Resolution']);
      const outcome: CallOutcome = label === 'No Answer' ? 'Callback Requested' : label === 'Payment Follow-up' ? pick(['Payment Promised', 'Follow-up Needed']) : label === 'Order Taking' ? 'Order Received' : pick(['Issue Resolved', 'No Outcome', 'Follow-up Needed']);
      calls.push(add<CallLog>('callLogs', { id: sid('call', `${s.id.slice(SAMPLE_ID_PREFIX.length)}_${dateAd}`), officerId: s.officer.id, officerName: s.officer.name, entityType: s.entityType, entityId: s.id,
        storeName: s.name, contactName: s.contactName, contactPhone: s.contactPhone, durationSeconds: label === 'No Answer' ? 0 : between(40, 420), label, outcome, isManual: chance(0.3),
        notes: label === 'Payment Follow-up' ? 'Asked about the cheque for last month' : undefined, dateAd, dateBs: bs(dateAd), createdAt: at(dateAd, between(9, 18)) }));
    }
    void lastOrderOffset;
  }

  // Cheques follow credit orders -----------------------------------------------------------------
  let chequeNo = 104520;
  for (const { store, order } of pendingCheque) {
    const age = Math.round((today - Date.parse(`${order.orderDateAd}T00:00:00Z`)) / DAY);
    const termDays = Number(/(\d+)/.exec(store.terms)?.[1] || 15);
    if (age < termDays - 3) continue; // not due yet: stays as outstanding balance
    const received = Math.max(0, age - termDays + between(-2, 4));
    const receivedAd = dayAd(received);
    const cashOffset = received - between(1, 5);
    const late = store.habit === 'late_payer';
    let status: ChequeStatus;
    if (received <= 2) status = pick(['COLLECTED_IN_FIELD', 'HANDED_OVER_AT_OFFICE']);
    else if (cashOffset > 0 && received <= 8) status = late && chance(0.5) ? 'DELAYED' : 'PENDING';
    else status = late && chance(0.25) ? 'BOUNCED' : chance(0.02) ? 'LOST' : 'CASHED';
    const cashAd = dayAd(Math.max(-10, cashOffset));
    const history = [{ id: sid('chqh', `${chequeNo}_1`), newStatus: 'COLLECTED_IN_FIELD' as ChequeStatus, changedBy: store.officer.name, timestamp: at(receivedAd, 15), notes: 'Collected on visit' }];
    if (status !== 'COLLECTED_IN_FIELD') history.push({ id: sid('chqh', `${chequeNo}_2`), newStatus: 'HANDED_OVER_AT_OFFICE', changedBy: store.officer.name, timestamp: at(dayAd(Math.max(0, received - 1)), 17), notes: `Handed to ${manager.name}` });
    if (!['COLLECTED_IN_FIELD', 'HANDED_OVER_AT_OFFICE'].includes(status)) history.push({ id: sid('chqh', `${chequeNo}_3`), newStatus: status, changedBy: manager.name, timestamp: at(cashAd, 13), notes: status === 'BOUNCED' ? 'Returned: insufficient funds' : status === 'DELAYED' ? 'Store asked to deposit next week' : undefined } as any);
    chequeNo += between(3, 40);
    store.cheques.push(add<Cheque>('cheques', {
      id: sid('cheque', chequeNo), entityType: store.entityType, entityId: store.id, brandCodes, storeName: store.name, officerId: store.officer.id, officerName: store.officer.name,
      chequeNumber: String(chequeNo), amount: order.totalAmount, bankName: pick(BANKS), receivedDateAd: receivedAd, receivedDateBs: bs(receivedAd), cashDateAd: cashAd, cashDateBs: bs(cashAd),
      photoUrl: photo('cheque'), status, handedOverTo: status === 'COLLECTED_IN_FIELD' ? undefined : manager.name, handedOverToId: status === 'COLLECTED_IN_FIELD' ? undefined : manager.id,
      delayedReason: status === 'DELAYED' ? 'Owner travelling, asked to hold' : undefined, newExpectedDate: status === 'DELAYED' ? dayAd(-7) : undefined,
      notes: `For ${order.orderNumber}`, history, createdAt: at(receivedAd, 15),
    }));
    // Most bounced cheques are replaced a few weeks later; the most recent ones are still open.
    if (status === 'BOUNCED' && received > 30) {
      const againAd = dayAd(received - between(12, 25));
      chequeNo += between(3, 40);
      store.cheques.push(add<Cheque>('cheques', {
        id: sid('cheque', chequeNo), entityType: store.entityType, entityId: store.id, brandCodes, storeName: store.name, officerId: store.officer.id, officerName: store.officer.name,
        chequeNumber: String(chequeNo), amount: order.totalAmount, bankName: pick(BANKS), receivedDateAd: againAd, receivedDateBs: bs(againAd), cashDateAd: againAd, cashDateBs: bs(againAd),
        photoUrl: photo('cheque'), status: 'CASHED', handedOverTo: manager.name, handedOverToId: manager.id,
        notes: `For ${order.orderNumber} (replaces a bounced cheque)`, history: [{ id: sid('chqh', `${chequeNo}_1`), newStatus: 'CASHED', changedBy: manager.name, timestamp: at(againAd, 13) }], createdAt: at(againAd, 15),
      }));
    }
  }

  // Balances, last visits and health on each store record ----------------------------------------
  for (const s of sims) {
    const live = s.orders.filter((o) => o.status !== 'CANCELLED');
    const billed = live.reduce((sum, o) => sum + o.totalAmount, 0);
    const paid = s.cheques.filter((c) => c.status === 'CASHED').reduce((sum, c) => sum + c.amount, 0)
      + (/cash/i.test(s.terms) ? live.filter((o) => o.status === 'DELIVERED').reduce((sum, o) => sum + o.totalAmount, 0) : 0);
    const termDays = Number(/(\d+)/.exec(s.terms)?.[1] || 0);
    const overdueOrders = /cash/i.test(s.terms) ? [] : live.filter((o) => Math.round((today - Date.parse(`${o.orderDateAd}T00:00:00Z`)) / DAY) > termDays + 5
      && !s.cheques.some((c) => c.notes?.startsWith(`For ${o.orderNumber}`) && c.status !== 'BOUNCED'));
    const overdue = overdueOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const oldest = overdueOrders.map((o) => Math.round((today - Date.parse(`${o.orderDateAd}T00:00:00Z`)) / DAY) - termDays).sort((a, b) => b - a)[0] || 0;
    const bounced = s.cheques.filter((c) => c.status === 'BOUNCED').length;
    const lastVisit = s.visits[s.visits.length - 1];
    const record = records.find((r) => r.id === s.id)!;
    Object.assign(record.data, {
      outstandingBalance: Math.max(0, billed - paid), overdueBalance: overdue, overdueDays: oldest, bouncedChequesCount: bounced,
      isCreditLocked: bounced >= 2 || oldest > 45, lastVisitDate: lastVisit?.dateAd, lastVisitDaysAgo: lastVisit ? Math.round((today - Date.parse(`${lastVisit.dateAd}T00:00:00Z`)) / DAY) : undefined,
    });
  }

  // Beat plans: past (already pushed), today and tomorrow -----------------------------------------
  const sequence = new Map<string, number>();
  for (const beat of beats.sort((a, b) => a.dateAd.localeCompare(b.dateAd) || a.officerId.localeCompare(b.officerId))) {
    const key = `${beat.officerId}_${beat.dateAd}`;
    beat.sequence = (sequence.get(key) || 0) + 1;
    sequence.set(key, beat.sequence);
    add('beatItems', beat);
  }
  const plan = (offset: number) => {
    const dateAd = dayAd(offset);
    for (const o of officers) {
      const mine = sims.filter((s) => s.officer.id === o.id && s.habit !== 'dormant')
        .map((s) => ({ s, since: s.visits.length ? Math.round((today - Date.parse(`${s.visits[s.visits.length - 1].dateAd}T00:00:00Z`)) / DAY) : 30 }))
        .sort((a, b) => b.since - a.since).slice(offset === 0 ? 0 : 6, offset === 0 ? 6 : 12);
      mine.forEach(({ s, since }, index) => {
        const done = offset === 0 && index < 2;
        const low = s.carried.some((productId) => s.shelf[productId] < s.sellPerDay[productId] * 4);
        const overdue = Number(records.find((r) => r.id === s.id)!.data.overdueBalance || 0) > 0;
        add<BeatItem>('beatItems', {
          id: sid('beat', `${s.id.slice(SAMPLE_ID_PREFIX.length)}_${dateAd}`), officerId: o.id, dateAd, dateBs: bs(dateAd), sequence: index + 1, entityType: s.entityType, entityId: s.id,
          storeName: s.name, storeType: s.storeType, address: s.address, lat: s.lat, lng: s.lng, contactName: s.contactName, contactPhone: s.contactPhone, contacts: [],
          lastVisitDaysAgo: since, pendingTasks: overdue ? ['Collect overdue payment'] : [], status: done ? 'VISITED' : 'PENDING',
          checkedInAt: done ? at(dateAd, 10 + index, 15) : undefined, checkedOutAt: done ? at(dateAd, 10 + index, 40) : undefined,
          priority: low || overdue ? 'HIGH' : s.habit === 'big' ? 'MEDIUM' : 'ROUTINE',
          urgencySignals: [...(low ? [{ type: 'LOW_STOCK' as const, label: 'Shelf running low', color: 'red' as const }] : []), ...(overdue ? [{ type: 'TASK' as const, label: 'Payment overdue', color: 'amber' as const }] : []),
            ...(since > 14 ? [{ type: 'DORMANT' as const, label: `${since} days since last visit`, color: 'amber' as const }] : [])],
          estimatedVisitMinutes: s.entityType === 'BRANCH' ? 35 : 15, distanceFromPreviousKm: index === 0 ? 0 : Math.round((1 + random() * 4) * 10) / 10,
        });
      });
    }
  };
  plan(0); plan(-1);

  // Weekly visit rhythm for each store.
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const;
  for (const s of sims.filter((x) => x.habit !== 'dormant')) {
    const count = s.rhythm <= 7 ? 1 : 1;
    add<RecurringScheduleEntry>('recurringSchedules', { id: sid('schedule', s.id.slice(SAMPLE_ID_PREFIX.length)), officerId: s.officer.id, storeId: s.id, storeName: s.name, entityType: s.entityType,
      daysOfWeek: Array.from({ length: count }, () => pick(days)), priority: s.habit === 'big' ? 'HIGH' : s.entityType === 'BRANCH' ? 'MEDIUM' : 'ROUTINE',
      managerNote: s.habit === 'late_payer' ? 'Collect payment before taking a new order' : undefined });
  }

  // Every store order has its dispatch order, at the step its age suggests. Pokhara GT stock also goes to the distributor weekly.
  for (const s of sims) {
    for (const order of s.orders) {
      dpNumber += 1;
      const age = Math.round((today - Date.parse(`${order.orderDateAd}T00:00:00Z`)) / DAY);
      const status: Dispatch['status'] = order.status === 'CANCELLED' ? 'CANCELLED' : order.status === 'DELIVERED' ? 'DELIVERED' : order.status === 'DISPATCHED' ? 'DISPATCHED' : age >= 1 ? 'PACKED' : 'ORDER_RECEIVED';
      const draft = dispatchFromOrder(order, { id: s.id, name: s.name, type: s.entityType, chainId: s.entityType === 'BRANCH' ? s.distributorId : undefined, chainName: s.entityType === 'BRANCH' ? s.distributorName : undefined,
        distributorId: s.entityType === 'RETAILER' ? s.distributorId : undefined, distributorName: s.entityType === 'RETAILER' ? s.distributorName : undefined }, manager.name, new Date(Date.parse(order.createdAt)));
      const sent = ['DISPATCHED', 'DELIVERED'].includes(status!) ? iso(Date.parse(`${order.orderDateAd}T00:00:00Z`) + Math.min(age, between(1, 2)) * DAY) : '';
      const delivered = status === 'DELIVERED' && sent ? iso(Math.min(today, Date.parse(`${sent}T00:00:00Z`) + between(0, 2) * DAY)) : undefined;
      const due = sent ? paymentDueDate(sent, s.terms) : '';
      const collected = s.cheques.find((c) => c.notes === `For ${order.orderNumber}` && c.status === 'CASHED');
      const history = [draft.statusHistory![0]];
      if (status !== 'ORDER_RECEIVED' && status !== 'CANCELLED') history.push({ status: 'PACKED', at: at(sent || dayAd(Math.max(0, age - 1)), 9), byName: manager.name });
      if (sent) history.push({ status: 'DISPATCHED', at: at(sent, 11), byName: manager.name });
      if (delivered) history.push({ status: 'DELIVERED', at: at(delivered, 15), byName: s.officer.name });
      if (status === 'CANCELLED') history.push({ status: 'CANCELLED', at: at(order.orderDateAd, 17), byName: manager.name, note: order.notes });
      add<Dispatch>('dispatches', {
        ...draft, id: sid('dispatch', dpNumber), dispatchNumber: `DP-${dpNumber}`, status, statusHistory: history,
        dispatchDateAd: sent, dispatchDateBs: sent ? bs(sent) : '', deliveredDateAd: delivered,
        paymentDueDateAd: due || undefined, paymentDueDateBs: due ? bs(due) : undefined, amountDue: sent ? order.totalAmount : undefined,
        paymentStatus: !due ? undefined : collected ? 'COLLECTED' : Date.parse(`${due}T00:00:00Z`) < today ? 'OVERDUE' : 'PENDING',
        collectionDateAd: collected?.cashDateAd, collectionDateBs: collected?.cashDateBs, collectionMethod: collected ? 'Cheque' : undefined, collectedBy: collected ? s.officer.name : undefined,
      });
      (order as SecondaryOrder).dispatchId = sid('dispatch', dpNumber);
      (order as SecondaryOrder).dispatchNumber = `DP-${dpNumber}`;
    }
  }
  const fewa = chainOf('fewa');
  for (let offset = 168; offset > 3; offset -= 7) {
    dpNumber += 1;
    const sent = dayAd(offset);
    const items = products.map((p) => ({ productId: p.id, productName: p.name, brandCode: p.brandCode, quantity: between(4, 10) * 12 }));
    const amount = items.reduce((sum, item) => sum + item.quantity * unitPrice(products.find((p) => p.id === item.productId)!, 22), 0);
    const due = iso(Date.parse(`${sent}T00:00:00Z`) + 45 * DAY);
    const paidOff = offset > 60;
    add<Dispatch>('dispatches', { id: sid('dispatch', dpNumber), dispatchNumber: `DP-${dpNumber}`, distributorId: fewa.id, distributorName: fewa.name, dispatchDateAd: sent, dispatchDateBs: bs(sent), items,
      status: 'DELIVERED', statusHistory: [{ status: 'DISPATCHED', at: at(sent, 9), byName: manager.name }, { status: 'DELIVERED', at: at(sent, 16), byName: manager.name }], storeId: fewa.id, storeName: fewa.name, entityType: 'DISTRIBUTOR', fulfilledBy: 'WAREHOUSE', deliveredDateAd: sent,
      createdBy: manager.name, createdAt: at(sent, 9), paymentTerms: '45 days credit', paymentDueDateAd: due, paymentDueDateBs: bs(due), amountDue: amount,
      paymentStatus: paidOff ? 'COLLECTED' : Date.parse(`${due}T00:00:00Z`) < today ? 'OVERDUE' : offset > 40 ? 'PARTIAL' : 'PENDING',
      collectionDateAd: paidOff ? iso(Date.parse(`${due}T00:00:00Z`) + between(-5, 8) * DAY) : undefined, collectionMethod: paidOff ? 'Bank Transfer' : undefined,
      paymentDelayDays: paidOff ? between(0, 8) : undefined, notes: 'Weekly stock for Pokhara retailers' });
  }

  // Paperwork collected from stores.
  let docIndex = 0;
  for (const s of sims.filter((x) => x.entityType === 'BRANCH' || x.habit === 'big')) {
    for (const order of s.orders.filter((o) => o.status === 'DELIVERED').slice(-4)) {
      docIndex += 1;
      const docAd = iso(Date.parse(`${order.orderDateAd}T00:00:00Z`) + 3 * DAY);
      const ageDays = Math.round((today - Date.parse(`${docAd}T00:00:00Z`)) / DAY);
      const status: HandoverDocument['status'] = ageDays > 20 ? 'FILED' : ageDays > 6 ? 'HANDED_OVER' : chance(0.1) ? 'MISSING' : 'COLLECTED';
      const type = s.entityType === 'BRANCH' ? pick(['Goods Received Note', 'Purchase Order', 'Tax Invoice copy']) : pick(['Delivery challan', 'Tax Invoice copy']);
      add<HandoverDocument>('documents', {
        id: sid('doc', docIndex), entityType: s.entityType, entityId: s.id, storeName: s.name, officerId: s.officer.id, officerName: s.officer.name, documentType: type,
        docDateAd: docAd, docDateBs: bs(docAd), referenceNumber: `${type.split(' ').map((w) => w[0]).join('')}-${order.orderNumber.slice(3)}`, photoUrls: [photo('document')],
        handedToUserName: status === 'HANDED_OVER' || status === 'FILED' ? manager.name : undefined, filedLocation: status === 'FILED' ? `Office file ${s.city} / ${bs(docAd).split(' ')[0]}` : undefined,
        currentHolder: status === 'COLLECTED' ? s.officer.name : status === 'MISSING' ? undefined : manager.name, status,
        timeline: [{ id: sid('custody', `${docIndex}_1`), action: 'COLLECTED', actorName: s.officer.name, timestamp: at(docAd, 14), dateBs: bs(docAd) },
          ...(status === 'HANDED_OVER' || status === 'FILED' ? [{ id: sid('custody', `${docIndex}_2`), action: 'HANDED_OVER' as const, actorName: s.officer.name, recipientName: manager.name, timestamp: at(iso(Date.parse(`${docAd}T00:00:00Z`) + 2 * DAY), 17) }] : []),
          ...(status === 'FILED' ? [{ id: sid('custody', `${docIndex}_3`), action: 'FILED' as const, actorName: manager.name, locationOrFolder: `Office file ${s.city}`, timestamp: at(iso(Date.parse(`${docAd}T00:00:00Z`) + 9 * DAY), 11) }] : []),
          ...(status === 'MISSING' ? [{ id: sid('custody', `${docIndex}_4`), action: 'MISSING' as const, actorName: manager.name, notes: 'Not found in the officer’s folder', timestamp: at(options.todayAd, 10) }] : [])],
        notes: `For ${order.orderNumber}`, createdAt: at(docAd, 14),
      });
    }
  }

  // Tasks ----------------------------------------------------------------------------------------
  const taskList: [string, string, Priority, number, Task['status'], Task['autoTriggerType'], string?][] = [];
  type Priority = Task['priority'];
  for (const s of sims) {
    const record = records.find((r) => r.id === s.id)!.data;
    if (record.overdueBalance > 0) taskList.push([`Collect overdue payment: ${s.name}`, `NPR ${record.overdueBalance.toLocaleString()} overdue for ${record.overdueDays} days.`, record.overdueDays > 30 ? 'URGENT' : 'HIGH', 2, 'OPEN', 'CHEQUE_OVERDUE', s.id]);
    if (s.habit === 'dormant') taskList.push([`Win back ${s.name}`, 'No order in over six weeks. Visit, check the shelf and find out why.', 'MEDIUM', 4, 'OPEN', 'STORE_DORMANT', s.id]);
    if (s.habit === 'new') taskList.push([`Set up display at ${s.name}`, 'New store: place the counter display and take before/after photos.', 'MEDIUM', -3, 'COMPLETED', 'MANUAL', s.id]);
  }
  taskList.push(['Monthly shelf audit: Himal Mart branches', 'Count all SKUs and record facings in every branch.', 'HIGH', 6, 'IN_PROGRESS', 'MANUAL']);
  taskList.push(['Submit Kartik cheque reconciliation', 'Match cashed cheques to store orders and flag gaps.', 'MEDIUM', -2, 'OVERDUE', 'MANUAL']);
  taskList.push(['Train new officer on beat app', 'Walk through check-in, stock count and order taking.', 'LOW', 9, 'PENDING', 'MANUAL']);
  taskList.forEach(([title, description, priority, due, status, trigger, relatedId], index) => {
    const s = sims.find((x) => x.id === relatedId);
    const assignee = s?.officer || officers[index % officers.length];
    const dueAd = dayAd(-due);
    add<Task>('tasks', { id: sid('task', index + 1), title, description, assignedTo: assignee.id, assignedToName: assignee.name, createdBy: manager.id, priority, dueDateAd: dueAd, dueDateBs: bs(dueAd),
      relatedTo: s?.name, relatedId: s?.id, relatedEntityType: s ? 'STORE' : undefined, status: status === 'OPEN' && due < 0 ? 'OVERDUE' : status, autoCreated: trigger !== 'MANUAL', autoTriggerType: trigger, createdAt: at(dayAd(Math.max(1, due + 7)), 9) });
  });

  // Officers on the map today.
  for (const o of officers) {
    const todays = records.filter((r) => r.collection === 'beatItems' && r.data.officerId === o.id && r.data.dateAd === options.todayAd).map((r) => r.data as unknown as BeatItem);
    const done = todays.filter((b) => b.status === 'VISITED');
    const here = todays[done.length] || todays[0];
    add<StaffLiveLocation & { id: string }>('staffLiveLocations', {
      id: sid('live', o.key), officerId: o.id, officerName: o.name, currentLat: (here?.lat ?? 27.7) + 0.0004, currentLng: (here?.lng ?? 85.32) + 0.0004, lastPingTimestamp: new Date(today + 6 * 3600000).toISOString(),
      status: 'IN_TRANSIT', currentStoreName: undefined, batteryLevel: between(35, 92), isOnline: true, dutyStatus: 'IN_FIELD', todayDistanceKm: Math.round((4 + random() * 9) * 10) / 10,
      todayRoute: done.map((b) => ({ storeName: b.storeName, arrivedAt: b.checkedInAt!, departedAt: b.checkedOutAt, durationMinutes: 25, status: 'COMPLETED' as const, lat: b.lat, lng: b.lng })),
    });
  }

  // Trade promotions for stores.
  const promo = (key: string, name: string, offerType: Promotion['offerType'], from: number, to: number, stores: Promotion['applicableStoreTypes'], description: string, ids = products.slice(0, 2)) => {
    const fromAd = dayAd(from), toAd = dayAd(to);
    add<Promotion>('promotions', { id: sid('promo', key), name, brandCode: ids[0].brandCode, productIds: ids.map((p) => p.id), productNames: ids.map((p) => p.name), offerType,
      validFromAd: fromAd, validToAd: toAd, validFromBs: bs(fromAd), validToBs: bs(toAd), applicableStoreTypes: stores, description, active: to <= 0 });
  };
  promo('b12g1', 'Buy 12 get 1 free (retailers)', 'BUY_X_GET_Y', 40, -20, 'GT', 'One free unit for every 12 ordered, all general trade stores.');
  promo('mt-display', 'Supermarket display incentive', 'PERCENTAGE_OFF', 15, -15, 'MT', 'Extra 3% on orders with an end-cap display.', products.slice(0, 3));
  promo('dashain', 'Dashain stock-up scheme', 'PERCENTAGE_OFF', 75, 45, 'ALL', 'Ended. 5% off orders above NPR 25,000.');

  // ------------------------------------------------------------------------------------------
  // Online side: only the sections that are empty. No sample online orders or customers, so
  // real sales figures stay real.
  // ------------------------------------------------------------------------------------------
  const categories = ['Leaking bottle', 'Damaged packaging', 'Fragrance too strong', 'Late delivery', 'Wrong item sent', 'Skin irritation', 'Price too high', 'Great results'];
  categories.forEach((name, index) => add<ReviewCategory>('reviewCategories', { id: sid('category', index + 1), name, tickCount: 0, isArchived: false, createdBy: manager.name, createdAt: at(dayAd(120), 10) }));

  const voices: [string, FeedbackEntry['type'], FeedbackEntry['sentiment'], string, string[]][] = [
    ['Hair fall reduced in three weeks, buying again.', 'REVIEW', 'POSITIVE', 'serum', ['Great results']],
    ['Smells fresh all day, even after the gym.', 'REVIEW', 'POSITIVE', 'roll', []],
    ['Cap was broken when it arrived and it leaked in the box.', 'COMPLAINT', 'NEGATIVE', 'wash', ['Leaking bottle', 'Damaged packaging']],
    ['Delivery took 6 days to Butwal.', 'COMPLAINT', 'NEGATIVE', 'any', ['Late delivery']],
    ['Conditioner makes my hair soft but the smell is strong.', 'FEEDBACK', 'NEUTRAL', 'conditioner', ['Fragrance too strong']],
    ['Acne on my back cleared up a lot.', 'REVIEW', 'POSITIVE', 'acne', ['Great results']],
    ['Got the aqua roll-on instead of the one I ordered.', 'COMPLAINT', 'NEGATIVE', 'roll', ['Wrong item sent']],
    ['Slight itching after first use, stopped after a few days.', 'FEEDBACK', 'NEUTRAL', 'wash', ['Skin irritation']],
    ['A bit expensive compared to the supermarket brands.', 'FEEDBACK', 'NEGATIVE', 'any', ['Price too high']],
    ['Exfoliating wash leaves skin really smooth.', 'REVIEW', 'POSITIVE', 'exfoliat', []],
    ['Second bottle, my whole family uses it now.', 'REVIEW', 'POSITIVE', 'any', ['Great results']],
    ['Box arrived crushed, product fine.', 'COMPLAINT', 'NEUTRAL', 'any', ['Damaged packaging']],
  ];
  const productFor = (hint: string) => products.find((p) => hint !== 'any' && p.name.toLowerCase().includes(hint)) || pick(products);
  const people = ['Asmita K.', 'Rohan S.', 'Pratiksha T.', 'Sujan M.', 'Nirjala R.', 'Kiran B.', 'Srijana P.', 'Aayush G.', 'Bipana L.', 'Saurav D.', 'Rachana N.', 'Prabesh A.'];
  voices.forEach(([text, type, sentiment, hint, issues], index) => {
    const product = productFor(hint);
    const dateAd = dayAd(between(1, 80));
    const complaint = type === 'COMPLAINT';
    const status = complaint ? pick(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'RESOLVED'] as const) : undefined;
    add<FeedbackEntry>('feedbackEntries', {
      id: sid('feedback', index + 1), customerName: people[index], customerPhone: '', customerHandle: `@${people[index].split(' ')[0].toLowerCase()}_${between(10, 99)}`, customerLink: 'UNLINKED',
      brandCode: product.brandCode, productId: product.id, productName: product.name, type, channel: pick(['Instagram DM', 'Facebook comment', 'WhatsApp', 'Website review']),
      dateReceivedAd: dateAd, dateReceivedBs: bs(dateAd), fullText: text, screenshotUrls: [], issueCategories: issues, sentiment, hasScreenshot: false, usedInDesign: sentiment === 'POSITIVE' && chance(0.4),
      postedOnWebsite: sentiment === 'POSITIVE' && chance(0.5), priority: complaint ? pick(['MEDIUM', 'HIGH'] as const) : undefined,
      assignedTo: complaint ? manager.id : undefined, assignedToName: complaint ? manager.name : undefined, complaintStatus: status,
      resolutionNotes: status === 'RESOLVED' ? 'Replacement sent, customer confirmed.' : undefined, history: [], createdAt: at(dateAd, between(10, 19)),
    });
  });

  // Influencers, sends and content.
  const niches = options.existingNiches?.length ? options.existingNiches : [];
  const creators: [string, string, string, number, Influencer['qualityRating']][] = [
    ['Aakriti Glows', 'Kathmandu', '@aakriti.glows', 48000, 'GREAT'], ['Sajan Grooms', 'Lalitpur', '@sajan.grooms', 12500, 'AVERAGE'], ['Pokhara Skin Diaries', 'Pokhara', '@pokhara.skin', 23000, 'GREAT'],
    ['Nima Hair Talk', 'Kathmandu', '@nimahairtalk', 8900, 'AVERAGE'], ['Fit with Prerana', 'Bhaktapur', '@fitwithprerana', 61000, 'GREAT'], ['Budget Beauty NP', 'Butwal', '@budgetbeautynp', 15400, 'POOR'],
    ['The Grooming Guy', 'Kathmandu', '@thegroomingguy.np', 31000, 'NOT_RATED'], ['Sneha Everyday', 'Dharan', '@sneha.everyday', 5600, 'AVERAGE'],
  ];
  const influencerIds = creators.map(([name, city, handle, followers, rating], index) => add<Influencer>('influencers', {
    id: sid('influencer', index + 1), name, city, phone: `98${String(60000000 + index * 4321).slice(0, 8)}`, address: `${city}`, platforms: [{ platform: 'Instagram', handle, followers }, ...(index % 3 === 0 ? [{ platform: 'TikTok', handle, followers: Math.round(followers * 1.6) }] : [])],
    nicheIds: niches.slice(0, 1), qualityRating: rating, totalSends: 0, totalContent: 0, isActive: index !== 5, createdAt: at(dayAd(140), 10),
  }).id);
  const sends: MarketingSend[] = [];
  for (let index = 0; index < 12; index += 1) {
    const influencerIndex = index % creators.length;
    const sentAd = dayAd(between(3, 120));
    const status: MarketingSend['status'] = index === 7 ? 'CANCELLED' : Date.parse(`${sentAd}T00:00:00Z`) < today - 18 * DAY && creators[influencerIndex][4] !== 'POOR' ? 'CONTENT_RECEIVED' : 'SENT';
    const items = products.filter(() => chance(0.4)).slice(0, 3);
    msNumber += 1;
    const expected = iso(Date.parse(`${sentAd}T00:00:00Z`) + 14 * DAY);
    sends.push(add<MarketingSend>('marketingSends', { id: sid('send', msNumber), sendNumber: `MS-${msNumber}`, influencerId: influencerIds[influencerIndex], influencerName: creators[influencerIndex][0], brandCodes,
      reachOutPlatform: 'Instagram', responsibleId: manager.id, responsibleName: manager.name, sentDateAd: sentAd, sentDateBs: bs(sentAd), expectedContentDateAd: expected, expectedContentDateBs: bs(expected),
      items: (items.length ? items : [products[0]]).map((p) => ({ productId: p.id, productName: p.name, brandCode: p.brandCode, quantity: 1 })), deliveryChannel: pick(['Pathao Parcel', 'Office pickup', 'Upaya']),
      deliveryAddress: creators[influencerIndex][1], status, createdAt: at(sentAd, 12), createdById: manager.id }));
  }
  let contentIndex = 0;
  for (const send of sends.filter((s) => s.status === 'CONTENT_RECEIVED')) {
    contentIndex += 1;
    const postedAd = iso(Date.parse(`${send.sentDateAd}T00:00:00Z`) + between(6, 16) * DAY);
    add<InfluencerContent>('influencerContent', { id: sid('content', contentIndex), influencerId: send.influencerId, contentType: pick(['REEL', 'REEL', 'STORY', 'POST'] as const),
      links: [{ platform: 'Instagram', url: `https://www.instagram.com/reel/SAMPLE${contentIndex}/` }], datePostedAd: postedAd, datePostedBs: bs(postedAd),
      productIds: send.items.map((i) => i.productId), productNames: send.items.map((i) => i.productName), brandCodes: send.brandCodes, sendId: send.id, postStatus: 'LIVE', createdAt: at(postedAd, 20) });
  }
  for (const id of influencerIds) {
    const record = records.find((r) => r.id === id)!.data;
    const mine = sends.filter((s) => s.influencerId === id && s.status !== 'CANCELLED');
    const content = records.filter((r) => r.collection === 'influencerContent' && r.data.influencerId === id);
    const last = mine.map((s) => s.sentDateAd).sort().pop();
    const lastContent = content.map((r) => r.data.datePostedAd as string).sort().pop();
    Object.assign(record, { totalSends: mine.length, totalContent: content.length, lastSendDate: last, lastSendDateBs: last ? bs(last) : undefined, lastContentDate: lastContent, lastContentDateBs: lastContent ? bs(lastContent) : undefined });
  }

  // Offer campaigns: never live, so they cannot change prices on real orders.
  const campaign = (key: string, name: string, status: SaleCampaign['status'], from: number, to: number, isTemplate: boolean, notes: string) => {
    const startsAt = `${dayAd(from)}T00:00`, endsAt = `${dayAd(to)}T23:59`;
    add<SaleCampaign>('campaigns', { id: sid('campaign', key), name, brandCodes, channels: [], startsAt, endsAt, status, isTemplate, notes, createdAt: at(dayAd(from + 5), 10), createdBy: manager.id,
      offers: [{ id: sid('offer', `${key}_1`), name: '10% off everything', enabled: true, target: { mode: 'ALL' }, condition: {}, reward: { type: 'PERCENT_OFF', percent: 10 }, stacking: 'BEST', priority: 1 },
        { id: sid('offer', `${key}_2`), name: 'Free delivery over NPR 1,500', enabled: true, target: { mode: 'ALL' }, condition: { minOrderValue: 1500 }, reward: { type: 'FREE_DELIVERY' }, stacking: 'STACK', priority: 2 }] });
  };
  campaign('dashain', 'Dashain sale (sample)', 'ENDED', 60, 45, false, 'Sample campaign, already ended.');
  campaign('newyear', 'New Year offer (sample draft)', 'DRAFT', -40, -50, false, 'Sample draft, not scheduled.');
  campaign('template', 'Weekend flash sale template (sample)', 'DRAFT', 0, -2, true, 'Sample template.');

  const summary: Record<string, number> = { staff: users.length };
  for (const record of records) summary[record.collection] = (summary[record.collection] || 0) + 1;
  return { users, records, summary };
}
