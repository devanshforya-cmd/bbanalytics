import { after, NextResponse } from 'next/server';
import { flushUserPush } from '@/lib/push-server';
import { openSystemWorkspace } from '@/lib/db/server-workspace';
import { apiFailure } from '../../_workspace';
import { requireCronAuth } from '@/lib/cron-auth';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/db/supabase-server';
import { isSuperAdmin } from '@/lib/permissions';
import { thresholdAlerts } from '@/lib/alert-rules';

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
  const forceReport = url.searchParams.get('report') === 'true';

  try {
    const { db } = await openSystemWorkspace();
    const now = new Date();
    const isFriday = now.getDay() === 5; // 5 = Friday

    // --------------------------------------------------------------------------
    // A. EVALUATE SMART ALERTS
    // --------------------------------------------------------------------------
    const cheques = db.getCheques();
    const feedback = db.getFeedback();
    const customers = db.getCustomers();

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
    amberAlerts.push(...thresholdAlerts({ cheques, stores: [...db.getRetailers(), ...db.getBranches()], visits: db.getVisits(), orders: db.getOrders(), deliveryFailures: db.getDeliveryFailures() }, db.getAlertRules(), now.getTime()));
    const administrators = db.getUsers().filter(user => user.active !== false && isSuperAdmin(user));
    const actor = administrators[0];
    const notifications = administrators.flatMap(user => [...redAlerts.map(message => ({ message, priority: 'URGENT' })), ...amberAlerts.map(message => ({ message, priority: 'MEDIUM' }))].map(alert => {
      const id = `daily_alert_${createHash('sha256').update(`${now.toISOString().slice(0, 10)}:${user.id}:${alert.message}`).digest('hex')}`;
      return { collection: 'notifications', id, created_by: actor.id, version: 1, last_mutation_id: id, data: { id, userId: user.id, title: 'Daily operations alert', ...alert, read: false, entityType: 'systemAlerts', createdAt: now.toISOString() } };
    }));
    if (notifications.length) {
      const { error } = await supabaseAdmin.from('workspace_records').upsert(notifications, { onConflict: 'collection,id', ignoreDuplicates: true });
      if (error) return NextResponse.json({ success: false, error: 'Daily alerts could not be saved.' }, { status: 503 });
    }
    after(async () => {
      for (const user of db.getUsers().filter(user => user.active !== false)) await flushUserPush(user);
      await supabaseAdmin.from('push_deliveries').delete().lt('updated_at', new Date(Date.now() - 7 * 86400000).toISOString());
    });

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
      cronJob: 'Daily health and in-app alerts',
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
      dataSource: 'Supabase workspace records',
    });
  } catch (error) { return apiFailure(error, 'Scheduled operation failed.'); }
}
