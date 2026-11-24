/**
 * Wave 38B — 일상어·초성·영문 명령 팔레트(⌘K) · 플로팅 미니맵 검수 ·
 * 비주얼 언두 필름스트립 타입 계약 및 카탈로그 정의.
 */

export type CanvasCommandCategory =
  | "drawing"
  | "view"
  | "inspect"
  | "scene"
  | "lettering"
  | "layer"
  | "history";

export type MinimapInspectionMode =
  | "normal"
  | "grayscale-value"
  | "silhouette-contrast"
  | "dark-reader";

export interface CanvasCommandItem {
  readonly id: string;
  readonly titleKo: string;
  readonly subtitleKo: string;
  readonly everydayAliasesKo: readonly string[];
  readonly englishAliases: readonly string[];
  readonly category: CanvasCommandCategory;
  readonly categoryLabelKo: string;
  readonly shortcut: string;
  readonly relatedInspectionMode?: MinimapInspectionMode;
  readonly relatedToolId?: string;
}

export interface CommandUsageRecord {
  readonly commandId: string;
  readonly lastUsedAtMs: number;
  readonly useCount: number;
}

export type CommandMatchKind =
  | "exact"
  | "everyday-ko"
  | "choseong"
  | "english"
  | "fuzzy"
  | "recent";

export interface RankedCanvasCommand {
  readonly command: CanvasCommandItem;
  readonly score: number;
  readonly baseScore: number;
  readonly recencyBoost: number;
  readonly matchKind: CommandMatchKind;
  readonly matchBadgeKo: string;
  readonly matchedPhrase: string;
}

export interface MinimapInspectionState {
  readonly canvasWidth: number;
  readonly canvasHeight: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly panX: number;
  readonly panY: number;
  readonly zoomPct: number;
  readonly flippedHorizontal: boolean;
  readonly inspectionMode: MinimapInspectionMode;
  readonly silhouetteThresholdPct: number;
}

export interface MinimapViewportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly visibleCoveragePct: number;
}

export interface ValueContrastAudit {
  readonly darkRatioPct: number;
  readonly midRatioPct: number;
  readonly lightRatioPct: number;
  readonly silhouetteSeparationScore: number;
  readonly verdictKo: string;
  readonly tone: "good" | "warn" | "bad";
}

export type FilmstripBandTone = "fg" | "fg-2" | "accent" | "cool" | "warn" | "raised";

export interface FilmstripThumbnailBand {
  readonly xPct: number;
  readonly yPct: number;
  readonly wPct: number;
  readonly hPct: number;
  readonly tone: FilmstripBandTone;
  readonly opacity: number;
}

export interface UndoFilmstripEntry {
  readonly id: string;
  readonly seq: number;
  readonly labelKo: string;
  readonly toolLabelKo: string;
  readonly timestampLabel: string;
  readonly strokeCount: number;
  readonly activeLayerName: string;
  readonly deltaSummaryKo: string;
  readonly thumbnailBands: readonly FilmstripThumbnailBand[];
}

export interface UndoFilmstripState {
  readonly entries: readonly UndoFilmstripEntry[];
  readonly cursorIndex: number;
  readonly previewIndex: number | null;
  readonly maxEntries: number;
  readonly lastJumpDelta: number;
  readonly lastStatusKo: string;
}

export const MINIMAP_INSPECTION_META: Readonly<
  Record<
    MinimapInspectionMode,
    {
      readonly labelKo: string;
      readonly shortLabelKo: string;
      readonly summaryKo: string;
    }
  >
> = {
  normal: {
    labelKo: "컬러 원본",
    shortLabelKo: "원본",
    summaryKo: "실제 채색 색감 그대로 확인 중이에요",
  },
  "grayscale-value": {
    labelKo: "명도 흑백 검수",
    shortLabelKo: "흑백 명도",
    summaryKo: "채도를 빼고 명암 대비와 시선 집중도를 점검해요",
  },
  "silhouette-contrast": {
    labelKo: "실루엣 고대비 검수",
    shortLabelKo: "실루엣",
    summaryKo: "인물 윤곽이 배경과 또렷이 분리되는지 확인해요",
  },
  "dark-reader": {
    labelKo: "다크모드 독자 검수",
    shortLabelKo: "다크모드",
    summaryKo: "어두운 화면에서 말풍선·컷 여백이 눈부시지 않은지 점검해요",
  },
};

