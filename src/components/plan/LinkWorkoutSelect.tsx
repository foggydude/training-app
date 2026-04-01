'use client';

import { useState } from 'react';
import type { Workout } from '@/lib/types';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Link2, Loader2 } from 'lucide-react';
import { manuallyLinkWorkout } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { parseISO, isWithinInterval, startOfWeek, endOfWeek, subWeeks, addWeeks } from 'date-fns';

type LinkWorkoutSelectProps = {
  completedWorkout: Workout;
  allWorkouts: Workout[];
  onLinked?: (updatedWorkout: Workout) => void;
};

export function LinkWorkoutSelect({
  completedWorkout,
  allWorkouts,
  onLinked,
}: LinkWorkoutSelectProps) {
  const [selectedId, setSelectedId] = useState<string>('');
  const [isLinking, setIsLinking] = useState(false);
  const { toast } = useToast();

  if (completedWorkout.source !== 'intervalsIcu') return null;

  const completedDate = parseISO(completedWorkout.date);
  
  // Define a wider search window: the week before, the week of, and the week after.
  const searchStart = subWeeks(startOfWeek(completedDate, { weekStartsOn: 1 }), 1);
  const searchEnd = addWeeks(endOfWeek(completedDate, { weekStartsOn: 1 }), 1);

  const linkedPlannedIds = new Set(
    allWorkouts
      .filter((w) => w.source === 'intervalsIcu' && w.plannedWorkoutId)
      .map((w) => w.plannedWorkoutId!)
  );

  const candidatePlanned = allWorkouts.filter(
    (w) =>
      w.source === 'planned' &&
      w.sport === completedWorkout.sport &&
      w.planId === completedWorkout.planId &&
      isWithinInterval(parseISO(w.date), { start: searchStart, end: searchEnd }) &&
      !linkedPlannedIds.has(w.id) &&
      (completedWorkout.type !== 'race' || w.type === 'race') // For races, only show planned races
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleLink = async () => {
    if (!selectedId) return;
    const target = allWorkouts.find((w) => w.id === selectedId);
    if (!target || target.source !== 'planned') return;

    setIsLinking(true);
    const result = await manuallyLinkWorkout({
      planId: completedWorkout.planId,
      completedWorkoutWeekId: completedWorkout.weekId,
      completedWorkoutId: completedWorkout.id,
      plannedWorkoutId: target.id,
      plannedWorkoutWeekId: target.weekId,
    });
    setIsLinking(false);

    if (result.success) {
      toast({ title: 'Gekoppeld', description: result.message });
      setSelectedId('');
      if (result.updatedWorkout) onLinked?.(result.updatedWorkout as Workout);
    } else {
      toast({
        variant: 'destructive',
        title: 'Koppelen mislukt',
        description: result.message,
      });
    }
  };

  const handleUnlink = async () => {
    setIsLinking(true);
    const result = await manuallyLinkWorkout({
      planId: completedWorkout.planId,
      completedWorkoutWeekId: completedWorkout.weekId,
      completedWorkoutId: completedWorkout.id,
      plannedWorkoutId: null,
      plannedWorkoutWeekId: null,
    });
    setIsLinking(false);

    if (result.success) {
      toast({ title: 'Ontkoppeld', description: result.message });
      if (result.updatedWorkout) onLinked?.(result.updatedWorkout as Workout);
    } else {
      toast({
        variant: 'destructive',
        title: 'Ontkoppelen mislukt',
        description: result.message,
      });
    }
  };

  const linkedTo = completedWorkout.plannedWorkoutId
    ? allWorkouts.find((w) => w.id === completedWorkout.plannedWorkoutId)
    : null;

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold">
        <Link2 className="h-4 w-4" />
        Koppel aan geplande training
      </h4>
      {linkedTo ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            Gekoppeld aan: <strong>{linkedTo.title}</strong> ({linkedTo.date})
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUnlink}
            disabled={isLinking}
          >
            {isLinking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ontkoppel'}
          </Button>
        </div>
      ) : candidatePlanned.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Geen ongekoppelde geplande {completedWorkout.sport === 'run' ? 'loop' : completedWorkout.sport === 'bike' ? 'fietstraining' : 'training'} gevonden in de omliggende weken.
        </p>
      ) : (
        <div className="flex gap-2">
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Kies geplande training..." />
            </SelectTrigger>
            <SelectContent>
              {candidatePlanned.map((w) => (
                <SelectItem key={w.id} value={w.id}>
                  {w.title} – {w.date} ({w.type})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleLink}
            disabled={!selectedId || isLinking}
          >
            {isLinking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Koppel'
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
