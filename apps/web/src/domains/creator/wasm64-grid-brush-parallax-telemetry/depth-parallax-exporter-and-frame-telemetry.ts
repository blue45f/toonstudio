/**
 * 2.5D 깊이 시차(Depth-Parallax) 인터랙티브 에피소드 익스포터 &
 * 자율 120Hz 실프레임 텔레메트리 · 회귀 게이트.
 *
 * - `DepthParallaxEpisodeExporter`: 2D 원고 평면, 정규화 깊이 레이어(0=근경, 0.5=초점면, 1=원경),
 *   자이로스코프·스크롤 틸트 카메라 제약, 디스오클루전(disocclusion) 외곽 보간 패딩을 무서버(₩0)
 *   인터랙티브 매니페스트로 패키징하고, 결정론적 3×3 시차 UV 변환 행렬을 계산한다.
 * - `AutonomousFrameTelemetryGate`: 고정 링 버퍼(TypedArray 무할당 핫패스)로 120Hz 목표
 *   (`<= 8.33ms`) P50/P95/P99 프레임 시간, OLS 회귀 힙 누수 기울기, VRAM 여유분(headroom)을
 *   감시하고 예산 회귀 발생 시 원인 컷(culprit cut)을 자동 귀속한다.
 */

import { fnv1a64Hex, fnv1a64StringHex } from "./p2p-grid-render-and-stream-assets";

/* -------------------------------------------------------------------------- */
/* 1. 2.5D Depth-Parallax Interactive Episode Exporter                        */
/* -------------------------------------------------------------------------- */

export const PARALLAX_MANIFEST_SCHEMA_VERSION = "toonstudio-parallax-v1";
export const PARALLAX_ZERO_SERVER_TAG = "none-zero-won";

export type ParallaxBlendMode = "normal" | "multiply" | "screen" | "overlay";
export type ReducedMotionFallbackMode = "static-focal" | "scroll-only";
export type Matrix3x3ColumnMajor = readonly [
  number, number, number,
  number, number, number,
  number, number, number,
];

export interface ParallaxCameraConstraints {
  readonly maxTiltDegX: number; readonly maxTiltDegY: number; readonly maxScrollTiltNormalized: number;
  readonly parallaxAmplitudeUv: number; readonly focalDepth: number; readonly gyroDamping: number;
  readonly reducedMotionFallback: ReducedMotionFallbackMode; readonly disocclusionSafetyPx: number;
}

export const DEFAULT_PARALLAX_CAMERA_CONSTRAINTS: ParallaxCameraConstraints = {
  maxTiltDegX: 12, maxTiltDegY: 15, maxScrollTiltNormalized: 0.85, parallaxAmplitudeUv: 0.045,
  focalDepth: 0.5, gyroDamping: 0.18, reducedMotionFallback: "static-focal", disocclusionSafetyPx: 2,
};

export interface ParallaxLayerInput {
  readonly layerId: string; readonly cutId: string; readonly label: string;
  readonly width: number; readonly height: number; readonly depthNormalized: number;
  readonly opacity?: number; readonly blendMode?: ParallaxBlendMode;
  readonly assetRef: string; readonly rgbaPixels?: Uint8Array;
}

export interface ParallaxCutInput {
  readonly cutId: string; readonly cutIndex: number; readonly aspectRatio: number;
  readonly focalDepthOverride?: number; readonly layers: readonly ParallaxLayerInput[];
}

export interface ParallaxEpisodeExportInput {
  readonly episodeId: string; readonly title: string; readonly exportedAtIso?: string;
  readonly cameraConstraints?: Partial<ParallaxCameraConstraints>;
  readonly cuts: readonly ParallaxCutInput[];
}

export interface DisocclusionPaddingSpec {
  readonly padX: number; readonly padY: number; readonly paddedWidth: number; readonly paddedHeight: number;
  readonly uMin: number; readonly vMin: number; readonly uMax: number; readonly vMax: number;
  readonly spanU: number; readonly spanV: number;
}

export interface ExportedParallaxLayer {
  readonly layerId: string; readonly cutId: string; readonly label: string;
  readonly width: number; readonly height: number; readonly depthNormalized: number;
  readonly depthDeltaFromFocal: number; readonly maxShiftUv: number; readonly opacity: number;
  readonly blendMode: ParallaxBlendMode; readonly assetRef: string;
  readonly disocclusionPadding: DisocclusionPaddingSpec;
  readonly layerChecksumHex: string; readonly paddedByteLength: number;
}

export interface ExportedParallaxCut {
  readonly cutId: string; readonly cutIndex: number; readonly aspectRatio: number;
  readonly focalDepth: number; readonly layers: readonly ExportedParallaxLayer[];
}