export const CANVAS_COMMAND_CATALOG: readonly CanvasCommandItem[] = [
  {
    id: "stabilize-line",
    titleKo: "선 떨림 잡기",
    subtitleKo: "손떨림 보정 강도를 높여 매끈한 펜선을 유지해요",
    everydayAliasesKo: ["손떨림 보정", "선 깔끔하게", "펜 흔들림 줄이기", "스트로크 보정"],
    englishAliases: ["stabilizer", "line smoothing", "anti jitter", "smooth stroke"],
    category: "drawing",
    categoryLabelKo: "그리기",
    shortcut: "S",
    relatedToolId: "brush",
  },
  {
    id: "crowd-fill",
    titleKo: "군중 채우기",
    subtitleKo: "거리·카페 배경에 원근 비율 맞춘 행인 실루엣을 채워요",
    everydayAliasesKo: ["배경 사람 채우기", "엑스트라 배치", "행인 브러시", "사람들 자동 채우기"],
    englishAliases: ["crowd fill", "background people", "extra brush"],
    category: "scene",
    categoryLabelKo: "배경·3D",
    shortcut: "⇧C",
    relatedToolId: "3d-model",
  },
  {
    id: "flip-horizontal",
    titleKo: "좌우 반전",
    subtitleKo: "캔버스를 좌우로 뒤집어 얼굴·인체 균형을 즉시 확인해요",
    everydayAliasesKo: ["캔버스 뒤집기", "거울 보기", "밸런스 확인", "좌우 대칭 확인"],
    englishAliases: ["flip horizontal", "mirror canvas", "flip view"],
    category: "view",
    categoryLabelKo: "보기",
    shortcut: "H",
  },
  {
    id: "dark-mode-inspect",
    titleKo: "다크모드 검수",
    subtitleKo: "야간 독자 환경에서 컷 경계와 말풍선 가독성을 미리 봐요",
    everydayAliasesKo: ["야간 독자 미리보기", "어두운 배경 확인", "다크 독자 체크"],
    englishAliases: ["dark mode preview", "night reader inspect", "dark inspect"],
    category: "inspect",
    categoryLabelKo: "검수",
    shortcut: "⇧D",
    relatedInspectionMode: "dark-reader",
  },
  {
    id: "grayscale-value-check",
    titleKo: "명도·실루엣 흑백 검수",
    subtitleKo: "색을 잠시 빼고 명암 단계와 인물 실루엣 분리도를 점검해요",
    everydayAliasesKo: ["명암 체크", "흑백 밸류 확인", "실루엣 보기", "흑백 검수"],
    englishAliases: ["grayscale value check", "silhouette check", "value inspect"],
    category: "inspect",
    categoryLabelKo: "검수",
    shortcut: "⇧V",
    relatedInspectionMode: "grayscale-value",
  },
  {
    id: "silhouette-contrast-check",
    titleKo: "실루엣 고대비 분리",
    subtitleKo: "임계 명도 기준으로 인물과 배경 덩어리만 선명하게 봐요",
    everydayAliasesKo: ["윤곽선 덩어리 체크", "실루엣 분리", "전경 배경 대비"],
    englishAliases: ["silhouette contrast", "high contrast mask"],
    category: "inspect",
    categoryLabelKo: "검수",
    shortcut: "⇧S",
    relatedInspectionMode: "silhouette-contrast",
  },
  {
    id: "close-line-gap",
    titleKo: "열린 선 틈 자동 막기",
    subtitleKo: "채색할 때 색이 새지 않도록 미세한 선 틈을 닫아줘요",
    everydayAliasesKo: ["색 번짐 방지", "채우기 틈 닫기", "빈 틈 막기"],
    englishAliases: ["close gap", "gap close fill", "seal lineart"],
    category: "drawing",
    categoryLabelKo: "그리기",
    shortcut: "G",
    relatedToolId: "brush",
  },
  {
    id: "balloon-tail-speaker",
    titleKo: "말풍선 꼬리 화자 조준",
    subtitleKo: "선택한 말풍선 꼬리를 말하는 캐릭터 방향으로 자동 정렬해요",
    everydayAliasesKo: ["대사 꼬리 붙이기", "화자 방향 맞추기", "말풍선 정리"],
    englishAliases: ["balloon tail", "aim speaker", "speech tail"],
    category: "lettering",
    categoryLabelKo: "식자",
    shortcut: "T",
    relatedToolId: "speech-balloon",
  },
  {
    id: "extract-3d-lineart",
    titleKo: "실시간 3D 선화 추출",
    subtitleKo: "배치한 3D 배경과 소품을 컷 두께에 맞는 펜선으로 변환해요",
    everydayAliasesKo: ["3D 배경 선 따기", "배경 라인 뽑기", "LT 변환"],
    englishAliases: ["extract lineart", "3d to ink", "lt convert"],
    category: "scene",
    categoryLabelKo: "배경·3D",
    shortcut: "L",
    relatedToolId: "3d-model",
  },
  {
    id: "visual-undo-filmstrip",
    titleKo: "비주얼 언두 필름스트립 열기",
    subtitleKo: "이전 작업 장면을 썸네일로 훑어 원하는 지점으로 바로 점프해요",
    everydayAliasesKo: ["이전 단계 눈으로 찾기", "타임라인 되돌리기", "작업 기록 스크럽"],
    englishAliases: ["visual undo", "filmstrip history", "history scrubber"],
    category: "history",
    categoryLabelKo: "기록",
    shortcut: "⌘Z",
  },
  {
    id: "layer-peek-solo",
    titleKo: "레이어 단독 피크",
    subtitleKo: "현재 레이어만 잠깐 도드라지게 보여줘 선 겹침을 확인해요",
    everydayAliasesKo: ["레이어 훑기", "현재 레이어만 보기", "단독 보기"],
    englishAliases: ["layer peek", "solo layer", "isolate layer"],
    category: "layer",
    categoryLabelKo: "레이어",
    shortcut: "Alt+L",
  },
  {
    id: "alpha-lock-layer",
    titleKo: "투명 픽셀 잠금",
    subtitleKo: "이미 칠한 선·면 안에서만 색을 덮어 선 색을 빠르게 바꿔요",
    everydayAliasesKo: ["선 색 바꾸기", "알파 잠금", "밖으로 안 나가게"],
    englishAliases: ["alpha lock", "lock transparency"],
    category: "layer",
    categoryLabelKo: "레이어",
    shortcut: "/",
  },
  {
    id: "symmetry-ruler",
    titleKo: "대칭 자 켜기",
    subtitleKo: "정면 얼굴과 대칭 소품을 양쪽 동시에 그려요",
    everydayAliasesKo: ["좌우 대칭 그리기", "데칼코마니 자", "얼굴 대칭"],
    englishAliases: ["symmetry ruler", "mirror draw"],
    category: "drawing",
    categoryLabelKo: "그리기",
    shortcut: "M",
    relatedToolId: "brush",
  },
  {
    id: "expand-selection-2px",
    titleKo: "선택 영역 2px 확장",
    subtitleKo: "선화 아래 흰 틈 없이 깔끔하게 밑색을 채울 수 있게 넓혀요",
    everydayAliasesKo: ["흰 틈 없애기", "올가미 넓히기", "선택 확장"],
    englishAliases: ["expand selection", "grow selection"],
    category: "drawing",
    categoryLabelKo: "그리기",
    shortcut: "]",
    relatedToolId: "lasso",
  },
  {
    id: "auto-wall-transparency",
    titleKo: "가림 벽 자동 투명화",
    subtitleKo: "실내 3D 컷에서 카메라 앞을 가리는 벽면만 자동으로 비워요",
    everydayAliasesKo: ["실내 벽 숨기기", "카메라 벽 투과", "벽 투명"],
    englishAliases: ["auto wall hide", "backface wall cull", "transparent wall"],
    category: "scene",
    categoryLabelKo: "배경·3D",
    shortcut: "⇧W",
    relatedToolId: "3d-model",
  },
  {
    id: "fit-canvas-view",
    titleKo: "캔버스 화면 맞춤",
    subtitleKo: "확대·회전된 원고를 작업 화면에 딱 맞게 초기화해요",
    everydayAliasesKo: ["전체 보기", "배율 초기화", "화면 리셋"],
    englishAliases: ["fit canvas", "reset zoom", "zoom fit"],
    category: "view",
    categoryLabelKo: "보기",
    shortcut: "⌘0",
  },
] as const;

