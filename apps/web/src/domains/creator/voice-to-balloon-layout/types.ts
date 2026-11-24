/**
 * 음성 운율(Prosody) & 대사 리듬 기반 웹툰 말풍선 자동 조판 엔진 타입 정의.
 *
 * - 모바일 세로 스크롤(폭 800px 기준) 가독성, 감정별 말풍선 기하학, 동적 폰트 스케일,
 *   키네틱 효과음(SFX) 콜아웃 및 0겹침(0-overlap) 여백 레이아웃 계약을 정의한다.
 */

/** 음성·대사 화자의 감정 및 발화 톤 태그. */
export type VoiceEmotionTag =
  | "neutral"
  | "anger"
  | "urgency"
  | "whisper"
  | "affection"
  | "thought"
  | "narration"
  | "shock"
  | "deadpan";

/** 웹툰 말풍선 외곽선 기하학 분류 5종. */
export type BalloonGeometryKind =
  | "normal-oval"
  | "shout-spike"
  | "whisper-dashed"
  | "thought-cloud"
  | "narration-rect";

/** 800px 웹툰 스트립 내 말풍선 가로 정렬 위치. */
export type SpeakerAlignment = "left" | "center" | "right";

/** 말풍선 꼬리 방향. */
export type BalloonTailDirection =
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right"
  | "none";

/** 키네틱 효과음(SFX) 연출 성격. */
export type KineticSfxEmphasis = "impact" | "flutter" | "freeze";

/** 음성 트랜스크립트 + 운율 단서 입력 단위. */
export interface VoiceProsodyCue {
  readonly id: string;
  readonly speaker: string;
  readonly alignment: SpeakerAlignment;
  readonly text: string;
  /** 직전 발화 종료 후 현재 발화 시작까지의 침묵 간격(ms). */
  readonly pauseBeforeMs: number;
  /** 현재 발화 길이(ms). */
  readonly durationMs: number;
  /** 발화 피크 음압 에너지(dBFS, 0에 가까울수록 강함, 예: -28 ~ 0). */
  readonly peakDb: number;
  /** 억양 피치 기울기(semitones/sec, 양수는 상승·고조, 음수는 하강·침잠). */
  readonly pitchSlopeSemitones: number;
  readonly emotion: VoiceEmotionTag;
  /** 선택적 효과음(SFX) 힌트 문구(예: "쾅!!", "두근..."). */
  readonly sfxHint?: string;
}

/** 스튜디오 패널용 내장 시나리오 프리셋. */
export interface VoiceScriptPreset {
  readonly id: string;
  readonly nameKo: string;
  readonly genreKo: string;
  readonly descriptionKo: string;
  readonly stripWidthPx: number;
  readonly cues: readonly VoiceProsodyCue[];
}

/** 운율 에너지 기반 동적 타이포그래피 계산 결과. */
export interface DynamicTypographyMetrics {
  readonly fontSizePx: number;
  readonly fontWeight: 400 | 500 | 700 | 800;
  readonly lineHeightPx: number;
  readonly letterSpacingEm: number;
}

/** 800px 스트립 위에 배치된 개별 말풍선 레이아웃 결과. */
export interface LaidOutSpeechBalloon {
  readonly id: string;
  readonly sourceCueId: string;
  readonly speaker: string;
  readonly partIndex: number;
  readonly partCount: number;
  readonly alignment: SpeakerAlignment;
  readonly geometry: BalloonGeometryKind;
  readonly tailDirection: BalloonTailDirection;
  readonly lines: readonly string[];
  readonly rawText: string;
  readonly maxLineVisualChars: number;
  readonly fontSizePx: number;
  readonly fontWeight: 400 | 500 | 700 | 800;
  readonly lineHeightPx: number;
  readonly letterSpacingEm: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly pauseGutterPx: number;
  readonly peakDb: number;
  readonly pitchSlopeSemitones: number;
  readonly emotion: VoiceEmotionTag;
  readonly readabilityScore: number;
}

/** 말풍선과 겹치지 않게 반대 레인에 배치되는 키네틱 SFX 콜아웃. */
export interface KineticSfxCallout {
  readonly id: string;
  readonly sourceCueId: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDeg: number;
  readonly fontSizePx: number;
  readonly intensity: number;
  readonly emphasis: KineticSfxEmphasis;
}

/** 두 레이아웃 박스 간의 겹침 검출 항목. */
export interface LayoutOverlapPair {
  readonly aId: string;
  readonly bId: string;
  readonly overlapAreaPx2: number;
}

/** 0겹침(0-overlap) 검증 결과. */
export interface OverlapCheckResult {
  readonly overlapCount: number;
  readonly overlappingPairs: readonly LayoutOverlapPair[];
  readonly minVerticalGapPx: number;
}

/** 말풍선 자동 조판 옵션. */
export interface BalloonLayoutOptions {
  /** 웹툰 캔버스 폭(px). 기본값 800. */
  readonly stripWidthPx?: number;
  /** 모바일 한 줄 최대 시각 글자수(권장 14~18, 허용 12~18). 기본값 16. */
  readonly maxCharsPerLine?: number;
  /** 좌우 안전 여백(px). 기본값 44. */
  readonly horizontalMarginPx?: number;
  /** 말풍선 간 최소 세로 여백(px). 기본값 34. */
  readonly minVerticalGutterPx?: number;
  /** 기준 본문 폰트 크기(px). 기본값 22. */
  readonly baseFontSizePx?: number;
  /** 키네틱 SFX 콜아웃 생성 여부. 기본값 true. */
  readonly includeSfx?: boolean;
}

/** 전체 음성→말풍선 조판 엔진 출력. */
export interface VoiceBalloonLayoutResult {
  readonly stripWidthPx: number;
  readonly stripHeightPx: number;
  readonly maxCharsPerLine: number;
  readonly balloons: readonly LaidOutSpeechBalloon[];
  readonly sfxCallouts: readonly KineticSfxCallout[];
  readonly overlapCheck: OverlapCheckResult;
  readonly averageLineVisualChars: number;
  readonly maxLineVisualCharsObserved: number;
  readonly estimatedReadTimeSec: number;
  readonly rhythmVarianceScore: number;
  readonly geometryBreakdown: Readonly<Record<BalloonGeometryKind, number>>;
}
