/**
 * 모션 웹툰 내보내기 — GIF·MP4·WebM.
 *
 * 회차를 오프스크린 캔버스에 프레임 단위로 다시 그려(카메라 키프레임 샘플링
 * 재사용) 파일로 인코딩한다. 전부 클라이언트에서 일어나고 서버 비용은 없다.
 *
 * - GIF: 기존 순수 인코더(studio-gif-encoder) 재사용 — 모든 브라우저에서 된다.
 * - MP4: WebCodecs H.264(avc) + 순수 MP4 muxer. 미지원 브라우저에서는 WebM→GIF 순으로 폴백.
 * - WebM: 기존 WebCodecs 오케스트레이터 + VP 코덱 재사용. 미지원이면 MP4→GIF 순으로 폴백.
 *
 * 포맷 선택(resolveMotionExportPlan)은 순수 함수라 단위 테스트로 전 조합을 검증한다.
 * 컷 전환 오버레이(페이드·와이프 등)는 재생 전용 연출이라 내보내기에는 넣지 않는다.
 */

import { encodeGif, gifDelayCentiseconds, type GifEncoderFrame } from "../studio-gif-encoder";
import {
  buildVideoEncoderConfig,
  defaultVideoEncoderProbe,
  isWebCodecsVideoExportSupported,
  selectStudioVideoCodec,
  STUDIO_WEBCODECS_CODECS,
  type StudioCodecProbeResult,
} from "../studio-webcodecs-capability";
import { planConstantRateTimeline } from "../studio-webcodecs-timeline";
import {
  createDefaultWebCodecsYield,
  createWebCodecsVideoBlob,
  startWebCodecsVideoExport,
  type WebCodecsVideoExportDeps,
} from "../export/studio-webcodecs-video-export";
import {
  createWebCodecsMp4Blob,
  probeAvc1EncoderConfig,
  startWebCodecsMp4Export,
  type Avc1ProbeResult,
} from "../export/studio-webcodecs-mp4-export";
import { sampleCameraTransform, type MotionTransformValues } from "./motion-webtoon-keyframes";
import {
  clampCutDuration,
  episodeDurationSeconds,
  type MotionCut,
  type MotionEpisode,
} from "./motion-webtoon-model";

// ── 포맷 선택 (순수) ──────────────────────────────────────────────────

export type MotionExportFormat = "gif" | "mp4" | "webm";
export type MotionExportPipeline = "gif" | "webcodecs-avc" | "webcodecs-vp";

export const MOTION_EXPORT_FORMATS: readonly MotionExportFormat[] = ["mp4", "webm", "gif"];

export interface MotionExportCapabilities {
  /** WebCodecs H.264(avc1) 인코더 사용 가능. */
  readonly avc: boolean;
  /** WebCodecs VP9/AV1/VP8 인코더 사용 가능. */
  readonly vp: boolean;
}

export interface MotionExportPlan {
  readonly requested: MotionExportFormat;
  /** 실제로 만들 포맷 — 폴백이 걸리면 requested와 다르다. */
  readonly format: MotionExportFormat;
  readonly pipeline: MotionExportPipeline;
  readonly fellBack: boolean;
  /** 사용자에게 그대로 보여줄 수 있는 선택 사유. */
  readonly reasonKo: string;
  readonly reasonEn: string;
}

function plan(
  requested: MotionExportFormat,
  format: MotionExportFormat,
  pipeline: MotionExportPipeline,
  reasonKo: string,
  reasonEn: string,
): MotionExportPlan {
  return { requested, format, pipeline, fellBack: format !== requested, reasonKo, reasonEn };
}

/**
 * 요청 포맷 + 브라우저 역량 → 실행 계획.
 * 폴백 순서: MP4 → WebM → GIF / WebM → MP4 → GIF. GIF는 항상 만들 수 있다.
 */
