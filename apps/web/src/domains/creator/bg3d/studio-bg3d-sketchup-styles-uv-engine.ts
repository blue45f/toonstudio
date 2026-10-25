/**
 * studio-bg3d-sketchup-styles-uv-engine.ts
 *
 * SketchUp 스타일(Face/Edge Styles)·모서리 비트마스크(`D307`)·4핀 투영 텍스처(Projective UV Homography) 엔진:
 * 1. `.skp` `D307` 모서리 표시 바이트(`0x01` hidden, `0x08` soft, `0x10` smooth) 인코딩/디코딩 및 `isSketchUpDrawableEdge` 필터
 * 2. SketchUp 6대 Face Style(`wireframe`, `hidden-line`, `shaded`, `shaded-with-textures`, `monochrome`, `xray`) 및
 *    Edge Style(Profiles, Depth Cue, Extension/Overshoot, Endpoints, Jitter, Back Edges) → ToonStudio LT/Material 설정 변환기
 * 3. SketchUp 4-Pin 텍스처 위치 지정(Fixed Pins / Free Projective Pins) — 평면 기저(`faceUvBasis`) 및
 *    4점 대응 3x3 호모그래피(`uvTransform`, `uvProjected`) 해법과 정점 UV 투영 계산기
 */

import type {
  StudioBg3dLineOutputSettings,
  StudioBg3dMaterialOverride,
  StudioBg3dToneOutputSettings,
  StudioBg3dVec3,
} from "./studio-bg3d-scene-document-types";

export const SKP_EDGE_FLAG_HIDDEN = 0x01;
export const SKP_EDGE_FLAG_SOFT = 0x08;
export const SKP_EDGE_FLAG_SMOOTH = 0x10;

export interface SketchUpEdgeFlags {
  readonly hidden: boolean;
  readonly soft: boolean;
  readonly smooth: boolean;
}

export interface SketchUpEdgeEntityLike {
  readonly a: StudioBg3dVec3;
  readonly b: StudioBg3dVec3;
  readonly hidden?: boolean;
  readonly soft?: boolean;
  readonly smooth?: boolean;
  readonly flagsByte?: number;
}

