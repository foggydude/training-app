
'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
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
import type { FitnessDataPoint } from '@/lib/types';
import { format, parseISO } from 'date-fns';

type FitnessChartProps = {
  fitnessData?: FitnessDataPoint[];
};

export function FitnessChart({ fitnessData }: FitnessChartProps) {
  const chartData = useMemo(() => {
    if (!fitnessData || fitnessData.length === 0) return [];
    return fitnessData
      .map(d => ({ ...d, timestamp: parseISO(d.date).getTime() }))
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [fitnessData]);

  // FIX: Moved this hook before the conditional return to respect Rules of Hooks.
  const yDomain = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      // Provide a sensible default domain if there's no data
      return [0, 50];
    }
    const allValues = chartData.flatMap(d => [d.ctl, d.atl, d.tsb]);
    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.1 || 10; // Use a fallback padding if min === max
    return [Math.floor(min - padding), Math.ceil(max + padding)];
  }, [chartData]);

  if (!chartData || chartData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Fitness & Fatigue</CardTitle>
          <CardDescription>
            Your training load, fatigue, and form over time.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px] w-full flex items-center justify-center text-muted-foreground">
            No fitness data available. Sync your history in settings.
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartConfig = {
    ctl: {
      label: 'Fitness (CTL)',
      color: 'hsl(var(--chart-1))',
    },
    atl: {
      label: 'Fatigue (ATL)',
      color: 'hsl(var(--chart-2))',
    },
    tsb: {
      label: 'Form (TSB)',
      color: 'hsl(var(--chart-3))',
    },
  };
  

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fitness & Fatigue (CTL/ATL)</CardTitle>
        <CardDescription>
          Your training load, fatigue, and form over time.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px] w-full">
          <ResponsiveContainer>
            <AreaChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="timestamp"
                tickFormatter={(value) => format(new Date(value), 'MMM d')}
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
              />
              <YAxis domain={yDomain} tickLine={false} axisLine={false} />
              <Tooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(label) => {
                      if (typeof label === 'number' && !isNaN(label) && label > 0) {
                        return format(new Date(label), 'eeee, MMM d');
                      }
                      return '';
                    }}
                    formatter={(value, name) => (
                      <div className="flex items-center gap-2">
                         <div className="w-2.5 h-2.5 rounded-full" style={{backgroundColor: `var(--color-${name})`}} />
                         <span className="capitalize">{chartConfig[name as keyof typeof chartConfig]?.label || name}</span>
                         <span className="ml-auto font-bold">{Math.round(value as number)}</span>
                      </div>
                    )}
                  />
                }
              />

              {/* Form Zones */}
              <ReferenceArea y1={-30} y2={-10} fill="green" fillOpacity={0.1} label={{ value: 'Optimal', position: 'insideRight', fill: 'rgba(0,0,0,0.4)', fontSize: 10, dy: 10 }} />
              <ReferenceArea y1={5} y2={25} fill="blue" fillOpacity={0.1} label={{ value: 'Fresh', position: 'insideRight', fill: 'rgba(0,0,0,0.4)', fontSize: 10, dy: 10 }}/>
              <ReferenceArea y1={-100} y2={-30} fill="red" fillOpacity={0.1} label={{ value: 'High Risk', position: 'insideRight', fill: 'rgba(0,0,0,0.4)', fontSize: 10, dy: 10 }} />
              
              <defs>
                  <linearGradient id="fillCtl" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-ctl)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--color-ctl)" stopOpacity={0.1} />
                  </linearGradient>
              </defs>

              <Area
                dataKey="ctl"
                type="monotone"
                fill="url(#fillCtl)"
                stroke="var(--color-ctl)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="atl"
                type="monotone"
                stroke="var(--color-atl)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                dataKey="tsb"
                type="monotone"
                stroke="var(--color-tsb)"
                strokeWidth={2}
                dot={false}
              />

            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
