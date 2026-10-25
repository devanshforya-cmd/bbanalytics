'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Plus, Trash2, Shield, AlertCircle, Sparkles, Check } from 'lucide-react';
import { db } from '@/lib/db/db-service';
import { Holiday, HolidayType } from '@/lib/types';
import { getTodayBs, getTodayAd, adToBs, NEPALI_MONTHS } from '@/lib/nepali-calendar';

export default function HolidayCalendarSection() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const todayAdStr = getTodayAd();
  const todayBsObj = adToBs(todayAdStr);
  const [yearBs, setYearBs] = useState<number>(todayBsObj.year);
  const [showAddModal, setShowAddModal] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [dateBs, setDateBs] = useState(getTodayBs());
  const [dateAd, setDateAd] = useState(todayAdStr);
  const [type, setType] = useState<HolidayType>('PUBLIC');
  const [notes, setNotes] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number>(5); // 0-indexed (Bhadra = 4 or 5)

  const reload = () => {
    setHolidays(db.getHolidays(yearBs));
  };

  useEffect(() => {
    reload();
  }, [yearBs]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !dateBs) return;

    db.addHoliday({
      name: name.trim(),
      dateBs,
      dateAd,
      type,
      yearBs,
      notes: notes.trim() || undefined,
    });

    setShowAddModal(false);
    setName('');
    setNotes('');
    reload();
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to remove this holiday?')) {
      db.deleteHoliday(id);
      reload();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-700">
              <Calendar className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-slate-900">National &amp; Company Holiday Calendar</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
            Holidays automatically adjust operational metrics: working days are deducted in weekly reports, morning briefs issue advance alerts, and beat plans expect zero field visits.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-slate-600">BS Year:</label>
            <select
              value={yearBs}
              onChange={(e) => setYearBs(Number(e.target.value))}
              className="text-xs font-bold py-1.5 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={2082}>2082 BS</option>
              <option value={2083}>2083 BS</option>
              <option value={2084}>2084 BS</option>
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Holiday</span>
          </button>
        </div>
      </div>

      {/* 12 Months Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {NEPALI_MONTHS.map((mObj, idx) => {
          const monthNumber = String(idx + 1).padStart(2, '0');
          const monthHolidays = holidays.filter((h) => h.dateBs.startsWith(`${yearBs}-${monthNumber}`));

          return (
            <div
              key={mObj.en}
              onClick={() => {
                setSelectedMonth(idx);
                setDateBs(`${yearBs}-${monthNumber}-15`);
              }}
              className={`p-3 rounded-2xl border transition-all cursor-pointer ${
                selectedMonth === idx
                  ? 'border-blue-500 bg-blue-50/50 shadow-xs'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900">{mObj.en}</span>
                <span className="text-[10px] text-slate-400 font-mono">#{idx + 1}</span>
              </div>

              <div className="mt-2 flex items-center gap-1">
                {monthHolidays.length > 0 ? (
                  monthHolidays.map((h) => (
                    <span
                      key={h.id}
                      title={`${h.name} (${h.dateBs})`}
                      className={`h-2.5 w-2.5 rounded-full ${
                        h.type === 'PUBLIC' ? 'bg-rose-500' : h.type === 'COMPANY' ? 'bg-purple-500' : 'bg-amber-500'
                      }`}
                    />
                  ))
                ) : (
                  <span className="text-[10px] text-slate-400 font-medium">0 holidays</span>
                )}
              </div>

              {monthHolidays.length > 0 && (
                <div className="mt-1 text-[10px] font-semibold text-slate-700 truncate">
                  {monthHolidays[0].name}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Holidays List Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h4 className="text-sm font-bold text-slate-900">
            Holidays for {yearBs} BS ({holidays.length} Total Registered)
          </h4>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span>Public</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
              <span>Company</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
              <span>Optional</span>
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 font-semibold bg-slate-50">
                <th className="py-2.5 px-3">Date (BS)</th>
                <th className="py-2.5 px-3">Date (AD)</th>
                <th className="py-2.5 px-3">Holiday Name</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Operational Notes</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {holidays.map((h) => (
                <tr key={h.id} className="hover:bg-slate-50 transition-colors">
                  <td className="py-3 px-3 font-bold text-slate-900">{h.dateBs}</td>
                  <td className="py-3 px-3 text-slate-500 font-mono">{h.dateAd}</td>
                  <td className="py-3 px-3 font-semibold text-slate-800">{h.name}</td>
                  <td className="py-3 px-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                        h.type === 'PUBLIC'
                          ? 'bg-rose-50 text-rose-700 border border-rose-200'
                          : h.type === 'COMPANY'
                          ? 'bg-purple-50 text-purple-700 border border-purple-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {h.type}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-slate-500">{h.notes || '—'}</td>
                  <td className="py-3 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(h.id)}
                      className="p-1 rounded text-slate-400 hover:text-rose-600 transition-colors"
                      title="Delete holiday"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Holiday Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-sm">Register New Holiday</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdd} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Holiday Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dashain Tika / Election Day"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date (BS) *</label>
                  <input
                    type="text"
                    required
                    placeholder="YYYY-MM-DD"
                    value={dateBs}
                    onChange={(e) => setDateBs(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Date (AD) *</label>
                  <input
                    type="date"
                    required
                    value={dateAd}
                    onChange={(e) => setDateAd(e.target.value)}
                    className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Holiday Type</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as HolidayType)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="PUBLIC">Public Holiday (Full Shutdown)</option>
                  <option value="COMPANY">Company Holiday (Office Only)</option>
                  <option value="OPTIONAL">Optional / Regional Festival</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notes / Instructions</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Couriers operate on half day, no field visits"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
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
                  Save Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
