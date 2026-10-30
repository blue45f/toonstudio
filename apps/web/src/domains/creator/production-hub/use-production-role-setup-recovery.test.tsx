// @vitest-environment jsdom
// 실제 hook·복구 저장소를 사용하고 HTTP만 mock한다. DB·브라우저 E2E 증거는 아니다.
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionProjectAggregate, projectScope } from "@toonstudio/core/production";
import { useI18n } from "@/shared/lib/i18n-core";
import type { ProductionClientCommand, ProductionMutationResponse, ProductionProjectRecord } from "./production-api";
import { loadProductionCommandRecovery, productionCommandRecoveryKey, PRODUCTION_COMMAND_RECOVERY_PREFIX,
  type PendingProductionCommand } from "./production-command-recovery";
import { useProductionProjectSession } from "./use-production-project-session";
import { ProductionCommandRevisionChangedError } from "./production-command-execution";

const mocks = vi.hoisted(() => ({
  load: vi.fn<(projectId: string) => Promise<ProductionProjectRecord>>(),
  save: vi.fn<(projectId: string, revision: number, command: unknown, mutationId: string) => Promise<ProductionMutationResponse>>(),
  revision: 1, actor: "owner", listeners: new Set<() => void>(),
}));
vi.mock("./production-api", () => ({
  getProductionProject: mocks.load, executeProductionCommand: mocks.save,
  recoverProductionCommand: (projectId: string, request: PendingProductionCommand) =>
    mocks.save(projectId, request.expectedRevision, request.command, request.mutationId),
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthSessionRevision: () => mocks.revision, getAuthSession: () => ({ user: { id: mocks.actor } }), listeners: mocks.listeners,
}));
vi.mock("@/platform/api", () => ({
  httpStatus: (error: unknown) => error !== null && typeof error === "object" && "status" in error
    && typeof error.status === "number" ? error.status : undefined,
  getApiErrorMessage: async (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback,
}));

type RoleCommand = Extract<ProductionClientCommand, { readonly type: "configure-collaboration" }>;
function record(projectId = "project-a", revision = 3, manage = true): ProductionProjectRecord {
  const aggregate = createProductionProjectAggregate({ projectId, workId: "work-" + projectId, title: "실제 계정 역할 배정",
    collaborationModel: "studio-production", ownerPartyId: "party-owner", ownerUserId: "owner",
    ownerDisplayName: "작품 소유자", at: "2026-10-29T00:00:00.000Z" });
  return { aggregate: { ...aggregate, revision }, access: { view: true, comment: true, edit: true, manage,
    owner: manage, role: manage ? "owner" : "editor" } };
}
function roleCommand(): RoleCommand {
  const aggregate = record().aggregate;
  return { type: "configure-collaboration", parties: [...aggregate.parties, { id: "party-worker", accountUserId: "worker",
    legalIdentityRef: null, publicDisplayName: "선화 담당", internalDisplayName: "선화 담당", contactPartyId: null,
    agencyPartyId: null, status: "active" }],
  assignments: [...aggregate.assignments, { id: "role-worker", projectId: aggregate.projectId, partyId: "party-worker",
    roleType: "line-artist", scope: projectScope(aggregate.projectId), startsAt: "2026-10-29T00:00:00.000Z", endsAt: null,
    capabilities: ["draw"], agreementRevisionRef: null, publicCreditRole: null, status: "active", lead: false }],
  authorityRules: [...aggregate.authorityRules] };
}
const demo = { create: () => record().aggregate, reduce: (current: ProductionProjectRecord["aggregate"]) => current };
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("아직 요청이 준비되지 않았습니다."); };
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function attemptedRequest(raw: string | undefined): PendingProductionCommand {
  if (!raw) throw new Error("원래 보관 시도의 본문이 없습니다.");
  const envelope: unknown = JSON.parse(raw), request = isRecord(envelope) ? envelope.request : null;
  if (!isRecord(request) || typeof request.mutationId !== "string" || typeof request.expectedRevision !== "number"
    || typeof request.queuedAt !== "number" || request.confirmedRevision !== null) throw new Error("복구 본문 fixture가 잘못됐습니다.");
  return { mutationId: request.mutationId, expectedRevision: request.expectedRevision, command: request.command,
    queuedAt: request.queuedAt, confirmedRevision: null };
}
beforeEach(() => {
  vi.clearAllMocks(); window.sessionStorage.clear(); useI18n.setState({ lang: "ko" });
  mocks.actor = "owner"; mocks.revision = 1;
  mocks.load.mockReset().mockResolvedValue(record());
  mocks.save.mockReset().mockResolvedValue({ aggregate: record("project-a", 4).aggregate });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); window.sessionStorage.clear(); vi.useRealTimers(); });

