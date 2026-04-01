import { type FirebaseOptions } from 'firebase/app';
import firebaseConfigJson from '../../firebase-applet-config.json';

// This is now built from individual environment variables.
const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || firebaseConfigJson.apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || firebaseConfigJson.authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || firebaseConfigJson.projectId,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || firebaseConfigJson.storageBucket,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigJson.messagingSenderId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || firebaseConfigJson.appId,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || firebaseConfigJson.measurementId,
};

const firestoreDatabaseId = firebaseConfigJson.firestoreDatabaseId || '(default)';

// A check to ensure all required fields are present.
// This is more robust than just checking for apiKey.
const requiredFields: (keyof FirebaseOptions)[] = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingFields = requiredFields.filter(field => !firebaseConfig[field]);

if (missingFields.length > 0 && typeof window !== 'undefined') {
  // In the browser, this is a critical error.
  throw new Error(
    `Firebase config is missing the following required fields: ${missingFields.join(
      ', '
    )}. Check your .env file.`
  );
}

export { firebaseConfig, firestoreDatabaseId };
