/**
 * 대본→3D 스테이징 프리셋 카탈로그 · 한국어/영어 키워드 사전 · 소품 규칙 · 데모 대본.
 */

export type StagingLocationId =
  | "rooftop"
  | "classroom"
  | "cafe"
  | "alley_night"
  | "office"
  | "bedroom"
  | "subway_station"
  | "fantasy_throne"
  | "hospital_corridor"
  | "park_street";

export type StagingTimeOfDay = "dawn" | "morning" | "noon" | "sunset" | "night" | "rainy_overcast";

export type StagingEmotionMood =
  | "tension"
  | "romance"
  | "melancholy"
  | "action"
  | "comedy"
  | "mystery"
  | "calm_daily";

export type CameraShotScale = "extreme-wide" | "wide" | "medium" | "medium-close" | "close-up";

export type PropPlacementCategory = "architecture" | "furniture" | "hero-prop" | "atmospheric";

export interface Background3dPresetSpec {
  readonly presetId: string;
  readonly location: StagingLocationId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly widthM: number;
  readonly depthM: number;
  readonly ceilingHeightM: number;
  readonly indoor: boolean;
  readonly floorMaterial: string;
  readonly backdropKind: "sky-dome" | "city-skyline" | "interior-walled" | "cathedral-vault";
}

export interface EssentialPropSeed {
  readonly assetKey: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly category: PropPlacementCategory;
  readonly position: readonly [number, number, number];
  readonly rotationYDeg: number;
  readonly scale: readonly [number, number, number];
  readonly footprintRadiusM: number;
}

export interface LocationPresetDefinition {
  readonly spec: Background3dPresetSpec;
  readonly keywords: readonly string[];
  readonly tabletopHeightM: number;
  readonly essentialProps: readonly EssentialPropSeed[];
}

export interface DynamicPropRule {
  readonly key: string;
  readonly assetKey: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly keywords: readonly string[];
  readonly onTabletop: boolean;
  readonly preferredOffset: readonly [number, number];
  readonly scale: readonly [number, number, number];
  readonly footprintRadiusM: number;
}

export interface DemoWebtoonScriptPreset {
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly scriptText: string;
}

