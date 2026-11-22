import { describe, expect, it } from "vitest";

import {
  StudioOpfsError,
  createStudioOpfsMemoryFileSystem,
  type StudioOpfsFileSystem,
} from "../studio-opfs-filesystem";
import {
  STUDIO_OPFS_CAS_INDEX_SCHEMA,
  classifyOpfsAssetKind,
  computeOpfsContentSha256,
  executeOpfsContentDedupeVacuum,
  parseOpfsCasPointer,
  planOpfsContentDedupeVacuum,
  readOpfsContentAddressedAsset,
  withOpfsVacuumCrossTabLock,
  type StudioBroadcastChannelLike,
  type StudioWebLockManagerLike,
} from "./studio-opfs-content-dedupe-vacuum";

const ENCODER = new TextEncoder();
const DECODER = new TextDecoder("utf-8", { fatal: true });

function mustDefine<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`예상된 값이 비어 있습니다: ${label}`);
  }
  return value;
}

function makeDeterministicBytes(seed: number, length: number): Uint8Array {
  const buf = new Uint8Array(length);
  let state = (seed * 2654435761) >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    buf[i] = (state >>> 24) & 0xff;
  }
  return buf;
}

function makeSnapshotBytes(id: string, padSize: number): Uint8Array {
  const base = JSON.stringify({ id, strokes: 120, padding: "x".repeat(padSize) });
  return ENCODER.encode(base);
}

function createSharedWebLockManager(): StudioWebLockManagerLike {
  const held = new Set<string>();
  return {
    async request(name, options, callback) {
      if (held.has(name)) {
        if (options.ifAvailable) return callback(null);
        throw new Error(`Lock busy: ${name}`);
      }
      held.add(name);
      try {
        return await callback({ name, mode: options.mode ?? "exclusive" });
      } finally {
        held.delete(name);
      }
    },
  };
}

function createSharedBroadcastBus(): (name: string) => StudioBroadcastChannelLike {
  type Listener = (event: { readonly data: unknown }) => void;
  interface Peer { readonly name: string; readonly listeners: Set<Listener>; closed: boolean }
  const peers = new Set<Peer>();

  return (name: string) => {
    const peer: Peer = { name, listeners: new Set(), closed: false };
    peers.add(peer);
    return {
      postMessage(message: unknown) {
        if (peer.closed) return;
        for (const other of peers) {
          if (other === peer || other.closed || other.name !== name) continue;
          for (const listener of other.listeners) listener({ data: message });
        }
      },
      addEventListener(_type, listener) { peer.listeners.add(listener); },
      removeEventListener(_type, listener) { peer.listeners.delete(listener); },
      close() {
        peer.closed = true;
        peer.listeners.clear();
        peers.delete(peer);
      },
    };
  };
}

async function totalStoredBytes(fs: StudioOpfsFileSystem): Promise<number> {
  let sum = 0;
  for (const path of await fs.list("")) sum += (await fs.size(path)) ?? 0;
  return sum;
}

