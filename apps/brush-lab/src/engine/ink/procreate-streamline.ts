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

/**
 * Procreate 5.3+ 오디오 DSP 영감 모션 필터링(Motion Filtering) 설정.
 * (`Brush.archive` 역공학 근거: `ev_64a6768d4a708ba542ac20e920973ef0542a12a5e00d6bc36894ddd738781faf`)
 *
 * 일반 StreamLine/Stabilization이 끈으로 당기듯 끝점 지연(lag)을 유발하는 것과 달리,
 * 진행 접선에 수직인 횡방향 고주파 손떨림(Wobble/Tremor) 성분만 영위상(Zero-Phase) 대역 감쇠로 제거하여
 * 스트로크 길이나 끝점 지연 없이 떨림 극값만 소거한다.
 */
export interface ProcreateMotionFilterConfig {
  /** 모션 필터링 강도 (0..1, 기본 0.55) */
  readonly amount01: number;
  /** 표현력 보존량 (0..1, 높을수록 의도적인 미세 굴곡 표현을 보존, 기본 0.35) */
  readonly expression01: number;
  /** 고주파 떨림 판정 기준 시간 간격 (ms, 기본 24ms) */
  readonly tremorCutoffMs?: number;
}

/**
 * Procreate 모션 필터링(Motion Filtering)을 스트로크 표본 열에 적용한다.
 * 시작점과 끝점 좌표를 100% 보존(Zero-Lag)하면서 횡방향 고주파 진동만 감쇠한다.
 */
export function applyProcreateMotionFiltering(
  samples: readonly StreamlineSample[],
  config: Partial<ProcreateMotionFilterConfig> = {},
): StreamlineSample[] {
  if (samples.length <= 2) return samples.map((s) => ({ ...s }));
  const amount = clamp(config.amount01 ?? 0.55, 0, 1);
  if (amount <= 1e-4) return samples.map((s) => ({ ...s }));

  const expression = clamp(config.expression01 ?? 0.35, 0, 1);
  const cutoffMs = Math.max(4, config.tremorCutoffMs ?? 24);
  const effectiveSuppression = clamp(amount * (1 - expression * 0.65), 0, 0.96);

  // 1단계: 영위상(Zero-Phase) 전후방 저역통과 기준 궤적 산출
  const forward = samples.map((s) => ({ x: s.x, y: s.y }));
  const backward = samples.map((s) => ({ x: s.x, y: s.y }));
  const alpha = clamp(1 - amount * 0.78, 0.12, 0.95);

  for (let i = 1; i < samples.length; i += 1) {
    const prev = forward[i - 1]!;
    const curr = samples[i]!;
    forward[i] = {
      x: prev.x + alpha * (curr.x - prev.x),
      y: prev.y + alpha * (curr.y - prev.y),
    };
  }
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    const next = backward[i + 1]!;
    const curr = samples[i]!;
    backward[i] = {
      x: next.x + alpha * (curr.x - next.x),
      y: next.y + alpha * (curr.y - next.y),
    };
  }

  const out: StreamlineSample[] = [];
  const first = samples[0]!;
  out.push({ ...first });

  for (let i = 1; i < samples.length - 1; i += 1) {
    const prev = samples[i - 1]!;
    const curr = samples[i]!;
    const next = samples[i + 1]!;
    const zeroPhaseX = 0.5 * (forward[i]!.x + backward[i]!.x);
    const zeroPhaseY = 0.5 * (forward[i]!.y + backward[i]!.y);

    // 국소 진행 방향 단위 벡터 (prev -> next)
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const chordLen = Math.hypot(dx, dy);

    const dt = Math.max(1, (next.timeMs - prev.timeMs) * 0.5);
    const highFreqWeight = clamp(cutoffMs / (dt + cutoffMs * 0.35), 0.25, 1);
    const attenuate = clamp(effectiveSuppression * highFreqWeight, 0, 0.96);

    if (chordLen < 1e-4) {
      out.push({
        x: curr.x + attenuate * (zeroPhaseX - curr.x),
        y: curr.y + attenuate * (zeroPhaseY - curr.y),
        pressure: curr.pressure,
        timeMs: curr.timeMs,
      });
      continue;
    }

    const tx = dx / chordLen;
    const ty = dy / chordLen;
    const nx = -ty;
    const ny = tx;

    // 현재 표본과 영위상 중심선 사이의 변위를 접선(종방향)과 법선(횡방향 떨림) 성분으로 분해
    const errX = curr.x - zeroPhaseX;
    const errY = curr.y - zeroPhaseY;
    const longitudinal = errX * tx + errY * ty;
    const lateralWobble = errX * nx + errY * ny;

    // 종방향 진행감은 보존하고 횡방향 고주파 떨림(Wobble)만 선택적으로 소거
    const filteredLateral = lateralWobble * (1 - attenuate);
    const filteredLongitudinal = longitudinal * (1 - attenuate * 0.25);

    out.push({
      x: zeroPhaseX + tx * filteredLongitudinal + nx * filteredLateral,
      y: zeroPhaseY + ty * filteredLongitudinal + ny * filteredLateral,
      pressure: clamp(
        curr.pressure * (1 - attenuate * 0.4) +
          ((prev.pressure + next.pressure) * 0.5) * (attenuate * 0.4),
        0,
        1,
      ),
      timeMs: curr.timeMs,
    });
  }

  const last = samples[samples.length - 1]!;
  out.push({ ...last });
  return out;
}

