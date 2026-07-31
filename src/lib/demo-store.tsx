import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import {
  business,
  initialState,
  type Booking,
  type BookingStatus,
  type Client,
  type Payment,
} from "./demo-data";
import { isoDate, demoToday } from "./format";

type State = ReturnType<typeof initialState>;

interface DemoContextValue extends State {
  business: typeof business;
  currentLocation: string;
  setCurrentLocation: (id: string) => void;
  serviceById: (id: string) => State["services"][number];
  staffById: (id: string) => State["staff"][number];
  locationById: (id: string) => State["locations"][number];
  clientById: (id: string) => Client | undefined;
  packageById: (id: string) => State["packageDefs"][number] | undefined;
  creditsFor: (clientId: string) => number;
  createBooking: (input: NewBookingInput) => void;
  cancelBooking: (id: string, late?: boolean) => void;
  setAttendance: (id: string, attendance: "attended" | "no_show") => void;
  refundPayment: (id: string, amount?: number) => void;
  sellPackage: (clientId: string, packageId: string) => void;
  adjustCredits: (clientId: string, delta: number, reason: string) => void;
  sendMessage: (conversationId: string, body: string) => void;
  markConversationRead: (conversationId: string) => void;
  addClient: (input: { name: string; email: string; phone: string }) => Client;
  addNote: (clientId: string, body: string) => void;
  suspendClient: (clientId: string) => void;
  updateService: (id: string, patch: Partial<State["services"][number]>) => void;
  addService: (svc: State["services"][number]) => void;
  addPackage: (pkg: State["packageDefs"][number]) => void;
  blockAvailability: (staffId: string, date: string, time: string, reason: string) => void;
  resetDemo: () => void;
}

export interface NewBookingInput {
  clientId: string;
  serviceId: string;
  staffId: string;
  locationId: string;
  date: string;
  time: string;
  paymentMethod: Booking["paymentMethod"];
  notes?: string;
  sendConfirmation?: boolean;
}

const DemoContext = createContext<DemoContextValue | null>(null);

let counter = 100;
const nextId = (prefix: string) => `${prefix}${++counter}`;

