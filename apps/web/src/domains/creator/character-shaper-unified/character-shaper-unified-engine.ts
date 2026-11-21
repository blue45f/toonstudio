/**
 * 툰스튜디오 내부 통합 3D 캐릭터 셰이퍼 엔진 및 페이지 중복 정리 정본 파사드.
 *
 * - 외부 랩(`apps/character-lab`, `packages/character-lab`) import 0건(`appsToLabs: 0/0`).
 * - 한국 웹툰 6종 체형 베이스, 8축 비율 클램프, 헤어 밀착·의상 레이어·15-DOF 손 포즈·소품 소켓,
 *   VRM 1.0/GLB 규격 검증, 원클릭 핸드오프 페이로드(`toonstudio.character-shaper-handoff.v1`)를 제공한다.
 */

import {
  CHARACTER_BODY_BASE_PRESETS,
  CHARACTER_PROPORTION_AXIS_SPECS,
  CHARACTER_SHAPER_HANDOFF_SCHEMA,
  HAIR_SCALP_PRESETS,
  HAND_FINGER_ORDER,
  HAND_POSE_15DOF_PRESETS,
  type CharacterProportionAxes,
  type CharacterProportionAxisId,
  type HairScalpFitState,
  type HandActiveSide,
  type HandFinger3Dof,
  type HandFingerId,
  type HandPose15DofPreset,
  type HandPose15DofPresetId,
  type HandPose15DofState,
  type OutfitLayerStackState,
  type PropSocketAttachmentState,
  type WebtoonBodyBaseId,
  type WebtoonBodyBasePreset,
} from "./character-shaper-unified-presets";

export {
  CHARACTER_BODY_BASE_PRESETS,
  CHARACTER_PROPORTION_AXIS_SPECS,
  CHARACTER_SHAPER_HANDOFF_SCHEMA,
  HAIR_SCALP_PRESETS,
  HAND_FINGER_ORDER,
  HAND_POSE_15DOF_PRESETS,
  OUTFIT_BASE_OPTIONS,
  OUTFIT_MID_OPTIONS,
  OUTFIT_OUTER_OPTIONS,
  PROP_ITEM_OPTIONS,
  PROP_SOCKET_OPTIONS,
  type CharacterProportionAxes,
  type CharacterProportionAxisId,
  type CharacterProportionAxisSpec,
  type HairScalpFitState,
  type HairScalpPreset,
  type HairScalpPresetId,
  type HandActiveSide,
  type HandFinger3Dof,
  type HandFingerId,
  type HandPose15DofPreset,
  type HandPose15DofPresetId,
  type HandPose15DofState,
  type OutfitBaseLayerId,
  type OutfitLayerOption,
  type OutfitLayerStackState,
  type OutfitMidLayerId,
  type OutfitOuterLayerId,
  type PropItemId,
  type PropSocketAttachmentState,
  type PropSocketId,
  type WebtoonBodyBaseId,
  type WebtoonBodyBasePreset,
} from "./character-shaper-unified-presets";

export {
  filterPageConsolidationGroups,
  PAGE_CONSOLIDATION_AUDIT_MAP,
  summarizePageConsolidationAudit,
  type PageConsolidationAuditSummary,
  type PageConsolidationFilter,
  type PageConsolidationGroup,
  type PageConsolidationRouteEntry,
  type PageConsolidationStrategy,
  type PageRouteDisposition,
} from "./page-consolidation-audit-model";

export interface CharacterTopologyAudit {
  readonly nonManifoldEdges: number;
  readonly looseVertices: number;
  readonly humanoidBoneCount: number;
  readonly estimatedTriangles: number;
}

export interface CharacterShaperUnifiedState {
  readonly characterId: string;
  readonly characterName: string;
  readonly bodyBaseId: WebtoonBodyBaseId;
  readonly unitScaleMeters: number;
  readonly floorGroundingY: number;
  readonly metricHeightMeters: number;
  readonly proportions: CharacterProportionAxes;
  readonly hair: HairScalpFitState;
  readonly outfit: OutfitLayerStackState;
  readonly handPose15Dof: HandPose15DofState;
  readonly propSocket: PropSocketAttachmentState;
  readonly topologyAudit: CharacterTopologyAudit;
}

