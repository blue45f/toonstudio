/**
 * 차세대 웹툰 소재 스마트 검색 카탈로그 및 3대 비주얼 필터 메타데이터 정본.
 *
 * - 6종 실루엣 획 힌트(`SKETCH_STROKE_HINTS`), 5종 색감 무드(`PALETTE_MOOD_OPTIONS`),
 *   5종 카메라 앵글(`CAMERA_ANGLE_OPTIONS`), 18종 상업/참고 소재 카탈로그(`SMART_STUDIO_ASSET_CATALOG`)를 제공한다.
 */

export type SketchStrokeHint =
  | "arc"
  | "burst"
  | "grid"
  | "vertical"
  | "perspective"
  | "silhouette";

export type PaletteMoodId =
  | "warm-sunset"
  | "cool-night"
  | "pastel-romance"
  | "noir-ink"
  | "botanical-day";

export type CameraAngleFilter =
  | "eye-level"
  | "high-angle"
  | "low-angle"
  | "bird-eye"
  | "dutch";

export type RightsBomStatus =
  | "commercial-safe"
  | "editorial-only"
  | "attribution-required";

export type StudioSmartAssetCategory =
  | "background-3d"
  | "brush-fx"
  | "screentone"
  | "prop"
  | "sfx-bubble"
  | "lighting-pack";

export interface StudioAssetRightsBom {
  readonly status: RightsBomStatus;
  readonly commercialSafe: boolean;
  readonly licenseCode: string;
  readonly attributionRequired: boolean;
  readonly summary: string;
}

export interface StudioSmartAssetItem {
  readonly id: string;
  readonly title: string;
  readonly category: StudioSmartAssetCategory;
  readonly categoryLabel: string;
  readonly spritePath: string;
  readonly summary: string;
  readonly semanticTags: readonly string[];
  readonly emotionTags: readonly string[];
  readonly sketchStrokeHints: readonly SketchStrokeHint[];
  readonly paletteMoods: readonly PaletteMoodId[];
  readonly cameraAngles: readonly CameraAngleFilter[];
  readonly rightsBom: StudioAssetRightsBom;
  readonly bundleId: string;
  readonly bundleName: string;
  readonly layerOutputSummary: string;
  readonly popularityRank: number;
}

export interface SketchStrokeHintOption {
  readonly id: SketchStrokeHint;
  readonly label: string;
  readonly shortHint: string;
  readonly svgPath: string;
}

export interface PaletteMoodOption {
  readonly id: PaletteMoodId;
  readonly label: string;
  readonly shortHint: string;
}

export interface CameraAngleOption {
  readonly id: CameraAngleFilter;
  readonly label: string;
  readonly shortHint: string;
}

export const SKETCH_STROKE_HINTS: readonly SketchStrokeHintOption[] = [
  {
    id: "arc",
    label: "곡선 아크",
    shortHint: "꽃잎·검기·빛 궤적",
    svgPath: "M4 18 C 8 6, 16 6, 20 14",
  },
  {
    id: "burst",
    label: "방사 폭발",
    shortHint: "속도선·집중선·임팩트",
    svgPath:
      "M12 12 L4 5 M12 12 L20 5 M12 12 L3 13 M12 12 L21 13 M12 12 L6 20 M12 12 L18 20",
  },
  {
    id: "grid",
    label: "격자·톤",
    shortHint: "창문·빌딩·하프톤",
    svgPath: "M4 8 H20 M4 16 H20 M8 4 V20 M16 4 V20",
  },
  {
    id: "vertical",
    label: "수직 라인",
    shortHint: "빗줄기·전봇대·난간",
    svgPath: "M6 4 V20 M12 3 V21 M18 5 V19",
  },
  {
    id: "perspective",
    label: "원근 투시",
    shortHint: "복도·옥상·소실점",
    svgPath: "M12 6 L3 20 M12 6 L21 20 M12 6 L8 20 M12 6 L16 20 M5 16 H19",
  },
  {
    id: "silhouette",
    label: "실루엣",
    shortHint: "군중·나뭇잎·그림자",
    svgPath:
      "M5 19 C 5 13, 9 11, 12 11 C 15 11, 19 13, 19 19 Z M12 5 A 2.5 2.5 0 1 0 12 10 A 2.5 2.5 0 1 0 12 5",
  },
];