describe("참여 역할 setup의 실제 session hook 복구 계약", () => {
  it("edit가 있어도 manage=false이면 역할 배정을 보관하거나 전송하지 않는다", async () => {
    mocks.load.mockResolvedValue(record("project-a", 3, false));
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      await expect(result.current.executeStrict(roleCommand(), "역할 저장 완료", { expectedRevision: 3 })).rejects.toThrow("참여 계정과 공정 역할을 관리할 권한");
    });
    expect(mocks.save).not.toHaveBeenCalled(); expect(result.current.hasUnconfirmedCommand).toBe(false);
    expect(loadProductionCommandRecovery("owner", "project-a")).toBeNull();
  });

  it("revision N에서 만든 전체 역할 본문을 N+1로 올려 보내지 않고 보관·wire 전에 거절한다", async () => {
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const command = roleCommand(), expectedRevision = result.current.aggregate?.revision;
    expect(expectedRevision).toBe(3);
    mocks.load.mockResolvedValue(record("project-a", 4));
    await act(async () => result.current.refresh());
    expect(result.current.aggregate?.revision).toBe(4);
    if (expectedRevision === undefined) throw new Error("본문을 만든 revision이 없습니다.");
    await act(async () => {
      await expect(result.current.executeStrict(command, "오래된 전체 역할 저장", { expectedRevision }))
        .rejects.toBeInstanceOf(ProductionCommandRevisionChangedError);
    });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(result.current.hasUnconfirmedCommand).toBe(false);
    expect(loadProductionCommandRecovery("owner", "project-a")).toBeNull();
    expect(result.current.aggregate?.revision).toBe(4);
  });

  it.each(["storage", "readback"] as const)("%s 실패는 최초 wire0·held를 유지하고 복구 뒤 최초 UUID/body/revision만 전송한다", async (mode) => {
    const setItem = Storage.prototype.setItem, getItem = Storage.prototype.getItem, attempted: string[] = [];
    let blocked = true;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, raw: string) {
      if (key.startsWith(PRODUCTION_COMMAND_RECOVERY_PREFIX)) {
        attempted.push(raw);
        if (blocked && mode === "storage") throw new DOMException("quota", "QuotaExceededError");
      }
      setItem.call(this, key, raw);
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(function (this: Storage, key: string) {
      return blocked && mode === "readback" && key.startsWith(PRODUCTION_COMMAND_RECOVERY_PREFIX) ? null : getItem.call(this, key);
    });
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const command = roleCommand(), originalBody = structuredClone(command);
    await act(async () => {
      await expect(result.current.executeStrict(command, "역할 저장 완료", { expectedRevision: 3 })).rejects.toThrow("기기 복구 영역에서 확인하지 못해 전송하지 않았습니다");
    });
    expect(mocks.save).not.toHaveBeenCalled(); expect(result.current.hasUnconfirmedCommand).toBe(true);
    const original = attemptedRequest(attempted[0]);
    expect(original).toMatchObject({ expectedRevision: 3, command: originalBody, mutationId: expect.stringMatching(/^[a-f0-9-]{36}$/u) });
    await act(async () => result.current.refresh());
    expect(mocks.save).not.toHaveBeenCalled(); expect(result.current.hasUnconfirmedCommand).toBe(true);
    await act(async () => { await expect(result.current.executeStrict(roleCommand(), "새 역할 저장", { expectedRevision: 3 })).rejects.toThrow("저장 결과를 복구"); });
    blocked = false; mocks.load.mockResolvedValue(record("project-a", 9));
    await act(async () => result.current.refresh());
    expect(mocks.save).toHaveBeenCalledExactlyOnceWith("project-a", original.expectedRevision, original.command, original.mutationId);
    expect(result.current.aggregate?.revision).toBe(9); expect(result.current.hasUnconfirmedCommand).toBe(false);
    expect(window.sessionStorage.getItem(productionCommandRecoveryKey("owner", "project-a"))).toBeNull();
  });

  it("unknown ACK 뒤 reload는 초기 GET만 수행하고 명시 refresh가 같은 원문을 복구한다", async () => {
    mocks.save.mockRejectedValueOnce(new Error("역할 ACK 유실"));
    const first = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await act(async () => { await expect(first.result.current.executeStrict(roleCommand(), "역할 저장 완료", { expectedRevision: 3 })).rejects.toThrow("역할 ACK 유실"); });
    const sent = mocks.save.mock.calls[0];
    expect(first.result.current.hasUnconfirmedCommand).toBe(true);
    expect(loadProductionCommandRecovery("owner", "project-a")?.command).toEqual(sent?.[2]);
    first.unmount(); mocks.load.mockResolvedValue(record("project-a", 9));
    const restored = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(restored.result.current.loading).toBe(false));
    expect(mocks.load).toHaveBeenCalledTimes(2); expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(restored.result.current.hasUnconfirmedCommand).toBe(true);
    expect(restored.result.current.notice).toContain("이전 저장 요청을 복원");
    mocks.load.mockResolvedValue(record("project-a", 10));
    await act(async () => restored.result.current.refresh());
    expect(mocks.save.mock.calls[1]).toEqual(sent);
    expect(restored.result.current.aggregate?.revision).toBe(10);
    expect(restored.result.current.hasUnconfirmedCommand).toBe(false);
    expect(loadProductionCommandRecovery("owner", "project-a")).toBeNull();
  });

  it.each(["focus", "online", "visibility", "timer", "broadcast"] as const)("%s 자동 갱신은 역할 원문을 재전송하지 않고 최신 조회·보관을 유지한다", async (wake) => {
    const channels: { onmessage: ((event: MessageEvent<unknown>) => void) | null }[] = [];
    vi.stubGlobal("BroadcastChannel", class {
      onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
      constructor() { channels.push(this); }
      close() { /* 테스트 채널에는 외부 연결이 없다. */ }
      postMessage() { /* 서버 전송 대신 자동 수신 경계만 검사한다. */ }
    });
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const intervals = vi.spyOn(window, "setInterval");
    mocks.save.mockRejectedValueOnce(new Error("역할 ACK 유실"));
    const first = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(first.result.current.loading).toBe(false));
    await act(async () => { await expect(first.result.current.executeStrict(roleCommand(), "역할 저장 완료", { expectedRevision: 3 })).rejects.toThrow("역할 ACK 유실"); });
    const sent = mocks.save.mock.calls[0], original = loadProductionCommandRecovery("owner", "project-a");
    first.unmount(); mocks.load.mockResolvedValue(record("project-a", 9));
    const restored = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(restored.result.current.loading).toBe(false));
    mocks.load.mockResolvedValue(record("project-a", 10));
    await act(async () => {
      if (wake === "focus" || wake === "online") window.dispatchEvent(new Event(wake));
      else if (wake === "visibility") document.dispatchEvent(new Event("visibilitychange"));
      else if (wake === "broadcast") channels.at(-1)?.onmessage?.(new MessageEvent("message", { data: { projectId: "project-a" } }));
      else {
        const callback = intervals.mock.calls.filter((call) => call[1] === 30_000).at(-1)?.[0];
        if (typeof callback !== "function") throw new Error("자동 조회 타이머가 없습니다.");
        callback();
      }
    });
    await waitFor(() => expect(restored.result.current.aggregate?.revision).toBe(10));
    expect(mocks.load).toHaveBeenCalledTimes(3); expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(restored.result.current.hasUnconfirmedCommand).toBe(true);
    expect(loadProductionCommandRecovery("owner", "project-a")).toEqual(original);
    mocks.load.mockResolvedValue(record("project-a", 11));
    await act(async () => restored.result.current.refresh());
    expect(mocks.save.mock.calls[1]).toEqual(sent);
    expect(restored.result.current.aggregate?.revision).toBe(11);
    expect(restored.result.current.hasUnconfirmedCommand).toBe(false);
  });

  it("프로젝트 전환 중 늦은 역할 ACK는 새 프로젝트와 기존 pending을 변경하지 않는다", async () => {
    const receipt = deferred<ProductionMutationResponse>(); mocks.save.mockReturnValueOnce(receipt.promise);
    const { result, rerender } = renderHook(({ id }) => useProductionProjectSession(id, "owner", demo), { initialProps: { id: "project-a" } });
    await waitFor(() => expect(result.current.loading).toBe(false));
    let operation: Promise<unknown> = Promise.resolve();
    act(() => { operation = result.current.executeStrict(roleCommand(), "이전 프로젝트 역할 저장 완료", { expectedRevision: 3 }).catch((error: unknown) => error); });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const original = loadProductionCommandRecovery("owner", "project-a");
    mocks.load.mockResolvedValue(record("project-b", 20)); rerender({ id: "project-b" });
    await waitFor(() => expect(result.current.aggregate?.projectId).toBe("project-b"));
    await act(async () => { receipt.resolve({ aggregate: record("project-a", 4).aggregate }); await operation; });
    expect(await operation).toBeInstanceOf(Error);
    expect(result.current.aggregate?.projectId).toBe("project-b"); expect(result.current.aggregate?.revision).toBe(20);
    expect(result.current.notice).not.toBe("이전 프로젝트 역할 저장 완료");
    expect(result.current.hasUnconfirmedCommand).toBe(false);
    expect(loadProductionCommandRecovery("owner", "project-a")).toEqual(original);
    expect(mocks.save).toHaveBeenCalledTimes(1);
  });

  it("같은 UID의 인증 세대 전환 중 늦은 ACK도 새 GET·보관 원문을 덮지 않는다", async () => {
    const receipt = deferred<ProductionMutationResponse>(); mocks.save.mockReturnValueOnce(receipt.promise);
    const { result } = renderHook(() => useProductionProjectSession("project-a", "owner", demo));
    await waitFor(() => expect(result.current.loading).toBe(false));
    let operation: Promise<unknown> = Promise.resolve();
    act(() => { operation = result.current.executeStrict(roleCommand(), "이전 인증 역할 저장 완료", { expectedRevision: 3 }).catch((error: unknown) => error); });
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const original = loadProductionCommandRecovery("owner", "project-a");
    mocks.load.mockResolvedValue(record("project-a", 9));
    act(() => { mocks.revision += 1; mocks.listeners.forEach((notify) => notify()); });
    await waitFor(() => expect(result.current.aggregate?.revision).toBe(9));
    expect(mocks.save).toHaveBeenCalledTimes(1); expect(result.current.hasUnconfirmedCommand).toBe(true);
    await act(async () => { receipt.resolve({ aggregate: record("project-a", 4).aggregate }); await operation; });
    expect(await operation).toBeInstanceOf(Error); expect(result.current.aggregate?.revision).toBe(9);
    expect(result.current.notice).not.toBe("이전 인증 역할 저장 완료");
    expect(loadProductionCommandRecovery("owner", "project-a")).toEqual(original);
    expect(result.current.hasUnconfirmedCommand).toBe(true);
  });
});
