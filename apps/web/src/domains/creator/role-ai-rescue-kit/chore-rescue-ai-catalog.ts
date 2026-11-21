/**
 * 6대 작가 노가다 박멸 AI 보정 엔진용 타입 계약 및 결정론적 카탈로그 데이터 (₩0).
 */

export const RESCUE_ENGINE_COST_KRW = 0 as const;

export type AnatomyRescueTarget = "hands" | "frills" | "weapon" | "vehicle";
export type InkStylePreset = "clean-digital" | "g-pen" | "pencil-rough" | "brush-ink";
export type RescueDetailLevel = "draft" | "serialization" | "print";

interface MaskRegionRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface AuthorStyleLock {
  readonly strokeWidthPx: number;
  readonly taperRatio: number;
  readonly inkStyle: InkStylePreset;
  readonly preserveOriginalUnderlay: boolean;
}

export interface AnatomyFoldRescueInput {
  readonly cutId: string;
  readonly maskRegion: MaskRegionRect;
  readonly targetType: AnatomyRescueTarget;
  readonly styleLock: AuthorStyleLock;
  readonly detailLevel?: RescueDetailLevel;
}

export interface VectorControlPoint {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly handleInX: number;
  readonly handleInY: number;
  readonly handleOutX: number;
  readonly handleOutY: number;
  readonly roleKo: string;
}

export interface SeparatedEditableLayer {
  readonly layerId: string;
  readonly nameKo: string;
  readonly kind:
    | "original-underlay"
    | "rescue-vector-lineart"
    | "manual-retouch-guide"
    | "outfit-overlay"
    | "atmosphere-relight"
    | "rim-highlight"
    | "prop-placement"
    | "hangul-sign"
    | "flaw-fix-patch";
  readonly locked: boolean;
  readonly editable: boolean;
  readonly opacity: number;
  readonly blendMode: "normal" | "multiply" | "overlay" | "hard-light" | "screen";
}

export interface AnatomyFoldRescueResult {
  readonly patchId: string;
  readonly cutId: string;
  readonly targetType: AnatomyRescueTarget;
  readonly targetLabelKo: string;
  readonly applied: boolean;
  readonly validationError: string | null;
  readonly costKrw: 0;
  readonly estimatedTimeMs: number;
  readonly outputStrokeWidthPx: number;
  readonly strokeLockMatched: boolean;
  readonly inkStyle: InkStylePreset;
  readonly vectorControlPoints: readonly VectorControlPoint[];
  readonly separatedLayers: readonly SeparatedEditableLayer[];
  readonly anatomyChecks: readonly string[];
  readonly summaryKo: string;
}

export type CameraShotType =
  | "establishing"
  | "full-shot"
  | "medium-shot"
  | "over-the-shoulder"
  | "closeup"
  | "extreme-closeup"
  | "insert-detail";

export type CutEmotion = "calm" | "joy" | "sad" | "angry" | "shocked" | "shy" | "smirk";
type GazeDirection = "left" | "center" | "right" | "up" | "down";
export type ReadingPacingMode = "fast-action" | "balanced" | "dramatic-pause";

interface CutBeatSnapshot {
  readonly cutNumber: number;
  readonly cameraAngle: CameraShotType;
  readonly emotion: CutEmotion;
  readonly actionSummary: string;
  readonly gazeDirection: GazeDirection;
  readonly beatDurationSec: number;
}

export interface BridgeCutProposalInput {
  readonly prevCut: CutBeatSnapshot;
  readonly nextCut: CutBeatSnapshot;
  readonly readingPacing?: ReadingPacingMode;
}

interface BridgeCutDeltaAnalysis {
  readonly cameraJumpScore: number;
  readonly emotionShiftScore: number;
  readonly gazeBreakDetected: boolean;
  readonly actionContinuityGap: boolean;
  readonly combinedJumpScore: number;
}

