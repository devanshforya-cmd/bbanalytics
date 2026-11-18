import type { AppliedOffer, CampaignStatus, Order, OfferCondition, OfferReward, OfferTarget, SaleCampaign, SaleOffer } from './types';

/**
 * Sales and offers engine. Pure functions: the extractor preview, the server save and the reports all
 * price an order the same way.
 *
 * Order of calculation (always the same, so results are predictable):
 *   MRP → item offers (by priority) → order offers (minimum spend, tiers) → gifts and delivery
 * The one-off customer discount (a written price) is applied after this, outside the engine.
 *
 * Stacking: STACK offers add up; among BEST offers only the one saving the customer most is used;
 * an EXCLUSIVE offer is used alone. The engine tries each allowed combination and keeps the best for the customer.
 */

export interface PricingLine { itemId: string; name: string; quantity: number; mrp: number; isCombo?: boolean; category?: string }
export interface CatalogueLookup { name(itemId: string): string | undefined; price(itemId: string): number | undefined }
export interface OfferUsage { total: number; byCustomer: number; gifts: number }
export interface PricingInput {
  brandCode: string;
  channel: string;
  dateAd: string;
  /** HH:mm, Nepal time. Without it, offers limited to hours of the day are not applied. */
  time?: string;
  customerPhone?: string;
  isFirstOrder?: boolean;
  /** The message text, for code words. */
  text?: string;
  lines: PricingLine[];
  campaigns: SaleCampaign[];
  /** Offers staff turned off for this order. */
  disabledOfferIds?: string[];
  usage?: (offerId: string) => OfferUsage;
  catalogue?: CatalogueLookup;
}
export interface PricedLine extends PricingLine {
  /** Unit price after offers (NPR, may have paisa). */
  offerUnitPrice: number;
  /** Line total after offers (NPR). */
  offerTotal: number;
  /** Taken off this line by offers (NPR). */
  offerDiscount: number;
  offers: { offerId: string; amount: number }[];
}
export interface GiftLine { itemId: string; name: string; quantity: number; mrp: number; offerId: string }
export interface OfferNote { offerId: string; offerName: string; campaignName: string; message: string }
export interface PricingResult {
  lines: PricedLine[];
  gifts: GiftLine[];
  applied: AppliedOffer[];
  /** Offers that are live for this order but did not apply, with what is missing ("Add NPR 300 more…"). */
  notes: OfferNote[];
  /** Every live offer that could apply, so staff can switch one off. */
  candidates: { offerId: string; offerName: string; campaignName: string; disabled: boolean }[];
  mrpTotal: number;
  offerTotal: number;
  discountTotal: number;
  freeDelivery: boolean;
  campaignIds: string[];
}

const cents = (value: number) => Math.round((Number(value) || 0) * 100);
const npr = (value: number) => Math.round(value) / 100;
const phoneDigits = (value?: string) => String(value || '').replace(/\D/g, '').replace(/^977(?=9)/, '');

// ---------------------------------------------------------------------------------------------- scheduling

/** "2026-10-01T18:00" → comparable minutes. Nepal time throughout; no time zone maths needed. */
const moment = (dateAd: string, time = '00:00') => `${dateAd}T${/^\d{2}:\d{2}$/.test(time) ? time : '00:00'}`;

export type CampaignState = 'Draft' | 'Template' | 'Scheduled' | 'Live' | 'Paused' | 'Ended';
/** What a campaign is doing at a moment (Nepal time). */
export function campaignState(campaign: Pick<SaleCampaign, 'status' | 'startsAt' | 'endsAt' | 'isTemplate'>, now: string): CampaignState {
  if (campaign.isTemplate) return 'Template';
  if (campaign.status === 'DRAFT') return 'Draft';
  if (campaign.status === 'ENDED' || now > campaign.endsAt) return 'Ended';
  if (campaign.status === 'PAUSED') return 'Paused';
  return now >= campaign.startsAt ? 'Live' : 'Scheduled';
}

/** Nepal time now as YYYY-MM-DDTHH:mm. */
export function nepalNow(date = new Date()): string {
  const shifted = new Date(date.getTime() + (5 * 60 + 45) * 60000);
  return shifted.toISOString().slice(0, 16);
}

/** Whether an order placed at this date (and time, if known) falls inside a window. Without a time, the date decides. */
function inWindow(dateAd: string, time: string | undefined, startsAt?: string, endsAt?: string): boolean {
  if (time) { const at = moment(dateAd, time); return (!startsAt || at >= startsAt) && (!endsAt || at <= endsAt); }
  return (!startsAt || dateAd >= startsAt.slice(0, 10)) && (!endsAt || dateAd <= endsAt.slice(0, 10));
}

