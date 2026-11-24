'use client';

import Portal from '@/components/common/Portal';
import React, { useState } from 'react';
import { Copy, Pencil, Plus, Trash2, X } from 'lucide-react';
import AccessGrid from './AccessGrid';
import MenuPreview from './MenuPreview';
import { ROLE_COLORS, summarizeAccess, type AccessMap, type StaffRole } from '@/lib/roles';
import { STARTER_ROLES } from '@/lib/starter-roles';
import { createRole, deleteRole, updateRole } from '@/lib/db/roles-service';
import { toast } from '@/components/common/Toast';
import { confirmAction } from '@/components/common/confirm';
import type { User } from '@/lib/types';

interface Draft { id?: string; name: string; description: string; color: string; permissions: AccessMap }

export default function RolesManager({ roles, people, onChanged }: { roles: StaffRole[]; people: User[]; onChanged: () => void }) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [creatingStarters, setCreatingStarters] = useState(false);

  const membersOf = (roleId: string) => people.filter((person) => (person.customPermissions as any)?._role?.id === roleId);

  const startNew = (from?: Partial<Draft>) => setDraft({ name: '', description: '', color: ROLE_COLORS[roles.length % ROLE_COLORS.length], permissions: {}, ...from, id: undefined });
  const edit = (role: StaffRole) => setDraft({ id: role.id, name: role.name, description: role.description || '', color: role.color || ROLE_COLORS[0], permissions: role.permissions });

  const save = async () => {
    if (!draft) return;
    if (!draft.name.trim()) { toast.error('Give the role a name.'); return; }
    setSaving(true);
    try {
      if (draft.id) {
        const { updatedPeople } = await updateRole({ ...draft, id: draft.id });
        toast.success(`Saved “${draft.name.trim()}”.`, updatedPeople ? `${updatedPeople} ${updatedPeople === 1 ? 'person gets' : 'people get'} the new access on their next refresh.` : undefined);
      } else {
        await createRole(draft);
        toast.success(`Created “${draft.name.trim()}”.`);
      }
      setDraft(null);
      onChanged();
    } catch (error) {
      toast.error('Role not saved', error instanceof Error ? error.message : undefined);
    } finally { setSaving(false); }
  };

  const remove = async (role: StaffRole) => {
    const count = membersOf(role.id).length;
    if (count) { toast.error(`Move ${count === 1 ? 'the 1 person' : `the ${count} people`} in “${role.name}” to another role first.`); return; }
    if (!(await confirmAction({ title: `Delete “${role.name}”?`, message: 'Nobody uses this role. This cannot be undone.', confirmLabel: 'Delete role', destructive: true }))) return;
    try { await deleteRole(role.id); toast.success(`Deleted “${role.name}”.`); onChanged(); }
    catch (error) { toast.error('Role not deleted', error instanceof Error ? error.message : undefined); }
  };

  const addStarters = async () => {
    setCreatingStarters(true);
    const existing = new Set(roles.map((role) => role.name.toLowerCase()));
    let made = 0;
    try {
      for (const starter of STARTER_ROLES) if (!existing.has(starter.name.toLowerCase())) { await createRole(starter); made += 1; }
      toast.success(made ? `Added ${made} starter roles. Change them however you like.` : 'The starter roles are already here.');
      onChanged();
    } catch (error) { toast.error('Starter roles not added', error instanceof Error ? error.message : undefined); }
    finally { setCreatingStarters(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Roles</h3>
          <p className="mt-0.5 text-sm text-slate-600">A role is a set of pages and details. Give each person one role, then adjust one person if needed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {roles.length < STARTER_ROLES.length && (
            <button type="button" onClick={addStarters} disabled={creatingStarters} className="btn btn-secondary text-slate-800">
              {creatingStarters ? 'Adding…' : 'Add starter roles'}
            </button>
          )}
          <button type="button" onClick={() => startNew()} className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            <Plus className="h-4 w-4" aria-hidden="true" /> New role
          </button>
        </div>
      </div>

      {roles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-sm font-medium text-slate-900">No roles yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">Start with the ready-made roles (Manager, Office staff, D2C officer, Field sales officer, Viewer) or build your own.</p>
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {roles.map((role) => {
            const summary = summarizeAccess(role.permissions);
            const members = membersOf(role.id);
            return (
              <li key={role.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-start gap-3">
                  <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: role.color }} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <h4 className="truncate text-sm font-semibold text-slate-900">{role.name}</h4>
                    {role.description && <p className="mt-0.5 text-xs text-slate-600">{role.description}</p>}
                    <p className="mt-2 text-xs text-slate-700">{summary.pages} pages{summary.sensitive.length ? ` · sees ${summary.sensitive.join(', ').toLowerCase()}` : ' · no sensitive details'}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{members.length ? `${members.length} ${members.length === 1 ? 'person' : 'people'}: ${members.map((person) => person.fullName).join(', ')}` : 'Nobody yet'}</p>
                  </div>
                </div>
                <div className="mt-3 flex gap-1 border-t border-slate-100 pt-3 text-xs font-semibold">
                  <button type="button" onClick={() => edit(role)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-blue-700 hover:bg-blue-50"><Pencil className="h-3.5 w-3.5" aria-hidden="true" />Edit</button>
                  <button type="button" onClick={() => startNew({ name: `${role.name} copy`, description: role.description || '', color: role.color, permissions: role.permissions })} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-slate-700 hover:bg-slate-100"><Copy className="h-3.5 w-3.5" aria-hidden="true" />Duplicate</button>
                  <button type="button" onClick={() => remove(role)} className="ml-auto inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-rose-700 hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" />Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {draft && (
        <Portal><div className="fixed inset-0 z-50 flex items-stretch justify-center bg-slate-900/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="role-editor-title">
          <div className="flex max-h-dvh w-full max-w-5xl flex-col bg-slate-50 shadow-2xl sm:max-h-[92vh] sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3.5 sm:rounded-t-3xl">
              <h3 id="role-editor-title" className="text-base font-semibold text-slate-900">{draft.id ? `Edit role: ${draft.name || 'Untitled'}` : 'New role'}</h3>
              <button type="button" onClick={() => setDraft(null)} aria-label="Close" className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="min-w-0 space-y-4">
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2">
                  <label className="block text-sm">
                    <span className="font-medium text-slate-800">Name</span>
                    <input value={draft.name} maxLength={60} onChange={(event) => setDraft({ ...draft, name: event.target.value })} placeholder="e.g. Order desk (Forya)" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                  </label>
                  <fieldset className="text-sm">
                    <legend className="font-medium text-slate-800">Colour</legend>
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {ROLE_COLORS.map((color) => (
                        <button key={color} type="button" aria-label={`Colour ${color}`} aria-pressed={draft.color === color} onClick={() => setDraft({ ...draft, color })}
                          className={`h-7 w-7 rounded-full ring-offset-2 ${draft.color === color ? 'ring-2 ring-slate-900' : ''}`} style={{ backgroundColor: color }} />
                      ))}
                    </div>
                  </fieldset>
                  <label className="block text-sm sm:col-span-2">
                    <span className="font-medium text-slate-800">What this role is for</span>
                    <input value={draft.description} maxLength={240} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder="e.g. Takes WhatsApp orders for Forya and follows up deliveries" className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                  </label>
                </div>
                <AccessGrid idPrefix="role" value={draft.permissions} onChange={(permissions) => setDraft({ ...draft, permissions })} />
              </div>
              <aside className="lg:sticky lg:top-0 lg:self-start"><MenuPreview access={draft.permissions} /></aside>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-white px-5 py-3 sm:rounded-b-3xl">
              {draft.id && membersOf(draft.id).length > 0 && <p className="mr-auto text-xs text-slate-600">Changes apply to {membersOf(draft.id).length} {membersOf(draft.id).length === 1 ? 'person' : 'people'}.</p>}
              <button type="button" onClick={() => setDraft(null)} className="rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
              <button type="button" onClick={save} disabled={saving} className="btn btn-primary disabled:opacity-60">{saving ? 'Saving…' : draft.id ? 'Save role' : 'Create role'}</button>
            </div>
          </div>
        </div></Portal>
      )}
    </div>
  );
}
