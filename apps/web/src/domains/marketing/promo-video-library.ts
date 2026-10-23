/**
 * 홍보 영상 자료실(/promo-library)의 통합 레지스트리 — 지금까지 만든 홍보
 * 영상 59편을 카테고리별로 모아, 나중에 쇼츠·마케팅 소재로 꺼내 쓸 수 있게
 * 한곳에서 관리한다.
 *
 * 전부 생성형 AI로 만든 개념 영상이라 실제 제품 화면 캡처가 아니다.
 * 자료실 페이지 상단에서도 그 성격을 밝힌다.
 *
 * src·규격·배선처의 정본은 기존 레지스트리고, 이 파일은 그 매핑을 참조해
 * 자료실 표시용 제목·설명·활용 상태만 덧붙인다:
 * - 쇼츠 10편: product-tour-shorts.ts (PRODUCT_TOUR_SHORTS)
 * - 투어 도입·마무리·전환 5편: product-tour-clips.ts
 * - 챕터 배경 루프 9편: product-tour-clips.ts + 챕터 이름은
 *   product-tour-content.ts의 PRODUCT_TOUR.chapters
 * - 브랜드 클립 9편: brand-clips.ts (배선 8편 + 자료실 보관인 밤 버전 1편)
 * - 도구 클립 15편: tool-clips.ts의 가로본 12편(제작 허브 1편 + 기능 요약
 *   카테고리 7편 + 보류 1편)과 세로 변형 3편(TOOL_CLIPS_VERTICAL), 그리고
 *   제작 과정 단계 패널로 재배선한 3편(comic·shaper·publish — src·단계
 *   매핑의 정본은 public/workflow-stages.ts의 WORKFLOW_STAGE_CLIPS라
 *   여기서는 그 값을 옮겨 적고 출처를 밝힌다)
 * - 페이지 클립 11편: 이 파일이 첫 레지스트리다 (public/brand/page-clips/).
 *   전부 아직 표면에 배선하지 않은 자료실 보관분이고, 홈 무드는 결함본을
 *   교체한 v2가 정본이며 계절 변형 2편(가을·겨울)을 함께 둔다.
 */
import {
  BRAND_FILM_CLOSING_CLIP,
  BRAND_FILM_SCENE_CLIPS,
  BRAND_NIGHT_STUDIO_CLIP,
  FEATURES_AMBIENT_CLIP,
  HOME_CORE_STUDIO_3D_BACKDROP_CLIP,
  STUDIO_INTRO_CLOSING_CLIP,
} from "./brand-clips";
import {
  PRODUCT_TOUR_INTRO_CLIP,
  PRODUCT_TOUR_OUTRO_CLIP,
  PRODUCT_TOUR_TRANSITION_BG3D_CLIP,
  PRODUCT_TOUR_TRANSITION_DRAWING_CLIP,
  PRODUCT_TOUR_TRANSITION_SERIAL_CLIP,
  productTourChapterLoop,
  type ProductTourChapterLoopId,
} from "./product-tour-clips";
import { PRODUCT_TOUR } from "./product-tour-content";
import { PRODUCT_TOUR_SHORTS } from "./product-tour-shorts";
import {
  FEATURE_OVERVIEW_CATEGORY_CLIPS,
  TOOL_CLIPS_STAGED,
  TOOL_CLIPS_VERTICAL,
  TOOL_SURFACE_CLIPS,
} from "./tool-clips";

export type PromoVideoCategoryId =
  | "shorts"
  | "tour"
  | "chapter-loops"
  | "brand"
  | "tools"
  | "pages";

export interface PromoVideoCategory {
  readonly id: PromoVideoCategoryId;
  readonly ko: { readonly title: string; readonly body: string };
  readonly en: { readonly title: string; readonly body: string };
}

