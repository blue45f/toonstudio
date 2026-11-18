/**
 * 스크롤 여백 호흡(`gutterPaces`)·시간대 색온도 무드(`manuscriptMood`)·컷 진입 말풍선 팝인(`bubblePopScale`)·
 * 효과음 미세 진동(`sfxShakeOffset`)·절차적 Web Audio 효과음 + 무드별 앰비언트 화성 패드 BGM 2채널 믹서(`synthesizeMotionTeaserAudioPcm`) 및
 * 다국어 `WebVTT (.vtt)` 자막 트랙(`buildMotionTeaserWebVtt`) 연동 9:16 숏폼 모션 코믹 티저(WebM) 순수 스케줄러·합성 모듈.
 *
 * 아키텍처 계약 (`src/architecture.test.ts`):
 * - DOM / MediaRecorder / AudioContext / Math.random 의존성 없이 Node·브라우저 양쪽에서 100% 결정적으로 동작한다.
 * - 실제 브라우저 스트림 인코딩(`MediaRecorder` + `captureStream` + `AudioContext`)은 `webtoon-motion-teaser.browser.ts`가 담당한다.
 */
import { failVisible, isLabFailure, recipeDigest } from "../contracts";

import { VTT_MIME, WEBM_MIME, exportFileName, isWebmEbml } from "./export-session";
import {
  DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES,
  DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
  DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
  DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  DEFAULT_WEBTOON_STRIP_SFX_STAMPS,
  DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
  WEBTOON_MANUSCRIPT_MOODS,
  captureWebtoonVerticalStripRaster,
  clampWebtoonStripLayout,
  computeStripAutoPanTimeline,
  renderTransparentDialogueTextLayer,
  renderTransparentSfxStampLayer,
  renderTransparentSpeechBubbleFrameLayer,
  resolveSfxGlyphByLocale,
  sampleAutoPanScrollState,
} from "./webtoon-strip-composer";

import type { ExportDeps, ExportOutcome, MotionTeaserReceiptMetrics } from "./export-session";
import type {
  ExportWebtoonVerticalStripOptions,
  StripAutoPanTimeline,
  WebtoonDialogueLocale,
  WebtoonManuscriptMoodId,
  WebtoonSfxStampOption,
  WebtoonStripBubbleShapes,
  WebtoonStripDialogueLines,
  WebtoonStripGutterPaces,
  WebtoonStripLayout,
  WebtoonStripMangaFxOptions,
  WebtoonStripSfxStamps,
  WebtoonStripSpeakerTarget,
  WebtoonStripSpeakerTargets,
} from "./webtoon-strip-composer";
import type { CapturedRaster, CharacterEngine, CharacterRecipe, LabFailure } from "../contracts";

export const DEFAULT_MOTION_TEASER_FPS = 24;
export const MIN_MOTION_TEASER_FPS = 12;
export const MAX_MOTION_TEASER_FPS = 30;
export const MOTION_TEASER_AUDIO_SAMPLE_RATE = 22_050;

/**
 * 시간대 원고 무드별 무저작권 절차적 앰비언트 화성 코드 패드 주파수(Hz, 4성부 보이싱).
 */
export const MOOD_AMBIENT_CHORD_HZ: Readonly<
  Record<WebtoonManuscriptMoodId, readonly [number, number, number, number]>
> = Object.freeze({
  "daylight-paper": [174.61, 220.0, 261.63, 329.63], // Fmaj7 포근한 한낮 어쿠스틱 패드
  "twilight-amber": [146.83, 220.0, 261.63, 329.63], // Dm9 노을빛 서정 패드
  "midnight-noir": [130.81, 155.56, 196.0, 246.94], // Cm(maj7) 느와르 미스터리 패드
  "backlit-awakening": [110.0, 164.81, 220.0, 246.94], // Asus2/A5 역광 각성 에테르 패드
});

export type MotionTeaserResolutionPresetId = "sd-540x960" | "hd-720x1280";

export interface MotionTeaserResolutionSpec {
  readonly id: MotionTeaserResolutionPresetId;
  readonly width: number;
  readonly height: number;
  readonly labelKo: string;
}

export const WEBTOON_MOTION_TEASER_RESOLUTIONS: Readonly<
  Record<MotionTeaserResolutionPresetId, MotionTeaserResolutionSpec>
> = Object.freeze({
  "sd-540x960": {
    id: "sd-540x960",
    width: 540,
    height: 960,
    labelKo: "숏폼 표준 9:16 (540×960)",
  },
  "hd-720x1280": {
    id: "hd-720x1280",
    width: 720,
    height: 1280,
    labelKo: "숏폼 HD 9:16 (720×1280)",
  },
});

export interface CutKineticOverlayPlacement {
  readonly cutIndex: 0 | 1 | 2 | 3;
  readonly innerX: number;
  readonly innerY: number;
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly bubbleOverlay: CapturedRaster | null;
  readonly sfxOverlay: CapturedRaster | null;
}

export interface MotionTeaserFrameSample {
  readonly frameIndex: number;
  readonly outputTimeMs: number;
  readonly timelineElapsedMs: number;
  readonly scrollRatio01: number;
  readonly activeCutIndex: 0 | 1 | 2 | 3;
  /** 컷 체류 구간에서 미세한 포커스 호흡감을 주는 배율 (1.000..1.028) */
  readonly dwellZoom: number;
  /** 각 컷(0..3) 말풍선 팝인 불투명도 (패닝 접근 전 0 → 체류 진입 시 1) */
  readonly cutBubbleAlphas: readonly [number, number, number, number];
  /** 각 컷(0..3) 말풍선 스프링 팝인 배율 (0.78 → 1.04 → 1.00) */
  readonly cutBubbleScales: readonly [number, number, number, number];
  /** 활성 컷 효과음 임팩트 미세 진동 오프셋(px) */
  readonly shakeOffsetX: number;
  readonly shakeOffsetY: number;
  readonly progress01: number;
}

export interface MotionTeaserSchedule {
  readonly timeline: StripAutoPanTimeline;
  readonly fps: number;
  readonly speed: number;
  readonly outputDurationMs: number;
  readonly frameCount: number;
  readonly frames: readonly MotionTeaserFrameSample[];
}

