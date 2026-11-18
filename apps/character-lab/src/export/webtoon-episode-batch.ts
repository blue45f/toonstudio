/**
 * 에피소드 콘티 큐시트(`EpisodeCutsheetBeat[]`) 일괄 배치 렌더러 (`webtoon-episode-batch.ts`).
 *
 * 단일 회차에 쌓아둔 `N`개의 4컷 비트(`4×N`컷)를 순회하여:
 * 1) 장편 세로 원고 스트립 PNG (`exportEpisodeCutsheetLongStripPng` — `MAX_PNG_EXPORT_DIMENSION` 자동 배율 클램프)
 * 2) 연속 `9:16` 숏폼 에피소드 WebM 모션 티저 (`exportEpisodeCutsheetMotionWebm` — 비트 간 오디오 크로스페이드)
 * 3) 누적 타임코드 동기화 다국어 `WebVTT (.vtt)` 자막 (`buildEpisodeCutsheetWebVtt` / `exportEpisodeCutsheetWebVtt`)
 * 4) 제작진 공유용 한국어 스토리보드 큐시트 리포트 (`.storyboard.md`, `exportEpisodeStoryboardMarkdown`)
 * 를 순수 결정적으로 생성한다.
 */
import { failVisible, isLabFailure } from "../contracts";

import {
  MARKDOWN_MIME,
  MAX_PNG_EXPORT_DIMENSION,
  MIN_EXPORT_DIMENSION,
  VTT_MIME,
  WAV_MIME,
  WEBM_MIME,
  isWebmEbml,
} from "./export-session";
import { PNG_MIME, encodePng } from "./png-encoder";
import {
  MOTION_TEASER_AUDIO_SAMPLE_RATE,
  WEBTOON_MOTION_TEASER_RESOLUTIONS,
  buildCutKineticOverlays,
  buildMotionTeaserWebVtt,
  encodeMonoPcm16Wav,
  planMotionTeaserSchedule,
  synthesizeMotionTeaserAudioPcm,
} from "./webtoon-motion-teaser";
import {
  WEBTOON_CUT_CAMERA_PRESETS,
  WEBTOON_MANUSCRIPT_MOODS,
  WEBTOON_SCREENTONE_SPECS,
  WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO,
  WEBTOON_STRIP_GUTTER_PACES,
  captureWebtoonVerticalStripRaster,
  clampWebtoonStripLayout,
  resolveSfxGlyphByLocale,
} from "./webtoon-strip-composer";

import type { ExportDeps, ExportOutcome, MotionTeaserReceiptMetrics } from "./export-session";
import type { EpisodeCutsheetBeat, EpisodeCutsheetDirectorSnapshot } from "./webtoon-episode-cutsheet";
import type {
  CutKineticOverlayPlacement,
  EncodeMotionTeaserWebmFn,
  MotionTeaserAudioTrackPcm,
  MotionTeaserFrameSample,
  MotionTeaserResolutionPresetId,
  MotionTeaserSchedule,
} from "./webtoon-motion-teaser";
import type { ExportWebtoonVerticalStripOptions } from "./webtoon-strip-composer";
import type { ApplyPlan, CaptureProvenance, CapturedRaster, CharacterEngine, LabFailure } from "../contracts";

export interface EpisodeBatchCommonOptions {
  readonly episodeTitleKo: string;
  readonly basePlan?: ApplyPlan | null;
  readonly settleSteps?: number;
  readonly onProgress?: (step: number, total: number, labelKo: string) => void;
}

export interface ExportEpisodeLongStripOptions extends EpisodeBatchCommonOptions {
  readonly requestedStripWidth: number;
}

export interface ExportEpisodeMotionWebmOptions extends EpisodeBatchCommonOptions {
  readonly requestedStripWidth: number;
  readonly resolutionPreset?: MotionTeaserResolutionPresetId;
  readonly fps?: number;
  readonly playbackSpeed?: number;
  readonly includeAmbientBgm?: boolean;
}

export interface EpisodeWebVttOptions {
  readonly requestedStripWidth?: number;
  readonly fps?: number;
  readonly playbackSpeed?: number;
}

const defaultNow = (): number => Date.now();

