/**
 * Paint Tool SAI Ver.2 (S-1 ~ S-7) 및 Lazy Nezumi Pro 스타일의
 * 견인줄(Pulled-String) 손떨림 보정기 & 필압 S-커브를
 * 외부 상용 라이브러리 없이 순수 수학 공식으로 클린룸 내재화한 모듈.
 *
 * 핵심 기하·물리 원리:
 * 1. 견인줄(Pulled-String) 데드존 & 직선 견인:
 *    펜촉 위치 $\vec{p}_{\text{anchor}}$ 와 스타일러스 커서 $\vec{p}_{\text{cursor}}$ 사이의
 *    가상 줄 길이 $L = \text{stringLengthPx}$ 를 유지한다.
 *    - 거리 $d = \|\vec{p}_{\text{cursor}} - \vec{p}_{\text{anchor}}\| \le L$ 이면 펜촉은 정지하여
 *      미세 손떨림을 완벽히 제거하고, 진행 방향을 급격히 꺾을 때 코너가 둥글어지지 않고
 *      예리한 직각/예각을 유지한다.
 *    - 거리 $d > L$ 이면 펜촉은 커서 방향으로 $(d - L)$ 만큼 끌려온다:
 *      $$\vec{p}_{\text{target}} = \vec{p}_{\text{cursor}} - \frac{\vec{p}_{\text{cursor}} - \vec{p}_{\text{anchor}}}{d} L$$
 * 2. SAI S-1..S-7 지수 평활 필터:
 *    `saiLevel` (0..22, 16~22가 S-1~S-7에 대응)에 따라 시정수 $\tau$ 를 조절해
 *    저속 선화에서도 흔들림 없는 만화 펜선을 생성한다.
 * 3. SAI 필압 감마 S-커브:
 *    낮은 진입 필압에서는 날카로운 끝선(세필)을 만들고, 고필압에서는 포화되는 비선형 응답을 제공한다.
 */

export interface SaiPulledStringConfig {
  /** 가상 견인줄 길이 (px, 0..60, 기본 8) */
  readonly stringLengthPx: number;
  /** SAI 손떨림 보정 단계 (0 = 끔, 1..15 = 일반, 16..22 = S-1..S-7, 기본 16) */
  readonly saiLevel: number;
  /** 필압 감마 지수 (0.3..3.0, 기본 1.35) */
  readonly pressureGamma: number;
  /** 최소 유효 필압 (0..0.5, 기본 0.02) */
  readonly minPressure: number;
}

export const DEFAULT_SAI_PULLED_STRING_CONFIG: SaiPulledStringConfig = {
  stringLengthPx: 8,
  saiLevel: 16,
  pressureGamma: 1.35,
  minPressure: 0.02,
};

export interface PulledStringState {
  readonly anchorX: number;
  readonly anchorY: number;
  readonly smoothedX: number;
  readonly smoothedY: number;
  readonly lastTimestampMs: number;
}

export interface PulledStringInputSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly timestampMs: number;
  readonly phase?: "down" | "move" | "up";
}

export interface PulledStringOutputSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly tensionRatio: number;
  readonly isCornerTurn: boolean;
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * SAI 스타일의 비선형 필압 커브를 계산한다.
 */
export function computeSaiPressureCurve(
  rawPressure: number,
  gamma: number = DEFAULT_SAI_PULLED_STRING_CONFIG.pressureGamma,
  minPressure: number = DEFAULT_SAI_PULLED_STRING_CONFIG.minPressure,
): number {
  const p = clamp(rawPressure, 0, 1);
  if (p <= minPressure) return 0;
  const normalized = (p - minPressure) / Math.max(1e-6, 1 - minPressure);
  const safeGamma = clamp(gamma, 0.25, 4);
  // 감마 거듭제곱과 부드러운 S-커브 보간 결합
  const gammaMapped = normalized ** safeGamma;
  const sCurve = gammaMapped * gammaMapped * (3 - 2 * gammaMapped);
  return clamp(0.65 * gammaMapped + 0.35 * sCurve, 0, 1);
}

/**
 * 초기 견인줄 보정기 상태를 생성한다.
 */
export function createPulledStringState(x: number, y: number, timestampMs: number = 0): PulledStringState {
  return {
    anchorX: x,
    anchorY: y,
    smoothedX: x,
    smoothedY: y,
    lastTimestampMs: timestampMs,
  };
}