export interface BridgeCutCard {
  readonly bridgeId: string;
  readonly bridgeOrder: 1 | 2;
  readonly insertAfterCut: number;
  readonly suggestedCutLabel: string;
  readonly cameraAngle: CameraShotType;
  readonly cameraLabelKo: string;
  readonly gazeFlowKo: string;
  readonly actionDirectionKo: string;
  readonly breathGapPx: number;
  readonly estimatedReadSec: number;
  readonly separatedDraftLayerId: string;
}

export interface BridgeCutProposalResult {
  readonly costKrw: 0;
  readonly deltaAnalysis: BridgeCutDeltaAnalysis;
  readonly proposals: readonly BridgeCutCard[];
  readonly manualEditable: true;
  readonly summaryKo: string;
}

export type OutfitSetId = "winter-coat" | "summer-uniform" | "rofan-gown" | "hunter-armor";
export type AtmospherePresetId = "day" | "sunset" | "rainy-night" | "snowy-dawn";

export interface BatchCutStyleState {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly characterIds: readonly string[];
  readonly currentOutfit: OutfitSetId;
  readonly currentAtmosphere: AtmospherePresetId;
  readonly manualLocked?: boolean;
}

export interface BatchRedressRelightInput {
  readonly cuts: readonly BatchCutStyleState[];
  readonly targetOutfit: OutfitSetId;
  readonly targetAtmosphere: AtmospherePresetId;
  readonly preserveManualLockedCuts?: boolean;
}

interface OutfitSetSpec {
  readonly id: OutfitSetId;
  readonly labelKo: string;
  readonly garmentLayersKo: readonly string[];
  readonly fabricFoldWeight: number;
  readonly paletteOklch: readonly string[];
}

interface AtmosphereOklchSpec {
  readonly id: AtmospherePresetId;
  readonly labelKo: string;
  readonly keyLightOklch: string;
  readonly shadowTintOklch: string;
  readonly rimLightOklch: string;
  readonly lightnessDelta: number;
  readonly chromaDelta: number;
  readonly hueShiftDeg: number;
  readonly blendMode: "multiply" | "overlay" | "hard-light";
  readonly ambientEffectKo: string;
}

export interface BatchCutRedressResult {
  readonly cutId: string;
  readonly cutNumber: number;
  readonly status: "updated" | "skipped-locked";
  readonly appliedOutfit: OutfitSetId;
  readonly appliedAtmosphere: AtmospherePresetId;
  readonly separatedLayers: readonly SeparatedEditableLayer[];
}

export interface BatchRedressRelightResult {
  readonly costKrw: 0;
  readonly totalCuts: number;
  readonly updatedCount: number;
  readonly skippedLockedCount: number;
  readonly outfitSpec: OutfitSetSpec;
  readonly atmosphereSpec: AtmosphereOklchSpec;
  readonly cutResults: readonly BatchCutRedressResult[];
  readonly summaryKo: string;
}

export interface DialogueExpressionSyncInput {
  readonly cutId: string;
  readonly characterName: string;
  readonly previousDialogue: string;
  readonly editedDialogue: string;
}

interface ExpressionLayerSyncParams {
  readonly eyebrows: {
    readonly layerId: string;
    readonly archAngleDeg: number;
    readonly heightOffsetPx: number;
    readonly furrowIntensity: number;
  };
  readonly eyes: {
    readonly layerId: string;
    readonly opennessRatio: number;
    readonly pupilScale: number;
    readonly highlightStyle: "clear" | "sparkle" | "tremble" | "shadowed";
  };
  readonly mouth: {
    readonly layerId: string;
    readonly shape: "neutral" | "open-shout" | "gasp" | "soft-smile" | "smirk" | "quiver" | "small-pout";
    readonly openRatio: number;
    readonly cornerLift: number;
  };
  readonly blush: {
    readonly layerId: string;
    readonly opacity: number;
    readonly style: "none" | "soft-pink" | "heavy-fluster" | "pale-shadow";
    readonly tintOklch: string;
  };
}