export function DemoProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>(() => initialState());
  const [currentLocation, setCurrentLocation] = useState("all");

  const serviceById = useCallback(
    (id: string) => state.services.find((s) => s.id === id)!,
    [state.services],
  );
  const staffById = useCallback((id: string) => state.staff.find((s) => s.id === id)!, [state.staff]);
  const locationById = useCallback(
    (id: string) => state.locations.find((l) => l.id === id)!,
    [state.locations],
  );
  const clientById = useCallback(
    (id: string) => state.clients.find((c) => c.id === id),
    [state.clients],
  );
  const packageById = useCallback(
    (id: string) => state.packageDefs.find((p) => p.id === id),
    [state.packageDefs],
  );
  const creditsFor = useCallback(
    (clientId: string) =>
      state.clientPackages
        .filter((p) => p.clientId === clientId && p.status === "active")
        .reduce((sum, p) => sum + p.remaining, 0),
    [state.clientPackages],
  );

  const pushLedger = (
    prev: State,
    clientId: string,
    type: State["ledger"][number]["type"],
    description: string,
    change: number,
  ) => {
    const balance =
      prev.ledger.filter((l) => l.clientId === clientId).slice(-1)[0]?.balance ?? 0;
    return [
      ...prev.ledger,
      {
        id: nextId("le"),
        clientId,
        date: isoDate(demoToday()),
        type,
        description,
        change,
        balance: balance + change,
      },
    ];
  };

  const createBooking = useCallback((input: NewBookingInput) => {
    setState((prev) => {
      const svc = prev.services.find((s) => s.id === input.serviceId)!;
      const usesCredit = input.paymentMethod === "Package credit";
      const booking: Booking = {
        id: nextId("b"),
        ref: `BK-${5000 + prev.bookings.length}`,
        date: input.date,
        time: input.time,
        serviceId: input.serviceId,
        staffId: input.staffId,
        locationId: input.locationId,
        clientIds: [input.clientId],
        status: usesCredit || input.paymentMethod === "Card" ? "confirmed" : "awaiting_payment",
        attendance: "scheduled",
        paymentStatus: usesCredit ? "paid" : input.paymentMethod === "Card" ? "paid" : "pending",
        paymentMethod: input.paymentMethod,
        amount: svc.price,
        capacity: svc.capacity,
        booked: 1,
        notes: input.notes,
      };

      let clientPackages = prev.clientPackages;
      let ledgerNext = prev.ledger;
      if (usesCredit) {
        const pkg = prev.clientPackages.find(
          (p) => p.clientId === input.clientId && p.status === "active" && p.remaining > 0,
        );
        if (pkg) {
          clientPackages = prev.clientPackages.map((p) =>
            p.id === pkg.id
              ? { ...p, remaining: p.remaining - 1, status: p.remaining - 1 === 0 ? "used" : p.status }
              : p,
          );
          ledgerNext = pushLedger(prev, input.clientId, "used", `${svc.name} — credit used`, -1);
        }
      }

      const payments: Payment[] =
        input.paymentMethod === "Card"
          ? [
              {
                id: nextId("pay"),
                ref: `pi_3Qz${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
                clientId: input.clientId,
                amount: svc.price,
                fee: Math.round(svc.price * 0.019 * 100) / 100 + 0.2,
                date: input.date,
                time: input.time,
                description: svc.name,
                type: "Booking",
                method: "Visa •••• 4242",
                status: "paid",
              },
              ...prev.payments,
            ]
          : prev.payments;

      return { ...prev, bookings: [...prev.bookings, booking], clientPackages, ledger: ledgerNext, payments };
    });
    toast.success("Booking created", {
      description: input.sendConfirmation === false ? undefined : "Confirmation email sent to the client.",
    });
  }, []);

  const cancelBooking = useCallback((id: string, late = false) => {
    setState((prev) => {
      const booking = prev.bookings.find((b) => b.id === id);
      let clientPackages = prev.clientPackages;
      let ledgerNext = prev.ledger;
      if (booking && !late && booking.paymentMethod === "Package credit") {
        const pkg = prev.clientPackages.find(
          (p) => p.clientId === booking.clientIds[0] && p.status !== "expired",
        );
        if (pkg) {
          clientPackages = prev.clientPackages.map((p) =>
            p.id === pkg.id ? { ...p, remaining: p.remaining + 1, status: "active" } : p,
          );
          ledgerNext = pushLedger(
            prev,
            booking.clientIds[0],
            "returned",
            "Cancelled within policy — credit returned",
            1,
          );
        }
      }
      return {
        ...prev,
        clientPackages,
        ledger: ledgerNext,
        bookings: prev.bookings.map((b) =>
          b.id === id
            ? {
                ...b,
                status: (late ? "late_cancellation" : "cancelled") as BookingStatus,
                attendance: "cancelled" as const,
              }
            : b,
        ),
      };
    });
    toast.success(late ? "Marked as late cancellation" : "Booking cancelled", {
      description: late ? "Policy applied — no credit returned." : "The client has been notified.",
    });
  }, []);

  const setAttendance = useCallback((id: string, attendance: "attended" | "no_show") => {
    setState((prev) => ({
      ...prev,
      bookings: prev.bookings.map((b) =>
        b.id === id
          ? { ...b, attendance, status: attendance === "attended" ? "completed" : "no_show" }
          : b,
      ),
    }));
    toast.success(attendance === "attended" ? "Marked as attended" : "Marked as no-show");
  }, []);

  const refundPayment = useCallback((id: string, amount?: number) => {
    setState((prev) => ({
      ...prev,
      payments: prev.payments.map((p) =>
        p.id === id
          ? {
              ...p,
              status: amount && amount < p.amount ? "partially_refunded" : "refunded",
              refunded: amount ?? p.amount,
            }
          : p,
      ),
    }));
    toast.success("Refund issued", { description: "Stripe will return the funds in 5–10 days." });
  }, []);

  const sellPackage = useCallback((clientId: string, packageId: string) => {
    setState((prev) => {
      const def = prev.packageDefs.find((p) => p.id === packageId)!;
      const today = demoToday();
      const expires = new Date(today);
      expires.setMonth(expires.getMonth() + (def.validity.startsWith("4") ? 4 : def.validity.startsWith("2") ? 2 : 1));
      return {
        ...prev,
        clientPackages: [
          ...prev.clientPackages,
          {
            id: nextId("cp"),
            packageId,
            clientId,
            purchased: isoDate(today),
            credits: def.credits,
            remaining: def.credits,
            expires: isoDate(expires),
            status: "active" as const,
          },
        ],
        packageDefs: prev.packageDefs.map((p) =>
          p.id === packageId ? { ...p, sold: p.sold + 1, revenue: p.revenue + p.price } : p,
        ),
        ledger: pushLedger(prev, clientId, "purchase", `${def.name} purchased`, def.credits),
        payments: [
          {
            id: nextId("pay"),
            ref: `pi_3Qz${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
            clientId,
            amount: def.price,
            fee: Math.round(def.price * 0.019 * 100) / 100 + 0.2,
            date: isoDate(today),
            time: "12:00",
            description: def.name,
            type: "Package" as const,
            method: "Visa •••• 4242",
            status: "paid" as const,
          },
          ...prev.payments,
        ],
        clients: prev.clients.map((c) =>
          c.id === clientId ? { ...c, lifetimeSpend: c.lifetimeSpend + def.price } : c,
        ),
      };
    });
    toast.success("Package sold", { description: "Credits added to the client balance." });
  }, []);

  const adjustCredits = useCallback((clientId: string, delta: number, reason: string) => {
    setState((prev) => {
      const pkg = prev.clientPackages.find((p) => p.clientId === clientId && p.status !== "expired");
      const clientPackages = pkg
        ? prev.clientPackages.map((p) =>
            p.id === pkg.id
              ? { ...p, remaining: Math.max(0, p.remaining + delta), status: "active" as const }
              : p,
          )
        : prev.clientPackages;
      return {
        ...prev,
        clientPackages,
        ledger: pushLedger(prev, clientId, "adjustment", reason, delta),
      };
    });
    toast.success(delta > 0 ? "Credit added" : "Credit removed");
  }, []);

  const sendMessage = useCallback((conversationId: string, body: string) => {
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) =>
        c.id === conversationId
          ? {
              ...c,
              messages: [
                ...c.messages,
                {
                  id: nextId("m"),
                  from: "business" as const,
                  body,
                  time: new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }),
                  date: isoDate(demoToday()),
                },
              ],
            }
          : c,
      ),
    }));
  }, []);

  const markConversationRead = useCallback((conversationId: string) => {
    setState((prev) => ({
      ...prev,
      conversations: prev.conversations.map((c) => (c.id === conversationId ? { ...c, unread: 0 } : c)),
    }));
  }, []);

  const addClient = useCallback((input: { name: string; email: string; phone: string }) => {
    const client: Client = {
      id: nextId("c"),
      name: input.name,
      email: input.email,
      phone: input.phone,
      avatar: `https://i.pravatar.cc/160?u=${encodeURIComponent(input.email || input.name)}`,
      joined: isoDate(demoToday()),
      status: "active",
      lifetimeSpend: 0,
      totalBookings: 0,
      attendanceRate: 100,
      notes: [],
    };
    setState((prev) => ({ ...prev, clients: [client, ...prev.clients] }));
    toast.success("Client added", { description: `${input.name} is now on your client list.` });
    return client;
  }, []);

  const addNote = useCallback((clientId: string, body: string) => {
    setState((prev) => ({
      ...prev,
      clients: prev.clients.map((c) =>
        c.id === clientId
          ? {
              ...c,
              notes: [
                { id: nextId("n"), date: isoDate(demoToday()), author: "Alex Morgan", body },
                ...c.notes,
              ],
            }
          : c,
      ),
    }));
    toast.success("Note saved");
  }, []);

  const suspendClient = useCallback((clientId: string) => {
    setState((prev) => ({
      ...prev,
      clients: prev.clients.map((c) =>
        c.id === clientId
          ? { ...c, status: c.status === "suspended" ? "active" : ("suspended" as const) }
          : c,
      ),
    }));
    toast.success("Client status updated");
  }, []);

  const updateService = useCallback((id: string, patch: Partial<State["services"][number]>) => {
    setState((prev) => ({
      ...prev,
      services: prev.services.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    }));
  }, []);

  const addService = useCallback((svc: State["services"][number]) => {
    setState((prev) => ({ ...prev, services: [...prev.services, svc] }));
    toast.success("Service created");
  }, []);

  const addPackage = useCallback((pkg: State["packageDefs"][number]) => {
    setState((prev) => ({ ...prev, packageDefs: [...prev.packageDefs, pkg] }));
    toast.success("Package created");
  }, []);

  const blockAvailability = useCallback(
    (staffId: string, date: string, time: string, reason: string) => {
      setState((prev) => ({
        ...prev,
        blockedTimes: [
          ...prev.blockedTimes,
          { id: nextId("bt"), staffId, date, time, duration: 60, reason },
        ],
      }));
      toast.success("Availability blocked");
    },
    [],
  );

  const resetDemo = useCallback(() => {
    setState(initialState());
    setCurrentLocation("all");
    toast.success("Demo data reset", { description: "Everything is back to its starting state." });
  }, []);

  const value = useMemo<DemoContextValue>(
    () => ({
      ...state,
      business,
      currentLocation,
      setCurrentLocation,
      serviceById,
      staffById,
      locationById,
      clientById,
      packageById,
      creditsFor,
      createBooking,
      cancelBooking,
      setAttendance,
      refundPayment,
      sellPackage,
      adjustCredits,
      sendMessage,
      markConversationRead,
      addClient,
      addNote,
      suspendClient,
      updateService,
      addService,
      addPackage,
      blockAvailability,
      resetDemo,
    }),
    [
      state,
      currentLocation,
      serviceById,
      staffById,
      locationById,
      clientById,
      packageById,
      creditsFor,
      createBooking,
      cancelBooking,
      setAttendance,
      refundPayment,
      sellPackage,
      adjustCredits,
      sendMessage,
      markConversationRead,
      addClient,
      addNote,
      suspendClient,
      updateService,
      addService,
      addPackage,
      blockAvailability,
      resetDemo,
    ],
  );

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error("useDemo must be used inside DemoProvider");
  return ctx;
}