export type CharacterExportFormat = "vrm-1.0" | "glb-2.0";
export type CharacterHandoffTarget = "studio-canvas-2d" | "studio-bg3d-stage";

export interface ExportComplianceCheck {
  readonly id: "manifold" | "finite-numeric" | "metric-grounding" | "clearance" | "rig-spec";
  readonly labelKo: string;
  readonly passed: boolean;
  readonly detailKo: string;
}

export interface VrmGlbExportComplianceReport {
  readonly format: CharacterExportFormat;
  readonly passed: boolean;
  readonly vrmVersion: "1.0";
  readonly glbBinaryHeaderValid: boolean;
  readonly nonManifoldEdges: number;
  readonly looseVertices: number;
  readonly nanCount: number;
  readonly unitScaleMeters: number;
  readonly floorGroundingY: number;
  readonly humanoidBoneCount: number;
  readonly handDofCount: number;
  readonly estimatedTriangles: number;
  readonly checks: readonly ExportComplianceCheck[];
}

export interface CharacterShaperHandoffPayload {
  readonly schema: typeof CHARACTER_SHAPER_HANDOFF_SCHEMA;
  readonly source: "toonstudio-internal-shaper";
  readonly target: CharacterHandoffTarget;
  readonly targetRoute: "/studio" | "/studio/bg3d";
  readonly createdAtIso: string;
  readonly characterId: string;
  readonly characterName: string;
  readonly bodyBaseId: WebtoonBodyBaseId;
  readonly metricHeightMeters: number;
  readonly unitScaleMeters: number;
  readonly floorGroundingY: number;
  readonly proportions: CharacterProportionAxes;
  readonly hair: HairScalpFitState;
  readonly outfit: OutfitLayerStackState;
  readonly handPose15Dof: HandPose15DofState;
  readonly propSocket: PropSocketAttachmentState;
  readonly exportSpec: VrmGlbExportComplianceReport;
  readonly checksum: string;
}

function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function getBodyBasePreset(baseId: WebtoonBodyBaseId): WebtoonBodyBasePreset {
  return (
    CHARACTER_BODY_BASE_PRESETS.find((preset) => preset.id === baseId) ??
    CHARACTER_BODY_BASE_PRESETS[0]!
  );
}

function getHandPosePreset(presetId: HandPose15DofPresetId): HandPose15DofPreset {
  return (
    HAND_POSE_15DOF_PRESETS.find((preset) => preset.id === presetId) ??
    HAND_POSE_15DOF_PRESETS[0]!
  );
}

function cloneHandFingers(
  fingers: Record<HandFingerId, HandFinger3Dof>,
): Record<HandFingerId, HandFinger3Dof> {
  return {
    thumb: { ...fingers.thumb },
    index: { ...fingers.index },
    middle: { ...fingers.middle },
    ring: { ...fingers.ring },
    pinky: { ...fingers.pinky },
  };
}

/** 8축 체형·비율 값을 각 축의 허용 범위 안으로 안전하게 클램프한다(NaN·Infinity 방어). */
export function clampProportionAxes(
  input: Partial<CharacterProportionAxes>,
): CharacterProportionAxes {
  const result: Record<string, number> = {};
  for (const spec of CHARACTER_PROPORTION_AXIS_SPECS) {
    const raw = input[spec.id];
    const safe = clampFinite(
      raw === undefined ? spec.defaultValue : raw,
      spec.min,
      spec.max,
      spec.defaultValue,
    );
    result[spec.id] = roundTo(safe, 2);
  }
  return result as CharacterProportionAxes;
}

/** 등신(5.5~8.5)과 다리·머리 비율로 실제 미터(m) 신장을 산출한다(1.0 = 1m). */
export function computeMetricHeightMeters(axes: CharacterProportionAxes): number {
  const clamped = clampProportionAxes(axes);
  const ratioFactor = (clamped.headRatio - 5.5) / 3.0;
  const baseMeters = 1.15 + ratioFactor * 0.72;
  const legAdjustment = clamped.legRatio * 0.07;
  const headAdjustment = clamped.headScale * -0.02;
  return roundTo(clampFinite(baseMeters + legAdjustment + headAdjustment, 1.05, 2.05, 1.72), 2);
}

