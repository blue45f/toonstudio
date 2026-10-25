/**
 * T9. 내장 워크스페이스 프리셋 3종 — CSP 벤치마킹.
 *
 * CSP(Clip Studio Paint)의 워크스페이스 전환 개념을 따른다:
 * 작업 단계마다 패널 배치를 통째로 바꾸는 고정 레이아웃이다.
 * 사용자 저장 레이아웃(workspace-layout-store)과 달리 읽기 전용이며
 * id가 "preset-" 으로 시작한다.
 */
import {
  createWorkspaceLayout,
  type WorkspaceLayout,
  type WorkspaceSlotId,
  type WorkspaceSlotLayout,
} from "./workspace-layout-model";

export const WORKSPACE_PRESET_INKING_ID = "preset-inking";
export const WORKSPACE_PRESET_COLORING_ID = "preset-coloring";
export const WORKSPACE_PRESET_MANGA_ID = "preset-manga";

export const WORKSPACE_PRESET_IDS: ReadonlyArray<string> = [
  WORKSPACE_PRESET_INKING_ID,
  WORKSPACE_PRESET_COLORING_ID,
  WORKSPACE_PRESET_MANGA_ID,
];

export const DEFAULT_WORKSPACE_PRESET_ID = WORKSPACE_PRESET_INKING_ID;

interface WorkspacePresetDefinition {
  id: string;
  name: string;
  description: string;
  slots: Record<WorkspaceSlotId, WorkspaceSlotLayout>;
}

function slot(
  panelIds: string[],
  size: number,
  collapsed = false,
): WorkspaceSlotLayout {
  return { panelIds, collapsed, size };
}

const PRESET_DEFINITIONS: ReadonlyArray<WorkspacePresetDefinition> = [
  {
    id: WORKSPACE_PRESET_INKING_ID,
    name: "잉킹용",
    description: "펜 작업에 집중 — 브러시와 레이어를 양옆에, 톤은 하단에 접어 둔다.",
    slots: {
      "left-rail": slot(["brush"], 0.22),
      "right-inspector": slot(["layers", "navigator"], 0.28),
      "bottom-dock": slot(["tone"], 0.22, true),
      floating: slot([], 0),
    },
  },
  {
    id: WORKSPACE_PRESET_COLORING_ID,
    name: "채색용",
    description: "색상 작업에 집중 — 색상·소재를 좌측에 넓게, 톤은 하단에 펼쳐 둔다.",
    slots: {
      "left-rail": slot(["color", "materials"], 0.26),
      "right-inspector": slot(["layers"], 0.28),
      "bottom-dock": slot(["tone"], 0.28, false),
      floating: slot([], 0),
    },
  },
  {
    id: WORKSPACE_PRESET_MANGA_ID,
    name: "만화용",
    description: "만화 원고 작업 — 소재·레퍼런스와 타임라인을 함께, 3D는 플로팅으로.",
    slots: {
      "left-rail": slot(["materials", "reference"], 0.24),
      "right-inspector": slot(["layers", "timeline"], 0.3),
      "bottom-dock": slot(["tone", "annotations"], 0.24),
      floating: slot(["3d"], 0),
    },
  },
];

/** 내장 프리셋 전체를 WorkspaceLayout 레코드로 반환한다. */
export function getWorkspaceLayoutPresets(now: number = Date.now()): WorkspaceLayout[] {
  return PRESET_DEFINITIONS.map((definition) =>
    createWorkspaceLayout(definition.name, definition.slots, { id: definition.id, now }),
  );
}

/** 프리셋 id로 조회. 없으면 undefined. */
export function findWorkspaceLayoutPreset(
  id: string,
  now: number = Date.now(),
): WorkspaceLayout | undefined {
  return getWorkspaceLayoutPresets(now).find((preset) => preset.id === id);
}

/** 프리셋 id인지 여부. */
export function isWorkspaceLayoutPresetId(id: string): boolean {
  return WORKSPACE_PRESET_IDS.includes(id);
}

