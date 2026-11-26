/**
 * #12 스크롤 속도 적응형 다이내믹 스템 믹서 + #24 바이노럴 3D HRTF 공간 오디오툰 +
 * Pillar F(#21·#22·#23·#12·#24) 통합 진입점 (₩0 로컬 · 0 AI 토큰).
 */

export {
  evaluateMotionToonFrame,
  MOTIONTOON_BONE_IDS,
  rigCutToMotionToonMesh,
  type BoneLandmarkOverride,
  type CutSilhouetteInput,
  type MotionToonAnimParams,
  type MotionToonBone,
  type MotionToonBoneId,
  type MotionToonBoneTransform,
  type MotionToonEvaluatedFrame,
  type MotionToonRigMesh,
  type MotionToonRigOptions,
} from "./motiontoon-auto-mesh-rig";

export {
  computeLocalOpticalFlow,
  interpolateInbetweenFrames,
  type InbetweenEasingKind,
  type InbetweenInterpolatorOptions,
  type InbetweenKeyframe,
  type InbetweenSynthesisReport,
  type InterpolatedFrameResult,
  type OpticalFlowField,
  type OpticalFlowOptions,
  type RgbaFrameBuffer,
  type VectorPoint2D,
  type VectorStroke2D,
} from "./opticalflow-vector-inbetweener";

export {
  PARTICLE_STATE_AIRBORNE,
  PARTICLE_STATE_BOUNCED,
  PARTICLE_STATE_SETTLED,
  PARTICLE_STATE_SPLASHED,
  ProceduralVfxParticleSimulator,
  validateDepthParticleWgsl,
  WGSL_DEPTH_PARTICLE_SIM,
  type DepthParticleWgslValidation,
  type NormalizedDepthMap,
  type ParticleCollisionState,
  type VfxEmitterConfig,
  type VfxParticlePreset,
  type VfxParticleSnapshot,
  type VfxStepMetrics,
} from "./webgpu-depth-particle-vfx";

export type AudioStemId = "ambient" | "emotional" | "tension" | "action" | "sfx" | "dialogue";

export type SceneAudioMood = "calm" | "emotional" | "suspense" | "battle";

export interface ScrollDynamicsInput {
  readonly scrollVelocityPxPerSec: number;
  readonly dtSec: number;
  readonly sceneMood?: SceneAudioMood;
  readonly activeDialogueCount?: number;
  readonly sfxImpactIntensity?: number;
}

export interface StemGainVector {
  readonly ambient: number;
  readonly emotional: number;
  readonly tension: number;
  readonly action: number;
  readonly sfx: number;
  readonly dialogue: number;
}

export interface DynamicStemMixState {
  readonly gains: StemGainVector;
  readonly scrollEnergy: number;
  readonly intensityBand: "still" | "reading" | "brisk" | "action-sprint";
  readonly dialogueDuckingDb: number;
  readonly masterHeadroomScale: number;
}

export interface SpeechBalloonSpatialSource {
  readonly sourceId: string;
  readonly x: number;
  readonly y: number;
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly normalizedCoords?: boolean;
  readonly depthMeters?: number;
  readonly gain?: number;
}

export interface BinauralHrtfParams {
  readonly sourceId: string;
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly distanceMeters: number;
  readonly distanceAttenuation: number;
  readonly itdSeconds: number;
  readonly itdMicroseconds: number;
  readonly leftDelaySamples: number;
  readonly rightDelaySamples: number;
  readonly leftGain: number;
  readonly rightGain: number;
  readonly ildDb: number;
  readonly leftLowpassHz: number;
  readonly rightLowpassHz: number;
}

export interface BinauralMixOutput {
  readonly left: Float32Array;
  readonly right: Float32Array;
  readonly params: readonly BinauralHrtfParams[];
}

export interface DynamicScrollStemHrtfOptions {
  readonly sampleRate?: number;
  readonly headRadiusMeters?: number;
  readonly speedOfSoundMps?: number;
  readonly referenceDistanceMeters?: number;
  readonly distanceRolloff?: number;
  readonly stageWidthMeters?: number;
  readonly stageHeightMeters?: number;
  readonly attackSec?: number;
  readonly releaseSec?: number;
}

