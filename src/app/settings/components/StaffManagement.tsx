'use client';

import React, { useState } from 'react';
import {
  Users,
  Plus,
  Phone,
  Mail,
  MapPin,
  Shield,
  X,
  UserCheck,
  UserX,
  KeyRound,
  FileSpreadsheet,
  Check,
  Edit2,
  ChevronRight,
} from 'lucide-react';
import { User, UserRole, BrandCode } from '@/lib/types';
import {
  FeatureKey,
  FeatureAccess,
  DataScope,
  ActionPermission,
  UserCustomPermissions,
  FIELD_SALES_OFFICER_TEMPLATE,
  OFFICE_STAFF_TEMPLATE,
  MANAGER_TEMPLATE,
  VIEWER_TEMPLATE,
  FEATURE_METADATA,
  ALL_FEATURE_KEYS,
  isSuperAdmin,
} from '@/lib/permissions';
import { db } from '@/lib/db/db-service';
import { toast } from '@/components/common/Toast';

export default function StaffManagement() {
  const [users, setUsers] = useState<User[]>(() => db.getUsers());
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Form State
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [reportsToId, setReportsToId] = useState<string>('');
  const [assignedTerritory, setAssignedTerritory] = useState('Kathmandu Valley');
  const [permissionsState, setPermissionsState] = useState<UserCustomPermissions>(FIELD_SALES_OFFICER_TEMPLATE);

  const refreshUsers = () => {
    setUsers([...db.getUsers()]);
  };

  const applyTemplate = (template: UserCustomPermissions, templateName: string) => {
    setPermissionsState(JSON.parse(JSON.stringify(template)));
    toast.info(`Applied "${templateName}" template.`);
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setStaffName('');
    setStaffEmail('');
    setStaffPhone('');
    setStaffPassword('admin123');
    setReportsToId('user_devansh');
    setAssignedTerritory('Kathmandu Valley');
    setPermissionsState(JSON.parse(JSON.stringify(FIELD_SALES_OFFICER_TEMPLATE)));
    setShowAddStaffModal(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setStaffName(u.fullName);
    setStaffEmail(u.email);
    setStaffPhone(u.phone);
    setStaffPassword('');
    setReportsToId(u.reportsToId || '');
    setAssignedTerritory(u.territory || 'Kathmandu Valley');
    setPermissionsState(u.customPermissions ? JSON.parse(JSON.stringify(u.customPermissions)) : FIELD_SALES_OFFICER_TEMPLATE);
    setShowAddStaffModal(true);
  };

  const handleAccessChange = (key: FeatureKey, access: FeatureAccess) => {
    setPermissionsState((prev) => {
      const next = { ...prev };
      const current = next[key] || { access: 'HIDDEN', scope: 'OWN', actions: [] };

      if (access === 'HIDDEN') {
        next[key] = { access: 'HIDDEN', scope: null, actions: [] };
      } else if (access === 'VIEW_ONLY') {
        next[key] = { access: 'VIEW_ONLY', scope: current.scope || 'ALL', actions: ['VIEW'] };
      } else if (access === 'VIEW_EDIT') {
        next[key] = { access: 'VIEW_EDIT', scope: current.scope || 'OWN', actions: ['VIEW', 'CREATE', 'EDIT'] };
      } else {
        next[key] = { access: 'FULL', scope: current.scope || 'OWN', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE'] };
      }
      return next;
    });
  };

  const handleScopeChange = (key: FeatureKey, scope: DataScope) => {
    setPermissionsState((prev) => {
      const next = { ...prev };
      const current = next[key] || { access: 'FULL', scope: 'OWN', actions: ['VIEW'] };
      next[key] = { ...current, scope };
      return next;
    });
  };

  const handleActionsChange = (key: FeatureKey, actionsPattern: 'VIEW' | 'VIEW_CREATE' | 'VIEW_CREATE_EDIT' | 'FULL') => {
    setPermissionsState((prev) => {
      const next = { ...prev };
      const current = next[key] || { access: 'FULL', scope: 'OWN', actions: ['VIEW'] };
      let actions: ActionPermission[] = ['VIEW'];
      if (actionsPattern === 'VIEW_CREATE') actions = ['VIEW', 'CREATE'];
      if (actionsPattern === 'VIEW_CREATE_EDIT') actions = ['VIEW', 'CREATE', 'EDIT'];
      if (actionsPattern === 'FULL') actions = ['VIEW', 'CREATE', 'EDIT', 'DELETE'];
      next[key] = { ...current, actions };
      return next;
    });
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName || !staffPhone || !staffEmail) {
      toast.error('Please fill in Name, Phone, and Email.');
      return;
    }

    if (editingUser) {
      db.updateUser(editingUser.id, {
        fullName: staffName.trim(),
        email: staffEmail.trim(),
        phone: staffPhone.trim(),
        reportsToId: reportsToId || undefined,
        territory: assignedTerritory.trim(),
        customPermissions: permissionsState,
        ...(staffPassword.trim() ? { password: staffPassword.trim() } : {}),
      });
      toast.success(`Updated account for ${staffName}.`);
    } else {
      // Determine inferred legacy role for backward compatibility
      let inferredRole: UserRole = 'SALES_OFFICER';
      if (permissionsState.settings?.access !== 'HIDDEN') inferredRole = 'ADMIN';
      else if (permissionsState.orderflow?.access !== 'HIDDEN' && permissionsState.beat_plans?.access === 'HIDDEN') inferredRole = 'DATA_ENTRY';
      else if (permissionsState.beat_plans?.scope === 'TEAM' || permissionsState.beat_plans?.scope === 'ALL') inferredRole = 'ADMIN';

      db.addNewUser({
        fullName: staffName.trim(),
        email: staffEmail.trim(),
        phone: staffPhone.trim(),
        password: staffPassword.trim() || 'password123',
        role: inferredRole,
        territory: assignedTerritory.trim() || 'Kathmandu Beat',
        assignedBrands: ['ALL', 'FORYA', 'PEE_SAFE', 'RENEE'],
        reportsToId: reportsToId || undefined,
        customPermissions: permissionsState,
        active: true,
        permissions: {
          canViewAnalytics: true,
          canExportSheets: permissionsState.settings?.access !== 'HIDDEN',
          canManageDispatches: permissionsState.dispatches?.access !== 'HIDDEN',
          canManageCheques: permissionsState.cheque_tracker?.access !== 'HIDDEN',
          canApproveSkips: permissionsState.beat_plans?.actions.includes('EDIT'),
          canManageStaff: false,
          canConfigureSettings: permissionsState.settings?.access !== 'HIDDEN',
        },
      });
      toast.success(`Staff account created for ${staffName}.`);
    }

    setShowAddStaffModal(false);
    refreshUsers();
  };

  const handleToggleActive = (user: User) => {
    const updatedStatus = !(user.active !== false);
    user.active = updatedStatus;
    if (!updatedStatus) {
      user.deactivatedAt = new Date().toISOString();
    }
    toast.info(`${user.fullName} is now ${updatedStatus ? 'Active' : 'Deactivated'}.`);
    refreshUsers();
  };

  const offlineSalesKeys: FeatureKey[] = [
    'beat_plans',
    'stores',
    'distributors',
    'dispatches',
    'gps_tracking',
    'shelf_photos',
    'call_tracker',
    'cheque_tracker',
    'document_handover',
    'staff_scorecards',
  ];

  const platformKeys: FeatureKey[] = [
    'dashboard',
    'settings',
    'orderflow',
    'reviews',
    'customers',
    'marketing',
  ];

  const getManagerName = (managerId?: string) => {
    if (!managerId) return 'None (Direct)';
    const mgr = users.find((u) => u.id === managerId);
    return mgr ? mgr.fullName : 'Direct';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-slate-900">Custom Permissions &amp; Staff Hierarchy</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Configure 3-layer permissions (Feature Access, Data Scope, Actions) and &quot;Reports To&quot; management chains.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Create Staff Account</span>
        </button>
      </div>

      {/* Staff Cards List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs divide-y divide-slate-100">
        {users.map((u) => {
          const isActive = u.active !== false;
          const reportsToUser = users.find((mgr) => mgr.id === u.reportsToId);

          return (
            <div key={u.id} className="p-4 sm:p-5 hover:bg-slate-50/50 transition-colors">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5 min-w-0">
                  <div className="w-11 h-11 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-200">
                    {u.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{u.fullName}</span>
                      {u.isSuperAdmin ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                          Super Admin
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                          Custom Permissions
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            isActive ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        />
                        {isActive ? 'Active' : 'Deactivated'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1.5">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {u.phone}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        {u.email}
                      </span>
                      {u.territory && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          {u.territory}
                        </span>
                      )}
                      <span className="flex items-center gap-1 text-slate-600 font-medium">
                        <Shield className="w-3.5 h-3.5 text-indigo-400" />
                        Reports to: <strong className="text-slate-900">{reportsToUser ? reportsToUser.fullName : 'None (Direct)'}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0 self-end lg:self-center">
                  <button
                    type="button"
                    onClick={() => openEditModal(u)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Edit Permissions</span>
                  </button>

                  {!u.isSuperAdmin && (
                    <button
                      type="button"
                      onClick={() => handleToggleActive(u)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                        isActive
                          ? 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {isActive ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      <span>{isActive ? 'Deactivate' : 'Reactivate'}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Account Creation / Permissions Editor Modal (Section 1d) */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-3xl w-full my-6 p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {editingUser ? `Edit Account: ${editingUser.fullName}` : 'Create Staff Account'}
                </h3>
                <p className="text-xs text-slate-500">
                  Configure identity credentials, reporting line, and 3-layer feature permissions.
                </p>
              </div>
              <button
                onClick={() => setShowAddStaffModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveStaff} className="flex-1 overflow-y-auto py-4 space-y-6 pr-1">
              {/* SECTION: BASIC INFO */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Basic Information
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      placeholder="e.g. Ramesh Thapa"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Mobile Number *</label>
                    <input
                      type="tel"
                      required
                      value={staffPhone}
                      onChange={(e) => setStaffPhone(e.target.value)}
                      placeholder="98XXXXXXXX"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      placeholder="staff@brandbucket.com.np"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      {editingUser ? 'Update Password (leave blank to keep current)' : 'Password *'}
                    </label>
                    <input
                      type="text"
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      placeholder={editingUser ? 'Unchanged' : 'Super Admin sets initial password'}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Reports To (Manager)</label>
                    <select
                      value={reportsToId}
                      onChange={(e) => setReportsToId(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">None (Top Level / Direct)</option>
                      {users
                        .filter((u) => !editingUser || u.id !== editingUser.id)
                        .map((mgr) => (
                          <option key={mgr.id} value={mgr.id}>
                            {mgr.fullName} {mgr.isSuperAdmin ? '(Super Admin)' : ''}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">Territory / Area</label>
                    <input
                      type="text"
                      value={assignedTerritory}
                      onChange={(e) => setAssignedTerritory(e.target.value)}
                      placeholder="e.g. Kathmandu North Beat"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: QUICK TEMPLATES */}
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Quick Templates (Starting Point)
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => applyTemplate(FIELD_SALES_OFFICER_TEMPLATE, 'Field Sales Officer')}
                    className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-colors"
                  >
                    📋 Field Sales Officer
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate(OFFICE_STAFF_TEMPLATE, 'Office Staff')}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold transition-colors"
                  >
                    📋 Office Staff
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate(MANAGER_TEMPLATE, 'Manager')}
                    className="px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-xl text-xs font-bold transition-colors"
                  >
                    📋 Manager
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTemplate(VIEWER_TEMPLATE, 'Viewer')}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors"
                  >
                    📋 Viewer
                  </button>
                </div>
              </div>

              {/* SECTION: FEATURE PERMISSIONS MATRIX */}
              <div className="space-y-4">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  Feature Permissions Matrix
                </div>

                {/* 1. Offline Sales Section */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-700">
                    Offline Sales (Field Force)
                  </div>
                  <div className="divide-y divide-slate-100">
                    {offlineSalesKeys.map((key) => {
                      const meta = FEATURE_METADATA[key];
                      const perm = permissionsState[key] || { access: 'HIDDEN', scope: null, actions: [] };
                      const isHidden = perm.access === 'HIDDEN';
                      const isViewOnly = perm.access === 'VIEW_ONLY';

                      return (
                        <div key={key} className="p-3 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center text-xs">
                          <div className="md:col-span-5">
                            <span className="font-bold text-slate-800">{meta.label}</span>
                            <p className="text-[11px] text-slate-400">{meta.description}</p>
                          </div>

                          {/* Access Column */}
                          <div className="md:col-span-2">
                            <select
                              value={perm.access}
                              onChange={(e) => handleAccessChange(key, e.target.value as FeatureAccess)}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-medium focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="HIDDEN">Hidden</option>
                              <option value="VIEW_ONLY">View Only</option>
                              <option value="VIEW_EDIT">View + Edit</option>
                              <option value="FULL">Full Access</option>
                            </select>
                          </div>

                          {/* Scope Column */}
                          <div className="md:col-span-2">
                            <select
                              disabled={isHidden}
                              value={perm.scope || 'OWN'}
                              onChange={(e) => handleScopeChange(key, e.target.value as DataScope)}
                              className={`w-full px-2 py-1.5 rounded-lg border border-slate-200 font-medium ${
                                isHidden ? 'bg-slate-100 text-slate-400 border-dashed cursor-not-allowed' : ''
                              }`}
                            >
                              <option value="OWN">Own Only</option>
                              <option value="TEAM">Team (Reports)</option>
                              <option value="ALL">All Data</option>
                            </select>
                          </div>

                          {/* Actions Column */}
                          <div className="md:col-span-3">
                            <select
                              disabled={isHidden || isViewOnly}
                              value={
                                isViewOnly
                                  ? 'VIEW'
                                  : perm.actions.includes('DELETE')
                                  ? 'FULL'
                                  : perm.actions.includes('EDIT')
                                  ? 'VIEW_CREATE_EDIT'
                                  : perm.actions.includes('CREATE')
                                  ? 'VIEW_CREATE'
                                  : 'VIEW'
                              }
                              onChange={(e) => handleActionsChange(key, e.target.value as any)}
                              className={`w-full px-2 py-1.5 rounded-lg border border-slate-200 font-medium ${
                                isHidden || isViewOnly ? 'bg-slate-100 text-slate-400 border-dashed cursor-not-allowed' : ''
                              }`}
                            >
                              <option value="VIEW">View Only</option>
                              <option value="VIEW_CREATE">View + Create</option>
                              <option value="VIEW_CREATE_EDIT">View+Create+Edit</option>
                              <option value="FULL">Full (Create+Edit+Delete)</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Platform Section */}
                <div className="rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-xs font-bold text-slate-700">
                    Platform &amp; Online Modules
                  </div>
                  <div className="divide-y divide-slate-100">
                    {platformKeys.map((key) => {
                      const meta = FEATURE_METADATA[key];
                      const perm = permissionsState[key] || { access: 'HIDDEN', scope: null, actions: [] };
                      const isHidden = perm.access === 'HIDDEN';
                      const isViewOnly = perm.access === 'VIEW_ONLY';

                      return (
                        <div key={key} className="p-3 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center text-xs">
                          <div className="md:col-span-5">
                            <span className="font-bold text-slate-800">{meta.label}</span>
                            <p className="text-[11px] text-slate-400">{meta.description}</p>
                          </div>

                          {/* Access Column */}
                          <div className="md:col-span-2">
                            <select
                              value={perm.access}
                              onChange={(e) => handleAccessChange(key, e.target.value as FeatureAccess)}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-200 font-medium focus:ring-1 focus:ring-blue-500"
                            >
                              <option value="HIDDEN">Hidden</option>
                              <option value="VIEW_ONLY">View Only</option>
                              <option value="VIEW_EDIT">View + Edit</option>
                              <option value="FULL">Full Access</option>
                            </select>
                          </div>

                          {/* Scope Column */}
                          <div className="md:col-span-2">
                            <select
                              disabled={isHidden}
                              value={perm.scope || 'ALL'}
                              onChange={(e) => handleScopeChange(key, e.target.value as DataScope)}
                              className={`w-full px-2 py-1.5 rounded-lg border border-slate-200 font-medium ${
                                isHidden ? 'bg-slate-100 text-slate-400 border-dashed cursor-not-allowed' : ''
                              }`}
                            >
                              <option value="ALL">All Data</option>
                              <option value="TEAM">Team (Reports)</option>
                              <option value="OWN">Own Only</option>
                            </select>
                          </div>

                          {/* Actions Column */}
                          <div className="md:col-span-3">
                            <select
                              disabled={isHidden || isViewOnly}
                              value={
                                isViewOnly
                                  ? 'VIEW'
                                  : perm.actions.includes('DELETE')
                                  ? 'FULL'
                                  : perm.actions.includes('EDIT')
                                  ? 'VIEW_CREATE_EDIT'
                                  : perm.actions.includes('CREATE')
                                  ? 'VIEW_CREATE'
                                  : 'VIEW'
                              }
                              onChange={(e) => handleActionsChange(key, e.target.value as any)}
                              className={`w-full px-2 py-1.5 rounded-lg border border-slate-200 font-medium ${
                                isHidden || isViewOnly ? 'bg-slate-100 text-slate-400 border-dashed cursor-not-allowed' : ''
                              }`}
                            >
                              <option value="VIEW">View Only</option>
                              <option value="VIEW_CREATE">View + Create</option>
                              <option value="VIEW_CREATE_EDIT">View+Create+Edit</option>
                              <option value="FULL">Full (Create+Edit+Delete)</option>
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 flex items-center justify-end gap-2.5 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs"
                >
                  {editingUser ? 'Save Permissions' : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
