import { fromUint8Array, toUint8Array } from "js-base64";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";

import { STUDIO_CRDT_UPDATE_MAX_BYTES } from "../../../../../../apps/api/src/modules/creator/studio-crdt.repository";
import {
  StudioCrdtUpdateIdConflictError,
  type StudioCrdtService,
} from "../../../../../../apps/api/src/modules/creator/studio-crdt.service";

import {
  MemoryStudioCrdtRepository,
  applySync,
  createScenePageDocument,
  service,
  services,
} from "./studio-crdt.service.test-support";

import type {
  AppendStudioCrdtUpdateInput,
  AppendStudioCrdtUpdateResult,
  ValidateStudioCrdtAppend,
} from "../../../../../../apps/api/src/modules/creator/studio-crdt.repository";

class ValidationTailRepository extends MemoryStudioCrdtRepository {
  readonly validationTailLengths: number[] = [];

  override appendUpdate(
    input: AppendStudioCrdtUpdateInput,
    validate: ValidateStudioCrdtAppend,
  ): Promise<AppendStudioCrdtUpdateResult> {
    return super.appendUpdate(input, (current, transaction, authorization) => {
      this.validationTailLengths.push(current.updates.length);
      return validate(current, transaction, authorization);
    });
  }
}

function updateId(sequence: number): string {
  return `00000000-0000-4000-8000-${sequence.toString().padStart(12, "0")}`;
}

function expectExactDocument(actual: Y.Doc, expected: Y.Doc): void {
  for (const [name, value] of expected.share) {
    if (value instanceof Y.Map) {
      expect(actual.getMap(name).toJSON()).toEqual(value.toJSON());
    } else if (value instanceof Y.Array) {
      expect(actual.getArray(name).toJSON()).toEqual(value.toJSON());
    } else {
      throw new Error("회귀 fixture에 예상하지 못한 Yjs 루트가 있습니다.");
    }
  }
  expect(actual.share.size).toBe(expected.share.size);
  expect(Y.encodeStateVector(actual)).toEqual(Y.encodeStateVector(expected));
}

afterEach(async () => {
  await Promise.all(services.splice(0).map((current) => current.onModuleDestroy()));
});

describe("StudioCrdtService 기본 압축의 검증 tail 경계", () => {
  it("기본값으로 검증 tail을 63개 이하로 유지하고 압축 후 재시도·충돌·새 인스턴스 복구를 보존한다", async () => {
    const repository = new ValidationTailRepository();
    // 시간·용량 기준이 개수 회귀를 대신 통과시키지 않도록 작은 변경과 고정 시각만 사용한다.
    const now = () => new Date("2026-11-03T00:00:00.000Z");
    const current = service(repository, { now });
    const source = createScenePageDocument();
    const recovered = new Y.Doc();
    const workId = "work-default-compaction-tail";
    const operationCount = 257;
    let totalRawBytes = 0;
    const firstInput: Parameters<StudioCrdtService["applyUpdate"]>[0] = {
      workId,
      updateId: updateId(1),
      actorUserId: "compaction-editor",
      data: fromUint8Array(Y.encodeStateAsUpdate(source)),
    };

    try {
      for (let sequence = 1; sequence <= operationCount; sequence += 1) {
        let data = firstInput.data;
        if (sequence > 1) {
          const before = Y.encodeStateVector(source);
          source.getMap("scene-element:scene-1").set("prop:text", `검증된 대사 ${sequence}`);
          data = fromUint8Array(Y.encodeStateAsUpdate(source, before));
        }
        totalRawBytes += toUint8Array(data).byteLength;
        expect(totalRawBytes).toBeLessThan(STUDIO_CRDT_UPDATE_MAX_BYTES);
        await expect(current.applyUpdate({
          ...firstInput,
          updateId: updateId(sequence),
          data,
        })).resolves.toMatchObject({ duplicate: false, serverSequence: String(sequence) });
        expect(repository.updates.get(workId)?.length ?? 0).toBeLessThanOrEqual(63);
        if (sequence === 64) {
          // 상한 안에서 기본 압축이 실제 실행됐는지 검사한다.
          expect(repository.snapshots.has(workId)).toBe(true);
          expect(repository.compactCalls).toBeGreaterThan(0);
        }
      }

      expect(repository.validationTailLengths).toHaveLength(operationCount);
      expect(Math.max(...repository.validationTailLengths)).toBeLessThanOrEqual(63);
      const snapshot = repository.snapshots.get(workId);
      expect(snapshot).toBeDefined();
      if (!snapshot) throw new Error("기본 압축 스냅샷이 생성되지 않았습니다.");
      expect(snapshot.compactedSequence).toBeGreaterThan(0n);
      expect(snapshot.compactedSequence).toBeLessThan(BigInt(operationCount));
      const tail = repository.updates.get(workId) ?? [];
      expect(tail.length).toBeGreaterThan(0);
      expect(tail.every((row) => row.sequence > snapshot.compactedSequence)).toBe(true);
      expect(repository.receipts.size).toBe(operationCount);
      const originalReceipt = repository.receipts.get(JSON.stringify([workId, firstInput.updateId]));
      expect(originalReceipt?.sequence).toBe(1n);
      expect(tail.some((row) => row.updateId === firstInput.updateId)).toBe(false);

      const persistedBeforeRetries = await repository.loadDocument(workId);
      const nextSequenceBeforeRetries = repository.nextSequence;
      const compactionsBeforeRetries = repository.compactCalls;
      await expect(current.applyUpdate(firstInput)).resolves.toMatchObject({
        duplicate: true,
        serverSequence: "1",
      });

      await current.onModuleDestroy();
      const reopened = service(repository, { now });
      const sync = await reopened.sync(workId);
      expect(sync.serverSequence).toBe(String(operationCount));
      expect(sync.serverStateVector).toBe(fromUint8Array(Y.encodeStateVector(source)));
      applySync(recovered, sync);
      expectExactDocument(recovered, source);

      await expect(reopened.applyUpdate(firstInput)).resolves.toMatchObject({
        duplicate: true,
        serverSequence: "1",
      });
      const differentData = fromUint8Array(Y.encodeStateAsUpdate(source));
      expect(differentData).not.toBe(firstInput.data);
      await expect(reopened.applyUpdate({ ...firstInput, data: differentData }))
        .rejects.toBeInstanceOf(StudioCrdtUpdateIdConflictError);
      await expect(reopened.applyUpdate({ ...firstInput, actorUserId: "different-editor" }))
        .rejects.toBeInstanceOf(StudioCrdtUpdateIdConflictError);

      expect(repository.nextSequence).toBe(nextSequenceBeforeRetries);
      expect(repository.receipts.size).toBe(operationCount);
      expect(repository.compactCalls).toBe(compactionsBeforeRetries);
      expect(await repository.loadDocument(workId)).toEqual(persistedBeforeRetries);
      const finalSync = await reopened.sync(workId);
      expect(finalSync.serverSequence).toBe(String(operationCount));
      expect(finalSync.serverStateVector).toBe(sync.serverStateVector);
      applySync(recovered, finalSync);
      expectExactDocument(recovered, source);
    } finally {
      source.destroy();
      recovered.destroy();
    }
  });
});
