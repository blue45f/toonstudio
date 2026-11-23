/**
 * 9:16 / 1:1 / 16:9 숏폼(릴스·쇼츠) 웹툰 키프레임 타임라인 컴파일러.
 *
 * 웹툰 세로 컷 배열을 결정적 프레임 타임라인(Ken Burns 팬·줌 이징, 컷 전환 크로스페이드,
 * WebVTT/SRT 자막 트랙, 감정 기반 BGM·SFX 오디오 큐)으로 컴파일한다.
 * 벽시계(Date/performance)와 난수(Math.random)를 쓰지 않아 같은 입력이면 항상 같은 타임라인이 나온다.
 */

import type { CutsMotionPreset, CutsPanelInput } from "../../nextgen-web-platform/webcodecs-cuts-exporter";
import type { StudioVideoTimeline, StudioVideoTimelineFrame } from "../../studio-webcodecs-timeline";

import {
  DEFAULT_SHORTS_DEMO_CUTS,
  SHORTS_CAMERA_MOTION_LABELS,
  SHORTS_EMOTION_PROFILES,
  SHORTS_FORMAT_SPECS,
  type ShortsAspectRatio,
  type ShortsCameraEasing,
  type ShortsCameraMotion,
  type ShortsCutEmotion,
  type ShortsEmotionAudioProfile,
  type ShortsFormatSpec,
  type ShortsFps,
  type ShortsSfxStyle,
  type ShortsWebtoonCutInput,
} from "./shorts-presets-catalog";

export {
  DEFAULT_SHORTS_DEMO_CUTS,
  SHORTS_CAMERA_MOTION_LABELS,
  SHORTS_EMOTION_PROFILES,
  SHORTS_FORMAT_SPECS,
  type ShortsAspectRatio,
  type ShortsCameraEasing,
  type ShortsCameraMotion,
  type ShortsCutEmotion,
  type ShortsEmotionAudioProfile,
  type ShortsFormatSpec,
  type ShortsFps,
  type ShortsSfxStyle,
  type ShortsWebtoonCutInput,
};

export interface ShortsCompileOptions {
  readonly aspectRatio?: ShortsAspectRatio;
  readonly fps?: ShortsFps;
  readonly crossfadeSec?: number;
  readonly includeSubtitles?: boolean;
  readonly includeAudioCues?: boolean;
  readonly keyFrameIntervalSec?: number;
  readonly locale?: "ko" | "en";
}

export interface ShortsCameraPose {
  readonly scale: number;
  readonly panXRatio: number;
  readonly panYRatio: number;
  readonly translateXPx: number;
  readonly translateYPx: number;
}

export interface ShortsCutSegment {
  readonly cutIndex: number;
  readonly cutId: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly dialogue: string | null;
  readonly emotion: ShortsCutEmotion;
  readonly cameraMotion: ShortsCameraMotion;
  readonly easing: ShortsCameraEasing;
  readonly startSec: number;
  readonly endSec: number;
  readonly durationSec: number;
  readonly startFrame: number;
  readonly endFrame: number;
  readonly crossfadeInSec: number;
  readonly crossfadeOutSec: number;
  readonly startPose: ShortsCameraPose;
  readonly midPose: ShortsCameraPose;
  readonly endPose: ShortsCameraPose;
}

export interface ShortsTimelineFrame {
  readonly frameIndex: number;
  readonly timestampUs: number;
  readonly durationUs: number;
  readonly timeSec: number;
  readonly keyFrame: boolean;
  readonly cutIndex: number;
  readonly cutId: string;
  readonly cutProgress: number;
  readonly emotion: ShortsCutEmotion;
  readonly pose: ShortsCameraPose;
  readonly opacity: number;
  readonly crossfadeProgress: number;
  readonly incomingCutId: string | null;
  readonly activeDialogue: string | null;
  readonly activeAudioCueId: string | null;
}

export interface ShortsKeyframeSummary {
  readonly cutId: string;
  readonly marker: "start" | "mid" | "end";
  readonly frameIndex: number;
  readonly timeSec: number;
  readonly pose: ShortsCameraPose;
  readonly opacity: number;
}

export interface ShortsSubtitleCue {
  readonly index: number;
  readonly cutId: string;
  readonly startSec: number;
  readonly endSec: number;
  readonly text: string;
}

