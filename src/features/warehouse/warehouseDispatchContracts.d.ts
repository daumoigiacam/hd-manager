export type NumericInput = string | number | null;

/** Legacy nullable fields remain unchanged at the transport boundary. */
export type DispatchReadData = {
  [Key in keyof DispatchPresentationRow]: DispatchPresentationRow[Key] | null;
} & {
  companyId: string;
  note?: string | null;
  weightEntries?: ReadonlyArray<NumericInput | undefined> | null;
};

/** Persisted fields consumed by dispatch commands. Other snapshot fields are preserved by spread. */
export interface DispatchDraft {
  id?: string;
  companyId?: string;
  clientMutationId?: string;
  empId?: string;
  createdByEmpId?: string;
  customerId?: string;
  customerName?: string;
  customerNameSnapshot?: string;
  productId?: string;
  productName?: string;
  productNameSnapshot?: string;
  branchId?: string;
  branchName?: string;
  customerBranchId?: string;
  customerBranchName?: string;
  assignedDriverId?: string;
  driverId?: string;
  assignedDriverNameSnapshot?: string;
  driverNameSnapshot?: string;
  sourceOrderRequestId?: string;
  sourceOrderRequestRowKey?: string;
  quantity?: NumericInput;
  pieceCount?: NumericInput;
  quantityCount?: NumericInput;
  weightKg?: NumericInput;
  totalKg?: NumericInput;
  actualWeightKg?: NumericInput;
  quantityUnit?: string;
  unit?: string;
  billingUnit?: string;
  pricingUnit?: string;
  unitPrice?: NumericInput;
  price?: NumericInput;
  billingQuantity?: NumericInput;
  pricingQuantity?: NumericInput;
  amount?: NumericInput;
  pricingAmount?: NumericInput;
  lineTotal?: NumericInput;
  date?: string;
  isArchived?: boolean;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string;
  archivedByEmpId?: string;
  updatedByEmpId?: string;
  __pendingFirebaseSync?: boolean;
}

export interface DispatchRecord extends DispatchDraft {
  id: string;
}

export interface DispatchCreateDocument extends DispatchRecord {
  companyId: string;
  clientMutationId: string;
  quantity: number;
  pieceCount: number;
  quantityCount: number;
  weightKg: number;
  quantityUnit: string;
  date: string;
  createdAt: string;
  updatedAt: string;
  isArchived: false;
}

export interface SharedWriteResult {
  queued?: boolean;
  companyId?: string;
}

export interface DispatchCommandContext {
  myCompanyId: string;
  customers: ReadonlyArray<{ id: string; name?: string }>;
  products: ReadonlyArray<{ id: string; name?: string }>;
  rawWarehouseDispatches: DispatchRecord[];
  parseLooseQuantityValue: (value: NumericInput | undefined) => number;
  normalizeLeadingLabel: (value: string) => string;
  getTodayString: () => string;
  setRawWarehouseDispatches: (update: (previous: DispatchRecord[]) => DispatchRecord[]) => void;
  rememberRecentLocalWrite: (collection: 'warehouseDispatches', id: string, payload: DispatchDraft) => void;
}

export interface DispatchCreateContext extends DispatchCommandContext {
  normalizeLookupText: (value: string) => string;
  getEntityTimestamp: (row: DispatchDraft) => number;
  pendingFirebaseWritesRef: { current: ReadonlyArray<{ companyId: string; collectionName: string; documentId: string }> };
  enqueuePendingFirebaseWrite: (command: {
    collectionName: 'warehouseDispatches'; documentId: string;
    payload: DispatchCreateDocument; options: { dispatchCreate: true }; durable: true;
  }) => SharedWriteResult;
  requireSharedWriteConfirmation: (result: SharedWriteResult, collection: 'warehouseDispatches', id: string) => Promise<unknown>;
}

export interface DispatchUpdateContext extends Omit<DispatchCommandContext, 'setRawWarehouseDispatches' | 'rememberRecentLocalWrite'> {
  normalizeProductPricingUnit: (value: string) => string;
  parseLooseMoneyValue: (value: NumericInput | undefined) => number;
  isSameBillingUnit: (left: string, right: string) => boolean;
  saveDataDocument: (collection: 'warehouseDispatches', id: string, payload: DispatchDraft, options: { merge: true }) => Promise<SharedWriteResult | void>;
  requireSharedWriteConfirmation: (result: SharedWriteResult | void, collection: 'warehouseDispatches', id: string) => Promise<unknown>;
}

export interface DispatchDeleteContext {
  currentUser: { id: string } | null;
  saveDataDocument: DispatchUpdateContext['saveDataDocument'];
  requireSharedWriteConfirmation: DispatchUpdateContext['requireSharedWriteConfirmation'];
}

export interface DispatchPresentationRow extends DispatchDraft {
  shipmentId?: string;
  warehouseShipmentId?: string;
  exportOrderId?: string;
  exportId?: string;
  dispatchGroupId?: string;
  dispatchBatchId?: string;
  batchId?: string;
  deliveryPlanId?: string;
  orderId?: string;
  orderRequestId?: string;
  requestId?: string;
  sourceRequestId?: string;
  invoiceId?: string;
  deliveryStatus?: string;
  trackingStatus?: string;
  fulfillmentStatus?: string;
  status?: string;
  deliveryStatusKey?: string;
  deliveryStatusLabel?: string;
  deliveryDriverId?: string;
  driverEmployeeId?: string;
  assignedDriverName?: string;
  driverName?: string;
  customerID?: string;
}

export interface DispatchDeliveryReport {
  id?: string;
  dispatchId?: string;
  warehouseDispatchId?: string;
  isArchived?: boolean;
  deliveryStatus?: string;
  trackingStatus?: string;
  status?: string;
  updatedAt?: string;
  createdAt?: string;
  deliveredAt?: string;
}

export interface DispatchPresentationGroup<Row extends DispatchPresentationRow> {
  key: string;
  shipmentKey: string;
  customerId: string;
  customerName: string;
  driverId: string;
  driverName: string;
  hasAssignedDriver: boolean;
  deliveryStatus: { key: string; label: string };
  firstRowId: string;
  rows: Row[];
}
