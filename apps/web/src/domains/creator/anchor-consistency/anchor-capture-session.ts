/**
 * 앵커 캡처 세션 — 각도를 하나씩 캡처(또는 읽기)하며 진행·취소·실패 재시도를 관리하는 순수 컨트롤러.
 *
 * 상태: current. 프레임을 만들어 주는 쪽은 `AnchorFrameSource` 하나로 추상화한다. 지금 연결된 출처는 사용자가 끌어다 놓은
 * 파일(`file`)이고, 3D 스테이지에서 직접 캡처하는 출처(`stage`)는 같은 인터페이스를 구현하면 이 컨트롤러를 그대로 쓴다
 * (스테이지 연결은 편집기 호스트 수정이 필요해 아직 하지 않았다 — docs/features/anchor-consistency.md).
 *
 * 규칙
 * - 각도는 정본 순서로 한 번에 하나씩 처리한다(동시 실행 없음). 한 각도가 실패해도 나머지는 계속한다.
 * - 취소하면 처리 중이던 각도와 남은 각도가 `cancelled` 가 되고, 이미 끝난 각도는 그대로 남는다.
 * - 각도마다 시간 상한이 있다. 상한을 넘기면 그 각도만 `timeout` 으로 실패한다.
 * - 실패한 각도만 다시 실행할 수 있다(`previous` 스냅샷을 넘기면 끝난 각도의 프레임을 유지한다).
 * - 출처나 검증에서 생긴 오류는 던지지 않고 각도의 `failed` 슬롯에 담는다. `onProgress` 가 던지면 그대로 전파된다.
 */

import { sha256HexPortable } from "../studio-sha256";

import {
  ANCHOR_ANGLE_IDS,
  isAnchorAngleId,
  isAnchorImageMimeType,
  sortAnchorAngles,
  type AnchorAngleId,
  type AnchorImageMimeType,
} from "./anchor-capture-spec";
import { validateAnchorImage } from "./anchor-capture-set";

export type AnchorFrameOrigin = "stage" | "file";

export type AnchorCaptureErrorCode =
  | "cancelled"
  | "timeout"
  | "file-empty"
  | "file-too-large"
  | "unsupported-format"
  | "invalid-dimensions"
  | "image-too-small"
  | "image-too-large"
  | "decode-failed"
  | "source-unavailable"
  | "source-failed";

export class AnchorCaptureError extends Error {
  readonly code: AnchorCaptureErrorCode;
  /** 화면 문구에 끼울 수치(크기·한도). 파일 이름 같은 사용자 문자열은 담지 않는다. */
  readonly params: Readonly<Record<string, number>>;