function toBatchFailure(code: string, reasonKo: string, error: unknown, now: number): LabFailure {
  return isLabFailure(error) ? error : failVisible(code, reasonKo, error, now);
}

function slugifyEpisodePrefix(episodeTitleKo: string): string {
  const slug = episodeTitleKo
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 24);
  return slug.length > 0 ? slug : "episode";
}

function snapshotToStripOptions(
  snap: EpisodeCutsheetDirectorSnapshot,
  stripWidth: number,
  basePlan: ApplyPlan | null | undefined,
  settleSteps: number,
): ExportWebtoonVerticalStripOptions {
  return {
    stripWidth,
    includeBubbleSafeZone: true,
    gutterPaces: snap.gutterPaces,
    manuscriptMood: snap.manuscriptMood,
    screentones: snap.screentones,
    cutCameraPresets: snap.cutCameraPresets,
    ...(snap.actingArc !== "none" && basePlan
      ? {
          actingArc: {
            arcId: snap.actingArc,
            basePlan,
          },
        }
      : {}),
    ...(snap.bakeStripFx
      ? {
          mangaFx: {
            enabled: true,
            locale: snap.locale,
            jaWritingMode: snap.jaWritingMode,
            manuscriptMood: snap.manuscriptMood,
            screentones: snap.screentones,
            linesKind: snap.stripFxLines,
            includeSpeechBubbles: true,
            intensity: 0.78,
            dialogueLines: snap.dialogueLines,
            bubbleShapes: snap.bubbleShapes,
            bubbleFontScales: snap.bubbleFontScales,
            sfxStamps: snap.sfxStamps,
            speakerTargets: snap.speakerTargets,
            partnerSide: snap.partnerSide,
          },
        }
      : {}),
    settleSteps,
  };
}

/**
 * `N`개 비트를 세로로 합쳤을 때 총 높이가 `MAX_PNG_EXPORT_DIMENSION(4096px)` 이하가 되도록 안전한 가로 폭을 탐색한다.
 */
export function resolveSafeEpisodeBatchStripWidth(
  requestedWidth: number,
  beats: readonly EpisodeCutsheetBeat[],
): { readonly stripWidth: number; readonly interBeatGapPx: number; readonly totalHeight: number } {
  const startW = Number.isFinite(requestedWidth)
    ? Math.min(1080, Math.max(MIN_EXPORT_DIMENSION * 2, Math.floor(requestedWidth)))
    : 540;
  let candidateW = startW;

  while (candidateW >= MIN_EXPORT_DIMENSION) {
    const gapPx = Math.max(4, Math.round(candidateW * 0.04));
    let sumH = 0;
    for (const beat of beats) {
      const layout = clampWebtoonStripLayout(candidateW, true, beat.snapshot.gutterPaces);
      sumH += layout.stripHeight;
    }
    sumH += Math.max(0, beats.length - 1) * gapPx;
    if (sumH <= MAX_PNG_EXPORT_DIMENSION) {
      return { stripWidth: candidateW, interBeatGapPx: gapPx, totalHeight: sumH };
    }
    candidateW = Math.max(MIN_EXPORT_DIMENSION, Math.floor(candidateW * 0.86) - 2);
    if (candidateW === MIN_EXPORT_DIMENSION) {
      const minGap = 2;
      let minSum = 0;
      for (const beat of beats) {
        minSum += clampWebtoonStripLayout(MIN_EXPORT_DIMENSION, true, beat.snapshot.gutterPaces).stripHeight;
      }
      minSum += Math.max(0, beats.length - 1) * minGap;
      return { stripWidth: MIN_EXPORT_DIMENSION, interBeatGapPx: minGap, totalHeight: minSum };
    }
  }

  return { stripWidth: MIN_EXPORT_DIMENSION, interBeatGapPx: 2, totalHeight: MIN_EXPORT_DIMENSION * 4 };
}

