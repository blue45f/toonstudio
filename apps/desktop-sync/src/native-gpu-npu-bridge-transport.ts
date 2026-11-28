/**
 * Wave 71 데스크톱 셸 ↔ Rust Wave 65 네이티브 GPU/NPU 데몬 IPC 트랜스포트 및
 * 하드닝된 루프백(`127.0.0.1`) 브릿지 HTTP 서버.
 */

import { execFile, spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { access, constants as fsConstants, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { ChildProcessWithoutNullStreams } from "node:child_process";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

export const WAVE65_IPC_MAGIC_BYTES: readonly [number, number, number, number] = [0x54, 0x53, 0x4e, 0x42];
export const WAVE65_IPC_PROTOCOL_VERSION = 1;
export const WAVE65_IPC_HEADER_BYTES = 48;
export const WAVE65_IPC_TRAILER_BYTES = 4;
export const WAVE65_IPC_MIN_PACKET_BYTES = WAVE65_IPC_HEADER_BYTES + WAVE65_IPC_TRAILER_BYTES;
export const WAVE65_IPC_MAX_PAYLOAD_BYTES = 65_536;
export const WAVE65_IPC_MAX_PACKET_BYTES = WAVE65_IPC_HEADER_BYTES + WAVE65_IPC_MAX_PAYLOAD_BYTES + WAVE65_IPC_TRAILER_BYTES;

const MAX_HTTP_IPC_BODY_BYTES = 66 * 1024;
const LOOPBACK_HOST = "127.0.0.1" as const;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

const ZERO_BIGINT = BigInt(0);
const ONE_BIGINT = BigInt(1);
const SHIFT_32_BIGINT = BigInt(32);
const U32_MASK_BIGINT = BigInt(0xffffffff);
const MAX_U64_BIGINT = (ONE_BIGINT << BigInt(64)) - ONE_BIGINT;
const MAX_U32 = 0xffffffff;

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder("utf-8", { fatal: false });

export const WAVE65_IPC_FLAGS = {
  ZERO_COPY_SHM: 1 << 0,
  LOW_LATENCY_MARK: 1 << 1,
  NPU_ASSISTED: 1 << 2,
  MULTI_FRAME_GEN: 1 << 3,
  FALLBACK_WEBGPU: 1 << 4,
} as const;

export type Wave65GpuVendor = "webgpu-fallback" | "apple" | "nvidia" | "amd" | "intel" | "arm" | "qualcomm";
export type Wave65IpcPacketKind =
  | "handshake-request" | "handshake-response" | "frame-submit"
  | "frame-complete" | "pso-prewarm-hint" | "heartbeat" | "error-notice";

export type Wave65CodecErrorCode =
  | "packet-truncated" | "invalid-magic" | "unsupported-version" | "unknown-packet-kind"
  | "unknown-vendor" | "invalid-sequence" | "payload-too-large" | "length-mismatch"
  | "crc-mismatch" | "invalid-shm-handle" | "shm-range-overflow";

export interface Wave65SharedMemoryMeta {
  readonly handleId: bigint; readonly byteOffset: number; readonly byteLength: number;
}

export interface Wave65IpcPacket {
  readonly version: number; readonly kind: Wave65IpcPacketKind; readonly vendor: Wave65GpuVendor;
  readonly sequence: bigint; readonly shm: Wave65SharedMemoryMeta; readonly flags: number;
  readonly frameBudgetUs: number; readonly actualLatencyUs: number; readonly payload: Uint8Array;
}

export interface DecodedWave65Packet extends Wave65IpcPacket {
  readonly crc32: number; readonly payloadText: string; readonly summary: Record<string, string>;
}

export class Wave65IpcCodecError extends Error {
  readonly code: Wave65CodecErrorCode;
  constructor(code: Wave65CodecErrorCode, message: string) {
    super(message);
    this.name = "Wave65IpcCodecError";
    this.code = code;
  }
}

export const WAVE65_VENDOR_TO_WIRE_ID: Readonly<Record<Wave65GpuVendor, number>> = {
  "webgpu-fallback": 0, apple: 1, nvidia: 2, amd: 3, intel: 4, arm: 5, qualcomm: 6,
};
export const WAVE65_WIRE_ID_TO_VENDOR: Readonly<Record<number, Wave65GpuVendor>> = {
  0: "webgpu-fallback", 1: "apple", 2: "nvidia", 3: "amd", 4: "intel", 5: "arm", 6: "qualcomm",
};
export const WAVE65_KIND_TO_WIRE_ID: Readonly<Record<Wave65IpcPacketKind, number>> = {
  "handshake-request": 1, "handshake-response": 2, "frame-submit": 3, "frame-complete": 4,
  "pso-prewarm-hint": 5, heartbeat: 6, "error-notice": 7,
};
export const WAVE65_WIRE_ID_TO_KIND: Readonly<Record<number, Wave65IpcPacketKind>> = {
  1: "handshake-request", 2: "handshake-response", 3: "frame-submit", 4: "frame-complete",
  5: "pso-prewarm-hint", 6: "heartbeat", 7: "error-notice",
};

const EMPTY_SHM: Wave65SharedMemoryMeta = Object.freeze({ handleId: ZERO_BIGINT, byteOffset: 0, byteLength: 0 });

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
})();

