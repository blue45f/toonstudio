import type { StudioProjectFormat, StudioProjectStartPoint } from "../../studio-project-definition";

export interface GuidedGenreStarterSpec {
  readonly id: string;
  readonly quickPresetId: string;
  readonly formatId: StudioProjectFormat;
  readonly startPoint: StudioProjectStartPoint;
  readonly templateId?: string;
  readonly lane: "idea" | "storyboard";
  readonly imageUrl: string;
  readonly badgeKo: string;
  readonly badgeEn: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly sampleTitleKo: string;
  readonly sampleTitleEn: string;
  readonly descKo: string;
  readonly descEn: string;
  readonly ctaKo: string;
  readonly ctaEn: string;
}

/**
 * 시작 화면(/create)과 프로젝트 생성 화면(/studio/new)이 공유하는 단일 장르 프리셋 원장.
 * 새 장르나 포맷 프리셋을 추가할 때 이 배열 한 곳만 수정하면 두 화면에 일관되게 반영된다.
 */
export const STUDIO_GUIDED_GENRE_STARTERS: readonly GuidedGenreStarterSpec[] = Object.freeze([
  {
    id: "romance",
    quickPresetId: "romance-scroll",
    formatId: "vertical-webtoon",
    startPoint: "idea",
    templateId: "webtoon-canvas",
    lane: "idea",
    imageUrl: "/brand/studio-canvas-previews/romance.webp",
    badgeKo: "800×8000 세로형 · 줄거리부터",
    badgeEn: "800×8000 Vertical · Story first",
    titleKo: "로맨스 스크롤 웹툰",
    titleEn: "Romance Scroll Webtoon",
    sampleTitleKo: "설레는 첫 만남 1화",
    sampleTitleEn: "First Encounter Ep.1",
    descKo: "감성 대사와 세로 스크롤 여백이 준비된 첫 화 원고로 시작해요.",
    descEn: "Start Episode 1 with vertical scroll spacing tuned for emotional dialogue.",
    ctaKo: "로맨스 프리셋 열기",
    ctaEn: "Open romance preset",
  },
  {
    id: "action",
    quickPresetId: "action-fantasy",
    formatId: "vertical-webtoon",
    startPoint: "storyboard",
    templateId: "webtoon-vertical",
    lane: "storyboard",
    imageUrl: "/brand/studio-canvas-previews/action.webp",
    badgeKo: "1080×8000 고화질 · 콘티부터",
    badgeEn: "1080×8000 Hi-Res · Boards first",
    titleKo: "판타지·액션 연재",
    titleEn: "Fantasy & Action Series",
    sampleTitleKo: "각성의 순간 1화",
    sampleTitleEn: "Awakening Episode 1",
    descKo: "긴 호흡의 연출 컷과 콘티 구성을 먼저 잡고 바로 편집기로 들어가요.",
    descEn: "Jump straight into dynamic tall-panel storyboards.",
    ctaKo: "액션 프리셋 열기",
    ctaEn: "Open action preset",
  },
  {
    id: "daily",
    quickPresetId: "daily-cuttoon",
    formatId: "cuttoon",
    startPoint: "storyboard",
    templateId: "cuttoon-square-4",
    lane: "storyboard",
    imageUrl: "/brand/studio-canvas-previews/daily.webp",
    badgeKo: "1080×1080 정사각 · 4컷 카드",
    badgeEn: "1080×1080 Square · 4-Card",
    titleKo: "일상·공감 4컷툰",
    titleEn: "4-Panel Daily Toon",
    sampleTitleKo: "오늘 하루 네 컷 일기",
    sampleTitleEn: "Today in Four Panels",
    descKo: "인스타그램·SNS에서 넘겨 보기 좋은 4장 카드 규격으로 가볍게 그려요.",
    descEn: "Draw a swipe-friendly 4-panel social comic strip right away.",
    ctaKo: "4컷툰 프리셋 열기",
    ctaEn: "Open 4-panel preset",
  },
  {
    id: "mystery",
    quickPresetId: "world-comic",
    formatId: "page-comic",
    startPoint: "idea",
    templateId: "page-comic-digital-8",
    lane: "idea",
    imageUrl: "/brand/studio-canvas-previews/fantasy.webp",
    badgeKo: "출판·단편 · 페이지 만화",
    badgeEn: "Print & Short · Page Comic",
    titleKo: "미스터리·단편 만화",
    titleEn: "Mystery & Short Comic",
    sampleTitleKo: "자정의 도서관 제1장",
    sampleTitleEn: "Midnight Library Ch.1",
    descKo: "공모전이나 단행본에 맞춘 페이지 단위 원고와 세계관 노트로 시작해요.",
    descEn: "Begin with print-ready comic pages and worldbuilding notes.",
    ctaKo: "단편 프리셋 열기",
    ctaEn: "Open page preset",
  },
]);

