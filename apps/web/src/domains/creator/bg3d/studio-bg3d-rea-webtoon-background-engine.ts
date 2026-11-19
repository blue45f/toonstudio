/**
 * REA(reverse-engineer-anything) 기반 3D 웹툰 배경 유사 서비스 역공학 합성 엔진
 * 및 VARCO 3D(22 디오라마 · 21 한국형 소품) · Tripo 3D(8종 배경 GLB) 실전 퀄리티 업그레이드 모듈.
 *
 * 역공학 근거:
 * 1. Live CDP Observation (`ev_8f271517d59033d5b725f054dedfb4c477d65388fc8716da94dba131282f90c9`,
 *    `ev_9d214c7906f4fa9d464d4234e584a2b1c69b35d61bed4cd87d447fd7e25259e9`):
 *    `https://studio.tripo3d.ai/ko/workspace/generate` (Smart Mesh P2.0 Quad / H3.1 PBR / 시맨틱 파츠 분할)
 * 2. GLBForge `inspect_geometry` 전수 실측:
 *    `apps/web/public/models/tripo3d-mcp/*.glb` 8종 배경 GLB의 월드 바운딩 박스, 피벗 오프셋(`min.y`),
 *    폴리곤 밀도 및 웹툰 인체 비례(1.70m 기준) 휴먼 스케일 자동 보정 계수(`calibratedScale`, `groundYOffset`)
 * 3. 글로벌 3D 웹툰 배경 생태계 8대 서비스 아키텍처 역공학 내재화:
 *    - 에이콘3D (Acon3D / Carpenstreet)
 *    - 스냅툰 (SnapToon Unreal NPR)
 *    - 클립스튜디오 3D LT (Clip Studio Paint EX LT Conversion)
 *    - 스케치업 웹툰 워크플로우 (SketchUp Webtoon Dynamic Components & Section Cut)
 *    - NC AI VARCO 3D (아이소메트릭 컷어웨이 디오라마 22종 & 한국형 소품 21종)
 *    - Tripo 3D Studio MCP (Smart Mesh P2.0 Quad & H3.1 Ultra 8K Delight PBR)
 *    - 돈드로우 (DonDraw 웹툰 3D 세트장 & 카메라 북마크)
 *    - 블렌더 Freestyle / LineArt & EEVEE Toon Shader
 */

import {
  GEN3D_MCP_GENERATED_MODELS,
  type Gen3dMcpGeneratedModelEntry,
} from "../scene-3d/studio-gen3d-customizer-engine";
import type { BgPrimitive } from "../studio-background-3d-metadata";
import {
  STUDIO_BG3D_REA_COMPETITOR_PROFILES,
  makeReaBg3dPrim,
  type Bg3dGlbItem,
  type Bg3dPrimitiveItem,
  type Bg3dPrimitiveShape,
  type StudioBg3dReaCompetitorId,
  type StudioBg3dReaCompetitorProfile,
  type StudioBg3dTimeOfDayMoodId,
  type Vec3,
} from "./studio-bg3d-rea-primitives";

export {
  STUDIO_BG3D_REA_COMPETITOR_PROFILES,
  makeReaBg3dPrim,
  type Bg3dGlbItem,
  type Bg3dPrimitiveItem,
  type Bg3dPrimitiveShape,
  type StudioBg3dReaCompetitorId,
  type StudioBg3dReaCompetitorProfile,
  type StudioBg3dTimeOfDayMoodId,
  type Vec3,
};

export {
  STUDIO_BG3D_ASSET3D_GLB_CALIBRATION_CATALOG,
  buildCalibratedAsset3dBg3dGlbPlacement,
  buildAsset3dDioramaDetailedPrimitives,
  buildAsset3dPropDetailedPrimitives,
  getStudioBg3dAsset3dGlbCalibration,
  resolveReaDioramaSummaryKo,
  resolveAsset3dBg3dGlbIdForDiorama,
  type StudioBg3dAsset3dGlbCalibrationSpec,
} from "./studio-bg3d-prop-diorama-builders";

