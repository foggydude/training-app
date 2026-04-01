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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { Textarea } from '@/components/ui/textarea';
import { createRace } from '@/lib/actions';
import { useUser } from '@/firebase';
import { useToast } from '@/hooks/use-toast';
import { useRouter } from 'next/navigation';

const daysOfWeek = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

const raceFormSchema = z.object({
  name: z.string().min(2, 'Race name must be at least 2 characters.'),
  sport: z.enum(['run', 'bike', 'multi']),
  date: z.date({
    required_error: 'A date for the race is required.',
  }),
  distanceKm: z.coerce.number().positive('Distance must be a positive number.'),
  goalTime: z.string().optional(),
  notes: z.string().optional(),
  runsPerWeek: z.coerce.number().int().min(0).max(7),
  bikesPerWeek: z.coerce.number().int().min(0).max(7),
  strengthPerWeek: z.coerce.number().int().min(0).max(7),
  maxWeekdayDurationMin: z.coerce.number().int().positive(),
  longRunDay: z.enum(daysOfWeek),
  preferredDays: z.array(z.enum(daysOfWeek)).optional(),
});

type RaceFormValues = z.infer<typeof raceFormSchema>;

export function RaceForm() {
  const { user } = useUser();
  const { toast } = useToast();
  const router = useRouter();

  const form = useForm<RaceFormValues>({
    resolver: zodResolver(raceFormSchema),
    defaultValues: {
      name: '',
      sport: 'run',
      distanceKm: 0,
      goalTime: '',
      notes: '',
      runsPerWeek: 3,
      bikesPerWeek: 0,
      strengthPerWeek: 1,
      maxWeekdayDurationMin: 60,
      longRunDay: 'Sunday',
      preferredDays: ['Tuesday', 'Thursday', 'Sunday'],
    },
  });

  async function onSubmit(data: RaceFormValues) {
    if (!user) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'You must be logged in to create a race.',
      });
      return;
    }
    const result = await createRace({ ...data, userId: user.id });
    if (result.success) {
      toast({
        title: 'Race Created',
        description: `${data.name} has been saved.`,
      });
      router.push('/');
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: result.message || 'Could not create race.',
      });
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-8"
      >
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Race Name</FormLabel>
                <FormControl>
                  <Input placeholder="e.g., Berlin Marathon" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="sport"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sport</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a sport" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="run">Running</SelectItem>
                      <SelectItem value="bike">Cycling</SelectItem>
                      <SelectItem value="multi">Multi-sport</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem className="flex flex-col">
                  <FormLabel>Race Date</FormLabel>
                  <Popover>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant={'outline'}
                          className={cn(
                            'pl-3 text-left font-normal',
                            !field.value && 'text-muted-foreground'
                          )}
                        >
                          {field.value ? (
                            format(field.value, 'PPP')
                          ) : (
                            <span>Pick a date</span>
                          )}
                          <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={field.value}
                        onSelect={field.onChange}
                        disabled={(date) => date < new Date()}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="distanceKm"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Distance (km)</FormLabel>
                  <FormControl>
                    <Input type="number" placeholder="42.2" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="goalTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Goal Time (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="HH:MM:SS, e.g., 03:00:00"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter your target finish time.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes (Optional)</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Any extra details about your goal..."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-medium">Training Constraints</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="runsPerWeek"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Runs per week</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="bikesPerWeek"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Bikes per week</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="strengthPerWeek"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Strength per week</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="maxWeekdayDurationMin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Max Weekday Workout (min)</FormLabel>
                  <FormControl>
                    <Input type="number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="longRunDay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Long Run Day</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    defaultValue={field.value}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {daysOfWeek.map((day) => (
                        <SelectItem key={day} value={day}>
                          {day}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <FormField
            control={form.control}
            name="preferredDays"
            render={() => (
              <FormItem>
                <div className="mb-4">
                  <FormLabel>Preferred Training Days</FormLabel>
                  <FormDescription>
                    Select the days you want to train. The AI will schedule workouts on these days.
                  </FormDescription>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {daysOfWeek.map((day) => (
                    <FormField
                      key={day}
                      control={form.control}
                      name="preferredDays"
                      render={({ field }) => {
                        return (
                          <FormItem
                            key={day}
                            className="flex flex-row items-center space-x-3 space-y-0"
                          >
                            <FormControl>
                              <Checkbox
                                checked={field.value?.includes(day)}
                                onCheckedChange={(checked) => {
                                  return checked
                                    ? field.onChange([...(field.value || []), day])
                                    : field.onChange(
                                        field.value?.filter(
                                          (value) => value !== day
                                        )
                                      );
                                }}
                              />
                            </FormControl>
                            <FormLabel className="font-normal">
                              {day}
                            </FormLabel>
                          </FormItem>
                        );
                      }}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Creating...' : 'Create Race Plan'}
        </Button>
      </form>
    </Form>
  );
}
