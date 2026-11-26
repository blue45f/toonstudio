import { describe, expect, it, vi } from "vitest";

import { InMemoryCasBlobStore, OpfsCasBranchTimeline } from "./opfs-cas-branching-and-dht-p2p";

function deferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("CAS 비동기 저장의 브랜치 소유권", () => {
  it("같은 브랜치의 동시 저장을 연결해 두 타일을 모두 보존한다", async () => {
    const timeline = new OpfsCasBranchTimeline({ gridSize: 2 });
    const red = new Uint8Array([255, 0, 0, 255]);
    const blue = new Uint8Array([0, 0, 255, 255]);
    const [first, second] = await Promise.all([
      timeline.commitTiles([{ x: 0, y: 0, bytes: red }], "첫 타일"),
      timeline.commitTiles([{ x: 1, y: 0, bytes: blue }], "둘째 타일"),
    ]);

    expect(second.parentCommitId).toBe(first.commitId);
    expect(timeline.getHeadCommit().nonEmptyTileCount).toBe(2);
    expect(await timeline.readTile(0, 0)).toEqual(red);
    expect(await timeline.readTile(1, 0)).toEqual(blue);
  });

  it("저장 중 브랜치를 바꿔도 시작한 브랜치에만 반영한다", async () => {
    const store = new InMemoryCasBlobStore();
    const timeline = new OpfsCasBranchTimeline({ gridSize: 2, store });
    const base = await timeline.commitTiles([{ x: 0, y: 0, bytes: new Uint8Array([1]) }], "기본 원고");
    timeline.createBranch("alternate");
    timeline.checkoutBranch("alternate");
    const alternate = await timeline.commitTiles([{ x: 1, y: 1, bytes: new Uint8Array([2]) }], "대안 원고");
    timeline.checkoutBranch("main");
    const started = deferred();
    const release = deferred();
    const put = store.put.bind(store);
    vi.spyOn(store, "put").mockImplementationOnce(async (hash, bytes) => {
      started.resolve();
      await release.promise;
      return put(hash, bytes);
    });

    const saving = timeline.commitTiles([{ x: 1, y: 0, bytes: new Uint8Array([3]) }], "메인 편집");
    await started.promise;
    timeline.checkoutBranch("alternate");
    release.resolve();
    const saved = await saving;

    expect(saved.branchName).toBe("main");
    expect(saved.parentCommitId).toBe(base.commitId);
    expect(timeline.currentBranch).toBe("alternate");
    expect(timeline.getHeadCommit("alternate").commitId).toBe(alternate.commitId);
    expect(timeline.getHeadCommit("main").commitId).toBe(saved.commitId);
    expect(await timeline.readTile(1, 1)).toEqual(new Uint8Array([2]));
    expect(await timeline.readTile(1, 0)).toBeNull();
  });

  it("실패한 저장 뒤에 대기한 편집은 정상 저장된다", async () => {
    const store = new InMemoryCasBlobStore();
    const timeline = new OpfsCasBranchTimeline({ gridSize: 2, store });
    vi.spyOn(store, "put").mockRejectedValueOnce(new Error("저장소 일시 오류"));
    const failed = timeline.commitTiles([{ x: 0, y: 0, bytes: new Uint8Array([1]) }], "실패");
    const next = timeline.commitTiles([{ x: 1, y: 0, bytes: new Uint8Array([2]) }], "재개");
    await expect(failed).rejects.toThrow("저장소 일시 오류");
    await next;
    expect(await timeline.readTile(0, 0)).toBeNull();
    expect(await timeline.readTile(1, 0)).toEqual(new Uint8Array([2]));
  });

  it("다른 브랜치의 저장은 지연된 브랜치를 기다리지 않는다", async () => {
    const store = new InMemoryCasBlobStore();
    const timeline = new OpfsCasBranchTimeline({ gridSize: 2, store });
    timeline.createBranch("alternate");
    const release = deferred();
    const put = store.put.bind(store);
    vi.spyOn(store, "put").mockImplementationOnce(async (hash, bytes) => {
      await release.promise;
      return put(hash, bytes);
    });
    const mainSave = timeline.commitTiles([{ x: 0, y: 0, bytes: new Uint8Array([1]) }], "메인");
    timeline.checkoutBranch("alternate");
    const alternate = await timeline.commitTiles([{ x: 1, y: 0, bytes: new Uint8Array([2]) }], "대안");
    expect(alternate.branchName).toBe("alternate");
    release.resolve();
    const main = await mainSave;
    expect(main.branchName).toBe("main");
    expect(timeline.getHeadCommit("alternate").commitId).toBe(alternate.commitId);
  });

  it("저장 중인 브랜치의 동기 복원을 거부하고 저장 완료 뒤 허용한다", async () => {
    const store = new InMemoryCasBlobStore();
    const timeline = new OpfsCasBranchTimeline({ gridSize: 2, store });
    const initial = timeline.getHeadCommit().commitId;
    const release = deferred();
    const put = store.put.bind(store);
    vi.spyOn(store, "put").mockImplementationOnce(async (hash, bytes) => {
      await release.promise;
      return put(hash, bytes);
    });
    const saving = timeline.commitTiles([{ x: 0, y: 0, bytes: new Uint8Array([1]) }], "저장");
    expect(() => timeline.restoreToCommit(initial)).toThrow("저장 중인 브랜치");
    release.resolve();
    await saving;
    const restored = timeline.restoreToCommit(initial);
    expect(restored.nonEmptyTileCount).toBe(0);
  });
});
