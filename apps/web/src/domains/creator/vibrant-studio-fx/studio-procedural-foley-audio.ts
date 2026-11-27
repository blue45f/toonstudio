/**
 * 외부 파일 없이 `AudioContext`로 실시간 물리 모델링 사운드를 합성하는 초사실 Foley 엔진.
 * - 13종(기존 10종 + `alcohol-marker`/`charcoal-pastel`/`sumi-ink-brush`), 2.6초 3종 텍스처(`velvet`/`pink`/`gritty`) 노이즈 버퍼.
 * - 그레인별 결정론적 황금비 랜덤 오프셋 & ±3.5% 미세 피치/포먼트 변조, 이중 대역 포먼트 + stick-slip AM + raised-cosine(클릭 0).
 * - 나무 책상 초기 반사 `ConvolverNode` + `DynamicsCompressorNode` 리미터(mock 폴백). 브라우저 영속 저장소 미사용.
 */
import { fillTextureNoiseBuffer, StudioLiveFrictionVoice } from "./studio-live-friction-voice";
import { getPaperToothProfile, type StudioPaperTextureId } from "./studio-paper-and-pigment-physics";

export type StudioFoleySoundId =
  | "gpen-ink" | "graphite-pencil" | "watercolor-sable" | "oil-impasto" | "airbrush" | "eraser-scrub"
  | "alcohol-marker" | "charcoal-pastel" | "sumi-ink-brush"
  | "magnetic-detent" | "bubble-pop" | "panel-snap" | "page-turn";

export const STUDIO_FOLEY_SOUND_IDS: readonly StudioFoleySoundId[] = Object.freeze([
  "gpen-ink", "graphite-pencil", "watercolor-sable", "oil-impasto", "airbrush", "eraser-scrub",
  "alcohol-marker", "charcoal-pastel", "sumi-ink-brush",
  "magnetic-detent", "bubble-pop", "panel-snap", "page-turn",
]);

export type StudioFoleyChannelId = "foley" | "ui" | "ambience";
export type StudioFoleyPresetId = "quiet-atelier" | "lively-asmr" | "silent-focus";
export type StudioFoleyNoiseTexture = "velvet" | "pink" | "gritty";

/** 기계적 반복 주기를 제거하기 위한 절차적 노이즈 버퍼 길이(초). */
export const STUDIO_FOLEY_NOISE_BUFFER_SEC = 2.6 as const;
const ATELIER_ROOM_IR_SEC = 0.085;

export interface StudioFoleyMixerPreset {
  readonly id: StudioFoleyPresetId;
  readonly labelKo: string;
  readonly descriptionKo: string;
  readonly foley: number;
  readonly ui: number;
  readonly ambience: number;
  readonly muted: boolean;
}

export const STUDIO_FOLEY_PRESETS: Readonly<Record<StudioFoleyPresetId, StudioFoleyMixerPreset>> = Object.freeze({
  "quiet-atelier": Object.freeze({
    id: "quiet-atelier", labelKo: "차분한 아틀리에",
    descriptionKo: "작업 몰입을 돕는 절제된 종이 마찰음과 부드러운 도구 클릭",
    foley: 0.42, ui: 0.32, ambience: 0.14, muted: false,
  }),
  "lively-asmr": Object.freeze({
    id: "lively-asmr", labelKo: "생생한 ASMR",
    descriptionKo: "펜촉 스크래치·수채 물결·말풍선 톡 소리가 선명한 공방 음향",
    foley: 0.85, ui: 0.68, ambience: 0.32, muted: false,
  }),
  "silent-focus": Object.freeze({
    id: "silent-focus", labelKo: "무음 집중",
    descriptionKo: "모든 물리 Foley·UI 효과음·공간 잔향을 즉시 음소거",
    foley: 0, ui: 0, ambience: 0, muted: true,
  }),
});

export const STUDIO_FOLEY_SOUND_CHANNELS: Readonly<Record<StudioFoleySoundId, StudioFoleyChannelId>> = Object.freeze({
  "gpen-ink": "foley", "graphite-pencil": "foley", "watercolor-sable": "foley",
  "oil-impasto": "foley", airbrush: "foley", "eraser-scrub": "foley",
  "alcohol-marker": "foley", "charcoal-pastel": "foley", "sumi-ink-brush": "foley",
  "magnetic-detent": "ui", "bubble-pop": "ui", "panel-snap": "ui", "page-turn": "ui",
});

export interface StudioFoleyStrokeParams {
  readonly phase?: "contact" | "drag";
  readonly speed01?: number;
  readonly pressure01?: number;
  readonly tilt01?: number;
  readonly paperTexture?: StudioPaperTextureId;
}

export interface StudioFoleySynthesisProfile {
  readonly soundId: StudioFoleySoundId;
  readonly channel: StudioFoleyChannelId;
  readonly mode: "noise-band" | "dual-noise-tone" | "dual-formant-friction" | "tone-sweep" | "latch-transient";
  readonly filterType: BiquadFilterType;
  readonly baseFrequencyHz: number;
  readonly endFrequencyHz: number;
  readonly filterQ: number;
  readonly durationSec: number;
  readonly peakGain: number;
  readonly harmonicHz: number | null;
  readonly paperTexture: StudioPaperTextureId;
  readonly noiseTexture: StudioFoleyNoiseTexture;
  readonly bodyFrequencyHz: number | null;
  readonly bodyFilterQ: number | null;
  readonly bodyGainRatio: number;
  readonly stickSlipRateHz: number;
  readonly stickSlipDepth01: number;
  readonly attackRatio: number;
  readonly releaseRatio: number;
}

