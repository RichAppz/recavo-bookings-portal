/**
 * The Team page: one record per person, combining their diary (staff profile) and
 * their sign-in (membership). Kept out of `hooks.ts`; same conventions
 * (business-scoped keys, problem+json errors left to the caller where the drawer
 * shows them inline).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, queryKeys } from "@/lib/api";
import { useBusinessId } from "@/lib/api/hooks";
import type { BlockedPeriod, Invitation, Membership, Staff } from "@/lib/api/types";
import type { BookableState, TimeAwayKind, FeedKind } from "@/lib/team";

export type TeamSignIn = {
  membershipId: string;
  userId: string;
  email: string | null;
  name: string | null;
  roleKeys: string[];
  status: "invited" | "active" | "suspended";
  lastLoginAt: string | null;
  updatedAt?: string;
};

export type TeamInvitation = {
  id: string;
  email: string;
  roleKeys: string[];
  state: "pending" | "expired";
  expiresAt: string;
  sentAt: string | null;
  createdAt: string;
  linkCopyable?: boolean;
};

export type TeamPerson = {
  staff: Staff;
  isOwner: boolean;
  signIn: TeamSignIn | null;
  invitation: TeamInvitation | null;
  bookable: BookableState;
  week: { minutes: number; bookings: number };
};

export type TeamOverview = {
  people: TeamPerson[];
  unlinkedSignIns: TeamSignIn[];
  invitations: TeamInvitation[];
  suggestedLinks: { membershipId: string; staffId: string }[];
  seats: { used: number; allowed: number | null };
  servicesCount: number;
};

export type InviteResult = {
  invitation: Invitation;
  token: string;
  inviteUrl: string | null;
  emailed: boolean;
};

export type JobsChoice = "reassign" | "ask_rebook" | "keep";

export type JobInTheWay = {
  bookingId: string;
  start: string;
  allDay: boolean;
  serviceName: string;
  clientName: string | null;
  recordLabel: string | null;
};

export type JobsPreview = { count: number; bookings: JobInTheWay[]; timezone?: string };

export type JobsOutcome = {
  inTheWay: number;
  moved: number;
  asked: number;
  unmoved: (JobInTheWay & { reason: string })[];
};

export type TimeAwayBody = {
  kind: TimeAwayKind;
  startsOn: string;
  endsOn?: string | null;
  startMinute?: number | null;
  endMinute?: number | null;
  repeat?: { everyWeeks: 1 | 2; until: string } | null;
  note?: string | null;
  jobsInTheWay?: JobsChoice;
};

export type TimeAwayItem = {
  id: string;
  kind: FeedKind;
  start: string;
  end: string;
  allDay: boolean;
  title: string | null;
  note: string | null;
  seriesId: string | null;
  locationId?: string | null;
};

export type AddPersonBody = {
  displayName: string;
  title?: string | null;
  bookable: boolean;
  locationIds?: string[];
  calendarColour?: string | null;
  signIn?: { email: string; roleKeys: string[] } | null;
};

/** The invite link to copy: the API's portal link, or one built from the token. */
export function inviteLink(result: { token: string; inviteUrl: string | null }): string {
  if (result.inviteUrl) return result.inviteUrl;
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return `${origin}/invite?token=${encodeURIComponent(result.token)}`;
}

function useRefreshTeam() {
  const businessId = useBusinessId();
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: queryKeys.team(businessId) });
    void qc.invalidateQueries({ queryKey: queryKeys.staff(businessId) });
    void qc.invalidateQueries({ queryKey: queryKeys.invitations(businessId) });
    void qc.invalidateQueries({ queryKey: queryKeys.memberships(businessId) });
    void qc.invalidateQueries({ queryKey: queryKeys.onboarding(businessId) });
  };
}

const base = (businessId: string) => `/api/v1/businesses/${businessId}/team`;

export function useTeam() {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.team(businessId),
    enabled: Boolean(businessId),
    queryFn: async () => {
      const res = await api.get<{ team: TeamOverview }>(base(businessId));
      return res.data.team;
    },
  });
}

export function useBookability(staffId: string | null, enabled = true) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.teamBookability(businessId, staffId ?? ""),
    enabled: Boolean(businessId && staffId && enabled),
    staleTime: 60_000,
    queryFn: async () => {
      const res = await api.get<{
        bookability: { state: BookableState; nextFreeAt: string | null; timezone: string | null };
      }>(`${base(businessId)}/people/${staffId}/bookability`);
      return res.data.bookability;
    },
  });
}

export function useAddPerson() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  return useMutation({
    mutationFn: async (body: AddPersonBody) => {
      const res = await api.post<{ staff: Staff; invite: InviteResult | null }>(
        `${base(businessId)}/people`,
        body,
      );
      return res.data;
    },
    onSuccess: refresh,
  });
}

export function useReorderTeam() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  return useMutation({
    mutationFn: async (staffIds: string[]) => {
      const res = await api.post<{ staff: Staff[] }>(`${base(businessId)}/order`, { staffIds });
      return res.data.staff;
    },
    onSettled: refresh,
  });
}

export function useGiveSignIn() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  return useMutation({
    mutationFn: async (vars: { staffId: string; email: string; roleKeys: string[] }) => {
      const res = await api.post<InviteResult>(
        `${base(businessId)}/people/${vars.staffId}/sign-in`,
        { email: vars.email, roleKeys: vars.roleKeys },
      );
      return res.data;
    },
    onSuccess: refresh,
  });
}

export function useRemoveSignIn() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  return useMutation({
    mutationFn: async (staffId: string) => {
      const res = await api.delete<{ membership: Membership | null }>(
        `${base(businessId)}/people/${staffId}/sign-in`,
      );
      return res.data.membership;
    },
    onSuccess: refresh,
  });
}

