import { STUDIO_CANVAS_WIDTH } from "./canvas/studio-canvas-constants";
import type { El } from "./studio-element-model";
import type { PageState } from "./studio-page-state";

/**
 * 예제 프로젝트의 내용물(페이지 요소·완주 여정)의 단일 정본.
 *
 * 저장·시딩 오케스트레이션은 `studio-example-project-seed.ts`가 맡고, 이 모듈은
 * 순수 데이터와 여정 진행 상태(별도 스토리지 키)만 다룬다. 그래서 내용 변경은
 * 여기만 고치면 되고, 시딩된 뒤 사용자가 고친 원고는 다시 덮지 않는다.
 */

export const EXAMPLE_PROJECT_ID = "example-first-webtoon";
export const EXAMPLE_DOCUMENT_ID = "example-ep01";
export const EXAMPLE_PAGE_ID = "example-page-1";

export const EXAMPLE_PROJECT_TITLE = "예제 · 첫 웹툰 한 컷";
export const EXAMPLE_PROJECT_DESCRIPTION =
  "선화·채색·말풍선이 이미 들어 있는 연습용 예제입니다. 마음껏 지우고 다시 그려 보세요. 원본이 망가질 걱정은 없습니다.";
export const EXAMPLE_DOCUMENT_TITLE = "EP01 원고";

/** 예제 문서 규격. `readStudioLocalCanvasSeed`가 720×1200 → canvasH 1200으로 환산한다. */
export const EXAMPLE_DOCUMENT_WIDTH = STUDIO_CANVAS_WIDTH;
export const EXAMPLE_DOCUMENT_HEIGHT = 1200;
export const EXAMPLE_PAGE_CANVAS_H = 1200;

/** 에디터로 바로 들어가는 주소. 문서 기본 작업공간은 webtoon 종류의 첫 값(comic)이다. */
export const EXAMPLE_EDITOR_HREF =
  `/studio/p/${EXAMPLE_PROJECT_ID}/d/${EXAMPLE_DOCUMENT_ID}?workspace=comic`;

const INK = "#22252d";
const PAPER = "#fdf6ec";

function inkStroke(
  id: string,
  name: string,
  points: readonly number[],
  strokeWidth: number,
): El {
  return {
    id,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    name,
    points: [...points],
    stroke: INK,
    strokeWidth,
  };
}

function colourShape(
  id: string,
  name: string,
  kind: "rect" | "ellipse",
  points: readonly [number, number, number, number],
  fill: string,
): El {
  return {
    id,
    type: "draw",
    kind,
    mode: "pen",
    name,
    points: [...points],
    stroke: fill,
    strokeWidth: 2,
    fill,
  };
}

/**
 * 선화(프리핸드 먹선)·채색(채워진 도형)·말풍선(대사)이 한 페이지에 함께 든 예제 페이지.
 * 요소 순서는 곧 z 순서다: 컷 틀 → 채색 → 선화 → 말풍선 → 안내 문구.
 * 모든 좌표는 캔버스(720×1200) 안에 들어간다.
 */
