import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, CreditCard, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PersonAvatar } from "@/components/ui-bits";
import { useDemo } from "@/lib/demo-store";
import { addDays, demoToday, gbp, isoDate, ukDateFull } from "@/lib/format";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book a session — RECAVO" },
      {
        name: "description",
        content:
          "Book personal training, small group and assessment sessions with the RECAVO team in Manchester.",
      },
      { property: "og:title", content: "Book a session — RECAVO" },
      { property: "og:description", content: "Choose a service, trainer and time, then pay securely online." },
    ],
  }),
  component: BookingJourney,
});

const TIMES = ["07:00", "08:00", "09:00", "10:30", "12:00", "16:00", "17:30", "18:30"];

function BookingJourney() {
  const demo = useDemo();
  const [step, setStep] = useState(0);
  const [serviceId, setServiceId] = useState(demo.services[0].id);
  const [staffId, setStaffId] = useState(demo.staff[0].id);
  const [locationId, setLocationId] = useState(demo.locations[0].id);
  const [date, setDate] = useState(isoDate(addDays(demoToday(), 1)));
  const [time, setTime] = useState("09:00");

  const service = demo.serviceById(serviceId);
  const steps = ["Service", "Trainer", "Time", "Details", "Confirmed"];

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b bg-nav text-nav-foreground">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-semibold">{demo.business.name}</p>
            <p className="text-xs opacity-70">{demo.business.tagline}</p>
          </div>
          <span className="text-xs opacity-70">{demo.business.bookingUrl}</span>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-6 px-5 py-8">
        <ol className="flex flex-wrap items-center gap-2 text-xs">
          {steps.map((s, i) => (
            <li
              key={s}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${
                i === step ? "bg-primary text-primary-foreground" : i < step ? "bg-primary-soft text-primary" : "bg-secondary text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="size-3.5" /> : <span className="tabular-nums">{i + 1}</span>}
              {s}
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <section className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight">Choose a session</h1>
            {demo.services.filter((s) => s.active).map((s) => (
              <button
                key={s.id}
                onClick={() => { setServiceId(s.id); setStep(1); }}
                className="surface-card flex w-full items-center justify-between gap-4 p-5 text-left transition-shadow hover:shadow-lg"
              >
                <span>
                  <span className="block font-medium">{s.name}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{s.description}</span>
                  <span className="mt-2 block text-xs text-muted-foreground">{s.duration} minutes · up to {s.capacity} {s.capacity === 1 ? "person" : "people"}</span>
                </span>
                <span className="text-lg font-semibold whitespace-nowrap">{gbp(s.price)}</span>
              </button>
            ))}
          </section>
        ) : null}

        {step === 1 ? (
          <section className="space-y-3">
            <Back onClick={() => setStep(0)} />
            <h1 className="text-2xl font-semibold tracking-tight">Pick your trainer and studio</h1>
            <div className="grid gap-3 sm:grid-cols-2">
              {demo.staff.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setStaffId(m.id)}
                  className={`surface-card flex items-center gap-3 p-4 text-left ${m.id === staffId ? "ring-2 ring-primary" : ""}`}
                >
                  <PersonAvatar name={m.name} src={m.avatar} size={44} />
                  <span>
                    <span className="block text-sm font-medium">{m.name}</span>
                    <span className="block text-xs text-muted-foreground">{m.role}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {demo.locations.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setLocationId(l.id)}
                  className={`surface-card p-4 text-left ${l.id === locationId ? "ring-2 ring-primary" : ""}`}
                >
                  <span className="flex items-center gap-2 text-sm font-medium"><MapPin className="size-4" />{l.name}</span>
                  <span className="mt-1 block text-xs text-muted-foreground">{l.address}, {l.postcode}</span>
                </button>
              ))}
            </div>
            <Button className="w-full" onClick={() => setStep(2)}>Continue</Button>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="space-y-4">
            <Back onClick={() => setStep(1)} />
            <h1 className="text-2xl font-semibold tracking-tight">Choose a date and time</h1>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {Array.from({ length: 7 }, (_, i) => isoDate(addDays(demoToday(), i + 1))).map((d) => (
                <button
                  key={d}
                  onClick={() => setDate(d)}
                  className={`surface-card shrink-0 px-4 py-3 text-center text-sm ${d === date ? "ring-2 ring-primary" : ""}`}
                >
                  {ukDateFull(d)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {TIMES.map((t) => (
                <button
                  key={t}
                  onClick={() => setTime(t)}
                  className={`rounded-xl border py-2.5 text-sm tabular-nums ${t === time ? "border-primary bg-primary-soft text-primary" : "hover:bg-secondary"}`}
                >
                  {t}
                </button>
              ))}
            </div>
            <Button className="w-full" onClick={() => setStep(3)}>Continue</Button>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="space-y-4">
            <Back onClick={() => setStep(2)} />
            <h1 className="text-2xl font-semibold tracking-tight">Your details</h1>
            <div className="surface-card space-y-3 p-5">
              <div className="grid gap-2"><Label htmlFor="b-name">Full name</Label><Input id="b-name" placeholder="Jamie Ellis" /></div>
              <div className="grid gap-2"><Label htmlFor="b-email">Email</Label><Input id="b-email" placeholder="jamie@example.co.uk" /></div>
              <div className="grid gap-2"><Label htmlFor="b-phone">Mobile</Label><Input id="b-phone" placeholder="07700 900000" /></div>
            </div>
            <div className="surface-card space-y-3 p-5">
              <p className="flex items-center gap-2 text-sm font-medium"><CreditCard className="size-4" /> Payment</p>
              <div className="grid gap-2"><Label htmlFor="b-card">Card number</Label><Input id="b-card" placeholder="4242 4242 4242 4242" /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-2"><Label htmlFor="b-exp">Expiry</Label><Input id="b-exp" placeholder="09 / 28" /></div>
                <div className="grid gap-2"><Label htmlFor="b-cvc">CVC</Label><Input id="b-cvc" placeholder="123" /></div>
              </div>
            </div>
            <Summary serviceName={service.name} staffName={demo.staffById(staffId).name} locationName={demo.locationById(locationId).name} date={date} time={time} price={service.price} />
            <Button className="w-full" onClick={() => setStep(4)}>Pay {gbp(service.price)} and confirm</Button>
          </section>
        ) : null}

        {step === 4 ? (
          <section className="space-y-4 text-center">
            <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-7" />
            </span>
            <h1 className="text-2xl font-semibold tracking-tight">You're booked in</h1>
            <p className="text-sm text-muted-foreground">
              We've emailed your confirmation and added the session to your account. You can reschedule up to 24 hours before.
            </p>
            <Summary serviceName={service.name} staffName={demo.staffById(staffId).name} locationName={demo.locationById(locationId).name} date={date} time={time} price={service.price} />
            <Button variant="outline" onClick={() => setStep(0)}>Book another session</Button>
          </section>
        ) : null}
      </div>
    </main>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Back
    </button>
  );
}

function Summary({
  serviceName,
  staffName,
  locationName,
  date,
  time,
  price,
}: {
  serviceName: string;
  staffName: string;
  locationName: string;
  date: string;
  time: string;
  price: number;
}) {
  return (
    <dl className="surface-card space-y-2 p-5 text-left text-sm">
      {[
        ["Session", serviceName],
        ["Trainer", staffName],
        ["Studio", locationName],
        ["When", `${ukDateFull(date)} at ${time}`],
        ["Total", gbp(price)],
      ].map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
