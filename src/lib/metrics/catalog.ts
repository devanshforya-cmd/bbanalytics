/**
 * Every number the app reports, defined once: what it counts, how, who may see it and how it can be split.
 * Pages, dashboards and downloads all read from here, so a number means the same thing everywhere.
 */
import type { Order } from '../types';
import { hasDeliveryOutcome, isOpenOrder } from '../order-status';
import { dispatchStatus } from '../dispatch-flow';
import { outcomeInfo } from '../follow-ups';
import { awaitingGoods, OPEN_STAGES, ticketStageOf, ticketTypeOf } from '../order-tickets';
import { chequeIsOverdue, helpers, type OrderLineRow, type Prepared, type SourceKey, type StockLineRow, type StoreLineRow } from './sources';
import type { CallLog, Cheque, CustomerCall, Dispatch, FeedbackEntry, MarketingSend, SecondaryOrder, Task, BeatItem, Visit, ReturnEntry, Customer } from '../types';
import type { FollowUpItem } from '../follow-ups';

export type Unit = 'count' | 'npr' | 'pct' | 'days' | 'units' | 'minutes' | 'per100' | 'rating';
export const AREAS = ['Online sales', 'Delivery', 'Returns and complaints', 'Customers', 'Customer calls', 'Marketing', 'Store sales', 'Dispatch and payments', 'Stock at stores', 'Field team', 'Tasks'] as const;
export type Area = typeof AREAS[number];

interface Base {
  key: string;
  label: string;
  area: Area;
  /** How it is worked out, in plain words. Shown next to the number. */
  description: string;
  unit: Unit;
  /** Whether a rise is good news. */
  better: 'up' | 'down' | 'none';
  /** Any one of these pages or features lets a person see it. */
  access: string[];
  /** Shows money amounts: needs Money access. */
  money?: boolean;
  /** A count of how things stand right now: the date range does not apply. */
  snapshot?: boolean;
}
export interface SimpleMetric<T = any> extends Base {
  source: SourceKey;
  agg: 'count' | 'sum' | 'avg' | 'distinct';
  where?: (row: T, p: Prepared) => boolean;
  value?: (row: T, p: Prepared) => number | null | undefined;
  distinct?: (row: T, p: Prepared) => string | undefined;
  /** Uses another date than the record's own (for example the day it was delivered). */
  date?: (row: T, p: Prepared) => string | undefined;
}
export interface RatioMetric extends Base { num: string; den: string; scale?: number }
export type MetricDef = SimpleMetric | RatioMetric;
export const isRatio = (m: MetricDef): m is RatioMetric => 'num' in m;

const ONLINE = ['orderflow', 'order_desk'];
const REVIEWS = ['reviews'];
const STORES = ['dispatches', 'beat_plans'];
const sale = (o: Order) => helpers.countsAsSale(o);
const discountOf = (o: Order) => o.items.reduce((sum, item) => { const m = helpers.lineMoney(item); return sum + (item.isGift ? 0 : m.offer + m.customer); }, 0) / 100;
const reached = (c: CustomerCall) => !!outcomeInfo(c.outcome)?.reached;
const lateDays = 4;

const m = <T,>(def: SimpleMetric<T>) => def;

