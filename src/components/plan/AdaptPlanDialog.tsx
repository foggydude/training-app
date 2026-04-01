
'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Wand2 } from 'lucide-react';
import type { Plan } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';

type AdaptPlanDialogProps = {
  plan: Plan;
};

export function AdaptPlanDialog({ plan }: AdaptPlanDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [isAdapting, setIsAdapting] = useState(false);
  const { toast } = useToast();

  const handleAdaptPlan = async () => {
    setIsAdapting(true);
    // TODO: Implement the actual server action to adapt the plan
    console.log(`Adapting plan ${plan.id} with prompt: ${prompt}`);
    await new Promise((res) => setTimeout(res, 1500));
    
    toast({
      title: 'Plan Adapted (Simulation)',
      description: 'Your training plan has been updated based on your request.',
    });
    
    setIsAdapting(false);
    setIsOpen(false);
    setPrompt('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Wand2 className="mr-2 h-4 w-4" />
          Adapt Plan
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adapt Your Training Plan</DialogTitle>
          <DialogDescription>
            Use AI to make adjustments to your plan. Describe the changes you
            want to make. For example: "I feel tired, make next week an easy
            recovery week" or "I have a business trip, remove all workouts from
            Wednesday to Friday".
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="e.g., Make next week a recovery week..."
            className="min-h-[120px]"
          />
        </div>
        <DialogFooter>
          <Button
            onClick={handleAdaptPlan}
            disabled={isAdapting || !prompt}
          >
            {isAdapting ? 'Adapting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
