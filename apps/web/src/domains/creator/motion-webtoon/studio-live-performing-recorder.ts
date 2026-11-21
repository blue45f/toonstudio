/**
 * Procreate Dreams Live Performing 60Hz 키프레임 녹화기 · 시공간 RDP 단순화 · 큐빅 에르미트 피팅 · 비파괴 오버더빙.
 *
 * 기존 `motion-webtoon-keyframes.ts`의 5채널(`x, y, scale, rotationDeg, opacity`) 계약과 직접 호환되며,
 * 오디오 클럭 동기 실시간 60Hz 포인터/핀치/회전 제스처를 깔끔한 소수 베지어/에르미트 키프레임으로
 * 압축하고 선택한 채널만 비파괴 오버더빙한다.
 */
import { bezierEasing, LINEAR_EASING, type MotionEasing } from "./motion-webtoon-easing";
import {
  IDENTITY_TRANSFORM,
  type MotionKeyframe,
  type MotionTransformValues,
} from "./motion-webtoon-keyframes";

export type PerformingChannelKey = keyof MotionTransformValues;

export const ALL_PERFORMING_CHANNELS: readonly PerformingChannelKey[] = Object.freeze([
  "x",
  "y",
  "scale",
  "rotationDeg",
  "opacity",
]);

export interface RawPerformingSample {
  readonly timeSeconds: number;
  readonly values: MotionTransformValues;
}

export interface PerformingRdpTolerances {
  /** 정규화 가중 오차 허용 임계값(기본 1.0). 값이 클수록 키프레임 수가 줄어든다. */
  readonly epsilon: number;
  /** 각 채널이 오차 1.0으로 환산되는 기준 단위. */
  readonly scaleX: number;
  readonly scaleY: number;
  readonly scaleZoom: number;
  readonly scaleRotationDeg: number;
  readonly scaleOpacity: number;
}

export const DEFAULT_PERFORMING_RDP_TOLERANCES: PerformingRdpTolerances = Object.freeze({
  epsilon: 1.0,
  scaleX: 0.35,
  scaleY: 0.35,
  scaleZoom: 0.015,
  scaleRotationDeg: 0.8,
  scaleOpacity: 0.02,
});

export interface HermiteKeyframeNode {
  readonly atSeconds: number;
  readonly values: MotionTransformValues;
  /** 초당 변화율(접선 기울기) — 큐빅 에르미트 보간 정본. */
  readonly tangent: MotionTransformValues;
  /** 기존 `motion-webtoon-keyframes` 재생기용 근사 큐빅 베지어 이징. */
  readonly easingToNext: MotionEasing;
}

export interface PerformingRecordedTrack {
  readonly trackId: string;
  readonly sampleRateHz: number;
  readonly rawSampleCount: number;
  readonly durationSeconds: number;
  readonly hermiteNodes: readonly HermiteKeyframeNode[];
  readonly motionKeyframes: readonly MotionKeyframe[];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

function lerpTransform(a: MotionTransformValues, b: MotionTransformValues, t: number): MotionTransformValues {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    scale: lerp(a.scale, b.scale, t),
    rotationDeg: lerp(a.rotationDeg, b.rotationDeg, t),
    opacity: clamp(lerp(a.opacity, b.opacity, t), 0, 1),
  };
}

/**
 * 오디오 클럭 동기 60Hz 라이브 퍼포밍 캡처 세션.
 */
export class StudioLivePerformingRecorder {
  private readonly trackId: string;
  private readonly sampleRateHz: number;
  private readonly minIntervalSeconds: number;
  private readonly latencyOffsetSeconds: number;
  private recording = false;
  private startAudioClockSeconds = 0;
  private lastSampleTimeSeconds = -Infinity;
  private readonly samples: RawPerformingSample[] = [];

  constructor(options: {
    readonly trackId: string;
    readonly sampleRateHz?: number;
    readonly latencyOffsetMs?: number;
  }) {
    this.trackId = options.trackId;
    this.sampleRateHz = Math.max(15, Math.min(240, options.sampleRateHz ?? 60));
    this.minIntervalSeconds = 1 / this.sampleRateHz;
    this.latencyOffsetSeconds = (options.latencyOffsetMs ?? 0) / 1000;
  }

