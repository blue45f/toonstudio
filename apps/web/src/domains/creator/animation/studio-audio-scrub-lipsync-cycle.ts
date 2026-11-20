/**
 * RoughAnimator / Toon Boom Harmony / OpenToonz 클린룸 프레임 오디오 스크럽 립싱크(Viseme) &
 * 비파괴 노출 사이클 루프 엔진.
 *
 * 구성:
 * 1. 마이크로 슬라이스 오디오 스크러버(`extractAudioScrubGranule`, `AudioScrubPlayer`):
 *    프레임 시작점에서 `max(45ms, 1000/fps)` 길이의 Hann-windowed 그래뉼을 추출·재생
 * 2. 로컬 DSP 자동 립싱크 분석기(`analyzeAudioVisemeTrack`):
 *    프레임별 RMS 에너지·제로크로싱(ZCR)·Goertzel 저/중/고 대역 에너지·스펙트럼 중심으로
 *    Preston Blair 표준 9종 입모양(`rest, A, E, I, O, U, MBP, FV, L`) 키프레임 초안 생성
 * 3. 비파괴 노출 사이클 루프(`ExposureCycleSpan`, `resolveExposureTrackWithCycles`):
 *    원본 구간 `startFrame..endFrame`을 모듈로/핑퐁 인덱싱으로 반복 투영(원본 1장 수정 시 전체 즉시 반영)
 * 4. XDTS v5 호환 평탄화(`flattenExposureCyclesToXdts`): 기존 `studio-xdts-timesheet.ts` 계약 직결
 */

import {
  resolveXdtsCellExposures,
  XDTS_SUPPORTED_VERSION,
  XDTS_SYMBOLS,
  type StudioXdtsDocument,
  type XdtsField,
  type XdtsHeaderInfo,
  type XdtsTimeTableHeader,
  type XdtsTrackFrameEntry,
} from "./studio-xdts-timesheet";

export const PRESTON_BLAIR_VISEMES = [
  "rest",
  "A",
  "E",
  "I",
  "O",
  "U",
  "MBP",
  "FV",
  "L",
] as const;

export type VisemeId = (typeof PRESTON_BLAIR_VISEMES)[number];

export interface VisemeDescriptor {
  readonly id: VisemeId;
  readonly labelKo: string;
  readonly jawOpen01: number;
  readonly lipRound01: number;
}

export const VISEME_CATALOG: Readonly<Record<VisemeId, VisemeDescriptor>> = Object.freeze({
  rest: Object.freeze({ id: "rest", labelKo: "무음(닫힘)", jawOpen01: 0, lipRound01: 0 }),
  A: Object.freeze({ id: "A", labelKo: "아(크게 열림)", jawOpen01: 0.95, lipRound01: 0.2 }),
  E: Object.freeze({ id: "E", labelKo: "에(가로 벌림)", jawOpen01: 0.55, lipRound01: 0.1 }),
  I: Object.freeze({ id: "I", labelKo: "이(좁게 벌림)", jawOpen01: 0.35, lipRound01: 0.05 }),
  O: Object.freeze({ id: "O", labelKo: "오(둥글게 열림)", jawOpen01: 0.72, lipRound01: 0.85 }),
  U: Object.freeze({ id: "U", labelKo: "우(오므림)", jawOpen01: 0.32, lipRound01: 0.95 }),
  MBP: Object.freeze({ id: "MBP", labelKo: "ㅁ/ㅂ/ㅍ(입술 맞닿음)", jawOpen01: 0.05, lipRound01: 0.15 }),
  FV: Object.freeze({ id: "FV", labelKo: "치찰/마찰(F/V/S)", jawOpen01: 0.2, lipRound01: 0.1 }),
  L: Object.freeze({ id: "L", labelKo: "ㄹ/ㄴ(혀끝 올림)", jawOpen01: 0.42, lipRound01: 0.2 }),
});

export interface AudioScrubGranule {
  readonly frameIndex: number;
  readonly startSeconds: number;
  readonly durationMs: number;
  readonly sampleRate: number;
  readonly samples: Float32Array;
}

export interface AudioScrubGranuleOptions {
  /** 최소 그래뉼 길이(ms, RoughAnimator 기준 기본 45ms). */
  readonly minSliceMs?: number;
  /** 출력 게인(`0..2`, 기본 1.0). */
  readonly gain?: number;
}

/**
 * 지정 프레임 시작점에서 `max(45ms, 1000/fps)` 길이의 Hann-windowed 오디오 그래뉼을 추출한다.
 */
