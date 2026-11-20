/**
 * The data a download is built from, as this person can see it. Header brand choices are
 * ignored here: the download's own filters decide what goes in.
 */
import { db, type DatabaseService } from '../db/db-service';
import type { ExportSource } from './datasets';

/** Everything a workbook can be built from, read from one workspace. */
export function exportSourceFrom(store: DatabaseService): ExportSource {
  return {
    brands: store.getBrands('ALL'), products: store.getProducts('ALL'), combos: store.getCombos('ALL'),
    orders: store.getOrders('ALL'), returns: store.getReturns('ALL'), feedback: store.getFeedback('ALL'), deliveryFailures: store.getDeliveryFailures('ALL'), customers: store.getCustomers(),
    secondaryOrders: store.getSecondaryOrders({ allBrands: true }), dispatches: store.getDispatches(), stockCounts: store.getStockCounts(), visits: store.getVisits(), cheques: store.getCheques(), shelfPhotos: store.getShelfPhotos(),
    callLogs: store.getCalls(), documents: store.getDocuments(), facingAudits: store.getFacingAudits(),
    retailers: store.getRetailers(), branches: store.getBranches(), distributors: store.getDistributors(),
    tasks: store.getTasks(), influencers: store.getInfluencers(), marketingSends: store.getMarketingSends(),
  };
}

export function clientExportSource(): ExportSource {
  return exportSourceFrom(db);
}
