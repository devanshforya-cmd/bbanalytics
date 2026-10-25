'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db/db-service';
import { Customer, Product, Order, Cheque, Retailer, Branch } from '@/lib/types';
import { getSessionUser } from '@/lib/auth';
import { canAccessBrand, getAssignedBrandCodes, getScope, hasAccess } from '@/lib/permissions';
import {
  Search,
  X,
  User,
  Store,
  Package,
  ShoppingCart,
  CreditCard,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface StoreItem {
  id: string;
  name: string;
  type: string;
  location: string;
  officerName: string;
}

type BadgeVariant = 'green' | 'amber' | 'red' | 'blue' | 'purple' | 'slate';

interface FlatResultItem {
  id: string;
  category: 'CUSTOMERS' | 'STORES' | 'PRODUCTS' | 'ORDERS' | 'CHEQUES';
  title: string;
  subtitle: string;
  metaBadge?: {
    text: string;
    variant: BadgeVariant;
  };
  extraInfo?: string;
  url: string;
}

export default function GlobalSearchModal({ isOpen, onClose }: GlobalSearchModalProps) {
  const currentUser = getSessionUser() || db.getCurrentUser();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Focus input whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Load datasets once on open
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [stores, setStores] = useState<StoreItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [cheques, setCheques] = useState<Cheque[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    const assigned = getAssignedBrandCodes(currentUser);
    const hasBrandRestriction = !assigned.includes('ALL');
    setCustomers(hasAccess(currentUser, 'customers')
      ? db.getCustomers().filter((customer) =>
        !hasBrandRestriction || (customer.brandsPurchased || []).some((code) => canAccessBrand(currentUser, code))
      )
      : []);

    // Unified stores from Retailers and Branches
    const retailers: StoreItem[] = (hasAccess(currentUser, 'stores') ? db.getRetailers() : [])
      .filter((r) => !hasBrandRestriction || ((r as any).brandsStocked || []).some((code: string) => canAccessBrand(currentUser, code)))
      .map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type || 'Retailer',
      location: r.area || r.city || 'Kathmandu',
      officerName: r.assignedOfficerName || 'Assigned Officer',
    }));
    const branches: StoreItem[] = (hasAccess(currentUser, 'distributors') ? db.getBranches() : [])
      .filter((b) => !hasBrandRestriction || (b.brandsAvailable || []).some((code) => canAccessBrand(currentUser, code)))
      .map((b) => ({
      id: b.id,
      name: b.name,
      type: 'Branch',
      location: b.address || 'Kathmandu',
      officerName: b.assignedOfficerName || 'Assigned Officer',
    }));
    setStores([...retailers, ...branches]);

    setProducts(hasAccess(currentUser, 'products')
      ? db.getProducts().filter((p) => canAccessBrand(currentUser, p.brandCode))
      : []);
    setOrders(hasAccess(currentUser, 'orderflow')
      ? db.getOrders().filter((o) => canAccessBrand(currentUser, o.brandCode))
      : []);
    setCheques(hasAccess(currentUser, 'cheque_tracker')
      ? db.getCheques().filter((c) =>
        (!hasBrandRestriction || (c.brandCodes || []).some((code) => canAccessBrand(currentUser, code))) &&
        (getScope(currentUser, 'cheque_tracker') !== 'OWN' || c.officerId === currentUser.id)
      )
      : []);
  }, [currentUser.id, isOpen]);

  // Filtered categorized results
  const categorizedResults = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (trimmed.length < 3) {
      return {
        hasSufficientQuery: false,
        customers: [],
        stores: [],
        products: [],
        orders: [],
        cheques: [],
        totalCount: 0,
      };
    }

    // 1. Customers: match name or phone
    const matchedCustomers = customers.filter(
      (c) =>
        c.name.toLowerCase().includes(trimmed) ||
        c.phone.toLowerCase().includes(trimmed)
    );

    // 2. Stores: match name, location, or type
    const matchedStores = stores.filter(
      (s) =>
        s.name.toLowerCase().includes(trimmed) ||
        s.location.toLowerCase().includes(trimmed) ||
        s.type.toLowerCase().includes(trimmed) ||
        s.officerName.toLowerCase().includes(trimmed)
    );

    // 3. Products: match name, SKU, or brand
    const matchedProducts = products.filter(
      (p) =>
        p.name.toLowerCase().includes(trimmed) ||
        p.sku.toLowerCase().includes(trimmed) ||
        p.brandCode.toLowerCase().includes(trimmed)
    );

    // 4. Orders: match orderNumber, customerName, customerPhone, or item names
    const matchedOrders = orders.filter((o) => {
      const orderNumMatch = o.orderNumber.toLowerCase().includes(trimmed);
      const nameMatch = o.customerName.toLowerCase().includes(trimmed);
      const phoneMatch = o.customerPhone.toLowerCase().includes(trimmed);
      const itemsMatch = o.items?.some((it) => it.productName.toLowerCase().includes(trimmed));
      return orderNumMatch || nameMatch || phoneMatch || itemsMatch;
    });

    // 5. Cheques: match chequeNumber, bankName, storeName, or officerName
    const matchedCheques = cheques.filter(
      (c) =>
        c.chequeNumber.toLowerCase().includes(trimmed) ||
        c.bankName.toLowerCase().includes(trimmed) ||
        c.storeName.toLowerCase().includes(trimmed) ||
        c.officerName?.toLowerCase().includes(trimmed)
    );

    const totalCount =
      matchedCustomers.length +
      matchedStores.length +
      matchedProducts.length +
      matchedOrders.length +
      matchedCheques.length;

    return {
      hasSufficientQuery: true,
      customers: matchedCustomers,
      stores: matchedStores,
      products: matchedProducts,
      orders: matchedOrders,
      cheques: matchedCheques,
      totalCount,
    };
  }, [query, customers, stores, products, orders, cheques]);

  // Flattened list of matched items for keyboard navigation
  const flatResults = useMemo<FlatResultItem[]>(() => {
    if (!categorizedResults.hasSufficientQuery) return [];

    const items: FlatResultItem[] = [];

    // Customers
    categorizedResults.customers.forEach((c) => {
      const karmaVariant: BadgeVariant =
        c.karmaScore >= 70 ? 'green' : c.karmaScore >= 40 ? 'amber' : 'red';
      items.push({
        id: `customer-${c.id || c.phone}`,
        category: 'CUSTOMERS',
        title: c.name,
        subtitle: c.phone,
        metaBadge: {
          text: `Karma ${c.karmaScore}`,
          variant: karmaVariant,
        },
        extraInfo: c.city ? `${c.city}, ${c.province || ''}` : undefined,
        url: `/customers/${c.phone}`,
      });
    });

    // Stores
    categorizedResults.stores.forEach((s) => {
      items.push({
        id: `store-${s.id}`,
        category: 'STORES',
        title: s.name,
        subtitle: `${s.type}, ${s.location}`,
        extraInfo: `Officer: ${s.officerName}`,
        url: `/offline-sales/stores/${s.id}`,
      });
    });

    // Products
    categorizedResults.products.forEach((p) => {
      items.push({
        id: `product-${p.id}`,
        category: 'PRODUCTS',
        title: p.name,
        subtitle: `SKU: ${p.sku} • Brand: ${p.brandCode}`,
        metaBadge: {
          text: `MRP NPR ${p.mrp.toLocaleString()}`,
          variant: 'purple',
        },
        url: `/products/${p.id}`,
      });
    });

    // Orders
    categorizedResults.orders.forEach((o) => {
      const firstItem = o.items?.[0]?.productName || 'Order Item';
      const itemsCount = o.items?.length || 1;
      const itemDesc = itemsCount > 1 ? `${firstItem} +${itemsCount - 1} more` : firstItem;
      const dateDisplay = o.orderDateBs || o.orderDateAd || 'Recent';

      items.push({
        id: `order-${o.id}`,
        category: 'ORDERS',
        title: o.orderNumber,
        subtitle: `${o.customerName} — ${itemDesc}`,
        extraInfo: dateDisplay,
        metaBadge: {
          text: o.status,
          variant: o.status === 'DELIVERED' ? 'green' : o.status === 'FAILED' ? 'red' : 'blue',
        },
        url: `/customers/${o.customerPhone}`,
      });
    });

    // Cheques
    categorizedResults.cheques.forEach((c) => {
      items.push({
        id: `cheque-${c.id}`,
        category: 'CHEQUES',
        title: `Cheque #${c.chequeNumber}`,
        subtitle: `${c.bankName} — ${c.storeName}`,
        extraInfo: `NPR ${c.amount.toLocaleString()}`,
        metaBadge: {
          text: c.status.replace(/_/g, ' '),
          variant: c.status === 'CASHED' ? 'green' : c.status === 'BOUNCED' ? 'red' : 'amber',
        },
        url: `/offline-sales/cheques?search=${encodeURIComponent(c.chequeNumber)}`,
      });
    });

    return items;
  }, [categorizedResults]);

  // Navigate to item
  const handleSelect = (item: FlatResultItem) => {
    onClose();
    router.push(item.url);
  };

  // Keyboard navigation within the modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (flatResults.length > 0) {
          setSelectedIndex((prev) => (prev + 1) % flatResults.length);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (flatResults.length > 0) {
          setSelectedIndex((prev) => (prev - 1 + flatResults.length) % flatResults.length);
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (flatResults.length > 0 && flatResults[selectedIndex]) {
          handleSelect(flatResults[selectedIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, flatResults, selectedIndex]);

  // Auto-scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-active="true"]') as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-8 sm:pt-20 px-3 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200 bg-white gap-3">
          <Search className="w-5 h-5 text-blue-600 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search customers, stores, products, cheques..."
            className="w-full text-sm sm:text-base font-medium text-slate-900 placeholder-slate-400 bg-transparent outline-none"
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSelectedIndex(0);
                inputRef.current?.focus();
              }}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100 transition"
              aria-label="Clear search input"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[11px] font-semibold text-slate-400 bg-slate-100 border border-slate-200 rounded">
            ESC
          </kbd>
        </div>

        {/* Scrollable Results Area */}
        <div ref={listRef} className="overflow-y-auto flex-1 divide-y divide-slate-100 p-0 text-sm">
          {!categorizedResults.hasSufficientQuery ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-slate-800">Global Command Palette</p>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Search records available to your account. Type at least <span className="font-semibold text-blue-600">3 characters</span>.
              </p>

              {/* Quick Jump Shortcuts */}
              <div className="mt-6 pt-5 border-t border-slate-100 text-left">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 px-1">
                  Quick Directory Navigation
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {hasAccess(currentUser, 'customers') && <button
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push('/customers');
                    }}
                    className="flex items-center gap-2.5 p-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 border border-slate-100 transition text-left"
                  >
                    <div className="w-6 h-6 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                      <User className="w-3.5 h-3.5" />
                    </div>
                    <span>Customer 360 Hub</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-auto shrink-0" />
                  </button>}

                  {hasAccess(currentUser, 'stores') && <button
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push('/offline-sales/stores');
                    }}
                    className="flex items-center gap-2.5 p-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 border border-slate-100 transition text-left"
                  >
                    <div className="w-6 h-6 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                      <Store className="w-3.5 h-3.5" />
                    </div>
                    <span>Store Directory</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-auto shrink-0" />
                  </button>}

                  {hasAccess(currentUser, 'products') && <button
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push('/products');
                    }}
                    className="flex items-center gap-2.5 p-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 border border-slate-100 transition text-left"
                  >
                    <div className="w-6 h-6 rounded-md bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                      <Package className="w-3.5 h-3.5" />
                    </div>
                    <span>Products & Catalog</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-auto shrink-0" />
                  </button>}

                  {hasAccess(currentUser, 'cheque_tracker') && <button
                    type="button"
                    onClick={() => {
                      onClose();
                      router.push('/offline-sales/cheques');
                    }}
                    className="flex items-center gap-2.5 p-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 border border-slate-100 transition text-left"
                  >
                    <div className="w-6 h-6 rounded-md bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                      <CreditCard className="w-3.5 h-3.5" />
                    </div>
                    <span>Cheque Custody & Deposit</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-auto shrink-0" />
                  </button>}
                </div>
              </div>
            </div>
          ) : categorizedResults.totalCount === 0 ? (
            <div className="p-10 text-center text-slate-400">
              <Search className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="text-sm font-semibold text-slate-700">No matching records found</p>
              <p className="text-xs text-slate-400 mt-1">No accessible records matched &ldquo;{query}&rdquo;.</p>
            </div>
          ) : (
            <div className="py-2">
              {/* Category 1: CUSTOMERS */}
              <CategorySection
                allowed={hasAccess(currentUser, 'customers')}
                title="CUSTOMERS"
                count={categorizedResults.customers.length}
                emptyText="No matching customers"
              >
                {categorizedResults.customers.map((c) => {
                  const itemIndex = flatResults.findIndex((item) => item.id === `customer-${c.id || c.phone}`);
                  const isSelected = itemIndex === selectedIndex;
                  return (
                    <SearchResultRow
                      key={`cust-${c.id || c.phone}`}
                      isSelected={isSelected}
                      onClick={() => itemIndex >= 0 && handleSelect(flatResults[itemIndex])}
                      icon={<User className="w-4 h-4 text-blue-600" />}
                      iconBg="bg-blue-50"
                      title={c.name}
                      subtitle={c.phone}
                      extraInfo={c.city ? `${c.city}` : undefined}
                      badgeText={`Karma ${c.karmaScore}`}
                      badgeColor={
                        c.karmaScore >= 70
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : c.karmaScore >= 40
                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                          : 'bg-rose-50 text-rose-700 border-rose-200'
                      }
                    />
                  );
                })}
              </CategorySection>

              {/* Category 2: STORES */}
              <CategorySection
                allowed={hasAccess(currentUser, 'stores') || hasAccess(currentUser, 'distributors')}
                title="STORES"
                count={categorizedResults.stores.length}
                emptyText="No matching stores"
              >
                {categorizedResults.stores.map((s) => {
                  const itemIndex = flatResults.findIndex((item) => item.id === `store-${s.id}`);
                  const isSelected = itemIndex === selectedIndex;
                  return (
                    <SearchResultRow
                      key={`st-${s.id}`}
                      isSelected={isSelected}
                      onClick={() => itemIndex >= 0 && handleSelect(flatResults[itemIndex])}
                      icon={<Store className="w-4 h-4 text-emerald-600" />}
                      iconBg="bg-emerald-50"
                      title={s.name}
                      subtitle={`${s.type}, ${s.location}`}
                      extraInfo={`Officer: ${s.officerName}`}
                    />
                  );
                })}
              </CategorySection>

              {/* Category 3: PRODUCTS */}
              <CategorySection
                allowed={hasAccess(currentUser, 'products')}
                title="PRODUCTS"
                count={categorizedResults.products.length}
                emptyText="No matching products"
              >
                {categorizedResults.products.map((p) => {
                  const itemIndex = flatResults.findIndex((item) => item.id === `product-${p.id}`);
                  const isSelected = itemIndex === selectedIndex;
                  return (
                    <SearchResultRow
                      key={`prod-${p.id}`}
                      isSelected={isSelected}
                      onClick={() => itemIndex >= 0 && handleSelect(flatResults[itemIndex])}
                      icon={<Package className="w-4 h-4 text-purple-600" />}
                      iconBg="bg-purple-50"
                      title={p.name}
                      subtitle={`SKU: ${p.sku} • ${p.brandCode}`}
                      extraInfo={`NPR ${p.mrp.toLocaleString()}`}
                      badgeText="MRP"
                      badgeColor="bg-purple-50 text-purple-700 border-purple-200"
                    />
                  );
                })}
              </CategorySection>

              {/* Category 4: ORDERS */}
              <CategorySection
                allowed={hasAccess(currentUser, 'orderflow')}
                title="ORDERS"
                count={categorizedResults.orders.length}
                emptyText="No matching orders"
              >
                {categorizedResults.orders.map((o) => {
                  const itemIndex = flatResults.findIndex((item) => item.id === `order-${o.id}`);
                  const isSelected = itemIndex === selectedIndex;
                  const firstItem = o.items?.[0]?.productName || 'Order item';
                  const dateStr = o.orderDateBs || o.orderDateAd || 'Recent';
                  return (
                    <SearchResultRow
                      key={`ord-${o.id}`}
                      isSelected={isSelected}
                      onClick={() => itemIndex >= 0 && handleSelect(flatResults[itemIndex])}
                      icon={<ShoppingCart className="w-4 h-4 text-indigo-600" />}
                      iconBg="bg-indigo-50"
                      title={o.orderNumber}
                      subtitle={`${o.customerName} — ${firstItem}`}
                      extraInfo={dateStr}
                      badgeText={o.status}
                      badgeColor={
                        o.status === 'DELIVERED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : o.status === 'FAILED'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }
                    />
                  );
                })}
              </CategorySection>

              {/* Category 5: CHEQUES */}
              <CategorySection
                allowed={hasAccess(currentUser, 'cheque_tracker')}
                title="CHEQUES"
                count={categorizedResults.cheques.length}
                emptyText="No matching cheques"
              >
                {categorizedResults.cheques.map((c) => {
                  const itemIndex = flatResults.findIndex((item) => item.id === `cheque-${c.id}`);
                  const isSelected = itemIndex === selectedIndex;
                  return (
                    <SearchResultRow
                      key={`chq-${c.id}`}
                      isSelected={isSelected}
                      onClick={() => itemIndex >= 0 && handleSelect(flatResults[itemIndex])}
                      icon={<CreditCard className="w-4 h-4 text-amber-600" />}
                      iconBg="bg-amber-50"
                      title={`Cheque #${c.chequeNumber}`}
                      subtitle={`${c.bankName} — ${c.storeName}`}
                      extraInfo={`NPR ${c.amount.toLocaleString()}`}
                      badgeText={c.status.replace(/_/g, ' ')}
                      badgeColor={
                        c.status === 'CASHED'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : c.status === 'BOUNCED'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }
                    />
                  );
                })}
              </CategorySection>
            </div>
          )}
        </div>

        {/* Footer with keyboard navigation guides */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono font-medium shadow-2xs">
                ↑
              </kbd>
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono font-medium shadow-2xs">
                ↓
              </kbd>
              <span>to navigate</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-white border border-slate-200 rounded font-mono font-medium shadow-2xs">
                ↵
              </kbd>
              <span>to select</span>
            </span>
          </div>

          <div className="flex items-center gap-1 text-slate-400">
            <span>Esc to close</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategorySection({
  allowed = true,
  title,
  count,
  emptyText,
  children,
}: {
  allowed?: boolean;
  title: string;
  count: number;
  emptyText: string;
  children: React.ReactNode;
}) {
  if (!allowed) return null;
  return (
    <div className="mb-2">
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-50/80 border-y border-slate-100">
        <span className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
          {title} ({count})
        </span>
      </div>
      <div>
        {count === 0 ? (
          <div className="px-5 py-2 text-xs text-slate-400 italic font-medium">
            {emptyText}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function SearchResultRow({
  isSelected,
  onClick,
  icon,
  iconBg,
  title,
  subtitle,
  extraInfo,
  badgeText,
  badgeColor,
}: {
  isSelected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  extraInfo?: string;
  badgeText?: string;
  badgeColor?: string;
}) {
  return (
    <div
      data-active={isSelected}
      onClick={onClick}
      className={`group flex items-center justify-between px-4 py-2.5 transition cursor-pointer ${
        isSelected
          ? 'bg-blue-50/80 border-l-3 border-blue-600 text-blue-950 pl-[13px]'
          : 'hover:bg-slate-50 text-slate-800'
      }`}
    >
      <div className="flex items-center gap-3 min-w-0">
        <div className={`w-8 h-8 rounded-lg ${iconBg} shrink-0 flex items-center justify-center`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-xs sm:text-sm text-slate-900 truncate">
              {title}
            </span>
            {badgeText && (
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded border uppercase tracking-wider shrink-0 ${
                  badgeColor || 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {badgeText}
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 truncate flex items-center gap-1.5 mt-0.5">
            <span>{subtitle}</span>
            {extraInfo && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-slate-600 font-medium">{extraInfo}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 text-slate-400 group-hover:text-blue-600 shrink-0 ml-2">
        <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition" />
      </div>
    </div>
  );
}
