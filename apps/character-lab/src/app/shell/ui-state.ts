/**
 * 셸 UI 상태(활성 슬롯·인스펙터 탭·드로잉 모드).
 * 레시피와 무관한 화면 상태라 LabState·history에 넣지 않는다.
 * 패널은 lab-store-context의 useUiState()/useUiActions()로 읽고 바꾼다(선택 사항).
 */
import { SLOT_KINDS } from "../../contracts";

import type { SlotKind } from "../../contracts";

export const INSPECTOR_TAB_IDS = ["param", "expression", "pose", "physics", "render", "paint", "vision", "package", "export"] as const;
export type InspectorTabId = (typeof INSPECTOR_TAB_IDS)[number];

export const INSPECTOR_TAB_LABELS_KO: Readonly<Record<InspectorTabId, string>> = {
  param: "파라미터",
  expression: "표정",
  pose: "포즈",
  physics: "물리",
  render: "렌더",
  paint: "페인트",
  vision: "비전",
  package: "제작 패키지",
  export: "내보내기",
};

export interface UiState {
  readonly activeSlot: SlotKind;
  readonly inspectorTab: InspectorTabId;
  /** 뷰포트 포인터가 카메라 조작이 아니라 모델 위 드로잉으로 동작하는지 */
  readonly drawingMode: boolean;
}

export const DEFAULT_UI_STATE: UiState = Object.freeze({ activeSlot: "face-shape", inspectorTab: "param", drawingMode: false });

/**
 * VRoid Hub 서브 라우트(/edit, /tracking, /embed, /photobooth) + Clip Studio 4단계 가이드를 결합한
 * Character Lab 5단계 가이드 창작 스테퍼.
 */
export type CharacterLabWorkflowStageId =
  | "1-proportion"
  | "2-wardrobe-groom"
  | "3-pose-gaze"
  | "4-ink-paint"
  | "5-render-export";

export interface CharacterLabWorkflowStageSpec {
  readonly id: CharacterLabWorkflowStageId;
  readonly stepNumber: 1 | 2 | 3 | 4 | 5;
  readonly labelKo: string;
  readonly competitorRouteBadge: string;
  readonly targetSlot: SlotKind;
  readonly targetTab: InspectorTabId;
  readonly drawingMode: boolean;
}

export const CHARACTER_LAB_WORKFLOW_STAGES: readonly CharacterLabWorkflowStageSpec[] = Object.freeze([
  { id: "1-proportion", stepNumber: 1, labelKo: "1. 두상·체형", competitorRouteBadge: "CSP #11034 · /edit", targetSlot: "face-shape", targetTab: "param", drawingMode: false },
  { id: "2-wardrobe-groom", stepNumber: 2, labelKo: "2. 헤어·의상", competitorRouteBadge: "VRoid Studio · /wear", targetSlot: "hair", targetTab: "physics", drawingMode: false },
  { id: "3-pose-gaze", stepNumber: 3, labelKo: "3. 포즈·시선", competitorRouteBadge: "VRoid Hub · /tracking", targetSlot: "pose", targetTab: "pose", drawingMode: false },
  { id: "4-ink-paint", stepNumber: 4, labelKo: "4. 3D 펜선·페인트", competitorRouteBadge: "CSP #10495 · /embed", targetSlot: "face-shape", targetTab: "paint", drawingMode: true },
  { id: "5-render-export", stepNumber: 5, labelKo: "5. 포토부스·내보내기", competitorRouteBadge: "VRoid Hub · /photobooth", targetSlot: "lighting", targetTab: "export", drawingMode: false },
]);

export function resolveActiveWorkflowStageId(state: UiState): CharacterLabWorkflowStageId {
  if (state.drawingMode || state.inspectorTab === "paint") return "4-ink-paint";
  if (state.inspectorTab === "export" || state.inspectorTab === "render" || state.inspectorTab === "package") return "5-render-export";
  if (state.inspectorTab === "pose" || state.inspectorTab === "vision" || state.activeSlot === "pose") return "3-pose-gaze";
  if (state.inspectorTab === "physics" || state.activeSlot === "hair" || state.activeSlot === "outfit") return "2-wardrobe-groom";
  return "1-proportion";
}

export function isSlotKind(value: string): value is SlotKind {
  return (SLOT_KINDS as readonly string[]).includes(value);
}

export function parseLabRouteSearchParams(search: string): Partial<UiState> {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const stageId = params.get("stage");
  const matchedStage = CHARACTER_LAB_WORKFLOW_STAGES.find((s) => s.id === stageId);
  const patch: { activeSlot?: SlotKind; inspectorTab?: InspectorTabId; drawingMode?: boolean } = {};
  if (matchedStage) {
    patch.activeSlot = matchedStage.targetSlot;
    patch.inspectorTab = matchedStage.targetTab;
    patch.drawingMode = matchedStage.drawingMode;
  }
  const slot = params.get("slot");
  if (slot && isSlotKind(slot)) patch.activeSlot = slot;
  const tab = params.get("tab");
  if (tab && isInspectorTabId(tab)) patch.inspectorTab = tab;
  const draw = params.get("draw");
  if (draw === "1" || draw === "true") patch.drawingMode = true;
  else if (draw === "0" || draw === "false") patch.drawingMode = false;
  return patch;
}

export function serializeLabRouteSearchParams(state: UiState): string {
  const params = new URLSearchParams();
  params.set("stage", resolveActiveWorkflowStageId(state));
  params.set("slot", state.activeSlot);
  params.set("tab", state.inspectorTab);
  if (state.drawingMode) params.set("draw", "1");
  return `?${params.toString()}`;
}

export interface UiStateStore {
  getState(): UiState;
  setActiveSlot(slot: SlotKind): void;
  setInspectorTab(tab: InspectorTabId): void;
  setDrawingMode(enabled: boolean): void;
  subscribe(listener: () => void): () => void;
}

export function isInspectorTabId(value: string): value is InspectorTabId {
  return (INSPECTOR_TAB_IDS as readonly string[]).includes(value);
}

export function createUiStateStore(initial: Partial<UiState> = {}): UiStateStore {
  let state: UiState = { ...DEFAULT_UI_STATE, ...initial };
  const listeners = new Set<() => void>();
  const update = (patch: Partial<UiState>): void => {
    const next: UiState = { ...state, ...patch };
    if (next.activeSlot === state.activeSlot && next.inspectorTab === state.inspectorTab && next.drawingMode === state.drawingMode) return;
    state = next;
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    setActiveSlot: (slot) => update({ activeSlot: slot }),
    setInspectorTab: (tab) => update({ inspectorTab: tab }),
    setDrawingMode: (enabled) => update({ drawingMode: enabled }),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