function round6(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * `.skp` VFF `D307` 레코드의 모서리 속성 바이트(`0x01` hidden, `0x08` soft, `0x10` smooth)를 디코딩한다.
 */
export function decodeSketchUpEdgeFlagsByte(byte: number): SketchUpEdgeFlags {
  const safe = Number.isInteger(byte) ? byte & 0xff : 0;
  return Object.freeze({
    hidden: (safe & SKP_EDGE_FLAG_HIDDEN) !== 0,
    soft: (safe & SKP_EDGE_FLAG_SOFT) !== 0,
    smooth: (safe & SKP_EDGE_FLAG_SMOOTH) !== 0,
  });
}

/**
 * 모서리 플래그(`hidden`, `soft`, `smooth`)를 `.skp` `D307` 호환 바이트로 인코딩한다.
 */
export function encodeSketchUpEdgeFlagsByte(flags: Partial<SketchUpEdgeFlags>): number {
  let byte = 0;
  if (flags.hidden) byte |= SKP_EDGE_FLAG_HIDDEN;
  if (flags.soft) byte |= SKP_EDGE_FLAG_SOFT;
  if (flags.smooth) byte |= SKP_EDGE_FLAG_SMOOTH;
  return byte;
}

/**
 * OpenSKP `isDrawableEdge`와 동일한 규칙:
 * `hidden`도 아니고 `soft`도 아닌 모서리만 뷰포트 외곽선/와이어프레임 선분으로 그린다.
 * (`smooth` 단독은 법선 보간에만 영향을 주고 `soft`가 동반될 때 선분이 숨겨진다.)
 */
export function isSketchUpDrawableEdge(edge: SketchUpEdgeEntityLike): boolean {
  if (typeof edge.flagsByte === "number") {
    const decoded = decodeSketchUpEdgeFlagsByte(edge.flagsByte);
    return !decoded.hidden && !decoded.soft;
  }
  return edge.hidden !== true && edge.soft !== true;
}

/**
 * 모서리 목록에서 실제 그려야 할 가시 모서리(`drawable`), 부드러운 곡면 모서리(`softened`),
 * 명시적 숨김 모서리(`hidden`)를 분류한다.
 */
export function filterSketchUpDrawableEdges(edges: readonly SketchUpEdgeEntityLike[]): {
  readonly drawable: readonly SketchUpEdgeEntityLike[];
  readonly softenedCount: number;
  readonly hiddenCount: number;
  readonly smoothCount: number;
} {
  const drawable: SketchUpEdgeEntityLike[] = [];
  let softenedCount = 0;
  let hiddenCount = 0;
  let smoothCount = 0;

  for (const edge of edges) {
    const flags = typeof edge.flagsByte === "number"
      ? decodeSketchUpEdgeFlagsByte(edge.flagsByte)
      : {
          hidden: edge.hidden === true,
          soft: edge.soft === true,
          smooth: edge.smooth === true,
        };
    if (flags.smooth) smoothCount += 1;
    if (flags.hidden) {
      hiddenCount += 1;
      continue;
    }
    if (flags.soft) {
      softenedCount += 1;
      continue;
    }
    drawable.push(edge);
  }

  return Object.freeze({
    drawable: Object.freeze(drawable),
    softenedCount,
    hiddenCount,
    smoothCount,
  });
}

export type SketchUpFaceStyleKind =
  | "wireframe"
  | "hidden-line"
  | "shaded"
  | "shaded-with-textures"
  | "monochrome"
  | "xray";

export interface SketchUpStyleConfig {
  readonly id: string;
  readonly labelKo: string;
  readonly faceStyle: SketchUpFaceStyleKind;
  readonly frontFaceColorHex: string;
  readonly backFaceColorHex: string;
  readonly edgeColorHex: string;
  readonly profilesEnabled: boolean;
  readonly profileWidthPx: number;
  readonly depthCueEnabled: boolean;
  readonly extensionPx: number;
  readonly endpointsPx: number;
  readonly jitterEnabled: boolean;
  readonly backEdgesDashed: boolean;
  readonly xrayOpacity: number;
}

export const STUDIO_SKETCHUP_STYLE_PRESETS: readonly SketchUpStyleConfig[] = Object.freeze([
  {
    id: "skp-hidden-line-webtoon",
    labelKo: "은선 웹툰 펜선 (Hidden Line)",
    faceStyle: "hidden-line",
    frontFaceColorHex: "#ffffff",
    backFaceColorHex: "#647696",
    edgeColorHex: "#141414",
    profilesEnabled: true,
    profileWidthPx: 2.2,
    depthCueEnabled: true,
    extensionPx: 0,
    endpointsPx: 0,
    jitterEnabled: false,
    backEdgesDashed: false,
    xrayOpacity: 1,
  },
  {
    id: "skp-shaded-with-textures",
    labelKo: "텍스처 음영 기본 (Shaded with Textures)",
    faceStyle: "shaded-with-textures",
    frontFaceColorHex: "#ffffff",
    backFaceColorHex: "#647696",
    edgeColorHex: "#1c1c1c",
    profilesEnabled: true,
    profileWidthPx: 1.8,
    depthCueEnabled: false,
    extensionPx: 0,
    endpointsPx: 0,
    jitterEnabled: false,
    backEdgesDashed: false,
    xrayOpacity: 1,
  },
  {
    id: "skp-shaded-flat",
    labelKo: "단색 음영 셀화 (Shaded)",
    faceStyle: "shaded",
    frontFaceColorHex: "#f7f5f0",
    backFaceColorHex: "#647696",
    edgeColorHex: "#1f1f1f",
    profilesEnabled: true,
    profileWidthPx: 2.0,
    depthCueEnabled: true,
    extensionPx: 0,
    endpointsPx: 0,
    jitterEnabled: false,
    backEdgesDashed: false,
    xrayOpacity: 1,
  },
  {
    id: "skp-monochrome-inspect",
    labelKo: "단색 앞·뒷면 법선 점검 (Monochrome)",
    faceStyle: "monochrome",
    frontFaceColorHex: "#ffffff",
    backFaceColorHex: "#5b7297",
    edgeColorHex: "#111827",
    profilesEnabled: true,
    profileWidthPx: 2.0,
    depthCueEnabled: false,
    extensionPx: 0,
    endpointsPx: 0,
    jitterEnabled: false,
    backEdgesDashed: false,
    xrayOpacity: 1,
  },
  {
    id: "skp-architectural-sketch",
    labelKo: "건축 스케치 연장선 (Architectural Design)",
    faceStyle: "hidden-line",
    frontFaceColorHex: "#fcfaf5",
    backFaceColorHex: "#647696",
    edgeColorHex: "#231f20",
    profilesEnabled: true,
    profileWidthPx: 2.6,
    depthCueEnabled: true,
    extensionPx: 4,
    endpointsPx: 3,
    jitterEnabled: true,
    backEdgesDashed: false,
    xrayOpacity: 1,
  },
  {
    id: "skp-xray-wire",
    labelKo: "X-Ray 반투명 + 뒷선 점선 (X-Ray)",
    faceStyle: "xray",
    frontFaceColorHex: "#e8f0fe",
    backFaceColorHex: "#647696",
    edgeColorHex: "#1e293b",
    profilesEnabled: true,
    profileWidthPx: 1.5,
    depthCueEnabled: false,
    extensionPx: 0,
    endpointsPx: 0,
    jitterEnabled: false,
    backEdgesDashed: true,
    xrayOpacity: 0.35,
  },
]);

/**
 * SketchUp 스타일 설정을 ToonStudio의 `StudioBg3dLineOutputSettings`, `StudioBg3dToneOutputSettings`,
 * `StudioBg3dMaterialOverride`로 변환한다.
 */
export function resolveSketchUpStyleToBg3dSettings(style: SketchUpStyleConfig): {
  readonly line: StudioBg3dLineOutputSettings;
  readonly tone: StudioBg3dToneOutputSettings;
  readonly materialOverride: StudioBg3dMaterialOverride;
} {
  const widthPx = style.profilesEnabled
    ? Math.min(8, Math.max(0.5, style.profileWidthPx))
    : 1;
  const line: StudioBg3dLineOutputSettings = Object.freeze({
    enabled: true,
    layerType: "raster",
    color: style.edgeColorHex,
    widthPx: round6(widthPx),
    strength: round6(Math.min(1, 0.75 + (style.endpointsPx > 0 ? 0.15 : 0))),
    accuracy: round6(style.jitterEnabled ? 0.65 : 0.92),
    scaleAwareAccuracy: true,
    exteriorOutlineStrength: style.profilesEnabled ? 1 : 0.5,
    depthEnabled: style.depthCueEnabled,
    depthStrength: style.depthCueEnabled ? 0.85 : 0.35,
    depthOutlineOnly: false,
    smoothing: style.jitterEnabled ? 0.15 : 0.5,
    textureLineEnabled: style.faceStyle === "shaded-with-textures",
    textureLineStrength: style.faceStyle === "shaded-with-textures" ? 0.45 : 0,
    creaseAngleDegrees: 28,
    hiddenLineRemoval: !style.backEdgesDashed && style.faceStyle !== "wireframe",
  });

  const tone: StudioBg3dToneOutputSettings = Object.freeze({
    mode: style.faceStyle === "hidden-line" || style.faceStyle === "wireframe"
      ? "none"
      : style.faceStyle === "shaded"
        ? "cel"
        : "flat",
    type: style.faceStyle === "monochrome" ? "grayscale" : "color",
    pattern: "dot",
    levels: 3,
    opacity: style.faceStyle === "xray" ? round6(style.xrayOpacity) : 0.85,
    frequency: 45,
    angleDegrees: 45,
  });

  const materialOverride: StudioBg3dMaterialOverride = Object.freeze({
    colorMode:
      style.faceStyle === "hidden-line" || style.faceStyle === "monochrome"
        ? "replace"
        : style.faceStyle === "shaded"
          ? "multiply"
          : "original",
    color: style.frontFaceColorHex,
    colorStrength: 1,
    opacityMultiplier: style.faceStyle === "xray" ? round6(style.xrayOpacity) : 1,
    roughness: 0.85,
    metalness: 0.05,
    emissiveColor: "#000000",
    emissiveIntensity: null,
    wireframe: style.faceStyle === "wireframe",
    doubleSided: true,
  });

  return Object.freeze({ line, tone, materialOverride });
}

export interface SketchUpFaceUvBasis {
  readonly uAxis: StudioBg3dVec3;
  readonly vAxis: StudioBg3dVec3;
  readonly normal: StudioBg3dVec3;
}

/**
 * OpenSKP `faceUvBasis(normal)`과 동일한 평면 접선 기저 `(uAxis, vAxis)` 생성기:
 * 면 법선 `normal`에 수직인 직교 정규 기저를 결정적으로 구성한다.
 */
export function computeSketchUpFaceUvBasis(normal: StudioBg3dVec3): SketchUpFaceUvBasis {
  const nLen = Math.hypot(normal[0], normal[1], normal[2]) || 1;
  const nx = normal[0] / nLen;
  const ny = normal[1] / nLen;
  const nz = normal[2] / nLen;

  // 수직에 가까운 면은 수평 X-Z 평면 방향을 U축으로 두고, 수평 면(바닥/천장)은 X축을 기준으로 삼는다.
  const ref: StudioBg3dVec3 = Math.abs(ny) < 0.99 ? [0, 1, 0] : [0, 0, -1];
  const uxRaw = ref[1] * nz - ref[2] * ny;
  const uyRaw = ref[2] * nx - ref[0] * nz;
  const uzRaw = ref[0] * ny - ref[1] * nx;
  const uLen = Math.hypot(uxRaw, uyRaw, uzRaw) || 1;
  const uAxis: StudioBg3dVec3 = Object.freeze([
    round6(uxRaw / uLen),
    round6(uyRaw / uLen),
    round6(uzRaw / uLen),
  ]);

  const vxRaw = ny * uAxis[2] - nz * uAxis[1];
  const vyRaw = nz * uAxis[0] - nx * uAxis[2];
  const vzRaw = nx * uAxis[1] - ny * uAxis[0];
  const vLen = Math.hypot(vxRaw, vyRaw, vzRaw) || 1;
  const vAxis: StudioBg3dVec3 = Object.freeze([
    round6(vxRaw / vLen),
    round6(vyRaw / vLen),
    round6(vzRaw / vLen),
  ]);

  return Object.freeze({
    uAxis,
    vAxis,
    normal: Object.freeze([round6(nx), round6(ny), round6(nz)] as const),
  });
}

export interface SketchUpTexturePinPair {
  /** 면 평면 위에서의 2D 핀 좌표 `[s, t]` (미터). */
  readonly planePoint: readonly [number, number];
  /** 대응하는 텍스처 UV 좌표 `[u, v]` (0..1). */
  readonly uv: readonly [number, number];
}

export interface SketchUpHomographyResult {
  readonly ok: boolean;
  /** 행 우선(row-major) 3x3 투영 행렬 `[m00, m01, m02, m10, m11, m12, m20, m21, m22]`. */
  readonly uvTransform: readonly [
    number, number, number,
    number, number, number,
    number, number, number,
  ];
  readonly uvProjected: boolean;
}

/**
 * 가우스-조르단 소거법으로 $8 \times 8$ 선형 방정식 $Ax = b$를 푼다.
 */
function solveLinearSystem8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const aug = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col += 1) {
    let maxRow = col;
    let maxVal = Math.abs(aug[col]![col]!);
    for (let row = col + 1; row < n; row += 1) {
      const val = Math.abs(aug[row]![col]!);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }
    if (maxVal < 1e-10) return null;
    if (maxRow !== col) {
      const tmp = aug[col]!;
      aug[col] = aug[maxRow]!;
      aug[maxRow] = tmp;
    }

    const pivot = aug[col]![col]!;
    for (let j = col; j <= n; j += 1) {
      aug[col]![j]! /= pivot;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = aug[row]![col]!;
      if (Math.abs(factor) < 1e-12) continue;
      for (let j = col; j <= n; j += 1) {
        aug[row]![j]! -= factor * aug[col]![j]!;
      }
    }
  }

  return aug.map((row) => row[n]!);
}

