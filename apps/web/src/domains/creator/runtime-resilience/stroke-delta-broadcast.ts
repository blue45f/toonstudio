/**
 * 초저대역 스트로크 델타 브로드캐스트 코덱 및 재연결·시퀀스 갭 재동기화 상태머신.
 *
 * - 포인터 좌표(x, y)를 1/4px(0.25px) 격자에 양자화(축 오차 ≤ 0.125px, 유클리드 오차 ≤ 0.177px ≤ 0.25px)한 뒤
 *   정수 2차 예측(가속도 델타) + ZigZag 가변 길이 정수로 압축해 120~240Hz 드로잉을 ≤ 6 KB/s로 유지한다.
 * - WebSocket / WebRTC DataChannel 단절 시 지수 백오프 자동 재연결, 미전송 버퍼 플러시,
 *   수신 시퀀스 갭 탐지 및 범위 재동기화(resync)를 결정적으로 수행한다.
 */

export const STROKE_DELTA_PACKET_MAGIC = 0xd1 as const;
export const STROKE_DELTA_DEFAULT_COORD_SCALE = 4 as const;
export const STROKE_DELTA_MAX_COORD_ERROR_PX = 0.25 as const;
export const STROKE_DELTA_BANDWIDTH_BUDGET_BYTES_PER_SEC = 6 * 1024;
export const STROKE_DELTA_MAX_POINTS_PER_PACKET = 4096 as const;

const PRESSURE_QUANT_MAX = 1023;
const TILT_MIN_DEG = -90;
const TILT_MAX_DEG = 90;
const TILT_QUANT_SCALE = 2; // 0.5도 해상도([-180, 180])
const MAX_VARINT_BYTES = 8;
const MAX_SIGNED_SAFE_DELTA = 2_251_799_813_685_247; // 2^51 - 1

const FLAG_DDX = 0x01;
const FLAG_DDY = 0x02;
const FLAG_DP = 0x04;
const FLAG_DTX = 0x08;
const FLAG_DTY = 0x10;
const FLAG_DDT = 0x20;

export interface StrokePointerSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tiltX: number;
  readonly tiltY: number;
  readonly timestampMs: number;
}

export interface StrokeDeltaPacket {
  readonly seq: number;
  readonly strokeId: number;
  readonly coordScale: number;
  readonly points: readonly StrokePointerSample[];
}

export interface StrokeDeltaEncodeOptions {
  readonly coordScale?: number;
}

export interface StrokeBandwidthMetrics {
  readonly totalBytes: number;
  readonly totalPoints: number;
  readonly packetCount: number;
  readonly durationMs: number;
  readonly bytesPerPoint: number;
  readonly bytesPerSecond: number;
  readonly kbPerSecond: number;
  readonly withinBudget: boolean;
}

export interface StrokeQuantizationErrorReport {
  readonly sampleCount: number;
  readonly maxAxisErrorPx: number;
  readonly maxEuclideanErrorPx: number;
  readonly maxPressureError: number;
  readonly maxTiltErrorDeg: number;
  readonly withinTolerance: boolean;
}

export type StrokeDeltaTransportKind = "websocket" | "webrtc";
export type StrokeTransportState = "idle" | "connecting" | "connected" | "reconnecting" | "resyncing" | "closed";

export interface StrokeReconnectPolicy {
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly backoffFactor: number;
  readonly jitterRatio: number;
  readonly maxAttempts: number;
  readonly maxOutboundQueue: number;
  readonly maxOutOfOrderBuffer: number;
}

export const DEFAULT_STROKE_RECONNECT_POLICY: StrokeReconnectPolicy = Object.freeze({
  baseDelayMs: 250,
  maxDelayMs: 15_000,
  backoffFactor: 2,
  jitterRatio: 0.2,
  maxAttempts: 12,
  maxOutboundQueue: 256,
  maxOutOfOrderBuffer: 256,
});

export interface StrokeResyncRequest {
  readonly fromSeq: number;
  readonly toSeq: number;
  readonly missingCount: number;
  readonly requestedAtMs: number;
}