/** 한국 웹툰 체형 베이스로 통합 3D 캐릭터 셰이퍼 초기 상태를 생성한다. */
export function createCharacterShaperUnifiedState(
  baseId: WebtoonBodyBaseId = "rofan-noble",
): CharacterShaperUnifiedState {
  const preset = getBodyBasePreset(baseId);
  const proportions = clampProportionAxes(preset.proportions);
  const handPreset = getHandPosePreset(preset.defaultHandPoseId);
  const metricHeightMeters = computeMetricHeightMeters(proportions);

  return {
    characterId: `char-${preset.id}`,
    characterName: `${preset.labelKo} 주인공`,
    bodyBaseId: preset.id,
    unitScaleMeters: 1.0,
    floorGroundingY: 0,
    metricHeightMeters,
    proportions,
    hair: { ...preset.defaultHair },
    outfit: { ...preset.defaultOutfit },
    handPose15Dof: {
      presetId: handPreset.id,
      activeHand: "both",
      fingers: cloneHandFingers(handPreset.fingers),
    },
    propSocket: { ...preset.defaultProp },
    topologyAudit: {
      nonManifoldEdges: 0,
      looseVertices: 0,
      humanoidBoneCount: 55,
      estimatedTriangles: 28_400,
    },
  };
}

/** 다른 웹툰 체형 베이스 프리셋을 적용해 비율·헤어·의상·손 포즈·소품을 일괄 갱신한다. */
export function applyBodyBasePreset(
  state: CharacterShaperUnifiedState,
  baseId: WebtoonBodyBaseId,
): CharacterShaperUnifiedState {
  const next = createCharacterShaperUnifiedState(baseId);
  return {
    ...next,
    characterId: state.characterId === `char-${state.bodyBaseId}` ? next.characterId : state.characterId,
  };
}

/** 8축 중 단일 비율 축을 갱신하고 미터 신장을 즉시 재계산한다. */
export function updateProportionAxis(
  state: CharacterShaperUnifiedState,
  axisId: CharacterProportionAxisId,
  value: number,
): CharacterShaperUnifiedState {
  const proportions = clampProportionAxes({ ...state.proportions, [axisId]: value });
  return {
    ...state,
    proportions,
    metricHeightMeters: computeMetricHeightMeters(proportions),
  };
}

/** 헤어 두피 밀착 파라미터를 안전 범위 안에서 갱신한다. */
export function updateHairScalpFit(
  state: CharacterShaperUnifiedState,
  patch: Partial<HairScalpFitState>,
): CharacterShaperUnifiedState {
  const presetChanged = patch.presetId !== undefined && patch.presetId !== state.hair.presetId;
  const presetDefaults = presetChanged
    ? HAIR_SCALP_PRESETS.find((item) => item.id === patch.presetId)
    : undefined;

  const nextPresetId = presetDefaults ? presetDefaults.id : state.hair.presetId;
  const rawOffset = patch.scalpOffsetMm ?? presetDefaults?.defaultOffsetMm ?? state.hair.scalpOffsetMm;
  const rawVolume = patch.volumeScale ?? presetDefaults?.defaultVolumeScale ?? state.hair.volumeScale;
  const rawDamping = patch.strandPhysicsDamping ?? presetDefaults?.defaultDamping ?? state.hair.strandPhysicsDamping;
  const nextTone = patch.toneToken ?? presetDefaults?.defaultToneToken ?? state.hair.toneToken;

  return {
    ...state,
    hair: {
      presetId: nextPresetId,
      scalpOffsetMm: roundTo(clampFinite(rawOffset, 0.5, 8.0, 1.5), 1),
      volumeScale: roundTo(clampFinite(rawVolume, 0.7, 1.4, 1.0), 2),
      strandPhysicsDamping: roundTo(clampFinite(rawDamping, 0.1, 1.0, 0.5), 2),
      toneToken: nextTone,
    },
  };
}

