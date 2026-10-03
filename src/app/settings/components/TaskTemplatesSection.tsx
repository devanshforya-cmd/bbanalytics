'use client';

import React, { useState, useEffect } from 'react';
import { CheckSquare, Plus, Edit2, CheckCircle2, Clock, Trash2 } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { TaskTemplate, TaskTemplateStep } from '@/lib/types';

export default function TaskTemplatesSection() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // New Template Form
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TaskTemplate['category']>('ONBOARDING');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<TaskTemplateStep[]>([
    { title: 'Step 1: Introduction visit', description: 'Introduce catalog and pricing', dueDaysOffset: 1 },
    { title: 'Step 2: Collect stock count', description: 'Audit current shelves', dueDaysOffset: 3 },
  ]);

  const reload = () => {
    setTemplates(db.getTaskTemplates());
  };

  useEffect(() => {
    reload();
  }, []);

  const handleAddStep = () => {
    setSteps([
      ...steps,
      {
        title: `Step ${steps.length + 1}: `,
        description: '',
        dueDaysOffset: steps.length * 2 + 1,
      },
    ]);
  };

  const handleRemoveStep = (index: number) => {
    setSteps(steps.filter((_, i) => i !== index));
  };

  const handleStepChange = (index: number, field: keyof TaskTemplateStep, value: any) => {
    const updated = [...steps];
    updated[index] = { ...updated[index], [field]: value };
    setSteps(updated);
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || steps.length === 0) return;

    db.addTaskTemplate({
      name: name.trim(),
      category,
      description: description.trim(),
      active: true,
      steps,
    });

    setShowAddModal(false);
    setName('');
    setDescription('');
    setSteps([
      { title: 'Step 1: ', description: '', dueDaysOffset: 1 },
    ]);
    reload();
  };

  const handleToggleActive = (id: string, current: boolean) => {
    db.updateTaskTemplate(id, { active: !current });
    reload();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700">
              <CheckSquare className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900">Standard Operating Task Templates</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
            Multi-step predefined action workflows for field staff. Easily trigger sequenced onboarding, cheque recovery, or audit steps from the Tasks module.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New Template</span>
        </button>
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((tmpl) => (
          <div
            key={tmpl.id}
            className={`rounded-2xl border p-5 space-y-4 transition-all bg-white shadow-xs ${
              tmpl.active ? 'border-slate-200' : 'border-slate-200 bg-slate-50/60 opacity-60'
            }`}
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-slate-900 text-sm">{tmpl.name}</h4>
                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                    {tmpl.steps.length} Steps
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{tmpl.description}</p>
              </div>

              <button
                type="button"
                onClick={() => handleToggleActive(tmpl.id, tmpl.active)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${
                  tmpl.active
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-100 text-slate-600 border-slate-200'
                }`}
              >
                {tmpl.active ? 'Active' : 'Inactive'}
              </button>
            </div>

            {/* Steps Timeline */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              {tmpl.steps.map((step, idx) => (
                <div key={idx} className="flex items-start gap-3 text-xs">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-50 text-blue-700 font-bold text-[10px] shrink-0 mt-0.5">
                    {idx + 1}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-slate-800 flex items-center justify-between">
                      <span>{step.title}</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        Due: +{step.dueDaysOffset}d
                      </span>
                    </div>
                    {step.description && (
                      <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">
                        {step.description}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* New Template Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-3xl p-6 space-y-4 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Create SOP Task Template</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Template Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VIP Retailer Seasonal Pitch"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  placeholder="Describe when field officers or operations staff should trigger this template..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Dynamic Steps List */}
              <div className="space-y-3 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">Action Steps ({steps.length})</span>
                  <button
                    type="button"
                    onClick={handleAddStep}
                    className="text-blue-600 hover:text-blue-800 font-semibold text-xs flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Step</span>
                  </button>
                </div>

                {steps.map((step, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 relative"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-[11px] text-slate-600">Step {idx + 1}</span>
                      {steps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(idx)}
                          className="text-slate-400 hover:text-rose-600"
                        >
                          ✕
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <input
                          type="text"
                          required
                          placeholder="Step title"
                          value={step.title}
                          onChange={(e) => handleStepChange(idx, 'title', e.target.value)}
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <input
                          type="number"
                          min={1}
                          required
                          placeholder="Due offset"
                          value={step.dueDaysOffset}
                          onChange={(e) =>
                            handleStepChange(idx, 'dueDaysOffset', Number(e.target.value))
                          }
                          className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                          title="Days offset from creation"
                        />
                      </div>
                    </div>

                    <input
                      type="text"
                      placeholder="Detailed instructions for officer (optional)"
                      value={step.description}
                      onChange={(e) => handleStepChange(idx, 'description', e.target.value)}
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-xs"
                >
                  Save Template
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
