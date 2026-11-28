/**
 * Wave 155 — 크로스-DCC 레이어 래스터화·색심도·통과 폴더 위험 규칙 및 페널티 계산 모듈.
 */

import {
  LAYER_KIND_LABEL_KO,
  type CanonicalBlendMode,
  type DccBitDepth,
  type DccCapabilityProfile,
  type DccFormatId,
  type DccLayerKind,
} from "./dcc-blend-math-and-matrix";

export type DccRiskSeverity = "info" | "warning" | "blocker";

export type DccLossRiskCode =
  | "blend-mode-approximated"
  | "vector-rasterization-loss"
  | "screentone-rasterization-loss"
  | "text-outline-loss"
  | "bitdepth-banding-risk"
  | "pass-through-group-flatten-risk"
  | "adjustment-layer-flatten-risk"
  | "3d-reference-rasterization-loss";

export const ALL_DCC_LOSS_RISK_CODES: readonly DccLossRiskCode[] = [
  "blend-mode-approximated",
  "vector-rasterization-loss",
  "screentone-rasterization-loss",
  "text-outline-loss",
  "bitdepth-banding-risk",
  "pass-through-group-flatten-risk",
  "adjustment-layer-flatten-risk",
  "3d-reference-rasterization-loss",
];

export interface DccLayerNode {
  readonly layerId: string;
  readonly nameKo: string;
  readonly layerKind: DccLayerKind;
  readonly blendMode: CanonicalBlendMode;
  readonly opacity: number;
  readonly clippingMask: boolean;
  readonly bitDepth: DccBitDepth;
  readonly visible?: boolean;
  readonly children?: readonly DccLayerNode[];
}

export interface DccLayerRiskItem {
  readonly layerId: string;
  readonly layerNameKo: string;
  readonly code: DccLossRiskCode;
  readonly severity: DccRiskSeverity;
  readonly messageKo: string;
  readonly mitigationKo: string;
  readonly measuredDeltaE: number;
}

export function resolveTargetBitDepth(
  sourceBitDepth: DccBitDepth,
  targetProfile: DccCapabilityProfile,
): DccBitDepth {
  return targetProfile.supportedBitDepths.indexOf(sourceBitDepth) >= 0
    ? sourceBitDepth
    : targetProfile.maxBitDepth;
}

export function collectNonNormalDescendants(
  children: readonly DccLayerNode[],
  acc: DccLayerNode[],
): void {
  for (let i = 0; i < children.length; i += 1) {
    const child = children[i];
    if (
      child.layerKind === "adjustment-curve" ||
      (child.blendMode !== "normal" && child.blendMode !== "pass-through")
    ) {
      acc.push(child);
    }
    if (child.children && child.children.length > 0) {
      collectNonNormalDescendants(child.children, acc);
    }
  }
}

