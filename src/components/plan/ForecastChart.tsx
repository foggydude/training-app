

"use client";

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Dot,
  ResponsiveContainer
} from 'recharts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  ChartContainer,
  ChartTooltipContent,
} from '@/components/ui/chart';
import type { Plan, Race, Forecast } from '@/lib/types';
import { format, parseISO, subWeeks } from 'date-fns';

function formatDuration(seconds: number) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.round(seconds % 60);
  return [h > 0 ? h : null, m > 9 ? m : h ? '0' + m : m || '0', s > 9 ? s : '0' + s]
    .filter(val => val !== null)
    .join(':');
}

type ChartDataPoint = Forecast & { timestamp: number };

type ForecastChartProps = {
  plan: Plan;
  race: Race;
};

export function ForecastChart({ plan, race }: ForecastChartProps) {
  const chartData = useMemo(() => {
    if (!plan?.forecasts || plan.forecasts.length === 0) {
      return { lineData: [], dotData: [] };
    }

    const allForecasts: ChartDataPoint[] = plan.forecasts.map(f => ({
      ...f,
      timestamp: parseISO(f.date).getTime(),
    }));

    const sortedForecasts = [...allForecasts].sort(
      (a, b) => a.timestamp - b.timestamp
    );

    const actualData = sortedForecasts.filter(f => f.type === 'actual');
    const projectedData = sortedForecasts.filter(f => f.type === 'projected');
    
    // Connect the last actual point to the first projected point to ensure a continuous line
    if (actualData.length > 0 && projectedData.length > 0) {
        const lastActual = actualData[actualData.length - 1];
        const firstProjected = projectedData[0];
        if (lastActual.timestamp < firstProjected.timestamp) {
            projectedData.unshift({
                ...lastActual,
                type: 'projected' // Treat it as projected for the line
            });
        }
    }

    const lineData = [...actualData, ...projectedData].sort((a,b) => a.timestamp - b.timestamp);
    const dotData = actualData;
    
    return { lineData, dotData };
  }, [plan.forecasts]);
  
  const domain = useMemo(() => {
    const allValues = chartData.lineData.map(p => p.predictedResultSec);
    if(race.goalTimeSec) allValues.push(race.goalTimeSec);
    if (allValues.length === 0) return { y: [0,0], x: [0,0] };
    
    const yMin = Math.min(...allValues);
    const yMax = Math.max(...allValues);
    const yPadding = (yMax - yMin) * 0.1 || 100;

    const xValues = chartData.lineData.map(p => p.timestamp);
    
    // Start graph 4 weeks before the first data point
    const firstDate = xValues.length > 0 ? Math.min(...xValues) : new Date().getTime();
    const xMin = subWeeks(new Date(firstDate), 4).getTime();
    const xMax = race.date ? parseISO(race.date).getTime() : Math.max(...xValues);

    return {
      y: [Math.max(0, yMin - yPadding), yMax + yPadding],
      x: [xMin, xMax],
    };
  }, [chartData.lineData, race.goalTimeSec, race.date]);


  if (chartData.lineData.length === 0) {
    return (
       <Card>
            <CardHeader>
                <CardTitle>Race Time Forecast</CardTitle>
                <CardDescription>
                Your projected progress towards your race goal.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="h-[250px] w-full flex items-center justify-center text-muted-foreground">
                    No forecast data available yet.
                </div>
            </CardContent>
        </Card>
    );
  }

  const chartConfig = {
    projected: {
      label: 'Projected Time',
      color: 'hsl(var(--chart-1))',
    },
    actual: {
      label: 'Actual Prediction',
      color: 'hsl(var(--chart-2))',
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Race Time Forecast</CardTitle>
        <CardDescription>
          Your projected progress towards your race goal.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <ResponsiveContainer>
            <AreaChart data={chartData.lineData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                dataKey="timestamp"
                tickFormatter={(value) => format(new Date(value), 'MMM d')}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval="preserveStartEnd"
                domain={domain.x as [number, number]}
                type="number"
                scale="time"
                />
                <YAxis
                tickFormatter={(value) => formatDuration(value)}
                domain={domain.y as [number, number]}
                axisLine={false}
                tickLine={false}
                width={60}
                />
                <Tooltip
                cursor={false}
                content={
                    <ChartTooltipContent
                    formatter={(value, name, props) => {
                        const pointType = props.payload.type;
                        return (
                        <div className="flex flex-col">
                            <span className="font-semibold">{formatDuration(value as number)}</span>
                            <span className="text-xs text-muted-foreground capitalize">{pointType}</span>
                        </div>
                        )
                    }}
                    labelFormatter={(label) => {
                        if (typeof label === 'number' && !isNaN(label) && label > 0) {
                        return format(new Date(label), 'eeee, MMM d');
                        }
                        return '';
                    }}
                    />
                }
                />
                <defs>
                    <linearGradient id="fillProjected" x1="0" y1="0" x2="0" y2="1">
                        <stop
                        offset="5%"
                        stopColor="var(--color-projected)"
                        stopOpacity={0.8}
                        />
                        <stop
                        offset="95%"
                        stopColor="var(--color-projected)"
                        stopOpacity={0.1}
                        />
                    </linearGradient>
                </defs>
                <Area
                data={chartData.lineData.filter(p => p.type === 'projected')}
                dataKey="predictedResultSec"
                type="monotone"
                name="projected"
                fill="url(#fillProjected)"
                stroke="var(--color-projected)"
                strokeWidth={2}
                dot={false}
                connectNulls={true}
                />
                <Area
                data={chartData.dotData}
                dataKey="predictedResultSec"
                type="monotone"
                name="actual"
                fill="transparent"
                stroke="var(--color-actual)"
                strokeWidth={2}
                dot={(props) => {
                    const { key, ...rest } = props;
                    return <Dot key={key} {...rest} r={5} fill="var(--color-actual)" stroke="var(--background)" strokeWidth={2} />
                }}
                />
                {race.goalTimeSec && (
                    <ReferenceLine
                        y={race.goalTimeSec}
                        label={{ value: "Goal", position: 'insideRight', fill: 'hsl(var(--foreground))', fontSize: 12, dy: -5 }}
                        stroke="hsl(var(--accent))"
                        strokeDasharray="3 3"
                    />
                )}
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
