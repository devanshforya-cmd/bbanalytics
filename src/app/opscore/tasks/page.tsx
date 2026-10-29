'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { Task, Priority } from '@/lib/types';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import BulkActionBar from '@/components/common/BulkActionBar';
import { toast } from '@/components/common/Toast';
import { validateRequired } from '@/lib/validation';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import { getScope, isSuperAdmin } from '@/lib/permissions';
import {
  CheckSquare,
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle,
  AlertTriangle,
  X,
  UserCheck,
  Workflow,
  Sparkles,
  Navigation,
} from 'lucide-react';

export default function TasksPage() {
  const currentUser = db.getCurrentUser();
  const [tasks, setTasks] = useState<Task[]>(db.getTasks());
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // SOP Template instantiation state (Fix 37b)
  const taskTemplates = db.getTaskTemplates();
  const [selectedTemplateId, setSelectedTemplateId] = useState(taskTemplates[0]?.id || '');
  const [templateAssignee, setTemplateAssignee] = useState(currentUser.id);
  const [templateStoreName, setTemplateStoreName] = useState('');

  // Form
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState(currentUser.id);
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [relatedTo, setRelatedTo] = useState('Store visit');
  const [dueDateAd, setDueDateAd] = useState(getTodayAd());

  // Staff On-Leave Task & Beat Reassignment State
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [leaveFromOfficerId, setLeaveFromOfficerId] = useState(currentUser.id);
  const [leaveToOfficerId, setLeaveToOfficerId] = useState('');
  const [leaveStartDate, setLeaveStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [leaveEndDate, setLeaveEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [leaveReason, setLeaveReason] = useState('Sick Leave');

  const handleConfirmLeaveReassign = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveToOfficerId) {
      toast.error('Please select a covering/reliever sales staff member.');
      return;
    }
    if (leaveFromOfficerId === leaveToOfficerId) {
      toast.error('Covering staff member cannot be the same person on leave.');
      return;
    }
    const fromUser = db.getUsers().find((u) => u.id === leaveFromOfficerId);
    const toUser = db.getUsers().find((u) => u.id === leaveToOfficerId);
    const result = db.reassignOfficerBeatsAndTasks({
      fromOfficerId: leaveFromOfficerId,
      toOfficerId: leaveToOfficerId,
      leaveStartDateAd: leaveStartDate,
      leaveEndDateAd: leaveEndDate,
      reason: leaveReason,
    });
    setShowLeaveModal(false);
    refreshTasks();
    toast.success(
      `✓ Leave recorded for ${fromUser?.fullName || 'Staff'}! Reassigned ${result.reassignedTasksCount} tasks and ${result.reassignedBeatsCount} beat stops to ${toUser?.fullName || 'Reliever'}.`
    );
  };

  const refreshTasks = () => {
    setTasks([...db.getTasks()]);
  };

  useEffect(() => {
    refreshTasks();
    if (typeof window !== 'undefined') {
      db.syncTasksFromSupabase().then(() => refreshTasks()).catch(() => {});
    }
    const handleDbUpdate = () => refreshTasks();
    window.addEventListener('bb-db-updated', handleDbUpdate);
    return () => window.removeEventListener('bb-db-updated', handleDbUpdate);
  }, []);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((t) => t.id));
    }
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleBulkReassign = (officerId: string) => {
    if (selectedIds.length === 0) return;
    const officer = db.getUsers().find((u) => u.id === officerId);
    const officerName = officer?.fullName || 'Assigned Officer';
    selectedIds.forEach((id) => {
      db.reassignTask(id, officerId, officerName);
    });
    toast.success(`✓ Reassigned ${selectedIds.length} tasks to ${officerName}.`);
    setSelectedIds([]);
    refreshTasks();
  };

  const handleBulkComplete = () => {
    if (selectedIds.length === 0) return;
    selectedIds.forEach((id) => {
      db.updateTaskStatus(id, 'COMPLETED');
    });
    toast.success(`✓ Marked ${selectedIds.length} tasks as Completed.`);
    setSelectedIds([]);
    refreshTasks();
  };

  const handleBulkSetPriority = (newPriority: Priority) => {
    if (selectedIds.length === 0) return;
    selectedIds.forEach((id) => {
      db.updateTaskPriority(id, newPriority);
    });
    toast.success(`✓ Updated priority of ${selectedIds.length} tasks to ${newPriority}.`);
    setSelectedIds([]);
    refreshTasks();
  };

  const handleToggleStatus = (task: Task) => {
    const nextStatus = task.status === 'COMPLETED' ? 'PENDING' : 'COMPLETED';
    db.updateTaskStatus(task.id, nextStatus);
    refreshTasks();
  };

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();

    const errors: Record<string, string> = {};
    const titleErr = validateRequired(title, 'Task title');
    if (titleErr) errors.title = titleErr;

    const dateErr = validateRequired(dueDateAd, 'Due date');
    if (dateErr) errors.dueDate = dateErr;

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error('Please fix the highlighted errors before submitting.');
      return;
    }

    const user = db.getUsers().find((u) => u.id === assignedTo) || currentUser;

    db.addTask({
      title: title.trim(),
      description: description.trim(),
      assignedTo: user.id,
      assignedToName: user.fullName || 'Assigned Officer',
      createdBy: currentUser.fullName,
      priority,
      dueDateAd,
      dueDateBs: getTodayBs(),
      relatedTo,
      status: 'PENDING',
      autoCreated: false,
    });

    setTitle('');
    setDescription('');
    setFormErrors({});
    setShowAddModal(false);
    refreshTasks();
    toast.success(`✓ Task created and assigned to ${user.fullName}.`);
  };

  const handleInstantiateTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTemplateId) return;

    const created = db.createTasksFromTemplate(selectedTemplateId, templateAssignee, {
      storeName: templateStoreName.trim() || undefined,
    });

    setShowTemplateModal(false);
    setTemplateStoreName('');
    refreshTasks();
    toast.success(`✓ Successfully generated ${created.length} sequential SOP tasks.`);
  };

  const visibleTasks = tasks.filter((t) => {
    if (getScope(currentUser, 'tasks') === 'OWN') {
      const uName = (currentUser.fullName || '').toLowerCase();
      const uFirst = uName.split(' ')[0] || '';
      return (
        t.assignedTo === currentUser.id ||
        (t.assignedToName &&
          (t.assignedToName.toLowerCase() === uName ||
            (uFirst.length > 2 && t.assignedToName.toLowerCase().includes(uFirst))))
      );
    }
    return true;
  });

  const filtered = visibleTasks.filter(
    (t) =>
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.description && t.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  return (
    <PageGuard feature="tasks">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Task Assignment & Work Management (OpsCore)
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Manual and auto-generated action items for field follow-ups, overdue cheques, and store visits.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
            <Link
              href="/offline-sales/beat-plan"
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition shadow-2xs"
            >
              <Navigation className="h-3.5 w-3.5 text-blue-600" />
              Beat Route Planner
            </Link>

            <button
              onClick={() => setShowLeaveModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100 transition shadow-2xs"
            >
              <UserCheck className="h-3.5 w-3.5 text-amber-600" />
              🌴 Staff Leave &amp; Reassign
            </button>

            <button
              onClick={() => setShowTemplateModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-blue-600 bg-blue-50 px-3.5 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition shadow-xs"
            >
              <Workflow className="h-4 w-4 text-blue-600" />
              Create from Template
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 transition"
            >
              <Plus className="h-4 w-4" />
              Create Task
            </button>
          </div>
        </div>

      {/* Search */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex items-center gap-3">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full text-xs outline-none"
        />
      </div>

      {/* Select All & Selection Count Bar */}
      <div className="flex items-center justify-between px-1 text-xs">
        <label className="inline-flex items-center gap-2 cursor-pointer font-semibold text-slate-700 select-none">
          <input
            type="checkbox"
            checked={filtered.length > 0 && selectedIds.length === filtered.length}
            onChange={handleSelectAll}
            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
          />
          <span>
            Select All ({filtered.length} {filtered.length === 1 ? 'task' : 'tasks'})
          </span>
        </label>
        {selectedIds.length > 0 && (
          <span className="text-blue-600 font-bold bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
            {selectedIds.length} of {filtered.length} selected
          </span>
        )}
      </div>

      {/* Tasks List */}
      <div className="space-y-3">
        {filtered.map((task) => {
          const isDone = task.status === 'COMPLETED';
          const isSelected = selectedIds.includes(task.id);
          return (
            <div
              key={task.id}
              className={`rounded-xl border p-4 shadow-sm transition flex items-start gap-3 text-xs ${
                isSelected
                  ? 'border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10'
                  : isDone
                  ? 'border-slate-200 bg-white opacity-60'
                  : 'border-slate-200 bg-white hover:border-blue-200'
              }`}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handleToggleSelect(task.id)}
                className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer shrink-0"
              />

              <button
                type="button"
                onClick={() => handleToggleStatus(task)}
                className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                  isDone ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'
                }`}
                title={isDone ? 'Mark Pending' : 'Mark Completed'}
              >
                {isDone && <CheckCircle className="h-3 w-3" />}
              </button>

              <div className="flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`font-bold text-sm ${
                      isDone ? 'line-through text-slate-400' : 'text-slate-900'
                    }`}
                  >
                    {task.title}
                  </span>
                  {task.autoCreated && (
                    <span className="rounded bg-blue-50 border border-blue-200 text-blue-700 px-2 py-0.2 text-[9px] font-bold uppercase">
                      Auto-Created
                    </span>
                  )}
                  <span
                    className={`rounded-full px-2 py-0.2 text-[9px] font-bold uppercase ${
                      task.priority === 'HIGH' || task.priority === 'URGENT'
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {task.priority}
                  </span>
                </div>

                {task.description && (
                  <p className="text-slate-600 text-[11px] leading-relaxed">{task.description}</p>
                )}

                <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400 pt-1">
                  <span>
                    Assigned to: <strong className="text-slate-700">{task.assignedToName}</strong>
                  </span>
                  <span>•</span>
                  <span>Due: {task.dueDateBs} ({task.dueDateAd})</span>
                  <span>•</span>
                  <span>Related to: {task.relatedTo}</span>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <EmptyState
            type="tasks"
            action={{
              label: 'Create Task',
              onClick: () => setShowAddModal(true),
            }}
          />
        )}
      </div>

      {/* SOP Template Modal (Fix 37b) */}
      {showTemplateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Workflow className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-base">Instantiate SOP Task Template</h3>
              </div>
              <button
                onClick={() => setShowTemplateModal(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleInstantiateTemplate} className="space-y-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Select SOP Template *</label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 p-2.5 outline-none font-medium bg-white"
                >
                  {taskTemplates.map((tmpl) => (
                    <option key={tmpl.id} value={tmpl.id}>
                      {tmpl.name} ({tmpl.category}) — {tmpl.steps.length} Steps
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Assignee (Officer) *</label>
                  <select
                    value={templateAssignee}
                    onChange={(e) => setTemplateAssignee(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-2.5 outline-none font-medium bg-white"
                  >
                    {db.getUsers().map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} {u.role ? `(${u.role.replace('_', ' ')})` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Target Store / Entity Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Salesberry Jhamsikhel"
                    value={templateStoreName}
                    onChange={(e) => setTemplateStoreName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 p-2.5 outline-none font-medium"
                  />
                </div>
              </div>

              {/* Template Step Preview */}
              {(() => {
                const tmpl = taskTemplates.find((t) => t.id === selectedTemplateId);
                if (!tmpl) return null;
                return (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-700">Auto-Generated Step Schedule:</span>
                      <span className="text-[10px] text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                        {tmpl.steps.length} Staggered Steps
                      </span>
                    </div>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {tmpl.steps.map((step, idx) => (
                        <div
                          key={step.id || idx}
                          className="flex items-start gap-2 bg-white p-2 rounded-lg border border-slate-200"
                        >
                          <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <div className="flex-1">
                            <p className="font-semibold text-slate-800">{step.title}</p>
                            <p className="text-[10px] text-slate-500 line-clamp-1">{step.description}</p>
                          </div>
                          <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                            +{step.dueDaysOffset || idx + 1} Days
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowTemplateModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 shadow flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  Generate All Tasks
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base">Create New Task</h3>
              <button onClick={() => setShowAddModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Task Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Follow up on cheque deposit with Bhatbhateni"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    if (formErrors.title) setFormErrors((p) => ({ ...p, title: '' }));
                  }}
                  className={`w-full rounded-lg border px-3 py-2 outline-none transition ${
                    formErrors.title
                      ? 'border-rose-500 bg-rose-50/20 focus:border-rose-500'
                      : 'border-slate-300 focus:border-blue-500'
                  }`}
                />
                {formErrors.title && (
                  <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.title}</p>
                )}
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Details of the action required..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Assigned To</label>
                  <select
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none"
                  >
                    {db.getUsers().map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} {u.role ? `(${u.role.replace('_', ' ')})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as Priority)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none font-semibold"
                  >
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Related To</label>
                  <select
                    value={relatedTo}
                    onChange={(e) => setRelatedTo(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none"
                  >
                    <option>Store visit</option>
                    <option>Cheque collection</option>
                    <option>Order follow-up</option>
                    <option>Stock count</option>
                    <option>Document collection</option>
                    <option>Other</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Due Date *</label>
                  <input
                    type="date"
                    value={dueDateAd}
                    onChange={(e) => {
                      setDueDateAd(e.target.value);
                      if (formErrors.dueDate) setFormErrors((p) => ({ ...p, dueDate: '' }));
                    }}
                    className={`w-full rounded-lg border px-3 py-2 bg-white outline-none transition ${
                      formErrors.dueDate
                        ? 'border-rose-500 bg-rose-50/20 focus:border-rose-500'
                        : 'border-slate-300 focus:border-blue-500'
                    }`}
                  />
                  {formErrors.dueDate && (
                    <p className="text-[11px] text-rose-600 mt-1 font-medium">{formErrors.dueDate}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="rounded-lg border border-slate-200 px-4 py-2 font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 shadow"
                >
                  Create Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Staff Leave & Relief Coverage Reassignment Modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 p-5 bg-amber-50/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Staff Leave &amp; Task Relief Coverage</h3>
                  <p className="text-xs text-slate-500">Reassign pending tasks and beat stops to covering sales staff</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowLeaveModal(false)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmLeaveReassign} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Staff Member Taking Leave</label>
                <select
                  value={leaveFromOfficerId}
                  onChange={(e) => setLeaveFromOfficerId(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium focus:ring-2 focus:ring-blue-500"
                >
                  {db.getUsers().map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.fullName} ({u.territory || u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Leave Start Date</label>
                  <input
                    type="date"
                    value={leaveStartDate}
                    onChange={(e) => setLeaveStartDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Leave End Date</label>
                  <input
                    type="date"
                    value={leaveEndDate}
                    onChange={(e) => setLeaveEndDate(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Reason for Leave</label>
                <select
                  value={leaveReason}
                  onChange={(e) => setLeaveReason(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-medium"
                >
                  <option value="Sick Leave">Sick Leave</option>
                  <option value="Emergency Leave">Emergency Leave</option>
                  <option value="Annual Leave">Annual Leave</option>
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Festival / Holiday Leave">Festival / Holiday Leave</option>
                  <option value="Official Off-Duty / Travel">Official Off-Duty / Travel</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Select Covering / Reliever Sales Staff
                </label>
                <select
                  value={leaveToOfficerId}
                  onChange={(e) => setLeaveToOfficerId(e.target.value)}
                  className="w-full p-2.5 bg-amber-50/50 border border-amber-300 rounded-xl font-bold text-slate-800 focus:ring-2 focus:ring-amber-500"
                  required
                >
                  <option value="">-- Choose Covering Staff Member --</option>
                  {db
                    .getUsers()
                    .filter((u) => u.id !== leaveFromOfficerId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.fullName} ({u.territory || u.role})
                      </option>
                    ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  The chosen reliever will take over all active tasks and beat stops for the duration.
                </p>
              </div>

              {/* Live Preview Box */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                <div>
                  <span className="font-bold text-slate-700 block">Active Tasks Impacted:</span>
                  <span className="text-slate-500 text-[11px]">
                    {tasks.filter((t) => t.assignedTo === leaveFromOfficerId && t.status !== 'COMPLETED').length} pending tasks •{' '}
                    {db.getBeatItems().filter((b) => b.officerId === leaveFromOfficerId && b.status === 'PENDING').length} beat stops
                  </span>
                </div>
                <span className="px-2.5 py-1 bg-amber-100 text-amber-800 font-bold rounded-lg text-[11px]">
                  Auto-reassigned
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLeaveModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold shadow-xs transition"
                >
                  Confirm Leave &amp; Reassign Tasks
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedIds.length}
        totalCount={filtered.length}
        onClearSelection={handleClearSelection}
        onSelectAll={handleSelectAll}
      >
        {/* Reassign to Officer dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-300 font-medium">Reassign:</span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                handleBulkReassign(e.target.value);
                e.target.value = '';
              }
            }}
            className="rounded-lg bg-slate-800 border border-slate-700 text-white text-xs px-2.5 py-1.5 outline-none font-medium cursor-pointer"
          >
            <option value="" disabled>Select Officer...</option>
            {db.getUsers().map((u) => (
              <option key={u.id} value={u.id}>
                {u.fullName} {u.role ? `(${u.role.replace('_', ' ')})` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Mark All Complete */}
        <button
          type="button"
          onClick={handleBulkComplete}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow transition cursor-pointer"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          <span>Mark All Complete</span>
        </button>

        {/* Set Priority dropdown */}
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-300 font-medium">Priority:</span>
          <select
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) {
                handleBulkSetPriority(e.target.value as Priority);
                e.target.value = '';
              }
            }}
            className="rounded-lg bg-slate-800 border border-slate-700 text-white text-xs px-2.5 py-1.5 outline-none font-medium cursor-pointer"
          >
            <option value="" disabled>Set Priority...</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>
        </div>
      </BulkActionBar>
      </div>
    </PageGuard>
  );
}
