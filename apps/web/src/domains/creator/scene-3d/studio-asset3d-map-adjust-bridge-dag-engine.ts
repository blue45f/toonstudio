/**
 * Studio 3D 맵 색조/노멀 보정·페인트 커버리지 합성·옥타헤드럴 본/트래킹 선정·버텍스 컬러 오버레이·
 * 로컬호스트 DCC 브리지(5324~5328)/3D 슬라이서/리메시/AI 언랩·노드 DAG 파이프라인 엔진 — VARCO 3D 심층 역공학 모듈 (5단계).
 *
 * `https://3d.varco.ai/_assets/index-0_QlvNS9.js`의 다음 핵심 서브시스템을 1:1 수식·상수 수준으로 역공학하여
 * ToonStudio 3D 인스펙터 워크벤치 및 포즈 스튜디오에 통합합니다:
 * 1. `BrushManager.ensureMapAdjustMaterial` & `exportPaintedTextures`
 * 2. `AnimationManager.findBestTrackingBone` & `BoneVisualizer`
 * 3. `VertexColorPreviewManager`
 * 4. `DCC_PORTS` (5324~5328), `SLICERS`, `RemeshPanel`, `UnwrapPanel`, `usePivotToBottom`
 * 5. `edgeGeometry` & `createCanvasStore.addDag`
 */

import type { StudioMannequinVec3 } from "./studio-asset3d-preview-inspector";

// ============================================================================
// 1. Constants & Metrics
// ============================================================================

export interface StudioAsset3dMapAdjustment {
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly normalStrength: number;
  readonly invert: boolean;
}

/** `IDENTITY_MAP_ADJUSTMENT` (`index-0_QlvNS9.js`). */
export const STUDIO_ASSET3D_IDENTITY_MAP_ADJUSTMENT: StudioAsset3dMapAdjustment = Object.freeze({
  brightness: 0,
  contrast: 0,
  saturation: 0,
  normalStrength: 0,
  invert: false,
});

/** `FLATTEN_BRUSH_HEX` (`#808080`, 중립 범프 높이 0.5). */
export const STUDIO_ASSET3D_FLATTEN_BRUSH_HEX = "#808080" as const;

export type StudioAsset3dBrushToolType =
  | "paint"
  | "clone"
  | "blur"
  | "smudge"
  | "erase"
  | "flatten"
  | "adjust";

export type StudioAsset3dBrushControlKey = "size" | "strength" | "hardness" | "color";

/** `BRUSH_CONTROLS_BY_TYPE` (`index-0_QlvNS9.js`). */
export const STUDIO_ASSET3D_BRUSH_CONTROLS_BY_TYPE: Readonly<
  Record<StudioAsset3dBrushToolType, readonly StudioAsset3dBrushControlKey[]>
> = Object.freeze({
  paint: Object.freeze(["size", "strength", "hardness", "color"] as const),
  clone: Object.freeze(["size", "strength", "hardness"] as const),
  blur: Object.freeze(["size", "strength", "hardness"] as const),
  smudge: Object.freeze(["size", "strength", "hardness"] as const),
  erase: Object.freeze(["size", "strength", "hardness"] as const),
  flatten: Object.freeze(["size", "strength", "hardness"] as const),
  adjust: Object.freeze([] as const),
});

/** `BrushPanel` 3D 텍스처 페인팅 브러시 기본값 및 범위 (`size: 1..45`, default `12`). */
export const STUDIO_ASSET3D_TEXTURE_BRUSH_DEFAULTS = Object.freeze({
  minSizePx: 1,
  maxSizePx: 45,
  defaultSizePx: 12,
  defaultStrength: 1.0,
  defaultHardness: 0.7,
  defaultColorHex: "#ff0000",
  keyStepPx: 1,
});

/** `VertexColorPreviewManager` 오버레이 재질 상수 (`color: 0xe0e0e0 = 14737632`). */
export const STUDIO_ASSET3D_VERTEX_COLOR_OVERLAY_CONFIG = Object.freeze({
  baseColorHex: "#e0e0e0",
  baseColorInt: 14737632,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
  depthWrite: false,
  renderOrder: 0.5,
});

export type StudioAsset3dAssetOutputType = "mesh" | "rigged-mesh" | "animated-mesh";

/** `DEFAULT_PIVOT_TO_BOTTOM_BY_OUTPUT_TYPE` (`index-0_QlvNS9.js`). */
export const STUDIO_ASSET3D_DEFAULT_PIVOT_TO_BOTTOM: Readonly<
  Record<StudioAsset3dAssetOutputType, boolean>
