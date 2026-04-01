'use server';

/**
 * @fileOverview This file implements the Genkit flow for computing a race forecast.
 *
 * - computeRaceForecast - An exported function that computes the predicted race time and confidence interval.
 * - ComputeRaceForecastInput - The input type for the computeRaceForecast function.
 * - ComputeRaceForecastOutput - The return type for the computeRaceForecast function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ComputeRaceForecastInputSchema = z.object({
  recentTempoRuns: z.array(
    z.object({
      date: z.string().describe('Date of the tempo run (ISO format).'),
      durationMin: z.number().describe('Duration of the tempo run in minutes.'),
      averagePaceSecPerKm: z
        .number()
        .describe('Average pace during the tempo run in seconds per kilometer.'),
    })
  ).describe('An array of recent tempo run data.'),
  longRunReadiness: z
    .number()
    .describe(
      'A numerical score (0-1) representing the user’s readiness based on long runs, 1 being fully ready.'
    ),
  trainingConsistency: z
    .number()
    .describe(
      'A numerical score (0-1) representing the consistency of the user’s training, 1 being perfectly consistent.'
    ),
  goalTimeSec: z
    .number()
    .optional()
    .describe('The athletes goal finish time in seconds.'),
});
export type ComputeRaceForecastInput = z.infer<typeof ComputeRaceForecastInputSchema>;

const ComputeRaceForecastOutputSchema = z.object({
  predictedResultSec: z
    .number()
    .describe('The predicted race time in seconds.'),
  deltaVsGoalSec: z
    .number()
    .optional()
    .describe('The difference between the predicted race time and goal time in seconds.'),
  confidence: z
    .enum(['low', 'med', 'high'])
    .describe('The confidence level of the prediction.'),
  explanation: z
    .string()
    .describe('Explanation of the factors affecting the predicted time.'),
});
export type ComputeRaceForecastOutput = z.infer<typeof ComputeRaceForecastOutputSchema>;

export async function computeRaceForecast(input: ComputeRaceForecastInput): Promise<ComputeRaceForecastOutput> {
  return computeRaceForecastFlow(input);
}

const prompt = ai.definePrompt({
  name: 'computeRaceForecastPrompt',
  input: {schema: ComputeRaceForecastInputSchema},
  output: {schema: ComputeRaceForecastOutputSchema},
  prompt: `You are an expert running coach providing a race forecast based on training data.

  Analyze the following data to predict the athlete's race performance and provide an explanation.

  Recent Tempo Runs:
  {{#each recentTempoRuns}}
  - Date: {{date}}, Duration: {{durationMin}} min, Pace: {{averagePaceSecPerKm}} sec/km
  {{/each}}

  Long Run Readiness: {{longRunReadiness}} (0-1, 1 = fully ready)
  Training Consistency: {{trainingConsistency}} (0-1, 1 = perfectly consistent)
  Goal Time: {{goalTimeSec}} seconds

  Based on this information, predict the race time in seconds and give a confidence level (low, med, high).
  Also, provide a concise explanation of the factors influencing the prediction (max 3 bullet points).

  The confidence level should reflect:
  - The quantity and quality of tempo runs
  - Long run readiness
  - Training consistency
  - Proximity to goal time

  Consider these factors when generating the explanation:
  - Tempo run performance (pace, duration)
  - Consistency of tempo runs
  - Recent long run performance
  - Overall training consistency
  - How the predicted time compares to the athlete's goal

  If a goal time is available, calculate the delta between the predicted and goal time.
  Be realistic, taking all factors into account, and provide a well-reasoned estimate.

  Remember to include the unit of measurement, seconds, when outputting the predicted time.
  If the user has no goal time, set deltaVsGoalSec to undefined.
  `,
});

const computeRaceForecastFlow = ai.defineFlow(
  {
    name: 'computeRaceForecastFlow',
    inputSchema: ComputeRaceForecastInputSchema,
    outputSchema: ComputeRaceForecastOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
