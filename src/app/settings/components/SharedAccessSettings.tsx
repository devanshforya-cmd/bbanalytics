'use client';

import React, { useState } from 'react';
import { db } from '@/lib/db/db-service';
import { SharedAccessLink, SharedAccessAllowedPage, BrandCode } from '@/lib/types';
import {
  Link2,
  Plus,
  Copy,
  Check,
  ShieldCheck,
  Calendar,
  Eye,
  AlertTriangle,
  Lock,
  ExternalLink,
  Ban,
  Clock,
  Sparkles,
} from 'lucide-react';
import { toast } from '@/components/common/Toast';

export default function SharedAccessSettings() {
  const [links, setLinks] = useState<SharedAccessLink[]>(db.getSharedAccessLinks());
  const [showModal, setShowModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [brandScope, setBrandScope] = useState<'ALL' | BrandCode[]>('ALL');
  const [allowedPages, setAllowedPages] = useState<SharedAccessAllowedPage[]>([
    'dashboard',
    'products',
    'delivery-failures',
    'returns',
  ]);
  const [expiresInDays, setExpiresInDays] = useState<number | 'never'>(30);
  const [passcode, setPasscode] = useState('');
  const [createdLinkUrl, setCreatedLinkUrl] = useState<string | null>(null);

  const reloadLinks = () => {
    setLinks(db.getSharedAccessLinks());
  };

  const handleCopy = (token: string, id: string) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const fullUrl = `${origin}/shared/${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedId(id);
    toast.success('Shared access link copied to clipboard!');
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleDeactivate = (id: string) => {
    if (confirm('Are you sure you want to revoke this shared link? Anyone with the URL will immediately lose access.')) {
      db.deactivateSharedAccessLink(id);
      reloadLinks();
      toast.info('Shared access link revoked');
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Please specify a link name (e.g. Agency name)');
      return;
    }
    if (allowedPages.length === 0) {
      toast.error('Please select at least one allowed section');
      return;
    }

    let expiresAt: string | undefined = undefined;
    if (expiresInDays !== 'never') {
      const expDate = new Date();
      expDate.setDate(expDate.getDate() + Number(expiresInDays));
      expiresAt = expDate.toISOString();
    }

    const brandFilter: BrandCode[] = brandScope === 'ALL' ? ['FORYA', 'PEESAFE', 'RENEE'] : brandScope;
    const currentUser = db.getCurrentUser();

    const newLink = db.createSharedAccessLink({
      name: name.trim(),
      brandScope,
      brandFilter,
      allowedPages,
      expiresAt,
      passcode: passcode.trim() || undefined,
      maskCustomerPii: true,
      hideFinancials: true,
      showCustomerDetails: false,
      showStaffDetails: false,
      showOrderRows: true,
      showProductNames: true,
      showComboDetails: true,
      dateRangeType: 'LIVE',
      createdBy: currentUser.fullName,
      createdById: currentUser.id,
    });

    reloadLinks();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    setCreatedLinkUrl(`${origin}/shared/${newLink.token}`);
    toast.success('Secure shared link generated!');
  };

  const resetForm = () => {
    setName('');
    setBrandScope('ALL');
    setAllowedPages(['dashboard', 'products', 'delivery-failures', 'returns']);
    setExpiresInDays(30);
    setPasscode('');
    setCreatedLinkUrl(null);
    setShowModal(false);
  };

  const togglePage = (page: SharedAccessAllowedPage) => {
    setAllowedPages((prev) =>
      prev.includes(page) ? prev.filter((p) => p !== page) : [...prev, page]
    );
  };

  const toggleBrand = (b: BrandCode) => {
    if (brandScope === 'ALL') {
      setBrandScope([b]);
    } else {
      const exists = brandScope.includes(b);
      const next = exists ? brandScope.filter((x) => x !== b) : [...brandScope, b];
      setBrandScope(next.length === 0 ? 'ALL' : next);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900">Custom Shared Access (External / Agency Links)</h2>
            <span className="rounded-full bg-blue-50 text-blue-700 text-[10px] font-bold px-2.5 py-0.5 border border-blue-200">
              Fix 63
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Grant external marketing agencies and campaign partners secure, read-only operational views without creating user accounts.
            All customer PII (phone numbers, addresses) and internal financials are automatically masked.
          </p>
        </div>

        <button
          onClick={() => {
            resetForm();
            setShowModal(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Generate Shared Link</span>
        </button>
      </div>

      {/* Links table */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            Active &amp; Historical Shared Access Links ({links.length})
          </div>
        </div>

        {links.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs">
            No shared access links created yet. Click above to create a secure link for your external partners.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-bold">
                  <th className="py-3 px-4">Link Name</th>
                  <th className="py-3 px-4">Brand Scope</th>
                  <th className="py-3 px-4">Allowed Sections</th>
                  <th className="py-3 px-4">Passcode</th>
                  <th className="py-3 px-4">Expires</th>
                  <th className="py-3 px-4 text-center">Views</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                {links.map((link) => {
                  const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();
                  const isLive = link.isActive && !isExpired;

                  return (
                    <tr key={link.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 flex items-center gap-1.5">
                          <Link2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>{link.name}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Created {new Date(link.createdAt).toLocaleDateString()} by {link.createdBy || link.createdById || 'Admin'}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {(!link.brandScope || link.brandScope === 'ALL') ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                            All Portfolio Brands
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {Array.isArray(link.brandScope) && link.brandScope.map((b: BrandCode) => (
                              <span
                                key={b}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200"
                              >
                                {b}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {link.allowedPages.map((page) => (
                            <span
                              key={page}
                              className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium"
                            >
                              {page === 'delivery-failures'
                                ? 'Failures'
                                : page.charAt(0).toUpperCase() + page.slice(1)}
                            </span>
                          ))}
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        {link.passcode ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Lock className="w-3 h-3 text-amber-600" />
                            Required
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">Direct Link</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-[11px]">
                        {link.expiresAt ? (
                          <span className={isExpired ? 'text-rose-600 font-bold' : 'text-slate-600'}>
                            {new Date(link.expiresAt).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-emerald-700 font-medium">Never expires</span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                          <Eye className="w-3 h-3 text-slate-500" />
                          {link.accessCount}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        {isLive ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                            Active
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                            Expired
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-700">
                            Revoked
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleCopy(link.token, link.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
                          title="Copy Link URL"
                        >
                          {copiedId === link.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-slate-500" />
                          )}
                          <span>{copiedId === link.id ? 'Copied' : 'Copy'}</span>
                        </button>

                        <a
                          href={`/shared/${link.token}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-semibold transition"
                          title="Preview in new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Preview</span>
                        </a>

                        {link.isActive && (
                          <button
                            onClick={() => handleDeactivate(link.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold transition"
                            title="Revoke access"
                          >
                            <Ban className="w-3.5 h-3.5" />
                            <span>Revoke</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generator Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 border border-slate-200 max-h-[90vh] overflow-y-auto">
            {createdLinkUrl ? (
              <div className="space-y-4 text-center py-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Secure Shared Link Created!</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Send this link to your external partners or digital agency:
                  </p>
                </div>

                <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 break-all text-left select-all">
                  <span className="flex-1">{createdLinkUrl}</span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(createdLinkUrl);
                      toast.success('Copied link URL!');
                    }}
                    className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 shrink-0"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </div>

                {passcode && (
                  <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 font-medium">
                    ⚠️ Required Passcode: <strong className="font-mono text-amber-900">{passcode}</strong>
                  </div>
                )}

                <div className="pt-3">
                  <button
                    onClick={resetForm}
                    className="w-full py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
                      <Link2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-sm">Generate Custom Shared Access Link</h3>
                      <p className="text-[11px] text-slate-500">Tokenized read-only access for external partners</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-slate-400 hover:text-slate-600 text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>

                {/* Link Name */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Link Name / Recipient <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g., Digital Agency — Q3 Meta Ads Campaign"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:border-blue-500 focus:outline-hidden"
                  />
                </div>

                {/* Brand Scope */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Brand Scope</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setBrandScope('ALL')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                        brandScope === 'ALL'
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      All Portfolio Brands
                    </button>
                    {(['FORYA', 'PEESAFE', 'RENEE'] as BrandCode[]).map((b) => {
                      const isSelected = brandScope !== 'ALL' && brandScope.includes(b);
                      return (
                        <button
                          key={b}
                          type="button"
                          onClick={() => toggleBrand(b)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${
                            isSelected
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          {b}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Allowed Sections */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Allowed Sections</label>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { id: 'dashboard' as SharedAccessAllowedPage, label: 'Dashboard Overview & Charts' },
                      { id: 'products' as SharedAccessAllowedPage, label: 'Products & Performance' },
                      { id: 'delivery-failures' as SharedAccessAllowedPage, label: 'Delivery Failure Trends' },
                      { id: 'returns' as SharedAccessAllowedPage, label: 'Return Rates & Reasons' },
                    ].map((sec) => (
                      <label
                        key={sec.id}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition ${
                          allowedPages.includes(sec.id)
                            ? 'border-blue-300 bg-blue-50/50 text-blue-900 font-semibold'
                            : 'border-slate-200 text-slate-600'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={allowedPages.includes(sec.id)}
                          onChange={() => togglePage(sec.id)}
                          className="rounded text-blue-600 focus:ring-blue-500"
                        />
                        <span>{sec.label}</span>
                      </label>
                    ))}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1.5 italic">
                    Note: Customer 360, offline beat plans, cheques, and settings are always restricted.
                  </div>
                </div>

                {/* Customer Privacy Masking Notice */}
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-start gap-2.5 text-xs text-emerald-900">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="block font-bold">Automatic Privacy &amp; Commercial Guardrails</strong>
                    Customer names will be masked as &quot;S*** S***&quot;, phone numbers as &quot;98****1234&quot;, and internal product margins/financials are stripped.
                  </div>
                </div>

                {/* Expiration & Passcode */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Expiration Period</label>
                    <select
                      value={expiresInDays}
                      onChange={(e) =>
                        setExpiresInDays(e.target.value === 'never' ? 'never' : Number(e.target.value))
                      }
                      className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:border-blue-500 focus:outline-hidden bg-white"
                    >
                      <option value={7}>7 Days (1 Week)</option>
                      <option value={30}>30 Days (1 Month)</option>
                      <option value={90}>90 Days (1 Quarter)</option>
                      <option value="never">Never (Manual Revoke Only)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Access Passcode <span className="text-slate-400 font-normal">(optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 8492 (leave empty for none)"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:border-blue-500 focus:outline-hidden font-mono"
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 text-xs font-bold shadow"
                  >
                    Generate Secure Link
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