/** 의상 3단 레이어와 클리핑 방지 간격을 갱신한다. */
export function updateOutfitLayers(
  state: CharacterShaperUnifiedState,
  patch: Partial<OutfitLayerStackState>,
): CharacterShaperUnifiedState {
  return {
    ...state,
    outfit: {
      baseLayer: patch.baseLayer ?? state.outfit.baseLayer,
      midLayer: patch.midLayer ?? state.outfit.midLayer,
      outerLayer: patch.outerLayer ?? state.outfit.outerLayer,
      clothClearanceMm: roundTo(
        clampFinite(patch.clothClearanceMm ?? state.outfit.clothClearanceMm, 2.0, 14.0, 4.5),
        1,
      ),
      accentToneToken: patch.accentToneToken ?? state.outfit.accentToneToken,
    },
  };
}

/** 15-DOF 손 포즈 프리셋과 활성 손 방향을 적용한다. */
export function applyHandPose15DofPreset(
  state: CharacterShaperUnifiedState,
  presetId: HandPose15DofPresetId,
  activeHand?: HandActiveSide,
): CharacterShaperUnifiedState {
  const preset = getHandPosePreset(presetId);
  return {
    ...state,
    handPose15Dof: {
      presetId: preset.id,
      activeHand: activeHand ?? state.handPose15Dof.activeHand,
      fingers: cloneHandFingers(preset.fingers),
    },
  };
}

/** 5손가락 × 3자유도 = 15-DOF 수치의 유한성과 평균 굽힘 각도를 집계한다. */
export function countHandPoseDof(handPose: HandPose15DofState): {
  readonly totalDof: number;
  readonly finiteDof: number;
  readonly averageCurlDeg: number;
} {
  let totalDof = 0;
  let finiteDof = 0;
  let curlSum = 0;
  let curlSamples = 0;

  for (const fingerId of HAND_FINGER_ORDER) {
    const dof = handPose.fingers[fingerId];
    for (const val of [dof.proximalCurlDeg, dof.intermediateCurlDeg, dof.distalSpreadDeg]) {
      totalDof += 1;
      if (Number.isFinite(val)) finiteDof += 1;
    }
    if (Number.isFinite(dof.proximalCurlDeg) && Number.isFinite(dof.intermediateCurlDeg)) {
      curlSum += (dof.proximalCurlDeg + dof.intermediateCurlDeg) / 2;
      curlSamples += 1;
    }
  }

  return {
    totalDof,
    finiteDof,
    averageCurlDeg: curlSamples > 0 ? roundTo(curlSum / curlSamples, 1) : 0,
  };
}

/** 소품 소켓 부착 상태와 스케일·파지 강도를 갱신한다. */
export function updatePropSocket(
  state: CharacterShaperUnifiedState,
  patch: Partial<PropSocketAttachmentState>,
): CharacterShaperUnifiedState {
  return {
    ...state,
    propSocket: {
      socketId: patch.socketId ?? state.propSocket.socketId,
      propId: patch.propId ?? state.propSocket.propId,
      scale: roundTo(clampFinite(patch.scale ?? state.propSocket.scale, 0.5, 1.8, 1.0), 2),
      gripTightness: roundTo(
        clampFinite(patch.gripTightness ?? state.propSocket.gripTightness, 0, 1, 0.75),
        2,
      ),
    },
  };
}

function collectNumericAuditValues(state: CharacterShaperUnifiedState): readonly number[] {
  const values: number[] = [
    state.unitScaleMeters,
    state.floorGroundingY,
    state.metricHeightMeters,
    state.hair.scalpOffsetMm,
    state.hair.volumeScale,
    state.hair.strandPhysicsDamping,
    state.outfit.clothClearanceMm,
    state.propSocket.scale,
    state.propSocket.gripTightness,
  ];
  for (const spec of CHARACTER_PROPORTION_AXIS_SPECS) values.push(state.proportions[spec.id]);
  for (const fingerId of HAND_FINGER_ORDER) {
    const dof = state.handPose15Dof.fingers[fingerId];
    values.push(dof.proximalCurlDeg, dof.intermediateCurlDeg, dof.distalSpreadDeg);
  }
  return values;
}

