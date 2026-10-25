'use client';

import React, { useState } from 'react';
import { db } from '@/lib/db/db-service';
import { CallLog, CallLabel, CallOutcome, Product } from '@/lib/types';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import { toast } from '@/components/common/Toast';
import { validateRequired, validateNepaliPhone, validateQuantity } from '@/lib/validation';
import {
  PhoneCall,
  Plus,
  Search,
  CheckCircle,
  FileSpreadsheet,
  Clock,
  Camera,
  ShoppingBag,
  Calendar,
  X,
  PhoneOutgoing,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';
import EmptyState from '@/components/common/EmptyState';
import { getScope } from '@/lib/permissions';

export default function CallsPage() {
  const [currentUser] = useState(() => db.getCurrentUser());
  const isSalesOfficer = getScope(currentUser, 'call_tracker') === 'OWN';
  const [calls, setCalls] = useState<CallLog[]>(db.getCalls());
  const [searchTerm, setSearchTerm] = useState('');
  const [showLogModal, setShowLogModal] = useState(false);
  const [formErrors, setFormErrors] = useState<{ [key: string]: string }>({});

  // Form State
  const [storeName, setStoreName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [durationMinutes, setDurationMinutes] = useState(3);
  const [callLabel, setCallLabel] = useState<CallLabel>('Order Taking');
  const [callOutcome, setCallOutcome] = useState<CallOutcome>('Order Received');
  const [notes, setNotes] = useState('');
  const [isManual, setIsManual] = useState(false);

  // Inline Order Creation (When outcome === 'Order Received')
  const products = db.getProducts();
  const [orderProductId, setOrderProductId] = useState(products[0]?.id || '');
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [paymentTerms, setPaymentTerms] = useState('Credit 15 days');

  const handleSaveCall = () => {
    const errors: { [key: string]: string } = {};
    const storeErr = validateRequired(storeName, 'Store / Account');
    if (storeErr) errors.storeName = storeErr;

    if (contactPhone.trim()) {
      const phoneErr = validateNepaliPhone(contactPhone);
      if (phoneErr) errors.contactPhone = phoneErr;
    }

    if (callOutcome === 'Order Received') {
      const qtyErr = validateQuantity(orderQuantity);
      if (qtyErr) errors.orderQuantity = qtyErr;
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      toast.error('Please fix the validation errors before saving.');
      return;
    }
    setFormErrors({});

    let createdOrderId: string | undefined;

    // If order was received, create the order inline
    if (callOutcome === 'Order Received') {
      const prod = products.find((p) => p.id === orderProductId);
      const newOrder = db.addOrder({
        orderNumber: `BB-FLD-${Date.now().toString().slice(-4)}`,
        brandCode: prod?.brandCode || 'FORYA',
        orderDateAd: getTodayAd(),
        orderDateBs: getTodayBs(),
        platform: 'Phone Call',
        customerName: storeName,
        customerPhone: contactPhone,
        province: 'Bagmati Province',
        district: 'Kathmandu',
        address: `${storeName} Outlet`,
        deliveryMethod: 'Standard',
        paymentTerms: paymentTerms as any,
        orderType: 'REPEAT',
        totalAmount: 0,
        status: 'PENDING',
        source: 'FIELD_CALL',
        notes: `Direct phone order logged by field officer for ${storeName}`,
        items: [
          {
            productId: prod?.id || '',
            productName: prod?.name || 'Product',
            brandCode: prod?.brandCode || 'FORYA',
            quantity: orderQuantity,
            unitPrice: 0,
            totalPrice: 0,
          },
        ],
      });
      createdOrderId = newOrder.id;
    }

    // Auto-create follow-up task if outcome is Follow-up Needed or Payment Promised
    if (callOutcome === 'Follow-up Needed' || callOutcome === 'Payment Promised') {
      db.addTask({
        title: `Call Follow-up: ${storeName} (${contactName})`,
        description: `Outcome was "${callOutcome}". Notes: ${notes || 'Follow up on order/payment confirmation.'}`,
        assignedTo: db.getCurrentUser().id,
        assignedToName: db.getCurrentUser().fullName,
        createdBy: db.getCurrentUser().fullName,
        priority: 'MEDIUM',
        dueDateAd: getTodayAd(),
        dueDateBs: 'Tomorrow',
        relatedTo: 'Order follow-up',
        status: 'PENDING',
        autoCreated: true,
      });
    }

    db.recordCall({
      storeName,
      contactName,
      contactPhone,
      durationSeconds: durationMinutes * 60,
      label: callLabel,
      outcome: callOutcome,
      isManual,
      notes,
      dateAd: getTodayAd(),
      dateBs: getTodayBs(),
      createdOrderId,
    });

    setCalls([...db.getCalls()]);
    setShowLogModal(false);
    toast.success('Call logged successfully. ' + (createdOrderId ? 'Dispatch queue order created inline!' : ''));
  };

  const filteredCalls = calls.filter((c) => {
    if (isSalesOfficer && c.officerId !== currentUser.id && c.officerName !== currentUser.fullName) {
      return false;
    }
    return (
      c.storeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.contactName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.label.toLowerCase().includes(searchTerm.toLowerCase())
    );
  });

  return (
    <PageGuard feature="call_tracker">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
              Field Call Tracker
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Logs sales, order-taking, and payment follow-up calls with inline order creation.
            </p>
          </div>

          <button
            onClick={() => setShowLogModal(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            Log Call
          </button>
        </div>

        {/* Search & List */}
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm flex items-center gap-3">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search calls by store, contact, or label..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs outline-none"
          />
        </div>

        {/* Calls Grid / List */}
        <div className="space-y-3">
          {filteredCalls.length === 0 ? (
            <EmptyState
              type="generic"
              icon={PhoneCall}
              title="No calls logged yet"
              description="Click 'Log Call' to record order-taking or payment follow-up calls."
            />
          ) : (
            filteredCalls.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2 text-xs"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-900 text-sm">{c.storeName}</h3>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                      {c.label}
                    </span>
                    {c.isManual && (
                      <span className="rounded bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.2 text-[9px] font-medium">
                        Manual Screenshot
                      </span>
                    )}
                  </div>
                  <div className="text-slate-500 mt-0.5">
                    Contact: <strong className="text-slate-700">{c.contactName}</strong> ({c.contactPhone}) • Duration: {Math.round(c.durationSeconds / 60)} mins
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2.5 py-0.5 font-bold uppercase tracking-wider text-[10px] ${
                      c.outcome === 'Order Received'
                        ? 'bg-emerald-100 text-emerald-800'
                        : c.outcome === 'Payment Promised'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    Outcome: {c.outcome}
                  </span>
                </div>
              </div>

              {c.notes && (
                <div className="text-slate-600 bg-slate-50 p-2.5 rounded-lg text-[11px]">
                  &quot;{c.notes}&quot;
                </div>
              )}

              <div className="text-[10px] text-slate-400 border-t border-slate-100 pt-2 flex justify-between">
                <span>Logged by {c.officerName} on {c.dateBs} ({c.dateAd})</span>
                {c.createdOrderId && (
                  <span className="text-emerald-700 font-bold">✓ Order created in dispatch queue</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Log Call Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[90vh] flex flex-col rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Log Call with Vendor</h3>
                <p className="text-xs text-slate-500">Record conversation outcome and trigger orders</p>
              </div>
              <button onClick={() => setShowLogModal(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Store / Account *</label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => {
                      setStoreName(e.target.value);
                      if (formErrors.storeName) setFormErrors((prev) => ({ ...prev, storeName: '' }));
                    }}
                    className={`w-full rounded-lg border ${formErrors.storeName ? 'border-red-500 bg-red-50/20' : 'border-slate-300'} px-3 py-2 outline-none`}
                  />
                  {formErrors.storeName && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.storeName}</p>
                  )}
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="text"
                    value={contactPhone}
                    onChange={(e) => {
                      setContactPhone(e.target.value);
                      if (formErrors.contactPhone) setFormErrors((prev) => ({ ...prev, contactPhone: '' }));
                    }}
                    className={`w-full rounded-lg border ${formErrors.contactPhone ? 'border-red-500 bg-red-50/20' : 'border-slate-300'} px-3 py-2 outline-none`}
                    placeholder="98XXXXXXXX"
                  />
                  {formErrors.contactPhone && (
                    <p className="mt-1 text-xs text-red-500">{formErrors.contactPhone}</p>
                  )}
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Duration (Minutes)</label>
                  <input
                    type="number"
                    min="1"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 1)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Call Label *</label>
                  <select
                    value={callLabel}
                    onChange={(e) => setCallLabel(e.target.value as CallLabel)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none"
                  >
                    <option>Order Taking</option>
                    <option>Payment Follow-up</option>
                    <option>Stock Inquiry</option>
                    <option>Complaint Resolution</option>
                    <option>General Check-in</option>
                    <option>No Answer</option>
                    <option>Meeting Scheduled</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Call Outcome *</label>
                  <select
                    value={callOutcome}
                    onChange={(e) => setCallOutcome(e.target.value as CallOutcome)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 bg-white outline-none font-semibold text-blue-700"
                  >
                    <option>Order Received</option>
                    <option>Payment Promised</option>
                    <option>Issue Resolved</option>
                    <option>Follow-up Needed</option>
                    <option>Callback Requested</option>
                    <option>No Outcome</option>
                  </select>
                </div>
              </div>

              {/* EXPANDED INLINE ORDER CREATION (PRD 4.4) */}
              {callOutcome === 'Order Received' && (
                <div className="rounded-xl border border-emerald-300 bg-emerald-50/50 p-4 space-y-3">
                  <div className="flex items-center gap-2 font-bold text-emerald-950 text-xs uppercase tracking-wider">
                    <ShoppingBag className="h-4 w-4 text-emerald-700" />
                    Inline Order Creation (From Call)
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-emerald-900 mb-1">Product</label>
                      <select
                        value={orderProductId}
                        onChange={(e) => setOrderProductId(e.target.value)}
                        className="w-full rounded-lg border border-emerald-300 px-3 py-2 bg-white outline-none"
                      >
                        {products.map((p) => (
                          <option key={p.id} value={p.id}>
                            [{p.brandCode}] {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-emerald-900 mb-1">Quantity</label>
                      <input
                        type="number"
                        min="1"
                        value={orderQuantity}
                        onChange={(e) => {
                          setOrderQuantity(parseInt(e.target.value) || 1);
                          if (formErrors.orderQuantity) setFormErrors((prev) => ({ ...prev, orderQuantity: '' }));
                        }}
                        className={`w-full rounded-lg border ${formErrors.orderQuantity ? 'border-red-500 bg-red-50/20' : 'border-emerald-300'} px-3 py-2 bg-white outline-none font-bold`}
                      />
                      {formErrors.orderQuantity && (
                        <p className="mt-1 text-xs text-red-600">{formErrors.orderQuantity}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-emerald-900 mb-1">Payment Terms</label>
                      <select
                        value={paymentTerms}
                        onChange={(e) => setPaymentTerms(e.target.value)}
                        className="w-full rounded-lg border border-emerald-300 px-3 py-2 bg-white outline-none"
                      >
                        <option>COD</option>
                        <option>Credit 15 days</option>
                        <option>Credit 30 days</option>
                        <option>Advance</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-emerald-900 mb-1">Upload Written Sheet</label>
                      <button
                        type="button"
                        className="w-full rounded-lg border border-dashed border-emerald-400 bg-white px-3 py-2 text-center text-emerald-700 hover:bg-emerald-50 flex items-center justify-center gap-1"
                      >
                        <Camera className="h-3.5 w-3.5" />
                        Snap Order Sheet
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes & Discussion Summary</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Retailer asked for fast delivery before weekend rush"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 outline-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isManual"
                  checked={isManual}
                  onChange={(e) => setIsManual(e.target.checked)}
                  className="h-4 w-4 rounded text-blue-600"
                />
                <label htmlFor="isManual" className="text-slate-700">
                  Call was made outside the app (manual log / call history screenshot)
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-3 bg-slate-50 rounded-b-2xl">
              <button
                onClick={() => setShowLogModal(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCall}
                className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-700 shadow"
              >
                {callOutcome === 'Order Received' ? 'Save Call + Create Order' : 'Save Call Log'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </PageGuard>
  );
}
