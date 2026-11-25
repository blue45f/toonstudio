/**
 * Wave 46D — 직관적 캔버스 핀 검수(6종 원클릭 도장 · 전후 비교 · 6단계 바통터치) +
 * 5대 외부 툴 오픈 표준 라운드트립 브리지 순수 엔진.
 *
 * - 6종 원클릭 시각 검수 도장(`expression-fix`, `hand-anatomy`, `balloon-pos`, `bg-perspective`, `tone-missing`, `approved-stamp`)
 * - 컷 좌표(`xPct`, `yPct`, `0..100`) 번호 핀 불변 상태 관리(`open` / `in-progress` / `resolved`)
 * - 6단계 바통터치 상태기계(`conti` → `lineart` → `flat-color` → `shading` → `lettering` → `final-ready`)
 *   및 미해결 핀 자동 안내(`evaluateStageGateReadiness`) + 1줄 요약 알림 페이로드 생성
 * - 5대 외부 툴 오픈 표준 브리지(`csp-psd-layers`, `photoshop-psd-cmyk`, `blender-glb-camera`, `figma-tokens-json`, `slack-notion-digest`)
 *   유료 사유 포맷 우회 없이 공개 표준 교환 포맷(`.psd`, `.glb`, JSON 토큰, Markdown) 손실/보존 매핑표 및 매니페스트 생성
 *
 * 순수 함수형 모듈: Web Storage · private Map store · BigInt 리터럴 · 원시 색상 리터럴 미사용.
 */

import { EXTERNAL_BRIDGE_SPECS } from "./visual-pin-bridge-catalog";
import { MAX_REVIEW_PINS, assertBridgeOptions, assertReviewFinite, assertReviewPins, assertReviewText, assertReviewTimestamp, assertVisualReviewState, nextReviewHistoryId } from "./visual-pin-input-contract";

export { EXTERNAL_BRIDGE_SPECS } from "./visual-pin-bridge-catalog";

export const REVIEW_STAMP_IDS = [
  "expression-fix", "hand-anatomy", "balloon-pos", "bg-perspective", "tone-missing", "approved-stamp",
] as const;
export type ReviewStampId = (typeof REVIEW_STAMP_IDS)[number];

export const REVIEW_PIN_STATUSES = ["open", "in-progress", "resolved"] as const;
export type ReviewPinStatus = (typeof REVIEW_PIN_STATUSES)[number];

export const BATON_STAGE_IDS = [
  "conti", "lineart", "flat-color", "shading", "lettering", "final-ready",
] as const;
export type BatonStageId = (typeof BATON_STAGE_IDS)[number];

export const EXTERNAL_BRIDGE_IDS = [
  "csp-psd-layers", "photoshop-psd-cmyk", "blender-glb-camera", "figma-tokens-json", "slack-notion-digest",
] as const;
export type ExternalBridgeId = (typeof EXTERNAL_BRIDGE_IDS)[number];

export type SemanticTone = "accent" | "bad" | "warn" | "cool" | "good";
export type RoundtripFidelityStatus = "preserved" | "approximated" | "flattened";
export type StageGateStatus = "ready" | "blocked" | "finalized";
export type ReviewLocale = "ko" | "en";

export const DEFAULT_REVIEW_TIMESTAMP_ISO = "2026-11-25T13:30:00Z";
export const VISUAL_PIN_BRIDGE_SCHEMA_VERSION = "toonstudio.visual-pin-roundtrip.v1";

export interface ReviewStampSpec {
  readonly id: ReviewStampId; readonly shortCode: string;
  readonly labelKo: string; readonly labelEn: string;
  readonly defaultCommentKo: string; readonly defaultCommentEn: string;
  readonly defaultStageId: BatonStageId; readonly tone: SemanticTone;
  readonly blocksStageGate: boolean; readonly defaultStatus: ReviewPinStatus;
}

export interface BatonStageSpec {
  readonly id: BatonStageId; readonly order: number;
  readonly labelKo: string; readonly labelEn: string;
  readonly shortLabelKo: string; readonly shortLabelEn: string;
  readonly ownerRoleKo: string; readonly ownerRoleEn: string;
  readonly nextStageId: BatonStageId | null;
  readonly gateGoalKo: string; readonly gateGoalEn: string;
}

export interface ReviewCutDescriptor {
  readonly id: string; readonly cutNumber: number;
  readonly titleKo: string; readonly titleEn: string;
  readonly beforeSummaryKo: string; readonly beforeSummaryEn: string;
  readonly afterSummaryKo: string; readonly afterSummaryEn: string;
}

export interface ReviewPin {
  readonly id: string; readonly pinNumber: number; readonly cutId: string;
  readonly stampId: ReviewStampId; readonly xPct: number; readonly yPct: number;
  readonly comment: string; readonly stageId: BatonStageId;
  readonly status: ReviewPinStatus; readonly assignee: string;
  readonly createdAtIso: string; readonly updatedAtIso: string;
}

export interface StageTransitionRecord {
  readonly id: string; readonly fromStageId: BatonStageId; readonly toStageId: BatonStageId;
  readonly direction: "advance" | "rewind"; readonly forced: boolean;
  readonly actorName: string; readonly summaryKo: string; readonly summaryEn: string;
  readonly timestampIso: string;
}

export interface VisualPinReviewState {
  readonly projectTitle: string; readonly episodeLabel: string;
  readonly activeCutId: string; readonly currentStageId: BatonStageId;
  readonly pins: readonly ReviewPin[]; readonly nextPinNumber: number;
  readonly beforeAfterSplitPct: number; readonly history: readonly StageTransitionRecord[];
}

export interface AddReviewPinInput {
  readonly stampId: ReviewStampId; readonly xPct: number; readonly yPct: number;
  readonly cutId?: string; readonly comment?: string; readonly stageId?: BatonStageId;
  readonly status?: ReviewPinStatus; readonly assignee?: string;
  readonly locale?: ReviewLocale; readonly timestampIso?: string;
}

export interface InitialReviewStateOptions {
  readonly variant?: "sample" | "clean"; readonly projectTitle?: string; readonly episodeLabel?: string;
  readonly currentStageId?: BatonStageId; readonly activeCutId?: string; readonly beforeAfterSplitPct?: number;
}

