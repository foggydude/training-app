'use client';

import { doc, setDoc, onSnapshot } from 'firebase/firestore';
import { useState, useEffect, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import type { Integration } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export function useIntegration(userId?: string) {
  const firestore = useFirestore();
  const [integration, setIntegration] = useState<Integration | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !userId) {
      setLoading(false);
      return;
    }
    const docRef = doc(firestore, 'integrations', userId);
    
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (snapshot.exists()) {
        setIntegration({ id: snapshot.id, ...snapshot.data() } as Integration);
      } else {
        setIntegration(null);
      }
      setLoading(false);
    }, async (error) => {
        console.error('Error listening to integration data:', error);
        const permissionError = new FirestorePermissionError({
          path: docRef.path,
          operation: 'get',
        });
        errorEmitter.emit('permission-error', permissionError);
        setLoading(false);
    });

    return () => unsubscribe();
  }, [firestore, userId]);

  const setIntegrationData = useCallback(
    async (data: Partial<Omit<Integration, 'id' | 'userId'>>) => {
      if (!firestore || !userId) {
        throw new Error('Firestore or user not available');
      }
      setLoading(true);
      
      const docRef = doc(firestore, 'integrations', userId);
      
      // Use merge: true to avoid overwriting existing fields
      setDoc(docRef, data, { merge: true })
        .catch(async (serverError) => {
            console.error('Error updating integration data:', serverError);
            const permissionError = new FirestorePermissionError({
              path: docRef.path,
              operation: 'update',
              requestResourceData: data,
            });
            errorEmitter.emit('permission-error', permissionError);
            // Re-throw to allow the UI to handle the failed promise
            throw serverError;
        })
        .finally(() => {
            setLoading(false);
        });

      // Optimistically update local state
      setIntegration(prev => ({
          ...(prev || { id: userId, userId, provider: 'intervalsIcu' }),
          ...data
      } as Integration));

    },
    [firestore, userId]
  );

  return { integration, setIntegration: setIntegrationData, loading };
}
