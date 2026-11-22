import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_HOT_RELOAD_DEBOUNCE_MS,
  DEFAULT_HOT_RELOAD_REQUIRED_STABLE_CHECKS,
  HotReloadOfflineQueue,
  createLocalFolderHotReloadWatcher,
  hotReloadOfflineQueuePath,
  inspectHotReloadPathFilter,
  isAllowedHotReloadFilePath,
  resolveLinkedLayerReplacement,
  waitForStableHotReloadFile,
  type HotReloadDeltaEvent,
  type LinkedLayerBinding,
} from "./local-folder-hot-reload-watcher.js";
import {
  startDesktopHotReloadSyncSession,
  type DesktopSyncRemote,
} from "./runtime.js";

const tempRoots: string[] = [];

function sha256(content: string | Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

async function createTempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "toonstudio-hotreload-"));
  tempRoots.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(
    tempRoots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  );
});

describe("축 10 · macOS/Windows 임시 저장 파일 방어 및 확장자 화이트리스트 (#050)", () => {
  it("PSD/PNG/GLB 정상 경로만 허용하고 macOS/Windows 임시·메타데이터 파일을 차단한다", () => {
    expect(isAllowedHotReloadFilePath("hero.psd")).toBe(true);
    expect(isAllowedHotReloadFilePath("backgrounds/city_day.PNG")).toBe(true);
    expect(isAllowedHotReloadFilePath("props/chair.glb")).toBe(true);

    // OS 메타데이터 차단
    expect(inspectHotReloadPathFilter(".DS_Store")).toMatchObject({ allowed: false, reason: "os-metadata" });
    expect(inspectHotReloadPathFilter("sub/.DS_Store")).toMatchObject({ allowed: false, reason: "os-metadata" });
    expect(inspectHotReloadPathFilter("._hero.psd")).toMatchObject({ allowed: false, reason: "os-metadata" });
    expect(inspectHotReloadPathFilter("Thumbs.db")).toMatchObject({ allowed: false, reason: "os-metadata" });
    expect(inspectHotReloadPathFilter("desktop.ini")).toMatchObject({ allowed: false, reason: "os-metadata" });

    // macOS/Windows/Photoshop/Blender 임시 저장 파일 차단
    expect(inspectHotReloadPathFilter(".~tmp")).toMatchObject({ allowed: false, reason: "temporary-file" });
    expect(inspectHotReloadPathFilter("hero.psd.~tmp")).toMatchObject({ allowed: false, reason: "temporary-file" });
    expect(inspectHotReloadPathFilter("~$hero.psd")).toMatchObject({ allowed: false, reason: "temporary-file" });
    expect(inspectHotReloadPathFilter("hero.psd.tmp")).toMatchObject({ allowed: false, reason: "temporary-file" });
    expect(inspectHotReloadPathFilter("prop.glb.part")).toMatchObject({ allowed: false, reason: "temporary-file" });
    expect(inspectHotReloadPathFilter("bg.png~")).toMatchObject({ allowed: false, reason: "temporary-file" });
    expect(inspectHotReloadPathFilter(".sb-8f3c1a2b-hero.psd")).toMatchObject({ allowed: false, reason: "temporary-file" });
    expect(inspectHotReloadPathFilter(".hidden.psd")).toMatchObject({ allowed: false, reason: "temporary-file" });

    // 예약 경로 및 비허용 확장자 차단
    expect(inspectHotReloadPathFilter(".toonstudio/sync-journal.json")).toMatchObject({ allowed: false, reason: "reserved" });
    expect(inspectHotReloadPathFilter("../escape.psd")).toMatchObject({ allowed: false, reason: "reserved" });
    expect(inspectHotReloadPathFilter("notes.txt")).toMatchObject({ allowed: false, reason: "disallowed-extension" });
    expect(inspectHotReloadPathFilter("script.exe")).toMatchObject({ allowed: false, reason: "disallowed-extension" });
  });
});

