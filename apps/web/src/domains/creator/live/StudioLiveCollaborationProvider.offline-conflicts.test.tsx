import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StudioOfflineBranchConflictDetail } from "../offline-branch/studio-offline-branch-runtime";
import {
  offlineAuthority, lifecycle, rooms, renderProvider,
  resetStudioLiveProviderFixture, cleanupStudioLiveProviderFixture,
} from "./studio-live-collaboration-provider.test-support";

function offlineConflictDetail(): StudioOfflineBranchConflictDetail {
  return {
    operationId: "offline-operation-a", pageId: "page-a", pageName: "1페이지",
    targetId: "stroke-a", targetType: "stroke", action: "upsert",
    code: "target-changed", message: "공유본 변경", canonicalFingerprint: "fp1:1111111111111111",
    canKeepCanonical: true, canReapplyLocal: true, disabledReason: null,
  };
}

describe("오프라인 충돌 선택의 live-room 수명주기", () => {
  beforeEach(resetStudioLiveProviderFixture);
  afterEach(cleanupStudioLiveProviderFixture);

  it("저장된 오프라인 충돌을 구독하고 공유본 유지 뒤 현재 목록을 갱신한다", async () => {
    offlineAuthority.enabled = true;
    offlineAuthority.initialConflicts = [offlineConflictDetail()];
    offlineAuthority.fanout = "authoritative";
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = { state: "ready", message: "정본 준비" };
    const options = { outboxScope: "user-a" };
    let live = await renderProvider(options);
    await vi.waitFor(async () => { live = await renderProvider(options); expect(live.offlineBranch?.conflicts).toHaveLength(1); });
    expect(live.offlineBranch?.pendingOperations).toBe(1);
    await live.resolveOfflineConflict({ operationId: "offline-operation-a", action: "keep-canonical", expectedCanonicalFingerprint: "fp1:1111111111111111" });
    live = await renderProvider(options);
    expect(live.offlineBranch?.conflicts).toHaveLength(0);
    expect(live.offlineBranch?.pendingOperations).toBe(0);
    expect(offlineAuthority.instances[0].resolveCalls).toHaveLength(1);
  });


  it("같은 세대의 재적용은 기존 보호 장벽으로 승격하고 서버 승인 전 대기를 유지한다", async () => {
    offlineAuthority.enabled = true;
    offlineAuthority.initialConflicts = [offlineConflictDetail()];
    offlineAuthority.fanout = "authoritative";
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = { state: "ready", message: "정본 준비" };
    const options = { outboxScope: "user-a" };
    let live = await renderProvider(options);
    await vi.waitFor(async () => { live = await renderProvider(options); expect(live.offlineBranch?.conflicts).toHaveLength(1); });
    await live.resolveOfflineConflict({ operationId: "offline-operation-a", action: "reapply-local", expectedCanonicalFingerprint: "fp1:1111111111111111" });
    live = await renderProvider(options);
    expect(offlineAuthority.instances[0].promoteCalls).toBe(1);
    expect(lifecycle.bindings[0].draftProtectionTimeouts).toHaveLength(1);
    expect(live.offlineBranch?.conflicts).toHaveLength(0);
    expect(live.offlineBranch?.pendingOperations).toBe(1);
  });

  it("원고가 바뀐 이전 화면의 충돌 선택을 거절하고 이전 구독을 해제한다", async () => {
    offlineAuthority.enabled = true;
    offlineAuthority.initialConflicts = [offlineConflictDetail()];
    offlineAuthority.fanout = "authoritative";
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = { state: "ready", message: "정본 준비" };
    const options = { outboxScope: "user-a" };
    let previous = await renderProvider(options);
    await vi.waitFor(async () => { previous = await renderProvider(options); expect(previous.offlineBranch?.conflicts).toHaveLength(1); });
    await renderProvider({ ...options, workId: "work-b" });
    await expect(previous.resolveOfflineConflict({ operationId: "offline-operation-a", action: "keep-canonical", expectedCanonicalFingerprint: null })).rejects.toThrow();
    expect(offlineAuthority.instances[0].resolveCalls).toHaveLength(0);
    expect(offlineAuthority.instances[0].unsubscribeCount).toBe(1);
  });

  it("재적용 결정을 기다리는 동안 원고가 바뀌면 이전 문서의 정본 승격을 시작하지 않는다", async () => {
    offlineAuthority.enabled = true;
    offlineAuthority.initialConflicts = [offlineConflictDetail()];
    offlineAuthority.fanout = "authoritative";
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = { state: "ready", message: "정본 준비" };
    const options = { outboxScope: "user-a" };
    let previous = await renderProvider(options);
    await vi.waitFor(async () => { previous = await renderProvider(options); expect(previous.offlineBranch?.conflicts).toHaveLength(1); });
    const runtime = offlineAuthority.instances[0];
    let finish: () => void = () => undefined;
    runtime.resolutionBarrier = new Promise<void>((resolve) => { finish = resolve; });
    const pending = previous.resolveOfflineConflict({ operationId: "offline-operation-a", action: "reapply-local", expectedCanonicalFingerprint: "fp1:1111111111111111" });
    await renderProvider({ ...options, workId: "work-b" });
    finish();
    await expect(pending).rejects.toThrow();
    expect(runtime.promoteCalls).toBe(0);
  });

  it("편집 권한 회수 직후 렌더 전이라도 충돌 재적용을 거절한다", async () => {
    offlineAuthority.enabled = true;
    offlineAuthority.initialConflicts = [offlineConflictDetail()];
    offlineAuthority.fanout = "authoritative";
    lifecycle.roomStart = "resolve";
    lifecycle.bindingStatusOnStart = { state: "ready", message: "정본 준비" };
    const options = { outboxScope: "user-a" };
    let live = await renderProvider(options);
    await vi.waitFor(async () => { live = await renderProvider(options); expect(live.offlineBranch?.conflicts).toHaveLength(1); });
    rooms.instances[0].emit({ type: "transport-status", status: { state: "revoked", recoverable: false, message: "권한 회수" } });
    await expect(live.resolveOfflineConflict({ operationId: "offline-operation-a", action: "reapply-local", expectedCanonicalFingerprint: null })).rejects.toThrow();
    expect(offlineAuthority.instances[0].resolveCalls).toHaveLength(0);
  });

});
