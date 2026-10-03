import { NextResponse } from 'next/server';
import { db } from '@/lib/db/db-service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const cheques = db.getCheques();
    const feedback = db.getFeedback();
    const customers = db.getCustomers();
    const beatItems = db.getTodayBeat();
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
      (c) => c.status === 'DELAYED' && c.notes && c.notes.includes('3 days')
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
    tasks.filter((t) => t.status === 'OPEN').forEach((t) => {
      taskCountByUser[t.assignedToName] = (taskCountByUser[t.assignedToName] || 0) + 1;
    });
    Object.entries(taskCountByUser).forEach(([name, count]) => {
      if (count >= 5) {
        amberAlerts.push(`${name} has ${count} pending operational tasks.`);
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
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error?.message || 'Failed to evaluate alerts' }, { status: 500 });
  }
}