export function useRestoreSignIn() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  return useMutation({
    mutationFn: async (staffId: string) => {
      const res = await api.post<{ membership: Membership }>(
        `${base(businessId)}/people/${staffId}/sign-in/restore`,
      );
      return res.data.membership;
    },
    onSuccess: refresh,
  });
}

export function useLinkSignIn() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  return useMutation({
    mutationFn: async (vars: { staffId: string; membershipId: string | null }) => {
      const res = await api.put<{ staff: Staff; membership: Membership | null }>(
        `${base(businessId)}/people/${vars.staffId}/sign-in/link`,
        { membershipId: vars.membershipId },
      );
      return res.data;
    },
    onSuccess: refresh,
  });
}

export function useAdoptSignIn() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  return useMutation({
    mutationFn: async (membershipId: string) => {
      const res = await api.post<{ staff: Staff }>(
        `${base(businessId)}/sign-ins/${membershipId}/adopt`,
      );
      return res.data.staff;
    },
    onSuccess: refresh,
  });
}

export async function previewArchive(businessId: string, staffId: string): Promise<JobsPreview> {
  const res = await api.post<JobsPreview>(`${base(businessId)}/people/${staffId}/archive/preview`);
  return res.data;
}

export function useArchivePerson() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { staffId: string; jobsInTheWay?: JobsChoice }) => {
      const res = await api.post<{ staff: Staff } & JobsOutcome>(
        `${base(businessId)}/people/${vars.staffId}/archive`,
        vars.jobsInTheWay ? { jobsInTheWay: vars.jobsInTheWay } : {},
      );
      return res.data;
    },
    onSuccess: () => {
      refresh();
      void qc.invalidateQueries({ queryKey: queryKeys.bookings(businessId) });
    },
  });
}

export function useRestorePerson() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  return useMutation({
    mutationFn: async (staffId: string) => {
      const res = await api.post<{ staff: Staff }>(`${base(businessId)}/people/${staffId}/restore`);
      return res.data.staff;
    },
    onSuccess: refresh,
  });
}

export function useSetStaffPhoto() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  return useMutation({
    mutationFn: async (vars: { staffId: string; file: Blob }) => {
      const res = await api.put<{ staff: Staff }>(
        `${base(businessId)}/people/${vars.staffId}/photo`,
        vars.file,
        { headers: { "Content-Type": vars.file.type || "image/jpeg" } },
      );
      return res.data.staff;
    },
    onSuccess: refresh,
  });
}

export function useRemoveStaffPhoto() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  return useMutation({
    mutationFn: async (staffId: string) => {
      const res = await api.delete<{ staff: Staff }>(`${base(businessId)}/people/${staffId}/photo`);
      return res.data.staff;
    },
    onSuccess: refresh,
  });
}

export function useTimeAway(staffId: string | null, range: { from: string; to: string }) {
  const businessId = useBusinessId();
  return useQuery({
    queryKey: queryKeys.teamTimeAway(businessId, staffId ?? "", range),
    enabled: Boolean(businessId && staffId),
    queryFn: async () => {
      const res = await api.get<{ items: TimeAwayItem[] }>(
        `${base(businessId)}/people/${staffId}/time-away`,
        { query: range },
      );
      return res.data.items;
    },
  });
}

export async function previewTimeAway(
  businessId: string,
  staffId: string,
  body: TimeAwayBody,
): Promise<JobsPreview> {
  const res = await api.post<JobsPreview>(
    `${base(businessId)}/people/${staffId}/time-away/preview`,
    body,
  );
  return res.data;
}

export function useAddTimeAway() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { staffId: string; body: TimeAwayBody }) => {
      const res = await api.post<
        { staff: Staff; added: BlockedPeriod[]; timezone: string } & JobsOutcome
      >(`${base(businessId)}/people/${vars.staffId}/time-away`, vars.body);
      return res.data;
    },
    onSuccess: (_data, vars) => {
      refresh();
      void qc.invalidateQueries({ queryKey: queryKeys.teamTimeAway(businessId, vars.staffId) });
      void qc.invalidateQueries({ queryKey: queryKeys.bookings(businessId) });
    },
  });
}

export function useRemoveTimeAway() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { staffId: string; timeAwayId: string; series?: boolean }) => {
      const res = await api.delete<{ staff: Staff }>(
        `${base(businessId)}/people/${vars.staffId}/time-away/${vars.timeAwayId}`,
        vars.series ? { query: { series: "true" } } : undefined,
      );
      return res.data.staff;
    },
    onSuccess: (_data, vars) => {
      refresh();
      void qc.invalidateQueries({ queryKey: queryKeys.teamTimeAway(businessId, vars.staffId) });
    },
  });
}

export function useResendInvitation() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await api.post<InviteResult>(
        `/api/v1/businesses/${businessId}/invitations/${invitationId}/resend`,
      );
      return res.data;
    },
    onSuccess: refresh,
  });
}

export async function fetchInvitationLink(businessId: string, invitationId: string) {
  const res = await api.get<{ token: string; inviteUrl: string | null }>(
    `/api/v1/businesses/${businessId}/invitations/${invitationId}/link`,
  );
  return res.data;
}

export function useCancelInvitation() {
  const businessId = useBusinessId();
  const refresh = useRefreshTeam();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const res = await api.delete<{ invitation: Invitation }>(
        `/api/v1/businesses/${businessId}/invitations/${invitationId}`,
      );
      return res.data.invitation;
    },
    onSuccess: refresh,
  });
}
