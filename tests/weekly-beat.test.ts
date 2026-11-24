import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseService } from '../src/lib/db/db-service';
import { DEFAULT_SUPER_ADMIN } from './fixtures';
import { getTodayAd } from '../src/lib/nepali-calendar';
import { addDaysAd, dayPlan, schedulesOn, setStoreDays, sortDay, weekdayOf, weeklyBeatId } from '../src/lib/weekly-beat';
import type { BeatItem, Cheque, RecurringScheduleEntry, Retailer, Task } from '../src/lib/types';

test('weekdays are read from the AD date the same way everywhere', () => {
  assert.equal(weekdayOf('2026-11-22'), 'SUN');
  assert.equal(weekdayOf('2026-11-28'), 'SAT');
  assert.equal(addDaysAd('2026-11-30', 1), '2026-12-01');
});

test('standing stops apply on their weekdays, every week, until changed or paused', () => {
  const entry: RecurringScheduleEntry = { id: 's1', officerId: 'u1', storeId: 'r1', storeName: 'Bhatbhateni', entityType: 'RETAILER', daysOfWeek: ['SUN', 'WED'], priority: 'MEDIUM' };
  assert.equal(schedulesOn([entry], '2026-11-22').length, 1);
  assert.equal(schedulesOn([entry], '2026-11-29').length, 1, 'next week too');
  assert.equal(schedulesOn([entry], '2026-11-23').length, 0, 'not Monday');
  assert.equal(schedulesOn([{ ...entry, active: false }], '2026-11-22').length, 0);
  assert.equal(schedulesOn([{ ...entry, endDateAd: '2026-11-25' }], '2026-11-29').length, 0);

  let list = [entry];
  const add = setStoreDays(list, { officerId: 'u1', storeId: 'r1', storeName: 'Bhatbhateni', entityType: 'RETAILER', day: 'FRI', on: true, newId: () => 'x' });
  assert.deepEqual(add.save!.daysOfWeek, ['SUN', 'WED', 'FRI']);
  list = [add.save!];
  assert.deepEqual(setStoreDays(list, { officerId: 'u1', storeId: 'r1', storeName: '', entityType: 'RETAILER', day: 'SUN', on: false, newId: () => 'x' }).save!.daysOfWeek, ['WED', 'FRI']);
  const single = [{ ...entry, daysOfWeek: ['SUN' as const] }];
  assert.deepEqual(setStoreDays(single, { officerId: 'u1', storeId: 'r1', storeName: '', entityType: 'RETAILER', day: 'SUN', on: false, newId: () => 'x' }), { remove: 's1' });
});

test('the day sorts by the priority each stop was given', () => {
  const beat = (id: string, priority: BeatItem['priority'], sequence: number) => ({ id, priority, sequence });
  assert.deepEqual(sortDay([beat('a', 'ROUTINE', 1), beat('b', 'HIGH', 3), beat('c', 'MEDIUM', 2), beat('d', 'HIGH', 1)]).map((b) => b.id), ['d', 'b', 'c', 'a']);
});

