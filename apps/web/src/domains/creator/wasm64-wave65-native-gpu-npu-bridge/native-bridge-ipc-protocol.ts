/**
 * Wave 65 데스크톱 네이티브 GPU/NPU 브릿지 바이너리 IPC 프로토콜 및 서킷브레이커 클라이언트.
 *
 * Rust 크레이트(`crates/studio-native-gpu-npu-bridge`)와 바이트-정확히 호환되는
 * 리틀 엔디언 프레임 인코더/디코더(IEEE 802.3 CRC-32), 단조 시퀀스 검증,
 * 호출별 타임아웃 가드 및 3회 연속 실패 자동 서킷브레이커 폴백을 제공한다.
 */

export const IPC_MAGIC_BYTES: readonly [number, number, number, number] = [0x54, 0x53, 0x4e, 0x42];
export const IPC_PROTOCOL_VERSION = 1;
export const IPC_HEADER_BYTES = 48;
export const IPC_TRAILER_BYTES = 4;
export const IPC_MIN_PACKET_BYTES = IPC_HEADER_BYTES + IPC_TRAILER_BYTES;
export const IPC_MAX_PAYLOAD_BYTES = 65_536;

export const IPC_FLAGS = {
  ZERO_COPY_SHM: 1 << 0,
  LOW_LATENCY_MARK: 1 << 1,
  NPU_ASSISTED: 1 << 2,
  MULTI_FRAME_GEN: 1 << 3,
  FALLBACK_WEBGPU: 1 << 4,
} as const;

export type GpuVendor =
  | "webgpu-fallback"
  | "apple"
  | "nvidia"
  | "amd"
  | "intel"
  | "arm"
  | "qualcomm";

export type IpcPacketKind =
  | "handshake-request"
  | "handshake-response"
  | "frame-submit"
  | "frame-complete"
  | "pso-prewarm-hint"
  | "heartbeat"
  | "error-notice";

export interface SharedMemoryHandleMeta {
  readonly handleId: bigint;
  readonly byteOffset: number;
  readonly byteLength: number;
}

export interface IpcFramePacket {
  readonly version: number;
  readonly kind: IpcPacketKind;
  readonly vendor: GpuVendor;
  readonly sequence: bigint;
  readonly shm: SharedMemoryHandleMeta;
  readonly flags: number;
  readonly frameBudgetUs: number;
  readonly actualLatencyUs: number;
  readonly payload: Uint8Array;
}

export type IpcDecodeErrorCode =
  | "packet-truncated"
  | "invalid-magic"
  | "unsupported-version"
  | "unknown-packet-kind"
  | "unknown-vendor"
  | "invalid-sequence"
  | "payload-too-large"
  | "length-mismatch"
  | "crc-mismatch"
  | "invalid-shm-handle"
  | "shm-range-overflow";

export class IpcProtocolError extends Error {
  readonly code: IpcDecodeErrorCode;

  constructor(code: IpcDecodeErrorCode, message: string) {
    super(message);
    this.name = "IpcProtocolError";
    this.code = code;
  }
}

export const VENDOR_TO_WIRE_ID: Readonly<Record<GpuVendor, number>> = {
  "webgpu-fallback": 0,
  apple: 1,
  nvidia: 2,
  amd: 3,
  intel: 4,
  arm: 5,
  qualcomm: 6,
};

export const WIRE_ID_TO_VENDOR: Readonly<Record<number, GpuVendor>> = {
  0: "webgpu-fallback",
  1: "apple",
  2: "nvidia",
  3: "amd",
  4: "intel",
  5: "arm",
  6: "qualcomm",
};

export const IPC_PACKET_KIND_TO_WIRE: Readonly<Record<IpcPacketKind, number>> = {
  "handshake-request": 1,
  "handshake-response": 2,
  "frame-submit": 3,
  "frame-complete": 4,
  "pso-prewarm-hint": 5,
  heartbeat: 6,
  "error-notice": 7,
};

export const WIRE_TO_IPC_PACKET_KIND: Readonly<Record<number, IpcPacketKind>> = {
  1: "handshake-request",
  2: "handshake-response",
  3: "frame-submit",
  4: "frame-complete",
  5: "pso-prewarm-hint",
  6: "heartbeat",
  7: "error-notice",
};

