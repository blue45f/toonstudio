/**
 * Studio stage work modes — 투닝 플러스의 "모드 분업" 흡수.
 *
 * 문제: 스튜디오 에디터는 단일 거대 표면이라 작업 단계(콘티·선화·채색·후보정·식자)와
 * 무관하게 도구 클러스터 전체가 노출된다. 밀도 모드(simple/full/focus)는
 * "양"만 조절할 뿐 "지금 하는 작업"에 맞는 스코핑을 하지 않는다.
 *
 * 이 모듈은 밀도 모델(studio-ui-density.ts)을 대체하지 않고 그 위에 얹힌다:
 * - 작업 모드 = 지금 단계에서 주인공인 영역(primary), 보이는 영역(visible),
 *   접어 두는 영역(folded)의 분류. 호스트는 밀도 노출과 합성해 최종 결정한다
 *   (합성 순서·게이팅 지점은 HOST_INSERTION_SPEC.md).
 * - 모드는 강제가 아니다. 전체 모드(all)는 기존 동작과 동일하게 전부 visible.
 * - followStage가 켜져 있으면 회차 파이프라인 단계 도출값이 모드를 제안하고,
 *   사용자가 직접 고른 모드가 항상 우선한다.
 */
import type { StudioUiChromeRegion } from "./studio-ui-density";

export const STUDIO_WORK_MODES = [
  "all",
  "storyboard",
  "draw",
  "color",
  "post",
  "lettering",
  "finish",
] as const;
export type StudioWorkMode = (typeof STUDIO_WORK_MODES)[number];

/** 파이프라인 순서 (전체 모드 제외) — "다음 단계" 도출용. */
export const STUDIO_WORK_MODE_PIPELINE: readonly StudioWorkMode[] = [
  "storyboard",
  "draw",
  "color",
  "post",
  "lettering",
  "finish",
];

export type StudioWorkModeExposure = "primary" | "visible" | "folded";

export interface StudioWorkModeMeta {
  readonly id: StudioWorkMode;
  /** i18n 사전 키 (사전 등록 전에는 ko 라벨로 폴백). */
  readonly i18nKey: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
}

export const STUDIO_WORK_MODE_META: Readonly<Record<StudioWorkMode, StudioWorkModeMeta>> = {
  all: {
    id: "all",
    i18nKey: "studio.workMode.all",
    labelKo: "전체",
    labelEn: "All",
    descriptionKo: "모든 도구를 한 번에 봅니다. 단계 구분 없이 자유롭게 작업할 때 골라요.",
    descriptionEn: "See every tool at once, without stage scoping.",
  },
  storyboard: {
    id: "storyboard",
    i18nKey: "studio.workMode.storyboard",
    labelKo: "콘티",
    labelEn: "Storyboard",
    descriptionKo: "컷을 나누고 장면 흐름을 잡는 단계예요. 그리기·채색 도구는 접어 둡니다.",
    descriptionEn: "Split cuts and shape the scene flow. Drawing and color tools stay folded.",
  },
  draw: {
    id: "draw",
    i18nKey: "studio.workMode.draw",
    labelKo: "스케치·선화",
    labelEn: "Draw",
    descriptionKo: "그리는 단계예요. 펜과 캔버스 주변 도구만 앞에 둡니다.",
    descriptionEn: "The drawing stage. Pen and canvas tools come first.",
  },
  color: {
    id: "color",
    i18nKey: "studio.workMode.color",
    labelKo: "채색",
    labelEn: "Color",
    descriptionKo: "색을 입히는 단계예요. 스타일과 색 도구 위주로 봅니다.",
    descriptionEn: "The coloring stage. Style and color tools come first.",
  },
  post: {
    id: "post",
    i18nKey: "studio.workMode.post",
    labelKo: "후보정",
    labelEn: "Post",
    descriptionKo: "채색 뒤 색감·명암·톤을 다듬는 단계예요. 조정과 색 도구 위주로 보고, 원본과 나란히 비교합니다.",
    descriptionEn: "After coloring: grading, levels, and tone. Adjustment and color tools come first, with the original beside you for comparison.",
  },
  lettering: {
    id: "lettering",
    i18nKey: "studio.workMode.lettering",
    labelKo: "식자",
    labelEn: "Lettering",
    descriptionKo: "대사와 글자를 넣는 단계예요. 그리기 도구는 접어 둡니다.",
    descriptionEn: "The lettering stage. Drawing tools stay folded.",
  },
  finish: {
    id: "finish",
    i18nKey: "studio.workMode.finish",
    labelKo: "마감",
    labelEn: "Finish",
    descriptionKo: "최종 점검과 게시 준비로 마무리하는 단계예요. 장면·스타일·AI 도구를 앞에 둡니다.",
    descriptionEn: "The finishing stage. Final checks and publish prep. Scene, style, and AI tools come first.",
  },
};

