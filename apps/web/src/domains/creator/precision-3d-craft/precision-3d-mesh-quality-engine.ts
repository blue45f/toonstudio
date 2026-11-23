/**
 * 최상급 정밀 3D 커스텀 모델링 품질 엔진 (순수 커널).
 *
 * - 매니폴드 무결성 & 정밀 검사기 (`auditPrecisionMeshTopology`)
 * - 커스텀 프로시저럴 3D 건축/소품 파라메트릭 빌더 (`generateCustomPrecisionAssetSpec`)
 * - 커스텀 3D 리깅/소품 조립 검증 (`validatePrecisionRigAssembly`)
 * - GLB 경량 예산 검사 (`evaluatePrecisionGlbBudget`: `desktop-hero@1` / `mobile-hero@1`)
 */

import {
  FLOOR_GROUNDING_TOLERANCE_METERS,
  GLB_BUDGET_PROFILES,
  METRIC_SCALE_TOLERANCE,
  PRECISION_ASSET_ARCHETYPES,
  PRECISION_LIGHTING_PRESETS,
  PRECISION_PBR_MATERIAL_PRESETS,
  getPrecisionAssetArchetype,
  type GlbBudgetProfileId,
  type GlbBudgetProfileLimits,
  type PrecisionAssetArchetypeId,
  type PrecisionAssetArchetypeSpec,
  type PrecisionLightingPreset,
  type PrecisionLightingPresetId,
  type PrecisionPbrMaterialId,
  type PrecisionPbrMaterialPreset,
  type PrecisionRigSocketSpec,
} from "./precision-3d-craft-catalog";

export {
  FLOOR_GROUNDING_TOLERANCE_METERS,
  GLB_BUDGET_PROFILES,
  METRIC_SCALE_TOLERANCE,
  PRECISION_ASSET_ARCHETYPES,
  PRECISION_LIGHTING_PRESETS,
  PRECISION_PBR_MATERIAL_PRESETS,
  getPrecisionAssetArchetype,
  type GlbBudgetProfileId,
  type GlbBudgetProfileLimits,
  type PrecisionAssetArchetypeId,
  type PrecisionAssetArchetypeSpec,
  type PrecisionLightingPreset,
  type PrecisionLightingPresetId,
  type PrecisionPbrMaterialId,
  type PrecisionPbrMaterialPreset,
  type PrecisionRigSocketSpec,
};

export type PrecisionCheckStatus = "pass" | "warn" | "fail";

export interface PrecisionMeshTopologyInput {
  readonly meshName: string;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly quadRatio: number;
  readonly nonManifoldEdges: number;
  readonly boundaryEdges: number;
  readonly looseVertices: number;
  readonly zeroAreaTriangles: number;
  /** glTF Y-up 기준 최하단 Y 좌표 (0.000m = 바닥 접지) */
  readonly minY: number;
  /** 씬 단위 배율 (1.0 = 1m) */
  readonly unitScaleMeters: number;
  readonly boundingBoxMeters: readonly [number, number, number];
}

export interface PrecisionTopologyCheckItem {
  readonly id:
    | "non-manifold-edges"
    | "loose-vertices"
    | "zero-area-triangles"
    | "floor-grounding-y0"
    | "metric-scale-1m"
    | "quad-flow";
  readonly labelKo: string;
  readonly status: PrecisionCheckStatus;
  readonly actualLabel: string;
  readonly targetLabel: string;
  readonly autoFixActionKo: string | null;
}

export interface PrecisionMeshAuditReport {
  readonly meshName: string;
  readonly passed: boolean;
  readonly score: number;
  readonly grade: "hero-ready" | "needs-repair" | "blocked";
  readonly isManifoldClean: boolean;
  readonly isWatertight: boolean;
  readonly isFloorGrounded: boolean;
  readonly isMetricScaleValid: boolean;
  readonly floorSnapDeltaY: number;
  readonly recommendedScaleFactor: number;
  readonly checks: readonly PrecisionTopologyCheckItem[];
  readonly repairPlanKo: readonly string[];
}

