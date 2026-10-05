import type { DispatchFormDraft } from './warehouseDispatchFormModel.js';
export interface Entity { id: string; name: string; unit?: string }
export interface DefaultsPorts extends Pick<BillingPorts, 'products' | 'getCustomerBranchProductConfigSource' | 'resolveCustomerProductBillingConfiguration' | 'resolveTransactionBillingSnapshot' | 'resolveCustomerProductActualUnit' | 'isSameBillingUnit'> {
  productLookup: ReadonlyMap<string, Entity>;
  customerLookup: ReadonlyMap<string, Entity>;
  normalizeDispatchQuantityUnit: (unit: string) => string;
  parseLooseQuantityValue: (value: number | string | undefined) => number;
  formatDispatchNumberInput: (value: number) => string;
}
export interface OrderRow {
  id?: string; customerId?: string; productId?: string; productName?: string; productUnit?: string;
  rowKey?: string; lineId?: string; itemId?: string; requestId?: string; requestDate?: string;
  requestDateKey?: string; requestTimestamp?: number; timestamp?: number; createdAt?: string; updatedAt?: string;
  configurationId?: string; sizeLabel?: string; attributeLabel?: string; quantityUnit?: string; unit?: string;
  size?: string; productSize?: string; sourceOrderRequestRowKey?: string; orderRequestRowKey?: string;
  requestRowKey?: string; sourceOrderRequestId?: string; orderRequestId?: string;
  sourceOrderRequestDate?: string; orderRequestDate?: string;
  quantity?: number | string; quantityCount?: number | string; quantityValue?: number | string;
  weightKg?: number | string; kg?: number | string; weight?: number | string;
  pieceCount?: number | string; description?: string; branchId?: string; customerBranchId?: string;
  product?: Entity | null; item?: OrderRow;
}
export interface ShortageIssue { customerId?: string; productId?: string; requestLines: OrderRow[] }
export interface Configuration {
  configurationId: string; billingUnit: string; pricingUnit?: string; unitPrice: number; source: string;
}
export interface BillingSnapshot {
  configurationId: string; billingUnit: string; actualUnit: string; actualQuantity: number;
  actualWeightKg: number; billingQuantity: number; unitPrice: number; amount: number;
  billingSnapshotVersion: number; billingSnapshotSource: string; billingSnapshotValid: boolean;
  billingSnapshotError?: string;
}
export interface ResolvedSnapshot extends BillingSnapshot { hasFrozenPricing: boolean }
export interface BillingInput {
  customer?: Entity | null; product?: Entity | null; matchedOrderRow?: OrderRow | null;
  existingRecord?: OrderRow | null; actualQuantity?: number; actualUnit?: string;
  actualWeightKg?: number; branchId?: string;
}
export interface BillingPorts {
  products: readonly Entity[];
  getCustomerBranchProductConfigSource: (customer: Entity | null, branchId: string, products: readonly Entity[]) => unknown;
  resolveCustomerProductBillingConfiguration: (source: unknown, product: Entity | null, options: {configurationId: string; sizeLabel: string; attributeLabel: string}) => Configuration;
  resolveTransactionBillingSnapshot: (args: {record: OrderRow | null; configuration: Configuration; product: Entity | null}) => ResolvedSnapshot;
  resolveCustomerProductActualUnit: (configuration: Configuration, product: Entity | null) => string;
  isSameBillingUnit: (a: string, b: string) => boolean;
  buildCustomerProductBillingSnapshot: (args: {configuration: Configuration; product: Entity | null; productId: string; productName: string; sizeLabel: string; attributeLabel: string; actualQuantity: number; actualUnit: string; actualWeightKg: number}) => BillingSnapshot;
  isWarehouseDispatchActualUnitCompatible: (args: {expectedActualUnit: string; actualUnit: string; billingUnit: string; actualWeightKg: number}) => boolean;
}
export interface MatchingPorts {
  dispatchShortageSummary: {issueLines: readonly ShortageIssue[]}; dispatchOrderRows: readonly OrderRow[];
  buildDispatchOrderRowFromShortageLine: (line: ShortageIssue, request: OrderRow) => OrderRow;
  getDispatchRowQuantity: (row: OrderRow) => number; getDispatchRowWeight: (row: OrderRow) => number;
  getOrderLineQuantityValue: (row: OrderRow) => number; getOrderLineWeightKgValue: (row: OrderRow) => number;
  getOrderLineSizeLabel: (row: OrderRow) => string; getOrderLineUnitPriceValue: (row: OrderRow) => number;
  normalizeLookupText: (s: string) => string; getEntityTimestamp: (row: OrderRow) => number;
  areLooseQuantityValuesClose: (a: number, b: number, tolerance?: number) => boolean;
}
export interface CreatePorts {
  canCreate: boolean; employee: {id: string} | null; customerLookup: ReadonlyMap<string, Entity>;
  productLookup: ReadonlyMap<string, Entity>; employeeLookup: ReadonlyMap<string, Entity>;
  dispatchDraft: DispatchFormDraft; normalizeDispatchQuantityUnit: (unit: string) => string;
  setDispatchError: (error: string) => void; dispatchSaveLockRef: {current: boolean}; setIsSavingDispatch: (busy: boolean) => void;
  findMatchingOrderRequestRowForDispatch: (customer: string, product: string, row: OrderRow) => OrderRow | null;
  getDispatchOrderBranchRef: (customer: Entity, order: OrderRow | DispatchFormDraft, draft: DispatchFormDraft) => {branchId: string; branchName: string; branchAddress: string};
  buildDispatchBillingSnapshot: (input: BillingInput) => BillingSnapshot; effectiveDispatchDriverId: string;
  canCreateDispatchWithoutOrderRequest: boolean; canUseManualDispatchProductOverride: (customerId: string) => boolean;
  workingDate: string; selectedOrderRequestDateKey: string;
  normalizeWarehouseWeightEntries: (entries: readonly (string | number)[]) => number[]; capitalizeFirst: (s: string) => string;
  dispatchCreateMutationRef: {current: {fingerprint: string; clientMutationId: string; createdAt: string} | null};
  vpsUnits: readonly {id: string; symbol?: string; name?: string}[];
  getCustomerDisplayName: (customer: Entity) => string;
  buildWarehouseDispatchSourceType: (base: string, order: OrderRow | null) => string;
  onAddWarehouseDispatch: (employeeId: string, payload: CreatePayload) => Promise<unknown>;
  setDispatchPickerOpen: (value: string) => void; setDispatchDriverSelectionTouched: (value: boolean) => void;
  setDispatchDraft: (draft: DispatchFormDraft) => void; createEmptyDispatchDraft: (driver: string) => DispatchFormDraft;
  getFriendlyFirebaseErrorMessage: (error: unknown, fallback: string) => string;
}
export interface CreatePayload extends BillingSnapshot {
  warehouseId: string; unitId: string; unitLabel: string; clientMutationId: string; createdAt: string;
  date: string; customerId: string; customerNameSnapshot: string; productId: string; productNameSnapshot: string;
  branchId: string; branchName: string; branchAddress: string;
  customerBranchId: string; customerBranchName: string; customerBranchAddress: string;
  weightKg: number; pieceCount: number; quantity: number; quantityCount: number; quantityUnit: string;
  assignedDriverId: string; assignedDriverNameSnapshot: string; driverId: string; driverNameSnapshot: string;
  weightEntries: number[]; note: string; transcript: string;
  sourceOrderRequestDate: string; sourceOrderRequestId: string; sourceOrderRequestRowKey: string;
  price: number; sourceOrderRequestUnitPrice: number; orderRequestUnitPrice: number; requestUnitPrice: number;
  isOutsideOrderRequest: boolean; createdWithoutOrderRequest: boolean; sourceOrderRequestMissing: boolean; sourceType: string;
}