function stitchVerticalRasters(
  strips: readonly { readonly raster: CapturedRaster; readonly marginRgb: readonly [number, number, number] }[],
  interBeatGapPx: number,
): CapturedRaster {
  const width = strips[0]?.raster.width ?? MIN_EXPORT_DIMENSION;
  const totalHeight =
    strips.reduce((acc, s) => acc + s.raster.height, 0) + Math.max(0, strips.length - 1) * interBeatGapPx;
  const out = new Uint8ClampedArray(width * totalHeight * 4);

  let cursorY = 0;
  for (let i = 0; i < strips.length; i += 1) {
    const item = strips[i]!;
    const byteOffset = cursorY * width * 4;
    out.set(item.raster.rgba, byteOffset);
    cursorY += item.raster.height;

    if (i < strips.length - 1 && interBeatGapPx > 0) {
      const nextMargin = strips[i + 1]!.marginRgb;
      for (let gy = 0; gy < interBeatGapPx; gy += 1) {
        const t = interBeatGapPx > 1 ? gy / (interBeatGapPx - 1) : 0.5;
        const r = Math.round(item.marginRgb[0] * (1 - t) + nextMargin[0] * t);
        const g = Math.round(item.marginRgb[1] * (1 - t) + nextMargin[1] * t);
        const b = Math.round(item.marginRgb[2] * (1 - t) + nextMargin[2] * t);
        let dst = (cursorY + gy) * width * 4;
        for (let x = 0; x < width; x += 1) {
          out[dst] = r;
          out[dst + 1] = g;
          out[dst + 2] = b;
          out[dst + 3] = 255;
          dst += 4;
        }
      }
      cursorY += interBeatGapPx;
    }
  }

  return { width, height: totalHeight, rgba: out };
}

/**
 * 에피소드 큐시트의 모든 4컷 비트를 일괄 캡처해 장편 `4×N`컷 세로 스크롤 원고 PNG 한 장으로 이어 붙여 내보낸다.
 */
