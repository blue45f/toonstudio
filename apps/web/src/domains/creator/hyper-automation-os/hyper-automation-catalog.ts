export type AutomationSpectrumMode = "manual-pro-0" | "assist-50" | "hyper-auto-99";

export type WebtoonGenre =
  | "action-fantasy"
  | "romance-drama"
  | "thriller-noir"
  | "slice-of-life"
  | "sf-cyberpunk"
  | "historical-fusion";

export type WebtoonArtStyle =
  | "cinematic-ink"
  | "watercolor-pastel"
  | "high-contrast-noir"
  | "cel-vivid"
  | "painterly-webtoon";

export type TargetWebtoonPlatform =
  | "naver-webtoon"
  | "kakao-page"
  | "lezhin"
  | "webtoon-global"
  | "piccoma"
  | "tapas";

export type OptionalBriefField =
  | "genre"
  | "artStyle"
  | "characterCount"
  | "protagonistProfile"
  | "backgroundTheme"
  | "cutCount"
  | "targetPlatform";

export type PipelineStageId =
  | "story-plot"
  | "director-storyboard"
  | "rough-cleanup"
  | "scene-3d-blocking"
  | "one-tap-coloring"
  | "lighting-harmonizer"
  | "nlp-vfx-lettering"
  | "platform-preflight"
  | "layered-master-output";

export type MasterLayerId =
  | "01_BG_3D"
  | "02_LINE_VECTOR"
  | "03_FLAT_COLOR"
  | "04_SHADE_LIGHT"
  | "05_VFX_LINES"
  | "06_SPEECH_SFX";

export type LayerBlendMode = "normal" | "multiply" | "screen" | "overlay";

export type PipelineStageStatus = "idle" | "generated" | "manual-edited" | "locked-protected";

export type StageAutonomyMap = Readonly<Record<PipelineStageId, number>>;

export interface ArtistAutonomyPreset {
  readonly id: string;
  readonly name: string;
  readonly builtIn: boolean;
  readonly stageAutonomy: StageAutonomyMap;
  readonly averagePercent: number;
}

export interface AutomationSpectrumProfile {
  readonly mode: AutomationSpectrumMode;
  readonly percent: 0 | 50 | 99;
  readonly label: string;
  readonly shortLabel: string;
  readonly summary: string;
  readonly ctaLabel: string;
  readonly manualGuarantee: string;
  readonly defaultLockedStages: readonly PipelineStageId[];
}

export interface OklchSwatch {
  readonly role: string;
  readonly label: string;
  readonly value: string;
}

export interface GenreBlueprint {
  readonly keywords: readonly string[];
  readonly defaultStyle: WebtoonArtStyle;
  readonly defaultCharacterCount: number;
  readonly defaultCutCount: number;
  readonly defaultPlatform: TargetWebtoonPlatform;
  readonly protagonistTemplate: string;
  readonly backgroundTheme: string;
  readonly swatches: readonly OklchSwatch[];
  readonly sfxPool: readonly string[];
  readonly speedLinePreset: string;
  readonly emotionFont: string;
  readonly perspective: "1-point" | "2-point" | "3-point-dramatic";
}

export const MIN_CUT_COUNT = 4;
export const MAX_CUT_COUNT = 60;
export const MIN_AUTONOMY_PERCENT = 0;
export const MAX_AUTONOMY_PERCENT = 99;

const ARTIST_PRESET_STORAGE_KEY = "toonstudio.hyper-auto.artist-autonomy-presets.v1";

const PIPELINE_STAGE_ORDER: readonly PipelineStageId[] = [
  "story-plot",
  "director-storyboard",
  "rough-cleanup",
  "scene-3d-blocking",
  "one-tap-coloring",
  "lighting-harmonizer",
  "nlp-vfx-lettering",
  "platform-preflight",
  "layered-master-output",
];

export const MASTER_LAYER_ORDER: readonly MasterLayerId[] = [
  "01_BG_3D",
  "02_LINE_VECTOR",
  "03_FLAT_COLOR",
  "04_SHADE_LIGHT",
  "05_VFX_LINES",
  "06_SPEECH_SFX",
];

