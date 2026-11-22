/**
 * 3D 통합 합성 스테이지용 Z-Depth 깊이 감쇠 LT 선화(1.8/1.1/0.5px) ·
 * 알파 컷아웃(유리/철망) 마스크 패스 분리 · 6패스(선화·음영·원색·깊이·노멀·마스크)
 * 레이어 자동 그룹화 및 시차(Parallax) 바인딩 어댑터.
 *
 * - 기존 `stage-3d-bg-character-compositor.ts`의 5레이어 비파괴 베이크(`layers`)를 유지하면서
 *   확장 `ltSixPassBundle`로 6패스 LT 그룹, 깊이별 선 굵기 할당, 유리/철망 알파 컷아웃 보호,
 *   시차 오프셋 계약을 일관되게 연결한다.
 * - 원시 HEX/RGB 문자열 금지(OKLCH 및 시맨틱 토큰 전용).
 */

import {
  LT_DEPTH_ATTENUATION_PRESETS,
  classifyLtDepthBand,
  computeDepthAttenuatedLineWidthPx,
  normalizeAlphaCutoutThreshold,
  normalizeLtDepthPresetId,
  type LtDepthAttenuationPresetId,
  type LtDepthBandId,
} from "../lt-convert/studio-lt-depth-attenuation";
import {
  buildLtSixPassLayerGroup,
  evaluateSixPassParallaxOffset,
  type SixPassLtLayerGroup,
  type SixPassParallaxEvaluation,
} from "../lt-convert/studio-lt-six-pass-parallax";

import {
  clampStageNumber,
  roundStage3,
  type StageBackgroundSlot,
  type StageBackgroundSlotId,
} from "./stage-3d-compositor-catalog";

export interface StageAlphaCutoutMaterialSpec {
  readonly materialId: string;
  readonly labelKo: string;
  readonly kind: "glass-mullion" | "wire-mesh" | "crystal-chandelier" | "metal-grate";
  readonly alphaThreshold: number;
  readonly excludeFromNormalPass: true;
  readonly routeToMaskPassCode: "06_LT_ALPHA_MASK";
}

export interface StageDepthAttenuatedSubject {
  readonly subjectId: string;
  readonly subjectKind: "character" | "elevation-zone" | "crowd-extra";
  readonly labelKo: string;
  /** 카메라 기준 정규화 Z-Depth (0=근경, 0.5=중경, 1=원경). */
  readonly depthNorm: number;
  readonly depthBand: LtDepthBandId;
  readonly attenuatedLineWidthPx: number;
  readonly parallaxFactor: number;
}

export interface StageLtSixPassBundle {
  readonly presetId: LtDepthAttenuationPresetId;
  readonly presetLabelKo: string;
  readonly group: SixPassLtLayerGroup;
  readonly subjects: readonly StageDepthAttenuatedSubject[];
  readonly alphaCutoutMaterials: readonly StageAlphaCutoutMaterialSpec[];
  readonly normalPassAlphaCutoutGuardActive: boolean;
  readonly referenceParallaxPreview: SixPassParallaxEvaluation;
  readonly depthWidthSummary: {
    readonly nearPx: number;
    readonly midPx: number;
    readonly farPx: number;
  };
}

export interface StageSubjectDepthInput {
  readonly id: string;
  readonly labelKo: string;
  readonly positionZ: number;
}

const BACKGROUND_ALPHA_CUTOUT_MATERIALS: Readonly<
  Partial<Record<StageBackgroundSlotId, readonly StageAlphaCutoutMaterialSpec[]>>
