/**
 * 클립스튜디오 페인트 5.1.5 시작·끝 가져오기(들어가기/빼기) 고급 감쇠 엔진.
 *
 * 역공학 행동 기준 근거 (REA MCP 정적 분석):
 * - `EditImageTool.todb` (`ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`):
 *   `BrushInOutTarget`, `BrushInOutType`, `BrushInOutBySpeed`,
 *   `BrushUseIn`, `BrushInLength`, `BrushInLengthUnit`, `BrushInRatio`,
 *   `BrushUseOut`, `BrushOutLength`, `BrushOutLengthUnit`, `BrushOutRatio`.
 * - `BrushPreset.bfps` (`ev_90b6e4694cbb5de1b08d1057f27fef92598c0f9c7b4ab9839619f135ea73af83`).
 *
 * 기존 퍼센트 기반 테이퍼와 달리 절대 길이(px) 또는 비율(%) 단위를 모두 지원하며,
 * 빠른 손목 스냅(속도 EMA)에 비례해 끝단 빼기 길이를 늘리는 `bySpeed` 모드를 순수 수식으로 재구성한다.
 */

export type StudioBrushInOutUnit = "px" | "percent";

export interface StudioBrushInOutTargetMask {
  readonly size: boolean;
  readonly opacity: boolean;
  readonly flow: boolean;
}

export interface StudioBrushInOutTaperConfig {
  readonly useIn: boolean;
  readonly inLength: number;
  readonly inUnit: StudioBrushInOutUnit;
  /** 시작점 최소 비율 (0..1, 0이면 완전한 바늘 끝). */
  readonly inMinRatio: number;
  readonly useOut: boolean;
  readonly outLength: number;
  readonly outUnit: StudioBrushInOutUnit;
  /** 끝점 최소 비율 (0..1, 0이면 완전한 바늘 끝). */
  readonly outMinRatio: number;
  /** 곡선 지수 (0.25..4, 1 = 선형, >1 = 날렵한 펜촉). */
  readonly curve: number;
  /** 획 이동 속도(px/ms)에 따라 시작·끝 감쇠 길이를 신장할지 여부. */
  readonly bySpeed: boolean;
  /** 기준 속도(px/ms). 이 속도일 때 배율 1.0, 두 배 속도면 최대 `maxSpeedScale`까지 확장. */
  readonly referenceSpeedPxPerMs: number;
  readonly maxSpeedScale: number;
  readonly targets: StudioBrushInOutTargetMask;
}

export interface StudioBrushInOutStationInput {
  readonly distanceFromStartPx: number;
  readonly totalStrokeLengthPx: number;
  /** 해당 지점 또는 획 말미의 평활화된 이동 속도(px/ms). */
  readonly speedPxPerMs?: number;
}

export interface StudioBrushInOutFactors {
  readonly envelope: number;
  readonly sizeFactor: number;
  readonly opacityFactor: number;
  readonly flowFactor: number;
  readonly effectiveInLengthPx: number;
  readonly effectiveOutLengthPx: number;
}

export const DEFAULT_STUDIO_BRUSH_INOUT_TAPER_CONFIG: StudioBrushInOutTaperConfig = Object.freeze({
  useIn: false,
  inLength: 24,
  inUnit: "px",
  inMinRatio: 0,
  useOut: false,
  outLength: 36,
  outUnit: "px",
  outMinRatio: 0,
  curve: 1.35,
  bySpeed: false,
  referenceSpeedPxPerMs: 0.85,
  maxSpeedScale: 2.5,
  targets: Object.freeze({
    size: true,
    opacity: false,
    flow: false,
  }),
});

