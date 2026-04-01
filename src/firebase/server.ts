'use server';

// This file is the single source of truth for all Firebase-related code
// that is specifically intended to be used on the server.

import { initializeApp, getApp, getApps, type FirebaseOptions } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { firebaseConfig } from './config';

function getFirebaseApp(config: FirebaseOptions) {
  if (getApps().length > 0) {
    return getApp();
  } else {
    return initializeApp(config);
  }
}

export async function initializeFirebase() {
    const firebaseApp = getFirebaseApp(firebaseConfig);
    const auth = getAuth(firebaseApp);
    const firestore = getFirestore(firebaseApp);
    return { firebaseApp, auth, firestore };
}