/** Campaigns (not drafts, templates, paused or ended by hand) covering this brand, channel and moment. */
export function liveCampaigns(campaigns: SaleCampaign[], input: { brandCode: string; channel: string; dateAd: string; time?: string }): SaleCampaign[] {
  const channel = input.channel.trim().toLowerCase();
  return campaigns.filter((campaign) => !campaign.isTemplate && campaign.status === 'SCHEDULED'
    && (!campaign.brandCodes.length || campaign.brandCodes.includes(input.brandCode))
    && (!campaign.channels.length || campaign.channels.some((name) => name.trim().toLowerCase() === channel))
    && inWindow(input.dateAd, input.time, campaign.startsAt, campaign.endsAt));
}

// ---------------------------------------------------------------------------------------------- targeting

export function lineTargeted(line: PricingLine, target: OfferTarget): boolean {
  switch (target.mode) {
    case 'ALL': return true;
    case 'COMBOS': return !!line.isCombo;
    case 'SINGLES': return !line.isCombo;
    case 'CATEGORY': return !!line.category && (target.categories || []).some((name) => name.toLowerCase() === line.category!.toLowerCase());
    case 'ITEMS': return (target.itemIds || []).includes(line.itemId);
    case 'EXCEPT': return !(target.itemIds || []).includes(line.itemId);
    default: return false;
  }
}

const ITEM_LEVEL = new Set<OfferReward['type']>(['PERCENT_OFF', 'AMOUNT_OFF_EACH', 'FIXED_PRICE', 'BUY_X_GET_Y', 'BUNDLE_PRICE']);

// ---------------------------------------------------------------------------------------------- pricing

interface WorkLine { line: PricingLine; unit: number[]; offers: Map<string, number> }
interface Live { offer: SaleOffer; campaign: SaleCampaign }
interface Outcome { work: WorkLine[]; gifts: GiftLine[]; applied: Live[]; giftValue: number; freeDelivery: boolean; notes: OfferNote[] }

/** Spread an amount (paisa) over shares, largest remainders first, so parts add up exactly. */
export function allocate(total: number, shares: number[]): number[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  if (!sum || total <= 0) return shares.map(() => 0);
  const raw = shares.map((share, index) => ({ index, exact: (total * share) / sum }));
  const parts = raw.map((entry) => Math.floor(entry.exact));
  let left = total - parts.reduce((a, b) => a + b, 0);
  for (const entry of [...raw].sort((a, b) => (b.exact % 1) - (a.exact % 1) || a.index - b.index)) { if (left <= 0) break; parts[entry.index]++; left--; }
  return parts;
}

function take(work: WorkLine, unitIndex: number, amount: number, offerId: string): number {
  const off = Math.max(0, Math.min(work.unit[unitIndex], Math.round(amount)));
  work.unit[unitIndex] -= off;
  if (off) work.offers.set(offerId, (work.offers.get(offerId) || 0) + off);
  return off;
}
const lineTotal = (work: WorkLine) => work.unit.reduce((a, b) => a + b, 0);