describe("OPFS 콘텐츠 해시 중복 제거 압축기(Storage Vacuum)", () => {
  it("60컷 중복 배경·브러시 스탬프·스냅샷 시뮬레이션에서 50% 이상 용량을 절감하고 복원 바이트가 100% 일치한다", async () => {
    const fs = createStudioOpfsMemoryFileSystem();
    const originals = new Map<string, Uint8Array>();

    // 60컷 웹툰 회차: 6종의 공통 배경(8KiB)을 각 10컷씩 공유
    const backgrounds = Array.from({ length: 6 }, (_, idx) => makeDeterministicBytes(100 + idx, 8_192));
    for (let cut = 1; cut <= 60; cut += 1) {
      const path = `cuts/cut-${String(cut).padStart(2, "0")}-bg.png`;
      const bytes = mustDefine(backgrounds[(cut - 1) % backgrounds.length], "background");
      await fs.write(path, bytes);
      originals.set(path, Uint8Array.from(bytes));
    }

    // 중복 브러시 스탬프 6건 (2종 × 3벌, 각 4KiB)
    const stamps = [makeDeterministicBytes(201, 4_096), makeDeterministicBytes(202, 4_096)];
    for (let i = 0; i < 6; i += 1) {
      const path = `brushes/stamp-0${i + 1}.png`;
      const bytes = mustDefine(stamps[i % 2], "stamp");
      await fs.write(path, bytes);
      originals.set(path, Uint8Array.from(bytes));
    }

    // 중복 컷 스냅샷 4건 (2종 × 2벌, 각 ~3KiB)
    const snapshots = [makeSnapshotBytes("snap-a", 3_000), makeSnapshotBytes("snap-b", 3_000)];
    for (let i = 0; i < 4; i += 1) {
      const path = `snapshots/ep42-snap-0${i + 1}.json`;
      const bytes = mustDefine(snapshots[i % 2], "snapshot");
      await fs.write(path, bytes);
      originals.set(path, Uint8Array.from(bytes));
    }

    // 고유 파일 및 보호 대상 SQLite DB는 교체하지 않아야 한다
    const uniqueCut = makeDeterministicBytes(999, 4_096);
    const dbBytes = makeDeterministicBytes(777, 4_096);
    await fs.write("cuts/cut-unique-hero.png", uniqueCut);
    await fs.write("db/studio-local-v12.db", dbBytes);
    originals.set("cuts/cut-unique-hero.png", Uint8Array.from(uniqueCut));

    expect(classifyOpfsAssetKind("brushes/stamp-01.png")).toBe("brush-stamp");
    expect(classifyOpfsAssetKind("snapshots/ep42-snap-01.json")).toBe("snapshot");
    expect(classifyOpfsAssetKind("cuts/cut-01-bg.png")).toBe("texture");

    const bytesBefore = await totalStoredBytes(fs);
    const plan = await planOpfsContentDedupeVacuum({ fs, projectId: "long-series-ep42", now: () => 1_760_000_000_000 });
    expect(plan.hasActionableWork).toBe(true);
    expect(plan.duplicateGroups.length).toBe(10); // 6 배경 + 2 스탬프 + 2 스냅샷
    expect(plan.duplicateFileCount).toBe(70);
    expect(plan.estimatedSavingsRatio).toBeGreaterThanOrEqual(0.5);
    expect(new Set(plan.duplicateGroups.map((g) => g.assetKind))).toEqual(
      new Set(["texture", "brush-stamp", "snapshot"]),
    );

    const webLocks = createSharedWebLockManager();
    const result = await executeOpfsContentDedupeVacuum({
      fs,
      projectId: "long-series-ep42",
      now: () => 1_760_000_001_000,
      lockOptions: { tabId: "tab-main", lockManager: webLocks },
    });

    const bytesAfter = await totalStoredBytes(fs);
    expect(result.status).toBe("completed");
    expect(result.lockMechanism).toBe("web-locks");
    expect(result.deduplicatedFileCount).toBe(70);
    expect(result.writtenBlobCount).toBe(10);
    expect(result.totalOpfsBytesBefore).toBe(bytesBefore);
    expect(result.totalOpfsBytesAfter).toBe(bytesAfter);
    expect(result.savedRatio).toBeGreaterThanOrEqual(0.5);
    expect((bytesBefore - bytesAfter) / bytesBefore).toBeGreaterThanOrEqual(0.5);

    // 60컷 + 스탬프 + 스냅샷 + 고유 파일 전부 100% 바이트 일치 복원 검증
    for (const [path, expectedBytes] of originals.entries()) {
      const restored = mustDefine(await readOpfsContentAddressedAsset(fs, path), path);
      expect(restored.byteLength).toBe(expectedBytes.byteLength);
      expect(computeOpfsContentSha256(restored)).toBe(computeOpfsContentSha256(expectedBytes));
      expect(Array.from(restored)).toEqual(Array.from(expectedBytes));
    }

    // 보호된 SQLite DB는 포인터로 치환되지 않고 원시 바이트 유지
    const rawDb = mustDefine(await fs.read("db/studio-local-v12.db"), "db");
    expect(parseOpfsCasPointer(rawDb)).toBeNull();
    expect(Array.from(rawDb)).toEqual(Array.from(dbBytes));

    // CAS 인덱스 참조 카운트 정합성 확인
    const indexRaw = mustDefine(await fs.read(plan.indexPath), "index");
    const parsedIndex = JSON.parse(DECODER.decode(indexRaw)) as {
      schema: string;
      generation: number;
      blobs: Record<string, { refCount: number }>;
    };
    expect(parsedIndex.schema).toBe(STUDIO_OPFS_CAS_INDEX_SCHEMA);
    expect(parsedIndex.generation).toBe(1);
    expect(Object.keys(parsedIndex.blobs)).toHaveLength(10);
    expect(parsedIndex.blobs[computeOpfsContentSha256(mustDefine(backgrounds[0], "bg0"))]?.refCount).toBe(10);

    // 재실행 시 멱등(noop) 보장
    const secondRun = await executeOpfsContentDedupeVacuum({
      fs,
      projectId: "long-series-ep42",
      lockOptions: { tabId: "tab-main", lockManager: webLocks },
    });
    expect(secondRun.status).toBe("noop");
    expect(secondRun.reclaimedBytes).toBe(0);
  });

  it("참조 카운트 0 고아 청크 GC · 증분 중복 통합 · 1바이트 청크 손상 감지를 정확히 수행한다", async () => {
    const fs = createStudioOpfsMemoryFileSystem();
    const bgA = makeDeterministicBytes(301, 6_144);
    const bgB = makeDeterministicBytes(302, 6_144);
    await fs.write("cuts/c1.png", bgA);
    await fs.write("cuts/c2.png", bgA);
    await fs.write("cuts/c3.png", bgB);
    await fs.write("cuts/c4.png", bgB);

    const first = await executeOpfsContentDedupeVacuum({
      fs,
      projectId: "gc-proj",
      lockOptions: { lockManager: createSharedWebLockManager() },
    });
    expect(first.status).toBe("completed");

    // bgA를 참조하던 모든 컷 삭제 -> bgA 청크의 참조 카운트가 0이 된다
    await fs.remove("cuts/c1.png");
    await fs.remove("cuts/c2.png");
    // bgB와 동일한 새 컷 추가(증분 중복 통합 대상) + 이전 크래시 잔여 스테이징 저널 주입
    await fs.write("cuts/c5.png", bgB);
    const planBeforeGc = await planOpfsContentDedupeVacuum({ fs, projectId: "gc-proj" });
    await fs.write(`${planBeforeGc.casPrefix}tx-stale-crash.staging`, ENCODER.encode('{"stale":true}'));

    const gcPlan = await planOpfsContentDedupeVacuum({ fs, projectId: "gc-proj" });
    expect(gcPlan.gcOrphanBlobs).toHaveLength(1);
    expect(gcPlan.gcOrphanBlobs[0]?.sha256).toBe(computeOpfsContentSha256(bgA));
    expect(gcPlan.staleStagingPaths).toHaveLength(1);
    expect(gcPlan.duplicateGroups).toHaveLength(1);
    expect(gcPlan.duplicateGroups[0]?.blobAlreadyExists).toBe(true);

    const gcResult = await executeOpfsContentDedupeVacuum({
      fs,
      projectId: "gc-proj",
      lockOptions: { lockManager: createSharedWebLockManager() },
    });
    expect(gcResult.status).toBe("completed");
    expect(gcResult.gcRemovedBlobCount).toBe(1);
    expect(gcResult.writtenBlobCount).toBe(0);
    expect(gcResult.deduplicatedFileCount).toBe(1);
    const orphanBlob = mustDefine(gcPlan.gcOrphanBlobs[0], "orphanBlob");
    expect(await fs.read(orphanBlob.blobPath)).toBeNull();
    expect(await fs.read(`${planBeforeGc.casPrefix}tx-stale-crash.staging`)).toBeNull();
    expect(Array.from(mustDefine(await readOpfsContentAddressedAsset(fs, "cuts/c5.png"), "c5"))).toEqual(Array.from(bgB));

    // CAS 청크 1바이트 변조 시 무결성 오류(INTEGRITY_FAILED)로 0손실 보호
    const ptrB = mustDefine(parseOpfsCasPointer(mustDefine(await fs.read("cuts/c3.png"), "c3")), "ptrB");
    const tampered = Uint8Array.from(bgB);
    tampered[12] = ((tampered[12] ?? 0) + 1) & 0xff;
    await fs.write(ptrB.blobPath, tampered);
    await expect(readOpfsContentAddressedAsset(fs, "cuts/c3.png")).rejects.toMatchObject({
      name: StudioOpfsError.name,
      code: "INTEGRITY_FAILED",
    });
  });

  it("청크 스테이징 중 I/O 오류 또는 포인터 교체 중 AbortSignal 중단 시 고아 청크를 롤백하고 원본을 100% 복원한다", async () => {
    // 1) 스테이징 중 쓰기 실패 (failWriteAfter): 1번째 청크 스테이징 후 2번째 청크 쓰기에서 중단
    const bg1 = makeDeterministicBytes(401, 5_120);
    const bg2 = makeDeterministicBytes(402, 5_120);
    const fsFailStage = createStudioOpfsMemoryFileSystem();
    await fsFailStage.write("cuts/a1.png", bg1);
    await fsFailStage.write("cuts/a2.png", bg1);
    await fsFailStage.write("cuts/b1.png", bg2);
    await fsFailStage.write("cuts/b2.png", bg2);
    // write #1=staging, #2=blob1 성공, #3=blob2에서 실패
    fsFailStage.restart({ failWriteAfter: 3 });

    const stageFailResult = await executeOpfsContentDedupeVacuum({
      fs: fsFailStage,
      projectId: "rollback-stage",
      lockOptions: { lockManager: createSharedWebLockManager() },
    });
    expect(stageFailResult.status).toBe("rolled-back");
    expect(stageFailResult.rollback.performed).toBe(true);
    expect(stageFailResult.rollback.removedOrphanBlobPaths).toHaveLength(1);
    expect(stageFailResult.rollback.stagingCleaned).toBe(true);
    expect(await fsFailStage.list("cas/")).toEqual([]);
    expect(Array.from(mustDefine(await fsFailStage.read("cuts/a1.png"), "a1"))).toEqual(Array.from(bg1));
    expect(Array.from(mustDefine(await fsFailStage.read("cuts/b2.png"), "b2"))).toEqual(Array.from(bg2));

    // 2) 포인터 교체 중간(2개 교체 직후) AbortSignal 중단 -> 교체된 원본 복원 + 신규 고아 청크 전부 제거
    const fsAbort = createStudioOpfsMemoryFileSystem();
    for (let i = 1; i <= 5; i += 1) await fsAbort.write(`cuts/p${i}.png`, bg1);
    const controller = new AbortController();
    let pointersWritten = 0;

    const abortResult = await executeOpfsContentDedupeVacuum({
      fs: fsAbort,
      projectId: "rollback-abort",
      signal: controller.signal,
      lockOptions: { lockManager: createSharedWebLockManager() },
      onStage: (stage) => {
        if (stage === "after-pointer-written") {
          pointersWritten += 1;
          if (pointersWritten === 2) controller.abort();
        }
      },
    });
    expect(abortResult.status).toBe("rolled-back");
    expect(abortResult.rollback.performed).toBe(true);
    expect(abortResult.rollback.restoredSourcePaths).toHaveLength(2);
    expect(abortResult.rollback.removedOrphanBlobPaths).toHaveLength(1);
    expect(abortResult.rollback.rollbackErrors).toEqual([]);
    expect(await fsAbort.list("cas/")).toEqual([]);
    for (let i = 1; i <= 5; i += 1) {
      const raw = mustDefine(await fsAbort.read(`cuts/p${i}.png`), `p${i}`);
      expect(parseOpfsCasPointer(raw)).toBeNull();
      expect(Array.from(raw)).toEqual(Array.from(bg1));
    }

    // 3) 극단 장애: 교체된 원본 복원 쓰기마저 실패하면 해당 청크를 고아 삭제하지 않고 보존(0손실 불변식)
    const fsFatal = createStudioOpfsMemoryFileSystem();
    await fsFatal.write("cuts/f1.png", bg1);
    await fsFatal.write("cuts/f2.png", bg1);
    // write #1=staging, #2=blob1, #3=cuts/f1.png 포인터, #4=cuts/f2.png에서 영구 쓰기 실패
    fsFatal.restart({ failWriteAfter: 4 });
    const fatalResult = await executeOpfsContentDedupeVacuum({
      fs: fsFatal,
      projectId: "rollback-preserve",
      lockOptions: { lockManager: createSharedWebLockManager() },
    });
    expect(fatalResult.status).toBe("rolled-back");
    expect(fatalResult.rollback.preservedLiveBlobPaths).toHaveLength(1);
    fsFatal.restart();
    // f1.png는 포인터 상태지만 보존된 청크를 통해 100% 무손실 복원 가능!
    expect(Array.from(mustDefine(await readOpfsContentAddressedAsset(fsFatal, "cuts/f1.png"), "f1"))).toEqual(Array.from(bg1));
    expect(Array.from(mustDefine(await readOpfsContentAddressedAsset(fsFatal, "cuts/f2.png"), "f2"))).toEqual(Array.from(bg1));
  });

  it("히든 디테일(#045): Web Locks(navigator.locks) 및 BroadcastChannel 폴백으로 다중 탭 동시 Vacuum 충돌을 차단한다", async () => {
    const fs = createStudioOpfsMemoryFileSystem();
    const bg = makeDeterministicBytes(501, 4_096);
    await fs.write("cuts/x1.png", bg);
    await fs.write("cuts/x2.png", bg);

    // 1) Web Locks 배타 잠금 충돌 차단
    const sharedLocks = createSharedWebLockManager();
    let releaseFirstTab: () => void = () => undefined;
    const firstTabHolding = new Promise<void>((resolve) => { releaseFirstTab = resolve; });
    let firstTabEntered: () => void = () => undefined;
    const enteredSignal = new Promise<void>((resolve) => { firstTabEntered = resolve; });

    const tabALockPromise = withOpfsVacuumCrossTabLock(
      "multi-tab-proj",
      async () => {
        firstTabEntered();
        await firstTabHolding;
        return "tab-a-done";
      },
      { tabId: "tab-a", lockManager: sharedLocks },
    );
    await enteredSignal;

    const tabBConflict = await executeOpfsContentDedupeVacuum({
      fs,
      projectId: "multi-tab-proj",
      lockOptions: { tabId: "tab-b", lockManager: sharedLocks },
    });
    expect(tabBConflict.status).toBe("locked-conflict");
    expect(tabBConflict.lockMechanism).toBe("web-locks");
    expect(await fs.list("cas/")).toEqual([]);

    releaseFirstTab();
    expect((await tabALockPromise).acquired).toBe(true);

    // 2) Web Locks 미지원(또는 SecurityError) 시 BroadcastChannel 폴백으로 동시 충돌 차단
    const bus = createSharedBroadcastBus();
    const throwingLocks: StudioWebLockManagerLike = {
      request: async () => { throw new Error("SecurityError: opaque origin"); },
    };

    const [raceA, raceB] = await Promise.all([
      executeOpfsContentDedupeVacuum({
        fs,
        projectId: "multi-tab-bc",
        lockOptions: {
          tabId: "tab-alpha",
          lockManager: throwingLocks,
          createBroadcastChannel: bus,
          negotiationWindowMs: 25,
          now: () => 1_760_000_000_000,
        },
      }),
      executeOpfsContentDedupeVacuum({
        fs,
        projectId: "multi-tab-bc",
        lockOptions: {
          tabId: "tab-beta",
          lockManager: null,
          createBroadcastChannel: bus,
          negotiationWindowMs: 25,
          now: () => 1_760_000_000_000,
        },
      }),
    ]);

    expect([raceA.status, raceB.status].sort()).toEqual(["completed", "locked-conflict"]);
    expect(raceA.lockMechanism).toBe("broadcast-channel");
    expect(raceB.lockMechanism).toBe("broadcast-channel");
    const winner = raceA.status === "completed" ? raceA : raceB;
    const loser = raceA.status === "locked-conflict" ? raceA : raceB;
    expect(winner.lockHolderId).toBe("tab-alpha");
    expect(loser.lockHolderId).toBe("tab-alpha");

    // 잠금 해제 후 다음 탭은 정상 획득 가능
    const afterRelease = await executeOpfsContentDedupeVacuum({
      fs,
      projectId: "multi-tab-bc",
      lockOptions: { tabId: "tab-beta", lockManager: null, createBroadcastChannel: bus, negotiationWindowMs: 15 },
    });
    expect(afterRelease.status).toBe("noop");
    expect(afterRelease.lockMechanism).toBe("broadcast-channel");
  });
});
