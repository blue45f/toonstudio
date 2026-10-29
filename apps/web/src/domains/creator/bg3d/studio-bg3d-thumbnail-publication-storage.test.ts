/**
 * 실제 SQLite 메모리 DB와 OPFS CAS로 썸네일 게시 전 소유권 검사와 참조 복구를 검증한다.
 * kvSet API 인계 뒤에는 이미 durable인 candidate를 취소로 되돌리지 않는 경계를 포함한다.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { openStudioLocalDatabase } from "../studio-local-database";
import { StudioLocalDatabaseCommitOutcomeUnknownError } from "../studio-local-database-commit-outcome";
import { createStudioOpfsAssetStore } from "../studio-opfs-asset-store";
import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";

import {
  getCachedBg3dModelThumbnailV12,
  importVerifiedBg3dModelsAtomicallyV12,
  saveBg3dModelThumbnailIfCurrentV12,
} from "./bg3d-model-library";
import {
  STUDIO_BG3D_LIBRARIES_SQLITE_NAMESPACE,
  createStudioBg3dLibrariesAuthority,
} from "./studio-bg3d-libraries-sqlite-opfs-authority";

import type { StudioLocalDatabase } from "../studio-local-database";
import type { StudioOpfsAssetStore } from "../studio-opfs-asset-store";
import type { StudioBg3dLibrariesRunExclusive } from "./studio-bg3d-libraries-sqlite-opfs-authority";

const MODEL_ID = "thumbnail-publication-model";
const OWNER = `${STUDIO_BG3D_LIBRARIES_SQLITE_NAMESPACE}:models`;
const databases = new Set<StudioLocalDatabase>();

function deferred() {
  let fulfill: (() => void) | undefined;
  const promise = new Promise<void>((resolve) => { fulfill = () => resolve(); });
  return {
    promise,
    resolve() {
      if (!fulfill) throw new Error("대기점이 아직 초기화되지 않았습니다.");
      fulfill();
    },
  };
}

function gate() {
  const entered = deferred(), released = deferred();
  return {
    entered: entered.promise,
    release: released.resolve,
    async wait() { entered.resolve(); await released.promise; },
  };
}

function exclusive(): StudioBg3dLibrariesRunExclusive {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const result = tail.then(task, task);
    tail = result.catch(() => undefined);
    return result;
  };
}

/** 외부 데이터 없이 1픽셀 RGBA PNG를 만든다. IDAT는 zlib의 비압축 DEFLATE block이다. */
function thumbnail(red: number): string {
  const raw = new Uint8Array([0, red, 32, 96, 255]);
  let a = 1, b = 0;
  for (const byte of raw) { a = (a + byte) % 65_521; b = (b + a) % 65_521; }
  const idat = new Uint8Array(16);
  idat.set([0x78, 0x01, 0x01, 5, 0, 0xfa, 0xff]);
  idat.set(raw, 7);
  new DataView(idat.buffer).setUint32(12, ((b << 16) | a) >>> 0);
  const ihdr = new Uint8Array(13), header = new DataView(ihdr.buffer);
  header.setUint32(0, 1); header.setUint32(4, 1); ihdr.set([8, 6], 8);
  function chunk(kind: string, data: Uint8Array): Uint8Array {
    const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
    view.setUint32(0, data.length);
    bytes.set(new TextEncoder().encode(kind), 4); bytes.set(data, 8);
    let crc = 0xffff_ffff;
    for (const byte of bytes.subarray(4, bytes.length - 4)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb8_8320 : 0);
    }
    view.setUint32(bytes.length - 4, (crc ^ 0xffff_ffff) >>> 0);
    return bytes;
  }
  const chunks = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", new Uint8Array())];
  let binary = "";
  for (const bytes of chunks) for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}

/** 빈 scene의 작은 자체 GLB로 실제 모델 등록/manifest 검증을 통과시킨다. */
function modelFile(): File {
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: "2.0" }, scenes: [{}], extras: { marker: "thumbnail-publication" },
  }));
  const padded = new Uint8Array(Math.ceil(json.length / 4) * 4);
  padded.fill(0x20); padded.set(json);
  const bytes = new Uint8Array(20 + padded.length), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true); view.setUint32(12, padded.length, true);
  view.setUint32(16, 0x4e4f534a, true); bytes.set(padded, 20);
  return new File([bytes.buffer], "thumbnail-model.glb", { type: "model/gltf-binary" });
}

