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
 * - "touch-edit": 터치로 주요 편집 동선을 수행하고 결과를 원고에 반영하거나 파일로 받을 수 있는 표면.
 * - "touch-assisted": 터치로 수행할 수 있는 일부 작업과 검증된 조작 범위를 별도로 안내하는 표면.
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
  ko: "이 기기 저장 상태 확인 · 다른 기기에서 이어하려면 로그인 후 서버 저장 확인",
  en: "Check the save on this device; sign in and confirm the server save before continuing on another device",
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
  { id: "check-autosave", label: { ko: "나가기 전 이 기기에 저장됐는지 확인 — 다른 기기에서 이어하려면 로그인 후 서버 저장도 확인", en: "Before leaving, confirm the save on this device; sign in and confirm the server save to continue on another device" } },
];

const ASSISTED_STEPS: readonly StudioMobileTouchStep[] = [
  { id: "view-surface", label: { ko: "이 표면에서는 보기·간단 조정만 하기", en: "On this surface, stick to viewing and simple adjustments" } },
  { id: "goto-canvas", label: { ko: "수정은 캔버스 표면으로 이동해 최소 동선으로 하기", en: "For edits, move to the Canvas surface and use the minimum flow" } },
  { id: "continue-desktop", label: { ko: "정밀 작업은 데스크톱에서 — 다른 기기에서 이어하려면 로그인 후 서버 저장 확인", en: "Use desktop for precision work; sign in and confirm the server save before continuing on another device" } },
];

const DESKTOP_REQUIRED_STEPS: readonly StudioMobileTouchStep[] = [
  { id: "view-only", label: { ko: "이 기기에서는 결과만 확인하기", en: "On this device, only check the result" } },
  { id: "goto-canvas", label: { ko: "컷·간단 수정이 필요하면 캔버스 표면으로 이동하기", en: "For cut or quick edits, move to the Canvas surface" } },
  { id: "edit-on-desktop", label: { ko: "이 표면의 편집은 데스크톱에서 — 다른 기기에서 이어하려면 로그인 후 서버 저장 확인", en: "Edit this surface on desktop; sign in and confirm the server save before continuing on another device" } },
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
    tier: "touch-edit",
    label: { ko: "캐릭터 셰이퍼", en: "Character shaper" },
    canDo: [
      { ko: "얼굴·헤어·의상·포즈 프리셋을 골라 적용하거나 실행 취소하기", en: "Apply face, hair, clothing and pose presets, or undo a change" },
      { ko: "편집한 캐릭터를 PNG로 저장하기", en: "Save the edited character as a PNG" },
      GOTO_CANVAS_SIMPLE_EDIT,
      AUTOSAVE_CONTINUE,
    ],
    cannotDo: [
      { ko: "모델이 지원하지 않는 파츠와 프리셋은 적용할 수 없어요. 선택 가능한 카드를 골라 주세요.", en: "Only parts and presets supported by the current model can be applied. Choose an available card." },
    ],
    steps: [
      { id: "choose-part", label: { ko: "편집할 파츠 열기", en: "Open the part you want to edit" } },
      { id: "apply-preset", label: { ko: "프리셋을 눌러 결과 확인하기", en: "Tap a preset to see the result" } },
      { id: "export-character", label: { ko: "완성한 캐릭터를 PNG로 저장하기", en: "Save the finished character as a PNG" } },
    ],
  },
  bg3d: {
    surface: "bg3d",
    tier: "touch-edit",
    label: { ko: "3D 배경", en: "3D backgrounds" },
    canDo: [
      { ko: "배경이나 소품을 고른 뒤 장면을 눌러 배치하기", en: "Choose a background or prop, then tap the scene to place it" },
      { ko: "추천 구도로 카메라를 맞추고 원고에 컷으로 넣기", en: "Frame the camera with a suggested view and insert the shot into the manuscript" },
      GOTO_CANVAS_SIMPLE_EDIT,
      AUTOSAVE_CONTINUE,
    ],
    cannotDo: [
      { ko: "WebGPU 화면이 열리지 않으면 ‘WebGL2로 계속’을 눌러 보세요. 두 방식 모두 지원하지 않으면 3D 장면을 표시할 수 없어요.", en: "If WebGPU cannot open the scene, try continuing with WebGL2. The 3D scene needs one of these renderers." },
    ],
    steps: [
      { id: "pick-background", label: { ko: "장면 도우미에서 배경 또는 소품 고르기", en: "Choose a background or prop in Scene Assistant" } },
      { id: "place-in-scene", label: { ko: "장면에서 놓을 곳 누르기", en: "Tap where you want to place it" } },
      { id: "frame-shot", label: { ko: "추천 구도로 카메라 맞추기", en: "Apply a suggested camera view" } },
      { id: "insert-shot", label: { ko: "원고에 넣고 해당 컷 확인하기", en: "Insert the shot and check it in the manuscript" } },
    ],
  },
  poser: {
    surface: "poser",
    tier: "touch-edit",
    label: { ko: "포저", en: "Poser" },
    canDo: [
      { ko: "캐릭터를 골라 돌려 보고 모델이 지원하는 포즈와 표정 적용하기", en: "Choose a character, orbit the view and apply supported poses and expressions" },
      { ko: "원고에 캐릭터를 넣고 레이어 확인하기", en: "Insert the character and check its layer in the manuscript" },
      GOTO_CANVAS_SIMPLE_EDIT,
      AUTOSAVE_CONTINUE,
    ],
    cannotDo: [
      { ko: "모델에 없는 관절이나 표정은 조절할 수 없어요. 필요한 동작을 지원하는 캐릭터를 골라 주세요.", en: "A joint or expression must exist on the model to adjust it. Choose a character that supports the pose you need." },
    ],
    steps: [
      { id: "pick-character", label: { ko: "캐릭터 고르기", en: "Choose a character" } },
      { id: "pose-character", label: { ko: "포즈를 적용하고 돌려 보기", en: "Apply a pose and orbit the view" } },
      { id: "insert-character", label: { ko: "원고에 넣어 레이어 확인하기", en: "Insert the character and check the layer" } },
    ],
  },
  dcc: {
    surface: "dcc",
    tier: "touch-assisted",
    label: { ko: "3D 작업대", en: "3D workbench" },
    canDo: [
      { ko: "‘맞춤 두상·계단’에서 도형을 고르고 계단의 단수 정하기", en: "Choose a shape in Custom head and stairs and set the step count" },
      { ko: "도형을 추가하고 .toon3d 작업파일로 저장하기", en: "Add the shape and save a .toon3d workfile" },
      GOTO_CANVAS_SIMPLE_EDIT,
    ],
    cannotDo: [
      { ko: "3D 미리보기에는 WebGL2가 필요해요. 미리보기가 열리지 않아도 작업파일을 저장해 다른 기기에서 이어갈 수 있어요.", en: "The 3D preview needs WebGL2. If it cannot open, save a workfile to continue on another device." },
    ],
    steps: [
      { id: "pick-primitive", label: { ko: "맞춤 두상 또는 계단 고르기", en: "Choose a custom head or staircase" } },
      { id: "add-primitive", label: { ko: "치수를 정하고 도형 추가하기", en: "Set the dimensions and add the shape" } },
      { id: "save-workfile", label: { ko: "다른 기기로 옮기려면 .toon3d 작업파일 저장하기", en: "Save a .toon3d workfile to move it to another device" } },
    ],
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
