/**
 * 웹툰 3D 기능 확장 엔진 (1~4번 통합 진입점):
 * 1. 원클릭 '3D → 한국 웹툰 3계층 선화·톤' 자동 추출 (`extractThreeLayerWebtoonInkAndTone`)
 * 2. 웹툰 전용 '박력 과장 원근 렌즈(히어로 퍼스펙티브)' (`evaluateHeroPerspectiveLens`)
 * 3. 2~4인 커플·액션 자석 포즈 스냅 (`solveMultiCharacterInteractionSnap`, re-export)
 * 4. 얼굴 전용 미형 툰 그림자(Face SDF) & 카메라 시선 추적 (`evaluateFaceSdfAndEyeLookAt`, re-export)
 *
 * 100% 무과금(₩0)·결정론적 브라우저 로컬 연산.
 */

import {
  clamp,
  roundTo,
  vec3Add,
  vec3Cross,
  vec3Distance,
  vec3Dot,
  vec3Normalize,
  vec3Scale,
  vec3Sub,
  type Vec2,
  type Vec3,
} from "./scene3d-expansion-math";

export {
  evaluateFaceSdfAndEyeLookAt,
  MULTI_CHARACTER_SNAP_PRESETS,
  solveMultiCharacterInteractionSnap,
  type EyeLookAtTargetMode,
  type FaceSdfAndEyeLookAtInput,
  type FaceSdfAndEyeLookAtResult,
  type FaceZoneShadowSample,
  type MagneticContactPair,
  type MultiCharacterSnapInput,
  type MultiCharacterSnapPreset,
  type MultiCharacterSnapResult,
  type SnappedCharacterRig,
} from "./scene3d-snap-face-sdf-engine";

// ============================================================================
// 1. 원클릭 '3D → 한국 웹툰 3계층 선화·톤' 자동 추출
// ============================================================================

export type WebtoonExtractScenePreset =
  | "character-closeup"
  | "action-slash"
  | "interior-hallway";

export type ExtractedLayerId = "outline-gpen" | "detail-marupen" | "cel-tone-2step";

export interface ThreeLayerExtractInput {
  readonly width: number;
  readonly height: number;
  readonly depthBuffer: Float32Array | readonly number[];
  readonly normalBuffer: Float32Array | readonly number[];
  readonly lightDirection?: Vec3;
  readonly outlineWidthPx?: number;
  readonly detailWidthPx?: number;
  readonly depthThreshold?: number;
  readonly normalCreaseThreshold?: number;
  readonly celMidThreshold?: number;
  readonly celDeepThreshold?: number;
}

export interface ExtractedWebtoonLayer {
  readonly id: ExtractedLayerId;
  readonly nameKo: string;
  readonly penLabelKo: string;
  readonly strokeWidthPx: number;
  readonly blendMode: "normal" | "multiply";
  readonly opacity: number;
  readonly pixelMask: Uint8Array;
  readonly activePixelCount: number;
  readonly coverageRatio: number;
  readonly svgPaths: readonly string[];
  readonly svgMarkup: string;
  readonly colorToken: string;
}

export interface ThreeLayerExtractResult {
  readonly width: number;
  readonly height: number;
  readonly layers: readonly [
    ExtractedWebtoonLayer,
    ExtractedWebtoonLayer,
    ExtractedWebtoonLayer,
  ];
  readonly celBreakdown: {
    readonly litCount: number;
    readonly midShadowCount: number;
    readonly deepShadowCount: number;
    readonly backgroundCount: number;
  };
  readonly compositeSvgMarkup: string;
  readonly manifestFingerprint: string;
  readonly costKrw: 0;
}

export interface SampleDepthNormalBuffer {
  readonly preset: WebtoonExtractScenePreset;
  readonly labelKo: string;
  readonly width: number;
  readonly height: number;
  readonly depthBuffer: Float32Array;
  readonly normalBuffer: Float32Array;
}

