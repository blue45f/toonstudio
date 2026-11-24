/**
 * Wave 38F — 완벽 3D 6축 NPR 스위트 통합 모듈 & 3D -> 2D 6패스 분리 레이어 베이크/합성기.
 *
 * - Face Shadow SDF 셰이더 + OKLCH 난색/보색 컬러 섀도우 틴트
 * - 2D G펜급 가변 두께 NPR 외곽선(Tapered Contour)
 * - 1드래그 전신 Contact-Lock IK 솔버
 * - 2D 소실점 기반 Perspective PnP 카메라 역산기
 * - 3D -> 2D 6패스 분리 레이어 베이크(lineart · albedo-id · cel-shade · cast-shadow · rim-light · z-fog) & 합성기
 */

import { clamp3d, formatOklchColor } from "./perfect-3d-contact-ik";
import {
  DEFAULT_TAPERED_CONTOUR_CONFIG,
  createDemoFaceContourSamples,
  evaluateFaceShadowSdf,
  evaluateTaperedContour,
  normalizeHueDeg,
  smoothstep3d,
  type FaceShadowSdfResult,
  type FaceShadowTintMode,
  type TaperedContourResult,
} from "./perfect-3d-face-contour";

export {
  CONTACT_LOCK_PRESETS,
  clamp3d,
  createDefaultHumanoidSkeleton,
  formatOklchColor,
  solveContactLockIk,
  type ContactLockDragHandle,
  type ContactLockIkRequest,
  type ContactLockIkResult,
  type ContactLockKind,
  type ContactLockPreset,
  type ContactLockPresetId,
  type ContactLockTarget,
  type HumanoidJointId,
  type OklchColor,
  type Vec3,
} from "./perfect-3d-contact-ik";

export {
  PERSPECTIVE_CAMERA_PRESETS,
  projectPerspectiveGuideLines,
  solvePerspectivePnPFromVanishingLines,
  type LineSegment2D,
  type PerspectiveCameraParams,
  type PerspectiveGuidePairInput,
  type PerspectivePnPResult,
  type PerspectivePreset,
  type Vec2,
} from "./perfect-3d-perspective-pnp";

export {
  DEFAULT_SKIN_BASE_OKLCH,
  DEFAULT_TAPERED_CONTOUR_CONFIG,
  computeOklchFaceShadowTint,
  createDemoFaceContourSamples,
  evaluateFaceShadowSdf,
  evaluateTaperedContour,
  type ContourEdgeCategory,
  type FaceShadowSdfInput,
  type FaceShadowSdfResult,
  type FaceShadowTintMode,
  type FaceShadowTintPalette,
  type TaperedContourConfig,
  type TaperedContourEvaluatedPoint,
  type TaperedContourResult,
  type TaperedContourSampleInput,
} from "./perfect-3d-face-contour";

export type SixPassLayerId =
  | "lineart"
  | "albedo-id"
  | "cel-shade"
  | "cast-shadow"
  | "rim-light"
  | "z-fog";

export type SixPassBlendMode = "normal" | "multiply" | "screen" | "add";

export interface SixPassLayerEntry {
  readonly id: SixPassLayerId;
  readonly labelKo: string;
  readonly blendMode: SixPassBlendMode;
  readonly defaultOpacity: number;
  readonly zOrder: number;
  readonly editable2dPurposeKo: string;
  readonly coverageRatio: number;
  readonly pixelsL: Float32Array;
  readonly pixelsC: Float32Array;
  readonly pixelsH: Float32Array;
  readonly pixelsA: Float32Array;
}

export interface SixPassBakeInput {
  readonly gridSize?: number;
  readonly lightAzimuthDeg: number;
  readonly lightElevationDeg: number;
  readonly tintMode?: FaceShadowTintMode;
  readonly fogDensity?: number;
  readonly rimIntensity?: number;
  readonly contourWidthPx?: number;
}

export interface SixPassBakeManifest {
  readonly width: number;
  readonly height: number;
  readonly passes: readonly SixPassLayerEntry[];
  readonly faceSdf: FaceShadowSdfResult;
  readonly contour: TaperedContourResult;
  readonly manifestHashHex: string;
  readonly totalPixelCount: number;
}

