// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runStudioScopedPageSavePipeline, runStudioScopedSaveOrPending } from "./studio-scoped-page-save-pipeline";
import { reviewEditorFixture } from "../review-handoff/studio-review-editor-test-fixture";
import { CANVAS_W } from "../studio-assets";
import { LEGACY_STUDIO_AUTOSAVE_KEY, studioAutosaveKey, studioLifecycleAutosaveSidecarKey } from "../studio-autosave";
import type { StudioPageSavePipelineDeps } from "../studio-page-save-pipeline";
import type { StudioScopedSavePending, StudioScopedSavePendingScope } from "./studio-scoped-save-pending";
import type { StudioSharedDocument } from "../studio-shared-document-client";
import type { StudioScopedWritePolicy } from "@toonstudio/contracts/studio-scoped-write";
import { createStudioScopedWriteFixture } from "./studio-scoped-write.test-fixture";
import { bindStudioScopedWriteAuthority, type StudioScopedWriteAuthority } from "./studio-scoped-write-authority";
import { admitStudioScopedDrawStart, admitStudioScopedPagesCommit } from "./studio-scoped-write-mutation";
import type { DrawEl } from "../studio-element-model";
import type { PageState } from "../studio-page-state";

const mocks = vi.hoisted(() => ({ read: vi.fn(), patch: vi.fn(), load: vi.fn(), acknowledge: vi.fn(),
  pendingLoad: vi.fn(), pendingRemember: vi.fn(), pendingClear: vi.fn(), pending: new Map<string, StudioScopedSavePending>() }));
vi.mock("../studio-shared-document-client", () => ({ getStudioSharedDocument: mocks.read, updateStudioScopedSharedDocument: mocks.patch }));
vi.mock("../studio-durable-save-intent", () => ({ boundStudioSaveIntentOperation: async (promise: Promise<unknown>) => promise,
  studioDurableSaveIntentRepository: { load: mocks.load }, acknowledgeStudioDurableSaveIntent: mocks.acknowledge }));
vi.mock("./studio-scoped-save-pending", async (importOriginal) => ({ ...await importOriginal<typeof import("./studio-scoped-save-pending")>(),
  studioScopedSavePendingRepository: { load: mocks.pendingLoad, remember: mocks.pendingRemember, clear: mocks.pendingClear } }));
const sidecarKey = studioLifecycleAutosaveSidecarKey("scoped-save-test");
const unrelatedKeys = [
  ...[{ userId: "other-actor", workId: "work" }, { userId: "actor", workId: "other-work" }]
    .flatMap((scope) => { const primary = studioAutosaveKey(scope); return [primary, studioLifecycleAutosaveSidecarKey(primary)]; }),
  LEGACY_STUDIO_AUTOSAVE_KEY,
];
function expectDraftPreserved() {
  expect(localStorage.getItem("scoped-save-test")).toBe("local-draft");
  expect(localStorage.getItem(sidecarKey)).toBe("local-sidecar");
}
const context = { version: 1 as const, policyVersion: 1, grantIds: ["grant"], creations: [], restorations: [] };
const key = (scope: StudioScopedSavePendingScope) => JSON.stringify([scope.actorUserId, scope.workId]);
const policy = (requiresScopedSaveReconciliation: boolean): StudioScopedWritePolicy => ({ version: 1, workId: "work", policyVersion: 1,
  canManage: false, fullEdit: true, scopedWrite: false, targets: [], grants: [], ownedEntities: [], requiresScopedSaveReconciliation });
