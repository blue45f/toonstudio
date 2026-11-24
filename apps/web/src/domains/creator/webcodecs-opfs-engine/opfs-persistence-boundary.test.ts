import { describe, expect, it } from "vitest";

import { createSeededWebtoonVcs, OpfsSnapshotVcsEngine, type VcsProjectSnapshot } from "./opfs-snapshot-vcs";
import {
  BrowserOpfsVfsAdapter,
  createOpfsVfsAdapter,
  InMemoryVfsAdapter,
  type OpfsDirectoryHandleLike,
  type OpfsFileHandleLike,
} from "./opfs-vfs-adapter";

function directoryTree() {
  const files = new Map<string, Uint8Array>();
  const directories = new Set([""]);
  const faults = new Map<string, string>();
  function fail(operation: string, path: string) {
    const name = faults.get(`${operation}:${path}`);
    if (name) throw new DOMException("테스트 저장 실패", name);
  }
  function directory(prefix = ""): OpfsDirectoryHandleLike {
    const full = (name: string) => prefix ? `${prefix}/${name}` : name;
    return {
      async getDirectoryHandle(name, options) {
        const path = full(name);
        fail("directory", path);
        if (!directories.has(path)) {
          if (!options?.create) throw new DOMException("디렉터리 없음", "NotFoundError");
          directories.add(path);
        }
        return directory(path);
      },
      async getFileHandle(name, options): Promise<OpfsFileHandleLike> {
        const path = full(name);
        fail("file", path);
        if (!files.has(path)) {
          if (!options?.create) throw new DOMException("파일 없음", "NotFoundError");
          files.set(path, new Uint8Array());
        }
        return {
          async getFile() {
            fail("read", path);
            const copy = new Uint8Array(files.get(path) ?? []);
            return { arrayBuffer: async () => copy.buffer };
          },
          async createWritable() {
            let pending = new Uint8Array();
            return {
              async write(data) {
                fail("write", path);
                pending = typeof data === "string" ? new TextEncoder().encode(data) : new Uint8Array(data);
              },
              async close() {
                fail("close", path);
                files.set(path, pending);
              },
            };
          },
        };
      },
      async removeEntry(name) {
        fail("remove", full(name));
        if (!files.delete(full(name))) throw new DOMException("파일 없음", "NotFoundError");
      },
      async *keys() {
        fail("list", prefix);
        const root = prefix ? `${prefix}/` : "";
        for (const path of files.keys()) {
          const tail = path.slice(root.length);
          if (path.startsWith(root) && tail && !tail.includes("/")) yield tail;
        }
      },
    };
  }
  return { root: directory(), files, faults };
}

const snapshot: VcsProjectSnapshot = {
  projectId: "persistence-boundary", title: "저장 경계 검증", canvasWidth: 10, canvasHeight: 10,
  layers: [{ layerId: "line", name: "선화", kind: "raster", opacity: 1, visible: true,
    blendMode: "normal", payload: new Uint8Array([1, 2, 3]) }],
};