const VISIBLE_ALL: Readonly<Record<StudioUiChromeRegion, StudioWorkModeExposure>> = {
  "toolbar-assets": "visible",
  "toolbar-cut": "visible",
  "toolbar-draw": "visible",
  "toolbar-reference": "visible",
  "toolbar-scene": "visible",
  "toolbar-style": "visible",
  "toolbar-ai": "visible",
  "toolbar-insert": "visible",
  "left-panel": "visible",
  "right-panel": "visible",
  "page-strip": "visible",
  "status-rail": "visible",
  "tool-rail": "visible",
  "quick-actions": "visible",
};

function exposureMap(
  primary: readonly StudioUiChromeRegion[],
  visible: readonly StudioUiChromeRegion[],
): Readonly<Record<StudioUiChromeRegion, StudioWorkModeExposure>> {
  const map = { ...VISIBLE_ALL };
  (Object.keys(map) as StudioUiChromeRegion[]).forEach((region) => {
    map[region] = "folded";
  });
  visible.forEach((region) => {
    map[region] = "visible";
  });
  primary.forEach((region) => {
    map[region] = "primary";
  });
  return Object.freeze(map);
}

/**
 * 모드별 영역 노출 분류. 기준:
 * - primary: 이 단계의 주인공 도구. 접지 않는다.
 * - visible: 곁에 두면 편한 도구.
 * - folded: 이 단계에선 거의 안 쓰는 도구. 사라지는 게 아니라 접힌다
 *   (펼치면 바로 쓸 수 있고, 전체 모드로 돌아가면 전부 보인다).
 */
export const STUDIO_WORK_MODE_EXPOSURE: Readonly<
  Record<StudioWorkMode, Readonly<Record<StudioUiChromeRegion, StudioWorkModeExposure>>>
> = {
  all: VISIBLE_ALL,
  storyboard: exposureMap(
    ["toolbar-cut", "page-strip", "toolbar-reference", "left-panel"],
    ["toolbar-scene", "status-rail", "tool-rail", "quick-actions", "right-panel"],
  ),
  draw: exposureMap(
    ["toolbar-draw", "tool-rail", "right-panel"],
    [
      "toolbar-cut",
      "page-strip",
      "toolbar-reference",
      "status-rail",
      "quick-actions",
      "left-panel",
    ],
  ),
  color: exposureMap(
    ["toolbar-style", "tool-rail", "right-panel"],
    [
      "toolbar-draw",
      "toolbar-cut",
      "page-strip",
      "toolbar-reference",
      "status-rail",
      "quick-actions",
      "left-panel",
    ],
  ),
  post: exposureMap(
    ["toolbar-style", "right-panel"],
    [
      "toolbar-draw",
      "toolbar-cut",
      "toolbar-reference",
      "toolbar-scene",
      "page-strip",
      "status-rail",
      "tool-rail",
      "quick-actions",
      "left-panel",
    ],
  ),
  lettering: exposureMap(
    ["toolbar-insert", "right-panel"],
    ["toolbar-cut", "page-strip", "status-rail", "quick-actions", "left-panel"],
  ),
  finish: exposureMap(
    ["toolbar-style", "toolbar-ai", "toolbar-scene"],
    ["toolbar-cut", "page-strip", "status-rail", "right-panel", "quick-actions", "left-panel"],
  ),
};

export function isStudioWorkMode(value: unknown): value is StudioWorkMode {
  return (
    value === "all" ||
    value === "storyboard" ||
    value === "draw" ||
    value === "color" ||
    value === "post" ||
    value === "lettering" ||
    value === "finish"
  );
}

export function studioWorkModeExposure(
  mode: StudioWorkMode,
  region: StudioUiChromeRegion,
): StudioWorkModeExposure {
  return STUDIO_WORK_MODE_EXPOSURE[mode][region];
}

/** 접히지 않는(화면에 그대로 두는) 영역 목록. */
export function studioWorkModeOpenRegions(
  mode: StudioWorkMode,
): readonly StudioUiChromeRegion[] {
  const record = STUDIO_WORK_MODE_EXPOSURE[mode];
  return (Object.keys(record) as StudioUiChromeRegion[]).filter(
    (region) => record[region] !== "folded",
  );
}

