'use client';

import NumberInput from '@/components/common/NumberInput';
import PagedList from '@/components/common/PagedList';
import Portal from '@/components/common/Portal';
import InfoTip from '@/components/common/InfoTip';
import DownloadButton from '@/components/common/DownloadButton';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import PageGuard from '@/components/common/PageGuard';
import { Customer, CustomerSegment, BrandCode } from '@/lib/types';
import {
  Users,
  Search,
  Filter,
  ShieldAlert,
  Award,
  Star,
  ArrowUpRight,
  Plus,
  Edit3,
  X,
  Check,
  Lightbulb,
} from 'lucide-react';
import { getBrands } from '@/lib/db/brands-service';

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>(db.getCustomers());
  // The workspace may still be loading when the page opens; follow it as it arrives and changes.
  useEffect(() => { const refresh = () => setCustomers([...db.getCustomers()]); refresh(); window.addEventListener('bb-db-updated', refresh); return () => window.removeEventListener('bb-db-updated', refresh); }, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [segmentFilter, setSegmentFilter] = useState<string>('ALL');
  const [brandFilter, setBrandFilter] = useState<string>('ALL');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Add Customer Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [addName, setAddName] = useState('');
  const [addPhone, setAddPhone] = useState('+977-98');
  const [addCity, setAddCity] = useState('Kathmandu');
  const [addProvince, setAddProvince] = useState('Bagmati Province');
  const [addSegment, setAddSegment] = useState<CustomerSegment>('NEW');

  // Edit Customer Modal
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editProvince, setEditProvince] = useState('');
  const [editSegment, setEditSegment] = useState<CustomerSegment>('NEW');
  const [editKarmaScore, setEditKarmaScore] = useState(72);
  const [editIsBlacklisted, setEditIsBlacklisted] = useState(false);

  const reloadCustomers = () => {
    setCustomers([...db.getCustomers()]);
  };

  const triggerToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addName.trim() || !addPhone.trim()) return;

    db.addCustomer({
      name: addName.trim(),
      phone: addPhone.trim(),
      city: addCity.trim(),
      province: addProvince.trim(),
      segment: addSegment,
      karmaScore: addSegment === 'VIP' ? 90 : addSegment === 'LOYAL' ? 85 : 72,
      totalOrders: 0,
      totalDelivered: 0,
      totalReturns: 0,
      totalDeliveryFailures: 0,
      totalCancellations: 0,
      totalComplaints: 0,
      totalReviews: 0,
      activeFlags: [],
      brandsPurchased: [],
      firstOrderDate: new Date().toISOString().split('T')[0],
      lastOrderDate: new Date().toISOString().split('T')[0],
    });

    triggerToast(`Customer "${addName}" successfully onboarded.`);
    setShowAddModal(false);
    setAddName('');
    setAddPhone('+977-98');
    reloadCustomers();
  };

  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setEditName(c.name);
    setEditPhone(c.phone);
    setEditCity(c.city || '');
    setEditProvince(c.province || 'Bagmati Province');
    setEditSegment(c.segment);
    setEditKarmaScore(c.karmaScore);
    setEditIsBlacklisted(c.segment === 'BLACKLISTED');
  };

  const handleUpdateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;

    const segmentToSave: CustomerSegment = editIsBlacklisted ? 'BLACKLISTED' : editSegment;

    db.updateCustomer(editingCustomer.id, {
      name: editName.trim(),
      phone: editPhone.trim(),
      city: editCity.trim(),
      province: editProvince.trim(),
      segment: segmentToSave,
      karmaScore: Number(editKarmaScore),
    });

    triggerToast(`Customer profile for "${editName}" updated.`);
    setEditingCustomer(null);
    reloadCustomers();
  };

  const filtered = customers.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.includes(searchTerm) ||
      (c.city && c.city.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesSegment = segmentFilter === 'ALL' || c.segment === segmentFilter;
    const matchesBrand =
      brandFilter === 'ALL'
        ? true
        : brandFilter === 'MULTI'
        ? (c.brandsPurchased || []).length >= 2
        : (c.brandsPurchased || []).includes(brandFilter as BrandCode);
    return matchesSearch && matchesSegment && matchesBrand;
  });

  const getSegmentBadge = (segment: CustomerSegment) => {
    switch (segment) {
      case 'VIP':
        return <span className="rounded-full bg-amber-100 text-amber-900 font-bold px-2.5 py-0.5 text-[11px]">VIP</span>;
      case 'LOYAL':
        return <span className="rounded-full bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 text-[11px]">Loyal</span>;
      case 'REGULAR':
        return <span className="rounded-full bg-blue-100 text-blue-800 font-bold px-2.5 py-0.5 text-[11px]">Regular</span>;
      case 'AT_RISK':
        return <span className="rounded-full bg-rose-100 text-rose-800 font-bold px-2.5 py-0.5 text-[11px]">At risk</span>;
      case 'BLACKLISTED':
        return <span className="rounded-full bg-slate-900 text-white font-bold px-2.5 py-0.5 text-[11px]">Blacklisted</span>;
      default:
        return <span className="rounded-full bg-slate-100 text-slate-700 font-medium px-2 py-0.5 text-[11px]">New</span>;
    }
  };

  return (
    <PageGuard feature="customers">
      <div className="space-y-6 pb-24">
      {/* Toast */}
      {toastMsg && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-semibold animate-fade-in">
          <Lightbulb className="w-4 h-4 text-emerald-400" />
          <span>{toastMsg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Customers
<InfoTip label="About this page">Unique customer profiles unified by phone number with auto-calculated Karma Scores (0-100).</InfoTip></h1>
          
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DownloadButton datasets={['customers']} records={{ customers: filtered } as any} />
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 shadow-sm transition min-h-[40px]"
          >
            <Plus className="h-4 w-4" />
            <span>Onboard customer</span>
          </button>

          <Link
            href="/customers/insights"
            className="btn btn-secondary min-h-[40px]"
          >
            View cohort insights
          </Link>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name, phone, or city…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-2 text-xs outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-500 whitespace-nowrap">Segment:</span>
          <select aria-label="Customer segment"
            value={segmentFilter}
            onChange={(e) => setSegmentFilter(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs bg-white outline-none"
          >
            <option value="ALL">All segments</option>
            <option value="VIP">VIP</option>
            <option value="LOYAL">Loyal</option>
            <option value="REGULAR">Regular</option>
            <option value="NEW">New</option>
            <option value="AT_RISK">At risk (&lt;40 Karma)</option>
            <option value="BLACKLISTED">Blacklisted</option>
          </select>
        </div>

        {/* Brand Filter Pills (Dynamic from Database) */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2 border-t border-slate-100 text-xs font-semibold w-full">
          <span className="text-slate-500 mr-1 text-[11px] font-bold ">Brand scope:</span>
          {[
            { id: 'ALL', label: 'All customers' },
            ...getBrands('ACTIVE').map((b) => ({ id: b.code, label: b.name })),
            { id: 'MULTI', label: 'Multi-Brand (2+)' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setBrandFilter(pill.id)}
              className={`px-3 py-1 rounded-lg transition text-xs cursor-pointer ${
                brandFilter === pill.id
                  ? 'bg-blue-600 text-white font-bold shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden text-xs">
        <div className="overflow-x-auto" tabIndex={0}>
          <table className="w-full text-left min-w-[700px]">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[11px] font-bold ">
            <tr>
              <th className="py-3 px-4">Customer name</th>
              <th className="py-3 px-4">Phone (unique ID)</th>
              <th className="py-3 px-4">Location</th>
              <th className="py-3 px-4 text-center">Karma score</th>
              <th className="py-3 px-4">Segment</th>
              <th className="py-3 px-4">Total orders</th>
              <th className="py-3 px-4">Active flags</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {<PagedList items={filtered} label="customers" asRow render={(pageRows) => pageRows.map((c) => {
              const cleanPhone = encodeURIComponent(c.phone.replace(/[^0-9+]/g, ''));
              return (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-bold text-slate-900">{c.name}</td>
                  <td className="py-3 px-4 font-mono font-medium text-slate-700">{c.phone}</td>
                  <td className="py-3 px-4 text-slate-500">
                    {c.city || '—'}, {c.province || 'Nepal'}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <span
                      className={`inline-block font-mono font-bold text-xs rounded px-2 py-0.5 ${
                        c.karmaScore >= 80
                          ? 'bg-emerald-100 text-emerald-800'
                          : c.karmaScore >= 50
                          ? 'bg-blue-100 text-blue-800'
                          : c.karmaScore >= 35
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {c.karmaScore} / 100
                    </span>
                  </td>
                  <td className="py-3 px-4">{getSegmentBadge(c.segment)}</td>
                  <td className="py-3 px-4 font-medium text-slate-800">{c.totalOrders} Orders</td>
                  <td className="py-3 px-4">
                    {c.activeFlags.length === 0 ? (
                      <span className="text-slate-500">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {c.activeFlags.map((fl, i) => (
                          <span
                            key={i}
                            className="rounded bg-rose-50 text-rose-800 border border-rose-200 px-1.5 py-0.5 text-[11px] font-bold"
                          >
                            {fl}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openEditModal(c)}
                        className="inline-flex items-center gap-1 font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-lg text-xs transition"
                      >
                        <Edit3 className="h-3 w-3" />
                        <span>Edit</span>
                      </button>
                      <Link
                        href={`/customers/${cleanPhone}`}
                        className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:underline px-2 py-1"
                      >
                        <span>360</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })} />}
          </tbody>
        </table>
        </div>
      </div>

      {/* ======================================================== */}
      {/* MODAL: ONBOARD NEW CUSTOMER */}
      {/* ======================================================== */}
      {showAddModal && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">Onboard customer profile</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateCustomer} className="space-y-3.5">
              <div>
                <label htmlFor="customers-full-name" className="block text-xs font-bold text-slate-700 mb-1">Full name *</label>
                <input id="customers-full-name"
                  type="text"
                  required
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder="e.g. Sabina Shakya"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="customers-phone-number-nepal-mobile" className="block text-xs font-bold text-slate-700 mb-1">
                  Phone number (Nepal mobile) *
                </label>
                <input id="customers-phone-number-nepal-mobile"
                  type="text"
                  required
                  value={addPhone}
                  onChange={(e) => setAddPhone(e.target.value)}
                  placeholder="+977-98XXXXXXXX"
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="customers-city-district" className="block text-xs font-bold text-slate-700 mb-1">City / district</label>
                  <input id="customers-city-district"
                    type="text"
                    value={addCity}
                    onChange={(e) => setAddCity(e.target.value)}
                    placeholder="Kathmandu"
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="customers-province" className="block text-xs font-bold text-slate-700 mb-1">Province</label>
                  <select id="customers-province"
                    value={addProvince}
                    onChange={(e) => setAddProvince(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="Bagmati Province">Bagmati</option>
                    <option value="Gandaki Province">Gandaki</option>
                    <option value="Koshi Province">Koshi</option>
                    <option value="Lumbini Province">Lumbini</option>
                    <option value="Madhesh Province">Madhesh</option>
                    <option value="Karnali Province">Karnali</option>
                    <option value="Sudurpashchim Province">Sudurpashchim</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="customers-initial-segment-tier" className="block text-xs font-bold text-slate-700 mb-1">Initial segment tier</label>
                <select id="customers-initial-segment-tier"
                  value={addSegment}
                  onChange={(e) => setAddSegment(e.target.value as CustomerSegment)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white font-semibold"
                >
                  <option value="NEW">New shopper (Karma 72)</option>
                  <option value="REGULAR">Regular buyer (Karma 75)</option>
                  <option value="LOYAL">Loyal advocate (Karma 85)</option>
                  <option value="VIP">VIP key account (Karma 90)</option>
                </select>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                >
                  Save customer
                </button>
              </div>
            </form>
          </div>
        </div></Portal>
      )}

      {/* ======================================================== */}
      {/* MODAL: EDIT EXISTING CUSTOMER */}
      {/* ======================================================== */}
      {editingCustomer && (
        <Portal><div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-slate-700" />
                <h3 className="font-bold text-slate-900 text-base">Edit Customer: {editingCustomer.name}</h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="p-1 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateCustomer} className="space-y-3.5">
              <div>
                <label htmlFor="customers-full-name-2" className="block text-xs font-bold text-slate-700 mb-1">Full name *</label>
                <input id="customers-full-name-2"
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label htmlFor="customers-phone-number" className="block text-xs font-bold text-slate-700 mb-1">Phone number *</label>
                <input id="customers-phone-number"
                  type="text"
                  required
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="customers-city-district-2" className="block text-xs font-bold text-slate-700 mb-1">City / district</label>
                  <input id="customers-city-district-2"
                    type="text"
                    value={editCity}
                    onChange={(e) => setEditCity(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="customers-province-2" className="block text-xs font-bold text-slate-700 mb-1">Province</label>
                  <input id="customers-province-2"
                    type="text"
                    value={editProvince}
                    onChange={(e) => setEditProvince(e.target.value)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="customers-customer-segment" className="block text-xs font-bold text-slate-700 mb-1">Customer segment</label>
                  <select id="customers-customer-segment"
                    value={editSegment}
                    onChange={(e) => setEditSegment(e.target.value as CustomerSegment)}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 bg-white"
                  >
                    <option value="NEW">New</option>
                    <option value="REGULAR">Regular</option>
                    <option value="LOYAL">Loyal</option>
                    <option value="VIP">VIP</option>
                    <option value="AT_RISK">At risk</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="customers-karma-score-0-100" className="block text-xs font-bold text-slate-700 mb-1">Karma score (0-100)</label>
                  <NumberInput id="customers-karma-score-0-100"
                    type="number"
                    min="0"
                    max="100"
                    value={editKarmaScore}
                    onChange={(e) => setEditKarmaScore(Number(e.target.value))}
                    className="w-full text-xs px-3 py-2 rounded-lg border border-slate-200 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Blacklist toggle */}
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-rose-900">Blacklist customer</div>
                  <div className="text-[11px] text-rose-700">Flag for chronic fake COD delivery refusals</div>
                </div>
                <input
                  type="checkbox"
                  checked={editIsBlacklisted}
                  onChange={(e) => setEditIsBlacklisted(e.target.checked)}
                  className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-lg shadow-sm"
                >
                  Update profile
                </button>
              </div>
            </form>
          </div>
        </div></Portal>
      )}
      </div>
    </PageGuard>
  );
}
