export const ADMIN_TAB_KEYS = [
  "dashboard",
  "traffic",
  "plans",
  "revenue",
  "promos",
  "announcements",
  "reports",
  "security",
  "audit",
  "campaigns",
  "ops",
] as const;

export type AdminTabKey = (typeof ADMIN_TAB_KEYS)[number];

export type AnnouncementOperationalStatus =
  | "active"
  | "scheduled"
  | "expired"
  | "inactive";

export interface SchedulableAnnouncement {
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
}

export function getAnnouncementOperationalStatus(
  item: SchedulableAnnouncement,
  nowMs = Date.now(),
): AnnouncementOperationalStatus {
  if (!item.isActive) return "inactive";

  const startsAtMs = item.startsAt ? Date.parse(item.startsAt) : Number.NaN;
  if (Number.isFinite(startsAtMs) && startsAtMs > nowMs) return "scheduled";

  const endsAtMs = item.endsAt ? Date.parse(item.endsAt) : Number.NaN;
  if (Number.isFinite(endsAtMs) && endsAtMs <= nowMs) return "expired";

  return "active";
}

export function countActiveCriticalAnnouncements<
  T extends SchedulableAnnouncement & { level?: string | null },
>(items: readonly T[], nowMs = Date.now()): number {
  return items.filter(
    (item) =>
      String(item.level ?? "").toLowerCase() === "critical" &&
      getAnnouncementOperationalStatus(item, nowMs) === "active",
  ).length;
}
