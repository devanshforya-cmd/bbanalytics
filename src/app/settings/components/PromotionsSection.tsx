'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/db/db-service';
import { Promotion, BrandCode } from '@/lib/types';
import {
  Tag,
  Plus,
  Calendar,
  Gift,
  CheckCircle2,
  Store,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Percent,
} from 'lucide-react';

export default function PromotionsSection() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [brandCode, setBrandCode] = useState<BrandCode>('FORYA');
  const [offerType, setOfferType] = useState<Promotion['offerType']>('BUY_X_GET_Y');
  const [productNames, setProductNames] = useState('');
  const [validFromBs, setValidFromBs] = useState('Bhadra 1, 2083');
  const [validToBs, setValidToBs] = useState('Ashwin 30, 2083');
  const [validFromAd, setValidFromAd] = useState('2026-08-17');
  const [validToAd, setValidToAd] = useState('2026-10-16');
  const [applicableStoreTypes, setApplicableStoreTypes] = useState<'ALL' | 'GT' | 'MT' | 'SPECIFIC'>('ALL');
  const [description, setDescription] = useState('');

  useEffect(() => {
    loadPromos();
  }, []);

  const loadPromos = () => {
    // Get all promotions, including inactive ones
    setPromotions((db as any).promotions || db.getPromotions());
  };

  const handleToggleActive = (id: string, currentStatus: boolean) => {
    db.updatePromotion(id, { active: !currentStatus });
    loadPromos();
  };

  const handleCreatePromo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const items = productNames
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    db.addPromotion({
      name: name.trim(),
      brandCode,
      offerType,
      productIds: ['prod_gen_' + Date.now()],
      productNames: items.length > 0 ? items : ['General Brand Assortment'],
      validFromBs,
      validToBs,
      validFromAd,
      validToAd,
      applicableStoreTypes,
      description: description.trim() || `${name} applicable for ${brandCode}`,
      active: true,
    });

    setShowAddModal(false);
    setName('');
    setDescription('');
    setProductNames('');
    loadPromos();
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Tag className="w-6 h-6 text-brand-blue" />
              Trade Promotions & Consumer Offers (Fix 46d)
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Configure active schemes that automatically surface in the Smart Selling Assist tool when field officers visit stores.
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-brand-blue text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition flex items-center gap-2 shadow-sm self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            Create New Promotion
          </button>
        </div>
      </div>

      {/* Promotions List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {promotions.map((promo) => {
          const typeBadgeColor =
            promo.offerType === 'BUY_X_GET_Y'
              ? 'bg-purple-50 text-purple-700 border-purple-200'
              : promo.offerType === 'PERCENTAGE_OFF'
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : promo.offerType === 'COMBO'
              ? 'bg-blue-50 text-blue-700 border-blue-200'
              : 'bg-amber-50 text-amber-700 border-amber-200';

          return (
            <div
              key={promo.id}
              className={`bg-white rounded-xl border p-5 shadow-sm flex flex-col justify-between transition-all ${
                promo.active ? 'border-gray-200 hover:border-brand-blue/50' : 'border-gray-200 opacity-60 bg-gray-50/50'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider ${typeBadgeColor}`}>
                    {promo.offerType.replace(/_/g, ' ')}
                  </span>
                  <button
                    onClick={() => handleToggleActive(promo.id, promo.active)}
                    className="text-gray-500 hover:text-brand-blue"
                    title={promo.active ? 'Deactivate' : 'Activate'}
                  >
                    {promo.active ? (
                      <ToggleRight className="w-6 h-6 text-brand-blue" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-gray-400" />
                    )}
                  </button>
                </div>

                <div>
                  <h3 className="font-bold text-gray-900 text-sm leading-snug">{promo.name}</h3>
                  <p className="text-xs text-brand-blue font-semibold mt-0.5">{promo.brandCode}</p>
                  <p className="text-xs text-gray-600 mt-2 line-clamp-2">{promo.description}</p>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-gray-100 text-xs text-gray-600">
                  <div className="flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span className="truncate">Items: {promo.productNames.join(', ')}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span>Valid: {promo.validFromBs} – {promo.validToBs}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                    <span>Applicable: {promo.applicableStoreTypes} Stores</span>
                  </div>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
                    promo.active ? 'text-emerald-700' : 'text-gray-400'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {promo.active ? 'Active on Field App' : 'Paused'}
                </span>
                <span className="text-[10px] text-gray-400">Dashain / Tihar Festive</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Promotion Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                <Sparkles className="w-4 h-4 text-brand-blue" />
                Create New Promotion Scheme
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-400 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreatePromo} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Promotion Title *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dashain Bumper: Buy 10 Get 1 Free"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-blue"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Brand Portfolio</label>
                  <select
                    value={brandCode}
                    onChange={(e) => setBrandCode(e.target.value as BrandCode)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-brand-blue"
                  >
                    <option value="FORYA">FORYA</option>
                    <option value="PEE_SAFE">Pee Safe</option>
                    <option value="RENEE">Renée Cosmetics</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Offer Type</label>
                  <select
                    value={offerType}
                    onChange={(e) => setOfferType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-brand-blue"
                  >
                    <option value="BUY_X_GET_Y">Buy X Get Y Free</option>
                    <option value="PERCENTAGE_OFF">Percentage Discount</option>
                    <option value="COMBO">Bundle / Combo Offer</option>
                    <option value="FREE_SAMPLE">Free Sampling Unit</option>
                    <option value="NEW_LAUNCH">New Launch Special</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">
                  Applicable Products (Comma separated)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Cica Soothing Cleanser, Matte Lip Gloss"
                  value={productNames}
                  onChange={(e) => setProductNames(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-brand-blue"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Valid From (BS)</label>
                  <input
                    type="text"
                    value={validFromBs}
                    onChange={(e) => setValidFromBs(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Valid To (BS)</label>
                  <input
                    type="text"
                    value={validToBs}
                    onChange={(e) => setValidToBs(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Target Channel</label>
                <select
                  value={applicableStoreTypes}
                  onChange={(e) => setApplicableStoreTypes(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white"
                >
                  <option value="ALL">All Retailers & Distributors</option>
                  <option value="GT">General Trade (GT Kirana / Chemists)</option>
                  <option value="MT">Modern Trade (Supermarkets & Departmental)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase mb-1">Scheme Details / Notes</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Buy 12 units get 1 tester free + 5% extra retailer cash margin."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-brand-blue text-white text-xs font-semibold rounded-lg hover:bg-blue-700"
                >
                  Save Promotion
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
