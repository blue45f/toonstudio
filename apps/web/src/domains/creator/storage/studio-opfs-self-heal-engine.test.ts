import { describe, expect, it, vi } from "vitest";

import { createStudioOpfsMemoryFileSystem } from "../studio-opfs-filesystem";
import {
  STUDIO_OPFS_ORPHAN_GRACE_WINDOW_MS,
  computeSnapshotSha256,
  computeSnapshotSha256Sync,
  createOpfsSnapshotTimeMachine,
  createVerifiedManuscriptSnapshot,
  diagnoseStorageQuota,
  evaluateSnapshotTimeline,
  executeOrphanTempCleanup,
  formatStorageBytes,
  inspectBrowserStorageQuota,
  planOrphanTempCleanup,
  verifyManuscriptSnapshotIntegrity,
  type StudioOpfsFileEntry,
} from "./studio-opfs-self-heal-engine";

const TEXT_ENCODER = new TextEncoder();

describe("StorageManager 잔여 용량 진단", () => {
  it("안전(<75%) · 주의(75%~89.9%) · 위험(90%+) 등급을 정확한 경계로 판정한다", () => {
    const quota = 1_000_000_000; // 1GB

    const safe = diagnoseStorageQuota({ usage: 749_000_000, quota });
    expect(safe.grade).toBe("safe");
    expect(safe.needsCleanup).toBe(false);
    expect(safe.needsBackup).toBe(false);
    expect(safe.remainingBytes).toBe(251_000_000);

    const warningAt75 = diagnoseStorageQuota({ usage: 750_000_000, quota });
    expect(warningAt75.grade).toBe("warning");
    expect(warningAt75.usagePercent).toBe(75);
    expect(warningAt75.needsCleanup).toBe(true);
    expect(warningAt75.needsBackup).toBe(false);

    const warningAt899 = diagnoseStorageQuota({ usage: 899_000_000, quota });
    expect(warningAt899.grade).toBe("warning");

    const criticalAt90 = diagnoseStorageQuota({ usage: 900_000_000, quota });
    expect(criticalAt90.grade).toBe("critical");
    expect(criticalAt90.usagePercent).toBe(90);
    expect(criticalAt90.needsCleanup).toBe(true);
    expect(criticalAt90.needsBackup).toBe(true);
    expect(criticalAt90.remainingBytes).toBe(100_000_000);

    const overQuota = diagnoseStorageQuota({ usage: 1_200_000_000, quota });
    expect(overQuota.grade).toBe("critical");
    expect(overQuota.remainingBytes).toBe(0);
  });

  it("용량 미지원·0/음수·예외 발생 시 unavailable로 안전 폴백한다", async () => {
    expect(diagnoseStorageQuota(null).grade).toBe("unavailable");
    expect(diagnoseStorageQuota({ usage: 10, quota: 0 }).grade).toBe("unavailable");
    expect(diagnoseStorageQuota({ usage: -1, quota: 100 }).grade).toBe("unavailable");

    const failed = await inspectBrowserStorageQuota({
      estimate: async () => {
        throw new Error("SecurityError");
      },
    });
    expect(failed.grade).toBe("unavailable");

    const ok = await inspectBrowserStorageQuota({
      estimate: async () => ({ usage: 820, quota: 1000 }),
    });
    expect(ok.grade).toBe("warning");
    expect(formatStorageBytes(0)).toBe("0 B");
    expect(formatStorageBytes(1024 * 1024 * 12.5)).toBe("12.5 MB");
  });
});

