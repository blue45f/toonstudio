/**
 * ₩0 로컬 WebAudio 효과음(SFX) 스템 스케줄러 및 프리셋 합성 레시피
 *
 * - 외부 유료 TTS/SFX API 없이 브라우저 WebAudio API(오실레이터·결정론적 노이즈·바이쿼드 필터)만으로
 *   웹툰 숏폼·오디오 드라마 효과음 스템을 스케줄링한다.
 */

export type CutEmotionTone =
  | "neutral"
  | "tense"
  | "joy"
  | "sad"
  | "shock"
  | "whisper"
  | "action";

export type LocalSfxPresetId =
  | "whoosh-pan"
  | "impact-thud"
  | "heartbeat-pulse"
  | "sparkle-chime"
  | "paper-turn"
  | "thunder-rumble"
  | "rain-ambient";

export interface WebtoonCutSfxTrigger {
  readonly id: string;
  readonly label: string;
  readonly presetId?: LocalSfxPresetId;
  readonly offsetRatio?: number;
  readonly durationMs?: number;
  readonly gain?: number;
}

export type WebAudioOscillatorKind = "sine" | "triangle" | "sawtooth" | "square" | "noise";
export type WebAudioFilterKind = "lowpass" | "bandpass" | "highpass";

export interface WebAudioSynthRecipe {
  readonly presetId: LocalSfxPresetId;
  readonly labelKo: string;
  readonly oscillatorType: WebAudioOscillatorKind;
  readonly startFreqHz: number;
  readonly endFreqHz: number;
  readonly attackMs: number;
  readonly decayMs: number;
  readonly releaseMs: number;
  readonly filterType: WebAudioFilterKind;
  readonly filterFreqHz: number;
  readonly defaultGain: number;
  readonly defaultDurationMs: number;
}

export interface WebAudioSfxStemEvent {
  readonly stemId: string;
  readonly cutId: string;
  readonly cutNumber: number;
  readonly label: string;
  readonly presetId: LocalSfxPresetId;
  readonly startMs: number;
  readonly durationMs: number;
  readonly startTimeSec: number;
  readonly durationSec: number;
  readonly gain: number;
  readonly recipe: WebAudioSynthRecipe;
}

export interface MinimalAudioParamLike {
  setValueAtTime(value: number, startTime: number): unknown;
  linearRampToValueAtTime(value: number, endTime: number): unknown;
  exponentialRampToValueAtTime(value: number, endTime: number): unknown;
}

export interface MinimalAudioNodeLike {
  connect(destination: MinimalAudioNodeLike): unknown;
}

export interface MinimalOscillatorNodeLike extends MinimalAudioNodeLike {
  type: string;
  readonly frequency: MinimalAudioParamLike;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface MinimalAudioBufferLike {
  getChannelData(channel: number): Float32Array;
}

export interface MinimalBufferSourceNodeLike extends MinimalAudioNodeLike {
  buffer: MinimalAudioBufferLike | null;
  start(when?: number): void;
  stop(when?: number): void;
}

export interface MinimalBiquadFilterNodeLike extends MinimalAudioNodeLike {
  type: string;
  readonly frequency: MinimalAudioParamLike;
}

export interface MinimalGainNodeLike extends MinimalAudioNodeLike {
  readonly gain: MinimalAudioParamLike;
}

export interface MinimalWebAudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly destination: MinimalAudioNodeLike;
  createOscillator(): MinimalOscillatorNodeLike;
  createBiquadFilter(): MinimalBiquadFilterNodeLike;
  createGain(): MinimalGainNodeLike;
  createBuffer(channels: number, length: number, sampleRate: number): MinimalAudioBufferLike;
  createBufferSource(): MinimalBufferSourceNodeLike;
}

