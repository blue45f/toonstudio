/**
 * 3D 뷰포트 실캡처(WebGL/Three.js 멀티패스: 음영·선화·깊이·접지 AO) → Live Ink 스냅샷 어댑터.
 *
 * - `captureStudioBg3dRaster`로 실제 WebGL/Three.js 프레임버퍼에서 색상·깊이·노멀을 읽는다.
 * - `extractScaleAwareStudioLineArt`로 출력 해상도 기준 스케일-인식 Live Ink 선화를 추출해
 *   이웃 컷과 페이지 상 선 굵기 불변식을 유지한다.
 * - 모든 임시 2D `<canvas>` 백킹 스토어는 `try/finally`에서 즉시 1×1로 축소해 메모리를 해제한다.
 */

import {
  extractScaleAwareStudioLineArt,
  type LtCropRectPx,
} from "../lt-convert/studio-lt-scale-aware-extract";

import type { StudioBg3dCaptureAdapter } from "./studio-bg3d-capture-adapter";
import { captureStudioBg3dRaster } from "./studio-bg3d-editor-derivations";
import type { StudioBg3dWebtoonAtmospherePresetId } from "./studio-bg3d-lighting-studio";
import {
  clampInkLineWeight,
  type Scene3DCaptureCameraSnapshot,
  type Scene3DCaptureLightingSummary,
  type Scene3DCaptureSnapshot,
  type Stage3DMode,
} from "./studio-bg3d-live-ink-bake-bridge";
import type { StudioBg3dSceneDocument } from "./studio-bg3d-scene-document";

export interface CaptureStudioBg3dLiveInkSnapshotInput {
  readonly adapter: StudioBg3dCaptureAdapter;
  readonly document: StudioBg3dSceneDocument;
  readonly sceneId: string;
  readonly cameraId?: string;
  readonly stage: Stage3DMode;
  readonly widthPx?: number;
  readonly heightPx?: number;
  readonly cropRect?: LtCropRectPx;
  readonly liveCamera?: Scene3DCaptureCameraSnapshot | null;
  readonly atmospherePresetId?: StudioBg3dWebtoonAtmospherePresetId | null;
  readonly assetIds?: readonly string[];
  readonly includeSceneDocumentJson?: boolean;
}

const DEFAULT_LIVE_INK_CAPTURE_WIDTH = 960;
const DEFAULT_LIVE_INK_CAPTURE_HEIGHT = 540;

function encodeRgbaToPngDataUrl(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
): string {
  if (typeof document === "undefined") {
    throw new Error("DOM 캔버스를 사용할 수 없어 PNG 패스를 인코딩할 수 없습니다.");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  try {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("2D 캔버스 컨텍스트를 생성하지 못했습니다.");
    }
    const imageData = context.createImageData(width, height);
    imageData.data.set(rgba);
    context.putImageData(imageData, 0, 0);
    const dataUrl = canvas.toDataURL("image/png").split("#", 1)[0];
    if (!dataUrl.startsWith("data:image/png;base64,")) {
      throw new Error("PNG 데이터 URL 인코딩에 실패했습니다.");
    }
    return dataUrl;
  } finally {
    canvas.width = 1;
    canvas.height = 1;
  }
}

/**
 * 선화 엣지 마스크(0/255)를 투명 배경 위의 순수 먹선 RGBA로 변환한다.
 */
export function buildLiveInkLineRgbaFromEdgeMask(
  edgeMask: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const pixelCount = width * height;
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  for (let index = 0; index < pixelCount; index += 1) {
    const alpha = edgeMask[index] ?? 0;
    const out = index * 4;
    rgba[out] = 16;
    rgba[out + 1] = 18;
    rgba[out + 2] = 24;
    rgba[out + 3] = alpha;
  }
  return rgba;
}

/**
 * 정규화된 깊이 버퍼(Float32Array 0..1)를 8비트 그레이스케일 깊이 패스 RGBA로 변환한다.
 */