> = Object.freeze({
  "rofan-imperial-arch-chandelier": Object.freeze([
    Object.freeze({
      materialId: "imperial-chandelier-crystal",
      labelKo: "샹들리에 크리스탈·유리 프리즘",
      kind: "crystal-chandelier",
      alphaThreshold: 0.5,
      excludeFromNormalPass: true,
      routeToMaskPassCode: "06_LT_ALPHA_MASK",
    }),
    Object.freeze({
      materialId: "arch-stained-glass",
      labelKo: "아치 스테인드글라스 창살",
      kind: "glass-mullion",
      alphaThreshold: 0.5,
      excludeFromNormalPass: true,
      routeToMaskPassCode: "06_LT_ALPHA_MASK",
    }),
  ]),
  "seoul-rooftop-cafe-terrace": Object.freeze([
    Object.freeze({
      materialId: "rooftop-safety-wire-mesh",
      labelKo: "옥상 안전 철망 난간",
      kind: "wire-mesh",
      alphaThreshold: 0.5,
      excludeFromNormalPass: true,
      routeToMaskPassCode: "06_LT_ALPHA_MASK",
    }),
    Object.freeze({
      materialId: "cafe-glass-partition",
      labelKo: "테라스 투명 유리 파티션",
      kind: "glass-mullion",
      alphaThreshold: 0.5,
      excludeFromNormalPass: true,
      routeToMaskPassCode: "06_LT_ALPHA_MASK",
    }),
  ]),
  "academy-sunset-rooftop": Object.freeze([
    Object.freeze({
      materialId: "academy-chainlink-fence",
      labelKo: "학교 옥상 철망 펜스",
      kind: "wire-mesh",
      alphaThreshold: 0.5,
      excludeFromNormalPass: true,
      routeToMaskPassCode: "06_LT_ALPHA_MASK",
    }),
  ]),
  "seoul-neon-alley": Object.freeze([
    Object.freeze({
      materialId: "alley-drain-grate-wire",
      labelKo: "골목 배수 철망·상가 유리창",
      kind: "metal-grate",
      alphaThreshold: 0.5,
      excludeFromNormalPass: true,
      routeToMaskPassCode: "06_LT_ALPHA_MASK",
    }),
  ]),
  "sunlit-atelier-cafe": Object.freeze([
    Object.freeze({
      materialId: "cafe-window-mullion-glass",
      labelKo: "채광 유리창·격자 멀리온",
      kind: "glass-mullion",
      alphaThreshold: 0.5,
      excludeFromNormalPass: true,
      routeToMaskPassCode: "06_LT_ALPHA_MASK",
    }),
  ]),
  "modern-webtoon-office": Object.freeze([
    Object.freeze({
      materialId: "office-glass-curtainwall",
      labelKo: "오피스 유리 커튼월·파티션",
      kind: "glass-mullion",
      alphaThreshold: 0.5,
      excludeFromNormalPass: true,
      routeToMaskPassCode: "06_LT_ALPHA_MASK",
    }),
  ]),
});

const DEFAULT_FALLBACK_ALPHA_CUTOUT: readonly StageAlphaCutoutMaterialSpec[] = Object.freeze([
  Object.freeze({
    materialId: "stage-generic-glass-wire-guard",
    labelKo: "유리·철망 알파 컷아웃 기본 보호 슬롯",
    kind: "glass-mullion",
    alphaThreshold: 0.5,
    excludeFromNormalPass: true,
    routeToMaskPassCode: "06_LT_ALPHA_MASK",
  }),
]);

/**
 * 스테이지 월드 Z 좌표(카메라 쪽이 +Z, 배경 원경이 -Z)를 정규화 Z-Depth(0=근경, 1=원경)로 변환한다.
 */
export function computeStageSubjectDepthNorm(
  worldZ: number,
  footprintDepthMeters: number,
): number {
  const halfD = Math.max(2.6, footprintDepthMeters * 0.5);
  // +halfD(카메라 근경) -> 0.0, 0(중경) -> 0.5, -halfD(배경 원경) -> 1.0
  return roundStage3(clampStageNumber((halfD - worldZ) / (halfD * 2), 0, 1));
}

export function getStageAlphaCutoutMaterials(
  backgroundId: StageBackgroundSlotId,
  alphaCutoutThreshold?: number,
): readonly StageAlphaCutoutMaterialSpec[] {
  const threshold = normalizeAlphaCutoutThreshold(alphaCutoutThreshold);
  const base = BACKGROUND_ALPHA_CUTOUT_MATERIALS[backgroundId] ?? DEFAULT_FALLBACK_ALPHA_CUTOUT;
  return base.map((item) => ({ ...item, alphaThreshold: threshold }));
}