export const WEBTOON_EXTRACT_SCENE_PRESETS: readonly {
  readonly id: WebtoonExtractScenePreset;
  readonly labelKo: string;
}[] = [
  { id: "character-closeup", labelKo: "주인공 상반신 클로즈업" },
  { id: "action-slash", labelKo: "검기 대각선 베기 컷" },
  { id: "interior-hallway", labelKo: "학교 복도 원근 배경" },
];

export function buildSampleWebtoonDepthNormalBuffer(
  preset: WebtoonExtractScenePreset,
  width = 48,
  height = 36,
): SampleDepthNormalBuffer {
  const safeW = Math.max(8, Math.min(96, Math.round(width)));
  const safeH = Math.max(8, Math.min(96, Math.round(height)));
  const depthBuffer = new Float32Array(safeW * safeH);
  const normalBuffer = new Float32Array(safeW * safeH * 3);

  const labelKo =
    WEBTOON_EXTRACT_SCENE_PRESETS.find((item) => item.id === preset)?.labelKo ??
    "주인공 상반신 클로즈업";

  for (let y = 0; y < safeH; y += 1) {
    const ny = (y + 0.5) / safeH;
    for (let x = 0; x < safeW; x += 1) {
      const nx = (x + 0.5) / safeW;
      const idx = y * safeW + x;
      let depth = 0.96;
      let n: Vec3 = { x: 0, y: 0, z: 1 };

      if (preset === "character-closeup") {
        const dxHead = (nx - 0.5) / 0.17;
        const dyHead = (ny - 0.34) / 0.21;
        const headR2 = dxHead * dxHead + dyHead * dyHead;
        const dxTorso = (nx - 0.5) / 0.31;
        const dyTorso = (ny - 0.82) / 0.34;
        const torsoR2 = dxTorso * dxTorso + dyTorso * dyTorso;

        if (headR2 <= 1) {
          const zSphere = Math.sqrt(Math.max(0.02, 1 - headR2));
          depth = 0.34 - zSphere * 0.08;
          const isHairBand = ny < 0.29;
          const isRightBang = isHairBand && nx >= 0.48;
          n = vec3Normalize({
            x: isHairBand ? (isRightBang ? 0.88 : -0.88) : dxHead * 0.78,
            y: isHairBand ? -0.35 : dyHead * 0.52,
            z: zSphere * 0.45,
          });
        } else if (torsoR2 <= 1) {
          const zTorso = Math.sqrt(Math.max(0.05, 1 - torsoR2));
          depth = 0.44 - zTorso * 0.06;
          const innerShirt = Math.abs(nx - 0.5) < 0.08 + Math.max(0, 0.78 - ny) * 0.22;
          const lapelEdge = Math.abs(nx - 0.5) >= 0.08 && Math.abs(nx - 0.5) < 0.16;
          n = vec3Normalize({
            x: innerShirt ? 0.04 : lapelEdge ? (nx < 0.5 ? -0.92 : 0.92) : dxTorso * 0.72,
            y: innerShirt ? 0.58 : -0.25 + (ny - 0.7) * 0.4,
            z: innerShirt ? 0.81 : zTorso * 0.42,
          });
        }
      } else if (preset === "action-slash") {
        const bladeDist = Math.abs(ny - (0.85 - nx * 0.72));
        const inBlade = bladeDist < 0.065 && nx > 0.14 && nx < 0.88;
        const dxBody = (nx - 0.34) / 0.22;
        const dyBody = (ny - 0.56) / 0.34;
        if (inBlade) {
          depth = 0.18 + nx * 0.08;
          const ridgeSide = ny - (0.85 - nx * 0.72) >= 0 ? 1 : -1;
          n = vec3Normalize({ x: 0.65 * ridgeSide, y: 0.58 * ridgeSide, z: 0.48 });
        } else if (dxBody * dxBody + dyBody * dyBody <= 1) {
          depth = 0.46;
          const fold = Math.abs(nx - 0.34) < 0.03;
          n = vec3Normalize({ x: fold ? -0.85 : dxBody * 0.8, y: dyBody * 0.4, z: 0.55 });
        }
      } else {
        const dx = nx - 0.5;
        const dy = ny - 0.48;
        const radial = Math.max(Math.abs(dx) * 1.45, Math.abs(dy) * 1.55);
        depth = clamp(0.88 - radial * 0.72, 0.15, 0.92);
        if (Math.abs(dx) > Math.abs(dy) * 1.05) {
          const isLeftWall = dx < 0;
          const windowMullion = Math.floor(nx * 10) % 2 === 0 && ny > 0.25 && ny < 0.62;
          n = vec3Normalize({
            x: isLeftWall ? 0.92 : -0.92,
            y: windowMullion ? 0.52 : 0.04,
            z: windowMullion ? 0.22 : 0.38,
          });
        } else if (dy > 0) {
          const floorTile = Math.floor(ny * 12) % 2 === 0;
          n = vec3Normalize({ x: floorTile ? 0.32 : -0.32, y: 0.9, z: 0.26 });
        } else {
          n = vec3Normalize({ x: 0, y: -0.92, z: 0.39 });
        }
      }

      depthBuffer[idx] = depth;
      normalBuffer[idx * 3] = n.x;
      normalBuffer[idx * 3 + 1] = n.y;
      normalBuffer[idx * 3 + 2] = n.z;
    }
  }

  return { preset, labelKo, width: safeW, height: safeH, depthBuffer, normalBuffer };
}