function conditionProblem(condition: OfferCondition, targeted: WorkLine[], all: WorkLine[], input: PricingInput, offer: SaleOffer): string | null {
  if (condition.codeWord && !new RegExp(`(?<![\\p{L}\\p{N}])${condition.codeWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu').test(input.text || '')) return `Needs the code word ${condition.codeWord}.`;
  if (condition.customerPhones?.length && !condition.customerPhones.map(phoneDigits).includes(phoneDigits(input.customerPhone))) return 'For chosen customers only.';
  if (condition.firstOrderOnly && !input.isFirstOrder) return 'First order only.';
  if (condition.hours) {
    if (!input.time) return `Runs ${condition.hours.from}–${condition.hours.to}; the order time is not known.`;
    if (input.time < condition.hours.from || input.time > condition.hours.to) return `Runs ${condition.hours.from}–${condition.hours.to} only.`;
  }
  if (offer.startsAt || offer.endsAt) { if (!inWindow(input.dateAd, input.time, offer.startsAt, offer.endsAt)) return 'Outside this offer’s dates.'; }
  if (condition.requiresAll?.length && !condition.requiresAll.every((id) => all.some((work) => work.line.itemId === id))) return 'Needs all the listed items in the order.';
  if (!targeted.length) return 'No item in this order is part of the offer.';
  const units = targeted.reduce((sum, work) => sum + work.line.quantity, 0);
  if (condition.minUnits && units < condition.minUnits) return `Add ${condition.minUnits - units} more unit${condition.minUnits - units === 1 ? '' : 's'}.`;
  const value = targeted.reduce((sum, work) => sum + lineTotal(work), 0);
  if (condition.minOrderValue && value < cents(condition.minOrderValue)) return `Add NPR ${npr(cents(condition.minOrderValue) - value).toLocaleString()} more.`;
  return null;
}

function applyReward(live: Live, targeted: WorkLine[], outcome: Outcome, input: PricingInput): boolean {
  const { offer } = live; const reward = offer.reward; const id = offer.id;
  const units = targeted.flatMap((work) => work.unit.map((price, index) => ({ work, index, price })));
  let given = 0;
  switch (reward.type) {
    case 'PERCENT_OFF':
      for (const unit of units) given += take(unit.work, unit.index, unit.work.unit[unit.index] * Math.min(100, reward.percent) / 100, id);
      break;
    case 'AMOUNT_OFF_EACH':
      for (const unit of units) given += take(unit.work, unit.index, cents(reward.amount), id);
      break;
    case 'FIXED_PRICE':
      for (const unit of units) given += take(unit.work, unit.index, unit.work.unit[unit.index] - cents(reward.price), id);
      break;
    case 'BUY_X_GET_Y': {
      // In every group of buy+get units, the cheapest get units are discounted.
      const group = Math.max(1, reward.buy) + Math.max(1, reward.get);
      const sorted = [...units].sort((a, b) => b.price - a.price);
      const free = Math.floor(sorted.length / group) * Math.max(1, reward.get);
      for (const unit of sorted.slice(sorted.length - free)) given += take(unit.work, unit.index, unit.work.unit[unit.index] * Math.min(100, reward.percent) / 100, id);
      break;
    }
    case 'BUNDLE_PRICE': {
      // Any `pick` units for one price; the dearest units go into bundles first (best for the customer).
      const sorted = [...units].sort((a, b) => b.price - a.price);
      const bundles = Math.floor(sorted.length / Math.max(1, reward.pick));
      const inBundles = sorted.slice(0, bundles * Math.max(1, reward.pick));
      const before = inBundles.reduce((sum, unit) => sum + unit.work.unit[unit.index], 0);
      const off = Math.max(0, before - bundles * cents(reward.price));
      allocate(off, inBundles.map((unit) => unit.work.unit[unit.index])).forEach((amount, index) => { given += take(inBundles[index].work, inBundles[index].index, amount, id); });
      break;
    }
    case 'ORDER_AMOUNT_OFF': {
      const shares = units.map((unit) => unit.work.unit[unit.index]);
      const off = Math.min(cents(reward.amount), shares.reduce((a, b) => a + b, 0));
      allocate(off, shares).forEach((amount, index) => { given += take(units[index].work, units[index].index, amount, id); });
      break;
    }
    case 'TIERED': {
      const basis = reward.basis === 'UNITS' ? units.length : units.reduce((sum, unit) => sum + unit.work.unit[unit.index], 0);
      const tier = [...reward.tiers].sort((a, b) => b.min - a.min).find((entry) => basis >= (reward.basis === 'UNITS' ? entry.min : cents(entry.min)));
      if (!tier) {
        const next = [...reward.tiers].sort((a, b) => a.min - b.min)[0];
        if (next) outcome.notes.push(note(live, reward.basis === 'UNITS' ? `Add ${next.min - basis} more unit(s) for ${next.percent}% off.` : `Add NPR ${npr(cents(next.min) - basis).toLocaleString()} more for ${next.percent}% off.`));
        return false;
      }
      for (const unit of units) given += take(unit.work, unit.index, unit.work.unit[unit.index] * Math.min(100, tier.percent) / 100, id);
      break;
    }
    case 'FREE_GIFT': {
      const quantity = Math.max(1, Math.round(reward.quantity || 1));
      const used = input.usage?.(id).gifts || 0;
      if (offer.limits?.giftStock !== undefined && used + quantity > offer.limits.giftStock) { outcome.notes.push(note(live, 'The gifts for this offer have run out.')); return false; }
      const price = input.catalogue ? input.catalogue.price(reward.giftItemId) : 0;
      if (price === undefined) { outcome.notes.push(note(live, 'The gift product is not available for this brand.')); return false; }
      outcome.gifts.push({ itemId: reward.giftItemId, name: input.catalogue?.name(reward.giftItemId) || 'Gift', quantity, mrp: price, offerId: id });
      outcome.giftValue += cents(price) * quantity;
      return true;
    }
    case 'FREE_DELIVERY':
      outcome.freeDelivery = true;
      return true;
  }
  return given > 0;
}

const note = (live: Live, message: string): OfferNote => ({ offerId: live.offer.id, offerName: live.offer.name, campaignName: live.campaign.name, message });

function run(set: Live[], input: PricingInput): Outcome {
  const work: WorkLine[] = input.lines.map((line) => ({ line, unit: Array.from({ length: Math.max(0, Math.round(line.quantity)) }, () => cents(line.mrp)), offers: new Map() }));
  const outcome: Outcome = { work, gifts: [], applied: [], giftValue: 0, freeDelivery: false, notes: [] };
  const ordered = [...set].sort((a, b) => Number(!ITEM_LEVEL.has(a.offer.reward.type)) - Number(!ITEM_LEVEL.has(b.offer.reward.type))
    || (a.offer.reward.type === 'FREE_GIFT' || a.offer.reward.type === 'FREE_DELIVERY' ? 1 : 0) - (b.offer.reward.type === 'FREE_GIFT' || b.offer.reward.type === 'FREE_DELIVERY' ? 1 : 0)
    || a.offer.priority - b.offer.priority || a.offer.id.localeCompare(b.offer.id));
  for (const live of ordered) {
    const targeted = work.filter((entry) => lineTargeted(entry.line, live.offer.target));
    const problem = conditionProblem(live.offer.condition || {}, targeted, work, input, live.offer);
    if (problem) { outcome.notes.push(note(live, problem)); continue; }
    if (applyReward(live, targeted, outcome, input)) outcome.applied.push(live);
  }
  // Floors: no unit below the highest floor of the offers that touched it. Later offers give back first.
  for (const entry of work) {
    const touching = outcome.applied.filter((live) => entry.offers.has(live.offer.id) && live.offer.floorPercent);
    const floor = Math.max(0, ...touching.map((live) => live.offer.floorPercent!));
    if (!floor) continue;
    const minimum = Math.ceil(cents(entry.line.mrp) * floor / 100);
    for (let index = 0; index < entry.unit.length; index++) {
      let short = minimum - entry.unit[index];
      for (const live of [...outcome.applied].reverse()) {
        if (short <= 0) break;
        const had = entry.offers.get(live.offer.id) || 0; if (!had) continue;
        const back = Math.min(short, had); entry.offers.set(live.offer.id, had - back); entry.unit[index] += back; short -= back;
      }
    }
  }
  outcome.applied = outcome.applied.filter((live) => ['FREE_GIFT', 'FREE_DELIVERY'].includes(live.offer.reward.type) || work.some((entry) => (entry.offers.get(live.offer.id) || 0) > 0));
  return outcome;
}

const saving = (outcome: Outcome) => outcome.work.reduce((sum, entry) => sum + [...entry.offers.values()].reduce((a, b) => a + b, 0), 0) + outcome.giftValue;

/** Price an order with every live offer that applies. */
export function priceOrder(input: PricingInput): PricingResult {
  const live: Live[] = liveCampaigns(input.campaigns, input).flatMap((campaign) => campaign.offers.filter((offer) => offer.enabled !== false).map((offer) => ({ offer, campaign })));
  const disabled = new Set(input.disabledOfferIds || []);
  const notes: OfferNote[] = [];
  const allowed = live.filter((entry) => {
    if (disabled.has(entry.offer.id)) return false;
    const usage = input.usage?.(entry.offer.id);
    if (usage && entry.offer.limits?.totalUses !== undefined && usage.total >= entry.offer.limits.totalUses) { notes.push(note(entry, 'Used the maximum number of times.')); return false; }
    if (usage && entry.offer.limits?.perCustomer !== undefined && usage.byCustomer >= entry.offer.limits.perCustomer) { notes.push(note(entry, 'This customer has already used it.')); return false; }
    return true;
  });
  const stack = allowed.filter((entry) => entry.offer.stacking === 'STACK');
  const best = allowed.filter((entry) => entry.offer.stacking === 'BEST');
  const exclusive = allowed.filter((entry) => entry.offer.stacking === 'EXCLUSIVE');
  const options: Live[][] = [stack, ...best.map((entry) => [...stack, entry]), ...exclusive.map((entry) => [entry])];
  let chosen = run(options[0], input);
  for (const option of options.slice(1)) {
    const outcome = run(option, input);
    if (saving(outcome) > saving(chosen) || (saving(outcome) === saving(chosen) && outcome.applied.length < chosen.applied.length)) chosen = outcome;
  }
  // Explain offers that were left out because another one was better or exclusive.
  for (const entry of allowed) if (!chosen.applied.includes(entry) && !chosen.notes.some((item) => item.offerId === entry.offer.id)) {
    const reason = run([entry], input).notes.find((item) => item.offerId === entry.offer.id)?.message || (entry.offer.stacking === 'STACK' ? 'Did not apply to this order.' : 'Another offer saves the customer more.');
    chosen.notes.push(note(entry, reason));
  }
  const lines: PricedLine[] = chosen.work.map((entry) => {
    const total = lineTotal(entry); const before = cents(entry.line.mrp) * entry.unit.length;
    return { ...entry.line, offerTotal: npr(total), offerUnitPrice: entry.unit.length ? Math.round(total / entry.unit.length) / 100 : 0, offerDiscount: npr(before - total),
      offers: [...entry.offers.entries()].filter(([, amount]) => amount > 0).map(([offerId, amount]) => ({ offerId, amount: npr(amount) })) };
  });
  const applied: AppliedOffer[] = chosen.applied.map(({ offer, campaign }) => {
    const amount = chosen.work.reduce((sum, entry) => sum + (entry.offers.get(offer.id) || 0), 0);
    const gift = chosen.gifts.find((entry) => entry.offerId === offer.id);
    return { offerId: offer.id, offerName: offer.name, campaignId: campaign.id, campaignName: campaign.name, amount: npr(amount),
      ...(gift ? { giftItemId: gift.itemId, giftName: gift.name, giftQuantity: gift.quantity, giftValue: npr(cents(gift.mrp) * gift.quantity) } : {}),
      ...(offer.reward.type === 'FREE_DELIVERY' ? { freeDelivery: true } : {}) };
  });
  const mrpTotal = input.lines.reduce((sum, line) => sum + cents(line.mrp) * Math.round(line.quantity), 0);
  const offerTotal = chosen.work.reduce((sum, entry) => sum + lineTotal(entry), 0);
  return {
    lines, gifts: chosen.gifts, applied, notes: [...notes, ...chosen.notes],
    candidates: live.map(({ offer, campaign }) => ({ offerId: offer.id, offerName: offer.name, campaignName: campaign.name, disabled: disabled.has(offer.id) })),
    mrpTotal: npr(mrpTotal), offerTotal: npr(offerTotal), discountTotal: npr(mrpTotal - offerTotal), freeDelivery: chosen.freeDelivery,
    campaignIds: [...new Set(applied.map((entry) => entry.campaignId))],
  };
}

/** How often each offer has been used, from saved orders (cancelled orders give their use back). */
export function offerUsageFrom(orders: Pick<Order, 'status' | 'customerPhone' | 'appliedOffers' | 'id'>[], customerPhone?: string, excludeOrderId?: string) {
  const phone = phoneDigits(customerPhone);
  return (offerId: string): OfferUsage => {
    let total = 0, byCustomer = 0, gifts = 0;
    for (const order of orders) {
      if (order.status === 'CANCELLED' || order.id === excludeOrderId) continue;
      const hit = order.appliedOffers?.find((entry) => entry.offerId === offerId);
      if (!hit) continue;
      total++; if (phone && phoneDigits(order.customerPhone) === phone) byCustomer++; gifts += hit.giftQuantity || 0;
    }
    return { total, byCustomer, gifts };
  };
}

// ---------------------------------------------------------------------------------------------- validation

const TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const HOURS = /^\d{2}:\d{2}$/;
const STATUSES: CampaignStatus[] = ['DRAFT', 'SCHEDULED', 'PAUSED', 'ENDED'];
const clean = (value: unknown, max = 120) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max) : '';
const num = (value: unknown, min: number, max: number, label: string) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${label} must be between ${min} and ${max}.`);
  return Math.round(n * 100) / 100;
};
const ids = (value: unknown, max = 500) => Array.isArray(value) ? [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.length <= 200))].slice(0, max) : [];