export const LOCATION_PRESETS: Readonly<Record<StagingLocationId, LocationPresetDefinition>> = {
  rooftop: {
    spec: { presetId: "bg3d-rooftop-school-v2", location: "rooftop", labelKo: "학교·빌딩 옥상 테라스", labelEn: "School / Building Rooftop", widthM: 14, depthM: 12, ceilingHeightM: 12, indoor: false, floorMaterial: "weathered-concrete", backdropKind: "city-skyline" },
    keywords: ["옥상", "난간", "철조망", "rooftop", "roof", "terrace", "helipad"],
    tabletopHeightM: 0.48,
    essentialProps: [
      { assetKey: "prop-chainlink-fence", labelKo: "옥상 철망 난간", labelEn: "Chain-Link Fence", category: "architecture", position: [0, 0, -4.6], rotationYDeg: 0, scale: [12, 2.2, 0.2], footprintRadiusM: 0.7 },
      { assetKey: "prop-rooftop-access-door", labelKo: "철제 옥상 출입문", labelEn: "Metal Roof Access Door", category: "architecture", position: [-4.4, 0, 2.8], rotationYDeg: 45, scale: [1.3, 2.3, 0.4], footprintRadiusM: 0.9 },
      { assetKey: "prop-hvac-unit", labelKo: "실외기 유닛", labelEn: "HVAC Condenser Unit", category: "furniture", position: [4.2, 0, -2.5], rotationYDeg: -25, scale: [1.2, 1.1, 0.8], footprintRadiusM: 0.85 },
      { assetKey: "prop-rooftop-bench", labelKo: "옥상 철제 벤치", labelEn: "Metal Rooftop Bench", category: "furniture", position: [-2.6, 0, -2.4], rotationYDeg: 18, scale: [1.6, 0.5, 0.55], footprintRadiusM: 0.8 },
    ],
  },
  classroom: {
    spec: { presetId: "bg3d-classroom-academy-v2", location: "classroom", labelKo: "고등학교 표준 교실", labelEn: "Academy Classroom", widthM: 9, depthM: 10, ceilingHeightM: 3.2, indoor: true, floorMaterial: "warm-wood-parquet", backdropKind: "interior-walled" },
    keywords: ["교실", "칠판", "교탁", "학교", "창가 자리", "classroom", "chalkboard", "school desk", "homeroom"],
    tabletopHeightM: 0.74,
    essentialProps: [
      { assetKey: "prop-chalkboard-wall", labelKo: "대형 칠판·교탁", labelEn: "Chalkboard & Lectern", category: "architecture", position: [0, 0, -4.2], rotationYDeg: 0, scale: [4.2, 1.4, 0.4], footprintRadiusM: 0.9 },
      { assetKey: "prop-student-desk-row", labelKo: "창가 학생 책걸상", labelEn: "Window Student Desk Set", category: "furniture", position: [-2.4, 0, -0.8], rotationYDeg: 0, scale: [1.2, 0.74, 0.85], footprintRadiusM: 0.75 },
      { assetKey: "prop-student-desk-rear", labelKo: "후열 책걸상", labelEn: "Rear Student Desk Set", category: "furniture", position: [2.2, 0, 1.4], rotationYDeg: 0, scale: [1.2, 0.74, 0.85], footprintRadiusM: 0.75 },
      { assetKey: "prop-classroom-curtain", labelKo: "창가 화이트 커튼", labelEn: "Window Sheer Curtain", category: "atmospheric", position: [-4.1, 0, -0.5], rotationYDeg: 90, scale: [2.6, 2.4, 0.25], footprintRadiusM: 0.55 },
    ],
  },
  cafe: {
    spec: { presetId: "bg3d-cafe-atelier-v2", location: "cafe", labelKo: "채광 아틀리에 카페", labelEn: "Sunlit Atelier Cafe", widthM: 10, depthM: 9, ceilingHeightM: 3.5, indoor: true, floorMaterial: "terrazzo-tile", backdropKind: "interior-walled" },
    keywords: ["카페", "커피숍", "에스프레소", "디저트", "테이블", "cafe", "coffee shop", "bistro", "bakery"],
    tabletopHeightM: 0.75,
    essentialProps: [
      { assetKey: "prop-cafe-round-table", labelKo: "원형 우드 테이블", labelEn: "Round Wood Cafe Table", category: "furniture", position: [0, 0, -0.9], rotationYDeg: 0, scale: [0.95, 0.75, 0.95], footprintRadiusM: 0.65 },
      { assetKey: "prop-espresso-bar", labelKo: "에스프레소 바 카운터", labelEn: "Espresso Bar Counter", category: "architecture", position: [3.2, 0, -3.1], rotationYDeg: -15, scale: [2.8, 1.05, 0.8], footprintRadiusM: 1.1 },
      { assetKey: "prop-potted-ficus", labelKo: "창가 대형 화분", labelEn: "Potted Window Ficus", category: "atmospheric", position: [-3.4, 0, -2.5], rotationYDeg: 30, scale: [0.8, 1.8, 0.8], footprintRadiusM: 0.55 },
      { assetKey: "prop-menu-easel", labelKo: "우드 메뉴 이젤", labelEn: "Wooden Menu Easel", category: "furniture", position: [2.9, 0, 1.8], rotationYDeg: -35, scale: [0.65, 1.35, 0.5], footprintRadiusM: 0.5 },
    ],
  },
  alley_night: {
    spec: { presetId: "bg3d-neon-backstreet-v2", location: "alley_night", labelKo: "네온 뒷골목 거리", labelEn: "Neon Backstreet Alley", widthM: 7.5, depthM: 18, ceilingHeightM: 10, indoor: false, floorMaterial: "wet-asphalt", backdropKind: "city-skyline" },
    keywords: ["골목", "뒷골목", "네온", "가로등", "전봇대", "alley", "backstreet", "neon", "streetlamp", "narrow street"],
    tabletopHeightM: 0.9,
    essentialProps: [
      { assetKey: "prop-neon-signboard", labelKo: "세로 네온 간판", labelEn: "Vertical Neon Sign", category: "atmospheric", position: [-3.1, 0, -3.5], rotationYDeg: 90, scale: [0.45, 2.8, 0.9], footprintRadiusM: 0.6 },
      { assetKey: "prop-vending-machine", labelKo: "골목 자동판매기", labelEn: "Illuminated Vending Machine", category: "furniture", position: [2.8, 0, -2.2], rotationYDeg: -90, scale: [1.1, 1.9, 0.8], footprintRadiusM: 0.85 },
      { assetKey: "prop-utility-pole", labelKo: "전봇대·가로등", labelEn: "Utility Pole & Streetlamp", category: "architecture", position: [-2.8, 0, 1.6], rotationYDeg: 10, scale: [0.45, 5.2, 0.45], footprintRadiusM: 0.5 },
      { assetKey: "prop-stacked-crates", labelKo: "적재 플라스틱 상자", labelEn: "Stacked Delivery Crates", category: "furniture", position: [2.6, 0, 2.4], rotationYDeg: -20, scale: [1.0, 0.9, 0.75], footprintRadiusM: 0.7 },
    ],
  },
  office: {
    spec: { presetId: "bg3d-modern-office-v2", location: "office", labelKo: "도심 유리창 오피스", labelEn: "High-Rise Glass Office", widthM: 11, depthM: 10, ceilingHeightM: 3.1, indoor: true, floorMaterial: "acoustic-carpet-tile", backdropKind: "city-skyline" },
    keywords: ["사무실", "회의실", "오피스", "대표실", "회사", "office", "conference", "cubicle", "boardroom", "workplace"],
    tabletopHeightM: 0.75,
    essentialProps: [
      { assetKey: "prop-executive-desk", labelKo: "메인 오피스 데스크", labelEn: "Main Office Desk", category: "furniture", position: [0, 0, -1.8], rotationYDeg: 0, scale: [2.0, 0.75, 0.95], footprintRadiusM: 0.95 },
      { assetKey: "prop-glass-partition", labelKo: "유리 파티션 벽면", labelEn: "Frosted Glass Partition", category: "architecture", position: [3.8, 0, -0.4], rotationYDeg: -90, scale: [3.5, 2.7, 0.15], footprintRadiusM: 0.65 },
      { assetKey: "prop-file-cabinet", labelKo: "서류 캐비닛", labelEn: "Steel File Cabinet", category: "furniture", position: [-3.4, 0, -2.8], rotationYDeg: 15, scale: [0.9, 1.4, 0.55], footprintRadiusM: 0.65 },
    ],
  },
  bedroom: {
    spec: { presetId: "bg3d-studio-bedroom-v2", location: "bedroom", labelKo: "원룸·침실 작업 공간", labelEn: "Compact Studio Bedroom", widthM: 6.5, depthM: 7, ceilingHeightM: 2.7, indoor: true, floorMaterial: "oak-laminate", backdropKind: "interior-walled" },
    keywords: ["침실", "자취방", "원룸", "침대", "내 방", "bedroom", "apartment", "dorm", "bed", "my room"],
    tabletopHeightM: 0.72,
    essentialProps: [
      { assetKey: "prop-single-bed", labelKo: "싱글 침대 프레임", labelEn: "Single Bed Frame", category: "furniture", position: [-2.0, 0, -1.6], rotationYDeg: 0, scale: [1.2, 0.55, 2.05], footprintRadiusM: 1.05 },
      { assetKey: "prop-study-desk", labelKo: "창가 책상", labelEn: "Window Study Desk", category: "furniture", position: [2.1, 0, -1.9], rotationYDeg: -90, scale: [1.3, 0.72, 0.65], footprintRadiusM: 0.75 },
      { assetKey: "prop-bookshelf-tall", labelKo: "원목 책장", labelEn: "Tall Bookshelf", category: "furniture", position: [2.4, 0, 1.6], rotationYDeg: -90, scale: [0.95, 1.9, 0.38], footprintRadiusM: 0.6 },
    ],
  },
  subway_station: {
    spec: { presetId: "bg3d-metro-platform-v2", location: "subway_station", labelKo: "지하철 승강장 스크린도어", labelEn: "Subway Platform & Screen Doors", widthM: 16, depthM: 8, ceilingHeightM: 3.6, indoor: true, floorMaterial: "granite-tactile-tile", backdropKind: "interior-walled" },
    keywords: ["지하철", "승강장", "전철", "스크린도어", "개찰구", "subway", "metro", "platform", "train station"],
    tabletopHeightM: 0.5,
    essentialProps: [
      { assetKey: "prop-screen-door-wall", labelKo: "승강장 안전 스크린도어", labelEn: "Platform Screen Doors", category: "architecture", position: [0, 0, -3.2], rotationYDeg: 0, scale: [14, 2.5, 0.3], footprintRadiusM: 0.8 },
      { assetKey: "prop-station-bench", labelKo: "승강장 대기 벤치", labelEn: "Platform Waiting Bench", category: "furniture", position: [-3.5, 0, 1.2], rotationYDeg: 0, scale: [2.1, 0.5, 0.6], footprintRadiusM: 0.9 },
      { assetKey: "prop-route-lightbox", labelKo: "노선 안내 라이트박스", labelEn: "Transit Route Lightbox", category: "atmospheric", position: [3.8, 0, 1.5], rotationYDeg: -15, scale: [1.3, 2.2, 0.35], footprintRadiusM: 0.7 },
    ],
  },
  fantasy_throne: {
    spec: { presetId: "bg3d-fantasy-throne-hall-v2", location: "fantasy_throne", labelKo: "로판 왕궁 알현실", labelEn: "Imperial Throne Hall", widthM: 16, depthM: 20, ceilingHeightM: 9.5, indoor: true, floorMaterial: "polished-marble-carpet", backdropKind: "cathedral-vault" },
    keywords: ["왕좌", "궁전", "알현실", "성당", "황궁", "성", "throne", "palace", "castle", "cathedral", "imperial hall"],
    tabletopHeightM: 0.9,
    essentialProps: [
      { assetKey: "prop-gilded-throne", labelKo: "황금 왕좌 단상", labelEn: "Gilded Throne Dais", category: "architecture", position: [0, 0, -5.6], rotationYDeg: 0, scale: [2.8, 2.9, 2.2], footprintRadiusM: 1.5 },
      { assetKey: "prop-marble-pillar-l", labelKo: "좌측 대리석 열주", labelEn: "Left Marble Column", category: "architecture", position: [-4.4, 0, -1.8], rotationYDeg: 0, scale: [0.9, 8.5, 0.9], footprintRadiusM: 0.75 },
      { assetKey: "prop-marble-pillar-r", labelKo: "우측 대리석 열주", labelEn: "Right Marble Column", category: "architecture", position: [4.4, 0, -1.8], rotationYDeg: 0, scale: [0.9, 8.5, 0.9], footprintRadiusM: 0.75 },
      { assetKey: "prop-candelabra-stand", labelKo: "대형 촛대 스탠드", labelEn: "Tall Iron Candelabra", category: "atmospheric", position: [-3.1, 0, -4.3], rotationYDeg: 20, scale: [0.6, 2.1, 0.6], footprintRadiusM: 0.55 },
    ],
  },
  hospital_corridor: {
    spec: { presetId: "bg3d-hospital-corridor-v2", location: "hospital_corridor", labelKo: "병원 중앙 복도", labelEn: "Hospital Clinical Corridor", widthM: 6, depthM: 16, ceilingHeightM: 3.0, indoor: true, floorMaterial: "matte-vinyl-tile", backdropKind: "interior-walled" },
    keywords: ["병원", "병실", "응급실", "복도", "수술실", "hospital", "clinic", "ward", "emergency room"],
    tabletopHeightM: 0.85,
    essentialProps: [
      { assetKey: "prop-waiting-chairs", labelKo: "복도 대기 의자", labelEn: "Corridor Waiting Chairs", category: "furniture", position: [-2.1, 0, -1.6], rotationYDeg: 90, scale: [2.2, 0.82, 0.65], footprintRadiusM: 0.8 },
      { assetKey: "prop-medical-cart", labelKo: "이동식 의료 카트", labelEn: "Rolling Medical Cart", category: "furniture", position: [2.0, 0, -3.2], rotationYDeg: -80, scale: [0.8, 0.95, 0.55], footprintRadiusM: 0.6 },
      { assetKey: "prop-exit-sign-wall", labelKo: "병동 안내 사인", labelEn: "Ward Wayfinding Sign", category: "architecture", position: [2.2, 0, 2.1], rotationYDeg: -90, scale: [0.9, 2.2, 0.25], footprintRadiusM: 0.5 },
    ],
  },
  park_street: {
    spec: { presetId: "bg3d-park-boulevard-v2", location: "park_street", labelKo: "도심 공원 가로수길", labelEn: "City Park Tree-Lined Walkway", widthM: 15, depthM: 18, ceilingHeightM: 12, indoor: false, floorMaterial: "interlocking-paver", backdropKind: "sky-dome" },
    keywords: ["공원", "벚꽃", "가로수", "산책로", "벤치", "한강", "park", "cherry blossom", "boulevard", "riverside", "walkway"],
    tabletopHeightM: 0.48,
    essentialProps: [
      { assetKey: "prop-park-wood-bench", labelKo: "공원 목재 벤치", labelEn: "Wooden Park Bench", category: "furniture", position: [-2.7, 0, -1.8], rotationYDeg: 25, scale: [1.8, 0.8, 0.65], footprintRadiusM: 0.9 },
      { assetKey: "prop-blossom-tree", labelKo: "가로수 나무", labelEn: "Boulevard Shade Tree", category: "atmospheric", position: [3.6, 0, -3.0], rotationYDeg: 0, scale: [2.2, 4.8, 2.2], footprintRadiusM: 1.1 },
      { assetKey: "prop-park-bollard-lamp", labelKo: "산책로 볼라드 조명", labelEn: "Park Bollard Lamp", category: "atmospheric", position: [2.6, 0, 1.5], rotationYDeg: 0, scale: [0.35, 1.2, 0.35], footprintRadiusM: 0.45 },
    ],
  },
};

