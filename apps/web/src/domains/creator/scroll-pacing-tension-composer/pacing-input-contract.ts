import type { EditableCutMetricsPatch, ScrollPacingCut, ScrollPacingProposal, ScrollPacingSessionState } from "./scroll-pacing-composer-engine";

export const MAX_PACING_CUTS = 60;
export const MAX_PACING_UNDO_STEPS = 24;
const STRATEGIES = ["tension-gutter-expansion", "closeup-impact-boost", "cliffhanger-surge"] as const;
const SHOTS = ["extreme-wide", "wide", "medium", "close-up", "extreme-close-up"] as const;
const NUMERIC_KEYS = ["gutterPx", "panelHeightPx", "dialogueChars", "tensionScore"] as const;
export function pacingText(value: string, max = 4096): string {
  if (typeof value !== "string" || value.length > max) throw new RangeError("리듬 예제의 글자가 지원 범위를 벗어났습니다. 원문은 유지됩니다.");
  return value;
}
function member<T extends string>(value: T, options: readonly T[]): T {
  if (!options.includes(value)) throw new RangeError("지원하지 않는 리듬 예제 항목입니다.");
  return value;
}
const bounded = (value: number, min: number, max: number, fallback: number): number => Math.round(Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback);

/** 기존 감사 수치 클램핑을 유지하며 원문·외부 객체는 수정하지 않는다. */
export function normalizePacingCuts(cuts: readonly ScrollPacingCut[]): readonly ScrollPacingCut[] {
  if (!Array.isArray(cuts) || cuts.length > MAX_PACING_CUTS) throw new RangeError("리듬 계산 예제는 순서대로 배치한 1~60컷 구간을 지원합니다. 입력을 잘라내지 않습니다.");
  const ids = new Set<string>();
  return cuts.map((cut, index) => {
    const cutId = pacingText(cut.cutId, 512);
    if (!cutId.trim() || ids.has(cutId) || cut.cutNumber !== index + 1) throw new RangeError("컷 ID가 비었거나 중복됐거나 컷 번호가 1부터 순서대로 이어지지 않습니다.");
    ids.add(cutId);
    return {
      cutId, cutNumber: cut.cutNumber, sceneLabelKo: pacingText(cut.sceneLabelKo), sceneLabelEn: pacingText(cut.sceneLabelEn),
      beatRole: member(cut.beatRole, ["hook", "setup", "build", "breather", "climax", "cliffhanger"]),
      gutterPx: bounded(cut.gutterPx, 40, 640, 120), panelHeightPx: bounded(cut.panelHeightPx, 320, 1400, 600),
      shotScale: member(cut.shotScale, SHOTS), dialogueChars: bounded(cut.dialogueChars, 0, 180, 0), tensionScore: bounded(cut.tensionScore, 0, 100, 50),
    };
  });
}
/** 제안이 어떤 원문·수동 설정에서 계산됐는지 충돌 없는 튜플로 묶는다. */
export function pacingCutsKey(cuts: readonly ScrollPacingCut[]): string {
  return JSON.stringify(normalizePacingCuts(cuts).map(cut => [cut.cutId, cut.cutNumber, cut.sceneLabelKo, cut.sceneLabelEn, cut.beatRole,
    cut.gutterPx, cut.panelHeightPx, cut.shotScale, cut.dialogueChars, cut.tensionScore]));
}
function strictCuts(cuts: readonly ScrollPacingCut[]): readonly ScrollPacingCut[] {
  const normalized = normalizePacingCuts(cuts);
  if (normalized.some((cut, index) => NUMERIC_KEYS.some(key => cut[key] !== cuts[index]?.[key]))) throw new RangeError("세션·제안 수치는 계산 예제의 유한한 정수 범위여야 합니다.");
  return normalized;
}
function sameIdentity(before: readonly ScrollPacingCut[], after: readonly ScrollPacingCut[]): boolean {
  return before.length === after.length && before.every((cut, index) => {
    const next = after[index];
    return next && cut.cutId === next.cutId && cut.cutNumber === next.cutNumber && cut.sceneLabelKo === next.sceneLabelKo
      && cut.sceneLabelEn === next.sceneLabelEn && cut.beatRole === next.beatRole;
  });
}
export function assertPacingSession(session: ScrollPacingSessionState): void {
  const baseline = strictCuts(session.baselineCuts); const working = strictCuts(session.workingCuts);
  if (!working.length || !sameIdentity(baseline, working) || !working.some(cut => cut.cutNumber === session.selectedCutNumber)) throw new RangeError("리듬 세션의 원본·작업 컷 연결이 잘못되었습니다.");
  member(session.presetId, ["romance-ep1", "action-ep12", "thriller-twist", "comedy-fourbeat"]);
  if (!Array.isArray(session.undoStack) || session.undoStack.length > MAX_PACING_UNDO_STEPS || !Array.isArray(session.history) || session.history.length > 24
    || !Number.isSafeInteger(session.revision) || session.revision < 0) throw new RangeError("리듬 예제의 이력·원복 목록이 지원 범위를 벗어났습니다.");
  for (const cuts of session.undoStack) if (!sameIdentity(baseline, strictCuts(cuts))) throw new RangeError("원복 대상의 원문 컷이 바뀌었습니다.");
  if (!Array.isArray(session.appliedStrategyIds) || session.appliedStrategyIds.length > 3 || new Set(session.appliedStrategyIds).size !== session.appliedStrategyIds.length) throw new RangeError("전략 선택 기록이 잘못되었습니다.");
  for (const id of session.appliedStrategyIds) member(id, STRATEGIES);
  const ids = new Set<string>();
  for (const entry of session.history) {
    const id = pacingText(entry.entryId, 256);
    if (!id.trim() || ids.has(id) || !Number.isSafeInteger(entry.revision) || entry.revision < 1 || entry.revision > session.revision) throw new RangeError("리듬 이력 ID·순서가 잘못되었습니다.");
    ids.add(id); member(entry.action, ["apply", "edit", "revert-last", "revert-all"]);
    pacingText(entry.summaryKo); pacingText(entry.summaryEn);
  }
}
export function assertPacingProposal(session: ScrollPacingSessionState, proposal: ScrollPacingProposal): void {
  const strategy = member(proposal.strategyId, STRATEGIES);
  if (proposal.sourceCutsKey !== pacingCutsKey(session.workingCuts) || !sameIdentity(session.workingCuts, strictCuts(proposal.proposedCuts))
    || ![1, 2, 3].includes(proposal.rank) || proposal.id !== `proposal-${proposal.rank}-${strategy}`) throw new RangeError("제안이 현재 회차·원문·수동 설정에서 계산되지 않았습니다. 다시 계산해 주세요.");
  pacingText(proposal.titleKo, 256); pacingText(proposal.titleEn, 256);
  if (!Array.isArray(proposal.affectedCutNumbers) || proposal.affectedCutNumbers.length > MAX_PACING_CUTS
    || new Set(proposal.affectedCutNumbers).size !== proposal.affectedCutNumbers.length
    || proposal.affectedCutNumbers.some(number => !session.workingCuts.some(cut => cut.cutNumber === number))
    || !Number.isFinite(proposal.scoreGain) || !Number.isFinite(proposal.cliffhangerGain)) throw new RangeError("제안의 컷 목록·점수 변화가 잘못되었습니다.");
}
export function appendPacingUndo(session: ScrollPacingSessionState): readonly (readonly ScrollPacingCut[])[] {
  return [...session.undoStack.slice(-(MAX_PACING_UNDO_STEPS - 1)), normalizePacingCuts(session.workingCuts)];
}
export function assertPacingPatch(patch: EditableCutMetricsPatch): void {
  if (patch.shotScale !== undefined) member(patch.shotScale, SHOTS);
}
