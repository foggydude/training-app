'use server';

import { z } from 'zod';
import { collection, addDoc, doc, getDoc, writeBatch, query, getDocs, updateDoc, setDoc, where, limit, deleteField } from 'firebase/firestore';
import { initializeFirebase } from '@/firebase/server';
import { revalidatePath } from 'next/cache';
import type { Race, Workout, Sport, SyncedActivity, BestEffort, Integration, WorkoutStream, HeartRateZone, FitnessDataPoint, Week, Plan, WorkoutType } from './types';
import { generateInitialPlan as generateInitialPlanFlow } from '@/ai/flows/generate-initial-plan';
import { computeRaceForecast, type ComputeRaceForecastInput } from '@/ai/flows/compute-race-forecast';
import { generateNextWeekAdaptive, type GenerateNextWeekAdaptiveInput } from '@/ai/flows/generate-next-week-adaptive';
import { evaluateWorkoutPerformance } from '@/ai/flows/evaluate-workout-performance';
import { analyzeRacePerformance } from '@/ai/flows/analyze-race-performance';
import { format, addDays, differenceInWeeks, startOfWeek, addWeeks, parseISO, startOfDay, subYears, addYears, isSameDay, endOfWeek, isWithinInterval, subDays } from 'date-fns';
import { buildIntervalsAuthHeader } from '@/lib/intervals-icu';
import Papa from 'papaparse';


/** Parse streams from Intervals.icu - handles both array [{type, data}] and object {time:[], heartrate:[], ...} formats */
function parseStreamData(streamsData: any): { timeStream?: number[]; hrStream?: number[]; paceStream?: number[] } {
  const result: { timeStream?: number[]; hrStream?: number[]; paceStream?: number[] } = {};
  if (!streamsData) return result;

  const getStream = (type: string): number[] | undefined => {
    if (Array.isArray(streamsData)) {
      const item = streamsData.find((s: any) => s?.type === type);
      return Array.isArray(item?.data) ? item.data : undefined;
    }
    if (typeof streamsData === 'object') {
      const val = streamsData[type];
      if (Array.isArray(val)) return val;
      if (val && Array.isArray(val.data)) return val.data;
    }
    return undefined;
  };

  const timeStream = getStream('time');
  const hrStream = getStream('heartrate') ?? getStream('heart_rate');
  const velocityStream = getStream('velocity') ?? getStream('velocity_smooth') ?? getStream('speed');

  if (timeStream) result.timeStream = timeStream;
  if (hrStream) result.hrStream = hrStream;
  if (velocityStream && velocityStream.length > 0) {
    // Velocity may be m/s (Strava) or m/s - convert to pace sec/km: 1000/velocity
    result.paceStream = velocityStream.map((v: number) => (v > 0 ? 1000 / v : 0));
  }
  return result;
}

/** Fetch activity streams from Intervals.icu - returns parsed streams or empty, logs errors */
async function fetchActivityStreams(
  intervalsId: string,
  activityIntervalsId: string,
  fetchHeaders: Record<string, string>
): Promise<{ timeStream?: number[]; hrStream?: number[]; paceStream?: number[] }> {
  const streamsUrl = `https://intervals.icu/api/v1/athlete/${intervalsId}/activity/${activityIntervalsId}/streams?types=time,heartrate,velocity,speed,velocity_smooth`;
  const response = await fetch(streamsUrl, { headers: fetchHeaders, cache: 'no-store' });

  if (!response.ok) {
    const body = await response.text();
    console.warn(`[Intervals.icu streams] Activity ${activityIntervalsId}: ${response.status} ${response.statusText}`, body?.slice(0, 200));
    return {};
  }

  const text = await response.text();
  if (!text?.trim()) return {};

  try {
    const parsed = JSON.parse(text);
    return parseStreamData(parsed);
  } catch (e) {
    console.warn(`[Intervals.icu streams] Failed to parse response for activity ${activityIntervalsId}:`, e);
    return {};
  }
}

/** Downsample streams for AI context (max ~600 points to stay within LLM limits) */
function downsampleStream<T>(arr: T[] | undefined, maxPoints = 600): T[] | undefined {
  if (!arr || arr.length <= maxPoints) return arr;
  const step = Math.ceil(arr.length / maxPoints);
  return arr.filter((_, i) => i % step === 0);
}

function calculateTimeInZones(
  hrStream: number[],
  timeStream: number[],
  zones: HeartRateZone[]
): { zone: string; time: number }[] {
  if (!hrStream || hrStream.length < 2 || !timeStream || timeStream.length < 2 || !zones || zones.length === 0) {
    return [];
  }

  const zoneTimes: { [key: string]: number } = {};
  zones.forEach(z => zoneTimes[z.name] = 0);

  for (let i = 1; i < hrStream.length; i++) {
    // Defend against mismatched array lengths
    if (i >= timeStream.length) break;

    const duration = timeStream[i] - timeStream[i - 1];
    const hr = hrStream[i];

    // Find what zone the current HR falls into
    const currentZone = zones.find(z => hr >= z.min && hr <= z.max);
    if (currentZone) {
      zoneTimes[currentZone.name] += duration;
    }
  }

  return Object.entries(zoneTimes).map(([zone, totalSeconds]) => ({
    zone,
    time: Math.round(totalSeconds / 60) // Return time in minutes
  })).filter(z => z.time > 0); // Only return zones that were actually used
}

const generateInitialPlanSchema = z.object({
  raceId: z.string(),
  additionalPrompt: z.string().optional(),
  model: z.enum(['flash', 'pro']).optional(),
});

