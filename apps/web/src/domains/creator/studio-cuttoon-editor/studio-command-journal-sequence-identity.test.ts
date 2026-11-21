import { describe, expect, it } from "vitest";

import {
  StudioCommandJournalError,
  canonicalStudioCommandJson,
  createStudioCommandEnvelope,
  createStudioCommandJournal,
  restoreStudioCommandJournal,
  studioCommandPayloadChecksum,
  type StudioCommandJournal,
  type StudioCommandJournalErrorCode,
  type StudioCommandJsonValue,
} from "../studio-command-journal";
import {
  STUDIO_COMMAND_IDENTITY_POLICY_KEY as POLICY_KEY,
  STUDIO_COMMAND_SEQUENCE_IDENTITY_POLICY as SEQUENCE_POLICY,
  addStudioCommandIdentityToFilter,
  decodeStudioCommandIdentityFilter,
  encodeStudioCommandIdentityFilter,
  studioCommandIdentityFilterMayContain,
} from "./runtime/history/studio-command-journal-identity";

type JsonObject = { [key: string]: StudioCommandJsonValue };
const actorId = "actor:test";

function object(value: unknown): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected JSON object");
  return value as JsonObject;
}

function expectCode(action: () => unknown, code: StudioCommandJournalErrorCode): void {
  try { action(); } catch (error) {
    expect(error).toBeInstanceOf(StudioCommandJournalError);
    if (!(error instanceof StudioCommandJournalError)) throw error;
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

function command(sequence: number, options: {
  id?: string; groupId?: string; actorId?: string; transactionId?: string | null; value?: number;
} = {}) {
  return createStudioCommandEnvelope({
    id: options.id ?? `command:${sequence}`, actorId: options.actorId ?? actorId,
    lamport: sequence, transactionId: options.transactionId ?? null, groupId: options.groupId ?? `group:${sequence}`,
    command: { kind: "object.patch", payload: { value: options.value ?? sequence } },
    inverse: { kind: "object.patch", payload: { value: sequence - 1 } },
  });
}

function sequenceJournal(maxIdempotencyKeys = 4096) {
  return createStudioCommandJournal({
    limits: { maxRecords: 16, maxIdempotencyKeys },
    extensions: { [POLICY_KEY]: SEQUENCE_POLICY, futureVendor: { retained: true } },
  });
}

function compact(journal: StudioCommandJournal) {
  return journal.compact({ id: `checkpoint:${journal.nextSequence}`, state: { value: journal.nextSequence - 1 } });
}

/** 체크포인트만 있는 유효 fixture의 hash를 다시 봉인한다. 실제 저장 파일을 수정하지 않는다. */
function reseal(raw: JsonObject): string {
  if (raw.checkpoint !== null) {
    if (!Array.isArray(raw.records) || raw.records.length !== 0) throw new Error("Checkpoint fixture must have no tail");
    const checkpoint = object(raw.checkpoint);
    const { checkpointChecksum: _checksum, ...body } = checkpoint;
    checkpoint.checkpointChecksum = studioCommandPayloadChecksum(body);
    raw.headChecksum = checkpoint.checkpointChecksum;
  }
  const { manifestChecksum: _manifest, ...body } = raw;
  return canonicalStudioCommandJson({ ...body, manifestChecksum: studioCommandPayloadChecksum(body) });
}

function withFilter(journal: StudioCommandJournal, change: (bytes: Uint8Array) => void): StudioCommandJournal {
  const raw = object(JSON.parse(journal.serialize()));
  const checkpoint = object(raw.checkpoint);
  if (typeof checkpoint.identityFilter !== "string") throw new Error("Missing filter");
  const bytes = decodeStudioCommandIdentityFilter(checkpoint.identityFilter);
  change(bytes);
  checkpoint.identityFilter = encodeStudioCommandIdentityFilter(bytes);
  return restoreStudioCommandJournal(reseal(raw));
}

function legacyJournal(maxIdempotencyKeys = 4096) {
  const journal = createStudioCommandJournal({ limits: { maxRecords: 16, maxIdempotencyKeys } });
  for (let sequence = 1; sequence <= 3; sequence += 1) journal.appendCommand(command(sequence));
  journal.compact({ id: "checkpoint:legacy", state: { value: 3 } });
  return journal;
}

describe("sequence-v1의 정확한 생성 ID 경계", () => {
  it("exact retry를 새 순번 검사보다 먼저 처리하며 내용 변경은 거절한다", () => {
    const journal = sequenceJournal();
    const first = command(1);
    journal.appendCommand(first);
    expect(journal.appendCommand(first)).toMatchObject({ status: "duplicate", sequence: 1, compacted: false });
    compact(journal);
    expect(journal.appendCommand(first)).toMatchObject({ status: "duplicate", sequence: 1, compacted: true });
    const before = journal.serialize();
    expectCode(() => journal.appendCommand(command(1, { value: 99 })), "DUPLICATE_CONFLICT");
    expect(journal.serialize()).toBe(before);
    expect(journal.appendCommand(command(2)).status).toBe("appended");
  });

  it.each(["command:0", "command:2", "command:01", "command:1e0", "undo:1", "caller:arbitrary", "command:9007199254740992"])(
    "이전·미래·다른 namespace·비정규 ID %s를 변경 없이 거절한다", (id) => {
      const journal = sequenceJournal();
      const before = journal.serialize();
      expectCode(() => journal.appendCommand(command(1, { id })), "DUPLICATE_CONFLICT");
      expect(journal.serialize()).toBe(before);
    },
  );

  it("이전 ID가 exact retention 밖으로 나가도 다시 쓰지 않는다", () => {
    const journal = sequenceJournal(2);
    for (let sequence = 1; sequence <= 3; sequence += 1) journal.appendCommand(command(sequence));
    compact(journal);
    expect(journal.checkpoint?.idempotency.map((entry) => entry.id)).toEqual(["command:2", "command:3"]);
    expectCode(() => journal.appendCommand(command(1)), "DUPLICATE_CONFLICT");
    expect(journal.appendCommand(command(2)).status).toBe("duplicate");
    expect(journal.appendCommand(command(4)).status).toBe("appended");
  });

  it("연속 group은 이어 쓰되 Undo·다른 actor·compaction 뒤 과거 group 재개는 거절한다", () => {
    const journal = sequenceJournal();
    journal.appendCommand(command(1));
    journal.appendCommand(command(2, { groupId: "group:1" }));
    journal.undo({ id: "undo:3", actorId, lamport: 3, groupId: "group:1" });
    expectCode(() => journal.appendCommand(command(4, { groupId: "group:1" })), "GROUP_REOPENED");
    journal.appendCommand(command(4));
    expectCode(() => journal.appendCommand(command(5, { actorId: "actor:other", groupId: "group:4" })), "GROUP_REOPENED");
    compact(journal);
    expectCode(() => journal.appendCommand(command(5, { groupId: "group:1" })), "GROUP_REOPENED");
    expect(journal.appendCommand(command(5)).status).toBe("appended");
  });

  it("transaction 시작 순번과 group을 고정하고 멤버·종료는 실제 활성 transaction을 따른다", () => {
    const journal = sequenceJournal();
    const begin = { id: "transaction-begin:1", actorId, lamport: 1, transactionId: "transaction:1", groupId: "group:1" };
    expectCode(() => journal.beginTransaction({ ...begin, transactionId: "transaction:other" }), "TRANSACTION_REUSED");
    expectCode(() => journal.beginTransaction({ ...begin, groupId: "group:other" }), "GROUP_REOPENED");
    journal.beginTransaction(begin);
    journal.appendCommand(command(2, { groupId: "group:1", transactionId: "transaction:1" }));
    journal.commitTransaction({ ...begin, id: "transaction-commit:3", lamport: 3 });
    journal.undo({ id: "undo:4", actorId, lamport: 4, groupId: "group:1" });
    journal.redo({ id: "redo:5", actorId, lamport: 5, groupId: "group:1" });
    compact(journal);
    expect(journal.beginTransaction(begin).status).toBe("duplicate");
    const next = { ...begin, id: "transaction-begin:6", lamport: 6, transactionId: "transaction:6", groupId: "group:6" };
    expectCode(() => journal.beginTransaction({ ...next, transactionId: "transaction:1" }), "TRANSACTION_REUSED");
    expectCode(() => journal.beginTransaction({ ...next, groupId: "group:1" }), "GROUP_REOPENED");
    journal.beginTransaction(next);
    expectCode(() => journal.appendCommand(command(7, { groupId: "group:1", transactionId: "transaction:1" })), "TRANSACTION_MISMATCH");
    journal.abortTransaction({ ...next, id: "transaction-abort:7", lamport: 7 });
    const restored = restoreStudioCommandJournal(journal.serialize());
    expect(restored.serialize()).toBe(journal.serialize());
    expect(restored.replayPlan().nextSequence).toBe(8);
  });

  it("checkpoint ID의 순번과 namespace도 바꾸거나 재사용할 수 없다", () => {
    const journal = sequenceJournal();
    journal.appendCommand(command(1));
    const before = journal.serialize();
    for (const id of ["checkpoint:1", "checkpoint:3", "command:2", "checkpoint:02"]) {
      expectCode(() => journal.compact({ id, state: {} }), "DUPLICATE_CONFLICT");
      expect(journal.serialize()).toBe(before);
    }
    compact(journal);
    expectCode(() => compact(journal), "DUPLICATE_CONFLICT");
    journal.appendCommand(command(2));
    compact(journal);
    expectCode(() => journal.compact({ id: "checkpoint:2", state: {} }), "DUPLICATE_CONFLICT");
  });

  it("포화 필터에서도 새 생성 ID와 여러 compact/reopen은 진행하고 old retry 보호는 유지한다", () => {
    let journal = sequenceJournal(2);
    for (let sequence = 1; sequence <= 3; sequence += 1) journal.appendCommand(command(sequence));
    compact(journal);
    journal = withFilter(journal, (bytes) => bytes.fill(255));
    const fourth = command(4);
    journal.appendCommand(fourth);
    journal.undo({ id: "undo:5", actorId, lamport: 5, groupId: "group:4" });
    const redo = { id: "redo:6", actorId, lamport: 6, groupId: "group:4" };
    journal.redo(redo);
    compact(journal);
    expect(journal.checkpoint?.identityFilter).toBe("ff".repeat(8192));
    journal = restoreStudioCommandJournal(journal.serialize());
    expect(journal.redo(redo).status).toBe("duplicate");
    expectCode(() => journal.redo({ ...redo, groupId: "group:wrong" }), "DUPLICATE_CONFLICT");
    expectCode(() => journal.appendCommand(command(1)), "DUPLICATE_CONFLICT");
    expectCode(() => journal.appendCommand(command(7, { groupId: "group:4" })), "GROUP_REOPENED");
    journal.appendCommand(command(7));
    compact(journal);
    const restored = restoreStudioCommandJournal(journal.serialize());
    expect(restored.appendCommand(command(8)).status).toBe("appended");
    expect(restored.replayPlan().nextSequence).toBe(9);
    expect(restored.checkpoint?.identityFilter).toBe("ff".repeat(8192));
  });
});

describe("정책 metadata와 복구 무결성", () => {
  it("정책을 주입한 최종 checkpoint metadata도 바이트 한도 안에서만 저장한다", () => {
    const journal = createStudioCommandJournal({
      limits: { maxPayloadBytes: 128 }, extensions: { [POLICY_KEY]: SEQUENCE_POLICY },
    });
    const before = journal.serialize();
    expectCode(() => journal.compact({ id: "checkpoint:1", state: {}, extensions: { pad: "x".repeat(100) } }), "PAYLOAD_TOO_LARGE");
    expect(journal.serialize()).toBe(before);
    journal.compact({ id: "checkpoint:1", state: {}, extensions: { pad: "x".repeat(10) } });
    expect(restoreStudioCommandJournal(journal.serialize()).serialize()).toBe(journal.serialize());
  });

  it("알 수 없는 새 정책을 기본 임의 ID 모드로 생성하지 않는다", () => {
    expectCode(() => createStudioCommandJournal({ extensions: { [POLICY_KEY]: "sequence-v2" } }), "UNSUPPORTED_VERSION");
  });

  it("예약 정책은 root와 checkpoint checksum에 포함되며 caller가 덮지 못한다", () => {
    const journal = sequenceJournal();
    journal.appendCommand(command(1));
    const before = journal.serialize();
    expectCode(() => journal.compact({ id: "checkpoint:2", state: {}, extensions: { [POLICY_KEY]: "sequence-v2" } }), "INVALID_COMPACTION");
    expect(journal.serialize()).toBe(before);
    const checkpoint = compact(journal);
    expect(journal.extensions[POLICY_KEY]).toBe(SEQUENCE_POLICY);
    expect(checkpoint.extensions[POLICY_KEY]).toBe(SEQUENCE_POLICY);
    const raw = object(JSON.parse(journal.serialize()));
    delete object(raw.extensions)[POLICY_KEY];
    expectCode(() => restoreStudioCommandJournal(canonicalStudioCommandJson(raw)), "CORRUPT_CHECKPOINT");
  });

  it.each(["missing-root", "missing-checkpoint", "unknown-root", "unknown-checkpoint"])(
    "checksum을 다시 계산해도 정책 불일치 %s는 복구하지 않는다", (mutation) => {
      const journal = sequenceJournal(); journal.appendCommand(command(1)); compact(journal);
      const raw = object(JSON.parse(journal.serialize()));
      const rootExtensions = object(raw.extensions);
      const checkpointExtensions = object(object(raw.checkpoint).extensions);
      if (mutation === "missing-root") delete rootExtensions[POLICY_KEY];
      if (mutation === "missing-checkpoint") delete checkpointExtensions[POLICY_KEY];
      if (mutation === "unknown-root") rootExtensions[POLICY_KEY] = "sequence-v2";
      if (mutation === "unknown-checkpoint") checkpointExtensions[POLICY_KEY] = "sequence-v2";
      expectCode(() => restoreStudioCommandJournal(reseal(raw)), mutation === "unknown-root" ? "UNSUPPORTED_VERSION" : "CORRUPT_CHECKPOINT");
    },
  );

  it.each(["checkpoint-id", "retained-id", "retained-sequence"])("생성 checkpoint의 잘못된 %s를 복구하지 않는다", (mutation) => {
    const journal = sequenceJournal(); journal.appendCommand(command(1)); journal.appendCommand(command(2)); compact(journal);
    const raw = object(JSON.parse(journal.serialize()));
    const checkpoint = object(raw.checkpoint);
    if (mutation === "checkpoint-id") checkpoint.id = "checkpoint:99";
    const idempotency = checkpoint.idempotency;
    if (!Array.isArray(idempotency)) throw new Error("Missing idempotency");
    if (mutation === "retained-id") object(idempotency[0]).id = "caller:old";
    if (mutation === "retained-sequence") {
      object(idempotency[1]).sequence = 1;
      object(idempotency[1]).recordType = "undo";
      object(idempotency[1]).id = "undo:1";
    }
    expectCode(() => restoreStudioCommandJournal(reseal(raw)), "CORRUPT_CHECKPOINT");
  });

  it.each(["record", "group", "transaction"])("기존 임의 %s를 새 정책 표식만 붙여서 복구하지 않는다", (kind) => {
    const journal = createStudioCommandJournal();
    if (kind === "transaction") {
      journal.beginTransaction({ id: "transaction-begin:1", actorId, lamport: 1, transactionId: "tx:arbitrary", groupId: "group:1" });
    } else {
      journal.appendCommand(command(1, kind === "record" ? { id: "caller:arbitrary" } : { groupId: "group:arbitrary" }));
    }
    const raw = object(JSON.parse(journal.serialize()));
    object(raw.extensions)[POLICY_KEY] = SEQUENCE_POLICY;
    expectCode(() => restoreStudioCommandJournal(reseal(raw)), kind === "record" ? "DUPLICATE_CONFLICT" : kind === "group" ? "GROUP_REOPENED" : "TRANSACTION_REUSED");
  });
});

describe("기존 임의 ID journal의 완전 exact 구간", () => {
  it("record가 전혀 없는 완전 frontier에서도 과거 checkpoint 이름을 record로 재사용하지 않는다", () => {
    const journal = createStudioCommandJournal();
    journal.compact({ id: "old-checkpoint", state: {} });
    journal.compact({ id: "new-checkpoint", state: {} });
    expect(journal.checkpoint?.upToSequence).toBe(0);
    expect(journal.checkpoint?.idempotency).toEqual([]);
    expectCode(() => journal.appendCommand(command(1, { id: "old-checkpoint" })), "DUPLICATE_CONFLICT");
  });

  it("모든 이전 record ID가 남아 있으면 record-filter 오탐을 쓰기·replay·restore에서 거절 근거로 쓰지 않는다", () => {
    let journal = legacyJournal();
    journal = withFilter(journal, (bytes) => addStudioCommandIdentityToFilter(bytes, "record:command:4"));
    expect(studioCommandIdentityFilterMayContain(journal.checkpoint?.identityFilter, "record:command:4")).toBe(true);
    expect(studioCommandIdentityFilterMayContain(journal.checkpoint?.identityFilter, "checkpoint:command:4")).toBe(false);
    journal.appendCommand(command(4));
    expect(journal.replayPlan().nextSequence).toBe(5);
    const restored = restoreStudioCommandJournal(journal.serialize());
    expect(restored.identityPolicy).toBeNull();
    expect(restored.serialize()).toBe(journal.serialize());
    expect(restored.appendCommand(command(4)).status).toBe("duplicate");
  });

  it("exact record가 모두 있어도 과거 checkpoint ID 재사용은 여전히 거절한다", () => {
    const journal = createStudioCommandJournal();
    journal.appendCommand(command(1)); journal.compact({ id: "checkpoint:old", state: {} });
    journal.appendCommand(command(2)); journal.compact({ id: "checkpoint:new", state: {} });
    expect(journal.checkpoint?.idempotency).toHaveLength(2);
    expectCode(() => journal.appendCommand(command(3, { id: "checkpoint:old" })), "DUPLICATE_CONFLICT");
    expectCode(() => journal.compact({ id: "checkpoint:old", state: {} }), "DUPLICATE_CONFLICT");
  });

  it.each(["evicted", "duplicate-sequence"])("legacy frontier가 불완전한 %s 경우는 보수적인 중복 거절을 유지한다", (condition) => {
    let journal = legacyJournal(condition === "evicted" ? 1 : 4096);
    journal = withFilter(journal, (bytes) => addStudioCommandIdentityToFilter(bytes, "record:command:4"));
    if (condition === "duplicate-sequence") {
      const raw = object(JSON.parse(journal.serialize()));
      const entries = object(raw.checkpoint).idempotency;
      if (!Array.isArray(entries)) throw new Error("Missing entries");
      object(entries[1]).sequence = 1;
      journal = restoreStudioCommandJournal(reseal(raw));
    }
    expect(journal.identityPolicy).toBeNull();
    expectCode(() => journal.appendCommand(command(4)), "DUPLICATE_CONFLICT");
  });
});
