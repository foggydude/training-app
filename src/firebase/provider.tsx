'use client';

import type { FirebaseApp } from 'firebase/app';
import type { Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import React, { useContext, createContext } from 'react';

interface FirebaseContextValue {
  firebaseApp: FirebaseApp | null;
  auth: Auth | null;
  firestore: Firestore | null;
  loading: boolean;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  firebaseApp: null,
  auth: null,
  firestore: null,
  loading: true,
});

export function FirebaseProvider({
  children,
  ...value
}: {
  children: React.ReactNode;
  firebaseApp: FirebaseApp | null;
  auth: Auth | null;
  firestore: Firestore | null;
  loading: boolean;
}) {
  return (
    <FirebaseContext.Provider value={value}>
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase() {
  const context = useContext(FirebaseContext);
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider');
  }
  return context;
}

export function useFirebaseApp() {
  return useFirebase().firebaseApp;
}

export function useAuth() {
  return useFirebase().auth;
}

export function useFirestore() {
  return useFirebase().firestore;
}
