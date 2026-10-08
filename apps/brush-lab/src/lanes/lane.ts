import { InvalidStateError } from "../engine/core/errors";

import type { LaneReasonCode } from "../engine/core/errors";
import type { Clock, GpuAdapterInfo, LabImage, RawSample, TimingSource } from "../engine/core/types";
import type { DabEmitterOptions } from "../engine/dynamics/dab-emitter";
import type { BrushProgram } from "../engine/presets/program-schema";

/**
 * 브러시 엔진 레인 계약. 모든 레인(CPU 참조·Canvas2D·현행 기준선·WebGPU compute·…)이
 * 같은 순서로 호출된다: probe → init → beginStroke → addSamples(프레임당 1회)* → endStroke → readback → dispose.
 * 획 도중(beginStroke 뒤 endStroke 전)에 오류(장치 손실·입력 오류·사용자 취소)가 나면 endStroke 대신 abortStroke로 끝낸다:
 * beginStroke → addSamples* → abortStroke. abortStroke는 진행 중인 획을 문서에 합성하지 않고 버리고, 그 전까지 endStroke된 결과(문서)는
 * 되돌릴 수 있는 만큼 보존한다(`StrokeAbortReceipt.documentPreserved`). 어느 쪽이든 abortStroke 뒤 레인은 다음 beginStroke를 받을 수 있는 idle 상태다.
 *
 * 무음 대체 금지(ADR-0018): probe는 절대 throw하지 않고 구조화 결과를 돌려주며,
 * unavailable 상태에서 init을 부르면 `LaneUnavailableError(code)`를 던진다.
 * 레인은 다른 레인으로 자동 전환하지 않는다.
 */

/**
 * 획의 입력 옵션. 색은 프로그램(브러시 정의)이 아니라 **획의 입력**이다: 같은 프로그램으로 색만 바꿔 여러 획을 그린다.
 * - `color`: sRGB straight RGBA(각 0..1). 생략하면 검정 `[0, 0, 0, 1]`이며 이때 결과는 색 인자가 없던 시절과 비트 단위로 같다.
 *   색 동역학(지터)과 습식 혼색은 프로그램 로직 그대로 이 기본색 위에 얹히고, 지우개·smudge는 색을 쓰지 않으므로 무시한다.
 */
export interface StrokeOptions {
  readonly color?: readonly [number, number, number, number];
}

/** 획 색 검증: 길이 4의 유한한 0..1 값이 아니면 InvalidStateError(무음 보정 금지). 색이 없으면 undefined. */
export function resolveStrokeColor(options?: StrokeOptions): readonly [number, number, number, number] | undefined {
  const color = options?.color;
  if (color === undefined) return undefined;
  if (!Array.isArray(color) || color.length !== 4 || !color.every((c) => typeof c === "number" && Number.isFinite(c) && c >= 0 && c <= 1)) {
    throw new InvalidStateError(`beginStroke: 획 색은 0..1 범위의 유한한 [r, g, b, a] 4개여야 한다(받은 값: ${JSON.stringify(color)})`);
  }
  return [color[0], color[1], color[2], color[3]];
}

/** StrokePipeline/DabEmitter에 넘길 옵션. 색이 없으면 빈 객체(기본 검정, 기존과 동일). */
export function strokeEmitterOptions(options?: StrokeOptions): DabEmitterOptions {
  const color = resolveStrokeColor(options);
  return color === undefined ? {} : { color };
}

export type LaneId =
  | "canvas2d"
  | "platform-baseline"
  | "cpu-reference"
  | "webgpu-compute"
  | "webgpu-instanced"
  | "webgl2-instanced"
  | "wasm-cpu"
  | "wasm-gpu-hybrid"
  | "libmypaint"
  | "hokusai"
  | "mpm-paint"
  | "bristle-pbd"
  | "bristle-rapier";

export type LaneKind = "baseline" | "candidate" | "comparison";

/**
 * 레인 성숙도. 생략하면 `stable`이다. `experimental`은 검증이 덜 된 실험 레인이라 인증 판정(PASS/FAIL)과 기본 경로에서 제외하고
 * UI는 이 값으로 배지를 보인다(`docs/license-policy.md` 3절 6항).
 */
export type LaneMaturity = "stable" | "experimental";

/** README 레인 상태 표의 어휘. */
export type LaneStatus = "implemented" | "browser-verification-required" | "reserved";

/** 레인에 주입되는 환경. 엔진은 전역을 직접 만지지 않는다. */
export interface LaneEnvironment {
  gpu?: GPU | null;
  createCanvas?: (w: number, h: number) => OffscreenCanvas | HTMLCanvasElement;
  wasmBytes?: Uint8Array | null;
  clock: Clock;
  userAgent?: string;
}

export interface LaneCapabilityReport {
  laneId: LaneId;
  status: "supported" | "unavailable";
  /** unavailable일 때의 사유 코드(1개 이상). supported면 빈 배열. */
  reasons: LaneReasonCode[];
  adapterInfo: GpuAdapterInfo | null;
  features: string[];
  limits: Record<string, number>;
  /** swiftshader/llvmpipe 등 소프트웨어 렌더러 여부. 판단 불가면 null. */
  softwareRenderer: boolean | null;
}

export interface LaneInit {
  width: number;
  height: number;
  dpr: number;
  tileSize: 16;
  seed: number;
  presentCanvas?: HTMLCanvasElement | OffscreenCanvas;
  strokeCapacityTiles?: number;
  wetCapacityTiles?: number;
}