export const DEFAULT_FILMSTRIP_ENTRIES: readonly UndoFilmstripEntry[] = [
  {
    id: "step-1",
    seq: 1,
    labelKo: "구도 러프",
    toolLabelKo: "연필",
    timestampLabel: "00:00",
    strokeCount: 12,
    activeLayerName: "배경 러프",
    deltaSummaryKo: "3분할 시선 가이드와 인물 덩어리 배치",
    thumbnailBands: [
      { xPct: 16, yPct: 22, wPct: 68, hPct: 14, tone: "raised", opacity: 0.7 },
      { xPct: 30, yPct: 44, wPct: 40, hPct: 42, tone: "fg-2", opacity: 0.55 },
    ],
  },
  {
    id: "step-2",
    seq: 2,
    labelKo: "인물 선화",
    toolLabelKo: "G펜",
    timestampLabel: "01:14",
    strokeCount: 38,
    activeLayerName: "인물 선화",
    deltaSummaryKo: "얼굴 윤곽·머리카락 주선 확정",
    thumbnailBands: [
      { xPct: 26, yPct: 18, wPct: 48, hPct: 24, tone: "fg", opacity: 0.85 },
      { xPct: 24, yPct: 46, wPct: 52, hPct: 40, tone: "fg-2", opacity: 0.75 },
    ],
  },
  {
    id: "step-3",
    seq: 3,
    labelKo: "밑색 채우기",
    toolLabelKo: "채우기",
    timestampLabel: "02:30",
    strokeCount: 44,
    activeLayerName: "인물 밑색",
    deltaSummaryKo: "피부·교복·머리카락 기본 면 분리",
    thumbnailBands: [
      { xPct: 14, yPct: 14, wPct: 72, hPct: 22, tone: "cool", opacity: 0.45 },
      { xPct: 26, yPct: 36, wPct: 48, hPct: 50, tone: "accent", opacity: 0.5 },
    ],
  },
  {
    id: "step-4",
    seq: 4,
    labelKo: "셀 명암 1차",
    toolLabelKo: "올가미 채색",
    timestampLabel: "03:45",
    strokeCount: 61,
    activeLayerName: "인물 밑색",
    deltaSummaryKo: "좌상단 주광원 기준 턱·어깨 그림자 추가",
    thumbnailBands: [
      { xPct: 12, yPct: 16, wPct: 76, hPct: 26, tone: "cool", opacity: 0.55 },
      { xPct: 26, yPct: 38, wPct: 30, hPct: 48, tone: "accent", opacity: 0.7 },
      { xPct: 56, yPct: 42, wPct: 20, hPct: 42, tone: "fg", opacity: 0.75 },
    ],
  },
  {
    id: "step-5",
    seq: 5,
    labelKo: "3D 복도 선화",
    toolLabelKo: "3D 추출",
    timestampLabel: "04:52",
    strokeCount: 73,
    activeLayerName: "배경 러프",
    deltaSummaryKo: "창가 원근선과 복도 기둥 선화 합성",
    thumbnailBands: [
      { xPct: 8, yPct: 12, wPct: 84, hPct: 18, tone: "raised", opacity: 0.85 },
      { xPct: 10, yPct: 34, wPct: 22, hPct: 54, tone: "cool", opacity: 0.65 },
      { xPct: 36, yPct: 28, wPct: 36, hPct: 58, tone: "accent", opacity: 0.75 },
    ],
  },
  {
    id: "step-6",
    seq: 6,
    labelKo: "말풍선 배치",
    toolLabelKo: "말풍선",
    timestampLabel: "05:38",
    strokeCount: 79,
    activeLayerName: "말풍선·식자",
    deltaSummaryKo: "화자 꼬리 조준 및 어절 줄바꿈 정돈",
    thumbnailBands: [
      { xPct: 54, yPct: 10, wPct: 38, hPct: 22, tone: "fg", opacity: 0.92 },
      { xPct: 18, yPct: 34, wPct: 44, hPct: 52, tone: "accent", opacity: 0.72 },
      { xPct: 68, yPct: 54, wPct: 22, hPct: 28, tone: "cool", opacity: 0.55 },
    ],
  },
  {
    id: "step-7",
    seq: 7,
    labelKo: "림라이트 마감",
    toolLabelKo: "하이라이트",
    timestampLabel: "06:21",
    strokeCount: 92,
    activeLayerName: "하이라이트",
    deltaSummaryKo: "역광 림라이트와 눈동자 반사광 추가",
    thumbnailBands: [
      { xPct: 54, yPct: 10, wPct: 38, hPct: 22, tone: "fg", opacity: 0.92 },
      { xPct: 22, yPct: 30, wPct: 46, hPct: 54, tone: "accent", opacity: 0.82 },
      { xPct: 18, yPct: 28, wPct: 8, hPct: 48, tone: "warn", opacity: 0.9 },
    ],
  },
];