describe("고아 임시 파일 정리 계획 및 실행", () => {
  const NOW = 1_750_000_000_000;
  const STALE_TIME = NOW - STUDIO_OPFS_ORPHAN_GRACE_WINDOW_MS - 60_000;
  const RECENT_TIME = NOW - 30_000;

  it("오래된 고아 임시 파일만 정리 대상으로 선별하고 진행 중 원고·최신 스냅샷·정규 DB·유예 창 임시 파일은 절대 삭제하지 않는다", () => {
    const entries: StudioOpfsFileEntry[] = [
      { path: "tmp/autosave-crash-01.tmp", sizeBytes: 4_096, updatedAtMs: STALE_TIME },
      { path: "staging/layer-tile.crswap", sizeBytes: 8_192, updatedAtMs: STALE_TIME },
      { path: "blobs/write-in-progress.part", sizeBytes: 2_048, updatedAtMs: RECENT_TIME },
      { path: "timemachine/proj-1/snapshot-000002-latest.json", sizeBytes: 20_000, updatedAtMs: STALE_TIME, projectId: "proj-1" },
      { path: "timemachine/proj-1/snapshot-000001-prev.json", sizeBytes: 18_000, updatedAtMs: STALE_TIME - 10_000, projectId: "proj-1" },
      { path: "manuscripts/ep01-active.tmp", sizeBytes: 50_000, updatedAtMs: STALE_TIME, projectId: "proj-1" },
      { path: "toonstudio-studio-sqlite/studio-local-v12.db", sizeBytes: 120_000, updatedAtMs: STALE_TIME },
      { path: "../escape/bad.tmp", sizeBytes: 100, updatedAtMs: STALE_TIME },
    ];

    const plan = planOrphanTempCleanup(entries, {
      activeManuscriptPaths: ["manuscripts/ep01-active.tmp"],
      activeProjectIds: ["proj-1"],
      protectedSnapshotPaths: ["timemachine/proj-1/snapshot-000002-latest.json"],
      nowMs: NOW,
    });

    expect(plan.deletable.map((item) => item.path)).toEqual([
      "staging/layer-tile.crswap",
      "tmp/autosave-crash-01.tmp",
    ]);
    expect(plan.reclaimableBytes).toBe(4_096 + 8_192);

    // 진행 중 원고(확장자가 .tmp여도 activeManuscriptPaths 등록 시 보호!), 최신 스냅샷, 정규 DB 모두 보호 확인
    const protectedPaths = new Set(plan.protectedItems.map((item) => item.path));
    expect(protectedPaths.has("manuscripts/ep01-active.tmp")).toBe(true);
    expect(protectedPaths.has("timemachine/proj-1/snapshot-000002-latest.json")).toBe(true);
    expect(protectedPaths.has("timemachine/proj-1/snapshot-000001-prev.json")).toBe(true);
    expect(protectedPaths.has("toonstudio-studio-sqlite/studio-local-v12.db")).toBe(true);

    // 최근 임시 파일은 유예 창 보류, 경로 탈출 시도는 invalid로 보류
    expect(plan.deferredItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "blobs/write-in-progress.part", decision: "defer-grace-window" }),
        expect.objectContaining({ path: "../escape/bad.tmp", decision: "skip-invalid-path" }),
      ]),
    );
  });

  it("dry-run은 삭제 호출 없이 계획만 보고하고, 실실행 시 개별 잠금 오류를 견디며 나머지를 회수한다", async () => {
    const plan = planOrphanTempCleanup(
      [
        { path: "tmp/stale-a.tmp", sizeBytes: 1_000, updatedAtMs: STALE_TIME },
        { path: "tmp/locked-b.crswap", sizeBytes: 2_500, updatedAtMs: STALE_TIME },
      ],
      { nowMs: NOW },
    );

    const removeSpy = vi.fn(async (path: string) => {
      if (path === "tmp/locked-b.crswap") throw new Error("NoModificationAllowedError");
      return true;
    });

    const dryResult = await executeOrphanTempCleanup(plan, removeSpy, { dryRun: true });
    expect(dryResult.dryRun).toBe(true);
    expect(dryResult.removedPaths).toEqual([]);
    expect(removeSpy).not.toHaveBeenCalled();

    const realResult = await executeOrphanTempCleanup(plan, removeSpy);
    expect(realResult.dryRun).toBe(false);
    expect(realResult.removedPaths).toEqual(["tmp/stale-a.tmp"]);
    expect(realResult.reclaimedBytes).toBe(1_000);
    expect(realResult.failedPaths).toEqual([
      { path: "tmp/locked-b.crswap", error: "NoModificationAllowedError" },
    ]);
  });
});

