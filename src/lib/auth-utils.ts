export function normalizePhoneNumber(input: string): string {
  if (!input) return '';
  let clean = input.replace(/[\s\-()\.]/g, '');
  if (clean.startsWith('+977')) clean = clean.slice(4);
  else if (clean.startsWith('977')) clean = clean.slice(3);
  if (clean.startsWith('0')) clean = clean.slice(1);
  return clean;
}
