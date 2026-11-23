/**
 * 멀티 직군(Multi-Role Stackable) 작업 특화 합집합 조합 엔진.
 *
 * - 12대 웹툰 풀 직군(`story` ~ `producer`) 중 복수 선택을 받아 작업 환경을 즉시 합성
 * - 도구 레일 Calm 8슬롯 예산 엄수(우선순위 정렬 + 초과 도구는 보조 서랍으로 분리)
 * - 기본 레이어 스택 자동 합성(담당 직군 = 편집 가능, 미선택 직군 = 참조 잠금 또는 AI 보조)
 * - 빈 직군 → 전담 AI 팀원 자동 보완 배정 & 주간 절약 시간 산출
 * - 출고 전 체크리스트 합집합 + 이주 작가 단축키 프리셋(CSP/Procreate/Photoshop/입문) 결합
 */

import {
  MIGRATION_SHORTCUT_PRESETS,
  ROLE_COMBO_QUICK_PRESETS,
  STUDIO_CREATOR_ROLE_ORDER,
  STUDIO_CREATOR_ROLES,
  ACADEMY_ROLES_SPRITE_PATHS,
  type RoleDomainCategory,
  type RoleLayerSpec,
  type RoleToolSlotSpec,
  type ShortcutBindingItem,
  type ShortcutMigrationPreset,
  type ShortcutMigrationPresetId,
  type StudioCreatorRoleId,
  type StudioCreatorRoleInputId,
  type StudioCreatorRoleSpec,
} from "./studio-role-catalog";

export {
  ACADEMY_ROLES_SPRITE_PATHS,
  MIGRATION_SHORTCUT_PRESETS,
  ROLE_COMBO_QUICK_PRESETS,
  STUDIO_CREATOR_ROLE_ORDER,
  STUDIO_CREATOR_ROLES,
};
export type {
  RoleDomainCategory,
  RoleLayerSpec,
  RoleToolSlotSpec,
  ShortcutBindingItem,
  ShortcutMigrationPreset,
  ShortcutMigrationPresetId,
  StudioCreatorRoleId,
  StudioCreatorRoleInputId,
  StudioCreatorRoleSpec,
};

/** Calm Atelier 좌측 도구 레일 최대 슬롯 예산. */
export const CALM_TOOL_RAIL_BUDGET = 8 as const;

export interface ComposeMultiRoleOptions {
  readonly shortcutPresetId?: ShortcutMigrationPresetId;
  readonly maxToolSlots?: number;
  readonly enableAiBackfill?: boolean;
}

export interface SynthesizedLayerStackItem {
  readonly id: string;
  readonly name: string;
  readonly stageOrder: number;
  readonly blendMode: RoleLayerSpec["blendMode"];
  readonly purposeKo: string;
  readonly ownerRoleId: StudioCreatorRoleId;
  readonly ownerRoleLabelKo: string;
  readonly accessMode: "editable" | "ai-assisted" | "reference-locked";
  readonly exportIncluded: boolean;
}

export interface AiRoleBackfillAssignment {
  readonly roleId: StudioCreatorRoleId;
  readonly roleLabelKo: string;
  readonly partnerNameKo: string;
  readonly scopeKo: string;
  readonly approvalMode: "review-first" | "draft-assist";
  readonly estimatedWeeklySavedHours: number;
  readonly spritePath: string;
}

export interface ComposedChecklistItem {
  readonly id: string;
  readonly textKo: string;
  readonly sourceRoleId: StudioCreatorRoleId | "universal";
  readonly required: boolean;
}

export interface MultiRoleWorkspaceComposition {
  readonly selectedRoles: readonly StudioCreatorRoleId[];
  readonly selectedRoleSpecs: readonly StudioCreatorRoleSpec[];
  readonly fallbackApplied: boolean;
  readonly maxToolSlots: number;
  readonly primaryToolRailSlots: readonly RoleToolSlotSpec[];
  readonly overflowToolSlots: readonly RoleToolSlotSpec[];
  readonly synthesizedLayerStack: readonly SynthesizedLayerStackItem[];
  readonly aiBackfillAssignments: readonly AiRoleBackfillAssignment[];
  readonly totalEstimatedWeeklySavedHours: number;
  readonly preExportChecklist: readonly ComposedChecklistItem[];
  readonly shortcutPreset: ShortcutMigrationPreset;
  readonly prioritizedShortcuts: readonly ShortcutBindingItem[];
  readonly coverageSummary: {
    readonly humanRoleCount: number;
    readonly aiBackfilledCount: number;
    readonly totalStudioRoles: number;
    readonly railSlotsUsed: number;
    readonly railBudgetCap: number;
    readonly recommendedGovernanceTierId:
      | "solo"
      | "duo-trio"
      | "studio-8"
      | "agency-30plus";
  };
}

