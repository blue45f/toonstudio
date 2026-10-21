import type { StudioWorkspaceSurface } from "./studio-workspace-route";

import type { BilingualText } from "@/shared/lib/i18n-bilingual-copy";

/**
 * 모바일·터치 제작 동선의 정본 경계 (A7, 2026-10-22).
 *
 * 배경: 파이프라인 전 단계가 데스크톱 전제였고, 기존 진입 안내(MobileFullEditNotice)는
 * 모든 표면에 같은 "가능 목록"(보기·도크 그리기·자동 저장)을 보여 줬다. 그러나 모바일
 * 도크·컷 목록은 캔버스 편집기의 부품이라, 3D 배경·포저·DCC 표면에서는 그 목록이
 * 거짓 약속이 된다 — "눌렀는데 안 되는" 상태의 진입점이었다.
 *
 * 이 모듈이 단일 출처다:
 * - 표면마다 등급(tier)과 되는 작업/안 되는 작업을 코드로 고정한다.
 * - 확인되지 않은 표면은 fail-closed(편집 가능을 약속하지 않는 desktop-required)로 떨어진다.
 * - 진입 안내는 이 계획만 소비한다. 새 표면을 추가하면 이 표부터 채워야 한다.
 *
 * 등급 정의:
 * - "touch-edit": 태블릿 터치만으로 컷 편집·간단 수정 최소 동선이 끝까지 배선된 표면.
 * - "touch-assisted": 표면 자체는 보기·간단 조정까지, 실제 수정은 캔버스 최소 동선으로
 *   돌아와서 하는 표면. 표면 고유의 정밀 작업은 데스크톱 몫을 명시한다.
 * - "desktop-required": 이 기기에서는 보기만 된다. 표면 자체의 편집은 진입 시점에
 *   "안 된다"고 먼저 알리고 데스크톱 경로를 안내한다.
 */
export type StudioMobileTouchTier = "touch-edit" | "touch-assisted" | "desktop-required";

export interface StudioMobileTouchStep {
  readonly id: string;
  readonly label: BilingualText;
}

export interface StudioMobileTouchPlan {
  readonly surface: StudioWorkspaceSurface | "unknown";
  readonly tier: StudioMobileTouchTier;
  readonly label: BilingualText;
  /** 이 기기에서 지금 바로 되는 작업. 실제로 배선된 경로만 적는다. */
  readonly canDo: readonly BilingualText[];
  /** 이 기기에서 안 되는 작업과 대신 갈 곳. 진입 안내에 그대로 노출된다. */
  readonly cannotDo: readonly BilingualText[];
  /** 이 기기에서의 최소 동선(순서대로). */
  readonly steps: readonly StudioMobileTouchStep[];
}

const VIEW_AND_PAN: BilingualText = { ko: "작품 보기와 확대·이동", en: "View, zoom and pan your work" };
const AUTOSAVE_CONTINUE: BilingualText = {
  ko: "자동 저장 후 다른 기기에서 이어 편집",
  en: "Autosave, then continue on another device",
};
const GOTO_CANVAS_SIMPLE_EDIT: BilingualText = {
  ko: "캔버스 표면으로 이동해 컷 편집·간단한 그리기",
  en: "Go to the Canvas surface for cut editing and quick drawing",
};
const DRAG_REORDER_DESKTOP_ONLY: BilingualText = {
  ko: "컷을 끌어 옮기는 재배열은 데스크톱에서 — 터치에서는 카드 버튼으로 순서를 바꿔요",
  en: "Drag-to-reorder cuts is desktop-only — on touch, use the card buttons to reorder",
};

