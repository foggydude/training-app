
'use server';

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const WorkoutTargetSchema = z.object({
  type: z.enum(['duration', 'distance', 'heart_rate', 'pace']),
  value: z.number(),
  unit: z.enum(['minutes', 'km', 'bpm', 'min/km', 'percent_ftp', 'watts']),
});

const WorkoutStepSchema = z.union([
  z.object({
    type: z.enum(['warmup', 'cooldown', 'run', 'recovery', 'strength', 'other']),
    description: z.string(),
    targets: z.array(WorkoutTargetSchema),
  }),
  z.object({
    type: z.literal('repeat'),
    repetitions: z.number(),
    steps: z.array(
      z.object({
        type: z.enum(['warmup', 'cooldown', 'run', 'recovery', 'strength', 'other']),
        description: z.string(),
        targets: z.array(WorkoutTargetSchema),
      })
    ),
  }),
]);

const PerformanceEvaluationInputSchema = z.object({
  goal: z.string().describe("The specific goal of the planned workout. e.g., 'Maintain an average pace between 5:30-5:45 min/km' or '6x800m @ 3:45'"),
  plannedWorkoutType: z.string().optional().describe("The planned workout type (easy, long, tempo, intervals, hills, recovery, race, etc.)."),
  plannedSteps: z.array(WorkoutStepSchema).optional().describe("The planned workout structure (warmup, intervals, recoveries, cooldown)."),
  completedActivity: z.object({
    durationMin: z.number().optional().describe("Actual duration of the activity in minutes."),
    distanceKm: z.number().optional().describe("Actual distance of the activity in kilometers."),
    averagePaceSecPerKm: z.number().optional().describe("Actual average pace in seconds per kilometer."),
    averageHr: z.number().optional().describe("Actual average heart rate in BPM."),
    timeStream: z.array(z.number()).optional().describe("Time-series data for elapsed time in seconds, aligned with other streams."),
    heartRateStream: z.array(z.number()).optional().describe("Time-series data for heart rate (BPM)."),
    paceStream: z.array(z.number()).optional().describe("Time-series data for pace in seconds per kilometer."),
  }).describe("The data from the completed activity, including detailed time-series streams if available."),
});

export type PerformanceEvaluationInput = z.infer<typeof PerformanceEvaluationInputSchema>;

const PerformanceEvaluationOutputSchema = z.object({
  status: z.enum(['below', 'as_expected', 'above']).describe("The evaluation of the performance against the goal."),
  justification: z.string().describe("A very brief, one-sentence justification for the evaluation. e.g., 'Pace was slightly slower than the target range.'"),
});

export type PerformanceEvaluationOutput = z.infer<typeof PerformanceEvaluationOutputSchema>;