export interface StrokeDeltaTransportAdapter {
  readonly kind: StrokeDeltaTransportKind;
  connect(): void;
  disconnect(): void;
  sendBytes(payload: Uint8Array): boolean;
  requestResync?(request: StrokeResyncRequest): void;
}

export interface StrokeTransportTimerAdapter {
  schedule(callback: () => void, delayMs: number): number;
  cancel(handle: number): void;
}

export interface StrokeTransportSnapshot {
  readonly kind: StrokeDeltaTransportKind;
  readonly state: StrokeTransportState;
  readonly reconnectAttempts: number;
  readonly nextRetryDelayMs: number | null;
  readonly lastDeliveredSeq: number;
  readonly bufferedOutboundCount: number;
  readonly bufferedOutOfOrderCount: number;
  readonly sentPacketCount: number;
  readonly sentByteCount: number;
  readonly deliveredPacketCount: number;
  readonly duplicateDroppedCount: number;
  readonly resyncRequestCount: number;
  readonly pendingResync: StrokeResyncRequest | null;
}

export interface StrokeDeltaTransportMachineOptions {
  readonly adapter: StrokeDeltaTransportAdapter;
  readonly policy?: Partial<StrokeReconnectPolicy>;
  readonly initialLastSeq?: number;
  readonly nowMs?: () => number;
  readonly randomUnit?: () => number;
  readonly timer?: StrokeTransportTimerAdapter;
  readonly onPacketDelivered?: (packet: StrokeDeltaPacket) => void;
  readonly onResyncRequested?: (request: StrokeResyncRequest) => void;
  readonly onStateChange?: (state: StrokeTransportState, previous: StrokeTransportState) => void;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function assertSafeNonNegativeInt(value: number, label: string): number {
  const truncated = Math.trunc(value);
  if (!Number.isSafeInteger(truncated) || truncated < 0 || truncated !== value) {
    throw new RangeError(`${label} 값은 0 이상의 안전 정수여야 합니다: ${String(value)}`);
  }
  return truncated;
}

function encodeUVarint(out: number[], value: number): void {
  let remaining = assertSafeNonNegativeInt(value, "부호 없는 varint");
  while (remaining >= 128) {
    out.push((remaining % 128) | 0x80);
    remaining = Math.floor(remaining / 128);
  }
  out.push(remaining);
}

function decodeUVarint(bytes: Uint8Array, offset: number): { readonly value: number; readonly nextOffset: number } {
  let result = 0;
  let multiplier = 1;
  let pos = offset;
  for (let i = 0; i < MAX_VARINT_BYTES; i += 1) {
    if (pos >= bytes.length) {
      throw new RangeError("스트로크 델타 패킷이 varint 디코딩 중 조기 종료되었습니다.");
    }
    const byte = bytes[pos] ?? 0;
    pos += 1;
    result += (byte & 0x7f) * multiplier;
    if (!Number.isSafeInteger(result)) {
      throw new RangeError("스트로크 델타 varint 값이 53비트 안전 정수 한도를 초과했습니다.");
    }
    if ((byte & 0x80) === 0) return { value: result, nextOffset: pos };
    multiplier *= 128;
  }
  throw new RangeError("스트로크 델타 varint 바이트 길이가 허용 상한을 초과했습니다.");
}

function encodeSVarint(out: number[], value: number): void {
  const truncated = Math.trunc(value);
  if (!Number.isSafeInteger(truncated) || Math.abs(truncated) > MAX_SIGNED_SAFE_DELTA) {
    throw new RangeError(`부호 있는 델타 정수 범위를 벗어났습니다: ${String(value)}`);
  }
  encodeUVarint(out, truncated >= 0 ? truncated * 2 : -truncated * 2 - 1);
}

function decodeSVarint(bytes: Uint8Array, offset: number): { readonly value: number; readonly nextOffset: number } {
  const decoded = decodeUVarint(bytes, offset);
  return {
    value: decoded.value % 2 === 0 ? decoded.value / 2 : -((decoded.value + 1) / 2),
    nextOffset: decoded.nextOffset,
  };
}

function quantizeCoord(value: number, coordScale: number): number {
  if (!Number.isFinite(value)) throw new RangeError(`좌표 값이 유한 숫자가 아닙니다: ${String(value)}`);
  return Math.round(value * coordScale);
}

function quantizeTimestamp(timestampMs: number): number {
  if (!Number.isFinite(timestampMs) || timestampMs < 0) {
    throw new RangeError(`타임스탬프는 0 이상의 유한 밀리초여야 합니다: ${String(timestampMs)}`);
  }
  const rounded = Math.round(timestampMs);
  if (!Number.isSafeInteger(rounded)) {
    throw new RangeError(`타임스탬프가 안전 정수 범위를 벗어났습니다: ${String(timestampMs)}`);
  }
  return rounded;
}

/**
 * 포인터 샘플 배열을 양자화 2차 델타 가변 길이 바이너리 패킷으로 인코딩한다.
 * 정수 양자화 후 무손실 델타를 적용하므로 긴 스트로크에서도 누적 드리프트가 발생하지 않는다.
 */
export function encodeStrokeDeltaPacket(
  packet: Omit<StrokeDeltaPacket, "coordScale"> & { readonly coordScale?: number },
  options?: StrokeDeltaEncodeOptions,
): Uint8Array {
  const seq = assertSafeNonNegativeInt(packet.seq, "시퀀스 번호");
  const strokeId = assertSafeNonNegativeInt(packet.strokeId, "스트로크 ID");
  const coordScale = assertSafeNonNegativeInt(
    options?.coordScale ?? packet.coordScale ?? STROKE_DELTA_DEFAULT_COORD_SCALE,
    "좌표 양자화 배율",
  );
  if (coordScale < 1 || coordScale > 64) {
    throw new RangeError(`좌표 양자화 배율은 1~64 범위여야 합니다: ${coordScale}`);
  }
  if (packet.points.length > STROKE_DELTA_MAX_POINTS_PER_PACKET) {
    throw new RangeError(
      `단일 패킷 포인트 수가 상한(${STROKE_DELTA_MAX_POINTS_PER_PACKET})을 초과했습니다: ${packet.points.length}`,
    );
  }

  const out: number[] = [STROKE_DELTA_PACKET_MAGIC];
  encodeUVarint(out, seq);
  encodeUVarint(out, strokeId);
  out.push(coordScale);
  encodeUVarint(out, packet.points.length);
  if (packet.points.length === 0) return Uint8Array.from(out);

  const first = packet.points[0]!;
  let prevX = quantizeCoord(first.x, coordScale);
  let prevY = quantizeCoord(first.y, coordScale);
  let prevP = Math.round(clamp(first.pressure, 0, 1) * PRESSURE_QUANT_MAX);
  let prevTx = Math.round(clamp(first.tiltX, TILT_MIN_DEG, TILT_MAX_DEG) * TILT_QUANT_SCALE);
  let prevTy = Math.round(clamp(first.tiltY, TILT_MIN_DEG, TILT_MAX_DEG) * TILT_QUANT_SCALE);
  let prevT = quantizeTimestamp(first.timestampMs);

  encodeSVarint(out, prevX);
  encodeSVarint(out, prevY);
  encodeUVarint(out, prevP);
  encodeSVarint(out, prevTx);
  encodeSVarint(out, prevTy);
  encodeUVarint(out, prevT);

  let prevDx = 0;
  let prevDy = 0;
  let prevDt = 0;

  for (let i = 1; i < packet.points.length; i += 1) {
    const sample = packet.points[i]!;
    const xq = quantizeCoord(sample.x, coordScale);
    const yq = quantizeCoord(sample.y, coordScale);
    const pq = Math.round(clamp(sample.pressure, 0, 1) * PRESSURE_QUANT_MAX);
    const txq = Math.round(clamp(sample.tiltX, TILT_MIN_DEG, TILT_MAX_DEG) * TILT_QUANT_SCALE);
    const tyq = Math.round(clamp(sample.tiltY, TILT_MIN_DEG, TILT_MAX_DEG) * TILT_QUANT_SCALE);
    const tq = quantizeTimestamp(sample.timestampMs);

    const dx = xq - prevX;
    const dy = yq - prevY;
    const dt = tq - prevT;
    const ddx = dx - prevDx;
    const ddy = dy - prevDy;
    const dp = pq - prevP;
    const dtx = txq - prevTx;
    const dty = tyq - prevTy;
    const ddt = dt - prevDt;

    const flags =
      (ddx !== 0 ? FLAG_DDX : 0)
      | (ddy !== 0 ? FLAG_DDY : 0)
      | (dp !== 0 ? FLAG_DP : 0)
      | (dtx !== 0 ? FLAG_DTX : 0)
      | (dty !== 0 ? FLAG_DTY : 0)
      | (ddt !== 0 ? FLAG_DDT : 0);

    out.push(flags);
    if (ddx !== 0) encodeSVarint(out, ddx);
    if (ddy !== 0) encodeSVarint(out, ddy);
    if (dp !== 0) encodeSVarint(out, dp);
    if (dtx !== 0) encodeSVarint(out, dtx);
    if (dty !== 0) encodeSVarint(out, dty);
    if (ddt !== 0) encodeSVarint(out, ddt);

    prevX = xq;
    prevY = yq;
    prevP = pq;
    prevTx = txq;
    prevTy = tyq;
    prevT = tq;
    prevDx = dx;
    prevDy = dy;
    prevDt = dt;
  }

  return Uint8Array.from(out);
}

/**
 * 바이너리 스트로크 델타 패킷을 원본 포인터 샘플 시퀀스로 복원한다.
 */
export function decodeStrokeDeltaPacket(bytes: Uint8Array): StrokeDeltaPacket {
  if (bytes.length < 4) throw new RangeError("스트로크 델타 패킷 헤더가 불완전합니다.");
  if (bytes[0] !== STROKE_DELTA_PACKET_MAGIC) {
    throw new RangeError(`지원하지 않는 스트로크 델타 매직 바이트입니다: 0x${(bytes[0] ?? 0).toString(16)}`);
  }

  let offset = 1;
  const readU = (): number => {
    const dec = decodeUVarint(bytes, offset);
    offset = dec.nextOffset;
    return dec.value;
  };
  const readS = (): number => {
    const dec = decodeSVarint(bytes, offset);
    offset = dec.nextOffset;
    return dec.value;
  };

  const seq = readU();
  const strokeId = readU();
  if (offset >= bytes.length) throw new RangeError("스트로크 델타 패킷에 좌표 배율 바이트가 없습니다.");
  const coordScale = bytes[offset++] ?? 0;
  if (coordScale < 1 || coordScale > 64) {
    throw new RangeError(`유효하지 않은 좌표 양자화 배율입니다: ${coordScale}`);
  }

  const pointCount = readU();
  if (pointCount > STROKE_DELTA_MAX_POINTS_PER_PACKET) {
    throw new RangeError(`패킷 포인트 수가 허용 상한을 초과했습니다: ${pointCount}`);
  }
  if (pointCount === 0) return { seq, strokeId, coordScale, points: [] };

  let curX = readS();
  let curY = readS();
  let curP = readU();
  let curTx = readS();
  let curTy = readS();
  let curT = readU();

  const toSample = (): StrokePointerSample => ({
    x: curX / coordScale,
    y: curY / coordScale,
    pressure: clamp(curP / PRESSURE_QUANT_MAX, 0, 1),
    tiltX: clamp(curTx / TILT_QUANT_SCALE, TILT_MIN_DEG, TILT_MAX_DEG),
    tiltY: clamp(curTy / TILT_QUANT_SCALE, TILT_MIN_DEG, TILT_MAX_DEG),
    timestampMs: Math.max(0, curT),
  });

  const points: StrokePointerSample[] = [toSample()];
  let prevDx = 0;
  let prevDy = 0;
  let prevDt = 0;

  for (let i = 1; i < pointCount; i += 1) {
    if (offset >= bytes.length) {
      throw new RangeError(`스트로크 델타 패킷 포인트 #${i} 플래그가 누락되었습니다.`);
    }
    const flags = bytes[offset++] ?? 0;
    const dx = prevDx + ((flags & FLAG_DDX) !== 0 ? readS() : 0);
    const dy = prevDy + ((flags & FLAG_DDY) !== 0 ? readS() : 0);
    const dp = (flags & FLAG_DP) !== 0 ? readS() : 0;
    const dtx = (flags & FLAG_DTX) !== 0 ? readS() : 0;
    const dty = (flags & FLAG_DTY) !== 0 ? readS() : 0;
    const dt = prevDt + ((flags & FLAG_DDT) !== 0 ? readS() : 0);

    curX += dx;
    curY += dy;
    curP += dp;
    curTx += dtx;
    curTy += dty;
    curT += dt;
    prevDx = dx;
    prevDy = dy;
    prevDt = dt;
    points.push(toSample());
  }

  return { seq, strokeId, coordScale, points };
}

/**
 * 인코딩된 스트로크 델타 패킷 묶음의 전송 대역폭(KB/s)과 6 KB/s 예산 준수 여부를 측정한다.
 */
export function measureStrokeDeltaBandwidth(
  encodedPackets: readonly Uint8Array[],
  durationMs: number,
  totalPoints?: number,
): StrokeBandwidthMetrics {
  const safeDurationMs = Math.max(1, Number.isFinite(durationMs) ? durationMs : 1);
  let totalBytes = 0;
  let countedPoints = totalPoints ?? 0;
  for (const packet of encodedPackets) {
    totalBytes += packet.byteLength;
    if (totalPoints === undefined) countedPoints += decodeStrokeDeltaPacket(packet).points.length;
  }
  const bytesPerSecond = (totalBytes * 1000) / safeDurationMs;
  return {
    totalBytes,
    totalPoints: countedPoints,
    packetCount: encodedPackets.length,
    durationMs: safeDurationMs,
    bytesPerPoint: countedPoints > 0 ? totalBytes / countedPoints : 0,
    bytesPerSecond,
    kbPerSecond: bytesPerSecond / 1024,
    withinBudget: bytesPerSecond <= STROKE_DELTA_BANDWIDTH_BUDGET_BYTES_PER_SEC,
  };
}

/**
 * 원본 포인터 샘플과 디코딩 샘플 사이의 최대 좌표·필압·기울기 복원 오차를 계산한다.
 */
export function measureStrokeQuantizationError(
  original: readonly StrokePointerSample[],
  decoded: readonly StrokePointerSample[],
): StrokeQuantizationErrorReport {
  const count = Math.min(original.length, decoded.length);
  let maxAxisErrorPx = 0;
  let maxEuclideanErrorPx = 0;
  let maxPressureError = 0;
  let maxTiltErrorDeg = 0;

  for (let i = 0; i < count; i += 1) {
    const src = original[i]!;
    const dst = decoded[i]!;
    const errX = Math.abs(src.x - dst.x);
    const errY = Math.abs(src.y - dst.y);
    maxAxisErrorPx = Math.max(maxAxisErrorPx, errX, errY);
    maxEuclideanErrorPx = Math.max(maxEuclideanErrorPx, Math.hypot(errX, errY));
    maxPressureError = Math.max(maxPressureError, Math.abs(clamp(src.pressure, 0, 1) - dst.pressure));
    maxTiltErrorDeg = Math.max(
      maxTiltErrorDeg,
      Math.abs(clamp(src.tiltX, TILT_MIN_DEG, TILT_MAX_DEG) - dst.tiltX),
      Math.abs(clamp(src.tiltY, TILT_MIN_DEG, TILT_MAX_DEG) - dst.tiltY),
    );
  }

  return {
    sampleCount: count,
    maxAxisErrorPx,
    maxEuclideanErrorPx,
    maxPressureError,
    maxTiltErrorDeg,
    withinTolerance: original.length === decoded.length && maxEuclideanErrorPx <= STROKE_DELTA_MAX_COORD_ERROR_PX,
  };
}

/**
 * 재연결 시도 횟수(1부터 시작)에 대한 지수 백오프 대기 시간(ms)을 계산한다.
 */
export function computeReconnectBackoffMs(
  attempt: number,
  policy: StrokeReconnectPolicy = DEFAULT_STROKE_RECONNECT_POLICY,
  randomUnit = 0.5,
): number {
  const safeAttempt = Math.max(1, Math.trunc(attempt));
  const capped = Math.min(policy.maxDelayMs, policy.baseDelayMs * (policy.backoffFactor ** (safeAttempt - 1)));
  const jitterSpan = capped * clamp(policy.jitterRatio, 0, 0.5);
  return Math.max(1, Math.round(capped + (clamp(randomUnit, 0, 1) * 2 - 1) * jitterSpan));
}

function createDefaultTimerAdapter(): StrokeTransportTimerAdapter {
  return {
    schedule: (callback, delayMs) => Number(globalThis.setTimeout(callback, delayMs)),
    cancel: (handle) => {
      globalThis.clearTimeout(handle);
    },
  };
}

/**
 * WebSocket / WebRTC 스트로크 델타 브로드캐스트용 지수 백오프 재연결 및 시퀀스 갭 재동기화 상태머신.
 */
export class StrokeDeltaTransportMachine {
  private readonly adapter: StrokeDeltaTransportAdapter;
  private readonly policy: StrokeReconnectPolicy;
  private readonly nowMs: () => number;
  private readonly randomUnit: () => number;
  private readonly timer: StrokeTransportTimerAdapter;
  private readonly onPacketDelivered?: (packet: StrokeDeltaPacket) => void;
  private readonly onResyncRequested?: (request: StrokeResyncRequest) => void;
  private readonly onStateChange?: (state: StrokeTransportState, previous: StrokeTransportState) => void;

