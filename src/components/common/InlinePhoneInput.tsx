'use client';

import React, { useState, useEffect } from 'react';
import { Phone, CheckCircle, AlertCircle, Sparkles, UserCheck } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { Customer } from '@/lib/types';

interface InlinePhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  onCustomerFound?: (customer: Customer) => void;
  label?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
}

export default function InlinePhoneInput({
  value,
  onChange,
  onCustomerFound,
  label = 'Customer Phone (Nepal)',
  placeholder = '9801234567',
  required = false,
  className = '',
}: InlinePhoneInputProps) {
  const [customer, setCustomer] = useState<Customer | null>(null);
  const cleanPhone = value.replace(/[^0-9]/g, '');

  // Validation states
  const hasValidPrefix = cleanPhone.startsWith('98') || cleanPhone.startsWith('97') || cleanPhone.startsWith('96');
  const isTooLong = cleanPhone.length > 10;
  const isComplete = cleanPhone.length === 10 && hasValidPrefix;
  const isPartialValid = cleanPhone.length >= 4 && cleanPhone.length < 10 && hasValidPrefix;
  const isInvalidPrefix = cleanPhone.length >= 2 && !hasValidPrefix;

  useEffect(() => {
    if (isComplete) {
      const found = db.getCustomerByPhone(cleanPhone) || db.getCustomers().find((c) => c.phone.includes(cleanPhone));
      if (found) {
        setCustomer(found);
        onCustomerFound?.(found);
      } else {
        setCustomer(null);
      }
    } else {
      setCustomer(null);
    }
  }, [cleanPhone, isComplete, onCustomerFound]);

  // Border & status color
  let borderColor = 'border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20';
  let statusIcon: React.ReactNode = null;
  let statusMessage: React.ReactNode = null;

  if (isTooLong) {
    borderColor = 'border-rose-400 bg-rose-50/20 focus-within:border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/20';
    statusIcon = <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />;
    statusMessage = <span className="text-[11px] text-rose-600 font-medium">Phone number cannot exceed 10 digits</span>;
  } else if (isInvalidPrefix) {
    borderColor = 'border-rose-400 bg-rose-50/20 focus-within:border-rose-500';
    statusIcon = <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />;
    statusMessage = <span className="text-[11px] text-rose-600 font-medium">Must start with 98 or 97 (Nepali mobile)</span>;
  } else if (isComplete) {
    borderColor = 'border-emerald-500 bg-emerald-50/20 focus-within:border-emerald-600 focus-within:ring-2 focus-within:ring-emerald-500/20';
    statusIcon = <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />;
    if (customer) {
      statusMessage = (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-semibold animate-slide-in-right">
          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
          <span>Returning: {customer.name} · Karma: {customer.karmaScore} 🟢</span>
        </div>
      );
    } else {
      statusMessage = <span className="text-[11px] text-emerald-700 font-medium">✓ Valid Nepali number (New Customer)</span>;
    }
  } else if (isPartialValid) {
    borderColor = 'border-emerald-400/80 focus-within:border-emerald-500';
    statusIcon = <CheckCircle className="w-4 h-4 text-emerald-500/80 shrink-0" />;
  }

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      <div className={`relative flex items-center rounded-xl border bg-white transition-all shadow-2xs ${borderColor}`}>
        <div className="pl-3 pr-2 py-2.5 flex items-center gap-1.5 text-slate-400 border-r border-slate-200 text-xs font-mono select-none">
          <span className="font-bold text-slate-700">+977</span>
        </div>

        <input
          type="tel"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 px-3 py-2.5 text-xs text-slate-900 bg-transparent outline-none placeholder:text-slate-400 font-medium tracking-wide"
        />

        {statusIcon && <div className="pr-3 flex items-center">{statusIcon}</div>}
      </div>

      {statusMessage && <div className="pt-0.5">{statusMessage}</div>}
    </div>
  );
}