export interface StudioFoleyMixerState {
  readonly preset: StudioFoleyPresetId;
  readonly muted: boolean;
  readonly channels: Readonly<Record<StudioFoleyChannelId, number>>;
  readonly ambienceRunning: boolean;
}

export interface StudioFoleyTriggerResult {
  readonly played: boolean;
  readonly soundId: StudioFoleySoundId;
  readonly channel: StudioFoleyChannelId;
  readonly effectiveGain: number;
  readonly profile: StudioFoleySynthesisProfile;
  readonly reason: "played" | "muted" | "zero-gain" | "no-audio-context" | "rate-limited" | "suspended";
}

interface GrainVariation {
  readonly offsetSec: number;
  readonly pitchRate: number;
  readonly formantScale: number;
  readonly qScale: number;
  readonly gainJitter: number;
  readonly stickSlipPhaseRad: number;
}

const NOISE_SEEDS: Readonly<Record<StudioFoleyNoiseTexture, number>> = {
  velvet: 0x517cc1b7, pink: 0x9e3779b9, gritty: 0x85ebca6b,
};

const clamp = (v: number, min: number, max: number): number =>
  Number.isFinite(v) ? (v < min ? min : v > max ? max : v) : min;
const clamp01 = (v: number): number => clamp(v, 0, 1);

function setParamSafe(
  param: { value?: number; setValueAtTime?: (v: number, t: number) => void } | undefined,
  value: number,
  time: number,
): void {
  if (!param) return;
  try {
    if (typeof param.setValueAtTime === "function") param.setValueAtTime(value, time);
    else param.value = value;
  } catch { /* 부분 mock AudioParam 무시 */ }
}

/** 클릭 팝이 0인 raised-cosine(Hann) 어택·릴리즈에 속도·종이결 stick-slip 진폭 변조를 결합한다. */
export function buildRaisedCosineStickSlipEnvelope(
  peakGain: number,
  durationSec: number,
  attackRatio: number,
  releaseRatio: number,
  stickSlipRateHz: number,
  stickSlipDepth01: number,
  phaseRad = 0,
  sampleCount = 48,
): Float32Array {
  const count = Math.max(8, Math.trunc(sampleCount));
  const curve = new Float32Array(count);
  const safePeak = clamp(peakGain, 0, 1);
  const safeDur = Math.max(0.01, durationSec);
  const atk = clamp(attackRatio, 0.08, 0.45);
  const relStart = Math.max(atk, 1 - clamp(releaseRatio, 0.12, 0.55));
  const depth = clamp(stickSlipDepth01, 0, 0.82);
  const rate = clamp(stickSlipRateHz, 0, 160);

  for (let i = 1; i < count - 1; i += 1) {
    const u = i / (count - 1);
    const win =
      u < atk
        ? 0.5 * (1 - Math.cos(Math.PI * (u / atk)))
        : u > relStart
          ? 0.5 * (1 + Math.cos(Math.PI * ((u - relStart) / (1 - relStart))))
          : 1;
    let mod = 1;
    if (depth > 0.001 && rate > 0.5) {
      const t = u * safeDur;
      const tooth1 = 0.5 * (1 - Math.cos(2 * Math.PI * rate * t + phaseRad));
      const tooth2 = 0.5 * (1 - Math.cos(2 * Math.PI * rate * 1.6180339 * t + phaseRad * 1.7));
      mod = Math.max(0.22, 1 - depth * (0.68 * tooth1 + 0.32 * tooth2));
    }
    curve[i] = safePeak * win * mod;
  }
  return curve;
}

/** 짧은 나무 책상·공방 초기 반사음(85ms) 임펄스 응답 샘플을 결정론적으로 생성한다. */
export function synthesizeAtelierRoomImpulseResponse(sampleRate: number): Float32Array {
  const sr = Math.max(8000, Math.trunc(sampleRate || 44100));
  const length = Math.max(256, Math.round(sr * ATELIER_ROOM_IR_SEC));
  const ir = new Float32Array(length);
  const earlyTaps: readonly (readonly [number, number])[] = [
    [2.4, 0.46], [5.7, -0.31], [9.8, 0.24], [15.3, -0.18],
    [22.6, 0.135], [31.8, -0.095], [44.5, 0.06], [61.0, -0.032],
  ];
  for (const [delayMs, amp] of earlyTaps) {
    const idx = Math.round((delayMs / 1000) * sr);
    if (idx >= 0 && idx < length) {
      ir[idx] = (ir[idx] ?? 0) + amp;
      if (idx + 1 < length) ir[idx + 1] = (ir[idx + 1] ?? 0) + amp * 0.32;
      if (idx + 2 < length) ir[idx + 2] = (ir[idx + 2] ?? 0) + amp * 0.12;
    }
  }
  let seed = 0x243f6a88;
  let lp = 0;
  for (let i = 0; i < length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    lp = lp * 0.74 + ((seed / 4294967296) * 2 - 1) * 0.26;
    const fadeOut = i > length - 64 ? (length - 1 - i) / 64 : 1;
    ir[i] = clamp(((ir[i] ?? 0) + lp * Math.exp(-(i / sr) / 0.022) * 0.042) * fadeOut, -0.95, 0.95);
  }
  return ir;
}