export interface MotionTeaserCameraWindow {
  readonly srcX: number;
  readonly srcY: number;
  readonly srcWidth: number;
  readonly srcHeight: number;
}

export interface PlanMotionTeaserOptions {
  readonly fps?: number;
  readonly speed?: number;
  readonly sfxStamps?: WebtoonStripSfxStamps;
}

export interface SynthesizeMotionAudioOptions {
  readonly includeAmbientBgm?: boolean;
  readonly moodId?: WebtoonManuscriptMoodId;
}

export interface MotionTeaserAudioTrackPcm {
  readonly sampleRate: number;
  readonly durationMs: number;
  readonly eventCount: number;
  readonly ambientBgm: boolean;
  readonly samples: Float32Array;
}

export interface EncodeMotionTeaserWebmRequest {
  readonly strip: CapturedRaster;
  readonly layout: WebtoonStripLayout;
  readonly schedule: MotionTeaserSchedule;
  readonly outWidth: number;
  readonly outHeight: number;
  readonly moodId: WebtoonManuscriptMoodId;
  readonly kineticOverlays?: readonly CutKineticOverlayPlacement[];
  readonly audioPcm?: MotionTeaserAudioTrackPcm | null;
  readonly onFrameProgress?: (frameIndex: number, totalFrames: number, activeCutIndex: 0 | 1 | 2 | 3) => void;
}

export type EncodeMotionTeaserWebmFn = (request: EncodeMotionTeaserWebmRequest) => Promise<Uint8Array>;

export interface ExportWebtoonMotionTeaserOptions extends ExportWebtoonVerticalStripOptions {
  readonly resolutionPreset?: MotionTeaserResolutionPresetId;
  readonly fps?: number;
  readonly playbackSpeed?: number;
  /** 컷 체류 진입 말풍선 팝인·효과음 진동 활성화 여부(기본 true) */
  readonly kineticPopIn?: boolean;
  /** 외부 음원 없는 절차적 Web Audio 효과음 오디오 트랙 합성 여부(기본 true) */
  readonly synthesizeAudioSfx?: boolean;
  /** 시간대 원고 무드 연동 절차적 앰비언트 BGM 화성 패드 믹싱 여부(기본 false) */
  readonly includeAmbientBgm?: boolean;
}

export interface BuildMotionTeaserWebVttOptions {
  readonly episodeTitleKo?: string;
  readonly locale?: WebtoonDialogueLocale;
  readonly dialogueLines?: WebtoonStripDialogueLines;
  readonly bubbleShapes?: WebtoonStripBubbleShapes;
  readonly speakerTargets?: WebtoonStripSpeakerTargets;
  readonly sfxStamps?: WebtoonStripSfxStamps;
  readonly cueOffsetMs?: number;
  readonly cueIndexOffset?: number;
  readonly omitHeader?: boolean;
}

const defaultNow = (): number => Date.now();

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function softLimitSample(raw: number): number {
  const shaped = Math.tanh(raw * 1.08) * 0.95;
  return Math.max(-0.95, Math.min(0.95, shaped));
}

function computeDwellZoomAt(timeline: StripAutoPanTimeline, timelineElapsedMs: number): number {
  const total = Math.max(1, timeline.totalDurationMs);
  const t = ((timelineElapsedMs % total) + total) % total;
  for (let i = 0; i < 4; i += 1) {
    const seg = timeline.segments[i as 0 | 1 | 2 | 3]!;
    if (t >= seg.dwellStartMs && t <= seg.dwellEndMs) {
      const span = Math.max(1, seg.dwellEndMs - seg.dwellStartMs);
      const phase = (t - seg.dwellStartMs) / span;
      return Number((1 + Math.sin(phase * Math.PI) * 0.028).toFixed(5));
    }
  }
  return 1;
}

/**
 * 컷 체류(`dwellStartMs`) 진입 시 말풍선 스프링 팝인 배율·알파 및 효과음 미세 진동을 결정적으로 계산한다.
 */
export function computeCutKineticMotionState(
  timeline: StripAutoPanTimeline,
  sfxStamps: WebtoonStripSfxStamps,
  timelineElapsedMs: number,
): {
  readonly cutBubbleAlphas: readonly [number, number, number, number];
  readonly cutBubbleScales: readonly [number, number, number, number];
  readonly shakeOffsetX: number;
  readonly shakeOffsetY: number;
} {
  const alphas: [number, number, number, number] = [0, 0, 0, 0];
  const scales: [number, number, number, number] = [0.78, 0.78, 0.78, 0.78];
  let shakeX = 0;
  let shakeY = 0;

  for (let i = 0; i < 4; i += 1) {
    const cutIdx = i as 0 | 1 | 2 | 3;
    const seg = timeline.segments[cutIdx]!;
    const dt = timelineElapsedMs - seg.dwellStartMs;
    if (dt < 0) {
      alphas[cutIdx] = 0;
      scales[cutIdx] = 0.78;
      continue;
    }
    const alpha01 = Math.min(1, dt / 140);
    alphas[cutIdx] = Number(alpha01.toFixed(4));
    if (dt < 220) {
      const p = dt / 220;
      const overshoot = 1 - Math.pow(1 - p, 3) * Math.cos(p * Math.PI * 1.35);
      scales[cutIdx] = Number((0.78 + 0.22 * overshoot).toFixed(4));
    } else {
      scales[cutIdx] = 1;
    }

    const sfx = sfxStamps[cutIdx];
    if (sfx !== "none" && dt >= 30 && dt <= 310) {
      const sfxPhase = (dt - 30) / 280;
      const decay = Math.pow(1 - sfxPhase, 1.8);
      if (sfx === "kugugung" || sfx === "beonjjeok") {
        shakeX = Number((Math.sin(sfxPhase * Math.PI * 11) * 3.6 * decay).toFixed(3));
        shakeY = Number((Math.cos(sfxPhase * Math.PI * 9) * 2.8 * decay).toFixed(3));
      } else if (sfx === "dugeun" || sfx === "pat") {
        shakeX = 0;
        shakeY = Number((-Math.abs(Math.sin(sfxPhase * Math.PI * 4)) * 2.2 * decay).toFixed(3));
      } else if (sfx === "seureung") {
        shakeX = Number((Math.sin(sfxPhase * Math.PI * 6) * 2.6 * decay).toFixed(3));
        shakeY = Number((-Math.sin(sfxPhase * Math.PI * 6) * 1.4 * decay).toFixed(3));
      } else {
        shakeX = Number((Math.sin(sfxPhase * Math.PI * 3) * 1.6 * decay).toFixed(3));
      }
    }
  }

  return {
    cutBubbleAlphas: alphas,
    cutBubbleScales: scales,
    shakeOffsetX: shakeX,
    shakeOffsetY: shakeY,
  };
}

