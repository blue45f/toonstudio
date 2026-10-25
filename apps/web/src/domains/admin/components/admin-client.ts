// 관리자 API(Nest /api/admin/*) 공용 클라이언트 — HttpOnly 쿠키 인증을 공유한다.
import { api, apiPath, HTTPError } from "@/platform/api";
import { getCurrentUiLocale } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface AdminMe {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

export interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  intervalDays: number;
  currency: string;
  priceCents: number;
  perks: string[];
  isActive: boolean;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export interface Campaign {
  id: string;
  creatorId: string;
  titleId: string | null;
  planId: string | null;
  title: string;
  description: string;
  targetAmountCents: number;
  raisedAmountCents: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  creatorName: string | null;
  creatorEmail: string | null;
  planName: string | null;
  planCode: string | null;
}

export type RevenueStatus =
  | "pending"
  | "approved"
  | "paid"
  | "rejected"
  | "revoked";

export interface RevenueEvent {
  id: string;
  status: RevenueStatus;
  kind: string;
  amountCents: number;
  currency: string;
  planId: string | null;
  campaignId: string | null;
  payerId: string;
  recipientId: string;
  reviewNote: string | null;
  settledAt: string | null;
  createdAt: string;
}

export interface RevenueSummary {
  pendingAmountCents: number;
  approvedAmountCents: number;
  paidAmountCents: number;
  rejectedAmountCents: number;
  revokedAmountCents: number;
  pendingEvents: number;
  approvedEvents: number;
  paidEvents: number;
  rejectedEvents: number;
  revokedEvents: number;
  totalEvents: number;
}

export interface RevenueResponse {
  summary: RevenueSummary;
  plans: {
    planId: string | null;
    planName: string | null;
    events: number;
    amountCents: number;
  }[];
  events: RevenueEvent[];
  generatedAt: string;
}

export interface AdminBenchmarkSample {
  name: string;
  status: "ok" | "partial" | "error";
  iterations: number;
  successCount: number;
  errorCount: number;
  errorRate: number;
  durationMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  stdDevMs: number;
  minMs: number;
  maxMs: number;
  sampleSize?: number;
  error?: string;
}

export interface AdminBenchmarkMetadata {
  iterations: number;
  sampleCount: number;
  warmup: boolean;
  totalDurationMs: number;
}

export interface AdminBenchmarkResult {
  generatedAt: string;
  metadata?: AdminBenchmarkMetadata;
  samples: AdminBenchmarkSample[];
}

export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "AdminApiError";
  }
}

function buildAdminHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  // FormData must retain its browser-generated multipart boundary. A Blob may
  // also carry its own media type; only JSON string bodies need our default.
  if (typeof init?.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

function errorMessage(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    const messages = value.filter(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    );
    if (messages.length) return messages.map((item) => item.trim()).join("\n");
  }
  return undefined;
}

function toAdminApiError(error: HTTPError): AdminApiError {
  let message = `요청 실패 (${error.response.status})`;
  const data = error.data;
  if (data && typeof data === "object") {
    const { error: responseError, message: responseMessage } = data as {
      error?: unknown;
      message?: unknown;
    };
    // Nest's `error` is often just "Bad Request". Preserve actionable validation
    // messages (including arrays) rather than hiding them behind the status text.
    message = errorMessage(responseMessage) ?? errorMessage(responseError) ?? message;
  }
  return new AdminApiError(error.response.status, message);
}

async function adminRaw(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await api.raw(apiPath(`/api/admin${path}`), {
      method: (init?.method ?? "GET") as never,
      cache: "no-store",
      body: init?.body as BodyInit | null | undefined,
      headers: buildAdminHeaders(init),
      signal: init?.signal ?? undefined,
    });
  } catch (error) {
    if (error instanceof HTTPError) throw toAdminApiError(error);
    throw error;
  }
}

export async function adminFetch<T>(
  path: string,
  _uid: string,
  init?: RequestInit,
): Promise<T> {
  const response = await adminRaw(path, init);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text.trim()) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AdminApiError(
      502,
      "서버 응답을 해석하지 못했어요. 잠시 후 다시 시도해 주세요.",
    );
  }
}