  private state: StrokeTransportState = "idle";
  private reconnectAttempts = 0;
  private nextRetryDelayMs: number | null = null;
  private reconnectTimerHandle: number | null = null;
  private lastDeliveredSeq: number;
  private pendingResync: StrokeResyncRequest | null = null;

  private readonly outboundQueue: Uint8Array[] = [];
  private readonly outOfOrderBuffer = new Map<number, StrokeDeltaPacket>();

  private sentPacketCount = 0;
  private sentByteCount = 0;
  private deliveredPacketCount = 0;
  private duplicateDroppedCount = 0;
  private resyncRequestCount = 0;

  constructor(options: StrokeDeltaTransportMachineOptions) {
    this.adapter = options.adapter;
    this.policy = { ...DEFAULT_STROKE_RECONNECT_POLICY, ...options.policy };
    this.lastDeliveredSeq = Math.max(0, Math.trunc(options.initialLastSeq ?? 0));
    this.nowMs = options.nowMs ?? (() => Date.now());
    this.randomUnit = options.randomUnit ?? (() => 0.5);
    this.timer = options.timer ?? createDefaultTimerAdapter();
    this.onPacketDelivered = options.onPacketDelivered;
    this.onResyncRequested = options.onResyncRequested;
    this.onStateChange = options.onStateChange;
  }

