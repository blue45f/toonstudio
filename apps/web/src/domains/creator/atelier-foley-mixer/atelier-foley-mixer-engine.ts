/**
 * 화실 물리 사운드(Foley) & 공간 음향 마스터 믹서 순수 DSP 엔진 (Wave 43F).
 * - 5종 화구 마찰음 프로필(중심 주파수·Q·필압→게인 감마·속도→피치 시프트 계수)
 * - 4종 종이 지질 공명 프로필(고역 감쇠 LPF·섬유질 그레인 밀도·촉각 진동 강도)
 * - 4종 화실 앰비언스 사운드스케이프(채널별 믹스 가중치 · -24 LUFS 비방해 기준 · 클리핑 방지)
 * - 3종 촉각 UI 피드백 프리셋 + prefersReducedMotion / quietHours 자동 음소거 안전장치
 * - 순수 DSP 그래프 생성기 + jsdom 안전 Web Audio 원샷 프리뷰 + JSON 직렬화/역직렬화
 */

export type DrawingToolFoleyId =
  | "gpen-steel-scratch" | "graphite-2b-grain" | "alcohol-marker-squeak"
  | "watercolor-wet-wash" | "impasto-palette-knife";

export type PaperResonanceId = "kent-smooth" | "hanji-mulberry" | "coldpress-300g" | "sketch-tooth";

export type AtelierAmbienceId =
  | "rainy-night-atelier" | "hanok-timber-study" | "dawn-deadline-cafe" | "silent-focus";

export type TactileUiPresetId = "wood-brass-atelier" | "soft-paper-whisper" | "silent-off";

export type FoleySafetyGuardReason =
  | "master-muted" | "reduced-motion-mute" | "reduced-motion-attenuate" | "quiet-hours-mute" | "zero-volume";

export type ReducedMotionAudioPolicy = "mute" | "attenuate-soft";
export type FoleyPreviewKind = "stroke" | "ambience" | "tactile-ui";

export interface DrawingToolFoleyProfile {
  readonly id: DrawingToolFoleyId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly centerFrequencyHz: number; readonly qFactor: number;
  readonly pressureGainGamma: number; readonly velocityPitchShiftCoeff: number;
  readonly stickSlipRateHz: number; readonly transientSnap01: number;
  readonly baseGainLinear: number; readonly previewDurationMs: number;
}

export interface PaperResonanceProfile {
  readonly id: PaperResonanceId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly lpfCutoffHz: number; readonly fiberGrainDensity01: number;
  readonly tactileVibrationStrength01: number; readonly bodyResonanceHz: number;
  readonly resonanceQBoost: number;
}

export interface AtelierAmbienceChannelWeights {
  readonly foley: number; readonly ambience: number; readonly tactileUi: number; readonly roomReverb: number;
}

export interface AtelierAmbienceProfile {
  readonly id: AtelierAmbienceId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly targetLufs: number; readonly channelWeights: AtelierAmbienceChannelWeights;
  readonly defaultMixLevels: Readonly<Record<AtelierAmbienceId, number>>;
  readonly ambienceCenterHz: number; readonly isSilentFocus: boolean;
}

export interface TactileUiPresetProfile {
  readonly id: TactileUiPresetId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly clickFrequencyHz: number; readonly overtoneFrequencyHz: number;
  readonly gainLinear: number; readonly clickDurationMs: number; readonly hapticPulseMs: number;
}

export interface QuietHoursWindow { readonly enabled: boolean; readonly startHour: number; readonly endHour: number }

export interface FoleySafetyContext {
  readonly masterVolume01: number; readonly muted: boolean;
  readonly prefersReducedMotion: boolean; readonly reducedMotionPolicy?: ReducedMotionAudioPolicy;
  readonly quietHours: QuietHoursWindow; readonly currentHour: number;
  readonly channelGain01?: number; readonly sourceGain01?: number;
}

export interface EffectiveFoleyGainResult {
  readonly effectiveGainLinear: number; readonly effectiveDb: number;
  readonly isAudible: boolean; readonly isMutedBySafety: boolean;
  readonly isQuietHoursActive: boolean; readonly activeGuards: readonly FoleySafetyGuardReason[];
}

export interface FoleyMixerConfig {
  readonly toolId: DrawingToolFoleyId; readonly paperId: PaperResonanceId;
  readonly ambienceId: AtelierAmbienceId;
  readonly ambienceLevels: Readonly<Record<AtelierAmbienceId, number>>;
  readonly tactilePresetId: TactileUiPresetId;
  readonly masterVolume01: number; readonly muted: boolean;
  readonly foleyBusGain01: number; readonly ambienceBusGain01: number; readonly tactileBusGain01: number;
  readonly prefersReducedMotion: boolean; readonly reducedMotionPolicy: ReducedMotionAudioPolicy;
  readonly quietHours: QuietHoursWindow; readonly currentHour: number;
}

export interface FoleyStrokeTelemetry { readonly pressure01?: number; readonly velocity01?: number }

export interface FoleyDspNodeSpec {
  readonly id: "noise-exciter" | "tool-bandpass" | "paper-lpf" | "ambience-bed" | "tactile-ui-bus" | "master-limiter";
  readonly labelKo: string; readonly frequencyHz: number | null; readonly qFactor: number | null;
  readonly gainLinear: number; readonly gainDb: number; readonly bypassed: boolean;
}

export interface FoleyDspEdgeSpec { readonly from: FoleyDspNodeSpec["id"]; readonly to: FoleyDspNodeSpec["id"] }

export interface FoleyDspGraph {
  readonly toolId: DrawingToolFoleyId; readonly paperId: PaperResonanceId;
  readonly ambienceId: AtelierAmbienceId; readonly tactilePresetId: TactileUiPresetId;
  readonly stroke: { readonly pressure01: number; readonly velocity01: number; readonly pressureCurveGain01: number };
  readonly friction: {
    readonly centerFrequencyHz: number; readonly qFactor: number; readonly lpfCutoffHz: number;
    readonly fiberGrainDensity01: number; readonly stickSlipRateHz: number;
    readonly tactileVibration01: number; readonly effectiveGainLinear: number; readonly effectiveDb: number;
  };
  readonly ambience: {
    readonly targetLufs: number; readonly estimatedLufs: number; readonly meetsNonIntrusiveTarget: boolean;
    readonly focusAttenuation01: number; readonly rawLayerSum: number; readonly antiClipScale: number;
    readonly clippingPrevented: boolean; readonly effectiveGainLinear: number; readonly effectiveDb: number;
    readonly activeBedContributions: Readonly<Record<AtelierAmbienceId, number>>;
  };
  readonly tactileUi: {
    readonly presetId: TactileUiPresetId; readonly clickFrequencyHz: number;
    readonly effectiveGainLinear: number; readonly effectiveDb: number; readonly hapticPulseMs: number;
  };
  readonly master: {
    readonly unclampedPeakLinear: number; readonly peakLinear: number; readonly peakDb: number;
    readonly limiterRatio: number; readonly clippingPrevented: boolean; readonly headroomDb: number;
  };
  readonly safety: EffectiveFoleyGainResult;
  readonly nodes: readonly FoleyDspNodeSpec[];
  readonly connections: readonly FoleyDspEdgeSpec[];
}

