/**
 * Wave-61: 공감각 스크롤 사운드·햅틱 연출 디렉터.
 *
 * 웹툰 세로 스크롤 컷의 대사 감정, 한국어·영어·일본어 의성어(SFX), 장면 환경 태그 및
 * Y 좌표를 분석해 Web Audio 앰비언스·폴리 스템 파라미터(등전력 크로스페이드, 대사 가독성
 * 로우패스 컷오프·볼륨 덕킹)와 모바일 햅틱 펄스 타임라인을 결정론적으로 생성·평가한다.
 * `muted`와 `prefersReducedMotion` 접근성 안전 비활성화를 엄격히 보장한다.
 */

export type CutDialogueEmotion =
  | "angry" | "anxious" | "calm" | "dread" | "heroic" | "joyful"
  | "melancholic" | "shock" | "silent" | "tender" | "tense";

export type CutSceneAmbienceTag =
  | "battle-field" | "cafe-murmur" | "city-night" | "crowd-bustle"
  | "fire-crackle" | "forest-wind" | "indoor-quiet" | "ocean-surf"
  | "rain-heavy" | "rain-light" | "silence-void" | "tension-drone" | "thunder-storm";

export type MobileHapticPatternKind =
  | "crisp-tick" | "heartbeat-double" | "impact-heavy"
  | "light-tap" | "rumble-sustained" | "sharp-transient";

export type FoleyTriggerCategory =
  | "explosion" | "footstep" | "heartbeat" | "impact"
  | "metallic" | "rain-splash" | "rumble" | "whoosh";

export interface CutDialogueEntry {
  readonly emotion: CutDialogueEmotion;
  readonly id: string;
  readonly intensity?: number;
  readonly speakerId?: string;
  readonly text: string;
  readonly yCenterPx?: number;
}

export interface CutSfxCueInput {
  readonly emphasis?: number;
  readonly id: string;
  readonly token: string;
  readonly yCenterPx?: number;
}

export interface SynestheticScrollCutInput {
  readonly cutId: string;
  readonly dialogues: readonly CutDialogueEntry[];
  readonly dominantEmotion?: CutDialogueEmotion;
  readonly sceneTags: readonly CutSceneAmbienceTag[];
  readonly sfxCues: readonly CutSfxCueInput[];
  readonly yEndPx: number;
  readonly yStartPx: number;
}

export interface SynestheticTimelineBuildOptions {
  readonly crossfadeBandPx?: number;
  readonly dialogueDuckingRampPx?: number;
  readonly hapticWindowHalfPx?: number;
}

export interface AmbienceStemSegment {
  readonly baseGain: number;
  readonly baseLowpassHz: number;
  readonly cutId: string;
  readonly fadeInEndPx: number;
  readonly fadeInStartPx: number;
  readonly fadeOutEndPx: number;
  readonly fadeOutStartPx: number;
  readonly highpassHz: number;
  readonly stemId: string;
  readonly stereoSpread: number;
  readonly tag: CutSceneAmbienceTag;
}

export interface FoleyTriggerEvent {
  readonly baseGain: number;
  readonly cutId: string;
  readonly decayMs: number;
  readonly eventId: string;
  readonly foleyCategory: FoleyTriggerCategory;
  readonly lowpassHz: number;
  readonly pitchRatio: number;
  readonly resonanceQ: number;
  readonly sourceToken: string;
  readonly triggerWindowHalfPx: number;
  readonly triggerYPx: number;
}

export interface DialogueDuckingZone {
  readonly cutId: string;
  readonly duckingAmount: number;
  readonly emotion: CutDialogueEmotion;
  readonly rampPx: number;
  readonly targetLowpassHz: number;
  readonly yEndPx: number;
  readonly yStartPx: number;
  readonly zoneId: string;
}

export interface HapticPulseEvent {
  readonly cutId: string;
  readonly eventId: string;
  readonly intensity: number;
  readonly patternKind: MobileHapticPatternKind;
  readonly sharpness: number;
  readonly sourceLabel: string;
  readonly triggerWindowHalfPx: number;
  readonly triggerYPx: number;
  readonly vibratePatternMs: readonly number[];
}

export interface SynestheticScrollTimeline {
  readonly ambienceSegments: readonly AmbienceStemSegment[];
  readonly cutCount: number;
  readonly dialogueDuckingZones: readonly DialogueDuckingZone[];
  readonly foleyTriggers: readonly FoleyTriggerEvent[];
  readonly hapticEvents: readonly HapticPulseEvent[];
  readonly totalHeightPx: number;
}