export interface DepthParallaxEpisodeManifest {
  readonly schemaVersion: typeof PARALLAX_MANIFEST_SCHEMA_VERSION;
  readonly serverDependency: typeof PARALLAX_ZERO_SERVER_TAG;
  readonly episodeId: string; readonly title: string; readonly exportedAtIso: string;
  readonly cameraConstraints: ParallaxCameraConstraints;
  readonly cuts: readonly ExportedParallaxCut[];
  readonly totalLayers: number; readonly totalPaddedBytes: number; readonly manifestChecksumHex: string;
}

export interface ParallaxCameraPose {
  readonly gyroPitchDeg: number; readonly gyroRollDeg: number;
  readonly scrollProgress: number; readonly reducedMotion?: boolean;
}

export interface ParallaxUvEvaluation {
  readonly layerId: string; readonly depthNormalized: number; readonly depthDelta: number;
  readonly clampedNormYaw: number; readonly clampedNormVertical: number;
  readonly shiftU: number; readonly shiftV: number; readonly uvMatrix3x3: Matrix3x3ColumnMajor;
}

export interface DisocclusionEdgeFillResult {
  readonly paddedWidth: number; readonly paddedHeight: number; readonly padX: number; readonly padY: number;
  readonly pixels: Uint8Array; readonly checksumHex: string;
}

function clamp(v: number, lo: number, hi: number): number { return v < lo ? lo : v > hi ? hi : v; }
function round6(v: number): number { return Math.round(v * 1_000_000) / 1_000_000; }

/** 레이어 깊이와 카메라 제약에 필요한 디스오클루전 외곽 패딩과 정규화 UV 사각형을 계산한다. */
export function computeDisocclusionPadding(
  width: number, height: number, depthNormalized: number,
  constraints: ParallaxCameraConstraints, focalDepthOverride?: number,
): DisocclusionPaddingSpec {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  const focal = clamp(focalDepthOverride ?? constraints.focalDepth, 0, 1);
  const absDelta = Math.abs(focal - clamp(depthNormalized, 0, 1));
  const maxShiftUv = absDelta * constraints.parallaxAmplitudeUv;

  const padX = absDelta < 1e-6 ? 0 : Math.ceil(maxShiftUv * safeW) + constraints.disocclusionSafetyPx;
  const padY = absDelta < 1e-6 ? 0 : Math.ceil(maxShiftUv * safeH) + constraints.disocclusionSafetyPx;
  const paddedWidth = safeW + padX * 2;
  const paddedHeight = safeH + padY * 2;

  return {
    padX, padY, paddedWidth, paddedHeight,
    uMin: padX / paddedWidth, vMin: padY / paddedHeight,
    uMax: (padX + safeW) / paddedWidth, vMax: (padY + safeH) / paddedHeight,
    spanU: safeW / paddedWidth, spanV: safeH / paddedHeight,
  };
}

/**
 * 원본 RGBA 레이어 외곽에 디스오클루전 패딩 에이프런을 생성한다.
 * 경계 픽셀을 외곽으로 확장 보간해 최대 자이로/스크롤 틸트에서도 투명 틈새가 노출되지 않는다.
 */
export function generateDisocclusionEdgeFillRgba(
  srcRgba: Uint8Array, width: number, height: number, padX: number, padY: number,
): DisocclusionEdgeFillResult {
  const safeW = Math.max(1, Math.floor(width));
  const safeH = Math.max(1, Math.floor(height));
  if (srcRgba.byteLength !== safeW * safeH * 4) {
    throw new RangeError(`RGBA 버퍼 크기 불일치: 기대=${safeW * safeH * 4}, 실제=${srcRgba.byteLength}`);
  }
  const px = Math.max(0, Math.floor(padX));
  const py = Math.max(0, Math.floor(padY));
  const paddedWidth = safeW + px * 2;
  const paddedHeight = safeH + py * 2;
  const out = new Uint8Array(paddedWidth * paddedHeight * 4);

  for (let y = 0; y < paddedHeight; y += 1) {
    const srcY = clamp(y - py, 0, safeH - 1);
    const inY = clamp(srcY + (y < py ? 1 : y >= py + safeH ? -1 : 0), 0, safeH - 1);
    const outsideY = y < py || y >= py + safeH;
    for (let x = 0; x < paddedWidth; x += 1) {
      const srcX = clamp(x - px, 0, safeW - 1);
      const inX = clamp(srcX + (x < px ? 1 : x >= px + safeW ? -1 : 0), 0, safeW - 1);
      const outsideX = x < px || x >= px + safeW;
      const dstIdx = (y * paddedWidth + x) * 4;
      const edgeIdx = (srcY * safeW + srcX) * 4;
      if (!outsideX && !outsideY) {
        out[dstIdx] = srcRgba[edgeIdx]; out[dstIdx + 1] = srcRgba[edgeIdx + 1];
        out[dstIdx + 2] = srcRgba[edgeIdx + 2]; out[dstIdx + 3] = srcRgba[edgeIdx + 3];
      } else {
        const innerIdx = (inY * safeW + inX) * 4;
        out[dstIdx] = Math.round(srcRgba[edgeIdx] * 0.75 + srcRgba[innerIdx] * 0.25);
        out[dstIdx + 1] = Math.round(srcRgba[edgeIdx + 1] * 0.75 + srcRgba[innerIdx + 1] * 0.25);
        out[dstIdx + 2] = Math.round(srcRgba[edgeIdx + 2] * 0.75 + srcRgba[innerIdx + 2] * 0.25);
        out[dstIdx + 3] = srcRgba[edgeIdx + 3];
      }
    }
  }
  return { paddedWidth, paddedHeight, padX: px, padY: py, pixels: out, checksumHex: fnv1a64Hex(out) };
}