/**
 * 단일 입력 표본에 대해 견인줄 물리 + SAI S-레벨 평활화를 수행한다.
 */
export function stepPulledStringStabilizer(
  state: PulledStringState,
  sample: PulledStringInputSample,
  config: Partial<SaiPulledStringConfig> = {},
): { readonly state: PulledStringState; readonly output: PulledStringOutputSample } {
  const cfg: SaiPulledStringConfig = {
    ...DEFAULT_SAI_PULLED_STRING_CONFIG,
    ...config,
  };
  const stringLen = clamp(cfg.stringLengthPx, 0, 120);
  const level = clamp(cfg.saiLevel, 0, 22);

  const dx = sample.x - state.anchorX;
  const dy = sample.y - state.anchorY;
  const dist = Math.hypot(dx, dy);

  let nextAnchorX = state.anchorX;
  let nextAnchorY = state.anchorY;
  let tensionRatio = stringLen <= 1e-5 ? 1 : clamp(dist / stringLen, 0, 1);

  if (sample.phase === "up" || stringLen <= 1e-5) {
    // 스트로크 종료 시에는 줄 끝까지 따라붙어 획 끝이 잘리지 않게 한다
    nextAnchorX = sample.x;
    nextAnchorY = sample.y;
    tensionRatio = 1;
  } else if (dist > stringLen) {
    const ux = dx / dist;
    const uy = dy / dist;
    nextAnchorX = sample.x - ux * stringLen;
    nextAnchorY = sample.y - uy * stringLen;
    tensionRatio = 1;
  }

  // SAI 레벨에 따른 지수 평활 시정수 (S-1..S-7 구간인 16..22에서 비선형 증가)
  const dtSec = Math.max(1e-4, Math.min(0.25, (sample.timestampMs - state.lastTimestampMs) / 1000 || 1 / 60));
  const tauSec =
    level <= 0
      ? 0
      : level <= 15
        ? 0.003 * level
        : 0.045 + (level - 15) * 0.018;
  const alpha = sample.phase === "up" || tauSec <= 1e-5 ? 1 : dtSec / (tauSec + dtSec);

  const smoothedX = state.smoothedX + alpha * (nextAnchorX - state.smoothedX);
  const smoothedY = state.smoothedY + alpha * (nextAnchorY - state.smoothedY);

  // 이전 평활 방향과 새 견인 방향의 코사인으로 급격한 꺾임 감지
  const moveDx = nextAnchorX - state.anchorX;
  const moveDy = nextAnchorY - state.anchorY;
  const prevDx = state.anchorX - state.smoothedX;
  const prevDy = state.anchorY - state.smoothedY;
  const moveLen = Math.hypot(moveDx, moveDy);
  const prevLen = Math.hypot(prevDx, prevDy);
  const cosAngle =
    moveLen > 0.25 && prevLen > 0.25 ? (moveDx * prevDx + moveDy * prevDy) / (moveLen * prevLen) : 1;

  return {
    state: {
      anchorX: nextAnchorX,
      anchorY: nextAnchorY,
      smoothedX,
      smoothedY,
      lastTimestampMs: sample.timestampMs,
    },
    output: {
      x: smoothedX,
      y: smoothedY,
      pressure: computeSaiPressureCurve(sample.pressure, cfg.pressureGamma, cfg.minPressure),
      tensionRatio,
      isCornerTurn: cosAngle < 0.15,
    },
  };
}

/**
 * 전체 스트로크 표본 배열에 대해 SAI 견인줄 보정을 일괄 적용한다.
 */
export function processSaiPulledStringStroke(
  samples: readonly PulledStringInputSample[],
  config: Partial<SaiPulledStringConfig> = {},
): readonly PulledStringOutputSample[] {
  if (samples.length === 0) return [];
  const first = samples[0]!;
  let state = createPulledStringState(first.x, first.y, first.timestampMs);
  const results: PulledStringOutputSample[] = [];

  for (let i = 0; i < samples.length; i += 1) {
    const sample = samples[i]!;
    const stepped = stepPulledStringStabilizer(state, sample, config);
    state = stepped.state;
    results.push(stepped.output);
  }
  return results;
}
