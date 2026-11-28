/**
 * Wave 72 데스크톱 네이티브 GPU/NPU 루프백 브릿지 HTTP 전송 클라이언트.
 *
 * - Wave 65 `NativeBridgeTransport` 계약을 로컬 루프백(`127.0.0.1` · `localhost`) 전용으로 구현한다.
 * - 원격 호스트·사설망 IP·HTTPS 외부 도메인·URL 자격증명 포함 주소를 즉시 차단(Fail-Closed)해
 *   로컬 세션 베어러 토큰이 외부 네트워크로 유출되지 않도록 방어한다.
 * - 데스크톱 데몬이 꺼져 있거나 브라우저 단독 실행 중일 때는 예외를 누출하지 않고
 *   `{ connected: false, fallbackReason, webgpuFallbackReady: true }`로 안전하게 폴백한다.
 */

import type {
  GpuVendor,
  HostHardwareProbe,
  NativeBridgeTransport,
} from "../wasm64-wave65-native-gpu-npu-bridge";

export const DEFAULT_DESKTOP_LOOPBACK_PORT = 48123;
export const DEFAULT_LOOPBACK_TIMEOUT_MS = 1_500;
export const LOOPBACK_IPC_ENDPOINT_PATH = "/v1/gpu-npu/ipc";
export const LOOPBACK_HEALTH_ENDPOINT_PATH = "/v1/gpu-npu/health";
export const LOOPBACK_PROBE_ENDPOINT_PATH = "/v1/gpu-npu/probe";

const ALLOWED_LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "localhost"]);

export type LoopbackSecurityErrorCode =
  | "invalid-url"
  | "unsupported-protocol"
  | "non-loopback-host"
  | "credentials-in-url"
  | "invalid-port";

/** 비허용 호스트·프로토콜·URL 자격증명 시도를 차단하는 Fail-Closed 보안 오류. */
export class LoopbackBridgeSecurityError extends Error {
  readonly code: LoopbackSecurityErrorCode;

  constructor(code: LoopbackSecurityErrorCode, message: string) {
    super(message);
    this.name = "LoopbackBridgeSecurityError";
    this.code = code;
  }
}

export type LoopbackTransportErrorCode =
  | "fetch-unavailable"
  | "timeout"
  | "http-error"
  | "network-error"
  | "invalid-response";

/** 루프백 HTTP IPC 통신 중 발생하는 전송 오류. */
export class LoopbackBridgeTransportError extends Error {
  readonly code: LoopbackTransportErrorCode;
  readonly status?: number;

  constructor(code: LoopbackTransportErrorCode, message: string, status?: number) {
    super(message);
    this.name = "LoopbackBridgeTransportError";
    this.code = code;
    this.status = status;
  }
}