export async function exportEpisodeCutsheetLongStripPng(
  engine: CharacterEngine,
  beats: readonly EpisodeCutsheetBeat[],
  options: ExportEpisodeLongStripOptions,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  if (beats.length === 0) {
    return {
      ok: false,
      failure: failVisible(
        "cutsheet-beats-empty",
        "일괄 렌더링할 4컷 씬 비트가 큐시트에 없습니다. 먼저 최소 1개 이상의 씬 비트를 추가하세요.",
        undefined,
        started,
      ),
    };
  }

  const { stripWidth, interBeatGapPx, totalHeight } = resolveSafeEpisodeBatchStripWidth(
    options.requestedStripWidth,
    beats,
  );
  if (totalHeight > MAX_PNG_EXPORT_DIMENSION) {
    return {
      ok: false,
      failure: failVisible(
        "cutsheet-strip-height-limit",
        `큐시트 전체 세로 길이(${totalHeight}px)가 단일 PNG 한계(${MAX_PNG_EXPORT_DIMENSION}px)를 초과합니다. 비트 수를 나누어 내보내세요.`,
        undefined,
        started,
      ),
    };
  }

  const capturedStrips: Array<{ readonly raster: CapturedRaster; readonly marginRgb: readonly [number, number, number] }> = [];
  let lastProvenance: CaptureProvenance | undefined = undefined;

  for (let bIdx = 0; bIdx < beats.length; bIdx += 1) {
    const beat = beats[bIdx]!;
    options.onProgress?.(bIdx + 1, beats.length, `에피소드 장편 원고 합성 · ${beat.cutRangeLabel} (${beat.titleKo})`);
    const stripOpts = snapshotToStripOptions(
      beat.snapshot,
      stripWidth,
      options.basePlan,
      bIdx === 0 ? (options.settleSteps ?? 0) : 0,
    );
    const captured = await captureWebtoonVerticalStripRaster(engine, stripOpts, { now });
    if (!captured.ok) return captured;
    const moodSpec =
      WEBTOON_MANUSCRIPT_MOODS[captured.effectiveMood] ?? WEBTOON_MANUSCRIPT_MOODS["daylight-paper"];
    capturedStrips.push({ raster: captured.composed, marginRgb: moodSpec.stripMarginRgb });
    lastProvenance = captured.provenance;
  }

  try {
    const stitched = stitchVerticalRasters(capturedStrips, interBeatGapPx);
    const bytes = await encodePng(stitched, { filter: "adaptive" });
    const prefix = slugifyEpisodePrefix(options.episodeTitleKo);
    const fileName = `${prefix}-${beats.length * 4}cuts-${stitched.width}x${stitched.height}-long-strip.png`;
    return {
      ok: true,
      bytes,
      receipt: {
        kind: "png",
        fileName,
        mime: PNG_MIME,
        bytes: bytes.length,
        width: stitched.width,
        height: stitched.height,
        ...(lastProvenance ? { provenance: lastProvenance } : {}),
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: toBatchFailure("cutsheet-long-strip-encode", "장편 에피소드 세로 원고 PNG 인코딩에 실패했습니다.", error, started),
    };
  }
}

function concatAudioTracksWithCrossfade(
  tracks: readonly MotionTeaserAudioTrackPcm[],
  sampleRate: number,
  includeAmbientBgm: boolean,
): MotionTeaserAudioTrackPcm {
  const totalSamples = tracks.reduce((sum, t) => sum + t.samples.length, 0);
  const out = new Float32Array(Math.max(256, totalSamples));
  const fadeLen = Math.min(256, Math.floor(sampleRate * 0.02));
  let offset = 0;
  let totalEvents = 0;

  for (let idx = 0; idx < tracks.length; idx += 1) {
    const track = tracks[idx]!;
    totalEvents += track.eventCount;
    for (let i = 0; i < track.samples.length; i += 1) {
      let gain = 1;
      if (idx > 0 && i < fadeLen) gain = i / fadeLen;
      if (idx < tracks.length - 1 && i >= track.samples.length - fadeLen) {
        gain = Math.min(gain, (track.samples.length - 1 - i) / fadeLen);
      }
      out[offset + i] = (track.samples[i] ?? 0) * gain;
    }
    offset += track.samples.length;
  }

  return {
    sampleRate,
    durationMs: tracks.reduce((sum, t) => sum + t.durationMs, 0),
    eventCount: totalEvents,
    ambientBgm: includeAmbientBgm,
    samples: out,
  };
}

/**
 * 에피소드 큐시트의 모든 비트를 연속된 단일 `9:16` 숏폼 WebM 비디오(비트별 효과음·앰비언트 BGM 통합)로 일괄 인코딩한다.
 */
export async function exportEpisodeCutsheetMotionWebm(
  engine: CharacterEngine,
  beats: readonly EpisodeCutsheetBeat[],
  options: ExportEpisodeMotionWebmOptions,
  encodeWebm: EncodeMotionTeaserWebmFn,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  if (beats.length === 0) {
    return {
      ok: false,
      failure: failVisible(
        "cutsheet-beats-empty",
        "일괄 모션 티저로 인코딩할 4컷 씬 비트가 큐시트에 없습니다.",
        undefined,
        started,
      ),
    };
  }

  const presetSpec =
    WEBTOON_MOTION_TEASER_RESOLUTIONS[options.resolutionPreset ?? "sd-540x960"] ??
    WEBTOON_MOTION_TEASER_RESOLUTIONS["sd-540x960"];
  const { stripWidth, interBeatGapPx } = resolveSafeEpisodeBatchStripWidth(
    Math.min(presetSpec.width, options.requestedStripWidth),
    beats,
  );

  const strips: Array<{ readonly raster: CapturedRaster; readonly marginRgb: readonly [number, number, number] }> = [];
  const schedules: MotionTeaserSchedule[] = [];
  const audioTracks: MotionTeaserAudioTrackPcm[] = [];
  const shiftedOverlays: CutKineticOverlayPlacement[] = [];
  let lastProvenance: CaptureProvenance | undefined = undefined;
  let yCursor = 0;

  for (let bIdx = 0; bIdx < beats.length; bIdx += 1) {
    const beat = beats[bIdx]!;
    options.onProgress?.(bIdx + 1, beats.length, `에피소드 9:16 컷 캡처 · ${beat.cutRangeLabel}`);
    const fullOpts = snapshotToStripOptions(
      beat.snapshot,
      stripWidth,
      options.basePlan,
      bIdx === 0 ? (options.settleSteps ?? 0) : 0,
    );
    const useKinetic = fullOpts.mangaFx?.enabled === true;
    const captureOpts: ExportWebtoonVerticalStripOptions =
      useKinetic && fullOpts.mangaFx
        ? {
            ...fullOpts,
            mangaFx: {
              ...fullOpts.mangaFx,
              includeSpeechBubbles: false,
              sfxStamps: ["none", "none", "none", "none"],
            },
          }
        : fullOpts;

    const captured = await captureWebtoonVerticalStripRaster(engine, captureOpts, { now });
    if (!captured.ok) return captured;
    lastProvenance = captured.provenance;

    const moodSpec =
      WEBTOON_MANUSCRIPT_MOODS[captured.effectiveMood] ?? WEBTOON_MANUSCRIPT_MOODS["daylight-paper"];
    strips.push({ raster: captured.composed, marginRgb: moodSpec.stripMarginRgb });

    const sfxStamps = beat.snapshot.bakeStripFx
      ? beat.snapshot.sfxStamps
      : (["none", "none", "none", "none"] as const);
    const beatSchedule = planMotionTeaserSchedule(captured.layout, beat.snapshot.gutterPaces, {
      ...(options.fps !== undefined ? { fps: options.fps } : {}),
      ...(options.playbackSpeed !== undefined ? { speed: options.playbackSpeed } : {}),
      sfxStamps,
    });
    schedules.push(beatSchedule);

    if (useKinetic && fullOpts.mangaFx) {
      const beatOverlays = buildCutKineticOverlays(captured.layout, fullOpts.mangaFx);
      for (const ov of beatOverlays) {
        shiftedOverlays.push({
          ...ov,
          innerY: ov.innerY + yCursor,
        });
      }
    }

    audioTracks.push(
      synthesizeMotionTeaserAudioPcm(beatSchedule, sfxStamps, MOTION_TEASER_AUDIO_SAMPLE_RATE, {
        includeAmbientBgm: options.includeAmbientBgm === true,
        moodId: captured.effectiveMood,
      }),
    );

    yCursor += captured.composed.height + (bIdx < beats.length - 1 ? interBeatGapPx : 0);
  }

  const stitchedStrip = stitchVerticalRasters(strips, interBeatGapPx);
  const camWinHeight = Math.min(stitchedStrip.height, Math.max(8, stitchedStrip.width / (9 / 16)));
  const globalMaxScrollY = Math.max(1, stitchedStrip.height - camWinHeight);

  const combinedFrames: MotionTeaserFrameSample[] = [];
  const totalOutputDurationMs = schedules.reduce((sum, s) => sum + s.outputDurationMs, 0);
  const totalFrameCount = schedules.reduce((sum, s) => sum + s.frameCount, 0);

  let yBase = 0;
  let timeOffsetMs = 0;
  let globalFrameIdx = 0;

  for (let bIdx = 0; bIdx < schedules.length; bIdx += 1) {
    const sched = schedules[bIdx]!;
    const stripH = strips[bIdx]!.raster.height;
    const localMaxScroll = Math.max(0, stripH - Math.min(stripH, camWinHeight));
    for (const f of sched.frames) {
      const localY = localMaxScroll * f.scrollRatio01;
      const globalY = Math.min(globalMaxScrollY, yBase + localY);
      const globalProgress = totalFrameCount > 1 ? globalFrameIdx / (totalFrameCount - 1) : 0;
      combinedFrames.push({
        ...f,
        frameIndex: globalFrameIdx,
        outputTimeMs: timeOffsetMs + f.outputTimeMs,
        scrollRatio01: Number((globalY / globalMaxScrollY).toFixed(5)),
        progress01: globalProgress,
      });
      globalFrameIdx += 1;
    }
    yBase += stripH + interBeatGapPx;
    timeOffsetMs += sched.outputDurationMs;
  }

  const firstSched = schedules[0]!;
  const combinedSchedule: MotionTeaserSchedule = {
    timeline: firstSched.timeline,
    fps: firstSched.fps,
    speed: firstSched.speed,
    outputDurationMs: totalOutputDurationMs,
    frameCount: combinedFrames.length,
    frames: combinedFrames,
  };
  const mergedAudio = concatAudioTracksWithCrossfade(
    audioTracks,
    MOTION_TEASER_AUDIO_SAMPLE_RATE,
    options.includeAmbientBgm === true,
  );
  const firstLayout = clampWebtoonStripLayout(stripWidth, true, beats[0]!.snapshot.gutterPaces);
  const dominantMood = beats[0]!.snapshot.manuscriptMood;

  const peakRasterMb = Number(
    (
      (stitchedStrip.rgba.byteLength +
        presetSpec.width * presetSpec.height * 4 +
        mergedAudio.samples.byteLength) /
      (1024 * 1024)
    ).toFixed(2),
  );

  try {
    const encodeStarted = now();
    const bytes = await encodeWebm({
      strip: stitchedStrip,
      layout: { ...firstLayout, stripHeight: stitchedStrip.height },
      schedule: combinedSchedule,
      outWidth: presetSpec.width,
      outHeight: presetSpec.height,
      moodId: dominantMood,
      ...(shiftedOverlays.length > 0 ? { kineticOverlays: shiftedOverlays } : {}),
      audioPcm: mergedAudio,
      onFrameProgress: (frameIdx, totalFrames, cutIdx) => {
        if (frameIdx === 0 || frameIdx === totalFrames - 1 || frameIdx % 10 === 0) {
          options.onProgress?.(
            frameIdx + 1,
            totalFrames,
            `에피소드 9:16 WebM 인코딩 (${cutIdx + 1}컷 · ${frameIdx + 1}/${totalFrames}f)`,
          );
        }
      },
    });
    if (!isWebmEbml(bytes)) {
      return {
        ok: false,
        failure: failVisible("export-webm-invalid", "에피소드 WebM(EBML) 바이너리가 유효하지 않습니다.", undefined, started),
      };
    }

    const encodeMs = Math.max(0, now() - encodeStarted);
    const motionMetrics: MotionTeaserReceiptMetrics = {
      frameCount: combinedSchedule.frameCount,
      avgFrameMs: Number((encodeMs / Math.max(1, combinedSchedule.frameCount)).toFixed(2)),
      peakRasterMb,
      audioEvents: mergedAudio.eventCount,
      ...(options.includeAmbientBgm ? { ambientBgm: true } : {}),
      beatCount: beats.length,
    };
    const prefix = slugifyEpisodePrefix(options.episodeTitleKo);
    const bgmTag = options.includeAmbientBgm ? "-bgm" : "";
    const fileName = `${prefix}-${beats.length * 4}cuts-${presetSpec.width}x${presetSpec.height}${bgmTag}-episode-teaser.webm`;
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
        ...(lastProvenance ? { provenance: lastProvenance } : {}),
        motion: motionMetrics,
        durationMs: now() - started,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: toBatchFailure("cutsheet-webm-encode", "에피소드 연속 9:16 WebM 인코딩에 실패했습니다.", error, started),
    };
  }
}

