/**
 * Procreate StreamLine · QuickShape 및 Clip Studio Paint 선 후보정(Post-Correction) 원리를
 * 외부 상용·오픈소스 코드 참조 없이 순수 기하·운동학 수식으로 클린룸 내재화한 모듈.
 *
 * 핵심 수학 모델:
 * 1. 곡률 적응형 StreamLine (Curvature-Adaptive Exponential Moving Average):
 *    연속된 세 입력 표본 $p_{i-1}, p_i, p_{i+1}$ 의 방향 전환각 $\theta_i = \arccos(\hat{u}_{i-1} \cdot \hat{u}_i)$ 로부터
 *    국소 곡률 지표 $\kappa_i = \theta_i / \pi \in [0, 1]$ 를 계산한다.
 *    직선·완만한 곡선($\kappa_i \to 0$)에서는 강한 평활화 가중치 $\alpha_{\text{min}}$ 를 적용해 손떨림을 억제하고,
 *    예각 코너($\theta_i \ge \theta_{\text{corner}}$)에서는 $\alpha \to 1$ 로 즉시 수렴시켜 머리카락 끝·말풍선 꼬리의
 *    날카로운 꺾임을 보존한다.
 *
 * 2. Clip Studio Paint 스타일 코너 보존 라플라시안 후보정 (Corner-Preserving Post-Correction):
 *    획이 끝난 뒤 시작점·끝점과 임계 각도 이상의 코너 정점을 고정(pin)한 채로
 *    내부 정점에 대칭 가중 평균 $p_i^{(k+1)} = (1 - \lambda) p_i^{(k)} + \frac{\lambda}{2}(p_{i-1}^{(k)} + p_{i+1}^{(k)})$ 을
 *    반복 적용한다.
 *
 * 3. Procreate QuickShape 스타일 도형 프리미티브 자동 판별기 (`detectQuickShapePrimitive`):
 *    - 직선(`line`): 양 끝점 직선 거리 대비 누적 호 길이 비율(직선도 $L_{\text{chord}} / L_{\text{arc}}$)이 임계값 이상일 때
 *    - 원/호(`circle`): 시작·끝점이 가깝고 무게중심 기준 반지름의 상대 표준편차($\sigma_r / \mu_r$)가 낮을 때
 *    - 다각선(`polyline`): 예각 코너들로 나뉜 각 구간이 높은 직선도를 가질 때
 *    - 자유곡선(`freeform`): 그 외 일반 스트로크
 */

export interface StreamlineSample {
  readonly x: number;
  readonly y: number;
  readonly pressure: number;
  readonly timeMs: number;
}

export interface ProcreateStreamlineConfig {
  /** StreamLine 강도 (0 = 보정 없음, 1 = 최대 안정화, 기본 0.65) */
  readonly streamlineAmount: number;
  /** 코너로 판정할 최소 꺾임 각도 (도 단위, 기본 52도) */
  readonly cornerAngleDeg: number;
  /** 획 완료 후 CSP 스타일 후보정 반복 횟수 (0..5, 기본 2) */
  readonly postCorrectionPasses: number;
  /** 후보정 수축 강도 (0..0.5, 기본 0.32) */
  readonly postCorrectionLambda: number;
}

export const DEFAULT_PROCREATE_STREAMLINE_CONFIG: ProcreateStreamlineConfig = {
  streamlineAmount: 0.65,
  cornerAngleDeg: 52,
  postCorrectionPasses: 2,
  postCorrectionLambda: 0.32,
};

export type QuickShapeKind = "line" | "circle" | "polyline" | "freeform";