function cleanReward(raw: any, name: string): OfferReward {
  const label = (field: string) => `${name}: ${field}`;
  switch (raw?.type) {
    case 'PERCENT_OFF': return { type: 'PERCENT_OFF', percent: num(raw.percent, 0.01, 100, label('percentage')) };
    case 'AMOUNT_OFF_EACH': return { type: 'AMOUNT_OFF_EACH', amount: num(raw.amount, 0.01, 1_000_000, label('amount off')) };
    case 'FIXED_PRICE': return { type: 'FIXED_PRICE', price: num(raw.price, 0, 1_000_000, label('sale price')) };
    case 'ORDER_AMOUNT_OFF': return { type: 'ORDER_AMOUNT_OFF', amount: num(raw.amount, 0.01, 1_000_000, label('amount off the order')) };
    case 'BUY_X_GET_Y': return { type: 'BUY_X_GET_Y', buy: num(raw.buy, 1, 100, label('buy')), get: num(raw.get, 1, 100, label('get')), percent: num(raw.percent ?? 100, 1, 100, label('discount on the extra item')) };
    case 'BUNDLE_PRICE': return { type: 'BUNDLE_PRICE', pick: num(raw.pick, 2, 100, label('number of items')), price: num(raw.price, 0, 1_000_000, label('bundle price')) };
    case 'TIERED': {
      const tiers = (Array.isArray(raw.tiers) ? raw.tiers : []).slice(0, 10).map((tier: any) => ({ min: num(tier?.min, 0, 10_000_000, label('tier minimum')), percent: num(tier?.percent, 0.01, 100, label('tier percentage')) }));
      if (!tiers.length) throw new Error(`${name}: add at least one tier.`);
      return { type: 'TIERED', basis: raw.basis === 'UNITS' ? 'UNITS' : 'ORDER_VALUE', tiers };
    }
    case 'FREE_GIFT': {
      const giftItemId = clean(raw.giftItemId, 200); if (!giftItemId) throw new Error(`${name}: choose the gift product.`);
      return { type: 'FREE_GIFT', giftItemId, quantity: num(raw.quantity ?? 1, 1, 100, label('gift quantity')) };
    }
    case 'FREE_DELIVERY': return { type: 'FREE_DELIVERY' };
    default: throw new Error(`${name}: choose what the customer gets.`);
  }
}

