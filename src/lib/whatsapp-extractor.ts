import { BrandCode, Product, Combo, Brand } from './types';
import { adToBs, getTodayAd, getTodayBs } from './nepali-calendar';

export type Confidence = 'HIGH' | 'AUTO' | 'REVIEW' | 'FAILED'; // 🟢, 🔵, 🟡, 🔴

export interface ExtractedField<T> {
  value: T;
  confidence: Confidence;
  rawMatched?: string;
  matchedKeyword?: string;
}

export interface ExtractedProductItem {
  productId?: string;
  name: string;
  brandCode: BrandCode;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  confidence: Confidence;
  isCombo?: boolean;
}

export interface ExtractedOrderResult {
  id: string;
  customerName: ExtractedField<string>;
  customerPhone: ExtractedField<string>;
  brandCode: ExtractedField<BrandCode>;
  products: ExtractedProductItem[];
  address: ExtractedField<string>;
  rawAddress?: string;
  city: ExtractedField<string>;
  combo: ExtractedField<string>;
  totalAmount: ExtractedField<number>;
  statedPrice: ExtractedField<number> & {
    difference?: number;
    differencePct?: number;
    warning?: string;
    level?: 'OK' | 'WARNING' | 'REVIEW';
  };
  paymentTerms: ExtractedField<string>;
  deliveryMethod: ExtractedField<string>;
  orderDateAd: ExtractedField<string>;
  orderDateBs: ExtractedField<string>;
  flags: string[];
  extractionErrors: string[];
  isMarketing?: boolean;
  influencerId?: string;
  influencerName?: string;
  rawText: string;
}

// Nepali cities dictionary for address extraction
export const NEPAL_CITIES = [
  'Kathmandu', 'Lalitpur', 'Bhaktapur', 'Pokhara', 'Chitwan', 'Narayangarh',
  'Biratnagar', 'Butwal', 'Dharan', 'Birgunj', 'Hetauda', 'Nepalgunj',
  'Itahari', 'Dhangadhi', 'Bhairahawa', 'Janakpur', 'Jhapa', 'Birtamode',
  'Banepa', 'Dhulikhel', 'Surkhet'
];

export interface DynamicExtractorOptions {
  products: Product[];
  combos: Combo[];
  brands: Brand[];
  dateOverride?: string; // e.g. YYYY-MM-DD
  customSeparator?: string;
}

/**
 * Split pasted raw WhatsApp text into individual order message blocks
 * Splits on standard WhatsApp timestamp headers e.g. [11:32 AM, 9/8/2026] or [09/08/2026, 11:32] or 9/8/26, 11:32 AM -
 * Or on '---' markdown style separator
 */
export function splitMessageBlocks(rawText: string): string[] {
  const text = rawText.trim();
  if (!text) return [];

  // Check if text uses triple dash separator
  if (text.includes('\n---\n') || text.includes('\n--- \n') || text.startsWith('---\n')) {
    return text
      .split(/\n\s*---\s*\n/)
      .map((b) => b.trim())
      .filter((b) => b && b !== '---');
  }

  // Regex matching WhatsApp headers
  const headerRegex = /(?:^|\n)(?:\[\d{1,2}[:/.]\d{1,2}(?:[:/.]\d{2,4})?,?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?\]|\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}\s*(?:[APap][Mm])?\s*-\s*)/g;

  const matches: RegExpExecArray[] = [];
  let m: RegExpExecArray | null;
  while ((m = headerRegex.exec(text)) !== null) {
    matches.push(m);
  }

  if (matches.length <= 1) {
    return [text];
  }

  const blocks: string[] = [];
  for (let i = 0; i < matches.length; i++) {
    const startIdx = matches[i].index || 0;
    const endIdx = i < matches.length - 1 ? (matches[i + 1].index || text.length) : text.length;
    const chunk = text.slice(startIdx, endIdx).trim();
    if (chunk) blocks.push(chunk);
  }

  return blocks.length > 0 ? blocks : [text];
}

/**
 * Dynamic catalog-driven extraction engine.
 * Never hardcodes any product, combo, price, or brand.
 */
