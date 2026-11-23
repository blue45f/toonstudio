// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { readStudioRecentOwnerWork, rememberStudioOwnerWork } from "./studio-recent-owner-work";

const local = vi.hoisted(() => ({ values: new Map<string, string>() }));
const access = vi.hoisted(() => ({ team: vi.fn(), receipt: vi.fn() }));
vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({
    kvSet: async (namespace: string, actorId: string, value: string) => local.values.set(namespace + actorId, value),
    kvGet: async (namespace: string, actorId: string) => local.values.get(namespace + actorId) ?? null,
  }),
}));
vi.mock("../studio-team-client", () => ({ getStudioTeam: access.team }));
vi.mock("./studio-offline-owner-receipt", () => ({ readOfflineOwnerReceipt: access.receipt }));
const signal = new AbortController().signal;
beforeEach(() => { local.values.clear(); vi.resetAllMocks(); });
afterEach(() => vi.restoreAllMocks());

it("마지막으로 연 원고 한 건만 해당 계정의 현재 소유권으로 확인한다", async () => {
  await rememberStudioOwnerWork("작가", "이전", signal);
  await rememberStudioOwnerWork("작가", "최근", signal);
  access.team.mockResolvedValue({ workId: "최근", viewer: { userId: "작가", status: "active", role: "owner" } });
  expect(await readStudioRecentOwnerWork("다른 작가", signal)).toBeNull();
  expect(access.team).not.toHaveBeenCalled();
  expect(await readStudioRecentOwnerWork("작가", signal)).toEqual({ workId: "최근", openedAt: expect.any(Number) });
  expect(access.team).toHaveBeenCalledExactlyOnceWith("최근", signal);
});

it.each([
  ["다른 원고", "작가", "owner", "active"], ["작품", "다른 작가", "owner", "active"],
  ["작품", "작가", "editor", "active"], ["작품", "작가", "owner", "removed"],
])("서버의 작품·계정·역할·상태가 바뀌면 재개 링크를 숨긴다", async (workId, userId, role, status) => {
  await rememberStudioOwnerWork("작가", "작품", signal);
  access.team.mockResolvedValue({ workId, viewer: { userId, role, status } });
  expect(await readStudioRecentOwnerWork("작가", signal)).toBeNull();
});

it("오프라인에서는 같은 계정의 유효한 캐시 영수증으로만 연다", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await rememberStudioOwnerWork("작가", "작품", signal);
  access.receipt.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: "다른 계정" }).mockResolvedValueOnce({ userId: "작가" });
  expect(await readStudioRecentOwnerWork("작가", signal)).toBeNull();
  expect(await readStudioRecentOwnerWork("작가", signal)).toBeNull();
  expect(await readStudioRecentOwnerWork("작가", signal)).toEqual({ workId: "작품", openedAt: expect.any(Number) });
  expect(access.team).not.toHaveBeenCalled();
});

it("전환 중 폐기된 요청은 현재 원고의 이력이나 링크를 교체하지 않는다", async () => {
  const pending = new AbortController();
  await rememberStudioOwnerWork("작가", "최근", signal);
  pending.abort();
  await rememberStudioOwnerWork("작가", "이전", pending.signal);
  access.team.mockImplementation(async () => {
    active.abort();
    return { workId: "최근", viewer: { userId: "작가", status: "active", role: "owner" } };
  });
  const active = new AbortController();
  expect(await readStudioRecentOwnerWork("작가", active.signal)).toBeNull();
  expect(access.team).toHaveBeenCalledWith("최근", active.signal);
});

it.each(["bad-json", JSON.stringify({ workId: "작품", openedAt: Number.MAX_SAFE_INTEGER })])("손상된 최근 시각은 새 작업을 막지 않는다", async raw => {
  await rememberStudioOwnerWork("작가", "작품", signal);
  for (const key of local.values.keys()) local.values.set(key, raw);
  expect(await readStudioRecentOwnerWork("작가", signal)).toBeNull();
  expect(access.team).not.toHaveBeenCalled();
});