export interface DialogueExpressionSyncResult {
  readonly costKrw: 0;
  readonly cutId: string;
  readonly characterName: string;
  readonly dialogueChanged: boolean;
  readonly redrawFullFace: false;
  readonly modifiedLayerKeys: readonly ["eyebrows", "eyes", "mouth", "blush"];
  readonly detectedEmotion: CutEmotion;
  readonly emotionLabelKo: string;
  readonly confidenceScore: number;
  readonly matchedKeywords: readonly string[];
  readonly estimatedSyncMs: number;
  readonly layers: ExpressionLayerSyncParams;
  readonly summaryKo: string;
}

export type SceneZoneId = "empty-desk" | "cafe-table" | "street-signboard" | "corridor-wall";
export type SceneGenreEra = "rofan" | "seoul-modern" | "murim" | "academy";
export type ScenePropDensity = "minimal" | "standard" | "rich";

export interface EmptySceneFillInput {
  readonly sceneZone: SceneZoneId;
  readonly genreEra: SceneGenreEra;
  readonly density?: ScenePropDensity;
  readonly cameraPerspectivePoints?: 1 | 2 | 3;
}

export interface PlacedSceneProp {
  readonly propId: string;
  readonly nameKo: string;
  readonly normalizedX: number;
  readonly normalizedY: number;
  readonly depthLayer: "foreground" | "midground" | "background";
  readonly scale: number;
  readonly perspectivePoints: 1 | 2 | 3;
}

export interface GeneratedHangulSign {
  readonly signId: string;
  readonly textKo: string;
  readonly placementKo: string;
  readonly fontToneKo: string;
  readonly mirrored: false;
  readonly typoCount: 0;
  readonly validatedHangulOnly: boolean;
}

export interface EmptySceneFillResult {
  readonly costKrw: 0;
  readonly sceneZone: SceneZoneId;
  readonly genreEra: SceneGenreEra;
  readonly props: readonly PlacedSceneProp[];
  readonly hangulSigns: readonly GeneratedHangulSign[];
  readonly zeroTypoGuaranteed: true;
  readonly zeroMirroredGuaranteed: true;
  readonly separatedLayers: readonly SeparatedEditableLayer[];
  readonly summaryKo: string;
}

export type ManuscriptFlawCategory =
  | "missing-accessory"
  | "mirrored-text"
  | "unfilled-white-gap"
  | "mismatched-balloon-tail"
  | "abnormal-finger-count";

export interface ManuscriptCutAuditInput {
  readonly cutNumber: number;
  readonly expectedAccessories: readonly string[];
  readonly renderedAccessories: readonly string[];
  readonly signTexts: readonly { readonly text: string; readonly mirrored: boolean }[];
  readonly unfilledWhiteGapCount: number;
  readonly balloonTails: readonly {
    readonly balloonId: string;
    readonly assignedSpeaker: string;
    readonly tailTargetSpeaker: string;
  }[];
  readonly detectedHandFingerCounts: readonly number[];
}

export interface ManuscriptFlawFinding {
  readonly findingId: string;
  readonly cutNumber: number;
  readonly category: ManuscriptFlawCategory;
  readonly categoryLabelKo: string;
  readonly severity: "critical" | "warning";
  readonly descriptionKo: string;
  readonly autoFixActionKo: string;
  readonly fixed: boolean;
  readonly fixLayerId: string;
}

export interface ManuscriptFlawScanInput {
  readonly cuts: readonly ManuscriptCutAuditInput[];
  readonly autoFixMode?: "preview-only" | "apply-all";
}

export interface ManuscriptFlawScanResult {
  readonly costKrw: 0;
  readonly totalScannedCuts: number;
  readonly totalFlawsFound: number;
  readonly autoFixedCount: number;
  readonly remainingFlawCount: number;
  readonly releaseReadinessScore: number;
  readonly countsByCategory: Readonly<Record<ManuscriptFlawCategory, number>>;
  readonly findings: readonly ManuscriptFlawFinding[];
  readonly summaryKo: string;
}

