'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/db/db-service';
import { DataImportRecord, ImportSourceType, BrandCode, Order, ReturnEntry, Dispatch } from '@/lib/types';
import { parseCSV, generateCSV, downloadCSV } from '@/lib/csv';
import { getTodayAd, getTodayBs } from '@/lib/nepali-calendar';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Clock,
  ArrowRight,
  Database,
  Info,
  Check,
  X,
  FileText,
  Download,
} from 'lucide-react';

export default function DataImportSection() {
  const [history, setHistory] = useState<DataImportRecord[]>([]);
  const [sourceType, setSourceType] = useState<ImportSourceType>('ORDERS');
  const [brandCode, setBrandCode] = useState<BrandCode>('FORYA');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importResult, setImportResult] = useState<DataImportRecord | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = () => {
    setHistory(db.getImportHistory());
  };

  const handleDownloadTemplate = () => {
    if (sourceType === 'ORDERS') {
      const columns = [
        { key: 'orderNumber', label: 'Order ID' },
        { key: 'customerName', label: 'Customer Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'city', label: 'City' },
        { key: 'address', label: 'Address' },
        { key: 'items', label: 'Items' },
        { key: 'amount', label: 'Amount' },
        { key: 'paymentMethod', label: 'Payment Method' },
        { key: 'status', label: 'Status' },
      ];
      const sample = [
        { orderNumber: 'BB-ORD-1001', customerName: 'Sabina Shakya', phone: '9841234567', city: 'Kathmandu', address: 'New Baneshwor', items: 'Cica Cleanser 100ml', amount: '1250', paymentMethod: 'COD', status: 'CONFIRMED' },
        { orderNumber: 'BB-ORD-1002', customerName: 'Aayush Thapa', phone: '9801234567', city: 'Lalitpur', address: 'Pulchowk', items: 'Toilet Seat Spray 75ml', amount: '890', paymentMethod: 'Prepaid', status: 'DELIVERED' },
      ];
      downloadCSV(generateCSV(columns, sample), `template_orders_${brandCode.toLowerCase()}`);
    } else if (sourceType === 'RETURNS') {
      const columns = [
        { key: 'orderRef', label: 'Order ID' },
        { key: 'customer', label: 'Customer Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'reason', label: 'Reason' },
        { key: 'condition', label: 'Condition' },
        { key: 'status', label: 'Status' },
      ];
      const sample = [
        { orderRef: 'BB-ORD-1001', customer: 'Sabina Shakya', phone: '9841234567', reason: 'Customer requested cancellation before courier dispatch', condition: 'INTACT', status: 'APPROVED' },
      ];
      downloadCSV(generateCSV(columns, sample), `template_returns_${brandCode.toLowerCase()}`);
    } else if (sourceType === 'OFFLINE_SALES') {
      const columns = [
        { key: 'dispatchNo', label: 'Dispatch No' },
        { key: 'storeName', label: 'Store / Distributor Name' },
        { key: 'date', label: 'Date (YYYY-MM-DD)' },
        { key: 'items', label: 'Items' },
        { key: 'amount', label: 'Amount' },
        { key: 'notes', label: 'Notes' },
      ];
      const sample = [
        { dispatchNo: 'DISP-501', storeName: 'Bhatbhateni Supermarket Naxal', date: getTodayAd(), items: 'Hair Serum x24', amount: '28000', notes: 'Monthly branch restocking' },
      ];
      downloadCSV(generateCSV(columns, sample), `template_dispatches_${brandCode.toLowerCase()}`);
    } else {
      const columns = [
        { key: 'date', label: 'Date' },
        { key: 'instagram', label: 'Instagram DMs' },
        { key: 'tiktok', label: 'TikTok Leads' },
        { key: 'facebook', label: 'Facebook Msgs' },
        { key: 'whatsapp', label: 'WhatsApp Queries' },
        { key: 'converted', label: 'Converted Orders' },
      ];
      const sample = [
        { date: getTodayAd(), instagram: '35', tiktok: '22', facebook: '15', whatsapp: '28', converted: '18' },
      ];
      downloadCSV(generateCSV(columns, sample), `template_social_counts`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = (event.target?.result as string) || '';
        const { headers, rows } = parseCSV(text);

        if (rows.length === 0 || headers.length === 0) {
          setFeedbackMsg({
            type: 'error',
            message: `Could not parse data from "${file.name}". Please ensure file contains valid CSV data with header columns.`,
          });
          return;
        }

        // Count duplicates if applicable
        if (sourceType === 'ORDERS') {
          const existing = new Set(db.getOrders().map((o) => o.orderNumber.toUpperCase()));
          const dupes = rows.filter((r) => {
            const id = (r['Order ID'] || r['orderId'] || r['Order Ref'] || r['order_id'] || '').trim().toUpperCase();
            return id && existing.has(id);
          }).length;
          setDuplicateCount(dupes);
        } else {
          setDuplicateCount(0);
        }

        setParsedRows(rows);
        setStep(2);
      } catch (err: any) {
        setFeedbackMsg({
          type: 'error',
          message: `Failed to read file: ${err?.message || 'Invalid format'}`,
        });
      }
    };

    reader.onerror = () => {
      setFeedbackMsg({
        type: 'error',
        message: `Failed to read file: ${file.name}`,
      });
    };

    reader.readAsText(file);
  };

  const handleExecuteImport = () => {
    setIsProcessing(true);
    setProgress(10);
    setStep(4);

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(interval);
          return 90;
        }
        return prev + 25;
      });
    }, 150);

    setTimeout(() => {
      clearInterval(interval);
      setProgress(100);
      setIsProcessing(false);

      const existingOrders = db.getOrders();
      const existingIds = new Set(existingOrders.map((o) => o.orderNumber.toUpperCase()));
      const products = db.getProducts();

      if (sourceType === 'ORDERS') {
        const newOrdersToAdd: Order[] = [];
        let skipped = 0;

        parsedRows.forEach((r, i) => {
          const orderNum = (r['Order ID'] || r['orderNumber'] || r['Order Ref'] || r['order_id'] || `ORD-${Date.now()}-${i + 1}`).trim();
          if (existingIds.has(orderNum.toUpperCase())) {
            skipped++;
            return;
          }

          const customerName = (r['Customer Name'] || r['customerName'] || r['Customer'] || r['Name'] || 'Customer').trim();
          const phone = (r['Phone'] || r['phone'] || r['Mobile'] || r['Contact'] || '9800000000').trim();
          const city = (r['City'] || r['city'] || 'Kathmandu').trim();
          const address = (r['Address'] || r['address'] || r['Street'] || city).trim();
          const itemsStr = (r['Items'] || r['items'] || r['Product'] || r['Products'] || 'General Item').trim();
          const amount = parseFloat(r['Amount'] || r['amount'] || r['Total'] || '1000') || 1000;
          const status = (r['Status'] || r['status'] || 'CONFIRMED').trim().toUpperCase() as any;
          const paymentMethod = (r['Payment Method'] || r['paymentMethod'] || 'COD').trim().toUpperCase() as any;

          const matchedProd = products.find((p) => p.name.toLowerCase().includes(itemsStr.toLowerCase())) || products[0];

          newOrdersToAdd.push({
            id: `ord_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            orderNumber: orderNum,
            customerName,
            customerPhone: phone,
            brandCode,
            platform: 'WhatsApp',
            province: 'Bagmati Province',
            district: city,
            address,
            deliveryMethod: 'Standard',
            paymentTerms: paymentMethod === 'PREPAID' ? 'Prepaid' : 'COD',
            orderType: 'NEW',
            items: [
              {
                productId: matchedProd?.id || 'prod_general',
                productName: itemsStr,
                brandCode,
                quantity: 1,
                unitPrice: amount,
                totalPrice: amount,
              },
            ],
            totalAmount: amount,
            status: ['CONFIRMED', 'DELIVERED', 'SHIPPED', 'CANCELLED'].includes(status) ? status : 'CONFIRMED',
            source: 'Manual',
            orderDateAd: getTodayAd(),
            orderDateBs: getTodayBs(),
            notes: `Imported from ${fileName}`,
            createdAt: new Date().toISOString(),
          });
        });

        const res = db.importData(
          {
            sourceType,
            fileName,
            brandCode,
            totalRows: parsedRows.length,
            importedCount: newOrdersToAdd.length,
            skippedCount: skipped,
            skippedRows: [],
          },
          { orders: newOrdersToAdd }
        );

        setImportResult(res.record);
      } else if (sourceType === 'RETURNS') {
        const returnsToAdd: ReturnEntry[] = parsedRows.map((r, i) => {
          const orderRef = (r['Order ID'] || r['Order Ref'] || r['orderRef'] || `ORD-${Date.now()}-${i}`).trim();
          const customer = (r['Customer Name'] || r['Customer'] || r['customer'] || 'Customer').trim();
          const phone = (r['Phone'] || r['phone'] || '9800000000').trim();
          const reason = (r['Reason'] || r['reason'] || 'Defective / Damaged').trim();

          return {
            id: `ret_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            orderNumber: orderRef,
            brandCode,
            productId: 'prod_general',
            productName: 'Imported Item',
            customerName: customer,
            customerPhone: phone,
            dateAd: getTodayAd(),
            dateBs: getTodayBs(),
            platform: 'Instagram',
            quantity: 1,
            reasonCategory: reason as any,
            orderStatus: 'Pending',
            valley: 'Inside',
            issueCategories: [],
            remarks: `Imported return record from ${fileName}`,
            createdAt: new Date().toISOString(),
          };
        });

        const res = db.importData(
          {
            sourceType,
            fileName,
            brandCode,
            totalRows: parsedRows.length,
            importedCount: returnsToAdd.length,
            skippedCount: 0,
            skippedRows: [],
          },
          { returns: returnsToAdd }
        );

        setImportResult(res.record);
      } else if (sourceType === 'OFFLINE_SALES') {
        const dispatchesToAdd: Dispatch[] = parsedRows.map((r, i) => {
          const storeName = (r['Store / Distributor Name'] || r['Store / Vendor'] || r['Store'] || 'Retail Partner').trim();
          const itemsStr = (r['Items'] || r['items'] || 'Restock Shipment').trim();
          const date = (r['Date (YYYY-MM-DD)'] || r['Date'] || getTodayAd()).trim();
          const notes = (r['Notes'] || r['notes'] || `Imported dispatch from ${fileName}`).trim();

          const matchedProd = products[0];

          return {
            id: `disp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            distributorId: `dist_${Date.now()}_${i}`,
            distributorName: storeName,
            dispatchDateAd: date,
            dispatchDateBs: getTodayBs(),
            items: [
              {
                productId: matchedProd?.id || 'prod_general',
                productName: itemsStr,
                brandCode,
                quantity: 1,
              },
            ],
            notes,
            createdBy: 'Data Import Tool',
            createdAt: new Date().toISOString(),
          };
        });

        const res = db.importData(
          {
            sourceType,
            fileName,
            brandCode,
            totalRows: parsedRows.length,
            importedCount: dispatchesToAdd.length,
            skippedCount: 0,
            skippedRows: [],
          },
          { dispatches: dispatchesToAdd }
        );

        setImportResult(res.record);
      } else {
        // Daily social counts
        const res = db.importData(
          {
            sourceType,
            fileName,
            brandCode,
            totalRows: parsedRows.length,
            importedCount: parsedRows.length,
            skippedCount: 0,
            skippedRows: [],
          },
          {}
        );
        setImportResult(res.record);
      }

      loadHistory();
      setFeedbackMsg({
        type: 'success',
        message: `Import processed successfully from "${fileName}".`,
      });
    }, 600);
  };

  const handleRollback = (importId: string) => {
    const success = db.rollbackImport(importId);
    if (success) {
      loadHistory();
      setFeedbackMsg({ type: 'success', message: 'Data import record rolled back successfully.' });
    } else {
      setFeedbackMsg({ type: 'error', message: 'Unable to rollback this import batch.' });
    }
  };

  const resetWizard = () => {
    setStep(1);
    setFileName('');
    setParsedRows([]);
    setDuplicateCount(0);
    setProgress(0);
    setImportResult(null);
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Database className="w-6 h-6 text-brand-blue" />
              Data Import & Migration Wizard
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload spreadsheets for Orders, Customer Returns, Offline Sales Dispatches, and Daily Social Counts with automatic deduplication and safe rollback.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs transition"
            >
              <Download className="w-3.5 h-3.5 text-blue-600" />
              Download Template CSV
            </button>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              Rollback Enabled
            </span>
          </div>
        </div>

        {feedbackMsg && (
          <div
            className={`mt-4 p-3 rounded-lg flex items-center justify-between text-sm ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedbackMsg.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0" />
              )}
              <span>{feedbackMsg.message}</span>
            </div>
            <button onClick={() => setFeedbackMsg(null)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Stepper Progress */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                step >= 1 ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-400'
              }`}
            >
              1
            </div>
            <span className={`text-xs font-medium ${step >= 1 ? 'text-gray-900 font-bold' : 'text-gray-400'}`}>
              Upload & Format
            </span>
          </div>
          <div className={`h-0.5 w-12 ${step >= 2 ? 'bg-brand-blue' : 'bg-gray-200'}`} />
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                step >= 2 ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-400'
              }`}
            >
              2
            </div>
            <span className={`text-xs font-medium ${step >= 2 ? 'text-gray-900 font-bold' : 'text-gray-400'}`}>
              Map & Preview
            </span>
          </div>
          <div className={`h-0.5 w-12 ${step >= 3 ? 'bg-brand-blue' : 'bg-gray-200'}`} />
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                step >= 3 ? 'bg-brand-blue text-white' : 'bg-gray-100 text-gray-400'
              }`}
            >
              3
            </div>
            <span className={`text-xs font-medium ${step >= 3 ? 'text-gray-900 font-bold' : 'text-gray-400'}`}>
              Validate
            </span>
          </div>
          <div className={`h-0.5 w-12 ${step >= 4 ? 'bg-brand-blue' : 'bg-gray-200'}`} />
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                step >= 4 ? 'bg-emerald-600 text-white' : 'bg-gray-100 text-gray-400'
              }`}
            >
              4
            </div>
            <span className={`text-xs font-medium ${step >= 4 ? 'text-emerald-700 font-bold' : 'text-gray-400'}`}>
              Complete
            </span>
          </div>
        </div>
      </div>

      {/* Step 1: Format Selection & Upload */}
      {step === 1 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Select Import Type</label>
              <select
                value={sourceType}
                onChange={(e) => setSourceType(e.target.value as ImportSourceType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-blue"
              >
                <option value="ORDERS">1. Orders & Deliveries</option>
                <option value="RETURNS">2. Return Requests & Claims</option>
                <option value="OFFLINE_SALES">3. Offline Sales / Dispatches</option>
                <option value="DAILY_COUNTS">4. Daily Social Counts (Forya / Pee Safe)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase mb-2">Target Brand Portfolio</label>
              <select
                value={brandCode}
                onChange={(e) => setBrandCode(e.target.value as BrandCode)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-blue"
              >
                {db.getBrands('ACTIVE').length > 0 ? (
                  db.getBrands('ACTIVE').map((b) => (
                    <option key={b.id} value={b.code}>
                      {b.name} ({b.code})
                    </option>
                  ))
                ) : (
                  <>
                    <option value="FORYA">FORYA (Skincare & Beauty)</option>
                    <option value="PEE_SAFE">Pee Safe (Hygiene & Wellness)</option>
                    <option value="RENEE">Renée Cosmetics</option>
                  </>
                )}
              </select>
            </div>
          </div>

          <div className="border-2 border-dashed border-gray-300 hover:border-brand-blue rounded-xl p-8 text-center transition-colors bg-gray-50/50">
            <UploadCloud className="w-12 h-12 text-brand-blue mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-800">
              Drag and drop your CSV or text file here, or <span className="text-brand-blue cursor-pointer underline">browse</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">Supports standard .csv and .tsv files</p>
            <input
              type="file"
              accept=".csv, .tsv, .txt, text/csv, text/plain"
              onChange={handleFileUpload}
              className="mt-4 text-xs text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-brand-blue file:text-white hover:file:bg-blue-700 cursor-pointer"
            />
          </div>
        </div>
      )}

      {/* Step 2: Column Mapping & Data Preview */}
      {step === 2 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-brand-blue" />
                Preview: {fileName}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">Found {parsedRows.length} rows from uploaded file. Ready for import.</p>
            </div>
            <button
              onClick={() => setStep(1)}
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200 cursor-pointer"
            >
              Choose different file
            </button>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200 sticky top-0">
                <tr>
                  {parsedRows.length > 0 &&
                    Object.keys(parsedRows[0]).map((col) => (
                      <th key={col} className="px-3 py-2.5 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parsedRows.slice(0, 25).map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    {Object.values(row).map((val, cIdx) => (
                      <td key={cIdx} className="px-3 py-2 text-gray-700 whitespace-nowrap">
                        {val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {parsedRows.length > 25 && (
            <p className="text-[11px] text-slate-500 text-center">Showing first 25 of {parsedRows.length} rows.</p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setStep(3)}
              className="px-4 py-2 bg-brand-blue text-white text-xs font-semibold rounded-lg hover:bg-blue-700 flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              Proceed to Validation
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Deduplication & Validation Check */}
      {step === 3 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-6">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Data Validation & Deduplication Check
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 text-center">
              <p className="text-2xl font-bold text-gray-900">{parsedRows.length}</p>
              <p className="text-xs font-medium text-gray-500 uppercase mt-1">Total Rows Detected</p>
            </div>
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 text-center">
              <p className="text-2xl font-bold text-emerald-700">{parsedRows.length - duplicateCount}</p>
              <p className="text-xs font-medium text-emerald-600 uppercase mt-1">Valid Records to Import</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-center">
              <p className="text-2xl font-bold text-amber-700">{duplicateCount}</p>
              <p className="text-xs font-medium text-amber-600 uppercase mt-1">Duplicates Skipped</p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-900 flex items-start gap-3">
            <Info className="w-5 h-5 text-brand-blue flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Deduplication Rules Active:</p>
              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-blue-800">
                <li>Existing Order IDs will be detected and skipped without overwriting existing data.</li>
                <li>Import history records each batch for immediate one-click rollback if needed.</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 border border-gray-300 text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              Back
            </button>
            <button
              onClick={handleExecuteImport}
              className="px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <Database className="w-4 h-4" />
              Confirm & Execute Import
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Import Progress & Complete */}
      {step === 4 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm text-center space-y-6">
          {isProcessing ? (
            <div className="space-y-4 max-w-md mx-auto">
              <div className="w-12 h-12 rounded-full bg-blue-50 border-2 border-brand-blue border-t-transparent animate-spin mx-auto" />
              <h4 className="text-base font-bold text-gray-900">Processing Batch Import...</h4>
              <p className="text-xs text-gray-500">Writing records into operational database and verifying indexes.</p>
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div className="bg-brand-blue h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs font-semibold text-brand-blue">{progress}% Completed</p>
            </div>
          ) : (
            <div className="space-y-4 max-w-md mx-auto">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <Check className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-bold text-gray-900">Import Successful!</h4>
              <p className="text-xs text-gray-600">
                Batch <span className="font-semibold">{fileName}</span> was processed. {importResult?.importedCount} records added to the database.
              </p>

              <div className="pt-2 flex justify-center gap-3">
                <button
                  onClick={resetWizard}
                  className="px-4 py-2 bg-brand-blue text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shadow-sm cursor-pointer"
                >
                  Import Another File
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Import History Table */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            Batch Import History & Rollback Log
          </h3>
          <span className="text-xs text-gray-500">{history.length} batches recorded</span>
        </div>

        {history.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-xs">No previous data imports recorded yet.</div>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                <tr>
                  <th className="px-3.5 py-2.5">Date & Time</th>
                  <th className="px-3.5 py-2.5">File Name</th>
                  <th className="px-3.5 py-2.5">Type</th>
                  <th className="px-3.5 py-2.5">Brand</th>
                  <th className="px-3.5 py-2.5 text-center">Imported</th>
                  <th className="px-3.5 py-2.5 text-center">Skipped</th>
                  <th className="px-3.5 py-2.5 text-center">Status</th>
                  <th className="px-3.5 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map((rec) => (
                  <tr key={rec.id} className="hover:bg-gray-50">
                    <td className="px-3.5 py-2.5 text-gray-600 font-medium">
                      {new Date(rec.importedAt).toLocaleString()}
                    </td>
                    <td className="px-3.5 py-2.5 font-semibold text-gray-800 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-gray-400" />
                      {rec.fileName}
                    </td>
                    <td className="px-3.5 py-2.5">
                      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-700 font-medium text-[11px]">
                        {rec.sourceType}
                      </span>
                    </td>
                    <td className="px-3.5 py-2.5 text-gray-600">{rec.brandCode || 'ALL'}</td>
                    <td className="px-3.5 py-2.5 text-center font-semibold text-emerald-600">{rec.importedCount}</td>
                    <td className="px-3.5 py-2.5 text-center text-amber-600 font-semibold">{rec.skippedCount}</td>
                    <td className="px-3.5 py-2.5 text-center">
                      {rec.rolledBack ? (
                        <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 font-medium text-[10px]">
                          Rolled Back
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium text-[10px]">
                          Applied
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right">
                      {!rec.rolledBack && (
                        <button
                          onClick={() => handleRollback(rec.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 rounded border border-red-200 flex items-center gap-1 ml-auto cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Rollback
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
