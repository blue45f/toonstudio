/**
 * 필압·속도·매체 연동 ₩0 WebAudio 절차적 마찰음 합성기.
 *
 * 설계 원칙:
 * - 6종 매체: 연필(흑연 사각거림), 목탄/파스텔(거친 긁힘), 수채 붓(부드러운 스침),
 *   유화 나이프(끈적한 저항), G펜 촉(금속 잉크 스크래치), 알코올 마커(촉촉한 펠트 글라이드).
 * - 2.5초 심리스 멀티폴 핑크 노이즈 버퍼 + 종이결 리듬 변조(위상 추적 변조 + LFO 지원 시 실시간 변조).
 * - 기본 OFF(옵트인 토글), `AudioContext` 미지원·SSR·Node 환경에서 100% 무오류 no-op.
 * - 청력 보호 볼륨 상한 안전 가드(`MAX_SAFE_FRICTION_GAIN = 0.25`)를 어떤 입력·변조에서도 강제한다.
 * - 외부 오디오 샘플/CDN/AI 비용 0원(순수 절차적 노이즈 버퍼 + BiquadFilter 체인).
 */

export type BrushFrictionMediumId =
  | "graphite-pencil"
  | "charcoal-pastel"
  | "watercolor-brush"
  | "oil-palette-knife"
  | "gpen-nib"
  | "alcohol-marker";

export interface BrushFrictionMediumProfile {
  readonly id: BrushFrictionMediumId;
  readonly label: string;
  readonly baseFreqHz: number;
  readonly speedFreqSpanHz: number;
  readonly pressureFreqShiftHz: number;
  readonly baseQ: number;
  readonly pressureQShift: number;
  readonly highpassHz: number;
  readonly lowpassHz: number;
  readonly gritDepth: number;
  readonly mediumGainCeiling: number;
  /** 노이즈 스펙트럼 기울기 (0 = 화이트, 1 = 핑크/브라운 저역 강조). */
  readonly noiseWarmth: number;
}

/** 청력 보호 절대 게인 상한 (어떤 입력·masterVolume·변조에서도 초과 불가). */
export const MAX_SAFE_FRICTION_GAIN = 0.25 as const;
export const MIN_SAFE_FRICTION_FREQ_HZ = 120 as const;
export const MAX_SAFE_FRICTION_FREQ_HZ = 12000 as const;
const FRICTION_NOISE_BUFFER_SEC = 2.5;

export const BRUSH_FRICTION_MEDIUM_PROFILES: Readonly<
  Record<BrushFrictionMediumId, BrushFrictionMediumProfile>
> = Object.freeze({
  "graphite-pencil": Object.freeze({
    id: "graphite-pencil",
    label: "연필 (흑연 사각거림)",
    baseFreqHz: 2550,
    speedFreqSpanHz: 2150,
    pressureFreqShiftHz: -320,
    baseQ: 3.1,
    pressureQShift: 0.9,
    highpassHz: 950,
    lowpassHz: 7800,
    gritDepth: 0.56,
    mediumGainCeiling: 0.21,
    noiseWarmth: 0.18,
  }),
  "charcoal-pastel": Object.freeze({
    id: "charcoal-pastel",
    label: "목탄·파스텔 (거친 긁힘)",
    baseFreqHz: 1120,
    speedFreqSpanHz: 1350,
    pressureFreqShiftHz: -260,
    baseQ: 1.15,
    pressureQShift: 0.45,
    highpassHz: 280,
    lowpassHz: 5400,
    gritDepth: 0.85,
    mediumGainCeiling: 0.24,
    noiseWarmth: 0.42,
  }),
  "watercolor-brush": Object.freeze({
    id: "watercolor-brush",
    label: "수채 붓 (부드러운 스침)",
    baseFreqHz: 620,
    speedFreqSpanHz: 720,
    pressureFreqShiftHz: -110,
    baseQ: 1.35,
    pressureQShift: 0.35,
    highpassHz: 160,
    lowpassHz: 2450,
    gritDepth: 0.22,
    mediumGainCeiling: 0.14,
    noiseWarmth: 0.78,
  }),
  "oil-palette-knife": Object.freeze({
    id: "oil-palette-knife",
    label: "유화 나이프 (끈적한 저항)",
    baseFreqHz: 420,
    speedFreqSpanHz: 640,
    pressureFreqShiftHz: 220,
    baseQ: 4.1,
    pressureQShift: 1.25,
    highpassHz: 140,
    lowpassHz: 3900,
    gritDepth: 0.64,
    mediumGainCeiling: 0.22,
    noiseWarmth: 0.62,
  }),
  "gpen-nib": Object.freeze({
    id: "gpen-nib",
    label: "G펜 촉 (금속 잉크 스크래치)",
    baseFreqHz: 3120,
    speedFreqSpanHz: 2050,
    pressureFreqShiftHz: 420,
    baseQ: 3.8,
    pressureQShift: 1.1,
    highpassHz: 1180,
    lowpassHz: 8800,
    gritDepth: 0.48,
    mediumGainCeiling: 0.19,
    noiseWarmth: 0.12,
  }),
  "alcohol-marker": Object.freeze({
    id: "alcohol-marker",
    label: "알코올 마커 (촉촉한 펠트 글라이드)",
    baseFreqHz: 1380,
    speedFreqSpanHz: 680,
    pressureFreqShiftHz: -140,
    baseQ: 2.1,
    pressureQShift: 0.4,
    highpassHz: 420,
    lowpassHz: 3600,
    gritDepth: 0.18,
    mediumGainCeiling: 0.16,
    noiseWarmth: 0.64,
  }),
});