export const ANATOMY_TARGET_LABELS: Readonly<Record<AnatomyRescueTarget, string>> = {
  hands: "손·손가락 관절",
  frills: "프릴·의상 주름",
  weapon: "무기·검날 투시",
  vehicle: "자동차·차륜 투시",
};

export const ANATOMY_CHECKLISTS: Readonly<Record<AnatomyRescueTarget, readonly string[]>> = {
  hands: [
    "손가락 5지 마디 비율 및 중수골 아치 정렬",
    "엄지 대립각과 손목 중심축 일치 검증",
    "작가 선폭 락 적용 및 외곽선 끊김 보정",
  ],
  frills: [
    "중력 방향 드레이프와 S자 프릴 리듬 정렬",
    "겹침 주름 안쪽 그림자 접힘선 정리",
    "과밀 선 뭉침 방지 및 선폭 강약 보존",
  ],
  weapon: [
    "칼날·총열 중심축 소실점 직선 정렬",
    "손잡이 그립과 손가락 파지각 간섭 제거",
    "금속 모서리 두께감 및 베벨 선폭 고정",
  ],
  vehicle: [
    "2점 투시 차체 박스 및 보닛 중심선 정렬",
    "전·후륜 타원 단축각 일치 및 지면 접지 보정",
    "헤드라이트·사이드미러 좌우 대칭 검증",
  ],
};

export const ANATOMY_CONTROL_TEMPLATES: Readonly<
  Record<AnatomyRescueTarget, readonly { readonly rx: number; readonly ry: number; readonly roleKo: string }[]>
> = {
  hands: [
    { rx: 0.22, ry: 0.72, roleKo: "손목 기저축" },
    { rx: 0.16, ry: 0.44, roleKo: "엄지 제1관절" },
    { rx: 0.36, ry: 0.18, roleKo: "검지 끝마디" },
    { rx: 0.52, ry: 0.12, roleKo: "중지 끝마디" },
    { rx: 0.68, ry: 0.2, roleKo: "약지 끝마디" },
    { rx: 0.82, ry: 0.34, roleKo: "소지 끝마디" },
  ],
  frills: [
    { rx: 0.12, ry: 0.22, roleKo: "허리선 시작 주름" },
    { rx: 0.3, ry: 0.68, roleKo: "좌측 물결 정점" },
    { rx: 0.5, ry: 0.52, roleKo: "중앙 접힘 골" },
    { rx: 0.7, ry: 0.78, roleKo: "우측 물결 정점" },
    { rx: 0.88, ry: 0.6, roleKo: "끝단 드레이프 마감" },
  ],
  weapon: [
    { rx: 0.14, ry: 0.82, roleKo: "손잡이 끝단" },
    { rx: 0.32, ry: 0.64, roleKo: "코등이(가드) 중심" },
    { rx: 0.58, ry: 0.38, roleKo: "칼날 능선 중점" },
    { rx: 0.88, ry: 0.12, roleKo: "칼끝 소실점 정렬점" },
  ],
  vehicle: [
    { rx: 0.12, ry: 0.66, roleKo: "전면 범퍼 코너" },
    { rx: 0.28, ry: 0.76, roleKo: "전륜 타원 중심" },
    { rx: 0.48, ry: 0.28, roleKo: "A필러 루프라인" },
    { rx: 0.74, ry: 0.72, roleKo: "후륜 타원 중심" },
    { rx: 0.9, ry: 0.54, roleKo: "후면 테일게이트 축" },
  ],
};

export const CAMERA_SCALE_RANK: Readonly<Record<CameraShotType, number>> = {
  establishing: 0,
  "full-shot": 1,
  "medium-shot": 2,
  "over-the-shoulder": 3,
  closeup: 4,
  "extreme-closeup": 5,
  "insert-detail": 5,
};