/**
 * 에피소드 큐시트 전체 비트(`4×N`컷)의 누적 타임코드를 계산해 다국어 `WebVTT (.vtt)` 통합 자막을 생성한다.
 */
export function buildEpisodeCutsheetWebVtt(
  episodeTitleKo: string,
  beats: readonly EpisodeCutsheetBeat[],
  options: EpisodeWebVttOptions = {},
): string {
  const stripW = options.requestedStripWidth ?? 540;
  const primaryLocale = beats[0]?.snapshot.locale ?? "ko";
  const blocks: string[] = [
    "WEBVTT",
    `NOTE ToonStudio Episode Cutsheet Subtitles — ${episodeTitleKo.trim() || "1화 콘티"} (${beats.length * 4}컷)`,
    "",
  ];

  let offsetMs = 0;
  let cueOffset = 0;
  for (const beat of beats) {
    const snap = beat.snapshot;
    const layout = clampWebtoonStripLayout(stripW, true, snap.gutterPaces);
    const schedule = planMotionTeaserSchedule(layout, snap.gutterPaces, {
      ...(options.fps !== undefined ? { fps: options.fps } : {}),
      ...(options.playbackSpeed !== undefined ? { speed: options.playbackSpeed } : {}),
      sfxStamps: snap.sfxStamps,
    });
    const body = buildMotionTeaserWebVtt(schedule, {
      locale: snap.locale ?? primaryLocale,
      dialogueLines: snap.dialogueLines,
      bubbleShapes: snap.bubbleShapes,
      speakerTargets: snap.speakerTargets,
      sfxStamps: snap.sfxStamps,
      cueOffsetMs: offsetMs,
      cueIndexOffset: cueOffset,
      omitHeader: true,
    });
    if (body.trim().length > 0) {
      blocks.push(`NOTE ${beat.cutRangeLabel} · ${beat.titleKo}`);
      blocks.push("");
      blocks.push(body.trimEnd());
      blocks.push("");
    }
    offsetMs += schedule.outputDurationMs;
    cueOffset += 4;
  }

  return `${blocks.join("\n").trimEnd()}\n`;
}

