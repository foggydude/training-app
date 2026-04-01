

'use client';

import { useState, useEffect } from 'react';
import type { Workout } from '@/lib/types';
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Bot,
  ArrowUp,
  ArrowDown,
  Minus,
  Clock,
  Route,
  Heart,
  Zap,
  RefreshCw,
  Loader2,
  BarChart,
  Info,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { reevaluateWorkoutPerformance } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { LinkWorkoutSelect } from './LinkWorkoutSelect';

const performanceConfig = {
  above: {
    icon: ArrowUp,
    color: 'text-green-500',
    label: 'Above Expectation',
    bgColor: 'bg-green-500/10',
  },
  as_expected: {
    icon: Minus,
    color: 'text-yellow-500',
    label: 'As Expected',
    bgColor: 'bg-yellow-500/10',
  },
  below: {
    icon: ArrowDown,
    color: 'text-red-500',
    label: 'Below Expectation',
    bgColor: 'bg-red-500/10',
  },
};

const zoneColors = [
  'bg-[hsl(var(--zone-1))]',
  'bg-[hsl(var(--zone-2))]',
  'bg-[hsl(var(--zone-3))]',
  'bg-[hsl(var(--zone-4))]',
  'bg-[hsl(var(--zone-5))]',
];

const StatCard = ({
  icon: Icon,
  value,
  label,
  unit,
}: {
  icon: React.ElementType;
  value?: string | number;
  label: string;
  unit?: string;
}) => {
  if (
    value === undefined ||
    value === null ||
    (typeof value === 'number' && isNaN(value))
  )
    return null;
  return (
    <div className="flex flex-col items-center justify-center p-4 rounded-lg bg-muted/50 text-center">
      <Icon className="h-6 w-6 text-muted-foreground mb-2" />
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">
        {label}
        {unit && ` (${unit})`}
      </div>
    </div>
  );
};

export function WorkoutAnalysisPanel({
  workout: initialWorkout,
  allWorkouts = [],
  onLinked,
}: {
  workout: Workout;
  allWorkouts?: Workout[];
  onLinked?: (workout: Workout) => void;
}) {
  const [workout, setWorkout] = useState(initialWorkout);
  const [isReevaluating, setIsReevaluating] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setWorkout(initialWorkout);
  }, [initialWorkout]);

  const handleReevaluate = async () => {
    setIsReevaluating(true);
    try {
      const result = await reevaluateWorkoutPerformance({
        planId: workout.planId,
        weekId: workout.weekId,
        workoutId: workout.id,
      });

      if (result.success && result.updatedWorkout) {
        toast({
          title: 'Analysis Updated',
          description: result.message,
        });
        setWorkout(result.updatedWorkout as Workout);
      } else {
        toast({
          variant: 'destructive',
          title: 'Re-evaluation Failed',
          description: result.message || 'An unexpected error occurred.',
        });
      }
    } catch (error) {
      console.error('Error re-evaluating workout performance:', error);
      toast({
        variant: 'destructive',
        title: 'Re-evaluation Failed',
        description: 'An unexpected error occurred.',
      });
    } finally {
      setIsReevaluating(false);
    }
  };

  const perfConfig = workout.performance
    ? performanceConfig[workout.performance]
    : null;
  const PerfIcon = perfConfig?.icon;

  const averagePaceMin =
    workout.durationMin && workout.distanceKm && workout.distanceKm > 0
      ? workout.durationMin / workout.distanceKm
      : null;
  const averagePaceSec =
    averagePaceMin ? Math.round((averagePaceMin * 60) % 60) : null;
  const averagePace =
    averagePaceMin && averagePaceSec !== null
      ? `${Math.floor(averagePaceMin)}:${
          averagePaceSec < 10 ? '0' : ''
        }${averagePaceSec}`
      : null;

  return (
    <div>
      <DialogHeader className="mb-6">
        <DialogTitle className="flex items-center gap-2 text-2xl">
          <Bot className="h-6 w-6 text-primary" />
          AI Performance Analysis
        </DialogTitle>
        <DialogDescription>
          An AI-powered breakdown of your workout: "{workout.title}" on{' '}
          {format(new Date(workout.date), 'MMM d, yyyy')}.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Clock}
            value={workout.durationMin}
            label="Duration"
            unit="min"
          />
          <StatCard
            icon={Route}
            value={workout.distanceKm}
            label="Distance"
            unit="km"
          />
          <StatCard
            icon={Zap}
            value={averagePace || undefined}
            label="Avg Pace"
            unit="min/km"
          />
          <StatCard
            icon={Heart}
            value={workout.averageHr}
            label="Avg HR"
            unit="bpm"
          />
        </div>

        {workout.timeInZones && workout.timeInZones.length > 0 && (
          <div className="space-y-3">
            <h4 className="flex items-center gap-2 text-md font-semibold"><BarChart className="h-5 w-5" />Time in Zones</h4>
            <div className="p-4 rounded-lg bg-muted/50 space-y-3">
                {workout.timeInZones.map(({ zone, time }) => {
                    const zoneIndex = parseInt(zone.replace('Z', ''), 10) - 1;
                    const colorClass = zoneColors[zoneIndex] || 'bg-muted';
                    const totalDuration = workout.durationMin || 1;
                    const percentage = (time / totalDuration) * 100;

                    return (
                        <div key={zone} className="grid grid-cols-[30px_1fr_50px] items-center gap-3 text-sm">
                            <span className="font-bold">{zone}</span>
                            <div className="w-full bg-muted rounded-full h-4 relative">
                                <div className={cn("h-4 rounded-full", colorClass)} style={{ width: `${percentage}%` }} />
                            </div>
                            <span className="text-right text-muted-foreground">{time} min</span>
                        </div>
                    );
                })}
            </div>
          </div>
        )}

        <LinkWorkoutSelect
          completedWorkout={workout}
          allWorkouts={allWorkouts}
          onLinked={(w) => { setWorkout(w); onLinked?.(w); }}
        />

        {perfConfig && (
          <div
            className={cn(
              'p-4 rounded-lg flex items-start gap-4',
              perfConfig.bgColor
            )}
          >
            <PerfIcon
              className={cn('h-8 w-8 mt-1 shrink-0', perfConfig.color)}
            />
            <div>
              <h4 className={cn('font-semibold', perfConfig.color)}>
                {perfConfig.label}
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                {workout.performanceJustification ||
                  'No specific justification was provided.'}
              </p>
            </div>
          </div>
        )}

        {workout.performanceJustification?.toLowerCase().includes('summary') && (
          <Alert className="border-amber-500/50 bg-amber-500/5">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Geen gedetailleerde streamdata beschikbaar voor deze training. Mogelijke oorzaken: de activiteit mist HR/snelheid per seconde, of de stream-API geeft geen data terug. Voer "Re-analyseer" uit na opnieuw synchroniseren.
            </AlertDescription>
          </Alert>
        )}
        
      </div>
      <DialogFooter className="mt-6">
        <Button
          variant="outline"
          onClick={handleReevaluate}
          disabled={isReevaluating || !workout.intervalsActivityId}
          title={!workout.intervalsActivityId ? "This workout does not have detailed data from Intervals.icu to analyze." : "Re-run deep analysis"}
        >
          {isReevaluating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          {isReevaluating ? 'Analyzing...' : 'Re-run Deep Analysis'}
        </Button>
      </DialogFooter>
    </div>
  );
}
