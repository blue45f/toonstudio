import type { CutMetricPatch, DriftCoachSessionState, DriftMetricKey, EpisodeCutMetric, ModelSheetAccessoryId, ModelSheetSpec } from "./modelsheet-drift-engine";

const METRIC_BOUNDS: Readonly<Record<DriftMetricKey, readonly [number, number]>> = {
  headToBodyRatio: [4.5, 9], eyeSpacingRatio: [0.72, 1.35], eyeHeightRatio: [0.36, 0.68], jawWidthRatio: [0.45, 0.94],
};
const HAIR = ["left", "right", "center", "none"] as const;
const ACCESSORIES: readonly ModelSheetAccessoryId[] = ["earring-left", "cheek-scar", "uniform-badge", "cloak-brooch", "glasses", "hairpin"];
const STRATEGIES = ["minimal-nudge", "spec-exact", "accessory-full-restore"] as const;
export function driftNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError("모델 시트 예제의 수치가 유한한 지원 범위를 벗어났습니다.");
  return value;
}
export function driftText(value: string): string {
  if (typeof value !== "string" || value.length > 4096) throw new RangeError("모델 시트 예제의 글자가 지원 범위를 벗어났습니다.");
  return value;
}
function member<T extends string>(value: T, options: readonly T[]): T {
  if (!options.includes(value)) throw new RangeError("지원하지 않는 모델 시트 예제 항목입니다.");
  return value;
}
function accessories(values: readonly ModelSheetAccessoryId[], unique = true): readonly ModelSheetAccessoryId[] {
  if (!Array.isArray(values) || values.length > 6 || (unique && new Set(values).size !== values.length)) throw new RangeError("소품 목록이 지원 범위를 벗어났습니다.");
  return values.map(value => member(value, ACCESSORIES));
}
function metrics(value: ModelSheetSpec | EpisodeCutMetric) {
  return {
    headToBodyRatio: driftNumber(value.headToBodyRatio, ...METRIC_BOUNDS.headToBodyRatio),
    eyeSpacingRatio: driftNumber(value.eyeSpacingRatio, ...METRIC_BOUNDS.eyeSpacingRatio),
    eyeHeightRatio: driftNumber(value.eyeHeightRatio, ...METRIC_BOUNDS.eyeHeightRatio),
    jawWidthRatio: driftNumber(value.jawWidthRatio, ...METRIC_BOUNDS.jawWidthRatio),
  };
}
/** 원문을 정규화하거나 자르지 않고, 공개 필드만 새 객체로 복사한다. */
export function validateDriftSpec(spec: ModelSheetSpec): ModelSheetSpec {
  return {
    id: member(spec.id, ["romance-lead", "action-hero", "school-boy", "fantasy-sidekick"]),
    nameKo: driftText(spec.nameKo), nameEn: driftText(spec.nameEn),
    roleSummaryKo: driftText(spec.roleSummaryKo), roleSummaryEn: driftText(spec.roleSummaryEn),
    ...metrics(spec), hairPartSide: member(spec.hairPartSide, HAIR), requiredAccessories: accessories(spec.requiredAccessories),
  };
}
export function validateDriftCut(cut: EpisodeCutMetric): EpisodeCutMetric {
  const cutId = driftText(cut.cutId);
  if (!cutId.trim() || !Number.isInteger(cut.cutNumber)) throw new RangeError("컷 ID·번호가 유효하지 않습니다.");
  return {
    cutId, cutNumber: driftNumber(cut.cutNumber, 1, 60), sceneTagKo: driftText(cut.sceneTagKo), sceneTagEn: driftText(cut.sceneTagEn),
    cameraShot: member(cut.cameraShot, ["closeup", "bust", "half", "full"]), ...metrics(cut),
    hairPartSide: member(cut.hairPartSide, HAIR), presentAccessories: accessories(cut.presentAccessories),
  };
}
export function validateDriftCuts(cuts: readonly EpisodeCutMetric[]): readonly EpisodeCutMetric[] {
  if (!Array.isArray(cuts) || cuts.length > 60) throw new RangeError("숫자 비교 예제는 최대 60컷을 지원합니다. 원본 컷은 잘라내지 않습니다.");
  const result = cuts.map(validateDriftCut);
  if (new Set(result.map(cut => cut.cutId)).size !== result.length || new Set(result.map(cut => cut.cutNumber)).size !== result.length) throw new RangeError("컷 ID 또는 번호가 중복됩니다.");
  return result;
}
export function assertDriftSession(session: DriftCoachSessionState): void {
  const baseline = validateDriftCuts(session.baselineCuts); const working = validateDriftCuts(session.workingCuts);
  if (!baseline.length || baseline.length !== working.length || !working.some(cut => cut.cutNumber === session.selectedCutNumber)
    || working.some(cut => !baseline.some(original => original.cutId === cut.cutId && original.cutNumber === cut.cutNumber))) throw new RangeError("세션의 원본·작업 컷 연결이 잘못되었습니다.");
  member(session.archetypeId, ["romance-lead", "action-hero", "school-boy", "fantasy-sidekick"]);
  if (!Number.isSafeInteger(session.revision) || session.revision < 0 || session.revision > Number.MAX_SAFE_INTEGER
    || !Array.isArray(session.approvalHistory) || session.approvalHistory.length > 40) throw new RangeError("예제 변경 이력이 지원 범위를 벗어났습니다.");
  const ids = new Set<string>();
  for (const entry of session.approvalHistory) {
    const id = driftText(entry.entryId);
    if (!id.trim() || ids.has(id) || !Number.isSafeInteger(entry.revision) || entry.revision < 1 || entry.revision > session.revision) throw new RangeError("예제 이력 ID·순서가 잘못되었습니다.");
    ids.add(id);
    member(entry.action, ["apply", "revert", "revert-all"]);
    if (entry.strategy !== null) member(entry.strategy, STRATEGIES);
    if (entry.cutNumber !== null && !working.some(cut => cut.cutNumber === entry.cutNumber)) throw new RangeError("이력의 컷이 세션에 없습니다.");
    driftNumber(entry.scoreBefore, 0, 100); driftNumber(entry.scoreAfter, 0, 100); driftText(entry.summaryKo); driftText(entry.summaryEn);
  }
  const entries = Object.entries(session.appliedFixByCut);
  if (entries.length > 60) throw new RangeError("예제 보정 목록이 지원 범위를 벗어났습니다.");
  for (const [key, fix] of entries) {
    const current = working.find(cut => String(cut.cutNumber) === key);
    const original = validateDriftCut(fix.originalCut); const applied = validateDriftCut(fix.appliedCut);
    if (!current || fix.cutNumber !== current.cutNumber || original.cutId !== current.cutId || applied.cutId !== current.cutId
      || original.cutNumber !== current.cutNumber || applied.cutNumber !== current.cutNumber
      || !Number.isSafeInteger(fix.revision) || fix.revision < 1 || fix.revision > session.revision) throw new RangeError("보정 기록의 컷 연결이 잘못되었습니다.");
    member(fix.strategy, STRATEGIES); driftText(fix.candidateId); driftText(fix.titleKo); driftText(fix.titleEn);
    driftNumber(fix.scoreBefore, 0, 100); driftNumber(fix.scoreAfter, 0, 100);
  }
}
export function nextDriftRevision(session: DriftCoachSessionState): number {
  const revision = session.revision + 1;
  if (!Number.isSafeInteger(revision)) throw new RangeError("예제 이력 번호가 안전 정수 한도에 도달했습니다. 원본은 유지됩니다.");
  return revision;
}
export function assertDriftPatch(patch: CutMetricPatch): void {
  for (const key of Object.keys(METRIC_BOUNDS) as DriftMetricKey[]) {
    const value = patch[key];
    if (value !== undefined && !Number.isFinite(value)) throw new RangeError("비율 조정은 유한 수치여야 합니다. 원본은 유지됩니다.");
  }
  if (patch.hairPartSide !== undefined) member(patch.hairPartSide, HAIR);
  if (patch.presentAccessories !== undefined) accessories(patch.presentAccessories, false);
}