export interface ReviewPinSummary {
  readonly total: number; readonly openCount: number; readonly inProgressCount: number;
  readonly resolvedCount: number; readonly blockingUnresolvedCount: number; readonly approvedStampCount: number;
  readonly byStamp: Readonly<Record<ReviewStampId, number>>;
  readonly unresolvedByStage: Readonly<Record<BatonStageId, number>>;
}

export interface StageGateNotificationPayload {
  readonly channelHint: "slack" | "notion" | "studio-toast";
  readonly severity: StageGateStatus;
  readonly currentStageId: BatonStageId; readonly nextStageId: BatonStageId | null;
  readonly unresolvedCount: number; readonly resolvedCount: number;
  readonly pinRefs: readonly number[];
  readonly oneLineSummaryKo: string; readonly oneLineSummaryEn: string;
  readonly actionPromptKo: string; readonly actionPromptEn: string;
}

export interface StageGateReadinessReport {
  readonly currentStage: BatonStageSpec; readonly nextStage: BatonStageSpec | null;
  readonly gateStatus: StageGateStatus; readonly canAdvance: boolean; readonly progressPct: number;
  readonly unresolvedBlockingPins: readonly ReviewPin[];
  readonly currentStageBlockingPins: readonly ReviewPin[];
  readonly upcomingStageBlockingPins: readonly ReviewPin[];
  readonly resolvedPinCount: number; readonly approvedStampCount: number;
  readonly autoGuidanceKo: string; readonly autoGuidanceEn: string;
  readonly notification: StageGateNotificationPayload;
}

export interface AdvanceStageOptions {
  readonly force?: boolean; readonly actorName?: string; readonly timestampIso?: string;
}

export interface StageTransitionResult {
  readonly transitioned: boolean; readonly state: VisualPinReviewState;
  readonly gate: StageGateReadinessReport; readonly notification: StageGateNotificationPayload;
}

export interface RoundtripFieldMapping {
  readonly id: string; readonly featureKo: string; readonly featureEn: string;
  readonly status: RoundtripFidelityStatus;
  readonly detailKo: string; readonly detailEn: string;
  readonly workaroundKo: string; readonly workaroundEn: string;
}

export interface ExternalBridgeSpec {
  readonly id: ExternalBridgeId;
  readonly toolNameKo: string; readonly toolNameEn: string;
  readonly shortNameKo: string; readonly shortNameEn: string;
  readonly openStandardFormatKo: string; readonly openStandardFormatEn: string;
  readonly fileExtension: string; readonly mimeType: string;
  readonly proprietaryBypassAvoided: true;
  readonly avoidedProprietaryFormatKo: string; readonly avoidedProprietaryFormatEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly mappings: readonly RoundtripFieldMapping[];
}

export interface BridgeFidelitySummary {
  readonly preservedCount: number; readonly approximatedCount: number;
  readonly flattenedCount: number; readonly totalMappings: number; readonly preservationRatePct: number;
}

export interface ExternalBridgeManifestOptions {
  readonly scope?: "episode" | "active-cut"; readonly locale?: ReviewLocale; readonly generatedAtIso?: string;
}

export interface ExternalBridgeManifest {
  readonly dataSourceKind: "in-memory-example"; readonly fileConversionVerified: false; readonly persisted: false;
  readonly schemaVersion: typeof VISUAL_PIN_BRIDGE_SCHEMA_VERSION;
  readonly bridge: ExternalBridgeSpec; readonly proprietaryBypassAvoided: true;
  readonly scope: "episode" | "active-cut";
  readonly suggestedFileName: string; readonly generatedAtIso: string;
  readonly episode: {
    readonly projectTitle: string; readonly episodeLabel: string; readonly activeCutId: string;
    readonly currentStageId: BatonStageId; readonly nextStageId: BatonStageId | null; readonly gateStatus: StageGateStatus;
  };
  readonly pinSummary: ReviewPinSummary; readonly pins: readonly ReviewPin[];
  readonly fidelitySummary: BridgeFidelitySummary;
  readonly oneLineDigestKo: string; readonly oneLineDigestEn: string;
  readonly markdownDigest: string; readonly jsonPayload: string;
}

function makePinPatch(
  state: VisualPinReviewState,
  pinId: string,
  updater: (pin: ReviewPin) => ReviewPin | null,
): VisualPinReviewState {
  assertState(state);
  let changed = false;
  const pins = state.pins.map((pin) => {
    if (pin.id !== pinId) return pin;
    const next = updater(pin);
    if (!next) return pin;
    assertReviewPins([next], REVIEW_STAMP_IDS, BATON_STAGE_IDS);
    changed = true;
    return next;
  });
  return changed ? { ...state, pins } : state;
}

export const REVIEW_STAMP_SPECS: readonly [ReviewStampSpec, ...ReviewStampSpec[]] = [
  { id: "expression-fix", shortCode: "표정", labelKo: "표정 수정", labelEn: "Expression Fix", defaultCommentKo: "눈매·입꼬리 감정선 1단계 더 또렷하게 보정", defaultCommentEn: "Sharpen eye line and mouth angle to match scene emotion", defaultStageId: "lineart", tone: "accent", blocksStageGate: true, defaultStatus: "open" },
  { id: "hand-anatomy", shortCode: "손", labelKo: "손가락 보정", labelEn: "Hand Anatomy", defaultCommentKo: "손가락 관절 길이·마디 수와 쥐는 각도 재정리", defaultCommentEn: "Fix finger joint proportion, count, and grip angle", defaultStageId: "lineart", tone: "bad", blocksStageGate: true, defaultStatus: "open" },
  { id: "balloon-pos", shortCode: "말풍선", labelKo: "말풍선 위치", labelEn: "Balloon Position", defaultCommentKo: "인물 시선과 턱선 가리지 않게 말풍선 상단 여백으로 이동", defaultCommentEn: "Shift speech balloon into upper margin clear of eyeline", defaultStageId: "lettering", tone: "cool", blocksStageGate: true, defaultStatus: "open" },
  { id: "bg-perspective", shortCode: "투시", labelKo: "배경 투시", labelEn: "BG Perspective", defaultCommentKo: "난간 소실점을 인물 눈높이(아이레벨)와 맞춰 재정렬", defaultCommentEn: "Align railing vanishing point with character eye level", defaultStageId: "conti", tone: "warn", blocksStageGate: true, defaultStatus: "open" },
  { id: "tone-missing", shortCode: "채색", labelKo: "톤·채색 누락", labelEn: "Tone / Color Missing", defaultCommentKo: "목 그림자·옷깃 안쪽 밑색과 역광 톤 누락 채우기", defaultCommentEn: "Fill missing neck shadow, collar base fill, and rim tone", defaultStageId: "shading", tone: "warn", blocksStageGate: true, defaultStatus: "open" },
  { id: "approved-stamp", shortCode: "승인", labelKo: "승인 완료", labelEn: "Approved", defaultCommentKo: "컷 검수 OK · 수정 반영 확인 완료", defaultCommentEn: "Cut approved — revision verified ready for next step", defaultStageId: "final-ready", tone: "good", blocksStageGate: false, defaultStatus: "resolved" },
];