  start(audioClockSeconds: number, initialValues: MotionTransformValues = IDENTITY_TRANSFORM): void {
    this.recording = true;
    this.startAudioClockSeconds = Math.max(0, audioClockSeconds);
    this.samples.length = 0;
    this.lastSampleTimeSeconds = 0;
    this.samples.push({ timeSeconds: 0, values: { ...initialValues } });
  }

  /** 오디오 클럭 시각의 포인터/핀치/회전 제스처 상태를 60Hz 페이싱으로 수집한다. */
  pushSample(audioClockSeconds: number, values: MotionTransformValues): boolean {
    if (!this.recording) return false;
    const relTime = Math.max(
      0,
      audioClockSeconds - this.startAudioClockSeconds - this.latencyOffsetSeconds,
    );
    if (relTime < this.lastSampleTimeSeconds + this.minIntervalSeconds * 0.5) {
      return false;
    }
    this.lastSampleTimeSeconds = relTime;
    this.samples.push({
      timeSeconds: Number(relTime.toFixed(6)),
      values: {
        x: values.x,
        y: values.y,
        scale: Math.max(0.01, values.scale),
        rotationDeg: values.rotationDeg,
        opacity: clamp(values.opacity, 0, 1),
      },
    });
    return true;
  }

  /** 녹화를 종료하고 시공간 RDP 단순화 + 큐빅 에르미트 베지어 피팅 트랙을 생성한다. */
  stop(tolerances: Partial<PerformingRdpTolerances> = {}): PerformingRecordedTrack {
    this.recording = false;
    return compilePerformingSamplesToTrack(this.trackId, this.samples, {
      sampleRateHz: this.sampleRateHz,
      tolerances,
    });
  }

  isRecording(): boolean {
    return this.recording;
  }

  getRawSamples(): readonly RawPerformingSample[] {
    return this.samples;
  }
}

/** 다채널 시공간 가중 선분 오차 거리 계산. */
function spatioTemporalDistance(
  point: RawPerformingSample,
  start: RawPerformingSample,
  end: RawPerformingSample,
  tol: PerformingRdpTolerances,
): number {
  const dt = end.timeSeconds - start.timeSeconds;
  const t = dt > 1e-9 ? clamp((point.timeSeconds - start.timeSeconds) / dt, 0, 1) : 0;
  const interp = lerpTransform(start.values, end.values, t);

  const dx = (point.values.x - interp.x) / Math.max(1e-4, tol.scaleX);
  const dy = (point.values.y - interp.y) / Math.max(1e-4, tol.scaleY);
  const ds = (point.values.scale - interp.scale) / Math.max(1e-4, tol.scaleZoom);
  const dr = (point.values.rotationDeg - interp.rotationDeg) / Math.max(1e-4, tol.scaleRotationDeg);
  const doVal = (point.values.opacity - interp.opacity) / Math.max(1e-4, tol.scaleOpacity);

  return Math.sqrt(dx * dx + dy * dy + ds * ds + dr * dr + doVal * doVal);
}

/**
 * 시공간 5채널 Ramer-Douglas-Peucker(RDP) 키프레임 단순화.
 */
export function simplifyPerformingTrackRdp(
  samples: readonly RawPerformingSample[],
  tolerances: Partial<PerformingRdpTolerances> = {},
): readonly RawPerformingSample[] {
  if (samples.length <= 2) return [...samples];
  const tol: PerformingRdpTolerances = { ...DEFAULT_PERFORMING_RDP_TOLERANCES, ...tolerances };
  const keep = new Uint8Array(samples.length);
  keep[0] = 1;
  keep[samples.length - 1] = 1;

  // 재귀 스택 초과 방지를 위한 명시적 스택 RDP
  const stack: Array<[number, number]> = [[0, samples.length - 1]];
  while (stack.length > 0) {
    const [first, last] = stack.pop()!;
    if (last - first <= 1) continue;
    let maxDist = -1;
    let splitIdx = -1;
    const startSample = samples[first]!;
    const endSample = samples[last]!;
    for (let i = first + 1; i < last; i += 1) {
      const dist = spatioTemporalDistance(samples[i]!, startSample, endSample, tol);
      if (dist > maxDist) {
        maxDist = dist;
        splitIdx = i;
      }
    }
    if (maxDist > tol.epsilon && splitIdx > first && splitIdx < last) {
      keep[splitIdx] = 1;
      stack.push([first, splitIdx], [splitIdx, last]);
    }
  }

  const out: RawPerformingSample[] = [];
  for (let i = 0; i < samples.length; i += 1) {
    if (keep[i] === 1) out.push(samples[i]!);
  }
  return out;
}

