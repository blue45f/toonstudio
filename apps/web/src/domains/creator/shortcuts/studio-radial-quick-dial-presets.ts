/**
 * 8방향 제스처 퀵 다이얼 상황별 컨텍스트 프리셋(`drawing` · `inking` · `bg3d` · `lettering` · `review`)
 * 및 액션 카탈로그 정의.
 */

import type { StudioShortcutActionId } from "../studio-app-settings";

export const RADIAL_DIAL_CONTEXT_IDS = [
  "drawing",
  "inking",
  "bg3d",
  "lettering",
  "review",
] as const;

export type RadialDialContextId = (typeof RADIAL_DIAL_CONTEXT_IDS)[number];

export interface RadialDialContextMeta {
  readonly id: RadialDialContextId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly badgeKo: string;
}

export const RADIAL_DIAL_CONTEXT_META: Readonly<Record<RadialDialContextId, RadialDialContextMeta>> =
  Object.freeze({
    drawing: {
      id: "drawing",
      labelKo: "드로잉",
      summaryKo: "스케치·채색 중 브러시 크기, 채우기, 스포이드를 한 번에 전환합니다.",
      badgeKo: "작화",
    },
    inking: {
      id: "inking",
      labelKo: "선화",
      summaryKo: "손떨림 보정, 스트로크 교정, 원근 스냅, 선화 레이어를 빠르게 다룹니다.",
      badgeKo: "펜터치",
    },
    bg3d: {
      id: "bg3d",
      labelKo: "3D 배경",
      summaryKo: "3D 무대 시점 맞춤, 앞벽 숨기기, 바닥 접지, LT 선화 추출을 즉시 실행합니다.",
      badgeKo: "3D 무대",
    },
    lettering: {
      id: "lettering",
      labelKo: "식자",
      summaryKo: "말풍선 추가, 대사 일괄 편집, 효과음, 모바일 가독 폭을 바로 점검합니다.",
      badgeKo: "대사·식자",
    },
    review: {
      id: "review",
      labelKo: "검수",
      summaryKo: "위치 댓글, 모바일 폭 가이드, 좌우 반전 점검, 출고 메뉴를 모아 둡니다.",
      badgeKo: "마감 검수",
    },
  });

export type RadialDialActionIconKey =
  | "undo"
  | "redo"
  | "brush-plus"
  | "brush-minus"
  | "fill"
  | "eyedropper"
  | "flip-h"
  | "eraser"
  | "stabilizer"
  | "stroke-fix"
  | "transparent"
  | "perspective"
  | "size-lock"
  | "new-layer"
  | "bg3d"
  | "camera-fit"
  | "wall-cutaway"
  | "ground-snap"
  | "lighting"
  | "lt-extract"
  | "snapshot"
  | "lettering"
  | "dialogue-batch"
  | "sfx"
  | "mobile-guide"
  | "actual-size"
  | "overflow-check"
  | "select"
  | "comment"
  | "fit-view"
  | "canvas-only"
  | "export"
  | "reset-view";

export type RadialDialActionId =
  | "undo"
  | "redo"
  | "brush-larger"
  | "brush-smaller"
  | "tool-fill"
  | "tool-eyedropper"
  | "flip-canvas"
  | "tool-eraser"
  | "cycle-stabilizer"
  | "correct-current-stroke"
  | "toggle-transparent-color"
  | "toggle-perspective-snap"
  | "toggle-size-lock"
  | "new-layer"
  | "toggle-bg3d"
  | "bg3d-camera-fit"
  | "bg3d-wall-cutaway"
  | "bg3d-ground-snap"
  | "bg3d-lighting-toggle"
  | "bg3d-sync-perspective"
  | "bg3d-lt-extract"
  | "bg3d-snapshot"
  | "tool-lettering"
  | "lettering-batch-edit"
  | "lettering-sfx-place"
  | "toggle-webtoon-guides"
  | "actual-size-view"
  | "lettering-overflow-check"
  | "tool-select"
  | "tool-comment"
  | "fit-view"
  | "toggle-chrome"
  | "open-export-menu"
  | "reset-view";

export interface RadialDialActionDefinition {
  readonly id: RadialDialActionId;
  readonly labelKo: string;
  readonly shortLabelKo: string;
  readonly hintKo: string;
  readonly iconKey: RadialDialActionIconKey;
  readonly linkedShortcutActionId?: StudioShortcutActionId;
  readonly defaultShortcut?: string;
  readonly recommendedContexts: readonly RadialDialContextId[];
}

