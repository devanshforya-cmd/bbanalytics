// Nepali Calendar (Bikram Sambat ↔ Gregorian AD) Conversion Engine
// Supports years 2075 BS - 2085 BS with exact day counts and leap year handling

import { FilterCriteria } from './types';

export const NEPALI_MONTHS = [
  { index: 1, en: 'Baisakh', np: 'बैशाख' },
  { index: 2, en: 'Jestha', np: 'जेठ' },
  { index: 3, en: 'Ashadh', np: 'असार' },
  { index: 4, en: 'Shrawan', np: 'साउन' },
  { index: 5, en: 'Bhadra', np: 'भाद्र' },
  { index: 6, en: 'Ashwin', np: 'असोज' },
  { index: 7, en: 'Kartik', np: 'कार्तिक' },
  { index: 8, en: 'Mangsir', np: 'मंसिर' },
  { index: 9, en: 'Poush', np: 'पुष' },
  { index: 10, en: 'Magh', np: 'माघ' },
  { index: 11, en: 'Falgun', np: 'फाल्गुन' },
  { index: 12, en: 'Chaitra', np: 'चैत' },
];

// Days in each month for BS years 2078 through 2085
export const BS_MONTH_DAYS: Record<number, number[]> = {
  2078: [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30],
  2079: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2080: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 30],
  2081: [31, 31, 32, 32, 31, 30, 30, 30, 29, 30, 29, 31],
  2082: [31, 32, 31, 32, 31, 30, 30, 30, 29, 30, 30, 30],
  2083: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30],
  2084: [31, 31, 32, 31, 32, 30, 30, 29, 30, 29, 30, 30],
  2085: [31, 32, 31, 32, 31, 30, 30, 30, 29, 29, 30, 31],
};

// Reference point: 2081 Baisakh 1 = 2024 April 13
const REF_BS_YEAR = 2081;
const REF_BS_MONTH = 1;
const REF_BS_DAY = 1;
const REF_AD_DATE = new Date(2024, 3, 13); // Note: month is 0-indexed in JS Date (3 = April)

export interface BsDate {
  year: number;
  month: number; // 1-12
  day: number;
  monthName: string;
}

export function adToBs(date: Date | string): BsDate {
  const ad = typeof date === 'string' ? new Date(date) : new Date(date);
  
  // Clean timezone differences
  const adUtc = Date.UTC(ad.getFullYear(), ad.getMonth(), ad.getDate());
  const refUtc = Date.UTC(REF_AD_DATE.getFullYear(), REF_AD_DATE.getMonth(), REF_AD_DATE.getDate());
  
  let diffDays = Math.floor((adUtc - refUtc) / (1000 * 60 * 60 * 24));
  
  let curYear = REF_BS_YEAR;
  let curMonth = REF_BS_MONTH;
  let curDay = REF_BS_DAY;

  if (diffDays >= 0) {
    while (diffDays > 0) {
      const daysInCurrentMonth = (BS_MONTH_DAYS[curYear] && BS_MONTH_DAYS[curYear][curMonth - 1]) || 30;
      const daysLeftInMonth = daysInCurrentMonth - curDay + 1;
      
      if (diffDays >= daysLeftInMonth) {
        diffDays -= daysLeftInMonth;
        curDay = 1;
        curMonth++;
        if (curMonth > 12) {
          curMonth = 1;
          curYear++;
        }
      } else {
        curDay += diffDays;
        diffDays = 0;
      }
    }
  } else {
    while (diffDays < 0) {
      curDay--;
      if (curDay < 1) {
        curMonth--;
        if (curMonth < 1) {
          curMonth = 12;
          curYear--;
        }
        curDay = (BS_MONTH_DAYS[curYear] && BS_MONTH_DAYS[curYear][curMonth - 1]) || 30;
      }
      diffDays++;
    }
  }

  const monthObj = NEPALI_MONTHS[curMonth - 1] || NEPALI_MONTHS[0];
  return {
    year: curYear,
    month: curMonth,
    day: curDay,
    monthName: monthObj.en,
  };
}

export function bsToAd(year: number, month: number, day: number): Date {
  let totalDays = 0;
  
  if (year >= REF_BS_YEAR) {
    for (let y = REF_BS_YEAR; y < year; y++) {
      const monthDays = BS_MONTH_DAYS[y] || [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30];
      totalDays += monthDays.reduce((a, b) => a + b, 0);
    }
    const currentYearMonthDays = BS_MONTH_DAYS[year] || [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30];
    for (let m = 1; m < month; m++) {
      totalDays += currentYearMonthDays[m - 1];
    }
    totalDays += (day - 1);
  } else {
    // Before reference year
    for (let y = year; y < REF_BS_YEAR; y++) {
      const monthDays = BS_MONTH_DAYS[y] || [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30];
      totalDays -= monthDays.reduce((a, b) => a + b, 0);
    }
    const targetYearMonthDays = BS_MONTH_DAYS[year] || [31, 31, 31, 32, 31, 31, 30, 29, 30, 29, 30, 30];
    for (let m = 1; m < month; m++) {
      totalDays += targetYearMonthDays[m - 1];
    }
    totalDays += (day - 1);
  }

  const ad = new Date(REF_AD_DATE);
  ad.setDate(ad.getDate() + totalDays);
  return ad;
}

