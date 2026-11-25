'use client';

import NumberInput from '@/components/common/NumberInput';
import PagedList from '@/components/common/PagedList';
import Portal from '@/components/common/Portal';
import InfoTip from '@/components/common/InfoTip';
import DownloadButton from '@/components/common/DownloadButton';
import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { validGpsCoordinates } from '@/lib/gps-validation';
import { analyzeStoreArea } from '@/lib/area-selling';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { toast } from '@/components/common/Toast';
import ConfirmModal from '@/components/common/ConfirmModal';
import SearchSelect from '@/components/common/SearchSelect';
import AddOutletModal from '@/components/stores/AddOutletModal';
import { STORE_CHANNELS, channelLabel, channelOfDistributor, channelOfRetailer, missingDistributor, storeChannel } from '@/lib/store-channels';
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
  Lightbulb,
  Percent, Info } from 'lucide-react';
import StoreDeleteButton from '@/components/stores/StoreDeleteButton';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import { useSubmitGuard } from '@/hooks/useSubmitGuard';

export default function StoresPage() {
  const { isSubmitting, guardedSubmit } = useSubmitGuard();
  const [currentUser, setCurrentUser] = useState(() => db.getCurrentUser());
  const isSuper = isSuperAdmin(currentUser);
  const isSalesOfficer = !canPerform(currentUser, 'stores', 'DELETE') && getScope(currentUser, 'stores') === 'OWN';
  const canCreateStores = canPerform(currentUser, 'stores', 'CREATE');
  // Distributors and MT chains are a separate permission ("Distributors & chains" page, Add).
  const canCreateAccounts = canPerform(currentUser, 'distributors', 'CREATE');
  const canEditStores = canPerform(currentUser, 'stores', 'EDIT');
  const canEditAccounts = canPerform(currentUser, 'distributors', 'EDIT');

  const [distributors, setDistributors] = useState(() => db.getDistributors());
  const [branches, setBranches] = useState(() => db.getBranches());
  const [retailers, setRetailers] = useState(() => db.getRetailers());
  const [searchTerm, setSearchTerm] = useState('');
  const [prioritizeOpportunities, setPrioritizeOpportunities] = useState(false);
  const canViewSelling = hasAccess(currentUser, 'beat_plans');
  const [filterType, setFilterType] = useState<'ALL' | StoreType>('ALL');
  const [onlyMissingDistributor, setOnlyMissingDistributor] = useState(false);
  const [outletChain, setOutletChain] = useState<Distributor | null>(null);
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
  const [fieldCategory, setFieldCategory] = useState(storeCategories[0]?.name || '');
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
  const [adminParentDistributorId, setAdminParentDistributorId] = useState('');
  const [fieldStoreType, setFieldStoreType] = useState<StoreType>('STANDALONE_RETAILER');
  const [adminStoreName, setAdminStoreName] = useState('');
  const [adminCategory, setAdminCategory] = useState(storeCategories[0]?.name || '');
  const [adminCity, setAdminCity] = useState('Kathmandu');
  const [adminArea, setAdminArea] = useState('');
  const [adminAddress, setAdminAddress] = useState('');
  const [adminLat, setAdminLat] = useState('');
  const [adminLng, setAdminLng] = useState('');
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
    setCurrentUser(db.getCurrentUser());
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
          if (pos.coords.accuracy > 200) { toast.error('GPS accuracy is too low. Move outdoors and retry.'); return; }
          setFieldLat(pos.coords.latitude);
          setFieldLng(pos.coords.longitude);
          toast.success(`Captured GPS: ${pos.coords.latitude.toFixed(4)}°N, ${pos.coords.longitude.toFixed(4)}°E`);
        },
        (err) => {
          toast.error('Device GPS is unavailable. Allow location and retry; no location was invented.');
          setFieldLat(null);
          setFieldLng(null);
        },
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    } else { toast.error('This browser does not support device GPS.'); }
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

    // The pin is optional: a store without one can still be put on a beat. Check-in then skips the distance check.
    if (!fieldArea.trim() || !fieldCity.trim()) { toast.error('Enter the store area and city.'); return; }

    guardedSubmit(async () => {
      const contacts = fieldContacts.filter((c) => c.name.trim() || c.phone.trim());
      const firstContact = contacts[0] || { name: '', role: 'Store Owner', phone: '' };

      const newRet = db.addRetailer({
        name: fieldStoreName.trim(),
        type: 'GT',
        storeType: fieldStoreType === 'SAMT' ? 'SAMT' : 'STANDALONE_RETAILER',
        category: fieldCategory || undefined,
        city: fieldCity,
        area: fieldArea.trim(),
        address: fieldAddress || `${fieldArea}, ${fieldCity}`,
        lat: fieldLat ?? 0,
        lng: fieldLng ?? 0,
        assignedOfficerId: currentUser.id,
        assignedOfficerName: currentUser.fullName,
        contactName: firstContact.name,
        contactRole: firstContact.role,
        contactPhone: firstContact.phone,
        contacts: contacts.map((c, i) => ({
          id: `cnt_${Date.now()}_${i}`,
          name: c.name,
          role: c.role as ContactRole,
          phone: c.phone,
          isPrimary: i === 0,
        })),
        brandsStocked: fieldBrands.length > 0 ? fieldBrands : (systemBrands[0]?.code ? [systemBrands[0].code] : []),
        distributorId: fieldParentDistributorId || undefined,
        distributorName: fieldParentDistributorId
          ? distributors.find((d) => d.id === fieldParentDistributorId)?.name
          : undefined,
        notes: fieldNotes,
      });

      toast.success(`"${newRet.name}" saved. Added to store directory and your beat route.`);
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

    const adminChannel = storeChannel(adminStoreType);
    if ((adminChannel.account === 'distributors' ? !canCreateAccounts : !canCreateStores)) { toast.error(`You can't add ${adminChannel.label} accounts. Ask an admin to allow it in Staff & roles.`); return; }
    if (adminChannel.account === 'retailers' && (!adminArea.trim() || !adminCity.trim())) { toast.error('Enter the store area and city before saving.'); return; }
    // Latitude and longitude are optional. If one is entered, both must be, and they must be real coordinates.
    const adminHasPin = adminLat.trim() !== '' || adminLng.trim() !== '';
    if (adminHasPin && (!adminLat.trim() || !adminLng.trim() || !validGpsCoordinates(Number(adminLat), Number(adminLng)))) { toast.error('Enter both latitude and longitude as numbers, or leave both empty.'); return; }

    guardedSubmit(async () => {
      if (adminStoreType === 'DISTRIBUTOR') {
        db.addDistributor({
          name: adminStoreName.trim(),
          type: 'Distributor',
          storeType: 'DISTRIBUTOR',
          city: adminCity,
          address: adminAddress || `${adminArea}, ${adminCity}`,
          parentDistributorId: adminParentDistributorId || undefined,
          parentDistributorName: adminParentDistributorId ? distributors.find((d) => d.id === adminParentDistributorId)?.name : undefined,
          contactName: adminContactName,
          contactRole: adminContactRole,
          contactPhone: adminContactPhone,
          contactEmail: '',
          brandsCarried: systemBrands.map((b) => b.code),
          creditTerms: adminPaymentTerms,
          defaultMargins: adminDefaultMargins,
          hasBranches: adminHasBranches,
          contacts: adminContactName || adminContactPhone ? [{ id: `cnt_${Date.now()}`, name: adminContactName, role: adminContactRole as ContactRole, phone: adminContactPhone, isPrimary: true }] : [],
        });
        toast.success(`Distributor "${adminStoreName}" added.`);
      } else if (adminStoreType === 'CHAIN_STORE') {
        db.addDistributor({
          name: adminStoreName.trim(),
          type: 'Retail Chain',
          storeType: 'CHAIN_STORE',
          city: adminCity,
          address: adminAddress || `${adminArea}, ${adminCity}`,
          contactName: adminContactName,
          contactRole: adminContactRole,
          contactPhone: adminContactPhone,
          contactEmail: '',
          brandsCarried: systemBrands.map((b) => b.code),
          creditTerms: adminPaymentTerms,
          defaultMargins: adminDefaultMargins,
          hasBranches: true,
          contacts: adminContactName || adminContactPhone ? [{ id: `cnt_${Date.now()}`, name: adminContactName, role: adminContactRole as ContactRole, phone: adminContactPhone, isPrimary: true }] : [],
        });
        toast.success(`MT chain "${adminStoreName}" added. Add its outlets from the chain's card.`);
      } else {
        db.addRetailer({
          name: adminStoreName.trim(),
          type: 'GT',
          storeType: adminStoreType === 'SAMT' ? 'SAMT' : 'STANDALONE_RETAILER',
          category: adminCategory || undefined,
          distributorId: adminParentDistributorId || undefined,
          distributorName: adminParentDistributorId ? distributors.find((d) => d.id === adminParentDistributorId)?.name : undefined,
          city: adminCity,
          area: adminArea.trim(),
          address: adminAddress || `${adminArea}, ${adminCity}`,
          lat: adminHasPin ? Number(adminLat) : 0,
          lng: adminHasPin ? Number(adminLng) : 0,
          assignedOfficerId: currentUser.id,
          assignedOfficerName: currentUser.fullName,
          contactName: adminContactName,
          contactRole: adminContactRole,
          contactPhone: adminContactPhone,
          contacts: adminContactName || adminContactPhone ? [{ id: `cnt_${Date.now()}`, name: adminContactName, role: adminContactRole as ContactRole, phone: adminContactPhone, isPrimary: true }] : [],
          brandsStocked: systemBrands.map((b) => b.code),
          creditTerms: adminPaymentTerms,
          defaultMargins: adminDefaultMargins,
        });
        toast.success(`${channelLabel(adminStoreType)} "${adminStoreName}" added.`);
      }

      setShowAdminAddModal(false);
      setAdminLat(''); setAdminLng(''); setAdminArea(''); setAdminAddress(''); setAdminParentDistributorId('');
      refreshData();
    });
  };

  // Section 3: Contact Actions
  const handleSetPrimary = (entityType: 'DISTRIBUTOR' | 'BRANCH' | 'RETAILER', entityId: string, contactId: string) => {
    db.setPrimaryContact(entityType, entityId, contactId);
    toast.success('Marked as main contact');
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
    toast.success(`Contact "${item.contact.name}" removed from ${item.entityName}.`);
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
      toast.success(`Contact transferred to target branch.`);
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
      toast.success(`Commercial terms updated for ${commercialTermsStore.name}.`);
      setCommercialTermsStore(null);
      refreshData();
    });
  };

  const areaAnalyses = useMemo(() => {
    const orders = canViewSelling ? db.getSecondaryOrders() : [];
    const products = db.getProducts();
    const counts = canViewSelling ? db.getStockCounts() : [];
    const stores = [...retailers.map(row => ({ ...row, entityType: 'RETAILER' as const })), ...branches.map(row => ({ ...row, entityType: 'BRANCH' as const }))];
    return new Map<string, ReturnType<typeof analyzeStoreArea>>(canViewSelling ? stores.map(store => [`${store.entityType}:${store.id}`, analyzeStoreArea(store.id, stores, orders, products, counts, new Date(), store.entityType)] as const) : []);
  }, [retailers, branches, canViewSelling]);

  // Filtered lists
  const filteredRetailers = retailers.filter((r) => {
    if (isSalesOfficer && r.assignedOfficerId !== currentUser.id && r.assignedOfficerName !== currentUser.fullName) {
      return false;
    }
    if (filterType !== 'ALL' && channelOfRetailer(r) !== filterType) return false;
    if (onlyMissingDistributor && !missingDistributor(channelOfRetailer(r), r.distributorId)) return false;
    return (
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.area.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.category && r.category.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  if (prioritizeOpportunities && canViewSelling) filteredRetailers.sort((a, b) => (areaAnalyses.get('RETAILER:' + b.id)?.opportunityScore ?? -1) - (areaAnalyses.get('RETAILER:' + a.id)?.opportunityScore ?? -1));

  const filteredDistributors = distributors.filter(
    (d) =>
      (filterType === 'ALL' || channelOfDistributor(d) === filterType) &&
      (!onlyMissingDistributor || missingDistributor(channelOfDistributor(d), d.parentDistributorId)) &&
      (d.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.city.toLowerCase().includes(searchTerm.toLowerCase()))
  );
  const channelCount = (type: StoreType) => type === 'CHAIN_STORE' || type === 'DISTRIBUTOR'
    ? distributors.filter((d) => channelOfDistributor(d) === type).length
    : retailers.filter((r) => channelOfRetailer(r) === type).length;
  const missingCount = retailers.filter((r) => missingDistributor(channelOfRetailer(r), r.distributorId)).length
    + distributors.filter((d) => missingDistributor(channelOfDistributor(d), d.parentDistributorId)).length;
  const distributorOptions = distributors.filter((d) => channelOfDistributor(d) === 'DISTRIBUTOR').map((d) => ({ value: d.id, label: d.name, hint: d.city }));
  const assignDistributor = (kind: 'retailer' | 'distributor', id: string, distributorId: string) => {
    const parent = distributors.find((d) => d.id === distributorId);
    try {
      if (kind === 'retailer') db.updateRetailer(id, { distributorId: distributorId || undefined, distributorName: parent?.name });
      else db.updateDistributor(id, { parentDistributorId: distributorId || undefined, parentDistributorName: parent?.name });
      toast.success(distributorId ? `Now supplied by ${parent?.name}.` : 'Distributor removed.');
      refreshData();
    } catch (error) { toast.error('Not saved', error instanceof Error ? error.message : undefined); }
  };

  return (
    <PageGuard feature="stores">
      <div className="space-y-6 pb-20">
        <Breadcrumbs
          items={[
            { label: 'Offline sales', href: '/offline-sales/stores' },
            { label: 'Stores' },
          ]}
        />

        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-1.5 text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Stores
<InfoTip label="About this page">Every account by type: MT chains and their outlets, SAMT stores, distributors and retail stores. SAMT, distributors and retail stores should name the distributor that supplies them.</InfoTip></h1>
            
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DownloadButton datasets={['stores']} records={{ retailers: filteredRetailers, distributors: filteredDistributors } as any} />
            {/* Primary Action Button */}
            {(canCreateStores || canCreateAccounts) && (
              <button
                type="button"
                onClick={() => {
                  if (isSalesOfficer && !isSuper) {
                    setShowFieldAddModal(true);
                  } else {
                    setShowAdminAddModal(true);
                  }
                }}
                className="btn btn-primary"
              >
                <Plus />
                <span>Add store</span>
              </button>
            )}

            {/* Admin Extra Actions */}
            {!isSalesOfficer && (
              <button
                type="button"
                onClick={() => setShowFieldAddModal(true)}
                className="btn btn-secondary"
              >
                <Store />
                <span>Quick field form</span>
              </button>
            )}
          </div>
        </div>

        {canViewSelling && <label className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs text-blue-900 cursor-pointer"><input type="checkbox" checked={prioritizeOpportunities} onChange={event => setPrioritizeOpportunities(event.target.checked)} className="h-4 w-4" /><span><strong>Prioritize stores with area selling opportunities</strong><span className="block mt-1">Scores compare delivered orders from the last 30 days in each recorded city and area. Open a store to see the evidence.</span></span></label>}

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
              placeholder="Search store name, area, category…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-200 pl-9 pr-4 py-2 text-xs outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <div role="tablist" aria-label="Store type" className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
              {([['ALL', 'All', distributors.length + retailers.length] as const, ...STORE_CHANNELS.map((c) => [c.type, c.label, channelCount(c.type)] as const)]).map(([key, label, count]) => (
                <button key={key} role="tab" aria-selected={filterType === key} type="button" onClick={() => setFilterType(key)}
                  className={`rounded-lg px-3 py-1.5 font-bold transition ${filterType === key ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}>
                  {label} ({count})
                </button>
              ))}
            </div>
            <button type="button" aria-pressed={onlyMissingDistributor} onClick={() => setOnlyMissingDistributor((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 font-bold ${onlyMissingDistributor ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
              No distributor ({missingCount})
            </button>
          </div>
        </div>

        {/* SECTION 1: DISTRIBUTORS & CHAIN STORES */}
        {filteredDistributors.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-500">
                MT chains and distributors
              </h2>
              <span className="text-xs text-slate-500 font-medium">
                {branches.length} MT outlets
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {<PagedList items={filteredDistributors} label="distributors" pageSize={10} render={(pageRows) => pageRows.map((dist) => {
                const distBranches = branches.filter(
                  (b) =>
                    b.distributorId === dist.id &&
                    (!isSalesOfficer || b.assignedOfficerId === currentUser.id || b.assignedOfficerName === currentUser.fullName)
                );

                if (prioritizeOpportunities && canViewSelling) distBranches.sort((a, b) => (areaAnalyses.get('BRANCH:' + b.id)?.opportunityScore ?? -1) - (areaAnalyses.get('BRANCH:' + a.id)?.opportunityScore ?? -1));

                return (
                  <div key={dist.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link href={`/offline-sales/stores/${dist.id}`} className="font-bold text-slate-900 text-base hover:text-blue-700 hover:underline">{dist.name}</Link><StoreDeleteButton id={dist.id} name={dist.name} onDeleted={refreshData} />
                          <span className="rounded-full bg-blue-50 text-blue-700 px-2.5 py-0.5 text-[11px] font-bold border border-blue-200">
                            {channelLabel(channelOfDistributor(dist))}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {dist.city}{dist.creditTerms ? <> · Terms: <span className="font-semibold text-slate-800">{dist.creditTerms}</span></> : <> · No payment terms set</>}
                        </div>
                        {channelOfDistributor(dist) === 'DISTRIBUTOR' && (
                          <div className="mt-2 max-w-xs">
                            {dist.parentDistributorId && !canEditAccounts ? (
                              <p className="text-[11px] text-slate-600">Supplied by <strong>{dist.parentDistributorName}</strong></p>
                            ) : canEditAccounts ? (
                              <SearchSelect label="Supplied by (bigger distributor)" options={distributorOptions.filter((o) => o.value !== dist.id)} value={dist.parentDistributorId || ''} onChange={(v) => assignDistributor('distributor', dist.id, v)} allowClear clearLabel="Supplied by us directly" placeholder="Search distributors" />
                            ) : null}
                          </div>
                        )}
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
                      <div className="text-[11px] font-bold text-slate-500 ">
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
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-500">Outlets ({distBranches.length})</span>
                        {channelOfDistributor(dist) === 'CHAIN_STORE' && (canCreateAccounts || canCreateStores) && (
                          <button type="button" onClick={() => setOutletChain(dist)} className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-bold text-blue-700 hover:bg-blue-50">+ Add outlet</button>
                        )}
                      </div>
                      {channelOfDistributor(dist) === 'CHAIN_STORE' && distBranches.length > 0 && (
                        <Link href={`/offline-sales/stores/${dist.id}`} className="mb-2 block text-[11px] font-semibold text-blue-700 hover:underline">See the whole chain&apos;s history →</Link>
                      )}
                      <div className="space-y-1.5">
                        {distBranches.map((branch) => (
                          <div
                            key={branch.id}
                            className="flex items-center justify-between rounded-xl bg-slate-50 p-2.5 text-xs hover:bg-slate-100/70"
                          >
                            <div>
                              <Link href={`/offline-sales/stores/${branch.id}`} className="font-semibold text-blue-700 hover:underline">{branch.name}</Link>
                              <div className="text-[11px] text-slate-500">{branch.address}</div>
                              {canViewSelling && <Link href={`/offline-sales/stores/${branch.id}?tab=selling`} className="mt-1 block text-[11px] font-semibold text-blue-700 hover:underline">Area selling: {areaAnalyses.get('BRANCH:' + branch.id)?.opportunityScore == null ? 'Building evidence' : `${areaAnalyses.get('BRANCH:' + branch.id)!.opportunityScore}/100`}</Link>}
                            </div>
                            <StoreDeleteButton id={branch.id} name={branch.name} onDeleted={refreshData} />
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
              })} />}
            </div>
          </div>
        )}

        {/* SECTION 2: STANDALONE RETAILERS */}
        {filteredRetailers.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-500">
                SAMT and retail stores ({filteredRetailers.length})
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {<PagedList items={filteredRetailers} label="stores" render={(pageRows) => pageRows.map((ret) => (
                <div key={ret.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-3.5 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link href={`/offline-sales/stores/${ret.id}`} className="font-bold text-slate-900 text-sm hover:text-blue-700 hover:underline">{ret.name}</Link><StoreDeleteButton id={ret.id} name={ret.name} onDeleted={refreshData} />
                        <span className="mt-0.5 flex flex-wrap gap-1">
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-bold text-blue-700">{channelLabel(channelOfRetailer(ret))}</span>
                          {(ret.category || ret.type) && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{ret.category || ret.type}</span>}
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

                    {canEditStores ? (
                      <div className={ret.distributorId ? '' : 'rounded-lg bg-amber-50 p-2'}>
                        <SearchSelect label={ret.distributorId ? 'Supplied by' : 'No distributor assigned'} options={distributorOptions} value={ret.distributorId || ''} onChange={(v) => assignDistributor('retailer', ret.id, v)} allowClear clearLabel="None" placeholder="Search distributors" />
                      </div>
                    ) : ret.distributorName ? (
                      <div className="text-[11px] text-blue-700 bg-blue-50/80 px-2.5 py-1 rounded-lg font-medium">Supplied by <strong>{ret.distributorName}</strong></div>
                    ) : (
                      <div className="text-[11px] text-amber-900 bg-amber-50 px-2.5 py-1 rounded-lg font-medium">No distributor assigned</div>
                    )}

                    {canViewSelling && <Link href={`/offline-sales/stores/${ret.id}?tab=selling`} className="block rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-xs hover:border-blue-300">
                      <span className="flex items-center justify-between gap-2 font-bold text-blue-800"><span>Area selling opportunity</span><span>{areaAnalyses.get('RETAILER:' + ret.id)?.opportunityScore == null ? 'Building evidence' : `${areaAnalyses.get('RETAILER:' + ret.id)!.opportunityScore}/100`}</span></span>
                      <span className="block mt-1 text-[11px] text-slate-600">{ret.area}, {ret.city} · {areaAnalyses.get('RETAILER:' + ret.id)?.opportunities[0]?.productName || 'View local demand and sample requirements'}</span>
                    </Link>}

                    {/* Section 3 Contacts List */}
                    <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/60 space-y-1.5">
                      <div className="text-[11px] font-bold text-slate-500 ">
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
                      Officer: <strong className="text-slate-700">{ret.assignedOfficerName || 'Not assigned'}</strong>
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
              ))} />}
            </div>
          </div>
        )}

        {/* SECTION 2c: SALES OFFICER FIELD ADD STORE MODAL */}
        {showFieldAddModal && (
          <Portal><div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-lg w-full my-6 p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Add store</h3>
                  <p className="text-xs text-slate-500">Pin it with GPS while you are at the store</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFieldAddModal(false)}
                  className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveFieldStore} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs">
                <div>
                  <label htmlFor="stores-store-name" className="block font-bold text-slate-700 mb-1">Store name *</label>
                  <input id="stores-store-name"
                    type="text"
                    required
                    value={fieldStoreName}
                    onChange={(e) => setFieldStoreName(e.target.value)}
                    placeholder="e.g. Annapurna General Store"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[44px]"
                  />
                </div>

                <fieldset>
                  <legend className="block font-bold text-slate-700 mb-1">Store type</legend>
                  <div className="grid grid-cols-2 gap-1.5">
                    {STORE_CHANNELS.filter((c) => c.account === 'retailers').map((c) => (
                      <label key={c.type} className={`flex cursor-pointer flex-col rounded-xl border p-2.5 ${fieldStoreType === c.type ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700'}`}>
                        <span className="flex items-center gap-2 font-bold"><input type="radio" name="fieldType" checked={fieldStoreType === c.type} onChange={() => setFieldStoreType(c.type)} />{c.label}</span>
                        <span className="mt-0.5 text-[11px] text-slate-500">{c.description}</span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-500">MT chains and distributors are added by the office.</p>
                </fieldset>

                <div>
                  <label htmlFor="stores-store-category" className="block font-bold text-slate-700 mb-1">Store category</label>
                  {storeCategories.length ? (
                    <select id="stores-store-category"
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
                  ) : <p className="text-[11px] text-slate-500">No store categories set up yet. The office adds them in Settings → Lists &amp; categories.</p>}
                </div>

                {/* Location Section with GPS Pin */}
                <div className="space-y-2 rounded-2xl bg-slate-50 p-3.5 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-700 text-[11px] ">Store location <span className="font-normal text-slate-500">(optional, pin it later if you are not at the store)</span></span>
                    <button
                      type="button"
                      onClick={handlePinLocation}
                      className="btn btn-primary min-h-[40px]"
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{fieldLat ? 'Re-Pin GPS' : 'Pin Location'}</span>
                    </button>
                  </div>

                  {fieldLat && (
                    <div className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                      GPS Coordinates captured: {fieldLat.toFixed(4)}°N, {fieldLng?.toFixed(4)}°E
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">City</label>
                      <input aria-label="City"
                        type="text"
                        value={fieldCity}
                        onChange={(e) => setFieldCity(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="stores-area-ward" className="block text-[11px] font-semibold text-slate-600 mb-0.5">Area / ward</label>
                      <input id="stores-area-ward"
                        type="text"
                        placeholder="e.g. Baneshwor"
                        value={fieldArea}
                        onChange={(e) => setFieldArea(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="stores-full-street-address" className="block text-[11px] font-semibold text-slate-600 mb-0.5">Full street address</label>
                    <input id="stores-full-street-address"
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
                    <label className="font-bold text-slate-700">Brands stocked</label>
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
                      <p className="text-xs text-slate-500 ">No brands configured yet. Add brands in Settings.</p>
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

                {/* Supplied by */}
                <div>
                  <SearchSelect label="Supplied by distributor" options={distributorOptions} value={fieldParentDistributorId} onChange={setFieldParentDistributorId} allowClear clearLabel="Not known yet" placeholder="Search distributors" />
                  {!fieldParentDistributorId && <p className="mt-1 text-[11px] text-amber-800">Not required, but the store will show as &quot;No distributor&quot; until one is set.</p>}
                </div>

                {/* Section 3 Contacts List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-bold text-slate-700">Store contacts</label>
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
                          placeholder="Contact name"
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
                  <label htmlFor="stores-notes" className="block font-bold text-slate-700 mb-1">Notes</label>
                  <input id="stores-notes"
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
                    className="w-2/3 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md min-h-[52px]"
                  >
                    Save store
                  </button>
                </div>
              </form>
            </div>
          </div></Portal>
        )}

        {/* SECTION 2d: SUPER ADMIN ADD STORE MODAL */}
        {showAdminAddModal && (
          <Portal><div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-xl w-full my-6 p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Add store</h3>
                  <p className="text-xs text-slate-500">MT chain, SAMT, distributor or retail store, with its brand margins</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAdminAddModal(false)}
                  className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveAdminStore} className="flex-1 overflow-y-auto py-4 space-y-4 pr-1 text-xs">
                {/* Store Type Selection */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1.5">Store type *</label>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {STORE_CHANNELS.map((c) => {
                      const allowed = c.account === 'distributors' ? canCreateAccounts : canCreateStores;
                      return (
                        <button key={c.type} type="button" disabled={!allowed} onClick={() => setAdminStoreType(c.type)} title={allowed ? c.description : 'Your role cannot add this type'}
                          className={`rounded-2xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${adminStoreType === c.type ? 'border-blue-600 bg-blue-600 text-white shadow-xs' : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'}`}>
                          <span className="block font-bold">{c.label}</span>
                          <span className={`mt-0.5 block text-[11px] font-normal ${adminStoreType === c.type ? 'text-blue-100' : 'text-slate-500'}`}>{c.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {storeChannel(adminStoreType).wantsDistributor && (
                  <div>
                    <SearchSelect label={adminStoreType === 'DISTRIBUTOR' ? 'Supplied by (bigger distributor)' : 'Supplied by distributor'} options={distributorOptions} value={adminParentDistributorId} onChange={setAdminParentDistributorId} allowClear clearLabel={adminStoreType === 'DISTRIBUTOR' ? 'Supplied by us directly' : 'Not known yet'} placeholder="Search distributors" />
                    {!adminParentDistributorId && adminStoreType !== 'DISTRIBUTOR' && <p className="mt-1 text-[11px] text-amber-800">Not required, but the store will show as &quot;No distributor&quot; until one is set.</p>}
                  </div>
                )}

                <div>
                  <label htmlFor="stores-entity-name" className="block font-bold text-slate-700 mb-1">Name *</label>
                  <input id="stores-entity-name"
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
                    <label htmlFor="stores-category" className="block font-bold text-slate-700 mb-1">Category</label>
                    {storeCategories.length ? (
                      <select id="stores-category"
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
                    ) : (
                      <p className="rounded-xl border border-dashed border-slate-300 p-2 text-[11px] text-slate-600">No categories yet. <Link href="/settings?tab=lists" className="font-semibold text-blue-700 underline">Add them in Settings</Link>.</p>
                    )}
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Payment credit terms</label>
                    <select aria-label="Payment credit terms"
                      value={adminPaymentTerms}
                      onChange={(e) => setAdminPaymentTerms(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    >
                      <option value="COD">Cash on delivery (COD)</option>
                      <option value="7-day credit">7-Day net credit</option>
                      <option value="15-day credit">15-Day net credit</option>
                      <option value="30-day credit">30-Day net credit</option>
                    </select>
                  </div>
                </div>

                {/* Has Branches Toggle */}
                {adminStoreType === 'CHAIN_STORE' && (
                  <p className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-blue-900">After saving, add each outlet from the chain&apos;s card (&quot;+ Add outlet&quot;). A chain with one shop is fine too.</p>
                )}

                <div className="grid grid-cols-2 gap-3 rounded-xl border p-3">
                  <label className="font-semibold">City<input value={adminCity} onChange={event => setAdminCity(event.target.value)} required className="block mt-1 w-full rounded-lg border p-2" /></label>
                  <label className="font-semibold">Area<input value={adminArea} onChange={event => setAdminArea(event.target.value)} required={storeChannel(adminStoreType).account === 'retailers'} className="block mt-1 w-full rounded-lg border p-2" /></label>
                  <label className="font-semibold col-span-2">Address<input value={adminAddress} onChange={event => setAdminAddress(event.target.value)} className="block mt-1 w-full rounded-lg border p-2" /></label>
                  {storeChannel(adminStoreType).account === 'retailers' && <>
                    <label className="font-semibold">Latitude <span className="font-normal text-slate-500">(optional)</span><NumberInput type="number" step="any" min="-90" max="90" value={adminLat} onChange={event => setAdminLat(event.target.value)} className="block mt-1 w-full rounded-lg border p-2" /></label>
                    <label className="font-semibold">Longitude <span className="font-normal text-slate-500">(optional)</span><NumberInput type="number" step="any" min="-180" max="180" value={adminLng} onChange={event => setAdminLng(event.target.value)} className="block mt-1 w-full rounded-lg border p-2" /></label>
                    <button type="button" className="col-span-2 rounded-lg border p-2 font-semibold text-blue-700" onClick={() => {
                      if (!navigator.geolocation) { toast.error('This browser does not support GPS. Enter the store coordinates.'); return; }
                      navigator.geolocation.getCurrentPosition(position => {
                        if (position.coords.accuracy > 200) { toast.error('GPS accuracy is too low. Enter verified store coordinates or retry outdoors.'); return; }
                        setAdminLat(String(position.coords.latitude)); setAdminLng(String(position.coords.longitude));
                      }, () => toast.error('Location is unavailable. Allow location or enter verified store coordinates.'), { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
                    }}>Use current device GPS (when at the store)</button>
                  </>}
                </div>

                {/* Section 4: Default Margins Per Brand */}
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-800 text-[11px] ">
                      Commercial terms (default brand margins)
                    </span>
                  </div>

                  <div className="space-y-2">
                    {systemBrands.length === 0 ? (
                      <p className="text-xs text-slate-500 p-2 bg-slate-50 rounded-xl">No brands configured yet. Add brands in Settings.</p>
                    ) : (
                      systemBrands.map((b) => {
                        const brandKey = b.code;
                        const cur = adminDefaultMargins[brandKey] || { pct: 15, type: 'MARKDOWN' };
                        return (
                          <div key={brandKey} className="flex items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200">
                            <span className="font-bold text-slate-800">{b.name}</span>
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              <NumberInput
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
                                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
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
                                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
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
                    <label htmlFor="stores-primary-contact-name" className="block font-bold text-slate-700 mb-1">Primary contact name</label>
                    <input id="stores-primary-contact-name"
                      type="text"
                      placeholder="e.g. Ramesh Shrestha"
                      value={adminContactName}
                      onChange={(e) => setAdminContactName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200"
                    />
                  </div>
                  <div>
                    <label htmlFor="stores-contact-phone" className="block font-bold text-slate-700 mb-1">Contact phone</label>
                    <input id="stores-contact-phone"
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
                    className="btn btn-primary disabled:bg-blue-300"
                  >
                    {isSubmitting && (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    )}
                    {isSubmitting ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Creating…</> : 'Create Store Entity'}
                  </button>
                </div>
              </form>
            </div>
          </div></Portal>
        )}

        {/* SECTION 3: FLAG CONTACT FOR REMOVAL MODAL */}
        {flagModalTarget && (
          <Portal><div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Flag contact for removal</h3>
                  <p className="text-xs text-slate-500">{flagModalTarget.name}</p>
                </div>
                <button onClick={() => setFlagModalTarget(null)} className="p-1 text-slate-500 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleFlagContact} className="py-4 space-y-3.5 text-xs">
                <div>
                  <label htmlFor="stores-reason-for-removal" className="block font-bold text-slate-700 mb-1.5">Reason for Removal *</label>
                  <select id="stores-reason-for-removal"
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

                <div className="flex gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px]">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />This request will be submitted to the Admin. The contact will display a yellow &quot;Flagged&quot; badge until approved.
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
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg shadow-xs"
                  >
                    Submit removal flag
                  </button>
                </div>
              </form>
            </div>
          </div></Portal>
        )}

        {/* SECTION 3c: ADMIN PENDING CONTACT REMOVALS MODAL */}
        {showPendingRemovalsModal && (
          <Portal><div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Pending contact removals</h3>
                  <p className="text-xs text-slate-500">Approve removal, reject, or transfer contact to another branch</p>
                </div>
                <button
                  onClick={() => setShowPendingRemovalsModal(false)}
                  className="p-1 text-slate-500 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-3 pr-1 text-xs">
                {pendingRemovals.length === 0 ? (
                  <div className="text-center py-10 text-slate-500">No pending removal requests.</div>
                ) : (
                  pendingRemovals.map((item) => (
                    <div key={item.contact.id} className="p-4 rounded-2xl border border-slate-200 bg-slate-50/60 space-y-2.5">
                      <div className="flex items-start justify-between">
                        <div>
                          <strong className="text-sm font-bold text-slate-900">{item.entityName}</strong>
                          <div className="text-xs text-slate-700 mt-0.5">
                            {item.contact.name} ({item.contact.role}) — {item.contact.phone}
                          </div>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
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
                          Approve removal
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
                            <option value="">Select branch to transfer…</option>
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
          </div></Portal>
        )}

        {/* SECTION 4: COMMERCIAL TERMS & MARGINS MODAL */}
        {commercialTermsStore && (
          <Portal><div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Commercial terms &amp; margins</h3>
                  <p className="text-xs text-slate-500">{commercialTermsStore.name}</p>
                </div>
                <button onClick={() => setCommercialTermsStore(null)} className="p-1 text-slate-500 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSaveCommercialTerms} className="py-4 space-y-4 text-xs">
                <div>
                  <label htmlFor="stores-payment-credit-terms" className="block font-bold text-slate-700 mb-1">Payment credit terms</label>
                  <select id="stores-payment-credit-terms"
                    value={commercialTermsStore.paymentTerms}
                    onChange={(e) =>
                      setCommercialTermsStore({ ...commercialTermsStore, paymentTerms: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium"
                  >
                    <option value="COD">Cash on delivery (COD)</option>
                    <option value="7-day credit">7-Day net credit</option>
                    <option value="15-day credit">15-Day net credit</option>
                    <option value="30-day credit">30-Day net credit</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="block font-bold text-slate-700">Per-brand default margin</label>
                  {systemBrands.length === 0 ? (
                    <p className="text-xs text-slate-500 p-2 bg-slate-50 rounded-xl">No brands configured yet. Add brands in Settings.</p>
                  ) : (
                    systemBrands.map((brandObj) => {
                      const b = brandObj.code;
                      const cur = commercialTermsStore.margins[b] || { pct: 15, type: 'MARKDOWN' };
                      return (
                        <div key={b} className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50">
                          <span className="font-bold text-slate-800">{brandObj.name}</span>
                        <div className="flex items-center gap-2">
                          <NumberInput
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
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
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
                              className={`px-2 py-0.5 rounded text-[11px] font-bold ${
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
                    className="btn btn-primary disabled:bg-blue-300"
                  >
                    {isSubmitting && (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    )}
                    {isSubmitting ? <><span className="bb-spinner mr-1.5" aria-hidden="true" />Saving…</> : 'Save Terms'}
                  </button>
                </div>
              </form>
            </div>
          </div></Portal>
        )}

        {/* ADD CONTACT MODAL */}
        {targetStoreForContact && (
          <Portal><div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Add store contact</h3>
                  <p className="text-xs text-slate-500">{targetStoreForContact.name}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setTargetStoreForContact(null)}
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
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
                  toast.success(`Contact ${newContactName} added to ${targetStoreForContact.name}.`);
                  setTargetStoreForContact(null);
                  setNewContactName('');
                  refreshData();
                }}
                className="py-4 space-y-3 text-xs"
              >
                <div>
                  <label htmlFor="stores-contact-name" className="block font-bold text-slate-700 mb-1">Contact name *</label>
                  <input id="stores-contact-name"
                    type="text"
                    required
                    placeholder="e.g. Ramesh Giri"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 outline-none"
                  />
                </div>
                <div>
                  <label htmlFor="stores-role-designation" className="block font-bold text-slate-700 mb-1">Role / designation *</label>
                  <select id="stores-role-designation"
                    value={newContactRole}
                    onChange={(e) => setNewContactRole(e.target.value as ContactRole)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white"
                  >
                    <option value="Accounts / Cheque">Accounts / cheque</option>
                    <option value="Store Manager">Store manager</option>
                    <option value="Floor Supervisor">Floor supervisor</option>
                    <option value="Owner">Owner / proprietor</option>
                    <option value="Receiving Bay">Receiving bay</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="stores-phone-number" className="block font-bold text-slate-700 mb-1">Phone number *</label>
                  <input id="stores-phone-number"
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
                    className="btn btn-primary"
                  >
                    Save contact
                  </button>
                </div>
              </form>
            </div>
          </div></Portal>
        )}
      </div>
      {outletChain && <AddOutletModal chain={outletChain} onClose={() => setOutletChain(null)} onSaved={refreshData} />}
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
        className={`p-0.5 rounded hover:bg-slate-100 ${contact.isPrimary ? 'text-amber-600' : 'text-slate-300 hover:text-amber-500'}`}
      >
        <Star className={`w-3.5 h-3.5 ${contact.isPrimary ? 'fill-amber-400' : ''}`} />
      </button>

      <span className="font-bold">{contact.name}</span>
      <span className="text-[11px] text-slate-500">({contact.role})</span>

      <a
        href={`tel:${contact.phone}`}
        className="text-emerald-700 font-bold hover:underline flex items-center gap-0.5 ml-1"
      >
        <Phone className="w-3 h-3 inline" />
        {contact.phone}
      </a>

      {contact.isFlaggedForRemoval ? (
        <span
          className="ml-1 px-1.5 py-0.2 rounded text-[11px] font-bold bg-amber-200 text-amber-900"
          title={`Flagged reason: ${contact.flaggedReason || 'Removal requested'}`}
        >
          Flagged
        </span>
      ) : (
        <button
          type="button"
          title="Flag contact for removal"
          onClick={() => onFlag(contact)}
          className="ml-1 text-slate-500 hover:text-rose-600 p-0.5 rounded"
        >
          <Flag className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
