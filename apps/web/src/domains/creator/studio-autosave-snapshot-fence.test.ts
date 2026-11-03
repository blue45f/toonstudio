import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import { createStudioAutosaveSnapshotFence, studioEmptyAutosaveNeedsTombstone, type StudioAutosaveSnapshotFrontier } from "./studio-autosave-snapshot-fence";
import { StudioAutosaveOpfsSession, type StudioAutosaveOpfsJournalPort } from "./studio-autosave-opfs-session";
import type { StudioAutosavePayload } from "./studio-autosave";
import type { StudioOpfsRecoveryEntry, StudioOpfsRecoveryScan, StudioOpfsRecoveryWriterLease } from "./studio-opfs-recovery-journal";

describe("autosave captured snapshot fence", () => {
  it("rejects a second deferred stroke even when the React history generation did not change", () => {
    const session = {};
    let current = { generation: 1, pendingFingerprint: "p:first", session };
    const isCurrent = createStudioAutosaveSnapshotFence(current, () => current);
    expect(isCurrent()).toBe(true);
    current = { ...current, pendingFingerprint: "p:first,second" };
    expect(isCurrent()).toBe(false);
  });

  it("rejects generation changes and a new document session", () => {
    const scheduled = { generation: 4, pendingFingerprint: "", session: {} };
    let current = scheduled;
    const isCurrent = createStudioAutosaveSnapshotFence(scheduled, () => current);
    current = { ...scheduled, generation: 5 };
    expect(isCurrent()).toBe(false);
    current = { ...scheduled, session: {} };
    expect(isCurrent()).toBe(false);
  });

  it("does not enqueue an obsolete write after asynchronous store preparation", async () => {
    const session = {};
    let current = { generation: 2, pendingFingerprint: "p:one", session };
    const isCurrent = createStudioAutosaveSnapshotFence(current, () => current);
    let ready!: () => void;
    const prepared = new Promise<void>((resolve) => { ready = resolve; });
    const write = vi.fn();
    const pending = (async () => {
      await prepared;
      if (isCurrent()) write();
    })();
    current = { ...current, pendingFingerprint: "p:one,two" };
    ready();
    await pending;
    expect(write).not.toHaveBeenCalled();
  });

  it("wires the fence before the host's debounced write and tombstone paths", () => {
    const host = readFileSync(new URL("./StudioCuttoonEditorHost.tsx", import.meta.url), "utf8");
    const start = host.indexOf("const scheduledAutosaveSession =");
    const end = host.indexOf("// 서버 자동저장", start);
    const autosave = host.slice(start, end);
    expect(start).toBeGreaterThan(-1);
    expect(autosave).toContain("createStudioAutosaveSnapshotFence");
    expect(autosave).toContain("studioPendingStrokeFingerprint(pendingStrokeCommitsRef.current)");
    expect(autosave).toMatch(/if \(!canPublishSnapshot\(\)\) return;\s+const receipt = await persistStudioAutosaveWithOpfsPrimary/u);
    expect(autosave.indexOf("!canPublishSnapshot()", autosave.indexOf("Promise.all([")))
      .toBeLessThan(autosave.indexOf("session.clear(savedAt)"));
  });
});


// 실제 자동저장 세션 테스트의 메모리 저널 계약을 재사용한다. 브라우저·DB·OPFS를 실행하지 않는다.
const EMPTY_AUTOSAVE_DOCUMENT_ID = "autosave-test-document";
const EMPTY_AUTOSAVE_ENGINE_VERSION = "studio-autosave-v2";
class EmptyAutosaveJournal implements StudioAutosaveOpfsJournalPort {
  readonly payloads = new Map<string, Uint8Array>();
  entries: StudioOpfsRecoveryEntry[] = [];
  epoch = 0;
  acquireCount = 0;
  renewCount = 0;
  releaseCount = 0;
  now = 1_000;
  appendGate: Promise<void> | null = null;

  async scan(): Promise<StudioOpfsRecoveryScan> {
    return Object.freeze({
      generation: this.entries.length,
      writerEpoch: this.epoch,
      lastSequence: this.entries.at(-1)?.sequence ?? 0,
      totalPayloadBytes: this.entries.reduce((total, entry) => total + entry.byteLength, 0),
      entries: Object.freeze([...this.entries]),
      selectedSlot: this.entries.length > 0 ? "a" : null,
      ignoredSlots: Object.freeze([]),
    });
  }

