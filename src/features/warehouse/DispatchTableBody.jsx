import React from 'react';

export default React.memo(function DispatchTableBody({ visibleDispatchGroups, empty, selectedDisplayRowId, selectedSourceRowId, canDelete, canEditDispatchCellField, openDispatchCellEditor, openDispatchListWeightEditor, getDispatchRowQuantity, getDispatchRowQuantityUnit, getCompactProductName, formatNumber }) {
  return (
              <tbody>
                {empty ? (
                  <tr>
                    <td colSpan={5} className="border border-slate-700 px-3 py-5 text-center text-sm font-bold text-slate-500">
                      Không thấy phiếu phù hợp. Hãy thử tên khách, tên hàng hoặc tên viết tắt sản phẩm.
                    </td>
                  </tr>
                ) : visibleDispatchGroups.flatMap(group => group.rows.map((row, groupRowIndex) => {
                  const isSelectedEditorRow = selectedDisplayRowId === row.id || selectedSourceRowId === row.id;
                  const shouldShowGroupCells = groupRowIndex === 0;
                  const groupRowSpan = group.rowSpan;
                  const rowDriverName = group.driverName;
                  return (
                    <React.Fragment key={row.id}>
                    <tr
                      className={`min-h-[56px] transition ${isSelectedEditorRow ? 'bg-emerald-50/70' : row.isMergedDispatchRow ? 'bg-sky-50/40' : ''}`}
                    >
                      {shouldShowGroupCells && (
                      <td rowSpan={groupRowSpan} className="border border-slate-700 bg-sky-50/60 px-1.5 py-2 align-middle break-words whitespace-normal leading-tight">
                        <button
                          type="button"
                          onClick={(event) => openDispatchCellEditor(row, 'assignedDriverId', event)}
                          disabled={!canEditDispatchCellField('assignedDriverId') && !canDelete}
                          className="w-full rounded-xl px-1 py-1 text-center transition hover:bg-sky-100 disabled:cursor-default disabled:hover:bg-transparent"
                          title={canEditDispatchCellField('assignedDriverId') || canDelete ? 'Bấm để sửa người giao' : undefined}
                          aria-label={`Sửa người giao phiếu xuất của ${group.customerName || row.customerName || 'khách hàng'}`}
                        >
                          {group.hasAssignedDriver && <span className="mt-1 block font-medium text-slate-900">{rowDriverName}</span>}
                          <span className="mt-1 block text-[11px] font-semibold text-slate-600">{group.deliveryStatus.label}</span>
                        </button>
                      </td>
                      )}
                      {shouldShowGroupCells && (
                      <td rowSpan={groupRowSpan} className="border border-slate-700 px-1.5 py-2 align-middle break-words whitespace-normal leading-tight">
                        <button
                          type="button"
                          onClick={(event) => openDispatchCellEditor(row, 'customerId', event)}
                          disabled={!canEditDispatchCellField('customerId') && !canDelete}
                          className="min-h-9 w-full rounded-xl px-1 text-center font-medium transition hover:bg-emerald-50 disabled:cursor-default disabled:hover:bg-transparent"
                          title={canEditDispatchCellField('customerId') || canDelete ? 'Bấm để sửa khách hàng' : undefined}
                        >
                          {group.customerName || row.customerName || ''}
                        </button>
                      </td>
                      )}
                      <td className="border border-slate-700 px-1.5 py-2 align-middle break-words whitespace-normal leading-tight">
                        <button
                          type="button"
                          onClick={(event) => openDispatchCellEditor(row, 'productId', event)}
                          disabled={!canEditDispatchCellField('productId') && !canDelete}
                          className="min-h-9 w-full rounded-xl px-1 text-center transition hover:bg-emerald-50 disabled:cursor-default disabled:hover:bg-transparent"
                          title={canEditDispatchCellField('productId') || canDelete ? 'Bấm để sửa loại hàng' : undefined}
                        >
                          <span className="block font-medium tracking-tight">{row.productShortName || getCompactProductName(null, row.productName || '')}</span>
                          {row.note && <span className="mt-0.5 block text-[10px] font-medium leading-tight text-slate-500">{row.note}</span>}
                        </button>
                      </td>
                      <td className="border border-slate-700 px-1.5 py-2 align-middle break-words whitespace-normal leading-tight">
                        <button
                          type="button"
                          onClick={(event) => openDispatchCellEditor(row, 'pieceCount', event)}
                          disabled={!canEditDispatchCellField('pieceCount') && !canDelete}
                          className="min-h-9 w-full rounded-xl px-1 text-center font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-default disabled:hover:bg-transparent"
                          title={canEditDispatchCellField('pieceCount') || canDelete ? 'Bấm để sửa số lượng' : undefined}
                        >
                          {getDispatchRowQuantity(row) > 0 ? `${formatNumber(getDispatchRowQuantity(row))} ${getDispatchRowQuantityUnit(row)}`.trim() : '-'}
                        </button>
                      </td>
                      <td className="border border-slate-700 px-1.5 py-2 align-middle break-words whitespace-normal leading-tight">
                        <button
                          type="button"
                          onClick={(event) => openDispatchListWeightEditor(row, event)}
                          disabled={!canEditDispatchCellField('weightKg')}
                          className="mx-auto inline-flex min-h-9 w-full items-center justify-center rounded-xl px-1 text-center text-xs font-medium text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-default disabled:text-slate-700 disabled:hover:bg-transparent"
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
