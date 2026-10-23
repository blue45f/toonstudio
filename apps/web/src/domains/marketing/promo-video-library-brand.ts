/**
 * 홍보 영상 자료실의 브랜드 카테고리 보관 항목(17~22차 파도분) — 통합
 * 레지스트리 promo-video-library.ts가 소스 파일 800줄 상한에 닿아,
 * 페이지 카테고리(promo-video-library-pages.ts)와 같은 방식으로
 * 17차 파도에서 더한 브랜드 보관 항목 3편의 표시 항목을 이 파일로
 * 분리했고, 18차 파도 보관 항목 4편과 19차 파도 보관 항목 4편, 20차 파도
 * 보관 항목 3편, 21차 파도 보관 항목 4편, 22차 파도 보관 항목 4편도
 * 이어서 여기에 둔다. 전부
 * 생성형 AI로 만든 개념 영상이고, 아직 표면에 배선하지 않은 자료실
 * 보관분이다. 클립 규격의 정본은 brand-clips.ts다. 18차 파도부터는
 * 클립 길이가 편마다 달라, 길이를 항목마다 실측으로 적는다.
 */
import {
  BRAND_AUTUMN_ROAD_CLIP,
  BRAND_CITY_DAWN_CLIP,
  BRAND_DUNES_CLIP,
  BRAND_FOREST_LIGHT_CLIP,
  BRAND_MOUNTAIN_LAKE_CLIP,
  BRAND_NEON_ALLEY_CLIP,
  BRAND_OCEAN_CLIP,
  BRAND_PAPER_CRAFT_CLIP,
  BRAND_RIVER_ROCKS_CLIP,
  BRAND_SNOWFIELD_CLIP,
  BRAND_SQUARE_BLOOM_CLIP,
  BRAND_SQUARE_HONEYCOMB_CLIP,
  BRAND_SQUARE_INKDROP_CLIP,
  BRAND_SQUARE_LAVA_CLIP,
  BRAND_SQUARE_TERRAZZO_CLIP,
  BRAND_SQUARE_WAVE_CLIP,
  BRAND_WORKSHOP_CLIP,
  HOME_HERO_DUSK_CLIP,
  HOME_HERO_FOG_CLIP,
  HOME_HERO_HARBOR_CLIP,
  HOME_HERO_MEADOW_CLIP,
  HOME_HERO_SPRING_CLIP,
  type BrandClip,
} from "./brand-clips";
import type { PromoVideoItem } from "./promo-video-library";

/** promo-video-library.ts의 LIBRARY_ONLY와 같은 값 — 순환 import를 피하려고 이 파일에 따로 둔다. */
const LIBRARY_ONLY = { ko: "자료실 보관", en: "Library only" } as const;

/** promo-video-library.ts의 brandLibraryItem과 같은 모양 — 분리한 항목만 여기서 만든다. 길이는 편마다 실측으로 받고, 품질 메모가 있으면 함께 받는다. */
const brandLibraryItem = (
  id: string,
  clip: BrandClip,
  durationLabel: string,
  ko: { readonly title: string; readonly body: string },
  en: { readonly title: string; readonly body: string },
  note?: { readonly ko: string; readonly en: string },
): PromoVideoItem => ({
  id,
  categoryId: "brand",
  src: clip.src,
  width: clip.width,
  height: clip.height,
  durationLabel,
  ko,
  en,
  usage: LIBRARY_ONLY,
  ...(note ? { note } : {}),
});

