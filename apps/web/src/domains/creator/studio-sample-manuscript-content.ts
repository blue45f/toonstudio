import { STUDIO_CANVAS_WIDTH } from "./canvas/studio-canvas-constants";
import type { El } from "./studio-element-model";
import type { LayerGroup } from "./studio-layers";
import type { PageState } from "./studio-page-state";

/**
 * 연습용 샘플 원고(완성작)의 내용물 단일 정본.
 *
 * 빈 템플릿이 아니라 "완성된 원고의 구조를 뜯어보며 따라 그리는" 연습 재료다.
 * 한 회차 2페이지가 컷 틀 → 밑그림 → 채색 → 톤 → 선화 → 말풍선·대사 여섯 개
 * 레이어 그룹으로 분리돼 있어, 에디터 레이어 패널에서 그룹 단위로 켜고 끄며
 * 각 층이 완성 그림에 무엇을 더하는지 눈으로 확인할 수 있다.
 *
 * 라이선스: 이 원고는 외부 작품을 가져온 것이 아니라 ToonStudio 연습용으로
 * 코드로 자체 제작한 오리지널이다(SAMPLE_MANUSCRIPT_LICENSE_NOTICE).
 * 저장·시딩·연습 사본 생성은 `studio-sample-manuscript-seed.ts`가 맡는다.
 */

export const SAMPLE_PROJECT_ID = "sample-manuscript-trace";
export const SAMPLE_DOCUMENT_ID = "sample-manuscript-ep01";
export const SAMPLE_PAGE_IDS = Object.freeze(["sample-page-1", "sample-page-2"] as const);

export const SAMPLE_PROJECT_TITLE = "샘플 원고 · 비 오는 날의 우체통";
export const SAMPLE_PROJECT_DESCRIPTION =
  "완성된 원고 2페이지를 레이어·톤·말풍선 구조 그대로 열어 보는 연습용 샘플입니다. 원본은 구조 확인용으로 두고, 연습 사본을 만들어 그 위에서 따라 그려 보세요.";
export const SAMPLE_DOCUMENT_TITLE = "EP01 비 오는 날의 우체통";

/** 연습 사본 프로젝트가 라이브러리에서 쓰는 templateId. 모드별로 분리해 기존 사본을 다시 찾을 수 있다. */
export const SAMPLE_PRACTICE_TEMPLATE_IDS = Object.freeze({
  trace: "sample-manuscript-practice-trace",
  study: "sample-manuscript-practice-study",
} as const);
export const SAMPLE_PRACTICE_PROJECT_ID_PREFIX = "sample-practice-";
export const SAMPLE_PRACTICE_TITLE = "연습 사본 · 샘플 원고 따라 그리기";
export const SAMPLE_PRACTICE_STUDY_TITLE = "복습 사본 · 샘플 원고 구조 뜯어보기";

export const SAMPLE_MANUSCRIPT_LICENSE_NOTICE =
  "이 샘플 원고는 ToonStudio가 연습용으로 자체 제작한 오리지널 원고입니다. 구조 학습과 따라 그리기 연습에 자유롭게 쓰세요.";

export const SAMPLE_DOCUMENT_WIDTH = STUDIO_CANVAS_WIDTH;
export const SAMPLE_DOCUMENT_HEIGHT = 1200;
export const SAMPLE_PAGE_CANVAS_H = 1200;

export const SAMPLE_EDITOR_HREF =
  `/studio/p/${SAMPLE_PROJECT_ID}/d/${SAMPLE_DOCUMENT_ID}?workspace=comic`;

export function samplePracticeEditorHref(projectId: string, documentId: string): string {
  return `/studio/p/${projectId}/d/${documentId}?workspace=comic`;
}

/* ------------------------------------------------------------------ */
/* 레이어 구조 가이드                                                     */
/* ------------------------------------------------------------------ */

export type SampleManuscriptLayerId = "frame" | "sketch" | "color" | "tone" | "ink" | "letter";

export interface SampleManuscriptLayerGuide {
  readonly id: SampleManuscriptLayerId;
  /** 페이지 안 레이어 그룹 id. 두 페이지가 같은 id를 쓴다(그룹은 페이지 소유). */
  readonly groupId: string;
  readonly groupName: string;
  readonly titleKo: string;
  readonly titleEn: string;
  /** 이 층이 완성 그림에서 하는 일. */
  readonly summaryKo: string;
  readonly summaryEn: string;
  /** 원본을 열었을 때 이 층에서 눈여겨볼 지점. */
  readonly lookKo: string;
  readonly lookEn: string;
  /** 연습 사본에서 직접 해 볼 따라 그리기 과제. */
  readonly missionKo: string;
  readonly missionEn: string;
}