export const DYNAMIC_PROP_RULES: readonly DynamicPropRule[] = [
  { key: "umbrella", assetKey: "prop-transparent-umbrella", labelKo: "투명 우산", labelEn: "Clear Umbrella", keywords: ["우산", "umbrella"], onTabletop: false, preferredOffset: [1.4, 1.1], scale: [0.95, 0.9, 0.95], footprintRadiusM: 0.42 },
  { key: "coffee", assetKey: "prop-coffee-cup-pair", labelKo: "커피 잔 세트", labelEn: "Coffee Cup Pair", keywords: ["커피", "라떼", "아메리카노", "머그", "coffee", "latte", "espresso", "tea cup"], onTabletop: true, preferredOffset: [0.15, -0.85], scale: [0.22, 0.14, 0.22], footprintRadiusM: 0.25 },
  { key: "smartphone", assetKey: "prop-smartphone-glow", labelKo: "스마트폰", labelEn: "Smartphone", keywords: ["스마트폰", "핸드폰", "휴대폰", "문자", "phone", "smartphone", "text message"], onTabletop: true, preferredOffset: [-0.28, -0.75], scale: [0.09, 0.02, 0.16], footprintRadiusM: 0.2 },
  { key: "sword", assetKey: "prop-longsword-sheathed", labelKo: "장검·칼집", labelEn: "Sheathed Longsword", keywords: ["칼", "검", "단검", "도검", "sword", "blade", "katana", "dagger"], onTabletop: false, preferredOffset: [-1.7, -1.0], scale: [0.18, 1.15, 0.12], footprintRadiusM: 0.45 },
  { key: "laptop", assetKey: "prop-open-laptop", labelKo: "열린 노트북", labelEn: "Open Laptop", keywords: ["노트북", "랩톱", "모니터", "laptop", "notebook pc", "computer"], onTabletop: true, preferredOffset: [0.25, -1.65], scale: [0.38, 0.26, 0.28], footprintRadiusM: 0.3 },
  { key: "bouquet", assetKey: "prop-flower-bouquet", labelKo: "꽃다발", labelEn: "Flower Bouquet", keywords: ["꽃다발", "장미", "꽃", "bouquet", "flowers", "roses"], onTabletop: true, preferredOffset: [0.3, -0.85], scale: [0.35, 0.45, 0.35], footprintRadiusM: 0.3 },
  { key: "letter", assetKey: "prop-wax-sealed-letter", labelKo: "봉인 편지", labelEn: "Wax-Sealed Letter", keywords: ["편지", "서신", "쪽지", "봉투", "letter", "envelope", "note"], onTabletop: true, preferredOffset: [-0.15, -0.85], scale: [0.22, 0.02, 0.14], footprintRadiusM: 0.22 },
  { key: "bag", assetKey: "prop-school-messenger-bag", labelKo: "가방·서류가방", labelEn: "Messenger / School Bag", keywords: ["가방", "백팩", "서류가방", "bag", "backpack", "briefcase"], onTabletop: false, preferredOffset: [1.8, -1.1], scale: [0.42, 0.38, 0.24], footprintRadiusM: 0.4 },
];

