'use client';

import React, { useState } from 'react';
import { db } from '@/lib/db/db-service';
import { toast } from '@/components/common/Toast';
import {
  Sparkles,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Store,
  Package,
  Users,
  Calendar,
  X,
  Plus,
  ShieldCheck,
} from 'lucide-react';

interface SetupWizardProps {
  onComplete: () => void;
  onDismiss?: () => void;
}

export default function SetupWizard({ onComplete, onDismiss }: SetupWizardProps) {
  const [step, setStep] = useState(1);

  // Step 1: Brands
  const [selectedBrands, setSelectedBrands] = useState<string[]>([
    'FORYA',
    'PEE_SAFE',
    'RENEE',
  ]);

  // Step 2: Products
  const [loadHeroProducts, setLoadHeroProducts] = useState(true);

  // Step 3: Stores
  const [storesToAdd, setStoresToAdd] = useState<string[]>([
    'Bhatbhateni Supermarket - Maharajgunj',
    'Saleways Department Store - Jawalakhel',
    'BigMart - Pulchowk',
    'Bluebird Mart - Tripureshwor',
  ]);
  const [newStoreInput, setNewStoreInput] = useState('');

  // Step 4: Staff
  const [staffToAdd, setStaffToAdd] = useState<
    { name: string; phone: string; role: 'SALES_OFFICER' | 'BRAND_MANAGER' }[]
  >([
    { name: 'Ravi Sharma', phone: '9801234567', role: 'SALES_OFFICER' },
    { name: 'Pooja Thapa', phone: '9841234568', role: 'SALES_OFFICER' },
    { name: 'Suman Shrestha', phone: '9811234569', role: 'SALES_OFFICER' },
  ]);

  // Step 5: Beat Plan
  const [assignBeats, setAssignBeats] = useState(true);

  const handleNext = () => {
    if (step < 5) {
      setStep(step + 1);
    } else {
      handleFinalizeSetup();
    }
  };

  const handlePrev = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const handleAddStore = () => {
    if (!newStoreInput.trim()) return;
    setStoresToAdd([...storesToAdd, newStoreInput.trim()]);
    setNewStoreInput('');
  };

  const handleRemoveStore = (idx: number) => {
    setStoresToAdd(storesToAdd.filter((_, i) => i !== idx));
  };

  const handleFinalizeSetup = () => {
    try {
      // Seed brands if needed
      selectedBrands.forEach((code) => {
        const existing = db.getBrands().find((b) => b.code === code);
        if (!existing) {
          db.addBrand({
            id: `brand_${code.toLowerCase()}`,
            code: code as any,
            name:
              code === 'FORYA'
                ? 'Forya Natural Deodorants'
                : code === 'PEE_SAFE'
                ? 'Pee Safe & FURR Hygiene'
                : 'Renee Cosmetics',
            category:
              code === 'FORYA'
                ? 'Personal Care'
                : code === 'PEE_SAFE'
                ? 'Hygiene'
                : 'Cosmetics',
            color:
              code === 'FORYA'
                ? '#10b981'
                : code === 'PEE_SAFE'
                ? '#8b5cf6'
                : '#f43f5e',
            description: `${code} registered via Quick Setup Wizard.`,
            principalCompany: 'Brand Bucket Nepal',
          });
        }
      });

      // Seed hero products if selected
      if (loadHeroProducts && db.getProducts().length === 0) {
        db.resetDatabase();
      }

      localStorage.setItem('bb_setup_wizard_completed', 'true');
      toast.success('Workspace successfully initialized with your configuration!');
      onComplete();
    } catch (e: any) {
      toast.error('Setup failed: ' + (e?.message || 'Unknown error'));
    }
  };

  const steps = [
    { num: 1, title: 'Brand Portfolio', icon: Sparkles },
    { num: 2, title: 'Product Catalog', icon: Package },
    { num: 3, title: 'Retail Stores', icon: Store },
    { num: 4, title: 'Sales Officers', icon: Users },
    { num: 5, title: 'Beat Planning', icon: Calendar },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="relative w-full max-w-2xl rounded-3xl bg-white shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header Strip */}
        <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white font-black shadow-inner">
              BB
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white">
                  Brand Bucket Command Center Setup
                </h2>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-400/30">
                  Step {step} of 5
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure your multi-brand distribution workspace in under 2 minutes.
              </p>
            </div>
          </div>

          {onDismiss && (
            <button
              onClick={onDismiss}
              className="rounded-xl p-2 text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Skip setup"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* Stepper indicators */}
        <div className="bg-slate-50 border-b border-slate-200 px-6 py-3">
          <div className="grid grid-cols-5 gap-2">
            {steps.map((s) => {
              const Icon = s.icon;
              const isDone = step > s.num;
              const isCurrent = step === s.num;
              return (
                <div key={s.num} className="flex flex-col items-center gap-1 text-center">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black transition ${
                      isDone
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                        : 'bg-slate-200 text-slate-500'
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : s.num}
                  </div>
                  <span
                    className={`text-[10px] font-bold hidden sm:block ${
                      isCurrent ? 'text-blue-900' : 'text-slate-500'
                    }`}
                  >
                    {s.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="p-6 space-y-6">
          {/* STEP 1: BRANDS */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Select Active Brands for Nepal Distribution
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select which principal brand catalogs to initialize in your workspace.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    code: 'FORYA',
                    name: 'Forya Natural Deo',
                    color: 'border-emerald-300 bg-emerald-50/60 text-emerald-900',
                    desc: 'Organic roll-ons & personal care',
                  },
                  {
                    code: 'PEE_SAFE',
                    name: 'Pee Safe & FURR',
                    color: 'border-purple-300 bg-purple-50/60 text-purple-900',
                    desc: 'Toilet sanitizers, hygiene, razors',
                  },
                  {
                    code: 'RENEE',
                    name: 'Renee Cosmetics',
                    color: 'border-rose-300 bg-rose-50/60 text-rose-900',
                    desc: 'FAB 5 lipstick, pH gloss & makeup',
                  },
                ].map((b) => {
                  const isChecked = selectedBrands.includes(b.code);
                  return (
                    <div
                      key={b.code}
                      onClick={() => {
                        setSelectedBrands(
                          isChecked
                            ? selectedBrands.filter((c) => c !== b.code)
                            : [...selectedBrands, b.code]
                        );
                      }}
                      className={`p-4 rounded-2xl border-2 cursor-pointer transition flex flex-col justify-between ${
                        isChecked ? b.color : 'border-slate-200 bg-white opacity-60'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-black text-xs">{b.name}</span>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          readOnly
                          className="h-4 w-4 rounded-md text-blue-600 focus:ring-blue-500"
                        />
                      </div>
                      <p className="text-[11px] mt-2 opacity-80">{b.desc}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: PRODUCTS */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Initialize Standard SKU Catalog
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Pre-load the verified 12 hero products with accurate MRPs, margin matrices, and Nepal distribution case sizes.
                </p>
              </div>

              <div className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={loadHeroProducts}
                    onChange={(e) => setLoadHeroProducts(e.target.checked)}
                    className="h-4 w-4 rounded-md text-blue-600 focus:ring-blue-500 mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-black text-blue-950">
                      Pre-load 12 Verified Hero SKUs (Recommended)
                    </div>
                    <p className="text-[11px] text-blue-800 mt-0.5 leading-relaxed">
                      Includes Forya Roll-On Peach 50ml, Pee Safe Sanitizer Spray 75ml, FURR Razors (3N), Renee FAB 5 Matte 5-in-1, and Madness pH Gloss.
                    </p>
                  </div>
                </label>
              </div>

              <div className="text-xs text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <span>Have existing product master Excel sheets?</span>
                <span className="font-bold text-blue-600">
                  Settings &gt; Data Import available anytime
                </span>
              </div>
            </div>
          )}

          {/* STEP 3: STORES */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Retail Network & Distributor Branches
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verify or add key retail accounts for field officer daily beat visits.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStoreInput}
                  onChange={(e) => setNewStoreInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddStore()}
                  placeholder="e.g. Salesberry - Satdobato"
                  className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-blue-500 outline-hidden"
                />
                <button
                  type="button"
                  onClick={handleAddStore}
                  className="px-3 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold hover:bg-slate-800 transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" /> Add
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {storesToAdd.map((s, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 bg-white text-xs"
                  >
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                      <Store className="h-3.5 w-3.5 text-blue-500" />
                      <span>{s}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveStore(idx)}
                      className="text-slate-400 hover:text-rose-600 transition"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 4: STAFF */}
          {step === 4 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Field Sales Officers & Staff Accounts
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Default officers pre-configured for beat routing and check-in tracking.
                </p>
              </div>

              <div className="space-y-2">
                {staffToAdd.map((st, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-white text-xs"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[11px]">
                        {st.name.charAt(0)}
                      </div>
                      <div>
                        <div className="font-black text-slate-900">{st.name}</div>
                        <div className="text-[10px] text-slate-400">{st.phone}</div>
                      </div>
                    </div>
                    <span className="rounded-full bg-slate-100 text-slate-700 px-2 py-0.5 text-[10px] font-bold">
                      {st.role.replace('_', ' ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 5: BEAT PLANS */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">
                  Day Planner & Beat Route Optimization
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Activate scheduled 6-day retail beat routes across Kathmandu Valley for the sales force.
                </p>
              </div>

              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={assignBeats}
                    onChange={(e) => setAssignBeats(e.target.checked)}
                    className="h-4 w-4 rounded-md text-emerald-600 focus:ring-emerald-500 mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-black text-emerald-950">
                      Enable Smart Route Scheduling (Sunday - Friday)
                    </div>
                    <p className="text-[11px] text-emerald-800 mt-0.5 leading-relaxed">
                      Assigns morning directive priorities (★★★ High, ★★ Medium, ★ Routine) and calculates 150m GPS geofencing per stop.
                    </p>
                  </div>
                </label>
              </div>

              <div className="rounded-xl border border-slate-200 p-3 bg-slate-50 flex items-center gap-2 text-xs text-slate-600">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>All routes operate with offline sync and local IndexedDB form caching.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          {step > 1 ? (
            <button
              type="button"
              onClick={handlePrev}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 transition cursor-pointer"
              >
                Skip for now
              </button>
            )}
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-blue-600 text-xs font-black text-white hover:bg-blue-700 shadow-sm transition cursor-pointer"
            >
              {step === 5 ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Complete Setup
                </>
              ) : (
                <>
                  Continue <ArrowRight className="h-3.5 w-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
