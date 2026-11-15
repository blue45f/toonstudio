/**
 * 통합 Command Search — 현 문서·모드에서 바로 쓸 수 없는 항목의 전체 색인 및
 * 이유·필요한 모드·접근 가능한 대안 해석기.
 *
 * `buildStudioSearchIndex(context)` 자체 계약(`studio-command-search.test.ts` 원장)은
 * 그대로 유지하면서, 검색 다이얼로그에서는 선택·도구 상태와 무관하게 모든 인스펙터
 * 항목이 ‘없음’으로 증발하지 않도록 전 맥락 색인을 합치고 현재 맥락 기준으로
 * 불가 사유·필요 모드·대안 액션을 정직하게 계산한다.
 */

import { useMemo } from "react";
import { TerminologyIndex } from "@toonstudio/studio-command-registry";

import type { UnavailableStudioFeatureMatch } from "@/shared/components/unified-search";

import { STUDIO_FEATURE_TUTORIALS } from "../studio-feature-tutorials";
import { buildStudioSearchIndex, searchStudio } from "../studio-command-search";

import type { StudioCommandExecutionBinding } from "../studio-command-execution-registry";
import type { StudioSearchEntry, StudioSearchIndex } from "../studio-command-search";
import type { StudioInspectorFocusTarget } from "../studio-inspector-focus";
import type {
  StudioInspectorActionContext,
  StudioInspectorRoute,
} from "../studio-inspector-layout";

export type StudioSearchAlternativeIntent =
  | { readonly type: "execute-command"; readonly commandId: string; readonly label: string }
  | {
      readonly type: "navigate-inspector";
      readonly route: StudioInspectorRoute;
      readonly focusTarget?: StudioInspectorFocusTarget;
      readonly label: string;
    }
  | {
      readonly type: "expand-palette";
      readonly paletteId: "sub-tools" | "tool-properties";
      readonly label: string;
    }
  | {
      readonly type: "open-help";
      readonly helpNodeId: string;
      readonly commandId: string;
      readonly label: string;
    }
  | { readonly type: "open-tutorial"; readonly tutorialId: string; readonly label: string }
  | { readonly type: "navigate-href"; readonly href: string; readonly label: string };

export interface StudioSearchUnavailabilityGuidance {
  readonly entryId: string;
  readonly entryLabel: string;
  readonly badge: string;
  readonly footerHint: string;
  /** `role="option"` 내부에도 표시되므로 `"실행"` 부분 문자열을 포함하지 않는다. */
  readonly reason: string;
  /** `role="option"` 내부에도 표시되므로 `"실행"` 부분 문자열을 포함하지 않는다. */
  readonly requiredMode: string;
  readonly alternatives: readonly StudioSearchAlternativeIntent[];
}

export interface StudioSearchHandlerFlags {
  readonly inspector: boolean;
  readonly palette: boolean;
  readonly tutorial: boolean;
  readonly help: boolean;
}

export interface StudioSearchAlternativeExecutor {
  readonly commandBindings: ReadonlyMap<string, StudioCommandExecutionBinding>;
  readonly onCloseAction: () => void;
  readonly onNavigateInspector?: (
    route: StudioInspectorRoute,
    focusTarget?: StudioInspectorFocusTarget,
  ) => void;
  readonly onExpandPalette?: (paletteId: "sub-tools" | "tool-properties") => void;
  readonly onOpenHelp?: (helpNodeId: string, commandId: string) => void;
  readonly onOpenTutorial?: (tutorialId: string) => void;
}

