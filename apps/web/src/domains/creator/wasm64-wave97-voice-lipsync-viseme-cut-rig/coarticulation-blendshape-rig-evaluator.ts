/**
 * Wave 97: Cohen-Massaro 지배 함수 조음 결합(coarticulation) 기반 60fps 표정 쉐이프키 리그 평가기.
 *
 * - 12종 만화 비즘과 로컬 PCM 운율(RMS·F0)을 결합해 60fps(`16.6667ms`) 표정 쉐이프키 타임라인을 생성한다.
 * - 양순음(`M_B_P`: ㅁ·ㅂ·ㅍ·m·b·p) 폐쇄 지배 원칙을 강제해 빠른 대사에서도 입술 닫힘(`jawOpen <= 0.05`,
 *   `lipSeal >= 0.85`)을 보장하면서 인접 모음은 매끄럽게 조음 결합한다.
 * - 운율 강세(피치 상승·음량 피크)로 눈썹·눈웃음을 연동하고 `2.8~4.8초` 간격의 생리적 눈 깜박임
 *   (`shock` 감정에서는 억제) 및 `prefersReducedMotion: true` 전정 안전 계약을 적용한다.
 */

import {
  LOCAL_VOICE_PRIVACY_CONTRACT,
  type AlignedVisemeSpan,
  type ComicVisemeId,
  type ForcedVisemeAlignmentResult,
  type LocalVoicePrivacyContract,
  type VoiceAudioProsodyAnalysis,
  type VoiceProsodyFrame,
} from "./korean-phoneme-audio-viseme-aligner";

export type FacialEmotionTag = "neutral" | "joy" | "anger" | "sadness" | "shock";

export interface FacialRigEvaluationOptions {
  readonly fps?: number;
  readonly emotion?: FacialEmotionTag;
  readonly emotionIntensity?: number;
  readonly prefersReducedMotion?: boolean;
  readonly blinkSeed?: number;
  readonly headNodAmplitudeDeg?: number;
  readonly breathAmplitudePx?: number;
  readonly maxReducedMotionLipStepsPerSec?: number;
}

export interface FacialBlendshapePose {
  readonly jawOpen: number;
  readonly lipSeal: number;
  readonly lipRound: number;
  readonly lipSpread: number;
  readonly cheekPuff: number;
  readonly browRaise: number;
  readonly browFurrow: number;
  readonly eyeBlinkLeft: number;
  readonly eyeBlinkRight: number;
  readonly eyeSquint: number;
  readonly breathChestOffsetPx: number;
  readonly headNodDeg: number;
}

export interface FacialRigFrame {
  readonly frameIndex: number;
  readonly timeMs: number;
  readonly activeViseme: ComicVisemeId;
  readonly activeGrapheme: string;
  readonly rmsEnergy: number;
  readonly f0Hz: number;
  readonly voiced: boolean;
  readonly pose: FacialBlendshapePose;
}

