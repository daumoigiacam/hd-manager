export function ownsStoredOfflineSession(record,expected){
 if(!record?.identity||!expected)return false;
 return ['projectId','tenantId','principalId','permissionRevision','sessionId','deviceId'].every(key=>typeof expected[key]==='string'&&expected[key]&&record.identity[key]===expected[key]);
}