export interface RadialDialContextSignals {
  readonly activeSurfaceReviewLocked?: boolean;
  readonly reviewMode?: boolean;
  readonly exportMenuOpen?: boolean;
  readonly bg3dOpen?: boolean;
  readonly tool?: string;
  readonly drawMode?: string;
  readonly stabilizer?: number;
  readonly activeBrushId?: string;
  readonly activeBrushName?: string;
  readonly letteringActive?: boolean;
}

export const RADIAL_DIAL_ACTION_CATALOG: readonly RadialDialActionDefinition[] = Object.freeze([
  {
    id: "undo",
    labelKo: "실행 취소",
    shortLabelKo: "취소",
    hintKo: "방금 그린 획이나 편집을 한 단계 되돌립니다.",
    iconKey: "undo",
    linkedShortcutActionId: "undo",
    defaultShortcut: "Mod+Z",
    recommendedContexts: ["drawing", "inking", "lettering"],
  },
  {
    id: "redo",
    labelKo: "다시 실행",
    shortLabelKo: "다시",
    hintKo: "취소한 작업을 다시 복원합니다.",
    iconKey: "redo",
    linkedShortcutActionId: "redo",
    defaultShortcut: "Mod+Shift+Z",
    recommendedContexts: ["drawing", "inking"],
  },
  {
    id: "brush-larger",
    labelKo: "브러시 크게",
    shortLabelKo: "두께+",
    hintKo: "현재 펜·지우개 두께를 한 단계 키웁니다.",
    iconKey: "brush-plus",
    linkedShortcutActionId: "brush-larger",
    defaultShortcut: "]",
    recommendedContexts: ["drawing", "inking"],
  },
  {
    id: "brush-smaller",
    labelKo: "브러시 작게",
    shortLabelKo: "두께−",
    hintKo: "현재 펜·지우개 두께를 한 단계 줄입니다.",
    iconKey: "brush-minus",
    linkedShortcutActionId: "brush-smaller",
    defaultShortcut: "[",
    recommendedContexts: ["drawing", "inking"],
  },
  {
    id: "tool-fill",
    labelKo: "색 채우기",
    shortLabelKo: "채우기",
    hintKo: "닫힌 선 영역을 현재 색으로 채웁니다.",
    iconKey: "fill",
    linkedShortcutActionId: "tool-fill",
    defaultShortcut: "G",
    recommendedContexts: ["drawing"],
  },
  {
    id: "tool-eyedropper",
    labelKo: "색 가져오기",
    shortLabelKo: "스포이드",
    hintKo: "캔버스에서 원하는 색을 바로 추출합니다.",
    iconKey: "eyedropper",
    linkedShortcutActionId: "tool-eyedropper",
    defaultShortcut: "I",
    recommendedContexts: ["drawing"],
  },
  {
    id: "flip-canvas",
    labelKo: "좌우 반전",
    shortLabelKo: "반전",
    hintKo: "원본을 건드리지 않고 보기만 좌우 반전해 균형을 확인합니다.",
    iconKey: "flip-h",
    linkedShortcutActionId: "flip-canvas",
    defaultShortcut: "H",
    recommendedContexts: ["drawing", "inking", "review"],
  },
  {
    id: "tool-eraser",
    labelKo: "지우개",
    shortLabelKo: "지우개",
    hintKo: "지우개 모드로 즉시 전환합니다.",
    iconKey: "eraser",
    linkedShortcutActionId: "tool-eraser",
    defaultShortcut: "E",
    recommendedContexts: ["drawing", "inking"],
  },
  {
    id: "cycle-stabilizer",
    labelKo: "손떨림 보정 순환",
    shortLabelKo: "보정",
    hintKo: "손떨림 보정 강도를 꺼짐→약함→표준→강함으로 바꿉니다.",
    iconKey: "stabilizer",
    defaultShortcut: "Alt+S",
    recommendedContexts: ["inking", "drawing"],
  },
  {
    id: "correct-current-stroke",
    labelKo: "현재 스트로크 교정",
    shortLabelKo: "선 교정",
    hintKo: "방금 그은 선의 떨림과 끝맺음을 매끄럽게 정돈합니다.",
    iconKey: "stroke-fix",
    linkedShortcutActionId: "correct-current-stroke",
    defaultShortcut: "Alt+Shift+Q",
    recommendedContexts: ["inking"],
  },
  {
    id: "toggle-transparent-color",
    labelKo: "투명색 그리기",
    shortLabelKo: "투명색",
    hintKo: "현재 브러시 질감 그대로 지우개처럼 깎아냅니다.",
    iconKey: "transparent",
    linkedShortcutActionId: "toggle-transparent-color",
    defaultShortcut: "Shift+C",
    recommendedContexts: ["inking", "drawing"],
  },
  {
    id: "toggle-perspective-snap",
    labelKo: "원근 자 스냅",
    shortLabelKo: "원근스냅",
    hintKo: "소실점 방사선에 맞춰 직선과 배경선을 정렬합니다.",
    iconKey: "perspective",
    defaultShortcut: "Alt+P",
    recommendedContexts: ["inking", "bg3d"],
  },
  {
    id: "toggle-size-lock",
    labelKo: "브러시 크기 고정",
    shortLabelKo: "크기고정",
    hintKo: "브러시를 바꿔도 선화 두께를 일정하게 유지합니다.",
    iconKey: "size-lock",
    defaultShortcut: "Alt+L",
    recommendedContexts: ["inking", "drawing"],
  },
  {
    id: "new-layer",
    labelKo: "새 선화 레이어",
    shortLabelKo: "새레이어",
    hintKo: "현재 레이어 위에 새 픽셀 레이어를 만듭니다.",
    iconKey: "new-layer",
    linkedShortcutActionId: "new-layer",
    defaultShortcut: "Mod+Shift+N",
    recommendedContexts: ["inking", "drawing"],
  },
  {
    id: "toggle-bg3d",
    labelKo: "3D 무대 열기·닫기",
    shortLabelKo: "3D 무대",
    hintKo: "3D 배경 스테이지 편집기를 열고 닫습니다.",
    iconKey: "bg3d",
    defaultShortcut: "Alt+3",
    recommendedContexts: ["bg3d"],
  },
  {
    id: "bg3d-camera-fit",
    labelKo: "카메라 구도 맞춤",
    shortLabelKo: "시점맞춤",
    hintKo: "3D 배경 카메라를 현재 컷 프레임에 맞춥니다.",
    iconKey: "camera-fit",
    defaultShortcut: "Home",
    recommendedContexts: ["bg3d"],
  },
  {
    id: "bg3d-wall-cutaway",
    labelKo: "앞벽 숨기기",
    shortLabelKo: "앞벽숨김",
    hintKo: "카메라를 가리는 벽면을 그림자만 남기고 숨깁니다.",
    iconKey: "wall-cutaway",
    defaultShortcut: "Alt+W",
    recommendedContexts: ["bg3d"],
  },
  {
    id: "bg3d-ground-snap",
    labelKo: "바닥 접지 정렬",
    shortLabelKo: "바닥접지",
    hintKo: "인물과 소품을 3D 바닥 높이에 정확히 맞춥니다.",
    iconKey: "ground-snap",
    defaultShortcut: "Alt+G",
    recommendedContexts: ["bg3d"],
  },
  {
    id: "bg3d-lighting-toggle",
    labelKo: "조명·그림자 전환",
    shortLabelKo: "조명",
    hintKo: "주광·역광·그림자 미리보기 구성을 전환합니다.",
    iconKey: "lighting",
    defaultShortcut: "Alt+I",
    recommendedContexts: ["bg3d"],
  },
  {
    id: "bg3d-sync-perspective",
    labelKo: "원근 자 동기화",
    shortLabelKo: "원근연동",
    hintKo: "3D 카메라 소실점을 2D 원근 자에 동기화합니다.",
    iconKey: "perspective",
    defaultShortcut: "Alt+R",
    recommendedContexts: ["bg3d", "inking"],
  },
  {
    id: "bg3d-lt-extract",
    labelKo: "LT 선화 추출",
    shortLabelKo: "선화추출",
    hintKo: "현재 3D 배경 시점에서 웹툰 선화와 톤 레이어를 뽑습니다.",
    iconKey: "lt-extract",
    defaultShortcut: "Alt+E",
    recommendedContexts: ["bg3d"],
  },
  {
    id: "bg3d-snapshot",
    labelKo: "3D 구도 스냅샷",
    shortLabelKo: "스냅샷",
    hintKo: "현재 3D 카메라 구도를 컷 레퍼런스로 저장합니다.",
    iconKey: "snapshot",
    defaultShortcut: "Alt+K",
    recommendedContexts: ["bg3d"],
  },
  {
    id: "tool-lettering",
    labelKo: "말풍선·대사 추가",
    shortLabelKo: "말풍선",
    hintKo: "말풍선과 대사 입력 도구로 전환합니다.",
    iconKey: "lettering",
    linkedShortcutActionId: "tool-lettering",
    defaultShortcut: "T",
    recommendedContexts: ["lettering"],
  },
  {
    id: "lettering-batch-edit",
    labelKo: "대사 일괄 편집",
    shortLabelKo: "대사목록",
    hintKo: "회차 전체 대사와 말풍선을 표에서 한꺼번에 교정합니다.",
    iconKey: "dialogue-batch",
    defaultShortcut: "Alt+B",
    recommendedContexts: ["lettering"],
  },
  {
    id: "lettering-sfx-place",
    labelKo: "효과음 배치",
    shortLabelKo: "효과음",
    hintKo: "웹툰 효과음 타이포 패널을 열어 컷에 배치합니다.",
    iconKey: "sfx",
    defaultShortcut: "Alt+X",
    recommendedContexts: ["lettering"],
  },
  {
    id: "toggle-webtoon-guides",
    labelKo: "모바일 폭 가이드",
    shortLabelKo: "폭가이드",
    hintKo: "모바일 세로 독자 화면(690·720px) 안전 폭선을 켜고 끕니다.",
    iconKey: "mobile-guide",
    defaultShortcut: "Alt+M",
    recommendedContexts: ["lettering", "review"],
  },
  {
    id: "actual-size-view",
    labelKo: "100% 원본 보기",
    shortLabelKo: "100%",
    hintKo: "실제 출고 픽셀 배율(100%)로 가독성을 확인합니다.",
    iconKey: "actual-size",
    linkedShortcutActionId: "actual-size-view",
    defaultShortcut: "Mod+1",
    recommendedContexts: ["lettering", "review"],
  },
  {
    id: "lettering-overflow-check",
    labelKo: "말풍선 넘침 점검",
    shortLabelKo: "넘침점검",
    hintKo: "번역·모바일 축소 시 글자 잘림 위험을 사전 점검합니다.",
    iconKey: "overflow-check",
    defaultShortcut: "Alt+O",
    recommendedContexts: ["lettering", "review"],
  },
  {
    id: "tool-select",
    labelKo: "선택 도구",
    shortLabelKo: "선택",
    hintKo: "말풍선이나 레이어 위치를 옮기는 선택 도구로 바꿉니다.",
    iconKey: "select",
    linkedShortcutActionId: "tool-select",
    defaultShortcut: "V",
    recommendedContexts: ["lettering", "drawing"],
  },
  {
    id: "tool-comment",
    labelKo: "위치 댓글 핀",
    shortLabelKo: "댓글핀",
    hintKo: "수정 요청 지점에 핀 댓글을 남깁니다.",
    iconKey: "comment",
    linkedShortcutActionId: "tool-comment",
    defaultShortcut: "Alt+C",
    recommendedContexts: ["review"],
  },
  {
    id: "fit-view",
    labelKo: "화면 맞춤",
    shortLabelKo: "화면맞춤",
    hintKo: "현재 작업 화면 폭에 원고 전체를 맞춥니다.",
    iconKey: "fit-view",
    linkedShortcutActionId: "fit-view",
    defaultShortcut: "Mod+0",
    recommendedContexts: ["review", "drawing"],
  },
  {
    id: "toggle-chrome",
    labelKo: "캔버스만 보기",
    shortLabelKo: "집중보기",
    hintKo: "주변 패널을 접고 원고 흐름만 집중해서 확인합니다.",
    iconKey: "canvas-only",
    linkedShortcutActionId: "toggle-chrome",
    defaultShortcut: "`",
    recommendedContexts: ["review", "drawing"],
  },
  {
    id: "open-export-menu",
    labelKo: "마감·출고 열기",
    shortLabelKo: "출고",
    hintKo: "회차 내보내기와 권리 BOM 점검 창을 엽니다.",
    iconKey: "export",
    defaultShortcut: "Mod+Shift+E",
    recommendedContexts: ["review"],
  },
  {
    id: "reset-view",
    labelKo: "화면 리셋",
    shortLabelKo: "화면리셋",
    hintKo: "확대·회전·좌우 반전을 기본 보기로 되돌립니다.",
    iconKey: "reset-view",
    linkedShortcutActionId: "reset-view",
    defaultShortcut: "Shift+0",
    recommendedContexts: ["review", "drawing"],
  },
]);

