import assert from 'node:assert/strict';
import reminders from '../functions/loyaltyReminders.js';
const date = '2026-10-02';
const row = {companyId:'c',customerId:'u',pendingRewardDate:date,pendingRewardPoints:10,pendingRewardMoney:10000,pendingRewardCheckedAt:'2026-10-02T13:00:00Z'};
const notification = new Map();
let changed = false;
const snap = value => ({exists:true,data:()=>value});
const db = {
  collection(path) {
    const query = {where:()=>query,get:async()=>({docs:path.endsWith('customer_points') ? [snap(row)] : changed ? [snap({updatedAt:'2026-10-02T14:00:00Z'})] : []})};
    return query;
  },
  doc(path) { return {path,get:async()=>snap(path.includes('companies') ? {customerLoyaltyEnabled:true} : {companyId:'c'})}; },
  async runTransaction(callback) { await callback({get:async ref=>({exists:notification.has(ref.path)}),set:(ref,value)=>notification.set(ref.path,value)}); },
};
const run = () => reminders.sendLoyaltyReminders({db,appId:'a',date,pathBuilder:(_,name)=>name});
await run(); await run();
assert.equal(notification.size,1);
assert.equal([...notification.values()][0].targetCustomerId,'u');
notification.clear(); changed=true;
await run(); assert.equal(notification.size,0);
console.log('PASS reminders: customer targeting, no duplicates, no stale rewards');
