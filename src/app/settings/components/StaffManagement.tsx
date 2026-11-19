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
  Eye,
  EyeOff,
} from 'lucide-react';
import { User } from '@/lib/types';
import { isSuperAdmin } from '@/lib/permissions';
import { diffAccess, isResolvedAccess, normalizeAccessMap, pagesFromFeatures, pagesOf, resolveAccess, type AccessMap, type StaffRole } from '@/lib/roles';
import { db } from '@/lib/db/db-service';
import { createUser as apiCreateUser, updateUser as apiUpdateUser, fetchUsersFromSupabase } from '@/lib/db/users-service';
import { fetchRoles } from '@/lib/db/roles-service';
import { getBrands } from '@/lib/db/brands-service';
import { toast } from '@/components/common/Toast';
import AccessGrid from '@/components/access/AccessGrid';
import MenuPreview from '@/components/access/MenuPreview';
import RolesManager from '@/components/access/RolesManager';

/** The role a person is in, and their own access map, read from what is stored on them. */
function accessOf(user: User): { roleId: string; access: AccessMap } {
  const stored = user.customPermissions as Record<string, any> | undefined;
  if (isResolvedAccess(stored)) return { roleId: stored._role?.id || '', access: pagesOf(stored) };
  return { roleId: '', access: pagesFromFeatures(stored || {}, ['s.money', 's.customers', 's.influencers']) };
}