export function buildExampleProjectPage(): PageState {
  const elements: El[] = [
    {
      id: "example-panel-1",
      type: "frame",
      name: "컷 틀",
      x: 40,
      y: 40,
      width: STUDIO_CANVAS_WIDTH - 80,
      height: EXAMPLE_PAGE_CANVAS_H - 80,
      bgColor: PAPER,
      stroke: INK,
      strokeWidth: 2,
    },
    colourShape("example-colour-sun", "채색 · 해", "ellipse", [452, 128, 628, 304], "#ffd166"),
    colourShape("example-colour-hill", "채색 · 언덕", "rect", [40, 880, 680, 1160], "#a7d7a8"),
    colourShape("example-colour-scarf", "채색 · 목도리", "rect", [292, 560, 428, 600], "#ef6f6c"),
    colourShape("example-colour-coat", "채색 · 코트", "rect", [238, 596, 482, 908], "#5b8def"),
    colourShape("example-colour-face", "채색 · 얼굴", "ellipse", [262, 372, 458, 568], "#ffcfb3"),
    inkStroke("example-ink-hair", "선화 · 머리카락", [266, 430, 280, 366, 360, 336, 440, 366, 454, 430], 7),
    inkStroke("example-ink-eye-left", "선화 · 왼쪽 눈", [312, 452, 338, 452], 6),
    inkStroke("example-ink-eye-right", "선화 · 오른쪽 눈", [382, 452, 408, 452], 6),
    inkStroke("example-ink-smile", "선화 · 입", [336, 498, 360, 514, 384, 498], 5),
    inkStroke("example-ink-coat", "선화 · 코트 윤곽", [238, 908, 238, 596, 482, 596, 482, 908], 6),
    {
      id: "example-bubble-1",
      type: "bubble",
      variant: "speech",
      name: "말풍선 · 첫 대사",
      text: "안녕! 여기가 내 첫 컷이야.",
      x: 64,
      y: 84,
      width: 316,
      height: 118,
      fill: "#ffffff",
      textFill: INK,
      rotation: 0,
      tailDirection: "bottom",
      tailXRatio: 0.72,
      fontSize: 24,
      align: "center",
      stroke: INK,
      strokeWidth: 2,
    },
    {
      id: "example-caption-1",
      type: "text",
      name: "안내 문구",
      text: "예제예요 — 지우고, 칠하고, 말을 바꿔 보세요.",
      x: 70,
      y: 1088,
      width: 580,
      fontSize: 25,
      fill: "#3f5540",
      rotation: 0,
      align: "center",
    },
  ];
  return {
    id: EXAMPLE_PAGE_ID,
    canvasH: EXAMPLE_PAGE_CANVAS_H,
    bg: "#ffffff",
    bgGrad: null,
    name: EXAMPLE_DOCUMENT_TITLE,
    elements,
  };
}

/* ------------------------------------------------------------------ */
/* 완주 여정 체크리스트                                                  */
/* ------------------------------------------------------------------ */

export const EXAMPLE_JOURNEY_STORAGE_KEY = "toonspectrum:studio-example-journey:v1";

export interface ExampleJourneyStep {
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
  readonly href: string;
}

export type ExampleJourneyStepId =
  | "open-example"
  | "touch-lineart"
  | "change-colour"
  | "edit-bubble"
  | "start-own-work"
  | "save-and-publish";

/** 여정 단계는 고정 순서다. 앞 단계 링크가 전부 실제 라우트/에디터 주소인지 테스트가 고정한다. */
export function exampleJourneySteps(editorHref: string = EXAMPLE_EDITOR_HREF): readonly ExampleJourneyStep[] {
  return Object.freeze([
    {
      id: "open-example",
      titleKo: "예제 프로젝트 열기",
      titleEn: "Open the example project",
      hintKo: "선화·채색·말풍선이 든 한 컷이 바로 열립니다.",
      hintEn: "A finished panel with line art, colour and a speech balloon opens right away.",
      href: editorHref,
    },
    {
      id: "touch-lineart",
      titleKo: "선화 한 획 지우고 다시 긋기",
      titleEn: "Erase one line and redraw it",
      hintKo: "지우개로 머리카락 획 하나를 지우고 펜으로 다시 그어 보세요.",
      hintEn: "Erase one hair stroke and draw it again with the pen.",
      href: editorHref,
    },
    {
      id: "change-colour",
      titleKo: "채색 한 곳 색 바꾸기",
      titleEn: "Change one colour",
      hintKo: "코트나 해의 색을 골라 다른 색으로 칠해 보세요.",
      hintEn: "Pick the coat or the sun and repaint it in another colour.",
      href: editorHref,
    },
    {
      id: "edit-bubble",
      titleKo: "말풍선 대사 바꿔 보기",
      titleEn: "Rewrite the speech balloon",
      hintKo: "말풍선을 눌러 내 캐릭터의 첫 대사로 바꿔 보세요.",
      hintEn: "Tap the balloon and replace it with your character's first line.",
      href: editorHref,
    },
    {
      id: "start-own-work",
      titleKo: "내 작품 시작하기",
      titleEn: "Start your own work",
      hintKo: "익숙해졌으면 이야기부터·콘티부터·빈 캔버스 중 하나로 시작하세요.",
      hintEn: "When it feels familiar, start from a story, a storyboard, or a blank canvas.",
      href: "/create",
    },
    {
      id: "save-and-publish",
      titleKo: "저장하고 게시 준비하기",
      titleEn: "Save it and get ready to publish",
      hintKo: "라이브러리의 게시 준비 화면에서 저장·내보내기·게시를 확인하세요.",
      hintEn: "Check saving, export and publishing on the library's publish-ready screen.",
      href: "/studio?view=publications",
    },
  ]);
}

