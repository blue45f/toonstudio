import { describe, expect, it, vi } from "vitest";
import {
  readStudioAutosave, serializeStudioAutosave, writeStudioLifecycleAutosave,
  StudioAutosaveUnsupportedVersionError, type StudioAutosavePayload,
} from "../studio-autosave";
import { createStudioAutosaveSqliteStore, studioAutosaveSqliteLastKnownGoodKey } from "../studio-autosave-sqlite-store";
import { StudioAutosaveOpfsSession, persistStudioAutosaveWithOpfsPrimary, reconcileStudioAutosaveWithOpfsPrimary, type StudioAutosaveOpfsJournalPort } from "../studio-autosave-opfs-session";
import type { StudioOpfsRecoveryEntry } from "../studio-opfs-recovery-journal";

const SAVED_AT = "2026-11-04T00:00:00.000Z";
const PAYLOAD: StudioAutosavePayload = { version: 2, savedAt: SAVED_AT, pagesList: [{ id: "p1", elements: [{ id: "line", type: "draw" }] }] };
const FUTURE = { kind: "studio-six-pass-lt-autosave", version: 5, payload: { version: 5 } };
function memoryStorage(initial: Readonly<Record<string, string>> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
function sqliteEnvelope(payload: string) {
  return JSON.stringify({ kind: "toonspectrum:studio-autosave-sqlite", version: 1, state: "snapshot", savedAt: SAVED_AT, payload });
}

describe("미지원 복구본 보존", () => {
  it.each([
    { kind: "toonstudio-lifecycle-recovery-journal", version: 2, candidates: [] },
    { kind: "toonstudio-lifecycle-recovery-journal", version: 1, candidates: [FUTURE] },
    { kind: "toonstudio-lifecycle-recovery-journal", version: 1, candidates: [{ ...FUTURE, version: 4 }] },
  ])("미래 journal·후보·wrapper 내부 버전은 읽기와 append/삭제에서 거부한다: %j", (journal) => {
    const storage = memoryStorage({ draft: serializeStudioAutosave(PAYLOAD), "draft:lifecycle": JSON.stringify(journal) });
    const before = new Map(storage.values);
    expect(() => readStudioAutosave(storage, "draft")).toThrow(StudioAutosaveUnsupportedVersionError);
    expect(() => writeStudioLifecycleAutosave(storage, "draft", PAYLOAD, { preservePrimary: false })).toThrow(StudioAutosaveUnsupportedVersionError);
    expect(storage.values).toEqual(before);
  });

  it("SQLite는 관측한 미래 primary를 이전 세대로 대체하거나 긴급 쓰기로 덮어쓰지 않는다", async () => {
    const future = sqliteEnvelope(JSON.stringify(FUTURE));
    const values = new Map([["draft", future], [studioAutosaveSqliteLastKnownGoodKey("draft"), sqliteEnvelope(serializeStudioAutosave(PAYLOAD))]]);
    const database = { kvGet: async (_namespace: string, key: string) => values.get(key) ?? null,
      kvSet: async (_namespace: string, key: string, value: string) => { values.set(key, value); } };
    const store = createStudioAutosaveSqliteStore(database);
    await expect(store.read("draft")).rejects.toBeInstanceOf(StudioAutosaveUnsupportedVersionError);
    await expect(store.write("draft", PAYLOAD)).rejects.toBeInstanceOf(StudioAutosaveUnsupportedVersionError);
    await expect(store.write("draft", PAYLOAD, { mode: "emergency" })).rejects.toBeInstanceOf(StudioAutosaveUnsupportedVersionError);
    await expect(store.clear("draft")).rejects.toBeInstanceOf(StudioAutosaveUnsupportedVersionError);
    expect(values.get("draft")).toBe(future);
  });

  it.each([true, false])("SQLite의 미래 recovery 세대를 primary 유무(%s)와 관계없이 정상 쓰기 전에 보존한다", async (hasPrimary) => {
    const recoveryKey = studioAutosaveSqliteLastKnownGoodKey("draft");
    const future = sqliteEnvelope(JSON.stringify(FUTURE));
    const values = new Map([[recoveryKey, future]]);
    if (hasPrimary) values.set("draft", sqliteEnvelope(serializeStudioAutosave(PAYLOAD)));
    const before = new Map(values);
    const store = createStudioAutosaveSqliteStore({ kvGet: async (_namespace, key) => values.get(key) ?? null,
      kvSet: async (_namespace, key, value) => { values.set(key, value); } });
    await expect(store.write("draft", PAYLOAD)).rejects.toBeInstanceOf(StudioAutosaveUnsupportedVersionError);
    expect(values).toEqual(before);
  });

  it("OPFS는 미래 entry를 읽기·compact·fallback 전에 거부하고 원본 바이트를 남긴다", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ kind: "toonspectrum:studio-autosave-opfs-checkpoint", version: 1,
      state: "snapshot", savedAt: SAVED_AT, autosaveKeyDigest: "future", payloadDigest: "future", payload: JSON.stringify(FUTURE) }));
    const originalBytes = bytes.slice();
    const entry: StudioOpfsRecoveryEntry = { kind: "checkpoint", id: "future", sequence: 1, pageId: "document", revision: 1,
      documentId: "doc", documentVersion: 2, engineVersion: "studio-autosave-v2", writerEpoch: 1, createdAt: 1,
      byteLength: bytes.byteLength, chunks: [], compactThroughSequence: 0, descriptorPath: "entry", descriptorCrc32: 0 };
    const append = vi.fn(async () => { throw new Error("미래 entry 뒤에 쓰면 안 됩니다."); });
    const evict = vi.fn(async () => undefined);
    const journal: StudioAutosaveOpfsJournalPort = {
      scan: async () => ({ generation: 1, writerEpoch: 1, lastSequence: 1, totalPayloadBytes: bytes.byteLength, entries: [entry], selectedSlot: "a", ignoredSlots: [] }),
      readPayload: async function* () { yield bytes; },
      acquireWriter: async () => { throw new Error("writer acquisition 이전에 거부해야 합니다."); },
      renewWriter: async () => { throw new Error("lease renewal 이전에 거부해야 합니다."); },
      releaseWriter: async () => undefined, appendCheckpoint: append, evictObsolete: evict,
    };
    const session = new StudioAutosaveOpfsSession({ autosaveKey: "draft", ownerId: "test", journal });
    const storage = memoryStorage();
    await expect(session.readLatest()).rejects.toBeInstanceOf(StudioAutosaveUnsupportedVersionError);
    await expect(session.write(PAYLOAD)).rejects.toBeInstanceOf(StudioAutosaveUnsupportedVersionError);
    await expect(reconcileStudioAutosaveWithOpfsPrimary({ session, storage, key: "draft" })).rejects.toBeInstanceOf(StudioAutosaveUnsupportedVersionError);
    const sqliteWrite = vi.fn(async () => undefined);
    await expect(persistStudioAutosaveWithOpfsPrimary({ session, storage, key: "draft", payload: PAYLOAD,
      sqlite: { read: async () => null, write: sqliteWrite, clear: async () => undefined } })).rejects.toBeInstanceOf(StudioAutosaveUnsupportedVersionError);
    expect(append).not.toHaveBeenCalled();
    expect(evict).not.toHaveBeenCalled();
    expect(sqliteWrite).not.toHaveBeenCalled();
    expect(bytes).toEqual(originalBytes);
    await session.dispose();
  });
});