/** IEEE 802.3 CRC-32 체크섬을 계산한다 (Rust `crc32_ieee`와 바이트-정확히 일치). */
export function computeWave65Crc32Ieee(bytes: Uint8Array, length = bytes.length): number {
  let crc = 0xffffffff;
  const end = Math.min(length, bytes.length);
  for (let i = 0; i < end; i += 1) {
    crc = (crc >>> 8) ^ (CRC32_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff] ?? 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU64Le(view: DataView, offset: number, value: bigint): void {
  view.setUint32(offset, Number(value & U32_MASK_BIGINT), true);
  view.setUint32(offset + 4, Number((value >> SHIFT_32_BIGINT) & U32_MASK_BIGINT), true);
}

function readU64Le(view: DataView, offset: number): bigint {
  return BigInt(view.getUint32(offset, true)) | (BigInt(view.getUint32(offset + 4, true)) << SHIFT_32_BIGINT);
}

function validateSharedMemory(shm: Wave65SharedMemoryMeta, requireZeroCopy: boolean): void {
  if (shm.handleId < ZERO_BIGINT || shm.handleId > MAX_U64_BIGINT) {
    throw new Wave65IpcCodecError("invalid-shm-handle", "공유 메모리 핸들 ID가 u64 범위를 벗어났습니다.");
  }
  if (!Number.isInteger(shm.byteOffset) || shm.byteOffset < 0 || shm.byteOffset > MAX_U32 ||
      !Number.isInteger(shm.byteLength) || shm.byteLength < 0 || shm.byteLength > MAX_U32 ||
      shm.byteOffset + shm.byteLength > MAX_U32) {
    throw new Wave65IpcCodecError("shm-range-overflow", `공유 메모리 범위(${shm.byteOffset}+${shm.byteLength})가 u32 상한을 초과했습니다.`);
  }
  if (requireZeroCopy && (shm.handleId === ZERO_BIGINT || shm.byteLength === 0)) {
    throw new Wave65IpcCodecError("invalid-shm-handle", `Zero-Copy 플래그에 유효한 SHM 핸들이 필요합니다(len=${shm.byteLength}).`);
  }
}

/** `key=value;key2=value2` UTF-8 요약 페이로드를 객체로 파싱한다. */
export function parseWave65KeyValueSummary(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const segment of text.split(";")) {
    const trimmed = segment.trim();
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (key) result[key] = trimmed.slice(eqIndex + 1).trim();
  }
  return result;
}

/** Wave 65 `TSNB` 바이너리 패킷을 리틀 엔디언 52+N 바이트로 인코딩한다. */
export function encodeWave65Packet(packet: Wave65IpcPacket): Uint8Array {
  if (packet.version !== WAVE65_IPC_PROTOCOL_VERSION) {
    throw new Wave65IpcCodecError("unsupported-version", `지원하지 않는 IPC 버전(기대: ${WAVE65_IPC_PROTOCOL_VERSION}, 실제: ${packet.version}).`);
  }
  if (packet.sequence < ONE_BIGINT || packet.sequence > MAX_U64_BIGINT) {
    throw new Wave65IpcCodecError("invalid-sequence", "시퀀스 번호는 1 이상의 u64 정수여야 합니다.");
  }
  if (packet.payload.byteLength > WAVE65_IPC_MAX_PAYLOAD_BYTES) {
    throw new Wave65IpcCodecError("payload-too-large", `페이로드 크기(${packet.payload.byteLength}B)가 상한(${WAVE65_IPC_MAX_PAYLOAD_BYTES}B)을 초과했습니다.`);
  }
  validateSharedMemory(packet.shm, (packet.flags & WAVE65_IPC_FLAGS.ZERO_COPY_SHM) !== 0);

  const bodyLen = WAVE65_IPC_HEADER_BYTES + packet.payload.byteLength;
  const buffer = new Uint8Array(bodyLen + WAVE65_IPC_TRAILER_BYTES);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  buffer.set(WAVE65_IPC_MAGIC_BYTES, 0);
  view.setUint16(4, packet.version, true);
  buffer[6] = WAVE65_KIND_TO_WIRE_ID[packet.kind];
  buffer[7] = WAVE65_VENDOR_TO_WIRE_ID[packet.vendor];
  writeU64Le(view, 8, packet.sequence);
  writeU64Le(view, 16, packet.shm.handleId);
  view.setUint32(24, packet.flags >>> 0, true);
  view.setUint32(28, packet.shm.byteOffset >>> 0, true);
  view.setUint32(32, packet.shm.byteLength >>> 0, true);
  view.setUint32(36, packet.frameBudgetUs >>> 0, true);
  view.setUint32(40, packet.actualLatencyUs >>> 0, true);
  view.setUint32(44, packet.payload.byteLength >>> 0, true);
  buffer.set(packet.payload, WAVE65_IPC_HEADER_BYTES);
  view.setUint32(bodyLen, computeWave65Crc32Ieee(buffer, bodyLen), true);
  return buffer;
}

/** Wave 65 `TSNB` 바이너리 패킷을 검증·디코딩한다. */
export function decodeWave65Packet(bytes: Uint8Array): DecodedWave65Packet {
  if (bytes.byteLength < WAVE65_IPC_MIN_PACKET_BYTES) {
    throw new Wave65IpcCodecError("packet-truncated", `패킷 크기(${bytes.byteLength}B)가 최소 길이(${WAVE65_IPC_MIN_PACKET_BYTES}B)보다 짧습니다.`);
  }
  for (let i = 0; i < 4; i += 1) {
    if (bytes[i] !== WAVE65_IPC_MAGIC_BYTES[i]) {
      throw new Wave65IpcCodecError("invalid-magic", "IPC 패킷 매직 바이트(TSNB)가 일치하지 않습니다.");
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, true);
  if (version !== WAVE65_IPC_PROTOCOL_VERSION) {
    throw new Wave65IpcCodecError("unsupported-version", `지원하지 않는 프로토콜 버전(기대: ${WAVE65_IPC_PROTOCOL_VERSION}, 실제: ${version}).`);
  }
  const kind = WAVE65_WIRE_ID_TO_KIND[bytes[6] ?? 0];
  if (!kind) throw new Wave65IpcCodecError("unknown-packet-kind", `알 수 없는 패킷 종류 ID: ${bytes[6] ?? 0}`);
  const vendor = WAVE65_WIRE_ID_TO_VENDOR[bytes[7] ?? 0];
  if (!vendor) throw new Wave65IpcCodecError("unknown-vendor", `알 수 없는 벤더 와이어 ID: ${bytes[7] ?? 0}`);
  const sequence = readU64Le(view, 8);
  if (sequence === ZERO_BIGINT) throw new Wave65IpcCodecError("invalid-sequence", "시퀀스 번호는 0일 수 없습니다.");

  const shm: Wave65SharedMemoryMeta = { handleId: readU64Le(view, 16), byteOffset: view.getUint32(28, true), byteLength: view.getUint32(32, true) };
  const flags = view.getUint32(24, true);
  const frameBudgetUs = view.getUint32(36, true);
  const actualLatencyUs = view.getUint32(40, true);
  const payloadLen = view.getUint32(44, true);
  if (payloadLen > WAVE65_IPC_MAX_PAYLOAD_BYTES) {
    throw new Wave65IpcCodecError("payload-too-large", `페이로드 길이(${payloadLen}B)가 상한(${WAVE65_IPC_MAX_PAYLOAD_BYTES}B)을 초과했습니다.`);
  }
  const expectedLen = WAVE65_IPC_HEADER_BYTES + payloadLen + WAVE65_IPC_TRAILER_BYTES;
  if (bytes.byteLength !== expectedLen) {
    throw new Wave65IpcCodecError("length-mismatch", `패킷 총 길이 불일치(기대: ${expectedLen}B, 실제: ${bytes.byteLength}B).`);
  }
  const bodyEnd = WAVE65_IPC_HEADER_BYTES + payloadLen;
  const headerCrc = view.getUint32(bodyEnd, true);
  const computedCrc = computeWave65Crc32Ieee(bytes, bodyEnd);
  if (headerCrc !== computedCrc) {
    throw new Wave65IpcCodecError("crc-mismatch", `CRC-32 무결성 검증 실패(패킷: 0x${headerCrc.toString(16)}, 계산: 0x${computedCrc.toString(16)}).`);
  }
  validateSharedMemory(shm, (flags & WAVE65_IPC_FLAGS.ZERO_COPY_SHM) !== 0);

  const payload = bytes.slice(WAVE65_IPC_HEADER_BYTES, bodyEnd);
  const payloadText = UTF8_DECODER.decode(payload);
  return { version, kind, vendor, sequence, shm, flags, frameBudgetUs, actualLatencyUs, payload, crc32: headerCrc, payloadText, summary: parseWave65KeyValueSummary(payloadText) };
}

export interface ResolveGpuNpuDaemonBinaryOptions {
  readonly explicitPath?: string; readonly repoRoot?: string; readonly env?: NodeJS.ProcessEnv;
}

async function isExecutableFile(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    if (process.platform !== "win32") await access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** 컴파일된 `studio-gpu-npu-bridge-daemon` 실행 파일 경로를 우선순위에 따라 탐색한다. */
export async function resolveGpuNpuDaemonBinaryPath(options: ResolveGpuNpuDaemonBinaryOptions = {}): Promise<string | null> {
  const env = options.env ?? process.env;
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const exeName = process.platform === "win32" ? "studio-gpu-npu-bridge-daemon.exe" : "studio-gpu-npu-bridge-daemon";
  const targetDir = join(repoRoot, "crates/studio-native-gpu-npu-bridge/target");
  const candidates: string[] = [];
  if (options.explicitPath?.trim()) candidates.push(resolve(options.explicitPath.trim()));
  if (env.TOONSTUDIO_GPU_NPU_DAEMON_BIN?.trim()) candidates.push(resolve(env.TOONSTUDIO_GPU_NPU_DAEMON_BIN.trim()));
  candidates.push(join(targetDir, "release", exeName), join(targetDir, "debug", exeName));

  for (const candidate of candidates) {
    if (await isExecutableFile(candidate)) return candidate;
  }
  return null;
}

export interface HostDaemonProbeReport {
  readonly protocol_version: number; readonly host_os: string; readonly rust_os: string; readonly host_arch: string;
  readonly probe: {
    readonly os: string; readonly vendor: string; readonly device_name: string; readonly driver_version: string;
    readonly vram_mb: number; readonly unified_memory: boolean; readonly target_fps: number; readonly descriptor: string;
  };
  readonly plan: {
    readonly vendor: string; readonly os: string; readonly backend: string; readonly upscaler: string;
    readonly low_latency: string; readonly npu: string; readonly transport: string;
    readonly is_native_accelerated: boolean; readonly zero_copy_enabled: boolean; readonly target_fps: number;
    readonly frame_budget_us: number; readonly recommended_flags: number; readonly estimated_speedup_x100: number;
    readonly session_fingerprint: number; readonly fallback_reason: string | null;
  };
}

/** 데몬 바이너리를 `--probe-host` 일회성 CLI 모드로 실행해 호스트 프로브 JSON을 조회한다. */
export function probeHostWithGpuNpuDaemon(binaryPath: string, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS): Promise<HostDaemonProbeReport> {
  return new Promise<HostDaemonProbeReport>((resolvePromise, rejectPromise) => {
    execFile(binaryPath, ["--probe-host"], { encoding: "utf8", timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        rejectPromise(new Error(`--probe-host 실행 실패: ${err.message}${stderr ? ` (${stderr.trim()})` : ""}`));
        return;
      }
      try {
        resolvePromise(JSON.parse(stdout.trim()) as HostDaemonProbeReport);
      } catch (parseErr) {
        rejectPromise(new Error(`--probe-host JSON 파싱 실패: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`));
      }
    });
  });
}

export interface DesktopNativeGpuNpuDaemonClientOptions {
  readonly binaryPath?: string; readonly repoRoot?: string; readonly requestTimeoutMs?: number; readonly env?: NodeJS.ProcessEnv;
}

export interface DesktopFrameSubmitInput {
  readonly vendor?: Wave65GpuVendor; readonly shm?: Wave65SharedMemoryMeta; readonly flags?: number;
  readonly frameBudgetUs?: number; readonly actualLatencyUs?: number; readonly payload?: Uint8Array | string; readonly sequence?: bigint;
}

interface PendingTurn {
  readonly requestBytes: Uint8Array; readonly timeoutMs: number;
  readonly resolve: (response: Uint8Array) => void; readonly reject: (error: Error) => void;
}
interface ActiveTurn {
  readonly timer: ReturnType<typeof setTimeout>;
  readonly resolve: (response: Uint8Array) => void; readonly reject: (error: Error) => void;
}

/** 실제 컴파일된 Rust `studio-gpu-npu-bridge-daemon` 자식 프로세스와 길이 접두(`u32 LE`) stdio 프레임으로 통신한다. */
export class DesktopNativeGpuNpuDaemonClient {
  private readonly options: DesktopNativeGpuNpuDaemonClientOptions;
  private readonly defaultTimeoutMs: number;
  private child: ChildProcessWithoutNullStreams | null = null;
  private resolvedBinaryPath: string | null = null;
  private running = false;
  private rxBuffer: Buffer = Buffer.alloc(0);
  private stderrTail = "";
  private activeTurn: ActiveTurn | null = null;
  private readonly queue: PendingTurn[] = [];
  private nextSequence: bigint = ONE_BIGINT;
  private activeVendor: Wave65GpuVendor = "webgpu-fallback";
  private activeFrameBudgetUs = 8_333;
  private negotiatedPlanSummary: Record<string, string> | null = null;

  constructor(options: DesktopNativeGpuNpuDaemonClientOptions = {}) {
    this.options = options;
    this.defaultTimeoutMs = Math.max(50, options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);
  }

  get isRunning(): boolean { return this.running && this.child !== null && this.child.exitCode === null; }
  get binaryPath(): string | null { return this.resolvedBinaryPath; }
  get lastNegotiatedPlan(): Readonly<Record<string, string>> | null {
    return this.negotiatedPlanSummary ? { ...this.negotiatedPlanSummary } : null;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;
    const resolved = await resolveGpuNpuDaemonBinaryPath({
      explicitPath: this.options.binaryPath, repoRoot: this.options.repoRoot, env: this.options.env,
    });
    if (!resolved) {
      throw new Error("컴파일된 studio-gpu-npu-bridge-daemon 바이너리를 찾을 수 없습니다. cargo build를 먼저 실행하세요.");
    }
    this.resolvedBinaryPath = resolved;
    this.rxBuffer = Buffer.alloc(0);
    this.stderrTail = "";
    const proc = spawn(resolved, [], { stdio: ["pipe", "pipe", "pipe"], windowsHide: true, env: this.options.env ?? process.env });
    this.child = proc;

    await new Promise<void>((resolveSpawn, rejectSpawn) => {
      let settled = false;
      const onSpawn = (): void => {
        if (settled) return;
        settled = true;
        proc.off("error", onError);
        this.running = true;
        resolveSpawn();
      };
      const onError = (err: Error): void => {
        if (settled) return;
        settled = true;
        proc.off("spawn", onSpawn);
        this.running = false;
        this.child = null;
        rejectSpawn(new Error(`GPU/NPU 데몬 실행 실패: ${err.message}`));
      };
      proc.once("spawn", onSpawn);
      proc.once("error", onError);
    });

    proc.stdout.on("data", (chunk: Buffer) => this.handleStdoutChunk(chunk));
    proc.stderr.on("data", (chunk: Buffer) => {
      const next = this.stderrTail + chunk.toString("utf8");
      this.stderrTail = next.length > 2048 ? next.slice(next.length - 2048) : next;
    });
    proc.once("exit", (code, signal) => {
      const suffix = this.stderrTail ? `, stderr=${this.stderrTail.trim()}` : "";
      this.running = false;
      if (this.child === proc) this.child = null;
      this.failAllPending(new Error(`GPU/NPU 데몬 종료(code=${String(code)}, signal=${String(signal)}${suffix}).`));
    });
    proc.once("error", (err: Error) => {
      this.running = false;
      if (this.child === proc) this.child = null;
      this.failAllPending(new Error(`GPU/NPU 데몬 프로세스 오류: ${err.message}`));
    });
  }

  async close(): Promise<void> {
    const proc = this.child;
    this.running = false;
    this.child = null;
    this.rxBuffer = Buffer.alloc(0);
    this.failAllPending(new Error("GPU/NPU 데몬 클라이언트가 종료되었습니다."));
    if (!proc || proc.exitCode !== null) return;

    await new Promise<void>((resolveClose) => {
      let done = false;
      const finish = (): void => {
        if (done) return;
        done = true;
        clearTimeout(killTimer);
        resolveClose();
      };
      const killTimer = setTimeout(() => {
        if (proc.exitCode === null) proc.kill("SIGKILL");
        finish();
      }, 1_500);
      proc.once("exit", finish);
      try { proc.stdin.end(); } catch { proc.kill("SIGTERM"); }
    });
  }

  sendRawPacket(rawBytes: Uint8Array, timeoutMs = this.defaultTimeoutMs): Promise<Uint8Array> {
    if (!this.isRunning) return Promise.reject(new Error("GPU/NPU 데몬이 실행 중이 아닙니다. 먼저 start()를 호출하세요."));
    if (rawBytes.byteLength === 0 || rawBytes.byteLength > WAVE65_IPC_MAX_PACKET_BYTES) {
      return Promise.reject(new RangeError(`IPC 패킷 크기(${rawBytes.byteLength}B)가 허용 범위(1..=${WAVE65_IPC_MAX_PACKET_BYTES}B) 밖입니다.`));
    }
    const requestBytes = new Uint8Array(rawBytes);
    return new Promise<Uint8Array>((resolvePromise, rejectPromise) => {
      this.queue.push({ requestBytes, timeoutMs: Math.max(50, timeoutMs), resolve: resolvePromise, reject: rejectPromise });
      this.pumpQueue();
    });
  }

  async handshake(probeOverride?: string): Promise<DecodedWave65Packet & { readonly negotiatedSummary: Record<string, string> }> {
    const decoded = await this.sendKind("handshake-request", probeOverride ? UTF8_ENCODER.encode(probeOverride) : new Uint8Array(0));
    const negotiatedSummary = { ...decoded.summary };
    if (decoded.kind === "handshake-response") {
      this.negotiatedPlanSummary = negotiatedSummary;
      this.activeVendor = decoded.vendor;
      if (decoded.frameBudgetUs > 0) this.activeFrameBudgetUs = decoded.frameBudgetUs;
    }
    return { ...decoded, negotiatedSummary };
  }

  async submitFrame(input: DesktopFrameSubmitInput = {}): Promise<DecodedWave65Packet> {
    const payload = typeof input.payload === "string" ? UTF8_ENCODER.encode(input.payload) : (input.payload ?? new Uint8Array(0));
    return this.sendKind("frame-submit", payload, input);
  }

  async prewarmPso(wgslHint: string): Promise<DecodedWave65Packet> {
    return this.sendKind("pso-prewarm-hint", UTF8_ENCODER.encode(wgslHint));
  }

  async heartbeat(): Promise<DecodedWave65Packet> {
    return this.sendKind("heartbeat", new Uint8Array(0));
  }

  private async sendKind(kind: Wave65IpcPacketKind, payload: Uint8Array, opts: DesktopFrameSubmitInput = {}): Promise<DecodedWave65Packet> {
    const packet = encodeWave65Packet({
      version: WAVE65_IPC_PROTOCOL_VERSION,
      kind,
      vendor: opts.vendor ?? this.activeVendor,
      sequence: this.allocateSequence(opts.sequence),
      shm: opts.shm ?? EMPTY_SHM,
      flags: opts.flags ?? 0,
      frameBudgetUs: opts.frameBudgetUs ?? this.activeFrameBudgetUs,
      actualLatencyUs: opts.actualLatencyUs ?? 0,
      payload,
    });
    return decodeWave65Packet(await this.sendRawPacket(packet));
  }

  private allocateSequence(override?: bigint): bigint {
    if (override !== undefined) {
      if (override >= this.nextSequence) this.nextSequence = override + ONE_BIGINT;
      return override;
    }
    const current = this.nextSequence;
    this.nextSequence += ONE_BIGINT;
    return current;
  }

  private pumpQueue(): void {
    if (this.activeTurn !== null || this.queue.length === 0) return;
    const proc = this.child;
    if (!proc || !this.isRunning) {
      this.failAllPending(new Error("GPU/NPU 데몬 연결이 닫혀 있습니다."));
      return;
    }
    const next = this.queue.shift();
    if (!next) return;

    const timer = setTimeout(() => {
      if (!this.activeTurn) return;
      const timedOut = this.activeTurn;
      this.activeTurn = null;
      timedOut.reject(new Error(`GPU/NPU 데몬 IPC 응답 시간 초과(${next.timeoutMs}ms).`));
      this.pumpQueue();
    }, next.timeoutMs);

    this.activeTurn = { timer, resolve: next.resolve, reject: next.reject };
    const header = Buffer.allocUnsafe(4);
    header.writeUInt32LE(next.requestBytes.byteLength, 0);
    const body = Buffer.from(next.requestBytes.buffer, next.requestBytes.byteOffset, next.requestBytes.byteLength);
    proc.stdin.write(Buffer.concat([header, body]), (writeErr) => {
      if (writeErr && this.activeTurn) {
        const failed = this.activeTurn;
        this.activeTurn = null;
        clearTimeout(failed.timer);
        failed.reject(new Error(`GPU/NPU 데몬 stdin 기록 실패: ${writeErr.message}`));
        this.pumpQueue();
      }
    });
  }

  private handleStdoutChunk(chunk: Buffer): void {
    this.rxBuffer = this.rxBuffer.length === 0 ? chunk : Buffer.concat([this.rxBuffer, chunk]);
    while (this.rxBuffer.length >= 4) {
      const frameLen = this.rxBuffer.readUInt32LE(0);
      if (frameLen === 0 || frameLen > WAVE65_IPC_MAX_PACKET_BYTES) {
        this.rxBuffer = Buffer.alloc(0);
        this.failAllPending(new Error(`데몬으로부터 비정상 프레임 길이(${frameLen}B)를 수신했습니다.`));
        return;
      }
      if (this.rxBuffer.length < 4 + frameLen) return;
      const payloadBytes = new Uint8Array(this.rxBuffer.subarray(4, 4 + frameLen));
      this.rxBuffer = this.rxBuffer.subarray(4 + frameLen);
      if (this.activeTurn) {
        const settled = this.activeTurn;
        this.activeTurn = null;
        clearTimeout(settled.timer);
        settled.resolve(payloadBytes);
        this.pumpQueue();
      }
    }
  }

  private failAllPending(error: Error): void {
    if (this.activeTurn) {
      const active = this.activeTurn;
      this.activeTurn = null;
      clearTimeout(active.timer);
      active.reject(error);
    }
    while (this.queue.length > 0) this.queue.shift()?.reject(error);
  }
}

export interface LoopbackGpuNpuBridgeServerOptions {
  readonly port?: number; readonly token?: string; readonly binaryPath?: string; readonly repoRoot?: string;
  readonly client?: DesktopNativeGpuNpuDaemonClient; readonly requestTimeoutMs?: number;
  readonly allowedOrigins?: readonly string[]; readonly env?: NodeJS.ProcessEnv;
}

export interface LoopbackGpuNpuBridgeServerHandle {
  readonly host: "127.0.0.1"; readonly port: number; readonly baseUrl: string;
  readonly token: string; readonly client: DesktopNativeGpuNpuDaemonClient; readonly close: () => Promise<void>;
}

function isAllowedOrigin(origin: string, extraAllowed?: readonly string[]): boolean {
  if (extraAllowed?.includes(origin) || origin === "https://www.toonstudio.cloud") return true;
  try {
    const u = new URL(origin);
    return u.protocol === "http:" && !u.username && !u.password && u.pathname === "/" && !u.search && !u.hash &&
      (u.hostname === "127.0.0.1" || u.hostname === "localhost");
  } catch {
    return false;
  }
}

function extractBridgeToken(req: IncomingMessage): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === "string" && auth.startsWith("Bearer ")) {
    const token = auth.slice(7).trim();
    if (token.length > 0) return token;
  }
  const custom = req.headers["x-toonstudio-bridge-token"];
  return typeof custom === "string" && custom.trim().length > 0 ? custom.trim() : null;
}

