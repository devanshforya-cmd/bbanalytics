'use client';

import React, { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { SharedAccessLink, Order, Product, DeliveryFailure, ReturnEntry, BrandCode } from '@/lib/types';
import {
  ShieldAlert,
  ShieldCheck,
  Lock,
  LayoutDashboard,
  Package,
  Truck,
  RotateCcw,
  Clock,
  Info,
} from 'lucide-react';

type PortalTab = 'dashboard' | 'products' | 'delivery-failures' | 'returns';

function maskCustomerName(name: string) {
  if (!name) return 'Customer';
  const parts = name.trim().split(/\s+/);
  return parts.map((p) => (p.length > 1 ? p[0] + '***' : p + '***')).join(' ');
}

function maskPhoneNumber(phone: string) {
  if (!phone || phone.length < 6) return '98******';
  return phone.slice(0, 2) + '****' + phone.slice(-4);
}

export default function SharedAccessPortalPage() {
  const params = useParams();
  const token = params?.token as string;

  const [link, setLink] = useState<SharedAccessLink | null | undefined>(undefined);
  const [passcodeEntered, setPasscodeEntered] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [passcodeError, setPasscodeError] = useState(false);
  const [activeTab, setActiveTab] = useState<PortalTab>('dashboard');

  useEffect(() => {
    if (!token) {
      setLink(null);
      return;
    }
    const found = db.getSharedAccessByToken(token);
    setLink(found || null);

    if (found) {
      // Determine default tab
      if (
        found.allowedPages.includes('dashboard') ||
        found.allowedPages.includes('DASHBOARD_OVERVIEW')
      ) {
        setActiveTab('dashboard');
      } else if (
        found.allowedPages.includes('products') ||
        found.allowedPages.includes('PRODUCT_PERFORMANCE')
      ) {
        setActiveTab('products');
      } else if (
        found.allowedPages.includes('delivery-failures') ||
        found.allowedPages.includes('RETURNS_FAILURES')
      ) {
        setActiveTab('delivery-failures');
      } else if (found.allowedPages.includes('returns')) {
        setActiveTab('returns');
      }

      // If no passcode required, unlock immediately and record view
      if (!found.passcode) {
        setIsUnlocked(true);
        db.recordSharedAccessAccess(token);
      }
    }
  }, [token]);

  if (link === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
          <p className="text-xs text-slate-400 font-mono">Verifying secure access link...</p>
        </div>
      </div>
    );
  }

  // Not found or revoked
  if (!link || !link.isActive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-md w-full text-center shadow-lg space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto border border-rose-200">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Access Link Not Found or Revoked</h1>
            <p className="text-xs text-slate-500 mt-1">
              This shared link is either invalid or has been revoked by Brand Bucket administrators.
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600">
            Please contact your Brand Bucket account manager for updated access.
          </div>
        </div>
      </div>
    );
  }

  // Expired
  const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();
  if (isExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-3xl border border-slate-200 p-8 max-w-md w-full text-center shadow-lg space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200">
            <Clock className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Shared Access Expired</h1>
            <p className="text-xs text-slate-500 mt-1">
              This shared link expired on {new Date(link.expiresAt!).toLocaleDateString()}.
            </p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl text-xs text-slate-600">
            Access to this operational dashboard has concluded. Contact Brand Bucket for a link extension.
          </div>
        </div>
      </div>
    );
  }

  // Passcode prompt
  if (link.passcode && !isUnlocked) {
    const handlePasscodeSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (passcodeEntered.trim() === link.passcode) {
        setIsUnlocked(true);
        setPasscodeError(false);
        db.recordSharedAccessAccess(token);
      } else {
        setPasscodeError(true);
      }
    };

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4">
        <div className="bg-slate-950 rounded-3xl border border-slate-800 p-8 max-w-md w-full text-center shadow-2xl space-y-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-500/10 text-blue-400 flex items-center justify-center mx-auto border border-blue-500/20">
            <Lock className="w-7 h-7" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-blue-400 tracking-wider uppercase">
              Brand Bucket Operational Portal
            </span>
            <h1 className="text-lg font-bold text-white mt-1">{link.name}</h1>
            <p className="text-xs text-slate-400 mt-1">
              This shared view is protected with a security passcode.
            </p>
          </div>

          <form onSubmit={handlePasscodeSubmit} className="space-y-4">
            <div>
              <input
                type="password"
                required
                autoFocus
                placeholder="Enter Access Passcode"
                value={passcodeEntered}
                onChange={(e) => {
                  setPasscodeEntered(e.target.value);
                  setPasscodeError(false);
                }}
                className="w-full text-center text-sm font-mono tracking-widest rounded-xl bg-slate-900 border border-slate-700 p-3 text-white placeholder-slate-500 focus:border-blue-500 focus:outline-hidden"
              />
              {passcodeError && (
                <p className="text-rose-400 text-xs mt-1.5 font-medium">Incorrect passcode. Please try again.</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow"
            >
              Unlock Dashboard
            </button>
          </form>

          <p className="text-[11px] text-slate-500">
            Authorized partner access only • Confidential &amp; Protected
          </p>
        </div>
      </div>
    );
  }

  // Load scoped data
  const isAllBrands = !link.brandScope || link.brandScope === 'ALL';
  const scopedBrandList = Array.isArray(link.brandScope) ? link.brandScope : link.brandFilter;

  const allOrders = db.getOrders();
  const allProducts = db.getProducts();
  const allDeliveryFailures = db.getDeliveryFailures();
  const allReturns = db.getReturns();

  const filteredOrders = allOrders.filter(
    (o) => (isAllBrands || scopedBrandList.includes(o.brandCode)) && !o.isMarketing
  );
  const filteredProducts = allProducts.filter(
    (p) => isAllBrands || scopedBrandList.includes(p.brandCode)
  );
  const filteredDeliveryFailures = allDeliveryFailures.filter(
    (df) => isAllBrands || scopedBrandList.includes(df.brandCode)
  );
  const filteredReturns = allReturns.filter(
    (r) => isAllBrands || scopedBrandList.includes(r.brandCode)
  );

  const totalOrders = filteredOrders.length;
  const failureCount = filteredDeliveryFailures.length;
  const returnCount = filteredReturns.length;
  const failureRate = totalOrders > 0 ? ((failureCount / totalOrders) * 100).toFixed(1) : '0.0';
  const returnRate = totalOrders > 0 ? ((returnCount / totalOrders) * 100).toFixed(1) : '0.0';

  const allowsDashboard =
    link.allowedPages.includes('dashboard') ||
    link.allowedPages.includes('DASHBOARD_OVERVIEW');
  const allowsProducts =
    link.allowedPages.includes('products') ||
    link.allowedPages.includes('PRODUCT_PERFORMANCE');
  const allowsFailures =
    link.allowedPages.includes('delivery-failures') ||
    link.allowedPages.includes('RETURNS_FAILURES');
  const allowsReturns =
    link.allowedPages.includes('returns') ||
    link.allowedPages.includes('RETURNS_FAILURES');

  const navigationTabs = [
    ...(allowsDashboard ? [{ id: 'dashboard' as PortalTab, label: 'Dashboard Overview', icon: LayoutDashboard }] : []),
    ...(allowsProducts ? [{ id: 'products' as PortalTab, label: 'Products & Performance', icon: Package }] : []),
    ...(allowsFailures ? [{ id: 'delivery-failures' as PortalTab, label: 'Delivery Failures', icon: Truck }] : []),
    ...(allowsReturns ? [{ id: 'returns' as PortalTab, label: 'Returns & Quality', icon: RotateCcw }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Top Banner Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-blue-600 flex items-center justify-center text-white font-black text-sm">
              BB
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-900 text-sm">Shared Operational View</span>
                <span className="rounded-md bg-emerald-50 text-emerald-800 text-[10px] font-bold px-2 py-0.5 border border-emerald-200">
                  Read Only
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {link.name} • {isAllBrands ? 'All Brands' : scopedBrandList.join(', ')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full border border-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Customer PII &amp; Financials Protected
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-2 overflow-x-auto border-t border-slate-100 py-2">
          {navigationTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && allowsDashboard && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Total Orders Processed
                </span>
                <div className="text-3xl font-black text-slate-900 mt-1">{totalOrders}</div>
                <div className="text-[11px] text-slate-500 mt-1">Direct-to-Consumer fulfillment</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Delivery Failure Rate
                </span>
                <div className="text-3xl font-black text-rose-600 mt-1">{failureRate}%</div>
                <div className="text-[11px] text-rose-700 mt-1">{failureCount} total courier failures</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Customer Return Rate
                </span>
                <div className="text-3xl font-black text-amber-600 mt-1">{returnRate}%</div>
                <div className="text-[11px] text-amber-700 mt-1">{returnCount} physical product returns</div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Active SKU Count
                </span>
                <div className="text-3xl font-black text-blue-600 mt-1">{filteredProducts.length}</div>
                <div className="text-[11px] text-blue-700 mt-1">Live catalog items in scope</div>
              </div>
            </div>

            {/* Product Performance Summary */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-slate-900 text-sm">Top Product Movement &amp; Velocity</h3>
                <span className="text-[11px] text-slate-400">Aggregated order volume by SKU</span>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {filteredProducts.slice(0, 6).map((p) => {
                  const productOrders = filteredOrders.filter((o) =>
                    o.items.some((i) => i.productId === p.id)
                  ).length;
                  return (
                    <div key={p.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <div className="font-bold text-slate-900">{p.name}</div>
                        <div className="text-[10px] text-slate-500">{p.category} • {p.brandCode}</div>
                      </div>
                      <div className="text-right">
                        <strong className="text-blue-600 font-bold text-sm">{productOrders}</strong>
                        <span className="text-slate-500 text-[11px] ml-1">orders</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRODUCTS */}
        {activeTab === 'products' && allowsProducts && (
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 flex items-center gap-2 text-xs text-blue-900">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <span>
                Commercial margins and internal procurement costs are excluded for partner privacy.
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4">Brand</th>
                      <th className="py-3 px-4">Category</th>
                      <th className="py-3 px-4">SKU</th>
                      <th className="py-3 px-4 text-center">Orders Count</th>
                      <th className="py-3 px-4 text-center">Returns Recorded</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {filteredProducts.map((p) => {
                      const pOrders = filteredOrders.filter((o) =>
                        o.items.some((i) => i.productId === p.id)
                      ).length;
                      const pReturns = filteredReturns.filter((r) => r.productName === p.name).length;

                      return (
                        <tr key={p.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-bold text-slate-900">{p.name}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700">
                              {p.brandCode}
                            </span>
                          </td>
                          <td className="py-3 px-4">{p.category}</td>
                          <td className="py-3 px-4 font-mono text-slate-500">{p.sku}</td>
                          <td className="py-3 px-4 text-center font-bold text-blue-600">{pOrders}</td>
                          <td className="py-3 px-4 text-center font-bold text-amber-600">{pReturns}</td>
                          <td className="py-3 px-4">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              Active
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: DELIVERY FAILURES */}
        {activeTab === 'delivery-failures' && allowsFailures && (
          <div className="space-y-4">
            <div className="p-3 bg-rose-50 rounded-xl border border-rose-200 flex items-center gap-2 text-xs text-rose-900">
              <ShieldCheck className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                Customer names and phone numbers are securely masked in compliance with privacy guidelines.
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-3 px-4">Failure Date</th>
                      <th className="py-3 px-4">Brand</th>
                      <th className="py-3 px-4">Customer Name</th>
                      <th className="py-3 px-4">Customer Phone</th>
                      <th className="py-3 px-4">Region / Valley</th>
                      <th className="py-3 px-4">Reason Category</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {filteredDeliveryFailures.map((df) => (
                      <tr key={df.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono text-slate-600">{df.dateBs || df.dateAd}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{df.brandCode}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{maskCustomerName(df.customerName)}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{maskPhoneNumber(df.customerPhone)}</td>
                        <td className="py-3 px-4">{df.valley} Valley</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            {df.reason}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            {df.status || 'REPORTED'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: RETURNS */}
        {activeTab === 'returns' && allowsReturns && (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-2 text-xs text-amber-900">
              <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Returns breakdown for advertising and quality control optimization. Customer PII is masked.
              </span>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                      <th className="py-3 px-4">Return Date</th>
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4">Brand</th>
                      <th className="py-3 px-4">Customer</th>
                      <th className="py-3 px-4">Phone</th>
                      <th className="py-3 px-4">Reason Category</th>
                      <th className="py-3 px-4">Resolution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                    {filteredReturns.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono text-slate-600">{r.dateBs || r.dateAd}</td>
                        <td className="py-3 px-4 font-bold text-slate-900">{r.productName}</td>
                        <td className="py-3 px-4 font-bold text-slate-800">{r.brandCode}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{maskCustomerName(r.customerName)}</td>
                        <td className="py-3 px-4 font-mono text-slate-600">{maskPhoneNumber(r.customerPhone)}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            {r.reasonCategory}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-700">{r.orderStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Watermark Footer */}
      <footer className="fixed bottom-0 inset-x-0 bg-slate-900/90 text-slate-400 backdrop-blur-xs border-t border-slate-800 py-2.5 px-4 text-center text-[11px] font-mono z-20">
        CONFIDENTIAL &amp; PROPRIETARY • Shared with <strong className="text-white">{link.name}</strong> • Brand Bucket Command Center
      </footer>
    </div>
  );
}