> = Object.freeze({
  mesh: false,
  "rigged-mesh": true,
  "animated-mesh": true,
});

export type StudioAsset3dDccBridgeName = "Blender" | "Unreal" | "Unity" | "3ds Max" | "Maya";

export interface StudioAsset3dDccBridgePortSpec {
  readonly name: StudioAsset3dDccBridgeName;
  readonly port: number;
  readonly statusUrl: string;
  readonly importUrl: string;
  readonly pluginUrl: string;
  readonly docsUrl: string;
  readonly pingTimeoutMs: number;
}

/** `DCC_PORTS` (`5324..5328`, `index-0_QlvNS9.js`). */
export const STUDIO_ASSET3D_DCC_BRIDGE_PORTS: readonly StudioAsset3dDccBridgePortSpec[] = Object.freeze([
  Object.freeze({ name: "Blender", port: 5324, statusUrl: "http://localhost:5324/status", importUrl: "http://localhost:5324/import", pluginUrl: "/api/objects/named/18e9593c2d3ac3361a7de38c4f5734d7.zip/VARCO3D-Bridge-for-Blender-v1.1.2.zip", docsUrl: "https://3d.varco.ai/blog/2026-03-19-varco-3d-bridge-for-blender", pingTimeoutMs: 1500 }),
  Object.freeze({ name: "Unreal", port: 5325, statusUrl: "http://localhost:5325/status", importUrl: "http://localhost:5325/import", pluginUrl: "/api/objects/named/e8145bc737907a2988e254d85e19ef1f.zip/VARCO3DPlugin-1.1.1-Win64-UE5.8.zip", docsUrl: "https://3d.varco.ai/blog/2026-03-19-varco-3d-bridge-for-unreal", pingTimeoutMs: 1500 }),
  Object.freeze({ name: "Unity", port: 5326, statusUrl: "http://localhost:5326/status", importUrl: "http://localhost:5326/import", pluginUrl: "/api/objects/named/a4c93f773cb1c6c25e2d02d61065af46.zip/VARCO3D-Bridge-for-Unity-v1.1.0.zip", docsUrl: "https://3d.varco.ai/blog/2026-03-19-varco-3d-bridge-for-unity", pingTimeoutMs: 1500 }),
  Object.freeze({ name: "3ds Max", port: 5327, statusUrl: "http://localhost:5327/status", importUrl: "http://localhost:5327/import", pluginUrl: "/api/objects/named/56b4c2847fc9b9075ba0b954e0e135da.msi/VARCO3D-Bridge-for-3ds-Max-2026-v1.1.1.msi", docsUrl: "https://3d.varco.ai/blog/2026-03-19-varco-3d-bridge-for-3ds-max", pingTimeoutMs: 1500 }),
  Object.freeze({ name: "Maya", port: 5328, statusUrl: "http://localhost:5328/status", importUrl: "http://localhost:5328/import", pluginUrl: "/api/objects/named/4d714259859536968ce92ebfd929750f.msi/VARCO3D-Bridge-for-Maya-2026-v1.1.0.msi", docsUrl: "https://3d.varco.ai/blog/2026-03-19-varco-3d-bridge-for-maya", pingTimeoutMs: 1500 }),
]);

export type StudioAsset3dSlicerName = "Bambu Studio" | "OrcaSlicer" | "UltiMaker Cura";

export interface StudioAsset3dSlicerSpec {
  readonly name: StudioAsset3dSlicerName;
  readonly format: "3mf" | "stl";
  readonly docsUrl: string;
}

/** `SLICERS` (`index-0_QlvNS9.js`). */
export const STUDIO_ASSET3D_SLICER_SPECS: readonly StudioAsset3dSlicerSpec[] = Object.freeze([
  Object.freeze({ name: "Bambu Studio", format: "3mf", docsUrl: "https://bambulab.com/en/download/studio" }),
  Object.freeze({ name: "OrcaSlicer", format: "stl", docsUrl: "https://github.com/OrcaSlicer/OrcaSlicer/releases" }),
  Object.freeze({ name: "UltiMaker Cura", format: "stl", docsUrl: "https://ultimaker.com/software/ultimaker-cura/" }),
]);

/** `RemeshPanel` & `UnwrapPanel` 상수 (`FREE_TIER_POLYGON = 50000`, `MAX_CUSTOM_POLYGON_COUNT = 100000`). */
export const STUDIO_ASSET3D_REMESH_UNWRAP_METRICS = Object.freeze({
  presetPolygonCounts: Object.freeze([5_000, 10_000, 50_000, 100_000]),
  freeTierPolygonCount: 50_000,
  freeTierTopology: "tri" as const,
  minCustomPolygonCount: 1_000,
  maxCustomPolygonCount: 100_000,
  unwrapFaceLimitThreshold: 50_000,
  unwrapReducedFaceCount: 20_000,
});

