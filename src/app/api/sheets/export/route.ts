import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { db } from '@/lib/db/db-service';

export async function POST(request: NextRequest) {
  try {
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;

    // Check credentials
    if (!serviceAccountEmail || !privateKeyRaw || !spreadsheetId) {
      return NextResponse.json(
        {
          success: false,
          error: 'GOOGLE_SHEETS_NOT_CONFIGURED',
          message:
            'Google Sheets credentials or GOOGLE_SHEETS_SPREADSHEET_ID not configured in environment variables.',
          instructions:
            'Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_SHEETS_SPREADSHEET_ID in your environment variables.',
        },
        { status: 503 }
      );
    }

    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

    // Authenticate
    const auth = new google.auth.JWT({
      email: serviceAccountEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Fetch existing sheets to see which tabs exist
    const spreadsheet = await sheets.spreadsheets.get({
      spreadsheetId,
    });
    const existingTitles = new Set(
      spreadsheet.data.sheets?.map((s) => s.properties?.title || '') || []
    );

    const now = new Date();
    const monthYear = now.toLocaleString('en-US', { month: 'short', year: 'numeric' });
    const ordersTabName = `Orders-${monthYear}`;
    const stockTabName = `Stock Counts-${monthYear}`;

    const requiredTabs = [
      'Summary',
      'Stores Directory',
      ordersTabName,
      stockTabName,
      'Cheques',
      'Visits',
      'Staff Scorecard',
    ];

    // Create tabs that don't exist yet
    const requestsToCreate: any[] = [];
    for (const tab of requiredTabs) {
      if (!existingTitles.has(tab)) {
        requestsToCreate.push({
          addSheet: {
            properties: { title: tab },
          },
        });
      }
    }

    if (requestsToCreate.length > 0) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: {
          requests: requestsToCreate,
        },
      });
    }

    // 1. Tab: Summary
    const stores = db.getFilteredStores();
    const orders = db.getOrders();
    const users = db.getUsers();
    const cheques = db.getCheques();
    const visits = db.getVisits();
    const stockCounts = db.getStockCounts();

    const summaryValues = [
      ['Metric', 'Value', 'Export Timestamp'],
      ['Total Active Stores', stores.length, now.toISOString()],
      ['Total Orders Processed', orders.length, ''],
      ['Total Staff Members', users.length, ''],
      ['Total Cheques Tracked', cheques.length, ''],
      ['Field Visits Recorded', visits.length, ''],
      ['Stock Counts Logged', stockCounts.length, ''],
      ['Last Auto-Export', now.toLocaleString(), ''],
    ];

    // 2. Tab: Stores Directory
    const storeValues = [
      ['Store ID', 'Store Name', 'Type', 'City', 'Area', 'Brands Stocked', 'Assigned Officer', 'Health Score'],
      ...stores.map((s) => {
        const brands = s.entityType === 'BRANCH' ? (s.brandsAvailable || []) : ((s as any).brandsStocked || []);
        const city = (s as any).city || 'Kathmandu';
        const area = (s as any).area || s.address || '';
        const storeType = s.entityType === 'BRANCH' ? 'Distributor Branch' : ((s as any).type || (s as any).storeType || 'Retailer');
        return [
          s.id,
          s.name,
          storeType,
          city,
          area,
          brands.join(', '),
          s.assignedOfficerName || 'Unassigned',
          (s as any).healthScore ?? 80,
        ];
      }),
    ];

    // 3. Tab: Orders-[Month YYYY]
    const orderValues = [
      ['S.N.', 'Order ID', 'Order Date (BS)', 'Order Date (AD)', 'Brand', 'Store', 'Products', 'Qty', 'Margin %', 'Type', 'Total Amount', 'Status'],
      ...orders.map((o, idx) => [
        idx + 1,
        o.id,
        o.orderDateBs || '',
        o.orderDateAd || '',
        o.brandCode || 'ALL',
        (o as any).storeName || o.customerName || 'Direct',
        (o.items || []).map((i) => i.productName).join('; '),
        (o.items || []).reduce((sum, i) => sum + (i.quantity || 1), 0),
        (o as any).marginPct || 20,
        o.orderType || 'Standard',
        o.totalAmount || 0,
        o.status || 'DELIVERED',
      ]),
    ];

    // 4. Tab: Stock Counts-[Month YYYY]
    const stockValues = [
      ['Date', 'Store', 'Branch', 'Officer', 'Product', 'Shelf Qty', 'Previous Qty', 'Run Rate'],
      ...stockCounts.flatMap((sc) =>
        (sc.items || []).map((it) => [
          sc.dateAd || sc.dateBs || sc.createdAt || '',
          sc.storeName || '',
          sc.entityType === 'BRANCH' ? sc.storeName : '',
          sc.officerName || '',
          it.productName || it.productId,
          it.shelfQty,
          it.previousQty,
          it.flaggedDrop ? 'FLAGGED DROP' : 'Normal',
        ])
      ),
    ];

    // 5. Tab: Cheques
    const chequeValues = [
      ['Cheque #', 'Store Name', 'Amount (Rs)', 'Bank', 'Collected By', 'Collected Date', 'Cash Date', 'Status', 'Days Overdue'],
      ...cheques.map((c) => [
        c.chequeNumber,
        c.storeName,
        c.amount,
        c.bankName,
        c.officerName || '',
        c.receivedDateAd || c.receivedDateBs || '',
        c.cashDateAd || c.cashDateBs || '',
        c.status,
        (c as any).daysOverdue || 0,
      ]),
    ];

    // 6. Tab: Visits
    const visitValues = [
      ['Date', 'Officer', 'Store', 'Status', 'Check-in Time', 'Check-out Time', 'Duration (Min)', 'GPS Verified'],
      ...visits.map((v) => [
        v.dateAd || v.dateBs || '',
        v.officerName || '',
        v.storeName || '',
        v.checkOutTime ? 'COMPLETED' : 'IN_PROGRESS',
        v.checkInTime || '',
        v.checkOutTime || '',
        v.durationMinutes || 0,
        !v.overrideFlag ? 'YES' : 'NO',
      ]),
    ];

    // 7. Tab: Staff Scorecard
    const officers = users.filter((u) => u.role === 'SALES_OFFICER');
    const scorecardValues = [
      ['Officer Name', 'Role', 'Status', 'Territory', 'Stores Assigned', 'Cheques Collected', 'Performance Score'],
      ...officers.map((o) => {
        const officerStores = stores.filter((s) => s.assignedOfficerId === o.id).length;
        const officerCheques = cheques.filter((c) => c.officerId === o.id).length;
        return [
          o.fullName,
          o.role,
          o.active ? 'ACTIVE' : 'INACTIVE',
          o.territory || 'Kathmandu Valley',
          officerStores,
          officerCheques,
          '92%',
        ];
      }),
    ];

    // Batch update all data values
    const dataUpdates = [
      { range: 'Summary!A1', values: summaryValues },
      { range: 'Stores Directory!A1', values: storeValues },
      { range: `${ordersTabName}!A1`, values: orderValues },
      { range: `${stockTabName}!A1`, values: stockValues },
      { range: 'Cheques!A1', values: chequeValues },
      { range: 'Visits!A1', values: visitValues },
      { range: 'Staff Scorecard!A1', values: scorecardValues },
    ];

    for (const update of dataUpdates) {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: update.range,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: update.values,
        },
      });
    }

    const totalRowsPushed =
      summaryValues.length +
      storeValues.length +
      orderValues.length +
      stockValues.length +
      chequeValues.length +
      visitValues.length +
      scorecardValues.length;

    return NextResponse.json({
      success: true,
      message: `Successfully exported ${totalRowsPushed} rows across 7 tabs to Google Sheets.`,
      spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${spreadsheetId}`,
      totalRows: totalRowsPushed,
      tabsUpdated: requiredTabs,
      exportedAt: now.toISOString(),
    });
  } catch (err: any) {
    console.error('Google Sheets export error:', err);
    return NextResponse.json(
      {
        success: false,
        error: 'SHEETS_EXPORT_FAILED',
        message: err?.message || 'Failed to export data to Google Sheets',
      },
      { status: 500 }
    );
  }
}
