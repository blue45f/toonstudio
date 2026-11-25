import type { AdvisorSlotKey, OneLineOrchestratorSession, SlotSelectionMap } from "./oneline-orchestrator-engine";

export const MAX_CHAIN_DIALOGUE_LENGTH = 4096;
const SLOT_KEYS: readonly AdvisorSlotKey[] = ["expression", "lighting", "camera", "balloon"];

/** 원문 대사를 자르지 않고 계산 가능한 입력만 받는다. */
export function assertChainDialogue(dialogue: string): void {
  if (typeof dialogue !== "string" || dialogue.length > MAX_CHAIN_DIALOGUE_LENGTH) {
    throw new RangeError("대사는 4096자 이내여야 합니다.");
  }
  if (dialogue.split(/\r?\n|\s+\/\s+/u).filter((part) => part.trim()).length > 2) {
    throw new RangeError("한 번에 대사 두 구간까지 계산합니다. 원문은 나누어 입력해 주세요.");
  }
}

export function assertChainSlot(slot: AdvisorSlotKey): void {
  if (!SLOT_KEYS.includes(slot)) throw new RangeError("지원하지 않는 연출 항목입니다.");
}

export function assertChainSelection(selection: SlotSelectionMap): void {
  for (const slot of SLOT_KEYS) {
    if (![0, 1, 2].includes(selection[slot])) throw new RangeError("후보 번호는 0~2여야 합니다.");
  }
}

/** JSON의 null 치환·순환 참조·과대 입력이 내보내기 결과를 손상시키지 않게 한다. */
export function assertChainValues(value: unknown): void {
  const ancestors = new WeakSet<object>();
  let nodes = 0;
  let textLength = 0;
  function visit(item: unknown, depth: number): void {
    nodes += 1;
    if (nodes > 500_000 || depth > 32) throw new RangeError("연출 데이터의 계산 상한을 넘었습니다.");
    if (typeof item === "number" && (!Number.isFinite(item) || Math.abs(item) > 1_000_000_000)) {
      throw new RangeError("유효한 범위의 유한 수치가 필요합니다.");
    }
    if (typeof item === "string") {
      textLength += item.length;
      if (item.length > 32_768 || textLength > 2_000_000) throw new RangeError("연출 문자열 상한을 넘었습니다.");
    }
    if (typeof item === "function" || typeof item === "symbol" || typeof item === "bigint") {
      throw new TypeError("직렬화할 수 없는 연출 값입니다.");
    }
    if (typeof item !== "object" || item === null) return;
    if (ancestors.has(item)) throw new TypeError("순환 참조가 있는 연출 데이터입니다.");
    if (Array.isArray(item) && item.length > 4096) throw new RangeError("연출 배열 상한을 넘었습니다.");
    const entries = Object.entries(item);
    if (!Array.isArray(item) && entries.length > 128) throw new RangeError("연출 필드 상한을 넘었습니다.");
    ancestors.add(item);
    for (const [, child] of entries) visit(child, depth + 1);
    ancestors.delete(item);
  }
  visit(value, 0);
}

export function assertChainSession(session: OneLineOrchestratorSession): void {
  assertChainValues(session);
  assertChainSelection(session.draftSelection);
  if (!["idle", "previewing", "applied", "partial-applied", "reverted"].includes(session.status)
      || typeof session.isPreviewing !== "boolean" || !Array.isArray(session.history) || session.history.length > 30) {
    throw new TypeError("유효하지 않은 연출 세션입니다.");
  }
  let count = 0;
  for (const slot of SLOT_KEYS) {
    const record = session.applied[slot];
    if (record !== null) {
      if (![0, 1, 2].includes(record.index) || !record.proposal) throw new TypeError("유효하지 않은 적용 기록입니다.");
      count += 1;
    }
  }
  if (session.appliedSlotCount !== count || session.canRevertAll !== (count > 0)) {
    throw new TypeError("적용 항목 수와 세션 상태가 일치하지 않습니다.");
  }
}