export async function generateInitialPlan(
  data: z.infer<typeof generateInitialPlanSchema>
) {
  try {
    const { firestore } = await initializeFirebase();
    const validatedData = generateInitialPlanSchema.parse(data);

    const raceRef = doc(firestore, 'races', validatedData.raceId);
    const raceSnap = await getDoc(raceRef);

    if (!raceSnap.exists()) {
      throw new Error('Race not found');
    }
    const race = { id: raceSnap.id, ...raceSnap.data() } as Race;
    
    // Fetch real performance data from the integration
    const integrationRef = doc(firestore, 'integrations', race.userId);
    const integrationSnap = await getDoc(integrationRef);
    let performanceData: Partial<Integration> = {};
    if (integrationSnap.exists()) {
        const integration = integrationSnap.data() as Integration;
        performanceData = {
            eFTP: integration.eFTP,
            bestEfforts: integration.bestEfforts,
            recentActivities: integration.recentActivities,
        };
    }

    const raceDate = new Date(race.date);
    // Start plan from the beginning of the current week
    const planStartDate = startOfWeek(new Date(), { weekStartsOn: 1 });
    const planEndDate = raceDate;

    // Call Genkit flow
    const planOutput = await generateInitialPlanFlow({
      race: race,
      startDate: planStartDate.toISOString(),
      endDate: planEndDate.toISOString(),
      additionalPrompt: validatedData.additionalPrompt,
      performanceData: performanceData,
      model: validatedData.model,
    });

    // Create plan document
    const planRef = await addDoc(collection(firestore, 'plans'), {
      userId: race.userId,
      raceId: race.id,
      startDate: format(planStartDate, 'yyyy-MM-dd'),
      endDate: format(planEndDate, 'yyyy-MM-dd'),
      createdAt: new Date().getTime(),
      status: 'active',
      trainingPhilosophy: planOutput.trainingPhilosophy,
      kpis: planOutput.kpis,
    });

    // Create week and workout sub-collections in a batch
    const batch = writeBatch(firestore);

    // Only generate weeks from the start date forward
    const weeksToGenerate = planOutput.weeks.filter(week => 
        parseISO(week.weekStartDate) >= startOfWeek(new Date(), { weekStartsOn: 1 })
    );

    for (const week of weeksToGenerate) {
      const weekRef = doc(collection(planRef, 'weeks'));
      batch.set(weekRef, {
        planId: planRef.id,
        userId: race.userId,
        weekStartDate: week.weekStartDate,
      });

      for (const workout of week.workouts) {
        const workoutRef = doc(collection(weekRef, 'workouts'));
        batch.set(workoutRef, {
          ...workout,
          userId: race.userId,
          weekId: weekRef.id,
          planId: planRef.id,
          source: 'planned',
        });
      }
    }
    
    // --- Generate initial forecast ---
    const initialForecastInput: ComputeRaceForecastInput = {
        recentTempoRuns: [],
        longRunReadiness: 0.5,
        trainingConsistency: 0.7,
        goalTimeSec: race.goalTimeSec,
    };
    
    if (performanceData.recentActivities && performanceData.recentActivities.length > 0) {
        const tempoRuns = performanceData.recentActivities
        .filter(a => a.type === 'run' && a.averageSpeedKmh && a.durationMin > 15)
        .slice(0, 5) // Use last 5 relevant runs
        .map(a => ({
            date: a.date,
            durationMin: a.durationMin,
            averagePaceSecPerKm: 3600 / a.averageSpeedKmh!,
        }));
        
        if (tempoRuns.length > 0) {
            initialForecastInput.recentTempoRuns = tempoRuns;
        }
    }
    
    // If no real tempo runs found after checking, add a placeholder to avoid empty array for the model
    if (initialForecastInput.recentTempoRuns.length === 0) {
        initialForecastInput.recentTempoRuns.push(
             { date: format(new Date(), 'yyyy-MM-dd'), durationMin: 20, averagePaceSecPerKm: 330 } // Placeholder 5:30/km
        );
    }

    const initialForecast = await computeRaceForecast(initialForecastInput);

    const forecastRef = doc(collection(planRef, 'forecasts'));
    batch.set(forecastRef, {
      date: format(planStartDate, 'yyyy-MM-dd'),
      predictedResultSec: initialForecast.predictedResultSec,
      type: 'actual',
    });
    
    // --- Generate projected forecast points ---
    const startPrediction = initialForecast.predictedResultSec;
    const endPrediction = race.goalTimeSec || startPrediction;
    const totalWeeks = differenceInWeeks(planEndDate, planStartDate);
    const weeklyImprovement = totalWeeks > 0 ? (startPrediction - endPrediction) / totalWeeks : 0;

    for (let i = 0; i <= totalWeeks; i++) {
        const weekDate = addWeeks(planStartDate, i);
        const weeklyPrediction = startPrediction - (weeklyImprovement * i);
        
        const projectedPointRef = doc(collection(planRef, 'forecasts'));
        batch.set(projectedPointRef, {
            date: format(weekDate, 'yyyy-MM-dd'),
            predictedResultSec: weeklyPrediction,
            type: 'projected',
        });
    }

    await batch.commit();

    revalidatePath(`/plan/${validatedData.raceId}`);
    return { success: true, message: 'Initial plan generated successfully!' };
  } catch (error) {
    console.error('Error generating initial plan:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { success: false, message };
  }
}

const generateNextWeekSchema = z.object({
  planId: z.string(),
});

// Helper function to cleanse and normalize workout data for AI flows
const cleanWorkoutsForAI = (workouts: Workout[]): Workout[] => {
  return workouts.map(w => {
    const cleanedWorkout: Workout = {
      id: w.id,
      date: w.date,
      sport: mapIntervalsSport(w.sport), // Standardize sport
      type: normalizeWorkoutType(w.type, mapIntervalsSport(w.sport)), // Standardize type
      durationMin: w.durationMin,
      distanceKm: w.distanceKm,
      title: w.title,
      description: w.description,
      status: w.status,
      goal: w.goal,
      performance: w.performance,
      steps: w.steps || [],
      userId: w.userId,
      weekId: w.weekId,
      planId: w.planId,
      source: w.source,
    };
    
    // Remove undefined fields, which AI schema might reject
    Object.keys(cleanedWorkout).forEach(key => {
      const typedKey = key as keyof Workout;
      if (cleanedWorkout[typedKey] === undefined) {
        delete cleanedWorkout[typedKey];
      }
    });

    return cleanedWorkout;
  });
};


export async function generateNextWeek(
  data: z.infer<typeof generateNextWeekSchema>
) {
  try {
    const { firestore } = await initializeFirebase();
    const { planId } = generateNextWeekSchema.parse(data);

    const planRef = doc(firestore, 'plans', planId);
    const planSnap = await getDoc(planRef);
    if (!planSnap.exists()) throw new Error('Plan not found');
    const plan = { id: planSnap.id, ...planSnap.data() } as Plan;

    const raceRef = doc(firestore, 'races', plan.raceId);
    const raceSnap = await getDoc(raceRef);
    if (!raceSnap.exists()) throw new Error('Race not found');
    const raceData = raceSnap.data() as Race;

    // Find the week to be planned for (the week starting next Monday)
    const nextWeekStartDate = addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1);
    
    const weeksColRef = collection(planRef, 'weeks');
    
    // Find the Firestore document for the "next" week
    const nextWeekQuery = query(weeksColRef, where('weekStartDate', '==', format(nextWeekStartDate, 'yyyy-MM-dd')), limit(1));
    const nextWeekSnapshot = await getDocs(nextWeekQuery);
    const nextWeekDoc = nextWeekSnapshot.docs[0];
    if (!nextWeekDoc) {
      throw new Error('This is the last week of the plan, or there is no plan for the upcoming week.');
    }

    // Now, find the previous week RELATIVE to the week we are planning (which is the current week)
    const previousWeekStartDate = subDays(parseISO(nextWeekDoc.data().weekStartDate), 7);
    const previousWeekQuery = query(weeksColRef, where('weekStartDate', '==', format(previousWeekStartDate, 'yyyy-MM-dd')), limit(1));
    const previousWeekSnapshot = await getDocs(previousWeekQuery);
    
    const previousWeekDoc = previousWeekSnapshot.docs[0];
    if (!previousWeekDoc) {
      return { success: false, message: "Cannot generate compliance as the prior week could not be found in this plan." };
    }
    
    // Fetch workouts for previous and next weeks
    const [previousWeekWorkoutsSnap, nextWeekWorkoutsSnap] = await Promise.all([
      getDocs(collection(previousWeekDoc.ref, 'workouts')),
      getDocs(collection(nextWeekDoc.ref, 'workouts'))
    ]);

    const previousWeekWorkouts = previousWeekWorkoutsSnap.docs.map(d => ({id: d.id, ...d.data()})) as Workout[];
    const nextWeekWorkouts = nextWeekWorkoutsSnap.docs.map(d => ({id: d.id, ...d.data()})) as Workout[];

    const batch = writeBatch(firestore);

    const plannedWorkouts = previousWeekWorkouts.filter(workout => workout.source === 'planned');
    const completedWorkouts = previousWeekWorkouts.filter(workout => workout.source === 'intervalsIcu');
    
    let totalPlannedMinutes = 0;
    let totalCompletedMinutes = 0;
    
    const mergedPreviousWeekWorkouts: Workout[] = [];

    // Process planned workouts to calculate compliance and check for completion
    for (const pWorkout of plannedWorkouts) {
        totalPlannedMinutes += pWorkout.durationMin || 0;

        const linkedCompletedWorkout = completedWorkouts.find(c => c.plannedWorkoutId === pWorkout.id);
        
        if (linkedCompletedWorkout) {
             totalCompletedMinutes += linkedCompletedWorkout.durationMin || 0;
             mergedPreviousWeekWorkouts.push({
                 ...pWorkout,
                 status: 'completed',
                 performance: linkedCompletedWorkout.performance || pWorkout.performance,
                 durationMin: linkedCompletedWorkout.durationMin,
                 distanceKm: linkedCompletedWorkout.distanceKm,
             });
        } else {
            mergedPreviousWeekWorkouts.push(pWorkout);
             if (pWorkout.status === 'completed' && pWorkout.source !== 'intervalsIcu') {
                // Count self-marked completed workouts
                totalCompletedMinutes += pWorkout.durationMin || 0;
            }
        }
    }
    
    // Add completed workouts that weren't linked to any planned workout
    const unlinkedCompletedWorkouts = completedWorkouts.filter(c => !c.plannedWorkoutId);
    for (const uWorkout of unlinkedCompletedWorkouts) {
        totalCompletedMinutes += uWorkout.durationMin || 0; // Add to actual load, not planned
        mergedPreviousWeekWorkouts.push(uWorkout);
    }
    
    const complianceScore = totalPlannedMinutes > 0 ? (totalCompletedMinutes / totalPlannedMinutes) : 0;
    
    const kpis = plan.kpis || {};
    
    const flowInput: GenerateNextWeekAdaptiveInput = {
      previousWeek: {
        weekStartDate: previousWeekDoc.data().weekStartDate,
        workouts: cleanWorkoutsForAI(mergedPreviousWeekWorkouts),
      },
      nextWeekPlan: {
        weekStartDate: nextWeekDoc.data().weekStartDate,
        workouts: cleanWorkoutsForAI(nextWeekWorkouts),
      },
      raceGoal: {
        distanceKm: raceData.distanceKm,
        goalTimeSec: raceData.goalTimeSec,
      },
      currentFitness: {
        vo2max: typeof kpis.vo2max?.value === 'number' ? kpis.vo2max.value : undefined,
        z2Pace: typeof kpis.z2Pace?.value === 'string' ? kpis.z2Pace.value : undefined,
      }
    };
    
    // Call the adaptive flow
    const result = await generateNextWeekAdaptive(flowInput);
    
    // 1. Update the previous week with the compliance summary
    batch.update(previousWeekDoc.ref, {
      weeklyCompliance: result.weeklyCompliance,
      summary: {
        plannedLoad: totalPlannedMinutes,
        completedLoad: totalCompletedMinutes,
        complianceScore,
      },
    });

    // 2. Update the next week's workouts (Upsert/Delete)
    // CRITICAL: Filter to only include original IDs from nextWeekWorkouts to prevent accidental insertions of "Adjusted" history
    const originalNextWeekIds = new Set(nextWeekWorkouts.map(w => w.id));
    const adaptedWorkoutIds = new Set(result.adaptedNextWeekWorkouts.map(w => w.id));

    // Upsert adapted workouts only if they were part of the original plan
    for (const adaptedWorkout of result.adaptedNextWeekWorkouts) {
        if (!originalNextWeekIds.has(adaptedWorkout.id)) continue;
        
        const workoutRef = doc(nextWeekDoc.ref, 'workouts', adaptedWorkout.id);
        const { performance, ...updateData } = adaptedWorkout; // Strip performance field
        batch.set(workoutRef, {
            ...updateData,
            userId: plan.userId,
            weekId: nextWeekDoc.id,
            planId: planId,
            source: 'planned',
        }, { merge: true });
    }

    // Delete only PLANNED workouts that are no longer in the adapted plan.
    for (const originalWorkout of nextWeekWorkouts) {
        if (originalWorkout.source === 'intervalsIcu') continue; // Preserve completed workouts
        if (!adaptedWorkoutIds.has(originalWorkout.id)) {
            const workoutToDeleteRef = doc(nextWeekDoc.ref, 'workouts', originalWorkout.id);
            batch.delete(workoutToDeleteRef);
        }
    }
    
    // 3. Add new forecast data point
    const forecastRef = doc(collection(planRef, 'forecasts'));
    batch.set(forecastRef, {
        date: format(nextWeekStartDate, 'yyyy-MM-dd'),
        predictedResultSec: result.updatedForecast.predictedResultSec,
        type: 'actual',
        explanation: result.updatedForecast.explanation,
        confidence: result.updatedForecast.confidence,
    });

    batch.update(planRef, {
      kpis: result.updatedKpis,
    });
    
    await batch.commit();

    revalidatePath(`/plan/${plan.raceId}`);
    return { success: true, message: result.adaptationSummary };
  } catch(error) {
      console.error('Error generating next week:', error);
      const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
      return { success: false, message };
  }
}