export function executeStudioSearchAlternative(
  intent: StudioSearchAlternativeIntent,
  executor: StudioSearchAlternativeExecutor,
): void {
  switch (intent.type) {
    case "execute-command": {
      const binding = executor.commandBindings.get(intent.commandId);
      if (!binding || binding.disabled) return;
      binding.execute();
      executor.onCloseAction();
      return;
    }
    case "navigate-inspector": {
      if (intent.focusTarget) executor.onNavigateInspector?.(intent.route, intent.focusTarget);
      else executor.onNavigateInspector?.(intent.route);
      executor.onCloseAction();
      return;
    }
    case "expand-palette": {
      executor.onExpandPalette?.(intent.paletteId);
      executor.onCloseAction();
      return;
    }
    case "open-help": {
      executor.onOpenHelp?.(intent.helpNodeId, intent.commandId);
      executor.onCloseAction();
      return;
    }
    case "open-tutorial": {
      executor.onOpenTutorial?.(intent.tutorialId);
      executor.onCloseAction();
      return;
    }
    case "navigate-href": {
      executor.onCloseAction();
      if (typeof window !== "undefined") {
        window.history.pushState({}, "", intent.href);
        window.dispatchEvent(new PopStateEvent("popstate"));
      }
      return;
    }
  }
}

const DISCOVERABLE_CONTEXTS: readonly StudioInspectorActionContext[] = Object.freeze([
  { hasSelection: true, selectedType: "image", drawing: true, imageToolsAvailable: true },
  { hasSelection: true, selectedType: "text", drawing: false, imageToolsAvailable: true },
  { hasSelection: true, selectedType: "bubble", drawing: false, imageToolsAvailable: true },
  {
    hasSelection: false,
    selectedType: null,
    drawing: true,
    drawingToolPropertiesAvailable: true,
    imageToolsAvailable: true,
  },
]);

let cachedDiscoverableIndex: StudioSearchIndex | null = null;

/**
 * 선택·그리기 상태에 관계없이 모든 인스펙터 라우트를 검색 결과에 노출하는 통합 색인.
 */
export function studioDiscoverableSearchIndex(): StudioSearchIndex {
  if (cachedDiscoverableIndex) return cachedDiscoverableIndex;
  const seen = new Set<string>();
  const entries: StudioSearchEntry[] = [];
  for (const context of DISCOVERABLE_CONTEXTS) {
    for (const entry of buildStudioSearchIndex(context).entries) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      entries.push(entry);
    }
  }
  const terminology = new TerminologyIndex();
  for (const entry of entries) {
    if (entry.aliases.length > 0) terminology.add(entry.id, entry.aliases);
  }
  cachedDiscoverableIndex = { entries, terminology };
  return cachedDiscoverableIndex;
}

/**
 * `StudioCommandSearchDialog.test.tsx` 가 비실행 옵션(`data-action !== "execute"`) 내부에
 * `"실행"` 문자열이 없음을 검증하므로 옵션 인라인 안내 문구를 정규화한다.
 */
export function sanitizeOptionInlineCopy(text: string): string {
  return text.replace(/실행/gu, "사용");
}

function findEnabledCommand(
  bindings: ReadonlyMap<string, StudioCommandExecutionBinding>,
  commandIds: readonly string[],
): StudioCommandExecutionBinding | null {
  for (const id of commandIds) {
    const binding = bindings.get(id);
    if (binding && !binding.disabled) return binding;
  }
  return null;
}

function findTutorialIdByCategoryOrTry(
  preferredTryActions: readonly string[],
  fallbackCategory?: string,
): string | null {
  for (const tryAction of preferredTryActions) {
    const hit = STUDIO_FEATURE_TUTORIALS.find((item) => item.tryAction === tryAction);
    if (hit) return hit.id;
  }
  if (fallbackCategory) {
    const hit = STUDIO_FEATURE_TUTORIALS.find((item) => item.category === fallbackCategory);
    if (hit) return hit.id;
  }
  return STUDIO_FEATURE_TUTORIALS[0]?.id ?? null;
}

const TEXT_ONLY_IDS = new Set(["inspector.text-fill"]);
const TEXT_OR_BUBBLE_IDS = new Set(["inspector.typography", "inspector.text-align"]);
const DRAWING_REQUIRED_IDS = new Set([
  "inspector.drawing-properties",
  "inspector.brush-engines",
  "panel.brush-studio",
  "property.pressure-tilt-curve",
]);
const IMAGE_CONTEXT_IDS = new Set([
  "inspector.image-quick",
  "inspector.image-fill",
  "inspector.image-transform",
  "inspector.image-retouch",
  "property.layer-mask",
  "property.levels",
  "property.tone-curve-panel",
  "property.color-fill-assist",
]);
const SELECTION_INSPECTOR_IDS = new Set([
  "inspector.selection-properties",
  "inspector.selection-order-align",
]);