/**
 * 4컷 레이아웃과 스크롤 여백 호흡(`gutterPaces`)으로부터 결정적 9:16 모션 코믹 프레임 스케줄을 계산한다.
 */
export function planMotionTeaserSchedule(
  layout: WebtoonStripLayout,
  gutterPaces: WebtoonStripGutterPaces = DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  options: PlanMotionTeaserOptions = {},
): MotionTeaserSchedule {
  const timeline = computeStripAutoPanTimeline(layout, gutterPaces);
  const fps = Math.round(clampNumber(options.fps, MIN_MOTION_TEASER_FPS, MAX_MOTION_TEASER_FPS, DEFAULT_MOTION_TEASER_FPS));
  const speed = Number(clampNumber(options.speed, 0.5, 2.0, 1.0).toFixed(2));
  const sfxStamps = options.sfxStamps ?? DEFAULT_WEBTOON_STRIP_SFX_STAMPS;
  const outputDurationMs = Math.max(400, Math.round(timeline.totalDurationMs / speed));
  const frameCount = Math.max(8, Math.round((outputDurationMs / 1000) * fps));

  const frames: MotionTeaserFrameSample[] = [];
  for (let idx = 0; idx < frameCount; idx += 1) {
    const progress01 = frameCount > 1 ? idx / (frameCount - 1) : 0;
    const outputTimeMs = Math.round(progress01 * outputDurationMs);
    const timelineElapsedMs = Math.min(timeline.totalDurationMs - 0.001, progress01 * timeline.totalDurationMs);
    const sampled = sampleAutoPanScrollState(timeline, timelineElapsedMs);
    const dwellZoom = computeDwellZoomAt(timeline, timelineElapsedMs);
    const kinetic = computeCutKineticMotionState(timeline, sfxStamps, timelineElapsedMs);
    frames.push({
      frameIndex: idx,
      outputTimeMs,
      timelineElapsedMs,
      scrollRatio01: sampled.scrollRatio01,
      activeCutIndex: sampled.activeCutIndex,
      dwellZoom,
      cutBubbleAlphas: kinetic.cutBubbleAlphas,
      cutBubbleScales: kinetic.cutBubbleScales,
      shakeOffsetX: kinetic.shakeOffsetX,
      shakeOffsetY: kinetic.shakeOffsetY,
      progress01,
    });
  }

  return {
    timeline,
    fps,
    speed,
    outputDurationMs,
    frameCount,
    frames,
  };
}

function synthesizeMoodAmbientPadBed(
  samples: Float32Array,
  sampleRate: number,
  moodId: WebtoonManuscriptMoodId,
): void {
  const chord = MOOD_AMBIENT_CHORD_HZ[moodId] ?? MOOD_AMBIENT_CHORD_HZ["daylight-paper"];
  const total = samples.length;
  if (total <= 0) return;
  const fadeInSamples = Math.max(1, Math.min(Math.floor(total * 0.2), Math.floor(sampleRate * 0.18)));
  const fadeOutSamples = Math.max(1, Math.min(Math.floor(total * 0.25), Math.floor(sampleRate * 0.24)));
  const voiceWeights = [0.34, 0.27, 0.22, 0.17] as const;

  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate;
    const fadeIn = i < fadeInSamples ? 0.5 * (1 - Math.cos((Math.PI * i) / fadeInSamples)) : 1;
    const rem = total - 1 - i;
    const fadeOut = rem < fadeOutSamples ? 0.5 * (1 - Math.cos((Math.PI * rem) / fadeOutSamples)) : 1;
    // 완만한 호흡 모듈레이션(0.45Hz)으로 루프 이음새 없는 따뜻한 앰비언트 패드 형성 (-18dB ≈ 0.125 peak)
    const shimmer = 0.86 + 0.14 * Math.sin(2 * Math.PI * 0.45 * t);
    let pad = 0;
    for (let v = 0; v < 4; v += 1) {
      const freq = chord[v]!;
      const detuned = freq * (1 + (v - 1.5) * 0.0018);
      const voice =
        Math.sin(2 * Math.PI * freq * t + v * 0.6) * 0.68 +
        Math.sin(2 * Math.PI * detuned * t + v * 1.1) * 0.32;
      pad += voice * voiceWeights[v]!;
    }
    samples[i] = softLimitSample((samples[i] ?? 0) + pad * 0.125 * shimmer * fadeIn * fadeOut);
  }
}

