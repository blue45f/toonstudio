/**
 * Wave 44D — 상업 연재 캐릭터 설정집 · 의상 변주 · 표정 9궁도 자동 조판 엔진.
 *
 * - 등신비·신장 3면도 눈금 계산기(`computeHeightRatioMetrics`): 키(cm)·등신(5.5~8.5)·굽 보정(cm) ->
 *   머리·어깨·허리·무릎 눈금 좌표(cm & 비율) 및 두신 눈금선 산출
 * - 다인 캐스트 신장·눈높이 비교(`compareCastHeights`): 투샷 시선 보정 및 쌍별 신장 차 계산
 * - 표정 9궁도 매트릭스(`DEFAULT_EXPRESSION_9GRID`): 9대 감정별 눈썹·눈매·입꼬리·홍조/땀 작화 노트
 * - 의상 연속성 5슬롯(`uniform`·`casual`·`combat`·`damaged`·`winter`) + 공식 OKLCH 컬러 칩·인쇄 주의·채색 금지 규칙
 * - 누락 항목 완성도 점수(`auditCharacterSheetCompleteness`, 0~100점) 및 Markdown/JSON 설정집 내보내기
 */

export type ExpressionSlotId =
  | "joy" | "anger" | "sadness" | "surprise" | "neutral" | "flustered" | "smirk" | "exhausted" | "serious";
export type OutfitSlotId = "uniform" | "casual" | "combat" | "damaged" | "winter";
export type CharacterPresetId = "taehyun-lead" | "seoyeon-colead" | "dojin-mentor" | "arin-tech";
export type LandmarkId = "head" | "shoulder" | "waist" | "knee";
export type SilhouetteProportionClass = "sd-compact" | "youth-athletic" | "commercial-standard" | "heroic-tall";
export type PrintGamutRiskLevel = "safe" | "caution" | "clip-risk";
export type CompletenessGrade = "production-ready" | "review-needed" | "draft-incomplete";
export type AuditSectionId = "identityAndProportion" | "expressionGrid" | "outfitContinuity" | "colorAndPrintRules";
export type AuditIssueSeverity = "critical" | "warn";

export interface OklchColorChipValue { readonly l: number; readonly c: number; readonly h: number; }
export interface PrintGamutAssessment {
  readonly level: PrintGamutRiskLevel; readonly labelKo: string; readonly labelEn: string;
  readonly adviceKo: string; readonly adviceEn: string;
}
export interface HeightRatioInput { readonly heightCm: number; readonly headRatio: number; readonly footwearBonusCm?: number; }
export interface TurnaroundLandmark {
  readonly id: LandmarkId; readonly labelKo: string; readonly labelEn: string;
  readonly heightFromFloorCm: number; readonly bareHeightFromFloorCm: number; readonly offsetFromCrownCm: number;
  readonly ratioFromFloor: number; readonly ratioFromTop: number; readonly headUnitsFromCrown: number;
}
export interface HeadDivisionTick {
  readonly headIndex: number; readonly heightFromFloorCm: number; readonly ratioFromFloor: number;
}
export interface HeightRatioMetrics {
  readonly bareHeightCm: number; readonly footwearBonusCm: number; readonly effectiveHeightCm: number;
  readonly headRatio: number; readonly headUnitCm: number; readonly eyeLevelCm: number;
  readonly silhouetteClass: SilhouetteProportionClass;
  readonly landmarks: readonly TurnaroundLandmark[];
  readonly byId: Readonly<Record<LandmarkId, TurnaroundLandmark>>;
  readonly headDivisions: readonly HeadDivisionTick[];
}
export interface CastHeightEntry {
  readonly id: string; readonly nameKo: string; readonly nameEn: string;
  readonly roleKo?: string; readonly roleEn?: string;
  readonly heightCm: number; readonly headRatio: number; readonly footwearBonusCm?: number;
  readonly accentOklch?: OklchColorChipValue;
}
export interface CastHeightComparisonMember {
  readonly id: string; readonly nameKo: string; readonly nameEn: string;
  readonly roleKo: string; readonly roleEn: string; readonly accentOklch: OklchColorChipValue;
  readonly metrics: HeightRatioMetrics; readonly isReference: boolean;
  readonly deltaFromReferenceCm: number; readonly deltaFromTallestCm: number; readonly eyeLevelDeltaFromReferenceCm: number;
  readonly framingGuideKo: string; readonly framingGuideEn: string;
}
export interface CastPairwiseHeightDelta {
  readonly fromId: string; readonly toId: string; readonly fromNameKo: string;
  readonly toNameKo: string; readonly deltaCm: number; readonly eyeLevelDeltaCm: number;
}
export interface CastHeightComparison {
  readonly referenceId: string | null; readonly members: readonly CastHeightComparisonMember[];
  readonly tallestMember: CastHeightComparisonMember | null; readonly shortestMember: CastHeightComparisonMember | null;
  readonly maxHeightSpanCm: number; readonly averageEffectiveHeightCm: number;
  readonly pairwiseDeltas: readonly CastPairwiseHeightDelta[];
}
export interface ExpressionNoteFields {
  readonly eyebrowNote: string; readonly eyeNote: string; readonly mouthNote: string; readonly blushSweatNote: string;
}
export interface ExpressionGridCell extends ExpressionNoteFields {
  readonly id: ExpressionSlotId; readonly gridRow: 0 | 1 | 2; readonly gridCol: 0 | 1 | 2;
  readonly labelKo: string; readonly labelEn: string; readonly usageContextKo: string; readonly usageContextEn: string;
}
export interface OutfitSlotEditableFields {
  readonly silhouetteSummary: string; readonly keyAccessories: readonly string[];
  readonly continuityChecklist: string; readonly damageOrWeatherRule: string;
}
export interface OutfitContinuitySlot extends OutfitSlotEditableFields {
  readonly id: OutfitSlotId; readonly labelKo: string; readonly labelEn: string;
}
export interface OfficialColorChip {
  readonly id: string; readonly partKo: string; readonly partEn: string; readonly slotScope: "base" | OutfitSlotId;
  readonly oklch: OklchColorChipValue; readonly printCmykNote: string; readonly doNotColorRule: string;
}
export interface OfficialColorChipPatch {
  readonly partKo?: string; readonly partEn?: string; readonly slotScope?: "base" | OutfitSlotId;
  readonly oklch?: Partial<OklchColorChipValue>; readonly printCmykNote?: string; readonly doNotColorRule?: string;
}
export interface CharacterSheetBible {
  readonly id: string; readonly code: string; readonly seriesTitle: string;
  readonly nameKo: string; readonly nameEn: string; readonly roleKo: string; readonly roleEn: string;
  readonly ageLabel: string; readonly heightCm: number; readonly headRatio: number; readonly footwearBonusCm: number;
  readonly accentOklch: OklchColorChipValue;
  readonly silhouetteSignature: string; readonly asymmetryPoints: string; readonly hairAndBuildNotes: string;
  readonly expressions: readonly ExpressionGridCell[];
  readonly outfits: readonly OutfitContinuitySlot[];
  readonly colorChips: readonly OfficialColorChip[];
  readonly globalColoringProhibitions: readonly string[];
}
export interface AuditSectionScore { readonly earned: number; readonly max: number; readonly ratio: number; }
export interface CharacterSheetAuditIssue {
  readonly id: string; readonly section: AuditSectionId; readonly severity: AuditIssueSeverity;
  readonly fieldPath: string; readonly messageKo: string; readonly messageEn: string;
}
export interface CharacterSheetCompletenessAudit {
  readonly totalScore: number; readonly grade: CompletenessGrade;
  readonly sectionScores: Readonly<Record<AuditSectionId, AuditSectionScore>>;
  readonly missingItems: readonly CharacterSheetAuditIssue[];
  readonly completedChecklistCount: number; readonly totalChecklistCount: number;
}
export interface CharacterSheetExportOptions {
  readonly cast?: readonly CastHeightEntry[]; readonly locale?: "ko" | "en";
}

export const MIN_HEIGHT_CM = 110;
export const MAX_HEIGHT_CM = 230;
export const DEFAULT_HEIGHT_CM = 175;
export const MIN_HEAD_RATIO = 5.5;
export const MAX_HEAD_RATIO = 8.5;
export const DEFAULT_HEAD_RATIO = 7.5;
export const MIN_FOOTWEAR_BONUS_CM = 0;
export const MAX_FOOTWEAR_BONUS_CM = 15;
export const DEFAULT_FOOTWEAR_BONUS_CM = 0;

export const EXPRESSION_SLOT_IDS: readonly ExpressionSlotId[] = [
  "joy", "anger", "sadness", "surprise", "neutral", "flustered", "smirk", "exhausted", "serious",
] as const;
export const OUTFIT_SLOT_IDS: readonly OutfitSlotId[] = ["uniform", "casual", "combat", "damaged", "winter"] as const;
export const CHARACTER_PRESET_IDS: readonly CharacterPresetId[] = [
  "taehyun-lead", "seoyeon-colead", "dojin-mentor", "arin-tech",
] as const;

const DEFAULT_ACCENT_OKLCH: OklchColorChipValue = { l: 0.62, c: 0.14, h: 252 };

