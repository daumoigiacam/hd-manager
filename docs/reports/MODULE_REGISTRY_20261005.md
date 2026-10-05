# HD Manager Module Registry - 2026-10-05

Source commit: 1bd05fc02f3271e37989066ef678bdfd3eb42d80. Phase 1 discovery only.

27 registry entries: 24 navigation selectors, profile outside the menu, authentication, and customer portal. Home and executive_dashboard share a renderer; more is a navigation container. These are discoverable surfaces, not 27 independent business engines.

Every certification is BLOCKED until the module-specific evidence required by the master task is collected. This does not mean every module is defective. Historical passing paths remain protected from unmotivated changes.

| Module | Category | Primary screen | Priority | Certification |
| --- | --- | --- | --- | --- |
| home | C | ExecutiveDashboardView | 20 | BLOCKED |
| executive_dashboard | C | ExecutiveDashboardView | 21 | BLOCKED |
| order_requests | A | OrderRequestView | 6 | BLOCKED |
| orders | A | OrderManagementView | 5 | BLOCKED |
| warehouse_dispatch | A | WarehouseDispatchView | 1 | BLOCKED |
| delivery_reports | B | DeliveryReportView | 25 | BLOCKED |
| warehouse_import | A | WarehouseImportView | 2 | BLOCKED |
| customers | B | CustomerCRMView | 27 | BLOCKED |
| debt | A | DebtManagementView | 4 | BLOCKED |
| finance | A | FinanceView | 3 | BLOCKED |
| bank_payments | A | BankPaymentCenterView | 8 | BLOCKED |
| messages | C | MessageCenterView | 31 | BLOCKED |
| pricing | A | SimplePricingEngineView | 12 | BLOCKED |
| company_attendance | B | AttendanceView | 33 | BLOCKED |
| employee_reviews | B | EmployeeReviewModuleView | 34 | BLOCKED |
| asset_management | B | AssetManagementView | 35 | BLOCKED |
| payroll | A | SalaryView | 7 | BLOCKED |
| employees | B | EmployeeView | 37 | BLOCKED |
| products | A | ProductManagementView | 11 | BLOCKED |
| price_quotes | B | PriceQuoteBroadcastView | 39 | BLOCKED |
| settings | C | SettingsView | 40 | BLOCKED |
| role_permissions | A | RolePermissionView | 10 | BLOCKED |
| billing | C | BillingView | 42 | BLOCKED |
| more | C | MoreMenu | 43 | BLOCKED |
| profile | C | ProfileView | 44 | BLOCKED |
| identity | A | LoginRegisterView | 9 | BLOCKED |
| customer_portal | A | CustomerPortalView | 13 | BLOCKED |

## home - Trang chủ

| Field | Source-derived mapping |
| --- | --- |
| Module | home |
| Category | C - Supporting |
| Routes | MainAppView activeTab=home |
| Screens | ExecutiveDashboardView |
| Features | dashboard widgets, financial summary, personal home |
| Actions | onLoadPayrollPeriodSnapshots |
| Entities | customers, products, orders, payments, expenses, financials, attendance, performance, warehouseImports, warehouseDispatches, payrollPeriods, employeeReviews, customerComplaints, holidays, deliveryReports |
| Firebase Collections | customers, products, orders, payments, expenses, financials, attendance, performance, warehouseImports, warehouseDispatches, payrollPeriods, employeeReviews, customerComplaints, holidays, deliveryReports |
| Firebase Functions | None directly mapped; shared Firestore data path |
| Repositories/Services | executiveDashboardService; recordCalculationCache |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 21 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | executiveDashboardService; recordCalculationCache |
| Criticality | Supporting |
| Current Status | BLOCKED |
| Priority | 20 |
| Definition Evidence | src/App.jsx:40612 |
| Subview/Modal State | [activeExecutiveTab, setActiveExecutiveTab]@40642; [showMobileReportAssistant, setShowMobileReportAssistant]@40643; [showExecutiveWidgetCustomizer, setShowExecutiveWidgetCustomizer]@40644; [showDailyFinanceDetails, setShowDailyFinanceDetails]@40687 |
| Handler Evidence | updateExecutiveWidgetPreferences@40665; moveExecutiveWidget@40673; moveExecutiveWidgetBefore@40677; toggleExecutiveWidget@40681; resetExecutiveWidgets@40685; toggleExecutiveList@40689; formatKpiValue@40797; formatPercent@40800; finiteFinanceNumber@40803; firstFiniteFinanceNumber@40807; getSeriesPeriodTotal@40818; getKpiDelta@40827; parseDashboardDateKey@40936; sumFinanceRowsBetween@40941; ensureRow@41005; isActiveRecord@41012; getOrderRevenue@41019; getExpenseAmount@41029; resolveFinanceDateKey@41030; getExpenseDateValue@41073; renderSeriesBars@41143; renderAlerts@41163; renderRecommendations@41197; renderProfitabilityRows@41223; renderProfitabilitySummary@41308; onRowClick@41322; onRowClick@41351; renderOrderedExecutiveWidgets@41387; renderBusinessContent@41395; renderCostRankingRows@41400; renderTabContent@41461; onRowClick@41512; onRowClick@41521; onRowClick@41530; onRowClick@41539 |

## executive_dashboard - Điều hành

| Field | Source-derived mapping |
| --- | --- |
| Module | executive_dashboard |
| Category | C - Supporting |
| Routes | MainAppView activeTab=executive_dashboard |
| Screens | ExecutiveDashboardView |
| Features | period report, charts, operational KPIs, AI dialog |
| Actions | onLoadPayrollPeriodSnapshots |
| Entities | customers, products, orders, orderRequests, payments, expenses, financials, warehouseImports, warehouseDispatches, warehouseStockCounts, assets, assetCostLogs, deliveryReports, attendance, performance, payrollPeriods, employeeReviews, customerComplaints, holidays |
| Firebase Collections | customers, products, orders, orderRequests, payments, expenses, financials, warehouseImports, warehouseDispatches, warehouseStockCounts, assets, assetCostLogs, deliveryReports, attendance, performance, payrollPeriods, employeeReviews, customerComplaints, holidays |
| Firebase Functions | geminiGenerateContent |
| Repositories/Services | executiveDashboardService; BusinessReportWorkspace; reportViewModel |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 21 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | executiveDashboardService; BusinessReportWorkspace; reportViewModel |
| Criticality | Supporting |
| Current Status | BLOCKED |
| Priority | 21 |
| Definition Evidence | src/App.jsx:40612 |
| Subview/Modal State | [activeExecutiveTab, setActiveExecutiveTab]@40642; [showMobileReportAssistant, setShowMobileReportAssistant]@40643; [showExecutiveWidgetCustomizer, setShowExecutiveWidgetCustomizer]@40644; [showDailyFinanceDetails, setShowDailyFinanceDetails]@40687 |
| Handler Evidence | updateExecutiveWidgetPreferences@40665; moveExecutiveWidget@40673; moveExecutiveWidgetBefore@40677; toggleExecutiveWidget@40681; resetExecutiveWidgets@40685; toggleExecutiveList@40689; formatKpiValue@40797; formatPercent@40800; finiteFinanceNumber@40803; firstFiniteFinanceNumber@40807; getSeriesPeriodTotal@40818; getKpiDelta@40827; parseDashboardDateKey@40936; sumFinanceRowsBetween@40941; ensureRow@41005; isActiveRecord@41012; getOrderRevenue@41019; getExpenseAmount@41029; resolveFinanceDateKey@41030; getExpenseDateValue@41073; renderSeriesBars@41143; renderAlerts@41163; renderRecommendations@41197; renderProfitabilityRows@41223; renderProfitabilitySummary@41308; onRowClick@41322; onRowClick@41351; renderOrderedExecutiveWidgets@41387; renderBusinessContent@41395; renderCostRankingRows@41400; renderTabContent@41461; onRowClick@41512; onRowClick@41521; onRowClick@41530; onRowClick@41539 |

## order_requests - Đơn đặt