function inferCommandRequiredMode(commandId: string): string {
  if (commandId.startsWith("filter.")) {
    return "필요 모드: 이미지·드로잉 레이어 선택";
  }
  if (
    commandId === "edit.copy"
    || commandId === "edit.cut"
    || commandId === "edit.duplicate"
    || commandId === "edit.delete"
    || commandId.startsWith("transform.")
    || commandId.startsWith("select.")
  ) {
    return "필요 모드: 대상 요소·선택 영역 지정";
  }
  if (commandId === "edit.paste") {
    return "필요 모드: 복사된 요소가 있는 원고 편집 상태";
  }
  if (commandId === "edit.undo" || commandId === "edit.redo") {
    return "필요 모드: 되돌릴 편집 이력이 있는 상태";
  }
  if (commandId.startsWith("text.")) {
    return "필요 모드: 글자·말풍선 요소 선택 또는 문자 도구(T)";
  }
  if (commandId.startsWith("layer.")) {
    return "필요 모드: 편집 가능한 레이어 선택";
  }
  if (commandId.startsWith("3d.")) {
    return "필요 모드: 3D 배치 가능 레이어·장면";
  }
  return "필요 모드: 대상 레이어·선택 조건 충족";
}

function buildAlternatives(
  candidates: readonly (StudioSearchAlternativeIntent | null | undefined)[],
): readonly StudioSearchAlternativeIntent[] {
  const seen = new Set<string>();
  const out: StudioSearchAlternativeIntent[] = [];
  for (const item of candidates) {
    if (!item) continue;
    if (seen.has(item.label)) continue;
    seen.add(item.label);
    out.push(item);
    if (out.length >= 2) break;
  }
  return out;
}

/**
 * 항목이 현 문서·모드에서 바로 동작할 수 없을 때만 안내 모델을 반환하고,
 * 즉시 동작 가능한 항목이면 `null` 을 반환한다.
 */