export const TIME_KEYWORDS: Readonly<Record<StagingTimeOfDay, readonly string[]>> = {
  dawn: ["새벽", "동틀", "여명", "해 뜨기", "dawn", "daybreak", "early sunrise"],
  morning: ["아침", "등교", "오전", "상쾌한 햇살", "morning", "sunrise", "early day"],
  noon: ["정오", "한낮", "대낮", "맑은 낮", "noon", "midday", "afternoon sun"],
  sunset: ["노을", "해질녘", "석양", "황혼", "방과 후", "붉은 하늘", "sunset", "golden hour", "dusk", "twilight"],
  night: ["밤", "심야", "자정", "달빛", "야경", "네온", "어둠", "night", "midnight", "moonlight", "neon"],
  rainy_overcast: ["비", "폭우", "빗소리", "장마", "우산", "흐린", "먹구름", "rain", "downpour", "storm", "overcast", "drizzle"],
};

export const EMOTION_KEYWORDS: Readonly<Record<StagingEmotionMood, readonly string[]>> = {
  tension: ["긴장", "대치", "위협", "불안", "숨막", "경계", "노려", "tension", "confront", "standoff", "suspense", "threat", "freeze"],
  romance: ["설렘", "고백", "두근", "미소", "애틋", "손을 잡", "눈이 마주", "romance", "confess", "blush", "tender", "warm smile", "heartbeat"],
  melancholy: ["슬픔", "눈물", "이별", "고독", "쓸쓸", "울먹", "외로", "melancholy", "tears", "farewell", "lonely", "grief", "heartbreak"],
  action: ["질주", "전투", "추격", "격돌", "도약", "폭발", "달려", "싸움", "action", "chase", "sprint", "clash", "battle", "leap", "impact"],
  comedy: ["당황", "황당", "웃음", "코믹", "허당", "기겁", "comedy", "awkward", "panic", "hilarious", "laugh"],
  mystery: ["비밀", "단서", "의심", "그림자", "수상", "실종", "mystery", "clue", "secret", "eerie", "shadowy", "investigate"],
  calm_daily: ["일상", "평온", "차분", "대화", "휴식", "커피를 마시", "calm", "peaceful", "casual", "daily", "quiet chat"],
};