export const DEFAULT_STAGE_AUTONOMY_BY_MODE: Readonly<Record<AutomationSpectrumMode, StageAutonomyMap>> = {
  "manual-pro-0": {
    "story-plot": 0,
    "director-storyboard": 0,
    "rough-cleanup": 0,
    "scene-3d-blocking": 0,
    "one-tap-coloring": 0,
    "lighting-harmonizer": 0,
    "nlp-vfx-lettering": 0,
    "platform-preflight": 0,
    "layered-master-output": 0,
  },
  "assist-50": {
    "story-plot": 30,
    "director-storyboard": 40,
    "rough-cleanup": 0,
    "scene-3d-blocking": 95,
    "one-tap-coloring": 85,
    "lighting-harmonizer": 85,
    "nlp-vfx-lettering": 55,
    "platform-preflight": 60,
    "layered-master-output": 0,
  },
  "hyper-auto-99": {
    "story-plot": 99,
    "director-storyboard": 99,
    "rough-cleanup": 99,
    "scene-3d-blocking": 99,
    "one-tap-coloring": 99,
    "lighting-harmonizer": 99,
    "nlp-vfx-lettering": 99,
    "platform-preflight": 99,
    "layered-master-output": 99,
  },
};

export const BUILT_IN_ARTIST_PRESETS: readonly ArtistAutonomyPreset[] = [
  {
    id: "builtin-pro-line-manual",
    name: "작가 선화 수동 · 채색 85% · 배경 95%",
    builtIn: true,
    stageAutonomy: DEFAULT_STAGE_AUTONOMY_BY_MODE["assist-50"],
    averagePercent: 50,
  },
  {
    id: "builtin-director-focus",
    name: "스토리·연출 직접 + 마감 자동화",
    builtIn: true,
    stageAutonomy: {
      "story-plot": 0,
      "director-storyboard": 0,
      "rough-cleanup": 35,
      "scene-3d-blocking": 90,
      "one-tap-coloring": 90,
      "lighting-harmonizer": 90,
      "nlp-vfx-lettering": 85,
      "platform-preflight": 95,
      "layered-master-output": 55,
    },
    averagePercent: 60,
  },
  {
    id: "builtin-deadline-turbo",
    name: "마감 급행 하이퍼 (선화 45% · 나머지 95~99%)",
    builtIn: true,
    stageAutonomy: {
      "story-plot": 95,
      "director-storyboard": 95,
      "rough-cleanup": 45,
      "scene-3d-blocking": 99,
      "one-tap-coloring": 95,
      "lighting-harmonizer": 99,
      "nlp-vfx-lettering": 95,
      "platform-preflight": 99,
      "layered-master-output": 99,
    },
    averagePercent: 91,
  },
];

export const AUTOMATION_SPECTRUM_PROFILES: readonly AutomationSpectrumProfile[] = [
  {
    mode: "manual-pro-0",
    percent: 0,
    label: "수동 프로 0%",
    shortLabel: "0% 수동 프로",
    summary: "작가가 선화·연출·채색을 직접 통제합니다. AI는 요청한 단계에만 보조로 개입합니다.",
    ctaLabel: "수동 프로 6계층 작업대 열기",
    manualGuarantee: "자동 덮어쓰기 0% · 6계층 레이어 즉시 수동 작화",
    defaultLockedStages: ["director-storyboard", "rough-cleanup", "one-tap-coloring"],
  },
  {
    mode: "assist-50",
    percent: 50,
    label: "프로 어시스트 50%",
    shortLabel: "50% 프로 어시스트",
    summary: "스토리 30%·선화 0%는 작가가 주도하고, 배경 95%·밑색·명암 85%를 AI가 분담합니다.",
    ctaLabel: "50% 프로 어시스트 실행",
    manualGuarantee: "잠근 단계 100% 보호 · 공정별 0~99% 자유 조합",
    defaultLockedStages: ["story-plot", "rough-cleanup"],
  },
  {
    mode: "hyper-auto-99",
    percent: 99,
    label: "99% 원클릭 완자동",
    shortLabel: "99% 원클릭 완자동",
    summary: "아이디어 한 줄만으로 빈칸 추론부터 9단계 파이프라인·6계층 마스터 출력까지 한 번에 완주합니다.",
    ctaLabel: "원클릭 99% 웹툰 생성",
    manualGuarantee: "생성 직후 6계층 분리 레이어 100% 수동 편집 개방",
    defaultLockedStages: [],
  },
];