function clampFinite(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

export function normalizeStudioBrushInOutTaperConfig(
  input?: Partial<StudioBrushInOutTaperConfig> | null,
): StudioBrushInOutTaperConfig {
  if (!input) return DEFAULT_STUDIO_BRUSH_INOUT_TAPER_CONFIG;
  const inUnit: StudioBrushInOutUnit = input.inUnit === "percent" ? "percent" : "px";
  const outUnit: StudioBrushInOutUnit = input.outUnit === "percent" ? "percent" : "px";
  const targets = input.targets;
  return {
    useIn: Boolean(input.useIn),
    inLength: clampFinite(
      input.inLength,
      0,
      inUnit === "percent" ? 100 : 2_000,
      DEFAULT_STUDIO_BRUSH_INOUT_TAPER_CONFIG.inLength,
    ),
    inUnit,
    inMinRatio: clampFinite(input.inMinRatio, 0, 1, 0),
    useOut: Boolean(input.useOut),
    outLength: clampFinite(
      input.outLength,
      0,
      outUnit === "percent" ? 100 : 2_000,
      DEFAULT_STUDIO_BRUSH_INOUT_TAPER_CONFIG.outLength,
    ),
    outUnit,
    outMinRatio: clampFinite(input.outMinRatio, 0, 1, 0),
    curve: clampFinite(input.curve, 0.25, 4, DEFAULT_STUDIO_BRUSH_INOUT_TAPER_CONFIG.curve),
    bySpeed: Boolean(input.bySpeed),
    referenceSpeedPxPerMs: clampFinite(
      input.referenceSpeedPxPerMs,
      0.05,
      10,
      DEFAULT_STUDIO_BRUSH_INOUT_TAPER_CONFIG.referenceSpeedPxPerMs,
    ),
    maxSpeedScale: clampFinite(
      input.maxSpeedScale,
      1,
      5,
      DEFAULT_STUDIO_BRUSH_INOUT_TAPER_CONFIG.maxSpeedScale,
    ),
    targets: {
      size: targets?.size ?? true,
      opacity: Boolean(targets?.opacity),
      flow: Boolean(targets?.flow),
    },
  };
}

export function isStudioBrushInOutTaperIdentity(
  config?: Partial<StudioBrushInOutTaperConfig> | null,
): boolean {
  if (!config) return true;
  const normalized = normalizeStudioBrushInOutTaperConfig(config);
  return !normalized.useIn && !normalized.useOut;
}

/** 입력 속도 시퀀스로부터 지수 이동평균(EMA) 속도를 산출한다. */
export function computeStrokeSpeedEma(
  speedsPxPerMs: readonly number[],
  smoothingAlpha = 0.35,
): number[] {
  const alpha = clampFinite(smoothingAlpha, 0.05, 1, 0.35);
  const result: number[] = [];
  let ema = 0;
  for (let index = 0; index < speedsPxPerMs.length; index += 1) {
    const sample = clampFinite(speedsPxPerMs[index], 0, 50, 0);
    ema = index === 0 ? sample : alpha * sample + (1 - alpha) * ema;
    result.push(ema);
  }
  return result;
}

function resolveTaperSpanPx(
  enabled: boolean,
  length: number,
  unit: StudioBrushInOutUnit,
  totalLengthPx: number,
  speedScale: number,
): number {
  if (!enabled || length <= 0 || totalLengthPx <= 0) return 0;
  const rawPx = unit === "percent" ? (length / 100) * totalLengthPx : length;
  return Math.min(totalLengthPx, Math.max(0, rawPx * speedScale));
}

function evaluateRamp(distancePx: number, spanPx: number, minRatio: number, curve: number): number {
  if (spanPx <= 0 || distancePx >= spanPx) return 1;
  if (distancePx <= 0) return minRatio;
  const t = Math.min(1, Math.max(0, distancePx / spanPx));
  const shaped = Math.pow(t, curve);
  return minRatio + (1 - minRatio) * shaped;
}

/**
 * 한 지점의 들어가기/빼기 감쇠 계수를 계산한다.
 * 시작 감쇠와 끝 감쇠가 짧은 획에서 겹치면 두 포락선의 곱 대신 최솟값을 취해 과도한 소실을 막는다.
 */
export function evaluateStudioBrushInOutTaper(
  config: StudioBrushInOutTaperConfig,
  station: StudioBrushInOutStationInput,
): StudioBrushInOutFactors {
  const normalized = normalizeStudioBrushInOutTaperConfig(config);
  const total = Math.max(0, Number.isFinite(station.totalStrokeLengthPx) ? station.totalStrokeLengthPx : 0);
  const dist = clampFinite(station.distanceFromStartPx, 0, total, 0);

  let speedScale = 1;
  if (normalized.bySpeed && typeof station.speedPxPerMs === "number" && Number.isFinite(station.speedPxPerMs)) {
    const positiveSpeed = Math.max(0, station.speedPxPerMs);
    const ratio = positiveSpeed / normalized.referenceSpeedPxPerMs;
    speedScale = clampFinite(0.45 + 0.55 * ratio, 0.35, normalized.maxSpeedScale, 1);
  }

  const effectiveInLengthPx = resolveTaperSpanPx(
    normalized.useIn,
    normalized.inLength,
    normalized.inUnit,
    total,
    speedScale,
  );
  const effectiveOutLengthPx = resolveTaperSpanPx(
    normalized.useOut,
    normalized.outLength,
    normalized.outUnit,
    total,
    speedScale,
  );

  const inEnv = normalized.useIn
    ? evaluateRamp(dist, effectiveInLengthPx, normalized.inMinRatio, normalized.curve)
    : 1;
  const distFromEnd = Math.max(0, total - dist);
  const outEnv = normalized.useOut
    ? evaluateRamp(distFromEnd, effectiveOutLengthPx, normalized.outMinRatio, normalized.curve)
    : 1;

  const envelope = Math.min(inEnv, outEnv);
  return {
    envelope,
    sizeFactor: normalized.targets.size ? envelope : 1,
    opacityFactor: normalized.targets.opacity ? envelope : 1,
    flowFactor: normalized.targets.flow ? envelope : 1,
    effectiveInLengthPx,
    effectiveOutLengthPx,
  };
}

export interface StudioTaperableDab {
  readonly distanceFromStrokeStart?: number;
  readonly size: number;
  readonly opacity: number;
  readonly flow: number;
}

/**
 * 펜을 뗀 직후 완성된 댑 배열에 들어가기/빼기 감쇠를 일괄 재가중한다.
 * 비활성 설정일 때는 입력 배열의 수치를 그대로 유지한다.
 */
export function applyStudioBrushInOutTaperToDabs<TDab extends StudioTaperableDab>(
  dabs: readonly TDab[],
  totalLengthPx: number,
  config: StudioBrushInOutTaperConfig,
  speedsPxPerMs?: readonly number[],
): TDab[] {
  if (dabs.length === 0 || isStudioBrushInOutTaperIdentity(config)) {
    return [...dabs];
  }
  const emaSpeeds = speedsPxPerMs ? computeStrokeSpeedEma(speedsPxPerMs) : null;
  const tailSpeed = emaSpeeds && emaSpeeds.length > 0 ? emaSpeeds[emaSpeeds.length - 1] : undefined;

  return dabs.map((dab, index) => {
    const distanceFromStartPx =
      typeof dab.distanceFromStrokeStart === "number" && Number.isFinite(dab.distanceFromStrokeStart)
        ? dab.distanceFromStrokeStart
        : dabs.length > 1
          ? (index / (dabs.length - 1)) * totalLengthPx
          : 0;
    const localSpeed = emaSpeeds && emaSpeeds.length > 0
      ? emaSpeeds[Math.min(index, emaSpeeds.length - 1)]
      : tailSpeed;
    const factors = evaluateStudioBrushInOutTaper(config, {
      distanceFromStartPx,
      totalStrokeLengthPx: totalLengthPx,
      speedPxPerMs: localSpeed,
    });
    return {
      ...dab,
      size: dab.size * factors.sizeFactor,
      opacity: dab.opacity * factors.opacityFactor,
      flow: dab.flow * factors.flowFactor,
    };
  });
}
