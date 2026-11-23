/**
 * 42-소켓 VRM 본 자동 스냅 · Anti-Clip 자연 밀착 엔진 및
 * 웹툰 특화 3D 캐릭터·배경·소품 3층 분리 출력 생성 파이프라인 스펙.
 *
 * 순수 계산 커널로 브라우저 스토리지나 네트워크에 직접 접근하지 않는다.
 */

import {
  ANTI_CLIP_OFFSET_RANGE_MM,
  VRM_AUTO_FIT_SOCKETS,
  VRM_AUTO_FIT_SOCKET_COUNT,
  VRM_SOCKET_GROUP_LABELS,
  type ItemAutoFitCategory,
  type Vec3Meters,
  type VrmAutoFitSocketSpec,
  type VrmSocketGroupId,
} from "./vrm-autofit-socket-registry";

export {
  ANTI_CLIP_OFFSET_RANGE_MM,
  VRM_AUTO_FIT_SOCKETS,
  VRM_AUTO_FIT_SOCKET_COUNT,
  VRM_SOCKET_GROUP_LABELS,
  type ItemAutoFitCategory,
  type Vec3Meters,
  type VrmAutoFitSocketSpec,
  type VrmSocketGroupId,
};

export type ItemRigidity = "rigid" | "semi-flexible" | "soft-cloth";

export interface CharacterBodyMetrics {
  readonly heightCm: number;
  readonly shoulderWidthRatio: number;
  readonly torsoDepthRatio: number;
  readonly limbThicknessRatio: number;
  readonly clothLayerThicknessMm: number;
  readonly poseBendDeg: number;
}

export interface CharacterItemAutoFitInput {
  readonly socketId?: string;
  readonly socketGroup?: VrmSocketGroupId;
  readonly itemNameKo: string;
  readonly itemCategory: ItemAutoFitCategory;
  readonly rigidity: ItemRigidity;
  readonly body: CharacterBodyMetrics;
  readonly userAntiClipOffsetMm?: number;
  readonly userCurveWrapStrength?: number;
  readonly userScaleMultiplier?: number;
}

export interface BoneWeightBinding {
  readonly boneName: string;
  readonly weight: number;
  readonly role: "primary" | "blend" | "secondary-spring";
}

export interface BoneWeightTransferPreview {
  readonly socketId: string;
  readonly primaryBone: string;
  readonly maxInfluencesPerVertex: number;
  readonly bindings: readonly BoneWeightBinding[];
  readonly totalWeight: number;
  readonly springSecondaryMotion: boolean;
  readonly summaryKo: string;
}

export interface CurveWrapDeformation {
  readonly axis: "horizontal-arc" | "vertical-arc" | "cylindrical";
  readonly wrapAngleDeg: number;
  readonly conformStrength: number;
  readonly bendRadiusMm: number;
}

export interface AutoFitCorrectionPatch {
  readonly antiClipOffsetMm: number;
  readonly curveWrapStrength: number;
  readonly scaleMultiplier: number;
}