describe("축 10 · 2회 연속 mtime/size 안정화 검증 (#046, #050)", () => {
  it("기본 디바운스(300ms)와 연속 안정화 횟수(2회)를 유지하고, 쓰기 도중 크기가 변하면 안정화까지 대기한다", async () => {
    expect(DEFAULT_HOT_RELOAD_DEBOUNCE_MS).toBe(300);
    expect(DEFAULT_HOT_RELOAD_REQUIRED_STABLE_CHECKS).toBe(2);

    const root = await createTempRoot();
    const target = join(root, "scene.psd");
    await writeFile(target, "chunk-1");

    let sleepCalls = 0;
    const result = await waitForStableHotReloadFile(root, "scene.psd", {
      stabilityIntervalMs: 10,
      requiredStableChecks: 2,
      maxStabilityAttempts: 8,
      sleep: async () => {
        sleepCalls += 1;
        // 1회차 대기 시점에 추가 바이트 쓰기 발생(Atomic Save / 스트리밍 쓰기 시뮬레이션)
        if (sleepCalls === 1) {
          await writeFile(target, "chunk-1-plus-chunk-2-final");
        }
      },
    });

    expect(result.status).toBe("stable");
    if (result.status === "stable") {
      expect(result.checksPerformed).toBe(2);
      expect(result.sha256).toBe(sha256("chunk-1-plus-chunk-2-final"));
      // 1회 변경으로 리셋된 뒤 2회 연속 동일 확인을 거쳐야 하므로 최소 3회 대기
      expect(sleepCalls).toBeGreaterThanOrEqual(3);
    }
  });

  it("0바이트 불완전 파일은 안정화로 인정하지 않고 차단한다", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "empty.glb"), "");

    const result = await waitForStableHotReloadFile(root, "empty.glb", {
      stabilityIntervalMs: 1,
      requiredStableChecks: 2,
      maxStabilityAttempts: 3,
      sleep: async () => undefined,
    });

    expect(result).toMatchObject({
      status: "unstable",
      reason: "zero-byte-incomplete-write",
    });
  });
});

describe("축 10 · 300ms 디바운스 & SHA-256 실제 바이트 변경 델타 통지 (#046, #047)", () => {
  it("짧은 버스트 저장을 300ms 디바운스로 합치고, 동일 바이트 재저장은 무시하며 실제 바이트 변경만 통지한다", async () => {
    const root = await createTempRoot();
    const psdPath = join(root, "character.psd");
    await writeFile(psdPath, "psd-v1");

    const deltas: HotReloadDeltaEvent[] = [];
    const suppressed: string[] = [];
    const ignored: Array<{ readonly path: string; readonly reason: string }> = [];

    const watcher = createLocalFolderHotReloadWatcher(root, {
      debounceMs: 300,
      stabilityIntervalMs: 10,
      requiredStableChecks: 2,
      watchFs: false,
      persistOfflineQueue: false,
      sleep: async () => undefined,
      onDelta: (event) => {
        deltas.push(event);
      },
      onSuppressedUnchanged: (path) => {
        suppressed.push(path);
      },
      onIgnoredPath: (path, reason) => {
        ignored.push({ path, reason });
      },
    });

    await watcher.start();

    // 임시 파일 및 OS 메타데이터 노이즈 주입
    watcher.notifyPath(".DS_Store");
    watcher.notifyPath("character.psd.~tmp");
    watcher.notifyPath("~$character.psd");

    // 1) mtime만 변경되고 실제 바이트는 동일한 재저장 → 델타 억제
    const future = new Date(Date.now() + 5_000);
    await utimes(psdPath, future, future);
    watcher.notifyPath("character.psd");
    watcher.notifyPath("character.psd");
    await watcher.waitForIdle();

    expect(deltas).toHaveLength(0);
    expect(suppressed).toEqual(["character.psd"]);
    expect(ignored).toHaveLength(3);

    // 2) 실제 바이트 변경 + 연속 버스트 통지 → 300ms 디바운스로 1회만 델타 발행
    await writeFile(psdPath, "psd-v2-real-change");
    watcher.notifyPath("character.psd");
    await writeFile(psdPath, "psd-v3-final-bytes");
    watcher.notifyPath("character.psd");
    await watcher.waitForIdle();

    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({
      kind: "updated",
      relativePath: "character.psd",
      previousSha256: sha256("psd-v1"),
      sha256: sha256("psd-v3-final-bytes"),
      stabilityChecks: 2,
    });

    // 3) 새 PNG/GLB 자산 생성 감지
    await mkdir(join(root, "props"), { recursive: true });
    await writeFile(join(root, "props/sword.glb"), "glTF-binary-v1");
    watcher.notifyPath("props/sword.glb");
    await watcher.waitForIdle();

    expect(deltas).toHaveLength(2);
    expect(deltas[1]).toMatchObject({
      kind: "created",
      relativePath: "props/sword.glb",
      extension: ".glb",
      previousSha256: null,
      sha256: sha256("glTF-binary-v1"),
    });

    const metrics = watcher.getMetrics();
    expect(metrics.emittedDeltas).toBe(2);
    expect(metrics.suppressedUnchanged).toBe(1);
    expect(metrics.ignoredPaths).toBe(3);

    await watcher.stop();
  });
});