export function toBgPrimitives(items: readonly Bg3dPrimitiveItem[]): BgPrimitive[] {
  return items.map((item) => ({
    id: item.id,
    kind: item.shape,
    name: item.componentRef?.name ?? item.id,
    position: [item.position[0], item.position[1], item.position[2]],
    rotation: [item.rotation[0], item.rotation[1], item.rotation[2]],
    scale: [item.scale[0], item.scale[1], item.scale[2]],
    color: item.color,
    visible: item.visible,
    locked: item.locked,
    ...(item.tags ? { tags: [...item.tags] } : {}),
    ...(item.componentRef ? { componentRef: item.componentRef } : {}),
  }));
}


/**
 * GLBForge `inspect_geometry`로 실측한 Tripo 3D 배경 GLB 8종의 바운딩 박스·피벗·휴먼스케일 보정 원장.
 */
export interface StudioBg3dTripoGlbCalibrationSpec {
  readonly modelId: string;
  readonly labelKo: string;
  readonly url: `/models/tripo3d-mcp/${string}.glb`;
  readonly rawSizeMeters: readonly [number, number, number];
  readonly rawMinY: number;
  readonly pivotAtBase: boolean;
  readonly calibratedScale: number;
  readonly groundYOffset: number;
  readonly humanScaleDimensionsMeters: readonly [number, number, number];
  readonly recommendedAnchorPosition: Vec3;
  readonly linkedUniverseId: string;
}

const BASE_TRIPO_GLB_CALIBRATIONS: Readonly<
  Record<string, Omit<StudioBg3dTripoGlbCalibrationSpec, "modelId" | "labelKo" | "url">>
