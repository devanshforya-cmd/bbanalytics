import { isSellableCombo } from './product-catalog';
import { BrandCode, Product, Combo, Brand } from './types';
import { adToBs, getTodayAd } from './nepali-calendar';

export type Confidence = 'HIGH' | 'AUTO' | 'REVIEW' | 'FAILED';
export interface ExtractedField<T> { value: T; confidence: Confidence; rawMatched?: string; matchedKeyword?: string }
export interface ExtractedProductItem {
  productId?: string; name: string; brandCode: BrandCode; quantity: number; unitPrice: number; totalPrice: number; confidence: Confidence; isCombo?: boolean;
  saleUnitPrice?: number; sourceLine?: number;
}
export interface ExtractedOrderResult {
  salesChannel?: string; assignedToId?: string; id: string;
  customerName: ExtractedField<string>; customerPhone: ExtractedField<string>; alternatePhone: ExtractedField<string>;
  brandCode: ExtractedField<BrandCode>; products: ExtractedProductItem[];
  address: ExtractedField<string>; rawAddress?: string; city: ExtractedField<string>; province: ExtractedField<string>;
  combo: ExtractedField<string>; totalAmount: ExtractedField<number>;
  statedPrice: ExtractedField<number> & { provided?: boolean; difference?: number; differencePct?: number; warning?: string; level?: 'OK' | 'WARNING' | 'REVIEW' };
  discountPercent?: ExtractedField<number> & { provided?: boolean };
  paymentTerms: ExtractedField<string>; deliveryMethod: ExtractedField<string>;
  orderDateAd: ExtractedField<string>; orderDateBs: ExtractedField<string>;
  flags: string[]; extractionErrors: string[]; rawText: string;
}
export const NEPAL_CITIES = ['Ghorahi','Budhanilkantha','Thecho','Kathmandu','Lalitpur','Bhaktapur','Pokhara','Chitwan','Narayangarh','Biratnagar','Butwal','Dharan','Birgunj','Hetauda','Nepalgunj','Itahari','Dhangadhi','Bhairahawa','Janakpur','Jhapa','Birtamode','Birtamod','Banepa','Dhulikhel','Surkhet'];
export interface DynamicExtractorOptions { products: Product[]; combos: Combo[]; brands: Brand[]; channels?: string[]; deliveryMethods?: string[]; dateOverride?: string; customSeparator?: string }

