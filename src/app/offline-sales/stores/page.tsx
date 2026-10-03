'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { toast } from '@/components/common/Toast';
import ConfirmModal from '@/components/common/ConfirmModal';
import { Distributor, Branch, Retailer, BrandCode, ContactRole, VendorContact } from '@/lib/types';
import {
  Store,
  Building2,
  MapPin,
  Phone,
  Plus,
  Search,
  Filter,
  X,
  Navigation,
  Check,
  UserPlus,
  Edit3,
  Trash2,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';

export default function StoresPage() {
  const [currentUser] = useState(() => db.getCurrentUser());
  const isSalesOfficer = currentUser.role === 'SALES_OFFICER';
  const [distributors, setDistributors] = useState(db.getDistributors());
  const [branches, setBranches] = useState(db.getBranches());
  const [retailers, setRetailers] = useState(db.getRetailers());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'DISTRIBUTORS' | 'RETAILERS'>(isSalesOfficer ? 'RETAILERS' : 'ALL');
  const officers = db.getUsers().filter((u) => u.role === 'SALES_OFFICER');

  // Edit Store State
  const [editingStore, setEditingStore] = useState<Retailer | null>(null);
  const [editStoreName, setEditStoreName] = useState('');
  const [editStoreType, setEditStoreType] = useState<Retailer['type']>('GT');
  const [editStoreArea, setEditStoreArea] = useState('');
  const [editStoreAddress, setEditStoreAddress] = useState('');
  const [editStoreContact, setEditStoreContact] = useState('');
  const [editStorePhone, setEditStorePhone] = useState('');

  const openEditStore = (ret: Retailer) => {
    setEditingStore(ret);
    setEditStoreName(ret.name);
    setEditStoreType(ret.type);
    setEditStoreArea(ret.area);
    setEditStoreAddress(ret.address);
    setEditStoreContact(ret.contactName);
    setEditStorePhone(ret.contactPhone);
  };

  const handleUpdateStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStore || !editStoreName.trim()) return;

    db.updateRetailer(editingStore.id, {
      name: editStoreName.trim(),
      type: editStoreType,
      area: editStoreArea.trim(),
      address: editStoreAddress.trim() || `${editStoreArea}, Kathmandu`,
      contactName: editStoreContact.trim() || 'Store Manager',
      contactPhone: editStorePhone.trim(),
    });

    setRetailers([...db.getRetailers()]);
    setEditingStore(null);
    toast.success(`✓ Store "${editStoreName}" updated successfully.`);
  };

  const [deleteConfirmStore, setDeleteConfirmStore] = useState<{ id: string; name: string } | null>(null);

  const handleDeleteStore = (id: string, name: string) => {
    setDeleteConfirmStore({ id, name });
  };

  const confirmDeleteStore = () => {
    if (!deleteConfirmStore) return;
    db.deleteRetailer(deleteConfirmStore.id);
    setRetailers([...db.getRetailers()]);
    setEditingStore(null);
    toast.success(`✓ Store "${deleteConfirmStore.name}" removed.`);
    setDeleteConfirmStore(null);
  };

  // Multi-Contact Modal State
  const [targetStoreForContact, setTargetStoreForContact] = useState<{
    id: string;
    type: 'DISTRIBUTOR' | 'RETAILER';
    name: string;
  } | null>(null);
  const [newContactName, setNewContactName] = useState('');
  const [newContactRole, setNewContactRole] = useState<ContactRole>('Accounts / Cheque');
  const [newContactPhone, setNewContactPhone] = useState('+977-98');

  const handleSaveStoreContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetStoreForContact || !newContactName.trim()) return;
    db.addVendorContact(targetStoreForContact.type, targetStoreForContact.id, {
      name: newContactName.trim(),
      role: newContactRole,
      phone: newContactPhone.trim(),
      isPrimary: false,
    });
    setDistributors([...db.getDistributors()]);
    setRetailers([...db.getRetailers()]);
    setTargetStoreForContact(null);
    setNewContactName('');
    toast.success(`✓ Added contact ${newContactName} (${newContactRole}) to ${targetStoreForContact.name}.`);
  };

  // Modals
  const [showQuickAddModal, setShowQuickAddModal] = useState(false);
  const [showDistributorModal, setShowDistributorModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [selectedDistId, setSelectedDistId] = useState<string>('');

  // Quick Add Store Form State (Field single-screen)
  const [quickName, setQuickName] = useState('');
  const [quickType, setQuickType] = useState<Retailer['type']>('GT');
  const [quickCity, setQuickCity] = useState('Kathmandu');
  const [quickArea, setQuickArea] = useState('Baneshwor');
  const [quickAddress, setQuickAddress] = useState('');
  const [quickContact, setQuickContact] = useState('');
  const [quickPhone, setQuickPhone] = useState('');
  const [quickBrands, setQuickBrands] = useState<BrandCode[]>(['FORYA']);
  const [quickDistributorId, setQuickDistributorId] = useState('');

  const handleToggleBrand = (b: BrandCode) => {
    if (quickBrands.includes(b)) {
      setQuickBrands(quickBrands.filter((x) => x !== b));
    } else {
      setQuickBrands([...quickBrands, b]);
    }
  };

  const handleSaveQuickStore = () => {
    if (!quickName.trim()) return;
    const newRet = db.addRetailer({
      name: quickName,
      type: quickType,
      city: quickCity,
      area: quickArea,
      address: quickAddress || `${quickArea}, ${quickCity}`,
      lat: 27.7 + (Math.random() - 0.5) * 0.05,
      lng: 85.3 + (Math.random() - 0.5) * 0.05,
      assignedOfficerId: db.getCurrentUser().id,
      assignedOfficerName: db.getCurrentUser().fullName,
      contactName: quickContact || 'Store Manager',
      contactRole: 'Proprietor',
      contactPhone: quickPhone || '+977-9841000000',
      contacts: [
        {
          id: `cnt_${Date.now()}`,
          name: quickContact || 'Store Manager',
          role: 'Owner',
          phone: quickPhone || '+977-9841000000',
          isPrimary: true,
        },
      ],
      brandsStocked: quickBrands,
      distributorId: quickDistributorId || undefined,
      distributorName: quickDistributorId
        ? distributors.find((d) => d.id === quickDistributorId)?.name
        : undefined,
    });

    setRetailers([...db.getRetailers()]);
    setShowQuickAddModal(false);
    // Reset form
    setQuickName('');
    setQuickAddress('');
    setQuickContact('');
    setQuickPhone('');
    toast.success(`✓ ${newRet.name} added to store directory and added to your daily beat route!`);
  };

  const filteredRetailers = retailers.filter((r) => {
    if (isSalesOfficer && r.assignedOfficerId !== currentUser.id && r.assignedOfficerName !== currentUser.fullName) {
      return false;
    }
    return (
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.area.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  const filteredDistributors = distributors.filter(
    (d) =>
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.city.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'SALES_OFFICER']}>
      <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Offline Sales', href: '/offline-sales/stores' },
          { label: 'Store & Distributor Directory' },
        ]}
      />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Stores & Distribution Network
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Distributor hierarchy (Chains → Branches) and standalone GT retailers across Nepal.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowQuickAddModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" />
            Quick Add Store (Field)
          </button>
          {!isSalesOfficer && (
            <button
              onClick={() => setShowDistributorModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <Building2 className="h-4 w-4 text-slate-500" />
              Add Distributor
            </button>
          )}
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search stores, branches, areas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-slate-200 pl-9 pr-4 py-2 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>

        <div className="flex items-center rounded-lg bg-slate-100 p-1 text-xs font-medium w-full sm:w-auto">
          <button
            onClick={() => setFilterType('ALL')}
            className={`flex-1 sm:flex-none rounded-md px-3 py-1.5 transition ${
              filterType === 'ALL'
                ? 'bg-white font-semibold text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Outlets
          </button>
          <button
            onClick={() => setFilterType('DISTRIBUTORS')}
            className={`flex-1 sm:flex-none rounded-md px-3 py-1.5 transition ${
              filterType === 'DISTRIBUTORS'
                ? 'bg-white font-semibold text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Distributors & Chains ({distributors.length})
          </button>
          <button
            onClick={() => setFilterType('RETAILERS')}
            className={`flex-1 sm:flex-none rounded-md px-3 py-1.5 transition ${
              filterType === 'RETAILERS'
                ? 'bg-white font-semibold text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            GT Retailers ({retailers.length})
          </button>
        </div>
      </div>

      {/* Section 1: Distributors with Branch Hierarchy */}
      {(filterType === 'ALL' || filterType === 'DISTRIBUTORS') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Distributor Chains & Bulk Accounts
            </h2>
            <span className="text-xs text-slate-500">
              {branches.length} branches tracked
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDistributors
              .map((dist) => {
                const distBranches = branches.filter(
                  (b) =>
                    b.distributorId === dist.id &&
                    (!isSalesOfficer || b.assignedOfficerId === currentUser.id || b.assignedOfficerName === currentUser.fullName)
                );
                return { dist, distBranches };
              })
              .filter(({ distBranches }) => !isSalesOfficer || distBranches.length > 0)
              .map(({ dist, distBranches }) => {
                return (
                  <div
                    key={dist.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4"
                  >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-slate-900 text-base">{dist.name}</h3>
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {dist.type}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        City: <strong className="text-slate-700">{dist.city}</strong>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() =>
                          setTargetStoreForContact({
                            id: dist.id,
                            type: 'DISTRIBUTOR',
                            name: dist.name,
                          })
                        }
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-brand-600 hover:bg-brand-50"
                      >
                        + Contact
                      </button>
                      <button
                        onClick={() => {
                          setSelectedDistId(dist.id);
                          setShowBranchModal(true);
                        }}
                        className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-blue-600 hover:bg-blue-50"
                      >
                        + Branch
                      </button>
                    </div>
                  </div>

                  {/* Multi-Contact Cards */}
                  <div className="bg-slate-50 rounded-lg p-2.5 border border-slate-200/60 space-y-1.5">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      Contacts Directory ({dist.contacts?.length || 1}):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {dist.contacts && dist.contacts.length > 0 ? (
                        dist.contacts.map((c, i) => (
                          <div
                            key={c.id || i}
                            className="inline-flex items-center gap-1.5 bg-white border border-slate-200 rounded-md px-2 py-1 text-[11px]"
                          >
                            <span className="font-bold text-slate-800">{c.name}</span>
                            <span className="px-1 py-0.2 rounded text-[9px] font-semibold bg-slate-100 text-slate-600">
                              {c.role}
                            </span>
                            <a
                              href={`tel:${c.phone}`}
                              className="text-emerald-700 font-bold hover:underline"
                            >
                              {c.phone}
                            </a>
                          </div>
                        ))
                      ) : (
                        <span className="text-xs text-slate-600 font-medium">
                          {dist.contactName} ({dist.contactPhone})
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Brands Carried */}
                  <div className="flex flex-wrap gap-1">
                    {dist.brandsCarried.map((b) => (
                      <span
                        key={b}
                        className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700"
                      >
                        {b}
                      </span>
                    ))}
                  </div>

                  {/* Branches List */}
                  <div className="border-t border-slate-100 pt-3">
                    <div className="text-[11px] font-bold uppercase text-slate-400 mb-2">
                      Tracked Branches ({distBranches.length})
                    </div>
                    <div className="space-y-2">
                      {distBranches.map((branch) => (
                        <div
                          key={branch.id}
                          className="flex items-center justify-between rounded-lg bg-slate-50 p-2.5 text-xs hover:bg-slate-100/70"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/offline-sales/stores/${branch.id}`}
                                className="font-semibold text-slate-800 hover:text-blue-600 hover:underline"
                              >
                                {branch.name}
                              </Link>
                              {(() => {
                                const hs = db.getStoreHealthScore(branch.id);
                                return (
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                      hs.overall >= 70
                                        ? 'bg-emerald-100 text-emerald-800'
                                        : hs.overall >= 40
                                        ? 'bg-amber-100 text-amber-800'
                                        : 'bg-rose-100 text-rose-800'
                                    }`}
                                  >
                                    Health: {hs.overall}
                                  </span>
                                );
                              })()}
                            </div>
                            <div className="text-[11px] text-slate-500">{branch.address}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Assigned Officer:{' '}
                              {!isSalesOfficer ? (
                                <Link
                                  href={`/offline-sales/scorecard?officer=${encodeURIComponent(branch.assignedOfficerName)}`}
                                  className="font-medium text-slate-600 hover:text-blue-600 hover:underline"
                                >
                                  {branch.assignedOfficerName}
                                </Link>
                              ) : (
                                <span className="font-medium text-slate-700">
                                  {branch.assignedOfficerName}
                                </span>
                              )}
                            </div>
                          </div>
                          <a
                            href={`https://www.google.com/maps/dir/?api=1&destination=${branch.lat},${branch.lng}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:text-blue-600 shadow-sm"
                            title="Navigate"
                          >
                            <Navigation className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Section 2: Standalone GT Retailers */}
      {(filterType === 'ALL' || filterType === 'RETAILERS') && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-500">
              Standalone GT Retailers (General Trade & Pharmacies)
            </h2>
            <span className="text-xs text-slate-500">
              {filteredRetailers.length} outlets
            </span>
          </div>

          {filteredRetailers.length === 0 ? (
            <EmptyState
              type="generic"
              title="No Stores Found"
              description="No retail outlets match your search criteria or officer assignment."
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRetailers.map((ret) => (
              <div
                key={ret.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <Link
                      href={`/offline-sales/stores/${ret.id}`}
                      className="font-bold text-slate-900 text-sm hover:text-blue-600 hover:underline"
                    >
                      {ret.name}
                    </Link>
                    <div className="text-[11px] text-slate-500">{ret.area}, {ret.city}</div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const hs = db.getStoreHealthScore(ret.id);
                      return (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            hs.overall >= 70
                              ? 'bg-emerald-100 text-emerald-800'
                              : hs.overall >= 40
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          Health: {hs.overall}
                        </span>
                      );
                    })()}
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase">
                      {ret.type}
                    </span>
                  </div>
                </div>

                <div className="text-xs text-slate-600 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="truncate">{ret.address}</span>
                  </div>

                  {/* Multi-Contact Cards */}
                  <div className="bg-slate-50 rounded-lg p-2 border border-slate-200/60 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-bold text-slate-500">
                      <span>Contacts ({ret.contacts?.length || 1}):</span>
                      <button
                        type="button"
                        onClick={() =>
                          setTargetStoreForContact({
                            id: ret.id,
                            type: 'RETAILER',
                            name: ret.name,
                          })
                        }
                        className="text-brand-600 hover:text-brand-800 font-bold"
                      >
                        + Add Contact
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {ret.contacts && ret.contacts.length > 0 ? (
                        ret.contacts.map((c, i) => (
                          <div
                            key={c.id || i}
                            className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-[10px]"
                          >
                            <span className="font-semibold text-slate-800">{c.name}</span>
                            <span className="text-[9px] text-slate-500 font-normal">({c.role})</span>
                            <a
                              href={`tel:${c.phone}`}
                              className="text-emerald-700 font-bold hover:underline ml-0.5"
                            >
                              {c.phone}
                            </a>
                          </div>
                        ))
                      ) : (
                        <span className="text-[11px] text-slate-600 font-medium">
                          {ret.contactName} ({ret.contactPhone})
                        </span>
                      )}
                    </div>
                  </div>

                  {ret.distributorName && (
                    <div className="text-[10px] text-blue-600 font-medium">
                      Under Distributor: {ret.distributorName}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-1 border-t border-slate-100 pt-2">
                  {ret.brandsStocked.map((b) => (
                    <span
                      key={b}
                      className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700"
                    >
                      {b}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-slate-100 pt-2 text-[11px]">
                  <span className="text-slate-500">
                    Officer: <strong>{ret.assignedOfficerName}</strong>
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openEditStore(ret)}
                      className="flex items-center gap-1 text-slate-600 hover:text-brand-600 font-semibold"
                    >
                      <Edit3 className="h-3 w-3" />
                      Edit
                    </button>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${ret.lat},${ret.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-600 hover:underline font-semibold"
                    >
                      <Navigation className="h-3 w-3" />
                      Navigate
                    </a>
                  </div>
                </div>
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      {/* Quick Add Store Modal (Field Single-Screen Form) */}
      {showQuickAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Quick Add Store (In the Field)</h3>
                <p className="text-xs text-slate-500">Single screen — instant addition to your beat</p>
              </div>
              <button
                onClick={() => setShowQuickAddModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Store Name *</label>
                <input
                  type="text"
                  placeholder="e.g. Annapurna Cosmetics & General Store"
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Store Type</label>
                  <select
                    value={quickType}
                    onChange={(e) => setQuickType(e.target.value as Retailer['type'])}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none bg-white"
                  >
                    <option value="GT">GT / Kirana</option>
                    <option value="Pharmacy">Pharmacy</option>
                    <option value="Cosmetics">Cosmetics</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    value={quickCity}
                    onChange={(e) => setQuickCity(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Area / Tole</label>
                  <input
                    type="text"
                    placeholder="e.g. Putalisadak"
                    value={quickArea}
                    onChange={(e) => setQuickArea(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Address</label>
                  <input
                    type="text"
                    placeholder="e.g. Opposite Star Mall, Putalisadak"
                    value={quickAddress}
                    onChange={(e) => setQuickAddress(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    placeholder="e.g. Mohan Shrestha"
                    value={quickContact}
                    onChange={(e) => setQuickContact(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. +977-9841234567"
                    value={quickPhone}
                    onChange={(e) => setQuickPhone(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Supplying Distributor (Optional)
                </label>
                <select
                  value={quickDistributorId}
                  onChange={(e) => setQuickDistributorId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none bg-white"
                >
                  <option value="">Independent (Direct from Brand Bucket)</option>
                  {distributors.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Brands Stocked</label>
                <div className="flex flex-wrap gap-2">
                  {(['FORYA', 'PEE_SAFE', 'FURR', 'RENEE'] as BrandCode[]).map((b) => (
                    <button
                      type="button"
                      key={b}
                      onClick={() => handleToggleBrand(b)}
                      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                        quickBrands.includes(b)
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {quickBrands.includes(b) && <Check className="h-3 w-3" />}
                      {b.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowQuickAddModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuickStore}
                disabled={!quickName.trim()}
                className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow disabled:opacity-50"
              >
                Save & Add to Beat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Distributor Modal */}
      {showDistributorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Add New Distributor</h3>
              <button
                onClick={() => setShowDistributorModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const name = (form.elements.namedItem('distName') as HTMLInputElement).value;
                const city = (form.elements.namedItem('distCity') as HTMLInputElement).value;
                const contact = (form.elements.namedItem('distContact') as HTMLInputElement).value;
                const phone = (form.elements.namedItem('distPhone') as HTMLInputElement).value;
                db.addDistributor({
                  name,
                  type: 'Retail Chain',
                  city: city || 'Kathmandu',
                  contactName: contact || 'Manager',
                  contactRole: 'Procurement',
                  contactPhone: phone || '+977-9851000000',
                  contactEmail: 'info@distributor.com',
                  contacts: [
                    {
                      id: `cnt_${Date.now()}`,
                      name: contact || 'Manager',
                      role: 'Store Manager',
                      phone: phone || '+977-9851000000',
                      isPrimary: true,
                    },
                  ],
                  brandsCarried: ['FORYA', 'PEE_SAFE', 'RENEE'],
                });
                setDistributors([...db.getDistributors()]);
                setShowDistributorModal(false);
              }}
              className="py-4 space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">Distributor Name *</label>
                <input
                  name="distName"
                  required
                  placeholder="e.g. Saleways Department Store"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">City</label>
                  <input
                    name="distCity"
                    defaultValue="Kathmandu"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Person</label>
                  <input
                    name="distContact"
                    placeholder="Procurement Head"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Contact Phone</label>
                <input
                  name="distPhone"
                  placeholder="+977-9851000000"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowDistributorModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow"
                >
                  Create Distributor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Branch Modal */}
      {showBranchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Add Branch Under Distributor</h3>
              <button
                onClick={() => setShowBranchModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.target as HTMLFormElement;
                const bName = (form.elements.namedItem('bName') as HTMLInputElement).value;
                const bAddr = (form.elements.namedItem('bAddr') as HTMLInputElement).value;
                const bOfficerId = (form.elements.namedItem('bOfficer') as HTMLSelectElement)?.value;
                const dist = distributors.find((d) => d.id === selectedDistId);
                const assignedOfficer = officers.find((o) => o.id === bOfficerId) || officers[0];
                db.addBranch({
                  distributorId: selectedDistId,
                  distributorName: dist?.name || 'Distributor',
                  name: bName,
                  address: bAddr,
                  lat: 27.71,
                  lng: 85.32,
                  assignedOfficerId: assignedOfficer?.id || 'user_officer_ravi',
                  assignedOfficerName: assignedOfficer?.fullName || 'Ravi Sharma',
                  contactName: 'Branch In-charge',
                  contactRole: 'Floor Lead',
                  contactPhone: '+977-9841000000',
                  contacts: [
                    {
                      id: `cnt_${Date.now()}`,
                      name: 'Branch In-charge',
                      role: 'Floor Supervisor',
                      phone: '+977-9841000000',
                      isPrimary: true,
                    },
                  ],
                  brandsAvailable: ['FORYA', 'PEE_SAFE', 'FURR', 'RENEE'],
                });
                setBranches([...db.getBranches()]);
                setShowBranchModal(false);
              }}
              className="py-4 space-y-3 text-xs"
            >
              <div>
                <label className="block font-bold text-slate-700 mb-1">Branch Name *</label>
                <input
                  name="bName"
                  required
                  placeholder="e.g. Maharajgunj Branch"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Address *</label>
                <input
                  name="bAddr"
                  required
                  placeholder="e.g. Ring Road, Maharajgunj, Kathmandu"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                />
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Assigned Sales Officer</label>
                <select
                  name="bOfficer"
                  defaultValue={officers[0]?.id}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none bg-white"
                >
                  {officers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.fullName} ({o.territory})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBranchModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow"
                >
                  Add Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add Contact to Vendor */}
      {targetStoreForContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Add Store Contact</h3>
                <p className="text-xs text-slate-500">{targetStoreForContact.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setTargetStoreForContact(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStoreContact} className="py-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Contact Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Giri"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Role / Designation *</label>
                <select
                  value={newContactRole}
                  onChange={(e) => setNewContactRole(e.target.value as ContactRole)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none bg-white"
                >
                  <option value="Accounts / Cheque">Accounts / Cheque Person</option>
                  <option value="Store Manager">Store Manager</option>
                  <option value="Floor Supervisor">Floor Supervisor</option>
                  <option value="Owner">Owner / Proprietor</option>
                  <option value="Receiving Bay">Receiving Bay / Stock Incharge</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={newContactPhone}
                  onChange={(e) => setNewContactPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setTargetStoreForContact(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-brand-600 px-5 py-2 text-xs font-semibold text-white hover:bg-brand-700 shadow"
                >
                  Save Contact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Edit Retailer Modal */}
      {editingStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Edit Retailer Store</h3>
                <p className="text-xs text-slate-500">{editingStore.name} ({editingStore.id})</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStore(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateStore} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Store Name *</label>
                  <input
                    type="text"
                    required
                    value={editStoreName}
                    onChange={(e) => setEditStoreName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Channel / Type</label>
                  <select
                    value={editStoreType}
                    onChange={(e) => setEditStoreType(e.target.value as Retailer['type'])}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none bg-white"
                  >
                    <option value="GT">General Trade (GT)</option>
                    <option value="MT">Modern Trade / Supermarket</option>
                    <option value="PHARMACY">Pharmacy / Chemist</option>
                    <option value="COSMETICS">Cosmetics Specialty</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Area / Ward</label>
                  <input
                    type="text"
                    value={editStoreArea}
                    onChange={(e) => setEditStoreArea(e.target.value)}
                    placeholder="e.g. New Road, Ward 22"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Full Street Address</label>
                  <input
                    type="text"
                    value={editStoreAddress}
                    onChange={(e) => setEditStoreAddress(e.target.value)}
                    placeholder="e.g. Khichapokhari, New Road"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Primary Contact Person</label>
                  <input
                    type="text"
                    value={editStoreContact}
                    onChange={(e) => setEditStoreContact(e.target.value)}
                    placeholder="e.g. Ramesh Shrestha"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    value={editStorePhone}
                    onChange={(e) => setEditStorePhone(e.target.value)}
                    placeholder="+977-9841..."
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleDeleteStore(editingStore.id, editingStore.name)}
                  className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete Store
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingStore(null)}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-brand-600 px-5 py-2 text-xs font-semibold text-white hover:bg-brand-700 shadow"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm Store Removal Modal */}
      <ConfirmModal
        isOpen={!!deleteConfirmStore}
        title="Remove Store"
        message={`Are you sure you want to remove store "${deleteConfirmStore?.name}" from the active database? This will remove it from daily beat routes.`}
        confirmLabel="Remove Store"
        cancelLabel="Cancel"
        isDestructive={true}
        onConfirm={confirmDeleteStore}
        onCancel={() => setDeleteConfirmStore(null)}
      />
    </div>
    </PageGuard>
  );
}