export const CAMERA_SHOT_LABELS: Readonly<Record<CameraShotType, string>> = {
  establishing: "원경(배경 설정 샷)",
  "full-shot": "풀 샷",
  "medium-shot": "미디엄 샷",
  "over-the-shoulder": "오버 더 숄더",
  closeup: "클로즈업",
  "extreme-closeup": "익스트림 클로즈업",
  "insert-detail": "소품·손 인서트 컷",
};

export const EMOTION_AROUSAL_VALENCE: Readonly<Record<CutEmotion, readonly [number, number]>> = {
  calm: [0.2, 0.5],
  joy: [0.7, 0.9],
  sad: [0.3, 0.15],
  angry: [0.95, 0.1],
  shocked: [1.0, 0.25],
  shy: [0.6, 0.72],
  smirk: [0.55, 0.62],
};

export const GAZE_LABELS: Readonly<Record<GazeDirection, string>> = {
  left: "좌측",
  center: "정면",
  right: "우측",
  up: "상단",
  down: "하단",
};

export const OUTFIT_SET_CATALOG: Readonly<Record<OutfitSetId, OutfitSetSpec>> = {
  "winter-coat": {
    id: "winter-coat",
    labelKo: "겨울 울 더블코트",
    garmentLayersKo: ["울 더블코트", "니트 머플러", "기모 슬랙스", "가죽 부츠"],
    fabricFoldWeight: 0.86,
    paletteOklch: ["oklch(0.32 0.04 258)", "oklch(0.56 0.06 58)", "oklch(0.24 0.02 260)"],
  },
  "summer-uniform": {
    id: "summer-uniform",
    labelKo: "하복 반팔 교복",
    garmentLayersKo: ["반팔 와이셔츠", "리본·넥타이", "플리츠 스커트/하복 바지"],
    fabricFoldWeight: 0.34,
    paletteOklch: ["oklch(0.95 0.01 240)", "oklch(0.42 0.12 252)", "oklch(0.58 0.15 26)"],
  },
  "rofan-gown": {
    id: "rofan-gown",
    labelKo: "로판 연회 드레스",
    garmentLayersKo: ["코르셋 보디스", "레이스 프릴 소매", "3단 시폰 스커트", "진주 브로치"],
    fabricFoldWeight: 0.72,
    paletteOklch: ["oklch(0.68 0.14 14)", "oklch(0.88 0.07 82)", "oklch(0.94 0.02 20)"],
  },
  "hunter-armor": {
    id: "hunter-armor",
    labelKo: "헌터 전술 아머",
    garmentLayersKo: ["카본 흉갑", "비대칭 숄더 가드", "전술 코트 자락", "마석 벨트"],
    fabricFoldWeight: 0.92,
    paletteOklch: ["oklch(0.26 0.03 255)", "oklch(0.58 0.16 218)", "oklch(0.74 0.14 76)"],
  },
};

export const ATMOSPHERE_OKLCH_CATALOG: Readonly<Record<AtmospherePresetId, AtmosphereOklchSpec>> = {
  day: {
    id: "day",
    labelKo: "맑은 정오(주광)",
    keyLightOklch: "oklch(0.95 0.03 95)",
    shadowTintOklch: "oklch(0.54 0.06 242)",
    rimLightOklch: "oklch(0.98 0.02 90)",
    lightnessDelta: 0.06,
    chromaDelta: 0.02,
    hueShiftDeg: 0,
    blendMode: "overlay",
    ambientEffectKo: "자연광 산란 · 부드러운 청회색 그림자",
  },
  sunset: {
    id: "sunset",
    labelKo: "노을빛 황혼",
    keyLightOklch: "oklch(0.76 0.16 48)",
    shadowTintOklch: "oklch(0.38 0.11 304)",
    rimLightOklch: "oklch(0.86 0.17 64)",
    lightnessDelta: -0.08,
    chromaDelta: 0.07,
    hueShiftDeg: -26,
    blendMode: "hard-light",
    ambientEffectKo: "주황 역광 림라이트 · 보라빛 긴 그림자",
  },
  "rainy-night": {
    id: "rainy-night",
    labelKo: "비 오는 심야",
    keyLightOklch: "oklch(0.46 0.11 252)",
    shadowTintOklch: "oklch(0.22 0.06 266)",
    rimLightOklch: "oklch(0.72 0.14 205)",
    lightnessDelta: -0.22,
    chromaDelta: 0.05,
    hueShiftDeg: 38,
    blendMode: "multiply",
    ambientEffectKo: "사선 빗줄기 오버레이 · 젖은 아스팔트 청록 반사광",
  },
  "snowy-dawn": {
    id: "snowy-dawn",
    labelKo: "눈 내리는 새벽",
    keyLightOklch: "oklch(0.84 0.07 230)",
    shadowTintOklch: "oklch(0.48 0.08 248)",
    rimLightOklch: "oklch(0.93 0.05 215)",
    lightnessDelta: -0.04,
    chromaDelta: -0.02,
    hueShiftDeg: 18,
    blendMode: "overlay",
    ambientEffectKo: "소프트 눈발 보케 · 하얀 입김 및 차가운 여명 림광",
  },
};