describe("OPFS 실제 저장 실패와 재열기 경계", () => {
  it("지원되는 OPFS의 접근·용량 오류를 메모리 성공으로 바꾸지 않는다", async () => {
    for (const name of ["NotAllowedError", "QuotaExceededError"]) {
      await expect(createOpfsVfsAdapter({ getDirectoryOverride: async () => {
        throw new DOMException("접근 실패", name);
      } })).rejects.toMatchObject({ name });
      const tree = directoryTree();
      tree.faults.set("directory:toonstudio-vcs", name);
      await expect(createOpfsVfsAdapter({ getDirectoryOverride: async () => tree.root }))
        .rejects.toMatchObject({ name });
    }
  });

  it("하위 디렉터리를 못 만들면 커밋과 head가 성공하지 않는다", async () => {
    const tree = directoryTree();
    const adapter = new BrowserOpfsVfsAdapter(tree.root);
    const engine = new OpfsSnapshotVcsEngine({ adapter });
    await engine.init();
    tree.faults.set("directory:objects", "QuotaExceededError");
    await expect(engine.commit(snapshot, { message: "실패해야 할 저장" }))
      .rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(engine.currentHeadCommitId).toBeNull();
    expect(engine.getCommitHistory()).toEqual([]);
    tree.faults.clear();
    const reopened = new OpfsSnapshotVcsEngine({ adapter });
    await reopened.init();
    expect(reopened.currentHeadCommitId).toBeNull();
    expect(reopened.getCommitHistory()).toEqual([]);
  });

  it.each(["file", "read", "list"])("%s 접근 거부를 비어 있는 저장소로 처리하지 않는다", async (operation) => {
    const tree = directoryTree();
    const adapter = new BrowserOpfsVfsAdapter(tree.root);
    const engine = new OpfsSnapshotVcsEngine({ adapter });
    await engine.init();
    const committed = await engine.commit(snapshot, { message: "원본" });
    const before = new Uint8Array(tree.files.get("HEAD") ?? []);
    tree.faults.set(`${operation}:${operation === "list" ? "refs/heads" : "HEAD"}`, "NotAllowedError");
    await expect(createSeededWebtoonVcs(adapter)).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(tree.files.get("HEAD")).toEqual(before);
    tree.faults.clear();
    const reopened = new OpfsSnapshotVcsEngine({ adapter });
    await reopened.init();
    expect(reopened.currentHeadCommitId).toBe(committed.id);
    expect(await reopened.restoreCommit(committed.id)).toEqual(snapshot);
  });

  it("ref 저장 실패 뒤 현재 head와 재열기 head를 보존한다", async () => {
    const tree = directoryTree();
    const adapter = new BrowserOpfsVfsAdapter(tree.root);
    const engine = new OpfsSnapshotVcsEngine({ adapter });
    await engine.init();
    const original = await engine.commit(snapshot, { message: "원본" });
    tree.faults.set("write:refs/heads/main", "QuotaExceededError");
    await expect(engine.commit({ ...snapshot, title: "저장 실패" }, { message: "후속" }))
      .rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(engine.currentHeadCommitId).toBe(original.id);
    tree.faults.clear();
    const reopened = new OpfsSnapshotVcsEngine({ adapter });
    await reopened.init();
    expect(reopened.currentHeadCommitId).toBe(original.id);
    expect(await reopened.restoreCommit(original.id)).toEqual(snapshot);
  });

  it("이미 저장된 사용자 작업·선택 브랜치를 예제 데이터로 덮지 않는다", async () => {
    const adapter = new InMemoryVfsAdapter();
    const initial = await createSeededWebtoonVcs(adapter);
    await initial.engine.createBranch("author-draft");
    await initial.engine.checkoutBranch("author-draft");
    const userSnapshot = { ...snapshot, title: "사용자가 수정한 원고" };
    const userCommit = await initial.engine.commit(userSnapshot, { message: "실제 사용자 수정" });
    const history = initial.engine.getCommitHistory();
    const reopened = await createSeededWebtoonVcs(adapter);
    expect(reopened.engine.currentBranch).toBe("author-draft");
    expect(reopened.engine.currentHeadCommitId).toBe(userCommit.id);
    expect(reopened.engine.getCommitHistory()).toEqual(history);
    expect(reopened.latestSnapshot).toEqual(userSnapshot);
  });

  it("브랜치 전환 저장이 실패하면 이전 브랜치와 저장본을 유지한다", async () => {
    const tree = directoryTree();
    const adapter = new BrowserOpfsVfsAdapter(tree.root);
    const engine = new OpfsSnapshotVcsEngine({ adapter });
    await engine.init();
    const committed = await engine.commit(snapshot, { message: "원본" });
    await engine.createBranch("alternate");
    tree.faults.set("write:HEAD", "QuotaExceededError");
    await expect(engine.checkoutBranch("alternate")).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(engine.currentBranch).toBe("main");
    tree.faults.clear();
    const reopened = new OpfsSnapshotVcsEngine({ adapter });
    await reopened.init();
    expect(reopened.currentBranch).toBe("main");
    expect(reopened.currentHeadCommitId).toBe(committed.id);
  });

  it("이전 버전 복원 ref 저장이 실패하면 최신 사용자 커밋을 유지한다", async () => {
    const tree = directoryTree();
    const adapter = new BrowserOpfsVfsAdapter(tree.root);
    const engine = new OpfsSnapshotVcsEngine({ adapter });
    await engine.init();
    const first = await engine.commit(snapshot, { message: "원본" });
    const latest = await engine.commit({ ...snapshot, title: "최신 작업" }, { message: "후속" });
    tree.faults.set("write:refs/heads/main", "QuotaExceededError");
    await expect(engine.rollbackToCommit(first.id, { createRollbackCommit: false }))
      .rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(engine.currentHeadCommitId).toBe(latest.id);
    tree.faults.clear();
    const reopened = new OpfsSnapshotVcsEngine({ adapter });
    await reopened.init();
    expect(reopened.currentHeadCommitId).toBe(latest.id);
  });
});
