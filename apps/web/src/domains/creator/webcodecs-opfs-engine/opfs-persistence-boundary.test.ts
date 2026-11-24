import { describe, expect, it } from "vitest";

import { createSeededWebtoonVcs, OpfsSnapshotVcsEngine, type VcsProjectSnapshot } from "./opfs-snapshot-vcs";
import {
  BrowserOpfsVfsAdapter,
  createOpfsVfsAdapter,
  computeContentAddressHash,
  InMemoryVfsAdapter,
  type OpfsDirectoryHandleLike,
  type OpfsFileHandleLike,
} from "./opfs-vfs-adapter";

function directoryTree() {
  const files = new Map<string, Uint8Array>();
  const directories = new Set([""]);
  const faults = new Map<string, string>();
  function fail(operation: string, path: string) {
    const key = `${operation}:${path}`;
    const name = faults.get(key) ?? [...faults].find(([pattern]) => pattern.endsWith("*") && key.startsWith(pattern.slice(0, -1)))?.[1];
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

  it("연속 저장을 동시에 요청해도 두 승인 버전이 같은 이력에 남는다", async () => {
    const adapter = new BrowserOpfsVfsAdapter(directoryTree().root);
    const engine = new OpfsSnapshotVcsEngine({ adapter });
    await engine.init();
    const [first, second] = await Promise.all([
      engine.commit(snapshot, { message: "연속 첫 저장" }),
      engine.commit({ ...snapshot, title: "연속 다음 저장" }, { message: "연속 다음 저장" }),
    ]);
    expect(second.parentId).toBe(first.id);
    const reopened = new OpfsSnapshotVcsEngine({ adapter });
    await reopened.init();
    expect(reopened.getCommitHistory().map(commit => commit.id)).toEqual([second.id, first.id]);
  });

  it("분기·전환·저장 요청이 겹쳐도 요청 순서와 이전 브랜치를 보존한다", async () => {
    const adapter = new BrowserOpfsVfsAdapter(directoryTree().root);
    const engine = new OpfsSnapshotVcsEngine({ adapter });
    await engine.init();
    const original = await engine.commit(snapshot, { message: "원본" });
    const [, , saved] = await Promise.all([
      engine.createBranch("alternate"),
      engine.checkoutBranch("alternate"),
      engine.commit({ ...snapshot, title: "다른 분기 작업" }, { message: "분기 저장" }),
    ]);
    expect(saved.branchName).toBe("alternate");
    expect(saved.parentId).toBe(original.id);
    expect(engine.currentHeadCommitId).toBe(saved.id);
    await engine.checkoutBranch("main");
    expect(engine.currentHeadCommitId).toBe(original.id);
  });

  it("청크 쓰기 중단 뒤 남은 빈 파일을 재시도 때 정상 데이터로 복구한다", async () => {
    const tree = directoryTree();
    const adapter = new BrowserOpfsVfsAdapter(tree.root);
    const engine = new OpfsSnapshotVcsEngine({ adapter });
    await engine.init();
    tree.faults.set("write:objects/chunks/*", "QuotaExceededError");
    await expect(engine.commit(snapshot, { message: "용량 부족" })).rejects.toMatchObject({ name: "QuotaExceededError" });
    tree.faults.clear();
    const saved = await engine.commit(snapshot, { message: "재시도" });
    expect((await engine.verifyIntegrity(saved.id)).valid).toBe(true);
    const reopened = new OpfsSnapshotVcsEngine({ adapter });
    await reopened.init();
    expect(reopened.currentHeadCommitId).toBe(saved.id);
    expect(await reopened.restoreCommit(saved.id)).toEqual(snapshot);
  });

  it("실패한 후속 커밋의 빈 manifest가 남아도 기존 원고를 다시 연다", async () => {
    const tree = directoryTree();
    const adapter = new BrowserOpfsVfsAdapter(tree.root);
    const engine = new OpfsSnapshotVcsEngine({ adapter });
    await engine.init();
    const original = await engine.commit(snapshot, { message: "보존할 원본" });
    tree.faults.set("write:objects/commits/*", "QuotaExceededError");
    await expect(engine.commit({ ...snapshot, title: "실패" }, { message: "후속 실패" }))
      .rejects.toMatchObject({ name: "QuotaExceededError" });
    tree.faults.clear();
    const reopened = new OpfsSnapshotVcsEngine({ adapter });
    await reopened.init();
    expect(reopened.currentHeadCommitId).toBe(original.id);
    expect(reopened.getCommitHistory()).toHaveLength(1);
    expect(await reopened.restoreCommit(original.id)).toEqual(snapshot);
  });

  it("이미 확인한 청크도 실제 파일이 손상되면 캐시를 믿고 재사용하지 않는다", async () => {
    const tree = directoryTree();
    const adapter = new BrowserOpfsVfsAdapter(tree.root);
    const engine = new OpfsSnapshotVcsEngine({ adapter });
    await engine.init();
    const original = await engine.commit(snapshot, { message: "원본" });
    const chunk = await computeContentAddressHash(snapshot.layers[0]?.payload ?? new Uint8Array());
    await adapter.writeFile(`objects/chunks/${chunk}`, new Uint8Array());
    expect((await engine.verifyIntegrity(original.id)).valid).toBe(false);
    const saved = await engine.commit(snapshot, { message: "조각 복구" });
    expect((await engine.verifyIntegrity(original.id)).valid).toBe(true);
    expect((await engine.verifyIntegrity(saved.id)).valid).toBe(true);
  });

  it("실제 저장 이력이 참조하는 빈 manifest는 예제로 덮지 않고 거절한다", async () => {
    const tree = directoryTree();
    const adapter = new BrowserOpfsVfsAdapter(tree.root);
    const engine = new OpfsSnapshotVcsEngine({ adapter });
    await engine.init();
    const first = await engine.commit(snapshot, { message: "원본" });
    const latest = await engine.commit({ ...snapshot, title: "최신" }, { message: "후속" });
    await adapter.writeFile(`objects/commits/${first.id}.json`, new Uint8Array());
    await expect(createSeededWebtoonVcs(adapter)).rejects.toThrow("기존 저장 이력이 참조하는 커밋");
    expect(new TextDecoder().decode(tree.files.get("refs/heads/main"))).toBe(latest.id);
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