/**
 * Procreate 이중 테이퍼(Pressure Taper + Touch Taper) 설정.
 * Apple Pencil 스타일러스 입력과 손가락(Touch) 입력에 각각 독립적인 입·출필 테이퍼 곡선을 적용한다.
 */
export interface ProcreateDualTaperConfig {
  readonly linkStartAndEnd: boolean;
  readonly startLength01: number;
  readonly endLength01: number;
  /** 펜 필압 테이퍼 파라미터 */
  readonly pressureSize01: number;
  readonly pressureOpacity01: number;
  readonly pressureStrength01: number;
  readonly pressureTipSharpness01: number;
  /** 손가락 터치 테이퍼 파라미터 */
  readonly touchSize01: number;
  readonly touchOpacity01: number;
  readonly touchTipSharpness01: number;
  /** 클래식 테이퍼(false면 현대적 아날로그 브러시 끝단 애니메이션 활성) */
  readonly classicTaper: boolean;
}

export const DEFAULT_PROCREATE_DUAL_TAPER_CONFIG: ProcreateDualTaperConfig = {
  linkStartAndEnd: false,
  startLength01: 0.18,
  endLength01: 0.24,
  pressureSize01: 0.85,
  pressureOpacity01: 0.45,
  pressureStrength01: 0.7,
  pressureTipSharpness01: 0.2,
  touchSize01: 0.9,
  touchOpacity01: 0.6,
  touchTipSharpness01: 0.15,
  classicTaper: false,
};

export interface ProcreateTaperEnvelopeResult {
  readonly sizeMultiplier01: number;
  readonly opacityMultiplier01: number;
  readonly effectivePressure01: number;
  readonly activeMode: "pressure-taper" | "touch-taper";
}

/**
 * 스트로크 내 정규화 진행 위치 `progress01` (0..1)와 포인터 종류(`pen` | `touch` | `mouse`)에 대해
 * Procreate 이중 테이퍼(Pressure/Touch Taper) 배율을 계산한다.
 */
export function evaluateProcreateDualTaperEnvelope(
  progress01: number,
  rawPressure01: number,
  pointerType: "pen" | "touch" | "mouse",
  config: Partial<ProcreateDualTaperConfig> = {},
): ProcreateTaperEnvelopeResult {
  const cfg: ProcreateDualTaperConfig = {
    ...DEFAULT_PROCREATE_DUAL_TAPER_CONFIG,
    ...config,
  };
  const t = clamp(progress01, 0, 1);
  const p = clamp(rawPressure01, 0.02, 1);
  const startLen = clamp(cfg.startLength01, 0, 0.49);
  const endLen = cfg.linkStartAndEnd
    ? startLen
    : clamp(cfg.endLength01, 0, 0.49);

  let ramp01 = 1;
  if (startLen > 1e-4 && t < startLen) {
    ramp01 = clamp(t / startLen, 0, 1);
  } else if (endLen > 1e-4 && t > 1 - endLen) {
    ramp01 = clamp((1 - t) / endLen, 0, 1);
  }

  const isPen = pointerType === "pen";
  const tipSharpness = isPen
    ? clamp(cfg.pressureTipSharpness01, 0, 1)
    : clamp(cfg.touchTipSharpness01, 0, 1);
  // tipSharpness=0(예리한 끝) -> 거듭제곱 곡선, tipSharpness=1(뭉툭한 끝) -> 루트 완만 곡선
  const shapedRamp = cfg.classicTaper
    ? ramp01
    : Math.pow(ramp01, 1.65 - tipSharpness * 1.15);

  const sizeDepth = isPen ? clamp(cfg.pressureSize01, 0, 1) : clamp(cfg.touchSize01, 0, 1);
  const opacityDepth = isPen ? clamp(cfg.pressureOpacity01, 0, 1) : clamp(cfg.touchOpacity01, 0, 1);
  const pressureDepth = isPen ? clamp(cfg.pressureStrength01, 0, 1) : 0.5;

  const sizeMultiplier01 = clamp(1 - sizeDepth * (1 - shapedRamp), 0.04, 1);
  const opacityMultiplier01 = clamp(1 - opacityDepth * (1 - shapedRamp), 0.02, 1);
  const effectivePressure01 = clamp(p * (1 - pressureDepth * (1 - shapedRamp)), 0.02, 1);

  return {
    sizeMultiplier01,
    opacityMultiplier01,
    effectivePressure01,
    activeMode: isPen ? "pressure-taper" : "touch-taper",
  };
}

