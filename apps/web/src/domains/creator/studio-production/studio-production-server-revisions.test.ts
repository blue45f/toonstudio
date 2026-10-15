import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  loadStudioServerRevisions,
  restoreStudioServerRevision,
  serverRevisionWorkId,
  STUDIO_SERVER_REVISION_RETENTION,
  studioServerRevisionRetentionReached,
  type StudioServerRevisionSummary,
} from "./studio-production-server-revisions";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  getApiErrorMessage: vi.fn(async (_error: unknown, fallback: string) => fallback),
}));

vi.mock("@/platform/api", () => ({
  api: { get: mocks.get, post: mocks.post },
  getApiErrorMessage: mocks.getApiErrorMessage,
}));

describe("studio production server revisions", () => {
  beforeEach(() => {
    mocks.get.mockReset();
    mocks.post.mockReset();
    mocks.getApiErrorMessage.mockClear();
  });

  it("enables authoritative revisions only for concrete work scope", () => {
    expect(serverRevisionWorkId("work:abc-123")).toBe("abc-123");
    expect(serverRevisionWorkId("draft")).toBeNull();
    expect(serverRevisionWorkId("remix:abc-123")).toBeNull();
    expect(serverRevisionWorkId("work: ")).toBeNull();
  });

  it("loads owner head and revision history without confusing local checkpoints", async () => {
    mocks.get
      .mockResolvedValueOnce({ revision: 12, isOwner: true })
      .mockResolvedValueOnce([
        { revision: 12, restoredFromRevision: null, createdAt: "2026-09-06T00:00:00.000Z" },
        { revision: 11, restoredFromRevision: 8, createdAt: "2026-09-05T23:00:00.000Z" },
      ]);
    await expect(loadStudioServerRevisions("work:work/with space")).resolves.toEqual({
      workId: "work/with space",
      currentRevision: 12,
      revisions: [
        { revision: 12, restoredFromRevision: null, createdAt: "2026-09-06T00:00:00.000Z" },
        { revision: 11, restoredFromRevision: 8, createdAt: "2026-09-05T23:00:00.000Z" },
      ],
    });
    expect(mocks.get).toHaveBeenNthCalledWith(1, "/creator/works/work%2Fwith%20space");
    expect(mocks.get).toHaveBeenNthCalledWith(2, "/creator/works/work%2Fwith%20space/revisions", { params: { limit: 20 } });
  });

  it("pins the surfaced retention policy to the server retention of 20 revisions", () => {
    // 서버 정본: API 앱 server 폴더의 creator-work-revisions.ts 의 CREATOR_WORK_REVISION_RETENTION.
    // 웹의 비통합 시험은 다른 앱의 src 경로를 적지 않는다(앱 경계 래칫이 교차 참조로 센다).
    expect(STUDIO_SERVER_REVISION_RETENTION).toBe(20);
    const row = (revision: number): StudioServerRevisionSummary => ({
      revision,
      restoredFromRevision: null,
      createdAt: "2026-09-06T00:00:00.000Z",
    });
    const atCap = Array.from({ length: STUDIO_SERVER_REVISION_RETENTION }, (_, index) => row(index + 1));
    expect(studioServerRevisionRetentionReached(atCap)).toBe(true);
    expect(studioServerRevisionRetentionReached(atCap.slice(1))).toBe(false);
    expect(studioServerRevisionRetentionReached([])).toBe(false);
  });

  it("uses the observed current revision as the optimistic restore base", async () => {
    mocks.post.mockResolvedValueOnce({ revision: 13 });
    const next = await restoreStudioServerRevision({
      workId: "work-a",
      currentRevision: 12,
      revisions: [],
    }, 7);
    expect(next).toBe(13);
    expect(mocks.post).toHaveBeenCalledWith(
      "/creator/works/work-a/revisions/7/restore",
      { baseRevision: 12 },
    );
  });

  it("rejects malformed server data instead of presenting a false revision state", async () => {
    mocks.get.mockResolvedValueOnce({ revision: 4, isOwner: true }).mockResolvedValueOnce([
      { revision: 0, restoredFromRevision: null, createdAt: "invalid" },
    ]);
    await expect(loadStudioServerRevisions("work:x")).rejects.toThrow("서버 원고 버전을 불러오지 못했습니다.");
  });
});