> = {
  "tripo3d-h31-bg-bus-stop-vending-shelter": {
    rawSizeMeters: [0.487, 0.633, 0.999], rawMinY: -0.316, pivotAtBase: false,
    calibratedScale: 3.8, groundYOffset: 1.2, humanScaleDimensionsMeters: [1.85, 2.41, 3.8],
    recommendedAnchorPosition: [0, 1.2, -1.2], linkedUniverseId: "daily-cafe-street",
  },
  "tripo3d-p2-bg-street-cafe-kit": {
    rawSizeMeters: [0.994, 0.971, 1.0], rawMinY: -0.478, pivotAtBase: false,
    calibratedScale: 4.2, groundYOffset: 2.01, humanScaleDimensionsMeters: [4.17, 4.08, 4.2],
    recommendedAnchorPosition: [0, 2.01, -1.2], linkedUniverseId: "cafe-terrace",
  },
  "tripo3d-h31-bg-classroom-furniture-kit": {
    rawSizeMeters: [0.978, 0.431, 0.781], rawMinY: -0.215, pivotAtBase: false,
    calibratedScale: 2.2, groundYOffset: 0.47, humanScaleDimensionsMeters: [2.15, 0.95, 1.72],
    recommendedAnchorPosition: [0, 0.47, 0], linkedUniverseId: "school-romance",
  },
  "tripo3d-h31-bg-korean-convenience-store": {
    rawSizeMeters: [0.983, 0.823, 0.717], rawMinY: -0.411, pivotAtBase: false,
    calibratedScale: 5.2, groundYOffset: 2.14, humanScaleDimensionsMeters: [5.11, 4.28, 3.73],
    recommendedAnchorPosition: [0, 2.14, -1.5], linkedUniverseId: "convenience-alley",
  },
  "tripo3d-h31-bg-romance-fantasy-palace-courtyard": {
    rawSizeMeters: [0.975, 0.828, 0.978], rawMinY: -0.414, pivotAtBase: false,
    calibratedScale: 7.4, groundYOffset: 3.06, humanScaleDimensionsMeters: [7.22, 6.13, 7.24],
    recommendedAnchorPosition: [0, 3.06, -1.8], linkedUniverseId: "rofan-palace",
  },
  "tripo3d-h31-bg-industrial-rooftop-hvac": {
    rawSizeMeters: [0.969, 0.857, 0.981], rawMinY: -0.428, pivotAtBase: false,
    calibratedScale: 4.5, groundYOffset: 1.93, humanScaleDimensionsMeters: [4.36, 3.86, 4.41],
    recommendedAnchorPosition: [0, 1.93, -1.4], linkedUniverseId: "cyberpunk-neon",
  },
  "tripo3d-mcp-bg-korean-alley-stairway": {
    rawSizeMeters: [2.68, 2.69, 4.5], rawMinY: 0, pivotAtBase: true,
    calibratedScale: 1.0, groundYOffset: 0, humanScaleDimensionsMeters: [2.68, 2.69, 4.5],
    recommendedAnchorPosition: [0, 0, -1.0], linkedUniverseId: "convenience-alley",
  },
  "tripo3d-mcp-bg-cafe-counter-cluster": {
    rawSizeMeters: [3.18, 2.32, 2.25], rawMinY: 0, pivotAtBase: true,
    calibratedScale: 1.0, groundYOffset: 0, humanScaleDimensionsMeters: [3.18, 2.32, 2.25],
    recommendedAnchorPosition: [0, 0, -1.2], linkedUniverseId: "cafe-terrace",
  },
  "tripo3d-mcp-bg-rooftop-neon-signboard": {
    rawSizeMeters: [1.13, 1.13, 0.12], rawMinY: -0.563, pivotAtBase: false,
    calibratedScale: 1.8, groundYOffset: 2.65, humanScaleDimensionsMeters: [2.03, 2.03, 0.22],
    recommendedAnchorPosition: [0, 2.65, -3.2], linkedUniverseId: "cyberpunk-neon",
  },
  "tripo3d-h31-bg-korean-hanok-pavilion-gate": {
    rawSizeMeters: [0.635, 0.625, 0.979], rawMinY: -0.313, pivotAtBase: false,
    calibratedScale: 5.8, groundYOffset: 1.82, humanScaleDimensionsMeters: [3.68, 3.63, 5.68],
    recommendedAnchorPosition: [0, 1.82, -1.6], linkedUniverseId: "murim-martial-courtyard",
  },
  "tripo3d-h31-bg-modern-hospital-ward-bed": {
    rawSizeMeters: [0.979, 0.975, 0.647], rawMinY: -0.487, pivotAtBase: false,
    calibratedScale: 2.6, groundYOffset: 1.27, humanScaleDimensionsMeters: [2.55, 2.54, 1.68],
    recommendedAnchorPosition: [0, 1.27, -0.8], linkedUniverseId: "medical-drama-ward",
  },
  "tripo3d-h31-bg-cyberpunk-arcade-cabinet": {
    rawSizeMeters: [0.535, 0.978, 0.547], rawMinY: -0.489, pivotAtBase: false,
    calibratedScale: 2.4, groundYOffset: 1.17, humanScaleDimensionsMeters: [1.28, 2.35, 1.31],
    recommendedAnchorPosition: [0, 1.17, -1.2], linkedUniverseId: "cyberpunk-neon-alley",
  },
  "tripo3d-h31-bg-detective-office-desk": {
    rawSizeMeters: [0.462, 0.975, 0.979], rawMinY: -0.488, pivotAtBase: false,
    calibratedScale: 2.5, groundYOffset: 1.22, humanScaleDimensionsMeters: [1.16, 2.44, 2.45],
    recommendedAnchorPosition: [0, 1.22, -0.8], linkedUniverseId: "modern-office-noir",
  },
  "tripo3d-h31-bg-fantasy-alchemy-lab": {
    rawSizeMeters: [0.637, 0.978, 0.979], rawMinY: -0.489, pivotAtBase: false,
    calibratedScale: 2.8, groundYOffset: 1.37, humanScaleDimensionsMeters: [1.78, 2.74, 2.74],
    recommendedAnchorPosition: [0, 1.37, -1.2], linkedUniverseId: "hunter-dungeon-altar",
  },
  "tripo3d-h31-bg-subway-turnstile-platform": {
    rawSizeMeters: [0.98, 0.827, 0.909], rawMinY: -0.413, pivotAtBase: false,
    calibratedScale: 4.5, groundYOffset: 1.86, humanScaleDimensionsMeters: [4.41, 3.72, 4.09],
    recommendedAnchorPosition: [0, 1.86, -1.4], linkedUniverseId: "daily-cafe-street",
  },
  "tripo3d-h31-bg-penthouse-rooftop-lounge": {
    rawSizeMeters: [0.971, 0.494, 0.979], rawMinY: -0.247, pivotAtBase: false,
    calibratedScale: 5.6, groundYOffset: 1.38, humanScaleDimensionsMeters: [5.44, 2.77, 5.48],
    recommendedAnchorPosition: [0, 1.38, -1.5], linkedUniverseId: "modern-office-noir",
  },
  "tripo3d-h31-bg-courtroom-judge-bench": {
    rawSizeMeters: [0.98, 0.492, 0.903], rawMinY: -0.246, pivotAtBase: false,
    calibratedScale: 4.4, groundYOffset: 1.08, humanScaleDimensionsMeters: [4.31, 2.16, 3.97],
    recommendedAnchorPosition: [0, 1.08, -1.4], linkedUniverseId: "modern-office-noir",
  },
};

