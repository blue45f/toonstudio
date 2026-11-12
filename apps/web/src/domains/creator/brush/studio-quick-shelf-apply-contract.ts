import {
  BRUSH_STUDIO_V6_NODES,
  createBrushStudioV6Program,
  type BrushStudioV6NodeDescriptor,
} from "../brush-lab/brush-studio-v6-engine";
import {
  BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
  brushStudioV6LicenseProfileAllows,
  type BrushStudioV6LicenseProfile,
} from "../brush-lab/brush-studio-v6-license-profile";
import type { BrushStudioV6MaterialConfig } from "../brush-lab/brush-studio-v6-material-engine";
import { createBrushStudioV6ProductBrush } from "../brush-lab/brush-studio-v6-product-bridge";
import {
  planBrushStudioV6ProviderRuntime,
  type BrushStudioV6BlockedProviderNode,
} from "../brush-lab/brush-studio-v6-provider-runtime";
import { brushStudioV6Topology } from "../brush-lab/brush-studio-v6-topology-catalog";
import { isBrushStudioV6TopologyNodeCompatible } from "../brush-lab/brush-studio-v6-topology-material";

import {
  sanitizeBrushSnapshot,
  type StudioSavedBrush,
} from "./studio-brush-library";
import { studioV6BrushCatalogSelectionBlock } from "./studio-brush-v6-catalog-runtime";
import { studioV6BrushCatalogId } from "./studio-brush-v6-id";
import { planStudioMaterialBrush } from "./studio-material-brush-runtime";

const V6_NODE_BY_ID = new Map<string, BrushStudioV6NodeDescriptor>(
  BRUSH_STUDIO_V6_NODES.map((node) => [node.id, node]),
);

export type StudioFavoriteBrushRecoveryStatus =
  | "ok"
  | "rebuilt-v6-receipt"
  | "sanitized-snapshot"
  | "provider-unavailable"
  | "invalid-brush";

export interface StudioFavoriteBrushRecoveryResult {
  readonly brush: StudioSavedBrush | null;
  readonly status: StudioFavoriteBrushRecoveryStatus;
  readonly adjustedFields: readonly string[];
  readonly blockedNodeIds?: readonly string[];
  readonly blockedNodes?: readonly BrushStudioV6BlockedProviderNode[];
  readonly reason?: string;
}

export interface StudioCanvasApplyExecutionResult {
  readonly appliedBrush: StudioSavedBrush | null;
  readonly status: StudioFavoriteBrushRecoveryStatus | "apply-failed";
  readonly adjustedFields: readonly string[];
  readonly blockedNodeIds?: readonly string[];
  readonly blockedNodes?: readonly BrushStudioV6BlockedProviderNode[];
  readonly reason?: string;
  readonly error?: unknown;
}

export interface StudioSavedBrushProviderGateVerdict {
  readonly valid: boolean;
  readonly licenseProfile: BrushStudioV6LicenseProfile;
  readonly blockedNodeIds: readonly string[];
  readonly blockedNodes: readonly BrushStudioV6BlockedProviderNode[];
  readonly reason: string | null;
}

function descriptorForSlotNodeId(
  nodeId: string,
  hasTopologyCarrier: boolean,
): BrushStudioV6NodeDescriptor {
  const known = V6_NODE_BY_ID.get(nodeId);
  if (!known) {
    return Object.freeze({
      ...BRUSH_STUDIO_V6_NODES[0]!,
      id: nodeId,
      label: nodeId,
      provider: "Unregistered provider",
      requires: Object.freeze([]),
    });
  }
  if (hasTopologyCarrier && isBrushStudioV6TopologyNodeCompatible(nodeId)) {
    return Object.freeze({
      ...known,
      domain: "main" as const,
      provider: "ToonStudio CPU contact kernel",
      requires: Object.freeze([]),
    });
  }
  return known;
}