export const PALETTE_MOOD_OPTIONS: readonly PaletteMoodOption[] = [
  { id: "warm-sunset", label: "따뜻한 노을", shortHint: "방과후·석양·역광" },
  { id: "cool-night", label: "쿨 나이트", shortHint: "비 오는 밤·야경·고백" },
  { id: "pastel-romance", label: "파스텔 로맨스", shortHint: "설렘·꽃잎·로판" },
  { id: "noir-ink", label: "느와르 잉크", shortHint: "액션·먹선·스릴러" },
  { id: "botanical-day", label: "보태니컬 낮", shortHint: "온실·숲·청량한 햇살" },
];

export const CAMERA_ANGLE_OPTIONS: readonly CameraAngleOption[] = [
  { id: "eye-level", label: "아이레벨", shortHint: "대화·감정 교감" },
  { id: "high-angle", label: "하이앵글", shortHint: "내려다보기·여운" },
  { id: "low-angle", label: "로우앵글", shortHint: "위압감·등장신" },
  { id: "bird-eye", label: "버드아이", shortHint: "도시 전경·공간 파악" },
  { id: "dutch", label: "더치앵글", shortHint: "기울임·긴박/충돌" },
];

const COMMERCIAL_SAFE_BOM: StudioAssetRightsBom = {
  status: "commercial-safe",
  commercialSafe: true,
  licenseCode: "TS-COMMERCIAL-1.0",
  attributionRequired: false,
  summary: "상업 연재·단행본·글로벌 출고 완전 안전",
};