export const PROMO_VIDEO_CATEGORIES: readonly PromoVideoCategory[] = [
  {
    id: "shorts",
    ko: {
      title: "세로 쇼츠",
      body: "소셜과 짧은 홍보에 바로 쓰는 세로(9:16) 쇼츠입니다. 제품 투어 페이지의 쇼츠 섹션에도 같은 열 편이 걸려 있습니다.",
    },
    en: {
      title: "Vertical shorts",
      body: "Vertical (9:16) shorts ready for social and quick promos. The same ten also run in the shorts section of the product tour page.",
    },
  },
  {
    id: "tour",
    ko: {
      title: "투어 배경·전환",
      body: "제품 투어의 도입·마무리를 여는 배경 클립과, 챕터 사이를 잇던 전환 클립입니다. 전환 클립은 플레이어 구조상 투어 안에 끼우지 못해 소개 표면의 배경으로 옮겨 쓰고 있습니다.",
    },
    en: {
      title: "Tour backdrops & transitions",
      body: "The backdrop clips that open and close the product tour, plus the transition clips made to sit between chapters. The player has no seam for them, so the transitions now serve as backdrops on intro surfaces instead.",
    },
  },
  {
    id: "chapter-loops",
    ko: {
      title: "챕터 배경 루프",
      body: "제품 투어 챕터 카드마다 은은하게 깔리는 챕터별 분위기 루프입니다.",
    },
    en: {
      title: "Chapter backdrop loops",
      body: "One ambient loop per product tour chapter, laid softly behind each chapter card.",
    },
  },
  {
    id: "brand",
    ko: {
      title: "브랜드 클립",
      body: "브랜드 필름의 장면 패널과 마무리, 기능 요약·소개 페이지의 밴드 배경으로 쓰는 분위기 클립입니다.",
    },
    en: {
      title: "Brand clips",
      body: "Mood clips used behind the brand film's scene panels and closing, and as band backdrops on the features and studio intro pages.",
    },
  },
  {
    id: "tools",
    ko: {
      title: "도구 클립",
      body: "도구마다 하나씩 만든 분위기 클립입니다. 기능 요약 페이지의 카테고리 밴드와 제작 과정 단계 패널, 제작 허브 히어로에 나뉘어 걸려 있습니다.",
    },
    en: {
      title: "Tool clips",
      body: "One mood clip per tool, spread across the feature overview category bands, the workflow stage panels and the production hub hero.",
    },
  },
  {
    id: "pages",
    ko: {
      title: "페이지 클립",
      body: "소개·요금·제작 과정 같은 페이지 표면을 위해 만들었지만 아직 배선하지 않은 클립입니다. 페이지 개편 때 바로 꺼내 쓸 수 있게 보관합니다.",
    },
    en: {
      title: "Page clips",
      body: "Clips made for surfaces such as the about, pricing and workflow pages that are not wired anywhere yet — kept here so a page refresh can pick them up right away.",
    },
  },
];

export interface PromoVideoItem {
  readonly id: string;
  readonly categoryId: PromoVideoCategoryId;
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly durationLabel: string;
  readonly ko: { readonly title: string; readonly body: string };
  readonly en: { readonly title: string; readonly body: string };
  /** 지금 이 영상을 쓰는 표면. 배선처가 없으면 "자료실 보관". */
  readonly usage: { readonly ko: string; readonly en: string };
  /** 품질 메모처럼 항목에만 붙는 주의. */
  readonly note?: { readonly ko: string; readonly en: string };
}

const LIBRARY_ONLY = { ko: "자료실 보관", en: "Library only" } as const;

const SHORTS_USAGE = {
  ko: "제품 투어 페이지 · 쇼츠 섹션",
  en: "Product tour page · Shorts section",
} as const;

const shorts: readonly PromoVideoItem[] = PRODUCT_TOUR_SHORTS.map((short) => ({
  id: `shorts-${short.id}`,
  categoryId: "shorts",
  src: short.src,
  width: short.width,
  height: short.height,
  durationLabel: short.durationLabel,
  ko: short.ko,
  en: short.en,
  usage: SHORTS_USAGE,
}));