export const LOCAL_WEBAUDIO_SFX_RECIPES: Readonly<Record<LocalSfxPresetId, WebAudioSynthRecipe>> =
  Object.freeze({
    "whoosh-pan": Object.freeze({
      presetId: "whoosh-pan",
      labelKo: "컷 전환 스우시",
      oscillatorType: "noise",
      startFreqHz: 420,
      endFreqHz: 1450,
      attackMs: 35,
      decayMs: 120,
      releaseMs: 145,
      filterType: "bandpass",
      filterFreqHz: 920,
      defaultGain: 0.36,
      defaultDurationMs: 300,
    }),
    "impact-thud": Object.freeze({
      presetId: "impact-thud",
      labelKo: "충격 타격음",
      oscillatorType: "sine",
      startFreqHz: 175,
      endFreqHz: 42,
      attackMs: 8,
      decayMs: 160,
      releaseMs: 180,
      filterType: "lowpass",
      filterFreqHz: 320,
      defaultGain: 0.68,
      defaultDurationMs: 350,
    }),
    "heartbeat-pulse": Object.freeze({
      presetId: "heartbeat-pulse",
      labelKo: "긴장 심박동",
      oscillatorType: "sine",
      startFreqHz: 92,
      endFreqHz: 46,
      attackMs: 16,
      decayMs: 190,
      releaseMs: 240,
      filterType: "lowpass",
      filterFreqHz: 210,
      defaultGain: 0.54,
      defaultDurationMs: 450,
    }),
    "sparkle-chime": Object.freeze({
      presetId: "sparkle-chime",
      labelKo: "반짝임 차임",
      oscillatorType: "triangle",
      startFreqHz: 1046,
      endFreqHz: 1568,
      attackMs: 12,
      decayMs: 180,
      releaseMs: 260,
      filterType: "highpass",
      filterFreqHz: 680,
      defaultGain: 0.32,
      defaultDurationMs: 460,
    }),
    "paper-turn": Object.freeze({
      presetId: "paper-turn",
      labelKo: "종이 넘김",
      oscillatorType: "noise",
      startFreqHz: 1100,
      endFreqHz: 2200,
      attackMs: 18,
      decayMs: 95,
      releaseMs: 110,
      filterType: "highpass",
      filterFreqHz: 1350,
      defaultGain: 0.28,
      defaultDurationMs: 220,
    }),
    "thunder-rumble": Object.freeze({
      presetId: "thunder-rumble",
      labelKo: "천둥 여운",
      oscillatorType: "noise",
      startFreqHz: 240,
      endFreqHz: 65,
      attackMs: 25,
      decayMs: 420,
      releaseMs: 520,
      filterType: "lowpass",
      filterFreqHz: 260,
      defaultGain: 0.58,
      defaultDurationMs: 960,
    }),
    "rain-ambient": Object.freeze({
      presetId: "rain-ambient",
      labelKo: "빗소리 환경음",
      oscillatorType: "noise",
      startFreqHz: 900,
      endFreqHz: 1200,
      attackMs: 120,
      decayMs: 360,
      releaseMs: 420,
      filterType: "bandpass",
      filterFreqHz: 1150,
      defaultGain: 0.22,
      defaultDurationMs: 900,
    }),
  });