/**
 * SketchUp 4-Pin Texture Positioning (빨강·초록·파랑·노랑 4개 핀 대응):
 * 면 평면 좌표 `(s_i, t_i)` 4개와 목표 UV `(u_i, v_i)` 4개로부터
 * `uvTransform` $3 \times 3$ 투영 호모그래피 행렬을 정확히 계산한다.
 */
export function solveSketchUpFourPinHomography(
  pins: readonly [
    SketchUpTexturePinPair,
    SketchUpTexturePinPair,
    SketchUpTexturePinPair,
    SketchUpTexturePinPair,
  ],
): SketchUpHomographyResult {
  const A: number[][] = [];
  const b: number[] = [];

  for (const pin of pins) {
    const [s, t] = pin.planePoint;
    const [u, v] = pin.uv;
    A.push([s, t, 1, 0, 0, 0, -u * s, -u * t]);
    b.push(u);
    A.push([0, 0, 0, s, t, 1, -v * s, -v * t]);
    b.push(v);
  }

  const sol = solveLinearSystem8x8(A, b);
  if (!sol) {
    return Object.freeze({
      ok: false,
      uvTransform: Object.freeze([1, 0, 0, 0, 1, 0, 0, 0, 1] as const),
      uvProjected: false,
    });
  }

  const m00 = round6(sol[0]!);
  const m01 = round6(sol[1]!);
  const m02 = round6(sol[2]!);
  const m10 = round6(sol[3]!);
  const m11 = round6(sol[4]!);
  const m12 = round6(sol[5]!);
  const m20 = round6(sol[6]!);
  const m21 = round6(sol[7]!);
  const uvProjected = Math.abs(m20) > 1e-5 || Math.abs(m21) > 1e-5;

  return Object.freeze({
    ok: true,
    uvTransform: Object.freeze([
      m00, m01, m02,
      m10, m11, m12,
      m20, m21, 1,
    ] as const),
    uvProjected,
  });
}

