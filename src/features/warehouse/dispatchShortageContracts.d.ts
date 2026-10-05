import type { ShortageLine } from './dispatchDialogModels.js';

export interface RequestItem {
  id?: string; rowKey?: string; lineId?: string; itemId?: string;
  productId?: string; description?: string; productName?: string; productNameSnapshot?: string;
  [field: string]: unknown;
}
export interface RequestDocument {
  id: string;
  items?: RequestItem[];
  closedShortItems?: Record<string, unknown>;
  [field: string]: unknown;
}
export interface ShortageSelection { customerName?: string; productName?: string; requestLines?: ShortageLine[] }
export interface ShortageActionRow {
  id: string; requestId: string; rowKey: string; itemIndex: number;
  productLabel: string; quantityLabel: string; requestDateLabel: string;
}
export interface ShortageActionContext {
  lock: {current: boolean};
  selectedShortageLine: ShortageSelection | null;
  canDeleteOrderRequest: boolean;
  orderRequests: RequestDocument[];
  employee: {id?: string} | null;
  workingDate: string;
  confirm: (message: string) => boolean;
  normalizeLookupText: (value: string) => string;
  getTransactionBillingPresentation: (item: RequestItem) => {amount: number};
  getFriendlyFirebaseErrorMessage: (error: unknown, fallback: string) => string;
  onDeleteOrderRequest: (id: string) => Promise<unknown>;
  onEditOrderRequest: (id: string, patch: RequestDocument, employeeId: string) => Promise<unknown>;
  setDeletingShortageRequestKey: (id: string) => void;
  setIsClosingShortageLine: (value: boolean) => void;
  setDispatchError: (message: string) => void;
  setSelectedShortageLine: (value: null) => void;
}