export interface FoleyMixerPresetPayload {
  readonly schema: typeof FOLEY_MIXER_PRESET_SCHEMA; readonly schemaVersion: 1;
  readonly name: string; readonly config: FoleyMixerConfig;
}

export type FoleyPresetParseResult =
  | { readonly ok: true; readonly preset: FoleyMixerPresetPayload; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly errorCode: "empty-input" | "invalid-json" | "invalid-schema" | "invalid-fields"; readonly messageKo: string; readonly messageEn: string };

export interface PreviewAudioParamLike { value: number; setValueAtTime?: (value: number, startTime: number) => void }
export interface PreviewAudioNodeLike { connect: (destination: unknown) => unknown; disconnect?: () => void }
export interface PreviewBiquadFilterLike extends PreviewAudioNodeLike { type: BiquadFilterType; frequency: PreviewAudioParamLike; Q: PreviewAudioParamLike }
export interface PreviewGainNodeLike extends PreviewAudioNodeLike { gain: PreviewAudioParamLike }
export interface PreviewBufferSourceLike extends PreviewAudioNodeLike { buffer: unknown; start: (when?: number) => void; stop: (when?: number) => void }
export interface PreviewOscillatorLike extends PreviewAudioNodeLike { type: OscillatorType; frequency: PreviewAudioParamLike; start: (when?: number) => void; stop: (when?: number) => void }
export interface PreviewAudioBufferLike { getChannelData: (channel: number) => Float32Array }

export interface PreviewAudioContextLike {
  readonly currentTime: number; readonly sampleRate: number; readonly destination: unknown;
  readonly state?: string; resume?: () => Promise<void> | void; close?: () => Promise<void> | void;
  createBuffer: (channels: number, length: number, sampleRate: number) => PreviewAudioBufferLike;
  createBufferSource: () => PreviewBufferSourceLike;
  createOscillator: () => PreviewOscillatorLike;
  createBiquadFilter: () => PreviewBiquadFilterLike;
  createGain: () => PreviewGainNodeLike;
}

export interface PreviewFoleySoundOptions {
  readonly kind?: FoleyPreviewKind; readonly durationMs?: number;
  readonly audioContextFactory?: () => PreviewAudioContextLike | null;
}

export interface FoleyPreviewResult {
  readonly status: "played" | "muted-noop" | "unavailable-noop" | "error-noop";
  readonly played: boolean;
  readonly kind: FoleyPreviewKind;
  readonly reason: "ok" | "safety-muted" | "zero-gain" | "no-audio-context" | "audio-error";
  readonly durationMs: number;
  readonly peakDb: number;
}

export const ATELIER_AMBIENCE_TARGET_LUFS = -24 as const;
export const MASTER_PEAK_CEILING_LINEAR = 0.94 as const;
export const AMBIENCE_PEAK_CEILING_LINEAR = 0.1778 as const;
export const SILENCE_FLOOR_DB = -96 as const;
export const FOLEY_MIXER_PRESET_SCHEMA = "toonstudio.atelier-foley-mixer.v1" as const;

export const DRAWING_TOOL_FOLEY_IDS: readonly DrawingToolFoleyId[] = Object.freeze([
  "gpen-steel-scratch", "graphite-2b-grain", "alcohol-marker-squeak",
  "watercolor-wet-wash", "impasto-palette-knife",
]);
export const PAPER_RESONANCE_IDS: readonly PaperResonanceId[] = Object.freeze([
  "kent-smooth", "hanji-mulberry", "coldpress-300g", "sketch-tooth",
]);
export const ATELIER_AMBIENCE_IDS: readonly AtelierAmbienceId[] = Object.freeze([
  "rainy-night-atelier", "hanok-timber-study", "dawn-deadline-cafe", "silent-focus",
]);
export const TACTILE_UI_PRESET_IDS: readonly TactileUiPresetId[] = Object.freeze([
  "wood-brass-atelier", "soft-paper-whisper", "silent-off",
]);
const AUDIBLE_AMBIENCE_IDS: readonly AtelierAmbienceId[] = Object.freeze([
  "rainy-night-atelier", "hanok-timber-study", "dawn-deadline-cafe",
]);

