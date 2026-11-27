/** What the top-bar brand filter is hiding, in words: "2 orders and 1 return". Empty when nothing is hidden. */
export function hiddenByBrandFilter(all: { orders: unknown[]; tickets: unknown[] }, shown: { orders: unknown[]; tickets: unknown[] }): string {
  const orders = Math.max(0, all.orders.length - shown.orders.length);
  const tickets = Math.max(0, all.tickets.length - shown.tickets.length);
  const parts = [
    orders ? `${orders} ${orders === 1 ? 'order' : 'orders'}` : '',
    tickets ? `${tickets} ${tickets === 1 ? 'return or ticket' : 'returns or tickets'}` : '',
  ].filter(Boolean);
  return parts.join(' and ');
}