function synthesizeSingleSfxEvent(
  samples: Float32Array,
  sampleRate: number,
  startSec: number,
  stamp: Exclude<WebtoonSfxStampOption, "none">,
): void {
  const startIdx = Math.max(0, Math.floor(startSec * sampleRate));
  const durationSec =
    stamp === "kugugung" ? 0.44 : stamp === "dugeun" ? 0.36 : stamp === "ssaa" ? 0.40 : 0.26;
  const count = Math.min(samples.length - startIdx, Math.floor(durationSec * sampleRate));
  if (count <= 0) return;

  for (let i = 0; i < count; i += 1) {
    const t = i / sampleRate;
    const u = i / count;
    const env = Math.sin(Math.min(1, u * 8) * Math.PI * 0.5) * Math.pow(1 - u, 1.65);
    let wave: number;

    if (stamp === "dugeun") {
      // 두근: 심장 고동 2연타 저역 펄스
      const beat1 = t < 0.15 ? Math.sin(2 * Math.PI * (74 - t * 90) * t) * Math.pow(1 - t / 0.15, 1.8) : 0;
      const dt2 = t - 0.16;
      const beat2 = dt2 >= 0 && dt2 < 0.18 ? Math.sin(2 * Math.PI * (86 - dt2 * 100) * dt2) * Math.pow(1 - dt2 / 0.18, 1.7) : 0;
      wave = (beat1 + beat2 * 0.92) * 0.42;
    } else if (stamp === "seureung") {
      // 스릉: 금속성 발도 상향 FM 스윕
      const freq = 580 + 1920 * Math.pow(u, 0.72);
      wave = (Math.sin(2 * Math.PI * freq * t) * 0.65 + Math.sin(2 * Math.PI * freq * 2.03 * t) * 0.35) * env * 0.28;
    } else if (stamp === "kugugung") {
      // 쿠구궁: 저주파 지진 서브베이스 진동
      const mod = Math.sin(2 * Math.PI * 19 * t) * 1.4;
      wave = (Math.sin(2 * Math.PI * 52 * t + mod) * 0.7 + Math.sin(2 * Math.PI * 104 * t) * 0.3) * env * 0.38;
    } else if (stamp === "pat") {
      // 팟: 맑은 섬광 벨 하모닉 차임
      wave = (Math.sin(2 * Math.PI * 1318.5 * t) * 0.6 + Math.sin(2 * Math.PI * 1975.5 * t) * 0.4) * env * 0.26;
    } else if (stamp === "beonjjeok") {
      // 번쩍: 각성 전기 처프 스윕
      const chirp = 1960 - 1320 * Math.abs(u - 0.38);
      wave = (Math.sin(2 * Math.PI * chirp * t) * 0.7 + Math.sin(2 * Math.PI * (chirp * 1.5) * t) * 0.3) * env * 0.28;
    } else {
      // 싸아: 서늘한 밤바람 배음 클러스터(Math.random 없는 결정적 다중 사인 합성)
      const cluster =
        Math.sin(2 * Math.PI * 311.1 * t) * 0.34 +
        Math.sin(2 * Math.PI * 466.2 * t + 0.7) * 0.28 +
        Math.sin(2 * Math.PI * 739.9 * t + 1.9) * 0.22 +
        Math.sin(2 * Math.PI * 1174.7 * t + 3.1) * 0.16;
      wave = cluster * env * 0.24;
    }

    samples[startIdx + i] = softLimitSample((samples[startIdx + i] ?? 0) + wave);
  }
}

/**
 * 컷별 효과음 스탬프(`sfxStamps`)·무드별 앰비언트 화성 BGM 패드(`includeAmbientBgm`)와 오토패닝 스케줄을 동기화해 결정적 모노 PCM 트랙을 합성한다.
 */
export function synthesizeMotionTeaserAudioPcm(
  schedule: MotionTeaserSchedule,
  sfxStamps: WebtoonStripSfxStamps,
  sampleRate = MOTION_TEASER_AUDIO_SAMPLE_RATE,
  options: SynthesizeMotionAudioOptions = {},
): MotionTeaserAudioTrackPcm {
  const safeRate = Math.max(8_000, Math.min(48_000, Math.floor(sampleRate)));
  const totalSamples = Math.max(256, Math.ceil((schedule.outputDurationMs / 1000) * safeRate));
  const samples = new Float32Array(totalSamples);
  const ambientBgm = options.includeAmbientBgm === true;

  if (ambientBgm) {
    synthesizeMoodAmbientPadBed(samples, safeRate, options.moodId ?? "daylight-paper");
  }

  let eventCount = 0;
  for (let i = 0; i < 4; i += 1) {
    const cutIdx = i as 0 | 1 | 2 | 3;
    const stamp = sfxStamps[cutIdx];
    if (stamp === "none") continue;
    const seg = schedule.timeline.segments[cutIdx]!;
    const startSec = (seg.dwellStartMs / Math.max(0.25, schedule.speed) + 35) / 1000;
    synthesizeSingleSfxEvent(samples, safeRate, startSec, stamp);
    eventCount += 1;
  }

  return {
    sampleRate: safeRate,
    durationMs: schedule.outputDurationMs,
    eventCount,
    ambientBgm,
    samples,
  };
}

/**
 * 밀리초 타임스탬프를 표준 `WebVTT` 시각 문자열(`HH:MM:SS.mmm`)로 변환한다.
 */
export function formatWebVttTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(Number.isFinite(ms) ? ms : 0));
  const hours = Math.floor(clamped / 3_600_000);
  const minutes = Math.floor((clamped % 3_600_000) / 60_000);
  const seconds = Math.floor((clamped % 60_000) / 1_000);
  const millis = clamped % 1_000;
  const pad2 = (n: number): string => String(n).padStart(2, "0");
  const pad3 = (n: number): string => String(n).padStart(3, "0");
  return `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}.${pad3(millis)}`;
}

function resolveVoiceLabelByLocale(
  cutIndex: number,
  speakerTarget: WebtoonStripSpeakerTarget,
  shape: WebtoonStripBubbleShapes[number],
  locale: WebtoonDialogueLocale,
): string {
  if (shape === "monologue-box") {
    return locale === "en" ? "Narration" : locale === "ja" ? "モノローグ" : "내레이션";
  }
  const effectivePartner =
    speakerTarget === "partner" || (speakerTarget === "auto" && cutIndex % 2 === 1);
  if (locale === "en") return effectivePartner ? "Partner" : "Lead";
  if (locale === "ja") return effectivePartner ? "相手役" : "主演";
  return effectivePartner ? "상대역" : "주연";
}

function sanitizeVttCueText(raw: string): string {
  return raw.replace(/-->/gu, "→").replace(/[\r\n]+/gu, " ").trim();
}

/**
 * 9:16 모션 코믹 스케줄(`dwellStartMs`..`dwellEndMs`)과 다국어 대사·발화자·효과음을 동기화한 `WebVTT (.vtt)` 자막 문자열을 생성한다.
 */