  private transition(next: StrokeTransportState): void {
    if (this.state === next) return;
    const previous = this.state;
    this.state = next;
    this.onStateChange?.(next, previous);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimerHandle !== null) {
      this.timer.cancel(this.reconnectTimerHandle);
      this.reconnectTimerHandle = null;
    }
  }

  public start(): void {
    if (this.state === "connected" || this.state === "connecting" || this.state === "resyncing") return;
    this.clearReconnectTimer();
    this.nextRetryDelayMs = null;
    this.transition("connecting");
    this.adapter.connect();
  }

  public handleConnected(): void {
    if (this.state === "closed") return;
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;
    this.nextRetryDelayMs = null;
    this.transition(this.outOfOrderBuffer.size > 0 ? "resyncing" : "connected");
    this.flushOutboundQueue();
    if (this.pendingResync !== null) this.adapter.requestResync?.(this.pendingResync);
  }

  /**
   * 네트워크 단절 또는 ICE 연결 실패를 처리하고 지수 백오프 재연결을 예약한다.
   */
  public handleDisconnected(): number | null {
    if (this.state === "closed") return null;
    this.clearReconnectTimer();
    if (this.reconnectAttempts >= this.policy.maxAttempts) {
      this.nextRetryDelayMs = null;
      this.transition("closed");
      return null;
    }
    this.reconnectAttempts += 1;
    const delayMs = computeReconnectBackoffMs(this.reconnectAttempts, this.policy, this.randomUnit());
    this.nextRetryDelayMs = delayMs;
    this.transition("reconnecting");

    this.reconnectTimerHandle = this.timer.schedule(() => {
      this.reconnectTimerHandle = null;
      if (this.state !== "reconnecting") return;
      this.transition("connecting");
      this.adapter.connect();
    }, delayMs);
    return delayMs;
  }