export interface DesktopLoopbackBridgeConfig {
  readonly baseUrl?: string;
  readonly host?: "127.0.0.1" | "localhost";
  readonly port?: number;
  readonly token?: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

export interface DesktopLoopbackHealthResponse {
  readonly status: "ok" | "degraded";
  readonly daemonVersion: string;
  readonly protocolVersion: number;
  readonly vendor?: GpuVendor;
  readonly backend?: string;
  readonly upscaler?: string;
  readonly lowLatency?: string;
  readonly npuBackend?: string;
  readonly deviceName?: string;
  readonly zeroCopyEnabled?: boolean;
  readonly uptimeMs?: number;
}

export interface DesktopLoopbackProbeResponse {
  readonly probe?: Partial<HostHardwareProbe>;
  readonly vendor?: GpuVendor;
  readonly deviceName?: string;
  readonly graphicsBackend?: string;
  readonly upscaler?: string;
  readonly lowLatency?: string;
  readonly npuBackend?: string;
  readonly zeroCopyEnabled?: boolean;
}

export interface DesktopLoopbackProbeConnected {
  readonly connected: true;
  readonly baseUrl: string;
  readonly transport: DesktopLoopbackBridgeTransport;
  readonly health: DesktopLoopbackHealthResponse;
  readonly probe: DesktopLoopbackProbeResponse | null;
  readonly latencyMs: number;
}

export interface DesktopLoopbackProbeFallback {
  readonly connected: false;
  readonly baseUrl: string;
  readonly fallbackReason: string;
  readonly webgpuFallbackReady: true;
  readonly latencyMs: number;
}

export type DesktopLoopbackProbeResult =
  | DesktopLoopbackProbeConnected
  | DesktopLoopbackProbeFallback;

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseGpuVendor(value: unknown): GpuVendor | undefined {
  if (
    value === "webgpu-fallback" ||
    value === "apple" ||
    value === "nvidia" ||
    value === "amd" ||
    value === "intel" ||
    value === "arm" ||
    value === "qualcomm"
  ) {
    return value;
  }
  return undefined;
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readOptionalBoolean(record: Record<string, unknown>, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === "boolean" ? value : undefined;
}

/**
 * 루프백 브릿지 주소를 엄격히 검증해 정규화된 origin(`http://127.0.0.1:<port>` 또는 `http://localhost:<port>`)을 반환한다.
 * 허용 목록(`127.0.0.1`, `localhost`)과 `http:` 프로토콜을 벗어나면 즉시 `LoopbackBridgeSecurityError`를 던진다.
 */
export function assertValidLoopbackBaseUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new LoopbackBridgeSecurityError("invalid-url", "루프백 브릿지 주소가 비어 있습니다.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new LoopbackBridgeSecurityError(
      "invalid-url",
      `루프백 브릿지 URL 형식이 올바르지 않습니다: ${trimmed}`,
    );
  }

  if (parsed.protocol !== "http:") {
    throw new LoopbackBridgeSecurityError(
      "unsupported-protocol",
      `로컬 루프백 브릿지는 http:// 프로토콜만 허용합니다(입력: ${parsed.protocol}).`,
    );
  }

  if (parsed.username || parsed.password) {
    throw new LoopbackBridgeSecurityError(
      "credentials-in-url",
      "루프백 URL 안에 자격증명을 포함할 수 없습니다. Authorization 헤더를 사용하세요.",
    );
  }

  const normalizedHost = parsed.hostname.toLowerCase();
  if (!ALLOWED_LOOPBACK_HOSTS.has(normalizedHost)) {
    throw new LoopbackBridgeSecurityError(
      "non-loopback-host",
      `보안상 127.0.0.1 또는 localhost만 연결할 수 있습니다(차단된 호스트: ${parsed.hostname}).`,
    );
  }

  if (parsed.port) {
    const portNum = Number(parsed.port);
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      throw new LoopbackBridgeSecurityError(
        "invalid-port",
        `루프백 포트 범위(1..65535)를 벗어났습니다: ${parsed.port}`,
      );
    }
  }

  return `${parsed.protocol}//${normalizedHost}${parsed.port ? `:${parsed.port}` : ""}`;
}

function resolveLoopbackBaseUrl(config: DesktopLoopbackBridgeConfig): string {
  if (config.baseUrl !== undefined) {
    return assertValidLoopbackBaseUrl(config.baseUrl);
  }
  const host = config.host ?? "127.0.0.1";
  const port = config.port ?? DEFAULT_DESKTOP_LOOPBACK_PORT;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new LoopbackBridgeSecurityError(
      "invalid-port",
      `루프백 포트 범위(1..65535)를 벗어났습니다: ${String(port)}`,
    );
  }
  return assertValidLoopbackBaseUrl(`http://${host}:${port}`);
}

