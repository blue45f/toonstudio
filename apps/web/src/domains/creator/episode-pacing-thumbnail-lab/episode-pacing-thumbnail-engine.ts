import { assertEpisodeCuts, countDialogueChars, suggestBalloonTextSplit, uniqueEpisodeId } from "./episode-dialogue-contract";
import { assertDiagnosticSnapshot, assertOklchColor, assertThumbnailInputs, requireFinitePacing } from "./thumbnail-input-contract";

export { countDialogueChars, suggestBalloonTextSplit, applySplitSuggestionToCuts } from "./episode-dialogue-contract";

/**
 * Wave 44F — 독자 이탈 휴리스틱 · 대사 벽 감지 · 썸네일 A/B 주목도 진단 엔진.
 *
 * - 초반 3컷 훅 밀도 · 말풍선 대사 벽(1말풍선 42자 초과 또는 컷당 4개 이상) · 클리프행어 긴장도 분석(`analyzeEpisodeHookAndDensity`)
 * - 3종 플랫폼 썸네일(`naver-list-202x120`, `kakao-square-160x160`, `global-banner-390x220`) 크롭 · 눈/얼굴 잘림 · 배지(UP/휴재/19) 충돌 ·
 *   축소 타이틀 높이(>= 10px) · WCAG/APCA 대비 근사 A/B 비교기(`compareThumbnailCandidates`)
 * - 모든 점수와 이탈 위험은 실측 독자 로그가 아닌 규칙 기반 휴리스틱 추정(`dataSourceKind: "heuristic-estimate"`)임을 명시한다.
 */

export type HeuristicDataSourceKind = "heuristic-estimate";
export const HEURISTIC_DATA_SOURCE_KIND: HeuristicDataSourceKind = "heuristic-estimate";
export const BALLOON_MAX_CHARS = 42;
export const CUT_BALLOON_WARNING_MIN = 4;
export const OPENING_HOOK_CUT_COUNT = 3;
export const MIN_THUMBNAIL_TITLE_PX = 10;
export const HEURISTIC_DISCLAIMER_KO = "모든 점수는 실측 독자 로그가 아닌 규칙 기반 휴리스틱 추정치입니다. 플랫폼 크기·대비 근사·배지 배치는 예시이며 현행 공식 규격을 확인하지 않습니다.";
export const HEURISTIC_DISCLAIMER_EN = "All hook, drop-off risk, and thumbnail attention scores are rule-based heuristic estimates, not measured reader telemetry. Platform sizes, contrast approximations and badge placement are examples, not current platform requirements.";

export type CutEmotionState = "neutral" | "curious" | "tense" | "shock" | "anger" | "warmth" | "sorrow" | "resolve";
export type CutActionShift = "none" | "subtle" | "clear" | "impact";
export type CutNarrativeRole = "establishing" | "dialogue" | "action" | "reaction" | "reveal" | "cliffhanger";
export type BalloonKind = "speech" | "narration" | "thought" | "sfx";
export type EndingHookKind = "none" | "question" | "reveal" | "threat" | "emotional-turn";
export type RiskLevel = "low" | "moderate" | "high" | "critical";
export type WarningSeverity = "info" | "warn" | "critical";
export type DialogueWallReason = "balloon-over-42-chars" | "cut-over-4-balloons";
export type PacingWarningCode =
  | "dialogue-wall-balloon-length" | "dialogue-wall-balloon-count" | "opening-flat-emotion"
  | "opening-static-action" | "opening-hook-stagnant" | "opening-dialogue-wall"
  | "weak-cliffhanger-ending" | "insufficient-opening-cuts";

export interface DialogueBalloonInput { readonly id: string; readonly speaker: string; readonly text: string; readonly kind: BalloonKind; }
export interface EpisodeCutInput {
  readonly id: string; readonly labelKo: string; readonly labelEn: string;
  readonly role: CutNarrativeRole; readonly emotion: CutEmotionState; readonly actionShift: CutActionShift;
  readonly tensionLevel: number; readonly endingHookKind?: EndingHookKind; readonly balloons: readonly DialogueBalloonInput[];
}
export interface AnalyzeEpisodeHookOptions {
  readonly episodeTitle?: string; readonly cuts: readonly EpisodeCutInput[];
  readonly maxCharsPerBalloon?: number; readonly balloonWarningThreshold?: number;
}
export interface BalloonAudit extends DialogueBalloonInput {
  readonly charCount: number; readonly hangulCharCount: number; readonly exceedsCharLimit: boolean;
  readonly overflowChars: number; readonly suggestedChunks: readonly string[];
}
export interface DialogueSplitSuggestion {
  readonly id: string; readonly cutIndex: number; readonly cutId: string; readonly balloonId: string | null;
  readonly reason: DialogueWallReason; readonly originalText: string | null;
  readonly suggestedChunks: readonly string[]; readonly recommendedCutSplitIndex: number | null;
  readonly sourceBalloons?: readonly DialogueBalloonInput[];
  readonly adviceKo: string; readonly adviceEn: string;
}
export interface EpisodeCutAudit {
  readonly index: number; readonly cutId: string; readonly labelKo: string; readonly labelEn: string;
  readonly role: CutNarrativeRole; readonly emotion: CutEmotionState; readonly actionShift: CutActionShift;
  readonly tensionLevel: number; readonly isOpeningCut: boolean; readonly isClosingCut: boolean;
  readonly balloonCount: number; readonly totalCharCount: number; readonly maxBalloonCharCount: number;
  readonly overlongBalloonCount: number; readonly hasDialogueWall: boolean;
  readonly wallReasons: readonly DialogueWallReason[]; readonly estimatedRetentionPct: number;
  readonly balloons: readonly BalloonAudit[];
}
export interface EpisodePacingWarning {
  readonly code: PacingWarningCode; readonly severity: WarningSeverity; readonly affectedCutIndices: readonly number[];
  readonly titleKo: string; readonly titleEn: string; readonly detailKo: string; readonly detailEn: string;
  readonly prescriptionKo: string; readonly prescriptionEn: string;
}
export interface OpeningThreeCutAudit {
  readonly evaluatedCutCount: number; readonly uniqueEmotions: readonly CutEmotionState[];
  readonly emotionTransitionCount: number; readonly hasEmotionChange: boolean;
  readonly actionBeatCount: number; readonly hasActionChange: boolean;
  readonly openingDialogueWallCount: number; readonly openingHookScore: number; readonly openingDropOffRiskScore: number;
}
export interface CliffhangerEndingAudit {
  readonly closingCutIndex: number; readonly closingRole: CutNarrativeRole | null;
  readonly closingTension: number; readonly tensionRiseFromPrev: number; readonly endingHookKind: EndingHookKind;
  readonly cliffhangerTensionScore: number; readonly verdict: "strong" | "moderate" | "weak";
  readonly prescriptionKo: string; readonly prescriptionEn: string;
}
export interface EpisodePacingSummary {
  readonly cutCount: number; readonly totalBalloons: number; readonly totalChars: number;
  readonly dialogueWallCutCount: number; readonly overlongBalloonCount: number; readonly overcrowdedCutCount: number;
  readonly openingHookScore: number; readonly dialogueDensityScore: number; readonly cliffhangerTensionScore: number;
  readonly overallPacingScore: number; readonly dropOffRiskScore: number;
  readonly dropOffRiskLevel: RiskLevel; readonly estimatedCompletionPct: number;
}
export interface EpisodeHookDensityAnalysis {
  readonly dataSourceKind: HeuristicDataSourceKind; readonly heuristicDisclaimerKo: string; readonly heuristicDisclaimerEn: string;
  readonly episodeTitle: string; readonly maxCharsPerBalloon: number; readonly balloonWarningThreshold: number;
  readonly cuts: readonly EpisodeCutAudit[]; readonly openingThreeCuts: OpeningThreeCutAudit;
  readonly cliffhanger: CliffhangerEndingAudit; readonly splitSuggestions: readonly DialogueSplitSuggestion[];
  readonly warnings: readonly EpisodePacingWarning[]; readonly summary: EpisodePacingSummary;
}

export type EpisodePresetId = "overloaded-opening" | "tight-action-hook" | "mystery-cliffhanger";
export interface EpisodeHookPreset {
  readonly id: EpisodePresetId; readonly labelKo: string; readonly labelEn: string;
  readonly descriptionKo: string; readonly descriptionEn: string;
  readonly episodeTitle: string; readonly cuts: readonly EpisodeCutInput[];
}