function collectSlotNodeIdsFromRawMaterial(rawMaterial: unknown): string[] | null {
  if (!rawMaterial || typeof rawMaterial !== "object") return null;
  const slots = (rawMaterial as { slots?: Record<string, unknown> }).slots;
  if (!slots || typeof slots !== "object") return null;
  const singleKeys = [
    "input",
    "motion",
    "carrier",
    "tip",
    "surface",
    "deposition",
    "pickup",
    "pigment",
    "pattern",
    "output",
  ] as const;
  const ids: string[] = [];
  for (const key of singleKeys) {
    const value = slots[key];
    if (typeof value === "string" && value.trim().length > 0) {
      ids.push(value.trim());
    }
  }
  for (const multiKey of ["physics", "finish"] as const) {
    const list = slots[multiKey];
    if (Array.isArray(list)) {
      for (const entry of list) {
        if (typeof entry === "string" && entry.trim().length > 0) {
          ids.push(entry.trim());
        }
      }
    }
  }
  return ids.length > 0 ? ids : null;
}

function summarizeBlockedProviderReasonKo(
  brushName: string,
  blockedNodes: readonly BrushStudioV6BlockedProviderNode[],
  licenseProfile: BrushStudioV6LicenseProfile,
): string {
  const nodeSummary = blockedNodes.map((entry) => entry.nodeId).join(", ");
  const reasons = new Set(blockedNodes.map((entry) => entry.reason));
  if (reasons.has("license-profile")) {
    return `"${brushName}" 프리셋은 현재 라이선스·권리 게이트(${licenseProfile})에서 허용되지 않는 재료(${nodeSummary})를 사용해 적용할 수 없어요. 무폴백 정책에 따라 현재 브러시를 그대로 유지합니다.`;
  }
  if (reasons.has("provider-not-connected")) {
    return `"${brushName}" 프리셋의 재료 엔진 provider(${nodeSummary})가 현재 런타임에 연결되지 않아 적용할 수 없어요. 무폴백 정책에 따라 현재 브러시를 그대로 유지합니다.`;
  }
  if (reasons.has("wrong-product-path")) {
    return `"${brushName}" 프리셋은 원고 접촉 경로(material-contact)와 호환되지 않는 전용 경로 엔진(${nodeSummary})을 요구해 적용할 수 없어요. 무폴백 정책에 따라 현재 브러시를 그대로 유지합니다.`;
  }
  return `"${brushName}" 프리셋에 등록되지 않은 재료 엔진 노드(${nodeSummary})가 포함되어 적용할 수 없어요. 무폴백 정책에 따라 현재 브러시를 그대로 유지합니다.`;
}

/**
 * 저장 브러시의 V6 머티리얼 슬롯과 런타임 바인딩을 실제 `planBrushStudioV6ProviderRuntime` 및
 * 기본 상용 라이선스 게이트(`permissive-only`) 기준으로 검증한다.
 */