function parseHealthPayload(raw: unknown): DesktopLoopbackHealthResponse {
  if (!isRecord(raw)) {
    throw new LoopbackBridgeTransportError(
      "invalid-response",
      "데스크톱 브릿지 헬스 응답이 JSON 객체 형식이 아닙니다.",
    );
  }
  const rawStatus = raw.status;
  if (rawStatus !== "ok" && rawStatus !== "degraded") {
    throw new LoopbackBridgeTransportError(
      "invalid-response",
      `데스크톱 브릿지 헬스 상태값이 유효하지 않습니다: ${String(rawStatus)}`,
    );
  }
  const protocolVersion = readOptionalNumber(raw, "protocolVersion") ?? 1;
  return {
    status: rawStatus,
    daemonVersion: readOptionalString(raw, "daemonVersion") ?? "0.1.0",
    protocolVersion,
    vendor: parseGpuVendor(raw.vendor),
    backend: readOptionalString(raw, "backend"),
    upscaler: readOptionalString(raw, "upscaler"),
    lowLatency: readOptionalString(raw, "lowLatency"),
    npuBackend: readOptionalString(raw, "npuBackend"),
    deviceName: readOptionalString(raw, "deviceName"),
    zeroCopyEnabled: readOptionalBoolean(raw, "zeroCopyEnabled"),
    uptimeMs: readOptionalNumber(raw, "uptimeMs"),
  };
}

function parseProbePayload(raw: unknown): DesktopLoopbackProbeResponse | null {
  if (!isRecord(raw)) return null;
  const rawProbe = isRecord(raw.probe) ? (raw.probe as Partial<HostHardwareProbe>) : undefined;
  return {
    probe: rawProbe,
    vendor: parseGpuVendor(raw.vendor),
    deviceName: readOptionalString(raw, "deviceName"),
    graphicsBackend: readOptionalString(raw, "graphicsBackend"),
    upscaler: readOptionalString(raw, "upscaler"),
    lowLatency: readOptionalString(raw, "lowLatency"),
    npuBackend: readOptionalString(raw, "npuBackend"),
    zeroCopyEnabled: readOptionalBoolean(raw, "zeroCopyEnabled"),
  };
}

/**
 * 로컬 루프백 HTTP 엔드포인트(`/v1/gpu-npu/ipc`, `/health`, `/probe`)를 통해
 * Wave 65 바이너리 `TSNB` 프레임을 송수신하는 보안 전송 클라이언트.
 */
export class DesktopLoopbackBridgeTransport implements NativeBridgeTransport {
  readonly baseUrl: string;
  readonly timeoutMs: number;

  private readonly token: string | null;
  private readonly fetchImpl: typeof fetch | null;

  constructor(config: DesktopLoopbackBridgeConfig = {}) {
    this.baseUrl = resolveLoopbackBaseUrl(config);
    this.timeoutMs = Math.max(50, Math.round(config.timeoutMs ?? DEFAULT_LOOPBACK_TIMEOUT_MS));
    const trimmedToken = config.token?.trim() ?? "";
    this.token = trimmedToken.length > 0 ? trimmedToken : null;
    this.fetchImpl =
      config.fetchImpl ?? (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : null);
  }

  /** Wave 65 바이너리 IPC 프레임을 `/v1/gpu-npu/ipc`로 전송하고 원시 응답 바이트를 반환한다. */
  async sendFrame(packetBytes: Uint8Array, timeoutMs?: number): Promise<Uint8Array> {
    const effectiveTimeoutMs = Math.max(1, timeoutMs ?? this.timeoutMs);
    const bodyCopy = new Uint8Array(packetBytes.byteLength);
    bodyCopy.set(packetBytes);

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      Accept: "application/octet-stream",
    };
    if (this.token !== null) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    const response = await this.fetchWithTimeout(
      `${this.baseUrl}${LOOPBACK_IPC_ENDPOINT_PATH}`,
      {
        method: "POST",
        headers,
        body: bodyCopy,
      },
      effectiveTimeoutMs,
    );

