/**
 * 홍보 영상 자료실(/promo-library)의 통합 레지스트리 — 지금까지 만든 홍보
 * 영상 194편을 카테고리별로 모아, 나중에 쇼츠·마케팅 소재로 꺼내 쓸 수 있게
 * 한곳에서 관리한다.
 *
 * 전부 생성형 AI로 만든 개념 영상이라 실제 제품 화면 캡처가 아니다.
 * 자료실 페이지 상단에서도 그 성격을 밝힌다.
 *
 * src·규격·배선처의 정본은 기존 레지스트리고, 이 파일은 그 매핑을 참조해
 * 자료실 표시용 제목·설명·활용 상태만 덧붙인다:
 * - 쇼츠 46편: 투어 쇼츠 섹션의 45편은 product-tour-shorts.ts
 *   (PRODUCT_TOUR_SHORTS)를 참조하고, 자료실에만 보관하는 반응 쇼츠 1편은
 *   품질 메모와 함께 이 파일에 직접 적는다.
 * - 투어 도입·마무리·전환 13편: product-tour-clips.ts (전환 가로본 3편의 세로
 *   변형 7편과 마무리 배경의 세로 변형 1편은 같은 파일이 자료실 항목 모양으로 함께 정본을 맡는다)
 * - 챕터 배경 루프 18편: 가로본 9편은 product-tour-clips.ts + 챕터 이름은
 *   product-tour-content.ts의 PRODUCT_TOUR.chapters이고, 세로 변형
 *   9편(가로 9챕터와 1:1)은 이 파일이 첫 레지스트리다
 *   (public/brand/promo-chapter-loops/).
 * - 브랜드 클립 47편: brand-clips.ts (배선 8편 + 자료실 보관 39편 — 밤 버전·비 오는
 *   날·주말 아침·책상 클로즈업·밤 히어로·노을 히어로·창가의 고양이·정사각 스팅·와이드
 *   팬·비 히어로·눈 히어로·황금빛 노을·정사각 궤도 스팅·별빛·새벽 히어로·정사각 프리즘
 *   스팅·도서관·바다·안개 히어로·정사각 꽃 스팅·네온 골목·종이 모형 마을·황혼 히어로·정사각 잉크 스팅·숲빛·새벽 도시·봄 히어로·정사각 파도 스팅·산과 호수·작업 공방·정사각 벌집 스팅·강가의 바위·눈 덮인 들판·항구 히어로·정사각 테라조 스팅·가을 길·모래 언덕·초원 히어로·정사각 용암 스팅)
 * - 도구 클립 36편: tool-clips.ts의 가로본 12편(제작 허브 1편 + 기능 요약 카테고리
 *   7편 + 보류 1편)과 세로 변형 12편(TOOL_CLIPS_VERTICAL, 가로본과 1:1 대응), 그리고 제작
 *   과정 단계 패널로 재배선한 3편(comic·shaper·publish — src·단계 매핑의 정본은
 *   public/workflow-stages.ts의 WORKFLOW_STAGE_CLIPS라 여기서는 그 값을 옮겨 적고
 *   출처를 밝힌다), 정사각 변형 12편(TOOL_CLIPS_SQUARE, 가로본 12편과 1:1)
 * - 페이지 클립 34편: promo-video-library-pages.ts가 레지스트리다
 *   (public/brand/page-clips/). 이 파일이 800줄 상한에 닿아 분리했고, 브랜드 보관 항목의 17~22차 파도분 22편도 promo-video-library-brand.ts로 분리했다.
 */