export interface BrushFrictionStrokeInput {
  readonly medium: BrushFrictionMediumId;
  /** 필압 [0..1]. */
  readonly pressure: number;
  /** 스트로크 속도 (px/ms, 0..8). */
  readonly speed: number;
  /** 종이 표면 거칠기 [0..1] (기본 0.55). */
  readonly paperRoughness?: number;
  /** 펜 기울기(라디안, 0 = 눕힘 ~ π/2 = 수직, 기본 π/3). */
  readonly tiltRad?: number;
  /** 매체 습윤도 [0..1] (높을수록 고주파 마찰 감소, 기본 0.2). */
  readonly wetness?: number;
  /** 사용자 마스터 볼륨 [0..1] (기본 0.65). */
  readonly masterVolume?: number;
}

export interface BrushFrictionAcousticParams {
  readonly medium: BrushFrictionMediumId;
  /** 스트로크 움직임이 정지 문턱을 넘었는지 여부. */
  readonly active: boolean;
  /** 밴드패스 중심 주파수(Hz). */
  readonly centerFreqHz: number;
  /** 밴드패스 Q 팩터. */
  readonly qFactor: number;
  /** 고역통과 컷오프(Hz). */
  readonly highpassCutoffHz: number;
  /** 저역통과 컷오프(Hz). */
  readonly lowpassCutoffHz: number;
  /** 종이 요철 통과 리듬 변조 주파수(Hz). */
  readonly grainModRateHz: number;
  /** 종이 요철 변조 깊이 [0..0.85]. */
  readonly grainModDepth: number;
  /** 청력 보호 상한이 적용된 최종 출력 게인 [0..MAX_SAFE_FRICTION_GAIN]. */
  readonly targetGain: number;
}

/** WebAudio `AudioParam` 최소 호환 인터페이스 (SSR·테스트 mock 강타입 지원). */
export interface FrictionAudioParamLike {
  value: number;
  setTargetAtTime(target: number, startTime: number, timeConstant: number): void;
}

export interface FrictionGainNodeLike {
  readonly gain: FrictionAudioParamLike;
  connect(destination: unknown): void;
  disconnect(): void;
}

export interface FrictionBiquadFilterNodeLike {
  type: BiquadFilterType;
  readonly frequency: FrictionAudioParamLike;
  readonly Q: FrictionAudioParamLike;
  connect(destination: unknown): void;
  disconnect(): void;
}

export interface FrictionBufferSourceNodeLike {
  buffer: AudioBuffer | null;
  loop: boolean;
  connect(destination: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
  disconnect(): void;
}

export interface FrictionOscillatorNodeLike {
  type: OscillatorType;
  readonly frequency: FrictionAudioParamLike;
  connect(destination: unknown): void;
  start(when?: number): void;
  stop(when?: number): void;
  disconnect(): void;
}

export interface FrictionAudioBufferLike {
  readonly length: number;
  getChannelData(channel: number): Float32Array;
}

export interface FrictionAudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state: AudioContextState;
  readonly destination: unknown;
  createBuffer(channels: number, length: number, sampleRate: number): FrictionAudioBufferLike;
  createBufferSource(): FrictionBufferSourceNodeLike;
  createBiquadFilter(): FrictionBiquadFilterNodeLike;
  createGain(): FrictionGainNodeLike;
  readonly createOscillator?: () => FrictionOscillatorNodeLike;
  resume(): Promise<void>;
  close(): Promise<void>;
}

