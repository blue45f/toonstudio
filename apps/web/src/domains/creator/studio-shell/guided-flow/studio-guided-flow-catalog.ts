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
    lane: "idea",
    imageUrl: "/brand/studio-canvas-previews/romance.webp",
    badgeKo: "800×1280 세로형 · 줄거리부터",
    badgeEn: "800×1280 Vertical · Story first",
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
    lane: "storyboard",
    imageUrl: "/brand/studio-canvas-previews/action.webp",
    badgeKo: "박진감 연출 · 콘티부터",
    badgeEn: "Dynamic Cuts · Boards first",
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

export function buildGuidedGenreStarterHref(spec: GuidedGenreStarterSpec): string {
  const params = new URLSearchParams();
  params.set("format", spec.formatId);
  if (spec.templateId) params.set("template", spec.templateId);
  params.set("lane", spec.lane);
  params.set("start", spec.startPoint);
  params.set("title", spec.sampleTitleKo);
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
 * 초보자 필수 6대 단축키·제스처 요약 데이터.
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

export type SafeZoneRhythmId = "cinematic" | "balanced" | "snappy";

export interface MobileSafeZoneAnalysis {
  readonly phoneScreensPerPage: number;
  readonly aspectRatioLabel: string;
  readonly readabilityTone: "optimal" | "warning";
  readonly statusKo: string;
  readonly statusEn: string;
  readonly adviceKo: string;
  readonly adviceEn: string;
  readonly cutsPerScreen: number;
}

/**
 * Clip Studio Paint 모바일 표시 영역 미리보기 및 WEBTOON Canvas 권장 규격(800×1280 비례)을
 * ToonStudio 용으로 재해석한 순수 O(1) 모바일 안전영역 시뮬레이터 계산기.
 */
export function analyzeMobileSafeZone(
  width: number,
  height: number,
  rhythm: SafeZoneRhythmId = "balanced",
): MobileSafeZoneAnalysis {
  const safeW = Math.max(1, width);
  const safeH = Math.max(1, height);
  // 표준 스마트폰 독자 뷰포트 세로/가로 비례 (16:10 ~ 16:9 평균 1.65)
  const singleScreenHeightAtWidth = safeW * 1.65;
  const rawScreens = safeH / singleScreenHeightAtWidth;
  const phoneScreensPerPage = Math.max(0.5, Math.round(rawScreens * 10) / 10);
  const cutsPerScreen = rhythm === "cinematic" ? 1 : rhythm === "balanced" ? 2 : 3;

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(Math.round(safeW), Math.round(safeH));
  const ratioW = Math.round(safeW / divisor);
  const ratioH = Math.round(safeH / divisor);
  const aspectRatioLabel =
    ratioW <= 32 && ratioH <= 64 ? `${ratioW}:${ratioH}` : `${safeW}×${safeH}`;

  if (safeW < 690) {
    return {
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
