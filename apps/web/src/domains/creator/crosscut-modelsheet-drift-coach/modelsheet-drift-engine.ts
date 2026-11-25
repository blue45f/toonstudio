/**
 * Wave 48E — 화차 간 작화·비율 흔들림 감지 및 교정 제안 엔진 (Cross-Cut Model Sheet Drift Coach).
 *
 * - 4종 대표 웹툰 캐릭터 설정집 기준 프리셋(로맨스 여주 7.0등신 / 액션 남주 7.8등신 / 학원물 소년 6.5등신 / 판타지 조연 5.5등신)
 * - 1~60컷 회차 대조 감사기(`auditEpisodeModelSheetDrift`): 비율 편차(%), `ok`/`notice`/`drift` 등급,
 *   가르마 반전, 누락 필수 의상·장신구 체크리스트, 회차 일관성 점수(0~100) 산출
 * - 비파괴 Top-3 교정 후보(`proposeCutDriftCorrectionsTop3`):
 *   (1) 최소 미세 보정, (2) 설정집 정밀 정합, (3) 의상·소품 체크 복구
 * - 비파괴 적용·원복 상태 머신, 컷별 승인 이력, Markdown/JSON 검수 리포트 직렬화
 */

export type ModelSheetArchetypeId = "romance-lead" | "action-hero" | "school-boy" | "fantasy-sidekick";
export type HairPartSide = "left" | "right" | "center" | "none";
export type ModelSheetAccessoryId =
  | "earring-left" | "cheek-scar" | "uniform-badge" | "cloak-brooch" | "glasses" | "hairpin";
export type DriftMetricKey = "headToBodyRatio" | "eyeSpacingRatio" | "eyeHeightRatio" | "jawWidthRatio";
export type CutDriftSeverity = "ok" | "notice" | "drift";
export type EpisodeConsistencyGrade = "stable" | "review" | "critical";
export type CameraShotKind = "closeup" | "bust" | "half" | "full";
export type CorrectionStrategyId = "minimal-nudge" | "spec-exact" | "accessory-full-restore";

