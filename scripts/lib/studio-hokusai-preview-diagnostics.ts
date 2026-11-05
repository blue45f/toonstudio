import { createCompanionPreviewApiDiagnostics } from "./studio-companion-preview-diagnostics";
import { isStaticPreviewReadinessResponse, isStaticPreviewReadinessUnavailable } from "./studio-preview-readiness";

interface PreviewRequest {
  url(): string;
  method(): string;
  resourceType(): string;
  failure(): { errorText: string } | null;
}
interface PreviewConsole {
  type(): string;
  text(): string;
  location(): { url: string };
}
interface DiagnosticsPage {
  on(event: "console", listener: (entry: PreviewConsole) => void): unknown;
  on(event: "pageerror", listener: (error: Error) => void): unknown;
  on(event: "requestfailed", listener: (request: PreviewRequest) => void): unknown;
  on(event: "response", listener: (response: { status(): number; url(): string; request(): PreviewRequest }) => void): unknown;
}
interface StaticPreviewObservation {
  readonly kind: "response" | "console-error" | "request-failure";
  readonly raw: string;
}

export interface BrowserDiagnostics {
  readonly consoleErrors: string[];
  readonly consoleWarnings: string[];
  readonly pageErrors: string[];
  readonly requestFailures: string[];
  readonly fiveHundredResponses: string[];
  staticPreviewApiUnavailable?: { readonly apiVerified: false; readonly observations: StaticPreviewObservation[] };
}

const OPTIONAL_STATIC_PREVIEW_API_PATHS = [
  "/api/health/ready",
  "/api/auth/session",
  "/api/kmas/merge-on-access",
  "/api/studio-ai/status",
  "/api/analytics/traffic/",
] as const;

