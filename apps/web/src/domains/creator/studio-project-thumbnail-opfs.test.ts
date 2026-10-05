// @vitest-environment jsdom

import "fake-indexeddb/auto";

import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { StudioAutosavePayload } from "./studio-autosave";
import { createStudioOpfsMemoryFileSystem } from "./studio-opfs-filesystem";
import type { StudioProjectLibraryStorage } from "./studio-project-library-reader";
import { createStudioProject, readStudioProjectLibrary } from "./studio-project-library-store";
import { sha256HexPortable } from "./studio-sha256";
import {
  deleteStudioProjectThumbnail,
  readStudioProjectThumbnailRecord,
  selectStudioProjectThumbnailPage,
  setStudioProjectThumbnailFileSystemForTests,
  studioProjectThumbnailFingerprint,
  studioProjectThumbnailLocator,
  syncStudioProjectThumbnailAfterSave,
} from "./studio-project-thumbnail";

function memoryStorage(): StudioProjectLibraryStorage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

const TEXT_ELEMENT = {
  id: "el-text",
  type: "text",
  text: "첫 컷 대사",
  x: 40,
  y: 80,
  width: 320,
  fontSize: 28,
  fill: "#111111",
};

function makePayload(text: string): StudioAutosavePayload {
  return {
    version: 3,
    savedAt: "2026-10-03T00:00:00.000Z",
    pagesList: [
      { id: "page-1", canvasH: 1080, bg: "#fdfdfd", elements: [{ ...TEXT_ELEMENT, text }] },
    ] as unknown as StudioAutosavePayload["pagesList"],
    currentPageId: "page-1",
  };
}

const rasterizeWebp = () =>
  vi.fn(async (_svg: string) => new Blob(["webp-bytes"], { type: "image/webp" }));

function opfsStem(projectId: string): string {
  return `thumbs/${sha256HexPortable(new TextEncoder().encode(projectId))}`;
}

beforeEach(() => {
  // IDB 팩토리를 갈아끼우면 모듈이 새 팩토리로 다시 연다 — 테스트 간 격리.
  vi.stubGlobal("indexedDB", new IDBFactory());
});

afterEach(() => {
  setStudioProjectThumbnailFileSystemForTests(undefined);
});

describe("썸네일 OPFS 정본", () => {
  it("쓰면 OPFS 파일 쌍에만 쌓이고 IDB에는 남지 않는다", async () => {
    const fileSystem = createStudioOpfsMemoryFileSystem();
    setStudioProjectThumbnailFileSystemForTests(fileSystem);
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });

    const result = await syncStudioProjectThumbnailAfterSave({
      storage,
      projectId: entry.id,
      payload: makePayload("첫 컷"),
      rasterize: rasterizeWebp(),
    });

    expect(result).toEqual({ status: "updated" });
    const saved = readStudioProjectLibrary(storage).projects.find((p) => p.id === entry.id);
    expect(saved?.thumbnailUrl).toBe(studioProjectThumbnailLocator(entry.id));
    const paths = [...fileSystem.snapshot().keys()].sort();
    expect(paths).toEqual([`${opfsStem(entry.id)}.bin`, `${opfsStem(entry.id)}.json`]);

    const record = await readStudioProjectThumbnailRecord(entry.id);
    expect(record?.blob.type).toBe("image/webp");
    expect(record?.blob.size).toBe("webp-bytes".length);

    // OPFS를 끄면(IDB만 보면) 아무것도 없다 — 바이트가 IDB에 가지 않았다는 증거.
    setStudioProjectThumbnailFileSystemForTests(null);
    expect(await readStudioProjectThumbnailRecord(entry.id)).toBeNull();
  });

  it("내용이 같으면 OPFS 기록만으로 unchanged를 판정한다", async () => {
    const fileSystem = createStudioOpfsMemoryFileSystem();
    setStudioProjectThumbnailFileSystemForTests(fileSystem);
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    const rasterize = rasterizeWebp();
    const payload = makePayload("첫 컷");

    await syncStudioProjectThumbnailAfterSave({ storage, projectId: entry.id, payload, rasterize });
    const result = await syncStudioProjectThumbnailAfterSave({
      storage,
      projectId: entry.id,
      payload,
      rasterize,
    });

    expect(result).toEqual({ status: "unchanged" });
    expect(rasterize).toHaveBeenCalledTimes(1);
  });

  it("삭제하면 OPFS 파일 쌍이 사라진다", async () => {
    const fileSystem = createStudioOpfsMemoryFileSystem();
    setStudioProjectThumbnailFileSystemForTests(fileSystem);
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    await syncStudioProjectThumbnailAfterSave({
      storage,
      projectId: entry.id,
      payload: makePayload("첫 컷"),
      rasterize: rasterizeWebp(),
    });

    await deleteStudioProjectThumbnail(entry.id);

    expect(fileSystem.snapshot().size).toBe(0);
    expect(await readStudioProjectThumbnailRecord(entry.id)).toBeNull();
  });
});

