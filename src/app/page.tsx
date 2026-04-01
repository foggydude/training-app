'use client';
import Link from 'next/link';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ArrowRight,
  Bike,
  Footprints,
  PlusCircle,
  Repeat,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import type { Race, HeartRateZone } from '@/lib/types';
import { useUser } from '@/firebase';
import { useRaces } from '@/hooks/use-races';
import { Skeleton } from '@/components/ui/skeleton';
import { useIntegration } from '@/hooks/use-integration';
import { FitnessChart } from '@/components/plan/FitnessChart';
import { HeartRateZoneEditor } from '@/components/plan/HeartRateZoneEditor';
import { useMemo, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { importIntervalsHistory } from '@/lib/actions';
import AppLayout from './(app)/layout';

function getSportIcon(sport: Race['sport']) {
  switch (sport) {
    case 'run':
      return <Footprints className="h-5 w-5" />;
    case 'bike':
      return <Bike className="h-5 w-5" />;
    case 'multi':
      return <Repeat className="h-5 w-5" />;
    default:
      return <Footprints className="h-5 w-5" />;
  }
}

// Helper to parse old string-based zones for backward compatibility
const parseOldZones = (zones: any[]): HeartRateZone[] => {
  if (!zones || zones.length === 0) return [];
  // Check if the first zone has min/max properties
  if (typeof zones[0].min === 'number' && typeof zones[0].max === 'number') {
    return zones as HeartRateZone[];
  }
  // Otherwise, parse from string
  return zones.map(zone => {
    const [min, max] = (zone.range || '0-0').split('-').map(Number);
    return { name: zone.name, min, max };
  });
};

function DashboardContent() {
  const { user } = useUser();
  const { races, loading: racesLoading } = useRaces();
  const { integration, loading: integrationLoading } = useIntegration(user?.id);
  const { toast } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);

  const loading = racesLoading || integrationLoading;

  const parsedHeartRateZones = useMemo(() => {
    return parseOldZones(integration?.heartRateZones || []);
  }, [integration?.heartRateZones]);

  const handleSyncHistory = async () => {
    if (!user) return;
    setIsSyncing(true);
    const result = await importIntervalsHistory({ userId: user.id });
    if (result.success) {
      toast({
        title: 'History Sync Complete',
        description: result.message || 'Your performance data has been updated.',
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'History Sync Failed',
        description: result.message || 'An unexpected error occurred.',
      });
    }
    setIsSyncing(false);
  };


  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.displayName}! Here's your overview.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
            <Button onClick={handleSyncHistory} disabled={isSyncing || !integration} variant="outline">
                <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing...' : 'Sync with ICU'}
            </Button>
            <Button asChild>
            <Link href="/races/new">
                <PlusCircle className="mr-2 h-4 w-4" />
                Create Race
            </Link>
            </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading ? (
            <Skeleton className="h-[420px] w-full" />
        ) : (
            <FitnessChart fitnessData={integration?.fitnessData} />
        )}
        {loading ? (
             <Skeleton className="h-[420px] w-full" />
        ) : (
            <HeartRateZoneEditor
              initialZones={parsedHeartRateZones}
              userId={user?.id}
            />
        )}
      </div>
      
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Your Races</h2>
        <p className="text-muted-foreground">
            Manage your upcoming events and training plans.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {loading && (
          <>
            <Card>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3 mt-2" />
              </CardContent>
              <CardFooter>
                 <Skeleton className="h-10 w-full" />
              </CardFooter>
            </Card>
             <Card>
              <CardHeader>
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3 mt-2" />
              </CardContent>
              <CardFooter>
                 <Skeleton className="h-10 w-full" />
              </CardFooter>
            </Card>
          </>
        )}
        {!loading && races.map((race) => (
          <Card key={race.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start justify-between">
                <CardTitle className="text-xl">{race.name}</CardTitle>
                <Badge
                  variant="secondary"
                  className="capitalize flex items-center gap-2"
                >
                  {getSportIcon(race.sport)}
                  {race.sport}
                </Badge>
              </div>
              <CardDescription>
                {format(new Date(race.date), 'MMMM d, yyyy')}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 space-y-2">
              <p className="text-sm">
                <strong>Distance:</strong> {race.distanceKm} km
              </p>
              {race.goalTimeSec && (
                <p className="text-sm">
                  <strong>Goal:</strong>{' '}
                  {new Date(race.goalTimeSec * 1000)
                    .toISOString()
                    .substr(11, 8)}
                </p>
              )}
            </CardContent>
            <CardFooter>
              <Button asChild variant="outline" className="w-full">
                <Link href={`/plan/${race.id}`}>
                  Open Plan <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </CardFooter>
          </Card>
        ))}
        <Card className="flex flex-col items-center justify-center border-dashed">
          <PlusCircle className="h-10 w-10 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold text-muted-foreground mb-2">
            Create a new race
          </h3>
          <Button asChild>
            <Link href="/races/new">Get Started</Link>
          </Button>
        </Card>
      </div>
    </div>
  );
}

// The dashboard is now the root of the application, and needs the AppLayout.
export default function Home() {
  return (
    <AppLayout>
      <DashboardContent />
    </AppLayout>
  );
}
