/**
 * 브라우저 전용 9:16 숏폼 모션 코믹 티저 WebM 인코더 (`MediaRecorder` + `HTMLCanvasElement.captureStream`).
 *
 * Canvas/WebGPU Guard 준수:
 * - 인코딩 완료 또는 예외 발생 시 `finally` 블록에서 미디어 스트림 트랙을 즉시 종료하고
 *   임시 캔버스(`stripCanvas`, `outCanvas`) 크기를 `0×0`으로 되돌려 GPU/래스터 메모리를 반환한다.
 */
import { failVisible } from "../contracts";

import { computeMotionTeaserCameraWindow } from "./webtoon-motion-teaser";
import { WEBTOON_MANUSCRIPT_MOODS } from "./webtoon-strip-composer";

import type { EncodeMotionTeaserWebmFn, EncodeMotionTeaserWebmRequest } from "./webtoon-motion-teaser";

const WEBM_CODEC_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
] as const;

interface CaptureTrackWithRequestFrame extends MediaStreamTrack {
  requestFrame?: () => void;
}

type CanvasWithCaptureStream = Omit<HTMLCanvasElement, "captureStream"> & {
  captureStream?: (frameRate?: number) => MediaStream;
};

function selectSupportedWebmMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  if (typeof MediaRecorder.isTypeSupported !== "function") return "video/webm";
  for (const candidate of WEBM_CODEC_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(1, ms));
  });
}

export const encodeMotionTeaserWebmBrowser: EncodeMotionTeaserWebmFn = async (
  request: EncodeMotionTeaserWebmRequest,
): Promise<Uint8Array> => {
  if (typeof document === "undefined") {
    throw failVisible("motion-webm-unsupported", "브라우저 DOM 환경이 아니어서 WebM 비디오를 인코딩할 수 없습니다.");
  }
  const mimeType = selectSupportedWebmMime();
  if (!mimeType) {
    throw failVisible(
      "motion-webm-unsupported",
      "현재 브라우저는 WebM 비디오 인코딩(MediaRecorder VP8/VP9)을 지원하지 않습니다. Chrome·Edge·Firefox 최신 버전을 사용하세요.",
    );
  }

  const { strip, schedule, outWidth, outHeight, moodId, onFrameProgress } = request;
  const stripCanvas = document.createElement("canvas");
  const outCanvas = document.createElement("canvas") as CanvasWithCaptureStream;
  let stream: MediaStream | null = null;

  try {
    stripCanvas.width = strip.width;
    stripCanvas.height = strip.height;
    const stripCtx = stripCanvas.getContext("2d");
    if (!stripCtx) {
      throw failVisible("motion-webm-canvas", "스트립 소스 2D 캔버스 컨텍스트를 생성하지 못했습니다.");
    }
    const imageBytes = new Uint8ClampedArray(strip.rgba.length);
    imageBytes.set(strip.rgba);
    stripCtx.putImageData(new ImageData(imageBytes, strip.width, strip.height), 0, 0);

    outCanvas.width = outWidth;
    outCanvas.height = outHeight;
    const outCtx = outCanvas.getContext("2d", { alpha: false });
    if (!outCtx || typeof outCanvas.captureStream !== "function") {
      throw failVisible(
        "motion-webm-unsupported",
        "현재 브라우저는 캔버스 미디어 스트림 캡처(captureStream)를 지원하지 않습니다.",
      );
    }
    outCtx.imageSmoothingEnabled = true;
    outCtx.imageSmoothingQuality = "high";

    const moodSpec = WEBTOON_MANUSCRIPT_MOODS[moodId] ?? WEBTOON_MANUSCRIPT_MOODS["daylight-paper"];
    const marginFill = `rgb(${moodSpec.stripMarginRgb[0]}, ${moodSpec.stripMarginRgb[1]}, ${moodSpec.stripMarginRgb[2]})`;
    const barHeight = Math.max(3, Math.round(outHeight * 0.005));

    const drawSampleFrame = (frameIdx: number): void => {
      const sample = schedule.frames[frameIdx];
      if (!sample) return;
      const cam = computeMotionTeaserCameraWindow(
        strip.width,
        strip.height,
        sample.scrollRatio01,
        sample.dwellZoom,
        outWidth / outHeight,
      );
      const srcAspect = cam.srcWidth / Math.max(1, cam.srcHeight);
      const dstAspect = outWidth / outHeight;
      const drawHeight = srcAspect > dstAspect ? Math.max(1, Math.round(outWidth / srcAspect)) : outHeight;
      const dstTop = Math.floor((outHeight - drawHeight) * 0.5);

      outCtx.fillStyle = marginFill;
      outCtx.fillRect(0, 0, outWidth, outHeight);
      outCtx.drawImage(
        stripCanvas,
        cam.srcX,
        cam.srcY,
        cam.srcWidth,
        cam.srcHeight,
        0,
        dstTop,
        outWidth,
        drawHeight,
      );

      outCtx.fillStyle = "rgba(18, 17, 15, 0.52)";
      outCtx.fillRect(0, outHeight - barHeight, outWidth, barHeight);
      outCtx.fillStyle = "rgb(228, 179, 99)";
      outCtx.fillRect(0, outHeight - barHeight, Math.max(2, Math.round(outWidth * sample.progress01)), barHeight);
    };

    drawSampleFrame(0);
    stream = outCanvas.captureStream(schedule.fps);
    const videoTrack = (stream.getVideoTracks()[0] ?? null) as CaptureTrackWithRequestFrame | null;

    const chunks: Blob[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: outWidth >= 720 ? 4_500_000 : 2_800_000,
    });

    const stoppedPromise = new Promise<void>((resolve, reject) => {
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => {
        reject(failVisible("motion-webm-recorder", "WebM MediaRecorder 인코딩 도중 오류가 발생했습니다."));
      };
      recorder.onstop = () => resolve();
    });

    const frameIntervalMs = Math.max(16, Math.round(1000 / schedule.fps));
    recorder.start(Math.max(100, frameIntervalMs * 6));

    for (let idx = 0; idx < schedule.frames.length; idx += 1) {
      const sample = schedule.frames[idx]!;
      drawSampleFrame(idx);
      videoTrack?.requestFrame?.();
      onFrameProgress?.(idx, schedule.frames.length, sample.activeCutIndex);
      await waitMs(frameIntervalMs);
    }

    if (recorder.state !== "inactive") {
      recorder.stop();
    }
    await stoppedPromise;

    const mergedBlob = new Blob(chunks, { type: "video/webm" });
    const arrayBuffer = await mergedBlob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } finally {
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    stripCanvas.width = 0;
    stripCanvas.height = 0;
    outCanvas.width = 0;
    outCanvas.height = 0;
  }
};