/**
 * Fritsch-Carlson 단조 큐빅 에르미트 접선 계산으로 오버슈트 없는 자연스러운 키프레임 곡선을 생성한다.
 */
export function fitCubicHermiteKeyframes(
  simplified: readonly RawPerformingSample[],
): readonly HermiteKeyframeNode[] {
  const n = simplified.length;
  if (n === 0) return [];
  if (n === 1) {
    return [
      {
        atSeconds: simplified[0]!.timeSeconds,
        values: { ...simplified[0]!.values },
        tangent: { x: 0, y: 0, scale: 0, rotationDeg: 0, opacity: 0 },
        easingToNext: LINEAR_EASING,
      },
    ];
  }

  const tangents: Record<PerformingChannelKey, number[]> = {
    x: new Array<number>(n).fill(0),
    y: new Array<number>(n).fill(0),
    scale: new Array<number>(n).fill(0),
    rotationDeg: new Array<number>(n).fill(0),
    opacity: new Array<number>(n).fill(0),
  };

  for (const ch of ALL_PERFORMING_CHANNELS) {
    const slopes = new Array<number>(n - 1).fill(0);
    for (let i = 0; i < n - 1; i += 1) {
      const dt = Math.max(1e-5, simplified[i + 1]!.timeSeconds - simplified[i]!.timeSeconds);
      slopes[i] = (simplified[i + 1]!.values[ch] - simplified[i]!.values[ch]) / dt;
    }
    const m = tangents[ch];
    m[0] = slopes[0]!;
    m[n - 1] = slopes[n - 2]!;
    for (let i = 1; i < n - 1; i += 1) {
      const sPrev = slopes[i - 1]!;
      const sNext = slopes[i]!;
      // 부호가 바뀌면 극값이므로 접선 0 (단조 보존), 아니면 조화 평균
      if (sPrev * sNext <= 0) {
        m[i] = 0;
      } else {
        m[i] = (2 * sPrev * sNext) / (sPrev + sNext);
      }
    }
  }

  return simplified.map((sample, i) => {
    const tangent: MotionTransformValues = {
      x: tangents.x[i]!,
      y: tangents.y[i]!,
      scale: tangents.scale[i]!,
      rotationDeg: tangents.rotationDeg[i]!,
      opacity: tangents.opacity[i]!,
    };
    let easingToNext: MotionEasing = LINEAR_EASING;
    if (i < n - 1) {
      const next = simplified[i + 1]!;
      const dt = Math.max(1e-5, next.timeSeconds - sample.timeSeconds);
      // 가장 큰 변위 채널의 정규화 접선으로 호환 1D cubic-bezier 이징 근사
      let dominantDelta = 0;
      let y1 = 0.3333;
      let y2 = 0.6667;
      for (const ch of ALL_PERFORMING_CHANNELS) {
        const delta = next.values[ch] - sample.values[ch];
        if (Math.abs(delta) > Math.abs(dominantDelta)) {
          dominantDelta = delta;
          if (Math.abs(delta) > 1e-6) {
            y1 = clamp((tangents[ch][i]! * dt) / (3 * delta), -0.5, 1.5);
            y2 = clamp(1 - (tangents[ch][i + 1]! * dt) / (3 * delta), -0.5, 1.5);
          }
        }
      }
      easingToNext = Math.abs(dominantDelta) <= 1e-6
        ? LINEAR_EASING
        : bezierEasing(0.3333, Number(y1.toFixed(4)), 0.6667, Number(y2.toFixed(4)));
    }
    return {
      atSeconds: sample.timeSeconds,
      values: { ...sample.values },
      tangent,
      easingToNext,
    };
  });
}

