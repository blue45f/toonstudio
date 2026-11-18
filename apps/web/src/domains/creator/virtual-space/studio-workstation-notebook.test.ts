import { describe, expect, it, vi } from "vitest";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";
import { accessWorkstationNotebook, type WorkstationMark } from "./studio-workstation-notebook";

function storage() {
  const rows = new Map<string, string>();
  const store: StudioAsyncKeyValueStore = {
    async get(key) { return rows.get(key) ?? null; },
    async set(key, value) { rows.set(key, value); },
    async delete(key) { rows.delete(key); },
  };
  return { rows, store };
}
const stroke: WorkstationMark = { kind: "stroke", id: "red", color: "#f43f5e", points: [[10, 11], [240, 90]] };
const stamp: WorkstationMark = { kind: "stamp", id: "review", stamp: "🔧 구도 리테이크" };
const stage: WorkstationMark = { kind: "stage", id: "to-color", cutId: "cut-18" };

describe("개인 작업대 SQLite 기록", () => {
  it("같은 작업대의 동시 쓰기를 합치고 재시도한 획과 인계를 한 번만 재생한다", async () => {
    const { store } = storage();
    const access = (marks: WorkstationMark[]) => accessWorkstationNotebook("A", marks, () => true, false, async () => store);
    await Promise.all([access([stroke]), access([stamp]), access([stage, stroke]), access([stage])]);
    expect(await access([])).toEqual([stroke, stamp, stage]);
  });
  it("계정, 게스트, 작품, 스테이션마다 독립된 기록을 연다", async () => {
    const { store } = storage();
    const key = (owner: string, actor: string, work: string, station: string) => JSON.stringify([owner, actor, work, station]);
    const first = key("account", "a", "project", "ink");
    await accessWorkstationNotebook(first, [stroke], () => true, false, async () => store);
    for (const sibling of [key("guest","a","project","ink"), key("account","b","project","ink"), key("account","a","other","ink"), key("account","a","project","color")]) {
      expect(await accessWorkstationNotebook(sibling, [], () => true, false, async () => store)).toEqual([]);
    }
  });
  it("저장소 응답을 기다리는 동안 계정이 바뀌면 이전 사용자의 변경을 기록하지 않는다", async () => {
    const { rows, store } = storage();
    let same = true;
    const get = vi.spyOn(store, "get").mockImplementation(async () => { same = false; return null; });
    await expect(accessWorkstationNotebook("account", [stroke], () => same, false, async () => store)).rejects.toThrow("사용자");
    expect(get).toHaveBeenCalledOnce();
    expect(rows.size).toBe(0);
  });
  it("공간 부족과 읽기 실패가 기존 기록을 지우지 않으며 다음 재시도에서 복원한다", async () => {
    const { rows, store } = storage();
    const load = (marks: WorkstationMark[]) => accessWorkstationNotebook("A", marks, () => true, false, async () => store);
    await load([stroke]);
    vi.spyOn(store, "set").mockRejectedValueOnce(new Error("QuotaExceededError"));
    await expect(load([stamp])).rejects.toThrow("Quota");
    expect(await load([stamp])).toEqual([stroke, stamp]);
    vi.spyOn(store, "get").mockRejectedValueOnce(new Error("OPFS unavailable"));
    await expect(load([stage])).rejects.toThrow("OPFS");
    expect(await load([])).toEqual([stroke, stamp]);
    rows.set("A", '{"version":2,"marks":[]}');
    await expect(load([stage])).rejects.toThrow();
    expect(rows.get("A")).toBe('{"version":2,"marks":[]}');
  });
});
