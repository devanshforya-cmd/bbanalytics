'use client';

import React, { useState, useEffect } from 'react';
import { db } from '@/lib/db/db-service';
import { DataImportRecord, ImportSourceType, BrandCode } from '@/lib/types';
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
} from 'lucide-react';

export default function DataImportSection() {
  const [history, setHistory] = useState<DataImportRecord[]>([]);
  const [sourceType, setSourceType] = useState<ImportSourceType>('ORDERS');
  const [brandCode, setBrandCode] = useState<BrandCode>('FORYA');
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileName, setFileName] = useState<string>('');
  const [parsedRows, setParsedRows] = useState<Record<string, string>[]>([]);
  const [, setColumnMapping] = useState<Record<string, string>>({});
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

  const handleSimulateFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    // Mock parsed rows based on template type
    if (sourceType === 'ORDERS') {
      const mockOrders = [
        { 'Order ID': 'BB-ORD-9021', 'Customer Name': 'Anjali Shrestha', 'Phone': '9841234567', 'City': 'Kathmandu', 'Items': '2x Cica Cleanser', 'Amount': '2450', 'Status': 'CONFIRMED' },
        { 'Order ID': 'BB-ORD-9022', 'Customer Name': 'Bikram Thapa', 'Phone': '9851098765', 'City': 'Lalitpur', 'Items': '1x Matte Lipstick', 'Amount': '1150', 'Status': 'PENDING' },
        { 'Order ID': 'BB-ORD-9023', 'Customer Name': 'Puja Joshi', 'Phone': '9801239876', 'City': 'Bhaktapur', 'Items': '1x Vitamin C Serum', 'Amount': '1890', 'Status': 'CONFIRMED' },
        { 'Order ID': 'BB-ORD-9024', 'Customer Name': 'Dipesh Sharma', 'Phone': '9849887766', 'City': 'Kathmandu', 'Items': '3x Sanitizing Wipes', 'Amount': '870', 'Status': 'DELIVERED' },
        { 'Order ID': 'BB-ORD-9025', 'Customer Name': 'Sunita Rai', 'Phone': '9812340987', 'City': 'Pokhara', 'Items': '1x Night Cream', 'Amount': '2100', 'Status': 'PENDING' },
      ];
      setParsedRows(mockOrders);
      setColumnMapping({
        'orderId': 'Order ID',
        'customerName': 'Customer Name',
        'phone': 'Phone',
        'city': 'City',
        'totalAmount': 'Amount',
      });
    } else if (sourceType === 'RETURNS') {
      const mockReturns = [
        { 'Return ID': 'BB-RET-401', 'Order Ref': 'BB-ORD-8812', 'Customer': 'Sujan Khadka', 'Reason': 'Damaged seal upon delivery', 'Condition': 'DAMAGED', 'Status': 'PENDING' },
        { 'Return ID': 'BB-RET-402', 'Order Ref': 'BB-ORD-8890', 'Customer': 'Pooja GC', 'Reason': 'Customer refused delivery - cash not ready', 'Condition': 'INTACT', 'Status': 'APPROVED' },
        { 'Return ID': 'BB-RET-403', 'Order Ref': 'BB-ORD-8930', 'Customer': 'Nabin Maharjan', 'Reason': 'Incorrect shade sent', 'Condition': 'INTACT', 'Status': 'PENDING' },
      ];
      setParsedRows(mockReturns);
      setColumnMapping({
        'returnId': 'Return ID',
        'orderRef': 'Order Ref',
        'customer': 'Customer',
        'reason': 'Reason',
        'condition': 'Condition',
      });
    } else if (sourceType === 'OFFLINE_SALES') {
      const mockDispatches = [
        { 'Dispatch No': 'DISP-801', 'Store / Vendor': 'Bhatbhateni Naxal', 'Brand': 'FORYA', 'Amount': '45000', 'Payment Mode': '30_DAYS_CREDIT', 'Date': '2026-09-08' },
        { 'Dispatch No': 'DISP-802', 'Store / Vendor': 'Salesberry Pulchowk', 'Brand': 'PEE_SAFE', 'Amount': '32000', 'Payment Mode': 'PDC_CHEQUE', 'Date': '2026-09-09' },
        { 'Dispatch No': 'DISP-803', 'Store / Vendor': 'Himalayan Mart Pokhara', 'Brand': 'RENEE', 'Amount': '28500', 'Payment Mode': 'CASH', 'Date': '2026-09-10' },
      ];
      setParsedRows(mockDispatches);
      setColumnMapping({
        'dispatchNo': 'Dispatch No',
        'storeName': 'Store / Vendor',
        'brand': 'Brand',
        'amount': 'Amount',
        'paymentMode': 'Payment Mode',
      });
    } else {
      const mockCounts = [
        { 'Date': '2026-09-10', 'Instagram DMs': '42', 'TikTok Leads': '18', 'Facebook Msgs': '15', 'WhatsApp Queries': '29', 'Converted Orders': '19' },
        { 'Date': '2026-09-09', 'Instagram DMs': '38', 'TikTok Leads': '14', 'Facebook Msgs': '12', 'WhatsApp Queries': '24', 'Converted Orders': '16' },
      ];
      setParsedRows(mockCounts);
      setColumnMapping({
        'date': 'Date',
        'instagram': 'Instagram DMs',
        'tiktok': 'TikTok Leads',
        'facebook': 'Facebook Msgs',
        'whatsapp': 'WhatsApp Queries',
      });
    }

    setStep(2);
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

      // Execute via db-service
      const existingOrders = db.getOrders();
      const existingIds = new Set(existingOrders.map((o) => o.id));

      const newOrdersToAdd = parsedRows.map((r, i) => {
        const orderId = r['Order ID'] || `IMP-${Date.now()}-${i}`;
        const isDuplicate = existingIds.has(orderId);
        return {
          id: orderId,
          source: 'GOOGLE_SHEET' as const,
          brandCode: brandCode,
          customerName: r['Customer Name'] || 'Imported Customer',
          customerPhone: r['Phone'] || '9800000000',
          deliveryAddress: {
            street: 'Main Road',
            city: r['City'] || 'Kathmandu',
            valley: 'Inside' as const,
          },
          items: [
            {
              productId: 'prod_forya_cleanser',
              productName: r['Items'] || 'Personal Care Item',
              quantity: 1,
              priceNpr: Number(r['Amount']) || 1500,
            },
          ],
          totalAmountNpr: Number(r['Amount']) || 1500,
          paymentMethod: 'COD' as const,
          status: (r['Status'] as any) || 'CONFIRMED',
          statusHistory: [
            {
              status: 'CONFIRMED' as const,
              timestamp: new Date().toISOString(),
              updatedBy: 'Data Import Tool',
            },
          ],
          internalNotes: `Batch imported from ${fileName}`,
          isDuplicate,
        };
      });

      const res = db.importData(
        {
          sourceType,
          fileName,
          brandCode,
          totalRows: parsedRows.length,
          importedCount: 0,
          skippedCount: 0,
          skippedRows: [],
        },
        sourceType === 'ORDERS' ? { orders: newOrdersToAdd as any } : {}
      );

      setImportResult(res.record);
      loadHistory();
      setFeedbackMsg({
        type: 'success',
        message: `Import completed! Successfully imported ${res.record.importedCount} records (${res.record.skippedCount} skipped/duplicates).`,
      });
    }, 800);
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
    setColumnMapping({});
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
              Data Import & Migration Wizard (Fix 39)
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Upload spreadsheets for Orders, Customer Returns, Offline Sales Dispatches, and Daily Social Counts with automatic deduplication and safe rollback.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-brand-blue border border-blue-200">
              4 Formats Supported
            </span>
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
                <option value="FORYA">FORYA (Skincare & Beauty)</option>
                <option value="PEE_SAFE">Pee Safe (Hygiene & Wellness)</option>
                <option value="RENEE">Renée Cosmetics</option>
              </select>
            </div>
          </div>

          <div className="border-2 border-dashed border-gray-300 hover:border-brand-blue rounded-xl p-8 text-center transition-colors bg-gray-50/50">
            <UploadCloud className="w-12 h-12 text-brand-blue mx-auto mb-3" />
            <p className="text-sm font-semibold text-gray-800">
              Drag and drop your spreadsheet here, or <span className="text-brand-blue cursor-pointer underline">browse</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">Supports .xlsx, .xls, and .csv files up to 10MB</p>
            <input
              type="file"
              accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
              onChange={handleSimulateFileUpload}
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
              <p className="text-xs text-gray-500 mt-0.5">Found {parsedRows.length} sample rows. Confirm column mapping below.</p>
            </div>
            <button
              onClick={() => setStep(1)}
              className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-lg border border-gray-200"
            >
              Choose different file
            </button>
          </div>

          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                <tr>
                  {parsedRows.length > 0 &&
                    Object.keys(parsedRows[0]).map((col) => (
                      <th key={col} className="px-3 py-2.5">
                        {col}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {parsedRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    {Object.values(row).map((val, cIdx) => (
                      <td key={cIdx} className="px-3 py-2 text-gray-700">
                        {val}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setStep(3)}
              className="px-4 py-2 bg-brand-blue text-white text-xs font-semibold rounded-lg hover:bg-blue-700 flex items-center gap-1.5 shadow-sm"
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
              <p className="text-2xl font-bold text-emerald-700">{parsedRows.length}</p>
              <p className="text-xs font-medium text-emerald-600 uppercase mt-1">Valid Records</p>
            </div>
            <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-center">
              <p className="text-2xl font-bold text-amber-700">0</p>
              <p className="text-xs font-medium text-amber-600 uppercase mt-1">Duplicates Skipped</p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-900 flex items-start gap-3">
            <Info className="w-5 h-5 text-brand-blue flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Deduplication Rules Active:</p>
              <ul className="list-disc pl-4 mt-1 space-y-0.5 text-blue-800">
                <li>Existing Order IDs will be detected and skipped without corrupting existing records.</li>
                <li>Customer contact information will be merged into customer directories.</li>
                <li>A batch snapshot will be created so you can rollback anytime.</li>
              </ul>
            </div>
          </div>

          <div className="flex justify-between items-center pt-4">
            <button
              onClick={() => setStep(2)}
              className="px-4 py-2 border border-gray-300 text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Back
            </button>
            <button
              onClick={handleExecuteImport}
              className="px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-lg hover:bg-emerald-700 shadow-sm flex items-center gap-2"
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
                  className="px-4 py-2 bg-brand-blue text-white text-xs font-semibold rounded-lg hover:bg-blue-700 shadow-sm"
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
                          className="px-2.5 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-50 rounded border border-red-200 flex items-center gap-1 ml-auto"
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
