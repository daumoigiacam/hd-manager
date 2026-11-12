import React from 'react';
// Exact existing JSX; parent retains all state, permissions, callbacks and data.
export default function CustomerCreateRender({context}) {
const {AlertCircle,CUSTOMER_HONORIFIC_OPTIONS,Check,ChevronLeft,Loader2,MapPin,Phone,Search,X,activeProductsForPricing,canAddCustomerLocationFields,canManageCustomerDebtLimit,canPickCustomerContact,canSeeCustomerDebt,closeAddCustomerModal,customerContactStatus,formatCustomerLocationForDisplay,formatCustomerNameDraft,formatInputCurrency,getCustomerContactPickerUnavailableMessage,getDuplicateCustomerDisplayName,handleAddCustomerSubmit,handleApplyNewCustomerLocationInput,handleCaptureNewCustomerLocation,handlePickCustomerContact,inferCustomerHonorificFromName,isCapturingNewCustomerLocation,isPickingCustomerContact,isSales,isSavingNewCustomer,localCustomerSource,newCus,newCustomerPhoneDuplicate,newCustomerProductIds,newCustomerProductOptions,newCustomerProductSearch,newCustomerProductSuggestionLimit,newCustomerProductUsageById,parseInputCurrency,salesEmployees,selectedNewCustomerProductIdSet,setNewCus,setNewCustomerProductSearch,toTitleCase,toggleNewCustomerProduct}=context;
return (<div className="hd-customer-create-view hd-child-view animate-in fade-in" aria-label="Tạo khách hàng">
          <div className="hd-customer-create-view__surface hd-child-view__surface">
            <div className="hd-customer-create-view__header hd-child-view__header">
              <button type="button" onClick={closeAddCustomerModal} aria-label="Quay lại danh sách khách hàng">
                <ChevronLeft size={22} />
              </button>
              <div>
                <h3>Tạo khách hàng</h3>
              </div>
            </div>
            <form onSubmit={handleAddCustomerSubmit} className="hd-child-view__form text-[14px]">
              <div className="hd-customer-create-view__form hd-child-view__body space-y-3">
              {customerContactStatus && (
                <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-700">
                  {customerContactStatus}
                </div>
              )}
              <div className="hd-customer-create-view__identity-row grid grid-cols-[92px_minmax(0,1fr)] gap-2">
                <select
                  value={newCus.customerHonorific || ''}
                  onChange={e => setNewCus(prev => ({ ...prev, customerHonorific: e.target.value }))}
                  className="w-full border p-3 rounded-xl outline-none bg-white text-sm focus:ring-2 focus:ring-emerald-500"
                  aria-label="Xưng hô khách hàng"
                >
                  {CUSTOMER_HONORIFIC_OPTIONS.map(option => <option key={option.value || 'empty'} value={option.value}>{option.label}</option>)}
                </select>
                <input aria-label="Tên khách hoặc công ty" required type="text" value={newCus.name} onChange={e=>setNewCus({...newCus, name: formatCustomerNameDraft(e.target.value), customerHonorific: newCus.customerHonorific || inferCustomerHonorificFromName(e.target.value)})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Tên khách / Công ty" />
              </div>
              <div className="hd-customer-create-view__phone-row">
                <input aria-label="Số điện thoại khách hàng" required type="tel" value={newCus.phone} onChange={e=>setNewCus({...newCus, phone: e.target.value})} className="w-full border p-3 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 text-sm" placeholder="Số điện thoại" />
                <button
                  type="button"
                  onClick={handlePickCustomerContact}
                  disabled={isPickingCustomerContact}
                  title={canPickCustomerContact ? undefined : getCustomerContactPickerUnavailableMessage()}
                  className="hd-customer-create-view__contact-button"
                  aria-label="Lấy từ danh bạ điện thoại"
                >
                  <Phone size={16} />
                  <span>{isPickingCustomerContact ? 'Đang mở' : 'Danh bạ'}</span>
                </button>
              </div>
              {newCustomerPhoneDuplicate && (
                <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700 flex items-start gap-2">
                  <AlertCircle size={15} className="mt-0.5 shrink-0" />
                  <span>Số điện thoại này đã có ở {getDuplicateCustomerDisplayName(newCustomerPhoneDuplicate)}. Vui lòng kiểm tra lại để tránh tạo trùng.</span>
                </div>
              )}
              <div className={`hd-customer-create-view__paired-row ${canAddCustomerLocationFields ? '' : 'hd-customer-create-view__paired-row--single'}`}>
                <label className="hd-customer-create-view__compact-field">
                  <input aria-label="Địa chỉ giao hàng" type="text" value={newCus.address} onChange={e=>setNewCus({...newCus, address: toTitleCase(e.target.value)})} placeholder="Địa chỉ giao hàng" />
                </label>
                {canAddCustomerLocationFields && (
                  <div className="hd-customer-create-view__compact-field hd-customer-create-view__maps-field">
                    <div>
                      <input
                        aria-label="Vị trí Maps"
                        type="text"
                        value={newCus.locationInput || ''}
                        onChange={e => setNewCus(prev => ({ ...prev, locationInput: e.target.value }))}
                        placeholder="Maps"
                      />
                      <button type="button" onClick={handleApplyNewCustomerLocationInput} aria-label="Lưu vị trí Maps" title="Lưu vị trí Maps">
                        <Check size={14} />
                      </button>
                      <button type="button" onClick={handleCaptureNewCustomerLocation} disabled={isCapturingNewCustomerLocation} aria-label="Lấy GPS hiện tại" title="Lấy GPS hiện tại">
                        {isCapturingNewCustomerLocation ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />}
                      </button>
                    </div>
                    {newCus.location && <small>{formatCustomerLocationForDisplay(newCus.location)}</small>}
                  </div>
                )}
              </div>
              <div className={`hd-customer-create-view__paired-row ${isSales ? 'hd-customer-create-view__paired-row--single' : ''}`}>
                <label className="hd-customer-create-view__compact-field">
                  <input aria-label="Nhóm khách hàng" type="text" value={newCus.customerGroup} onChange={e=>setNewCus({...newCus, customerGroup: toTitleCase(e.target.value)})} placeholder="Nhóm KH" />
                </label>
                {!isSales && (
                  <label className="hd-customer-create-view__compact-field">
                    <select aria-label="Nhân viên phụ trách" required value={newCus.empId} onChange={e=>setNewCus({...newCus, empId: e.target.value})}>
                      <option value="" disabled>NV phụ trách</option>
                      {salesEmployees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </label>
                )}
              </div>
              {canSeeCustomerDebt && (
                <div className="hd-customer-create-view__opening-balance">
                  <div className="hd-customer-create-view__opening-balance-header">
                    <p>Nợ cũ</p>
                    <div className="hd-customer-create-view__debt-tabs" role="tablist" aria-label="Loại nợ cũ">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={(newCus.openingBalanceType || 'receivable') === 'receivable'}
                        className={(newCus.openingBalanceType || 'receivable') === 'receivable' ? 'is-active is-receivable' : ''}
                        onClick={() => setNewCus(prev => ({ ...prev, openingBalanceType: 'receivable' }))}
                      >
                        Khách nợ
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={newCus.openingBalanceType === 'payable'}
                        className={newCus.openingBalanceType === 'payable' ? 'is-active is-payable' : ''}
                        onClick={() => setNewCus(prev => ({ ...prev, openingBalanceType: 'payable' }))}
                      >
                        Công ty nợ
                      </button>
                    </div>
                  </div>
                  {(newCus.openingBalanceType || 'receivable') === 'receivable' ? (
                    <div className="hd-customer-create-view__debt-panel is-receivable" role="tabpanel">
                      <input
                        aria-label="Số tiền khách nợ công ty"
                        type="tel"
                        value={formatInputCurrency(newCus.openingDebtAmount)}
                        onChange={e => setNewCus(prev => ({ ...prev, openingDebtAmount: parseInputCurrency(e.target.value) }))}
                        placeholder="Số tiền khách còn nợ"
                      />
                      <input
                        aria-label="Ghi chú khách nợ công ty"
                        type="text"
                        value={newCus.openingDebtNote || ''}
                        onChange={e => setNewCus(prev => ({ ...prev, openingDebtNote: e.target.value }))}
                        placeholder="Ghi chú nếu cần"
                      />
                    </div>
                  ) : (
                    <div className="hd-customer-create-view__debt-panel is-payable" role="tabpanel">
                      <input
                        aria-label="Số tiền công ty nợ khách"
                        type="tel"
                        value={formatInputCurrency(newCus.openingPayableAmount)}
                        onChange={e => setNewCus(prev => ({ ...prev, openingPayableAmount: parseInputCurrency(e.target.value) }))}
                        placeholder="Số tiền công ty còn nợ"
                      />
                      <input
                        aria-label="Ghi chú công ty nợ khách"
                        type="text"
                        value={newCus.openingPayableNote || ''}
                        onChange={e => setNewCus(prev => ({ ...prev, openingPayableNote: e.target.value }))}
                        placeholder="Ghi chú nếu cần"
                      />
                    </div>
                  )}
                </div>
              )}

              {canManageCustomerDebtLimit && (
                <div className="hd-customer-create-view__debt-limit">
                  <div className="hd-customer-create-view__debt-limit-row">
                    <p>Hạn mức nợ</p>
                    <select
                      aria-label="Hạn mức nợ"
                      value={newCus.debtLimitMode || 'no_debt'}
                      onChange={e => setNewCus(prev => ({ ...prev, debtLimitMode: e.target.value, debtLimitAmount: e.target.value === 'limited' ? prev.debtLimitAmount : '' }))}
                    >
                      <option value="unlimited">Không giới hạn</option>
                      <option value="no_debt">Không cho nợ</option>
                      <option value="limited">Cho nợ tối đa</option>
                    </select>
                  </div>
                  {newCus.debtLimitMode === 'limited' && (
                    <input
                      aria-label="Số tiền cho nợ tối đa"
                      type="tel"
                      value={formatInputCurrency(newCus.debtLimitAmount)}
                      onChange={e => setNewCus(prev => ({ ...prev, debtLimitAmount: parseInputCurrency(e.target.value) }))}
                      placeholder="Số tiền cho nợ tối đa"
                    />
                  )}
                </div>
              )}

              <div className="hd-customer-create-view__products">
                <div className="hd-customer-create-view__products-header">
                  <p className="hd-customer-create-view__products-title">SP khách lấy</p>
                  <div className="hd-customer-create-view__product-search">
                    <Search size={15} className="text-emerald-500" />
                    <input
                      data-hd-search-input="true"
                      aria-label="Tìm SP khách lấy"
                      type="text"
                      value={newCustomerProductSearch}
                      onChange={(e) => setNewCustomerProductSearch(e.target.value)}
                      placeholder="Tìm sản phẩm"
                    />
                    {newCustomerProductSearch && (
                      <button type="button" onClick={() => setNewCustomerProductSearch('')} aria-label="Xóa tìm kiếm sản phẩm" className="text-slate-400">
                        <X size={15} />
                      </button>
                    )}
                  </div>
                </div>

                {newCustomerProductIds.length > 0 && (
                  <p className="hd-customer-create-view__product-count">Đã chọn {newCustomerProductIds.length} sản phẩm</p>
                )}

                <div className="hd-customer-create-view__product-grid" data-suggestion-limit={newCustomerProductSuggestionLimit}>
                  {newCustomerProductOptions.slice(0, newCustomerProductSuggestionLimit).map(product => {
                    const isSelected = selectedNewCustomerProductIdSet.has(product.id);
                    const usage = newCustomerProductUsageById.get(product.id) || { quantity: 0, count: 0, lastTime: 0 };
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => toggleNewCustomerProduct(product.id)}
                        aria-pressed={isSelected}
                        data-product-usage-quantity={usage.quantity}
                        data-product-usage-count={usage.count}
                        data-product-usage-last-time={usage.lastTime}
                        className={isSelected ? 'is-selected' : ''}
                      >
                        <span className="hd-customer-create-view__product-check">
                          <Check size={13} />
                        </span>
                        <span className="hd-customer-create-view__product-copy">
                          <strong>{product.name}</strong>
                          <small>
                            {product.category || product.unit || 'Sản phẩm'}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                  {activeProductsForPricing.length === 0 && (
                    <p className="hd-customer-create-view__product-empty">
                      {localCustomerSource?.queryManaged?'Chưa tải danh mục sản phẩm trên thiết bị.':'Chưa có sản phẩm trong danh mục.'}
                    </p>
                  )}
                  {activeProductsForPricing.length > 0 && newCustomerProductOptions.length === 0 && (
                    <p className="hd-customer-create-view__product-empty">
                      Không tìm thấy sản phẩm phù hợp.
                    </p>
                  )}
                </div>
              </div>

              </div>
              <div className="hd-customer-create-view__actions hd-child-view__actions">
                <button type="button" disabled={isSavingNewCustomer} onClick={closeAddCustomerModal}>Hủy</button>
                <button type="submit" disabled={isSavingNewCustomer || !!newCustomerPhoneDuplicate}>{isSavingNewCustomer ? 'Đang lưu...' : 'Lưu khách hàng'}</button>
              </div>
            </form>
          </div>
        </div>);
}
