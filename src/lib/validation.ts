import { Cheque } from './types';

/**
 * Validation utility functions for forms across the Brand Bucket Command Center
 */

/**
 * Validates that a field is not empty
 */
export function validateRequired(
  value: string | number | null | undefined,
  fieldName: string = 'This field'
): string | null {
  if (value === null || value === undefined) {
    return `${fieldName} is required`;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return `${fieldName} is required`;
  }
  return null;
}

/**
 * Validates a Nepali phone number.
 * Standard format: 10 digits starting with 98 or 97 (NTC, Ncell, SmartCell).
 * Can optionally include leading +977 or 977 country code.
 */
export function validateNepaliPhone(phone: string): string | null {
  if (!phone || phone.trim() === '') {
    return 'Phone number is required';
  }

  // Remove any whitespace, dashes, parentheses
  const cleaned = phone.replace(/[\s\-()]/g, '');

  // Strip leading +977 or 977 if present
  let nationalNumber = cleaned;
  if (nationalNumber.startsWith('+977')) {
    nationalNumber = nationalNumber.slice(4);
  } else if (nationalNumber.startsWith('977') && nationalNumber.length > 10) {
    nationalNumber = nationalNumber.slice(3);
  }

  // Must be exactly 10 digits and start with 98 or 97
  const nepaliMobileRegex = /^(98|97)\d{8}$/;
  if (!nepaliMobileRegex.test(nationalNumber)) {
    return 'Enter a valid Nepali phone number (starts with 98 or 97, 10 digits)';
  }

  return null;
}

/**
 * Validates a quantity field: must be an integer and > 0
 */
export function validateQuantity(
  qty: number | string,
  fieldName: string = 'Quantity'
): string | null {
  const num = typeof qty === 'string' ? Number(qty) : qty;
  if (isNaN(num)) {
    return `${fieldName} must be a number`;
  }
  if (!Number.isInteger(num)) {
    return `${fieldName} must be an integer`;
  }
  if (num <= 0) {
    return `${fieldName} must be greater than 0`;
  }
  return null;
}

/**
 * Validates that a date (YYYY-MM-DD or parseable string) is not in the future
 */
export function validateNotFutureDate(
  dateStr: string,
  fieldName: string = 'Date'
): string | null {
  if (!dateStr || dateStr.trim() === '') {
    return `${fieldName} is required`;
  }

  const todayStr = new Date().toISOString().split('T')[0];
  // Simple YYYY-MM-DD string comparison
  if (dateStr > todayStr) {
    return `${fieldName} cannot be in the future`;
  }
  return null;
}

/**
 * Validates that a cheque number is unique within existing cheques
 */
export function validateUniqueChequeNumber(
  chequeNumber: string,
  existingCheques: Cheque[],
  excludeId?: string
): string | null {
  if (!chequeNumber || chequeNumber.trim() === '') {
    return 'Cheque number is required';
  }

  const normalized = chequeNumber.trim().toLowerCase();
  const duplicate = existingCheques.find(
    (c) =>
      c.chequeNumber.trim().toLowerCase() === normalized &&
      (!excludeId || c.id !== excludeId)
  );

  if (duplicate) {
    return 'This cheque number already exists';
  }

  return null;
}
