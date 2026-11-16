// The transaction list has its own server records. Invoice/customer joins and
// payment history must not delay that list, or turn missing history into zero.
export const BANK_PRIMARY_COLLECTIONS=Object.freeze(['bankTransactions']);
const all=Object.freeze([...BANK_PRIMARY_COLLECTIONS,'bankAccounts','customers','orders','payments','payment_reconciliations']);
export const getBankWorkspaceReadCollections=primaryCommitted=>primaryCommitted?all:BANK_PRIMARY_COLLECTIONS;