export function studioWorkModePrimaryRegions(
  mode: StudioWorkMode,
): readonly StudioUiChromeRegion[] {
  const record = STUDIO_WORK_MODE_EXPOSURE[mode];
  return (Object.keys(record) as StudioUiChromeRegion[]).filter(
    (region) => record[region] === "primary",
  );
}

/** 파이프라인 순서상 다음 모드. 전체 모드는 콘티부터, 마감 다음은 없다. */
export function nextStudioWorkMode(mode: StudioWorkMode): StudioWorkMode | null {
  if (mode === "all") return "storyboard";
  const index = STUDIO_WORK_MODE_PIPELINE.indexOf(mode);
  if (index < 0 || index >= STUDIO_WORK_MODE_PIPELINE.length - 1) return null;
  return STUDIO_WORK_MODE_PIPELINE[index + 1];
}

/**
 * 회차 파이프라인 단계(7단계 도출값) → 제안 작업 모드.
 * 기획 단계는 에디터 밖이라 전체, 검수·게시는 마감 모드로 본다.
 */
export function suggestStudioWorkModeForStage(stage: string | null | undefined): StudioWorkMode {
  switch (stage) {
    case "storyboard":
    case "콘티":
      return "storyboard";
    case "sketch":
    case "lineart":
    case "draw":
    case "스케치":
    case "선화":
      return "draw";
    case "color":
    case "채색":
      return "color";
    case "post":
    case "retouch":
    case "grade":
    case "grading":
    case "후보정":
    case "보정":
      return "post";
    case "lettering":
    case "식자":
      return "lettering";
    case "review":
    case "publish":
    case "검수":
    case "게시":
      return "finish";
    default:
      return "all";
  }
}

export interface StudioWorkModeState {
  readonly mode: StudioWorkMode;
  /** 단계 제안 따라가기 — 켜져 있어도 수동 선택이 우선하고, 제안은 배너로만 뜬다. */
  readonly followStage: boolean;
  /** 사용자가 직접 고른 적이 있으면 true. 그 전에는 제안 모드를 기본값으로 쓴다. */
  readonly userPicked: boolean;
}

export const STUDIO_WORK_MODE_STORAGE_KEY = "toonstudio-studio-work-mode:v1";

export const DEFAULT_STUDIO_WORK_MODE_STATE: StudioWorkModeState = Object.freeze({
  mode: "all",
  followStage: true,
  userPicked: false,
});

export interface StudioWorkModeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function normalizeStudioWorkModeState(value?: unknown): StudioWorkModeState {
  if (!value || typeof value !== "object") return DEFAULT_STUDIO_WORK_MODE_STATE;
  const record = value as Record<string, unknown>;
  return Object.freeze({
    mode: isStudioWorkMode(record.mode) ? record.mode : "all",
    followStage: record.followStage !== false,
    userPicked: record.userPicked === true,
  });
}

export function loadStudioWorkModeState(
  storage: StudioWorkModeStorage | null | undefined,
): StudioWorkModeState {
  if (!storage) return DEFAULT_STUDIO_WORK_MODE_STATE;
  try {
    const raw = storage.getItem(STUDIO_WORK_MODE_STORAGE_KEY);
    if (!raw) return DEFAULT_STUDIO_WORK_MODE_STATE;
    return normalizeStudioWorkModeState(JSON.parse(raw));
  } catch {
    return DEFAULT_STUDIO_WORK_MODE_STATE;
  }
}

export function saveStudioWorkModeState(
  storage: StudioWorkModeStorage | null | undefined,
  state: StudioWorkModeState,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STUDIO_WORK_MODE_STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** 사용자가 모드를 직접 고른 상태로 전이 (userPicked 고정). */
export function pickStudioWorkMode(
  state: StudioWorkModeState,
  mode: StudioWorkMode,
): StudioWorkModeState {
  return Object.freeze({ ...state, mode, userPicked: true });
}

/**
 * 실제 적용 모드 도출: 수동 선택이 있으면 그것, 없고 followStage면 단계 제안,
 * 그것도 없으면 전체 모드. 제안은 강제 전환이 아니라 이 도출값과 배너로만 쓰인다.
 */
export function resolveStudioWorkMode(
  state: StudioWorkModeState,
  stage?: string | null,
): StudioWorkMode {
  if (state.userPicked) return state.mode;
  if (state.followStage && stage) return suggestStudioWorkModeForStage(stage);
  return state.mode;
}