describe("스냅샷 SHA-256 무결성 검증 및 타임머신 자동 복구", () => {
  it("동기·비동기 SHA-256 다이제스트가 일치하며 1바이트 변조·길이 불일치·손상 JSON·작품 범위 불일치를 차단한다", async () => {
    const payload = JSON.stringify({ title: "1화 원고", pages: [{ id: "p1", strokes: 42 }] });
    const syncHash = computeSnapshotSha256Sync(payload);
    const asyncHash = await computeSnapshotSha256(payload);
    expect(syncHash).toBe(asyncHash);
    expect(syncHash).toMatch(/^[a-f0-9]{64}$/u);

    const valid = createVerifiedManuscriptSnapshot({
      snapshotId: "snap-1",
      projectId: "proj-alpha",
      revision: 1,
      label: "초안 저장",
      payload,
      createdAtMs: 1_000,
    });
    expect(verifyManuscriptSnapshotIntegrity(valid, { expectedProjectId: "proj-alpha" }).valid).toBe(true);

    // 1글자 변조 (동일 길이 유지) -> corrupt-hash-mismatch
    const tampered = { ...valid, payload: payload.replace("42", "99") };
    expect(verifyManuscriptSnapshotIntegrity(tampered).status).toBe("corrupt-hash-mismatch");

    // 길이 불일치 -> corrupt-byte-length
    const truncated = { ...valid, payload: payload.slice(0, -2) };
    expect(verifyManuscriptSnapshotIntegrity(truncated).status).toBe("corrupt-byte-length");

    // 다른 작품 범위 -> scope-mismatch
    expect(verifyManuscriptSnapshotIntegrity(valid, { expectedProjectId: "proj-beta" }).status).toBe("scope-mismatch");

    // 해시는 맞지만 본문이 깨진 JSON -> corrupt-json
    const badJsonPayload = "{broken-json";
    const badJson = createVerifiedManuscriptSnapshot({
      snapshotId: "snap-bad",
      projectId: "proj-alpha",
      revision: 2,
      label: "깨진 JSON",
      payload: badJsonPayload,
    });
    expect(verifyManuscriptSnapshotIntegrity(badJson).status).toBe("corrupt-json");
  });

  it("최신 스냅샷이 OPFS에서 손상(해시 변조·절단 쓰기)되면 직전 정상 스냅샷(last-known-good)으로 자동 복구한다", async () => {
    const fs = createStudioOpfsMemoryFileSystem();
    let clock = 1_750_000_000_000;
    const timeMachine = createOpfsSnapshotTimeMachine({
      fs,
      projectId: "ep-12-main",
      maxSnapshots: 5,
      now: () => {
        clock += 60_000;
        return clock;
      },
    });

    const rev1 = await timeMachine.saveSnapshot({
      snapshotId: "rev-1",
      revision: 1,
      label: "선화 완료",
      payload: JSON.stringify({ episode: 12, stage: "lineart", cuts: 18 }),
    });
    const rev2 = await timeMachine.saveSnapshot({
      snapshotId: "rev-2",
      revision: 2,
      label: "밑색 완료",
      parentSnapshotId: rev1.record.snapshotId,
      payload: JSON.stringify({ episode: 12, stage: "base-color", cuts: 18 }),
    });
    const rev3 = await timeMachine.saveSnapshot({
      snapshotId: "rev-3",
      revision: 3,
      label: "명암 작업 중",
      parentSnapshotId: rev2.record.snapshotId,
      payload: JSON.stringify({ episode: 12, stage: "shading", cuts: 18 }),
    });

    // 정상 상태에서는 rev3이 최신이자 정상
    const healthy = await timeMachine.inspectTimeline();
    expect(healthy.recoveryStatus).toBe("healthy");
    expect(healthy.selfHealed).toBe(false);
    expect(healthy.lastKnownGood?.snapshotId).toBe("rev-3");

    // 크래시로 최신 스냅샷(rev3)이 OPFS에서 손상(절단 JSON)된 상황 시뮬레이션
    await fs.write(rev3.path, TEXT_ENCODER.encode('{"schemaVersion":1,"truncated":'));

    const recovery = await timeMachine.recoverLastKnownGood();
    expect(recovery.recovered).toBe(true);
    expect(recovery.selfHealed).toBe(true);
    expect(recovery.timeline.recoveryStatus).toBe("auto-recovered");
    expect(recovery.snapshot?.snapshotId).toBe("rev-2");
    expect(recovery.snapshot?.revision).toBe(2);
    expect(recovery.snapshotPath).toBe(rev2.path);
    expect(recovery.corruptedPaths).toEqual([rev3.path]);

    // 손상된 rev3 ID 직접 복원은 거부하고 정상 rev1 복원은 허용
    expect(await timeMachine.restoreSnapshotById("rev-3")).toBeNull();
    expect((await timeMachine.restoreSnapshotById("rev-1"))?.label).toBe("선화 완료");

    // 통합 진단 시 오래된 고아 임시 파일은 정리 후보로 잡히고, 스냅샷·활성 원고는 보호된다
    await fs.write("tmp/crashed-autosave.tmp", TEXT_ENCODER.encode("orphan-bytes"));
    await fs.write("work/active-ep12.json", TEXT_ENCODER.encode('{"active":true}'));
    const diagnosis = await timeMachine.runSelfHealDiagnosis({
      estimator: { estimate: async () => ({ usage: 920_000, quota: 1_000_000 }) },
      activeManuscriptPaths: ["work/active-ep12.json"],
      nowMs: clock + STUDIO_OPFS_ORPHAN_GRACE_WINDOW_MS + 10_000,
    });

    expect(diagnosis.quota.grade).toBe("critical");
    expect(diagnosis.timeline.selfHealed).toBe(true);
    expect(diagnosis.cleanupPlan.deletable.map((item) => item.path)).toEqual(["tmp/crashed-autosave.tmp"]);
    const protectedSet = new Set(diagnosis.cleanupPlan.protectedItems.map((item) => item.path));
    expect(protectedSet.has(rev2.path)).toBe(true);
    expect(protectedSet.has(rev1.path)).toBe(true);
    expect(protectedSet.has("work/active-ep12.json")).toBe(true);
  });

  it("모든 스냅샷이 손상된 경우 unrecoverable을 명시하고 거짓 복구를 반환하지 않는다", () => {
    const broken = createVerifiedManuscriptSnapshot({
      snapshotId: "snap-broken",
      projectId: "proj-z",
      revision: 4,
      label: "손상본",
      payload: JSON.stringify({ ok: true }),
    });
    const report = evaluateSnapshotTimeline("proj-z", [
      { path: "timemachine/proj-z/snapshot-000004.json", record: { ...broken, payload: JSON.stringify({ ok: false }) } },
    ]);
    expect(report.recoveryStatus).toBe("unrecoverable");
    expect(report.selfHealed).toBe(false);
    expect(report.lastKnownGood).toBeNull();
    expect(report.corruptedCount).toBe(1);
  });
});