/** addSamples 1회(= 프레임 1회)의 영수증. */
export interface DabBatchReceipt {
  frameIndex: number;
  dabCount: number;
  /** queue.submit 횟수(MAX_DABS_PER_BATCH 초과 시 분할). */
  submitCount: number;
  dispatchCount: number;
  /** 입력 → 제출 지연(ms). 측정 불가면 null. */
  inputToSubmitMs: number | null;
}

/** endStroke 영수증. */
export interface StrokeReceipt {
  dabCount: number;
  submitCount: number;
  gpuTimeMs: number | null;
  timingSource: TimingSource;
  frameTimesMs: number[];
  /** fail-visible: 비닝 한도 초과로 건너뛴 dab 수. */
  overflowDabs: number;
  poolTilesUsed: number;
}

/**
 * abortStroke 영수증. 레인은 보존하지 못한 것을 보존했다고 말하지 않는다(무음 대체 금지).
 * - `discardedDabs`: 문서에 합성되지 않고 버려진 dab(또는 표본) 수. 획 밖에서 불렸으면 0.
 * - `documentPreserved`: 그 전까지 endStroke된 문서(습식 층·높이 포함)가 beginStroke 직전과 같은가.
 *   false면 호출자(세션)가 레인을 교체해야 한다. `reasonKo`에 사유를 적는다.
 * - 획 밖에서 호출하면 no-op이다(멱등, `{ discardedDabs: 0, documentPreserved: true }`).
 */
export interface StrokeAbortReceipt {
  discardedDabs: number;
  documentPreserved: boolean;
  /** 한글 사유. documentPreserved가 false이거나 보존에 단서가 있을 때 채운다. */
  reasonKo?: string;
}

export interface LaneStats {
  strokes: number;
  dabs: number;
  submits: number;
  lastReceipt: StrokeReceipt | null;
}

export interface BrushEngineLane {
  readonly id: LaneId;
  readonly label: string;
  readonly kind: LaneKind;
  readonly status: LaneStatus;
  readonly engineVersion: string;
  /** 절대 throw하지 않는다. */
  probe(env: LaneEnvironment): Promise<LaneCapabilityReport>;
  /** probe unavailable 상태에서 호출 시 LaneUnavailableError. */
  init(env: LaneEnvironment, config: LaneInit): Promise<void>;
  /** `options.color`(sRGB straight RGBA 0..1)는 이 획이 침착하는 기본색이다. 생략하면 검정이며 기존 동작과 같다. */
  beginStroke(program: BrushProgram, seed: number, options?: StrokeOptions): void;
  /** 프레임당 1회 호출 계약(스케줄러가 보장). */
  addSamples(samples: readonly RawSample[]): DabBatchReceipt;
  endStroke(): Promise<StrokeReceipt>;
  /**
   * 진행 중인 획을 문서에 합성하지 않고 버린다. 동기 호출이며 획 밖에서는 no-op(멱등)이다.
   * 복원할 수 있는 레인은 그 전까지의 문서를 그대로 두고 `documentPreserved: true`를, 복원할 수 없으면 `false`와 한글 사유를 돌려준다.
   * 던지는 경우는 dispose된 레인 호출이나 자원 정리 자체의 실패뿐이며, 그때 호출자는 레인을 교체해야 한다.
   */
  abortStroke(): StrokeAbortReceipt;
  /** sRGB straight RGBA8. */
  readback(): Promise<LabImage>;
  /** 선형 premultiplied f32. null = 레인이 선형 버퍼를 제공하지 않음(canvas2d). */
  readbackLinear(): Promise<Float32Array | null>;
  stats(): LaneStats;
  dispose(): void;
}

export interface LaneDescriptor {
  id: LaneId;
  label: string;
  kind: LaneKind;
  status: LaneStatus;
  /** 성숙도. 생략 = `stable`(기존 레인 전부). */
  maturity?: LaneMaturity;
  /** Node에서 검증되는 범위(한글 요약). */
  nodeVerification: string;
  /** 브라우저에서 검증해야 하는 범위(한글 요약). */
  browserVerification: string;
  create: () => BrushEngineLane;
}

/** 획 밖에서 abortStroke를 불렀을 때의 영수증(no-op, 문서는 그대로). */
export function noStrokeAbortReceipt(): StrokeAbortReceipt {
  return { discardedDabs: 0, documentPreserved: true };
}

/** 사유가 있으면 붙이고(exactOptionalPropertyTypes 대응) 아니면 생략한 abort 영수증. */
export function abortReceipt(discardedDabs: number, documentPreserved: boolean, reasonKo?: string): StrokeAbortReceipt {
  const receipt: StrokeAbortReceipt = { discardedDabs, documentPreserved };
  if (reasonKo !== undefined) receipt.reasonKo = reasonKo;
  return receipt;
}

/** 빈 통계 초기값. */
export function emptyLaneStats(): LaneStats {
  return { strokes: 0, dabs: 0, submits: 0, lastReceipt: null };
}

/** 항상 지원되는 레인(CPU 계열)의 능력 리포트. */
export function supportedReport(laneId: LaneId): LaneCapabilityReport {
  return {
    laneId,
    status: "supported",
    reasons: [],
    adapterInfo: null,
    features: [],
    limits: {},
    softwareRenderer: null,
  };
}

/** unavailable 리포트 헬퍼. */
export function unavailableReport(laneId: LaneId, reasons: LaneReasonCode[]): LaneCapabilityReport {
  return {
    laneId,
    status: "unavailable",
    reasons,
    adapterInfo: null,
    features: [],
    limits: {},
    softwareRenderer: null,
  };
}
