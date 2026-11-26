import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ImmutableProvenanceLedger,
  type ProvenanceAuditEvent,
} from "./immutable-provenance-audit-ledger";

function auditEvent(eventId: string): ProvenanceAuditEvent {
  return {
    eventId,
    eventKind: "layer-edit",
    workId: "work-concurrent",
    episodeId: "episode-1",
    actorId: "creator-1",
    recordedAtIso: "2026-11-26T00:00:00Z",
    subjectId: `layer-${eventId}`,
    subjectLabel: eventId,
    contentSha256Hex: "a".repeat(64),
  };
}

function createLedger(): Promise<ImmutableProvenanceLedger> {
  return ImmutableProvenanceLedger.create({
    ledgerId: "ledger-concurrent",
    workId: "work-concurrent",
    creatorId: "creator-1",
    preferredAlgorithm: "ECDSA-P256",
  });
}

afterEach(() => vi.restoreAllMocks());

describe("감사 원장 동시 추가", () => {
  it("동시에 추가한 블록을 호출 순서대로 연결하고 모든 서명을 검증한다", async () => {
    const ledger = await createLedger();
    const genesis = ledger.getLatestBlock();
    const blocks = await Promise.all(
      Array.from({ length: 8 }, (_, index) => ledger.appendBlock([auditEvent(`event-${index}`)])),
    );

    expect(blocks.map((block) => block.header.blockIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(blocks.map((block) => block.header.prevHash)).toEqual([
      genesis.blockHash,
      ...blocks.slice(0, -1).map((block) => block.blockHash),
    ]);
    expect(blocks.map((block) => block.events[0].eventId)).toEqual(
      Array.from({ length: 8 }, (_, index) => `event-${index}`),
    );
    expect(await ledger.verifyLedgerIntegrity()).toMatchObject({
      valid: true,
      totalBlocks: 9,
      totalEvents: 8,
      verifiedBlocks: 9,
      findings: [],
    });
  });

  it("동시 중복 이벤트는 한 번만 커밋하고 다음 고유 이벤트를 계속 처리한다", async () => {
    const ledger = await createLedger();
    const attempts = await Promise.allSettled([
      ledger.appendBlock([auditEvent("duplicate")]),
      ledger.appendBlock([auditEvent("duplicate")]),
      ledger.appendBlock([auditEvent("next")]),
    ]);

    expect(attempts.map((attempt) => attempt.status)).toEqual(["fulfilled", "rejected", "fulfilled"]);
    const duplicateAttempt = attempts[1];
    if (duplicateAttempt.status !== "rejected") throw new Error("중복 이벤트가 거절되지 않았습니다.");
    expect(duplicateAttempt.reason).toEqual(new Error("중복된 감사 이벤트 ID입니다: duplicate"));
    expect(ledger.getBlocks().flatMap((block) => block.events.map((event) => event.eventId))).toEqual([
      "duplicate",
      "next",
    ]);
    expect(await ledger.verifyLedgerIntegrity()).toMatchObject({
      valid: true,
      totalBlocks: 3,
      totalEvents: 2,
    });
  });

  it("서명 실패가 대기 중인 추가를 막거나 이벤트 ID를 먼저 소비하지 않는다", async () => {
    const ledger = await createLedger();
    vi.spyOn(crypto.subtle, "sign").mockRejectedValueOnce(new Error("서명 장치 일시 오류"));

    const attempts = await Promise.allSettled([
      ledger.appendBlock([auditEvent("retry")]),
      ledger.appendBlock([auditEvent("next")]),
    ]);
    expect(attempts.map((attempt) => attempt.status)).toEqual(["rejected", "fulfilled"]);
    expect(ledger.getLatestBlock().header.blockIndex).toBe(1);
    expect(ledger.getLatestBlock().events[0].eventId).toBe("next");

    const retried = await ledger.appendBlock([auditEvent("retry")]);
    expect(retried.header.blockIndex).toBe(2);
    expect(ledger.getBlocks().flatMap((block) => block.events.map((event) => event.eventId))).toEqual([
      "next",
      "retry",
    ]);
    expect(await ledger.verifyLedgerIntegrity()).toMatchObject({
      valid: true,
      totalBlocks: 3,
      totalEvents: 2,
      findings: [],
    });
  });
});
