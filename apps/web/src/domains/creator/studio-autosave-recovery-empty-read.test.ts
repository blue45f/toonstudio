import { describe, expect, it, vi } from "vitest";
import { FakeAutosaveJournal, payload, session } from "./live/studio-autosave-opfs-test-fixtures";
import { reconcileStudioAutosaveWithOpfsPrimary } from "./studio-autosave-opfs-session";
import type { StudioAutosaveSqlitePort } from "./studio-autosave-sqlite-store";

const key = "recovery-visit";
const storage = { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() };
const saved = payload("2026-07-30T04:00:00.000Z", "retained-stroke");

describe("공동 원고 첫 복구 검사에서 영속 저장소의 빈 상태 판정", () => {
  it.each(["opfs", "sqlite"] as const)("%s 읽기에 한 번 실패하면 다음 검사에서 보관된 획을 찾는다", async failed => {
    const target = session(new FakeAutosaveJournal(), key);
    const read = vi.fn<StudioAutosaveSqlitePort["read"]>().mockResolvedValue(null);
    const sqlite = { read, write: vi.fn(), clear: vi.fn() };
    if (failed === "opfs") {
      await target.write(saved);
      vi.spyOn(target, "readLatest").mockRejectedValueOnce(new Error("OPFS read failed"));
    } else {
      read.mockRejectedValueOnce(new Error("SQLite read failed"))
        .mockResolvedValueOnce({ state: "snapshot", savedAt: saved.savedAt, payload: saved });
    }
    const input = { session: target, sqlite, storage, key };
    const partial = await reconcileStudioAutosaveWithOpfsPrimary(input);
    expect(partial.candidate).toBeNull();
    expect(partial.authority).toBe(failed === "opfs" ? "sqlite-fallback" : "opfs-journal");
    expect(partial.emptyReadIncomplete).toBe(true);
    const retried = await reconcileStudioAutosaveWithOpfsPrimary(input);
    expect(retried.candidate?.payload.pagesList).toMatchObject([{ elements: [{ id: "retained-stroke" }] }]);
  });

  it("두 저장소를 모두 읽고 빈 값이면 최초 검사를 마칠 수 있다", async () => {
    const result = await reconcileStudioAutosaveWithOpfsPrimary({
      session: session(new FakeAutosaveJournal(), key), key, storage,
      sqlite: { read: async () => null, write: vi.fn(), clear: vi.fn() },
    });
    expect(result.authority).toBe("opfs-journal");
    expect(result.candidate).toBeNull();
    expect(result.emptyReadIncomplete).toBeFalsy();
  });
});