export interface SynestheticPlaybackPreferences {
  readonly ambienceMix?: number;
  readonly duckingStrength?: number;
  readonly foleyMix?: number;
  readonly hapticsEnabled?: boolean;
  readonly masterVolume?: number;
  readonly muted?: boolean;
  readonly prefersReducedMotion?: boolean;
  readonly scrollVelocityModulation?: number;
}

export interface ScrollAudioHapticFrameInput {
  readonly preferences?: SynestheticPlaybackPreferences;
  readonly scrollVelocityPxPerSec?: number;
  readonly scrollYPx: number;
  readonly timeline: SynestheticScrollTimeline;
  readonly viewportHeightPx?: number;
}

export interface EvaluatedAmbienceStemState {
  readonly activeCutIds: readonly string[];
  readonly duckingGain: number;
  readonly gain: number;
  readonly highpassHz: number;
  readonly lowpassCutoffHz: number;
  readonly playbackRate: number;
  readonly rawGain: number;
  readonly stemId: string;
  readonly stereoPan: number;
  readonly tag: CutSceneAmbienceTag;
}

export interface EvaluatedFoleyTriggerState {
  readonly eventId: string;
  readonly foleyCategory: FoleyTriggerCategory;
  readonly gain: number;
  readonly lowpassCutoffHz: number;
  readonly pitchRatio: number;
  readonly proximityWeight: number;
  readonly resonanceQ: number;
  readonly sourceToken: string;
}

export interface EvaluatedHapticPulseState {
  readonly eventId: string;
  readonly intensity: number;
  readonly patternKind: MobileHapticPatternKind;
  readonly proximityWeight: number;
  readonly sharpness: number;
  readonly vibratePatternMs: readonly number[];
}

export interface SynestheticScrollFrameResult {
  readonly activeHaptics: readonly EvaluatedHapticPulseState[];
  readonly ambienceStems: readonly EvaluatedAmbienceStemState[];
  readonly audioActive: boolean;
  readonly dialogueDuckingGain: number;
  readonly duckingAttenuationDb: number;
  readonly focusYPx: number;
  readonly foleyTriggers: readonly EvaluatedFoleyTriggerState[];
  readonly hapticsSuppressedReason: "none" | "prefers-reduced-motion" | "user-disabled";
  readonly isDialogueDuckingActive: boolean;
  readonly masterGain: number;
  readonly masterLowpassCutoffHz: number;
  readonly velocityModulationFactor: number;
  readonly vibratePatternMs: readonly number[];
}

interface AmbiencePresetSpec {
  readonly baseGain: number;
  readonly baseLowpassHz: number;
  readonly highpassHz: number;
  readonly stereoSpread: number;
}

const AMBIENCE_PRESETS: Readonly<Record<CutSceneAmbienceTag, AmbiencePresetSpec>> = {
  "battle-field": { baseGain: 0.78, baseLowpassHz: 9500, highpassHz: 45, stereoSpread: 0.55 },
  "cafe-murmur": { baseGain: 0.42, baseLowpassHz: 5200, highpassHz: 110, stereoSpread: 0.35 },
  "city-night": { baseGain: 0.48, baseLowpassHz: 4600, highpassHz: 60, stereoSpread: 0.4 },
  "crowd-bustle": { baseGain: 0.55, baseLowpassHz: 6000, highpassHz: 120, stereoSpread: 0.5 },
  "fire-crackle": { baseGain: 0.54, baseLowpassHz: 7800, highpassHz: 140, stereoSpread: 0.3 },
  "forest-wind": { baseGain: 0.46, baseLowpassHz: 6400, highpassHz: 85, stereoSpread: 0.6 },
  "indoor-quiet": { baseGain: 0.24, baseLowpassHz: 3200, highpassHz: 70, stereoSpread: 0.1 },
  "ocean-surf": { baseGain: 0.58, baseLowpassHz: 5400, highpassHz: 55, stereoSpread: 0.65 },
  "rain-heavy": { baseGain: 0.72, baseLowpassHz: 8400, highpassHz: 95, stereoSpread: 0.5 },
  "rain-light": { baseGain: 0.44, baseLowpassHz: 6800, highpassHz: 130, stereoSpread: 0.35 },
  "silence-void": { baseGain: 0.08, baseLowpassHz: 1400, highpassHz: 40, stereoSpread: 0.0 },
  "tension-drone": { baseGain: 0.62, baseLowpassHz: 2400, highpassHz: 35, stereoSpread: 0.25 },
  "thunder-storm": { baseGain: 0.82, baseLowpassHz: 7200, highpassHz: 32, stereoSpread: 0.6 },
};

