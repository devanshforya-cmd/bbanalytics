'use client';

import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Plus,
  Edit2,
  Trash2,
  CheckCircle,
  XCircle,
  BarChart3,
  Users,
  X,
  Sparkles,
} from 'lucide-react';
import { FeatureFlag } from '@/lib/types';
import { db } from '@/lib/db/db-service';
import {
  fetchFeatureFlagsFromSupabase,
  addFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  getFlagAnalytics,
} from '@/lib/db/feature-flags-service';
import { toast } from '@/components/common/Toast';
import SubmitButton from '@/components/common/SubmitButton';

export default function FeatureFlagsSettings() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [analytics, setAnalytics] = useState<Record<string, any>>({});
  const allUsers = db.getUsers();

  // Create / Edit Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingFlag, setEditingFlag] = useState<FeatureFlag | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [variant, setVariant] = useState<'A' | 'B'>('B');
  const [isEnabled, setIsEnabled] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [targetMode, setTargetMode] = useState<'ALL' | 'SPECIFIC'>('ALL');

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await fetchFeatureFlagsFromSupabase();
      setFlags([...data]);

      // Fetch analytics for all flags
      const analyticsMap: Record<string, any> = {};
      for (const f of data) {
        analyticsMap[f.name] = await getFlagAnalytics(f.name);
      }
      setAnalytics(analyticsMap);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Feature flags could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const openCreateModal = () => {
    setEditingFlag(null);
    setName('');
    setDescription('');
    setVariant('B');
    setIsEnabled(true);
    setSelectedUserIds([]);
    setTargetMode('ALL');
    setShowModal(true);
  };

  const openEditModal = (f: FeatureFlag) => {
    setEditingFlag(f);
    setName(f.name);
    setDescription(f.description);
    setVariant(f.variant);
    setIsEnabled(f.isEnabled);
    setSelectedUserIds(f.enabledForUsers || []);
    setTargetMode(f.enabledForUsers && f.enabledForUsers.length > 0 ? 'SPECIFIC' : 'ALL');
    setShowModal(true);
  };

  const handleSaveFlag = async () => {
    const cleanName = name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!cleanName) {
      toast.error('Flag name is required');
      return;
    }

    const assignedUsers = targetMode === 'ALL' ? [] : selectedUserIds;

    try {
      if (editingFlag) {
        await updateFeatureFlag(editingFlag.id, {
          name: cleanName,
          description: description.trim(),
          variant,
          isEnabled,
          enabledForUsers: assignedUsers,
        });
        toast.success(`Feature flag "${cleanName}" updated.`);
      } else {
        const newFlag: FeatureFlag = {
          id: `flag_${cleanName}_${Date.now()}`,
          name: cleanName,
          description: description.trim(),
          variant,
          isEnabled,
          enabledForUsers: assignedUsers,
          createdAt: new Date().toISOString(),
        };
        await addFeatureFlag(newFlag);
        toast.success(`Feature flag "${cleanName}" created.`);
      }

      setShowModal(false);
      await loadData();
    } catch (err: any) {
      toast.error('Failed to save flag: ' + (err?.message || 'Unknown error'));
    }
  };

  const applyFlagChange = async (operation: () => Promise<unknown>, message: string) => {
    try { await operation(); toast.success(message); await loadData(); }
    catch (error) { toast.error(error instanceof Error ? error.message : 'The flag change was not saved.'); }
  };
  const handleToggleEnabled = async (f: FeatureFlag) => {
    const enabled = !f.isEnabled;
    await applyFlagChange(() => updateFeatureFlag(f.id, { isEnabled: enabled }), `Flag "${f.name}" is now ${enabled ? 'Enabled' : 'Disabled'}.`);
  };
  const handleVariantChange = async (f: FeatureFlag, next: 'A' | 'B') => {
    await applyFlagChange(() => updateFeatureFlag(f.id, { variant: next }), `Variant for "${f.name}" set to ${next}.`);
  };
  const handleDelete = async (f: FeatureFlag) => {
    if (!window.confirm(`Delete feature flag "${f.name}" permanently?`)) return;
    await applyFlagChange(() => deleteFeatureFlag(f.id), `Feature flag "${f.name}" deleted.`);
  };

  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">FEATURE FLAGS (A/B TESTING)</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Safely test UI variations, checkout workflows, and roll out features to specific sales officers or teams.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>+ Create Flag</span>
        </button>
      </div>

      {/* Flag List */}
      {loading ? (
        <div className="p-12 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200">
          Loading feature flags...
        </div>
      ) : flags.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mx-auto">
            <Sliders className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800">No feature flags configured</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Create your first feature flag to safely A/B test layouts or roll out new capabilities to individual officers.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create First Flag</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {flags.map((f) => {
            const flagStat = analytics[f.name];
            const targetUsers = allUsers.filter((u) => (f.enabledForUsers || []).includes(u.id));

            return (
              <div
                key={f.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4 hover:border-slate-300 transition"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                        {f.name}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          f.isEnabled
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {f.isEnabled ? (
                          <>
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            <span>Enabled</span>
                          </>
                        ) : (
                          <>
                            <XCircle className="w-3 h-3 text-slate-400" />
                            <span>Disabled</span>
                          </>
                        )}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1.5">{f.description || 'No description provided.'}</p>
                  </div>

                  {/* Controls: Enable toggle & Variant switcher */}
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-bold">
                      <span className="text-[10px] text-slate-400 uppercase px-1">Variant:</span>
                      <button
                        type="button"
                        onClick={() => handleVariantChange(f, 'A')}
                        className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                          f.variant === 'A'
                            ? 'bg-white text-indigo-700 shadow-2xs font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        A
                      </button>
                      <button
                        type="button"
                        onClick={() => handleVariantChange(f, 'B')}
                        className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                          f.variant === 'B'
                            ? 'bg-indigo-600 text-white shadow-2xs font-extrabold'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        B
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleToggleEnabled(f)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border cursor-pointer ${
                        f.isEnabled
                          ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      {f.isEnabled ? 'Disable' : 'Enable'}
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditModal(f)}
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition cursor-pointer"
                      title="Edit flag"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDelete(f)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                      title="Delete flag"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Target Audience Summary */}
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-400" />
                  <span>
                    Audience:{' '}
                    <strong className="text-slate-800">
                      {!f.enabledForUsers || f.enabledForUsers.length === 0
                        ? 'All Staff Members'
                        : `${targetUsers.length} specific user(s) (${targetUsers.map((u) => u.fullName).join(', ')})`}
                    </strong>
                  </span>
                </div>

                {/* A/B Analytics Comparison Panel */}
                {flagStat && (
                  <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80 text-xs space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                      <span className="flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                        <span>A/B Performance Telemetry</span>
                      </span>
                      <span>Metrics by Variant</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      {/* Variant A */}
                      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-2xs space-y-1">
                        <div className="flex items-center justify-between font-bold text-slate-800 text-xs">
                          <span>Variant A (Original)</span>
                          <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">Base</span>
                        </div>
                        <div className="text-[11px] text-slate-500 leading-relaxed">
                          {flagStat.variantA.pageViews} views &bull; {flagStat.variantA.submits} actions &bull;{' '}
                          {flagStat.variantA.errors} errors
                        </div>
                        <div className="pt-1 flex items-center justify-between text-xs font-semibold">
                          <span className="text-slate-600">
                            Action Rate:{' '}
                            <strong className="text-slate-900">{flagStat.variantA.conversionRate}%</strong>
                          </span>
                          <span className="text-slate-600">
                            Error Rate:{' '}
                            <strong className="text-slate-900">{flagStat.variantA.errorRate}%</strong>
                          </span>
                        </div>
                      </div>

                      {/* Variant B */}
                      <div className="bg-white p-3 rounded-lg border border-indigo-200 shadow-2xs space-y-1">
                        <div className="flex items-center justify-between font-bold text-indigo-900 text-xs">
                          <span>Variant B (Test Variant)</span>
                          <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-extrabold">
                            Test
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 leading-relaxed">
                          {flagStat.variantB.pageViews} views &bull; {flagStat.variantB.submits} actions &bull;{' '}
                          {flagStat.variantB.errors} errors
                        </div>
                        <div className="pt-1 flex items-center justify-between text-xs font-semibold">
                          <span className="text-slate-600">
                            Action Rate:{' '}
                            <strong className="text-emerald-600 font-bold">{flagStat.variantB.conversionRate}%</strong>
                          </span>
                          <span className="text-slate-600">
                            Error Rate:{' '}
                            <strong className="text-slate-900">{flagStat.variantB.errorRate}%</strong>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">
                {editingFlag ? `Edit Flag: ${editingFlag.name}` : 'Create Feature Flag'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Flag Identifier * <span className="text-slate-400 font-normal">(snake_case)</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. new_beat_plan_ui"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. Test redesigned beat plan layout with sequence route navigation"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Default Variant</label>
                  <select
                    value={variant}
                    onChange={(e) => setVariant(e.target.value as 'A' | 'B')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-bold"
                  >
                    <option value="A">Variant A (Control / Original)</option>
                    <option value="B">Variant B (New Experiment)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={isEnabled ? 'ENABLED' : 'DISABLED'}
                    onChange={(e) => setIsEnabled(e.target.value === 'ENABLED')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-bold"
                  >
                    <option value="ENABLED">🟢 Enabled</option>
                    <option value="DISABLED">🔴 Disabled</option>
                  </select>
                </div>
              </div>

              {/* Target Audience Mode */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">Target Audience</label>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="radio"
                      checked={targetMode === 'ALL'}
                      onChange={() => setTargetMode('ALL')}
                      className="text-indigo-600"
                    />
                    <span>All Users</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="radio"
                      checked={targetMode === 'SPECIFIC'}
                      onChange={() => setTargetMode('SPECIFIC')}
                      className="text-indigo-600"
                    />
                    <span>Select Specific Staff</span>
                  </label>
                </div>
              </div>

              {/* Specific User Checklist */}
              {targetMode === 'SPECIFIC' && (
                <div className="border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto space-y-1.5 bg-slate-50">
                  {allUsers.map((u) => (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer hover:bg-slate-100 p-1 rounded-lg"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(u.id)}
                        onChange={() => toggleUserSelection(u.id)}
                        className="rounded text-indigo-600"
                      />
                      <span>
                        {u.fullName} <span className="text-slate-400">({u.role})</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <SubmitButton
                  onClick={handleSaveFlag}
                  label={editingFlag ? 'Save Changes' : 'Create Flag'}
                  loadingLabel="Saving..."
                  variant="primary"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
