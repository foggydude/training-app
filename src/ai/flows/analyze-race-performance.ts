
'use server';

/**
 * @fileOverview A flow to analyze a completed race performance against a primary goal.
 *
 * - analyzeRacePerformance - A function that provides a coaching analysis of a race.
 * - AnalyzeRacePerformanceInput - The input type for the function.
 * - AnalyzeRacePerformanceOutput - The return type for the function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const WorkoutSchema = z.object({
  title: z.string(),
  sport: z.string(),
  type: z.string(),
  durationMin: z.number().optional(),
  distanceKm: z.number().optional(),
  description: z.string(),
});

const RaceSchema = z.object({
  name: z.string(),
  sport: z.string(),
  date: z.string(),
  distanceKm: z.number(),
  goalTimeSec: z.number().optional(),
});

const AnalyzeRacePerformanceInputSchema = z.object({
  completedRace: WorkoutSchema.describe('The workout object for the completed tune-up race.'),
  mainGoalRace: RaceSchema.describe('The main goal race the athlete is training for.'),
  trainingConsistency: z.number().min(0).max(1).describe('A score (0-1) of how consistent the training has been leading up to this race.'),
});
export type AnalyzeRacePerformanceInput = z.infer<typeof AnalyzeRacePerformanceInputSchema>;

const AnalyzeRacePerformanceOutputSchema = z.object({
  headline: z.string().describe("A punchy, one-sentence headline summarizing the performance."),
  analysis: z.string().describe("A paragraph analyzing the race performance in context of the main goal. Use Markdown for formatting and bullet points."),
  keyTakeaways: z.array(z.string()).describe('A list of 2-3 concise, bullet-point takeaways for the athlete.'),
});
export type AnalyzeRacePerformanceOutput = z.infer<typeof AnalyzeRacePerformanceOutputSchema>;

export async function analyzeRacePerformance(input: AnalyzeRacePerformanceInput): Promise<AnalyzeRacePerformanceOutput> {
  return analyzeRacePerformanceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'analyzeRacePerformancePrompt',
  input: { schema: AnalyzeRacePerformanceInputSchema },
  output: { schema: AnalyzeRacePerformanceOutputSchema },
  helpers: {
    divide: (a: number, b: number) => {
      if (typeof a !== 'number' || typeof b !== 'number' || b === 0) {
        return 'N/A';
      }
      return (a / b).toFixed(2);
    },
  },
  prompt: `You are an expert running coach providing a post-race analysis for an athlete.

The athlete just completed a tune-up race. Your task is to analyze their performance and explain what it means for their main goal race.

**Tune-up Race Performance:**
- **Race:** {{completedRace.title}}
- **Distance:** {{completedRace.distanceKm}} km
- **Time:** {{completedRace.durationMin}} minutes
- **Pacing:** {{#if completedRace.durationMin}}{{divide completedRace.durationMin completedRace.distanceKm}}{{else}}N/A{{/if}} min/km

**Main Goal Race:**
- **Race:** {{mainGoalRace.name}}
- **Distance:** {{mainGoalRace.distanceKm}} km
- **Goal Time:** {{#if mainGoalRace.goalTimeSec}}{{divide mainGoalRace.goalTimeSec 60}} minutes{{else}}Not specified{{/if}}

**Training Context:**
- **Consistency Score:** {{trainingConsistency}} (A score from 0 to 1, where 1 is perfect consistency)

**Your Task:**

1.  **Headline:** Write a single, encouraging but realistic headline summarizing the tune-up race performance.
2.  **Analysis:** Write a paragraph (3-5 sentences) analyzing the result.
    - Compare the tune-up race pace to what would be required for the main goal race.
    - Use a race time predictor equivalent (like Riegel or a similar model) to estimate what this performance could translate to for the main goal distance.
    - Factor in the training consistency. Is the performance expected? A surprise?
    - Conclude with a clear statement on whether they are on track for their main goal.
3.  **Key Takeaways:** Provide 2-3 specific, actionable bullet points for the athlete moving forward. These should be concise recommendations based on your analysis.

Be positive, but base your analysis in data. The output must be a valid JSON object.`,
});

const analyzeRacePerformanceFlow = ai.defineFlow(
  {
    name: 'analyzeRacePerformanceFlow',
    inputSchema: AnalyzeRacePerformanceInputSchema,
    outputSchema: AnalyzeRacePerformanceOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    return output!;
  }
);
