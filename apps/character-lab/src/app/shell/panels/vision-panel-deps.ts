import { failVisible } from "../../../contracts";

import type { CapturedRaster } from "../../../contracts";
import type { VisionDelegate, VisionImageSource, VisionLoaders } from "../../../domains/vision/vision-ports";
import type { LiveHandFrame } from "../vision-live-hands";

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** straight alpha RGBA, top-down */
  readonly rgba: Uint8ClampedArray;
  /** MediaPipe 입력. 추정이 끝나면 `releaseSource`로 닫으므로 그 뒤에는 쓰지 않는다. */
  readonly source: VisionImageSource;
  /** 미리보기 URL(없으면 null). Blob URL이면 `releasePreview`로 해제한다. */
  readonly previewUrl: string | null;
  readonly label: string;
  /** source(ImageBitmap)를 닫는다. 추정이 끝난 직후 분석 코드가 부른다. 여러 번 불러도 안전하다. */
  readonly releaseSource?: () => void;
  /** 미리보기 Blob URL을 해제한다. 이미지를 교체하거나 패널이 사라질 때 부른다. 여러 번 불러도 안전하다. */
  readonly releasePreview?: () => void;
}

export interface VisionPanelDeps {
  /** 모델 로더(기본: mediapipe-loader.browser 동적 import) */
  createLoaders(options: { readonly delegate: VisionDelegate }): Promise<VisionLoaders>;
  decodeImage(file: Blob): Promise<DecodedImage>;
  /** 썸네일 래스터 → MediaPipe 입력(기본 ImageData) */
  rasterToImage(raster: CapturedRaster): VisionImageSource;
  /** 없으면 '카메라 미지원' 표시 */
  readonly openCamera?: () => Promise<MediaStream>;
  readonly captureVideo?: (video: HTMLVideoElement) => Promise<DecodedImage>;
  readonly captureHandsFrame?: (video: HTMLVideoElement) => Promise<LiveHandFrame | null>;
  readonly now?: () => number;
}

function hasCanvas2d(): boolean {
  return typeof document !== "undefined" && typeof HTMLCanvasElement !== "undefined";
}

/** 브라우저 기본 의존성(createImageBitmap·canvas·getUserMedia) */
export function createBrowserVisionDeps(): VisionPanelDeps {
  const decodeFromDrawable = async (drawable: ImageBitmap | HTMLVideoElement, width: number, height: number, previewUrl: string | null, label: string): Promise<DecodedImage> => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw failVisible("vision-canvas-unavailable", "2D 캔버스를 만들 수 없어 이미지를 읽지 못했습니다.");
    context.drawImage(drawable, 0, 0, width, height);
    const data = context.getImageData(0, 0, width, height);
    const source = drawable instanceof HTMLVideoElement ? await createImageBitmap(canvas) : drawable;
    return { width, height, rgba: data.data, source, previewUrl: previewUrl ?? canvas.toDataURL("image/png"), label, releaseSource: () => source.close() };
  };
  const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  return {
    createLoaders: ({ delegate }) => import("../../../domains/vision/mediapipe-loader.browser").then((module) => module.createMediaPipeLoaders({ delegate })),
    async decodeImage(file) {
      if (typeof createImageBitmap !== "function" || !hasCanvas2d()) throw failVisible("vision-decode-unsupported", "이 환경은 createImageBitmap/canvas를 지원하지 않아 이미지를 읽을 수 없습니다.");
      const bitmap = await createImageBitmap(file);
      let previewUrl: string | null = null;
      try {
        previewUrl = typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
        const objectUrl = previewUrl;
        const label = file instanceof File ? file.name : "이미지";
        const decoded = await decodeFromDrawable(bitmap, bitmap.width, bitmap.height, objectUrl, label);
        return objectUrl ? { ...decoded, releasePreview: () => URL.revokeObjectURL(objectUrl) } : decoded;
      } catch (error) {
        // 호출자가 DecodedImage를 받지 못하므로 만들어 둔 자원은 여기서 해제한다.
        bitmap.close();
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        throw error;
      }
    },
    rasterToImage(raster) {
      if (typeof ImageData === "undefined") throw failVisible("vision-imagedata-unsupported", "이 환경은 ImageData를 지원하지 않아 썸네일을 임베딩할 수 없습니다.");
      return new ImageData(new Uint8ClampedArray(raster.rgba), raster.width, raster.height);
    },
    ...(mediaDevices && typeof mediaDevices.getUserMedia === "function"
      ? {
          openCamera: () => mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false }),
          captureHandsFrame: async (video: HTMLVideoElement) => {
            if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return null;
            const bitmap = await createImageBitmap(video);
            return { width: bitmap.width, height: bitmap.height, source: bitmap, release: () => bitmap.close() };
          },
          captureVideo: (video: HTMLVideoElement) => decodeFromDrawable(video, video.videoWidth || 640, video.videoHeight || 480, null, "카메라 촬영"),
        }
      : {}),
  };
}