/** 사운드 종류·속도·필압·기울기·5종 종이 질감을 결정론적 Web Audio 물리 파라미터로 계산한다. */
export function computeFoleySynthesisProfile(
  soundId: StudioFoleySoundId,
  params: StudioFoleyStrokeParams = {},
): StudioFoleySynthesisProfile {
  const v = clamp01(params.speed01 ?? 0.52);
  const p = clamp01(params.pressure01 ?? 0.56);
  const tilt = clamp01(params.tilt01 ?? 0.22);
  const paper = getPaperToothProfile(params.paperTexture ?? "manga-kent");
  const channel = STUDIO_FOLEY_SOUND_CHANNELS[soundId];
  const grainFactor = 0.84 + paper.acousticBrightness01 * 0.26;
  const toothDrag = 0.72 + paper.toothDepth01 * 0.52;

  const contact = channel === "foley" && params.phase === "contact";
  const drag = channel === "foley" && params.phase === "drag";
  const motionGain = drag ? 0.26 + 0.84 * Math.sqrt(v) : contact ? 0.66 : 1;

  const make = (
    mode: StudioFoleySynthesisProfile["mode"],
    filterType: BiquadFilterType,
    baseHz: number, endHz: number, q: number, dur: number, gain: number, harmonicHz: number | null,
    noiseTexture: StudioFoleyNoiseTexture, bodyHz: number | null, bodyQ: number | null, bodyRatio: number,
    slipRate: number, slipDepth: number, atk = 0.25, rel = 0.44,
  ): StudioFoleySynthesisProfile => ({
    soundId, channel, mode, filterType, paperTexture: paper.id, noiseTexture,
    baseFrequencyHz: Math.round(clamp(baseHz, 80, 12000)),
    endFrequencyHz: Math.round(clamp(endHz, 60, 12000)),
    filterQ: Number(clamp(q, 0.5, 9).toFixed(2)),
    durationSec: Number(clamp(contact ? dur * 0.55 : dur, 0.018, 0.35).toFixed(3)),
    peakGain: Number(clamp01(gain * motionGain).toFixed(3)),
    harmonicHz: harmonicHz === null ? null : Math.round(harmonicHz),
    bodyFrequencyHz: bodyHz === null ? null : Math.round(bodyHz),
    bodyFilterQ: bodyQ === null ? null : Number(bodyQ.toFixed(2)),
    bodyGainRatio: Number(clamp(bodyRatio, 0, 1.2).toFixed(3)),
    stickSlipRateHz: Number(clamp(slipRate, 0, 140).toFixed(1)),
    stickSlipDepth01: Number(clamp(slipDepth, 0, 0.85).toFixed(3)),
    attackRatio: Number(clamp(contact ? 0.14 : atk, 0.08, 0.45).toFixed(2)),
    releaseRatio: Number(clamp(rel, 0.12, 0.55).toFixed(2)),
  });

  switch (soundId) {
    case "gpen-ink": { // 금속 촉 2.6~5.0kHz 미세 스크래치 + 펜대/잉크 흐름 중저역 공명
      const baseHz = (2420 + v * 1580 + p * 440) * grainFactor;
      return make(
        "dual-formant-friction", "bandpass", baseHz, baseHz * (0.88 - v * 0.04),
        3.1 + (1 - tilt) * 1.9 + paper.toothDepth01 * 1.1, 0.054 + (1 - v) * 0.036,
        0.16 + p * 0.32 + v * 0.18, null, "gritty", 720 + p * 260 + v * 140, 2.4, 0.36 + p * 0.14,
        18 + v * 62 * (0.55 + paper.toothDepth01 * 0.65), 0.22 + paper.toothDepth01 * 0.34, 0.24, 0.42,
      );
    }
    case "graphite-pencil": { // 흑연 사각거림 + 420Hz 나무 배럴 공명 + 기울기 음영 마찰
      const baseHz = (1140 + paper.grainFrequencyHz * 0.72 + v * 860) * (1 - tilt * 0.32);
      return make(
        "dual-formant-friction", "bandpass", baseHz, baseHz * 0.87,
        2.6 + paper.toothDepth01 * 2.4 - tilt * 1.25, 0.072 + tilt * 0.042,
        (0.18 + p * 0.34 + tilt * 0.16) * toothDrag, null, "pink", 410 + (1 - tilt) * 48 + p * 36, 3.6, 0.44 + tilt * 0.18,
        14 + v * 48 * (0.5 + paper.toothDepth01 * 0.8), 0.26 + paper.toothDepth01 * 0.38 + tilt * 0.12, 0.26, 0.44,
      );
    }
    case "watercolor-sable": // 모래 긁힘 0, 실키한 젖은 모필 저중역 속삭임
      return make(
        "dual-formant-friction", "lowpass", 390 + v * 450 + paper.absorbency01 * 180, 280 + v * 280,
        0.72 + paper.capillarySpread01 * 0.36, 0.115 + (1 - v) * 0.065,
        0.14 + p * 0.22 + v * 0.15, null, "velvet", 210 + v * 110 + paper.absorbency01 * 65, 1.1, 0.4,
        8 + v * 22, 0.05 + paper.toothDepth01 * 0.07, 0.35, 0.48,
      );
    case "alcohol-marker": { // 촉촉한 펠트팁 1.1~2.1kHz 마찰-글라이드 포먼트 + 미세 본체 공명
      const baseHz = 1130 + v * 660 + p * 170 + paper.acousticBrightness01 * 125;
      return make(
        "dual-formant-friction", "bandpass", baseHz, baseHz * 0.92,
        1.9 + (1 - tilt) * 0.85, 0.084 + (1 - v) * 0.038, 0.16 + p * 0.24 + v * 0.16, null, "velvet",
        490 + p * 110 + (1 - tilt) * 40, 3.1, 0.36, 11 + v * 30, 0.08 + paper.toothDepth01 * 0.13, 0.28, 0.44,
      );
    }
    case "charcoal-pastel": { // 거친 목탄/초크 섬유질 드래그 + 바스락거리는 미세 입자 크래클
      const baseHz = (960 + paper.grainFrequencyHz * 0.56 + v * 960) * (1 - tilt * 0.22);
      return make(
        "dual-formant-friction", "bandpass", baseHz, baseHz * 0.84,
        1.15 + paper.toothDepth01 * 1.1 - tilt * 0.35, 0.088 + tilt * 0.045,
        (0.2 + p * 0.34 + tilt * 0.16) * toothDrag, null, "gritty", 260 + p * 130 + paper.toothDepth01 * 90, 1.6, 0.58 + tilt * 0.16,
        12 + v * 46 * (0.6 + paper.toothDepth01 * 0.9), 0.42 + paper.toothDepth01 * 0.34 + tilt * 0.1, 0.22, 0.42,
      );
    }
    case "sumi-ink-brush": // 촉촉한 동양화 붓모 저중역 쓸림 + 모세관 유체 스윕
      return make(
        "dual-formant-friction", "bandpass", 360 + v * 420 + (1 - p) * 140 + paper.absorbency01 * 120,
        280 + v * 280, 1.15 + p * 0.55, 0.108 + (1 - v) * 0.06, 0.16 + p * 0.24 + v * 0.18, null, "velvet",
        1140 + v * 420 + paper.toothDepth01 * 240, 1.8, 0.28 + (1 - p) * 0.14,
        10 + v * 34 * (0.5 + paper.toothDepth01 * 0.6), 0.12 + paper.toothDepth01 * 0.2, 0.3, 0.48,
      );
    case "oil-impasto": // 점성 높은 버터 스크래프 + 리넨 캔버스 직조 저역
      return make(
        "dual-formant-friction", "bandpass", 560 + p * 360 + v * 340 + paper.toothDepth01 * 180,
        400 + p * 220, 2.1 + p * 1.4, 0.095 + p * 0.05, (0.2 + p * 0.34 + tilt * 0.14) * toothDrag, null, "gritty",
        165 + p * 75 + paper.toothDepth01 * 55, 2.8, 0.64 + p * 0.14,
        10 + v * 38 * (0.6 + paper.toothDepth01 * 0.7), 0.34 + paper.toothDepth01 * 0.3 + p * 0.12, 0.26, 0.44,
      );
    case "airbrush":
      return make(
        "dual-formant-friction", "highpass", 1820 + p * 1120 + v * 680, 1580 + p * 840,
        0.72 + v * 0.45, 0.124 + p * 0.056, 0.11 + p * 0.26, null, "velvet",
        920 + p * 340, 1.4, 0.22, 6 + v * 12, 0.04, 0.34, 0.46,
      );
    case "eraser-scrub": // 고무-종이 이중 대역 슥슥 마찰
      return make(
        "dual-formant-friction", "bandpass", 820 + v * 840 + paper.frictionCoeff * 380, 620 + v * 480,
        2.4 + paper.frictionCoeff * 1.4, 0.078 + (1 - v) * 0.032, (0.18 + p * 0.3 + v * 0.18) * toothDrag, null, "pink",
        290 + v * 170 + p * 110, 2.2, 0.56 + p * 0.16,
        14 + v * 40 * (0.6 + paper.frictionCoeff * 0.6), 0.3 + paper.frictionCoeff * 0.28, 0.25, 0.42,
      );
    case "magnetic-detent":
      return make("tone-sweep", "highpass", 1380 + v * 320, 340, 1.4, 0.024, 0.24 + p * 0.16, 2420, "pink", null, null, 0, 0, 0, 0.14, 0.52);
    case "bubble-pop":
      return make("tone-sweep", "bandpass", 260, 820 + p * 210, 2.1, 0.062, 0.28 + p * 0.18, 520, "velvet", null, null, 0, 0, 0, 0.16, 0.52);
    case "panel-snap":
      return make("latch-transient", "bandpass", 2200, 620, 3.0, 0.044, 0.32 + p * 0.16, 210, "pink", null, null, 0, 0, 0, 0.14, 0.5);
    case "page-turn":
      return make(
        "noise-band", "bandpass", 540 + paper.acousticBrightness01 * 240, 1880 + paper.acousticBrightness01 * 560,
        1.5, 0.185, 0.22 + v * 0.22, null, "pink", null, null, 0, 8 + v * 14, 0.1, 0.24, 0.46,
      );
  }
}

