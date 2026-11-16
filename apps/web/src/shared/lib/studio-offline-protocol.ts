export const STUDIO_OFFLINE_PREPARE_MESSAGE = "toonstudio-sw:prepare-offline";
export const STUDIO_OFFLINE_STATUS_MESSAGE = "toonstudio-sw:offline-status";
export const STUDIO_OFFLINE_MAX_RESOURCES = 1024;

export interface StudioOfflinePreparationReport {
  readonly schema: 1;
  readonly buildId: string;
  readonly checked: number;
  readonly cached: number;
  readonly downloadedBytes: number;
  readonly missing: readonly string[];
  readonly complete: boolean;
}

export interface StudioOfflineReadinessReport {
  readonly schema: 1;
  readonly buildId: string;
  readonly ready: boolean;
}

export function normalizeStudioOfflineAssetUrl(value: unknown, origin: string): string | null {
  if (typeof value !== "string" || value.length > 2_048) return null;
  try {
    const url = new URL(value, origin);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash
      || !/^\/assets\/[A-Za-z0-9_./-]+\.(?:m?js|css|wasm|woff2?|ttf|otf)$/u.test(url.pathname)) return null;
    return url.pathname;
  } catch {
    return null;
  }
}

export function isStudioOfflinePreparationMessage(value: unknown): value is {
  readonly type: typeof STUDIO_OFFLINE_PREPARE_MESSAGE;
  readonly urls: readonly string[];
} {
  if (!value || typeof value !== "object") return false;
  const record = value as { type?: unknown; urls?: unknown };
  return record.type === STUDIO_OFFLINE_PREPARE_MESSAGE && Array.isArray(record.urls)
    && record.urls.length <= STUDIO_OFFLINE_MAX_RESOURCES
    && record.urls.every((url) => typeof url === "string" && url.length <= 2_048);
}

export function isStudioOfflineStatusMessage(value: unknown): value is {
  readonly type: typeof STUDIO_OFFLINE_STATUS_MESSAGE;
} {
  return Boolean(value && typeof value === "object"
    && "type" in value
    && (value as { readonly type?: unknown }).type === STUDIO_OFFLINE_STATUS_MESSAGE);
}

export function isStudioOfflinePreparationReport(
  value: unknown,
): value is StudioOfflinePreparationReport {
  if (!value || typeof value !== "object") return false;
  const report = value as Partial<StudioOfflinePreparationReport>;
  return report.schema === 1
    && typeof report.buildId === "string"
    && typeof report.checked === "number"
    && Number.isInteger(report.checked)
    && report.checked > 0
    && typeof report.cached === "number"
    && Number.isInteger(report.cached)
    && report.cached >= 0
    && report.cached <= report.checked
    && typeof report.downloadedBytes === "number"
    && Number.isFinite(report.downloadedBytes)
    && report.downloadedBytes >= 0
    && Array.isArray(report.missing)
    && report.missing.every((item) => typeof item === "string")
    && typeof report.complete === "boolean"
    && (!report.complete || (report.cached === report.checked && report.missing.length === 0));
}

export function isStudioOfflinePreparationBusyReply(
  value: unknown,
): value is { readonly ok: false; readonly error: "offline-preparation-busy" } {
  if (!value || typeof value !== "object") return false;
  const record = value as { readonly ok?: unknown; readonly error?: unknown };
  return record.ok === false && record.error === "offline-preparation-busy";
}