export const EMOTION_LABELS: Readonly<Record<CutEmotion, string>> = {
  calm: "차분함",
  joy: "기쁨·미소",
  sad: "슬픔·미안함",
  angry: "분노·격앙",
  shocked: "충격·경악",
  shy: "당황·수줍음",
  smirk: "여유·비웃음",
};

export const EMOTION_KEYWORDS: Readonly<Record<Exclude<CutEmotion, "calm">, readonly string[]>> = {
  angry: ["꺼져", "당장", "용서 못", "감히", "그만해", "미쳤", "닥쳐", "화나", "부숴", "!!"],
  shocked: ["설마", "말도 안", "뭐라고", "거짓말", "어떻게", "헉", "?!", "!?"],
  sad: ["미안", "눈물", "떠나", "혼자", "아파", "죄송", "울지", "결국", "…", "..."],
  shy: ["부끄", "두근", "잠깐만", "바보", "몰라", "그, 그게", "얼굴", "///"],
  smirk: ["흥", "재밌", "예상대로", "겨우", "역시", "가소", "어디 한번"],
  joy: ["고마워", "해냈", "좋아", "기뻐", "다행", "축하", "최고", "행복"],
};

export const EXPRESSION_PRESET_TABLE: Readonly<
  Record<
    CutEmotion,
    {
      readonly eyebrowArch: number;
      readonly eyebrowY: number;
      readonly furrow: number;
      readonly eyeOpen: number;
      readonly pupilScale: number;
      readonly highlight: "clear" | "sparkle" | "tremble" | "shadowed";
      readonly mouthShape: "neutral" | "open-shout" | "gasp" | "soft-smile" | "smirk" | "quiver" | "small-pout";
      readonly mouthOpen: number;
      readonly cornerLift: number;
      readonly blushOpacity: number;
      readonly blushStyle: "none" | "soft-pink" | "heavy-fluster" | "pale-shadow";
      readonly blushTintOklch: string;
    }
  >