export type ThumbnailPlatformId = "naver-list-202x120" | "kakao-square-160x160" | "global-banner-390x220";
export type ThumbnailBadgeKind = "UP" | "휴재" | "19";
export type BadgeCorner = "top-left" | "top-right";
export type ContrastGrade = "excellent" | "good" | "borderline" | "fail";
export type ThumbnailTonePresetId = "noir-ivory" | "twilight-gold" | "paper-ink" | "pastel-mist" | "crimson-white";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface Rect2D { readonly x: number; readonly y: number; readonly width: number; readonly height: number; }
export type NormalizedRect = Rect2D;
export type PixelRect = Rect2D;
export interface ThumbnailPlatformSpec {
  readonly id: ThumbnailPlatformId; readonly labelKo: string; readonly labelEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly widthPx: number; readonly heightPx: number; readonly safeMarginPx: number; readonly minTitlePx: number;
}
export interface ThumbnailTonePreset {
  readonly id: ThumbnailTonePresetId; readonly labelKo: string; readonly labelEn: string;
  readonly backdropOklch: OklchColor; readonly titleOklch: OklchColor; readonly subjectOklch: OklchColor;
  readonly backdropSurfaceToken: "dark" | "cool" | "paper" | "muted" | "accent";
  readonly titleSurfaceToken: "light" | "dark" | "accent";
}
export interface ThumbnailCandidateInput {
  readonly id: "A" | "B"; readonly labelKo: string; readonly labelEn: string; readonly titleText: string;
  readonly sourceWidthPx: number; readonly sourceHeightPx: number;
  readonly focalX: number; readonly focalY: number; readonly zoom: number;
  readonly faceBox: NormalizedRect; readonly eyeLineRatioInFace: number;
  readonly titleBox: NormalizedRect; readonly sourceTitleFontPx: number; readonly hasTitleScrim: boolean;
  readonly tonePresetId: ThumbnailTonePresetId;
  readonly backdropOklch: OklchColor; readonly titleOklch: OklchColor; readonly subjectOklch: OklchColor;
}
export interface ThumbnailBadgePlacement { readonly badge: ThumbnailBadgeKind; readonly corner: BadgeCorner; readonly rect: PixelRect; }
export interface ThumbnailBadgeCollision {
  readonly badge: ThumbnailBadgeKind; readonly corner: BadgeCorner; readonly target: "eyes" | "face" | "title";
  readonly severity: "warn" | "critical"; readonly overlapRatio: number; readonly badgeRect: PixelRect;
  readonly messageKo: string; readonly messageEn: string;
}
export interface ContrastMetrics {
  readonly backdropLuminance: number; readonly effectiveBackdropLuminance: number;
  readonly titleLuminance: number; readonly subjectLuminance: number;
  readonly wcagContrastRatio: number; readonly apcaLc: number; readonly apcaAbsLc: number;
  readonly subjectBackdropContrast: number; readonly grade: ContrastGrade;
}
export interface ThumbnailPrescription {
  readonly id: string; readonly platformId: ThumbnailPlatformId; readonly candidateId: "A" | "B";
  readonly severity: WarningSeverity; readonly category: "eye-crop" | "face-crop" | "badge-collision" | "title-size" | "contrast";
  readonly messageKo: string; readonly messageEn: string;
}
export interface ThumbnailPlatformCandidateAudit {
  readonly platform: ThumbnailPlatformSpec; readonly candidateId: "A" | "B";
  readonly scaleFactor: number; readonly cropRectInSource: PixelRect;
  readonly projectedFaceRect: PixelRect; readonly projectedEyeBandRect: PixelRect; readonly projectedTitleRect: PixelRect;
  readonly badgePlacements: readonly ThumbnailBadgePlacement[];
  readonly eyeVisibleRatio: number; readonly faceVisibleRatio: number; readonly eyeClipped: boolean; readonly faceClipped: boolean;
  readonly scaledTitleFontPx: number; readonly titleMeetsMinHeight: boolean; readonly titleClipped: boolean;
  readonly badgeCollisions: readonly ThumbnailBadgeCollision[]; readonly contrast: ContrastMetrics;
  readonly framingScore: number; readonly badgeSafetyScore: number;
  readonly titleLegibilityScore: number; readonly contrastScore: number; readonly totalScore: number;
  readonly prescriptions: readonly ThumbnailPrescription[];
}
export interface PlatformAbBreakdown {
  readonly platform: ThumbnailPlatformSpec;
  readonly candidateA: ThumbnailPlatformCandidateAudit; readonly candidateB: ThumbnailPlatformCandidateAudit;
  readonly winner: "A" | "B" | "tie"; readonly scoreDelta: number;
}
export interface CompareThumbnailCandidatesOptions {
  readonly candidateA: ThumbnailCandidateInput; readonly candidateB: ThumbnailCandidateInput;
  readonly activeBadges?: readonly ThumbnailBadgeKind[];
  readonly badgeCornerOverrides?: Partial<Record<ThumbnailBadgeKind, BadgeCorner>>;
}
export interface ThumbnailAbComparisonResult {
  readonly dataSourceKind: HeuristicDataSourceKind; readonly heuristicDisclaimerKo: string; readonly heuristicDisclaimerEn: string;
  readonly activeBadges: readonly ThumbnailBadgeKind[]; readonly platforms: readonly PlatformAbBreakdown[];
  readonly aggregateScoreA: number; readonly aggregateScoreB: number;
  readonly winner: "A" | "B" | "tie"; readonly scoreDelta: number;
  readonly winnerSummaryKo: string; readonly winnerSummaryEn: string;
  readonly prescriptionsA: readonly ThumbnailPrescription[]; readonly prescriptionsB: readonly ThumbnailPrescription[];
}

export const THUMBNAIL_PLATFORM_IDS: readonly ThumbnailPlatformId[] = ["naver-list-202x120", "kakao-square-160x160", "global-banner-390x220"];
export const THUMBNAIL_BADGE_KINDS: readonly ThumbnailBadgeKind[] = ["UP", "휴재", "19"];

const DEFAULT_PLATFORM_SPEC: ThumbnailPlatformSpec = {
  id: "naver-list-202x120", labelKo: "네이버 목록 202×120", labelEn: "Naver List 202×120",
  shortLabelKo: "네이버 202×120", shortLabelEn: "Naver 202×120", widthPx: 202, heightPx: 120, safeMarginPx: 6, minTitlePx: MIN_THUMBNAIL_TITLE_PX,
};
export const THUMBNAIL_PLATFORM_SPECS: readonly ThumbnailPlatformSpec[] = [
  DEFAULT_PLATFORM_SPEC,
  { id: "kakao-square-160x160", labelKo: "카카오 정방형 160×160", labelEn: "Kakao Square 160×160", shortLabelKo: "카카오 160×160", shortLabelEn: "Kakao 160×160", widthPx: 160, heightPx: 160, safeMarginPx: 6, minTitlePx: MIN_THUMBNAIL_TITLE_PX },
  { id: "global-banner-390x220", labelKo: "글로벌 배너 390×220", labelEn: "Global Banner 390×220", shortLabelKo: "배너 390×220", shortLabelEn: "Banner 390×220", widthPx: 390, heightPx: 220, safeMarginPx: 10, minTitlePx: MIN_THUMBNAIL_TITLE_PX },
];

const DEFAULT_TONE_PRESET: ThumbnailTonePreset = {
  id: "noir-ivory", labelKo: "누아르 암부 · 아이보리 타이틀", labelEn: "Noir Dark · Ivory Title",
  backdropOklch: { l: 0.19, c: 0.025, h: 255 }, titleOklch: { l: 0.96, c: 0.015, h: 85 },
  subjectOklch: { l: 0.82, c: 0.055, h: 55 }, backdropSurfaceToken: "dark", titleSurfaceToken: "light",
};
export const THUMBNAIL_TONE_PRESETS: readonly ThumbnailTonePreset[] = [
  DEFAULT_TONE_PRESET,
  { id: "twilight-gold", labelKo: "황혼 슬레이트 · 웜 앰버 타이틀", labelEn: "Twilight Slate · Warm Amber", backdropOklch: { l: 0.28, c: 0.045, h: 245 }, titleOklch: { l: 0.88, c: 0.12, h: 82 }, subjectOklch: { l: 0.86, c: 0.04, h: 65 }, backdropSurfaceToken: "cool", titleSurfaceToken: "light" },
  { id: "paper-ink", labelKo: "화이트 페이퍼 · 먹색 타이틀", labelEn: "Bright Paper · Ink Title", backdropOklch: { l: 0.94, c: 0.01, h: 90 }, titleOklch: { l: 0.2, c: 0.02, h: 255 }, subjectOklch: { l: 0.36, c: 0.05, h: 250 }, backdropSurfaceToken: "paper", titleSurfaceToken: "dark" },
  { id: "pastel-mist", labelKo: "저대비 파스텔 안개 (위험 예시)", labelEn: "Low-Contrast Pastel Mist", backdropOklch: { l: 0.72, c: 0.035, h: 230 }, titleOklch: { l: 0.83, c: 0.025, h: 80 }, subjectOklch: { l: 0.66, c: 0.03, h: 220 }, backdropSurfaceToken: "muted", titleSurfaceToken: "light" },
  { id: "crimson-white", labelKo: "강렬 아틀리에 포인트 · 화이트", labelEn: "Bold Atelier Accent · White", backdropOklch: { l: 0.42, c: 0.14, h: 28 }, titleOklch: { l: 0.97, c: 0.01, h: 90 }, subjectOklch: { l: 0.9, c: 0.03, h: 75 }, backdropSurfaceToken: "accent", titleSurfaceToken: "light" },
];

