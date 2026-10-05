import { doc, runTransaction, type Firestore } from 'firebase/firestore';
import { commitIdempotentWarehouseDispatchCreate } from '../../src/features/warehouse/warehouseDispatchCreateRepository.js';
import { createWarehouseDispatch, updateWarehouseDispatch } from '../../src/features/warehouse/warehouseDispatchUseCases.js';
import type { DispatchCreateContext, DispatchUpdateContext } from '../../src/features/warehouse/warehouseDispatchContracts.js';
import { buildWarehouseDispatchPresentationGroups } from '../../src/utils/warehouseDispatchGrouping.js';
import { buildWarehouseDispatchProductOptions } from '../../src/utils/warehouseDispatchProductOptions.js';

/** Compile against the real Firebase SDK, not a fake ambient transaction declaration. */
export function checkFirebaseAdapter(db: Firestore, payload: Record<string, unknown>) {
  const reference = doc(db, 'artifacts/test/public/data/warehouseDispatches/wd_company_command');
  return commitIdempotentWarehouseDispatchCreate({
    runTransaction: callback => runTransaction(db, callback),
    reference: () => reference,
    payload,
    companyId: 'company',
    documentId: reference.id,
  });
}

export function checkCommandContracts(createContext: DispatchCreateContext, updateContext: DispatchUpdateContext) {
  void createWarehouseDispatch('employee', { quantity: '5', weightKg: 10, clientMutationId: 'command' }, createContext);
  void updateWarehouseDispatch('dispatch', { weightKg: 20 }, 'employee', updateContext);
  // @ts-expect-error quantities cannot contain arbitrary objects
  void createWarehouseDispatch('employee', { quantity: { value: 5 } }, createContext);
  // @ts-expect-error update identity must be a string
  void updateWarehouseDispatch(42, {}, 'employee', updateContext);
}

const products = buildWarehouseDispatchProductOptions({ orderedProducts: [{ id: 'p', name: 'Product', unitPrice: 100 }] });
const price: number = products[0].unitPrice;
const groups = buildWarehouseDispatchPresentationGroups({ rows: [{ id: 'd', note: 'kept' }] });
const note: string = groups[0].rows[0].note;
export const preservedFields = { price, note };
