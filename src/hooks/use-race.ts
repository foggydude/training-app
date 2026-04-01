'use client';

import { doc, onSnapshot } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { useFirestore } from '@/firebase';
import type { Race } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export function useRace(raceId?: string) {
  const firestore = useFirestore();
  const [race, setRace] = useState<Race | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !raceId) {
      setLoading(false);
      return;
    }

    const docRef = doc(firestore, 'races', raceId);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setRace({ id: snapshot.id, ...snapshot.data() } as Race);
        } else {
          setRace(null);
        }
        setLoading(false);
      },
      async (err) => {
        console.error(`Error fetching race ${raceId}:`, err);
        const permissionError = new FirestorePermissionError({
          path: `races/${raceId}`,
          operation: 'get',
        });
        errorEmitter.emit('permission-error', permissionError);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [firestore, raceId]);

  return { race, loading };
}