| Field | Source-derived mapping |
| --- | --- |
| Module | order_requests |
| Category | A - Critical Business/Security |
| Routes | MainAppView activeTab=order_requests |
| Screens | OrderRequestView |
| Features | create/edit/delete, quantity/unit/size/price, previous order suggestions, search/filter, grouped table, image sharing |
| Actions | onAddOrderRequest, onEditOrderRequest, onDeleteOrderRequest, onEditCustomer, onGetCustomerProductPreference, onSaveCustomerProductPreference, onSyncCustomerFixedProductDefaults, onQuickActionHandled |
| Entities | customers, products, orderRequests, warehouseDispatches, employees |
| Firebase Collections | customers, products, orderRequests, warehouseDispatches, employees |
| Firebase Functions | None directly mapped; shared Firestore data path |
| Repositories/Services | previousOrderSuggestions; orderRequestEditing; orderRequestShare; cooperativeProjection |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 82 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | previousOrderSuggestions; orderRequestEditing; orderRequestShare; cooperativeProjection |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 6 |
| Definition Evidence | src/App.jsx:59091 |
| Subview/Modal State | [showForm, setShowForm]@59145; [sheetStatus, setSheetStatus]@59159; [isSheetExporting, setIsSheetExporting]@59160; orderRequestSheetAssetCacheRef@59161; orderRequestSheetPendingCacheRef@59162; [internalShowRequestFilterPanel, setInternalShowRequestFilterPanel]@59164; getRequestSheetRows@59746; sortRequestSheetRows@59781; sortEditableRequestRows@59782; requestSheetRows@59783; mergedRequestSheetRows@59788; getEditableRequestBaseRows@60067; editableCurrentDayRows@60121; editableRowsBySales@60138 |
| Handler Evidence | createDraftItem@59110; createDraft@59132; openRequestDatePicker@59205; handleScreenBack@59219; getOrderRequestFixedProducts@59302; resolveDraftItemQuantityUnit@59309; getDraftItemUnitOptions@59325; handleDraftItemQuantityUnitChange@59346; openDraftItemUnitEditor@59367; selectOrderUnitEditorValue@59385; addCustomOrderUnitEditorValue@59396; saveDraftItemUnitEditor@59404; getOrderRequestBranchRef@59448; getDefaultOrderRequestBranchRef@59460; formatOrderRequestBranchLabel@59469; resolveRequestSalesEmpId@59484; isCustomerPortalOrderRequest@59495; getCustomerPortalApprovalState@59500; getCustomerPortalApprovalLabel@59507; canApproveCustomerPortalRequest@59513; resolveSalesEmployeeName@59520; resolveQuantityUnitOption@59525; buildOrderVoiceContext@59539; cleanupOrderVoiceResources@59544; stopOrderVoiceCapture@59552; setRequestFilterDateFromUser@59574; resetOrderRequestFilters@59578; resolveOrderRequestDateKey@59606; canEmployeeViewRequest@59617; getOrderRequestProductSortLabel@59689; compareOrderRequestRowsByProduct@59694; compareOrderRequestRowsByRecent@59709; getOrderRequestMainGroupLabel@59718; hasToken@59729; getOrderRequestRowNoteText@59736; getOrderRequestRowProductLabel@59737; getOrderRequestSizeCellLabel@59738; buildOrderRequestProductCellText@59739; buildOrderRequestVariantKey@59924; getDraftItemVariantKey@59931; buildRequestDraftFromExisting@60030; calculateRequestAmount@60063; isOrderRequestRowFullyDispatchedForShare@60213; resetInlineEditing@60338; getOrderRequestDepositAmount@60344; promptEditOrderRequestDeposit@60348; updateCustomerPortalOrderApproval@60372; startInlineEditRow@60420; saveInlineEditRow@60447; deleteInlineEditRow@60558; canEditOrderCellField@60605; openOrderCellEditor@60612; closeOrderCellEditor@60619; handleOrderCellValueChange@60624; handleOrderCellQuantityUnitChange@60678; saveOrderCellEditor@60687; deleteOrderCellEditorRow@60699; getOrderCellEditorConfig@60709; updateDraft@60780; updateDraftItem@60788; handleCustomerChange@60803; handleBranchChange@60851; handleProductChange@60897; buildQuickProductDraftItem@60943; handleQuickProductSelect@60984; getOrderVoiceRecognitionConstructor@61049; getOrderVoiceRecorderMimeType@61054; applyOrderVoiceExtraction@61064; extractOrderVoiceItems@61158; applyOrderVoiceDraftExtraction@61196; transcribeOrderVoiceAudio@61275; startRecordedOrderVoiceCapture@61288; handleStartOrderVoice@61342; addRequestDraft@61414; duplicateRequestDraft@61418; removeRequestDraft@61438; addDraftItem@61443; duplicateDraftItem@61449; removeDraftItem@61465; openOrderRequestForm@61475; openOrderRequestEditForm@61494; closeOrderRequestForm@61513; openManualOrderSetup@61537; openVoiceOrderEntry@61549; continueManualOrderEntry@61553; formatSheetSize@61562; formatOrderRequestSizeCell@61569; formatSheetQuantity@61573; buildOrderRequestSheetFilename@61585; buildOrderRequestSheetPages@61588; renderOrderRequestSheetCanvas@61597; clamp@61633; measureWithFont@61634; maxMeasure@61642; splitLongWord@61654; wrapCanvasText@61671; wrapCanvasMultilineText@61693; drawLines@61834; renderOrderRequestSheetCanvases@61884; prepareOrderRequestSheetBlobs@61892; shareOrderRequestSheetBlobs@61981; handleShareOrderRequestSheet@62058; handleDownloadOrderRequestSheet@62091; handleSubmitOrderRequests@62116 |

## orders - Đơn hàng

| Field | Source-derived mapping |
| --- | --- |
| Module | orders |
| Category | A - Critical Business/Security |
| Routes | MainAppView activeTab=orders |
| Screens | OrderManagementView |
| Features | manual/from-dispatch/image create, edit fees/items/prices, payment, invoice, archive, share QR |
| Actions | onAddOrder, onEditOrder, onApproveOrderZaloSend, onUpdateOrderZaloMessage, onSyncPayosPaymentStatus, onEnsureOrderPayosPayment, onToggleArchiveOrder, onDeleteOrder, onAddPayment, onAddCustomer, onAddExpense, onResolveDeliveryReportIssue, onOpenCustomerZaloLink, onQuickActionHandled |
| Entities | customers, products, orders, orderRequests, warehouseDispatches, deliveryReports, payments, zalo_send_queue |
| Firebase Collections | customers, products, orders, orderRequests, warehouseDispatches, deliveryReports, payments, zalo_send_queue |
| Firebase Functions | createPayosPaymentLink; syncPayosPaymentStatus |
| Repositories/Services | productPricingUnits; customerProductBilling; orderSearchState; CoreRowPager |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 73 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | productPricingUnits; customerProductBilling; orderSearchState; CoreRowPager |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 5 |
| Definition Evidence | src/App.jsx:63790 |
| Subview/Modal State | [showAddOrder, setShowAddOrder]@63791; [showOrderSourcePicker, setShowOrderSourcePicker]@63792; [showQuickAddCus, setShowQuickAddCus]@63794; [tab, setTab]@63807; [localShowSearchBox, setLocalShowSearchBox]@63809; [localShowFilterPanel, setLocalShowFilterPanel]@63810; [showCusDropdown, setShowCusDropdown]@63825 |
| Handler Evidence | createEmptyOrderItem@63879; getDefaultSalesEmpId@63880; createSingleOrderState@63881; createBulkOrderDraft@63898; shouldShowOrderNote@63939; getOrderOutstandingBalance@64101; normalizeOrderPaymentSnapshot@64150; getItemText@64199; getCustomerText@64202; resetOrderListFilters@64236; openOrderDetail@64384; closeOrderDetail@64394; isOrderDraft@64410; canEditDraftOrder@64411; canEditOrderRecord@64417; canEditOrderItemRecord@64418; buildEditableOrderPayload@64420; commitOrderEdit@64479; promptEditOrderMoney@64499; patch@64506; patch@64511; openOrderPaymentModal@64544; closeOrderPaymentModal@64560; submitOrderPayment@64564; openOrderFeeEditor@64611; closeOrderFeeEditor@64622; saveOrderFeeEditor@64627; createReturnGoodsRecordId@64649; openOrderReturnEditor@64651; closeOrderReturnEditor@64659; saveOrderReturnEditor@64665; openOrderItemEditor@64737; closeOrderItemEditor@64754; saveOrderItemEditor@64758; promptEditOrderItem@64802; findOrderItemIndexForDeliveryIssue@64840; buildOrderPatchFromDeliveryIssue@64857; handleResolveDeliveryIssue@64882; getOrderStatusMeta@64955; getOrderReviewMeta@64971; getOrderZaloSendMeta@64988; getOrderItemBillingPresentation@64998; formatOrderItemBillingLine@65002; buildOrderZaloMessageLegacy@65013; buildOrderZaloMessage@65035; getOrderZaloMessageDraft@65074; openZaloPreview@65079; saveZaloPreviewDraft@65086; approveOrderZaloSend@65095; syncOrderPayosPayment@65124; buildOrderShareText@65162; resolveShareStatusMessage@65207; handleShareOrder@65221; handleAddItem@65322; handleRemoveItem@65323; handleItemChange@65327; handleItemProductChange@65332; handleQuickAddCustomer@65348; normalizeOrderItemsForSubmit@65359; resolveCustomerForOrderDraft@65380; submitOrderDraft@65424; isOrderSaveTimeoutError@65495; handleAddBulkDraft@65504; handleLoadWarehouseDispatchDrafts@65513; findOrderRequestPricingForDispatch@65571; handleBulkDraftChange@65815; refreshBulkDraftItemBilling@65819; handleBulkDraftItemChange@65879; normalizeBulkDraftDateValue@65888; promptEditBulkDraftItemQuantity@65915; promptEditBulkDraftItemPrice@65926; promptEditBulkDraftDate@65937; openBulkDraftFeeEditor@65948; closeBulkDraftFeeEditor@65958; saveBulkDraftFeeEditor@65963; buildOrderDuplicateSignature@65982; findDuplicateBulkOrderDrafts@66001; handleBulkDraftItemProductChange@66035; handleAddBulkDraftItem@66067; handleRemoveBulkDraftItem@66071; handleRemoveBulkDraft@66079; handleNotebookImageUpload@66083; handleSubmitBulkOrders@66139; handleAddSubmit@66203; openAddOrderModal@66241; handleChooseOrderCreationSource@66251; closeAddOrderModal@66283 |

## warehouse_dispatch - Xuất kho