export const SMART_STUDIO_ASSET_CATALOG: readonly StudioSmartAssetItem[] = [
  {
    id: "asset-rainy-rooftop-3d",
    title: "비 오는 밤 옥상 난간 3D 무대",
    category: "background-3d",
    categoryLabel: "3D 배경",
    spritePath: "/assets/studio/vibrant-sprites/tool-bg3d.webp",
    summary: "젖은 콘크리트 반사와 철제 난간·도시 야경이 세팅된 야간 옥상 3D 무대",
    semanticTags: ["비", "우천", "밤", "야간", "옥상", "난간", "고백", "로맨스", "야경", "도시"],
    emotionTags: ["애절", "설렘", "고백", "여운"],
    sketchStrokeHints: ["perspective", "vertical"],
    paletteMoods: ["cool-night"],
    cameraAngles: ["eye-level", "high-angle"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-rainy-confession",
    bundleName: "비 오는 밤 고백씬 연출 세트",
    layerOutputSummary: "선화 · 셀 음영 · 마스크 3층",
    popularityRank: 98,
  },
  {
    id: "asset-raindrop-watercolor-brush",
    title: "빗줄기·창가 번짐 수채 브러시",
    category: "brush-fx",
    categoryLabel: "브러시 FX",
    spritePath: "/assets/studio/vibrant-sprites/brush-watercolor.webp",
    summary: "빗방울 흐름과 가로등 빛 번짐을 한 획에 표현하는 촉촉한 수채 FX 브러시",
    semanticTags: ["비", "우천", "빗줄기", "빗방울", "밤", "고백", "눈물", "유리창", "감성"],
    emotionTags: ["애절", "설렘", "잔잔"],
    sketchStrokeHints: ["vertical", "arc"],
    paletteMoods: ["cool-night", "pastel-romance"],
    cameraAngles: ["eye-level", "high-angle"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-rainy-confession",
    bundleName: "비 오는 밤 고백씬 연출 세트",
    layerOutputSummary: "필압·기울기 반응 수채 리본",
    popularityRank: 94,
  },
  {
    id: "asset-night-bokeh-tone",
    title: "야간 빗속 가로등 보케 스크린톤",
    category: "screentone",
    categoryLabel: "스크린톤",
    spritePath: "/assets/studio/vibrant-sprites/tool-screentone.webp",
    summary: "옥상·거리 고백 컷 뒤편의 초점 흐림 빛망울을 즉시 얹는 하프톤 오버레이",
    semanticTags: ["비", "밤", "옥상", "고백", "가로등", "보케", "빛망울", "로맨스", "스크린톤"],
    emotionTags: ["설렘", "여운", "고백"],
    sketchStrokeHints: ["arc", "burst"],
    paletteMoods: ["cool-night"],
    cameraAngles: ["eye-level", "low-angle"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-rainy-confession",
    bundleName: "비 오는 밤 고백씬 연출 세트",
    layerOutputSummary: "비파괴 톤 마스크 · 투명도 조절",
    popularityRank: 91,
  },
  {
    id: "asset-action-speedline-burst",
    title: "임팩트 방사 액션 속도선 브러시",
    category: "brush-fx",
    categoryLabel: "브러시 FX",
    spritePath: "/assets/studio/vibrant-sprites/brush-fx-ribbon.webp",
    summary: "타격 순간의 집중선·가속 속도선을 벡터 강약으로 찍어내는 액션 전용 팩",
    semanticTags: ["액션", "속도선", "집중선", "타격", "폭발", "전투", "질주", "임팩트"],
    emotionTags: ["긴박", "박력", "분노"],
    sketchStrokeHints: ["burst"],
    paletteMoods: ["noir-ink"],
    cameraAngles: ["dutch", "low-angle", "eye-level"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-action-impact",
    bundleName: "액션 타격·속도선 풀패키지",
    layerOutputSummary: "벡터 속도선 · 소실점 자동 추적",
    popularityRank: 99,
  },
  {
    id: "asset-sword-arc-calligraphy",
    title: "검기·참격 먹선 캘리그래피 브러시",
    category: "brush-fx",
    categoryLabel: "브러시 FX",
    spritePath: "/assets/studio/vibrant-sprites/brush-calligraphy.webp",
    summary: "호 모양의 날카로운 검기 궤적과 거친 갈필 붓터치를 구현하는 액션 먹선",
    semanticTags: ["액션", "속도선", "검기", "참격", "먹선", "무협", "전투", "타격"],
    emotionTags: ["박력", "긴박", "결의"],
    sketchStrokeHints: ["arc", "burst"],
    paletteMoods: ["noir-ink"],
    cameraAngles: ["dutch", "low-angle"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-action-impact",
    bundleName: "액션 타격·속도선 풀패키지",
    layerOutputSummary: "갈필 텍스처 · 속도 테이퍼",
    popularityRank: 95,
  },
  {
    id: "asset-shattered-asphalt-3d",
    title: "저각도 붕괴 아스팔트 3D 파편",
    category: "background-3d",
    categoryLabel: "3D 배경",
    spritePath: "/assets/studio/vibrant-sprites/emblem-bg3d-stage.webp",
    summary: "강력한 착지·충돌 컷에 바로 배치하는 파쇄 지면과 비산 파편 3D 키트",
    semanticTags: ["액션", "전투", "충돌", "파편", "아스팔트", "저각도", "폭발"],
    emotionTags: ["박력", "위기", "긴박"],
    sketchStrokeHints: ["perspective", "burst"],
    paletteMoods: ["noir-ink", "warm-sunset"],
    cameraAngles: ["low-angle", "dutch"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-action-impact",
    bundleName: "액션 타격·속도선 풀패키지",
    layerOutputSummary: "3D 파편 · 선화/음영/마스크",
    popularityRank: 89,
  },
  {
    id: "asset-dynamic-sfx-bubble-kit",
    title: "다이나믹 효과음·외침 말풍선 키트",
    category: "sfx-bubble",
    categoryLabel: "식자·SFX",
    spritePath: "/assets/studio/vibrant-sprites/tool-bubble-sfx.webp",
    summary: "충돌 효과음 외곽선과 가시 말풍선을 컷 기울기에 맞춰 배치하는 타이포 키트",
    semanticTags: ["액션", "속도선", "효과음", "SFX", "말풍선", "외침", "폭발", "타격"],
    emotionTags: ["긴박", "충격", "박력"],
    sketchStrokeHints: ["burst", "arc"],
    paletteMoods: ["noir-ink", "warm-sunset"],
    cameraAngles: ["dutch", "eye-level"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-action-impact",
    bundleName: "액션 타격·속도선 풀패키지",
    layerOutputSummary: "편집 가능 벡터 말풍선·SFX",
    popularityRank: 90,
  },
  {
    id: "asset-sunset-classroom-3d",
    title: "방과후 노을 교실 창가 3D 배경",
    category: "background-3d",
    categoryLabel: "3D 배경",
    spritePath: "/assets/studio/vibrant-sprites/tool-bg3d.webp",
    summary: "석양 빛줄기가 책상 위로 길게 떨어지는 한국 고등학교 창가 복도 3D 무대",
    semanticTags: ["노을", "석양", "교실", "학교", "학원", "방과후", "창가", "청춘"],
    emotionTags: ["아련", "따뜻", "설렘"],
    sketchStrokeHints: ["perspective", "grid"],
    paletteMoods: ["warm-sunset"],
    cameraAngles: ["eye-level", "high-angle"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-sunset-campus",
    bundleName: "방과후 노을 학원물 세트",
    layerOutputSummary: "선화 · 노을 음영 · 창틀 마스크",
    popularityRank: 96,
  },
  {
    id: "asset-sunset-dust-airbrush",
    title: "석양 역광 먼지 입자 에어브러시",
    category: "lighting-pack",
    categoryLabel: "광원·분위기",
    spritePath: "/assets/studio/vibrant-sprites/brush-airbrush.webp",
    summary: "창가 노을 속 부유 먼지와 따뜻한 할레이션 글로우를 자연스럽게 얹는 브러시",
    semanticTags: ["노을", "석양", "역광", "빛줄기", "먼지", "교실", "학원", "감성"],
    emotionTags: ["따뜻", "아련", "평온"],
    sketchStrokeHints: ["arc", "vertical"],
    paletteMoods: ["warm-sunset"],
    cameraAngles: ["eye-level", "low-angle"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-sunset-campus",
    bundleName: "방과후 노을 학원물 세트",
    layerOutputSummary: "광원 글로우 · 가산 블렌드 프리셋",
    popularityRank: 88,
  },
  {
    id: "asset-romance-petal-pastel",
    title: "로판 벚꽃·장미 꽃잎 파스텔 리본",
    category: "brush-fx",
    categoryLabel: "브러시 FX",
    spritePath: "/assets/studio/vibrant-sprites/brush-pastel.webp",
    summary: "고백·첫만남 컷에 원근감 있는 꽃잎 흐름을 부드럽게 흩뿌리는 로맨스 리본",
    semanticTags: ["로맨스", "고백", "꽃잎", "벚꽃", "장미", "로판", "봄", "첫만남"],
    emotionTags: ["설렘", "행복", "화사"],
    sketchStrokeHints: ["arc"],
    paletteMoods: ["pastel-romance"],
    cameraAngles: ["eye-level", "high-angle"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-pastel-romance",
    bundleName: "로맨스·로판 설렘 연출 세트",
    layerOutputSummary: "근경/원경 자동 블러 꽃잎 리본",
    popularityRank: 97,
  },
  {
    id: "asset-blush-halftone-screen",
    title: "감정선 하프톤 블러시 스크린톤",
    category: "screentone",
    categoryLabel: "스크린톤",
    spritePath: "/assets/studio/vibrant-sprites/brush-halftone.webp",
    summary: "클로즈업 두근거림과 말풍선 배경에 깔끔하게 어우러지는 파스텔 하프톤",
    semanticTags: ["로맨스", "고백", "두근", "블러시", "하프톤", "스크린톤", "감정선"],
    emotionTags: ["설렘", "수줍음", "따뜻"],
    sketchStrokeHints: ["grid"],
    paletteMoods: ["pastel-romance", "warm-sunset"],
    cameraAngles: ["eye-level"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-pastel-romance",
    bundleName: "로맨스·로판 설렘 연출 세트",
    layerOutputSummary: "모아레 방지 60LPI 하프톤",
    popularityRank: 87,
  },
  {
    id: "asset-city-skyline-birdeye",
    title: "도심 고층 빌딩 군집 버드아이 3D",
    category: "background-3d",
    categoryLabel: "3D 배경",
    spritePath: "/assets/studio/vibrant-sprites/tool-ruler.webp",
    summary: "도입부 공간 확립이나 야간 추격전 전경에 쓰는 고밀도 도시 조감 3D 블록",
    semanticTags: ["도시", "빌딩", "야경", "조감", "전경", "추격", "밤", "스카이라인"],
    emotionTags: ["웅장", "고독", "긴장"],
    sketchStrokeHints: ["grid", "vertical", "perspective"],
    paletteMoods: ["cool-night", "noir-ink"],
    cameraAngles: ["bird-eye", "high-angle"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-city-noir",
    bundleName: "야간 도심 느와르 배경 세트",
    layerOutputSummary: "3점 투시 가이드 · 창문 야광 마스크",
    popularityRank: 92,
  },
  {
    id: "asset-noir-alley-silhouette-ink",
    title: "비 오는 골목 전봇대·전선 먹선 실루엣",
    category: "prop",
    categoryLabel: "소품·실루엣",
    spritePath: "/assets/studio/vibrant-sprites/brush-ink.webp",
    summary: "스릴러·느와르 컷의 압박감을 살리는 고대비 전봇대·골목 실루엣 스탬프",
    semanticTags: ["비", "밤", "골목", "전봇대", "느와르", "스릴러", "실루엣", "그림자"],
    emotionTags: ["불안", "긴장", "고독"],
    sketchStrokeHints: ["silhouette", "vertical"],
    paletteMoods: ["noir-ink", "cool-night"],
    cameraAngles: ["low-angle", "dutch"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-city-noir",
    bundleName: "야간 도심 느와르 배경 세트",
    layerOutputSummary: "고대비 먹선 실루엣 벡터",
    popularityRank: 86,
  },
  {
    id: "asset-botanical-conservatory-3d",
    title: "정오 유리 온실 식물원 3D 아치 무대",
    category: "background-3d",
    categoryLabel: "3D 배경",
    spritePath: "/assets/studio/vibrant-sprites/emblem-library.webp",
    summary: "청량한 낮 햇살과 유리 아치·관엽 식물이 어우러진 치유/판타지 3D 무대",
    semanticTags: ["숲", "식물", "온실", "정원", "낮", "햇살", "보태니컬", "치유", "판타지"],
    emotionTags: ["평온", "치유", "환상"],
    sketchStrokeHints: ["arc", "perspective"],
    paletteMoods: ["botanical-day"],
    cameraAngles: ["eye-level", "low-angle"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-botanical-atelier",
    bundleName: "청량한 낮 정원·숲 연출 세트",
    layerOutputSummary: "유리 아치 선화 · 녹음 음영 3층",
    popularityRank: 90,
  },
  {
    id: "asset-canopy-leaf-oil-brush",
    title: "나뭇잎 그림자·햇살 유화 질감 브러시",
    category: "brush-fx",
    categoryLabel: "브러시 FX",
    spritePath: "/assets/studio/vibrant-sprites/brush-oil.webp",
    summary: "숲길 산책 컷에 얼룩진 나뭇잎 그림자와 회화적 잎사귀 실루엣을 더하는 브러시",
    semanticTags: ["숲", "나뭇잎", "나무", "낮", "햇살", "보태니컬", "산책", "자연"],
    emotionTags: ["평온", "상쾌", "치유"],
    sketchStrokeHints: ["silhouette", "arc"],
    paletteMoods: ["botanical-day"],
    cameraAngles: ["bird-eye", "high-angle", "eye-level"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-botanical-atelier",
    bundleName: "청량한 낮 정원·숲 연출 세트",
    layerOutputSummary: "회화 질감 브러시 · 자동 명암 팁",
    popularityRank: 85,
  },
  {
    id: "asset-crowd-silhouette-stamp",
    title: "무대·광장 군중 실루엣 자동 배치 팩",
    category: "prop",
    categoryLabel: "소품·실루엣",
    spritePath: "/assets/studio/vibrant-sprites/emblem-character.webp",
    summary: "엑스트라 인파를 원근 비율에 맞춰 한 번에 채우는 다중 포즈 실루엣 스탬프",
    semanticTags: ["군중", "엑스트라", "사람", "실루엣", "광장", "거리", "콘서트"],
    emotionTags: ["활기", "고독", "웅장"],
    sketchStrokeHints: ["silhouette"],
    paletteMoods: ["cool-night", "warm-sunset", "botanical-day"],
    cameraAngles: ["bird-eye", "high-angle", "eye-level"],
    rightsBom: COMMERCIAL_SAFE_BOM,
    bundleId: "bundle-city-noir",
    bundleName: "야간 도심 느와르 배경 세트",
    layerOutputSummary: "깊이별 자동 스케일 실루엣",
    popularityRank: 93,
  },
  {
    id: "asset-editorial-magazine-sky",
    title: "외부 제휴 잡지 석양 스카이 텍스처 (비상업 체험)",
    category: "lighting-pack",
    categoryLabel: "광원·분위기",
    spritePath: "/assets/studio/vibrant-sprites/emblem-market.webp",
    summary: "컨셉 보드 참고용 비상업 체험 스카이 팩 (유료 연재 출고 전 교체 필요)",
    semanticTags: ["노을", "석양", "하늘", "구름", "참고", "체험"],
    emotionTags: ["따뜻", "아련"],
    sketchStrokeHints: ["grid"],
    paletteMoods: ["warm-sunset"],
    cameraAngles: ["eye-level"],
    rightsBom: {
      status: "editorial-only",
      commercialSafe: false,
      licenseCode: "CC-BY-NC-4.0",
      attributionRequired: true,
      summary: "비상업 전용 · 상업 출고 BOM 게이트 자동 차단",
    },
    bundleId: "bundle-external-reference",
    bundleName: "외부 참고용 비상업 번들",
    layerOutputSummary: "래스터 참고 텍스처",
    popularityRank: 64,
  },
  {
    id: "asset-attribution-neon-sign",
    title: "오픈 아카이브 야간 네온 간판 스캔 (저작자 표기)",
    category: "prop",
    categoryLabel: "소품·실루엣",
    spritePath: "/assets/studio/vibrant-sprites/emblem-market.webp",
    summary: "야간 골목 네온 간판 스캔 에셋 — 최종 출고 시 크레딧 저작자 표기 의무 포함",
    semanticTags: ["비", "밤", "네온", "간판", "골목", "야경", "옥상"],
    emotionTags: ["고독", "불안", "느와르"],
    sketchStrokeHints: ["vertical", "grid"],
    paletteMoods: ["cool-night", "noir-ink"],
    cameraAngles: ["dutch", "low-angle"],
    rightsBom: {
      status: "attribution-required",
      commercialSafe: false,
      licenseCode: "CC-BY-4.0-CREDIT",
      attributionRequired: true,
      summary: "저작자 크레딧 표기 필수 · 원클릭 상업 안전 모드에서 제외",
    },
    bundleId: "bundle-external-reference",
    bundleName: "외부 참고용 비상업 번들",
    layerOutputSummary: "네온 스캔 PNG · 크레딧 메타",
    popularityRank: 71,
  },
];
