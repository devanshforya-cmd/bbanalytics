'use client';

import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/db/db-service';
import { getTodayAd } from '@/lib/nepali-calendar';
import { prepare, type MetricData, type Prepared } from '@/lib/metrics/sources';
import type { BrandCode } from '@/lib/types';

/** Everything the dashboard counts from, as this person is allowed to see it. Refreshed whenever the workspace changes. */
export function readMetricData(): MetricData {
  const all = 'ALL' as BrandCode;
  return {
    today: getTodayAd(), brands: db.getBrands('ALL'), users: db.getUsers(), products: db.getProducts(all),
    orders: db.getOrders(all), deliveryFailures: db.getDeliveryFailures(all), returns: db.getReturns(all), orderIssues: db.getOrderIssues(all), feedback: db.getFeedback(all),
    customers: db.getCustomers(), customerCalls: db.getCustomerCalls(), followUpPlan: db.getFollowUpPlan(),
    storeOrders: db.getSecondaryOrders({ allBrands: true }), dispatches: db.getDispatches(), cheques: db.getCheques(), visits: db.getVisits(),
    beatItems: db.getBeatItems(), stockCounts: db.getStockCounts(), storeCalls: db.getCalls(), tasks: db.getTasks(), marketingSends: db.getMarketingSends(),
    distributors: db.getDistributors(), branches: db.getBranches(), retailers: db.getRetailers(),
  };
}

export function useMetricData(): { prepared: Prepared; version: number } {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let timer: number | undefined;
    // Several saves can arrive together; count once they settle.
    const bump = () => { window.clearTimeout(timer); timer = window.setTimeout(() => setVersion((v) => v + 1), 150); };
    window.addEventListener('bb-db-updated', bump);
    return () => { window.clearTimeout(timer); window.removeEventListener('bb-db-updated', bump); };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prepared = useMemo(() => prepare(readMetricData()), [version]);
  return { prepared, version };
}
