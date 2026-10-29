import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/platform/api";
import { getStudioScopedWritePolicy, manageStudioScopedWritePolicy } from "./studio-scoped-write-client";
import { scopedManagementUiFixture } from "../production-hub/studio-scoped-write-management.test-fixture";
import { listeners } from "@/domains/auth/public/session/auth-session-state";

const auth = vi.hoisted(() => ({ actorId: null as string | null, revision: 1 }));
vi.mock("@/domains/auth/public/session/auth-session-state", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/domains/auth/public/session/auth-session-state")>(),
  getAuthUserId: () => auth.actorId, getAuthSessionRevision: () => auth.revision,
}));
beforeEach(() => { auth.actorId = null; auth.revision += 1; for (const listener of listeners) listener(null); });

afterEach(() => vi.restoreAllMocks());
describe("독립 제한 편집 관리 HTTP 계약", () => {
  it.each(["read", "manage"] as const)("계정 확인 전 시작한 %s 응답도 다른 인증 세대에서 소비하지 않는다", async (kind) => {
    let complete: ((value: unknown) => void) | undefined;
    const result = new Promise<unknown>((resolve) => { complete = resolve; });
    vi.spyOn(api, "get").mockReturnValue(result); vi.spyOn(api, "post").mockReturnValue(result);
    const request = kind === "read" ? getStudioScopedWritePolicy("work") : manageStudioScopedWritePolicy("work", {
      mutationId: "10d86a7b-b1cc-48ea-943f-4c799a0c5af2", expectedPolicyVersion: 1,
      command: { type: "revoke-grant", grantId: "grant" },
    });
    auth.actorId = "other"; auth.revision += 1;
    if (!complete) throw new Error("대기 응답이 없습니다."); complete(scopedManagementUiFixture().policy);
    await expect(request).rejects.toMatchObject({ name: "AbortError" });
  });
  it("작품 ID를 인코딩하고 strict policy 응답만 소비한다", async () => {
    const f = scopedManagementUiFixture(), get = vi.spyOn(api, "get").mockResolvedValue({ ...f.policy, workId: "work/one@two" });
    expect((await getStudioScopedWritePolicy("work/one@two")).fullEdit).toBe(true);
    expect(get).toHaveBeenCalledWith("/creator/works/work%2Fone%40two/scoped-write", { signal: undefined });
    get.mockResolvedValue({ ...f.policy, workId: "other" });
    await expect(getStudioScopedWritePolicy("work")).rejects.toThrow("다른 작품");
  });
  it("같은 management mutation을 그대로 보내고 grant 없는 actor를 edit로 승격하지 않는다", async () => {
    const f = scopedManagementUiFixture(), request = { mutationId: "10d86a7b-b1cc-48ea-943f-4c799a0c5af2", expectedPolicyVersion: 1,
      command: { type: "revoke-grant" as const, grantId: "grant" } }, post = vi.spyOn(api, "post").mockResolvedValue({ ...f.policy, fullEdit: false, canManage: false });
    expect((await manageStudioScopedWritePolicy("work", request)).fullEdit).toBe(false);
    expect(post).toHaveBeenCalledWith("/creator/works/work/scoped-write", request);
  });

  it("같은 계정·세대·작품의 진행 중 GET만 합치며 한 consumer 취소는 다른 요청을 보존한다", async () => {
    auth.actorId = "owner";
    const f = scopedManagementUiFixture();
    let complete: ((value: unknown) => void) | undefined;
    const result = new Promise<unknown>((resolve) => { complete = resolve; });
    const get = vi.spyOn(api, "get").mockReturnValue(result), firstSignal = new AbortController(), secondSignal = new AbortController();
    const first = getStudioScopedWritePolicy("work", firstSignal.signal), second = getStudioScopedWritePolicy("work", secondSignal.signal);
    expect(get).toHaveBeenCalledTimes(1);
    const owned = get.mock.calls[0]?.[1]?.signal;
    firstSignal.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(owned?.aborted).toBe(false);
    if (!complete) throw new Error("대기 응답이 없습니다."); complete(f.policy);
    expect(await second).toEqual(f.policy);
    await getStudioScopedWritePolicy("work");
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("마지막 consumer 취소와 계정 전환은 소유 요청도 정리하고 늦은 rejection을 관찰한다", async () => {
    auth.actorId = "owner";
    let fail: ((error: unknown) => void) | undefined;
    const result = new Promise<unknown>((_resolve, reject) => { fail = reject; });
    const get = vi.spyOn(api, "get").mockReturnValueOnce(result).mockResolvedValue(scopedManagementUiFixture().policy);
    const first = getStudioScopedWritePolicy("work"), rejection = expect(first).rejects.toMatchObject({ name: "AbortError" });
    const owned = get.mock.calls[0]?.[1]?.signal;
    auth.actorId = "other"; auth.revision += 1; for (const listener of listeners) listener(null);
    await rejection;
    expect(owned?.aborted).toBe(true);
    if (!fail) throw new Error("대기 실패가 없습니다."); fail(new Error("취소된 HTTP 요청"));
    await getStudioScopedWritePolicy("work");
    expect(get).toHaveBeenCalledTimes(2);
  });
});
