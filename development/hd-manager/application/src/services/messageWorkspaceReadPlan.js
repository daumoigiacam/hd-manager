// Messages/people first. Original financial alert and Zalo sources still load
// after the chat list commits; explicit attachments can demand them earlier.
const primary=Object.freeze(['employees','customers','messages']);
const background=Object.freeze(['zalo_inbox_messages','zalo_inbox_bridge_logs','zalo_send_queue','zalo_campaigns','zalo_campaign_queue','order_requests','ai_reply_rules']);
const none=Object.freeze([]);
const alertHistory=Object.freeze(['orders','orderRequests','payments','expenses','products']);
const attachments=Object.freeze({order:Object.freeze(['orders','products','payments']),order_request:Object.freeze(['orderRequests','products']),report:Object.freeze(['orders','payments','expenses'])});
export const MESSAGE_PRIMARY_COLLECTIONS=primary;
const hasAction=action=>Object.prototype.hasOwnProperty.call(attachments,action);
export const getMessageAttachmentReadCollections=action=>hasAction(action)?attachments[action]:none;
const plans=new Map();
for(const ready of [false,true])for(const action of ['',...Object.keys(attachments)])plans.set(`${ready}:${action}`,Object.freeze([...new Set([...primary,...(attachments[action]||none),...(ready?[...background,...alertHistory]:none)])]));
export const getMessageWorkspaceReadCollections=(action='',backgroundReady=false)=>plans.get(`${backgroundReady===true}:${hasAction(action)?action:''}`);

// A delayed attachment belongs to one conversation and is rechecked against
// current permissions. It cannot send after switching conversations/revocation.
export function pendingAttachmentDecision({request,conversationId,allowed,ready}){
 if(!request)return 'none';
 if(request.conversationId!==conversationId||!allowed)return 'cancel';
 return ready===true?'execute':'wait';
}