export const STUDIO_BG3D_TRIPO_GLB_CALIBRATION_CATALOG: readonly StudioBg3dTripoGlbCalibrationSpec[] =
  Object.freeze(
    GEN3D_MCP_GENERATED_MODELS.filter((m) => m.domain === "bg3d").map((model): StudioBg3dTripoGlbCalibrationSpec => {
      const override = BASE_TRIPO_GLB_CALIBRATIONS[model.id];
      if (override) {
        return {
          modelId: model.id,
          labelKo: model.nameKo,
          url: model.url,
          ...override,
        };
      }
      return {
        modelId: model.id,
        labelKo: model.nameKo,
        url: model.url,
        rawSizeMeters: [0.98, 0.85, 0.92],
        rawMinY: 0,
        pivotAtBase: true,
        calibratedScale: 3.6,
        groundYOffset: 0,
        humanScaleDimensionsMeters: [3.6, 3.0, 3.4],
        recommendedAnchorPosition: [0, 0, -1.4],
        linkedUniverseId: "daily-cafe-street",
      };
    }),
  );

export function getStudioBg3dTripoGlbCalibration(
  modelId: string,
): StudioBg3dTripoGlbCalibrationSpec {
  return (
    STUDIO_BG3D_TRIPO_GLB_CALIBRATION_CATALOG.find((item) => item.modelId === modelId) ??
    STUDIO_BG3D_TRIPO_GLB_CALIBRATION_CATALOG[0]!
  );
}

export function buildCalibratedTripoBg3dGlbPlacement(
  modelId: string,
  options?: {
    readonly positionOffset?: Vec3;
    readonly scaleMultiplier?: number;
    readonly rotationYRad?: number;
    readonly idPrefix?: string;
  },
): Bg3dGlbItem {
  const spec = getStudioBg3dTripoGlbCalibration(modelId);
  const modelEntry: Gen3dMcpGeneratedModelEntry | undefined = GEN3D_MCP_GENERATED_MODELS.find(
    (m) => m.id === spec.modelId,
  );
  const mult = Math.max(0.25, Math.min(3.0, options?.scaleMultiplier ?? 1));
  const finalScale = Number((spec.calibratedScale * mult).toFixed(3));
  const offset = options?.positionOffset ?? [0, 0, 0];
  const groundedY = Number((spec.groundYOffset * mult + offset[1]).toFixed(3));
  const idPrefix = options?.idPrefix ?? "tripo3d-glb";

  return {
    id: `${idPrefix}-${spec.modelId}`,
    name: modelEntry?.nameKo ?? spec.labelKo,
    kind: "glb",
    url: spec.url,
    position: [
      Number((spec.recommendedAnchorPosition[0] + offset[0]).toFixed(3)),
      groundedY,
      Number((spec.recommendedAnchorPosition[2] + offset[2]).toFixed(3)),
    ],
    rotation: [0, options?.rotationYRad ?? 0, 0],
    scale: [finalScale, finalScale, finalScale],
    visible: true,
    locked: false,
  };
}


