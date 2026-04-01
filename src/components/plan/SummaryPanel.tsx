import type { Plan } from "@/lib/types";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bot, Target, TrendingUp, ClipboardCheck } from "lucide-react";

type SummaryPanelProps = {
  plan: Plan;
  children: React.ReactNode;
};

const confidenceColors = {
    low: "bg-red-500",
    med: "bg-yellow-500",
    high: "bg-green-500"
}

export function SummaryPanel({ plan, children }: SummaryPanelProps) {
  const week = plan.weeks[0]; // Assuming we're showing the first week's summary for now
  if (!week || !week.summary || !week.forecast) return <>{children}</>;

  const { summary, forecast } = week;

  return (
    <Sheet>
      <SheetTrigger asChild>{children}</SheetTrigger>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Weekly Summary & Forecast</SheetTitle>
          <SheetDescription>
            An overview of your last week and what it means for your goal.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-6 py-6">
          <div className="space-y-4">
            <h3 className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-5 w-5 text-primary"/>Compliance & Load</h3>
             <div className="space-y-1">
                <div className="flex justify-between text-sm">
                    <span>Compliance</span>
                    <span className="font-medium">{(summary.complianceScore * 100).toFixed(0)}%</span>
                </div>
                <Progress value={summary.complianceScore * 100} />
             </div>
             <div className="space-y-1">
                <p className="text-sm">Training Load</p>
                <div className="text-xs text-muted-foreground">
                    Planned: {summary.plannedLoad} vs Completed: {summary.completedLoad}
                </div>
             </div>
          </div>
          <Separator />
           <div className="space-y-4">
            <h3 className="flex items-center gap-2 font-semibold"><Target className="h-5 w-5 text-primary"/>Race Forecast</h3>
            <div className="text-center">
                <p className="text-muted-foreground">Predicted Finish Time</p>
                <p className="text-4xl font-bold tracking-tighter">
                    {new Date(forecast.predictedResultSec * 1000).toISOString().substr(11, 8)}
                </p>
                <Badge variant="secondary" className="mt-1">
                    {forecast.deltaVsGoalSec >= 0 ? "+" : "-"}
                    {new Date(Math.abs(forecast.deltaVsGoalSec) * 1000).toISOString().substr(14, 5)} vs Goal
                </Badge>
            </div>
            <div className="flex items-center gap-2">
                <span className="text-sm">Confidence:</span>
                <div className="flex items-center gap-1">
                    <div className={cn("h-3 w-3 rounded-full", confidenceColors[forecast.confidence])}></div>
                    <span className="text-sm font-medium capitalize">{forecast.confidence}</span>
                </div>
            </div>
          </div>
          <Separator />
           <div className="space-y-4">
             <h3 className="flex items-center gap-2 font-semibold"><Bot className="h-5 w-5 text-primary"/>AI Analysis</h3>
              <p className="text-sm text-muted-foreground bg-secondary p-4 rounded-lg">
                {forecast.explanation}
              </p>
          </div>

        </div>
      </SheetContent>
    </Sheet>
  );
}
