'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { toast } from '@/components/common/Toast';
import ConfirmModal from '@/components/common/ConfirmModal';
import {
  Distributor,
  Branch,
  Retailer,
  BrandCode,
  ContactRole,
  VendorContact,
  StoreType,
  DefaultMargins,
} from '@/lib/types';
import { canPerform, canPerformAction, getScope, hasAccess, isSuperAdmin } from '@/lib/permissions';
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
  Star,
  Flag,
  AlertTriangle,
  Layers,
  Sparkles,
  Percent,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';

export default function StoresPage() {
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [currentUser] = useState(() => db.getCurrentUser());
  const isSuper = isSuperAdmin(currentUser);
  const isSalesOfficer = !canPerform(currentUser, 'stores', 'DELETE') && getScope(currentUser, 'stores') === 'OWN';
  const canCreateStores = canPerform(currentUser, 'stores', 'CREATE');

  const [distributors, setDistributors] = useState(() => db.getDistributors());
  const [branches, setBranches] = useState(() => db.getBranches());
  const [retailers, setRetailers] = useState(() => db.getRetailers());
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'ALL' | 'DISTRIBUTORS' | 'RETAILERS'>(isSalesOfficer ? 'RETAILERS' : 'ALL');
  const officers = db.getUsers().filter((u) => hasAccess(u, 'beat_plans') || u.id.startsWith('user_'));
  const storeCategories = db.getStoreCategories().filter((c) => c.isActive);

  // Contact Flagging Modal State
  const [flagModalTarget, setFlagModalTarget] = useState<{
    entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER';
    entityId: string;
    contactId: string;
    name: string;
  } | null>(null);
  const [flagReason, setFlagReason] = useState('No longer works here');

  // Pending Removals Modal (Admin only)
  const [showPendingRemovalsModal, setShowPendingRemovalsModal] = useState(false);
  const [pendingRemovals, setPendingRemovals] = useState(() => db.getPendingContactRemovals());
  const [transferTargetBranchId, setTransferTargetBranchId] = useState('');

  // Add Contact Modal State
  const [targetStoreForContact, setTargetStoreForContact] = useState<{
    id: string;
    type: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER';
    name: string;
  } | null>(null);
  const [newContactName, setNewContactName] = useState('');
  const [newContactRole, setNewContactRole] = useState<ContactRole>('Accounts / Cheque');
  const [newContactPhone, setNewContactPhone] = useState('+977-98');

  // Add Store Modals
  const [showFieldAddModal, setShowFieldAddModal] = useState(false);
  const [showAdminAddModal, setShowAdminAddModal] = useState(false);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [selectedDistId, setSelectedDistId] = useState<string>('');

  const systemBrands = db.getBrands('ACTIVE');
  const [fieldStoreName, setFieldStoreName] = useState('');
  const [fieldCategory, setFieldCategory] = useState(storeCategories[0]?.name || 'Kirana');
  const [fieldCity, setFieldCity] = useState('Kathmandu');
  const [fieldArea, setFieldArea] = useState('');
  const [fieldAddress, setFieldAddress] = useState('');
  const [fieldLat, setFieldLat] = useState<number | null>(null);
  const [fieldLng, setFieldLng] = useState<number | null>(null);
  const [fieldBrands, setFieldBrands] = useState<BrandCode[]>(() => systemBrands.map((b) => b.code));
  const [fieldParentDistributorId, setFieldParentDistributorId] = useState('');
  const [fieldContacts, setFieldContacts] = useState<{ name: string; role: string; phone: string }[]>([
    { name: '', role: 'Store Owner', phone: '' },
  ]);
  const [fieldNotes, setFieldNotes] = useState('');

  // Super Admin Add Store Form State (Section 2d)
  const [adminStoreType, setAdminStoreType] = useState<StoreType>('STANDALONE_RETAILER');
  const [adminStoreName, setAdminStoreName] = useState('');
  const [adminCategory, setAdminCategory] = useState(storeCategories[0]?.name || 'Supermarket');
  const [adminCity, setAdminCity] = useState('Kathmandu');
  const [adminArea, setAdminArea] = useState('');
  const [adminAddress, setAdminAddress] = useState('');
  const [adminHasBranches, setAdminHasBranches] = useState(false);
  const [adminPaymentTerms, setAdminPaymentTerms] = useState('15-day credit');
  const [adminDefaultMargins, setAdminDefaultMargins] = useState<DefaultMargins>(() => {
    const margins: DefaultMargins = {};
    systemBrands.forEach((b) => {
      margins[b.code] = { pct: 15, type: 'MARKDOWN' };
    });
    return margins;
  });
  const [adminContactName, setAdminContactName] = useState('');
  const [adminContactRole, setAdminContactRole] = useState('Store Owner');
  const [adminContactPhone, setAdminContactPhone] = useState('');

  // Commercial Terms Modal State (Section 4)
  const [commercialTermsStore, setCommercialTermsStore] = useState<{
    entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER';
    entityId: string;
    name: string;
    margins: DefaultMargins;
    paymentTerms: string;
  } | null>(null);

  // Edit Store State
  const [editingStore, setEditingStore] = useState<Retailer | null>(null);
  const [editStoreName, setEditStoreName] = useState('');
  const [editStoreType, setEditStoreType] = useState<Retailer['type']>('GT');
  const [editStoreArea, setEditStoreArea] = useState('');
  const [editStoreAddress, setEditStoreAddress] = useState('');
  const [editStoreContact, setEditStoreContact] = useState('');
  const [editStorePhone, setEditStorePhone] = useState('');
  const [deleteConfirmStore, setDeleteConfirmStore] = useState<{ id: string; name: string } | null>(null);

  const refreshData = () => {
    setDistributors([...db.getDistributors()]);
    setBranches([...db.getBranches()]);
    setRetailers([...db.getRetailers()]);
    setPendingRemovals([...db.getPendingContactRemovals()]);
  };

  useEffect(() => {
    db.syncWithSupabase().catch(() => {}).then(() => refreshData());
    refreshData();
    window.addEventListener('bb-db-updated', refreshData);
    return () => {
      window.removeEventListener('bb-db-updated', refreshData);
    };
  }, []);

  const handlePinLocation = () => {
    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setFieldLat(pos.coords.latitude);
          setFieldLng(pos.coords.longitude);
          toast.success(`📍 Captured GPS: ${pos.coords.latitude.toFixed(4)}°N, ${pos.coords.longitude.toFixed(4)}°E`);
        },
        (err) => {
          toast.error('Could not acquire device GPS. Using area default.');
          setFieldLat(27.7172);
          setFieldLng(85.324);
        }
      );
    }
  };

  const handleToggleBrand = (b: BrandCode) => {
    if (fieldBrands.includes(b)) {
      setFieldBrands(fieldBrands.filter((x) => x !== b));
    } else {
      setFieldBrands([...fieldBrands, b]);
    }
  };

  const handleSelectAllBrands = () => {
    if (fieldBrands.length >= systemBrands.length) {
      setFieldBrands([]);
    } else {
      setFieldBrands(systemBrands.map((b) => b.code));
    }
  };

  // Section 2c: Save Field Add Store
  const handleSaveFieldStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldStoreName.trim()) {
      toast.error('Please enter the store name.');
      return;
    }

    guardedSubmit(async () => {
      const firstContact = fieldContacts[0] || { name: 'Owner', role: 'Store Owner', phone: '+977-9800000000' };

      const newRet = db.addRetailer({
        name: fieldStoreName.trim(),
        type: 'GT',
        storeType: 'STANDALONE_RETAILER',
        category: fieldCategory,
        city: fieldCity,
        area: fieldArea || 'Kathmandu',
        address: fieldAddress || `${fieldArea}, ${fieldCity}`,
        lat: fieldLat || 27.7172 + (Math.random() - 0.5) * 0.04,
        lng: fieldLng || 85.324 + (Math.random() - 0.5) * 0.04,
        assignedOfficerId: currentUser.id,
        assignedOfficerName: currentUser.fullName,
        contactName: firstContact.name || 'Store Owner',
        contactRole: firstContact.role,
        contactPhone: firstContact.phone || '+977-9800000000',
        contacts: fieldContacts.map((c, i) => ({
          id: `cnt_${Date.now()}_${i}`,
          name: c.name || 'Store Owner',
          role: c.role as ContactRole,
          phone: c.phone || '+977-9800000000',
          isPrimary: i === 0,
        })),
        brandsStocked: fieldBrands.length > 0 ? fieldBrands : (systemBrands[0]?.code ? [systemBrands[0].code] : []),
        distributorId: fieldParentDistributorId || undefined,
        distributorName: fieldParentDistributorId
          ? distributors.find((d) => d.id === fieldParentDistributorId)?.name
          : undefined,
        notes: fieldNotes,
      });

      toast.success(`✓ "${newRet.name}" saved! Added to store directory and your beat route.`);
      setShowFieldAddModal(false);
      // Reset
      setFieldStoreName('');
      setFieldArea('');
      setFieldAddress('');
      setFieldLat(null);
      setFieldLng(null);
      setFieldContacts([{ name: '', role: 'Store Owner', phone: '' }]);
      setFieldNotes('');
      refreshData();
    });
  };

  // Section 2d: Save Super Admin Add Store
  const handleSaveAdminStore = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminStoreName.trim()) {
      toast.error('Please enter the store name.');
      return;
    }

    guardedSubmit(async () => {
      if (adminStoreType === 'DISTRIBUTOR') {
        db.addDistributor({
          name: adminStoreName.trim(),
          type: adminCategory === 'Supermarket' ? 'Retail Chain' : 'Distributor',
          storeType: 'DISTRIBUTOR',
          city: adminCity,
          address: adminAddress || `${adminArea}, ${adminCity}`,
          contactName: adminContactName || 'Director',
          contactRole: adminContactRole,
          contactPhone: adminContactPhone || '+977-9800000000',
          contactEmail: 'accounts@distributor.np',
          brandsCarried: systemBrands.map((b) => b.code),
          creditTerms: adminPaymentTerms,
          defaultMargins: adminDefaultMargins,
          hasBranches: adminHasBranches,
          contacts: [
            {
              id: `cnt_${Date.now()}`,
              name: adminContactName || 'Director',
              role: adminContactRole as ContactRole,
              phone: adminContactPhone || '+977-9800000000',
              isPrimary: true,
            },
          ],
        });
        toast.success(`✓ Distributor "${adminStoreName}" created with custom commercial terms.`);
      } else if (adminStoreType === 'CHAIN_STORE') {
        db.addDistributor({
          name: adminStoreName.trim(),
          type: 'Retail Chain',
          storeType: 'CHAIN_STORE',
          city: adminCity,
          address: adminAddress || `${adminArea}, ${adminCity}`,
          contactName: adminContactName || 'Supermarket Manager',
          contactRole: adminContactRole,
          contactPhone: adminContactPhone || '+977-9800000000',
          contactEmail: 'procurement@chain.np',
          brandsCarried: systemBrands.map((b) => b.code),
          creditTerms: adminPaymentTerms,
          defaultMargins: adminDefaultMargins,
          hasBranches: true,
          contacts: [
            {
              id: `cnt_${Date.now()}`,
              name: adminContactName || 'Supermarket Manager',
              role: adminContactRole as ContactRole,
              phone: adminContactPhone || '+977-9800000000',
              isPrimary: true,
            },
          ],
        });
        toast.success(`✓ Chain Store "${adminStoreName}" created.`);
      } else {
        db.addRetailer({
          name: adminStoreName.trim(),
          type: 'GT',
          storeType: 'STANDALONE_RETAILER',
          category: adminCategory,
          city: adminCity,
          area: adminArea || 'Kathmandu',
          address: adminAddress || `${adminArea}, ${adminCity}`,
          lat: 27.7172,
          lng: 85.324,
          assignedOfficerId: currentUser.id,
          assignedOfficerName: currentUser.fullName,
          contactName: adminContactName || 'Store Owner',
          contactRole: adminContactRole,
          contactPhone: adminContactPhone || '+977-9800000000',
          contacts: [
            {
              id: `cnt_${Date.now()}`,
              name: adminContactName || 'Store Owner',
              role: adminContactRole as ContactRole,
              phone: adminContactPhone || '+977-9800000000',
              isPrimary: true,
            },
          ],
          brandsStocked: systemBrands.map((b) => b.code),
          creditTerms: adminPaymentTerms,
          defaultMargins: adminDefaultMargins,
        });
        toast.success(`✓ Standalone Retailer "${adminStoreName}" created.`);
      }

      setShowAdminAddModal(false);
      refreshData();
    });
  };

  // Section 3: Contact Actions
  const handleSetPrimary = (entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER', entityId: string, contactId: string) => {
    db.setPrimaryContact(entityType, entityId, contactId);
    toast.success('★ Marked as primary contact for store communication.');
    refreshData();
  };

  const handleFlagContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flagModalTarget) return;

    db.flagContactForRemoval(
      flagModalTarget.entityType,
      flagModalTarget.entityId,
      flagModalTarget.contactId,
      flagReason,
      currentUser
    );
    toast.info(`Contact flagged for removal: "${flagReason}". Sent for admin review.`);
    setFlagModalTarget(null);
    refreshData();
  };

  const handleApproveRemoval = (item: typeof pendingRemovals[0]) => {
    db.approveContactRemoval(item.entityType, item.entityId, item.contact.id);
    toast.success(`✓ Contact "${item.contact.name}" removed from ${item.entityName}.`);
    refreshData();
  };

  const handleRejectRemoval = (item: typeof pendingRemovals[0]) => {
    db.rejectContactRemoval(item.entityType, item.entityId, item.contact.id);
    toast.info(`Flag cleared for "${item.contact.name}".`);
    refreshData();
  };

  const handleTransferContact = (item: typeof pendingRemovals[0]) => {
    if (!transferTargetBranchId) {
      toast.error('Please choose a branch to transfer this contact to.');
      return;
    }
    const success = db.transferContactToBranch(item.entityType, item.entityId, transferTargetBranchId, item.contact.id);
    if (success) {
      toast.success(`✓ Contact transferred to target branch.`);
      setTransferTargetBranchId('');
      refreshData();
    }
  };

  // Section 4: Save Commercial Terms
  const handleSaveCommercialTerms = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commercialTermsStore) return;
    guardedSubmit(async () => {
      db.updateStoreCommercialTerms(
        commercialTermsStore.entityType,
        commercialTermsStore.entityId,
        commercialTermsStore.margins,
        commercialTermsStore.paymentTerms
      );
      toast.success(`✓ Commercial terms updated for ${commercialTermsStore.name}.`);
      setCommercialTermsStore(null);
      refreshData();
    });
  };

  // Filtered lists
  const filteredRetailers = retailers.filter((r) => {
    if (isSalesOfficer && r.assignedOfficerId !== currentUser.id && r.assignedOfficerName !== currentUser.fullName) {
      return false;
    }
    return (
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.area.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.category && r.category.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  const filteredDistributors = distributors.filter(
    (d) =>
      d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.city.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <PageGuard feature="stores">
      <div className="space-y-6 pb-20">
        <Breadcrumbs
          items={[
            { label: 'Offline Sales', href: '/offline-sales/stores' },
            { label: 'Store & Distributor Directory' },
          ]}
        />

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Stores &amp; Distribution Hierarchy
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
              Distributors &rarr; Chain Stores &rarr; Standalone GT Retailers across Nepal.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Primary Action Button */}
            {canCreateStores && (
              <button
                type="button"
                onClick={() => {
                  if (isSalesOfficer && !isSuper) {
                    setShowFieldAddModal(true);
                  } else {
                    setShowAdminAddModal(true);
                  }
                }}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-blue-700 min-h-[44px]"
              >
                <Plus className="h-4 w-4" />
                <span>{isSalesOfficer && !isSuper ? 'Add Store (Field)' : 'Add New Store'}</span>
              </button>
            )}

            {/* Admin Extra Actions */}
            {!isSalesOfficer && (
              <button
                type="button"
                onClick={() => setShowFieldAddModal(true)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 min-h-[44px]"
              >
                <Store className="h-4 w-4 text-slate-500" />
                <span>Field Form Mode</span>
              </button>
            )}
          </div>
        </div>

        {/* Section 3c: Admin Pending Contact Removals Alert Banner */}
        {!isSalesOfficer && pendingRemovals.length > 0 && (
          <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-200/60 text-amber-900 shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <strong className="font-bold text-sm">
                  {pendingRemovals.length} Contact Removal Request{pendingRemovals.length > 1 ? 's' : ''} Pending
                </strong>
                <p className="text-[11px] text-amber-800 mt-0.5">
                  Field sales officers flagged contacts as no longer working or duplicate.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowPendingRemovalsModal(true)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs shrink-0"
            >
              Review Requests ({pendingRemovals.length})
            </button>
          </div>
        )}

        {/* Filters & Search */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-xs">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search store name, area, category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 text-xs w-full sm:w-auto">
            <button
              onClick={() => setFilterType('ALL')}
              className={`flex-1 sm:flex-none rounded-lg px-3 py-1.5 font-bold transition ${
                filterType === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Outlets ({distributors.length + retailers.length})
            </button>
            <button
              onClick={() => setFilterType('DISTRIBUTORS')}
              className={`flex-1 sm:flex-none rounded-lg px-3 py-1.5 font-bold transition ${
                filterType === 'DISTRIBUTORS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Distributors &amp; Chains ({distributors.length})
            </button>
            <button
              onClick={() => setFilterType('RETAILERS')}
              className={`flex-1 sm:flex-none rounded-lg px-3 py-1.5 font-bold transition ${
                filterType === 'RETAILERS' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Standalone Retailers ({retailers.length})
            </button>
          </div>
        </div>

        {/* SECTION 1: DISTRIBUTORS & CHAIN STORES */}
        {(filterType === 'ALL' || filterType === 'DISTRIBUTORS') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Distributors &amp; Retail Chains
              </h2>
              <span className="text-xs text-slate-500 font-medium">
                {branches.length} branches tracked
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDistributors.map((dist) => {
                const distBranches = branches.filter(
                  (b) =>
                    b.distributorId === dist.id &&
                    (!isSalesOfficer || b.assignedOfficerId === currentUser.id || b.assignedOfficerName === currentUser.fullName)
                );

                return (
                  <div key={dist.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-bold text-slate-900 text-base">{dist.name}</h3>
                          <span className="rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 text-[10px] font-bold border border-blue-200">
                            {dist.storeType === 'CHAIN_STORE' ? 'Chain Store' : 'Bulk Distributor'}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          Location: <strong className="text-slate-700">{dist.city}</strong> • Terms:{' '}
                          <span className="font-semibold text-slate-800">{dist.creditTerms || '30-day credit'}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setCommercialTermsStore({
                              entityType: 'DISTRIBUTOR',
                              entityId: dist.id,
                              name: dist.name,
                              margins: dist.defaultMargins || {},
                              paymentTerms: dist.creditTerms || '30-day credit',
                            })
                          }
                          className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-1"
                        >
                          <Percent className="w-3.5 h-3.5 text-slate-400" />
                          <span>Terms</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            setTargetStoreForContact({
                              id: dist.id,
                              type: 'DISTRIBUTOR',
                              name: dist.name,
                            })
                          }
                          className="rounded-xl border border-slate-200 px-2.5 py-1.5 text-xs font-bold text-blue-600 hover:bg-blue-50"
                        >
                          + Contact
                        </button>
                      </div>
                    </div>

                    {/* Section 3: Contact Directory with Primary Star & Flag */}
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-200/60 space-y-2">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Store Contacts ({dist.contacts?.length || 1})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {dist.contacts && dist.contacts.length > 0 ? (
                          dist.contacts.map((c) => (
                            <ContactPill
                              key={c.id}
                              contact={c}
                              entityType="DISTRIBUTOR"
                              entityId={dist.id}
                              onFlag={(target) =>
                                setFlagModalTarget({
                                  entityType: 'DISTRIBUTOR',
                                  entityId: dist.id,
                                  contactId: target.id,
                                  name: target.name,
                                })
                              }
                              onPrimary={(cid) => handleSetPrimary('DISTRIBUTOR', dist.id, cid)}
                            />
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">No registered contacts</span>
                        )}
                      </div>
                    </div>

                    {/* Branches List */}
                    <div className="border-t border-slate-100 pt-3">
                      <div className="text-[11px] font-bold uppercase text-slate-400 mb-2">
                        Branches ({distBranches.length})
                      </div>
                      <div className="space-y-1.5">
                        {distBranches.map((branch) => (
                          <div
                            key={branch.id}
                            className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs hover:bg-slate-100/70"
                          >
                            <div>
                              <div className="font-semibold text-slate-800">{branch.name}</div>
                              <div className="text-[11px] text-slate-500">{branch.address}</div>
                            </div>
                            <a
                              href={`https://www.google.com/maps/dir/?api=1&destination=${branch.lat},${branch.lng}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 font-bold hover:underline flex items-center gap-1"
                            >
                              <Navigation className="w-3 h-3" />
                              <span>Navigate</span>
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

        {/* SECTION 2: STANDALONE RETAILERS */}
        {(filterType === 'ALL' || filterType === 'RETAILERS') && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Standalone GT Retail Outlets ({filteredRetailers.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredRetailers.map((ret) => (
                <div key={ret.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3.5 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm">{ret.name}</h3>
                        <span className="inline-block mt-0.5 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                          {ret.category || ret.type}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setCommercialTermsStore({
                              entityType: 'RETAILER',
                              entityId: ret.id,
                              name: ret.name,
                              margins: ret.defaultMargins || {},
                              paymentTerms: ret.creditTerms || '15-day credit',
                            })
                          }
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600"
                          title="Commercial terms & default margins"
                        >
                          <Percent className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setTargetStoreForContact({
                              id: ret.id,
                              type: 'RETAILER',
                              name: ret.name,
                            })
                          }
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-blue-600 font-bold text-xs"
                          title="Add contact"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="text-xs text-slate-500">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span>{ret.address}</span>
                      </span>
                    </div>

                    {ret.distributorName && (
                      <div className="text-[11px] text-blue-700 bg-blue-50/80 px-2.5 py-1 rounded-lg font-medium">
                        Under Distributor: <strong>{ret.distributorName}</strong>
                      </div>
                    )}

                    {/* Section 3 Contacts List */}
                    <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/60 space-y-1.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Contacts ({ret.contacts?.length || 1})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {ret.contacts && ret.contacts.length > 0 ? (
                          ret.contacts.map((c) => (
                            <ContactPill
                              key={c.id}
                              contact={c}
                              entityType="RETAILER"
                              entityId={ret.id}
                              onFlag={(target) =>
                                setFlagModalTarget({
                                  entityType: 'RETAILER',
                                  entityId: ret.id,
                                  contactId: target.id,
                                  name: target.name,
                                })
                              }
                              onPrimary={(cid) => handleSetPrimary('RETAILER', ret.id, cid)}
                            />
                          ))
                        ) : (
                          <span className="text-xs text-slate-500">{ret.contactName} ({ret.contactPhone})</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Footer Action */}
                  <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <span className="text-slate-500">
                      Officer: <strong className="text-slate-700">{ret.assignedOfficerName}</strong>
                    </span>
                    <a
                      href={`https://www.google.com/maps/dir/?api=1&destination=${ret.lat},${ret.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 font-bold hover:underline flex items-center gap-1"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Navigate</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* SECTION 2c: SALES OFFICER FIELD ADD STORE MODAL */}
        {showFieldAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-lg w-full my-6 p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Add New Store (Field Officer)</h3>
                  <p className="text-xs text-slate-500">Mobile-optimized direct store creation</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFieldAddModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveFieldStore} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Store Name *</label>
                  <input
                    type="text"
                    required
                    value={fieldStoreName}
                    onChange={(e) => setFieldStoreName(e.target.value)}
                    placeholder="e.g. Annapurna General Store"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  />
                </div>

                {/* Store Type (Locked for Sales Officers per Section 2c) */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Store Type</label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 p-2 rounded-xl bg-blue-50/60 border border-blue-200 text-blue-900 font-semibold cursor-pointer">
                      <input type="radio" checked readOnly name="fieldType" className="text-blue-600" />
                      <span>● Standalone Retailer (General Trade GT Outlet)</span>
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed">
                      <span>○ Bulk Distributor</span>
                      <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded">Admin Only</span>
                    </label>
                    <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed">
                      <span>○ Multi-Branch Chain Store</span>
                      <span className="text-[10px] font-bold bg-slate-200 text-slate-600 px-2 py-0.5 rounded">Admin Only</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Store Category *</label>
                  <select
                    value={fieldCategory}
                    onChange={(e) => setFieldCategory(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-h-[44px]"
                  >
                    {storeCategories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Location Section with GPS Pin */}
                <div className="space-y-2 rounded-2xl bg-slate-50 p-3.5 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 uppercase text-[10px] tracking-wider">Store Location</span>
                    <button
                      type="button"
                      onClick={handlePinLocation}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-bold text-xs flex items-center gap-1 shadow-xs hover:bg-blue-700 min-h-[40px]"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{fieldLat ? '📍 Re-Pin GPS' : '📍 Pin Location'}</span>
                    </button>
                  </div>

                  {fieldLat && (
                    <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                      ✓ GPS Coordinates captured: {fieldLat.toFixed(4)}°N, {fieldLng?.toFixed(4)}°E
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">City</label>
                      <input
                        type="text"
                        value={fieldCity}
                        onChange={(e) => setFieldCity(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Area / Ward</label>
                      <input
                        type="text"
                        placeholder="e.g. Baneshwor"
                        value={fieldArea}
                        onChange={(e) => setFieldArea(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">Full Street Address</label>
                    <input
                      type="text"
                      placeholder="e.g. Near Krishna Mandir, New Baneshwor"
                      value={fieldAddress}
                      onChange={(e) => setFieldAddress(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                </div>

                {/* Brands Stocked */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="font-bold text-slate-700">Brands Stocked</label>
                    <button
                      type="button"
                      onClick={handleSelectAllBrands}
                      className="text-xs text-blue-600 font-semibold hover:underline"
                    >
                      {fieldBrands.length >= systemBrands.length && systemBrands.length > 0 ? 'Clear All' : 'Select All'}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {systemBrands.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No brands configured yet. Add brands in Settings.</p>
                    ) : (
                      systemBrands.map((b) => (
                        <label
                          key={b.code}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer font-bold ${
                            fieldBrands.includes(b.code)
                              ? 'bg-blue-50 border-blue-300 text-blue-800'
                              : 'bg-white border-slate-200 text-slate-600'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={fieldBrands.includes(b.code)}
                            onChange={() => handleToggleBrand(b.code)}
                            className="rounded text-blue-600"
                          />
                          <span>{b.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                {/* Under Distributor */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Under a Distributor? (Optional)</label>
                  <select
                    value={fieldParentDistributorId}
                    onChange={(e) => setFieldParentDistributorId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white min-h-[44px]"
                  >
                    <option value="">None (Independent Direct GT)</option>
                    {distributors.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.city})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Section 3 Contacts List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700">Store Contacts</label>
                    <button
                      type="button"
                      onClick={() => setFieldContacts([...fieldContacts, { name: '', role: 'Buyer', phone: '' }])}
                      className="text-xs text-blue-600 font-bold hover:underline"
                    >
                      + Add Another Contact
                    </button>
                  </div>

                  {fieldContacts.map((c, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="col-span-5">
                        <input
                          type="text"
                          placeholder="Contact Name"
                          value={c.name}
                          onChange={(e) => {
                            const updated = [...fieldContacts];
                            updated[idx].name = e.target.value;
                            setFieldContacts(updated);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                      <div className="col-span-3">
                        <select
                          value={c.role}
                          onChange={(e) => {
                            const updated = [...fieldContacts];
                            updated[idx].role = e.target.value;
                            setFieldContacts(updated);
                          }}
                          className="w-full px-2 py-1.5 rounded-lg border border-slate-200 bg-white"
                        >
                          <option value="Store Owner">Owner</option>
                          <option value="Store Manager">Manager</option>
                          <option value="Buyer">Buyer</option>
                          <option value="Cashier">Cashier</option>
                        </select>
                      </div>
                      <div className="col-span-4">
                        <input
                          type="tel"
                          placeholder="98XXXXXXXX"
                          value={c.phone}
                          onChange={(e) => {
                            const updated = [...fieldContacts];
                            updated[idx].phone = e.target.value;
                            setFieldContacts(updated);
                          }}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Notes</label>
                  <input
                    type="text"
                    placeholder="e.g. High footfall near bus stop, prefers Friday visits"
                    value={fieldNotes}
                    onChange={(e) => setFieldNotes(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white"
                  />
                </div>

                <div className="pt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowFieldAddModal(false)}
                    className="w-1/3 py-3 rounded-2xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50 min-h-[52px]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="w-2/3 py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md min-h-[52px]"
                  >
                    ✓ Save Store
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SECTION 2d: SUPER ADMIN ADD STORE MODAL */}
        {showAdminAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-xl w-full my-6 p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Add Store Account (Admin Hub)</h3>
                  <p className="text-xs text-slate-500">Create distributors, chain stores, and define brand margins</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdminAddModal(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveAdminStore} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs">
                {/* Store Type Selection */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">Select Store Entity Type *</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdminStoreType('STANDALONE_RETAILER')}
                      className={`p-3 rounded-2xl border text-center font-bold transition ${
                        adminStoreType === 'STANDALONE_RETAILER'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Standalone GT
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminStoreType('DISTRIBUTOR')}
                      className={`p-3 rounded-2xl border text-center font-bold transition ${
                        adminStoreType === 'DISTRIBUTOR'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Bulk Distributor
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdminStoreType('CHAIN_STORE')}
                      className={`p-3 rounded-2xl border text-center font-bold transition ${
                        adminStoreType === 'CHAIN_STORE'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Retail Chain
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Entity Name *</label>
                  <input
                    type="text"
                    required
                    value={adminStoreName}
                    onChange={(e) => setAdminStoreName(e.target.value)}
                    placeholder="e.g. Bhatbhateni Supermarket or Krishna Store"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Category</label>
                    <select
                      value={adminCategory}
                      onChange={(e) => setAdminCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    >
                      {storeCategories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Payment Credit Terms</label>
                    <select
                      value={adminPaymentTerms}
                      onChange={(e) => setAdminPaymentTerms(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    >
                      <option value="COD">Cash on Delivery (COD)</option>
                      <option value="7-day credit">7-Day Net Credit</option>
                      <option value="15-day credit">15-Day Net Credit</option>
                      <option value="30-day credit">30-Day Net Credit</option>
                    </select>
                  </div>
                </div>

                {/* Has Branches Toggle */}
                {adminStoreType !== 'STANDALONE_RETAILER' && (
                  <label className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 font-semibold cursor-pointer">
                    <input
                      type="checkbox"
                      checked={adminHasBranches}
                      onChange={(e) => setAdminHasBranches(e.target.checked)}
                      className="rounded text-blue-600"
                    />
                    <span>Has multiple physical branches across Kathmandu</span>
                  </label>
                )}

                {/* Section 4: Default Margins Per Brand */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 uppercase text-[10px] tracking-wider">
                      Commercial Terms (Default Brand Margins)
                    </span>
                  </div>

                  <div className="space-y-2">
                    {systemBrands.length === 0 ? (
                      <p className="text-xs text-slate-500 italic p-2 bg-slate-50 rounded-xl">No brands configured yet. Add brands in Settings.</p>
                    ) : (
                      systemBrands.map((b) => {
                        const brandKey = b.code;
                        const cur = adminDefaultMargins[brandKey] || { pct: 15, type: 'MARKDOWN' };
                        return (
                          <div key={brandKey} className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200">
                            <span className="font-bold text-slate-800">{b.name}</span>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <input
                                type="number"
                                value={cur.pct}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  setAdminDefaultMargins({
                                    ...adminDefaultMargins,
                                    [brandKey]: { ...cur, pct: val },
                                  });
                                }}
                                className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-right font-bold"
                              />
                              <span className="font-semibold">%</span>
                            </div>
                            <div className="flex rounded-lg border border-slate-200 p-0.5 bg-slate-100">
                              <button
                                type="button"
                                onClick={() =>
                                  setAdminDefaultMargins({
                                    ...adminDefaultMargins,
                                    [brandKey]: { ...cur, type: 'MARKDOWN' },
                                  })
                                }
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  cur.type === 'MARKDOWN' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500'
                                }`}
                              >
                                Markdown
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setAdminDefaultMargins({
                                    ...adminDefaultMargins,
                                    [brandKey]: { ...cur, type: 'MARKUP' },
                                  })
                                }
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  cur.type === 'MARKUP' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-500'
                                }`}
                              >
                                Markup
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                </div>

                {/* Primary Contact */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Primary Contact Name</label>
                    <input
                      type="text"
                      placeholder="e.g. Ramesh Shrestha"
                      value={adminContactName}
                      onChange={(e) => setAdminContactName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Contact Phone</label>
                    <input
                      type="tel"
                      placeholder="98XXXXXXXX"
                      value={adminContactPhone}
                      onChange={(e) => setAdminContactPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAdminAddModal(false)}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold shadow-xs flex items-center gap-2"
                  >
                    {isSubmitting && (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    )}
                    {isSubmitting ? 'Creating...' : 'Create Store Entity'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SECTION 3: FLAG CONTACT FOR REMOVAL MODAL */}
        {flagModalTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Flag Contact for Removal</h3>
                  <p className="text-xs text-slate-500">{flagModalTarget.name}</p>
                </div>
                <button onClick={() => setFlagModalTarget(null)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleFlagContact} className="py-4 space-y-3.5 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">Reason for Removal *</label>
                  <select
                    value={flagReason}
                    onChange={(e) => setFlagReason(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="No longer works here">No longer works here</option>
                    <option value="Number changed / Invalid">Number changed / Invalid</option>
                    <option value="Duplicate contact record">Duplicate contact record</option>
                    <option value="Transferred to another branch">Transferred to another branch</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px]">
                  ℹ️ This request will be submitted to the Admin. The contact will display a yellow &quot;Flagged&quot; badge until approved.
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setFlagModalTarget(null)}
                    className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs"
                  >
                    Submit Removal Flag
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SECTION 3c: ADMIN PENDING CONTACT REMOVALS MODAL */}
        {showPendingRemovalsModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Pending Contact Removals</h3>
                  <p className="text-xs text-slate-500">Approve removal, reject, or transfer contact to another branch</p>
                </div>
                <button
                  onClick={() => setShowPendingRemovalsModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1 text-xs">
                {pendingRemovals.length === 0 ? (
                  <div className="text-center py-10 text-slate-400">No pending removal requests.</div>
                ) : (
                  pendingRemovals.map((item) => (
                    <div key={item.contact.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                      <div className="flex items-start justify-between">
                        <div>
                          <strong className="text-sm font-bold text-slate-900">{item.entityName}</strong>
                          <div className="text-xs text-slate-700 mt-0.5">
                            {item.contact.name} ({item.contact.role}) — ☎ {item.contact.phone}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                          Flagged: {item.contact.flaggedReason || 'Removal'}
                        </span>
                      </div>

                      <div className="text-[11px] text-slate-500">
                        Flagged by: <strong>{item.contact.flaggedByName || 'Sales Officer'}</strong>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => handleApproveRemoval(item)}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs"
                        >
                          ✓ Approve Removal
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRejectRemoval(item)}
                          className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl"
                        >
                          ✕ Reject
                        </button>

                        <div className="flex items-center gap-1.5 ml-auto">
                          <select
                            value={transferTargetBranchId}
                            onChange={(e) => setTransferTargetBranchId(e.target.value)}
                            className="px-2 py-1.5 rounded-xl border border-slate-200 bg-white text-[11px]"
                          >
                            <option value="">Select Branch to Transfer...</option>
                            {branches.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.name}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleTransferContact(item)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-xs"
                          >
                            Transfer
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* SECTION 4: COMMERCIAL TERMS & MARGINS MODAL */}
        {commercialTermsStore && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Commercial Terms &amp; Margins</h3>
                  <p className="text-xs text-slate-500">{commercialTermsStore.name}</p>
                </div>
                <button onClick={() => setCommercialTermsStore(null)} className="p-1 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCommercialTerms} className="py-4 space-y-4 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Payment Credit Terms</label>
                  <select
                    value={commercialTermsStore.paymentTerms}
                    onChange={(e) =>
                      setCommercialTermsStore({ ...commercialTermsStore, paymentTerms: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
                  >
                    <option value="COD">Cash on Delivery (COD)</option>
                    <option value="7-day credit">7-Day Net Credit</option>
                    <option value="15-day credit">15-Day Net Credit</option>
                    <option value="30-day credit">30-Day Net Credit</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">Per-Brand Default Margin</label>
                  {systemBrands.length === 0 ? (
                    <p className="text-xs text-slate-500 italic p-2 bg-slate-50 rounded-xl">No brands configured yet. Add brands in Settings.</p>
                  ) : (
                    systemBrands.map((brandObj) => {
                      const b = brandObj.code;
                      const cur = commercialTermsStore.margins[b] || { pct: 15, type: 'MARKDOWN' };
                      return (
                        <div key={b} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                          <span className="font-bold text-slate-800">{brandObj.name}</span>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            value={cur.pct}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setCommercialTermsStore({
                                ...commercialTermsStore,
                                margins: {
                                  ...commercialTermsStore.margins,
                                  [b]: { ...cur, pct: val },
                                },
                              });
                            }}
                            className="w-14 px-2 py-1 rounded-lg border border-slate-200 bg-white text-right font-bold"
                          />
                          <span className="font-bold">%</span>
                          <div className="flex rounded-lg border border-slate-200 p-0.5 bg-white">
                            <button
                              type="button"
                              onClick={() =>
                                setCommercialTermsStore({
                                  ...commercialTermsStore,
                                  margins: {
                                    ...commercialTermsStore.margins,
                                    [b]: { ...cur, type: 'MARKDOWN' },
                                  },
                                })
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                cur.type === 'MARKDOWN' ? 'bg-blue-600 text-white' : 'text-slate-500'
                              }`}
                            >
                              MD
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCommercialTermsStore({
                                  ...commercialTermsStore,
                                  margins: {
                                    ...commercialTermsStore.margins,
                                    [b]: { ...cur, type: 'MARKUP' },
                                  },
                                })
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                cur.type === 'MARKUP' ? 'bg-blue-600 text-white' : 'text-slate-500'
                              }`}
                            >
                              MU
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCommercialTermsStore(null)}
                    className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold rounded-xl shadow-xs flex items-center gap-2"
                  >
                    {isSubmitting && (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    )}
                    {isSubmitting ? 'Saving...' : 'Save Terms'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ADD CONTACT MODAL */}
        {targetStoreForContact && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
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

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newContactName.trim()) return;
                  db.addVendorContact(targetStoreForContact.type, targetStoreForContact.id, {
                    name: newContactName.trim(),
                    role: newContactRole,
                    phone: newContactPhone.trim(),
                    isPrimary: false,
                  });
                  toast.success(`✓ Contact ${newContactName} added to ${targetStoreForContact.name}.`);
                  setTargetStoreForContact(null);
                  setNewContactName('');
                  refreshData();
                }}
                className="py-4 space-y-3 text-xs"
              >
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Giri"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Role / Designation *</label>
                  <select
                    value={newContactRole}
                    onChange={(e) => setNewContactRole(e.target.value as ContactRole)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                  >
                    <option value="Accounts / Cheque">Accounts / Cheque</option>
                    <option value="Store Manager">Store Manager</option>
                    <option value="Floor Supervisor">Floor Supervisor</option>
                    <option value="Owner">Owner / Proprietor</option>
                    <option value="Receiving Bay">Receiving Bay</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setTargetStoreForContact(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="rounded-xl bg-blue-600 px-5 py-2 font-bold text-white hover:bg-blue-700 shadow-xs"
                  >
                    Save Contact
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </PageGuard>
  );
}

// Section 3: Contact Pill Component
function ContactPill({
  contact,
  entityType,
  entityId,
  onFlag,
  onPrimary,
}: {
  contact: VendorContact;
  entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER';
  entityId: string;
  onFlag: (c: VendorContact) => void;
  onPrimary: (contactId: string) => void;
}) {
  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-xs border transition ${
        contact.isFlaggedForRemoval
          ? 'bg-amber-50 border-amber-300 text-amber-900'
          : contact.isPrimary
          ? 'bg-blue-50 border-blue-200 text-blue-900 font-medium'
          : 'bg-white border-slate-200 text-slate-800'
      }`}
    >
      <button
        type="button"
        title={contact.isPrimary ? 'Primary Contact' : 'Set as Primary'}
        onClick={() => onPrimary(contact.id)}
        className={`p-0.5 rounded hover:bg-slate-100 ${contact.isPrimary ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}
      >
        <Star className={`w-3.5 h-3.5 ${contact.isPrimary ? 'fill-amber-400' : ''}`} />
      </button>

      <span className="font-bold">{contact.name}</span>
      <span className="text-[10px] text-slate-500">({contact.role})</span>

      <a
        href={`tel:${contact.phone}`}
        className="text-emerald-700 font-bold hover:underline flex items-center gap-0.5 ml-1"
      >
        <Phone className="w-3 h-3 inline" />
        {contact.phone}
      </a>

      {contact.isFlaggedForRemoval ? (
        <span
          className="ml-1 px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-200 text-amber-900"
          title={`Flagged reason: ${contact.flaggedReason || 'Removal requested'}`}
        >
          Flagged
        </span>
      ) : (
        <button
          type="button"
          title="Flag contact for removal"
          onClick={() => onFlag(contact)}
          className="ml-1 text-slate-400 hover:text-rose-600 p-0.5 rounded"
        >
          <Flag className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