const syncDetailedActivitiesSchema = z.object({
  planId: z.string(),
  raceId: z.string(),
});

function mapIntervalsSport(type?: string): Sport {
    const lowerType = type?.toLowerCase() || 'other';

    switch (lowerType) {
        case 'run':
            return 'run';
        case 'ride':
        case 'virtualride':
            return 'bike';
        case 'weight training':
            return 'strength';
        case 'swim':
        case 'hike':
        case 'walk':
        case 'rowing':
        case 'openwaterswim':
        case 'other':
        case 'yoga':
            return 'other';
        default:
            return 'other';
    }
}

const allowedWorkoutTypes: WorkoutType[] = [
  'easy',
  'long',
  'tempo',
  'intervals',
  'hills',
  'recovery',
  'strength',
  'mobility',
  'race',
];

function normalizeWorkoutType(type: string | undefined, sport: Sport): WorkoutType {
  const lowered = type?.toLowerCase();
  if (lowered && allowedWorkoutTypes.includes(lowered as WorkoutType)) {
    return lowered as WorkoutType;
  }

  if (sport === 'strength') {
    return 'strength';
  }

  if (lowered?.includes('mobility') || lowered?.includes('yoga')) {
    return 'mobility';
  }

  if (lowered?.includes('interval')) {
    return 'intervals';
  }

  if (lowered?.includes('tempo')) {
    return 'tempo';
  }

  if (lowered?.includes('hill')) {
    return 'hills';
  }

  if (lowered?.includes('long')) {
    return 'long';
  }

  if (lowered?.includes('recovery')) {
    return 'recovery';
  }

  if (lowered?.includes('race')) {
    return 'race';
  }

  return 'easy';
}

