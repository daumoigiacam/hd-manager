import React from 'react';
import './dispatch-table.css';

/**
 * @typedef {Object} DispatchTableRow
 * @property {string} id
 * @property {string=} customerName
 * @property {string=} productShortName
 * @property {string=} productName
 * @property {string=} note
 * @property {string=} assignedDriverId
 * @property {string=} quantityUnit
 * @property {string=} unit
 * @property {number=} pieceCount
 * @property {number=} quantity
 * @property {number=} quantityCount
 * @property {number=} weightKg
 * @property {boolean=} isMergedDispatchRow
 * @property {boolean=} __pendingFirebaseSync
 */
/** @typedef {{ rows: DispatchTableRow[], rowSpan: number, driverName: string, customerName?: string, hasAssignedDriver: boolean, deliveryStatus: { label: string } }} DispatchTableGroup */
/**
 * @typedef {Object} DispatchTableBodyProps
 * @property {DispatchTableGroup[]} visibleDispatchGroups
 * @property {boolean} empty
 * @property {string|null} selectedDisplayRowId
 * @property {string|null} selectedSourceRowId
 * @property {boolean} canDelete
 * @property {(field: 'assignedDriverId'|'customerId'|'productId'|'pieceCount'|'weightKg') => boolean} canEditDispatchCellField
 * @property {(row: DispatchTableRow, field: 'assignedDriverId'|'customerId'|'productId'|'pieceCount', event: import('react').MouseEvent<HTMLButtonElement>) => void} openDispatchCellEditor
 * @property {(row: DispatchTableRow, event: import('react').MouseEvent<HTMLButtonElement>) => void} openDispatchListWeightEditor
 * @property {(row: DispatchTableRow) => number} getDispatchRowQuantity
 * @property {(row: DispatchTableRow) => string} getDispatchRowQuantityUnit
 * @property {(id: string|null, name: string) => string} getCompactProductName
 * @property {(value: number) => string} formatNumber
 */
export default React.memo(/** @param {DispatchTableBodyProps} props */ function DispatchTableBody({ visibleDispatchGroups, empty, selectedDisplayRowId, selectedSourceRowId, canDelete, canEditDispatchCellField, openDispatchCellEditor, openDispatchListWeightEditor, getDispatchRowQuantity, getDispatchRowQuantityUnit, getCompactProductName, formatNumber }) {
  return (
              <tbody>
                {empty ? (
                  <tr>
                    <td colSpan={5} className="hd-dispatch-table__empty">
                      Không thấy phiếu phù hợp. Hãy thử tên khách, tên hàng hoặc tên viết tắt sản phẩm.
                    </td>
                  </tr>
                ) : visibleDispatchGroups.flatMap(group => group.rows.map((row, groupRowIndex) => {
                  const isSelectedEditorRow = selectedDisplayRowId === row.id || selectedSourceRowId === row.id;
                  const isPendingSync = row.__pendingFirebaseSync === true;
                  const shouldShowGroupCells = groupRowIndex === 0;
                  const groupRowSpan = group.rowSpan;
                  const rowDriverName = group.driverName;
                  return (
                    <React.Fragment key={row.id}>
                    <tr
                      className={`hd-dispatch-table__row ${isPendingSync ? 'hd-dispatch-table__row--pending' : isSelectedEditorRow ? 'hd-dispatch-table__row--selected' : row.isMergedDispatchRow ? 'hd-dispatch-table__row--merged' : ''}`}
                    >
                      {shouldShowGroupCells && (
                      <td rowSpan={groupRowSpan} className="hd-dispatch-table__cell hd-dispatch-table__cell--driver">
                        <button
                          type="button"
                          onClick={(event) => openDispatchCellEditor(row, 'assignedDriverId', event)}
                          disabled={isPendingSync || (!canEditDispatchCellField('assignedDriverId') && !canDelete)}
                          className="hd-dispatch-table__cell-button"
                          title={canEditDispatchCellField('assignedDriverId') || canDelete ? 'Bấm để sửa người giao' : undefined}
                          aria-label={`Sửa người giao phiếu xuất của ${group.customerName || row.customerName || 'khách hàng'}`}
                        >
                          {group.hasAssignedDriver && <span className="hd-dispatch-table__driver-name">{rowDriverName}</span>}
                          <span className="hd-dispatch-table__delivery-status">{group.deliveryStatus.label}</span>
                        </button>
                      </td>
                      )}
                      {shouldShowGroupCells && (
                      <td rowSpan={groupRowSpan} className="hd-dispatch-table__cell">
                        <button
                          type="button"
                          onClick={(event) => openDispatchCellEditor(row, 'customerId', event)}
                          disabled={isPendingSync || (!canEditDispatchCellField('customerId') && !canDelete)}
                          className="hd-dispatch-table__cell-button hd-dispatch-table__cell-button--customer"
                          title={canEditDispatchCellField('customerId') || canDelete ? 'Bấm để sửa khách hàng' : undefined}
                        >
                          {group.customerName || row.customerName || ''}
                        </button>
                      </td>
                      )}
                      <td className="hd-dispatch-table__cell">
                        <button
                          type="button"
                          onClick={(event) => openDispatchCellEditor(row, 'productId', event)}
                          disabled={isPendingSync || (!canEditDispatchCellField('productId') && !canDelete)}
                          className="hd-dispatch-table__cell-button"
                          title={canEditDispatchCellField('productId') || canDelete ? 'Bấm để sửa loại hàng' : undefined}
                        >
                          <span className="block font-medium tracking-tight">{row.productShortName || getCompactProductName(null, row.productName || '')}</span>
                          {row.note && <span className="hd-dispatch-table__note">{row.note}</span>}
                          {isPendingSync && <span className="hd-dispatch-table__pending-label">Chờ máy chủ xác nhận</span>}
                        </button>
                      </td>
                      <td className="hd-dispatch-table__cell">
                        <button
                          type="button"
                          onClick={(event) => openDispatchCellEditor(row, 'pieceCount', event)}
                          disabled={isPendingSync || (!canEditDispatchCellField('pieceCount') && !canDelete)}
                          className="hd-dispatch-table__cell-button hd-dispatch-table__cell-button--quantity"
                          title={canEditDispatchCellField('pieceCount') || canDelete ? 'Bấm để sửa số lượng' : undefined}
                        >
                          {getDispatchRowQuantity(row) > 0 ? `${formatNumber(getDispatchRowQuantity(row))} ${getDispatchRowQuantityUnit(row)}`.trim() : '-'}
                        </button>
                      </td>
                      <td className="hd-dispatch-table__cell">
                        <button
                          type="button"
                          onClick={(event) => openDispatchListWeightEditor(row, event)}
                          disabled={isPendingSync || !canEditDispatchCellField('weightKg')}
                          className="hd-dispatch-table__cell-button hd-dispatch-table__cell-button--weight"
                          title={canEditDispatchCellField('weightKg') ? 'Bấm để sửa từng lần cân' : undefined}
                        >
                          {row.weightKg ? formatNumber(row.weightKg) : '--'}
                        </button>
                      </td>
                    </tr>
                    </React.Fragment>
                  );
                }))}
              </tbody>
  );
});