/** Check and tidy a campaign before it is saved (browser and server use the same rules). */
export function validateCampaign(raw: any): Omit<SaleCampaign, 'createdAt'> & { createdAt?: string } {
  const name = clean(raw?.name); if (!name) throw new Error('Give the sale a name.');
  const startsAt = clean(raw?.startsAt, 16), endsAt = clean(raw?.endsAt, 16);
  if (!TIME.test(startsAt) || !TIME.test(endsAt)) throw new Error('Choose a start and end date and time.');
  if (endsAt <= startsAt) throw new Error('The end must be after the start.');
  const status = STATUSES.includes(raw?.status) ? raw.status as CampaignStatus : 'DRAFT';
  const offers = (Array.isArray(raw?.offers) ? raw.offers : []).slice(0, 30).map((offer: any, index: number): SaleOffer => {
    const offerName = clean(offer?.name) || `Offer ${index + 1}`;
    const id = clean(offer?.id, 80) || `offer_${index}`;
    const mode = ['ALL', 'COMBOS', 'SINGLES', 'CATEGORY', 'ITEMS', 'EXCEPT'].includes(offer?.target?.mode) ? offer.target.mode : 'ALL';
    const target: OfferTarget = { mode, ...(['ITEMS', 'EXCEPT'].includes(mode) ? { itemIds: ids(offer.target.itemIds) } : {}), ...(mode === 'CATEGORY' ? { categories: ids(offer.target.categories, 50) } : {}) };
    if (['ITEMS', 'CATEGORY'].includes(mode) && !(target.itemIds?.length || target.categories?.length)) throw new Error(`${offerName}: choose the products or categories it applies to.`);
    const c = offer?.condition || {};
    const condition: OfferCondition = {
      ...(c.minUnits ? { minUnits: num(c.minUnits, 1, 10000, `${offerName}: minimum units`) } : {}),
      ...(c.minOrderValue ? { minOrderValue: num(c.minOrderValue, 1, 10_000_000, `${offerName}: minimum order value`) } : {}),
      ...(ids(c.requiresAll).length ? { requiresAll: ids(c.requiresAll) } : {}),
      ...(c.firstOrderOnly ? { firstOrderOnly: true } : {}),
      ...(ids(c.customerPhones).length ? { customerPhones: ids(c.customerPhones).map(phoneDigits).filter((phone) => /^9[678]\d{8}$/.test(phone)) } : {}),
      ...(clean(c.codeWord, 40) ? { codeWord: clean(c.codeWord, 40).toUpperCase() } : {}),
      ...(c.hours && HOURS.test(c.hours.from) && HOURS.test(c.hours.to) ? { hours: { from: c.hours.from, to: c.hours.to } } : {}),
    };
    if (condition.hours && condition.hours.to <= condition.hours.from) throw new Error(`${offerName}: the hours must end after they start.`);
    const reward = cleanReward(offer?.reward, offerName);
    const o: SaleOffer = { id, name: offerName, enabled: offer?.enabled !== false, target, condition, reward,
      stacking: ['STACK', 'BEST', 'EXCLUSIVE'].includes(offer?.stacking) ? offer.stacking : 'STACK', priority: Math.round(num(offer?.priority ?? index, 0, 1000, `${offerName}: priority`)) };
    const os = clean(offer?.startsAt, 16), oe = clean(offer?.endsAt, 16);
    if (os) { if (!TIME.test(os)) throw new Error(`${offerName}: invalid start.`); o.startsAt = os; }
    if (oe) { if (!TIME.test(oe)) throw new Error(`${offerName}: invalid end.`); o.endsAt = oe; }
    if (o.startsAt && o.endsAt && o.endsAt <= o.startsAt) throw new Error(`${offerName}: the end must be after the start.`);
    const limits = offer?.limits || {};
    const cleanLimits = {
      ...(limits.perCustomer ? { perCustomer: Math.round(num(limits.perCustomer, 1, 1000, `${offerName}: uses per customer`)) } : {}),
      ...(limits.totalUses ? { totalUses: Math.round(num(limits.totalUses, 1, 1_000_000, `${offerName}: total uses`)) } : {}),
      ...(limits.giftStock !== undefined && limits.giftStock !== '' && limits.giftStock !== null ? { giftStock: Math.round(num(limits.giftStock, 0, 1_000_000, `${offerName}: gift stock`)) } : {}),
    };
    if (Object.keys(cleanLimits).length) o.limits = cleanLimits;
    if (offer?.floorPercent) o.floorPercent = num(offer.floorPercent, 1, 100, `${offerName}: lowest price`);
    if (clean(offer?.websiteCode, 40)) o.websiteCode = clean(offer.websiteCode, 40).toUpperCase();
    if (clean(offer?.notes, 300)) o.notes = clean(offer.notes, 300);
    return o;
  });
  if (new Set(offers.map((offer: SaleOffer) => offer.id)).size !== offers.length) throw new Error('Two offers share an ID. Remove one and add it again.');
  if (status !== 'DRAFT' && !raw?.isTemplate && !offers.some((offer: SaleOffer) => offer.enabled)) throw new Error('Add at least one switched-on offer before scheduling.');
  return {
    id: clean(raw?.id, 120), name, brandCodes: ids(raw?.brandCodes, 50).map((code) => code.toUpperCase()), channels: ids(raw?.channels, 30),
    startsAt, endsAt, status, offers, ...(raw?.isTemplate ? { isTemplate: true } : {}),
    ...(clean(raw?.notes, 500) ? { notes: clean(raw.notes, 500) } : {}),
    ...(clean(raw?.endedAt, 30) ? { endedAt: clean(raw.endedAt, 30) } : {}),
    ...(clean(raw?.createdAt, 40) ? { createdAt: clean(raw.createdAt, 40) } : {}),
    ...(clean(raw?.createdBy, 120) ? { createdBy: clean(raw.createdBy, 120) } : {}),
    ...(clean(raw?.updatedAt, 40) ? { updatedAt: clean(raw.updatedAt, 40) } : {}),
  };
}

