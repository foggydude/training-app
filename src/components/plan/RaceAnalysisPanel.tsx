
'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { analyzeRacePerformanceAction } from '@/lib/actions';
import type { Workout } from '@/lib/types';
import { Skeleton } from '@/components/ui/skeleton';
import { DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Bot, CheckCircle, TrendingUp } from 'lucide-react';
import { LinkWorkoutSelect } from './LinkWorkoutSelect';
import { usePlan } from '@/hooks/use-plan';

type RaceAnalysisPanelProps = {
  workout: Workout;
  allWorkouts?: Workout[];
};

type AnalysisResult = {
    headline: string;
    analysis: string;
    keyTakeaways: string[];
}

function formatMarkdown(text: string) {
  const bolded = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  const bulletPoints = bolded.replace(/^- (.*$)/gm, '<li class="list-disc list-inside">$1</li>');
  return `<p>${bulletPoints.replace(/\n/g, '<br />')}</p>`;
}

export function RaceAnalysisPanel({ workout, allWorkouts = [] }: RaceAnalysisPanelProps) {
  const params = useParams();
  const raceId = params?.id as string | undefined;
  const { plan } = usePlan(raceId);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function getAnalysis() {
      if (!plan || !workout.planId) return;
      
      setLoading(true);
      setError(null);

      try {
        const result = await analyzeRacePerformanceAction({
          planId: workout.planId,
          workoutId: workout.id,
          weekId: workout.weekId,
        });

        if (result.success) {
          setAnalysis(result.analysis);
        } else {
          setError(result.message || 'Failed to generate analysis.');
        }
      } catch (e: any) {
        console.error('Error generating race analysis:', e);
        setError(e.message || 'An unexpected error occurred.');
      } finally {
        setLoading(false);
      }
    }
    
    if (plan) {
        getAnalysis();
    }
  }, [workout.id, workout.planId, workout.weekId, plan]);
  
  if (loading) {
    return (
        <div>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" />AI Race Analysis</DialogTitle>
                <DialogDescription>Analyzing your performance for "{workout.title}"...</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-6">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-12 w-full" />
            </div>
        </div>
    );
  }

  if (error) {
     return (
        <div>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-destructive">Analysis Failed</DialogTitle>
                <DialogDescription>Could not generate an analysis for this race.</DialogDescription>
            </DialogHeader>
            <div className="py-6 text-sm text-destructive-foreground bg-destructive/20 p-4 rounded-md">
                {error}
            </div>
        </div>
     );
  }
  
  if (!analysis) return null;


  return (
    <div>
      <DialogHeader className="mb-6">
        <DialogTitle className="flex items-center gap-2 text-2xl">
          <Bot className="h-6 w-6 text-primary" />
          AI Race Analysis
        </DialogTitle>
        <DialogDescription>
          An AI-powered breakdown of your performance in the "{workout.title}".
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <blockquote className="border-l-2 border-primary pl-4">
            <h3 className="text-xl font-semibold text-foreground">{analysis.headline}</h3>
        </blockquote>
        
        <div className="space-y-4">
          <h4 className="flex items-center gap-2 font-semibold"><TrendingUp className="h-5 w-5" />Performance Breakdown</h4>
          <div
            className="text-sm text-muted-foreground prose prose-sm"
            dangerouslySetInnerHTML={{ __html: formatMarkdown(analysis.analysis) }}
          />
        </div>
        
        <LinkWorkoutSelect
          completedWorkout={workout}
          allWorkouts={allWorkouts}
        />

        <div className="space-y-4">
          <h4 className="flex items-center gap-2 font-semibold"><CheckCircle className="h-5 w-5" />Key Takeaways</h4>
          <ul className="list-none space-y-2">
            {analysis.keyTakeaways.map((takeaway, index) => (
              <li key={index} className="flex items-start gap-2">
                <CheckCircle className="h-4 w-4 mt-1 text-green-500 shrink-0" />
                <span className="text-sm text-muted-foreground">{takeaway}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
