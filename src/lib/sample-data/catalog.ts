/**
 * Test brands and products. Renee and Pee Safe come in as test brands (Pee Safe with its sub-brands
 * FURR, Comfort and Domina) unless the workspace already has a real brand with that code. Every
 * product carries a short name (alias), so field forms can be checked against the full names that
 * reports and documents use. Ids start with `sample_`, so removing test data removes all of it.
 */
import { subBrandIdFor } from '../sub-brands';
import type { Product } from '../types';

export interface SampleBrand {
  id: string; code: string; name: string; color: string; category: string; description: string;
  principalCompany: string; subBrands: { id: string; name: string; isActive: true }[];
}

const sub = (code: string, name: string) => ({ id: subBrandIdFor(code, name), name, isActive: true as const });

export const SAMPLE_BRANDS: SampleBrand[] = [
  { id: 'sample_brand_renee', code: 'RENEE', name: 'Renee', color: '#d9559b', category: 'Cosmetics', principalCompany: 'Renee Cosmetics',
    description: 'Test brand: colour cosmetics and fragrance.', subBrands: [] },
  { id: 'sample_brand_peesafe', code: 'PEESAFE', name: 'Pee Safe', color: '#12a5b4', category: 'Hygiene', principalCompany: 'Redcliffe Hygiene',
    description: 'Test brand: hygiene, with FURR, Comfort and Domina sub-brands.',
    subBrands: [sub('PEESAFE', 'FURR'), sub('PEESAFE', 'Comfort'), sub('PEESAFE', 'Domina')] },
];

type Item = { key: string; brand: string; sub?: string; name: string; alias: string; category: string; mrp: number; caseSize: number; words: string[] };

const ITEMS: Item[] = [
  { key: 'forya_vitc', brand: 'FORYA', name: 'Forya Vitamin C Brightening Face Wash 100ml', alias: 'Vit C wash', category: 'Face Care', mrp: 549, caseSize: 48, words: ['vitamin c', 'vit c', 'face wash'] },
  { key: 'renee_fab5', brand: 'RENEE', name: 'Renee Fab 5 5-in-1 Lipstick', alias: 'Fab 5', category: 'Lips', mrp: 799, caseSize: 60, words: ['fab 5', 'fab5', '5 in 1 lipstick'] },
  { key: 'renee_stay', brand: 'RENEE', name: 'Renee Stay With Me Matte Lip Colour', alias: 'Stay With Me', category: 'Lips', mrp: 499, caseSize: 72, words: ['stay with me', 'matte lip'] },
  { key: 'renee_kajal', brand: 'RENEE', name: 'Renee Kohl Kajal Black 0.35g', alias: 'Kajal', category: 'Eyes', mrp: 299, caseSize: 96, words: ['kajal', 'kohl'] },
  { key: 'renee_base', brand: 'RENEE', name: 'Renee Face Base Liquid Foundation 30ml', alias: 'Face Base', category: 'Face', mrp: 899, caseSize: 48, words: ['face base', 'foundation'] },
  { key: 'renee_bloom', brand: 'RENEE', name: 'Renee Bloom Eau de Parfum 50ml', alias: 'Bloom perfume', category: 'Fragrance', mrp: 1199, caseSize: 24, words: ['bloom', 'perfume'] },
  { key: 'ps_seat', brand: 'PEESAFE', name: 'Pee Safe Toilet Seat Sanitizer Spray 75ml', alias: 'Seat spray', category: 'Hygiene', mrp: 349, caseSize: 72, words: ['seat spray', 'toilet seat', 'sanitizer'] },
  { key: 'ps_pads', brand: 'PEESAFE', sub: 'Comfort', name: 'Comfort Ultra Thin Organic Cotton Pads XL (7 pads)', alias: 'Pads XL', category: 'Period Care', mrp: 299, caseSize: 48, words: ['pads xl', 'cotton pads', 'sanitary pads'] },
  { key: 'ps_liners', brand: 'PEESAFE', sub: 'Comfort', name: 'Comfort Panty Liners (30 liners)', alias: 'Liners', category: 'Period Care', mrp: 249, caseSize: 48, words: ['liners', 'panty liners'] },
  { key: 'ps_furr_serum', brand: 'PEESAFE', sub: 'FURR', name: 'FURR Ingrown Hair & Bump Serum 30ml', alias: 'Ingrown serum', category: 'Grooming', mrp: 549, caseSize: 48, words: ['ingrown', 'bump serum'] },
  { key: 'ps_furr_cream', brand: 'PEESAFE', sub: 'FURR', name: 'FURR Intimate Hair Removal Cream 50g', alias: 'Hair removal cream', category: 'Grooming', mrp: 399, caseSize: 48, words: ['hair removal', 'removal cream'] },
  { key: 'ps_domina_condom', brand: 'PEESAFE', sub: 'Domina', name: 'Domina Ultra Thin Condoms (10 pack)', alias: 'Condoms 10', category: 'Sexual Wellness', mrp: 299, caseSize: 96, words: ['condom', 'condoms'] },
  { key: 'ps_domina_gel', brand: 'PEESAFE', sub: 'Domina', name: 'Domina Aloe Vera Personal Lubricant 50ml', alias: 'Aloe gel', category: 'Sexual Wellness', mrp: 449, caseSize: 48, words: ['lubricant', 'aloe gel'] },
];

/**
 * Test products for the brands that need them. A test brand gets its whole range; a real brand
 * (Forya today) keeps its real products and gains one test product with a short name.
 */
export function sampleProducts(brandIdFor: (code: string) => string | undefined): Product[] {
  return ITEMS.filter((item) => brandIdFor(item.brand)).map((item) => ({
    id: `sample_prod_${item.key}`, brandId: brandIdFor(item.brand)!, brandCode: item.brand,
    sku: `T-${item.brand.slice(0, 3)}-${item.key.split('_').pop()!.toUpperCase().slice(0, 6)}`,
    name: item.name, alias: item.alias, subBrandId: item.sub ? subBrandIdFor(item.brand, item.sub) : undefined, category: item.category,
    unitPrice: item.mrp, mrp: item.mrp, dtpPrice: Math.round(item.mrp * 0.62), wholesalePrice: Math.round(item.mrp * 0.78), costPrice: Math.round(item.mrp * 0.45),
    caseSize: item.caseSize, thresholdQty: 40, keywords: item.words, extractorKeywords: item.words, active: true, stockQty: 300 + item.mrp % 400, orderUnitMode: 'BOTH',
  }));
}
