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
 *
 * brand-7-night-studio(밤의 스튜디오)는 낮 파노라마(home-hero-day)의 짝으로
 * 만든 변형이라 아직 표면에 배선하지 않고 홍보 영상 자료실에만 수록한다
 * (BRAND_NIGHT_STUDIO_CLIP).
 *
 * 자료실 보관 전용 변형 6편도 이 파일이 정본이다: 비 오는 날·주말 아침·
 * 책상 클로즈업·창가의 고양이 스튜디오와, 낮 파노라마의 짝인 밤·노을
 * 히어로 무드.
 *
 * 12차 파도에서 자료실 보관 전용 3편을 더했다: 정사각 브랜드 스팅,
 * 스튜디오 와이드 팬, 비 오는 날의 히어로 무드(파노라마 세트의 네 번째).
 *
 * 13차 파도에서 자료실 보관 전용 3편을 더했다: 눈 오는 날의 히어로
 * 무드(파노라마 세트의 다섯 번째), 황금빛 노을의 스튜디오, 정사각
 * 궤도 스팅.
 *
 * 15차 파도에서 자료실 보관 전용 3편을 더했다: 별빛 아래의 스튜디오,
 * 새벽의 히어로 무드(파노라마 세트의 여섯 번째), 정사각 프리즘 스팅.
 *
 * 16차 파도에서 자료실 보관 전용 1편을 더했다: 높은 책장이 있는
 * 도서관 무드.
 *
 * 17차 파도에서 자료실 보관 전용 3편을 더했다: 바다의 스튜디오,
 * 안개의 히어로 무드(파노라마 세트의 일곱 번째), 정사각 꽃 스팅.
 *
 * 18차 파도에서 자료실 보관 전용 4편을 더했다: 네온 빛 골목, 종이
 * 모형 마을, 해 질 녘의 히어로 무드(파노라마 세트의 여덟 번째),
 * 정사각 잉크 스팅. 이 파도부터 클립 길이가 14초로 고정되지 않아
 * 편마다 다르다(8~11초 안팎) — 길이는 자료실 항목에 실측으로 적는다.
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

/**
 * 밤의 스튜디오 — 도시 불빛과 램프 아래 작업실을 그린 생성형 AI 영상이다.
 * 낮 파노라마(STUDIO_INTRO_CLOSING_CLIP)의 짝으로 만들었고, 아직 표면에
 * 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_NIGHT_STUDIO_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-7-night-studio.mp4",
  width: 1344,
  height: 768,
};

/**
 * 비 오는 날의 스튜디오 — 빗소리가 창을 두드리는 날의 작업실을 그린
 * 생성형 AI 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_RAINY_STUDIO_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-8-rainy-studio.mp4",
  width: 1344,
  height: 768,
};

/**
 * 주말 아침의 스튜디오 — 느긋한 주말 아침 빛이 드는 작업실을 그린
 * 생성형 AI 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_WEEKEND_MORNING_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-9-weekend-morning.mp4",
  width: 1344,
  height: 768,
};

/**
 * 책상 클로즈업 — 펜과 태블릿, 원고가 놓인 책상을 가까이에서 담은
 * 생성형 AI 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_DESK_CLOSEUP_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-10-desk-closeup.mp4",
  width: 1344,
  height: 768,
};

/**
 * 밤의 히어로 무드 — 낮 파노라마(STUDIO_INTRO_CLOSING_CLIP)의 밤 버전으로
 * 그린 생성형 AI 영상이다. 히어로 자리의 분위기 교체 소재로, 아직 표면에
 * 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const HOME_HERO_NIGHT_CLIP: BrandClip = {
  src: "/brand/brand-clips/home-hero-night.mp4",
  width: 1344,
  height: 768,
};

/**
 * 노을의 히어로 무드 — 낮·밤 파노라마와 한 세트로, 노을빛이 드는 스튜디오를
 * 그린 생성형 AI 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만
 * 수록한다.
 */
export const HOME_HERO_EVENING_CLIP: BrandClip = {
  src: "/brand/brand-clips/home-hero-evening.mp4",
  width: 1344,
  height: 768,
};

/**
 * 창가의 고양이 — 창가에 앉아 작업실을 내려다보는 고양이를 그린 생성형 AI
 * 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_CAT_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-11-cat.mp4",
  width: 1344,
  height: 768,
};

/**
 * 정사각 브랜드 스팅 — 소셜 포스트와 카드에 붙이는 1:1 정사각 스팅으로
 * 그린 생성형 AI 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만
 * 수록한다.
 */
export const BRAND_SQUARE_STING_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-square-sting.mp4",
  width: 768,
  height: 768,
};

/**
 * 스튜디오 와이드 팬 — 작업실을 넓게 가로지르며 도는 파노라마 팬 장면을
 * 그린 생성형 AI 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만
 * 수록한다.
 */
export const BRAND_WIDE_PAN_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-12-wide-pan.mp4",
  width: 1344,
  height: 768,
};

/**
 * 비의 히어로 무드 — 비 내리는 창 너머의 스튜디오 파노라마를 그린 생성형
 * AI 영상이다. 낮·노을·밤 파노라마와 한 세트로, 아직 표면에 배선하지 않아
 * 홍보 영상 자료실에만 수록한다.
 */