export function extractAudioScrubGranule(
  pcmSamples: Float32Array,
  sampleRate: number,
  frameIndex: number,
  fps: number,
  options: AudioScrubGranuleOptions = {},
): AudioScrubGranule {
  const safeRate = Math.max(8000, Math.round(sampleRate));
  const safeFps = Math.max(1, Math.min(120, fps));
  const safeFrame = Math.max(0, Math.floor(frameIndex));
  const minSliceMs = Math.max(10, options.minSliceMs ?? 45);
  const gain = clamp(options.gain ?? 1, 0, 2);

  const durationMs = Math.max(minSliceMs, 1000 / safeFps);
  const sampleCount = Math.max(2, Math.round((durationMs / 1000) * safeRate));
  const startSeconds = safeFrame / safeFps;
  const startIdx = Math.round(startSeconds * safeRate);

  const out = new Float32Array(sampleCount);
  const denom = Math.max(1, sampleCount - 1);
  for (let i = 0; i < sampleCount; i += 1) {
    const srcIdx = startIdx + i;
    const raw = srcIdx >= 0 && srcIdx < pcmSamples.length ? (pcmSamples[srcIdx] ?? 0) : 0;
    const hann = 0.5 * (1 - Math.cos((2 * Math.PI * i) / denom));
    out[i] = raw * hann * gain;
  }

  return {
    frameIndex: safeFrame,
    startSeconds,
    durationMs,
    sampleRate: safeRate,
    samples: out,
  };
}

export interface AudioScrubSink {
  playGranule(granule: AudioScrubGranule): void;
  stop?(): void;
}

/**
 * 플레이헤드 프레임 드래그 시 클릭 잡음 없이 마이크로 오디오 슬라이스를 재생하는 스크럽 컨트롤러.
 */
export class AudioScrubPlayer {
  private readonly pcmSamples: Float32Array;
  private readonly sampleRate: number;
  private readonly fps: number;
  private readonly sink: AudioScrubSink;
  private readonly minSliceMs: number;
  private gain: number;
  private muted = false;
  private lastScrubbedFrame = -1;

  constructor(options: {
    readonly pcmSamples: Float32Array;
    readonly sampleRate: number;
    readonly fps: number;
    readonly sink: AudioScrubSink;
    readonly minSliceMs?: number;
    readonly gain?: number;
  }) {
    this.pcmSamples = options.pcmSamples;
    this.sampleRate = Math.max(8000, Math.round(options.sampleRate));
    this.fps = Math.max(1, Math.min(120, options.fps));
    this.sink = options.sink;
    this.minSliceMs = Math.max(10, options.minSliceMs ?? 45);
    this.gain = clamp(options.gain ?? 1, 0, 2);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) this.sink.stop?.();
  }

  setGain(gain: number): void {
    this.gain = clamp(gain, 0, 2);
  }

  /** 플레이헤드가 새 프레임에 도달했을 때 해당 프레임 오디오 그래뉼을 재생한다. */
  scrubToFrame(frameIndex: number, forceReplay = false): AudioScrubGranule | null {
    const frame = Math.max(0, Math.floor(frameIndex));
    if (this.muted) return null;
    if (!forceReplay && frame === this.lastScrubbedFrame) return null;
    this.lastScrubbedFrame = frame;
    const granule = extractAudioScrubGranule(this.pcmSamples, this.sampleRate, frame, this.fps, {
      minSliceMs: this.minSliceMs,
      gain: this.gain,
    });
    this.sink.playGranule(granule);
    return granule;
  }

  stop(): void {
    this.lastScrubbedFrame = -1;
    this.sink.stop?.();
  }
}

export interface VisemeFrameAnalysis {
  readonly frameIndex: number;
  readonly rms: number;
  readonly zeroCrossingRate: number;
  readonly spectralCentroidHz: number;
  readonly viseme: VisemeId;
  readonly confidence: number;
}

export interface VisemeKeyframe {
  readonly frameIndex: number;
  readonly viseme: VisemeId;
  readonly confidence: number;
}

export interface AnalyzeAudioVisemeOptions {
  readonly fps: number;
  readonly sampleRate: number;
  /** 무음 게이트 RMS 임계값(기본 0.025). */
  readonly silenceRmsThreshold?: number;
  /** 비젬 깜빡임 억제 최소 유지 프레임(기본 1). */
  readonly minHoldFrames?: number;
}

export interface AnalyzedVisemeTrack {
  readonly fps: number;
  readonly frameCount: number;
  readonly frames: readonly VisemeFrameAnalysis[];
  readonly keyframes: readonly VisemeKeyframe[];
}