export async function evaluateWorkoutPerformance(input: PerformanceEvaluationInput): Promise<PerformanceEvaluationOutput> {
  return evaluateWorkoutPerformanceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'evaluateWorkoutPerformancePrompt',
  input: {schema: PerformanceEvaluationInputSchema},
  output: {schema: PerformanceEvaluationOutputSchema},
  prompt: `You are an expert running coach. Your task is to evaluate an athlete's completed workout against its original goal, using detailed performance data. The most important data are the time-series streams for heart rate and pace.

  **Workout Goal:** "{{goal}}"
  **Planned Workout Type:** {{#if plannedWorkoutType}}{{plannedWorkoutType}}{{else}}Unknown{{/if}}
  **Planned Structure (if provided):**
  {{#if plannedSteps}}
  {{#each plannedSteps}}
  - {{type}} {{#if repetitions}}(repeat x{{repetitions}}){{/if}}: {{description}}
  {{/each}}
  {{else}}
  Not provided.
  {{/if}}

  **Summary of Completed Activity:**
  - Duration: {{#if completedActivity.durationMin}}{{completedActivity.durationMin}} minutes{{else}}N/A{{/if}}
  - Distance: {{#if completedActivity.distanceKm}}{{completedActivity.distanceKm}} km{{else}}N/A{{/if}}
  - Average Pace: {{#if completedActivity.averagePaceSecPerKm}}{{completedActivity.averagePaceSecPerKm}} sec/km{{else}}N/A{{/if}}
  - Average HR: {{#if completedActivity.averageHr}}{{completedActivity.averageHr}} bpm{{else}}N/A{{/if}}

  **Detailed Stream Analysis (Primary Importance):**
  {{#if completedActivity.heartRateStream}}
  You have access to second-by-second heart rate and pace data. Use this for a deep analysis.
  - **Focus on the workout purpose:** Use the planned workout type and structure to prioritize the most relevant parts of the session. For intervals, tempos, or hills, analyze the work segments and de-emphasize warm-up, recovery, and cool-down. For easy or recovery runs, steady-state comfort and heart rate drift are more important than brief surges. For long runs, prioritize total duration and steady pacing over short fluctuations.
  - **Cardiac Drift:** Analyze the heart rate stream during steady-state portions of the run (if any). Did the athlete's heart rate remain stable at a consistent pace, or did it drift upwards over time? Low cardiac drift is a key sign of strong aerobic fitness.
  - **Pace vs. Heart Rate:** How did heart rate respond to changes in pace? For tempo or interval sessions, did they hit their pace targets without their heart rate spiking excessively into a higher, unsustainable zone?
  - **Training Effect:** The real training effect comes from the physiological stress. A workout completed at the target pace but with a much lower-than-expected heart rate is a sign of significant improvement ('above' expectation). Conversely, hitting the pace but with an extremely high heart rate might indicate fatigue or overreaching ('below' expectation).
  {{else}}
  **No detailed stream data was provided for deep analysis.** Base your evaluation on the summary statistics (duration, distance, average pace, average HR) compared to the workout goal. Your justification should reflect this limited data. For example: "Average pace was slower than the target range." or "The workout was completed at the planned duration."
  When the planned workout type is intervals/tempo/hills, emphasize whether the key work segments appear completed per the goal (rather than overall averages). For easy/long runs, total duration and steady pacing are more relevant.
  {{/if}}

  **Evaluation Task:**
  Based on all available data (prioritizing the stream analysis if present), determine if the performance was 'below', 'as_expected', or 'above' the goal. Weight the evaluation toward the key training stimulus (interval reps, tempo blocks, or long steady efforts) rather than total averages for sessions with warm-up/recovery/cool-down.

  - 'above': Clearly exceeded the goal. For example, ran significantly faster at the same or lower heart rate, or showed very low cardiac drift on a long tempo.
  - 'as_expected': Met the core requirements of the workout. Pace and heart rate were within the expected ranges.
  - 'below': Did not meet the workout's goal. For example, pace was much slower, heart rate was excessively high for the pace, or they couldn't complete the prescribed duration/intervals.

  Provide a concise, one-sentence justification for your evaluation that references your analysis (e.g., "Pace was on target and cardiac drift was minimal, indicating strong aerobic adaptation."). If stream data was missing, the justification MUST state that the analysis was based on summary data.
  `,
});

const evaluateWorkoutPerformanceFlow = ai.defineFlow(
  {
    name: 'evaluateWorkoutPerformanceFlow',
    inputSchema: PerformanceEvaluationInputSchema,
    outputSchema: PerformanceEvaluationOutputSchema,
  },
  async input => {
    // If goal is empty or just generic, default to 'as_expected'
    if (
      !input.goal ||
      input.goal.toLowerCase().includes('easy') ||
      input.goal.toLowerCase().includes('recovery') ||
      input.plannedWorkoutType?.toLowerCase() === 'easy' ||
      input.plannedWorkoutType?.toLowerCase() === 'recovery'
    ) {
        return { status: 'as_expected', justification: 'Completed as a recovery/easy session.' };
    }
    const {output} = await prompt(input);
    return output!;
  }
);
