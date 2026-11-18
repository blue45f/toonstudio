/**
 * 스크롤 여백 호흡(`gutterPaces`)·시간대 색온도 무드(`manuscriptMood`) 연동
 * 9:16 숏폼 모션 코믹 티저(WebM) 순수 스케줄러 및 CPU 프레임 합성 모듈.
 *
 * 아키텍처 계약 (`src/architecture.test.ts`):
 * - DOM / MediaRecorder / Math.random 의존성 없이 Node·브라우저 양쪽에서 100% 결정적으로 동작한다.
 * - 실제 브라우저 스트림 인코딩(`MediaRecorder` + `captureStream`)은 `webtoon-motion-teaser.browser.ts`가 담당한다.
 */
import { failVisible, isLabFailure } from "../contracts";

import { WEBM_MIME, exportFileName, isWebmEbml } from "./export-session";
import {
  DEFAULT_WEBTOON_STRIP_GUTTER_PACES,
  WEBTOON_MANUSCRIPT_MOODS,
  captureWebtoonVerticalStripRaster,
  computeStripAutoPanTimeline,
  sampleAutoPanScrollState,
} from "./webtoon-strip-composer";

import type { ExportDeps, ExportOutcome } from "./export-session";
import type {
  ExportWebtoonVerticalStripOptions,
  StripAutoPanTimeline,
  WebtoonManuscriptMoodId,
  WebtoonStripGutterPaces,
  WebtoonStripLayout,
} from "./webtoon-strip-composer";
import type { CapturedRaster, CharacterEngine, LabFailure } from "../contracts";

export const DEFAULT_MOTION_TEASER_FPS = 24;
export const MIN_MOTION_TEASER_FPS = 12;
export const MAX_MOTION_TEASER_FPS = 30;

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

export interface MotionTeaserFrameSample {
  readonly frameIndex: number;
  readonly outputTimeMs: number;
  readonly timelineElapsedMs: number;
  readonly scrollRatio01: number;
  readonly activeCutIndex: 0 | 1 | 2 | 3;
  /** 컷 체류 구간에서 미세한 포커스 호흡감을 주는 배율 (1.000..1.028) */
  readonly dwellZoom: number;
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
}

export interface EncodeMotionTeaserWebmRequest {
  readonly strip: CapturedRaster;
  readonly layout: WebtoonStripLayout;
  readonly schedule: MotionTeaserSchedule;
  readonly outWidth: number;
  readonly outHeight: number;
  readonly moodId: WebtoonManuscriptMoodId;
  readonly onFrameProgress?: (frameIndex: number, totalFrames: number, activeCutIndex: 0 | 1 | 2 | 3) => void;
}

export type EncodeMotionTeaserWebmFn = (request: EncodeMotionTeaserWebmRequest) => Promise<Uint8Array>;

export interface ExportWebtoonMotionTeaserOptions extends ExportWebtoonVerticalStripOptions {
  readonly resolutionPreset?: MotionTeaserResolutionPresetId;
  readonly fps?: number;
  readonly playbackSpeed?: number;
}

const defaultNow = (): number => Date.now();