function clamp(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return v < min ? min : v > max ? max : v;
}

/** Goertzel 단일 주파수 에너지 추정기(경량 O(N), 외부 FFT 의존성 없음). */
function goertzelEnergy(
  samples: Float32Array,
  start: number,
  length: number,
  sampleRate: number,
  targetHz: number,
): number {
  if (length <= 0 || targetHz <= 0 || targetHz >= sampleRate * 0.5) return 0;
  const omega = (2 * Math.PI * targetHz) / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let q1 = 0;
  let q2 = 0;
  for (let i = 0; i < length; i += 1) {
    const s = samples[start + i] ?? 0;
    const q0 = coeff * q1 - q2 + s;
    q2 = q1;
    q1 = q0;
  }
  const power = q1 * q1 + q2 * q2 - coeff * q1 * q2;
  return Math.max(0, power) / Math.max(1, length * length);
}

const PROBE_FREQUENCIES_HZ = [
  220, 380, 560, 820, 1200, 1750, 2400, 3400, 4800,
] as const;

/**
 * 로컬 PCM 오디오에서 프레임별 RMS · ZCR · Goertzel 대역 스펙트럼 중심을 계산해
 * Preston Blair 9종 입모양(`rest, A, E, I, O, U, MBP, FV, L`) 키프레임 초안을 생성한다.
 */
export function analyzeAudioVisemeTrack(
  pcmSamples: Float32Array,
  options: AnalyzeAudioVisemeOptions,
): AnalyzedVisemeTrack {
  const fps = clamp(options.fps, 1, 120);
  const sampleRate = Math.max(8000, Math.round(options.sampleRate));
  const silenceThreshold = clamp(options.silenceRmsThreshold ?? 0.025, 0.001, 0.5);
  const minHoldFrames = Math.max(1, Math.min(6, Math.round(options.minHoldFrames ?? 1)));

  const exactSamplesPerFrame = sampleRate / fps;
  const frameCount = Math.max(1, Math.ceil((pcmSamples.length * fps) / sampleRate - 1e-6));

  const rawFrames: Array<{
    frameIndex: number;
    rms: number;
    zcr: number;
    centroidHz: number;
    lowRatio: number;
    midRatio: number;
    highRatio: number;
  }> = [];

  for (let f = 0; f < frameCount; f += 1) {
    const start = Math.round(f * exactSamplesPerFrame);
    const end = Math.min(pcmSamples.length, Math.round((f + 1) * exactSamplesPerFrame));
    const len = Math.max(0, end - start);
    if (len === 0) {
      rawFrames.push({
        frameIndex: f,
        rms: 0,
        zcr: 0,
        centroidHz: 0,
        lowRatio: 0,
        midRatio: 0,
        highRatio: 0,
      });
      continue;
    }

    let sumSq = 0;
    let crossings = 0;
    let prev = pcmSamples[start] ?? 0;
    for (let i = 0; i < len; i += 1) {
      const s = pcmSamples[start + i] ?? 0;
      sumSq += s * s;
      if (i > 0 && ((s >= 0 && prev < 0) || (s < 0 && prev >= 0))) {
        crossings += 1;
      }
      prev = s;
    }
    const rms = Math.sqrt(sumSq / len);
    const zcr = crossings / Math.max(1, len - 1);

    let lowE = 0;
    let midE = 0;
    let highE = 0;
    let weightedFreqSum = 0;
    let totalE = 0;
    for (const hz of PROBE_FREQUENCIES_HZ) {
      if (hz >= sampleRate * 0.48) continue;
      const e = goertzelEnergy(pcmSamples, start, len, sampleRate, hz);
      totalE += e;
      weightedFreqSum += hz * e;
      if (hz <= 650) lowE += e;
      else if (hz <= 2100) midE += e;
      else highE += e;
    }

    const denomE = totalE > 1e-12 ? totalE : 1;
    rawFrames.push({
      frameIndex: f,
      rms,
      zcr,
      centroidHz: totalE > 1e-12 ? weightedFreqSum / totalE : 0,
      lowRatio: lowE / denomE,
      midRatio: midE / denomE,
      highRatio: highE / denomE,
    });
  }

  const classified: VisemeFrameAnalysis[] = rawFrames.map((rf, idx) => {
    const prevRms = rawFrames[idx - 1]?.rms ?? 0;
    const nextRms = rawFrames[idx + 1]?.rms ?? 0;

    let viseme: VisemeId;
    let confidence: number;

    if (rf.rms < silenceThreshold) {
      // 바로 다음 프레임에 강한 폭발적 개구가 오면 양순 폐쇄음(M/B/P) 선행 조음으로 표시
      if (nextRms >= silenceThreshold * 3.5 && prevRms >= silenceThreshold * 0.8) {
        viseme = "MBP";
        confidence = 0.72;
      } else {
        viseme = "rest";
        confidence = 0.95;
      }
    } else if (rf.highRatio >= 0.42 || rf.zcr >= 0.24) {
      viseme = "FV";
      confidence = clamp(0.65 + rf.highRatio * 0.35, 0.6, 0.98);
    } else if (rf.rms >= silenceThreshold * 4.2 && rf.midRatio >= 0.22 && rf.centroidHz >= 650 && rf.centroidHz <= 1700) {
      viseme = "A";
      confidence = 0.88;
    } else if (rf.lowRatio >= 0.55) {
      if (rf.rms >= silenceThreshold * 2.8) {
        viseme = "O";
        confidence = 0.82;
      } else {
        viseme = "U";
        confidence = 0.8;
      }
    } else if (rf.centroidHz >= 1600) {
      viseme = rf.rms >= silenceThreshold * 2.5 ? "E" : "I";
      confidence = 0.8;
    } else {
      viseme = rf.rms >= silenceThreshold * 3.0 ? "A" : "L";
      confidence = 0.74;
    }

    return {
      frameIndex: rf.frameIndex,
      rms: rf.rms,
      zeroCrossingRate: rf.zcr,
      spectralCentroidHz: rf.centroidHz,
      viseme,
      confidence,
    };
  });

  // 1프레임 스파이크 제거(최소 유지 프레임 스무딩)
  const smoothed: VisemeFrameAnalysis[] = classified.map((item) => ({ ...item }));
  if (minHoldFrames >= 2 && smoothed.length >= 3) {
    for (let i = 1; i < smoothed.length - 1; i += 1) {
      const prev = smoothed[i - 1];
      const cur = smoothed[i];
      const next = smoothed[i + 1];
      if (prev && cur && next && prev.viseme === next.viseme && cur.viseme !== prev.viseme) {
        smoothed[i] = { ...cur, viseme: prev.viseme };
      }
    }
  }

  const keyframes: VisemeKeyframe[] = [];
  for (const frame of smoothed) {
    const lastKf = keyframes[keyframes.length - 1];
    if (!lastKf || lastKf.viseme !== frame.viseme) {
      keyframes.push({
        frameIndex: frame.frameIndex,
        viseme: frame.viseme,
        confidence: frame.confidence,
      });
    }
  }

  return { fps, frameCount, frames: smoothed, keyframes };
}