export const GENRE_OPTIONS: readonly { readonly value: WebtoonGenre; readonly label: string }[] = [
  { value: "action-fantasy", label: "액션 판타지" },
  { value: "romance-drama", label: "로맨스 드라마" },
  { value: "thriller-noir", label: "스릴러 느와르" },
  { value: "slice-of-life", label: "일상 힐링" },
  { value: "sf-cyberpunk", label: "SF 사이버펑크" },
  { value: "historical-fusion", label: "퓨전 사극·무협" },
];

export const ART_STYLE_OPTIONS: readonly { readonly value: WebtoonArtStyle; readonly label: string }[] = [
  { value: "cinematic-ink", label: "시네마틱 잉크" },
  { value: "watercolor-pastel", label: "수채 파스텔" },
  { value: "high-contrast-noir", label: "고대비 느와르" },
  { value: "cel-vivid", label: "선명 셀 채색" },
  { value: "painterly-webtoon", label: "회화풍 웹툰" },
];

export const PLATFORM_OPTIONS: readonly { readonly value: TargetWebtoonPlatform; readonly label: string }[] = [
  { value: "naver-webtoon", label: "네이버 웹툰" },
  { value: "kakao-page", label: "카카오페이지" },
  { value: "lezhin", label: "레진코믹스" },
  { value: "webtoon-global", label: "WEBTOON Global" },
  { value: "piccoma", label: "픽코마" },
  { value: "tapas", label: "Tapas" },
];

export const STAGE_META: readonly {
  readonly id: PipelineStageId;
  readonly order: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  readonly title: string;
  readonly subtitle: string;
}[] = [
  { id: "story-plot", order: 1, title: "스토리·플롯 설계", subtitle: "3막 구성 · 회차 로그라인 · 클라이맥스 훅" },
  { id: "director-storyboard", order: 2, title: "연출·스토리보드", subtitle: "컷별 구도 · 렌즈 · 감정 텐션 · 시선 동선" },
  { id: "rough-cleanup", order: 3, title: "선화 클린업", subtitle: "떨림 보정 벡터 선화 · 필압 테이퍼 정제" },
  { id: "scene-3d-blocking", order: 4, title: "3D 배경·포즈 블로킹", subtitle: "3D 공간 매칭 · 캐릭터 포즈 · 원근 락" },
  { id: "one-tap-coloring", order: 5, title: "원탭 OKLCH 채색", subtitle: "팔레트 락 기반 밑색 · 명암 · 하이라이트" },
  { id: "lighting-harmonizer", order: 6, title: "광원 통합 후보정", subtitle: "3D 라이트볼 방위각·고도각 · 림 라이트 + 접촉 그림자" },
  { id: "nlp-vfx-lettering", order: 7, title: "연출·식자·효과선", subtitle: "자연어 연출 → 효과선 · 말풍선 · SFX 배치" },
  { id: "platform-preflight", order: 8, title: "6대 플랫폼 규격 검수", subtitle: "모바일 가독성 · 6대 플랫폼 규격 검증/교정" },
  { id: "layered-master-output", order: 9, title: "6계층 마스터 출력", subtitle: "완성 웹툰 멀티컷 + 100% 수동 분리 레이어 개방" },
];

export const PLATFORM_SPEC_TABLE: readonly {
  readonly platform: TargetWebtoonPlatform;
  readonly name: string;
  readonly targetWidthPx: number;
  readonly sliceMaxHeightPx: number;
  readonly ruleNote: string;
}[] = [
  { platform: "naver-webtoon", name: "네이버 웹툰", targetWidthPx: 690, sliceMaxHeightPx: 1600, ruleNote: "690px 세로 스크롤 · 컷 여백 최적화" },
  { platform: "kakao-page", name: "카카오페이지", targetWidthPx: 720, sliceMaxHeightPx: 1440, ruleNote: "720px 모바일 기준 · 말풍선 가독성 검증" },
  { platform: "lezhin", name: "레진코믹스", targetWidthPx: 1080, sliceMaxHeightPx: 1600, ruleNote: "고해상도 원고 · 톤 깨짐 방지" },
  { platform: "webtoon-global", name: "WEBTOON Global", targetWidthPx: 800, sliceMaxHeightPx: 1280, ruleNote: "800×1280px 슬라이스 · 다국어 식자 여유 폭" },
  { platform: "piccoma", name: "픽코마", targetWidthPx: 800, sliceMaxHeightPx: 1280, ruleNote: "Smartoon 규격 · 세로 읽기 리듬" },
  { platform: "tapas", name: "Tapas", targetWidthPx: 940, sliceMaxHeightPx: 1400, ruleNote: "940px 폭 · 슬라이스 용량 2MB 이내" },
];

