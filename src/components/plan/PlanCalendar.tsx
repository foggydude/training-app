"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Plan, Workout, Week } from "@/lib/types";
import {
  addDays,
  format,
  isSameDay,
  startOfWeek,
  parseISO,
  isWithinInterval,
  endOfWeek,
  isSameWeek,
  differenceInWeeks,
} from "date-fns";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import { WorkoutCard } from "./WorkoutCard";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { manuallyLinkWorkout } from "@/lib/actions";
import { useToast } from "@/hooks/use-toast";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type PlanCalendarProps = {
  plan: Plan;
};

const DAYS_OF_WEEK = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const complianceConfig = {
  above: {
    icon: ArrowUp,
    color: "text-green-500",
    label: "Progress is better than expected",
  },
  as_expected: {
    icon: Minus,
    color: "text-yellow-500",
    label: "Progress is on track",
  },
  below: {
    icon: ArrowDown,
    color: "text-red-500",
    label: "Progress is slower than planned",
  },
};

function formatDuration(seconds: number) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return [h > 0 ? h : null, m > 9 ? m : h ? '0' + m : m || '0', s > 9 ? s : '0' + s]
    .filter(val => val !== null)
    .join(':');
}

const WeeklyComplianceCell = ({ week, plan }: { week: Week, plan: Plan }) => {
  if (!week.weeklyCompliance) {
    return (
      <TableCell className="w-[150px] text-center align-middle"></TableCell>
    );
  }

  const config = complianceConfig[week.weeklyCompliance.status];
  const Icon = config.icon;
  
  const weekStart = parseISO(week.weekStartDate);
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  const getForecastForWeek = (type: 'actual' | 'projected') => {
    const forecasts = plan.forecasts
      .filter(f => f.type === type && isWithinInterval(parseISO(f.date), { start: weekStart, end: weekEnd }))
      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime());
    return forecasts[0];
  }

  const actualForecast = getForecastForWeek('actual');
  const projectedForecast = getForecastForWeek('projected');
  const compliancePercentage = week.summary?.complianceScore;

  return (
    <TableCell className="w-[150px] text-center align-middle p-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div
              className={cn("flex flex-col items-center gap-2 p-2 rounded-md", config.color)}
            >
              <Icon className="h-7 w-7" />
              <div className="text-xs font-medium text-foreground/80 space-y-1">
                {typeof compliancePercentage === 'number' && (
                  <div>
                    <div className="text-muted-foreground">Compliance</div>
                    <div>{Math.round(compliancePercentage * 100)}%</div>
                  </div>
                )}
                {projectedForecast && (
                  <div>
                    <div className="text-muted-foreground">Planned</div>
                    <div>{formatDuration(projectedForecast.predictedResultSec)}</div>
                  </div>
                )}
                {actualForecast && (
                  <div>
                    <div className="text-muted-foreground">Actual</div>
                    <div>{formatDuration(actualForecast.predictedResultSec)}</div>
                  </div>
                )}
              </div>
            </div>
          </TooltipTrigger>
          <TooltipContent side="left">
            <p className="max-w-xs">{week.weeklyCompliance.comment}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </TableCell>
  );
};

