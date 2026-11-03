import {
  DEFAULT_STUDIO_COMMAND_BAR,
  normalizeStudioCommandBarPreferences,
  type StudioCommandBarPreferences,
  type StudioCommandBarSlot,
  type StudioDefaultWorkspaceId,
} from "./studio-workspaces";

import type {
  CreatorRoleId,
  CreatorRoleOperationalLens,
} from "@/shared/lib/creator-role-contract";

export interface CreatorRoleWorkspacePreset {
  readonly workspaceId: StudioDefaultWorkspaceId;
  readonly operationalLens: CreatorRoleOperationalLens;
  readonly reason: string;
  readonly recommendedCommandBarSlots: readonly StudioCommandBarSlot[];
  readonly familiarTools: readonly string[];
}

const DRAWING_LINE_COMMAND_BAR_SLOTS: readonly StudioCommandBarSlot[] = Object.freeze([
  "undo",
  "redo",
  "save",
  "correct-current-stroke",
  "zoom-fit",
  "export-open",
  "assets",
  null,
]);

const COLOR_FINISHING_COMMAND_BAR_SLOTS: readonly StudioCommandBarSlot[] = Object.freeze([
  "undo",
  "redo",
  "save",
  "assets",
  "zoom-fit",
  "export-open",
  "correct-current-stroke",
  null,
]);

const BACKGROUND_3D_COMMAND_BAR_SLOTS: readonly StudioCommandBarSlot[] = Object.freeze([
  "undo",
  "redo",
  "save",
  "assets",
  "zoom-fit",
  "project",
  "export-open",
  null,
]);

const STORY_LETTERING_COMMAND_BAR_SLOTS: readonly StudioCommandBarSlot[] = Object.freeze([
  "undo",
  "redo",
  "save",
  "bubbles",
  "project",
  "zoom-fit",
  "export-open",
  null,
]);

const PRODUCTION_REVIEW_COMMAND_BAR_SLOTS: readonly StudioCommandBarSlot[] = Object.freeze([
  "undo",
  "redo",
  "save",
  "project",
  "publish",
  "export-open",
  "zoom-fit",
  null,
]);

const ROLE_WORKSPACE_PRESETS: Readonly<
  Record<CreatorRoleId, CreatorRoleWorkspacePreset>
