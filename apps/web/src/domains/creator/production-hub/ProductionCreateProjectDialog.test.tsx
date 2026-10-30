// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProductionProjectAggregate } from "@toonstudio/core/production";
import type { WorkListParams, WorkSummary } from "@/platform/creator-client";
import type { StudioTeamSnapshot } from "../studio-team-client";
import type { ProductionMutationResponse, ProductionProjectRecord } from "./production-api";
import type { ProductionCreateInput, ProductionCreatePending, ProductionCreateScope } from "./production-create-pending";
import { ProductionCreateProjectDialog } from "./ProductionCreateProjectDialog";

const io = vi.hoisted(() => ({
  actor: "actor", revision: 1, listeners: new Set<() => void>(), rows: new Map<string, ProductionCreatePending>(),
  list: vi.fn<(params: WorkListParams, signal?: AbortSignal) => Promise<WorkSummary[]>>(),
  team: vi.fn<(workId: string) => Promise<StudioTeamSnapshot>>(),
  byWork: vi.fn<(workId: string) => Promise<ProductionProjectRecord>>(),
  post: vi.fn<(input: ProductionCreateInput, mutationId: string) => Promise<ProductionMutationResponse>>(),
  close: vi.fn(), storageFailure: false,
}));
vi.mock("@/platform/creator-client", () => ({ listWorks: io.list }));
vi.mock("../studio-team-client", () => ({ getStudioTeam: io.team }));
vi.mock("./production-api", () => ({ createProductionProject: io.post, getProductionProjectByWork: io.byWork }));
vi.mock("@/platform/api", () => ({
  getApiErrorMessage: async (cause: unknown, fallback: string) => cause instanceof Error ? cause.message : fallback,
  httpStatus: (cause: unknown) => cause instanceof Error && "status" in cause ? cause.status : null,
}));
vi.mock("@/domains/auth/public/session/auth-session-state", () => ({
  getAuthSession: () => ({ user: { id: io.actor, name: "실제 소유자" } }),
  getAuthSessionRevision: () => io.revision, listeners: io.listeners,
}));
function key(scope: ProductionCreateScope) { return JSON.stringify([scope.actorUserId, scope.workId]); }
vi.mock("./production-create-pending-store", () => ({ productionCreatePendingStore: {
  load: async (scope: ProductionCreateScope) => {
    if (io.storageFailure) throw new Error("기기 원문을 확인하지 못했습니다.");
    return io.rows.get(JSON.stringify([scope.actorUserId, scope.workId])) ?? null;
  },
  remember: async (scope: ProductionCreateScope, value: ProductionCreatePending) => {
    const id = JSON.stringify([scope.actorUserId, scope.workId]), existing = io.rows.get(id);
    if (existing) return existing; io.rows.set(id, value); return value;
  },
  clear: async (scope: ProductionCreateScope, mutationId: string, current: () => boolean) => {
    const id = JSON.stringify([scope.actorUserId, scope.workId]), value = io.rows.get(id);
    if (!current() || value?.clientMutationId !== mutationId) return false;
    io.rows.delete(id); return true;
  },
} }));
const own: WorkSummary = { id: "work", title: "서버에 저장한 원고", description: "", cover: "", tags: [], format: "cuttoon",
  titleId: null, status: "draft", author: { id: "actor", name: "실제 소유자", avatar: "" }, likes: 0, comments: 0,
  views: 0, liked: false, createdAt: "2026-10-29T00:00:00.000Z" };
const ownerTeam: StudioTeamSnapshot = { workId: "work", viewer: { userId: "actor", role: "owner", status: "active",
  capabilities: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false } }, members: [] };