interface EmotionModulationSpec {
  readonly duckingAmount: number;
  readonly hapticIntensity: number;
  readonly hapticKind: MobileHapticPatternKind | null;
  readonly lowpassScale: number;
  readonly targetDialogueLowpassHz: number;
}

const EMOTION_SPECS: Readonly<Record<CutDialogueEmotion, EmotionModulationSpec>> = {
  angry: { duckingAmount: 0.44, hapticIntensity: 0.62, hapticKind: "sharp-transient", lowpassScale: 1.08, targetDialogueLowpassHz: 4200 },
  anxious: { duckingAmount: 0.48, hapticIntensity: 0.42, hapticKind: "heartbeat-double", lowpassScale: 0.76, targetDialogueLowpassHz: 2600 },
  calm: { duckingAmount: 0.36, hapticIntensity: 0, hapticKind: null, lowpassScale: 0.92, targetDialogueLowpassHz: 3600 },
  dread: { duckingAmount: 0.52, hapticIntensity: 0.55, hapticKind: "rumble-sustained", lowpassScale: 0.58, targetDialogueLowpassHz: 1850 },
  heroic: { duckingAmount: 0.38, hapticIntensity: 0.48, hapticKind: "crisp-tick", lowpassScale: 1.12, targetDialogueLowpassHz: 4800 },
  joyful: { duckingAmount: 0.34, hapticIntensity: 0.28, hapticKind: "light-tap", lowpassScale: 1.15, targetDialogueLowpassHz: 5200 },
  melancholic: { duckingAmount: 0.45, hapticIntensity: 0, hapticKind: null, lowpassScale: 0.72, targetDialogueLowpassHz: 2500 },
  shock: { duckingAmount: 0.58, hapticIntensity: 0.82, hapticKind: "impact-heavy", lowpassScale: 0.65, targetDialogueLowpassHz: 2100 },
  silent: { duckingAmount: 0.0, hapticIntensity: 0, hapticKind: null, lowpassScale: 0.85, targetDialogueLowpassHz: 16000 },
  tender: { duckingAmount: 0.42, hapticIntensity: 0.22, hapticKind: "light-tap", lowpassScale: 0.84, targetDialogueLowpassHz: 3100 },
  tense: { duckingAmount: 0.5, hapticIntensity: 0.52, hapticKind: "heartbeat-double", lowpassScale: 0.7, targetDialogueLowpassHz: 2300 },
};

interface SfxTokenRule {
  readonly baseGain: number;
  readonly decayMs: number;
  readonly foleyCategory: FoleyTriggerCategory;
  readonly hapticIntensity: number;
  readonly hapticKind: MobileHapticPatternKind;
  readonly hapticSharpness: number;
  readonly lowpassHz: number;
  readonly pattern: RegExp;
  readonly pitchRatio: number;
  readonly resonanceQ: number;
}

