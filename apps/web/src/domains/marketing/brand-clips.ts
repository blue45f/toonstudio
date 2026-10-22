/**
 * 브랜드 필름·기능 요약 페이지에 까는 분위기 클립.
 * 전부 생성형 AI로 만든 배경 영상이라 실제 제품 화면 캡처가 아니다.
 * 화면에서도 그 성격을 밝힌다(배경 위 배지와 섹션 안내 문구).
 *
 * 나머지 2편도 히어로·챕터 카드가 아닌 밴드·카드 배경으로 재배선했다:
 * - home-hero-day(밝은 낮 스튜디오 파노라마): 랜딩 히어로는 전용 아트와
 *   인터랙티브 스튜디오 프리뷰가 이미 한 구성을 이뤄 히어로 배경으로는
 *   겹치지만, /about/studio 마무리 섹션은 텍스트만 있는 밴드라 그 배경으로
 *   배선했다(STUDIO_INTRO_CLOSING_CLIP).
 * - brand-4-cafe-street-flythrough(3D 카페 거리 비행): 투어 3D 챕터 카드에는
 *   챕터 배경 루프가 이미 깔려 있어 중복을 피하고, 홈 핵심 작업실 그리드의
 *   3D 카드 배경으로 배선했다(HOME_CORE_STUDIO_3D_BACKDROP_CLIP).
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

/**
 * /about/studio 마무리 밴드의 배경 — 밝은 낮의 스튜디오 파노라마를 그린
 * 생성형 AI 영상이다. 성격은 밴드 안의 배지로 밝힌다.
 */
export const STUDIO_INTRO_CLOSING_CLIP: BrandClip = {
  src: "/brand/brand-clips/home-hero-day.mp4",
  width: 1344,
  height: 768,
};

/**
 * 홈 핵심 작업실 그리드에서 3D 카드의 배경 — 3D 카페 거리를 비행하는
 * 생성형 AI 영상이다. 카드 이미지(콘셉트 아트)와는 별개의 장식 배경이며,
 * 성격은 그리드 아래 안내 문구로 밝힌다. studioId는 reference-home-content의
 * HomeCoreStudioId와 맞춘다.
 */
export const HOME_CORE_STUDIO_3D_BACKDROP_CLIP = {
  studioId: "three-d",
  src: "/brand/brand-clips/brand-4-cafe-street-flythrough.mp4",
  width: 1344,
  height: 768,
} as const;