  async *readPayload(entry: StudioOpfsRecoveryEntry): AsyncIterable<Uint8Array> {
    const bytes = this.payloads.get(entry.descriptorPath);
    if (!bytes) throw new Error("저장된 체크포인트 원문이 없습니다.");
    const split = Math.floor(bytes.byteLength / 2);
    if (split > 0) yield bytes.slice(0, split);
    yield bytes.slice(split);
  }

  async acquireWriter(
    input: { readonly ownerId: string },
  ): Promise<StudioOpfsRecoveryWriterLease> {
    this.acquireCount += 1;
    this.epoch += 1;
    return Object.freeze({
      documentId: EMPTY_AUTOSAVE_DOCUMENT_ID,
      ownerId: input.ownerId,
      token: `token-${this.epoch}`,
      epoch: this.epoch,
      acquiredAt: this.now,
      expiresAt: this.now + 30_000,
    });
  }

  async renewWriter(
    writer: StudioOpfsRecoveryWriterLease,
  ): Promise<StudioOpfsRecoveryWriterLease> {
    this.renewCount += 1;
    return Object.freeze({
      ...writer,
      expiresAt: this.now + 30_000,
    });
  }

  async releaseWriter(): Promise<void> {
    this.releaseCount += 1;
  }

  async appendCheckpoint(
    writer: StudioOpfsRecoveryWriterLease,
    input: {
      readonly id: string;
      readonly pageId: string;
      readonly revision: number;
      readonly payload: Uint8Array;
      readonly byteLength: number;
      readonly createdAt: number;
      readonly compactThroughSequence: number;
    },
  ): Promise<StudioOpfsRecoveryEntry> {
    await this.appendGate;
    const sequence = (this.entries.at(-1)?.sequence ?? 0) + 1;
    this.entries = this.entries.filter(
      (entry) =>
        entry.pageId !== input.pageId
        || entry.sequence > input.compactThroughSequence,
    );
    const descriptorPath = `entry-${sequence}`;
    const entry: StudioOpfsRecoveryEntry = Object.freeze({
      kind: "checkpoint",
      id: input.id,
      sequence,
      pageId: input.pageId,
      revision: input.revision,
      documentId: writer.documentId,
      documentVersion: 2,
      engineVersion: EMPTY_AUTOSAVE_ENGINE_VERSION,
      writerEpoch: writer.epoch,
      createdAt: input.createdAt,
      byteLength: input.byteLength,
      chunks: Object.freeze([{
        path: `chunk-${sequence}`,
        byteLength: input.byteLength,
        crc32: 0,
      }]),
      compactThroughSequence: input.compactThroughSequence,
      descriptorPath,
      descriptorCrc32: 0,
    });
    this.payloads.set(descriptorPath, Uint8Array.from(input.payload));
    this.entries.push(entry);
    return entry;
  }

  async evictObsolete(): Promise<unknown> {
    return Object.freeze({ removedPaths: Object.freeze([]), freedBytes: 0 });
  }
}

function emptyAutosaveFixture() {
  const journal = new EmptyAutosaveJournal();
  const session = new StudioAutosaveOpfsSession({
    autosaveKey: "toonstudio-studio-autosave:v12:guest:new",
    journal,
    ownerId: "autosave-empty-regression-owner",
    now: () => journal.now,
  });
  const first: StudioAutosavePayload = {
    version: 2,
    savedAt: "2026-11-03T00:00:00.000Z",
    pagesList: [{ id: "page-1", elements: [{ id: "stroke-1", type: "draw" }], canvasH: 1080 }],
    currentPageId: "page-1",
  };
  return { session, first };
}