const SFX_TOKEN_RULES: readonly SfxTokenRule[] = [
  { baseGain: 0.88, decayMs: 680, foleyCategory: "explosion", hapticIntensity: 0.95, hapticKind: "impact-heavy", hapticSharpness: 0.72, lowpassHz: 4800, pattern: /(콰광|쾅|펑|폭발|boom|kaboom|blast|ドォン|ドカン|バク)/u, pitchRatio: 0.85, resonanceQ: 1.4 },
  { baseGain: 0.62, decayMs: 360, foleyCategory: "heartbeat", hapticIntensity: 0.58, hapticKind: "heartbeat-double", hapticSharpness: 0.3, lowpassHz: 680, pattern: /(두근|쿵쾅|심장|ba-dum|thump|heartbeat|ドキ|ドクン)/u, pitchRatio: 0.95, resonanceQ: 2.1 },
  { baseGain: 0.76, decayMs: 920, foleyCategory: "rumble", hapticIntensity: 0.75, hapticKind: "rumble-sustained", hapticSharpness: 0.22, lowpassHz: 950, pattern: /(우르릉|쿠구궁|지진|rumble|thunder|tremble|ゴゴゴ|ズズズ)/u, pitchRatio: 0.72, resonanceQ: 1.8 },
  { baseGain: 0.74, decayMs: 420, foleyCategory: "metallic", hapticIntensity: 0.68, hapticKind: "sharp-transient", hapticSharpness: 0.94, lowpassHz: 11200, pattern: /(챙|카앙|쩌렁|칼|clang|slash|shing|キィン|ガキン)/u, pitchRatio: 1.18, resonanceQ: 3.4 },
  { baseGain: 0.58, decayMs: 340, foleyCategory: "whoosh", hapticIntensity: 0.36, hapticKind: "light-tap", hapticSharpness: 0.45, lowpassHz: 5400, pattern: /(휘이|슈욱|스윽|휙|whoosh|swoosh|wind|ヒュッ|シュッ)/u, pitchRatio: 1.08, resonanceQ: 1.6 },
  { baseGain: 0.52, decayMs: 460, foleyCategory: "rain-splash", hapticIntensity: 0.28, hapticKind: "crisp-tick", hapticSharpness: 0.65, lowpassHz: 7600, pattern: /(쏴아|후두둑|첨벙|splash|drip|rain|ザァ|ポタ)/u, pitchRatio: 1.05, resonanceQ: 1.1 },
  { baseGain: 0.46, decayMs: 180, foleyCategory: "footstep", hapticIntensity: 0.34, hapticKind: "crisp-tick", hapticSharpness: 0.78, lowpassHz: 3400, pattern: /(탁|저벅|또각|step|tap|foot|コツ|タッ)/u, pitchRatio: 1.0, resonanceQ: 1.2 },
];

const DEFAULT_SFX_RULE: Omit<SfxTokenRule, "pattern"> = {
  baseGain: 0.68, decayMs: 320, foleyCategory: "impact", hapticIntensity: 0.65,
  hapticKind: "impact-heavy", hapticSharpness: 0.68, lowpassHz: 4200, pitchRatio: 0.96, resonanceQ: 1.5,
};

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function equalPowerFade(t: number): number {
  return Math.sin(clamp(t, 0, 1) * Math.PI * 0.5);
}

function smoothStep01(t: number): number {
  return 0.5 - 0.5 * Math.cos(Math.PI * clamp(t, 0, 1));
}

function buildHapticWaveformMs(kind: MobileHapticPatternKind, scale: number): readonly number[] {
  const s = clamp(scale, 0.4, 1.5);
  switch (kind) {
    case "impact-heavy": return [Math.round(58 * s), 28, Math.round(32 * s)];
    case "heartbeat-double": return [Math.round(24 * s), 75, Math.round(34 * s)];
    case "rumble-sustained": return [Math.round(45 * s), 22, Math.round(45 * s), 22, Math.round(35 * s)];
    case "sharp-transient": return [Math.round(18 * s), 16, Math.round(14 * s)];
    case "crisp-tick": return [Math.round(14 * s)];
    case "light-tap": return [Math.round(10 * s)];
  }
}

function classifySfxToken(token: string, emphasis: number) {
  const normalized = token.trim().toLowerCase();
  const emp = clamp(emphasis, 0.25, 2.0);
  const matched = SFX_TOKEN_RULES.find((rule) => rule.pattern.test(normalized)) ?? DEFAULT_SFX_RULE;
  return {
    baseGain: clamp(matched.baseGain * emp, 0.12, 1.0),
    decayMs: matched.decayMs,
    foleyCategory: matched.foleyCategory,
    hapticIntensity: clamp(matched.hapticIntensity * emp, 0.1, 1.0),
    hapticKind: matched.hapticKind,
    hapticSharpness: matched.hapticSharpness,
    lowpassHz: matched.lowpassHz,
    pitchRatio: matched.pitchRatio,
    resonanceQ: matched.resonanceQ,
    vibratePatternMs: buildHapticWaveformMs(matched.hapticKind, emp),
  };
}

/**
 * 웹툰 컷 목록에서 스크롤 연동 Web Audio 앰비언스·폴리·대사 덕킹 및
 * 모바일 햅틱 펄스 타임라인을 결정론적으로 생성한다.
 */