const mkB = (id: string, speaker: string, kind: BalloonKind, text: string): DialogueBalloonInput => ({ id, speaker, kind, text });
const mkC = (id: string, labelKo: string, labelEn: string, role: CutNarrativeRole, emotion: CutEmotionState, actionShift: CutActionShift, tensionLevel: number, balloons: readonly DialogueBalloonInput[], endingHookKind?: EndingHookKind): EpisodeCutInput =>
  ({ id, labelKo, labelEn, role, emotion, actionShift, tensionLevel, balloons, endingHookKind });

const DEFAULT_EPISODE_PRESET: EpisodeHookPreset = {
  id: "overloaded-opening", labelKo: "대사 벽·정체 오프닝 (진단 연습)", labelEn: "Dialogue Wall & Flat Opening",
  descriptionKo: "초반 3컷 감정·행동 정체와 42자 초과 말풍선·4개 과밀 컷·약한 엔딩이 포함된 초고입니다.",
  descriptionEn: "Draft featuring flat opening 3 cuts, a >42-char speech wall, a 4-balloon cut, and a soft ending.",
  episodeTitle: "EP.01 계약의 밤 (초고)",
  cuts: [
    mkC("cut-1", "1컷 · 사무실 전경", "Cut 1 · Office Wide", "establishing", "neutral", "none", 32, [mkB("b-1-1", "내레이션", "narration", "십 년 전 북부 탑이 무너진 뒤 길드 평의회는 모든 마도 계약서를 금고 깊은 곳에 봉인하고 누구도 열지 못하게 규정했다.")]),
    mkC("cut-2", "2컷 · 복도 대화", "Cut 2 · Hallway Talk", "dialogue", "neutral", "none", 34, [
      mkB("b-2-1", "서연", "speech", "오늘 보고서 마감은 다섯 시야."), mkB("b-2-2", "도윤", "speech", "알아, 서류철은 책상 위에 올려뒀어."),
      mkB("b-2-3", "서연", "speech", "그럼 회의실로 먼저 내려가 있을게."), mkB("b-2-4", "도윤", "thought", "아직 열쇠 번호를 확인하지 못했는데."),
    ]),
    mkC("cut-3", "3컷 · 책상 정면", "Cut 3 · Desk Front", "dialogue", "neutral", "none", 36, [mkB("b-3-1", "도윤", "speech", "우선 커피부터 한 잔 마시고 정리하자.")]),
    mkC("cut-4", "4컷 · 퇴근 복도", "Cut 4 · Closing Corridor", "dialogue", "neutral", "subtle", 40, [mkB("b-4-1", "도윤", "speech", "내일 아침에 다시 확인해 보지 뭐.")], "none"),
  ],
};

export const EPISODE_HOOK_PRESETS: readonly EpisodeHookPreset[] = [
  DEFAULT_EPISODE_PRESET,
  {
    id: "tight-action-hook", labelKo: "고흡인력 3컷 훅 · 반전 엔딩 (권장)", labelEn: "Tight 3-Cut Hook & Cliffhanger",
    descriptionKo: "초반 3컷 내 감정·행동 전환, 42자 이하 간결 대사, 강렬한 말미 클리프행어 기준안입니다.",
    descriptionEn: "Recommended pacing with dynamic opening shifts, concise balloons, and a sharp cliffhanger.",
    episodeTitle: "EP.01 계약의 밤 (개정안)",
    cuts: [
      mkC("cut-1", "1컷 · 봉인 금고 균열", "Cut 1 · Vault Fracture", "establishing", "curious", "subtle", 54, [mkB("b-1-1", "내레이션", "narration", "봉인된 금고 문틈으로 붉은 서리가 새어 나왔다.")]),
      mkC("cut-2", "2컷 · 열쇠를 낚아채는 손", "Cut 2 · Snatching Key", "action", "tense", "clear", 72, [mkB("b-2-1", "서연", "speech", "열지 마! 안쪽 인장이 이미 깨졌어."), mkB("b-2-2", "도윤", "speech", "늦었어. 계약서에 내 이름이 찍혔다.")]),
      mkC("cut-3", "3컷 · 갈라지는 바닥", "Cut 3 · Floor Splits", "reaction", "shock", "impact", 84, [mkB("b-3-1", "서연", "speech", "설마… 열 번째 증인이 너였어?!")]),
      mkC("cut-4", "4컷 · 어둠 속 목소리", "Cut 4 · Voice In Dark", "cliffhanger", "shock", "impact", 94, [mkB("b-4-1", "그림자", "speech", "드디어 돌아왔구나, 진짜 배신자.")], "reveal"),
    ],
  },
  {
    id: "mystery-cliffhanger", labelKo: "미스터리 심리전 · 말미 긴장 점검", labelEn: "Mystery Tension & Ending Audit",
    descriptionKo: "초반 3컷은 매끄럽고 4컷 편지 대사가 과밀한 미스터리 클리프행어 예시입니다.",
    descriptionEn: "Smooth opening mystery with an overlong letter balloon and question cliffhanger.",
    episodeTitle: "EP.04 사라진 초대장",
    cuts: [
      mkC("cut-1", "1컷 · 빗속의 빈 우산", "Cut 1 · Abandoned Umbrella", "establishing", "curious", "subtle", 48, [mkB("b-1-1", "내레이션", "narration", "자정이 넘은 정원에 우산 하나만 거꾸로 놓여 있었다.")]),
      mkC("cut-2", "2컷 · 젖은 편지 개봉", "Cut 2 · Opening Letter", "action", "tense", "clear", 66, [mkB("b-2-1", "지후", "thought", "발신인 칸에 내 필체가 그대로 적혀 있다.")]),
      mkC("cut-3", "3컷 · 뒤돌아보는 시선", "Cut 3 · Turning Glance", "reaction", "shock", "clear", 76, [mkB("b-3-1", "지후", "speech", "누구야? 거기 서 있는 거 다 보여.")]),
      mkC("cut-4", "4컷 · 초대장의 숨겨진 문장", "Cut 4 · Hidden Clause", "cliffhanger", "tense", "impact", 88, [mkB("b-4-1", "편지", "narration", "만약 네가 이 문장을 읽고 있다면 오늘 밤 연회장에서 가장 먼저 사라질 손님은 초대장을 보낸 바로 너다.")], "question"),
    ],
  },
];

export const DEFAULT_THUMBNAIL_CANDIDATE_A: ThumbnailCandidateInput = {
  id: "A", labelKo: "후보 A · 상단 밀착·소형 타이틀", labelEn: "Candidate A · High Face & Small Title",
  titleText: "계약의 밤", sourceWidthPx: 1200, sourceHeightPx: 900, focalX: 0.62, focalY: 0.24, zoom: 1.12,
  faceBox: { x: 0.66, y: 0.05, width: 0.26, height: 0.36 }, eyeLineRatioInFace: 0.38,
  titleBox: { x: 0.06, y: 0.07, width: 0.44, height: 0.14 }, sourceTitleFontPx: 48, hasTitleScrim: false, tonePresetId: "pastel-mist",
  backdropOklch: { l: 0.72, c: 0.035, h: 230 }, titleOklch: { l: 0.83, c: 0.025, h: 80 }, subjectOklch: { l: 0.66, c: 0.03, h: 220 },
};
export const DEFAULT_THUMBNAIL_CANDIDATE_B: ThumbnailCandidateInput = {
  id: "B", labelKo: "후보 B · 중앙 안전영역·고대비 타이틀", labelEn: "Candidate B · Centered Safe & High Contrast",
  titleText: "계약의 밤", sourceWidthPx: 1200, sourceHeightPx: 900, focalX: 0.5, focalY: 0.48, zoom: 1.08,
  faceBox: { x: 0.38, y: 0.24, width: 0.26, height: 0.38 }, eyeLineRatioInFace: 0.4,
  titleBox: { x: 0.16, y: 0.72, width: 0.68, height: 0.19 }, sourceTitleFontPx: 82, hasTitleScrim: true, tonePresetId: "noir-ivory",
  backdropOklch: { l: 0.19, c: 0.025, h: 255 }, titleOklch: { l: 0.96, c: 0.015, h: 85 }, subjectOklch: { l: 0.82, c: 0.055, h: 55 },
};