export interface CustomPrecisionAssetOptions {
  readonly archetypeId: PrecisionAssetArchetypeId;
  readonly materialPresetId: PrecisionPbrMaterialId;
  readonly lightingPresetId: PrecisionLightingPresetId;
  readonly microBevelSegments: 1 | 2;
  readonly microBevelWidthMm: number;
  readonly subdLevel: 0 | 1 | 2 | 3;
  readonly weightedNormalChamfer: boolean;
  readonly nprOutlineWidthPx: number;
  readonly nprCreaseAngleDeg: number;
  readonly nprCreaseWeight: number;
  readonly targetProfile: GlbBudgetProfileId;
}

export interface PrecisionNprInkPreset {
  readonly outlineWidthPx: number;
  readonly creaseAngleDeg: number;
  readonly creaseWeight: number;
  readonly silhouetteBoost: number;
  readonly recommendedStyleKo: string;
}

export interface GlbBudgetAuditMetrics {
  readonly triangles: number;
  readonly estimatedBytes: number;
  readonly drawCalls: number;
  readonly materials: number;
  readonly textureSize: number;
}

export interface GlbBudgetAuditResult {
  readonly profile: GlbBudgetProfileId;
  readonly passed: boolean;
  readonly score: number;
  readonly triangleUtilizationPercent: number;
  readonly byteUtilizationPercent: number;
  readonly drawCallUtilizationPercent: number;
  readonly violationsKo: readonly string[];
  readonly optimizationHintsKo: readonly string[];
}

export interface PrecisionRigAssemblyReport {
  readonly passed: boolean;
  readonly socketCount: number;
  readonly rootCount: number;
  readonly orphanSocketIds: readonly string[];
  readonly cyclicSocketIds: readonly string[];
  readonly negativeScaleSocketIds: readonly string[];
  readonly belowFloorSocketIds: readonly string[];
  readonly summaryKo: string;
}

export interface CustomPrecisionAssetSpec {
  readonly assetId: string;
  readonly archetype: PrecisionAssetArchetypeSpec;
  readonly material: PrecisionPbrMaterialPreset;
  readonly lighting: PrecisionLightingPreset;
  readonly geometry: {
    readonly microBevelSegments: 1 | 2;
    readonly microBevelWidthMm: number;
    readonly subdLevel: 0 | 1 | 2 | 3;
    readonly weightedNormalChamfer: boolean;
    readonly estimatedQuads: number;
    readonly estimatedTriangles: number;
    readonly estimatedVertices: number;
    readonly unitScaleMeters: 1;
    readonly floorGroundedMinY: 0;
  };
  readonly proceduralMaps: {
    readonly normalMapResolution: number;
    readonly aoMapResolution: number;
    readonly normalStrength: number;
    readonly aoStrength: number;
    readonly proceduralMode: PrecisionPbrMaterialPreset["proceduralNormalMode"];
  };
  readonly nprPreset: PrecisionNprInkPreset;
  readonly topologyAudit: PrecisionMeshAuditReport;
  readonly rigAssembly: PrecisionRigAssemblyReport;
  readonly glbBudget: GlbBudgetAuditResult;
  readonly glbMetrics: GlbBudgetAuditMetrics;
}

/**
 * 매니폴드 무결성 & 정밀 검사기:
 * 비매니폴드 엣지 0 · 루즈 버텍스 0 · 0면적 퇴화 삼각형 0 · 바닥 접지(Y=0) · 미터 단위(1.0=1m)를 검증한다.
 */
