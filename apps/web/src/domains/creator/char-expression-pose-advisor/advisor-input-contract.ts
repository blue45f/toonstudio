import type { AdvisorApplyState, CharacterAdjustmentProposal, CharacterAdvisorRecommendationBundle, CharacterCutSnapshot, VrmBlendShapeWeights } from "./char-expression-pose-engine";

export const MAX_ADVISOR_DIALOGUE = 8192;
export const MAX_ADVISOR_HISTORY = 256;
export interface AdvisorGeometryRules {
  readonly emotions: readonly string[]; readonly visemes: readonly string[];
  readonly poses: readonly string[]; readonly hands: readonly string[];
  readonly weights: readonly (keyof VrmBlendShapeWeights)[];
}
export function advisorText(value: string, max = 4096): void {
  if (typeof value !== "string" || value.length > max) throw new RangeError("조언 예제 텍스트 상한을 넘었습니다.");
}
function bounded(value: number, min: number, max: number): void {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError("예제 수치는 유한한 허용 범위에 있어야 합니다.");
}
function identifier(value: string | null): void {
  if (value === null) return;
  advisorText(value, 256);
  if (!value.trim()) throw new TypeError("비어 있지 않은 식별자가 필요합니다.");
}
function geometry(value: CharacterCutSnapshot | CharacterAdjustmentProposal, rules: AdvisorGeometryRules): void {
  if (!rules.emotions.includes(value.emotion) || !rules.visemes.includes(value.viseme)
    || !rules.poses.includes(value.upperBodyPoseId) || !rules.hands.includes(value.handGestureId)) throw new TypeError("지원하지 않는 표정·포즈 enum입니다.");
  if (!value.blendShapes || Object.keys(value.blendShapes).length !== rules.weights.length) throw new TypeError("가중치 채널이 맞지 않습니다.");
  for (const key of rules.weights) bounded(value.blendShapes[key], 0, 1);
  bounded(value.eyebrowTiltDeg, -90, 90); bounded(value.eyebrowLift, -1, 1);
  bounded(value.gazeYaw, -90, 90); bounded(value.gazePitch, -90, 90);
}
export function assertAdvisorSnapshot(value: CharacterCutSnapshot, rules: AdvisorGeometryRules): void {
  geometry(value, rules); advisorText(value.labelKo, 2048); advisorText(value.labelEn, 2048);
}
export function assertAdvisorProposal(value: CharacterAdjustmentProposal, rules: AdvisorGeometryRules): void {
  geometry(value, rules); advisorText(value.id, 256); identifier(value.id); bounded(value.confidence, 0, 1);
  if (![1, 2, 3].includes(value.rank) || !["canonical", "archetype-nuance", "dramatic-contrast", "continuity-bridge"].includes(value.variant)
    || value.requiresAuthorApproval !== true) throw new TypeError("지원하지 않는 제안 계약입니다.");
  advisorText(value.titleKo, 1024); advisorText(value.titleEn, 1024); advisorText(value.reasonKo); advisorText(value.reasonEn);
}
export function assertAdvisorSession(state: AdvisorApplyState, rules: AdvisorGeometryRules): void {
  for (const value of [state.baseline, state.current, state.previousCut]) assertAdvisorSnapshot(value, rules);
  if (!Array.isArray(state.history) || state.history.length > MAX_ADVISOR_HISTORY) throw new RangeError("예제 이력 상한은 256개입니다.");
  if (!["idle", "previewing", "applied", "reverted"].includes(state.status) || typeof state.canRevert !== "boolean") throw new TypeError("지원하지 않는 세션 상태입니다.");
  identifier(state.previewingProposalId); identifier(state.appliedProposalId);
  if (state.canRevert && state.history.length >= MAX_ADVISOR_HISTORY) throw new RangeError("되돌리기 이력 여유가 없는 외부 상태입니다.");
  state.history.forEach((record, index) => {
    if (record.step !== index + 1 || !["apply", "revert"].includes(record.action)) throw new TypeError("예제 이력 순서·식별자가 맞지 않습니다.");
    identifier(record.proposalId); advisorText(record.labelKo, 2048);
  });
}
/** 직렬화 시 비유한 수·과대 배열·순환·실행 가능한 객체를 허용하지 않는다. */
export function assertAdvisorJson(value: unknown): void {
  const ancestors = new WeakSet<object>();
  let count = 0;
  function visit(item: unknown, depth: number): void {
    count += 1;
    if (count > 50000 || depth > 20) throw new RangeError("조언 JSON 크기·깊이 상한을 넘었습니다.");
    if (typeof item === "number") bounded(item, -1e9, 1e9);
    if (typeof item === "string") advisorText(item, MAX_ADVISOR_DIALOGUE);
    if (typeof item === "function" || typeof item === "symbol" || typeof item === "bigint") throw new TypeError("실행 가능한 값은 직렬화하지 않습니다.");
    if (!item || typeof item !== "object") return;
    if (ancestors.has(item)) throw new TypeError("순환 객체는 직렬화하지 않습니다.");
    ancestors.add(item);
    const values = Array.isArray(item) ? item : Object.values(item);
    if (values.length > 256) throw new RangeError("조언 JSON 배열 상한을 넘었습니다.");
    for (const child of values) visit(child, depth + 1);
    ancestors.delete(item);
  }
  visit(value, 0);
}
function sameValue(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (Array.isArray(actual)) return Array.isArray(expected) && actual.length === expected.length && actual.every((value, index) => sameValue(value, expected[index]));
  if (actual === null || expected === null || typeof actual !== "object" || typeof expected !== "object") return false;
  const keys = Object.keys(actual);
  return keys.length === Object.keys(expected).length && keys.every((key) => Object.hasOwn(expected, key) && sameValue(Reflect.get(actual, key), Reflect.get(expected, key)));
}
export function assertAdvisorBundle(actual: CharacterAdvisorRecommendationBundle, expected: CharacterAdvisorRecommendationBundle, rules: AdvisorGeometryRules): void {
  if (!Array.isArray(actual.proposals) || actual.proposals.length !== 3 || new Set(actual.proposals.map((proposal) => proposal.id)).size !== 3) throw new TypeError("고유한 Top-3 제안이 필요합니다.");
  for (const proposal of actual.proposals) assertAdvisorProposal(proposal, rules);
  if (!sameValue(actual, expected)) throw new TypeError("현재 규칙 모델과 맞지 않는 외부 분석 결과입니다.");
}