export type ProcreateExtendedQuickShapeKind =
  | "line"
  | "arc"
  | "ellipse"
  | "circle"
  | "triangle"
  | "rectangle"
  | "quadrilateral"
  | "polyline";

export interface ProcreateEditableQuickShapeResult {
  readonly kind: ProcreateExtendedQuickShapeKind;
  readonly isPerfectVariant: boolean;
  readonly confidence01: number;
  /** Edit Shape 모드에서 사용자가 드래그 가능한 제어 노드들 */
  readonly controlNodes: readonly { readonly id: string; readonly x: number; readonly y: number }[];
  /** 스냅된 최종 윤곽선 정점들 */
  readonly contourPoints: readonly { readonly x: number; readonly y: number }[];
}

/**
 * Procreate QuickShape + Edit Shape 통합 판별 및 정형 변환기.
 * 한 손가락 터치 홀드(`convertToPerfect = true`) 시 타원→정원, 직사각형→정사각형, 삼각형→정삼각형, 직선→15° 각도 스냅을 수행한다.
 */
export function classifyAndPerfectifyProcreateQuickShape(
  samples: readonly { readonly x: number; readonly y: number }[],
  options: {
    readonly convertToPerfect?: boolean;
    readonly cornerAngleDeg?: number;
  } = {},
): ProcreateEditableQuickShapeResult {
  const convertToPerfect = options.convertToPerfect ?? false;
  const base = detectQuickShapePrimitive(samples, options.cornerAngleDeg ?? 55);
  const first = samples[0] ?? { x: 0, y: 0 };
  const last = samples[samples.length - 1] ?? first;

  if (base.kind === "line") {
    let endX = last.x;
    let endY = last.y;
    if (convertToPerfect) {
      const dx = last.x - first.x;
      const dy = last.y - first.y;
      const len = Math.hypot(dx, dy);
      const stepRad = (15 * Math.PI) / 180;
      const snappedAngle = Math.round(Math.atan2(dy, dx) / stepRad) * stepRad;
      endX = first.x + Math.cos(snappedAngle) * len;
      endY = first.y + Math.sin(snappedAngle) * len;
    }
    return {
      kind: "line",
      isPerfectVariant: convertToPerfect,
      confidence01: base.confidence,
      controlNodes: [
        { id: "start", x: first.x, y: first.y },
        { id: "end", x: endX, y: endY },
      ],
      contourPoints: [
        { x: first.x, y: first.y },
        { x: endX, y: endY },
      ],
    };
  }

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of samples) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const cx = 0.5 * (minX + maxX);
  const cy = 0.5 * (minY + maxY);
  let rx = Math.max(1, 0.5 * (maxX - minX));
  let ry = Math.max(1, 0.5 * (maxY - minY));

  const chordLen = Math.hypot(last.x - first.x, last.y - first.y);
  const diagLen = Math.hypot(maxX - minX, maxY - minY);
  const isClosed = diagLen > 1e-4 && chordLen / diagLen <= 0.35;

  if (base.kind === "polyline") {
    const pts = base.snappedPoints;
    // 시작점과 끝점이 가깝고 코너 수가 4개(삼각형 폐곡선) 또는 5개(사각형 폐곡선)인 경우 분류
    if (isClosed && pts.length === 4) {
      if (convertToPerfect) {
        const radius = 0.5 * (rx + ry);
        const eqNodes = [0, 1, 2].map((idx) => {
          const theta = -Math.PI / 2 + (idx * 2 * Math.PI) / 3;
          return {
            id: `v${idx}`,
            x: cx + Math.cos(theta) * radius,
            y: cy + Math.sin(theta) * radius,
          };
        });
        return {
          kind: "triangle",
          isPerfectVariant: true,
          confidence01: 0.94,
          controlNodes: eqNodes,
          contourPoints: [...eqNodes.map(({ x, y }) => ({ x, y })), { x: eqNodes[0]!.x, y: eqNodes[0]!.y }],
        };
      }
      const triNodes = pts.slice(0, 3).map((p, idx) => ({ id: `v${idx}`, x: p.x, y: p.y }));
      return {
        kind: "triangle",
        isPerfectVariant: false,
        confidence01: 0.92,
        controlNodes: triNodes,
        contourPoints: [...triNodes.map(({ x, y }) => ({ x, y })), { x: triNodes[0]!.x, y: triNodes[0]!.y }],
      };
    }

    if (isClosed && pts.length === 5) {
      if (convertToPerfect) {
        const halfSide = 0.5 * (rx + ry);
        const sqNodes = [
          { id: "v0", x: cx - halfSide, y: cy - halfSide },
          { id: "v1", x: cx + halfSide, y: cy - halfSide },
          { id: "v2", x: cx + halfSide, y: cy + halfSide },
          { id: "v3", x: cx - halfSide, y: cy + halfSide },
        ];
        return {
          kind: "rectangle",
          isPerfectVariant: true,
          confidence01: 0.95,
          controlNodes: sqNodes,
          contourPoints: [...sqNodes.map(({ x, y }) => ({ x, y })), { x: sqNodes[0]!.x, y: sqNodes[0]!.y }],
        };
      }
      const quadNodes = pts.slice(0, 4).map((p, idx) => ({ id: `v${idx}`, x: p.x, y: p.y }));
      return {
        kind: "quadrilateral",
        isPerfectVariant: false,
        confidence01: 0.91,
        controlNodes: quadNodes,
        contourPoints: [...quadNodes.map(({ x, y }) => ({ x, y })), { x: quadNodes[0]!.x, y: quadNodes[0]!.y }],
      };
    }

    const polyNodes = pts.map((p, idx) => ({ id: `v${idx}`, x: p.x, y: p.y }));
    return {
      kind: "polyline",
      isPerfectVariant: convertToPerfect,
      confidence01: base.confidence,
      controlNodes: polyNodes,
      contourPoints: pts.map((p) => ({ x: p.x, y: p.y })),
    };
  }

  if (base.kind === "circle" || isClosed) {
    const isCircle = convertToPerfect || Math.abs(rx - ry) / Math.max(rx, ry) <= 0.12;
    if (isCircle) {
      const r = 0.5 * (rx + ry);
      rx = r;
      ry = r;
    }
    const contour: { x: number; y: number }[] = [];
    for (let k = 0; k < 24; k += 1) {
      const theta = (k / 24) * Math.PI * 2;
      contour.push({
        x: cx + Math.cos(theta) * rx,
        y: cy + Math.sin(theta) * ry,
      });
    }
    return {
      kind: isCircle ? "circle" : "ellipse",
      isPerfectVariant: isCircle,
      confidence01: base.kind === "circle" ? base.confidence : 0.86,
      controlNodes: [
        { id: "north", x: cx, y: cy - ry },
        { id: "east", x: cx + rx, y: cy },
        { id: "south", x: cx, y: cy + ry },
        { id: "west", x: cx - rx, y: cy },
      ],
      contourPoints: contour,
    };
  }

  // 열린 곡선은 호(Arc)로 분류하고 시작·중간·끝 3개 Edit Shape 노드 제공
  const midSample = samples[Math.floor(samples.length / 2)] ?? first;
  return {
    kind: "arc",
    isPerfectVariant: convertToPerfect,
    confidence01: 0.85,
    controlNodes: [
      { id: "start", x: first.x, y: first.y },
      { id: "apex", x: midSample.x, y: midSample.y },
      { id: "end", x: last.x, y: last.y },
    ],
    contourPoints: samples.map((p) => ({ x: p.x, y: p.y })),
  };
}