function ack(input: ProductionCreateInput): ProductionMutationResponse {
  return { aggregate: { ...createProductionProjectAggregate({ ...input, ownerUserId: "actor",
    at: "2026-10-29T00:00:00.000Z" }), revision: 1 } };
}
function Location() { return <p data-testid="location">{useLocation().pathname}</p>; }
function show() {
  return render(<MemoryRouter><Location /><Routes>
    <Route path="/" element={<ProductionCreateProjectDialog actorId="actor" onClose={io.close} />} />
    <Route path="/production/projects/:projectId/settings" element={<p>실제 설정 화면</p>} />
  </Routes></MemoryRouter>);
}
async function selectOwn() {
  const select = await screen.findByRole("combobox", { name: "저장된 내 작품" });
  fireEvent.change(select, { target: { value: "work" } });
  await waitFor(() => expect(screen.queryByText("현재 소유권과 이전 생성 요청을 확인하고 있습니다.")).toBeNull());
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto); io.actor = "actor"; io.revision = 1; io.rows.clear(); io.storageFailure = false;
  vi.clearAllMocks();
  io.list.mockResolvedValue([own, { ...own, id: "foreign-work", title: "다른 계정 작품", author: { ...own.author, id: "other" } }]);
  io.team.mockResolvedValue(ownerTeam);
  io.byWork.mockRejectedValue(Object.assign(new Error("프로젝트 없음"), { status: 404 }));
  io.post.mockImplementation(async (input) => ack(input));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("저장 작품에서 시작하는 실제 Production 생성 UI", () => {
  it("자기 작품·제목·모델을 명시하고 정확 ACK 뒤에만 settings로 이동한다", async () => {
    show(); await selectOwn();
    expect(io.list).toHaveBeenCalledWith({ userId: "actor", sort: "recent" }, expect.any(AbortSignal));
    expect(screen.queryByRole("option", { name: "다른 계정 작품" })).toBeNull();
    expect(io.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("제작 프로젝트 제목"), { target: { value: "우리 팀 제작" } });
    fireEvent.change(screen.getByLabelText("협업 모델"), { target: { value: "co-creator" } });
    fireEvent.click(screen.getByRole("button", { name: "제작 프로젝트 생성" }));
    await screen.findByText("실제 설정 화면");
    const input = io.post.mock.calls[0]?.[0]; if (!input) throw new Error("실제 생성 요청이 없습니다.");
    expect(input).toMatchObject({ workId: "work", title: "우리 팀 제작", collaborationModel: "co-creator", ownerDisplayName: "실제 소유자" });
    expect(screen.getByTestId("location").textContent).toBe("/production/projects/" + input.projectId + "/settings");
    expect(io.rows.size).toBe(0);
  });
  it("ACK 유실·닫기·reload 뒤에는 자동 생성 없이 같은 원문을 명시 확인한다", async () => {
    io.post.mockRejectedValueOnce(new Error("응답 유실")); const first = show(); await selectOwn();
    fireEvent.click(screen.getByRole("button", { name: "제작 프로젝트 생성" }));
    await screen.findByRole("button", { name: "원래 요청의 생성 상태 확인" });
    await screen.findByText("응답 유실");
    const request = io.post.mock.calls[0]; expect(io.rows.size).toBe(1); first.unmount();
    show(); await selectOwn();
    await screen.findByRole("button", { name: "원래 요청의 생성 상태 확인" });
    expect(io.post).toHaveBeenCalledTimes(1); expect(screen.queryByLabelText("제작 프로젝트 제목")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "원래 요청의 생성 상태 확인" }));
    await screen.findByText("실제 설정 화면");
    expect(io.post.mock.calls[1]).toEqual(request); expect(io.rows.size).toBe(0);
  });
  it("기기 원문 확인 실패는 새 생성이나 메모리 fallback을 열지 않는다", async () => {
    io.storageFailure = true; show(); await selectOwn();
    await screen.findByText("기기 원문을 확인하지 못했습니다.");
    expect(screen.getByRole("button", { name: "제작 프로젝트 생성" }).hasAttribute("disabled")).toBe(true);
    expect(io.post).not.toHaveBeenCalled();
  });
  it("전송 뒤 계정 전환의 늦은 ACK는 원문 삭제·settings 이동을 하지 않는다", async () => {
    let resolvePost: (value: ProductionMutationResponse) => void = () => { throw new Error("전송 전에 ACK를 만들 수 없습니다."); };
    io.post.mockImplementationOnce(() => new Promise<ProductionMutationResponse>((resolve) => { resolvePost = resolve; }));
    show(); await selectOwn(); fireEvent.click(screen.getByRole("button", { name: "제작 프로젝트 생성" }));
    await waitFor(() => expect(io.post).toHaveBeenCalledTimes(1));
    const input = io.post.mock.calls[0]?.[0]; if (!input) throw new Error("실제 생성 요청이 없습니다.");
    await act(async () => { io.actor = "other"; io.revision += 1; io.listeners.forEach((notify) => notify()); });
    await act(async () => { resolvePost(ack(input)); });
    expect(screen.getByTestId("location").textContent).toBe("/");
    expect(io.rows.get(key({ actorUserId: "actor", workId: "work" }))?.input.projectId).toBe(input.projectId);
    expect(io.close).not.toHaveBeenCalled();
  });
});