export const DRAWING_TOOL_FOLEY_PROFILES: Readonly<Record<DrawingToolFoleyId, DrawingToolFoleyProfile>> = Object.freeze({
  "gpen-steel-scratch": Object.freeze({
    id: "gpen-steel-scratch", labelKo: "G펜 스틸 스크래치", labelEn: "G-Pen Steel Scratch",
    summaryKo: "날카로운 스틸 펜촉이 지면을 긁는 선명한 고역 마찰과 탄성 스냅",
    summaryEn: "Crisp high-frequency steel nib scratch with elastic landing snap",
    centerFrequencyHz: 3420, qFactor: 3.8, pressureGainGamma: 0.85, velocityPitchShiftCoeff: 0.36,
    stickSlipRateHz: 78, transientSnap01: 0.88, baseGainLinear: 0.78, previewDurationMs: 190,
  }),
  "graphite-2b-grain": Object.freeze({
    id: "graphite-2b-grain", labelKo: "2B 흑연 연필 그레인", labelEn: "2B Graphite Grain",
    summaryKo: "부드러운 2B 흑연심이 종이 요철에 포근하게 스며드는 중역 사각거림",
    summaryEn: "Warm mid-band graphite friction rolling across paper tooth",
    centerFrequencyHz: 1680, qFactor: 1.65, pressureGainGamma: 1.22, velocityPitchShiftCoeff: 0.24,
    stickSlipRateHz: 52, transientSnap01: 0.38, baseGainLinear: 0.68, previewDurationMs: 220,
  }),
  "alcohol-marker-squeak": Object.freeze({
    id: "alcohol-marker-squeak", labelKo: "알코올 마커 펠트 스퀴크", labelEn: "Alcohol Marker Squeak",
    summaryKo: "펠트 닙이 빠르게 미끄러지며 좁은 대역의 공명 마찰음을 형성",
    summaryEn: "Narrow-Q resonant felt nib chirp shifting pitch rapidly with stroke speed",
    centerFrequencyHz: 2480, qFactor: 5.4, pressureGainGamma: 0.92, velocityPitchShiftCoeff: 0.44,
    stickSlipRateHz: 92, transientSnap01: 0.44, baseGainLinear: 0.62, previewDurationMs: 175,
  }),
  "watercolor-wet-wash": Object.freeze({
    id: "watercolor-wet-wash", labelKo: "수채 웻 워시 브러시", labelEn: "Watercolor Wet Wash",
    summaryKo: "물기를 머금은 세이블 모가 부드럽게 퍼지는 저중역 수분 스윕",
    summaryEn: "Broad low-mid fluid bristle sweep with gentle pressure build-up",
    centerFrequencyHz: 690, qFactor: 0.95, pressureGainGamma: 1.38, velocityPitchShiftCoeff: 0.15,
    stickSlipRateHz: 18, transientSnap01: 0.14, baseGainLinear: 0.56, previewDurationMs: 260,
  }),
  "impasto-palette-knife": Object.freeze({
    id: "impasto-palette-knife", labelKo: "임파스토 팔레트 나이프", labelEn: "Impasto Palette Knife",
    summaryKo: "두꺼운 유화 물감을 펴 바르는 묵직한 전단음과 탄성 블레이드 공명",
    summaryEn: "Dense pigment shear and spring-steel blade resonance under firm pressure",
    centerFrequencyHz: 1120, qFactor: 2.25, pressureGainGamma: 1.48, velocityPitchShiftCoeff: 0.28,
    stickSlipRateHz: 36, transientSnap01: 0.62, baseGainLinear: 0.84, previewDurationMs: 230,
  }),
});

export const PAPER_RESONANCE_PROFILES: Readonly<Record<PaperResonanceId, PaperResonanceProfile>> = Object.freeze({
  "kent-smooth": Object.freeze({
    id: "kent-smooth", labelKo: "켄트지 스무스 (200g)", labelEn: "Kent Smooth (200g)",
    summaryKo: "매끈한 표면으로 고역 선명도가 유지되고 마찰 진동이 절제된 원고지",
    summaryEn: "Smooth comic bristol preserving crisp highs with restrained tooth rumble",
    lpfCutoffHz: 7800, fiberGrainDensity01: 0.18, tactileVibrationStrength01: 0.26, bodyResonanceHz: 420, resonanceQBoost: 1.12,
  }),
  "hanji-mulberry": Object.freeze({
    id: "hanji-mulberry", labelKo: "닥나무 전통 한지", labelEn: "Mulberry Hanji",
    summaryKo: "긴 닥나무 섬유가 거친 고역을 포근히 감쇠하며 숨 쉬는 자연 공명",
    summaryEn: "Long mulberry fibers softly damping harsh highs with warm organic breath",
    lpfCutoffHz: 3450, fiberGrainDensity01: 0.78, tactileVibrationStrength01: 0.58, bodyResonanceHz: 310, resonanceQBoost: 0.94,
  }),
  "coldpress-300g": Object.freeze({
    id: "coldpress-300g", labelKo: "300g 중목 수채화지", labelEn: "Cold-Press 300g",
    summaryKo: "깊은 요철 골짜기가 풍부한 그레인 밀도와 묵직한 촉각 진동을 전달",
    summaryEn: "Deep cotton valleys delivering dense grain texture and rich tactile vibration",
    lpfCutoffHz: 4200, fiberGrainDensity01: 0.92, tactileVibrationStrength01: 0.86, bodyResonanceHz: 265, resonanceQBoost: 1.06,
  }),
  "sketch-tooth": Object.freeze({
    id: "sketch-tooth", labelKo: "스케치북 요철지 (150g)", labelEn: "Sketch Tooth (150g)",
    summaryKo: "연필·펜 드로잉 전반에 균형 잡힌 중역 요철감과 경쾌한 응답성",
    summaryEn: "Balanced everyday drawing tooth with responsive mid-band clarity",
    lpfCutoffHz: 5600, fiberGrainDensity01: 0.56, tactileVibrationStrength01: 0.52, bodyResonanceHz: 355, resonanceQBoost: 1.0,
  }),
});