export function appendNonBlendLayerRisks(
  node: DccLayerNode,
  sourceDcc: DccFormatId,
  targetProfile: DccCapabilityProfile,
  targetBitDepth: DccBitDepth,
  risks: DccLayerRiskItem[],
): boolean {
  let rasterizationForced = false;
  if (node.layerKind === "vector-ink" && !targetProfile.preservesEditableVectorInk) {
    rasterizationForced = true;
    risks.push({
      layerId: node.layerId,
      layerNameKo: node.nameKo,
      code: "vector-rasterization-loss",
      severity: "blocker",
      messageKo: `「${node.nameKo}」 벡터 먹선 레이어가 ${targetProfile.shortLabel}에서 래스터화되어 선폭 재조정·확대 무손실 편집을 잃습니다.`,
      mitigationKo: `선화 수정은 원본(${sourceDcc}) 또는 ToonStudio 마스터에서 마친 뒤 고해상도(600 DPI 이상)로 확정 전달하세요.`,
      measuredDeltaE: 0,
    });
  }
  if (node.layerKind === "screentone-live" && !targetProfile.preservesLiveScreentone) {
    rasterizationForced = true;
    risks.push({
      layerId: node.layerId,
      layerNameKo: node.nameKo,
      code: "screentone-rasterization-loss",
      severity: "blocker",
      messageKo: `「${node.nameKo}」 라이브 망점 톤 레이어가 ${targetProfile.shortLabel}에서 픽셀로 굳어져 선수(LPI)·각도 수정이 막힙니다.`,
      mitigationKo: "최종 출력 해상도에 맞춰 망점을 확정하거나 ToonStudio 마스터에서 라이브 톤 원본을 유지하세요.",
      measuredDeltaE: 0,
    });
  }
  if (node.layerKind === "text-editable" && !targetProfile.preservesEditableText) {
    rasterizationForced = true;
    risks.push({
      layerId: node.layerId,
      layerNameKo: node.nameKo,
      code: "text-outline-loss",
      severity: "warning",
      messageKo: `「${node.nameKo}」 식자 레이어가 ${targetProfile.shortLabel}에서 편집 불가 상태로 변환되어 대사 교정과 외곽선 재렌더가 막힙니다.`,
      mitigationKo: "다국어 현지화·대사 교정용 식자 스크립트와 말풍선 분리 레이어를 별도 보관하세요.",
      measuredDeltaE: 0,
    });
  }
  if (node.layerKind === "adjustment-curve" && !targetProfile.preservesAdjustmentCurve) {
    rasterizationForced = true;
    risks.push({
      layerId: node.layerId,
      layerNameKo: node.nameKo,
      code: "adjustment-layer-flatten-risk",
      severity: "blocker",
      messageKo: `「${node.nameKo}」 비파괴 톤 커브 보정 레이어를 ${targetProfile.shortLabel}가 지원하지 않아 색보정이 하단 픽셀에 직접 병합됩니다.`,
      mitigationKo: "색보정 전 원본 채색 레이어를 백업해 두고 톤 커브 수치를 작업 시트에 기록하세요.",
      measuredDeltaE: 0,
    });
  }
  if (node.layerKind === "3d-reference" && !targetProfile.preserves3dReference) {
    rasterizationForced = true;
    risks.push({
      layerId: node.layerId,
      layerNameKo: node.nameKo,
      code: "3d-reference-rasterization-loss",
      severity: "warning",
      messageKo: `「${node.nameKo}」 ${LAYER_KIND_LABEL_KO[node.layerKind]} 레이어가 ${targetProfile.shortLabel}에서 2D 스냅샷으로 고정됩니다.`,
      mitigationKo: "카메라 앵글 확정 후 선화 추출본과 함께 원본 3D 씬을 프로젝트 폴더에 남겨 두세요.",
      measuredDeltaE: 0,
    });
  }
  if (node.bitDepth > targetBitDepth) {
    const severeDrop = node.bitDepth >= 32 && targetBitDepth <= 8;
    risks.push({
      layerId: node.layerId,
      layerNameKo: node.nameKo,
      code: "bitdepth-banding-risk",
      severity: severeDrop ? "blocker" : "warning",
      messageKo: `「${node.nameKo}」 색심도가 ${node.bitDepth}-bit에서 ${targetBitDepth}-bit로 축소되어 그라데이션 밴딩이 생길 수 있습니다.`,
      mitigationKo: severeDrop
        ? "32-bit HDR 광원을 톤매핑한 뒤 미세 디더링(0.5~1% 노이즈)을 적용해 내보내세요."
        : "암부·배경 그라데이션 레이어에 약한 디더링을 적용해 8-bit 계조 꺾임을 완화하세요.",
      measuredDeltaE: 0,
    });
  }
  return rasterizationForced;
}

export function computeRiskPenalty(risk: DccLayerRiskItem): number {
  switch (risk.code) {
    case "blend-mode-approximated":
      return Math.min(18, 4 + risk.measuredDeltaE * 140);
    case "vector-rasterization-loss":
    case "screentone-rasterization-loss":
      return 14;
    case "pass-through-group-flatten-risk":
      return risk.severity === "blocker" ? 16 : 7;
    case "text-outline-loss":
      return 10;
    case "adjustment-layer-flatten-risk":
      return 11;
    case "bitdepth-banding-risk":
      return risk.severity === "blocker" ? 15 : 9;
    case "3d-reference-rasterization-loss":
      return 8;
  }
}

export function buildEmptyRiskCounts(): Record<DccLossRiskCode, number> {
  return {
    "blend-mode-approximated": 0,
    "vector-rasterization-loss": 0,
    "screentone-rasterization-loss": 0,
    "text-outline-loss": 0,
    "bitdepth-banding-risk": 0,
    "pass-through-group-flatten-risk": 0,
    "adjustment-layer-flatten-risk": 0,
    "3d-reference-rasterization-loss": 0,
  };
}