export function buildDepthPassRgba(
  depthBuffer: Float32Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const pixelCount = width * height;
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  let minDepth = 1;
  let maxDepth = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    const value = depthBuffer[index] ?? 1;
    if (value < 0.9999) {
      if (value < minDepth) minDepth = value;
      if (value > maxDepth) maxDepth = value;
    }
  }
  const span = Math.max(1e-5, maxDepth - minDepth);
  for (let index = 0; index < pixelCount; index += 1) {
    const value = depthBuffer[index] ?? 1;
    const normalized = value >= 0.9999 ? 0 : 1 - Math.min(1, Math.max(0, (value - minDepth) / span));
    const gray = Math.round(normalized * 255);
    const out = index * 4;
    rgba[out] = gray;
    rgba[out + 1] = gray;
    rgba[out + 2] = gray;
    rgba[out + 3] = 255;
  }
  return rgba;
}

/**
 * 깊이 버퍼의 주변 차폐(Screen-Space Contact AO)를 계산해 웹툰 접지 음영 패스 RGBA를 생성한다.
 */
export function buildContactAoPassRgba(
  depthBuffer: Float32Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const pixelCount = width * height;
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  const offsets: readonly (readonly [number, number])[] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-2, -2],
    [2, -2],
    [-2, 2],
    [2, 2],
  ];
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      const idx = row + x;
      const centerDepth = depthBuffer[idx] ?? 1;
      let ao = 255;
      if (centerDepth < 0.9999) {
        let occlusion = 0;
        for (const [dx, dy] of offsets) {
          const nx = Math.min(width - 1, Math.max(0, x + dx));
          const ny = Math.min(height - 1, Math.max(0, y + dy));
          const neighborDepth = depthBuffer[ny * width + nx] ?? 1;
          const delta = centerDepth - neighborDepth;
          if (delta > 0.002 && delta < 0.08) {
            occlusion += delta * 9;
          }
        }
        ao = Math.round(255 * Math.max(0.28, 1 - Math.min(0.72, occlusion / offsets.length)));
      }
      const out = idx * 4;
      rgba[out] = ao;
      rgba[out + 1] = ao;
      rgba[out + 2] = ao;
      rgba[out + 3] = 255;
    }
  }
  return rgba;
}

function deriveLightingSummary(document: StudioBg3dSceneDocument): Scene3DCaptureLightingSummary {
  const fogActive = Boolean(document.background.fogEnabled);
  const fogNear = document.background.fogNear ?? 10;
  const fogFar = document.background.fogFar ?? 50;
  const fogSpan = Math.max(1, fogFar - fogNear);
  const estimatedDensity = fogActive
    ? Number(Math.min(1, Math.max(0.05, 18 / fogSpan)).toFixed(2))
    : 0;
  return {
    ambientColor: document.lighting.ambientColor,
    ambientIntensity: document.lighting.ambientIntensity,
    keyColor: document.lighting.key.color,
    keyIntensity: document.lighting.key.intensity,
    exposure: document.render.exposure,
    fogActive,
    fogDensity: estimatedDensity,
  };
}

/**
 * 활성 WebGL/Three.js 캡처 어댑터에서 실제 멀티패스(음영·선화·깊이·AO)를 캡처해
 * `Scene3DCaptureSnapshot`을 생성한다.
 */