describe("썸네일 IDB → OPFS 이관", () => {
  it("구 IDB 기록을 첫 읽기에서 이관하고, 검증 뒤에만 원본을 지운다", async () => {
    // 1) OPFS 없이 저장 — 구 동작대로 IDB에만 쌓인다.
    setStudioProjectThumbnailFileSystemForTests(null);
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    await syncStudioProjectThumbnailAfterSave({
      storage,
      projectId: entry.id,
      payload: makePayload("첫 컷"),
      rasterize: rasterizeWebp(),
    });
    const before = await readStudioProjectThumbnailRecord(entry.id);
    expect(before).not.toBeNull();

    // 2) 빈 OPFS를 켜고 읽으면 이관이 일어난다.
    const fileSystem = createStudioOpfsMemoryFileSystem();
    setStudioProjectThumbnailFileSystemForTests(fileSystem);
    const migrated = await readStudioProjectThumbnailRecord(entry.id);
    expect(migrated?.fingerprint).toBe(before?.fingerprint);
    expect(migrated?.blob.size).toBe(before?.blob.size);
    expect([...fileSystem.snapshot().keys()].sort()).toEqual([
      `${opfsStem(entry.id)}.bin`,
      `${opfsStem(entry.id)}.json`,
    ]);

    // 3) IDB 원본은 지워졌다 — OPFS를 끄고 읽으면 없다.
    setStudioProjectThumbnailFileSystemForTests(null);
    expect(await readStudioProjectThumbnailRecord(entry.id)).toBeNull();
  });

  it("이관 쓰기가 실패하면 IDB 원본을 지우지 않고 그 기록을 돌려준다", async () => {
    setStudioProjectThumbnailFileSystemForTests(null);
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    await syncStudioProjectThumbnailAfterSave({
      storage,
      projectId: entry.id,
      payload: makePayload("첫 컷"),
      rasterize: rasterizeWebp(),
    });

    const failing = createStudioOpfsMemoryFileSystem({ failWriteAfter: 1 });
    setStudioProjectThumbnailFileSystemForTests(failing);
    const record = await readStudioProjectThumbnailRecord(entry.id);
    expect(record).not.toBeNull();
    expect(failing.snapshot().size).toBe(0);

    setStudioProjectThumbnailFileSystemForTests(null);
    expect(await readStudioProjectThumbnailRecord(entry.id)).not.toBeNull();
  });

  it("OPFS 쓰기가 실패하면 IDB 폴백에 쓰고, 낡은 OPFS 사본은 지운다", async () => {
    const fileSystem = createStudioOpfsMemoryFileSystem();
    setStudioProjectThumbnailFileSystemForTests(fileSystem);
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    await syncStudioProjectThumbnailAfterSave({
      storage,
      projectId: entry.id,
      payload: makePayload("첫 컷"),
      rasterize: rasterizeWebp(),
    });
    expect(fileSystem.snapshot().size).toBe(2);

    // 같은 저장소가 쓰기 실패 상태가 된다(파일은 남아 있음) — 내용을 바꿔 저장하면
    // IDB 폴백으로 가고, 낡은 OPFS 사본이 새 기록을 가리지 않게 정리돼야 한다.
    fileSystem.restart({ failWriteAfter: 1 });
    const result = await syncStudioProjectThumbnailAfterSave({
      storage,
      projectId: entry.id,
      payload: makePayload("바뀐 컷"),
      rasterize: rasterizeWebp(),
    });
    expect(result).toEqual({ status: "updated" });
    expect(fileSystem.snapshot().size).toBe(0);

    setStudioProjectThumbnailFileSystemForTests(null);
    const fallback = await readStudioProjectThumbnailRecord(entry.id);
    const page = selectStudioProjectThumbnailPage(makePayload("바뀐 컷"));
    expect(fallback?.fingerprint).toBe(studioProjectThumbnailFingerprint(page!));
  });

  it("양쪽에 사본이 있어도 삭제는 양쪽 모두 지운다", async () => {
    const fileSystem = createStudioOpfsMemoryFileSystem();
    const storage = memoryStorage();
    const entry = createStudioProject(storage, { title: "달빛 카페", kind: "webtoon" });
    setStudioProjectThumbnailFileSystemForTests(fileSystem);
    await syncStudioProjectThumbnailAfterSave({
      storage,
      projectId: entry.id,
      payload: makePayload("첫 컷"),
      rasterize: rasterizeWebp(),
    });
    setStudioProjectThumbnailFileSystemForTests(null);
    await syncStudioProjectThumbnailAfterSave({
      storage,
      projectId: entry.id,
      payload: makePayload("바뀐 컷"),
      rasterize: rasterizeWebp(),
    });

    setStudioProjectThumbnailFileSystemForTests(fileSystem);
    await deleteStudioProjectThumbnail(entry.id);

    expect(fileSystem.snapshot().size).toBe(0);
    setStudioProjectThumbnailFileSystemForTests(null);
    expect(await readStudioProjectThumbnailRecord(entry.id)).toBeNull();
  });
});

describe("썸네일 OPFS 손상 항목", () => {
  it("바이트만 남은 불완전 항목은 정본으로 취급하지 않고 정리한다", async () => {
    const fileSystem = createStudioOpfsMemoryFileSystem();
    setStudioProjectThumbnailFileSystemForTests(fileSystem);
    await fileSystem.write(`${opfsStem("project-x")}.bin`, new Uint8Array([1, 2, 3]));

    expect(await readStudioProjectThumbnailRecord("project-x")).toBeNull();
    expect(fileSystem.snapshot().size).toBe(0);
  });

  it("메타의 byteLength가 실제 바이트와 다르면 버리고 정리한다", async () => {
    const fileSystem = createStudioOpfsMemoryFileSystem();
    setStudioProjectThumbnailFileSystemForTests(fileSystem);
    await fileSystem.write(`${opfsStem("project-y")}.bin`, new Uint8Array([1, 2, 3]));
    await fileSystem.write(
      `${opfsStem("project-y")}.json`,
      new TextEncoder().encode(
        JSON.stringify({
          fingerprint: "fp",
          updatedAt: "2026-10-06T00:00:00.000Z",
          width: 800,
          height: 450,
          mimeType: "image/webp",
          byteLength: 99,
        }),
      ),
    );

    expect(await readStudioProjectThumbnailRecord("project-y")).toBeNull();
    expect(fileSystem.snapshot().size).toBe(0);
  });
});