export function buildMotionTeaserWebVtt(
  schedule: MotionTeaserSchedule,
  options: BuildMotionTeaserWebVttOptions = {},
): string {
  const locale = options.locale ?? "ko";
  const lines = options.dialogueLines ?? DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES;
  const shapes = options.bubbleShapes ?? DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES;
  const speakers = options.speakerTargets ?? DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS;
  const sfxStamps = options.sfxStamps ?? DEFAULT_WEBTOON_STRIP_SFX_STAMPS;
  const speed = Math.max(0.25, schedule.speed);
  const offsetMs = Math.max(0, Math.round(options.cueOffsetMs ?? 0));
  const cueIdxOffset = Math.max(0, Math.floor(options.cueIndexOffset ?? 0));

  const outLines: string[] = [];
  if (!options.omitHeader) {
    outLines.push("WEBVTT");
    const titleNote = options.episodeTitleKo?.trim() ? ` — ${sanitizeVttCueText(options.episodeTitleKo)}` : "";
    outLines.push(`NOTE ToonStudio 9:16 Motion Comic Subtitles (${locale.toUpperCase()})${titleNote}`);
    outLines.push("");
  }

  let cueSeq = cueIdxOffset + 1;
  for (let i = 0; i < 4; i += 1) {
    const cutIdx = i as 0 | 1 | 2 | 3;
    const seg = schedule.timeline.segments[cutIdx]!;
    const startMs = offsetMs + Math.round(seg.dwellStartMs / speed);
    const endMs = Math.max(startMs + 250, offsetMs + Math.round(seg.dwellEndMs / speed));
    const shape = shapes[cutIdx];
    const dialogue = shape !== "none" ? sanitizeVttCueText(lines[cutIdx]) : "";
    const stamp = sfxStamps[cutIdx];
    const sfxTag =
      stamp !== "none"
        ? locale === "en"
          ? `[SFX: ${resolveSfxGlyphByLocale(stamp, "en")}]`
          : locale === "ja"
            ? `[効果音: ${resolveSfxGlyphByLocale(stamp, "ja")}]`
            : `[효과음: ${resolveSfxGlyphByLocale(stamp, "ko")}]`
        : "";

    if (!dialogue && !sfxTag) continue;
    const voice = resolveVoiceLabelByLocale(cutIdx, speakers[cutIdx], shape, locale);
    const payload = dialogue && sfxTag ? `${sfxTag} ${dialogue}` : dialogue || sfxTag;

    outLines.push(`cut-${cueSeq}`);
    outLines.push(`${formatWebVttTimestamp(startMs)} --> ${formatWebVttTimestamp(endMs)} line:86% align:center`);
    outLines.push(`<v ${voice}>${payload}`);
    outLines.push("");
    cueSeq += 1;
  }

  return `${outLines.join("\n").trimEnd()}\n`;
}

/**
 * 엔진 캡처 없이도 현재 4컷 디렉터 설정과 여백 호흡으로부터 즉시 `WebVTT (.vtt)` 자막 트랙을 내보낸다.
 */