/** 비젬 키프레임을 `DrawingSubstitutionBank`의 입 파츠 치환 키프레임으로 바인딩한다. */
export function bindVisemesToMouthSubstitutions(
  keyframes: readonly VisemeKeyframe[],
  visemeToSubstitutionId: Readonly<Partial<Record<VisemeId, string>>>,
  fallbackSubstitutionId = "mouth_rest",
): readonly { readonly frame: number; readonly substitutionId: string; readonly viseme: VisemeId }[] {
  return keyframes.map((kf) => ({
    frame: kf.frameIndex,
    substitutionId: visemeToSubstitutionId[kf.viseme] ?? fallbackSubstitutionId,
    viseme: kf.viseme,
  }));
}

export type ExposureCycleMode = "repeat-count" | "loop-until";
export type ExposureCycleKind = "loop" | "ping-pong";

export interface ExposureCycleSpan {
  readonly id: string;
  /** 원본 노출 구간 시작 프레임(0-based inclusive). */
  readonly sourceStartFrame: number;
  /** 원본 노출 구간 끝 프레임(0-based inclusive). */
  readonly sourceEndFrame: number;
  readonly mode: ExposureCycleMode;
  /** `mode === "repeat-count"`일 때 총 반복 횟수(원본 포함: 2면 원본 1회 + 복제 1회). */
  readonly repeatCount?: number;
  /** `mode === "loop-until"`일 때 반복이 투영될 마지막 프레임(inclusive). */
  readonly loopUntilFrame?: number;
  readonly cycleKind?: ExposureCycleKind;
}

export interface ResolvedExposureFrame {
  readonly frameIndex: number;
  readonly celId: string | null;
  readonly sourceFrameIndex: number;
  readonly projectedFromCycleId: string | null;
}

/**
 * 비파괴 노출 사이클 루프 평가기:
 * 원본 `baseCelByFrame`을 복제하지 않고, `ExposureCycleSpan`의 모듈로/핑퐁 인덱싱으로
 * 매 프레임의 실제 표시 셀을 계산한다. 원본 프레임 1장만 고치면 모든 반복 구간이 즉시 갱신된다.
 */