export interface QuickShapeDetectionResult {
  readonly kind: QuickShapeKind;
  /** 도형 판정 신뢰도 (0..1) */
  readonly confidence: number;
  /** 스냅된 주요 제어점 목록 */
  readonly snappedPoints: readonly { readonly x: number; readonly y: number }[];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * 세 점 a -> b -> c 사이의 방향 회전 각도(라디안, 0..pi)를 계산한다.
 * 0이면 완전한 일직선 전진, pi에 가까울수록 급격한 유턴/예각 꺾임이다.
 */
export function computeTurningAngleRad(
  a: { readonly x: number; readonly y: number },
  b: { readonly x: number; readonly y: number },
  c: { readonly x: number; readonly y: number },
): number {
  const ux = b.x - a.x;
  const uy = b.y - a.y;
  const vx = c.x - b.x;
  const vy = c.y - b.y;
  const lenU = Math.hypot(ux, uy);
  const lenV = Math.hypot(vx, vy);
  if (lenU < 1e-5 || lenV < 1e-5) return 0;
  const dot = clamp((ux * vx + uy * vy) / (lenU * lenV), -1, 1);
  return Math.acos(dot);
}

/**
 * 곡률 적응형 Procreate StreamLine 필터를 스트로크 표본 열에 적용한다.
 */
export function applyCurvatureStreamline(
  samples: readonly StreamlineSample[],
  config: Partial<ProcreateStreamlineConfig> = {},
): StreamlineSample[] {
  if (samples.length <= 2) return samples.map((s) => ({ ...s }));
  const cfg: ProcreateStreamlineConfig = {
    ...DEFAULT_PROCREATE_STREAMLINE_CONFIG,
    ...config,
  };
  const amount = clamp(cfg.streamlineAmount, 0, 1);
  if (amount <= 1e-4) return samples.map((s) => ({ ...s }));

  const cornerRad = (clamp(cfg.cornerAngleDeg, 15, 160) * Math.PI) / 180;
  const baseAlpha = 1 - amount * 0.82; // amount=1 -> alpha=0.18 (강한 평활화)

  const out: StreamlineSample[] = [];
  const first = samples[0];
  if (!first) return [];
  out.push({ ...first });

  let smoothX = first.x;
  let smoothY = first.y;
  let smoothP = first.pressure;

  for (let i = 1; i < samples.length - 1; i += 1) {
    const prev = samples[i - 1] ?? first;
    const curr = samples[i] ?? first;
    const next = samples[i + 1] ?? curr;

    const turnRad = computeTurningAngleRad(prev, curr, next);
    // 코너 임계각 이상이면 평활화 지연을 즉시 해제(alpha=1)하여 꺾임 각도를 유지
    const isSharpCorner = turnRad >= cornerRad;
    const cornerBlend = isSharpCorner ? 1 : clamp(turnRad / cornerRad, 0, 1) ** 2;
    const alpha = clamp(baseAlpha + (1 - baseAlpha) * cornerBlend, 0.1, 1);

    smoothX = smoothX + alpha * (curr.x - smoothX);
    smoothY = smoothY + alpha * (curr.y - smoothY);
    smoothP = clamp(smoothP + (0.4 + 0.6 * alpha) * (curr.pressure - smoothP), 0, 1);

    out.push({
      x: isSharpCorner ? curr.x : smoothX,
      y: isSharpCorner ? curr.y : smoothY,
      pressure: smoothP,
      timeMs: curr.timeMs,
    });
  }

  const last = samples[samples.length - 1];
  if (last) {
    out.push({ ...last });
  }
  return out;
}

/**
 * Clip Studio Paint 스타일의 코너 보존 선 후보정(Post-Correction)을 수행한다.
 * 시작점·끝점 및 `cornerAngleDeg` 이상 꺾이는 코너 정점은 고정(pin)하고 나머지 구간만 매끄럽게 정돈한다.
 */
export function applyPostStrokeCornerPreservingSmooth(
  samples: readonly StreamlineSample[],
  config: Partial<ProcreateStreamlineConfig> = {},
): StreamlineSample[] {
  if (samples.length <= 2) return samples.map((s) => ({ ...s }));
  const cfg: ProcreateStreamlineConfig = {
    ...DEFAULT_PROCREATE_STREAMLINE_CONFIG,
    ...config,
  };
  const passes = Math.max(0, Math.min(8, Math.floor(cfg.postCorrectionPasses)));
  const lambda = clamp(cfg.postCorrectionLambda, 0, 0.5);
  if (passes === 0 || lambda <= 1e-4) return samples.map((s) => ({ ...s }));

  const cornerRad = (clamp(cfg.cornerAngleDeg, 15, 160) * Math.PI) / 180;
  const pinned = new Uint8Array(samples.length);
  pinned[0] = 1;
  pinned[samples.length - 1] = 1;

  for (let i = 1; i < samples.length - 1; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const next = samples[i + 1];
    if (prev && curr && next && computeTurningAngleRad(prev, curr, next) >= cornerRad) {
      pinned[i] = 1;
    }
  }

  let current = samples.map((s) => ({ ...s }));
  for (let pass = 0; pass < passes; pass += 1) {
    const nextPass = current.map((s) => ({ ...s }));
    for (let i = 1; i < current.length - 1; i += 1) {
      if (pinned[i] === 1) continue;
      const prev = current[i - 1];
      const self = current[i];
      const next = current[i + 1];
      if (!prev || !self || !next) continue;
      nextPass[i] = {
        x: (1 - lambda) * self.x + 0.5 * lambda * (prev.x + next.x),
        y: (1 - lambda) * self.y + 0.5 * lambda * (prev.y + next.y),
        pressure: self.pressure,
        timeMs: self.timeMs,
      };
    }
    current = nextPass;
  }
  return current;
}

/**
 * Procreate QuickShape 스타일 도형 프리미티브 자동 판별기.
 * 사용자가 획 끝에서 펜을 멈췄을 때 직선·원·다각선·자유곡선 여부를 판별하고 스냅 제어점을 반환한다.
 */
export function detectQuickShapePrimitive(
  samples: readonly { readonly x: number; readonly y: number }[],
  cornerAngleDeg = 55,
): QuickShapeDetectionResult {
  if (samples.length < 3) {
    return {
      kind: "line",
      confidence: 1,
      snappedPoints: samples.map((p) => ({ x: p.x, y: p.y })),
    };
  }

  const first = samples[0] ?? { x: 0, y: 0 };
  const last = samples[samples.length - 1] ?? first;
  let arcLength = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const prev = samples[i - 1] ?? first;
    const curr = samples[i] ?? first;
    arcLength += Math.hypot(curr.x - prev.x, curr.y - prev.y);
  }
  const chordLength = Math.hypot(last.x - first.x, last.y - first.y);