export const ATELIER_AMBIENCE_PROFILES: Readonly<Record<AtelierAmbienceId, AtelierAmbienceProfile>> = Object.freeze({
  "rainy-night-atelier": Object.freeze({
    id: "rainy-night-atelier", labelKo: "빗소리 밤 화실", labelEn: "Rainy Night Atelier",
    summaryKo: "창밖 빗방울과 따뜻한 스탠드 아래 -24 LUFS 비방해 밤 화실",
    summaryEn: "Gentle window rain and warm room floor calibrated to -24 LUFS",
    targetLufs: ATELIER_AMBIENCE_TARGET_LUFS,
    channelWeights: Object.freeze({ foley: 0.88, ambience: 0.68, tactileUi: 0.46, roomReverb: 0.52 }),
    defaultMixLevels: Object.freeze({ "rainy-night-atelier": 0.62, "hanok-timber-study": 0.14, "dawn-deadline-cafe": 0, "silent-focus": 0 }),
    ambienceCenterHz: 540, isSilentFocus: false,
  }),
  "hanok-timber-study": Object.freeze({
    id: "hanok-timber-study", labelKo: "한옥 목재 서재", labelEn: "Hanok Timber Study",
    summaryKo: "마루 목재 잔향과 은은한 바람결이 펜촉 마찰음을 또렷이 받쳐주는 서재",
    summaryEn: "Warm timber reflections supporting crisp nib acoustics without fatigue",
    targetLufs: ATELIER_AMBIENCE_TARGET_LUFS,
    channelWeights: Object.freeze({ foley: 0.94, ambience: 0.48, tactileUi: 0.56, roomReverb: 0.4 }),
    defaultMixLevels: Object.freeze({ "rainy-night-atelier": 0.08, "hanok-timber-study": 0.56, "dawn-deadline-cafe": 0, "silent-focus": 0 }),
    ambienceCenterHz: 380, isSilentFocus: false,
  }),
  "dawn-deadline-cafe": Object.freeze({
    id: "dawn-deadline-cafe", labelKo: "새벽 마감 카페", labelEn: "Dawn Deadline Café",
    summaryKo: "새벽 에스프레소 머신 저음과 원거리 공간감이 마감 리듬을 유지",
    summaryEn: "Subtle dawn café room tone calibrated below -24 LUFS for deadline focus",
    targetLufs: ATELIER_AMBIENCE_TARGET_LUFS,
    channelWeights: Object.freeze({ foley: 0.82, ambience: 0.72, tactileUi: 0.38, roomReverb: 0.44 }),
    defaultMixLevels: Object.freeze({ "rainy-night-atelier": 0.1, "hanok-timber-study": 0, "dawn-deadline-cafe": 0.64, "silent-focus": 0 }),
    ambienceCenterHz: 620, isSilentFocus: false,
  }),
  "silent-focus": Object.freeze({
    id: "silent-focus", labelKo: "무음 집중 모드", labelEn: "Silent Focus",
    summaryKo: "모든 공간 앰비언스를 정숙 감쇠하고 필요한 마찰음만 최소 유지",
    summaryEn: "Attenuates all ambient layers to silence for zero-distraction drafting",
    targetLufs: ATELIER_AMBIENCE_TARGET_LUFS,
    channelWeights: Object.freeze({ foley: 0.76, ambience: 0, tactileUi: 0.2, roomReverb: 0 }),
    defaultMixLevels: Object.freeze({ "rainy-night-atelier": 0, "hanok-timber-study": 0, "dawn-deadline-cafe": 0, "silent-focus": 1 }),
    ambienceCenterHz: 240, isSilentFocus: true,
  }),
});

export const TACTILE_UI_PRESETS: Readonly<Record<TactileUiPresetId, TactileUiPresetProfile>> = Object.freeze({
  "wood-brass-atelier": Object.freeze({
    id: "wood-brass-atelier", labelKo: "원목·황동 아틀리에", labelEn: "Wood & Brass Atelier",
    summaryKo: "나무 다이얼 걸림감과 절제된 황동 디텐트 클릭 피드백",
    summaryEn: "Warm wooden dial detent paired with subtle brass overtone",
    clickFrequencyHz: 820, overtoneFrequencyHz: 2140, gainLinear: 0.42, clickDurationMs: 28, hapticPulseMs: 12,
  }),
  "soft-paper-whisper": Object.freeze({
    id: "soft-paper-whisper", labelKo: "종이 속삭임", labelEn: "Soft Paper Whisper",
    summaryKo: "장시간 원고 작업에도 피로가 적은 극저음량 종이 넘김 터치음",
    summaryEn: "Ultra-soft paper-brush UI whisper designed for marathon sessions",
    clickFrequencyHz: 1320, overtoneFrequencyHz: 2640, gainLinear: 0.22, clickDurationMs: 36, hapticPulseMs: 6,
  }),
  "silent-off": Object.freeze({
    id: "silent-off", labelKo: "촉각 UI 끄기", labelEn: "Tactile UI Off",
    summaryKo: "버튼·슬라이더 촉각 효과음을 완전히 비활성화",
    summaryEn: "Disables all tactile UI clicks and haptic cues",
    clickFrequencyHz: 0, overtoneFrequencyHz: 0, gainLinear: 0, clickDurationMs: 0, hapticPulseMs: 0,
  }),
});

const clamp = (v: number, min: number, max: number): number => (!Number.isFinite(v) ? min : v < min ? min : v > max ? max : v);
const clamp01 = (v: number): number => clamp(v, 0, 1);
const round2 = (v: number): number => Math.round(v * 100) / 100;
const round4 = (v: number): number => Math.round(v * 10000) / 10000;
const normalizeHour = (h: number): number => (Number.isFinite(h) ? ((Math.floor(h) % 24) + 24) % 24 : 0);

/** 선형 게인을 dBFS 수치로 변환한다(무음 하한 -96 dBFS). */
export function linearGainToDb(gainLinear: number): number {
  if (!Number.isFinite(gainLinear) || gainLinear <= 0.000016) return SILENCE_FLOOR_DB;
  return Math.max(SILENCE_FLOOR_DB, round2(20 * Math.log10(gainLinear)));
}

/** dB 수치를 선형 진폭 비율로 변환한다. */
export function dbToLinearGain(db: number): number {
  if (!Number.isFinite(db) || db <= SILENCE_FLOOR_DB) return 0;
  return Math.pow(10, db / 20);
}

/** 지정 시각(0..23)이 야간 정숙 시간대(quietHours)에 속하는지 판별한다. */
export function isHourInQuietWindow(hour: number, window: QuietHoursWindow): boolean {
  if (!window.enabled) return false;
  const current = normalizeHour(hour);
  const start = normalizeHour(window.startHour);
  const end = normalizeHour(window.endHour);
  if (start === end) return true;
  return start < end ? current >= start && current < end : current >= start || current < end;
}

/** 마스터 음소거·prefersReducedMotion·quietHours 안전장치를 반영한 실효 게인을 산출한다. */
export function resolveEffectiveFoleyGain(context: FoleySafetyContext): EffectiveFoleyGainResult {
  const master = clamp01(context.masterVolume01);
  const channel = clamp01(context.channelGain01 ?? 1);
  const source = clamp01(context.sourceGain01 ?? 1);
  const policy: ReducedMotionAudioPolicy = context.reducedMotionPolicy ?? "mute";
  const quietActive = isHourInQuietWindow(context.currentHour, context.quietHours);
  const guards: FoleySafetyGuardReason[] = [];

  if (context.muted) guards.push("master-muted");
  if (master <= 0 || channel <= 0 || source <= 0) guards.push("zero-volume");
  if (quietActive) guards.push("quiet-hours-mute");
  if (context.prefersReducedMotion) {
    guards.push(policy === "attenuate-soft" ? "reduced-motion-attenuate" : "reduced-motion-mute");
  }

  const hardSafetyMute = quietActive || (context.prefersReducedMotion && policy === "mute");
  if (context.muted || hardSafetyMute || master <= 0 || channel <= 0 || source <= 0) {
    return {
      effectiveGainLinear: 0, effectiveDb: SILENCE_FLOOR_DB, isAudible: false,
      isMutedBySafety: hardSafetyMute, isQuietHoursActive: quietActive, activeGuards: Object.freeze(guards),
    };
  }

  const motionMultiplier = context.prefersReducedMotion && policy === "attenuate-soft" ? 0.25 : 1;
  const preciseGain = clamp01(master * channel * source * motionMultiplier);
  return {
    effectiveGainLinear: round4(preciseGain), effectiveDb: linearGainToDb(preciseGain),
    isAudible: preciseGain > 0.0001, isMutedBySafety: false, isQuietHoursActive: false,
    activeGuards: Object.freeze(guards),
  };
}

