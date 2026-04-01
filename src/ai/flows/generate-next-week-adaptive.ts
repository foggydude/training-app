
'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const WorkoutTargetSchema = z.object({
  type: z.enum(['duration', 'distance', 'heart_rate', 'pace']),
  value: z.number(),
  unit: z.enum(['minutes', 'km', 'bpm', 'min/km', 'percent_ftp', 'watts']),
});
const SingleWorkoutStepSchema = z.object({
  type: z.enum(['warmup', 'cooldown', 'run', 'recovery', 'strength', 'other']),
  description: z.string(),
  targets: z.array(WorkoutTargetSchema),
});
const RepeatingWorkoutStepSchema = z.object({
  type: z.enum(['repeat']),
  repetitions: z.number().int().min(1),
  steps: z.array(SingleWorkoutStepSchema),
});
const WorkoutStepSchema = z.union([SingleWorkoutStepSchema, RepeatingWorkoutStepSchema]);
const WorkoutSchema = z.object({
  id: z.string(),
  date: z.string(),
  sport: z.enum(["run", "bike", "strength", "other"]),
  type: z.enum(["easy", "long", "tempo", "intervals", "hills", "recovery", "strength", "mobility", "race"]),
  durationMin: z.number().optional(),
  distanceKm: z.number().optional(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["planned", "completed", "skipped"]),
  goal: z.string().optional(),
  performance: z.enum(['below', 'as_expected', 'above']).optional(),
  steps: z.array(WorkoutStepSchema),
});

const GenerateNextWeekAdaptiveInputSchema = z.object({
  previousWeek: z.object({
    weekStartDate: z.string(),
    workouts: z.array(WorkoutSchema),
  }).describe("The training data from the week that just finished."),
  nextWeekPlan: z.object({
     weekStartDate: z.string(),
     workouts: z.array(WorkoutSchema),
  }).describe("The originally planned workouts for the upcoming week."),
  raceGoal: z.object({
    distanceKm: z.number(),
    goalTimeSec: z.number().optional(),
  }),
  currentFitness: z.object({
    vo2max: z.number().optional(),
    z2Pace: z.string().optional(),
  }),
});
export type GenerateNextWeekAdaptiveInput = z.infer<typeof GenerateNextWeekAdaptiveInputSchema>;

const GenerateNextWeekAdaptiveOutputSchema = z.object({
  weeklyCompliance: z.object({
    status: z.enum(['below', 'as_expected', 'above']),
    comment: z.string().describe("A 2-3 sentence summary of last week's performance and the reasoning for the compliance status."),
  }).describe("The evaluation of the past week's compliance."),
  adaptationSummary: z.string().describe("A 2-3 sentence summary explaining the key changes made to the upcoming week's plan and the reasoning behind them."),
  adaptedNextWeekWorkouts: z.array(WorkoutSchema).describe("The adjusted list of workouts for the upcoming week."),
  updatedForecast: z.object({
    predictedResultSec: z.number().describe('The newly predicted race time in seconds.'),
    confidence: z.enum(['low', 'med', 'high']).describe('The confidence level of the new prediction.'),
    explanation: z.string().describe("A short explanation for the forecast change based on last week's training."),
  }).describe("An updated race forecast."),
  updatedKpis: z.object({
    vo2max: z.object({
      value: z.union([z.number(), z.string()]),
      trend: z.enum(['improving', 'stalling', 'decreasing']),
      description: z.string(),
    }),
    z2Pace: z.object({
      value: z.union([z.number(), z.string()]),
      trend: z.enum(['improving', 'stalling', 'decreasing']),
      description: z.string(),
    }),
    trainingLoadBalance: z.object({
      value: z.union([z.number(), z.string()]),
      trend: z.enum(['improving', 'stalling', 'decreasing']),
      description: z.string(),
    }),
    runningEconomy: z.object({
      value: z.union([z.number(), z.string()]),
      trend: z.enum(['improving', 'stalling', 'decreasing']),
      description: z.string(),
    }),
  }).describe("Updated KPI indicators based on last week's performance."),
});
export type GenerateNextWeekAdaptiveOutput = z.infer<typeof GenerateNextWeekAdaptiveOutputSchema>;

