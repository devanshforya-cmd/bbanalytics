import { NextResponse } from 'next/server';
import { db } from '@/lib/db/db-service';
import { requireCronAuth } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

/**
 * 56i & 57g. Combined Daily Vercel Cron Endpoint
 * - Smart Alerts (Cheque overdue, bounced, karma drop, urgent complaints)
 * - Reports the scheduled report/backup work that is not yet wired to storage/email
 * Protected by CRON_SECRET Bearer token
 */
export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  const url = new URL(request.url);
  const forceBackup = url.searchParams.get('backup') === 'true';
  const forceReport = url.searchParams.get('report') === 'true';

  try {
    const now = new Date();
    const isFriday = now.getDay() === 5; // 5 = Friday

    // --------------------------------------------------------------------------
    // A. EVALUATE SMART ALERTS
    // --------------------------------------------------------------------------
    const cheques = db.getCheques();
    const feedback = db.getFeedback();
    const customers = db.getCustomers();
    const tasks = db.getTasks();

    const redAlerts: string[] = [];
    const amberAlerts: string[] = [];

    // Cheques bounced
    const bounced = cheques.filter((c) => c.status === 'BOUNCED');
    if (bounced.length > 0) {
      redAlerts.push(`${bounced.length} cheque(s) marked BOUNCED! Immediate escalation required.`);
    }

    // Customer karma < 20
    const blacklisted = customers.filter((c) => c.karmaScore < 20);
    if (blacklisted.length > 0) {
      redAlerts.push(`${blacklisted.length} customer(s) karma below 20 (Blacklist risk).`);
    }

    // Urgent unassigned complaints
    const urgentUnassigned = feedback.filter(
      (f) => f.type === 'COMPLAINT' && f.priority === 'URGENT' && !f.assignedTo && f.complaintStatus !== 'RESOLVED'
    );
    if (urgentUnassigned.length > 0) {
      redAlerts.push(`${urgentUnassigned.length} URGENT complaint(s) with no assigned handler.`);
    }

    // Cheques delayed/overdue
    const delayed = cheques.filter((c) => c.status === 'DELAYED');
    if (delayed.length > 0) {
      amberAlerts.push(`${delayed.length} cheque(s) delayed or pending bank clearance.`);
    }

    // --------------------------------------------------------------------------
    // B. WEEKLY REPORT EVALUATION (FRIDAYS OR FORCED)
    // --------------------------------------------------------------------------
    let weeklyReportStatus = 'Skipped (Runs only on Fridays)';
    if (isFriday || forceReport) {
      weeklyReportStatus = 'Not sent (email dispatch is not implemented)';
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      cronJob: 'Daily Health, Alerts & Backup',
      alerts: {
        redCount: redAlerts.length,
        amberCount: amberAlerts.length,
        redAlerts,
        amberAlerts,
      },
      weeklyReport: weeklyReportStatus,
      backup: {
        status: 'Not saved (backup storage is not implemented)',
      },
      dataSource: 'process-local application state; not a durable production source',
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Daily cron execution failed.' },
      { status: 500 }
    );
  }
}