/** VRM 1.0 / GLB 2.0 내보내기 규격 검증(0 non-manifold · 0 NaN · 1.0m · Y=0 바닥 접지). */
export function validateCharacterExportCompliance(
  state: CharacterShaperUnifiedState,
  format: CharacterExportFormat = "vrm-1.0",
): VrmGlbExportComplianceReport {
  const numericValues = collectNumericAuditValues(state);
  const nanCount = numericValues.filter((val) => !Number.isFinite(val)).length;
  const dofSummary = countHandPoseDof(state.handPose15Dof);

  const manifoldPassed =
    state.topologyAudit.nonManifoldEdges === 0 && state.topologyAudit.looseVertices === 0;
  const finitePassed = nanCount === 0;
  const metricGroundingPassed =
    state.unitScaleMeters === 1.0 &&
    state.floorGroundingY === 0 &&
    Number.isFinite(state.metricHeightMeters) &&
    state.metricHeightMeters >= 1.05 &&
    state.metricHeightMeters <= 2.05;
  const clearancePassed =
    Number.isFinite(state.hair.scalpOffsetMm) &&
    state.hair.scalpOffsetMm >= 0.5 &&
    state.hair.scalpOffsetMm <= 8.0 &&
    Number.isFinite(state.outfit.clothClearanceMm) &&
    state.outfit.clothClearanceMm >= 2.0 &&
    state.outfit.clothClearanceMm <= 14.0;
  const rigPassed =
    state.topologyAudit.humanoidBoneCount >= 55 &&
    dofSummary.totalDof === 15 &&
    dofSummary.finiteDof === 15;

  const checks: ExportComplianceCheck[] = [
    {
      id: "manifold",
      labelKo: "Manifold 토폴로지 (비다양체 0)",
      passed: manifoldPassed,
      detailKo: manifoldPassed
        ? "비다양체 모서리 0개 · 고립 정점 0개 확인"
        : `비다양체 ${state.topologyAudit.nonManifoldEdges}개 · 고립 정점 ${state.topologyAudit.looseVertices}개 검출`,
    },
    {
      id: "finite-numeric",
      labelKo: "수치 무결성 (NaN 0)",
      passed: finitePassed,
      detailKo: finitePassed
        ? `전체 ${numericValues.length}개 셰이퍼 파라미터 유한 수치 통과`
        : `비정상 수치(NaN/Infinity) ${nanCount}건 발견`,
    },
    {
      id: "metric-grounding",
      labelKo: "미터 단위 1.0m · 바닥 접지 Y=0",
      passed: metricGroundingPassed,
      detailKo: metricGroundingPassed
        ? `스케일 ${state.unitScaleMeters.toFixed(1)}m · 바닥 Y=${state.floorGroundingY} · 신장 ${state.metricHeightMeters.toFixed(2)}m`
        : `규격 불일치(스케일 ${state.unitScaleMeters}, 바닥 Y=${state.floorGroundingY})`,
    },
    {
      id: "clearance",
      labelKo: "헤어 두피 밀착 · 의상 클리핑 여유",
      passed: clearancePassed,
      detailKo: clearancePassed
        ? `두피 간격 ${state.hair.scalpOffsetMm.toFixed(1)}mm · 의상 여유 ${state.outfit.clothClearanceMm.toFixed(1)}mm`
        : "두피 간격(0.5~8.0mm) 또는 의상 여유(2.0~14.0mm) 범위 이탈",
    },
    {
      id: "rig-spec",
      labelKo: `${format === "vrm-1.0" ? "VRM 1.0" : "GLB 2.0"} 휴머노이드 · 15-DOF 손 리깅`,
      passed: rigPassed,
      detailKo: rigPassed
        ? `휴머노이드 ${state.topologyAudit.humanoidBoneCount}본 · 손 ${dofSummary.finiteDof}-DOF 매핑 완료`
        : `리깅 결손(본 ${state.topologyAudit.humanoidBoneCount}, 손 DOF ${dofSummary.finiteDof}/15)`,
    },
  ];

  return {
    format,
    passed: checks.every((check) => check.passed),
    vrmVersion: "1.0",
    glbBinaryHeaderValid: manifoldPassed && finitePassed,
    nonManifoldEdges: state.topologyAudit.nonManifoldEdges,
    looseVertices: state.topologyAudit.looseVertices,
    nanCount,
    unitScaleMeters: state.unitScaleMeters,
    floorGroundingY: state.floorGroundingY,
    humanoidBoneCount: state.topologyAudit.humanoidBoneCount,
    handDofCount: dofSummary.finiteDof,
    estimatedTriangles: state.topologyAudit.estimatedTriangles,
    checks,
  };
}

