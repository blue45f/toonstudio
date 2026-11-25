import type { AdaptiveCalmConfigSnapshot, AdaptiveCalmSessionState, AssistantStackInput, AssistantSuggestion, DeviceFeatureFlags, GestureMacroBinding, SafeDegradationId, StudioContextId } from "./adaptive-calm-stack-engine";

const CONTEXTS = ["rough-conti", "line-inking", "color-lighting", "lettering-sfx", "qa-export"] as const;
const TIERS = ["flagship-desktop", "apple-silicon-laptop", "ipad-pro-tablet", "entry-mobile-4gb"] as const;
const GUARDS = ["pause-bg3d-viewport", "lower-impasto-lod", "throttle-background-precache", "tile-4k-stream-cap"] as const;
const TRIGGERS = ["two-finger-tap", "three-finger-swipe", "pen-double-tap", "four-finger-pinch"] as const;
const ACTIONS = ["undo-stroke", "redo-stroke", "toggle-focus-mode", "swap-eraser-gpen", "overview-cut-rhythm", "toggle-assistant-drawer", "quick-save-snapshot", "flip-canvas-horizontal"] as const;
export const MAX_CALM_SUGGESTIONS = 64;
export function calmText(value: string, max = 4096): string {
  if (typeof value !== "string" || value.length > max) throw new RangeError("Calm 예제의 글자가 지원 범위를 벗어났습니다. 원문은 유지됩니다.");
  return value;
}
export function calmMember<T extends string>(value: T, options: readonly T[]): T {
  if (!options.includes(value)) throw new RangeError("지원하지 않는 Calm 예제 항목입니다.");
  return value;
}
export function assertCalmContext(context: StudioContextId): void { calmMember(context, CONTEXTS); }
function bool(value: boolean): boolean {
  if (typeof value !== "boolean") throw new TypeError("예제 기능 설정은 true 또는 false여야 합니다.");
  return value;
}
export function validateCalmFeatures(value: DeviceFeatureFlags): DeviceFeatureFlags {
  return { canvas4k: bool(value.canvas4k), bg3dViewport: bool(value.bg3dViewport), impastoTexture: bool(value.impastoTexture), localAiAssist: bool(value.localAiAssist) };
}
export function validateCalmGuards(ids: readonly SafeDegradationId[]): readonly SafeDegradationId[] {
  if (!Array.isArray(ids) || ids.length > 4 || new Set(ids).size !== ids.length) throw new RangeError("예제 가드 ID가 중복되거나 지원 한도를 넘었습니다.");
  return ids.map(id => calmMember(id, GUARDS));
}
/** 같은 동작을 여러 제스처에 배정하는 기존 경고 계약은 유지한다. 트리거 자체는 고유해야 한다. */
export function validateCalmGestures(macros: readonly GestureMacroBinding[]): readonly GestureMacroBinding[] {
  if (!Array.isArray(macros) || macros.length > 4 || new Set(macros.map(macro => macro.triggerId)).size !== macros.length) throw new RangeError("예제 제스처 트리거가 중복되거나 지원 한도를 넘었습니다.");
  return macros.map(macro => ({ triggerId: calmMember(macro.triggerId, TRIGGERS), actionId: calmMember(macro.actionId, ACTIONS), enabled: bool(macro.enabled),
    triggerLabelKo: calmText(macro.triggerLabelKo, 256), triggerLabelEn: calmText(macro.triggerLabelEn, 256) }));
}
/** 알려진 설정만 깊이 복사해 updater의 실패나 외부 메타데이터가 원본에 번지지 않게 한다. */
export function validateCalmSnapshot(snapshot: AdaptiveCalmConfigSnapshot): AdaptiveCalmConfigSnapshot {
  const gestures = validateCalmGestures(snapshot.gestures);
  if (gestures.length !== 4) throw new RangeError("구성 예제에는 고유한 제스처 4개가 필요합니다.");
  return { contextId: calmMember(snapshot.contextId, CONTEXTS), focusBoost: bool(snapshot.focusBoost), deviceTierId: calmMember(snapshot.deviceTierId, TIERS),
    features: validateCalmFeatures(snapshot.features), appliedDegradationIds: validateCalmGuards(snapshot.appliedDegradationIds), gestures };
}
export function assertCalmSession(session: AdaptiveCalmSessionState): void {
  validateCalmSnapshot(session.baseline); validateCalmSnapshot(session.working);
  if (session.applied !== null) validateCalmSnapshot(session.applied);
  calmMember(session.status, ["idle", "applied", "reverted"]);
  if (!Number.isSafeInteger(session.historyCount) || session.historyCount < 0 || (session.status === "applied" && session.applied === null)) throw new RangeError("예제 상태·이력 번호가 잘못되었습니다.");
}
export function nextCalmHistory(session: AdaptiveCalmSessionState): number {
  const next = session.historyCount + 1;
  if (!Number.isSafeInteger(next)) throw new RangeError("예제 이력 번호가 안전 정수 한도에 도달했습니다. 원본은 유지됩니다.");
  return next;
}
function suggestion(value: AssistantSuggestion): AssistantSuggestion {
  const id = calmText(value.id, 256);
  if (!id.trim() || !Number.isFinite(value.confidence) || value.confidence < 0 || value.confidence > 1) throw new RangeError("제안 ID 또는 신뢰도 입력이 잘못되었습니다.");
  return { id, domain: calmMember(value.domain, ["expression", "lighting", "camera", "balloon", "modelsheet", "style"]),
    severity: calmMember(value.severity, ["critical", "warning", "advisory"]), conflictGroup: calmMember(value.conflictGroup, ["canvas-framing", "character-face", "lighting-color", "dialogue-layout", "continuity-spec"]),
    confidence: value.confidence, titleKo: calmText(value.titleKo), titleEn: calmText(value.titleEn),
    detailKo: calmText(value.detailKo), detailEn: calmText(value.detailEn), cutLabel: calmText(value.cutLabel) };
}
export function validateCalmSuggestions(input: AssistantStackInput, defaults: readonly AssistantSuggestion[]): readonly AssistantSuggestion[] {
  assertCalmContext(input.contextId);
  const values = input.suggestions ?? defaults;
  if (!Array.isArray(values) || values.length > MAX_CALM_SUGGESTIONS) throw new RangeError("스태킹 예제는 최대 64개 제안을 지원합니다. 입력을 잘라내지 않습니다.");
  const result = values.map(suggestion);
  if (new Set(result.map(value => value.id)).size !== result.length) throw new RangeError("제안 ID가 중복됩니다.");
  const dismissed = input.dismissedIds ?? [];
  if (!Array.isArray(dismissed) || dismissed.length > MAX_CALM_SUGGESTIONS || new Set(dismissed).size !== dismissed.length) throw new RangeError("보류 목록이 지원 범위를 벗어났습니다.");
  for (const id of dismissed) if (!calmText(id, 256).trim()) throw new RangeError("보류 ID가 비어 있습니다.");
  return result;
}
