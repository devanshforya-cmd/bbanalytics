'use client';

import Money from '@/components/common/Money';
import InfoTip from '@/components/common/InfoTip';
import { countsAsSale } from '@/lib/order-status';
import { productMetrics } from '@/lib/product-metrics';
import { subBrandName } from '@/lib/sub-brands';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import ProductActions from '@/components/products/ProductActions';
import CatalogEditor from '@/components/products/CatalogEditor';
import { isSellableCombo } from '@/lib/product-catalog';
import { Product, Combo, BrandCode, SecondaryOrder, Order, ReturnEntry, Retailer, Branch } from '@/lib/types';
import MobileBottomSheet from '@/components/common/MobileBottomSheet';
import { toast } from '@/components/common/Toast';
import {
  Package,
  Plus,
  Search,
  Filter,
  Sparkles,
  TrendingUp,
  Percent,
  Layers,
  ArrowUpRight,
  CheckCircle2,
  AlertCircle,
  Tag,
  Building2,
  ChevronRight,
  Boxes,
  BarChart3,
  Store,
  Eye,
  X,
  ExternalLink,
  ShieldAlert,
  RotateCcw,
  Clock,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import { canPerform } from '@/lib/permissions';
import EmptyState from '@/components/common/EmptyState';
import { suggestComboKeywords, suggestProductKeywords } from '@/lib/keyword-suggest';

/** Brand name for a code, so it is left out of suggested phrases. */
const brandNameOf = (brandCode?: string) => db.getBrands().find(item => item.code === brandCode)?.name;
function autoSuggestKeywords(name: string, brandCode?: string): string[] {
  return suggestProductKeywords(name, brandNameOf(brandCode));
}
function autoSuggestComboKeywords(name: string, brandCode?: string, productIds: string[] = []): string[] {
  const products = db.getProducts('ALL');
  return suggestComboKeywords(name, brandNameOf(brandCode), productIds.map(id => products.find(product => product.id === id)?.name || '').filter(Boolean));
}

export default function ProductsPage() {
  const [currentUser, setCurrentUser] = useState(() => db.getCurrentUser());
  const [products, setProducts] = useState<Product[]>([]);
  const [combos, setCombos] = useState<Combo[]>([]);
  const [secondaryOrders, setSecondaryOrders] = useState<SecondaryOrder[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [returns, setReturns] = useState<ReturnEntry[]>([]);
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBrandsList, setActiveBrandsList] = useState(() => db.getBrands('ACTIVE'));

  const [activeBrand, setActiveBrand] = useState<BrandCode>('ALL');
  const [activeTab, setActiveTab] = useState<'PRODUCTS' | 'ARCHIVED' | 'COMBOS'>('PRODUCTS');
  // Opened from a combo page: start on the Combos tab.
  useEffect(() => {
    try { if (new URLSearchParams(window.location.search).get('tab') === 'combos') setActiveTab('COMBOS'); } catch { /* no query */ }
  }, []);
  const [activeViewMode, setActiveViewMode] = useState<'OVERVIEW' | 'PERFORMANCE'>('OVERVIEW');
  const [searchQuery, setSearchQuery] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Bottom sheets & Quick performance modal
  const [isAddProductOpen, setIsAddProductOpen] = useState(false);
  const [isAddComboOpen, setIsAddComboOpen] = useState(false);
  const [selectedPerfProduct, setSelectedPerfProduct] = useState<Product | null>(null);

  // Add Product Form State (Fix 70b: no wholesalePrice, dtpPrice, costPrice; Fix 72a: extractorKeywords)
  const [newProd, setNewProd] = useState({
    name: '',
    alias: '',
    subBrandId: '',
    barcode: '',
    sku: '',
    brandCode: '' as BrandCode,
    category: 'Personal Care',
    mrp: 0,
    caseSize: 24,
    orderUnitMode: 'BOTH' as 'CASES' | 'PIECES' | 'BOTH',
    thresholdQty: 12,
    keywords: '',
    extractorKeywords: [] as string[],
  });

  // Add Combo Form State (Fix 72b & 72c: extractorKeywords & priceDetectionEnabled)
  const [newCombo, setNewCombo] = useState({
    name: '',
    sku: '',
    brandCode: '' as BrandCode,
    description: '',
    selectedProd1Id: '',
    qty1: 1,
    selectedProd2Id: '',
    qty2: 1,
    selectedProd3Id: '',
    qty3: 1,
    comboPrice: 0,
    extractorKeywords: [] as string[],
    priceDetectionEnabled: true,
  });

  const loadCatalog = () => {
    setCurrentUser(db.getCurrentUser());
    setProducts(db.getProducts());
    setCombos(db.getCombos());
    setSecondaryOrders(db.getSecondaryOrders());
    setOrders(db.getOrders());
    setReturns(db.getReturns());
    setRetailers(db.getRetailers());
    setBranches(db.getBranches());
    setActiveBrandsList(db.getBrands('ACTIVE'));
  };

  useEffect(() => {
    loadCatalog();
    window.addEventListener('bb-db-updated', loadCatalog);
    return () => window.removeEventListener('bb-db-updated', loadCatalog);
  }, []);

  useEffect(() => {
    setNewProd(value => activeBrandsList.some(brand => brand.code === value.brandCode) ? value : { ...value, brandCode: activeBrandsList[0]?.code || '' });
    setNewCombo(value => activeBrandsList.some(brand => brand.code === value.brandCode) ? value : { ...value, brandCode: activeBrandsList[0]?.code || '' });
  }, [activeBrandsList]);

  const brandName = (code: string) => db.getBrands().find(brand => brand.code === code)?.name || code;

  const triggerToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // The configured brand code is the exact catalogue identity.
  const assignedBrands = currentUser.assignedBrands || [];
  const hasBrandRestrictions = Boolean(assignedBrands.length > 0 && !assignedBrands.includes('ALL'));

  const matchingProducts = products.filter((p) => {
    if (hasBrandRestrictions) {
      const allowed =
        assignedBrands.includes(p.brandCode);
      if (!allowed) return false;
    }
    const matchesBrand =
      activeBrand === 'ALL' ||
      p.brandCode === activeBrand;
    const matchesSearch =
      !searchQuery ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesBrand && matchesSearch;
  });

  const activeProducts = matchingProducts.filter(product => product.active !== false);
  const archivedProducts = matchingProducts.filter(product => product.active === false);
  const filteredProducts = activeTab === 'ARCHIVED' ? archivedProducts : activeProducts;

  const filteredCombos = combos.filter((c) => {
    if (hasBrandRestrictions) {
      const allowed =
        assignedBrands.includes(c.brandCode);
      if (!allowed) return false;
    }
    const matchesBrand =
      activeBrand === 'ALL' ||
      c.brandCode === activeBrand;
    const matchesSearch =
      !searchQuery ||
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.sku.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesBrand && matchesSearch;
  });

  // Calculate Product Performance Metrics (Operational units and store counts only - Zero Tolerance)
  const getProductMetrics = (prod: Product) => {
    // One set of rules for every product view: combos count, cancelled orders and exchanges do not.
    const metrics = productMetrics(prod.id, { orders, secondaryOrders, combos, returns, feedback: [] });
    const secondaryCases = secondaryOrders
      .filter((order) => order.status !== 'CANCELLED')
      .reduce((sum, order) => sum + order.items.filter((item) => item.productId === prod.id).reduce((acc, item) => acc + (item.cases || 0), 0), 0);
    const { gtUnits, mtUnits } = metrics.b2b;
    const secondaryUnits = metrics.b2b.units;
    const onlineUnits = metrics.d2c.units;
    const totalUnitsSold = metrics.totalUnits;
    const storeCount = metrics.b2b.storeIds.size;
    const totalStoreCount = retailers.length + branches.length;
    const storePenetrationPct = totalStoreCount > 0 ? Math.min(100, Math.round((storeCount / totalStoreCount) * 100)) : 0;
    // Returns are measured against online units, the only sales they can come from.
    const returnRate = metrics.returns.ratePct;

    // Warehouse Stock Level
    const stock = prod.stockQty !== undefined ? prod.stockQty : 0;
    const isLowStock = stock <= (prod.thresholdQty || 10);

    const gtPct = totalUnitsSold > 0 ? Math.round((gtUnits / totalUnitsSold) * 100) : 0;
    const mtPct = totalUnitsSold > 0 ? Math.round((mtUnits / totalUnitsSold) * 100) : 0;
    const onlinePct = totalUnitsSold > 0 ? Math.round((onlineUnits / totalUnitsSold) * 100) : 0;

    return {
      totalUnitsSold,
      secondaryCases,
      secondaryUnits,
      onlineUnits,
      gtUnits,
      mtUnits,
      gtPct,
      mtPct,
      onlinePct,
      storeCount,
      totalStoreCount,
      storePenetrationPct,
      returnRate,
      stock,
      isLowStock,
    };
  };

  // Calculate Combo Kit Totals in Real-time for Add Combo Form
  const dynamicComboOriginalMrp = useMemo(() => {
    let total = 0;
    if (newCombo.selectedProd1Id) {
      const p1 = products.find((p) => p.id === newCombo.selectedProd1Id);
      if (p1) total += p1.mrp * (newCombo.qty1 || 1);
    }
    if (newCombo.selectedProd2Id) {
      const p2 = products.find((p) => p.id === newCombo.selectedProd2Id);
      if (p2) total += p2.mrp * (newCombo.qty2 || 1);
    }
    if (newCombo.selectedProd3Id) {
      const p3 = products.find((p) => p.id === newCombo.selectedProd3Id);
      if (p3) total += p3.mrp * (newCombo.qty3 || 1);
    }
    return total;
  }, [newCombo, products]);

  const dynamicComboSavingsPct = useMemo(() => {
    if (dynamicComboOriginalMrp <= 0) return 0;
    const diff = dynamicComboOriginalMrp - newCombo.comboPrice;
    return Math.max(0, Math.round((diff / dynamicComboOriginalMrp) * 1000) / 10);
  }, [dynamicComboOriginalMrp, newCombo.comboPrice]);

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProd.name || !newProd.sku) return;

    const brand = activeBrandsList.find(item => item.code === newProd.brandCode);
    if (!brand) { toast.error('Add or select an active brand in Settings first.'); return; }
    const mrpNum = Number(newProd.mrp) || 0;

    db.addProduct({
      name: newProd.name,
      alias: newProd.alias.trim() || undefined,
      subBrandId: newProd.subBrandId || undefined,
      barcode: newProd.barcode.trim() || undefined,
      sku: newProd.sku.toUpperCase(),
      brandCode: newProd.brandCode,
      brandId: brand.id,
      category: newProd.category,
      unitPrice: mrpNum,
      mrp: mrpNum,
      caseSize: Number(newProd.caseSize),
      orderUnitMode: newProd.orderUnitMode,
      thresholdQty: Number(newProd.thresholdQty),
      active: true,
      keywords: newProd.keywords
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean),
      extractorKeywords: newProd.extractorKeywords,
    });

    loadCatalog();
    setIsAddProductOpen(false);
    setActiveTab('PRODUCTS');
    const saved = await db.syncWithSupabase();
    if (saved.success) triggerToast(`Created new SKU: ${newProd.name} (${newProd.sku.toUpperCase()})`);
    else toast.error(`Product is pending sync. ${saved.message}`);
    setNewProd({
      name: '',
      alias: '',
      subBrandId: '',
      barcode: '',
      sku: '',
      brandCode: '',
      category: 'Personal Care',
      mrp: 0,
      caseSize: 24,
      orderUnitMode: 'BOTH',
      thresholdQty: 12,
      keywords: '',
      extractorKeywords: [],
    });
  };

  const handleCreateCombo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCombo.name || !newCombo.sku || !newCombo.selectedProd1Id) {
      toast.error('Please enter combo name, combo SKU, and at least 1 SKU item.');
      return;
    }

    if (!activeBrandsList.some(brand => brand.code === newCombo.brandCode)) { toast.error('Select an active brand first.'); return; }
    const selected = [newCombo.selectedProd1Id, newCombo.selectedProd2Id, newCombo.selectedProd3Id].filter(Boolean);
    if (selected.some(id => !products.some(p => p.id === id && p.brandCode === newCombo.brandCode && p.active !== false))) { toast.error('Choose active products from the selected brand.'); return; }
    const items = [];
    const componentProductIds: string[] = [];
    let originalMrp = 0;

    const p1 = products.find((p) => p.id === newCombo.selectedProd1Id);
    if (p1) {
      items.push({
        productId: p1.id,
        productName: p1.name,
        quantity: newCombo.qty1,
        mrp: p1.mrp,
      });
      componentProductIds.push(p1.id);
      originalMrp += p1.mrp * newCombo.qty1;
    }

    const p2 = products.find((p) => p.id === newCombo.selectedProd2Id);
    if (p2) {
      items.push({
        productId: p2.id,
        productName: p2.name,
        quantity: newCombo.qty2,
        mrp: p2.mrp,
      });
      componentProductIds.push(p2.id);
      originalMrp += p2.mrp * newCombo.qty2;
    }

    const p3 = products.find((p) => p.id === newCombo.selectedProd3Id);
    if (p3) {
      items.push({
        productId: p3.id,
        productName: p3.name,
        quantity: newCombo.qty3,
        mrp: p3.mrp,
      });
      componentProductIds.push(p3.id);
      originalMrp += p3.mrp * newCombo.qty3;
    }

    const price = Number(newCombo.comboPrice);
    const savingsPct = originalMrp > 0 ? ((originalMrp - price) / originalMrp) * 100 : 0;

    db.addCombo({
      name: newCombo.name,
      sku: newCombo.sku.toUpperCase(),
      brandCode: newCombo.brandCode,
      description: newCombo.description || 'Promotional combo bundle kit',
      items,
      componentProductIds,
      comboMrp: price,
      totalOriginalMrp: originalMrp,
      comboPrice: price,
      savingsPct: Math.round(savingsPct * 10) / 10,
      extractorKeywords: newCombo.extractorKeywords,
      priceDetectionEnabled: newCombo.priceDetectionEnabled,
      active: true,
      editHistory: [
        {
          timestamp: new Date().toISOString(),
          changedBy: currentUser.fullName || 'Admin',
          note: `Initial combo created with MRP Rs. ${price}`,
          previousMrp: price,
          newMrp: price,
        },
      ],
    });

    loadCatalog();
    setIsAddComboOpen(false);
    triggerToast(`Created promotional Combo: ${newCombo.name} (${newCombo.sku.toUpperCase()})`);
    setNewCombo({
      name: '',
      sku: '',
      brandCode: '',
      description: '',
      selectedProd1Id: '',
      qty1: 1,
      selectedProd2Id: '',
      qty2: 1,
      selectedProd3Id: '',
      qty3: 1,
      comboPrice: 0,
      extractorKeywords: [],
      priceDetectionEnabled: true,
    });
  };

  return (
    <PageGuard feature="products">
      <div className="space-y-6 pb-36 sm:pb-20">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <Package className="w-6 h-6 text-brand-600" />
              <span>Products, Combos &amp; Performance</span>
<InfoTip label="About this page">Master SKU catalog, D2C social promotional kits, warehouse inventory, and sales telemetry.</InfoTip></h1>
          </div>
          
        </div>

        {/* Action Buttons */}
        {canPerform(currentUser, 'products', 'CREATE') && (
          <div className="flex items-center gap-2 flex-wrap">
            {toastMessage && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-semibold shadow-xs animate-fade-in">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                <span>{toastMessage}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsAddComboOpen(true)}
              className="min-h-[44px] px-3.5 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-98 transition shadow-xs"
            >
              <Boxes className="w-4 h-4 text-purple-600" />
              <span>Create D2C Combo</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddProductOpen(true)}
              className="min-h-[44px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 active:scale-98 transition shadow-md shadow-blue-500/25 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-white" />
              <span>Add Single SKU</span>
            </button>
          </div>
        )}
      </div>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Active Brands</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{activeBrandsList.length}</div>
          <div className="text-[11px] text-slate-500 mt-1 truncate" title={activeBrandsList.map((b) => b.name).join(', ')}>
            {activeBrandsList.map((b) => b.name).join(', ') || 'No brands registered'}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-purple-200 bg-purple-50/20 p-4 shadow-xs">
          <div className="text-xs font-semibold text-purple-700">D2C &amp; Social Combos</div>
          <div className="text-2xl font-black text-slate-900 mt-1">{combos.filter(combo => isSellableCombo(combo, products)).length}</div>
          <div className="text-[11px] text-purple-600 mt-1">Instagram, TikTok &amp; Web (Not B2B)</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Active Catalog SKUs</div>
          <div className="text-2xl font-black text-blue-600 mt-1">{products.filter(product => product.active !== false).length}</div>
          <div className="text-[11px] text-slate-500 mt-1">Master retail products</div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
          <div className="text-xs font-semibold text-slate-500">Warehouse Stock</div>
          <div className="text-2xl font-black text-emerald-600 mt-1">
            {products.reduce((acc, p) => acc + (p.stockQty !== undefined ? p.stockQty : 0), 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Units available in depot</div>
        </div>
      </div>

      {/* Controls Bar: Search, Brand Filter, View Mode Toggle */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3 sm:p-4 shadow-xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Main Tabs: Standard SKUs vs Promotional Combos */}
          <div className="flex items-center rounded-xl bg-slate-100 p-1 w-full lg:w-auto">
            <button
              type="button"
              onClick={() => setActiveTab('PRODUCTS')}
              aria-pressed={activeTab === 'PRODUCTS'}
              className={`flex-1 lg:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition ${
                activeTab === 'PRODUCTS'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Active products ({activeProducts.length})
            </button>
            <button
              type="button"
              aria-pressed={activeTab === 'ARCHIVED'}
              onClick={() => setActiveTab('ARCHIVED')}
              className={`flex-1 lg:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition ${activeTab === 'ARCHIVED' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              Archived products ({archivedProducts.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('COMBOS')}
              className={`flex-1 lg:flex-initial px-4 py-2 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                activeTab === 'COMBOS'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-purple-700 hover:text-purple-900'
              }`}
            >
              <Boxes className="w-3.5 h-3.5" />
              <span>Promotional Combos ({filteredCombos.length})</span>
            </button>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full lg:w-auto">
            {/* View Mode Toggle: Overview vs Performance */}
            {activeTab !== 'COMBOS' && (
              <div className="flex items-center rounded-xl bg-slate-100 p-1 w-full sm:w-auto text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setActiveViewMode('OVERVIEW')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg transition ${
                    activeViewMode === 'OVERVIEW'
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Catalog MRP
                </button>
                <button
                  type="button"
                  onClick={() => setActiveViewMode('PERFORMANCE')}
                  className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-lg transition flex items-center justify-center gap-1.5 ${
                    activeViewMode === 'PERFORMANCE'
                      ? 'bg-brand-600 text-white shadow-xs font-bold'
                      : 'text-brand-700 hover:text-brand-900'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Sales &amp; Performance</span>
                </button>
              </div>
            )}

            {/* Search Box */}
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search SKU code, name, category…"
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>
        </div>

        {/* Brand Filter Pills (Dynamic from Database) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-1 pb-0.5 text-xs font-medium">
          <span className="text-slate-500 text-[11px] font-semibold mr-1 shrink-0">
            Brand:
          </span>
          {[
            { code: 'ALL', name: 'All Brands' },
            ...activeBrandsList.map((b) => ({ code: b.code, name: b.name })),
          ].map((brand) => (
            <button
              key={brand.code}
              onClick={() => setActiveBrand(brand.code as BrandCode)}
              className={`px-3 py-1.5 rounded-lg shrink-0 transition cursor-pointer ${
                activeBrand === brand.code
                  ? 'bg-slate-900 text-white font-bold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {brand.name}
            </button>
          ))}
        </div>
      </div>

      {/* Content View: Products Catalog */}
      {activeTab !== 'COMBOS' && (
        filteredProducts.length === 0 ? (
          <EmptyState
            type="generic"
            title={activeTab === 'ARCHIVED' ? 'No archived products' : 'No active products'}
            description={activeTab === 'ARCHIVED' ? 'Archived products appear here. Deleted products do not appear in either section.' : 'Add a product to start your catalogue, or adjust your search and brand filter.'}
          />
        ) : (
          <div className="space-y-3">
          {/* Mobile Cards Feed (< md) */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {filteredProducts.map((p) => {
              const m = getProductMetrics(p);
              return (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold">
                          {p.sku}
                        </span>
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700"
                        >
                          {brandName(p.brandCode)}
                        </span>
                      </div>
                      <h2 className="font-bold text-slate-900 text-sm mt-1">{p.name} {p.active === false && <span className="text-xs text-amber-700">Archived</span>}</h2>
                      {(p.alias || p.subBrandId) && <p className="text-[11px] text-slate-500">{[subBrandName(db.getBrands('ALL'), p.subBrandId), p.alias && `Short name: ${p.alias}`].filter(Boolean).join(' · ')}</p>}
                      <p className="text-xs text-slate-500">
                        {p.category} &bull; Case of {p.caseSize || 24}N
                      </p>
                    </div>

                    {/* Stock status badge */}
                    <div className="text-right shrink-0">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          m.isLowStock
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}
                      >
                        {m.stock} in stock
                      </span>
                    </div>
                  </div>

                  {/* Operational Telemetry Grid */}
                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-xl text-center text-xs border border-slate-100">
                    <div>
                      <div className="text-[10px] text-slate-500 font-semibold">
                        MRP (Catalog)
                      </div>
                      <div className="font-black text-emerald-700 mt-0.5 font-mono">
                        <Money>{p.mrp}</Money>
                      </div>
                    </div>
                    <div className="border-x border-slate-200">
                      <div className="text-[10px] text-brand-700 font-semibold">
                        Units Sold
                      </div>
                      <div className="font-black text-slate-900 mt-0.5 font-mono">
                        {m.totalUnitsSold.toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] text-blue-700 font-semibold">
                        Store Penetration
                      </div>
                      <div className="font-black text-blue-700 mt-0.5 font-mono">
                        {m.storePenetrationPct}%
                      </div>
                    </div>
                  </div>

                  {/* Action Footer */}
                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-xs">
                    <span className="text-slate-500 font-medium flex items-center gap-1 text-[11px]">
                      <Package className="w-3.5 h-3.5 text-slate-400" /> {p.category} ({p.caseSize || 24}u/box)
                    </span>

                    <div className="flex flex-wrap items-center gap-2">
                      <CatalogEditor item={p} kind="products" products={products} onChanged={loadCatalog} />
                      <ProductActions product={p} onChanged={loadCatalog} />
                      <button
                        type="button"
                        onClick={() => setSelectedPerfProduct(p)}
                        className="inline-flex items-center gap-1 text-slate-700 font-bold hover:text-brand-600 bg-slate-100 px-2.5 py-1 rounded-lg"
                      >
                        <BarChart3 className="w-3.5 h-3.5 text-brand-600" />
                        <span>Telemetry</span>
                      </button>

                      <Link
                        href={`/products/${p.id}`}
                        className="inline-flex items-center gap-1 text-brand-600 font-bold hover:text-brand-800"
                      >
                        <span>360 Intel</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Desktop Table (>= md) */}
          <div className="hidden md:block bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold ">
                  <th className="p-3.5">SKU &amp; Product Name</th>
                  <th className="p-3.5">Brand</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Case Size</th>
                  <th className="p-3.5 text-right">MRP (Catalog)</th>
                  <th className="p-3.5 text-center">Stock Level</th>
                  <th className="p-3.5 text-center">Performance</th>
                  <th className="p-3.5 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  const m = getProductMetrics(p);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="p-3.5">
                        <button
                          type="button"
                          onClick={() => setSelectedPerfProduct(p)}
                          className="font-bold text-slate-900 text-left hover:text-brand-600 transition"
                        >
                          {p.name} {p.active === false && <span className="text-xs text-amber-700">Archived</span>}
                        </button>
                        <div className="text-[11px] text-slate-500 mt-0.5"><span className="font-mono">{p.sku}</span>{p.alias && <> · Short name: <span className="font-medium text-slate-700">{p.alias}</span></>}</div>
                      </td>
                      <td className="p-3.5">
                        <span
                          className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700"
                        >
                          {brandName(p.brandCode)}
                        </span>
                        {subBrandName(db.getBrands('ALL'), p.subBrandId) && <div className="mt-1 text-[11px] font-medium text-slate-600">{subBrandName(db.getBrands('ALL'), p.subBrandId)}</div>}
                      </td>
                      <td className="p-3.5 text-slate-600">{p.category}</td>
                      <td className="p-3.5 text-slate-600 font-medium">
                        {p.caseSize || 24} units / box
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-emerald-700">
                        <Money>{p.mrp}</Money>
                      </td>
                      <td className="p-3.5 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold font-mono ${
                            m.isLowStock
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {m.stock}N
                        </span>
                      </td>
                      <td className="p-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => setSelectedPerfProduct(p)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-800 font-semibold text-[11px] transition shadow-2xs"
                        >
                          <BarChart3 className="w-3 h-3 text-brand-600" />
                          <span>{m.totalUnitsSold} Sold ({m.storePenetrationPct}%)</span>
                        </button>
                      </td>
                      <td className="p-3.5 text-center">
                        <CatalogEditor item={p} kind="products" products={products} onChanged={loadCatalog} />
                        <ProductActions product={p} onChanged={loadCatalog} />
                        <Link
                          href={`/products/${p.id}`}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-brand-50 hover:text-brand-700 font-semibold text-slate-700 transition-colors"
                        >
                          <span>360 Intel</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )
      )}

      {/* Content View: Promotional Combos */}
      {activeTab === 'COMBOS' && (
        filteredCombos.length === 0 ? (
          <EmptyState
            type="generic"
            title="No Promotional Combos Found"
            description="No combo bundles match your brand filter or search criteria."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCombos.map((c) => {
            const kitsStock = c.stockQty;
            const currentMrp = c.items.reduce((sum, part) => sum + (products.find(product => product.id === part.productId)?.mrp ?? part.mrp) * part.quantity, 0);
            const currentSavings = currentMrp > 0 ? Math.max(0, Math.round((1 - c.comboPrice / currentMrp) * 1000) / 10) : 0;
            const comboOrders = orders.filter(countsAsSale);
            const comboLines = comboOrders.flatMap(order => order.items).filter(item => item.productId === c.id && !item.isGift);
            const kitsSold = comboLines.reduce((sum, item) => sum + item.quantity, 0);
            const comboRevenue = comboLines.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);

            return (
              <div
                key={c.id}
                className="bg-white rounded-2xl border border-purple-200 p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-bold">
                        {c.sku}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {brandName(c.brandCode)}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-pink-100 text-pink-800 border border-pink-200">
                        D2C / Social Media
                      </span>
                    </div>
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                      Save {currentSavings}%
                    </span>
                  </div>

                  <h2 className="font-bold text-slate-900 text-base mt-2">
                    <Link href={`/products/combo/${encodeURIComponent(c.id)}`} className="hover:text-purple-700 hover:underline">{c.name}</Link>
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2">{c.description}</p>
                  {!isSellableCombo(c, products) && <p className="mt-2 text-xs font-semibold text-amber-700">Unavailable for new orders: a component is missing or archived.</p>}

                  {/* Items included in Kit */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-2">
                    <span className="text-[11px] font-bold text-slate-500 ">
                      Kit Contents ({c.items.length} Products):
                    </span>
                    <div className="space-y-1.5">
                      {c.items.map((item, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs bg-slate-50 p-2 rounded-lg"
                        >
                          <span className="font-medium text-slate-800 truncate max-w-[200px]">
                            {item.quantity}x {item.productName}
                          </span>
                          <span className="text-slate-500 font-mono">MRP {products.find(product => product.id === item.productId)?.mrp ?? item.mrp}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Extractor Keywords & Price Collapse badge (Fix 72) */}
                  {((c.extractorKeywords && c.extractorKeywords.length > 0) || c.priceDetectionEnabled) && (
                    <div className="mt-3 pt-2.5 border-t border-slate-100 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-slate-500 text-[10px]">
                          Extractor Auto-Match:
                        </span>
                        {c.priceDetectionEnabled && (
                          <span className="px-1.5 py-0.5 rounded bg-purple-100 text-purple-800 font-bold text-[10px]">
                            Price suggestion (Rs. {c.comboPrice})
                          </span>
                        )}
                      </div>
                      {c.extractorKeywords && c.extractorKeywords.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {c.extractorKeywords.map((k, ki) => (
                            <span
                              key={ki}
                              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-mono"
                            >
                              #{k}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Combo Performance Telemetry Strip */}
                  <div className="mt-3 p-2.5 rounded-xl bg-purple-50/60 border border-purple-100 grid grid-cols-3 gap-2 text-center text-[11px]">
                    <div>
                      <span className="text-slate-500 text-[10px] font-semibold">
                        Stock Kits
                      </span>
                      <div className="font-bold text-slate-800 mt-0.5 font-mono">{kitsStock === undefined ? 'Not recorded' : `${kitsStock} kits`}</div>
                    </div>
                    <div className="border-x border-purple-200/60">
                      <span className="text-slate-500 text-[10px] font-semibold">
                        Kits sold
                      </span>
                      <div className="font-bold text-purple-700 mt-0.5 font-mono">{kitsSold}</div>
                    </div>
                    <div>
                      <span className="text-slate-500 text-[10px] font-semibold">
                        Discount
                      </span>
                      <div className="font-bold text-emerald-700 mt-0.5 font-mono">
                        Save {currentSavings}%
                      </div>
                    </div>
                  </div>
                </div>

                {/* Price & Channel Pill */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-500 line-through mr-2 font-mono">
                      <Money>{currentMrp.toFixed(2)}</Money>
                    </span>
                    <span className="text-lg font-black text-purple-700 font-mono">
                      <Money>{c.comboPrice}</Money>
                    </span>
                  </div>
                  <div className="text-right">
                    <Link href={`/products/combo/${encodeURIComponent(c.id)}`} className="mr-2 text-xs font-bold text-purple-700 hover:underline">Full details</Link>
                    <span className="inline-block text-[11px] text-purple-800 font-bold bg-purple-100 px-2.5 py-0.5 rounded-md border border-purple-200">
                      D2C / Online (Not B2B)
                    </span>
                    <div className="text-[10px] text-slate-500">Instagram, TikTok &amp; Web</div>
                  </div>
                </div>
                <CatalogEditor item={c} kind="combos" products={products} onChanged={loadCatalog} />
              </div>
            );
          })}
        </div>
        )
      )}

      {/* Quick Product Performance Drawer / Modal */}
      {selectedPerfProduct && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setSelectedPerfProduct(null)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-full sm:w-[480px] max-w-[480px] bg-white shadow-2xl flex flex-col border-l border-slate-200 z-50">
              {/* Drawer Header */}
              <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-brand-100 text-brand-800">
                      {brandName(selectedPerfProduct.brandCode)}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-500">
                      {selectedPerfProduct.sku}
                    </span>
                  </div>
                  <h2 className="text-lg font-black text-slate-900 mt-1">
                    {selectedPerfProduct.name}
                  </h2>
                  <p className="text-xs text-slate-500">
                    {selectedPerfProduct.category} &bull; Case size {selectedPerfProduct.caseSize || 24} units &bull; MRP <Money>{selectedPerfProduct.mrp}</Money>
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedPerfProduct(null)}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-200 transition"
                  aria-label="Close"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Drawer Body: Performance Telemetry */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5 text-xs">
                {(() => {
                  const m = getProductMetrics(selectedPerfProduct);
                  const matchingOrders = secondaryOrders.filter((o) => o.status !== 'CANCELLED' && o.items.some((item) => item.productId === selectedPerfProduct.id));

                  return (
                    <>
                      {/* 4 Performance KPI Cards */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3.5 rounded-2xl bg-brand-50 border border-brand-200 space-y-1">
                          <span className="text-[10px] font-bold text-brand-700">
                            Units sold
                          </span>
                          <div className="text-2xl font-black text-brand-950 font-mono">
                            {m.totalUnitsSold.toLocaleString()}{' '}
                            <span className="text-xs font-normal text-brand-700">units</span>
                          </div>
                          <div className="text-[11px] text-slate-500 font-medium">
                            {m.onlineUnits.toLocaleString()} online, {m.secondaryUnits.toLocaleString()} in stores
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 space-y-1">
                          <span className="text-[10px] font-bold text-blue-700">
                            Store Penetration
                          </span>
                          <div className="text-2xl font-black text-blue-950 font-mono">
                            {m.storePenetrationPct}%
                          </div>
                          <div className="text-[11px] text-blue-700 font-medium">
                            {m.storeCount} of {m.totalStoreCount} active beat outlets stock
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 space-y-1">
                          <span className="text-[10px] font-bold text-amber-700">
                            Warehouse Stock
                          </span>
                          <div className="text-2xl font-black text-amber-950 font-mono">
                            {m.stock} <span className="text-xs font-normal text-amber-700">units</span>
                          </div>
                          <div className="text-[11px] text-amber-800 font-semibold">
                            {m.isLowStock
                              ? `Below threshold (${selectedPerfProduct.thresholdQty} units)`
                              : 'Sufficient beat buffer'}
                          </div>
                        </div>

                        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-1">
                          <span className="text-[10px] font-bold text-emerald-700">
                            Quality Return Rate
                          </span>
                          <div className="text-2xl font-black text-emerald-950 font-mono">
                            {m.returnRate}%
                          </div>
                          <div className="text-[11px] text-emerald-700 font-medium">
                            Operational defect baseline
                          </div>
                        </div>
                      </div>

                      {/* Channel Sales Velocity Split */}
                      <div className="p-4 rounded-2xl bg-white border border-slate-200 space-y-3">
                        <span className="text-xs font-bold text-slate-800 ">
                          Sales Channel Velocity
                        </span>
                        {m.totalUnitsSold === 0 ? (
                          <div className="py-4 text-center text-xs text-slate-500">
                            No secondary or online orders recorded for this product yet.
                          </div>
                        ) : (
                          <div className="space-y-2 text-xs">
                            <div>
                              <div className="flex justify-between font-semibold text-slate-700 mb-1">
                                <span>General Trade (Kiranas / Pharmacies)</span>
                                <span className="font-mono">{m.gtPct}% ({m.gtUnits} units)</span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-brand-600 rounded-full" style={{ width: `${m.gtPct}%` }} />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between font-semibold text-slate-700 mb-1">
                                <span>Modern Trade (Supermarkets &amp; Chains)</span>
                                <span className="font-mono">{m.mtPct}% ({m.mtUnits} units)</span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-blue-600 rounded-full" style={{ width: `${m.mtPct}%` }} />
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between font-semibold text-slate-700 mb-1">
                                <span>D2C Online &amp; Social Orders</span>
                                <span className="font-mono">{m.onlinePct}% ({m.onlineUnits} units)</span>
                              </div>
                              <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-full bg-purple-600 rounded-full" style={{ width: `${m.onlinePct}%` }} />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Recent Secondary Store Bookings */}
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-slate-800 ">
                          Recent Secondary Orders Booked:
                        </span>
                        {matchingOrders.length === 0 ? (
                          <div className="p-4 text-center text-slate-500 bg-slate-50 rounded-xl">
                            No secondary store bookings logged yet.
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {matchingOrders.slice(0, 3).map((ord) => (
                              <div
                                key={ord.id}
                                className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between"
                              >
                                <div>
                                  <div className="font-bold text-slate-900">{ord.storeName}</div>
                                  <div className="text-[11px] text-slate-500">
                                    By {ord.officerName} &bull; {ord.orderDateBs}
                                  </div>
                                </div>
                                <div className="text-right font-mono">
                                  <div className="font-bold text-slate-800">
                                    {ord.totalUnits} units
                                  </div>
                                  <div className="text-[10px] text-emerald-600 font-semibold">
                                    {ord.status}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Deep Link to 360 Intel */}
                      <div className="pt-2">
                        <Link
                          href={`/products/${selectedPerfProduct.id}`}
                          className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow flex items-center justify-center gap-2 transition"
                        >
                          <span>Open Dedicated 360 Intel Page</span>
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Single Product Drawer */}
      <MobileBottomSheet
        isOpen={isAddProductOpen}
        onClose={() => setIsAddProductOpen(false)}
        title="Add New Product SKU"
        subtitle="Provision a new SKU with master wholesale pricing and warehouse buffer stock"
      >
        <form onSubmit={handleCreateProduct} className="space-y-4">
          <div>
            <label htmlFor="products-product-full-name" className="block text-xs font-bold text-slate-700 mb-1">
              Product Full Name *
            </label>
            <input id="products-product-full-name"
              type="text"
              value={newProd.name}
              onChange={(e) => setNewProd({ ...newProd, name: e.target.value })}
              placeholder="Product name and size"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-brand-500"
              required
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="products-short-name" className="block text-xs font-bold text-slate-700 mb-1">Short name</label>
              <input id="products-short-name" type="text" maxLength={60} value={newProd.alias}
                onChange={(e) => setNewProd({ ...newProd, alias: e.target.value })} placeholder="Shown to field staff, e.g. Aqua roll-on"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-medium" />
            </div>
            <div>
              <label htmlFor="products-barcode" className="block text-xs font-bold text-slate-700 mb-1">Barcode</label>
              <input id="products-barcode" type="text" inputMode="numeric" value={newProd.barcode}
                onChange={(e) => setNewProd({ ...newProd, barcode: e.target.value })} placeholder="EAN on the pack (optional)"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-mono font-medium" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="products-sku-code" className="block text-xs font-bold text-slate-700 mb-1">
                SKU Code *
              </label>
              <input id="products-sku-code"
                type="text"
                value={newProd.sku}
                onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })}
                placeholder="FOR-SRM-030"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-mono font-medium"
                required
              />
            </div>
            <div>
              <label htmlFor="products-brand" className="block text-xs font-bold text-slate-700 mb-1">
                Brand *
              </label>
              <select id="products-brand"
                value={newProd.brandCode}
                onChange={(e) =>
                  setNewProd({ ...newProd, brandCode: e.target.value as BrandCode, subBrandId: '' })
                }
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs font-medium bg-white"
              >
                {activeBrandsList.length > 0 ? (
                  activeBrandsList.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))
                ) : (
                  <option value="ALL">No brands configured (Add in Settings)</option>
                )}
              </select>
            </div>
            {(() => {
              const subs = (activeBrandsList.find((b) => b.code === newProd.brandCode)?.subBrands || []).filter((sub) => sub.isActive);
              return subs.length ? (
                <div className="col-span-2">
                  <label htmlFor="products-sub-brand" className="block text-xs font-bold text-slate-700 mb-1">Sub-brand</label>
                  <select id="products-sub-brand" value={newProd.subBrandId} onChange={(e) => setNewProd({ ...newProd, subBrandId: e.target.value })}
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs font-medium bg-white">
                    <option value="">None</option>
                    {subs.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                  </select>
                </div>
              ) : null;
            })()}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Category
              </label>
              <input aria-label="Category"
                type="text"
                value={newProd.category}
                onChange={(e) => setNewProd({ ...newProd, category: e.target.value })}
                placeholder="Personal Care"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Case Box Units (Pcs)
              </label>
              <input aria-label="Case Box Units (Pcs)"
                type="number"
                value={newProd.caseSize}
                onChange={(e) => setNewProd({ ...newProd, caseSize: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium font-mono"
                required
              />
            </div>
          </div>

          {/* Order Unit Mode (Cases, Pieces, or Both) */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
            <label className="block text-xs font-bold text-slate-700 ">
              Order Taking Unit (Offline Sales)
            </label>
            <p className="text-[11px] text-slate-500">
              Control how sales officers take orders in the field for this SKU.
            </p>
            <div className="flex items-center gap-4 pt-1">
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="orderUnitMode"
                  checked={newProd.orderUnitMode === 'CASES'}
                  onChange={() => setNewProd({ ...newProd, orderUnitMode: 'CASES' })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Cases Only</span>
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="orderUnitMode"
                  checked={newProd.orderUnitMode === 'PIECES'}
                  onChange={() => setNewProd({ ...newProd, orderUnitMode: 'PIECES' })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Pieces Only</span>
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="radio"
                  name="orderUnitMode"
                  checked={newProd.orderUnitMode === 'BOTH'}
                  onChange={() => setNewProd({ ...newProd, orderUnitMode: 'BOTH' })}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Both (Cases &amp; Pieces)</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="products-mrp-catalog-price" className="block text-xs font-bold text-slate-700 mb-1">
                MRP (Catalog Price) *
              </label>
              <input id="products-mrp-catalog-price"
                type="number"
                value={newProd.mrp}
                onChange={(e) => setNewProd({ ...newProd, mrp: Number(e.target.value) })}
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-mono font-bold text-emerald-700 focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>
            <div>
              <label htmlFor="products-threshold-alert-qty" className="block text-xs font-bold text-slate-700 mb-1">
                Threshold Alert Qty
              </label>
              <input id="products-threshold-alert-qty"
                type="number"
                value={newProd.thresholdQty}
                onChange={(e) =>
                  setNewProd({ ...newProd, thresholdQty: Number(e.target.value) })
                }
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-medium font-mono focus:ring-2 focus:ring-brand-500"
              />
            </div>
          </div>

          {/* Extractor Keywords Tag Editor (Fix 72a) */}
          <div className="p-3.5 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-blue-950 ">
                  Extractor Keywords (WhatsApp Matching)
                </label>
                <p className="text-[10px] text-blue-700">
                  Nicknames, abbreviations, or phrases customers use in WhatsApp orders
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!newProd.name) {
                    toast.error('Please enter a product name first.');
                    return;
                  }
                  const suggested = autoSuggestKeywords(newProd.name, newProd.brandCode);
                  const combined = Array.from(new Set([...newProd.extractorKeywords, ...suggested]));
                  setNewProd({ ...newProd, extractorKeywords: combined });
                  toast.success(`${suggested.filter(word => !newProd.extractorKeywords.includes(word)).length} phrases added`, 'Includes common misspellings. Remove any that could mean another product.');
                }}
                className="px-2.5 py-1 bg-white hover:bg-blue-100 border border-blue-300 text-blue-700 rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-blue-600" />
                Auto-Suggest
              </button>
            </div>

            {/* Keyword tags */}
            {newProd.extractorKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {newProd.extractorKeywords.map((kw, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-900 border border-blue-200 rounded-md text-[11px] font-medium"
                  >
                    {kw}
                    <button
                      type="button"
                      onClick={() => {
                        setNewProd({
                          ...newProd,
                          extractorKeywords: newProd.extractorKeywords.filter((_, i) => i !== idx),
                        });
                      }}
                      className="hover:text-red-600 p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Add keyword manual input */}
            <div className="flex gap-2">
              <input
                type="text"
                id="manual-prod-kw-input"
                placeholder="Type keyword and hit enter (e.g. 'peach rollon')…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const input = e.currentTarget;
                    const val = input.value.trim().toLowerCase();
                    if (val && !newProd.extractorKeywords.includes(val)) {
                      setNewProd({
                        ...newProd,
                        extractorKeywords: [...newProd.extractorKeywords, val],
                      });
                      input.value = '';
                    }
                  }
                }}
                className="flex-1 px-3 py-1.5 border border-blue-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('manual-prod-kw-input') as HTMLInputElement;
                  if (input && input.value.trim()) {
                    const val = input.value.trim().toLowerCase();
                    if (!newProd.extractorKeywords.includes(val)) {
                      setNewProd({
                        ...newProd,
                        extractorKeywords: [...newProd.extractorKeywords, val],
                      });
                      input.value = '';
                    }
                  }
                }}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full min-h-[48px] py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md active:scale-98 transition cursor-pointer"
          >
            Confirm &amp; Add SKU to Master
          </button>
        </form>
      </MobileBottomSheet>

      {/* Create Promotional Combo Drawer */}
      <MobileBottomSheet
        isOpen={isAddComboOpen}
        onClose={() => setIsAddComboOpen(false)}
        title="Create Promotional Combo Kit"
        subtitle="Bundle 2+ SKUs with promotional consumer discounts for beat distribution"
      >
        <form onSubmit={handleCreateCombo} className="space-y-4">
          <div>
            <label htmlFor="products-combo-bundle-name" className="block text-xs font-bold text-slate-700 mb-1">
              Combo Bundle Name *
            </label>
            <input id="products-combo-bundle-name"
              type="text"
              value={newCombo.name}
              onChange={(e) => setNewCombo({ ...newCombo, name: e.target.value })}
              placeholder="Bundle name"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-medium"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="products-combo-sku" className="block text-xs font-bold text-slate-700 mb-1">
                Combo SKU *
              </label>
              <input id="products-combo-sku"
                type="text"
                value={newCombo.sku}
                onChange={(e) => setNewCombo({ ...newCombo, sku: e.target.value })}
                placeholder="CMB-FOR-02"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-mono font-medium"
                required
              />
            </div>
            <div>
              <label htmlFor="products-brand-2" className="block text-xs font-bold text-slate-700 mb-1">
                Brand *
              </label>
              <select id="products-brand-2"
                value={newCombo.brandCode}
                onChange={(e) =>
                  setNewCombo({ ...newCombo, brandCode: e.target.value as BrandCode })
                }
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-xs font-medium bg-white"
              >
                {activeBrandsList.length > 0 ? (
                  activeBrandsList.map((b) => (
                    <option key={b.code} value={b.code}>
                      {b.name}
                    </option>
                  ))
                ) : (
                  <option value="ALL">No brands configured (Add in Settings)</option>
                )}
              </select>
            </div>
          </div>

          {/* Primary Item 1 */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-[11px] font-bold text-slate-700 ">Item #1 (Required):</span>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={newCombo.selectedProd1Id}
                onChange={(e) => setNewCombo({ ...newCombo, selectedProd1Id: e.target.value })}
                className="col-span-2 px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white"
                required
              >
                <option value="">Select SKU #1</option>
                {products.filter(p => p.brandCode === newCombo.brandCode && p.active !== false).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (MRP {p.mrp})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={newCombo.qty1}
                onChange={(e) => setNewCombo({ ...newCombo, qty1: Number(e.target.value) })}
                className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono text-center font-bold"
                placeholder="Qty"
                required
              />
            </div>
          </div>

          {/* Item 2 */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-[11px] font-bold text-slate-700 ">Item #2 (Optional):</span>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={newCombo.selectedProd2Id}
                onChange={(e) => setNewCombo({ ...newCombo, selectedProd2Id: e.target.value })}
                className="col-span-2 px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white"
              >
                <option value="">Select SKU #2 (Optional)</option>
                {products.filter(p => p.brandCode === newCombo.brandCode && p.active !== false).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (MRP {p.mrp})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={newCombo.qty2}
                onChange={(e) => setNewCombo({ ...newCombo, qty2: Number(e.target.value) })}
                className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono text-center font-bold"
                placeholder="Qty"
              />
            </div>
          </div>

          {/* Item 3 */}
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <span className="text-[11px] font-bold text-slate-700 ">Item #3 (Optional):</span>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={newCombo.selectedProd3Id}
                onChange={(e) => setNewCombo({ ...newCombo, selectedProd3Id: e.target.value })}
                className="col-span-2 px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-medium bg-white"
              >
                <option value="">Select SKU #3 (Optional)</option>
                {products.filter(p => p.brandCode === newCombo.brandCode && p.active !== false).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (MRP {p.mrp})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                value={newCombo.qty3}
                onChange={(e) => setNewCombo({ ...newCombo, qty3: Number(e.target.value) })}
                className="px-2.5 py-2 border border-slate-300 rounded-lg text-xs font-mono text-center font-bold"
                placeholder="Qty"
              />
            </div>
          </div>

          {/* Dynamic Auto-Calculated Summary Box */}
          <div className="p-3.5 bg-purple-50 rounded-2xl border border-purple-200 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold text-purple-900">
              <span>Total Original Individual MRP:</span>
              <span className="font-mono text-sm"><Money>{dynamicComboOriginalMrp}</Money></span>
            </div>
            <div className="flex items-center justify-between text-xs font-semibold text-emerald-800">
              <span>Consumer Discount Spread:</span>
              <span className="font-mono">
                {dynamicComboSavingsPct}% (Save NPR{' '}
                {Math.max(0, dynamicComboOriginalMrp - newCombo.comboPrice)})
              </span>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Final Bundled Combo Price (NPR) *
            </label>
            <input aria-label="Final Bundled Combo Price (NPR)"
              type="number"
              value={newCombo.comboPrice}
              onChange={(e) => setNewCombo({ ...newCombo, comboPrice: Number(e.target.value) })}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-xs font-bold font-mono text-purple-700"
              required
            />
          </div>

          {/* Extractor Keywords Tag Editor (Fix 72a & 72b) */}
          <div className="p-3.5 bg-purple-50/60 border border-purple-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-bold text-purple-950 ">
                  Combo Extractor Keywords
                </label>
                <p className="text-[10px] text-purple-700">
                  Nicknames or phrases used by customers to refer to this combo bundle
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!newCombo.name) {
                    toast.error('Please enter a combo bundle name first.');
                    return;
                  }
                  const suggested = autoSuggestComboKeywords(newCombo.name, newCombo.brandCode, [newCombo.selectedProd1Id, newCombo.selectedProd2Id, newCombo.selectedProd3Id].filter(Boolean));
                  const combined = Array.from(new Set([...newCombo.extractorKeywords, ...suggested]));
                  setNewCombo({ ...newCombo, extractorKeywords: combined });
                  toast.success(`${suggested.filter(word => !newCombo.extractorKeywords.includes(word)).length} phrases added`, 'Includes common misspellings. Remove any that could mean another combo.');
                }}
                className="px-2.5 py-1 bg-white hover:bg-purple-100 border border-purple-300 text-purple-700 rounded-lg text-[11px] font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
              >
                <Sparkles className="w-3 h-3 text-purple-600" />
                Auto-Suggest
              </button>
            </div>

            {/* Keyword tags */}
            {newCombo.extractorKeywords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {newCombo.extractorKeywords.map((kw, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-900 border border-purple-200 rounded-md text-[11px] font-medium"
                  >
                    {kw}
                    <button
                      type="button"
                      onClick={() => {
                        setNewCombo({
                          ...newCombo,
                          extractorKeywords: newCombo.extractorKeywords.filter((_, i) => i !== idx),
                        });
                      }}
                      className="hover:text-red-600 p-0.5"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Add keyword manual input */}
            <div className="flex gap-2">
              <input
                type="text"
                id="manual-combo-kw-input"
                placeholder="Type combo keyword and hit enter (e.g. 'rescue kit', 'festive pack')…"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const input = e.currentTarget;
                    const val = input.value.trim().toLowerCase();
                    if (val && !newCombo.extractorKeywords.includes(val)) {
                      setNewCombo({
                        ...newCombo,
                        extractorKeywords: [...newCombo.extractorKeywords, val],
                      });
                      input.value = '';
                    }
                  }
                }}
                className="flex-1 px-3 py-1.5 border border-purple-200 rounded-lg text-xs bg-white focus:ring-1 focus:ring-purple-500"
              />
              <button
                type="button"
                onClick={() => {
                  const input = document.getElementById('manual-combo-kw-input') as HTMLInputElement;
                  if (input && input.value.trim()) {
                    const val = input.value.trim().toLowerCase();
                    if (!newCombo.extractorKeywords.includes(val)) {
                      setNewCombo({
                        ...newCombo,
                        extractorKeywords: [...newCombo.extractorKeywords, val],
                      });
                      input.value = '';
                    }
                  }
                }}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-semibold cursor-pointer"
              >
                Add
              </button>
            </div>
          </div>

          {/* Price-Based Collapse Toggle (Fix 72c) */}
          <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl flex items-start gap-3">
            <input
              type="checkbox"
              id="priceDetectionEnabled"
              checked={newCombo.priceDetectionEnabled}
              onChange={(e) => setNewCombo({ ...newCombo, priceDetectionEnabled: e.target.checked })}
              className="w-4 h-4 text-purple-600 rounded mt-0.5 border-slate-300 focus:ring-purple-500 cursor-pointer"
            />
            <label htmlFor="priceDetectionEnabled" className="text-xs text-purple-950 font-medium cursor-pointer">
              <span className="font-bold block text-purple-900">Suggest based on components and price</span>
              Show a suggestion when the message names these components and states <span className="font-mono font-bold"><Money>{newCombo.comboPrice}</Money></span>. The extractor keeps the products separate unless you select the combo.
            </label>
          </div>

          <div>
            <label htmlFor="products-bundle-description" className="block text-xs font-bold text-slate-700 mb-1">
              Bundle Description
            </label>
            <textarea id="products-bundle-description"
              rows={2}
              value={newCombo.description}
              onChange={(e) => setNewCombo({ ...newCombo, description: e.target.value })}
              placeholder="e.g. Special festive promo kit for premium cosmetics counters"
              className="w-full px-3.5 py-2 border border-slate-300 rounded-xl text-xs font-medium"
            />
          </div>

          <button
            type="submit"
            className="w-full min-h-[48px] py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs rounded-xl shadow-md active:scale-98 transition"
          >
            Create &amp; Publish Combo Kit
          </button>
        </form>
      </MobileBottomSheet>
    </div>
    </PageGuard>
  );
}