function verifyTokenConstantTime(candidate: string | null, expected: string): boolean {
  if (!candidate) return false;
  const a = Buffer.from(candidate, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.byteLength === b.byteLength && timingSafeEqual(a, b);
}

function buildResponseHeaders(contentType: string, byteLength: number, corsOrigin: string | null): Record<string, string | number> {
  const headers: Record<string, string | number> = {
    "Content-Type": contentType,
    "Content-Length": byteLength,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (corsOrigin) {
    headers["Access-Control-Allow-Origin"] = corsOrigin;
    headers.Vary = "Origin";
  }
  return headers;
}

function writeJsonResponse(res: ServerResponse, statusCode: number, body: Record<string, unknown>, corsOrigin: string | null): void {
  const payload = Buffer.from(JSON.stringify(body), "utf8");
  res.writeHead(statusCode, buildResponseHeaders("application/json; charset=utf-8", payload.byteLength, corsOrigin));
  res.end(payload);
}

function readBinaryBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<{ readonly ok: true; readonly bytes: Uint8Array } | { readonly ok: false; readonly status: number; readonly error: string }> {
  const chunks: Buffer[] = [];
  let total = 0;
  return new Promise((resolveBody) => {
    let settled = false;
    req.on("data", (chunk: Buffer) => {
      if (settled) return;
      total += chunk.byteLength;
      if (total > maxBytes) {
        settled = true;
        resolveBody({ ok: false, status: 413, error: `IPC 요청 크기가 상한(${maxBytes}B)을 초과했습니다.` });
        req.resume();
        return;
      }
      chunks.push(chunk);
    });
    req.once("end", () => {
      if (settled) return;
      settled = true;
      resolveBody({ ok: true, bytes: new Uint8Array(chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks, total)) });
    });
    req.once("error", (err) => {
      if (settled) return;
      settled = true;
      resolveBody({ ok: false, status: 400, error: `요청 스트림 읽기 실패: ${err.message}` });
    });
  });
}

/** `127.0.0.1` 루프백 전용 하드닝 GPU/NPU 브릿지 HTTP 서버를 기동한다. */
export async function startLoopbackGpuNpuBridgeServer(options: LoopbackGpuNpuBridgeServerOptions = {}): Promise<LoopbackGpuNpuBridgeServerHandle> {
  const token = options.token?.trim() || randomBytes(32).toString("hex");
  const ownsClient = !options.client;
  const client = options.client ?? new DesktopNativeGpuNpuDaemonClient({
    binaryPath: options.binaryPath, repoRoot: options.repoRoot, requestTimeoutMs: options.requestTimeoutMs, env: options.env,
  });

  if (!client.isRunning) await client.start();
  if (!client.lastNegotiatedPlan) await client.handshake();

  const server: Server = createServer((req, res) => { void handleHttpRequest(req, res, client, token, options.allowedOrigins); });
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(options.port ?? 0, LOOPBACK_HOST, () => { server.off("error", rejectListen); resolveListen(); });
  });

  const address = server.address() as AddressInfo | null;
  if (!address || typeof address === "string") {
    server.close();
    if (ownsClient) await client.close();
    throw new Error("루프백 GPU/NPU 브릿지 서버 포트 정보를 확인할 수 없습니다.");
  }

  return {
    host: LOOPBACK_HOST,
    port: address.port,
    baseUrl: `http://${LOOPBACK_HOST}:${address.port}`,
    token,
    client,
    close: async () => {
      await new Promise<void>((done) => { server.close(() => done()); });
      if (ownsClient) await client.close();
    },
  };
}