export async function adminFetchText(
  path: string,
  _uid: string,
  init?: RequestInit,
): Promise<string> {
  const response = await adminRaw(path, init);
  if (response.status === 204) return "";
  return response.text();
}

export function downloadAdminFile(
  filename: string,
  content: BlobPart,
  type = "text/plain;charset=utf-8",
): void {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    document.body.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    // Do not revoke before the browser has consumed the download navigation.
    setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

// 표시 보조 — cents ↔ 원
export const centsToWon = (cents: number) =>
  Math.round((Number(cents) || 0) / 100);
export const wonToCents = (won: number) =>
  Math.round((Number(won) || 0) * 100);
export const formatWon = (cents: number) =>
  `₩${centsToWon(cents).toLocaleString(getCurrentUiLocale())}`;
export const formatNum = (n: number) =>
  (Number(n) || 0).toLocaleString(getCurrentUiLocale());
export const formatDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString(getCurrentUiLocale()) : "—";

export function adminButtonClass(variant: "accent" | "ghost" | "danger" = "ghost") {
  return cn(
    "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50",
    variant === "accent" && "bg-accent text-on-accent hover:bg-accent-2",
    variant === "ghost" && "border border-line bg-card text-fg-2 hover:border-line-strong hover:text-fg",
    variant === "danger" && "border border-bad/40 text-bad hover:bg-bad/10",
  );
}

const REVENUE_KO = {
  markPaid: "지급 완료 처리",
} as const;

const REVENUE_EN = {
  markPaid: "Mark paid",
} as const;

export type AdminRevenueCopy = typeof REVENUE_KO;

export function getAdminRevenueCopy(locale: string): AdminRevenueCopy {
  return locale.toLowerCase().startsWith("ko")
    ? REVENUE_KO
    : (REVENUE_EN as unknown as AdminRevenueCopy);
}

export const TRAFFIC_PULSE_REFRESH_MS = 15_000;
export const TRAFFIC_OVERVIEW_REFRESH_MS = 5 * 60_000;
export const TRAFFIC_RANGE_DAYS = [1, 7, 30, 90] as const;

export type TrafficRangeDays = (typeof TRAFFIC_RANGE_DAYS)[number];

export const TRAFFIC_RANGE_LABEL_KEYS = {
  1: "admin.traffic.range1",
  7: "admin.traffic.range7",
  30: "admin.traffic.range30",
  90: "admin.traffic.range90",
} as const satisfies Record<TrafficRangeDays, string>;

export type TrafficSeriesPoint = {
  bucket: string;
  pageViews: number;
  visitors: number;
  sessions?: number;
};

export type TrafficPulse = {
  generatedAt: string;
  windowMinutes: number;
  activeVisitors: number;
  activeSessions: number;
  pageViews5m: number;
  pageViews30m: number;
  latestAt: string | null;
  series: TrafficSeriesPoint[];
};

export type TrafficBreakdown = {
  label: string;
  pageViews: number;
  visitors: number;
};

export type TrafficSource = {
  source: string;
  medium: string;
  pageViews: number;
  visitors: number;
};

export type TrafficPage = {
  path: string;
  title: string | null;
  pageViews: number;
  visitors: number;
  sessions: number;
  averageLoadTimeMs: number | null;
};

export type TrafficRecent = {
  occurredAt: string;
  path: string;
  source: string;
  medium: string;
  countryCode: string | null;
  deviceType: string;
  browser: string;
};

export type TrafficShareChannel = {
  channel: string;
  attempts: number;
  opened: number;
  completed: number;
  failed: number;
  cancelled: number;
};

export type TrafficShareContent = {
  path: string;
  attempts: number;
  opened: number;
  completed: number;
};

export type TrafficOverview = {
  generatedAt: string;
  rangeDays: number;
  bucketSeconds: number;
  status: "live" | "empty";
  storageMode: string;
  retentionDays: number;
  privacy: {
    storesRawIp: boolean;
    storesQueryString: boolean;
    honorsBrowserPrivacySignals: boolean;
    adminPathsExcluded: boolean;
  };
  realtime: {
    windowMinutes: number;
    activeVisitors: number;
    activeSessions: number;
    pageViews5m: number;
    pageViews30m: number;
    latestAt: string | null;
  };
  totals: {
    pageViews: number;
    uniqueVisitors: number;
    sessions: number;
    returningVisitors: number;
    coverageStartAt: string | null;
    latestAt: string | null;
    averageLoadTimeMs: number | null;
  };
  engagement: {
    engagedSessions: number;
    bounceRate: number;
    averageEngagedSeconds: number;
    pageViewsPerSession: number;
  };
  sharing: {
    attempts: number;
    opened: number;
    completed: number;
    failed: number;
    cancelled: number;
    uniqueSharers: number;
    attributedPageViews: number;
    attributedVisitors: number;
    attributedSessions: number;
    channels: TrafficShareChannel[];
    topContent: TrafficShareContent[];
  };
  series: TrafficSeriesPoint[];
  realtimeSeries: TrafficSeriesPoint[];
  topPages: TrafficPage[];
  sources: TrafficSource[];
  devices: TrafficBreakdown[];
  browsers: TrafficBreakdown[];
  countries: TrafficBreakdown[];
  recent: TrafficRecent[];
};

export type AdminTrafficTranslator = (key: string) => string;

export function formatTrafficDuration(seconds: number): string {
  const normalized = Math.max(0, Math.round(seconds));
  if (normalized < 60) return `${normalized}s`;
  const minutes = Math.floor(normalized / 60);
  const remainder = normalized % 60;
  return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
}

export function formatTrafficMilliseconds(
  value: number | null | undefined,
): string {
  if (!value) return "—";
  if (value < 1_000) return `${Math.round(value)}ms`;
  return `${(value / 1_000).toFixed(1)}s`;
}

function safeTrafficDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTrafficDateTime(
  value: string | null | undefined,
  locale: string,
): string {
  const date = safeTrafficDate(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function formatTrafficRelativeTime(
  value: string | null | undefined,
  locale: string,
): string {
  const date = safeTrafficDate(value);
  if (!date) return "—";
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1_000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (Math.abs(deltaSeconds) < 60) return formatter.format(deltaSeconds, "second");
  const minutes = Math.round(deltaSeconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(minutes, "minute");
  return formatter.format(Math.round(minutes / 60), "hour");
}

function escapeTrafficCsv(value: unknown): string {
  const normalized = String(value ?? "");
  return `"${normalized.replaceAll('"', '""')}"`;
}

export function downloadTrafficOverviewCsv(data: TrafficOverview): void {
  const rows: string[][] = [
    ["section", "label", "pageViews", "visitors", "sessions", "extra"],
    ...data.topPages.map((item) => [
      "page",
      item.path,
      String(item.pageViews),
      String(item.visitors),
      String(item.sessions),
      item.title ?? "",
    ]),
    ...data.sources.map((item) => [
      "source",
      `${item.source} / ${item.medium}`,
      String(item.pageViews),
      String(item.visitors),
      "",
      "",
    ]),
    ...data.sharing.channels.map((item) => [
      "share-channel",
      item.channel,
      String(item.attempts),
      String(item.opened),
      String(item.completed),
      `failed=${item.failed};cancelled=${item.cancelled}`,
    ]),
    ...data.sharing.topContent.map((item) => [
      "share-content",
      item.path,
      String(item.attempts),
      String(item.opened),
      String(item.completed),
      "",
    ]),
    ...data.devices.map((item) => [
      "device",
      item.label,
      String(item.pageViews),
      String(item.visitors),
      "",
      "",
    ]),
    ...data.browsers.map((item) => [
      "browser",
      item.label,
      String(item.pageViews),
      String(item.visitors),
      "",
      "",
    ]),
    ...data.countries.map((item) => [
      "country",
      item.label,
      String(item.pageViews),
      String(item.visitors),
      "",
      "",
    ]),
  ];
  const csv = `\uFEFF${rows
    .map((row) => row.map(escapeTrafficCsv).join(","))
    .join("\n")}`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `toonstudio-traffic-${data.rangeDays}d-${new Date()
    .toISOString()
    .slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