export default function StaffManagement() {
  const [users, setUsers] = useState<User[]>(() => db.getUsers());
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form State
  const [staffName, setStaffName] = useState('');
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPhone, setStaffPhone] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [reportsToId, setReportsToId] = useState<string>('');
  const [assignedTerritory, setAssignedTerritory] = useState('Kathmandu Valley');
  const [view, setView] = useState<'PEOPLE' | 'ROLES'>('PEOPLE');
  const [roles, setRoles] = useState<StaffRole[]>([]);
  const [rolesError, setRolesError] = useState('');
  const [roleId, setRoleId] = useState('');
  const [personAccess, setPersonAccess] = useState<AccessMap>({});
  const [makeSuperAdmin, setMakeSuperAdmin] = useState(false);
  const [brandCodes, setBrandCodes] = useState<string[]>(['ALL']);
  const [showAccess, setShowAccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const activeBrands = getBrands('ACTIVE');
  const role = roles.find((entry) => entry.id === roleId);
  const roleAccess = normalizeAccessMap(role?.permissions);
  const oneOff = roleId ? diffAccess(roleAccess, personAccess) : {};
  const oneOffCount = Object.keys(oneOff).length;

  const refreshUsers = async () => {
    try {
      const supaUsers = await fetchUsersFromSupabase();
      setUsers(supaUsers && supaUsers.length > 0 ? [...supaUsers] : [...db.getUsers()]);
    } catch (error) {
      // Offline or the server is unreachable: show the staff saved on this device and say so.
      setUsers([...db.getUsers()]);
      toast.error('Staff list not refreshed', error instanceof Error ? `${error.message} Showing the list saved on this device.` : 'Showing the list saved on this device.');
    }
  };

  const refreshRoles = async () => {
    try { setRoles(await fetchRoles()); setRolesError(''); }
    catch (error) { setRolesError(error instanceof Error ? error.message : 'Roles could not be loaded.'); }
  };

  React.useEffect(() => {
    refreshUsers();
    refreshRoles();
  }, []);

  const chooseRole = (id: string) => {
    setRoleId(id);
    const next = roles.find((entry) => entry.id === id);
    // Picking a role starts from exactly that role; one-off changes are made after.
    setPersonAccess(next ? normalizeAccessMap(next.permissions) : {});
  };

  const openCreateModal = () => {
    setEditingUser(null);
    setStaffName('');
    setStaffEmail('');
    setStaffPhone('');
    setStaffPassword('');
    setShowPassword(false);
    setReportsToId(db.getCurrentUser().id);
    setAssignedTerritory('');
    setMakeSuperAdmin(false);
    setBrandCodes(['ALL']);
    setShowAccess(false);
    const first = roles[0];
    setRoleId(first?.id || '');
    setPersonAccess(first ? normalizeAccessMap(first.permissions) : {});
    setShowAddStaffModal(true);
  };

  const openEditModal = (u: User) => {
    setEditingUser(u);
    setStaffName(u.fullName);
    setStaffEmail(u.email);
    setStaffPhone(u.phone);
    setStaffPassword('');
    setShowPassword(false);
    setReportsToId(u.reportsToId || '');
    setAssignedTerritory(u.territory || 'Kathmandu Valley');
    const current = accessOf(u);
    setRoleId(current.roleId);
    setPersonAccess(current.access);
    setMakeSuperAdmin(isSuperAdmin(u));
    setBrandCodes(Array.isArray(u.assignedBrands) && u.assignedBrands.length ? u.assignedBrands as string[] : ['ALL']);
    setShowAccess(!current.roleId);
    setShowAddStaffModal(true);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffName || !staffPhone || !staffEmail) {
      toast.error('Please fill in Name, Phone, and Email.');
      return;
    }

    if (!editingUser) {
      if (!staffPassword.trim() || staffPassword.trim().length < 16) {
        toast.error('Password must be at least 16 characters long.');
        return;
      }
    } else if (staffPassword.trim() && staffPassword.trim().length < 16) {
      toast.error('Password must be at least 16 characters long.');
      return;
    }

    const cleanEmail = staffEmail.toLowerCase().trim();
    const cleanPhone = staffPhone.trim();
    const cleanName = staffName.trim();
    const cleanTerritory = assignedTerritory.trim() || 'Kathmandu Valley';

    if (!makeSuperAdmin && !roleId && !Object.keys(personAccess).length) {
      toast.error('Choose a role, or turn on at least one page for this person.');
      return;
    }
    if (!makeSuperAdmin && !brandCodes.length) {
      toast.error('Choose at least one brand, or All brands.');
      return;
    }
    // The server works out the final access from the role and these one-off changes.
    const access = {
      isSuperAdmin: makeSuperAdmin,
      roleId: makeSuperAdmin ? null : (roleId || null),
      accessOverrides: makeSuperAdmin ? {} : (roleId ? oneOff : personAccess),
      assignedBrands: makeSuperAdmin ? ['ALL'] : brandCodes,
    };
    setSaving(true);
    try {
      if (editingUser) {
        const saved = await apiUpdateUser(editingUser.id, {
          fullName: cleanName, email: cleanEmail, phone: cleanPhone, reportsToId: reportsToId || '', territory: cleanTerritory,
          ...(staffPassword.trim() ? { password: staffPassword.trim() } : {}), ...access,
        } as Partial<User>);
        db.updateUser(editingUser.id, saved);
        toast.success(`Saved ${cleanName}.`, editingUser.id === db.getCurrentUser().id ? undefined : 'Their menu updates the next time their app refreshes.');
      } else {
        const saved = await apiCreateUser({
          id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, fullName: cleanName, email: cleanEmail, phone: cleanPhone,
          password: staffPassword.trim(), territory: cleanTerritory, reportsToId: reportsToId || '', active: true, ...access,
        } as unknown as User);
        db.addNewUser(saved);
        toast.success(`Created ${cleanName}'s account.`, 'They can sign in now.');
      }

      setShowAddStaffModal(false);
      refreshUsers();
    } catch (err: any) {
      toast.error('Staff account not saved', err?.message || undefined);
    } finally { setSaving(false); }
  };

  const handleToggleActive = async (user: User) => {
    const updatedStatus = !(user.active !== false);
    try {
      const saved = await apiUpdateUser(user.id, { active: updatedStatus });
      db.updateUser(user.id, saved);
      toast.info(`${user.fullName} is now ${updatedStatus ? 'Active' : 'Deactivated'}.`);
      refreshUsers();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The account status was not saved.');
    }
  };

  const getManagerName = (managerId?: string) => {
    if (!managerId) return 'None (Direct)';
    const mgr = users.find((u) => u.id === managerId);
    return mgr ? mgr.fullName : 'Direct';
  };

  return (
    <div className="space-y-6">
      <div role="tablist" aria-label="Staff and roles" className="inline-flex rounded-xl bg-slate-200/70 p-1 text-sm font-semibold">
        {(['PEOPLE', 'ROLES'] as const).map((tab) => (
          <button key={tab} type="button" role="tab" aria-selected={view === tab} onClick={() => setView(tab)}
            className={`rounded-lg px-4 py-1.5 transition ${view === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            {tab === 'PEOPLE' ? `People (${users.length})` : `Roles (${roles.length})`}
          </button>
        ))}
      </div>

      {view === 'ROLES' ? <RolesManager roles={roles} people={users} onChanged={() => { refreshRoles(); refreshUsers(); }} /> : <>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="text-base font-semibold text-slate-900">People</h3>
          <p className="text-sm text-slate-600 mt-0.5">Each person has one role and the brands they work on. Only Super Admins can change this.</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Add person</span>
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
                      ) : (() => {
                        const stored = u.customPermissions as Record<string, any> | undefined;
                        const memberRole = isResolvedAccess(stored) && stored._role ? roles.find((entry) => entry.id === stored._role?.id) : undefined;
                        const changes = isResolvedAccess(stored) ? Object.keys(stored._overrides || {}).length : 0;
                        return (
                          <>
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-800">
                              {memberRole && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: memberRole.color }} aria-hidden="true" />}
                              {memberRole?.name || (isResolvedAccess(stored) ? (stored._role?.name || 'No role') : 'Old permissions')}
                            </span>
                            {changes > 0 && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Custom · {changes}</span>}
                          </>
                        );
                      })()}
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
                    <span>Edit</span>
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

      </>}

      {/* Account Creation / Permissions Editor Modal (Section 1d) */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-5xl w-full my-6 p-5 sm:p-6 shadow-2xl border border-slate-200 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 shrink-0">
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  {editingUser ? `Edit ${editingUser.fullName}` : 'New staff account'}
                </h3>
                <p className="text-xs text-slate-500">
                  Sign-in details, who they report to, their role and brands.
                </p>
              </div>
              <button
                onClick={() => setShowAddStaffModal(false)}
                className="p-1.5 text-slate-500 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleSaveStaff} className="flex-1 overflow-y-auto py-4 space-y-6 pr-1">
              {/* SECTION: BASIC INFO */}
              <div>
                <div className="text-[11px] font-bold text-slate-500 mb-2">
                  Basic Information
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <label htmlFor="staffmanagement-full-name" className="block font-bold text-slate-700 mb-1">Full Name *</label>
                    <input id="staffmanagement-full-name"
                      type="text"
                      required
                      value={staffName}
                      onChange={(e) => setStaffName(e.target.value)}
                      placeholder="e.g. Ramesh Thapa"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="staffmanagement-mobile-number" className="block font-bold text-slate-700 mb-1">Mobile Number *</label>
                    <input id="staffmanagement-mobile-number"
                      type="tel"
                      required
                      value={staffPhone}
                      onChange={(e) => setStaffPhone(e.target.value)}
                      placeholder="98XXXXXXXX"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="staffmanagement-email-address" className="block font-bold text-slate-700 mb-1">Email Address *</label>
                    <input id="staffmanagement-email-address"
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
                      {editingUser ? 'Update Password (leave blank to keep current)' : 'Password * (min 8 characters)'}
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={staffPassword}
                        onChange={(e) => setStaffPassword(e.target.value)}
                        placeholder={editingUser ? 'Unchanged' : 'Minimum 16 characters'}
                        minLength={editingUser ? undefined : 8}
                        required={!editingUser}
                        className="w-full px-3 py-2 pr-10 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-600 transition"
                        aria-label="Toggle password visibility"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {staffPassword && staffPassword.length < 8 && (
                      <p className="text-red-500 text-xs mt-1 font-semibold">
                        Password must be at least 16 characters
                      </p>
                    )}
                  </div>
                  <div>
                    <label htmlFor="staffmanagement-reports-to-manager" className="block font-bold text-slate-700 mb-1">Reports To (Manager)</label>
                    <select id="staffmanagement-reports-to-manager"
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
                    <input aria-label="Territory / Area"
                      type="text"
                      value={assignedTerritory}
                      onChange={(e) => setAssignedTerritory(e.target.value)}
                      placeholder="e.g. Kathmandu North Beat"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION: ACCESS */}
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3 rounded-2xl border border-slate-200 p-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">Super Admin</p>
                    <p className="text-xs text-slate-600">Everything, on every brand, including staff and roles. Keep this to the owners.</p>
                  </div>
                  <button type="button" role="switch" aria-checked={makeSuperAdmin} aria-label="Super Admin" onClick={() => setMakeSuperAdmin(!makeSuperAdmin)}
                    className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${makeSuperAdmin ? 'bg-emerald-600' : 'bg-slate-300'}`}>
                    <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${makeSuperAdmin ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                  </button>
                </div>

                {!makeSuperAdmin && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block text-xs">
                        <span className="mb-1 block font-bold text-slate-700">Role</span>
                        <select value={roleId} onChange={(event) => chooseRole(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm">
                          <option value="">No role (only what you turn on below)</option>
                          {roles.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
                        </select>
                        {rolesError && <span className="mt-1 block text-rose-700">{rolesError}</span>}
                        {!rolesError && roles.length === 0 && <span className="mt-1 block text-slate-600">No roles yet. Create them in the Roles tab.</span>}
                      </label>
                      <fieldset className="text-xs">
                        <legend className="mb-1 block font-bold text-slate-700">Brands</legend>
                        <div className="flex flex-wrap gap-1.5">
                          <label className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 ${brandCodes.includes('ALL') ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700'}`}>
                            <input type="checkbox" className="sr-only" checked={brandCodes.includes('ALL')} onChange={() => setBrandCodes(brandCodes.includes('ALL') ? [] : ['ALL'])} />All brands
                          </label>
                          {brandCodes.filter((code) => code !== 'ALL' && !activeBrands.some((brand) => brand.code === code)).map((code) => (
                            <label key={code} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-blue-600 bg-blue-50 px-2.5 py-1 text-blue-800">
                              <input type="checkbox" className="sr-only" checked onChange={() => setBrandCodes(brandCodes.filter((entry) => entry !== code))} />{code}
                            </label>
                          ))}
                          {activeBrands.map((brand) => {
                            const checked = !brandCodes.includes('ALL') && brandCodes.includes(brand.code);
                            return (
                              <label key={brand.code} className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 ${checked ? 'border-blue-600 bg-blue-50 text-blue-800' : 'border-slate-200 text-slate-700'}`}>
                                <input type="checkbox" className="sr-only" checked={checked} onChange={() => setBrandCodes(checked ? brandCodes.filter((code) => code !== brand.code) : [...brandCodes.filter((code) => code !== 'ALL'), brand.code])} />
                                {brand.name}
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    </div>

                    <div className="rounded-2xl border border-slate-200">
                      <button type="button" onClick={() => setShowAccess(!showAccess)} aria-expanded={showAccess} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
                        <span>
                          <span className="block text-sm font-semibold text-slate-900">Access for this person</span>
                          <span className="block text-xs text-slate-600">
                            {roleId ? (oneOffCount ? `${role?.name} with ${oneOffCount} one-off ${oneOffCount === 1 ? 'change' : 'changes'}` : `Exactly the ${role?.name} role`) : 'Set page by page'}
                          </span>
                        </span>
                        <ChevronRight className={`h-4 w-4 shrink-0 text-slate-500 transition-transform ${showAccess ? 'rotate-90' : ''}`} aria-hidden="true" />
                      </button>
                      {showAccess && (
                        <div className="grid gap-4 border-t border-slate-100 p-3 sm:p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
                          <div className="min-w-0 space-y-2">
                            {roleId && oneOffCount > 0 && (
                              <div className="flex items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                <span>Rows marked Custom differ from the role and stay with this person when the role changes.</span>
                                <button type="button" onClick={() => setPersonAccess(roleAccess)} className="shrink-0 font-semibold underline">Undo all</button>
                              </div>
                            )}
                            <AccessGrid idPrefix="person" value={personAccess} base={roleId ? roleAccess : undefined} onChange={setPersonAccess} />
                          </div>
                          <aside className="lg:sticky lg:top-0 lg:self-start"><MenuPreview access={personAccess} /></aside>
                        </div>
                      )}
                    </div>
                  </>
                )}
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
                  disabled={saving}
                  className="px-6 py-2.5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs disabled:opacity-60"
                >
                  {saving ? 'Saving…' : editingUser ? 'Save' : 'Create account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