/** `TIMING` (`createCanvasStore` DAG 파이프라인 애니메이션 타이밍 상수). */
export const STUDIO_ASSET3D_DAG_TIMING_METRICS = Object.freeze({
  textWordMs: 28,
  textMaxMs: 1_600,
  nodeSideMs: 150,
  nodeStepMs: 520,
  edgeMs: 420,
  moveMs: 650,
  removeMs: 350,
  edgeDownstreamOverlapRatio: 0.85,
  portOverlapMarginPx: 10,
  portAnchorOffsetPx: 4,
  minControlPointDistancePx: 40,
  arrowLengthPx: 7,
  arrowHalfWidthRatio: 0.6,
});

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function cleanZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

// ============================================================================
// 2. Brush Map Adjustment, Bump Sculpt Scalar & Coverage Composite
// ============================================================================

/** Reverse-engineered from `scalarValueToHex` (`index-0_QlvNS9.js`). */
export function scalarToAsset3dGrayscaleHex(value: number): string {
  const byte = Math.round(clamp(value, 0, 1) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${byte}${byte}${byte}`;
}

/**
 * Reverse-engineered from `BrushPanel` bump height calculation:
 * `wu = 0.5 + (direction === "raise" ? 1 : -1) * depth * 0.5`.
 */
export function evaluateAsset3dBumpSculptHeightScalar(
  direction: "raise" | "carve",
  depth: number,
): { readonly heightScalar: number; readonly swatchHex: string } {
  const clampedDepth = clamp(depth, 0, 1);
  const sign = direction === "raise" ? 1 : -1;
  const heightScalar = cleanZero(0.5 + sign * clampedDepth * 0.5);
  return Object.freeze({
    heightScalar,
    swatchHex: scalarToAsset3dGrayscaleHex(heightScalar),
  });
}

/** Reverse-engineered from `BrushPanel` `[` / `]` keyboard shortcut (`Math.min(45, Math.max(1, size ± 1))`). */
export function stepAsset3dPbrBrushSizeByKey(currentSizePx: number, key: string): number {
  const { minSizePx, maxSizePx, keyStepPx } = STUDIO_ASSET3D_TEXTURE_BRUSH_DEFAULTS;
  if (key === "[") {
    return clamp(currentSizePx - keyStepPx, minSizePx, maxSizePx);
  }
  if (key === "]") {
    return clamp(currentSizePx + keyStepPx, minSizePx, maxSizePx);
  }
  return clamp(currentSizePx, minSizePx, maxSizePx);
}

/** Reverse-engineered from `BrushManager.previewMapAdjustment` identity check (`index-0_QlvNS9.js`). */
export function isAsset3dMapAdjustmentIdentity(
  adjustment: StudioAsset3dMapAdjustment,
  channelGroup: "baseColor" | "normal" | "orm",
): boolean {
  if (channelGroup === "normal") {
    return adjustment.normalStrength === 0 && !adjustment.invert;
  }
  return (
    adjustment.brightness === 0 &&
    adjustment.contrast === 0 &&
    adjustment.saturation === 0 &&
    !adjustment.invert
  );
}

/** Reverse-engineered from `BrushManager.ensureMapAdjustMaterial` GLSL fragment shader (`index-0_QlvNS9.js`). */
export function evaluateAsset3dMapAdjustmentTexel(params: {
  readonly srcRgba: readonly [number, number, number, number];
  readonly adjustment: StudioAsset3dMapAdjustment;
  readonly channelGroup: "baseColor" | "normal" | "orm";
  readonly channelMask?: readonly [number, number, number];
}): readonly [number, number, number, number] {
  const [sr, sg, sb, sa] = params.srcRgba;
  const { adjustment, channelGroup } = params;

  if (channelGroup === "normal") {
    const uNormalStrength = 1 + adjustment.normalStrength / 100;
    const uInvert = adjustment.invert ? 1 : 0;
    let nx = (sr * 2 - 1) * uNormalStrength;
    let ny = (sg * 2 - 1) * uNormalStrength;
    ny = lerp(ny, -ny, uInvert);
    let nz = sb * 2 - 1;
    const len = Math.hypot(nx, ny, nz);
    if (len > 1e-8) {
      nx /= len;
      ny /= len;
      nz /= len;
    } else {
      nx = 0;
      ny = 0;
      nz = 1;
    }
    return [
      cleanZero(nx * 0.5 + 0.5),
      cleanZero(ny * 0.5 + 0.5),
      cleanZero(nz * 0.5 + 0.5),
      sa,
    ];
  }

  const uBrightness = adjustment.brightness / 100;
  const uContrast = 1 + adjustment.contrast / 100;
  const uSaturation = channelGroup === "baseColor" ? 1 + adjustment.saturation / 100 : 1;
  const uInvert = adjustment.invert ? 1 : 0;
  const uPerceptual = channelGroup === "baseColor" ? 1 : 0;
  const mask = params.channelMask ?? [1, 1, 1];

  const linR = Math.max(sr, 0);
  const linG = Math.max(sg, 0);
  const linB = Math.max(sb, 0);

  let cr = lerp(linR, Math.pow(linR, 1 / 2.2), uPerceptual);
  let cg = lerp(linG, Math.pow(linG, 1 / 2.2), uPerceptual);
  let cb = lerp(linB, Math.pow(linB, 1 / 2.2), uPerceptual);

  cr = (cr + uBrightness - 0.5) * uContrast + 0.5;
  cg = (cg + uBrightness - 0.5) * uContrast + 0.5;
  cb = (cb + uBrightness - 0.5) * uContrast + 0.5;

  const luma = 0.299 * cr + 0.587 * cg + 0.114 * cb;
  cr = clamp(lerp(lerp(luma, cr, uSaturation), 1 - lerp(luma, cr, uSaturation), uInvert), 0, 1);
  cg = clamp(lerp(lerp(luma, cg, uSaturation), 1 - lerp(luma, cg, uSaturation), uInvert), 0, 1);
  cb = clamp(lerp(lerp(luma, cb, uSaturation), 1 - lerp(luma, cb, uSaturation), uInvert), 0, 1);

  const backR = lerp(cr, Math.pow(cr, 2.2), uPerceptual);
  const backG = lerp(cg, Math.pow(cg, 2.2), uPerceptual);
  const backB = lerp(cb, Math.pow(cb, 2.2), uPerceptual);

  return [
    cleanZero(lerp(sr, backR, mask[0])),
    cleanZero(lerp(sg, backG, mask[1])),
    cleanZero(lerp(sb, backB, mask[2])),
    sa,
  ];
}

/** Reverse-engineered from `BrushManager.exportPaintedTextures` composite shader (`index-0_QlvNS9.js`). */
export function evaluateAsset3dPaintedTextureCompositeTexel(params: {
  readonly originalRgba: readonly [number, number, number, number];
  readonly sourceRgb: readonly [number, number, number];
  readonly paintedRgb: readonly [number, number, number];
  readonly maskR: number;
  readonly accumulateCoverage: boolean;
}): readonly [number, number, number, number] {
  const coverage = params.maskR >= 0.5 ? 1 : 0;
  const maxDiff = Math.max(
    Math.abs(params.paintedRgb[0] - params.sourceRgb[0]),
    Math.abs(params.paintedRgb[1] - params.sourceRgb[1]),
    Math.abs(params.paintedRgb[2] - params.sourceRgb[2]),
  );
  const changed = maxDiff >= 0.0001 ? 1 : 0;
  const blendFactor = coverage * changed;
  const priorCoverage = params.originalRgba[3] * (params.accumulateCoverage ? 1 : 0);

  return [
    cleanZero(lerp(params.originalRgba[0], params.paintedRgb[0], blendFactor)),
    cleanZero(lerp(params.originalRgba[1], params.paintedRgb[1], blendFactor)),
    cleanZero(lerp(params.originalRgba[2], params.paintedRgb[2], blendFactor)),
    Math.max(priorCoverage, coverage),
  ];
}

// ============================================================================
// 3. AnimationManager Tracking Bone Selection & BoneVisualizer Octahedral Mesh
// ============================================================================

export interface StudioAsset3dPositionTrackCandidate {
  readonly boneName: string;
  readonly hierarchyDepth: number;
  readonly values: ArrayLike<number>;
}

const EXCLUDED_TRACKING_BONE_PATTERN = /Finger|Toe|Hand|Foot|Head|End|Eye|Jaw/i;

/** Reverse-engineered from `AnimationManager.findBestTrackingBone` (`index-0_QlvNS9.js`). */
export function selectAsset3dBestTrackingBone(
  candidates: readonly StudioAsset3dPositionTrackCandidate[],
): { readonly bestBoneName: string | null; readonly bestScore: number } {
  let bestScore = 0;
  let bestBoneName: string | null = null;

  for (const candidate of candidates) {
    if (EXCLUDED_TRACKING_BONE_PATTERN.test(candidate.boneName)) {
      continue;
    }
    const { values } = candidate;
    if (values.length < 6) {
      continue;
    }
    let totalDistance = 0;
    for (let i = 0; i <= values.length - 6; i += 3) {
      const dx = Number(values[i + 3] ?? 0) - Number(values[i] ?? 0);
      const dy = Number(values[i + 4] ?? 0) - Number(values[i + 1] ?? 0);
      const dz = Number(values[i + 5] ?? 0) - Number(values[i + 2] ?? 0);
      totalDistance += Math.hypot(dx, dy, dz);
    }
    const depth = Math.max(1, Math.floor(candidate.hierarchyDepth));
    const score = totalDistance / depth;
    if (score > bestScore) {
      bestScore = score;
      bestBoneName = candidate.boneName;
    }
  }

  return Object.freeze({
    bestBoneName: bestScore > 0.01 ? bestBoneName : null,
    bestScore: bestScore > 0.01 ? cleanZero(bestScore) : 0,
  });
}

/**
 * Reverse-engineered from `BoneVisualizer.createUnitOctahedralGeometry` and `createUnitEdgesGeometry`
 * (`BONE_WIDTH_RATIO = 0.12`, `BONE_NECK_RATIO = 0.15`, `UNIT_LENGTH = 1`).
 */
export function buildAsset3dUnitOctahedralBoneGeometry(unitLength = 1): {
  readonly positions: Float32Array;
  readonly triangleIndices: Uint16Array;
  readonly edgeIndices: Uint16Array;
} {
  const w = unitLength * 0.12;
  const neck = unitLength * 0.15;
  const positions = new Float32Array([
    0, 0, 0,
    w, neck, 0,
    -w, neck, 0,
    0, neck, w,
    0, neck, -w,
    0, unitLength, 0,
  ]);
  const triangleIndices = new Uint16Array([
    0, 1, 3, 0, 3, 2, 0, 2, 4, 0, 4, 1,
    5, 3, 1, 5, 2, 3, 5, 4, 2, 5, 1, 4,
  ]);
  const edgeIndices = new Uint16Array([
    0, 1, 0, 2, 0, 3, 0, 4,
    1, 3, 3, 2, 2, 4, 4, 1,
    5, 1, 5, 2, 5, 3, 5, 4,
  ]);
  return Object.freeze({ positions, triangleIndices, edgeIndices });
}

/**
 * Reverse-engineered from `BoneVisualizer.makeMatteJointMaterial` (`index-0_QlvNS9.js`):
 * `float shade = 0.55 + 0.45 * max(dot(faceNormal, normalize(vec3(0.35, 0.5, 1.0))), 0.0);`
 */
export function evaluateAsset3dMatteJointFlatShade(
  faceNormal: StudioMannequinVec3,
  tintRgb: readonly [number, number, number],
): { readonly shade: number; readonly shadedRgb: readonly [number, number, number] } {
  const nLen = Math.hypot(faceNormal.x, faceNormal.y, faceNormal.z);
  const nx = nLen > 1e-8 ? faceNormal.x / nLen : 0;
  const ny = nLen > 1e-8 ? faceNormal.y / nLen : 0;
  const nz = nLen > 1e-8 ? faceNormal.z / nLen : 1;

  const lLen = Math.hypot(0.35, 0.5, 1.0);
  const dot = nx * (0.35 / lLen) + ny * (0.5 / lLen) + nz * (1.0 / lLen);
  const shade = cleanZero(0.55 + 0.45 * Math.max(dot, 0));

  return Object.freeze({
    shade,
    shadedRgb: [
      cleanZero(tintRgb[0] * shade),
      cleanZero(tintRgb[1] * shade),
      cleanZero(tintRgb[2] * shade),
    ] as const,
  });
}

// ============================================================================
// 4. VertexColorPreviewManager Non-Indexed Overlay Extraction
// ============================================================================

/** Reverse-engineered from `VertexColorPreviewManager.extractFaceColors` & `buildOverlays`. */
export function buildAsset3dVertexColorOverlayBuffer(params: {
  readonly targetTriangleCount: number;
  readonly sourceColors3N: ArrayLike<number>;
  readonly sourceIndices?: ArrayLike<number> | null;
}): Float32Array {
  const { targetTriangleCount, sourceColors3N, sourceIndices } = params;
  const sourceTriCount = sourceIndices
    ? Math.floor(sourceIndices.length / 3)
    : Math.floor(sourceColors3N.length / 9);

  if (targetTriangleCount !== sourceTriCount) {
    throw new Error(
      `Vertex color face count mismatch: target=${targetTriangleCount}, color=${sourceTriCount}`,
    );
  }

  const out = new Float32Array(targetTriangleCount * 9);
  for (let tri = 0; tri < targetTriangleCount; tri += 1) {
    for (let corner = 0; corner < 3; corner += 1) {
      const vertexIdx = sourceIndices
        ? Number(sourceIndices[tri * 3 + corner] ?? 0)
        : tri * 3 + corner;
      const dstBase = tri * 9 + corner * 3;
      out[dstBase] = Number(sourceColors3N[vertexIdx * 3] ?? 0);
      out[dstBase + 1] = Number(sourceColors3N[vertexIdx * 3 + 1] ?? 0);
      out[dstBase + 2] = Number(sourceColors3N[vertexIdx * 3 + 2] ?? 0);
    }
  }
  return out;
}

// ============================================================================
// 5. DCC Bridge, 3D Slicer URI, PivotToBottom, Remesh & AI Unwrap Evaluators
// ============================================================================

/** Reverse-engineered from `buildSlicerUrl` (`index-0_QlvNS9.js`). */
export function buildAsset3dSlicerDeepLinkUrl(
  slicerName: StudioAsset3dSlicerName,
  fileDownloadUrl: string,
  isMacOs = true,
): string {
  const encoded = encodeURIComponent(fileDownloadUrl);
  if (slicerName === "Bambu Studio") {
    return isMacOs ? `bambustudioopen://${encoded}` : `bambustudio://open?file=${encoded}`;
  }
  if (slicerName === "OrcaSlicer") {
    return `orcaslicer://open?file=${encoded}`;
  }
  return `cura://open?file=${encoded}`;
}