    if (!response.ok) {
      throw new LoopbackBridgeTransportError(
        "http-error",
        `데스크톱 루프백 IPC 요청이 HTTP ${response.status} 오류를 반환했습니다.`,
        response.status,
      );
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /** 데스크톱 루프백 데몬 헬스 상태(`/v1/gpu-npu/health`)를 조회한다. */
  async fetchHealth(timeoutMs?: number): Promise<DesktopLoopbackHealthResponse> {
    const response = await this.fetchWithTimeout(
      `${this.baseUrl}${LOOPBACK_HEALTH_ENDPOINT_PATH}`,
      {
        method: "GET",
        headers: this.buildJsonHeaders(),
      },
      Math.max(1, timeoutMs ?? this.timeoutMs),
    );

    if (!response.ok) {
      throw new LoopbackBridgeTransportError(
        "http-error",
        `데스크톱 루프백 헬스 점검 실패(HTTP ${response.status}).`,
        response.status,
      );
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new LoopbackBridgeTransportError(
        "invalid-response",
        "데스크톱 루프백 헬스 응답 JSON을 해석하지 못했습니다.",
      );
    }
    return parseHealthPayload(json);
  }

  /** 데스크톱 루프백 데몬의 하드웨어 프로브 정보(`/v1/gpu-npu/probe`)를 조회한다. */
  async fetchHardwareProbe(timeoutMs?: number): Promise<DesktopLoopbackProbeResponse | null> {
    try {
      const response = await this.fetchWithTimeout(
        `${this.baseUrl}${LOOPBACK_PROBE_ENDPOINT_PATH}`,
        {
          method: "GET",
          headers: this.buildJsonHeaders(),
        },
        Math.max(1, timeoutMs ?? this.timeoutMs),
      );
      if (!response.ok) return null;
      const json: unknown = await response.json();
      return parseProbePayload(json);
    } catch {
      return null;
    }
  }

  private buildJsonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (this.token !== null) {
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response> {
    if (!this.fetchImpl) {
      throw new LoopbackBridgeTransportError(
        "fetch-unavailable",
        "현재 런타임에서 fetch API를 사용할 수 없어 WebGPU 브라우저 경로로 폴백합니다.",
      );
    }

    const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    let timedOut = false;
    const timer =
      controller !== null
        ? setTimeout(() => {
            timedOut = true;
            controller.abort();
          }, timeoutMs)
        : null;

    try {
      return await this.fetchImpl(url, {
        ...init,
        signal: controller?.signal,
      });
    } catch (caught) {
      if (timedOut || (caught instanceof Error && caught.name === "AbortError")) {
        throw new LoopbackBridgeTransportError(
          "timeout",
          `데스크톱 루프백 응답 시간 초과(${timeoutMs}ms).`,
        );
      }
      const message = caught instanceof Error ? caught.message : String(caught);
      throw new LoopbackBridgeTransportError(
        "network-error",
        `데스크톱 루프백 데몬에 연결할 수 없습니다: ${message}`,
      );
    } finally {
      if (timer !== null) {
        clearTimeout(timer);
      }
    }
  }
}

/**
 * 로컬 데스크톱 GPU/NPU 루프백 데몬의 생존 여부를 탐색한다.
 *
 * - 비허용 호스트/프로토콜이 전달되면 즉시 `LoopbackBridgeSecurityError`를 던져 토큰 유출을 원천 차단한다.
 * - 정상 루프백 주소에 데몬이 응답하지 않으면 예외를 삼키지 않고
 *   `{ connected: false, fallbackReason, webgpuFallbackReady: true }`로 정직하게 폴백한다.
 */
export async function probeDesktopLoopbackBridge(
  config: DesktopLoopbackBridgeConfig = {},
): Promise<DesktopLoopbackProbeResult> {
  const startedMs = nowMs();
  // 주소 보안 검증은 try 블록 밖에서 수행해 비루프백 URL을 Fail-Closed로 즉시 차단한다.
  const transport = new DesktopLoopbackBridgeTransport(config);

  try {
    const health = await transport.fetchHealth();
    const probe = await transport.fetchHardwareProbe();
    return {
      connected: true,
      baseUrl: transport.baseUrl,
      transport,
      health,
      probe,
      latencyMs: Math.max(0, Math.round((nowMs() - startedMs) * 100) / 100),
    };
  } catch (caught) {
    const fallbackReason =
      caught instanceof Error ? caught.message : "데스크톱 루프백 데몬이 응답하지 않습니다.";
    return {
      connected: false,
      baseUrl: transport.baseUrl,
      fallbackReason,
      webgpuFallbackReady: true,
      latencyMs: Math.max(0, Math.round((nowMs() - startedMs) * 100) / 100),
    };
  }
}