> = {
  calm: {
    eyebrowArch: 2, eyebrowY: 0, furrow: 0.05,
    eyeOpen: 0.84, pupilScale: 1.0, highlight: "clear",
    mouthShape: "neutral", mouthOpen: 0.08, cornerLift: 0.1,
    blushOpacity: 0, blushStyle: "none", blushTintOklch: "oklch(0.78 0.06 16)",
  },
  joy: {
    eyebrowArch: 10, eyebrowY: -4, furrow: 0,
    eyeOpen: 0.72, pupilScale: 1.06, highlight: "sparkle",
    mouthShape: "soft-smile", mouthOpen: 0.34, cornerLift: 0.85,
    blushOpacity: 0.35, blushStyle: "soft-pink", blushTintOklch: "oklch(0.76 0.14 14)",
  },
  sad: {
    eyebrowArch: -14, eyebrowY: -2, furrow: 0.55,
    eyeOpen: 0.64, pupilScale: 0.94, highlight: "tremble",
    mouthShape: "quiver", mouthOpen: 0.14, cornerLift: -0.65,
    blushOpacity: 0.22, blushStyle: "pale-shadow", blushTintOklch: "oklch(0.68 0.06 250)",
  },
  angry: {
    eyebrowArch: 24, eyebrowY: 6, furrow: 0.95,
    eyeOpen: 0.88, pupilScale: 0.82, highlight: "shadowed",
    mouthShape: "open-shout", mouthOpen: 0.82, cornerLift: -0.5,
    blushOpacity: 0.28, blushStyle: "heavy-fluster", blushTintOklch: "oklch(0.62 0.2 26)",
  },
  shocked: {
    eyebrowArch: 18, eyebrowY: -9, furrow: 0.25,
    eyeOpen: 1.0, pupilScale: 0.62, highlight: "tremble",
    mouthShape: "gasp", mouthOpen: 0.74, cornerLift: -0.25,
    blushOpacity: 0.3, blushStyle: "pale-shadow", blushTintOklch: "oklch(0.64 0.07 255)",
  },
  shy: {
    eyebrowArch: -8, eyebrowY: -3, furrow: 0.3,
    eyeOpen: 0.78, pupilScale: 1.08, highlight: "sparkle",
    mouthShape: "small-pout", mouthOpen: 0.18, cornerLift: 0.2,
    blushOpacity: 0.78, blushStyle: "heavy-fluster", blushTintOklch: "oklch(0.73 0.18 12)",
  },
  smirk: {
    eyebrowArch: 9, eyebrowY: 1, furrow: 0.22,
    eyeOpen: 0.68, pupilScale: 0.92, highlight: "clear",
    mouthShape: "smirk", mouthOpen: 0.12, cornerLift: 0.68,
    blushOpacity: 0, blushStyle: "none", blushTintOklch: "oklch(0.78 0.06 16)",
  },
};

export const SCENE_ZONE_LABELS: Readonly<Record<SceneZoneId, string>> = {
  "empty-desk": "빈 책상·집무실",
  "cafe-table": "카페 테이블",
  "street-signboard": "거리 상가·간판",
  "corridor-wall": "복도·벽면 게시판",
};

export const SCENE_GENRE_ERA_LABELS: Readonly<Record<SceneGenreEra, string>> = {
  rofan: "로판·중세 귀족",
  "seoul-modern": "서울 현대물",
  murim: "정통 무협",
  academy: "현대 학원물",
};

