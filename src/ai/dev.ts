import { config } from 'dotenv';
config();

import '@/ai/flows/generate-initial-plan.ts';
import '@/ai/flows/compute-race-forecast.ts';
import '@/ai/flows/generate-next-week-adaptive.ts';
import '@/ai/flows/evaluate-workout-performance.ts';
import '@/ai/flows/analyze-race-performance.ts';