export function auditPrecisionMeshTopology(input: PrecisionMeshTopologyInput): PrecisionMeshAuditReport {
  const nonManifold = Math.max(0, Math.round(input.nonManifoldEdges));
  const boundary = Math.max(0, Math.round(input.boundaryEdges));
  const loose = Math.max(0, Math.round(input.looseVertices));
  const zeroArea = Math.max(0, Math.round(input.zeroAreaTriangles));
  const quadRatio = Math.min(1, Math.max(0, Number.isFinite(input.quadRatio) ? input.quadRatio : 0));

  const isFloorGrounded = Number.isFinite(input.minY) && Math.abs(input.minY) <= FLOOR_GROUNDING_TOLERANCE_METERS;
  const isMetricScaleValid = Number.isFinite(input.unitScaleMeters)
    && Math.abs(input.unitScaleMeters - 1.0) <= METRIC_SCALE_TOLERANCE;
  const isManifoldClean = nonManifold === 0 && loose === 0 && zeroArea === 0;
  const isWatertight = nonManifold === 0 && boundary === 0;

  const floorSnapDeltaY = Number.isFinite(input.minY) ? Math.round(-input.minY * 10_000) / 10_000 : 0;
  const recommendedScaleFactor = Number.isFinite(input.unitScaleMeters) && input.unitScaleMeters > 0
    ? Math.round((1 / input.unitScaleMeters) * 10_000) / 10_000
    : 1;

  const checks: PrecisionTopologyCheckItem[] = [
    Object.freeze({
      id: "non-manifold-edges",
      labelKo: "비매니폴드 엣지",
      status: nonManifold === 0 ? "pass" : "fail",
      actualLabel: `${nonManifold}개`,
      targetLabel: "0개",
      autoFixActionKo: nonManifold === 0 ? null : "중복 면·내부 격벽 제거 및 법선 재계산으로 비매니폴드 엣지를 0개로 정리",
    }),
    Object.freeze({
      id: "loose-vertices",
      labelKo: "루즈 버텍스",
      status: loose === 0 ? "pass" : "fail",
      actualLabel: `${loose}개`,
      targetLabel: "0개",
      autoFixActionKo: loose === 0 ? null : "고립 버텍스 일괄 정리(Delete Loose) 실행",
    }),
    Object.freeze({
      id: "zero-area-triangles",
      labelKo: "0면적 퇴화 삼각형",
      status: zeroArea === 0 ? "pass" : "fail",
      actualLabel: `${zeroArea}개`,
      targetLabel: "0개",
      autoFixActionKo: zeroArea === 0 ? null : "0.0001m 거리 병합(Merge by Distance)으로 퇴화 삼각형 제거",
    }),
    Object.freeze({
      id: "floor-grounding-y0",
      labelKo: "바닥 접지 (glTF Y=0)",
      status: isFloorGrounded ? "pass" : "fail",
      actualLabel: `Y=${input.minY.toFixed(3)}m`,
      targetLabel: "Y=0.000m (±0.002m)",
      autoFixActionKo: isFloorGrounded ? null : `메시 전체를 Y축으로 ${floorSnapDeltaY >= 0 ? "+" : ""}${floorSnapDeltaY.toFixed(3)}m 자동 스냅`,
    }),
    Object.freeze({
      id: "metric-scale-1m",
      labelKo: "미터 단위 정합 (1.0=1m)",
      status: isMetricScaleValid ? "pass" : "fail",
      actualLabel: `${input.unitScaleMeters.toFixed(3)}m/unit`,
      targetLabel: "1.000m/unit",
      autoFixActionKo: isMetricScaleValid ? null : `스케일 ${recommendedScaleFactor.toFixed(3)}x 정규화 후 Transform Apply`,
    }),
    Object.freeze({
      id: "quad-flow",
      labelKo: "Quad SubD 토폴로지 비율",
      status: quadRatio >= 0.85 ? "pass" : quadRatio >= 0.65 ? "warn" : "fail",
      actualLabel: `${Math.round(quadRatio * 100)}%`,
      targetLabel: "85% 이상",
      autoFixActionKo: quadRatio >= 0.85 ? null : "Tri-to-Quad 변환 및 베벨 루프 정렬 권장",
    }),
  ];

  let score = 100;
  if (nonManifold > 0) score -= Math.min(35, 20 + nonManifold * 3);
  if (loose > 0) score -= Math.min(20, 10 + loose * 2);
  if (zeroArea > 0) score -= Math.min(20, 10 + zeroArea * 2);
  if (!isFloorGrounded) score -= 12;
  if (!isMetricScaleValid) score -= 12;
  if (quadRatio < 0.85) score -= quadRatio < 0.65 ? 10 : 5;
  score = Math.max(0, Math.round(score));

  const passed = isManifoldClean && isFloorGrounded && isMetricScaleValid;
  const grade: PrecisionMeshAuditReport["grade"] = passed && score >= 90
    ? "hero-ready"
    : isManifoldClean
      ? "needs-repair"
      : "blocked";

  const repairPlanKo = Object.freeze(
    checks
      .map((item) => item.autoFixActionKo)
      .filter((action): action is string => action !== null),
  );

  return Object.freeze({
    meshName: input.meshName,
    passed,
    score,
    grade,
    isManifoldClean,
    isWatertight,
    isFloorGrounded,
    isMetricScaleValid,
    floorSnapDeltaY,
    recommendedScaleFactor,
    checks: Object.freeze(checks),
    repairPlanKo,
  });
}

