import type { HumanInkLedgerEvent, HumanInkMerkleLedger, MerkleInclusionProof } from "./human-ink-ledger-engine";

export const MAX_LEDGER_EVENTS = 256;
export const MAX_TELEMETRY_SAMPLES = 4096;
export const MAX_LEDGER_TEXT_UNITS = 262_144;
export const MAX_NOTE_TEXT_UNITS = 1_000_000;
const KINDS = ["human-pen-stroke", "procedural-cc0-asset", "3d-bg-placement", "non-destructive-filter", "unverified-external-scan"];
const LICENSES = ["human-ink-original", "clean-procedural-cc0", "byot-personal-render", "external-unverified-raw-scan"];
const SCENARIOS = ["pure-human-ink", "hybrid-human-cc0-3d", "contaminated-external-scan", "custom"];
const HASH = /^[0-9a-f]{16}$/iu;

export function assertText(value: string, max: number, nonempty = false): void {
  if (typeof value !== "string" || value.length > max || (nonempty && value.trim().length === 0)) {
    throw new Error("Invalid or oversized ledger text");
  }
}

function assertNumber(value: number, min: number, max: number, integer = false): void {
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isSafeInteger(value))) {
    throw new Error("Invalid ledger number");
  }
}

export function assertEvent(event: HumanInkLedgerEvent): void {
  if (!event || typeof event !== "object" || !KINDS.includes(event.kind) || !LICENSES.includes(event.licenseClass)) {
    throw new Error("Invalid ledger event or classification");
  }
  assertText(event.eventId, 256, true);
  assertText(event.layerId, 256, true);
  assertText(event.toolLabel, 512, true);
  assertText(event.sourceNoteKo, 4096);
  assertText(event.sourceNoteEn, 4096);
  if (event.assetRefId !== undefined) assertText(event.assetRefId, 256, true);
  assertNumber(event.sequenceIndex, 0, MAX_LEDGER_EVENTS - 1, true);
  assertNumber(event.timestampMs, 0, 8_640_000_000_000_000, true);
  assertNumber(event.deltaTimeMs, 0, 86_400_000, true);
  assertNumber(event.pressureEntropyBits, 0, 4);
  assertNumber(event.velocityVariance, 0, 4);
  assertNumber(event.strokePointCount, 0, 1_000_000, true);
  if (typeof event.tileDeltaHashHex !== "string" || !HASH.test(event.tileDeltaHashHex)) throw new Error("Invalid tile checksum");
}

export function copyValidatedEvents(events: readonly HumanInkLedgerEvent[]): readonly HumanInkLedgerEvent[] {
  if (!Array.isArray(events) || events.length > MAX_LEDGER_EVENTS) throw new Error("Ledger event limit exceeded");
  const ids = new Set<string>();
  let textUnits = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    assertEvent(event);
    if (ids.has(event.eventId)) throw new Error("Duplicate event ID");
    ids.add(event.eventId);
    textUnits += event.eventId.length + event.layerId.length + event.toolLabel.length + event.sourceNoteKo.length + event.sourceNoteEn.length + (event.assetRefId?.length ?? 0);
    if (textUnits > MAX_LEDGER_TEXT_UNITS) throw new Error("Ledger text limit exceeded");
  }
  return events.map((event) => ({
    eventId: event.eventId, sequenceIndex: event.sequenceIndex, kind: event.kind, licenseClass: event.licenseClass,
    layerId: event.layerId, toolLabel: event.toolLabel, timestampMs: event.timestampMs, deltaTimeMs: event.deltaTimeMs,
    pressureEntropyBits: event.pressureEntropyBits, velocityVariance: event.velocityVariance,
    strokePointCount: event.strokePointCount, tileDeltaHashHex: event.tileDeltaHashHex,
    ...(event.assetRefId === undefined ? {} : { assetRefId: event.assetRefId }),
    sourceNoteKo: event.sourceNoteKo, sourceNoteEn: event.sourceNoteEn,
  }));
}

type Metadata = Pick<HumanInkMerkleLedger, "workId" | "scenarioId" | "episodeTitleKo" | "episodeTitleEn" | "recordedAtIso" | "pageCount">;
export function serializeLedgerMetadata(value: Metadata): string {
  assertText(value.workId, 256, true);
  assertText(value.episodeTitleKo, 4096);
  assertText(value.episodeTitleEn, 4096);
  assertText(value.recordedAtIso, 64, true);
  if (!SCENARIOS.includes(value.scenarioId) || !Number.isFinite(Date.parse(value.recordedAtIso))) throw new Error("Invalid ledger metadata");
  assertNumber(value.pageCount, 1, 10_000, true);
  return JSON.stringify([value.workId, value.scenarioId, value.episodeTitleKo, value.episodeTitleEn, value.recordedAtIso, value.pageCount]);
}

/** 반환 계약의 모든 키·배열·수치를 비교하며 객체 키 삽입 순서는 의미로 취급하지 않는다. */
export function sameLedgerData(actual: unknown, expected: unknown): boolean {
  if (actual === expected) return true;
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && actual.length === expected.length && expected.every((value, index) => sameLedgerData(actual[index], value));
  }
  if (expected !== null && typeof expected === "object") {
    if (actual === null || typeof actual !== "object" || Array.isArray(actual)) return false;
    const expectedKeys = Object.keys(expected);
    if (Object.keys(actual).length !== expectedKeys.length) return false;
    return expectedKeys.every((key) => Object.hasOwn(actual, key) && sameLedgerData(Reflect.get(actual, key), Reflect.get(expected, key)));
  }
  return false;
}

export function isValidProofShape(proof: MerkleInclusionProof, expectedRootHex: string): boolean {
  if (!proof || !Number.isSafeInteger(proof.leafCount) || proof.leafCount < 1 || proof.leafCount > MAX_LEDGER_EVENTS) return false;
  if (!Number.isSafeInteger(proof.leafIndex) || proof.leafIndex < 0 || proof.leafIndex >= proof.leafCount) return false;
  const depth = Math.ceil(Math.log2(proof.leafCount));
  if (proof.treeDepth !== depth || !Array.isArray(proof.siblings) || proof.siblings.length !== depth) return false;
  if (typeof proof.eventId !== "string" || proof.eventId.length === 0 || proof.eventId.length > 256) return false;
  if (![proof.leafHashHex, proof.merkleRootHex, expectedRootHex].every((hash) => typeof hash === "string" && HASH.test(hash))) return false;
  let cursor = proof.leafIndex;
  let width = proof.leafCount;
  for (let level = 0; level < depth; level += 1) {
    const step = proof.siblings[level];
    const duplicated = cursor % 2 === 0 && cursor + 1 >= width;
    const position = cursor % 2 === 1 ? "left" : "right";
    if (!step || step.level !== level || step.position !== position || step.duplicated !== duplicated || !HASH.test(step.siblingHashHex)) return false;
    cursor = Math.floor(cursor / 2);
    width = Math.ceil(width / 2);
  }
  return true;
}
