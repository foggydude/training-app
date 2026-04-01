

export type Sport = 'run' | 'bike' | 'multi' | 'strength' | 'other';

export type WorkoutType =
  | 'easy'
  | 'long'
  | 'tempo'
  | 'intervals'
  | 'hills'
  | 'recovery'
  | 'strength'
  | 'mobility'
  | 'race';

export type TargetType = 'duration' | 'distance' | 'heart_rate' | 'pace';
export type StepType =
  | 'warmup'
  | 'cooldown'
  | 'run'
  | 'recovery'
  | 'strength'
  | 'other';

export type WorkoutTarget = {
  type: TargetType;
  value: number;
  unit: 'minutes' | 'km' | 'bpm' | 'min/km' | 'percent_ftp' | 'watts';
};

export type SingleWorkoutStep = {
  type: StepType;
  description: string;
  targets: WorkoutTarget[];
};

export type RepeatingWorkoutStep = {
  type: 'repeat';
  repetitions: number;
  steps: SingleWorkoutStep[];
};

export type WorkoutStep = SingleWorkoutStep | RepeatingWorkoutStep;

export type Workout = {
  id: string;
  userId: string;
  weekId: string;
  planId: string;
  date: string; // ISO string
  sport: Sport;
  type: WorkoutType;
  durationMin?: number;
  distanceKm?: number;
  title: string;
  description: string;
  status: 'planned' | 'completed' | 'skipped';
  source: 'planned' | 'intervalsIcu';
  steps: WorkoutStep[];
  goal?: string;
  performance?: 'below' | 'as_expected' | 'above';
  performanceJustification?: string;
  averageHr?: number;
  intervalsActivityId?: string;
  plannedWorkoutId?: string;
  plannedWeekId?: string;
  timeInZones?: { zone: string; time: number; }[];
};

export type WorkoutStream = {
  streamType: 'heartrate' | 'watts' | 'cadence' | 'velocity' | 'temp' | 'time' | 'distance' | 'altitude';
  data: number[];
}

export type Forecast = {
  date: string; // ISO String
  predictedResultSec: number;
  type: 'actual' | 'projected' | 'goal';
}

export type Week = {
  id: string;
  planId: string;
  weekStartDate: string; // ISO string
  summary?: {
    plannedLoad: number;
    completedLoad: number;
    complianceScore: number;
  };
  forecast?: {
    predictedResultSec: number;
    deltaVsGoalSec: number;
    confidence: 'low' | 'med' | 'high';
    explanation: string;
  };
  weeklyCompliance?: {
    status: 'below' | 'as_expected' | 'above';
    comment: string;
  };
  workouts: Workout[];
  workoutsLoaded?: boolean;
};

export type KpiMetric = {
  value?: string | number;
  trend?: 'improving' | 'stalling' | 'decreasing';
  description?: string;
};

export type Kpis = {
  vo2max?: KpiMetric;
  z2Pace?: KpiMetric;
  trainingLoadBalance?: KpiMetric;
  runningEconomy?: KpiMetric;
};

export type Plan = {
  id: string;
  userId: string;
  raceId: string;
  startDate: string; // ISO string
  endDate: string; // ISO string
  status: 'active' | 'archived';
  trainingPhilosophy?: string;
  kpis?: Kpis;
  weeks: Week[];
  forecasts: Forecast[];
};

export type Race = {
  id:string;
  userId: string;
  name: string;
  sport: Sport;
  date: string; // ISO string
  distanceKm: number;
  goalTimeSec?: number;
  notes?: string;
  constraints: {
    runsPerWeek: number;
    bikesPerWeek: number;
    strengthPerWeek: number;
    maxWeekdayDurationMin: number;
    longRunDay:
      | 'Monday'
      | 'Tuesday'
      | 'Wednesday'
      | 'Thursday'
      | 'Friday'
      | 'Saturday'
      | 'Sunday';
    preferredDays?: ('Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday')[];
  };
  createdAt?: number;
};

export type UserPreferences = {
  weekStartDay: 'saturday' | 'sunday' | 'monday';
  units: 'metric' | 'imperial';
  language: 'en' | 'nl';
};

export type User = {
  id: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  createdAt: number;
  preferences?: UserPreferences;
};

export type BestEffort = {
  type: string;
  value: number;
  unit: string;
};

export type SyncedActivity = {
  intervalsId?: string;
  date: string;
  title: string;
  type: Sport;
  workoutType?: string; // e.g. 'Race', 'Long Run' from Intervals.icu
  durationMin?: number;
  distanceKm?: number;
  averageHr?: number;
  averageSpeedKmh?: number;
  elevationGain?: number;
  status: 'Completed' | 'Planned';
};

export type HeartRateZone = {
  name: string;
  min: number;
  max: number;
};

export type FitnessDataPoint = {
  date: string;
  ctl: number;
  atl: number;
  tsb: number;
};
export type Integration = {
  id: string;
  userId: string;
  provider: 'intervalsIcu';
  apiKey: string;
  intervalsId?: string;
  lastSyncAt?: number;
  lastHistorySyncAt?: number;
  eFTP?: number;
  bestEfforts?: BestEffort[];
  recentActivities?: SyncedActivity[];
  heartRateZones?: HeartRateZone[];
  fitnessData?: FitnessDataPoint[];
};

    