import {
  BRAND_CAT_CLIP,
  BRAND_DESK_CLOSEUP_CLIP,
  BRAND_FILM_CLOSING_CLIP,
  BRAND_FILM_SCENE_CLIPS,
  BRAND_GOLDEN_HOUR_CLIP,
  BRAND_LIBRARY_CLIP,
  BRAND_NIGHT_STUDIO_CLIP,
  BRAND_RAINY_STUDIO_CLIP,
  BRAND_SQUARE_ORBIT_CLIP,
  BRAND_SQUARE_PRISM_CLIP,
  BRAND_SQUARE_STING_CLIP,
  BRAND_STARLIGHT_CLIP,
  BRAND_WEEKEND_MORNING_CLIP,
  BRAND_WIDE_PAN_CLIP,
  FEATURES_AMBIENT_CLIP,
  HOME_CORE_STUDIO_3D_BACKDROP_CLIP,
  HOME_HERO_DAWN_CLIP,
  HOME_HERO_EVENING_CLIP,
  HOME_HERO_NIGHT_CLIP,
  HOME_HERO_RAIN_CLIP,
  HOME_HERO_SNOW_CLIP,
  STUDIO_INTRO_CLOSING_CLIP,
  type BrandClip,
} from "./brand-clips";
import {
  PRODUCT_TOUR_INTRO_CLIP,
  PRODUCT_TOUR_OUTRO_CLIP,
  PRODUCT_TOUR_OUTRO_VERTICAL_ITEM,
  PRODUCT_TOUR_TRANSITION_BG3D_CLIP,
  PRODUCT_TOUR_TRANSITION_DRAWING_CLIP,
  PRODUCT_TOUR_TRANSITION_SERIAL_CLIP,
  PRODUCT_TOUR_TRANSITION_VERTICAL_ITEMS,
  productTourChapterLoop,
  type ProductTourChapterLoopId,
} from "./product-tour-clips";
import { PRODUCT_TOUR } from "./product-tour-content";
import { PRODUCT_TOUR_SHORTS } from "./product-tour-shorts";
import { PROMO_VIDEO_PAGE_ITEMS } from "./promo-video-library-pages";
import { PROMO_VIDEO_BRAND_LIBRARY_ITEMS } from "./promo-video-library-brand";
import {
  FEATURE_OVERVIEW_CATEGORY_CLIPS,
  TOOL_CLIPS_SQUARE,
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
      body: "소셜과 짧은 홍보에 바로 쓰는 세로(9:16) 쇼츠입니다. 마흔다섯 편은 제품 투어 페이지의 쇼츠 섹션에도 걸려 있고, 한 편은 품질 메모와 함께 자료실에만 보관합니다.",
    },
    en: {
      title: "Vertical shorts",
      body: "Vertical (9:16) shorts ready for social and quick promos. Forty-five also run in the shorts section of the product tour page, and one is kept in the library only with a quality note.",
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
      body: "제품 투어 챕터 카드마다 은은하게 깔리는 챕터별 분위기 루프입니다. 가로 아홉 편은 챕터 카드 배경으로 걸려 있고, 세로 아홉 편은 가로본과 1:1로 맞춘 변형으로 함께 보관합니다.",
    },
    en: {
      title: "Chapter backdrop loops",
      body: "One ambient loop per product tour chapter, laid softly behind each chapter card. The nine horizontal loops back the chapter cards, and nine vertical variants matched to them one-to-one are kept alongside.",
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

/**
 * 펜촉·잉크 클로즈업 쇼츠(shorts-ink-closeup)의 품질 메모 — 제작 과정에서 보고된
 * 사항을 자료실 항목에만 정직하게 단다. 쇼츠 섹션에서는 메모 없이 그대로 배선한다.
 */
const INK_CLOSEUP_NOTE = {
  ko: "품질 메모: 펜촉의 금속 장식 부분에 작은 각인 같은 형태가 보일 수 있습니다. 읽을 수 있는 글자는 아니어서 그대로 수록합니다.",
  en: "Quality note: the pen nib's metal ornament may show small engraving-like marks. They are not readable letters, so the clip is kept as is.",
} as const;

const shorts: readonly PromoVideoItem[] = [
  ...PRODUCT_TOUR_SHORTS.map((short) => ({
    id: `shorts-${short.id}`,
    categoryId: "shorts" as const,
    src: short.src,
    width: short.width,
    height: short.height,
    durationLabel: short.durationLabel,
    ko: short.ko,
    en: short.en,
    usage: SHORTS_USAGE,
    ...(short.id === "ink-closeup" ? { note: INK_CLOSEUP_NOTE } : {}),
  })),
  {
    // 말풍선에 깨진 글자 형태가 섞인 품질 이슈가 있어 쇼츠 섹션에는 걸지 않고
    // 자료실에만 보관한다 (홈 무드 v1의 결함 메모 방식과 동일).
    id: "shorts-reactions",
    categoryId: "shorts",
    src: "/brand/promo-shorts/shorts-18-reactions.mp4",
    width: 768,
    height: 1344,
    durationLabel: "0:14",
    ko: {
      title: "반응이 쏟아지는 순간",
      body: "새 회차가 오르자 하트와 댓글 반응이 쏟아지는 장면을 그린 클립입니다.",
    },
    en: {
      title: "Reactions pouring in",
      body: "Hearts and comment reactions pouring in the moment a new episode drops.",
    },
    usage: { ko: "자료실 보관 · 품질 메모(말풍선 유사 글자)", en: "Library only · Quality note (letter-like shapes in balloons)" },
    note: {
      ko: "품질 메모: 말풍선에 읽을 수 없는 깨진 글자 형태가 일부 섞여 있어, 쇼츠 섹션에는 걸지 않고 자료실에만 보관합니다.",
      en: "Quality note: some speech balloons hold garbled, unreadable letter-like shapes, so this clip stays in the library and out of the shorts section.",
    },
  },
];

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
  // 전환 세로 변형 3편과 마무리 세로 변형 1편 — 항목 정본은 product-tour-clips.ts다.
  ...PRODUCT_TOUR_TRANSITION_VERTICAL_ITEMS,
  PRODUCT_TOUR_OUTRO_VERTICAL_ITEM,
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

/** 챕터 루프 세로 변형 — 가로본의 세로 짝이다. 제목만 챕터마다 다르고 본문 틀은 같다. */
const chapterVerticalLoop = (
  chapterId: string,
  ko: { readonly title: string; readonly chapter: string },
  en: { readonly title: string; readonly chapter: string },
): PromoVideoItem => ({
  id: `chapter-loop-${chapterId}-vertical`,
  categoryId: "chapter-loops",
  src: `/brand/promo-chapter-loops/chapter-${chapterId}-vertical.mp4`,
  width: 768,
  height: 1344,
  durationLabel: "0:14",
  ko: {
    title: `${ko.title} · 배경 루프 세로`,
    body: `${ko.chapter} 챕터의 가로 배경 루프를 세로(9:16)로 다시 그린 변형입니다. 세로 표면용 소재로 보관합니다.`,
  },
  en: {
    title: `${en.title} · Backdrop loop, vertical`,
    body: `The ${en.chapter} chapter's horizontal backdrop loop redrawn vertically (9:16), kept as material for vertical surfaces.`,
  },
  usage: LIBRARY_ONLY,
});

const chapterLoops: readonly PromoVideoItem[] = [
  ...CHAPTER_LOOP_IDS.flatMap((chapterId) => {
    const loop = productTourChapterLoop(chapterId);
    const chapter = PRODUCT_TOUR.chapters.find((entry) => entry.id === chapterId);
    if (!loop || !chapter) return [];
    return [
      {
        id: `chapter-loop-${chapterId}`,
        categoryId: "chapter-loops" as const,
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
  }),
  // 챕터 루프 세로 변형 9편 — 가로 9챕터와 1:1로 맞춘 세로 짝이다.
  chapterVerticalLoop("plan", { title: "아이디어와 기획", chapter: "기획" }, { title: "Ideas and planning", chapter: "planning" }),
  chapterVerticalLoop("draw", { title: "드로잉과 브러시", chapter: "작화" }, { title: "Drawing and brushes", chapter: "drawing" }),
  chapterVerticalLoop("comic", { title: "컷과 말풍선", chapter: "컷과 말풍선" }, { title: "Panels and dialogue", chapter: "panels-and-dialogue" }),
  chapterVerticalLoop("three-d", { title: "캐릭터·포즈·3D 장면", chapter: "3D" }, { title: "Characters, posing and 3D", chapter: "3D" }),
  chapterVerticalLoop("space", { title: "가상 스튜디오", chapter: "가상 스튜디오" }, { title: "Virtual studio", chapter: "virtual studio" }),
  chapterVerticalLoop("assist", { title: "AI 보조와 반복 작업", chapter: "AI 보조" }, { title: "AI assistance and repetition", chapter: "AI assistance" }),
  chapterVerticalLoop("production", { title: "프로젝트·협업·검토", chapter: "제작" }, { title: "Projects, collaboration and review", chapter: "production" }),
  chapterVerticalLoop("learn", { title: "학습·소재·사운드", chapter: "학습" }, { title: "Learning, assets and sound", chapter: "learning" }),
  chapterVerticalLoop("finish", { title: "검사·내보내기·게시", chapter: "게시" }, { title: "Validate, export and publish", chapter: "publishing" }),
];

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

/** 자료실에만 보관하는 브랜드 클립 — 배선 항목과 같은 모양을 짧게 적기 위한 헬퍼. */
const brandLibraryItem = (
  id: string,
  clip: BrandClip,
  ko: { readonly title: string; readonly body: string },
  en: { readonly title: string; readonly body: string },
): PromoVideoItem => ({
  id,
  categoryId: "brand",
  src: clip.src,
  width: clip.width,
  height: clip.height,
  durationLabel: "0:14",
  ko,
  en,
  usage: LIBRARY_ONLY,
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
  brandLibraryItem("brand-night-studio", BRAND_NIGHT_STUDIO_CLIP, {
    title: "밤의 스튜디오",
    body: "도시 불빛과 램프 아래 밤의 작업실을 그린 클립입니다. 낮 파노라마의 짝으로 만들었습니다.",
  }, {
    title: "Night studio",
    body: "A night studio under city lights and a desk lamp — the counterpart to the daytime panorama.",
  }),
  brandLibraryItem("brand-rainy-studio", BRAND_RAINY_STUDIO_CLIP, {
    title: "비 오는 날의 스튜디오",
    body: "빗소리가 창을 두드리는 날의 작업실을 그린 클립입니다.",
  }, {
    title: "Rainy-day studio",
    body: "A studio on a day when rain taps at the window.",
  }),
  brandLibraryItem("brand-weekend-morning", BRAND_WEEKEND_MORNING_CLIP, {
    title: "주말 아침의 스튜디오",
    body: "느긋한 주말 아침 빛이 드는 작업실을 그린 클립입니다.",
  }, {
    title: "Weekend-morning studio",
    body: "A studio in slow weekend-morning light.",
  }),
  brandLibraryItem("brand-desk-closeup", BRAND_DESK_CLOSEUP_CLIP, {
    title: "책상 클로즈업",
    body: "펜과 태블릿, 원고가 놓인 책상을 가까이에서 담은 클립입니다.",
  }, {
    title: "Desk close-up",
    body: "A close look at a desk with a pen, a tablet and manuscript pages.",
  }),
  brandLibraryItem("brand-home-hero-night", HOME_HERO_NIGHT_CLIP, {
    title: "밤의 파노라마",
    body: "낮 파노라마의 밤 버전으로 그린 스튜디오 파노라마입니다. 히어로 자리의 분위기 교체 소재로 보관합니다.",
  }, {
    title: "Night panorama",
    body: "A studio panorama drawn as the night version of the daytime one — kept as a hero-mood swap.",
  }),
  brandLibraryItem("brand-home-hero-evening", HOME_HERO_EVENING_CLIP, {
    title: "노을의 파노라마",
    body: "노을빛이 드는 스튜디오 파노라마입니다. 낮·밤 파노라마와 한 세트로 보관합니다.",
  }, {
    title: "Evening panorama",
    body: "A studio panorama in evening glow, kept as a set with the day and night panoramas.",
  }),
  brandLibraryItem("brand-window-cat", BRAND_CAT_CLIP, {
    title: "창가의 고양이",
    body: "창가에 앉아 작업실을 내려다보는 고양이를 그린 클립입니다.",
  }, {
    title: "A cat by the window",
    body: "A cat sitting by the window, watching over the studio below.",
  }),
  brandLibraryItem("brand-square-sting", BRAND_SQUARE_STING_CLIP, {
    title: "정사각 브랜드 스팅",
    body: "짧은 소셜 포스트와 카드에 붙이는 1:1 정사각 브랜드 스팅입니다.",
  }, {
    title: "Square brand sting",
    body: "A 1:1 square brand sting for short social posts and cards.",
  }),
  brandLibraryItem("brand-wide-pan", BRAND_WIDE_PAN_CLIP, {
    title: "넓게 도는 스튜디오 팬",
    body: "작업실을 넓게 가로지르며 도는 파노라마 팬 장면을 그린 클립입니다.",
  }, {
    title: "A wide studio pan",
    body: "A panoramic pan sweeping wide across the studio.",
  }),
  brandLibraryItem("brand-home-hero-rain", HOME_HERO_RAIN_CLIP, {
    title: "비의 파노라마",
    body: "비 내리는 창 너머의 스튜디오 파노라마입니다. 낮·노을·밤 파노라마와 한 세트로 보관합니다.",
  }, {
    title: "Rain panorama",
    body: "A studio panorama beyond a rain-streaked window, kept as a set with the day, evening and night panoramas.",
  }),
  brandLibraryItem("brand-home-hero-snow", HOME_HERO_SNOW_CLIP, {
    title: "눈의 파노라마",
    body: "눈 내리는 창 너머의 스튜디오 파노라마입니다. 낮·노을·밤·비 파노라마와 한 세트로 보관합니다.",
  }, {
    title: "Snow panorama",
    body: "A studio panorama beyond a snow-falling window, kept as a set with the day, evening, night and rain panoramas.",
  }),
  brandLibraryItem("brand-golden-hour", BRAND_GOLDEN_HOUR_CLIP, {
    title: "황금빛 노을의 스튜디오",
    body: "노을이 황금빛으로 번지는 시간의 작업실을 그린 클립입니다.",
  }, {
    title: "Golden-hour studio",
    body: "A studio in the hour when the evening glow turns golden.",
  }),
  brandLibraryItem("brand-square-orbit", BRAND_SQUARE_ORBIT_CLIP, {
    title: "정사각 궤도 스팅",
    body: "빛의 궤도가 감도는 1:1 정사각 브랜드 스팅입니다. 정사각 스팅의 짝으로 보관합니다.",
  }, {
    title: "Square orbit sting",
    body: "A 1:1 square brand sting with orbits of light winding through it — kept as the square sting's counterpart.",
  }),
  brandLibraryItem("brand-starlight", BRAND_STARLIGHT_CLIP, {
    title: "별빛 아래의 스튜디오",
    body: "별이 빛나는 밤하늘 아래 작업실을 그린 클립입니다.",
  }, {
    title: "Studio under starlight",
    body: "A studio under a night sky full of starlight.",
  }),
  brandLibraryItem("brand-home-hero-dawn", HOME_HERO_DAWN_CLIP, {
    title: "새벽의 파노라마",
    body: "새벽빛이 드는 스튜디오 파노라마입니다. 낮·노을·밤·비·눈 파노라마와 한 세트로 보관합니다.",
  }, {
    title: "Dawn panorama",
    body: "A studio panorama in dawn light, kept as a set with the day, evening, night, rain and snow panoramas.",
  }),
  brandLibraryItem("brand-square-prism", BRAND_SQUARE_PRISM_CLIP, {
    title: "정사각 프리즘 스팅",
    body: "프리즘을 지난 빛이 색으로 갈라지는 1:1 정사각 브랜드 스팅입니다. 정사각 스팅 세트와 함께 보관합니다.",
  }, {
    title: "Square prism sting",
    body: "A 1:1 square brand sting of light splitting into colors through a prism — kept with the square sting set.",
  }),
  brandLibraryItem("brand-library", BRAND_LIBRARY_CLIP, {
    title: "책장 높은 도서관",
    body: "높은 책장과 사다리가 있는 도서관의 고요한 공기를 그린 클립입니다.",
  }, {
    title: "The tall-shelved library",
    body: "The quiet air of a library with tall shelves and a ladder.",
  }),
  ...PROMO_VIDEO_BRAND_LIBRARY_ITEMS,
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

const SQUARE_USAGE = {
  ko: "자료실 보관 · 소셜 피드용 정사각 버전",
  en: "Library only · Square version for social feeds",
} as const;

const toolSquareItem = (clip: (typeof TOOL_CLIPS_SQUARE)[number]): PromoVideoItem => ({
  id: `tool-${clip.toolId}-square`,
  categoryId: "tools",
  src: clip.src,
  width: clip.width,
  height: clip.height,
  durationLabel: "0:14",
  ko: {
    title: `${toolCopy[clip.toolId].ko.title} · 정사각`,
    body: "같은 주제를 정사각(1:1)으로 다시 그린 소셜 피드용 변형입니다.",
  },
  en: {
    title: `${toolCopy[clip.toolId].en.title} · Square`,
    body: "The same subject redrawn as a square (1:1) variant for social feeds.",
  },
  usage: SQUARE_USAGE,
});

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
  ...TOOL_CLIPS_SQUARE.map(toolSquareItem),
];

export const PROMO_VIDEO_ITEMS: readonly PromoVideoItem[] = [
  ...shorts,
  ...tour,
  ...chapterLoops,
  ...brand,
  ...tools,
  ...PROMO_VIDEO_PAGE_ITEMS,
];

export function promoVideosByCategory(
  categoryId: PromoVideoCategoryId,
): readonly PromoVideoItem[] {
  return PROMO_VIDEO_ITEMS.filter((item) => item.categoryId === categoryId);
}
