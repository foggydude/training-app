'use client';

import {
  collection,
  query,
  where,
  onSnapshot,
  limit,
} from 'firebase/firestore';
import { useState, useEffect } from 'react';
import { useFirestore, useUser } from '@/firebase';
import type { Plan, Week, Workout, Forecast } from '@/lib/types';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

// Helper to sort weeks by date
const sortWeeks = (weeks: Week[]) => [...weeks].sort((a, b) => new Date(a.weekStartDate).getTime() - new Date(b.weekStartDate).getTime());

export function usePlan(raceId?: string) {
  const firestore = useFirestore();
  const { user } = useUser();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!firestore || !user || !raceId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const plansRef = collection(firestore, 'plans');
    const q = query(
      plansRef,
      where('userId', '==', user.id),
      where('raceId', '==', raceId),
      limit(1)
    );
    
    // Main listener for the plan document itself
    const unsubscribePlan = onSnapshot(q, (planSnapshot) => {
        if (planSnapshot.empty) {
          setPlan(null);
          setLoading(false);
          return;
        }

        const planDoc = planSnapshot.docs[0];
        const planData = { id: planDoc.id, ...planDoc.data() } as Omit<Plan, 'weeks' | 'forecasts'>;
        
        setPlan(prevPlan => ({
            ...(prevPlan || planData), // Keep existing subcollection data while new data loads
            ...planData,
        }));

        // Listener for forecasts subcollection
        const forecastsRef = collection(firestore, 'plans', planDoc.id, 'forecasts');
        const unsubscribeForecasts = onSnapshot(forecastsRef, (forecastsSnapshot) => {
            const forecasts = forecastsSnapshot.docs.map(doc => doc.data() as Forecast);
            setPlan(prevPlan => prevPlan ? ({ ...prevPlan, forecasts }) : null);
        });

        // Listener for weeks subcollection
        const weeksRef = collection(firestore, 'plans', planDoc.id, 'weeks');
        const unsubscribeWeeks = onSnapshot(weeksRef, (weeksSnapshot) => {
            const weeks = weeksSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), workouts: [], workoutsLoaded: false } as Week));
            
            // For each week, set up a workout listener
            const workoutUnsubscribers = weeks.map((week, weekIndex) => {
                const workoutsRef = collection(firestore, 'plans', planDoc.id, 'weeks', week.id, 'workouts');
                return onSnapshot(workoutsRef, (workoutsSnapshot) => {
                    const workouts = workoutsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Workout));
                    
                    setPlan(prevPlan => {
                        if (!prevPlan) return null;
                        const newWeeks = [...prevPlan.weeks];
                        // Find the correct week to update by id
                        const targetWeekIndex = newWeeks.findIndex(w => w.id === week.id);
                        
                        if (targetWeekIndex > -1) {
                           newWeeks[targetWeekIndex] = { ...newWeeks[targetWeekIndex], workouts, workoutsLoaded: true };
                        } else {
                           // This can happen if the week listener fires before the plan is set
                           newWeeks.push({ ...week, workouts, workoutsLoaded: true });
                        }

                        return { ...prevPlan, weeks: sortWeeks(newWeeks) };
                    });
                });
            });

            // Set the initial weeks (with empty workouts and workoutsLoaded: false)
            setPlan(prevPlan => prevPlan ? ({ ...prevPlan, weeks: sortWeeks(weeks) }) : null);
            setLoading(false);

            // Return a cleanup function for all workout listeners for this weeks snapshot
            return () => workoutUnsubscribers.forEach(unsub => unsub());
        });

        // Main cleanup for this plan listener
        return () => {
          unsubscribeForecasts();
          unsubscribeWeeks();
        };
      },
      (err) => {
        console.error(`Error fetching plan for race ${raceId}:`, err);
        const permissionError = new FirestorePermissionError({
          path: `plans where raceId == ${raceId}`,
          operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setLoading(false);
      }
    );

    return () => {
      unsubscribePlan();
    };
  }, [firestore, user, raceId]);

  return { plan, loading };
}