export function resolveExposureTrackWithCycles(options: {
  readonly totalFrames: number;
  readonly baseCelByFrame: ReadonlyMap<number, string | null>;
  readonly cycles: readonly ExposureCycleSpan[];
}): readonly ResolvedExposureFrame[] {
  const totalFrames = Math.max(1, Math.floor(options.totalFrames));

  const readBaseCel = (frame: number): string | null => {
    if (options.baseCelByFrame.has(frame)) {
      return options.baseCelByFrame.get(frame) ?? null;
    }
    // held-until-next: 해당 프레임 이전의 가장 최근 키프레임 셀 유지
    let bestFrame = -1;
    let bestCel: string | null = null;
    for (const [f, cel] of options.baseCelByFrame.entries()) {
      if (f <= frame && f > bestFrame) {
        bestFrame = f;
        bestCel = cel;
      }
    }
    return bestCel;
  };

  const results: ResolvedExposureFrame[] = [];
  for (let frame = 0; frame < totalFrames; frame += 1) {
    let resolvedSource = frame;
    let cycleId: string | null = null;

    for (const cycle of options.cycles) {
      const srcStart = Math.max(0, Math.floor(cycle.sourceStartFrame));
      const srcEnd = Math.max(srcStart, Math.floor(cycle.sourceEndFrame));
      const spanLen = srcEnd - srcStart + 1;
      const cycleStart = srcEnd + 1;
      const cycleEnd =
        cycle.mode === "repeat-count"
          ? srcStart + spanLen * Math.max(1, Math.floor(cycle.repeatCount ?? 1)) - 1
          : Math.min(totalFrames - 1, Math.floor(cycle.loopUntilFrame ?? totalFrames - 1));

      if (frame >= cycleStart && frame <= cycleEnd) {
        const offset = frame - srcStart;
        if (cycle.cycleKind === "ping-pong" && spanLen > 1) {
          const period = (spanLen - 1) * 2;
          const phase = offset % period;
          const localIdx = phase < spanLen ? phase : period - phase;
          resolvedSource = srcStart + localIdx;
        } else {
          resolvedSource = srcStart + (offset % spanLen);
        }
        cycleId = cycle.id;
      }
    }

    results.push({
      frameIndex: frame,
      celId: readBaseCel(resolvedSource),
      sourceFrameIndex: resolvedSource,
      projectedFromCycleId: cycleId,
    });
  }

  return results;
}

/**
 * 비파괴 노출 사이클이 적용된 트랙을 표준 XDTS v5 문서로 평탄화 변환한다.
 */
export function flattenExposureCyclesToXdts(options: {
  readonly trackName: string;
  readonly totalFrames: number;
  readonly baseCelByFrame: ReadonlyMap<number, string | null>;
  readonly cycles: readonly ExposureCycleSpan[];
  readonly header?: XdtsHeaderInfo;
  readonly timeTableName?: string;
}): StudioXdtsDocument {
  const resolved = resolveExposureTrackWithCycles({
    totalFrames: options.totalFrames,
    baseCelByFrame: options.baseCelByFrame,
    cycles: options.cycles,
  });

  const frames: XdtsTrackFrameEntry[] = [];
  let prevCel: string | null | undefined = undefined;
  for (const item of resolved) {
    if (item.celId === null) {
      if (prevCel !== null) {
        frames.push({ frame: item.frameIndex, data: [{ id: 0, values: [XDTS_SYMBOLS.nullCell] }] });
      }
    } else if (item.celId === prevCel) {
      frames.push({ frame: item.frameIndex, data: [{ id: 0, values: [XDTS_SYMBOLS.hyphen] }] });
    } else {
      frames.push({ frame: item.frameIndex, data: [{ id: 0, values: [item.celId] }] });
    }
    prevCel = item.celId;
  }

  const track = { trackNo: 0, frames };
  const fields: XdtsField[] = [{ fieldId: 0, tracks: [track] }];
  const timeTableHeaders: XdtsTimeTableHeader[] = [{ fieldId: 0, names: [options.trackName] }];
  const resolvedCellExposures = resolveXdtsCellExposures(track, options.trackName, resolved.length);

  return {
    version: XDTS_SUPPORTED_VERSION,
    ...(options.header ? { header: options.header } : {}),
    timeTables: [
      {
        name: options.timeTableName ?? "노출 사이클 타임시트",
        duration: resolved.length,
        timeTableHeaders,
        fields,
        resolvedCellExposures,
      },
    ],
  };
}
