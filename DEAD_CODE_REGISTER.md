# Dead Code Register

Baseline: `4db424a3e511bc2a24162245e7423478da9f89c8`. Locations refer to baseline. A = proven removable binding, B = retain for review, C = required/test-used, D = historical evidence (retained as a group).

| Item | Type | Location | Evidence | Classification | Action | Risk |
| --- | --- | --- | --- | --- | --- | --- |
| _companyId | Static unused-symbol candidate | src/api/hdConnectStaging.js:556 | 1 other-file literal references; tests/vps-domain-consumption.test.mjs | C | Keep | Behavior/test/runtime ownership |
| _tenantId | Static unused-symbol candidate | src/api/hdConnectStaging.js:557 | 1 other-file literal references; tests/vps-domain-consumption.test.mjs | C | Keep | Behavior/test/runtime ownership |
| _organizationId | Static unused-symbol candidate | src/api/hdConnectStaging.js:558 | 1 other-file literal references; tests/vps-domain-consumption.test.mjs | C | Keep | Behavior/test/runtime ownership |
| _companyId | Static unused-symbol candidate | src/api/hdConnectStaging.js:567 | 1 other-file literal references; tests/vps-domain-consumption.test.mjs | C | Keep | Behavior/test/runtime ownership |
| _tenantId | Static unused-symbol candidate | src/api/hdConnectStaging.js:568 | 1 other-file literal references; tests/vps-domain-consumption.test.mjs | C | Keep | Behavior/test/runtime ownership |
| _organizationId | Static unused-symbol candidate | src/api/hdConnectStaging.js:569 | 1 other-file literal references; tests/vps-domain-consumption.test.mjs | C | Keep | Behavior/test/runtime ownership |
| flushSync | Import binding | src/App.jsx:7 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| MoreVertical | Import binding | src/App.jsx:48 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| Mic | Import binding | src/App.jsx:48 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| KeyRound | Import binding | src/App.jsx:50 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| Pin | Import binding | src/App.jsx:51 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| Sun | Import binding | src/App.jsx:51 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| Moon | Import binding | src/App.jsx:51 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| Monitor | Import binding | src/App.jsx:51 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| ChatAvatar | Import binding | src/App.jsx:200 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| normalizeChatSearch | Import binding | src/App.jsx:206 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| AUTOMATIC_EVALUATION_SCHEMA_VERSION | Import binding | src/App.jsx:216 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| useHDTheme | Import binding | src/App.jsx:394 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| isEmployeeSalesCollaboratorPosition | Static unused-symbol candidate | src/App.jsx:1662 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| hasCompanyRolePermission | Static unused-symbol candidate | src/App.jsx:2555 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| isAccountingAddedExpense | Static unused-symbol candidate | src/App.jsx:3163 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| buildCustomerPaymentReference | Static unused-symbol candidate | src/App.jsx:3470 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| isLegacyVietQrPaymentSource | Static unused-symbol candidate | src/App.jsx:3540 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| buildProductLookupText | Static unused-symbol candidate | src/App.jsx:5025 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| customerName | Static unused-symbol candidate | src/App.jsx:5645 | 48 other-file literal references; functions/index.js, scripts/audit-critical-business-modules.mjs | C | Keep | Behavior/test/runtime ownership |
| getCustomerProductUnitOptions | Static unused-symbol candidate | src/App.jsx:7189 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| BACKUP_COLLECTION_LABELS | Static unused-symbol candidate | src/App.jsx:7435 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| prompt | Static unused-symbol candidate | src/App.jsx:8019 | 3 other-file literal references; tests/master-rest-pagination.test.mjs, tests/visual/customer-create.visual.mjs | C | Keep | Behavior/test/runtime ownership |
| requestWarehouseDispatchDraftFromGemini | Static unused-symbol candidate | src/App.jsx:8085 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| prompt | Static unused-symbol candidate | src/App.jsx:8094 | 3 other-file literal references; tests/master-rest-pagination.test.mjs, tests/visual/customer-create.visual.mjs | C | Keep | Behavior/test/runtime ownership |
| buildOrderRequestVoicePrompt | Static unused-symbol candidate | src/App.jsx:8168 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| assertAttendanceWifiMatches | Static unused-symbol candidate | src/App.jsx:8801 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| validatePreciseAttendanceLocation | Static unused-symbol candidate | src/App.jsx:8811 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| requestCurrentLocationLegacy | Static unused-symbol candidate | src/App.jsx:9168 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| buildAttendanceMethodPayloadLegacy | Static unused-symbol candidate | src/App.jsx:9199 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| buildAttendanceMethodPayload | Static unused-symbol candidate | src/App.jsx:9223 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| buildSimpleCheckOutPayload | Static unused-symbol candidate | src/App.jsx:9559 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| getInitialLoginMode | Static unused-symbol candidate | src/App.jsx:9650 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| calculateTieredBonus | Static unused-symbol candidate | src/App.jsx:9668 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| shouldUseTotalRevenueCommission | Static unused-symbol candidate | src/App.jsx:9697 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| calculateDailyPayrollExpense | Static unused-symbol candidate | src/App.jsx:9844 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| buildTimeBucketSeries | Static unused-symbol candidate | src/App.jsx:10698 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| buildLedgerSnapshot | Static unused-symbol candidate | src/App.jsx:10732 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| getCustomerCredit | Static unused-symbol candidate | src/App.jsx:11068 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| calculateSalaryDetails | Static unused-symbol candidate | src/App.jsx:11537 | 1 other-file literal references; tests/payroll-allowance-proration.test.mjs | C | Keep | Behavior/test/runtime ownership |
| realtimeStatus | Static unused-symbol candidate | src/App.jsx:12333 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| _removed | Static unused-symbol candidate | src/App.jsx:12580 | 0 other-file literal references; runtime/side-effect reachability not proven | C | Keep | Behavior/test/runtime ownership |
| _removed | Static unused-symbol candidate | src/App.jsx:12717 | 0 other-file literal references; runtime/side-effect reachability not proven | C | Keep | Behavior/test/runtime ownership |
| hasStableValue | Static unused-symbol candidate | src/App.jsx:14313 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| customerAccounts | Static unused-symbol candidate | src/App.jsx:15067 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleLogin | Static unused-symbol candidate | src/App.jsx:16333 | 2 other-file literal references; tests/identity-center.test.mjs, tests/phone-login-ui.test.mjs | C | Keep | Behavior/test/runtime ownership |
| handleForgotPassword | Static unused-symbol candidate | src/App.jsx:16667 | 2 other-file literal references; tests/identity-center.test.mjs, tests/phone-login-ui.test.mjs | C | Keep | Behavior/test/runtime ownership |
| canCurrentUserReviewAdvanceRequests | Static unused-symbol candidate | src/App.jsx:16982 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| desktopDispatcherInfo | Static unused-symbol candidate | src/App.jsx:17700 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| _createLogin | Static unused-symbol candidate | src/App.jsx:19059 | 0 other-file literal references; runtime/side-effect reachability not proven | C | Keep | Behavior/test/runtime ownership |
| _loginPassword | Static unused-symbol candidate | src/App.jsx:19060 | 1 other-file literal references; tests/email-auth-vps-contract.test.mjs | C | Keep | Behavior/test/runtime ownership |
| _loginPasswordConfirm | Static unused-symbol candidate | src/App.jsx:19061 | 1 other-file literal references; tests/email-auth-vps-contract.test.mjs | C | Keep | Behavior/test/runtime ownership |
| _account | Static unused-symbol candidate | src/App.jsx:19099 | 14 other-file literal references; firestore.rules, functions/identityCenter.js | C | Keep | Behavior/test/runtime ownership |
| _createLogin | Static unused-symbol candidate | src/App.jsx:19100 | 0 other-file literal references; runtime/side-effect reachability not proven | C | Keep | Behavior/test/runtime ownership |
| _loginPassword | Static unused-symbol candidate | src/App.jsx:19101 | 1 other-file literal references; tests/email-auth-vps-contract.test.mjs | C | Keep | Behavior/test/runtime ownership |
| _loginPasswordConfirm | Static unused-symbol candidate | src/App.jsx:19102 | 1 other-file literal references; tests/email-auth-vps-contract.test.mjs | C | Keep | Behavior/test/runtime ownership |
| _createLogin | Static unused-symbol candidate | src/App.jsx:19140 | 0 other-file literal references; runtime/side-effect reachability not proven | C | Keep | Behavior/test/runtime ownership |
| _loginPassword | Static unused-symbol candidate | src/App.jsx:19141 | 1 other-file literal references; tests/email-auth-vps-contract.test.mjs | C | Keep | Behavior/test/runtime ownership |
| _loginPasswordConfirm | Static unused-symbol candidate | src/App.jsx:19142 | 1 other-file literal references; tests/email-auth-vps-contract.test.mjs | C | Keep | Behavior/test/runtime ownership |
| _account | Static unused-symbol candidate | src/App.jsx:19184 | 14 other-file literal references; firestore.rules, functions/identityCenter.js | C | Keep | Behavior/test/runtime ownership |
| _createLogin | Static unused-symbol candidate | src/App.jsx:19185 | 0 other-file literal references; runtime/side-effect reachability not proven | C | Keep | Behavior/test/runtime ownership |
| _loginPassword | Static unused-symbol candidate | src/App.jsx:19186 | 1 other-file literal references; tests/email-auth-vps-contract.test.mjs | C | Keep | Behavior/test/runtime ownership |
| _loginPasswordConfirm | Static unused-symbol candidate | src/App.jsx:19187 | 1 other-file literal references; tests/email-auth-vps-contract.test.mjs | C | Keep | Behavior/test/runtime ownership |
| line | Static unused-symbol candidate | src/App.jsx:20798 | 160 other-file literal references; android/.gitignore, android/app/proguard-rules.pro | C | Keep | Behavior/test/runtime ownership |
| isCheckedIn | Static unused-symbol candidate | src/App.jsx:24381 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| isCheckedOut | Static unused-symbol candidate | src/App.jsx:24382 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| isLeave | Static unused-symbol candidate | src/App.jsx:24383 | 2 other-file literal references; functions/employeeEvaluation.js, src/utils/employeeEvaluationAutomation.js | B | Keep | Behavior/test/runtime ownership |
| openAuthModal | Static unused-symbol candidate | src/App.jsx:25458 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| renderClassicDashboard | Static unused-symbol candidate | src/App.jsx:26011 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| showMessagesFooterButton | Static unused-symbol candidate | src/App.jsx:26735 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| AttendanceViewLegacy | Static unused-symbol candidate | src/App.jsx:27532 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| showBankSettings | Static unused-symbol candidate | src/App.jsx:33429 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| showCustomerCareSettings | Static unused-symbol candidate | src/App.jsx:33431 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| bankSaveStatus | Static unused-symbol candidate | src/App.jsx:33453 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| customerCareSaveStatus | Static unused-symbol candidate | src/App.jsx:33457 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| bankStatusClasses | Static unused-symbol candidate | src/App.jsx:33562 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| loyaltyStatusClasses | Static unused-symbol candidate | src/App.jsx:33565 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| customerCareInactiveDaysPreview | Static unused-symbol candidate | src/App.jsx:33570 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| customerCareStatusClasses | Static unused-symbol candidate | src/App.jsx:33571 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| advanceStatusClasses | Static unused-symbol candidate | src/App.jsx:33580 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleBankSettingSubmit | Static unused-symbol candidate | src/App.jsx:33637 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleCustomerCareSettingSubmit | Static unused-symbol candidate | src/App.jsx:33695 | 1 other-file literal references; tests/loyalty-settings-save.test.mjs | C | Keep | Behavior/test/runtime ownership |
| SettingsViewLegacy | Static unused-symbol candidate | src/App.jsx:35050 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| isReadingAssetDocuments | Static unused-symbol candidate | src/App.jsx:35758 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| assetDocumentStatus | Static unused-symbol candidate | src/App.jsx:35759 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleAssetImage | Static unused-symbol candidate | src/App.jsx:35833 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleAssetDocumentImage | Static unused-symbol candidate | src/App.jsx:35840 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| getAssetDocumentImageUrls | Static unused-symbol candidate | src/App.jsx:35870 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleReadAssetDocuments | Static unused-symbol candidate | src/App.jsx:35875 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| transferAccountNumber | Static unused-symbol candidate | src/App.jsx:36459 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| effectiveOutputWeight | Static unused-symbol candidate | src/App.jsx:37705 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| PricingEngineView | Static unused-symbol candidate | src/App.jsx:37929 | 4 other-file literal references; scripts/audit-module-paths.mjs, tests/master-interactive-read-scope.test.mjs | C | Keep | Behavior/test/runtime ownership |
| topSuggestion | Static unused-symbol candidate | src/App.jsx:38044 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| latestOverallWarehouseInput | Static unused-symbol candidate | src/App.jsx:38603 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| lossRows | Static unused-symbol candidate | src/App.jsx:38725 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| manualInputRows | Static unused-symbol candidate | src/App.jsx:38727 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| canViewPricingSetup | Static unused-symbol candidate | src/App.jsx:38732 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| updateGroupMarginDraft | Static unused-symbol candidate | src/App.jsx:39080 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleSavePricingInput | Static unused-symbol candidate | src/App.jsx:39311 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| overviewPeriod | Static unused-symbol candidate | src/App.jsx:41153 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| setOverviewPeriod | Static unused-symbol candidate | src/App.jsx:41153 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| formatKpiValue | Static unused-symbol candidate | src/App.jsx:41264 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| overviewPeriodOptions | Static unused-symbol candidate | src/App.jsx:41327 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| overviewFinanceCards | Static unused-symbol candidate | src/App.jsx:41333 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| overviewOperationalMetrics | Static unused-symbol candidate | src/App.jsx:41596 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| homepageInsightItems | Static unused-symbol candidate | src/App.jsx:41603 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| renderProfitabilitySummary | Static unused-symbol candidate | src/App.jsx:41775 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| ExecutivePeriodSummaryCard | Static unused-symbol candidate | src/App.jsx:42364 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| ExecutiveKpiCard | Static unused-symbol candidate | src/App.jsx:42449 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| pendingAdvanceAmount | Static unused-symbol candidate | src/App.jsx:42655 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| recentSalaryRows | Static unused-symbol candidate | src/App.jsx:42723 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| totalPenaltyDisplay | Static unused-symbol candidate | src/App.jsx:42734 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| isSales | Static unused-symbol candidate | src/App.jsx:43639 | 6 other-file literal references; src/services/executiveDashboardService.js, src/utils/footerNavigation.js | C | Keep | Behavior/test/runtime ownership |
| isWarehouseScale | Static unused-symbol candidate | src/App.jsx:43640 | 2 other-file literal references; src/utils/footerNavigation.js, tests/footer-navigation.test.mjs | C | Keep | Behavior/test/runtime ownership |
| isDriver | Static unused-symbol candidate | src/App.jsx:43641 | 2 other-file literal references; tests/customer-debt-repayment.test.mjs, tests/save-integrity-regressions.test.mjs | C | Keep | Behavior/test/runtime ownership |
| buildProcessingInventoryDraftRows | Static unused-symbol candidate | src/App.jsx:44730 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| FinanceViewLegacy | Static unused-symbol candidate | src/App.jsx:44978 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| actionItem | Static unused-symbol candidate | src/App.jsx:44982 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| setActionItem | Static unused-symbol candidate | src/App.jsx:44982 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| setLocalReplies | Static unused-symbol candidate | src/App.jsx:45424 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| companyInitials | Static unused-symbol candidate | src/App.jsx:45472 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| activeConversations | Static unused-symbol candidate | src/App.jsx:45945 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| canMarkFilteredUnreadAsRead | Static unused-symbol candidate | src/App.jsx:46052 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleMarkFilteredUnreadAsRead | Static unused-symbol candidate | src/App.jsx:46053 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| visibleTypeOptions | Static unused-symbol candidate | src/App.jsx:46499 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| buildChatCustomerText | Static unused-symbol candidate | src/App.jsx:46791 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| getIncomeCashflowGroupLabel | Static unused-symbol candidate | src/App.jsx:47638 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| showSearchBox | Static unused-symbol candidate | src/App.jsx:47656 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| periodLabel | Static unused-symbol candidate | src/App.jsx:47704 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleRejectTransactionSubmit | Static unused-symbol candidate | src/App.jsx:48040 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| actualPackageCount | Static unused-symbol candidate | src/App.jsx:48719 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| actualQuantityUnit | Static unused-symbol candidate | src/App.jsx:48720 | 7 other-file literal references; src/features/delivery/DeliveryRedesignWorkspace.jsx, src/services/customerProductBilling.js | C | Keep | Behavior/test/runtime ownership |
| isReadingPhoto | Static unused-symbol candidate | src/App.jsx:48776 | 1 other-file literal references; src/features/delivery/DeliveryRedesignWorkspace.jsx | B | Keep | Behavior/test/runtime ownership |
| isReadingReturnPhoto | Static unused-symbol candidate | src/App.jsx:48777 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| isReadingStandaloneExpensePhoto | Static unused-symbol candidate | src/App.jsx:48778 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| dayDeliveryCollectedTotal | Static unused-symbol candidate | src/App.jsx:48902 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| dayDeliveryExpenseTotal | Static unused-symbol candidate | src/App.jsx:48903 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| selectedProductDisplayName | Static unused-symbol candidate | src/App.jsx:48966 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| previewStatus | Static unused-symbol candidate | src/App.jsx:48970 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handlePhotoChange | Static unused-symbol candidate | src/App.jsx:49937 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleReturnPhotoChange | Static unused-symbol candidate | src/App.jsx:49953 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleStandaloneExpensePhotoChange | Static unused-symbol candidate | src/App.jsx:49969 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleDeleteReportPhoto | Static unused-symbol candidate | src/App.jsx:49998 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleShareDeliveryReport | Static unused-symbol candidate | src/App.jsx:50152 | 1 other-file literal references; tests/delivery-reconciliation-ux.test.mjs | C | Keep | Behavior/test/runtime ownership |
| setStockCountGroupSearchTerm | Static unused-symbol candidate | src/App.jsx:51710 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleWarehouseCalendarMonthChange | Static unused-symbol candidate | src/App.jsx:51799 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| filteredStockCountGroupOptions | Static unused-symbol candidate | src/App.jsx:52180 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| dayMeasureSummary | Static unused-symbol candidate | src/App.jsx:52368 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| warehouseCalendarCells | Static unused-symbol candidate | src/App.jsx:52383 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| getWarehouseCalendarStat | Static unused-symbol candidate | src/App.jsx:52430 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| warehouseCalendarTitle | Static unused-symbol candidate | src/App.jsx:52435 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| warehouseCalendarCountLabel | Static unused-symbol candidate | src/App.jsx:52440 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| updateStockCountDraft | Static unused-symbol candidate | src/App.jsx:53463 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleEditStockCountFromItem | Static unused-symbol candidate | src/App.jsx:53477 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleDeleteStockCountItem | Static unused-symbol candidate | src/App.jsx:53492 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleSubmitStockCount | Static unused-symbol candidate | src/App.jsx:53500 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| isAccounting | Static unused-symbol candidate | src/App.jsx:55597 | 3 other-file literal references; src/utils/footerNavigation.js, tests/footer-navigation.test.mjs | C | Keep | Behavior/test/runtime ownership |
| isVoiceListening | Static unused-symbol candidate | src/App.jsx:55644 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| voiceStatus | Static unused-symbol candidate | src/App.jsx:55646 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| expiredOrderRequestsForDispatchDate | Static unused-symbol candidate | src/App.jsx:55752 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| getWarehouseStockGroupLabel | Static unused-symbol candidate | src/App.jsx:55854 | 2 other-file literal references; tests/master-inventory-render-dependencies.test.mjs, tests/phase1-hidden-report.test.mjs | C | Keep | Behavior/test/runtime ownership |
| selectedDispatchProduct | Static unused-symbol candidate | src/App.jsx:56260 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| isDispatchManualCatalogActive | Static unused-symbol candidate | src/App.jsx:56400 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| inlineEditingProduct | Static unused-symbol candidate | src/App.jsx:56440 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| previewDispatchRows | Static unused-symbol candidate | src/App.jsx:56844 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| getSupportedVoiceRecorderMimeType | Static unused-symbol candidate | src/App.jsx:57036 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| isVoicePayloadKeywordTrusted | Static unused-symbol candidate | src/App.jsx:57212 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleApplyVoiceTranscript | Static unused-symbol candidate | src/App.jsx:57816 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| transcribeRecordedVoice | Static unused-symbol candidate | src/App.jsx:57851 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleStartVoice | Static unused-symbol candidate | src/App.jsx:57932 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| openHistoryDispatchGroup | Static unused-symbol candidate | src/App.jsx:58370 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleDownloadDispatchSheet | Static unused-symbol candidate | src/App.jsx:58635 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| OrderRequestSelectableProductCard | Static unused-symbol candidate | src/App.jsx:59438 | 2 other-file literal references; tests/order-request-ux.test.mjs, tests/warehouse-dispatch-weight-input.test.mjs | C | Keep | Behavior/test/runtime ownership |
| isWarehouseScale | Static unused-symbol candidate | src/App.jsx:59643 | 2 other-file literal references; src/utils/footerNavigation.js, tests/footer-navigation.test.mjs | C | Keep | Behavior/test/runtime ownership |
| smartPreferenceLoadTokensRef | Static unused-symbol candidate | src/App.jsx:59731 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleDraftItemQuantityUnitChange | Static unused-symbol candidate | src/App.jsx:60025 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| primarySelectedProduct | Static unused-symbol candidate | src/App.jsx:60602 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| calculateRequestAmount | Static unused-symbol candidate | src/App.jsx:60767 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| promptEditOrderRequestDeposit | Static unused-symbol candidate | src/App.jsx:61052 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| applyOrderVoiceExtraction | Static unused-symbol candidate | src/App.jsx:61852 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| openOrderRequestEditForm | Static unused-symbol candidate | src/App.jsx:62282 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| clamp | Static unused-symbol candidate | src/App.jsx:62421 | 8 other-file literal references; src/aiZaloAssistant.js, src/features/messaging/messaging.css | C | Keep | Behavior/test/runtime ownership |
| maxMeasure | Static unused-symbol candidate | src/App.jsx:62430 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleDownloadOrderRequestSheet | Static unused-symbol candidate | src/App.jsx:62882 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| showSearchBox | Static unused-symbol candidate | src/App.jsx:64762 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| setShowSearchBox | Static unused-symbol candidate | src/App.jsx:64763 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| setShowFilterPanel | Static unused-symbol candidate | src/App.jsx:64765 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| sellerExtraExpense | Static unused-symbol candidate | src/App.jsx:65214 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| promptEditOrderItem | Static unused-symbol candidate | src/App.jsx:65637 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| buildOrderZaloMessageLegacy | Static unused-symbol candidate | src/App.jsx:65848 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| openZaloPreview | Static unused-symbol candidate | src/App.jsx:65914 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| syncOrderPayosPayment | Static unused-symbol candidate | src/App.jsx:65959 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| buildOrderShareText | Static unused-symbol candidate | src/App.jsx:65997 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleAddBulkDraft | Static unused-symbol candidate | src/App.jsx:66339 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| promptEditBulkDraftItemQuantity | Static unused-symbol candidate | src/App.jsx:66750 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| promptEditBulkDraftItemPrice | Static unused-symbol candidate | src/App.jsx:66761 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| promptEditBulkDraftDate | Static unused-symbol candidate | src/App.jsx:66772 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| canViewArchived | Static unused-symbol candidate | src/App.jsx:68888 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| CustomerCRMViewLegacy | Static unused-symbol candidate | src/App.jsx:69759 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| canPickCustomerContact | Static unused-symbol candidate | src/App.jsx:69766 | 2 other-file literal references; src/utils/customerContactPicker.js, tests/customer-contact-picker.test.mjs | C | Keep | Behavior/test/runtime ownership |
| showCustomerLocationActions | Static unused-symbol candidate | src/App.jsx:69971 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| customerPriceSearch | Static unused-symbol candidate | src/App.jsx:69982 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| canCopyVisibleCustomerPhone | Static unused-symbol candidate | src/App.jsx:70032 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| canCopyVisibleCustomerLocation | Static unused-symbol candidate | src/App.jsx:70035 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| canOpenVisibleCustomerMaps | Static unused-symbol candidate | src/App.jsx:70036 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| addCustomerProductToPricing | Static unused-symbol candidate | src/App.jsx:71040 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleCopyCustomerPhone | Static unused-symbol candidate | src/App.jsx:71521 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleCopyCustomerLocation | Static unused-symbol candidate | src/App.jsx:71527 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| formatEmployeeDocumentSize | Static unused-symbol candidate | src/App.jsx:75068 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| getEmployeeReviewDateKey | Static unused-symbol candidate | src/App.jsx:75091 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| getCheckTimeMinutes | Static unused-symbol candidate | src/App.jsx:75101 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| evaluationSummary13 | Static unused-symbol candidate | src/App.jsx:75863 | 2 other-file literal references; src/utils/payrollEvaluationBonus.js, tests/payroll-evaluation-integration.test.mjs | C | Keep | Behavior/test/runtime ownership |
| advice | Static unused-symbol candidate | src/App.jsx:75877 | 1 other-file literal references; tests/business-report-finance.test.mjs | C | Keep | Behavior/test/runtime ownership |
| starText | Static unused-symbol candidate | src/App.jsx:75878 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| datasets | Static unused-symbol candidate | src/App.jsx:75879 | 3 other-file literal references; scripts/audit-critical-business-modules.mjs, src/utils/customerLedgerIndex.js | C | Keep | Behavior/test/runtime ownership |
| setReviewMonth | Static unused-symbol candidate | src/App.jsx:76467 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| salesRevenueByEmployeeId | Static unused-symbol candidate | src/App.jsx:76493 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| employeeEvaluationOverview | Static unused-symbol candidate | src/App.jsx:76733 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| employeeAssetCostLookup | Static unused-symbol candidate | src/App.jsx:76771 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| getAssignedAssetsForEmployee | Static unused-symbol candidate | src/App.jsx:76792 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| openEmployeeReview | Static unused-symbol candidate | src/App.jsx:76800 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleUseCurrentAttendanceLocation | Static unused-symbol candidate | src/App.jsx:77147 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleOpenDocumentPicker | Static unused-symbol candidate | src/App.jsx:77248 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleDeleteEmployeeDocument | Static unused-symbol candidate | src/App.jsx:77307 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleDownloadEmployeeDocument | Static unused-symbol candidate | src/App.jsx:77325 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| visibleEmployeeDocuments | Static unused-symbol candidate | src/App.jsx:77335 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| SalaryViewLegacy | Static unused-symbol candidate | src/App.jsx:78168 | 2 other-file literal references; tests/company-departments.test.mjs, tests/section-info-hint.test.mjs | C | Keep | Behavior/test/runtime ownership |
| financialDateInput | Static unused-symbol candidate | src/App.jsx:78174 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| setFinancialDateInput | Static unused-symbol candidate | src/App.jsx:78174 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| editingFinancialRecord | Static unused-symbol candidate | src/App.jsx:78175 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| setEditingFinancialRecord | Static unused-symbol candidate | src/App.jsx:78175 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| financialModalError | Static unused-symbol candidate | src/App.jsx:78176 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| setFinancialModalError | Static unused-symbol candidate | src/App.jsx:78176 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| setSalaryMonth | Static unused-symbol candidate | src/App.jsx:78179 | 1 other-file literal references; tests/payroll-period-hardening.test.mjs | C | Keep | Behavior/test/runtime ownership |
| currentMonthLabel | Static unused-symbol candidate | src/App.jsx:78181 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| snapshotId | Static unused-symbol candidate | src/App.jsx:78265 | 10 other-file literal references; firestore.rules, functions/index.js | C | Keep | Behavior/test/runtime ownership |
| latestAdjustment | Static unused-symbol candidate | src/App.jsx:78265 | 4 other-file literal references; firestore.rules, src/utils/payrollAdjustment.js | C | Keep | Behavior/test/runtime ownership |
| policySnapshot | Static unused-symbol candidate | src/App.jsx:78265 | 8 other-file literal references; firestore.rules, functions/payrollAutoLock.js | C | Keep | Behavior/test/runtime ownership |
| salaryAdvanceRemainingAmount | Static unused-symbol candidate | src/App.jsx:79157 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| isSales | Static unused-symbol candidate | src/App.jsx:79791 | 6 other-file literal references; src/services/executiveDashboardService.js, src/utils/footerNavigation.js | C | Keep | Behavior/test/runtime ownership |
| DebtManagementViewLegacy | Static unused-symbol candidate | src/App.jsx:80573 | 1 other-file literal references; tests/finance-mobile-layout.test.mjs | C | Keep | Behavior/test/runtime ownership |
| debtShareStatus | Static unused-symbol candidate | src/App.jsx:80679 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| showSearchBox | Static unused-symbol candidate | src/App.jsx:80689 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleShareDebt | Static unused-symbol candidate | src/App.jsx:81178 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleCopyDebt | Static unused-symbol candidate | src/App.jsx:81188 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| handleDownloadDebt | Static unused-symbol candidate | src/App.jsx:81194 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| responsibleEmployeeChatTitle | Static unused-symbol candidate | src/App.jsx:81838 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| activePromotions | Static unused-symbol candidate | src/App.jsx:82096 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| React | Import binding | src/design-system/ListPagination.jsx:1 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| React | Import binding | src/features/attendance/AttendanceRoleSelector.jsx:1 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| React | Import binding | src/features/business-report/BusinessReportWorkspace.jsx:1 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| React | Import binding | src/features/employees/EmployeeBankQr.jsx:1 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| React | Import binding | src/features/orders/CoreRowPager.jsx:1 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| id | Static unused-symbol candidate | src/features/settings/companyBankAccounts.js:31 | 547 other-file literal references; .github/workflows/deploy.yml, .github/workflows/publish-p4-staging-artifact.yml | C | Keep | Behavior/test/runtime ownership |
| React | Import binding | src/features/settings/CompanyBankAccounts.jsx:1 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| React | Import binding | src/features/settings/CustomerCareSettings.jsx:1 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| React | Import binding | src/layout/SyncQueueStatus.jsx:1 | Lexical use absent; executable AST + module source order unchanged; implementation retained | A | Remove binding only | Low; tested |
| inventoryPurchaseExpenseQuarter | Static unused-symbol candidate | src/services/executiveDashboardService.js:2299 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| inventoryPurchaseExpenseYear | Static unused-symbol candidate | src/services/executiveDashboardService.js:2319 | 0 other-file literal references; runtime/side-effect reachability not proven | B | Keep | Behavior/test/runtime ownership |
| _amount | Static unused-symbol candidate | src/utils/customerPortalOrderDetail.js:155 | 6 other-file literal references; functions/index.js, functions/paymentCorrection.js | C | Keep | Behavior/test/runtime ownership |
| _pricingAmount | Static unused-symbol candidate | src/utils/customerPortalOrderDetail.js:156 | 0 other-file literal references; runtime/side-effect reachability not proven | C | Keep | Behavior/test/runtime ownership |
| _lineTotal | Static unused-symbol candidate | src/utils/customerPortalOrderDetail.js:157 | 0 other-file literal references; runtime/side-effect reachability not proven | C | Keep | Behavior/test/runtime ownership |
| _totalAmount | Static unused-symbol candidate | src/utils/customerPortalOrderDetail.js:158 | 0 other-file literal references; runtime/side-effect reachability not proven | C | Keep | Behavior/test/runtime ownership |
| _itemTotal | Static unused-symbol candidate | src/utils/customerPortalOrderDetail.js:159 | 0 other-file literal references; runtime/side-effect reachability not proven | C | Keep | Behavior/test/runtime ownership |
| _subtotal | Static unused-symbol candidate | src/utils/customerPortalOrderDetail.js:160 | 2 other-file literal references; src/features/invoice-templates/InvoiceTemplateEngine.jsx, src/features/invoice-templates/invoiceTemplates.css | C | Keep | Behavior/test/runtime ownership |
| _total | Static unused-symbol candidate | src/utils/customerPortalOrderDetail.js:161 | 4 other-file literal references; functions/debtCorrectionReconciliation.js, src/App.jsx | C | Keep | Behavior/test/runtime ownership |
| src/utils/employeeSessionProfile.js | File candidate | src/utils/employeeSessionProfile.js | No basename reference; exported session/permission helper. Authentication boundary, not approved as dead API. | B | Keep for owner review | Authentication/authorization |

Historical reports, migrations and release evidence: D, retain. No whole file, API, hook, state initializer, callback, asset, CSS rule or dependency was admitted to A.

ESLint no-unused-vars is not JSX-aware here. JSX-only references, side-effectful initializers, destructuring used to omit properties, source-extracted tests and compatibility APIs are not removal proof. B entries remain intentionally unchanged.

Counts: A 20; B 192; C 60; D historical records retained.