const ACTION_BY_ID: ReadonlyMap<RadialDialActionId, RadialDialActionDefinition> = new Map(
  RADIAL_DIAL_ACTION_CATALOG.map((item) => [item.id, item] as const),
);

export const DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS: Readonly<
  Record<RadialDialContextId, readonly RadialDialActionId[]>
> = Object.freeze({
  drawing: Object.freeze([
    "undo",
    "brush-larger",
    "tool-fill",
    "tool-eyedropper",
    "flip-canvas",
    "tool-eraser",
    "brush-smaller",
    "redo",
  ] as const),
  inking: Object.freeze([
    "undo",
    "cycle-stabilizer",
    "correct-current-stroke",
    "toggle-transparent-color",
    "flip-canvas",
    "toggle-perspective-snap",
    "toggle-size-lock",
    "new-layer",
  ] as const),
  bg3d: Object.freeze([
    "toggle-bg3d",
    "bg3d-camera-fit",
    "bg3d-wall-cutaway",
    "bg3d-ground-snap",
    "bg3d-lighting-toggle",
    "bg3d-sync-perspective",
    "bg3d-lt-extract",
    "bg3d-snapshot",
  ] as const),
  lettering: Object.freeze([
    "tool-lettering",
    "lettering-batch-edit",
    "lettering-sfx-place",
    "toggle-webtoon-guides",
    "actual-size-view",
    "lettering-overflow-check",
    "tool-select",
    "undo",
  ] as const),
  review: Object.freeze([
    "tool-comment",
    "toggle-webtoon-guides",
    "fit-view",
    "actual-size-view",
    "flip-canvas",
    "toggle-chrome",
    "open-export-menu",
    "reset-view",
  ] as const),
});