function getActivityWorkoutType(activity: any, sport: Sport): WorkoutType {
  const rawType = activity?.workoutType || activity?.workout_type || activity?.type || activity?.category;
  let type = normalizeWorkoutType(typeof rawType === 'string' ? rawType : undefined, sport);
  if (type !== 'race' && activity?.title) {
    const title = (activity.title as string).toLowerCase();
    if (title.includes('marathon') || title.includes('half marathon') ||
        /\b(rotterdam|amsterdam|berlin|boston|london|new york|paris)\b/.test(title)) {
      type = 'race';
    }
  }
  return type;
}

export async function syncDetailedActivities(data: z.infer<typeof syncDetailedActivitiesSchema>) {
  try {
    const { firestore } = await initializeFirebase();
    const { planId, raceId } = syncDetailedActivitiesSchema.parse(data);

    const planRef = doc(firestore, 'plans', planId);
    const planSnap = await getDoc(planRef);
    if (!planSnap.exists()) throw new Error('Plan not found.');
    
    const plan = planSnap.data() as Omit<Plan, 'weeks' | 'forecasts'>;
    const integrationSnap = await getDoc(doc(firestore, 'integrations', plan.userId));
    if (!integrationSnap.exists() || !integrationSnap.data().apiKey || !integrationSnap.data().intervalsId) {
      return { success: false, message: 'Intervals.icu integration not configured.' };
    }
    const integrationData = integrationSnap.data() as Integration;
    const { apiKey, intervalsId, heartRateZones } = integrationData;

    const authHeader = buildIntervalsAuthHeader(apiKey);
    const fetchHeaders = { 'Authorization': authHeader, 'User-Agent': 'FirebaseStudio/1.0' };

    const allWorkoutsInPlan: Workout[] = [];
    const weeksRef = collection(planRef, 'weeks');
    const weeksSnapshot = await getDocs(weeksRef);
    
    for (const weekDoc of weeksSnapshot.docs) {
        const workoutsRef = collection(weekDoc.ref, 'workouts');
        const workoutsSnapshot = await getDocs(workoutsRef);
        workoutsSnapshot.forEach(workoutDoc => {
            allWorkoutsInPlan.push({ id: workoutDoc.id, weekId: weekDoc.id, planId, ...workoutDoc.data() } as Workout);
        });
    }

    const completedActivitiesFromIntegration = integrationData.recentActivities || [];
    if (completedActivitiesFromIntegration.length === 0) {
      return { success: true, message: "No recent activities found in your synced history. Please sync in settings first." };
    }

    const batch = writeBatch(firestore);
    let activitiesProcessedCount = 0;
    let activitiesUpdatedCount = 0;
    
    const existingWorkoutsByIntervalsId = new Map<string, Workout>(
        allWorkoutsInPlan
            .filter(w => w.intervalsActivityId)
            .map(w => [w.intervalsActivityId!, w])
    );
    const linkedPlannedWorkoutIds = new Set<string>(allWorkoutsInPlan.map(w => w.plannedWorkoutId).filter(Boolean));

    for (const cActivity of completedActivitiesFromIntegration) {
      const activityIntervalsId = cActivity.intervalsId;
      if (!activityIntervalsId) continue;
      
      const activityDate = parseISO(cActivity.date);
      if (activityDate < parseISO(plan.startDate) || activityDate > parseISO(plan.endDate)) {
          continue;
      }

      const activityDistanceKm = cActivity.distanceKm;
      const activitySport = mapIntervalsSport(cActivity.type);
      const activityType = getActivityWorkoutType(cActivity, activitySport);

      let pWorkout: Workout | null = null;
      
      const weekForActivity = weeksSnapshot.docs.find(weekDoc => {
        const weekStart = parseISO(weekDoc.data().weekStartDate);
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        return isWithinInterval(activityDate, { start: weekStart, end: weekEnd });
      });

      if (weekForActivity) {
          const potentialMatches = allWorkoutsInPlan.filter(w =>
              w.weekId === weekForActivity.id
              && w.source === 'planned'
              && w.sport === activitySport
              && !linkedPlannedWorkoutIds.has(w.id)
          );

          if (potentialMatches.length > 0) {
              let bestMatch: Workout | null = null;
              let bestScore = -1;

              for (const potentialPWorkout of potentialMatches) {
                  let score = 0;
                  if (isSameDay(parseISO(potentialPWorkout.date), activityDate)) score += 100;
                  if (potentialPWorkout.type === activityType) score += 50;
                  if (potentialPWorkout.distanceKm && activityDistanceKm) {
                      const diff = Math.abs(potentialPWorkout.distanceKm - activityDistanceKm);
                      const tolerance = Math.max(0.5, potentialPWorkout.distanceKm * 0.1);
                      if (diff <= tolerance) score += 30;
                      else score += Math.max(0, 20 * (1 - (diff / potentialPWorkout.distanceKm)));
                  }
                  if (potentialPWorkout.durationMin && cActivity.durationMin) {
                      const diff = Math.abs(potentialPWorkout.durationMin - cActivity.durationMin);
                      const tolerance = Math.max(5, potentialPWorkout.durationMin * 0.15);
                      if (diff <= tolerance) score += 20;
                      else score += Math.max(0, 15 * (1 - (diff / potentialPWorkout.durationMin)));
                  }
                  if (score > bestScore) {
                      bestScore = score;
                      bestMatch = potentialPWorkout;
                  }
              }
              if (bestMatch && bestScore > 50) pWorkout = bestMatch;
          }
      }

      let performanceResult: { status: 'below' | 'as_expected' | 'above'; justification: string; } | undefined = undefined;
      let timeInZones: { zone: string; time: number; }[] = [];
      
      if (pWorkout?.goal) {
        const { timeStream, hrStream, paceStream } = await fetchActivityStreams(
          intervalsId, activityIntervalsId, fetchHeaders
        );
        if (heartRateZones && hrStream && timeStream) timeInZones = calculateTimeInZones(hrStream, timeStream, heartRateZones);
        const evalInput = {
          goal: pWorkout.goal,
          plannedWorkoutType: pWorkout.type,
          plannedSteps: pWorkout.steps,
          completedActivity: {
            durationMin: cActivity.durationMin,
            distanceKm: cActivity.distanceKm,
            averagePaceSecPerKm: cActivity.averageSpeedKmh && cActivity.averageSpeedKmh > 0 ? Math.round(3600 / cActivity.averageSpeedKmh) : undefined,
            averageHr: cActivity.averageHr,
            timeStream: downsampleStream(timeStream),
            heartrateStream: downsampleStream(hrStream), // Fix field name based on schema
            paceStream: downsampleStream(paceStream),
          },
        };
        try {
          const evaluation = await evaluateWorkoutPerformance(evalInput);
          performanceResult = { status: evaluation.status, justification: evaluation.justification };
        } catch(e) {
          console.error("Error evaluating workout performance", e);
        }
      }
      
      const completedData: { [key: string]: any } = {
        title: cActivity.title || 'Untitled Activity',
        description: `Completed: ${cActivity.title}`,
        status: 'completed',
        source: 'intervalsIcu',
        intervalsActivityId: activityIntervalsId,
        durationMin: cActivity.durationMin,
        distanceKm: activityDistanceKm,
        performance: performanceResult?.status,
        performanceJustification: performanceResult?.justification,
        timeInZones,
        averageHr: cActivity.averageHr,
        sport: activitySport,
        type: activityType,
        steps: pWorkout?.steps ?? [],
      };
      
      if (pWorkout) {
          completedData.plannedWorkoutId = pWorkout.id;
          completedData.plannedWeekId = pWorkout.weekId;
          linkedPlannedWorkoutIds.add(pWorkout.id);
      }

      const weekForActivityRef = weeksSnapshot.docs.find(weekDoc => {
        const weekStart = parseISO(weekDoc.data().weekStartDate);
        const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
        return isWithinInterval(activityDate, { start: weekStart, end: weekEnd });
      });

      if (!weekForActivityRef) continue;
      
      const existingWorkout = existingWorkoutsByIntervalsId.get(activityIntervalsId);
      const finalWorkoutData: { [key: string]: any } = {
        ...completedData,
        userId: plan.userId,
        weekId: weekForActivityRef.id,
        planId: planId,
        date: format(activityDate, 'yyyy-MM-dd'),
      };
      
      Object.keys(finalWorkoutData).forEach(key => {
        const value = finalWorkoutData[key];
        if (value === undefined || value === null || (typeof value === 'number' && Number.isNaN(value)) || value === '') {
          delete finalWorkoutData[key];
        }
      });
        
      if (existingWorkout) {
        const workoutRef = doc(firestore, 'plans', planId, 'weeks', existingWorkout.weekId, 'workouts', existingWorkout.id);
        batch.set(workoutRef, finalWorkoutData, { merge: true });
        activitiesUpdatedCount++;
      } else {
        const newWorkoutRef = doc(collection(weekForActivityRef.ref, 'workouts'));
        batch.set(newWorkoutRef, finalWorkoutData);
        activitiesProcessedCount++;
      }
    }
    
    let message = 'Sync complete. No new activities found for this plan.';
    if (activitiesProcessedCount > 0 || activitiesUpdatedCount > 0) {
        message = `Sync complete. Added ${activitiesProcessedCount} new activities and re-analyzed ${activitiesUpdatedCount} existing activities.`;
    }
    await batch.commit();
    revalidatePath(`/plan/${raceId}`);
    return { success: true, message };
  } catch (error) {
    console.error('Error syncing detailed activities:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { success: false, message };
  }
}

const analyzeRacePerformanceSchema = z.object({
  planId: z.string(),
  workoutId: z.string(),
  weekId: z.string(),
});

export async function analyzeRacePerformanceAction(
  data: z.infer<typeof analyzeRacePerformanceSchema>
) {
  try {
    const { firestore } = await initializeFirebase();
    const { planId, workoutId, weekId } = analyzeRacePerformanceSchema.parse(data);
    const planSnap = await getDoc(doc(firestore, 'plans', planId));
    if (!planSnap.exists()) throw new Error('Plan not found.');
    const plan = { id: planSnap.id, ...planSnap.data() } as Plan;
    const raceSnap = await getDoc(doc(firestore, 'races', plan.raceId));
    if (!raceSnap.exists()) throw new Error('Main goal race not found.');
    const mainGoalRace = { id: raceSnap.id, ...raceSnap.data() } as Race;
    const workoutRef = doc(firestore, 'plans', planId, 'weeks', weekId, 'workouts', workoutId);
    const workoutSnap = await getDoc(workoutRef);
    if (!workoutSnap.exists()) throw new Error('Completed race workout not found in plan.');
    const completedRace = { id: workoutSnap.id, ...workoutSnap.data()} as Workout;
    const weeksRef = collection(firestore, 'plans', planId, 'weeks');
    const weeksSnapshot = await getDocs(weeksRef);
    const recentWeeksData: Week[] = [];
    for (const weekDoc of weeksSnapshot.docs) {
        if (parseISO(weekDoc.data().weekStartDate) < parseISO(completedRace.date)) {
            const workoutsSnap = await getDocs(collection(weekDoc.ref, 'workouts'));
            const workouts = workoutsSnap.docs.map(d => d.data() as Workout);
            recentWeeksData.push({ id: weekDoc.id, ...weekDoc.data(), workouts } as Week);
        }
    }
    const recentWeeks = recentWeeksData.sort((a,b) => parseISO(b.weekStartDate).getTime() - parseISO(a.weekStartDate).getTime()).slice(0, 4);
    let totalPlanned = 0;
    let totalCompleted = 0;
    for (const week of recentWeeks) {
      week.workouts.forEach(workout => {
        if(workout.source !== 'intervalsIcu' || workout.status === 'planned') totalPlanned++;
        if(workout.status === 'completed') totalCompleted++;
      });
    }
    const trainingConsistency = totalPlanned > 0 ? totalCompleted / totalPlanned : 0;
    const analysis = await analyzeRacePerformance({ completedRace, mainGoalRace, trainingConsistency });
    return { success: true, analysis };
  } catch (error) {
    console.error('Error analyzing race performance:', error);
    const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
    return { success: false, message };
  }
}

const reevaluateWorkoutPerformanceSchema = z.object({
  planId: z.string(),
  weekId: z.string(),
  workoutId: z.string(),
});

export async function reevaluateWorkoutPerformance(data: z.infer<typeof reevaluateWorkoutPerformanceSchema>) {
    try {
        const { firestore } = await initializeFirebase();
        const { planId, weekId, workoutId } = reevaluateWorkoutPerformanceSchema.parse(data);
        const workoutRef = doc(firestore, 'plans', planId, 'weeks', weekId, 'workouts', workoutId);
        const workoutSnap = await getDoc(workoutRef);
        if (!workoutSnap.exists()) throw new Error('Workout not found.');
        const workout = { id: workoutSnap.id, ...workoutSnap.data() } as Workout;
        if (workout.source !== 'intervalsIcu' || !workout.intervalsActivityId) throw new Error('Detailed data not available.');
        let goal = workout.goal;
        let plannedWorkoutType = workout.type;
        let plannedSteps = workout.steps;
        if (!goal && workout.plannedWorkoutId && workout.plannedWeekId) {
            const pWorkoutRef = doc(firestore, 'plans', planId, 'weeks', workout.plannedWeekId, 'workouts', workout.plannedWorkoutId);
            const pWorkoutSnap = await getDoc(pWorkoutRef);
            if (pWorkoutSnap.exists()) {
                 const p = pWorkoutSnap.data() as Workout;
                 goal = p.goal;
                 plannedWorkoutType = p.type;
                 plannedSteps = p.steps;
            }
        }
        if (!goal) goal = workout.description || workout.title;
        const planSnap = await getDoc(doc(firestore, 'plans', planId));
        const plan = planSnap.data() as Plan;
        const integrationSnap = await getDoc(doc(firestore, 'integrations', plan.userId));
        const integration = integrationSnap.data() as Integration;
        const { apiKey, intervalsId, heartRateZones } = integration;
        const authHeader = buildIntervalsAuthHeader(apiKey);
        const { timeStream, hrStream, paceStream } = await fetchActivityStreams(intervalsId, workout.intervalsActivityId!, { 'Authorization': authHeader, 'User-Agent': 'FirebaseStudio/1.0' });
        const evaluation = await evaluateWorkoutPerformance({
          goal: goal!,
          plannedWorkoutType,
          plannedSteps,
          completedActivity: {
            durationMin: workout.durationMin,
            distanceKm: workout.distanceKm,
            averagePaceSecPerKm: workout.durationMin && workout.distanceKm ? Math.round((workout.durationMin*60)/workout.distanceKm) : undefined,
            averageHr: workout.averageHr,
            timeStream: downsampleStream(timeStream),
            heartrateStream: downsampleStream(hrStream), // Correct schema mapping
            paceStream: downsampleStream(paceStream),
          },
        });
        const timeInZones = heartRateZones && hrStream && timeStream ? calculateTimeInZones(hrStream, timeStream, heartRateZones) : [];
        await updateDoc(workoutRef, { performance: evaluation.status, performanceJustification: evaluation.justification, timeInZones });
        const updated = await getDoc(workoutRef);
        revalidatePath(`/plan/${plan.raceId}`);
        return { success: true, message: `Performance: ${evaluation.status}`, updatedWorkout: { id: updated.id, ...updated.data() } as Workout };
    } catch (error) {
        console.error('Error re-evaluating workout:', error);
        return { success: false, message: error instanceof Error ? error.message : 'Unexpected error.' };
    }
}


const daysOfWeek = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] as const;
const raceFormSchema = z.object({
  name: z.string().min(2),
  sport: z.enum(['run', 'bike', 'multi']),
  date: z.date(),
  distanceKm: z.coerce.number().positive(),
  goalTime: z.string().optional(),
  notes: z.string().optional(),
  runsPerWeek: z.coerce.number().int().min(0).max(7),
  bikesPerWeek: z.coerce.number().int().min(0).max(7),
  strengthPerWeek: z.coerce.number().int().min(0).max(7),
  maxWeekdayDurationMin: z.coerce.number().int().positive(),
  longRunDay: z.enum(daysOfWeek),
  preferredDays: z.array(z.enum(daysOfWeek)).optional(),
  userId: z.string(),
});