| Field | Source-derived mapping |
| --- | --- |
| Module | warehouse_dispatch |
| Category | A - Critical Business/Security |
| Routes | MainAppView activeTab=warehouse_dispatch |
| Screens | WarehouseDispatchView |
| Features | missing requests, customer/product/driver selection, weight sheet, save/edit/archive, inline search, split image sharing |
| Actions | onAddWarehouseDispatch, onEditWarehouseDispatch, onDeleteWarehouseDispatch, onEditOrderRequest, onDeleteOrderRequest, onQuickActionHandled |
| Entities | customers, products, orderRequests, warehouseImports, warehouseDispatches, warehouseStockCounts, employees |
| Firebase Collections | customers, products, orderRequests, warehouseImports, warehouseDispatches, warehouseStockCounts, employees |
| Firebase Functions | None on active legacy document-save path |
| Repositories/Services | warehouseWeightEntries; warehouseDispatchGrouping; DispatchTableBody; dispatchSharePages |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 85 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | warehouseWeightEntries; warehouseDispatchGrouping; DispatchTableBody; dispatchSharePages |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 1 |
| Definition Evidence | src/App.jsx:55137 |
| Subview/Modal State | [showWeightEntriesModal, setShowWeightEntriesModal]@55193; [showAllDispatchShortageCustomers, setShowAllDispatchShortageCustomers]@55203; editableDispatchRows@56014; compactEditableDispatchRows@56035; filteredEditableDispatchRows@56182; groupedEditableDispatchRows@56186; selectedShortageTableRows@56415 |
| Handler Evidence | createEmptyDispatchDraft@55158; resolveRequestDateKey@55260; getDispatchDriverId@55344; getDispatchDriverName@55345; normalizeDispatchQuantityUnit@55360; getDispatchRowQuantity@55378; getDispatchRowQuantityUnit@55379; getDispatchRowWeight@55382; getDispatchOrderBranchRef@55393; hasDispatchOrderRequestForCustomer@55459; canUseManualDispatchProductOverride@55465; buildDispatchOrderRowFromShortageLine@55490; getMissingDispatchOrderRowsForCustomer@55532; findMatchingOrderRequestRowForDispatch@55543; buildDispatchBillingSnapshot@55617; getPreferredOrderRowForDispatchCustomer@55699; buildDispatchDefaultsFromOrderRow@55705; buildWarehouseDispatchSourceType@55784; buildDispatchRowSearchLabels@56097; pushLabel@56099; buildDispatchPreviewRows@56347; handleDeleteShortageOrderRequestRow@56430; handleCloseSelectedShortage@56481; getRecognitionConstructor@56540; getSupportedVoiceRecorderMimeType@56545; cleanupRecordedVoiceResources@56555; stopVoiceCapture@56564; resetDispatchVoiceDraft@56579; openWeightEntriesEditor@56626; saveWeightEntries@56637; saveDispatchListWeightEntries@56674; normalizeWarehouseVoiceText@56700; buildWarehouseVoiceSearchCandidates@56711; isVoicePayloadKeywordTrusted@56718; findTranscriptEntity@56727; extractSpokenWeight@56746; parseVoiceNumber@56752; formatVoiceNumberValue@56757; extractSpokenWeightValues@56763; resolveVoiceWeightValue@56775; resolveVoiceWeightEntries@56806; extractSpokenPieceCount@56817; findVoiceEntityMatch@56834; buildVoicePayloadSearchText@56844; findStrictVoiceEntityMatch@56860; isGenericVoiceLabel@56867; getOrderRowsForVoiceCustomer@56909; resolveVoiceCustomerFromOrders@56930; resolveVoiceProductFromOrderRows@56950; extractSpokenQuantityUnit@56964; resolveVoiceQuantityUnit@56970; extractSpokenNonWeightNumbers@57001; resolveVoicePieceCountValue@57010; getWarehouseVoiceCustomerLabels@57030; getWarehouseVoiceProductLabels@57043; scoreWarehouseVoiceLabels@57057; getVoiceLabelTokens@57058; scoreOrderedVoiceTokens@57061; extractWarehouseVoiceSegments@57112; findBestWarehouseVoiceOrderRow@57153; applyVoiceExtraction@57206; applyVoiceTranscript@57312; focusDispatchTranscriptInput@57316; handleApplyVoiceTranscript@57322; transcribeRecordedVoice@57357; getRowShortageScore@57389; startRecordedVoiceCapture@57429; handleStartVoice@57438; handleDispatchCustomerChange@57495; handleDispatchProductChange@57517; handleInlineDispatchCustomerChange@57557; handleInlineDispatchProductChange@57572; resetInlineDispatchEdit@57609; startInlineDispatchEdit@57614; saveInlineDispatchRow@57638; deleteInlineDispatchRow@57737; closeDispatchCellEditor@57767; handleDispatchCellValueChange@57772; saveDispatchCellEditor@57790; deleteDispatchCellEditorRow@57802; getDispatchCellEditorConfig@57814; deleteHistoryDispatchRow@57850; openHistoryDispatchGroup@57870; handleSubmitDispatch@57881; buildDispatchSheetFilename@57999; renderDispatchSheetCanvas@58001; handleShareDispatchSheet@58094; filename@58114; handleDownloadDispatchSheet@58149 |

## delivery_reports - Giao hàng

| Field | Source-derived mapping |
| --- | --- |
| Module | delivery_reports |
| Category | B - Operational |
| Routes | MainAppView activeTab=delivery_reports |
| Screens | DeliveryReportView |
| Features | delivery assignment, quantities, actual collection, expenses, photo evidence, reconciliation and issue resolution |
| Actions | onAddDeliveryReport, onUpdateDeliveryReport, onSaveDeliveryCommand, onEditOrder, onAddPayment, onAddExpense, onAddAssetCostLog, onEditAssetCostLog |
| Entities | customers, products, orders, orderRequests, warehouseImports, warehouseDispatches, deliveryReports, payments, expenses, assets, assetCostLogs |
| Firebase Collections | customers, products, orders, orderRequests, warehouseImports, warehouseDispatches, deliveryReports, payments, expenses, assets, assetCostLogs |
| Firebase Functions | Shared Firestore transactions; no direct delivery HTTP export |
| Repositories/Services | DeliveryRedesignWorkspace; deliveryWorkspaceModel; deliverySavePlan; atomicSave; deliveryRequestIndex |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 87 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | DeliveryRedesignWorkspace; deliveryWorkspaceModel; deliverySavePlan; atomicSave; deliveryRequestIndex |
| Criticality | Medium |
| Current Status | BLOCKED |
| Priority | 25 |
| Definition Evidence | src/App.jsx:48254 |
| Subview/Modal State | [showIncomeReportSection, setShowIncomeReportSection]@48288; [showExpenseReportSection, setShowExpenseReportSection]@48289; [showReturnReportSection, setShowReturnReportSection]@48290; [showShippingReportSection, setShowShippingReportSection]@48291; [showCustomerList, setShowCustomerList]@48298 |
| Handler Evidence | scrollToDeliveryReportForm@48362; getDeliveryAssetAssigneeIds@48382; isDeliveryAssetAssignedToCurrentEmployee@48394; formatDeliveryAssetOptionLabel@48419; sumUniqueMoneyValues@48449; resolveFallbackPricing@48601; compareCandidates@48634; takeUniqueCustomerCashflow@48780; formatDeliveryReportPlainNumber@49157; formatDeliveryReportCompactMoney@49162; toDeliveryInputValue@49170; createManualActualRow@49175; buildActualRowFromDispatch@49202; buildActualRowsForCustomer@49249; updateActualRow@49256; findProductForActualRow@49260; resolveActualRowPricingMeta@49273; normalizeActualRowsForSave@49367; handleScreenBack@49445; handleSelectCustomer@49460; handlePhotoChange@49479; handleReturnPhotoChange@49495; handleStandaloneExpensePhotoChange@49511; getDeliveryPhotoAgeDays@49527; canDeleteReportPhoto@49536; handleDeleteReportPhoto@49540; resetReportForm@49563; handleStartEditReport@49597; archiveDeliveryReport@49667; handleDeleteDeliveryReport@49689; handleShareDeliveryReport@49694; handleShareDeliveryReportTable@49725; drawCellText@49829; handleSaveStandaloneDeliveryExpense@49953; handleSubmitReport@50052; buildReportPayload@50119; handleDeliveryEnterNext@50377; toggleDeliveryReportPanel@50391 |

## warehouse_import - Nhập Xuất Tồn