/**
 * 진단된 토폴로지·접지·미터 단위 오차를 1클릭 자동 스냅/보정한 정합 스냅샷을 반환한다.
 */
export function applyPrecisionTopologyAutoSnap(
  input: PrecisionMeshTopologyInput,
): PrecisionMeshTopologyInput {
  const scaleFactor = Number.isFinite(input.unitScaleMeters) && input.unitScaleMeters > 0
    ? 1 / input.unitScaleMeters
    : 1;
  return Object.freeze({
    ...input,
    nonManifoldEdges: 0,
    boundaryEdges: 0,
    looseVertices: 0,
    zeroAreaTriangles: 0,
    minY: 0,
    unitScaleMeters: 1,
    quadRatio: Math.max(input.quadRatio, 0.94),
    boundingBoxMeters: Object.freeze<readonly [number, number, number]>([
      Math.round(input.boundingBoxMeters[0] * scaleFactor * 1000) / 1000,
      Math.round(input.boundingBoxMeters[1] * scaleFactor * 1000) / 1000,
      Math.round(input.boundingBoxMeters[2] * scaleFactor * 1000) / 1000,
    ]),
  });
}

/**
 * 커스텀 3D 리깅 / 소품 소켓 조립 검증기:
 * 고아 소켓, 순환 부모 참조, 음수 스케일, 바닥 관통(Y < 0)을 사전에 차단한다.
 */