export function buildSynestheticScrollTimeline(
  cuts: readonly SynestheticScrollCutInput[],
  options: SynestheticTimelineBuildOptions = {},
): SynestheticScrollTimeline {
  const crossfadeBandPx = clamp(finiteOr(options.crossfadeBandPx, 180), 16, 1200);
  const dialogueRampPx = clamp(finiteOr(options.dialogueDuckingRampPx, 90), 8, 600);
  const hapticHalfWindow = clamp(finiteOr(options.hapticWindowHalfPx, 56), 12, 320);

  const sortedCuts = [...cuts]
    .map((cut) => {
      const yStart = finiteOr(cut.yStartPx, 0);
      return { ...cut, yEndPx: Math.max(yStart + 1, finiteOr(cut.yEndPx, yStart + 600)), yStartPx: yStart };
    })
    .sort((a, b) => a.yStartPx - b.yStartPx || a.cutId.localeCompare(b.cutId));

  const ambienceSegments: AmbienceStemSegment[] = [];
  const foleyTriggers: FoleyTriggerEvent[] = [];
  const dialogueDuckingZones: DialogueDuckingZone[] = [];
  const hapticEvents: HapticPulseEvent[] = [];
  let totalHeightPx = 0;

  for (const cut of sortedCuts) {
    if (cut.yEndPx > totalHeightPx) totalHeightPx = cut.yEndPx;
    const cutHeight = cut.yEndPx - cut.yStartPx;
    const halfBand = Math.min(crossfadeBandPx * 0.5, cutHeight * 0.45);
    const dominantEmotion: CutDialogueEmotion =
      cut.dominantEmotion ?? cut.dialogues[0]?.emotion ?? "calm";
    const emotionSpec = EMOTION_SPECS[dominantEmotion];
    const sceneTags: readonly CutSceneAmbienceTag[] =
      cut.sceneTags.length > 0 ? cut.sceneTags : ["indoor-quiet"];

    for (const tag of sceneTags) {
      const preset = AMBIENCE_PRESETS[tag];
      ambienceSegments.push({
        baseGain: preset.baseGain,
        baseLowpassHz: clamp(preset.baseLowpassHz * emotionSpec.lowpassScale, 420, 18000),
        cutId: cut.cutId,
        fadeInEndPx: cut.yStartPx + halfBand,
        fadeInStartPx: Math.max(0, cut.yStartPx - halfBand),
        fadeOutEndPx: cut.yEndPx + halfBand,
        fadeOutStartPx: Math.max(cut.yStartPx + halfBand, cut.yEndPx - halfBand),
        highpassHz: preset.highpassHz,
        stemId: `ambience:${tag}`,
        stereoSpread: preset.stereoSpread,
        tag,
      });
    }

    if (cut.dialogues.length > 0) {
      let maxDucking = 0;
      let minLowpass = 18000;
      let strongestEmotion: CutDialogueEmotion = dominantEmotion;

      for (const dlg of cut.dialogues) {
        const spec = EMOTION_SPECS[dlg.emotion];
        const intensity = clamp(finiteOr(dlg.intensity, 0.8), 0.2, 1.0);
        const charWeight = clamp(0.65 + dlg.text.trim().length / 45, 0.65, 1.0);
        const duckAmount = clamp(spec.duckingAmount * intensity * charWeight, 0, 0.78);
        if (duckAmount > maxDucking) {
          maxDucking = duckAmount;
          strongestEmotion = dlg.emotion;
        }
        if (spec.targetDialogueLowpassHz < minLowpass) minLowpass = spec.targetDialogueLowpassHz;

        if (spec.hapticKind && spec.hapticIntensity * intensity >= 0.45) {
          hapticEvents.push({
            cutId: cut.cutId,
            eventId: `haptic:dialogue:${cut.cutId}:${dlg.id}`,
            intensity: clamp(spec.hapticIntensity * intensity, 0.15, 0.95),
            patternKind: spec.hapticKind,
            sharpness: spec.hapticKind === "sharp-transient" ? 0.85 : 0.45,
            sourceLabel: `dialogue:${dlg.emotion}`,
            triggerWindowHalfPx: hapticHalfWindow,
            triggerYPx: clamp(finiteOr(dlg.yCenterPx, (cut.yStartPx + cut.yEndPx) * 0.5), cut.yStartPx, cut.yEndPx),
            vibratePatternMs: buildHapticWaveformMs(spec.hapticKind, intensity),
          });
        }
      }

      if (maxDucking > 0.01) {
        dialogueDuckingZones.push({
          cutId: cut.cutId,
          duckingAmount: maxDucking,
          emotion: strongestEmotion,
          rampPx: Math.min(dialogueRampPx, cutHeight * 0.35),
          targetLowpassHz: clamp(minLowpass, 900, 16000),
          yEndPx: cut.yEndPx,
          yStartPx: cut.yStartPx,
          zoneId: `duck:${cut.cutId}`,
        });
      }
    }

    for (let sIdx = 0; sIdx < cut.sfxCues.length; sIdx += 1) {
      const cue = cut.sfxCues[sIdx];
      const profile = classifySfxToken(cue.token, clamp(finiteOr(cue.emphasis, 1.0), 0.25, 2.0));
      const defaultY = cut.yStartPx + ((sIdx + 1) / (cut.sfxCues.length + 1)) * cutHeight;
      const triggerY = clamp(finiteOr(cue.yCenterPx, defaultY), cut.yStartPx, cut.yEndPx);

      foleyTriggers.push({
        baseGain: profile.baseGain, cutId: cut.cutId, decayMs: profile.decayMs,
        eventId: `foley:${cut.cutId}:${cue.id}`, foleyCategory: profile.foleyCategory,
        lowpassHz: profile.lowpassHz, pitchRatio: profile.pitchRatio,
        resonanceQ: profile.resonanceQ, sourceToken: cue.token,
        triggerWindowHalfPx: Math.max(hapticHalfWindow, 72), triggerYPx: triggerY,
      });
      hapticEvents.push({
        cutId: cut.cutId, eventId: `haptic:sfx:${cut.cutId}:${cue.id}`,
        intensity: profile.hapticIntensity, patternKind: profile.hapticKind,
        sharpness: profile.hapticSharpness, sourceLabel: cue.token,
        triggerWindowHalfPx: hapticHalfWindow, triggerYPx: triggerY,
        vibratePatternMs: profile.vibratePatternMs,
      });
    }
  }

  foleyTriggers.sort((a, b) => a.triggerYPx - b.triggerYPx || a.eventId.localeCompare(b.eventId));
  hapticEvents.sort((a, b) => a.triggerYPx - b.triggerYPx || a.eventId.localeCompare(b.eventId));

  return {
    ambienceSegments, cutCount: sortedCuts.length, dialogueDuckingZones,
    foleyTriggers, hapticEvents, totalHeightPx,
  };
}

