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
  it("빈 저장소에서 시작한 연속 초안은 복원 호출 전에도 같은 인스턴스가 계속 저장한다", () => {
    const storage = createMemoryStorage();
    const store = createStudioAiGenerationQueueStore({ documentId: "new-queue", storage });
    store.createDraft({ id: "first", skill: "story-outline", prompt: "첫 초안" });
    store.createDraft({ id: "second", skill: "story-outline", prompt: "다음 초안" });
    const payload = JSON.parse(storage.getItem("toonstudio.ai-generation-queue.v1:new-queue") ?? "null");
    expect(payload.jobs.map((job: { id: string }) => job.id)).toEqual(["second", "first"]);
  });

  it("문서별로 초안을 분리하고 복원 전에 만든 초안도 기존 대기열과 함께 보존한다", async () => {
    const storage = createMemoryStorage();
    const first = createStudioAiGenerationQueueStore({ documentId: "queue-a", storage });
    await first.hydrate();
    first.createDraft({ id: "saved", skill: "story-outline", prompt: "기존 초안" });
    const original = storage.getItem("toonstudio.ai-generation-queue.v1:queue-a");
    const reopened = createStudioAiGenerationQueueStore({ documentId: "queue-a", storage });
    reopened.createDraft({ id: "early", skill: "story-outline", prompt: "복원 중 새 초안" });
    expect(storage.getItem("toonstudio.ai-generation-queue.v1:queue-a")).toBe(original);
    expect(await reopened.hydrate()).toBe(true);
    expect(reopened.getSnapshot().jobs.map(job => job.id)).toEqual(["early", "saved"]);
    const other = createStudioAiGenerationQueueStore({ documentId: "queue-b", storage });
    await other.hydrate();
    expect(other.getSnapshot().jobs).toEqual([]);
    const payload = JSON.parse(storage.getItem("toonstudio.ai-generation-queue.v1:queue-a") ?? "null");
    expect(payload.documentId).toBe("queue-a");
    expect(payload.jobs.map((job: { id: string }) => job.id)).toEqual(["early", "saved"]);
  });

  it.each([
    "{broken", "null", JSON.stringify({ schemaVersion: 2, jobs: [], artifacts: {} }),
    JSON.stringify({ schemaVersion: 1, documentId: "another-document", jobs: [], artifacts: {} }),
    JSON.stringify({ schemaVersion: 1, jobs: [{}], artifacts: {} }),
  ])("손상·미지원·다른 문서 대기열 원본을 새 초안으로 덮지 않는다: %s", async original => {
    const storage = createMemoryStorage(), key = "toonstudio.ai-generation-queue.v1:protected";
    storage.setItem(key, original);
    const store = createStudioAiGenerationQueueStore({ documentId: "protected", storage });
    expect(await store.hydrate()).toBe(false);
    store.createDraft({ id: "memory", skill: "story-outline", prompt: "메모리 초안" });
    expect(store.getSnapshot().jobs[0]?.id).toBe("memory");
    expect(store.getSnapshot().storageError).not.toBeNull();
    expect(storage.getItem(key)).toBe(original);
  });

  it("저장 거부 시 이전 원본과 메모리 초안을 보존하며 저장 성공을 보고하지 않는다", async () => {
    const storage = createMemoryStorage(), key = "toonstudio.ai-generation-queue.v1:quota";
    const store = createStudioAiGenerationQueueStore({ documentId: "quota", storage });
    await store.hydrate();
    store.createDraft({ id: "saved", skill: "story-outline", prompt: "저장된 초안" });
    const original = storage.getItem(key);
    vi.spyOn(storage, "setItem").mockImplementation(() => { throw new Error("quota"); });
    store.createDraft({ id: "memory", skill: "story-outline", prompt: "새 초안" });
    expect(storage.getItem(key)).toBe(original);
    expect(store.getSnapshot().jobs.map(job => job.id)).toEqual(["memory", "saved"]);
    expect(store.getSnapshot().storageError).not.toBeNull();
  });

  it("최초 읽기 실패 후 편집해도 원본을 유지하고 재시도에서 두 대기열을 병합한다", async () => {
    const storage = createMemoryStorage(), key = "toonstudio.ai-generation-queue.v1:read-retry";
    const initial = createStudioAiGenerationQueueStore({ documentId: "read-retry", storage });
    initial.createDraft({ id: "saved", skill: "story-outline", prompt: "저장된 초안" });
    const original = storage.getItem(key);
    const reopened = createStudioAiGenerationQueueStore({ documentId: "read-retry", storage });
    vi.spyOn(storage, "getItem").mockImplementationOnce(() => { throw new Error("read unavailable"); });
    expect(await reopened.hydrate()).toBe(false);
    reopened.createDraft({ id: "memory", skill: "story-outline", prompt: "읽기 실패 후 새 초안" });
    expect(storage.getItem(key)).toBe(original);
    expect(reopened.getSnapshot().storageError).not.toBeNull();
    expect(await reopened.hydrate()).toBe(true);
    expect(reopened.getSnapshot().jobs.map(job => job.id)).toEqual(["memory", "saved"]);
    expect(reopened.getSnapshot().storageError).toBeNull();
    expect(JSON.parse(storage.getItem(key) ?? "null").jobs.map((job: { id: string }) => job.id)).toEqual(["memory", "saved"]);
  });

  it("기존 키의 문서 ID 없는 v1 기록은 복원하고 작업 사본은 24개로 제한한다", async () => {
    const storage = createMemoryStorage(), key = "toonstudio.ai-generation-queue.v1:legacy";
    storage.setItem(key, JSON.stringify({ schemaVersion: 1, jobs: [], artifacts: {} }));
    const store = createStudioAiGenerationQueueStore({ documentId: "legacy", storage });
    expect(await store.hydrate()).toBe(true);
    for (let index = 0; index < 25; index += 1) store.createDraft({ id: `job-${index}`, skill: "story-outline", prompt: "초안" });
    expect(store.getSnapshot().jobs).toHaveLength(24);
    expect(JSON.parse(storage.getItem(key) ?? "null").jobs).toHaveLength(24);
  });

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
