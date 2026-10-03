'use client';

import React, { useState } from 'react';
import { db } from '@/lib/db/db-service';
import { ReviewCategory } from '@/lib/types';
import { Check, Plus, X } from 'lucide-react';

interface DynamicCheckboxesProps {
  selectedCategories: string[];
  onChange: (selected: string[]) => void;
}

export default function DynamicCheckboxes({
  selectedCategories,
  onChange,
}: DynamicCheckboxesProps) {
  const [categories, setCategories] = useState<ReviewCategory[]>(db.getReviewCategories());
  const [showAddModal, setShowAddModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  const handleToggle = (name: string) => {
    if (selectedCategories.includes(name)) {
      onChange(selectedCategories.filter((c) => c !== name));
    } else {
      onChange([...selectedCategories, name]);
    }
  };

  const handleCreateCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim()) return;
    const created = db.addReviewCategory(newCatName.trim());
    setCategories([...db.getReviewCategories()]);
    onChange([...selectedCategories, created.name]);
    setNewCatName('');
    setShowAddModal(false);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-bold text-slate-700">
          Issue Categories (Dynamic Multi-Select)
        </label>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Create New Category
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => {
          const isSelected = selectedCategories.includes(cat.name);
          return (
            <button
              type="button"
              key={cat.id}
              onClick={() => handleToggle(cat.name)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                isSelected
                  ? 'border-blue-600 bg-blue-50 text-blue-700 font-semibold shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <div
                className={`flex h-3.5 w-3.5 items-center justify-center rounded border transition ${
                  isSelected
                    ? 'border-blue-600 bg-blue-600 text-white'
                    : 'border-slate-300 bg-white'
                }`}
              >
                {isSelected && <Check className="h-2.5 w-2.5" />}
              </div>
              <span>{cat.name}</span>
              <span className="text-[10px] text-slate-400">({cat.tickCount})</span>
            </button>
          );
        })}
      </div>

      {/* Modal to organically create new category */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl space-y-3 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h4 className="font-bold text-slate-900 text-sm">Create Issue Category</h4>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-slate-500 text-[11px]">
              This category will be permanently added to the system library for future complaints and return tracking.
            </p>
            <input
              type="text"
              autoFocus
              placeholder="e.g. Pump Mechanism Failure, Seal Broken"
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateCategory}
                disabled={!newCatName.trim()}
                className="rounded-lg bg-blue-600 px-4 py-1.5 font-semibold text-white hover:bg-blue-700 shadow disabled:opacity-50"
              >
                Create & Select
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