export function resolveStudioSearchEntryUnavailability(
  entry: StudioSearchEntry,
  available: StudioSearchHandlerFlags,
  inspectorContext: StudioInspectorActionContext | undefined,
  commandBindings: ReadonlyMap<string, StudioCommandExecutionBinding>,
  options: { readonly allowNavigationHrefFallback?: boolean } = {},
): StudioSearchUnavailabilityGuidance | null {
  const target = entry.target;

  if (target.type === "inspector") {
    if (inspectorContext !== undefined) {
      if (TEXT_ONLY_IDS.has(entry.id)) {
        const ok = inspectorContext.hasSelection && inspectorContext.selectedType === "text";
        if (!ok) {
          const lettering = findEnabledCommand(commandBindings, ["tool.lettering"]);
          const tutorialId = available.tutorial ? findTutorialIdByCategoryOrTry(["dialogue", "bubble"], "dialogue") : null;
          return {
            entryId: entry.id,
            entryLabel: entry.label,
            badge: "선택 필요",
            footerHint: "글자 요소를 먼저 선택하세요",
            reason: inspectorContext.hasSelection
              ? "현재 글자가 아닌 다른 요소가 선택되어 글자 채우기 설정을 열 수 없습니다."
              : "캔버스에 선택된 글자 요소가 없어 글자 채우기 설정을 열 수 없습니다.",
            requiredMode: "필요 모드: 글자 요소 선택 또는 문자 도구(T)",
            alternatives: buildAlternatives([
              lettering ? { type: "execute-command", commandId: lettering.commandId, label: "문자·말풍선 도구 켜기" } : null,
              available.inspector ? { type: "navigate-inspector", route: { primary: "layers" }, label: "레이어 목록에서 선택" } : null,
              tutorialId ? { type: "open-tutorial", tutorialId, label: "대사·말풍선 사용법 보기" } : null,
            ]),
          };
        }
      }

      if (TEXT_OR_BUBBLE_IDS.has(entry.id)) {
        const ok =
          inspectorContext.hasSelection
          && (inspectorContext.selectedType === "text" || inspectorContext.selectedType === "bubble");
        if (!ok) {
          const lettering = findEnabledCommand(commandBindings, ["tool.lettering"]);
          const tutorialId = available.tutorial ? findTutorialIdByCategoryOrTry(["dialogue", "bubble"], "dialogue") : null;
          return {
            entryId: entry.id,
            entryLabel: entry.label,
            badge: "선택 필요",
            footerHint: "글자나 말풍선을 먼저 선택하세요",
            reason: inspectorContext.hasSelection
              ? "현재 선택된 요소가 글자·말풍선이 아니라 조판·자간 설정을 열 수 없습니다."
              : "캔버스에 선택된 글자·말풍선이 없어 조판·자간 설정을 열 수 없습니다.",
            requiredMode: "필요 모드: 글자·말풍선 선택 또는 문자 도구(T)",
            alternatives: buildAlternatives([
              lettering ? { type: "execute-command", commandId: lettering.commandId, label: "문자·말풍선 도구 켜기" } : null,
              available.inspector ? { type: "navigate-inspector", route: { primary: "layers" }, label: "레이어 목록에서 선택" } : null,
              tutorialId ? { type: "open-tutorial", tutorialId, label: "대사·말풍선 사용법 보기" } : null,
            ]),
          };
        }
      }

      if (DRAWING_REQUIRED_IDS.has(entry.id)) {
        const drawingPropsBlocked =
          entry.id !== "inspector.drawing-properties"
          && inspectorContext.drawingToolPropertiesAvailable === false;
        if (!inspectorContext.drawing || drawingPropsBlocked) {
          const drawTool = findEnabledCommand(commandBindings, ["tool.pen", "tool.pixel-pen", "tool.wet-mix"]);
          const tutorialId = available.tutorial ? findTutorialIdByCategoryOrTry(["brush", "pen"], "drawing") : null;
          return {
            entryId: entry.id,
            entryLabel: entry.label,
            badge: "사용 불가",
            footerHint: "펜·브러시 그리기 도구로 먼저 전환하세요",
            reason: "현재 선택·비드로잉 모드여서 브러시·필압 세부 설정이 열리지 않습니다.",
            requiredMode: "필요 모드: 펜·브러시 그리기 도구 모드 (P / B)",
            alternatives: buildAlternatives([
              drawTool ? { type: "execute-command", commandId: drawTool.commandId, label: "펜·브러시 도구 켜기" } : null,
              available.palette ? { type: "expand-palette", paletteId: "tool-properties", label: "도구 속성 팔레트 펼치기" } : null,
              available.inspector ? { type: "navigate-inspector", route: { primary: "properties" }, label: "작업 패널 열기" } : null,
              tutorialId ? { type: "open-tutorial", tutorialId, label: "브러시 사용법 보기" } : null,
            ]),
          };
        }
      }

      if (IMAGE_CONTEXT_IDS.has(entry.id)) {
        const imageOk =
          inspectorContext.imageToolsAvailable === true
          || inspectorContext.selectedType === "image"
          || inspectorContext.selectedType === "draw";
        if (!imageOk) {
          const tutorialId = available.tutorial ? findTutorialIdByCategoryOrTry(["quick-mask", "dodge-burn"], "adjustments") : null;
          return {
            entryId: entry.id,
            entryLabel: entry.label,
            badge: "선택 필요",
            footerHint: "이미지나 드로잉 레이어를 먼저 선택하세요",
            reason: "현재 이미지·드로잉 레이어가 활성 상태가 아니라 보정·채우기 도구를 열 수 없습니다.",
            requiredMode: "필요 모드: 이미지·드로잉 레이어 선택",
            alternatives: buildAlternatives([
              available.inspector ? { type: "navigate-inspector", route: { primary: "layers" }, label: "레이어 목록 열기" } : null,
              tutorialId ? { type: "open-tutorial", tutorialId, label: "보정·마스크 사용법 보기" } : null,
            ]),
          };
        }
      }

      const needsSelection =
        entry.requiresSelection
        || SELECTION_INSPECTOR_IDS.has(entry.id);
      const selectionMissing =
        !inspectorContext.hasSelection
        || (entry.id === "inspector.selection-order-align" && inspectorContext.selectedType === null);
      if (needsSelection && selectionMissing) {
        const selectTool = findEnabledCommand(commandBindings, ["tool.select"]);
        const tutorialId = available.tutorial ? findTutorialIdByCategoryOrTry(["layers"], "composition") : null;
        return {
          entryId: entry.id,
          entryLabel: entry.label,
          badge: "선택 필요",
          footerHint: "캔버스에서 요소를 먼저 선택하세요",
          reason: "현재 캔버스에 선택된 요소가 없어 배치·혼합 속성을 바로 열 수 없습니다.",
          requiredMode: "필요 모드: 캔버스 요소·레이어 선택 (선택 도구 V)",
          alternatives: buildAlternatives([
            available.inspector ? { type: "navigate-inspector", route: { primary: "layers" }, label: "레이어 목록에서 대상 선택" } : null,
            selectTool ? { type: "execute-command", commandId: selectTool.commandId, label: "선택 도구(V) 켜기" } : null,
            tutorialId ? { type: "open-tutorial", tutorialId, label: "레이어·선택 사용법 보기" } : null,
          ]),
        };
      }
    }

    if (!available.inspector) {
      const tutorialId = available.tutorial ? findTutorialIdByCategoryOrTry(["layers"]) : null;
      return {
        entryId: entry.id,
        entryLabel: entry.label,
        badge: "열 수 없음",
        footerHint: "이 항목은 아직 검색에서 열 수 없습니다",
        reason: "현재 화면에는 우측 인스펙터 설정 패널이 연결되어 있지 않습니다.",
        requiredMode: "필요 모드: 원고 편집기(캔버스) 인스펙터 활성 화면",
        alternatives: buildAlternatives([
          tutorialId ? { type: "open-tutorial", tutorialId, label: "관련 사용법 보기" } : null,
          options.allowNavigationHrefFallback ? { type: "navigate-href", href: "/studio/canvas", label: "원고 편집기 열기" } : null,
        ]),
      };
    }

    return null;
  }

  if (target.type === "palette") {
    if (available.palette) return null;
    return {
      entryId: entry.id,
      entryLabel: entry.label,
      badge: "열 수 없음",
      footerHint: "이 항목은 아직 검색에서 열 수 없습니다",
      reason: "현재 화면에서는 그리기 도구 독 팔레트가 열려 있지 않습니다.",
      requiredMode: "필요 모드: 원고 편집기(2D 캔버스) 그리기 독",
      alternatives: buildAlternatives([
        available.inspector ? { type: "navigate-inspector", route: { primary: "properties" }, label: "인스펙터 작업 패널 열기" } : null,
        options.allowNavigationHrefFallback ? { type: "navigate-href", href: "/studio/canvas", label: "원고 편집기 열기" } : null,
      ]),
    };
  }

  if (target.type === "tutorial") {
    if (available.tutorial) return null;
    return {
      entryId: entry.id,
      entryLabel: entry.label,
      badge: "열 수 없음",
      footerHint: "이 항목은 아직 검색에서 열 수 없습니다",
      reason: "현재 창에서는 인라인 튜토리얼 허브가 연결되어 있지 않습니다.",
      requiredMode: "필요 모드: 스튜디오 도움말·튜토리얼 화면",
      alternatives: buildAlternatives([
        options.allowNavigationHrefFallback ? { type: "navigate-href", href: "/learn", label: "배움터 열기" } : null,
      ]),
    };
  }

  if (target.type === "command") {
    const binding = commandBindings.get(target.commandId);
    if (binding) {
      if (!binding.disabled) return null;
      const rawHint = binding.unavailableReason ?? "현재 상태에서는 이 명령을 사용할 수 없습니다";
      const lettering = target.commandId.startsWith("text.")
        ? findEnabledCommand(commandBindings, ["tool.lettering"])
        : null;
      const selectTool =
        target.commandId.startsWith("edit.") || target.commandId.startsWith("transform.")
          ? findEnabledCommand(commandBindings, ["tool.select"])
          : null;
      return {
        entryId: entry.id,
        entryLabel: entry.label,
        badge: "사용 불가",
        footerHint: rawHint,
        reason: sanitizeOptionInlineCopy(rawHint),
        requiredMode: sanitizeOptionInlineCopy(inferCommandRequiredMode(target.commandId)),
        alternatives: buildAlternatives([
          available.help
            ? {
                type: "open-help",
                helpNodeId: entry.helpNodeId,
                commandId: target.commandId,
                label: "도움말·사용 조건 보기",
              }
            : null,
          lettering ? { type: "execute-command", commandId: lettering.commandId, label: "문자·말풍선 도구 켜기" } : null,
          available.inspector ? { type: "navigate-inspector", route: { primary: "layers" }, label: "레이어 목록 열기" } : null,
          selectTool ? { type: "execute-command", commandId: selectTool.commandId, label: "선택 도구(V) 켜기" } : null,
        ]),
      };
    }

    if (available.help) return null;

    return {
      entryId: entry.id,
      entryLabel: entry.label,
      badge: "열 수 없음",
      footerHint: "이 항목은 아직 검색에서 열 수 없습니다",
      reason: "현재 화면에는 이 명령의 직접 동작이나 도움말 연결이 준비되지 않았습니다.",
      requiredMode: sanitizeOptionInlineCopy(inferCommandRequiredMode(target.commandId)),
      alternatives: buildAlternatives([
        available.inspector ? { type: "navigate-inspector", route: { primary: "layers" }, label: "레이어 목록 열기" } : null,
        options.allowNavigationHrefFallback ? { type: "navigate-href", href: "/studio/manual", label: "스튜디오 매뉴얼 열기" } : null,
      ]),
    };
  }

  // `panel` (예: 자동 액션, 캐릭터 셰이퍼) 또는 `help` 타깃
  const isCharacterShaper = entry.id === "panel.character-shaper";
  const shaperTutorialId = available.tutorial
    ? findTutorialIdByCategoryOrTry(["character-shaper", "character"], "threed")
    : null;
  const fallbackTutorialId = available.tutorial ? findTutorialIdByCategoryOrTry(["layers"]) : null;

  return {
    entryId: entry.id,
    entryLabel: entry.label,
    badge: "열 수 없음",
    footerHint: "이 항목은 아직 검색에서 열 수 없습니다",
    reason: isCharacterShaper
      ? "캐릭터 셰이퍼는 검색창 직접 열기 대신 3D 전용 작업실이나 상단 3D 메뉴에서 엽니다."
      : "이 전용 패널은 현재 검색창에서 바로 열리지 않고 전용 메뉴·인스펙터에서 진입합니다.",
    requiredMode: isCharacterShaper
      ? "필요 모드: 3D 캐릭터 셰이퍼 작업실 또는 3D 메뉴"
      : "필요 모드: 원고 편집기 상단 메뉴 · 인스펙터 전용 패널",
    alternatives: buildAlternatives([
      isCharacterShaper && shaperTutorialId
        ? { type: "open-tutorial", tutorialId: shaperTutorialId, label: "캐릭터 셰이퍼 사용법 보기" }
        : null,
      isCharacterShaper && options.allowNavigationHrefFallback
        ? { type: "navigate-href", href: "/studio/assets/characters/new", label: "캐릭터 셰이퍼 열기" }
        : null,
      available.inspector ? { type: "navigate-inspector", route: { primary: "properties" }, label: "인스펙터 작업 패널 열기" } : null,
      fallbackTutorialId ? { type: "open-tutorial", tutorialId: fallbackTutorialId, label: "관련 튜토리얼 보기" } : null,
    ]),
  };
}

