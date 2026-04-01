'use client';

import { type FirebaseApp } from 'firebase/app';
import { type Auth, GoogleAuthProvider } from 'firebase/auth';
import { type Firestore } from 'firebase/firestore';
import { useUser, type AuthUser } from './auth/use-user';
import {
  FirebaseProvider,
  useFirebase,
  useFirebaseApp,
  useFirestore,
  useAuth,
} from './provider';
import { FirebaseClientProvider } from './client-provider';
import { errorEmitter } from './error-emitter';
import { FirestorePermissionError } from './errors';

export {
  // Auth
  useUser,
  GoogleAuthProvider,
  // Firestore
  // Hooks
  useFirebase,
  useFirebaseApp,
  useFirestore,
  useAuth,
  // Providers
  FirebaseProvider,
  FirebaseClientProvider,
  // Errors
  errorEmitter,
  FirestorePermissionError,
};
export type { AuthUser, FirebaseApp, Auth, Firestore };