export const DEMO_WEBTOON_SCRIPTS: readonly DemoWebtoonScriptPreset[] = [
  {
    id: "ko-rooftop-standoff",
    titleKo: "옥상 비 오는 밤 대치 (KO)",
    titleEn: "Rainy Night Rooftop Standoff (KO)",
    scriptText: [
      "[S#1] 학교 옥상. 폭우가 쏟아지는 밤, 두 사람이 철망 난간 앞에서 긴장감 속에 대치한다.",
      "투명 우산이 바닥에 굴러다니고, 유진은 손에 스마트폰을 꽉 쥐고 있다.",
      "유진: 그 편지를 숨긴 이유가 뭐야?",
      "서준: 지금 말하면 네가 위험해져.",
    ].join("\n"),
  },
  {
    id: "ko-sunset-cafe-confession",
    titleKo: "노을 카페 고백 (KO)",
    titleEn: "Sunset Cafe Confession (KO)",
    scriptText: [
      "[S#1] 해질녘 붉은 노을이 들어오는 아틀리에 카페 창가 테이블.",
      "따뜻한 커피 잔 두 개와 작은 꽃다발이 놓여 있다. 두 사람이 설렘 속에 눈이 마주친다.",
      "하린: 오늘 꼭 하고 싶었던 말이 있어.",
      "도윤: 나도 같은 마음이었어.",
    ].join("\n"),
  },
  {
    id: "en-neon-alley-chase",
    titleKo: "네온 뒷골목 액션 추격 (EN)",
    titleEn: "Neon Alley Chase & Throne Clue (EN)",
    scriptText: [
      "Scene 1: Rainy midnight neon backstreet alley. Three agents sprint past glowing signs during a tense action chase with a sword and backpack.",
      "KAI: Cut them off before the subway platform!",
      "SORA: I see the clue near the vending machine!",
      "Scene 2: Dawn inside the imperial palace throne hall. Alone before the marble columns, KAI opens a wax-sealed letter in quiet melancholy.",
    ].join("\n"),
  },
];
