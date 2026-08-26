import type {
  Booking,
  BusinessOnboarding,
  CatalogueService,
  ConnectAccount,
  Customer,
  Location,
  OnboardingStep,
  OnboardingStepKey,
  Package,
  PolicyDocument,
  Staff,
} from "@/lib/api/types";

const STEP_META: Record<
  OnboardingStepKey,
  { title: string; description: string; required: boolean; href: string }
> = {
  location: {
    title: "Add a training location",
    description: "Where you train clients — studio, gym, or mobile.",
    required: true,
    href: "/locations",
  },
  staff_availability: {
    title: "Set your availability",
    description: "Working hours and locations so sessions can be booked.",
    required: true,
    href: "/staff",
  },
  service: {
    title: "Create a session type",
    description: "Duration, price, and what clients can book.",
    required: true,
    href: "/services",
  },
  client: {
    title: "Add your first client",
    description: "You’ll need at least one client to create a booking.",
    required: true,
    href: "/clients",
  },
  first_booking: {
    title: "Book your first session",
    description: "Create a booking to confirm everything is wired up.",
    required: true,
    href: "/calendar",
  },
  public_booking: {
    title: "Share your booking link",
    description: "Make a service and location public so clients can self-book.",
    required: false,
    href: "/settings?tab=business",
  },
  stripe_connect: {
    title: "Get paid",
    description: "Connect Stripe so you can take payments.",
    required: false,
    href: "/payments",
  },
  policies: {
    title: "Publish cancellation & terms",
    description: "Set clear policies before clients book online.",
    required: false,
    href: "/settings?tab=policies&assist=1",
  },
  package: {
    title: "Offer a package",
    description: "Sell blocks of sessions with credits.",
    required: false,
    href: "/packages",
  },
};

const STEP_ORDER: OnboardingStepKey[] = [
  "location",
  "staff_availability",
  "service",
  "client",
  "first_booking",
  "public_booking",
  "stripe_connect",
  "policies",
  "package",
];

const CANCELLED_BOOKING = new Set([
  "cancelled_by_customer",
  "cancelled_by_business",
  "late_cancelled",
  "expired",
]);

export type DeriveOnboardingInput = {
  businessId: string;
  locations: Location[];
  staff: Staff[];
  services: CatalogueService[];
  customers: Customer[];
  bookings: Booking[];
  packages: Package[];
  policies: PolicyDocument[];
  connect: ConnectAccount | null | undefined;
  skippedKeys?: OnboardingStepKey[];
  dismissed?: boolean;
  dismissedAt?: string | null;
};

function stepCompleted(key: OnboardingStepKey, input: DeriveOnboardingInput): boolean {
  switch (key) {
    case "location":
      return input.locations.length > 0;
    case "staff_availability":
      return input.staff.some(
        (s) =>
          s.status === "active" &&
          s.workingRules.length > 0 &&
          s.locationIds.length > 0,
      );
    case "service":
      return input.services.some((s) => s.active);
    case "client":
      return input.customers.length > 0;
    case "first_booking":
      return input.bookings.some((b) => !CANCELLED_BOOKING.has(b.status));
    case "public_booking":
      return (
        input.services.some((s) => s.active && s.publicVisible) &&
        input.locations.some((l) => l.active && l.publicVisible)
      );
    case "stripe_connect":
      return Boolean(
        input.connect?.chargesEnabled || input.connect?.onboardingState === "complete",
      );
    case "policies": {
      const published = new Set(
        input.policies.filter((p) => p.status === "published").map((p) => p.type),
      );
      return published.has("cancellation") && published.has("terms");
    }
    case "package":
      return input.packages.some((p) => p.active);
  }
}

/**
 * Client-side progress matching the planned backend onboarding resource.
 * Used when `GET .../onboarding` is not available yet (404).
 */
export function deriveBusinessOnboarding(input: DeriveOnboardingInput): BusinessOnboarding {
  const skipped = new Set(input.skippedKeys ?? []);
  const steps: OnboardingStep[] = STEP_ORDER.map((key) => {
    const meta = STEP_META[key];
    const completed = stepCompleted(key, input);
    return {
      key,
      title: meta.title,
      description: meta.description,
      required: meta.required,
      completed,
      skipped: !meta.required && skipped.has(key),
      href: meta.href,
      completedAt: null,
    };
  });

  const required = steps.filter((s) => s.required);
  const requiredCompleted = required.filter((s) => s.completed).length;
  const requiredTotal = required.length;
  const percentComplete =
    requiredTotal === 0 ? 100 : Math.round((requiredCompleted / requiredTotal) * 100);

  if (input.dismissed) {
    return {
      businessId: input.businessId,
      status: "dismissed",
      percentComplete,
      requiredCompleted,
      requiredTotal,
      dismissedAt: input.dismissedAt ?? new Date().toISOString(),
      steps,
      version: 1,
    };
  }

  return {
    businessId: input.businessId,
    status: requiredCompleted >= requiredTotal ? "complete" : "in_progress",
    percentComplete,
    requiredCompleted,
    requiredTotal,
    dismissedAt: null,
    steps,
    version: 1,
  };
}