/** 큐빅 에르미트 키프레임 트랙을 임의 시각 `timeSeconds`에서 연속 평가한다. */
export function sampleHermitePerformingTrack(
  nodes: readonly HermiteKeyframeNode[],
  timeSeconds: number,
): MotionTransformValues {
  if (nodes.length === 0) return IDENTITY_TRANSFORM;
  if (nodes.length === 1 || timeSeconds <= nodes[0]!.atSeconds) return { ...nodes[0]!.values };
  const last = nodes[nodes.length - 1]!;
  if (timeSeconds >= last.atSeconds) return { ...last.values };

  let idx = 0;
  for (let i = 0; i < nodes.length - 1; i += 1) {
    if (timeSeconds <= nodes[i + 1]!.atSeconds) {
      idx = i;
      break;
    }
  }
  const a = nodes[idx]!;
  const b = nodes[idx + 1]!;
  const dt = Math.max(1e-6, b.atSeconds - a.atSeconds);
  const t = clamp((timeSeconds - a.atSeconds) / dt, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;

  const evalCh = (ch: PerformingChannelKey): number =>
    h00 * a.values[ch] + h10 * dt * a.tangent[ch] + h01 * b.values[ch] + h11 * dt * b.tangent[ch];

  return {
    x: evalCh("x"),
    y: evalCh("y"),
    scale: Math.max(0.01, evalCh("scale")),
    rotationDeg: evalCh("rotationDeg"),
    opacity: clamp(evalCh("opacity"), 0, 1),
  };
}

function normalizedTransformError(
  a: MotionTransformValues,
  b: MotionTransformValues,
  tol: PerformingRdpTolerances,
): number {
  const dx = (a.x - b.x) / Math.max(1e-4, tol.scaleX);
  const dy = (a.y - b.y) / Math.max(1e-4, tol.scaleY);
  const ds = (a.scale - b.scale) / Math.max(1e-4, tol.scaleZoom);
  const dr = (a.rotationDeg - b.rotationDeg) / Math.max(1e-4, tol.scaleRotationDeg);
  const doVal = (a.opacity - b.opacity) / Math.max(1e-4, tol.scaleOpacity);
  return Math.sqrt(dx * dx + dy * dy + ds * ds + dr * dr + doVal * doVal);
}

/** 원시 샘플 시퀀스를 RDP + 에르미트(오차 정제 포함) + MotionKeyframe 트랙으로 컴파일한다. */
export function compilePerformingSamplesToTrack(
  trackId: string,
  samples: readonly RawPerformingSample[],
  options: {
    readonly sampleRateHz?: number;
    readonly tolerances?: Partial<PerformingRdpTolerances>;
  } = {},
): PerformingRecordedTrack {
  const sorted = [...samples].sort((a, b) => a.timeSeconds - b.timeSeconds);
  const tol: PerformingRdpTolerances = { ...DEFAULT_PERFORMING_RDP_TOLERANCES, ...options.tolerances };
  let controlPoints: RawPerformingSample[] = [...simplifyPerformingTrackRdp(sorted, tol)];
  let hermiteNodes = fitCubicHermiteKeyframes(controlPoints);

  // 급격한 속도 변화(정지 코너 등)에서 C1 에르미트 곡선이 원시 궤적에서 이탈하면 최대 오차 구간을 정제(최대 2패스)
  for (let round = 0; round < 2 && sorted.length > controlPoints.length; round += 1) {
    const insertions: RawPerformingSample[] = [];
    for (let seg = 0; seg < controlPoints.length - 1; seg += 1) {
      const tStart = controlPoints[seg]!.timeSeconds;
      const tEnd = controlPoints[seg + 1]!.timeSeconds;
      let worstErr = tol.epsilon;
      let worstSample: RawPerformingSample | null = null;
      for (const s of sorted) {
        if (s.timeSeconds <= tStart + 1e-6 || s.timeSeconds >= tEnd - 1e-6) continue;
        const evalVal = sampleHermitePerformingTrack(hermiteNodes, s.timeSeconds);
        const err = normalizedTransformError(s.values, evalVal, tol);
        if (err > worstErr) {
          worstErr = err;
          worstSample = s;
        }
      }
      if (worstSample) insertions.push(worstSample);
    }
    if (insertions.length === 0) break;
    controlPoints = [...controlPoints, ...insertions].sort((a, b) => a.timeSeconds - b.timeSeconds);
    hermiteNodes = fitCubicHermiteKeyframes(controlPoints);
  }

  const motionKeyframes: MotionKeyframe[] = hermiteNodes.map((node) => ({
    atSeconds: node.atSeconds,
    easing: node.easingToNext,
    values: node.values,
  }));
  const durationSeconds = sorted.length > 0 ? sorted[sorted.length - 1]!.timeSeconds : 0;

  return {
    trackId,
    sampleRateHz: options.sampleRateHz ?? 60,
    rawSampleCount: sorted.length,
    durationSeconds,
    hermiteNodes,
    motionKeyframes,
  };
}

export interface OverdubPerformingOptions {
  /** 덮어쓸 대상 채널 목록(선택하지 않은 채널은 기존 트랙을 100% 보존). */
  readonly channels: readonly PerformingChannelKey[];
  /** 오버더빙 경계 부드러운 크로스페이드 시간(초, 기본 0.1초). */
  readonly blendWindowSeconds?: number;
  readonly tolerances?: Partial<PerformingRdpTolerances>;
}

/**
 * 비파괴 채널 오버더빙:
 * 기존 트랙의 미선택 채널을 그대로 유지한 채, 새 라이브 퍼포밍 패스의 선택 채널만
 * 경계 크로스페이드로 자연스럽게 합성한 새 `PerformingRecordedTrack`을 반환한다.
 */
export function overdubPerformingTrack(
  baseTrack: PerformingRecordedTrack,
  overdubSamples: readonly RawPerformingSample[],
  options: OverdubPerformingOptions,
): PerformingRecordedTrack {
  if (overdubSamples.length === 0 || options.channels.length === 0) return baseTrack;
  const sortedOverdub = [...overdubSamples].sort((a, b) => a.timeSeconds - b.timeSeconds);
  const punchIn = sortedOverdub[0]!.timeSeconds;
  const punchOut = sortedOverdub[sortedOverdub.length - 1]!.timeSeconds;
  const blend = Math.max(0, options.blendWindowSeconds ?? 0.1);
  const targetChannels = new Set<PerformingChannelKey>(options.channels);

  const overdubNodes = fitCubicHermiteKeyframes(sortedOverdub);
  const totalDuration = Math.max(baseTrack.durationSeconds, punchOut);
  const dt = 1 / Math.max(15, baseTrack.sampleRateHz);
  const mergedSamples: RawPerformingSample[] = [];

  for (let t = 0; t <= totalDuration + 1e-6; t += dt) {
    const clampedT = Math.min(totalDuration, Number(t.toFixed(6)));
    const baseVal = sampleHermitePerformingTrack(baseTrack.hermiteNodes, clampedT);
    if (clampedT < punchIn || clampedT > punchOut) {
      mergedSamples.push({ timeSeconds: clampedT, values: baseVal });
      continue;
    }
    const overVal = sampleHermitePerformingTrack(overdubNodes, clampedT);
    let weight = 1;
    if (blend > 1e-4) {
      const inW = clamp((clampedT - punchIn) / blend, 0, 1);
      const outW = clamp((punchOut - clampedT) / blend, 0, 1);
      weight = Math.min(inW, outW);
    }
    const merged: MotionTransformValues = {
      x: targetChannels.has("x") ? lerp(baseVal.x, overVal.x, weight) : baseVal.x,
      y: targetChannels.has("y") ? lerp(baseVal.y, overVal.y, weight) : baseVal.y,
      scale: targetChannels.has("scale") ? lerp(baseVal.scale, overVal.scale, weight) : baseVal.scale,
      rotationDeg: targetChannels.has("rotationDeg")
        ? lerp(baseVal.rotationDeg, overVal.rotationDeg, weight)
        : baseVal.rotationDeg,
      opacity: targetChannels.has("opacity")
        ? clamp(lerp(baseVal.opacity, overVal.opacity, weight), 0, 1)
        : baseVal.opacity,
    };
    mergedSamples.push({ timeSeconds: clampedT, values: merged });
  }

  return compilePerformingSamplesToTrack(baseTrack.trackId, mergedSamples, {
    sampleRateHz: baseTrack.sampleRateHz,
    tolerances: options.tolerances,
  });
}