type KvSet = StudioLocalDatabase["kvSet"];

/** kvSet만 관측/지연한다. 나머지 DB 메서드는 실제 handle을 receiver로 유지한다. */
function databaseWithKvSet(database: StudioLocalDatabase, kvSet: KvSet): StudioLocalDatabase {
  return new Proxy(database, {
    get(target, property) {
      if (property === "kvSet") return kvSet;
      const value: unknown = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

async function fixture() {
  // 제품의 실제 sqlite-wasm loader를 사용하며 SQL/authority 대역을 만들지 않는다.
  const database = await openStudioLocalDatabase({
    vfs: "memory", memoryFilename: `thumbnail-guard-${crypto.randomUUID()}.sqlite3`,
  });
  databases.add(database);
  const fs = createStudioOpfsMemoryFileSystem();
  const assets = createStudioOpfsAssetStore({ fs, now: () => 1_000 });
  const runExclusive = exclusive();
  function authorityFor(db = database, store = assets) {
    return createStudioBg3dLibrariesAuthority({
      acquireDatabase: async () => db, acquireAssetStore: async () => store,
      runExclusive, now: () => 1_000, orphanGraceMs: 60_000,
      allowNonDurableAssetStoreForTests: true,
    });
  }
  const authority = authorityFor();
  const records = await importVerifiedBg3dModelsAtomicallyV12([modelFile()], {
    authority, executionBackend: "direct", idFactory: () => MODEL_ID, now: 10,
  });
  expect(records).toHaveLength(1);
  const oldThumbnail = thumbnail(10);
  await saveBg3dModelThumbnailIfCurrentV12(MODEL_ID, oldThumbnail, {
    authority, captureRevision: 10, now: 10,
  });
  const oldRaw = await authority.readManifest("models");
  if (oldRaw === null) throw new Error("등록된 실제 모델 manifest가 없습니다.");
  const oldRefs = await assets.ownerRefs(OWNER);
  expect(oldRefs).toHaveLength(2);
  return { database, assets, authorityFor, authority, oldRaw, oldRefs, oldThumbnail };
}

async function assertUnchanged(h: Awaited<ReturnType<typeof fixture>>) {
  expect(await h.authority.readManifest("models")).toBe(h.oldRaw);
  expect(await h.assets.ownerRefs(OWNER)).toEqual(h.oldRefs);
  expect(await getCachedBg3dModelThumbnailV12(MODEL_ID, { authority: h.authority })).toBe(h.oldThumbnail);
}

afterEach(async () => {
  const handles = [...databases]; databases.clear();
  await Promise.all(handles.map((database) => database.close()));
});

describe("썸네일 게시 gate와 실제 SQLite/OPFS 저장 순서", () => {
  it("정상 저장과 더 오래된 revision은 기존 동작을 유지하고 no-op도 소유권을 검사한다", async () => {
    const h = await fixture(), assertCurrent = vi.fn(() => undefined);
    const newest = thumbnail(40);
    await expect(saveBg3dModelThumbnailIfCurrentV12(MODEL_ID, newest, {
      authority: h.authority, captureRevision: 40, now: 40, assertCurrent,
    })).resolves.toBe(true);
    expect(assertCurrent).toHaveBeenCalled();
    const published = await h.authority.readManifest("models");
    const refs = await h.assets.ownerRefs(OWNER);
    assertCurrent.mockClear();
    await expect(saveBg3dModelThumbnailIfCurrentV12(MODEL_ID, thumbnail(20), {
      authority: h.authority, captureRevision: 20, now: 20, assertCurrent,
    })).resolves.toBe(false);
    expect(assertCurrent).toHaveBeenCalled();
    expect(await h.authority.readManifest("models")).toBe(published);
    expect(await h.assets.ownerRefs(OWNER)).toEqual(refs);
    expect(await getCachedBg3dModelThumbnailV12(MODEL_ID, { authority: h.authority })).toBe(newest);
  });

  const queueModes: readonly ("stale" | "abort")[] = ["stale", "abort"];
  it.each(queueModes)("공유 queue에서 %s가 된 요청은 기존 manifest를 게시하지 않는다", async (mode) => {
    const h = await fixture(), held = gate(), controller = new AbortController();
    let writes = 0, current = true;
    const stale = new Error("썸네일 소유권 만료");
    const authority = h.authorityFor(databaseWithKvSet(h.database, async (...args) => {
      writes += 1; await h.database.kvSet(...args);
    }));
    const blocker = authority.mutate("models", () => h.oldRefs, async (context) => {
      await held.wait();
      if (context.currentRaw === null) throw new Error("queue 원본 manifest 누락");
      return { nextRaw: context.currentRaw, nextRefs: h.oldRefs, result: undefined };
    });
    const ownedWork: Promise<unknown>[] = [blocker];
    try {
      await held.entered;
      const pending = saveBg3dModelThumbnailIfCurrentV12(MODEL_ID, thumbnail(20), {
        authority, captureRevision: 20, now: 20, signal: controller.signal,
        assertCurrent: () => { if (!current) throw stale; },
      });
      const rejected = mode === "abort"
        ? expect(pending).rejects.toMatchObject({ code: "aborted" })
        : expect(pending).rejects.toBe(stale);
      ownedWork.push(pending, rejected);
      current = false;
      if (mode === "abort") controller.abort();
      held.release(); await blocker; await rejected;
      // blocker의 기존값 재게시 한 번만 허용하고 취소된 썸네일 쓰기는 허용하지 않는다.
      expect(writes).toBe(1);
      await assertUnchanged(h);
    } finally {
      current = false;
      held.release();
      await Promise.allSettled(ownedWork);
    }
  });

  it("실제 putBlob 완료를 기다리는 동안 stale이면 CAS blob만 남고 manifest/owner는 유지된다", async () => {
    const h = await fixture(), held = gate();
    let current = true, writes = 0;
    const stale = new Error("putBlob 중 소유권 만료");
    const store: StudioOpfsAssetStore = { ...h.assets, put: async (...args) => {
      const receipt = await h.assets.put(...args); await held.wait(); return receipt;
    } };
    const authority = h.authorityFor(databaseWithKvSet(h.database, async (...args) => {
      writes += 1; await h.database.kvSet(...args);
    }), store);
    const beforeCount = (await h.assets.list()).length;
    const pending = saveBg3dModelThumbnailIfCurrentV12(MODEL_ID, thumbnail(20), {
      authority, captureRevision: 20, now: 20, assertCurrent: () => { if (!current) throw stale; },
    });
    const rejected = expect(pending).rejects.toBe(stale);
    try {
      await held.entered; current = false; held.release(); await rejected;
      expect(writes).toBe(0);
      await assertUnchanged(h);
      expect((await h.assets.list()).length).toBe(beforeCount + 1);
    } finally {
      current = false;
      held.release();
      await Promise.allSettled([pending, rejected]);
    }
  });

  it("owner union을 실제 반영한 await 중 stale이면 oldRefs를 복구하고 kvSet을 호출하지 않는다", async () => {
    const h = await fixture(), held = gate();
    let current = true, first = true, writes = 0;
    const ownerWrites: (readonly string[])[] = [], stale = new Error("owner 보호 중 소유권 만료");
    const store: StudioOpfsAssetStore = { ...h.assets, setOwnerRefs: async (owner, hashes) => {
      ownerWrites.push([...hashes]);
      const result = await h.assets.setOwnerRefs(owner, hashes);
      if (first) { first = false; await held.wait(); }
      return result;
    } };
    const authority = h.authorityFor(databaseWithKvSet(h.database, async (...args) => {
      writes += 1; await h.database.kvSet(...args);
    }), store);
    const pending = saveBg3dModelThumbnailIfCurrentV12(MODEL_ID, thumbnail(20), {
      authority, captureRevision: 20, now: 20, assertCurrent: () => { if (!current) throw stale; },
    });
    const rejected = expect(pending).rejects.toBe(stale);
    try {
      await held.entered;
      expect((await h.assets.ownerRefs(OWNER)).length).toBe(h.oldRefs.length + 1);
      current = false; held.release(); await rejected;
      expect(writes).toBe(0); expect(ownerWrites).toHaveLength(2);
      expect(ownerWrites.at(-1)).toEqual(h.oldRefs);
      await assertUnchanged(h);
    } finally {
      current = false;
      held.release();
      await Promise.allSettled([pending, rejected]);
    }
  });

  it("같은 storage ID의 old A가 만료되면 queued B가 게시되고 늦은 A no-op도 B를 덮지 못한다", async () => {
    const h = await fixture(), held = gate(), ownerA = {}, ownerB = {};
    let currentOwner = ownerA, first = true;
    const stale = new Error("A 소유권 만료");
    const assertA = () => { if (currentOwner !== ownerA) throw stale; };
    const store: StudioOpfsAssetStore = { ...h.assets, put: async (...args) => {
      const result = await h.assets.put(...args);
      if (first) { first = false; await held.wait(); }
      return result;
    } };
    const authority = h.authorityFor(h.database, store);
    const pendingA = saveBg3dModelThumbnailIfCurrentV12(MODEL_ID, thumbnail(20), {
      authority, captureRevision: 20, now: 20, assertCurrent: assertA,
    });
    const rejectedA = expect(pendingA).rejects.toBe(stale);
    const ownedWork: Promise<unknown>[] = [pendingA, rejectedA];
    try {
      await held.entered; currentOwner = ownerB;
      const imageB = thumbnail(30);
      const pendingB = saveBg3dModelThumbnailIfCurrentV12(MODEL_ID, imageB, {
        authority, captureRevision: 30, now: 30, assertCurrent: () => {
          if (currentOwner !== ownerB) throw new Error("B 소유권 만료");
        },
      });
      ownedWork.push(pendingB);
      // 실제 authority는 write lane을 직렬화하므로 A 종료 전 B 완료를 가장하지 않는다.
      held.release(); await rejectedA; await expect(pendingB).resolves.toBe(true);
      const rawB = await authority.readManifest("models"), refsB = await h.assets.ownerRefs(OWNER);
      await expect(saveBg3dModelThumbnailIfCurrentV12(MODEL_ID, thumbnail(20), {
        authority, captureRevision: 20, now: 20, assertCurrent: assertA,
      })).rejects.toBe(stale);
      expect(await authority.readManifest("models")).toBe(rawB);
      expect(await h.assets.ownerRefs(OWNER)).toEqual(refsB);
      expect(await getCachedBg3dModelThumbnailV12(MODEL_ID, { authority })).toBe(imageB);
    } finally {
      held.release();
      await Promise.allSettled(ownedWork);
    }
  });

  const commitModes: readonly ("generic" | "unknown")[] = ["generic", "unknown"];
  it.each(commitModes)("kvSet 인계 뒤 실제 commit-before-%s이면 취소돼도 durable candidate를 롤백하지 않는다", async (mode) => {
    const h = await fixture(), controller = new AbortController();
    let current = true, dispatches = 0;
    const ownerWrites: (readonly string[])[] = [];
    const store: StudioOpfsAssetStore = { ...h.assets, setOwnerRefs: async (owner, hashes) => {
      ownerWrites.push([...hashes]); return h.assets.setOwnerRefs(owner, hashes);
    } };
    const authority = h.authorityFor(databaseWithKvSet(h.database, async (...args) => {
      dispatches += 1;
      await h.database.kvSet(...args);
      current = false; controller.abort();
      const cause = new Error("실제 SQLite commit 뒤 응답 손실");
      if (mode === "unknown") throw new StudioLocalDatabaseCommitOutcomeUnknownError("kvSet", cause);
      throw cause;
    }), store);
    const assertCurrent = vi.fn(() => { if (!current) throw new Error("이미 인계된 요청의 소유권 만료"); });
    const candidate = thumbnail(60);
    await expect(saveBg3dModelThumbnailIfCurrentV12(MODEL_ID, candidate, {
      authority, captureRevision: 60, now: 60, signal: controller.signal, assertCurrent,
    })).resolves.toBe(true);
    expect(dispatches).toBe(1); expect(assertCurrent).toHaveBeenCalled();
    expect(controller.signal.aborted).toBe(true);
    expect(await authority.readManifest("models")).not.toBe(h.oldRaw);
    expect(await getCachedBg3dModelThumbnailV12(MODEL_ID, { authority })).toBe(candidate);
    const durableRefs = await h.assets.ownerRefs(OWNER);
    expect(durableRefs).toHaveLength(h.oldRefs.length); expect(durableRefs).not.toEqual(h.oldRefs);
    // union 보호 한 번과 candidate 축소 한 번이며 oldRefs rollback은 없다.
    expect(ownerWrites).toHaveLength(2);
    expect(ownerWrites[0]).toEqual(expect.arrayContaining(h.oldRefs));
    expect(ownerWrites[1]).toEqual(durableRefs);
  });
});
