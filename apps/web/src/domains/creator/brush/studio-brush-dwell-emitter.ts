/**
 * 클립스튜디오 페인트 5.1.5 `연속 분사` (`BrushContinuousPlot`, `toolbrushcontinuousplot`) 체류 누적 엔진.
 *
 * 역공학 행동 기준 근거 (REA MCP 정적 분석):
 * - `EditImageTool.todb` (`ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68`):
 *   `BrushContinuousPlot` 컬럼 및 에어브러시/번짐 수채화 서브툴 설정.
 *
 * 펜을 한자리에 누른 채 멈추고 있을 때(`displacement <= stationaryRadiusPx`) 결정론적 시간 간격(`intervalMs`)마다
 * 농도를 점진적으로 쌓되, 점근적 상한(`maxBuildup`)을 두어 과포화 알파 폭발을 방지한다.
 */

export interface StudioBrushDwellConfig {
  readonly enabled: boolean;
  /** 체류 도장을 방출할 고정 주기(ms, 8..100). 기본 16.67ms(약 60Hz). */
  readonly intervalMs: number;
  /** 제자리 멈춤으로 판정할 반경(px, 0.25..12). */
  readonly stationaryRadiusPx: number;
  /** 한 지점 체류 시 누적 유량 상한 (0.05..1). */
  readonly maxBuildup: number;
  /** 틱당 유량 감쇠 계수 (0.5..0.98). */
  readonly decayPerTick: number;
}

export interface StudioBrushDwellState {
  readonly anchorX: number;
  readonly anchorY: number;
  readonly lastTimestampMs: number;
  readonly accumulatedMs: number;
  readonly emittedTicks: number;
  readonly accumulatedCoverage: number;
}

export interface StudioBrushDwellTickSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly timestampMs: number;
  readonly tickIndex: number;
  readonly effectiveFlowScale: number;
}

export const DEFAULT_STUDIO_BRUSH_DWELL_CONFIG: StudioBrushDwellConfig = Object.freeze({
  enabled: false,
  intervalMs: 16.67,
  stationaryRadiusPx: 1.75,
  maxBuildup: 0.85,
  decayPerTick: 0.86,
});

export function normalizeStudioBrushDwellConfig(
  input?: Partial<StudioBrushDwellConfig> | null,
): StudioBrushDwellConfig {
  if (!input) return DEFAULT_STUDIO_BRUSH_DWELL_CONFIG;
  const num = (v: unknown, min: number, max: number, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  return {
    enabled: Boolean(input.enabled),
    intervalMs: num(input.intervalMs, 8, 100, DEFAULT_STUDIO_BRUSH_DWELL_CONFIG.intervalMs),
    stationaryRadiusPx: num(
      input.stationaryRadiusPx,
      0.25,
      12,
      DEFAULT_STUDIO_BRUSH_DWELL_CONFIG.stationaryRadiusPx,
    ),
    maxBuildup: num(input.maxBuildup, 0.05, 1, DEFAULT_STUDIO_BRUSH_DWELL_CONFIG.maxBuildup),
    decayPerTick: num(input.decayPerTick, 0.5, 0.98, DEFAULT_STUDIO_BRUSH_DWELL_CONFIG.decayPerTick),
  };
}

export function createStudioBrushDwellState(
  x: number,
  y: number,
  timestampMs: number,
): StudioBrushDwellState {
  return {
    anchorX: x,
    anchorY: y,
    lastTimestampMs: timestampMs,
    accumulatedMs: 0,
    emittedTicks: 0,
    accumulatedCoverage: 0,
  };
}

export interface StudioBrushDwellAdvanceResult {
  readonly state: StudioBrushDwellState;
  readonly emitted: readonly StudioBrushDwellTickSample[];
}

/**
 * 현재 포인터 위치·시각·필압을 입력받아, 제자리 체류 중이면 경과 시간만큼 결정론적 댑 목록을 생성한다.
 * 포인터가 `stationaryRadiusPx` 밖으로 이동하면 체류 기준점을 새 좌표로 즉시 초기화한다.
 */
export function advanceStudioBrushDwellEmitter(
  prevState: StudioBrushDwellState,
  config: StudioBrushDwellConfig,
  input: Readonly<{
    x: number;
    y: number;
    pressure: number;
    timestampMs: number;
    maxTicksPerStep?: number;
  }>,
): StudioBrushDwellAdvanceResult {
  const normalized = normalizeStudioBrushDwellConfig(config);
  const clampedPressure = Math.min(1, Math.max(0, Number.isFinite(input.pressure) ? input.pressure : 0.5));
  if (!normalized.enabled) {
    return {
      state: createStudioBrushDwellState(input.x, input.y, input.timestampMs),
      emitted: [],
    };
  }

  const dist = Math.hypot(input.x - prevState.anchorX, input.y - prevState.anchorY);
  if (dist > normalized.stationaryRadiusPx) {
    return {
      state: createStudioBrushDwellState(input.x, input.y, input.timestampMs),
      emitted: [],
    };
  }

  const dt = Math.max(0, input.timestampMs - prevState.lastTimestampMs);
  let pendingMs = prevState.accumulatedMs + dt;
  let emittedTicks = prevState.emittedTicks;
  let coverage = prevState.accumulatedCoverage;
  const maxTicks = Math.max(1, Math.min(64, input.maxTicksPerStep ?? 24));
  const emitted: StudioBrushDwellTickSample[] = [];

  while (pendingMs >= normalized.intervalMs && emitted.length < maxTicks) {
    pendingMs -= normalized.intervalMs;
    const headroom = Math.max(0, normalized.maxBuildup - coverage);
    if (headroom <= 1e-4) {
      emittedTicks += 1;
      continue;
    }
    const rawStep = Math.pow(normalized.decayPerTick, emittedTicks) * 0.18 * Math.max(0.1, clampedPressure);
    const deltaCoverage = Math.min(headroom, rawStep);
    if (deltaCoverage > 1e-4) {
      coverage += deltaCoverage;
      emitted.push({
        x: prevState.anchorX,
        y: prevState.anchorY,
        pressure: clampedPressure,
        timestampMs: input.timestampMs - pendingMs,
        tickIndex: emittedTicks,
        effectiveFlowScale: deltaCoverage / Math.max(0.1, clampedPressure),
      });
    }
    emittedTicks += 1;
  }

  return {
    state: {
      anchorX: prevState.anchorX,
      anchorY: prevState.anchorY,
      lastTimestampMs: input.timestampMs,
      accumulatedMs: Math.min(pendingMs, normalized.intervalMs),
      emittedTicks,
      accumulatedCoverage: coverage,
    },
    emitted,
  };
}