  /**
   * 로컬 스트로크 델타 패킷을 인코딩해 전송하거나, 단절 중이면 유한 송신 큐에 보류한다.
   */
  public enqueueLocalPacket(
    packet: Omit<StrokeDeltaPacket, "coordScale"> & { readonly coordScale?: number },
    options?: StrokeDeltaEncodeOptions,
  ): { readonly bytes: Uint8Array; readonly sentImmediately: boolean } {
    const bytes = encodeStrokeDeltaPacket(packet, options);
    if (this.state === "connected" || this.state === "resyncing") {
      if (this.adapter.sendBytes(bytes)) {
        this.sentPacketCount += 1;
        this.sentByteCount += bytes.byteLength;
        return { bytes, sentImmediately: true };
      }
      this.handleDisconnected();
    }
    if (this.outboundQueue.length >= this.policy.maxOutboundQueue) this.outboundQueue.shift();
    this.outboundQueue.push(bytes);
    return { bytes, sentImmediately: false };
  }

  private flushOutboundQueue(): void {
    while (this.outboundQueue.length > 0 && (this.state === "connected" || this.state === "resyncing")) {
      const next = this.outboundQueue[0]!;
      if (!this.adapter.sendBytes(next)) {
        this.handleDisconnected();
        return;
      }
      this.outboundQueue.shift();
      this.sentPacketCount += 1;
      this.sentByteCount += next.byteLength;
    }
  }