async function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  client: DesktopNativeGpuNpuDaemonClient,
  expectedToken: string,
  extraAllowedOrigins?: readonly string[],
): Promise<void> {
  const originHeader = typeof req.headers.origin === "string" ? req.headers.origin : null;
  if (originHeader !== null && !isAllowedOrigin(originHeader, extraAllowedOrigins)) {
    writeJsonResponse(res, 403, { error: "origin-forbidden", message: "허용되지 않은 Origin 요청입니다." }, null);
    return;
  }
  if (req.method === "OPTIONS") {
    const headers: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type, X-ToonStudio-Bridge-Token",
      "Cache-Control": "no-store",
    };
    if (originHeader) { headers["Access-Control-Allow-Origin"] = originHeader; headers.Vary = "Origin"; }
    res.writeHead(204, headers);
    res.end();
    return;
  }
  if (!verifyTokenConstantTime(extractBridgeToken(req), expectedToken)) {
    writeJsonResponse(res, 401, { error: "unauthorized", message: "유효한 브릿지 세션 토큰이 필요합니다." }, originHeader);
    return;
  }

  const pathname = new URL(req.url ?? "/", `http://${LOOPBACK_HOST}`).pathname;
  try {
    if (req.method === "GET" && pathname === "/v1/gpu-npu/health") {
      const hb = client.isRunning ? await client.heartbeat() : null;
      const plan = client.lastNegotiatedPlan;
      writeJsonResponse(res, 200, {
        ok: client.isRunning, protocolVersion: WAVE65_IPC_PROTOCOL_VERSION, daemonRunning: client.isRunning,
        vendor: hb?.vendor ?? plan?.vendor ?? "webgpu-fallback", negotiatedPlan: plan, heartbeat: hb?.summary ?? null,
      }, originHeader);
      return;
    }
    if (req.method === "GET" && pathname === "/v1/gpu-npu/probe") {
      const hs = await client.handshake();
      writeJsonResponse(res, 200, {
        ok: hs.kind === "handshake-response", protocolVersion: hs.version, vendor: hs.vendor,
        frameBudgetUs: hs.frameBudgetUs, flags: hs.flags, negotiatedPlan: hs.negotiatedSummary,
      }, originHeader);
      return;
    }
    if (req.method === "POST" && pathname === "/v1/gpu-npu/ipc") {
      const body = await readBinaryBody(req, MAX_HTTP_IPC_BODY_BYTES);
      if (!body.ok) {
        writeJsonResponse(res, body.status, { error: "invalid-ipc-body", message: body.error }, originHeader);
        return;
      }
      if (body.bytes.byteLength === 0 || body.bytes.byteLength > WAVE65_IPC_MAX_PACKET_BYTES) {
        writeJsonResponse(res, 400, { error: "invalid-packet-size", message: `IPC 패킷 크기가 유효 범위(1..=${WAVE65_IPC_MAX_PACKET_BYTES}B) 밖입니다.` }, originHeader);
        return;
      }
      const rawResponse = await client.sendRawPacket(body.bytes);
      const responseBuf = Buffer.from(rawResponse.buffer, rawResponse.byteOffset, rawResponse.byteLength);
      res.writeHead(200, buildResponseHeaders("application/octet-stream", responseBuf.byteLength, originHeader));
      res.end(responseBuf);
      return;
    }
    writeJsonResponse(res, 404, { error: "not-found", message: `지원하지 않는 엔드포인트입니다: ${pathname}` }, originHeader);
  } catch (err) {
    writeJsonResponse(res, 502, { error: "daemon-bridge-error", message: err instanceof Error ? err.message : String(err) }, originHeader);
  }
}