const clamp = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
const round1 = (v: number): number => Math.round(v * 10) / 10;
const round2 = (v: number): number => Math.round(v * 100) / 100;
const actionShiftWeight = (s: CutActionShift): number => (s === "impact" ? 3 : s === "clear" ? 2 : s === "subtle" ? 1 : 0);
const classifyRiskLevel = (score: number): RiskLevel => (score >= 70 ? "critical" : score >= 48 ? "high" : score >= 26 ? "moderate" : "low");

export const getThumbnailPlatformSpec = (id: ThumbnailPlatformId): ThumbnailPlatformSpec => THUMBNAIL_PLATFORM_SPECS.find((s) => s.id === id) ?? DEFAULT_PLATFORM_SPEC;
export const getThumbnailTonePreset = (id: ThumbnailTonePresetId): ThumbnailTonePreset => THUMBNAIL_TONE_PRESETS.find((p) => p.id === id) ?? DEFAULT_TONE_PRESET;
export const getEpisodeHookPreset = (id: EpisodePresetId): EpisodeHookPreset => EPISODE_HOOK_PRESETS.find((p) => p.id === id) ?? DEFAULT_EPISODE_PRESET;

const mkWarn = (
  code: PacingWarningCode, severity: WarningSeverity, affectedCutIndices: readonly number[],
  titleKo: string, titleEn: string, detailKo: string, detailEn: string, prescriptionKo: string, prescriptionEn: string,
): EpisodePacingWarning => ({ code, severity, affectedCutIndices, titleKo, titleEn, detailKo, detailEn, prescriptionKo, prescriptionEn });