  /**
   * 수신 바이너리 패킷을 디코딩하고 시퀀스 연속성을 검증한다.
   * 시퀀스 갭이 발견되면 미래 패킷을 버퍼링하고 누락 범위 재동기화(resync)를 요청한다.
   */
  public receiveBytes(bytes: Uint8Array): readonly StrokeDeltaPacket[] {
    return this.ingestDecodedPacket(decodeStrokeDeltaPacket(bytes));
  }

  /**
   * 재동기화(resync) 응답으로 받은 누락 패킷 묶음을 시퀀스 순으로 병합하고 보류 패킷을 플러시한다.
   */
  public applyResyncPackets(packets: readonly (Uint8Array | StrokeDeltaPacket)[]): readonly StrokeDeltaPacket[] {
    const decoded = packets
      .map((entry) => (entry instanceof Uint8Array ? decodeStrokeDeltaPacket(entry) : entry))
      .sort((a, b) => a.seq - b.seq);
    const delivered: StrokeDeltaPacket[] = [];
    for (const packet of decoded) delivered.push(...this.ingestDecodedPacket(packet, false));

    if (this.outOfOrderBuffer.size === 0) {
      this.pendingResync = null;
      if (this.state === "resyncing") this.transition("connected");
    } else {
      const minBufferedSeq = Math.min(...this.outOfOrderBuffer.keys());
      if (minBufferedSeq > this.lastDeliveredSeq + 1) {
        this.emitResyncRequest(this.lastDeliveredSeq + 1, minBufferedSeq - 1);
      }
    }
    return delivered;
  }

