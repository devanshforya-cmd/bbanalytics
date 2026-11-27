'use client';

import React, { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import SearchSelect from '@/components/common/SearchSelect';
import { db } from '@/lib/db/db-service';
import { toast } from '@/components/common/Toast';

/**
 * Pick the bank a cheque is drawn on. Type to search Nepal's banks; if it is not listed, add it
 * here and it stays in the list for everyone.
 */
export default function BankSelect({ value, onChange, label = 'Bank *', id }: { value: string; onChange: (name: string) => void; label?: string; id?: string }) {
  const [, setVersion] = useState(0);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  useEffect(() => { const refresh = () => setVersion((n) => n + 1); window.addEventListener('bb-db-updated', refresh); return () => window.removeEventListener('bb-db-updated', refresh); }, []);
  const banks = db.getBanks();
  const options = banks.map((bank) => ({ value: bank.name, label: bank.name }));
  if (value && !options.some((option) => option.value === value)) options.unshift({ value, label: value });

  const add = () => {
    try {
      const bank = db.addBank(draft);
      onChange(bank.name);
      setAdding(false); setDraft('');
      toast.success(`${bank.name} added to the bank list.`);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Bank not added.'); }
  };

  return (
    <div className="space-y-1.5">
      <SearchSelect id={id} label={label} options={options} value={value} onChange={onChange} placeholder="Type the bank name" emptyText="Not in the list. Add it below." />
      {adding ? (
        <div className="flex gap-1.5">
          <input autoFocus value={draft} maxLength={60} onChange={(e) => setDraft(e.target.value)} aria-label="New bank name" placeholder="e.g. Shine Resunga Development Bank"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (draft.trim()) add(); } if (e.key === 'Escape') setAdding(false); }}
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs outline-none focus:border-blue-500" />
          <button type="button" onClick={add} disabled={!draft.trim()} className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">Add</button>
          <button type="button" onClick={() => { setAdding(false); setDraft(''); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600">Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 hover:underline"><Plus className="h-3 w-3" />Bank not listed? Add it</button>
      )}
    </div>
  );
}
