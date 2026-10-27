'use client';

import React, { useState, useRef, useEffect } from 'react';
import { db } from '@/lib/db/db-service';
import { Brand, BrandCode, User } from '@/lib/types';
import {
  ChevronDown,
  Check,
  Search,
  Plus,
  Layers,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import Link from 'next/link';
import { fetchBrandsFromSupabase } from '@/lib/db/brands-service';
import { getSessionUser } from '@/lib/auth';
import { canAccessBrand, hasAccess, isSuperAdmin } from '@/lib/permissions';

interface BrandDropdownProps {
  currentBrand: BrandCode;
  onBrandChange: (brand: BrandCode) => void;
  className?: string;
  isCompact?: boolean;
}

export default function BrandDropdown({
  currentBrand,
  onBrandChange,
  className = '',
  isCompact = false,
}: BrandDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      const user = getSessionUser() || db.getCurrentUser();
      setCurrentUser(user);
      const visible = (items: Brand[]) => items.filter((brand) => canAccessBrand(user, brand.code));
      try {
        const loaded = await fetchBrandsFromSupabase();
        setBrands(visible(loaded.filter((brand) => brand.isActive !== false && brand.status !== 'ARCHIVED')));
      } catch {
        setBrands(visible(db.getBrands('ACTIVE')));
      } finally { setLoading(false); }
    }
    load();

    const handleDbUpdate = () => {
      const user = getSessionUser() || db.getCurrentUser();
      setBrands(db.getBrands('ACTIVE').filter((brand) => canAccessBrand(user, brand.code)));
    };
    window.addEventListener('bb-db-updated', handleDbUpdate);
    return () => window.removeEventListener('bb-db-updated', handleDbUpdate);
  }, []);

  // Auto-reset if currently selected brand was deactivated or deleted
  useEffect(() => {
    if (brands.length > 0 && currentBrand !== 'ALL') {
      const exists = brands.some((b) => b.code === currentBrand);
      if (!exists) {
        onBrandChange('ALL');
      }
    }
  }, [brands, currentBrand, onBrandChange]);

  // Close when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Keyboard escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false);
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const activeBrandObj = brands.find((b) => b.code === currentBrand);

  const filteredBrands = brands.filter((b) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      b.name.toLowerCase().includes(q) ||
      b.code.toLowerCase().includes(q) ||
      (b.category && b.category.toLowerCase().includes(q)) ||
      (b.principalCompany && b.principalCompany.toLowerCase().includes(q))
    );
  });

  // Group by category
  const categories = Array.from(
    new Set(filteredBrands.map((b) => b.category || 'General Portfolio'))
  );

  const getSkuCount = (code: BrandCode) => {
    try {
      return db.getProducts(code).length;
    } catch {
      return 0;
    }
  };

  const totalSkus = db.getProducts().length;

  const canOnboardBrand =
    isSuperAdmin(currentUser) || hasAccess(currentUser, 'settings');

  if (loading && brands.length === 0) return <span role="status" className={`px-3 py-1.5 text-xs text-slate-500 ${className}`}>Loading brands…</span>;

  if (brands.length === 0) {
    if (!canOnboardBrand) {
      return <span className={`px-3 py-1.5 text-[11px] font-medium text-slate-500 ${className}`}>No brands assigned</span>;
    }
    return (
      <Link
        href="/settings?tab=brands"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-blue-300 bg-blue-50/50 text-[11px] font-semibold text-blue-700 hover:bg-blue-100/60 transition"
      >
        <Plus className="w-3.5 h-3.5 text-blue-600" />
        <span>+ Add Brands in Settings</span>
      </Link>
    );
  }

  return (
    <div className={`relative inline-block text-left ${className}`} ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-xs hover:border-slate-300 hover:bg-slate-50/80 transition-all active:scale-98 ${
          isCompact ? 'w-36 sm:w-44' : 'w-44 sm:w-52'
        }`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        <div className="flex items-center gap-2 truncate">
          {currentBrand === 'ALL' ? (
            <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-blue-50 text-blue-600 font-bold">
              <Layers className="h-3 w-3" />
            </div>
          ) : (
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-offset-1 ring-slate-100"
              style={{ backgroundColor: activeBrandObj?.color || '#2563eb' }}
            />
          )}
          <span className="truncate">
            {currentBrand === 'ALL' ? 'All Brands' : activeBrandObj?.name || currentBrand}
          </span>
        </div>

        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute left-0 z-50 mt-1.5 w-72 origin-top-left rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-100">
          {/* Search Box */}
          <div className="p-2 border-b border-slate-100">
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search brands or categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full rounded-lg bg-slate-50 pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder-slate-400 border border-slate-200/80 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 text-[10px] text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Brand List */}
          <div className="max-h-72 overflow-y-auto p-1.5 space-y-1">
            {/* "All Brands" Option */}
            <button
              type="button"
              onClick={() => {
                onBrandChange('ALL');
                setIsOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition ${
                currentBrand === 'ALL'
                  ? 'bg-blue-50 text-blue-900 font-semibold'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-700">
                  <Layers className="h-3.5 w-3.5" />
                </div>
                <div className="truncate">
                  <div className="font-semibold text-slate-900">All Brands Portfolio</div>
                  <div className="text-[10px] text-slate-500">Master Aggregate Dashboard</div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                  {totalSkus} SKUs
                </span>
                {currentBrand === 'ALL' && <Check className="h-4 w-4 text-blue-600" />}
              </div>
            </button>

            <div className="my-1 border-t border-slate-100" />

            {/* Categorized Brands */}
            {filteredBrands.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400">
                No brand matching &ldquo;{searchQuery}&rdquo;
              </div>
            ) : (
              categories.map((cat) => {
                const catBrands = filteredBrands.filter(
                  (b) => (b.category || 'General Portfolio') === cat
                );
                if (catBrands.length === 0) return null;

                return (
                  <div key={cat} className="space-y-0.5">
                    <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {cat}
                    </div>
                    {catBrands.map((brand) => {
                      const isSelected = currentBrand === brand.code;
                      const skuCount = getSkuCount(brand.code);

                      return (
                        <button
                          key={brand.id}
                          type="button"
                          onClick={() => {
                            onBrandChange(brand.code);
                            setIsOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition ${
                            isSelected
                              ? 'bg-blue-50 text-blue-900 font-semibold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: brand.color || '#3b82f6' }}
                            />
                            <div className="truncate">
                              <div className="flex items-center gap-1.5">
                                <span className="font-semibold text-slate-900 truncate">
                                  {brand.name}
                                </span>
                                {brand.status === 'PILOT' && (
                                  <span className="rounded bg-amber-100 px-1 text-[9px] font-bold text-amber-800">
                                    PILOT
                                  </span>
                                )}
                              </div>
                              {brand.principalCompany && (
                                <div className="text-[10px] text-slate-400 truncate">
                                  {brand.principalCompany}
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="text-[10px] text-slate-400 font-medium">
                              {skuCount} SKUs
                            </span>
                            {isSelected && <Check className="h-4 w-4 text-blue-600" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>

          {/* Admin Onboard Brand Link */}
          {canOnboardBrand && (
            <div className="border-t border-slate-100 p-2 bg-slate-50/50 rounded-b-xl">
              <Link
                href="/settings?tab=brands"
                onClick={() => setIsOpen(false)}
                className="flex items-center justify-between w-full rounded-lg px-2.5 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition"
              >
                <div className="flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5 text-blue-600" />
                  <span>+ Onboard Principal Brand</span>
                </div>
                <ExternalLink className="h-3 w-3 text-blue-400" />
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