  private ingestDecodedPacket(packet: StrokeDeltaPacket, emitGapResync = true): readonly StrokeDeltaPacket[] {
    if (packet.seq <= this.lastDeliveredSeq) {
      this.duplicateDroppedCount += 1;
      return [];
    }

    const expectedSeq = this.lastDeliveredSeq + 1;
    if (packet.seq > expectedSeq) {
      if (!this.outOfOrderBuffer.has(packet.seq)) {
        if (this.outOfOrderBuffer.size >= this.policy.maxOutOfOrderBuffer) {
          this.outOfOrderBuffer.delete(Math.min(...this.outOfOrderBuffer.keys()));
        }
        this.outOfOrderBuffer.set(packet.seq, packet);
      } else {
        this.duplicateDroppedCount += 1;
      }
      if (emitGapResync) {
        const lowestGapEnd = Math.min(...this.outOfOrderBuffer.keys()) - 1;
        this.emitResyncRequest(expectedSeq, Math.max(expectedSeq, lowestGapEnd));
      }
      return [];
    }

    const delivered: StrokeDeltaPacket[] = [];
    this.deliverSingle(packet, delivered);
    while (this.outOfOrderBuffer.has(this.lastDeliveredSeq + 1)) {
      const nextSeq = this.lastDeliveredSeq + 1;
      const buffered = this.outOfOrderBuffer.get(nextSeq)!;
      this.outOfOrderBuffer.delete(nextSeq);
      this.deliverSingle(buffered, delivered);
    }

    if (this.outOfOrderBuffer.size === 0) {
      this.pendingResync = null;
      if (this.state === "resyncing") this.transition("connected");
    } else if (emitGapResync) {
      this.emitResyncRequest(this.lastDeliveredSeq + 1, Math.min(...this.outOfOrderBuffer.keys()) - 1);
    }
    return delivered;
  }

