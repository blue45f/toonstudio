// 관리자 API(Nest /api/admin/*) 공용 클라이언트 — HttpOnly 쿠키 인증을 공유한다.
import { useCallback, useEffect, useRef } from "react";

import { getAuthSessionRevision } from "@/domains/auth/public/session/auth-session-state";

import { api, apiPath, HTTPError } from "@/platform/api";
import { getCurrentUiLocale } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export const ADMIN_READ_TIMEOUT_MS = 30_000;

interface PendingAdminRead {
  controller: AbortController;
  promise: Promise<string>;
  subscribers: number;
}

// 응답 캐시는 두지 않는다. 같은 브라우저 인증 세대에서 진행 중인 읽기만 공유한다.
const pendingReads = new Map<string, PendingAdminRead>();

/** 쓰기 완료 뒤의 새 조회는 쓰기 이전·도중에 시작한 응답을 재사용하지 않는다. */
export function invalidateAdminReads(): void {
  pendingReads.clear();
}

function cancelledRead(): DOMException {
  return new DOMException("관리자 조회가 취소되었습니다.", "AbortError");
}

function createRead(
  key: string | null,
  request: (signal: AbortSignal) => Promise<Response>,
): PendingAdminRead {
  const controller = new AbortController();
  let onAbort: () => void = () => undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(controller.signal.reason ?? cancelledRead());
    controller.signal.addEventListener("abort", onAbort, { once: true });
  });
  const timer = globalThis.setTimeout(() => {
    controller.abort(new DOMException(
      "관리자 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도해 주세요.",
      "TimeoutError",
    ));
  }, ADMIN_READ_TIMEOUT_MS);
  const responseText = Promise.resolve().then(async () => {
    controller.signal.throwIfAborted();
    const response = await request(controller.signal);
    const text = response.status === 204 ? "" : await response.text();
    controller.signal.throwIfAborted();
    return text;
  });
  const entry: PendingAdminRead = {
    controller,
    promise: Promise.race([responseText, aborted]),
    subscribers: 0,
  };
  entry.promise = entry.promise.finally(() => {
    globalThis.clearTimeout(timer);
    controller.signal.removeEventListener("abort", onAbort);
    if (key !== null && pendingReads.get(key) === entry) pendingReads.delete(key);
  });
  return entry;
}

/** 본문 수신까지 30초로 제한하고, 호출자 하나의 취소가 다른 화면의 조회를 취소하지 않게 한다. */
export function readAdminResponse(
  path: string,
  uid: string,
  headers: Headers,
  callerSignal: AbortSignal | null | undefined,
  request: (signal: AbortSignal) => Promise<Response>,
): Promise<string> {
  callerSignal?.throwIfAborted();
  const revision = getAuthSessionRevision();
  // 서버 실행에서는 요청 간 인증 상태를 공유하지 않는다. 헤더가 다른 조회도 분리한다.
  const key = typeof window === "undefined" ? null : JSON.stringify([
    revision, uid, path, Array.from(headers.entries()).sort(([left], [right]) => left.localeCompare(right)),
  ]);
  let entry = key === null ? undefined : pendingReads.get(key);
  if (!entry) {
    entry = createRead(key, request);
    if (key !== null) pendingReads.set(key, entry);
  }
  const current = entry;
  current.subscribers += 1;

  return new Promise<string>((resolve, reject) => {
    let finished = false;
    const finish = (): boolean => {
      if (finished) return false;
      finished = true;
      callerSignal?.removeEventListener("abort", onCallerAbort);
      current.subscribers -= 1;
      return true;
    };
    const onCallerAbort = () => {
      if (!finish()) return;
      reject(callerSignal?.reason ?? cancelledRead());
      if (current.subscribers === 0) {
        if (key !== null && pendingReads.get(key) === current) pendingReads.delete(key);
        current.controller.abort(cancelledRead());
      }
    };
    callerSignal?.addEventListener("abort", onCallerAbort, { once: true });
    current.promise.then(
      (text) => {
        if (!finish()) return;
        // 계정 전환·로그아웃·권한 갱신 뒤 이전 세대의 성공 응답을 화면에 전달하지 않는다.
        if (getAuthSessionRevision() !== revision) reject(cancelledRead());
        else resolve(text);
      },
      (error: unknown) => { if (finish()) reject(error); },
    );
  });
}

