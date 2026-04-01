'use client';

import { useForm, useFieldArray, Controller } from 'react-hook-form';
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
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { updateWorkout } from '@/lib/actions';
import { useToast } from '@/hooks/use-toast';
import type { Workout, WorkoutStep, SingleWorkoutStep } from '@/lib/types';
import { PlusCircle, Trash2, Repeat } from 'lucide-react';
import { usePlan } from '@/hooks/use-plan';
import { useParams } from 'next/navigation';

const targetSchema = z.object({
  type: z.enum(['duration', 'distance', 'heart_rate', 'pace']),
  value: z.coerce.number(),
  unit: z.enum(['minutes', 'km', 'bpm', 'min/km', 'percent_ftp', 'watts']),
});

const singleStepSchema = z.object({
  type: z.enum([
    'warmup',
    'cooldown',
    'run',
    'recovery',
    'strength',
    'other',
  ]),
  description: z.string(),
  targets: z.array(targetSchema),
});

const repeatStepSchema = z.object({
    type: z.literal('repeat'),
    repetitions: z.coerce.number().int().min(1),
    steps: z.array(singleStepSchema),
})

const stepSchema = z.union([singleStepSchema, repeatStepSchema]);


const workoutFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string(),
  goal: z.string().optional(),
  steps: z.array(stepSchema),
});

type WorkoutFormValues = z.infer<typeof workoutFormSchema>;

type WorkoutFormProps = {
  workout: Workout;
  onSave: () => void;
};

export function WorkoutForm({ workout, onSave }: WorkoutFormProps) {
  const { toast } = useToast();
  const params = useParams();
  const raceId = params.id as string;
  const { plan } = usePlan(raceId);

  const form = useForm<WorkoutFormValues>({
    resolver: zodResolver(workoutFormSchema),
    defaultValues: {
      title: workout.title,
      description: workout.description,
      goal: workout.goal || '',
      steps: workout.steps || [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'steps',
  });

  const onSubmit = async (data: WorkoutFormValues) => {
    if (!plan) {
        toast({ variant: 'destructive', title: 'Error', description: 'Plan not found.' });
        return;
    }
    const result = await updateWorkout({
      planId: plan.id,
      weekId: workout.weekId,
      workoutId: workout.id,
      workoutData: { ...workout, ...data, raceId: plan.raceId },
    });

    if (result.success) {
      toast({ title: 'Workout Saved', description: 'Your changes have been saved.' });
      onSave();
    } else {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: result.message || 'Could not save workout.',
      });
    }
  };
  
  const addStep = (type: SingleWorkoutStep['type']) => {
    append({ type, description: '', targets: [] });
  }
  
  const addRepeatBlock = () => {
    append({ type: 'repeat', repetitions: 2, steps: [{type: 'run', description: '', targets: []}, {type: 'recovery', description: '', targets: []}] })
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <FormField
          control={form.control}
          name="goal"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Workout Goal</FormLabel>
              <FormControl>
                <Textarea {...field} rows={2} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div>
          <h3 className="text-lg font-medium mb-2">Workout Structure</h3>
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="p-4 border rounded-md bg-muted/50 relative">
                 <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-1 right-1 h-7 w-7"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                    <span className="sr-only">Remove Step</span>
                  </Button>
                
                {field.type === 'repeat' ? (
                    <RepeatBlock control={form.control} parentIndex={index} />
                ) : (
                    <SingleStep control={form.control} index={index} />
                )}
              </div>
            ))}
            <div className="flex gap-2">
                <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => addStep('run')}
                >
                <PlusCircle className="mr-2 h-4 w-4" /> Add Step
                </Button>
                <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addRepeatBlock}
                >
                <Repeat className="mr-2 h-4 w-4" /> Add Repetitions
                </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2">
           <Button type="button" variant="ghost" onClick={onSave}>Cancel</Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function SingleStep({ control, index }: { control: any; index: number }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormField
        control={control}
        name={`steps.${index}.type`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Step Type</FormLabel>
            <Select onValueChange={field.onChange} defaultValue={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value="warmup">Warmup</SelectItem>
                <SelectItem value="run">Run</SelectItem>
                <SelectItem value="recovery">Recovery</SelectItem>
                <SelectItem value="cooldown">Cooldown</SelectItem>
                <SelectItem value="strength">Strength</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={`steps.${index}.description`}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Description</FormLabel>
            <FormControl>
              <Input {...field} placeholder="e.g. Z2 pace" />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

function RepeatBlock({ control, parentIndex }: { control: any, parentIndex: number }) {
    const { fields, append, remove } = useFieldArray({
        control,
        name: `steps.${parentIndex}.steps`,
    });

    return (
        <div className="space-y-4">
            <FormField
                control={control}
                name={`steps.${parentIndex}.repetitions`}
                render={({ field }) => (
                    <FormItem className="max-w-[120px]">
                        <FormLabel>Repetitions</FormLabel>
                        <FormControl>
                        <Input type="number" {...field} />
                        </FormControl>
                        <FormMessage />
                    </FormItem>
                )}
            />
            <div className="pl-4 border-l-2 border-primary/50 space-y-3">
                 {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-2 gap-x-4 gap-y-2 relative pr-8">
                       <FormField
                            control={control}
                            name={`steps.${parentIndex}.steps.${index}.type`}
                            render={({ field: stepField }) => (
                                <FormItem>
                                <FormLabel className="text-xs">Type</FormLabel>
                                <Select onValueChange={stepField.onChange} defaultValue={stepField.value}>
                                    <FormControl>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                        <SelectItem value="run">Run</SelectItem>
                                        <SelectItem value="recovery">Recovery</SelectItem>
                                    </SelectContent>
                                </Select>
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={control}
                            name={`steps.${parentIndex}.steps.${index}.description`}
                            render={({ field: stepField }) => (
                                <FormItem>
                                <FormLabel className="text-xs">Description</FormLabel>
                                <FormControl>
                                    <Input {...stepField} placeholder="e.g. Threshold pace" />
                                </FormControl>
                                </FormItem>
                            )}
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute top-0 right-0 h-7 w-7"
                            onClick={() => remove(index)}
                        >
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                    </div>
                 ))}
                 <Button type="button" size="sm" variant="ghost" onClick={() => append({ type: 'run', description: '', targets: []})}>
                    <PlusCircle className="mr-2 h-4 w-4" /> Add to block
                 </Button>
            </div>
        </div>
    )
}