export interface StudioFoleyAudioEngineOptions {
  readonly initialPreset?: StudioFoleyPresetId;
  readonly audioContextFactory?: () => AudioContext | null;
  readonly minTriggerIntervalMs?: number;
  readonly nowMs?: () => number;
}

function defaultAudioContextFactory(): AudioContext | null {
  if (typeof globalThis === "undefined") return null;
  const host = globalThis as typeof globalThis & { readonly webkitAudioContext?: typeof AudioContext };
  const Ctor = host.AudioContext ?? host.webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  try { return new Ctor(); } catch { return null; }
}

export class StudioFoleyAudioEngine {
  private readonly contextFactory: () => AudioContext | null;
  private readonly minTriggerIntervalMs: number;
  private readonly nowMs: () => number;

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private limiterNode: DynamicsCompressorNode | null = null;
  private roomSendGain: GainNode | null = null;
  private roomConvolver: ConvolverNode | null = null;
  private roomReturnFilter: BiquadFilterNode | null = null;
  private channelGains: Record<StudioFoleyChannelId, GainNode> | null = null;
  private readonly noiseBuffers = new Map<StudioFoleyNoiseTexture, AudioBuffer>();
  private friction: StudioLiveFrictionVoice | null = null;
  private ambienceSource: AudioBufferSourceNode | null = null;
  private ambienceFilter: BiquadFilterNode | null = null;
  private activeVoiceCleanups = new Set<() => void>();
  private resumeInFlight = false;
  private disposed = false;
  private grainSequence = 0;