| Field | Source-derived mapping |
| --- | --- |
| Module | warehouse_import |
| Category | A - Critical Business/Security |
| Routes | MainAppView activeTab=warehouse_import |
| Screens | WarehouseImportView |
| Features | purchase import, stock count, differences, supplier selection, quantity/weight |
| Actions | onAddWarehouseImport, onEditWarehouseImport, onDeleteWarehouseImport, onAddWarehouseStockCount, onPostInventoryOpeningBalance, onEditWarehouseStockCount, onDeleteWarehouseStockCount, onUpdateCompanySettings, onQuickActionHandled |
| Entities | customers, products, orders, orderRequests, warehouseImports, warehouseDispatches, warehouseStockCounts |
| Firebase Collections | customers, products, orders, orderRequests, warehouseImports, warehouseDispatches, warehouseStockCounts |
| Firebase Functions | No inventoryAtomicOperation export in current functions/index.js |
| Repositories/Services | warehouseInventory; warehouseSupplierOptions; App shared document persistence |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 99 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | warehouseInventory; warehouseSupplierOptions; App shared document persistence |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 2 |
| Definition Evidence | src/App.jsx:51175 |
| Subview/Modal State | [showGroupPicker, setShowGroupPicker]@51207; [showWarehouseProductCodePicker, setShowWarehouseProductCodePicker]@51209; [showQuantityUnitPicker, setShowQuantityUnitPicker]@51210; [showCustomQuantityUnitModal, setShowCustomQuantityUnitModal]@51211; [showWarehouseCameraScanner, setShowWarehouseCameraScanner]@51215; [showStockCountGroupPicker, setShowStockCountGroupPicker]@51251; [showSupplierPicker, setShowSupplierPicker]@51253; [warehouseInventoryTab, setWarehouseInventoryTab]@51256; [showHiddenWarehouseStockItems, setShowHiddenWarehouseStockItems]@51259; warehouseMovementTableRows@52480; warehouseMovementTableGroups@52645 |
| Handler Evidence | focusNextWarehouseImportField@51297; runFocus@51300; handleWarehouseImportEnter@51320; updateWarehouseWorkingDate@51335; handleWarehouseCalendarMonthChange@51341; getWarehouseInventoryGroupLabel@51350; getWarehouseProductCodeCandidates@51365; applyWarehouseProductToDraft@51446; applyWarehouseProductCode@51472; getWarehouseUniversalBarcodeDetector@51485; getWarehouseZxingReader@51496; detectWarehouseCodeFromImageFile@51500; handleWarehouseProductCodeImage@51526; stopWarehouseCameraScanner@51545; completeWarehouseScan@51567; openWarehouseCameraScanner@51587; closeWarehouseCameraScanner@51592; startWarehouseCameraScanner@51596; scanFrame@51637; getSupplierCustomerLabel@51738; findSupplierCustomerMatch@51775; selectSupplierCustomer@51816; handleSupplierInputChange@51825; ensureWarehouseInventoryGroupExists@51834; buildWarehouseGroupSyncNote@51854; syncWarehouseGroupInBackground@51859; getWarehouseCalendarStat@51972; ensureRow@52005; addExportMeasure@52018; getMandatoryWarehouseStockUnitsForGroup@52045; prepare@52052; ensureRow@52066; isMovementAfterMeasureBaseline@52080; addMeasure@52090; getGroupKey@52119; getGroupName@52120; getTimestamp@52122; getUnitKey@52128; hideWarehouseStockGroup@52291; restoreWarehouseStockGroup@52299; hideWarehouseStockUnit@52306; restoreWarehouseStockUnit@52315; restoreAllWarehouseStockVisibility@52327; getGroupKey@52341; getGroupName@52342; getTimestamp@52344; getUnitKey@52350; getMeasureValue@52492; getSelectedMeasureValue@52499; getItemGroupKey@52507; shouldShowGroup@52510; getSelectedImportQuantity@52511; getSelectedDispatchQuantity@52516; getSelectedStockCountMeasure@52522; ensureMovementGroupRow@52532; getGroupKey@52565; getGroupName@52566; getTimestamp@52568; getUnitKey@52574; scrollToDetail@52674; isSameGroup@52695; openWarehouseMovementDetail@52724; buildActualStockPayloadForGroup@52729; openQuickStockEdit@52768; handleSaveQuickStockEdit@52788; openStockVarianceReport@52817; updateStockVarianceReason@52840; handleSaveStockVarianceReport@52846; updateDraft@52912; handleSaveCustomQuantityUnit@52916; resetImportDraft@52941; handleEditImportFromItem@52963; handleDeleteEditingImport@52998; updateStockCountDraft@53005; resetStockCountDraft@53009; handleEditStockCountFromItem@53019; handleDeleteStockCountItem@53034; handleSubmitStockCount@53042; handleSubmitVpsStockCount@53111; handleSubmitVpsOpeningBalance@53145; handleSubmit@53183 |

## customers - Khách hàng

| Field | Source-derived mapping |
| --- | --- |
| Module | customers |
| Category | B - Operational |
| Routes | MainAppView activeTab=customers |
| Screens | CustomerCRMView |
| Features | customer/supplier detail, create/import/edit/delete, fixed products/prices, loans, debt, messaging and locations |
| Actions | onAddCustomer, onEditCustomer, onDeleteCustomer, onDeleteCustomerLoan, onAddCustomerLoan, onEditCustomerLoan, onOpenCustomerDebt, onOpenOrder, onQuickActionHandled |
| Entities | customers, orders, payments, expenses, payment_reconciliations, customer_points, customerLoans, products, warehouseImports, warehouseDispatches |
| Firebase Collections | customers, orders, payments, expenses, payment_reconciliations, customer_points, customerLoans, products, warehouseImports, warehouseDispatches |
| Firebase Functions | customerRedeemPoints; createCustomerDebtPaymentRequest (portal consumers) |
| Repositories/Services | customerLedgerIndex; customerOrderMemory; customerFixedProductMemory; customerReconciliationExport |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 123 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | customerLedgerIndex; customerOrderMemory; customerFixedProductMemory; customerReconciliationExport |
| Criticality | Medium |
| Current Status | BLOCKED |
| Priority | 27 |
| Definition Evidence | src/App.jsx:69106 |
| Subview/Modal State | [showAddCustomer, setShowAddCustomer]@69108; [showCustomerImportModal, setShowCustomerImportModal]@69109; [showCustomerQuickActions, setShowCustomerQuickActions]@69110; [localShowSearchBox, setLocalShowSearchBox]@69120; [localShowFilterPanel, setLocalShowFilterPanel]@69121; [showCustomerEditForm, setShowCustomerEditForm]@69132; [showCustomerLocationActions, setShowCustomerLocationActions]@69136; [showCustomerDebtList, setShowCustomerDebtList]@69170; showCustomerEditFormRef@69182 |
| Handler Evidence | toggleNewCustomerProduct@69308; findEntry@69412; getCustomerDateActivityTime@69481; matchesCustomerKeyword@69517; getDuplicateCustomerDisplayName@69577; handleOpenSelectedCustomerDebt@69607; getCustomerLoanBalance@69620; findLinkedCustomerOrder@69690; buildOrderMetrics@69717; getRawDate@69748; getRowTime@69757; getRowDateLabel@69758; addRow@69764; getCustomerReconciliationExportContext@69923; handleExportCustomerReconciliationExcel@69931; handleExportCustomerReconciliationPdf@69957; getItemText@70140; addCustomerProductToPricing@70205; removeCustomerProductFromPricing@70212; toggleCustomerProductForPricing@70222; createEmptyCustomerBranchDraft@70232; addCustomerBranchDraft@70241; updateCustomerBranchDraft@70247; removeCustomerBranchDraft@70254; toggleCustomerBranchProduct@70259; handleSaveCustomerBranches@70272; resetCustomerListView@70331; handleOpenCustomer@70341; handleCloseCustomerDetail@70354; focusZaloInput@70392; scrollToCustomerSection@70422; isCustomerDetailSectionOpen@70426; toggleCustomerDetailSection@70427; openCustomerDetailSection@70430; handleResetCustomerFilters@70435; closeAddCustomerModal@70456; handleScreenBack@70466; handleAddCustomerSubmit@70512; handlePickCustomerContact@70587; handleApplyNewCustomerLocationInput@70618; handleCaptureNewCustomerLocation@70632; handleApplyCustomerEditLocationInput@70652; handleCaptureCustomerEditLocation@70666; handleCopyCustomerPhone@70686; handleCopyCustomerLocation@70692; handleOpenCustomerMaps@70698; updateCustomerLoanDraft@70714; updateCustomerLoanReturnDraft@70719; openCustomerLoanEditor@70730; updateCustomerLoanEditDraft@70748; buildCustomerLoanQuantityLabel@70759; handleCreateCustomerLoan@70768; handleRecordCustomerLoanReturn@70811; handleSaveCustomerLoanEdit@70859; handleArchiveCustomerLoan@70902; openCustomerImportModal@70914; handleCustomerImportFileChange@70926; handleSaveCustomerProfile@71024; handleSaveCustomerDebtLimit@71098; handleSaveCustomerOpeningDebt@71118; handleDeleteCustomerProfile@71145; toggleAllowedDriver@71170; handleSaveDriverAccess@71177; updateCustomerPriceDraft@71190; addCustomerPriceVariantDraft@71240; updateCustomerPriceVariantDraft@71260; removeCustomerPriceVariantDraft@71279; clearCustomerPriceDraft@71313; buildCustomerPriceOverridesFromDraft@71322; buildCustomerPriceQuoteText@71421; saveCustomerPriceOverrides@71435; handleSaveCustomerPriceSettings@71461; handleSaveAndNotifyCustomerPrices@71466; toggleDriverDebtAccess@71487; resolveDebtShareStatusMessage@71491; buildDebtShareText@71503; buildDebtReminderText@71536; handleShareDebtReminder@71561; buildDebtShareHtml@71579; handleShareDebt@71645; handleCopyDebt@71655; handleDownloadDebt@71661; onClick@72716 |

## debt - Sổ nợ

