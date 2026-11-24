// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { readStudioRecentWork, rememberStudioEditableWork } from "./studio-recent-owner-work";

const local = vi.hoisted(() => ({ values: new Map<string, string>() }));
const access = vi.hoisted(() => ({ team: vi.fn(), receipt: vi.fn(), forget: vi.fn() }));
vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => ({
    kvSet: async (namespace: string, actorId: string, value: string) => local.values.set(namespace + actorId, value),
    kvGet: async (namespace: string, actorId: string) => local.values.get(namespace + actorId) ?? null,
  }),
}));
vi.mock("../studio-team-client", () => ({ getStudioTeam: access.team }));
vi.mock("./studio-offline-owner-receipt", () => ({ readOfflineOwnerReceipt: access.receipt, forgetOfflineOwnerReceipt: access.forget }));
const signal = new AbortController().signal;
beforeEach(() => { local.values.clear(); vi.resetAllMocks(); });
afterEach(() => vi.restoreAllMocks());

it("마지막으로 연 원고 한 건만 해당 계정의 현재 소유권으로 확인한다", async () => {
  await rememberStudioEditableWork("작가", "이전", true, signal);
  await rememberStudioEditableWork("작가", "최근", true, signal);
  access.team.mockResolvedValue({ workId: "최근", viewer: { userId: "작가", status: "active", role: "owner", capabilities: { edit: true } } });
  expect(await readStudioRecentWork("다른 작가", signal)).toBeNull();
  expect(access.team).not.toHaveBeenCalled();
  expect(await readStudioRecentWork("작가", signal)).toEqual({ workId: "최근", openedAt: expect.any(Number) });
  expect(access.team).toHaveBeenCalledExactlyOnceWith("최근", signal);
});

it.each([
  ["다른 원고", "작가", "owner", "active"], ["작품", "다른 작가", "owner", "active"],
  ["작품", "작가", "viewer", "active"], ["작품", "작가", "owner", "removed"],
])("서버의 작품·계정·역할·상태가 바뀌면 재개 링크를 숨긴다", async (workId, userId, role, status) => {
  await rememberStudioEditableWork("작가", "작품", true, signal);
  access.team.mockResolvedValue({ workId, viewer: { userId, role, status, capabilities: { edit: true } } });
  expect(await readStudioRecentWork("작가", signal)).toBeNull();
});

it("오프라인에서는 같은 계정의 유효한 캐시 영수증으로만 연다", async () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  await rememberStudioEditableWork("작가", "작품", true, signal);
  access.receipt.mockResolvedValueOnce(null).mockResolvedValueOnce({ userId: "다른 계정" }).mockResolvedValueOnce({ userId: "작가" });
  expect(await readStudioRecentWork("작가", signal)).toBeNull();
  expect(await readStudioRecentWork("작가", signal)).toBeNull();
  expect(await readStudioRecentWork("작가", signal)).toEqual({ workId: "작품", openedAt: expect.any(Number) });
  expect(access.team).not.toHaveBeenCalled();
});

it("전환 중 폐기된 요청은 현재 원고의 이력이나 링크를 교체하지 않는다", async () => {
  const pending = new AbortController();
  await rememberStudioEditableWork("작가", "최근", true, signal);
  pending.abort();
  await rememberStudioEditableWork("작가", "이전", true, pending.signal);
  access.team.mockImplementation(async () => {
    active.abort();
    return { workId: "최근", viewer: { userId: "작가", status: "active", role: "owner", capabilities: { edit: true } } };
  });
  const active = new AbortController();
  expect(await readStudioRecentWork("작가", active.signal)).toBeNull();
  expect(access.team).toHaveBeenCalledWith("최근", active.signal);
});

it.each(["bad-json", JSON.stringify({ workId: "작품", openedAt: Number.MAX_SAFE_INTEGER })])("손상된 최근 시각은 새 작업을 막지 않는다", async raw => {
  await rememberStudioEditableWork("작가", "작품", true, signal);
  for (const key of local.values.keys()) local.values.set(key, raw);
  expect(await readStudioRecentWork("작가", signal)).toBeNull();
  expect(access.team).not.toHaveBeenCalled();
});

it("온라인에서는 최신 팀 편집 원고를 열고 오프라인은 예전 단일 키의 소유 원고와 영수증을 사용한다", async () => {
  local.values.set("studio-recent-owner-work-v1작가", JSON.stringify({ workId: "소유", openedAt: 7 }));
  await rememberStudioEditableWork("작가", "팀", false, signal);
  access.team.mockResolvedValue({ workId: "팀", viewer: { userId: "작가", status: "active", role: "editor", capabilities: { edit: true } } });
  expect(await readStudioRecentWork("작가", signal)).toEqual({ workId: "팀", openedAt: expect.any(Number) });
  access.team.mockResolvedValue({ workId: "팀", viewer: { userId: "작가", status: "active", role: "editor", capabilities: { edit: false } } });
  expect(await readStudioRecentWork("작가", signal)).toBeNull();
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  access.receipt.mockResolvedValue({ userId: "작가" });
  expect(await readStudioRecentWork("작가", signal)).toEqual({ workId: "소유", openedAt: 7 });
  expect(access.receipt).toHaveBeenCalledExactlyOnceWith("소유", signal);
  await rememberStudioEditableWork("다른 작가", "팀", false, signal);
  expect(await readStudioRecentWork("다른 작가", signal)).toBeNull();
});

it("서버에서 소유권 상실을 확인하면 기존 오프라인 영수증을 폐기한다", async () => {
  await rememberStudioEditableWork("작가", "작품", true, signal);
  access.team.mockResolvedValue({ workId: "작품", viewer: { userId: "작가", role: "viewer", status: "active", capabilities: { edit: false } } });
  expect(await readStudioRecentWork("작가", signal)).toBeNull();
  expect(access.forget).toHaveBeenCalledExactlyOnceWith("작품");
});

it.each([[403, true], [404, true], [503, false]])("최근 소유 원고 조회 HTTP %d의 영수증 폐기 여부는 %s", async (status, revoked) => {
  await rememberStudioEditableWork("작가", "작품", true, signal);
  const error = Object.assign(new Error("팀 조회 실패"), { status });
  access.team.mockRejectedValue(error);
  await expect(readStudioRecentWork("작가", signal)).rejects.toBe(error);
  expect(access.forget).toHaveBeenCalledTimes(revoked ? 1 : 0);
});