/** 뒤(바닥) → 앞 순서. 페이지의 groups 배열과 요소 z 순서가 이 순서를 그대로 따른다. */
export const SAMPLE_MANUSCRIPT_LAYERS: readonly SampleManuscriptLayerGuide[] = Object.freeze([
  {
    id: "frame",
    groupId: "sample-g-frame",
    groupName: "컷 틀",
    titleKo: "컷 틀",
    titleEn: "Panel frames",
    summaryKo: "읽는 순서를 정하는 컷의 경계입니다. 1페이지는 와이드 컷과 클로즈업 컷 두 개, 2페이지는 한 컷으로 몰아줍니다.",
    summaryEn: "The panel borders that set the reading order. Page 1 pairs a wide shot with a close-up; page 2 commits to a single panel.",
    lookKo: "도입 컷(넓음)과 클로즈업 컷(얼굴 중심)의 크기 차이를 재 보세요. 중요한 장면일수록 컷이 커집니다.",
    lookEn: "Measure the size gap between the wide establishing panel and the face close-up. Bigger moments get bigger panels.",
    missionKo: "연습 사본 빈 곳에 같은 비율로 컷 틀 두 개를 다시 배치해 보세요.",
    missionEn: "In your practice copy, lay out two frames at the same ratio in an empty spot.",
  },
  {
    id: "sketch",
    groupId: "sample-g-sketch",
    groupName: "밑그림 (러프)",
    titleKo: "밑그림 (러프)",
    titleEn: "Rough sketch",
    summaryKo: "연한 파란 선으로 구도만 잡은 단계입니다. 얼굴의 십자 가이드와 몸의 중심선이 여기서 정해집니다.",
    summaryEn: "Composition only, in pale blue. The face cross-guide and the body's centre line are decided here.",
    lookKo: "완성 선화와 겹쳐 보세요. 밑그림의 십자 가이드가 눈·코 위치와 정확히 만납니다.",
    lookEn: "Overlay it with the finished ink. The sketch cross-guide lands exactly on the eyes and nose.",
    missionKo: "십자 가이드와 동그라미만으로 얼굴 위치를 내 연습 층에 다시 잡아 보세요.",
    missionEn: "On your practice layer, re-place the face using only a circle and a cross-guide.",
  },
  {
    id: "color",
    groupId: "sample-g-color",
    groupName: "채색",
    titleKo: "채색",
    titleEn: "Flat colour",
    summaryKo: "배경 → 인물 → 소품 순서로 면을 채운 단계입니다. 선 없이 색 덩어리만으로 장면이 읽히는지 확인하는 층입니다.",
    summaryEn: "Flats laid background → character → props. This layer checks that the scene reads as colour masses alone, no lines.",
    lookKo: "선화 그룹을 꺼 보세요. 색 면만으로도 우체통·인물·우산이 구분되면 채색 배분이 잘된 것입니다.",
    lookEn: "Toggle the ink group off. If the mailbox, figure and umbrella still read apart, the colour blocking works.",
    missionKo: "연습 사본에서 코트 색 하나를 다른 색으로 바꿔 보고 분위기가 어떻게 달라지는지 보세요.",
    missionEn: "In the practice copy, change the coat to a different colour and watch the mood shift.",
  },
  {
    id: "tone",
    groupId: "sample-g-tone",
    groupName: "톤",
    titleKo: "톤",
    titleEn: "Screentone",
    summaryKo: "점 패턴으로 그림자와 분위기를 얹는 층입니다. 구름·머리 그림자·땅의 젖은 부분에만 골라 썼습니다.",
    summaryEn: "Dot patterns that add shadow and mood. Used selectively: clouds, hair shadow, and the wet ground only.",
    lookKo: "톤이 있는 곳과 없는 곳을 비교하세요. 전면에 깔지 않고 '어둡게 하고 싶은 곳'에만 얹는 것이 요령입니다.",
    lookEn: "Compare toned and untoned areas. The trick is to lay tone only where you want weight, never wall-to-wall.",
    missionKo: "내 연습 층에 점들을 찍어 머리카락 아래 그림자를 직접 만들어 보세요.",
    missionEn: "On your practice layer, dot in a shadow under the hair yourself.",
  },
  {
    id: "ink",
    groupId: "sample-g-ink",
    groupName: "선화 (먹선)",
    titleKo: "선화 (먹선)",
    titleEn: "Ink lines",
    summaryKo: "밑그림을 따라 확정한 먹선과 효과선(빗줄기·집중선)입니다. 외곽은 굵게, 얼굴 안쪽은 가늘게 굵기를 나눴습니다.",
    summaryEn: "The committed ink over the sketch, plus effect lines (rain, focus lines). Outer contours are thick; inner face lines stay thin.",
    lookKo: "머리카락 흐름선의 방향을 따라가 보세요. 선의 방향이 곧 머리카락이 자라는 방향입니다.",
    lookEn: "Follow the hair strokes. Stroke direction is hair-growth direction.",
    missionKo: "원본 위에 겹쳐 머리카락 한 가닥의 흐름선을 그대로 따라 그어 보세요.",
    missionEn: "Trace one strand of the hair flow line directly over the original.",
  },
  {
    id: "letter",
    groupId: "sample-g-letter",
    groupName: "말풍선 · 대사",
    titleKo: "말풍선 · 대사",
    titleEn: "Balloons & lettering",
    summaryKo: "말풍선·대사·효과음이 사는 맨 앞 층입니다. 그림과 분리돼 있어 대사를 고쳐도 그림을 건드리지 않습니다.",
    summaryEn: "Balloons, dialogue and SFX live on this front layer, separate from the art — edit words without touching the drawing.",
    lookKo: "말풍선 꼬리가 화자를 향하는지, 풍선이 얼굴을 가리지 않는 자리인지 확인하세요.",
    lookEn: "Check that each tail points at its speaker and that no balloon covers a face.",
    missionKo: "대사를 내 캐릭터의 문장으로 바꾼 새 말풍선을 연습 층에 얹어 보세요.",
    missionEn: "Add a new balloon on the practice layer with the line rewritten in your character's voice.",
  },
]);