function clampRange(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/**
 * 한국어 의성어·의태어 또는 감정 톤으로부터 ₩0 로컬 WebAudio 효과음 프리셋을 추정한다.
 */
export function inferLocalSfxPreset(
  label: string,
  emotion: CutEmotionTone = "neutral",
): LocalSfxPresetId {
  const normalized = label.trim().toLowerCase();
  if (/쿵|퍽|탁|쾅|쩍|충격|타격|boom|thud|slam/u.test(normalized)) return "impact-thud";
  if (/두근|쿵쾅|심장|맥박|heartbeat|pulse/u.test(normalized)) return "heartbeat-pulse";
  if (/반짝|샤라랑|띠링|빛|설렘|sparkle|chime/u.test(normalized)) return "sparkle-chime";
  if (/우르릉|번개|천둥|벼락|thunder|rumble/u.test(normalized)) return "thunder-rumble";
  if (/주륵|빗소리|비|소나기|rain/u.test(normalized)) return "rain-ambient";
  if (/스윽|휘익|슈욱|휙|바람|전환|whoosh|pan/u.test(normalized)) return "whoosh-pan";
  if (/사락|팔락|넘김|종이|paper/u.test(normalized)) return "paper-turn";
  if (emotion === "tense") return "heartbeat-pulse";
  if (emotion === "shock" || emotion === "action") return "impact-thud";
  if (emotion === "joy") return "sparkle-chime";
  if (emotion === "sad") return "rain-ambient";
  return "whoosh-pan";
}

/**
 * 컷 타임라인 구간(spanStartMs..spanStartMs+spanDurationMs)에 맞춘 효과음 스템 이벤트 배열을 생성한다.
 */
export function buildSfxEventsForSpan(
  cutId: string,
  cutNumber: number,
  emotion: CutEmotionTone,
  triggers: readonly WebtoonCutSfxTrigger[],
  spanStartMs: number,
  spanDurationMs: number,
  maxReelDurationMs: number,
): WebAudioSfxStemEvent[] {
  return triggers.map((trigger, index) => {
    const presetId = trigger.presetId ?? inferLocalSfxPreset(trigger.label, emotion);
    const recipe = LOCAL_WEBAUDIO_SFX_RECIPES[presetId];
    const ratio = clampRange(trigger.offsetRatio ?? (index === 0 ? 0.12 : 0.45), 0, 0.92);
    const rawStartMs = spanStartMs + Math.round(spanDurationMs * ratio);
    const clampedStartMs = Math.round(clampRange(rawStartMs, 0, Math.max(0, maxReelDurationMs - 100)));
    const desiredDuration = Math.round(
      clampRange(trigger.durationMs ?? recipe.defaultDurationMs, 80, 4_000),
    );
    const clampedDuration = Math.max(
      80,
      Math.min(desiredDuration, Math.max(80, maxReelDurationMs - clampedStartMs)),
    );
    const gain = Math.round(clampRange(trigger.gain ?? recipe.defaultGain, 0.05, 0.95) * 100) / 100;

    return {
      stemId: `${cutId}-${trigger.id || `sfx-${index + 1}`}`,
      cutId,
      cutNumber,
      label: trigger.label.trim() || recipe.labelKo,
      presetId,
      startMs: clampedStartMs,
      durationMs: clampedDuration,
      startTimeSec: Math.round(clampedStartMs) / 1000,
      durationSec: Math.round(clampedDuration) / 1000,
      gain,
      recipe,
    };
  });
}

/**
 * ₩0 로컬 WebAudio AudioContext(또는 OfflineAudioContext)에 효과음 스템 스케줄을 예약한다.
 */
export function scheduleWebAudioSfxStems(
  ctx: MinimalWebAudioContextLike,
  stems: readonly WebAudioSfxStemEvent[],
  baseTimeSec = ctx.currentTime,
): number {
  let scheduled = 0;

  for (const stem of stems) {
    const startAt = Math.max(0, baseTimeSec + stem.startTimeSec);
    const durationSec = Math.max(0.08, stem.durationSec);
    const endAt = startAt + durationSec;
    const attackSec = Math.min(durationSec * 0.4, stem.recipe.attackMs / 1000);
    const releaseStartAt = Math.max(
      startAt + attackSec,
      endAt - Math.min(durationSec * 0.45, stem.recipe.releaseMs / 1000),
    );

    const filter = ctx.createBiquadFilter();
    filter.type = stem.recipe.filterType;
    filter.frequency.setValueAtTime(Math.max(40, stem.recipe.filterFreqHz), startAt);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, startAt);
    gainNode.gain.linearRampToValueAtTime(Math.max(0.01, stem.gain), startAt + attackSec);
    gainNode.gain.setValueAtTime(Math.max(0.01, stem.gain * 0.72), releaseStartAt);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, endAt);

    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    if (stem.recipe.oscillatorType === "noise") {
      const sampleCount = Math.max(64, Math.floor(ctx.sampleRate * durationSec));
      const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
      const channel = buffer.getChannelData(0);
      // 결정론적 LCG 노이즈로 실행마다 재현 가능한 스템을 만든다.
      let seed = (stem.cutNumber * 1_664_525 + scheduled * 1_013_904_223 + 0x51a7) >>> 0;
      for (let i = 0; i < channel.length; i += 1) {
        seed = (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
        channel[i] = (seed / 0xffffffff) * 2 - 1;
      }
      const noiseSource = ctx.createBufferSource();
      noiseSource.buffer = buffer;
      noiseSource.connect(filter);
      noiseSource.start(startAt);
      noiseSource.stop(endAt);
    } else {
      const osc = ctx.createOscillator();
      osc.type = stem.recipe.oscillatorType;
      osc.frequency.setValueAtTime(Math.max(20, stem.recipe.startFreqHz), startAt);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, stem.recipe.endFreqHz), endAt);
      osc.connect(filter);
      osc.start(startAt);
      osc.stop(endAt);
    }

    scheduled += 1;
  }

  return scheduled;
}
