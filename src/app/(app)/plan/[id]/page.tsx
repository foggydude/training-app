'use client';

import { PlanCalendar } from '@/components/plan/PlanCalendar';
import { CalendarToolbar } from '@/components/plan/CalendarToolbar';
import { useRace } from '@/hooks/use-race';
import { usePlan } from '@/hooks/use-plan';
import { useUser } from '@/firebase';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Bot, BrainCircuit, Dumbbell, Gauge, Zap, Info, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { generateInitialPlan } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Textarea } from '@/components/ui/textarea';
import { ForecastChart } from '@/components/plan/ForecastChart';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { KpiMetric } from '@/lib/types';

const trendConfig = {
  improving: { icon: ArrowUp, color: 'text-green-500' },
  stalling: { icon: Minus, color: 'text-yellow-500' },
  decreasing: { icon: ArrowDown, color: 'text-red-500' },
};

function KpiCard({ title, metric, icon: Icon }: { title:string; metric?: KpiMetric; icon: React.ElementType }) {
  const TrendIcon = metric?.trend ? trendConfig[metric.trend].icon : null;
  const trendColor = metric?.trend ? trendConfig[metric.trend].color : '';

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="flex items-center gap-2">
          {metric?.description && (
             <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`${title} explanation`}
                    title={metric.description}
                  >
                    <Info className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs">{metric.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{metric?.value || '-'}</div>
         {TrendIcon && (
          <div className={`flex items-center text-xs ${trendColor}`}>
            <TrendIcon className="h-4 w-4 mr-1" />
            <span>{metric?.trend}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function PlanPage() {
  const params = useParams();
  const id = params.id as string;
  const { user } = useUser();
  const { race, loading: raceLoading } = useRace(id);
  const { plan, loading: planLoading } = usePlan(id);
  const { toast } = useToast();
  const [generatingModel, setGeneratingModel] = useState<'flash' | 'pro' | null>(null);
  const [additionalPrompt, setAdditionalPrompt] = useState('');

  const handleGeneratePlan = async (model: 'flash' | 'pro') => {
    if (!race) return;
    setGeneratingModel(model);
    const result = await generateInitialPlan({
      raceId: race.id,
      additionalPrompt,
      model,
    });
    if (result.success) {
      toast({
        title: 'Plan Generated!',
        description: 'Your initial training plan is ready.',
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Error Generating Plan',
        description: result.message || 'An unexpected error occurred.',
      });
    }
    setGeneratingModel(null);
  };
  
  if (raceLoading || planLoading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Skeleton className="h-9 w-64" />
            <Skeleton className="h-4 w-80 mt-2" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-10 w-28" />
            <Skeleton className="h-10 w-44" />
            <Skeleton className="h-10 w-40" />
          </div>
        </div>
        <Skeleton className="h-[350px] w-full" />
        <Skeleton className="h-[600px] w-full" />
      </div>
    );
  }

  if (!race) {
    return <div>Race not found</div>;
  }

  if (!plan) {
    return (
      <div className="text-center py-16 max-w-2xl mx-auto">
        <h2 className="text-2xl font-semibold mb-4">Generate Your Training Plan</h2>
        <p className="text-muted-foreground mb-6">
          Ready to start training for the {race.name}? You can add specific
          instructions below to customize your plan.
        </p>
        <div className="space-y-4">
          <Textarea
            value={additionalPrompt}
            onChange={(e) => setAdditionalPrompt(e.target.value)}
            placeholder="e.g., I prefer running 3 times a week, with my long run on Saturday. I also do yoga twice a week."
            className="min-h-[100px]"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              onClick={() => handleGeneratePlan('flash')}
              disabled={!!generatingModel}
              className="w-full"
            >
              <Bot className="mr-2 h-4 w-4" />
              {generatingModel === 'flash' ? 'Generating (Flash)...' : 'Generate with Flash'}
            </Button>
            <Button
              onClick={() => handleGeneratePlan('pro')}
              disabled={!!generatingModel}
              className="w-full"
              variant="secondary"
            >
              <Bot className="mr-2 h-4 w-4" />
              {generatingModel === 'pro' ? 'Generating (Pro)...' : 'Generate with Pro'}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const kpis = plan.kpis;

  return (
    <div className="space-y-6">
      <CalendarToolbar race={race} plan={plan} />
      
      <ForecastChart plan={plan} race={race} />
      
      <div className="grid gap-6 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BrainCircuit className="h-5 w-5 text-primary" />
              AI Training Philosophy
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {plan.trainingPhilosophy || 'No philosophy generated yet.'}
            </p>
          </CardContent>
        </Card>
        
        <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-6">
            <KpiCard title="VO2 Max" metric={kpis?.vo2max} icon={Zap} />
            <KpiCard title="Z2 Pace" metric={kpis?.z2Pace} icon={Gauge} />
            <KpiCard title="Training Load" metric={kpis?.trainingLoadBalance} icon={Dumbbell} />
            <KpiCard title="Running Economy" metric={kpis?.runningEconomy} icon={Dumbbell} />
        </div>
      </div>

      <PlanCalendar plan={plan} />
    </div>
  );
}
