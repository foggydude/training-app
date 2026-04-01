'use client';

import {
  type FirebaseApp,
  type FirebaseOptions,
  initializeApp,
  getApps,
  getApp,
} from 'firebase/app';
import {
  type Auth,
  getAuth,
  initializeAuth,
  indexedDBLocalPersistence,
} from 'firebase/auth';
import { type Firestore, getFirestore } from 'firebase/firestore';
import { firebaseConfig, firestoreDatabaseId } from '@/firebase/config';
import React, { useEffect, useState, useMemo } from 'react';
import { FirebaseProvider } from './provider';
import { Icons } from '@/components/icons';

interface FirebaseInstances {
  firebaseApp: FirebaseApp;
  auth: Auth;
  firestore: Firestore;
}

function initializeFirebaseClient(
  config: FirebaseOptions
): FirebaseInstances | null {
  if (!config.apiKey) {
    // This is not an error during build, so we'll just log a warning.
    console.warn(
      'Firebase API key is missing. Firebase features will be disabled.'
    );
    return null;
  }
  const app = getApps().length === 0 ? initializeApp(config) : getApp();
  // Explicitly initialize auth with persistence
  const auth = initializeAuth(app, {
    persistence: indexedDBLocalPersistence,
  });
  const firestore = getFirestore(app, firestoreDatabaseId);
  return { firebaseApp: app, auth, firestore };
}

/**
 * A client-side provider that initializes Firebase and makes it available to the rest of the app.
 * It also handles the initial loading state, showing a full-page spinner until Firebase is ready.
 */
export function FirebaseClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [instances, setInstances] = useState<FirebaseInstances | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const initialized = initializeFirebaseClient(firebaseConfig);
      setInstances(initialized);
      if (!initialized) {
        setError(
          'Firebase is not configured correctly. Check your .env file.'
        );
      }
    } catch (e: any) {
      console.error('Failed to initialize Firebase', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const contextValue = useMemo(
    () => ({
      firebaseApp: instances?.firebaseApp ?? null,
      auth: instances?.auth ?? null,
      firestore: instances?.firestore ?? null,
      loading: loading,
    }),
    [instances, loading]
  );

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Icons.logo className="h-12 w-12 animate-pulse text-primary" />
          <div className="space-y-2 text-center">
            <p className="text-lg font-medium">Connecting to services...</p>
            <p className="text-sm text-muted-foreground">
              Please wait a moment.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !instances) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4 p-4 text-center">
          <Icons.logo className="h-12 w-12 text-destructive" />
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-destructive">
              Configuration Error
            </h1>
            <p className="max-w-md text-muted-foreground">
              {error ||
                'An unknown error occurred during Firebase initialization.'}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <FirebaseProvider
      firebaseApp={instances.firebaseApp}
      auth={instances.auth}
      firestore={instances.firestore}
      loading={contextValue.loading}
    >
      {children}
    </FirebaseProvider>
  );
}