> = {
  creator: {
    workspaceId: "pro-comic",
    operationalLens: "production",
    reason: "기획·작화·검수·게시를 한 흐름으로 이어갑니다.",
    recommendedCommandBarSlots: DRAWING_LINE_COMMAND_BAR_SLOTS,
    familiarTools: ["Clip Studio Paint EX", "Procreate", "Notion"],
  },
  story: {
    workspaceId: "storyboard",
    operationalLens: "story",
    reason: "대본과 컷 흐름을 함께 확인합니다.",
    recommendedCommandBarSlots: STORY_LETTERING_COMMAND_BAR_SLOTS,
    familiarTools: ["Celtx", "Campfire Writing", "Obsidian"],
  },
  adaptation: {
    workspaceId: "storyboard",
    operationalLens: "story",
    reason: "원작 서사와 웹툰 컷 비트·스크롤 호흡을 나란히 각색합니다.",
    recommendedCommandBarSlots: STORY_LETTERING_COMMAND_BAR_SLOTS,
    familiarTools: ["Celtx", "Storyboard Pro", "Obsidian"],
  },
  "associate-writer": {
    workspaceId: "storyboard",
    operationalLens: "story",
    reason: "자료조사·설정 대조와 회차 보조 집필 보드를 함께 엽니다.",
    recommendedCommandBarSlots: STORY_LETTERING_COMMAND_BAR_SLOTS,
    familiarTools: ["Obsidian", "Campfire Writing", "Milanote"],
  },
  planner: {
    workspaceId: "storyboard",
    operationalLens: "planning",
    reason: "작품 기준과 장면 구성을 먼저 확인합니다.",
    recommendedCommandBarSlots: PRODUCTION_REVIEW_COMMAND_BAR_SLOTS,
    familiarTools: ["Milanote", "tldraw", "Linear"],
  },
  storyboard: {
    workspaceId: "storyboard",
    operationalLens: "storyboard",
    reason: "컷 구성과 스크롤 흐름에 집중합니다.",
    recommendedCommandBarSlots: STORY_LETTERING_COMMAND_BAR_SLOTS,
    familiarTools: ["Storyboard Pro", "Concepts", "Storyboarder"],
  },
  "associate-artist": {
    workspaceId: "lineart",
    operationalLens: "drawing",
    reason: "러프 데생·포즈 가이드와 서브 캐릭터 작화 도구를 우선합니다.",
    recommendedCommandBarSlots: DRAWING_LINE_COMMAND_BAR_SLOTS,
    familiarTools: ["Clip Studio Paint", "Procreate", "Magic Poser"],
  },
  "line-art": {
    workspaceId: "lineart",
    operationalLens: "drawing",
    reason: "펜·지우개·레이어 동선을 가까이 둡니다.",
    recommendedCommandBarSlots: DRAWING_LINE_COMMAND_BAR_SLOTS,
    familiarTools: ["Clip Studio Paint", "Procreate", "PaintTool SAI"],
  },
  background: {
    workspaceId: "pose-3d",
    operationalLens: "background",
    reason: "장면·카메라·3D 배경 자산을 우선합니다.",
    recommendedCommandBarSlots: BACKGROUND_3D_COMMAND_BAR_SLOTS,
    familiarTools: ["SketchUp", "ACON3D", "Blender"],
  },
  color: {
    workspaceId: "coloring",
    operationalLens: "color-finishing",
    reason: "팔레트·채우기·후보정 도구를 우선합니다.",
    recommendedCommandBarSlots: COLOR_FINISHING_COMMAND_BAR_SLOTS,
    familiarTools: ["Adobe Photoshop", "Krita", "Clip Studio Paint"],
  },
  lettering: {
    workspaceId: "lettering",
    operationalLens: "lettering",
    reason: "말풍선·대사·효과음 편집을 우선합니다.",
    recommendedCommandBarSlots: STORY_LETTERING_COMMAND_BAR_SLOTS,
    familiarTools: ["Clip Studio Paint", "Adobe Illustrator", "Figma"],
  },
  character: {
    workspaceId: "lineart",
    operationalLens: "drawing",
    reason: "캐릭터 연기와 선화 작업에 집중합니다.",
    recommendedCommandBarSlots: DRAWING_LINE_COMMAND_BAR_SLOTS,
    familiarTools: ["Clip Studio Paint", "Procreate", "VRoid Studio"],
  },
  "three-d": {
    workspaceId: "pose-3d",
    operationalLens: "background",
    reason: "포즈·카메라·공간 구성을 먼저 엽니다.",
    recommendedCommandBarSlots: BACKGROUND_3D_COMMAND_BAR_SLOTS,
    familiarTools: ["Blender", "SketchUp", "Spline"],
  },
  educator: {
    workspaceId: "storyboard",
    operationalLens: "planning",
    reason: "교육용 예제와 제작 단계를 함께 설명하기 좋은 작업공간을 엽니다.",
    recommendedCommandBarSlots: STORY_LETTERING_COMMAND_BAR_SLOTS,
    familiarTools: ["tldraw", "Milanote", "Clip Studio Paint"],
  },
  assistant: {
    workspaceId: "lineart",
    operationalLens: "drawing",
    reason: "담당 컷과 반복 작업 도구를 빠르게 엽니다.",
    recommendedCommandBarSlots: DRAWING_LINE_COMMAND_BAR_SLOTS,
    familiarTools: ["Clip Studio Paint", "Krita", "Medibang Paint"],
  },
  "line-assistant": {
    workspaceId: "lineart",
    operationalLens: "drawing",
    reason: "선화 클린업·잔선 제거·펜터치 보조 도구를 위한 작업공간을 추천합니다.",
    recommendedCommandBarSlots: DRAWING_LINE_COMMAND_BAR_SLOTS,
    familiarTools: ["Clip Studio Paint", "PaintTool SAI", "Procreate"],
  },
  "flat-color-assistant": {
    workspaceId: "coloring",
    operationalLens: "color-finishing",
    reason: "선화 참조 채우기와 파츠별 밑색·색분할 마스크 도구를 우선합니다.",
    recommendedCommandBarSlots: COLOR_FINISHING_COMMAND_BAR_SLOTS,
    familiarTools: ["Clip Studio Paint", "Krita", "Adobe Photoshop"],
  },
  "shading-assistant": {
    workspaceId: "coloring",
    operationalLens: "color-finishing",
    reason: "클리핑 명암·셀 셰이딩·하이라이트 채색 도구를 우선합니다.",
    recommendedCommandBarSlots: COLOR_FINISHING_COMMAND_BAR_SLOTS,
    familiarTools: ["Adobe Photoshop", "Krita", "Clip Studio Paint"],
  },
  "background-assistant": {
    workspaceId: "pose-3d",
    operationalLens: "background",
    reason: "3D 에셋 배치·투시선 정합·배경 톤 추출 도구를 우선합니다.",
    recommendedCommandBarSlots: BACKGROUND_3D_COMMAND_BAR_SLOTS,
    familiarTools: ["SketchUp", "ACON3D", "Snaptoon"],
  },
  "effect-assistant": {
    workspaceId: "coloring",
    operationalLens: "color-finishing",
    reason: "집중선·광학 이펙트·대기 효과와 색보정 도구를 우선합니다.",
    recommendedCommandBarSlots: COLOR_FINISHING_COMMAND_BAR_SLOTS,
    familiarTools: ["Adobe Photoshop", "Rive", "Clip Studio Paint"],
  },
  "lettering-assistant": {
    workspaceId: "lettering",
    operationalLens: "lettering",
    reason: "대사 흘려넣기·말풍선 정렬·효과음 스탬프 도구를 우선합니다.",
    recommendedCommandBarSlots: STORY_LETTERING_COMMAND_BAR_SLOTS,
    familiarTools: ["Clip Studio Paint", "Figma", "Adobe Illustrator"],
  },
  editor: {
    workspaceId: "review",
    operationalLens: "review",
    reason: "검수·수정 요청·버전 비교를 우선합니다.",
    recommendedCommandBarSlots: PRODUCTION_REVIEW_COMMAND_BAR_SLOTS,
    familiarTools: ["CGWire Kitsu", "Linear", "Figma"],
  },
  producer: {
    workspaceId: "publish",
    operationalLens: "production",
    reason: "일정·승인·게시 준비 상태를 우선합니다.",
    recommendedCommandBarSlots: PRODUCTION_REVIEW_COMMAND_BAR_SLOTS,
    familiarTools: ["Linear", "CGWire Kitsu", "WEBTOON CANVAS"],
  },
  localization: {
    workspaceId: "lettering",
    operationalLens: "lettering",
    reason: "번역 대사와 말풍선 적합성을 함께 확인합니다.",
    recommendedCommandBarSlots: STORY_LETTERING_COMMAND_BAR_SLOTS,
    familiarTools: ["WEBTOON CANVAS", "Clip Studio Paint", "Figma"],
  },
  reviewer: {
    workspaceId: "review",
    operationalLens: "review",
    reason: "오류·수정 요청·승인 여부를 우선합니다.",
    recommendedCommandBarSlots: PRODUCTION_REVIEW_COMMAND_BAR_SLOTS,
    familiarTools: ["CGWire Kitsu", "Figma", "Linear"],
  },
};