describe("축 10 · 링크 레이어 안전 교체 및 충돌 시 버전 분기 (#048)", () => {
  it("로컬 편집이 없으면 제자리 안전 교체하고, 캔버스 편집 충돌 시 원본을 유지한 채 버전 분기를 생성한다", () => {
    const baseSha = sha256("base-psd");
    const nextSha = sha256("external-updated-psd");

    const cleanBinding: LinkedLayerBinding = {
      layerId: "layer-bg",
      layerName: "배경_거리",
      relativePath: "bg/street.psd",
      syncedSourceSha256: baseSha,
      hasLocalCanvasEdits: false,
      version: 1,
    };

    const replaced = resolveLinkedLayerReplacement(cleanBinding, {
      kind: "updated",
      relativePath: "bg/street.psd",
      sha256: nextSha,
      previousSha256: baseSha,
      detectedAt: "2026-11-23T05:00:00.000Z",
    });

    expect(replaced).toMatchObject({
      outcome: "replaced",
      previousVersion: 1,
      nextVersion: 2,
      nextSyncedSourceSha256: nextSha,
      branch: null,
    });

    const dirtyBinding: LinkedLayerBinding = {
      ...cleanBinding,
      layerId: "layer-hero",
      layerName: "주인공_선화",
      hasLocalCanvasEdits: true,
      version: 3,
    };

    const branched = resolveLinkedLayerReplacement(dirtyBinding, {
      kind: "updated",
      relativePath: "bg/street.psd",
      sha256: nextSha,
      previousSha256: baseSha,
      detectedAt: "2026-11-23T05:01:00.000Z",
    });

    expect(branched.outcome).toBe("branched");
    expect(branched.nextVersion).toBe(3);
    expect(branched.nextSyncedSourceSha256).toBe(baseSha);
    expect(branched.branch).toMatchObject({
      layerId: "layer-hero",
      baseVersion: 3,
      nextVersion: 4,
      baseSha256: baseSha,
      incomingSha256: nextSha,
      conflictReason: "local-canvas-edits",
      sidecarRelativePath: `bg/street.v4-${nextSha.slice(0, 8)}.psd`,
    });

    const detached = resolveLinkedLayerReplacement(dirtyBinding, {
      kind: "deleted",
      relativePath: "bg/street.psd",
      sha256: null,
      previousSha256: baseSha,
      detectedAt: "2026-11-23T05:02:00.000Z",
    });
    expect(detached.outcome).toBe("detached-missing");
  });
});