// ---------------------------------------------------------------------------------------------- overlaps & labels

/** Offers in different live or scheduled campaigns that can hit the same item at the same time. */
export function campaignOverlaps(campaigns: SaleCampaign[]): { a: string; b: string; message: string }[] {
  const active = campaigns.filter((campaign) => !campaign.isTemplate && ['SCHEDULED', 'PAUSED'].includes(campaign.status));
  const out: { a: string; b: string; message: string }[] = [];
  for (let i = 0; i < active.length; i++) for (let j = i + 1; j < active.length; j++) {
    const [x, y] = [active[i], active[j]];
    if (x.endsAt < y.startsAt || y.endsAt < x.startsAt) continue;
    if (x.brandCodes.length && y.brandCodes.length && !x.brandCodes.some((code) => y.brandCodes.includes(code))) continue;
    if (x.channels.length && y.channels.length && !x.channels.some((name) => y.channels.includes(name))) continue;
    const exclusive = [...x.offers, ...y.offers].some((offer) => offer.enabled && offer.stacking === 'EXCLUSIVE');
    out.push({ a: x.id, b: y.id, message: `${x.name} and ${y.name} run at the same time${exclusive ? '; an exclusive offer means only one will apply to an order' : '; their offers can stack'}.` });
  }
  return out;
}