/** 3×3 열 우선 UV 변환 행렬을 정규화 UV 좌표 `(u, v)`에 적용한다. */
export function applyParallaxUvMatrix3x3(
  matrix: Matrix3x3ColumnMajor, u: number, v: number,
): readonly [number, number] {
  return [matrix[0] * u + matrix[3] * v + matrix[6], matrix[1] * u + matrix[4] * v + matrix[7]];
}

/**
 * 레이어 깊이·패딩 정보와 자이로/스크롤 포즈로부터 결정론적 3×3 시차 UV 행렬을 평가한다.
 * 최대 틸트에서도 출력 UV는 디스오클루전 패딩 영역 `[0, 1]^2` 내부를 벗어나지 않는다.
 */
export function evaluateParallaxUvMatrix(
  layer: Pick<ExportedParallaxLayer, "layerId" | "depthNormalized" | "disocclusionPadding">,
  pose: ParallaxCameraPose,
  constraints: ParallaxCameraConstraints,
  focalDepthOverride?: number,
): ParallaxUvEvaluation {
  const focal = clamp(focalDepthOverride ?? constraints.focalDepth, 0, 1);
  const depth = clamp(layer.depthNormalized, 0, 1);
  const depthDelta = focal - depth;
  const pad = layer.disocclusionPadding;

  if (pose.reducedMotion && constraints.reducedMotionFallback === "static-focal") {
    return {
      layerId: layer.layerId, depthNormalized: depth, depthDelta,
      clampedNormYaw: 0, clampedNormVertical: 0, shiftU: 0, shiftV: 0,
      uvMatrix3x3: [pad.spanU, 0, 0, 0, pad.spanV, 0, pad.uMin, pad.vMin, 1],
    };
  }

  const normYaw = pose.reducedMotion ? 0 : clamp(pose.gyroRollDeg / Math.max(constraints.maxTiltDegY, 1e-4), -1, 1);
  const normPitch = pose.reducedMotion ? 0 : clamp(pose.gyroPitchDeg / Math.max(constraints.maxTiltDegX, 1e-4), -1, 1);
  const scrollTilt = clamp((pose.scrollProgress - 0.5) * 2, -1, 1) * clamp(constraints.maxScrollTiltNormalized, 0, 1);
  const normVertical = pose.reducedMotion ? clamp(scrollTilt, -1, 1) : clamp(normPitch * 0.65 + scrollTilt * 0.35, -1, 1);

  const shiftU = depthDelta * constraints.parallaxAmplitudeUv * normYaw;
  const shiftV = depthDelta * constraints.parallaxAmplitudeUv * normVertical;
  return {
    layerId: layer.layerId, depthNormalized: depth, depthDelta,
    clampedNormYaw: normYaw, clampedNormVertical: normVertical, shiftU, shiftV,
    uvMatrix3x3: [pad.spanU, 0, 0, 0, pad.spanV, 0, pad.uMin + shiftU * pad.spanU, pad.vMin + shiftV * pad.spanV, 1],
  };
}

function canonicalManifestBody(manifest: Omit<DepthParallaxEpisodeManifest, "manifestChecksumHex">): string {
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion, serverDependency: manifest.serverDependency,
    episodeId: manifest.episodeId, title: manifest.title, exportedAtIso: manifest.exportedAtIso,
    cameraConstraints: manifest.cameraConstraints, cuts: manifest.cuts,
    totalLayers: manifest.totalLayers, totalPaddedBytes: manifest.totalPaddedBytes,
  });
}

/** 2.5D 깊이 시차 인터랙티브 에피소드 매니페스트를 생성·검증하는 무서버 익스포터. */
export class DepthParallaxEpisodeExporter {
  private readonly defaultConstraints: ParallaxCameraConstraints;

  constructor(constraints: Partial<ParallaxCameraConstraints> = {}) {
    this.defaultConstraints = this.mergeConstraints(constraints);
  }

  private mergeConstraints(override?: Partial<ParallaxCameraConstraints>): ParallaxCameraConstraints {
    const m = { ...DEFAULT_PARALLAX_CAMERA_CONSTRAINTS, ...override };
    return {
      maxTiltDegX: clamp(m.maxTiltDegX, 1, 45), maxTiltDegY: clamp(m.maxTiltDegY, 1, 45),
      maxScrollTiltNormalized: clamp(m.maxScrollTiltNormalized, 0, 1),
      parallaxAmplitudeUv: clamp(m.parallaxAmplitudeUv, 0.001, 0.2),
      focalDepth: clamp(m.focalDepth, 0, 1), gyroDamping: clamp(m.gyroDamping, 0.01, 1),
      reducedMotionFallback: m.reducedMotionFallback,
      disocclusionSafetyPx: Math.max(0, Math.floor(m.disocclusionSafetyPx)),
    };
  }

