import React from 'react';
import { Check, X } from 'lucide-react';

export default React.memo(function OrderRequestTableRows({ visibleRequestSalesGroups, isOwnerAccount, selectedRowKey, canEditGeneral, canEditQuantity, canEditSizePrice, canDelete, openOrderCellEditor, updateCustomerPortalOrderApproval, formatOrderRequestBranchLabel, getOrderRequestRowProductLabel, formatDateLabel, getOrderRequestRowNoteText, formatSheetQuantity, formatOrderRequestSizeCell, formatCurrency }) {
  return <>
{visibleRequestSalesGroups.map((salesGroup) => (
                  <React.Fragment key={salesGroup.key}>
                    {isOwnerAccount && (
                      <tr className="bg-emerald-50">
                        <td colSpan={5} className="border border-slate-700 px-3 py-2 text-left">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-sm font-black text-emerald-800">
                              NVKD - {salesGroup.salesName}
                            </p>
                          </div>
                        </td>
                      </tr>
                    )}
                      {salesGroup.customerGroups.map((customerGroup) => {
                  return (
                    <React.Fragment key={customerGroup.key}>
                          {customerGroup.rows.map((row, customerRowIndex) => {
                  const isSelectedEditorRow = selectedRowKey === row.rowKey;
                  const shouldRenderCustomerCell = customerRowIndex === 0;
                  const mergedCustomerRowSpan = customerGroup.rows.length;
                  const rowWasDispatched = row.warehouseDispatchStatus === 'dispatched';
                  const rowWasPartlyDispatched = row.warehouseDispatchStatus === 'partial';
                  return (
                    <React.Fragment key={row.rowKey}>
                    <tr
                      className={`h-12 transition ${rowWasDispatched ? 'bg-emerald-50/35' : rowWasPartlyDispatched ? 'bg-amber-50/30' : ''} ${isSelectedEditorRow ? 'bg-emerald-50/70' : ''}`}
                    >
                      {shouldRenderCustomerCell && (
                        <td
                          {...(mergedCustomerRowSpan && mergedCustomerRowSpan > 1 ? { rowSpan: mergedCustomerRowSpan } : {})}
                          className={`max-w-[170px] border border-slate-700 px-2 py-2 font-semibold break-words whitespace-normal ${mergedCustomerRowSpan && mergedCustomerRowSpan > 1 ? 'align-middle text-center bg-white text-[12px] leading-snug' : 'align-top'}`}
                        >
                          <button
                            type="button"
                            onClick={(event) => openOrderCellEditor(row, 'customerId', event)}
                            disabled={!canEditGeneral && !canDelete}
                            className="w-full rounded-xl px-1 py-1 text-center transition hover:bg-emerald-50 disabled:cursor-default disabled:hover:bg-transparent"
                            title={canEditGeneral || canDelete ? 'Bấm để sửa ô khách hàng' : undefined}
                          >
                          <span className="block space-y-1">
                            <span className="block">{row.customerName}</span>
                            {row.branchName && (
                              <span className="block text-[10px] font-black leading-4 text-sky-700">{formatOrderRequestBranchLabel(row)}</span>
                            )}
                            <span className="block text-[10px] font-bold leading-4 text-slate-400">Đặt lúc {row.requestPlacedAtTimeLabel || '--:--'}</span>
                          </span>
                          </button>
                        </td>
                      )}
                      <td className="max-w-[170px] border border-slate-700 px-2 py-2 text-center font-semibold align-top break-words whitespace-normal">
                          <div className="space-y-1 text-center">
                            <button
                              type="button"
                              onClick={(event) => openOrderCellEditor(row, 'productId', event)}
                              disabled={!canEditGeneral && !canDelete}
                              className="w-full rounded-xl px-1 py-1 text-center font-semibold text-slate-900 transition hover:bg-emerald-50 disabled:cursor-default disabled:hover:bg-transparent"
                              title={canEditGeneral || canDelete ? 'Bấm để sửa ô sản phẩm' : undefined}
                            >
                              {getOrderRequestRowProductLabel(row)}
                            </button>
                            {row.isCustomerPortalRequest && row.itemIndex === 0 && row.customerPortalApprovalLabel && (
                              <div className="flex flex-wrap items-center justify-center gap-1.5">
                                {row.customerPortalApprovalState === 'pending' && row.canApproveCustomerPortal && (
                                  <>
                                    <button
                                      type="button"
                                      aria-label="Duyệt đơn khách gửi"
                                      title="Duyệt"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        updateCustomerPortalOrderApproval(row.requestId, 'confirmed');
                                      }}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm hover:bg-emerald-600"
                                    >
                                      <Check size={15} strokeWidth={3} />
                                    </button>
                                    <button
                                      type="button"
                                      aria-label="Hủy đơn khách gửi"
                                      title="Hủy"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        updateCustomerPortalOrderApproval(row.requestId, 'rejected');
                                      }}
                                      className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-white text-red-600 shadow-sm hover:bg-red-50"
                                    >
                                      <X size={15} strokeWidth={3} />
                                    </button>
                                  </>
                                )}
                                {row.customerPortalApprovalState === 'confirmed' && (
                                  <span title="Đã duyệt" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                                    <Check size={15} strokeWidth={3} />
                                  </span>
                                )}
                                {row.customerPortalApprovalState === 'rejected' && (
                                  <span title="Đã hủy" className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600">
                                    <X size={15} strokeWidth={3} />
                                  </span>
                                )}
                              </div>
                            )}
                            {(rowWasDispatched || rowWasPartlyDispatched) && (
                              <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black ${
                                rowWasDispatched
                                  ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                  : 'border border-amber-200 bg-amber-50 text-amber-700'
                              }`}>
                                {rowWasDispatched ? 'Đã xuất kho' : 'Xuất một phần'}
                                {row.warehouseDispatchDate ? ` • ${formatDateLabel(row.warehouseDispatchDate)}` : ''}
                              </span>
                            )}
                            {getOrderRequestRowNoteText(row) && (
                              <p className="text-[10px] font-medium leading-4 text-slate-500">{getOrderRequestRowNoteText(row)}</p>
                            )}
                          </div>
                      </td>
                      <td className="w-px border border-slate-700 px-1 py-2 font-semibold align-top whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(event) => openOrderCellEditor(row, 'quantity', event)}
                          disabled={!canEditQuantity && !canDelete}
                          className="min-h-9 w-full rounded-xl px-1 text-center transition hover:bg-emerald-50 disabled:cursor-default disabled:hover:bg-transparent"
                          title={canEditQuantity || canDelete ? 'Bấm để sửa ô số lượng' : undefined}
                        >
                          {formatSheetQuantity(row.quantity, row.quantityUnit)}
                        </button>
                      </td>
                      <td className="w-px border border-slate-700 px-1 py-2 font-semibold align-top whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(event) => openOrderCellEditor(row, 'sizeLabel', event)}
                          disabled={!canEditSizePrice && !canDelete}
                          className="min-h-9 w-full rounded-xl px-1 text-center transition hover:bg-emerald-50 disabled:cursor-default disabled:hover:bg-transparent"
                          title={canEditSizePrice || canDelete ? 'Bấm để sửa ô size' : undefined}
                        >
                          {formatOrderRequestSizeCell(row) || '--'}
                        </button>
                      </td>
                      <td className="w-px border border-slate-700 px-1 py-2 font-semibold align-top whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(event) => openOrderCellEditor(row, 'unitPrice', event)}
                          disabled={!canEditSizePrice && !canDelete}
                          className="min-h-9 w-full rounded-xl px-1 text-center font-black text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-default disabled:hover:bg-transparent"
                          title={canEditSizePrice || canDelete ? 'Bấm để sửa ô đơn giá' : undefined}
                        >
                          {row.unitPrice ? formatCurrency(row.unitPrice) : '--'}
                        </button>
                      </td>
                    </tr>
                    </React.Fragment>
                  );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                ))}
  </>;
});