/** Reverse-engineered from `getStoredPivotToBottom` (`index-0_QlvNS9.js`). */
export function resolveAsset3dPivotToBottom(
  outputType: StudioAsset3dAssetOutputType | null | undefined,
  storedValue?: string | null,
): boolean {
  const normalizedType: StudioAsset3dAssetOutputType = outputType ?? "mesh";
  if (storedValue === "true") {
    return true;
  }
  if (storedValue === "false") {
    return false;
  }
  return STUDIO_ASSET3D_DEFAULT_PIVOT_TO_BOTTOM[normalizedType] ?? false;
}

/** Reverse-engineered from `RemeshPanel` (`index-0_QlvNS9.js`). */
export function evaluateAsset3dRemeshConfig(params: {
  readonly requestedPolygonCount: number;
  readonly topology: "tri" | "quad";
  readonly customMode: boolean;
  readonly freeTierLocked?: boolean;
  readonly sourceTaskType?: string;
}): {
  readonly effectivePolygonCount: number;
  readonly effectiveTopology: "tri" | "quad";
  readonly supported: boolean;
  readonly unsupportedReason: string | null;
} {
  if (params.sourceTaskType === "TEXTURE_PAINTING") {
    return Object.freeze({
      effectivePolygonCount: STUDIO_ASSET3D_REMESH_UNWRAP_METRICS.freeTierPolygonCount,
      effectiveTopology: "tri",
      supported: false,
      unsupportedReason: "studio.texturePaintingNotSupported",
    });
  }
  if (params.freeTierLocked) {
    return Object.freeze({
      effectivePolygonCount: STUDIO_ASSET3D_REMESH_UNWRAP_METRICS.freeTierPolygonCount,
      effectiveTopology: STUDIO_ASSET3D_REMESH_UNWRAP_METRICS.freeTierTopology,
      supported: true,
      unsupportedReason: null,
    });
  }
  const { minCustomPolygonCount, maxCustomPolygonCount, presetPolygonCounts } =
    STUDIO_ASSET3D_REMESH_UNWRAP_METRICS;
  const clamped = clamp(
    Math.round(params.requestedPolygonCount),
    minCustomPolygonCount,
    maxCustomPolygonCount,
  );
  const effectivePolygonCount = params.customMode
    ? clamped
    : presetPolygonCounts.includes(clamped as 5000 | 10000 | 50000 | 100000)
      ? clamped
      : STUDIO_ASSET3D_REMESH_UNWRAP_METRICS.freeTierPolygonCount;

  return Object.freeze({
    effectivePolygonCount,
    effectiveTopology: params.topology,
    supported: true,
    unsupportedReason: null,
  });
}