export const EXAMPLE_JOURNEY_STEP_IDS: readonly ExampleJourneyStepId[] = Object.freeze(
  exampleJourneySteps().map((step) => step.id as ExampleJourneyStepId),
);

export interface ExampleJourneyState {
  readonly doneIds: readonly ExampleJourneyStepId[];
  readonly dismissed: boolean;
  readonly updatedAt: string;
}

export interface ExampleJourneyStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const EMPTY_JOURNEY: ExampleJourneyState = Object.freeze({
  doneIds: Object.freeze([]),
  dismissed: false,
  updatedAt: new Date(0).toISOString(),
});

function isStepId(value: unknown): value is ExampleJourneyStepId {
  return typeof value === "string"
    && (EXAMPLE_JOURNEY_STEP_IDS as readonly string[]).includes(value);
}

/** 깨진 저장값은 여정을 막지 않는다 — 빈 여정으로 읽고 다음 기록 때 정본으로 덮는다. */
export function readExampleJourney(storage: ExampleJourneyStorage): ExampleJourneyState {
  try {
    const raw = storage.getItem(EXAMPLE_JOURNEY_STORAGE_KEY);
    if (!raw) return EMPTY_JOURNEY;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return EMPTY_JOURNEY;
    const record = parsed as Record<string, unknown>;
    const doneIds = Array.isArray(record.doneIds)
      ? record.doneIds.filter(isStepId)
      : [];
    return Object.freeze({
      doneIds: Object.freeze([...new Set(doneIds)]),
      dismissed: record.dismissed === true,
      updatedAt: typeof record.updatedAt === "string" && Number.isFinite(Date.parse(record.updatedAt))
        ? record.updatedAt
        : EMPTY_JOURNEY.updatedAt,
    });
  } catch {
    return EMPTY_JOURNEY;
  }
}

function writeExampleJourney(
  storage: ExampleJourneyStorage,
  state: ExampleJourneyState,
): ExampleJourneyState {
  storage.setItem(EXAMPLE_JOURNEY_STORAGE_KEY, JSON.stringify({
    version: 1,
    doneIds: state.doneIds,
    dismissed: state.dismissed,
    updatedAt: state.updatedAt,
  }));
  return state;
}

export function toggleExampleJourneyStep(
  storage: ExampleJourneyStorage,
  stepId: ExampleJourneyStepId,
  options: { readonly at?: string } = {},
): ExampleJourneyState {
  const current = readExampleJourney(storage);
  const done = current.doneIds.includes(stepId);
  const doneIds = done
    ? current.doneIds.filter((id) => id !== stepId)
    : [...current.doneIds, stepId];
  // 단계 순서를 저장 순서가 아니라 정본 순서로 유지한다.
  const ordered = EXAMPLE_JOURNEY_STEP_IDS.filter((id) => doneIds.includes(id));
  return writeExampleJourney(storage, Object.freeze({
    doneIds: Object.freeze(ordered),
    dismissed: false,
    updatedAt: options.at ?? new Date().toISOString(),
  }));
}

export function setExampleJourneyDismissed(
  storage: ExampleJourneyStorage,
  dismissed: boolean,
  options: { readonly at?: string } = {},
): ExampleJourneyState {
  const current = readExampleJourney(storage);
  return writeExampleJourney(storage, Object.freeze({
    ...current,
    dismissed,
    updatedAt: options.at ?? new Date().toISOString(),
  }));
}

export function exampleJourneyProgress(state: ExampleJourneyState): {
  readonly done: number;
  readonly total: number;
  readonly ratio: number;
} {
  const total = EXAMPLE_JOURNEY_STEP_IDS.length;
  const done = state.doneIds.length;
  return { done, total, ratio: total === 0 ? 0 : done / total };
}
