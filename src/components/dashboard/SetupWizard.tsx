'use client';

import React, { useState } from 'react';
import { db } from '@/lib/db/db-service';
import { addBrand as apiAddBrand } from '@/lib/db/brands-service';
import { toast } from '@/components/common/Toast';
import { BrandCode } from '@/lib/types';
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
  Trash2,
  Tag,
} from 'lucide-react';

interface SetupWizardProps {
  onComplete: () => void;
  onDismiss?: () => void;
}

export default function SetupWizard({ onComplete, onDismiss }: SetupWizardProps) {
  const [step, setStep] = useState(1);

  // Step 1: Brands
  const [configuredBrands, setConfiguredBrands] = useState<{ name: string; code: string; color: string }[]>(() => {
    const existing = db.getBrands();
    if (existing.length > 0) {
      return existing.map((b) => ({ name: b.name, code: b.code, color: b.color || '#10b981' }));
    }
    return [];
  });
  const [newBrandName, setNewBrandName] = useState('');
  const [newBrandCode, setNewBrandCode] = useState('');
  const [newBrandColor, setNewBrandColor] = useState('#10b981');

  // Step 2: Initial Products
  const [productsToAdd, setProductsToAdd] = useState<{ name: string; brandCode: string; mrp: number }[]>([]);
  const [newProdName, setNewProdName] = useState('');
  const [newProdBrand, setNewProdBrand] = useState('');
  const [newProdMrp, setNewProdMrp] = useState<number>(350);

  // Step 3: Stores
  const [storesToAdd, setStoresToAdd] = useState<string[]>([]);
  const [newStoreInput, setNewStoreInput] = useState('');

  // Step 4: Staff
  const [staffToAdd, setStaffToAdd] = useState<
    { name: string; phone: string; role: 'SALES_OFFICER' | 'BRAND_MANAGER' }[]
  >([]);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('+977-98');

  // Handle adding brand in Step 1
  const handleAddBrand = () => {
    if (!newBrandName.trim()) {
      toast.error('Please enter a brand name');
      return;
    }
    const cleanCode = (newBrandCode || newBrandName)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, '_');
    if (configuredBrands.some((b) => b.code === cleanCode)) {
      toast.error('Brand code already added');
      return;
    }
    setConfiguredBrands([...configuredBrands, { name: newBrandName.trim(), code: cleanCode, color: newBrandColor }]);
    setNewBrandName('');
    setNewBrandCode('');
  };

  const handleRemoveBrand = (code: string) => {
    setConfiguredBrands(configuredBrands.filter((b) => b.code !== code));
  };

  // Handle adding product in Step 2
  const handleAddProduct = () => {
    if (!newProdName.trim()) {
      toast.error('Please enter product name');
      return;
    }
    const bCode = newProdBrand || configuredBrands[0]?.code || 'GENERAL';
    setProductsToAdd([...productsToAdd, { name: newProdName.trim(), brandCode: bCode, mrp: newProdMrp }]);
    setNewProdName('');
  };

  const handleNext = () => {
    if (step === 1 && configuredBrands.length === 0) {
      toast.error('Please add at least one brand to proceed.');
      return;
    }
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

  const handleFinalizeSetup = async () => {
    try {
      // 1. Save Brands
      for (const b of configuredBrands) {
        const brandObj = {
          id: `brand_${b.code.toLowerCase()}`,
          code: b.code as BrandCode,
          name: b.name,
          color: b.color,
          category: 'Personal Care' as const,
          description: `${b.name} registered via Workspace Setup Wizard.`,
          principalCompany: 'Brand Bucket Nepal',
          isActive: true,
          status: 'ACTIVE' as const,
        };
        db.addBrand(brandObj);
        await apiAddBrand(brandObj).catch(() => {});
      }

      // 2. Save Products if any
      productsToAdd.forEach((p, idx) => {
        db.addProduct({
          name: p.name,
          brandCode: p.brandCode as BrandCode,
          brandId: `brand_${p.brandCode.toLowerCase()}`,
          unitPrice: Math.round(p.mrp * 0.75),
          thresholdQty: 5,
          keywords: [p.name, p.brandCode],
          mrp: p.mrp,
          sku: `${p.brandCode.slice(0, 3)}-${100 + idx}`,
          category: 'General',
          caseSize: 24,
          active: true,
        });
      });

      // 3. Save Stores if any
      storesToAdd.forEach((storeName) => {
        db.addRetailer({
          name: storeName,
          type: 'GT',
          storeType: 'STANDALONE_RETAILER',
          category: 'Supermarket',
          city: 'Kathmandu',
          area: 'Kathmandu Valley',
          address: `${storeName}, Kathmandu`,
          lat: 27.7172,
          lng: 85.324,
          brandsStocked: configuredBrands.map((b) => b.code as BrandCode),
          assignedOfficerId: 'user_devansh',
          assignedOfficerName: 'Devansh Agarwal',
          contactName: 'Store Manager',
          contactRole: 'Store Owner',
          contactPhone: '+977-9800000000',
        });
      });

      // 4. Save Staff if any
      staffToAdd.forEach((s) => {
        db.addNewUser({
          fullName: s.name,
          email: `${s.name.toLowerCase().replace(/\s+/g, '.')}@brandbucket.com.np`,
          phone: s.phone,
          role: s.role,
          active: true,
          assignedBrands: configuredBrands.map((b) => b.code),
        });
      });

      localStorage.setItem('bb_setup_wizard_completed', 'true');
      toast.success('Workspace successfully configured with your custom setup!');
      onComplete();
    } catch (e: any) {
      toast.error('Setup failed: ' + (e?.message || 'Unknown error'));
    }
  };

  const steps = [
    { num: 1, title: 'Brands', icon: Tag },
    { num: 2, title: 'Products', icon: Package },
    { num: 3, title: 'Stores', icon: Store },
    { num: 4, title: 'Staff', icon: Users },
    { num: 5, title: 'Confirm', icon: Calendar },
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
                <h2 className="text-base font-black text-white">Brand Bucket Command Center Setup</h2>
                <span className="rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-400/30">
                  Step {step} of 5
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Set up your brand portfolio, catalog, and field distribution in minutes.
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
                <h3 className="text-sm font-black text-slate-900">Step 1: Add Brands to Portfolio</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure brand names and codes. Once saved, these appear across all dropdowns, header tabs, and product forms.
                </p>
              </div>

              {/* Add Brand Form */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Brand Name *</label>
                    <input
                      type="text"
                      value={newBrandName}
                      onChange={(e) => {
                        setNewBrandName(e.target.value);
                        setNewBrandCode(e.target.value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_'));
                      }}
                      placeholder="e.g. Forya"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Brand Code *</label>
                    <input
                      type="text"
                      value={newBrandCode}
                      onChange={(e) => setNewBrandCode(e.target.value.toUpperCase())}
                      placeholder="e.g. FORYA"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900 uppercase font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Theme Color</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={newBrandColor}
                        onChange={(e) => setNewBrandColor(e.target.value)}
                        className="w-9 h-9 rounded-xl border border-slate-200 cursor-pointer p-0.5 bg-white"
                      />
                      <button
                        type="button"
                        onClick={handleAddBrand}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Configured Brands List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700">Configured Brands ({configuredBrands.length}):</h4>
                {configuredBrands.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-3 rounded-xl bg-slate-50 border border-slate-200">
                    No brands added yet. Type a brand name above and click &quot;Add&quot;.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {configuredBrands.map((b) => (
                      <div
                        key={b.code}
                        className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 shadow-2xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: b.color }}
                          />
                          <div>
                            <span className="font-bold text-xs text-slate-900">{b.name}</span>
                            <span className="text-[10px] font-mono text-slate-500 block">({b.code})</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveBrand(b.code)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded-lg transition"
                          title="Remove"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 2: PRODUCTS */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">Step 2: Add Initial Products (Optional)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Add products now or configure full catalogs later in the Product Catalog.
                </p>
              </div>

              {/* Add Product Form */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Product Name</label>
                    <input
                      type="text"
                      value={newProdName}
                      onChange={(e) => setNewProdName(e.target.value)}
                      placeholder="e.g. Roll-On Peach 50ml"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">Brand</label>
                    <select
                      value={newProdBrand}
                      onChange={(e) => setNewProdBrand(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                    >
                      {configuredBrands.map((b) => (
                        <option key={b.code} value={b.code}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">MRP (Rs)</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={newProdMrp}
                        onChange={(e) => setNewProdMrp(Number(e.target.value))}
                        className="w-20 px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-900"
                      />
                      <button
                        type="button"
                        onClick={handleAddProduct}
                        className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-xs flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700">Initial Products ({productsToAdd.length}):</h4>
                {productsToAdd.length === 0 ? (
                  <p className="text-xs text-slate-400 italic p-3 rounded-xl bg-slate-50 border border-slate-200">
                    No initial products added. You can skip this step and add products via Excel / catalog later.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {productsToAdd.map((p, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-slate-200 text-xs"
                      >
                        <div>
                          <span className="font-bold text-slate-900">{p.name}</span>
                          <span className="text-slate-500 ml-2 font-mono">[{p.brandCode}]</span>
                        </div>
                        <span className="font-bold text-slate-700">Rs. {p.mrp}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: STORES */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">Step 3: Initial Retail Stores</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Stores added here will appear in your Store Directory and Beat Plan.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStoreInput}
                  onChange={(e) => setNewStoreInput(e.target.value)}
                  placeholder="e.g. BigMart - Baneshwor"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newStoreInput.trim()) {
                      setStoresToAdd([...storesToAdd, newStoreInput.trim()]);
                      setNewStoreInput('');
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
                >
                  Add Store
                </button>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {storesToAdd.map((store, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800"
                  >
                    <span>{store}</span>
                    <button
                      type="button"
                      onClick={() => setStoresToAdd(storesToAdd.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
                <h3 className="text-sm font-black text-slate-900">Step 4: Field Sales Staff</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Register Sales Officers for daily beat visits, GPS check-ins, and secondary order collection.
                </p>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="Officer Name"
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900"
                />
                <input
                  type="text"
                  value={newStaffPhone}
                  onChange={(e) => setNewStaffPhone(e.target.value)}
                  placeholder="Phone"
                  className="w-36 px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-900"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newStaffName.trim()) {
                      setStaffToAdd([
                        ...staffToAdd,
                        { name: newStaffName.trim(), phone: newStaffPhone, role: 'SALES_OFFICER' },
                      ]);
                      setNewStaffName('');
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold"
                >
                  Add
                </button>
              </div>

              <div className="space-y-1.5">
                {staffToAdd.map((staff, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-semibold text-slate-800"
                  >
                    <div>
                      <span>{staff.name}</span>
                      <span className="text-slate-400 ml-2 font-mono">{staff.phone}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setStaffToAdd(staffToAdd.filter((_, i) => i !== idx))}
                      className="text-slate-400 hover:text-rose-600"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STEP 5: CONFIRM */}
          {step === 5 && (
            <div className="space-y-4">
              <div>
                <h3 className="text-sm font-black text-slate-900">Step 5: Confirm Workspace Initialization</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review your initial setup. Click &quot;Initialize Workspace&quot; to activate all systems.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Brands</span>
                  <div className="font-bold text-slate-800 mt-0.5">
                    {configuredBrands.map((b) => b.name).join(', ') || 'None'}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Initial Products</span>
                  <div className="font-bold text-slate-800 mt-0.5">{productsToAdd.length} SKUs</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Stores</span>
                  <div className="font-bold text-slate-800 mt-0.5">{storesToAdd.length} Stores</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Field Officers</span>
                  <div className="font-bold text-slate-800 mt-0.5">{staffToAdd.length} Officers</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="bg-slate-50 border-t border-slate-200 px-6 py-4 flex items-center justify-between">
          <button
            type="button"
            onClick={handlePrev}
            disabled={step === 1}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40 transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </button>

          <button
            type="button"
            onClick={handleNext}
            className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition cursor-pointer"
          >
            <span>{step === 5 ? 'Initialize Workspace' : 'Continue'}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