  private preset: StudioFoleyPresetId;
  private muted: boolean;
  private channels: Record<StudioFoleyChannelId, number>;
  private lastTriggerAtMs = new Map<StudioFoleySoundId, number>();

  constructor(options: StudioFoleyAudioEngineOptions = {}) {
    this.contextFactory = options.audioContextFactory ?? defaultAudioContextFactory;
    this.minTriggerIntervalMs = Math.max(0, options.minTriggerIntervalMs ?? 16);
    this.nowMs = options.nowMs ?? (() => Date.now());
    const initial = STUDIO_FOLEY_PRESETS[options.initialPreset ?? "quiet-atelier"];
    this.preset = initial.id;
    this.muted = initial.muted;
    this.channels = { foley: initial.foley, ui: initial.ui, ambience: initial.ambience };
  }

  getPreset(): StudioFoleyPresetId { return this.preset; }

  getMixerState(): StudioFoleyMixerState {
    return { preset: this.preset, muted: this.muted, channels: { ...this.channels }, ambienceRunning: this.ambienceSource !== null };
  }

  applyPreset(presetId: StudioFoleyPresetId): StudioFoleyMixerState {
    const target = STUDIO_FOLEY_PRESETS[presetId];
    this.preset = target.id;
    this.muted = target.muted;
    this.channels = { foley: target.foley, ui: target.ui, ambience: target.ambience };
    this.syncGainNodes();
    if (this.muted) {
      this.endStroke();
      this.stopAmbience();
    }
    return this.getMixerState();
  }

  setChannelVolume(channel: StudioFoleyChannelId, volume01: number): StudioFoleyMixerState {
    this.channels[channel] = Number(clamp01(volume01).toFixed(3));
    if (this.channels[channel] > 0 && this.preset === "silent-focus" && !this.muted) this.preset = "quiet-atelier";
    this.syncGainNodes();
    return this.getMixerState();
  }

  setMuted(muted: boolean): StudioFoleyMixerState {
    this.muted = muted;
    this.syncGainNodes();
    if (muted) {
      this.endStroke();
      this.stopAmbience();
    }
    return this.getMixerState();
  }

  async unlock(): Promise<boolean> {
    if (this.disposed) return false;
    const ctx = this.ensureContext();
    if (!ctx) return false;
    if (ctx.state === "suspended" && typeof ctx.resume === "function") {
      try { await ctx.resume(); } catch { return false; }
    }
    return ctx.state === "running";
  }