export function inspectSavedBrushV6ProviderGate(
  rawMaterial: unknown,
  brushName: string,
  licenseProfile: BrushStudioV6LicenseProfile = BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE,
): StudioSavedBrushProviderGateVerdict {
  const slotNodeIds = collectSlotNodeIdsFromRawMaterial(rawMaterial);
  if (!slotNodeIds) {
    return {
      valid: false,
      licenseProfile,
      blockedNodeIds: Object.freeze([]),
      blockedNodes: Object.freeze([]),
      reason: `"${brushName}" 프리셋의 재료 엔진 슬롯 구성을 읽을 수 없어 적용할 수 없어요. 무폴백 정책에 따라 현재 브러시를 그대로 유지합니다.`,
    };
  }
  const carrierId = (rawMaterial as { slots?: { carrier?: unknown } }).slots?.carrier;
  const hasTopology =
    typeof carrierId === "string" && Boolean(brushStudioV6Topology(carrierId));
  const descriptors = slotNodeIds.map((id) => descriptorForSlotNodeId(id, hasTopology));
  const plan = planBrushStudioV6ProviderRuntime(descriptors, licenseProfile);
  if (!plan.valid) {
    return {
      valid: false,
      licenseProfile: plan.licenseProfile,
      blockedNodeIds: plan.blockedNodeIds,
      blockedNodes: plan.blockedNodes,
      reason: summarizeBlockedProviderReasonKo(
        brushName,
        plan.blockedNodes,
        plan.licenseProfile,
      ),
    };
  }

  const runtime = (rawMaterial as Partial<Extract<BrushStudioV6MaterialConfig, { version: 2 }>>)
    .runtime;
  if (runtime) {
    if (runtime.fallbackPolicy !== "none") {
      return {
        valid: false,
        licenseProfile,
        blockedNodeIds: Object.freeze([]),
        blockedNodes: Object.freeze([]),
        reason: `"${brushName}" 프리셋의 무폴백(fallbackPolicy: "none") 실행 영수증이 유효하지 않아 현재 브러시를 그대로 유지합니다.`,
      };
    }
    const disallowedBindings = Array.isArray(runtime.bindings)
      ? runtime.bindings.filter(
          (binding) => !brushStudioV6LicenseProfileAllows(licenseProfile, binding.rights),
        )
      : [];
    if (disallowedBindings.length > 0) {
      const blockedNodes: BrushStudioV6BlockedProviderNode[] = disallowedBindings.flatMap(
        (binding) =>
          binding.nodeIds.map((nodeId) =>
            Object.freeze({
              nodeId,
              providerId: binding.providerId,
              productPath: "material-contact" as const,
              reason: "license-profile" as const,
            }),
          ),
      );
      const blockedNodeIds = Object.freeze(blockedNodes.map((entry) => entry.nodeId));
      return {
        valid: false,
        licenseProfile,
        blockedNodeIds,
        blockedNodes: Object.freeze(blockedNodes),
        reason: summarizeBlockedProviderReasonKo(brushName, blockedNodes, licenseProfile),
      };
    }
  }

  return {
    valid: true,
    licenseProfile: plan.licenseProfile,
    blockedNodeIds: Object.freeze([]),
    blockedNodes: Object.freeze([]),
    reason: null,
  };
}

export function hasValidStudioSavedBrushMaterialReceipt(brush: StudioSavedBrush): boolean {
  if (brush.enginePrograms?.material?.runtime?.fallbackPolicy !== "none") {
    return false;
  }
  const gate = inspectSavedBrushV6ProviderGate(brush.enginePrograms.material, brush.name);
  if (!gate.valid) return false;
  try {
    const marks = planStudioMaterialBrush({
      points: [8, 16, 28, 12, 48, 18],
      pressures: [0.42, 0.82, 0.28],
      stroke: brush.color,
      strokeWidth: brush.strokeWidth,
      opacity: brush.brushOpacity,
      brushEnginePrograms: brush.enginePrograms ?? undefined,
    });
    return Array.isArray(marks) && marks.length > 0;
  } catch {
    return false;
  }
}

/**
 * 빠른 선반에서 선택한 저장 프리셋 이름(`brush.name`)과 캔버스 상단·모바일 현재 브러시 표시가
 * 1:1로 일치하도록 캔버스 적용 스냅샷의 표시 이름을 정합시킨다.
 * (`sourcePresetName`은 `STUDIO_BRUSH_BASELINE_EXCLUDED_FIELDS`에 속해 기준선 dirty 판정에 영향을 주지 않는다.)
 */
export function alignQuickShelfSavedBrushDisplayIdentity(
  brush: StudioSavedBrush,
): StudioSavedBrush {
  const displayName = brush.name.trim();
  if (!displayName || brush.sourcePresetName === displayName) {
    return brush;
  }
  return {
    ...brush,
    sourcePresetName: displayName,
  };
}