export function describeReward(reward: OfferReward, itemName: (id: string) => string = (id) => id): string {
  switch (reward.type) {
    case 'PERCENT_OFF': return `${reward.percent}% off`;
    case 'AMOUNT_OFF_EACH': return `NPR ${reward.amount.toLocaleString()} off each`;
    case 'FIXED_PRICE': return `Sale price NPR ${reward.price.toLocaleString()}`;
    case 'ORDER_AMOUNT_OFF': return `NPR ${reward.amount.toLocaleString()} off the order`;
    case 'BUY_X_GET_Y': return `Buy ${reward.buy} get ${reward.get} ${reward.percent >= 100 ? 'free' : `${reward.percent}% off`}`;
    case 'BUNDLE_PRICE': return `Any ${reward.pick} for NPR ${reward.price.toLocaleString()}`;
    case 'TIERED': return reward.tiers.map((tier) => `${reward.basis === 'UNITS' ? `${tier.min}+ units` : `NPR ${tier.min.toLocaleString()}+`} → ${tier.percent}%`).join(' · ');
    case 'FREE_GIFT': return `Free ${reward.quantity > 1 ? `${reward.quantity}× ` : ''}${itemName(reward.giftItemId)}`;
    case 'FREE_DELIVERY': return 'Free delivery';
  }
}