function expr(
  id: ExpressionSlotId, gridRow: 0 | 1 | 2, gridCol: 0 | 1 | 2, labelKo: string, labelEn: string,
  eyebrowNote: string, eyeNote: string, mouthNote: string, blushSweatNote: string,
  usageContextKo: string, usageContextEn: string,
): ExpressionGridCell {
  return { id, gridRow, gridCol, labelKo, labelEn, eyebrowNote, eyeNote, mouthNote, blushSweatNote, usageContextKo, usageContextEn };
}

function outfit(
  id: OutfitSlotId, labelKo: string, labelEn: string, silhouetteSummary: string,
  keyAccessories: readonly string[], continuityChecklist: string, damageOrWeatherRule: string,
): OutfitContinuitySlot {
  return { id, labelKo, labelEn, silhouetteSummary, keyAccessories, continuityChecklist, damageOrWeatherRule };
}

function chip(
  id: string, partKo: string, partEn: string, slotScope: "base" | OutfitSlotId,
  l: number, c: number, h: number, printCmykNote: string, doNotColorRule: string,
): OfficialColorChip {
  return { id, partKo, partEn, slotScope, oklch: { l, c, h }, printCmykNote, doNotColorRule };
}

/** 상업 연재 캐릭터 표정 9궁도 기본 매트릭스 (기쁨·분노·슬픔·놀람·무표정·당황·비웃음·피곤·진지). */
export const DEFAULT_EXPRESSION_9GRID: readonly ExpressionGridCell[] = [
  expr("joy", 0, 0, "기쁨", "Joy", "눈썹 안쪽을 완만히 들어 올리고 끝선을 부드럽게 내려 온화한 곡선 유지", "하안검을 살짝 밀어 올려 눈웃음 곡선 형성, 상단 주 하이라이트 2점 유지",
    "양 입꼬리 대칭 상승, 윗니는 1/3 이하만 노출해 과장 억제", "광대 아래 옅은 수평 홍조선 2~3가닥 배치, 땀방울 생략", "일상 회복 컷 · 동료와 안도하는 클로즈업", "Relief close-up & warm daily dialogue"),
  expr("anger", 0, 1, "분노", "Anger", "미간을 강하게 좁히며 눈썹 안쪽을 25도 이상 급강하, 미간 세로 주름 2선 강조", "상안검 직선 압박으로 동공 15% 축소, 하이라이트를 상단 1점으로 절제",
    "입꼬리를 아래로 당겨 이를 악물거나 한쪽 송곳니만 미세 노출", "관자놀이 핏줄 1곳 선택 표기, 광대 홍조 금지 · 코등 그림자 강화", "대치 선언 · 전투 개시 직전 임팩트 컷", "Confrontation beat & pre-combat impact"),
  expr("sadness", 0, 2, "슬픔", "Sadness", "눈썹 안쪽을 팔자 형태로 들어 올리고 바깥 꼬리를 낮춰 취약감 형성", "하안검 경계에 얇은 눈물막 선 추가, 동공 하단 반사광을 흩어지게 처리",
    "입술 중앙에 힘을 빼고 양 입꼬리를 미세 하강, 아랫입술 그림자 강조", "눈밑과 콧망울 끝에만 옅은 발적 톤 15% 이내 적용, 땀 표현 제외", "회상 독백 · 상실 직후 침묵 여백 컷", "Flashback monologue & quiet emotional beat"),
  expr("surprise", 1, 0, "놀람", "Surprise", "눈썹 전체를 평소보다 1.4배 높이로 급상승시켜 이마 여백 축소", "상하안검을 크게 열어 동공 주위 흰자위 노출, 동공은 20% 수축",
    "세로 타원형으로 짧게 벌린 입, 턱선이 1~2mm 내려가도록 윤곽 보정", "관자놀이 옆 짧은 땀방울 1개 허용, 홍조 생략", "반전 공개 · 예상치 못한 습격 포착 컷", "Plot twist reveal & sudden ambush reaction"),
  expr("neutral", 1, 1, "무표정", "Neutral", "눈매 각도와 평행한 수평 기준선 유지, 불필요한 주름선 완전 제거", "동공 중앙 정렬, 상안검이 홍채 상단 1/5만 덮는 기본 시선 비율 고정",
    "입꼬리 기울기 0도의 담백한 일자선, 아랫입술 중앙 짧은 받침선 1개", "홍조·땀 모두 0건 유지 — 3면도 기준 표정 마스터로 활용", "정보 전달 대사 · 3면도 기준 원형 표정", "Baseline turnaround & exposition dialogue"),
  expr("flustered", 1, 2, "당황", "Flustered", "좌우 눈썹 높이를 미세하게 비대칭 배치(안쪽 상승 + 바깥 떨림)", "시선을 좌측 또는 우측 하단으로 회피시키고 동공 하이라이트 미세 흔들림",
    "작게 벌리거나 물결형으로 굳은 입선, 코믹 컷에서도 인체 비율 이탈 금지", "볼 중앙~콧등 가로 홍조 + 관자놀이 세로 땀방울 1~2개 배치", "예상 외 질문 · 관계 진전 코믹 리듬 컷", "Caught off-guard & comedic social tension"),
  expr("smirk", 2, 0, "비웃음", "Smirk", "한쪽 눈썹만 15도 치켜올리고 반대쪽은 낮게 고정해 비대칭 조소 연출", "반쯤 내리깐 상안검 아래로 동공을 살짝 위로 치켜뜨는 냉소 시선",
    "우측 입꼬리만 비스듬히 끌어올리고 반대쪽은 수평 고정", "홍조·땀 전면 금지, 눈두덩과 코 옆 한색 그림자로 여유 강조", "심리전 우위 · 적의 함정을 역이용하는 컷", "Psychological upper hand & dry mockery"),
  expr("exhausted", 2, 1, "피곤", "Exhausted", "힘이 빠진 평평한 곡선, 미간을 좁히지 않고 바깥 꼬리만 5도 처짐", "상안검을 40% 이상 덮어 초점 흐림 연출, 눈 밑 다크서클 얇은 해칭 2~3선",
    "살짝 벌어진 채 힘없이 내려간 입선, 한숨 말풍선과 호흡 연동", "목덜미나 뺨에 흐른 식은땀 1줄기 선택 표기, 홍조 생략", "야근·연속 전투 후유증 · 긴장 이완 컷", "Post-battle fatigue & late-night exhaustion"),
  expr("serious", 2, 2, "진지", "Serious", "눈썹을 수평에 가깝게 낮추되 분노보다 미간 주름을 절제해 집중감 유지", "상안검 선 굵기를 15% 강화하고 동공 중앙 초점을 카메라 정면에 고정",
    "단단히 다문 직선 입매, 입꼬리 끝점을 짧게 찍어 결의 표현", "홍조 금지 · 긴박한 상황일 때만 턱선 옆 미세 땀방울 1개 제한 허용", "작전 브리핑 · 결단 대사 · 엔딩 클리프행어", "Strategy briefing & decisive cliffhanger"),
] as const;

