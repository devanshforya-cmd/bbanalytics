/** The starting document types. Store documents ask which store (or chain, or outlet) they came from. */
export const DEFAULT_DOCUMENT_TYPES: { name: string; storeBased: boolean }[] = [
  { name: 'Purchase order', storeBased: true },
  { name: 'Signed delivery challan', storeBased: true },
  { name: 'Tax invoice copy', storeBased: true },
  { name: 'Stock acknowledgment', storeBased: true },
  { name: 'Return authorization (RMA)', storeBased: true },
  { name: 'Credit note', storeBased: true },
  { name: 'Store agreement', storeBased: true },
  { name: 'Supplier invoice', storeBased: false },
  { name: 'Company document', storeBased: false },
  { name: 'Other', storeBased: false },
];

/** A type counts as a store document unless marked otherwise. */
export const isStoreDocument = (type?: { storeBased?: boolean } | null) => type?.storeBased !== false;