function deferredEmptyAutosave() {
  let resolve: () => void = () => { throw new Error("대기열을 초기화하지 않았습니다."); };
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("빈 원고의 내구 자동저장 권위", () => {
  it.each([
    { generation: 0, pendingFingerprint: "", editGeneration: 0, expected: false, name: "수정하지 않은 빈 원고" },
    { generation: 0, pendingFingerprint: "page-1:stroke-1", editGeneration: 0, expected: true, name: "0세대의 첫 획 영수증" },
    { generation: 0, pendingFingerprint: "", editGeneration: 1, expected: true, name: "첫 영수증보다 먼저 실행한 Undo" },
    { generation: 2, pendingFingerprint: "", editGeneration: 2, expected: true, name: "기존 양수 세대의 내구 저장" },
  ])("$name의 tombstone 필요 여부를 판정한다", ({ generation, pendingFingerprint, editGeneration, expected }) => {
    expect(studioEmptyAutosaveNeedsTombstone({ generation, pendingFingerprint }, editGeneration)).toBe(expected);
  });

  it("첫 0세대 체크포인트의 영수증보다 Undo가 먼저 와도 tombstone을 저장하고 늦은 영수증이 획을 되살리지 않는다", async () => {
    const { session, first } = emptyAutosaveFixture();
    const acknowledged = deferredEmptyAutosave();
    let durable = { generation: 0, pendingFingerprint: "" };
    let current: StudioAutosaveSnapshotFrontier = { generation: 0, pendingFingerprint: "page-1:stroke-1", session };
    const firstWrite = session.write(first);
    const lateReceipt = firstWrite.then(async () => {
      await acknowledged.promise;
      durable = {
        generation: Math.max(durable.generation, 0),
        pendingFingerprint: "page-1:stroke-1",
      };
    });
    try {
      await firstWrite;
      expect((await session.readLatest())?.state).toBe("snapshot");
      expect(durable).toEqual({ generation: 0, pendingFingerprint: "" });

      current = { ...current, generation: 1, pendingFingerprint: "" };
      expect(studioEmptyAutosaveNeedsTombstone(durable, current.generation)).toBe(true);
      const isCurrent = createStudioAutosaveSnapshotFence(current, () => current);
      const storeReady = deferredEmptyAutosave();
      const clear = vi.spyOn(session, "clear");
      const publishEmpty = (async () => {
        await storeReady.promise;
        if (!isCurrent()) return;
        await session.clear("2026-11-03T00:00:01.000Z");
        if (isCurrent()) durable = { generation: Math.max(durable.generation, current.generation), pendingFingerprint: "" };
      })();
      storeReady.resolve();
      await publishEmpty;
      expect(clear).toHaveBeenCalledOnce();
      expect(await session.readLatest()).toMatchObject({ state: "cleared", savedAt: "2026-11-03T00:00:01.000Z" });

      acknowledged.resolve();
      await lateReceipt;
      expect(durable.generation).toBe(1);
      expect(await session.readLatest()).toMatchObject({ state: "cleared", savedAt: "2026-11-03T00:00:01.000Z" });
    } finally {
      acknowledged.resolve();
      await lateReceipt;
      await session.dispose();
    }
  });

  it.each(["edit", "pending", "session"] as const)("tombstone 준비 중 %s 변경이 생기면 새 원고를 지우지 않는다", async (change) => {
    const { session, first } = emptyAutosaveFixture();
    const storeReady = deferredEmptyAutosave();
    let current: StudioAutosaveSnapshotFrontier = { generation: 1, pendingFingerprint: "", session };
    const isCurrent = createStudioAutosaveSnapshotFence(current, () => current);
    expect(studioEmptyAutosaveNeedsTombstone({ generation: 0, pendingFingerprint: "" }, current.generation)).toBe(true);
    const clear = vi.spyOn(session, "clear");
    try {
      await session.write(first);
      const publishEmpty = (async () => {
        await storeReady.promise;
        if (isCurrent()) await session.clear("2026-11-03T00:00:01.000Z");
      })();
      current = change === "edit"
        ? { ...current, generation: 2 }
        : change === "pending"
          ? { ...current, pendingFingerprint: "page-1:new-stroke" }
          : { ...current, session: {} };
      storeReady.resolve();
      await publishEmpty;
      expect(clear).not.toHaveBeenCalled();
      expect(await session.readLatest()).toMatchObject({ state: "snapshot", payload: { pagesList: first.pagesList } });
    } finally {
      storeReady.resolve();
      await session.dispose();
    }
  });

  it("실제 호스트의 빈 원고 조기 반환 전에 내구 세대·대기 획·현재 편집 세대를 함께 판단한다", () => {
    const host = readFileSync(new URL("./StudioCuttoonEditorHost.tsx", import.meta.url), "utf8");
    const start = host.indexOf("let hasExistingAutosaveAuthority =");
    const end = host.indexOf("if (!hasMeaningfulAutosaveContent && !hasExistingAutosaveAuthority) return;", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const gate = host.slice(start, end);
    expect(gate).toContain("studioEmptyAutosaveNeedsTombstone");
    expect(gate).toContain("studioLifecycleDurableGenerationRef.current");
    expect(gate).toContain("studioLifecycleDurablePendingFingerprintRef.current");
    expect(gate).toContain("studioRevisionProjectGenerationRef.current");
    expect(gate).toContain("globalThis.localStorage.getItem(autosaveKey)");
  });
});