/**
 * Reverse-engineered from `UnwrapPanel` (`index-0_QlvNS9.js`):
 * Meshes over 50K faces are automatically reduced to 20K before AI unwrapping.
 */
export function evaluateAsset3dAiUnwrapPlan(faceCount: number): {
  readonly inputFaceCount: number;
  readonly effectiveUnwrapFaceCount: number;
  readonly autoReducedTo20k: boolean;
} {
  const { unwrapFaceLimitThreshold, unwrapReducedFaceCount } =
    STUDIO_ASSET3D_REMESH_UNWRAP_METRICS;
  const safeFaces = Math.max(0, Math.floor(faceCount));
  const autoReducedTo20k = safeFaces > unwrapFaceLimitThreshold;
  return Object.freeze({
    inputFaceCount: safeFaces,
    effectiveUnwrapFaceCount: autoReducedTo20k ? unwrapReducedFaceCount : safeFaces,
    autoReducedTo20k,
  });
}

// ============================================================================
// 6. Canvas/Node DAG Pipeline Engine (edgeGeometry & addDag Topological Wave)
// ============================================================================

export interface StudioAsset3dDagNodeRect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioAsset3dDagEdgeInput {
  readonly from: string;
  readonly to: string;
}

/** Reverse-engineered from `edgeGeometry` (`index-0_QlvNS9.js`). */
export function computeAsset3dDagEdgeBezierGeometry(
  fromNode: StudioAsset3dDagNodeRect,
  toNode: StudioAsset3dDagNodeRect,
): {
  readonly portDirection: readonly [number, number];
  readonly startPoint: readonly [number, number];
  readonly endPoint: readonly [number, number];
  readonly pathSvg: string;
  readonly arrowSvg: string;
} {
  const {
    portOverlapMarginPx,
    portAnchorOffsetPx,
    minControlPointDistancePx,
    arrowLengthPx,
    arrowHalfWidthRatio,
  } = STUDIO_ASSET3D_DAG_TIMING_METRICS;

  let start: readonly [number, number];
  let end: readonly [number, number];
  let dir: readonly [number, number];

  if (toNode.x >= fromNode.x + fromNode.width - portOverlapMarginPx) {
    start = [fromNode.x + fromNode.width + portAnchorOffsetPx, fromNode.y + fromNode.height / 2];
    end = [toNode.x - portAnchorOffsetPx, toNode.y + toNode.height / 2];
    dir = [1, 0];
  } else if (toNode.y >= fromNode.y + fromNode.height - portOverlapMarginPx) {
    start = [fromNode.x + fromNode.width / 2, fromNode.y + fromNode.height + portAnchorOffsetPx];
    end = [toNode.x + toNode.width / 2, toNode.y - portAnchorOffsetPx];
    dir = [0, 1];
  } else if (toNode.x + toNode.width <= fromNode.x + portOverlapMarginPx) {
    start = [fromNode.x - portAnchorOffsetPx, fromNode.y + fromNode.height / 2];
    end = [toNode.x + toNode.width + portAnchorOffsetPx, toNode.y + toNode.height / 2];
    dir = [-1, 0];
  } else {
    start = [fromNode.x + fromNode.width / 2, fromNode.y - portAnchorOffsetPx];
    end = [toNode.x + toNode.width / 2, toNode.y + toNode.height + portAnchorOffsetPx];
    dir = [0, -1];
  }

  const span = Math.abs(dir[0] !== 0 ? end[0] - start[0] : end[1] - start[1]);
  const cpOffset = Math.max(minControlPointDistancePx, span * 0.5);
  const cp1: readonly [number, number] = [
    start[0] + dir[0] * cpOffset,
    start[1] + dir[1] * cpOffset,
  ];
  const cp2: readonly [number, number] = [
    end[0] - dir[0] * cpOffset,
    end[1] - dir[1] * cpOffset,
  ];

  const pathSvg = `M${start.join(",")} C${cp1.join(",")} ${cp2.join(",")} ${end.join(",")}`;
  const [ex, ey] = end;
  const [px, py] = [-dir[1], dir[0]];
  const hw = arrowLengthPx * arrowHalfWidthRatio;
  const arrowSvg = `M${ex},${ey} L${ex - dir[0] * arrowLengthPx + px * hw},${ey - dir[1] * arrowLengthPx + py * hw} L${ex - dir[0] * arrowLengthPx - px * hw},${ey - dir[1] * arrowLengthPx - py * hw} Z`;

  return Object.freeze({
    portDirection: dir,
    startPoint: start,
    endPoint: end,
    pathSvg,
    arrowSvg,
  });
}