export const SAMPLE_LAYER_GROUP_IDS: readonly string[] = Object.freeze(
  SAMPLE_MANUSCRIPT_LAYERS.map((layer) => layer.groupId),
);

export function sampleManuscriptLayerGroups(): LayerGroup[] {
  return SAMPLE_MANUSCRIPT_LAYERS.map((layer) => ({
    id: layer.groupId,
    name: layer.groupName,
    collapsed: false,
    hidden: false,
    locked: false,
  }));
}

/* ------------------------------------------------------------------ */
/* 원고 본문 (자체 제작)                                                  */
/* ------------------------------------------------------------------ */

const INK = "#22252d";
const PAPER = "#fdf8ef";
const SKETCH = "#7ea6d8";

function frameEl(id: string, name: string, x: number, y: number, width: number, height: number): El {
  return {
    id, type: "frame", name, x, y, width, height,
    bgColor: PAPER, stroke: INK, strokeWidth: 2,
    groupId: "sample-g-frame",
  };
}

function sketchStroke(id: string, name: string, points: readonly number[], strokeWidth = 3): El {
  return {
    id, type: "draw", kind: "freehand", mode: "pen", name,
    points: [...points], stroke: SKETCH, strokeWidth, opacity: 0.55,
    groupId: "sample-g-sketch",
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
    id, type: "draw", kind, mode: "pen", name,
    points: [...points], stroke: fill, strokeWidth: 2, fill,
    groupId: "sample-g-color",
  };
}

function toneShape(
  id: string,
  name: string,
  kind: "rect" | "ellipse",
  points: readonly [number, number, number, number],
  fg: string,
  fallbackFill: string,
  scale = 1,
): El {
  return {
    id, type: "draw", kind, mode: "pen", name,
    points: [...points], stroke: fg, strokeWidth: 1, fill: fallbackFill,
    pattern: { patternId: "dots", fg, scale },
    groupId: "sample-g-tone",
  };
}

function inkStroke(id: string, name: string, points: readonly number[], strokeWidth: number): El {
  return {
    id, type: "draw", kind: "freehand", mode: "pen", name,
    points: [...points], stroke: INK, strokeWidth,
    groupId: "sample-g-ink",
  };
}

