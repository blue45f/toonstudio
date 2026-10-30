import { describe, expect, it } from "vitest";
import type { StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import { encodeStudioCrdtUpdate, parsePersistedStudioCrdtUpdateRequest, parseStudioCrdtUpdateRequest, STUDIO_CRDT_PROTOCOL_VERSION, type StudioCrdtUpdateRequest } from "./studio-crdt-protocol";
import { createStudioCrdtBinaryUpdateRequest } from "./studio-crdt-binary-wire";
import { tryCoalescePendingCrdtUpdate } from "./studio-crdt-operation-error";
import { LegacyIndexedDbStudioCrdtOutbox, SerializedStudioCrdtOutbox } from "./studio-crdt-outbox";

function request(): StudioCrdtUpdateRequest & { writeContext: StudioScopedWriteContext } {
  return { protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION, workId: "scoped-wire-work", updateId: "19999999-1111-4111-8111-111111111111", clientSequence: 1, update: encodeStudioCrdtUpdate(Uint8Array.of(0, 0)),
    writeContext: { version: 1, policyVersion: 3, grantIds: ["original-grant"], creations: [{ kind: "stroke", id: "original-stroke", targetId: "original-target" }], restorations: [{ kind: "element", id: "restored-image", targetId: "original-target" }] } };
}

describe("제한 원고 전송의 원래 본문 보존", () => {
  it("JSON과 복구 row는 원래 정책·grant·실제 ID를 복제해 읽는다", () => {
    const original = request(), parsed = parseStudioCrdtUpdateRequest(original), restored = parsePersistedStudioCrdtUpdateRequest(JSON.parse(JSON.stringify(original)));
    expect(parsed).toEqual(original); expect(restored).toEqual(original);
    original.writeContext.grantIds[0] = "new-grant"; original.writeContext.creations[0]!.id = "new-id";
    expect(parsed?.writeContext).toMatchObject({ policyVersion: 3, grantIds: ["original-grant"], creations: [{ id: "original-stroke" }] });
    expect(restored?.writeContext).toEqual(parsed?.writeContext);
    expect(parseStudioCrdtUpdateRequest({ ...request(), writeContext: { ...request().writeContext, policyVersion: 0 } })).toBeNull();
  });
  it("binary 전환은 원본 update bytes를 유지하며 outer 문맥만 복제한다", () => {
    const original = request(), { writeContext: _context, ...unscoped } = original, binary = createStudioCrdtBinaryUpdateRequest(original), regular = createStudioCrdtBinaryUpdateRequest(unscoped);
    expect(binary.update).toEqual(regular.update); expect(binary.writeContext).toEqual(original.writeContext);
    original.writeContext.restorations[0]!.id = "later-id";
    expect(binary.writeContext?.restorations[0]?.id).toBe("restored-image"); expect(binary.updateId).toBe(original.updateId);
  });
  it("전송 전이어도 서로 다른 제한 권한 본문을 coalesce하지 않는다", () => {
    const original = request(), { writeContext: _context, ...unscoped } = original, tail = { request: original, attempts: 0, localBroadcasted: false, inFlight: false, draftProtectionBoundary: false, persistenceState: "ready" as const, persisted: Promise.resolve(true) };
    expect(tryCoalescePendingCrdtUpdate(tail, Uint8Array.of(0, 0), true)).toBe(false);
    expect(tryCoalescePendingCrdtUpdate({ ...tail, request: unscoped }, Uint8Array.of(0, 0), true, original.writeContext)).toBe(false);
    expect(tail.request).toBe(original); expect(tail.request.writeContext.creations[0]?.id).toBe("original-stroke");
  });
  it("영속 공급자가 실패해도 emergency outbox는 원래 nested 문맥을 보존한다", async () => {
    const original = request(), expected = structuredClone(original), outbox = new SerializedStudioCrdtOutbox(new LegacyIndexedDbStudioCrdtOutbox());
    try {
      await expect(outbox.put("scoped-wire-actor", original)).rejects.toThrow();
      original.writeContext.grantIds[0] = "later-grant"; original.writeContext.creations[0]!.targetId = "later-target";
      expect(outbox.listEmergency("scoped-wire-actor", original.workId)).toEqual([expected]);
    } finally { await outbox.remove("scoped-wire-actor", original.workId, original.updateId); }
  });
});