export function PlanCalendar({ plan }: PlanCalendarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sourceConnectorRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const targetConnectorRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const hoverTargetIdRef = useRef<string | null>(null);
  const [linkLines, setLinkLines] = useState<
    { id: string; from: { x: number; y: number }; to: { x: number; y: number } }[]
  >([]);
  const [dragState, setDragState] = useState<{
    workout: Workout;
    start: { x: number; y: number };
  } | null>(null);
  const [dragPosition, setDragPosition] = useState<{ x: number; y: number } | null>(null);
  const [hoverTargetId, setHoverTargetId] = useState<string | null>(null);
  const [isLinking, setIsLinking] = useState(false);
  const { toast } = useToast();
  const weekStartsOn = 1;

  const sortedWeeks = useMemo(() => {
    if (!plan.weeks) return [];
    return [...plan.weeks].sort((a, b) =>
      new Date(a.weekStartDate).getTime() - new Date(b.weekStartDate).getTime()
    );
  }, [plan.weeks]);

  const allWorkouts = useMemo(() => {
    if (!plan.weeks) return [];
    return plan.weeks.flatMap((week) => week.workouts);
  }, [plan.weeks]);

  const workoutById = useMemo(() => {
    return new Map(allWorkouts.map((workout) => [workout.id, workout]));
  }, [allWorkouts]);

  const plannedLinkedToCompleted = useMemo(() => {
    const linkedMap = new Map<string, string>();
    allWorkouts
      .filter((workout) => workout.source === "intervalsIcu" && workout.plannedWorkoutId)
      .forEach((workout) => {
        if (workout.plannedWorkoutId) {
          linkedMap.set(workout.plannedWorkoutId, workout.id);
        }
      });
    return linkedMap;
  }, [allWorkouts]);

  const workoutsByDay = useMemo(() => {
    if (!allWorkouts) return {};
    const grouped: { [key: string]: Workout[] } = {};
    for (const workout of allWorkouts) {
      const dateKey = format(parseISO(workout.date), "yyyy-MM-dd");
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(workout);
    }
    Object.values(grouped).forEach((workouts) => {
      workouts.sort((a, b) => {
        const aRank = a.source === "planned" ? 0 : 1;
        const bRank = b.source === "planned" ? 0 : 1;
        if (aRank !== bRank) return aRank - bRank;
        return a.title.localeCompare(b.title);
      });
    });
    return grouped;
  }, [allWorkouts]);

  const getConnectorPosition = (element: HTMLSpanElement) => {
    const container = containerRef.current;
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2 - containerRect.left,
      y: rect.top + rect.height / 2 - containerRect.top,
    };
  };

  const updateLinkLines = () => {
    const lines: { id: string; from: { x: number; y: number }; to: { x: number; y: number } }[] = [];
    allWorkouts.forEach((workout) => {
      if (workout.source !== "intervalsIcu" || !workout.plannedWorkoutId) return;
      const sourceElement = sourceConnectorRefs.current.get(workout.id);
      const targetElement = targetConnectorRefs.current.get(workout.plannedWorkoutId);
      if (!sourceElement || !targetElement) return;
      const from = getConnectorPosition(sourceElement);
      const to = getConnectorPosition(targetElement);
      if (!from || !to) return;
      lines.push({ id: workout.id, from, to });
    });
    setLinkLines(lines);
  };

  useEffect(() => {
    updateLinkLines();
  }, [allWorkouts]);

  useEffect(() => {
    const handleUpdate = () => updateLinkLines();
    window.addEventListener("resize", handleUpdate);
    window.addEventListener("scroll", handleUpdate, true);
    return () => {
      window.removeEventListener("resize", handleUpdate);
      window.removeEventListener("scroll", handleUpdate, true);
    };
  }, [allWorkouts]);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      setDragPosition({ x: event.clientX - rect.left, y: event.clientY - rect.top });

      const elementUnder = document.elementFromPoint(event.clientX, event.clientY);
      const targetEl = elementUnder?.closest?.('[data-connector="target"]');
      const workoutId = targetEl?.getAttribute?.('data-workout-id') ?? null;
      const isLinkedElsewhere = workoutId &&
        plannedLinkedToCompleted.get(workoutId) &&
        plannedLinkedToCompleted.get(workoutId) !== dragState.workout.id;
      const validTargetId = workoutId && !isLinkedElsewhere ? workoutId : null;
      hoverTargetIdRef.current = validTargetId;
      setHoverTargetId(validTargetId);
    };

    const handlePointerUp = async () => {
      const targetId = hoverTargetIdRef.current;
      if (dragState && targetId) {
        const targetWorkout = workoutById.get(targetId);
        const isLinkedElsewhere =
          plannedLinkedToCompleted.get(targetId) &&
          plannedLinkedToCompleted.get(targetId) !== dragState.workout.id;
        if (targetWorkout && !isLinkedElsewhere && !isLinking) {
          setIsLinking(true);
          const result = await manuallyLinkWorkout({
            planId: dragState.workout.planId,
            completedWorkoutId: dragState.workout.id,
            completedWorkoutWeekId: dragState.workout.weekId,
            plannedWorkoutId: targetWorkout.id,
            plannedWorkoutWeekId: targetWorkout.weekId,
          });
          if (result.success) {
            toast({ title: "Workout Linked", description: result.message });
          } else {
            toast({
              variant: "destructive",
              title: "Link Failed",
              description: result.message,
            });
          }
          setIsLinking(false);
        }
      }
      setDragState(null);
      setDragPosition(null);
      hoverTargetIdRef.current = null;
      setHoverTargetId(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [dragState, isLinking, plannedLinkedToCompleted, toast, workoutById]);

  return (
    <div className="border rounded-lg relative bg-card" ref={containerRef}>
      <svg className="absolute inset-0 pointer-events-none z-20" aria-hidden="true">
        <defs>
          <marker
            id="link-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="4"
            orient="auto"
            markerUnits="strokeWidth"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="hsl(var(--primary))" />
          </marker>
        </defs>
        {linkLines.map((line) => (
          <line
            key={line.id}
            x1={line.from.x}
            y1={line.from.y}
            x2={line.to.x}
            y2={line.to.y}
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            markerEnd="url(#link-arrow)"
            opacity="0.7"
          />
        ))}
        {dragState && dragPosition && (
          <line
            x1={dragState.start.x}
            y1={dragState.start.y}
            x2={dragPosition.x}
            y2={dragPosition.y}
            stroke="hsl(var(--primary))"
            strokeWidth="2"
            markerEnd="url(#link-arrow)"
            opacity="0.9"
          />
        )}
      </svg>
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-[120px]">Week</TableHead>
            {DAYS_OF_WEEK.map((day) => (
              <TableHead key={day}>{day}</TableHead>
            ))}
            <TableHead className="w-[150px] text-center">
              Weekly Compliance
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedWeeks.map((week) => {
            const weekStart = startOfWeek(parseISO(week.weekStartDate), {
              weekStartsOn,
            });
            const planStart = startOfWeek(parseISO(plan.startDate), { weekStartsOn: 1 });
            const weekNumber = differenceInWeeks(weekStart, planStart);
            const displayWeek = weekNumber >= 0 ? `Week ${weekNumber + 1}` : `Week ${weekNumber}`;
            const weekDays = Array.from({ length: 7 }).map((_, i) =>
              addDays(weekStart, i)
            );
            const isCurrentWeek = isSameWeek(new Date(), weekStart, { weekStartsOn: 1 });

            return (
              <TableRow key={week.id} className={cn("hover:bg-transparent", isCurrentWeek && "bg-blue-500/5")}>
                <TableCell className="font-medium align-top p-2 border-r">
                  <div className="p-2">
                    <div className="font-bold">{displayWeek}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(weekStart, "MMM d")}
                    </div>
                  </div>
                </TableCell>
                {weekDays.map((day) => {
                  const dayKey = format(day, "yyyy-MM-dd");
                  const todaysWorkouts = workoutsByDay[dayKey] || [];
                  const isToday = isSameDay(day, new Date());

                  return (
                    <TableCell
                      key={day.toISOString()}
                      className="p-2 align-top h-full border-r overflow-visible"
                    >
                      <div className="flex items-center mb-2">
                        <div
                          className={cn(
                            "flex items-center justify-center h-8 w-8 rounded-full text-sm font-medium",
                            isToday && "bg-primary text-primary-foreground"
                          )}
                        >
                          {format(day, "d")}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {todaysWorkouts.map((workout) => (
                          <div key={workout.id} className="relative overflow-visible">
                            <WorkoutCard
                              workout={workout}
                              allWorkouts={allWorkouts}
                              connector={{
                                registerSource: (workoutId, element) => {
                                  if (element) sourceConnectorRefs.current.set(workoutId, element);
                                  else sourceConnectorRefs.current.delete(workoutId);
                                },
                                registerTarget: (workoutId, element) => {
                                  if (element) targetConnectorRefs.current.set(workoutId, element);
                                  else targetConnectorRefs.current.delete(workoutId);
                                },
                                onSourcePointerDown: (sourceWorkout, event) => {
                                  if (sourceWorkout.source !== "intervalsIcu") return;
                                  const sourceElement = event.currentTarget;
                                  sourceElement.setPointerCapture?.(event.pointerId);
                                  const start = getConnectorPosition(sourceElement);
                                  if (!start) return;
                                  setDragState({ workout: sourceWorkout, start });
                                  setDragPosition(start);
                                },
                                onTargetPointerEnter: (targetWorkout) => {
                                  if (!dragState) return;
                                  const isLinkedElsewhere =
                                    plannedLinkedToCompleted.get(targetWorkout.id) &&
                                    plannedLinkedToCompleted.get(targetWorkout.id) !==
                                      dragState.workout.id;
                                  if (isLinkedElsewhere) return;
                                  setHoverTargetId(targetWorkout.id);
                                },
                                onTargetPointerLeave: (targetWorkout) => {
                                  if (hoverTargetId === targetWorkout.id) setHoverTargetId(null);
                                },
                                isLinkingFrom: dragState?.workout.id === workout.id,
                                isLinkTarget: hoverTargetId === workout.id,
                                isLinkTargetDisabled:
                                  workout.source === "planned" &&
                                  !!plannedLinkedToCompleted.get(workout.id) &&
                                  plannedLinkedToCompleted.get(workout.id) !== dragState?.workout.id,
                                isDragging: !!dragState,
                              }}
                            />
                          </div>
                        ))}
                        {todaysWorkouts.length === 0 && <div className="h-20"></div>}
                      </div>
                    </TableCell>
                  );
                })}
                <WeeklyComplianceCell week={week} plan={plan}/>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