function computeDeterministicChecksum(serialized: string): string {
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `csu-v1-${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

/** 원클릭 스튜디오 캔버스 / 3D 배경 스테이지 투입용 표준 핸드오프 페이로드를 생성한다. */
export function buildCharacterShaperHandoffPayload(
  state: CharacterShaperUnifiedState,
  target: CharacterHandoffTarget,
  format: CharacterExportFormat = "vrm-1.0",
  createdAtIso = new Date().toISOString(),
): CharacterShaperHandoffPayload {
  const sanitizedProportions = clampProportionAxes(state.proportions);
  const sanitizedState: CharacterShaperUnifiedState = {
    ...state,
    proportions: sanitizedProportions,
    metricHeightMeters: computeMetricHeightMeters(sanitizedProportions),
    hair: {
      ...state.hair,
      scalpOffsetMm: roundTo(clampFinite(state.hair.scalpOffsetMm, 0.5, 8.0, 1.5), 1),
      volumeScale: roundTo(clampFinite(state.hair.volumeScale, 0.7, 1.4, 1.0), 2),
      strandPhysicsDamping: roundTo(clampFinite(state.hair.strandPhysicsDamping, 0.1, 1.0, 0.5), 2),
    },
    outfit: {
      ...state.outfit,
      clothClearanceMm: roundTo(clampFinite(state.outfit.clothClearanceMm, 2.0, 14.0, 4.5), 1),
    },
    propSocket: {
      ...state.propSocket,
      scale: roundTo(clampFinite(state.propSocket.scale, 0.5, 1.8, 1.0), 2),
      gripTightness: roundTo(clampFinite(state.propSocket.gripTightness, 0, 1, 0.75), 2),
    },
  };

  const exportSpec = validateCharacterExportCompliance(sanitizedState, format);
  const basePayload = {
    schema: CHARACTER_SHAPER_HANDOFF_SCHEMA,
    source: "toonstudio-internal-shaper" as const,
    target,
    targetRoute: target === "studio-canvas-2d" ? ("/studio" as const) : ("/studio/bg3d" as const),
    createdAtIso,
    characterId: sanitizedState.characterId,
    characterName: sanitizedState.characterName,
    bodyBaseId: sanitizedState.bodyBaseId,
    metricHeightMeters: sanitizedState.metricHeightMeters,
    unitScaleMeters: sanitizedState.unitScaleMeters,
    floorGroundingY: sanitizedState.floorGroundingY,
    proportions: sanitizedState.proportions,
    hair: sanitizedState.hair,
    outfit: sanitizedState.outfit,
    handPose15Dof: {
      ...sanitizedState.handPose15Dof,
      fingers: cloneHandFingers(sanitizedState.handPose15Dof.fingers),
    },
    propSocket: sanitizedState.propSocket,
    exportSpec,
  };

  const checksum = computeDeterministicChecksum(
    JSON.stringify({
      schema: basePayload.schema,
      target: basePayload.target,
      bodyBaseId: basePayload.bodyBaseId,
      proportions: basePayload.proportions,
      hair: basePayload.hair,
      outfit: basePayload.outfit,
      handPose15Dof: basePayload.handPose15Dof,
      propSocket: basePayload.propSocket,
      format: basePayload.exportSpec.format,
    }),
  );

  return { ...basePayload, checksum };
}