/** Ready-made offers to start from. */
export const OFFER_TEMPLATES: { key: string; title: string; hint: string; build: () => Omit<SaleOffer, 'id' | 'priority'> }[] = [
  { key: 'flat', title: 'Flat % sale', hint: 'Everything, or chosen items, at a percentage off', build: () => ({ name: 'Flat sale', enabled: true, target: { mode: 'ALL' }, condition: {}, reward: { type: 'PERCENT_OFF', percent: 10 }, stacking: 'BEST' }) },
  { key: 'bogo', title: 'Buy one get one', hint: 'Buy X, get Y free or at a discount', build: () => ({ name: 'Buy 1 get 1 free', enabled: true, target: { mode: 'SINGLES' }, condition: {}, reward: { type: 'BUY_X_GET_Y', buy: 1, get: 1, percent: 100 }, stacking: 'BEST' }) },
  { key: 'gift', title: 'Free gift above X', hint: 'A product free when the order reaches an amount', build: () => ({ name: 'Free gift', enabled: true, target: { mode: 'ALL' }, condition: { minOrderValue: 2000 }, reward: { type: 'FREE_GIFT', giftItemId: '', quantity: 1 }, stacking: 'STACK' }) },
  { key: 'mix', title: 'Mix & match', hint: 'Any N chosen items for one price', build: () => ({ name: 'Any 3 for one price', enabled: true, target: { mode: 'SINGLES' }, condition: {}, reward: { type: 'BUNDLE_PRICE', pick: 3, price: 1999 }, stacking: 'BEST' }) },
  { key: 'tiers', title: 'Tiered spend', hint: 'Spend more, save more', build: () => ({ name: 'Spend more, save more', enabled: true, target: { mode: 'ALL' }, condition: {}, reward: { type: 'TIERED', basis: 'ORDER_VALUE', tiers: [{ min: 2000, percent: 10 }, { min: 3000, percent: 15 }] }, stacking: 'BEST' }) },
  { key: 'combo', title: 'Combo deal', hint: 'Combos only, at a percentage or a set price', build: () => ({ name: 'Combo deal', enabled: true, target: { mode: 'COMBOS' }, condition: {}, reward: { type: 'PERCENT_OFF', percent: 15 }, stacking: 'BEST' }) },
  { key: 'flash', title: 'Flash hour', hint: 'Extra off during set hours', build: () => ({ name: 'Flash hour', enabled: true, target: { mode: 'ALL' }, condition: { hours: { from: '18:00', to: '21:00' } }, reward: { type: 'PERCENT_OFF', percent: 5 }, stacking: 'STACK' }) },
  { key: 'delivery', title: 'Free delivery', hint: 'Free delivery above an amount', build: () => ({ name: 'Free delivery', enabled: true, target: { mode: 'ALL' }, condition: { minOrderValue: 2500 }, reward: { type: 'FREE_DELIVERY' }, stacking: 'STACK' }) },
  { key: 'custom', title: 'Custom', hint: 'Start empty and build it block by block', build: () => ({ name: 'New offer', enabled: true, target: { mode: 'ALL' }, condition: {}, reward: { type: 'PERCENT_OFF', percent: 5 }, stacking: 'STACK' }) },
];