export interface BlinkEvent {
  readonly index: number;
  readonly startMs: number;
  readonly peakTimeMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

export interface BilabialClosureCheck {
  readonly spanIndex: number;
  readonly grapheme: string;
  readonly jamoLabel: string;
  readonly peakTimeMs: number;
  readonly minJawOpen: number;
  readonly maxLipSeal: number;
  readonly passed: boolean;
}

export interface BilabialClosureAudit {
  readonly totalBilabials: number;
  readonly closedCount: number;
  readonly hitRate: number;
  readonly checks: readonly BilabialClosureCheck[];
}

export interface FacialRigTimelineMetrics {
  readonly maxJawDeltaPerFrame: number;
  readonly maxVowelTransitionJawDeltaPerFrame: number;
  readonly lipStepTransitionsPerSec: number;
  readonly maxAudioAlignmentDriftMs: number;
  readonly peakJawOpen: number;
  readonly peakBrowRaise: number;
  readonly maxAbsHeadNodDeg: number;
  readonly maxAbsBreathOffsetPx: number;
}

export interface FacialRigTimeline {
  readonly dialogueText: string;
  readonly fps: number;
  readonly frameStepMs: number;
  readonly durationMs: number;
  readonly emotion: FacialEmotionTag;
  readonly emotionIntensity: number;
  readonly prefersReducedMotion: boolean;
  readonly frames: readonly FacialRigFrame[];
  readonly alignment: ForcedVisemeAlignmentResult;
  readonly prosody: VoiceAudioProsodyAnalysis;
  readonly blinkEvents: readonly BlinkEvent[];
  readonly bilabialAudit: BilabialClosureAudit;
  readonly metrics: FacialRigTimelineMetrics;
  readonly privacy: LocalVoicePrivacyContract;
}

interface MouthArticulatorTarget {
  readonly jawOpen: number;
  readonly lipSeal: number;
  readonly lipRound: number;
  readonly lipSpread: number;
  readonly cheekPuff: number;
  readonly dominanceJaw: number;
  readonly dominanceLips: number;
  readonly preSigmaMs: number;
  readonly postSigmaMs: number;
  readonly loudnessResponsive: boolean;
}

function targetSpec(
  jawOpen: number,
  lipSeal: number,
  lipRound: number,
  lipSpread: number,
  cheekPuff: number,
  dominanceJaw: number,
  dominanceLips: number,
  preSigmaMs: number,
  postSigmaMs: number,
  loudnessResponsive: boolean,
): MouthArticulatorTarget {
  return { jawOpen, lipSeal, lipRound, lipSpread, cheekPuff, dominanceJaw, dominanceLips, preSigmaMs, postSigmaMs, loudnessResponsive };
}

const VISEME_TARGETS: Readonly<Record<ComicVisemeId, MouthArticulatorTarget>> = {
  SIL: targetSpec(0, 0.25, 0, 0, 0, 1.8, 1.5, 58, 58, false),
  A: targetSpec(0.84, 0, 0.08, 0.24, 0, 2.2, 1.9, 68, 74, true),
  E: targetSpec(0.48, 0, 0.06, 0.42, 0, 2.0, 1.8, 66, 72, true),
  I: targetSpec(0.28, 0, 0.02, 0.8, 0, 2.0, 2.2, 66, 72, true),
  O: targetSpec(0.62, 0, 0.84, 0, 0.06, 2.1, 2.4, 68, 74, true),
  U: targetSpec(0.34, 0.04, 0.94, 0, 0.14, 2.0, 2.5, 66, 72, true),
  W_OO: targetSpec(0.28, 0.08, 0.96, 0, 0.16, 2.0, 2.6, 56, 62, true),
  M_B_P: targetSpec(0, 1, 0.04, 0, 0.22, 62, 68, 28, 28, false),
  F_V: targetSpec(0.12, 0.45, 0.04, 0.28, 0.06, 2.4, 2.8, 36, 38, false),
  L_N_T_D: targetSpec(0.26, 0.06, 0.06, 0.26, 0, 1.7, 1.7, 36, 38, false),
  S_Z_CH: targetSpec(0.16, 0.08, 0.16, 0.56, 0, 2.3, 2.4, 38, 40, false),
  K_G: targetSpec(0.34, 0.02, 0.1, 0.18, 0.04, 1.6, 1.6, 36, 38, false),
};

interface EmotionBias {
  readonly browRaise: number;
  readonly browFurrow: number;
  readonly eyeSquint: number;
  readonly lipSpread: number;
  readonly cheekPuff: number;
  readonly vowelJawScale: number;
}

const EMOTION_BIASES: Readonly<Record<FacialEmotionTag, EmotionBias>> = {
  neutral: { browRaise: 0.04, browFurrow: 0, eyeSquint: 0, lipSpread: 0.04, cheekPuff: 0, vowelJawScale: 1 },
  joy: { browRaise: 0.16, browFurrow: 0, eyeSquint: 0.34, lipSpread: 0.32, cheekPuff: 0.1, vowelJawScale: 1.04 },
  anger: { browRaise: -0.06, browFurrow: 0.76, eyeSquint: 0.3, lipSpread: -0.06, cheekPuff: 0.08, vowelJawScale: 1.08 },
  sadness: { browRaise: 0.18, browFurrow: 0.36, eyeSquint: 0.12, lipSpread: -0.1, cheekPuff: 0, vowelJawScale: 0.86 },
  shock: { browRaise: 0.62, browFurrow: 0, eyeSquint: -0.2, lipSpread: -0.04, cheekPuff: 0.06, vowelJawScale: 1.12 },
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function createMulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sampleProsodyAtMs(frames: readonly VoiceProsodyFrame[], timeMs: number) {
  if (frames.length === 0) return { rmsEnergy: 0, f0Hz: 0, voiced: false };
  if (timeMs <= frames[0].timeMs) {
    return { rmsEnergy: frames[0].rmsEnergy, f0Hz: frames[0].f0Hz, voiced: frames[0].voiced };
  }
  const last = frames[frames.length - 1];
  if (timeMs >= last.timeMs) {
    return { rmsEnergy: last.rmsEnergy, f0Hz: last.f0Hz, voiced: last.voiced };
  }
  let lo = 0;
  let hi = frames.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].timeMs <= timeMs) lo = mid;
    else hi = mid;
  }
  const a = frames[lo];
  const b = frames[hi];
  const t = clamp((timeMs - a.timeMs) / Math.max(1e-6, b.timeMs - a.timeMs), 0, 1);
  const voiced = t < 0.5 ? a.voiced : b.voiced;
  const f0Hz = a.voiced && b.voiced ? a.f0Hz + (b.f0Hz - a.f0Hz) * t : voiced ? (t < 0.5 ? a.f0Hz : b.f0Hz) : 0;
  return { rmsEnergy: a.rmsEnergy + (b.rmsEnergy - a.rmsEnergy) * t, f0Hz, voiced };
}