/**
 * OpenSKP `computeFaceUv` 호환 3D 정점 → 2D UV 투영 평가기.
 */
export function evaluateSketchUpFaceUv(input: {
  readonly vertexWorld: StudioBg3dVec3;
  readonly faceOriginWorld?: StudioBg3dVec3;
  readonly faceNormal: StudioBg3dVec3;
  readonly uvTransform?: readonly [
    number, number, number,
    number, number, number,
    number, number, number,
  ];
  readonly uvProjected?: boolean;
  readonly texScaleMeters?: readonly [number, number];
}): readonly [number, number] {
  const origin = input.faceOriginWorld ?? [0, 0, 0];
  const basis = computeSketchUpFaceUvBasis(input.faceNormal);
  const dx = input.vertexWorld[0] - origin[0];
  const dy = input.vertexWorld[1] - origin[1];
  const dz = input.vertexWorld[2] - origin[2];

  const s = dx * basis.uAxis[0] + dy * basis.uAxis[1] + dz * basis.uAxis[2];
  const t = dx * basis.vAxis[0] + dy * basis.vAxis[1] + dz * basis.vAxis[2];

  if (input.uvTransform) {
    const m = input.uvTransform;
    const rawU = m[0] * s + m[1] * t + m[2];
    const rawV = m[3] * s + m[4] * t + m[5];
    const q = input.uvProjected ? m[6] * s + m[7] * t + m[8] : 1;
    const safeQ = Math.abs(q) > 1e-6 ? q : 1;
    return Object.freeze([round6(rawU / safeQ), round6(rawV / safeQ)]);
  }

  const scaleU = input.texScaleMeters?.[0] && input.texScaleMeters[0] > 0 ? input.texScaleMeters[0] : 1;
  const scaleV = input.texScaleMeters?.[1] && input.texScaleMeters[1] > 0 ? input.texScaleMeters[1] : 1;
  return Object.freeze([round6(s / scaleU), round6(t / scaleV)]);
}