/**
 * 3D 배경·캐릭터·군중 엑스트라 배치를 Z-Depth 깊이 감쇠 LT 선화(1.8/1.1/0.5px),
 * 유리/철망 알파 컷아웃 노멀 보호, 6패스 자동 그룹화 및 시차 바인딩 번들로 조합한다.
 */
export function buildStageLtSixPassBundle(params: {
  readonly background: StageBackgroundSlot;
  readonly characters: readonly StageSubjectDepthInput[];
  readonly crowdExtras: readonly StageSubjectDepthInput[];
  readonly viewportPx: readonly [number, number];
  readonly presetId?: LtDepthAttenuationPresetId;
  readonly alphaCutoutThreshold?: number;
  readonly sampleCameraPanPx?: readonly [number, number];
}): StageLtSixPassBundle {
  const presetId = normalizeLtDepthPresetId(params.presetId);
  const preset = LT_DEPTH_ATTENUATION_PRESETS[presetId];
  const threshold = normalizeAlphaCutoutThreshold(params.alphaCutoutThreshold);
  const footprintD = params.background.footprintMeters[2];

  const subjects: StageDepthAttenuatedSubject[] = [];

  for (const char of params.characters) {
    const depthNorm = computeStageSubjectDepthNorm(char.positionZ, footprintD);
    const depthBand = classifyLtDepthBand(depthNorm, presetId);
    subjects.push({
      subjectId: char.id,
      subjectKind: "character",
      labelKo: char.labelKo,
      depthNorm,
      depthBand,
      attenuatedLineWidthPx: computeDepthAttenuatedLineWidthPx(depthNorm, presetId),
      parallaxFactor: preset.parallaxFactors[depthBand],
    });
  }

  for (const zone of params.background.elevationZones) {
    const depthNorm = computeStageSubjectDepthNorm(zone.centerZ, footprintD);
    const depthBand = classifyLtDepthBand(depthNorm, presetId);
    subjects.push({
      subjectId: zone.id,
      subjectKind: "elevation-zone",
      labelKo: zone.labelKo,
      depthNorm,
      depthBand,
      attenuatedLineWidthPx: computeDepthAttenuatedLineWidthPx(depthNorm, presetId),
      parallaxFactor: preset.parallaxFactors[depthBand],
    });
  }

  for (const extra of params.crowdExtras) {
    const depthNorm = computeStageSubjectDepthNorm(extra.positionZ, footprintD);
    const depthBand = classifyLtDepthBand(depthNorm, presetId);
    subjects.push({
      subjectId: extra.id,
      subjectKind: "crowd-extra",
      labelKo: extra.labelKo,
      depthNorm,
      depthBand,
      attenuatedLineWidthPx: computeDepthAttenuatedLineWidthPx(depthNorm, presetId),
      parallaxFactor: preset.parallaxFactors[depthBand],
    });
  }

  const alphaCutoutMaterials = getStageAlphaCutoutMaterials(params.background.id, threshold);
  const group = buildLtSixPassLayerGroup({
    groupId: `stage-lt-6pass:${params.background.id}:${presetId}`,
    groupNameKo: `${params.background.titleKo} · LT 6패스 (${preset.labelKo})`,
    presetId,
    width: params.viewportPx[0],
    height: params.viewportPx[1],
    alphaCutoutSeparated: alphaCutoutMaterials.length > 0,
    alphaCutoutThreshold: threshold,
  });

  const [panX, panY] = params.sampleCameraPanPx ?? [16, 0];
  const referenceParallaxPreview = evaluateSixPassParallaxOffset(group.parallaxContract, {
    panXPx: panX,
    panYPx: panY,
  });

  return {
    presetId,
    presetLabelKo: preset.labelKo,
    group,
    subjects,
    alphaCutoutMaterials,
    normalPassAlphaCutoutGuardActive: alphaCutoutMaterials.length > 0,
    referenceParallaxPreview,
    depthWidthSummary: {
      nearPx: preset.nearLineWidthPx,
      midPx: preset.midLineWidthPx,
      farPx: preset.farLineWidthPx,
    },
  };
}