const tour: readonly PromoVideoItem[] = [
  {
    id: "tour-intro",
    categoryId: "tour",
    ...PRODUCT_TOUR_INTRO_CLIP,
    durationLabel: "0:14",
    ko: {
      title: "투어 도입 배경",
      body: "램프 불빛 아래 작업실로 들어서는 장면으로 제품 투어의 첫 화면을 여는 배경 클립입니다.",
    },
    en: {
      title: "Tour opening backdrop",
      body: "A studio under lamplight that opens the first screen of the product tour.",
    },
    usage: { ko: "제품 투어 페이지 · 히어로 배경", en: "Product tour page · Hero backdrop" },
  },
  {
    id: "tour-outro",
    categoryId: "tour",
    src: PRODUCT_TOUR_OUTRO_CLIP.src,
    width: PRODUCT_TOUR_OUTRO_CLIP.width,
    height: PRODUCT_TOUR_OUTRO_CLIP.height,
    durationLabel: "0:14",
    ko: {
      title: PRODUCT_TOUR_OUTRO_CLIP.ko.title,
      body: PRODUCT_TOUR_OUTRO_CLIP.ko.body,
    },
    en: {
      title: PRODUCT_TOUR_OUTRO_CLIP.en.title,
      body: PRODUCT_TOUR_OUTRO_CLIP.en.body,
    },
    usage: { ko: "제품 투어 페이지 · 마무리 배경", en: "Product tour page · Closing backdrop" },
  },
  {
    ...PRODUCT_TOUR_TRANSITION_DRAWING_CLIP,
    id: "tour-transition-drawing",
    categoryId: "tour",
    durationLabel: "0:14",
    ko: {
      title: "전환 · 작화",
      body: "펜 끝에서 잉크가 흘러 컷이 그려지는 장면을 그린 전환용 클립입니다.",
    },
    en: {
      title: "Transition · Drawing",
      body: "A transition clip of ink flowing from a pen tip as a panel takes shape.",
    },
    usage: { ko: "웹툰 제작 과정 · 작화 단계 패널 배경", en: "Webtoon workflow · Art stage panel backdrop" },
  },
  {
    ...PRODUCT_TOUR_TRANSITION_BG3D_CLIP,
    id: "tour-transition-bg3d",
    categoryId: "tour",
    durationLabel: "0:14",
    ko: {
      title: "전환 · 3D 배경",
      body: "3D 배경 공간을 천천히 도는 장면을 그린 전환용 클립입니다.",
    },
    en: {
      title: "Transition · 3D backdrop",
      body: "A transition clip slowly orbiting a 3D background set.",
    },
    usage: { ko: "서비스 소개 · 2D·3D 제작 단계 카드 배경", en: "About the studio · 2D/3D production stage card backdrop" },
  },
  {
    ...PRODUCT_TOUR_TRANSITION_SERIAL_CLIP,
    id: "tour-transition-serial",
    categoryId: "tour",
    durationLabel: "0:14",
    ko: {
      title: "전환 · 연재",
      body: "연재 캘린더에 체크가 하나씩 채워지는 장면을 그린 전환용 클립입니다.",
    },
    en: {
      title: "Transition · Serialisation",
      body: "A transition clip of checks filling in on a serialisation calendar.",
    },
    usage: { ko: "제품 투어 페이지 · 새로 더해진 기능 카드 배경", en: "Product tour page · What's-new card backdrop" },
  },
];

const CHAPTER_LOOP_IDS: readonly ProductTourChapterLoopId[] = [
  "plan",
  "draw",
  "comic",
  "three-d",
  "space",
  "assist",
  "production",
  "learn",
  "finish",
];

const chapterLoops: readonly PromoVideoItem[] = CHAPTER_LOOP_IDS.flatMap((chapterId) => {
  const loop = productTourChapterLoop(chapterId);
  const chapter = PRODUCT_TOUR.chapters.find((entry) => entry.id === chapterId);
  if (!loop || !chapter) return [];
  return [
    {
      id: `chapter-loop-${chapterId}`,
      categoryId: "chapter-loops",
      src: loop.src,
      width: loop.width,
      height: loop.height,
      durationLabel: "0:14",
      ko: {
        title: `${chapter.ko} · 배경 루프`,
        body: chapter.summary.ko,
      },
      en: {
        title: `${chapter.en} · Backdrop loop`,
        body: chapter.summary.en,
      },
      usage: { ko: "제품 투어 페이지 · 챕터 카드 배경", en: "Product tour page · Chapter card backdrop" },
    },
  ];
});