export const GENRE_BLUEPRINTS: Readonly<Record<WebtoonGenre, GenreBlueprint>> = {
  "action-fantasy": {
    keywords: ["던전", "헌터", "마법", "검", "각성", "회귀", "보스", "길드", "액션", "판타지", "용사", "레이드"],
    defaultStyle: "cinematic-ink",
    defaultCharacterCount: 3,
    defaultCutCount: 24,
    defaultPlatform: "naver-webtoon",
    protagonistTemplate: "숨겨진 각성 능력을 깨달은 20대 초반 주인공",
    backgroundTheme: "균열이 열린 도심 상공과 석조 아레나",
    swatches: [
      { role: "bg-base", label: "배경 심도", value: "oklch(0.24 0.03 255)" },
      { role: "hero-key", label: "주인공 키", value: "oklch(0.74 0.14 48)" },
      { role: "shadow", label: "명암 그림자", value: "oklch(0.32 0.05 268)" },
      { role: "rim-light", label: "림 라이트", value: "oklch(0.84 0.13 85)" },
      { role: "vfx-accent", label: "효과 포인트", value: "oklch(0.68 0.21 32)" },
    ],
    sfxPool: ["콰직!", "스릉—", "쿠구궁!", "번쩍!"],
    speedLinePreset: "집중선 32도 방사형 + 파편 모션 블러",
    emotionFont: "강타 붓글씨 헤드라인 + 고대비 대화체",
    perspective: "3-point-dramatic",
  },
  "romance-drama": {
    keywords: ["로맨스", "사랑", "첫사랑", "결혼", "연애", "고백", "재회", "캠퍼스", "설렘", "이별", "대표", "계약"],
    defaultStyle: "watercolor-pastel",
    defaultCharacterCount: 2,
    defaultCutCount: 18,
    defaultPlatform: "kakao-page",
    protagonistTemplate: "감정을 숨긴 채 새 계절을 맞는 섬세한 주인공",
    backgroundTheme: "노을이 스며드는 유리 온실과 가로수길 카페",
    swatches: [
      { role: "bg-base", label: "배경 심도", value: "oklch(0.88 0.03 65)" },
      { role: "hero-key", label: "주인공 키", value: "oklch(0.76 0.11 22)" },
      { role: "shadow", label: "명암 그림자", value: "oklch(0.54 0.06 320)" },
      { role: "rim-light", label: "림 라이트", value: "oklch(0.92 0.08 82)" },
      { role: "vfx-accent", label: "효과 포인트", value: "oklch(0.75 0.15 352)" },
    ],
    sfxPool: ["두근…", "살랑—", "톡,", "반짝"],
    speedLinePreset: "보케 꽃잎 파티클 + 소프트 블룸 톤",
    emotionFont: "부드러운 명조 본문 + 손글씨 속마음체",
    perspective: "1-point",
  },
  "thriller-noir": {
    keywords: ["추리", "살인", "탐정", "미스터리", "느와르", "형사", "공포", "실종", "비밀", "범인", "심리", "사건"],
    defaultStyle: "high-contrast-noir",
    defaultCharacterCount: 3,
    defaultCutCount: 20,
    defaultPlatform: "lezhin",
    protagonistTemplate: "단서 하나를 놓치지 않는 냉철한 추적자",
    backgroundTheme: "비 젖은 골목과 형광등이 깜박이는 취조실",
    swatches: [
      { role: "bg-base", label: "배경 심도", value: "oklch(0.18 0.02 245)" },
      { role: "hero-key", label: "주인공 키", value: "oklch(0.68 0.06 72)" },
      { role: "shadow", label: "명암 그림자", value: "oklch(0.14 0.015 260)" },
      { role: "rim-light", label: "림 라이트", value: "oklch(0.78 0.12 215)" },
      { role: "vfx-accent", label: "효과 포인트", value: "oklch(0.62 0.21 24)" },
    ],
    sfxPool: ["철컥…", "타닥—", "스윽", "삐—"],
    speedLinePreset: "거친 잉크 스크래치 + 수직 압박 음영",
    emotionFont: "날카로운 각진 고딕 + 떨림 강조 SFX",
    perspective: "2-point",
  },
  "slice-of-life": {
    keywords: ["일상", "카페", "고양이", "자취", "힐링", "요리", "직장", "가족", "친구", "빵집", "산책", "강아지"],
    defaultStyle: "cel-vivid",
    defaultCharacterCount: 2,
    defaultCutCount: 12,
    defaultPlatform: "naver-webtoon",
    protagonistTemplate: "작은 습관으로 하루를 채우는 다정한 이웃 주인공",
    backgroundTheme: "아침 햇살이 드는 동네 작업실과 골목 식탁",
    swatches: [
      { role: "bg-base", label: "배경 심도", value: "oklch(0.91 0.025 88)" },
      { role: "hero-key", label: "주인공 키", value: "oklch(0.73 0.13 58)" },
      { role: "shadow", label: "명암 그림자", value: "oklch(0.58 0.05 235)" },
      { role: "rim-light", label: "림 라이트", value: "oklch(0.94 0.06 95)" },
      { role: "vfx-accent", label: "효과 포인트", value: "oklch(0.74 0.14 148)" },
    ],
    sfxPool: ["보글보글", "사각사각", "퐁!", "후—"],
    speedLinePreset: "따뜻한 점묘 하이라이트 + 손그림 리듬선",
    emotionFont: "둥근 산세리프 대화체 + 포근한 메모체",
    perspective: "1-point",
  },
  "sf-cyberpunk": {
    keywords: ["사이버", "우주", "로봇", "인공지능", "ai", "미래", "네온", "디스토피아", "sf", "해커", "메카", "안드로이드"],
    defaultStyle: "cinematic-ink",
    defaultCharacterCount: 3,
    defaultCutCount: 24,
    defaultPlatform: "webtoon-global",
    protagonistTemplate: "기억 칩 오류 속에서 진실을 쫓는 프로토콜 엔지니어",
    backgroundTheme: "비가 흩날리는 2099년 네온 메가시티 옥상과 홀로그램 복도",
    swatches: [
      { role: "bg-base", label: "배경 심도", value: "oklch(0.2 0.04 262)" },
      { role: "hero-key", label: "주인공 키", value: "oklch(0.77 0.14 205)" },
      { role: "shadow", label: "명암 그림자", value: "oklch(0.26 0.05 280)" },
      { role: "rim-light", label: "림 라이트", value: "oklch(0.82 0.16 188)" },
      { role: "vfx-accent", label: "효과 포인트", value: "oklch(0.71 0.2 38)" },
    ],
    sfxPool: ["지지직—", "윙!", "데이터 락!", "파직!"],
    speedLinePreset: "시안 스캔라인 + 광학 애너모픽 플레어",
    emotionFont: "테크 모노 HUD + 선명 산세리프 대사체",
    perspective: "3-point-dramatic",
  },
  "historical-fusion": {
    keywords: ["조선", "무림", "무협", "궁궐", "사극", "검객", "도사", "황실", "화산", "마교", "한옥", "천하"],
    defaultStyle: "painterly-webtoon",
    defaultCharacterCount: 3,
    defaultCutCount: 22,
    defaultPlatform: "piccoma",
    protagonistTemplate: "잊힌 비급의 마지막 계승자이자 고독한 검객",
    backgroundTheme: "안개가 감도는 대나무 숲과 단청 기와 누각",
    swatches: [
      { role: "bg-base", label: "배경 심도", value: "oklch(0.26 0.025 145)" },
      { role: "hero-key", label: "주인공 키", value: "oklch(0.72 0.12 45)" },
      { role: "shadow", label: "명암 그림자", value: "oklch(0.22 0.03 230)" },
      { role: "rim-light", label: "림 라이트", value: "oklch(0.88 0.09 86)" },
      { role: "vfx-accent", label: "효과 포인트", value: "oklch(0.64 0.19 28)" },
    ],
    sfxPool: ["촤악—", "휘이잉", "쨍!", "파공!"],
    speedLinePreset: "수묵 번짐 검기 궤적 + 먹물 튐 브러시",
    emotionFont: "유려한 궁서 필체 + 단정한 명조 본문",
    perspective: "2-point",
  },
};