| Field | Source-derived mapping |
| --- | --- |
| Module | debt |
| Category | A - Critical Business/Security |
| Routes | MainAppView activeTab=debt |
| Screens | DebtManagementView |
| Features | receivable/payable list, customer ledger, collect payment, repay company debt, history |
| Actions | onAddRepayment, onAddPayment, onDeletePayment, onFocusCustomerHandled |
| Entities | customers, orders, payments, expenses, bankTransactions, warehouseImports, employees |
| Firebase Collections | customers, orders, payments, expenses, bankTransactions, warehouseImports, employees |
| Firebase Functions | Payment reconciliation triggers affect shared payments |
| Repositories/Services | customerLedgerIndex; expenseClassification; customerProductBilling |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 32 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | customerLedgerIndex; expenseClassification; customerProductBilling |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 4 |
| Definition Evidence | src/App.jsx:79824 |
| Subview/Modal State | [showPaymentModal, setShowPaymentModal]@79826; [localShowSearchBox, setLocalShowSearchBox]@79833; [localShowFilterPanel, setLocalShowFilterPanel]@79834 |
| Handler Evidence | resetDebtFilters@79990; resetPaymentDraft@80103; openDebtCustomerDetail@80113; openPaymentModal@80119; handlePaymentSubmit@80135; resolveDebtShareStatusMessage@80220; buildDebtShareText@80232; buildDebtShareHtml@80274; handleShareDebt@80343; handleCopyDebt@80353; handleDownloadDebt@80359 |

## finance - Thu chi

| Field | Source-derived mapping |
| --- | --- |
| Module | finance |
| Category | A - Critical Business/Security |
| Routes | MainAppView activeTab=finance |
| Screens | FinanceView |
| Features | income/expense create/edit/delete/archive/approve, daily summary, asset expenses |
| Actions | onAddExpense, onEditExpense, onAddPayment, onEditPayment, onDeleteExpense, onDeletePayment, onSearchFocusHandled, onQuickActionHandled |
| Entities | expenses, payments, orders, assets, deliveryReports, employees, customers |
| Firebase Collections | expenses, payments, orders, assets, deliveryReports, employees, customers |
| Firebase Functions | Payment webhooks/triggers affect shared payments |
| Repositories/Services | expenseClassification; atomicSave; businessMutationIds |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 43 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | expenseClassification; atomicSave; businessMutationIds |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 3 |
| Definition Evidence | src/App.jsx:46972 |
| Subview/Modal State | [localShowSearchBox, setLocalShowSearchBox]@46980; [localShowFilterPanel, setLocalShowFilterPanel]@46981; [showExpenseModal, setShowExpenseModal]@46982; [showPaymentModal, setShowPaymentModal]@46983; [showDesktopCreateMenu, setShowDesktopCreateMenu]@46984; [showPaymentCustomerDropdown, setShowPaymentCustomerDropdown]@47003 |
| Handler Evidence | buildAssetLabel@47083; resolveExpenseAssetInfo@47090; resolvePaymentCustomerName@47131; getIncomeCashflowGroupLabel@47174; getIncomeCashflowDetailLabel@47182; openCashflowComposer@47198; resolveCashflowDateKey@47276; isCashflowRecordInPeriod@47299; getCashflowSortTimestamp@47304; isVisibleTransaction@47312; summaryAmountSize@47429; handleResetFilters@47434; handleExpenseSubmit@47446; handlePaymentSubmit@47488; handleApproveTransaction@47546; openRejectCashflowModal@47560; closeRejectCashflowModal@47572; handleRejectTransactionSubmit@47577; canEditCashflowTransaction@47605; canDeleteCashflowTransaction@47611; canManageCashflowTransaction@47617; openCashflowEditor@47621; closeCashflowEditor@47636; handleSaveCashflowEdit@47649; handleDeleteCashflowTransaction@47685; handleDeleteEditingCashflow@47694 |

## bank_payments - Ngân hàng

| Field | Source-derived mapping |
| --- | --- |
| Module | bank_payments |
| Category | A - Critical Business/Security |
| Routes | MainAppView activeTab=bank_payments |
| Screens | BankPaymentCenterView |
| Features | bank accounts, transaction status, reconciliation, notifications |
| Actions | Navigation/display actions; see event inventory |
| Entities | customers, orders, payments, bankAccounts, bankTransactions, payment_reconciliations |
| Firebase Collections | customers, orders, payments, bankAccounts, bankTransactions, payment_reconciliations |
| Firebase Functions | createSepayPaymentRequest; syncSepayPaymentStatus; sepayWebhook; autoReconcileSepayTransactions; createPayosPaymentLink; syncPayosPaymentStatus; payosWebhook; processPaymentJob |
| Repositories/Services | bankTransactionView; bankAppDeeplink; CompanyBankAccounts |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 14 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | bankTransactionView; bankAppDeeplink; CompanyBankAccounts |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 8 |
| Definition Evidence | src/App.jsx:35956 |
| Subview/Modal State | None found in primary function |
| Handler Evidence | toLocalDateKey@35964; openCustomers@35979; transactionStatusMeta@36021; accountStatusMeta@36035; scrollToTransactionList@36073 |

## messages - Tin nhắn

| Field | Source-derived mapping |
| --- | --- |
| Module | messages |
| Category | C - Supporting |
| Routes | MainAppView activeTab=messages |
| Screens | MessageCenterView |
| Features | internal/customer/support messages, conversation search, attachments, own/all notifications |
| Actions | onAddMessage, onOpenNotification, onGoBack, onUpdateCompanySettings, onProcessZaloInboxMessage, onSendAiZaloReply, onIgnoreZaloInboxMessage, onMarkNeedHumanZaloInboxMessage, onToggleCustomerAiReply, onSaveAiReplyRule, onArchiveAiReplyRule |
| Entities | employees, customers, orders, orderRequests, payments, expenses, products, messages, zalo_inbox_messages, zalo_inbox_bridge_logs, zalo_send_queue, zalo_campaigns, zalo_campaign_queue, order_requests, ai_reply_rules |
| Firebase Collections | employees, customers, orders, orderRequests, payments, expenses, products, messages, zalo_inbox_messages, zalo_inbox_bridge_logs, zalo_send_queue, zalo_campaigns, zalo_campaign_queue, order_requests, ai_reply_rules |
| Firebase Functions | syncCustomerMessageAssignment |
| Repositories/Services | MessagingUi; messagingUiModel; customerMessaging; employeeScopedCustomerMessaging |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 54 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | MessagingUi; messagingUiModel; customerMessaging; employeeScopedCustomerMessaging |
| Criticality | Supporting |
| Current Status | BLOCKED |
| Priority | 31 |
| Definition Evidence | src/App.jsx:44900 |
| Subview/Modal State | [showMessageFilterMenu, setShowMessageFilterMenu]@44948; [showChatSearch, setShowChatSearch]@44951; [activeChatTab, setActiveChatTab]@44952; [activeSearchTab, setActiveSearchTab]@44953; [showAttachMenu, setShowAttachMenu]@44956; [showExtraAttachMenu, setShowExtraAttachMenu]@44957; [showCreateGroup, setShowCreateGroup]@44964; [showCreateConversationPanel, setShowCreateConversationPanel]@44965; [showAddFriendPanel, setShowAddFriendPanel]@44966; [showCodeScanner, setShowCodeScanner]@44967; stableMessageFallbackBaseAt@45059 |
| Handler Evidence | updateOnlineStatus@44987; normalizeKeyword@45034; buildInitials@45039; isUnreadStatus@45045; isMessageUnreadForCurrentEmployee@45046; isNotificationUnread@45054; getMessageTimeValue@45064; getRawMessageActivityAt@45084; getSourceUnreadCount@45425; decorateConversationUnread@45430; getConversationUnreadCount@45438; getMessageActivityAt@45446; getConversationActivityAt@45454; sortConversationsByPriority@45470; hasConversationActivity@45499; getConversationSearchText@45513; getConversationFilterText@45528; matchesConversationFilter@45548; isPinnedConversation@45564; handleMarkFilteredUnreadAsRead@45589; handleRefreshChats@45601; handleChatListTouchStart@45611; handleChatListTouchEnd@45616; cleanChatDisplayText@45630; formatConversationListTime@45631; getConversationLatestMessage@45646; getConversationPreview@45652; extractNoticeLeadName@45685; getConversationDisplayName@45699; getConversationTypeLabel@45719; handleSelectConversation@45740; closeAttachmentPicker@45761; getUniversalBarcodeDetector@45767; getZxingCodeReader@45779; getZxingResultText@45784; detectCodeFromImageFile@45790; stopHeaderCodeScanner@45814; openHeaderCodeScanner@45838; closeHeaderCodeScanner@45846; startHeaderCameraScanner@45852; scanFrame@45879; handleHeaderCodeImageScan@45924; useScannedCodeForMessageSearch@45945; copyScannedCode@45951; openScannedCodeContent@45962; handleScreenBack@45989; buildOutgoingMessageMeta@46061; buildInternalConversationId@46081; buildCustomerEmployeeConversationId@46082; handleConnectConversationByPhone@46084; matchesProfileQuery@46092; toggleGroupMember@46188; closeCreateGroup@46194; handleCreateInternalGroup@46201; handleCall@46237; handleSendMessage@46250; sendAttachmentPayload@46278; pickChatItemByPrompt@46310; buildChatCustomerText@46327; buildCleanChatCustomerText@46335; buildChatOrderText@46343; buildChatOrderRequestText@46357; buildChatReportText@46376; readChatImageAttachment@46391; handleRealAttachAction@46420; handleImageAttachmentChange@46500 |

## pricing - Giá cả