export function findGuidedGenreStarter(
  idOrQuickPresetId: string | null | undefined,
): GuidedGenreStarterSpec | null {
  if (!idOrQuickPresetId) return null;
  const trimmed = idOrQuickPresetId.trim();
  if (!trimmed) return null;
  return (
    STUDIO_GUIDED_GENRE_STARTERS.find(
      (item) => item.id === trimmed || item.quickPresetId === trimmed,
    ) ?? null
  );
}

export function buildGuidedGenreStarterHref(
  spec: GuidedGenreStarterSpec,
  locale: "ko" | "en" = "ko",
): string {
  const params = new URLSearchParams();
  params.set("preset", spec.quickPresetId);
  params.set("format", spec.formatId);
  if (spec.templateId) params.set("template", spec.templateId);
  params.set("lane", spec.lane);
  params.set("start", spec.startPoint);
  params.set("title", locale === "en" ? spec.sampleTitleEn : spec.sampleTitleKo);
  return `/studio/new?${params.toString()}`;
}

export interface StudioEssentialShortcut {
  readonly keys: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly hintKo: string;
  readonly hintEn: string;
}

/**
 * Procreate QuickMenu · Rebelle HUD · Linear 명령 팔레트 원리를 재해석한
 * 초보자 필수 6대 단축키 요약 데이터.
 */
export const STUDIO_ESSENTIAL_SHORTCUTS: readonly StudioEssentialShortcut[] = Object.freeze([
  {
    keys: "B / E",
    labelKo: "브러시 · 지우개 전환",
    labelEn: "Brush / Eraser",
    hintKo: "그리기와 수정을 바로 오갑니다",
    hintEn: "Switch drawing and erasing instantly",
  },
  {
    keys: "[ / ]",
    labelKo: "브러시 크기 조절",
    labelEn: "Brush Size",
    hintKo: "패널을 열지 않고 선 굵기를 바꿉니다",
    hintEn: "Resize brush tip without opening menus",
  },
  {
    keys: "T",
    labelKo: "말풍선·대사 넣기",
    labelEn: "Speech Balloon",
    hintKo: "원하는 위치를 눌러 대사를 적습니다",
    hintEn: "Click canvas to place dialogue",
  },
  {
    keys: "Space",
    labelKo: "캔버스 손바닥 이동",
    labelEn: "Pan Canvas",
    hintKo: "누른 채 드래그해 원고 위치를 옮깁니다",
    hintEn: "Hold and drag to move around",
  },
  {
    keys: "⌘/Ctrl + Z",
    labelKo: "실행 취소",
    labelEn: "Undo",
    hintKo: "방금 그린 획을 안전하게 되돌립니다",
    hintEn: "Step back safely",
  },
  {
    keys: "⌘/Ctrl + K",
    labelKo: "기능 빠른 검색",
    labelEn: "Quick Command",
    hintKo: "찾는 도구를 이름으로 바로 실행합니다",
    hintEn: "Jump to any feature by name",
  },
]);

/**
 * 태블릿·스마트폰 환경에서 키보드 없이 바로 쓸 수 있는 필수 터치 제스처 요약.
 */