export async function generateNextWeekAdaptive(input: GenerateNextWeekAdaptiveInput): Promise<GenerateNextWeekAdaptiveOutput> {
  return generateNextWeekAdaptiveFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateNextWeekAdaptivePrompt',
  input: {schema: GenerateNextWeekAdaptiveInputSchema},
  output: {schema: GenerateNextWeekAdaptiveOutputSchema},
  prompt: `You are an expert running coach who adapts a training plan based on an athlete's weekly performance.

  **1. Analyze Last Week's Performance:**
  First, review the 'previousWeek' workouts. Note which were 'completed', 'skipped', or 'planned'. For completed workouts, check the 'performance' evaluation ('above', 'as_expected', 'below').
  - Calculate an overall compliance score.
  - Formulate a 'weeklyCompliance' summary. The 'status' should reflect overall performance, and the 'comment' should explain why (e.g., "Good week with all key sessions completed. Performance on the interval session was strong, indicating growing fitness.").

  **Previous Week Data ({{previousWeek.weekStartDate}}):**
  {{#each previousWeek.workouts}}
  - {{date}}: {{title}} ({{type}}) - Status: {{status}}{{#if performance}}, Performance: {{performance}}{{/if}}
  {{/each}}

  **2. Adapt Next Week's Plan:**
  Next, take the 'nextWeekPlan' and adjust it based on your analysis.
  - **If compliance was high ('above' or 'as_expected' with good performance):** Make a small progression. E.g., add 5 mins to a tempo run, add one rep to an interval session, or add 5-10% duration to the long run. Do NOT increase everything at once.
  - **If compliance was low ('below' or key sessions were 'skipped'):** Reduce the load. E.g., shorten the long run by 10-15%, reduce interval reps, or lower the intensity of a tempo run. Do not remove workouts unless a majority were skipped.
  - **Do not change the dates or sport of workouts.** Only adjust duration, distance, reps, or descriptions within the existing structure.
  
  **IMPORTANT RULE:** Your response in \`adaptedNextWeekWorkouts\` MUST ONLY contain workouts that were present in the input \`nextWeekPlan\`. You MUST preserve the \`id\` of each workout. You are **forbidden** from creating new workouts, adding workouts based on the \`previousWeek\`, or inventing new \`id\`s. Your only job is to modify the properties (like \`durationMin\`, \`description\`, \`steps\`) of the existing workouts in \`nextWeekPlan\`.
  
  **CRITICAL:** For the \`adaptedNextWeekWorkouts\`, ensure the \`performance\` field is always \`undefined\` as these workouts have not yet been completed. The output MUST be a complete list of all workouts for the next week in 'adaptedNextWeekWorkouts'.

  **Originally Planned Next Week ({{nextWeekPlan.weekStartDate}}):**
  {{#each nextWeekPlan.workouts}}
  - ID: {{id}}, Date: {{date}}: {{title}} ({{durationMin}} min)
  {{/each}}

  **3. Explain Your Adaptations:**
  In the \`adaptationSummary\` field, provide a short (2-3 sentences) summary of the most important changes you made to the upcoming week and why. For example, "Based on your strong performance in last week's intervals, I've increased the number of reps for next week's session to continue building your top-end speed."

  **4. Update the Race Forecast:**
  Generate an 'updatedForecast' based on last week's results and the athlete's current fitness.
  - If they performed well, their 'predictedResultSec' should decrease slightly.
  - If they performed poorly or skipped sessions, it might increase or stay the same.
  - Adjust the 'confidence' level based on consistency.
  - Provide a brief 'explanation' for the change.

  **5. Update Fitness Indicators (KPIs):**
  Provide an 'updatedKpis' object for VO2max, Z2 Pace, Training Load Balance, and Running Economy.
  - Each KPI MUST include a 'value', 'trend' ('improving', 'stalling', or 'decreasing'), and a concise 'description'.
  - If data is insufficient, set the value to "N/A" and the trend to "stalling" with a clear explanation.

  **Athlete Context:**
  - Race Goal: {{raceGoal.distanceKm}}km in {{raceGoal.goalTimeSec}}s
  - Current Fitness: VO2max: {{currentFitness.vo2max}}, Z2 Pace: {{currentFitness.z2Pace}}

  Generate a complete JSON response with all the required top-level keys.
  `,
});

const generateNextWeekAdaptiveFlow = ai.defineFlow(
  {
    name: 'generateNextWeekAdaptiveFlow',
    inputSchema: GenerateNextWeekAdaptiveInputSchema,
    outputSchema: GenerateNextWeekAdaptiveOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