| Field | Source-derived mapping |
| --- | --- |
| Module | pricing |
| Category | A - Critical Business/Security |
| Routes | MainAppView activeTab=pricing |
| Screens | SimplePricingEngineView |
| Features | input costs, price table, formulas, cutting/loss/margin rules |
| Actions | onAddPricingInput, onDeletePricingInput, onSavePricingRules |
| Entities | products, orders, orderRequests, warehouseImports, warehouseDispatches, warehouseStockCounts, pricingInputs, pricingRules, pricingScenarios |
| Firebase Collections | products, orders, orderRequests, warehouseImports, warehouseDispatches, warehouseStockCounts, pricingInputs, pricingRules, pricingScenarios |
| Firebase Functions | None directly mapped; shared Firestore data path |
| Repositories/Services | pricingEngineService; pricingProductMargins; productPricingUnits |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 45 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | pricingEngineService; pricingProductMargins; productPricingUnits |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 12 |
| Definition Evidence | src/App.jsx:38054 |
| Subview/Modal State | [isSharingTodayPriceTable, setIsSharingTodayPriceTable]@38085 |
| Handler Evidence | syncPricingDraftFromSavedRules@38157; updateTodayInputPriceOverride@38409; updateCutPartDraft@38506; addCutPartDraft@38515; removeCutPartDraft@38528; commitCutPartCellDraft@38539; updateLossStageDraft@38543; updateLossWeightDraft@38552; commitLossCellDraft@38574; addLossStageDraft@38583; removeLossStageDraft@38596; resetActiveLossGroupPreset@38607; updateGroupMarginDraft@38614; buildSeedProductMargins@38627; updateProductMarginDraft@38636; toggleMarginGroup@38656; setTodayPriceGroupHidden@38660; setTodayPriceProductHidden@38691; buildProductFormulaFromProduct@38722; addProductFormulaDraft@38736; updateProductFormulaDraft@38748; updateProductFormulaRoot@38758; removeProductFormulaDraft@38769; addProductFormulaChild@38777; updateProductFormulaChild@38803; updateProductFormulaChildProduct@38820; removeProductFormulaChild@38830; handleSavePricingInput@38845; handleSavePricingRules@38877; buildTodayPriceShareText@38904; handleShareTodayPriceTable@38924; togglePricingSection@39086; PricingSectionShell@39093 |

## company_attendance - Chấm công

| Field | Source-derived mapping |
| --- | --- |
| Module | company_attendance |
| Category | B - Operational |
| Routes | MainAppView activeTab=company_attendance |
| Screens | AttendanceView |
| Features | own/team attendance, checkin/out/leave, role, WiFi/GPS settings, override, history/report |
| Actions | onChangeDate, onCheckIn, onCheckOut, onLeave, onEditAttendance, onOverrideCheckIn, onOverrideCheckOut, onUpdateCompanySettings, onEditEmployee, onGoBack, onOpenNotifications |
| Entities | employees, attendance, holidays |
| Firebase Collections | employees, attendance, holidays |
| Firebase Functions | identityAttendance; attendanceAutoWifiCheckIn |
| Repositories/Services | AttendanceWorkspace; attendanceWifi; autoWifiAttendance; identityCenter |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 37 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | AttendanceWorkspace; attendanceWifi; autoWifiAttendance; identityCenter |
| Criticality | Medium |
| Current Status | BLOCKED |
| Priority | 33 |
| Definition Evidence | src/App.jsx:27402 |
| Subview/Modal State | [attendanceScreen, setAttendanceScreen]@27409; [showEditModal, setShowEditModal]@27420 |
| Handler Evidence | onToolbar@27426; openAttendanceDatePicker@27452; getSelectedWorkRole@27465; selectWorkRole@27470; getRecord@27475; getStatusMeta@27480; readWifiPermission@27552; refreshAttendanceWifi@27569; read@27573; openAttendanceWifi@27604; requestAttendanceWifiPermission@27612; toggleAutoWifi@27630; lookupSelfWifi@27663; handleSelectSelfWifiNetwork@27704; openEditModal@27729; closeEditModal@27743; buildDateTime@27749; handleSubmit@27753; handleSaveDefaultAttendanceWifi@27781; handleSelfAttendance@27823; handleBulkOverride@27878; handleSelfLeave@27911; handleRoleOverride@27926 |

## employee_reviews - Đánh giá

| Field | Source-derived mapping |
| --- | --- |
| Module | employee_reviews |
| Category | B - Operational |
| Routes | MainAppView activeTab=employee_reviews |
| Screens | EmployeeReviewModuleView |
| Features | employee evaluation, criteria, automatic summary and payroll projection |
| Actions | onAddEmployeeReview, onUpdateCompanySettings |
| Entities | employees, employeeReviews, attendance, customerComplaints, performance |
| Firebase Collections | employees, employeeReviews, attendance, customerComplaints, performance |
| Firebase Functions | autoAggregateEmployeeEvaluations |
| Repositories/Services | employeeEvaluationAutomation; payrollEvaluationBonus |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 12 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | employeeEvaluationAutomation; payrollEvaluationBonus |
| Criticality | Medium |
| Current Status | BLOCKED |
| Priority | 34 |
| Definition Evidence | src/App.jsx:74929 |
| Subview/Modal State | None found in primary function |
| Handler Evidence | getReviewHistorySourceLabel@75063; getReviewHistoryRatingLabel@75069; getReviewHistoryDateLabel@75073; canEditReviewHistory@75076; handleEditReviewHistory@75083; handleCancelReviewEdit@75097; handleSaveCriteriaLabels@75104; startInlineCriteriaEdit@75118; handleSubmitPeerReview@75127 |

## asset_management - Tài sản

| Field | Source-derived mapping |
| --- | --- |
| Module | asset_management |
| Category | B - Operational |
| Routes | MainAppView activeTab=asset_management |
| Screens | AssetManagementView |
| Features | assets, assignments, cost logs, images, warnings and driver score |
| Actions | onAddAsset, onEditAsset, onDeleteAsset, onAddAssetCostLog, onEditAssetCostLog, onDeleteAssetCostLog |
| Entities | assets, assetCostLogs, employees |
| Firebase Collections | assets, assetCostLogs, employees |
| Firebase Functions | None directly mapped; shared Firestore data path |
| Repositories/Services | AssetManagementWorkspace; assetManagementModel |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 19 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | AssetManagementWorkspace; assetManagementModel |
| Criticality | Medium |
| Current Status | BLOCKED |
| Priority | 35 |
| Definition Evidence | src/App.jsx:35254 |
| Subview/Modal State | [showAssetForm, setShowAssetForm]@35280; [showCostForm, setShowCostForm]@35283; [showAssetDocumentDetails, setShowAssetDocumentDetails]@35294; [showAssetOperationDetails, setShowAssetOperationDetails]@35295 |
| Handler Evidence | openAssetForm@35321; closeAssetForm@35330; openCostForm@35339; closeCostForm@35345; handleAssetImage@35367; handleAssetDocumentImage@35374; getAssetDocumentImageUrls@35404; handleReadAssetDocuments@35409; handleCostImage@35474; handleAssetSubmit@35480; handleCostSubmit@35491; handleCostDelete@35512 |

## payroll - Bảng lương

| Field | Source-derived mapping |
| --- | --- |
| Module | payroll |
| Category | A - Critical Business/Security |
| Routes | MainAppView activeTab=payroll |
| Screens | SalaryView |
| Features | period list/detail/close, snapshots, advances, adjustments, opening debt, purchases, bonus/penalties |
| Actions | onAddFinancial, onEditFinancial, onDeleteFinancial, onUpdatePerformance, onAddAdvanceRequest, onApproveAdvance, onRejectAdvance, onDeleteAdvance, onUpdateCompanySettings, onLockPayrollPeriod, onAdjustLockedPayroll, onPreparePayrollAutoLockPlan, onLoadPayrollPeriodSnapshots |
| Entities | employeeReviews, payrollPeriods, payrollDebtCarryovers, payrollAutoLockPlans, attendance, customerComplaints, financials, performance, customers, orders, payments, holidays, deliveryReports, advances |
| Firebase Collections | employeeReviews, payrollPeriods, payrollDebtCarryovers, payrollAutoLockPlans, attendance, customerComplaints, financials, performance, customers, orders, payments, holidays, deliveryReports, advances |
| Firebase Functions | autoLockPayrollPeriods; autoAggregateEmployeeEvaluations |
| Repositories/Services | PayrollWorkspace; PayrollCloseDialog; payrollWorkspaceModel; payrollPeriodLock; payrollDebtCarryover; payrollSnapshotIntegrity |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 69 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | PayrollWorkspace; PayrollCloseDialog; payrollWorkspaceModel; payrollPeriodLock; payrollDebtCarryover; payrollSnapshotIntegrity |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 7 |
| Definition Evidence | src/App.jsx:77611 |
| Subview/Modal State | [showModal, setShowModal]@77666; [showAdvanceRequestModal, setShowAdvanceRequestModal]@77667; [modalType, setModalType]@77670; [financialModalError, setFinancialModalError]@77677; [showPayrollLockConfirm, setShowPayrollLockConfirm]@77688; payrollEvaluationContext@77922 |
| Handler Evidence | loadSnapshots@77867; handleHidePayrollConfigNotice@77912; handleConfirmPayrollLock@78227; openPayrollAdjustmentDialog@78266; handleSubmitPayrollAdjustment@78275; openFinancialModal@78372; openEditFinancialModal@78396; handleDeleteFinancialRecord@78413; handleDeleteAdvanceRequest@78433; handleReviewAdvanceRequest@78440; handleSubmit@78465; getFinancialModalTitle@78499; openAdvanceRequestModal@78508; handleAdvanceRequestSubmit@78544; handleSaveAdvancePercent@78606; getAttendanceStatusLabel@78625; renderFinancialList@78632 |