export function clampAutonomyPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(MAX_AUTONOMY_PERCENT, Math.max(MIN_AUTONOMY_PERCENT, Math.round(value)));
}

export function normalizeStageAutonomy(
  base: StageAutonomyMap,
  overrides?: Partial<StageAutonomyMap>,
): StageAutonomyMap {
  return {
    "story-plot": clampAutonomyPercent(overrides?.["story-plot"] ?? base["story-plot"]),
    "director-storyboard": clampAutonomyPercent(overrides?.["director-storyboard"] ?? base["director-storyboard"]),
    "rough-cleanup": clampAutonomyPercent(overrides?.["rough-cleanup"] ?? base["rough-cleanup"]),
    "scene-3d-blocking": clampAutonomyPercent(overrides?.["scene-3d-blocking"] ?? base["scene-3d-blocking"]),
    "one-tap-coloring": clampAutonomyPercent(overrides?.["one-tap-coloring"] ?? base["one-tap-coloring"]),
    "lighting-harmonizer": clampAutonomyPercent(overrides?.["lighting-harmonizer"] ?? base["lighting-harmonizer"]),
    "nlp-vfx-lettering": clampAutonomyPercent(overrides?.["nlp-vfx-lettering"] ?? base["nlp-vfx-lettering"]),
    "platform-preflight": clampAutonomyPercent(overrides?.["platform-preflight"] ?? base["platform-preflight"]),
    "layered-master-output": clampAutonomyPercent(overrides?.["layered-master-output"] ?? base["layered-master-output"]),
  };
}