/** 화실 마스터 믹서 초기 설정을 생성한다. */
export function createDefaultFoleyMixerConfig(): FoleyMixerConfig {
  return {
    toolId: "gpen-steel-scratch", paperId: "kent-smooth", ambienceId: "rainy-night-atelier",
    ambienceLevels: { ...ATELIER_AMBIENCE_PROFILES["rainy-night-atelier"].defaultMixLevels },
    tactilePresetId: "wood-brass-atelier", masterVolume01: 0.75, muted: false,
    foleyBusGain01: 0.8, ambienceBusGain01: 0.65, tactileBusGain01: 0.6,
    prefersReducedMotion: false, reducedMotionPolicy: "mute",
    quietHours: { enabled: false, startHour: 23, endHour: 7 }, currentHour: 15,
  };
}

/** 4종 화실 앰비언스 프리셋을 선택해 채널 믹서 슬라이더 기본 균형을 적용한다. */
export function applyAmbiencePresetToConfig(
  config: FoleyMixerConfig,
  ambienceId: AtelierAmbienceId,
): FoleyMixerConfig {
  return { ...config, ambienceId, ambienceLevels: { ...ATELIER_AMBIENCE_PROFILES[ambienceId].defaultMixLevels } };
}

/** 화구·종이·앰비언스·촉각 UI·안전장치 설정을 순수 결정론적 DSP 파라미터 그래프로 변환한다. */
export function computeFoleyDspGraph(config: FoleyMixerConfig, stroke?: FoleyStrokeTelemetry): FoleyDspGraph {
  const tool = DRAWING_TOOL_FOLEY_PROFILES[config.toolId];
  const paper = PAPER_RESONANCE_PROFILES[config.paperId];
  const ambienceProfile = ATELIER_AMBIENCE_PROFILES[config.ambienceId];
  const tactileProfile = TACTILE_UI_PRESETS[config.tactilePresetId];

  const pressure01 = clamp01(stroke?.pressure01 ?? 0.65);
  const velocity01 = clamp01(stroke?.velocity01 ?? 0.55);
  const safety = resolveEffectiveFoleyGain({
    masterVolume01: config.masterVolume01, muted: config.muted,
    prefersReducedMotion: config.prefersReducedMotion, reducedMotionPolicy: config.reducedMotionPolicy,
    quietHours: config.quietHours, currentHour: config.currentHour,
  });

  // 1. 화구 × 종이 마찰음 물리 파라미터
  const shiftedCenterHz = tool.centerFrequencyHz * (1 + (velocity01 - 0.5) * tool.velocityPitchShiftCoeff);
  const centerFrequencyHz = Math.round(clamp(shiftedCenterHz * (1 - paper.fiberGrainDensity01 * 0.14), 180, 12000));
  const qFactor = round2(clamp(tool.qFactor * paper.resonanceQBoost * (0.88 + 0.24 * (1 - pressure01 * 0.4)), 0.5, 10));
  const lpfCutoffHz = Math.round(clamp(paper.lpfCutoffHz * (0.92 + 0.16 * velocity01) * (1 - 0.05 * pressure01), 800, 16000));

  const pressureCurveGain01 = pressure01 <= 0 ? 0 : round4(Math.pow(pressure01, tool.pressureGainGamma));
  const velocityEnergy = 0.25 + 0.75 * Math.sqrt(velocity01);
  const grainExcitation = 0.78 + 0.34 * paper.fiberGrainDensity01;
  const rawFrictionGain = clamp01(
    tool.baseGainLinear * pressureCurveGain01 * velocityEnergy * grainExcitation *
      clamp01(config.foleyBusGain01) * ambienceProfile.channelWeights.foley,
  );
  const frictionEffectiveGain = round4(clamp01(rawFrictionGain * safety.effectiveGainLinear));
  const stickSlipRateHz = round2(tool.stickSlipRateHz * (0.55 + 0.9 * velocity01) * (0.7 + 0.6 * paper.fiberGrainDensity01));
  const tactileVibration01 = round2(
    safety.isAudible
      ? clamp01(paper.tactileVibrationStrength01 * (0.35 + 0.65 * pressureCurveGain01) * clamp01(config.masterVolume01))
      : 0,
  );

  // 2. 4종 화실 앰비언스 믹스 & -24 LUFS 클리핑 방지 정규화
  const silentFocusLevel = clamp01(config.ambienceLevels["silent-focus"]);
  const focusAttenuation01 = round2(1 - silentFocusLevel);
  const rawContributions: Record<AtelierAmbienceId, number> = {
    "rainy-night-atelier": 0, "hanok-timber-study": 0, "dawn-deadline-cafe": 0, "silent-focus": silentFocusLevel,
  };
  let rawLayerSum = 0;
  let rawLayerPower = 0;
  for (const id of AUDIBLE_AMBIENCE_IDS) {
    const weighted = clamp01(config.ambienceLevels[id]) * ATELIER_AMBIENCE_PROFILES[id].channelWeights.ambience;
    rawContributions[id] = round4(weighted);
    rawLayerSum += weighted;
    rawLayerPower += weighted * weighted;
  }
  const antiClipScale = rawLayerSum > 1 ? round4(1 / rawLayerSum) : 1;
  const ambienceClippingPrevented = rawLayerSum > 1;
  const normalizedAmbienceLevel = clamp01(
    Math.sqrt(rawLayerPower) * antiClipScale * focusAttenuation01 * clamp01(config.ambienceBusGain01),
  );
  const ambienceRmsLinear = normalizedAmbienceLevel * dbToLinearGain(ATELIER_AMBIENCE_TARGET_LUFS) * safety.effectiveGainLinear;
  const ambiencePeakLinear = round4(Math.min(AMBIENCE_PEAK_CEILING_LINEAR, ambienceRmsLinear * 2.5119));
  const ambienceEstimatedLufs =
    ambienceRmsLinear <= 0.000016
      ? SILENCE_FLOOR_DB
      : Math.min(ATELIER_AMBIENCE_TARGET_LUFS, linearGainToDb(ambienceRmsLinear));

  // 3. 촉각 UI 피드백 버스
  const rawTactileGain = clamp01(
    tactileProfile.gainLinear * clamp01(config.tactileBusGain01) *
      (ambienceProfile.isSilentFocus ? 0.5 : Math.max(0.35, ambienceProfile.channelWeights.tactileUi)),
  );
  const tactileEffectiveGain = round4(clamp01(rawTactileGain * safety.effectiveGainLinear));

  // 4. 마스터 버스 소프트 리미터 (0 dBFS 미만 헤드룸 강제 보장)
  const unclampedPeakLinear = round4(frictionEffectiveGain + ambiencePeakLinear + tactileEffectiveGain);
  const clippingPrevented = unclampedPeakLinear > MASTER_PEAK_CEILING_LINEAR;
  const limiterRatio = clippingPrevented ? round4(MASTER_PEAK_CEILING_LINEAR / unclampedPeakLinear) : 1;
  const peakLinear = clippingPrevented ? MASTER_PEAK_CEILING_LINEAR : unclampedPeakLinear;
  const peakDb = linearGainToDb(peakLinear);
  const headroomDb = peakLinear <= 0.000016 ? 96 : round2(Math.max(0, -peakDb));

  const nodes: readonly FoleyDspNodeSpec[] = Object.freeze([
    Object.freeze({ id: "noise-exciter", labelKo: "질감 노이즈 익사이터", frequencyHz: Math.round(stickSlipRateHz), qFactor: null, gainLinear: round2(velocityEnergy), gainDb: linearGainToDb(velocityEnergy), bypassed: !safety.isAudible || frictionEffectiveGain <= 0 }),
    Object.freeze({ id: "tool-bandpass", labelKo: "화구 마찰 대역 통과", frequencyHz: centerFrequencyHz, qFactor, gainLinear: frictionEffectiveGain, gainDb: linearGainToDb(frictionEffectiveGain), bypassed: !safety.isAudible || frictionEffectiveGain <= 0 }),
    Object.freeze({ id: "paper-lpf", labelKo: "종이 지질 고역 감쇠 LPF", frequencyHz: lpfCutoffHz, qFactor: 0.71, gainLinear: frictionEffectiveGain, gainDb: linearGainToDb(frictionEffectiveGain), bypassed: !safety.isAudible || frictionEffectiveGain <= 0 }),
    Object.freeze({ id: "ambience-bed", labelKo: "화실 앰비언스 -24 LUFS 버스", frequencyHz: ambienceProfile.ambienceCenterHz, qFactor: 0.8, gainLinear: ambiencePeakLinear, gainDb: ambienceEstimatedLufs, bypassed: !safety.isAudible || ambiencePeakLinear <= 0 }),
    Object.freeze({ id: "tactile-ui-bus", labelKo: "촉각 UI 피드백 버스", frequencyHz: tactileProfile.clickFrequencyHz || null, qFactor: tactileProfile.clickFrequencyHz > 0 ? 3.2 : null, gainLinear: tactileEffectiveGain, gainDb: linearGainToDb(tactileEffectiveGain), bypassed: !safety.isAudible || tactileEffectiveGain <= 0 }),
    Object.freeze({ id: "master-limiter", labelKo: "마스터 클리핑 방지 리미터", frequencyHz: null, qFactor: null, gainLinear: peakLinear, gainDb: peakDb, bypassed: !safety.isAudible }),
  ]);

  const connections: readonly FoleyDspEdgeSpec[] = Object.freeze([
    Object.freeze({ from: "noise-exciter", to: "tool-bandpass" }),
    Object.freeze({ from: "tool-bandpass", to: "paper-lpf" }),
    Object.freeze({ from: "paper-lpf", to: "master-limiter" }),
    Object.freeze({ from: "ambience-bed", to: "master-limiter" }),
    Object.freeze({ from: "tactile-ui-bus", to: "master-limiter" }),
  ]);

  return {
    toolId: config.toolId, paperId: config.paperId, ambienceId: config.ambienceId, tactilePresetId: config.tactilePresetId,
    stroke: { pressure01: round2(pressure01), velocity01: round2(velocity01), pressureCurveGain01 },
    friction: {
      centerFrequencyHz, qFactor, lpfCutoffHz, fiberGrainDensity01: paper.fiberGrainDensity01,
      stickSlipRateHz, tactileVibration01, effectiveGainLinear: frictionEffectiveGain, effectiveDb: linearGainToDb(frictionEffectiveGain),
    },
    ambience: {
      targetLufs: ATELIER_AMBIENCE_TARGET_LUFS, estimatedLufs: ambienceEstimatedLufs,
      meetsNonIntrusiveTarget: ambienceEstimatedLufs <= ATELIER_AMBIENCE_TARGET_LUFS,
      focusAttenuation01, rawLayerSum: round2(rawLayerSum), antiClipScale,
      clippingPrevented: ambienceClippingPrevented, effectiveGainLinear: ambiencePeakLinear,
      effectiveDb: linearGainToDb(ambiencePeakLinear), activeBedContributions: Object.freeze(rawContributions),
    },
    tactileUi: {
      presetId: config.tactilePresetId, clickFrequencyHz: tactileProfile.clickFrequencyHz,
      effectiveGainLinear: tactileEffectiveGain, effectiveDb: linearGainToDb(tactileEffectiveGain),
      hapticPulseMs: safety.isAudible && tactileEffectiveGain > 0 ? tactileProfile.hapticPulseMs : 0,
    },
    master: { unclampedPeakLinear, peakLinear, peakDb, limiterRatio, clippingPrevented, headroomDb },
    safety, nodes, connections,
  };
}