function timeToSeconds(time: string): number {
    const parts = time.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

export async function createRace(data: z.infer<typeof raceFormSchema>) {
  try {
    const { firestore } = await initializeFirebase();
    const v = raceFormSchema.parse(data);
    const raceData: any = {
      userId: v.userId, name: v.name, sport: v.sport,
      date: v.date.toISOString().split('T')[0],
      distanceKm: v.distanceKm, notes: v.notes,
      constraints: {
        runsPerWeek: v.runsPerWeek, bikesPerWeek: v.bikesPerWeek,
        strengthPerWeek: v.strengthPerWeek, maxWeekdayDurationMin: v.maxWeekdayDurationMin,
        longRunDay: v.longRunDay, preferredDays: v.preferredDays,
      },
      createdAt: new Date().getTime(),
    };
    if (v.goalTime) raceData.goalTimeSec = timeToSeconds(v.goalTime);
    await addDoc(collection(firestore, 'races'), raceData);
    revalidatePath('/');
    return { success: true, message: 'Race created!' };
  } catch (error) {
    console.error('Error creating race:', error);
    return { success: false, message: 'Unexpected error.' };
  }
}

const resetPlanSchema = z.object({ planId: z.string(), raceId: z.string() });
export async function resetPlan(data: z.infer<typeof resetPlanSchema>) {
    try {
        const { firestore } = await initializeFirebase();
        const { planId, raceId } = resetPlanSchema.parse(data);
        const batch = writeBatch(firestore);
        const planRef = doc(firestore, 'plans', planId);
        for (const sub of ['weeks', 'forecasts']) {
            const snap = await getDocs(collection(planRef, sub));
            for (const d of snap.docs) {
                 if (sub === 'weeks') {
                    const ws = await getDocs(collection(d.ref, 'workouts'));
                    ws.forEach(w => batch.delete(w.ref));
                 }
                batch.delete(d.ref);
            }
        }
        batch.delete(planRef);
        await batch.commit();
        revalidatePath(`/plan/${raceId}`);
        return { success: true, message: 'Plan reset.' };
    } catch (error) {
        console.error('Error resetting plan:', error);
        return { success: false, message: 'Error resetting plan.' };
    }
}

const updateWorkoutSchema = z.object({ planId: z.string(), weekId: z.string(), workoutId: z.string(), workoutData: z.any() });
export async function updateWorkout(data: z.infer<typeof updateWorkoutSchema>) {
  try {
    const { firestore } = await initializeFirebase();
    const { planId, weekId, workoutId, workoutData } = updateWorkoutSchema.parse(data);
    await updateDoc(doc(firestore, 'plans', planId, 'weeks', weekId, 'workouts', workoutId), workoutData);
    revalidatePath(`/plan/${workoutData.raceId}`);
    return { success: true, message: 'Workout updated!' };
  } catch (error) {
    console.error('Error updating workout:', error);
    return { success: false, message: 'Error updating workout.' };
  }
}

const verifyIntervalsIcuSchema = z.object({ apiKey: z.string(), intervalsId: z.string() });
export async function verifyIntervalsIcu(data: z.infer<typeof verifyIntervalsIcuSchema>) {
    try {
        const { apiKey, intervalsId } = verifyIntervalsIcuSchema.parse(data);
        const r = await fetch(`https://intervals.icu/api/v1/athlete/${intervalsId}/profile`, {
            headers: { 'Authorization': buildIntervalsAuthHeader(apiKey), 'User-Agent': 'FirebaseStudio/1.0' },
            cache: 'no-store'
        });
        if (r.ok) {
             const d = await r.json();
             return { success: true, message: `Connected for ${d.firstname}!` };
        }
        return { success: false, message: 'Connection failed.' };
    } catch (error) {
        console.error('Error verifying Intervals.icu connection:', error);
        return { success: false, message: 'Request failed.' };
    }
}

const importIntervalsHistorySchema = z.object({ userId: z.string() });
export async function importIntervalsHistory(data: z.infer<typeof importIntervalsHistorySchema>) {
    try {
        const { firestore } = await initializeFirebase();
        const { userId } = importIntervalsHistorySchema.parse(data);
        const integrationRef = doc(firestore, 'integrations', userId);
        const integrationSnap = await getDoc(integrationRef);
        const integration = integrationSnap.data() as Integration;
        const { apiKey, intervalsId } = integration;
        const today = format(new Date(), 'yyyy-MM-dd');
        const oneYearAgo = format(subYears(new Date(), 1), 'yyyy-MM-dd');
        const auth = buildIntervalsAuthHeader(apiKey);
        const r = await fetch(`https://intervals.icu/api/v1/athlete/${intervalsId}/activities?oldest=${oneYearAgo}&newest=${today}`, {
            headers: { 'Authorization': auth, 'User-Agent': 'FirebaseStudio/1.0' },
            cache: 'no-store',
        });
        const rawJson = await r.json();
        const recentActivities: SyncedActivity[] = rawJson.map((a: any) => {
            const na: any = { intervalsId: a.id.toString(), date: a.start_date_local.split('T')[0], title: a.name, type: mapIntervalsSport(a.type), workoutType: a.workout_type || a.workoutType, durationMin: Math.round(a.moving_time / 60), status: 'Completed' };
            if (a.distance != null) na.distanceKm = parseFloat((a.distance / 1000).toFixed(2));
            if (a.average_heartrate != null) na.averageHr = a.average_heartrate;
            if (a.average_speed != null) na.averageSpeedKmh = parseFloat((a.average_speed * 3.6).toFixed(2));
            if (a.total_elevation_gain != null) na.elevationGain = a.total_elevation_gain;
            const fa: any = {};
            Object.keys(na).forEach(k => { if (na[k] != null) fa[k] = na[k]; });
            return fa;
        }).filter((a: any) => a.durationMin > 1);
        const pr = await fetch(`https://intervals.icu/api/v1/athlete/${intervalsId}/profile`, { headers: { 'Authorization': auth, 'User-Agent': 'FirebaseStudio/1.0' }, cache: 'no-store' });
        let hrz: HeartRateZone[] = [];
        let eftp: number | undefined;
        if (pr.ok) {
            const pd = await pr.json();
            if (pd.runZones?.heartrate?.zones) hrz = pd.runZones.heartrate.zones.map((z: any, i: number) => ({ name: `Z${i+1}`, min: z.range[0], max: z.range[1] }));
            if (pd.eftp) eftp = pd.eftp;
        }
        const wr = await fetch(`https://intervals.icu/api/v1/athlete/${intervalsId}/wellness?oldest=${oneYearAgo}&newest=${today}`, { headers: { 'Authorization': auth, 'User-Agent': 'FirebaseStudio/1.0' }, cache: 'no-store' });
        let fd: FitnessDataPoint[] = [];
        if (wr.ok) {
            const wd = await wr.json();
            fd = wd.map((d: any) => ({ date: d.id, ctl: d.ctl, atl: d.atl, tsb: d.form })).filter((d: any) => d.ctl != null && d.atl != null && d.tsb != null);
        }
        const updateData: any = { lastHistorySyncAt: new Date().getTime(), recentActivities, heartRateZones: hrz, fitnessData: fd };
        if (eftp != null) updateData.eFTP = eftp; else updateData.eFTP = deleteField();
        await setDoc(integrationRef, updateData, { merge: true });
        revalidatePath('/settings'); revalidatePath('/');
        return { success: true, message: `Synced ${recentActivities.length} activities.` };
    } catch (error) {
        console.error('Error importing Intervals.icu history:', error);
        return { success: false, message: 'Sync failed.' };
    }
}

const wipeIntervalsHistorySchema = z.object({ userId: z.string() });
export async function wipeIntervalsHistory(data: z.infer<typeof wipeIntervalsHistorySchema>) {
    try {
        const { firestore } = await initializeFirebase();
        const { userId } = wipeIntervalsHistorySchema.parse(data);
        await updateDoc(doc(firestore, 'integrations', userId), { recentActivities: deleteField(), heartRateZones: deleteField(), eFTP: deleteField(), fitnessData: deleteField(), bestEfforts: deleteField(), lastHistorySyncAt: deleteField() });
        revalidatePath('/settings'); revalidatePath('/');
        return { success: true, message: 'History wiped.' };
    } catch (error) {
        console.error('Error wiping Intervals.icu history:', error);
        return { success: false, message: 'Wipe failed.' };
    }
}

const uploadGarminCsvSchema = z.object({ userId: z.string(), csvContent: z.string() });
export async function uploadGarminCsv(data: z.infer<typeof uploadGarminCsvSchema>) {
    try {
        const { firestore } = await initializeFirebase();
        const { userId, csvContent } = uploadGarminCsvSchema.parse(data);
        const integrationRef = doc(firestore, 'integrations', userId);
        const integrationSnap = await getDoc(integrationRef);
        const existingActivities = integrationSnap.exists() ? (integrationSnap.data().recentActivities as SyncedActivity[] || []) : [];
        const parseResult = Papa.parse(csvContent, { header: true, skipEmptyLines: true });
        const garminActivities: SyncedActivity[] = parseResult.data.map((row: any) => {
            const typeValue = row['Activity Type'] || row['Activiteitstype'];
            if (!typeValue) return null;
            const dateValue = row['Date'] || row['Datum'];
            const date = dateValue ? dateValue.split(' ')[0] : undefined;
            if (!date) return null;
            const timeValue = row['Moving Time'] || row['Tijd in beweging'] || row['Time'] || row['Tijd'];
            const distValue = row['Distance'] || row['Afstand'] || row['Distance (km)'];
            const hrValue = row['Avg HR'] || row['Gem. HS'];
            const speedValue = row['Avg Speed'] || row['Gem. snelheid'] || row['Gemiddelde snelheid'];
            const elevValue = row['Total Ascent'] || row['Totale stijging'];
            const titleValue = row['Title'] || row['Titel'];
            const na: any = { date, title: titleValue || typeValue, type: mapGarminSport(typeValue), durationMin: parseTimeToMinutes(timeValue), distanceKm: parseGarminNumber(distValue), averageHr: hrValue ? Math.round(parseGarminNumber(hrValue) || 0) : undefined, averageSpeedKmh: speedValue ? parseGarminNumber(speedValue) : undefined, elevationGain: elevValue ? Math.round(parseGarminNumber(elevValue) || 0) : undefined, status: 'Completed' };
            const fa: any = {};
            Object.keys(na).forEach(k => { if (na[k] != null && !Number.isNaN(na[k])) fa[k] = na[k]; });
            return fa as SyncedActivity;
        }).filter((a): a is SyncedActivity => a !== null);
        let merged = [...existingActivities];
        let newCount = 0, updCount = 0;
        for (const g of garminActivities) {
            if (!g.date || !g.durationMin || g.durationMin <= 0) continue;
            const idx = merged.findIndex(e => isSameDay(parseISO(e.date), parseISO(g.date)));
            if (idx !== -1) {
                if (!merged[idx].durationMin || merged[idx].durationMin < 2) { merged[idx] = g; updCount++; }
            } else { merged.push(g); newCount++; }
        }
        if (newCount === 0 && updCount === 0) return { success: true, message: 'No new data.' };
        merged.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        await setDoc(integrationRef, { recentActivities: merged, lastHistorySyncAt: new Date().getTime() }, { merge: true });
        revalidatePath('/settings');
        return { success: true, message: `Merged CSV. Added ${newCount}, updated ${updCount}.` };
    } catch (error) {
        console.error('Error uploading Garmin CSV:', error);
        return { success: false, message: 'Upload failed.' };
    }
}

function parseGarminNumber(v: string | undefined): number | undefined {
  if (!v || typeof v !== 'string') return undefined;
  const parts = v.trim().split(/[,.]/);
  let s: string;
  if (parts.length > 1) { const last = parts.pop()!; s = parts.join('') + '.' + last; }
  else { s = parts[0]; }
  const p = parseFloat(s);
  return isNaN(p) ? undefined : p;
}

function parseTimeToMinutes(t: string | undefined): number | undefined {
    if (!t || typeof t !== 'string' || t.trim() === '') return undefined;
    const tt = t.trim();
    if (tt.includes(':')) {
        const p = tt.split(':').map(Number);
        if (p.some(isNaN)) return undefined;
        let s = 0;
        if (p.length === 3) s = p[0] * 3600 + p[1] * 60 + p[2];
        else if (p.length === 2) s = p[0] * 60 + p[1];
        else return undefined;
        return isNaN(s) ? undefined : Math.round(s / 60);
    }
    const n = parseGarminNumber(tt);
    return n !== undefined ? Math.round(n / 60) : undefined;
}

function mapGarminSport(t: string): Sport {
    const l = t.toLowerCase();
    if (l.includes('running') || l.includes('hardlopen')) return 'run';
    if (l.includes('cycling') || l.includes('fietsen')) return 'bike';
    if (l.includes('strength')) return 'strength';
    return 'other';
}

const updateUserHrZonesSchema = z.object({ userId: z.string(), zones: z.array(z.object({ name: z.string(), min: z.number(), max: z.number() })) });
export async function updateUserHrZones(data: z.infer<typeof updateUserHrZonesSchema>) {
    try {
        const { firestore } = await initializeFirebase();
        const { userId, zones } = updateUserHrZonesSchema.parse(data);
        await setDoc(doc(firestore, 'integrations', userId), { heartRateZones: zones }, { merge: true });
        revalidatePath(`/plan/*`, 'layout');
        return { success: true, message: 'Zones updated.' };
    } catch (error) {
        console.error('Error updating HR zones:', error);
        return { success: false, message: 'Update failed.' };
    }
}

const resyncAllWorkoutsInPlanSchema = z.object({ planId: z.string(), raceId: z.string() });
export async function resyncAllWorkoutsInPlan(data: z.infer<typeof resyncAllWorkoutsInPlanSchema>) {
    try {
        const { firestore } = await initializeFirebase();
        const { planId, raceId } = resyncAllWorkoutsInPlanSchema.parse(data);
        const planSnap = await getDoc(doc(firestore, 'plans', planId));
        const plan = planSnap.data() as Plan;
        const integrationSnap = await getDoc(doc(firestore, 'integrations', plan.userId));
        const integration = integrationSnap.data() as Integration;
        const { apiKey, intervalsId, heartRateZones } = integration;
        const auth = buildIntervalsAuthHeader(apiKey);
        const weeksSnap = await getDocs(collection(firestore, 'plans', planId, 'weeks'));
        const batch = writeBatch(firestore);
        let count = 0;
        for (const weekDoc of weeksSnap.docs) {
             const ws = await getDocs(query(collection(weekDoc.ref, "workouts"), where("source", "==", "intervalsIcu")));
             for (const wDoc of ws.docs) {
               const wd = wDoc.data() as Workout;
               if (!wd.intervalsActivityId) continue;
               let goal = wd.goal;
               let pType = wd.type;
               let pSteps = wd.steps;
               if (wd.plannedWorkoutId && wd.plannedWeekId) {
                   const pSnap = await getDoc(doc(firestore, 'plans', planId, 'weeks', wd.plannedWeekId, 'workouts', wd.plannedWorkoutId));
                   if (pSnap.exists()) { const p = pSnap.data() as Workout; goal = p.goal || goal; pType = p.type; pSteps = p.steps; }
               }
               if (!goal) continue;
               const { timeStream, hrStream, paceStream } = await fetchActivityStreams(intervalsId, wd.intervalsActivityId, { 'Authorization': auth, 'User-Agent': 'FirebaseStudio/1.0' });
               const ev = await evaluateWorkoutPerformance({ goal: goal!, plannedWorkoutType: pType, plannedSteps: pSteps, completedActivity: { durationMin: wd.durationMin, distanceKm: wd.distanceKm, averagePaceSecPerKm: wd.durationMin && wd.distanceKm ? Math.round((wd.durationMin*60)/wd.distanceKm) : undefined, averageHr: wd.averageHr, timeStream: downsampleStream(timeStream), heartrateStream: downsampleStream(hrStream), paceStream: downsampleStream(paceStream) } });
               const tiz = heartRateZones && hrStream && timeStream ? calculateTimeInZones(hrStream, timeStream, heartRateZones) : [];
               batch.update(wDoc.ref, { performance: ev.status, performanceJustification: ev.justification, timeInZones: tiz });
               count++;
             }
        }
        await batch.commit();
        revalidatePath(`/plan/${raceId}`);
        return { success: true, message: `Re-analyzed ${count} activities.` };
    } catch (error) {
        console.error('Error resyncing all workouts in plan:', error);
        return { success: false, message: 'Re-analysis failed.' };
    }
}

const manuallyLinkWorkoutSchema = z.object({ planId: z.string(), completedWorkoutWeekId: z.string(), completedWorkoutId: z.string(), plannedWorkoutId: z.string().nullable(), plannedWorkoutWeekId: z.string().nullable() });
export async function manuallyLinkWorkout(data: z.infer<typeof manuallyLinkWorkoutSchema>) {
    try {
        const { firestore } = await initializeFirebase();
        const { planId, completedWorkoutWeekId, completedWorkoutId, plannedWorkoutId, plannedWorkoutWeekId } = manuallyLinkWorkoutSchema.parse(data);
        const completedWorkoutRef = doc(firestore, 'plans', planId, 'weeks', completedWorkoutWeekId, 'workouts', completedWorkoutId);
        if (!plannedWorkoutId || !plannedWorkoutWeekId) {
            await updateDoc(completedWorkoutRef, { plannedWorkoutId: deleteField(), plannedWeekId: deleteField(), goal: deleteField(), performance: deleteField(), performanceJustification: deleteField() });
            const updated = await getDoc(completedWorkoutRef);
            return { success: true, message: 'Workout unlinked.', updatedWorkout: { id: updated.id, ...updated.data() } as Workout };
        }
        const pSnap = await getDoc(doc(firestore, 'plans', planId, 'weeks', plannedWorkoutWeekId, 'workouts', plannedWorkoutId));
        const p = pSnap.data() as Workout;
        await updateDoc(completedWorkoutRef, { plannedWorkoutId, plannedWeekId: plannedWorkoutWeekId, goal: p.goal || '' });
        const res = await reevaluateWorkoutPerformance({ planId, weekId: completedWorkoutWeekId, workoutId: completedWorkoutId });
        return res;
    } catch (error) {
        console.error('Error manually linking workout:', error);
        return { success: false, message: 'Link failed.' };
    }
}