/** 캔버스 최소 동선: 페이지 시트 → 컷 작업 → 도크 간단 수정 → 선택 빠른 작업 → 저장 확인. */
const CANVAS_TOUCH_STEPS: readonly StudioMobileTouchStep[] = [
  { id: "open-pages", label: { ko: "하단 도크에서 컷(페이지) 목록 열기", en: "Open the cut (page) list from the bottom dock" } },
  { id: "cut-basics", label: { ko: "컷 고르기·추가·복제와 버튼으로 순서 바꾸기, 이름·메모 고치기", en: "Pick, add or duplicate a cut, reorder with buttons, fix its name or memo" } },
  { id: "dock-simple-edit", label: { ko: "모바일 도크 펜·지우개·도형과 굵기 조절로 간단히 수정하기", en: "Make quick fixes with the dock pen, eraser, shapes and size slider" } },
  { id: "selection-quick-fix", label: { ko: "고른 요소는 빠른 작업으로 복제·삭제·순서·잠금·글자 고치기", en: "Use quick actions on a selection: duplicate, delete, reorder, lock, edit text" } },
  { id: "check-autosave", label: { ko: "저장 상태를 확인하고 나가기 — 다른 기기에서 그대로 이어짐", en: "Check the save state before leaving — it carries over to other devices" } },
];

const ASSISTED_STEPS: readonly StudioMobileTouchStep[] = [
  { id: "view-surface", label: { ko: "이 표면에서는 보기·간단 조정만 하기", en: "On this surface, stick to viewing and simple adjustments" } },
  { id: "goto-canvas", label: { ko: "수정은 캔버스 표면으로 이동해 최소 동선으로 하기", en: "For edits, move to the Canvas surface and use the minimum flow" } },
  { id: "continue-desktop", label: { ko: "정밀 작업은 데스크톱에서 이어 하기 (자동 저장됨)", en: "Continue precision work on desktop (autosaved)" } },
];

const DESKTOP_REQUIRED_STEPS: readonly StudioMobileTouchStep[] = [
  { id: "view-only", label: { ko: "이 기기에서는 결과만 확인하기", en: "On this device, only check the result" } },
  { id: "goto-canvas", label: { ko: "컷·간단 수정이 필요하면 캔버스 표면으로 이동하기", en: "For cut or quick edits, move to the Canvas surface" } },
  { id: "edit-on-desktop", label: { ko: "이 표면의 편집은 데스크톱에서 열기 (자동 저장됨)", en: "Open this surface's editing on desktop (autosaved)" } },
];