export function exportWebtoonMotionTeaserVtt(
  recipe: CharacterRecipe,
  options: ExportWebtoonMotionTeaserOptions,
  deps: ExportDeps = {},
): ExportOutcome {
  const now = deps.now ?? defaultNow;
  const started = now();
  try {
    const gutterPaces = options.gutterPaces ?? DEFAULT_WEBTOON_STRIP_GUTTER_PACES;
    const layout = clampWebtoonStripLayout(
      options.stripWidth,
      options.includeBubbleSafeZone ?? true,
      gutterPaces,
    );
    const sfxStamps =
      options.mangaFx?.enabled && options.mangaFx.sfxStamps
        ? options.mangaFx.sfxStamps
        : DEFAULT_WEBTOON_STRIP_SFX_STAMPS;
    const schedule = planMotionTeaserSchedule(layout, gutterPaces, {
      ...(options.fps !== undefined ? { fps: options.fps } : {}),
      ...(options.playbackSpeed !== undefined ? { speed: options.playbackSpeed } : {}),
      sfxStamps,
    });
    const locale = options.mangaFx?.locale ?? "ko";
    const vttText = buildMotionTeaserWebVtt(schedule, {
      locale,
      dialogueLines: options.mangaFx?.dialogueLines ?? DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES,
      bubbleShapes: options.mangaFx?.bubbleShapes ?? DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES,
      speakerTargets: options.mangaFx?.speakerTargets ?? DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS,
      sfxStamps,
    });
    const bytes = new TextEncoder().encode(vttText);
    const digest8 = recipeDigest(recipe).slice(0, 8);
    const speedTag = schedule.speed !== 1 ? `-${String(schedule.speed).replace(".", "_")}x` : "";
    const fileName = `character-${digest8}-webtoon-4cut-${locale}${speedTag}-teaser.vtt`;
    return {
      ok: true,
      bytes,
      receipt: {
        kind: "vtt",
        fileName,
        mime: VTT_MIME,
        bytes: bytes.length,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: toMotionFailure("export-vtt-failed", "9:16 모션 코믹 WebVTT 자막 파일 생성에 실패했습니다.", error, started),
    };
  }
}

/**
 * 4컷 각각의 투명 말풍선(프레임+대사)과 투명 효과음 스탬프 오버레이 래스터를 생성한다.
 */
export function buildCutKineticOverlays(
  layout: WebtoonStripLayout,
  mangaFx?: WebtoonStripMangaFxOptions,
): readonly CutKineticOverlayPlacement[] {
  if (!mangaFx?.enabled) return [];
  const innerWidth = layout.cutWidth;
  const innerHeight = layout.bubbleSafeTopPx + layout.cutHeight;
  const frameHeight = innerHeight + layout.borderPx * 2;
  const gutterHeights = layout.gutterHeights ?? [layout.gutterY, layout.gutterY, layout.gutterY];

  const overlays: CutKineticOverlayPlacement[] = [];
  let cursorY = layout.marginY;
  for (let idx = 0; idx < 4; idx += 1) {
    const cutIdx = idx as 0 | 1 | 2 | 3;
    const innerX = layout.marginX + layout.borderPx;
    const innerY = cursorY + layout.borderPx;
    cursorY += frameHeight + (idx < 3 ? (gutterHeights[idx as 0 | 1 | 2] ?? layout.gutterY) : 0);

    const shape = (mangaFx.bubbleShapes ?? DEFAULT_WEBTOON_STRIP_BUBBLE_SHAPES)[cutIdx];
    const dialogueText = (mangaFx.dialogueLines ?? DEFAULT_WEBTOON_STRIP_DIALOGUE_LINES)[cutIdx];
    const fontScale = (mangaFx.bubbleFontScales ?? DEFAULT_WEBTOON_STRIP_BUBBLE_FONT_SCALES)[cutIdx];
    const speakerTarget = (mangaFx.speakerTargets ?? DEFAULT_WEBTOON_STRIP_SPEAKER_TARGETS)[cutIdx];
    const sfx = (mangaFx.sfxStamps ?? DEFAULT_WEBTOON_STRIP_SFX_STAMPS)[cutIdx];

    let bubbleOverlay: CapturedRaster | null = null;
    if (mangaFx.includeSpeechBubbles !== false && shape !== "none") {
      const frameLayer = renderTransparentSpeechBubbleFrameLayer(innerWidth, innerHeight, {
        shape,
        speakerTarget,
        partnerSide: mangaFx.partnerSide ?? "right",
        locale: mangaFx.locale ?? "ko",
        jaWritingMode: mangaFx.jaWritingMode ?? "horizontal",
        dialogueText,
        cutIndex: cutIdx,
      });
      const textLayer = renderTransparentDialogueTextLayer(innerWidth, innerHeight, {
        dialogueText,
        shape,
        fontScale,
        speakerTarget,
        partnerSide: mangaFx.partnerSide ?? "right",
        locale: mangaFx.locale ?? "ko",
        jaWritingMode: mangaFx.jaWritingMode ?? "horizontal",
        cutIndex: cutIdx,
      });
      const merged = new Uint8ClampedArray(frameLayer.rgba);
      for (let p = 0; p < merged.length; p += 4) {
        const ta = (textLayer.rgba[p + 3] ?? 0) / 255;
        if (ta <= 0) continue;
        const ba = (merged[p + 3] ?? 0) / 255;
        const outA = ta + ba * (1 - ta);
        if (outA <= 0) continue;
        merged[p] = Math.round(((textLayer.rgba[p] ?? 0) * ta + (merged[p] ?? 0) * ba * (1 - ta)) / outA);
        merged[p + 1] = Math.round(((textLayer.rgba[p + 1] ?? 0) * ta + (merged[p + 1] ?? 0) * ba * (1 - ta)) / outA);
        merged[p + 2] = Math.round(((textLayer.rgba[p + 2] ?? 0) * ta + (merged[p + 2] ?? 0) * ba * (1 - ta)) / outA);
        merged[p + 3] = Math.round(outA * 255);
      }
      bubbleOverlay = { width: innerWidth, height: innerHeight, rgba: merged };
    }

    const sfxOverlay =
      sfx !== "none"
        ? renderTransparentSfxStampLayer(innerWidth, innerHeight, {
            stamp: sfx,
            speakerTarget,
            partnerSide: mangaFx.partnerSide ?? "right",
            locale: mangaFx.locale ?? "ko",
            cutIndex: cutIdx,
          })
        : null;

    overlays.push({
      cutIndex: cutIdx,
      innerX,
      innerY,
      innerWidth,
      innerHeight,
      bubbleOverlay,
      sfxOverlay,
    });
  }
  return overlays;
}

/**
 * 세로 4컷 스트립(`stripWidth × stripHeight`) 안에서 9:16 세로형 카메라가 비추는 소스 영역을 계산한다.
 */
export function computeMotionTeaserCameraWindow(
  stripWidth: number,
  stripHeight: number,
  scrollRatio01: number,
  dwellZoom = 1,
  outAspectWidthOverHeight = 9 / 16,
  shakeOffsetX = 0,
  shakeOffsetY = 0,
): MotionTeaserCameraWindow {
  const safeZoom = clampNumber(dwellZoom, 1, 1.12, 1);
  const safeRatio = clampNumber(scrollRatio01, 0, 1, 0);
  const srcWidth = Math.max(8, stripWidth / safeZoom);
  const idealHeight = srcWidth / Math.max(0.25, outAspectWidthOverHeight);
  const srcHeight = Math.min(stripHeight, Math.max(8, idealHeight));
  const maxSrcX = Math.max(0, stripWidth - srcWidth);
  const maxScrollY = Math.max(0, stripHeight - srcHeight);
  const srcX = Math.min(maxSrcX, Math.max(0, (stripWidth - srcWidth) * 0.5 + shakeOffsetX));
  const srcY = Math.min(maxScrollY, Math.max(0, maxScrollY * safeRatio + shakeOffsetY));
  return { srcX, srcY, srcWidth, srcHeight };
}

function compositeKineticOverlayOnStripCoord(
  sx: number,
  sy: number,
  overlay: CutKineticOverlayPlacement,
  popAlpha01: number,
  popScale: number,
): readonly [number, number, number, number] | null {
  if (popAlpha01 <= 0.01) return null;
  const cx = overlay.innerX + overlay.innerWidth * 0.5;
  const cy = overlay.innerY + overlay.innerHeight * 0.22;
  const invScale = 1 / Math.max(0.5, popScale);
  const lx = cx + (sx - cx) * invScale - overlay.innerX;
  const ly = cy + (sy - cy) * invScale - overlay.innerY;
  if (lx < 0 || lx >= overlay.innerWidth - 1 || ly < 0 || ly >= overlay.innerHeight - 1) return null;
  const ix = Math.round(lx);
  const iy = Math.round(ly);
  const idx = (iy * overlay.innerWidth + ix) * 4;

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 0;
  if (overlay.bubbleOverlay) {
    const ba = ((overlay.bubbleOverlay.rgba[idx + 3] ?? 0) / 255) * popAlpha01;
    if (ba > 0.01) {
      r = overlay.bubbleOverlay.rgba[idx] ?? 0;
      g = overlay.bubbleOverlay.rgba[idx + 1] ?? 0;
      b = overlay.bubbleOverlay.rgba[idx + 2] ?? 0;
      a = ba;
    }
  }
  if (overlay.sfxOverlay) {
    const sa = ((overlay.sfxOverlay.rgba[idx + 3] ?? 0) / 255) * popAlpha01;
    if (sa > 0.01) {
      const outA = sa + a * (1 - sa);
      r = Math.round(((overlay.sfxOverlay.rgba[idx] ?? 0) * sa + r * a * (1 - sa)) / outA);
      g = Math.round(((overlay.sfxOverlay.rgba[idx + 1] ?? 0) * sa + g * a * (1 - sa)) / outA);
      b = Math.round(((overlay.sfxOverlay.rgba[idx + 2] ?? 0) * sa + b * a * (1 - sa)) / outA);
      a = outA;
    }
  }
  return a > 0.01 ? [r, g, b, a] : null;
}

/**
 * 순수 CPU 쌍선형(bilinear) 보간으로 특정 프레임 샘플의 9:16 RGBA 버퍼를 결정적으로 렌더링한다.
 */
export function renderMotionTeaserFrameRgba(
  strip: CapturedRaster,
  outWidth: number,
  outHeight: number,
  sample: Pick<
    MotionTeaserFrameSample,
    "scrollRatio01" | "dwellZoom" | "progress01"
  > &
    Partial<Pick<MotionTeaserFrameSample, "cutBubbleAlphas" | "cutBubbleScales" | "shakeOffsetX" | "shakeOffsetY">>,
  moodId: WebtoonManuscriptMoodId = "daylight-paper",
  includeProgressBar = true,
  kineticOverlays: readonly CutKineticOverlayPlacement[] = [],
): CapturedRaster {
  const safeW = Math.max(16, Math.floor(outWidth));
  const safeH = Math.max(16, Math.floor(outHeight));
  const out = new Uint8ClampedArray(safeW * safeH * 4);
  const moodSpec = WEBTOON_MANUSCRIPT_MOODS[moodId] ?? WEBTOON_MANUSCRIPT_MOODS["daylight-paper"];
  const [mr, mg, mb] = moodSpec.stripMarginRgb;

  const cam = computeMotionTeaserCameraWindow(
    strip.width,
    strip.height,
    sample.scrollRatio01,
    sample.dwellZoom,
    safeW / safeH,
    sample.shakeOffsetX ?? 0,
    sample.shakeOffsetY ?? 0,
  );

  const aspectRatio = cam.srcWidth / Math.max(1, cam.srcHeight);
  const targetAspect = safeW / safeH;
  const drawHeight = aspectRatio > targetAspect ? Math.max(1, Math.round(safeW / aspectRatio)) : safeH;
  const dstTop = Math.floor((safeH - drawHeight) * 0.5);
  const dstBottom = dstTop + drawHeight;

  for (let i = 0; i < out.length; i += 4) {
    out[i] = mr;
    out[i + 1] = mg;
    out[i + 2] = mb;
    out[i + 3] = 255;
  }

  const src = strip.rgba;
  const sw = strip.width;
  const sh = strip.height;
  const alphas = sample.cutBubbleAlphas ?? [1, 1, 1, 1];
  const scales = sample.cutBubbleScales ?? [1, 1, 1, 1];

  for (let py = dstTop; py < dstBottom; py += 1) {
    const ny = drawHeight > 1 ? (py - dstTop) / (drawHeight - 1) : 0;
    const sy = Math.min(sh - 1, Math.max(0, cam.srcY + ny * (cam.srcHeight - 1)));
    const y0 = Math.floor(sy);
    const y1 = Math.min(sh - 1, y0 + 1);
    const fy = sy - y0;

    for (let px = 0; px < safeW; px += 1) {
      const nx = safeW > 1 ? px / (safeW - 1) : 0;
      const sx = Math.min(sw - 1, Math.max(0, cam.srcX + nx * (cam.srcWidth - 1)));
      const x0 = Math.floor(sx);
      const x1 = Math.min(sw - 1, x0 + 1);
      const fx = sx - x0;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      let r = Math.round((src[i00] ?? 0) * w00 + (src[i10] ?? 0) * w10 + (src[i01] ?? 0) * w01 + (src[i11] ?? 0) * w11);
      let g = Math.round((src[i00 + 1] ?? 0) * w00 + (src[i10 + 1] ?? 0) * w10 + (src[i01 + 1] ?? 0) * w01 + (src[i11 + 1] ?? 0) * w11);
      let b = Math.round((src[i00 + 2] ?? 0) * w00 + (src[i10 + 2] ?? 0) * w10 + (src[i01 + 2] ?? 0) * w01 + (src[i11 + 2] ?? 0) * w11);

      for (let oi = 0; oi < kineticOverlays.length; oi += 1) {
        const ov = kineticOverlays[oi]!;
        const sampledOv = compositeKineticOverlayOnStripCoord(
          sx,
          sy,
          ov,
          alphas[ov.cutIndex],
          scales[ov.cutIndex],
        );
        if (sampledOv) {
          const oa = sampledOv[3];
          r = Math.round(sampledOv[0] * oa + r * (1 - oa));
          g = Math.round(sampledOv[1] * oa + g * (1 - oa));
          b = Math.round(sampledOv[2] * oa + b * (1 - oa));
        }
      }

      const dst = (py * safeW + px) * 4;
      out[dst] = r;
      out[dst + 1] = g;
      out[dst + 2] = b;
      out[dst + 3] = 255;
    }
  }

  if (includeProgressBar) {
    const barHeight = Math.max(3, Math.round(safeH * 0.005));
    const yStart = Math.max(0, safeH - barHeight);
    const filledWidth = Math.min(safeW, Math.max(2, Math.round(safeW * clampNumber(sample.progress01, 0, 1, 0))));
    for (let py = yStart; py < safeH; py += 1) {
      const rowOffset = py * safeW * 4;
      for (let px = 0; px < safeW; px += 1) {
        const dst = rowOffset + px * 4;
        if (px < filledWidth) {
          out[dst] = 228;
          out[dst + 1] = 179;
          out[dst + 2] = 99;
        } else {
          out[dst] = Math.round((out[dst] ?? 0) * 0.45 + 18 * 0.55);
          out[dst + 1] = Math.round((out[dst + 1] ?? 0) * 0.45 + 17 * 0.55);
          out[dst + 2] = Math.round((out[dst + 2] ?? 0) * 0.45 + 15 * 0.55);
        }
        out[dst + 3] = 255;
      }
    }
  }

  return { width: safeW, height: safeH, rgba: out };
}

function toMotionFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

/**
 * 4컷 웹툰 스트립을 캡처·합성한 뒤 오토패닝·말풍선 팝인·Web Audio 효과음/앰비언트 BGM 스케줄에 맞춰 9:16 WebM 비디오로 내보낸다.
 */
export async function exportWebtoonMotionTeaserWebm(
  engine: CharacterEngine,
  options: ExportWebtoonMotionTeaserOptions,
  encodeWebm: EncodeMotionTeaserWebmFn,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const useKineticPopIn = options.kineticPopIn !== false && options.mangaFx?.enabled === true;

  // 키네틱 팝인 활성 시 베이스 스트립에는 배경·스크린톤·효과선·캐릭터만 굽고, 말풍선·효과음은 컷별 투명 오버레이로 분리해 팝인 애니메이션을 준다.
  const captureOptions: ExportWebtoonVerticalStripOptions = useKineticPopIn && options.mangaFx
    ? {
        ...options,
        mangaFx: {
          ...options.mangaFx,
          includeSpeechBubbles: false,
          sfxStamps: ["none", "none", "none", "none"],
        },
      }
    : options;

  const captured = await captureWebtoonVerticalStripRaster(engine, captureOptions, { now });
  if (!captured.ok) return captured;

  const presetSpec =
    WEBTOON_MOTION_TEASER_RESOLUTIONS[options.resolutionPreset ?? "sd-540x960"] ??
    WEBTOON_MOTION_TEASER_RESOLUTIONS["sd-540x960"];
  const gutterPaces = options.gutterPaces ?? DEFAULT_WEBTOON_STRIP_GUTTER_PACES;
  const activeSfxStamps: WebtoonStripSfxStamps =
    options.mangaFx?.enabled && options.mangaFx.sfxStamps
      ? options.mangaFx.sfxStamps
      : DEFAULT_WEBTOON_STRIP_SFX_STAMPS;

  const schedule = planMotionTeaserSchedule(captured.layout, gutterPaces, {
    ...(options.fps !== undefined ? { fps: options.fps } : {}),
    ...(options.playbackSpeed !== undefined ? { speed: options.playbackSpeed } : {}),
    sfxStamps: activeSfxStamps,
  });

  const kineticOverlays = useKineticPopIn ? buildCutKineticOverlays(captured.layout, options.mangaFx) : [];
  const includeBgm = options.includeAmbientBgm === true;
  const audioPcm =
    options.synthesizeAudioSfx !== false || includeBgm
      ? synthesizeMotionTeaserAudioPcm(
          schedule,
          options.synthesizeAudioSfx !== false ? activeSfxStamps : ["none", "none", "none", "none"],
          MOTION_TEASER_AUDIO_SAMPLE_RATE,
          { includeAmbientBgm: includeBgm, moodId: captured.effectiveMood },
        )
      : null;

  const stripBytes = captured.composed.rgba.byteLength;
  const outFrameBytes = presetSpec.width * presetSpec.height * 4;
  const overlayBytes = kineticOverlays.reduce(
    (sum, ov) => sum + (ov.bubbleOverlay?.rgba.byteLength ?? 0) + (ov.sfxOverlay?.rgba.byteLength ?? 0),
    0,
  );
  const audioBytes = audioPcm?.samples.byteLength ?? 0;
  const peakRasterMb = Number(((stripBytes + outFrameBytes + overlayBytes + audioBytes) / (1024 * 1024)).toFixed(2));

  try {
    const encodeStarted = now();
    const bytes = await encodeWebm({
      strip: captured.composed,
      layout: captured.layout,
      schedule,
      outWidth: presetSpec.width,
      outHeight: presetSpec.height,
      moodId: captured.effectiveMood,
      ...(kineticOverlays.length > 0 ? { kineticOverlays } : {}),
      audioPcm,
      onFrameProgress: (frameIdx, totalFrames, cutIdx) => {
        if (frameIdx === 0 || frameIdx === totalFrames - 1 || frameIdx % 8 === 0) {
          options.onProgress?.(
            frameIdx + 1,
            totalFrames,
            `9:16 모션 티저 인코딩 (${cutIdx + 1}컷 · ${frameIdx + 1}/${totalFrames}f)`,
          );
        }
      },
    });
    if (!isWebmEbml(bytes)) {
      return {
        ok: false,
        failure: failVisible(
          "export-webm-invalid",
          "인코더가 유효한 WebM(EBML) 바이너리를 생성하지 못했습니다.",
          undefined,
          started,
        ),
      };
    }

    const encodeDurationMs = Math.max(0, now() - encodeStarted);
    const motionMetrics: MotionTeaserReceiptMetrics = {
      frameCount: schedule.frameCount,
      avgFrameMs: Number((encodeDurationMs / Math.max(1, schedule.frameCount)).toFixed(2)),
      peakRasterMb,
      audioEvents: audioPcm?.eventCount ?? 0,
      ...(includeBgm ? { ambientBgm: true } : {}),
    };

    const baseName = exportFileName("webm", captured.provenance.recipeDigest, presetSpec.width, presetSpec.height);
    const speedTag = schedule.speed !== 1 ? `-${String(schedule.speed).replace(".", "_")}x` : "";
    const sfxTag = (audioPcm?.eventCount ?? 0) > 0 ? "-sfx" : "";
    const bgmTag = includeBgm ? "-bgm" : "";
    const fileName = baseName.replace(/\.webm$/u, `${captured.suffixTags}${sfxTag}${bgmTag}${speedTag}-teaser.webm`);
    return {
      ok: true,
      bytes,
      receipt: {
        kind: "webm",
        fileName,
        mime: WEBM_MIME,
        bytes: bytes.length,
        width: presetSpec.width,
        height: presetSpec.height,
        settleSteps: captured.settleSteps,
        provenance: captured.provenance,
        motion: motionMetrics,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: toMotionFailure("export-webm-encode", "9:16 숏폼 WebM 모션 티저 인코딩에 실패했습니다.", error, started),
    };
  }
}
