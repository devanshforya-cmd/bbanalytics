'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import {
  Order,
  DeliveryFailure,
  ReturnEntry,
  FeedbackEntry,
  Cheque,
  BeatItem,
  BrandCode,
  OfficerScorecard,
} from '@/lib/types';
import SkeletonLoader from './SkeletonLoader';

export type DrillDownType =
  | 'ORDERS'
  | 'DELIVERY_FAILURES'
  | 'RETURNS'
  | 'COMPLAINTS'
  | 'STORES_VISITED'
  | 'CHEQUES';

const DrillDownLoading = () => (
  <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm">
    <div className="w-full max-w-5xl h-full bg-white p-6 shadow-2xl">
      <SkeletonLoader type="table" />
    </div>
  </div>
);

// 58c. Dynamic imports for drill-down modal chunks
const OrdersDrillDown = dynamic(() => import('./drilldowns/OrdersDrillDown'), {
  loading: DrillDownLoading,
});

const DeliveryFailuresDrillDown = dynamic(
  () => import('./drilldowns/DeliveryFailuresDrillDown'),
  { loading: DrillDownLoading }
);

const ReturnsDrillDown = dynamic(() => import('./drilldowns/ReturnsDrillDown'), {
  loading: DrillDownLoading,
});

const ComplaintsDrillDown = dynamic(
  () => import('./drilldowns/ComplaintsDrillDown'),
  { loading: DrillDownLoading }
);

const StoreVisitsDrillDown = dynamic(
  () => import('./drilldowns/StoreVisitsDrillDown'),
  { loading: DrillDownLoading }
);

const ChequesDrillDown = dynamic(() => import('./drilldowns/ChequesDrillDown'), {
  loading: DrillDownLoading,
});

interface MetricDrillDownModalProps {
  type: DrillDownType | null;
  onClose: () => void;
  orders: Order[];
  deliveryFailures: DeliveryFailure[];
  returns: ReturnEntry[];
  feedback: FeedbackEntry[];
  cheques: Cheque[];
  beatItems: BeatItem[];
  scorecards: OfficerScorecard[];
  activeBrand: BrandCode;
  calendarMode: 'BS' | 'AD';
}

/**
 * 58a. MetricDrillDownModal Router
 * Lightweight router that delegates each metric drill-down to a dedicated modular chunk.
 */
export default function MetricDrillDownModal({
  type,
  onClose,
  orders,
  deliveryFailures,
  returns,
  feedback,
  cheques,
  beatItems,
  scorecards,
  activeBrand,
  calendarMode,
}: MetricDrillDownModalProps) {
  if (!type) return null;

  switch (type) {
    case 'ORDERS':
      return (
        <OrdersDrillDown
          orders={orders}
          returns={returns}
          calendarMode={calendarMode}
          onClose={onClose}
        />
      );
    case 'DELIVERY_FAILURES':
      return (
        <DeliveryFailuresDrillDown
          deliveryFailures={deliveryFailures}
          orders={orders}
          calendarMode={calendarMode}
          onClose={onClose}
        />
      );
    case 'RETURNS':
      return (
        <ReturnsDrillDown
          returns={returns}
          orders={orders}
          calendarMode={calendarMode}
          onClose={onClose}
        />
      );
    case 'COMPLAINTS':
      return (
        <ComplaintsDrillDown
          feedback={feedback}
          orders={orders}
          calendarMode={calendarMode}
          onClose={onClose}
        />
      );
    case 'STORES_VISITED':
      return (
        <StoreVisitsDrillDown
          beatItems={beatItems}
          scorecards={scorecards}
          onClose={onClose}
        />
      );
    case 'CHEQUES':
      return (
        <ChequesDrillDown
          cheques={cheques}
          scorecards={scorecards}
          calendarMode={calendarMode}
          onClose={onClose}
        />
      );
    default:
      return null;
  }
}