export async function captureStudioBg3dLiveInkSnapshot(
  input: CaptureStudioBg3dLiveInkSnapshotInput,
): Promise<Scene3DCaptureSnapshot> {
  const widthPx = Math.max(64, Math.min(2048, Math.round(input.widthPx ?? DEFAULT_LIVE_INK_CAPTURE_WIDTH)));
  const heightPx = Math.max(64, Math.min(2048, Math.round(input.heightPx ?? DEFAULT_LIVE_INK_CAPTURE_HEIGHT)));
  const inkLineWeightPx = clampInkLineWeight(input.document.output.line.widthPx);

  const captured = await captureStudioBg3dRaster(input.adapter, {
    width: widthPx,
    height: heightPx,
    background: {
      color: input.document.background.color,
      alpha: input.document.background.mode === "transparent" ? 0 : 1,
    },
    includeDepth: true,
    includeNormals: Boolean(input.adapter.normalProfile),
  });

  const targetThickness = Math.max(1, Math.min(8, Math.round(inkLineWeightPx)));
  const scaleAware = extractScaleAwareStudioLineArt(
    {
      rgba: captured.rgba,
      width: captured.width,
      height: captured.height,
      ...(captured.depth ? { depthBuffer: captured.depth } : {}),
      ...(captured.normalRgba ? { normalBuffer: captured.normalRgba } : {}),
    },
    {
      ...(input.cropRect ? { cropRect: input.cropRect } : {}),
      outputWidth: captured.width,
      outputHeight: captured.height,
      extractorOptions: {
        lineThickness: targetThickness,
        threshold: Math.max(8, Math.min(60, Math.round((1 - input.document.output.line.accuracy) * 44 + 10))),
        smoothLines: input.document.output.line.smoothing > 0.5,
        transparentBackground: true,
        normalAngleThresholdDeg: input.document.output.line.creaseAngleDegrees,
      },
    },
  );

  const shadedPassRef = encodeRgbaToPngDataUrl(captured.rgba, captured.width, captured.height);
  const inkRgba = buildLiveInkLineRgbaFromEdgeMask(
    scaleAware.extracted.edgeMask,
    scaleAware.extracted.width,
    scaleAware.extracted.height,
  );
  const inkPassRef = encodeRgbaToPngDataUrl(
    inkRgba,
    scaleAware.extracted.width,
    scaleAware.extracted.height,
  );

  let depthPassRef: string | null = null;
  let aoPassRef: string | null = null;
  if (captured.depth && captured.depth.length === captured.width * captured.height) {
    depthPassRef = encodeRgbaToPngDataUrl(
      buildDepthPassRgba(captured.depth, captured.width, captured.height),
      captured.width,
      captured.height,
    );
    aoPassRef = encodeRgbaToPngDataUrl(
      buildContactAoPassRgba(captured.depth, captured.width, captured.height),
      captured.width,
      captured.height,
    );
  }

  let normalPassRef: string | null = null;
  if (captured.normalRgba && captured.normalRgba.length === captured.width * captured.height * 4) {
    normalPassRef = encodeRgbaToPngDataUrl(captured.normalRgba, captured.width, captured.height);
  }

  const camera: Scene3DCaptureCameraSnapshot = input.liveCamera ?? {
    position: [
      input.document.camera.position[0],
      input.document.camera.position[1],
      input.document.camera.position[2],
    ],
    target: [
      input.document.camera.target[0],
      input.document.camera.target[1],
      input.document.camera.target[2],
    ],
    fovDegrees: input.document.camera.fovDegrees,
  };

  const uniqueAssetIds = Array.from(
    new Set((input.assetIds ?? []).filter((id) => id.trim().length > 0)),
  );

  return Object.freeze({
    sceneId: input.sceneId.trim() || "bg3d-active-scene",
    cameraId: input.cameraId?.trim() || "main-camera",
    stage: input.stage,
    widthPx: captured.width,
    heightPx: captured.height,
    inkPassRef,
    shadedPassRef,
    depthPassRef,
    aoPassRef,
    normalPassRef,
    inkLineWeightPx,
    assetIds: Object.freeze(uniqueAssetIds),
    capturedAt: new Date().toISOString(),
    camera: Object.freeze(camera),
    atmospherePresetId: input.atmospherePresetId ?? null,
    lightingSummary: Object.freeze(deriveLightingSummary(input.document)),
    inkAudit: Object.freeze({
      strategy: scaleAware.plan.strategy,
      expectedOnPageInkPx: scaleAware.inkAudit.expectedOnPageInkPx,
      measuredMedianInkSpanPx: scaleAware.inkAudit.measuredMedianInkSpanPx,
      passesInkWeightInvariant: scaleAware.inkAudit.passesInkWeightInvariant,
    }),
    sceneDocumentJson: input.includeSceneDocumentJson ? JSON.stringify(input.document) : null,
  });
}
