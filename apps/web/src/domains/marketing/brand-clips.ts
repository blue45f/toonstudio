/**
 * 브랜드 필름·기능 요약 페이지에 까는 분위기 클립.
 * 전부 생성형 AI로 만든 배경 영상이라 실제 제품 화면 캡처가 아니다.
 * 화면에서도 그 성격을 밝힌다(배경 위 배지와 섹션 안내 문구).
 *
 * 자산만 반입하고 삽입을 보류한 클립 2편:
 * - home-hero-day(랜딩 히어로용 밝은 낮 스튜디오 파노라마): 랜딩 히어로는 전용
 *   아트와 인터랙티브 스튜디오 프리뷰가 이미 한 구성을 이루고 있어, 영상 배경을
 *   얹으면 서로 겹친다. 히어로 구성을 다시 설계하는 별도 결정이 있기 전까지
 *   보류한다(전환 클립 3편의 자산 반입 선례와 같은 판단).
 * - brand-4-cafe-street-flythrough(3D 카페 거리 비행): 투어 3D 챕터 카드에는
 *   챕터 배경 루프가 이미 깔려 있고, bg3d 스튜디오 표면은 이 마케팅 변경의
 *   경계 밖에 있다. 자연스러운 자리가 생기면 그때 배선한다.
 */
export interface BrandClip {
  readonly src: string;
  readonly width: number;
  readonly height: number;
}

/** 브랜드 필름 스토리보드의 장면 id. BrandFilmStoryboard의 ChapterId와 맞춘다. */
export type BrandFilmSceneId = "imagine" | "draw" | "create" | "finish";

export interface BrandFilmSceneClip extends BrandClip {
  readonly sceneId: BrandFilmSceneId;
}

/**
 * 브랜드 필름 4장면의 배경 클립 — 장면 분위기를 그린 생성형 AI 영상이라
 * 실제 필름 장면이나 제품 화면이 아니다. 그 성격은 장면 설명 패널의 배지로
 * 밝힌다.
 */
export const BRAND_FILM_SCENE_CLIPS: readonly BrandFilmSceneClip[] = [
  { sceneId: "imagine", src: "/brand/brand-clips/brand-1-dawn-studio.mp4", width: 1344, height: 768 },
  { sceneId: "draw", src: "/brand/brand-clips/brand-2-pen-particles.mp4", width: 1344, height: 768 },
  { sceneId: "create", src: "/brand/brand-clips/brand-3-shared-canvas.mp4", width: 1344, height: 768 },
  { sceneId: "finish", src: "/brand/brand-clips/brand-6-publish-light.mp4", width: 1344, height: 768 },
];

export function brandFilmSceneClip(sceneId: string): BrandFilmSceneClip | undefined {
  return BRAND_FILM_SCENE_CLIPS.find((clip) => clip.sceneId === sceneId);
}

/** 브랜드 필름 페이지 마무리의 배경 — 웹툰 컷이 밤하늘로 번지는 생성형 AI 영상. */
export const BRAND_FILM_CLOSING_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-5-webtoon-sky.mp4",
  width: 1344,
  height: 768,
};

/** 기능 요약 페이지 마무리 CTA의 배경 — 기능 카드 위를 빛 궤적이 흐르는 생성형 AI 영상. */
export const FEATURES_AMBIENT_CLIP: BrandClip = {
  src: "/brand/brand-clips/features-ambient.mp4",
  width: 1344,
  height: 768,
};

/** 삽입 보류 중 — 자산만 반입한 스테이징 클립(파일 상단 주석 참고). */
export const BRAND_CLIPS_STAGED = [
  { id: "home-hero-day", src: "/brand/brand-clips/home-hero-day.mp4", width: 1344, height: 768 },
  { id: "cafe-street-flythrough", src: "/brand/brand-clips/brand-4-cafe-street-flythrough.mp4", width: 1344, height: 768 },
] as const;
