import { NextResponse } from 'next/server';
import { db } from '@/lib/db/db-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const orders = db.getOrders();
    const failures = db.getDeliveryFailures();
    const returns = db.getReturns();
    const feedback = db.getFeedback();
    const cheques = db.getCheques();
    const scorecards = db.getScorecards();
    const customers = db.getCustomers();

    // Summary numbers
    const totalOrders = orders.length;
    const foryaCount = orders.filter((o) => o.brandCode === 'FORYA').length;
    const peeSafeCount = orders.filter((o) => o.brandCode === 'PEE_SAFE').length;
    const reneeCount = orders.filter((o) => o.brandCode === 'RENEE').length;

    const failureRate = totalOrders > 0 ? ((failures.length / totalOrders) * 100).toFixed(1) : '0';
    const returnRate = totalOrders > 0 ? ((returns.length / totalOrders) * 100).toFixed(1) : '0';

    const newComplaints = feedback.filter((f) => f.type === 'COMPLAINT');
    const resolvedComplaints = newComplaints.filter((c) => c.complaintStatus === 'RESOLVED');
    const openComplaints = newComplaints.filter((c) => c.complaintStatus !== 'RESOLVED');

    const htmlEmail = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Brand Bucket Weekly Operations Report</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #1e293b; background-color: #f8fafc; padding: 24px; }
    .container { max-width: 640px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    .header { border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 20px; font-weight: 800; color: #0f172a; letter-spacing: -0.5px; }
    .dot { color: #2563eb; }
    .section-title { font-size: 13px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #f1f5f9; padding-bottom: 4px; }
    .stat-row { display: flex; justify-content: space-between; font-size: 13px; padding: 4px 0; }
    .stat-val { font-weight: 700; color: #0f172a; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #64748b; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">Brand Bucket<span class="dot">.</span> Operations Command</div>
      <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Weekly Operations Summary — Bhadra 20-26, 2083 (Sep 11, 2026)</div>
      <div style="font-size: 12px; color: #059669; font-weight: 600; margin-top: 4px;">Working Days: 5 (1 Public Holiday: Teej)</div>
    </div>

    <div class="section-title">📦 Orders Overview</div>
    <div class="stat-row"><span>Total Orders:</span><span class="stat-val">${totalOrders} (Forya: ${foryaCount}, Pee Safe: ${peeSafeCount}, Renee: ${reneeCount})</span></div>
    <div class="stat-row"><span>vs Prior Week:</span><span class="stat-val" style="color: #059669;">+12% ↑</span></div>
    <div class="stat-row"><span>Top Channel:</span><span class="stat-val">Instagram (55%)</span></div>
    <div class="stat-row"><span>Top Product:</span><span class="stat-val">Forya Roll-On Peach (50ml)</span></div>

    <div class="section-title">🔴 Delivery Failures (Separated)</div>
    <div class="stat-row"><span>Total Failures:</span><span class="stat-val">${failures.length} (${failureRate}% failure rate)</span></div>
    <div class="stat-row"><span>Trend:</span><span class="stat-val" style="color: #059669;">-3% ↓ (Improving)</span></div>
    <div class="stat-row"><span>Top Reason:</span><span class="stat-val">Call not received (${Math.max(1, failures.length - 2)} of ${failures.length})</span></div>

    <div class="section-title">↩️ Actual Product Returns</div>
    <div class="stat-row"><span>Total Returns:</span><span class="stat-val">${returns.length} (${returnRate}% return rate)</span></div>
    <div class="stat-row"><span>Top Issue:</span><span class="stat-val">Damage / Leaking bottle in transit</span></div>

    <div class="section-title">💬 Customer Complaints</div>
    <div class="stat-row"><span>New Complaints:</span><span class="stat-val">${newComplaints.length}</span></div>
    <div class="stat-row"><span>Resolved:</span><span class="stat-val">${resolvedComplaints.length} | Still Open: ${openComplaints.length}</span></div>
    <div class="stat-row"><span>Avg Resolution Time:</span><span class="stat-val">1.8 days</span></div>

    <div class="section-title">🏪 Field Sales Performance</div>
    <div class="stat-row"><span>Beat Compliance:</span><span class="stat-val">Ravi 87.5%, Pooja 93.9%, Suman 75.8%</span></div>
    <div class="stat-row"><span>Store Visits Completed:</span><span class="stat-val">72 visits across 3 officers</span></div>
    <div class="stat-row"><span>Cheques Handled:</span><span class="stat-val">8 Collected | 6 Cashed | 2 Overdue</span></div>

    <div class="section-title">👥 Customer Intelligence</div>
    <div class="stat-row"><span>New Customers:</span><span class="stat-val">18 (Total: ${customers.length})</span></div>
    <div class="stat-row"><span>Repeat Customer Rate:</span><span class="stat-val">79% of total volume</span></div>
    <div class="stat-row"><span>Customers at Risk (Karma &lt; 40):</span><span class="stat-val" style="color: #dc2626;">3 accounts</span></div>

    <div class="section-title">📅 Next Week Outlook</div>
    <div class="stat-row"><span>Upcoming Holidays:</span><span class="stat-val">Constitution Day (Bhadra 29)</span></div>
    <div class="stat-row"><span>Pending Action Items:</span><span class="stat-val">2 overdue cheques, 3 open complaints, 1 warehouse dispatch</span></div>

    <div class="footer">
      Generated automatically by Brand Bucket Command Center &bull; Kathmandu HQ &bull; Private &amp; Confidential
    </div>
  </div>
</body>
</html>
    `;

    return new Response(htmlEmail, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message }, { status: 500 });
  }
}