export type BrushFrictionAudioStatus =
  | "disabled"
  | "unsupported"
  | "ready"
  | "running"
  | "disposed";

export interface CreateBrushFrictionAudioControllerOptions {
  /** 초기 활성화 여부 — 기본값 `false`(옵트인). */
  readonly enabled?: boolean;
  /** 사용자 볼륨 배율 [0..1] (기본 0.65). */
  readonly masterVolume?: number;
  /** 테스트·커스텀 호스트용 AudioContext 팩토리 주입. */
  readonly createContext?: () => FrictionAudioContextLike | null;
}

export interface BrushFrictionAudioController {
  isEnabled(): boolean;
  getStatus(): BrushFrictionAudioStatus;
  setEnabled(enabled: boolean): BrushFrictionAudioStatus;
  setMasterVolume(volume: number): void;
  updateStroke(input: BrushFrictionStrokeInput): BrushFrictionAcousticParams;
  stopStroke(): void;
  dispose(): void;
}

const HALF_PI = Math.PI * 0.5;
const TWO_PI = Math.PI * 2;

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return v < lo ? lo : v > hi ? hi : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

/**
 * 필압·속도·종이 거칠기·틸트·습윤도에서 매체별 밴드패스 노이즈·필터 파라미터를 산출한다.
 * 어떤 극단/비정상 입력에서도 청력 보호 볼륨 상한(`MAX_SAFE_FRICTION_GAIN`)을 절대 넘지 않는다.
 */
export function computeBrushFrictionSynthParams(
  input: BrushFrictionStrokeInput,
): BrushFrictionAcousticParams {
  const profile = BRUSH_FRICTION_MEDIUM_PROFILES[input.medium];
  const pressure = clamp01(input.pressure);
  const speed = clamp(input.speed, 0, 8);
  const roughness = clamp01(input.paperRoughness ?? 0.55);
  const tilt01 = clamp01(clamp(input.tiltRad ?? Math.PI / 3, 0, HALF_PI) / HALF_PI);
  const wetness = clamp01(input.wetness ?? 0.2);
  const masterVol = clamp01(input.masterVolume ?? 0.65);

  const speedNorm = clamp01(speed / 3.2);
  const active = speed > 0.025 && pressure > 0.015;

  // 틸트가 낮을수록(펜을 눕힐수록) 접촉 면적이 넓어져 중심 주파수는 살짝 낮아지고 거칠기 변조는 커진다
  const grazing = 1 - tilt01;
  const rawCenter =
    profile.baseFreqHz +
    profile.speedFreqSpanHz * Math.pow(speedNorm, 0.78) +
    profile.pressureFreqShiftHz * pressure -
    grazing * 260 -
    wetness * 340;
  const centerFreqHz = clamp(rawCenter, MIN_SAFE_FRICTION_FREQ_HZ, MAX_SAFE_FRICTION_FREQ_HZ);

  const qFactor = clamp(
    profile.baseQ + profile.pressureQShift * pressure - roughness * 0.35 + wetness * 0.25,
    0.55,
    8.0,
  );

  const highpassCutoffHz = clamp(profile.highpassHz * (1 - 0.18 * grazing), 60, Math.min(1800, centerFreqHz * 0.75));
  const lowpassCutoffHz = clamp(
    profile.lowpassHz * (0.72 + 0.35 * speedNorm) * (1 - 0.32 * wetness),
    Math.max(420, centerFreqHz * 1.15),
    14000,
  );

  // 종이 요철 통과 리듬(Hz)
  const grainModRateHz = clamp(4 + speed * 26 * (0.4 + 0.8 * roughness), 2, 180);
  const grainModDepth = clamp(
    profile.gritDepth * (0.35 + 0.65 * roughness) * (1 + 0.25 * grazing) * (1 - 0.45 * wetness),
    0,
    0.85,
  );

  const mediumCeiling = Math.min(MAX_SAFE_FRICTION_GAIN, profile.mediumGainCeiling);
  const strokeEnergy = active
    ? Math.pow(speedNorm, 0.62) * (0.28 + 0.72 * Math.pow(pressure, 0.72)) * (0.65 + 0.35 * roughness)
    : 0;
  const targetGain = clamp(strokeEnergy * mediumCeiling * masterVol, 0, MAX_SAFE_FRICTION_GAIN);

  return {
    medium: input.medium,
    active,
    centerFreqHz,
    qFactor,
    highpassCutoffHz,
    lowpassCutoffHz,
    grainModRateHz,
    grainModDepth,
    targetGain,
  };
}