const brandSceneCopy = {
  imagine: {
    id: "brand-dawn-studio",
    ko: { title: "새벽의 작업실", body: "여명이 드는 작업실의 공기를 그린 클립입니다." },
    en: { title: "Dawn studio", body: "The air of a studio at first light." },
    usage: { ko: "브랜드 필름 · 상상 장면 패널 배경", en: "Brand film · Imagine scene panel backdrop" },
  },
  draw: {
    id: "brand-pen-particles",
    ko: { title: "펜 끝의 입자", body: "펜 끝에서 빛 입자가 흩어지는 장면을 그린 클립입니다." },
    en: { title: "Particles from a pen tip", body: "Light particles scattering from the tip of a pen." },
    usage: { ko: "브랜드 필름 · 그리기 장면 패널 배경", en: "Brand film · Draw scene panel backdrop" },
  },
  create: {
    id: "brand-shared-canvas",
    ko: { title: "함께 그리는 캔버스", body: "여러 손이 한 캔버스를 함께 채우는 장면을 그린 클립입니다." },
    en: { title: "A canvas drawn together", body: "Several hands filling one shared canvas." },
    usage: { ko: "브랜드 필름 · 만들기 장면 패널 배경", en: "Brand film · Create scene panel backdrop" },
  },
  finish: {
    id: "brand-publish-light",
    ko: { title: "게시되는 빛", body: "완성한 원고가 빛으로 게시되는 장면을 그린 클립입니다." },
    en: { title: "Light, published", body: "A finished manuscript going out as light." },
    usage: { ko: "브랜드 필름 · 마무리 장면 패널 배경", en: "Brand film · Finish scene panel backdrop" },
  },
} as const;

const brandScenes: readonly PromoVideoItem[] = BRAND_FILM_SCENE_CLIPS.map((clip) => {
  const copy = brandSceneCopy[clip.sceneId];
  return {
    id: copy.id,
    categoryId: "brand",
    src: clip.src,
    width: clip.width,
    height: clip.height,
    durationLabel: "0:14",
    ko: copy.ko,
    en: copy.en,
    usage: copy.usage,
  };
});

const brand: readonly PromoVideoItem[] = [
  ...brandScenes,
  {
    id: "brand-webtoon-sky",
    categoryId: "brand",
    ...BRAND_FILM_CLOSING_CLIP,
    durationLabel: "0:14",
    ko: {
      title: "밤하늘로 번지는 웹툰",
      body: "웹툰 컷이 밤하늘로 번져 나가는 장면을 그린 클립입니다.",
    },
    en: {
      title: "A webtoon spreading into the night sky",
      body: "Webtoon panels spreading out into the night sky.",
    },
    usage: { ko: "브랜드 필름 페이지 · 마무리 배경", en: "Brand film page · Closing backdrop" },
  },
  {
    id: "brand-features-ambient",
    categoryId: "brand",
    ...FEATURES_AMBIENT_CLIP,
    durationLabel: "0:14",
    ko: {
      title: "기능 카드 위 빛 궤적",
      body: "기능 카드 위를 빛의 궤적이 흐르는 장면을 그린 클립입니다.",
    },
    en: {
      title: "Light trails over feature cards",
      body: "Trails of light flowing over feature cards.",
    },
    usage: { ko: "기능 요약 페이지 · 마무리 CTA 배경", en: "Features overview · Closing CTA backdrop" },
  },
  {
    id: "brand-day-studio",
    categoryId: "brand",
    ...STUDIO_INTRO_CLOSING_CLIP,
    durationLabel: "0:14",
    ko: {
      title: "낮의 스튜디오 파노라마",
      body: "밝은 낮의 스튜디오를 넓게 담은 파노라마 클립입니다.",
    },
    en: {
      title: "Daytime studio panorama",
      body: "A wide panorama of the studio in bright daylight.",
    },
    usage: { ko: "서비스 소개 · 마무리 밴드 배경", en: "About the studio · Closing band backdrop" },
  },
  {
    id: "brand-cafe-flythrough",
    categoryId: "brand",
    src: HOME_CORE_STUDIO_3D_BACKDROP_CLIP.src,
    width: HOME_CORE_STUDIO_3D_BACKDROP_CLIP.width,
    height: HOME_CORE_STUDIO_3D_BACKDROP_CLIP.height,
    durationLabel: "0:14",
    ko: {
      title: "3D 카페 거리 비행",
      body: "3D로 만든 카페 거리를 천천히 비행하는 장면을 그린 클립입니다.",
    },
    en: {
      title: "Flying through a 3D café street",
      body: "A slow flight through a café street built in 3D.",
    },
    usage: { ko: "홈 · 핵심 작업실 그리드 3D 카드 배경", en: "Home · Core studios grid, 3D card backdrop" },
  },
  {
    id: "brand-night-studio",
    categoryId: "brand",
    ...BRAND_NIGHT_STUDIO_CLIP,
    durationLabel: "0:14",
    ko: {
      title: "밤의 스튜디오",
      body: "도시 불빛과 램프 아래 밤의 작업실을 그린 클립입니다. 낮 파노라마의 짝으로 만들었습니다.",
    },
    en: {
      title: "Night studio",
      body: "A night studio under city lights and a desk lamp — the counterpart to the daytime panorama.",
    },
    usage: LIBRARY_ONLY,
  },
];