function evaluateAmbienceEnvelope(seg: AmbienceStemSegment, focusY: number): number {
  if (focusY < seg.fadeInStartPx || focusY > seg.fadeOutEndPx) return 0;
  let fadeIn = 1;
  if (focusY < seg.fadeInEndPx && seg.fadeInEndPx > seg.fadeInStartPx) {
    fadeIn = equalPowerFade((focusY - seg.fadeInStartPx) / (seg.fadeInEndPx - seg.fadeInStartPx));
  }
  let fadeOut = 1;
  if (focusY > seg.fadeOutStartPx && seg.fadeOutEndPx > seg.fadeOutStartPx) {
    fadeOut = equalPowerFade(1 - (focusY - seg.fadeOutStartPx) / (seg.fadeOutEndPx - seg.fadeOutStartPx));
  }
  return clamp(fadeIn * fadeOut, 0, 1);
}

function evaluateDuckingEnvelope(zone: DialogueDuckingZone, focusY: number): number {
  const start = zone.yStartPx - zone.rampPx;
  const end = zone.yEndPx + zone.rampPx;
  if (focusY <= start || focusY >= end) return 0;
  if (focusY < zone.yStartPx && zone.rampPx > 0) return smoothStep01((focusY - start) / zone.rampPx);
  if (focusY > zone.yEndPx && zone.rampPx > 0) return smoothStep01((end - focusY) / zone.rampPx);
  return 1;
}

/**
 * 현재 스크롤 Y 위치와 접근성·재생 설정에 맞춰 Web Audio 파라미터 및
 * 모바일 햅틱 펄스를 실시간 평가한다.
 */
