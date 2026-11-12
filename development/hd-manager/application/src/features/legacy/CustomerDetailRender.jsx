import React from 'react';
// Exact existing JSX; parent retains all state, permissions, callbacks and data.
export default function CustomerDetailRender({context}) {
const {AlertCircle,CUSTOMER_HONORIFIC_OPTIONS,CUSTOMER_RECONCILIATION_FILTERS,CalendarDays,Check,ChevronDown,ChevronRight,ChevronUp,Download,Filter,Gift,Loader2,MapPin,PRODUCT_PRICING_UNIT_OPTIONS,Package,Phone,Receipt,Search,ShareActionGrid,Trash2,UserCircle,Wallet,X,accountLoginEnabled,activeProductsForPricing,addCustomerBranchDraft,addCustomerPriceVariantDraft,allowedDriverIdsDraft,availableCustomerProductOptions,availableOrderMonths,buildCustomerLoanQuantityLabel,canCallVisibleCustomerPhone,canCreateCustomerLoanRecord,canDeleteCustomer,canDeleteCustomerLoanRecord,canEditCustomer,canEditCustomerContactFields,canEditCustomerLoanRecord,canEditCustomerLocationFields,canEditCustomerProfile,canManageCustomerDebtLimit,canManageCustomerPrices,canManageDriverDebtPermission,canManageFixedProducts,canOpenOrderDetails,canReassignCustomerManager,canReturnCustomerLoanRecord,canSeeCustomerDebt,canSeeCustomerDebtLimitAlerts,canSeeCustomerLoans,canSeeCustomerLocation,canSeeCustomerOrderHistory,canSeeCustomerPaymentHistory,canSeeCustomerPhone,canSeeCustomerStats,canUseCustomerLoyalty,clearCustomerPriceDraft,currentCompany,customerBranchStatus,customerBranchesDraft,customerDebtLimitStatus,customerEditForm,customerEditPhoneDuplicate,customerEditStatus,customerLoanDraft,customerLoanEditDrafts,customerLoanReturnDrafts,customerLoanStatus,customerLoansRef,customerLocationStatus,customerOpeningDebtStatus,customerOrderHistoryRef,customerPaymentHistoryRef,customerPriceDrafts,customerPriceStatus,customerPricingProducts,customerProductPickerSearch,customerProductUsageStats,customerReconciliationExportStatus,customerReconciliationFilter,customerReconciliationFilterCounts,customerReconciliationReportPages,customerReconciliationReportRef,customerReconciliationSummary,debtShareStatus,driverDebtAccessEnabledDraft,driverEmployees,editingCustomerLoanId,filteredCustomerReconciliationRows,filteredOrders,filteredPricingProducts,formatCurrency,formatCustomerLocationForDisplay,formatCustomerNameDraft,formatDateLabel,formatInputCurrency,formatNumber,formatOrderCode,formatReturnGoodsQty,getCustomerBranchDisplayName,getCustomerDisplayName,getCustomerLoanBalance,getCustomerOpeningDebtAmount,getCustomerOpeningPayableAmount,getCustomerReconciliationDirectionLabel,getCustomerReconciliationFilterLabel,getDuplicateCustomerDisplayName,getLedgerOrderDisplayCode,getPaymentDateKey,getPaymentMethodLabel,getPaymentSourceLabel,getProductAttributes,getProductPrimaryPricingUnit,getProductShortName,getTodayString,handleApplyCustomerEditLocationInput,handleArchiveCustomerLoan,handleCaptureCustomerEditLocation,handleCopyDebt,handleCreateCustomerLoan,handleDeleteCustomerProfile,handleDownloadDebt,handleExportCustomerReconciliationExcel,handleExportCustomerReconciliationPdf,handleOpenCustomerMaps,handleOpenSelectedCustomerDebt,handleRecordCustomerLoanReturn,handleSaveAndNotifyCustomerPrices,handleSaveCustomerBranches,handleSaveCustomerDebtLimit,handleSaveCustomerLoanEdit,handleSaveCustomerOpeningDebt,handleSaveCustomerPriceSettings,handleSaveCustomerProfile,handleSaveDriverAccess,handleShareDebt,handleShareDebtReminder,hasCustomerOrderConfigurationValue,inferCustomerHonorificFromName,isCustomerDetailSectionOpen,isCustomerFixedProductsOpen,isDeletingCustomer,isExportingCustomerReconciliation,isSales,isSavingCustomerBranches,isSavingCustomerDebtLimit,isSavingCustomerLoan,isSavingCustomerOpeningDebt,isSavingCustomerPrices,isSavingCustomerProfile,isSavingDriverAccess,isUpdatingSelectedCustomerLocation,localCustomerSource,normalizeLookupText,normalizeProductPricingUnit,onOpenOrder,openCustomerDetailSection,openCustomerLoanEditor,orderMonth,orderSearch,orderSort,parseInputCurrency,parseLooseMoneyValue,removeCustomerBranchDraft,removeCustomerPriceVariantDraft,salesEmployees,savingCustomerLoanEditId,savingCustomerLoanReturnId,selectedCustomer,selectedCustomerDebtOrders,selectedCustomerDirectionsUrl,selectedCustomerLoanStats,selectedCustomerLoans,selectedCustomerLocationText,selectedCustomerNeedsImmediateCollection,selectedCustomerPendingReturnGoods,selectedCustomerPendingReturnSummary,selectedCustomerProductIdSet,selectedCustomerReconciliationRows,setCustomerEditForm,setCustomerProductPickerSearch,setCustomerReconciliationExportStatus,setCustomerReconciliationFilter,setEditingCustomerLoanId,setIsCustomerFixedProductsOpen,setOrderMonth,setOrderSearch,setOrderSort,setShowCustomerDebtList,setShowCustomerEditForm,showCustomerDebtList,showCustomerEditForm,toggleAllowedDriver,toggleCustomerBranchProduct,toggleCustomerDetailSection,toggleCustomerProductForPricing,toggleDriverDebtAccess,updateCustomerBranchDraft,updateCustomerLoanDraft,updateCustomerLoanEditDraft,updateCustomerLoanReturnDraft,updateCustomerPriceDraft,updateCustomerPriceVariantDraft}=context;
return (<div className="premium-data-module premium-customer-module premium-customer-detail space-y-4 animate-in fade-in pb-16">
        <div className="relative bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          {localCustomerSource?.renderStatus(selectedCustomer)}
          {localCustomerSource?.renderHistory?.(selectedCustomer)}
          {canDeleteCustomer && (
            <button
              type="button"
              onClick={handleDeleteCustomerProfile}
              disabled={isDeletingCustomer}
              aria-label="Xóa khách hàng"
              title="Xóa khách hàng"
              className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-red-200 bg-red-50 text-red-600 disabled:opacity-60"
            >
              <Trash2 size={13} />
            </button>
          )}
          <div className="space-y-3">
            <div className="min-w-0 pr-10">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => canEditCustomerProfile && setShowCustomerEditForm(true)}
                  disabled={!canEditCustomerProfile}
                  className={`hd-customer-detail__title min-w-0 max-w-full truncate whitespace-nowrap text-left font-bold leading-tight text-gray-800 ${canEditCustomerProfile ? 'underline decoration-emerald-200 underline-offset-4' : ''}`}
                  title={canEditCustomerProfile ? 'Bấm để chỉnh sửa thông tin khách hàng' : 'Bạn chỉ được xem thông tin khách hàng'}
                >
                  {selectedCustomer.displayName || getCustomerDisplayName(selectedCustomer)}
                </button>
                {selectedCustomer.customerGroup && <span className="shrink-0 rounded-full border border-emerald-100 bg-white px-2 py-1 text-[11px] font-bold text-emerald-700">Nhóm KH: {selectedCustomer.customerGroup}</span>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {canSeeCustomerPhone ? (
                  <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-gray-100 bg-white px-2.5 py-2 text-sm text-gray-600">
                    <Phone size={14} className="shrink-0 text-emerald-600"/>
                    <div className="min-w-0 flex-1">
                      {selectedCustomer.phone && canCallVisibleCustomerPhone ? (
                        <a href={`tel:${selectedCustomer.phone}`} className="block truncate font-black text-emerald-700 underline decoration-emerald-200 underline-offset-4">
                          {selectedCustomer.phone}
                        </a>
                      ) : (
                        <span className="block truncate font-black text-slate-700">{selectedCustomer.phone || 'Chưa có SĐT'}</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="flex min-w-0 items-center gap-2 rounded-2xl border border-gray-100 bg-white px-2.5 py-2 text-sm text-gray-400"><Phone size={14} className="shrink-0"/> <span className="truncate">SĐT ẩn</span></p>
                )}
                {canSeeCustomerLocation ? (
                  <button
                    type="button"
                    onClick={handleOpenCustomerMaps}
                    disabled={!selectedCustomerDirectionsUrl}
                    aria-label={selectedCustomerDirectionsUrl ? `Mở chỉ đường đến ${selectedCustomer.address || selectedCustomerLocationText || 'khách hàng'}` : 'Khách hàng chưa có vị trí để chỉ đường'}
                    title={selectedCustomerDirectionsUrl ? 'Mở Google Maps để chỉ đường' : 'Khách hàng chưa có GPS hoặc địa chỉ'}
                    className={`flex min-w-0 items-center gap-2 rounded-2xl border px-2.5 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60 ${
                      selectedCustomerDirectionsUrl
                        ? 'border-blue-100 bg-white text-gray-600 hover:border-blue-300 hover:bg-blue-50 active:scale-[0.99]'
                        : 'border-gray-100 bg-white text-gray-400'
                    }`}
                  >
                    <MapPin size={14} className="shrink-0 text-blue-600"/>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-black text-slate-700">{selectedCustomer.address || 'Chưa có địa chỉ'}</p>
                      {selectedCustomerLocationText && selectedCustomerLocationText !== selectedCustomer.address && (
                        <p className="truncate text-[10px] font-bold text-blue-700">GPS: {selectedCustomerLocationText}</p>
                      )}
                    </div>
                  </button>
                ) : (
                  <p className="flex min-w-0 items-center gap-2 rounded-2xl border border-gray-100 bg-white px-2.5 py-2 text-sm text-gray-400"><MapPin size={14} className="shrink-0"/> <span className="truncate">Vị trí ẩn</span></p>
                )}
              </div>
              <p className="mt-1 flex min-w-0 items-center gap-2 text-sm text-gray-500"><UserCircle size={14} className="shrink-0"/> <span className="truncate">NVKD phụ trách: {selectedCustomer.managerName}</span></p>
              {customerLocationStatus && (
                <p className="mt-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-700">{customerLocationStatus}</p>
              )}
            </div>
            {(canSeeCustomerStats || canSeeCustomerDebt || canUseCustomerLoyalty) && (
            <div className="grid w-full grid-cols-6 gap-2">
              {canSeeCustomerDebt && (
              <button
                type="button"
                onClick={handleOpenSelectedCustomerDebt}
                className={`min-w-0 rounded-xl border px-2 py-2 text-center transition hover:scale-[1.01] active:scale-[0.99] ${
                selectedCustomer.currentDebt > 0
                  ? 'border-rose-100 bg-white text-rose-700'
                  : 'border-emerald-100 bg-white text-emerald-700'
              } col-span-2`}
                title="Bấm để xem danh sách nợ của khách"
              >
                <p className="text-[9px] font-bold uppercase tracking-tight">Tổng nợ</p>
                <p className="mx-auto mt-0.5 max-w-full break-words text-[11px] font-black leading-tight">{formatCurrency(selectedCustomer.currentDebt)} đ</p>
              </button>
              )}
              {canSeeCustomerStats && (
              <div className="col-span-2 min-w-0 rounded-xl border border-gray-100 bg-white px-2 py-2 text-center">
                <p className="text-[9px] font-bold uppercase tracking-tight text-slate-500">Tổng DT</p>
                <p className="mx-auto mt-0.5 max-w-full break-words text-[11px] font-black leading-tight text-emerald-600">{formatCurrency(selectedCustomer.totalRevenue)} đ</p>
              </div>
              )}
              {canSeeCustomerStats && (
              <button
                type="button"
                onClick={() => openCustomerDetailSection('orders', customerOrderHistoryRef)}
                disabled={!canSeeCustomerOrderHistory}
                className="col-span-2 min-w-0 rounded-xl border border-gray-100 bg-white px-2 py-2 text-center transition hover:border-emerald-200"
              >
                <p className="text-[9px] font-bold uppercase tracking-tight text-slate-500">Tổng Đơn</p>
                <p className="mx-auto mt-0.5 max-w-full break-words text-[11px] font-black leading-tight text-slate-800">{selectedCustomer.orderCount}</p>
              </button>
              )}
              {canSeeCustomerDebt && (
              <button
                type="button"
                onClick={() => openCustomerDetailSection('payments', customerPaymentHistoryRef)}
                disabled={!canSeeCustomerPaymentHistory}
                className={`${canUseCustomerLoyalty ? 'col-span-2' : 'col-span-3'} min-w-0 rounded-xl border border-gray-100 bg-white px-2 py-2 text-center transition hover:border-blue-200`}
              >
                <p className="text-[9px] font-bold uppercase tracking-tight text-blue-500">Đã TT</p>
                <p className="mx-auto mt-0.5 max-w-full break-words text-[11px] font-black leading-tight text-blue-700">{formatCurrency(selectedCustomer.totalPaid)} đ</p>
              </button>
              )}
              {canSeeCustomerDebt && (
              <div className={`${canUseCustomerLoyalty ? 'col-span-2' : 'col-span-3'} min-w-0 rounded-xl border border-gray-100 bg-white px-2 py-2 text-center`}>
                <p className="text-[9px] font-bold uppercase tracking-tight text-indigo-500">Tiền Dư</p>
                <p className="mx-auto mt-0.5 max-w-full break-words text-[11px] font-black leading-tight text-indigo-700">{formatCurrency(selectedCustomer.creditBalance || 0)} đ</p>
              </div>
              )}
              {canUseCustomerLoyalty && (
              <button
                type="button"
                onClick={() => openCustomerDetailSection('loyalty')}
                className={`${canSeeCustomerDebt ? 'col-span-2' : 'col-span-6'} min-w-0 rounded-xl border border-gray-100 bg-white px-2 py-2 text-center transition hover:border-amber-200`}
              >
                <p className="text-[9px] font-bold uppercase tracking-tight text-amber-600">Tích điểm</p>
                <p className="mx-auto mt-0.5 max-w-full break-words text-[11px] font-black leading-tight text-amber-700">{formatNumber(selectedCustomer.loyaltyPoints || 0)}</p>
              </button>
              )}
            </div>
            )}
            {canSeeCustomerDebtLimitAlerts && selectedCustomerNeedsImmediateCollection && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase tracking-wide">giao hàng - phải thu tiền ngay</p>
                    {canSeeCustomerDebt && selectedCustomer.currentDebt > 0 && (
                      <p className="mt-1 text-[11px] font-semibold">Tổng nợ cần nhắc: {formatCurrency(selectedCustomer.currentDebt)} đ</p>
                    )}
                  </div>
                </div>
                {isSales && canSeeCustomerDebt && selectedCustomer.currentDebt > 0 && (
                  <button
                    type="button"
                    onClick={handleShareDebtReminder}
                    className="mt-3 w-full rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-rose-700 active:scale-[0.99]"
                  >
                    Nhắc khách thu hồi nợ
                  </button>
                )}
              </div>
            )}
            {selectedCustomerPendingReturnGoods.length > 0 && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800">
                <div className="flex items-start gap-2">
                  <Package size={16} className="mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black uppercase tracking-wide">Hàng trả chưa lấy về kho</p>
                    <p className="mt-1 text-[11px] font-semibold">
                      Khách còn nợ hàng trả: {formatReturnGoodsQty(selectedCustomerPendingReturnSummary)}
                    </p>
                    <div className="mt-2 space-y-1">
                      {selectedCustomerPendingReturnGoods.slice(0, 3).map(item => (
                        <p key={item.id || `${item.orderId}_${item.createdAt}`} className="text-[11px] font-bold leading-5">
                          {item.orderCode}: {item.productSummary || 'Hàng hóa'} • {formatReturnGoodsQty(item)}{item.reason ? ` • ${item.reason}` : ''}
                        </p>
                      ))}
                      {selectedCustomerPendingReturnGoods.length > 3 && (
                        <p className="text-[11px] font-bold">Còn {selectedCustomerPendingReturnGoods.length - 3} lần trả hàng khác.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {showCustomerEditForm && canEditCustomerProfile && (
        <form data-customer-edit-form="true" onSubmit={handleSaveCustomerProfile} className="hd-customer-edit-form bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-bold text-lg text-gray-800">Chỉnh sửa khách hàng</h3>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div data-customer-edit-row="identity" className="col-span-2 grid grid-cols-[92px_minmax(0,1fr)] gap-2">
              <label className="hd-customer-edit-field">
                <span className="hd-customer-edit-field__label">Xưng hô</span>
                <select
                  aria-label="Xưng hô"
                  value={customerEditForm.customerHonorific || ''}
                  onChange={e => setCustomerEditForm(prev => ({ ...prev, customerHonorific: e.target.value }))}
                  disabled={!canEditCustomer}
                >
                  {CUSTOMER_HONORIFIC_OPTIONS.map(option => <option key={option.value || 'empty'} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <label className="hd-customer-edit-field">
                <span className="hd-customer-edit-field__label">Tên khách hàng</span>
                <input
                  aria-label="Tên khách hàng"
                  required
                  type="text"
                  value={customerEditForm.name}
                  onChange={e => setCustomerEditForm(prev => ({ ...prev, name: formatCustomerNameDraft(e.target.value), customerHonorific: prev.customerHonorific || inferCustomerHonorificFromName(e.target.value) }))}
                  disabled={!canEditCustomer}
                />
              </label>
            </div>
            <div>
              <label className="hd-customer-edit-field">
                <span className="hd-customer-edit-field__label">Số điện thoại</span>
                <input
                  aria-label="Số điện thoại"
                  type="tel"
                  value={customerEditForm.phone}
                  onChange={e => setCustomerEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  disabled={!canEditCustomerContactFields}
                />
              </label>
              {customerEditPhoneDuplicate && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] font-semibold text-amber-700">
                  <AlertCircle size={13} className="mt-0.5 shrink-0" />
                  Trùng số điện thoại với {getDuplicateCustomerDisplayName(customerEditPhoneDuplicate)}.
                </p>
              )}
            </div>
            <div>
              <label className="hd-customer-edit-field">
                <span className="hd-customer-edit-field__label">Nhóm khách hàng</span>
                <input
                  aria-label="Nhóm khách hàng"
                  type="text"
                  value={customerEditForm.customerGroup}
                  onChange={e => setCustomerEditForm(prev => ({ ...prev, customerGroup: e.target.value }))}
                  disabled={!canEditCustomer}
                />
              </label>
            </div>
            {accountLoginEnabled && (
              <div className="col-span-2 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                {selectedCustomer?.userId ? (
                  <div>
                    <p className="text-sm font-black text-emerald-800">Đã liên kết tài khoản</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-emerald-700">Khách hàng có thể đăng nhập bằng số điện thoại trong hồ sơ.</p>
                  </div>
                ) : (
                  <>
                    <label className="flex cursor-pointer items-center justify-between gap-3">
                      <span>
                        <span className="block text-sm font-black text-slate-900">Liên kết đăng nhập bằng số điện thoại</span>
                        <span className="mt-1 block text-[11px] leading-relaxed text-slate-500">Tài khoản được gắn vào đúng khách hàng hiện tại; đơn hàng và công nợ không bị tách.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={Boolean(customerEditForm.createLogin)}
                        onChange={(event) => setCustomerEditForm(prev => ({
                          ...prev,
                          createLogin: event.target.checked,
                          loginPassword: event.target.checked ? prev.loginPassword : '',
                          loginPasswordConfirm: event.target.checked ? prev.loginPasswordConfirm : '',
                        }))}
                        className="h-5 w-5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                      />
                    </label>
                    {customerEditForm.createLogin && (
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        <input type="password" value={customerEditForm.loginPassword} onChange={(event) => setCustomerEditForm(prev => ({ ...prev, loginPassword: event.target.value }))} className="w-full rounded-xl border border-emerald-100 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Mật khẩu tạm" autoComplete="new-password" />
                        <input type="password" value={customerEditForm.loginPasswordConfirm} onChange={(event) => setCustomerEditForm(prev => ({ ...prev, loginPasswordConfirm: event.target.value }))} className="w-full rounded-xl border border-emerald-100 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Nhập lại mật khẩu" autoComplete="new-password" />
                        <p className="sm:col-span-2 text-[11px] leading-relaxed text-emerald-700">Khách phải đổi mật khẩu ở lần đăng nhập đầu tiên. Không cần SMS OTP.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
            <div data-customer-edit-row="location" className={`col-span-2 hd-customer-edit-form__paired-row ${canEditCustomerLocationFields ? '' : 'hd-customer-edit-form__paired-row--single'}`}>
              <label className="hd-customer-edit-field">
                <span className="hd-customer-edit-field__label">Địa chỉ giao hàng</span>
                <input
                  aria-label="Địa chỉ giao hàng"
                  type="text"
                  value={customerEditForm.address}
                  onChange={e => setCustomerEditForm(prev => ({ ...prev, address: e.target.value }))}
                  disabled={!canEditCustomerContactFields}
                />
              </label>
              {canEditCustomerLocationFields && (
                <div className="hd-customer-edit-field hd-customer-edit-field--maps">
                  <span className="hd-customer-edit-field__label">Maps</span>
                  <div className="hd-customer-edit-field__maps-controls">
                    <input
                      aria-label="Maps"
                      type="text"
                      value={customerEditForm.locationInput || ''}
                      onChange={e => setCustomerEditForm(prev => ({ ...prev, locationInput: e.target.value }))}
                    />
                    <button type="button" onClick={handleApplyCustomerEditLocationInput} aria-label="Lưu vị trí Maps" title="Lưu vị trí Maps">
                      <Check size={14} />
                    </button>
                    <button type="button" onClick={handleCaptureCustomerEditLocation} disabled={isUpdatingSelectedCustomerLocation} aria-label="Lấy GPS hiện tại" title="Lấy GPS hiện tại">
                      {isUpdatingSelectedCustomerLocation ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                    </button>
                  </div>
                  {customerEditForm.location && (
                    <small>{formatCustomerLocationForDisplay(customerEditForm.location)}</small>
                  )}
                </div>
              )}
            </div>
            {customerLocationStatus && (
              <p className="col-span-2 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] font-bold text-blue-700">{customerLocationStatus}</p>
            )}
            <label className="col-span-2 hd-customer-edit-field">
              <span className="hd-customer-edit-field__label">Nhân viên phụ trách</span>
              <select
                aria-label="Nhân viên phụ trách"
                value={customerEditForm.empId}
                onChange={e => setCustomerEditForm(prev => ({ ...prev, empId: e.target.value }))}
                disabled={!canReassignCustomerManager}
              >
                <option value="">-- Chọn Sales phụ trách --</option>
                {salesEmployees.map(salesEmp => <option key={salesEmp.id} value={salesEmp.id}>{salesEmp.name}</option>)}
              </select>
              {!canReassignCustomerManager && (
                <p className="mt-2 text-xs text-gray-500">Tài khoản hiện tại không có quyền đổi nhân viên phụ trách.</p>
              )}
            </label>
          </div>

          {customerEditStatus && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {customerEditStatus}
            </div>
          )}

          <button
            type="submit"
            disabled={isSavingCustomerProfile || !!customerEditPhoneDuplicate}
            className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white py-3 rounded-xl font-bold transition-colors"
          >
            {isSavingCustomerProfile ? 'Đang lưu...' : 'Lưu thông tin khách hàng'}
          </button>
        </form>
        )}

        {((canManageFixedProducts || canManageCustomerPrices) || (canManageFixedProducts || canEditCustomerProfile)) && (
        <div className="grid grid-cols-2 gap-2">
        {(canManageFixedProducts || canManageCustomerPrices) && (
        <div
          data-customer-detail-products="true"
          className="hd-customer-detail-products col-span-2 bg-white rounded-2xl border border-gray-100 p-3 shadow-sm space-y-3"
        >
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 space-y-3">
            <div className="hd-customer-detail-products__heading-row">
              <button
                type="button"
                onClick={() => setIsCustomerFixedProductsOpen(prev => !prev)}
                className="hd-customer-detail-products__toggle"
              >
                <span className="hd-customer-detail-products__title">SP khách lấy</span>
                <span className="hd-customer-detail-products__count">
                  {customerPricingProducts.length > 0 ? `${customerPricingProducts.length} SP` : 'Chưa cài'}
                </span>
                {isCustomerFixedProductsOpen ? <ChevronUp size={18} className="shrink-0 text-emerald-600" /> : <ChevronDown size={18} className="shrink-0 text-emerald-600" />}
              </button>

              {isCustomerFixedProductsOpen && (
                <label className="hd-customer-detail-products__search">
                  <Search size={15} className="shrink-0 text-emerald-500" />
                  <input
                    data-hd-search-input="true"
                    data-customer-product-search="true"
                    type="text"
                    value={customerProductPickerSearch}
                    onChange={(e) => setCustomerProductPickerSearch(e.target.value)}
                    disabled={!canManageFixedProducts}
                    placeholder="Tìm SP"
                  />
                </label>
              )}
            </div>

            {!isCustomerFixedProductsOpen && customerPricingProducts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {customerPricingProducts.slice(0, 4).map(product => (
                  <span key={product.id} className="rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    {getProductShortName(product) || product.name}
                  </span>
                ))}
                {customerPricingProducts.length > 4 && (
                  <span className="rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    +{customerPricingProducts.length - 4}
                  </span>
                )}
              </div>
            )}

            {isCustomerFixedProductsOpen && (
            <>
            <div
              data-customer-product-suggestions="true"
              data-suggestion-limit="10"
              className="hd-customer-detail-products__suggestions"
            >
              {availableCustomerProductOptions.slice(0, 10).map(product => {
                const usageStats = customerProductUsageStats.get(product.id);
                const isSelectedProduct = selectedCustomerProductIdSet.has(product.id);
                return (
                  <button
                    key={product.id}
                    data-product-short-name={getProductShortName(product) || product.name || ''}
                    data-product-usage-quantity={usageStats?.quantity || 0}
                    data-product-usage-count={usageStats?.count || 0}
                    data-product-usage-last-time={usageStats?.lastOrderTime || 0}
                    type="button"
                    onClick={() => canManageFixedProducts && toggleCustomerProductForPricing(product.id)}
                    disabled={!canManageFixedProducts}
                    className={`hd-customer-detail-products__suggestion ${
                      isSelectedProduct
                        ? 'is-selected'
                        : ''
                    }`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      isSelectedProduct ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-200 bg-white text-transparent'
                    }`}>
                      <Check size={13} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="hd-customer-detail-products__suggestion-title block truncate">
                        {getProductShortName(product) || product.name}
                      </span>
                      <span className={`block truncate text-[11px] font-semibold ${isSelectedProduct ? 'text-emerald-700/80' : 'text-slate-400'}`}>
                        {usageStats ? `Hay lấy ${formatNumber(usageStats.quantity)} ${product.unit || 'lần'}` : product.category || 'Tick để cài giá và size'}
                      </span>
                    </span>
                  </button>
                );
              })}
              {availableCustomerProductOptions.length === 0 && (
                <p className="hd-customer-detail-products__empty">
                  Không tìm thấy sản phẩm phù hợp.
                </p>
              )}
            </div>
            </>
            )}
          </div>

          {isCustomerFixedProductsOpen && (
          <>
          {activeProductsForPricing.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 px-4 py-5 text-center text-sm text-gray-400">
              {localCustomerSource?.queryManaged?'Chưa tải danh mục sản phẩm trên thiết bị.':'Chưa có sản phẩm trong kho để cài giá riêng.'}
            </div>
          ) : customerPricingProducts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 px-4 py-5 text-center text-sm font-semibold text-emerald-700">
              Bạn hãy chọn SP khách lấy ở phía trên. Khi chưa chọn sản phẩm nào, app sẽ không chia sẻ bảng giá cho khách này để tránh gửi nhầm toàn bộ sản phẩm.
            </div>
          ) : (
            <div data-customer-product-config-list="true" className="hd-customer-product-config-list space-y-2">
              {filteredPricingProducts.map(product => {
                const rawCustomConfig = customerPriceDrafts[product.id] ?? null;
                const customConfig = typeof rawCustomConfig === 'object' && rawCustomConfig !== null
                  ? rawCustomConfig
                  : { price: parseLooseMoneyValue(rawCustomConfig), size: '', attributeLabel: '', variants: [] };
                const customPrice = customConfig.price || '';
                const customSize = customConfig.size || '';
                const customPricingUnit = normalizeProductPricingUnit(
                  customConfig.pricingUnit || customConfig.defaultUnit || getProductPrimaryPricingUnit(product, 'Con')
                );
                const customOrderUnits = Array.isArray(customConfig.orderUnits)
                  ? customConfig.orderUnits.join(', ')
                  : `${customConfig.orderUnits ?? customConfig.allowedOrderUnits ?? customConfig.inputUnits ?? ''}`.trim();
                const customDefaultOrderUnit = normalizeProductPricingUnit(
                  customConfig.defaultOrderUnit || customConfig.orderUnit || customConfig.preferredOrderUnit || ''
                );
                const customUnitConversions = Array.isArray(customConfig.unitConversions)
                  ? customConfig.unitConversions.join('; ')
                  : `${customConfig.unitConversions ?? customConfig.conversions ?? customConfig.conversion ?? ''}`.trim();
                const pricingUnitOptions = PRODUCT_PRICING_UNIT_OPTIONS.includes(customPricingUnit)
                  ? PRODUCT_PRICING_UNIT_OPTIONS
                  : [customPricingUnit, ...PRODUCT_PRICING_UNIT_OPTIONS].filter(Boolean);
                const productAttributeOptions = getProductAttributes(product);
                const customAttributeLabel = productAttributeOptions.find(attribute => normalizeLookupText(attribute) === normalizeLookupText(customConfig.attributeLabel || '')) || '';
                const customVariants = (Array.isArray(customConfig.variants) ? customConfig.variants : []).map((variant, index) => ({
                  id: `${variant.id || `variant_${index + 1}`}`,
                  size: `${variant.size || ''}`,
                  attributeLabel: productAttributeOptions.find(attribute => normalizeLookupText(attribute) === normalizeLookupText(variant.attributeLabel || '')) || '',
                  price: variant.price || ''
                }));
                const hasProductAttributes = productAttributeOptions.length > 0;
                const hasCustomConfig = parseLooseMoneyValue(customPrice) > 0
                  || `${customSize || ''}`.trim() !== ''
                  || customAttributeLabel
                  || customPricingUnit
                  || hasCustomerOrderConfigurationValue(customOrderUnits)
                  || customDefaultOrderUnit
                  || hasCustomerOrderConfigurationValue(customUnitConversions)
                  || customVariants.length > 0;
                return (
                  <div
                    key={product.id}
                    data-customer-product-config="true"
                    data-product-short-name={getProductShortName(product) || product.name || ''}
                    className={`hd-customer-product-config rounded-2xl border p-3 ${hasCustomConfig ? 'border-emerald-100 bg-emerald-50/60' : 'border-gray-100 bg-gray-50'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="hd-customer-detail-products__product-title">{getProductShortName(product) || product.name}</p>
                      </div>
                      {hasCustomConfig && (
                        <button type="button" onClick={() => clearCustomerPriceDraft(product.id)} className="shrink-0 rounded-full border border-red-100 bg-white px-2.5 py-1 text-[10px] font-bold text-red-500">
                          Xóa cài riêng
                        </button>
                      )}
                    </div>
                    <div className="hd-customer-product-config__fields">
                      <div data-config-row="size-price" className="hd-customer-product-config__field-row">
                        <label className="hd-customer-config-field">
                          <span className="hd-customer-config-field__label">Size</span>
                          <input
                            aria-label={`Size của ${product.name}`}
                            type="text"
                            value={customSize}
                            onChange={(e) => updateCustomerPriceDraft(product.id, 'size', e.target.value)}
                            className="hd-customer-config-field__control"
                          />
                        </label>
                        <label className="hd-customer-config-field">
                          <span className="hd-customer-config-field__label">Giá</span>
                          <span className="hd-customer-config-field__value-row">
                            <input
                              aria-label={`Giá của ${product.name}`}
                              type="tel"
                              value={formatInputCurrency(customPrice)}
                              onChange={(e) => updateCustomerPriceDraft(product.id, 'price', e.target.value)}
                              className="hd-customer-config-field__control"
                            />
                            <span className="hd-customer-config-field__suffix">đ/{customPricingUnit || 'đv'}</span>
                          </span>
                        </label>
                      </div>
                      <div data-config-row="pricing-order-units" className="hd-customer-product-config__field-row">
                        <label className="hd-customer-config-field">
                          <span className="hd-customer-config-field__label">ĐV tính giá</span>
                          <select
                            aria-label={`Đơn vị tính giá của ${product.name}`}
                            value={customPricingUnit}
                            onChange={(e) => updateCustomerPriceDraft(product.id, 'pricingUnit', e.target.value)}
                            className="hd-customer-config-field__control"
                          >
                            {pricingUnitOptions.map(unit => (
                              <option key={unit} value={unit}>{unit}</option>
                            ))}
                          </select>
                        </label>
                        <label className="hd-customer-config-field">
                          <span className="hd-customer-config-field__label">ĐV đặt</span>
                          <input
                            aria-label={`Đơn vị đặt của ${product.name}`}
                            type="text"
                            value={customOrderUnits}
                            onChange={(e) => updateCustomerPriceDraft(product.id, 'orderUnits', e.target.value)}
                            className="hd-customer-config-field__control"
                          />
                        </label>
                      </div>
                    </div>
                    <div className="hd-customer-product-config__attributes">
                      <div className="hd-customer-product-config__attribute-header">
                        <p>Thuộc tính</p>
                        {hasProductAttributes && (
                          <label className="hd-customer-config-field hd-customer-config-field--compact">
                            <span className="hd-customer-config-field__label">Thuộc tính</span>
                            <select
                              aria-label={`Thuộc tính của ${product.name}`}
                              value={customAttributeLabel}
                              onChange={(e) => updateCustomerPriceDraft(product.id, 'attributeLabel', e.target.value)}
                              className="hd-customer-config-field__control"
                            >
                              <option value="">Không chọn</option>
                              {productAttributeOptions.map(attribute => (
                                <option key={attribute} value={attribute}>{attribute}</option>
                              ))}
                            </select>
                          </label>
                        )}
                        <button
                          type="button"
                          onClick={() => addCustomerPriceVariantDraft(product.id)}
                          className="hd-customer-product-config__add-attribute"
                        >
                          + Thêm
                        </button>
                      </div>

                      {customVariants.length > 0 && (
                        <div className="mt-2 space-y-2">
                          {customVariants.map((variant, variantIndex) => (
                            <div key={variant.id} className={`hd-customer-product-variant ${hasProductAttributes ? 'has-product-attributes' : ''}`}>
                              <label className="hd-customer-config-field">
                                <span className="hd-customer-config-field__label">Size {variantIndex + 1}</span>
                                <input
                                  aria-label={`Size ${variantIndex + 1} của ${product.name}`}
                                  type="text"
                                  value={variant.size}
                                  onChange={(e) => updateCustomerPriceVariantDraft(product.id, variant.id, 'size', e.target.value)}
                                  className="hd-customer-config-field__control"
                                />
                              </label>
                              {hasProductAttributes && (
                                <label className="hd-customer-config-field">
                                  <span className="hd-customer-config-field__label">Thuộc tính</span>
                                  <select
                                    aria-label={`Thuộc tính ${variantIndex + 1} của ${product.name}`}
                                    value={variant.attributeLabel}
                                    onChange={(e) => updateCustomerPriceVariantDraft(product.id, variant.id, 'attributeLabel', e.target.value)}
                                    className="hd-customer-config-field__control"
                                  >
                                    <option value="">Không</option>
                                    {productAttributeOptions.map(attribute => (
                                      <option key={attribute} value={attribute}>{attribute}</option>
                                    ))}
                                  </select>
                                </label>
                              )}
                              <label className="hd-customer-config-field">
                                <span className="hd-customer-config-field__label">Giá</span>
                                <input
                                  aria-label={`Giá thuộc tính ${variantIndex + 1} của ${product.name}`}
                                  type="tel"
                                  value={formatInputCurrency(variant.price)}
                                  onChange={(e) => updateCustomerPriceVariantDraft(product.id, variant.id, 'price', e.target.value)}
                                  className="hd-customer-config-field__control"
                                />
                              </label>
                              <button
                                type="button"
                                onClick={() => removeCustomerPriceVariantDraft(product.id, variant.id)}
                                className="flex h-9 w-9 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-500 transition hover:bg-red-100"
                                aria-label="Xóa size/thuộc tính"
                              >
                                <X size={15} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {customerPriceStatus && (
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
              {customerPriceStatus}
            </div>
          )}

          {canManageCustomerPrices && (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleSaveCustomerPriceSettings}
              disabled={isSavingCustomerPrices || !selectedCustomer || customerPricingProducts.length === 0}
              className="rounded-xl border border-emerald-200 bg-emerald-50 py-3 font-bold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:opacity-60"
            >
              {isSavingCustomerPrices ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
            <button
              type="button"
              onClick={handleSaveAndNotifyCustomerPrices}
              disabled={isSavingCustomerPrices || !selectedCustomer || customerPricingProducts.length === 0}
              className="rounded-xl bg-emerald-500 py-3 font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
            >
              {isSavingCustomerPrices ? 'Đang lưu...' : 'Lưu và báo khách'}
            </button>
          </div>
          )}
          </>
          )}
        </div>
        )}

        {(canManageFixedProducts || canEditCustomerProfile) && (
        <div
          data-customer-detail-branches="true"
          className="col-span-2 bg-white rounded-2xl border border-sky-100 p-3 shadow-sm space-y-3"
        >
          <button type="button" onClick={() => toggleCustomerDetailSection('branches')} className="flex w-full items-center justify-between gap-2 text-left">
            <div className="min-w-0">
              <h3 className="flex items-center gap-1.5 truncate font-bold text-gray-800"><MapPin size={15} className="shrink-0 text-sky-500" /> <span className="truncate">Chi nhánh</span></h3>
              <p className="mt-1 truncate text-[11px] font-semibold text-sky-700">
                {customerBranchesDraft.length > 0
                  ? `${customerBranchesDraft.length} chi nhánh`
                  : 'Chưa có'}
              </p>
            </div>
            {isCustomerDetailSectionOpen('branches') ? <ChevronUp size={17} className="text-sky-600" /> : <ChevronDown size={17} className="text-sky-600" />}
          </button>

          {!isCustomerDetailSectionOpen('branches') && customerBranchesDraft.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {customerBranchesDraft.slice(0, 4).map((branch, index) => (
                <span key={branch.id || index} className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">
                  {getCustomerBranchDisplayName(branch, index)}
                </span>
              ))}
              {customerBranchesDraft.length > 4 && (
                <span className="rounded-full border border-sky-100 bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-700">
                  +{customerBranchesDraft.length - 4}
                </span>
              )}
            </div>
          )}

          {isCustomerDetailSectionOpen('branches') && (
          <div className="space-y-3">
            {customerBranchesDraft.length === 0 && (
              <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 px-4 py-5 text-center text-sm font-semibold text-sky-700">
                Chưa có chi nhánh. Bấm thêm chi nhánh để cài địa chỉ và sản phẩm cố định riêng.
              </div>
            )}

            {customerBranchesDraft.map((branch, branchIndex) => {
              const branchSelectedIds = new Set(branch.customerProductIds || []);
              return (
                <div key={branch.id || branchIndex} className="rounded-2xl border border-sky-100 bg-sky-50/40 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-sky-700">Chi nhánh {branchIndex + 1}</p>
                    <button
                      type="button"
                      onClick={() => removeCustomerBranchDraft(branch.id)}
                      className="rounded-full border border-red-100 bg-white px-2.5 py-1 text-[10px] font-black text-red-500"
                    >
                      Xóa
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <input
                      value={branch.name || ''}
                      onChange={e => updateCustomerBranchDraft(branch.id, 'name', e.target.value)}
                      className="rounded-xl border border-sky-100 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-400"
                      placeholder="Tên chi nhánh"
                    />
                    <input
                      value={branch.phone || ''}
                      onChange={e => updateCustomerBranchDraft(branch.id, 'phone', e.target.value)}
                      className="rounded-xl border border-sky-100 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-400"
                      placeholder="SĐT chi nhánh nếu có"
                    />
                    <input
                      value={branch.address || ''}
                      onChange={e => updateCustomerBranchDraft(branch.id, 'address', e.target.value)}
                      className="rounded-xl border border-sky-100 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-400 sm:col-span-2"
                      placeholder="Địa chỉ giao hàng của chi nhánh"
                    />
                    <input
                      value={branch.note || ''}
                      onChange={e => updateCustomerBranchDraft(branch.id, 'note', e.target.value)}
                      className="rounded-xl border border-sky-100 bg-white px-3 py-2.5 text-sm font-semibold outline-none focus:ring-2 focus:ring-sky-400 sm:col-span-2"
                      placeholder="Ghi chú chi nhánh"
                    />
                  </div>
                  <div className="rounded-2xl border border-white bg-white/80 p-2">
                    <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-slate-500">Sản phẩm cố định riêng</p>
                    <div className="max-h-36 overflow-y-auto space-y-1 pr-1">
                      {availableCustomerProductOptions.slice(0, 30).map(product => {
                        const isSelectedBranchProduct = branchSelectedIds.has(product.id);
                        return (
                          <button
                            key={`${branch.id}_${product.id}`}
                            type="button"
                            onClick={() => toggleCustomerBranchProduct(branch.id, product.id)}
                            className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-bold transition ${
                              isSelectedBranchProduct
                                ? 'border-sky-300 bg-sky-100 text-sky-800'
                                : 'border-slate-100 bg-white text-slate-700 hover:border-sky-200 hover:bg-sky-50'
                            }`}
                          >
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                              isSelectedBranchProduct ? 'border-sky-500 bg-sky-500 text-white' : 'border-slate-200 bg-white text-transparent'
                            }`}>
                              <Check size={13} />
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              {getProductShortName(product) ? `${getProductShortName(product)} - ${product.name}` : product.name}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[11px] font-semibold text-slate-400">Nếu không tick sản phẩm riêng, chi nhánh sẽ dùng danh sách sản phẩm cố định chung của khách.</p>
                  </div>
                </div>
              );
            })}

            {customerBranchStatus && (
              <p className="rounded-2xl border border-sky-100 bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700">{customerBranchStatus}</p>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={addCustomerBranchDraft}
                className="rounded-xl border border-sky-200 bg-sky-50 py-3 text-sm font-black text-sky-700"
              >
                + Thêm chi nhánh
              </button>
              <button
                type="button"
                onClick={handleSaveCustomerBranches}
                disabled={isSavingCustomerBranches}
                className="rounded-xl bg-sky-500 py-3 text-sm font-black text-white transition hover:bg-sky-600 disabled:opacity-60"
              >
                {isSavingCustomerBranches ? 'Đang lưu...' : 'Lưu chi nhánh'}
              </button>
            </div>
          </div>
          )}
        </div>
        )}
        </div>
        )}

        {canSeeCustomerDebt && (
        <div className="bg-white rounded-2xl border border-rose-100 p-4 shadow-sm space-y-3">
          <button type="button" onClick={() => toggleCustomerDetailSection('openingDebt')} className="flex w-full items-start justify-between gap-3 text-left">
            <div className="min-w-0">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Wallet size={16} className="text-rose-500" /> Nợ cũ</h3>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              <span data-customer-opening-debt-summary="true" className="flex flex-col items-stretch gap-1 text-right">
                <span data-debt-side="receivable" className="rounded-full border border-rose-100 bg-rose-50 px-2.5 py-1 text-[11px] font-black text-rose-700">
                  Khách nợ: {formatCurrency(getCustomerOpeningDebtAmount(selectedCustomer))} đ
                </span>
                <span data-debt-side="payable" className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-black text-indigo-700">
                  Công ty nợ: {formatCurrency(getCustomerOpeningPayableAmount(selectedCustomer))} đ
                </span>
              </span>
              {isCustomerDetailSectionOpen('openingDebt') ? <ChevronUp size={17} className="text-rose-500" /> : <ChevronDown size={17} className="text-rose-500" />}
            </span>
          </button>
          {isCustomerDetailSectionOpen('openingDebt') && (
          <>
            <p className="text-xs leading-5 text-slate-500">Nhập nợ cũ đầu kỳ theo đúng chiều phát sinh. App chỉ dùng để đối soát công nợ, không tạo phiếu kho hoặc hóa đơn giả.</p>
            <div className="grid grid-cols-1 gap-3">
              <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-3">
                <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-rose-600">Khách nợ công ty</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="tel"
                    value={formatInputCurrency(customerEditForm.openingDebtAmount)}
                    onChange={e => setCustomerEditForm(prev => ({ ...prev, openingDebtAmount: parseInputCurrency(e.target.value) }))}
                    disabled={!canEditCustomerProfile}
                    className="w-full rounded-xl border border-rose-100 bg-white p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-rose-300 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Số tiền khách còn nợ"
                  />
                  <input
                    type="text"
                    value={customerEditForm.openingDebtNote || ''}
                    onChange={e => setCustomerEditForm(prev => ({ ...prev, openingDebtNote: e.target.value }))}
                    disabled={!canEditCustomerProfile}
                    className="w-full rounded-xl border border-rose-100 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-rose-300 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Ghi chú nếu cần"
                  />
                </div>
              </div>
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-3">
                <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-indigo-600">Công ty nợ khách</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    type="tel"
                    value={formatInputCurrency(customerEditForm.openingPayableAmount)}
                    onChange={e => setCustomerEditForm(prev => ({ ...prev, openingPayableAmount: parseInputCurrency(e.target.value) }))}
                    disabled={!canEditCustomerProfile}
                    className="w-full rounded-xl border border-indigo-100 bg-white p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Số tiền công ty còn nợ"
                  />
                  <input
                    type="text"
                    value={customerEditForm.openingPayableNote || ''}
                    onChange={e => setCustomerEditForm(prev => ({ ...prev, openingPayableNote: e.target.value }))}
                    disabled={!canEditCustomerProfile}
                    className="w-full rounded-xl border border-indigo-100 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-300 disabled:bg-gray-50 disabled:text-gray-500"
                    placeholder="Ghi chú nếu cần"
                  />
                </div>
              </div>
              {canEditCustomerProfile && (
                <button
                  type="button"
                  onClick={handleSaveCustomerOpeningDebt}
                  disabled={isSavingCustomerOpeningDebt}
                  className="rounded-xl bg-rose-500 px-4 py-3 text-sm font-black text-white transition hover:bg-rose-600 disabled:opacity-60"
                >
                  {isSavingCustomerOpeningDebt ? 'Đang lưu...' : 'Lưu nợ cũ'}
                </button>
              )}
            </div>
            {customerOpeningDebtStatus && (
              <p className="rounded-2xl border border-rose-100 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{customerOpeningDebtStatus}</p>
            )}
          </>
          )}
        </div>
        )}

        {canSeeCustomerDebt && selectedCustomer?.hasPurchaseReconciliation && (
        <div className="bg-white rounded-2xl border border-cyan-100 p-4 shadow-sm space-y-3">
          <button type="button" onClick={() => toggleCustomerDetailSection('reconciliation')} className="flex w-full items-start justify-between gap-3 text-left">
            <div className="min-w-0">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Wallet size={16} className="text-cyan-600" /> Lịch sử đối soát</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500">Các lần công ty mua hàng từ khách và cấn trừ với hóa đơn bán cho khách.</p>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              <span className="rounded-full border border-cyan-100 bg-cyan-50 px-2.5 py-1 text-[11px] font-black text-cyan-700">
                {isCustomerDetailSectionOpen('reconciliation')
                  ? `${filteredCustomerReconciliationRows.length}/${selectedCustomerReconciliationRows.length} lần`
                  : `${selectedCustomerReconciliationRows.length} lần`}
              </span>
              {isCustomerDetailSectionOpen('reconciliation') ? <ChevronUp size={17} className="text-cyan-600" /> : <ChevronDown size={17} className="text-cyan-600" />}
            </span>
          </button>
          {!isCustomerDetailSectionOpen('reconciliation') && (
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-indigo-50 px-2 py-2"><p className="text-[10px] font-bold uppercase text-indigo-500">Cty nợ/mua</p><p className="mt-1 text-xs font-black text-indigo-700">{formatCurrency(selectedCustomer.companyOwesBeforeReconcile ?? selectedCustomer.purchaseDebt ?? 0)} đ</p></div>
              <div className="rounded-xl bg-emerald-50 px-2 py-2"><p className="text-[10px] font-bold uppercase text-emerald-500">Đã cấn trừ</p><p className="mt-1 text-xs font-black text-emerald-700">{formatCurrency(selectedCustomer.reconciliationOffset || 0)} đ</p></div>
              <div className="rounded-xl bg-rose-50 px-2 py-2"><p className="text-[10px] font-bold uppercase text-rose-500">Khách còn nợ</p><p className="mt-1 text-xs font-black text-rose-700">{formatCurrency(selectedCustomer.currentDebt || 0)} đ</p></div>
            </div>
          )}
          {isCustomerDetailSectionOpen('reconciliation') && (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2"><p className="text-[10px] font-bold uppercase text-indigo-500">Cty nợ/mua</p><p className="mt-1 text-sm font-black text-indigo-700">{formatCurrency(selectedCustomer.companyOwesBeforeReconcile ?? selectedCustomer.purchaseDebt ?? 0)} đ</p></div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2"><p className="text-[10px] font-bold uppercase text-emerald-500">Đã cấn trừ</p><p className="mt-1 text-sm font-black text-emerald-700">{formatCurrency(selectedCustomer.reconciliationOffset || 0)} đ</p></div>
              <div className="rounded-xl border border-rose-100 bg-rose-50/60 px-3 py-2"><p className="text-[10px] font-bold uppercase text-rose-500">Số dư còn lại</p><p className="mt-1 text-sm font-black text-rose-700">{formatCurrency(selectedCustomer.currentDebt || 0)} đ</p></div>
            </div>
            <p className="rounded-xl border border-cyan-100 bg-cyan-50/60 px-3 py-2 text-xs leading-5 text-cyan-800">Các dòng dưới đây là nguồn dữ liệu dùng để đối soát. Giao dịch chờ xử lý chưa được tính là đã cấn trừ.</p>
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap gap-1.5" role="group" aria-label="Lọc lịch sử đối soát">
                  {[
                    { id: CUSTOMER_RECONCILIATION_FILTERS.ALL, label: 'Tất cả' },
                    { id: CUSTOMER_RECONCILIATION_FILTERS.COMPANY_PURCHASE, label: 'Công ty mua' },
                    { id: CUSTOMER_RECONCILIATION_FILTERS.CUSTOMER_PURCHASE, label: 'Khách mua' }
                  ].map(option => {
                    const isActive = customerReconciliationFilter === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setCustomerReconciliationFilter(option.id);
                          setCustomerReconciliationExportStatus('');
                        }}
                        aria-pressed={isActive}
                        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-black transition-colors ${
                          isActive
                            ? 'border-emerald-500 bg-emerald-500 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:text-emerald-700'
                        }`}
                      >
                        {option.label} ({customerReconciliationFilterCounts[option.id] || 0})
                      </button>
                    );
                  })}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={handleExportCustomerReconciliationExcel}
                    disabled={isExportingCustomerReconciliation || filteredCustomerReconciliationRows.length === 0}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-emerald-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-emerald-700 transition hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Download size={14} /> Excel
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCustomerReconciliationPdf}
                    disabled={isExportingCustomerReconciliation || filteredCustomerReconciliationRows.length === 0}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isExportingCustomerReconciliation ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} PDF
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <div className="rounded-lg bg-indigo-50 px-2 py-1.5"><p className="text-[9px] font-bold uppercase text-indigo-500">Công ty mua</p><p className="text-[11px] font-black text-indigo-700">{formatCurrency(customerReconciliationSummary.companyPurchaseAmount)} đ</p></div>
                <div className="rounded-lg bg-emerald-50 px-2 py-1.5"><p className="text-[9px] font-bold uppercase text-emerald-500">Khách mua</p><p className="text-[11px] font-black text-emerald-700">{formatCurrency(customerReconciliationSummary.customerPurchaseAmount)} đ</p></div>
                <div className="rounded-lg bg-cyan-50 px-2 py-1.5"><p className="text-[9px] font-bold uppercase text-cyan-500">Đã thu / cấn</p><p className="text-[11px] font-black text-cyan-700">{formatCurrency(customerReconciliationSummary.paymentAmount)} đ</p></div>
                <div className="rounded-lg bg-amber-50 px-2 py-1.5"><p className="text-[9px] font-bold uppercase text-amber-500">Chờ đối soát</p><p className="text-[11px] font-black text-amber-700">{formatCurrency(customerReconciliationSummary.pendingAmount)} đ</p></div>
              </div>
              {customerReconciliationExportStatus && (
                <p className="text-[11px] font-semibold text-slate-600" role="status">{customerReconciliationExportStatus}</p>
              )}
            </div>
            <div className="space-y-2">
              {filteredCustomerReconciliationRows.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">Không có giao dịch phù hợp với bộ lọc đang chọn.</div>
              ) : filteredCustomerReconciliationRows.map(row => {
                const toneClass = row.tone === 'emerald'
                  ? 'border-emerald-100 bg-emerald-50/40'
                  : row.tone === 'amber'
                    ? 'border-amber-100 bg-amber-50/50'
                    : 'border-indigo-100 bg-indigo-50/40';
                const amountClass = row.tone === 'emerald'
                  ? 'text-emerald-700'
                  : row.tone === 'amber'
                    ? 'text-amber-700'
                    : 'text-indigo-700';
                const metricParts = [
                  row.metrics?.weightKg > 0 ? `${formatNumber(row.metrics.weightKg)} kg` : '',
                  row.metrics?.pieces > 0 ? `${formatNumber(row.metrics.pieces)} con` : '',
                  row.metrics?.priceLabel || ''
                ].filter(Boolean);
                const canOpenOrder = Boolean(row.orderId && canOpenOrderDetails);
                const RowContainer = canOpenOrder ? 'button' : 'div';
                return (
                  <RowContainer
                    key={row.id}
                    {...(canOpenOrder ? {
                      type: 'button',
                      onClick: () => onOpenOrder(row.orderId),
                      title: 'Mở chi tiết hóa đơn',
                      'aria-label': `Mở chi tiết ${row.reference || 'hóa đơn'}`
                    } : {})}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left ${toneClass} ${canOpenOrder ? 'transition-colors hover:border-emerald-300 hover:bg-emerald-50 focus:outline-none focus:ring-2 focus:ring-emerald-300' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
                          <span className="truncate">{row.title}</span>
                          {canOpenOrder && <ChevronRight size={14} className="shrink-0 text-emerald-600" />}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-600">{row.detail}</p>
                        {metricParts.length > 0 && (
                          <p className="mt-1 truncate text-[11px] font-medium text-slate-500">{metricParts.join(' • ')}</p>
                        )}
                        <p className="mt-1 text-[11px] text-slate-500">{row.dateLabel}{row.reference ? ` • ${row.reference}` : ''}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`text-sm font-black ${amountClass}`}>{formatCurrency(row.amount)} đ</p>
                        <p className={`mt-0.5 text-[10px] font-bold ${amountClass}`}>{row.amountLabel}</p>
                      </div>
                    </div>
                  </RowContainer>
                );
              })}
            </div>
            <div
              ref={customerReconciliationReportRef}
              aria-hidden="true"
              className="pointer-events-none fixed left-[-12000px] top-0 z-[-1]"
            >
              {customerReconciliationReportPages.map((pageRows, pageIndex) => (
                <section
                  key={`reconciliation-report-page-${pageIndex}`}
                  data-reconciliation-pdf-page
                  className="relative flex flex-col bg-white p-9 text-slate-900"
                  style={{ width: '794px', minHeight: '1123px' }}
                >
                  <div className="border-b-2 border-emerald-600 pb-4 text-center">
                    <p className="text-[24px] font-black uppercase tracking-[0.08em] text-emerald-800">Báo cáo đối chiếu công nợ</p>
                    <p className="mt-1 text-[13px] font-semibold text-slate-500">{currentCompany?.name || currentCompany?.companyName || currentCompany?.displayName || 'HD Manager'}</p>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1.5 rounded-xl bg-slate-50 px-4 py-3 text-[12px]">
                    <p><span className="font-bold">Khách hàng:</span> {getCustomerDisplayName(selectedCustomer) || selectedCustomer?.name || 'Khách hàng'}</p>
                    <p><span className="font-bold">Phạm vi:</span> {getCustomerReconciliationFilterLabel(customerReconciliationFilter)}</p>
                    <p><span className="font-bold">Ngày xuất:</span> {new Date().toLocaleString('vi-VN')}</p>
                    <p><span className="font-bold">Số giao dịch:</span> {filteredCustomerReconciliationRows.length}</p>
                  </div>
                  {pageIndex === 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                      <div className="rounded-lg bg-indigo-50 px-2 py-2"><p className="text-[9px] font-bold uppercase text-indigo-500">Công ty mua</p><p className="mt-1 text-[12px] font-black text-indigo-700">{formatCurrency(customerReconciliationSummary.companyPurchaseAmount)} đ</p></div>
                      <div className="rounded-lg bg-emerald-50 px-2 py-2"><p className="text-[9px] font-bold uppercase text-emerald-500">Khách mua</p><p className="mt-1 text-[12px] font-black text-emerald-700">{formatCurrency(customerReconciliationSummary.customerPurchaseAmount)} đ</p></div>
                      <div className="rounded-lg bg-cyan-50 px-2 py-2"><p className="text-[9px] font-bold uppercase text-cyan-500">Đã thu / cấn</p><p className="mt-1 text-[12px] font-black text-cyan-700">{formatCurrency(customerReconciliationSummary.paymentAmount)} đ</p></div>
                      <div className="rounded-lg bg-amber-50 px-2 py-2"><p className="text-[9px] font-bold uppercase text-amber-500">Chờ đối soát</p><p className="mt-1 text-[12px] font-black text-amber-700">{formatCurrency(customerReconciliationSummary.pendingAmount)} đ</p></div>
                    </div>
                  )}
                  <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                    <div
                      className="grid bg-emerald-700 px-2 py-2 text-[9px] font-black uppercase text-white"
                      style={{ gridTemplateColumns: '34px 72px 92px 96px minmax(0,1fr) 88px 102px' }}
                    >
                      <span>STT</span><span>Ngày</span><span>Phân loại</span><span>Chứng từ</span><span>Nội dung</span><span>Số lượng</span><span className="text-right">Số tiền</span>
                    </div>
                    {pageRows.map((row, rowIndex) => {
                      const quantityParts = [
                        row.metrics?.weightKg > 0 ? `${formatNumber(row.metrics.weightKg)} kg` : '',
                        row.metrics?.pieces > 0 ? `${formatNumber(row.metrics.pieces)} con` : ''
                      ].filter(Boolean);
                      return (
                        <div
                          key={`pdf-${row.id}-${rowIndex}`}
                          className="grid min-h-[52px] items-start border-t border-slate-100 px-2 py-2 text-[10px] leading-4"
                          style={{ gridTemplateColumns: '34px 72px 92px 96px minmax(0,1fr) 88px 102px' }}
                        >
                          <span>{(pageIndex * 14) + rowIndex + 1}</span>
                          <span>{row.dateLabel}</span>
                          <span className="font-bold">{getCustomerReconciliationDirectionLabel(row.direction)}</span>
                          <span className="break-all">{row.reference || '-'}</span>
                          <span className="min-w-0 pr-2"><strong>{row.title}</strong><br />{row.detail}<br /><em className="text-slate-500">{row.amountLabel}</em></span>
                          <span>{quantityParts.join(' / ') || '-'}{row.metrics?.priceLabel ? <><br />{row.metrics.priceLabel}</> : null}</span>
                          <span className="text-right font-black">{formatCurrency(row.amount)} đ</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-auto flex items-center justify-between border-t border-slate-200 pt-3 text-[10px] text-slate-400">
                    <span>Dữ liệu xuất trực tiếp từ lịch sử đối soát HD Manager</span>
                    <span>Trang {pageIndex + 1}/{customerReconciliationReportPages.length}</span>
                  </div>
                </section>
              ))}
            </div>
          </>
          )}
        </div>
        )}

        {canSeeCustomerLoans && (
        <div ref={customerLoansRef} className="bg-white rounded-2xl border border-cyan-100 p-4 shadow-sm space-y-3">
          <button type="button" onClick={() => toggleCustomerDetailSection('customerLoans')} className="flex w-full items-start justify-between gap-3 text-left">
            <div className="min-w-0">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Package size={16} className="text-cyan-600" /> Vay / Trả</h3>
              {!isCustomerDetailSectionOpen('customerLoans') && selectedCustomerLoanStats.open > 0 && (
                <p className="mt-1 text-xs font-semibold text-cyan-700">
                  Còn {selectedCustomerLoanStats.open} phiếu đang mở
                  {selectedCustomerLoanStats.remainingWeightKg > 0 ? ` • ${formatNumber(selectedCustomerLoanStats.remainingWeightKg)} kg` : ''}
                </p>
              )}
            </div>
            <span className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                selectedCustomerLoanStats.overdue > 0
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : selectedCustomerLoanStats.open > 0
                    ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                    : 'border-emerald-100 bg-emerald-50 text-emerald-700'
              }`}>
                {selectedCustomerLoanStats.overdue > 0 ? `${selectedCustomerLoanStats.overdue} quá hạn` : selectedCustomerLoanStats.open > 0 ? `${selectedCustomerLoanStats.open} đang vay` : 'Không còn vay'}
              </span>
              {isCustomerDetailSectionOpen('customerLoans') ? <ChevronUp size={17} className="text-cyan-600" /> : <ChevronDown size={17} className="text-cyan-600" />}
            </span>
          </button>

          {isCustomerDetailSectionOpen('customerLoans') && (
          <>
            {canCreateCustomerLoanRecord && (
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-3 space-y-3">
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">Tạo phiếu khách vay</p>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={customerLoanDraft.productName}
                    onChange={e => updateCustomerLoanDraft('productName', e.target.value)}
                    className="col-span-2 rounded-xl border border-cyan-100 bg-white p-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-cyan-300"
                    placeholder="Hàng hóa vay, ví dụ: Vịt, Gà, bao đá..."
                  />
                  <input
                    type="tel"
                    value={customerLoanDraft.quantity}
                    onChange={e => updateCustomerLoanDraft('quantity', e.target.value)}
                    className="rounded-xl border border-cyan-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-cyan-300"
                    placeholder="Số lượng"
                  />
                  <select
                    value={customerLoanDraft.unit}
                    onChange={e => updateCustomerLoanDraft('unit', e.target.value)}
                    className="rounded-xl border border-cyan-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-cyan-300"
                  >
                    {['Kg', 'Con', 'Bao', 'Bọc', 'Thùng', 'Cái', 'Bộ', 'Túi'].map(unit => <option key={unit} value={unit}>{unit}</option>)}
                  </select>
                  <input
                    type="tel"
                    value={customerLoanDraft.weightKg}
                    onChange={e => updateCustomerLoanDraft('weightKg', e.target.value)}
                    className="rounded-xl border border-cyan-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-cyan-300"
                    placeholder="Số kg nếu có"
                  />
                  <input
                    type="date"
                    value={customerLoanDraft.loanDate}
                    onChange={e => updateCustomerLoanDraft('loanDate', e.target.value || getTodayString())}
                    className="rounded-xl border border-cyan-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-cyan-300"
                  />
                  <input
                    type="date"
                    value={customerLoanDraft.dueDate}
                    onChange={e => updateCustomerLoanDraft('dueDate', e.target.value)}
                    className="rounded-xl border border-cyan-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-cyan-300"
                    title="Ngày hẹn trả"
                  />
                  <input
                    type="text"
                    value={customerLoanDraft.note}
                    onChange={e => updateCustomerLoanDraft('note', e.target.value)}
                    className="rounded-xl border border-cyan-100 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-cyan-300"
                    placeholder="Ghi chú"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateCustomerLoan}
                  disabled={isSavingCustomerLoan}
                  className="w-full rounded-xl bg-cyan-600 py-3 text-sm font-black text-white transition hover:bg-cyan-700 disabled:opacity-60"
                >
                  {isSavingCustomerLoan ? 'Đang lưu...' : 'Lưu phiếu vay'}
                </button>
              </div>
            )}

            {customerLoanStatus && (
              <p className="rounded-2xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-bold text-cyan-700">{customerLoanStatus}</p>
            )}

            <div className="space-y-2">
              {selectedCustomerLoans.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-cyan-100 bg-slate-50 p-4 text-center text-sm font-semibold text-slate-500">
                  Khách này chưa có phiếu vay/trả nào.
                </div>
              ) : selectedCustomerLoans.map(loan => {
                const balance = getCustomerLoanBalance(loan);
                const returnDraft = customerLoanReturnDrafts[loan.id] || { quantity: '', weightKg: '', returnDate: getTodayString(), note: '' };
                return (
                  <div key={loan.id} className={`rounded-2xl border p-3 shadow-sm ${balance.isOverdue ? 'border-rose-100 bg-rose-50/40' : balance.isClosed ? 'border-emerald-100 bg-emerald-50/40' : 'border-cyan-100 bg-white'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-slate-900">{loan.productName || loan.itemName || 'Hàng hóa vay'}</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                          Vay {formatDateLabel(loan.loanDate || loan.createdAt)}
                          {loan.dueDate ? ` • Hẹn trả ${formatDateLabel(loan.dueDate)}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${balance.isClosed ? 'bg-emerald-100 text-emerald-700' : balance.isOverdue ? 'bg-rose-100 text-rose-700' : 'bg-cyan-100 text-cyan-700'}`}>
                          {balance.isClosed ? 'Đã trả hết' : balance.isOverdue ? 'Quá hạn' : 'Đang vay'}
                        </span>
                        {canEditCustomerLoanRecord && (
                          <button type="button" onClick={() => openCustomerLoanEditor(loan)} className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] font-black text-cyan-700">
                            Sửa
                          </button>
                        )}
                        {canDeleteCustomerLoanRecord && (
                          <button type="button" onClick={() => handleArchiveCustomerLoan(loan)} className="rounded-full bg-rose-50 p-2 text-rose-500">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-xl bg-slate-50 px-2 py-2">
                        <p className="text-[10px] font-black uppercase text-slate-400">Đã vay</p>
                        <p className="mt-1 text-xs font-black text-slate-900">{buildCustomerLoanQuantityLabel(balance.borrowedQuantity, loan.unit, balance.borrowedWeightKg)}</p>
                      </div>
                      <div className="rounded-xl bg-emerald-50 px-2 py-2">
                        <p className="text-[10px] font-black uppercase text-emerald-600">Đã trả</p>
                        <p className="mt-1 text-xs font-black text-emerald-700">{buildCustomerLoanQuantityLabel(balance.returnedQuantity, loan.unit, balance.returnedWeightKg)}</p>
                      </div>
                      <div className="rounded-xl bg-amber-50 px-2 py-2">
                        <p className="text-[10px] font-black uppercase text-amber-600">Còn lại</p>
                        <p className="mt-1 text-xs font-black text-amber-700">{buildCustomerLoanQuantityLabel(balance.remainingQuantity, loan.unit, balance.remainingWeightKg)}</p>
                      </div>
                    </div>

                    {loan.note && <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500">{loan.note}</p>}

                    {editingCustomerLoanId === loan.id && canEditCustomerLoanRecord && (
                      <div className="mt-3 rounded-2xl border border-cyan-100 bg-cyan-50/50 p-3 space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-cyan-700">Sửa phiếu vay</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={customerLoanEditDrafts[loan.id]?.productName || ''}
                            onChange={e => updateCustomerLoanEditDraft(loan.id, 'productName', e.target.value)}
                            className="col-span-2 rounded-xl border border-cyan-100 bg-white p-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-cyan-300"
                            placeholder="Tên hàng hóa"
                          />
                          <input
                            type="tel"
                            value={customerLoanEditDrafts[loan.id]?.quantity || ''}
                            onChange={e => updateCustomerLoanEditDraft(loan.id, 'quantity', e.target.value)}
                            className="rounded-xl border border-cyan-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-cyan-300"
                            placeholder="Số lượng"
                          />
                          <select
                            value={customerLoanEditDrafts[loan.id]?.unit || loan.unit || 'Kg'}
                            onChange={e => updateCustomerLoanEditDraft(loan.id, 'unit', e.target.value)}
                            className="rounded-xl border border-cyan-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-cyan-300"
                          >
                            {['Kg', 'Con', 'Bao', 'Bọc', 'Thùng', 'Cái', 'Bộ', 'Túi'].map(unit => <option key={unit} value={unit}>{unit}</option>)}
                          </select>
                          <input
                            type="tel"
                            value={customerLoanEditDrafts[loan.id]?.weightKg || ''}
                            onChange={e => updateCustomerLoanEditDraft(loan.id, 'weightKg', e.target.value)}
                            className="rounded-xl border border-cyan-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-cyan-300"
                            placeholder="Số kg"
                          />
                          <input
                            type="date"
                            value={customerLoanEditDrafts[loan.id]?.loanDate || loan.loanDate || getTodayString()}
                            onChange={e => updateCustomerLoanEditDraft(loan.id, 'loanDate', e.target.value || getTodayString())}
                            className="rounded-xl border border-cyan-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-cyan-300"
                          />
                          <input
                            type="date"
                            value={customerLoanEditDrafts[loan.id]?.dueDate || ''}
                            onChange={e => updateCustomerLoanEditDraft(loan.id, 'dueDate', e.target.value)}
                            className="rounded-xl border border-cyan-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-cyan-300"
                          />
                          <input
                            type="text"
                            value={customerLoanEditDrafts[loan.id]?.note || ''}
                            onChange={e => updateCustomerLoanEditDraft(loan.id, 'note', e.target.value)}
                            className="rounded-xl border border-cyan-100 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-cyan-300"
                            placeholder="Ghi chú"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => setEditingCustomerLoanId('')} className="rounded-xl bg-white py-2.5 text-sm font-black text-slate-600">
                            Hủy
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveCustomerLoanEdit(loan)}
                            disabled={savingCustomerLoanEditId === loan.id}
                            className="rounded-xl bg-cyan-600 py-2.5 text-sm font-black text-white disabled:opacity-60"
                          >
                            {savingCustomerLoanEditId === loan.id ? 'Đang lưu...' : 'Lưu sửa'}
                          </button>
                        </div>
                      </div>
                    )}

                    {!balance.isClosed && canReturnCustomerLoanRecord && (
                      <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-700">Ghi nhận khách trả</p>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="tel"
                            value={returnDraft.quantity || ''}
                            onChange={e => updateCustomerLoanReturnDraft(loan.id, 'quantity', e.target.value)}
                            className="rounded-xl border border-emerald-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-emerald-300"
                            placeholder={`Số ${loan.unit || 'lượng'}`}
                          />
                          <input
                            type="tel"
                            value={returnDraft.weightKg || ''}
                            onChange={e => updateCustomerLoanReturnDraft(loan.id, 'weightKg', e.target.value)}
                            className="rounded-xl border border-emerald-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-emerald-300"
                            placeholder="Số kg"
                          />
                          <input
                            type="date"
                            value={returnDraft.returnDate || getTodayString()}
                            onChange={e => updateCustomerLoanReturnDraft(loan.id, 'returnDate', e.target.value || getTodayString())}
                            className="rounded-xl border border-emerald-100 bg-white p-3 text-sm text-center outline-none focus:ring-2 focus:ring-emerald-300"
                          />
                          <input
                            type="text"
                            value={returnDraft.note || ''}
                            onChange={e => updateCustomerLoanReturnDraft(loan.id, 'note', e.target.value)}
                            className="rounded-xl border border-emerald-100 bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-emerald-300"
                            placeholder="Ghi chú trả"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRecordCustomerLoanReturn(loan)}
                          disabled={savingCustomerLoanReturnId === loan.id}
                          className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                        >
                          {savingCustomerLoanReturnId === loan.id ? 'Đang ghi...' : 'Ghi trả'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
          )}
        </div>
        )}

        {canManageCustomerDebtLimit && (
        <div className="bg-white rounded-2xl border border-amber-100 p-4 shadow-sm space-y-3">
          <button type="button" onClick={() => toggleCustomerDetailSection('debtLimit')} className="flex w-full items-start justify-between gap-3 text-left">
            <div className="min-w-0">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><AlertCircle size={16} className="text-amber-500" /> Hạn mức công nợ</h3>
            </div>
            <span className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-black ${
                customerEditForm.debtLimitMode === 'limited'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : customerEditForm.debtLimitMode === 'unlimited'
                    ? 'border-slate-200 bg-slate-50 text-slate-600'
                    : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}>
                {customerEditForm.debtLimitMode === 'limited' ? 'Có hạn mức' : customerEditForm.debtLimitMode === 'unlimited' ? 'Không giới hạn' : 'Không cho nợ'}
              </span>
              {isCustomerDetailSectionOpen('debtLimit') ? <ChevronUp size={17} className="text-amber-600" /> : <ChevronDown size={17} className="text-amber-600" />}
            </span>
          </button>
          {isCustomerDetailSectionOpen('debtLimit') && (
          <>
          <p className="text-xs leading-5 text-slate-500">Mặc định khách không được nợ. Nếu cần cho nợ, hãy cấu hình riêng tại đây.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <select
              value={customerEditForm.debtLimitMode || 'no_debt'}
              onChange={e => setCustomerEditForm(prev => ({ ...prev, debtLimitMode: e.target.value, debtLimitAmount: e.target.value === 'limited' ? prev.debtLimitAmount : '' }))}
              className="w-full rounded-xl border border-amber-100 bg-white p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400"
            >
              <option value="no_debt">Không cho nợ</option>
              <option value="limited">Cho nợ tối đa</option>
              <option value="unlimited">Không giới hạn</option>
            </select>
            {customerEditForm.debtLimitMode === 'limited' ? (
              <input
                type="tel"
                value={formatInputCurrency(customerEditForm.debtLimitAmount)}
                onChange={e => setCustomerEditForm(prev => ({ ...prev, debtLimitAmount: parseInputCurrency(e.target.value) }))}
                className="w-full rounded-xl border border-amber-100 bg-white p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-amber-400"
                placeholder="Số tiền cho nợ tối đa"
              />
            ) : (
              <div className="rounded-xl border border-amber-50 bg-amber-50/50 p-3 text-xs font-semibold text-amber-700">
                {customerEditForm.debtLimitMode === 'unlimited' ? 'Khách được phép nợ không giới hạn.' : 'Giao hàng cần thu tiền ngay.'}
              </div>
            )}
            <button
              type="button"
              onClick={handleSaveCustomerDebtLimit}
              disabled={isSavingCustomerDebtLimit}
              className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-white transition hover:bg-amber-600 disabled:opacity-60"
            >
              {isSavingCustomerDebtLimit ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
          <div className="rounded-2xl border border-cyan-100 bg-cyan-50/50 p-3">
            <label className="flex cursor-pointer items-start justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-black text-slate-800">Đối soát</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">
                  Bật khi khách này cũng là nhà cung cấp/mua bán hai chiều với công ty.
                </span>
              </span>
              <input
                type="checkbox"
                checked={Boolean(customerEditForm.purchaseReconciliationEnabled)}
                onChange={e => setCustomerEditForm(prev => ({ ...prev, purchaseReconciliationEnabled: e.target.checked }))}
                className="mt-1 h-5 w-5 shrink-0 accent-cyan-600"
              />
            </label>
            {(customerEditForm.purchaseReconciliationEnabled || selectedCustomer.hasPurchaseReconciliation) && (
              <button
                type="button"
                onClick={handleOpenSelectedCustomerDebt}
                className="mt-3 w-full rounded-xl border border-cyan-100 bg-white px-3 py-2 text-left transition hover:border-cyan-200"
                title="Bấm để xem đối soát công nợ mua bán hai chiều"
              >
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <p className="shrink-0 text-[9px] font-black uppercase tracking-tight text-cyan-700">
                    {customerEditForm.purchaseReconciliationEnabled ? 'Khách liên kết' : 'Đã phát hiện mua hàng'}
                  </p>
                  <p className={`min-w-0 truncate text-[11px] font-black ${
                    selectedCustomer.currentDebt > 0
                      ? 'text-rose-600'
                      : selectedCustomer.creditBalance > 0
                        ? 'text-indigo-700'
                        : 'text-emerald-700'
                  }`}>
                    {selectedCustomer.currentDebt > 0
                      ? `${selectedCustomer.displayName || selectedCustomer.name || 'Khách'} - ${formatCurrency(selectedCustomer.currentDebt)} đ`
                      : selectedCustomer.creditBalance > 0
                        ? `Cty nợ ${selectedCustomer.displayName || selectedCustomer.name || 'khách'} - ${formatCurrency(selectedCustomer.creditBalance)} đ`
                        : 'Cân bằng'}
                  </p>
                </div>
                <p className="mt-1 line-clamp-2 text-[10px] font-semibold leading-snug text-slate-500">
                  Khách nợ {formatCurrency(selectedCustomer.salesDebtBeforeReconcile || 0)} đ • Cty nợ/mua {formatCurrency(selectedCustomer.purchaseDebt || 0)} đ • Cấn trừ {formatCurrency(selectedCustomer.reconciliationOffset || 0)} đ
                </p>
              </button>
            )}
          </div>
          {customerDebtLimitStatus && (
            <p className="rounded-2xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">{customerDebtLimitStatus}</p>
          )}
          </>
          )}
        </div>
        )}

        {canUseCustomerLoyalty && (
        <div data-customer-loyalty-section="true" className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <button data-customer-loyalty-heading="true" type="button" aria-expanded={isCustomerDetailSectionOpen('loyalty')} onClick={() => toggleCustomerDetailSection('loyalty')} className="flex w-full items-start justify-between gap-3 text-left">
            <div className="min-w-0">
              <h3 className="font-bold text-gray-800 flex items-center gap-2"><Gift size={16} className="text-amber-500" /> Tích điểm khách hàng</h3>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {selectedCustomer.loyalty?.enabled && (
                <span className="inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                  Đang bật
                </span>
              )}
              {isCustomerDetailSectionOpen('loyalty') ? <ChevronUp size={17} className="text-amber-600" /> : <ChevronDown size={17} className="text-amber-600" />}
            </div>
          </button>
          {isCustomerDetailSectionOpen('loyalty') && (
          <div data-customer-loyalty-content="true">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
              <p className="text-xs font-bold uppercase text-amber-700 mb-1">Điểm hiện có</p>
              <p className="text-xl font-black text-amber-700">{formatNumber(selectedCustomer.loyaltyPoints || 0)}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4">
              <p className="text-xs font-bold uppercase text-gray-500 mb-1">Giá trị tích điểm</p>
              <p className="text-lg font-black text-gray-800">{formatCurrency(selectedCustomer.loyaltyEligibleAmount || 0)} VNĐ</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-xs font-bold uppercase text-emerald-700 mb-1">Có thể đổi</p>
              <p className="text-lg font-black text-emerald-700">{formatCurrency(selectedCustomer.loyaltyRedeemValue || 0)} VNĐ</p>
            </div>
          </div>
          </div>
          )}
        </div>
        )}

        {canManageDriverDebtPermission && (
          <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
            <button type="button" onClick={() => toggleCustomerDetailSection('driverDebt')} className="flex w-full items-start justify-between gap-3 text-left">
              <div className="min-w-0">
                <h3 className="font-bold text-lg text-gray-800">Phân quyền tài xế</h3>
              </div>
              <span className="flex shrink-0 items-center gap-2">
                <span className={`text-[10px] px-2 py-1 rounded-full font-bold ${driverDebtAccessEnabledDraft ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {driverDebtAccessEnabledDraft ? 'Đang bật' : 'Đang tắt'}
                </span>
                {isCustomerDetailSectionOpen('driverDebt') ? <ChevronUp size={17} className="text-blue-600" /> : <ChevronDown size={17} className="text-blue-600" />}
              </span>
            </button>

            {isCustomerDetailSectionOpen('driverDebt') && (
            <>
            <button
              type="button"
              onClick={toggleDriverDebtAccess}
              aria-pressed={driverDebtAccessEnabledDraft}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 p-3 flex items-center justify-between gap-3 text-left transition-colors hover:bg-gray-100 active:scale-[0.99]"
            >
              <div>
                <p className="text-sm font-bold text-gray-800">Cho phép tài xế xem công nợ</p>
                <p className="text-xs text-gray-500 mt-1">Tắt/bật quyền xem theo từng khách hàng.</p>
              </div>
              <span
                className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold border transition-colors shrink-0 ${driverDebtAccessEnabledDraft ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-gray-500 border-gray-300'}`}
              >
                <span className={`w-2.5 h-2.5 rounded-full ${driverDebtAccessEnabledDraft ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                {driverDebtAccessEnabledDraft ? 'Đang bật' : 'Đang tắt'}
              </span>
            </button>

            {driverEmployees.length === 0 ? (
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-sm text-gray-500">
                Chưa có tài xế nào trong công ty được cấp quyền xem công nợ.
              </div>
            ) : (
              <div className="space-y-2">
                {driverEmployees.map(driver => {
                  const isChecked = allowedDriverIdsDraft.includes(driver.id);
                  return (
                    <label key={driver.id} className={`flex items-center gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${isChecked ? 'border-blue-200 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        disabled={!driverDebtAccessEnabledDraft}
                        onChange={() => toggleAllowedDriver(driver.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm">{driver.name}</p>
                        <p className="text-xs text-gray-500 mt-1">{driver.phone || 'Chưa có số điện thoại'}</p>
                      </div>
                      {isChecked && <span className="text-[10px] px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-bold">Được xem</span>}
                    </label>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveDriverAccess}
              disabled={isSavingDriverAccess}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white py-3 rounded-xl font-bold transition-colors"
            >
              {isSavingDriverAccess ? 'Đang lưu phân quyền...' : 'Lưu quyền xem công nợ'}
            </button>
            </>
            )}
          </div>
        )}

        {false && <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><Filter size={16}/> Lọc danh sách đơn hàng</h3>
            <span className="text-xs text-gray-400">{filteredOrders.length}/{selectedCustomer.orderCount} đơn</span>
          </div>
          <div className="bg-gray-50 px-3 py-2 rounded-xl border border-gray-100 flex items-center gap-2">
            <Search size={16} className="text-gray-400" />
            <input
              type="text"
              value={orderSearch}
              onChange={e => setOrderSearch(e.target.value)}
                  placeholder="Nhập hoặc chọn loại chi phí"
              className="flex-1 text-sm bg-transparent outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <select value={orderMonth} onChange={e => setOrderMonth(e.target.value)} className="w-full border border-gray-200 rounded-xl p-3 text-sm bg-white outline-none">
          <option value="">Tất cả</option>
              {availableOrderMonths.map(month => <option key={month} value={month}>Tháng {month.substring(5, 7)}/{month.substring(0, 4)}</option>)}
            </select>
            <select value={orderSort} onChange={e => setOrderSort(e.target.value)} className="w-full border border-gray-200 rounded-xl p-3 text-sm bg-white outline-none">
          <option value="">Tất cả</option>
          <option value="">Tất cả</option>
          <option value="">Tất cả</option>
          <option value="">Tất cả</option>
            </select>
          </div>
        </div>}

        {false && <ShareActionGrid
          title="Chia sẻ công nợ"
          description="Gửi nhanh tổng hợp công nợ cho khách qua bảng chia sẻ của máy, sao chép để gửi qua Zalo, Facebook, Messenger, hoặc lưu file để sử dụng khi cần."
          statusMessage={debtShareStatus}
          onQuickShare={() => handleShareDebt()}
          onShareToChannel={handleShareDebt}
          onCopy={handleCopyDebt}
          onDownload={handleDownloadDebt}
        />}

        {canSeeCustomerOrderHistory && (
        <div ref={customerOrderHistoryRef} className="scroll-mt-24 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button type="button" onClick={() => toggleCustomerDetailSection('orders')} className="w-full px-4 py-3 border-b border-gray-100 flex items-center justify-between text-left">
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><Receipt size={16}/> Lịch sử đơn hàng</h3>
            <span className="flex items-center gap-2 text-xs text-gray-400">
              {selectedCustomer.orderCount} đơn
              {isCustomerDetailSectionOpen('orders') ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </button>
          {isCustomerDetailSectionOpen('orders') && (
          <div className="divide-y divide-gray-50">
            {filteredOrders.length === 0 && <p className="p-4 text-center text-sm text-gray-400">Không có đơn hàng phù hợp với bộ lọc hiện tại.</p>}
            {filteredOrders.map(order => {
              const orderCode = formatOrderCode(order.id);
              const itemSummary = (order.items || []).map(item => `${item.description} x${item.quantity || 0}`).join(', ');
              return (
                <div key={order.id} className="p-4">
                  <div className="flex justify-between items-start gap-3 mb-2">
                    <div>
                      <h4 className="font-bold text-gray-800">{orderCode}</h4>
                      <p className="text-xs text-gray-500 flex items-center gap-1 mt-1"><CalendarDays size={12}/> {new Date(order.date).toLocaleDateString('vi-VN')}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-gray-800">{formatCurrency(order.amount)} đ</p>
                      <p className="text-[11px] text-gray-400">{(order.items || []).length} mặt hàng</p>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{itemSummary || 'Không có chi tiết sản phẩm.'}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className={`inline-flex mt-2 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                      order.outstandingAmount > 0
                        ? 'bg-rose-50 text-rose-700 border border-rose-100'
                        : 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                    }`}>
                      {order.outstandingAmount > 0 ? `Còn nợ ${formatCurrency(order.outstandingAmount)} đ` : 'Đã thanh toán hết'}
                    </span>
                    {order.creditApplied > 0 && <span className="text-[11px] px-2 py-1 rounded-full font-bold bg-blue-50 text-blue-600">Đã trừ tiền dư {formatCurrency(order.creditApplied)} đ</span>}
                  </div>
                  {order.extraExpenseName && order.customerExtraExpense > 0 && (
                    <p className="text-xs text-blue-600 font-medium mt-2">Phụ phí tính cho khách: {order.extraExpenseName} ({formatCurrency(order.customerExtraExpense)} đ)</p>
                  )}
                </div>
              );
            })}
          </div>
          )}
        </div>
        )}

        {canSeeCustomerPaymentHistory && (
        <div ref={customerPaymentHistoryRef} className="scroll-mt-24 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <button type="button" onClick={() => toggleCustomerDetailSection('payments')} className="w-full px-4 py-3 border-b border-gray-100 flex items-center justify-between text-left">
            <h3 className="font-bold text-gray-800 flex items-center gap-2"><Wallet size={16}/> Lịch sử thanh toán</h3>
            <span className="flex items-center gap-2 text-xs text-gray-400">
              {selectedCustomer.payments.length} lần thu
              {isCustomerDetailSectionOpen('payments') ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </span>
          </button>
          {isCustomerDetailSectionOpen('payments') && (
          <div className="divide-y divide-gray-50">
            {selectedCustomer.payments.length === 0 && <p className="p-4 text-center text-sm text-gray-400">Khách hàng này chưa có lịch sử thanh toán.</p>}
            {selectedCustomer.payments.map(payment => (
              <div key={payment.id} className="p-4 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-800">{payment.note || 'Thu nợ'}</p>
                  <p className="text-xs text-gray-500 mt-1">{formatDateLabel(getPaymentDateKey(payment) || payment.date)} • {getPaymentMethodLabel(payment)} • {getPaymentSourceLabel(payment)}</p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-[11px] px-2 py-1 rounded-full font-bold bg-emerald-50 text-emerald-600">Đã trừ nợ {formatCurrency(payment.appliedAmount || 0)} đ</span>
                    {(payment.overpaidAmount || 0) > 0 && <span className="text-[11px] px-2 py-1 rounded-full font-bold bg-blue-50 text-blue-600">Khách dư {formatCurrency(payment.overpaidAmount)} đ</span>}
                  </div>
                </div>
                <p className="font-black text-emerald-600">+{formatCurrency(payment.amount)} đ</p>
              </div>
            ))}
          </div>
          )}
        </div>
        )}

        {showCustomerDebtList && canSeeCustomerDebt && (
          <div
            className="fixed inset-0 z-[95] flex items-end justify-center bg-black/50 p-3 sm:items-center"
            onClick={() => setShowCustomerDebtList(false)}
          >
            <div
              className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-3xl bg-white p-4 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-600">Danh sách nợ</p>
                  <h3 className="mt-1 truncate text-lg font-black text-slate-900">
                    {selectedCustomer.displayName || getCustomerDisplayName(selectedCustomer) || selectedCustomer.name || 'Khách hàng'}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Tổng nợ: {formatCurrency(selectedCustomer.currentDebt || 0)} đ</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomerDebtList(false)}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500"
                  aria-label="Đóng danh sách nợ"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {selectedCustomerDebtOrders.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm font-semibold text-slate-500">
                    Khách này hiện không còn khoản nợ nào.
                  </p>
                ) : selectedCustomerDebtOrders.map(order => {
                  const orderCode = getLedgerOrderDisplayCode(order);
                  const paidAmount = parseLooseMoneyValue(order.appliedAmount) + parseLooseMoneyValue(order.creditApplied);
                  return (
                    <div key={order.id} className="rounded-2xl border border-rose-100 bg-rose-50/50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-900">{orderCode}</p>
                          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                            {formatDateLabel(order.date)}{order.isOpeningDebt ? ' • Nợ cũ' : ''}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-black text-rose-700">
                          {formatCurrency(order.outstandingAmount || 0)} đ
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-xl bg-white px-2 py-2">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Tổng</p>
                          <p className="mt-1 text-[11px] font-black text-slate-800">{formatCurrency(order.amount || 0)} đ</p>
                        </div>
                        <div className="rounded-xl bg-white px-2 py-2">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Đã thu</p>
                          <p className="mt-1 text-[11px] font-black text-emerald-700">{formatCurrency(paidAmount)} đ</p>
                        </div>
                        <div className="rounded-xl bg-white px-2 py-2">
                          <p className="text-[10px] font-bold uppercase text-slate-400">Còn nợ</p>
                          <p className="mt-1 text-[11px] font-black text-rose-700">{formatCurrency(order.outstandingAmount || 0)} đ</p>
                        </div>
                      </div>
                      {order.note && (
                        <p className="mt-2 text-[11px] font-semibold text-slate-500">{order.note}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>);
}