## employees - Nhân sự

| Field | Source-derived mapping |
| --- | --- |
| Module | employees |
| Category | B - Operational |
| Routes | MainAppView activeTab=employees |
| Screens | EmployeeView |
| Features | employee create/edit/status, departments, reviews, policies, QR bank |
| Actions | onAddEmployee, onEditEmployee, onDeleteEmployee, onAddEmployeeReview, onAddHoliday, onDeleteHoliday, onUpdateCompanySettings, onQuickActionHandled, onCloseDepartmentFilter, onResetEmployeePassword |
| Entities | employeeReviews, attendance, customerComplaints, payrollPeriods, payrollDebtCarryovers, payrollAutoLockPlans, performance, advances |
| Firebase Collections | employeeReviews, attendance, customerComplaints, payrollPeriods, payrollDebtCarryovers, payrollAutoLockPlans, performance, advances |
| Firebase Functions | identityOwnerResetPassword; identityRequestOwnerReset; identityApproveOwnerReset |
| Repositories/Services | EmployeeBankQr; companyDepartments; payrollPolicyHistory |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 40 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | EmployeeBankQr; companyDepartments; payrollPolicyHistory |
| Criticality | Medium |
| Current Status | BLOCKED |
| Priority | 37 |
| Definition Evidence | src/App.jsx:75555 |
| Subview/Modal State | [showForm, setShowForm]@75606; [showEmployeePassword, setShowEmployeePassword]@75615 |
| Handler Evidence | closeOnEscape@75664; getEmployeeCompanyDepartment@75726; handleSaveCompanyDepartment@75736; handleRemoveCompanyDepartment@75766; updateLatePenaltyTier@75799; addLatePenaltyTier@75808; removeLatePenaltyTier@75823; getRoleSalaryInputValue@75831; setRoleSalaryInputValue@75837; toggleSecondaryPosition@75847; getAssignedAssetsForEmployee@75957; openEmployeeReview@75965; applyReviewRatingToAllCriteria@75974; updateReviewCriterionScore@75980; handleSubmitEmployeeReview@75985; openCreateEmployeeForm@76011; handlePositionChange@76030; handleOpenEdit@76064; closeEmployeeEditor@76117; handleSubmit@76122; handleUseCurrentAttendanceLocation@76312; handleDeleteEmployeeClick@76334; handleResetEmployeePassword@76353; handleOpenAvatarPicker@76387; handleEmployeeAvatarSelect@76393; handleOpenDocumentPicker@76413; handleEmployeeDocumentSelect@76420; handleDeleteEmployeeDocument@76472; handleDownloadEmployeeDocument@76490 |

## products - Sản phẩm

| Field | Source-derived mapping |
| --- | --- |
| Module | products |
| Category | A - Critical Business/Security |
| Routes | MainAppView activeTab=products |
| Screens | ProductManagementView |
| Features | create/edit/archive, units, attributes, stock display/search |
| Actions | onAddProduct, onEditProduct, onToggleArchiveProduct, onDeleteProduct, onUpdateCompanySettings, onQuickActionHandled |
| Entities | products, orders, warehouseImports, warehouseDispatches |
| Firebase Collections | products, orders, warehouseImports, warehouseDispatches |
| Firebase Functions | None directly mapped; shared Firestore data path |
| Repositories/Services | incrementalProductStock; productMeasures; productPricingUnits |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 37 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | incrementalProductStock; productMeasures; productPricingUnits |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 11 |
| Definition Evidence | src/App.jsx:68029 |
| Subview/Modal State | [showForm, setShowForm]@68030; [showArchived, setShowArchived]@68035; [localShowFilterPanel, setLocalShowFilterPanel]@68039; [productTab, setProductTab]@68040 |
| Handler Evidence | resetProductFilters@68180; handleCreateProductGroup@68187; handleStartEditProductGroup@68227; handleCancelEditProductGroup@68234; handleRenameProductGroup@68239; emptyProductForm@68303; handleOpenEdit@68335; handleSubmit@68351; handleImageUpload@68394; handleBarcodeImageScan@68407; handleScanBarcode@68443 |

## price_quotes - Báo giá

| Field | Source-derived mapping |
| --- | --- |
| Module | price_quotes |
| Category | B - Operational |
| Routes | MainAppView activeTab=price_quotes |
| Screens | PriceQuoteBroadcastView |
| Features | customer selection, price/size drafts, batch quote images, channel sharing |
| Actions | onEditCustomer |
| Entities | customers, products, orders, orderRequests |
| Firebase Collections | customers, products, orders, orderRequests |
| Firebase Functions | None directly mapped; shared Firestore data path |
| Repositories/Services | pricingEngineService; shareCanvas; customerOrderMemory |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 28 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | pricingEngineService; shareCanvas; customerOrderMemory |
| Criticality | Medium |
| Current Status | BLOCKED |
| Priority | 39 |
| Definition Evidence | src/App.jsx:39873 |
| Subview/Modal State | [showBatchPricePanel, setShowBatchPricePanel]@39879 |
| Handler Evidence | toggleProduct@40032; toggleBatchCustomer@40039; handleSelectFilteredBatchCustomers@40046; handleSelectFixedBatchProductCustomers@40056; handleClearBatchCustomers@40066; getBatchPriceTargetCustomers@40070; handleApplyBatchCustomerPrice@40075; handleShareBatchPriceNotice@40132; buildQuoteMessage@40199; handleSelectQuickMainProducts@40213; handleShareQuickMainProducts@40222; handleShareAll@40249; handleCopyQuote@40279 |

## settings - Cài đặt

| Field | Source-derived mapping |
| --- | --- |
| Module | settings |
| Category | C - Supporting |
| Routes | MainAppView activeTab=settings |
| Screens | SettingsView |
| Features | company/bank/loyalty/care/WiFi/warehouse configuration, backup/restore, security, Zalo configuration |
| Actions | onGetIdentityToken, onLogout, onUpdateCompanySettings, onResetCompanyDemoData, onCreateCompanyBackup, onRestoreCompanyBackup, onCreateZaloCampaign, onCancelZaloCampaign, onRetryZaloCampaignQueueItem, onProcessZaloInboxMessage, onSendAiZaloReply, onIgnoreZaloInboxMessage, onMarkNeedHumanZaloInboxMessage, onToggleCustomerAiReply, onSaveAiReplyRule, onArchiveAiReplyRule, onUpdateZaloOrderRequest, onConvertZaloOrderRequest |
| Entities | reward_catalog, promotions, zalo_send_queue, zalo_campaigns, zalo_campaign_queue, zalo_inbox_messages, zalo_inbox_bridge_logs, ai_reply_rules |
| Firebase Collections | reward_catalog, promotions, zalo_send_queue, zalo_campaigns, zalo_campaign_queue, zalo_inbox_messages, zalo_inbox_bridge_logs, ai_reply_rules |
| Firebase Functions | identityDevices; identityRevokeDevices; identityAudit; identityPasskey; identityDeleteAccount; customerCareDaily; customerLoyaltyReminder21h |
| Repositories/Services | identityCenter; backupReadScheduler; CompanyBankAccounts; CustomerCareSettings |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 31 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | identityCenter; backupReadScheduler; CompanyBankAccounts; CustomerCareSettings |
| Criticality | Supporting |
| Current Status | BLOCKED |
| Priority | 40 |
| Definition Evidence | src/App.jsx:32916 |
| Subview/Modal State | [showBankSettings, setShowBankSettings]@32963; [showLoyaltySettings, setShowLoyaltySettings]@32964; [showCustomerCareSettings, setShowCustomerCareSettings]@32965; [showWarehouseSettings, setShowWarehouseSettings]@32966; [showAdvanceSettings, setShowAdvanceSettings]@32967; [showBubbleSettings, setShowBubbleSettings]@32968 |
| Handler Evidence | toggleResetScope@33162; handleBankSettingSubmit@33171; handleLoyaltySettingSubmit@33199; handleCustomerCareSettingSubmit@33229; handleWarehouseSettingSubmit@33243; handleAdvanceSettingSubmit@33256; handleBubbleSettingSubmit@33285; handleCreateBackupFile@33297; handleRestoreBackupFile@33336; handleResetDemoData@33369 |

## role_permissions - Vai trò

| Field | Source-derived mapping |
| --- | --- |
| Module | role_permissions |
| Category | A - Critical Business/Security |
| Routes | MainAppView activeTab=role_permissions |
| Screens | RolePermissionView |
| Features | permission groups/actions, employee role settings |
| Actions | onUpdateCompanySettings |
| Entities | companies, employees |
| Firebase Collections | companies, employees |
| Firebase Functions | Backend requestAuthorization and Firestore rules enforce consumers |
| Repositories/Services | shared role action resolution in App |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 9 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | shared role action resolution in App |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 10 |
| Definition Evidence | src/App.jsx:34048 |
| Subview/Modal State | None found in primary function |
| Handler Evidence | getPermissionModuleExpandKey@34103; togglePermissionModuleExpanded@34104; togglePermission@34112; nextActionSet@34118; setDepartmentPermissions@34167; resetDepartmentPermissions@34197; togglePermissionAction@34229; setModuleActionPermissions@34288; handleSavePermissions@34345 |