/** Reverse-engineered from `createCanvasStore.addDag` (`index-0_QlvNS9.js`). */
export function scheduleAsset3dDagTopologicalWave(params: {
  readonly nodes: readonly { readonly id: string; readonly title?: string }[];
  readonly edges: readonly StudioAsset3dDagEdgeInput[];
  readonly startTimestampMs?: number;
}): {
  readonly scheduledNodes: ReadonlyArray<{ readonly id: string; readonly appearAtMs: number }>;
  readonly scheduledEdges: ReadonlyArray<{
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly appearAtMs: number;
  }>;
  readonly errors: readonly string[];
} {
  const { nodeSideMs, nodeStepMs, edgeMs, edgeDownstreamOverlapRatio } =
    STUDIO_ASSET3D_DAG_TIMING_METRICS;
  let timelineCursorMs = params.startTimestampMs ?? 0;

  const advanceClock = (durationMs: number, minStartMs: number): number => {
    const appearAt = Math.max(timelineCursorMs, minStartMs);
    timelineCursorMs = appearAt + durationMs;
    return appearAt;
  };

  const errors: string[] = [];
  const knownNodeIds = new Set<string>();
  const validNodes: { readonly id: string }[] = [];

  for (const node of params.nodes) {
    if (knownNodeIds.has(node.id)) {
      errors.push(`duplicate node id: ${node.id}`);
    } else {
      knownNodeIds.add(node.id);
      validNodes.push(node);
    }
  }

  const knownEdgeIds = new Set<string>();
  const validEdges: { readonly id: string; readonly from: string; readonly to: string }[] = [];
  for (const edge of params.edges) {
    const edgeId = `${edge.from}->${edge.to}`;
    if (!knownNodeIds.has(edge.from) || !knownNodeIds.has(edge.to)) {
      errors.push(`edge ${edgeId}: unknown node`);
    } else if (knownEdgeIds.has(edgeId)) {
      errors.push(`duplicate edge: ${edgeId}`);
    } else {
      knownEdgeIds.add(edgeId);
      validEdges.push({ id: edgeId, from: edge.from, to: edge.to });
    }
  }

  const readyTimeByNode = new Map<string, number>();
  const remainingNodes = new Map(validNodes.map((n) => [n.id, n]));
  const scheduledNodes: { readonly id: string; readonly appearAtMs: number }[] = [];
  const scheduledEdges: {
    readonly id: string;
    readonly from: string;
    readonly to: string;
    readonly appearAtMs: number;
  }[] = [];
  const emittedEdgeIds = new Set<string>();

  while (remainingNodes.size > 0) {
    const candidates = [...remainingNodes.values()];
    const nextNode =
      candidates.find((cand) =>
        validEdges.every((e) => e.to !== cand.id || !remainingNodes.has(e.from)),
      ) ?? candidates[0]!;
    remainingNodes.delete(nextNode.id);

    const incomingReadyEdges = validEdges.filter(
      (e) => e.to === nextNode.id && readyTimeByNode.has(e.from),
    );
    let minNodeStartMs = 0;
    if (incomingReadyEdges.length > 0) {
      const maxParentReady = Math.max(
        ...incomingReadyEdges.map((e) => readyTimeByNode.get(e.from) ?? 0),
      );
      const edgeAppearAt = advanceClock(edgeMs, maxParentReady);
      for (const edge of incomingReadyEdges) {
        scheduledEdges.push({ ...edge, appearAtMs: edgeAppearAt });
        emittedEdgeIds.add(edge.id);
      }
      minNodeStartMs = edgeAppearAt + edgeMs * edgeDownstreamOverlapRatio;
    }

    const nodeAppearAt = advanceClock(nodeStepMs, minNodeStartMs);
    readyTimeByNode.set(nextNode.id, nodeAppearAt + 4 * nodeSideMs);
    scheduledNodes.push({ id: nextNode.id, appearAtMs: nodeAppearAt });
  }

  for (const edge of validEdges) {
    if (!emittedEdgeIds.has(edge.id)) {
      const fallbackStart = Math.max(
        readyTimeByNode.get(edge.from) ?? 0,
        readyTimeByNode.get(edge.to) ?? 0,
      );
      scheduledEdges.push({ ...edge, appearAtMs: advanceClock(edgeMs, fallbackStart) });
    }
  }

  return Object.freeze({
    scheduledNodes: Object.freeze(scheduledNodes),
    scheduledEdges: Object.freeze(scheduledEdges),
    errors: Object.freeze(errors),
  });
}
