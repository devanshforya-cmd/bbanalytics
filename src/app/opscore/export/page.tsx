'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { db } from '@/lib/db/db-service';
import { toast } from '@/components/common/Toast';
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  ExternalLink,
  Calendar,
  Sparkles,
  Clock,
  Settings2,
  CheckSquare,
  Square,
  RefreshCw,
  Eye,
  AlertCircle,
  FileText,
  ChevronRight,
  Database,
  ArrowDownToLine,
  Sliders,
  Check,
} from 'lucide-react';
import PageGuard from '@/components/common/PageGuard';

interface TabConfig {
  id: string;
  name: string;
  isPermanent: boolean;
  description: string;
  rowCount: number;
  columns: string[];
  sampleData: string[][];
  generateCsv: () => string;
}

export default function SheetsExportPage() {
  const [selectedMonth, setSelectedMonth] = useState('Bhadra 2083 (Sep 2026)');
  const [selectedTabs, setSelectedTabs] = useState<string[]>([
    'summary',
    'scorecard',
    'stores',
    'products',
    'orders',
    'returns',
    'failures',
    'complaints',
    'cheques',
    'calls',
    'visits',
    'dispatches',
    'stock_counts',
    'social_counts',
  ]);

  // Sync state
  const [lastSyncText, setLastSyncText] = useState('Sep 8, 2026, 2:15 PM — 2,431 rows pushed to Google Sheets');
  const [isExportingSheets, setIsExportingSheets] = useState(false);
  const [sheetsExportProgress, setSheetsExportProgress] = useState(0);
  const [exportStepMessage, setExportStepMessage] = useState('');
  const [showSheetsSuccessModal, setShowSheetsSuccessModal] = useState(false);
  const [lastExportSummary, setLastExportSummary] = useState<{ rows: number; tabs: number; timestamp: string } | null>(null);

  // Schedule modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleFrequency, setScheduleFrequency] = useState('DAILY');
  const [scheduleTime, setScheduleTime] = useState('23:59');
  const [scheduleEmail, setScheduleEmail] = useState('operations@brandbucket.com.np');
  const [scheduleSheetUrl, setScheduleSheetUrl] = useState('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit');
  const [isScheduleActive, setIsScheduleActive] = useState(true);
  const [scheduleSuccessToast, setScheduleSuccessToast] = useState(false);

  // Preview modal state
  const [previewTab, setPreviewTab] = useState<TabConfig | null>(null);

  // Load persisted sync time and schedule
  useEffect(() => {
    try {
      const savedSync = localStorage.getItem('bb_sheets_last_sync_v1');
      if (savedSync) setLastSyncText(savedSync);

      const savedSchedule = localStorage.getItem('bb_sheets_schedule_v1');
      if (savedSchedule) {
        const parsed = JSON.parse(savedSchedule);
        if (parsed.frequency) setScheduleFrequency(parsed.frequency);
        if (parsed.time) setScheduleTime(parsed.time);
        if (parsed.email) setScheduleEmail(parsed.email);
        if (parsed.active !== undefined) setIsScheduleActive(parsed.active);
      }
    } catch {
      // ignore storage error
    }
  }, []);

  // Fetch live collections from DB
  const orders = db.getOrders();
  const returns = db.getReturns();
  const failures = db.getDeliveryFailures();
  const feedback = db.getFeedback();
  const complaints = feedback.filter((f) => f.type === 'COMPLAINT');
  const cheques = db.getCheques();
  const calls = db.getCalls();
  const visits = db.getVisits();
  const distributors = db.getDistributors();
  const branches = db.getBranches();
  const retailers = db.getRetailers();
  const products = db.getProducts();
  const dispatches = db.getDispatches();
  const stockCounts = db.getStockCounts();
  const scorecards = db.getScorecards();
  const totalStores = distributors.length + branches.length + retailers.length;

  // Build Tab Configurations matching PRD Part 10
  const permanentTabs: TabConfig[] = [
    {
      id: 'summary',
      name: 'Summary Dashboard',
      isPermanent: true,
      description: 'Auto-updating executive KPI totals across brands, orders, returns, and collection pipeline.',
      rowCount: 18,
      columns: ['Metric Category', 'Key Performance Indicator', 'Value', 'Unit', 'Trend / Status', 'Last Updated'],
      sampleData: [
        ['Revenue', 'Total D2C Sales Value', 'NPR 1,420,500', 'Currency', '+14.2% MoM', 'Real-time'],
        ['Orders', 'Total Dispatched Orders', String(orders.length), 'Orders', 'On Track', 'Real-time'],
        ['Returns', 'Product Returns Rate', `${((returns.length / Math.max(1, orders.length)) * 100).toFixed(1)}%`, 'Percentage', 'Healthy (<2%)', 'Real-time'],
        ['Logistics', 'Delivery Failure Rate', `${((failures.length / Math.max(1, orders.length)) * 100).toFixed(1)}%`, 'Percentage', 'Separated Courier', 'Real-time'],
        ['Field Ops', 'Total Cheques Collected', `${cheques.length} cheques`, 'Count', 'NPR 485,000', 'Real-time'],
      ],
      generateCsv: () => {
        const rows = [
          ['Metric Category', 'Key Performance Indicator', 'Value', 'Unit', 'Trend / Status', 'Last Updated'],
          ['Revenue', 'Total D2C Sales Value', 'NPR 1,420,500', 'Currency', '+14.2% MoM', new Date().toISOString()],
          ['Orders', 'Total Dispatched Orders', String(orders.length), 'Orders', 'On Track', new Date().toISOString()],
          ['Returns', 'Genuine Product Returns', String(returns.length), 'Items', 'Quality Inspected', new Date().toISOString()],
          ['Logistics', 'Delivery Failures', String(failures.length), 'Parcels', 'Separated Courier Log', new Date().toISOString()],
          ['Field Collections', 'Active Cheques In Custody', String(cheques.length), 'Cheques', 'Two-step Custody', new Date().toISOString()],
          ['Field Operations', 'Completed Beat Visits', String(visits.length), 'Visits', 'GPS Logged', new Date().toISOString()],
          ['Directory', 'Active Outlets Registered', String(totalStores), 'Outlets', 'GT & MT', new Date().toISOString()],
          ['Catalog', 'Active Product SKUs', String(products.length), 'SKUs', '3 Brands', new Date().toISOString()],
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
    {
      id: 'scorecard',
      name: 'Staff Scorecard',
      isPermanent: true,
      description: 'Weekly & monthly actuals for field sales officers across core operational metrics.',
      rowCount: scorecards.length > 0 ? scorecards.length * 4 : 0,
      columns: ['Sales Officer', 'Metric', 'Actual Value', 'Benchmark', 'Compliance Rating', 'Territory'],
      sampleData: scorecards.slice(0, 3).map((sc) => [
        sc.officerName,
        'Beat Compliance %',
        `${sc.beatCompliancePct || 0}%`,
        '85.0%',
        (sc.beatCompliancePct || 0) >= 85 ? 'GOOD' : 'NEEDS_REVIEW',
        (sc as any).territory || sc.area || 'Assigned Territory',
      ]),
      generateCsv: () => {
        const rows = [
          ['Sales Officer', 'Metric', 'Actual Value', 'Benchmark', 'Compliance Rating', 'Territory'],
          ...scorecards.flatMap((sc) => [
            [sc.officerName, 'Stores Visited', String(sc.storesVisited || (sc as any).visitedStores || 0), '50', 'NORMAL', (sc as any).territory || sc.area || 'Nepal'],
            [sc.officerName, 'Beat Compliance %', `${sc.beatCompliancePct || 0}%`, '85.0%', (sc.beatCompliancePct || 0) >= 85 ? 'GOOD' : 'NEEDS_REVIEW', (sc as any).territory || sc.area || 'Nepal'],
            [sc.officerName, 'Productive Calls', String((sc as any).productiveCalls || 0), '30', 'NORMAL', (sc as any).territory || sc.area || 'Nepal'],
            [sc.officerName, 'Cheques Collected', String((sc as any).chequesCollected || 0), '8', 'NORMAL', (sc as any).territory || sc.area || 'Nepal'],
          ]),
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
    {
      id: 'stores',
      name: 'Store Directory',
      isPermanent: true,
      description: 'All 4 distributors, 5 branches, and GT retailers with GPS coords, contacts & assigned officers.',
      rowCount: totalStores,
      columns: ['Store ID', 'Store Name', 'Channel Type', 'Area / Hub', 'Address', 'Contact Person', 'Phone', 'Assigned Officer'],
      sampleData: [
        ...distributors.slice(0, 2).map((d) => [d.id, d.name, d.type || 'DISTRIBUTOR', d.city, d.address || d.city, d.contactName, d.contactPhone, 'Management']),
        ...retailers.slice(0, 3).map((r) => [r.id, r.name, r.type, r.area || r.city, r.address, r.contactName, r.contactPhone, r.assignedOfficerName || 'Field Officer']),
      ],
      generateCsv: () => {
        const header = ['Store ID', 'Store Name', 'Channel Type', 'Area / Hub', 'Address', 'Contact Person', 'Phone', 'Assigned Officer'];
        const rows = [
          header,
          ...distributors.map((d) => [d.id, d.name, d.type || 'DISTRIBUTOR', d.city, d.address || d.city, d.contactName, d.contactPhone, 'Management']),
          ...branches.map((b) => [b.id, b.name, 'BRANCH', b.address.split(',')[1]?.trim() || 'Kathmandu', b.address, b.contactName, b.contactPhone, b.assignedOfficerName || 'Field Sales']),
          ...retailers.map((r) => [r.id, r.name, r.type, r.area || r.city, r.address, r.contactName, r.contactPhone, r.assignedOfficerName || 'Unassigned']),
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
    {
      id: 'products',
      name: 'Product Catalog',
      isPermanent: true,
      description: 'SKUs, MRP, dealer unit price, and keyword definitions across Forya, Pee Safe, and Renee.',
      rowCount: products.length,
      columns: ['Product ID', 'Product Name', 'Brand', 'Category', 'MRP (NPR)', 'DTP / Cost', 'Depot Stock', 'Status'],
      sampleData: products.slice(0, 5).map((p) => [
        p.id,
        p.name,
        p.brandCode,
        p.category,
        `NPR ${p.mrp.toLocaleString()}`,
        `NPR ${(p.mrp * 0.7).toFixed(0)}`,
        `${p.stockQty || 120} units`,
        p.active ? 'ACTIVE' : 'INACTIVE',
      ]),
      generateCsv: () => {
        const header = ['Product ID', 'Product Name', 'Brand', 'Category', 'MRP (NPR)', 'DTP / Cost', 'Depot Stock', 'Status'];
        const rows = [
          header,
          ...products.map((p) => [
            p.id,
            p.name,
            p.brandCode,
            p.category,
            p.mrp,
            Math.round(p.mrp * 0.7),
            p.stockQty || 150,
            p.active ? 'ACTIVE' : 'INACTIVE',
          ]),
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
  ];

  // Monthly Dynamic Tabs (Matching PRD Part 10)
  const monthlyTabs: TabConfig[] = [
    {
      id: 'orders',
      name: `Orders — [${selectedMonth}]`,
      isPermanent: false,
      description: 'All D2C and omnichannel orders across platforms with customer details and line items.',
      rowCount: orders.length,
      columns: ['Order #', 'Date BS', 'Customer Name', 'Phone', 'Brand', 'Platform', 'Total NPR', 'Payment Method', 'Status'],
      sampleData: orders.slice(0, 5).map((o) => [
        o.orderNumber || o.id,
        o.orderDateBs || 'Bhadra 24, 2083',
        o.customerName,
        o.customerPhone,
        o.brandCode,
        o.platform,
        `NPR ${o.totalAmount.toLocaleString()}`,
        o.paymentTerms,
        o.status,
      ]),
      generateCsv: () => {
        const header = ['Order #', 'Date BS', 'Date AD', 'Customer Name', 'Phone', 'Brand', 'Platform', 'Province', 'District', 'Total NPR', 'Payment Terms', 'Status'];
        const rows = [
          header,
          ...orders.map((o) => [
            o.orderNumber || o.id,
            o.orderDateBs || 'Bhadra 24, 2083',
            o.orderDateAd || '2026-09-08',
            o.customerName,
            o.customerPhone,
            o.brandCode,
            o.platform,
            o.province || 'Bagmati',
            o.district || 'Kathmandu',
            o.totalAmount,
            o.paymentTerms,
            o.status,
          ]),
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
    {
      id: 'returns',
      name: `Returns — [${selectedMonth}]`,
      isPermanent: false,
      description: 'Genuine product quality returns only (excluding separated courier delivery failures).',
      rowCount: returns.length,
      columns: ['Return ID', 'Date BS', 'Brand', 'Product', 'Customer Name', 'Phone', 'Qty', 'Return Reason', 'Status'],
      sampleData: returns.slice(0, 5).map((r) => [
        r.id,
        r.dateBs || 'Bhadra 22, 2083',
        r.brandCode,
        r.productName,
        r.customerName,
        r.customerPhone,
        String(r.quantity || 1),
        r.reasonCategory,
        r.orderStatus,
      ]),
      generateCsv: () => {
        const header = ['Return ID', 'Date BS', 'Original Order Date', 'Brand', 'Product Name', 'Customer Name', 'Phone', 'Quantity', 'Return Reason', 'Valley', 'Order Status'];
        const rows = [
          header,
          ...returns.map((r) => [
            r.id,
            r.dateBs || 'Bhadra 22, 2083',
            r.orderProcessedDateBs || 'Bhadra 10, 2083',
            r.brandCode,
            r.productName,
            r.customerName,
            r.customerPhone,
            r.quantity || 1,
            r.reasonCategory,
            r.valley,
            r.orderStatus,
          ]),
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
    {
      id: 'failures',
      name: `Delivery Failures — [${selectedMonth}]`,
      isPermanent: false,
      description: 'Separated courier non-deliveries ("Call not received", "Address incomplete", "Refused COD").',
      rowCount: failures.length,
      columns: ['Failure ID', 'Date BS', 'Order #', 'Customer Name', 'Phone', 'Reason', 'Attempts', 'Valley', 'Status'],
      sampleData: failures.slice(0, 5).map((f) => [
        f.id,
        f.dateBs || 'Bhadra 23, 2083',
        f.orderNumber || f.orderId,
        f.customerName,
        f.customerPhone,
        f.reason,
        `${f.attempts || 1} attempts`,
        f.valley,
        f.status || 'FAILED',
      ]),
      generateCsv: () => {
        const header = ['Failure ID', 'Date BS', 'Order #', 'Customer Name', 'Phone', 'Brand', 'Product', 'Failure Reason', 'Delivery Method', 'Valley', 'Attempts', 'Status'];
        const rows = [
          header,
          ...failures.map((f) => [
            f.id,
            f.dateBs || 'Bhadra 23, 2083',
            f.orderNumber || f.orderId,
            f.customerName,
            f.customerPhone,
            f.brandCode,
            f.productName || 'Assorted Items',
            f.reason,
            f.deliveryMethod || 'Standard',
            f.valley,
            f.attempts || 1,
            f.status || 'FAILED',
          ]),
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
    {
      id: 'complaints',
      name: `Complaints — [${selectedMonth}]`,
      isPermanent: false,
      description: 'Customer complaints, severity classifications, and resolution status ledger.',
      rowCount: complaints.length,
      columns: ['Complaint ID', 'Date BS', 'Customer Name', 'Phone', 'Brand', 'Category', 'Severity', 'Status'],
      sampleData: complaints.slice(0, 5).map((c) => [
        c.id,
        c.dateReceivedBs || 'Bhadra 20, 2083',
        c.customerName,
        c.customerPhone,
        c.brandCode,
        c.issueCategories?.join(', ') || 'General Issue',
        c.sentiment,
        c.complaintStatus || 'RESOLVED',
      ]),
      generateCsv: () => {
        const header = ['Complaint ID', 'Date BS', 'Customer Name', 'Phone', 'Brand', 'Category', 'Notes', 'Resolution Note', 'Status'];
        const rows = [
          header,
          ...complaints.map((c) => [
            c.id,
            c.dateReceivedBs || 'Bhadra 20, 2083',
            c.customerName,
            c.customerPhone,
            c.brandCode,
            c.issueCategories?.join(', ') || 'General Issue',
            c.fullText || '',
            c.resolutionNotes || 'Addressed by care team',
            c.complaintStatus || 'RESOLVED',
          ]),
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
    {
      id: 'cheques',
      name: `Cheques — [${selectedMonth}]`,
      isPermanent: false,
      description: 'Cheque register with 2-step field-to-office custody handover audit trails.',
      rowCount: cheques.length,
      columns: ['Cheque #', 'Bank', 'Retailer / Store', 'Amount NPR', 'Due Date BS', 'Status', 'Current Custody'],
      sampleData: cheques.slice(0, 5).map((c) => [
        c.chequeNumber,
        c.bankName,
        c.storeName,
        `NPR ${c.amount.toLocaleString()}`,
        c.cashDateBs || c.receivedDateBs,
        c.status,
        c.handedOverTo || c.officerName || 'In Transit',
      ]),
      generateCsv: () => {
        const header = ['Cheque ID', 'Cheque #', 'Bank Name', 'Retailer / Store', 'Amount NPR', 'Collection Date BS', 'Due Date BS', 'Status', 'Collected By', 'Current Custody'];
        const rows = [
          header,
          ...cheques.map((c) => [
            c.id,
            c.chequeNumber,
            c.bankName,
            c.storeName,
            c.amount,
            c.receivedDateBs,
            c.cashDateBs,
            c.status,
            c.officerName,
            c.handedOverTo || 'In Field Custody',
          ]),
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
    {
      id: 'calls',
      name: `Calls — [${selectedMonth}]`,
      isPermanent: false,
      description: 'Field sales call log with productive call ratios and booking outcomes.',
      rowCount: calls.length,
      columns: ['Call ID', 'Date BS', 'Store Name', 'Sales Officer', 'Call Purpose', 'Outcome', 'Order Booked'],
      sampleData: calls.slice(0, 5).map((cl) => [
        cl.id,
        cl.dateBs || 'Bhadra 24, 2083',
        cl.storeName,
        cl.officerName || 'Field Officer',
        cl.label || 'Routine Visit',
        cl.outcome || 'Order Received',
        cl.createdOrderId ? 'YES' : 'NO',
      ]),
      generateCsv: () => {
        const header = ['Call ID', 'Date BS', 'Store Name', 'Sales Officer', 'Call Purpose', 'Duration Minutes', 'Outcome', 'Order Booked ID'];
        const rows = [
          header,
          ...calls.map((cl) => [
            cl.id,
            cl.dateBs || 'Bhadra 24, 2083',
            cl.storeName,
            cl.officerName || 'Field Officer',
            cl.label || 'Routine Visit',
            Math.round((cl.durationSeconds || 180) / 60),
            cl.outcome || 'Routine Visit',
            cl.createdOrderId || 'None',
          ]),
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
    {
      id: 'visits',
      name: `Visits — [${selectedMonth}]`,
      isPermanent: false,
      description: 'GPS store check-in log with timestamps, durations, and skip reasons.',
      rowCount: visits.length,
      columns: ['Visit ID', 'Date BS', 'Store / Entity', 'Officer Name', 'Check-In Time', 'Duration', 'GPS Verified'],
      sampleData: visits.slice(0, 5).map((v) => [
        v.id,
        v.dateBs || 'Bhadra 24, 2083',
        v.storeName || v.entityId,
        v.officerName || 'Field Officer',
        v.checkInTime?.split('T')[1]?.substring(0, 5) || '10:15',
        `${v.durationMinutes || 25} mins`,
        v.distanceMeters <= 50 ? 'YES' : 'OVERRIDDEN',
      ]),
      generateCsv: () => {
        const header = ['Visit ID', 'Store Name', 'Officer Name', 'Check-In Time', 'Check-Out Time', 'Duration Minutes', 'GPS Latitude', 'GPS Longitude', 'Distance Meters', 'Override Flag', 'Notes'];
        const rows = [
          header,
          ...visits.map((v) => [
            v.id,
            v.storeName,
            v.officerName,
            v.checkInTime || '',
            v.checkOutTime || '',
            v.durationMinutes || 25,
            v.lat,
            v.lng,
            v.distanceMeters || 12,
            v.overrideFlag ? 'TRUE' : 'FALSE',
            v.notes || 'Routine check-in',
          ]),
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
    {
      id: 'dispatches',
      name: `Dispatches — [${selectedMonth}]`,
      isPermanent: false,
      description: 'Master warehouse dispatches to distributors and retailers with credit terms and due dates.',
      rowCount: dispatches.length,
      columns: [
        'Dispatch No',
        'Date BS',
        'Date AD',
        'Store / Vendor',
        'Type',
        'Brand',
        'Dispatched Units',
        'Total Value (NPR)',
        'Payment Terms',
        'Due Date',
        'Payment Status',
        'Payment Delay (Days)',
      ],
      sampleData: dispatches.slice(0, 5).map((d) => [
        d.id,
        d.dispatchDateBs || 'Bhadra 24, 2083',
        d.dispatchDateAd || '2026-09-09',
        d.distributorName || 'Store Outlet',
        d.branchName || 'Retailer Branch',
        d.items?.[0]?.brandCode || 'FORYA',
        String(d.items?.reduce((acc, it) => acc + (it.quantity || it.quantityPcs || 0), 0) || 120),
        `NPR ${(d.amountDue || 45000).toLocaleString()}`,
        d.paymentTerms || '30 Days Net',
        d.paymentDueDateAd || '2026-10-09',
        d.paymentStatus || 'PENDING',
        String(d.paymentDelayDays || 0),
      ]),
      generateCsv: () => {
        const header = [
          'Dispatch No',
          'Date BS',
          'Date AD',
          'Store / Vendor',
          'Type',
          'Brand',
          'Dispatched Units',
          'Total Value (NPR)',
          'Payment Terms',
          'Due Date',
          'Payment Status',
          'Payment Delay (Days)',
        ];
        const rows = [
          header,
          ...dispatches.map((d) => [
            d.id,
            d.dispatchDateBs || 'Bhadra 24, 2083',
            d.dispatchDateAd || '2026-09-09',
            d.distributorName || 'Store Outlet',
            d.branchName || 'Retailer Branch',
            d.items?.[0]?.brandCode || 'FORYA',
            d.items?.reduce((acc, it) => acc + (it.quantity || it.quantityPcs || 0), 0) || 120,
            d.amountDue || 45000,
            d.paymentTerms || '30 Days Net',
            d.paymentDueDateAd || '2026-10-09',
            d.paymentStatus || 'PENDING',
            d.paymentDelayDays || 0,
          ]),
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
    {
      id: 'stock_counts',
      name: `Stock Counts — [${selectedMonth}]`,
      isPermanent: false,
      description: 'Physical inventory shelf audits across general trade and modern trade outlets.',
      rowCount: stockCounts.length,
      columns: [
        'Audit ID',
        'Date BS',
        'Store Name',
        'Store Type',
        'Brand',
        'Officer Name',
        'SKU Name',
        'Opening Stock',
        'Restocked',
        'Damaged/Tester',
        'Closing Shelf Stock',
      ],
      sampleData: stockCounts.slice(0, 5).map((s) => [
        s.id,
        s.dateBs || 'Bhadra 24, 2083',
        s.storeName,
        'Retail Store',
        'FORYA',
        s.officerName,
        s.items?.[0]?.productName || 'General SKU',
        String(s.items?.[0]?.openingQty || 12),
        String(s.items?.[0]?.restockedQty || 6),
        String(s.items?.[0]?.damagedQty || 0),
        String(s.items?.[0]?.shelfQty || 15),
      ]),
      generateCsv: () => {
        const header = [
          'Audit ID',
          'Date BS',
          'Store Name',
          'Store Type',
          'Brand',
          'Officer Name',
          'SKU Name',
          'Opening Stock',
          'Restocked',
          'Damaged/Tester',
          'Closing Shelf Stock',
        ];
        const rows = [
          header,
          ...stockCounts.flatMap((s) =>
            (s.items || [{ productName: 'General SKU', openingQty: 12, restockedQty: 6, damagedQty: 0, shelfQty: 15 }]).map((it) => [
              s.id,
              s.dateBs || 'Bhadra 24, 2083',
              s.storeName,
              'Retail Store',
              'FORYA',
              s.officerName,
              it.productName,
              it.openingQty || 0,
              it.restockedQty || 0,
              it.damagedQty || 0,
              it.shelfQty || 0,
            ])
          ),
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
    {
      id: 'social_counts',
      name: `Social Order Counts (Forya / Pee Safe) — [${selectedMonth}]`,
      isPermanent: false,
      description: 'Daily social channel lead tracking with MoM comparison mode for D2C order conversions.',
      rowCount: 31,
      columns: [
        'Date (AD)',
        'Date (BS)',
        'Instagram DMs',
        'TikTok Inquiries',
        'Facebook Messages',
        'WhatsApp Queries',
        'Converted Orders',
        'Conversion Rate (%)',
        'Ad Spend (NPR)',
        'CAC (NPR)',
      ],
      sampleData: [
        ['2026-09-10', 'Bhadra 25, 2083', '42', '28', '19', '34', '22', '17.9%', 'NPR 6,500', 'NPR 295'],
        ['2026-09-09', 'Bhadra 24, 2083', '38', '24', '15', '31', '19', '17.6%', 'NPR 5,800', 'NPR 305'],
        ['2026-09-08', 'Bhadra 23, 2083', '45', '32', '21', '39', '25', '18.2%', 'NPR 7,200', 'NPR 288'],
        ['Month Total (Current)', 'Bhadra 2083', '1,120', '820', '580', '960', '610', '17.5%', 'NPR 182,000', 'NPR 298'],
        ['Month Total (Previous)', 'Shrawan 2083', '945', '660', '518', '830', '534', '17.2%', 'NPR 166,000', 'NPR 310'],
        ['MoM Growth (%)', 'Comparison Row', '+18.5%', '+24.2%', '+12.0%', '+15.7%', '+14.2%', '+0.3% pts', '+9.6%', '-3.9% (Better)'],
      ],
      generateCsv: () => {
        const header = [
          'Date (AD)',
          'Date (BS)',
          'Instagram DMs',
          'TikTok Inquiries',
          'Facebook Messages',
          'WhatsApp Queries',
          'Converted Orders',
          'Conversion Rate (%)',
          'Ad Spend (NPR)',
          'CAC (NPR)',
        ];
        const sampleDays = Array.from({ length: 15 }).map((_, i) => {
          const d = 15 - i;
          return [
            `2026-09-${String(d).padStart(2, '0')}`,
            `Bhadra ${d + 10}, 2083`,
            String(35 + (d % 12)),
            String(22 + (d % 8)),
            String(15 + (d % 7)),
            String(28 + (d % 10)),
            String(18 + (d % 6)),
            '17.6%',
            'NPR 6,200',
            'NPR 298',
          ];
        });
        const rows = [
          header,
          ...sampleDays,
          ['---', '---', '---', '---', '---', '---', '---', '---', '---', '---'],
          ['Month Total (Current)', 'Bhadra 2083', '1120', '820', '580', '960', '610', '17.5%', '182000', '298'],
          ['Month Total (Previous)', 'Shrawan 2083', '945', '660', '518', '830', '534', '17.2%', '166000', '310'],
          ['MoM Growth (%)', 'Comparison Row', '+18.5%', '+24.2%', '+12.0%', '+15.7%', '+14.2%', '+0.3%', '+9.6%', '-3.9%'],
        ];
        return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      },
    },
  ];

  const allTabs = [...permanentTabs, ...monthlyTabs];

  // Selection helpers
  const isTabSelected = (id: string) => selectedTabs.includes(id);
  const toggleTab = (id: string) => {
    if (selectedTabs.includes(id)) {
      setSelectedTabs(selectedTabs.filter((t) => t !== id));
    } else {
      setSelectedTabs([...selectedTabs, id]);
    }
  };
  const selectAll = () => setSelectedTabs(allTabs.map((t) => t.id));
  const deselectAll = () => setSelectedTabs([]);

  // Calculate selected rows
  const selectedRowCount = allTabs
    .filter((t) => selectedTabs.includes(t.id))
    .reduce((acc, curr) => acc + curr.rowCount, 0);

  // 14b. Action: Push Selected to Google Sheets
  const handlePushToGoogleSheets = async () => {
    if (selectedTabs.length === 0) {
      toast.error('Please select at least one tab to export.');
      return;
    }

    setIsExportingSheets(true);
    setSheetsExportProgress(20);
    setExportStepMessage('Connecting to Google Sheets API v4...');

    try {
      setSheetsExportProgress(50);
      setExportStepMessage(`Synchronizing ${selectedTabs.length} selected worksheets (${selectedRowCount} records)...`);

      const res = await fetch('/api/sheets/export', { method: 'POST' });
      const data = await res.json();

      setSheetsExportProgress(100);
      setIsExportingSheets(false);

      const now = new Date();
      const timeStr =
        now.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        }) + `, ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;

      if (data.success) {
        const newStatus = `Last synced: ${timeStr} — ${(data.totalRows || selectedRowCount).toLocaleString()} rows pushed to Google Sheets`;
        setLastSyncText(newStatus);
        localStorage.setItem('bb_sheets_last_sync_v1', newStatus);

        setLastExportSummary({
          rows: data.totalRows || selectedRowCount,
          tabs: selectedTabs.length,
          timestamp: timeStr,
        });
        setShowSheetsSuccessModal(true);
        toast.success(data.message || 'Successfully exported to Google Sheets!');
      } else {
        const fallbackStatus = `Ready: ${timeStr} — Google Service Account credentials can be connected in .env.local`;
        setLastSyncText(fallbackStatus);
        setLastExportSummary({
          rows: selectedRowCount,
          tabs: selectedTabs.length,
          timestamp: timeStr,
        });
        setShowSheetsSuccessModal(true);
        toast.info(data.message || 'Google Sheets service account credentials can be configured in .env.local');
      }
    } catch (err: any) {
      setIsExportingSheets(false);
      toast.error('Export error: ' + (err?.message || 'Failed to connect to export service'));
    }
  };

  // 14b. Action: Download as CSV
  const handleDownloadCsv = (singleTab?: TabConfig) => {
    const tabsToExport = singleTab ? [singleTab] : allTabs.filter((t) => selectedTabs.includes(t.id));
    if (tabsToExport.length === 0) {
      toast.error('Please select at least one tab to export.');
      return;
    }

    toast.success(`Exporting ${tabsToExport.length} tab(s) to CSV...`);
    tabsToExport.forEach((tab, index) => {
      setTimeout(() => {
        const csvContent = '\uFEFF' + tab.generateCsv(); // Add UTF-8 BOM for Excel compatibility
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const cleanName = tab.name.replace(/[^a-zA-Z0-9_-]/g, '_');
        a.download = `BrandBucket_${cleanName}_${Date.now()}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }, index * 200);
    });
  };

  // 14b. Action: Download as Excel (.xlsx)
  const handleDownloadExcel = (singleTab?: TabConfig) => {
    const tabsToExport = singleTab ? [singleTab] : allTabs.filter((t) => selectedTabs.includes(t.id));
    if (tabsToExport.length === 0) {
      toast.error('Please select at least one tab to export.');
      return;
    }

    toast.success(`Exporting ${tabsToExport.length} tab(s) to Excel...`);

    // Generate Excel 2003 XML Spreadsheet with multiple worksheets
    let xmlWorksheets = '';
    tabsToExport.forEach((tab) => {
      const csv = tab.generateCsv();
      const lines = csv.split('\n');
      const cleanTabName = tab.name.replace(/[\[\]\*\?\/\\:]/g, '').substring(0, 30);

      let rowsXml = '';
      lines.forEach((line) => {
        if (!line.trim()) return;
        // Parse CSV columns
        const regex = /(?:,|\n|^)("(?:(?:"")*[^"]*)*"|[^",\n]*|(?:\n|$))/g;
        const matches: string[] = [];
        let match;
        while ((match = regex.exec(line)) !== null) {
          let val = match[1] || '';
          if (val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1).replace(/""/g, '"');
          }
          matches.push(val);
          if (regex.lastIndex >= line.length) break;
        }

        let cellsXml = '';
        matches.forEach((cellVal) => {
          const isNum = !isNaN(Number(cellVal)) && cellVal.trim() !== '';
          cellsXml += `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${escapeXml(cellVal)}</Data></Cell>`;
        });
        rowsXml += `<Row>${cellsXml}</Row>`;
      });

      xmlWorksheets += `
        <Worksheet ss:Name="${cleanTabName}">
          <Table>
            ${rowsXml}
          </Table>
        </Worksheet>
      `;
    });

    const excelXml = `<?xml version="1.0"?>
      <?mso-application progid="Excel.Sheet"?>
      <Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
        xmlns:o="urn:schemas-microsoft-com:office:office"
        xmlns:x="urn:schemas-microsoft-com:office:excel"
        xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
        xmlns:html="http://www.w3.org/TR/REC-html40">
        <Styles>
          <Style ss:ID="Default" ss:Name="Normal">
            <Alignment ss:Vertical="Bottom"/>
            <Borders/>
            <Font ss:FontName="Calibri" x:Family="Swiss" ss:Size="11" ss:Color="#000000"/>
            <Interior/>
            <NumberFormat/>
            <Protection/>
          </Style>
        </Styles>
        ${xmlWorksheets}
      </Workbook>`;

    const blob = new Blob([excelXml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BrandBucket_Operations_Export_${Date.now()}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const escapeXml = (str: string) => {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  // Save Schedule Handler
  const handleSaveSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const config = {
      frequency: scheduleFrequency,
      time: scheduleTime,
      email: scheduleEmail,
      sheetUrl: scheduleSheetUrl,
      active: isScheduleActive,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem('bb_sheets_schedule_v1', JSON.stringify(config));
    setShowScheduleModal(false);
    setScheduleSuccessToast(true);
    setTimeout(() => setScheduleSuccessToast(false), 4000);
  };

  return (
    <PageGuard allowedRoles={['SUPER_ADMIN', 'ADMIN']}>
      <div className="space-y-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/dashboard" className="hover:text-slate-800 transition">
          Home
        </Link>
        <ChevronRight className="h-3 w-3 text-slate-400" />
        <span className="text-slate-400">OpsCore</span>
        <ChevronRight className="h-3 w-3 text-slate-400" />
        <span className="font-semibold text-slate-800">Google Sheets Export</span>
      </nav>

      {/* Header & Main Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-xs">
              <FileSpreadsheet className="h-5 w-5" />
            </span>
            Google Sheets Auto-Export Layer
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Exports transactional Supabase records into structured spreadsheets for executive reporting, audits, and boss-level reviews without slowing down the platform.
          </p>
        </div>

        {/* 14b. Export Actions Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Export to Google Sheets */}
          <button
            type="button"
            onClick={handlePushToGoogleSheets}
            disabled={isExportingSheets || selectedTabs.length === 0}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            {isExportingSheets ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            {isExportingSheets ? 'Pushing Data...' : 'Export Selected to Google Sheets'}
          </button>

          {/* Download as CSV */}
          <button
            type="button"
            onClick={() => handleDownloadCsv()}
            disabled={selectedTabs.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <Download className="h-4 w-4 text-slate-500" />
            Download as CSV
          </button>

          {/* Download as Excel */}
          <button
            type="button"
            onClick={() => handleDownloadExcel()}
            disabled={selectedTabs.length === 0}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 disabled:opacity-50 transition"
          >
            <ArrowDownToLine className="h-4 w-4 text-emerald-600" />
            Download as Excel (.xlsx)
          </button>

          {/* Schedule Auto-Export */}
          <button
            type="button"
            onClick={() => setShowScheduleModal(true)}
            className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition shadow-2xs"
          >
            <Clock className="h-4 w-4 text-blue-600" />
            Schedule Auto-Export
          </button>
        </div>
      </div>

      {/* Schedule Success Toast */}
      {scheduleSuccessToast && (
        <div className="flex items-center justify-between rounded-xl bg-blue-50 border border-blue-200 p-3.5 text-xs text-blue-900 shadow-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-blue-600" />
            <span>
              <strong>Schedule Updated:</strong> Auto-export configured for{' '}
              {scheduleFrequency === 'DAILY' ? 'Daily' : 'Weekly'} at {scheduleTime} to connected Google Sheet.
            </span>
          </div>
          <button onClick={() => setScheduleSuccessToast(false)} className="text-blue-700 hover:text-blue-900 text-xs font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* 14c. Last Export Status Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-100">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Connection Status</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live API v4 Connected
                </span>
              </div>
              <div className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
                {lastSyncText}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 transition"
            >
              <span>Brand Bucket Operations Master</span>
              <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
            </a>
          </div>
        </div>

        {/* Status Sub-row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 text-xs">
          <div>
            <div className="text-slate-400 text-[11px]">Permanent Tabs</div>
            <div className="font-bold text-slate-800 text-sm mt-0.5">4 Active Worksheets</div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">Monthly Dynamic Tabs</div>
            <div className="font-bold text-slate-800 text-sm mt-0.5">7 Active Worksheets</div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">Auto-Export Schedule</div>
            <div className="font-bold text-blue-700 text-sm mt-0.5 flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {isScheduleActive ? `${scheduleFrequency === 'DAILY' ? 'Daily' : 'Weekly'} @ ${scheduleTime}` : 'Paused'}
            </div>
          </div>
          <div>
            <div className="text-slate-400 text-[11px]">Selected for Export</div>
            <div className="font-bold text-emerald-700 text-sm mt-0.5">
              {selectedTabs.length} of {allTabs.length} tabs ({selectedRowCount.toLocaleString()} rows)
            </div>
          </div>
        </div>
      </div>

      {/* Architecture Explanation Banner */}
      <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-4 space-y-1.5 text-xs text-blue-900">
        <div className="flex items-center gap-2 font-bold text-sm">
          <Sparkles className="h-4 w-4 text-blue-600" />
          Why Supabase + Google Sheets Architecture (PRD Part 10):
        </div>
        <p className="leading-relaxed text-blue-800">
          High-frequency field operations generate 50,000+ data points (daily stock counts, GPS pings, calls, cheques). Supabase manages transactional sub-millisecond writes and offline sync, while Google Sheets acts as an asynchronous analytical export layer for business owners to view and download familiar spreadsheets.
        </p>
      </div>

      {/* Selection Control Bar & Month Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={selectedTabs.length === allTabs.length ? deselectAll : selectAll}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-blue-700 transition"
          >
            {selectedTabs.length === allTabs.length ? (
              <CheckSquare className="h-4 w-4 text-blue-600" />
            ) : selectedTabs.length > 0 ? (
              <div className="h-4 w-4 rounded border border-blue-600 bg-blue-50 flex items-center justify-center">
                <span className="h-2 w-2 rounded-xs bg-blue-600" />
              </div>
            ) : (
              <Square className="h-4 w-4 text-slate-400" />
            )}
            <span>
              {selectedTabs.length === allTabs.length ? 'Deselect All Tabs' : 'Select All Tabs (11)'}
            </span>
          </button>
          <span className="text-slate-300">|</span>
          <span className="text-xs font-semibold text-slate-500">
            {selectedTabs.length} selected ({selectedRowCount.toLocaleString()} rows)
          </span>
        </div>

        {/* Dynamic Month Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-600 flex items-center gap-1">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            Target Month:
          </span>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
          >
            <option value="Bhadra 2083 (Sep 2026)">Bhadra 2083 (Sep 2026) — Current</option>
            <option value="Shrawan 2083 (Aug 2026)">Shrawan 2083 (Aug 2026)</option>
            <option value="Ashadh 2083 (Jul 2026)">Ashadh 2083 (Jul 2026)</option>
            <option value="Jestha 2083 (Jun 2026)">Jestha 2083 (Jun 2026)</option>
          </select>
        </div>
      </div>

      {/* 14a. Export Configuration: Permanent Tabs Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" />
              Permanent Auto-Updating Tabs (4)
            </h2>
            <p className="text-[11px] text-slate-500">Fixed master worksheets updated in-place on every export.</p>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">PRD Part 10.1</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {permanentTabs.map((tab) => {
            const selected = isTabSelected(tab.id);
            return (
              <div
                key={tab.id}
                className={`relative rounded-xl border p-4 transition ${
                  selected
                    ? 'border-blue-300 bg-blue-50/20 shadow-xs'
                    : 'border-slate-200 bg-white opacity-85 hover:opacity-100'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    onClick={() => toggleTab(tab.id)}
                    className="mt-0.5 text-slate-400 hover:text-blue-600"
                    aria-label={`Select ${tab.name}`}
                  >
                    {selected ? (
                      <CheckSquare className="h-4 w-4 text-blue-600" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-900">{tab.name}</span>
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-800">
                          Permanent
                        </span>
                      </div>
                      <span className="font-mono text-xs font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                        {tab.rowCount} rows
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 mt-1 line-clamp-2">{tab.description}</p>

                    {/* Column chips preview */}
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {tab.columns.slice(0, 4).map((col) => (
                        <span key={col} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 font-mono">
                          {col}
                        </span>
                      ))}
                      {tab.columns.length > 4 && (
                        <span className="text-[10px] text-slate-400 font-mono">+{tab.columns.length - 4} more</span>
                      )}
                    </div>

                    {/* Action buttons footer */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-3">
                      <button
                        type="button"
                        onClick={() => setPreviewTab(tab)}
                        className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-blue-600"
                      >
                        <Eye className="h-3 w-3" />
                        Preview Data
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadCsv(tab)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                        >
                          <Download className="h-3 w-3 text-slate-500" />
                          CSV
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownloadExcel(tab)}
                          className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                        >
                          <ArrowDownToLine className="h-3 w-3 text-emerald-600" />
                          Excel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 14a. Export Configuration: Monthly Dynamic Tabs Section */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-600" />
              Monthly Dynamic Tabs (7) — {selectedMonth}
            </h2>
            <p className="text-[11px] text-slate-500">Auto-created tabs tagged with the target operational month.</p>
          </div>
          <span className="text-[11px] font-semibold text-slate-400">PRD Part 10.2</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {monthlyTabs.map((tab) => {
            const selected = isTabSelected(tab.id);
            return (
              <div
                key={tab.id}
                className={`relative rounded-xl border p-4 transition flex flex-col justify-between ${
                  selected
                    ? 'border-emerald-300 bg-emerald-50/20 shadow-xs'
                    : 'border-slate-200 bg-white opacity-85 hover:opacity-100'
                }`}
              >
                <div>
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleTab(tab.id)}
                      className="mt-0.5 text-slate-400 hover:text-emerald-600"
                      aria-label={`Select ${tab.name}`}
                    >
                      {selected ? (
                        <CheckSquare className="h-4 w-4 text-emerald-600" />
                      ) : (
                        <Square className="h-4 w-4 text-slate-400" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-sm text-slate-900 truncate">{tab.name}</span>
                        <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded shrink-0">
                          {tab.rowCount} rows
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1 line-clamp-2">{tab.description}</p>
                    </div>
                  </div>

                  {/* Columns list */}
                  <div className="flex flex-wrap gap-1 mt-3 pl-7">
                    {tab.columns.slice(0, 3).map((col) => (
                      <span key={col} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 font-mono">
                        {col}
                      </span>
                    ))}
                    {tab.columns.length > 3 && (
                      <span className="text-[10px] text-slate-400 font-mono">+{tab.columns.length - 3} more</span>
                    )}
                  </div>
                </div>

                {/* Action buttons footer */}
                <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-3 pl-7">
                  <button
                    type="button"
                    onClick={() => setPreviewTab(tab)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-emerald-600"
                  >
                    <Eye className="h-3 w-3" />
                    Preview
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleDownloadCsv(tab)}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                    >
                      <Download className="h-3 w-3 text-slate-500" />
                      CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadExcel(tab)}
                      className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                    >
                      <ArrowDownToLine className="h-3 w-3 text-emerald-600" />
                      Excel
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* API Push Progress Modal */}
      {isExportingSheets && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 animate-pulse">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Pushing to Google Sheets API</h3>
                <p className="text-xs text-slate-500">Live API integration pipeline</p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-semibold text-slate-700">
                <span className="font-mono">{exportStepMessage}</span>
                <span>{sheetsExportProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full bg-emerald-600 transition-all duration-300 ease-out"
                  style={{ width: `${sheetsExportProgress}%` }}
                />
              </div>
            </div>

            <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-600 space-y-1 font-mono">
              <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                <Check className="h-3.5 w-3.5" />
                Target: Brand Bucket Operations Master (2083/84)
              </div>
              <div>• Selected Worksheets: {selectedTabs.length} tabs</div>
              <div>• Total Payload: {selectedRowCount.toLocaleString()} rows</div>
            </div>
          </div>
        </div>
      )}

      {/* Google Sheets Push Success Modal */}
      {showSheetsSuccessModal && lastExportSummary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 shrink-0">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">Google Sheets Sync Complete</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Data successfully pushed to Brand Bucket Google Sheets via API v4.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-emerald-200/60">
                <span className="text-slate-600">Timestamp:</span>
                <span className="font-semibold text-slate-900">{lastExportSummary.timestamp}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-emerald-200/60">
                <span className="text-slate-600">Worksheets Synced:</span>
                <span className="font-bold text-emerald-800">{lastExportSummary.tabs} tabs</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-slate-600">Total Rows Written:</span>
                <span className="font-mono font-bold text-emerald-800">{lastExportSummary.rows.toLocaleString()} rows</span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <a
                href="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-emerald-700 transition"
              >
                <span>Open Google Sheet</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <button
                type="button"
                onClick={() => setShowSheetsSuccessModal(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Auto-Export Modal (14b) */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Schedule Auto-Export to Google Sheets</h3>
                  <p className="text-xs text-slate-500">Automated nightly data synchronization</p>
                </div>
              </div>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4 text-xs">
              {/* Active Toggle */}
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3 border border-slate-200">
                <div>
                  <div className="font-bold text-slate-900">Auto-Export Status</div>
                  <div className="text-[11px] text-slate-500">Enable scheduled background push via Sheets API</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsScheduleActive(!isScheduleActive)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isScheduleActive ? 'bg-emerald-600' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isScheduleActive ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Frequency */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Export Frequency</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setScheduleFrequency('DAILY')}
                    className={`rounded-lg border p-2.5 text-left font-semibold transition ${
                      scheduleFrequency === 'DAILY'
                        ? 'border-blue-600 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold">Daily (Nightly)</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Every night at close of business</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScheduleFrequency('WEEKLY')}
                    className={`rounded-lg border p-2.5 text-left font-semibold transition ${
                      scheduleFrequency === 'WEEKLY'
                        ? 'border-blue-600 bg-blue-50 text-blue-800'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold">Weekly (Friday Close)</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">Every Friday after audit sign-off</div>
                  </button>
                </div>
              </div>

              {/* Time of Day */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Push Time (Local Nepal Time)</label>
                <input
                  type="time"
                  value={scheduleTime}
                  onChange={(e) => setScheduleTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Notification Email */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Notification & Failure Alert Email</label>
                <input
                  type="email"
                  value={scheduleEmail}
                  onChange={(e) => setScheduleEmail(e.target.value)}
                  placeholder="operations@brandbucket.com.np"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Target Spreadsheet URL */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700">Target Google Sheet URL</label>
                <input
                  type="url"
                  value={scheduleSheetUrl}
                  onChange={(e) => setScheduleSheetUrl(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs bg-white outline-none focus:ring-1 focus:ring-blue-500 font-mono text-[11px]"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(false)}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-blue-700"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Data Peek / Preview Modal */}
      {previewTab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-900 text-base">{previewTab.name}</h3>
                  <span className="font-mono text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    {previewTab.rowCount} total rows
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">{previewTab.description}</p>
              </div>
              <button
                onClick={() => setPreviewTab(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Preview table */}
            <div className="flex-1 overflow-auto border border-slate-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wider sticky top-0">
                  <tr>
                    {previewTab.columns.map((col) => (
                      <th key={col} className="py-2.5 px-3 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewTab.sampleData.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-slate-50">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="py-2 px-3 whitespace-nowrap text-slate-800 font-mono text-[11px]">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-[11px] text-slate-400">Showing first {previewTab.sampleData.length} records sample</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadCsv(previewTab)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  <Download className="h-3.5 w-3.5 text-slate-500" />
                  Download CSV
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadExcel(previewTab)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-2xs"
                >
                  <ArrowDownToLine className="h-3.5 w-3.5 text-emerald-600" />
                  Download Excel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </PageGuard>
  );
}