const headerStart = /^(?:\[(?=[^\]\n]*(?:\d{1,2}[/:.]\d{1,2}))[^\]\n]+\]\s*[^\n:]+:\s*|\d{1,2}[/.\-]\d{1,2}(?:[/.\-]\d{2,4})?,?\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:[AP]M)?\s*-\s*[^\n:]+:\s*)/gim;
export function splitMessageBlocks(rawText: string, customSeparator?: string): string[] {
  const text = rawText.trim(); if (!text) return [];
  const sections = customSeparator ? text.split(customSeparator) : text.split(/^\s*---+\s*$/m);
  return sections.flatMap(section => {
    const matches = [...section.matchAll(headerStart)];
    if (!matches.length) return section.trim() ? [section.trim()] : [];
    const blocks: string[] = [];
    const first = matches[0].index ?? 0;
    if (section.slice(0, first).trim()) blocks.push(section.slice(0, first).trim());
    for (let i = 0; i < matches.length; i++) {
      const block = section.slice(matches[i].index, matches[i + 1]?.index ?? section.length).trim();
      if (block) blocks.push(block);
    }
    return blocks;
  });
}
export const splitRawChatIntoBlocks = splitMessageBlocks;

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function expression(value: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(value.trim()).replace(/\s+/g, '\\s+')}(?![\\p{L}\\p{N}])`, 'iu');
}
function phoneNumbers(text: string): string[] {
  const values = [...text.matchAll(/(?<!\d)(?:\+?977[ .-]*)?9[678](?:[ .-]*\d){8}(?!\d)/g)].map(match => {
    const digits = match[0].replace(/\D/g, ''); return digits.length === 13 && digits.startsWith('977') ? digits.slice(3) : digits;
  }).filter(value => /^9[678]\d{8}$/.test(value));
  return [...new Set(values)];
}
function messageDate(text: string, override?: string): { value: string; confidence: Confidence; warning?: string } {
  if (override) return { value: override, confidence: 'HIGH' };
  const firstLine = text.split(/\r?\n/, 1)[0];
  const match = /(?:\[|^|,\s*)(\d{1,2})[/.\-](\d{1,2})(?:[/.\-](\d{2,4}))?/.exec(firstLine);
  if (!match) return { value: getTodayAd(), confidence: 'AUTO', warning: 'No message date found; today was selected.' };
  let day = Number(match[1]), month = Number(match[2]);
  if (month > 12 && day <= 12) [day, month] = [month, day];
  let year = match[3] ? Number(match[3]) : Number(getTodayAd().slice(0, 4)); if (year < 100) year += 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return { value: getTodayAd(), confidence: 'REVIEW', warning: 'The message date is invalid; check the order date.' };
  return { value: date.toISOString().slice(0, 10), confidence: match[3] ? 'HIGH' : 'REVIEW', ...(match[3] ? {} : { warning: 'The message has no year; the current year was selected.' }) };
}
function dateBs(value: string): string {
  try { const bs = adToBs(new Date(`${value}T12:00:00`)); return `${bs.monthName} ${bs.day}, ${bs.year}`; } catch { return ''; }
}
export function parseStatedPrice(text: string): number | null {
  const patterns = [
    /\b(?:total(?:\s+(?:amount|price))?|amount|cod|paid|price)\s*[:=\-]?\s*(?:(?:rs\.?|npr|₹)\s*)?([\d,]+(?:\.\d{1,2})?)/i,
    /(?:\brs\.?|\bnpr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
  ];
  for (const pattern of patterns) { const m = pattern.exec(text); if (m) { const amount = Number(m[1].replace(/,/g, '')); if (Number.isFinite(amount) && amount >= 0) return amount; } }
  return null;
}
export function parseDiscountPercent(text: string): number | null {
  const match = /\b(\d{1,3}(?:\.\d{1,2})?)\s*%\s*(?:off|discount)\b|\b(?:discount|sale)\s*[:=-]?\s*(\d{1,3}(?:\.\d{1,2})?)\s*%/i.exec(text);
  return match ? Number(match[1] || match[2]) : null;
}
export function extractedOrderTotal(order: ExtractedOrderResult): number {
  const cents = Math.round(order.products.reduce((sum, item) => sum + (item.saleUnitPrice ?? item.unitPrice) * item.quantity, 0) * 100);
  if (order.statedPrice.provided ?? order.statedPrice.value > 0) return order.statedPrice.value;
  if (order.discountPercent?.provided) return Math.round(cents * (1 - order.discountPercent.value / 100)) / 100;
  return cents / 100;
}
const aliases: [RegExp, string[]][] = [
  [/\bshampoo\b/i, ['shampo','shampu']], [/\bconditioner\b/i, ['condtioner','condi','cond']],
  [/\bserum\b/i, ['seram']], [/\bexfoliat\w*\b/i, ['exfo']], [/\bpeach\b/i, ['pech']],
  [/\baqua\b/i, ['aq']], [/\bfragrance\s*free\b/i, ['no fragrance','ff']],
];
const genericWords = new Set(['forya','brand','product','body','care','underarm','deodorant','roll','with','for','from','the','and','ml','free','fragrance','hair','skin','face']);
function comboNameAliases(combo: Combo): string[] {
  const heading = combo.name.split(/[–—:]/, 1)[0].trim();
  const match = /^(.*?)\s+(kit|set|pair|trio|duo|combo)$/i.exec(heading);
  if (!match) return [];
  const base = match[1].trim(), type = match[2].toLowerCase();
  const words = base.split(/\s+/); const first = words[0], last = words[words.length - 1];
  const result = [heading];
  if (type === 'duo' && /\bcare\b/i.test(base)) {
    const shorter = base.replace(/\bcare\b/gi, '').replace(/\s+/g, ' ').trim();
    if (shorter) {
      result.push(`${shorter} duo`);
      const last = shorter.split(/\s+/).pop();
      if (last && last.length >= 3) result.push(`${last} duo`);
    }
  }
  if (words.length > 1 && !['care', 'hair', 'body', 'full'].includes(last.toLowerCase())) result.push(base, `${last} ${type}`);
  if (type === 'pair' && words.length > 1) result.push(`${first} pair`);
  if (type === 'set') result.push(`${base} combo`);
  if (type === 'combo') result.push(`${base} set`);
  if (type === 'kit' && words.length > 1) result.push(`${first} kit`);
  if (type === 'kit' && combo.items.reduce((sum, item) => sum + item.quantity, 0) === 3) result.push(`${first} trio`);
  if (/hairfall/i.test(base)) result.push(base.replace(/hairfall/ig, 'hair fall'));
  if (/\bfull\s+set$/i.test(heading)) { result.push('full set', `${combo.brandCode} set`); if (words.length > 1) result.push(`${words.slice(0,-1).join(' ')} set`); }
  return result;
}
function keywordsFor(item: Product | Combo, combo: boolean): string[] {
  const name = item.name || '';
  const explicit = [...(item.extractorKeywords || []), item.sku || '', name, ...(!combo && 'keywords' in item ? item.keywords || [] : [])];
  const derived = combo ? comboNameAliases(item as Combo) : (name.match(/[\p{L}]{4,}/gu) || []).filter(word => !genericWords.has(word.toLowerCase()));
  const synonyms = combo ? [] : aliases.flatMap(([pattern, words]) => pattern.test(name) ? words : []);
  if (!combo && /\bfragrance\s*free\b/i.test(name)) synonyms.push('fragrance free');
  return [...new Set([...explicit, ...derived, ...synonyms].map(value => value.trim()).filter(value => value.length >= 2))];
}
type Match = { id: string; item: Product | Combo; keyword: string; start: number; end: number; line: number; combo: boolean };
function qtyFor(lines: string[], match: Match, text: string): number {
  const line = lines[match.line]; const start = match.start; const end = match.end;
  const before = line.slice(0, start), after = line.slice(end);
  const suffix = /^\s*(?:[:=\-–—]\s*)?(?:[x×]\s*(\d{1,6})\b|(\d{1,6})\s*(?:units?|pcs?|pieces?|sets?|trios?|kits?|pairs?|combos?|bottles?)\b|(\d{1,6})\s*$)/i.exec(after);
  const prefix = /(?:^|\s)(\d{1,6})\s*(?:(?:units?|pcs?|pieces?|sets?|trios?|kits?|pairs?|combos?|bottles?)\s*(?:of\s*)?|[x×]\s*)?$/i.exec(before);
  const nextLine = lines.slice(match.line + 1, match.line + 5).find(line => line.trim());
  const next = /^\s*(\d{1,6})\s*(?:units?|pcs?|pieces?|sets?|trios?|kits?|pairs?|combos?|bottles?)(?:\s*[-:,]?\s*(?:rs\.?|npr|₹)\s*[\d,]+(?:\.\d{1,2})?)?\s*$/i.exec(nextLine || '');
  const each = /\b(\d{1,6})\s*(?:units?|pcs?|pieces?)?\s*each\b/i.exec(text);
  // "Aqua rollon 2 pcs": a few more words of the product name before a quantity with a unit.
  const later = /^(?![^\n]*?\b(?:and|with)\b)[^\d\n+,&/;|]{1,24}?(\d{1,6})\s*(?:units?|pcs?|pieces?|sets?|trios?|kits?|pairs?|combos?|bottles?)\b/i.exec(after);
  const qty = Number(suffix?.[1] || suffix?.[2] || suffix?.[3] || prefix?.[1] || later?.[1] || next?.[1] || each?.[1] || 1);
  return qty;
}
function matchCatalog(text: string, products: Product[], combos: Combo[], flags: string[]): ExtractedProductItem[] {
  const lines = text.split(/\r?\n/);
  const candidates: Match[] = [];
  const catalog = [...combos.map(item => ({ item, combo: true })), ...products.map(item => ({ item, combo: false }))];
  for (const { item, combo } of catalog) for (const keyword of keywordsFor(item, combo)) {
    const re = expression(keyword);
    lines.forEach((line, index) => {
      if (/^\s*(?:name|naam|customer|phone|mobile|contact|address|location|delivery address|shipping address|total|price|amount|payment|platform)\s*[:=\-]/i.test(line)) return;
      if (combo) {
        const isSku = item.sku && keyword.toLowerCase() === item.sku.toLowerCase();
        const namesBundle = /\b(?:duo|pair|trio|kit|set|combo|bundle|pack)\b/i.test(keyword) && /[a-z0-9]/i.test(keyword.replace(/\b(?:duo|pair|trio|kit|set|combo|bundle|pack)\b/gi, '').trim());
        const exactName = keyword.toLowerCase() === item.name.toLowerCase() && new RegExp(`^\\s*${escapeRegex(keyword)}\\s*(?:[:=\\-–—]?\\s*(?:[x×]\\s*)?\\d+\\s*(?:units?|pcs?|pieces?|sets?|kits?|pairs?|combos?)?)?\\s*$`, 'i').test(line);
        if (!isSku && !namesBundle && !exactName) return;
      }
      const found = re.exec(line); if (found) candidates.push({ id: item.id, item, keyword, start: found.index, end: found.index + found[0].length, line: index, combo });
    });
  }
  const chosen: Match[] = [];
  const ambiguous: { candidate: Match; ids: string[] }[] = [];
  for (const combo of [true, false]) {
    const group = candidates.filter(candidate => candidate.combo === combo).sort((a,b) => (b.end - b.start) - (a.end - a.start));
    for (const candidate of group) {
      if (chosen.some(c => c.id === candidate.id)) continue;
      if (!combo) {
        const namedCombo = chosen.find(c => c.combo && c.line === candidate.line);
        if (namedCombo) {
          const before = lines[candidate.line].slice(namedCombo.end, candidate.start);
          const open = before.lastIndexOf('('), close = before.lastIndexOf(')');
          if (open >= 0 && open > close) continue;
          const component = (namedCombo.item as Combo).items.some(part => part.productId === candidate.id);
          if (component && !/(?:\+|\bplus\b|\band\b|\balso\b)\s*(?:\d+\s*[x×]?\s*)?$/i.test(before)) continue;
        }
      }
      if (chosen.some(c => c.line === candidate.line && candidate.start < c.end && candidate.end > c.start)) continue;
      const collision = group.some(other => other.id !== candidate.id && other.line === candidate.line && other.start === candidate.start && other.end === candidate.end);
      if (collision) { ambiguous.push({ candidate, ids: group.filter(other => other.line === candidate.line && other.start === candidate.start && other.end === candidate.end).map(other => other.id) }); continue; }
      chosen.push(candidate);
    }
  }
  for (const match of ambiguous) if (!chosen.some(item => item.line === match.candidate.line && match.ids.includes(item.id))) {
    const flag = `“${match.candidate.keyword}” matches multiple catalogue items; select the correct item.`; if (!flags.includes(flag)) flags.push(flag);
  }
  return chosen.sort((a,b) => a.line - b.line || a.start - b.start).map(match => {
    const quantity = qtyFor(lines, match, text);
    const price = match.combo ? Number((match.item as Combo).comboPrice || (match.item as Combo).comboMrp || 0) : Number((match.item as Product).mrp || 0);
    return { productId: match.id, name: match.item.name, brandCode: match.item.brandCode, quantity, unitPrice: price, totalPrice: price * quantity, sourceLine: match.line, confidence: 'HIGH' as Confidence, ...(match.combo ? { isCombo: true } : {}) };
  });
}
function collapseCombo(items: ExtractedProductItem[], combos: Combo[], stated: number | null, flags: string[], discount: number | null): ExtractedProductItem[] {
  if (stated === null || items.some(item => item.isCombo) || items.length < 2) return items;
  const found = combos.filter(combo => combo.priceDetectionEnabled !== false).flatMap(combo => {
    const needed = new Map<string, number>(); combo.items.forEach(item => needed.set(item.productId, (needed.get(item.productId) || 0) + item.quantity));
    if (needed.size !== items.length) return [];
    const counts = items.map(item => item.productId && needed.has(item.productId) ? item.quantity / needed.get(item.productId)! : 0);
    const quantity = counts[0]; const price = combo.comboPrice || combo.comboMrp || 0;
    const expected = Math.round(price * quantity * 100 * (1 - (discount ?? 0) / 100)) / 100;
    return Number.isInteger(quantity) && quantity > 0 && counts.every(count => count === quantity) && Math.abs(stated - expected) < 0.005 ? [{ combo, quantity, price }] : [];
  });
  if (found.length > 1) { flags.push('Multiple combos match these items and price; choose one manually.'); return items; }
  if (!found.length) return items;
  const { combo } = found[0]; flags.push(`The items and price also match ${combo.name}; select the combo manually if intended.`);
  return items;
}
function extractPrices(lines: string[], items: ExtractedProductItem[], flags: string[]): number | null {
  let stated: number | null = null;
  const priced = new Set<string>();
  for (const [index, line] of lines.entries()) {
    // A line that is only an amount ("1895", "Rs 1895/-") is the price the team wrote for this order.
    const bare = /^\s*(?:(?:rs\.?|npr|₹)\s*)?(\d{1,3}(?:,\d{3})+|\d{2,6})(?:\.\d{1,2})?\s*(?:\/-|rs\.?|npr)?\s*$/i.exec(line);
    const amount = parseStatedPrice(line) ?? (bare ? Number(line.replace(/[^\d.]/g, '')) : null);
    if (amount === null || !Number.isFinite(amount)) continue;
    const isTotal = /^\s*(?:(?:grand\s+)?total(?:\s+(?:amount|price))?|(?:order|final)\s+(?:total|amount)|amount|cod|paid)\b/i.test(line);
    if (isTotal) {
      if (stated !== null) flags.push('Price needs review: Multiple order totals were mentioned. Choose the correct total.');
      else stated = amount;
      continue;
    }
    const sameLine = items.filter(item => item.sourceLine === index);
    const preceding = items.filter(item => item.sourceLine !== undefined && item.sourceLine < index).sort((a,b) => b.sourceLine! - a.sourceLine!);
    const nearest = preceding[0];
    const between = nearest ? lines.slice(nearest.sourceLine! + 1, index) : [];
    const connected = nearest && between.every(value => /^(?:qty|quantity)?\s*[:=\-]?\s*\d+\s*(?:units?|pcs?|pieces?|bottles?|kits?|sets?|pairs?|combos?)\b/i.test(value));
    const item = sameLine.length === 1 ? sameLine[0] : sameLine.length === 0 && connected ? nearest : undefined;
    const explicitUnit = /\b(?:each|per\s*(?:unit|piece)|unit\s*price)\b/i.test(line);
    const followedByItem = items.some(other => other.sourceLine !== undefined && other.sourceLine > index);
    const clearScope = item && (item.quantity === 1 || explicitUnit) && (sameLine.length === 1 || followedByItem || items.length === 1 || explicitUnit);
    if (!clearScope || !item?.productId || priced.has(item.productId) || amount > item.unitPrice + 0.005) {
      // A selling price can never be above the catalogue price, so an amount larger than any single
      // item's price (and not more than the items' total) can only be the order total.
      const subtotal = items.reduce((sum, entry) => sum + entry.totalPrice, 0);
      const highestUnit = Math.max(0, ...items.map((entry) => entry.unitPrice));
      if (stated === null && items.length && items.every((entry) => entry.productId) && amount > highestUnit && amount <= subtotal + 0.005) { stated = amount; continue; }
      flags.push(`Price needs review: NPR ${amount.toLocaleString()} could be an item price or an order total. Enter the agreed price below.`);
      continue;
    }
    priced.add(item.productId);
    item.saleUnitPrice = amount;
    item.totalPrice = Math.round(amount * item.quantity * 100) / 100;
  }
  return stated;
}
export function validateExtractedOrder(order: ExtractedOrderResult): string[] {
  const errors: string[] = [];
  if (!order.customerName.value.trim()) errors.push('Enter the customer name.');
  if (!/^9[678]\d{8}$/.test(order.customerPhone.value.replace(/\D/g, '').replace(/^977(?=9)/, ''))) errors.push('Enter a valid Nepal mobile number.');
  if (order.alternatePhone.value && !/^9[678]\d{8}$/.test(order.alternatePhone.value.replace(/\D/g, '').replace(/^977(?=9)/, ''))) errors.push('Enter a valid alternate phone number.');
  const date = new Date(`${order.orderDateAd.value}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(order.orderDateAd.value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== order.orderDateAd.value) errors.push('Enter a valid order date.');
  if (!order.address.value.trim()) errors.push('Enter the delivery address.');
  if (!order.products.length || order.products.some(item => !item.productId || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 10000 || item.unitPrice <= 0)) errors.push('Select valid catalogue items and quantities.');
  if (order.products.some(item => item.saleUnitPrice !== undefined && (!Number.isFinite(item.saleUnitPrice) || item.saleUnitPrice < 0 || item.saleUnitPrice > item.unitPrice || Math.abs(item.saleUnitPrice * 100 - Math.round(item.saleUnitPrice * 100)) > 1e-6))) errors.push('Each selling price must be between zero and its catalogue price, with at most two decimal places.');
  if (new Set(order.products.map(item => item.brandCode)).size > 1) errors.push('Split products from different brands into separate orders.');
  if (order.statedPrice.value < 0 || !Number.isFinite(order.statedPrice.value) || Math.abs(order.statedPrice.value * 100 - Math.round(order.statedPrice.value * 100)) > 1e-6) errors.push('Enter a valid stated amount.');
  if (order.statedPrice.value > order.products.reduce((sum, item) => sum + (item.saleUnitPrice ?? item.unitPrice) * item.quantity, 0) + 0.005) errors.push('The stated amount exceeds the item selling prices; review items or amount.');
  if (order.discountPercent?.provided) {
    const pct = order.discountPercent.value;
    if (!Number.isFinite(pct) || pct < 0 || pct > 100 || Math.abs(pct * 100 - Math.round(pct * 100)) > 1e-6) errors.push('Enter a discount between 0 and 100%.');
    if (order.flags.some(flag => flag.startsWith('Discount scope is unclear'))) errors.push('Review the discount scope; clear the percentage and enter the agreed order total.');
  }
  if (order.flags.some(flag => flag.includes('matches multiple catalogue items') || flag.startsWith('Multiple combos match'))) errors.push('Resolve the ambiguous catalogue match before saving.');
  if (order.flags.some(flag => flag.startsWith('Unrecognized order item:'))) errors.push('Review the unrecognized item and add the correct catalogue product before saving.');
  if (order.flags.some(flag => flag.startsWith('Price needs review:'))) errors.push('Review the price before saving this order.');
  return errors;
}
export function extractSingleOrder(blockText: string, options: DynamicExtractorOptions): ExtractedOrderResult {
  const text = blockText.trim();
  const body = text.replace(headerStart, '').trim();
  const lines = body.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const flags: string[] = []; const date = messageDate(text, options.dateOverride); if (date.warning) flags.push(date.warning);
  const phones = phoneNumbers(body);
  const products = options.products.filter(product => product.active !== false);
  const combos = options.combos.filter(combo => isSellableCombo(combo, products));
  const discount = parseDiscountPercent(body);
  let items = matchCatalog(lines.join('\n'), products, combos, flags);
  const stated = extractPrices(lines, items, flags);
  const unrecognizedItemLines = new Set<string>();
  for (const [index, line] of lines.entries()) {
    if (/^\s*(?:name|naam|customer|phone|mobile|contact|address|location|delivery|shipping|payment|total|amount|price|discount|date|platform|channel|note)\b/i.test(line)) continue;
    const quantity = /\b\d{1,6}\s*(?:units?|pcs?|pieces?|bottles?|kits?|sets?|pairs?|combos?)\b/i.exec(line);
    const nextIsQuantity = /^\d{1,6}\s*(?:units?|pcs?|pieces?|bottles?|kits?|sets?|pairs?|combos?)\b/i.test(lines[index + 1] || '');
    const inProductSection = lines.slice(0, index).some(previous => phoneNumbers(previous).length || /^(?:inside|outside)\s+(?:the\s+)?(?:valley|ring\s*road)\b/i.test(previous));
    const before = (quantity ? line.slice(0, quantity.index) : nextIsQuantity && inProductSection ? line : '').replace(/[^\p{L}]+/gu, '');
    if (before && !matchCatalog(line, products, combos, []).length) {
      unrecognizedItemLines.add(line);
      flags.push(`Unrecognized order item: ${line.slice(0, 160)}. Select the correct product and review.`);
    }
  }
  items = collapseCombo(items, combos, stated, flags, discount);
  if (discount !== null && items.length > 1 && lines.some(line => parseDiscountPercent(line) !== null && [...products, ...combos].some(item => keywordsFor(item, 'items' in item).some(keyword => expression(keyword).test(line))))) flags.push('Discount scope is unclear because the percentage appears on an item line.');
  const itemSubtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  const namePrefix = /^(?:name|naam|customer(?:\s+name)?|receiver)(?:\s*[:=\-]\s*|\s+)/i;
  const nameLine = lines.find(line => namePrefix.test(line));
  let name = nameLine?.replace(namePrefix, '').trim() || '';
  if (!name) name = lines.find(line => /^[\p{L}][\p{L}\s.'-]{1,79}$/u.test(line) && !/^(?:contact|order|website|number|location|address|phone|delivery|note|ph\s*no|paid|unpaid|cod|total|product|items?)\b/i.test(line) && !NEPAL_CITIES.some(city => line.toLowerCase() === city.toLowerCase()) && !items.some(item => expression(item.name).test(line) || item.name.toLowerCase().includes(line.toLowerCase()))) || '';
  const addressPrefix = /^(?:delivery\s*address|shipping\s*address|address|location|thau)(?:\s*[:=\-]\s*|\s+)/i;
  const addressLine = lines.find(line => addressPrefix.test(line));
  const knownAddress = lines.find(line => line !== name && !/^(?:outside|inside|name|phone|product|total|payment|price)\b/i.test(line) && (/\b(?:near|chowk|tole|marg|galli|road|bazaar|mall|height|park|village|dang)\b/i.test(line) || NEPAL_CITIES.some(city => expression(city).test(line))));
  const optionNames = ['ML', ...(options.channels || ['TikTok', 'WhatsApp', 'Messenger', 'Website', 'Instagram', 'Facebook']), ...(options.deliveryMethods || ['Pathao', 'InDrive'])];
  const zoneIndex = lines.findIndex(line => /^(?:outside|inside)\s+(?:the\s+)?(?:valley|ring\s*road)\b/i.test(line));
  const phoneIndex = lines.findIndex(line => phoneNumbers(line).length);
  // shortcut: without a matching product, only customer lines before a delivery zone or phone are candidates; ambiguous formats need review.
  const addressLines = items.length ? lines : zoneIndex >= 0 ? lines.slice(0, zoneIndex) : phoneIndex >= 0 ? lines.slice(0, phoneIndex) : [];
  const fallbackAddress = !addressLine ? addressLines.filter(line => {
    if (line === name || unrecognizedItemLines.has(line) || phoneNumbers(line).length || optionNames.some(option => option.toLowerCase() === line.toLowerCase())) return false;
    if (/^(?:outside|inside|name|naam|customer|receiver|phone|mobile|contact|ph\s*no|address|location|thau|product|items?|qty|quantity|order|date|payment|paid|unpaid|cod|total|amount|price|discount|sale|platform|channel|courier|delivery|shipping|note|remarks?)\b/i.test(line)) return false;
    if (/^(?:free\s+(?:shipping|delivery)\b|\d+\s*(?:units?|pcs?|pieces?|sets?|kits?|pairs?|combos?|bottles?)\b|\d+(?:\.\d+)?\s*%|(?:rs\.?|npr|₹)\s*\d)/i.test(line)) return false;
    if (/\b\d{1,6}\s*(?:units?|pcs?|pieces?|bottles?|kits?|sets?|pairs?|combos?)\b/i.test(line)) return false;
    return !matchCatalog(line, products, combos, []).length;
  }).join(', ') : '';
  const addressBase = addressLine?.replace(addressPrefix, '').trim() || fallbackAddress || knownAddress || '';
  const zone = lines.find(line => /^(?:outside|inside)\s+(?:the\s+)?(?:valley|ring\s*road)\b/i.test(line));
  const address = addressBase && zone && !addressBase.toLowerCase().includes(zone.toLowerCase()) ? `${addressBase}, ${zone}` : addressBase;
  const city = NEPAL_CITIES.find(value => expression(value).test(body)) || '';
  const provinceRules: [RegExp, string][] = [
    [/\b(?:koshi|itahari|sunsari|dharan|jhapa|morang|damak|birtamod(?:e)?|biratnagar|ilam|taplejung|sankhuwasabha)\b/i,'Koshi Province'],
    [/\b(?:gandaki|gorkha|tanahun|kaski|pokhara|syangja|lamjung|baglung|myagdi|damauli|besishahar)\b/i,'Gandaki Province'],
    [/\b(?:lumbini|butwal|rupandehi|bhairahawa|nawalparasi|palpa|dang|ghorahi|nepalgunj|banke|bardaghat|tansen)\b/i,'Lumbini Province'],
    [/\b(?:madhesh|janakpur|birgunj|parsa|rautahat)\b/i,'Madhesh Province'], [/\b(?:karnali|surkhet)\b/i,'Karnali Province'],
    [/\b(?:sudurpashchim|kailali|kanchanpur|dhangadhi|tikapur)\b/i,'Sudurpashchim Province'],
    [/\b(?:bagmati|kathmandu|lalitpur|thecho|budhanilkantha|bhaktapur|hetauda|chitwan|narayangarh|banepa|dhulikhel)\b/i,'Bagmati Province'],
  ];
  const province = provinceRules.find(([pattern]) => pattern.test(body))?.[1] || '';
  const detectedBrands = [...new Set(items.map(item => item.brandCode))];
  const brand = detectedBrands.length === 1 ? detectedBrands[0] : options.brands.find(item => expression(item.code).test(body) || expression(item.name).test(body))?.code || 'ALL';
  const labelledChannel = lines.find(line => /^(?:platform|sales\s*channel|channel|source)\s*[:=\-]/i.test(line))?.replace(/^(?:platform|sales\s*channel|channel|source)\s*[:=\-]\s*/i, '').trim();
  const platform = options.channels?.slice().sort((a,b) => b.length - a.length).find(value => expression(value).test(body)) || (/\btiktok\b/i.test(body) ? 'TikTok' : /\bwhatsapp\b/i.test(body) ? 'WhatsApp' : /\bmessenger\b/i.test(body) ? 'Messenger' : (/\bwebsite\b/i.test(body) || /(?:^|\n)\s*(?:platform\s*[:=]\s*)?ML\s*(?:$|\n)/.test(body)) ? 'Website' : /\binstagram\b/i.test(body) ? 'Instagram' : undefined) || labelledChannel || (options.channels ? options.channels.find(value => value.toLowerCase() === 'instagram') : 'Instagram');
  const prepaid = !/\b(?:unpaid|not\s+paid)\b/i.test(body) && /\b(?:paid|prepaid|esewa|khalti|fonepay|bank transfer)\b/i.test(body);
  const delivery = options.deliveryMethods?.slice().sort((a,b) => b.length - a.length).find(value => expression(value).test(body)) || (/\bpathao\b/i.test(body) ? 'Pathao' : /\bindrive\b/i.test(body) ? 'InDrive' : '');
  if (!items.length) flags.push('No catalogue item recognized; add the correct product or combo.');
  if (stated !== null && discount !== null && itemSubtotal > 0) {
    // Both a written price and a percentage: the written price is what the customer agreed to pay.
    const expected = Math.round(itemSubtotal * (100 - discount)) / 100;
    if (Math.abs(stated - expected) > Math.max(5, expected * 0.01)) flags.push(`Written price NPR ${stated.toLocaleString()} is used. It differs from ${discount}% off (NPR ${expected.toLocaleString()}); check the price.`);
    else flags.push(`Written price NPR ${stated.toLocaleString()} is used (${discount}% off NPR ${itemSubtotal.toLocaleString()}).`);
  } else if (stated !== null && itemSubtotal > 0 && stated !== itemSubtotal) flags.push(`Stated total NPR ${stated.toLocaleString()} differs from item prices total NPR ${itemSubtotal.toLocaleString()}; review before saving.`);
  const comboNames = items.filter(item => item.isCombo).map(item => item.name);
  const order: ExtractedOrderResult = {
    id: `ext_${globalThis.crypto.randomUUID()}`, salesChannel: platform,
    customerName: { value: name, confidence: name ? (nameLine ? 'HIGH' : 'REVIEW') : 'FAILED' },
    customerPhone: { value: phones[0] || '', confidence: phones[0] ? 'HIGH' : 'FAILED' }, alternatePhone: { value: phones[1] || '', confidence: phones[1] ? 'HIGH' : 'AUTO' },
    brandCode: { value: brand, confidence: detectedBrands.length === 1 ? 'HIGH' : 'REVIEW' }, products: items,
    address: { value: address, confidence: address ? (addressLine ? 'HIGH' : 'REVIEW') : 'FAILED' }, rawAddress: address,
    city: { value: city, confidence: city ? 'AUTO' : 'FAILED' }, province: { value: province, confidence: province ? 'AUTO' : 'FAILED' },
    combo: { value: comboNames.join(', ') || 'None (Standard SKU)', confidence: 'AUTO' },
    totalAmount: { value: stated !== null && stated <= itemSubtotal ? stated : itemSubtotal, confidence: itemSubtotal ? 'HIGH' : 'REVIEW' },
    statedPrice: { value: stated ?? 0, provided: stated !== null, confidence: stated !== null ? 'HIGH' : 'REVIEW', difference: stated === null ? 0 : Math.abs(stated-itemSubtotal), differencePct: itemSubtotal && stated !== null ? Math.round(Math.abs(stated-itemSubtotal)/itemSubtotal*100) : 0, level: stated !== null && stated !== itemSubtotal ? 'WARNING' : 'OK' },
    discountPercent: { value: discount ?? 0, provided: discount !== null, confidence: discount !== null ? 'HIGH' : 'REVIEW' },
    paymentTerms: { value: prepaid ? 'Prepaid' : 'COD', confidence: 'AUTO' }, deliveryMethod: { value: delivery, confidence: delivery ? 'AUTO' : 'REVIEW' },
    orderDateAd: { value: date.value, confidence: date.confidence }, orderDateBs: { value: dateBs(date.value), confidence: date.confidence },
    flags, extractionErrors: [], rawText: text,
  };
  order.totalAmount.value = extractedOrderTotal(order);
  order.extractionErrors = validateExtractedOrder(order); return order;
}
export function extractOrdersDynamically(rawText: string, options: DynamicExtractorOptions): ExtractedOrderResult[] {
  return splitMessageBlocks(rawText, options.customSeparator).map(block => extractSingleOrder(block, options));
}
export function extractOrderFromChat(rawText: string): ExtractedOrderResult {
  const { db } = require('./db/db-service');
  const products = db.getProducts().filter((p: Product) => p.active !== false);
  return extractSingleOrder(rawText, { products, combos: db.getCombos(), brands: db.getBrands().filter((b: Brand) => b.status !== 'ARCHIVED') });
}