export function resolveMotionExportPlan(
  requested: MotionExportFormat,
  caps: MotionExportCapabilities,
): MotionExportPlan {
  if (requested === "gif") {
    return plan(requested, "gif", "gif", "GIF는 모든 브라우저에서 만들 수 있어요.", "GIF can be encoded in any browser.");
  }
  if (requested === "mp4") {
    if (caps.avc) {
      return plan(requested, "mp4", "webcodecs-avc", "H.264 WebCodecs 인코더로 MP4를 만들어요.", "Encoding MP4 with the H.264 WebCodecs encoder.");
    }
    if (caps.vp) {
      return plan(requested, "webm", "webcodecs-vp", "이 브라우저에 H.264 인코더가 없어 WebM으로 대신 만들어요.", "This browser has no H.264 encoder, so WebM is used instead.");
    }
    return plan(requested, "gif", "gif", "이 브라우저에 영상 인코더가 없어 GIF로 대신 만들어요.", "This browser has no video encoder, so GIF is used instead.");
  }
  // webm
  if (caps.vp) {
    return plan(requested, "webm", "webcodecs-vp", "WebCodecs 인코더로 WebM을 만들어요.", "Encoding WebM with the WebCodecs encoder.");
  }
  if (caps.avc) {
    return plan(requested, "mp4", "webcodecs-avc", "이 브라우저에 WebM 코덱 인코더가 없어 MP4로 대신 만들어요.", "This browser has no WebM codec encoder, so MP4 is used instead.");
  }
  return plan(requested, "gif", "gif", "이 브라우저에 영상 인코더가 없어 GIF로 대신 만들어요.", "This browser has no video encoder, so GIF is used instead.");
}

export function motionExportMimeType(format: MotionExportFormat): string {
  switch (format) {
    case "gif":
      return "image/gif";
    case "mp4":
      return "video/mp4";
    case "webm":
      return "video/webm";
  }
}

/** 파일명 — 기존 `<제목>-motion.webm` 규칙과 나란하게 확장자만 갈린다. */
export function motionExportFileName(title: string, format: MotionExportFormat): string {
  return `${title.trim() || "toonstudio"}-motion.${format}`;
}

// ── 프레임 계획 (순수) ────────────────────────────────────────────────

export interface MotionExportFramePlan {
  readonly index: number;
  /** 회차 시작 기준 시각(초). */
  readonly atSeconds: number;
  readonly cutIndex: number;
  /** 컷 시작 기준 시각(초). */
  readonly cutLocalSeconds: number;
}

export interface MotionExportTimelinePlan {
  readonly frames: readonly MotionExportFramePlan[];
  readonly durationSeconds: number;
  readonly fps: number;
}

/** fps 그리드 위에 컷 경계를 보존하는 프레임 계획을 만든다. */
export function planMotionExportFrames(episode: MotionEpisode, fps: number): MotionExportTimelinePlan {
  const safeFps = Math.min(60, Math.max(1, Math.round(fps) || 24));
  const durations = episode.cuts.map((cut) => clampCutDuration(cut.direction.durationSeconds));
  const total = durations.reduce((sum, d) => sum + d, 0);
  const frameCount = Math.max(1, Math.round(total * safeFps));
  const frames: MotionExportFramePlan[] = [];
  for (let index = 0; index < frameCount; index += 1) {
    const atSeconds = index / safeFps;
    let cursor = 0;
    let cutIndex = durations.length - 1;
    let cutLocalSeconds = durations[durations.length - 1] ?? 0;
    for (let c = 0; c < durations.length; c += 1) {
      if (atSeconds < cursor + durations[c]! || c === durations.length - 1) {
        cutIndex = c;
        cutLocalSeconds = Math.min(atSeconds - cursor, durations[c]!);
        break;
      }
      cursor += durations[c]!;
    }
    frames.push({ index, atSeconds, cutIndex: Math.max(0, cutIndex), cutLocalSeconds: Math.max(0, cutLocalSeconds) });
  }
  return { frames, durationSeconds: total, fps: safeFps };
}

/** object-fit: cover와 같은 맞춤 — 이미지가 프레임을 덮는 그리기 크기. 순수. */
export function coverFitSize(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
): { width: number; height: number } {
  if (!(imageWidth > 0) || !(imageHeight > 0)) return { width: frameWidth, height: frameHeight };
  const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  return { width: imageWidth * scale, height: imageHeight * scale };
}

// ── 프레임 그리기 ─────────────────────────────────────────────────────

/** 무대 배경 — 플레이어 스테이지와 같은 짙은 색. */
export const MOTION_STAGE_BACKGROUND = "#0b0b10";

/** 그리기 소스 + 원본 크기(cover 맞춤 계산용). */
export interface MotionFrameImage {
  readonly source: CanvasImageSource;
  readonly width: number;
  readonly height: number;
}