export const STUDIO_MOBILE_TOUCH_PLANS: Readonly<Record<StudioWorkspaceSurface, StudioMobileTouchPlan>> = {
  canvas: {
    surface: "canvas",
    tier: "touch-edit",
    label: { ko: "캔버스 편집기", en: "Canvas editor" },
    canDo: [
      { ko: "컷 고르기·추가·복제·삭제와 카드 버튼으로 순서 바꾸기", en: "Pick, add, duplicate or delete cuts and reorder with card buttons" },
      { ko: "컷 이름·콘티 메모 고치기, '여러 개 선택'으로 탭 다중 선택", en: "Edit cut names and memos; tap-select multiple cuts with Multi-select" },
      { ko: "모바일 도크 펜·지우개·도형·굵기 조절로 간단히 그리기·지우기", en: "Quick draw and erase with the mobile dock pen, eraser, shapes and size" },
      { ko: "고른 요소 복제·삭제·순서·잠금·글자 고치기와 실행 취소·다시 실행", en: "Duplicate, delete, reorder, lock or retext a selection; undo and redo" },
      AUTOSAVE_CONTINUE,
    ],
    cannotDo: [
      DRAG_REORDER_DESKTOP_ONLY,
      { ko: "키보드 단축키·우클릭 전제 작업은 이 기기에서 안 돼요 — 도크·카드 버튼 경로를 써 주세요", en: "Keyboard-shortcut or right-click workflows are unavailable here — use the dock and card buttons instead" },
      { ko: "여러 패널을 나란히 여는 정밀 수치 작업은 데스크톱이 편해요", en: "Precision numeric work across side-by-side panels works best on desktop" },
    ],
    steps: CANVAS_TOUCH_STEPS,
  },
  comic: {
    surface: "comic",
    tier: "touch-edit",
    label: { ko: "콘티(스토리보드)", en: "Storyboard" },
    canDo: [
      { ko: "콘티 그리드에서 컷 보기·고르기", en: "View and pick cuts in the storyboard grid" },
      { ko: "컷 추가·복제·삭제와 카드 버튼 순서 바꾸기, 이름·메모 고치기", en: "Add, duplicate or delete cuts, reorder with buttons, edit names and memos" },
      { ko: "캔버스로 돌아와 모바일 도크로 간단히 그리기·지우기", en: "Return to the canvas for quick draw and erase in the mobile dock" },
      AUTOSAVE_CONTINUE,
    ],
    cannotDo: [
      DRAG_REORDER_DESKTOP_ONLY,
      { ko: "콘티 대량 일괄 편집·정밀 배치 조정은 데스크톱에서 해 주세요", en: "Bulk storyboard edits and precise layout tuning are desktop work" },
    ],
    steps: CANVAS_TOUCH_STEPS,
  },
  animation: {
    surface: "animation",
    tier: "touch-assisted",
    label: { ko: "애니메이션 타임라인", en: "Animation timeline" },
    canDo: [
      { ko: "타임라인 재생·정지와 재생 위치 확인", en: "Play, stop and check the playhead position" },
      GOTO_CANVAS_SIMPLE_EDIT,
      AUTOSAVE_CONTINUE,
    ],
    cannotDo: [
      { ko: "키프레임 정밀 편집·곡선 조정은 이 기기에서 안 돼요 — 데스크톱에서 해 주세요", en: "Precise keyframe and curve editing is unavailable here — do it on desktop" },
      { ko: "프레임 단위 수치 입력은 데스크톱에서 해 주세요", en: "Frame-by-frame numeric entry is desktop work" },
    ],
    steps: ASSISTED_STEPS,
  },
  brushes: {
    surface: "brushes",
    tier: "touch-assisted",
    label: { ko: "브러시 스튜디오", en: "Brush studio" },
    canDo: [
      { ko: "브러시 고르기·적용하고 저장한 브러시 불러오기", en: "Pick and apply brushes, including your saved brushes" },
      { ko: "모바일 도크에서 굵기·불투명도를 조절해 시험 그리기", en: "Test-draw with size and opacity controls in the mobile dock" },
      AUTOSAVE_CONTINUE,
    ],
    cannotDo: [
      { ko: "브러시 질감·동역학 세부 제작은 이 기기에서 안 돼요 — 데스크톱에서 해 주세요", en: "Authoring brush textures and dynamics in detail is unavailable here — do it on desktop" },
      { ko: "정밀 곡선·수치 조정은 데스크톱에서 해 주세요", en: "Precise curve and numeric tuning is desktop work" },
    ],
    steps: ASSISTED_STEPS,
  },
  character: {
    surface: "character",
    tier: "touch-assisted",
    label: { ko: "캐릭터 셰이퍼", en: "Character shaper" },
    canDo: [
      { ko: "모바일 시트(접기·반·전체)로 캐릭터 보기·간단 조정", en: "View and lightly adjust the character with the mobile sheet (collapsed, half, full)" },
      GOTO_CANVAS_SIMPLE_EDIT,
      AUTOSAVE_CONTINUE,
    ],
    cannotDo: [
      { ko: "정밀 체형 수치·세부 조정은 이 기기에서 안 돼요 — 데스크톱에서 해 주세요", en: "Precise proportion values and fine adjustments are unavailable here — do it on desktop" },
    ],
    steps: ASSISTED_STEPS,
  },
  bg3d: {
    surface: "bg3d",
    tier: "desktop-required",
    label: { ko: "3D 배경", en: "3D backgrounds" },
    canDo: [
      { ko: "3D 장면 보기·돌려 보기와 상태 확인", en: "View and orbit the 3D scene and check its status" },
      GOTO_CANVAS_SIMPLE_EDIT,
      AUTOSAVE_CONTINUE,
    ],
    cannotDo: [
      { ko: "3D 배치·변형·장면 편집 자체는 이 기기에서 안 돼요 — 데스크톱에서 해 주세요", en: "Placing, transforming and editing the 3D scene itself is unavailable here — do it on desktop" },
      { ko: "모델 가져오기·정밀 카메라 작업은 데스크톱에서 해 주세요", en: "Model import and precise camera work are desktop work" },
    ],
    steps: DESKTOP_REQUIRED_STEPS,
  },
  poser: {
    surface: "poser",
    tier: "desktop-required",
    label: { ko: "포저", en: "Poser" },
    canDo: [
      { ko: "모델·포즈 보기·돌려 보기", en: "View and orbit the model and pose" },
      GOTO_CANVAS_SIMPLE_EDIT,
      AUTOSAVE_CONTINUE,
    ],
    cannotDo: [
      { ko: "관절·포즈 정밀 조정은 이 기기에서 안 돼요 — 데스크톱에서 해 주세요", en: "Precise joint and pose adjustment is unavailable here — do it on desktop" },
      { ko: "본·리깅 작업은 데스크톱에서 해 주세요", en: "Bone and rigging work is desktop work" },
    ],
    steps: DESKTOP_REQUIRED_STEPS,
  },
  dcc: {
    surface: "dcc",
    tier: "desktop-required",
    label: { ko: "3D 작업대", en: "3D workbench" },
    canDo: [
      { ko: "작업 상태·장면 보기", en: "View the work state and scene" },
      GOTO_CANVAS_SIMPLE_EDIT,
      AUTOSAVE_CONTINUE,
    ],
    cannotDo: [
      { ko: "모델링·조각·CAD 정밀 작업은 이 기기에서 안 돼요 — 데스크톱에서 해 주세요", en: "Modeling, sculpting and CAD precision work is unavailable here — do it on desktop" },
    ],
    steps: DESKTOP_REQUIRED_STEPS,
  },
};