function createDefaultBrowserAudioContext(): PreviewAudioContextLike | null {
  if (typeof globalThis === "undefined") return null;
  const host = globalThis as unknown as {
    readonly AudioContext?: new () => PreviewAudioContextLike;
    readonly webkitAudioContext?: new () => PreviewAudioContextLike;
  };
  const Ctor = host.AudioContext ?? host.webkitAudioContext;
  if (typeof Ctor !== "function") return null;
  try { return new Ctor(); } catch { return null; }
}

function writeDeterministicNoiseSamples(samples: Float32Array, grainDensity01: number): void {
  let seed = 0x51a7c3d9;
  let pink = 0;
  for (let i = 0; i < samples.length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const white = (seed / 4294967296) * 2 - 1;
    pink = pink * 0.72 + white * 0.28;
    const u = samples.length > 1 ? i / (samples.length - 1) : 0.5;
    const hann = 0.5 * (1 - Math.cos(2 * Math.PI * u));
    samples[i] = clamp((grainDensity01 * white * 0.45 + (1 - grainDensity01 * 0.45) * pink) * hann, -0.95, 0.95);
  }
}

function setAudioParamSafe(param: PreviewAudioParamLike, value: number, time: number): void {
  if (typeof param.setValueAtTime === "function") param.setValueAtTime(value, time);
  else param.value = value;
}