export function isRadialDialContextId(value: unknown): value is RadialDialContextId {
  return typeof value === "string" && (RADIAL_DIAL_CONTEXT_IDS as readonly string[]).includes(value);
}

export function isRadialDialActionId(value: unknown): value is RadialDialActionId {
  return typeof value === "string" && ACTION_BY_ID.has(value as RadialDialActionId);
}

export function getRadialDialActionMeta(actionId: RadialDialActionId): RadialDialActionDefinition {
  const found = ACTION_BY_ID.get(actionId);
  if (found) return found;
  return RADIAL_DIAL_ACTION_CATALOG[0]!;
}

/** 현재 Studio 세션 신호로부터 가장 알맞은 작업 컨텍스트를 자동 추론한다. */
export function inferRadialDialContext(signals: RadialDialContextSignals): RadialDialContextId {
  if (signals.activeSurfaceReviewLocked || signals.reviewMode || signals.tool === "comment") {
    return "review";
  }
  if (signals.bg3dOpen) {
    return "bg3d";
  }
  if (
    signals.letteringActive ||
    signals.tool === "text" ||
    signals.tool === "bubble" ||
    signals.tool === "lettering"
  ) {
    return "lettering";
  }
  const brushSignature = `${signals.activeBrushId ?? ""} ${signals.activeBrushName ?? ""}`.toLowerCase();
  const isInkBrush =
    brushSignature.includes("gpen") ||
    brushSignature.includes("g펜") ||
    brushSignature.includes("ink") ||
    brushSignature.includes("선화") ||
    brushSignature.includes("maru");
  if (
    signals.tool === "draw" &&
    (signals.drawMode === "pen" || signals.drawMode === "pixel") &&
    ((typeof signals.stabilizer === "number" && signals.stabilizer >= 2) || isInkBrush)
  ) {
    return "inking";
  }
  if (signals.exportMenuOpen) {
    return "review";
  }
  return "drawing";
}

export function cloneDefaultRadialDialContextSlots(): Record<
  RadialDialContextId,
  readonly RadialDialActionId[]
> {
  return {
    drawing: [...DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS.drawing],
    inking: [...DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS.inking],
    bg3d: [...DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS.bg3d],
    lettering: [...DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS.lettering],
    review: [...DEFAULT_RADIAL_DIAL_CONTEXT_SLOTS.review],
  };
}
