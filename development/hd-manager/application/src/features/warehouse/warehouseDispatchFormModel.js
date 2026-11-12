/**
 * @typedef {Object} DispatchFormDraft
 * @property {string} warehouseId
 * @property {string} unitId
 * @property {string} customerId
 * @property {string} customerSearch
 * @property {string} productId
 * @property {string} productSearch
 * @property {string} pieceCount
 * @property {string} quantityUnit
 * @property {string} weightKg
 * @property {Array<string | number>} weightEntries
 * @property {string} assignedDriverId
 * @property {string} note
 * @property {string} transcript
 * @property {string} configurationId
 * @property {string} billingUnit
 * @property {number} billingQuantity
 * @property {number} unitPrice
 * @property {number} amount
 * @property {number} billingSnapshotVersion
 * @property {string} billingSnapshotSource
 */

/** @param {string} [assignedDriverId] @returns {DispatchFormDraft} */
export function createEmptyDispatchDraft(assignedDriverId = '') {
  return {
    warehouseId: '', unitId: '', customerId: '', customerSearch: '',
    productId: '', productSearch: '', pieceCount: '', quantityUnit: '',
    weightKg: '', weightEntries: [], assignedDriverId, note: '', transcript: '',
    configurationId: '', billingUnit: '', billingQuantity: 0, unitPrice: 0,
    amount: 0, billingSnapshotVersion: 0, billingSnapshotSource: '',
  };
}