  private deliverSingle(packet: StrokeDeltaPacket, sink: StrokeDeltaPacket[]): void {
    this.lastDeliveredSeq = packet.seq;
    this.deliveredPacketCount += 1;
    sink.push(packet);
    this.onPacketDelivered?.(packet);
  }

  private emitResyncRequest(fromSeq: number, toSeq: number): void {
    if (toSeq < fromSeq) return;
    if (this.pendingResync !== null && this.pendingResync.fromSeq === fromSeq && this.pendingResync.toSeq === toSeq) {
      return;
    }
    const request: StrokeResyncRequest = {
      fromSeq,
      toSeq,
      missingCount: toSeq - fromSeq + 1,
      requestedAtMs: this.nowMs(),
    };
    this.pendingResync = request;
    this.resyncRequestCount += 1;
    if (this.state === "connected") this.transition("resyncing");
    this.adapter.requestResync?.(request);
    this.onResyncRequested?.(request);
  }

  public close(): void {
    this.clearReconnectTimer();
    this.nextRetryDelayMs = null;
    this.pendingResync = null;
    this.transition("closed");
    this.adapter.disconnect();
  }

  public getSnapshot(): StrokeTransportSnapshot {
    return {
      kind: this.adapter.kind,
      state: this.state,
      reconnectAttempts: this.reconnectAttempts,
      nextRetryDelayMs: this.nextRetryDelayMs,
      lastDeliveredSeq: this.lastDeliveredSeq,
      bufferedOutboundCount: this.outboundQueue.length,
      bufferedOutOfOrderCount: this.outOfOrderBuffer.size,
      sentPacketCount: this.sentPacketCount,
      sentByteCount: this.sentByteCount,
      deliveredPacketCount: this.deliveredPacketCount,
      duplicateDroppedCount: this.duplicateDroppedCount,
      resyncRequestCount: this.resyncRequestCount,
      pendingResync: this.pendingResync,
    };
  }
}

export function createStrokeDeltaTransportMachine(
  options: StrokeDeltaTransportMachineOptions,
): StrokeDeltaTransportMachine {
  return new StrokeDeltaTransportMachine(options);
}