  triggerSound(soundId: StudioFoleySoundId, params: StudioFoleyStrokeParams = {}): StudioFoleyTriggerResult {
    const profile = computeFoleySynthesisProfile(soundId, params);
    const channel = profile.channel;
    if (this.disposed || this.muted) {
      return { played: false, soundId, channel, effectiveGain: 0, profile, reason: "muted" };
    }
    const effectiveGain = Number((profile.peakGain * this.channels[channel]).toFixed(4));
    if (effectiveGain <= 0.0005) {
      return { played: false, soundId, channel, effectiveGain: 0, profile, reason: "zero-gain" };
    }
    const now = this.nowMs();
    const prevAt = this.lastTriggerAtMs.get(soundId);
    if (prevAt !== undefined && now - prevAt < this.minTriggerIntervalMs) {
      return { played: false, soundId, channel, effectiveGain, profile, reason: "rate-limited" };
    }
    const ctx = this.ensureContext();
    if (!ctx || !this.channelGains || ctx.state === "closed") {
      return { played: false, soundId, channel, effectiveGain, profile, reason: "no-audio-context" };
    }
    if (ctx.state === "suspended") {
      if (!this.resumeInFlight && typeof ctx.resume === "function") {
        this.resumeInFlight = true;
        void Promise.resolve(ctx.resume()).catch(() => undefined).finally(() => { this.resumeInFlight = false; });
      }
      return { played: false, soundId, channel, effectiveGain: 0, profile, reason: "suspended" };
    }
    this.lastTriggerAtMs.set(soundId, now);
    if (params.phase === "drag" && profile.mode === "dual-formant-friction") {
      if (this.friction?.soundId !== soundId || !this.friction.isLive()) {
        this.endStroke();
        const buffer = this.ensureNoiseBuffer(ctx, profile.noiseTexture);
        const variation = this.computeGrainVariation(soundId, STUDIO_FOLEY_NOISE_BUFFER_SEC, 0);
        const voice = new StudioLiveFrictionVoice(ctx, this.channelGains[channel], buffer, profile, variation.offsetSec, () => {
          this.activeVoiceCleanups.delete(cleanup);
          if (this.friction === voice) this.friction = null;
        });
        const cleanup = () => voice.dispose();
        this.activeVoiceCleanups.add(cleanup);
        this.friction = voice;
      }
      this.friction.move(profile, clamp01(params.speed01 ?? 0.52));
    } else {
      this.synthesizeVoice(ctx, this.channelGains[channel], profile);
    }
    return { played: true, soundId, channel, effectiveGain, profile, reason: "played" };
  }

  endStroke(): void {
    this.friction?.release();
    this.friction = null;
  }

  startAmbience(): boolean {
    if (this.disposed || this.muted || this.channels.ambience <= 0) return false;
    if (this.ambienceSource) return true;
    const ctx = this.ensureContext();
    if (!ctx || !this.channelGains) return false;

    const src = ctx.createBufferSource();
    src.buffer = this.ensureNoiseBuffer(ctx, "velvet");
    src.loopStart = 256 / ctx.sampleRate;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(320, ctx.currentTime);
    filter.Q.setValueAtTime(0.65, ctx.currentTime);
    src.connect(filter);
    filter.connect(this.channelGains.ambience);
    src.start(ctx.currentTime);
    this.ambienceSource = src;
    this.ambienceFilter = filter;
    return true;
  }

  stopAmbience(): void {
    for (const node of [this.ambienceSource, this.ambienceFilter]) {
      if (!node) continue;
      if ("stop" in node) { try { node.stop(); } catch { /* 이미 정지됨 */ } }
      try { node.disconnect(); } catch { /* 이미 해제됨 */ }
    }
    this.ambienceSource = null;
    this.ambienceFilter = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.resumeInFlight = false;
    this.stopAmbience();
    for (const cleanupVoice of [...this.activeVoiceCleanups]) cleanupVoice();
    this.activeVoiceCleanups.clear();
    this.lastTriggerAtMs.clear();

    const busNodes: readonly (AudioNode | null)[] = [
      ...(this.channelGains ? Object.values(this.channelGains) : []),
      this.roomSendGain, this.roomConvolver, this.roomReturnFilter, this.masterGain, this.limiterNode,
    ];
    for (const node of busNodes) {
      if (!node) continue;
      try { node.disconnect(); } catch { /* 이미 해제됨 */ }
    }
    this.channelGains = null;
    this.roomSendGain = null;
    this.roomConvolver = null;
    this.roomReturnFilter = null;
    this.masterGain = null;
    this.limiterNode = null;
    if (this.ctx && typeof this.ctx.close === "function") {
      void Promise.resolve(this.ctx.close()).catch(() => undefined);
    }
    this.ctx = null;
    this.noiseBuffers.clear();
    this.friction = null;
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const created = this.contextFactory();
    if (!created) return null;
    this.ctx = created;

    const master = created.createGain();
    const foley = created.createGain();
    const ui = created.createGain();
    const ambience = created.createGain();
    foley.connect(master);
    ui.connect(master);
    ambience.connect(master);

    if (typeof created.createConvolver === "function") {
      try {
        const convolver = created.createConvolver();
        const sr = Math.max(8000, created.sampleRate || 44100);
        const irSamples = synthesizeAtelierRoomImpulseResponse(sr);
        const irBuffer = created.createBuffer(1, irSamples.length, sr);
        irBuffer.getChannelData(0).set(irSamples);
        convolver.buffer = irBuffer;
        const roomSend = created.createGain();
        setParamSafe(roomSend.gain, 0.18, created.currentTime);
        const roomReturn = created.createBiquadFilter();
        roomReturn.type = "lowpass";
        setParamSafe(roomReturn.frequency, 3600, created.currentTime);
        setParamSafe(roomReturn.Q, 0.7, created.currentTime);
        foley.connect(roomSend);
        ui.connect(roomSend);
        roomSend.connect(convolver);
        convolver.connect(roomReturn);
        roomReturn.connect(master);
        this.roomSendGain = roomSend;
        this.roomConvolver = convolver;
        this.roomReturnFilter = roomReturn;
      } catch { /* mock/제한 환경 드라이 버스 유지 */ }
    }

    let wiredLimiter = false;
    if (typeof created.createDynamicsCompressor === "function") {
      try {
        const limiter = created.createDynamicsCompressor();
        const t = created.currentTime;
        setParamSafe(limiter.threshold, -12, t);
        setParamSafe(limiter.knee, 18, t);
        setParamSafe(limiter.ratio, 8, t);
        setParamSafe(limiter.attack, 0.003, t);
        setParamSafe(limiter.release, 0.12, t);
        master.connect(limiter);
        limiter.connect(created.destination);
        this.limiterNode = limiter;
        wiredLimiter = true;
      } catch { wiredLimiter = false; }
    }
    if (!wiredLimiter) master.connect(created.destination);

    this.masterGain = master;
    this.channelGains = { foley, ui, ambience };
    this.syncGainNodes();
    return created;
  }