/**
 * 프레임 한 장을 캔버스에 그린다. 카메라 변환은 키프레임 샘플링 결과를
 * 무대 중심 기준으로 적용한다(translate %는 무대 크기 기준 — CSS와 동일).
 */
export function drawMotionFrame(
  ctx: CanvasRenderingContext2D,
  image: MotionFrameImage | null,
  values: MotionTransformValues,
  frameWidth: number,
  frameHeight: number,
): void {
  ctx.fillStyle = MOTION_STAGE_BACKGROUND;
  ctx.fillRect(0, 0, frameWidth, frameHeight);
  if (!image) return;
  const fitted = coverFitSize(image.width, image.height, frameWidth, frameHeight);
  ctx.save();
  ctx.translate(
    frameWidth / 2 + (values.x / 100) * frameWidth,
    frameHeight / 2 + (values.y / 100) * frameHeight,
  );
  ctx.rotate((values.rotationDeg * Math.PI) / 180);
  ctx.scale(values.scale, values.scale);
  ctx.globalAlpha = Math.min(1, Math.max(0, values.opacity));
  ctx.drawImage(image.source, -fitted.width / 2, -fitted.height / 2, fitted.width, fitted.height);
  ctx.restore();
}

// ── 브라우저 실행 ─────────────────────────────────────────────────────

export interface MotionExportOptions {
  readonly format: MotionExportFormat;
  readonly fps?: number;
  readonly width?: number;
  readonly height?: number;
  readonly onProgress?: (ratio: number) => void;
}

export interface MotionExportOutcome {
  readonly blob: Blob;
  readonly plan: MotionExportPlan;
  readonly fileName: string;
}

interface CodecProbeSet {
  readonly avc: Avc1ProbeResult | null;
  readonly vp: StudioCodecProbeResult | null;
}

async function probeMotionExportCodecs(width: number, height: number, fps: number): Promise<CodecProbeSet> {
  const probe = defaultVideoEncoderProbe();
  if (!probe || !isWebCodecsVideoExportSupported()) return { avc: null, vp: null };
  const avc = await probeAvc1EncoderConfig({ width, height, fps }, probe);
  const vp = await selectStudioVideoCodec({ width, height, fps }, probe);
  return { avc, vp };
}

function loadCutImage(url: string): Promise<HTMLImageElement | null> {
  if (!url) return Promise.resolve(null);
  const attempt = (crossOrigin: boolean): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      if (crossOrigin) image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("image load failed"));
      image.src = url;
    });
  return attempt(true)
    .catch(() => attempt(false))
    .catch(() => null);
}

function createBrowserEncoderDeps(
  canvas: HTMLCanvasElement,
  drawFrame: (frameIndex: number) => void,
): WebCodecsVideoExportDeps {
  return {
    createEncoder: (handlers) =>
      new VideoEncoder({
        output: (chunk, metadata) => handlers.output(chunk, metadata),
        error: (error) => handlers.error(error),
      }),
    createFrame: (spec) => {
      drawFrame(spec.index);
      return new VideoFrame(canvas, { timestamp: spec.timestampUs, duration: spec.durationUs });
    },
    yieldToUi: createDefaultWebCodecsYield(),
  };
}

/**
 * 회차를 파일로 내보낸다. 실패는 Error로 던진다 — CORS로 오염된 캔버스,
 * 이미지 로드 실패 등은 메시지로 구분한다.
 */