/**
 * 결정적 시드 기반 심리스 절차적 마찰 노이즈 버퍼를 채운다(외부 샘플 0B).
 * 3단 핑크 필터 성분과 화이트 성분을 `warmth` 비율로 혼합하고 루프 경계를 raised-cosine으로 잇는다.
 */
export function fillProceduralFrictionNoiseBuffer(
  channelData: Float32Array,
  warmth = 0.35,
  seed = 20261122,
): void {
  const w = clamp01(warmth);
  const len = channelData.length;
  let state = (seed | 0) || 1337;
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < len; i += 1) {
    // xorshift32 결정적 PRNG
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const white = ((state >>> 0) / 4294967295) * 2 - 1;
    b0 = 0.994 * b0 + white * 0.085;
    b1 = 0.942 * b1 + white * 0.24;
    b2 = 0.74 * b2 + white * 0.42;
    const pink = (b0 + b1 + b2) * 0.48;
    channelData[i] = clamp(white * (1 - w) * 0.78 + pink * (0.35 + w * 0.85), -0.95, 0.95);
  }

  // 심리스 루프를 위한 경계 raised-cosine 크로스페이드
  const fade = Math.min(256, Math.floor(len / 8));
  for (let i = 0; i < fade; i += 1) {
    const t = 0.5 * (1 - Math.cos((Math.PI * i) / fade));
    const head = channelData[i] ?? 0;
    const tail = channelData[len - fade + i] ?? 0;
    channelData[len - fade + i] = tail * (1 - t) + head * t;
  }
}

function resolveDefaultAudioContext(): FrictionAudioContextLike | null {
  if (typeof globalThis === "undefined") return null;
  const host = globalThis as {
    readonly AudioContext?: new () => FrictionAudioContextLike;
    readonly webkitAudioContext?: new () => FrictionAudioContextLike;
  };
  const Ctor = host.AudioContext ?? host.webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  try {
    return new Ctor();
  } catch {
    return null;
  }
}

/**
 * WebAudio 안전 바인딩 브러시 마찰음 컨트롤러.
 * - 기본 OFF (`enabled: false`), 토글 가능.
 * - `AudioContext` 미지원/SSR 환경에서 절대 예외를 던지지 않고 무오류 no-op로 동작한다.
 * - 종이결 리듬 변조 시에도 출력 게인은 항상 `MAX_SAFE_FRICTION_GAIN (0.25)` 이하로 유지된다.
 */
