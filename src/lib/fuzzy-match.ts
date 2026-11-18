/**
 * Typo-tolerant matching for WhatsApp messages: "whatapp" is WhatsApp, "exfolaiting" is Exfoliating,
 * "condtioner" is Conditioner. Kept strict on purpose: short words must match exactly, longer words may
 * differ by one or two keystrokes (a missing, extra, wrong or swapped letter), never more.
 */

export const normalizeWord = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, '');

/** Optimal string alignment distance (insert, delete, substitute, swap neighbours), stopping early past `limit`. */
export function editDistance(a: string, b: string, limit = 3): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  const rows: number[][] = [];
  for (let i = 0; i <= a.length; i++) rows.push([i]);
  for (let j = 1; j <= b.length; j++) rows[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let best = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, rows[i - 2][j - 2] + 1);
      rows[i][j] = value; if (value < best) best = value;
    }
    if (best > limit) return limit + 1;
  }
  return rows[a.length][b.length];
}

/** How many slips a word of this length may have: none up to 4 letters, one up to 7, two from 8. */
export function allowedEdits(length: number): number {
  return length <= 4 ? 0 : length <= 7 ? 1 : 2;
}

/** Repeated letters collapsed: "shampooo" and "shampo" both read "shampo". */
const squeeze = (value: string) => value.replace(/(.)\1+/g, '$1');

export function wordsMatch(typed: string, wanted: string): boolean {
  const a = normalizeWord(typed), b = normalizeWord(wanted);
  if (!a || !b) return false;
  if (a === b || squeeze(a) === squeeze(b)) return true;
  // Both words must share the first letter: "seram" can be serum, "beach" is never peach.
  if (a[0] !== b[0]) return false;
  // A real word cut short is not a typo: "condition" is not "conditioner".
  if ((b.startsWith(a) && b.length - a.length >= 2) || (a.startsWith(b) && a.length - b.length >= 2)) return false;
  const edits = allowedEdits(Math.min(a.length, b.length));
  return edits > 0 && editDistance(a, b, edits) <= edits;
}

export interface Token { text: string; start: number; end: number }
export function tokens(line: string): Token[] {
  return [...line.matchAll(/[\p{L}\p{N}]+/gu)].map((match) => ({ text: match[0], start: match.index!, end: match.index! + match[0].length }));
}

/**
 * Find a phrase in a line allowing typos, and allowing its words to be joined or split
 * ("body wash" = "bodywash", "tik tok" = "tiktok"). Returns the matched span, or null.
 * `exact` is true when the line has the phrase letter for letter, so callers can tell a typo apart.
 */
export function findPhrase(line: string, phrase: string): { start: number; end: number; matched: string; exact: boolean } | null {
  const want = tokens(phrase).map((token) => token.text);
  if (!want.length) return null;
  const joined = want.join('');
  // A one-word phrase of four letters or less can only match exactly; otherwise "aqua" would match "aque".
  if (want.length === 1 && normalizeWord(joined).length <= 4) {
    const found = tokens(line).find((token) => normalizeWord(token.text) === normalizeWord(joined));
    return found ? { start: found.start, end: found.end, matched: found.text, exact: true } : null;
  }
  const have = tokens(line);
  // Every match starts with the phrase's first letter (typos keep the first letter), so most lines are skipped here.
  const lead = normalizeWord(want[0])[0];
  if (!have.some((token) => normalizeWord(token.text)[0] === lead)) return null;
  let best: { start: number; end: number; matched: string; exact: boolean } | null = null;
  for (let i = 0; i < have.length; i++) {
    // Same number of words, word by word; or the typed words glued together compared with the phrase glued together.
    if (normalizeWord(have[i].text)[0] !== lead) continue;
    for (const width of new Set([want.length, 1, 2, 3].filter((value) => value <= have.length - i))) {
      const window = have.slice(i, i + width);
      const typed = window.map((token) => token.text);
      // Quantities and sizes are never part of a misspelt word: "conditioner 2" is conditioner, two of them.
      if (width !== want.length && typed.some((word) => /\d/.test(word))) continue;
      if (width === want.length && typed.some((word, index) => /\d/.test(word) !== /\d/.test(want[index]))) continue;
      const ok = width === want.length
        ? typed.every((word, index) => normalizeWord(want[index]).length <= 3 ? normalizeWord(word) === normalizeWord(want[index]) : wordsMatch(word, want[index]))
        : wordsMatch(typed.join(''), joined) && normalizeWord(typed.join('')).length >= 5;
      if (!ok) continue;
      const span = { start: window[0].start, end: window[width - 1].end };
      const matched = line.slice(span.start, span.end);
      const exact = normalizeWord(matched) === normalizeWord(joined) && width === want.length;
      if (!best || span.end - span.start > best.end - best.start) best = { ...span, matched, exact };
    }
  }
  return best;
}

/**
 * The option (channel, courier) a message names, typos allowed. Longer names are tried first, and a name only
 * counts when exactly one option fits, so an unclear word is left for staff to choose.
 */
export function findOption(lines: string[], options: { name: string; aliases?: string[] }[]): { name: string; matched: string; exact: boolean } | null {
  const exact: { name: string; matched: string }[] = [], typo: { name: string; matched: string }[] = [];
  for (const option of options) {
    let best: { matched: string; exact: boolean } | null = null;
    for (const phrase of [option.name, ...(option.aliases || [])]) for (const line of lines) {
      const found = findPhrase(line, phrase);
      if (found && (!best || (found.exact && !best.exact))) best = found;
    }
    if (best) (best.exact ? exact : typo).push({ name: option.name, matched: best.matched });
  }
  // Written correctly wins (the longest name, so "Facebook Messenger" beats "Facebook"). A typo counts only when
  // it can mean one option; otherwise staff choose.
  if (exact.length) { const pick = exact.sort((a, b) => b.name.length - a.name.length)[0]; return { ...pick, exact: true }; }
  return typo.length === 1 ? { ...typo[0], exact: false } : null;
}

/** Everyday short names and misspellings staff use for channels and couriers. */
export const OPTION_ALIASES: Record<string, string[]> = {
  whatsapp: ['whats app', 'watsapp', 'whatapp', 'wats app', 'wapp'],
  tiktok: ['tik tok', 'tiktk', 'tictok', 'tick tock'],
  instagram: ['insta', 'ig', 'instagarm', 'instgram'],
  messenger: ['msngr', 'mesenger', 'fb messenger', 'messanger'],
  facebook: ['fb', 'face book', 'facebok'],
  website: ['web site', 'webiste'],
  pathao: ['patao', 'pathau', 'pathaw'],
  indrive: ['in drive', 'indriver', 'in driver'],
};
export function optionAliases(name: string): string[] {
  return OPTION_ALIASES[normalizeWord(name)] || [];
}
