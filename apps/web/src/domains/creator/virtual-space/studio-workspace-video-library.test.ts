import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

import { acquireProductStudioAssetCasStore } from "../studio-asset-library-sqlite-opfs-repository";
import { openStudioLocalDatabase, type StudioLocalDatabase, type StudioSqliteApiHandle } from "../studio-local-database";
import { acquireStudioLocalDatabase } from "../studio-local-database-runtime";
import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import { readLegacyWorkspaceVideo } from "./studio-workspace-video-legacy";
import { listWorkspaceVideos, readWorkspaceVideo, removeWorkspaceVideo, saveWorkspaceVideo } from "./studio-workspace-video-library";

vi.mock("../studio-asset-library-sqlite-opfs-repository", () => ({ acquireProductStudioAssetCasStore: vi.fn() }));
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: vi.fn() }));

const scope = JSON.stringify(["actor", "work"]);
const other = JSON.stringify(["other", "work"]);
const recording = { id: "same", title: "검수", zoneId: "review", zoneName: "검수실", quality: "medium" as const,
  startedAt: 1, durationMs: 1000, participantCount: 1, createdAt: 1001 };
const file = (text: string) => new Blob([text], { type: "video/webm" });
let db: StudioLocalDatabase;
let sqlite3: StudioSqliteApiHandle;
let fs = createStudioOpfsMemoryFileSystem();
const store = () => createStudioOpfsAssetStore({ fs });

beforeAll(async () => {
  const module = await import("@sqlite.org/sqlite-wasm");
  sqlite3 = await module.default() as unknown as StudioSqliteApiHandle;
});
beforeEach(async () => {
  db = await openStudioLocalDatabase({ vfs: "memory", loadSqlite: async () => sqlite3 });
  vi.mocked(acquireStudioLocalDatabase).mockResolvedValue(db);
  fs = createStudioOpfsMemoryFileSystem();
  vi.mocked(acquireProductStudioAssetCasStore).mockResolvedValue(store());
  vi.stubGlobal("indexedDB", new IDBFactory());
  let pending: Promise<unknown> = Promise.resolve();
  vi.stubGlobal("navigator", { locks: { request: (_name: string, task: () => Promise<unknown>) => {
    const run = pending.then(task, task);
    pending = run;
    return run;
  } } });
});
afterEach(async () => {
  await db.close();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function seedLegacy(owner: string, blob: Blob, id = recording.id): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("toonstudio-workspace-recordings", 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("recordings").createIndex("scope", "scope");
      open.result.createObjectStore("video");
    };
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const database = open.result;
      const tx = database.transaction(["recordings", "video"], "readwrite");
      tx.objectStore("recordings").put({ scope: owner, recording: { ...recording, id } }, [owner, id]);
      tx.objectStore("video").put(blob, [owner, id]);
      tx.oncomplete = () => { database.close(); resolve(); };
      tx.onabort = () => { database.close(); reject(tx.error); };
    };
  });
}

it("새 녹화는 SQLite와 OPFS에만 쓰고 계정·작품과 다운로드 MIME을 구분한다", async () => {
  await Promise.all([
    saveWorkspaceVideo({ scope, recording }, file("ours")),
    saveWorkspaceVideo({ scope: other, recording }, file("theirs")),
  ]);
  expect(await indexedDB.databases()).toEqual([]);
  expect((await listWorkspaceVideos(scope)).map(entry => entry.recording.id)).toEqual(["same"]);
  const reopened = await readWorkspaceVideo(scope, "same");
  expect(reopened?.type).toBe("video/webm");
  expect(await reopened?.text()).toBe("ours");
  await removeWorkspaceVideo(scope, "same");
  expect(await readWorkspaceVideo(scope, "same")).toBeUndefined();
  expect(await (await readWorkspaceVideo(other, "same"))?.text()).toBe("theirs");
});

