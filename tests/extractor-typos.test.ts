import test from 'node:test';
import assert from 'node:assert/strict';
import { extractSingleOrder } from '../src/lib/whatsapp-extractor';
import { findPhrase, wordsMatch } from '../src/lib/fuzzy-match';
import { suggestComboKeywords, suggestProductKeywords } from '../src/lib/keyword-suggest';
import type { Brand, Combo, Product } from '../src/lib/types';

const product = (id: string, name: string, mrp: number): Product => ({ id, name, mrp, brandId: 'b', brandCode: 'BRAND', sku: `SKU-${id}`, category: 'Care', unitPrice: mrp, thresholdQty: 0, keywords: [], active: true });
const wash = product('wash', 'Exfoliating Body Wash', 719);
const shampoo = product('shampoo', 'Rosemary Shampoo 200ml', 799);
const conditioner = product('conditioner', 'Rosemary Conditioner 200ml', 799);
const serum = product('serum', 'Hair Growth Serum 30ml', 1119);
const aqua = product('aqua', 'Underarm Deodorant Roll On Aqua 40ml', 399);
const peach = product('peach', 'Underarm Deodorant Roll On Peach 40ml', 399);
const kit: Combo = { id: 'kit', brandCode: 'BRAND', name: 'Rosemary Hairfall Kit', sku: 'KIT-1', description: '', items: [{ productId: 'shampoo', productName: shampoo.name, quantity: 1, mrp: 799 }, { productId: 'conditioner', productName: conditioner.name, quantity: 1, mrp: 799 }, { productId: 'serum', productName: serum.name, quantity: 1, mrp: 1119 }], componentProductIds: ['shampoo', 'conditioner', 'serum'], totalOriginalMrp: 2717, comboPrice: 2499, comboMrp: 2499, savingsPct: 8, extractorKeywords: [], priceDetectionEnabled: true, active: true, createdAt: '2026-01-01' };
const brand = { id: 'b', code: 'BRAND', name: 'Forya', isActive: true, status: 'ACTIVE', color: '#000' } as Brand;
const channels = ['Instagram', 'WhatsApp', 'TikTok', 'Messenger', 'Website', 'Facebook'];
const options = { products: [wash, shampoo, conditioner, serum, aqua, peach], combos: [kit], brands: [brand], channels, deliveryMethods: ['Pathao', 'InDrive'] };
const order = (extra: string) => extractSingleOrder(`Prashna khatri\n9763350725\nSaraswati swastya clinic(tikathali)\nOutside ringroad\n\nshampoo\n2 units\n${extra}`, options);

test('a misspelt channel is read as that channel, never silently as Instagram', () => {
  for (const [typed, expected] of [['whatapp', 'WhatsApp'], ['Whatsap', 'WhatsApp'], ['watsapp', 'WhatsApp'], ['whats app', 'WhatsApp'], ['WhtsApp', 'WhatsApp'],
    ['tiktk', 'TikTok'], ['Tik tok', 'TikTok'], ['tictok', 'TikTok'], ['insta', 'Instagram'], ['Instagarm', 'Instagram'], ['messanger', 'Messenger'], ['mesenger', 'Messenger'],
    ['Facebok', 'Facebook'], ['webiste', 'Website']] as const) {
    const result = order(typed);
    assert.equal(result.salesChannel, expected, typed);
    assert.ok(!/instagram/i.test(result.address.value) && !result.address.value.toLowerCase().includes(typed.toLowerCase()), `${typed} is not part of the address`);
  }
  assert.ok(order('Whatsap').flags.some((flag) => flag === 'Read “Whatsap” as WhatsApp. Check the sales channel.'), 'an unlisted typo is noted for checking');
  assert.ok(!order('WhatsApp').flags.some((flag) => flag.startsWith('Read “')), 'a correct spelling needs no note');
  assert.equal(order('').salesChannel, 'Instagram', 'nothing written still means Instagram');
});

test('place names and ordinary words are not mistaken for a channel or courier', () => {
  assert.equal(order('').salesChannel, 'Instagram', 'Tikathali is not TikTok');
  const typoCourier = order('patao');
  assert.equal(typoCourier.deliveryMethod.value, 'Pathao');
  assert.equal(order('').deliveryMethod.value, '');
  assert.equal(extractSingleOrder('Name: Webster Rai\nPhone: 9800000000\nAddress: Baneshwor\nshampoo', options).salesChannel, 'Instagram');
});