const FEATURE_BAND_USAGE = {
  ko: "기능 요약 페이지 · 카테고리 헤더 밴드 배경",
  en: "Features overview · Category header band backdrop",
} as const;

const WORKFLOW_STAGE_USAGE = {
  ko: "웹툰 제작 과정 · 단계 패널 배경",
  en: "Webtoon workflow · Stage panel backdrop",
} as const;

const toolCopy = {
  canvas: {
    ko: { title: "캔버스 · 드로잉", body: "브러시와 레이어가 오가는 드로잉 작업의 공기를 그린 클립입니다." },
    en: { title: "Canvas · Drawing", body: "The feel of drawing work, brushes and layers in motion." },
  },
  story: {
    ko: { title: "스토리 · 기획", body: "세계관과 회차를 짜는 기획 단계의 분위기를 그린 클립입니다." },
    en: { title: "Story · Planning", body: "The mood of the planning stage, shaping worlds and episodes." },
  },
  comic: {
    ko: { title: "컷툰 · 컷 구성", body: "컷을 나누고 말풍선을 얹는 편집의 리듬을 그린 클립입니다." },
    en: { title: "Panels · Layout", body: "The rhythm of splitting panels and placing balloons." },
  },
  bg3d: {
    ko: { title: "3D 배경", body: "배경 공간을 구성하고 카메라를 잡는 장면을 그린 클립입니다." },
    en: { title: "3D backgrounds", body: "Composing a background set and framing the camera." },
  },
  poser: {
    ko: { title: "포저 · 데생 인형", body: "데생 인형의 포즈를 돌려 보는 장면을 그린 클립입니다." },
    en: { title: "Poser · Drawing mannequin", body: "Turning a drawing mannequin through poses." },
  },
  shaper: {
    ko: { title: "캐릭터 셰이퍼", body: "3D 캐릭터를 빚는 작업의 분위기를 그린 클립입니다." },
    en: { title: "Character shaper", body: "The mood of shaping a 3D character." },
  },
  ailab: {
    ko: { title: "AI 변환실", body: "선화가 채색으로 바뀌는 AI 보조의 흐름을 그린 클립입니다." },
    en: { title: "AI lab", body: "Line art turning into color with AI assistance." },
  },
  publish: {
    ko: { title: "검수 · 게시", body: "원고를 검수하고 게시로 넘기는 마무리의 공기를 그린 클립입니다." },
    en: { title: "Review · Publish", body: "The final pass — reviewing a manuscript and sending it out." },
  },
  learn: {
    ko: { title: "배우기", body: "강좌와 레퍼런스를 곁에 두는 학습의 분위기를 그린 클립입니다." },
    en: { title: "Learn", body: "The mood of learning with lessons and references at hand." },
  },
  collab: {
    ko: { title: "협업", body: "여러 창작자가 같은 작업물을 오가는 협업의 공기를 그린 클립입니다." },
    en: { title: "Collaboration", body: "Creators passing the same work back and forth." },
  },
  community: {
    ko: { title: "커뮤니티", body: "작품을 나누고 반응이 오가는 커뮤니티의 공기를 그린 클립입니다." },
    en: { title: "Community", body: "Works being shared and reactions coming back." },
  },
  production: {
    ko: { title: "제작 관리", body: "일정과 공정이 흐르는 제작 관리 보드의 분위기를 그린 클립입니다." },
    en: { title: "Production", body: "A production board with schedules and stages in flow." },
  },
} as const;