export interface ShortsAudioCue {
  readonly cueId: string;
  readonly cutId: string;
  readonly emotion: ShortsCutEmotion;
  readonly startSec: number;
  readonly endSec: number;
  readonly triggerSec: number;
  readonly chordHz: readonly [number, number, number];
  readonly sfxPulseHz: number;
  readonly sfxStyle: ShortsSfxStyle;
  readonly bgmGain: number;
  readonly sfxGain: number;
  readonly labelKo: string;
  readonly labelEn: string;
}

export interface CompiledShortsTimeline {
  readonly aspectRatio: ShortsAspectRatio;
  readonly width: number;
  readonly height: number;
  readonly fps: ShortsFps;
  readonly crossfadeSec: number;
  readonly totalDurationSec: number;
  readonly totalDurationUs: number;
  readonly totalFrames: number;
  readonly keyFrameIntervalFrames: number;
  readonly segments: readonly ShortsCutSegment[];
  readonly keyframes: readonly ShortsKeyframeSummary[];
  readonly frames: readonly ShortsTimelineFrame[];
  readonly subtitleCues: readonly ShortsSubtitleCue[];
  readonly audioCues: readonly ShortsAudioCue[];
  readonly webVtt: string;
  readonly srt: string;
}

const MICROSECONDS_PER_SECOND = 1_000_000;
const MIN_CUT_DURATION_SEC = 0.5;
const MAX_CUT_DURATION_SEC = 30;
const DEFAULT_CROSSFADE_SEC = 0.35;
const DEFAULT_KEYFRAME_INTERVAL_SEC = 2;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

export function evaluateCameraEasing(easing: ShortsCameraEasing, rawProgress: number): number {
  const t = clamp(rawProgress, 0, 1);
  switch (easing) {
    case "linear":
      return t;
    case "ease-out-cubic":
      return 1 - (1 - t) ** 3;
    case "ease-in-out-sine":
      return -(Math.cos(Math.PI * t) - 1) / 2;
    case "ease-out-expo":
      return t >= 1 ? 1 : 1 - 2 ** (-10 * t);
  }
}

export function evaluateShortsCameraPose(params: {
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
  readonly motion: ShortsCameraMotion;
  readonly easing: ShortsCameraEasing;
  readonly progress: number;
  readonly focalX?: number;
  readonly focalY?: number;
}): ShortsCameraPose {
  const eased = evaluateCameraEasing(params.easing, params.progress);
  const srcW = Math.max(64, params.sourceWidth);
  const srcH = Math.max(64, params.sourceHeight);
  const dstW = Math.max(64, params.targetWidth);
  const dstH = Math.max(64, params.targetHeight);
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  const tallSlack = clamp((dstRatio / srcRatio - 1) * 0.5, 0.08, 0.45);
  const focalOffsetX = (clamp(params.focalX ?? 0.5, 0, 1) - 0.5) * 0.16;
  const focalOffsetY = (clamp(params.focalY ?? 0.5, 0, 1) - 0.5) * 0.16;

  let scale = 1;
  let panXRatio = focalOffsetX;
  let panYRatio = focalOffsetY;

  switch (params.motion) {
    case "ken-burns-in":
      scale = 1 + eased * 0.16;
      panXRatio = focalOffsetX + (eased - 0.5) * 0.05;
      panYRatio = focalOffsetY - eased * 0.04;
      break;
    case "ken-burns-out":
      scale = 1.18 - eased * 0.18;
      panXRatio = focalOffsetX + (0.5 - eased) * 0.04;
      panYRatio = focalOffsetY + (eased - 0.5) * 0.03;
      break;
    case "vertical-pan":
      scale = 1.08;
      panXRatio = focalOffsetX;
      panYRatio = tallSlack * (0.5 - eased);
      break;
    case "horizontal-pan":
      scale = 1.12;
      panXRatio = (eased - 0.5) * 0.12;
      panYRatio = focalOffsetY;
      break;
    case "dramatic-push":
      scale = 1 + eased * 0.26;
      panXRatio = focalOffsetX;
      panYRatio = focalOffsetY - eased * 0.06;
      break;
  }

  return {
    scale: round3(scale),
    panXRatio: round3(panXRatio),
    panYRatio: round3(panYRatio),
    translateXPx: round3(panXRatio * dstW),
    translateYPx: round3(panYRatio * dstH),
  };
}