function round1(value: number): number { return Math.round(value * 10) / 10; }
function round3(value: number): number { return Math.round(value * 1000) / 1000; }
function clampFinite(value: number, min: number, max: number, fallback: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function hasText(value: string | undefined, minLen = 2): boolean {
  return typeof value === "string" && value.trim().length >= minLen;
}
function normalizeOklch(input: OklchColorChipValue): OklchColorChipValue {
  const l = round3(clampFinite(input.l, 0.05, 0.98, 0.6));
  const c = round3(clampFinite(input.c, 0, 0.36, 0.1));
  const rawH = Number.isFinite(input.h) ? input.h : 0;
  return { l, c, h: round1(((rawH % 360) + 360) % 360) };
}

/** OKLCH 수치를 CSS `oklch(L C H)` 문자열로 직렬화한다. */
export function formatOklchCss(oklch: OklchColorChipValue): string {
  const s = normalizeOklch(oklch);
  return `oklch(${s.l.toFixed(2)} ${s.c.toFixed(3)} ${s.h.toFixed(1)})`;
}

/** OKLCH 수치를 어시스턴트 시트 표기용 문자열(`L · C · H°`)로 포맷한다. */
export function formatOklchSpec(oklch: OklchColorChipValue): string {
  const s = normalizeOklch(oklch);
  return `L ${s.l.toFixed(2)} · C ${s.c.toFixed(3)} · H ${s.h.toFixed(0)}°`;
}

/** 단행본 CMYK 인쇄 변환 시 OKLCH 채도·명도 색역 클리핑 위험도를 판정한다. */
export function assessOklchPrintGamut(oklch: OklchColorChipValue): PrintGamutAssessment {
  const s = normalizeOklch(oklch);
  if (s.c >= 0.18 || (s.l <= 0.22 && s.c >= 0.1)) {
    return {
      level: "clip-risk", labelKo: "인쇄 색역 클리핑 주의", labelEn: "CMYK Gamut Clip Risk",
      adviceKo: "고채도/암부 색역으로 단행본 CMYK 변환 시 탁해질 수 있어 별색 보정 프로파일 필요",
      adviceEn: "High chroma or deep shadow may desaturate in CMYK print; apply print-safe profile",
    };
  }
  if (s.c >= 0.13 || s.l >= 0.92) {
    return {
      level: "caution", labelKo: "인쇄 미세 보정 권장", labelEn: "Minor Print Tuning",
      adviceKo: "인쇄 교정지 테스트에서 명도·채도 3~5% 보정을 권장하는 경계 색역",
      adviceEn: "Near CMYK boundary; verify 3-5% lightness/chroma shift on proof prints",
    };
  }
  return {
    level: "safe", labelKo: "웹·단행본 안전 색역", labelEn: "Web & Print Safe",
    adviceKo: "웹 RGB와 단행본 CMYK 간 색차 변동이 적은 안정 구간",
    adviceEn: "Stable gamut across vertical web scroll and printed volumes",
  };
}

function classifySilhouette(headRatio: number): SilhouetteProportionClass {
  if (headRatio < 6.3) return "sd-compact";
  if (headRatio < 7.0) return "youth-athletic";
  return headRatio < 7.8 ? "commercial-standard" : "heroic-tall";
}

/**
 * 등신비·신장 3면도 눈금 계산기.
 * - 키(cm), 등신(5.5~8.5), 굽/신발 보정(cm)을 받아 머리·어깨·허리·무릎 눈금 좌표(cm & 비율)를 산출한다.
 */
export function computeHeightRatioMetrics(input: HeightRatioInput): HeightRatioMetrics {
  const bareHeightCm = round1(clampFinite(input.heightCm, MIN_HEIGHT_CM, MAX_HEIGHT_CM, DEFAULT_HEIGHT_CM));
  const headRatio = round1(clampFinite(input.headRatio, MIN_HEAD_RATIO, MAX_HEAD_RATIO, DEFAULT_HEAD_RATIO));
  const footwearBonusCm = round1(
    clampFinite(input.footwearBonusCm ?? DEFAULT_FOOTWEAR_BONUS_CM, MIN_FOOTWEAR_BONUS_CM, MAX_FOOTWEAR_BONUS_CM, 0),
  );
  const effectiveHeightCm = round1(bareHeightCm + footwearBonusCm);
  const headUnitExact = bareHeightCm / headRatio;
  const headUnitCm = round1(headUnitExact);
  const eyeLevelCm = round1(bareHeightCm - headUnitExact * 0.5 + footwearBonusCm);

  // 등신이 높아질수록 하체(허리·무릎 이하) 비중이 완만히 신장되는 상업 웹툰 인체 비례 기준.
  const waistBareRatio = clampFinite(0.57 + (headRatio - 5.5) * 0.018, 0.57, 0.635, 0.606);
  const kneeBareRatio = clampFinite(0.265 + (headRatio - 5.5) * 0.01, 0.265, 0.295, 0.285);

  const makeLm = (id: LandmarkId, labelKo: string, labelEn: string, bareFromFloor: number): TurnaroundLandmark => {
    const effFromFloor = round1(bareFromFloor + footwearBonusCm);
    const ratioFromFloor = round3(effFromFloor / effectiveHeightCm);
    return {
      id, labelKo, labelEn, heightFromFloorCm: effFromFloor, bareHeightFromFloorCm: round1(bareFromFloor),
      offsetFromCrownCm: round1(effectiveHeightCm - effFromFloor), ratioFromFloor,
      ratioFromTop: round3(1 - ratioFromFloor), headUnitsFromCrown: round1((bareHeightCm - bareFromFloor) / headUnitExact),
    };
  };

  const head = makeLm("head", "머리(턱선 · 1두신)", "Head / Chin (1H)", bareHeightCm - headUnitExact);
  const shoulder = makeLm("shoulder", "어깨선", "Shoulder Line", bareHeightCm - headUnitExact * 1.38);
  const waist = makeLm("waist", "허리선", "Waist Line", bareHeightCm * waistBareRatio);
  const knee = makeLm("knee", "무릎선", "Knee Line", bareHeightCm * kneeBareRatio);

  const headDivisions: HeadDivisionTick[] = [];
  for (let i = 0; i <= Math.floor(headRatio); i += 1) {
    const effY = round1(Math.max(0, bareHeightCm - i * headUnitExact) + footwearBonusCm);
    headDivisions.push({ headIndex: i, heightFromFloorCm: effY, ratioFromFloor: round3(effY / effectiveHeightCm) });
  }

  return {
    bareHeightCm, footwearBonusCm, effectiveHeightCm, headRatio, headUnitCm, eyeLevelCm,
    silhouetteClass: classifySilhouette(headRatio), landmarks: [head, shoulder, waist, knee],
    byId: { head, shoulder, waist, knee }, headDivisions,
  };
}

const EMPTY_CAST_COMPARISON: CastHeightComparison = {
  referenceId: null, members: [], tallestMember: null, shortestMember: null,
  maxHeightSpanCm: 0, averageEffectiveHeightCm: 0, pairwiseDeltas: [],
};

/** 다인 캐릭터 간 신장·눈높이 차이 및 투샷 시선 보정 가이드를 계산한다. */
export function compareCastHeights(cast: readonly CastHeightEntry[], referenceId?: string): CastHeightComparison {
  if (cast.length === 0) return EMPTY_CAST_COMPARISON;
  const computed = cast.map((entry) => ({
    entry,
    metrics: computeHeightRatioMetrics({ heightCm: entry.heightCm, headRatio: entry.headRatio, footwearBonusCm: entry.footwearBonusCm ?? 0 }),
  }));
  const refItem = computed.find((item) => item.entry.id === referenceId) ?? computed[0];
  if (!refItem) return EMPTY_CAST_COMPARISON;

  let tallestCm = -Infinity;
  let shortestCm = Infinity;
  let sumCm = 0;
  for (const item of computed) {
    tallestCm = Math.max(tallestCm, item.metrics.effectiveHeightCm);
    shortestCm = Math.min(shortestCm, item.metrics.effectiveHeightCm);
    sumCm += item.metrics.effectiveHeightCm;
  }

  const members: CastHeightComparisonMember[] = computed.map((item) => {
    const isRef = item.entry.id === refItem.entry.id;
    const deltaRef = round1(item.metrics.effectiveHeightCm - refItem.metrics.effectiveHeightCm);
    const eyeDelta = round1(item.metrics.eyeLevelCm - refItem.metrics.eyeLevelCm);
    const signed = `${deltaRef >= 0 ? "+" : ""}${deltaRef.toFixed(1)}cm`;
    const absEye = Math.abs(eyeDelta);
    const framingGuideKo = isRef
      ? "기준 캐릭터 (투샷 기준선)"
      : absEye >= 15
        ? `기준 대비 ${signed} · 눈높이 차 ${absEye.toFixed(1)}cm (하이/로우 앵글 시선 보정 필수)`
        : absEye >= 6
          ? `기준 대비 ${signed} · 눈높이 차 ${absEye.toFixed(1)}cm (투샷 어깨·시선 단차 유지)`
          : `기준 대비 ${signed} · 수평 아이레벨 투샷 적합`;
    const framingGuideEn = isRef
      ? "Reference character (two-shot baseline)"
      : absEye >= 15
        ? `${signed} vs ref · ${absEye.toFixed(1)}cm eye gap (tilt two-shot framing)`
        : absEye >= 6
          ? `${signed} vs ref · ${absEye.toFixed(1)}cm eye gap (preserve shoulder offset)`
          : `${signed} vs ref · suitable for level eye-line two-shot`;

    return {
      id: item.entry.id, nameKo: item.entry.nameKo, nameEn: item.entry.nameEn,
      roleKo: item.entry.roleKo ?? "", roleEn: item.entry.roleEn ?? "",
      accentOklch: normalizeOklch(item.entry.accentOklch ?? DEFAULT_ACCENT_OKLCH),
      metrics: item.metrics, isReference: isRef, deltaFromReferenceCm: deltaRef,
      deltaFromTallestCm: round1(item.metrics.effectiveHeightCm - tallestCm),
      eyeLevelDeltaFromReferenceCm: eyeDelta, framingGuideKo, framingGuideEn,
    };
  });

  const sorted = [...members].sort((a, b) => b.metrics.effectiveHeightCm - a.metrics.effectiveHeightCm);
  const pairwiseDeltas: CastPairwiseHeightDelta[] = [];
  for (let i = 0; i < members.length; i += 1) {
    const a = members[i];
    if (!a) continue;
    for (let j = i + 1; j < members.length; j += 1) {
      const b = members[j];
      if (!b) continue;
      pairwiseDeltas.push({
        fromId: a.id, toId: b.id, fromNameKo: a.nameKo, toNameKo: b.nameKo,
        deltaCm: round1(a.metrics.effectiveHeightCm - b.metrics.effectiveHeightCm),
        eyeLevelDeltaCm: round1(a.metrics.eyeLevelCm - b.metrics.eyeLevelCm),
      });
    }
  }

  return {
    referenceId: refItem.entry.id, members, tallestMember: sorted[0] ?? null,
    shortestMember: sorted[sorted.length - 1] ?? null, maxHeightSpanCm: round1(tallestCm - shortestCm),
    averageEffectiveHeightCm: round1(sumCm / members.length), pairwiseDeltas,
  };
}

function cloneExpressions(overrides: Partial<Record<ExpressionSlotId, Partial<ExpressionNoteFields>>>): readonly ExpressionGridCell[] {
  return DEFAULT_EXPRESSION_9GRID.map((cell) => {
    const patch = overrides[cell.id];
    return patch ? { ...cell, ...patch } : { ...cell };
  });
}

/** 상업 연재 4인 주조연 캐릭터 바이블 프리셋 카탈로그. */
export const CHARACTER_SHEET_PRESETS: readonly CharacterSheetBible[] = [
  {
    id: "taehyun-lead", code: "CH-01", seriesTitle: "아크 크로니클: 서울 2048",
    nameKo: "강태현", nameEn: "Kang Taehyun", roleKo: "주인공 · 특수현장 조사관", roleEn: "Lead · Field Investigator",
    ageLabel: "24세", heightCm: 181, headRatio: 7.8, footwearBonusCm: 3.5, accentOklch: { l: 0.56, c: 0.14, h: 252 },
    silhouetteSignature: "직각에 가까운 넓은 어깨선(2.1두신 폭)과 롱코트 하단 깃의 날카로운 사선 실루엣",
    asymmetryPoints: "왼쪽 눈썹 바깥쪽 7mm 흉터 · 오른손 검지 은색 링 · 왼쪽 옷깃 인식표 클립 고정",
    hairAndBuildNotes: "흑청 단발 울프컷, 앞머리는 좌측 눈썹 위로 3가닥 분리. 목젖과 쇄골 음영을 간결하게 유지.",
    expressions: cloneExpressions({
      joy: { mouthNote: "크게 웃지 않고 입꼬리만 15도 절제 상승, 윗니 노출 생략" },
      smirk: { eyebrowNote: "왼쪽 흉터가 걸린 눈썹을 10도 내려 차가운 대비 유지" },
    }),
    outfits: [
      outfit("uniform", "제복 · 조사국 정복", "Uniform", "다크 네이비 롱 트렌치 + 하이넥 이너 + 가죽 숄더 홀스터", ["좌측 옷깃 은색 조사국 배지", "오른손 검지 은색 링", "허리벨트 사각 버클"],
        "코트 단추는 상단 2개 항상 오픈 유지, 뒷트임은 무릎 아래 6cm 위치 고정", "우천 컷에서는 어깨와 소매 끝 명도만 0.08 낮추고 하이라이트 반사선 2가닥 추가"),
      outfit("casual", "사복 · 잠입 일상복", "Casual", "오프화이트 헤비 코튼 니트 + 차콜 와이드 슬랙스 + 크로스백", ["검정 가죽 시계(왼손목)", "오른손 검지 은색 링"],
        "니트 소매는 팔꿈치 아래 5cm까지 자연스럽게 걷어 올린 상태 유지", "실내 조명 시 니트 그림자에 난색 회색만 사용, 보라 계열 음영 금지"),
      outfit("combat", "전투복 · 전술 기동복", "Combat", "방탄 카본 흉갑 하네스 + 무광 슬림 택티컬 팬츠 + 전투 부츠(굽 3.5cm)", ["우측 허벅지 퀵드로우 홀스터", "목덜미 통신 이어피스(우측 귀)", "전술 반장갑"],
        "하네스 X자 스트랩 교차점은 흉골 중앙 유지, 좌우 탄창 파우치 2개 균형 확인", "전투 광원 효과 시 카본 흉갑 경계에만 1px 림라이트 적용"),
      outfit("damaged", "파손 · 부상 변주", "Damaged", "우측 어깨 코트 찢어짐 + 왼쪽 팔뚝 압박 붕대 + 이너 칼라 풀어헤침", ["왼쪽 팔뚝 흰 붕대(혈흔 20% 이하)", "깨진 통신 이어피스"],
        "찢어진 코트 섬유 방향은 대각선 사선 유지, 흉터 위치(왼쪽 눈썹) 누락 금지", "혈흔은 채도 C 0.14 이하의 어두운 적갈색 고정 — 형광 빨강 채색 금지"),
      outfit("winter", "동복 · 혹한기 외투", "Winter", "헤비 울 더블 코트 + 짙은 그레이 캐시미어 머플러 + 가죽 장갑", ["목선을 감싸는 2겹 머플러(좌측 끝단 길게)", "무광 가죽 장갑"],
        "머플러 매듭은 턱선 바로 아래까지만 덮어 입매 표정이 가려지지 않게 유지", "눈발 컷에서는 어깨와 정수리에만 백색 눈송이 포인트 4~6개 절제 배치"),
    ],
    colorChips: [
      chip("th-skin", "피부 기본톤", "Base Skin", "base", 0.86, 0.042, 58, "단행본 인쇄 시 황색 과다 방지 — 그림자는 H 38° 방향으로 20°만 이동", "피부 그림자에 회색/순흑 곱하기 금지 · 채도 0.06 이하 난색 음영만 허용"),
      chip("th-hair", "머리카락 (흑청)", "Hair (Blue-Black)", "base", 0.24, 0.032, 256, "단행본 암부 뭉개짐 방지 — L 0.22 미만으로 내려가지 않게 유지", "순흑(L<0.15) 통채우기 금지 · 정수리 하이라이트는 얇은 회청 띠 1줄로 제한"),
      chip("th-eyes", "눈동자 (스틸 블루)", "Iris (Steel Blue)", "base", 0.56, 0.135, 248, "클로즈업 컷에서만 하단 반사광 L +0.16 보정 허용", "네온 시안 발광 브러시 금지 · 일상 컷에서 눈동자 채도 0.15 초과 금지"),
      chip("th-uniform-coat", "조사국 롱코트 본체", "Uniform Coat", "uniform", 0.31, 0.055, 258, "머리색과 명도 차 최소 0.07 이상 확보해 실루엣 분리 유지", "머리카락과 동일 색상 스포이드 복제 금지"),
      chip("th-combat-armor", "전술 카본 하네스", "Tactical Harness", "combat", 0.38, 0.018, 245, "무광 회흑 톤 — 인쇄 시 잉크 총량 260% 이하 유지", "금속성 고광택 백색 스페큘러 과다 도포 금지"),
      chip("th-winter-scarf", "동복 머플러 포인트", "Winter Scarf", "winter", 0.48, 0.095, 30, "웹/인쇄 안전 적갈 톤 — 피부색과 경계 대비 유지", "선명한 원색 빨강(C>0.18)으로 대체 채색 금지"),
    ],
    globalColoringProhibitions: [
      "모든 컷에서 순흑(L<0.15) 선화·그림자 통채우기 금지",
      "피부·의상 음영에 채도 0.18 초과 네온 보라/시안 곱하기 레이어 사용 금지",
      "왼쪽 눈썹 흉터와 오른손 검지 은색 링은 좌우 반전 컷에서도 방향 교정 필수",
    ],
  },
  {
    id: "seoyeon-colead", code: "CH-02", seriesTitle: "아크 크로니클: 서울 2048",
    nameKo: "윤서연", nameEn: "Yoon Seoyeon", roleKo: "공동주연 · 기록복원 분석관", roleEn: "Co-Lead · Forensic Archivist",
    ageLabel: "23세", heightCm: 166, headRatio: 7.2, footwearBonusCm: 4.0, accentOklch: { l: 0.62, c: 0.145, h: 24 },
    silhouetteSignature: "긴 허리선 대비 볼륨 있는 로우번 헤어와 케이프형 칼라가 만드는 모래시계 실루엣",
    asymmetryPoints: "오른쪽 귀 금색 드롭 이어링(단독) · 왼쪽 쇄골 아래 작은 점 1개 · 좌측 앞머리 핀",
    hairAndBuildNotes: "웜 체스트넛 롱헤어를 낮게 묶은 로우번, 턱선 옆 애교머리 2가닥이 표정 감정을 보조.",
    expressions: cloneExpressions({
      serious: { eyeNote: "안경 착용 컷에서는 렌즈 반사선을 사선 1줄로 제한해 동공 가림 방지" },
      flustered: { blushSweatNote: "귀 끝과 볼 중앙 동시 홍조 적용, 안경 살짝 흘러내림 연출 가능" },
    }),
    outfits: [
      outfit("uniform", "제복 · 분석관 블레이저", "Uniform", "아이보리 실크 블라우스 + 버건디 리본 타이 + 크롭 네이비 블레이저", ["금테 라운드 안경(선택 탈착)", "오른쪽 귀 금색 드롭 이어링", "가죽 태블릿 파우치"],
        "리본 타이 매듭 중앙의 황동 핀 위치 고정, 블레이저 소매 금장 단추 3개 유지", "실내 서고 조명에서는 블라우스 음영을 따뜻한 베이지(H 65°)로 통일"),
      outfit("casual", "사복 · 아틀리에 일상복", "Casual", "테라코타 가디건 + 플리츠 미디 스커트 + 로퍼(굽 4cm)", ["좌측 앞머리 호박색 헤어핀", "가죽 스트랩 손목시계"],
        "플리츠 주름은 정면 기준 7가닥 리듬 유지, 과도한 세밀 선화 지양", "야외 역광 컷에서는 머리카락 바깥 윤곽에만 웜 골드 림라이트 적용"),
      outfit("combat", "전투복 · 현장 지원 재킷", "Combat", "방수 숏 필드 재킷 + 허리 데이터 팩 벨트 + 미드컷 워커", ["허리 우측 스캐너 홀더", "좌측 팔목 홀로그램 단말기", "로우번 고정용 택티컬 핀"],
        "활동 컷에서는 로우번이 풀리지 않도록 묶음 실루엣 유지", "단말기 빛 반사는 턱 아래·손가락 끝에만 20% 불투명도로 제한"),
      outfit("damaged", "파손 · 긴급 대피 변주", "Damaged", "로우번 반풀림 + 겉재킷 탈의 + 오른쪽 손등 찰과상 밴드", ["한쪽 렌즈 금간 안경(보관)", "오른손등 의료 밴드"],
        "머리가 풀려도 좌측 앞머리 핀은 유지해 캐릭터 식별력 보존", "먼지 얼룩은 무릎과 어깨 끝에만 텍스처 브러시 1회 터치로 제한"),
      outfit("winter", "동복 · 케이프 울 코트", "Winter", "오트밀 케이프 더블 코트 + 니트 베레모 + 앵클 부츠", ["버건디 니트 장갑", "케이프 여밈 금색 체인 클라스프"],
        "케이프 기장은 팔꿈치선 일치, 팔 움직임 시 안쪽 소매 명도 어둡게 분리", "베레모 착용 시에도 오른쪽 귀 금색 이어링이 살짝 보이도록 각도 조정"),
    ],
    colorChips: [
      chip("sy-skin", "피부 기본톤", "Base Skin", "base", 0.89, 0.036, 52, "강태현보다 명도 +0.03 밝게 유지해 투샷 피부 대비 확보", "분홍 원색 오버레이 금지 · 볼 홍조는 L 0.78 C 0.09 이내 유지"),
      chip("sy-hair", "머리카락 (웜 체스트넛)", "Hair (Warm Chestnut)", "base", 0.36, 0.072, 42, "인쇄 시 붉은기 상승 주의 — H 42° 이상 황갈 방향 유지", "검정 선화로 머릿결 내부 과밀 해칭 금지"),
      chip("sy-eyes", "눈동자 (앰버 골드)", "Iris (Amber Gold)", "base", 0.68, 0.142, 72, "CMYK 안전 경계 — 하단 발광부는 L 0.82 이하 절제", "형광 노랑(C>0.18) 사용 금지"),
      chip("sy-ribbon", "제복 버건디 리본", "Uniform Ribbon", "uniform", 0.44, 0.138, 20, "단행본 표지/본문 공통 포인트 컬러 — 채도 편차 ±0.01 이내", "주황빛 다홍색으로 이동 금지"),
      chip("sy-winter-coat", "동복 오트밀 케이프", "Winter Cape Coat", "winter", 0.84, 0.028, 82, "배경 흰 여백과 섞이지 않도록 외곽선 대비 확보", "순백(L>0.95) 채색 금지 — 반드시 L 0.84 톤 유지"),
    ],
    globalColoringProhibitions: [
      "안경 렌즈를 완전 불투명 백색으로 덮어 눈 표정을 가리는 채색 금지",
      "피부와 오트밀 의상에 순백(L>0.95) 면 채우기 금지",
      "오른쪽 귀 단독 이어링을 양쪽 대칭으로 잘못 복제하는 작화 금지",
    ],
  },
  {
    id: "dojin-mentor", code: "CH-03", seriesTitle: "아크 크로니클: 서울 2048",
    nameKo: "한도진", nameEn: "Han Dojin", roleKo: "조력자 · 전술팀 팀장", roleEn: "Mentor · Tactical Captain",
    ageLabel: "34세", heightCm: 191, headRatio: 8.2, footwearBonusCm: 3.0, accentOklch: { l: 0.54, c: 0.095, h: 158 },
    silhouetteSignature: "191cm 8.2등신 장신 + 넓은 흉곽과 올백 실버 스트릭 헤어가 만드는 압도적 수직 실루엣",
    asymmetryPoints: "좌측 턱선 수염 자국 + 왼쪽 관자놀이 은발 브릿지 2가닥 + 왼손 약지 군번줄 감김",
    hairAndBuildNotes: "올백 숏컷 기반에 이마 좌측 한 가닥 자연 낙하. 목 두께는 턱 폭의 82%로 강인함 유지.",
    expressions: cloneExpressions({
      neutral: { eyebrowNote: "굵고 직선적인 눈썹과 눈꺼풀 사선 주름 1줄 기본 포함" },
      joy: { mouthNote: "시원한 호탕 웃음 대신 짧은 콧웃음과 눈가 주름 2줄로 성숙함 표현" },
    }),
    outfits: [
      outfit("uniform", "제복 · 팀장 코트", "Uniform", "올리브 차콜 더블 롱코트 + 블랙 터틀넥 + 어깨 견장", ["좌우 금장 견장 3줄", "왼손목 크로노그래프 메탈 시계"],
        "코트를 어깨에 걸치는 연출에서도 좌측 관자놀이 은발 브릿지 위치 고정", "비·안개 컷에서는 넓은 등 실루엣을 역광 단일 톤으로 정리"),
      outfit("casual", "사복 · 비번 셔츠룩", "Casual", "짙은 카키 린넨 셔츠(소매 롤업) + 데님 + 가죽 벨트", ["군번줄 목걸이(셔츠 안쪽 노출)", "가죽 브레이슬릿"],
        "팔뚝 근육선과 혈관은 전투/긴장 컷에만 과장하고 일상 컷에서는 절제", "야외 햇빛에서도 셔츠 채도가 형광 녹색으로 튀지 않게 억제"),
      outfit("combat", "전투복 · 중장비 전술복", "Combat", "플레이트 캐리어 + 올리브 컴뱃 셔츠 + 무릎 보호대", ["좌측 가슴 무전기 마이크", "허리 멀티툴 파우치", "전술 부츠"],
        "장비 착용 시에도 어깨 폭이 2.4두신을 넘지 않도록 비례 통제", "폭발 화염 반사는 금속 버클과 턱 하단에만 집중 배치"),
      outfit("damaged", "파손 · 교전 후 변주", "Damaged", "어깨 플레이트 파손 + 이마 출혈선 + 터틀넥 찢김", ["임시 지혈대(우측 상완)", "그을린 견장"],
        "부상 상태에서도 등줄기 직선 자세 유지(위축된 자세 금지)", "그을음은 회갈색 에어브러시 25% 이내, 선화 가독성 보존"),
      outfit("winter", "동복 · 무스탕 재킷", "Winter", "다크 브라운 시어링 무스탕 + 두꺼운 울 팬츠 + 방한 부츠", ["안감 아이보리 양털 칼라", "가죽 방한 장갑"],
        "양털 칼라 텍스처는 윤곽선 덩어리로만 표현해 어시스턴트 작화 부담 절감", "입김 효과는 흰 반투명 연기 1레이어로 제한"),
    ],
    colorChips: [
      chip("dj-skin", "피부 기본톤 (구릿빛)", "Base Skin (Warm Tan)", "base", 0.78, 0.056, 54, "주인공 대비 명도 -0.08 차등으로 연륜·강인함 분리", "붉은 벽돌색으로 과채도화 금지"),
      chip("dj-hair", "머리카락 (딥 그레이)", "Hair (Deep Charcoal)", "base", 0.28, 0.014, 240, "은발 브릿지(L 0.78)와 명도 차 0.50 확보", "은발 브릿지를 순백으로 칠해 배경과 동화시키지 말 것"),
      chip("dj-coat", "제복 올리브 차콜", "Uniform Olive Charcoal", "uniform", 0.37, 0.044, 148, "웹/인쇄 안전 저채도 올리브 — 뭉개짐 방지", "채도 0.12 이상 형광 카키 사용 금지"),
      chip("dj-mustang", "동복 무스탕 브라운", "Winter Shearling Coat", "winter", 0.34, 0.052, 48, "가죽 질감 음영은 L -0.09 이내 유지", "광택 플라스틱처럼 흰 하이라이트 선 남발 금지"),
    ],
    globalColoringProhibitions: [
      "캐릭터 피부톤을 주인공 강태현과 동일 팔레트로 복제 금지",
      "왼쪽 관자놀이 은발 브릿지 누락 금지",
      "수염 그림자를 진한 검정 점찍기로 표현 금지(L 0.52 반투명 톤 사용)",
    ],
  },
  {
    id: "arin-tech", code: "CH-04", seriesTitle: "아크 크로니클: 서울 2048",
    nameKo: "최아린", nameEn: "Choi Arin", roleKo: "막내 · 드론·통신 오퍼레이터", roleEn: "Support · Drone Operator",
    ageLabel: "18세", heightCm: 154, headRatio: 6.0, footwearBonusCm: 2.0, accentOklch: { l: 0.66, c: 0.155, h: 196 },
    silhouetteSignature: "154cm 6.0등신 콤팩트 체형 + 오버사이즈 테크 후디와 목걸이형 헤드폰 실루엣",
    asymmetryPoints: "오른쪽 볼 작은 반창고 · 왼쪽만 땋은 사이드 브레이드 · 양말 높이 비대칭(좌 롱/우 숏)",
    hairAndBuildNotes: "어깨 위 보브컷 + 끝단 틸 투톤 그라데이션. 눈 크기를 주연 대비 1.18배 키워 연령 대비 강조.",
    expressions: cloneExpressions({
      joy: { mouthNote: "고양이 입꼬리 곡선 허용, 눈 하이라이트 원형 3점으로 생동감 강화" },
      exhausted: { blushSweatNote: "모니터 청광 반사 림라이트만 눈 밑에 10% 추가" },
    }),
    outfits: [
      outfit("uniform", "제복 · 연수생 베스트", "Uniform", "오버사이즈 화이트 셔츠 + 네이비 니트 베스트 + 테크 유틸리티 스커트", ["목에 건 민트색 유선 헤드폰", "오른쪽 볼 반창고", "ID 목걸이 스트랩"],
        "헤드폰 이어컵 로고는 왼쪽 귀 기준 정방향 유지", "실내 관제실에서는 모니터 청색 반사광을 얼굴 좌측에만 15% 적용"),
      outfit("casual", "사복 · 스트리트 후디", "Casual", "오버사이즈 크롭 후디 + 카고 조거 팬츠 + 청키 스니커즈(굽 2cm)", ["비대칭 양말", "배낭형 미니 드론 도킹 팩"],
        "후드 끈 끝단 금속 팁 좌우 길이 비대칭(좌 짧고 우 김) 유지", "후드 모자 착용 시 왼쪽 사이드 브레이드가 밖으로 나오게 배치"),
      outfit("combat", "전투복 · 드론 관제 슈트", "Combat", "경량 윈드브레이커 + 고글 헤드밴드 + 양손 햅틱 글러브", ["이마 위 투명 고글", "양손 햅틱 컨트롤 글러브", "허리 배터리 팩"],
        "고글 착용 시에도 눈썹 라인이 60% 이상 비쳐 감정 전달 유지", "고글 반사광에 원시 시안 과포화 금지 — OKLCH C 0.14 이하 제한"),
      outfit("damaged", "파손 · 장비 손상 변주", "Damaged", "헤드폰 밴드 테이핑 + 소매 그을음 + 고글 긁힘 자국", ["절연 테이프 감긴 헤드폰", "새로 붙인 볼 반창고"],
        "볼 반창고는 파손 컷에서도 오른쪽 볼 위치 고정", "전기 스파크 연출은 캐릭터 외곽 바깥쪽에만 배치해 얼굴 선화 보호"),
      outfit("winter", "동복 · 패딩 파카", "Winter", "크롭 숏패딩 + 니트 귀마개 + 방한 워머 부츠", ["퍼 트리밍 후드", "손가락 트임 니트 장갑(키보드 조작 유지)"],
        "숏패딩 볼륨 때문에 6.0등신 허리선이 실종되지 않게 크롭 기장 고수", "패딩 퀼팅선은 몸통 기준 가로 3단 이하로 단순화"),
    ],
    colorChips: [
      chip("ar-skin", "피부 기본톤", "Base Skin", "base", 0.9, 0.034, 55, "가장 밝은 10대 피부 톤 — 반창고(L 0.82)와 경계 명도 차 확보", "볼 홍조에 형광 핑크 금지"),
      chip("ar-hair-base", "머리카락 기본 (애쉬 브라운)", "Hair Base (Ash Brown)", "base", 0.42, 0.038, 68, "끝단 틸 투톤과 자연스럽게 연결되는 중명도 베이스", "투톤 경계에 하드 브러시 직선 컷 금지"),
      chip("ar-hair-tip", "머리카락 끝단 (틸 투톤)", "Hair Tip (Teal Accent)", "base", 0.65, 0.145, 196, "단행본 CMYK 변환 시 청록 채도 저하 주의 — 교정지 확인 필수", "채도 C 0.19 초과 네온 민트 발광 채색 금지"),
      chip("ar-headphone", "헤드폰 포인트 쉘", "Headphone Shell", "uniform", 0.72, 0.12, 190, "머리 끝단 투톤보다 L +0.07 밝게 유지해 겹침 시 구분", "머리 투톤 색을 그대로 복붙 금지"),
      chip("ar-parka", "동복 숏패딩 본체", "Winter Cropped Parka", "winter", 0.46, 0.068, 224, "웹·인쇄 안전 슬레이트 블루 톤", "광택 나일론 백색 하이라이트 과도 도포 금지"),
    ],
    globalColoringProhibitions: [
      "오른쪽 볼 반창고를 왼쪽으로 반전시키거나 생략 금지",
      "틸 투톤과 모니터 반사광에 채도 0.19 초과 네온 색역 사용 금지",
      "6.0등신 체형을 7.5등신 이상으로 늘려 성인 체형처럼 그리지 말 것",
    ],
  },
] as const;

/** 캐릭터 프리셋 ID로 깊은 복사된 설정집 인스턴스를 생성한다. */
export function createCharacterPreset(presetId: CharacterPresetId): CharacterSheetBible {
  const found = CHARACTER_SHEET_PRESETS.find((preset) => preset.id === presetId) ?? CHARACTER_SHEET_PRESETS[0];
  if (!found) throw new Error(`Unknown character preset: ${presetId}`);
  return {
    ...found,
    accentOklch: { ...found.accentOklch },
    expressions: found.expressions.map((cell) => ({ ...cell })),
    outfits: found.outfits.map((slot) => ({ ...slot, keyAccessories: [...slot.keyAccessories] })),
    colorChips: found.colorChips.map((c) => ({ ...c, oklch: { ...c.oklch } })),
    globalColoringProhibitions: [...found.globalColoringProhibitions],
  };
}

/** 프리셋 전체를 다인 키 비교 입력 배열로 변환한다(현재 편집 중인 캐릭터 수치 반영). */
export function buildCastHeightEntries(
  activeSheet: CharacterSheetBible,
  presets: readonly CharacterSheetBible[] = CHARACTER_SHEET_PRESETS,
): readonly CastHeightEntry[] {
  const seen = new Set<string>();
  const toEntry = (s: CharacterSheetBible): CastHeightEntry => ({
    id: s.id, nameKo: s.nameKo, nameEn: s.nameEn, roleKo: s.roleKo, roleEn: s.roleEn,
    heightCm: s.heightCm, headRatio: s.headRatio, footwearBonusCm: s.footwearBonusCm, accentOklch: s.accentOklch,
  });
  const entries = presets.map((preset) => {
    const source = preset.id === activeSheet.id ? activeSheet : preset;
    seen.add(source.id);
    return toEntry(source);
  });
  if (!seen.has(activeSheet.id)) entries.unshift(toEntry(activeSheet));
  return entries;
}

/** 표정 9궁도 매트릭스의 특정 감정 슬롯 작화 노트를 불변 갱신한다. */
export function updateExpressionGridCell(
  grid: readonly ExpressionGridCell[], slotId: ExpressionSlotId, patch: Partial<ExpressionNoteFields>,
): readonly ExpressionGridCell[] {
  return grid.map((cell) => (cell.id === slotId ? { ...cell, ...patch } : cell));
}

/** 의상 연속성 5슬롯 중 특정 슬롯의 연속성 노트를 불변 갱신한다. */
export function updateOutfitContinuitySlot(
  slots: readonly OutfitContinuitySlot[], slotId: OutfitSlotId, patch: Partial<OutfitSlotEditableFields>,
): readonly OutfitContinuitySlot[] {
  return slots.map((slot) =>
    slot.id === slotId
      ? { ...slot, ...patch, keyAccessories: patch.keyAccessories ? [...patch.keyAccessories] : slot.keyAccessories }
      : slot,
  );
}

/** 공식 OKLCH 컬러 칩의 수치·인쇄 주의 메모·채색 금지 규칙을 불변 갱신한다. */
export function updateOfficialColorChip(
  chips: readonly OfficialColorChip[], chipId: string, patch: OfficialColorChipPatch,
): readonly OfficialColorChip[] {
  return chips.map((c) => {
    if (c.id !== chipId) return c;
    const nextOklch = patch.oklch
      ? normalizeOklch({ l: patch.oklch.l ?? c.oklch.l, c: patch.oklch.c ?? c.oklch.c, h: patch.oklch.h ?? c.oklch.h })
      : c.oklch;
    return {
      ...c, partKo: patch.partKo ?? c.partKo, partEn: patch.partEn ?? c.partEn,
      slotScope: patch.slotScope ?? c.slotScope, oklch: nextOklch,
      printCmykNote: patch.printCmykNote ?? c.printCmykNote, doNotColorRule: patch.doNotColorRule ?? c.doNotColorRule,
    };
  });
}

/**
 * 상업 연재 캐릭터 설정집 완성도를 0~100점으로 감사하고 누락 항목 리스트를 반환한다.
 * - 기본 신원·체형·3면도(20) + 표정 9궁도(30) + 의상 5슬롯(25) + 공식 컬러·인쇄·채색 금지 규칙(25)
 */
export function auditCharacterSheetCompleteness(sheet: CharacterSheetBible): CharacterSheetCompletenessAudit {
  const missingItems: CharacterSheetAuditIssue[] = [];
  let completed = 0;
  let total = 0;
  const addIssue = (
    section: AuditSectionId, severity: AuditIssueSeverity, id: string, fieldPath: string,
    messageKo: string, messageEn: string,
  ): void => { missingItems.push({ id, section, severity, fieldPath, messageKo, messageEn }); };

  // 1) 기본 신원·체형·3면도 스펙 (20점)
  let identityEarned = 0;
  const checkId = (ok: boolean, pts: number, id: string, path: string, sev: AuditIssueSeverity, ko: string, en: string): void => {
    total += 1;
    if (ok) { identityEarned += pts; completed += 1; } else addIssue("identityAndProportion", sev, id, path, ko, en);
  };
  checkId(hasText(sheet.nameKo, 1) && hasText(sheet.code, 2) && hasText(sheet.roleKo, 2), 5, "missing-identity-meta", "identity.meta", "critical", "캐릭터명·관리코드·역할 정보가 누락되었습니다.", "Character name, code, or role metadata is missing.");
  const validSpec =
    Number.isFinite(sheet.heightCm) && sheet.heightCm >= MIN_HEIGHT_CM && sheet.heightCm <= MAX_HEIGHT_CM &&
    Number.isFinite(sheet.headRatio) && sheet.headRatio >= MIN_HEAD_RATIO && sheet.headRatio <= MAX_HEAD_RATIO;
  checkId(validSpec, 5, "invalid-height-ratio", "proportion.heightRatio", "critical", "신장(110~230cm) 또는 등신비(5.5~8.5)가 권장 범위를 벗어났습니다.", "Height (110-230cm) or head ratio (5.5-8.5) is out of bounds.");
  checkId(hasText(sheet.silhouetteSignature, 6), 4, "missing-silhouette-signature", "identity.silhouetteSignature", "warn", "실루엣 식별 특징 노트가 비어 있습니다.", "Silhouette signature note is missing.");
  checkId(hasText(sheet.asymmetryPoints, 4), 3, "missing-asymmetry-points", "identity.asymmetryPoints", "warn", "좌우 비대칭(흉터·액세서리·가르마) 연속성 메모가 누락되었습니다.", "Asymmetry continuity landmarks are missing.");
  checkId(hasText(sheet.hairAndBuildNotes, 4), 3, "missing-hair-build", "identity.hairAndBuildNotes", "warn", "헤어·체형 작화 기준 노트가 누락되었습니다.", "Hair and build drawing note is missing.");

  // 2) 표정 9궁도 (30점: 9슬롯 × 4부위 = 36 체크포인트)
  let exprFilled = 0;
  const exprFields: readonly { readonly key: keyof ExpressionNoteFields; readonly ko: string; readonly en: string }[] = [
    { key: "eyebrowNote", ko: "눈썹", en: "eyebrow" }, { key: "eyeNote", ko: "눈매", en: "eye" },
    { key: "mouthNote", ko: "입꼬리", en: "mouth" }, { key: "blushSweatNote", ko: "홍조/땀", en: "blush/sweat" },
  ];
  total += EXPRESSION_SLOT_IDS.length * 4;
  for (const slotId of EXPRESSION_SLOT_IDS) {
    const cell = sheet.expressions.find((item) => item.id === slotId);
    if (!cell) {
      addIssue("expressionGrid", "critical", `missing-expr-slot-${slotId}`, `expressions.${slotId}`, `표정 9궁도의 '${slotId}' 슬롯 자체가 누락되었습니다.`, `Expression 9-grid slot '${slotId}' is missing.`);
      continue;
    }
    for (const f of exprFields) {
      if (hasText(cell[f.key], 2)) { exprFilled += 1; completed += 1; } else {
        addIssue("expressionGrid", "warn", `missing-expr-${slotId}-${f.key}`, `expressions.${slotId}.${f.key}`, `표정 9궁도 [${cell.labelKo}]의 ${f.ko} 작화 노트가 비어 있습니다.`, `Expression [${cell.labelEn}] is missing ${f.en} notes.`);
      }
    }
  }
  const expressionEarned = Math.round((exprFilled / (EXPRESSION_SLOT_IDS.length * 4)) * 30);

  // 3) 의상 연속성 5슬롯 (25점)
  let outfitRaw = 0;
  for (const slotId of OUTFIT_SLOT_IDS) {
    const slot = sheet.outfits.find((item) => item.id === slotId);
    total += 3;
    if (!slot) {
      addIssue("outfitContinuity", "critical", `missing-outfit-slot-${slotId}`, `outfits.${slotId}`, `의상 연속성 슬롯 '${slotId}'이(가) 누락되었습니다.`, `Outfit continuity slot '${slotId}' is missing.`);
      continue;
    }
    if (hasText(slot.silhouetteSummary, 4)) { outfitRaw += 2; completed += 1; } else {
      addIssue("outfitContinuity", "warn", `missing-outfit-silhouette-${slotId}`, `outfits.${slotId}.silhouetteSummary`, `의상 [${slot.labelKo}]의 실루엣 요약이 비어 있습니다.`, `Outfit [${slot.labelEn}] silhouette summary is missing.`);
    }
    if (slot.keyAccessories.filter((acc) => hasText(acc, 2)).length >= 1) { outfitRaw += 1.5; completed += 1; } else {
      addIssue("outfitContinuity", "warn", `missing-outfit-accessories-${slotId}`, `outfits.${slotId}.keyAccessories`, `의상 [${slot.labelKo}]의 필수 연속성 소품이 1개 이상 필요합니다.`, `Outfit [${slot.labelEn}] requires at least one key continuity accessory.`);
    }
    if (hasText(slot.continuityChecklist, 4)) { outfitRaw += 1.5; completed += 1; } else {
      addIssue("outfitContinuity", "warn", `missing-outfit-checklist-${slotId}`, `outfits.${slotId}.continuityChecklist`, `의상 [${slot.labelKo}]의 컷 간 연속성 체크 노트가 비어 있습니다.`, `Outfit [${slot.labelEn}] continuity checklist note is missing.`);
    }
  }
  const outfitEarned = Math.round(outfitRaw);

  // 4) 공식 OKLCH 컬러 칩 · 인쇄 주의 · 채색 금지 규칙 (25점)
  let colorEarned = 0;
  total += 4;
  const chipCount = sheet.colorChips.length;
  if (chipCount >= 4) { colorEarned += 10; completed += 1; } else {
    colorEarned += Math.round((chipCount / 4) * 10);
    addIssue("colorAndPrintRules", "critical", "insufficient-color-chips", "colorChips", `공식 OKLCH 컬러 칩이 최소 4개 이상 필요합니다 (현재 ${chipCount}개).`, `At least 4 official OKLCH color chips are required (currently ${chipCount}).`);
  }
  const withPrint = sheet.colorChips.filter((c) => hasText(c.printCmykNote, 4)).length;
  if (chipCount > 0 && withPrint === chipCount) { colorEarned += 6; completed += 1; } else {
    colorEarned += chipCount > 0 ? Math.round((withPrint / chipCount) * 6) : 0;
    addIssue("colorAndPrintRules", "warn", "missing-chip-print-notes", "colorChips.printCmykNote", `인쇄 주의 메모가 비어 있는 컬러 칩이 ${Math.max(1, chipCount - withPrint)}건 있습니다.`, `${Math.max(1, chipCount - withPrint)} color chip(s) are missing print CMYK notes.`);
  }
  const withDoNot = sheet.colorChips.filter((c) => hasText(c.doNotColorRule, 4)).length;
  if (chipCount > 0 && withDoNot === chipCount) { colorEarned += 5; completed += 1; } else {
    colorEarned += chipCount > 0 ? Math.round((withDoNot / chipCount) * 5) : 0;
    addIssue("colorAndPrintRules", "critical", "missing-chip-do-not-color", "colorChips.doNotColorRule", `"채색 금지 규칙"이 누락된 공식 컬러 칩이 ${Math.max(1, chipCount - withDoNot)}건 있습니다.`, `${Math.max(1, chipCount - withDoNot)} color chip(s) are missing do-not-color rules.`);
  }
  const validProhib = sheet.globalColoringProhibitions.filter((r) => hasText(r, 4));
  if (validProhib.length >= 2) { colorEarned += 4; completed += 1; } else {
    colorEarned += validProhib.length * 2;
    addIssue("colorAndPrintRules", "warn", "missing-global-prohibitions", "globalColoringProhibitions", `전역 "채색 금지 규칙"을 2개 이상 명시하세요 (현재 ${validProhib.length}건).`, `Specify at least 2 global do-not-color rules (currently ${validProhib.length}).`);
  }

  const totalScore = Math.min(100, Math.max(0, identityEarned + expressionEarned + outfitEarned + colorEarned));
  const grade: CompletenessGrade = totalScore >= 90 ? "production-ready" : totalScore >= 65 ? "review-needed" : "draft-incomplete";
  return {
    totalScore, grade,
    sectionScores: {
      identityAndProportion: { earned: identityEarned, max: 20, ratio: round3(identityEarned / 20) },
      expressionGrid: { earned: expressionEarned, max: 30, ratio: round3(expressionEarned / 30) },
      outfitContinuity: { earned: outfitEarned, max: 25, ratio: round3(outfitEarned / 25) },
      colorAndPrintRules: { earned: colorEarned, max: 25, ratio: round3(colorEarned / 25) },
    },
    missingItems, completedChecklistCount: completed, totalChecklistCount: total,
  };
}

function escapeMdCell(value: string): string {
  return value.replaceAll("|", "\\|").replaceAll(/\r?\n/gu, " ").trim() || "—";
}

/** 어시스턴트·해외 외주 스튜디오 배포용 Markdown 캐릭터 설정집을 조판한다. */
export function exportCharacterSheetMarkdown(sheet: CharacterSheetBible, options?: CharacterSheetExportOptions): string {
  const isEn = options?.locale === "en";
  const metrics = computeHeightRatioMetrics({ heightCm: sheet.heightCm, headRatio: sheet.headRatio, footwearBonusCm: sheet.footwearBonusCm });
  const audit = auditCharacterSheetCompleteness(sheet);
  const castCmp = options?.cast && options.cast.length > 0 ? compareCastHeights(options.cast, sheet.id) : null;

  const lines: string[] = [
    `# ${isEn ? "Character Bible Sheet" : "상업 연재 캐릭터 설정집"} — ${sheet.nameKo} (${sheet.nameEn}) [${sheet.code}]`,
    "",
    `- **${isEn ? "Series" : "작품명"}:** ${sheet.seriesTitle}`,
    `- **${isEn ? "Role / Age" : "역할 · 연령"}:** ${isEn ? sheet.roleEn : sheet.roleKo} · ${sheet.ageLabel}`,
    `- **${isEn ? "Completeness Score" : "설정집 완성도"}:** ${audit.totalScore} / 100 (${audit.grade})`,
    `- **${isEn ? "Silhouette Signature" : "실루엣 핵심"}:** ${sheet.silhouetteSignature}`,
    `- **${isEn ? "Asymmetry Continuity" : "좌우 비대칭 포인트"}:** ${sheet.asymmetryPoints}`,
    `- **${isEn ? "Hair & Build Notes" : "헤어·체형 기준"}:** ${sheet.hairAndBuildNotes}`,
    "",
    `## 1. ${isEn ? "Turnaround Height & Head-Ratio Ruler" : "등신비 · 신장 3면도 눈금표"}`,
    "",
    `- ${isEn ? "Bare Height" : "맨발 신장"}: **${metrics.bareHeightCm.toFixed(1)} cm** | ${isEn ? "Head Ratio" : "등신비"}: **${metrics.headRatio.toFixed(1)}H** | ${isEn ? "Footwear Bonus" : "굽/신발 보정"}: **+${metrics.footwearBonusCm.toFixed(1)} cm** | ${isEn ? "Effective Height" : "착화 신장"}: **${metrics.effectiveHeightCm.toFixed(1)} cm** (1두신 = ${metrics.headUnitCm.toFixed(1)} cm)`,
    "",
    isEn
      ? "| Landmark | Floor Height (cm) | Bare Height (cm) | Floor Ratio | Top Ratio | Head Units |"
      : "| 3면도 눈금 | 착화 높이 (cm) | 맨발 높이 (cm) | 바닥 기준 비율 | 정수리 기준 비율 | 두신 위치 |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...metrics.landmarks.map(
      (lm) => `| ${isEn ? lm.labelEn : lm.labelKo} | ${lm.heightFromFloorCm.toFixed(1)} | ${lm.bareHeightFromFloorCm.toFixed(1)} | ${(lm.ratioFromFloor * 100).toFixed(1)}% | ${(lm.ratioFromTop * 100).toFixed(1)}% | ${lm.headUnitsFromCrown.toFixed(1)}H |`,
    ),
  ];

  if (castCmp && castCmp.members.length > 0) {
    lines.push(
      "", `### ${isEn ? "Cast Height Comparison" : "다인 캐릭터 키 차이 비교"}`, "",
      isEn
        ? "| Character | Effective (cm) | Head Ratio | Delta vs Ref | Framing Guide |"
        : "| 캐릭터 | 착화 신장 (cm) | 등신비 | 기준 대비 차이 | 투샷 시선 가이드 |",
      "| --- | ---: | ---: | ---: | --- |",
      ...castCmp.members.map(
        (m) => `| ${escapeMdCell(isEn ? m.nameEn : m.nameKo)} | ${m.metrics.effectiveHeightCm.toFixed(1)} | ${m.metrics.headRatio.toFixed(1)}H | ${m.deltaFromReferenceCm >= 0 ? "+" : ""}${m.deltaFromReferenceCm.toFixed(1)} cm | ${escapeMdCell(isEn ? m.framingGuideEn : m.framingGuideKo)} |`,
      ),
    );
  }

  lines.push(
    "", `## 2. ${isEn ? "Expression 9-Grid Matrix" : "표정 9궁도 작화 지침"}`, "",
    isEn ? "| Expression | Eyebrows | Eyes | Mouth | Blush / Sweat |" : "| 표정 | 눈썹 | 눈매 | 입꼬리 | 홍조 / 땀 |",
    "| --- | --- | --- | --- | --- |",
    ...sheet.expressions.map(
      (c) => `| ${isEn ? c.labelEn : c.labelKo} | ${escapeMdCell(c.eyebrowNote)} | ${escapeMdCell(c.eyeNote)} | ${escapeMdCell(c.mouthNote)} | ${escapeMdCell(c.blushSweatNote)} |`,
    ),
    "", `## 3. ${isEn ? "Outfit Continuity Slots (5)" : "의상 연속성 5슬롯 가이드"}`, "",
    ...sheet.outfits.flatMap((s) => [
      `### [${s.id}] ${isEn ? s.labelEn : s.labelKo}`,
      `- **${isEn ? "Silhouette" : "실루엣 구성"}:** ${s.silhouetteSummary || "—"}`,
      `- **${isEn ? "Key Accessories" : "필수 소품"}:** ${s.keyAccessories.length > 0 ? s.keyAccessories.join(", ") : "—"}`,
      `- **${isEn ? "Continuity Checklist" : "연속성 체크"}:** ${s.continuityChecklist || "—"}`,
      `- **${isEn ? "Damage / Weather Rule" : "파손·계절 보정"}:** ${s.damageOrWeatherRule || "—"}`,
      "",
    ]),
    `## 4. ${isEn ? "Official OKLCH Color Chips & Do-Not-Color Rules" : "공식 OKLCH 컬러 칩 · 인쇄 주의 · 채색 금지 규칙"}`, "",
    isEn
      ? "| Part | Slot | OKLCH | Print CMYK Note | Do-Not-Color Rule |"
      : "| 부위 | 적용 슬롯 | 공식 OKLCH | 인쇄 주의 메모 | 채색 금지 규칙 |",
    "| --- | --- | --- | --- | --- |",
    ...sheet.colorChips.map(
      (c) => `| ${escapeMdCell(isEn ? c.partEn : c.partKo)} | ${c.slotScope} | \`${formatOklchCss(c.oklch)}\` | ${escapeMdCell(c.printCmykNote)} | ${escapeMdCell(c.doNotColorRule)} |`,
    ),
    "", `### ${isEn ? "Global Do-Not-Color Rules" : "전역 채색 금지 규칙"}`,
    ...sheet.globalColoringProhibitions.map((r) => `- ${r}`),
    "", `## 5. ${isEn ? "Completeness Audit Summary" : "설정집 누락 항목 검수"}`,
    `- **${isEn ? "Score" : "완성도 점수"}:** ${audit.totalScore} / 100 (${audit.completedChecklistCount}/${audit.totalChecklistCount})`,
    ...(audit.missingItems.length === 0
      ? [`- ${isEn ? "No missing items detected — ready for studio distribution." : "누락 항목 0건 — 어시스턴트 및 외주 스튜디오 배포 가능."}`]
      : audit.missingItems.map((i) => `- [${i.severity}] ${isEn ? i.messageEn : i.messageKo}`)),
  );
  return lines.join("\n");
}

/** 어시스턴트 파이프라인·외주 스튜디오 자동 연동용 정형 JSON 설정집을 직렬화한다. */
export function exportCharacterSheetJson(sheet: CharacterSheetBible, options?: CharacterSheetExportOptions): string {
  const heightMetrics = computeHeightRatioMetrics({ heightCm: sheet.heightCm, headRatio: sheet.headRatio, footwearBonusCm: sheet.footwearBonusCm });
  const completenessAudit = auditCharacterSheetCompleteness(sheet);
  const castComparison = options?.cast && options.cast.length > 0 ? compareCastHeights(options.cast, sheet.id) : null;
  return JSON.stringify(
    { schemaVersion: "toonstudio.character-sheet-bible.v1", sheet, heightMetrics, castComparison, completenessAudit },
    null,
    2,
  );
}
