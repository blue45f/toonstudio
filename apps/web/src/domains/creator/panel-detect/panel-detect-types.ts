/**
 * 컷 자동 감지 — 공개 타입·한도·오류 계약.
 *
 * 이 파일은 DOM/React/Worker 어느 것에도 의존하지 않는다. 순수 알고리즘(panel-detect-core)과
 * Worker 메시지 계약(panel-detect-worker-protocol), 편집·재배열 모듈이 같은 타입을 공유한다.
 *
 * 좌표 규약: 모든 사각형은 "입력 래스터 픽셀" 기준이며 `x`,`y`는 좌상단, 끝은 배타(exclusive)다.
 */

/** ImageData 와 구조적으로 호환되는 RGBA 래스터. `data.length === width * height * 4`. */
export interface PanelDetectRaster {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

export interface PanelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 읽기 순서.
 * - manga: 우→좌, 위→아래(일본식 만화)
 * - comic: 좌→우, 위→아래(한국 만화책·서양식 코믹)
 * - webtoon: 위→아래(세로 스크롤). 같은 줄에 나란한 컷만 좌→우.
 */
export const PANEL_READING_ORDERS = ["manga", "comic", "webtoon"] as const;
export type PanelReadingOrder = (typeof PANEL_READING_ORDERS)[number];

/** 여백(거터) 최소 두께 민감도. fine 은 얇은 여백도 컷 경계로 보고, coarse 는 넓은 여백만 본다. */
export const PANEL_DETECT_SENSITIVITIES = ["fine", "normal", "coarse"] as const;
export type PanelDetectSensitivity = (typeof PANEL_DETECT_SENSITIVITIES)[number];

export interface PanelDetectOptions {
  /** 기본 webtoon. */
  readonly readingOrder?: PanelReadingOrder;
  /** 기본 normal. */
  readonly sensitivity?: PanelDetectSensitivity;
  /** 행/열 번갈아 자르는 재귀의 최대 깊이. 기본 8. */
  readonly maxDepth?: number;
  /** 분석용 래스터의 최대 픽셀 수. 입력이 더 크면 정수 배율로 다운샘플한다. 기본 4,000,000. */
  readonly maxAnalysisPixels?: number;
  /** 컷 개수 상한. 넘으면 오류로 끝낸다(과분할을 조용히 자르지 않는다). 기본 120. */
  readonly maxPanels?: number;
  /** 시간 상한(ms). 넘으면 부분 결과 없이 timeout 오류. 기본 10,000. */
  readonly timeLimitMs?: number;
  /** 여백색 허용 오차(채널별 0~255). 스캔·JPEG 잡티를 흡수한다. 기본 28. */
  readonly gutterTolerance?: number;
  /** 시계 주입(테스트). 기본 performance.now / Date.now. */
  readonly now?: () => number;
  /** 협력적 취소. true 를 돌려주면 다음 점검 시점에 cancelled 로 끝난다. */
  readonly isCancelled?: () => boolean;
}

export const PANEL_DETECT_VERSION = 1 as const;

export const PANEL_DETECT_LIMITS = Object.freeze({
  /** 이보다 큰 입력은 거절한다(브라우저 캔버스 한도와 메모리 보호). */
  maxInputPixels: 120_000_000,
  maxInputSide: 65_535,
  defaultAnalysisPixels: 4_000_000,
  minAnalysisPixels: 10_000,
  defaultMaxPanels: 120,
  defaultMaxDepth: 8,
  maxDepthCeiling: 16,
  defaultTimeLimitMs: 10_000,
  defaultGutterTolerance: 28,
} as const);

export type PanelConfidenceLevel = "high" | "medium" | "low";

/** 컷 하나에 붙는 경고. */
export type PanelWarningCode =
  | "overlap-suspected"
  | "bridged-gutter-suspected"
  | "merged-panels-suspected"
  | "max-depth-reached"
  | "touches-image-edge"
  | "no-gutter-found";

/** 결과 전체에 붙는 경고. */
export type PanelDetectWarningCode =
  | "blank-image"
  | "no-gutter-found"
  | "no-panel-found"
  | "downsampled"
  | "undetectable-regions"
  | "ignored-fragments"
  | "max-depth-reached"
  | "low-overall-confidence";

export interface DetectedPanel extends PanelRect {
  readonly id: string;
  /** 1부터 시작하는 읽기 순서. */
  readonly order: number;
  /** 0~1. 여백 분리의 또렷함·내용량·크기에서 계산한다(panel-detect-confidence). */
  readonly confidence: number;
  readonly level: PanelConfidenceLevel;
  readonly warnings: readonly PanelWarningCode[];
}

/**
 * 자동으로 컷을 나눌 수 없는 영역. 알고리즘은 이 영역에 컷을 "지어내지 않는다".
 * non-separable: 여백이 축에 평행하지 않거나(기울어진 컷·사선 여백) 서로 겹쳐 행/열 투영으로 분리되지 않는다.
 */
export type UndetectableReason = "non-separable";

export interface UndetectableRegion extends PanelRect {
  readonly id: string;
  readonly reason: UndetectableReason;
  /** 이 영역 안에서 발견한, 서로 이어지지 않은 큰 덩어리 개수. */
  readonly componentCount: number;
}

/** 컷으로 쓰기엔 너무 작거나 비어 있어 제외한 조각(페이지 번호·티끌 등). 사용자가 직접 컷으로 채택할 수 있다. */
export type IgnoredFragmentReason = "too-small" | "low-content";

export interface IgnoredFragment extends PanelRect {
  readonly id: string;
  readonly reason: IgnoredFragmentReason;
}

/**
 * 컷 하나 안에서 "여기서 나뉘었을 가능성이 있는" 자리. 말풍선·효과음이 컷 사이 여백을 가로질러 막은 경우 등이다.
 * 알고리즘은 자동으로 쪼개지 않고 위치만 제안한다 — 사용자가 확인하고 적용한다.
 * orientation: horizontal 이면 y=position 인 가로선(위·아래로 나눔), vertical 이면 x=position 인 세로선.
 */
export interface SplitSuggestion {
  readonly id: string;
  readonly panelId: string;
  readonly orientation: "horizontal" | "vertical";
  readonly position: number;
  readonly reason: "bridged-gutter";
}

export type GutterKind = "white" | "black" | "solid" | "transparent" | "none";

export interface GutterColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface GutterInfo {
  readonly kind: GutterKind;
  /** transparent / none 이면 null. */
  readonly color: GutterColor | null;
  readonly tolerance: number;
  /** 같은 색으로 균일했던 표본 행·열 수. 표본에서 표를 받지 못하고 가설로만 시험한 흰색·검정이면 0. */
  readonly votes: number;
}

export interface PanelDetectResult {
  readonly version: typeof PANEL_DETECT_VERSION;
  /** 입력 래스터 크기. 모든 좌표는 이 크기 기준이다. */
  readonly width: number;
  readonly height: number;
  readonly analysis: {
    readonly width: number;
    readonly height: number;
    /** 1 이면 원본 해상도, 2 이상이면 정수 배율 다운샘플. */
    readonly step: number;
  };
  readonly gutter: GutterInfo;
  readonly readingOrder: PanelReadingOrder;
  readonly panels: readonly DetectedPanel[];
  readonly undetectable: readonly UndetectableRegion[];
  readonly ignored: readonly IgnoredFragment[];
  readonly suggestions: readonly SplitSuggestion[];
  /** 0~1 전체 신뢰도. 컷이 없으면 0. */
  readonly confidence: number;
  readonly level: PanelConfidenceLevel;
  readonly warnings: readonly PanelDetectWarningCode[];
}

export type PanelDetectErrorCode =
  | "invalid-input"
  | "invalid-options"
  | "too-large"
  | "too-many-panels"
  | "cancelled"
  | "timeout"
  | "worker-unavailable"
  | "worker-failed"
  | "worker-protocol";

const ERROR_MESSAGES: Readonly<Record<PanelDetectErrorCode, string>> = Object.freeze({
  "invalid-input": "분석할 이미지가 올바르지 않아요.",
  "invalid-options": "컷 감지 설정이 올바르지 않아요.",
  "too-large": "이미지가 너무 커서 분석할 수 없어요.",
  "too-many-panels": "컷이 너무 많이 나뉘었어요. 민감도를 낮춰 다시 시도해 주세요.",
  cancelled: "컷 감지를 취소했어요.",
  timeout: "컷 감지가 제한 시간을 넘겼어요.",
  "worker-unavailable": "이 브라우저에서는 컷 감지 Worker 를 쓸 수 없어요.",
  "worker-failed": "컷 감지 Worker 가 중단되었어요.",
  "worker-protocol": "컷 감지 Worker 응답을 읽지 못했어요.",
});

export class PanelDetectError extends Error {
  readonly code: PanelDetectErrorCode;

  constructor(code: PanelDetectErrorCode, message?: string, options?: { readonly cause?: unknown }) {
    super(message ?? ERROR_MESSAGES[code], options);
    this.name = "PanelDetectError";
    this.code = code;
  }
}

const ERROR_CODE_SET: ReadonlySet<string> = new Set(Object.keys(ERROR_MESSAGES));

export function isPanelDetectErrorCode(value: unknown): value is PanelDetectErrorCode {
  return typeof value === "string" && ERROR_CODE_SET.has(value);
}

export function panelDetectConfidenceLevel(confidence: number): PanelConfidenceLevel {
  if (confidence >= 0.75) return "high";
  if (confidence >= 0.5) return "medium";
  return "low";
}
