import './legacyRuntime.js';
import {initializeApp} from 'firebase/app';
import {initializeFirestore} from 'firebase/firestore';
import {encodeFirestoreNativeValue,decodeFirestoreNativeValue} from './firestoreNativeWireValues.js';
import {buildSalaryDetails,buildEmployeeReviewSummary} from '@hd/employee-home-domain';
import {createPersonalHomeWorkerHandler} from './personalHomeWorkerHandler.js';

const handle=createPersonalHomeWorkerHandler({
 initialize(config){
  if(!config?.projectId||!config?.apiKey)throw new TypeError('Missing calculation codec configuration.');
  // This client is a value-type factory only (Timestamp/DocumentReference).
  // No Auth, listeners, queries, persistence or network operations are started.
  const db=initializeFirestore(initializeApp(config,'hd-personal-home-values'),{});
  return {encode:value=>encodeFirestoreNativeValue(value,db),decode:value=>decodeFirestoreNativeValue(value,db)};
 },
 calculate(input){
  const {employee,employees,attendance,financials,performance,customers,orders,payments,holidays,monthKey,deliveryReports,employeeReviews}=input;
  return {details:buildSalaryDetails(employee.id,employees,attendance,financials,performance,customers,orders,payments,holidays,monthKey),
   reviewSummary:buildEmployeeReviewSummary(employee,{attendance,orders,deliveryReports,reviews:employeeReviews,monthKey})};
 },
 post:message=>self.postMessage(message),
});
self.onmessage=event=>handle(event.data);