/** 같은 화면의 읽기를 합치고 화면·사용자·조회 조건이 바뀌면 이전 읽기를 취소한다. */
export function useAdminReadTask<Arguments extends unknown[]>(
  task: (signal: AbortSignal, ...args: Arguments) => Promise<void>,
): (...args: Arguments) => Promise<void> {
  const active = useRef<{
    task: typeof task;
    controller: AbortController;
    promise: Promise<void>;
  } | null>(null);

  useEffect(() => () => {
    if (active.current?.task !== task) return;
    active.current.controller.abort();
    active.current = null;
  }, [task]);

  return useCallback((...args: Arguments) => {
    const current = active.current;
    if (current?.task === task && !current.controller.signal.aborted) return current.promise;
    current?.controller.abort();
    const request = { task, controller: new AbortController(), promise: Promise.resolve() };
    request.promise = Promise.resolve().then(async () => {
      if (!request.controller.signal.aborted) await task(request.controller.signal, ...args);
    }).finally(() => {
      if (active.current === request) active.current = null;
    });
    active.current = request;
    return request.promise;
  }, [task]);
}

/** intervalMs가 null이면 첫 가시 시점에만 실행하며 이후 갱신은 수동으로 맡긴다. */
export function startAdminVisiblePolling(
  task: () => void,
  intervalMs: number | null,
  refreshOnStart = true,
): () => void {
  let interval: ReturnType<typeof setInterval> | null = null;
  let pendingInitial = refreshOnStart;
  let wasVisible = document.visibilityState === "visible";
  const pause = () => {
    if (interval !== null) globalThis.clearInterval(interval);
    interval = null;
  };
  const resume = (refresh: boolean) => {
    if (refresh || pendingInitial) {
      pendingInitial = false;
      task();
    }
    if (intervalMs !== null && interval === null) {
      interval = globalThis.setInterval(() => {
        if (document.visibilityState === "visible") task();
      }, intervalMs);
    }
  };
  const onVisibility = () => {
    const isVisible = document.visibilityState === "visible";
    if (isVisible === wasVisible) return;
    wasVisible = isVisible;
    if (isVisible) resume(intervalMs !== null);
    else pause();
  };
  document.addEventListener("visibilitychange", onVisibility);
  if (wasVisible) resume(false);
  return () => {
    pause();
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

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
    const method = (init?.method ?? "GET").toUpperCase();
    return await api.raw(apiPath(`/api/admin${path}`), {
      method: method as never,
      cache: "no-store",
      body: init?.body as BodyInit | null | undefined,
      headers: buildAdminHeaders(init),
      signal: init?.signal ?? undefined,
      ...(method === "GET" ? { timeout: ADMIN_READ_TIMEOUT_MS, totalTimeout: ADMIN_READ_TIMEOUT_MS } : {}),
      retry: 0,
    });
  } catch (error) {
    if (error instanceof HTTPError) throw toAdminApiError(error);
    throw error;
  }
}

export async function adminFetch<T>(
  path: string,
  uid: string,
  init?: RequestInit,
): Promise<T> {
  const text = await adminFetchText(path, uid, init);
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
  uid: string,
  init?: RequestInit,
): Promise<string> {
  if ((init?.method ?? "GET").toUpperCase() === "GET") {
    return readAdminResponse(
      apiPath(`/api/admin${path}`), uid, buildAdminHeaders(init), init?.signal,
      (signal) => adminRaw(path, { ...init, signal }),
    );
  }
  try {
    const response = await adminRaw(path, init);
    if (response.status === 204) return "";
    return await response.text();
  } finally {
    // 전송 실패도 서버 반영 여부를 확정할 수 없으므로 이후 조회를 새로 시작한다.
    if (init?.method?.toUpperCase() !== "HEAD") invalidateAdminReads();
  }
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
  downloadAdminFile(
    `toonstudio-traffic-${data.rangeDays}d-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
    "text/csv;charset=utf-8",
  );
}