function formatCanvasApplyRuntimeError(brushName: string, error: unknown): string {
  const detail =
    error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : null;
  return detail
    ? `"${brushName}" 브러시를 캔버스에 적용하지 못했어요(${detail}). 현재 브러시는 그대로 유지됩니다.`
    : `"${brushName}" 브러시를 캔버스에 적용하지 못했어요. 현재 브러시는 그대로 유지됩니다.`;
}

/**
 * 저장 브러시를 원고 캔버스에 적용하기 전에 스냅샷 범위와 V6/V7.4 무폴백·권리·provider 계약을 검증한다.
 * - 허용된 V6 레시피의 영수증만 손상된 경우 동일 레시피의 무폴백 영수증으로 복원한다.
 * - 라이선스/권리 게이트(`private-grant`, `copyleft`) 또는 미연결·비호환 provider 노드는 다른 브러시(`pen`)로
 *   대체하지 않고 `provider-unavailable`로 즉시 차단해 기존 브러시를 보존한다.
 */
export function recoverStudioSavedBrushForQuickShelfApply(
  brush: StudioSavedBrush,
  resolveRecipeId: (candidate: Partial<StudioSavedBrush>) => string | null,
): StudioFavoriteBrushRecoveryResult {
  if (!brush || typeof brush !== "object") {
    return {
      brush: null,
      status: "invalid-brush",
      adjustedFields: ["brush"],
      reason: "선택한 브러시 정보를 읽을 수 없어 현재 브러시를 그대로 유지합니다.",
    };
  }

  const rawName =
    typeof brush.name === "string" && brush.name.trim()
      ? brush.name.trim()
      : "저장 브러시";
  const rawMaterial = (
    brush as { enginePrograms?: { material?: unknown } | null }
  ).enginePrograms?.material;

  // 원본에 명시된 V6 머티리얼 그래프가 있을 때는 sanitize 단계에서 잘려 나가기 전에 provider/권리 게이트를 먼저 검증한다.
  if (rawMaterial !== undefined && rawMaterial !== null) {
    const rawGate = inspectSavedBrushV6ProviderGate(rawMaterial, rawName);
    if (!rawGate.valid) {
      return {
        brush: null,
        status: "provider-unavailable",
        adjustedFields: [],
        blockedNodeIds: rawGate.blockedNodeIds,
        blockedNodes: rawGate.blockedNodes,
        reason: rawGate.reason ?? undefined,
      };
    }
  }

  const { snapshot, adjustedFields } = sanitizeBrushSnapshot(brush);
  const sanitizedBrush: StudioSavedBrush = alignQuickShelfSavedBrushDisplayIdentity({
    ...(brush.originalSource ? { originalSource: brush.originalSource } : {}),
    id: typeof brush.id === "string" && brush.id.trim() ? brush.id : "recovered-brush",
    name: rawName,
    createdAt: Number.isFinite(brush.createdAt) ? brush.createdAt : Date.now(),
    updatedAt: Number.isFinite(brush.updatedAt) ? brush.updatedAt : Date.now(),
    pinned: brush.pinned === true,
    lastUsedAt:
      typeof brush.lastUsedAt === "number" && Number.isFinite(brush.lastUsedAt)
        ? brush.lastUsedAt
        : null,
    ...snapshot,
  });

  const recipeId = resolveRecipeId(brush);
  const hasExplicitMaterial = rawMaterial !== undefined && rawMaterial !== null;

  if (recipeId || hasExplicitMaterial) {
    if (!hasValidStudioSavedBrushMaterialReceipt(sanitizedBrush)) {
      if (!recipeId) {
        return {
          brush: null,
          status: "provider-unavailable",
          adjustedFields,
          reason: `"${rawName}" 프리셋의 무폴백 재료 실행 영수증을 확인할 수 없어 현재 브러시를 그대로 유지합니다.`,
        };
      }
      const catalogId = sanitizedBrush.sourcePresetId ?? studioV6BrushCatalogId(recipeId);
      const catalogBlock = studioV6BrushCatalogSelectionBlock(catalogId);
      if (catalogBlock) {
        return {
          brush: null,
          status: "provider-unavailable",
          adjustedFields,
          blockedNodeIds: catalogBlock.blockedNodeIds,
          blockedNodes: catalogBlock.blockedNodes,
          reason: summarizeBlockedProviderReasonKo(
            rawName,
            catalogBlock.blockedNodes,
            catalogBlock.licenseProfile,
          ),
        };
      }
      try {
        const program = createBrushStudioV6Program(recipeId);
        const canonical = createBrushStudioV6ProductBrush(program);
        const { snapshot: reSanitized } = sanitizeBrushSnapshot({
          ...sanitizedBrush,
          brushId: canonical.brushId,
          brushDynamics: canonical.brushDynamics,
          enginePrograms: canonical.enginePrograms,
        });
        return {
          brush: alignQuickShelfSavedBrushDisplayIdentity({
            ...sanitizedBrush,
            ...reSanitized,
            sourcePresetId: catalogId,
          }),
          status: "rebuilt-v6-receipt",
          adjustedFields: [...new Set([...adjustedFields, "enginePrograms"])],
        };
      } catch (error) {
        return {
          brush: null,
          status: "provider-unavailable",
          adjustedFields,
          reason: formatCanvasApplyRuntimeError(rawName, error),
        };
      }
    }
  }

  return {
    brush: sanitizedBrush,
    status: adjustedFields.length > 0 ? "sanitized-snapshot" : "ok",
    adjustedFields,
  };
}