export const BATON_STAGE_SPECS: readonly [BatonStageSpec, ...BatonStageSpec[]] = [
  { id: "conti", order: 1, labelKo: "1. 콘티", labelEn: "1. Storyboard", shortLabelKo: "콘티", shortLabelEn: "Conti", ownerRoleKo: "메인 작가", ownerRoleEn: "Lead Artist", nextStageId: "lineart", gateGoalKo: "구도·카메라 투시·컷 호흡 확정", gateGoalEn: "Lock framing, perspective, and pacing" },
  { id: "lineart", order: 2, labelKo: "2. 선화", labelEn: "2. Lineart", shortLabelKo: "선화", shortLabelEn: "Lineart", ownerRoleKo: "선화 어시", ownerRoleEn: "Lineart Assist", nextStageId: "flat-color", gateGoalKo: "표정·손가락·폐곡선 외곽선 정리", gateGoalEn: "Finalize expression, hands, and clean outlines" },
  { id: "flat-color", order: 3, labelKo: "3. 밑색", labelEn: "3. Flat Color", shortLabelKo: "밑색", shortLabelEn: "Flat Color", ownerRoleKo: "밑색 어시", ownerRoleEn: "Flats Assist", nextStageId: "shading", gateGoalKo: "파츠별 경계 틈 없는 밑색 분리", gateGoalEn: "Separate gap-free base color masks" },
  { id: "shading", order: 4, labelKo: "4. 명암·효과", labelEn: "4. Shading & FX", shortLabelKo: "명암", shortLabelEn: "Shading", ownerRoleKo: "명암 어시", ownerRoleEn: "Shading Assist", nextStageId: "lettering", gateGoalKo: "광원 일관성·톤 누락·역광 마감", gateGoalEn: "Verify lighting continuity and fill missing tones" },
  { id: "lettering", order: 5, labelKo: "5. 식자·말풍선", labelEn: "5. Lettering", shortLabelKo: "식자", shortLabelEn: "Lettering", ownerRoleKo: "식자 담당", ownerRoleEn: "Letterer", nextStageId: "final-ready", gateGoalKo: "말풍선 시선 간섭 제거·오탈자 검수", gateGoalEn: "Clear face sightlines and proofread balloons" },
  { id: "final-ready", order: 6, labelKo: "6. 최종 납품", labelEn: "6. Final Ready", shortLabelKo: "최종 납품", shortLabelEn: "Final Ready", ownerRoleKo: "담당 PD", ownerRoleEn: "Managing PD", nextStageId: null, gateGoalKo: "전 공정 핀 0건 확인 후 연재본 출고", gateGoalEn: "Zero open pins verified for episode delivery" },
];

export const SAMPLE_REVIEW_CUTS: readonly [ReviewCutDescriptor, ...ReviewCutDescriptor[]] = [
  { id: "cut-01", cutNumber: 1, titleKo: "1컷 · 옥상 대치 클로즈업", titleEn: "Cut 1 · Rooftop Face-Off Close-Up", beforeSummaryKo: "수정 전: 눈매 흐림 · 손가락 관절 어색 · 말풍선 턱선 겹침", beforeSummaryEn: "Before: soft gaze, hand proportion drift, balloon clipping chin", afterSummaryKo: "수정 후: 시선 집중 · 손가락 관절 정리 · 상단 여백 말풍선 정렬", afterSummaryEn: "After: focused gaze, clean hand joints, upper-margin balloon" },
  { id: "cut-02", cutNumber: 2, titleKo: "2컷 · 복도 추격 풀샷", titleEn: "Cut 2 · Corridor Chase Full Shot", beforeSummaryKo: "수정 전: 복도 소실점 들뜸 · 교복 카라 그림자 누락", beforeSummaryEn: "Before: lifted corridor vanishing point, missing collar shadow", afterSummaryKo: "수정 후: 아이레벨 소실점 일치 · 역광 그림자 톤 보강", afterSummaryEn: "After: eye-level perspective lock, rim shadow filled" },
  { id: "cut-03", cutNumber: 3, titleKo: "3컷 · 대사 반전 바스트샷", titleEn: "Cut 3 · Plot Twist Bust Shot", beforeSummaryKo: "수정 전: 말풍선 꼬리 방향 혼선 · 배경 톤 경계 누락", beforeSummaryEn: "Before: ambiguous balloon tail, missing backdrop tone edge", afterSummaryKo: "수정 후: 화자 꼬리 명확화 · 배경 그라데이션 톤 마감", afterSummaryEn: "After: crisp speaker tail, balanced backdrop tone" },
];

function assertState(state: VisualPinReviewState): void {
  assertVisualReviewState(state, REVIEW_STAMP_IDS, BATON_STAGE_IDS);
}

export function getReviewStampSpec(stampId: ReviewStampId): ReviewStampSpec {
  const found = REVIEW_STAMP_SPECS.find((item) => item.id === stampId);
  if (!found) throw new TypeError("지원하지 않는 도장입니다.");
  return found;
}

export function getBatonStageSpec(stageId: BatonStageId): BatonStageSpec {
  const found = BATON_STAGE_SPECS.find((item) => item.id === stageId);
  if (!found) throw new TypeError("지원하지 않는 공정입니다.");
  return found;
}

export function getExternalBridgeSpec(bridgeId: ExternalBridgeId): ExternalBridgeSpec {
  const found = EXTERNAL_BRIDGE_SPECS.find((item) => item.id === bridgeId);
  if (!found) throw new TypeError("지원하지 않는 브리지입니다.");
  return found;
}