/** 프리셋 설명 조회 (UI용). */
export function getWorkspacePresetDescription(id: string): string {
  return (
    PRESET_DEFINITIONS.find((definition) => definition.id === id)?.description ??
    CSP_SPWS_PRESET_DEFINITIONS.find((definition) => definition.id === id)?.description ??
    ""
  );
}

/**
 * 클립스튜디오 페인트 5.1.5 내장 워크스페이스(`presetMac_1.spws`~`presetMac_3.spws`) 대응 프리셋.
 * - `preset-csp-illustration`: 일러스트 (`presetMac_1.spws`)
 * - `preset-csp-comic`: 코믹 (`presetMac_2.spws`)
 * - `preset-csp-category`: 카테고리별 (`presetMac_3.spws`)
 */
export const CSP_WORKSPACE_PRESET_ILLUSTRATION_ID = "preset-csp-illustration";
export const CSP_WORKSPACE_PRESET_COMIC_ID = "preset-csp-comic";
export const CSP_WORKSPACE_PRESET_CATEGORY_ID = "preset-csp-category";

export const CSP_WORKSPACE_PRESET_IDS: ReadonlyArray<string> = [
  CSP_WORKSPACE_PRESET_ILLUSTRATION_ID,
  CSP_WORKSPACE_PRESET_COMIC_ID,
  CSP_WORKSPACE_PRESET_CATEGORY_ID,
];

const CSP_SPWS_PRESET_DEFINITIONS: ReadonlyArray<WorkspacePresetDefinition> = [
  {
    id: CSP_WORKSPACE_PRESET_ILLUSTRATION_ID,
    name: "일러스트",
    description:
      "CSP presetMac_1.spws 대응 — 좌측에 보조 도구·브러시·색상 팔레트, 우측에 내비게이터·레이어·레퍼런스를 배치한다.",
    slots: {
      "left-rail": slot(["brush", "color"], 0.24),
      "right-inspector": slot(["navigator", "layers", "reference"], 0.28),
      "bottom-dock": slot(["materials"], 0.22, true),
      floating: slot([], 0),
    },
  },
  {
    id: CSP_WORKSPACE_PRESET_COMIC_ID,
    name: "코믹",
    description:
      "CSP presetMac_2.spws 대응 — 만화 톤·소재·레이어 중심 배치 및 하단 타임라인·검수 주석 독 구성을 제공한다.",
    slots: {
      "left-rail": slot(["brush", "tone", "color"], 0.25),
      "right-inspector": slot(["navigator", "layers", "materials"], 0.3),
      "bottom-dock": slot(["timeline", "annotations"], 0.24, false),
      floating: slot(["3d"], 0),
    },
  },
  {
    id: CSP_WORKSPACE_PRESET_CATEGORY_ID,
    name: "카테고리별",
    description:
      "CSP presetMac_3.spws 대응 — 도구·색상·레이어·소재·타임라인을 카테고리 탭 그룹으로 묶어 균형 배치한다.",
    slots: {
      "left-rail": slot(["brush", "color", "reference"], 0.24),
      "right-inspector": slot(["layers", "navigator", "materials"], 0.28),
      "bottom-dock": slot(["tone", "timeline"], 0.24, false),
      floating: slot(["3d", "annotations"], 0),
    },
  },
];

/** CSP 5.1.5 `.spws` 내장 워크스페이스 프리셋 3종을 반환한다. */
export function getCspWorkspaceLayoutPresets(now: number = Date.now()): WorkspaceLayout[] {
  return CSP_SPWS_PRESET_DEFINITIONS.map((definition) =>
    createWorkspaceLayout(definition.name, definition.slots, { id: definition.id, now }),
  );
}

/** CSP `.spws` 프리셋 id로 조회한다. */
export function findCspWorkspaceLayoutPreset(
  id: string,
  now: number = Date.now(),
): WorkspaceLayout | undefined {
  return getCspWorkspaceLayoutPresets(now).find((preset) => preset.id === id);
}