export function expectedStaticPreviewDiagnostic(message: string, studioUrl: string): boolean {
  if (OPTIONAL_STATIC_PREVIEW_API_PATHS.some((path) => message.includes(path))) return true;
  let previewUrl: URL;
  try {
    previewUrl = new URL(studioUrl);
  } catch {
    return false;
  }
  if (
    previewUrl.protocol !== "http:"
    || previewUrl.hostname !== "127.0.0.1"
    || previewUrl.port.length === 0
  ) return false;
  const sourceSeparator = message.lastIndexOf(" @ ");
  if (sourceSeparator > 0) {
    const diagnostic = message.slice(0, sourceSeparator);
    const source = message.slice(sourceSeparator + 3);
    try {
      const sourceUrl = new URL(source);
      const expectedHeadlessGraphicsDiagnostic = diagnostic === "No available adapters."
        || /^\[\.WebGL-0x[\da-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels$/iu.test(
          diagnostic,
        );
      if (
        expectedHeadlessGraphicsDiagnostic
        && sourceUrl.origin === previewUrl.origin
        && (sourceUrl.pathname === previewUrl.pathname
          || /^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(sourceUrl.pathname))
        && [...sourceUrl.searchParams].every(([key, value]) => (
          sourceUrl.pathname === previewUrl.pathname && key === "room"
          && /^work-instant-[a-z0-9]+-[a-z0-9]+$/u.test(value)
        ))
        && sourceUrl.hash === ""
      ) return true;
    } catch {
      // Continue to the strict static-preview WebSocket allowlist below.
    }
  }
  const socketUrl =
    `ws://127.0.0.1:${previewUrl.port}/socket.io/?EIO=4&transport=websocket`;
  const expectedMessages = [
    `WebSocket connection to '${socketUrl}' failed: Connection closed before receiving a handshake response`,
    `WebSocket connection to '${socketUrl}' failed: Error during WebSocket handshake: Unexpected response code: 400`,
  ];
  if (expectedMessages.includes(message)) return true;
  const sourcePrefix = expectedMessages
    .map((expectedMessage) => `${expectedMessage} @ `)
    .find((prefix) => message.startsWith(prefix));
  if (!sourcePrefix) return false;
  try {
    const sourceUrl = new URL(message.slice(sourcePrefix.length));
    return sourceUrl.origin === previewUrl.origin
      && /^\/assets\/[A-Za-z0-9._-]+\.js$/u.test(sourceUrl.pathname)
      && sourceUrl.search === ""
      && sourceUrl.hash === "";
  } catch {
    return false;
  }
}
/** 자신이 띄운 정적 preview의 정확한 502만 분리하며 실제 API 검증 성공으로 기록하지 않는다. */
export function collectBrowserDiagnostics(
  page: DiagnosticsPage,
  label: string,
  studioUrl: string,
  ownedStaticPreview = false,
): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [], consoleWarnings: [], pageErrors: [], requestFailures: [], fiveHundredResponses: [],
  };
  let baseHasNoQuery: boolean;
  try { const base = new URL(studioUrl); baseHasNoQuery = !base.search && !base.hash && !base.username && !base.password; } catch { baseHasNoQuery = false; }
  const api = ownedStaticPreview && baseHasNoQuery ? createCompanionPreviewApiDiagnostics(studioUrl) : null;
  const observedReadiness = new WeakSet<PreviewRequest>();
  const unavailable = (kind: StaticPreviewObservation["kind"], raw: string) => {
    diagnostics.staticPreviewApiUnavailable ??= { apiVerified: false, observations: [] };
    diagnostics.staticPreviewApiUnavailable.observations.push({ kind, raw: `${label}: ${raw}` });
  };
  page.on("console", (entry) => {
    if (entry.type() !== "error" && entry.type() !== "warning") return;
    const location = entry.location().url;
    const message = location ? `${entry.text()} @ ${location}` : entry.text();
    if (api && entry.type() === "error" && isStaticPreviewReadinessUnavailable(message, studioUrl) && api.consoleUnavailable(message)) {
      unavailable("console-error", message);
      return;
    }
    if (expectedStaticPreviewDiagnostic(message, studioUrl)) return;
    const target = entry.type() === "error" ? diagnostics.consoleErrors : diagnostics.consoleWarnings;
    target.push(`${label}: ${message}`);
  });
  page.on("pageerror", (error) => {
    diagnostics.pageErrors.push(`${label}: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  });
  page.on("requestfailed", (request) => {
    const message = `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "unknown"}`;
    if (api && observedReadiness.has(request) && api.observedUnavailableAbort(request)) {
      unavailable("request-failure", message);
      return;
    }
    if (!expectedStaticPreviewDiagnostic(message, studioUrl)) diagnostics.requestFailures.push(`${label}: ${message}`);
  });
  page.on("response", (response) => {
    const request = response.request(), status = response.status(), url = response.url();
    observedReadiness.delete(request);
    const sharedUnavailable = api?.observeResponse(request, status, url) ?? false;
    if (sharedUnavailable && isStaticPreviewReadinessResponse(status, url, studioUrl)) {
      observedReadiness.add(request);
      unavailable("response", `${status} ${url}`);
      return;
    }
    if (status < 500) return;
    const message = `${status} ${url}`;
    if (!expectedStaticPreviewDiagnostic(message, studioUrl)) diagnostics.fiveHundredResponses.push(`${label}: ${message}`);
  });
  return diagnostics;
}
export function mergeDiagnostics(target: BrowserDiagnostics, source: BrowserDiagnostics): void {
  target.consoleErrors.push(...source.consoleErrors);
  target.consoleWarnings.push(...source.consoleWarnings);
  target.pageErrors.push(...source.pageErrors);
  target.requestFailures.push(...source.requestFailures);
  target.fiveHundredResponses.push(...source.fiveHundredResponses);
  if (source.staticPreviewApiUnavailable) {
    target.staticPreviewApiUnavailable ??= { apiVerified: false, observations: [] };
    target.staticPreviewApiUnavailable.observations.push(...source.staticPreviewApiUnavailable.observations);
  }
}