const toolItem = (
  toolId: keyof typeof toolCopy,
  clip: { readonly src: string; readonly width: number; readonly height: number },
  usage: { readonly ko: string; readonly en: string },
): PromoVideoItem => ({
  id: `tool-${toolId}`,
  categoryId: "tools",
  src: clip.src,
  width: clip.width,
  height: clip.height,
  durationLabel: "0:14",
  ko: toolCopy[toolId].ko,
  en: toolCopy[toolId].en,
  usage,
});

const SOCIAL_VERTICAL_USAGE = {
  ko: "자료실 보관 · 소셜 카드용 세로 버전",
  en: "Library only · Vertical version for social cards",
} as const;

const toolVerticalItem = (clip: (typeof TOOL_CLIPS_VERTICAL)[number]): PromoVideoItem => ({
  id: `tool-${clip.toolId}-vertical`,
  categoryId: "tools",
  src: clip.src,
  width: clip.width,
  height: clip.height,
  durationLabel: "0:14",
  ko: {
    title: `${toolCopy[clip.toolId].ko.title} · 세로`,
    body: "같은 주제를 세로(9:16)로 다시 그린 소셜 카드용 변형입니다.",
  },
  en: {
    title: `${toolCopy[clip.toolId].en.title} · Vertical`,
    body: "The same subject redrawn vertically (9:16) as a social-card variant.",
  },
  usage: SOCIAL_VERTICAL_USAGE,
});

const tools: readonly PromoVideoItem[] = [
  ...TOOL_SURFACE_CLIPS.map((clip) =>
    toolItem(clip.toolId, clip, {
      ko: "제작 허브 랜딩 · 히어로 배경",
      en: "Production hub landing · Hero backdrop",
    }),
  ),
  ...FEATURE_OVERVIEW_CATEGORY_CLIPS.map((clip) =>
    toolItem(clip.toolId, clip, FEATURE_BAND_USAGE),
  ),
  // 아래 3편의 src는 public/workflow-stages.ts의 WORKFLOW_STAGE_CLIPS가 정본이다.
  toolItem(
    "comic",
    { src: "/brand/tool-clips/tool-comic.mp4", width: 1344, height: 768 },
    WORKFLOW_STAGE_USAGE,
  ),
  toolItem(
    "shaper",
    { src: "/brand/tool-clips/tool-shaper.mp4", width: 1344, height: 768 },
    WORKFLOW_STAGE_USAGE,
  ),
  toolItem(
    "publish",
    { src: "/brand/tool-clips/tool-publish.mp4", width: 1344, height: 768 },
    WORKFLOW_STAGE_USAGE,
  ),
  ...TOOL_CLIPS_STAGED.map((clip) => toolItem(clip.toolId, clip, LIBRARY_ONLY)),
  ...TOOL_CLIPS_VERTICAL.map(toolVerticalItem),
];

const pageItem = (
  id: string,
  file: string,
  durationLabel: string,
  ko: { readonly title: string; readonly body: string },
  en: { readonly title: string; readonly body: string },
  note?: { readonly ko: string; readonly en: string },
  usage: { readonly ko: string; readonly en: string } = LIBRARY_ONLY,
): PromoVideoItem => ({
  id: `page-${id}`,
  categoryId: "pages",
  src: `/brand/page-clips/${file}`,
  width: 1344,
  height: 768,
  durationLabel,
  ko,
  en,
  usage,
  ...(note ? { note } : {}),
});