function buildRowRunsSvgPaths(
  mask: Uint8Array,
  width: number,
  height: number,
  targetValue: number,
): readonly string[] {
  const paths: string[] = [];
  for (let y = 0; y < height; y += 1) {
    let runStart = -1;
    for (let x = 0; x <= width; x += 1) {
      const matched = x < width && mask[y * width + x] === targetValue;
      if (matched && runStart === -1) {
        runStart = x;
      } else if (!matched && runStart !== -1) {
        const runLength = x - runStart;
        paths.push(`M${runStart} ${y}h${runLength}v1h-${runLength}z`);
        runStart = -1;
      }
    }
  }
  return paths;
}

function computeDeterministicHash(parts: readonly number[]): string {
  let hash = 2166136261;
  for (const part of parts) {
    hash ^= Math.round(part * 1000) & 0xffffffff;
    hash = Math.imul(hash, 16777619);
  }
  return `wt3l-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function extractThreeLayerWebtoonInkAndTone(
  input: ThreeLayerExtractInput,
): ThreeLayerExtractResult {
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));
  const totalPixels = width * height;
  const lightDir = vec3Normalize(
    input.lightDirection ?? { x: 0.48, y: -0.42, z: 0.77 },
  );
  const outlineWidthPx = roundTo(clamp(input.outlineWidthPx ?? 2.4, 0.8, 6.0), 2);
  const detailWidthPx = roundTo(clamp(input.detailWidthPx ?? 0.9, 0.3, 3.0), 2);
  const depthThreshold = clamp(input.depthThreshold ?? 0.065, 0.005, 0.5);
  const normalCreaseThreshold = clamp(input.normalCreaseThreshold ?? 0.34, 0.05, 1.5);
  const celMidThreshold = clamp(input.celMidThreshold ?? 0.58, 0.15, 0.95);
  const celDeepThreshold = clamp(input.celDeepThreshold ?? 0.22, 0.0, celMidThreshold - 0.05);

  const outlineMask = new Uint8Array(totalPixels);
  const detailMask = new Uint8Array(totalPixels);
  const celMask = new Uint8Array(totalPixels);

  const readDepth = (x: number, y: number): number => {
    const cx = clamp(x, 0, width - 1);
    const cy = clamp(y, 0, height - 1);
    const raw = input.depthBuffer[cy * width + cx];
    return typeof raw === "number" && Number.isFinite(raw) ? raw : 1.0;
  };

  const readNormal = (x: number, y: number): Vec3 => {
    const cx = clamp(x, 0, width - 1);
    const cy = clamp(y, 0, height - 1);
    const base = (cy * width + cx) * 3;
    return vec3Normalize({
      x: input.normalBuffer[base] ?? 0,
      y: input.normalBuffer[base + 1] ?? 0,
      z: input.normalBuffer[base + 2] ?? 1,
    });
  };

  let outlineCount = 0;
  let detailCount = 0;
  let litCount = 0;
  let midShadowCount = 0;
  let deepShadowCount = 0;
  let backgroundCount = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const dC = readDepth(x, y);
      const depthGrad = Math.max(
        Math.abs(dC - readDepth(x + 1, y)),
        Math.abs(dC - readDepth(x - 1, y)),
        Math.abs(dC - readDepth(x, y + 1)),
        Math.abs(dC - readDepth(x, y - 1)),
      );

      const isForeground = dC < 0.93;
      if (depthGrad >= depthThreshold) {
        outlineMask[idx] = 1;
        outlineCount += 1;
      } else if (isForeground) {
        const nC = readNormal(x, y);
        const normalDelta = Math.max(
          1 - vec3Dot(nC, readNormal(x + 1, y)),
          1 - vec3Dot(nC, readNormal(x, y + 1)),
        );
        if (normalDelta >= normalCreaseThreshold) {
          detailMask[idx] = 1;
          detailCount += 1;
        }
      }

      if (!isForeground) {
        backgroundCount += 1;
      } else {
        const ndotl = clamp(vec3Dot(readNormal(x, y), lightDir), -1, 1);
        if (ndotl < celDeepThreshold) {
          celMask[idx] = 2;
          deepShadowCount += 1;
        } else if (ndotl < celMidThreshold) {
          celMask[idx] = 1;
          midShadowCount += 1;
        } else {
          celMask[idx] = 0;
          litCount += 1;
        }
      }
    }
  }

  const outlinePaths = buildRowRunsSvgPaths(outlineMask, width, height, 1);
  const detailPaths = buildRowRunsSvgPaths(detailMask, width, height, 1);
  const celMidPaths = buildRowRunsSvgPaths(celMask, width, height, 1);
  const celDeepPaths = buildRowRunsSvgPaths(celMask, width, height, 2);

  const outlineSvgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-layer="outline-gpen"><path d="${outlinePaths.join(" ")}" fill="var(--s3e-ink-outline, oklch(0.2 0.02 255))" stroke-width="${outlineWidthPx}"/></svg>`;
  const detailSvgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-layer="detail-marupen"><path d="${detailPaths.join(" ")}" fill="var(--s3e-ink-detail, oklch(0.38 0.03 255))" stroke-width="${detailWidthPx}"/></svg>`;
  const celSvgMarkup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" data-layer="cel-tone-2step"><path d="${celMidPaths.join(" ")}" fill="var(--s3e-cel-mid, oklch(0.74 0.04 252))" opacity="0.55"/><path d="${celDeepPaths.join(" ")}" fill="var(--s3e-cel-deep, oklch(0.54 0.06 254))" opacity="0.82"/></svg>`;

  const celActive = midShadowCount + deepShadowCount;
  const layers: readonly [
    ExtractedWebtoonLayer,
    ExtractedWebtoonLayer,
    ExtractedWebtoonLayer,
  ] = [
    {
      id: "outline-gpen",
      nameKo: `외곽선 레이어 (G펜 ${outlineWidthPx}px)`,
      penLabelKo: `G펜 ${outlineWidthPx}px`,
      strokeWidthPx: outlineWidthPx,
      blendMode: "normal",
      opacity: 1,
      pixelMask: outlineMask,
      activePixelCount: outlineCount,
      coverageRatio: roundTo(outlineCount / totalPixels, 4),
      svgPaths: outlinePaths,
      svgMarkup: outlineSvgMarkup,
      colorToken: "var(--s3e-ink-outline)",
    },
    {
      id: "detail-marupen",
      nameKo: `내부 디테일선 레이어 (마루펜 ${detailWidthPx}px)`,
      penLabelKo: `마루펜 ${detailWidthPx}px`,
      strokeWidthPx: detailWidthPx,
      blendMode: "normal",
      opacity: 0.92,
      pixelMask: detailMask,
      activePixelCount: detailCount,
      coverageRatio: roundTo(detailCount / totalPixels, 4),
      svgPaths: detailPaths,
      svgMarkup: detailSvgMarkup,
      colorToken: "var(--s3e-ink-detail)",
    },
    {
      id: "cel-tone-2step",
      nameKo: "2단 셀 명암 레이어",
      penLabelKo: "2단 셀 명암",
      strokeWidthPx: 0,
      blendMode: "multiply",
      opacity: 0.46,
      pixelMask: celMask,
      activePixelCount: celActive,
      coverageRatio: roundTo(celActive / totalPixels, 4),
      svgPaths: [...celMidPaths, ...celDeepPaths],
      svgMarkup: celSvgMarkup,
      colorToken: "var(--s3e-cel-deep)",
    },
  ];

  const compositeSvgMarkup = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="3계층 한국 웹툰 선화 및 2단 셀 명암 추출 결과">`,
    `<g data-layer="cel-tone-2step"><path d="${celMidPaths.join(" ")}" fill="var(--s3e-cel-mid, oklch(0.74 0.04 252))" opacity="0.52"/><path d="${celDeepPaths.join(" ")}" fill="var(--s3e-cel-deep, oklch(0.54 0.06 254))" opacity="0.8"/></g>`,
    `<g data-layer="detail-marupen"><path d="${detailPaths.join(" ")}" fill="var(--s3e-ink-detail, oklch(0.38 0.03 255))"/></g>`,
    `<g data-layer="outline-gpen"><path d="${outlinePaths.join(" ")}" fill="var(--s3e-ink-outline, oklch(0.2 0.02 255))"/></g>`,
    "</svg>",
  ].join("");

  return {
    width,
    height,
    layers,
    celBreakdown: { litCount, midShadowCount, deepShadowCount, backgroundCount },
    compositeSvgMarkup,
    manifestFingerprint: computeDeterministicHash([
      width,
      height,
      outlineCount,
      detailCount,
      midShadowCount,
      deepShadowCount,
      outlineWidthPx,
      detailWidthPx,
    ]),
    costKrw: 0,
  };
}

// ============================================================================
// 2. 웹툰 전용 '박력 과장 원근 렌즈(히어로 퍼스펙티브)'
// ============================================================================

export type HeroVertexRole =
  | "hand"
  | "weapon"
  | "foreground-prop"
  | "torso"
  | "head"
  | "pelvis"
  | "leg";

export interface HeroPerspectiveVertex {
  readonly id: string;
  readonly labelKo: string;
  readonly role: HeroVertexRole;
  readonly position: Vec3;
  readonly anchorPosition: Vec3;
}

export interface HeroPerspectiveLensInput {
  readonly exaggerationFactor: number;
  readonly cameraPosition?: Vec3;
  readonly cameraTarget?: Vec3;
  readonly focalLengthMm?: number;
  readonly nearRangeMeters?: number;
  readonly nonLinearGamma?: number;
  readonly vertices?: readonly HeroPerspectiveVertex[];
}

export interface EvaluatedHeroVertex {
  readonly id: string;
  readonly labelKo: string;
  readonly role: HeroVertexRole;
  readonly bodyPreserved: boolean;
  readonly originalPosition: Vec3;
  readonly transformedPosition: Vec3;
  readonly projectedOriginal: Vec2;
  readonly projectedTransformed: Vec2;
  readonly appliedScale: number;
  readonly proximityWeight: number;
}

export interface HeroPerspectiveLensResult {
  readonly exaggerationFactor: number;
  readonly focalLengthMm: number;
  readonly effectiveDynamicFocalFeelMm: number;
  readonly vertices: readonly EvaluatedHeroVertex[];
  readonly maxAppliedHeroScale: number;
  readonly torsoDistortionRatio: number;
  readonly torsoProportionPreserved: boolean;
  readonly heroExaggeratedCount: number;
  readonly preservedBodyCount: number;
  readonly costKrw: 0;
}

const HERO_EXAGGERATED_ROLES: ReadonlySet<HeroVertexRole> = new Set([
  "hand",
  "weapon",
  "foreground-prop",
]);

const DEFAULT_HERO_PERSPECTIVE_VERTICES: readonly HeroPerspectiveVertex[] = [
  {
    id: "head-crown",
    labelKo: "머리 정수리",
    role: "head",
    position: { x: 0, y: 1.66, z: 0 },
    anchorPosition: { x: 0, y: 1.48, z: 0 },
  },
  {
    id: "torso-shoulder-l",
    labelKo: "왼어깨 (몸통 기준)",
    role: "torso",
    position: { x: -0.22, y: 1.42, z: 0 },
    anchorPosition: { x: 0, y: 1.25, z: 0 },
  },
  {
    id: "torso-shoulder-r",
    labelKo: "오른어깨 (몸통 기준)",
    role: "torso",
    position: { x: 0.22, y: 1.42, z: 0 },
    anchorPosition: { x: 0, y: 1.25, z: 0 },
  },
  {
    id: "pelvis-core",
    labelKo: "골반 중심",
    role: "pelvis",
    position: { x: 0, y: 0.94, z: 0 },
    anchorPosition: { x: 0, y: 0.94, z: 0 },
  },
  {
    id: "lead-hand-fist",
    labelKo: "전방 주먹 (근접 손)",
    role: "hand",
    position: { x: 0.16, y: 1.32, z: 1.08 },
    anchorPosition: { x: 0.18, y: 1.35, z: 0.42 },
  },
  {
    id: "hero-blade-tip",
    labelKo: "전방 검 끝 (근접 무기)",
    role: "weapon",
    position: { x: 0.34, y: 1.26, z: 1.58 },
    anchorPosition: { x: 0.16, y: 1.32, z: 1.08 },
  },
];

function projectPointToNdc(
  point: Vec3,
  cameraPos: Vec3,
  cameraTarget: Vec3,
  focalLengthMm: number,
): Vec2 {
  const forward = vec3Normalize(vec3Sub(cameraTarget, cameraPos), { x: 0, y: 0, z: -1 });
  const right = vec3Normalize(vec3Cross(forward, { x: 0, y: 1, z: 0 }), { x: 1, y: 0, z: 0 });
  const up = vec3Cross(right, forward);
  const rel = vec3Sub(point, cameraPos);
  const cz = Math.max(0.15, vec3Dot(rel, forward));
  const fNorm = focalLengthMm / 36;
  return {
    x: roundTo((vec3Dot(rel, right) * fNorm) / cz, 4),
    y: roundTo((vec3Dot(rel, up) * fNorm) / cz, 4),
  };
}

export function evaluateHeroPerspectiveLens(
  input: HeroPerspectiveLensInput,
): HeroPerspectiveLensResult {
  const exaggerationFactor = roundTo(clamp(input.exaggerationFactor, 1.0, 1.6), 3);
  const cameraPosition = input.cameraPosition ?? { x: 0, y: 1.36, z: 2.25 };
  const cameraTarget = input.cameraTarget ?? { x: 0, y: 1.24, z: 0 };
  const focalLengthMm = roundTo(clamp(input.focalLengthMm ?? 35, 16, 135), 1);
  const nearRangeMeters = clamp(input.nearRangeMeters ?? 2.1, 0.5, 6.0);
  const gamma = clamp(input.nonLinearGamma ?? 1.45, 0.6, 3.0);
  const vertices = input.vertices ?? DEFAULT_HERO_PERSPECTIVE_VERTICES;

  let maxAppliedHeroScale = 1.0;
  let heroExaggeratedCount = 0;
  let preservedBodyCount = 0;

  const evaluated: EvaluatedHeroVertex[] = vertices.map((vertex) => {
    const isHero = HERO_EXAGGERATED_ROLES.has(vertex.role);
    const projectedOriginal = projectPointToNdc(
      vertex.position,
      cameraPosition,
      cameraTarget,
      focalLengthMm,
    );

    if (!isHero) {
      preservedBodyCount += 1;
      return {
        id: vertex.id,
        labelKo: vertex.labelKo,
        role: vertex.role,
        bodyPreserved: true,
        originalPosition: { ...vertex.position },
        transformedPosition: { ...vertex.position },
        projectedOriginal,
        projectedTransformed: projectedOriginal,
        appliedScale: 1,
        proximityWeight: 0,
      };
    }

    heroExaggeratedCount += 1;
    const distToCamera = vec3Distance(vertex.position, cameraPosition);
    const rawProximity = clamp(1 - (distToCamera - 0.35) / nearRangeMeters, 0.2, 1.0);
    const curvedWeight = clamp(Math.pow(rawProximity, gamma), 0, 1);
    const appliedScale = roundTo(
      clamp(1 + (exaggerationFactor - 1) * curvedWeight, 1.0, 1.6),
      4,
    );
    if (appliedScale > maxAppliedHeroScale) maxAppliedHeroScale = appliedScale;

    const radialExpanded = vec3Add(
      vertex.anchorPosition,
      vec3Scale(vec3Sub(vertex.position, vertex.anchorPosition), appliedScale),
    );
    const towardCamDir = vec3Normalize(vec3Sub(cameraPosition, vertex.position));
    const camPullMeters = (appliedScale - 1) * 0.22 * curvedWeight;
    const transformedPosition: Vec3 = {
      x: roundTo(radialExpanded.x + towardCamDir.x * camPullMeters, 4),
      y: roundTo(radialExpanded.y + towardCamDir.y * camPullMeters, 4),
      z: roundTo(radialExpanded.z + towardCamDir.z * camPullMeters, 4),
    };

    return {
      id: vertex.id,
      labelKo: vertex.labelKo,
      role: vertex.role,
      bodyPreserved: false,
      originalPosition: { ...vertex.position },
      transformedPosition,
      projectedOriginal,
      projectedTransformed: projectPointToNdc(
        transformedPosition,
        cameraPosition,
        cameraTarget,
        focalLengthMm,
      ),
      appliedScale,
      proximityWeight: roundTo(curvedWeight, 4),
    };
  });

  const bodyVertices = evaluated.filter((item) => item.bodyPreserved);
  let maxBodyDrift = 0;
  for (let i = 0; i < bodyVertices.length; i += 1) {
    for (let j = i + 1; j < bodyVertices.length; j += 1) {
      const origDist = vec3Distance(
        bodyVertices[i].originalPosition,
        bodyVertices[j].originalPosition,
      );
      const nextDist = vec3Distance(
        bodyVertices[i].transformedPosition,
        bodyVertices[j].transformedPosition,
      );
      if (origDist > 1e-6) {
        maxBodyDrift = Math.max(maxBodyDrift, Math.abs(nextDist - origDist) / origDist);
      }
    }
  }

  return {
    exaggerationFactor,
    focalLengthMm,
    effectiveDynamicFocalFeelMm: roundTo(focalLengthMm / Math.max(1, maxAppliedHeroScale), 1),
    vertices: evaluated,
    maxAppliedHeroScale: roundTo(maxAppliedHeroScale, 4),
    torsoDistortionRatio: roundTo(maxBodyDrift, 6),
    torsoProportionPreserved: maxBodyDrift <= 1e-6,
    heroExaggeratedCount,
    preservedBodyCount,
    costKrw: 0,
  };
}
