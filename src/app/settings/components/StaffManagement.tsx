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
} from 'lucide-react';
import { User, UserRole, BrandCode, UserPermissions } from '@/lib/types';
import { db } from '@/lib/db/db-service';
import { toast } from '@/components/common/Toast';
import { brandColor as getBrandColor } from '@/lib/ui-utils';

export default function StaffManagement() {
  const [users, setUsers] = useState<User[]>(db.getUsers());
  const [showAddStaffModal, setShowAddStaffModal] = useState(false);
  const [editingPermissionsUser, setEditingPermissionsUser] = useState<User | null>(null);

  // Form state
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffEmail, setNewStaffEmail] = useState('');
  const [newStaffPhone, setNewStaffPhone] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffRole, setNewStaffRole] = useState<UserRole>('SALES_OFFICER');
  const [newStaffTerritory, setNewStaffTerritory] = useState('');
  const [newStaffBrands, setNewStaffBrands] = useState<BrandCode[]>(['FORYA', 'PEE_SAFE']);

  const refreshUsers = () => {
    setUsers([...db.getUsers()]);
  };

  const handleCreateStaff = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStaffName || !newStaffPhone || !newStaffEmail) {
      toast.error('Please fill in all required staff fields.');
      return;
    }

    db.addNewUser({
      fullName: newStaffName,
      email: newStaffEmail,
      phone: newStaffPhone,
      password: newStaffPassword.trim() || 'password123',
      role: newStaffRole,
      territory: newStaffTerritory || 'Kathmandu Beat',
      assignedBrands: newStaffBrands,
      active: true,
      permissions: {
        canViewAnalytics: true,
        canExportSheets: ['SUPER_ADMIN', 'ADMIN'].includes(newStaffRole),
        canManageDispatches: ['SUPER_ADMIN', 'ADMIN'].includes(newStaffRole),
        canManageCheques: ['SUPER_ADMIN', 'ADMIN', 'SALES_OFFICER'].includes(newStaffRole),
        canApproveSkips: ['SUPER_ADMIN', 'ADMIN'].includes(newStaffRole),
        canManageStaff: newStaffRole === 'SUPER_ADMIN',
        canConfigureSettings: newStaffRole === 'SUPER_ADMIN',
      },
    });

    toast.success(`Account created for ${newStaffName}.`);
    setShowAddStaffModal(false);
    setNewStaffName('');
    setNewStaffEmail('');
    setNewStaffPhone('');
    setNewStaffPassword('');
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div>
          <h2 className="text-base font-bold text-slate-800">Field &amp; Office Personnel Directory</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Manage your field force: sales officers, brand managers, and configure role permissions.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddStaffModal(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 shadow-xs transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>Onboard New Team Member</span>
        </button>
      </div>

      {/* Staff Cards List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs divide-y divide-slate-100">
        {users.map((u) => {
          const isActive = u.active !== false;

          return (
            <div key={u.id} className="p-4 sm:p-5 hover:bg-slate-50/50 transition-colors">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-sm shrink-0 border border-blue-200">
                    {u.fullName
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{u.fullName}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          u.role === 'SUPER_ADMIN'
                            ? 'bg-purple-100 text-purple-800'
                            : u.role === 'ADMIN'
                            ? 'bg-blue-100 text-blue-800'
                            : u.role === 'BRAND_MANAGER'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {u.role.replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          isActive
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
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

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 mt-1">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {u.phone}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        {u.email}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        Territory: <strong className="text-slate-700">{u.territory || 'Kathmandu'}</strong>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span className="text-[11px] font-semibold text-slate-400">Brands:</span>
                      {u.assignedBrands?.map((b) => (
                        <span
                          key={b}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${getBrandColor(b)}`}
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(u)}
                    className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                      isActive
                        ? 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-800 hover:bg-emerald-100'
                    }`}
                  >
                    {isActive ? 'Deactivate' : 'Reactivate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingPermissionsUser(u)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Permissions</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Onboard Staff Modal */}
      {showAddStaffModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">Onboard New Team Member</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddStaffModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateStaff} className="space-y-4 pt-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  value={newStaffName}
                  onChange={(e) => setNewStaffName(e.target.value)}
                  placeholder="e.g. Bikash Thapa"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={newStaffEmail}
                    onChange={(e) => setNewStaffEmail(e.target.value)}
                    placeholder="bikash@brandbucket.com.np"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Mobile Number *</label>
                  <input
                    type="tel"
                    required
                    value={newStaffPhone}
                    onChange={(e) => setNewStaffPhone(e.target.value)}
                    placeholder="98XXXXXXXX"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Account Password *</label>
                <input
                  type="password"
                  required
                  value={newStaffPassword}
                  onChange={(e) => setNewStaffPassword(e.target.value)}
                  placeholder="Set initial login password (e.g. Forya@2083)"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-xs"
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  The staff member will use their mobile number + this password to sign into the system.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">System Role *</label>
                  <select
                    value={newStaffRole}
                    onChange={(e) => setNewStaffRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="SALES_OFFICER">Sales Officer (Field Force)</option>
                    <option value="BRAND_MANAGER">Brand Manager</option>
                    <option value="ADMIN">Operations Admin</option>
                    <option value="SUPER_ADMIN">Executive Super Admin</option>
                    <option value="DATA_ENTRY">Data Entry Operator</option>
                    <option value="VIEWER">Read-Only Viewer</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Territory / Area *</label>
                  <input
                    type="text"
                    required
                    value={newStaffTerritory}
                    onChange={(e) => setNewStaffTerritory(e.target.value)}
                    placeholder="e.g. Pokhara &amp; Gandaki Region"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddStaffModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-xs"
                >
                  Confirm &amp; Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {editingPermissionsUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                Permissions: {editingPermissionsUser.fullName}
              </h3>
              <button
                onClick={() => setEditingPermissionsUser(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="py-4 space-y-2.5 text-xs">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-blue-900 font-medium">
                Role: <strong>{editingPermissionsUser.role}</strong>
              </div>
              <p className="text-slate-500">
                System permissions are managed by Super Admin according to the Role Matrix.
              </p>
            </div>
            <div className="flex justify-end pt-3 border-t border-slate-100">
              <button
                onClick={() => setEditingPermissionsUser(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