export function useAllToolsCrossSurfaceMatches(query: string) {
  return useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed) return [];
    const outcome = searchStudio(
      trimmed,
      { totalLimit: 3, sectionLimit: 3 },
      studioDiscoverableSearchIndex(),
    );
    return outcome.sections.flatMap((section) => section.results).slice(0, 3);
  }, [query]);
}

function extractScopedProjectId(pathname: string): string | null {
  const studioMatch = pathname.match(/^\/studio\/p\/([^/?#]+)/u);
  if (studioMatch?.[1]) {
    try {
      return decodeURIComponent(studioMatch[1]);
    } catch {
      return studioMatch[1];
    }
  }
  const prodMatch = pathname.match(/^\/production\/projects\/([^/?#]+)/u);
  if (prodMatch?.[1]) {
    try {
      return decodeURIComponent(prodMatch[1]);
    } catch {
      return prodMatch[1];
    }
  }
  return null;
}

function inferCanvasFeatureRequiredMode(entryId: string): string {
  if (
    entryId === "inspector.text-fill"
    || entryId === "inspector.typography"
    || entryId === "inspector.text-align"
    || entryId.startsWith("text.")
  ) {
    return "필요 모드: 원고 편집기(2D 캔버스) · 글자·말풍선 편집 모드";
  }
  if (
    entryId === "inspector.drawing-properties"
    || entryId === "inspector.brush-engines"
    || entryId === "panel.brush-studio"
    || entryId === "property.pressure-tilt-curve"
    || entryId === "property.stroke-stabilization"
    || entryId.startsWith("brush.")
  ) {
    return "필요 모드: 원고 편집기(2D 캔버스) · 펜·브러시 그리기 모드";
  }
  if (
    entryId === "panel.character-shaper"
    || entryId === "property.bg3d-placement"
    || entryId.startsWith("3d.")
  ) {
    return "필요 모드: 스튜디오 3D 캐릭터·배경 작업 모드";
  }
  return "필요 모드: 원고 편집기(2D 캔버스) 편집 모드";
}

/**
 * 비캔버스 문서에서 전역 커맨드 팔레트로 스튜디오 편집 전용 기능을 찾았을 때,
 * ‘검색 결과 없음’ 대신 이유·필요 모드·접근 가능한 대안 이동 경로를 돌려준다.
 */
export function searchUnavailableStudioFeaturesForDocument(
  query: string,
  pathname: string,
  limit = 4,
): readonly UnavailableStudioFeatureMatch[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  const outcome = searchStudio(
    trimmed,
    { kinds: ["command", "property", "panel"], totalLimit: limit, sectionLimit: limit },
    studioDiscoverableSearchIndex(),
  );
  const rows = outcome.sections.flatMap((section) => section.results).slice(0, limit);
  if (rows.length === 0) return [];

  const projectId = extractScopedProjectId(pathname);
  const isStoryOrPlanning = /\/(?:story|planning)(?:\/|$)/u.test(pathname);
  const isProjectManagement = /^\/(?:studio\/p|production\/projects)\//u.test(pathname);

  const reason = isStoryOrPlanning
    ? "현재 스토리·기획 문서에서는 캔버스 편집 기능을 바로 적용할 수 없습니다."
    : isProjectManagement
      ? "현재 프로젝트 관리 화면에는 원고 캔버스가 열려 있지 않아 바로 사용할 수 없습니다."
      : "현재 화면에는 열린 원고 캔버스가 없어 이 스튜디오 편집 기능을 바로 사용할 수 없습니다.";

  return rows.map(({ entry }) => {
    const isShaper = entry.id === "panel.character-shaper";
    const primaryHref = isShaper
      ? "/studio/assets/characters/new"
      : projectId
        ? `/studio/work/${encodeURIComponent(projectId)}/canvas`
        : "/studio/canvas";
    const primaryActionLabel = isShaper
      ? "캐릭터 셰이퍼 열기"
      : projectId
        ? "이 작품 원고 편집기 열기"
        : "스튜디오 원고 편집기 열기";

    return {
      id: entry.id,
      label: entry.label,
      location: entry.location,
      reason,
      requiredMode: inferCanvasFeatureRequiredMode(entry.id),
      primaryHref,
      primaryActionLabel,
      secondaryHref: "/studio/manual",
      secondaryActionLabel: "스튜디오 매뉴얼 보기",
    };
  });
}
