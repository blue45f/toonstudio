/**
 * 제품 투어 페이지의 도입·마무리 배경 클립, 챕터 카드 배경 루프와
 * 챕터 전환용 스테이징 클립.
 * 전부 생성형 AI로 만든 배경 영상이라 실제 제품 화면 캡처가 아니다.
 * 화면에서도 그 성격을 밝힌다(배경 위 배지와 섹션 안내 문구).
 *
 * 전환 클립 3편은 투어 플레이어에 끼워 넣지는 못했다. 플레이어
 * (ProductTourPlayer)는 단일 MP4 한 편의 시간 오프셋으로 챕터를 오가는
 * 구조(챕터 시작점으로 seek)라, 챕터 사이에 별도 클립을 끼울 이음매가 없다.
 * 대신 주제가 맞는 소개 표면의 배경으로 재배선했다: drawing은
 * /about/workflow 작화 단계 패널 배경(단계 매핑은
 * domains/marketing/public/workflow-stages.ts가 소유한다), serial은 투어
 * 페이지 '새로 더해진 기능' 카드(제작 관리 보드)의 배경, bg3d는
 * /about/studio 제작 흐름의 '2D·3D 제작' 단계 카드 배경이다.
 */
export interface ProductTourAmbientClip {
  readonly id: "intro" | "outro";
  readonly src: string;
  readonly width: number;
  readonly height: number;
  readonly ko: { readonly eyebrow: string; readonly title: string; readonly body: string };
  readonly en: { readonly eyebrow: string; readonly title: string; readonly body: string };
}

export const PRODUCT_TOUR_INTRO_CLIP = {
  src: "/brand/product-tour/tour-intro.mp4",
  width: 1344,
  height: 768,
} as const;

export const PRODUCT_TOUR_OUTRO_CLIP: ProductTourAmbientClip = {
  id: "outro",
  src: "/brand/product-tour/tour-outro.mp4",
  width: 1344,
  height: 768,
  ko: {
    eyebrow: "마무리 배경",
    title: "오늘 본 장면, 내일 내 작업실에서",
    body: "램프 불빛 아래 작업실을 그린 생성형 AI 배경 영상으로 투어를 닫습니다. 실제 제품 화면이 아니라 분위기를 전하는 개념 영상입니다.",
  },
  en: {
    eyebrow: "Closing backdrop",
    title: "Seen today, in your studio tomorrow",
    body: "The tour closes on an AI-generated backdrop of a studio under lamplight — a concept clip that sets the mood, not an actual product screen.",
  },
};

/** 챕터 배경 루프가 있는 챕터 id. overview는 도입 클립이 깔린 히어로가 이미 있어 제외한다. */
export type ProductTourChapterLoopId =
  | "plan"
  | "draw"
  | "comic"
  | "three-d"
  | "space"
  | "assist"
  | "production"
  | "learn"
  | "finish";

export interface ProductTourChapterLoop {
  readonly chapterId: ProductTourChapterLoopId;
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

/**
 * 챕터 카드 배경 루프 9편 — 챕터 분위기를 그린 생성형 AI 영상이라 실제 제품
 * 화면이 아니다. 카드 이미지의 표기(실제 캡처·개념 도해)와는 별개의 장식
 * 배경이며, 그 성격은 '챕터별 기능' 탭의 안내 문구로 밝힌다.
 */
export const PRODUCT_TOUR_CHAPTER_LOOPS: readonly ProductTourChapterLoop[] = [
  { chapterId: "plan", src: "/brand/promo-chapter-loops/chapter-plan.mp4", width: 1344, height: 768 },
  { chapterId: "draw", src: "/brand/promo-chapter-loops/chapter-draw.mp4", width: 1344, height: 768 },
  { chapterId: "comic", src: "/brand/promo-chapter-loops/chapter-comic.mp4", width: 1344, height: 768 },
  { chapterId: "three-d", src: "/brand/promo-chapter-loops/chapter-three-d.mp4", width: 1344, height: 768 },
  { chapterId: "space", src: "/brand/promo-chapter-loops/chapter-space.mp4", width: 1344, height: 768 },
  { chapterId: "assist", src: "/brand/promo-chapter-loops/chapter-assist.mp4", width: 1344, height: 768 },
  { chapterId: "production", src: "/brand/promo-chapter-loops/chapter-production.mp4", width: 1344, height: 768 },
  { chapterId: "learn", src: "/brand/promo-chapter-loops/chapter-learn.mp4", width: 1344, height: 768 },
  { chapterId: "finish", src: "/brand/promo-chapter-loops/chapter-finish.mp4", width: 1344, height: 768 },
];

export function productTourChapterLoop(chapterId: string): ProductTourChapterLoop | undefined {
  return PRODUCT_TOUR_CHAPTER_LOOPS.find((loop) => loop.chapterId === chapterId);
}

/**
 * /about/workflow 작화 단계 패널 배경으로 재배선한 전환 클립 — 드로잉 장면을
 * 그린 생성형 AI 영상이다. 단계 매핑 정본은 workflow-stages.ts다.
 */
export const PRODUCT_TOUR_TRANSITION_DRAWING_CLIP = {
  id: "drawing",
  src: "/brand/product-tour/tour-transition-1-drawing.mp4",
  width: 1344,
  height: 768,
} as const;

/**
 * 투어 '새로 더해진 기능' 카드 배경으로 재배선한 전환 클립 — 연재 캘린더에
 * 체크가 채워지는 장면을 그린 생성형 AI 영상이다. 카드 이미지(캡처·개념)와는
 * 별개의 장식 배경이며, 성격은 탭 안내 문구로 밝힌다.
 */
export const PRODUCT_TOUR_TRANSITION_SERIAL_CLIP = {
  id: "serial",
  src: "/brand/product-tour/tour-transition-3-serial.mp4",
  width: 1344,
  height: 768,
} as const;

/**
 * /about/studio 제작 흐름 '2D·3D 제작' 단계 카드 배경으로 재배선한 전환 클립 —
 * 3D 배경 장면을 그린 생성형 AI 영상이다. 성격은 카드 안의 배지로 밝힌다.
 */
export const PRODUCT_TOUR_TRANSITION_BG3D_CLIP = {
  id: "bg3d",
  src: "/brand/product-tour/tour-transition-2-bg3d.mp4",
  width: 1344,
  height: 768,
} as const;