/** 초반 3컷 흡인력, 말풍선 텍스트 벽(42자 초과 / 컷당 4개 이상), 클리프행어 긴장도를 규칙 기반으로 진단한다. */
export function analyzeEpisodeHookAndDensity(options: AnalyzeEpisodeHookOptions): EpisodeHookDensityAnalysis {
  assertEpisodeCuts(options.cuts);
  requireFinitePacing([options.maxCharsPerBalloon ?? BALLOON_MAX_CHARS, options.balloonWarningThreshold ?? CUT_BALLOON_WARNING_MIN]);
  if ((options.episodeTitle?.length ?? 0) > 4096) throw new RangeError("회차 제목 상한은 4096자입니다.");
  const maxCharsPerBalloon = Math.min(256, Math.max(12, Math.floor(options.maxCharsPerBalloon ?? BALLOON_MAX_CHARS)));
  const balloonWarningThreshold = Math.min(32, Math.max(2, Math.floor(options.balloonWarningThreshold ?? CUT_BALLOON_WARNING_MIN)));
  const episodeTitle = options.episodeTitle?.trim() || "회차 초고";
  const cuts = options.cuts;

  const warnings: EpisodePacingWarning[] = [];
  const splitSuggestions: DialogueSplitSuggestion[] = [];
  const suggestionIds = new Set<string>();
  function nextSuggestionId(base: string): string {
    const id = uniqueEpisodeId(base, suggestionIds);
    suggestionIds.add(id);
    return id;
  }
  const auditedCuts: EpisodeCutAudit[] = [];
  let totalBalloons = 0; let totalChars = 0; let dialogueWallCutCount = 0;
  let overlongBalloonCount = 0; let overcrowdedCutCount = 0; let runningRetention = 100;

  cuts.forEach((cut, index) => {
    const isOpeningCut = index < OPENING_HOOK_CUT_COUNT;
    const isClosingCut = index === cuts.length - 1;
    const clampedTension = clamp(Math.round(cut.tensionLevel), 0, 100);
    let cutCharCount = 0; let maxBalloonCharCount = 0; let cutOverlongCount = 0;

    const balloonAudits: BalloonAudit[] = cut.balloons.map((balloon) => {
      const { charCount, hangulCharCount } = countDialogueChars(balloon.text);
      const exceedsCharLimit = charCount > maxCharsPerBalloon;
      const suggestedChunks = exceedsCharLimit ? suggestBalloonTextSplit(balloon.text, maxCharsPerBalloon) : [];
      cutCharCount += charCount; maxBalloonCharCount = Math.max(maxBalloonCharCount, charCount);
      if (exceedsCharLimit) {
        cutOverlongCount += 1; overlongBalloonCount += 1;
        splitSuggestions.push({
          id: nextSuggestionId(`split-${cut.id}-${balloon.id}`), cutIndex: index, cutId: cut.id, balloonId: balloon.id,
          reason: "balloon-over-42-chars", originalText: balloon.text, suggestedChunks, recommendedCutSplitIndex: null,
          adviceKo: `${index + 1}컷 '${balloon.speaker}' 말풍선이 ${charCount}자(${maxCharsPerBalloon}자 초과)입니다. ${suggestedChunks.length}개 말풍선으로 분할하세요.`,
          adviceEn: `Cut ${index + 1} '${balloon.speaker}' balloon has ${charCount} chars (limit ${maxCharsPerBalloon}). Split into ${suggestedChunks.length} bubbles.`,
        });
      }
      return { ...balloon, charCount, hangulCharCount, exceedsCharLimit, overflowChars: Math.max(0, charCount - maxCharsPerBalloon), suggestedChunks };
    });

    totalBalloons += balloonAudits.length; totalChars += cutCharCount;
    const isOvercrowded = balloonAudits.length >= balloonWarningThreshold;
    if (isOvercrowded) {
      overcrowdedCutCount += 1;
      const splitPoint = Math.ceil(balloonAudits.length / 2);
      splitSuggestions.push({
        id: nextSuggestionId(`split-cut-${cut.id}`), cutIndex: index, cutId: cut.id, balloonId: null,
        reason: "cut-over-4-balloons", originalText: null, suggestedChunks: [], recommendedCutSplitIndex: splitPoint,
        sourceBalloons: cut.balloons.map(({ id, speaker, kind, text }) => ({ id, speaker, kind, text })),
        adviceKo: `${index + 1}컷에 말풍선이 ${balloonAudits.length}개 몰려 있습니다. 1~${splitPoint}번 유지, ${splitPoint + 1}~${balloonAudits.length}번은 반응 컷으로 분리하세요.`,
        adviceEn: `Cut ${index + 1} packs ${balloonAudits.length} balloons. Keep 1-${splitPoint} and move ${splitPoint + 1}-${balloonAudits.length} to a reaction cut.`,
      });
    }

    const wallReasons: DialogueWallReason[] = [...(cutOverlongCount > 0 ? ["balloon-over-42-chars" as const] : []), ...(isOvercrowded ? ["cut-over-4-balloons" as const] : [])];
    const hasDialogueWall = wallReasons.length > 0;
    if (hasDialogueWall) dialogueWallCutCount += 1;

    let decay = 1.8 + cutOverlongCount * (isOpeningCut ? 9.5 : 5.5) + (isOvercrowded ? (isOpeningCut ? 10 : 6) : 0);
    if (isOpeningCut && cut.actionShift === "none") decay += 4.5;
    const prevRaw = index > 0 ? cuts[index - 1] : undefined;
    if (isOpeningCut && prevRaw && cut.emotion === prevRaw.emotion) decay += 3.5;
    if (clampedTension >= 70 && !hasDialogueWall) decay = Math.max(0.8, decay - 1.4);
    runningRetention = clamp(round1(runningRetention - decay), 18, 100);

    auditedCuts.push({
      index, cutId: cut.id, labelKo: cut.labelKo, labelEn: cut.labelEn, role: cut.role, emotion: cut.emotion,
      actionShift: cut.actionShift, tensionLevel: clampedTension, isOpeningCut, isClosingCut,
      balloonCount: balloonAudits.length, totalCharCount: cutCharCount, maxBalloonCharCount,
      overlongBalloonCount: cutOverlongCount, hasDialogueWall, wallReasons, estimatedRetentionPct: runningRetention, balloons: balloonAudits,
    });
  });

  const overlongIdx = auditedCuts.filter((c) => c.overlongBalloonCount > 0).map((c) => c.index);
  if (overlongIdx.length > 0) {
    warnings.push(mkWarn("dialogue-wall-balloon-length", overlongIdx.some((i) => i < OPENING_HOOK_CUT_COUNT) ? "critical" : "warn", overlongIdx,
      `대사 벽 경고 · 말풍선 ${maxCharsPerBalloon}자 초과 (${overlongBalloonCount}건)`, `Dialogue Wall · Balloons Over ${maxCharsPerBalloon} Chars (${overlongBalloonCount})`,
      `${overlongIdx.map((i) => `${i + 1}컷`).join(", ")}에서 단일 말풍선이 ${maxCharsPerBalloon}자를 넘어 모바일 가독성이 떨어집니다.`,
      `Single balloons exceed ${maxCharsPerBalloon} chars in ${overlongIdx.map((i) => `Cut ${i + 1}`).join(", ")}.`,
      "분할 제안 초안을 적용해 1말풍선 28~36자 이내로 호흡을 나누세요.", "Apply the split draft to keep each balloon within 28-36 characters."));
  }
  const overcrowdedIdx = auditedCuts.filter((c) => c.balloonCount >= balloonWarningThreshold).map((c) => c.index);
  if (overcrowdedIdx.length > 0) {
    warnings.push(mkWarn("dialogue-wall-balloon-count", overcrowdedIdx.some((i) => i < OPENING_HOOK_CUT_COUNT) ? "critical" : "warn", overcrowdedIdx,
      `대사 벽 경고 · 컷당 말풍선 ${balloonWarningThreshold}개 이상 (${overcrowdedCutCount}컷)`, `Dialogue Wall · ${balloonWarningThreshold}+ Balloons Per Cut (${overcrowdedCutCount} cuts)`,
      `${overcrowdedIdx.map((i) => `${i + 1}컷`).join(", ")}에 말풍선이 ${balloonWarningThreshold}개 이상 집중되어 여백이 막힙니다.`,
      `${overcrowdedIdx.map((i) => `Cut ${i + 1}`).join(", ")} crowd ${balloonWarningThreshold}+ balloons into one frame.`,
      "대화를 2~3개 단위로 끊고 인물 표정·손동작 반응 컷을 사이에 삽입하세요.", "Break banter into 2-3 bubbles per cut and insert a reaction beat."));
  }

  const openingSlice = auditedCuts.slice(0, OPENING_HOOK_CUT_COUNT);
  const uniqueEmotions: CutEmotionState[] = [];
  let emotionTransitionCount = 0; let actionBeatCount = 0; let actionWeightSum = 0; let openingDialogueWallCount = 0;
  openingSlice.forEach((cut, idx) => {
    if (!uniqueEmotions.includes(cut.emotion)) uniqueEmotions.push(cut.emotion);
    const prev = idx > 0 ? openingSlice[idx - 1] : undefined;
    if (prev && cut.emotion !== prev.emotion) emotionTransitionCount += 1;
    const weight = actionShiftWeight(cut.actionShift);
    if (weight > 0) actionBeatCount += 1;
    actionWeightSum += weight;
    if (cut.hasDialogueWall) openingDialogueWallCount += 1;
  });
  const hasEmotionChange = openingSlice.length >= 2 && (uniqueEmotions.length >= 2 || emotionTransitionCount >= 1);
  const hasActionChange = actionBeatCount >= 1 && actionWeightSum >= 2;

  if (openingSlice.length < OPENING_HOOK_CUT_COUNT) {
    warnings.push(mkWarn("insufficient-opening-cuts", "info", openingSlice.map((c) => c.index),
      "오프닝 컷 수 부족 (3컷 미만)", "Fewer Than 3 Opening Cuts",
      `현재 ${openingSlice.length}컷만 입력되어 초반 3컷 흡인력 패턴을 완전 판별하기 어렵습니다.`, `Only ${openingSlice.length} cut(s) provided; add cuts to evaluate the 3-cut opening hook.`,
      "최소 3컷 이상의 오프닝 시퀀스를 입력해 감정·행동 전환을 점검하세요.", "Add at least 3 opening cuts to check emotion and action progression."));
  } else {
    if (!hasEmotionChange && !hasActionChange) {
      warnings.push(mkWarn("opening-hook-stagnant", "critical", [0, 1, 2],
        "초반 3컷 흡인력 정체 · 감정 및 행동 변화 부재", "Stagnant Opening 3 Cuts · No Emotion or Action Shift",
        "1~3컷이 동일한 감정과 정적 행동에 머물러 초반 이탈 위험이 높게 추정됩니다.", "Cuts 1-3 stay locked in one emotion with no action shift, elevating estimated drop-off risk.",
        "2컷에 사건 촉발 동작을 넣고 3컷에서 긴장·충격 등 감정 낙차를 명확히 주세요.", "Add a clear action trigger in Cut 2 and shift emotion sharply in Cut 3."));
    } else {
      if (!hasEmotionChange) {
        warnings.push(mkWarn("opening-flat-emotion", "warn", [0, 1, 2], "초반 3컷 감정 변화 부재", "Flat Emotion Across Opening 3 Cuts",
          `1~3컷 모두 동일 감정(${openingSlice[0]?.emotion ?? "neutral"})에 머물러 몰입 곡선이 평탄합니다.`, "Cuts 1-3 remain on a single emotional beat without contrast.",
          "3컷 내에 호기심 → 긴장 같은 최소 1회 이상의 감정 전환을 배치하세요.", "Place at least one clear emotional shift within the first 3 cuts."));
      }
      if (!hasActionChange) {
        warnings.push(mkWarn("opening-static-action", "warn", [0, 1, 2], "초반 3컷 행동·사건 변화 부재", "Static Action Across Opening 3 Cuts",
          "오프닝 3컷 동안 눈에 띄는 행동 변화나 사건 촉발이 약해 스크롤 추진력이 떨어집니다.", "Little physical action or plot motion occurs across the first 3 cuts.",
          "정적인 설명 컷 대신 동작·사건 촉발 컷을 2~3컷에 배치하세요.", "Replace static talking heads with a concrete visual action in Cut 2 or Cut 3."));
      }
    }
    if (openingDialogueWallCount > 0) {
      warnings.push(mkWarn("opening-dialogue-wall", "critical", openingSlice.filter((c) => c.hasDialogueWall).map((c) => c.index),
        `초반 3컷 내 대사 벽 감지 (${openingDialogueWallCount}컷)`, `Dialogue Wall Inside Opening 3 Cuts (${openingDialogueWallCount})`,
        "회차 진입 3컷 안에 과밀 대사가 나타나면 첫 화면 이탈 위험이 크게 높아집니다.", "Dense text walls within the first 3 cuts strongly increase estimated early drop-off.",
        "초반 3컷 설명을 시각 묘사로 바꾸고 1말풍선 30자 안팎으로 압축하세요.", "Convert early exposition into visual beats and trim bubbles near 30 chars."));
    }
  }

  let openingHookScore = openingSlice.length === 0 ? 0 : 34;
  if (openingSlice.length > 0) {
    const avgOpeningTension = openingSlice.reduce((sum, c) => sum + c.tensionLevel, 0) / openingSlice.length;
    openingHookScore += Math.min(24, Math.max(0, uniqueEmotions.length - 1) * 14 + emotionTransitionCount * 4)
      + Math.min(26, actionWeightSum * 5) + Math.round(clamp((avgOpeningTension - 25) * 0.32, 0, 16))
      - openingDialogueWallCount * 16 - (openingSlice.length < OPENING_HOOK_CUT_COUNT ? 14 : 0);
  }
  openingHookScore = clamp(Math.round(openingHookScore), 0, 100);

  const lastCut = auditedCuts.length > 0 ? auditedCuts[auditedCuts.length - 1] : undefined;
  const prevCut = auditedCuts.length >= 2 ? auditedCuts[auditedCuts.length - 2] : undefined;
  const lastRaw = cuts.length > 0 ? cuts[cuts.length - 1] : undefined;
  const endingHookKind: EndingHookKind = lastRaw?.endingHookKind ?? (lastCut?.role === "cliffhanger" ? "reveal" : "none");
  const closingTension = lastCut ? lastCut.tensionLevel : 0;
  const tensionRiseFromPrev = lastCut && prevCut ? lastCut.tensionLevel - prevCut.tensionLevel : 0;

  let cliffhangerScore = 0;
  if (lastCut) {
    cliffhangerScore = Math.round(closingTension * 0.62)
      + (lastCut.role === "cliffhanger" || lastCut.role === "reveal" ? 18 : lastCut.role === "action" ? 10 : 0)
      + (endingHookKind !== "none" ? 14 : 0) + (tensionRiseFromPrev >= 10 ? 10 : tensionRiseFromPrev >= 4 ? 5 : 0) - (lastCut.hasDialogueWall ? 12 : 0);
  }
  cliffhangerScore = clamp(cliffhangerScore, 0, 100);
  const cliffhangerVerdict: "strong" | "moderate" | "weak" = cliffhangerScore >= 76 ? "strong" : cliffhangerScore >= 56 ? "moderate" : "weak";
  const cliffhangerPrescriptionKo = cliffhangerVerdict === "strong"
    ? "말미 긴장도와 다음 화 유도 훅이 안정적으로 형성되어 있습니다."
    : "마지막 컷에 미결 질문·반전 클로즈업을 배치하고 직전 컷 대비 긴장도를 +10 이상 끌어올리세요.";
  const cliffhangerPrescriptionEn = cliffhangerVerdict === "strong"
    ? "Closing tension and next-episode hook are clearly established."
    : "Place an unresolved question or reveal on the final cut and lift tension by +10 over the prior cut.";

  if (lastCut && cliffhangerVerdict === "weak") {
    warnings.push(mkWarn("weak-cliffhanger-ending", "warn", [lastCut.index],
      `클리프행어 말미 긴장도 부족 (${cliffhangerScore}점)`, `Weak Cliffhanger Ending (${cliffhangerScore}/100)`,
      `마지막 ${lastCut.index + 1}컷 긴장도(${closingTension})와 말미 훅(${endingHookKind})이 다음 화 전환 동기를 충분히 만들지 못합니다.`,
      `Final Cut ${lastCut.index + 1} tension (${closingTension}) and hook (${endingHookKind}) lack next-episode pull.`,
      cliffhangerPrescriptionKo, cliffhangerPrescriptionEn));
  }

  const dialogueDensityScore = clamp(100 - overlongBalloonCount * 15 - overcrowdedCutCount * 18 - (openingDialogueWallCount > 0 ? 8 : 0), 0, 100);
  const overallPacingScore = auditedCuts.length === 0 ? 0 : clamp(Math.round(openingHookScore * 0.42 + dialogueDensityScore * 0.33 + cliffhangerScore * 0.25), 0, 100);
  const dropOffRiskScore = clamp(100 - overallPacingScore, 0, 100);

  return {
    dataSourceKind: HEURISTIC_DATA_SOURCE_KIND, heuristicDisclaimerKo: HEURISTIC_DISCLAIMER_KO, heuristicDisclaimerEn: HEURISTIC_DISCLAIMER_EN,
    episodeTitle, maxCharsPerBalloon, balloonWarningThreshold, cuts: auditedCuts,
    openingThreeCuts: { evaluatedCutCount: openingSlice.length, uniqueEmotions, emotionTransitionCount, hasEmotionChange, actionBeatCount, hasActionChange, openingDialogueWallCount, openingHookScore, openingDropOffRiskScore: clamp(100 - openingHookScore, 0, 100) },
    cliffhanger: { closingCutIndex: lastCut ? lastCut.index : -1, closingRole: lastCut ? lastCut.role : null, closingTension, tensionRiseFromPrev, endingHookKind, cliffhangerTensionScore: cliffhangerScore, verdict: cliffhangerVerdict, prescriptionKo: cliffhangerPrescriptionKo, prescriptionEn: cliffhangerPrescriptionEn },
    splitSuggestions, warnings,
    summary: {
      cutCount: auditedCuts.length, totalBalloons, totalChars, dialogueWallCutCount, overlongBalloonCount, overcrowdedCutCount,
      openingHookScore, dialogueDensityScore, cliffhangerTensionScore: cliffhangerScore, overallPacingScore, dropOffRiskScore,
      dropOffRiskLevel: classifyRiskLevel(dropOffRiskScore), estimatedCompletionPct: lastCut ? lastCut.estimatedRetentionPct : 0,
    },
  };
}