export type SixPassVisibilityMap = Readonly<Record<SixPassLayerId, boolean>>;

export interface SixPassCompositeResult {
  readonly width: number;
  readonly height: number;
  readonly outL: Float32Array;
  readonly outC: Float32Array;
  readonly outH: Float32Array;
  readonly outA: Float32Array;
  readonly activePassIds: readonly SixPassLayerId[];
  readonly activePassCount: number;
  readonly meanLuminance: number;
  readonly compositeChecksum: string;
}

export const ALL_SIX_PASS_IDS: readonly SixPassLayerId[] = [
  "albedo-id",
  "cel-shade",
  "cast-shadow",
  "z-fog",
  "rim-light",
  "lineart",
] as const;

export const DEFAULT_SIX_PASS_VISIBILITY: SixPassVisibilityMap = {
  "albedo-id": true,
  "cel-shade": true,
  "cast-shadow": true,
  "z-fog": true,
  "rim-light": true,
  lineart: true,
};

const DEG_TO_RAD = Math.PI / 180;

function fnv1aHex(values: Float32Array): string {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(values.length / 256));
  for (let i = 0; i < values.length; i += step) {
    const quantized = Math.round((values[i] ?? 0) * 1000);
    hash ^= quantized & 0xff;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function createPassBuffers(total: number): {
  readonly pixelsL: Float32Array;
  readonly pixelsC: Float32Array;
  readonly pixelsH: Float32Array;
  readonly pixelsA: Float32Array;
} {
  return {
    pixelsL: new Float32Array(total),
    pixelsC: new Float32Array(total),
    pixelsH: new Float32Array(total),
    pixelsA: new Float32Array(total),
  };
}

function computeCoverageRatio(alphaBuf: Float32Array): number {
  let count = 0;
  for (let i = 0; i < alphaBuf.length; i += 1) {
    if ((alphaBuf[i] ?? 0) > 0.04) count += 1;
  }
  return alphaBuf.length > 0 ? Number((count / alphaBuf.length).toFixed(4)) : 0;
}

/**
 * 3D -> 2D 6패스 분리 레이어 베이크(lineart · albedo-id · cel-shade · cast-shadow · rim-light · z-fog).
 */
export function bakeSixPass2dLayers(input: SixPassBakeInput): SixPassBakeManifest {
  const size = Math.round(clamp3d(input.gridSize ?? 32, 16, 64));
  const total = size * size;
  const fogDensity = clamp3d(input.fogDensity ?? 0.42, 0, 1);
  const rimIntensity = clamp3d(input.rimIntensity ?? 0.85, 0, 1.5);

  const faceSdf = evaluateFaceShadowSdf({
    azimuthDeg: input.lightAzimuthDeg,
    elevationDeg: input.lightElevationDeg,
    tintMode: input.tintMode ?? "warm-subsurface",
    gridSize: size,
  });

  const contour = evaluateTaperedContour(createDemoFaceContourSamples(24, input.lightAzimuthDeg), {
    ...DEFAULT_TAPERED_CONTOUR_CONFIG,
    baseWidthPx: clamp3d(input.contourWidthPx ?? 2.2, 0.8, 5.5),
  });

  const albedoBuf = createPassBuffers(total);
  const celBuf = createPassBuffers(total);
  const castBuf = createPassBuffers(total);
  const fogBuf = createPassBuffers(total);
  const rimBuf = createPassBuffers(total);
  const lineBuf = createPassBuffers(total);

  const lightDirX = Math.sin(input.lightAzimuthDeg * DEG_TO_RAD);
  const shadowShiftX = -lightDirX * 0.24;

  for (let y = 0; y < size; y += 1) {
    const v = 1 - ((y + 0.5) / size) * 2;
    for (let x = 0; x < size; x += 1) {
      const u = ((x + 0.5) / size) * 2 - 1;
      const idx = y * size + x;
      const alpha = faceSdf.faceAlpha[idx] ?? 0;

      // 1) albedo-id
      const isHairRegion = alpha > 0.05 && v > 0.36 + 0.16 * Math.cos(u * Math.PI * 1.4);
      const isNeckCollar = alpha <= 0.05 && Math.abs(u) < 0.32 && v < -0.52 && v > -0.96;

      if (alpha > 0.05) {
        if (isHairRegion) {
          albedoBuf.pixelsL[idx] = 0.34;
          albedoBuf.pixelsC[idx] = 0.085;
          albedoBuf.pixelsH[idx] = 264;
          albedoBuf.pixelsA[idx] = alpha;
        } else {
          albedoBuf.pixelsL[idx] = faceSdf.palette.litSkinOklch.l;
          albedoBuf.pixelsC[idx] = faceSdf.palette.litSkinOklch.c;
          albedoBuf.pixelsH[idx] = faceSdf.palette.litSkinOklch.h;
          albedoBuf.pixelsA[idx] = alpha;
        }
      } else if (isNeckCollar) {
        albedoBuf.pixelsL[idx] = 0.62;
        albedoBuf.pixelsC[idx] = 0.075;
        albedoBuf.pixelsH[idx] = 232;
        albedoBuf.pixelsA[idx] = 0.92;
      }

      // 2) cel-shade
      if (alpha > 0.05) {
        const lit = faceSdf.litMask[idx] ?? 1;
        const shadowWeight = clamp3d((1 - lit) * alpha, 0, 1);
        const sssWeight = faceSdf.sssTerminatorMask[idx] ?? 0;
        const combinedAlpha = clamp3d(Math.max(shadowWeight * 0.78, sssWeight * 0.42), 0, 0.85);
        if (combinedAlpha > 0.02) {
          const tint =
            sssWeight > shadowWeight * 0.7
              ? faceSdf.palette.sssTerminatorOklch
              : faceSdf.palette.shadowTintOklch;
          celBuf.pixelsL[idx] = tint.l;
          celBuf.pixelsC[idx] = tint.c;
          celBuf.pixelsH[idx] = tint.h;
          celBuf.pixelsA[idx] = combinedAlpha;
        }
      }

      // 3) cast-shadow
      const underChinShadow =
        Math.hypot((u - shadowShiftX * 0.5) / 0.34, (v + 0.76) / 0.22) < 1;
      const backdropDropShadow =
        alpha < 0.05 && Math.hypot((u - shadowShiftX) / 0.74, (v + 0.08) / 0.88) < 1;
      if (underChinShadow || backdropDropShadow) {
        castBuf.pixelsL[idx] = 0.28;
        castBuf.pixelsC[idx] = 0.045;
        castBuf.pixelsH[idx] = faceSdf.palette.shadowTintOklch.h;
        castBuf.pixelsA[idx] = underChinShadow ? 0.56 : 0.22;
      }

      // 4) z-fog
      const pseudoDepth =
        alpha > 0.05 ? 0.18 + (1 - alpha) * 0.35 : 0.68 + (0.5 - v * 0.25) * 0.24;
      const fogAlpha = clamp3d(pseudoDepth * fogDensity * 0.48, 0, 0.65);
      if (fogAlpha > 0.02) {
        fogBuf.pixelsL[idx] = 0.9;
        fogBuf.pixelsC[idx] = 0.028;
        fogBuf.pixelsH[idx] = 235;
        fogBuf.pixelsA[idx] = fogAlpha;
      }

      // 5) rim-light
      const jawTaper = v < 0 ? 1 + v * 0.26 : 1;
      const ovalR = Math.hypot(u / (0.68 * jawTaper), (v - 0.03) / 0.84);
      if (alpha > 0.05) {
        const edgeRing = smoothstep3d(0.76, 0.96, ovalR);
        const rimSide = clamp3d(0.45 + 0.55 * (u * lightDirX + 0.35 * Math.max(0, v)), 0, 1);
        const rimAlpha = clamp3d(edgeRing * rimSide * rimIntensity * alpha, 0, 0.92);
        if (rimAlpha > 0.03) {
          rimBuf.pixelsL[idx] = faceSdf.palette.rimHighlightOklch.l;
          rimBuf.pixelsC[idx] = faceSdf.palette.rimHighlightOklch.c;
          rimBuf.pixelsH[idx] = faceSdf.palette.rimHighlightOklch.h;
          rimBuf.pixelsA[idx] = rimAlpha;
        }
      }

      // 6) lineart
      const shadowSideThick = 0.042 + Math.max(0, -u * lightDirX) * 0.028;
      const silhouetteInk =
        1 - smoothstep3d(shadowSideThick * 0.45, shadowSideThick, Math.abs(ovalR - 0.97));
      const eyeLeft =
        Math.hypot((u + 0.24) / 0.11, (v - 0.1) / 0.045) < 1 &&
        Math.hypot((u + 0.24) / 0.08, (v - 0.085) / 0.028) > 0.72;
      const eyeRight =
        Math.hypot((u - 0.24) / 0.11, (v - 0.1) / 0.045) < 1 &&
        Math.hypot((u - 0.24) / 0.08, (v - 0.085) / 0.028) > 0.72;
      const mouthLine = Math.abs(v + 0.36 - 0.03 * u * u) < 0.026 && Math.abs(u) < 0.14;
      const lineAlpha = clamp3d(
        Math.max(silhouetteInk, eyeLeft || eyeRight ? 0.92 : 0, mouthLine ? 0.76 : 0),
        0,
        1,
      );
      if (lineAlpha > 0.04) {
        lineBuf.pixelsL[idx] = 0.19;
        lineBuf.pixelsC[idx] = 0.024;
        lineBuf.pixelsH[idx] = 270;
        lineBuf.pixelsA[idx] = lineAlpha;
      }
    }
  }

  const passes: readonly SixPassLayerEntry[] = [
    {
      id: "albedo-id",
      labelKo: "평면 컬러 ID (Albedo-ID)",
      blendMode: "normal",
      defaultOpacity: 1,
      zOrder: 1,
      editable2dPurposeKo: "자동 선택봉 1클릭 밑색 지정·영역 마스크 분리에 사용",
      coverageRatio: computeCoverageRatio(albedoBuf.pixelsA),
      ...albedoBuf,
    },
    {
      id: "cel-shade",
      labelKo: "얼굴 SDF 셀 음영 (Cel-Shade)",
      blendMode: "multiply",
      defaultOpacity: 0.88,
      zOrder: 2,
      editable2dPurposeKo: "난색/보색 OKLCH 그림자 색조·불투명도를 독립 조정",
      coverageRatio: computeCoverageRatio(celBuf.pixelsA),
      ...celBuf,
    },
    {
      id: "cast-shadow",
      labelKo: "투영 그림자 (Cast-Shadow)",
      blendMode: "multiply",
      defaultOpacity: 0.72,
      zOrder: 3,
      editable2dPurposeKo: "턱 밑·배경 접지 그림자만 별도 블러·가감 편집",
      coverageRatio: computeCoverageRatio(castBuf.pixelsA),
      ...castBuf,
    },
    {
      id: "z-fog",
      labelKo: "깊이 안개 (Z-Fog)",
      blendMode: "screen",
      defaultOpacity: 0.65,
      zOrder: 4,
      editable2dPurposeKo: "원경 공기원근·실내 먼지광 대기감 분리 제어",
      coverageRatio: computeCoverageRatio(fogBuf.pixelsA),
      ...fogBuf,
    },
    {
      id: "rim-light",
      labelKo: "역광 림라이트 (Rim-Light)",
      blendMode: "add",
      defaultOpacity: 0.86,
      zOrder: 5,
      editable2dPurposeKo: "캐릭터 실루엣 분리용 하이라이트 가산 리터칭",
      coverageRatio: computeCoverageRatio(rimBuf.pixelsA),
      ...rimBuf,
    },
    {
      id: "lineart",
      labelKo: "G펜 가변 선화 (Lineart)",
      blendMode: "normal",
      defaultOpacity: 1,
      zOrder: 6,
      editable2dPurposeKo: "최상단 독립 선화 레이어로 2D G펜 가필·강약 보정",
      coverageRatio: computeCoverageRatio(lineBuf.pixelsA),
      ...lineBuf,
    },
  ];

  const hashSeed = new Float32Array(passes.length * 3);
  passes.forEach((p, idx) => {
    hashSeed[idx * 3] = p.coverageRatio;
    hashSeed[idx * 3 + 1] = p.zOrder;
    hashSeed[idx * 3 + 2] = p.pixelsL[Math.floor(total * 0.5)] ?? 0;
  });

  return {
    width: size,
    height: size,
    passes,
    faceSdf,
    contour,
    manifestHashHex: fnv1aHex(hashSeed),
    totalPixelCount: total,
  };
}

/**
 * 6패스 분리 레이어 매니페스트를 zOrder와 블렌드 모드에 맞춰 2D 합성한다.
 */
export function compositeSixPassLayers(
  manifest: SixPassBakeManifest,
  visibility: Partial<SixPassVisibilityMap> = DEFAULT_SIX_PASS_VISIBILITY,
  opacityOverrides?: Partial<Record<SixPassLayerId, number>>,
): SixPassCompositeResult {
  const total = manifest.width * manifest.height;
  const outL = new Float32Array(total);
  const outC = new Float32Array(total);
  const outH = new Float32Array(total);
  const outA = new Float32Array(total);

  outL.fill(0.95);
  outC.fill(0.008);
  outH.fill(85);
  outA.fill(1);

  const orderedPasses = [...manifest.passes].sort((a, b) => a.zOrder - b.zOrder);
  const activePassIds: SixPassLayerId[] = [];

  for (const pass of orderedPasses) {
    const isVisible = visibility[pass.id] ?? true;
    if (!isVisible) continue;
    const opacity = clamp3d(opacityOverrides?.[pass.id] ?? pass.defaultOpacity, 0, 1);
    if (opacity <= 0.001) continue;
    activePassIds.push(pass.id);

    for (let i = 0; i < total; i += 1) {
      const srcA = clamp3d((pass.pixelsA[i] ?? 0) * opacity, 0, 1);
      if (srcA <= 0.001) continue;

      const dstL = outL[i] ?? 0.95;
      const dstC = outC[i] ?? 0.008;
      const dstH = outH[i] ?? 85;
      const srcL = pass.pixelsL[i] ?? 0.5;
      const srcC = pass.pixelsC[i] ?? 0;
      const srcH = pass.pixelsH[i] ?? dstH;

      let nextL: number;
      let nextC: number;
      let nextH: number;

      if (pass.blendMode === "multiply") {
        const multL = dstL * (0.42 + 0.58 * srcL);
        nextL = dstL * (1 - srcA) + multL * srcA;
        nextC = clamp3d(dstC * (1 - srcA * 0.65) + srcC * srcA * 0.95, 0, 0.32);
        nextH = srcA > 0.15 ? srcH : dstH;
      } else if (pass.blendMode === "screen") {
        const scrL = 1 - (1 - dstL) * (1 - srcL * 0.65);
        nextL = dstL * (1 - srcA) + scrL * srcA;
        nextC = dstC * (1 - srcA * 0.4) + srcC * srcA * 0.4;
        nextH = dstH;
      } else if (pass.blendMode === "add") {
        nextL = clamp3d(dstL + srcL * srcA * 0.45, 0, 0.99);
        nextC = clamp3d(dstC * (1 - srcA * 0.3) + srcC * srcA * 0.45, 0, 0.3);
        nextH = srcA > 0.3 ? srcH : dstH;
      } else {
        nextL = dstL * (1 - srcA) + srcL * srcA;
        nextC = dstC * (1 - srcA) + srcC * srcA;
        nextH = srcA > 0.2 ? srcH : dstH;
      }

      outL[i] = clamp3d(nextL, 0.03, 0.99);
      outC[i] = clamp3d(nextC, 0, 0.35);
      outH[i] = normalizeHueDeg(nextH);
      outA[i] = 1;
    }
  }

  let lumSum = 0;
  for (let i = 0; i < total; i += 1) {
    lumSum += outL[i] ?? 0;
  }

  return {
    width: manifest.width,
    height: manifest.height,
    outL,
    outC,
    outH,
    outA,
    activePassIds,
    activePassCount: activePassIds.length,
    meanLuminance: total > 0 ? Number((lumSum / total).toFixed(4)) : 0,
    compositeChecksum: fnv1aHex(outL),
  };
}

export function formatSixPassOklch(l: number, c: number, h: number, alpha?: number): string {
  return formatOklchColor({ l, c, h }, alpha);
}
