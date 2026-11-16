import { describe, expect, it } from "vitest";

import {
  deriveStudioPublishingPersistenceStatus,
  type StudioPublishingPersistenceStatusInput,
} from "./studio-publishing-persistence-status";

function baseInput(
  overrides: Partial<StudioPublishingPersistenceStatusInput> = {},
): StudioPublishingPersistenceStatusInput {
  return {
    authUserId: null,
    workId: null,
    pageCount: 0,
    title: "",
    description: "",
    tagsText: "",
    hasHandoffContext: false,
    dirty: false,
    saving: false,
    recoveryBusy: false,
    hydrating: false,
    loadingFiles: false,
    handoffLoading: false,
    hydrationStatus: "ready",
    hydrationScopeCurrent: false,
    hasHydratedScope: false,
    handoffError: null,
    workRevision: undefined,
    confirmedSaveReceipt: null,
    failedSaveAttempt: null,
    ...overrides,
  };
}

describe("deriveStudioPublishingPersistenceStatus", () => {
  it("비로그인 초기 진입(0페이지·수정 없음·dirty=false)을 저장 완료로 오인하지 않고 empty 중립 상태로 판정한다", () => {
    const status = deriveStudioPublishingPersistenceStatus(baseInput());

    expect(status.kind).toBe("empty");
    expect(status.tone).toBe("neutral");
    expect(status.hasConfirmedServerPersistence).toBe(false);
    expect(status.summaryKo).not.toContain("현재 버전까지 저장됨");
    expect(status.summaryEn).not.toContain("Saved through current version");
    expect(status.dockKo).toContain("서버 미저장");
  });

  it("로그인 초기 진입이라도 서버 작품이 없고 수정이 없으면 dirty=false여도 empty로 유지한다", () => {
    const status = deriveStudioPublishingPersistenceStatus(
      baseInput({ authUserId: "dummy-user-1" }),
    );

    expect(status.kind).toBe("empty");
    expect(status.tone).toBe("neutral");
    expect(status.hasConfirmedServerPersistence).toBe(false);
  });

  it("비로그인 게스트가 제목·이미지를 준비하면 guest-unsaved 경고 상태로 전환한다", () => {
    const status = deriveStudioPublishingPersistenceStatus(
      baseInput({
        authUserId: null,
        title: "더미 게스트 원고",
        dirty: true,
      }),
    );

    expect(status.kind).toBe("guest-unsaved");
    expect(status.tone).toBe("warning");
    expect(status.hasConfirmedServerPersistence).toBe(false);
    expect(status.summaryKo).toContain("로그인 전 미저장 상태");
  });

  it("로그인 사용자의 미저장 편집과 서버 저장 실패·저장 성공을 명확히 구분한다", () => {
    const unsaved = deriveStudioPublishingPersistenceStatus(
      baseInput({
        authUserId: "dummy-user-1",
        pageCount: 1,
        title: "더미 원고",
        dirty: true,
      }),
    );
    expect(unsaved.kind).toBe("unsaved-changes");
    expect(unsaved.tone).toBe("warning");
    expect(unsaved.hasConfirmedServerPersistence).toBe(false);

    const failed = deriveStudioPublishingPersistenceStatus(
      baseInput({
        authUserId: "dummy-user-1",
        pageCount: 1,
        title: "더미 원고",
        dirty: true,
        failedSaveAttempt: {
          authUserId: "dummy-user-1",
          workId: null,
          message: "더미 저장 실패",
        },
      }),
    );
    expect(failed.kind).toBe("save-failed");
    expect(failed.tone).toBe("danger");
    expect(failed.hasConfirmedServerPersistence).toBe(false);

    const saved = deriveStudioPublishingPersistenceStatus(
      baseInput({
        authUserId: "dummy-user-1",
        workId: "dummy-work-1",
        pageCount: 1,
        title: "더미 원고",
        dirty: false,
        workRevision: 2,
        confirmedSaveReceipt: {
          authUserId: "dummy-user-1",
          savedWorkId: "dummy-work-1",
          sourceWorkId: null,
          revision: 2,
        },
      }),
    );
    expect(saved.kind).toBe("saved");
    expect(saved.tone).toBe("success");
    expect(saved.hasConfirmedServerPersistence).toBe(true);
    expect(saved.confirmedRevision).toBe(2);
    expect(saved.summaryKo).toContain("버전 #2까지 저장됨");
    expect(saved.dockKo).toContain("서버 버전 #2 저장됨");
  });

  it("기존 서버 저장본(dirty=false)에서 게시·저장 요청이 실패하면 성공 배지 대신 save-failed를 표시한다", () => {
    const failedOnCleanHydratedWork = deriveStudioPublishingPersistenceStatus(
      baseInput({
        authUserId: "dummy-user-1",
        workId: "dummy-work-1",
        pageCount: 2,
        title: "기존 원고",
        dirty: false,
        hydrationStatus: "ready",
        hydrationScopeCurrent: true,
        hasHydratedScope: true,
        workRevision: 4,
        failedSaveAttempt: {
          authUserId: "dummy-user-1",
          workId: "dummy-work-1",
          message: "게시 실패",
        },
      }),
    );

    expect(failedOnCleanHydratedWork.kind).toBe("save-failed");
    expect(failedOnCleanHydratedWork.tone).toBe("danger");
    expect(failedOnCleanHydratedWork.hasConfirmedServerPersistence).toBe(true);
  });

  it("다른 사용자 또는 다른 작품 스코프의 저장 영수증을 현재 작품 저장 완료로 오인하지 않는다", () => {
    const status = deriveStudioPublishingPersistenceStatus(
      baseInput({
        authUserId: "dummy-user-2",
        workId: null,
        dirty: false,
        confirmedSaveReceipt: {
          authUserId: "dummy-user-1",
          savedWorkId: "dummy-work-1",
          sourceWorkId: null,
          revision: 1,
        },
      }),
    );

    expect(status.kind).toBe("empty");
    expect(status.hasConfirmedServerPersistence).toBe(false);
  });
});
