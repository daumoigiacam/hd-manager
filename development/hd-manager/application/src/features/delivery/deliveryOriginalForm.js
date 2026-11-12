import {buildCustomerProductBillingSnapshot,resolveTransactionBillingSnapshot,isSameBillingUnit} from '../../services/customerProductBilling.js';
import {normalizeProductPricingUnit} from '../../services/productPricingUnits.js';
import {normalizeLeadingLabel,capitalizeFirst,parseLooseQuantityValue,parseLooseMoneyValue} from './deliveryOriginalRules.js';
export function originalDeliveryForm(context,draft){
 const {product,customer:selectedCustomer,dispatch,sourceRow,base,editedAt,asset,cost}=context;
 const unsupported=()=>{throw Object.assign(Error('Missing explicit frozen delivery unit/price; historical fallback is not permitted'),{code:'delivery-unsupported-contract'});};
 const frozen=resolveTransactionBillingSnapshot({record:sourceRow,product});if(!frozen.hasFrozenPricing)unsupported();
 const actualRows=[{...sourceRow,actualWeight:draft.actualWeight,actualQuantity:draft.actualQuantity,actualPackageCount:draft.actualPackageCount,actualQuantityUnit:draft.actualQuantityUnit,actualPackageUnit:draft.actualPackageUnit}];
 const findProductForActualRow=()=>product,products=[product],dayDispatches=[dispatch],customerLookup=new Map([[selectedCustomer.id,selectedCustomer]]),selectedCustomerId=selectedCustomer.id;
 const getCustomerBranchProductConfigSource=unsupported,getProductShortName=unsupported,resolveDispatchOrderRequestPrice=unsupported,getCustomerProductPricingUnit=unsupported,getCustomerProductPrice=unsupported;
const resolveActualRowPricingMeta = (row = {}, productOverride = null) => {
    const product = productOverride || findProductForActualRow(row);
    const frozenRowSnapshot = resolveTransactionBillingSnapshot({ record: row, product });
    if (frozenRowSnapshot.hasFrozenPricing) {
      return {
        configurationId: frozenRowSnapshot.configurationId,
        pricingUnit: frozenRowSnapshot.billingUnit,
        unitPrice: frozenRowSnapshot.unitPrice,
        usesWeightPricing: isSameBillingUnit(frozenRowSnapshot.billingUnit, 'Kg'),
        source: 'report_snapshot',
      };
    }
    const dispatch = row.dispatchId
      ? dayDispatches.find(item => item.id === row.dispatchId)
      : null;
    const customer = customerLookup.get(dispatch?.customerId || selectedCustomerId) || selectedCustomer;
    const configSource = getCustomerBranchProductConfigSource(
      customer,
      dispatch?.branchId || dispatch?.customerBranchId || '',
      products
    );
    const productLabel = getProductShortName(product)
      || row.productNameInput
      || row.productNameSnapshot
      || dispatch?.productNameSnapshot
      || '';
    const priceInfo = dispatch
      ? resolveDispatchOrderRequestPrice(dispatch, product, customer, productLabel)
      : null;
    const pricingUnit = normalizeProductPricingUnit(
      priceInfo?.pricingUnit
      || row.pricingUnit
      || getCustomerProductPricingUnit(
        configSource,
        product,
        row.actualQuantityUnit || row.expectedQuantityUnit || product?.unit || 'Con'
      )
    );
    const unitPrice = parseLooseMoneyValue(row.unitPrice)
      || parseLooseMoneyValue(priceInfo?.unitPrice)
      || getCustomerProductPrice(configSource, product, pricingUnit)
      || 0;
    return {
      configurationId: priceInfo?.configurationId || '',
      pricingUnit,
      unitPrice,
      usesWeightPricing: isSameBillingUnit(pricingUnit, 'Kg'),
      source: priceInfo?.source || 'legacy_fallback',
    };
  };
const normalizeActualRowsForSave = () => actualRows
    .map((row) => {
      const product = findProductForActualRow(row);
      const actualWeightKg = row.actualWeight ? parseLooseQuantityValue(row.actualWeight) : parseLooseQuantityValue(row.expectedWeightKg);
      const actualQuantityValue = row.actualQuantity ? parseLooseQuantityValue(row.actualQuantity) : parseLooseQuantityValue(row.expectedQuantity);
      const actualPackageCountValue = row.actualPackageCount ? parseLooseQuantityValue(row.actualPackageCount) : 0;
      const productNameSnapshot = product?.name || row.productNameSnapshot || row.productNameInput || '';
      const pricingMeta = resolveActualRowPricingMeta(row, product);
      const actualQuantityUnit = normalizeLeadingLabel(
        pricingMeta.usesWeightPricing
          ? (row.actualQuantityUnit || row.expectedQuantityUnit || product?.unit || 'Con')
          : pricingMeta.pricingUnit
      );
      const billingSnapshot = buildCustomerProductBillingSnapshot({
        configuration: {
          productId: product?.id || row.productId || '',
          productName: productNameSnapshot,
          configurationId: pricingMeta.configurationId || row.configurationId || '',
          billingUnit: pricingMeta.pricingUnit,
          pricingUnit: pricingMeta.pricingUnit,
          unitPrice: pricingMeta.unitPrice,
          source: pricingMeta.source || 'delivery_report',
        },
        product,
        productId: product?.id || row.productId || '',
        productName: productNameSnapshot,
        actualUnit: actualQuantityUnit,
        actualQuantity: actualQuantityValue,
        actualWeightKg,
      });
      return {
        ...row,
        ...billingSnapshot,
        productId: product?.id || row.productId || '',
        productNameSnapshot,
        actualWeightKg,
        actualQuantityValue,
        actualPackageCountValue,
        actualQuantityUnit,
        actualPackageUnit: normalizeLeadingLabel(row.actualPackageUnit || 'Bọc'),
        pricingUnit: billingSnapshot.billingUnit,
        pricingQuantity: billingSnapshot.billingQuantity,
        pricingPendingActual: billingSnapshot.pricingPendingActual,
        unitPrice: billingSnapshot.unitPrice,
        pricingAmount: billingSnapshot.amount,
      };
    })
    .filter(row => row.dispatchId || row.productNameSnapshot || row.actualWeightKg > 0 || row.actualQuantityValue > 0 || row.actualPackageCountValue > 0);
 const rowsToSave=normalizeActualRowsForSave(),firstRow=rowsToSave[0];if(!firstRow||firstRow.billingSnapshotValid===false||firstRow.pricingPendingActual)unsupported();
 const workingDate=draft.date,collectedAmountValue=draft.collectedAmount,collectedMethod=draft.collectedMethod,deliveryExpenseAmountValue=draft.deliveryExpenseAmount,deliveryExpenseCategory=draft.deliveryExpenseCategory;
 const deliveryExpenseKmAtValue=draft.kmAt,deliveryExpenseLitersValue=draft.liters,deliveryExpenseUnitPriceValue=draft.fuelUnitPrice,effectiveDeliveryExpenseAssetId=draft.assetId,selectedExpenseAsset=asset,linkedAssetCostLog=cost,currentEditingReport=base;
 const returnWeightKgValue=draft.returnWeightKg,returnQuantityValue=draft.returnQuantity,returnQuantityUnit=draft.returnQuantityUnit,returnPhotoUrl=base?.returnPhotoUrl||'',shippingAmountValue=draft.shippingAmount,shippingNoteValue=capitalizeFirst(draft.shippingNote||''),photoUrl=base?.photoUrl||'',note=draft.note;
 const normalizeExpenseCategoryLabel=normalizeLeadingLabel;
const buildReportPayload = (row) => ({
        date: workingDate,
        dispatchId: row.dispatchId || '',
        customerId: selectedCustomerId,
        productId: row.productId || '',
        customerNameSnapshot: selectedCustomer?.name || '',
        productNameSnapshot: row.productNameSnapshot || row.productNameInput || 'Hàng hóa',
        expectedWeightKg: row.expectedWeightKg,
        expectedQuantity: row.expectedQuantity,
        expectedQuantityUnit: row.expectedQuantityUnit,
        actualWeightKg: row.actualWeightKg,
        actualQuantity: row.actualQuantityValue,
        actualPackageCount: row.actualPackageCountValue,
        actualQuantityUnit: normalizeLeadingLabel(row.actualQuantityUnit || row.expectedQuantityUnit || 'Con'),
        actualPackageUnit: normalizeLeadingLabel(row.actualPackageUnit || 'Bọc'),
        actualUnit: normalizeLeadingLabel(row.actualQuantityUnit || row.expectedQuantityUnit || 'Con'),
        configurationId: `${row.configurationId || ''}`.trim(),
        billingUnit: normalizeProductPricingUnit(row.billingUnit || row.pricingUnit || row.actualQuantityUnit || 'Con'),
        billingQuantity: parseLooseQuantityValue(row.billingQuantity ?? row.pricingQuantity),
        amount: parseLooseMoneyValue(row.amount ?? row.pricingAmount),
        billingSnapshotVersion: parseLooseQuantityValue(row.billingSnapshotVersion) || 1,
        billingSnapshotSource: row.billingSnapshotSource || 'delivery_report',
        billingSnapshotValid: row.billingSnapshotValid !== false,
        billingSnapshotError: row.billingSnapshotError || '',
        pricingUnit: normalizeProductPricingUnit(row.pricingUnit || row.actualQuantityUnit || 'Con'),
        pricingQuantity: parseLooseQuantityValue(row.pricingQuantity),
        pricingPendingActual: Boolean(row.pricingPendingActual),
        unitPrice: parseLooseMoneyValue(row.unitPrice),
        pricingAmount: parseLooseMoneyValue(row.pricingAmount),
        collectedAmount: collectedAmountValue,
        collectedMethod,
        deliveryExpenseAmount: deliveryExpenseAmountValue,
        deliveryExpenseCategory: normalizeExpenseCategoryLabel(deliveryExpenseCategory || 'Chi phí giao hàng'),
        deliveryExpenseAssetId: effectiveDeliveryExpenseAssetId || '',
        deliveryExpenseAssetNameSnapshot: selectedExpenseAsset?.name || '',
        deliveryExpenseAssetPlateSnapshot: selectedExpenseAsset?.plateNumber || selectedExpenseAsset?.licensePlate || selectedExpenseAsset?.plate || '',
        deliveryExpenseKmAt: deliveryExpenseKmAtValue,
        deliveryExpenseLiters: deliveryExpenseLitersValue,
        deliveryExpenseUnitPrice: deliveryExpenseUnitPriceValue,
        assetCostLogId: linkedAssetCostLog?.id || currentEditingReport?.assetCostLogId || '',
        note: capitalizeFirst(note || ''),
        photoUrl,
        photoCapturedAt: photoUrl ? editedAt : '',
        returnWeightKg: returnWeightKgValue,
        returnQuantity: returnQuantityValue,
        returnQuantityUnit: normalizeLeadingLabel(returnQuantityUnit || firstRow.expectedQuantityUnit || 'Con'),
        returnPhotoUrl,
        returnPhotoCapturedAt: returnPhotoUrl ? editedAt : '',
        shippingAmount: shippingAmountValue,
        shippingNote: shippingNoteValue,
        shippingMethod: 'Gửi xe'
      });
 const payload=buildReportPayload(firstRow);payload.orderedUnit=sourceRow.orderedUnit;
 return {payload,row:firstRow};
}