test('misspelt products are found and noted for checking', () => {
  const cases: [string, string][] = [['exfolaiting body wash', 'wash'], ['exfoliting bodywash', 'wash'], ['condtioner', 'conditioner'], ['shampooo', 'shampoo'], ['rosmary shampoo', 'shampoo'], ['hair groth serum', 'serum'], ['peach rolon', 'peach'], ['rosemary hairfal kit', 'kit']];
  for (const [typed, id] of cases) {
    const result = extractSingleOrder(`Name: Asha\nPhone: 9800000000\nAddress: Baneshwor\n${typed}\n2 units`, options);
    assert.deepEqual(result.products.map((item) => [item.productId, item.quantity]), [[id, 2]], typed);
  }
  const noted = extractSingleOrder('Name: Asha\nPhone: 9800000000\nAddress: Baneshwor\nconditoner 2 pcs', options);
  assert.deepEqual(noted.products.map((item) => [item.productId, item.quantity]), [['conditioner', 2]]);
  assert.ok(noted.flags.some((flag) => flag.startsWith('Read “conditoner” as Rosemary Conditioner')), noted.flags.join(' | '));
});

test('typo matching stays strict: no guessing between two products, no matching real words or short words', () => {
  assert.equal(wordsMatch('condition', 'conditioner'), false);
  assert.equal(wordsMatch('beach', 'peach'), false);
  assert.equal(wordsMatch('aque', 'aqua'), false, 'four letters or fewer must be exact');
  assert.equal(findPhrase('conditioner 2', 'conditioner')?.matched, 'conditioner', 'the quantity is never glued to the word');
  const note = extractSingleOrder('Name: Asha\nPhone: 9800000000\nAddress: Baneshwor\nThe parcel arrived in good condition\nshampoo', options);
  assert.deepEqual(note.products.map((item) => item.productId), ['shampoo']);
  // "rol on" alone fits both Aqua and Peach: it is flagged, not guessed.
  const both = extractSingleOrder('Name: Asha\nPhone: 9800000000\nAddress: Baneshwor\nunderarm deodorant rol on', options);
  assert.ok(!both.products.some((item) => item.productId === 'aqua' || item.productId === 'peach') || both.flags.some((flag) => flag.includes('multiple catalogue items')));
});

test('auto-suggested phrases include misspellings, joined words and the everyday name, without junk', () => {
  const washWords = suggestProductKeywords('Forya Exfoliating Body Wash 250ml', 'Forya');
  for (const expected of ['exfoliating body wash', 'bodywash', 'exfolaiting', 'exfo wash', 'exfo']) assert.ok(washWords.includes(expected), expected);
  for (const junk of ['was', 'body', 'wash', 'forya', '250ml']) assert.ok(!washWords.includes(junk), junk);
  const aquaWords = suggestProductKeywords('Underarm Deodorant Roll On Aqua 40ml', 'Forya');
  for (const expected of ['aqua roll on', 'aqua rollon', 'rollon', 'akua', 'deo aqua', 'deodrant']) assert.ok(aquaWords.includes(expected), expected);
  const shampooWords = suggestProductKeywords('Rosemary Shampoo 200ml');
  for (const expected of ['sampoo', 'shampu', 'rosmary shampoo']) assert.ok(shampooWords.includes(expected), expected);
  const combo = suggestComboKeywords('Rosemary Hairfall Kit', 'Forya', [shampoo.name, conditioner.name, serum.name]);
  for (const expected of ['rosemary hairfall kit', 'rosemary hairfall combo', 'shampoo conditioner serum combo', 'rosmary hairfall kit']) assert.ok(combo.includes(expected), expected);
  assert.ok(combo.every((phrase) => /\b(?:kit|combo|set|pack|duo|pair|trio|bundle)\b/.test(phrase)), 'every combo phrase says it is a bundle');
  // Suggested phrases work in the extractor.
  const withPhrases = { ...options, products: options.products.map((item) => item.id === 'shampoo' ? { ...item, extractorKeywords: shampooWords } : item) };
  assert.equal(extractSingleOrder('Name: Asha\nPhone: 9800000000\nAddress: Baneshwor\nsampu 1', withPhrases).products[0]?.productId, 'shampoo', 'one slip away from a suggested spelling');
  const condWords = suggestProductKeywords(conditioner.name);
  assert.equal(extractSingleOrder('Name: Asha\nPhone: 9800000000\nAddress: Baneshwor\nkandisanar 1', options).products.length, 0, 'too far to guess on its own');
  assert.equal(extractSingleOrder('Name: Asha\nPhone: 9800000000\nAddress: Baneshwor\nkandisanar 1', { ...options, products: options.products.map((item) => item.id === 'conditioner' ? { ...item, extractorKeywords: condWords } : item) }).products[0]?.productId, 'conditioner', 'found once the suggested phrases are saved');
  assert.equal(extractSingleOrder('Name: Asha\nPhone: 9800000000\nAddress: Baneshwor\nsampoo 1', withPhrases).products[0]?.productId, 'shampoo');
});
