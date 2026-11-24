'use client';

import PagedList from '@/components/common/PagedList';
import Portal from '@/components/common/Portal';
import React, { useState, useEffect } from 'react';
import { toast } from '@/components/common/Toast';
import { db } from '@/lib/db/db-service';
import { Promotion, BrandCode } from '@/lib/types';
import { getTodayAd, getTodayBs, adToBs } from '@/lib/nepali-calendar';
import {
  Tag,
  Plus,
  Calendar,
  Gift,
  CheckCircle2,
  Store,
  Lightbulb,
  ToggleLeft,
  ToggleRight,
  Percent,
} from 'lucide-react';

export default function PromotionsSection() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [name, setName] = useState('');
  const [brandCode, setBrandCode] = useState<BrandCode>('');
  const [offerType, setOfferType] = useState<Promotion['offerType']>('BUY_X_GET_Y');
  const [productNames, setProductNames] = useState('');
  const [validFromBs, setValidFromBs] = useState(() => getTodayBs());
  const [validToBs, setValidToBs] = useState(() => adToBs(new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]).formatted);
  const [validFromAd, setValidFromAd] = useState(() => getTodayAd());
  const [validToAd, setValidToAd] = useState(() => new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]);
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
    if (!name.trim() || !db.getBrands('ACTIVE').some(brand => brand.code === brandCode)) { toast.error('Enter a name and select an active brand.'); return; }

    const items = productNames
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);

    db.addPromotion({
      name: name.trim(),
      brandCode,
      offerType,
      productIds: [],
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
              <Tag className="w-6 h-6 text-blue-600" />
              Trade promotions & consumer offers
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Configure active schemes that automatically surface in the Smart Selling Assist tool when field officers visit stores.
            </p>
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="shrink-0 whitespace-nowrap px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition flex items-center gap-2 shadow-sm self-start md:self-auto"
          >
            <Plus className="w-4 h-4" />
            New promotion
          </button>
        </div>
      </div>

      {/* Promotions List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {<PagedList items={promotions} label="promotions" pageSize={10} render={(pageRows) => pageRows.map((promo) => {
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
              className={`bg-white rounded-xl border p-5 shadow-sm flex flex-col justify-between transition ${
                promo.active ? 'border-gray-200 hover:border-blue-600/50' : 'border-gray-200 opacity-60 bg-gray-50/50'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border   ${typeBadgeColor}`}>
                    {promo.offerType.replace(/_/g, ' ')}
                  </span>
                  <button
                    onClick={() => handleToggleActive(promo.id, promo.active)}
                    className="text-gray-500 hover:text-blue-600"
                    title={promo.active ? 'Deactivate' : 'Activate'}
                  >
                    {promo.active ? (
                      <ToggleRight className="w-6 h-6 text-blue-600" />
                    ) : (
                      <ToggleLeft className="w-6 h-6 text-gray-400" />
                    )}
                  </button>
                </div>

                <div>
                  <h3 className="font-bold text-gray-900 text-sm leading-snug">{promo.name}</h3>
                  <p className="text-xs text-blue-600 font-semibold mt-0.5">{promo.brandCode}</p>
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
                    promo.active ? 'text-emerald-700' : 'text-gray-500'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  {promo.active ? 'Active on Field App' : 'Paused'}
                </span>
                <span className="text-[11px] text-gray-500">Dashain / Tihar festive</span>
              </div>
            </div>
          );
        })} />}
      </div>

      {/* Create Promotion Modal */}
      {showAddModal && (
        <Portal><div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
              <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm">
                <Lightbulb className="w-4 h-4 text-blue-600" />
                New promotion Scheme
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-500 hover:text-gray-600 text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleCreatePromo} className="p-6 space-y-4">
              <div>
                <label htmlFor="promotionssection-promotion-title" className="block text-xs font-semibold text-gray-700 mb-1">Promotion title *</label>
                <input id="promotionssection-promotion-title"
                  type="text"
                  required
                  placeholder="e.g. Dashain Bumper: Buy 10 Get 1 Free"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="promotionssection-brand-portfolio" className="block text-xs font-semibold text-gray-700 mb-1">Brand portfolio</label>
                  <select id="promotionssection-brand-portfolio"
                    value={brandCode}
                    onChange={(e) => setBrandCode(e.target.value as BrandCode)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Select brand</option>
                    {db.getBrands('ACTIVE').map(brand => <option key={brand.id} value={brand.code}>{brand.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Offer type</label>
                  <select aria-label="Offer type"
                    value={offerType}
                    onChange={(e) => setOfferType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="BUY_X_GET_Y">Buy X get Y free</option>
                    <option value="PERCENTAGE_OFF">Percentage discount</option>
                    <option value="COMBO">Bundle / combo offer</option>
                    <option value="FREE_SAMPLE">Free sampling unit</option>
                    <option value="NEW_LAUNCH">New launch special</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Applicable products (comma separated)
                </label>
                <input aria-label="Applicable products (comma separated)"
                  type="text"
                  placeholder="e.g. Cica Soothing Cleanser, Matte Lip Gloss"
                  value={productNames}
                  onChange={(e) => setProductNames(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="promotionssection-valid-from-bs" className="block text-xs font-semibold text-gray-700 mb-1">Valid from (BS)</label>
                  <input id="promotionssection-valid-from-bs"
                    type="text"
                    value={validFromBs}
                    onChange={(e) => setValidFromBs(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label htmlFor="promotionssection-valid-to-bs" className="block text-xs font-semibold text-gray-700 mb-1">Valid to (BS)</label>
                  <input id="promotionssection-valid-to-bs"
                    type="text"
                    value={validToBs}
                    onChange={(e) => setValidToBs(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="promotionssection-target-channel" className="block text-xs font-semibold text-gray-700 mb-1">Target channel</label>
                <select id="promotionssection-target-channel"
                  value={applicableStoreTypes}
                  onChange={(e) => setApplicableStoreTypes(e.target.value as any)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-xs bg-white"
                >
                  <option value="ALL">All retailers & distributors</option>
                  <option value="GT">General trade (GT kirana / chemists)</option>
                  <option value="MT">Modern trade (supermarkets & departmental)</option>
                </select>
              </div>

              <div>
                <label htmlFor="promotionssection-scheme-details-notes" className="block text-xs font-semibold text-gray-700 mb-1">Scheme details / notes</label>
                <textarea id="promotionssection-scheme-details-notes"
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
                  className="btn btn-primary"
                >
                  Save promotion
                </button>
              </div>
            </form>
          </div>
        </div></Portal>
      )}
    </div>
  );
}
