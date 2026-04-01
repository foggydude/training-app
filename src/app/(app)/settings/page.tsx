
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { useIntegration } from '@/hooks/use-integration';
import { useEffect, useState, useCallback, useRef } from 'react';
import { verifyIntervalsIcu, importIntervalsHistory, wipeIntervalsHistory, uploadGarminCsv } from '@/lib/actions';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Loader2, RefreshCw, Eye, EyeOff, Trash2, AlertTriangle, UploadCloud } from 'lucide-react';
import { format as formatDate, formatDistanceToNow, parseISO } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { SyncedActivity } from '@/lib/types';
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
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ScrollArea } from '@/components/ui/scroll-area';

const settingsFormSchema = z.object({
  apiKey: z.string().min(1, 'API Key is required.'),
  intervalsId: z
    .string()
    .min(1, 'Intervals.icu User ID is required.')
    .regex(/^i\d+$/, 'User ID must start with "i" followed by numbers (e.g., i12345).'),
});

type SettingsFormValues = z.infer<typeof settingsFormSchema>;
type ConnectionStatus = 'idle' | 'verifying' | 'connected' | 'error';


export default function SettingsPage() {
  const { user } = useUser();
  const { integration, setIntegration, loading: integrationLoading } = useIntegration(user?.id);
  const { toast } = useToast();
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('idle');
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isWiping, setIsWiping] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [syncLogDetails, setSyncLogDetails] = useState<{ apiUrl: string; rawJson: any } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<SettingsFormValues>({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: {
      apiKey: '',
      intervalsId: '',
    },
  });

  const handleVerifyConnection = useCallback(async (apiKey: string, intervalsId: string) => {
    if (!apiKey || !intervalsId) {
      setConnectionStatus('idle');
      return;
    }
    setConnectionStatus('verifying');
    setConnectionError(null);
    const result = await verifyIntervalsIcu({ apiKey, intervalsId });
    if (result.success) {
      setConnectionStatus('connected');
    } else {
      setConnectionStatus('error');
      setConnectionError(result.message);
    }
  }, []);

  useEffect(() => {
    if (integration) {
      const { apiKey, intervalsId } = integration;
      form.reset({ apiKey: apiKey, intervalsId: intervalsId || '' });
      if (apiKey && intervalsId) {
        handleVerifyConnection(apiKey, intervalsId);
      }
    }
  }, [integration, form, handleVerifyConnection]);

  async function onSubmit(data: SettingsFormValues) {
    if (!user) return;
    setConnectionError(null);
    try {
      await setIntegration({
        userId: user.id,
        provider: 'intervalsIcu',
        apiKey: data.apiKey,
        intervalsId: data.intervalsId,
      });
      toast({
        title: 'Settings Saved',
        description: 'Your Intervals.icu credentials have been updated.',
      });
      handleVerifyConnection(data.apiKey, data.intervalsId);
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Error Saving Settings',
        description: error.message || 'An unexpected error occurred. Please try again.',
      });
      console.error(error);
      setConnectionStatus('error');
      setConnectionError(error.message || 'An unexpected error occurred saving settings.');
    }
  }

  const handleSyncHistory = async () => {
    if (!user) return;
    setIsSyncing(true);
    setSyncLogDetails(null);
    const result = await importIntervalsHistory({ userId: user.id });
    if (result.success) {
      toast({
        title: 'History Sync Complete',
        description: result.message || 'Your performance data has been updated.',
      });
       if ('apiUrl' in result && 'rawJson' in result) {
         setSyncLogDetails({ apiUrl: result.apiUrl as string, rawJson: result.rawJson as any });
      }
    } else {
      toast({
        variant: 'destructive',
        title: 'History Sync Failed',
        description: result.message || 'An unexpected error occurred.',
      });
    }
    setIsSyncing(false);
  };
  
  const handleWipeHistory = async () => {
    if (!user) return;
    setIsWiping(true);
    const result = await wipeIntervalsHistory({ userId: user.id });
    if (result.success) {
      toast({
        title: 'History Wiped',
        description: 'Your synced data has been cleared.',
      });
    } else {
      toast({
        variant: 'destructive',
        title: 'Wipe Failed',
        description: result.message || 'An unexpected error occurred.',
      });
    }
    setIsWiping(false);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!user || !event.target.files || event.target.files.length === 0) {
      return;
    }
    const file = event.target.files[0];
    // Loosen the check to rely on file extension, as MIME types can be unreliable.
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({ variant: 'destructive', title: 'Invalid File Type', description: 'Please upload a CSV file.' });
      return;
    }
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvContent = e.target?.result as string;
      const result = await uploadGarminCsv({ userId: user.id, csvContent });

      if (result.success) {
        toast({
          title: 'Upload Successful',
          description: result.message || 'Garmin activities have been merged.',
        });
      } else {
        toast({
          variant: 'destructive',
          title: 'Upload Failed',
          description: result.message || 'An unexpected error occurred.',
        });
      }
      setIsUploading(false);
    };
    reader.readAsText(file);
     // Reset file input
    if(fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const StatusIndicator = () => {
    switch (connectionStatus) {
        case 'verifying':
            return <Badge variant="secondary"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying...</Badge>;
        case 'connected':
            return <Badge variant="default" className="bg-green-500 hover:bg-green-500"><CheckCircle className="mr-2 h-4 w-4" />Connected</Badge>;
        case 'error':
            return <Badge variant="destructive"><XCircle className="mr-2 h-4 w-4" />Connection Failed</Badge>;
        default:
            return <Badge variant="outline">Not Connected</Badge>;
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">
          Manage your integrations and preferences.
        </p>
      </div>

      <Card className="max-w-4xl">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
                <CardTitle>Intervals.icu Integration</CardTitle>
                <CardDescription className="mt-1">
                    Connect your account to sync activities and get personalized plans.
                </CardDescription>
            </div>
            <StatusIndicator />
          </div>
        </CardHeader>
        <CardContent>
            <Alert className="mb-6">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Strava Sync Limitation</AlertTitle>
                <AlertDescription>
                    Please note: The Intervals.icu API does not provide data for activities synced from Strava. For a complete history, please connect your Garmin, Wahoo, or other devices directly to Intervals.icu.
                </AlertDescription>
            </Alert>

            {connectionStatus === 'error' && connectionError && (
                <Alert variant="destructive" className="mb-6">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>Connection Failed</AlertTitle>
                    <AlertDescription>{connectionError}</AlertDescription>
                </Alert>
            )}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <FormField
                    control={form.control}
                    name="intervalsId"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>Intervals.icu User ID</FormLabel>
                        <FormControl>
                        <Input
                            placeholder="e.g., i12345"
                            {...field}
                        />
                        </FormControl>
                        <FormDescription>
                            Found in your browser's address bar (e.g., intervals.icu/athlete/i12345).
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
                <FormField
                    control={form.control}
                    name="apiKey"
                    render={({ field }) => (
                    <FormItem>
                        <FormLabel>API Key</FormLabel>
                        <div className="relative">
                            <FormControl>
                            <Input
                                placeholder="Enter your Intervals.icu API Key"
                                {...field}
                                type={showApiKey ? 'text' : 'password'}
                                className="pr-10"
                            />
                            </FormControl>
                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="absolute inset-y-0 right-0 h-auto w-auto px-3 text-muted-foreground hover:text-foreground"
                                onClick={() => setShowApiKey(!showApiKey)}
                                aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                            >
                                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </Button>
                        </div>
                        <FormDescription>
                        Find this on your Intervals.icu settings page. It is stored securely.
                        </FormDescription>
                        <FormMessage />
                    </FormItem>
                    )}
                />
              </div>
              <Button type="submit" disabled={integrationLoading || form.formState.isSubmitting || connectionStatus === 'verifying'}>
                {(integrationLoading || form.formState.isSubmitting) ? 'Saving...' : 'Save & Verify Connection'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
      
      <Card className="max-w-4xl">
        <CardHeader>
            <CardTitle>Historical Data Management</CardTitle>
            <CardDescription>
                Sync your past performance data from Intervals.icu or upload it from a Garmin CSV file.
            </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                    <h4 className="font-medium">Sync with Intervals.icu</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                        {integration?.lastHistorySyncAt 
                            ? `Last synced: ${formatDistanceToNow(new Date(integration.lastHistorySyncAt), { addSuffix: true })}`
                            : "No history has been synced yet."}
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button onClick={handleSyncHistory} disabled={isSyncing || connectionStatus !== 'connected'}>
                        <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                        {isSyncing ? 'Syncing...' : 'Sync Performance History'}
                    </Button>
                </div>
            </div>
            
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4">
                <div>
                    <h4 className="font-medium">Upload Garmin History</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                       Upload a CSV export from Garmin Connect to fill in missing activities.
                    </p>
                </div>
                <div className="flex gap-2">
                    <Input
                        type="file"
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="hidden"
                        ref={fileInputRef}
                        disabled={isUploading}
                    />
                    <Button onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
                        <UploadCloud className={`mr-2 h-4 w-4 ${isUploading ? 'animate-spin' : ''}`} />
                         {isUploading ? 'Uploading...' : 'Upload & Merge CSV'}
                    </Button>
                </div>
            </div>
            
             <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-destructive/50 p-4">
                <div>
                    <h4 className="font-medium text-destructive">Wipe Synced History</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                       Permanently delete all synced performance data. This cannot be undone.
                    </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={isWiping || !integration?.lastHistorySyncAt}>
                      <Trash2 className="mr-2 h-4 w-4" />
                      Wipe All Synced Data
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all synced performance data from your profile, including from Intervals.icu and any Garmin uploads. You can re-sync it again later.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleWipeHistory} disabled={isWiping}>
                        {isWiping ? 'Wiping...' : 'Yes, Wipe Data'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
            </div>
        </CardContent>
        {syncLogDetails && (
          <>
            <Separator />
            <CardHeader>
              <CardTitle>Sync Debug Log</CardTitle>
              <CardDescription>
                Detailed information about the last sync operation.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="api-call">
                  <AccordionTrigger>API Call Details</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm text-muted-foreground mb-2">The exact URL used to request data from Intervals.icu:</p>
                    <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto"><code>{syncLogDetails.apiUrl}</code></pre>
                  </AccordionContent>
                </AccordionItem>
                <AccordionItem value="raw-json">
                  <AccordionTrigger>Raw JSON Response</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm text-muted-foreground mb-2">The full, unedited JSON data returned by the API.</p>
                    <ScrollArea className="h-72 w-full rounded-md border p-4">
                      <pre className="text-xs"><code>{syncLogDetails.rawJson ? JSON.stringify(syncLogDetails.rawJson, null, 2) : "No data returned from API."}</code></pre>
                    </ScrollArea>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </>
        )}
        {(integration?.recentActivities && integration.recentActivities.length > 0) && (
            <>
                <Separator />
                <CardHeader>
                    <CardTitle>Extracted Entries</CardTitle>
                    <CardDescription>
                        A summary of the activities extracted from the sync data.
                    </CardDescription>
                </CardHeader>
                <CardContent className="max-h-96 overflow-y-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>Title</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Duration</TableHead>
                                <TableHead>Distance</TableHead>
                                <TableHead>Avg HR</TableHead>
                                <TableHead>Avg Speed</TableHead>
                                <TableHead className="text-right">Elevation</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {integration.recentActivities.map((activity, index) => (
                                <TableRow key={index}>
                                    <TableCell>{activity.date ? formatDate(parseISO(activity.date), 'MMM d, yyyy') : '-'}</TableCell>
                                    <TableCell className="max-w-xs truncate">{activity.title}</TableCell>
                                    <TableCell className="capitalize">{activity.type}</TableCell>
                                    <TableCell>
                                        <Badge variant={activity.status === 'Completed' ? 'default' : 'secondary'} className={activity.status === 'Completed' ? 'bg-green-600 hover:bg-green-600' : ''}>
                                            {activity.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{activity.durationMin ? `${activity.durationMin} min` : '-'}</TableCell>
                                    <TableCell>{activity.distanceKm ? `${activity.distanceKm} km` : '-'}</TableCell>
                                    <TableCell>{activity.averageHr || '-'}</TableCell>
                                    <TableCell>{activity.averageSpeedKmh ? `${activity.averageSpeedKmh} km/h` : '-'}</TableCell>
                                    <TableCell className="text-right">{activity.elevationGain ? `${activity.elevationGain} m` : '-'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </>
        )}
      </Card>
    </div>
  );
}
