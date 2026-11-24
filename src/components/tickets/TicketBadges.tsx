import React from 'react';
import { TICKET_STAGE_LABEL, TICKET_STAGE_STYLE, TICKET_TYPE_LABEL, ticketStageOf, ticketTypeOf, type TicketStage, type TicketType } from '@/lib/order-tickets';
import type { ReturnEntry } from '@/lib/types';

const TYPE_STYLE: Record<TicketType, string> = {
  RETURN: 'border-rose-200 bg-rose-50 text-rose-800',
  EXCHANGE: 'border-purple-200 bg-purple-50 text-purple-800',
  SHORT_SHIPPED: 'border-orange-200 bg-orange-50 text-orange-800',
  WRONG_ITEM: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-800',
  RTO: 'border-indigo-200 bg-indigo-50 text-indigo-800',
};

export function TicketStageBadge({ stage }: { stage: TicketStage }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${TICKET_STAGE_STYLE[stage]}`}>{TICKET_STAGE_LABEL[stage]}</span>;
}

export function TicketTypeBadge({ type }: { type: TicketType }) {
  return <span className={`inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-bold ${TYPE_STYLE[type]}`}>{TICKET_TYPE_LABEL[type]}</span>;
}

export function TicketBadges({ entry }: { entry: ReturnEntry }) {
  return <span className="inline-flex flex-wrap gap-1"><TicketTypeBadge type={ticketTypeOf(entry)} /><TicketStageBadge stage={ticketStageOf(entry)} /></span>;
}