  private syncGainNodes(): void {
    if (!this.ctx || !this.masterGain || !this.channelGains) return;
    const t = this.ctx.currentTime;
    this.masterGain.gain.setValueAtTime(this.muted ? 0 : 1, t);
    this.channelGains.foley.gain.setValueAtTime(this.channels.foley, t);
    this.channelGains.ui.gain.setValueAtTime(this.channels.ui, t);
    this.channelGains.ambience.gain.setValueAtTime(this.channels.ambience * 0.25, t);
  }

  private ensureNoiseBuffer(ctx: AudioContext, texture: StudioFoleyNoiseTexture): AudioBuffer {
    const cached = this.noiseBuffers.get(texture);
    if (cached) return cached;
    const sampleRate = Math.max(8000, ctx.sampleRate || 44100);
    const length = Math.round(sampleRate * STUDIO_FOLEY_NOISE_BUFFER_SEC);
    const buffer = ctx.createBuffer(1, length, sampleRate);
    fillTextureNoiseBuffer(buffer.getChannelData(0), texture, NOISE_SEEDS[texture], sampleRate);
    this.noiseBuffers.set(texture, buffer);
    return buffer;
  }

  private computeGrainVariation(soundId: StudioFoleySoundId, bufferDurSec: number, grainDurSec: number): GrainVariation {
    this.grainSequence = (this.grainSequence + 1) >>> 0;
    let h = (Math.imul(this.grainSequence, 0x9e3779b1) ^ 0x85ebca6b) >>> 0;
    for (let i = 0; i < soundId.length; i += 1) h = Math.imul(h ^ soundId.charCodeAt(i), 0x27d4eb2d) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
    h = (h ^ (h >>> 13)) >>> 0;

    // 황금비 라운드-로빈 + 결정론적 해시 섭동으로 연속 그레인 간 오프셋 겹침·offset=0 반복 제거
    const usableSpan = Math.max(0, bufferDurSec - grainDurSec - 0.08);
    const goldenPos = (this.grainSequence * 0.6180339887498949 + (h & 0xffff) / 655360) % 1;
    const offsetSec = usableSpan > 0 ? Number((goldenPos * usableSpan).toFixed(4)) : 0;
    const u1 = (h & 0xff) / 127.5 - 1;
    const u2 = ((h >>> 8) & 0xff) / 127.5 - 1;
    const u3 = ((h >>> 16) & 0xff) / 127.5 - 1;
    const u4 = ((h >>> 24) & 0xff) / 127.5 - 1;
    return {
      offsetSec,
      pitchRate: Number((1 + u1 * 0.032).toFixed(4)),
      formantScale: Number((1 + u2 * 0.035).toFixed(4)),
      qScale: Number((1 + u3 * 0.04).toFixed(4)),
      gainJitter: Number((1 + u4 * 0.045).toFixed(4)),
      stickSlipPhaseRad: ((h >>> 24) / 256) * Math.PI * 2,
    };
  }

  private scheduleGrainEnvelope(env: GainNode, startTime: number, profile: StudioFoleySynthesisProfile, variation: GrainVariation): void {
    const dur = profile.durationSec;
    const peak = clamp(profile.peakGain * variation.gainJitter, 0.001, 1);
    const curve = buildRaisedCosineStickSlipEnvelope(
      peak, dur, profile.attackRatio, profile.releaseRatio,
      profile.stickSlipRateHz, profile.stickSlipDepth01, variation.stickSlipPhaseRad,
    );
    if (typeof env.gain.setValueCurveAtTime === "function") {
      try { env.gain.setValueCurveAtTime(curve, startTime, dur); return; } catch { /* 선형 폴백 */ }
    }
    env.gain.setValueAtTime(0.0001, startTime);
    env.gain.linearRampToValueAtTime(peak, startTime + dur * profile.attackRatio);
    const midIdx = Math.min(curve.length - 2, Math.max(1, Math.round(curve.length * 0.56)));
    env.gain.linearRampToValueAtTime(Math.max(0.0002, curve[midIdx] ?? peak * 0.85), startTime + dur * 0.56);
    env.gain.linearRampToValueAtTime(Math.max(0.0002, peak * 0.72), startTime + dur * (1 - profile.releaseRatio));
    env.gain.linearRampToValueAtTime(0.0001, startTime + dur);
  }

