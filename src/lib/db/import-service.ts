import { createHash } from 'node:crypto';
import type { DatabaseService } from './db-service';
import { validateCsvImport, ImportValidationError, type CsvImportInput } from '../import-validation';

export interface ImportWorkspace { db: DatabaseService; commit(): Promise<void> }

export async function processCsvImport(input: CsvImportInput, workspace: ImportWorkspace, action: 'preview' | 'commit') {
  if (!input || typeof input.csv !== 'string' || input.csv.length > 300000) throw new ImportValidationError('Choose a CSV file smaller than 300 KB.');
  const requestHash = createHash('sha256').update(JSON.stringify({ sourceType: input.sourceType, brandCode: input.brandCode, fileName: input.fileName, csv: input.csv })).digest('hex');
  const historyId = `imp_${input.batchId}`;
  const existing = workspace.db.getImportHistory().find((entry) => entry.id === historyId);
  if (existing) {
    if (existing.requestHash !== requestHash || existing.persistence !== 'CONFIRMED') throw new ImportValidationError('This batch ID belongs to a different import. Choose the file again.');
    if (workspace.db.getPendingMutations().some((mutation) => mutation.collection === 'importHistory' && mutation.id === historyId)) {
      if (action !== 'commit') throw new ImportValidationError('This batch has an unconfirmed save. Retry saving before starting another preview.');
      await workspace.commit();
    }
    return { record: existing, preview: [], alreadyImported: true };
  }
  const validated = validateCsvImport(input, {
    brands: workspace.db.getBrands(), products: workspace.db.getProducts(), orders: workspace.db.getOrders(), returns: workspace.db.getReturns(),
    dispatches: workspace.db.getDispatches(), distributors: workspace.db.getDistributors(), branches: workspace.db.getBranches(), customers: workspace.db.getCustomers(), orderOptions: workspace.db.getOrderOptions(),
  }, workspace.db.getCurrentUser().fullName);
  if (action === 'preview') return { preview: validated.preview, totalRows: validated.totalRows, alreadyImported: false };
  const { record } = workspace.db.importData({
    id: historyId, sourceType: validated.sourceType, fileName: validated.fileName, brandCode: validated.brandCode,
    totalRows: validated.totalRows, importedCount: validated.totalRows, skippedCount: 0, skippedRows: [], persistence: 'CONFIRMED', requestHash,
  }, { orders: validated.orders, returns: validated.returns, dispatches: validated.dispatches });
  // Existing workspace transactions atomically save rows, Customer 360 changes and history.
  await workspace.commit();
  return { record, preview: validated.preview, totalRows: validated.totalRows, alreadyImported: false };
}