/** 선택적 브라우저 Web Audio 원샷 프리뷰 헬퍼(jsdom/AudioContext 부재 및 안전 음소거 시 no-op). */
export function previewFoleySound(graph: FoleyDspGraph, options?: PreviewFoleySoundOptions): FoleyPreviewResult {
  const kind: FoleyPreviewKind = options?.kind ?? "stroke";
  if (!graph.safety.isAudible) {
    return { status: "muted-noop", played: false, kind, reason: "safety-muted", durationMs: 0, peakDb: SILENCE_FLOOR_DB };
  }
  const targetGain =
    kind === "stroke"
      ? graph.friction.effectiveGainLinear * graph.master.limiterRatio
      : kind === "ambience"
        ? graph.ambience.effectiveGainLinear * graph.master.limiterRatio
        : graph.tactileUi.effectiveGainLinear * graph.master.limiterRatio;

  if (targetGain <= 0.0001) {
    return { status: "muted-noop", played: false, kind, reason: "zero-gain", durationMs: 0, peakDb: SILENCE_FLOOR_DB };
  }

  const ctx = options?.audioContextFactory ? options.audioContextFactory() : createDefaultBrowserAudioContext();
  if (!ctx) {
    return { status: "unavailable-noop", played: false, kind, reason: "no-audio-context", durationMs: 0, peakDb: linearGainToDb(targetGain) };
  }

  const defaultDur =
    kind === "stroke"
      ? DRAWING_TOOL_FOLEY_PROFILES[graph.toolId].previewDurationMs
      : kind === "ambience" ? 420 : Math.max(24, TACTILE_UI_PRESETS[graph.tactilePresetId].clickDurationMs);
  const durationMs = Math.round(clamp(options?.durationMs ?? defaultDur, 20, 1200));
  const durationSec = durationMs / 1000;

  try {
    if (ctx.state === "suspended" && typeof ctx.resume === "function") void ctx.resume();
    const now = Number.isFinite(ctx.currentTime) ? ctx.currentTime : 0;
    const clampedGain = Math.min(MASTER_PEAK_CEILING_LINEAR, targetGain);
    const gainNode = ctx.createGain();
    setAudioParamSafe(gainNode.gain, clampedGain, now);
    gainNode.connect(ctx.destination);

    if (kind === "tactile-ui") {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      setAudioParamSafe(osc.frequency, Math.max(120, graph.tactileUi.clickFrequencyHz), now);
      osc.connect(gainNode);
      osc.start(now);
      osc.stop(now + durationSec);
    } else {
      const sr = Math.max(8000, Math.round(ctx.sampleRate || 44100));
      const buffer = ctx.createBuffer(1, Math.max(128, Math.round(sr * durationSec)), sr);
      writeDeterministicNoiseSamples(buffer.getChannelData(0), kind === "stroke" ? graph.friction.fiberGrainDensity01 : 0.25);

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const bandpass = ctx.createBiquadFilter();
      bandpass.type = "bandpass";
      setAudioParamSafe(
        bandpass.frequency,
        kind === "stroke" ? graph.friction.centerFrequencyHz : ATELIER_AMBIENCE_PROFILES[graph.ambienceId].ambienceCenterHz,
        now,
      );
      setAudioParamSafe(bandpass.Q, kind === "stroke" ? graph.friction.qFactor : 0.9, now);

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      setAudioParamSafe(lowpass.frequency, kind === "stroke" ? graph.friction.lpfCutoffHz : 2400, now);

      src.connect(bandpass);
      bandpass.connect(lowpass);
      lowpass.connect(gainNode);
      src.start(now);
      src.stop(now + durationSec);
    }

    return { status: "played", played: true, kind, reason: "ok", durationMs, peakDb: linearGainToDb(clampedGain) };
  } catch {
    return { status: "error-noop", played: false, kind, reason: "audio-error", durationMs: 0, peakDb: SILENCE_FLOOR_DB };
  }
}

const isToolId = (v: unknown): v is DrawingToolFoleyId => typeof v === "string" && (DRAWING_TOOL_FOLEY_IDS as readonly string[]).includes(v);
const isPaperId = (v: unknown): v is PaperResonanceId => typeof v === "string" && (PAPER_RESONANCE_IDS as readonly string[]).includes(v);
const isAmbienceId = (v: unknown): v is AtelierAmbienceId => typeof v === "string" && (ATELIER_AMBIENCE_IDS as readonly string[]).includes(v);
const isTactileId = (v: unknown): v is TactileUiPresetId => typeof v === "string" && (TACTILE_UI_PRESET_IDS as readonly string[]).includes(v);

function sanitizeConfig(config: FoleyMixerConfig): FoleyMixerConfig {
  return {
    toolId: config.toolId, paperId: config.paperId, ambienceId: config.ambienceId,
    ambienceLevels: {
      "rainy-night-atelier": round2(clamp01(config.ambienceLevels["rainy-night-atelier"])),
      "hanok-timber-study": round2(clamp01(config.ambienceLevels["hanok-timber-study"])),
      "dawn-deadline-cafe": round2(clamp01(config.ambienceLevels["dawn-deadline-cafe"])),
      "silent-focus": round2(clamp01(config.ambienceLevels["silent-focus"])),
    },
    tactilePresetId: config.tactilePresetId,
    masterVolume01: round2(clamp01(config.masterVolume01)), muted: Boolean(config.muted),
    foleyBusGain01: round2(clamp01(config.foleyBusGain01)),
    ambienceBusGain01: round2(clamp01(config.ambienceBusGain01)),
    tactileBusGain01: round2(clamp01(config.tactileBusGain01)),
    prefersReducedMotion: Boolean(config.prefersReducedMotion),
    reducedMotionPolicy: config.reducedMotionPolicy === "attenuate-soft" ? "attenuate-soft" : "mute",
    quietHours: {
      enabled: Boolean(config.quietHours.enabled),
      startHour: normalizeHour(config.quietHours.startHour),
      endHour: normalizeHour(config.quietHours.endHour),
    },
    currentHour: normalizeHour(config.currentHour),
  };
}