export const STUDIO_ESSENTIAL_TOUCH_GESTURES: readonly StudioEssentialShortcut[] = Object.freeze([
  {
    keys: "두 손가락 탭",
    labelKo: "실행 취소",
    labelEn: "Two-Finger Tap · Undo",
    hintKo: "방금 그린 획을 한 번에 되돌립니다",
    hintEn: "Undo your last stroke immediately",
  },
  {
    keys: "세 손가락 탭",
    labelKo: "다시 실행",
    labelEn: "Three-Finger Tap · Redo",
    hintKo: "되돌린 획을 다시 복원합니다",
    hintEn: "Restore an undone stroke",
  },
  {
    keys: "두 손가락 핀치",
    labelKo: "확대·축소 및 이동",
    labelEn: "Pinch & Drag · Zoom / Pan",
    hintKo: "원고를 확대하거나 원하는 위치로 옮깁니다",
    hintEn: "Zoom and pan smoothly around the canvas",
  },
  {
    keys: "길게 누르기",
    labelKo: "색상 스포이드",
    labelEn: "Long Press · Eyedropper",
    hintKo: "캔버스 위의 색상을 그대로 뽑아 씁니다",
    hintEn: "Sample any color directly from the canvas",
  },
]);

export type SafeZoneRhythmId = "cinematic" | "balanced" | "snappy";
export type SafeZonePreviewMode =
  | "vertical-scroll"
  | "card-news"
  | "page-spread"
  | "landscape";

export interface MobileSafeZoneAnalysis {
  readonly previewMode: SafeZonePreviewMode;
  readonly phoneScreensPerPage: number;
  readonly aspectRatioLabel: string;
  readonly readabilityTone: "optimal" | "warning";
  readonly statusKo: string;
  readonly statusEn: string;
  readonly adviceKo: string;
  readonly adviceEn: string;
  readonly cutsPerScreen: number;
}

function clampSafeDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(30_000, Math.max(1, Math.round(value)));
}

function greatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(Math.trunc(left)) || 1;
  let b = Math.abs(Math.trunc(right));
  while (b !== 0) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1;
}

/**
 * Clip Studio Paint 모바일 표시 영역 미리보기 및 WEBTOON Canvas 권장 규격(800×1280 비례)을
 * ToonStudio 용으로 재해석한 순수 O(1) 모바일·매체 안전영역 시뮬레이터 계산기.
 */