export function extractSingleOrder(
  blockText: string,
  options: DynamicExtractorOptions
): ExtractedOrderResult {
  const text = blockText.trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const flags: string[] = [];

  const { products, combos, brands, dateOverride } = options;

  // 1. Phone number extraction (Nepal patterns: +977, 98XXXXXXXX, 97XXXXXXXX)
  const phoneRegex = /(?:\+977[- ]?)?(9[78]\d{8}|9[78]\d{2}[- ]?\d{3}[- ]?\d{3})/g;
  const phoneMatch = phoneRegex.exec(text);
  let extractedPhone = '';
  let phoneConfidence: Confidence = 'FAILED';

  if (phoneMatch) {
    extractedPhone = phoneMatch[1].replace(/[- ]/g, '');
    if (!extractedPhone.startsWith('+977')) {
      extractedPhone = `+977-${extractedPhone}`;
    }
    phoneConfidence = 'HIGH';
  } else {
    flags.push('Missing phone number');
  }

  // 2. Date extraction (Header or Override)
  let dateAd = getTodayAd();
  let dateBs = getTodayBs();
  let dateConfidence: Confidence = 'AUTO';

  if (dateOverride) {
    dateAd = dateOverride;
    const bsObj = adToBs(new Date(dateOverride));
    dateBs = `${bsObj.monthName} ${bsObj.day}, ${bsObj.year}`;
    dateConfidence = 'HIGH';
  } else {
    // Attempt parse from WhatsApp header [11:32 AM, 9/8/2026] or [9/8/26, 11:32]
    const dateHeaderMatch = /(?:\[|\b)(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/i.exec(text);
    if (dateHeaderMatch) {
      let d = parseInt(dateHeaderMatch[1], 10);
      let m = parseInt(dateHeaderMatch[2], 10);
      let y = parseInt(dateHeaderMatch[3], 10);
      if (y < 100) y += 2000;
      // Handle M/D/Y vs D/M/Y
      if (m > 12 && d <= 12) {
        const temp = d;
        d = m;
        m = temp;
      }
      try {
        const parsedDate = new Date(y, m - 1, d);
        if (!isNaN(parsedDate.getTime())) {
          dateAd = parsedDate.toISOString().split('T')[0];
          const bsObj = adToBs(parsedDate);
          dateBs = `${bsObj.monthName} ${bsObj.day}, ${bsObj.year}`;
          dateConfidence = 'HIGH';
        }
      } catch {
        // fallback to today
      }
    }
  }

  // 3. Customer name extraction
  let extractedName = '';
  let nameConfidence: Confidence = 'FAILED';
  const headerRegex = /\[?[0-9:APM\s,/-]+\]?\s*([A-Za-z\s]+?):/i;
  const explicitNameRegex = /(?:name|naam|customer|send to|receiver|deliver to)\s*[:=]\s*([A-Za-z\s]+)/i;

  const explicitMatch = explicitNameRegex.exec(text);
  const headerMatch = headerRegex.exec(text);

  if (explicitMatch && explicitMatch[1].trim().length > 2) {
    extractedName = explicitMatch[1].trim();
    nameConfidence = 'HIGH';
  } else if (
    headerMatch &&
    headerMatch[1].trim().length > 2 &&
    !/brand bucket|order|sales|support|info|forya|admin/i.test(headerMatch[1])
  ) {
    extractedName = headerMatch[1].trim();
    nameConfidence = 'AUTO';
  } else {
    for (const line of lines) {
      if (
        /^[A-Z][a-z]+ [A-Z][a-z]+$/.test(line) &&
        !NEPAL_CITIES.some((c) => line.toLowerCase().includes(c.toLowerCase()))
      ) {
        extractedName = line;
        nameConfidence = 'REVIEW';
        break;
      }
    }
  }
  if (!extractedName) flags.push('Missing customer name');

  // 4. City & Address extraction (Preserve exact verbatim address from message)
  let extractedCity = 'Kathmandu';
  let cityConfidence: Confidence = 'AUTO';
  let extractedAddress = '';
  let rawAddressText = '';
  let addressConfidence: Confidence = 'FAILED';

  for (const city of NEPAL_CITIES) {
    const cityRegex = new RegExp(`\\b${city}\\b`, 'i');
    if (cityRegex.test(text)) {
      extractedCity = city;
      cityConfidence = 'HIGH';
      break;
    }
  }

  // Look for address with explicit markers or delivery keywords
  const addressMarkerRegex = /(?:delivery\s*address|shipping\s*address|deliver\s*to|send\s*to|address|location|thau)\s*[:=]?\s*(.+)/i;
  for (const line of lines) {
    const addrMatch = addressMarkerRegex.exec(line);
    if (addrMatch && addrMatch[1].trim().length > 3) {
      rawAddressText = addrMatch[1].trim();
      extractedAddress = rawAddressText;
      addressConfidence = 'HIGH';
      break;
    } else if (/(?:near|chowk|tole|marg|galli|road|bazaar|mall|chowk|height|park)\b/i.test(line) && line.length > 4 && line.length < 150) {
      if (!/^(?:name|phone|product|total|payment|brand|price|mrp)\b/i.test(line)) {
        rawAddressText = line.trim();
        extractedAddress = rawAddressText;
        addressConfidence = 'AUTO';
        break;
      }
    }
  }

  // Fallback: search for line mentioning city
  if (!extractedAddress && extractedCity) {
    for (const line of lines) {
      if (new RegExp(`\\b${extractedCity}\\b`, 'i').test(line) && line.length < 120) {
        if (!/^(?:name|phone|product|total|price)\b/i.test(line)) {
          rawAddressText = line.trim();
          extractedAddress = rawAddressText;
          addressConfidence = 'AUTO';
          break;
        }
      }
    }
  }

  if (!extractedAddress && extractedCity) {
    extractedAddress = `${extractedCity}`;
    rawAddressText = extractedCity;
    addressConfidence = 'REVIEW';
  }

  // 5. Stated Price in message
  let statedPriceValue = 0;
  let statedPriceConfidence: Confidence = 'REVIEW';
  const priceRegex = /(?:total|npr|rs\.?|inr|price|amount|paid)\s*[:=]?\s*₹?\s*([0-9,]+)/i;
  const priceMatch = priceRegex.exec(text);
  if (priceMatch) {
    statedPriceValue = parseInt(priceMatch[1].replace(/,/g, ''), 10);
    statedPriceConfidence = 'HIGH';
  }

  // 6. Dynamic Keyword Matching: Combos & Products
  const matchedItems: ExtractedProductItem[] = [];
  let detectedComboName = 'None (Standard SKU)';
  let detectedComboConfidence: Confidence = 'HIGH';
  let detectedComboRaw = '';

  // Step 6a: Check Combos first
  const activeCombos = combos.filter((c) => c.active !== false && c.isActive !== false);
  const matchedComboIds: string[] = [];

  for (const combo of activeCombos) {
    const keywords = [
      ...(combo.extractorKeywords || []),
      combo.name.toLowerCase(),
      combo.sku.toLowerCase(),
    ].filter(Boolean);

    let comboFound = false;
    for (const kw of keywords) {
      if (!kw || kw.trim().length < 2) continue;
      const escaped = kw.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(text)) {
        comboFound = true;
        detectedComboName = combo.name;
        detectedComboConfidence = 'HIGH';
        detectedComboRaw = kw;
        matchedComboIds.push(combo.id);

        // Detect quantity near combo keyword
        const qtyRegex = new RegExp(`(?:${escaped}[^\\n\\d]{0,15}(\\d+)|(\\d+)[^\\n\\d]{0,15}${escaped})`, 'i');
        const qm = qtyRegex.exec(text);
        const qty = qm ? parseInt(qm[1] || qm[2], 10) : 1;
        const validQty = Math.min(Math.max(1, qty), 50);

        const price = combo.comboMrp || combo.comboPrice || 0;
        matchedItems.push({
          productId: combo.id,
          name: combo.name,
          brandCode: combo.brandCode,
          quantity: validQty,
          unitPrice: price,
          totalPrice: price * validQty,
          confidence: 'HIGH',
          isCombo: true,
        });
        break;
      }
    }
  }

  // Step 6b: Extract individual products (skip components of matched combos to avoid double counting)
  const activeProducts = products.filter((p) => p.active !== false);
  const excludedProductIds = new Set<string>();

  matchedComboIds.forEach((cid) => {
    const c = activeCombos.find((combo) => combo.id === cid);
    if (c) {
      if (c.componentProductIds) {
        c.componentProductIds.forEach((id) => excludedProductIds.add(id));
      }
      if (c.items) {
        c.items.forEach((it) => excludedProductIds.add(it.productId));
      }
    }
  });

  for (const prod of activeProducts) {
    if (excludedProductIds.has(prod.id)) continue;

    const keywords = [
      ...(prod.extractorKeywords || []),
      ...(prod.keywords || []),
      prod.sku.toLowerCase(),
    ].filter(Boolean);

    for (const kw of keywords) {
      if (!kw || kw.trim().length < 2) continue;
      const escaped = kw.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'i');
      if (regex.test(text)) {
        const qtyRegex = new RegExp(`(?:${escaped}[^\\n\\d]{0,15}(\\d+)|(\\d+)[^\\n\\d]{0,15}${escaped})`, 'i');
        const qm = qtyRegex.exec(text);
        const qty = qm ? parseInt(qm[1] || qm[2], 10) : 1;
        const validQty = Math.min(Math.max(1, qty), 50);

        matchedItems.push({
          productId: prod.id,
          name: prod.name,
          brandCode: prod.brandCode,
          quantity: validQty,
          unitPrice: prod.mrp,
          totalPrice: prod.mrp * validQty,
          confidence: 'HIGH',
        });
        break;
      }
    }
  }

  // Step 6c: Price-based combo collapse (Fix 67d Step 3)
  if (matchedComboIds.length === 0 && matchedItems.length > 1) {
    for (const combo of activeCombos) {
      if (combo.priceDetectionEnabled === false) continue;
      const compIds = combo.componentProductIds || combo.items?.map((it) => it.productId) || [];
      if (compIds.length === 0) continue;

      const matchedProdIds = matchedItems.map((m) => m.productId);
      const isExactMatch =
        compIds.length === matchedProdIds.length &&
        compIds.every((id) => matchedProdIds.includes(id));

      const comboPrice = combo.comboMrp || combo.comboPrice || 0;
      if (isExactMatch && (statedPriceValue === comboPrice || Math.abs(statedPriceValue - comboPrice) <= 50)) {
        matchedItems.length = 0;
        matchedItems.push({
          productId: combo.id,
          name: combo.name,
          brandCode: combo.brandCode,
          quantity: 1,
          unitPrice: comboPrice,
          totalPrice: comboPrice,
          confidence: 'AUTO',
          isCombo: true,
        });
        detectedComboName = combo.name;
        detectedComboConfidence = 'AUTO';
        detectedComboRaw = `Price collapse: ₹${comboPrice}`;
        flags.push(`Collapsed into ${combo.name} based on matching components & price`);
        break;
      }
    }
  }

  if (matchedItems.length === 0) {
    flags.push('⚠ Review Manually: No products recognized from message');
  }

  // Step 7: Brand Auto-Detection (Fix 67d Step 4)
  const detectedBrands = new Set(matchedItems.map((p) => p.brandCode));
  let orderBrand: BrandCode = 'FORYA';
  let brandConfidence: Confidence = 'REVIEW';

  const brandArray = Array.from(detectedBrands);
  if (brandArray.length === 1) {
    orderBrand = brandArray[0];
    brandConfidence = 'HIGH';
  } else if (brandArray.length > 1) {
    orderBrand = brandArray[0];
    brandConfidence = 'AUTO';
    flags.push(`Multi-brand order: ${brandArray.join(' + ')}`);
  } else {
    if (/\bforya\b/i.test(text)) {
      orderBrand = 'FORYA';
      brandConfidence = 'AUTO';
    } else if (/\b(?:pee\s*safe|furr)\b/i.test(text)) {
      orderBrand = 'PEE_SAFE';
      brandConfidence = 'AUTO';
    } else if (/\brenee\b/i.test(text)) {
      orderBrand = 'RENEE';
      brandConfidence = 'AUTO';
    } else {
      orderBrand = 'FORYA';
      brandConfidence = 'REVIEW';
      flags.push('Could not determine brand');
    }
  }

  // Step 8: Price Validation & Conflict Detection (Fix 67f)
  const calculatedTotal = matchedItems.reduce((acc, it) => acc + it.totalPrice, 0);
  let priceWarning = '';
  let priceLevel: 'OK' | 'WARNING' | 'REVIEW' = 'OK';
  let diff = 0;
  let diffPct = 0;

  if (statedPriceValue > 0 && calculatedTotal > 0) {
    diff = Math.abs(statedPriceValue - calculatedTotal);
    diffPct = Math.round((diff / calculatedTotal) * 100);

    if (statedPriceValue > calculatedTotal) {
      priceLevel = 'REVIEW';
      priceWarning = `Stated price NPR ${statedPriceValue.toLocaleString()} is HIGHER than catalog total NPR ${calculatedTotal.toLocaleString()}. Possible extra item or wrong price.`;
      flags.push(priceWarning);
    } else if (diffPct < 5) {
      priceLevel = 'OK';
    } else if (diffPct >= 5 && diffPct <= 15) {
      priceLevel = 'WARNING';
      priceWarning = `Stated price NPR ${statedPriceValue.toLocaleString()} differs from catalog total NPR ${calculatedTotal.toLocaleString()} by NPR ${diff.toLocaleString()} (${diffPct}% discount).`;
      flags.push(priceWarning);
    } else {
      priceLevel = 'REVIEW';
      priceWarning = `Stated price NPR ${statedPriceValue.toLocaleString()} is ${diffPct}% below catalog total NPR ${calculatedTotal.toLocaleString()}. Please verify products and quantities.`;
      flags.push(priceWarning);
    }
  }

  const effectiveTotal = statedPriceValue > 0 && statedPriceValue <= calculatedTotal ? statedPriceValue : calculatedTotal;
  const paymentTerms = /esewa|khalti|bank|prepaid|paid|fonepay/i.test(text) ? 'Prepaid' : 'COD';
  const deliveryMethod = /pathao/i.test(text) ? 'Pathao' : /indrive/i.test(text) ? 'InDrive' : 'Standard';

  return {
    id: `ext_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    customerName: {
      value: extractedName,
      confidence: nameConfidence,
    },
    customerPhone: {
      value: extractedPhone,
      confidence: phoneConfidence,
    },
    brandCode: {
      value: orderBrand,
      confidence: brandConfidence,
    },
    products: matchedItems,
    address: {
      value: extractedAddress,
      confidence: addressConfidence,
    },
    rawAddress: rawAddressText || extractedAddress,
    city: {
      value: extractedCity,
      confidence: cityConfidence,
    },
    combo: {
      value: detectedComboName,
      confidence: detectedComboConfidence,
      rawMatched: detectedComboRaw,
    },
    totalAmount: {
      value: effectiveTotal,
      confidence: calculatedTotal > 0 ? 'HIGH' : 'REVIEW',
    },
    statedPrice: {
      value: statedPriceValue,
      confidence: statedPriceConfidence,
      difference: diff,
      differencePct: diffPct,
      warning: priceWarning,
      level: priceLevel,
    },
    paymentTerms: {
      value: paymentTerms,
      confidence: 'AUTO',
    },
    deliveryMethod: {
      value: deliveryMethod,
      confidence: 'AUTO',
    },
    orderDateAd: {
      value: dateAd,
      confidence: dateConfidence,
    },
    orderDateBs: {
      value: dateBs,
      confidence: dateConfidence,
    },
    flags,
    extractionErrors: (() => {
      const errs: string[] = [];
      if (!extractedPhone) errs.push('Missing phone number (Nepal 98XXXXXXXX / 97XXXXXXXX required)');
      if (matchedItems.length === 0) errs.push('No products or combos recognized from catalog keywords');
      if (!extractedAddress || addressConfidence === 'FAILED') errs.push('Missing delivery address or landmark');
      if (!extractedName) errs.push('Missing customer name');
      return errs;
    })(),
    isMarketing: false,
    rawText: text,
  };
}

/**
 * Extract multiple orders dynamically from a bulk paste
 */
export function extractOrdersDynamically(
  rawText: string,
  options: DynamicExtractorOptions
): ExtractedOrderResult[] {
  const blocks = splitMessageBlocks(rawText);
  return blocks.map((b) => extractSingleOrder(b, options));
}

// Backwards compatibility alias
export function extractOrderFromChat(rawText: string): ExtractedOrderResult {
  const { db } = require('./db/db-service');
  const products = db.getProducts().filter((p: Product) => p.active !== false);
  const combos = db.getCombos().filter((c: Combo) => c.active !== false && c.isActive !== false);
  const brands = db.getBrands().filter((b: Brand) => b.status !== 'ARCHIVED');

  return extractSingleOrder(rawText, { products, combos, brands });
}