export const PROMO_VIDEO_BRAND_LIBRARY_ITEMS: readonly PromoVideoItem[] = [
  brandLibraryItem("brand-ocean", BRAND_OCEAN_CLIP, "0:14", {
    title: "바다 앞의 스튜디오",
    body: "파도 소리가 닿는 바다 앞 작업실을 그린 클립입니다.",
  }, {
    title: "Studio by the sea",
    body: "A studio by the sea, close enough to hear the waves.",
  }),
  brandLibraryItem("brand-home-hero-fog", HOME_HERO_FOG_CLIP, "0:14", {
    title: "안개의 파노라마",
    body: "안개가 창밖을 감싸는 스튜디오 파노라마입니다. 낮·노을·밤·비·눈·새벽 파노라마와 한 세트로 보관합니다.",
  }, {
    title: "Fog panorama",
    body: "A studio panorama wrapped in fog outside the window, kept as a set with the day, evening, night, rain, snow and dawn panoramas.",
  }),
  brandLibraryItem("brand-square-bloom", BRAND_SQUARE_BLOOM_CLIP, "0:14", {
    title: "정사각 꽃 스팅",
    body: "꽃이 피어나는 1:1 정사각 브랜드 스팅입니다. 정사각 스팅 세트와 함께 보관합니다.",
  }, {
    title: "Square bloom sting",
    body: "A 1:1 square brand sting of a flower blooming — kept with the square sting set.",
  }),
  brandLibraryItem("brand-neon-alley", BRAND_NEON_ALLEY_CLIP, "0:08", {
    title: "네온 빛 골목",
    body: "네온 빛이 번지는 밤 골목의 풍경을 그린 클립입니다.",
  }, {
    title: "Neon-lit alley",
    body: "A night alley washed in neon light.",
  }),
  brandLibraryItem("brand-paper-craft", BRAND_PAPER_CRAFT_CLIP, "0:09", {
    title: "종이 모형 마을",
    body: "종이로 접어 만든 작은 마을 모형을 그린 클립입니다.",
  }, {
    title: "Paper-craft village",
    body: "A small village built as a folded-paper model.",
  }),
  brandLibraryItem("brand-home-hero-dusk", HOME_HERO_DUSK_CLIP, "0:11", {
    title: "해 질 녘의 파노라마",
    body: "해 지는 빛이 드는 스튜디오 파노라마입니다. 낮·노을·밤·비·눈·새벽·안개 파노라마와 한 세트로 보관합니다.",
  }, {
    title: "Dusk panorama",
    body: "A studio panorama in the light of the setting sun, kept as a set with the day, evening, night, rain, snow, dawn and fog panoramas.",
  }),
  brandLibraryItem("brand-square-inkdrop", BRAND_SQUARE_INKDROP_CLIP, "0:10", {
    title: "정사각 잉크 스팅",
    body: "물에 잉크 한 방울이 번지는 1:1 정사각 브랜드 스팅입니다. 정사각 스팅 세트와 함께 보관합니다.",
  }, {
    title: "Square ink-drop sting",
    body: "A 1:1 square brand sting of a drop of ink blooming in water — kept with the square sting set.",
  }),
  brandLibraryItem("brand-forest-light", BRAND_FOREST_LIGHT_CLIP, "0:14", {
    title: "숲에 드는 빛",
    body: "숲 사이로 햇빛이 드는 풍경을 그린 클립입니다.",
  }, {
    title: "Light through the forest",
    body: "Sunlight falling through the trees in a forest.",
  }),
  brandLibraryItem("brand-city-dawn", BRAND_CITY_DAWN_CLIP, "0:14", {
    title: "새벽의 도시",
    body: "새벽빛이 번지는 도시의 풍경을 그린 클립입니다.",
  }, {
    title: "The city at dawn",
    body: "A city washed in early dawn light.",
  }),
  brandLibraryItem("brand-home-hero-spring", HOME_HERO_SPRING_CLIP, "0:14", {
    title: "봄의 파노라마",
    body: "봄빛이 드는 스튜디오 파노라마입니다. 낮·노을·밤·비·눈·새벽·안개·황혼 파노라마와 한 세트로 보관합니다.",
  }, {
    title: "Spring panorama",
    body: "A studio panorama in spring light, kept as a set with the day, evening, night, rain, snow, dawn, fog and dusk panoramas.",
  }),
  brandLibraryItem("brand-square-wave", BRAND_SQUARE_WAVE_CLIP, "0:14", {
    title: "정사각 파도 스팅",
    body: "파도가 밀려오는 1:1 정사각 브랜드 스팅입니다. 정사각 스팅 세트와 함께 보관합니다.",
  }, {
    title: "Square wave sting",
    body: "A 1:1 square brand sting of a wave rolling in — kept with the square sting set.",
  }),
  brandLibraryItem("brand-mountain-lake", BRAND_MOUNTAIN_LAKE_CLIP, "0:14", {
    title: "산과 호수",
    body: "산자락 아래 호수가 펼쳐지는 풍경을 그린 클립입니다.",
  }, {
    title: "Mountain lake",
    body: "A lake spread out at the foot of the mountains.",
  }),
  brandLibraryItem("brand-workshop", BRAND_WORKSHOP_CLIP, "0:14", {
    title: "작업 공방",
    body: "도구가 놓인 작업 공방의 풍경을 그린 클립입니다.",
  }, {
    title: "The workshop",
    body: "A workshop with its tools laid out.",
  }),
  brandLibraryItem("brand-square-honeycomb", BRAND_SQUARE_HONEYCOMB_CLIP, "0:14", {
    title: "정사각 벌집 스팅",
    body: "벌집 무늬가 빛나는 1:1 정사각 브랜드 스팅입니다. 정사각 스팅 세트와 함께 보관합니다.",
  }, {
    title: "Square honeycomb sting",
    body: "A 1:1 square brand sting of a glowing honeycomb pattern — kept with the square sting set.",
  }),
  brandLibraryItem("brand-river-rocks", BRAND_RIVER_ROCKS_CLIP, "0:14", {
    title: "강가의 바위",
    body: "강물이 바위 사이를 흐르는 풍경을 그린 클립입니다.",
  }, {
    title: "Rocks by the river",
    body: "A river running between the rocks.",
  }),
  brandLibraryItem("brand-snowfield", BRAND_SNOWFIELD_CLIP, "0:14", {
    title: "눈 덮인 들판",
    body: "눈이 소복이 쌓인 들판의 풍경을 그린 클립입니다.",
  }, {
    title: "Snowfield",
    body: "A field lying quiet under a blanket of snow.",
  }),
  brandLibraryItem("brand-home-hero-harbor", HOME_HERO_HARBOR_CLIP, "0:14", {
    title: "항구의 파노라마",
    body: "항구가 내려다보이는 스튜디오 파노라마입니다. 낮·노을·밤·비·눈·새벽·안개·황혼·봄 파노라마와 한 세트로 보관합니다.",
  }, {
    title: "Harbor panorama",
    body: "A studio panorama looking out over a harbor, kept as a set with the day, evening, night, rain, snow, dawn, fog, dusk and spring panoramas.",
  }, {
    ko: "품질 메모: 일부 프레임에 먼 돛대와 왼쪽 가장자리에 잘린 구조물이 보입니다. 읽을 수 있는 글자는 아니어서 그대로 수록합니다.",
    en: "Quality note: a few frames show a distant mast and a structure cut off at the left edge. There are no readable letters, so the clip is kept as is.",
  }),
  brandLibraryItem("brand-square-terrazzo", BRAND_SQUARE_TERRAZZO_CLIP, "0:14", {
    title: "정사각 테라조 스팅",
    body: "테라조 무늬가 번지는 1:1 정사각 브랜드 스팅입니다. 정사각 스팅 세트와 함께 보관합니다.",
  }, {
    title: "Square terrazzo sting",
    body: "A 1:1 square brand sting of a terrazzo pattern spreading — kept with the square sting set.",
  }),
  brandLibraryItem("brand-autumn-road", BRAND_AUTUMN_ROAD_CLIP, "0:14", {
    title: "가을 길",
    body: "단풍이 물든 가을 길을 그린 클립입니다.",
  }, {
    title: "Autumn road",
    body: "A road lined with autumn colors.",
  }),
  brandLibraryItem("brand-dunes", BRAND_DUNES_CLIP, "0:14", {
    title: "모래 언덕",
    body: "바람결이 남은 모래 언덕을 그린 클립입니다.",
  }, {
    title: "Dunes",
    body: "Sand dunes with the marks of the wind.",
  }),
  brandLibraryItem("brand-home-hero-meadow", HOME_HERO_MEADOW_CLIP, "0:14", {
    title: "초원의 파노라마",
    body: "초원이 펼쳐지는 스튜디오 파노라마입니다. 낮·노을·밤·비·눈·새벽·안개·황혼·봄·항구 파노라마와 한 세트로 보관합니다.",
  }, {
    title: "Meadow panorama",
    body: "A studio panorama looking out over a meadow, kept as a set with the day, evening, night, rain, snow, dawn, fog, dusk, spring and harbor panoramas.",
  }),
  brandLibraryItem("brand-square-lava", BRAND_SQUARE_LAVA_CLIP, "0:14", {
    title: "정사각 용암 스팅",
    body: "용암이 흐르는 1:1 정사각 브랜드 스팅입니다. 정사각 스팅 세트와 함께 보관합니다.",
  }, {
    title: "Square lava sting",
    body: "A 1:1 square brand sting of lava flowing — kept with the square sting set.",
  }),
];