function formatSubtitleTime(seconds: number, decimalSeparator: "." | ","): string {
  const totalMs = Math.round(Math.max(0, seconds) * 1_000);
  const ms = totalMs % 1_000;
  const totalSec = Math.floor(totalMs / 1_000);
  const secs = totalSec % 60;
  const totalMin = Math.floor(totalSec / 60);
  const mins = totalMin % 60;
  const hours = Math.floor(totalMin / 60);
  const pad2 = (n: number): string => String(n).padStart(2, "0");
  const pad3 = (n: number): string => String(n).padStart(3, "0");
  return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}${decimalSeparator}${pad3(ms)}`;
}

export function buildShortsWebVtt(cues: readonly ShortsSubtitleCue[]): string {
  const lines: string[] = ["WEBVTT", ""];
  for (const cue of cues) {
    lines.push(
      String(cue.index),
      `${formatSubtitleTime(cue.startSec, ".")} --> ${formatSubtitleTime(cue.endSec, ".")}`,
      cue.text,
      "",
    );
  }
  return lines.join("\n");
}

export function buildShortsSrt(cues: readonly ShortsSubtitleCue[]): string {
  const lines: string[] = [];
  for (const cue of cues) {
    lines.push(
      String(cue.index),
      `${formatSubtitleTime(cue.startSec, ",")} --> ${formatSubtitleTime(cue.endSec, ",")}`,
      cue.text,
      "",
    );
  }
  return lines.join("\n");
}

function resolveDialogueForLocale(cut: ShortsWebtoonCutInput, locale: "ko" | "en"): string | null {
  if (locale === "en") {
    const en = cut.dialogueEn?.trim();
    if (en) return en;
    const raw = cut.dialogue?.trim();
    return raw && !/[가-힣]/u.test(raw) ? raw : null;
  }
  const ko = cut.dialogue?.trim();
  return ko || null;
}

export function compileShortsTimeline(
  cuts: readonly ShortsWebtoonCutInput[],
  options?: ShortsCompileOptions,
): CompiledShortsTimeline {
  const safeCuts = cuts.length > 0 ? cuts : DEFAULT_SHORTS_DEMO_CUTS;
  const aspectRatio: ShortsAspectRatio = options?.aspectRatio ?? "9:16";
  const format = SHORTS_FORMAT_SPECS[aspectRatio];
  const fps: ShortsFps = options?.fps === 60 ? 60 : 30;
  const includeSubtitles = options?.includeSubtitles ?? true;
  const includeAudioCues = options?.includeAudioCues ?? true;
  const locale: "ko" | "en" = options?.locale ?? "ko";
  const keyFrameIntervalSec = clamp(options?.keyFrameIntervalSec ?? DEFAULT_KEYFRAME_INTERVAL_SEC, 0.5, 10);
  const keyFrameIntervalFrames = Math.max(1, Math.round(fps * keyFrameIntervalSec));

  const normalizedDurations = safeCuts.map((cut) =>
    round3(clamp(cut.durationSec, MIN_CUT_DURATION_SEC, MAX_CUT_DURATION_SEC)),
  );
  const shortestCutSec = Math.min(...normalizedDurations);
  const requestedCrossfade = options?.crossfadeSec ?? DEFAULT_CROSSFADE_SEC;
  const crossfadeSec =
    safeCuts.length <= 1 ? 0 : round3(clamp(requestedCrossfade, 0, shortestCutSec * 0.4));

  const rawTotalDurationSec = round3(normalizedDurations.reduce((sum, sec) => sum + sec, 0));
  const totalFrames = Math.max(1, Math.round(rawTotalDurationSec * fps));

  const segments: ShortsCutSegment[] = [];
  const keyframes: ShortsKeyframeSummary[] = [];
  const subtitleCues: ShortsSubtitleCue[] = [];
  const audioCues: ShortsAudioCue[] = [];

  let cursorSec = 0;
  let cursorFrame = 0;

  for (let idx = 0; idx < safeCuts.length; idx += 1) {
    const cut = safeCuts[idx];
    if (!cut) continue;
    const durationSec = normalizedDurations[idx] ?? 2;
    const isLast = idx === safeCuts.length - 1;
    const startSec = round3(cursorSec);
    const endSec = isLast ? rawTotalDurationSec : round3(cursorSec + durationSec);
    const startFrame = cursorFrame;
    const endFrame = isLast
      ? totalFrames - 1
      : Math.min(totalFrames - 1, Math.max(startFrame, Math.round(endSec * fps) - 1));

    const profile = SHORTS_EMOTION_PROFILES[cut.emotion];
    const cameraMotion = cut.cameraMotion ?? profile.defaultMotion;
    const easing = cut.easing ?? profile.defaultEasing;
    const sourceWidth = Math.max(64, Math.round(cut.width));
    const sourceHeight = Math.max(64, Math.round(cut.height));
    const dialogue = includeSubtitles ? resolveDialogueForLocale(cut, locale) : null;
    const titleKo = cut.titleKo?.trim() || `${idx + 1}컷 · ${profile.labelKo}`;
    const titleEn = cut.titleEn?.trim() || `Cut ${idx + 1} · ${profile.labelEn}`;
    const crossfadeInSec = idx > 0 ? crossfadeSec : 0;
    const crossfadeOutSec = !isLast ? crossfadeSec : 0;

    const poseBase = {
      sourceWidth,
      sourceHeight,
      targetWidth: format.width,
      targetHeight: format.height,
      motion: cameraMotion,
      easing,
      focalX: cut.focalX,
      focalY: cut.focalY,
    };

    const startPose = evaluateShortsCameraPose({ ...poseBase, progress: 0 });
    const midPose = evaluateShortsCameraPose({ ...poseBase, progress: 0.5 });
    const endPose = evaluateShortsCameraPose({ ...poseBase, progress: 1 });

    segments.push({
      cutIndex: idx,
      cutId: cut.cutId,
      sourceWidth,
      sourceHeight,
      titleKo,
      titleEn,
      dialogue,
      emotion: cut.emotion,
      cameraMotion,
      easing,
      startSec,
      endSec,
      durationSec: round3(endSec - startSec),
      startFrame,
      endFrame,
      crossfadeInSec,
      crossfadeOutSec,
      startPose,
      midPose,
      endPose,
    });

    const midFrame = Math.round((startFrame + endFrame) / 2);
    keyframes.push(
      {
        cutId: cut.cutId,
        marker: "start",
        frameIndex: startFrame,
        timeSec: startSec,
        pose: startPose,
        opacity: idx > 0 && crossfadeInSec > 0 ? 0.5 : 1,
      },
      {
        cutId: cut.cutId,
        marker: "mid",
        frameIndex: midFrame,
        timeSec: round3((startSec + endSec) / 2),
        pose: midPose,
        opacity: 1,
      },
      {
        cutId: cut.cutId,
        marker: "end",
        frameIndex: endFrame,
        timeSec: endSec,
        pose: endPose,
        opacity: !isLast && crossfadeOutSec > 0 ? 0.5 : 1,
      },
    );

    if (dialogue) {
      subtitleCues.push({
        index: subtitleCues.length + 1,
        cutId: cut.cutId,
        startSec,
        endSec,
        text: dialogue,
      });
    }

    if (includeAudioCues) {
      audioCues.push({
        cueId: `audio-${cut.cutId}`,
        cutId: cut.cutId,
        emotion: cut.emotion,
        startSec,
        endSec,
        triggerSec: startSec,
        chordHz: profile.chordHz,
        sfxPulseHz: profile.sfxPulseHz,
        sfxStyle: profile.sfxStyle,
        bgmGain: profile.bgmGain,
        sfxGain: profile.sfxGain,
        labelKo: `${profile.labelKo} · ${profile.sfxLabelKo}`,
        labelEn: `${profile.labelEn} · ${profile.sfxLabelEn}`,
      });
    }

    cursorSec = endSec;
    cursorFrame = Math.min(totalFrames - 1, endFrame + 1);
  }

  const frames: ShortsTimelineFrame[] = [];
  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    const timestampUs = Math.round((frameIndex * MICROSECONDS_PER_SECOND) / fps);
    const nextTimestampUs = Math.round(((frameIndex + 1) * MICROSECONDS_PER_SECOND) / fps);
    const durationUs = Math.max(1, nextTimestampUs - timestampUs);
    const timeSec = round3(timestampUs / MICROSECONDS_PER_SECOND);

    let segment = segments[segments.length - 1];
    for (const candidate of segments) {
      if (frameIndex >= candidate.startFrame && frameIndex <= candidate.endFrame) {
        segment = candidate;
        break;
      }
    }
    if (!segment) break;

    const cutInput = safeCuts[segment.cutIndex];
    const spanFrames = Math.max(1, segment.endFrame - segment.startFrame);
    const cutProgress = clamp((frameIndex - segment.startFrame) / spanFrames, 0, 1);

    const pose = evaluateShortsCameraPose({
      sourceWidth: segment.sourceWidth,
      sourceHeight: segment.sourceHeight,
      targetWidth: format.width,
      targetHeight: format.height,
      motion: segment.cameraMotion,
      easing: segment.easing,
      progress: cutProgress,
      focalX: cutInput?.focalX,
      focalY: cutInput?.focalY,
    });

    const elapsedInCutSec = Math.max(0, timeSec - segment.startSec);
    const remainingInCutSec = Math.max(0, segment.endSec - timeSec);
    let opacity = 1;
    let crossfadeProgress = 0;
    let incomingCutId: string | null = null;

    if (segment.crossfadeInSec > 0 && elapsedInCutSec < segment.crossfadeInSec) {
      const fadeRatio = clamp(elapsedInCutSec / segment.crossfadeInSec, 0, 1);
      opacity = round3(0.5 + fadeRatio * 0.5);
    } else if (segment.crossfadeOutSec > 0 && remainingInCutSec < segment.crossfadeOutSec) {
      const outRatio = clamp(1 - remainingInCutSec / segment.crossfadeOutSec, 0, 1);
      opacity = round3(1 - outRatio * 0.5);
      crossfadeProgress = round3(outRatio);
      incomingCutId = segments[segment.cutIndex + 1]?.cutId ?? null;
    }

    frames.push({
      frameIndex,
      timestampUs,
      durationUs,
      timeSec,
      keyFrame: frameIndex % keyFrameIntervalFrames === 0 || frameIndex === segment.startFrame,
      cutIndex: segment.cutIndex,
      cutId: segment.cutId,
      cutProgress: round3(cutProgress),
      emotion: segment.emotion,
      pose,
      opacity,
      crossfadeProgress,
      incomingCutId,
      activeDialogue: segment.dialogue,
      activeAudioCueId: includeAudioCues ? `audio-${segment.cutId}` : null,
    });
  }

  const lastFrame = frames[frames.length - 1];
  const totalDurationUs = lastFrame ? lastFrame.timestampUs + lastFrame.durationUs : 0;

  return {
    aspectRatio,
    width: format.width,
    height: format.height,
    fps,
    crossfadeSec,
    totalDurationSec: rawTotalDurationSec,
    totalDurationUs,
    totalFrames: frames.length,
    keyFrameIntervalFrames,
    segments,
    keyframes,
    frames,
    subtitleCues,
    audioCues,
    webVtt: buildShortsWebVtt(subtitleCues),
    srt: buildShortsSrt(subtitleCues),
  };
}

export function toStudioVideoTimeline(compiled: CompiledShortsTimeline): StudioVideoTimeline {
  const frames: StudioVideoTimelineFrame[] = compiled.frames.map((frame) => ({
    index: frame.frameIndex,
    sourceIndex: frame.cutIndex,
    timestampUs: frame.timestampUs,
    durationUs: frame.durationUs,
    keyFrame: frame.keyFrame,
  }));
  return {
    fps: compiled.fps,
    frames,
    durationUs: compiled.totalDurationUs,
    keyFrameIntervalFrames: compiled.keyFrameIntervalFrames,
    defaultFrameDurationNs: Math.round((1_000 * MICROSECONDS_PER_SECOND) / compiled.fps),
  };
}

function mapLegacyPresetToMotionAndEmotion(preset: CutsMotionPreset): {
  readonly motion: ShortsCameraMotion;
  readonly emotion: ShortsCutEmotion;
} {
  switch (preset) {
    case "vertical-pan":
      return { motion: "vertical-pan", emotion: "calm" };
    case "ken-burns-zoom":
      return { motion: "ken-burns-in", emotion: "tension" };
    case "parallax-depth":
      return { motion: "horizontal-pan", emotion: "joy" };
    case "dramatic-push":
      return { motion: "dramatic-push", emotion: "impact" };
    case "gentle-breathe":
      return { motion: "ken-burns-out", emotion: "melancholy" };
  }
}

export function adaptLegacyCutsPanels(
  panels: readonly CutsPanelInput[],
  defaultSourceWidth = 800,
  defaultSourceHeight = 2000,
): readonly ShortsWebtoonCutInput[] {
  return panels.map((panel, index) => {
    const mapped = mapLegacyPresetToMotionAndEmotion(panel.motionPreset);
    return {
      cutId: panel.id || `legacy-cut-${index + 1}`,
      width: defaultSourceWidth,
      height: defaultSourceHeight,
      titleKo: panel.title,
      titleEn: `Cut ${index + 1}`,
      dialogue: panel.caption,
      emotion: mapped.emotion,
      durationSec: panel.durationSec ?? 4,
      cameraMotion: mapped.motion,
    };
  });
}
