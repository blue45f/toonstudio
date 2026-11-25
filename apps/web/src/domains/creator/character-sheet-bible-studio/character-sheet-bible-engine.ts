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

import { CHARACTER_SHEET_PRESETS } from "./character-bible-presets";
import { assertBibleStructure, assertCastStructure, assertBibleExport, validBibleNumerics } from "./character-bible-input-contract";

export { CHARACTER_SHEET_PRESETS, DEFAULT_EXPRESSION_9GRID } from "./character-bible-presets";

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
  readonly dataSourceKind: "heuristic"; readonly iccVerified: false;
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

/** 단행본 OKLCH 채도·명도 임계치로 인쇄 위험을 추정한다(ICC 변환·실측 아님). */
export function assessOklchPrintGamut(oklch: OklchColorChipValue): PrintGamutAssessment {
  const s = normalizeOklch(oklch);
  if (s.c >= 0.18 || (s.l <= 0.22 && s.c >= 0.1)) {
    return {
      dataSourceKind: "heuristic", iccVerified: false, level: "clip-risk", labelKo: "인쇄 색역 클리핑 주의", labelEn: "CMYK Gamut Clip Risk",
      adviceKo: "고채도/암부 색역으로 단행본 CMYK 변환 시 탁해질 수 있어 별색 보정 프로파일 필요",
      adviceEn: "High chroma or deep shadow may desaturate in CMYK print; apply print-safe profile",
    };
  }
  if (s.c >= 0.13 || s.l >= 0.92) {
    return {
      dataSourceKind: "heuristic", iccVerified: false, level: "caution", labelKo: "인쇄 미세 보정 권장", labelEn: "Minor Print Tuning",
      adviceKo: "채도·명도 임계치의 경계 추정입니다. 실제 인쇄 교정과 ICC 프로파일 확인이 필요합니다.",
      adviceEn: "Threshold-based estimate; verify actual print proofs and ICC profiles",
    };
  }
  return {
    dataSourceKind: "heuristic", iccVerified: false, level: "safe", labelKo: "낮은 채도 위험 추정", labelEn: "Lower Chroma Risk Estimate",
    adviceKo: "OKLCH 임계치 예제입니다. ICC 변환·실제 색역·인쇄 교정은 검증하지 않았습니다.",
    adviceEn: "An OKLCH threshold example, without ICC conversion, measured gamut, or print-proof validation",
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
  assertCastStructure(cast);
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

/** 캐릭터 프리셋 ID로 깊은 복사된 설정집 인스턴스를 생성한다. */
export function createCharacterPreset(presetId: CharacterPresetId): CharacterSheetBible {
  const found = CHARACTER_SHEET_PRESETS.find((preset) => preset.id === presetId);
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
  assertBibleStructure(activeSheet);
  if (presets.length > 64) throw new RangeError("비교 프리셋은 최대 64개입니다.");
  const seen = new Set<string>();
  const toEntry = (s: CharacterSheetBible): CastHeightEntry => ({
    id: s.id, nameKo: s.nameKo, nameEn: s.nameEn, roleKo: s.roleKo, roleEn: s.roleEn,
    heightCm: s.heightCm, headRatio: s.headRatio, footwearBonusCm: s.footwearBonusCm, accentOklch: s.accentOklch,
  });
  const entries = presets.map((preset) => {
    const source = preset.id === activeSheet.id ? activeSheet : preset;
    if (seen.has(source.id)) throw new TypeError("중복된 캐릭터 ID입니다.");
    seen.add(source.id);
    return toEntry(source);
  });
  if (!seen.has(activeSheet.id)) {
    if (entries.length >= 64) throw new RangeError("현재 캐릭터를 포함한 비교 목록은 최대 64개입니다.");
    entries.unshift(toEntry(activeSheet));
  }
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
  assertBibleStructure(sheet);
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
    Number.isFinite(sheet.headRatio) && sheet.headRatio >= MIN_HEAD_RATIO && sheet.headRatio <= MAX_HEAD_RATIO &&
    Number.isFinite(sheet.footwearBonusCm) && sheet.footwearBonusCm >= 0 && sheet.footwearBonusCm <= MAX_FOOTWEAR_BONUS_CM;
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

  if (!validBibleNumerics(sheet)) {
    colorEarned = Math.max(0, colorEarned - 10);
    addIssue("colorAndPrintRules", "critical", "invalid-sheet-numerics", "numeric-spec", "신장·등신·굽·색상 수치가 유한 범위에 있어야 합니다.", "Height, head ratio, footwear, and color values must be finite and within range.");
  }
  const totalScore = Math.min(100, Math.max(0, identityEarned + expressionEarned + outfitEarned + colorEarned));
  const grade: CompletenessGrade = totalScore >= 90 && !missingItems.some((item) => item.severity === "critical") ? "production-ready" : totalScore >= 65 ? "review-needed" : "draft-incomplete";
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
  assertBibleExport(sheet, options?.cast);
  const isEn = options?.locale === "en";
  const metrics = computeHeightRatioMetrics({ heightCm: sheet.heightCm, headRatio: sheet.headRatio, footwearBonusCm: sheet.footwearBonusCm });
  const audit = auditCharacterSheetCompleteness(sheet);
  const castCmp = options?.cast && options.cast.length > 0 ? compareCastHeights(options.cast, sheet.id) : null;

  const lines: string[] = [
    `# ${isEn ? "Character Bible Sheet" : "상업 연재 캐릭터 설정집"} — ${sheet.nameKo} (${sheet.nameEn}) [${sheet.code}]`,
    isEn ? "Synthetic template and numerical example. No manuscript changes, shared storage, actual artwork generation, or ICC verification." : "합성 설정집·수치 계산 예제입니다. 원고 반영·공유 저장·실제 작화 생성·ICC 검증은 수행하지 않습니다.",
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
      ? [`- ${isEn ? "No checklist items missing; artwork, distribution, and print validation are separate." : "목록 기준 누락 항목 0건 — 실제 작화·배포·인쇄 검증은 별도입니다."}`]
      : audit.missingItems.map((i) => `- [${i.severity}] ${isEn ? i.messageEn : i.messageKo}`)),
  );
  return lines.join("\n");
}

/** 어시스턴트 파이프라인·외주 스튜디오 자동 연동용 정형 JSON 설정집을 직렬화한다. */
export function exportCharacterSheetJson(sheet: CharacterSheetBible, options?: CharacterSheetExportOptions): string {
  assertBibleExport(sheet, options?.cast);
  const heightMetrics = computeHeightRatioMetrics({ heightCm: sheet.heightCm, headRatio: sheet.headRatio, footwearBonusCm: sheet.footwearBonusCm });
  const completenessAudit = auditCharacterSheetCompleteness(sheet);
  const castComparison = options?.cast && options.cast.length > 0 ? compareCastHeights(options.cast, sheet.id) : null;
  return JSON.stringify(
    { schemaVersion: "toonstudio.character-sheet-bible.v1", dataSourceKind: "synthetic-template", manuscriptApplied: false, persisted: false, iccVerified: false, sheet, heightMetrics, castComparison, completenessAudit },
    null,
    2,
  );
}