const makePrim = makeReaBg3dPrim;

/**
 * Tripo 3D 배경 키트 8종의 시맨틱 파츠(`customizableParts`)를 즉각 편집 가능한 다중 프리미티브 트윈으로 합성한다.
 */
export function buildTripoBg3dProceduralTwinPrimitives(
  modelId: string,
  options?: {
    readonly enabledPartIds?: readonly string[];
    readonly anchorXZ?: readonly [number, number];
  },
): readonly Bg3dPrimitiveItem[] {
  const model =
    GEN3D_MCP_GENERATED_MODELS.find((m) => m.id === modelId && m.domain === "bg3d") ??
    GEN3D_MCP_GENERATED_MODELS.find((m) => m.domain === "bg3d")!;
  const cal = getStudioBg3dTripoGlbCalibration(model.id);
  const [ax, az] = options?.anchorXZ ?? [cal.recommendedAnchorPosition[0], cal.recommendedAnchorPosition[2]];
  const enabledSet = new Set(
    options?.enabledPartIds && options.enabledPartIds.length > 0
      ? options.enabledPartIds
      : model.customizableParts.map((p) => p.id),
  );
  const compRef = { id: `tripo3d-kit:${model.id}`, name: model.nameKo };
  const baseTag = ["tripo3d-bg-kit", model.topologyMode, model.id] as const;

  const partColors = ["#38bdf8", "#f59e0b", "#cbd5e1", "#94a3b8", "#f472b6"] as const;
  const activeParts = model.customizableParts.filter((p) => enabledSet.has(p.id));
  const partsToBuild = activeParts.length > 0 ? activeParts : model.customizableParts;

  const [hw, hh, hd] = cal.humanScaleDimensionsMeters;
  const items: Bg3dPrimitiveItem[] = [
    // 베이스 플랫폼/바운딩 앵커
    makePrim(
      `tripo-kit-base-${model.id}`,
      "box",
      [ax, Math.max(0.12, hh * 0.08), az],
      [hw * 0.92, Math.max(0.24, hh * 0.16), hd * 0.88],
      "#334155",
      0.42,
      0.38,
      baseTag,
      compRef,
    ),
  ];

  partsToBuild.forEach((part, index) => {
    const ratio = (index - (partsToBuild.length - 1) / 2) / Math.max(1, partsToBuild.length);
    const px = ax + ratio * hw * 0.65;
    const py = Math.max(0.45, hh * (0.32 + (index % 3) * 0.18));
    const pz = az + ((index % 2 === 0 ? -1 : 1) * hd * 0.18);
    const shape: Bg3dPrimitiveShape =
      part.id.includes("pillar") || part.id.includes("tank") || part.id.includes("stool") || part.id.includes("lamp")
        ? "cylinder"
        : part.id.includes("dome") || part.id.includes("fountain")
          ? "sphere"
          : "box";
    items.push(
      makePrim(
        `tripo-kit-part-${model.id}-${part.id}`,
        shape,
        [px, py, pz],
        [
          Math.max(0.45, hw / Math.max(2, partsToBuild.length)),
          Math.max(0.45, hh * 0.46),
          Math.max(0.38, hd * 0.36),
        ],
        partColors[index % partColors.length]!,
        0.35,
        0.25,
        [...baseTag, `part:${part.id}`],
        { id: `tripo3d-part:${model.id}:${part.id}`, name: `${model.nameKo} · ${part.labelKo}` },
      ),
    );
  });

  return items;
}