export const HOME_HERO_RAIN_CLIP: BrandClip = {
  src: "/brand/brand-clips/home-hero-rain.mp4",
  width: 1344,
  height: 768,
};

/**
 * 눈의 히어로 무드 — 눈 내리는 창 너머의 스튜디오 파노라마를 그린 생성형
 * AI 영상이다. 낮·노을·밤·비 파노라마와 한 세트로, 아직 표면에 배선하지
 * 않아 홍보 영상 자료실에만 수록한다.
 */
export const HOME_HERO_SNOW_CLIP: BrandClip = {
  src: "/brand/brand-clips/home-hero-snow.mp4",
  width: 1344,
  height: 768,
};

/**
 * 황금빛 노을의 스튜디오 — 노을이 황금빛으로 번지는 시간의 작업실을 그린
 * 생성형 AI 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만
 * 수록한다.
 */
export const BRAND_GOLDEN_HOUR_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-13-golden-hour.mp4",
  width: 1344,
  height: 768,
};

/**
 * 정사각 궤도 스팅 — 빛의 궤도가 감도는 1:1 정사각 브랜드 스팅으로 그린
 * 생성형 AI 영상이다. 정사각 스팅의 짝으로, 아직 표면에 배선하지 않아
 * 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_SQUARE_ORBIT_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-square-orbit.mp4",
  width: 768,
  height: 768,
};

/**
 * 별빛 아래의 스튜디오 — 별이 빛나는 밤하늘 아래 작업실을 그린 생성형 AI
 * 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_STARLIGHT_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-14-starlight.mp4",
  width: 1344,
  height: 768,
};

/**
 * 새벽의 히어로 무드 — 새벽빛이 드는 스튜디오 파노라마를 그린 생성형 AI
 * 영상이다. 낮·노을·밤·비·눈 파노라마와 한 세트로, 아직 표면에 배선하지
 * 않아 홍보 영상 자료실에만 수록한다.
 */
export const HOME_HERO_DAWN_CLIP: BrandClip = {
  src: "/brand/brand-clips/home-hero-dawn.mp4",
  width: 1344,
  height: 768,
};

/**
 * 정사각 프리즘 스팅 — 프리즘을 지난 빛이 색으로 갈라지는 1:1 정사각
 * 브랜드 스팅으로 그린 생성형 AI 영상이다. 정사각 스팅 세트와 함께, 아직
 * 표면에 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_SQUARE_PRISM_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-square-prism.mp4",
  width: 768,
  height: 768,
};

/**
 * 도서관 무드 — 높은 책장과 사다리가 있는 도서관을 그린 생성형 AI
 * 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_LIBRARY_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-15-library.mp4",
  width: 1344,
  height: 768,
};

/**
 * 바다의 스튜디오 — 파도가 닿는 바다 앞 작업실을 그린 생성형 AI
 * 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_OCEAN_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-16-ocean.mp4",
  width: 1344,
  height: 768,
};

/**
 * 안개의 히어로 무드 — 안개 낀 창 너머의 스튜디오 파노라마를 그린 생성형
 * AI 영상이다. 낮·노을·밤·비·눈·새벽 파노라마와 한 세트로, 아직 표면에
 * 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const HOME_HERO_FOG_CLIP: BrandClip = {
  src: "/brand/brand-clips/home-hero-fog.mp4",
  width: 1344,
  height: 768,
};

/**
 * 정사각 꽃 스팅 — 꽃이 피어나는 모습을 담은 1:1 정사각 브랜드 스팅으로
 * 그린 생성형 AI 영상이다. 정사각 스팅 세트와 함께, 아직 표면에 배선하지
 * 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_SQUARE_BLOOM_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-square-bloom.mp4",
  width: 768,
  height: 768,
};

/**
 * 네온 빛 골목 — 네온 빛이 골목에 번지는 밤 풍경을 그린 생성형 AI
 * 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_NEON_ALLEY_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-17-neonalley.mp4",
  width: 1344,
  height: 768,
};

/**
 * 종이 모형 마을 — 종이로 접어 만든 작은 마을 모형을 그린 생성형 AI
 * 영상이다. 아직 표면에 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_PAPER_CRAFT_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-18-papercraft.mp4",
  width: 1344,
  height: 768,
};

/**
 * 해 질 녘의 히어로 무드 — 해가 지는 빛이 드는 스튜디오 파노라마를 그린
 * 생성형 AI 영상이다. 낮·노을·밤·비·눈·새벽·안개 파노라마와 한 세트로,
 * 아직 표면에 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const HOME_HERO_DUSK_CLIP: BrandClip = {
  src: "/brand/brand-clips/home-hero-dusk.mp4",
  width: 1344,
  height: 768,
};

/**
 * 정사각 잉크 스팅 — 물에 잉크 한 방울이 번지는 모습을 담은 1:1 정사각
 * 브랜드 스팅으로 그린 생성형 AI 영상이다. 정사각 스팅 세트와 함께, 아직
 * 표면에 배선하지 않아 홍보 영상 자료실에만 수록한다.
 */
export const BRAND_SQUARE_INKDROP_CLIP: BrandClip = {
  src: "/brand/brand-clips/brand-square-inkdrop.mp4",
  width: 768,
  height: 768,
};