function findActiveSpanAtMs(spans: readonly AlignedVisemeSpan[], timeMs: number): AlignedVisemeSpan | null {
  if (spans.length === 0) return null;
  for (let i = 0; i < spans.length; i += 1) {
    if (timeMs >= spans[i].startMs && timeMs <= spans[i].endMs) return spans[i];
  }
  return timeMs < spans[0].startMs ? spans[0] : spans[spans.length - 1];
}

function schedulePhysiologicalBlinks(
  durationMs: number,
  emotion: FacialEmotionTag,
  blinkSeed: number,
): readonly BlinkEvent[] {
  if (emotion === "shock" || durationMs < 2950) return [];
  const prng = createMulberry32(blinkSeed);
  const events: BlinkEvent[] = [];
  let cursorMs = 2800 + prng() * 1400;
  while (cursorMs + 110 < durationMs) {
    const startMs = Math.max(0, cursorMs - 54);
    const endMs = Math.min(durationMs, startMs + 166);
    events.push({ index: events.length, startMs, peakTimeMs: cursorMs, endMs, durationMs: endMs - startMs });
    cursorMs += 2800 + prng() * 2000;
  }
  return events;
}

function evaluateBlinkCurve(events: readonly BlinkEvent[], timeMs: number, eyeLagMs: number): number {
  let maxBlink = 0;
  const shifted = timeMs - eyeLagMs;
  for (let i = 0; i < events.length; i += 1) {
    const ev = events[i];
    if (shifted < ev.startMs || shifted > ev.endMs) continue;
    let value: number;
    if (shifted <= ev.peakTimeMs) {
      const u = clamp((shifted - ev.startMs) / Math.max(1, ev.peakTimeMs - ev.startMs), 0, 1);
      value = u * u;
    } else if (shifted <= ev.peakTimeMs + 16) {
      value = 1;
    } else {
      const openStart = ev.peakTimeMs + 16;
      const u = clamp((shifted - openStart) / Math.max(1, ev.endMs - openStart), 0, 1);
      value = (1 - u) * (1 - u);
    }
    if (value > maxBlink) maxBlink = value;
  }
  return clamp(maxBlink, 0, 1);
}

/**
 * Cohen-Massaro 지배 함수 조음 결합으로 특정 시각 `timeMs`의 입/턱 쉐이프키를 계산한다.
 * `D(t) = alpha * exp(-(|t - tau| / sigma)^1.5)` 커널로 모음 간 매끄러운 전환과 양순음 폐쇄 지배를 동시에 달성한다.
 */
