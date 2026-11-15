// The existing batch quote editor needs only directories. Its original share
// text includes customer debt, so explicitly demand BOTH invoice and payment
// history when sharing is requested. Order requests are not read by this view.
export const QUOTE_PRIMARY_COLLECTIONS=Object.freeze(['customers','products']);
export const QUOTE_SHARE_COLLECTIONS=Object.freeze(['customers','products','orders','payments']);
export const getQuoteWorkspaceReadCollections=shareRequested=>shareRequested===true?QUOTE_SHARE_COLLECTIONS:QUOTE_PRIMARY_COLLECTIONS;
export function admitQuoteShare({ready,requestHistory,onWaiting}){
 if(ready===true)return true;
 requestHistory?.();onWaiting?.();return false;
}
