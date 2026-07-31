import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useDemo } from "@/lib/demo-store";

const STEPS = [
  {
    title: "1. Business overview",
    to: "/",
    body: "Start with today's schedule, live revenue and the tasks that need attention this morning.",
  },
  {
    title: "2. Calendar and bookings",
    to: "/calendar",
    body: "Show the weekly schedule, filter by trainer and open a session to reschedule, cancel or mark attendance.",
  },
  {
    title: "3. Client profile",
    to: "/clients",
    body: "Walk through James Wilson: bookings, package credits, payment history and internal notes.",
  },
  {
    title: "4. Packages and credits",
    to: "/packages",
    body: "Explain how packages convert to credits and how the ledger keeps every balance change transparent.",
  },
  {
    title: "5. Stripe payments",
    to: "/payments",
    body: "Show gross and net revenue, a failed payment, and issue a refund with manual confirmation.",
  },
  {
    title: "6. Reports",
    to: "/reports",
    body: "Revenue by service, trainer and location, plus attendance, retention and occupancy.",
  },
  {
    title: "7. Customer booking experience",
    to: "/book",
    body: "Switch to the client-facing journey: choose a service, trainer and time, then pay or use a credit.",
  },
  {
    title: "8. Multi-business platform",
    to: "/platform",
    body: "Finish on the platform owner view — RECAVO running tutors, beauty, therapy and coaching businesses.",
  },
] as const;

export function DemoTour({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const demo = useDemo();
  const [step, setStep] = useState(0);
  const current = STEPS[step];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogDescription className="text-xs font-medium tracking-wide text-primary uppercase">
            Presentation mode · step {step + 1} of {STEPS.length}
          </DialogDescription>
          <DialogTitle className="text-xl">{current.title}</DialogTitle>
          <DialogDescription>{current.body}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <button
              key={s.title}
              aria-label={s.title}
              onClick={() => setStep(i)}
              className={`h-1.5 flex-1 rounded-full transition-colors ${
                i <= step ? "bg-primary" : "bg-border"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={() => demo.resetDemo()}>
            <RotateCcw className="size-4" /> Reset demo data
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={step === 0}
              onClick={() => setStep((s) => Math.max(0, s - 1))}
            >
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button asChild onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
              <Link to={current.to}>
                Go to step <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