  /** 원고 컷·레이어를 원경→근경 순으로 정렬하고 패딩·무결성 해시와 함께 매니페스트로 패키징한다. */
  exportManifest(input: ParallaxEpisodeExportInput): DepthParallaxEpisodeManifest {
    const constraints = this.mergeConstraints({ ...this.defaultConstraints, ...input.cameraConstraints });
    let totalLayers = 0;
    let totalPaddedBytes = 0;

    const exportedCuts: ExportedParallaxCut[] = input.cuts.map((cut) => {
      const focalDepth = clamp(cut.focalDepthOverride ?? constraints.focalDepth, 0, 1);
      const sortedLayers = [...cut.layers].sort(
        (a, b) => b.depthNormalized - a.depthNormalized || a.layerId.localeCompare(b.layerId),
      );
      const layers: ExportedParallaxLayer[] = sortedLayers.map((layer) => {
        const depth = clamp(layer.depthNormalized, 0, 1);
        const padding = computeDisocclusionPadding(layer.width, layer.height, depth, constraints, focalDepth);
        let layerChecksumHex: string;
        let paddedByteLength = padding.paddedWidth * padding.paddedHeight * 4;
        if (layer.rgbaPixels) {
          const filled = generateDisocclusionEdgeFillRgba(layer.rgbaPixels, layer.width, layer.height, padding.padX, padding.padY);
          layerChecksumHex = filled.checksumHex;
          paddedByteLength = filled.pixels.byteLength;
        } else {
          layerChecksumHex = fnv1a64StringHex(
            `parallax-layer:${layer.layerId}:${layer.assetRef}:${depth}:${padding.paddedWidth}x${padding.paddedHeight}`,
          );
        }
        totalLayers += 1;
        totalPaddedBytes += paddedByteLength;
        return {
          layerId: layer.layerId, cutId: cut.cutId, label: layer.label,
          width: Math.max(1, Math.floor(layer.width)), height: Math.max(1, Math.floor(layer.height)),
          depthNormalized: round6(depth), depthDeltaFromFocal: round6(focalDepth - depth),
          maxShiftUv: round6(Math.abs(focalDepth - depth) * constraints.parallaxAmplitudeUv),
          opacity: clamp(layer.opacity ?? 1, 0, 1), blendMode: layer.blendMode ?? "normal",
          assetRef: layer.assetRef, disocclusionPadding: padding, layerChecksumHex, paddedByteLength,
        };
      });
      return {
        cutId: cut.cutId, cutIndex: cut.cutIndex,
        aspectRatio: cut.aspectRatio > 0 ? cut.aspectRatio : 9 / 16,
        focalDepth: round6(focalDepth), layers,
      };
    });

    const unsigned: Omit<DepthParallaxEpisodeManifest, "manifestChecksumHex"> = {
      schemaVersion: PARALLAX_MANIFEST_SCHEMA_VERSION, serverDependency: PARALLAX_ZERO_SERVER_TAG,
      episodeId: input.episodeId, title: input.title, exportedAtIso: input.exportedAtIso ?? new Date().toISOString(),
      cameraConstraints: constraints, cuts: exportedCuts, totalLayers, totalPaddedBytes,
    };
    return { ...unsigned, manifestChecksumHex: fnv1a64StringHex(`parallax-manifest:${canonicalManifestBody(unsigned)}`) };
  }

  /** 매니페스트의 64비트 FNV-1a 무결성 봉인과 원경→근경 깊이 정렬 순서를 검증한다. */
  verifyManifestIntegrity(manifest: DepthParallaxEpisodeManifest): {
    readonly valid: boolean; readonly checksumValid: boolean;
    readonly depthOrderValid: boolean; readonly errors: readonly string[];
  } {
    const errors: string[] = [];
    const { manifestChecksumHex, ...rest } = manifest;
    const checksumValid = fnv1a64StringHex(`parallax-manifest:${canonicalManifestBody(rest)}`) === manifestChecksumHex;
    if (!checksumValid) errors.push("매니페스트 64비트 FNV-1a 체크섬이 변조되었거나 일치하지 않습니다.");
    let depthOrderValid = true;
    for (const cut of manifest.cuts) {
      for (let i = 1; i < cut.layers.length; i += 1) {
        if (cut.layers[i].depthNormalized > cut.layers[i - 1].depthNormalized + 1e-9) {
          depthOrderValid = false;
          errors.push(`컷(${cut.cutId})의 레이어 깊이 정렬 순서(원경→근경)가 깨졌습니다.`);
          break;
        }
      }
    }
    return { valid: checksumValid && depthOrderValid, checksumValid, depthOrderValid, errors };
  }
}