/**
 * 빠른 선반 `onApply` 실행 계약:
 * - provider 불가 또는 무폴백 영수증 검증 실패 시 `onApply`를 호출하지 않아 기존 브러시를 100% 보존한다.
 * - `onApply` 런타임 예외 발생 시에도 기본 펜(`pen`)으로 강제 폴백하지 않고 `apply-failed`와 정확한 사유를 반환한다.
 */
export function executeStudioSavedBrushQuickShelfApply(
  brush: StudioSavedBrush,
  onApply: (resolved: StudioSavedBrush) => void,
  resolveRecipeId: (candidate: Partial<StudioSavedBrush>) => string | null,
): StudioCanvasApplyExecutionResult {
  const recovered = recoverStudioSavedBrushForQuickShelfApply(brush, resolveRecipeId);
  if (!recovered.brush) {
    return {
      appliedBrush: null,
      status: recovered.status,
      adjustedFields: recovered.adjustedFields,
      blockedNodeIds: recovered.blockedNodeIds,
      blockedNodes: recovered.blockedNodes,
      reason: recovered.reason,
    };
  }
  try {
    onApply(recovered.brush);
    return {
      appliedBrush: recovered.brush,
      status: recovered.status,
      adjustedFields: recovered.adjustedFields,
    };
  } catch (error) {
    return {
      appliedBrush: null,
      status: "apply-failed",
      adjustedFields: recovered.adjustedFields,
      error,
      reason: formatCanvasApplyRuntimeError(recovered.brush.name, error),
    };
  }
}

/**
 * 빠른 선반에 표시된 후보 목록 중 현재 캔버스에 실제로 적용된 프리셋을 일관되게 해석한다.
 */
export function resolveActiveQuickShelfSavedBrush(
  quickBrushes: readonly StudioSavedBrush[],
  activeBrushId: string | null | undefined,
  activeCatalogBrushId?: string | null,
): StudioSavedBrush | null {
  if (activeBrushId) {
    return quickBrushes.find((item) => item.id === activeBrushId) ?? null;
  }
  if (activeCatalogBrushId) {
    return (
      quickBrushes.find(
        (item) => (item.sourcePresetId ?? item.brushId) === activeCatalogBrushId,
      ) ?? null
    );
  }
  return null;
}