/** OKLCH -> OKLab -> 선형 sRGB 상대 휘도(Y: 0..1) 계산. */
export function oklchToRelativeLuminance(color: OklchColor): number {
  assertOklchColor(color);
  const l = clamp(color.l, 0, 1); const c = clamp(color.c, 0, 0.37);
  const rad = ((color.h % 360) * Math.PI) / 180;
  const a = c * Math.cos(rad); const b = c * Math.sin(rad);
  const lP = l + 0.3963377774 * a + 0.2158037573 * b;
  const mP = l - 0.1055613458 * a - 0.0638541728 * b;
  const sP = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = lP * lP * lP; const m3 = mP * mP * mP; const s3 = sP * sP * sP;
  const rLin = clamp(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3, 0, 1);
  const gLin = clamp(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3, 0, 1);
  const bLin = clamp(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3, 0, 1);
  return clamp(0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin, 0, 1);
}

/** WCAG 2.1 명암비(1.0~21.0) 및 APCA Lc 근사치(-108~+108)를 계산한다. */
export function computeContrastMetrics(backdropOklch: OklchColor, titleOklch: OklchColor, subjectOklch: OklchColor, hasTitleScrim: boolean): ContrastMetrics {
  const backdropLuminance = oklchToRelativeLuminance(backdropOklch);
  const titleLuminance = oklchToRelativeLuminance(titleOklch);
  const subjectLuminance = oklchToRelativeLuminance(subjectOklch);
  const effectiveBackdropLuminance = hasTitleScrim ? clamp(backdropLuminance * 0.28 + (titleLuminance >= 0.45 ? 0.018 : 0.92) * 0.72, 0, 1) : backdropLuminance;
  const wcagContrastRatio = round2((Math.max(effectiveBackdropLuminance, titleLuminance) + 0.05) / (Math.min(effectiveBackdropLuminance, titleLuminance) + 0.05));
  const subjectBackdropContrast = round2((Math.max(backdropLuminance, subjectLuminance) + 0.05) / (Math.min(backdropLuminance, subjectLuminance) + 0.05));

  const softClamp = (y: number): number => (y < 0.022 ? y + Math.pow(0.022 - y, 1.414) : y);
  const yBg = softClamp(effectiveBackdropLuminance); const yTxt = softClamp(titleLuminance);
  let apcaLc = 0;
  if (Math.abs(yBg - yTxt) >= 0.0005) {
    if (yBg > yTxt) { const sapc = (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 1.14; apcaLc = sapc < 0.1 ? 0 : (sapc - 0.027) * 100; }
    else { const sapc = (Math.pow(yBg, 0.65) - Math.pow(yTxt, 0.62)) * 1.14; apcaLc = sapc > -0.1 ? 0 : (sapc + 0.027) * 100; }
  }
  const roundedLc = round1(apcaLc); const apcaAbsLc = round1(Math.abs(roundedLc));
  const grade: ContrastGrade = wcagContrastRatio >= 7 && apcaAbsLc >= 75 ? "excellent" : wcagContrastRatio >= 4.5 && apcaAbsLc >= 60 ? "good" : wcagContrastRatio >= 3 && apcaAbsLc >= 45 ? "borderline" : "fail";
  return {
    backdropLuminance: round2(backdropLuminance), effectiveBackdropLuminance: round2(effectiveBackdropLuminance),
    titleLuminance: round2(titleLuminance), subjectLuminance: round2(subjectLuminance),
    wcagContrastRatio, apcaLc: roundedLc, apcaAbsLc, subjectBackdropContrast, grade,
  };
}

const rectArea = (r: PixelRect): number => Math.max(0, r.width) * Math.max(0, r.height);
const intersectionArea = (a: PixelRect, b: PixelRect): number => {
  const l = Math.max(a.x, b.x); const t = Math.max(a.y, b.y);
  const r = Math.min(a.x + a.width, b.x + b.width); const bt = Math.min(a.y + a.height, b.y + b.height);
  return r <= l || bt <= t ? 0 : (r - l) * (bt - t);
};

function getPlatformBadgePlacements(platform: ThumbnailPlatformSpec, activeBadges: readonly ThumbnailBadgeKind[], cornerOverrides?: Partial<Record<ThumbnailBadgeKind, BadgeCorner>>): readonly ThumbnailBadgePlacement[] {
  const pad = platform.safeMarginPx; const isBanner = platform.id === "global-banner-390x220";
  const badgeH = isBanner ? 22 : 18; const gap = 4;
  let leftX = pad; let rightX = platform.widthPx - pad;
  return activeBadges.map((badge) => {
    const corner: BadgeCorner = cornerOverrides?.[badge] ?? (badge === "UP" ? "top-left" : "top-right");
    const width = badge === "19" ? (isBanner ? 30 : 24) : badge === "UP" ? (isBanner ? 42 : 32) : isBanner ? 48 : 36;
    if (corner === "top-left") { const rect = { x: leftX, y: pad, width, height: badgeH }; leftX += width + gap; return { badge, corner, rect }; }
    const x = rightX - width; rightX = x - gap; return { badge, corner, rect: { x, y: pad, width, height: badgeH } };
  });
}

const mkRx = (candidateId: "A" | "B", platformId: ThumbnailPlatformId, suffix: string, severity: WarningSeverity, category: ThumbnailPrescription["category"], messageKo: string, messageEn: string): ThumbnailPrescription =>
  ({ id: `${candidateId}-${platformId}-${suffix}`, platformId, candidateId, severity, category, messageKo, messageEn });

/** 단일 플랫폼 규격에서 썸네일 후보 1종의 크롭·얼굴/눈 잘림·배지 충돌·타이틀 최소 높이·대비를 검증한다. */
export function evaluateThumbnailOnPlatform(
  candidate: ThumbnailCandidateInput, platformId: ThumbnailPlatformId,
  activeBadges: readonly ThumbnailBadgeKind[] = THUMBNAIL_BADGE_KINDS,
  badgeCornerOverrides?: Partial<Record<ThumbnailBadgeKind, BadgeCorner>>,
): ThumbnailPlatformCandidateAudit {
  assertThumbnailInputs(candidate, activeBadges);
  const platform = getThumbnailPlatformSpec(platformId);
  const srcW = Math.max(200, candidate.sourceWidthPx); const srcH = Math.max(200, candidate.sourceHeightPx);
  const srcAspect = srcW / srcH; const dstAspect = platform.widthPx / platform.heightPx;
  const zoom = clamp(candidate.zoom, 1, 2.2);
  const cropW = (srcAspect > dstAspect ? srcH * dstAspect : srcW) / zoom;
  const cropH = (srcAspect > dstAspect ? srcH : srcW / dstAspect) / zoom;
  const cropX = clamp(clamp(candidate.focalX, 0, 1) * srcW - cropW / 2, 0, Math.max(0, srcW - cropW));
  const cropY = clamp(clamp(candidate.focalY, 0, 1) * srcH - cropH / 2, 0, Math.max(0, srcH - cropH));
  const scaleFactor = platform.widthPx / cropW;

  const projectRect = (n: NormalizedRect): PixelRect => ({
    x: round1((clamp(n.x, 0, 1) * srcW - cropX) * scaleFactor), y: round1((clamp(n.y, 0, 1) * srcH - cropY) * scaleFactor),
    width: round1(clamp(n.width, 0.04, 1) * srcW * scaleFactor), height: round1(clamp(n.height, 0.04, 1) * srcH * scaleFactor),
  });
  const projectedFaceRect = projectRect(candidate.faceBox);
  const eyeLineRel = clamp(candidate.eyeLineRatioInFace, 0.15, 0.75);
  const projectedEyeBandRect = projectRect({
    x: candidate.faceBox.x + candidate.faceBox.width * 0.12, y: candidate.faceBox.y + candidate.faceBox.height * (eyeLineRel - 0.09),
    width: candidate.faceBox.width * 0.76, height: candidate.faceBox.height * 0.18,
  });
  const projectedTitleRect = projectRect(candidate.titleBox);

  const frameRect: PixelRect = { x: 0, y: 0, width: platform.widthPx, height: platform.heightPx };
  const safeFrameRect: PixelRect = { x: platform.safeMarginPx, y: platform.safeMarginPx, width: platform.widthPx - platform.safeMarginPx * 2, height: platform.heightPx - platform.safeMarginPx * 2 };
  const faceArea = Math.max(1, rectArea(projectedFaceRect));
  const eyeArea = Math.max(1, rectArea(projectedEyeBandRect));
  const titleArea = Math.max(1, rectArea(projectedTitleRect));

  const faceVisibleRatio = round2(intersectionArea(projectedFaceRect, frameRect) / faceArea);
  const eyeVisibleRatio = round2(intersectionArea(projectedEyeBandRect, safeFrameRect) / eyeArea);
  const titleVisibleRatio = round2(intersectionArea(projectedTitleRect, safeFrameRect) / titleArea);
  const faceClipped = faceVisibleRatio < 0.85; const eyeClipped = eyeVisibleRatio < 0.92; const titleClipped = titleVisibleRatio < 0.9;
  const scaledTitleFontPx = round2(Math.max(4, candidate.sourceTitleFontPx) * scaleFactor);
  const titleMeetsMinHeight = scaledTitleFontPx >= platform.minTitlePx;

  const badgePlacements = getPlatformBadgePlacements(platform, activeBadges, badgeCornerOverrides);
  const badgeCollisions: ThumbnailBadgeCollision[] = [];
  for (const p of badgePlacements) {
    const cKo = p.corner === "top-left" ? "좌상단" : "우상단"; const cEn = p.corner === "top-left" ? "top-left" : "top-right";
    const eyeOv = intersectionArea(p.rect, projectedEyeBandRect);
    if (eyeOv > 0) {
      const r = round2(eyeOv / eyeArea);
      badgeCollisions.push({ badge: p.badge, corner: p.corner, target: "eyes", severity: "critical", overlapRatio: r, badgeRect: p.rect, messageKo: `${cKo} '${p.badge}' 배지가 인물 눈 영역(${Math.round(r * 100)}%)을 가립니다.`, messageEn: `${cEn} '${p.badge}' badge obscures eyes (${Math.round(r * 100)}%).` });
    } else {
      const faceOv = intersectionArea(p.rect, projectedFaceRect);
      if (faceOv > 0 && faceOv / faceArea >= 0.04) {
        const r = round2(faceOv / faceArea);
        badgeCollisions.push({ badge: p.badge, corner: p.corner, target: "face", severity: "warn", overlapRatio: r, badgeRect: p.rect, messageKo: `${cKo} '${p.badge}' 배지가 인물 얼굴 상단(${Math.round(r * 100)}%)과 겹칩니다.`, messageEn: `${cEn} '${p.badge}' badge overlaps face (${Math.round(r * 100)}%).` });
      }
    }
    const titleOv = intersectionArea(p.rect, projectedTitleRect);
    if (titleOv > 0) {
      const r = round2(titleOv / titleArea);
      badgeCollisions.push({ badge: p.badge, corner: p.corner, target: "title", severity: "critical", overlapRatio: r, badgeRect: p.rect, messageKo: `${cKo} '${p.badge}' 배지가 타이틀 영역(${Math.round(r * 100)}%)을 가립니다.`, messageEn: `${cEn} '${p.badge}' badge collides with title (${Math.round(r * 100)}%).` });
    }
  }

  const contrast = computeContrastMetrics(candidate.backdropOklch, candidate.titleOklch, candidate.subjectOklch, candidate.hasTitleScrim);
  const framingScore = clamp(30 - (eyeClipped ? 18 : 0) - (faceClipped ? 10 : 0) - (projectedFaceRect.height < platform.heightPx * 0.16 ? 6 : 0), 0, 30);
  const badgeSafetyScore = clamp(25 - badgeCollisions.reduce((acc, col) => acc + (col.target === "eyes" ? 16 : col.target === "title" ? 12 : 8), 0), 0, 25);
  const titleLegibilityScore = clamp(20 - (!titleMeetsMinHeight ? Math.min(16, Math.round((platform.minTitlePx - scaledTitleFontPx) * 4 + 6)) : 0) - (titleClipped ? 8 : 0), 0, 20);
  const titleContrastPts = contrast.grade === "excellent" ? 18 : contrast.grade === "good" ? 14 : contrast.grade === "borderline" ? 8 : Math.round(clamp((contrast.wcagContrastRatio - 1) * 2, 0, 5));
  const subjectPopPts = contrast.subjectBackdropContrast >= 4.5 ? 7 : contrast.subjectBackdropContrast >= 3 ? 5 : contrast.subjectBackdropContrast >= 2 ? 3 : 1;
  const contrastScore = clamp(titleContrastPts + subjectPopPts, 0, 25);
  const totalScore = clamp(framingScore + badgeSafetyScore + titleLegibilityScore + contrastScore, 0, 100);

  const prescriptions: ThumbnailPrescription[] = [];
  if (eyeClipped) prescriptions.push(mkRx(candidate.id, platform.id, "eye", "critical", "eye-crop", `${platform.shortLabelKo}에서 인물 눈 영역이 잘립니다(노출 ${Math.round(eyeVisibleRatio * 100)}%). 크롭 초점 Y를 중앙(0.45~0.55)으로 조정하세요.`, `Eyes clip in ${platform.shortLabelEn} (${Math.round(eyeVisibleRatio * 100)}% visible). Recenter focal Y near 0.45-0.55.`));
  else if (faceClipped) prescriptions.push(mkRx(candidate.id, platform.id, "face", "warn", "face-crop", `${platform.shortLabelKo}에서 얼굴 노출률이 ${Math.round(faceVisibleRatio * 100)}%입니다. 줌을 낮추거나 초점을 얼굴 중심으로 당기세요.`, `Face visibility drops to ${Math.round(faceVisibleRatio * 100)}% in ${platform.shortLabelEn}. Reduce zoom or center on face.`));
  for (const col of badgeCollisions) prescriptions.push(mkRx(candidate.id, platform.id, `badge-${col.badge}-${col.target}`, col.severity, "badge-collision", `${platform.shortLabelKo}: ${col.messageKo} 상단 배지 레일 아래로 배치하세요.`, `${platform.shortLabelEn}: ${col.messageEn} Shift below top badge rail.`));
  if (!titleMeetsMinHeight) {
    const reqPx = Math.ceil(platform.minTitlePx / Math.max(0.05, scaleFactor));
    prescriptions.push(mkRx(candidate.id, platform.id, "title-px", "critical", "title-size", `${platform.shortLabelKo} 축소 타이틀이 ${scaledTitleFontPx}px로 ${platform.minTitlePx}px 미만입니다. 원본 폰트를 ${reqPx}px 이상으로 키우세요.`, `Scaled title is ${scaledTitleFontPx}px (< ${platform.minTitlePx}px) on ${platform.shortLabelEn}. Increase source font to >= ${reqPx}px.`));
  }
  if (contrast.grade === "fail" || contrast.grade === "borderline") {
    prescriptions.push(mkRx(candidate.id, platform.id, "contrast", contrast.grade === "fail" ? "critical" : "warn", "contrast", `${platform.shortLabelKo} 타이틀 대비가 WCAG ${contrast.wcagContrastRatio}:1 · APCA Lc ${contrast.apcaAbsLc}로 약합니다. 스크림을 켜거나 명도 차를 벌리세요.`, `Title contrast is weak (WCAG ${contrast.wcagContrastRatio}:1, APCA Lc ${contrast.apcaAbsLc}) on ${platform.shortLabelEn}. Enable scrim or widen luminance gap.`));
  }

  return {
    platform, candidateId: candidate.id, scaleFactor: round2(scaleFactor),
    cropRectInSource: { x: round1(cropX), y: round1(cropY), width: round1(cropW), height: round1(cropH) },
    projectedFaceRect, projectedEyeBandRect, projectedTitleRect, badgePlacements,
    eyeVisibleRatio, faceVisibleRatio, eyeClipped, faceClipped, scaledTitleFontPx, titleMeetsMinHeight, titleClipped,
    badgeCollisions, contrast, framingScore, badgeSafetyScore, titleLegibilityScore, contrastScore, totalScore, prescriptions,
  };
}

/** 3종 플랫폼 규격에서 썸네일 후보 A와 B를 비교해 승자와 구체적 개선 처방을 도출한다. */
export function compareThumbnailCandidates(options: CompareThumbnailCandidatesOptions): ThumbnailAbComparisonResult {
  const activeBadges = options.activeBadges ?? THUMBNAIL_BADGE_KINDS;
  const platforms: PlatformAbBreakdown[] = THUMBNAIL_PLATFORM_IDS.map((platformId) => {
    const candidateA = evaluateThumbnailOnPlatform(options.candidateA, platformId, activeBadges, options.badgeCornerOverrides);
    const candidateB = evaluateThumbnailOnPlatform(options.candidateB, platformId, activeBadges, options.badgeCornerOverrides);
    const diff = candidateA.totalScore - candidateB.totalScore;
    return { platform: candidateA.platform, candidateA, candidateB, winner: diff > 0 ? "A" : diff < 0 ? "B" : "tie", scoreDelta: Math.abs(diff) };
  });
  const aggregateScoreA = round1(platforms.reduce((sum, p) => sum + p.candidateA.totalScore, 0) / platforms.length);
  const aggregateScoreB = round1(platforms.reduce((sum, p) => sum + p.candidateB.totalScore, 0) / platforms.length);
  const rawDelta = round1(aggregateScoreA - aggregateScoreB);
  const winner: "A" | "B" | "tie" = rawDelta > 0 ? "A" : rawDelta < 0 ? "B" : "tie";
  const scoreDelta = round1(Math.abs(rawDelta));
  const winnerSummaryKo = winner === "tie"
    ? `후보 A와 후보 B가 3종 플랫폼 평균 ${aggregateScoreA}점으로 동점입니다(규칙 기반 추정).`
    : winner === "A" ? `후보 A가 3종 플랫폼 평균 ${aggregateScoreA}점으로 후보 B(${aggregateScoreB}점)보다 +${scoreDelta}점 우세합니다(규칙 기반 추정).`
      : `후보 B가 3종 플랫폼 평균 ${aggregateScoreB}점으로 후보 A(${aggregateScoreA}점)보다 +${scoreDelta}점 우세합니다(규칙 기반 추정).`;
  const winnerSummaryEn = winner === "tie"
    ? `Candidate A and B tie at ${aggregateScoreA}/100 across all 3 platforms (rule-based heuristic).`
    : winner === "A" ? `Candidate A leads at ${aggregateScoreA}/100 vs Candidate B (${aggregateScoreB}/100, +${scoreDelta} pts, heuristic).`
      : `Candidate B leads at ${aggregateScoreB}/100 vs Candidate A (${aggregateScoreA}/100, +${scoreDelta} pts, heuristic).`;

  return {
    dataSourceKind: HEURISTIC_DATA_SOURCE_KIND, heuristicDisclaimerKo: HEURISTIC_DISCLAIMER_KO, heuristicDisclaimerEn: HEURISTIC_DISCLAIMER_EN,
    activeBadges, platforms, aggregateScoreA, aggregateScoreB, winner, scoreDelta, winnerSummaryKo, winnerSummaryEn,
    prescriptionsA: platforms.flatMap((p) => p.candidateA.prescriptions), prescriptionsB: platforms.flatMap((p) => p.candidateB.prescriptions),
  };
}

/** 회차 초반 3컷 진단과 3종 썸네일 A/B 비교 결과를 복사 가능한 마크다운 리포트로 직렬화한다. */
export function buildLabDiagnosticReportMarkdown(pacing: EpisodeHookDensityAnalysis, thumb: ThumbnailAbComparisonResult, locale: "ko" | "en" = "ko"): string {
  assertDiagnosticSnapshot(pacing);
  assertDiagnosticSnapshot(thumb);
  const isEn = locale === "en";
  const lines: string[] = [
    isEn ? `# Episode Pacing & Thumbnail A/B Report (${pacing.episodeTitle})` : `# 회차 초반 흡인력 · 대사 벽 · 썸네일 A/B 진단 리포트 (${pacing.episodeTitle})`,
    `> dataSourceKind: \`${pacing.dataSourceKind}\` — ${isEn ? pacing.heuristicDisclaimerEn : pacing.heuristicDisclaimerKo}`, "",
    isEn ? "## 1. Opening 3 Cuts & Dialogue Wall Audit" : "## 1. 초반 3컷 · 대사 벽 · 클리프행어 진단",
    isEn ? `- Overall: ${pacing.summary.overallPacingScore}/100 | Drop-off Risk: ${pacing.summary.dropOffRiskScore}/100 (${pacing.summary.dropOffRiskLevel})` : `- 종합 흡인력(추정): ${pacing.summary.overallPacingScore}/100 | 이탈 위험: ${pacing.summary.dropOffRiskScore}/100 (${pacing.summary.dropOffRiskLevel})`,
    isEn ? `- Opening 3-Cut Hook: ${pacing.summary.openingHookScore}/100 | Dialogue Walls: ${pacing.summary.dialogueWallCutCount} | Cliffhanger: ${pacing.summary.cliffhangerTensionScore}/100` : `- 초반 3컷 훅: ${pacing.summary.openingHookScore}/100 | 대사 벽 컷: ${pacing.summary.dialogueWallCutCount}건 | 클리프행어: ${pacing.summary.cliffhangerTensionScore}/100`,
  ];
  if (pacing.warnings.length === 0) lines.push(isEn ? "- Warnings: None" : "- 경고: 없음");
  else for (const w of pacing.warnings) lines.push(`- [${w.severity.toUpperCase()}] ${isEn ? w.titleEn : w.titleKo} — ${isEn ? w.prescriptionEn : w.prescriptionKo}`);
  lines.push("", isEn ? "## 2. Thumbnail A/B Safe-Zone & Contrast" : "## 2. 3종 플랫폼 썸네일 A/B 안전영역 · 대비 비교", `- ${isEn ? thumb.winnerSummaryEn : thumb.winnerSummaryKo}`);
  for (const r of thumb.platforms) {
    lines.push(isEn
      ? `- ${r.platform.labelEn}: A ${r.candidateA.totalScore} (${r.candidateA.scaledTitleFontPx}px, WCAG ${r.candidateA.contrast.wcagContrastRatio}:1, APCA ${r.candidateA.contrast.apcaAbsLc}) vs B ${r.candidateB.totalScore} (${r.candidateB.scaledTitleFontPx}px, WCAG ${r.candidateB.contrast.wcagContrastRatio}:1, APCA ${r.candidateB.contrast.apcaAbsLc}) -> Winner ${r.winner}`
      : `- ${r.platform.labelKo}: A ${r.candidateA.totalScore}점(${r.candidateA.scaledTitleFontPx}px · WCAG ${r.candidateA.contrast.wcagContrastRatio}:1 · APCA ${r.candidateA.contrast.apcaAbsLc}) vs B ${r.candidateB.totalScore}점(${r.candidateB.scaledTitleFontPx}px · WCAG ${r.candidateB.contrast.wcagContrastRatio}:1 · APCA ${r.candidateB.contrast.apcaAbsLc}) → 우세 ${r.winner}`);
  }
  return lines.join("\n");
}
