import ReadWorker from './firestoreReadWorker.js?worker';
export const createFirestoreReadWorker = () => new ReadWorker();