  constructor(code: AnchorCaptureErrorCode, options: { readonly params?: Readonly<Record<string, number>>; readonly cause?: unknown } = {}) {
    super(`앵커 캡처 실패: ${code}`, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AnchorCaptureError";
    this.code = code;
    this.params = options.params ?? {};
  }
}

/** 출처가 돌려주는 날 프레임. 형식은 아직 검증 전이다. */
export interface RawAnchorFrame {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  /** 파일에서 온 경우 원래 이름(화면 표시용). 내보내기 이름에는 쓰지 않는다. */
  readonly sourceName?: string;
}

export interface AnchorCaptureContext {
  readonly signal: AbortSignal;
  /** 이 각도의 몇 번째 시도인지(1부터). */
  readonly attempt: number;
}

export interface AnchorFrameSource {
  readonly kind: AnchorFrameOrigin;
  capture(angleId: AnchorAngleId, context: AnchorCaptureContext): Promise<RawAnchorFrame>;
}

/** 검증과 해시 계산을 마친 프레임. */
export interface AnchorCapturedFrame {
  readonly angleId: AnchorAngleId;
  readonly origin: AnchorFrameOrigin;
  readonly bytes: Uint8Array;
  readonly mimeType: AnchorImageMimeType;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
  readonly imageSha256: string;
  readonly sourceName?: string;
}

export type AnchorSlotStatus = "idle" | "queued" | "capturing" | "done" | "failed" | "cancelled";

export interface AnchorSlotState {
  readonly status: AnchorSlotStatus;
  readonly frame?: AnchorCapturedFrame;
  readonly errorCode?: AnchorCaptureErrorCode;
  readonly errorParams?: Readonly<Record<string, number>>;
  /** 지금까지 시도한 횟수. */
  readonly attempts: number;
}

export type AnchorSessionPhase = "idle" | "running" | "finished";

export interface AnchorSessionSnapshot {
  readonly phase: AnchorSessionPhase;
  /** 이번 실행이 처리하는 각도(정본 순서). */
  readonly requested: readonly AnchorAngleId[];
  readonly slots: Readonly<Record<AnchorAngleId, AnchorSlotState>>;
}

export interface AnchorSessionSummary {
  readonly requested: number;
  /** 이번 실행에서 끝난(성공·실패·취소) 각도 수. */
  readonly settled: number;
  readonly doneAngles: readonly AnchorAngleId[];
  readonly failedAngles: readonly AnchorAngleId[];
  readonly cancelledAngles: readonly AnchorAngleId[];
  /** 0~1. 요청이 없으면 1. */
  readonly progress: number;
}

export const ANCHOR_CAPTURE_TIMEOUT_MS = 30_000;

const IDLE_SLOT: AnchorSlotState = Object.freeze({ status: "idle", attempts: 0 });

/** 여섯 각도의 슬롯 표를 만든다. 각도가 늘면 이 함수가 컴파일 오류로 알려 준다. */
function buildSlots(read: (id: AnchorAngleId) => AnchorSlotState): Readonly<Record<AnchorAngleId, AnchorSlotState>> {
  return Object.freeze({
    front: read("front"),
    "left-34": read("left-34"),
    left: read("left"),
    back: read("back"),
    right: read("right"),
    "right-34": read("right-34"),
  });
}

export function createEmptyAnchorSession(): AnchorSessionSnapshot {
  return Object.freeze({
    phase: "idle" as const,
    requested: Object.freeze([]),
    slots: buildSlots(() => IDLE_SLOT),
  });
}

export function summarizeAnchorSession(snapshot: AnchorSessionSnapshot): AnchorSessionSummary {
  const doneAngles: AnchorAngleId[] = [];
  const failedAngles: AnchorAngleId[] = [];
  const cancelledAngles: AnchorAngleId[] = [];
  for (const id of snapshot.requested) {
    const status = snapshot.slots[id].status;
    if (status === "done") doneAngles.push(id);
    else if (status === "failed") failedAngles.push(id);
    else if (status === "cancelled") cancelledAngles.push(id);
  }
  const settled = doneAngles.length + failedAngles.length + cancelledAngles.length;
  const requested = snapshot.requested.length;
  return Object.freeze({
    requested,
    settled,
    doneAngles: Object.freeze(doneAngles),
    failedAngles: Object.freeze(failedAngles),
    cancelledAngles: Object.freeze(cancelledAngles),
    progress: requested === 0 ? 1 : settled / requested,
  });
}

/** 스냅샷에서 끝난(done) 프레임을 정본 각도 순서로 모은다. */
export function collectAnchorFrames(snapshot: AnchorSessionSnapshot): readonly AnchorCapturedFrame[] {
  return ANCHOR_ANGLE_IDS.flatMap((id) => {
    const frame = snapshot.slots[id].frame;
    return snapshot.slots[id].status === "done" && frame ? [frame] : [];
  });
}

/** 취소·실패한 각도를 지우고 다시 받을 수 있게 비운 스냅샷. */
export function clearAnchorSlot(snapshot: AnchorSessionSnapshot, angleId: AnchorAngleId): AnchorSessionSnapshot {
  return Object.freeze({
    ...snapshot,
    slots: Object.freeze({ ...snapshot.slots, [angleId]: IDLE_SLOT }),
  });
}

export type AnchorHashFunction = (bytes: Uint8Array) => Promise<string> | string;

export interface RunAnchorCaptureOptions {
  readonly angles: readonly AnchorAngleId[];
  readonly source: AnchorFrameSource;
  readonly signal?: AbortSignal;
  readonly perAngleTimeoutMs?: number;
  readonly onProgress?: (snapshot: AnchorSessionSnapshot) => void;
  /** 이어서 실행할 때의 이전 상태. 이번에 요청하지 않은 각도는 그대로 유지한다. */
  readonly previous?: AnchorSessionSnapshot;
  /** 파일 바이트 해시. 기본은 순수 JS SHA-256 이다(브라우저에서는 네이티브 구현을 넘길 수 있다). */
  readonly hashBytes?: AnchorHashFunction;
}

function errorCodeOf(error: unknown, parentAborted: boolean): { code: AnchorCaptureErrorCode; params: Readonly<Record<string, number>> } {
  if (error instanceof AnchorCaptureError) return { code: error.code, params: error.params };
  if (parentAborted) return { code: "cancelled", params: {} };
  if (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError") {
    return { code: "timeout", params: {} };
  }
  return { code: "source-failed", params: {} };
}

/** 프레임을 검증해 확정한다. 문제가 있으면 AnchorCaptureError. */
async function finalizeFrame(
  angleId: AnchorAngleId,
  origin: AnchorFrameOrigin,
  raw: RawAnchorFrame,
  hashBytes: AnchorHashFunction,
): Promise<AnchorCapturedFrame> {
  if (!(raw.bytes instanceof Uint8Array) || !isAnchorImageMimeType(raw.mimeType)) {
    throw new AnchorCaptureError("unsupported-format");
  }
  const imageSha256 = await hashBytes(raw.bytes);
  const issues = validateAnchorImage({
    angleId,
    mimeType: raw.mimeType,
    width: raw.width,
    height: raw.height,
    byteLength: raw.bytes.byteLength,
    imageSha256,
  });
  const first = issues[0];
  if (first) {
    const params = first.params ?? {};
    switch (first.code) {
      case "file-empty": throw new AnchorCaptureError("file-empty");
      case "file-too-large": throw new AnchorCaptureError("file-too-large", { params });
      case "image-too-small": throw new AnchorCaptureError("image-too-small", { params });
      case "image-too-large": throw new AnchorCaptureError("image-too-large", { params });
      case "invalid-dimensions": throw new AnchorCaptureError("invalid-dimensions");
      default: throw new AnchorCaptureError("unsupported-format");
    }
  }
  return Object.freeze({
    angleId,
    origin,
    bytes: raw.bytes,
    mimeType: raw.mimeType,
    width: raw.width,
    height: raw.height,
    byteLength: raw.bytes.byteLength,
    imageSha256,
    ...(raw.sourceName ? { sourceName: raw.sourceName } : {}),
  });
}

/**
 * 요청한 각도를 순서대로 캡처한다. 끝나면 `phase: "finished"` 스냅샷을 돌려준다.
 * 진행 상황은 상태가 바뀔 때마다 `onProgress` 로 보낸다(스냅샷은 매번 새 객체다).
 */
export async function runAnchorCapture(options: RunAnchorCaptureOptions): Promise<AnchorSessionSnapshot> {
  const requested = sortAnchorAngles(options.angles.filter(isAnchorAngleId));
  const hashBytes = options.hashBytes ?? ((bytes: Uint8Array) => sha256HexPortable(bytes));
  const timeoutMs = options.perAngleTimeoutMs ?? ANCHOR_CAPTURE_TIMEOUT_MS;
  const parent = options.signal;
  let snapshot: AnchorSessionSnapshot = Object.freeze({
    phase: "running" as const,
    requested: Object.freeze(requested),
    slots: buildSlots((id) => {
      const before = options.previous?.slots[id] ?? IDLE_SLOT;
      return requested.includes(id) ? Object.freeze({ status: "queued" as const, attempts: before.attempts }) : before;
    }),
  });
  const publish = (next: AnchorSessionSnapshot): void => {
    snapshot = next;
    options.onProgress?.(next);
  };
  const setSlot = (angleId: AnchorAngleId, slot: AnchorSlotState, phase: AnchorSessionPhase = "running"): void => {
    publish(Object.freeze({ ...snapshot, phase, slots: Object.freeze({ ...snapshot.slots, [angleId]: Object.freeze(slot) }) }));
  };
  publish(snapshot);

  for (const angleId of requested) {
    const attempts = snapshot.slots[angleId].attempts;
    if (parent?.aborted) {
      setSlot(angleId, { status: "cancelled", errorCode: "cancelled", attempts });
      continue;
    }
    const attempt = attempts + 1;
    setSlot(angleId, { status: "capturing", attempts: attempt });
    const controller = new AbortController();
    const onParentAbort = (): void => controller.abort();
    parent?.addEventListener("abort", onParentAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const frame = await Promise.race([
        options.source.capture(angleId, { signal: controller.signal, attempt }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new AnchorCaptureError("timeout"));
          }, timeoutMs);
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(parent?.aborted ? new AnchorCaptureError("cancelled") : new AnchorCaptureError("timeout"));
          }, { once: true });
        }),
      ]);
      if (parent?.aborted) throw new AnchorCaptureError("cancelled");
      const captured = await finalizeFrame(angleId, options.source.kind, frame, hashBytes);
      setSlot(angleId, { status: "done", frame: captured, attempts: attempt });
    } catch (error) {
      const { code, params } = errorCodeOf(error, parent?.aborted === true);
      setSlot(angleId, {
        status: code === "cancelled" ? "cancelled" : "failed",
        errorCode: code,
        ...(Object.keys(params).length > 0 ? { errorParams: params } : {}),
        attempts: attempt,
      });
    } finally {
      if (timer !== null) clearTimeout(timer);
      parent?.removeEventListener("abort", onParentAbort);
    }
  }

  publish(Object.freeze({ ...snapshot, phase: "finished" as const }));
  return snapshot;
}