export function exportEpisodeCutsheetWebVtt(
  episodeTitleKo: string,
  beats: readonly EpisodeCutsheetBeat[],
  options: EpisodeWebVttOptions = {},
  deps: ExportDeps = {},
): ExportOutcome {
  const now = deps.now ?? defaultNow;
  const started = now();
  if (beats.length === 0) {
    return {
      ok: false,
      failure: failVisible("cutsheet-beats-empty", "자막으로 내보낼 큐시트 씬 비트가 없습니다.", undefined, started),
    };
  }
  const vtt = buildEpisodeCutsheetWebVtt(episodeTitleKo, beats, options);
  const bytes = new TextEncoder().encode(vtt);
  const prefix = slugifyEpisodePrefix(episodeTitleKo);
  return {
    ok: true,
    bytes,
    receipt: {
      kind: "vtt",
      fileName: `${prefix}-${beats.length * 4}cuts-subtitles.vtt`,
      mime: VTT_MIME,
      bytes: bytes.length,
      durationMs: now() - started,
    },
  };
}

/**
 * PD·배경·식자 파트 협업 전달용 한국어 에피소드 스토리보드 연출 큐시트(`.storyboard.md`)를 생성한다.
 */
export function buildEpisodeStoryboardMarkdown(
  episodeTitleKo: string,
  beats: readonly EpisodeCutsheetBeat[],
  nowMs = Date.now(),
): string {
  const title = episodeTitleKo.trim() || "1화 콘티 큐시트";
  const lines: string[] = [
    `# ${title} — 스토리보드 연출 큐시트`,
    "",
    `- **생성 시각**: ${new Date(nowMs).toISOString()}`,
    `- **총 분량**: ${beats.length}개 비트 · 총 ${beats.length * 4}컷`,
    "",
    "| 컷 번호 | 비트 제목 | 카메라 구도 | 스크린톤 망점 | 말풍선 | 효과음 | 대사 식자 |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (let bIdx = 0; bIdx < beats.length; bIdx += 1) {
    const beat = beats[bIdx]!;
    const snap = beat.snapshot;
    for (let cIdx = 0; cIdx < 4; cIdx += 1) {
      const cutNum = bIdx * 4 + cIdx + 1;
      const camLabel = WEBTOON_CUT_CAMERA_PRESETS[snap.cutCameraPresets[cIdx as 0 | 1 | 2 | 3]].labelKo;
      const toneLabel = WEBTOON_SCREENTONE_SPECS[snap.screentones[cIdx as 0 | 1 | 2 | 3]].labelKo;
      const shapeLabel = WEBTOON_STRIP_BUBBLE_SHAPE_LABELS_KO[snap.bubbleShapes[cIdx as 0 | 1 | 2 | 3]];
      const sfx = snap.sfxStamps[cIdx as 0 | 1 | 2 | 3];
      const sfxLabel = sfx === "none" ? "-" : resolveSfxGlyphByLocale(sfx, snap.locale);
      const dialogue = snap.dialogueLines[cIdx as 0 | 1 | 2 | 3].replace(/\|/gu, "\\|").trim() || "-";
      lines.push(
        `| ${cutNum}컷 | ${beat.titleKo.replace(/\|/gu, "\\|")} | ${camLabel} | ${toneLabel} | ${shapeLabel} | ${sfxLabel} | ${dialogue} |`,
      );
    }
  }

  lines.push("");
  lines.push("## 비트별 연출 메모");
  lines.push("");
  for (const beat of beats) {
    const snap = beat.snapshot;
    const moodLabel = WEBTOON_MANUSCRIPT_MOODS[snap.manuscriptMood].labelKo;
    const pacesLabel = snap.gutterPaces.map((p) => WEBTOON_STRIP_GUTTER_PACES[p].labelKo).join(" → ");
    lines.push(
      `- **${beat.cutRangeLabel} (${beat.titleKo})**: 무드 \`${moodLabel}\` · 언어 \`${snap.locale.toUpperCase()}\` · 스크롤 호흡 \`${pacesLabel}\` · 단행본 순서 \`${snap.tankobonOrder}\``,
    );
  }

  return `${lines.join("\n")}\n`;
}