function bubbleEl(
  id: string,
  name: string,
  variant: "speech" | "thought",
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  tailXRatio: number,
): El {
  return {
    id, type: "bubble", variant, name, text, x, y, width, height,
    fill: "#ffffff", textFill: INK, rotation: 0,
    tailDirection: "bottom", tailXRatio,
    fontSize: 23, align: "center", stroke: INK, strokeWidth: 2,
    groupId: "sample-g-letter",
  };
}

function sfxText(id: string, text: string, x: number, y: number, fontSize: number, fill: string, rotation: number): El {
  return {
    id, type: "text", name: `효과음 · ${text}`, text, x, y,
    width: fontSize * text.length + 40, fontSize, fill, rotation, align: "center",
    groupId: "sample-g-letter",
  };
}

/** 동그라미 러프를 점열로 근사한다(밑그림 가이드용). */
function roughCircle(cx: number, cy: number, r: number): number[] {
  const points: number[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    points.push(Math.round(cx + Math.cos(angle) * r), Math.round(cy + Math.sin(angle) * r));
  }
  return points;
}

function buildSamplePage1(): PageState {
  const elements: El[] = [
    /* 컷 틀 */
    frameEl("sample-p1-frame-a", "컷 틀 · 1컷 (와이드)", 40, 40, 640, 500),
    frameEl("sample-p1-frame-b", "컷 틀 · 2컷 (클로즈업)", 40, 580, 640, 560),
    /* 밑그림 */
    sketchStroke("sample-p1-sketch-horizon", "밑그림 · 지평선", [56, 302, 664, 302]),
    sketchStroke("sample-p1-sketch-mailbox", "밑그림 · 우체통 위치", [428, 208, 428, 472, 562, 472, 562, 208, 428, 208]),
    sketchStroke("sample-p1-sketch-head", "밑그림 · 머리 동그라미", roughCircle(205, 285, 38)),
    sketchStroke("sample-p1-sketch-body", "밑그림 · 몸 중심선", [205, 323, 205, 500]),
    sketchStroke("sample-p1-sketch-face", "밑그림 · 얼굴 동그라미", roughCircle(360, 862, 150)),
    sketchStroke("sample-p1-sketch-face-cross-v", "밑그림 · 얼굴 세로 가이드", [360, 700, 360, 1030], 2),
    sketchStroke("sample-p1-sketch-face-cross-h", "밑그림 · 얼굴 가로 가이드", [205, 852, 515, 852], 2),
    /* 채색 */
    colourShape("sample-p1-colour-sky", "채색 · 하늘", "rect", [56, 56, 664, 302], "#bcd9f2"),
    colourShape("sample-p1-colour-ground", "채색 · 젖은 길", "rect", [56, 302, 664, 524], "#9db98a"),
    colourShape("sample-p1-colour-umbrella", "채색 · 우산", "ellipse", [108, 188, 302, 262], "#5b8def"),
    colourShape("sample-p1-colour-mailbox", "채색 · 우체통", "rect", [436, 250, 554, 470], "#d64541"),
    colourShape("sample-p1-colour-coat", "채색 · 코트", "rect", [150, 330, 260, 500], "#f2b134"),
    colourShape("sample-p1-colour-face", "채색 · 얼굴", "ellipse", [168, 240, 242, 330], "#ffcfb3"),
    colourShape("sample-p1-colour-b-bg", "채색 · 2컷 배경", "rect", [56, 596, 664, 1124], "#f6e3ee"),
    colourShape("sample-p1-colour-b-hair", "채색 · 2컷 머리카락", "ellipse", [182, 622, 538, 902], "#4a3728"),
    colourShape("sample-p1-colour-b-face", "채색 · 2컷 얼굴", "ellipse", [192, 652, 528, 1068], "#ffcfb3"),
    /* 톤 */
    toneShape("sample-p1-tone-cloud", "톤 · 구름", "rect", [384, 70, 650, 178], "#5b6b82", "#dfe7f0"),
    toneShape("sample-p1-tone-ground", "톤 · 젖은 길 반사", "rect", [56, 468, 664, 524], "#5f7a52", "#c3d2b4"),
    toneShape("sample-p1-tone-coat", "톤 · 코트 그림자", "rect", [150, 428, 260, 500], "#8a6d1f", "#e8cd8a"),
    toneShape("sample-p1-tone-hair", "톤 · 머리 그림자", "ellipse", [182, 622, 538, 822], "#2e2119", "#6b5847"),
    /* 선화 */
    inkStroke("sample-p1-ink-mailbox", "선화 · 우체통 윤곽", [436, 250, 554, 250, 554, 470, 436, 470, 436, 250], 5),
    inkStroke("sample-p1-ink-mailbox-slot", "선화 · 투입구", [458, 302, 532, 302], 4),
    inkStroke("sample-p1-ink-umbrella", "선화 · 우산 곡선", [108, 252, 150, 196, 205, 188, 260, 196, 302, 252], 5),
    inkStroke("sample-p1-ink-hair", "선화 · 머리카락", [170, 282, 182, 244, 205, 236, 228, 244, 240, 282], 6),
    inkStroke("sample-p1-ink-eye-l", "선화 · 왼쪽 눈", [186, 288, 198, 288], 5),
    inkStroke("sample-p1-ink-eye-r", "선화 · 오른쪽 눈", [212, 288, 224, 288], 5),
    inkStroke("sample-p1-ink-coat", "선화 · 코트 윤곽", [150, 500, 150, 330, 260, 330, 260, 500], 5),
    inkStroke("sample-p1-ink-rain-1", "선화 · 빗줄기 1", [330, 90, 318, 140], 3),
    inkStroke("sample-p1-ink-rain-2", "선화 · 빗줄기 2", [392, 130, 380, 180], 3),
    inkStroke("sample-p1-ink-rain-3", "선화 · 빗줄기 3", [600, 220, 588, 270], 3),
    inkStroke("sample-p1-ink-rain-4", "선화 · 빗줄기 4", [120, 320, 108, 368], 3),
    inkStroke("sample-p1-ink-b-hair-1", "선화 · 2컷 머리카락 흐름 1", [196, 800, 210, 668, 300, 630], 6),
    inkStroke("sample-p1-ink-b-hair-2", "선화 · 2컷 머리카락 흐름 2", [524, 800, 510, 668, 420, 630], 6),
    inkStroke("sample-p1-ink-b-eye-l", "선화 · 2컷 왼쪽 눈", [282, 852, 322, 852], 6),
    inkStroke("sample-p1-ink-b-eye-r", "선화 · 2컷 오른쪽 눈", [398, 852, 438, 852], 6),
    inkStroke("sample-p1-ink-b-brow-l", "선화 · 2컷 왼쪽 눈썹", [280, 826, 324, 820], 4),
    inkStroke("sample-p1-ink-b-brow-r", "선화 · 2컷 오른쪽 눈썹", [396, 820, 440, 826], 4),
    inkStroke("sample-p1-ink-b-nose", "선화 · 2컷 코", [360, 880, 352, 916, 366, 922], 4),
    inkStroke("sample-p1-ink-b-mouth", "선화 · 2컷 입", [330, 962, 360, 976, 390, 962], 5),
    /* 말풍선 · 대사 */
    bubbleEl("sample-p1-bubble-1", "말풍선 · 나레이션", "thought", "비 오는 날엔 편지가 더 멀리 간다.", 66, 66, 292, 100, 0.8),
    bubbleEl("sample-p1-bubble-2", "말풍선 · 주인공의 다짐", "speech", "넣었어… 내일이면 닿겠지.", 402, 606, 258, 106, 0.25),
    sfxText("sample-p1-sfx-rain", "촤아아", 470, 96, 32, "#3a5a80", -8),
  ];
  return {
    id: SAMPLE_PAGE_IDS[0],
    canvasH: SAMPLE_PAGE_CANVAS_H,
    bg: "#ffffff",
    bgGrad: null,
    name: "1페이지 · 우체통 앞",
    groups: sampleManuscriptLayerGroups(),
    elements,
  };
}

