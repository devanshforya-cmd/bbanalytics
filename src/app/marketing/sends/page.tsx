'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { getBrands } from '@/lib/db/brands-service';
import { Order, Influencer, BrandCode, OrderPlatform, InfluencerContentType } from '@/lib/types';
import PageGuard from '@/components/common/PageGuard';
import Breadcrumbs from '@/components/common/Breadcrumbs';
import { toast } from '@/components/common/Toast';
import { useCalendarPreference } from '@/lib/hooks/useCalendarPreference';
import {
  Gift,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  ExternalLink,
  Sparkles,
  TrendingUp,
  Package,
  Layers,
  Link2,
  Eye,
  Instagram,
  Video,
  Youtube,
  Share2,
} from 'lucide-react';

export default function MarketingSendsPage() {
  const { formatDate } = useCalendarPreference();
  const [orders, setOrders] = useState<Order[]>([]);
  const [influencers, setInfluencers] = useState<Influencer[]>([]);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBrand, setSelectedBrand] = useState<string>('ALL');
  const [selectedPlatform, setSelectedPlatform] = useState<string>('ALL');
  const [contentStatus, setContentStatus] = useState<'ALL' | 'RECEIVED' | 'PENDING'>('ALL');

  // Modal for adding content link
  const [activeOrderForLink, setActiveOrderForLink] = useState<Order | null>(null);
  const [contentUrl, setContentUrl] = useState('');
  const [contentType, setContentType] = useState<InfluencerContentType>('REEL');
  const [selectedOrderDetail, setSelectedOrderDetail] = useState<Order | null>(null);

  const reloadData = () => {
    setOrders(db.getMarketingOrders());
    setInfluencers(db.getInfluencers());
  };

  useEffect(() => {
    reloadData();
  }, []);

  // Filter marketing sends
  const filteredOrders = orders.filter((o) => {
    if (selectedBrand !== 'ALL' && o.brandCode !== selectedBrand) return false;
    if (selectedPlatform !== 'ALL' && o.platform !== selectedPlatform) return false;
    if (contentStatus === 'RECEIVED' && !o.contentReceived) return false;
    if (contentStatus === 'PENDING' && o.contentReceived) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchId = o.orderNumber.toLowerCase().includes(q);
      const matchCustomer = o.customerName.toLowerCase().includes(q);
      const matchHandle = o.influencerHandle ? o.influencerHandle.toLowerCase().includes(q) : false;
      const matchProducts = o.items.some((i) => i.productName.toLowerCase().includes(q));
      if (!matchId && !matchCustomer && !matchHandle && !matchProducts) return false;
    }
    return true;
  });

  // Calculate metrics
  const totalSends = orders.length;
  const contentReceivedCount = orders.filter((o) => o.contentReceived).length;
  const pendingContentCount = totalSends - contentReceivedCount;
  const returnRate = totalSends > 0 ? Math.round((contentReceivedCount / totalSends) * 100) : 0;

  // Estimated reach based on connected influencers
  const totalEstimatedReach = orders.reduce((sum, o) => {
    if (!o.influencerId) return sum + 10000;
    const inf = influencers.find((i) => i.id === o.influencerId);
    if (!inf) return sum + 10000;
    const followers = inf.platforms.reduce((s, p) => s + (p.followers || 15000), 0);
    return sum + followers;
  }, 0);

  const handleToggleContentReceived = (orderId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = db.toggleOrderContentReceived(orderId);
    reloadData();
    if (updated) {
      toast.success(`Content marked as ${updated.contentReceived ? 'RECEIVED ✓' : 'PENDING ⏳'}`);
    }
  };

  const handleSaveContentLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrderForLink || !contentUrl.trim()) return;

    // Detect platform from URL
    let plat: any = 'Instagram';
    const u = contentUrl.toLowerCase();
    if (u.includes('tiktok.com')) plat = 'TikTok';
    else if (u.includes('youtube.com') || u.includes('youtu.be')) plat = 'YouTube';

    db.addInfluencerContent({
      influencerId: activeOrderForLink.influencerId || 'inf_general',
      platform: plat,
      url: contentUrl.trim(),
      contentType,
      brandCode: activeOrderForLink.brandCode,
      productName: activeOrderForLink.items[0]?.productName || 'Product',
      datePostedAd: new Date().toISOString().split('T')[0],
      notes: `Captured from Marketing Send ${activeOrderForLink.orderNumber}`,
    });

    // Also mark content as received on the order
    if (!activeOrderForLink.contentReceived) {
      db.toggleOrderContentReceived(activeOrderForLink.id);
    }

    toast.success('Live content link attached to influencer profile!');
    setActiveOrderForLink(null);
    setContentUrl('');
    reloadData();
  };

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN', 'BRAND_MANAGER']}>
      <div className="space-y-6 pb-20">
        <Breadcrumbs
          items={[
            { label: 'Marketing', href: '/marketing/influencers' },
            { label: 'Marketing & Influencer Sends' },
          ]}
        />

        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-600 text-white shadow-xs">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">
                  Marketing &amp; Influencer Sends
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Fix 66 • Dedicated PR packages, barter sends, and content creation tracking
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/marketing/influencers"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
            >
              <span>Directory</span>
            </Link>
            <Link
              href="/orderflow/manual-entry"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 shadow transition"
            >
              <Plus className="w-4 h-4" />
              <span>+ Create Marketing Send</span>
            </Link>
          </div>
        </div>

        {/* 4 Overview Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-purple-200 bg-purple-50/50 p-4 shadow-2xs">
            <div className="flex items-center justify-between text-purple-700 text-xs font-semibold uppercase tracking-wider">
              <span>Total Marketing Sends</span>
              <Gift className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-3xl font-black text-purple-900 mt-2">{totalSends}</div>
            <div className="text-[11px] text-purple-700 mt-1">PR packages dispatched</div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs">
            <div className="flex items-center justify-between text-emerald-700 text-xs font-semibold uppercase tracking-wider">
              <span>Content Received</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-3xl font-black text-emerald-900 mt-2">
              {contentReceivedCount} <span className="text-sm font-bold text-emerald-700">({returnRate}%)</span>
            </div>
            <div className="text-[11px] text-emerald-700 mt-1">Reels, posts &amp; reviews live</div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs">
            <div className="flex items-center justify-between text-amber-700 text-xs font-semibold uppercase tracking-wider">
              <span>Pending Content</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-3xl font-black text-amber-900 mt-2">{pendingContentCount}</div>
            <div className="text-[11px] text-amber-700 mt-1">Delivered or awaiting post</div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-2xs">
            <div className="flex items-center justify-between text-blue-700 text-xs font-semibold uppercase tracking-wider">
              <span>Est. Total Reach</span>
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-3xl font-black text-blue-900 mt-2">
              {(totalEstimatedReach / 1000).toFixed(0)}k
            </div>
            <div className="text-[11px] text-blue-700 mt-1">Across Instagram &amp; TikTok</div>
          </div>
        </div>

        {/* Commercial Isolation Notice */}
        <div className="p-3.5 bg-purple-50 rounded-2xl border border-purple-200 flex items-center justify-between gap-3 text-xs text-purple-900">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
            <span>
              <strong>Commercial Isolation Active:</strong> Marketing sends are recorded with NPR 0 revenue and excluded from commercial delivery failure &amp; return KPIs on the main dashboard.
            </span>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[260px]">
            <div className="relative flex-1 max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by influencer, order #, product..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-blue-500"
              />
            </div>

            {/* Brand Filter */}
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="text-xs rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700"
            >
              <option value="ALL">All Brands</option>
              {getBrands('ACTIVE').map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>

            {/* Platform Filter */}
            <select
              value={selectedPlatform}
              onChange={(e) => setSelectedPlatform(e.target.value)}
              className="text-xs rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700"
            >
              <option value="ALL">All Platforms</option>
              <option value="Instagram">Instagram</option>
              <option value="TikTok">TikTok</option>
              <option value="YouTube">YouTube</option>
              <option value="Facebook">Facebook</option>
            </select>
          </div>

          {/* Content Status Segmented Filter */}
          <div className="inline-flex rounded-xl bg-slate-100 p-0.5 text-xs font-medium">
            {(['ALL', 'RECEIVED', 'PENDING'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setContentStatus(status)}
                className={`px-3 py-1 rounded-lg transition-all ${
                  contentStatus === status
                    ? 'bg-white text-purple-700 font-bold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status === 'ALL' ? 'All Sends' : status === 'RECEIVED' ? 'Content Live (✓)' : 'Pending (⏳)'}
              </button>
            ))}
          </div>
        </div>

        {/* Marketing Sends Table */}
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
          {filteredOrders.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              <Gift className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-slate-700">No marketing sends found</p>
              <p className="text-slate-400 mt-0.5">
                Check your filters or create a new marketing send via Manual Order Entry.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/75 border-b border-slate-200 text-slate-600 font-bold">
                    <th className="py-3 px-4">Order ID &amp; Date</th>
                    <th className="py-3 px-4">Influencer</th>
                    <th className="py-3 px-4">Platform</th>
                    <th className="py-3 px-4">Products Sent</th>
                    <th className="py-3 px-4">Delivery Status</th>
                    <th className="py-3 px-4 text-center">Content Received?</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                  {filteredOrders.map((o) => {
                    return (
                      <tr key={o.id} className="hover:bg-slate-50/60 transition-colors">
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span className="text-purple-600 font-mono">{o.orderNumber}</span>
                            <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-purple-100 text-purple-800 border border-purple-200">
                              🎁 MKT
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                            {o.orderDateAd}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{o.customerName}</div>
                          {o.influencerHandle ? (
                            <div className="text-[11px] text-purple-700 font-mono font-semibold">
                              {o.influencerHandle}
                            </div>
                          ) : (
                            <div className="text-[10px] text-slate-400">{o.customerPhone}</div>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                            {o.platform}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <div className="space-y-0.5">
                            {o.items.map((it, idx) => (
                              <div key={idx} className="text-[11px] text-slate-800">
                                <strong>{it.productName}</strong>{' '}
                                <span className="text-slate-400 font-semibold">×{it.quantity}</span>
                              </div>
                            ))}
                          </div>
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              o.status === 'DELIVERED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : o.status === 'DISPATCHED'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {o.status}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-center">
                          <button
                            type="button"
                            onClick={(e) => handleToggleContentReceived(o.id, e)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold transition shadow-2xs ${
                              o.contentReceived
                                ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300'
                                : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300'
                            }`}
                          >
                            {o.contentReceived ? (
                              <>
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Content Live</span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-3.5 h-3.5 text-amber-600" />
                                <span>Awaiting Post</span>
                              </>
                            )}
                          </button>
                        </td>

                        <td className="py-3 px-4 text-right space-x-2">
                          <button
                            type="button"
                            onClick={() => setActiveOrderForLink(o)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-purple-200 text-purple-700 hover:bg-purple-50 text-xs font-semibold transition"
                            title="Add live content URL"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span>Add Link</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setSelectedOrderDetail(o)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold transition"
                            title="View order details"
                          >
                            <Eye className="w-3.5 h-3.5 text-slate-500" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal: Attach Live Content URL */}
        {activeOrderForLink && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-purple-50 text-purple-600 rounded-xl">
                    <Link2 className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">Add Content URL</h3>
                    <p className="text-[11px] text-slate-500">{activeOrderForLink.customerName}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveOrderForLink(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleSaveContentLink} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Live Content Link (Instagram Reel, TikTok, YouTube)
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://www.instagram.com/reel/..."
                    value={contentUrl}
                    onChange={(e) => setContentUrl(e.target.value)}
                    className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:border-purple-500 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Content Format</label>
                  <select
                    value={contentType}
                    onChange={(e) => setContentType(e.target.value as InfluencerContentType)}
                    className="w-full text-xs rounded-xl border border-slate-200 p-2.5 focus:border-purple-500 focus:outline-hidden bg-white"
                  >
                    <option value="REEL">Instagram Reel</option>
                    <option value="TIKTOK">TikTok Video</option>
                    <option value="YOUTUBE_VIDEO">YouTube Video / Short</option>
                    <option value="POST">Feed Post / Carousel</option>
                    <option value="STORY">24h Story</option>
                    <option value="OTHER">Unboxing / Review Article</option>
                  </select>
                </div>

                <div className="p-2.5 bg-emerald-50 rounded-xl text-xs text-emerald-900 border border-emerald-200">
                  Submitting will automatically mark this send as <strong>Content Live</strong> and link it to the creator profile.
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setActiveOrderForLink(null)}
                    className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 text-xs font-bold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-xl bg-purple-600 text-white hover:bg-purple-700 text-xs font-bold shadow"
                  >
                    Attach Content
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Order Details Quick Inspector */}
        {selectedOrderDetail && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
            <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-4 border border-slate-200">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-purple-600 font-bold">{selectedOrderDetail.orderNumber}</span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">
                      Marketing Barter / PR Send
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-1">{selectedOrderDetail.customerName}</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedOrderDetail(null)}
                  className="text-slate-400 hover:text-slate-600 font-bold"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Delivery Location</span>
                    <strong className="text-slate-800 font-semibold">
                      {selectedOrderDetail.address || 'Kathmandu Valley'} ({selectedOrderDetail.district})
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Platform Handle</span>
                    <strong className="text-purple-700 font-mono font-bold">
                      {selectedOrderDetail.influencerHandle || 'Direct Contact'}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Delivery Courier</span>
                    <strong className="text-slate-800 font-semibold">{selectedOrderDetail.deliveryMethod || 'Pathao Rider'}</strong>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[10px] block">Invoice Commercial Value</span>
                    <strong className="text-emerald-700 font-bold">NPR 0 (Marketing Barter)</strong>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 mb-1.5">Products Included:</h4>
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                    {selectedOrderDetail.items.map((it, idx) => (
                      <div key={idx} className="p-2.5 flex items-center justify-between">
                        <div>
                          <strong className="text-slate-900">{it.productName}</strong>
                          <div className="text-[10px] text-slate-400">{it.brandCode}</div>
                        </div>
                        <span className="font-mono font-bold text-slate-700">Qty: {it.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedOrderDetail.notes && (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900">
                    <strong className="block font-bold">Marketing Brief / Notes:</strong>
                    <p className="mt-0.5">{selectedOrderDetail.notes}</p>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSelectedOrderDetail(null)}
                  className="px-5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </PageGuard>
  );
}