export function exportEpisodeStoryboardMarkdown(
  episodeTitleKo: string,
  beats: readonly EpisodeCutsheetBeat[],
  deps: ExportDeps = {},
): ExportOutcome {
  const now = deps.now ?? defaultNow;
  const started = now();
  if (beats.length === 0) {
    return {
      ok: false,
      failure: failVisible("cutsheet-beats-empty", "스토리보드 리포트로 내보낼 큐시트 씬 비트가 없습니다.", undefined, started),
    };
  }
  const md = buildEpisodeStoryboardMarkdown(episodeTitleKo, beats, started);
  const bytes = new TextEncoder().encode(md);
  const prefix = slugifyEpisodePrefix(episodeTitleKo);
  return {
    ok: true,
    bytes,
    receipt: {
      kind: "storyboard-md",
      fileName: `${prefix}-${beats.length * 4}cuts.storyboard.md`,
      mime: MARKDOWN_MIME,
      bytes: bytes.length,
      durationMs: now() - started,
    },
  };
}

/**
 * 에피소드 큐시트 전체 비트(`4×N`컷)의 효과음과 무드 앰비언트 BGM 패드를 크로스페이드 합성해 무손실 16-bit `.wav` 마스터 트랙으로 내보낸다.
 */
export function exportEpisodeCutsheetAudioWav(
  episodeTitleKo: string,
  beats: readonly EpisodeCutsheetBeat[],
  options: EpisodeWebVttOptions & { readonly includeAmbientBgm?: boolean } = {},
  deps: ExportDeps = {},
): ExportOutcome {
  const now = deps.now ?? defaultNow;
  const started = now();
  if (beats.length === 0) {
    return {
      ok: false,
      failure: failVisible("cutsheet-beats-empty", "음원으로 내보낼 큐시트 씬 비트가 없습니다.", undefined, started),
    };
  }
  const stripW = options.requestedStripWidth ?? 540;
  const includeBgm = options.includeAmbientBgm === true;
  const tracks: MotionTeaserAudioTrackPcm[] = [];
  let totalFrames = 0;

  for (const beat of beats) {
    const snap = beat.snapshot;
    const layout = clampWebtoonStripLayout(stripW, true, snap.gutterPaces);
    const sfxStamps = snap.bakeStripFx ? snap.sfxStamps : (["none", "none", "none", "none"] as const);
    const schedule = planMotionTeaserSchedule(layout, snap.gutterPaces, {
      ...(options.fps !== undefined ? { fps: options.fps } : {}),
      ...(options.playbackSpeed !== undefined ? { speed: options.playbackSpeed } : {}),
      sfxStamps,
    });
    totalFrames += schedule.frameCount;
    tracks.push(
      synthesizeMotionTeaserAudioPcm(schedule, sfxStamps, MOTION_TEASER_AUDIO_SAMPLE_RATE, {
        includeAmbientBgm: includeBgm,
        moodId: snap.manuscriptMood,
      }),
    );
  }

  const merged = concatAudioTracksWithCrossfade(tracks, MOTION_TEASER_AUDIO_SAMPLE_RATE, includeBgm);
  const bytes = encodeMonoPcm16Wav(merged);
  const prefix = slugifyEpisodePrefix(episodeTitleKo);
  const bgmTag = includeBgm ? "-bgm" : "";
  return {
    ok: true,
    bytes,
    receipt: {
      kind: "wav",
      fileName: `${prefix}-${beats.length * 4}cuts${bgmTag}-episode-audio.wav`,
      mime: WAV_MIME,
      bytes: bytes.length,
      motion: {
        frameCount: totalFrames,
        avgFrameMs: 0,
        peakRasterMb: Number((bytes.byteLength / (1024 * 1024)).toFixed(2)),
        audioEvents: merged.eventCount,
        ...(includeBgm ? { ambientBgm: true } : {}),
        beatCount: beats.length,
      },
      durationMs: now() - started,
    },
  };
}