const ZERO_BIGINT = BigInt(0);
const ONE_BIGINT = BigInt(1);
const SHIFT_32_BIGINT = BigInt(32);
const U32_MASK_BIGINT = BigInt(0xffffffff);
const MAX_U64_BIGINT = (ONE_BIGINT << BigInt(64)) - ONE_BIGINT;
const MAX_U32 = 0xffffffff;

function buildCrc32Table(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let crc = i;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) !== 0 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    table[i] = crc >>> 0;
  }
  return table;
}

const CRC32_TABLE = buildCrc32Table();

/** IEEE 802.3 CRC-32 체크섬을 계산한다 (Rust `crc32_ieee`와 바이트-정확히 일치). */
export function computeCrc32Ieee(bytes: Uint8Array, length = bytes.length): number {
  let crc = 0xffffffff;
  const end = Math.min(length, bytes.length);
  for (let i = 0; i < end; i += 1) {
    const lookup = (crc ^ bytes[i]) & 0xff;
    crc = (crc >>> 8) ^ CRC32_TABLE[lookup];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU64Le(view: DataView, offset: number, value: bigint): void {
  const low = Number(value & U32_MASK_BIGINT);
  const high = Number((value >> SHIFT_32_BIGINT) & U32_MASK_BIGINT);
  view.setUint32(offset, low, true);
  view.setUint32(offset + 4, high, true);
}

function readU64Le(view: DataView, offset: number): bigint {
  const low = BigInt(view.getUint32(offset, true));
  const high = BigInt(view.getUint32(offset + 4, true));
  return low | (high << SHIFT_32_BIGINT);
}

function validateSharedMemory(shm: SharedMemoryHandleMeta, requireZeroCopy: boolean): void {
  if (shm.handleId < ZERO_BIGINT || shm.handleId > MAX_U64_BIGINT) {
    throw new IpcProtocolError("invalid-shm-handle", "공유 메모리 핸들 ID가 u64 범위를 벗어났습니다.");
  }
  if (!Number.isInteger(shm.byteOffset) || shm.byteOffset < 0 || shm.byteOffset > MAX_U32) {
    throw new IpcProtocolError("shm-range-overflow", "공유 메모리 오프셋이 u32 범위를 벗어났습니다.");
  }
  if (!Number.isInteger(shm.byteLength) || shm.byteLength < 0 || shm.byteLength > MAX_U32) {
    throw new IpcProtocolError("shm-range-overflow", "공유 메모리 길이가 u32 범위를 벗어났습니다.");
  }
  if (requireZeroCopy && (shm.handleId === ZERO_BIGINT || shm.byteLength === 0)) {
    throw new IpcProtocolError(
      "invalid-shm-handle",
      `Zero-Copy 플래그가 켜진 경우 유효한 핸들과 크기가 필요합니다(len=${shm.byteLength}).`,
    );
  }
  if (shm.byteOffset + shm.byteLength > MAX_U32) {
    throw new IpcProtocolError(
      "shm-range-overflow",
      `공유 메모리 범위(${shm.byteOffset} + ${shm.byteLength})가 u32 상한을 초과했습니다.`,
    );
  }
}

/** IPC 프레임 패킷을 Rust 크레이트와 동일한 52+N 바이트 리틀 엔디언 프레임으로 직렬화한다. */
export function encodeIpcFramePacket(packet: IpcFramePacket): Uint8Array {
  if (packet.version !== IPC_PROTOCOL_VERSION) {
    throw new IpcProtocolError(
      "unsupported-version",
      `지원하지 않는 IPC 프로토콜 버전입니다(기대: ${IPC_PROTOCOL_VERSION}, 실제: ${packet.version}).`,
    );
  }
  if (packet.sequence < ONE_BIGINT || packet.sequence > MAX_U64_BIGINT) {
    throw new IpcProtocolError("invalid-sequence", "시퀀스 번호는 1 이상의 u64 정수여야 합니다.");
  }
  if (packet.payload.byteLength > IPC_MAX_PAYLOAD_BYTES) {
    throw new IpcProtocolError(
      "payload-too-large",
      `페이로드 크기(${packet.payload.byteLength}B)가 상한(${IPC_MAX_PAYLOAD_BYTES}B)을 초과했습니다.`,
    );
  }
  validateSharedMemory(packet.shm, (packet.flags & IPC_FLAGS.ZERO_COPY_SHM) !== 0);

  const bodyLen = IPC_HEADER_BYTES + packet.payload.byteLength;
  const buffer = new Uint8Array(bodyLen + IPC_TRAILER_BYTES);
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  buffer[0] = IPC_MAGIC_BYTES[0];
  buffer[1] = IPC_MAGIC_BYTES[1];
  buffer[2] = IPC_MAGIC_BYTES[2];
  buffer[3] = IPC_MAGIC_BYTES[3];
  view.setUint16(4, packet.version, true);
  buffer[6] = IPC_PACKET_KIND_TO_WIRE[packet.kind];
  buffer[7] = VENDOR_TO_WIRE_ID[packet.vendor];
  writeU64Le(view, 8, packet.sequence);
  writeU64Le(view, 16, packet.shm.handleId);
  view.setUint32(24, packet.flags >>> 0, true);
  view.setUint32(28, packet.shm.byteOffset >>> 0, true);
  view.setUint32(32, packet.shm.byteLength >>> 0, true);
  view.setUint32(36, packet.frameBudgetUs >>> 0, true);
  view.setUint32(40, packet.actualLatencyUs >>> 0, true);
  view.setUint32(44, packet.payload.byteLength >>> 0, true);
  buffer.set(packet.payload, IPC_HEADER_BYTES);

  const crc = computeCrc32Ieee(buffer, bodyLen);
  view.setUint32(bodyLen, crc, true);
  return buffer;
}

/** 바이너리 프레임에서 IPC 패킷을 디코딩하고 매직·버전·길이·CRC32·SHM 무결성을 검증한다. */
export function decodeIpcFramePacket(bytes: Uint8Array): IpcFramePacket {
  if (bytes.byteLength < IPC_MIN_PACKET_BYTES) {
    throw new IpcProtocolError(
      "packet-truncated",
      `패킷 크기(${bytes.byteLength}B)가 최소 길이(${IPC_MIN_PACKET_BYTES}B)보다 짧습니다.`,
    );
  }
  if (
    bytes[0] !== IPC_MAGIC_BYTES[0] ||
    bytes[1] !== IPC_MAGIC_BYTES[1] ||
    bytes[2] !== IPC_MAGIC_BYTES[2] ||
    bytes[3] !== IPC_MAGIC_BYTES[3]
  ) {
    throw new IpcProtocolError("invalid-magic", "IPC 패킷 매직 바이트(TSNB)가 일치하지 않습니다.");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(4, true);
  if (version !== IPC_PROTOCOL_VERSION) {
    throw new IpcProtocolError(
      "unsupported-version",
      `지원하지 않는 프로토콜 버전입니다(기대: ${IPC_PROTOCOL_VERSION}, 실제: ${version}).`,
    );
  }

  const kind = WIRE_TO_IPC_PACKET_KIND[bytes[6]];
  if (!kind) {
    throw new IpcProtocolError("unknown-packet-kind", `알 수 없는 패킷 종류 ID: ${bytes[6]}`);
  }
  const vendor = WIRE_ID_TO_VENDOR[bytes[7]];
  if (!vendor) {
    throw new IpcProtocolError("unknown-vendor", `알 수 없는 벤더 와이어 ID: ${bytes[7]}`);
  }

  const sequence = readU64Le(view, 8);
  if (sequence === ZERO_BIGINT) {
    throw new IpcProtocolError("invalid-sequence", "시퀀스 번호는 0일 수 없습니다.");
  }

  const handleId = readU64Le(view, 16);
  const flags = view.getUint32(24, true);
  const byteOffset = view.getUint32(28, true);
  const byteLength = view.getUint32(32, true);
  const frameBudgetUs = view.getUint32(36, true);
  const actualLatencyUs = view.getUint32(40, true);
  const payloadLen = view.getUint32(44, true);

  if (payloadLen > IPC_MAX_PAYLOAD_BYTES) {
    throw new IpcProtocolError(
      "payload-too-large",
      `페이로드 길이(${payloadLen}B)가 상한(${IPC_MAX_PAYLOAD_BYTES}B)을 초과했습니다.`,
    );
  }

  const expectedLen = IPC_HEADER_BYTES + payloadLen + IPC_TRAILER_BYTES;
  if (bytes.byteLength !== expectedLen) {
    throw new IpcProtocolError(
      "length-mismatch",
      `패킷 총 길이 불일치(기대: ${expectedLen}B, 실제: ${bytes.byteLength}B).`,
    );
  }

  const bodyEnd = IPC_HEADER_BYTES + payloadLen;
  const headerCrc = view.getUint32(bodyEnd, true);
  const computedCrc = computeCrc32Ieee(bytes, bodyEnd);
  if (headerCrc !== computedCrc) {
    throw new IpcProtocolError(
      "crc-mismatch",
      `CRC-32 무결성 검증 실패(패킷: 0x${headerCrc.toString(16)}, 계산: 0x${computedCrc.toString(16)}).`,
    );
  }

  const shm: SharedMemoryHandleMeta = { handleId, byteOffset, byteLength };
  validateSharedMemory(shm, (flags & IPC_FLAGS.ZERO_COPY_SHM) !== 0);

  return {
    version,
    kind,
    vendor,
    sequence,
    shm,
    flags,
    frameBudgetUs,
    actualLatencyUs,
    payload: bytes.slice(IPC_HEADER_BYTES, bodyEnd),
  };
}

export type CircuitBreakerState = "closed" | "open" | "half-open";

export interface NativeBridgeTransport {
  sendFrame(packetBytes: Uint8Array, timeoutMs: number): Promise<Uint8Array>;
}

export interface NativeBridgeIpcClientOptions {
  readonly transport: NativeBridgeTransport;
  readonly timeoutMs?: number;
  readonly failureThreshold?: number;
  readonly cooldownMs?: number;
  readonly nowMs?: () => number;
}

export interface NativeBridgeCallSuccess {
  readonly ok: true;
  readonly response: IpcFramePacket;
  readonly roundTripMs: number;
  readonly circuitState: CircuitBreakerState;
}

export interface NativeBridgeCallFallback {
  readonly ok: false;
  readonly fallbackToWebGpu: true;
  readonly reason:
    | "circuit-open"
    | "timeout"
    | "crc-or-protocol-error"
    | "sequence-regression"
    | "transport-error";
  readonly detail: string;
  readonly consecutiveFailures: number;
  readonly circuitState: CircuitBreakerState;
}

export type NativeBridgeCallResult = NativeBridgeCallSuccess | NativeBridgeCallFallback;

export interface NativeBridgeIpcDiagnostics {
  readonly circuitState: CircuitBreakerState;
  readonly consecutiveFailures: number;
  readonly totalSent: number;
  readonly totalSucceeded: number;
  readonly totalFailed: number;
  readonly totalCircuitTrips: number;
  readonly lastSentSequence: bigint;
  readonly lastReceivedSequence: bigint;
}

/**
 * 단조 시퀀스·타임아웃·서킷브레이커를 결합한 호스트 IPC 클라이언트.
 * 연속 실패가 임계치(기본 3회)에 도달하면 회로를 열어 무중단 WebGPU 폴백을 유도한다.
 */
export class NativeBridgeIpcClient {
  private readonly transport: NativeBridgeTransport;
  private readonly timeoutMs: number;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly nowMs: () => number;

  private nextSequence: bigint = ONE_BIGINT;
  private lastSentSequence: bigint = ZERO_BIGINT;
  private lastReceivedSequence: bigint = ZERO_BIGINT;
  private circuitState: CircuitBreakerState = "closed";
  private consecutiveFailures = 0;
  private openedAtMs: number | null = null;
  private totalSent = 0;
  private totalSucceeded = 0;
  private totalFailed = 0;
  private totalCircuitTrips = 0;

  constructor(options: NativeBridgeIpcClientOptions) {
    this.transport = options.transport;
    this.timeoutMs = Math.max(1, options.timeoutMs ?? 12);
    this.failureThreshold = Math.max(1, options.failureThreshold ?? 3);
    this.cooldownMs = Math.max(1, options.cooldownMs ?? 5_000);
    this.nowMs = options.nowMs ?? (() => Date.now());
  }

  getCircuitState(): CircuitBreakerState {
    if (
      this.circuitState === "open" &&
      this.openedAtMs !== null &&
      this.nowMs() - this.openedAtMs >= this.cooldownMs
    ) {
      this.circuitState = "half-open";
    }
    return this.circuitState;
  }

  getDiagnostics(): NativeBridgeIpcDiagnostics {
    return {
      circuitState: this.getCircuitState(),
      consecutiveFailures: this.consecutiveFailures,
      totalSent: this.totalSent,
      totalSucceeded: this.totalSucceeded,
      totalFailed: this.totalFailed,
      totalCircuitTrips: this.totalCircuitTrips,
      lastSentSequence: this.lastSentSequence,
      lastReceivedSequence: this.lastReceivedSequence,
    };
  }

  /** 시퀀스를 자동 부여해 프레임 패킷을 송신하고 CRC32·단조성·타임아웃을 검증한다. */
  async sendPacket(
    input: Omit<IpcFramePacket, "version" | "sequence">,
    overrideTimeoutMs?: number,
  ): Promise<NativeBridgeCallResult> {
    const currentCircuit = this.getCircuitState();
    if (currentCircuit === "open") {
      return {
        ok: false,
        fallbackToWebGpu: true,
        reason: "circuit-open",
        detail: "서킷브레이커가 열려 있어 네이티브 브릿지 대신 WebGPU 경로로 우회합니다.",
        consecutiveFailures: this.consecutiveFailures,
        circuitState: this.circuitState,
      };
    }

    const sequence = this.nextSequence;
    this.nextSequence += ONE_BIGINT;
    this.lastSentSequence = sequence;
    this.totalSent += 1;

    const encoded = encodeIpcFramePacket({
      ...input,
      version: IPC_PROTOCOL_VERSION,
      sequence,
    });

    const effectiveTimeoutMs = Math.max(1, overrideTimeoutMs ?? this.timeoutMs);
    const startedMs = this.nowMs();

    let rawResponse: Uint8Array;
    try {
      rawResponse = await this.invokeWithTimeout(encoded, effectiveTimeoutMs);
    } catch (caught) {
      const isTimeout = caught instanceof Error && caught.name === "NativeBridgeTimeoutError";
      const detail = caught instanceof Error ? caught.message : String(caught);
      return this.recordFailure(isTimeout ? "timeout" : "transport-error", detail);
    }

    let decoded: IpcFramePacket;
    try {
      decoded = decodeIpcFramePacket(rawResponse);
    } catch (caught) {
      const detail = caught instanceof Error ? caught.message : String(caught);
      return this.recordFailure("crc-or-protocol-error", detail);
    }

    if (decoded.sequence <= this.lastReceivedSequence || decoded.sequence < sequence) {
      return this.recordFailure(
        "sequence-regression",
        `응답 시퀀스 단조성 위반(기대 >= ${sequence.toString()}, 이전=${this.lastReceivedSequence.toString()}, 수신=${decoded.sequence.toString()}).`,
      );
    }

    this.lastReceivedSequence = decoded.sequence;
    this.consecutiveFailures = 0;
    this.circuitState = "closed";
    this.openedAtMs = null;
    this.totalSucceeded += 1;

    return {
      ok: true,
      response: decoded,
      roundTripMs: Math.max(0, this.nowMs() - startedMs),
      circuitState: this.circuitState,
    };
  }

  private invokeWithTimeout(packetBytes: Uint8Array, timeoutMs: number): Promise<Uint8Array> {
    return new Promise<Uint8Array>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        const err = new Error(`네이티브 IPC 응답 시간 초과(${timeoutMs}ms).`);
        err.name = "NativeBridgeTimeoutError";
        reject(err);
      }, timeoutMs);

      this.transport.sendFrame(packetBytes, timeoutMs).then(
        (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(result);
        },
        (error: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(error);
        },
      );
    });
  }

  private recordFailure(
    reason: NativeBridgeCallFallback["reason"],
    detail: string,
  ): NativeBridgeCallFallback {
    this.totalFailed += 1;
    this.consecutiveFailures += 1;
    if (this.circuitState === "half-open" || this.consecutiveFailures >= this.failureThreshold) {
      if (this.circuitState !== "open") {
        this.totalCircuitTrips += 1;
      }
      this.circuitState = "open";
      this.openedAtMs = this.nowMs();
    }
    return {
      ok: false,
      fallbackToWebGpu: true,
      reason,
      detail,
      consecutiveFailures: this.consecutiveFailures,
      circuitState: this.circuitState,
    };
  }
}
