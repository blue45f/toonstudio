import { isStaticPreviewReadinessResponse } from "./studio-preview-readiness";

interface PreviewRequest {
  url(): string;
  method(): string;
  resourceType(): string;
  failure(): { errorText: string } | null;
}

const LEGACY_STATIC_API_PATHS = new Set([
  "/api/auth/session", "/api/kmas/merge-on-access", "/api/studio-ai/status", "/api/analytics/traffic/",
]);
const MISSING_COMPANION_API_PATHS = new Set([
  "/api/health/capabilities", "/api/studio-realtime/tickets", "/api/analytics/traffic/page-view",
]);

function ownPreviewPath(value: string, previewBaseUrl: string): string | null {
  try {
    const url = new URL(value), base = new URL(previewBaseUrl);
    return base.protocol === "http:" && base.hostname === "127.0.0.1" && base.port
      && !base.username && !base.password && url.origin === base.origin
      && !url.username && !url.password && !url.search && !url.hash ? url.pathname : null;
  } catch { return null; }
}

/** 정적 preview의 정확한 API 부재만 분리하며 권한·서버 오류는 통과시키지 않는다. */
export function createCompanionPreviewApiDiagnostics(previewBaseUrl: string) {
  const observedUnavailable = new WeakSet<PreviewRequest>();
  const responseUnavailable = (status: number, url: string): boolean => {
    const path = ownPreviewPath(url, previewBaseUrl);
    if (path === null) return false;
    return (status === 404 && MISSING_COMPANION_API_PATHS.has(path))
      || ((status === 404 || status === 502) && LEGACY_STATIC_API_PATHS.has(path))
      || isStaticPreviewReadinessResponse(status, url, previewBaseUrl);
  };
  return {
    consoleUnavailable(message: string): boolean {
      const match = /^Failed to load resource: the server responded with a status of (404 \(Not Found\)|502 \(Bad Gateway\)) @ (.+)$/u.exec(message);
      return match !== null && responseUnavailable(Number(match[1]?.slice(0, 3)), match[2] ?? "");
    },
    observeResponse(request: PreviewRequest, status: number, url: string): boolean {
      if (request.url() !== url || !responseUnavailable(status, url)) {
        observedUnavailable.delete(request);
        return false;
      }
      observedUnavailable.add(request);
      return true;
    },
    observedUnavailableAbort(request: PreviewRequest): boolean {
      return ownPreviewPath(request.url(), previewBaseUrl) === "/api/studio-realtime/tickets"
        && observedUnavailable.has(request) && request.method() === "POST"
        && request.resourceType() === "fetch" && request.failure()?.errorText === "net::ERR_ABORTED";
    },
  };
}