test('jobs at a store on the route join that stop; cash clearing and deposits are errands in priority order', () => {
  const dateAd = '2026-11-24';
  const beats = [{ id: 'b1', officerId: 'u1', dateAd, entityId: 'r1', storeName: 'Store 1', priority: 'ROUTINE', sequence: 1 } as BeatItem];
  const tasks: Task[] = [
    { id: 't1', title: 'Pick up the shelf talkers', assignedTo: 'u1', assignedToName: 'Ram', createdBy: 'M', priority: 'LOW', dueDateAd: dateAd, dueDateBs: '', status: 'PENDING', autoCreated: false, createdAt: '', storeId: 'r1', kind: 'OTHER' },
    { id: 't2', title: 'Deposit NPR 45,000 at NIC Asia', assignedTo: 'u1', assignedToName: 'Ram', createdBy: 'M', priority: 'HIGH', dueDateAd: dateAd, dueDateBs: '', status: 'PENDING', autoCreated: false, createdAt: '', kind: 'CASH_CLEARING' },
    { id: 't3', title: 'Later', assignedTo: 'u1', assignedToName: 'Ram', createdBy: 'M', priority: 'HIGH', dueDateAd: '2026-11-30', dueDateBs: '', status: 'PENDING', autoCreated: false, createdAt: '' },
    { id: 't4', title: 'Overdue low job', assignedTo: 'u1', assignedToName: 'Ram', createdBy: 'M', priority: 'LOW', dueDateAd: '2026-11-20', dueDateBs: '', status: 'PENDING', autoCreated: false, createdAt: '' },
  ];
  const cheques = [{ id: 'c1', officerId: 'u1', status: 'COLLECTED_IN_FIELD', chequeNumber: '0049', storeName: 'Store 9', bankName: 'NIC', amount: 25000, cashDateAd: '2026-11-30' } as Cheque];
  const plan = dayPlan({ officerId: 'u1', dateAd, beats, tasks, cheques, documents: [], dispatches: [] });
  assert.deepEqual(plan.stops[0].jobs.map((job) => job.taskId), ['t1']);
  assert.deepEqual(plan.errands.map((job) => job.id), ['task:t2', 'task:t4', 'cheque:c1']);
  assert.ok(!plan.errands.some((job) => job.taskId === 't3'), 'future jobs wait for their day');
  assert.equal(plan.errands.find((job) => job.taskId === 't4')!.priority, 'HIGH', 'overdue work moves up');
  assert.equal(plan.errands.at(-1)!.kind, 'CASH_CLEARING', 'the cheque is a medium-priority errand after the high ones');
});

test('a store with no pin can be on a weekly route and one-time stops; today gets its stop once', () => {
  const db = new DatabaseService({ server: true });
  const retailer = { id: 'r1', name: 'Corner Store', type: 'GT', storeType: 'STANDALONE_RETAILER', city: 'Kathmandu', area: 'Baneshwor', address: 'Baneshwor', lat: 0, lng: 0, assignedOfficerId: 'u1', brandsStocked: [], contacts: [] } as unknown as Retailer;
  const rider = { ...DEFAULT_SUPER_ADMIN, id: 'u1', fullName: 'Ram Rider', isSuperAdmin: false, is_super_admin: false };
  db.hydrateSnapshot({ retailers: [retailer], products: [], combos: [], orders: [], customers: [], influencers: [] } as any, DEFAULT_SUPER_ADMIN);
  db.replaceUsers([DEFAULT_SUPER_ADMIN, rider] as any);
  const today = getTodayAd();
  db.setWeeklyStop({ officerId: 'u1', storeId: 'r1', day: weekdayOf(today), on: true, priority: 'HIGH' });
  const todays = db.getBeatItemsFor('u1').filter((beat) => beat.dateAd === today);
  assert.equal(todays.length, 1);
  assert.equal(todays[0].id, weeklyBeatId(db.getRecurringSchedules('u1')[0].id, today));
  assert.equal(todays[0].lat, undefined, '(0, 0) is not a pin');
  assert.equal(db.ensureWeeklyBeats(today).length, 0, 'never twice');
  assert.doesNotThrow(() => db.addOneTimeBeatOverride('u1', 'r1', addDaysAd(today, 1)));
  assert.doesNotThrow(() => db.createAndAssignBeatRoute({ officerId: 'u1', dateAd: addDaysAd(today, 2), storeIds: ['r1'] }));
  const visit = db.checkInBeat(todays[0].id, 27.7, 85.3);
  assert.equal(db.getBeatItemsFor('u1').find((beat) => beat.id === todays[0].id)!.checkInDistanceM, undefined, 'no distance without a pin');
  assert.equal(visit.lat, 27.7);
  // Taking today off removes the untouched stop only.
  db.setWeeklyStop({ officerId: 'u1', storeId: 'r1', day: weekdayOf(today), on: false });
  assert.equal(db.getRecurringSchedules('u1').length, 0);
  assert.equal(db.getBeatItemsFor('u1').some((beat) => beat.id === todays[0].id), true, 'a visited stop stays in the history');
});