export function creatorRoleWorkspacePreset(
  role: CreatorRoleId | null | undefined,
): CreatorRoleWorkspacePreset | null {
  return role ? ROLE_WORKSPACE_PRESETS[role] : null;
}

export function creatorRoleWorkspacePresetId(
  role: CreatorRoleId | null | undefined,
): StudioDefaultWorkspaceId | null {
  return creatorRoleWorkspacePreset(role)?.workspaceId ?? null;
}

export function recommendStudioCommandBarForRole(
  role: CreatorRoleId | null | undefined,
): StudioCommandBarPreferences {
  const preset = creatorRoleWorkspacePreset(role);
  if (!preset) return DEFAULT_STUDIO_COMMAND_BAR;
  return normalizeStudioCommandBarPreferences({
    version: 1,
    visible: true,
    slots: preset.recommendedCommandBarSlots,
  });
}

export function creatorRoleWorkspacePresetOptions(
  roles: readonly CreatorRoleId[],
): readonly CreatorRoleWorkspacePreset[] {
  const seen = new Set<StudioDefaultWorkspaceId>();
  const result: CreatorRoleWorkspacePreset[] = [];
  for (const role of roles) {
    const preset = ROLE_WORKSPACE_PRESETS[role];
    if (seen.has(preset.workspaceId)) continue;
    seen.add(preset.workspaceId);
    result.push(preset);
  }
  return result;
}
