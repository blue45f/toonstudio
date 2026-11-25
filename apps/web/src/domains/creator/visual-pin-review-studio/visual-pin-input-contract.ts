import type { BatonStageId, ExternalBridgeManifestOptions, ReviewPin, ReviewStampId, VisualPinReviewState } from "./visual-pin-review-engine";

export const MAX_REVIEW_PINS = 256;
export const MAX_REVIEW_HISTORY = 256;
export const MAX_REVIEW_COMMENT = 8192;
export function assertReviewText(value: string, max = MAX_REVIEW_COMMENT): void {
  if (typeof value !== "string" || value.length > max) throw new RangeError("검토 예제 텍스트 상한을 넘었습니다.");
}
function id(value: string): void {
  assertReviewText(value, 256);
  if (!value.trim()) throw new TypeError("비어 있지 않은 식별자가 필요합니다.");
}
export function assertReviewTimestamp(value: string): void {
  assertReviewText(value, 64);
  if (!Number.isFinite(Date.parse(value))) throw new RangeError("유효한 시각 문자열이 필요합니다.");
}
export function assertReviewFinite(value: number): void {
  if (!Number.isFinite(value)) throw new RangeError("좌표·비율은 유한한 수여야 합니다.");
}
export function assertReviewPins(pins: readonly ReviewPin[], stamps: readonly ReviewStampId[], stages: readonly BatonStageId[]): void {
  if (!Array.isArray(pins) || pins.length > MAX_REVIEW_PINS) throw new RangeError("핀은 최대 256개입니다.");
  const ids = new Set<string>();
  const numbers = new Set<number>();
  for (const pin of pins) {
    id(pin.id); id(pin.cutId);
    if (ids.has(pin.id) || !Number.isSafeInteger(pin.pinNumber) || pin.pinNumber < 1 || numbers.has(pin.pinNumber)) throw new TypeError("핀 ID와 번호는 고유해야 합니다.");
    ids.add(pin.id); numbers.add(pin.pinNumber);
    if (!stamps.includes(pin.stampId) || !stages.includes(pin.stageId) || !["open", "in-progress", "resolved"].includes(pin.status)) throw new TypeError("지원하지 않는 핀 상태입니다.");
    assertReviewFinite(pin.xPct); assertReviewFinite(pin.yPct);
    if (pin.xPct < 0 || pin.xPct > 100 || pin.yPct < 0 || pin.yPct > 100) throw new RangeError("핀 좌표는 0~100 범위여야 합니다.");
    assertReviewText(pin.comment); assertReviewText(pin.assignee, 1024);
    assertReviewTimestamp(pin.createdAtIso); assertReviewTimestamp(pin.updatedAtIso);
  }
}
export function assertVisualReviewState(state: VisualPinReviewState, stamps: readonly ReviewStampId[], stages: readonly BatonStageId[]): void {
  assertReviewPins(state.pins, stamps, stages);
  assertReviewText(state.projectTitle, 4096); assertReviewText(state.episodeLabel, 4096); id(state.activeCutId);
  if (!stages.includes(state.currentStageId)) throw new TypeError("지원하지 않는 공정입니다.");
  if (!Number.isSafeInteger(state.nextPinNumber) || state.nextPinNumber < 1) throw new RangeError("다음 핀 번호는 안전한 양의 정수여야 합니다.");
  assertReviewFinite(state.beforeAfterSplitPct);
  if (state.beforeAfterSplitPct < 0 || state.beforeAfterSplitPct > 100) throw new RangeError("비교 비율은 0~100이어야 합니다.");
  if (!Array.isArray(state.history) || state.history.length > MAX_REVIEW_HISTORY) throw new RangeError("공정 이력은 최대 256개입니다.");
  const ids = new Set<string>();
  for (const record of state.history) {
    id(record.id);
    if (ids.has(record.id) || !stages.includes(record.fromStageId) || !stages.includes(record.toStageId)
      || !["advance", "rewind"].includes(record.direction) || typeof record.forced !== "boolean") throw new TypeError("유효하고 고유한 공정 이력이 필요합니다.");
    ids.add(record.id);
    assertReviewText(record.actorName, 1024); assertReviewText(record.summaryKo, 4096); assertReviewText(record.summaryEn, 4096); assertReviewTimestamp(record.timestampIso);
  }
}
export function assertBridgeOptions(options?: ExternalBridgeManifestOptions): void {
  if (options?.scope !== undefined && !["episode", "active-cut"].includes(options.scope)) throw new TypeError("지원하지 않는 내보내기 범위입니다.");
  if (options?.locale !== undefined && !["ko", "en"].includes(options.locale)) throw new TypeError("지원하지 않는 언어입니다.");
  if (options?.generatedAtIso !== undefined) assertReviewTimestamp(options.generatedAtIso);
}
export function nextReviewHistoryId(state: VisualPinReviewState): string {
  if (state.history.length >= MAX_REVIEW_HISTORY) throw new RangeError("공정 이력 상한에 도달했습니다.");
  const ids = new Set(state.history.map((record) => record.id));
  let number = state.history.length + 1;
  while (ids.has(`hist-${number}`)) number += 1;
  return `hist-${number}`;
}