export interface ModelSheetAccessoryMeta {
  readonly id: ModelSheetAccessoryId; readonly labelKo: string; readonly labelEn: string;
  readonly zoneKo: string; readonly zoneEn: string;
}
export interface HairPartMeta {
  readonly id: HairPartSide; readonly labelKo: string; readonly labelEn: string;
}
export interface DriftToleranceThresholds {
  readonly okPct: number; readonly noticePct: number;
}
export interface ModelSheetSpec {
  readonly id: ModelSheetArchetypeId; readonly nameKo: string; readonly nameEn: string;
  readonly roleSummaryKo: string; readonly roleSummaryEn: string;
  readonly headToBodyRatio: number; readonly eyeSpacingRatio: number;
  readonly eyeHeightRatio: number; readonly jawWidthRatio: number;
  readonly hairPartSide: HairPartSide; readonly requiredAccessories: readonly ModelSheetAccessoryId[];
}
export interface EpisodeCutMetric {
  readonly cutId: string; readonly cutNumber: number;
  readonly sceneTagKo: string; readonly sceneTagEn: string; readonly cameraShot: CameraShotKind;
  readonly headToBodyRatio: number; readonly eyeSpacingRatio: number;
  readonly eyeHeightRatio: number; readonly jawWidthRatio: number;
  readonly hairPartSide: HairPartSide; readonly presentAccessories: readonly ModelSheetAccessoryId[];
}
export interface MetricDeviationDetail {
  readonly key: DriftMetricKey; readonly labelKo: string; readonly labelEn: string;
  readonly baseline: number; readonly measured: number;
  readonly signedPct: number; readonly absPct: number; readonly severity: CutDriftSeverity;
}
export interface CutDriftAudit {
  readonly cutId: string; readonly cutNumber: number;
  readonly sceneTagKo: string; readonly sceneTagEn: string; readonly cameraShot: CameraShotKind;
  readonly metrics: Readonly<Record<DriftMetricKey, MetricDeviationDetail>>;
  readonly metricList: readonly MetricDeviationDetail[];
  readonly maxDeviationPct: number; readonly weightedDriftPct: number;
  readonly hairPartMismatch: boolean; readonly missingAccessories: readonly ModelSheetAccessoryId[];
  readonly severity: CutDriftSeverity; readonly cutScore: number;
  readonly redPenCalloutsKo: readonly string[]; readonly redPenCalloutsEn: readonly string[];
}
export interface EpisodeModelSheetAuditReport {
  readonly spec: ModelSheetSpec; readonly totalCuts: number;
  readonly cutAudits: readonly CutDriftAudit[];
  readonly consistencyScore: number; readonly grade: EpisodeConsistencyGrade;
  readonly counts: { readonly ok: number; readonly notice: number; readonly drift: number };
  readonly worstCutNumber: number; readonly topDriftCutNumbers: readonly number[];
  readonly missingAccessoryTotals: Readonly<Record<ModelSheetAccessoryId, number>>;
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface CutCorrectionCandidate {
  readonly id: string; readonly rank: 1 | 2 | 3; readonly strategy: CorrectionStrategyId;
  readonly titleKo: string; readonly titleEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly proposedMetrics: EpisodeCutMetric; readonly projectedAudit: CutDriftAudit;
  readonly scoreGain: number; readonly adjustedFields: readonly DriftMetricKey[];
  readonly restoresHairPart: boolean; readonly addedAccessories: readonly ModelSheetAccessoryId[];
  readonly overlayActionsKo: readonly string[]; readonly overlayActionsEn: readonly string[];
  readonly requiresAuthorApproval: true;
}
export type CutCorrectionTop3 = readonly [
  CutCorrectionCandidate, CutCorrectionCandidate, CutCorrectionCandidate,
];
export interface AppliedCutFixRecord {
  readonly cutNumber: number; readonly candidateId: string; readonly strategy: CorrectionStrategyId;
  readonly titleKo: string; readonly titleEn: string;
  readonly originalCut: EpisodeCutMetric; readonly appliedCut: EpisodeCutMetric;
  readonly scoreBefore: number; readonly scoreAfter: number; readonly revision: number;
}
export interface CutApprovalHistoryEntry {
  readonly entryId: string; readonly revision: number;
  readonly action: "apply" | "revert" | "revert-all";
  readonly cutNumber: number | null; readonly strategy: CorrectionStrategyId | null;
  readonly scoreBefore: number; readonly scoreAfter: number;
  readonly summaryKo: string; readonly summaryEn: string;
}
export interface DriftCoachSessionState {
  readonly archetypeId: ModelSheetArchetypeId;
  readonly baselineCuts: readonly EpisodeCutMetric[];
  readonly workingCuts: readonly EpisodeCutMetric[];
  readonly selectedCutNumber: number;
  readonly previewCandidateId: string | null;
  readonly appliedFixByCut: Readonly<Record<number, AppliedCutFixRecord>>;
  readonly approvalHistory: readonly CutApprovalHistoryEntry[];
  readonly revision: number;
}
export interface CutMetricPatch {
  readonly headToBodyRatio?: number; readonly eyeSpacingRatio?: number;
  readonly eyeHeightRatio?: number; readonly jawWidthRatio?: number;
  readonly hairPartSide?: HairPartSide;
  readonly presentAccessories?: readonly ModelSheetAccessoryId[];
}

export const DRIFT_METRIC_KEYS: readonly DriftMetricKey[] = [
  "headToBodyRatio", "eyeSpacingRatio", "eyeHeightRatio", "jawWidthRatio",
];

export const DRIFT_METRIC_META: Readonly<Record<DriftMetricKey, {
  readonly labelKo: string; readonly labelEn: string; readonly unitKo: string; readonly unitEn: string;
  readonly min: number; readonly max: number; readonly step: number;
  readonly weight: number; readonly thresholds: DriftToleranceThresholds;
}>> = {
  headToBodyRatio: {
    labelKo: "등신 비율", labelEn: "Head-to-Body Ratio", unitKo: "등신", unitEn: "H",
    min: 4.5, max: 9.0, step: 0.1, weight: 0.35, thresholds: { okPct: 4.5, noticePct: 9.0 },
  },
  eyeSpacingRatio: {
    labelKo: "눈 간격 비율", labelEn: "Eye Spacing Ratio", unitKo: "배", unitEn: "x",
    min: 0.72, max: 1.35, step: 0.01, weight: 0.25, thresholds: { okPct: 6.0, noticePct: 12.0 },
  },
  eyeHeightRatio: {
    labelKo: "눈선 높이", labelEn: "Eye Line Height", unitKo: "비", unitEn: "r",
    min: 0.36, max: 0.68, step: 0.01, weight: 0.2, thresholds: { okPct: 4.0, noticePct: 8.5 },
  },
  jawWidthRatio: {
    labelKo: "턱선 폭", labelEn: "Jaw Width Ratio", unitKo: "비", unitEn: "r",
    min: 0.45, max: 0.94, step: 0.01, weight: 0.2, thresholds: { okPct: 6.5, noticePct: 13.0 },
  },
};

const DEFAULT_HAIR_PART: HairPartMeta = { id: "left", labelKo: "좌가르마", labelEn: "Left Part" };
export const HAIR_PART_OPTIONS: readonly HairPartMeta[] = [
  DEFAULT_HAIR_PART,
  { id: "right", labelKo: "우가르마", labelEn: "Right Part" },
  { id: "center", labelKo: "가운데 가르마", labelEn: "Center Part" },
  { id: "none", labelKo: "앞머리 일자", labelEn: "Full Bangs" },
];

const DEFAULT_ACCESSORY: ModelSheetAccessoryMeta = {
  id: "earring-left", labelKo: "왼쪽 귀걸이", labelEn: "Left Earring", zoneKo: "왼쪽 귓불", zoneEn: "Left Ear",
};
export const MODEL_SHEET_ACCESSORIES: readonly ModelSheetAccessoryMeta[] = [
  DEFAULT_ACCESSORY,
  { id: "cheek-scar", labelKo: "뺨 흉터", labelEn: "Cheek Scar", zoneKo: "오른쪽 뺨", zoneEn: "Right Cheek" },
  { id: "uniform-badge", labelKo: "교복 배지", labelEn: "Uniform Badge", zoneKo: "왼쪽 가슴깃", zoneEn: "Left Lapel" },
  { id: "cloak-brooch", labelKo: "망토 브로치", labelEn: "Cloak Brooch", zoneKo: "목선 여밈", zoneEn: "Collar Clasp" },
  { id: "glasses", labelKo: "안경", labelEn: "Glasses", zoneKo: "눈선 프레임", zoneEn: "Eye Frame" },
  { id: "hairpin", labelKo: "머리핀", labelEn: "Hairpin", zoneKo: "앞머리 우측", zoneEn: "Right Bangs" },
];

const DEFAULT_ARCHETYPE_SPEC: ModelSheetSpec = {
  id: "romance-lead", nameKo: "로맨스 여주", nameEn: "Romance Female Lead",
  roleSummaryKo: "7.0등신 · 슬림 턱선 · 좌가르마 · 귀걸이·머리핀",
  roleSummaryEn: "7.0H · Slim Jaw · Left Part · Earring & Hairpin",
  headToBodyRatio: 7.0, eyeSpacingRatio: 1.0, eyeHeightRatio: 0.5, jawWidthRatio: 0.62,
  hairPartSide: "left", requiredAccessories: ["earring-left", "hairpin"],
};

export const MODEL_SHEET_ARCHETYPES: readonly ModelSheetSpec[] = [
  DEFAULT_ARCHETYPE_SPEC,
  {
    id: "action-hero", nameKo: "액션 남주", nameEn: "Action Male Lead",
    roleSummaryKo: "7.8등신 · 선명한 턱선 · 우가르마 · 흉터·망토 브로치",
    roleSummaryEn: "7.8H · Defined Jaw · Right Part · Scar & Cloak Brooch",
    headToBodyRatio: 7.8, eyeSpacingRatio: 1.06, eyeHeightRatio: 0.48, jawWidthRatio: 0.76,
    hairPartSide: "right", requiredAccessories: ["cheek-scar", "cloak-brooch"],
  },
  {
    id: "school-boy", nameKo: "학원물 소년", nameEn: "School Slice-of-Life Boy",
    roleSummaryKo: "6.5등신 · 균형 안면 · 가운데 가르마 · 교복 배지·안경",
    roleSummaryEn: "6.5H · Balanced Face · Center Part · Uniform Badge & Glasses",
    headToBodyRatio: 6.5, eyeSpacingRatio: 0.98, eyeHeightRatio: 0.52, jawWidthRatio: 0.68,
    hairPartSide: "center", requiredAccessories: ["uniform-badge", "glasses"],
  },
  {
    id: "fantasy-sidekick", nameKo: "판타지 조연", nameEn: "Fantasy Sidekick",
    roleSummaryKo: "5.5등신 · 동안 비율 · 앞머리 일자 · 브로치·귀걸이·머리핀",
    roleSummaryEn: "5.5H · Compact Ratio · Full Bangs · Brooch, Earring & Hairpin",
    headToBodyRatio: 5.5, eyeSpacingRatio: 0.92, eyeHeightRatio: 0.56, jawWidthRatio: 0.64,
    hairPartSide: "none", requiredAccessories: ["cloak-brooch", "earring-left", "hairpin"],
  },
];

const SCENE_TEMPLATES: readonly { readonly tagKo: string; readonly tagEn: string; readonly shot: CameraShotKind }[] = [
  { tagKo: "도입 전신 등장", tagEn: "Intro Full Shot", shot: "full" },
  { tagKo: "대화 바스트 샷", tagEn: "Dialogue Bust Shot", shot: "bust" },
  { tagKo: "감정 클로즈업", tagEn: "Emotion Close-Up", shot: "closeup" },
  { tagKo: "동선 반신 컷", tagEn: "Movement Half Shot", shot: "half" },
  { tagKo: "반전 리액션", tagEn: "Twist Reaction", shot: "closeup" },
  { tagKo: "전개 액션 컷", tagEn: "Action Beat Cut", shot: "full" },
];

function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function clampMetricValue(key: DriftMetricKey, value: number): number {
  const meta = DRIFT_METRIC_META[key];
  const safe = Number.isFinite(value) ? value : meta.min;
  const clamped = Math.min(meta.max, Math.max(meta.min, safe));
  return roundTo(clamped, key === "headToBodyRatio" ? 2 : 3);
}

function dedupeAccessories(list: readonly ModelSheetAccessoryId[]): readonly ModelSheetAccessoryId[] {
  const valid = new Set<ModelSheetAccessoryId>(MODEL_SHEET_ACCESSORIES.map((item) => item.id));
  const seen = new Set<ModelSheetAccessoryId>();
  const out: ModelSheetAccessoryId[] = [];
  for (const acc of list) {
    if (valid.has(acc) && !seen.has(acc)) {
      seen.add(acc);
      out.push(acc);
    }
  }
  return out;
}

function flipHairPart(side: HairPartSide): HairPartSide {
  if (side === "left") return "right";
  if (side === "right") return "left";
  return side === "center" ? "left" : "right";
}

function classifyMetricDeviation(key: DriftMetricKey, absPct: number): CutDriftSeverity {
  const { okPct, noticePct } = DRIFT_METRIC_META[key].thresholds;
  if (absPct > noticePct) return "drift";
  return absPct > okPct ? "notice" : "ok";
}

function formatSignedPct(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function getModelSheetSpec(archetypeId: ModelSheetArchetypeId): ModelSheetSpec {
  return MODEL_SHEET_ARCHETYPES.find((item) => item.id === archetypeId) ?? DEFAULT_ARCHETYPE_SPEC;
}

export function getAccessoryMeta(id: ModelSheetAccessoryId): ModelSheetAccessoryMeta {
  return MODEL_SHEET_ACCESSORIES.find((item) => item.id === id) ?? DEFAULT_ACCESSORY;
}

export function getHairPartMeta(side: HairPartSide): HairPartMeta {
  return HAIR_PART_OPTIONS.find((item) => item.id === side) ?? DEFAULT_HAIR_PART;
}

interface SampleCutDriftOverride {
  readonly headMul?: number; readonly eyeSpaceMul?: number;
  readonly eyeHeightMul?: number; readonly jawMul?: number;
  readonly flipHair?: boolean; readonly accMode?: "drop-first" | "drop-last" | "keep-first" | "none";
}

const SAMPLE_DRIFT_OVERRIDES: Readonly<Record<number, SampleCutDriftOverride>> = {
  7: { headMul: 0.87, jawMul: 1.11, accMode: "drop-first" },
  14: { eyeSpaceMul: 1.09, eyeHeightMul: 1.06 },
  19: { eyeSpaceMul: 1.15, flipHair: true },
  26: { headMul: 1.07, accMode: "drop-last" },
  31: { headMul: 0.89, jawMul: 0.85, accMode: "none" },
  38: { eyeHeightMul: 0.94, jawMul: 1.08 },
  44: { headMul: 1.13, eyeHeightMul: 1.1, flipHair: true, accMode: "drop-first" },
  51: { eyeSpaceMul: 0.91 },
  55: { headMul: 0.86, eyeSpaceMul: 1.14, jawMul: 0.86, accMode: "keep-first" },
};

/** 1~60컷 결정론적 샘플 회차 생성 (정상·주의·흔들림 컷을 연재 마감 패턴으로 분포). */
export function generateEpisodeSampleCuts(
  archetypeId: ModelSheetArchetypeId,
  cutCount = 60,
): readonly EpisodeCutMetric[] {
  const spec = getModelSheetSpec(archetypeId);
  const clampedCount = Math.max(1, Math.min(60, Math.round(Number.isFinite(cutCount) ? cutCount : 60)));
  const offset = Math.max(0, MODEL_SHEET_ARCHETYPES.findIndex((item) => item.id === archetypeId));
  const cuts: EpisodeCutMetric[] = [];

  for (let cutNumber = 1; cutNumber <= clampedCount; cutNumber += 1) {
    const tpl = SCENE_TEMPLATES[(cutNumber + offset) % SCENE_TEMPLATES.length] ?? SCENE_TEMPLATES[0];
    const wave = Math.sin((cutNumber + offset * 3) * 0.85);
    const wave2 = Math.cos((cutNumber + offset * 2) * 0.62);
    const ov = SAMPLE_DRIFT_OVERRIDES[cutNumber];

    const headMul = ov?.headMul ?? 1 + wave * 0.022;
    const eyeSpaceMul = ov?.eyeSpaceMul ?? 1 + wave2 * 0.028;
    const eyeHeightMul = ov?.eyeHeightMul ?? 1 + wave * 0.018;
    const jawMul = ov?.jawMul ?? 1 - wave2 * 0.025;
    const hairPartSide: HairPartSide = ov?.flipHair ? flipHairPart(spec.hairPartSide) : spec.hairPartSide;
    let presentAccessories: readonly ModelSheetAccessoryId[] = spec.requiredAccessories;
    if (ov?.accMode === "drop-first") presentAccessories = spec.requiredAccessories.slice(1);
    else if (ov?.accMode === "drop-last") presentAccessories = spec.requiredAccessories.slice(0, Math.max(0, spec.requiredAccessories.length - 1));
    else if (ov?.accMode === "keep-first") presentAccessories = spec.requiredAccessories.slice(0, 1);
    else if (ov?.accMode === "none") presentAccessories = [];

    cuts.push({
      cutId: `cut-${String(cutNumber).padStart(2, "0")}`,
      cutNumber,
      sceneTagKo: tpl ? tpl.tagKo : "대화 컷",
      sceneTagEn: tpl ? tpl.tagEn : "Dialogue Cut",
      cameraShot: tpl ? tpl.shot : "bust",
      headToBodyRatio: clampMetricValue("headToBodyRatio", spec.headToBodyRatio * headMul),
      eyeSpacingRatio: clampMetricValue("eyeSpacingRatio", spec.eyeSpacingRatio * eyeSpaceMul),
      eyeHeightRatio: clampMetricValue("eyeHeightRatio", spec.eyeHeightRatio * eyeHeightMul),
      jawWidthRatio: clampMetricValue("jawWidthRatio", spec.jawWidthRatio * jawMul),
      hairPartSide,
      presentAccessories: dedupeAccessories(presentAccessories),
    });
  }
  return cuts;
}

function buildMetricDeviation(spec: ModelSheetSpec, cut: EpisodeCutMetric, key: DriftMetricKey): MetricDeviationDetail {
  const meta = DRIFT_METRIC_META[key];
  const baseline = spec[key];
  const measured = cut[key];
  const rawPct = baseline > 0 ? ((measured - baseline) / baseline) * 100 : 0;
  const signedPct = roundTo(rawPct, 1);
  const absPct = roundTo(Math.abs(rawPct), 1);
  return {
    key, labelKo: meta.labelKo, labelEn: meta.labelEn,
    baseline, measured, signedPct, absPct, severity: classifyMetricDeviation(key, absPct),
  };
}

/** 단일 컷을 캐릭터 설정집 기준과 대조해 비율 편차·등급·누락 소품·붉은 펜 코멘트를 산출. */
export function auditSingleCutDrift(spec: ModelSheetSpec, cut: EpisodeCutMetric): CutDriftAudit {
  const headDetail = buildMetricDeviation(spec, cut, "headToBodyRatio");
  const eyeSpaceDetail = buildMetricDeviation(spec, cut, "eyeSpacingRatio");
  const eyeHeightDetail = buildMetricDeviation(spec, cut, "eyeHeightRatio");
  const jawDetail = buildMetricDeviation(spec, cut, "jawWidthRatio");

  const metrics: Readonly<Record<DriftMetricKey, MetricDeviationDetail>> = {
    headToBodyRatio: headDetail, eyeSpacingRatio: eyeSpaceDetail,
    eyeHeightRatio: eyeHeightDetail, jawWidthRatio: jawDetail,
  };
  const metricList: readonly MetricDeviationDetail[] = [headDetail, eyeSpaceDetail, eyeHeightDetail, jawDetail];

  let maxDeviationPct = 0;
  let weightedDriftPct = 0;
  let hasMetricDrift = false;
  let hasMetricNotice = false;

  for (const detail of metricList) {
    if (detail.absPct > maxDeviationPct) maxDeviationPct = detail.absPct;
    weightedDriftPct += detail.absPct * DRIFT_METRIC_META[detail.key].weight;
    if (detail.severity === "drift") hasMetricDrift = true;
    if (detail.severity === "notice") hasMetricNotice = true;
  }

  weightedDriftPct = roundTo(weightedDriftPct, 1);
  const hairPartMismatch = cut.hairPartSide !== spec.hairPartSide;
  const presentSet = new Set<ModelSheetAccessoryId>(cut.presentAccessories);
  const missingAccessories = spec.requiredAccessories.filter((acc) => !presentSet.has(acc));

  let severity: CutDriftSeverity = "ok";
  if (
    hasMetricDrift ||
    missingAccessories.length >= 2 ||
    (missingAccessories.length >= 1 && (hasMetricNotice || hairPartMismatch)) ||
    weightedDriftPct > 8.5
  ) {
    severity = "drift";
  } else if (hasMetricNotice || missingAccessories.length === 1 || hairPartMismatch) {
    severity = "notice";
  }

  const proportionPenalty = weightedDriftPct * 3.1 + Math.max(0, maxDeviationPct - 9) * 1.1;
  const cutScore = Math.max(
    0,
    Math.min(100, Math.round(100 - proportionPenalty - missingAccessories.length * 10 - (hairPartMismatch ? 7 : 0))),
  );

  const redPenCalloutsKo: string[] = [];
  const redPenCalloutsEn: string[] = [];

  for (const item of metricList) {
    if (item.severity === "ok") continue;
    redPenCalloutsKo.push(`${item.labelKo} ${formatSignedPct(item.signedPct)} (${item.signedPct > 0 ? "과대" : "축소"})`);
    redPenCalloutsEn.push(`${item.labelEn} ${formatSignedPct(item.signedPct)} (${item.signedPct > 0 ? "oversized" : "undersized"})`);
  }
  if (hairPartMismatch) {
    const specHair = getHairPartMeta(spec.hairPartSide);
    const curHair = getHairPartMeta(cut.hairPartSide);
    redPenCalloutsKo.push(`가르마 반전: ${curHair.labelKo} → 기준 ${specHair.labelKo}`);
    redPenCalloutsEn.push(`Hair part flipped: ${curHair.labelEn} → Spec ${specHair.labelEn}`);
  }
  if (missingAccessories.length > 0) {
    redPenCalloutsKo.push(`누락 소품: ${missingAccessories.map((id) => getAccessoryMeta(id).labelKo).join(", ")}`);
    redPenCalloutsEn.push(`Missing accessories: ${missingAccessories.map((id) => getAccessoryMeta(id).labelEn).join(", ")}`);
  }
  if (redPenCalloutsKo.length === 0) {
    redPenCalloutsKo.push("설정집 허용 오차 안 · 비율·소품 안정");
    redPenCalloutsEn.push("Within model sheet tolerance · Proportions & props intact");
  }

  return {
    cutId: cut.cutId, cutNumber: cut.cutNumber, sceneTagKo: cut.sceneTagKo, sceneTagEn: cut.sceneTagEn,
    cameraShot: cut.cameraShot, metrics, metricList, maxDeviationPct, weightedDriftPct,
    hairPartMismatch, missingAccessories, severity, cutScore, redPenCalloutsKo, redPenCalloutsEn,
  };
}

/** 1~60컷 회차 전체를 캐릭터 설정집과 대조 감사해 일관성 점수(0~100)와 문제 컷 순위를 산출. */
export function auditEpisodeModelSheetDrift(params: {
  readonly spec: ModelSheetSpec;
  readonly cuts: readonly EpisodeCutMetric[];
}): EpisodeModelSheetAuditReport {
  const { spec, cuts } = params;
  const bounded = cuts.slice(0, 60);
  const effectiveCuts = bounded.length > 0 ? bounded : generateEpisodeSampleCuts(spec.id, 1);
  const cutAudits = effectiveCuts.map((cut) => auditSingleCutDrift(spec, cut));

  let okCount = 0;
  let noticeCount = 0;
  let driftCount = 0;
  let scoreSum = 0;
  let worstAudit: CutDriftAudit | undefined;
  const missingTotals: Record<ModelSheetAccessoryId, number> = {
    "earring-left": 0, "cheek-scar": 0, "uniform-badge": 0, "cloak-brooch": 0, glasses: 0, hairpin: 0,
  };

  for (const audit of cutAudits) {
    scoreSum += audit.cutScore;
    if (audit.severity === "ok") okCount += 1;
    else if (audit.severity === "notice") noticeCount += 1;
    else driftCount += 1;

    if (
      !worstAudit ||
      audit.cutScore < worstAudit.cutScore ||
      (audit.cutScore === worstAudit.cutScore && audit.maxDeviationPct > worstAudit.maxDeviationPct)
    ) {
      worstAudit = audit;
    }
    for (const accId of audit.missingAccessories) missingTotals[accId] += 1;
  }

  const worstCutNumber = worstAudit ? worstAudit.cutNumber : 1;
  const avgScore = scoreSum / cutAudits.length;
  const driftRatePenalty = (driftCount / cutAudits.length) * 32 + (noticeCount / cutAudits.length) * 8;
  const consistencyScore = Math.max(0, Math.min(100, Math.round(avgScore - driftRatePenalty)));

  let grade: EpisodeConsistencyGrade = "stable";
  if (consistencyScore < 72 || driftCount >= 5) grade = "critical";
  else if (consistencyScore < 88 || driftCount >= 1) grade = "review";

  const topDriftCutNumbers = [...cutAudits]
    .filter((item) => item.severity !== "ok")
    .sort((a, b) => a.cutScore - b.cutScore || b.maxDeviationPct - a.maxDeviationPct || a.cutNumber - b.cutNumber)
    .map((item) => item.cutNumber);

  const summaryKo =
    driftCount > 0
      ? `총 ${cutAudits.length}컷 중 흔들림 ${driftCount}컷·주의 ${noticeCount}컷 감지 (최우선 확인: ${worstCutNumber}컷)`
      : noticeCount > 0
        ? `총 ${cutAudits.length}컷 중 흔들림 0컷, 미세 주의 ${noticeCount}컷`
        : `총 ${cutAudits.length}컷 전량 설정집 기준 통과`;
  const summaryEn =
    driftCount > 0
      ? `${driftCount} drift and ${noticeCount} notice cuts across ${cutAudits.length} cuts (worst: Cut #${worstCutNumber})`
      : noticeCount > 0
        ? `0 drift cuts, ${noticeCount} minor notice cuts across ${cutAudits.length} cuts`
        : `All ${cutAudits.length} cuts match the model sheet baseline`;

  return {
    spec, totalCuts: cutAudits.length, cutAudits, consistencyScore, grade,
    counts: { ok: okCount, notice: noticeCount, drift: driftCount },
    worstCutNumber, topDriftCutNumbers, missingAccessoryTotals: missingTotals, summaryKo, summaryEn,
  };
}

function buildOverlayActionList(
  before: EpisodeCutMetric,
  after: EpisodeCutMetric,
  addedAccessories: readonly ModelSheetAccessoryId[],
): { readonly ko: readonly string[]; readonly en: readonly string[]; readonly adjustedFields: readonly DriftMetricKey[] } {
  const ko: string[] = [];
  const en: string[] = [];
  const adjustedFields: DriftMetricKey[] = [];

  for (const key of DRIFT_METRIC_KEYS) {
    const diff = roundTo(after[key] - before[key], key === "headToBodyRatio" ? 2 : 3);
    if (Math.abs(diff) < 0.004) continue;
    adjustedFields.push(key);
    const meta = DRIFT_METRIC_META[key];
    const pct = before[key] > 0 ? roundTo(((after[key] - before[key]) / before[key]) * 100, 1) : 0;
    ko.push(`${meta.labelKo} ${before[key].toFixed(2)} → ${after[key].toFixed(2)} (${formatSignedPct(pct)})`);
    en.push(`${meta.labelEn} ${before[key].toFixed(2)} → ${after[key].toFixed(2)} (${formatSignedPct(pct)})`);
  }
  if (before.hairPartSide !== after.hairPartSide) {
    const nextHair = getHairPartMeta(after.hairPartSide);
    ko.push(`가르마를 ${nextHair.labelKo}로 보정`);
    en.push(`Align hair part to ${nextHair.labelEn}`);
  }
  for (const accId of addedAccessories) {
    const acc = getAccessoryMeta(accId);
    ko.push(`${acc.labelKo} 오버레이 레이어 추가`);
    en.push(`Add ${acc.labelEn} overlay layer`);
  }
  if (ko.length === 0) {
    ko.push("현재 비율 유지 (추가 변형 없음)");
    en.push("Keep current proportions (no warp needed)");
  }
  return { ko, en, adjustedFields };
}

/** 비파괴 Top-3 교정 후보 제안기: (1) 최소 미세 보정, (2) 설정집 정밀 정합, (3) 의상·소품 체크 복구. */
export function proposeCutDriftCorrectionsTop3(
  spec: ModelSheetSpec,
  cut: EpisodeCutMetric,
): CutCorrectionTop3 {
  const currentAudit = auditSingleCutDrift(spec, cut);

  const nudgeValue = (key: DriftMetricKey): number => {
    const detail = currentAudit.metrics[key];
    const okPct = DRIFT_METRIC_META[key].thresholds.okPct;
    if (detail.absPct <= okPct) return cut[key];
    const sign = detail.signedPct >= 0 ? 1 : -1;
    return clampMetricValue(key, spec[key] * (1 + (sign * okPct * 0.72) / 100));
  };

  const buildCandidate = (
    rank: 1 | 2 | 3, strategy: CorrectionStrategyId, titleKo: string, titleEn: string,
    summaryKo: string, summaryEn: string, proposedMetrics: EpisodeCutMetric,
    addedAccessories: readonly ModelSheetAccessoryId[],
  ): CutCorrectionCandidate => {
    const projectedAudit = auditSingleCutDrift(spec, proposedMetrics);
    const actions = buildOverlayActionList(cut, proposedMetrics, addedAccessories);
    return {
      id: `${cut.cutId}:${strategy}`, rank, strategy, titleKo, titleEn, summaryKo, summaryEn,
      proposedMetrics, projectedAudit, scoreGain: projectedAudit.cutScore - currentAudit.cutScore,
      adjustedFields: actions.adjustedFields, restoresHairPart: cut.hairPartSide !== proposedMetrics.hairPartSide,
      addedAccessories, overlayActionsKo: actions.ko, overlayActionsEn: actions.en, requiresAuthorApproval: true,
    };
  };

  const minimalCut: EpisodeCutMetric = {
    ...cut,
    headToBodyRatio: nudgeValue("headToBodyRatio"), eyeSpacingRatio: nudgeValue("eyeSpacingRatio"),
    eyeHeightRatio: nudgeValue("eyeHeightRatio"), jawWidthRatio: nudgeValue("jawWidthRatio"),
  };
  const exactCut: EpisodeCutMetric = {
    ...cut,
    headToBodyRatio: spec.headToBodyRatio, eyeSpacingRatio: spec.eyeSpacingRatio,
    eyeHeightRatio: spec.eyeHeightRatio, jawWidthRatio: spec.jawWidthRatio, hairPartSide: spec.hairPartSide,
  };
  const missingAccessories = currentAudit.missingAccessories;
  const fullRestoreCut: EpisodeCutMetric = {
    ...cut,
    headToBodyRatio: currentAudit.metrics.headToBodyRatio.severity === "ok" ? cut.headToBodyRatio : spec.headToBodyRatio,
    eyeSpacingRatio: currentAudit.metrics.eyeSpacingRatio.severity === "ok" ? cut.eyeSpacingRatio : spec.eyeSpacingRatio,
    eyeHeightRatio: currentAudit.metrics.eyeHeightRatio.severity === "ok" ? cut.eyeHeightRatio : spec.eyeHeightRatio,
    jawWidthRatio: currentAudit.metrics.jawWidthRatio.severity === "ok" ? cut.jawWidthRatio : spec.jawWidthRatio,
    hairPartSide: spec.hairPartSide,
    presentAccessories: dedupeAccessories([...cut.presentAccessories, ...spec.requiredAccessories]),
  };

  return [
    buildCandidate(
      1, "minimal-nudge", "최소 미세 보정", "Minimal Subtle Nudge",
      "작화 선맛과 표정 과장은 남기고 허용 오차를 넘긴 비율만 최소한으로 안쪽에 맞춥니다.",
      "Keeps hand-drawn style while nudging only out-of-range ratios back inside tolerance.",
      minimalCut, [],
    ),
    buildCandidate(
      2, "spec-exact", "설정집 정밀 정합", "Exact Model Sheet Lock",
      "등신·눈 간격·눈 높이·턱선 폭과 가르마를 캐릭터 설정집 기준선과 100% 일치시킵니다.",
      "Locks head ratio, eye spacing, eye height, jaw width, and hair part 100% to the model sheet.",
      exactCut, [],
    ),
    buildCandidate(
      3, "accessory-full-restore", "의상·소품 체크 복구", "Costume & Prop Restore",
      missingAccessories.length > 0
        ? `누락된 필수 소품 ${missingAccessories.length}종 오버레이를 복구하고 이탈 비율·가르마를 정리합니다.`
        : "필수 소품 체크를 확정하고 이탈 비율·가르마를 설정집 기준으로 깔끔하게 복구합니다.",
      missingAccessories.length > 0
        ? `Restores ${missingAccessories.length} missing prop overlay(s) and aligns drifted proportions and hair part.`
        : "Confirms required props and aligns drifted proportions and hair part to the model sheet.",
      fullRestoreCut, missingAccessories,
    ),
  ];
}

export function createDriftCoachSession(
  archetypeId: ModelSheetArchetypeId = "romance-lead",
  cutCount = 60,
): DriftCoachSessionState {
  const spec = getModelSheetSpec(archetypeId);
  const baselineCuts = generateEpisodeSampleCuts(spec.id, cutCount);
  const audit = auditEpisodeModelSheetDrift({ spec, cuts: baselineCuts });
  return {
    archetypeId: spec.id, baselineCuts,
    workingCuts: baselineCuts.map((cut) => ({ ...cut, presentAccessories: [...cut.presentAccessories] })),
    selectedCutNumber: audit.worstCutNumber, previewCandidateId: null,
    appliedFixByCut: {}, approvalHistory: [], revision: 0,
  };
}

export function selectDriftCoachCut(session: DriftCoachSessionState, cutNumber: number): DriftCoachSessionState {
  if (!session.workingCuts.some((cut) => cut.cutNumber === cutNumber)) return session;
  return { ...session, selectedCutNumber: cutNumber, previewCandidateId: null };
}

export function simulateCutMetricUpdate(
  session: DriftCoachSessionState,
  cutNumber: number,
  patch: CutMetricPatch,
): DriftCoachSessionState {
  let changed = false;
  const nextWorking = session.workingCuts.map((cut) => {
    if (cut.cutNumber !== cutNumber) return cut;
    changed = true;
    return {
      ...cut,
      headToBodyRatio: patch.headToBodyRatio !== undefined ? clampMetricValue("headToBodyRatio", patch.headToBodyRatio) : cut.headToBodyRatio,
      eyeSpacingRatio: patch.eyeSpacingRatio !== undefined ? clampMetricValue("eyeSpacingRatio", patch.eyeSpacingRatio) : cut.eyeSpacingRatio,
      eyeHeightRatio: patch.eyeHeightRatio !== undefined ? clampMetricValue("eyeHeightRatio", patch.eyeHeightRatio) : cut.eyeHeightRatio,
      jawWidthRatio: patch.jawWidthRatio !== undefined ? clampMetricValue("jawWidthRatio", patch.jawWidthRatio) : cut.jawWidthRatio,
      hairPartSide: patch.hairPartSide ?? cut.hairPartSide,
      presentAccessories: patch.presentAccessories !== undefined ? dedupeAccessories(patch.presentAccessories) : cut.presentAccessories,
    };
  });
  return changed ? { ...session, workingCuts: nextWorking, previewCandidateId: null } : session;
}

export function previewCutCorrection(session: DriftCoachSessionState, candidateId: string | null): DriftCoachSessionState {
  return { ...session, previewCandidateId: candidateId !== null && session.previewCandidateId === candidateId ? null : candidateId };
}

export function applyCutCorrection(
  session: DriftCoachSessionState, cutNumber: number, candidate: CutCorrectionCandidate,
): DriftCoachSessionState {
  const currentCut = session.workingCuts.find((cut) => cut.cutNumber === cutNumber);
  if (!currentCut) return session;
  const spec = getModelSheetSpec(session.archetypeId);
  const scoreBefore = auditSingleCutDrift(spec, currentCut).cutScore;
  const appliedCut: EpisodeCutMetric = {
    ...candidate.proposedMetrics, cutId: currentCut.cutId, cutNumber: currentCut.cutNumber,
    presentAccessories: [...candidate.proposedMetrics.presentAccessories],
  };
  const scoreAfter = auditSingleCutDrift(spec, appliedCut).cutScore;
  const nextRevision = session.revision + 1;
  const originalCut = session.appliedFixByCut[cutNumber]?.originalCut ?? currentCut;
  const entry: CutApprovalHistoryEntry = {
    entryId: `rev-${nextRevision}-apply-${cutNumber}`, revision: nextRevision, action: "apply",
    cutNumber, strategy: candidate.strategy, scoreBefore, scoreAfter,
    summaryKo: `${cutNumber}컷 '${candidate.titleKo}' 적용 (${scoreBefore}점 → ${scoreAfter}점)`,
    summaryEn: `Applied '${candidate.titleEn}' to Cut #${cutNumber} (${scoreBefore} → ${scoreAfter})`,
  };
  return {
    ...session,
    workingCuts: session.workingCuts.map((cut) => (cut.cutNumber === cutNumber ? appliedCut : cut)),
    previewCandidateId: null,
    appliedFixByCut: {
      ...session.appliedFixByCut,
      [cutNumber]: {
        cutNumber, candidateId: candidate.id, strategy: candidate.strategy, titleKo: candidate.titleKo,
        titleEn: candidate.titleEn, originalCut, appliedCut, scoreBefore, scoreAfter, revision: nextRevision,
      },
    },
    approvalHistory: [entry, ...session.approvalHistory].slice(0, 40),
    revision: nextRevision,
  };
}

export function revertCutCorrection(session: DriftCoachSessionState, cutNumber: number): DriftCoachSessionState {
  const record = session.appliedFixByCut[cutNumber];
  if (!record) return session;
  const spec = getModelSheetSpec(session.archetypeId);
  const currentCut = session.workingCuts.find((cut) => cut.cutNumber === cutNumber);
  const scoreBefore = currentCut ? auditSingleCutDrift(spec, currentCut).cutScore : record.scoreAfter;
  const scoreAfter = auditSingleCutDrift(spec, record.originalCut).cutScore;
  const nextRevision = session.revision + 1;
  const nextApplied: Record<number, AppliedCutFixRecord> = {};
  for (const [k, v] of Object.entries(session.appliedFixByCut)) {
    if (Number(k) !== cutNumber) nextApplied[Number(k)] = v;
  }
  const entry: CutApprovalHistoryEntry = {
    entryId: `rev-${nextRevision}-revert-${cutNumber}`, revision: nextRevision, action: "revert",
    cutNumber, strategy: record.strategy, scoreBefore, scoreAfter,
    summaryKo: `${cutNumber}컷 비파괴 보정 원복 (${scoreBefore}점 → ${scoreAfter}점)`,
    summaryEn: `Reverted Cut #${cutNumber} correction (${scoreBefore} → ${scoreAfter})`,
  };
  return {
    ...session,
    workingCuts: session.workingCuts.map((cut) =>
      cut.cutNumber === cutNumber ? { ...record.originalCut, presentAccessories: [...record.originalCut.presentAccessories] } : cut,
    ),
    previewCandidateId: null, appliedFixByCut: nextApplied,
    approvalHistory: [entry, ...session.approvalHistory].slice(0, 40), revision: nextRevision,
  };
}

export function revertAllCutCorrections(session: DriftCoachSessionState): DriftCoachSessionState {
  const appliedCount = Object.keys(session.appliedFixByCut).length;
  const spec = getModelSheetSpec(session.archetypeId);
  const scoreBefore = auditEpisodeModelSheetDrift({ spec, cuts: session.workingCuts }).consistencyScore;
  const scoreAfter = auditEpisodeModelSheetDrift({ spec, cuts: session.baselineCuts }).consistencyScore;
  const nextRevision = session.revision + 1;
  const entry: CutApprovalHistoryEntry = {
    entryId: `rev-${nextRevision}-revert-all`, revision: nextRevision, action: "revert-all",
    cutNumber: null, strategy: null, scoreBefore, scoreAfter,
    summaryKo: appliedCount > 0 ? `적용 보정 ${appliedCount}건 포함 전체 컷 초기 스캔 상태로 원복` : "전체 컷을 초기 스캔 상태로 초기화",
    summaryEn: appliedCount > 0 ? `Reverted all ${appliedCount} applied fix(es) to initial scan baseline` : "Reset all cuts to initial scan baseline",
  };
  return {
    ...session,
    workingCuts: session.baselineCuts.map((cut) => ({ ...cut, presentAccessories: [...cut.presentAccessories] })),
    previewCandidateId: null, appliedFixByCut: {},
    approvalHistory: [entry, ...session.approvalHistory].slice(0, 40), revision: nextRevision,
  };
}

/** 검수 리포트 Markdown 직렬화. */
export function exportDriftReportMarkdown(params: {
  readonly audit: EpisodeModelSheetAuditReport;
  readonly session: DriftCoachSessionState;
  readonly locale?: "ko" | "en";
}): string {
  const { audit, session, locale = "ko" } = params;
  const isEn = locale === "en";
  const spec = audit.spec;
  const hairLabel = isEn ? getHairPartMeta(spec.hairPartSide).labelEn : getHairPartMeta(spec.hairPartSide).labelKo;
  const reqAcc = spec.requiredAccessories.map((id) => (isEn ? getAccessoryMeta(id).labelEn : getAccessoryMeta(id).labelKo)).join(", ");
  const lines: string[] = [
    isEn ? "# Cross-Cut Model Sheet Drift Audit Report" : "# 회차 캐릭터 작화·비율 흔들림 검수 리포트", "",
    isEn ? `- **Character Archetype**: ${spec.nameEn} (${spec.headToBodyRatio.toFixed(1)}H)` : `- **설정집 기준 캐릭터**: ${spec.nameKo} (${spec.headToBodyRatio.toFixed(1)}등신)`,
    isEn
      ? `- **Baseline Spec**: Eye Spacing ${spec.eyeSpacingRatio.toFixed(2)}x · Eye Height ${spec.eyeHeightRatio.toFixed(2)} · Jaw Width ${spec.jawWidthRatio.toFixed(2)} · Hair Part ${hairLabel}`
      : `- **기준 지표**: 눈 간격 ${spec.eyeSpacingRatio.toFixed(2)}배 · 눈 높이 ${spec.eyeHeightRatio.toFixed(2)} · 턱선 폭 ${spec.jawWidthRatio.toFixed(2)} · 가르마 ${hairLabel}`,
    isEn ? `- **Required Props**: ${reqAcc}` : `- **필수 의상·장신구**: ${reqAcc}`,
    isEn
      ? `- **Episode Consistency Score**: **${audit.consistencyScore}/100** (OK ${audit.counts.ok} / Notice ${audit.counts.notice} / Drift ${audit.counts.drift} of ${audit.totalCuts} cuts)`
      : `- **회차 일관성 점수**: **${audit.consistencyScore} / 100점** (총 ${audit.totalCuts}컷 · 정상 ${audit.counts.ok} / 주의 ${audit.counts.notice} / 흔들림 ${audit.counts.drift})`,
    "", isEn ? "## Flagged Cuts" : "## 검수 대상 컷 목록", "",
    isEn ? "| Cut | Severity | Score | Max Drift | Red-Pen Notes | Fix Status |" : "| 컷 | 등급 | 점수 | 최대 편차 | 붉은 펜 검수 메모 | 보정 상태 |",
    "| --- | --- | ---: | ---: | --- | --- |",
  ];
  const flagged = audit.cutAudits.filter((item) => item.severity !== "ok" || Boolean(session.appliedFixByCut[item.cutNumber]));
  if (flagged.length === 0) {
    lines.push(isEn ? "| - | ok | 100 | 0.0% | All cuts within baseline tolerance | Clean |" : "| - | 정상 | 100점 | 0.0% | 전 컷 설정집 허용 오차 안 | 완료 |");
  } else {
    for (const item of flagged) {
      const fix = session.appliedFixByCut[item.cutNumber];
      const notes = (isEn ? item.redPenCalloutsEn : item.redPenCalloutsKo).join(" / ");
      const statusText = fix ? (isEn ? `Applied (${fix.titleEn})` : `적용됨 (${fix.titleKo})`) : (isEn ? "Pending review" : "검수 대기");
      const sev = isEn ? item.severity : item.severity === "drift" ? "흔들림" : item.severity === "notice" ? "주의" : "정상";
      lines.push(`| #${item.cutNumber} | ${sev} | ${item.cutScore} | ${item.maxDeviationPct.toFixed(1)}% | ${notes} | ${statusText} |`);
    }
  }
  lines.push("", isEn ? "## Approval History" : "## 컷별 승인·원복 이력", "");
  if (session.approvalHistory.length === 0) lines.push(isEn ? "- No author approvals recorded yet." : "- 아직 작가 승인 이력이 없습니다.");
  else for (const entry of session.approvalHistory) lines.push(`- [r${entry.revision}] ${isEn ? entry.summaryEn : entry.summaryKo}`);
  return lines.join("\n");
}

/** 검수 리포트 JSON 직렬화. */
export function exportDriftReportJson(params: {
  readonly audit: EpisodeModelSheetAuditReport;
  readonly session: DriftCoachSessionState;
}): string {
  const { audit, session } = params;
  const appliedList = Object.values(session.appliedFixByCut).sort((a, b) => a.cutNumber - b.cutNumber);
  return JSON.stringify(
    {
      schema: "toonstudio.crosscut-modelsheet-drift-coach.v1",
      spec: audit.spec,
      summary: {
        totalCuts: audit.totalCuts, consistencyScore: audit.consistencyScore, grade: audit.grade,
        counts: audit.counts, worstCutNumber: audit.worstCutNumber, missingAccessoryTotals: audit.missingAccessoryTotals,
      },
      flaggedCuts: audit.cutAudits.filter((item) => item.severity !== "ok").map((item) => ({
        cutNumber: item.cutNumber, severity: item.severity, cutScore: item.cutScore,
        maxDeviationPct: item.maxDeviationPct, weightedDriftPct: item.weightedDriftPct,
        hairPartMismatch: item.hairPartMismatch, missingAccessories: item.missingAccessories,
        redPenCalloutsKo: item.redPenCalloutsKo, redPenCalloutsEn: item.redPenCalloutsEn,
      })),
      appliedFixes: appliedList.map((fix) => ({
        cutNumber: fix.cutNumber, strategy: fix.strategy, titleKo: fix.titleKo,
        scoreBefore: fix.scoreBefore, scoreAfter: fix.scoreAfter, revision: fix.revision,
      })),
      approvalHistory: session.approvalHistory,
    },
    null,
    2,
  );
}
