import { allowedEdits, editDistance } from './fuzzy-match';

/**
 * Auto-suggested extractor phrases for products and combos. The extractor already forgives small typos in
 * longer words (see fuzzy-match.ts), so suggestions cover what it cannot guess on its own:
 * joined and split words ("bodywash", "roll on"), sound-alike spellings ("sampoo", "kandisanar"),
 * short words that must match exactly ("aqua" → "akua"), shortened names ("exfo wash") and plurals.
 */

const STOP = new Set(['with', 'from', 'pack', 'size', 'for', 'and', 'the', 'new', 'ml', 'gm', 'g', 'pcs', 'of']);
const GENERIC = new Set(['body', 'care', 'hair', 'skin', 'face', 'free', 'brand', 'product', 'roll', 'on']);
const BUNDLE = /\b(duo|pair|trio|kit|set|combo|bundle|pack)\b/i;
const TYPES = new Set(['wash', 'mist', 'serum', 'shampoo', 'conditioner', 'lotion', 'scrub', 'oil', 'cream', 'gel', 'toner', 'cleanser', 'sunscreen', 'deodorant', 'mask', 'balm']);

/** How people actually type these words in chats. Keys are whole words; values are spellings seen in orders. */
const KNOWN: Record<string, string[]> = {
  shampoo: ['shampo', 'sampoo', 'sampo', 'shampu', 'shempoo'],
  conditioner: ['condtioner', 'conditoner', 'conditner', 'condishner', 'kandisanar', 'condi', 'cond'],
  serum: ['seram', 'sirum', 'serm'],
  exfoliating: ['exfoliate', 'exfolating', 'exfolaiting', 'exfolieting', 'exfo', 'exfoliant'],
  deodorant: ['deo', 'deodrant', 'diodorant', 'deoderant'],
  underarm: ['under arm', 'underarms', 'under-arm'],
  rollon: ['roll on', 'roll-on', 'rolon', 'role on'],
  sunscreen: ['sun screen', 'sunscrean', 'sunscren', 'sunblock'],
  moisturizer: ['moisturiser', 'mosturizer', 'moisturizar', 'moisturiz'],
  facewash: ['face wash', 'fashwash', 'facwash'],
  bodywash: ['body wash', 'bodywas'],
  lotion: ['loshan', 'loation', 'losan'],
  fragrance: ['fragance', 'fragrence', 'fregrance'],
  rosemary: ['rosmary', 'rosemery', 'rosemari'],
  aqua: ['akua', 'acua', 'aq'],
  peach: ['pech', 'peech'],
  lipstick: ['lip stick', 'lipstik'],
  strips: ['strip', 'stripes'],
  growth: ['grouth', 'growt'],
  mist: ['misst'],
  scrub: ['scrab', 'skrub'],
  cleanser: ['clenser', 'cleansor'],
  toner: ['tonar'],
  oil: ['oyal', 'oill'],
};

/** Short forms staff write for long words. */
const SHORT: Record<string, string> = { exfoliating: 'exfo', deodorant: 'deo', conditioner: 'condi', moisturizer: 'moist' };

/**
 * Sound-alike spellings common in Nepali-English typing ("sampu" for shampoo, "kandisanar"). Small typos in
 * longer words are already forgiven by the extractor, so a variant is kept only when it is too different for that,
 * or when the word is short (short words must match exactly).
 */
const SWAPS: [RegExp, string][] = [[/sh/g, 's'], [/ph/g, 'f'], [/ck/g, 'k'], [/c(?=[aou])/g, 'k'], [/oo/g, 'u'], [/ee/g, 'i'], [/z/g, 's'], [/v/g, 'b'], [/w(?=[aeiou])/g, 'v'], [/(.)\1/g, '$1']];
function soundAlikes(word: string): string[] {
  const out = new Set<string>();
  const combined = SWAPS.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), word);
  if (combined !== word && combined.length >= 4 && editDistance(combined, word, 3) > allowedEdits(word.length)) out.add(combined);
  if (word.length <= 4) for (const [pattern, replacement] of SWAPS) { const next = word.replace(pattern, replacement); if (next !== word && next.length >= 3) out.add(next); }
  return [...out].filter((value) => !COMMON_WORDS.has(value));
}
/** Real words a variant must never become, or it would match ordinary chat text. */
const COMMON_WORDS = new Set(['was', 'wos', 'on', 'oil', 'set', 'kit', 'pack', 'sun', 'lip', 'rose', 'fair', 'here', 'have', 'the', 'and', 'for', 'with']);

const words = (value: string) => value.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/).filter(Boolean);
const isNumberish = (word: string) => /\d/.test(word);

/** Spellings for one word: the known list when there is one, otherwise sound-alikes. */
export function spellingVariants(word: string): string[] {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (clean.length < 3) return [];
  if (KNOWN[clean]) return KNOWN[clean];
  // Generic words spelt wrong ("bdy", "car") would match far too much.
  if (GENERIC.has(clean) || STOP.has(clean) || TYPES.has(clean)) return [];
  return soundAlikes(clean).slice(0, 3);
}