export const METRICS: MetricDef[] = [
  // ---------------------------------------------------------------- Online sales
  m<Order>({ key: 'online_orders', label: 'Online orders', area: 'Online sales', unit: 'count', better: 'up', access: ONLINE, source: 'orders', agg: 'count', where: sale,
    description: 'Online orders placed in the period. Cancelled orders, influencer gifts and exchange replacements are not counted.' }),
  m<Order>({ key: 'online_revenue', label: 'Online sales value', area: 'Online sales', unit: 'npr', better: 'up', access: ONLINE, money: true, source: 'orders', agg: 'sum', where: sale, value: (o) => o.totalAmount,
    description: 'What customers pay for the orders above, after offers and discounts.' }),
  m<OrderLineRow>({ key: 'online_units', label: 'Units sold online', area: 'Online sales', unit: 'units', better: 'up', access: ONLINE, source: 'orderLines', agg: 'sum', value: (r) => r.item.quantity,
    description: 'Product units in the orders above. Free gifts are not counted.' }),
  { key: 'online_aov', label: 'Average order value', area: 'Online sales', unit: 'npr', better: 'up', access: ONLINE, money: true, num: 'online_revenue', den: 'online_orders',
    description: 'Online sales value ÷ online orders.' },
  m<Order>({ key: 'online_new_customer_orders', label: 'Orders from new customers', area: 'Online sales', unit: 'count', better: 'up', access: ONLINE, source: 'orders', agg: 'count', where: (o, p) => sale(o) && !!p.orderHistory.get(o.id)?.first,
    description: 'Orders that were the customer’s first purchase with us (matched by phone number).' }),
  m<Order>({ key: 'online_repeat_orders', label: 'Orders from repeat customers', area: 'Online sales', unit: 'count', better: 'up', access: ONLINE, source: 'orders', agg: 'count', where: (o, p) => sale(o) && p.orderHistory.get(o.id)?.first === false,
    description: 'Orders from customers who had bought from us before (matched by phone number).' }),
  { key: 'online_repeat_share', label: 'Repeat order share', area: 'Online sales', unit: 'pct', better: 'up', access: ONLINE, num: 'online_repeat_orders', den: 'online_orders', scale: 100,
    description: 'Orders from repeat customers ÷ all online orders.' },
  m<Order>({ key: 'online_orders_placed', label: 'Orders placed (incl. cancelled)', area: 'Online sales', unit: 'count', better: 'none', access: ONLINE, source: 'orders', agg: 'count', where: (o) => !o.exchangeReturnId && !o.exchangeRequested,
    description: 'Every online order placed, cancelled ones included. Gifts and exchange replacements are left out.' }),
  m<Order>({ key: 'online_cancelled', label: 'Cancelled orders', area: 'Online sales', unit: 'count', better: 'down', access: ONLINE, source: 'orders', agg: 'count', where: (o) => o.status === 'CANCELLED' && !o.exchangeReturnId,
    description: 'Online orders marked cancelled.' }),
  { key: 'online_cancel_rate', label: 'Cancellation rate', area: 'Online sales', unit: 'pct', better: 'down', access: ONLINE, num: 'online_cancelled', den: 'online_orders_placed', scale: 100,
    description: 'Cancelled orders ÷ orders placed.' },
  m<Order>({ key: 'online_discount', label: 'Discounts given', area: 'Online sales', unit: 'npr', better: 'none', access: ONLINE, money: true, source: 'orders', agg: 'sum', where: sale, value: discountOf,
    description: 'Offer discounts plus discounts given to individual customers, against the listed price.' }),
  m<Order>({ key: 'online_listed_value', label: 'Sales at listed price', area: 'Online sales', unit: 'npr', better: 'up', access: ONLINE, money: true, source: 'orders', agg: 'sum', where: sale, value: (o) => o.totalAmount + discountOf(o),
    description: 'What the orders would have cost at listed prices, before any discount.' }),
  { key: 'online_discount_rate', label: 'Discount rate', area: 'Online sales', unit: 'pct', better: 'down', access: ONLINE, money: true, num: 'online_discount', den: 'online_listed_value', scale: 100,
    description: 'Discounts given ÷ sales at listed price.' },
  m<Order>({ key: 'online_offer_orders', label: 'Orders using an offer', area: 'Online sales', unit: 'count', better: 'none', access: ONLINE, source: 'orders', agg: 'count', where: (o) => sale(o) && !!o.appliedOffers?.length,
    description: 'Orders priced by a running sale or offer.' }),
  m<Order>({ key: 'online_cod_orders', label: 'Cash-on-delivery orders', area: 'Online sales', unit: 'count', better: 'none', access: ONLINE, source: 'orders', agg: 'count', where: (o) => sale(o) && /cod/i.test(o.paymentTerms),
    description: 'Orders the customer pays for on delivery.' }),
  { key: 'online_cod_share', label: 'Cash-on-delivery share', area: 'Online sales', unit: 'pct', better: 'none', access: ONLINE, num: 'online_cod_orders', den: 'online_orders', scale: 100,
    description: 'Cash-on-delivery orders ÷ all online orders.' },
  m<Order>({ key: 'online_open_orders', label: 'Orders not yet delivered', area: 'Online sales', unit: 'count', better: 'down', access: ONLINE, snapshot: true, source: 'orders', agg: 'count', where: (o) => sale(o) && isOpenOrder(o.status),
    description: 'Orders still pending, dispatched or failed right now. The date range does not apply.' }),
  m<Order>({ key: 'online_unconfirmed', label: 'Dispatched, not marked delivered', area: 'Online sales', unit: 'count', better: 'down', access: ONLINE, snapshot: true, source: 'orders', agg: 'count',
    where: (o, p) => sale(o) && o.status === 'DISPATCHED' && (o.dispatchedDateAd || o.orderDateAd) <= helpers.addDaysAd(p.data.today, -lateDays),
    description: `Orders dispatched more than ${lateDays} days ago that are still not marked delivered. Mark them on All orders so delivery numbers stay right.` }),

  // ---------------------------------------------------------------- Delivery
  m<Order>({ key: 'delivered_orders', label: 'Delivered orders', area: 'Delivery', unit: 'count', better: 'up', access: ONLINE, source: 'orders', agg: 'count', where: (o) => sale(o) && o.status === 'DELIVERED',
    description: 'Orders placed in the period that are now marked delivered.' }),
  m<Order>({ key: 'orders_with_outcome', label: 'Orders with a delivery result', area: 'Delivery', unit: 'count', better: 'none', access: ONLINE, source: 'orders', agg: 'count', where: (o) => sale(o) && hasDeliveryOutcome(o.status),
    description: 'Orders that were delivered, failed, returned or exchanged. Pending and on-the-way orders are not counted yet.' }),
  { key: 'delivery_success_rate', label: 'Delivery success rate', area: 'Delivery', unit: 'pct', better: 'up', access: ONLINE, num: 'delivered_orders', den: 'orders_with_outcome', scale: 100,
    description: 'Delivered orders ÷ orders with a delivery result.' },
  m({ key: 'delivery_failures', label: 'Failed deliveries', area: 'Delivery', unit: 'count', better: 'down', access: ONLINE, source: 'deliveryFailures', agg: 'count',
    description: 'Delivery failures logged in the period.' }),
  { key: 'delivery_failure_rate', label: 'Failed delivery rate', area: 'Delivery', unit: 'pct', better: 'down', access: ONLINE, num: 'delivery_failures', den: 'online_orders', scale: 100,
    description: 'Failed deliveries ÷ online orders in the same period.' },
  m<Order>({ key: 'days_to_dispatch', label: 'Days to dispatch', area: 'Delivery', unit: 'days', better: 'down', access: ONLINE, source: 'orders', agg: 'avg',
    where: (o) => sale(o) && !!o.dispatchedDateAd, value: (o) => Math.max(0, helpers.daysBetweenAd(o.orderDateAd, o.dispatchedDateAd!)),
    description: 'Average days from order to dispatch, for orders with a dispatch date.' }),
  m<Order>({ key: 'days_to_deliver', label: 'Days to deliver', area: 'Delivery', unit: 'days', better: 'down', access: ONLINE, source: 'orders', agg: 'avg',
    where: (o) => sale(o) && !!o.deliveredDateAd, value: (o) => Math.max(0, helpers.daysBetweenAd(o.orderDateAd, o.deliveredDateAd!)),
    description: 'Average days from order to delivery, for orders marked delivered with a date.' }),

  // ---------------------------------------------------------------- Returns and complaints
  m<ReturnEntry>({ key: 'returns', label: 'Returns logged', area: 'Returns and complaints', unit: 'count', better: 'down', access: [...REVIEWS, 'order_desk'], source: 'returns', agg: 'count',
    description: 'Returns and exchanges logged in the period.' }),
  m<ReturnEntry>({ key: 'returned_units', label: 'Units returned', area: 'Returns and complaints', unit: 'units', better: 'down', access: [...REVIEWS, 'order_desk'], source: 'returns', agg: 'sum', value: (r) => r.quantity,
    description: 'Product units in the returns above.' }),
  { key: 'return_rate', label: 'Return rate', area: 'Returns and complaints', unit: 'pct', better: 'down', access: [...REVIEWS, 'order_desk'], num: 'returned_units', den: 'online_units', scale: 100,
    description: 'Units returned ÷ units sold online in the same period.' },
  m<ReturnEntry>({ key: 'rto_parcels', label: 'Returned to origin (RTO)', area: 'Delivery', unit: 'count', better: 'down', access: [...ONLINE, ...REVIEWS], source: 'orderIssues', agg: 'count',
    where: (r) => ticketTypeOf(r) === 'RTO' && ticketStageOf(r) !== 'REJECTED', description: 'Parcels marked returned-to-warehouse after a failed delivery, by the day they were marked.' }),
  { key: 'rto_rate', label: 'RTO rate', area: 'Delivery', unit: 'pct', better: 'down', access: [...ONLINE, ...REVIEWS], num: 'rto_parcels', den: 'online_orders', scale: 100,
    description: 'RTO parcels ÷ online orders in the same period.' },
  m<ReturnEntry>({ key: 'rto_not_back', label: 'RTO parcels not back', area: 'Delivery', unit: 'count', better: 'down', access: [...ONLINE, ...REVIEWS], snapshot: true, source: 'orderIssues', agg: 'count',
    where: (r) => ticketTypeOf(r) === 'RTO' && awaitingGoods(r), description: 'RTO parcels not yet checked in at the warehouse, right now.' }),
  m<ReturnEntry>({ key: 'packing_errors', label: 'Packing errors', area: 'Returns and complaints', unit: 'count', better: 'down', access: [...REVIEWS, 'order_desk', ...ONLINE], source: 'orderIssues', agg: 'count',
    where: (r) => (ticketTypeOf(r) === 'SHORT_SHIPPED' || ticketTypeOf(r) === 'WRONG_ITEM') && ticketStageOf(r) !== 'REJECTED', description: 'Short-shipped and wrong-item tickets logged in the period. Not counted as returns.' }),
  { key: 'packing_error_rate', label: 'Packing error rate', area: 'Returns and complaints', unit: 'pct', better: 'down', access: [...REVIEWS, 'order_desk', ...ONLINE], num: 'packing_errors', den: 'online_orders', scale: 100,
    description: 'Packing errors ÷ online orders in the same period.' },
  m<ReturnEntry>({ key: 'open_tickets', label: 'Open order-issue tickets', area: 'Returns and complaints', unit: 'count', better: 'down', access: [...REVIEWS, 'order_desk'], snapshot: true, source: 'orderIssues', agg: 'count',
    where: (r) => OPEN_STAGES.includes(ticketStageOf(r)), description: 'Returns, exchanges, packing errors and RTO tickets still being worked, right now.' }),
  m<ReturnEntry>({ key: 'tickets_awaiting_goods', label: 'Goods not back yet', area: 'Returns and complaints', unit: 'count', better: 'down', access: [...REVIEWS, 'order_desk'], snapshot: true, source: 'orderIssues', agg: 'count',
    where: (r) => awaitingGoods(r), description: 'Tickets where products are expected back at the warehouse and have not been checked in.' }),
  m<FeedbackEntry>({ key: 'complaints', label: 'Complaints', area: 'Returns and complaints', unit: 'count', better: 'down', access: REVIEWS, source: 'feedback', agg: 'count', where: (f) => f.type === 'COMPLAINT',
    description: 'Complaints received in the period.' }),
  { key: 'complaints_per_100', label: 'Complaints per 100 orders', area: 'Returns and complaints', unit: 'per100', better: 'down', access: REVIEWS, num: 'complaints', den: 'online_orders', scale: 100,
    description: 'Complaints ÷ online orders, × 100.' },
  m<FeedbackEntry>({ key: 'open_complaints', label: 'Open complaints', area: 'Returns and complaints', unit: 'count', better: 'down', access: REVIEWS, snapshot: true, source: 'feedback', agg: 'count',
    where: (f) => f.type === 'COMPLAINT' && f.complaintStatus !== 'RESOLVED' && f.complaintStatus !== 'CLOSED',
    description: 'Complaints not yet resolved, right now.' }),
  m<FeedbackEntry>({ key: 'complaints_resolved', label: 'Complaints resolved', area: 'Returns and complaints', unit: 'count', better: 'up', access: REVIEWS, source: 'feedback', agg: 'count',
    where: (f) => f.type === 'COMPLAINT' && (f.complaintStatus === 'RESOLVED' || f.complaintStatus === 'CLOSED'),
    description: 'Complaints received in the period that are now resolved.' }),
  m<FeedbackEntry>({ key: 'days_to_resolve', label: 'Days to resolve a complaint', area: 'Returns and complaints', unit: 'days', better: 'down', access: REVIEWS, source: 'feedback', agg: 'avg',
    where: (f) => f.type === 'COMPLAINT' && !!f.history?.some((h) => h.newStatus === 'RESOLVED' || h.newStatus === 'CLOSED'),
    value: (f) => { const done = f.history!.find((h) => h.newStatus === 'RESOLVED' || h.newStatus === 'CLOSED')!; return Math.max(0, helpers.daysBetweenAd(f.dateReceivedAd, done.timestamp.slice(0, 10))); },
    description: 'Average days from receiving a complaint to marking it resolved.' }),
  m<FeedbackEntry>({ key: 'reviews_positive', label: 'Positive reviews', area: 'Returns and complaints', unit: 'count', better: 'up', access: REVIEWS, source: 'feedback', agg: 'count', where: (f) => f.sentiment === 'POSITIVE',
    description: 'Reviews and feedback marked positive.' }),
  m<FeedbackEntry>({ key: 'avg_rating', label: 'Average rating', area: 'Returns and complaints', unit: 'rating', better: 'up', access: REVIEWS, source: 'feedback', agg: 'avg', where: (f) => !!f.rating, value: (f) => f.rating,
    description: 'Average of the 1 to 5 star ratings customers gave.' }),

  // ---------------------------------------------------------------- Customers
  m<Order>({ key: 'active_customers', label: 'Customers who ordered', area: 'Customers', unit: 'count', better: 'up', access: ['customers', ...ONLINE], source: 'orders', agg: 'distinct', where: sale, distinct: (o) => o.customerPhone.replace(/\D/g, '').slice(-10) || o.customerName,
    description: 'Different customers (by phone number) with at least one order in the period.' }),
  m<Order>({ key: 'new_customers', label: 'New customers', area: 'Customers', unit: 'count', better: 'up', access: ['customers', ...ONLINE], source: 'orders', agg: 'count', where: (o, p) => sale(o) && !!p.orderHistory.get(o.id)?.first,
    description: 'Customers whose first ever order falls in the period.' }),
  m<Order>({ key: 'returning_customers', label: 'Returning customers', area: 'Customers', unit: 'count', better: 'up', access: ['customers', ...ONLINE], source: 'orders', agg: 'distinct',
    where: (o, p) => sale(o) && p.orderHistory.get(o.id)?.first === false, distinct: (o) => o.customerPhone.replace(/\D/g, '').slice(-10) || o.customerName,
    description: 'Different customers who ordered in the period and had ordered before.' }),
  { key: 'repeat_customer_rate', label: 'Repeat customer rate', area: 'Customers', unit: 'pct', better: 'up', access: ['customers', ...ONLINE], num: 'returning_customers', den: 'active_customers', scale: 100,
    description: 'Returning customers ÷ customers who ordered.' },
  { key: 'revenue_per_customer', label: 'Sales per customer', area: 'Customers', unit: 'npr', better: 'up', access: ['customers', ...ONLINE], money: true, num: 'online_revenue', den: 'active_customers',
    description: 'Online sales value ÷ customers who ordered.' },
  m<Order>({ key: 'days_between_orders', label: 'Days between orders', area: 'Customers', unit: 'days', better: 'down', access: ['customers', ...ONLINE], source: 'orders', agg: 'avg',
    where: (o, p) => sale(o) && p.orderHistory.get(o.id)?.gapDays !== undefined, value: (o, p) => p.orderHistory.get(o.id)!.gapDays,
    description: 'For repeat orders, the average days since that customer’s previous order.' }),
  m<Customer>({ key: 'customers_at_risk', label: 'Customers at risk', area: 'Customers', unit: 'count', better: 'down', access: ['customers'], snapshot: true, source: 'customers', agg: 'count', where: (c) => c.segment === 'AT_RISK',
    description: 'Customers in the at-risk segment right now (gone quiet or had problems).' }),
  m<Customer>({ key: 'vip_customers', label: 'VIP and loyal customers', area: 'Customers', unit: 'count', better: 'up', access: ['customers'], snapshot: true, source: 'customers', agg: 'count', where: (c) => c.segment === 'VIP' || c.segment === 'LOYAL',
    description: 'Customers in the VIP or loyal segment right now.' }),

  // ---------------------------------------------------------------- Customer calls
  m<CustomerCall>({ key: 'customer_calls', label: 'Customer calls made', area: 'Customer calls', unit: 'count', better: 'up', access: ['customer_calls'], source: 'customerCalls', agg: 'count',
    description: 'Calls to online customers logged in the period, follow-ups and others.' }),
  m<CustomerCall>({ key: 'customer_calls_reached', label: 'Calls that reached the customer', area: 'Customer calls', unit: 'count', better: 'up', access: ['customer_calls'], source: 'customerCalls', agg: 'count', where: reached,
    description: 'Calls where we spoke to the customer.' }),
  { key: 'customer_reach_rate', label: 'Reach rate', area: 'Customer calls', unit: 'pct', better: 'up', access: ['customer_calls'], num: 'customer_calls_reached', den: 'customer_calls', scale: 100,
    description: 'Calls that reached the customer ÷ calls made.' },
  m<CustomerCall>({ key: 'calls_reordered', label: 'Calls ending in a new order', area: 'Customer calls', unit: 'count', better: 'up', access: ['customer_calls'], source: 'customerCalls', agg: 'count', where: (c) => c.outcome === 'REORDER',
    description: 'Calls logged as “ordered again”.' }),
  m<CustomerCall>({ key: 'calls_with_problem', label: 'Calls finding a problem', area: 'Customer calls', unit: 'count', better: 'down', access: ['customer_calls'], source: 'customerCalls', agg: 'count', where: (c) => c.outcome === 'ISSUE',
    description: 'Calls logged as “has a problem”.' }),
  m<FollowUpItem>({ key: 'followups_due', label: 'Follow-up calls due', area: 'Customer calls', unit: 'count', better: 'down', access: ['customer_calls'], snapshot: true, source: 'followUps', agg: 'count', where: (f) => f.status === 'DUE',
    description: 'Follow-up calls due today or earlier and not yet done.' }),
  m<FollowUpItem>({ key: 'followups_overdue', label: 'Follow-up calls overdue', area: 'Customer calls', unit: 'count', better: 'down', access: ['customer_calls'], snapshot: true, source: 'followUps', agg: 'count', where: (f) => f.status === 'DUE' && f.overdueDays > 0,
    description: 'Follow-up calls past their day and not yet done.' }),
  m<FollowUpItem>({ key: 'followups_done', label: 'Follow-up calls done', area: 'Customer calls', unit: 'count', better: 'up', access: ['customer_calls'], source: 'followUps', agg: 'count', where: (f) => f.status === 'DONE',
    description: 'Follow-up calls completed in the period (dated by the call that completed them).' }),
  m<FollowUpItem>({ key: 'followups_not_reached', label: 'Follow-ups not reached', area: 'Customer calls', unit: 'count', better: 'down', access: ['customer_calls'], snapshot: true, source: 'followUps', agg: 'count', where: (f) => f.status === 'NOT_REACHED',
    description: 'Follow-up calls given up on after the set number of unanswered tries.' }),

  // ---------------------------------------------------------------- Marketing
  m<MarketingSend>({ key: 'marketing_sends', label: 'Products sent to influencers', area: 'Marketing', unit: 'count', better: 'none', access: ['marketing'], source: 'marketingSends', agg: 'count', where: (s) => s.status !== 'CANCELLED',
    description: 'Marketing sends made in the period (cancelled ones left out).' }),
  m<MarketingSend>({ key: 'marketing_units', label: 'Units sent to influencers', area: 'Marketing', unit: 'units', better: 'none', access: ['marketing'], source: 'marketingSends', agg: 'sum', where: (s) => s.status !== 'CANCELLED', value: (s) => s.items.reduce((sum, i) => sum + (i.quantity || 0), 0),
    description: 'Product units in those sends.' }),
  m<MarketingSend>({ key: 'marketing_content_received', label: 'Sends with content received', area: 'Marketing', unit: 'count', better: 'up', access: ['marketing'], source: 'marketingSends', agg: 'count', where: (s) => s.status === 'CONTENT_RECEIVED',
    description: 'Sends where the influencer posted and the content is linked.' }),
  { key: 'marketing_content_rate', label: 'Content received rate', area: 'Marketing', unit: 'pct', better: 'up', access: ['marketing'], num: 'marketing_content_received', den: 'marketing_sends', scale: 100,
    description: 'Sends with content received ÷ sends.' },
  m<MarketingSend>({ key: 'marketing_content_late', label: 'Content late', area: 'Marketing', unit: 'count', better: 'down', access: ['marketing'], snapshot: true, source: 'marketingSends', agg: 'count',
    where: (s, p) => s.status === 'SENT' && !!s.expectedContentDateAd && s.expectedContentDateAd < p.data.today,
    description: 'Sends still waiting for content after the expected date, right now.' }),

  // ---------------------------------------------------------------- Store sales
  m<SecondaryOrder>({ key: 'store_orders', label: 'Store orders', area: 'Store sales', unit: 'count', better: 'up', access: STORES, source: 'storeOrders', agg: 'count', where: (o) => o.status !== 'CANCELLED',
    description: 'Orders taken from stores, distributors and chain outlets (cancelled left out).' }),
  m<SecondaryOrder>({ key: 'store_order_value', label: 'Store order value', area: 'Store sales', unit: 'npr', better: 'up', access: STORES, money: true, source: 'storeOrders', agg: 'sum', where: (o) => o.status !== 'CANCELLED', value: (o) => o.totalAmount,
    description: 'Value of the store orders above, at the store’s price.' }),
  m<StoreLineRow>({ key: 'store_units', label: 'Units ordered by stores', area: 'Store sales', unit: 'units', better: 'up', access: STORES, source: 'storeOrderLines', agg: 'sum', value: (r) => r.item.totalUnits,
    description: 'Product units in store orders.' }),
  m<StoreLineRow>({ key: 'store_line_value', label: 'Store order value by product', area: 'Store sales', unit: 'npr', better: 'up', access: STORES, money: true, source: 'storeOrderLines', agg: 'sum', value: (r) => r.item.totalAmount,
    description: 'Store order value counted line by line, so it can be split by product and brand.' }),
  { key: 'store_avg_order', label: 'Average store order', area: 'Store sales', unit: 'npr', better: 'up', access: STORES, money: true, num: 'store_order_value', den: 'store_orders',
    description: 'Store order value ÷ store orders.' },
  m<SecondaryOrder>({ key: 'ordering_stores', label: 'Stores that ordered', area: 'Store sales', unit: 'count', better: 'up', access: STORES, source: 'storeOrders', agg: 'distinct', where: (o) => o.status !== 'CANCELLED', distinct: (o) => o.entityId,
    description: 'Different stores with at least one order in the period.' }),
  m({ key: 'store_count', label: 'Stores on our books', area: 'Store sales', unit: 'count', better: 'up', access: ['stores', ...STORES], snapshot: true, source: 'stores', agg: 'count',
    description: 'Stores, chain outlets and distributors we supply, right now.' }),
  { key: 'store_active_share', label: 'Share of stores ordering', area: 'Store sales', unit: 'pct', better: 'up', access: ['stores', ...STORES], num: 'ordering_stores', den: 'store_count', scale: 100,
    description: 'Stores that ordered in the period ÷ stores on our books.' },
  m<{ id: string }>({ key: 'dormant_stores', label: 'Stores with no order in 30 days', area: 'Store sales', unit: 'count', better: 'down', access: ['stores', ...STORES], snapshot: true, source: 'stores', agg: 'count',
    where: (s, p) => (p.lastStoreOrder.get(s.id) || '') < helpers.addDaysAd(p.data.today, -30),
    description: 'Stores whose last order is more than 30 days ago, or that never ordered.' }),

  // ---------------------------------------------------------------- Dispatch and payments
  m<Dispatch>({ key: 'dispatches_open', label: 'Dispatch orders in progress', area: 'Dispatch and payments', unit: 'count', better: 'down', access: ['dispatches'], snapshot: true, source: 'dispatches', agg: 'count',
    where: (d) => !['DELIVERED', 'CANCELLED'].includes(dispatchStatus(d)),
    description: 'Dispatch orders received, packed or on the way, right now.' }),
  m<Dispatch>({ key: 'dispatch_days_to_deliver', label: 'Days from store order to delivery', area: 'Dispatch and payments', unit: 'days', better: 'down', access: ['dispatches'], source: 'dispatches', agg: 'avg',
    where: (d) => dispatchStatus(d) === 'DELIVERED' && !!d.deliveredDateAd && !!(d.orderDateAd || d.dispatchDateAd),
    value: (d) => Math.max(0, helpers.daysBetweenAd(d.orderDateAd || d.dispatchDateAd, d.deliveredDateAd!)),
    description: 'Average days from a store order to its delivery.' }),
  m<Dispatch>({ key: 'dispatches_cancelled', label: 'Cancelled dispatch orders', area: 'Dispatch and payments', unit: 'count', better: 'down', access: ['dispatches'], source: 'dispatches', agg: 'count', where: (d) => dispatchStatus(d) === 'CANCELLED',
    description: 'Dispatch orders cancelled.' }),
  m<Dispatch>({ key: 'money_due', label: 'Money due from stores', area: 'Dispatch and payments', unit: 'npr', better: 'down', access: ['dispatches'], money: true, snapshot: true, source: 'dispatches', agg: 'sum',
    where: (d) => !!d.paymentStatus && d.paymentStatus !== 'COLLECTED' && dispatchStatus(d) !== 'CANCELLED', value: (d) => d.amountDue ?? d.totalAmount ?? 0,
    description: 'Payment still to collect on dispatched orders, right now.' }),
  m<Dispatch>({ key: 'money_overdue', label: 'Money overdue from stores', area: 'Dispatch and payments', unit: 'npr', better: 'down', access: ['dispatches'], money: true, snapshot: true, source: 'dispatches', agg: 'sum',
    where: (d, p) => !!d.paymentStatus && d.paymentStatus !== 'COLLECTED' && dispatchStatus(d) !== 'CANCELLED' && !!d.paymentDueDateAd && d.paymentDueDateAd < p.data.today, value: (d) => d.amountDue ?? d.totalAmount ?? 0,
    description: 'Payment past its due date and not collected. Split by “How late” to see how old it is.' }),
  m<Cheque>({ key: 'cheques_received', label: 'Cheques received', area: 'Dispatch and payments', unit: 'count', better: 'none', access: ['cheque_tracker'], source: 'cheques', agg: 'count',
    description: 'Cheques collected from stores in the period.' }),
  m<Cheque>({ key: 'cheque_value', label: 'Cheque value received', area: 'Dispatch and payments', unit: 'npr', better: 'none', access: ['cheque_tracker'], money: true, source: 'cheques', agg: 'sum', value: (c) => c.amount,
    description: 'Total of the cheques above.' }),
  m<Cheque>({ key: 'cheques_overdue', label: 'Cheques overdue', area: 'Dispatch and payments', unit: 'count', better: 'down', access: ['cheque_tracker'], snapshot: true, source: 'cheques', agg: 'count', where: (c, p) => chequeIsOverdue(c, p.data.today),
    description: 'Cheques not cashed after their cash date (or marked delayed), right now.' }),
  m<Cheque>({ key: 'cheques_overdue_value', label: 'Overdue cheque value', area: 'Dispatch and payments', unit: 'npr', better: 'down', access: ['cheque_tracker'], money: true, snapshot: true, source: 'cheques', agg: 'sum', where: (c, p) => chequeIsOverdue(c, p.data.today), value: (c) => c.amount,
    description: 'Total of the overdue cheques.' }),
  m<Cheque>({ key: 'cheques_bounced', label: 'Cheques bounced', area: 'Dispatch and payments', unit: 'count', better: 'down', access: ['cheque_tracker'], source: 'cheques', agg: 'count', where: (c) => c.status === 'BOUNCED',
    description: 'Cheques received in the period that bounced.' }),
  { key: 'cheque_bounce_rate', label: 'Cheque bounce rate', area: 'Dispatch and payments', unit: 'pct', better: 'down', access: ['cheque_tracker'], num: 'cheques_bounced', den: 'cheques_received', scale: 100,
    description: 'Bounced cheques ÷ cheques received.' },
  m<Cheque>({ key: 'cheque_handover_days', label: 'Days to hand over a cheque', area: 'Dispatch and payments', unit: 'days', better: 'down', access: ['cheque_tracker'], source: 'cheques', agg: 'avg',
    where: (c) => !!c.handoverTimestamp, value: (c) => Math.max(0, helpers.daysBetweenAd(c.receivedDateAd, c.handoverTimestamp!.slice(0, 10))),
    description: 'Average days from collecting a cheque to handing it over at the office.' }),

  // ---------------------------------------------------------------- Stock at stores
  m<StockLineRow>({ key: 'stock_counts', label: 'Shelf counts done', area: 'Stock at stores', unit: 'count', better: 'up', access: ['stock_counts', 'beat_plans'], source: 'stockLines', agg: 'distinct', distinct: (r) => r.count.id,
    description: 'Shelf counts done at stores in the period.' }),
  m<StockLineRow>({ key: 'shelf_units_sold', label: 'Units sold off shelves', area: 'Stock at stores', unit: 'units', better: 'up', access: ['stock_counts', 'beat_plans'], source: 'stockLines', agg: 'sum',
    value: (r) => Math.max(0, (r.item.previousQty || 0) + (r.item.restockedQty || 0) - (r.item.damagedQty || 0) - r.item.shelfQty),
    description: 'Between one count and the next: last count + restocked − damaged − on shelf now.' }),
  m<StockLineRow>({ key: 'out_of_stock', label: 'Out-of-stock products', area: 'Stock at stores', unit: 'count', better: 'down', access: ['stock_counts', 'beat_plans'], snapshot: true, source: 'latestStock', agg: 'count', where: (r) => r.item.shelfQty <= 0,
    description: 'Store and product pairs with nothing on the shelf at the last count.' }),
  m<StockLineRow>({ key: 'low_stock', label: 'Running-low products', area: 'Stock at stores', unit: 'count', better: 'down', access: ['stock_counts', 'beat_plans'], snapshot: true, source: 'latestStock', agg: 'count', where: (r) => r.item.shelfQty > 0 && r.item.shelfQty <= 5,
    description: 'Store and product pairs with 1 to 5 units on the shelf at the last count.' }),
  m<StockLineRow>({ key: 'stores_out_of_stock', label: 'Stores with something out of stock', area: 'Stock at stores', unit: 'count', better: 'down', access: ['stock_counts', 'beat_plans'], snapshot: true, source: 'latestStock', agg: 'distinct', where: (r) => r.item.shelfQty <= 0, distinct: (r) => r.count.entityId,
    description: 'Different stores with at least one product out of stock at the last count.' }),
  m<StockLineRow>({ key: 'units_on_shelves', label: 'Units on store shelves', area: 'Stock at stores', unit: 'units', better: 'none', access: ['stock_counts', 'beat_plans'], snapshot: true, source: 'latestStock', agg: 'sum', value: (r) => r.item.shelfQty,
    description: 'Units on shelves at each store’s last count.' }),

  // ---------------------------------------------------------------- Field team
  m<Visit>({ key: 'store_visits', label: 'Store visits', area: 'Field team', unit: 'count', better: 'up', access: ['beat_plans', 'staff_scorecards'], source: 'visits', agg: 'count',
    description: 'Check-ins at stores in the period.' }),
  m<Visit>({ key: 'stores_visited', label: 'Different stores visited', area: 'Field team', unit: 'count', better: 'up', access: ['beat_plans', 'staff_scorecards'], source: 'visits', agg: 'distinct', distinct: (v) => v.entityId,
    description: 'Different stores with at least one visit.' }),
  m<Visit>({ key: 'visit_minutes', label: 'Average visit length', area: 'Field team', unit: 'minutes', better: 'none', access: ['beat_plans', 'staff_scorecards'], source: 'visits', agg: 'avg', where: (v) => (v.durationMinutes || 0) > 0, value: (v) => v.durationMinutes,
    description: 'Average minutes from check-in to check-out.' }),
  m<BeatItem>({ key: 'planned_visits', label: 'Planned visits', area: 'Field team', unit: 'count', better: 'none', access: ['beat_plans', 'staff_scorecards'], source: 'beatItems', agg: 'count', where: (b, p) => b.dateAd <= p.data.today,
    description: 'Store visits on beat plans up to today.' }),
  m<BeatItem>({ key: 'planned_visits_done', label: 'Planned visits done', area: 'Field team', unit: 'count', better: 'up', access: ['beat_plans', 'staff_scorecards'], source: 'beatItems', agg: 'count', where: (b) => b.status === 'VISITED',
    description: 'Planned visits marked visited.' }),
  { key: 'beat_compliance', label: 'Beat compliance', area: 'Field team', unit: 'pct', better: 'up', access: ['beat_plans', 'staff_scorecards'], num: 'planned_visits_done', den: 'planned_visits', scale: 100,
    description: 'Planned visits done ÷ planned visits.' },
  m<BeatItem>({ key: 'visits_skipped', label: 'Planned visits skipped', area: 'Field team', unit: 'count', better: 'down', access: ['beat_plans', 'staff_scorecards'], source: 'beatItems', agg: 'count', where: (b) => b.status === 'SKIPPED',
    description: 'Planned visits skipped. Split by “Skip reason” to see why.' }),
  m<CallLog>({ key: 'store_calls', label: 'Store calls', area: 'Field team', unit: 'count', better: 'up', access: ['call_tracker'], source: 'storeCalls', agg: 'count',
    description: 'Calls to stores logged in the period.' }),
  m<CallLog>({ key: 'store_calls_ordered', label: 'Store calls with an order', area: 'Field team', unit: 'count', better: 'up', access: ['call_tracker'], source: 'storeCalls', agg: 'count', where: (c) => c.outcome === 'Order Received',
    description: 'Store calls that ended with an order.' }),
  { key: 'store_call_conversion', label: 'Store call to order rate', area: 'Field team', unit: 'pct', better: 'up', access: ['call_tracker'], num: 'store_calls_ordered', den: 'store_calls', scale: 100,
    description: 'Store calls with an order ÷ store calls.' },

  // ---------------------------------------------------------------- Tasks
  m<Task>({ key: 'tasks_due', label: 'Tasks due', area: 'Tasks', unit: 'count', better: 'none', access: ['tasks'], source: 'tasks', agg: 'count',
    description: 'Tasks with a due date in the period.' }),
  m<Task>({ key: 'tasks_done', label: 'Tasks done', area: 'Tasks', unit: 'count', better: 'up', access: ['tasks'], source: 'tasks', agg: 'count', where: (t) => t.status === 'COMPLETED',
    description: 'Tasks due in the period that are marked done.' }),
  { key: 'task_completion', label: 'Task completion', area: 'Tasks', unit: 'pct', better: 'up', access: ['tasks'], num: 'tasks_done', den: 'tasks_due', scale: 100,
    description: 'Tasks done ÷ tasks due.' },
  m<Task>({ key: 'tasks_overdue', label: 'Tasks overdue', area: 'Tasks', unit: 'count', better: 'down', access: ['tasks'], snapshot: true, source: 'tasks', agg: 'count', where: (t, p) => t.status !== 'COMPLETED' && t.dueDateAd < p.data.today,
    description: 'Tasks past their due date and not done, right now.' }),
];

export const METRIC_BY_KEY = new Map(METRICS.map((metric) => [metric.key, metric]));
export const metricByKey = (key: string) => METRIC_BY_KEY.get(key);
