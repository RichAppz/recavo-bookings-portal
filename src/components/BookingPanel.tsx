import { useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Ban,
  CalendarClock,
  CheckCircle2,
  MessageSquare,
  Receipt,
  UserX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PersonAvatar, StatusBadge } from "@/components/ui-bits";
import { useDemo } from "@/lib/demo-store";
import { endTime, gbp, ukDateFull } from "@/lib/format";
import type { Booking } from "@/lib/demo-data";
import { cn } from "@/lib/utils";

export function BookingPanel({
  booking,
  onClose,
}: {
  booking: Booking | null;
  onClose: () => void;
}) {
  const demo = useDemo();
  const [confirm, setConfirm] = useState<null | "cancel" | "refund">(null);
  const [note, setNote] = useState("");

  if (!booking) return null;
  const live = demo.bookings.find((b) => b.id === booking.id) ?? booking;
  const service = demo.serviceById(live.serviceId);
  const trainer = demo.staffById(live.staffId);
  const location = demo.locationById(live.locationId);
  const clients = live.clientIds.map((id) => demo.clientById(id)).filter(Boolean);
  const history = demo.bookings.filter(
    (b) => b.clientIds[0] === live.clientIds[0] && b.id !== live.id,
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-foreground/20 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l bg-card shadow-float">
        <header className="flex items-start justify-between gap-3 border-b p-5">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{live.ref}</p>
            <h2 className="mt-1 text-lg font-semibold">{service.name}</h2>
            <p className="text-sm text-muted-foreground">
              {ukDateFull(live.date)} · {live.time}–{endTime(live.time, service.duration)}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
            <X className="size-4" />
          </Button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={live.status} />
            <StatusBadge status={live.paymentStatus} />
            <StatusBadge status={live.attendance} />
          </div>

          <div className="space-y-3">
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              {clients.length > 1 ? "Attendees" : "Client"}
            </p>
            {clients.map((c) => (
              <Link
                key={c!.id}
                to="/clients/$clientId"
                params={{ clientId: c!.id }}
                onClick={onClose}
                className="flex items-center gap-3 rounded-xl border p-3 transition-colors hover:bg-secondary"
              >
                <PersonAvatar name={c!.name} src={c!.avatar} />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c!.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{c!.email}</p>
                </div>
                <span className="ml-auto text-xs text-muted-foreground">
                  {demo.creditsFor(c!.id)} credits
                </span>
              </Link>
            ))}
            {live.capacity > 2 ? (
              <p className="text-xs text-muted-foreground">
                {live.booked} of {live.capacity} spaces booked
              </p>
            ) : null}
          </div>

          <dl className="grid grid-cols-2 gap-y-3 text-sm">
            <Detail label="Trainer" value={trainer.name} />
            <Detail label="Location" value={location.name} />
            <Detail label="Payment method" value={live.paymentMethod} />
            <Detail
              label="Package credit"
              value={live.paymentMethod === "Package credit" ? "1 credit used" : "—"}
            />
            <Detail label="Amount" value={gbp(live.amount, { decimals: true })} />
            <Detail label="Duration" value={`${service.duration} minutes`} />
          </dl>

          <Separator />

          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Booking history
            </p>
            <ul className="mt-3 space-y-2">
              {history.slice(0, 4).map((b) => (
                <li key={b.id} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {ukDateFull(b.date).replace(/,.*/, "")} · {b.time}
                  </span>
                  <StatusBadge status={b.status} />
                </li>
              ))}
              {history.length === 0 ? (
                <li className="text-sm text-muted-foreground">First booking for this client.</li>
              ) : null}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Internal notes
            </p>
            <Textarea
              className="mt-3"
              placeholder="Add a note for the team…"
              value={note || (live.notes ?? "")}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>

        <footer className="grid grid-cols-2 gap-2 border-t p-4">
          <Button variant="outline" onClick={() => demo.setAttendance(live.id, "attended")}>
            <CheckCircle2 className="size-4" /> Mark attended
          </Button>
          <Button variant="outline" onClick={() => demo.setAttendance(live.id, "no_show")}>
            <UserX className="size-4" /> No-show
          </Button>
          <Button variant="outline" asChild>
            <Link to="/messages" onClick={onClose}>
              <MessageSquare className="size-4" /> Message
            </Link>
          </Button>
          <Button variant="outline" onClick={() => demo.cancelBooking(live.id, true)}>
            <CalendarClock className="size-4" /> Reschedule
          </Button>
          <Button variant="outline" onClick={() => setConfirm("refund")}>
            <Receipt className="size-4" /> Issue refund
          </Button>
          <Button variant="destructive" onClick={() => setConfirm("cancel")}>
            <Ban className="size-4" /> Cancel
          </Button>
        </footer>
      </aside>

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "refund" ? "Issue a full refund?" : "Cancel this booking?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "refund"
                ? `${gbp(live.amount, { decimals: true })} will be returned to the client's card. This cannot be undone.`
                : "The client will be notified and any eligible package credit returned to their balance."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep booking</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirm === "refund") {
                  const payment = demo.payments.find(
                    (p) => p.clientId === live.clientIds[0] && p.amount === live.amount,
                  );
                  if (payment) demo.refundPayment(payment.id);
                } else {
                  demo.cancelBooking(live.id);
                }
                setConfirm(null);
              }}
            >
              {confirm === "refund" ? "Refund" : "Cancel booking"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Detail({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn(className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