describe("축 10 · 오프라인 큐 영속화·병합 및 runtime 재동기화 (#049)", () => {
  it("오프라인 동안 발생한 변경을 병합·디스크 저장하고 온라인 복귀 시 순차 재동기화한다", async () => {
    const root = await createTempRoot();
    const bgPath = join(root, "bg.png");
    await writeFile(bgPath, "png-v1");

    const delivered: HotReloadDeltaEvent[] = [];
    const watcher = createLocalFolderHotReloadWatcher(root, {
      debounceMs: 20,
      stabilityIntervalMs: 1,
      requiredStableChecks: 2,
      watchFs: false,
      initialOnline: false,
      persistOfflineQueue: true,
      sleep: async () => undefined,
      initialLinkedLayers: [{
        layerId: "layer-1",
        layerName: "배경PNG",
        relativePath: "bg.png",
        syncedSourceSha256: sha256("png-v1"),
        hasLocalCanvasEdits: true,
        version: 1,
      }],
      onDelta: (event) => {
        delivered.push(event);
      },
    });

    await watcher.start();

    // 오프라인 상태에서 두 번 연속 수정 → 경로 단위로 1건으로 병합되고 원래 previousSha256 보존
    await writeFile(bgPath, "png-v2");
    watcher.notifyPath("bg.png");
    await watcher.waitForIdle();

    await writeFile(bgPath, "png-v3");
    watcher.notifyPath("bg.png");
    await watcher.waitForIdle();

    expect(delivered).toHaveLength(0);
    expect(watcher.getOfflineQueue()).toHaveLength(1);
    expect(watcher.getOfflineQueue()[0]?.delta).toMatchObject({
      kind: "updated",
      relativePath: "bg.png",
      previousSha256: sha256("png-v1"),
      sha256: sha256("png-v3"),
    });
    expect(watcher.getOfflineQueue()[0]?.delta.linkedLayerResults[0]?.outcome).toBe("branched");

    // 디스크 영속화 파일 검증 및 재시작 복원 검증
    const persistedJson = await readFile(hotReloadOfflineQueuePath(root), "utf8");
    expect(persistedJson).toContain(sha256("png-v3"));

    const reloadedQueue = new HotReloadOfflineQueue();
    const loadedCount = await reloadedQueue.loadFromDisk(root);
    expect(loadedCount).toBe(1);

    // 온라인 복귀 → 큐 자동 재동기화
    const flushResult = await watcher.setOnline(true);
    expect(flushResult).toEqual({
      attempted: 1,
      flushed: 1,
      remaining: 0,
      failedPaths: [],
    });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.sha256).toBe(sha256("png-v3"));
    expect(watcher.getMetrics().flushedOffline).toBe(1);

    await watcher.stop();
  });

  it("runtime 핫리로드 세션이 원격 장애 시 오프라인 큐에 보관하고 복구 후 sync cycle을 완료한다", async () => {
    const root = await createTempRoot();
    await writeFile(join(root, "cut01.psd"), "cut-v1");

    let remoteAvailable = false;
    const uploadFile = vi.fn(async (input: {
      readonly relativePath: string;
      readonly sha256: string;
      readonly size: number;
    }) => {
      if (!remoteAvailable) throw new Error("network unreachable");
      return {
        relativePath: input.relativePath,
        sha256: input.sha256,
        size: input.size,
        version: "remote-v2",
      };
    });

    const remote: DesktopSyncRemote = {
      listRemoteFiles: vi.fn(async () => {
        if (!remoteAvailable) throw new Error("network unreachable");
        return [];
      }),
      uploadFile,
      downloadFile: vi.fn(async () => undefined),
      deleteRemoteFile: vi.fn(async () => undefined),
      commitMetadata: vi.fn(async () => undefined),
    };

    const syncResults: number[] = [];
    const session = startDesktopHotReloadSyncSession(root, remote, {
      debounceMs: 15,
      stabilityIntervalMs: 1,
      requiredStableChecks: 2,
      watchFs: false,
      persistOfflineQueue: true,
      sleep: async () => undefined,
      now: () => "2026-11-23T05:10:00.000Z",
      onSyncResult: (result) => {
        syncResults.push(result.execution?.uploaded ?? 0);
      },
      onError: () => undefined,
    });

    await session.start();

    // 원격 단절 상태에서 파일 변경 → 전달 실패 후 자동으로 오프라인 큐 보관
    await writeFile(join(root, "cut01.psd"), "cut-v2-offline");
    session.watcher.notifyPath("cut01.psd");
    await session.watcher.waitForIdle();

    expect(syncResults).toHaveLength(0);
    expect(session.getOfflineQueue()).toHaveLength(1);

    // 원격 복구 후 큐 재동기화 실행
    remoteAvailable = true;
    const flushed = await session.flushOfflineQueue();
    expect(flushed).toMatchObject({ attempted: 1, flushed: 1, remaining: 0 });
    expect(syncResults).toEqual([1]);
    expect(uploadFile).toHaveBeenCalledTimes(1);

    await session.stop();
  });
});