function evaluateCohenMassaroMouthAtMs(
  spans: readonly AlignedVisemeSpan[],
  timeMs: number,
  frameStepMs: number,
  localRms: number,
) {
  let jawNum = 0;
  let jawDen = 0.08;
  let sealNum = 0.22 * 0.08;
  let roundNum = 0;
  let spreadNum = 0;
  let puffNum = 0;
  let lipDen = 0.08;

  for (let i = 0; i < spans.length; i += 1) {
    const span = spans[i];
    const dt = timeMs - span.centerMs;
    const absDt = Math.abs(dt);
    if (absDt > 380) continue;

    const spec = VISEME_TARGETS[span.viseme];
    const halfWidth = Math.max(10, span.durationMs * 0.5);
    const corePlateau = span.isBilabial ? Math.max(frameStepMs * 0.55, halfWidth * 0.42) : 0;
    const effectiveDist = Math.max(0, absDt - corePlateau);
    const sigmaMs = dt < 0 ? spec.preSigmaMs : spec.postSigmaMs;
    const kernel = Math.exp(-Math.pow(effectiveDist / sigmaMs, 1.5));

    const wJaw = spec.dominanceJaw * kernel;
    const wLip = spec.dominanceLips * kernel;

    let targetJaw = spec.jawOpen;
    if (spec.loudnessResponsive) {
      const loudness = Math.max(span.meanRms, localRms * 0.85);
      targetJaw = clamp(spec.jawOpen * (0.42 + 0.68 * clamp(loudness, 0, 1)), 0.08, 0.98);
    }

    jawNum += wJaw * targetJaw;
    jawDen += wJaw;
    sealNum += wLip * spec.lipSeal;
    roundNum += wLip * spec.lipRound;
    spreadNum += wLip * spec.lipSpread;
    puffNum += wLip * spec.cheekPuff;
    lipDen += wLip;
  }

  return {
    jawOpen: clamp(jawNum / jawDen, 0, 1),
    lipSeal: clamp(sealNum / lipDen, 0, 1),
    lipRound: clamp(roundNum / lipDen, 0, 1),
    lipSpread: clamp(spreadNum / lipDen, 0, 1),
    cheekPuff: clamp(puffNum / lipDen, 0, 1),
  };
}

function isVowelViseme(viseme: ComicVisemeId): boolean {
  return viseme === "A" || viseme === "E" || viseme === "I" || viseme === "O" || viseme === "U" || viseme === "W_OO";
}

/**
 * 강제 정렬된 비즘 타임라인과 로컬 PCM 운율을 결합해 60fps 표정 쉐이프키 타임라인을 생성한다.
 */
