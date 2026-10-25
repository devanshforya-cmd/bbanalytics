import { NextResponse } from 'next/server';
import { db } from '@/lib/db/db-service';
import { requireCronAuth } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;
  try {
    const now = new Date();
    const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const isInReportPeriod = (value?: string) => {
      if (!value) return false;
      const date = new Date(value);
      return Number.isFinite(date.getTime()) && date >= periodStart && date <= now;
    };
    const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char] || char));

    const orders = db.getOrders();
    const failures = db.getDeliveryFailures();
    const returns = db.getReturns();
    const feedback = db.getFeedback();
    const cheques = db.getCheques();
    const scorecards = db.getScorecards();
    const customers = db.getCustomers();

    // Summary numbers
    const periodOrders = orders.filter((o) => isInReportPeriod(o.orderDateAd || o.createdAt));
    const periodFailures = failures.filter((f) => isInReportPeriod(f.dateAd || f.createdAt));
    const periodReturns = returns.filter((r) => isInReportPeriod(r.dateAd || r.createdAt));
    const totalOrders = periodOrders.length;
    const foryaCount = periodOrders.filter((o) => o.brandCode === 'FORYA').length;
    const peeSafeCount = periodOrders.filter((o) => o.brandCode === 'PEE_SAFE').length;
    const reneeCount = periodOrders.filter((o) => o.brandCode === 'RENEE').length;

    const failureRate = totalOrders > 0 ? ((periodFailures.length / totalOrders) * 100).toFixed(1) : '0';
    const returnRate = totalOrders > 0 ? ((periodReturns.length / totalOrders) * 100).toFixed(1) : '0';

    const newComplaints = feedback.filter((f) => f.type === 'COMPLAINT' && isInReportPeriod(f.dateReceivedAd || f.createdAt));
    const resolvedComplaints = newComplaints.filter((c) => c.complaintStatus === 'RESOLVED');
    const openComplaints = newComplaints.filter((c) => c.complaintStatus !== 'RESOLVED');

    // Dynamically calculate top selling product from actual order items
    const prodCounts: Record<string, number> = {};
    periodOrders.forEach((o) => {
      o.items?.forEach((i) => {
        prodCounts[i.productName] = (prodCounts[i.productName] || 0) + i.quantity;
      });
    });
    const topProdEntry = Object.entries(prodCounts).sort((a, b) => b[1] - a[1])[0];
    const topProdText = escapeHtml(topProdEntry ? `${topProdEntry[0]} (${topProdEntry[1]} units)` : 'None recorded');

    const channelCounts: Record<string, number> = {};
    periodOrders.forEach((o) => { channelCounts[o.platform] = (channelCounts[o.platform] || 0) + 1; });
    const topChannelEntry = Object.entries(channelCounts).sort((a, b) => b[1] - a[1])[0];
    const topChannelText = escapeHtml(topChannelEntry ? `${topChannelEntry[0]} (${Math.round((topChannelEntry[1] / Math.max(totalOrders, 1)) * 100)}%)` : 'None recorded');

    const failureReasons: Record<string, number> = {};
    periodFailures.forEach((failure) => { failureReasons[failure.reason] = (failureReasons[failure.reason] || 0) + 1; });
    const topFailureEntry = Object.entries(failureReasons).sort((a, b) => b[1] - a[1])[0];
    const topFailureText = escapeHtml(topFailureEntry ? `${topFailureEntry[0]} (${topFailureEntry[1]})` : 'None recorded');

    const returnReasons: Record<string, number> = {};
    periodReturns.forEach((entry) => { returnReasons[entry.reasonCategory] = (returnReasons[entry.reasonCategory] || 0) + 1; });
    const topReturnEntry = Object.entries(returnReasons).sort((a, b) => b[1] - a[1])[0];
    const topReturnText = escapeHtml(topReturnEntry ? `${topReturnEntry[0]} (${topReturnEntry[1]})` : 'None recorded');

    const reportPeriod = `${periodStart.toLocaleDateString('en-NP')} – ${now.toLocaleDateString('en-NP')}`;
    const scorecardText = escapeHtml(scorecards.length > 0
      ? scorecards.map((s) => `${s.officerName} ${s.beatCompliancePct}%`).join(', ')
      : 'No scorecards active');

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
      <div style="font-size: 13px; color: #64748b; margin-top: 4px;">Operations Summary — ${reportPeriod}</div>
      <div style="font-size: 12px; color: #b45309; font-weight: 600; margin-top: 4px;">Based on data currently available to this application instance.</div>
    </div>

    <div class="section-title">📦 Orders Overview</div>
    <div class="stat-row"><span>Orders in period:</span><span class="stat-val">${totalOrders} (Forya: ${foryaCount}, Pee Safe: ${peeSafeCount}, Renee: ${reneeCount})</span></div>
    <div class="stat-row"><span>Top Channel:</span><span class="stat-val">${topChannelText}</span></div>
    <div class="stat-row"><span>Top Product:</span><span class="stat-val">${topProdText}</span></div>

    <div class="section-title">🔴 Delivery Failures (Separated)</div>
    <div class="stat-row"><span>Failures in period:</span><span class="stat-val">${periodFailures.length} (${failureRate}% of orders)</span></div>
    <div class="stat-row"><span>Top Reason:</span><span class="stat-val">${topFailureText}</span></div>

    <div class="section-title">↩️ Actual Product Returns</div>
    <div class="stat-row"><span>Returns in period:</span><span class="stat-val">${periodReturns.length} (${returnRate}% of orders)</span></div>
    <div class="stat-row"><span>Top Issue:</span><span class="stat-val">${topReturnText}</span></div>

    <div class="section-title">💬 Customer Complaints</div>
    <div class="stat-row"><span>New Complaints:</span><span class="stat-val">${newComplaints.length}</span></div>
    <div class="stat-row"><span>Resolved:</span><span class="stat-val">${resolvedComplaints.length} | Still Open: ${openComplaints.length}</span></div>

    <div class="section-title">🏪 Field Sales Performance</div>
    <div class="stat-row"><span>Beat Compliance:</span><span class="stat-val">${scorecardText}</span></div>
    <div class="stat-row"><span>Store Visits Completed:</span><span class="stat-val">${db.getBeatItems().filter(b => b.status === 'VISITED').length} visits across ${scorecards.length} officers</span></div>
    <div class="stat-row"><span>Cheques Handled:</span><span class="stat-val">${cheques.filter(c => c.status === 'COLLECTED_IN_FIELD').length} Collected | ${cheques.filter(c => c.status === 'CASHED').length} Cashed | ${cheques.filter(c => c.status === 'DELAYED' || c.status === 'BOUNCED').length} Overdue/Delayed</span></div>

    <div class="section-title">👥 Customer Intelligence</div>
    <div class="stat-row"><span>Total Customers:</span><span class="stat-val">${customers.length} profiles</span></div>
    <div class="stat-row"><span>Customers at Risk (Karma &lt; 40):</span><span class="stat-val" style="color: #dc2626;">${customers.filter(c => c.karmaScore < 40).length} accounts</span></div>

    <div class="section-title">📅 Current Operations Outlook</div>
    <div class="stat-row"><span>Pending Action Items:</span><span class="stat-val">${cheques.filter(c => c.status === 'DELAYED' || c.status === 'BOUNCED').length} overdue cheques, ${openComplaints.length} open complaints</span></div>

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