export function computeAverageAutonomyPercent(stageAutonomy: StageAutonomyMap): number {
  const sum = PIPELINE_STAGE_ORDER.reduce((acc, stageId) => acc + clampAutonomyPercent(stageAutonomy[stageId]), 0);
  return Math.round(sum / PIPELINE_STAGE_ORDER.length);
}

export function createArtistAutonomyPreset(
  name: string,
  stageAutonomy: StageAutonomyMap,
  indexSuffix = 1,
): ArtistAutonomyPreset {
  const normalized = normalizeStageAutonomy(stageAutonomy);
  const cleanName = name.trim() || `작가 커스텀 프리셋 #${indexSuffix}`;
  return {
    id: `artist-preset-${Date.now().toString(36)}-${indexSuffix}`,
    name: cleanName,
    builtIn: false,
    stageAutonomy: normalized,
    averagePercent: computeAverageAutonomyPercent(normalized),
  };
}

export function loadSavedArtistAutonomyPresets(): readonly ArtistAutonomyPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ARTIST_PRESET_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const results: ArtistAutonomyPreset[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item === "object" &&
        "id" in item &&
        "name" in item &&
        "stageAutonomy" in item &&
        typeof item.id === "string" &&
        typeof item.name === "string" &&
        item.stageAutonomy &&
        typeof item.stageAutonomy === "object"
      ) {
        const normalized = normalizeStageAutonomy(
          DEFAULT_STAGE_AUTONOMY_BY_MODE["assist-50"],
          item.stageAutonomy as Partial<StageAutonomyMap>,
        );
        results.push({
          id: item.id,
          name: item.name,
          builtIn: false,
          stageAutonomy: normalized,
          averagePercent: computeAverageAutonomyPercent(normalized),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export function saveArtistAutonomyPresets(presets: readonly ArtistAutonomyPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    const customOnly = presets.filter((preset) => !preset.builtIn);
    window.localStorage.setItem(ARTIST_PRESET_STORAGE_KEY, JSON.stringify(customOnly));
  } catch {
    // 저장소 제한 환경에서는 메모리 상태로만 유지한다.
  }
}
