// Shared existing capability names only. List/queue controls must not evaluate
// the financial/stock mutation planners simply to check an enabled button.
export const DELIVERY_RULES=Object.freeze({
 'deliveryReport.create':{capability:'deliveryReports.create',action:'create_delivery_report'},
 'deliveryReport.update':{capability:'deliveryReports.update',action:'edit_delivery_report'},
 'deliveryReport.archive':{capability:'deliveryReports.archive',action:'delete_delivery_report'},
});
export const DELIVERY_READ_CAPS=Object.freeze(['home.read','home.quick-report.read','home.cashflow.read','home.orders.read','orders.read','home.dispatches.read','home.stock.read','home.debt.read','customers.read']);