  private synthesizeVoice(ctx: AudioContext, destination: GainNode, profile: StudioFoleySynthesisProfile): void {
    const startTime = ctx.currentTime;
    const endTime = startTime + profile.durationSec;
    const buffer = profile.mode !== "tone-sweep" ? this.ensureNoiseBuffer(ctx, profile.noiseTexture) : null;
    const variation = this.computeGrainVariation(profile.soundId, STUDIO_FOLEY_NOISE_BUFFER_SEC, profile.durationSec);

    const env = ctx.createGain();
    this.scheduleGrainEnvelope(env, startTime, profile, variation);
    env.connect(destination);

    const ownedNodes = new Set<AudioNode>([env]);
    const safeDisconnect = (node: AudioNode | null | undefined): void => {
      if (!node || !ownedNodes.has(node)) return;
      ownedNodes.delete(node);
      try { node.disconnect(); } catch { /* 이미 해제됨 */ }
    };

    let pendingSources = 0;
    let voiceCleaned = false;
    const cleanupVoice = (): void => {
      if (voiceCleaned) return;
      voiceCleaned = true;
      this.activeVoiceCleanups.delete(cleanupVoice);
      for (const node of [...ownedNodes]) safeDisconnect(node);
    };
    const onSourceEnded = (sourceNodes: readonly AudioNode[]): void => {
      for (const node of sourceNodes) safeDisconnect(node);
      pendingSources = Math.max(0, pendingSources - 1);
      if (pendingSources === 0) cleanupVoice();
    };
    this.activeVoiceCleanups.add(cleanupVoice);

    if (buffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      setParamSafe(noise.playbackRate, variation.pitchRate, startTime);

      const primaryFilter = ctx.createBiquadFilter();
      primaryFilter.type = profile.filterType;
      primaryFilter.frequency.setValueAtTime(clamp(profile.baseFrequencyHz * variation.formantScale, 60, 12000), startTime);
      primaryFilter.frequency.exponentialRampToValueAtTime(clamp(profile.endFrequencyHz * variation.formantScale, 60, 12000), endTime);
      primaryFilter.Q.setValueAtTime(clamp(profile.filterQ * variation.qScale, 0.5, 9), startTime);

      noise.connect(primaryFilter);
      primaryFilter.connect(env);
      const voiceChain: AudioNode[] = [noise, primaryFilter];
      ownedNodes.add(noise);
      ownedNodes.add(primaryFilter);

      if (profile.mode === "dual-formant-friction" && profile.bodyFrequencyHz !== null && profile.bodyFilterQ !== null && profile.bodyGainRatio > 0.01) {
        const bodyFilter = ctx.createBiquadFilter();
        bodyFilter.type = "bandpass";
        const bodyHz = clamp(profile.bodyFrequencyHz * variation.formantScale, 80, 6000);
        bodyFilter.frequency.setValueAtTime(bodyHz, startTime);
        bodyFilter.frequency.exponentialRampToValueAtTime(Math.max(70, bodyHz * 0.9), endTime);
        bodyFilter.Q.setValueAtTime(clamp(profile.bodyFilterQ * variation.qScale, 0.6, 8), startTime);
        const bodyGain = ctx.createGain();
        bodyGain.gain.setValueAtTime(profile.bodyGainRatio, startTime);
        noise.connect(bodyFilter);
        bodyFilter.connect(bodyGain);
        bodyGain.connect(env);
        voiceChain.push(bodyFilter, bodyGain);
        ownedNodes.add(bodyFilter);
        ownedNodes.add(bodyGain);
      }

      pendingSources += 1;
      noise.onended = () => { noise.onended = null; onSourceEnded(voiceChain); };
      noise.start(startTime, variation.offsetSec);
      noise.stop(endTime + 0.012);
    }

    // 오실레이터는 UI 촉각음에만 순수 sine 감쇠파로 사용(드로잉 매체 raw triangle 버즈 0)
    if (profile.mode === "tone-sweep" || profile.mode === "latch-transient" || profile.mode === "dual-noise-tone") {
      const osc = ctx.createOscillator();
      const toneGain = ctx.createGain();
      osc.type = "sine";
      const startHz = Math.max(60, profile.harmonicHz ?? profile.baseFrequencyHz);
      const stopHz = Math.max(60, profile.mode === "tone-sweep" ? profile.endFrequencyHz : startHz * 0.72);
      osc.frequency.setValueAtTime(startHz, startTime);
      osc.frequency.exponentialRampToValueAtTime(stopHz, endTime);
      toneGain.gain.setValueAtTime(profile.mode === "tone-sweep" ? 1 : 0.34, startTime);
      osc.connect(toneGain);
      toneGain.connect(env);
      ownedNodes.add(osc);
      ownedNodes.add(toneGain);
      pendingSources += 1;
      osc.onended = () => { osc.onended = null; onSourceEnded([osc, toneGain]); };
      osc.start(startTime);
      osc.stop(endTime + 0.012);
    }

    if (pendingSources === 0) cleanupVoice();
  }
}

export function createStudioFoleyAudioEngine(options: StudioFoleyAudioEngineOptions = {}): StudioFoleyAudioEngine {
  return new StudioFoleyAudioEngine(options);
}