const pages: readonly PromoVideoItem[] = [
  pageItem(
    "about",
    "page-about.mp4",
    "0:14",
    { title: "서비스 소개 무드", body: "서비스를 소개하는 자리에 깔기 위해 만든 분위기 클립입니다." },
    { title: "About mood", body: "A mood clip made to sit behind the service introduction." },
  ),
  pageItem(
    "pricing",
    "page-pricing.mp4",
    "0:14",
    { title: "요금 안내 무드", body: "요금과 멤버십을 안내하는 자리에 깔기 위해 만든 분위기 클립입니다." },
    { title: "Pricing mood", body: "A mood clip made to sit behind pricing and membership." },
  ),
  pageItem(
    "workflow",
    "page-workflow.mp4",
    "0:14",
    { title: "제작 과정 무드", body: "제작 과정이 흘러가는 자리에 깔기 위해 만든 분위기 클립입니다." },
    { title: "Workflow mood", body: "A mood clip made to sit behind the production workflow." },
  ),
  pageItem(
    "ir",
    "page-ir.mp4",
    "0:15",
    { title: "IR 무드", body: "투자 소개 자리의 배경으로 쓰기 위해 만든 분위기 클립입니다." },
    { title: "IR mood", body: "A mood clip made as a backdrop for the investor brief." },
  ),
  pageItem(
    "start",
    "page-start.mp4",
    "0:14",
    { title: "시작하기 무드", body: "처음 시작하는 창작자를 맞는 자리에 깔기 위해 만든 분위기 클립입니다." },
    { title: "Getting-started mood", body: "A mood clip made to welcome creators who are just starting." },
  ),
  pageItem(
    "home-v2",
    "page-home-v2.mp4",
    "0:14",
    {
      title: "홈 무드",
      body: "창작 홈의 배경으로 쓰기 위해 만든 분위기 클립입니다. 달력 글자가 또렷하던 앞선 버전을 교체한 정본입니다.",
    },
    {
      title: "Home mood",
      body: "A mood clip made as a backdrop for the creator home — the canonical version, replacing the earlier take whose calendar text was too legible.",
    },
  ),
  pageItem(
    "home",
    "page-home.mp4",
    "0:14",
    { title: "홈 무드 · 이전 버전", body: "창작 홈 배경용으로 먼저 만들었던 버전입니다." },
    { title: "Home mood · Earlier version", body: "The first take made as a backdrop for the creator home." },
    {
      ko: "품질 메모: 달력 숫자와 'EPISODE' 글자가 또렷하게 보여, 위의 교체본(v2)으로 대체했습니다. 비교용으로만 남깁니다.",
      en: "Quality note: the calendar numbers and the word 'EPISODE' are clearly visible, so the v2 above supersedes this one. Kept for comparison only.",
    },
    { ko: "자료실 보관 · 대체됨", en: "Library only · Superseded" },
  ),
  pageItem(
    "help",
    "page-help.mp4",
    "0:14",
    { title: "도움말 무드", body: "도움말과 안내 자리에 깔기 위해 만든 분위기 클립입니다." },
    { title: "Help mood", body: "A mood clip made to sit behind help and guidance." },
  ),
  pageItem(
    "tour-stinger",
    "page-tour-stinger.mp4",
    "0:14",
    { title: "투어 스팅어", body: "짧게 분위기를 열고 닫는 스팅어 용도로 만든 클립입니다." },
    { title: "Tour stinger", body: "A short stinger clip for opening and closing on a mood." },
  ),
  pageItem(
    "season-autumn",
    "season-autumn.mp4",
    "0:14",
    {
      title: "계절 · 가을 스튜디오",
      body: "가을빛이 드는 작업실을 그린 계절 변형입니다. 이벤트·시즌 배너를 교체할 때 쓰는 소재로 보관합니다.",
    },
    {
      title: "Season · Autumn studio",
      body: "An autumn-lit studio — a seasonal variant kept for swapping event and season banners.",
    },
  ),
  pageItem(
    "season-winter",
    "season-winter.mp4",
    "0:14",
    {
      title: "계절 · 겨울 스튜디오",
      body: "눈 오는 창밖과 따뜻한 실내를 그린 계절 변형입니다. 이벤트·시즌 배너를 교체할 때 쓰는 소재로 보관합니다.",
    },
    {
      title: "Season · Winter studio",
      body: "Snow outside the window and warmth inside — a seasonal variant kept for swapping event and season banners.",
    },
  ),
];

export const PROMO_VIDEO_ITEMS: readonly PromoVideoItem[] = [
  ...shorts,
  ...tour,
  ...chapterLoops,
  ...brand,
  ...tools,
  ...pages,
];

export function promoVideosByCategory(
  categoryId: PromoVideoCategoryId,
): readonly PromoVideoItem[] {
  return PROMO_VIDEO_ITEMS.filter((item) => item.categoryId === categoryId);
}