function buildSamplePage2(): PageState {
  const elements: El[] = [
    /* 컷 틀 */
    frameEl("sample-p2-frame", "컷 틀 · 답장 컷 (싱글)", 40, 40, 640, 1120),
    /* 밑그림 */
    sketchStroke("sample-p2-sketch-face", "밑그림 · 얼굴 동그라미", roughCircle(360, 520, 165)),
    sketchStroke("sample-p2-sketch-face-cross-v", "밑그림 · 얼굴 세로 가이드", [360, 340, 360, 700], 2),
    sketchStroke("sample-p2-sketch-face-cross-h", "밑그림 · 눈높이 가이드", [195, 505, 525, 505], 2),
    sketchStroke("sample-p2-sketch-letter", "밑그림 · 편지 위치", [428, 812, 428, 948, 604, 948, 604, 812, 428, 812]),
    /* 채색 */
    colourShape("sample-p2-colour-bg", "채색 · 개인 하늘", "rect", [56, 56, 664, 1144], "#ffe3b3"),
    colourShape("sample-p2-colour-hair", "채색 · 머리카락", "ellipse", [188, 238, 532, 648], "#4a3728"),
    colourShape("sample-p2-colour-face", "채색 · 얼굴", "ellipse", [208, 302, 512, 762], "#ffcfb3"),
    colourShape("sample-p2-colour-coat", "채색 · 코트", "rect", [178, 742, 542, 1144], "#d64541"),
    colourShape("sample-p2-colour-letter", "채색 · 답장 봉투", "rect", [434, 818, 598, 942], "#ffffff"),
    /* 톤 */
    toneShape("sample-p2-tone-hair", "톤 · 머리 그림자", "ellipse", [188, 238, 532, 470], "#2e2119", "#6b5847"),
    toneShape("sample-p2-tone-sun", "톤 · 햇살", "ellipse", [470, 70, 650, 250], "#e08e2b", "#f7d9a0", 1.25),
    toneShape("sample-p2-tone-coat", "톤 · 코트 그림자", "rect", [178, 1020, 542, 1144], "#7e2723", "#e08a86"),
    /* 선화 */
    inkStroke("sample-p2-ink-hair-1", "선화 · 머리카락 흐름 1", [206, 470, 224, 320, 320, 262], 7),
    inkStroke("sample-p2-ink-hair-2", "선화 · 머리카락 흐름 2", [514, 470, 496, 320, 400, 262], 7),
    inkStroke("sample-p2-ink-eye-l", "선화 · 왼쪽 눈 (올려보기)", [272, 508, 316, 500], 6),
    inkStroke("sample-p2-ink-eye-r", "선화 · 오른쪽 눈 (올려보기)", [404, 500, 448, 508], 6),
    inkStroke("sample-p2-ink-brow-l", "선화 · 왼쪽 눈썹", [270, 478, 318, 472], 4),
    inkStroke("sample-p2-ink-brow-r", "선화 · 오른쪽 눈썹", [402, 472, 450, 478], 4),
    inkStroke("sample-p2-ink-nose", "선화 · 코", [360, 540, 352, 578, 366, 584], 4),
    inkStroke("sample-p2-ink-mouth", "선화 · 활짝 웃는 입", [322, 622, 360, 648, 398, 622], 6),
    inkStroke("sample-p2-ink-letter", "선화 · 봉투 윤곽", [434, 818, 598, 818, 598, 942, 434, 942, 434, 818], 5),
    inkStroke("sample-p2-ink-letter-flap", "선화 · 봉투 접지선", [434, 818, 516, 884, 598, 818], 3),
    inkStroke("sample-p2-ink-stamp", "선화 · 우표", [548, 832, 584, 832, 584, 868, 548, 868, 548, 832], 3),
    {
      id: "sample-p2-ink-focus",
      type: "focusLines",
      name: "효과선 · 집중선",
      x: 60, y: 60, width: 600, height: 720,
      lineCount: 44, innerRadius: 150, outerRadius: 330,
      stroke: INK, strokeWidth: 2, noise: 0.35, rotation: 0, opacity: 0.45,
      groupId: "sample-g-ink",
    },
    /* 말풍선 · 대사 */
    bubbleEl("sample-p2-bubble-1", "말풍선 · 답장 도착", "speech", "답장이 왔어…! 읽어 봐도 돼?", 76, 96, 268, 106, 0.72),
    sfxText("sample-p2-sfx-heart", "두근", 528, 196, 34, "#c2433a", 6),
  ];
  return {
    id: SAMPLE_PAGE_IDS[1],
    canvasH: SAMPLE_PAGE_CANVAS_H,
    bg: "#ffffff",
    bgGrad: null,
    name: "2페이지 · 답장이 온 날",
    groups: sampleManuscriptLayerGroups(),
    elements,
  };
}

/**
 * 완성 샘플 원고 2페이지. 요소 배열 순서는 곧 z 순서(뒤→앞)이며,
 * 같은 그룹의 요소는 연속 구간을 이룬다(레이어 엔진의 CONTIGUOUS 계약).
 */
export function buildSampleManuscriptPages(): PageState[] {
  return [buildSamplePage1(), buildSamplePage2()];
}
