/**
 * 브라우저 전용 9:16 숏폼 모션 코믹 티저 WebM 인코더 (`MediaRecorder` + `HTMLCanvasElement.captureStream` + `AudioContext`).
 *
 * Canvas/WebGPU Guard 준수:
 * - 컷별 키네틱 오버레이(말풍선 팝인 + 효과음 스탬프)를 일회성 2D 캔버스로 준비해 프레임 루프 중 추가 할당을 막는다.
 * - 절차적 Web Audio PCM 트랙이 있는 경우 `MediaStreamAudioDestinationNode`로 멀티플렉싱한다.
 * - 완료/예외 시 `finally`에서 오디오 소스·컨텍스트, 스트림 트랙, 모든 임시 캔버스(`0×0`)를 결정적으로 해제한다.
 */
import { failVisible } from "../contracts";

import { WEBTOON_MANUSCRIPT_MOODS } from "./webtoon-strip-composer";
import { computeMotionTeaserCameraWindow } from "./webtoon-motion-teaser";

import type {
  CutKineticOverlayPlacement,
  EncodeMotionTeaserWebmFn,
  EncodeMotionTeaserWebmRequest,
} from "./webtoon-motion-teaser";

const WEBM_VIDEO_AUDIO_CODECS = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
] as const;

const WEBM_VIDEO_ONLY_CODECS = [
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

interface PreparedOverlayCanvas {
  readonly placement: CutKineticOverlayPlacement;
  readonly bubbleCanvas: HTMLCanvasElement | null;
  readonly sfxCanvas: HTMLCanvasElement | null;
}

function selectSupportedWebmMime(withAudio: boolean): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  if (typeof MediaRecorder.isTypeSupported !== "function") return "video/webm";
  const list = withAudio ? WEBM_VIDEO_AUDIO_CODECS : WEBM_VIDEO_ONLY_CODECS;
  for (const candidate of list) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  for (const fallback of WEBM_VIDEO_ONLY_CODECS) {
    if (MediaRecorder.isTypeSupported(fallback)) return fallback;
  }
  return null;
}

