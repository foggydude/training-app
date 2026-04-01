
'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Bike,
  Dumbbell,
  Footprints,
  Repeat,
  ArrowUp,
  ArrowDown,
  Minus,
  CheckCircle,
  BarChart3,
  Link2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { Workout } from '@/lib/types';
import { WorkoutForm } from './WorkoutForm';
import { RaceAnalysisPanel } from './RaceAnalysisPanel';
import { WorkoutAnalysisPanel } from './WorkoutAnalysisPanel';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
type WorkoutCardProps = {
  workout: Workout;
  allWorkouts: Workout[];
  connector?: {
    registerSource?: (workoutId: string, element: HTMLSpanElement | null) => void;
    registerTarget?: (workoutId: string, element: HTMLSpanElement | null) => void;
    onSourcePointerDown?: (
      workout: Workout,
      event: React.PointerEvent<HTMLSpanElement>
    ) => void;
    onTargetPointerEnter?: (workout: Workout) => void;
    onTargetPointerLeave?: (workout: Workout) => void;
    isLinkingFrom?: boolean;
    isLinkTarget?: boolean;
    isLinkTargetDisabled?: boolean;
    isDragging?: boolean;
  };
};

const sportConfig = {
  run: {
    icon: Footprints,
    color: 'bg-sky-500',
  },
  bike: {
    icon: Bike,
    color: 'bg-green-500',
  },
  strength: {
    icon: Dumbbell,
    color: 'bg-orange-500',
  },
  multi: {
    icon: Repeat,
    color: 'bg-purple-500',
  },
  other: {
    icon: Footprints,
    color: 'bg-gray-500',
  },
};

const performanceConfig = {
  above: {
    icon: ArrowUp,
    color: 'text-green-500',
    label: 'Above expectation',
  },
  as_expected: {
    icon: Minus,
    color: 'text-yellow-500',
    label: 'As expected',
  },
  below: {
    icon: ArrowDown,
    color: 'text-red-500',
    label: 'Below expectation',
  },
};

export function WorkoutCard({ workout, allWorkouts, connector }: WorkoutCardProps) {
  const [isOpen, setIsOpen] = useState(false);
  const config = sportConfig[workout.sport] || sportConfig.other;
  const Icon = config.icon;
  const perfConfig = workout.performance
    ? performanceConfig[workout.performance]
    : null;
  const PerfIcon = perfConfig?.icon;
  const isCompleted = workout.source === 'intervalsIcu';
  const isCompletedRace = workout.type === 'race' && isCompleted;

  const linkedWorkout = workout.plannedWorkoutId
    ? allWorkouts.find((w) => w.id === workout.plannedWorkoutId)
    : null;
  
  const isCompletedWorkoutWithAnalysis = isCompleted && !isCompletedRace;


  const handleSourcePointerDown = (
    event: React.PointerEvent<HTMLSpanElement>
  ) => {
    event.preventDefault();
    event.stopPropagation();
    connector?.onSourcePointerDown?.(workout, event);
  };

  const handleTargetPointerEnter = () => {
    connector?.onTargetPointerEnter?.(workout);
  };

  const handleTargetPointerLeave = () => {
    connector?.onTargetPointerLeave?.(workout);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <button
          className={cn(
            'w-full text-left border-l-4 rounded group transition-opacity relative',
            config.color.replace('bg-', 'border-'),
            isCompleted ? 'bg-muted' : 'bg-card',
            'shadow-sm hover:shadow-md'
          )}
        >
          {isCompleted && connector?.registerSource && (
            <span
              ref={(element) => connector.registerSource?.(workout.id, element)}
              data-connector="source"
              data-workout-id={workout.id}
              role="button"
              tabIndex={0}
              aria-label="Start linking to planned workout"
              title="Sleep naar een geplande training om te koppelen"
              className={cn(
                'absolute left-1/2 -top-2.5 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-background shadow-sm transition cursor-pointer z-10',
                connector.isLinkingFrom ? 'bg-primary' : 'bg-muted-foreground/70 hover:bg-muted-foreground'
              )}
              onPointerDown={handleSourcePointerDown}
              onClick={(event) => event.stopPropagation()}
            />
          )}
          {workout.source === 'planned' && connector?.registerTarget && (
            <span
              ref={(element) => connector.registerTarget?.(workout.id, element)}
              data-connector="target"
              data-workout-id={workout.id}
              role="button"
              tabIndex={0}
              aria-label="Link target planned workout"
              title="Drop hier om te koppelen"
              className={cn(
                'absolute left-1/2 -bottom-2.5 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-background shadow-sm transition z-10',
                connector.isLinkTarget
                  ? 'bg-primary ring-2 ring-primary-foreground'
                  : connector.isLinkTargetDisabled
                  ? 'bg-muted-foreground/30 cursor-not-allowed'
                  : 'bg-muted-foreground/70',
                connector.isDragging && !connector.isLinkTargetDisabled && 'hover:bg-muted-foreground'
              )}
              onPointerEnter={handleTargetPointerEnter}
              onPointerLeave={handleTargetPointerLeave}
              onClick={(event) => event.stopPropagation()}
            />
          )}
          <div className="p-2">
            <div className="flex items-start gap-2">
              {isCompleted ? (
                <CheckCircle className="h-4 w-4 mt-1 text-green-500" />
              ) : (
                <Icon className="h-4 w-4 mt-1 text-muted-foreground" />
              )}
              <div className="flex-1">
                <p className="text-sm font-semibold leading-tight">
                  {workout.title}
                </p>
                <p className="text-xs text-muted-foreground capitalize">
                  {workout.type}
                </p>
              </div>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {workout.durationMin && <span>{workout.durationMin} min</span>}
              {workout.durationMin && workout.distanceKm && ' / '}
              {workout.distanceKm && <span>{workout.distanceKm} km</span>}
            </div>
            <div className="mt-2 flex items-center gap-2">
                {PerfIcon && (
                    <div
                        className={cn(
                        'flex items-center gap-1 text-xs font-medium',
                        perfConfig.color
                        )}
                        title={perfConfig.label}
                    >
                        <PerfIcon className="h-4 w-4" />
                        <span>{perfConfig.label}</span>
                    </div>
                )}
                {linkedWorkout && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="flex items-center gap-1">
                          <Link2 className="h-3 w-3" />
                          <span>Linked</span>
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Linked to: <strong>{linkedWorkout.title}</strong></p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
            </div>
          </div>
          {workout.intervalsActivityId && (
            <div className="absolute top-1 right-1 p-1 rounded-full bg-background/50 backdrop-blur-sm" title="Detailed data available">
              <BarChart3 className="h-3.5 w-3.5 text-primary" />
            </div>
           )}
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        {isCompletedRace ? (
          <RaceAnalysisPanel workout={workout} allWorkouts={allWorkouts} />
        ) : isCompletedWorkoutWithAnalysis ? (
           <WorkoutAnalysisPanel allWorkouts={allWorkouts} workout={workout} onUpdate={(w) => { /* The usePlan hook will update state */ }} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Edit Workout: {workout.title}</DialogTitle>
            </DialogHeader>
            <WorkoutForm workout={workout} onSave={() => setIsOpen(false)} />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