export function getReviewCutDescriptor(cutId: string): ReviewCutDescriptor {
  return SAMPLE_REVIEW_CUTS.find((item) => item.id === cutId) ?? SAMPLE_REVIEW_CUTS[0];
}

export function clampPercent(value: number, fallback = 50): number {
  const finite = Number.isFinite(value) ? value : Number.isFinite(fallback) ? fallback : 50;
  return Math.round(Math.max(0, Math.min(100, finite)) * 10) / 10;
}

export function normalizeSingleLineComment(raw: string | undefined, fallback: string, maxLength = 120): string {
  if (!Number.isSafeInteger(maxLength) || maxLength < 1 || maxLength > 8192) throw new RangeError("요약 길이는 1~8192 정수여야 합니다.");
  const cleaned = (raw ?? "").replace(/[\r\n]+/gu, " ").replace(/\s+/gu, " ").trim();
  const base = cleaned.length > 0 ? cleaned : fallback.replace(/[\r\n]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (base.length <= maxLength) return base;
  let prefix = "";
  for (const { segment } of new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(base)) {
    if (prefix.length + segment.length > maxLength - 1) break;
    prefix += segment;
  }
  return `${prefix.trimEnd()}…`;
}

export function togglePinResolvedStatus(status: ReviewPinStatus): ReviewPinStatus {
  return status === "resolved" ? "open" : "resolved";
}

export function cyclePinStatus(status: ReviewPinStatus): ReviewPinStatus {
  if (status === "open") return "in-progress";
  return status === "in-progress" ? "resolved" : "open";
}

function makeSeedPin(
  pinNumber: number, cutId: string, stampId: ReviewStampId, xPct: number, yPct: number,
  comment: string, stageId: BatonStageId, status: ReviewPinStatus, assignee: string,
): ReviewPin {
  return {
    id: `pin-${pinNumber}`, pinNumber, cutId, stampId, xPct, yPct, comment, stageId, status, assignee,
    createdAtIso: DEFAULT_REVIEW_TIMESTAMP_ISO, updatedAtIso: DEFAULT_REVIEW_TIMESTAMP_ISO,
  };
}

export function createInitialVisualPinReviewState(options?: InitialReviewStateOptions): VisualPinReviewState {
  const variant = options?.variant ?? "sample";
  const stageId = options?.currentStageId ?? "lineart";
  getBatonStageSpec(stageId);
  const pins: readonly ReviewPin[] = variant === "clean"
    ? [makeSeedPin(1, "cut-01", "approved-stamp", 50, 45, "1컷 선화·표정·손가락 검수 완료 · 다음 공정 OK", "final-ready", "resolved", "메인 작가")]
    : [
      makeSeedPin(1, "cut-01", "expression-fix", 48, 30, "주인공 눈매 긴장감 1단계 더 날카롭게 보정", "lineart", "open", "선화 어시"),
      makeSeedPin(2, "cut-01", "hand-anatomy", 68, 64, "오른손 엄지 관절 길이와 쥐는 각도 정리", "lineart", "in-progress", "선화 어시"),
      makeSeedPin(3, "cut-01", "balloon-pos", 24, 20, "말풍선이 턱선 안 가리게 상단 여백으로 12px 이동", "lettering", "resolved", "식자 담당"),
      makeSeedPin(4, "cut-02", "bg-perspective", 76, 42, "복도 창틀 소실점을 캐릭터 아이레벨에 맞춰 정렬", "conti", "resolved", "메인 작가"),
    ];
  const state: VisualPinReviewState = {
    projectTitle: options?.projectTitle ?? "별빛 아틀리에",
    episodeLabel: options?.episodeLabel ?? "제14화",
    activeCutId: options?.activeCutId ?? SAMPLE_REVIEW_CUTS[0].id,
    currentStageId: stageId,
    pins,
    nextPinNumber: pins.length + 1,
    beforeAfterSplitPct: clampPercent(options?.beforeAfterSplitPct ?? 50, 50),
    history: [{
      id: "hist-init-1", fromStageId: "conti", toStageId: stageId, direction: "advance", forced: false,
      actorName: "예제 담당", summaryKo: "합성 검토 예제 초기 상태",
      summaryEn: "Synthetic review example initial state", timestampIso: DEFAULT_REVIEW_TIMESTAMP_ISO,
    }],
  };
  assertState(state);
  return state;
}

export function addVisualReviewPin(state: VisualPinReviewState, input: AddReviewPinInput): VisualPinReviewState {
  assertState(state);
  if (state.pins.length >= MAX_REVIEW_PINS) throw new RangeError("핀 상한에 도달했습니다.");
  assertReviewFinite(input.xPct); assertReviewFinite(input.yPct);
  const stamp = getReviewStampSpec(input.stampId);
  const stageId = input.stageId ?? stamp.defaultStageId;
  const stage = getBatonStageSpec(stageId);
  const isEn = input.locale === "en";
  const timestamp = input.timestampIso ?? DEFAULT_REVIEW_TIMESTAMP_ISO;
  let pinNumber = Math.max(state.nextPinNumber, ...state.pins.map((pin) => pin.pinNumber + 1));
  const ids = new Set(state.pins.map((pin) => pin.id));
  while (ids.has(`pin-${pinNumber}`)) pinNumber += 1;
  if (!Number.isSafeInteger(pinNumber + 1)) throw new RangeError("핀 번호 상한에 도달했습니다.");
  const nextPin: ReviewPin = {
    id: `pin-${pinNumber}`, pinNumber, cutId: input.cutId ?? state.activeCutId, stampId: stamp.id,
    xPct: clampPercent(input.xPct, 50), yPct: clampPercent(input.yPct, 50),
    comment: input.comment ?? (isEn ? stamp.defaultCommentEn : stamp.defaultCommentKo),
    stageId, status: input.status ?? stamp.defaultStatus,
    assignee: (input.assignee ?? "").trim() || (isEn ? stage.ownerRoleEn : stage.ownerRoleKo),
    createdAtIso: timestamp, updatedAtIso: timestamp,
  };
  assertReviewPins([nextPin], REVIEW_STAMP_IDS, BATON_STAGE_IDS);
  return { ...state, pins: [...state.pins, nextPin], nextPinNumber: pinNumber + 1 };
}

export function updateReviewPinStatus(
  state: VisualPinReviewState, pinId: string, nextStatus: ReviewPinStatus, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  if (!REVIEW_PIN_STATUSES.includes(nextStatus)) throw new TypeError("지원하지 않는 핀 상태입니다.");
  assertReviewTimestamp(timestampIso);
  return makePinPatch(state, pinId, (pin) => (pin.status === nextStatus ? null : { ...pin, status: nextStatus, updatedAtIso: timestampIso }));
}

export function toggleReviewPinResolved(
  state: VisualPinReviewState, pinId: string, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  return makePinPatch(state, pinId, (pin) => ({ ...pin, status: togglePinResolvedStatus(pin.status), updatedAtIso: timestampIso }));
}

export function cycleReviewPinStatus(
  state: VisualPinReviewState, pinId: string, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  return makePinPatch(state, pinId, (pin) => ({ ...pin, status: cyclePinStatus(pin.status), updatedAtIso: timestampIso }));
}

export function updateReviewPinComment(
  state: VisualPinReviewState, pinId: string, comment: string, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO, expectedComment?: string,
): VisualPinReviewState {
  return makePinPatch(state, pinId, (pin) => {
    if (expectedComment !== undefined && pin.comment !== expectedComment) return null;
    assertReviewText(comment); assertReviewTimestamp(timestampIso);
    return comment === pin.comment ? null : { ...pin, comment, updatedAtIso: timestampIso };
  });
}

export function updateReviewPinStage(
  state: VisualPinReviewState, pinId: string, stageId: BatonStageId, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  const stage = getBatonStageSpec(stageId);
  return makePinPatch(state, pinId, (pin) => (pin.stageId === stageId ? null : { ...pin, stageId, assignee: stage.ownerRoleKo, updatedAtIso: timestampIso }));
}

export function moveReviewPin(
  state: VisualPinReviewState, pinId: string, xPct: number, yPct: number, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  assertReviewFinite(xPct); assertReviewFinite(yPct);
  assertReviewTimestamp(timestampIso);
  const nextX = clampPercent(xPct, 50);
  const nextY = clampPercent(yPct, 50);
  return makePinPatch(state, pinId, (pin) => (pin.xPct === nextX && pin.yPct === nextY ? null : { ...pin, xPct: nextX, yPct: nextY, updatedAtIso: timestampIso }));
}

export function removeReviewPin(state: VisualPinReviewState, pinId: string): VisualPinReviewState {
  assertState(state);
  const nextPins = state.pins.filter((pin) => pin.id !== pinId);
  return nextPins.length === state.pins.length ? state : { ...state, pins: nextPins };
}

export function resolveAllPinsForCut(
  state: VisualPinReviewState, cutId?: string, timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): VisualPinReviewState {
  assertState(state); assertReviewTimestamp(timestampIso);
  let changed = false;
  const pins = state.pins.map((pin) => {
    if ((cutId && pin.cutId !== cutId) || pin.status === "resolved") return pin;
    changed = true;
    return { ...pin, status: "resolved" as const, updatedAtIso: timestampIso };
  });
  return changed ? { ...state, pins } : state;
}

export function setBeforeAfterSplitPct(state: VisualPinReviewState, splitPct: number): VisualPinReviewState {
  assertState(state);
  const next = clampPercent(splitPct, state.beforeAfterSplitPct);
  return next === state.beforeAfterSplitPct ? state : { ...state, beforeAfterSplitPct: next };
}

export function selectActiveReviewCut(state: VisualPinReviewState, cutId: string): VisualPinReviewState {
  assertState(state); assertReviewText(cutId, 256);
  if (!cutId.trim()) throw new TypeError("컷 ID가 필요합니다.");
  return state.activeCutId === cutId ? state : { ...state, activeCutId: cutId };
}

export function summarizeReviewPins(pins: readonly ReviewPin[], cutId?: string): ReviewPinSummary {
  assertReviewPins(pins, REVIEW_STAMP_IDS, BATON_STAGE_IDS);
  const filtered = cutId ? pins.filter((pin) => pin.cutId === cutId) : pins;
  const byStamp: Record<ReviewStampId, number> = {
    "expression-fix": 0, "hand-anatomy": 0, "balloon-pos": 0,
    "bg-perspective": 0, "tone-missing": 0, "approved-stamp": 0,
  };
  const unresolvedByStage: Record<BatonStageId, number> = {
    conti: 0, lineart: 0, "flat-color": 0, shading: 0, lettering: 0, "final-ready": 0,
  };
  let openCount = 0;
  let inProgressCount = 0;
  let resolvedCount = 0;
  let blockingUnresolvedCount = 0;
  let approvedStampCount = 0;

  for (const pin of filtered) {
    byStamp[pin.stampId] += 1;
    if (pin.stampId === "approved-stamp") approvedStampCount += 1;
    if (pin.status === "open") openCount += 1;
    else if (pin.status === "in-progress") inProgressCount += 1;
    else resolvedCount += 1;

    if (getReviewStampSpec(pin.stampId).blocksStageGate && pin.status !== "resolved") {
      blockingUnresolvedCount += 1;
      unresolvedByStage[pin.stageId] += 1;
    }
  }
  return { total: filtered.length, openCount, inProgressCount, resolvedCount, blockingUnresolvedCount, approvedStampCount, byStamp, unresolvedByStage };
}

function formatPinRefPreview(pins: readonly ReviewPin[], isEn: boolean): string {
  const head = pins.slice(0, 3).map((pin) => {
    const stamp = getReviewStampSpec(pin.stampId);
    return isEn ? `Pin ${pin.pinNumber} ${stamp.labelEn}` : `${pin.pinNumber}번 ${stamp.labelKo}`;
  });
  const rest = pins.length - head.length;
  return rest <= 0 ? head.join(", ") : `${head.join(", ")} ${isEn ? `+${rest} more` : `외 ${rest}건`}`;
}

/** 6단계 바통터치 다음 단계 승인 가능 여부를 판정하고 자동 안내·1줄 요약 알림 페이로드를 생성한다. */
export function evaluateStageGateReadiness(state: VisualPinReviewState): StageGateReadinessReport {
  assertState(state);
  const currentStage = getBatonStageSpec(state.currentStageId);
  const nextStage = currentStage.nextStageId ? getBatonStageSpec(currentStage.nextStageId) : null;
  const unresolvedBlockingPins = state.pins.filter(
    (pin) => getReviewStampSpec(pin.stampId).blocksStageGate && pin.status !== "resolved",
  );
  const currentStageBlockingPins = unresolvedBlockingPins.filter((pin) => getBatonStageSpec(pin.stageId).order <= currentStage.order);
  const upcomingStageBlockingPins = unresolvedBlockingPins.filter((pin) => getBatonStageSpec(pin.stageId).order > currentStage.order);
  const resolvedPinCount = state.pins.filter((pin) => pin.status === "resolved").length;
  const approvedStampCount = state.pins.filter((pin) => pin.stampId === "approved-stamp").length;

  const gateStatus: StageGateStatus = unresolvedBlockingPins.length > 0 ? "blocked" : nextStage === null ? "finalized" : "ready";
  const canAdvance = gateStatus === "ready";
  const stageIndex = BATON_STAGE_IDS.indexOf(currentStage.id);
  const progressSteps = gateStatus === "finalized" ? BATON_STAGE_IDS.length : Math.max(1, stageIndex + (gateStatus === "ready" ? 1 : 0));
  const progressPct = Math.min(100, Math.round((progressSteps / BATON_STAGE_IDS.length) * 100));

  const pinRefs = unresolvedBlockingPins.map((pin) => pin.pinNumber);
  const refKo = formatPinRefPreview(unresolvedBlockingPins, false);
  const refEn = formatPinRefPreview(unresolvedBlockingPins, true);
  const titleTag = `${state.projectTitle} ${state.episodeLabel}`.trim();

  let autoGuidanceKo: string;
  let autoGuidanceEn: string;
  let oneLineSummaryKo: string;
  let oneLineSummaryEn: string;
  let actionPromptKo: string;
  let actionPromptEn: string;

  if (gateStatus === "blocked") {
    const targetKo = nextStage ? `${nextStage.shortLabelKo} 공정 승계` : "최종 납품 확정";
    const targetEn = nextStage ? `handoff to ${nextStage.shortLabelEn}` : "final delivery lock";
    autoGuidanceKo = `미해결 핀 ${unresolvedBlockingPins.length}건(${refKo})이 남아 있습니다. 핀을 완료하면 ${targetKo}가 자동으로 열립니다.`;
    autoGuidanceEn = `${unresolvedBlockingPins.length} open pin(s) (${refEn}) remain. Resolve them to unlock ${targetEn}.`;
    oneLineSummaryKo = normalizeSingleLineComment(`[바통 대기] ${titleTag} · ${currentStage.shortLabelKo}→${nextStage?.shortLabelKo ?? "최종"} 미해결 ${unresolvedBlockingPins.length}건 (${refKo})`, "[바통 대기]", 180);
    oneLineSummaryEn = normalizeSingleLineComment(`[Baton Hold] ${titleTag} · ${currentStage.shortLabelEn}->${nextStage?.shortLabelEn ?? "Final"} ${unresolvedBlockingPins.length} open (${refEn})`, "[Baton Hold]", 180);
    actionPromptKo = `미해결 핀 ${unresolvedBlockingPins.length}건 먼저 완료`;
    actionPromptEn = `Resolve ${unresolvedBlockingPins.length} open pin(s) first`;
  } else if (gateStatus === "ready" && nextStage) {
    autoGuidanceKo = `미해결 핀 0건 — '${currentStage.shortLabelKo}' 검수가 끝나 바로 '${nextStage.shortLabelKo}(${nextStage.ownerRoleKo})'로 바통을 넘길 수 있습니다.`;
    autoGuidanceEn = `0 open pins — '${currentStage.shortLabelEn}' is clear to hand off to '${nextStage.shortLabelEn} (${nextStage.ownerRoleEn})'.`;
    oneLineSummaryKo = normalizeSingleLineComment(`[바통 준비] ${titleTag} · ${currentStage.shortLabelKo} 완료(미해결 0건) → ${nextStage.shortLabelKo}(${nextStage.ownerRoleKo}) 즉시 승계 가능`, "[바통 준비]", 180);
    oneLineSummaryEn = normalizeSingleLineComment(`[Baton Ready] ${titleTag} · ${currentStage.shortLabelEn} clear (0 open) -> ${nextStage.shortLabelEn} (${nextStage.ownerRoleEn}) ready`, "[Baton Ready]", 180);
    actionPromptKo = `${nextStage.shortLabelKo} 공정으로 바통 넘기기`;
    actionPromptEn = `Pass baton to ${nextStage.shortLabelEn}`;
  } else {
    autoGuidanceKo = `전 공정 미해결 핀 0건 · 해결 ${resolvedPinCount}건 확인 완료. 연재본 최종 납품 준비가 끝났습니다.`;
    autoGuidanceEn = `All stages clear (0 open, ${resolvedPinCount} resolved). Episode is ready for final delivery.`;
    oneLineSummaryKo = normalizeSingleLineComment(`[최종 승인] ${titleTag} · 6단계 최종 납품 준비 완료 (해결 ${resolvedPinCount}건 · 승인 도장 ${approvedStampCount}건)`, "[최종 승인]", 180);
    oneLineSummaryEn = normalizeSingleLineComment(`[Final Approved] ${titleTag} · Stage 6 ready (${resolvedPinCount} resolved, ${approvedStampCount} approval stamps)`, "[Final Approved]", 180);
    actionPromptKo = "최종 납품 준비 완료";
    actionPromptEn = "Final delivery ready";
  }

  const notification: StageGateNotificationPayload = {
    channelHint: gateStatus === "blocked" ? "slack" : gateStatus === "ready" ? "notion" : "studio-toast",
    severity: gateStatus, currentStageId: currentStage.id, nextStageId: nextStage?.id ?? null,
    unresolvedCount: unresolvedBlockingPins.length, resolvedCount: resolvedPinCount, pinRefs,
    oneLineSummaryKo: normalizeSingleLineComment(`[메모리 예제] ${oneLineSummaryKo}`, "[메모리 예제]", 180),
    oneLineSummaryEn: normalizeSingleLineComment(`[In-memory example] ${oneLineSummaryEn}`, "[In-memory example]", 180), actionPromptKo, actionPromptEn,
  };
  return {
    currentStage, nextStage, gateStatus, canAdvance, progressPct,
    unresolvedBlockingPins, currentStageBlockingPins, upcomingStageBlockingPins,
    resolvedPinCount, approvedStampCount, autoGuidanceKo: `메모리 예제: ${autoGuidanceKo}`, autoGuidanceEn: `In-memory example: ${autoGuidanceEn}`, notification,
  };
}

/** 바통터치 다음 공정으로 전이한다. 미해결 핀이 남아 있으면 force=true 없이 전이하지 않는다. */
export function advanceBatonStage(state: VisualPinReviewState, options?: AdvanceStageOptions): StageTransitionResult {
  const gateBefore = evaluateStageGateReadiness(state);
  const nextStage = gateBefore.nextStage;
  const forced = Boolean(options?.force);
  if (!nextStage || (!gateBefore.canAdvance && !forced)) {
    return { transitioned: false, state, gate: gateBefore, notification: gateBefore.notification };
  }
  const timestampIso = options?.timestampIso ?? DEFAULT_REVIEW_TIMESTAMP_ISO;
  assertReviewTimestamp(timestampIso); assertReviewText(options?.actorName ?? "", 1024);
  const actorName = (options?.actorName ?? "").trim() || gateBefore.currentStage.ownerRoleKo;
  const isOverride = !gateBefore.canAdvance && forced;
  const record: StageTransitionRecord = {
    id: nextReviewHistoryId(state), fromStageId: gateBefore.currentStage.id, toStageId: nextStage.id,
    direction: "advance", forced: isOverride, actorName,
    summaryKo: `${gateBefore.currentStage.shortLabelKo} → ${nextStage.shortLabelKo} 바통 승계${isOverride ? " (예외 승인)" : ""}`,
    summaryEn: `Handed off ${gateBefore.currentStage.shortLabelEn} -> ${nextStage.shortLabelEn}${isOverride ? " (override)" : ""}`,
    timestampIso,
  };
  const nextState: VisualPinReviewState = { ...state, currentStageId: nextStage.id, history: [record, ...state.history] };
  const gateAfter = evaluateStageGateReadiness(nextState);
  return { transitioned: true, state: nextState, gate: gateAfter, notification: gateAfter.notification };
}

/** 수정 반려 또는 검수 전환 시 지정 공정으로 바통을 이동한다. */
export function rewindBatonStage(
  state: VisualPinReviewState, targetStageId: BatonStageId, actorName = "메인 작가", timestampIso = DEFAULT_REVIEW_TIMESTAMP_ISO,
): StageTransitionResult {
  assertState(state); getBatonStageSpec(targetStageId); assertReviewTimestamp(timestampIso); assertReviewText(actorName, 1024);
  if (state.currentStageId === targetStageId) {
    const gate = evaluateStageGateReadiness(state);
    return { transitioned: false, state, gate, notification: gate.notification };
  }
  const fromSpec = getBatonStageSpec(state.currentStageId);
  const toSpec = getBatonStageSpec(targetStageId);
  const record: StageTransitionRecord = {
    id: nextReviewHistoryId(state), fromStageId: fromSpec.id, toStageId: toSpec.id,
    direction: toSpec.order < fromSpec.order ? "rewind" : "advance", forced: false,
    actorName: actorName.trim() || "메인 작가",
    summaryKo: `${fromSpec.shortLabelKo} → ${toSpec.shortLabelKo} 공정 전환`,
    summaryEn: `Switched stage ${fromSpec.shortLabelEn} -> ${toSpec.shortLabelEn}`,
    timestampIso,
  };
  const nextState: VisualPinReviewState = { ...state, currentStageId: targetStageId, history: [record, ...state.history] };
  const gateAfter = evaluateStageGateReadiness(nextState);
  return { transitioned: true, state: nextState, gate: gateAfter, notification: gateAfter.notification };
}

export function summarizeBridgeFidelity(bridge: ExternalBridgeSpec): BridgeFidelitySummary {
  let preservedCount = 0;
  let approximatedCount = 0;
  let flattenedCount = 0;
  for (const row of bridge.mappings) {
    if (row.status === "preserved") preservedCount += 1;
    else if (row.status === "approximated") approximatedCount += 1;
    else flattenedCount += 1;
  }
  const totalMappings = bridge.mappings.length;
  const preservationRatePct = totalMappings === 0 ? 100 : Math.round(((preservedCount + approximatedCount * 0.5) / totalMappings) * 100);
  return { preservedCount, approximatedCount, flattenedCount, totalMappings, preservationRatePct };
}

export function buildVisualReviewDigestMarkdown(
  state: VisualPinReviewState, bridgeId: ExternalBridgeId = "slack-notion-digest", options?: ExternalBridgeManifestOptions,
): string {
  assertState(state); assertBridgeOptions(options);
  const isEn = options?.locale === "en";
  const scope = options?.scope ?? "episode";
  const bridge = getExternalBridgeSpec(bridgeId);
  const gate = evaluateStageGateReadiness(state);
  const scopedPins = scope === "active-cut" ? state.pins.filter((pin) => pin.cutId === state.activeCutId) : state.pins;
  const summary = summarizeReviewPins(scopedPins);

  const lines: string[] = [
    isEn ? `# Visual Pin Review Digest — ${state.projectTitle} (${state.episodeLabel})` : `# 캔버스 핀 검수 브리프 — ${state.projectTitle} (${state.episodeLabel})`,
    isEn ? "> In-memory synthetic review example and format-reference catalog. No artwork verification, file conversion, server collaboration, role enforcement, team delivery, or persistence is confirmed." : "> 메모리 합성 검토 예제와 포맷 참고 목록입니다. 원고 검증·파일 변환·서버 협업·역할 권한·팀 전송·저장은 확인하지 않습니다.",
    "",
    isEn ? `> ${gate.notification.oneLineSummaryEn}` : `> ${gate.notification.oneLineSummaryKo}`,
    "",
    isEn ? `- **Bridge**: ${bridge.toolNameEn} (${bridge.openStandardFormatEn})` : `- **외부 브리지**: ${bridge.toolNameKo} (${bridge.openStandardFormatKo})`,
    isEn ? `- **Open-Standard Policy**: ${bridge.avoidedProprietaryFormatEn}` : `- **오픈 표준 원칙**: ${bridge.avoidedProprietaryFormatKo}`,
    isEn
      ? `- **Stage**: ${gate.currentStage.labelEn} · Open Blocking Pins: ${summary.blockingUnresolvedCount} · Resolved: ${summary.resolvedCount}`
      : `- **현재 공정**: ${gate.currentStage.labelKo} · 미해결 차단 핀 ${summary.blockingUnresolvedCount}건 · 해결 ${summary.resolvedCount}건`,
    "",
    isEn ? "## Review Pins" : "## 컷 좌표 검수 핀",
  ];

  if (scopedPins.length === 0) {
    lines.push(isEn ? "- No pins registered." : "- 등록된 핀이 없습니다.");
  } else {
    for (const pin of scopedPins) {
      const stamp = getReviewStampSpec(pin.stampId);
      const stage = getBatonStageSpec(pin.stageId);
      const checkMark = pin.status === "resolved" ? "x" : " ";
      const statusLabel = isEn ? pin.status : pin.status === "resolved" ? "해결" : pin.status === "in-progress" ? "수정중" : "미해결";
      lines.push(`- [${checkMark}] ${isEn ? `Pin ${pin.pinNumber}` : `${pin.pinNumber}번`} (${pin.cutId} · ${pin.xPct}%, ${pin.yPct}%) [${isEn ? stamp.labelEn : stamp.labelKo} / ${isEn ? stage.shortLabelEn : stage.shortLabelKo} / ${statusLabel}] ${pin.comment}`);
    }
  }

  lines.push("", isEn ? "## Preservation & Loss Mapping" : "## 손실·보존 매핑표");
  lines.push(isEn ? "| Feature | Status | Detail |" : "| 항목 | 교환 상태 | 상세 |", "| --- | --- | --- |");
  for (const row of bridge.mappings) {
    const statusText = isEn ? row.status : row.status === "preserved" ? "원본 보존" : row.status === "approximated" ? "근사 변환" : "평탄화";
    lines.push(`| ${isEn ? row.featureEn : row.featureKo} | ${statusText} | ${isEn ? row.detailEn : row.detailKo} |`);
  }
  return lines.join("\n");
}

/** 5대 외부 툴 오픈 표준 라운드트립 매니페스트(손실/보존 표 · Markdown · JSON)를 생성한다. */
export function buildExternalBridgeManifest(
  bridgeId: ExternalBridgeId, state: VisualPinReviewState, options?: ExternalBridgeManifestOptions,
): ExternalBridgeManifest {
  assertState(state); assertBridgeOptions(options);
  const bridge = getExternalBridgeSpec(bridgeId);
  const scope = options?.scope ?? "episode";
  const generatedAtIso = options?.generatedAtIso ?? DEFAULT_REVIEW_TIMESTAMP_ISO;
  const gate = evaluateStageGateReadiness(state);
  const scopedPins = scope === "active-cut" ? state.pins.filter((pin) => pin.cutId === state.activeCutId) : state.pins;
  const pinSummary = summarizeReviewPins(scopedPins);
  const fidelitySummary = summarizeBridgeFidelity(bridge);
  const cutSlug = scope === "active-cut" ? state.activeCutId : "episode";
  const suggestedFileName = `toonstudio-${state.currentStageId}-${encodeURIComponent(cutSlug)}-${bridge.id}.manifest.json`;
  const markdownDigest = buildVisualReviewDigestMarkdown(state, bridge.id, options);

  const oneLineDigestKo = normalizeSingleLineComment(
    `[${bridge.shortNameKo} · ${bridge.fileExtension}] ${gate.notification.oneLineSummaryKo} (보존 ${fidelitySummary.preservedCount} · 근사 ${fidelitySummary.approximatedCount} · 평탄화 ${fidelitySummary.flattenedCount})`,
    `[${bridge.shortNameKo}] 매니페스트 준비 완료`, 220,
  );
  const oneLineDigestEn = normalizeSingleLineComment(
    `[${bridge.shortNameEn} · ${bridge.fileExtension}] ${gate.notification.oneLineSummaryEn} (Preserved ${fidelitySummary.preservedCount} · Approx ${fidelitySummary.approximatedCount} · Flattened ${fidelitySummary.flattenedCount})`,
    `[${bridge.shortNameEn}] Manifest ready`, 220,
  );

  const episode = {
    projectTitle: state.projectTitle, episodeLabel: state.episodeLabel, activeCutId: state.activeCutId,
    currentStageId: state.currentStageId, nextStageId: gate.nextStage?.id ?? null, gateStatus: gate.gateStatus,
  };
  const serializable = {
    dataSourceKind: "in-memory-example", fileConversionVerified: false, persisted: false,
    schemaVersion: VISUAL_PIN_BRIDGE_SCHEMA_VERSION, bridgeId: bridge.id, toolName: bridge.toolNameEn,
    openStandardFormat: bridge.openStandardFormatEn, fileExtension: ".json", mimeType: "application/json",
    referenceFormat: { fileExtension: bridge.fileExtension, mimeType: bridge.mimeType, conversionVerified: false },
    proprietaryBypassAvoided: true as const, avoidedProprietaryFormat: bridge.avoidedProprietaryFormatEn,
    suggestedFileName, generatedAtIso, scope, episode,
    notification: {
      oneLineSummaryKo: gate.notification.oneLineSummaryKo, oneLineSummaryEn: gate.notification.oneLineSummaryEn,
      unresolvedCount: gate.notification.unresolvedCount, pinRefs: gate.notification.pinRefs,
    },
    fidelitySummary,
    mappings: bridge.mappings.map((row) => ({
      id: row.id, feature: row.featureEn, status: row.status, detail: row.detailEn, workaround: row.workaroundEn,
    })),
    pins: scopedPins,
  };

  return {
    dataSourceKind: "in-memory-example", fileConversionVerified: false, persisted: false,
    schemaVersion: VISUAL_PIN_BRIDGE_SCHEMA_VERSION, bridge, proprietaryBypassAvoided: true, scope,
    suggestedFileName, generatedAtIso, episode, pinSummary, pins: scopedPins, fidelitySummary,
    oneLineDigestKo, oneLineDigestEn, markdownDigest, jsonPayload: JSON.stringify(serializable, null, 2),
  };
}
