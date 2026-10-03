'use client';

import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, Check, Package, Sparkles } from 'lucide-react';
import { Product, BrandCode } from '@/lib/types';

export interface SmartDropdownItem {
  id: string;
  name: string;
  group?: string;
  subtitle?: string;
  badge?: string;
  price?: number;
  imageUrl?: string;
  context?: string;
}

interface SmartDropdownProps {
  items: SmartDropdownItem[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  className?: string;
}

const BRAND_COLORS: Record<string, { bg: string; text: string }> = {
  FORYA: { bg: 'bg-emerald-100', text: 'text-emerald-800' },
  PEE_SAFE: { bg: 'bg-cyan-100', text: 'text-cyan-800' },
  RENEE: { bg: 'bg-purple-100', text: 'text-purple-800' },
  FURR: { bg: 'bg-amber-100', text: 'text-amber-800' },
  MAMAEARTH: { bg: 'bg-green-100', text: 'text-green-800' },
};

export default function SmartDropdown({
  items,
  value,
  onChange,
  placeholder = 'Select product or item...',
  label,
  required = false,
  className = '',
}: SmartDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedItem = items.find((i) => i.id === value);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filteredItems = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase();
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.group?.toLowerCase().includes(q) ||
        i.subtitle?.toLowerCase().includes(q)
    );
  }, [items, search]);

  // Group items
  const grouped = useMemo(() => {
    const groups: Record<string, SmartDropdownItem[]> = {};
    filteredItems.forEach((item) => {
      const g = item.group || 'Other';
      if (!groups[g]) groups[g] = [];
      groups[g].push(item);
    });
    return groups;
  }, [filteredItems]);

  return (
    <div ref={dropdownRef} className={`relative space-y-1 ${className}`}>
      {label && (
        <label className="block text-xs font-semibold text-slate-700">
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:border-blue-400 text-left transition-all shadow-2xs focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {selectedItem ? (
            <>
              {selectedItem.imageUrl ? (
                <img
                  src={selectedItem.imageUrl}
                  alt=""
                  className="w-5 h-5 rounded-md object-cover shrink-0 border border-slate-200"
                />
              ) : (
                <Package className="w-4 h-4 text-slate-400 shrink-0" />
              )}
              <span className="text-xs font-semibold text-slate-900 truncate">
                {selectedItem.name}
              </span>
              {selectedItem.price !== undefined && (
                <span className="text-[11px] font-mono font-bold text-slate-500 shrink-0">
                  NPR {selectedItem.price}
                </span>
              )}
              {selectedItem.group && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                    BRAND_COLORS[selectedItem.group]?.bg || 'bg-slate-100'
                  } ${BRAND_COLORS[selectedItem.group]?.text || 'text-slate-700'}`}
                >
                  {selectedItem.group}
                </span>
              )}
            </>
          ) : (
            <span className="text-xs text-slate-400">{placeholder}</span>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden animate-slide-in-right">
          {/* Search Box */}
          <div className="p-2.5 border-b border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white border border-slate-200">
              <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Type to filter..."
                className="w-full text-xs text-slate-800 bg-transparent outline-none placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* List */}
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-50">
            {Object.keys(grouped).length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">No items match &ldquo;{search}&rdquo;</div>
            ) : (
              Object.entries(grouped).map(([group, groupItems]) => (
                <div key={group}>
                  <div
                    className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
                      BRAND_COLORS[group]?.bg || 'bg-slate-100'
                    } ${BRAND_COLORS[group]?.text || 'text-slate-700'}`}
                  >
                    {group}
                  </div>
                  {groupItems.map((item) => {
                    const isSelected = item.id === value;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          onChange(item.id);
                          setIsOpen(false);
                          setSearch('');
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-slate-50 transition-colors ${
                          isSelected ? 'bg-blue-50/60' : ''
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt=""
                              className="w-6 h-6 rounded-md object-cover shrink-0 border border-slate-200"
                            />
                          ) : (
                            <Package className="w-4 h-4 text-slate-300 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-800 truncate">{item.name}</p>
                            {item.context && (
                              <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                                <Sparkles className="w-3 h-3 text-amber-500" />
                                <span>{item.context}</span>
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {item.price !== undefined && (
                            <span className="text-xs font-mono font-bold text-slate-700">
                              ₹{item.price}
                            </span>
                          )}
                          {isSelected && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