/* -------------------------------------------------------------------------- */
/* 2. Autonomous 120Hz Real-Frame Telemetry & Regression Gate                 */
/* -------------------------------------------------------------------------- */

export const TARGET_120HZ_FPS = 120;
export const TARGET_120HZ_FRAME_BUDGET_MS = 8.33;
export const DEFAULT_TELEMETRY_RING_CAPACITY = 512;
export const DEFAULT_VRAM_BUDGET_BYTES = 512 * 1024 * 1024;
export const DEFAULT_MAX_HEAP_SLOPE_BYTES_PER_SEC = 256 * 1024;

export type TelemetryGateStatus = "pass" | "warn" | "fail";
export type VramPressureLevel = "healthy" | "warning" | "critical";
export type CutRegressionReason = "frame-p99-regression" | "vram-budget-exceeded" | "heap-leak-contributor";

export interface FrameTelemetrySample {
  readonly frameMs: number; readonly cpuMs?: number; readonly gpuMs?: number;
  readonly heapUsedBytes: number; readonly vramUsedBytes: number;
  readonly cutId: string; readonly timestampMs: number;
}

export interface FrameTelemetryGateOptions {
  readonly ringCapacity?: number; readonly frameBudgetMs?: number; readonly vramBudgetBytes?: number;
  readonly vramWarnRatio?: number; readonly maxHeapSlopeBytesPerSec?: number;
  readonly minLeakSamples?: number; readonly minLeakRSquared?: number;
}

export interface FrameTimingSummary {
  readonly p50Ms: number; readonly p95Ms: number; readonly p99Ms: number;
  readonly meanMs: number; readonly maxMs: number; readonly budgetMs: number;
  readonly achievedFps: number; readonly droppedFrameCount: number; readonly meets120HzTarget: boolean;
}

export interface HeapLeakReport {
  readonly detected: boolean; readonly slopeBytesPerSec: number; readonly slopeKbPerSec: number;
  readonly rSquared: number; readonly netGrowthBytes: number; readonly maxAllowedSlopeBytesPerSec: number;
}

export interface VramBudgetReport {
  readonly budgetBytes: number; readonly peakUsedBytes: number; readonly latestUsedBytes: number;
  readonly headroomBytes: number; readonly utilizationRatio: number;
  readonly pressureLevel: VramPressureLevel; readonly budgetExceeded: boolean;
}

export interface CutRegressionAttribution {
  readonly cutId: string; readonly sampleCount: number;
  readonly p50Ms: number; readonly p95Ms: number; readonly p99Ms: number; readonly maxFrameMs: number;
  readonly budgetViolationCount: number; readonly peakVramBytes: number;
  readonly avgHeapDeltaBytesPerFrame: number; readonly culpritScore: number;
  readonly reasons: readonly CutRegressionReason[];
}

export interface TelemetryRegressionIssue {
  readonly code: CutRegressionReason; readonly severity: "warn" | "fail";
  readonly measuredValue: number; readonly thresholdValue: number;
  readonly culpritCutId: string | null; readonly summaryKo: string;
}

export interface FrameTelemetryGateReport {
  readonly status: TelemetryGateStatus; readonly sampleCount: number;
  readonly ringCapacity: number; readonly totalFramesRecorded: number;
  readonly frameTiming: FrameTimingSummary; readonly heapLeak: HeapLeakReport; readonly vram: VramBudgetReport;
  readonly primaryCulpritCutId: string | null;
  readonly cutAttributions: readonly CutRegressionAttribution[];
  readonly regressions: readonly TelemetryRegressionIssue[];
  readonly recommendedActionsKo: readonly string[];
}