function rasterToCanvas(width: number, height: number, rgba: Uint8ClampedArray): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.width = 0;
    canvas.height = 0;
    return null;
  }
  const copy = new Uint8ClampedArray(rgba.length);
  copy.set(rgba);
  ctx.putImageData(new ImageData(copy, width, height), 0, 0);
  return canvas;
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
  const wantsAudio = Boolean(request.audioPcm && request.audioPcm.eventCount > 0 && typeof AudioContext !== "undefined");
  const mimeType = selectSupportedWebmMime(wantsAudio);
  if (!mimeType) {
    throw failVisible(
      "motion-webm-unsupported",
      "현재 브라우저는 WebM 비디오 인코딩(MediaRecorder VP8/VP9)을 지원하지 않습니다. Chrome·Edge·Firefox 최신 버전을 사용하세요.",
    );
  }

  const { strip, schedule, outWidth, outHeight, moodId, kineticOverlays = [], audioPcm, onFrameProgress } = request;
  const stripCanvas = document.createElement("canvas");
  const composedStripCanvas = document.createElement("canvas");
  const outCanvas = document.createElement("canvas") as CanvasWithCaptureStream;
  const preparedOverlays: PreparedOverlayCanvas[] = [];
  let stream: MediaStream | null = null;
  let audioCtx: AudioContext | null = null;
  let audioSource: AudioBufferSourceNode | null = null;

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

    composedStripCanvas.width = strip.width;
    composedStripCanvas.height = strip.height;
    const composedCtx = composedStripCanvas.getContext("2d");
    if (!composedCtx) {
      throw failVisible("motion-webm-canvas", "키네틱 합성용 2D 캔버스 컨텍스트를 생성하지 못했습니다.");
    }

    for (const ov of kineticOverlays) {
      preparedOverlays.push({
        placement: ov,
        bubbleCanvas: ov.bubbleOverlay ? rasterToCanvas(ov.bubbleOverlay.width, ov.bubbleOverlay.height, ov.bubbleOverlay.rgba) : null,
        sfxCanvas: ov.sfxOverlay ? rasterToCanvas(ov.sfxOverlay.width, ov.sfxOverlay.height, ov.sfxOverlay.rgba) : null,
      });
    }

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

      composedCtx.clearRect(0, 0, strip.width, strip.height);
      composedCtx.drawImage(stripCanvas, 0, 0);

      for (const prep of preparedOverlays) {
        const cutIdx = prep.placement.cutIndex;
        const alpha = sample.cutBubbleAlphas[cutIdx];
        const scale = sample.cutBubbleScales[cutIdx];
        if (alpha <= 0.01) continue;
        const pivotX = prep.placement.innerX + prep.placement.innerWidth * 0.5;
        const pivotY = prep.placement.innerY + prep.placement.innerHeight * 0.22;
        composedCtx.save();
        composedCtx.globalAlpha = alpha;
        composedCtx.translate(pivotX, pivotY);
        composedCtx.scale(scale, scale);
        composedCtx.translate(-pivotX, -pivotY);
        if (prep.bubbleCanvas) {
          composedCtx.drawImage(prep.bubbleCanvas, prep.placement.innerX, prep.placement.innerY);
        }
        if (prep.sfxCanvas) {
          composedCtx.drawImage(prep.sfxCanvas, prep.placement.innerX, prep.placement.innerY);
        }
        composedCtx.restore();
      }

      const cam = computeMotionTeaserCameraWindow(
        strip.width,
        strip.height,
        sample.scrollRatio01,
        sample.dwellZoom,
        outWidth / outHeight,
        sample.shakeOffsetX,
        sample.shakeOffsetY,
      );
      const srcAspect = cam.srcWidth / Math.max(1, cam.srcHeight);
      const dstAspect = outWidth / outHeight;
      const drawHeight = srcAspect > dstAspect ? Math.max(1, Math.round(outWidth / srcAspect)) : outHeight;
      const dstTop = Math.floor((outHeight - drawHeight) * 0.5);

      outCtx.fillStyle = marginFill;
      outCtx.fillRect(0, 0, outWidth, outHeight);
      outCtx.drawImage(
        composedStripCanvas,
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

    if (wantsAudio && audioPcm && audioPcm.eventCount > 0) {
      try {
        audioCtx = new AudioContext({ sampleRate: audioPcm.sampleRate });
        const buffer = audioCtx.createBuffer(1, audioPcm.samples.length, audioPcm.sampleRate);
        buffer.getChannelData(0).set(audioPcm.samples);
        const dest = audioCtx.createMediaStreamDestination();
        audioSource = audioCtx.createBufferSource();
        audioSource.buffer = buffer;
        audioSource.connect(dest);
        const audioTrack = dest.stream.getAudioTracks()[0];
        if (audioTrack) {
          stream.addTrack(audioTrack);
        }
      } catch {
        // 브라우저 오디오 자동재생 정책 등으로 실패해도 비디오 인코딩은 중단 없이 계속 진행한다
      }
    }

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
    if (audioCtx && audioSource) {
      if (audioCtx.state === "suspended") {
        await audioCtx.resume().catch(() => undefined);
      }
      try {
        audioSource.start(0);
      } catch {
        // 오디오 시작 실패 무시
      }
    }

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
    try {
      audioSource?.stop();
    } catch {
      // 이미 정지된 경우 무시
    }
    if (audioCtx) {
      void audioCtx.close().catch(() => undefined);
    }
    if (stream) {
      for (const track of stream.getTracks()) {
        track.stop();
      }
    }
    for (const prep of preparedOverlays) {
      if (prep.bubbleCanvas) {
        prep.bubbleCanvas.width = 0;
        prep.bubbleCanvas.height = 0;
      }
      if (prep.sfxCanvas) {
        prep.sfxCanvas.width = 0;
        prep.sfxCanvas.height = 0;
      }
    }
    stripCanvas.width = 0;
    stripCanvas.height = 0;
    composedStripCanvas.width = 0;
    composedStripCanvas.height = 0;
    outCanvas.width = 0;
    outCanvas.height = 0;
  }
};
