'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { HeartPulse, Loader2 } from 'lucide-react';
import type { HeartRateZone } from '@/lib/types';
import { updateUserHrZones } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type HeartRateZoneEditorProps = {
  initialZones: HeartRateZone[];
  kpis?: { z2Pace?: string; z3Pace?: string; };
  userId?: string;
};

const zoneColors = [
  'bg-[hsl(var(--zone-1))]',
  'bg-[hsl(var(--zone-2))]',
  'bg-[hsl(var(--zone-3))]',
  'bg-[hsl(var(--zone-4))]',
  'bg-[hsl(var(--zone-5))]',
];

const parsePaceToSeconds = (pace?: string): number | null => {
  if (!pace || !pace.includes(':')) return null;
  const parts = pace.split(':');
  if (parts.length < 2) return null;
  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);
  if (isNaN(minutes) || isNaN(seconds)) return null;
  return minutes * 60 + seconds;
};

const formatPaceFromSeconds = (totalSeconds?: number | null): string => {
  if (totalSeconds === null || totalSeconds === undefined) return '-:--';
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
};

export function HeartRateZoneEditor({ initialZones, kpis, userId }: HeartRateZoneEditorProps) {
  const [zones, setZones] = useState<HeartRateZone[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (initialZones && initialZones.length > 0) {
      setZones(initialZones);
    }
  }, [initialZones]);

  const estimatedPaces = useMemo(() => {
    const z2PaceSec = parsePaceToSeconds(kpis?.z2Pace);
    const z3PaceSec = parsePaceToSeconds(kpis?.z3Pace);

    if (z2PaceSec && z3PaceSec) {
      const paceDiff = z2PaceSec - z3PaceSec;
      return [
        formatPaceFromSeconds(z2PaceSec + paceDiff), // Z1
        formatPaceFromSeconds(z2PaceSec), // Z2
        formatPaceFromSeconds(z3PaceSec), // Z3
        formatPaceFromSeconds(z3PaceSec - paceDiff), // Z4
        formatPaceFromSeconds(z3PaceSec - paceDiff * 2), // Z5
      ];
    }
    return ['-:--', '-:--', '-:--', '-:--', '-:--'];
  }, [kpis]);

  const handleBoundaryChange = (zoneIndex: number, newBoundary: number) => {
    setZones(prevZones => {
      const newZones = [...prevZones];
      // Update the max of the current zone
      newZones[zoneIndex] = { ...newZones[zoneIndex], max: newBoundary };
      // Update the min of the next zone
      if (newZones[zoneIndex + 1]) {
        newZones[zoneIndex + 1] = { ...newZones[zoneIndex + 1], min: newBoundary };
      }
      return newZones;
    });
  };
  
  const handleSave = async () => {
    if (!userId) {
      toast({ variant: 'destructive', title: 'Error', description: 'User not found.' });
      return;
    }
    setIsSaving(true);
    const result = await updateUserHrZones({ userId, zones });
    if (result.success) {
      toast({ title: 'Success', description: 'Heart rate zones updated.' });
    } else {
      toast({ variant: 'destructive', title: 'Error', description: result.message });
    }
    setIsSaving(false);
  };
  
  const handleReset = () => {
      if (initialZones && initialZones.length > 0) {
        setZones(initialZones);
        toast({ title: 'Zones Reset', description: 'Your heart rate zones have been reset to the calculated values.'})
      }
  };

  if (!zones || zones.length === 0) {
    return (
       <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-primary" />
              Heart Rate Zones
            </CardTitle>
            <CardDescription>Sync your history to calculate zones.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-muted-foreground text-center py-8 space-y-2">
              <p>No heart rate data available.</p>
              <p>To calculate your zones, please sync your Garmin wellness data to Intervals.icu, then use the <strong>Sync Performance History</strong> button on the settings page.</p>
            </div>
          </CardContent>
        </Card>
    );
  }

  const overallMin = zones[0].min;
  const overallMax = zones[zones.length - 1].max;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HeartPulse className="h-5 w-5 text-primary" />
          Heart Rate Zones
        </CardTitle>
        <CardDescription>Adjust your HR zone boundaries to match your devices.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-2">
        {/* Zone Bar */}
        <div className="flex w-full h-8 rounded-md overflow-hidden">
          {zones.map((zone, index) => (
            <div
              key={zone.name}
              className={cn('h-full', zoneColors[index])}
              style={{ flexGrow: zone.max - zone.min }}
            />
          ))}
        </div>
        {/* Zone Details & Sliders */}
        <div className="grid grid-cols-5 gap-x-2">
          {zones.map((zone, index) => (
            <div key={zone.name} className="flex flex-col items-center text-center">
              <div className="font-bold text-sm">{zone.name}</div>
              <div className="text-xs text-muted-foreground">
                {zone.min}-{zone.max}
              </div>
               <div className="text-sm font-medium mt-1">{estimatedPaces[index]}</div>
               <div className="text-xs text-muted-foreground">min/km</div>
            </div>
          ))}
        </div>
        
        <div className="space-y-4">
            {zones.slice(0, -1).map((zone, index) => (
                <div key={`slider-${index}`} className="grid grid-cols-6 items-center gap-2">
                    <div className="col-span-1 text-sm text-muted-foreground">
                       Z{index+1}/Z{index+2}
                    </div>
                    <div className="col-span-4">
                        <Slider
                            value={[zone.max]}
                            onValueChange={([val]) => handleBoundaryChange(index, val)}
                            min={zones[index].min + 1}
                            max={zones[index+1].max - 1}
                            step={1}
                        />
                    </div>
                     <div className="col-span-1">
                        <Input
                            type="number"
                            className="h-8 w-16"
                            value={zone.max}
                            onChange={(e) => handleBoundaryChange(index, parseInt(e.target.value, 10))}
                        />
                    </div>
                </div>
            ))}
        </div>
      </CardContent>
      <CardFooter className="justify-end gap-2">
        <Button variant="ghost" onClick={handleReset}>Reset</Button>
        <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Zones
        </Button>
      </CardFooter>
    </Card>
  );
}