function percentileFromSorted(sorted: Float64Array, length: number, p: number): number {
  if (length === 0) return 0;
  if (length === 1) return sorted[0];
  const rank = clamp(p, 0, 1) * (length - 1);
  const lo = Math.floor(rank);
  const hi = Math.min(length - 1, Math.ceil(rank));
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/** 고정 크기 TypedArray 링 버퍼 기반 무할당 120Hz 프레임 프로파일러 & 자동 컷 귀속 회귀 게이트. */
export class AutonomousFrameTelemetryGate {
  private readonly capacity: number;
  private readonly frameBudgetMs: number;
  private readonly vramBudgetBytes: number;
  private readonly vramWarnRatio: number;
  private readonly maxHeapSlopeBytesPerSec: number;
  private readonly minLeakSamples: number;
  private readonly minLeakRSquared: number;

  private readonly frameMsRing: Float64Array;
  private readonly cpuMsRing: Float64Array;
  private readonly gpuMsRing: Float64Array;
  private readonly heapBytesRing: Float64Array;
  private readonly vramBytesRing: Float64Array;
  private readonly timestampMsRing: Float64Array;
  private readonly cutIndexRing: Uint32Array;
  private readonly sortScratch: Float64Array;

  private readonly cutIdToIndex = new Map<string, number>();
  private readonly indexToCutId: string[] = [];
  private writeHead = 0;
  private filledCount = 0;
  private totalRecorded = 0;

  constructor(options: FrameTelemetryGateOptions = {}) {
    this.capacity = Math.max(16, Math.floor(options.ringCapacity ?? DEFAULT_TELEMETRY_RING_CAPACITY));
    this.frameBudgetMs = Math.max(0.5, options.frameBudgetMs ?? TARGET_120HZ_FRAME_BUDGET_MS);
    this.vramBudgetBytes = Math.max(1024 * 1024, options.vramBudgetBytes ?? DEFAULT_VRAM_BUDGET_BYTES);
    this.vramWarnRatio = clamp(options.vramWarnRatio ?? 0.85, 0.5, 0.99);
    this.maxHeapSlopeBytesPerSec = Math.max(1024, options.maxHeapSlopeBytesPerSec ?? DEFAULT_MAX_HEAP_SLOPE_BYTES_PER_SEC);
    this.minLeakSamples = Math.max(8, Math.floor(options.minLeakSamples ?? 16));
    this.minLeakRSquared = clamp(options.minLeakRSquared ?? 0.65, 0.2, 0.99);

    this.frameMsRing = new Float64Array(this.capacity);
    this.cpuMsRing = new Float64Array(this.capacity);
    this.gpuMsRing = new Float64Array(this.capacity);
    this.heapBytesRing = new Float64Array(this.capacity);
    this.vramBytesRing = new Float64Array(this.capacity);
    this.timestampMsRing = new Float64Array(this.capacity);
    this.cutIndexRing = new Uint32Array(this.capacity);
    this.sortScratch = new Float64Array(this.capacity);
  }

  private internCutId(cutId: string): number {
    const existing = this.cutIdToIndex.get(cutId);
    if (existing !== undefined) return existing;
    const idx = this.indexToCutId.length;
    this.indexToCutId.push(cutId);
    this.cutIdToIndex.set(cutId, idx);
    return idx;
  }

  /** 고정 링 버퍼에 실프레임 샘플을 락프리·무할당으로 기록한다. */
  recordFrame(sample: FrameTelemetrySample): void {
    const slot = this.writeHead;
    const safeFrameMs = Number.isFinite(sample.frameMs) ? Math.max(0, sample.frameMs) : 0;
    const safeCpuMs =
      sample.cpuMs !== undefined && Number.isFinite(sample.cpuMs)
        ? Math.max(0, sample.cpuMs)
        : safeFrameMs * 0.5;
    const safeGpuMs =
      sample.gpuMs !== undefined && Number.isFinite(sample.gpuMs)
        ? Math.max(0, sample.gpuMs)
        : safeFrameMs * 0.5;
    const safeHeap = Number.isFinite(sample.heapUsedBytes) ? Math.max(0, sample.heapUsedBytes) : 0;
    const safeVram = Number.isFinite(sample.vramUsedBytes) ? Math.max(0, sample.vramUsedBytes) : 0;
    const safeTs = Number.isFinite(sample.timestampMs) ? sample.timestampMs : 0;
    this.frameMsRing[slot] = safeFrameMs;
    this.cpuMsRing[slot] = safeCpuMs;
    this.gpuMsRing[slot] = safeGpuMs;
    this.heapBytesRing[slot] = safeHeap;
    this.vramBytesRing[slot] = safeVram;
    this.timestampMsRing[slot] = safeTs;
    this.cutIndexRing[slot] = this.internCutId(sample.cutId);
    this.writeHead = (slot + 1) % this.capacity;
    if (this.filledCount < this.capacity) this.filledCount += 1;
    this.totalRecorded += 1;
  }

  reset(): void { this.writeHead = 0; this.filledCount = 0; this.totalRecorded = 0; }

  /** 링 윈도우의 P50/P95/P99, 힙 누수 기울기, VRAM 여유분, 컷별 회귀 원인을 종합 판정한다. */
  evaluateGate(): FrameTelemetryGateReport {
    const n = this.filledCount;
    const oldestSlot = n < this.capacity ? 0 : this.writeHead;
    let sumMs = 0, maxMs = 0, droppedFrameCount = 0, peakVramBytes = 0, latestVramBytes = 0;

    interface CutAccum {
      readonly cutId: string; readonly frameTimes: number[];
      budgetViolationCount: number; peakVramBytes: number; heapDeltaSum: number; heapDeltaSamples: number;
    }
    const perCut = new Map<number, CutAccum>();

    for (let i = 0; i < n; i += 1) {
      const slot = (oldestSlot + i) % this.capacity;
      const fm = this.frameMsRing[slot];
      const vram = this.vramBytesRing[slot];
      const heap = this.heapBytesRing[slot];
      const cutIdx = this.cutIndexRing[slot];

      this.sortScratch[i] = fm;
      sumMs += fm;
      if (fm > maxMs) maxMs = fm;
      if (fm > this.frameBudgetMs) droppedFrameCount += 1;
      if (vram > peakVramBytes) peakVramBytes = vram;
      latestVramBytes = vram;

      let acc = perCut.get(cutIdx);
      if (!acc) {
        acc = { cutId: this.indexToCutId[cutIdx] ?? `cut-${cutIdx}`, frameTimes: [], budgetViolationCount: 0, peakVramBytes: 0, heapDeltaSum: 0, heapDeltaSamples: 0 };
        perCut.set(cutIdx, acc);
      }
      acc.frameTimes.push(fm);
      if (fm > this.frameBudgetMs) acc.budgetViolationCount += 1;
      if (vram > acc.peakVramBytes) acc.peakVramBytes = vram;
      if (i > 0) {
        acc.heapDeltaSum += heap - this.heapBytesRing[(oldestSlot + i - 1) % this.capacity];
        acc.heapDeltaSamples += 1;
      }
    }

    const activeScratch = this.sortScratch.subarray(0, n);
    activeScratch.sort();
    const p50Ms = percentileFromSorted(activeScratch, n, 0.5);
    const p95Ms = percentileFromSorted(activeScratch, n, 0.95);
    const p99Ms = percentileFromSorted(activeScratch, n, 0.99);
    const meanMs = n > 0 ? sumMs / n : 0;
    const meets120HzTarget = n === 0 || p99Ms <= this.frameBudgetMs;
    const heapLeak = this.computeHeapLeak(oldestSlot, n);

    const headroomBytes = this.vramBudgetBytes - peakVramBytes;
    const utilizationRatio = peakVramBytes / this.vramBudgetBytes;
    const budgetExceeded = peakVramBytes > this.vramBudgetBytes;
    const pressureLevel: VramPressureLevel = budgetExceeded ? "critical" : utilizationRatio >= this.vramWarnRatio ? "warning" : "healthy";

    const cutAttributions: CutRegressionAttribution[] = [];
    for (const acc of perCut.values()) {
      const sortedCut = Float64Array.from(acc.frameTimes).sort();
      const cutP99 = percentileFromSorted(sortedCut, sortedCut.length, 0.99);
      const avgHeapDelta = acc.heapDeltaSamples > 0 ? acc.heapDeltaSum / acc.heapDeltaSamples : 0;
      const reasons: CutRegressionReason[] = [];
      let culpritScore = 0;

      if (cutP99 > this.frameBudgetMs) {
        reasons.push("frame-p99-regression");
        culpritScore += ((cutP99 - this.frameBudgetMs) / this.frameBudgetMs) * 100 + acc.budgetViolationCount * 2;
      }
      if (acc.peakVramBytes > this.vramBudgetBytes) {
        reasons.push("vram-budget-exceeded");
        culpritScore += ((acc.peakVramBytes - this.vramBudgetBytes) / this.vramBudgetBytes) * 120;
      }
      if (heapLeak.detected && avgHeapDelta > 4096) {
        reasons.push("heap-leak-contributor");
        culpritScore += (avgHeapDelta / 4096) * 15;
      }

      cutAttributions.push({
        cutId: acc.cutId, sampleCount: acc.frameTimes.length,
        p50Ms: percentileFromSorted(sortedCut, sortedCut.length, 0.5),
        p95Ms: percentileFromSorted(sortedCut, sortedCut.length, 0.95),
        p99Ms: cutP99, maxFrameMs: sortedCut.length > 0 ? sortedCut[sortedCut.length - 1] : 0,
        budgetViolationCount: acc.budgetViolationCount, peakVramBytes: acc.peakVramBytes,
        avgHeapDeltaBytesPerFrame: avgHeapDelta, culpritScore, reasons,
      });
    }
    cutAttributions.sort((a, b) => b.culpritScore - a.culpritScore || b.p99Ms - a.p99Ms || a.cutId.localeCompare(b.cutId));

    const regressions: TelemetryRegressionIssue[] = [];
    const recommendedActionsKo: string[] = [];

    if (!meets120HzTarget) {
      const culprit = cutAttributions.find((c) => c.reasons.includes("frame-p99-regression"))?.cutId ?? null;
      regressions.push({
        code: "frame-p99-regression", severity: "fail", measuredValue: p99Ms, thresholdValue: this.frameBudgetMs,
        culpritCutId: culprit,
        summaryKo: `P99 프레임 시간(${p99Ms.toFixed(2)}ms)이 120Hz 예산(${this.frameBudgetMs.toFixed(2)}ms)을 초과했습니다.`,
      });
      recommendedActionsKo.push(culprit ? `${culprit} 컷의 레이어 합성·필터 패스를 타일 캐시로 분할하세요.` : "고부하 컷의 필터 패스를 타일 캐시로 분리하세요.");
    }
    if (heapLeak.detected) {
      const culprit = cutAttributions.find((c) => c.reasons.includes("heap-leak-contributor"))?.cutId ?? null;
      regressions.push({
        code: "heap-leak-contributor", severity: "fail", measuredValue: heapLeak.slopeBytesPerSec, thresholdValue: this.maxHeapSlopeBytesPerSec,
        culpritCutId: culprit,
        summaryKo: `지속적 힙 증가 기울기(${heapLeak.slopeKbPerSec.toFixed(1)} KB/s, R²=${heapLeak.rSquared.toFixed(2)})가 감지되었습니다.`,
      });
      recommendedActionsKo.push(culprit ? `${culprit} 컷의 임시 버퍼·리스너 해제 누락 여부를 점검하세요.` : "핫패스 임시 할당과 참조 해제를 점검하세요.");
    }
    if (budgetExceeded) {
      const culprit = cutAttributions.find((c) => c.reasons.includes("vram-budget-exceeded"))?.cutId ?? null;
      regressions.push({
        code: "vram-budget-exceeded", severity: "fail", measuredValue: peakVramBytes, thresholdValue: this.vramBudgetBytes,
        culpritCutId: culprit,
        summaryKo: `최대 VRAM(${(peakVramBytes / (1024 * 1024)).toFixed(1)} MiB)이 예산(${(this.vramBudgetBytes / (1024 * 1024)).toFixed(1)} MiB)을 초과했습니다.`,
      });
      recommendedActionsKo.push(culprit ? `${culprit} 컷의 고해상도 텍스처·렌더 타깃을 LRU 스왑으로 회수하세요.` : "비활성 컷 텍스처 아틀라스를 해제하세요.");
    }

    const status: TelemetryGateStatus = regressions.some((r) => r.severity === "fail") ? "fail" : pressureLevel === "warning" ? "warn" : "pass";
    const primaryCulpritCutId = regressions.length > 0 && cutAttributions.length > 0 && cutAttributions[0].culpritScore > 0 ? cutAttributions[0].cutId : null;

    return {
      status, sampleCount: n, ringCapacity: this.capacity, totalFramesRecorded: this.totalRecorded,
      frameTiming: {
        p50Ms, p95Ms, p99Ms, meanMs, maxMs, budgetMs: this.frameBudgetMs,
        achievedFps: meanMs > 1e-6 ? 1000 / meanMs : 0, droppedFrameCount, meets120HzTarget,
      },
      heapLeak,
      vram: { budgetBytes: this.vramBudgetBytes, peakUsedBytes: peakVramBytes, latestUsedBytes: latestVramBytes, headroomBytes, utilizationRatio, pressureLevel, budgetExceeded },
      primaryCulpritCutId, cutAttributions, regressions, recommendedActionsKo,
    };
  }

  private computeHeapLeak(oldestSlot: number, n: number): HeapLeakReport {
    if (n < this.minLeakSamples) {
      return { detected: false, slopeBytesPerSec: 0, slopeKbPerSec: 0, rSquared: 0, netGrowthBytes: 0, maxAllowedSlopeBytesPerSec: this.maxHeapSlopeBytesPerSec };
    }
    const t0 = this.timestampMsRing[oldestSlot];
    const lastSlot = (oldestSlot + n - 1) % this.capacity;
    const elapsedSec = (this.timestampMsRing[lastSlot] - t0) / 1000;
    const netGrowthBytes = this.heapBytesRing[lastSlot] - this.heapBytesRing[oldestSlot];
    if (elapsedSec <= 0.05) {
      return { detected: false, slopeBytesPerSec: 0, slopeKbPerSec: 0, rSquared: 0, netGrowthBytes, maxAllowedSlopeBytesPerSec: this.maxHeapSlopeBytesPerSec };
    }

    let sumX = 0, sumY = 0;
    for (let i = 0; i < n; i += 1) {
      const slot = (oldestSlot + i) % this.capacity;
      sumX += (this.timestampMsRing[slot] - t0) / 1000;
      sumY += this.heapBytesRing[slot];
    }
    const meanX = sumX / n, meanY = sumY / n;
    let sxx = 0, sxy = 0, syy = 0;
    for (let i = 0; i < n; i += 1) {
      const slot = (oldestSlot + i) % this.capacity;
      const dx = (this.timestampMsRing[slot] - t0) / 1000 - meanX;
      const dy = this.heapBytesRing[slot] - meanY;
      sxx += dx * dx; sxy += dx * dy; syy += dy * dy;
    }

    const slopeBytesPerSec = sxx > 1e-9 ? sxy / sxx : 0;
    const rSquared = sxx > 1e-9 && syy > 1e-9 ? clamp((sxy * sxy) / (sxx * syy), 0, 1) : 0;
    const detected =
      slopeBytesPerSec > this.maxHeapSlopeBytesPerSec &&
      rSquared >= this.minLeakRSquared &&
      netGrowthBytes > this.maxHeapSlopeBytesPerSec * 0.25;

    return { detected, slopeBytesPerSec, slopeKbPerSec: slopeBytesPerSec / 1024, rSquared, netGrowthBytes, maxAllowedSlopeBytesPerSec: this.maxHeapSlopeBytesPerSec };
  }
}