/** 확인되지 않은 표면의 기본값. 편집 가능을 약속하지 않는 것이 이 경계의 규칙이다. */
const UNKNOWN_SURFACE_PLAN: StudioMobileTouchPlan = {
  surface: "unknown",
  tier: "desktop-required",
  label: { ko: "Studio 편집기", en: "Studio editor" },
  canDo: [VIEW_AND_PAN, GOTO_CANVAS_SIMPLE_EDIT, AUTOSAVE_CONTINUE],
  cannotDo: [
    { ko: "이 표면의 편집은 이 기기에서 안 돼요 — 데스크톱에서 해 주세요", en: "Editing on this surface is unavailable here — do it on desktop" },
  ],
  steps: DESKTOP_REQUIRED_STEPS,
};

export function resolveStudioMobileTouchPlan(surface: string): StudioMobileTouchPlan {
  return (STUDIO_MOBILE_TOUCH_PLANS as Readonly<Record<string, StudioMobileTouchPlan>>)[surface]
    ?? UNKNOWN_SURFACE_PLAN;
}

/** 좁은 폭 경계: 스튜디오 모바일 레이아웃 분기(useIsMobile)와 같은 1023px. */
export const STUDIO_TOUCH_NARROW_QUERY = "(max-width: 1023px)";
/**
 * 태블릿 가로 경계: 데스크톱 레이아웃 폭(1024px 이상)이지만 주 포인터가 터치인 경우.
 * 이 구간은 모바일 레이아웃도 안내도 없이 데스크톱 크기 대상을 터치로 눌러야 했던 공백이라,
 * 진입 안내만은 띄워 경계를 먼저 알린다. 1366px를 넘는 거친 포인터(대형 터치 모니터 등)는
 * 데스크톱으로 본다 — 그 폭에서는 데스크톱 레이아웃 자체가 동작 범위다.
 */
export const STUDIO_TOUCH_TABLET_QUERY = "(pointer: coarse) and (min-width: 1024px) and (max-width: 1366px)";

export type StudioTouchViewportKind = "touch-narrow" | "touch-tablet" | "desktop";

export function classifyStudioTouchViewport(input: {
  readonly widthPx: number;
  readonly pointerCoarse: boolean;
}): StudioTouchViewportKind {
  if (input.widthPx <= 1023) return "touch-narrow";
  if (input.pointerCoarse && input.widthPx <= 1366) return "touch-tablet";
  return "desktop";
}

export function shouldShowStudioMobileTouchNotice(input: {
  readonly widthPx: number;
  readonly pointerCoarse: boolean;
}): boolean {
  return classifyStudioTouchViewport(input) !== "desktop";
}