function clampNumber(value: number | undefined, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function computeDwellZoomAt(timeline: StripAutoPanTimeline, timelineElapsedMs: number): number {
  const total = Math.max(1, timeline.totalDurationMs);
  const t = ((timelineElapsedMs % total) + total) % total;
  for (let i = 0; i < 4; i += 1) {
    const seg = timeline.segments[i as 0 | 1 | 2 | 3]!;
    if (t >= seg.dwellStartMs && t <= seg.dwellEndMs) {
      const span = Math.max(1, seg.dwellEndMs - seg.dwellStartMs);
      const phase = (t - seg.dwellStartMs) / span;
      // 0 → 1 → 0 부드러운 사인 반파 호흡 (최대 +2.8% 미세 줌)
      return Number((1 + Math.sin(phase * Math.PI) * 0.028).toFixed(5));
    }
  }
  return 1;
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
  const outputDurationMs = Math.max(400, Math.round(timeline.totalDurationMs / speed));
  const frameCount = Math.max(8, Math.round((outputDurationMs / 1000) * fps));

  const frames: MotionTeaserFrameSample[] = [];
  for (let idx = 0; idx < frameCount; idx += 1) {
    const progress01 = frameCount > 1 ? idx / (frameCount - 1) : 0;
    const outputTimeMs = Math.round(progress01 * outputDurationMs);
    const timelineElapsedMs = Math.min(timeline.totalDurationMs - 0.001, progress01 * timeline.totalDurationMs);
    const sampled = sampleAutoPanScrollState(timeline, timelineElapsedMs);
    const dwellZoom = computeDwellZoomAt(timeline, timelineElapsedMs);
    frames.push({
      frameIndex: idx,
      outputTimeMs,
      timelineElapsedMs,
      scrollRatio01: sampled.scrollRatio01,
      activeCutIndex: sampled.activeCutIndex,
      dwellZoom,
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

/**
 * 세로 4컷 스트립(`stripWidth × stripHeight`) 안에서 9:16 세로형 카메라가 비추는 소스 영역을 계산한다.
 */
export function computeMotionTeaserCameraWindow(
  stripWidth: number,
  stripHeight: number,
  scrollRatio01: number,
  dwellZoom = 1,
  outAspectWidthOverHeight = 9 / 16,
): MotionTeaserCameraWindow {
  const safeZoom = clampNumber(dwellZoom, 1, 1.12, 1);
  const safeRatio = clampNumber(scrollRatio01, 0, 1, 0);
  const srcWidth = Math.max(8, stripWidth / safeZoom);
  const idealHeight = srcWidth / Math.max(0.25, outAspectWidthOverHeight);
  const srcHeight = Math.min(stripHeight, Math.max(8, idealHeight));
  const srcX = Math.max(0, (stripWidth - srcWidth) * 0.5);
  const maxScrollY = Math.max(0, stripHeight - srcHeight);
  const srcY = maxScrollY * safeRatio;
  return { srcX, srcY, srcWidth, srcHeight };
}

/**
 * 순수 CPU 쌍선형(bilinear) 보간으로 특정 프레임 샘플의 9:16 RGBA 버퍼를 결정적으로 렌더링한다.
 */
export function renderMotionTeaserFrameRgba(
  strip: CapturedRaster,
  outWidth: number,
  outHeight: number,
  sample: Pick<MotionTeaserFrameSample, "scrollRatio01" | "dwellZoom" | "progress01">,
  moodId: WebtoonManuscriptMoodId = "daylight-paper",
  includeProgressBar = true,
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
  );

  // 스트립 높이가 9:16 창보다 짧을 경우 수직 중앙 배치
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

      const dst = (py * safeW + px) * 4;
      out[dst] = Math.round((src[i00] ?? 0) * w00 + (src[i10] ?? 0) * w10 + (src[i01] ?? 0) * w01 + (src[i11] ?? 0) * w11);
      out[dst + 1] = Math.round((src[i00 + 1] ?? 0) * w00 + (src[i10 + 1] ?? 0) * w10 + (src[i01 + 1] ?? 0) * w01 + (src[i11 + 1] ?? 0) * w11);
      out[dst + 2] = Math.round((src[i00 + 2] ?? 0) * w00 + (src[i10 + 2] ?? 0) * w10 + (src[i01 + 2] ?? 0) * w01 + (src[i11 + 2] ?? 0) * w11);
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
 * 4컷 웹툰 스트립을 캡처·합성한 뒤 오토패닝 타임라인 스케줄에 맞춰 9:16 WebM 비디오 바이트로 내보낸다.
 */
export async function exportWebtoonMotionTeaserWebm(
  engine: CharacterEngine,
  options: ExportWebtoonMotionTeaserOptions,
  encodeWebm: EncodeMotionTeaserWebmFn,
  deps: ExportDeps = {},
): Promise<ExportOutcome> {
  const now = deps.now ?? defaultNow;
  const started = now();
  const captured = await captureWebtoonVerticalStripRaster(engine, options, { now });
  if (!captured.ok) return captured;

  const presetSpec =
    WEBTOON_MOTION_TEASER_RESOLUTIONS[options.resolutionPreset ?? "sd-540x960"] ??
    WEBTOON_MOTION_TEASER_RESOLUTIONS["sd-540x960"];
  const gutterPaces = options.gutterPaces ?? DEFAULT_WEBTOON_STRIP_GUTTER_PACES;
  const schedule = planMotionTeaserSchedule(captured.layout, gutterPaces, {
    ...(options.fps !== undefined ? { fps: options.fps } : {}),
    ...(options.playbackSpeed !== undefined ? { speed: options.playbackSpeed } : {}),
  });

  try {
    const bytes = await encodeWebm({
      strip: captured.composed,
      layout: captured.layout,
      schedule,
      outWidth: presetSpec.width,
      outHeight: presetSpec.height,
      moodId: captured.effectiveMood,
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

    const baseName = exportFileName("webm", captured.provenance.recipeDigest, presetSpec.width, presetSpec.height);
    const speedTag = schedule.speed !== 1 ? `-${String(schedule.speed).replace(".", "_")}x` : "";
    const fileName = baseName.replace(/\.webm$/u, `${captured.suffixTags}${speedTag}-teaser.webm`);
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