const DEFAULT_FALLBACK_ROLES: readonly StudioCreatorRoleId[] = Object.freeze([
  "storyboard",
  "lineart",
]);

const UNIVERSAL_EXPORT_GATES: readonly string[] = Object.freeze([
  "전 컷 Rights BOM 상업 라이선스·출처 누락 0건 확인",
  "최종 내보내기 가로폭(1600px 작업본 / 플랫폼 690~800px) 규격 검증",
]);

/**
 * 구 6직군 약칭(`coloring`) 포함 입력을 12종 정본 직군 ID 배열로 정규화·중복 제거한다.
 */
export function normalizeCreatorRoleIds(
  inputs: readonly StudioCreatorRoleInputId[],
): readonly StudioCreatorRoleId[] {
  const expanded = new Set<StudioCreatorRoleId>();
  for (const raw of inputs) {
    if (raw === "coloring") {
      expanded.add("flatting");
      expanded.add("shading");
    } else if (raw in STUDIO_CREATOR_ROLES) {
      expanded.add(raw);
    }
  }
  return STUDIO_CREATOR_ROLE_ORDER.filter((roleId) => expanded.has(roleId));
}

/**
 * 멀티 선택된 직군의 합집합 도구 레일(Calm 8슬롯), 레이어 스택, AI 빈 직군 보완,
 * 출고 전 체크리스트, 이주 단축키 프리셋을 순수 함수로 합성한다.
 */