it("같은 ID의 구형 원본과 새 촬영본이 공존하고 재저장·재열기 뒤 각각 삭제할 수 있다", async () => {
  await seedLegacy(scope, file("old"));
  await seedLegacy(other, file("private"));
  const fresh = await saveWorkspaceVideo({ scope, recording }, file("new"));
  expect(fresh.recording.id).not.toBe("same");
  expect((await saveWorkspaceVideo({ scope, recording }, file("new"))).recording.id).toBe(fresh.recording.id);
  expect((await listWorkspaceVideos(scope)).map(entry => entry.recording.id).sort()).toEqual(["same", fresh.recording.id]);
  expect(await (await readWorkspaceVideo(scope, "same"))?.text()).toBe("old");
  vi.mocked(acquireProductStudioAssetCasStore).mockResolvedValue(store());
  expect(await (await readWorkspaceVideo(scope, fresh.recording.id))?.text()).toBe("new");
  await removeWorkspaceVideo(scope, "same");
  expect(await readLegacyWorkspaceVideo(scope, "same")).toBeUndefined();
  expect((await listWorkspaceVideos(scope)).map(entry => entry.recording.id)).toEqual([fresh.recording.id]);
  expect(await (await readLegacyWorkspaceVideo(other, "same"))?.text()).toBe("private");
});

it("이전 중 SQL 실패 시 구 원본을 내려받고 재시도한다. 삭제 중 실패해도 정본을 다시 열 수 있다", async () => {
  await seedLegacy(scope, file("retained"));
  vi.spyOn(db, "kvSet").mockRejectedValueOnce(new Error("full"));
  expect(await (await readWorkspaceVideo(scope, "same"))?.text()).toBe("retained");
  expect(await db.kvGet("studio-workspace-videos-v1", scope)).toBeNull();
  expect(await (await readLegacyWorkspaceVideo(scope, "same"))?.text()).toBe("retained");
  expect(await (await readWorkspaceVideo(scope, "same"))?.text()).toBe("retained");
  expect(await db.kvGet("studio-workspace-videos-v1", scope)).toContain("sha256:");
  vi.spyOn(db, "kvSet").mockRejectedValueOnce(new Error("full"));
  await expect(removeWorkspaceVideo(scope, "same")).rejects.toThrow("full");
  expect(await readLegacyWorkspaceVideo(scope, "same")).toBeUndefined();
  expect(await (await readWorkspaceVideo(scope, "same"))?.text()).toBe("retained");
  await removeWorkspaceVideo(scope, "same");
  expect(await listWorkspaceVideos(scope)).toEqual([]);
});

it("다중 조각 저장을 다시 열고 본문 손상을 확인한다. 미확인 SQL 응답은 정본을 재조회한다", async () => {
  const raw = new Uint8Array(4 * 1024 * 1024 + 11);
  raw[raw.length - 1] = 98;
  const publish = db.kvSet.bind(db);
  vi.spyOn(db, "kvSet").mockImplementationOnce(async (...args) => {
    await publish(...args);
    throw new Error("reply lost");
  });
  await saveWorkspaceVideo({ scope, recording }, new Blob([raw], { type: "video/mp4" }));
  const files = await fs.list("blobs");
  expect(files).toHaveLength(2);
  vi.mocked(acquireProductStudioAssetCasStore).mockResolvedValue(store());
  const opened = await readWorkspaceVideo(scope, "same");
  expect(opened?.type).toBe("video/mp4");
  expect(opened?.size).toBe(raw.length);
  expect(await opened?.slice(-1).text()).toBe("b");
  await fs.write(files[0]!, new Uint8Array([0]));
  await expect(readWorkspaceVideo(scope, "same")).rejects.toThrow();
});

it("새 버전을 먼저 열고 예전 탭이 같은 ID를 만들면 새 파일 삭제 뒤에도 구 파일의 표시 ID를 보존한다", async () => {
  await saveWorkspaceVideo({ scope, recording }, file("current"));
  await seedLegacy(scope, file("arrived later"));
  expect((await listWorkspaceVideos(scope)).map(entry => entry.recording.id)).toEqual(["same", "same-legacy"]);
  await removeWorkspaceVideo(scope, "same");
  expect((await listWorkspaceVideos(scope)).map(entry => entry.recording.id)).toEqual(["same-legacy"]);
  expect(await (await readWorkspaceVideo(scope, "same-legacy"))?.text()).toBe("arrived later");
});

it("구 저장소 접근이 거절돼도 새 영상의 원본을 저장·다운로드하고 목록에 상태를 알린다", async () => {
  vi.spyOn(indexedDB, "databases").mockRejectedValue(new DOMException("blocked", "SecurityError"));
  await saveWorkspaceVideo({ scope, recording }, file("new video"));
  const notice = vi.fn();
  expect((await listWorkspaceVideos(scope, notice)).map(entry => entry.recording.id)).toEqual(["same"]);
  expect(notice).toHaveBeenCalledOnce();
  expect(await (await readWorkspaceVideo(scope, "same"))?.text()).toBe("new video");
});