const MOOD_BASE_GAINS: Readonly<Record<SceneAudioMood, StemGainVector>> = {
  calm: { ambient: 0.72, emotional: 0.56, tension: 0.14, action: 0.06, sfx: 0.45, dialogue: 0.9 },
  emotional: { ambient: 0.52, emotional: 0.88, tension: 0.22, action: 0.08, sfx: 0.45, dialogue: 0.92 },
  suspense: { ambient: 0.48, emotional: 0.28, tension: 0.82, action: 0.25, sfx: 0.62, dialogue: 0.92 },
  battle: { ambient: 0.26, emotional: 0.18, tension: 0.68, action: 0.86, sfx: 0.85, dialogue: 0.94 },
};

function clamp(v: number, min: number, max: number): number {
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

function roundZero(value: number, digits: number): number {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * #12 스크롤 속도 적응형 스템 믹서와 #24 바이노럴 3D HRTF(ITD/ILD/거리감쇠) 공간 오디오툰 통합 엔진.
 */
export class DynamicScrollStemHrtfMixer {
  private readonly sampleRate: number;
  private readonly headRadiusM: number;
  private readonly speedOfSoundMps: number;
  private readonly refDistanceM: number;
  private readonly distanceRolloff: number;
  private readonly stageWidthM: number;
  private readonly stageHeightM: number;
  private readonly attackSec: number;
  private readonly releaseSec: number;

  private currentGains: Record<AudioStemId, number> = {
    ambient: 0.65,
    emotional: 0.55,
    tension: 0.18,
    action: 0.08,
    sfx: 0.45,
    dialogue: 0.0,
  };
  private smoothedScrollEnergy = 0;

  constructor(options: DynamicScrollStemHrtfOptions = {}) {
    this.sampleRate = Math.max(8000, Math.floor(options.sampleRate ?? 48000));
    this.headRadiusM = clamp(options.headRadiusMeters ?? 0.0875, 0.06, 0.12);
    this.speedOfSoundMps = clamp(options.speedOfSoundMps ?? 343.0, 300, 380);
    this.refDistanceM = clamp(options.referenceDistanceMeters ?? 1.0, 0.25, 5.0);
    this.distanceRolloff = clamp(options.distanceRolloff ?? 1.15, 0.2, 2.5);
    this.stageWidthM = clamp(options.stageWidthMeters ?? 3.6, 0.5, 12.0);
    this.stageHeightM = clamp(options.stageHeightMeters ?? 2.4, 0.5, 12.0);
    this.attackSec = clamp(options.attackSec ?? 0.16, 0.02, 2.0);
    this.releaseSec = clamp(options.releaseSec ?? 0.65, 0.05, 4.0);
  }

  /**
   * #12 독자 스크롤 속도와 씬 무드·대사/효과음 이벤트에 따라 6개 오디오 스템 게인을 부드럽게 적응시킨다.
   */
  public updateScrollDynamics(input: ScrollDynamicsInput): DynamicStemMixState {
    const dt = clamp(input.dtSec, 0.001, 0.5);
    const speed = Math.abs(input.scrollVelocityPxPerSec);
    const rawEnergy = clamp(speed / 1100, 0, 1);

    const energyTau = rawEnergy > this.smoothedScrollEnergy ? this.attackSec : this.releaseSec;
    const energyAlpha = 1 - Math.exp(-dt / energyTau);
    this.smoothedScrollEnergy += (rawEnergy - this.smoothedScrollEnergy) * energyAlpha;
    const e = this.smoothedScrollEnergy;

    const mood = input.sceneMood ?? "calm";
    const base = MOOD_BASE_GAINS[mood];
    const hasDialogue = (input.activeDialogueCount ?? 0) > 0;
    const sfxIntensity = clamp(input.sfxImpactIntensity ?? 0, 0, 1);

    const duckFactor = hasDialogue ? 0.66 : 1 - sfxIntensity * 0.2;
    const dialogueDuckingDb = roundZero(20 * Math.log10(Math.max(0.1, duckFactor)), 2);

    const targets: Record<AudioStemId, number> = {
      ambient: clamp(base.ambient * (1 - e * 0.42) * duckFactor, 0.05, 1),
      emotional: clamp(base.emotional * (1.12 - e * 0.72) * duckFactor, 0.04, 1),
      tension: clamp((base.tension + e * 0.52) * (hasDialogue ? 0.78 : 1), 0.04, 1),
      action: clamp((base.action + Math.pow(e, 1.35) * 0.88) * (hasDialogue ? 0.74 : 1), 0.02, 1),
      sfx: clamp(base.sfx * 0.55 + sfxIntensity * 0.58 + e * 0.25, 0.1, 1),
      dialogue: hasDialogue ? base.dialogue : 0.0,
    };

    const stems: readonly AudioStemId[] = ["ambient", "emotional", "tension", "action", "sfx", "dialogue"];
    for (let i = 0; i < stems.length; i += 1) {
      const id = stems[i];
      const curr = this.currentGains[id];
      const tgt = targets[id];
      const tau = tgt > curr ? this.attackSec : this.releaseSec;
      const alpha = 1 - Math.exp(-dt / tau);
      this.currentGains[id] = clamp(curr + (tgt - curr) * alpha, 0, 1);
    }

    const totalEnergy =
      this.currentGains.ambient +
      this.currentGains.emotional +
      this.currentGains.tension +
      this.currentGains.action +
      this.currentGains.sfx +
      this.currentGains.dialogue;
    const masterHeadroomScale = totalEnergy > 2.4 ? roundZero(2.4 / totalEnergy, 4) : 1.0;

    let intensityBand: DynamicStemMixState["intensityBand"] = "still";
    if (e >= 0.65) intensityBand = "action-sprint";
    else if (e >= 0.34) intensityBand = "brisk";
    else if (e >= 0.12) intensityBand = "reading";

    return {
      gains: {
        ambient: roundZero(this.currentGains.ambient, 4),
        emotional: roundZero(this.currentGains.emotional, 4),
        tension: roundZero(this.currentGains.tension, 4),
        action: roundZero(this.currentGains.action, 4),
        sfx: roundZero(this.currentGains.sfx, 4),
        dialogue: roundZero(this.currentGains.dialogue, 4),
      },
      scrollEnergy: roundZero(e, 4),
      intensityBand,
      dialogueDuckingDb,
      masterHeadroomScale,
    };
  }

  /**
   * #24 말풍선 캔버스 좌표와 3D 깊이를 물리 기반 Woodworth-Schlosberg ITD · 헤드섀도 ILD · 거리 감쇠로 변환한다.
   */
  public computeBalloonHrtf(source: SpeechBalloonSpatialSource): BinauralHrtfParams {
    const normX = source.normalizedCoords
      ? clamp(source.x, 0, 1)
      : clamp(source.x / Math.max(1, source.canvasWidth ?? 800), 0, 1);
    const normY = source.normalizedCoords
      ? clamp(source.y, 0, 1)
      : clamp(source.y / Math.max(1, source.canvasHeight ?? 1280), 0, 1);

    const dxMeters = (normX - 0.5) * this.stageWidthM;
    const dyMeters = (0.5 - normY) * this.stageHeightM;
    const dzMeters = clamp(source.depthMeters ?? 1.6, 0.35, 20.0);

    const azimuthRad = clamp(Math.atan2(dxMeters, dzMeters), -Math.PI * 0.5, Math.PI * 0.5);
    const horizDist = Math.hypot(dxMeters, dzMeters);
    const elevationRad = clamp(Math.atan2(dyMeters, Math.max(0.01, horizDist)), -Math.PI / 3, Math.PI / 3);
    const distanceMeters = Math.hypot(dxMeters, dyMeters, dzMeters);

    // Woodworth-Schlosberg 구형 머리 모델 ITD: (a / c) * (sin(theta) + theta)
    const itdSeconds = (this.headRadiusM / this.speedOfSoundMps) * (Math.sin(azimuthRad) + azimuthRad);
    const leftDelaySamples = itdSeconds > 0 ? itdSeconds * this.sampleRate : 0;
    const rightDelaySamples = itdSeconds < 0 ? -itdSeconds * this.sampleRate : 0;

    const distDenom = Math.pow(Math.max(this.refDistanceM, distanceMeters), this.distanceRolloff);
    const distanceAttenuation = clamp(this.refDistanceM / Math.max(0.01, distDenom), 0.04, 1.0);

    const sinAz = Math.sin(azimuthRad);
    const panAngle = ((sinAz + 1) * 0.5) * (Math.PI * 0.5);
    const baseLeft = Math.cos(panAngle);
    const baseRight = Math.sin(panAngle);
    const shadowFactorLeft = sinAz > 0 ? 1 - sinAz * 0.36 : 1 + -sinAz * 0.08;
    const shadowFactorRight = sinAz < 0 ? 1 - -sinAz * 0.36 : 1 + sinAz * 0.08;
    const pinnaCue = 1 + Math.sin(elevationRad) * 0.07;
    const sourceGain = clamp(source.gain ?? 1.0, 0, 2.0);

    const leftGain = clamp(baseLeft * shadowFactorLeft * distanceAttenuation * pinnaCue * sourceGain, 0.001, 1.5);
    const rightGain = clamp(baseRight * shadowFactorRight * distanceAttenuation * pinnaCue * sourceGain, 0.001, 1.5);
    const rawIldDb = 20 * Math.log10(rightGain / leftGain);

    const leftLowpassHz = Math.round(sinAz > 0 ? 18000 - sinAz * 14800 : 18000);
    const rightLowpassHz = Math.round(sinAz < 0 ? 18000 - -sinAz * 14800 : 18000);

    return {
      sourceId: source.sourceId,
      azimuthDeg: roundZero((azimuthRad * 180) / Math.PI, 2),
      elevationDeg: roundZero((elevationRad * 180) / Math.PI, 2),
      distanceMeters: roundZero(distanceMeters, 3),
      distanceAttenuation: roundZero(distanceAttenuation, 4),
      itdSeconds: roundZero(itdSeconds, 6),
      itdMicroseconds: roundZero(itdSeconds * 1_000_000, 2),
      leftDelaySamples: roundZero(leftDelaySamples, 3),
      rightDelaySamples: roundZero(rightDelaySamples, 3),
      leftGain: roundZero(leftGain, 4),
      rightGain: roundZero(rightGain, 4),
      ildDb: roundZero(rawIldDb, 2),
      leftLowpassHz,
      rightLowpassHz,
    };
  }

  /**
   * 다중 모노 보이스/효과음 PCM 버퍼를 분수 지연 ITD + 헤드섀도 로우패스 + ILD 게인으로 스테레오 믹싱한다.
   */
  public renderBinauralStereoMix(
    sources: readonly SpeechBalloonSpatialSource[],
    monoPcmById: Readonly<Record<string, Float32Array>>,
    frameLength: number,
  ): BinauralMixOutput {
    const safeLen = Math.max(1, Math.floor(frameLength));
    const left = new Float32Array(safeLen);
    const right = new Float32Array(safeLen);
    const params: BinauralHrtfParams[] = [];

    for (let s = 0; s < sources.length; s += 1) {
      const src = sources[s];
      const hrtf = this.computeBalloonHrtf(src);
      params.push(hrtf);
      const mono = monoPcmById[src.sourceId];
      if (!mono || mono.length === 0) continue;

      const alphaL = this.computeOnePoleAlpha(hrtf.leftLowpassHz);
      const alphaR = this.computeOnePoleAlpha(hrtf.rightLowpassHz);
      let lpStateL = 0;
      let lpStateR = 0;

      for (let i = 0; i < safeLen; i += 1) {
        const sampleL = this.sampleDelayedLinear(mono, i - hrtf.leftDelaySamples);
        const sampleR = this.sampleDelayedLinear(mono, i - hrtf.rightDelaySamples);
        lpStateL += alphaL * (sampleL - lpStateL);
        lpStateR += alphaR * (sampleR - lpStateR);
        left[i] += lpStateL * hrtf.leftGain;
        right[i] += lpStateR * hrtf.rightGain;
      }
    }

    for (let i = 0; i < safeLen; i += 1) {
      if (Math.abs(left[i]) > 1) left[i] = Math.tanh(left[i]);
      if (Math.abs(right[i]) > 1) right[i] = Math.tanh(right[i]);
    }

    return { left, right, params };
  }

  private computeOnePoleAlpha(cutoffHz: number): number {
    const fc = clamp(cutoffHz, 200, this.sampleRate * 0.45);
    const rc = 1 / (2 * Math.PI * fc);
    const dt = 1 / this.sampleRate;
    return clamp(dt / (rc + dt), 0.01, 1.0);
  }

  private sampleDelayedLinear(buffer: Float32Array, indexFloat: number): number {
    if (indexFloat < 0 || indexFloat >= buffer.length) return 0;
    const i0 = Math.floor(indexFloat);
    const i1 = Math.min(buffer.length - 1, i0 + 1);
    const frac = indexFloat - i0;
    return buffer[i0] * (1 - frac) + buffer[i1] * frac;
  }
}
