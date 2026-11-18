import { allocate, priceOrder, type PricingInput, type PricingResult } from './offers';
import { percentDiscountTotal } from './whatsapp-extractor';

/**
 * The full price trail for one order: catalogue MRP → offers (sales) → what staff wrote → net.
 * Shared by the extractor screen and the server so both arrive at the same numbers.
 *
 * What staff write always wins: a total ("total 3415"), a percentage ("5% off", taken from MRP) or a price
 * per item. Offers explain the first part of the discount; anything below the offer price is a one-off
 * customer discount. A written price above the offer price is refused, because it means an offer that
 * should not apply (untick it) or a wrong price.
 */
export interface TrailLine { itemId: string; name: string; quantity: number; mrp: number; isCombo?: boolean; category?: string; writtenUnitPrice?: number }
export interface TrailLineResult { offerTotal: number; offerDiscount: number; customerDiscount: number; total: number }
export interface PriceTrail {
  pricing: PricingResult | null;
  lines: TrailLineResult[];
  mrpTotal: number;
  offerTotal: number;
  total: number;
  offerDiscount: number;
  customerDiscount: number;
  problem?: string;
}

const c = (value: number) => Math.round((Number(value) || 0) * 100);
const n = (value: number) => Math.round(value) / 100;

export function priceTrail(input: { lines: TrailLine[]; kind?: 'ORDER' | 'ADD_ON' | 'EXCHANGE'; stated: number | null; percent: number | null;
  offers: Omit<PricingInput, 'lines'> | null }): PriceTrail {
  const mrp = input.lines.map((line) => c(line.mrp) * line.quantity);
  const mrpTotal = mrp.reduce((a, b) => a + b, 0);
  // An exchange collects only a written amount; offers do not price it.
  const pricing = input.kind === 'EXCHANGE' || !input.offers ? null : priceOrder({ ...input.offers, lines: input.lines.map(({ writtenUnitPrice: _w, ...line }) => line) });
  const offer = input.lines.map((_, index) => pricing ? c(pricing.lines[index].offerTotal) : mrp[index]);
  const offerTotal = offer.reduce((a, b) => a + b, 0);
  // The price staff wrote, line by line, when they wrote one; otherwise the offer price.
  const base = input.lines.map((line, index) => line.writtenUnitPrice !== undefined ? c(line.writtenUnitPrice) * line.quantity : offer[index]);
  let problem: string | undefined;
  const above = input.lines.findIndex((line, index) => line.writtenUnitPrice !== undefined && base[index] > offer[index]);
  if (above >= 0 && pricing?.applied.length) problem = `${input.lines[above].name} is written at NPR ${n(base[above] / input.lines[above].quantity).toLocaleString()}, above the offer price NPR ${n(offer[above] / input.lines[above].quantity).toLocaleString()}. Untick the offer if it does not apply, or correct the price.`;
  let target = base.reduce((a, b) => a + b, 0);
  if (input.kind === 'EXCHANGE') target = input.stated !== null ? c(input.stated) : 0;
  else if (input.stated !== null) target = c(input.stated);
  // A percentage is taken from the price before offers (MRP, or a price written per item), as staff mean it.
  else if (input.percent !== null) target = c(percentDiscountTotal(input.lines.reduce((sum, line, index) => sum + (line.writtenUnitPrice !== undefined ? c(line.writtenUnitPrice) * line.quantity : mrp[index]), 0) / 100, input.percent));
  if (input.kind !== 'EXCHANGE' && target > offerTotal && pricing?.applied.length && !problem) problem = `The written price NPR ${n(target).toLocaleString()} is above the offer price NPR ${n(offerTotal).toLocaleString()}. Untick offers that do not apply, or correct the price.`;
  // Spread the final amount over the lines in proportion to what each was going to cost.
  const capped = Math.min(target, base.reduce((a, b) => a + b, 0) || target);
  const totals = input.kind === 'EXCHANGE' ? allocate(capped, mrp) : allocate(capped, base);
  const lines = input.lines.map((_, index) => {
    const total = totals[index];
    const offerLine = input.kind === 'EXCHANGE' ? mrp[index] : offer[index];
    return { offerTotal: n(offerLine), offerDiscount: n(mrp[index] - offerLine), customerDiscount: n(Math.max(0, offerLine - total)), total: n(total) };
  });
  const total = totals.reduce((a, b) => a + b, 0);
  return { pricing, lines, mrpTotal: n(mrpTotal), offerTotal: n(input.kind === 'EXCHANGE' ? mrpTotal : offerTotal), total: n(total),
    offerDiscount: n(mrpTotal - (input.kind === 'EXCHANGE' ? mrpTotal : offerTotal)), customerDiscount: input.kind === 'EXCHANGE' ? 0 : n(Math.max(0, offerTotal - total)), problem };
}