  if (arcLength < 1e-4) {
    return {
      kind: "line",
      confidence: 1,
      snappedPoints: [{ x: first.x, y: first.y }, { x: last.x, y: last.y }],
    };
  }

  const straightness = chordLength / arcLength;
  if (straightness >= 0.965) {
    return {
      kind: "line",
      confidence: clamp((straightness - 0.9) / 0.1, 0, 1),
      snappedPoints: [
        { x: first.x, y: first.y },
        { x: last.x, y: last.y },
      ],
    };
  }

  // 폐곡선 원(circle) 판정: 시작·끝 거리가 전체 호 길이의 22% 이하이고 반지름 편차가 낮을 때
  const closureRatio = chordLength / arcLength;
  if (closureRatio <= 0.22 && samples.length >= 8) {
    let cx = 0;
    let cy = 0;
    for (const p of samples) {
      cx += p.x;
      cy += p.y;
    }
    cx /= samples.length;
    cy /= samples.length;

    const radii = samples.map((p) => Math.hypot(p.x - cx, p.y - cy));
    const meanR = radii.reduce((acc, r) => acc + r, 0) / radii.length;
    if (meanR > 1) {
      const variance = radii.reduce((acc, r) => acc + (r - meanR) ** 2, 0) / radii.length;
      const relStd = Math.sqrt(variance) / meanR;
      if (relStd <= 0.16) {
        const snappedCircle: { x: number; y: number }[] = [];
        for (let k = 0; k < 16; k += 1) {
          const theta = (k / 16) * Math.PI * 2;
          snappedCircle.push({
            x: cx + Math.cos(theta) * meanR,
            y: cy + Math.sin(theta) * meanR,
          });
        }
        return {
          kind: "circle",
          confidence: clamp(1 - relStd * 4, 0.5, 1),
          snappedPoints: snappedCircle,
        };
      }
    }
  }

  // 다각선(polyline) 판정: 예각 코너들로 분할된 구간들이 각각 직선에 가까울 때
  const cornerRad = (clamp(cornerAngleDeg, 20, 150) * Math.PI) / 180;
  const cornerIndices: number[] = [0];
  for (let i = 1; i < samples.length - 1; i += 1) {
    const prev = samples[i - 1];
    const curr = samples[i];
    const next = samples[i + 1];
    if (prev && curr && next && computeTurningAngleRad(prev, curr, next) >= cornerRad) {
      cornerIndices.push(i);
    }
  }
  cornerIndices.push(samples.length - 1);

  if (cornerIndices.length >= 3 && cornerIndices.length <= 8) {
    let allSegmentsStraight = true;
    for (let s = 0; s < cornerIndices.length - 1; s += 1) {
      const startIdx = cornerIndices[s] ?? 0;
      const endIdx = cornerIndices[s + 1] ?? samples.length - 1;
      const startPt = samples[startIdx] ?? first;
      const endPt = samples[endIdx] ?? last;
      let segArc = 0;
      for (let j = startIdx + 1; j <= endIdx; j += 1) {
        const p0 = samples[j - 1] ?? startPt;
        const p1 = samples[j] ?? endPt;
        segArc += Math.hypot(p1.x - p0.x, p1.y - p0.y);
      }
      const segChord = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
      if (segArc > 1e-4 && segChord / segArc < 0.94) {
        allSegmentsStraight = false;
        break;
      }
    }
    if (allSegmentsStraight) {
      return {
        kind: "polyline",
        confidence: 0.9,
        snappedPoints: cornerIndices.map((idx) => {
          const pt = samples[idx] ?? first;
          return { x: pt.x, y: pt.y };
        }),
      };
    }
  }

  return {
    kind: "freeform",
    confidence: 1,
    snappedPoints: samples.map((p) => ({ x: p.x, y: p.y })),
  };
}
