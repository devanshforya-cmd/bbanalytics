/**
 * The data a download is built from, as this person can see it. Header brand choices are
 * ignored here: the download's own filters decide what goes in.
 */
import { db } from '../db/db-service';
import type { ExportSource } from './datasets';

export function clientExportSource(): ExportSource {
  return {
    brands: db.getBrands('ALL'), products: db.getProducts('ALL'), combos: db.getCombos('ALL'),
    orders: db.getOrders('ALL'), returns: db.getReturns('ALL'), feedback: db.getFeedback('ALL'), deliveryFailures: db.getDeliveryFailures('ALL'), customers: db.getCustomers(),
    secondaryOrders: db.getSecondaryOrders({ allBrands: true }), dispatches: db.getDispatches(), stockCounts: db.getStockCounts(), visits: db.getVisits(), cheques: db.getCheques(),
    callLogs: db.getCalls(), documents: db.getDocuments(), facingAudits: db.getFacingAudits(),
    retailers: db.getRetailers(), branches: db.getBranches(), distributors: db.getDistributors(),
    tasks: db.getTasks(), influencers: db.getInfluencers(), marketingSends: db.getMarketingSends(),
  };
}
