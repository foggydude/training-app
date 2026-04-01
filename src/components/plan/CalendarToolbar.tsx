
"use client";

import type { Race, Plan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Bot, RefreshCw, Trash, History } from "lucide-react";
import { generateNextWeek, resetPlan, syncDetailedActivities, resyncAllWorkoutsInPlan } from "@/lib/actions";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdaptPlanDialog } from "./AdaptPlanDialog";

type CalendarToolbarProps = {
  race: Race;
  plan: Plan;
};

export function CalendarToolbar({ race, plan }: CalendarToolbarProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isResyncing, setIsResyncing] = useState(false);

  const handleGenerateNextWeek = async () => {
    setIsGenerating(true);
    const result = await generateNextWeek({ planId: plan.id });
    if (result.success) {
      toast({
        title: "Next Week Adapted!",
        description: result.message || "Your training plan has been updated for the upcoming week.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Error Generating Next Week",
        description: result.message || "An unexpected error occurred.",
      });
    }
    setIsGenerating(false);
  };
  
  const handleResetPlan = async () => {
    setIsResetting(true);
    const result = await resetPlan({ planId: plan.id, raceId: race.id });
     if (result.success) {
      toast({
        title: "Plan Reset",
        description: "Your training plan has been deleted. You can now generate a new one.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Error Resetting Plan",
        description: result.message || "An unexpected error occurred.",
      });
    }
    setIsResetting(false);
  }

  const handleLinkNewActivities = async () => {
    setIsSyncing(true);
    const result = await syncDetailedActivities({ planId: plan.id, raceId: race.id });
    if (result.success) {
      toast({
        title: "Sync Complete",
        description: result.message || "Your detailed activities have been synced.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Sync Error",
        description: result.message || "An unexpected error occurred.",
      });
    }
    setIsSyncing(false);
  };

  const handleResyncAll = async () => {
    setIsResyncing(true);
    const result = await resyncAllWorkoutsInPlan({ planId: plan.id, raceId: race.id });
    if (result.success) {
      toast({
        title: "Re-analysis Complete",
        description: result.message,
      });
    } else {
      toast({
        variant: "destructive",
        title: "Re-analysis Failed",
        description: result.message || "An unexpected error occurred.",
      });
    }
    setIsResyncing(false);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{race.name} Plan</h1>
        <p className="text-muted-foreground">
          Your adaptive training journey to race day.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={handleLinkNewActivities} disabled={isSyncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Linking...' : 'Link New Activities'}
        </Button>
        <Button variant="outline" onClick={handleResyncAll} disabled={isResyncing}>
          <History className={`mr-2 h-4 w-4 ${isResyncing ? 'animate-spin' : ''}`} />
          {isResyncing ? 'Re-analyzing...' : 'Re-analyze All'}
        </Button>
        <AdaptPlanDialog plan={plan} />
        <Button onClick={handleGenerateNextWeek} disabled={isGenerating}>
          <Bot className="mr-2 h-4 w-4" />
          {isGenerating ? "Generating..." : "Generate Next Week"}
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="icon">
              <Trash className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This action will permanently delete your entire training plan. You will be able to generate a new one.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleResetPlan} disabled={isResetting}>
                {isResetting ? 'Resetting...' : 'Reset Plan'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