function fixture(actualAuthority?: StudioScopedWriteAuthority) {
  const source = reviewEditorFixture(() => "a".repeat(64)), timeline: string[] = [];
  const ticket = { authScopeKey: "actor", workId: "work", accessGeneration: 1, documentGeneration: 1 };
  let currentPolicy: StudioScopedWritePolicy | null = null;
  const authority = { get snapshot() { return currentPolicy; }, get hasCurrentIdentity() { return ticket.authScopeKey === "actor" && ticket.workId === "work"; },
    refresh: vi.fn(async (): Promise<StudioScopedWritePolicy | null> => { timeline.push("refresh"); return currentPolicy; }), purposeContext: vi.fn(() => context),
    holdMutations: vi.fn(() => { timeline.push("hold"); return () => { timeline.push("release"); }; }) };
  const barrier = vi.fn(async () => { timeline.push("barrier"); return { serverSequence: "7" }; });
  const saved: StudioSharedDocument = { ...source.saved, role: "viewer", access: "view", capabilities: { view: true, edit: false },
    document: { ...source.saved.document, doc: { ...source.saved.document.doc, width: CANVAS_W } } };
  mocks.read.mockResolvedValue(saved); mocks.patch.mockImplementation(async () => { timeline.push("patch"); return { workId: "work", revision: 8, updatedAt: "2026-10-29T06:00:00.000Z" }; });
  const pendingStrokeCommitsRef: { current: object | null } = { current: null };
  const deps = { scopedWrite: { authority: actualAuthority ?? authority, getSnapshot: () => source.snapshot, isDrawing: () => false }, workId: "work", studioAuthUserId: "actor", sharedDocument: saved,
    autosaveKey: "scoped-save-test", editorMountedRef: { current: true }, currentStudioDocumentScopeRef: { current: { authScopeKey: "actor", workId: "work" } },
    captureStudioMutationTicket: () => ({ ...ticket }), pendingStrokeCommitsRef, flushPendingStrokeCommitsRef: { current: vi.fn(() => true) },
    sharedDocumentSaveAbortRef: { current: null as AbortController | null }, documentSaveInFlightRef: { current: false }, studioCrdtAuthoritativeSaveBarrierRef: { current: barrier }, studioCrdtDocumentRef: { current: null },
    setSaving: vi.fn(), setError: vi.fn(), setSharedDocumentNotice: vi.fn(), setSharedDocumentScope: vi.fn(), ownerDetailAbortRef: { current: null }, setFxPanelOpen: vi.fn(), setLoadedWork: vi.fn(),
    clearAutosaveDurableAuthority: vi.fn(), studioLifecycleDurableGenerationRef: { current: 0 }, studioRevisionProjectGenerationRef: { current: 9 }, studioLifecycleDurablePendingFingerprintRef: { current: "pending" } };
  const pipelineDeps = deps as unknown as StudioPageSavePipelineDeps;
  return { deps, authority, barrier, ticket, timeline, setPolicy: (value: StudioScopedWritePolicy | null) => { currentPolicy = value; },
    run: (status: "draft" | "published" = "draft") => runStudioScopedPageSavePipeline(status, pipelineDeps),
    route: () => runStudioScopedSaveOrPending("draft", pipelineDeps) };
}
describe("제한 저장의 실제 ACK와 초안 보존", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", webcrypto); mocks.read.mockReset(); mocks.patch.mockReset(); mocks.load.mockReset().mockResolvedValue(null);
    mocks.acknowledge.mockReset().mockResolvedValue(undefined); mocks.pending.clear();
    mocks.pendingLoad.mockReset().mockImplementation(async (scope: StudioScopedSavePendingScope) => structuredClone(mocks.pending.get(key(scope)) ?? null));
    mocks.pendingRemember.mockReset().mockImplementation(async (scope: StudioScopedSavePendingScope, entry: StudioScopedSavePending) => {
      if (!mocks.pending.has(key(scope))) mocks.pending.set(key(scope), structuredClone(entry));
      return structuredClone(mocks.pending.get(key(scope)));
    });
    mocks.pendingClear.mockReset().mockImplementation(async (scope: StudioScopedSavePendingScope, id: string) => {
      if (mocks.pending.get(key(scope))?.body.mutationId !== id) return false;
      mocks.pending.delete(key(scope)); return true;
    });
    localStorage.setItem("scoped-save-test", "local-draft");
    localStorage.setItem(sidecarKey, "local-sidecar");
    for (const item of unrelatedKeys) localStorage.setItem(item, "unrelated:" + item);
  });
  afterEach(() => {
    try { for (const item of unrelatedKeys) expect(localStorage.getItem(item)).toBe("unrelated:" + item); }
    finally { localStorage.clear(); vi.unstubAllGlobals(); }
  });
  it("새 입력을 hold하고 서버 ACK 뒤에만 doc-only PATCH·기기 저장 ACK·정리를 수행한다", async () => {
    const f = fixture(); await f.run();
    expect(f.timeline).toEqual(["refresh", "hold", "barrier", "refresh", "patch", "release"]);
    const body = mocks.patch.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["baseRevision", "crdtServerSequence", "doc", "mutationId", "writeContext"].sort());
    expect(body.writeContext).toEqual(context); expect(mocks.acknowledge).toHaveBeenCalledTimes(1);
    const rememberedAt = mocks.pendingRemember.mock.invocationCallOrder[0], sentAt = mocks.patch.mock.invocationCallOrder[0];
    if (rememberedAt === undefined || sentAt === undefined) throw new Error("원문 보존과 wire 호출이 필요합니다.");
    expect(rememberedAt).toBeLessThan(sentAt);
    expect(mocks.pending.size).toBe(0);
    expect(f.deps.clearAutosaveDurableAuthority).toHaveBeenCalledTimes(1); expect(localStorage.getItem("scoped-save-test")).toBeNull();
    expect(localStorage.getItem(sidecarKey)).toBeNull();
    expect(f.deps.documentSaveInFlightRef.current).toBe(false);
  });
  it.each([false, true])("실제 권위는 마지막 획을 refresh 전에 확정하고 ACK 뒤 배정을 다시 검사한다 (회수=%s)", async (revokeAfterAck) => {
    const real = createStudioScopedWriteFixture(), f = fixture(real.authority), events: string[] = [], reportError = vi.fn();
    f.deps.studioAuthUserId = real.authority.authScopeKey; f.deps.workId = real.authority.workId;
    f.ticket.authScopeKey = real.authority.authScopeKey; f.ticket.workId = real.authority.workId;
    f.deps.currentStudioDocumentScopeRef.current = { authScopeKey: real.authority.authScopeKey, workId: real.authority.workId };
    const owner = { current: { locked: true } }, unbind = bindStudioScopedWriteAuthority(owner, real.authority);
    real.choose();
    const previous: PageState = { id: "page-1", elements: [], bg: "#fff", bgGrad: null, canvasH: 768 };
    const stroke: DrawEl = admitStudioScopedDrawStart(owner, previous.id, previous.elements,
      { id: "last-pointer-stroke", type: "draw", points: [10, 10, 20, 20], stroke: "#000", strokeWidth: 3 });
    const next: PageState = { ...previous, elements: [stroke] };
    real.authority.captureWriteContext();
    let committed = false, refreshes = 0;
    f.deps.pendingStrokeCommitsRef.current = {};
    f.deps.flushPendingStrokeCommitsRef.current.mockImplementation(() => {
      events.push("flush");
      committed = admitStudioScopedPagesCommit({ owner, previous: [previous], next: [next], reportError, lockMessage: () => "잠금" });
      if (committed) f.deps.pendingStrokeCommitsRef.current = null;
      return committed;
    });
    real.authority.bindPolicyRefresh(async () => {
      events.push("refresh"); refreshes++;
      const value = revokeAfterAck && refreshes === 2 ? { ...real.policy, policyVersion: 2,
        grants: real.policy.grants.map((grant) => ({ ...grant, revokedAt: "2026-10-29T01:00:00.000Z" })) } : real.policy;
      real.authority.setPolicy(value); return value;
    });
    f.barrier.mockImplementation(async () => {
      events.push("barrier");
      if (!revokeAfterAck) throw new Error("회귀 검증의 승인 경계 중단");
      return { serverSequence: "7" };
    });
    try {
      await f.run();
      expect(committed, reportError.mock.calls.flat().join(" ")).toBe(true);
      expect(reportError).not.toHaveBeenCalled();
      expect(events).toEqual(revokeAfterAck ? ["flush", "refresh", "barrier", "refresh"] : ["flush", "refresh", "barrier"]);
      expect(f.barrier).toHaveBeenCalledOnce();
      expect(f.deps.setError).toHaveBeenLastCalledWith(revokeAfterAck ? "현재 유효한 담당 원고 범위를 선택하세요." : "회귀 검증의 승인 경계 중단");
      expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.patch).not.toHaveBeenCalled();
      expect(mocks.acknowledge).not.toHaveBeenCalled(); expectDraftPreserved();
      expect(f.deps.documentSaveInFlightRef.current).toBe(false);
    } finally { unbind(); real.authority.dispose(); }
  });
  it("durable intent ACK 실패는 서버 저장 뒤에도 primary와 sidecar를 지우지 않는다", async () => {
    const f = fixture(); mocks.acknowledge.mockRejectedValueOnce(new Error("기기 ACK 실패"));
    await f.run();
    expect(mocks.patch).toHaveBeenCalledOnce(); expect(f.deps.clearAutosaveDurableAuthority).not.toHaveBeenCalled();
    expectDraftPreserved();
    expect(f.deps.studioLifecycleDurableGenerationRef.current).toBe(0);
    expect(f.deps.studioLifecycleDurablePendingFingerprintRef.current).toBe("pending");
  });
  it.each(["account", "document", "project"] as const)("durable ACK 중 %s 세대 변경은 이전 primary와 sidecar를 정리하지 않는다", async (change) => {
    const f = fixture();
    mocks.acknowledge.mockImplementationOnce(async () => {
      if (change === "account") { f.ticket.authScopeKey = "other"; f.deps.currentStudioDocumentScopeRef.current.authScopeKey = "other"; }
      else if (change === "document") f.ticket.documentGeneration += 1;
      else f.deps.studioRevisionProjectGenerationRef.current += 1;
    });
    await f.run();
    expect(mocks.patch).toHaveBeenCalledOnce(); expect(f.deps.clearAutosaveDurableAuthority).not.toHaveBeenCalled();
    expectDraftPreserved();
    expect(f.deps.studioLifecycleDurableGenerationRef.current).toBe(0);
    expect(f.deps.studioLifecycleDurablePendingFingerprintRef.current).toBe("pending");
  });
  it("서버 승인 장벽 실패는 REST를 시작하지 않고 기기 초안을 보존한다", async () => {
    const f = fixture(); f.barrier.mockRejectedValueOnce(new Error("승인되지 않음")); await f.run();
    expect(mocks.patch).not.toHaveBeenCalled(); expect(mocks.acknowledge).not.toHaveBeenCalled();
    expect(f.deps.clearAutosaveDurableAuthority).not.toHaveBeenCalled(); expectDraftPreserved(); expect(f.timeline.at(-1)).toBe("release");
  });
  it("요청 중 문서 세대가 바뀌면 이전 후보를 전송하지 않는다", async () => {
    const f = fixture(); mocks.read.mockImplementationOnce(async () => { f.ticket.documentGeneration++; return f.deps.sharedDocument; }); await f.run();
    expect(mocks.patch).not.toHaveBeenCalled(); expect(mocks.acknowledge).not.toHaveBeenCalled(); expect(f.deps.clearAutosaveDurableAuthority).not.toHaveBeenCalled();
  });
  it("현재 권한 거절과 응답 불명확 실패는 성공으로 처리하지 않는다", async () => {
    const f = fixture(); mocks.patch.mockRejectedValueOnce(new Error("현재 배정이 회수됐습니다.")); await f.run();
    expect(mocks.acknowledge).not.toHaveBeenCalled(); expect(f.deps.clearAutosaveDurableAuthority).not.toHaveBeenCalled(); expectDraftPreserved();
    expect(mocks.pending.size).toBe(1); expect(mocks.pendingClear).not.toHaveBeenCalled();
  });
  it("요소 저장이 성공해도 제외된 공용·페이지 초안은 전체 ACK·정리로 지우지 않는다", async () => {
    const f = fixture(), snapshot = f.deps.scopedWrite.getSnapshot();
    f.deps.scopedWrite.getSnapshot = () => ({ ...snapshot, title: "강등 전 작품 설정 초안", master: { elements: [] },
      pagesList: snapshot.pagesList.map((page, index) => index === 0 ? { ...page, canvasH: 1600 } : page) });
    await f.run(); expect(mocks.patch).toHaveBeenCalledTimes(1); expect(mocks.acknowledge).not.toHaveBeenCalled();
    expect(f.deps.clearAutosaveDurableAuthority).not.toHaveBeenCalled(); expectDraftPreserved();
    expect(f.deps.setSharedDocumentNotice).toHaveBeenCalledWith(expect.stringContaining("이 기기에 보존"));
  });
  it("실제 저장 폭 800과 runtime 폭 720이 다르면 요소 ACK 뒤에도 전체 초안을 보존한다", async () => {
    const f = fixture(), saved = f.deps.sharedDocument;
    expect(CANVAS_W).toBe(720);
    const mismatched = { ...saved, document: { ...saved.document, doc: { ...saved.document.doc, width: 800 } } };
    mocks.read.mockResolvedValue(mismatched);
    await f.run();
    expect(mocks.patch).toHaveBeenCalledTimes(1);
    const body = mocks.patch.mock.calls[0]?.[1];
    expect(body?.doc.width).toBe(800);
    expect(mocks.pendingRemember.mock.calls[0]?.[1]?.hasExcludedDraft).toBe(true);
    expect(mocks.acknowledge).not.toHaveBeenCalled();
    expect(f.deps.clearAutosaveDurableAuthority).not.toHaveBeenCalled();
    expectDraftPreserved();
    expect(f.deps.setSharedDocumentNotice).toHaveBeenCalledWith(expect.stringContaining("이 기기에 보존"));
  });
  it("게시 상태 변경은 제한 본문 저장으로 우회하지 않는다", async () => {
    const f = fixture(); await f.run("published"); expect(f.barrier).not.toHaveBeenCalled(); expect(mocks.patch).not.toHaveBeenCalled(); expect(f.deps.setError).toHaveBeenCalled();
  });

  it("서버 성공 ACK 유실 뒤 재진입은 새 revision·정책·UUID를 만들지 않고 최초 원문을 확인한다", async () => {
    const first = fixture(); mocks.patch.mockRejectedValueOnce(new Error("저장 응답 유실")); await first.run();
    const original = structuredClone(mocks.patch.mock.calls[0]?.[1]);
    const reentered = fixture(); mocks.read.mockResolvedValue({ ...reentered.deps.sharedDocument, revision: 99 });
    reentered.authority.purposeContext.mockImplementation(() => { throw new Error("다른 정책을 선택했음"); });
    await reentered.run();
    expect(mocks.patch.mock.calls[1]?.[1]).toEqual(original); expect(mocks.read).toHaveBeenCalledTimes(1);
    expect(reentered.barrier).not.toHaveBeenCalled(); expect(reentered.authority.refresh).not.toHaveBeenCalled();
    expect(reentered.authority.purposeContext).not.toHaveBeenCalled(); expect(mocks.pending.size).toBe(0);
    expect(reentered.deps.clearAutosaveDurableAuthority).toHaveBeenCalledOnce();
  });
  it("계정·작품 전환 abort는 원문을 남기고 원래 scope 재진입 때만 확인한다", async () => {
    const first = fixture(); mocks.patch.mockImplementationOnce(async () => {
      first.deps.currentStudioDocumentScopeRef.current = { authScopeKey: "other", workId: "another-work" };
      first.ticket.authScopeKey = "other"; first.ticket.workId = "another-work";
      first.deps.sharedDocumentSaveAbortRef.current?.abort(); throw new DOMException("취소", "AbortError");
    });
    await first.run(); const original = structuredClone(mocks.patch.mock.calls[0]?.[1]);
    expect(mocks.pending.size).toBe(1); expect(mocks.pendingClear).not.toHaveBeenCalled();
    const other = fixture(); other.deps.studioAuthUserId = "other"; other.deps.workId = "another-work";
    other.ticket.authScopeKey = "other"; other.ticket.workId = "another-work";
    other.deps.currentStudioDocumentScopeRef.current = { authScopeKey: "other", workId: "another-work" };
    other.authority.purposeContext.mockImplementation(() => { throw new Error("현재 새 저장 배정 없음"); });
    await other.run(); expect(mocks.patch).toHaveBeenCalledTimes(1); expect(mocks.pending.size).toBe(1);
    const restored = fixture(); await restored.run(); expect(mocks.patch.mock.calls[1]?.[1]).toEqual(original);
    expect(mocks.pending.size).toBe(0); expect(first.deps.clearAutosaveDurableAuthority).not.toHaveBeenCalled();
  });
  it("reload 뒤 원래 ACK를 확인해도 이후 작품 설정 초안은 ACK·clean 처리하지 않는다", async () => {
    const first = fixture(); mocks.patch.mockRejectedValueOnce(new Error("응답 유실")); await first.run();
    const reloaded = fixture(), snapshot = reloaded.deps.scopedWrite.getSnapshot();
    reloaded.deps.scopedWrite.getSnapshot = () => ({ ...snapshot, title: "이후 작품 정보 초안" });
    await reloaded.run(); expect(mocks.pending.size).toBe(0); expect(mocks.acknowledge).not.toHaveBeenCalled();
    expect(reloaded.deps.clearAutosaveDurableAuthority).not.toHaveBeenCalled(); expectDraftPreserved();
  });
  it("유효한 ACK가 도착해도 그 사이 계정이 전환됐으면 원문·이전 기기 초안을 유지한다", async () => {
    const f = fixture(); mocks.patch.mockImplementationOnce(async () => {
      f.ticket.authScopeKey = "other"; f.deps.currentStudioDocumentScopeRef.current.authScopeKey = "other";
      return { workId: "work", revision: 8, updatedAt: "2026-10-29T06:00:00.000Z" };
    });
    await f.run(); expect(mocks.pending.size).toBe(1); expect(mocks.pendingClear).not.toHaveBeenCalled();
    expect(mocks.acknowledge).not.toHaveBeenCalled(); expect(f.deps.clearAutosaveDurableAuthority).not.toHaveBeenCalled();
  });
  it("reload의 저장 시각·현재 페이지 선택만 달라지면 실제 원문 ACK 뒤 정상 정리한다", async () => {
    const first = fixture(); mocks.patch.mockRejectedValueOnce(new Error("응답 유실")); await first.run();
    const reloaded = fixture(), snapshot = reloaded.deps.scopedWrite.getSnapshot();
    reloaded.deps.scopedWrite.getSnapshot = () => ({ ...snapshot, savedAt: "2026-10-30T06:00:00.000Z", currentPageId: "p2" });
    await reloaded.run(); expect(mocks.acknowledge).toHaveBeenCalledOnce(); expect(reloaded.deps.clearAutosaveDurableAuthority).toHaveBeenCalledOnce();
  });
  it("SQLite 읽기·원문 readback 실패는 wire 전에 중지하고 기기 초안을 보존한다", async () => {
    const first = fixture(); mocks.pendingLoad.mockRejectedValueOnce(new Error("SQLite 손상")); await first.run();
    expect(mocks.patch).not.toHaveBeenCalled(); expect(first.barrier).not.toHaveBeenCalled();
    const next = fixture(); mocks.pendingRemember.mockRejectedValueOnce(new Error("readback 실패")); await next.run();
    expect(mocks.patch).not.toHaveBeenCalled(); expect(mocks.acknowledge).not.toHaveBeenCalled();
    expectDraftPreserved();
  });
  it("확정 ACK를 정리하는 동안 추가된 metadata intent와 초안은 삭제하지 않는다", async () => {
    const f = fixture(); mocks.acknowledge.mockImplementationOnce(async () => {
      mocks.load.mockResolvedValue({ version: 1, id: "later-intent", scope: { ownerId: "actor", documentKey: "scoped-save-test" },
        queuedAt: 1_700_000_000_001, serverRevision: 8 });
    });
    await f.run(); expect(mocks.pending.size).toBe(0); expect(f.deps.clearAutosaveDurableAuthority).not.toHaveBeenCalled();
    expectDraftPreserved();
  });
  it.each([{ workId: "other", revision: 8 }, { workId: "work", revision: 9 }])("다른 work/revision ACK는 원문을 해제하지 않는다: %j", async (response) => {
    const f = fixture(); mocks.patch.mockResolvedValueOnce({ ...response, updatedAt: "2026-10-29T06:00:00.000Z" }); await f.run();
    expect(mocks.pendingClear).not.toHaveBeenCalled(); expect(mocks.pending.size).toBe(1); expect(mocks.acknowledge).not.toHaveBeenCalled();
  });
  it("full 승격 뒤에도 과거 scoped 원문이 있으면 그 ACK부터 확인한다", async () => {
    const first = fixture(); mocks.patch.mockRejectedValueOnce(new Error("응답 유실")); await first.run();
    const original = structuredClone(mocks.patch.mock.calls[0]?.[1]), promoted = fixture();
    promoted.deps.sharedDocument.capabilities.edit = true; promoted.setPolicy(policy(true));
    expect(await promoted.route()).toBe(true); expect(mocks.patch.mock.calls[1]?.[1]).toEqual(original);
    expect(promoted.barrier).not.toHaveBeenCalled(); expect(promoted.authority.refresh).not.toHaveBeenCalled();
  });
  it("서버가 scoped 이력 없음을 확인한 full 저장은 SQLite를 열지 않고 기존 경로로 돌려준다", async () => {
    const f = fixture(); f.deps.sharedDocument.capabilities.edit = true; f.setPolicy(policy(false));
    mocks.pendingLoad.mockRejectedValueOnce(new Error("SQLite 불가")); expect(await f.route()).toBe(false);
    expect(mocks.pendingLoad).not.toHaveBeenCalled(); expect(mocks.patch).not.toHaveBeenCalled(); expect(f.authority.refresh).toHaveBeenCalledOnce();
  });
  it("full의 이력 미확인·이력 있음/SQLite 실패를 pending 없음으로 추정하지 않는다", async () => {
    const unknown = fixture(); unknown.deps.sharedDocument.capabilities.edit = true;
    expect(await unknown.route()).toBe(true); expect(unknown.deps.setError).toHaveBeenCalled(); expect(mocks.pendingLoad).not.toHaveBeenCalled();
    const previous = fixture(); previous.deps.sharedDocument.capabilities.edit = true; previous.setPolicy(policy(true));
    mocks.pendingLoad.mockRejectedValueOnce(new Error("SQLite 불가")); expect(await previous.route()).toBe(true);
    expect(previous.deps.setError).toHaveBeenCalled(); expect(mocks.patch).not.toHaveBeenCalled();
  });
});