export interface CharacterItemAutoFitResult {
  readonly socket: VrmAutoFitSocketSpec;
  readonly snappedPositionM: Vec3Meters;
  readonly cageScale: Vec3Meters;
  readonly curveWrap: CurveWrapDeformation;
  readonly minimumSafeOffsetMm: number;
  readonly antiClipOffsetMm: number;
  readonly penetrationRiskMm: number;
  readonly surfaceGapMm: number;
  readonly isSkinSafe: boolean;
  readonly weightTransfer: BoneWeightTransferPreview;
  readonly fitConfidenceScore: number;
  readonly fitGrade: "seamless" | "good" | "needs-tweak" | "clip-risk";
  readonly diagnosticsKo: readonly string[];
  readonly autoCorrectionsKo: readonly string[];
  readonly suggestedPatch: AutoFitCorrectionPatch;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function resolveAutoFitSocket(
  socketId?: string,
  socketGroup?: VrmSocketGroupId,
): VrmAutoFitSocketSpec {
  if (socketId) {
    const exact = VRM_AUTO_FIT_SOCKETS.find((entry) => entry.id === socketId);
    if (exact) return exact;
  }
  if (socketGroup) {
    const grouped = VRM_AUTO_FIT_SOCKETS.find((entry) => entry.group === socketGroup);
    if (grouped) return grouped;
  }
  return VRM_AUTO_FIT_SOCKETS[2];
}

/**
 * VRM 4본 스킨 웨이트 자동 전사 미리보기.
 * 모든 바인딩 가중치 합계는 정확히 1.000이며 정점당 최대 4본 규칙을 지킨다.
 */
export function transferBoneWeightsPreview(
  socketId: string,
  rigidity: ItemRigidity,
  influenceRadiusCm = 12,
): BoneWeightTransferPreview {
  const socket = resolveAutoFitSocket(socketId);
  const clampedRadius = clamp(influenceRadiusCm, 2, 40);

  if (rigidity === "rigid" || socket.neighborBones.length === 0) {
    return {
      socketId: socket.id,
      primaryBone: socket.vrmBone,
      maxInfluencesPerVertex: 1,
      bindings: [{ boneName: socket.vrmBone, weight: 1, role: "primary" }],
      totalWeight: 1,
      springSecondaryMotion: false,
      summaryKo: `${socket.vrmBone} 단일 본 100% 강체 고정 (형태 왜곡 0%)`,
    };
  }

  const neighbors = socket.neighborBones.slice(0, 3);
  const neighborShareBase = rigidity === "soft-cloth" ? 0.42 : 0.24;
  const radiusFactor = clamp(clampedRadius / 16, 0.65, 1.15);
  const neighborBudget = clamp(round3(neighborShareBase * radiusFactor), 0.12, 0.52);

  const weightsRaw = neighbors.map((_, index) => 1 / (index + 1));
  const rawSum = weightsRaw.reduce((sum, entry) => sum + entry, 0);

  const neighborBindings: BoneWeightBinding[] = neighbors.map((boneName, index) => ({
    boneName,
    weight: round3((neighborBudget * weightsRaw[index]) / rawSum),
    role:
      rigidity === "soft-cloth" && index === neighbors.length - 1
        ? "secondary-spring"
        : "blend",
  }));

  const assignedNeighborSum = neighborBindings.reduce((sum, entry) => sum + entry.weight, 0);
  const primaryWeight = round3(1 - assignedNeighborSum);
  const bindings: BoneWeightBinding[] = [
    { boneName: socket.vrmBone, weight: primaryWeight, role: "primary" },
    ...neighborBindings,
  ];

  return {
    socketId: socket.id,
    primaryBone: socket.vrmBone,
    maxInfluencesPerVertex: Math.min(4, bindings.length),
    bindings,
    totalWeight: round3(bindings.reduce((sum, entry) => sum + entry.weight, 0)),
    springSecondaryMotion: rigidity === "soft-cloth",
    summaryKo:
      rigidity === "soft-cloth"
        ? `${socket.vrmBone}(${Math.round(primaryWeight * 100)}%) + 인접 ${neighbors.length}본 유연 전사 · SpringBone 흔들림 연동`
        : `${socket.vrmBone}(${Math.round(primaryWeight * 100)}%) + 인접 ${neighbors.length}본 관절 추종 전사`,
  };
}

/**
 * 42-소켓 VRM 본 자동 스냅 & Anti-Clip 밀착 계산기.
 * 체형 스케일 연동 케이지 변형, 피부 뚫림 방지 최소 오프셋(1.5~3.0mm),
 * 스킨 웨이트 자동 전사, 어색함 위험도 점수 및 원클릭 보정 패치를 산출한다.
 */
export function computeCharacterItemAutoFit(
  input: CharacterItemAutoFitInput,
): CharacterItemAutoFitResult {
  const socket = resolveAutoFitSocket(input.socketId, input.socketGroup);
  const heightFactor = clamp(input.body.heightCm / 168, 0.72, 1.32);
  const shoulderFactor = clamp(input.body.shoulderWidthRatio, 0.75, 1.35);
  const depthFactor = clamp(input.body.torsoDepthRatio, 0.75, 1.35);
  const limbFactor = clamp(input.body.limbThicknessRatio, 0.75, 1.35);
  const clothMm = clamp(input.body.clothLayerThicknessMm, 0, 8);
  const bendDeg = clamp(input.body.poseBendDeg, 0, 110);
  const scaleMul = clamp(input.userScaleMultiplier ?? 1, 0.65, 1.5);

  const dynamicSafetyExtra = clothMm * 0.14 + (bendDeg / 90) * 0.45;
  const minimumSafeOffsetMm = round1(
    clamp(
      socket.defaultAntiClipOffsetMm + dynamicSafetyExtra,
      ANTI_CLIP_OFFSET_RANGE_MM.min,
      ANTI_CLIP_OFFSET_RANGE_MM.max,
    ),
  );
  const antiClipOffsetMm = round1(
    clamp(input.userAntiClipOffsetMm ?? minimumSafeOffsetMm, 0, 8),
  );
  const penetrationRiskMm = round1(Math.max(0, minimumSafeOffsetMm - antiClipOffsetMm));
  const surfaceGapMm = round1(Math.max(0, antiClipOffsetMm - minimumSafeOffsetMm));
  const isSkinSafe = penetrationRiskMm === 0;

  const isTorsoGroup =
    socket.group === "chest" || socket.group === "hips" || socket.group === "back";
  const isLimbGroup =
    socket.group === "leftHand" || socket.group === "rightHand" || socket.group === "feet";

  const baseScaleX = isTorsoGroup ? shoulderFactor : isLimbGroup ? limbFactor : heightFactor;
  const baseScaleZ = isTorsoGroup ? depthFactor : isLimbGroup ? limbFactor : heightFactor;
  const clothScaleBoost = 1 + clothMm * 0.006;

  const cageScale: Vec3Meters = {
    x: round3(baseScaleX * clothScaleBoost * scaleMul),
    y: round3(heightFactor * scaleMul),
    z: round3(baseScaleZ * clothScaleBoost * scaleMul),
  };

  const defaultWrap =
    input.rigidity === "rigid" ? 0.18 : input.rigidity === "semi-flexible" ? 0.64 : 0.88;
  const conformStrength = round3(clamp(input.userCurveWrapStrength ?? defaultWrap, 0, 1));
  const wrapAxis: CurveWrapDeformation["axis"] = isLimbGroup
    ? "cylindrical"
    : socket.group === "back"
      ? "vertical-arc"
      : "horizontal-arc";
  const bendRadiusMm = round1(
    socket.curvatureRadiusMm * ((cageScale.x + cageScale.z) / 2) + antiClipOffsetMm,
  );
  const wrapAngleDeg = round1(
    clamp(conformStrength * (wrapAxis === "cylindrical" ? 210 : 115), 8, 220),
  );

  const curveWrap: CurveWrapDeformation = {
    axis: wrapAxis,
    wrapAngleDeg,
    conformStrength,
    bendRadiusMm,
  };

  const offsetM = antiClipOffsetMm / 1000;
  const snappedPositionM: Vec3Meters = {
    x: round3(socket.localOffsetM.x * cageScale.x + socket.surfaceNormal.x * offsetM),
    y: round3(socket.localOffsetM.y * cageScale.y + socket.surfaceNormal.y * offsetM),
    z: round3(socket.localOffsetM.z * cageScale.z + socket.surfaceNormal.z * offsetM),
  };

  const weightTransfer = transferBoneWeightsPreview(
    socket.id,
    input.rigidity,
    isTorsoGroup ? 16 : 10,
  );

  let score = 98;
  const diagnosticsKo: string[] = [];
  const autoCorrectionsKo: string[] = [];

  if (penetrationRiskMm > 0) {
    score -= Math.min(48, Math.round(penetrationRiskMm * 28));
    diagnosticsKo.push(
      `피부 뚫림(클리핑) 위험 ${penetrationRiskMm}mm 감지 — 현재 오프셋 ${antiClipOffsetMm}mm가 최소 안전치 ${minimumSafeOffsetMm}mm 미만입니다.`,
    );
    autoCorrectionsKo.push(
      `Anti-Clip 오프셋을 ${minimumSafeOffsetMm}mm로 자동 상향해 피부·의상 관통을 차단하세요.`,
    );
  } else {
    diagnosticsKo.push(
      `Anti-Clip 밀착 안전 통과 (${antiClipOffsetMm}mm ≥ 최소 ${minimumSafeOffsetMm}mm).`,
    );
  }

  if (antiClipOffsetMm > ANTI_CLIP_OFFSET_RANGE_MM.floatingWarnThresholdMm) {
    const excess = antiClipOffsetMm - ANTI_CLIP_OFFSET_RANGE_MM.floatingWarnThresholdMm;
    score -= Math.min(28, Math.round(excess * 11));
    diagnosticsKo.push(`아이템 들뜸 현상 우려 (+${surfaceGapMm}mm) — 공중에 떠 보일 수 있습니다.`);
    autoCorrectionsKo.push(`오프셋을 ${minimumSafeOffsetMm}mm로 낮춰 표면에 자연스럽게 안착시키세요.`);
  }

  const scaleDeviation = Math.abs(scaleMul - 1);
  if (scaleDeviation > 0.22) {
    score -= Math.min(20, Math.round((scaleDeviation - 0.22) * 45));
    diagnosticsKo.push(`사용자 배율(${Math.round(scaleMul * 100)}%)이 체형 케이지 비율과 벌어졌습니다.`);
    autoCorrectionsKo.push("체형 연동 케이지 배율을 100%로 정규화하세요.");
  }

  if (bendDeg >= 55 && input.rigidity === "rigid" && isTorsoGroup) {
    score -= 14;
    diagnosticsKo.push(`관절 굽힘 ${bendDeg}°에서 강체(rigid) 바인딩은 상체 모서리 들뜸을 유발할 수 있습니다.`);
    autoCorrectionsKo.push("반유연(semi-flexible) 3본 스킨 웨이트 전사로 전환을 권장합니다.");
  }

  if (conformStrength < 0.35 && input.rigidity !== "rigid") {
    score -= 10;
    diagnosticsKo.push("곡면 감싸기(curveWrap) 강도가 낮아 모서리가 몸체 바깥으로 뜰 수 있습니다.");
    autoCorrectionsKo.push(`곡면 감싸기를 ${Math.round(defaultWrap * 100)}%로 상향하세요.`);
  }

  if (autoCorrectionsKo.length === 0) {
    autoCorrectionsKo.push("현재 본 스냅·케이지·Anti-Clip 설정이 최적 밀착 범위 안에 있습니다.");
  }

  const fitConfidenceScore = clamp(Math.round(score), 15, 100);
  const fitGrade: CharacterItemAutoFitResult["fitGrade"] =
    penetrationRiskMm > 0
      ? "clip-risk"
      : fitConfidenceScore >= 88
        ? "seamless"
        : fitConfidenceScore >= 72
          ? "good"
          : "needs-tweak";

  return {
    socket,
    snappedPositionM,
    cageScale,
    curveWrap,
    minimumSafeOffsetMm,
    antiClipOffsetMm,
    penetrationRiskMm,
    surfaceGapMm,
    isSkinSafe,
    weightTransfer,
    fitConfidenceScore,
    fitGrade,
    diagnosticsKo,
    autoCorrectionsKo,
    suggestedPatch: {
      antiClipOffsetMm: minimumSafeOffsetMm,
      curveWrapStrength: defaultWrap,
      scaleMultiplier: 1,
    },
  };
}

// ---------------------------------------------------------------------------
// 웹툰 특화 3D 캐릭터 · 배경 · 소품 생성 파이프라인 스펙
// ---------------------------------------------------------------------------

export type Webtoon3dAssetKind = "character" | "background" | "prop";
export type Webtoon3dInputSource = "text-prompt" | "single-sketch" | "orthographic-sheet";

export interface Webtoon3dGenPipelineInput {
  readonly assetKind: Webtoon3dAssetKind;
  readonly assetTitleKo: string;
  readonly inputSource: Webtoon3dInputSource;
  readonly celBands?: 2 | 3 | 4;
  readonly includeVrm52Blendshapes?: boolean;
  readonly targetPlatform?: "desktop-hero" | "mobile-hero";
}

export interface Webtoon3dPipelineStage {
  readonly id:
    | "input-normalization"
    | "multiview-consistency"
    | "manifold-quad-remesh"
    | "webtoon-cel-shader-3layer"
    | "vrm-52-blendshape-rigging";
  readonly stepNumber: number;
  readonly titleKo: string;
  readonly summaryKo: string;
  readonly qualityGateKo: string;
}

export interface Webtoon3dThreeLayerOutputSpec {
  readonly id: "lineart" | "shading" | "material-id-mask";
  readonly labelKo: string;
  readonly blendMode: "normal" | "multiply" | "mask-index";
  readonly purposeKo: string;
}

export interface Webtoon3dGenPipelinePlan {
  readonly assetKind: Webtoon3dAssetKind;
  readonly assetTitleKo: string;
  readonly inputSource: Webtoon3dInputSource;
  readonly celBands: 2 | 3 | 4;
  readonly multiviewAnglesCount: number;
  readonly topologyContract: {
    readonly nonManifoldEdges: 0;
    readonly looseVertices: 0;
    readonly degenerateTriangles: 0;
    readonly floorGroundedY: 0;
    readonly metricUnitScale: 1.0;
    readonly quadRatioMinPct: number;
    readonly triangleBudgetMax: number;
  };
  readonly threeLayerOutputs: readonly Webtoon3dThreeLayerOutputSpec[];
  readonly riggingContract: {
    readonly vrmHumanoidEnabled: boolean;
    readonly blendshapeCount: number;
    readonly autoFitSocketCount: number;
    readonly expressionGroupsKo: readonly string[];
  };
  readonly stages: readonly Webtoon3dPipelineStage[];
  readonly executionBoundaryNoteKo: string;
}

/**
 * 텍스트·스케치 1장 → 멀티뷰 정합 → 매니폴드 쿼드 리메시(비매니폴드 0) →
 * 웹툰 3단 셀 셰이더 + 3층 분리 출력(선화/음영/재질 ID 마스크) →
 * VRM 52 블렌드셰입 리깅 워크플로우 스펙을 생성한다.
 */
export function buildWebtoon3dGenPipelinePlan(
  input: Webtoon3dGenPipelineInput,
): Webtoon3dGenPipelinePlan {
  const celBands = input.celBands ?? 3;
  const targetPlatform = input.targetPlatform ?? "desktop-hero";
  const isCharacter = input.assetKind === "character";
  const includeVrm52 = isCharacter ? (input.includeVrm52Blendshapes ?? true) : false;

  const multiviewAnglesCount =
    input.inputSource === "orthographic-sheet" ? 4 : input.assetKind === "background" ? 8 : 6;
  const triangleBudgetMax =
    targetPlatform === "mobile-hero"
      ? input.assetKind === "background"
        ? 45_000
        : 22_000
      : input.assetKind === "background"
        ? 120_000
        : 52_000;

  const threeLayerOutputs: readonly Webtoon3dThreeLayerOutputSpec[] = [
    {
      id: "lineart",
      labelKo: "선화 (Lineart)",
      blendMode: "normal",
      purposeKo: "노멀·깊이 기반 웹툰 외곽선 및 크리즈 선화 패스 (투명 배경 분리)",
    },
    {
      id: "shading",
      labelKo: "음영 (Cel Shading)",
      blendMode: "multiply",
      purposeKo: `웹툰 ${celBands}단 셀 셰이더 명암 · 림라이트 · 접촉 그림자 분리 패스`,
    },
    {
      id: "material-id-mask",
      labelKo: "재질 ID 마스크 (Material ID Mask)",
      blendMode: "mask-index",
      purposeKo: "피부·의상·금속·소품별 평탄 색분할 마스크로 1클릭 올가미·채색 지원",
    },
  ];

  const stages: readonly Webtoon3dPipelineStage[] = [
    {
      id: "input-normalization",
      stepNumber: 1,
      titleKo: "입력 정규화 (텍스트 / 스케치 1장)",
      summaryKo:
        input.inputSource === "text-prompt"
          ? "프롬프트에서 장르 비율·실루엣·주요 재질 키워드를 구조화합니다."
          : "단일 스케치의 투시 왜곡을 보정하고 배경을 분리해 기준 실루엣을 추출합니다.",
      qualityGateKo: "실루엣 알파 경계 선명도 및 스케일 기준(1.0 = 1m) 고정",
    },
    {
      id: "multiview-consistency",
      stepNumber: 2,
      titleKo: `멀티뷰 정합 (${multiviewAnglesCount}시점 일관성)`,
      summaryKo: "정면·측면·후면·3/4 앵글 간 비율·의상 주름·소품 위치를 교차 검증합니다.",
      qualityGateKo: "시점 간 실루엣 오차 ≤ 2.5% 및 대칭 축 정렬",
    },
    {
      id: "manifold-quad-remesh",
      stepNumber: 3,
      titleKo: "매니폴드 쿼드 리메시 (비매니폴드 0)",
      summaryKo: "셀 셰이더·변형에 강한 쿼드 토폴로지로 재구성하고 바닥면(Y=0)에 접지합니다.",
      qualityGateKo: `비매니폴드 0 · 루즈 버텍스 0 · 0면적 삼각형 0 · 쿼드 ≥ 92% · ≤ ${triangleBudgetMax.toLocaleString("en-US")} tris`,
    },
    {
      id: "webtoon-cel-shader-3layer",
      stepNumber: 4,
      titleKo: `웹툰 ${celBands}단 셀 셰이더 + 3층 분리 출력`,
      summaryKo: "하이라이트·미드톤·그림자 램프와 선화 / 음영 / 재질 ID 마스크 3개 레이어를 동시 출력합니다.",
      qualityGateKo: "3층 패스 정렬 오차 0px · 2D 컷 레이어 스택 즉시 삽입 호환",
    },
    {
      id: "vrm-52-blendshape-rigging",
      stepNumber: 5,
      titleKo: includeVrm52
        ? "VRM 52 블렌드셰입 & 42-소켓 리깅"
        : "42-소켓 앵커 · 콜라이더 바인딩",
      summaryKo: includeVrm52
        ? "VRM 1.0 휴머노이드 본과 ARKit/VRM 52종 표정 블렌드셰입·42-소켓 자연 밀착 앵커를 자동 바인딩합니다."
        : "소품/배경의 부착 피벗·Anti-Clip 표면 법선·광원/카메라 앵커를 자동 등록합니다.",
      qualityGateKo: includeVrm52
        ? "VRM 52 블렌드셰입 검증 + 42개 본 소켓 스냅 테스트 통과"
        : "피벗 Y=0 접지 + Anti-Clip 1.5~3.0mm 법선 검증 통과",
    },
  ];

  return {
    assetKind: input.assetKind,
    assetTitleKo: input.assetTitleKo,
    inputSource: input.inputSource,
    celBands,
    multiviewAnglesCount,
    topologyContract: {
      nonManifoldEdges: 0,
      looseVertices: 0,
      degenerateTriangles: 0,
      floorGroundedY: 0,
      metricUnitScale: 1.0,
      quadRatioMinPct: 92,
      triangleBudgetMax,
    },
    threeLayerOutputs,
    riggingContract: {
      vrmHumanoidEnabled: isCharacter,
      blendshapeCount: includeVrm52 ? 52 : 0,
      autoFitSocketCount: VRM_AUTO_FIT_SOCKET_COUNT,
      expressionGroupsKo: includeVrm52
        ? [
            "감정 6종(기쁨·분노·슬픔·놀람·평온·당황)",
            "립싱크 모음(아·이·우·에·오)",
            "눈 깜빡임·시선·눈썹 세부 41종",
          ]
        : ["소품 부착 피벗·법선 앵커"],
    },
    stages,
    executionBoundaryNoteKo:
      "현재 단계는 파이프라인 설계·품질 게이트 규격 검증 모드이며, 실제 생성 추론은 연결된 3D 생성 어댑터에서 실행됩니다.",
  };
}
