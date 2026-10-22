/**
 * 제품 투어 페이지의 도입·마무리 배경 클립과 챕터 전환용 스테이징 클립.
 * 전부 생성형 AI로 만든 배경 영상이라 실제 제품 화면 캡처가 아니다.
 * 화면에서도 그 성격을 밝힌다(배경 위 배지와 마무리 섹션 안내 문구).
 *
 * 전환 클립 3편은 자산만 반입했다. 투어 플레이어(ProductTourPlayer)는 단일 MP4
 * 한 편의 시간 오프셋으로 챕터를 오가는 구조(챕터 시작점으로 seek)라, 챕터
 * 사이에 별도 클립을 끼워 넣을 이음매가 없다. 플레이어를 구간 재생 구조로
 * 바꾸는 별도 결정이 있기 전까지 삽입을 보류한다.
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

/** 챕터 전환 삽입 보류 중 — 자산만 반입한 스테이징 클립(파일 상단 주석 참고). */
export const PRODUCT_TOUR_TRANSITION_CLIPS = [
  { id: "drawing", src: "/brand/product-tour/tour-transition-1-drawing.mp4", width: 1344, height: 768 },
  { id: "bg3d", src: "/brand/product-tour/tour-transition-2-bg3d.mp4", width: 1344, height: 768 },
  { id: "serial", src: "/brand/product-tour/tour-transition-3-serial.mp4", width: 1344, height: 768 },
] as const;