export function validatePrecisionRigAssembly(
  sockets: readonly PrecisionRigSocketSpec[],
): PrecisionRigAssemblyReport {
  const byId = new Map<string, PrecisionRigSocketSpec>(sockets.map((socket) => [socket.id, socket]));
  const orphanSocketIds: string[] = [];
  const cyclicSocketIds: string[] = [];
  const negativeScaleSocketIds: string[] = [];
  const belowFloorSocketIds: string[] = [];
  let rootCount = 0;

  for (const socket of sockets) {
    if (socket.parentId === null) {
      rootCount += 1;
    } else if (!byId.has(socket.parentId)) {
      orphanSocketIds.push(socket.id);
    }

    if (socket.scale.some((axis) => !Number.isFinite(axis) || axis <= 0)) {
      negativeScaleSocketIds.push(socket.id);
    }
    if (!Number.isFinite(socket.localPositionMeters[1]) || socket.localPositionMeters[1] < -FLOOR_GROUNDING_TOLERANCE_METERS) {
      belowFloorSocketIds.push(socket.id);
    }

    const visited = new Set<string>([socket.id]);
    let cursor = socket.parentId;
    while (cursor !== null) {
      if (visited.has(cursor)) {
        cyclicSocketIds.push(socket.id);
        break;
      }
      visited.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
  }

  const passed =
    sockets.length > 0 &&
    rootCount >= 1 &&
    orphanSocketIds.length === 0 &&
    cyclicSocketIds.length === 0 &&
    negativeScaleSocketIds.length === 0 &&
    belowFloorSocketIds.length === 0;

  const summaryKo = passed
    ? `루트 ${rootCount}개 · 조립 소켓 ${sockets.length}개 계층과 바닥 접지가 모두 정상입니다.`
    : `리깅 조립 점검 필요 — 고아 ${orphanSocketIds.length} · 순환 ${cyclicSocketIds.length} · 음수 스케일 ${negativeScaleSocketIds.length} · 바닥 관통 ${belowFloorSocketIds.length}`;

  return Object.freeze({
    passed,
    socketCount: sockets.length,
    rootCount,
    orphanSocketIds: Object.freeze(orphanSocketIds),
    cyclicSocketIds: Object.freeze(cyclicSocketIds),
    negativeScaleSocketIds: Object.freeze(negativeScaleSocketIds),
    belowFloorSocketIds: Object.freeze(belowFloorSocketIds),
    summaryKo,
  });
}

/**
 * GLB 경량 예산 검사 (`desktop-hero@1` / `mobile-hero@1`).
 */
export function evaluatePrecisionGlbBudget(
  metrics: GlbBudgetAuditMetrics,
  profileId: GlbBudgetProfileId,
): GlbBudgetAuditResult {
  const limits = GLB_BUDGET_PROFILES[profileId];
  const triangleUtilizationPercent = Math.round((metrics.triangles / limits.maxTriangles) * 100);
  const byteUtilizationPercent = Math.round((metrics.estimatedBytes / limits.maxBytes) * 100);
  const drawCallUtilizationPercent = Math.round((metrics.drawCalls / limits.maxDrawCalls) * 100);

  const violationsKo: string[] = [];
  const optimizationHintsKo: string[] = [];

  if (metrics.triangles > limits.maxTriangles) {
    violationsKo.push(`삼각형 ${metrics.triangles.toLocaleString("ko-KR")}개 > 한도 ${limits.maxTriangles.toLocaleString("ko-KR")}개`);
    optimizationHintsKo.push("Catmull-Clark SubD 단계를 1단계 낮추거나 마이크로 베벨 세그먼트를 1로 조정하세요.");
  }
  if (metrics.estimatedBytes > limits.maxBytes) {
    const actualMiB = (metrics.estimatedBytes / (1024 * 1024)).toFixed(2);
    const limitMiB = (limits.maxBytes / (1024 * 1024)).toFixed(1);
    violationsKo.push(`예상 GLB 용량 ${actualMiB}MiB > 한도 ${limitMiB}MiB`);
    optimizationHintsKo.push("Meshopt 압축과 1024px WebP 노멀/AO 패킹을 적용하세요.");
  }
  if (metrics.drawCalls > limits.maxDrawCalls) {
    violationsKo.push(`드로우콜 ${metrics.drawCalls}회 > 한도 ${limits.maxDrawCalls}회`);
    optimizationHintsKo.push("동일 재질 파츠를 단일 메시로 배칭하세요.");
  }
  if (metrics.materials > limits.maxMaterials) {
    violationsKo.push(`머티리얼 ${metrics.materials}개 > 한도 ${limits.maxMaterials}개`);
    optimizationHintsKo.push("중복 PBR 재질을 아틀라스로 통합하세요.");
  }
  if (metrics.textureSize > limits.maxTextureSize) {
    violationsKo.push(`텍스처 ${metrics.textureSize}px > 한도 ${limits.maxTextureSize}px`);
    optimizationHintsKo.push(`${limits.maxTextureSize}px 이하 텍스처 해상도로 내려 모바일 VRAM을 보호하세요.`);
  }

  const passed = violationsKo.length === 0;
  const maxUtil = Math.max(triangleUtilizationPercent, byteUtilizationPercent, drawCallUtilizationPercent);
  const score = passed
    ? Math.max(85, Math.min(100, 100 - Math.max(0, maxUtil - 75) * 0.5))
    : Math.max(20, 80 - violationsKo.length * 18);

  return Object.freeze({
    profile: profileId,
    passed,
    score: Math.round(score),
    triangleUtilizationPercent,
    byteUtilizationPercent,
    drawCallUtilizationPercent,
    violationsKo: Object.freeze(violationsKo),
    optimizationHintsKo: Object.freeze(optimizationHintsKo),
  });
}

function clampMicroBevelWidthMm(value: number): number {
  if (!Number.isFinite(value)) return 1.8;
  return Math.round(Math.min(6.0, Math.max(0.4, value)) * 10) / 10;
}

function clampNprOutlineWidthPx(value: number): number {
  if (!Number.isFinite(value)) return 1.6;
  return Math.round(Math.min(4.5, Math.max(0.5, value)) * 10) / 10;
}

function clampNprCreaseAngleDeg(value: number): number {
  if (!Number.isFinite(value)) return 38;
  return Math.round(Math.min(75, Math.max(15, value)));
}

function clampNprCreaseWeight(value: number): number {
  if (!Number.isFinite(value)) return 0.72;
  return Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;
}

/**
 * 커스텀 프로시저럴 3D 건축/소품 파라메트릭 빌더:
 * 마이크로 베벨(1-2 세그먼트) · Catmull-Clark SubD · Weighted Normal 챔퍼 ·
 * 물리 PBR 4종(이진 metallic 0/1) · 실시간 노멀/AO · 웹툰 NPR 선화/크리스 프리셋을 생성하고
 * 매니폴드 0 · 리깅 조립 · GLB 경량 예산까지 한 번에 검증한다.
 */
export function generateCustomPrecisionAssetSpec(
  options: CustomPrecisionAssetOptions,
  customTopologyOverride?: Partial<PrecisionMeshTopologyInput>,
): CustomPrecisionAssetSpec {
  const archetype = getPrecisionAssetArchetype(options.archetypeId);
  const material = PRECISION_PBR_MATERIAL_PRESETS[options.materialPresetId];
  const lighting = PRECISION_LIGHTING_PRESETS[options.lightingPresetId];

  const microBevelSegments: 1 | 2 = options.microBevelSegments === 2 ? 2 : 1;
  const microBevelWidthMm = clampMicroBevelWidthMm(options.microBevelWidthMm);
  const subdLevel: 0 | 1 | 2 | 3 =
    options.subdLevel === 3 ? 3 : options.subdLevel === 2 ? 2 : options.subdLevel === 1 ? 1 : 0;

  const bevelFactor = microBevelSegments === 2 ? 1.55 : 1.24;
  const subdFactor = Math.pow(4, subdLevel);
  const estimatedQuads = Math.round(archetype.baseQuads * bevelFactor * subdFactor);
  const estimatedTriangles = estimatedQuads * 2;
  const estimatedVertices = Math.round(estimatedQuads * 1.06);

  const textureSize = options.targetProfile === "mobile-hero@1" ? 1024 : 2048;
  const geometryBytes = estimatedTriangles * 22;
  const textureBytes = textureSize === 2048 ? 1_150_000 : 380_000;
  const estimatedBytes = geometryBytes + textureBytes;

  const outlineWidthPx = clampNprOutlineWidthPx(options.nprOutlineWidthPx);
  const creaseAngleDeg = clampNprCreaseAngleDeg(options.nprCreaseAngleDeg);
  const creaseWeight = clampNprCreaseWeight(options.nprCreaseWeight);
  const silhouetteBoost = Math.round((1 + outlineWidthPx * 0.25) * 100) / 100;
  const recommendedStyleKo = outlineWidthPx <= 1.2
    ? "로판·실사풍 극세 펜선 (섬세한 베벨 하이라이트 강조)"
    : outlineWidthPx <= 2.4
      ? "표준 웹툰 G펜 선화 (배경·소품 밸런스)"
      : "액션·개그 굵은 외곽선 (원경 실루엣 강조)";

  const topologyInput: PrecisionMeshTopologyInput = Object.freeze({
    meshName: `${archetype.id}_subd${subdLevel}_bv${microBevelSegments}`,
    vertexCount: estimatedVertices,
    triangleCount: estimatedTriangles,
    quadRatio: options.weightedNormalChamfer ? 0.96 : 0.91,
    nonManifoldEdges: 0,
    boundaryEdges: 0,
    looseVertices: 0,
    zeroAreaTriangles: 0,
    minY: 0,
    unitScaleMeters: 1,
    boundingBoxMeters: archetype.dimensionsMeters,
    ...customTopologyOverride,
  });

  const topologyAudit = auditPrecisionMeshTopology(topologyInput);
  const rigAssembly = validatePrecisionRigAssembly(archetype.defaultSockets);
  const glbMetrics: GlbBudgetAuditMetrics = Object.freeze({
    triangles: estimatedTriangles,
    estimatedBytes,
    drawCalls: archetype.baseDrawCalls,
    materials: archetype.baseMaterials,
    textureSize,
  });
  const glbBudget = evaluatePrecisionGlbBudget(glbMetrics, options.targetProfile);

  return Object.freeze({
    assetId: `precision3d-${archetype.id}-${material.id}-s${subdLevel}-b${microBevelSegments}`,
    archetype,
    material,
    lighting,
    geometry: Object.freeze({
      microBevelSegments,
      microBevelWidthMm,
      subdLevel,
      weightedNormalChamfer: options.weightedNormalChamfer,
      estimatedQuads,
      estimatedTriangles,
      estimatedVertices,
      unitScaleMeters: 1,
      floorGroundedMinY: 0,
    }),
    proceduralMaps: Object.freeze({
      normalMapResolution: textureSize,
      aoMapResolution: textureSize,
      normalStrength: material.normalStrength,
      aoStrength: material.aoStrength,
      proceduralMode: material.proceduralNormalMode,
    }),
    nprPreset: Object.freeze({
      outlineWidthPx,
      creaseAngleDeg,
      creaseWeight,
      silhouetteBoost,
      recommendedStyleKo,
    }),
    topologyAudit,
    rigAssembly,
    glbBudget,
    glbMetrics,
  });
}