export function createBrushFrictionAudioController(
  options: CreateBrushFrictionAudioControllerOptions = {},
): BrushFrictionAudioController {
  let enabled = options.enabled === true;
  let masterVolume = clamp01(options.masterVolume ?? 0.65);
  let disposed = false;
  let status: BrushFrictionAudioStatus = enabled ? "ready" : "disabled";

  let ctx: FrictionAudioContextLike | null = null;
  let sourceNode: FrictionBufferSourceNodeLike | null = null;
  let highpassNode: FrictionBiquadFilterNodeLike | null = null;
  let bandpassNode: FrictionBiquadFilterNodeLike | null = null;
  let lowpassNode: FrictionBiquadFilterNodeLike | null = null;
  let strokeGainNode: FrictionGainNodeLike | null = null;
  let safetyLimiterNode: FrictionGainNodeLike | null = null;
  let grainLfoNode: FrictionOscillatorNodeLike | null = null;
  let grainLfoAmpNode: FrictionGainNodeLike | null = null;
  let grainLfoFreqNode: FrictionGainNodeLike | null = null;
  let grainModPhaseRad = 0;
  let lastStrokeTimeSec: number | null = null;

  const ensureGraph = (): boolean => {
    if (disposed || !enabled) return false;
    if (ctx && strokeGainNode && bandpassNode && highpassNode && lowpassNode && safetyLimiterNode) {
      return true;
    }
    const factory = options.createContext ?? resolveDefaultAudioContext;
    let created: FrictionAudioContextLike | null;
    try {
      created = factory();
    } catch {
      created = null;
    }
    if (!created) {
      status = "unsupported";
      return false;
    }
    try {
      const sampleRate = Math.max(8000, Math.trunc(created.sampleRate || 44100));
      const bufferLength = Math.round(sampleRate * FRICTION_NOISE_BUFFER_SEC);
      const buffer = created.createBuffer(1, bufferLength, sampleRate);
      fillProceduralFrictionNoiseBuffer(buffer.getChannelData(0), 0.35, 20261122);

      const src = created.createBufferSource();
      src.buffer = buffer as unknown as AudioBuffer;
      src.loop = true;

      const hp = created.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 240;

      const bp = created.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1200;
      bp.Q.value = 2.0;

      const lp = created.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 4800;

      const strokeGain = created.createGain();
      strokeGain.gain.value = 0;

      // 청력 보호 하드 리미터 노드 (상한 1.0 고정, LFO 변조 시에도 피크 <= 1.0 유지)
      const safetyGain = created.createGain();
      safetyGain.gain.value = 1;

      src.connect(hp);
      hp.connect(bp);
      bp.connect(lp);
      lp.connect(strokeGain);
      strokeGain.connect(safetyGain);
      safetyGain.connect(created.destination);
      src.start(0);

      // 오실레이터 지원 환경에서는 종이결 요철 리듬용 저주파 LFO를 graceful하게 연결
      let lfoOsc: FrictionOscillatorNodeLike | null = null;
      let lfoAmp: FrictionGainNodeLike | null = null;
      let lfoFreq: FrictionGainNodeLike | null = null;
      if (typeof created.createOscillator === "function") {
        try {
          lfoOsc = created.createOscillator();
          lfoOsc.type = "sine";
          lfoOsc.frequency.value = 16;

          lfoAmp = created.createGain();
          lfoAmp.gain.value = 0;
          lfoOsc.connect(lfoAmp);
          lfoAmp.connect(safetyGain.gain);

          lfoFreq = created.createGain();
          lfoFreq.gain.value = 0;
          lfoOsc.connect(lfoFreq);
          lfoFreq.connect(bp.frequency);

          lfoOsc.start(0);
        } catch {
          lfoOsc = null;
          lfoAmp = null;
          lfoFreq = null;
        }
      }

      ctx = created;
      sourceNode = src;
      highpassNode = hp;
      bandpassNode = bp;
      lowpassNode = lp;
      strokeGainNode = strokeGain;
      safetyLimiterNode = safetyGain;
      grainLfoNode = lfoOsc;
      grainLfoAmpNode = lfoAmp;
      grainLfoFreqNode = lfoFreq;
      status = "running";
      return true;
    } catch {
      status = "unsupported";
      return false;
    }
  };

  const silence = (): void => {
    if (!ctx || !strokeGainNode) return;
    try {
      const now = ctx.currentTime;
      strokeGainNode.gain.setTargetAtTime(0, now, 0.02);
      if (grainLfoAmpNode && grainLfoFreqNode && safetyLimiterNode) {
        grainLfoAmpNode.gain.setTargetAtTime(0, now, 0.02);
        grainLfoFreqNode.gain.setTargetAtTime(0, now, 0.02);
        safetyLimiterNode.gain.setTargetAtTime(1, now, 0.02);
      }
      lastStrokeTimeSec = null;
    } catch {
      status = "disposed";
    }
  };

  return {
    isEnabled(): boolean {
      return enabled && !disposed;
    },

    getStatus(): BrushFrictionAudioStatus {
      return status;
    },

    setEnabled(next: boolean): BrushFrictionAudioStatus {
      if (disposed) return "disposed";
      enabled = next;
      if (!enabled) {
        silence();
        status = "disabled";
        return status;
      }
      if (!ensureGraph()) {
        return status;
      }
      if (ctx && ctx.state === "suspended") {
        void ctx.resume().catch(() => undefined);
      }
      status = "running";
      return status;
    },

    setMasterVolume(volume: number): void {
      masterVolume = clamp01(volume);
    },

    updateStroke(input: BrushFrictionStrokeInput): BrushFrictionAcousticParams {
      const effectiveVol = input.masterVolume !== undefined ? clamp01(input.masterVolume) * masterVolume : masterVolume;
      const computed = computeBrushFrictionSynthParams({
        ...input,
        masterVolume: effectiveVol,
      });

      if (disposed || !enabled) {
        return {
          ...computed,
          active: false,
          targetGain: 0,
        };
      }

      if (!ensureGraph() || !ctx || !highpassNode || !bandpassNode || !lowpassNode || !strokeGainNode) {
        return {
          ...computed,
          active: false,
          targetGain: 0,
        };
      }

      if (ctx.state === "suspended") {
        void ctx.resume().catch(() => undefined);
      }
      const now = ctx.currentTime;
      const rawDt = lastStrokeTimeSec === null ? 0.016 : now - lastStrokeTimeSec;
      const dtSec = rawDt > 0.0005 ? clamp(rawDt, 0.004, 0.12) : 0.016;
      lastStrokeTimeSec = now;

      // 종이결 요철 통과 리듬 변조: 감쇄형(<= 1.0) 진폭 리듬으로 청력 보호 상한을 절대 초과하지 않음
      grainModPhaseRad = (grainModPhaseRad + TWO_PI * computed.grainModRateHz * dtSec) % TWO_PI;
      const toothWave01 = 0.5 * (1 - Math.cos(grainModPhaseRad));
      const gainModScale = computed.active ? 1 - computed.grainModDepth * 0.34 * toothWave01 : 1;
      const freqModScale = computed.active ? 1 + (toothWave01 - 0.5) * computed.grainModDepth * 0.07 : 1;

      const safeGain = clamp(computed.targetGain * gainModScale, 0, MAX_SAFE_FRICTION_GAIN);
      const modulatedCenterHz = clamp(
        computed.centerFreqHz * freqModScale,
        MIN_SAFE_FRICTION_FREQ_HZ,
        MAX_SAFE_FRICTION_FREQ_HZ,
      );

      highpassNode.frequency.setTargetAtTime(computed.highpassCutoffHz, now, 0.015);
      bandpassNode.frequency.setTargetAtTime(modulatedCenterHz, now, 0.012);
      bandpassNode.Q.setTargetAtTime(computed.qFactor, now, 0.015);
      lowpassNode.frequency.setTargetAtTime(computed.lowpassCutoffHz, now, 0.015);
      strokeGainNode.gain.setTargetAtTime(safeGain, now, 0.014);

      if (grainLfoNode && grainLfoAmpNode && grainLfoFreqNode && safetyLimiterNode) {
        const lfoAmp = computed.active ? clamp(computed.grainModDepth * 0.16, 0, 0.14) : 0;
        const lfoFreqSpan = computed.active ? clamp(computed.centerFreqHz * computed.grainModDepth * 0.045, 0, 260) : 0;
        grainLfoNode.frequency.setTargetAtTime(computed.grainModRateHz, now, 0.015);
        // safetyLimiter 중심값(1 - lfoAmp) + LFO(±lfoAmp) <= 1.0 이므로 총 출력은 항상 <= MAX_SAFE_FRICTION_GAIN
        safetyLimiterNode.gain.setTargetAtTime(1 - lfoAmp, now, 0.015);
        grainLfoAmpNode.gain.setTargetAtTime(lfoAmp, now, 0.015);
        grainLfoFreqNode.gain.setTargetAtTime(lfoFreqSpan, now, 0.015);
      }

      return {
        ...computed,
        centerFreqHz: modulatedCenterHz,
        targetGain: safeGain,
      };
    },

    stopStroke(): void {
      silence();
    },

    dispose(): void {
      if (disposed) return;
      disposed = true;
      enabled = false;
      status = "disposed";
      let teardownFailed = false;
      try {
        sourceNode?.stop(0);
        grainLfoNode?.stop(0);
      } catch {
        teardownFailed = true;
      }
      try {
        sourceNode?.disconnect();
        highpassNode?.disconnect();
        bandpassNode?.disconnect();
        lowpassNode?.disconnect();
        strokeGainNode?.disconnect();
        safetyLimiterNode?.disconnect();
        grainLfoNode?.disconnect();
        grainLfoAmpNode?.disconnect();
        grainLfoFreqNode?.disconnect();
      } catch {
        teardownFailed = true;
      }
      if (ctx) {
        void ctx.close().catch(() => {
          teardownFailed = true;
        });
      }
      if (teardownFailed) {
        status = "disposed";
      }
      ctx = null;
      sourceNode = null;
      highpassNode = null;
      bandpassNode = null;
      lowpassNode = null;
      strokeGainNode = null;
      safetyLimiterNode = null;
      grainLfoNode = null;
      grainLfoAmpNode = null;
      grainLfoFreqNode = null;
      lastStrokeTimeSec = null;
    },
  };
}
