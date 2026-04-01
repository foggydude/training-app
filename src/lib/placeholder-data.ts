import type { Race, Plan } from "@/lib/types";
import { addDays, format, startOfWeek } from 'date-fns';

export const MOCK_USER = {
  id: 'user1',
  displayName: 'Alex Doe',
  email: 'alex.doe@example.com',
  photoURL: 'https://picsum.photos/seed/user1/100/100',
};

export const RACES: Race[] = [
  {
    id: "race1",
    userId: "user1",
    name: "Berlin Marathon",
    sport: "run",
    date: "2024-09-29",
    distanceKm: 42.2,
    goalTimeSec: 10800, // 3:00:00
    notes: "Aiming for a BQ.",
    constraints: {
      runsPerWeek: 5,
      bikesPerWeek: 0,
      strengthPerWeek: 2,
      maxWeekdayDurationMin: 75,
      longRunDay: "Sunday",
    },
  },
  {
    id: "race2",
    userId: "user1",
    name: "Valencia Half Marathon",
    sport: "run",
    date: "2024-10-27",
    distanceKm: 21.1,
    goalTimeSec: 5100, // 1:25:00
    constraints: {
      runsPerWeek: 4,
      bikesPerWeek: 1,
      strengthPerWeek: 1,
      maxWeekdayDurationMin: 60,
      longRunDay: "Sunday",
    },
  },
  {
    id: "race3",
    userId: "user1",
    name: "Local 10K",
    sport: "run",
    date: "2024-08-15",
    distanceKm: 10,
    constraints: {
      runsPerWeek: 3,
      bikesPerWeek: 2,
      strengthPerWeek: 1,
      maxWeekdayDurationMin: 60,
      longRunDay: "Saturday",
    },
  },
];

const today = new Date();
const weekStart = startOfWeek(today, { weekStartsOn: 1 }); // Monday

export const PLAN: Plan = {
  id: "plan1",
  userId: "user1",
  raceId: "race1",
  startDate: "2024-06-03",
  endDate: "2024-09-29",
  status: "active",
  weeks: [
    {
      id: "week1",
      planId: "plan1",
      weekStartDate: format(weekStart, 'yyyy-MM-dd'),
      summary: {
        plannedLoad: 350,
        completedLoad: 320,
        complianceScore: 0.91,
      },
      forecast: {
        predictedResultSec: 10920, // 3:02:00
        deltaVsGoalSec: 120,
        confidence: "med",
        explanation: "Solid week of training. Long run performance is on track. Increasing tempo pace slightly next week."
      },
      workouts: [
        {
          id: 'w1',
          userId: 'user1',
          weekId: 'week1',
          date: format(addDays(weekStart, 0), 'yyyy-MM-dd'), // Monday
          sport: 'strength',
          type: 'strength',
          durationMin: 45,
          title: 'Full Body Strength',
          description: '3x5 Squats, 3x5 Bench Press, 3x8 Rows',
          status: 'completed',
          performance: 'as_expected'
        },
        {
          id: 'w2',
          userId: 'user1',
          weekId: 'week1',
          date: format(addDays(weekStart, 1), 'yyyy-MM-dd'), // Tuesday
          sport: 'run',
          type: 'intervals',
          durationMin: 60,
          title: 'Track Intervals',
          description: '20min WU, 6x800m @ 5K pace, 15min CD',
          status: 'completed',
          performance: 'above'
        },
        {
          id: 'w3',
          userId: 'user1',
          weekId: 'week1',
          date: format(addDays(weekStart, 2), 'yyyy-MM-dd'), // Wednesday
          sport: 'run',
          type: 'recovery',
          distanceKm: 8,
          title: 'Recovery Run',
          description: 'Easy pace, Z1-Z2 heart rate',
          status: 'completed'
        },
        {
          id: 'w4',
          userId: 'user1',
          weekId: 'week1',
          date: format(addDays(weekStart, 3), 'yyyy-MM-dd'), // Thursday
          sport: 'run',
          type: 'tempo',
          durationMin: 70,
          title: 'Tempo Run',
          description: '15min WU, 3x10min @ Threshold, 15min CD',
          status: 'planned'
        },
         {
          id: 'w5',
          userId: 'user1',
          weekId: 'week1',
          date: format(addDays(weekStart, 4), 'yyyy-MM-dd'), // Friday
          sport: 'strength',
          type: 'strength',
          durationMin: 30,
          title: 'Core & Mobility',
          description: 'Planks, leg raises, and dynamic stretching',
          status: 'planned'
        },
        {
          id: 'w7',
          userId: 'user1',
          weekId: 'week1',
          date: format(addDays(weekStart, 6), 'yyyy-MM-dd'), // Sunday
          sport: 'run',
          type: 'long',
          distanceKm: 25,
          title: 'Long Run',
          description: 'Easy Z2 pace, focus on endurance',
          status: 'planned'
        }
      ],
    },
  ],
};