export function formatDualDate(dateInput: Date | string): string {
  const ad = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(ad.getTime())) return '';
  const bs = adToBs(ad);
  const adStr = ad.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${bs.monthName} ${bs.day}, ${bs.year} (${adStr})`;
}

export function formatBsDateOnly(dateInput: Date | string): string {
  const ad = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (isNaN(ad.getTime())) return '';
  const bs = adToBs(ad);
  return `${bs.monthName} ${bs.day}, ${bs.year}`;
}

export function getTodayBs(): string {
  return formatBsDateOnly(new Date());
}

export function getTodayAd(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const AD_MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];
const AD_MONTH_NAMES_SHORT = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];
const DAY_OF_WEEK_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

export function matchesDateCriteria(
  dateAd?: string,
  dateBs?: string,
  criteria?: FilterCriteria
): boolean {
  if (!criteria) return true;

  const hasDateFilters = Boolean(
    criteria.dateExact ||
    criteria.dateFrom ||
    criteria.dateTo ||
    criteria.dayOfWeek ||
    criteria.month ||
    criteria.year
  );

  if (!hasDateFilters) return true;
  if (!dateAd && !dateBs) return false;

  let cleanDateAd = dateAd ? dateAd.split('T')[0] : '';
  let dateObj: Date | null = null;
  let bsObj: BsDate | null = null;

  if (cleanDateAd) {
    const parts = cleanDateAd.split('-').map(Number);
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
      bsObj = adToBs(dateObj);
    }
  }

  // If dateObj couldn't be parsed from dateAd, try parsing dateBs
  if (!dateObj && dateBs) {
    const isoMatch = dateBs.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (isoMatch) {
      const y = parseInt(isoMatch[1], 10);
      const m = parseInt(isoMatch[2], 10);
      const d = parseInt(isoMatch[3], 10);
      dateObj = bsToAd(y, m, d);
      bsObj = { year: y, month: m, day: d, monthName: NEPALI_MONTHS[m - 1]?.en || '' };
      cleanDateAd = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
    } else {
      const textMatch = dateBs.match(/([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
      if (textMatch) {
        const mName = textMatch[1];
        const d = parseInt(textMatch[2], 10);
        const y = parseInt(textMatch[3], 10);
        const foundM = NEPALI_MONTHS.find((m) => m.en.toLowerCase() === mName.toLowerCase());
        if (foundM) {
          dateObj = bsToAd(y, foundM.index, d);
          bsObj = { year: y, month: foundM.index, day: d, monthName: foundM.en };
          cleanDateAd = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        }
      }
    }
  }

  if (!dateObj) return false;

  // 1. Exact Date filter
  if (criteria.dateExact) {
    const targetExact = criteria.dateExact.trim();
    const isExactMatch =
      cleanDateAd === targetExact ||
      (dateBs && dateBs.trim() === targetExact) ||
      (bsObj && `${bsObj.year}-${String(bsObj.month).padStart(2, '0')}-${String(bsObj.day).padStart(2, '0')}` === targetExact);
    if (!isExactMatch) return false;
  }

  // 2. Date Range: dateFrom & dateTo (in AD YYYY-MM-DD)
  if (criteria.dateFrom && cleanDateAd) {
    if (cleanDateAd < criteria.dateFrom) return false;
  }
  if (criteria.dateTo && cleanDateAd) {
    if (cleanDateAd > criteria.dateTo) return false;
  }

  // 3. Day of week filter (e.g. "Sunday", "Monday", ...)
  if (criteria.dayOfWeek) {
    const dayName = DAY_OF_WEEK_NAMES[dateObj.getDay()];
    if (dayName.toLowerCase() !== criteria.dayOfWeek.toLowerCase()) return false;
  }

  // 4. Month filter (BS or AD)
  if (criteria.month) {
    const targetMonth = criteria.month.trim().toLowerCase();
    const adMonthName = AD_MONTH_NAMES[dateObj.getMonth()].toLowerCase();
    const adMonthShort = AD_MONTH_NAMES_SHORT[dateObj.getMonth()].toLowerCase();
    const adMonthNum = String(dateObj.getMonth() + 1);
    const adMonthPad = adMonthNum.padStart(2, '0');

    const bsMonthName = bsObj ? bsObj.monthName.toLowerCase() : '';
    const bsMonthNum = bsObj ? String(bsObj.month) : '';
    const bsMonthPad = bsObj ? bsMonthNum.padStart(2, '0') : '';

    let matchesMonth = false;
    if (criteria.calendarMode === 'AD') {
      matchesMonth =
        targetMonth === adMonthName ||
        targetMonth === adMonthShort ||
        targetMonth === adMonthNum ||
        targetMonth === adMonthPad;
    } else if (criteria.calendarMode === 'BS') {
      matchesMonth =
        targetMonth === bsMonthName ||
        targetMonth === bsMonthNum ||
        targetMonth === bsMonthPad ||
        (dateBs ? dateBs.toLowerCase().includes(targetMonth) : false);
    } else {
      matchesMonth =
        targetMonth === bsMonthName ||
        targetMonth === bsMonthNum ||
        targetMonth === bsMonthPad ||
        (dateBs ? dateBs.toLowerCase().includes(targetMonth) : false) ||
        targetMonth === adMonthName ||
        targetMonth === adMonthShort ||
        targetMonth === adMonthNum ||
        targetMonth === adMonthPad;
    }

    if (!matchesMonth) return false;
  }

  // 5. Year filter (BS or AD)
  if (criteria.year) {
    const targetYear = criteria.year.trim();
    const adYear = String(dateObj.getFullYear());
    const bsYear = bsObj ? String(bsObj.year) : '';

    let matchesYear = false;
    if (criteria.calendarMode === 'AD') {
      matchesYear = adYear === targetYear;
    } else if (criteria.calendarMode === 'BS') {
      matchesYear = bsYear === targetYear || (dateBs ? dateBs.includes(targetYear) : false);
    } else {
      matchesYear =
        bsYear === targetYear ||
        adYear === targetYear ||
        (dateBs ? dateBs.includes(targetYear) : false);
    }

    if (!matchesYear) return false;
  }

  return true;
}

