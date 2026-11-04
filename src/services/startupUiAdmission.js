// This controls background priority only. It never marks a collection loaded,
// grants access, changes Auth or claims that a UI calculation has committed.
export function createStartupUiAdmission({uid,companyId,isCurrent,onPersonalReady,onNotificationsRequested}) {
 if(typeof uid!=='string'||!uid||typeof companyId!=='string'||!companyId||typeof isCurrent!=='function')throw new TypeError('Invalid startup UI scope.');
 let closed=false,ready=false;
 const valid=scope=>!closed&&isCurrent()&&scope?.uid===uid&&scope?.companyId===companyId;
 return Object.freeze({uid,companyId,
  get personalReady(){return !closed&&ready},
  reportPersonalReady(scope,value){
   if(!valid(scope))return false;
   const next=value===true,changed=ready!==next;ready=next;
   if(changed&&ready)onPersonalReady();return true;
  },
  requestNotifications(scope){if(!valid(scope))return false;onNotificationsRequested();return true},
  close(){closed=true;ready=false},
 });
}