export const ERA_ZONE_PROPS: Readonly<Record<SceneGenreEra, Readonly<Record<SceneZoneId, readonly string[]>>>> = {
  rofan: {
    "empty-desk": ["황동 촛대", "밀랍 봉인 도장", "깃털 펜과 잉크병", "양피지 서류 뭉치", "엔티크 탁상시계"],
    "cafe-table": ["본차이나 찻잔 세트", "3단 애프터눈 티 트레이", "장미 유리 화병", "레이스 테이블 러너", "은제 설탕집게"],
    "street-signboard": ["단철 가로등", "마차 정류 표지판", "화분 걸이 창틀", "석조 분수대 난간", "천막 차양"],
    "corridor-wall": ["금장 가문 문장 액자", "대리석 흉상 받침대", "벨벳 커튼 묶음", "벽부착 2구 촛대", "붉은 카펫 러너"],
  },
  "seoul-modern": {
    "empty-desk": ["듀얼 모니터 스탠드", "텀블러", "포스트잇 메모 패드", "무선 키보드", "탁상 LED 스탠드"],
    "cafe-table": ["아이스 아메리카노 컵", "크루아상 디저트 접시", "진동벨", "테이블 냅킨통", "충전 멀티탭"],
    "street-signboard": ["입간판 A형 배너", "횡단보도 볼라드", "배달 오토바이 거치대", "편의점 파라솔", "전봇대 도로명 표지"],
    "corridor-wall": ["엘리베이터 층별 안내판", "소화전 함", "입주사 명패 보드", "우산 꽂이", "공기청정기"],
  },
  murim: {
    "empty-desk": ["청자 벼루와 먹", "족자 두루마리", "옥제 문진", "향로", "호롱불 등잔"],
    "cafe-table": ["백자 주전자와 찻잔", "대나무 젓가락통", "만두 찜기", "술독", "옻칠 쟁반"],
    "street-signboard": ["붉은 비단 초롱", "목재 현판 기둥", "말 묶는 말뚝", "비단 깃발", "약재 건조 소쿠리"],
    "corridor-wall": ["무공 비급 족자", "목검 거치대", "청동 화로", "창호지 격자문", "현판 액자"],
  },
  academy: {
    "empty-desk": ["전공 교과서 묶음", "필통과 형광펜", "시간표 아크릴 스탠드", "학생증 목걸이", "우유팩"],
    "cafe-table": ["딸기우유와 소보로빵", "태블릿 필기 노트", "무선 이어폰 케이스", "형광펜 3종", "에코백"],
    "street-signboard": ["학교 앞 문구점 가판대", "자전거 거치대", "스쿨존 표지판", "분식집 어닝", "음료 자판기"],
    "corridor-wall": ["주간 학사일정 게시판", "동아리 모집 포스터", "개인 사물함 열", "급훈 액자", "실내화 선반"],
  },
};

export const ERA_CURATED_HANGUL_SIGNS: Readonly<
  Record<SceneGenreEra, readonly { readonly textKo: string; readonly placementKo: string; readonly fontToneKo: string }[]>
> = {
  rofan: [
    { textKo: "황실 보석 세공소", placementKo: "상가 1층 목재 현판", fontToneKo: "고전 명조 세리프" },
    { textKo: "은방울 약제실", placementKo: "단철 돌출 간판", fontToneKo: "장식 필기 명조" },
    { textKo: "벨로아 양장점", placementKo: "쇼윈도 금박 레터링", fontToneKo: "우아한 궁서 변형" },
  ],
  "seoul-modern": [
    { textKo: "별빛 수제 커피", placementKo: "1층 전면 채널 간판", fontToneKo: "깔끔한 산세리프 고딕" },
    { textKo: "종로 24시 분식", placementKo: "측면 돌출 LED 간판", fontToneKo: "굵은 돋움 간판체" },
    { textKo: "새벽 동네 책방", placementKo: "유리창 시트지 문구", fontToneKo: "따뜻한 손글씨 명조" },
  ],
  murim: [
    { textKo: "청풍 객잔", placementKo: "처마 중앙 목각 현판", fontToneKo: "강직한 해서 붓글씨" },
    { textKo: "백초 약방", placementKo: "비단 세로 깃발", fontToneKo: "고풍스러운 붓 서예" },
    { textKo: "만금 전당포", placementKo: "문설주 목판 간판", fontToneKo: "묵직한 목판 각자체" },
  ],
  academy: [
    { textKo: "제1 학생회실", placementKo: "복도 문 위 아크릴 표찰", fontToneKo: "단정한 학교 고딕" },
    { textKo: "방과후 미술부 모집", placementKo: "복도 코르크 게시판", fontToneKo: "경쾌한 포스터 헤드라인" },
    { textKo: "매점 · 갓 구운 빵", placementKo: "매점 입구 상단 배너", fontToneKo: "둥근 산세리프" },
  ],
};

export const FLAW_CATEGORY_LABELS: Readonly<Record<ManuscriptFlawCategory, string>> = {
  "missing-accessory": "소품 누락(안경·귀걸이)",
  "mirrored-text": "좌우 반전 텍스트",
  "unfilled-white-gap": "칠하다 만 흰 틈",
  "mismatched-balloon-tail": "화자 불일치 말풍선 꼬리",
  "abnormal-finger-count": "손가락 개수 이상",
};
