import type {
  BlockedTime,
  Booking,
  Client,
  ClientPackage,
  Conversation,
  CustomFieldDef,
  CustomRecord,
  CustomRecordConfig,
  LedgerEntry,
  Location,
  PackageDef,
  Payment,
  Service,
  Staff,
  Terminology,
} from "./demo-data";

export type IndustryId = "personal-training" | "car-detailing" | "barbershop";

export interface BusinessProfile {
  name: string;
  tagline: string;
  email: string;
  phone: string;
  bookingUrl: string;
  vatNumber: string;
  brandColour: string;
  initials: string;
  plan: string;
  owner: string;
  ownerRole: string;
}

export interface MetricCard {
  label: string;
  value: string;
  change?: number;
  hint?: string;
}

export interface QuickActionDef {
  id: string;
  label: string;
  icon: string;
}

export interface ResourceDef {
  id: string;
  name: string;
  locationId: string;
}

export interface IndustryFeatures {
  mobileService: boolean;
  walkIns: boolean;
  queue: boolean;
  deposits: boolean;
  sizePricing: boolean;
  staffPricing: boolean;
  customRecords: boolean;
  resourceLabel?: string;
}

export interface IndustryDataset {
  id: IndustryId;
  label: string;
  blurb: string;
  sector: string;
  business: BusinessProfile;
  terms: Terminology;
  jobStatuses: readonly string[];
  customerFields: CustomFieldDef[];
  customRecord: CustomRecordConfig;
  records: CustomRecord[];
  resources: ResourceDef[];
  features: IndustryFeatures;
  dashboard: {
    greeting: string;
    headline: MetricCard[];
    industryCards: MetricCard[];
  };
  quickActions: QuickActionDef[];
  reportSections: { title: string; description: string; rows: { label: string; value: string; hint?: string }[] }[];
  revenueSeries: { month: string; revenue: number; bookings: number }[];
  staff: Staff[];
  locations: Location[];
  services: Service[];
  packageDefs: PackageDef[];
  clients: Client[];
  bookings: Booking[];
  clientPackages: ClientPackage[];
  ledger: LedgerEntry[];
  payments: Payment[];
  conversations: Conversation[];
  blockedTimes: BlockedTime[];
}

export const JOB_STATUS_LABELS: Record<string, string> = {
  booked: "Booked",
  checked_in: "Checked in",
  inspection_complete: "Inspection complete",
  in_progress: "In progress",
  quality_check: "Quality check",
  ready_for_collection: "Ready for collection",
  completed: "Completed",
  cancelled: "Cancelled",
  waiting: "Waiting",
  in_chair: "In chair",
  no_show: "No-show",
};

export const jobStatusLabel = (status?: string) =>
  status ? (JOB_STATUS_LABELS[status] ?? status) : "—";
