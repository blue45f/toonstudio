import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { synchronizeServerSessionState } from "@/domains/auth/public/session/auth-session-store";

import { loadStudioDocumentSource, verifyStudioDocumentSourceSession } from "./studio-document-source-session";

import type { ServerSessionSynchronization } from "@/domains/auth/public/session/auth-session-store";

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({ synchronizeServerSessionState: vi.fn() }));
const sourceApi = vi.hoisted(() => ({ getWork: vi.fn(), getShared: vi.fn() }));
vi.mock("@/platform/creator-client", () => ({ getWork: sourceApi.getWork }));
vi.mock("./studio-shared-document-client", () => ({ getStudioSharedDocument: sourceApi.getShared }));

const synchronize = vi.mocked(synchronizeServerSessionState);
const authenticated: ServerSessionSynchronization = {
  status: "authenticated",
  session: { user: { id: "source-owner", name: "Owner", email: null, image: null, role: "creator" }, token: null },
};
function input() {
  const controller = new AbortController();
  return { controller, options: { workId: "private-work", authScopeKey: null, signal: controller.signal, unavailableMessage: "원고를 다시 불러와 주세요." } };
}

beforeEach(() => { synchronize.mockReset(); sourceApi.getWork.mockReset(); sourceApi.getShared.mockReset(); });
afterEach(() => vi.useRealTimers());

describe("작품 source의 익명 조회 전 세션 확인", () => {
  it("기존 owner와 SSR 제공 identity는 private 경로를 그대로 사용한다", async () => {
    const f = input();
    await expect(verifyStudioDocumentSourceSession({ ...f.options, authScopeKey: "provided-owner" })).resolves.toBe("current");
    expect(synchronize).not.toHaveBeenCalled();
  });
  it("작품 ID가 없는 새 원고·리믹스의 기존 경로를 변경하지 않는다", async () => {
    const f = input();
    await expect(verifyStudioDocumentSourceSession({ ...f.options, workId: null })).resolves.toBe("current");
    expect(synchronize).not.toHaveBeenCalled();
  });
  it("공개 UI의 3초를 지나도 pending 인증을 guest로 확정하지 않는다", async () => {
    vi.useFakeTimers();
    let finish: ((result: ServerSessionSynchronization) => void) | undefined;
    synchronize.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const f = input(); const completed = vi.fn();
    const request = verifyStudioDocumentSourceSession(f.options).then(completed);
    await vi.advanceTimersByTimeAsync(4_000);
    expect(completed).not.toHaveBeenCalled();
    expect(synchronize).toHaveBeenCalledExactlyOnceWith("manual");
    expect(finish).toBeDefined();
    if (!finish) throw new Error("세션 완료 callback이 없습니다.");
    finish(authenticated); await request;
    expect(completed).toHaveBeenCalledExactlyOnceWith("identity-changed");
  });
  it("서버가 확인한 guest만 public source 조회를 계속한다", async () => {
    synchronize.mockResolvedValue({ status: "unauthenticated", session: null });
    await expect(verifyStudioDocumentSourceSession(input().options)).resolves.toBe("current");
    expect(synchronize).toHaveBeenCalledExactlyOnceWith("manual");
  });
  it("확인 불가 상태는 복구 오류로 끝내고 이후 명시 재시도는 다시 검증한다", async () => {
    const f = input();
    synchronize.mockResolvedValueOnce({ status: "indeterminate", session: null })
      .mockResolvedValueOnce({ status: "unauthenticated", session: null });
    await expect(verifyStudioDocumentSourceSession(f.options)).rejects.toThrow(f.options.unavailableMessage);
    await expect(verifyStudioDocumentSourceSession(f.options)).resolves.toBe("current");
    expect(synchronize).toHaveBeenCalledTimes(2);
  });
  it("이미 중단된 문서는 세션 검사나 source 조회를 시작하지 않는다", async () => {
    const f = input(); f.controller.abort();
    await expect(verifyStudioDocumentSourceSession(f.options)).rejects.toMatchObject({ name: "AbortError" });
    expect(synchronize).not.toHaveBeenCalled();
  });
  it("계정·문서 전환 중 도착한 인증 결과로 이전 source 조회를 재개하지 않는다", async () => {
    const f = input();
    synchronize.mockImplementation(async () => { f.controller.abort(); return authenticated; });
    await expect(verifyStudioDocumentSourceSession(f.options)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("source loader가 hydration으로 전달하는 identity 경계", () => {
  const work = { title: "기존 원고", description: "", tags: [], format: "cuttoon", doc: { pagesList: [{ id: "existing-page" }] }, author: { name: "원작자" } };
  const options = () => ({ ...input().options, targetId: "private-work", remixId: null, isCurrent: () => true });

  it("새 인증 identity의 옛 closure는 null만 반환하며 다음 owner 세대가 private 원고를 읽는다", async () => {
    synchronize.mockResolvedValue(authenticated);
    const f = options(); const shared = { document: work, revision: 7 };
    sourceApi.getShared.mockResolvedValue(shared);
    await expect(loadStudioDocumentSource(f)).resolves.toBeNull();
    expect(sourceApi.getWork).not.toHaveBeenCalled(); expect(sourceApi.getShared).not.toHaveBeenCalled();
    await expect(loadStudioDocumentSource({ ...f, authScopeKey: "source-owner" })).resolves.toEqual({
      work, shared, detail: null, remixAuthorName: "",
    });
    expect(synchronize).toHaveBeenCalledTimes(1);
    expect(sourceApi.getShared).toHaveBeenCalledExactlyOnceWith(f.workId, f.signal);
    expect(sourceApi.getWork).not.toHaveBeenCalled();
  });
  it("확인된 guest의 공개 원고는 기존 author와 상세 정보를 유지한다", async () => {
    synchronize.mockResolvedValue({ status: "unauthenticated", session: null });
    sourceApi.getWork.mockResolvedValue(work); const f = options();
    await expect(loadStudioDocumentSource(f)).resolves.toEqual({ work, detail: work, shared: null, remixAuthorName: "원작자" });
    expect(sourceApi.getWork).toHaveBeenCalledExactlyOnceWith(f.targetId, f.signal);
    expect(sourceApi.getShared).not.toHaveBeenCalled();
  });
  it("확인 불가나 변경된 scope가 빈 원고 hydration으로 진행하지 않는다", async () => {
    synchronize.mockResolvedValue({ status: "indeterminate", session: null });
    await expect(loadStudioDocumentSource(options())).rejects.toThrow("원고를 다시 불러와 주세요.");
    await expect(loadStudioDocumentSource({ ...options(), authScopeKey: "owner", isCurrent: () => false })).resolves.toBeNull();
    expect(sourceApi.getWork).not.toHaveBeenCalled(); expect(sourceApi.getShared).not.toHaveBeenCalled();
  });
});