export function evaluateFacialRigTimelineAt60fps(
  alignment: ForcedVisemeAlignmentResult,
  prosody: VoiceAudioProsodyAnalysis,
  options: FacialRigEvaluationOptions = {},
): FacialRigTimeline {
  const fps = clamp(Math.round(options.fps ?? 60), 24, 120);
  const frameStepMs = 1000 / fps;
  const durationMs = Math.max(frameStepMs, alignment.durationMs, prosody.durationMs);
  const emotion: FacialEmotionTag = options.emotion ?? "neutral";
  const emotionIntensity = clamp(options.emotionIntensity ?? 0.75, 0, 1);
  const prefersReducedMotion = options.prefersReducedMotion === true;
  const headNodAmp = clamp(options.headNodAmplitudeDeg ?? 3.2, 0, 10);
  const breathAmp = clamp(options.breathAmplitudePx ?? 2.4, 0, 5);
  const maxReducedMotionSteps = clamp(options.maxReducedMotionLipStepsPerSec ?? 12, 2, 12);

  const frameCount = Math.max(1, Math.floor(durationMs / frameStepMs) + 1);
  const baselineF0 = prosody.baselineF0Hz > 75 ? prosody.baselineF0Hz : 180;
  const bias = EMOTION_BIASES[emotion];
  const blinkEvents = schedulePhysiologicalBlinks(durationMs, emotion, options.blinkSeed ?? 97);

  const rawRms = new Float32Array(frameCount);
  const rawPitch = new Float32Array(frameCount);
  const sampled: { readonly rmsEnergy: number; readonly f0Hz: number; readonly voiced: boolean }[] = [];
  for (let i = 0; i < frameCount; i += 1) {
    const p = sampleProsodyAtMs(prosody.frames, i * frameStepMs);
    sampled.push(p);
    rawRms[i] = p.rmsEnergy;
    rawPitch[i] = p.voiced && p.f0Hz > 0 ? clamp(12 * Math.log2(p.f0Hz / baselineF0), -6, 12) : 0;
  }

  const smoothRms = new Float32Array(frameCount);
  const smoothPitch = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i += 1) {
    let rSum = 0;
    let pSum = 0;
    const lo = Math.max(0, i - 2);
    const hi = Math.min(frameCount - 1, i + 2);
    for (let k = lo; k <= hi; k += 1) {
      rSum += rawRms[k];
      pSum += rawPitch[k];
    }
    const cnt = hi - lo + 1;
    smoothRms[i] = rSum / cnt;
    smoothPitch[i] = pSum / cnt;
  }

  const rawFrames: FacialRigFrame[] = [];
  for (let i = 0; i < frameCount; i += 1) {
    const timeMs = i * frameStepMs;
    const p = sampled[i];
    const span = findActiveSpanAtMs(alignment.spans, timeMs);
    const mouth = evaluateCohenMassaroMouthAtMs(alignment.spans, timeMs, frameStepMs, smoothRms[i]);

    const openGate = clamp(1 - mouth.lipSeal * 1.15, 0, 1);
    const jawOpen = clamp(mouth.jawOpen * (1 + (bias.vowelJawScale - 1) * emotionIntensity * openGate), 0, 1);
    const lipSpread = clamp(mouth.lipSpread + bias.lipSpread * emotionIntensity * openGate, 0, 1);
    const cheekPuff = clamp(mouth.cheekPuff + bias.cheekPuff * emotionIntensity, 0, 1);

    const posSemi = Math.max(0, smoothPitch[i]);
    const prosodyBrow = clamp((posSemi / 7.5) * 0.44 + smoothRms[i] * 0.2, 0, 0.58);
    const prosodySquint = clamp(smoothRms[i] * 0.24 + (posSemi / 10) * 0.14, 0, 0.38);

    const browRaise = clamp(prosodyBrow + bias.browRaise * emotionIntensity, 0, 1);
    const browFurrow = clamp(bias.browFurrow * emotionIntensity + (emotion === "anger" ? smoothRms[i] * 0.18 : 0), 0, 1);
    const eyeSquint = clamp(emotion === "shock" ? 0 : prosodySquint + bias.eyeSquint * emotionIntensity, 0, 1);
    const eyeBlinkLeft = evaluateBlinkCurve(blinkEvents, timeMs, 0);
    const eyeBlinkRight = evaluateBlinkCurve(blinkEvents, timeMs, prefersReducedMotion ? 0 : 2.5);

    const tSec = timeMs / 1000;
    const breathChestOffsetPx = prefersReducedMotion ? 0 : Number((breathAmp * Math.sin(2 * Math.PI * 0.24 * tSec)).toFixed(4));
    const headNodDeg = prefersReducedMotion
      ? 0
      : Number(clamp(headNodAmp * (smoothRms[i] * 0.55 * Math.sin(2 * Math.PI * 1.15 * tSec) + (posSemi / 9) * 0.55), -headNodAmp, headNodAmp).toFixed(4));

    rawFrames.push({
      frameIndex: i,
      timeMs: Number(timeMs.toFixed(3)),
      activeViseme: span ? span.viseme : "SIL",
      activeGrapheme: span ? span.grapheme : "",
      rmsEnergy: Number(p.rmsEnergy.toFixed(4)),
      f0Hz: Number(p.f0Hz.toFixed(2)),
      voiced: p.voiced,
      pose: {
        jawOpen: Number(jawOpen.toFixed(4)),
        lipSeal: Number(mouth.lipSeal.toFixed(4)),
        lipRound: Number(mouth.lipRound.toFixed(4)),
        lipSpread: Number(lipSpread.toFixed(4)),
        cheekPuff: Number(cheekPuff.toFixed(4)),
        browRaise: Number(browRaise.toFixed(4)),
        browFurrow: Number(browFurrow.toFixed(4)),
        eyeBlinkLeft: Number(eyeBlinkLeft.toFixed(4)),
        eyeBlinkRight: Number(eyeBlinkRight.toFixed(4)),
        eyeSquint: Number(eyeSquint.toFixed(4)),
        breathChestOffsetPx,
        headNodDeg,
      },
    });
  }

  let finalFrames: readonly FacialRigFrame[] = rawFrames;
  if (prefersReducedMotion && rawFrames.length > 1) {
    const holdFrames = Math.max(1, Math.ceil(fps / maxReducedMotionSteps) + 1);
    const quantized: FacialRigFrame[] = [];
    for (let start = 0; start < rawFrames.length; start += holdFrames) {
      const end = Math.min(rawFrames.length, start + holdFrames);
      let rep = rawFrames[start];
      for (let k = start; k < end; k += 1) {
        if (rawFrames[k].pose.lipSeal > rep.pose.lipSeal && rawFrames[k].pose.lipSeal >= 0.85) rep = rawFrames[k];
      }
      for (let k = start; k < end; k += 1) {
        const curr = rawFrames[k];
        quantized.push({
          ...curr,
          activeViseme: rep.activeViseme,
          pose: {
            ...curr.pose,
            jawOpen: rep.pose.jawOpen,
            lipSeal: rep.pose.lipSeal,
            lipRound: rep.pose.lipRound,
            lipSpread: rep.pose.lipSpread,
            cheekPuff: rep.pose.cheekPuff,
            breathChestOffsetPx: 0,
            headNodDeg: 0,
          },
        });
      }
    }
    finalFrames = quantized;
  }

  const bilabialChecks: BilabialClosureCheck[] = [];
  for (let i = 0; i < alignment.spans.length; i += 1) {
    const span = alignment.spans[i];
    if (!span.isBilabial) continue;
    const startIdx = clamp(Math.floor(span.startMs / frameStepMs), 0, finalFrames.length - 1);
    const endIdx = clamp(Math.ceil(span.endMs / frameStepMs), startIdx, finalFrames.length - 1);
    let minJaw = 1;
    let maxSeal = 0;
    for (let k = startIdx; k <= endIdx; k += 1) {
      if (finalFrames[k].pose.jawOpen < minJaw) minJaw = finalFrames[k].pose.jawOpen;
      if (finalFrames[k].pose.lipSeal > maxSeal) maxSeal = finalFrames[k].pose.lipSeal;
    }
    bilabialChecks.push({
      spanIndex: span.spanIndex,
      grapheme: span.grapheme,
      jamoLabel: span.jamoLabel,
      peakTimeMs: Number(span.centerMs.toFixed(2)),
      minJawOpen: Number(minJaw.toFixed(4)),
      maxLipSeal: Number(maxSeal.toFixed(4)),
      passed: minJaw <= 0.05 && maxSeal >= 0.85,
    });
  }

  const closedCount = bilabialChecks.filter((c) => c.passed).length;
  let maxJawDelta = 0;
  let maxVowelJawDelta = 0;
  let lipTransitions = 0;
  let peakJawOpen = 0;
  let peakBrowRaise = 0;
  let maxAbsNod = 0;
  let maxAbsBreath = 0;

  for (let i = 0; i < finalFrames.length; i += 1) {
    const curr = finalFrames[i];
    if (curr.pose.jawOpen > peakJawOpen) peakJawOpen = curr.pose.jawOpen;
    if (curr.pose.browRaise > peakBrowRaise) peakBrowRaise = curr.pose.browRaise;
    if (Math.abs(curr.pose.headNodDeg) > maxAbsNod) maxAbsNod = Math.abs(curr.pose.headNodDeg);
    if (Math.abs(curr.pose.breathChestOffsetPx) > maxAbsBreath) maxAbsBreath = Math.abs(curr.pose.breathChestOffsetPx);
    if (i > 0) {
      const prev = finalFrames[i - 1];
      const dJaw = Math.abs(curr.pose.jawOpen - prev.pose.jawOpen);
      if (dJaw > maxJawDelta) maxJawDelta = dJaw;
      if (isVowelViseme(prev.activeViseme) && isVowelViseme(curr.activeViseme) && dJaw > maxVowelJawDelta) {
        maxVowelJawDelta = dJaw;
      }
      if (
        dJaw > 1e-3 ||
        Math.abs(curr.pose.lipSeal - prev.pose.lipSeal) > 1e-3 ||
        Math.abs(curr.pose.lipRound - prev.pose.lipRound) > 1e-3 ||
        Math.abs(curr.pose.lipSpread - prev.pose.lipSpread) > 1e-3
      ) {
        lipTransitions += 1;
      }
    }
  }

  return {
    dialogueText: alignment.dialogueText,
    fps,
    frameStepMs: Number(frameStepMs.toFixed(4)),
    durationMs: Number(durationMs.toFixed(2)),
    emotion,
    emotionIntensity,
    prefersReducedMotion,
    frames: finalFrames,
    alignment,
    prosody,
    blinkEvents,
    bilabialAudit: {
      totalBilabials: bilabialChecks.length,
      closedCount,
      hitRate: bilabialChecks.length > 0 ? closedCount / bilabialChecks.length : 1,
      checks: bilabialChecks,
    },
    metrics: {
      maxJawDeltaPerFrame: Number(maxJawDelta.toFixed(4)),
      maxVowelTransitionJawDeltaPerFrame: Number(maxVowelJawDelta.toFixed(4)),
      lipStepTransitionsPerSec: Number((lipTransitions / Math.max(0.001, durationMs / 1000)).toFixed(2)),
      maxAudioAlignmentDriftMs: alignment.maxAudioAlignmentDriftMs,
      peakJawOpen: Number(peakJawOpen.toFixed(4)),
      peakBrowRaise: Number(peakBrowRaise.toFixed(4)),
      maxAbsHeadNodDeg: Number(maxAbsNod.toFixed(4)),
      maxAbsBreathOffsetPx: Number(maxAbsBreath.toFixed(4)),
    },
    privacy: LOCAL_VOICE_PRIVACY_CONTRACT,
  };
}
