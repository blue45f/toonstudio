import { describe, expect, it, vi } from "vitest";

import type { StudioAutosavePayload } from "../studio-autosave";
import { commitImportedDocumentAutosaves } from "./studio-imported-document-autosaves";
import { importedTestPorts } from "./studio-project-package-import-test-fixture";

function fixture() {
  const storage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: () => null, length: 0 };
  const ports = importedTestPorts(storage);
  const snapshots = ["a", "b"].map(key => ({
    key, payload: {
      version: 2, savedAt: "2026-11-01T12:00:00.000Z", sourceWorkId: "remote-work", sourceRevision: 81,
      pagesList: [{ id: "p", elements: [{ type: "draw", id: key, points: [2, 3, 6, 5], pressures: [0, 0] }] }],
    } satisfies StudioAutosavePayload,
  }));
  return { storage, ports, snapshots, publish: vi.fn(() => "project") };
}

describe("가져온 원고의 내구 저장", () => {
  it("두 원고가 쓰인 뒤에만 새 프로젝트를 공개하고, 원격 편집 권한과 버전은 복사하지 않는다", async () => {
    const entry = fixture();
    expect(await commitImportedDocumentAutosaves(entry)).toBe("project");
    const sqlite = await entry.ports.acquireSqlite();
    for (const { key, payload } of entry.snapshots) {
      expect(await sqlite.read(key)).toEqual({ state: "snapshot", savedAt: payload.savedAt,
        payload: { version: 2, savedAt: payload.savedAt, pagesList: payload.pagesList } });
    }
    expect(entry.storage.setItem).not.toHaveBeenCalled();
  });

  it("두 번째 원고의 기존 기록·삭제 표식을 보존하고 새 원고만 정리한다", async () => {
    for (const state of ["snapshot", "cleared"]) {
      const entry = fixture();
      const sqlite = await entry.ports.acquireSqlite();
      if (state === "snapshot") await sqlite.write("b", entry.snapshots[1]!.payload);
      else await sqlite.clear("b");
      const original = await sqlite.read("b");
      await expect(commitImportedDocumentAutosaves(entry)).rejects.toThrow("기존 원고");
      expect(await sqlite.read("b")).toEqual(original);
      expect(await sqlite.read("a")).toMatchObject({ state: "cleared" });
      expect(entry.publish).not.toHaveBeenCalled();
    }
  });

  it("두 번째 문서의 디스크 쓰기가 실패하면 앞선 원고를 롤백하고 같은 파일로 다시 시도할 수 있다", async () => {
    const entry = fixture();
    const sqlite = await entry.ports.acquireSqlite();
    const unavailable = { ...sqlite, write: async (...args: Parameters<typeof sqlite.write>) => {
      if (args[0] === "b") throw new DOMException("디스크 부족", "QuotaExceededError");
      await sqlite.write(...args);
    } };
    await expect(commitImportedDocumentAutosaves({ ...entry, ports: {
      ...entry.ports, acquireSqlite: async () => unavailable,
    } })).rejects.toThrow();
    expect(entry.publish).not.toHaveBeenCalled();
    expect(await sqlite.read("a")).toMatchObject({ state: "cleared" });
    const fresh = entry.snapshots.map(snapshot => ({ ...snapshot, key: snapshot.key + "-retry" }));
    expect(await commitImportedDocumentAutosaves({ ...entry, snapshots: fresh })).toBe("project");
    expect(await sqlite.read("b-retry")).toMatchObject({ state: "snapshot" });
  });

  it("저장 도중 취소되면 프로젝트를 만들지 않고 새 원고의 내구 기록만 폐기한다", async () => {
    const entry = fixture(), controller = new AbortController();
    const sqlite = await entry.ports.acquireSqlite(), write = sqlite.write;
    const sqliteDuringAbort = { ...sqlite, write: async (...args: Parameters<typeof write>) => {
      await write(...args);
      controller.abort();
    } };
    await expect(commitImportedDocumentAutosaves({ ...entry, signal: controller.signal,
      ports: { ...entry.ports, acquireSqlite: async () => sqliteDuringAbort },
    })).rejects.toMatchObject({ name: "AbortError" });
    expect(await sqlite.read("a")).toMatchObject({ state: "cleared" });
    expect(await sqlite.read("b")).toBeNull();
    expect(entry.publish).not.toHaveBeenCalled();
  });

  it("다른 탭의 쓰기 임대 또는 두 내구 저장소의 사용 불가를 빈 프로젝트 성공으로 처리하지 않는다", async () => {
    const entry = fixture(), open = entry.ports.openDocument;
    await expect(commitImportedDocumentAutosaves({ ...entry, ports: {
      ...entry.ports, openDocument: async key => ({ ...await open(key), role: "follower" }),
    } })).rejects.toThrow("다른 탭");
    await expect(commitImportedDocumentAutosaves({ ...entry, ports: {
      ...entry.ports, acquireSqlite: async () => { throw new Error("QuotaExceededError"); },
    } })).rejects.toThrow("저장소를 열 수 없습니다");
    expect(entry.publish).not.toHaveBeenCalled();
  });
});
