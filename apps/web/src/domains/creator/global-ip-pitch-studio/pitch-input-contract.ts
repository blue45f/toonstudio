import type { PitchBibleDeck, PitchBibleInput, PitchBibleReadinessAudit, SeasonArcBlock } from "./global-ip-pitch-engine";
import { auditPitchBibleReadiness, buildPitchBibleDeck } from "./global-ip-pitch-engine";

export const MAX_PITCH_AMOUNT = 1_000_000_000_000;

/** 원문을 고치지 않고 목록·문자열·숫자·순환 구조를 검증한다. */
export function assertPitchSnapshot(value: unknown, input = false): void {
  const ancestors = new WeakSet<object>(); let nodes = 0; let textLength = 0;
  function visit(item: unknown, depth: number): void {
    nodes += 1;
    if (nodes > 100000 || depth > 20) throw new RangeError("피치 문서 크기·깊이 상한을 넘었습니다.");
    if (typeof item === "number" && (!Number.isFinite(item) || Math.abs(item) > MAX_PITCH_AMOUNT)) throw new RangeError("피치 수치는 유한한 예제 범위여야 합니다.");
    if (typeof item === "string") {
      textLength += item.length;
      if (item.length > (input ? 8192 : 65536) || textLength > (input ? 262144 : 2000000)) throw new RangeError("피치 원문 상한을 넘었습니다.");
    }
    if (!item || typeof item !== "object") return;
    if (ancestors.has(item)) throw new RangeError("순환 피치 문서는 지원하지 않습니다.");
    ancestors.add(item);
    const values = Array.isArray(item) ? item : Object.values(item);
    if (Array.isArray(item)) {
      if (item.length > (input ? 64 : 1024)) throw new RangeError("피치 입력 목록 상한은 64개입니다.");
      const ids = new Set<string>();
      for (const row of item) {
        if (!row || typeof row !== "object" || !Object.hasOwn(row, "id")) continue;
        const id: unknown = Reflect.get(row, "id");
        if (typeof id !== "string" || !id.trim() || id.length > 256 || ids.has(id)) throw new RangeError("피치 목록 ID는 비어 있지 않고 고유해야 합니다.");
        ids.add(id);
      }
    }
    for (const child of values) visit(child, depth + 1);
    ancestors.delete(item);
  }
  visit(value, 0);
}

export function assertSeasonBlocks(blocks: readonly SeasonArcBlock[]): void {
  assertPitchSnapshot(blocks, true);
  for (const block of blocks) {
    if ([block.episodeCount, block.chapterStart, block.chapterEnd].some((number) => !Number.isInteger(number) || number < 0 || number > 10000)) throw new RangeError("시즌 수치는 0~10000 범위의 정수여야 합니다.");
  }
}

function matches(actual: unknown, expected: unknown): boolean {
  if (Object.is(actual, expected)) return true;
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((value, index) => matches(actual[index], value));
  if (!actual || !expected || typeof actual !== "object" || typeof expected !== "object" || Array.isArray(actual)) return false;
  const keys = Object.keys(expected);
  return Object.keys(actual).length === keys.length && keys.every((key) => matches(Reflect.get(actual, key), Reflect.get(expected, key)));
}

export function assertPitchExport(deck: PitchBibleDeck, audit?: PitchBibleReadinessAudit): void {
  assertPitchSnapshot(deck);
  const model = buildPitchBibleDeck(deck.input);
  if (!matches(deck, model)) throw new RangeError("외부 덱이 최신 입력의 계산 결과와 일치하지 않습니다.");
  if (audit) {
    assertPitchSnapshot(audit);
    if (!matches(audit, auditPitchBibleReadiness(model))) throw new RangeError("외부 감사가 최신 덱과 일치하지 않습니다.");
  }
}

export function assertPitchInput(input: PitchBibleInput): void {
  if (input.secondaryRights.tracks.length > 64) throw new RangeError("피치 입력 목록 상한은 64개입니다.");
  // 금액은 기존 생성기의 NaN/Infinity→0 정규화를 유지하며, 다른 입력은 그대로 검증한다.
  assertPitchSnapshot({
    ...input,
    targetPositioning: { ...input.targetPositioning, addressableRangeEstimate: { ...input.targetPositioning.addressableRangeEstimate, minAmount: 0, maxAmount: 0 } },
    secondaryRights: { ...input.secondaryRights, tracks: input.secondaryRights.tracks.map((track) => ({ ...track, budgetRangeEstimate: { ...track.budgetRangeEstimate, minAmount: 0, maxAmount: 0 } })) },
    productionSchedule: { ...input.productionSchedule, totalBudgetEstimate: { ...input.productionSchedule.totalBudgetEstimate, minAmount: 0, maxAmount: 0 } },
  }, true);
  assertSeasonBlocks(input.seasonArc.blocks);
}