export function composeMultiRoleWorkspace(
  selectedRoleInputs: readonly StudioCreatorRoleInputId[],
  options: ComposeMultiRoleOptions = {},
): MultiRoleWorkspaceComposition {
  const normalized = normalizeCreatorRoleIds(selectedRoleInputs);
  const fallbackApplied = normalized.length === 0;
  const selectedRoles = fallbackApplied ? DEFAULT_FALLBACK_ROLES : normalized;
  const selectedSet = new Set<StudioCreatorRoleId>(selectedRoles);
  const selectedRoleSpecs = selectedRoles.map((id) => STUDIO_CREATOR_ROLES[id]);

  const rawCap = options.maxToolSlots ?? CALM_TOOL_RAIL_BUDGET;
  const maxToolSlots = Math.max(1, Math.min(CALM_TOOL_RAIL_BUDGET, Math.floor(rawCap)));
  const enableAiBackfill = options.enableAiBackfill ?? true;

  // 1. 도구 합집합: 같은 스프라이트/기능 중복 ID를 병합하되 최고 우선순위 유지, Calm 8슬롯 캡 준수
  const toolById = new Map<string, RoleToolSlotSpec>();
  for (const spec of selectedRoleSpecs) {
    for (const tool of spec.tools) {
      const existing = toolById.get(tool.id);
      if (!existing || tool.priority > existing.priority) {
        toolById.set(tool.id, tool);
      }
    }
  }
  const rankedTools = [...toolById.values()].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return a.id.localeCompare(b.id);
  });
  const primaryToolRailSlots = rankedTools.slice(0, maxToolSlots);
  const overflowToolSlots = rankedTools.slice(maxToolSlots);

  // 2. 레이어 스택 자동 합성 (전 공정 기준 정렬 + 선택 직군은 editable, 미선택은 ai-assisted/reference-locked)
  const layerList: SynthesizedLayerStackItem[] = [];
  for (const roleId of STUDIO_CREATOR_ROLE_ORDER) {
    const spec = STUDIO_CREATOR_ROLES[roleId];
    const isHumanOwned = selectedSet.has(roleId);
    const accessMode: SynthesizedLayerStackItem["accessMode"] = isHumanOwned
      ? "editable"
      : enableAiBackfill
        ? "ai-assisted"
        : "reference-locked";

    for (const layer of spec.defaultLayers) {
      // 선택된 직군 레이어는 무조건 포함, 미선택 직군은 실제 출력에 관여하거나 AI 보완이 켜진 핵심 레이어만 참조 배치
      if (isHumanOwned || layer.exportIncluded || enableAiBackfill) {
        layerList.push({
          id: layer.id,
          name: layer.name,
          stageOrder: layer.stageOrder,
          blendMode: layer.blendMode,
          purposeKo: layer.purposeKo,
          ownerRoleId: roleId,
          ownerRoleLabelKo: spec.shortLabelKo,
          accessMode,
          exportIncluded: layer.exportIncluded,
        });
      }
    }
  }
  layerList.sort((a, b) => a.stageOrder - b.stageOrder);

  // 3. 빈 직군 → AI 팀원 자동 보완
  const aiBackfillAssignments: AiRoleBackfillAssignment[] = [];
  if (enableAiBackfill) {
    for (const roleId of STUDIO_CREATOR_ROLE_ORDER) {
      if (selectedSet.has(roleId)) continue;
      const spec = STUDIO_CREATOR_ROLES[roleId];
      aiBackfillAssignments.push({
        roleId,
        roleLabelKo: spec.labelKo,
        partnerNameKo: spec.aiBackfill.partnerNameKo,
        scopeKo: spec.aiBackfill.scopeKo,
        approvalMode: spec.aiBackfill.defaultMode,
        estimatedWeeklySavedHours: spec.aiBackfill.estimatedWeeklySavedHours,
        spritePath: spec.aiBackfill.spritePath,
      });
    }
  }

  const totalEstimatedWeeklySavedHours = Number(
    aiBackfillAssignments
      .reduce((sum, item) => sum + item.estimatedWeeklySavedHours, 0)
      .toFixed(1),
  );

  // 4. 출고 전 체크리스트 합집합
  const preExportChecklist: ComposedChecklistItem[] = [];
  const seenCheckText = new Set<string>();
  for (const spec of selectedRoleSpecs) {
    spec.exportChecklist.forEach((textKo, index) => {
      if (seenCheckText.has(textKo)) return;
      seenCheckText.add(textKo);
      preExportChecklist.push({
        id: `chk-${spec.id}-${index}`,
        textKo,
        sourceRoleId: spec.id,
        required: true,
      });
    });
  }
  UNIVERSAL_EXPORT_GATES.forEach((textKo, index) => {
    if (seenCheckText.has(textKo)) return;
    seenCheckText.add(textKo);
    preExportChecklist.push({
      id: `chk-universal-${index}`,
      textKo,
      sourceRoleId: "universal",
      required: true,
    });
  });

  // 5. 단축키 프리셋 결합 (선택된 직군 카테고리에 해당하는 바인딩 우선 정렬)
  const presetId: ShortcutMigrationPresetId = options.shortcutPresetId ?? "csp";
  const shortcutPreset = MIGRATION_SHORTCUT_PRESETS[presetId];
  const activeCategories = new Set<RoleDomainCategory>(
    selectedRoleSpecs.map((spec) => spec.category),
  );
  const prioritizedShortcuts = [...shortcutPreset.bindings].sort((a, b) => {
    const aMatch = a.categories.some((cat) => activeCategories.has(cat)) ? 1 : 0;
    const bMatch = b.categories.some((cat) => activeCategories.has(cat)) ? 1 : 0;
    return bMatch - aMatch;
  });

  // 6. 커버리지 요약 및 추천 거버넌스 티어
  const humanRoleCount = selectedRoles.length;
  const recommendedGovernanceTierId =
    humanRoleCount >= 9
      ? "agency-30plus"
      : humanRoleCount >= 5
        ? "solo"
        : humanRoleCount >= 3
          ? "duo-trio"
          : "studio-8";

  return {
    selectedRoles,
    selectedRoleSpecs,
    fallbackApplied,
    maxToolSlots,
    primaryToolRailSlots,
    overflowToolSlots,
    synthesizedLayerStack: layerList,
    aiBackfillAssignments,
    totalEstimatedWeeklySavedHours,
    preExportChecklist,
    shortcutPreset,
    prioritizedShortcuts,
    coverageSummary: {
      humanRoleCount,
      aiBackfilledCount: aiBackfillAssignments.length,
      totalStudioRoles: STUDIO_CREATOR_ROLE_ORDER.length,
      railSlotsUsed: primaryToolRailSlots.length,
      railBudgetCap: maxToolSlots,
      recommendedGovernanceTierId,
    },
  };
}