export function analyzeMobileSafeZone(
  width: number,
  height: number,
  rhythm: SafeZoneRhythmId = "balanced",
  formatId?: StudioProjectFormat,
  pageCount = 1,
): MobileSafeZoneAnalysis {
  const safeW = clampSafeDimension(width, 800);
  const safeH = clampSafeDimension(height, 1280);
  const safePages = clampSafeDimension(pageCount, 1);

  const divisor = greatestCommonDivisor(safeW, safeH);
  const ratioW = Math.max(1, Math.round(safeW / divisor));
  const ratioH = Math.max(1, Math.round(safeH / divisor));
  const aspectRatioLabel =
    ratioW <= 32 && ratioH <= 64 ? `${ratioW}:${ratioH}` : `${safeW}×${safeH}`;

  if (formatId === "cuttoon") {
    const optimal = safeW >= 800;
    return {
      previewMode: "card-news",
      phoneScreensPerPage: safePages,
      aspectRatioLabel,
      readabilityTone: optimal ? "optimal" : "warning",
      statusKo: optimal
        ? `SNS 카드 ${safePages}장 구성 · 피드 넘겨보기 최적`
        : "카드 가로 폭이 좁아 SNS 피드에서 흐려질 수 있어요",
      statusEn: optimal
        ? `${safePages}-card social strip · Crisp feed fit`
        : "Card width may look soft on high-DPI feeds",
      adviceKo: optimal
        ? "카드 1장에 핵심 장면 1컷과 큰 말풍선 1~2개만 두면 가독성이 좋아집니다."
        : "정사각·4:5 카드뉴스는 가로 1080px 규격을 권장해요.",
      adviceEn: optimal
        ? "Keep 1 focal beat and 1–2 large speech balloons per swipe card."
        : "1080px width is recommended for social card series.",
      cutsPerScreen: 1,
    };
  }

  if (formatId === "page-comic") {
    const optimal = safeW >= 1200;
    return {
      previewMode: "page-spread",
      phoneScreensPerPage: safePages,
      aspectRatioLabel,
      readabilityTone: optimal ? "optimal" : "warning",
      statusKo: optimal
        ? `페이지 원고 ${safePages}p · 단행본·디지털 열람 적합`
        : "출판·페이지 만화로는 가로 해상도가 다소 낮아요",
      statusEn: optimal
        ? `${safePages}-page comic · Ready for print & reader`
        : "Width is low for page comic print or tablet reading",
      adviceKo: optimal
        ? "재단선 안쪽 5% 안전영역 안에 말풍선과 주요 인물 얼굴을 배치하세요."
        : "페이지 만화는 가로 1600px 이상(인쇄는 300 DPI)을 권장해요.",
      adviceEn: optimal
        ? "Keep dialogue and faces inside the 5% inner trim safe zone."
        : "1600px+ width is recommended for page comics.",
      cutsPerScreen: 4,
    };
  }

  if (safeW > safeH) {
    const optimal = safeW >= 1280;
    return {
      previewMode: "landscape",
      phoneScreensPerPage: 1,
      aspectRatioLabel,
      readabilityTone: optimal ? "optimal" : "warning",
      statusKo: optimal
        ? "가로 와이드 화면 · 영상·키비주얼 구도 최적"
        : "가로 와이드 화면에서는 1280px 이상을 권장해요",
      statusEn: optimal
        ? "Wide canvas · Optimal for video & key visuals"
        : "1280px+ width is recommended for wide layouts",
      adviceKo: "중앙 핵심 피사체와 하단 자막 여백(10%)을 확보하면 썸네일에서도 잘리지 않아요.",
      adviceEn: "Leave a 10% bottom caption margin so titles stay clear.",
      cutsPerScreen: 1,
    };
  }

  // 표준 스마트폰 독자 뷰포트 세로/가로 비례 (16:10 ~ 16:9 평균 1.65)
  const singleScreenHeightAtWidth = safeW * 1.65;
  const rawScreens = safeH / singleScreenHeightAtWidth;
  const phoneScreensPerPage = Math.max(0.5, Math.round(rawScreens * 10) / 10);
  const cutsPerScreen = rhythm === "cinematic" ? 1 : rhythm === "balanced" ? 2 : 3;

  if (safeW < 690) {
    return {
      previewMode: "vertical-scroll",
      phoneScreensPerPage,
      aspectRatioLabel,
      readabilityTone: "warning",
      statusKo: "가로 폭이 좁아 고해상도 폰에서 선이 흐려질 수 있어요",
      statusEn: "Width may appear soft on high-DPI phones",
      adviceKo: "웹툰·SNS 연재는 가로 800px 또는 1080px 이상을 권장해요.",
      adviceEn: "800px or 1080px+ width is recommended for crisp mobile lines.",
      cutsPerScreen,
    };
  }

  return {
    previewMode: "vertical-scroll",
    phoneScreensPerPage,
    aspectRatioLabel,
    readabilityTone: "optimal",
    statusKo: `스마트폰 약 ${phoneScreensPerPage}화면 분량 · 모바일 가독성 최적`,
    statusEn: `~${phoneScreensPerPage} mobile screen(s) · Optimal readability`,
    adviceKo:
      rhythm === "cinematic"
        ? "한 화면에 큰 연출 1컷과 짧은 대사 1~2줄이 시원하게 들어갑니다."
        : rhythm === "balanced"
          ? "한 화면에 대화 2컷과 말풍선 여백이 가장 안정적으로 읽힙니다."
          : "빠른 개그·일상 호흡으로 한 화면에 3컷 내외가 경쾌하게 배치됩니다.",
    adviceEn:
      rhythm === "cinematic"
        ? "Fits 1 dramatic beat and 1–2 short lines per mobile screen."
        : rhythm === "balanced"
          ? "Balanced spacing for 2 dialogue panels per mobile viewport."
          : "Snappy pacing fitting up to 3 compact beats per screen.",
    cutsPerScreen,
  };
}
