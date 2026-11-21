import { describe, expect, it, vi } from "vitest";

import {
  canApplyStudioAiJob,
  createStudioAiGenerationQueueStore,
  studioAiJobUserState,
} from "./studio-ai-generation-queue-store";

function createMemoryStorage() {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

describe("studio-ai-generation-queue-store (AC-001 9-state lifecycle)", () => {
  it("runs all 9 canonical states cleanly and blocks apply until approved", async () => {
    const storage = createMemoryStorage();
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 10, 21, 12, 0, tick++)).toISOString();

    const store = createStudioAiGenerationQueueStore({
      documentId: "page-1",
      storage,
      now,
    });
    await store.hydrate();

    // 1. draft
    const draft = store.createDraft({
      id: "job-1",
      skill: "line-cleanup",
      prompt: "연필 러프 선화 정리",
      privacy: "cloud-provider",
      estimatedCredits: 2,
      selectionId: "sel-1",
    });
    expect(draft.status).toBe("draft");
    expect(draft.requiresExternalTransfer).toBe(true);
    expect(canApplyStudioAiJob(draft)).toBe(false);
    expect(studioAiJobUserState(draft).labelKo).toBe("요청 준비");

    // 2. awaiting-confirmation
    const awaiting = store.requestConfirmation("job-1");
    expect(awaiting.status).toBe("awaiting-confirmation");
    expect(studioAiJobUserState(awaiting).requiresAttention).toBe(true);

    // 3. queued
    const queued = store.confirm("job-1", true);
    expect(queued.status).toBe("queued");

    // 4. running + monotonic progress
    const running = store.start("job-1");
    expect(running.status).toBe("running");
    const prog1 = store.reportProgress("job-1", 0.4);
    expect(prog1.progress).toBe(0.4);
    const prog2 = store.reportProgress("job-1", 0.2); // clamped monotonically
    expect(prog2.progress).toBe(0.4);

    // 5. preview-ready
    const previewReady = store.deliverPreview(
      "job-1",
      {
        previewId: "prev-1",
        outputRefs: ["draft-layer-1"],
        estimatedCreditsUsed: 2,
        warnings: ["외부 모델 결과입니다."],
      },
      {
        previewId: "prev-1",
        kind: "image",
        title: "선화 정리 초안 레이어",
        dataUrl: "data:image/png;base64,AAAA",
        width: 512,
        height: 512,
      },
    );
    expect(previewReady.status).toBe("preview-ready");
    expect(canApplyStudioAiJob(previewReady)).toBe(false);

    // Refuses to apply before explicit approval
    const blockedApply = await store.apply("job-1", "copy", vi.fn());
    expect(blockedApply.ok).toBe(false);

    // 6. approved
    const approved = store.approve("job-1");
    expect(approved.status).toBe("approved");
    expect(canApplyStudioAiJob(approved)).toBe(true);

    // 7. applied (non-destructive document insertion)
    const executor = vi.fn().mockResolvedValue({
      mode: "copy" as const,
      targetDocumentId: "page-1",
      createdObjectIds: ["layer-ai-1"],
    });
    const appliedResult = await store.apply("job-1", "copy", executor);
    expect(appliedResult.ok).toBe(true);
    expect(appliedResult.job?.status).toBe("applied");
    expect(executor).toHaveBeenCalledTimes(1);

    // 8. failed -> retry -> queued -> execute -> preview-ready
    const job2 = store.submitForConfirmation({
      id: "job-2",
      skill: "flat-color",
      prompt: "교복 밑색 채색",
      privacy: "local",
    });
    expect(job2.status).toBe("awaiting-confirmation");
    store.confirm("job-2", true);
    store.start("job-2");
    const failed = store.fail("job-2", "TIMEOUT", "응답 시간 초과");
    expect(failed.status).toBe("failed");
    const retried = store.retry("job-2");
    expect(retried.status).toBe("queued");
    const ran = await store.executeQueuedJob("job-2", { stepDelayMs: 0 });
    expect(ran.status).toBe("preview-ready");
    expect(store.getSnapshot().artifacts["job-2"]?.dataUrl).toContain("data:image/svg+xml");

    // 9. cancelled via confirmation decline
    const job3 = store.submitForConfirmation({
      id: "job-3",
      skill: "dialogue-rewrite",
      prompt: "대사 자연스럽게 다듬기",
      privacy: "cloud-provider",
    });
    const cancelled = store.confirm(job3.id, false);
    expect(cancelled.status).toBe("cancelled");
  });

  it("persists queue to local storage and recovers interrupted running jobs on reload", async () => {
    const storage = createMemoryStorage();
    const store1 = createStudioAiGenerationQueueStore({
      documentId: "episode-7",
      storage,
    });
    await store1.hydrate();

    const approvedJob = store1.submitForConfirmation({
      id: "job-approved",
      skill: "line-cleanup",
      prompt: "1컷 선화 정리",
      privacy: "local",
    });
    store1.confirm(approvedJob.id, true);
    await store1.executeQueuedJob(approvedJob.id, { stepDelayMs: 0 });
    store1.approve(approvedJob.id);

    const interruptedJob = store1.submitForConfirmation({
      id: "job-running",
      skill: "relight",
      prompt: "노을 역광 보정",
      privacy: "cloud-provider",
    });
    store1.confirm(interruptedJob.id, true);
    store1.start(interruptedJob.id);

    // Simulate fresh reload on same documentId + storage
    const store2 = createStudioAiGenerationQueueStore({
      documentId: "episode-7",
      storage,
    });
    const hydratedOk = await store2.hydrate();
    expect(hydratedOk).toBe(true);

    const restoredApproved = store2
      .getSnapshot()
      .jobs.find((item) => item.id === "job-approved");
    expect(restoredApproved?.status).toBe("approved");
    expect(store2.getSnapshot().artifacts["job-approved"]?.kind).toBe("image");

    const restoredInterrupted = store2
      .getSnapshot()
      .jobs.find((item) => item.id === "job-running");
    expect(restoredInterrupted?.status).toBe("failed");
    expect(restoredInterrupted?.error?.code).toBe("SESSION_INTERRUPTED");
  });
});