function add(set: Set<string>, value: string) {
  const clean = value.toLowerCase().replace(/\s+/g, ' ').trim();
  if (clean.length >= 2) set.add(clean);
}

/** The words of a name worth matching on: no brand, no pack size, no filler. */
function coreWords(name: string, brandName?: string): string[] {
  const brand = new Set(words(brandName || ''));
  return words(name).filter((word) => !brand.has(word) && !STOP.has(word) && !isNumberish(word));
}

export function suggestProductKeywords(name: string, brandName?: string): string[] {
  const out = new Set<string>();
  const clean = name.toLowerCase().trim();
  if (!clean) return [];
  const core = coreWords(name, brandName);
  add(out, clean);
  add(out, core.join(' '));
  const distinctive = core.filter((word) => word.length >= 4 && !GENERIC.has(word));
  for (const word of distinctive) if (!TYPES.has(word) || KNOWN[word]) add(out, word);
  // Joined and split forms of compound words: "body wash" ↔ "bodywash", "roll on" ↔ "rollon", "under arm".
  for (let i = 0; i < core.length - 1; i++) {
    const [first, second] = [core[i], core[i + 1]];
    const compound = !!KNOWN[first + second] || (GENERIC.has(first) && (GENERIC.has(second) || TYPES.has(second)));
    if (compound) { add(out, `${first} ${second}`); add(out, first + second); for (const variant of KNOWN[first + second] || []) add(out, variant); }
    else if (first.length >= 4 && second.length >= 4) add(out, `${first} ${second}`);
  }
  for (const word of core) if (KNOWN[word]?.some((variant) => variant.includes(' '))) for (const variant of KNOWN[word]) add(out, variant);
  // A shade or scent named last ("Roll On Aqua") is said first: "aqua roll on", "aqua rollon".
  const last = core[core.length - 1];
  const before: string[] = [];
  for (let i = core.length - 2; i >= 0 && GENERIC.has(core[i]); i--) before.unshift(core[i]);
  if (last && distinctive.includes(last) && !TYPES.has(last) && before.length) { add(out, `${last} ${before.join(' ')}`); add(out, `${last} ${before.join('')}`); }
  // Misspellings of each distinctive word, alone and, for short names, inside the name.
  for (const word of distinctive) {
    for (const variant of spellingVariants(word)) {
      if (!variant.includes(' ') && variant.length >= 3 && !COMMON_WORDS.has(variant)) add(out, variant);
      if (core.length <= 3) add(out, core.join(' ').replace(word, variant));
    }
  }
  // Short forms staff write: "exfo wash", "deo aqua", "condi".
  for (const word of core) { const short = SHORT[word]; if (short && last && last !== word) add(out, `${short} ${last}`); }
  return [...out].filter((value) => !GENERIC.has(value) && !STOP.has(value) && !COMMON_WORDS.has(value)).slice(0, 40);
}

/**
 * Combo phrases: the name, the name with the bundle word swapped ("hair care set" ↔ "hair care combo"),
 * the products it contains ("shampoo conditioner combo"), and misspellings of its distinctive words.
 * A plain product word alone is never suggested for a combo, so "shampoo" keeps meaning the shampoo.
 */
export function suggestComboKeywords(name: string, brandName?: string, components: string[] = []): string[] {
  const out = new Set<string>();
  const clean = name.toLowerCase().split(/[–—:]/, 1)[0].trim();
  if (!clean) return [];
  const core = coreWords(clean, brandName);
  add(out, name.toLowerCase().trim()); add(out, clean); add(out, core.join(' '));
  const bundle = clean.match(BUNDLE)?.[1]?.toLowerCase();
  const base = core.filter((word) => !BUNDLE.test(word)).join(' ');
  const types = ['combo', 'set', 'kit', 'pack', bundle].filter(Boolean) as string[];
  if (base) for (const type of new Set(types)) { add(out, `${base} ${type}`); add(out, `${base}${type}`); }
  if (base && (bundle === 'pair' || bundle === 'duo')) { add(out, `${base} duo`); add(out, `${base} pair`); }
  // What is inside: "shampoo + conditioner", "shampoo and conditioner", "shampoo conditioner combo".
  const short = components.map((component) => coreWords(component, brandName).filter((word) => !GENERIC.has(word) && word.length >= 3).slice(-1)[0]).filter(Boolean);
  // The extractor reads "shampoo + conditioner" as two products (and checks the combo price), so only phrases
  // that say "combo"/"set" select the combo.
  if (short.length >= 2) { add(out, `${short.join(' ')} combo`); add(out, `${short.join(' ')} set`); add(out, `${short.join(' & ')} combo`); }
  for (const word of core.filter((value) => value.length >= 5 && !GENERIC.has(value) && !BUNDLE.test(value))) {
    for (const variant of spellingVariants(word).slice(0, 3)) if (bundle) add(out, `${base.replace(word, variant)} ${bundle}`);
  }
  // Every phrase must still say it is a bundle, so a product word alone never selects the combo.
  return [...out].filter((value) => BUNDLE.test(value) || value === name.toLowerCase().trim()).slice(0, 30);
}
