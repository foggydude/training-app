import { RaceForm } from "@/components/races/RaceForm";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function NewRacePage() {
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle>Create a New Race</CardTitle>
          <CardDescription>
            Fill in the details for your next event. This will be used to
            generate your training plan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RaceForm />
        </CardContent>
      </Card>
    </div>
  );
}