export function evaluateScrollAudioHapticFrame(
  input: ScrollAudioHapticFrameInput,
): SynestheticScrollFrameResult {
  const prefs = input.preferences ?? {};
  const muted = Boolean(prefs.muted);
  const prefersReducedMotion = Boolean(prefs.prefersReducedMotion);
  const hapticsEnabled = prefs.hapticsEnabled ?? true;
  const masterVolume = muted ? 0 : clamp(finiteOr(prefs.masterVolume, 1.0), 0, 1);
  const ambienceMix = clamp(finiteOr(prefs.ambienceMix, 1.0), 0, 1.5);
  const foleyMix = clamp(finiteOr(prefs.foleyMix, 1.0), 0, 1.5);
  const duckingStrength = clamp(finiteOr(prefs.duckingStrength, 1.0), 0, 1.5);

  const viewportHeight = Math.max(0, finiteOr(input.viewportHeightPx, 0));
  const rawScrollY = Math.max(0, finiteOr(input.scrollYPx, 0));
  const focusYPx =
    input.timeline.totalHeightPx > 0
      ? clamp(rawScrollY + viewportHeight * 0.42, 0, input.timeline.totalHeightPx)
      : rawScrollY;

  const scrollSpeed = Math.abs(finiteOr(input.scrollVelocityPxPerSec, 0));
  const velocitySensitivity = clamp(finiteOr(prefs.scrollVelocityModulation, 1.0), 0, 2);
  const velocityModulationFactor = prefersReducedMotion
    ? 0
    : clamp((scrollSpeed / 2200) * velocitySensitivity, 0, 1);

  // 1. 대사 덕킹 평가
  let strongestDuckRatio = 0;
  let duckTargetLowpassHz = 18000;
  for (const zone of input.timeline.dialogueDuckingZones) {
    const env = evaluateDuckingEnvelope(zone, focusYPx);
    if (env <= 0) continue;
    const effectiveDuck = clamp(zone.duckingAmount * env * duckingStrength, 0, 0.85);
    if (effectiveDuck > strongestDuckRatio) strongestDuckRatio = effectiveDuck;
    const blendedLowpass =
      18000 - (18000 - zone.targetLowpassHz) * env * clamp(duckingStrength, 0, 1);
    if (blendedLowpass < duckTargetLowpassHz) duckTargetLowpassHz = blendedLowpass;
  }

  const dialogueDuckingGain = clamp(1 - strongestDuckRatio, 0.15, 1.0);
  const isDialogueDuckingActive = strongestDuckRatio > 0.01;
  const duckingAttenuationDb = dialogueDuckingGain < 1 ? 20 * Math.log10(dialogueDuckingGain) : 0;

  // 2. 앰비언스 스템 병합 및 등전력 크로스페이드
  const stemMap = new Map<
    string,
    {
      activeCutIds: string[];
      highpassHz: number;
      lowpassWeightedSum: number;
      maxEnv: number;
      rawGainEnergySq: number;
      stereoSpread: number;
      tag: CutSceneAmbienceTag;
    }
  >();

  for (const seg of input.timeline.ambienceSegments) {
    const env = evaluateAmbienceEnvelope(seg, focusYPx);
    if (env <= 1e-4) continue;
    const segRawGain = seg.baseGain * env;
    const existing = stemMap.get(seg.stemId);
    if (!existing) {
      stemMap.set(seg.stemId, {
        activeCutIds: [seg.cutId], highpassHz: seg.highpassHz,
        lowpassWeightedSum: seg.baseLowpassHz * env, maxEnv: env,
        rawGainEnergySq: segRawGain * segRawGain, stereoSpread: seg.stereoSpread, tag: seg.tag,
      });
    } else {
      if (!existing.activeCutIds.includes(seg.cutId)) existing.activeCutIds.push(seg.cutId);
      existing.rawGainEnergySq += segRawGain * segRawGain;
      existing.lowpassWeightedSum += seg.baseLowpassHz * env;
      existing.maxEnv += env;
    }
  }

  const ambienceStems: EvaluatedAmbienceStemState[] = [];
  let minStemLowpassHz = duckTargetLowpassHz;
  for (const [stemId, acc] of stemMap.entries()) {
    const rawGain = muted ? 0 : clamp(Math.sqrt(acc.rawGainEnergySq) * ambienceMix, 0, 1);
    const gain = muted ? 0 : clamp(rawGain * dialogueDuckingGain * masterVolume, 0, 1);
    const avgLowpass = acc.maxEnv > 0 ? acc.lowpassWeightedSum / acc.maxEnv : 4000;
    const lowpassCutoffHz = clamp(
      Math.min(avgLowpass + velocityModulationFactor * 1400, duckTargetLowpassHz), 400, 18000,
    );
    if (lowpassCutoffHz < minStemLowpassHz) minStemLowpassHz = lowpassCutoffHz;

    ambienceStems.push({
      activeCutIds: acc.activeCutIds, duckingGain: dialogueDuckingGain, gain,
      highpassHz: acc.highpassHz, lowpassCutoffHz,
      playbackRate: clamp(1 + velocityModulationFactor * 0.12, 0.85, 1.25),
      rawGain, stemId, stereoPan: clamp(acc.stereoSpread * velocityModulationFactor * 0.25, -0.6, 0.6),
      tag: acc.tag,
    });
  }
  ambienceStems.sort((a, b) => a.stemId.localeCompare(b.stemId));

  // 3. 폴리(SFX) 트리거 평가
  const foleyTriggers: EvaluatedFoleyTriggerState[] = [];
  for (const trigger of input.timeline.foleyTriggers) {
    const dist = Math.abs(focusYPx - trigger.triggerYPx);
    if (dist > trigger.triggerWindowHalfPx) continue;
    const proximityWeight = smoothStep01(1 - dist / trigger.triggerWindowHalfPx);
    if (proximityWeight <= 1e-4) continue;

    const reducedMotionCap = prefersReducedMotion ? 0.65 : 1.0;
    const foleyDucking = isDialogueDuckingActive ? 0.72 + 0.28 * dialogueDuckingGain : 1.0;
    const gain = muted
      ? 0
      : clamp(
          trigger.baseGain * proximityWeight * foleyMix * foleyDucking * reducedMotionCap * masterVolume,
          0, 1,
        );

    foleyTriggers.push({
      eventId: trigger.eventId, foleyCategory: trigger.foleyCategory, gain,
      lowpassCutoffHz: clamp(
        trigger.lowpassHz * (prefersReducedMotion ? 0.85 : 1 + velocityModulationFactor * 0.15),
        400, 18000,
      ),
      pitchRatio: clamp(trigger.pitchRatio + velocityModulationFactor * 0.08, 0.5, 1.6),
      proximityWeight,
      resonanceQ: prefersReducedMotion ? Math.min(trigger.resonanceQ, 1.5) : trigger.resonanceQ,
      sourceToken: trigger.sourceToken,
    });
  }

  // 4. 모바일 햅틱 펄스 평가
  const hapticsSuppressedReason: SynestheticScrollFrameResult["hapticsSuppressedReason"] =
    prefersReducedMotion ? "prefers-reduced-motion" : !hapticsEnabled ? "user-disabled" : "none";

  const activeHaptics: EvaluatedHapticPulseState[] = [];
  let vibratePatternMs: readonly number[] = [];
  if (hapticsSuppressedReason === "none") {
    for (const evt of input.timeline.hapticEvents) {
      const dist = Math.abs(focusYPx - evt.triggerYPx);
      if (dist > evt.triggerWindowHalfPx) continue;
      const proximityWeight = smoothStep01(1 - dist / evt.triggerWindowHalfPx);
      if (proximityWeight <= 0.05) continue;

      activeHaptics.push({
        eventId: evt.eventId,
        intensity: clamp(evt.intensity * proximityWeight * (1 + velocityModulationFactor * 0.15), 0, 1),
        patternKind: evt.patternKind, proximityWeight,
        sharpness: evt.sharpness, vibratePatternMs: evt.vibratePatternMs,
      });
    }
    if (activeHaptics.length > 0) {
      const strongest = [...activeHaptics].sort(
        (a, b) => b.intensity - a.intensity || a.eventId.localeCompare(b.eventId),
      )[0];
      vibratePatternMs = strongest.vibratePatternMs;
    }
  }

  const audioActive =
    !muted && masterVolume > 0 &&
    (ambienceStems.some((s) => s.gain > 0) || foleyTriggers.some((f) => f.gain > 0));

  return {
    activeHaptics, ambienceStems, audioActive, dialogueDuckingGain, duckingAttenuationDb,
    focusYPx, foleyTriggers, hapticsSuppressedReason, isDialogueDuckingActive,
    masterGain: masterVolume, masterLowpassCutoffHz: clamp(minStemLowpassHz, 400, 18000),
    velocityModulationFactor, vibratePatternMs,
  };
}