/** 현재 화실 Foley 믹서 설정을 버전 명시 v1 JSON 문자열로 직렬화한다. */
export function serializeFoleyMixerPreset(config: FoleyMixerConfig, presetName?: string): string {
  const cleanName = (presetName ?? "Atelier Foley Custom").trim() || "Atelier Foley Custom";
  const payload: FoleyMixerPresetPayload = {
    schema: FOLEY_MIXER_PRESET_SCHEMA, schemaVersion: 1, name: cleanName.slice(0, 64), config: sanitizeConfig(config),
  };
  return JSON.stringify(payload, null, 2);
}

function readClampedUnit(rec: Record<string, unknown>, key: string, fallback: number, warnings: string[]): number {
  const raw = rec[key];
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    warnings.push(`${key}: 기본값(${fallback})으로 복원`);
    return fallback;
  }
  if (raw < 0 || raw > 1) warnings.push(`${key}: [0, 1] 범위로 클램핑`);
  return round2(clamp01(raw));
}

/** 직렬화된 화실 Foley 믹서 프리셋 JSON을 검증·역직렬화한다. */
export function parseFoleyMixerPreset(rawJson: string): FoleyPresetParseResult {
  const trimmed = rawJson.trim();
  if (trimmed.length === 0) {
    return { ok: false, errorCode: "empty-input", messageKo: "프리셋 JSON 내용이 비어 있습니다.", messageEn: "Preset JSON input is empty." };
  }
  let parsed: unknown;
  try { parsed = JSON.parse(trimmed); } catch {
    return { ok: false, errorCode: "invalid-json", messageKo: "유효한 JSON 형식이 아닙니다.", messageEn: "Input is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, errorCode: "invalid-schema", messageKo: "프리셋 JSON 최상위는 객체여야 합니다.", messageEn: "Preset JSON root must be an object." };
  }
  const root = parsed as Record<string, unknown>;
  if (root.schema !== FOLEY_MIXER_PRESET_SCHEMA || root.schemaVersion !== 1) {
    return {
      ok: false, errorCode: "invalid-schema",
      messageKo: `지원하지 않는 프리셋 스키마입니다 (${FOLEY_MIXER_PRESET_SCHEMA} v1 필요).`,
      messageEn: `Unsupported preset schema (expected ${FOLEY_MIXER_PRESET_SCHEMA} v1).`,
    };
  }
  const cfgRaw = root.config;
  if (!cfgRaw || typeof cfgRaw !== "object" || Array.isArray(cfgRaw)) {
    return { ok: false, errorCode: "invalid-fields", messageKo: "프리셋 config 객체가 누락되었습니다.", messageEn: "Preset config object is missing." };
  }
  const cfg = cfgRaw as Record<string, unknown>;
  if (!isToolId(cfg.toolId) || !isPaperId(cfg.paperId) || !isAmbienceId(cfg.ambienceId) || !isTactileId(cfg.tactilePresetId)) {
    return {
      ok: false, errorCode: "invalid-fields",
      messageKo: "화구·종이·앰비언스·촉각 UI 식별자 중 허용되지 않은 값이 있습니다.",
      messageEn: "Invalid tool, paper, ambience, or tactile preset identifier.",
    };
  }

  const warnings: string[] = [];
  const levelsRaw = cfg.ambienceLevels && typeof cfg.ambienceLevels === "object" && !Array.isArray(cfg.ambienceLevels)
    ? (cfg.ambienceLevels as Record<string, unknown>) : {};
  const fallbackLevels = ATELIER_AMBIENCE_PROFILES[cfg.ambienceId].defaultMixLevels;
  const quietRaw = cfg.quietHours && typeof cfg.quietHours === "object" && !Array.isArray(cfg.quietHours)
    ? (cfg.quietHours as Record<string, unknown>) : {};

  const config: FoleyMixerConfig = {
    toolId: cfg.toolId, paperId: cfg.paperId, ambienceId: cfg.ambienceId,
    ambienceLevels: {
      "rainy-night-atelier": readClampedUnit(levelsRaw, "rainy-night-atelier", fallbackLevels["rainy-night-atelier"], warnings),
      "hanok-timber-study": readClampedUnit(levelsRaw, "hanok-timber-study", fallbackLevels["hanok-timber-study"], warnings),
      "dawn-deadline-cafe": readClampedUnit(levelsRaw, "dawn-deadline-cafe", fallbackLevels["dawn-deadline-cafe"], warnings),
      "silent-focus": readClampedUnit(levelsRaw, "silent-focus", fallbackLevels["silent-focus"], warnings),
    },
    tactilePresetId: cfg.tactilePresetId,
    masterVolume01: readClampedUnit(cfg, "masterVolume01", 0.75, warnings),
    muted: Boolean(cfg.muted),
    foleyBusGain01: readClampedUnit(cfg, "foleyBusGain01", 0.8, warnings),
    ambienceBusGain01: readClampedUnit(cfg, "ambienceBusGain01", 0.65, warnings),
    tactileBusGain01: readClampedUnit(cfg, "tactileBusGain01", 0.6, warnings),
    prefersReducedMotion: Boolean(cfg.prefersReducedMotion),
    reducedMotionPolicy: cfg.reducedMotionPolicy === "attenuate-soft" ? "attenuate-soft" : "mute",
    quietHours: {
      enabled: Boolean(quietRaw.enabled),
      startHour: normalizeHour(typeof quietRaw.startHour === "number" ? quietRaw.startHour : 23),
      endHour: normalizeHour(typeof quietRaw.endHour === "number" ? quietRaw.endHour : 7),
    },
    currentHour: normalizeHour(typeof cfg.currentHour === "number" ? cfg.currentHour : 15),
  };

  const name = typeof root.name === "string" && root.name.trim().length > 0 ? root.name.trim().slice(0, 64) : "Atelier Foley Custom";
  return {
    ok: true,
    preset: { schema: FOLEY_MIXER_PRESET_SCHEMA, schemaVersion: 1, name, config },
    warnings: Object.freeze(warnings),
  };
}