## billing - Gói dịch vụ

| Field | Source-derived mapping |
| --- | --- |
| Module | billing |
| Category | C - Supporting |
| Routes | MainAppView activeTab=billing |
| Screens | BillingView |
| Features | subscription display |
| Actions | Navigation/display actions; see event inventory |
| Entities | companies, employees |
| Firebase Collections | companies, employees |
| Firebase Functions | None directly mapped; shared Firestore data path |
| Repositories/Services | company fields |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 0 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | company fields |
| Criticality | Supporting |
| Current Status | BLOCKED |
| Priority | 42 |
| Definition Evidence | src/App.jsx:79727 |
| Subview/Modal State | None found in primary function |
| Handler Evidence | Callbacks/navigation only |

## more - Thêm

| Field | Source-derived mapping |
| --- | --- |
| Module | more |
| Category | C - Supporting |
| Routes | MainAppView activeTab=more |
| Screens | MoreMenu |
| Features | module navigation, role-aware visibility, logout, customer portal switch |
| Actions | onLogout, onSwitchToCustomerLogin |
| Entities | companies, employees |
| Firebase Collections | companies, employees |
| Firebase Functions | None directly mapped; shared Firestore data path |
| Repositories/Services | footerNavigation; appBackNavigation |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 0 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | footerNavigation; appBackNavigation |
| Criticality | Supporting |
| Current Status | BLOCKED |
| Priority | 43 |
| Definition Evidence | src/App.jsx:36195 |
| Subview/Modal State | None found in primary function |
| Handler Evidence | Callbacks/navigation only |

## profile - Profile (routed, outside main menu)

| Field | Source-derived mapping |
| --- | --- |
| Module | profile |
| Category | C - Supporting |
| Routes | MainAppView activeTab=profile |
| Screens | ProfileView |
| Features | company/employee profile, bank QR, identity security, logout |
| Actions | onEditEmployee, onUpdateCompanySettings, onGetIdentityToken, onLogout |
| Entities | companies, employees |
| Firebase Collections | companies, employees |
| Firebase Functions | identityDevices; identityRevokeDevices; identityAudit; identityPasskey |
| Repositories/Services | IdentitySecurityCenter; EmployeeBankQr; identityCenter |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 8 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | IdentitySecurityCenter; EmployeeBankQr; identityCenter |
| Criticality | Supporting |
| Current Status | BLOCKED |
| Priority | 44 |
| Definition Evidence | src/App.jsx:28358 |
| Subview/Modal State | None found in primary function |
| Handler Evidence | handlePersonalSubmit@28435; handleCompanySubmit@28461; handleAvatarSelect@28483; handleCompanyLogoSelect@28497 |

## identity - Authentication and enrollment

| Field | Source-derived mapping |
| --- | --- |
| Module | identity |
| Category | A - Critical Business/Security |
| Routes | App authentication gate |
| Screens | LoginRegisterView |
| Features | password/biometric login, setup, registration, recovery, logout and remembered native session |
| Actions | onLogin, onBiometricLogin, onRegister, onForgotPassword, onRequestOwnerReset, onCompleteRecovery, onCompleteIdentitySetup, onVpsEmailRegistrationStart, onVpsEmailRegistrationVerify, onVpsEmailRegistrationComplete, onVpsEmailPasswordResetStart, onVpsEmailPasswordResetVerify, onVpsEmailPasswordResetComplete, onVpsInitialPasswordChange |
| Entities | identity_accounts, identity_audit_logs, identity_rate_limits, identity_unique_keys, identity_owner_reset_requests, identity_passkeys |
| Firebase Collections | identity_accounts, identity_audit_logs, identity_rate_limits, identity_unique_keys, identity_owner_reset_requests, identity_passkeys |
| Firebase Functions | identityLogin; identityBiometricLogin; identityRegisterCompany; identityCompleteSetup; identityRequestRecovery; identityCompleteRecovery; identityLogout; identityPasskey |
| Repositories/Services | identityCenter; nativeSessionPersistence; warmSessionUnlock; BiometricEnrollment; IdentitySetupWizard |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 31 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | identityCenter; nativeSessionPersistence; warmSessionUnlock; BiometricEnrollment; IdentitySetupWizard |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 9 |
| Definition Evidence | src/App.jsx:84796 |
| Subview/Modal State | [showLoginPassword, setShowLoginPassword]@84800; [showForgotPassword, setShowForgotPassword]@84803; [showRegPassword, setShowRegPassword]@84817; [showRegPasswordConfirm, setShowRegPasswordConfirm]@84818; [identitySetupContext, setIdentitySetupContext]@84822 |
| Handler Evidence | handleQuickLogin@84834; runBiometricLogin@84871; openForgotPassword@84904; handleForgotPasswordSubmit@84917; handleLoginSubmit@84946; handleCompleteRecoverySubmit@84968; handleAuthFormSubmit@85004; handleRegisterSubmit@85011 |

## customer_portal - Customer portal

| Field | Source-derived mapping |
| --- | --- |
| Module | customer_portal |
| Category | A - Critical Business/Security |
| Routes | customer activeTab: home/order/orders/messages/debt/payments/bank/points/more |
| Screens | CustomerPortalView |
| Features | home, order draft/submission/history, messages, debt/payment/bank, points/rewards, more |
| Actions | onAddOrderRequest, onEditOrderRequest, onEditCustomer, onAddMessage, onMarkCustomerInboxItemsRead, onRedeemCustomerPoints, onLinkCustomerBankAccount, onLogout |
| Entities | customer_cart, customer_points, customerLoans, reward_catalog, promotions, orders, orderRequests, warehouseDispatches, deliveryReports, payments, messages, bankAccounts, products, pricingInputs, pricingRules |
| Firebase Collections | customer_cart, customer_points, customerLoans, reward_catalog, promotions, orders, orderRequests, warehouseDispatches, deliveryReports, payments, messages, bankAccounts, products, pricingInputs, pricingRules |
| Firebase Functions | customerPortalBootstrap; customerRedeemPoints; createCustomerDebtPaymentRequest |
| Repositories/Services | identityCenter; customerPortalOrderDetail; customerProductVisibility; customerLoyaltyEligibility |
| Stores/State | App shared tenant raw collections -> derived props; module draft/display state; 113 local hook bindings (state/ref/memo/external store combined) |
| Dependencies | identityCenter; customerPortalOrderDetail; customerProductVisibility; customerLoyaltyEligibility |
| Criticality | High |
| Current Status | BLOCKED |
| Priority | 13 |
| Definition Evidence | src/App.jsx:80812 |
| Subview/Modal State | [activeTab, setActiveTab]@80843; [isPaymentSheetOpen, setIsPaymentSheetOpen]@80854; [isPointWithdrawSheetOpen, setIsPointWithdrawSheetOpen]@80874 |
| Handler Evidence | getCustomerBankDisplayText@80926; addItems@81088; onKeyDown@81142; resolveCustomerPortalProductConfiguration@81185; buildCustomerPortalBillingSnapshot@81189; markCustomerConversationAsRead@81454; openCustomerInbox@81474; openCustomerConversation@81478; openCustomerSalesConversation@81483; getCustomerPortalOrderCode@81667; getCustomerPortalDisplayOrderCode@81672; getCustomerPortalOrderLines@81690; getCustomerPortalOrderTotal@81692; formatCustomerQuantityLabel@81694; formatCustomerUnitPriceLabel@81705; formatCustomerConversionLabel@81707; getCustomerPortalTrackingTimestamp@81714; getCustomerPortalTrackingDateKey@81718; getCustomerPortalTrackingRefs@81721; getCustomerPortalTrackingProductKeys@81739; hasCustomerPortalTrackingIntersection@81768; isCustomerPortalDispatchLinked@81775; isCustomerPortalDeliveryLinked@81787; isCustomerPortalTrackingDelivered@81800; getCustomerPortalDispatchDriverInfo@81834; getCustomerPortalDispatchDriverSummary@81843; handleConfirmCustomerOrderReceived@81918; openCustomerProfileEditor@81944; resolveCustomerUnitPrice@81952; normalizeCustomerCartItem@81956; addToCart@81979; updateCartItem@82022; removeCartItem@82046; handleOpenDebtPayment@82048; handleConfirmPaymentTransfer@82080; openPayment@82092; copyReference@82093; handleCopyDebtPaymentReference@82102; CustomerDebtPaymentButton@82110; openPointWithdrawSheet@82143; handleRedeemPointsForDebt@82152; handleSubmitPointWithdraw@82189; handleSendCustomerMessage@82295; renderPointWithdrawSheet@82344; renderCustomerMessages@82507; renderPaymentSheet@82660; canCustomerEditRequest@82750; startEditCustomerRequest@82755; submitOrderRequest@82807; saveProfile@82946; handleUseCurrentGpsForProfile@82970; handleCustomerAvatarSelect@83000; statusLabel@83014; handleCustomerBankLinkSubmit@83019; renderHome@83069; renderOrder@83232; renderOrders@83468; renderCustomerOrderDetailSheet@83536; renderDebt@83683; renderPayments@83843; renderBank@83858; renderPoints@83991; renderMore@84133; renderContent@84266 |
