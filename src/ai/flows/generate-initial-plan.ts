
'use server';

/**
 * @fileOverview A flow to generate an initial training plan for a race.
 *
 * - generateInitialPlan - A function that generates the initial training plan.
 * - GenerateInitialPlanInput - The input type for the generateInitialPlan function.
 * - GenerateInitialPlanOutput - The return type for the generateInitialPlan function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';


const WorkoutTargetSchema = z.object({
  type: z.enum(['duration', 'distance', 'heart_rate', 'pace']),
  value: z.number(),
  unit: z.enum(['minutes', 'km', 'bpm', 'min/km', 'percent_ftp', 'watts']),
});

const SingleWorkoutStepSchema = z.object({
  type: z.enum(['warmup', 'cooldown', 'run', 'recovery', 'strength', 'other']),
  description: z.string().describe("A detailed description of this step."),
  targets: z.array(WorkoutTargetSchema),
}).describe("A single, non-repeating step in a workout. Use this for any part of a session that is not a repeating interval.");

const RepeatingWorkoutStepSchema = z.object({
  type: z.enum(['repeat']).describe("This indicates a block of repeating steps, such as intervals."),
  repetitions: z.number().int().min(1).describe('The number of times to repeat the set of steps within this block.'),
  steps: z.array(SingleWorkoutStepSchema).describe('The individual steps to be repeated. For example, a run step followed by a recovery step.'),
}).describe("A block of steps that is repeated multiple times. Use this exclusively for interval training structures.");

const WorkoutStepSchema = z.union([SingleWorkoutStepSchema, RepeatingWorkoutStepSchema]);


const WorkoutSchema = z.object({
  date: z.string().describe("The date of the workout in 'yyyy-MM-dd' format."),
  sport: z.enum(["run", "bike", "strength", "other"]),
  type: z.enum(["easy", "long", "tempo", "intervals", "hills", "recovery", "strength", "mobility", "race"]),
  durationMin: z.number().optional().describe("The total estimated duration of the workout in minutes."),
  distanceKm: z.number().optional().describe("The total estimated distance of the workout in kilometers."),
  title: z.string().describe("A short, descriptive title for the workout."),
  description: z.string().describe("A one-sentence summary of the workout."),
  status: z.enum(["planned", "completed", "skipped"]).default("planned"),
  steps: z.array(WorkoutStepSchema).describe("A detailed, step-by-step breakdown of the workout session. Use repeating steps for intervals."),
  goal: z.string().optional().describe("A specific, measurable performance goal for this workout, e.g., 'Maintain an average pace between 5:30-5:45 min/km' or 'Keep heart rate in Zone 2.'"),
});

const WeekSchema = z.object({
  weekStartDate: z.string().describe("The start date of the week in 'yyyy-MM-dd' format."),
  workouts: z.array(WorkoutSchema),
});

const daysOfWeek = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const RaceSchema = z.object({
    id: z.string().optional(),
    userId: z.string(),
    name: z.string(),
    sport: z.enum(['run', 'bike', 'multi']),
    date: z.string(),
    distanceKm: z.number(),
    goalTimeSec: z.number().optional(),
    notes: z.string().optional(),
    createdAt: z.number().optional(),
    constraints: z.object({
        runsPerWeek: z.number(),
        bikesPerWeek: z.number(),
        strengthPerWeek: z.number(),
        maxWeekdayDurationMin: z.number(),
        longRunDay: z.enum(daysOfWeek),
        preferredDays: z.array(z.enum(daysOfWeek)).optional(),
    }),
});

const PerformanceDataSchema = z.object({
  eFTP: z.number().optional().describe('Estimated Functional Threshold Power (FTP) in watts.'),
  bestEfforts: z.array(z.object({
    type: z.string().describe('The duration or distance of the effort (e.g., "1min", "5km").'),
    value: z.number().describe('The power or pace of the best effort.'),
    unit: z.string().describe('The unit of the value (e.g., "watts", "min/km").')
  })).optional().describe('A list of the athlete\'s recent best efforts.'),
  recentActivities: z.array(z.object({
      date: z.string(),
      title: z.string(),
      type: z.string(),
      durationMin: z.number(),
      distanceKm: z.number().optional(),
      averageHr: z.number().optional(),
      averageSpeedKmh: z.number().optional(),
      elevationGain: z.number().optional(),
  })).optional().describe('A list of recent activities from the last 3 months, with performance details.'),
}).describe('The athlete\'s current performance data from Intervals.icu.');

const GenerateInitialPlanInputSchema = z.object({
  race: RaceSchema.describe('The race object to generate a plan for.'),
  startDate: z.string().describe('The start date for the plan in ISO format.'),
  endDate: z.string().describe('The end date for the plan in ISO format.'),
  performanceData: PerformanceDataSchema.optional().describe('The athlete\'s historical performance data.'),
  additionalPrompt: z.string().optional().describe('Additional user-provided instructions for the plan.'),
});

export type GenerateInitialPlanInput = z.infer<typeof GenerateInitialPlanInputSchema>;

const GenerateInitialPlanFlowInputSchema = GenerateInitialPlanInputSchema.extend({
  model: z.enum(['flash', 'pro']).optional(),
});

export type GenerateInitialPlanFlowInput = z.infer<typeof GenerateInitialPlanFlowInputSchema>;

const KpiMetricSchema = z.object({
    value: z.union([z.string(), z.number()]).optional().describe("The calculated value of the KPI."),
    trend: z.enum(['improving', 'stalling', 'decreasing']).optional().describe("The trend of the KPI over recent history (last 4-6 weeks). 'improving' for positive change, 'decreasing' for negative change, 'stalling' for stable."),
    description: z.string().optional().describe("A brief (1-2 sentences) explanation of how this KPI was calculated and what it means."),
});

const KpiSchema = z.object({
  vo2max: KpiMetricSchema.describe("Athlete's estimated VO2 Max."),
  z2Pace: KpiMetricSchema.describe("Athlete's estimated sustainable pace for Zone 2 (aerobic/easy) runs."),
  trainingLoadBalance: KpiMetricSchema.describe("Assessment of the balance between training stress and recovery."),
  runningEconomy: KpiMetricSchema.describe("Assessment of how efficiently the athlete uses energy while running."),
});


const GenerateInitialPlanOutputSchema = z.object({
  trainingPhilosophy: z.string().describe("A structured training philosophy including Goal, Analysis, and Strategy, derived from real performance data."),
  weeks: z.array(WeekSchema).describe('An array of weekly training schedules for the entire plan.'),
  kpis: KpiSchema.describe("Key Performance Indicators derived from the athlete's performance data, including value, trend, and description for each."),
});

export type GenerateInitialPlanOutput = z.infer<typeof GenerateInitialPlanOutputSchema>;

export async function generateInitialPlan(input: GenerateInitialPlanFlowInput): Promise<GenerateInitialPlanOutput> {
  return generateInitialPlanFlow(input);
}

const generateInitialPlanPromptText = `You are an expert running and endurance coach. Your primary task is to create a highly personalized, detailed, week-by-week training plan, a supporting training philosophy, and a set of Key Performance Indicators (KPIs), all based on real performance data.

**Part 1: Training Philosophy**

First, create the 'trainingPhilosophy'. This is critical and must be based on the provided performance data. Follow this exact structure:

1.  **Goal**: Start with "Goal:". Clearly state the athlete's goal for the {{race.name}}.
2.  **Analysis**: Start with "Analysis:". Based on the provided performance data (eFTP, Best Efforts, and Recent Activities), analyze the athlete's current fitness profile. Identify their strengths and the single biggest factor currently limiting them from reaching their goal. If the data is insufficient, explicitly say so and avoid assumptions.
3.  **Strategy**: Start with "Strategy:". Explain in 1-2 sentences the high-level strategy the training plan will use to address the limiter identified in the analysis.

**Part 2: Key Performance Indicators (KPIs) - VERY IMPORTANT**

Next, populate the 'kpis' object. You are working with **summary data** from recent activities, which includes averages but **no second-by-second stream data**. Your calculations and descriptions must reflect this limitation. For EACH of the four KPIs (vo2max, z2Pace, trainingLoadBalance, runningEconomy), you MUST provide a 'value', 'trend', and 'description'.

*   **value**: The calculated metric based on the available summary data.
*   **trend**: Analyze the \`recentActivities\` over the past 4-6 weeks to determine the trend. Is the athlete's average pace for similar runs improving? Is their weekly volume increasing? Set as 'improving', 'decreasing', or 'stalling'.
*   **description**: A concise, 1-2 sentence explanation of how you calculated the metric. **Crucially, if the calculation is an estimate due to lack of stream data, you MUST state this.**

**KPI Calculation Rules (Follow Strictly):**

1.  **vo2max**:
    *   **Calculation**: Estimate this based on recent race-like efforts or hard interval sessions from the \`recentActivities\` summary data. A 5k time is a good proxy. Base it on the provided data.
    *   **Description**: Explain your calculation method (e.g., "Estimated from your recent 5k-equivalent effort of...").
    *   **Trend**: Is their average pace in high-intensity workouts improving over time?

2.  **z2Pace**:
    *   **Calculation (CRITICAL)**: Estimate this pace by analyzing the **average pace and average heart rate** of recent **long, easy runs** from the \`recentActivities\` list. Look for runs over 60 minutes with a moderate average heart rate. Provide a pace range (e.g., "5:45-6:15 min/km").
    *   **Description**: You MUST state that this is an estimate based on averages. For example: "Estimated from the average pace and HR of your recent long runs. A more precise Z2 pace based on cardiac drift can be determined by analyzing individual workouts."
    *   **Trend**: Are they running at a faster average pace for a similar average heart rate on their long runs? This indicates an 'improving' trend.

3.  **trainingLoadBalance**:
    *   **Value**: A qualitative assessment (e.g., 'Optimal', 'High Risk', 'Needs Intensity') based on the mix of workout types and total duration in \`recentActivities\`.
    *   **Description**: Explain why you chose this assessment (e.g., "Based on a good mix of high and low intensity sessions in your recent history.").
    *   **Trend**: Is the mix of workouts becoming more or less optimal over the last few weeks?

4.  **runningEconomy**:
    *   **Value**: A qualitative assessment (e.g., 'Good', 'Developing', 'Efficient').
    *   **Description**: Explain your reasoning based on the relationship between average pace and average heart rate across different runs. For example: "Your average heart rate appears relatively low on faster runs, suggesting good economy. This is an estimate; detailed analysis requires stream data."
    *   **Trend**: Is the ratio of average pace to average HR improving on similar types of runs? If they run faster at the same average HR, economy is 'improving'.

**If you lack sufficient performance data to make a confident calculation for any KPI**, you must still populate all fields. Set the 'value' to "N/A", the 'trend' to "stalling", and the 'description' to a clear explanation like "Not enough recent run data to calculate an accurate Z2 Pace. Please sync more activities from your Garmin or other device."

**Part 3: Training Plan Generation**

Finally, generate the weekly training plan.

Heart Rate Zone Legend (use for descriptions):
- Z1: Recovery
- Z2: Aerobic/Endurance
- Z3: Tempo/Marathon Pace
- Z4: Lactate Threshold
- Z5: VO2 Max

Athlete's Current Performance Data (from Intervals.icu):
{{#if performanceData}}
  - eFTP: {{#if performanceData.eFTP}}{{performanceData.eFTP}} watts{{else}}Not available{{/if}}
  - Best Efforts:
    {{#each performanceData.bestEfforts}}
    - {{type}}: {{value}} {{unit}}
    {{else}}
    - No recent best efforts provided.
    {{/each}}
  - Recent Activities (sample):
{{#each performanceData.recentActivities}}
    - {{date}}: {{title}} ({{durationMin}} min). {{#if distanceKm}}{{distanceKm}}km{{/if}}{{#if averageSpeedKmh}} at {{averageSpeedKmh}}km/h{{/if}}{{#if averageHr}}, avg HR {{averageHr}}bpm{{/if}}.
    {{else}}
    - No recent activities to analyze.
    {{/each}}
{{else}}
  - No performance data available.
{{/if}}

Race Details:
- Name: {{race.name}}
- Distance: {{race.distanceKm}} km
- Goal Time: {{#if race.goalTimeSec}}{{race.goalTimeSec}} seconds{{else}}Not specified{{/if}}
- Race Date: {{race.date}}

Training Constraints:
- Runs Per Week: {{race.constraints.runsPerWeek}}
- Bikes Per Week: {{race.constraints.bikesPerWeek}}
- Strength Sessions Per Week: {{race.constraints.strengthPerWeek}}
- Max Weekday Workout Duration: {{race.constraints.maxWeekdayDurationMin}} minutes
- Long Run Day: {{race.constraints.longRunDay}}
{{#if race.constraints.preferredDays}}
- Preferred Training Days: {{#each race.constraints.preferredDays}}{{{this}}}{{#unless @last}}, {{/unless}}{{/each}}
{{/if}}

Additional User Instructions:
{{#if additionalPrompt}}
- {{additionalPrompt}}
{{else}}
- None provided.
{{/if}}

**Instructions for Plan Generation:**

1.  **Scheduling (CRITICAL)**: Adhere strictly to the user's scheduling constraints.
    *   Schedule the long run on the specified 'Long Run Day'.
    *   If 'Preferred Training Days' are provided, schedule ALL workouts ONLY on those days. Distribute the workouts logically across the preferred days.
    *   If no preferred days are provided, distribute the workouts evenly throughout the week, respecting the long run day.
2.  **Personalization (CRITICAL)**: Use the athlete's performance data, especially the detailed \`recentActivities\`, to define realistic paces for each training zone (Z1-Z5). Analyze trends in heart rate vs. pace to gauge fitness. For example, if their recent tempo runs show a pace of 4:30/km at 165bpm, their Z4 intervals should be around that pace, not a generic one. Use the full history to inform the analysis.
    *   **No assumptions rule**: Do not invent or estimate missing performance data. If key data is missing, explicitly state that in the Analysis and produce a very basic, low-risk plan based only on the user's constraints (frequency, duration limits, long run day). Keep intensity mostly easy and avoid detailed pace targets.
3.  **Structure**: Generate a complete plan for the entire duration between the start date ({{startDate}}) and end date ({{endDate}}). Structure the output into an array of weeks.
4.  **Workout Detail (CRITICAL)**: Every workout MUST be broken down into structured 'steps'. For interval workouts, you MUST use a 'repeat' step. A repeat step contains the number of 'repetitions' and a list of 'steps' to be repeated (e.g., a 'run' step and a 'recovery' step).
    *   **Pace & HR**: For run workouts, provide a 'pace' target in 'min/km' or a 'heart_rate' target in 'bpm'.
5.  **Periodization**: The plan must show logical progression. Gradually increase volume and intensity, incorporating "cutback" or "recovery" weeks approximately every 3-4 weeks. The final 1-3 weeks must be a taper. If data is insufficient, keep progression conservative and minimal.
6.  **Workout Types**: Include a mix of key workouts (Long Run, Tempo, Intervals, Easy/Recovery) based on the constraints.
7.  **Dates**: Ensure every workout has a correct 'yyyy-MM-dd' date. The \`weekStartDate\` for each week must also be correct.
8.  **Goals (CRITICAL)**: For every key workout (intervals, tempo, long runs), provide a specific, measurable 'goal' in the 'goal' field. The goal MUST be based on concrete metrics. Use one of the following formats:
    *   **Pace Range:** "Maintain an average pace between 5:30-5:45 min/km."
    *   **Heart Rate Zone:** "Keep heart rate in Zone 2 (e.g., 140-155 bpm)."
    *   **Interval Pace:** "Complete all 800m repeats at or below 3:45."
    If specific pace or HR data is unavailable from the athlete's performance history, use the calculated KPI paces (z2Pace, z3Pace) or general heart rate zones (Z1-Z5). Avoid subjective goals like "run at an easy effort". The goal must be a clear, single-sentence success metric for the workout.
9.  **Completeness (CRITICAL)**: The final output must be a single, complete JSON object matching the output schema, with a non-empty 'weeks' array containing the full schedule.
**CRITICAL REMINDERS:**
- **KPIs are Mandatory**: You must generate the full 'kpis' object. Every KPI inside it (\`vo2max\`, \`z2Pace\`, etc.) MUST have a \`value\`, \`trend\`, and \`description\`. Do not return an empty object.
- **Base KPIs on Data**: The user is an expert and will notice if the KPIs don't reflect their recent training. Analyze \`recentActivities\` carefully. If data is missing, state that in the description as instructed above.

Generate a complete, personalized plan now. The output MUST be a valid JSON object matching the output schema.
`;

const generateInitialPlanPrompt = ai.definePrompt({
  name: 'generateInitialPlanPrompt',
  model: 'googleai/gemini-2.5-flash',
  input: {schema: GenerateInitialPlanInputSchema},
  output: {schema: GenerateInitialPlanOutputSchema},
  prompt: generateInitialPlanPromptText,
});

const generateInitialPlanPromptPro = ai.definePrompt({
  name: 'generateInitialPlanPromptPro',
  model: 'googleai/gemini-2.5-pro',
  input: {schema: GenerateInitialPlanInputSchema},
  output: {schema: GenerateInitialPlanOutputSchema},
  prompt: generateInitialPlanPromptText,
});

const generateInitialPlanFlow = ai.defineFlow(
  {
    name: 'generateInitialPlanFlow',
    inputSchema: GenerateInitialPlanFlowInputSchema,
    outputSchema: GenerateInitialPlanOutputSchema,
  },
  async input => {
    const {model, ...promptInput} = input;
    const prompt = model === 'pro' ? generateInitialPlanPromptPro : generateInitialPlanPrompt;
    const {output} = await prompt(promptInput);
    return output!;
  }
);
