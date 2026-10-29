import { NextResponse } from 'next/server';
import { openSystemWorkspace } from '@/lib/db/server-workspace';
import { apiFailure } from '../../_workspace';
import { requireCronAuth } from '@/lib/cron-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;
  try {
    const { db } = await openSystemWorkspace();
    const cheques = db.getCheques();
    const feedback = db.getFeedback();
    const customers = db.getCustomers();
    const tasks = db.getTasks();

    const redAlerts: string[] = [];
    const amberAlerts: string[] = [];

    // RED ALERTS
    // 1. Cheque bounced
    const bounced = cheques.filter((c) => c.status === 'BOUNCED');
    if (bounced.length > 0) {
      redAlerts.push(`${bounced.length} cheque(s) marked BOUNCED! Immediate escalation to HQ.`);
    }

    // 2. Customer karma < 20
    const blacklisted = customers.filter((c) => c.karmaScore < 20);
    if (blacklisted.length > 0) {
      redAlerts.push(`${blacklisted.length} customer(s) karma dropped below 20 (Blacklist territory).`);
    }

    // 3. Urgent unassigned complaints
    const urgentUnassigned = feedback.filter(
      (f) => f.type === 'COMPLAINT' && f.priority === 'URGENT' && !f.assignedTo && f.complaintStatus !== 'RESOLVED'
    );
    if (urgentUnassigned.length > 0) {
      redAlerts.push(`${urgentUnassigned.length} URGENT complaint(s) with no assigned handler!`);
    }

    // 4. Cheque overdue 3+ days
    const overdue3d = cheques.filter(
      (c) => c.status === 'DELAYED' && Number.isFinite(Date.parse(c.newExpectedDate || c.cashDateAd)) && Date.parse(c.newExpectedDate || c.cashDateAd) <= Date.now() - 3 * 24 * 60 * 60 * 1000
    );
    if (overdue3d.length > 0) {
      redAlerts.push(`${overdue3d.length} cheque(s) overdue 3+ days (Admin escalation).`);
    }

    // AMBER ALERTS
    // 1. Overdue cheques 1 day
    const pendingCheques = cheques.filter((c) => c.status === 'DELAYED' || c.status === 'PENDING');
    if (pendingCheques.length > 0) {
      amberAlerts.push(`${pendingCheques.length} cheque(s) requiring follow-up or cashing today.`);
    }

    // 2. Officers with 5+ tasks
    const taskCountByUser: Record<string, number> = {};
    const userNames = new Map(db.getUsers().map(user => [user.id, user.fullName]));
    tasks.filter((t) => ['OPEN', 'PENDING', 'IN_PROGRESS', 'OVERDUE'].includes(t.status)).forEach((t) => {
      taskCountByUser[t.assignedTo] = (taskCountByUser[t.assignedTo] || 0) + 1;
    });
    Object.entries(taskCountByUser).forEach(([userId, count]) => {
      if (count >= 5) {
        amberAlerts.push(`${userNames.get(userId) || userId} has ${count} pending operational tasks.`);
      }
    });

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      cron: 'Daily Alerts (8:00 AM NPT)',
      summary: {
        redAlertCount: redAlerts.length,
        amberAlertCount: amberAlerts.length,
        redAlerts,
        amberAlerts,
      },
    });
  } catch (error) { return apiFailure(error, 'Scheduled operation failed.'); }
}
