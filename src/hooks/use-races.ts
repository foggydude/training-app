'use client';

import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import type { Race } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export function useRaces() {
  const firestore = useFirestore();
  const { user } = useUser();
  const [races, setRaces] = useState<Race[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !user) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(firestore, 'races'),
      where('userId', '==', user.id)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const racesData = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Race[];
        setRaces(racesData);
        setLoading(false);
      },
      async (err) => {
        console.error('Error fetching races:', err);
        const permissionError = new FirestorePermissionError({
          path: `races where userId == ${user.id}`,
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [firestore, user]);

  return { races, loading };
}