export async function exportMotionEpisode(
  episode: MotionEpisode,
  options: MotionExportOptions,
): Promise<MotionExportOutcome> {
  if (episode.cuts.length === 0) throw new Error("내보낼 컷이 없어요.");
  const probeWidth = options.width ?? 720;
  const probeHeight = options.height ?? 960;
  const fps = options.fps ?? (options.format === "gif" ? 12 : 24);
  const framePlan = planMotionExportFrames(episode, fps);
  if (episodeDurationSeconds(episode) <= 0) throw new Error("내보낼 컷이 없어요.");

  const probes =
    options.format === "gif"
      ? { avc: null, vp: null }
      : await probeMotionExportCodecs(probeWidth, probeHeight, framePlan.fps);
  const plan = resolveMotionExportPlan(options.format, { avc: probes.avc !== null, vp: probes.vp !== null });
  // GIF는 파일 크기를 줄이기 위해 기본 해상도를 낮춘다(지정값이 있으면 우선).
  const width = options.width ?? (plan.format === "gif" ? 480 : 720);
  const height = options.height ?? (plan.format === "gif" ? 640 : 960);

  const images = new Map<string, HTMLImageElement | null>();
  for (const cut of episode.cuts) {
    images.set(cut.id, await loadCutImage(cut.imageUrl));
  }

  // MP4는 인코더 설정의 짝수 정규화 크기로 그린다(설정이 곧 출력 크기).
  const renderWidth = plan.pipeline === "webcodecs-avc" && probes.avc ? probes.avc.config.width : width;
  const renderHeight = plan.pipeline === "webcodecs-avc" && probes.avc ? probes.avc.config.height : height;
  const canvas = document.createElement("canvas");
  canvas.width = renderWidth;
  canvas.height = renderHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("캔버스를 만들 수 없어요.");

  const drawFrame = (frameIndex: number): void => {
    const frame = framePlan.frames[frameIndex];
    if (!frame) return;
    const cut: MotionCut | undefined = episode.cuts[frame.cutIndex];
    if (!cut) return;
    const loaded = images.get(cut.id) ?? null;
    const image: MotionFrameImage | null = loaded
      ? { source: loaded, width: loaded.naturalWidth, height: loaded.naturalHeight }
      : null;
    const values = sampleCameraTransform(cut.direction, frame.cutLocalSeconds);
    drawMotionFrame(ctx, image, values, canvas.width, canvas.height);
  };

  const fileName = motionExportFileName(episode.titleKo, plan.format);

  if (plan.pipeline === "gif") {
    const gifFrames: GifEncoderFrame[] = [];
    for (const frame of framePlan.frames) {
      drawFrame(frame.index);
      let imageData: ImageData;
      try {
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch {
        throw new Error("이미지 출처의 보안 정책(CORS) 때문에 픽셀을 읽을 수 없어 GIF로 만들 수 없어요.");
      }
      gifFrames.push({ rgba: imageData.data, delayCs: gifDelayCentiseconds(1000 / framePlan.fps) });
      options.onProgress?.((frame.index + 1) / framePlan.frames.length / 2);
    }
    const bytes = await encodeGif({
      width: canvas.width,
      height: canvas.height,
      frames: gifFrames,
      onProgress: (progress) => options.onProgress?.(0.5 + progress.ratio / 2),
    });
    return { blob: new Blob([bytes as unknown as BlobPart], { type: "image/gif" }), plan, fileName };
  }

  const timeline = planConstantRateTimeline({ frameCount: framePlan.frames.length, fps: framePlan.fps });
  const deps = createBrowserEncoderDeps(canvas, drawFrame);

  if (plan.pipeline === "webcodecs-avc" && probes.avc) {
    const handle = startWebCodecsMp4Export({
      timeline,
      config: probes.avc.config,
      codecString: probes.avc.codecString,
      deps,
      onProgress: (progress) => options.onProgress?.(progress.ratio),
    });
    const result = await handle.done;
    return { blob: createWebCodecsMp4Blob(result), plan, fileName };
  }

  if (plan.pipeline === "webcodecs-vp" && probes.vp) {
    const candidate = STUDIO_WEBCODECS_CODECS.find((entry) => entry.id === probes.vp!.id);
    if (!candidate) throw new Error("WebM 코덱 설정을 만들 수 없어요.");
    const config = buildVideoEncoderConfig(
      candidate,
      { width: canvas.width, height: canvas.height, fps: framePlan.fps, bitrate: probes.vp.bitrate },
      probes.vp.hardwarePreferenceAccepted ? "prefer-hardware" : "no-preference",
    );
    const handle = startWebCodecsVideoExport({
      timeline,
      config,
      webmCodecId: probes.vp.webmCodecId,
      deps,
      onProgress: (progress) => options.onProgress?.(progress.ratio),
    });
    const result = await handle.done;
    return { blob: createWebCodecsVideoBlob(result), plan, fileName };
  }

  // resolveMotionExportPlan은 탐지 결과와 같은 역량 값으로 만들었으므로
  // 여기 도달하면 계획과 탐지가 어긋난 내부 오류다.
  throw new Error("내보내기 경로를 정하지 못했어요. 다시 시도해 주세요.");
}
