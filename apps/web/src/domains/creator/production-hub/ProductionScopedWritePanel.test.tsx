// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getStudioScopedWritePolicy, manageStudioScopedWritePolicy } from "../studio-collab/studio-scoped-write-client";
import { getStudioSharedDocument } from "../studio-shared-document-client";
import { getStudioTeam } from "../studio-team-client";
import { loadTaskOutputCaptureChoices, loadTaskOutputCapturePages } from "./production-task-output-source";
import { ProductionScopedWritePanel } from "./ProductionScopedWritePanel";
import { scopedManagementUiFixture } from "./studio-scoped-write-management.test-fixture";
import { loadScopedManagementRecovery } from "./studio-scoped-write-management-recovery";

const auth = vi.hoisted(() => ({ actorId: "owner", revision: 1 }));
vi.mock("@/domains/auth/public/session/auth-session-state", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/domains/auth/public/session/auth-session-state")>(),
  getAuthUserId: () => auth.actorId, getAuthSessionRevision: () => auth.revision,
}));
vi.mock("../studio-collab/studio-scoped-write-client", () => ({ getStudioScopedWritePolicy: vi.fn(), manageStudioScopedWritePolicy: vi.fn() }));
vi.mock("../studio-shared-document-client", () => ({ getStudioSharedDocument: vi.fn() }));
vi.mock("../studio-team-client", () => ({ getStudioTeam: vi.fn() }));
vi.mock("./production-task-output-source", () => ({ loadTaskOutputCaptureChoices: vi.fn(), loadTaskOutputCapturePages: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); window.sessionStorage.clear(); auth.actorId = "owner"; auth.revision = 1; });
afterEach(() => cleanup());
function setup() {
  const f = scopedManagementUiFixture();
  vi.mocked(getStudioScopedWritePolicy).mockResolvedValue(f.policy);
  vi.mocked(manageStudioScopedWritePolicy).mockResolvedValue({ ...f.policy, policyVersion: 2 });
  vi.mocked(loadTaskOutputCaptureChoices).mockResolvedValue([f.choice]);
  vi.mocked(loadTaskOutputCapturePages).mockResolvedValue(f.capture);
  vi.mocked(getStudioSharedDocument).mockResolvedValue({ workId: "work", role: "owner", status: "active", capabilities: { view: true, edit: true },
    access: "edit", revision: 3, crdtServerSequence: "0", updatedAt: f.at, document: { title: "실제 원고", titleId: null, description: "", cover: "", tags: [],
      format: "cuttoon", pages: [], doc: f.doc, status: "draft", seriesId: null, episodeNo: null, challengeId: null, remixFromId: null } });
  vi.mocked(getStudioTeam).mockResolvedValue({ workId: "work", viewer: { userId: "owner", role: "owner", status: "active",
    capabilities: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false } }, members: [
    { userId: "artist", name: "선화 담당", image: "", role: "viewer", status: "active", isOwner: false },
  ] });
  return f;
}

describe("실제 원고 범위 등록·공정 배정·회수 관리", () => {
  it("서버의 현재 canManage가 없으면 쓰기 폼과 권한 승격을 제공하지 않는다", async () => {
    const f = setup();
    vi.mocked(getStudioScopedWritePolicy).mockResolvedValue({ ...f.policy, canManage: false, fullEdit: false });
    render(<ProductionScopedWritePanel aggregate={f.aggregate} />);
    expect(await screen.findByText("현재 계정은 편집 범위를 관리할 수 없습니다.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "담당 편집 배정" })).toBeNull();
    expect(manageStudioScopedWritePolicy).not.toHaveBeenCalled();
  });

  it("고정 원고·actual page/frame/layer/IDs를 각각 선택한 등록 명령을 실제 client로 보낸다", async () => {
    const f = setup(); render(<ProductionScopedWritePanel aggregate={f.aggregate} />);
    await screen.findByRole("button", { name: "담당 원고 범위 등록" });
    fireEvent.change(screen.getByLabelText("등록 근거 작업"), { target: { value: "line-task" } });
    fireEvent.change(screen.getByLabelText("저장된 검수 원고"), { target: { value: f.choice.key } });
    await waitFor(() => expect(loadTaskOutputCapturePages).toHaveBeenCalled());
    await screen.findByRole("option", { name: "1 · page/one" });
    fireEvent.change(screen.getByLabelText("실제 페이지"), { target: { value: "page/one" } });
    fireEvent.change(screen.getByLabelText("실제 컷 프레임"), { target: { value: "frame@one" } });
    fireEvent.change(screen.getByLabelText("실제 레이어 그룹"), { target: { value: "layer" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /실제 선화 레이어/ }));
    fireEvent.click(screen.getByRole("button", { name: "담당 원고 범위 등록" }));
    await waitFor(() => expect(manageStudioScopedWritePolicy).toHaveBeenCalledTimes(1));
    expect(vi.mocked(manageStudioScopedWritePolicy).mock.calls[0]?.[1]).toMatchObject({ expectedPolicyVersion: 1,
      command: { type: "register-target", target: { taskId: "line-task", productionProjectId: "production", pageId: "page/one", frameId: "frame@one", layerId: "layer",
        entities: [{ kind: "group", id: "layer" }, { kind: "stroke", id: "stroke/one" }], source: f.choice.subject } } });
  });

  it.each(["현재", "미래 시작"] as const)("현재 task·실제 viewer 계정의 %s 역할과 기간을 묶어 grant한다", async (period) => {
    const f = setup(), futureStart = period === "미래 시작" ? new Date(Date.now() + 86_400_789).toISOString() : null;
    const aggregate = futureStart ? { ...f.aggregate, assignments: f.aggregate.assignments.map((assignment) =>
      assignment.id === "artist-role" ? { ...assignment, startsAt: futureStart } : assignment) } : f.aggregate;
    render(<ProductionScopedWritePanel aggregate={aggregate} />);
    await screen.findByRole("button", { name: "담당 편집 배정" });
    fireEvent.change(screen.getByLabelText("등록 원고 범위"), { target: { value: "target" } });
    fireEvent.change(screen.getByLabelText("현재 공정 작업"), { target: { value: "line-task" } });
    fireEvent.change(screen.getByLabelText("실제 계정의 역할 배정"), { target: { value: "artist-role" } });
    fireEvent.click(screen.getByRole("button", { name: "담당 편집 배정" }));
    await waitFor(() => expect(manageStudioScopedWritePolicy).toHaveBeenCalledTimes(1));
    expect(vi.mocked(manageStudioScopedWritePolicy).mock.calls[0]?.[1]).toMatchObject({ command: { type: "grant", taskId: "line-task",
      assignmentId: "artist-role", targetIds: ["target"], productionProjectId: "production", endsAt: null } });
    if (futureStart) expect(vi.mocked(manageStudioScopedWritePolicy).mock.calls[0]?.[1]).toMatchObject({ command: {
      startsAt: new Date(Math.ceil(Date.parse(futureStart) / 1000) * 1000).toISOString(),
    } });
    expect(screen.queryByRole("option", { name: /제작자.*owner/ })).toBeNull();
  });

  it("경계 clock이 갱신되지 않아도 선택 이벤트의 초를 사용하고 늦은 제출에서 기간을 다시 쓰지 않는다", async () => {
    const mountedAt = Date.parse("2026-10-30T04:00:00.250Z"), selectedAt = mountedAt + 300_509;
    const roleEnd = selectedAt + 60_789, clock = vi.spyOn(Date, "now").mockReturnValue(mountedAt);
    try {
      const f = setup(), aggregate = { ...f.aggregate, assignments: f.aggregate.assignments.map((assignment) => assignment.id === "artist-role"
        ? { ...assignment, startsAt: new Date(mountedAt - 60_000).toISOString(), endsAt: new Date(roleEnd).toISOString() } : assignment) };
      render(<ProductionScopedWritePanel aggregate={aggregate} />);
      await screen.findByRole("button", { name: "담당 편집 배정" });
      fireEvent.change(screen.getByLabelText("등록 원고 범위"), { target: { value: "target" } });
      fireEvent.change(screen.getByLabelText("현재 공정 작업"), { target: { value: "line-task" } });
      // focus·visibility·역할 경계를 발생시키지 않아 렌더 자격 clock은 mountedAt에 남아 있다.
      clock.mockReturnValue(selectedAt);
      fireEvent.change(screen.getByLabelText("실제 계정의 역할 배정"), { target: { value: "artist-role" } });
      const expectedStart = new Date(Math.floor(selectedAt / 1000) * 1000).toISOString();
      const expectedEnd = new Date(Math.floor(roleEnd / 1000) * 1000).toISOString();
      expect(new Date(screen.getByLabelText<HTMLInputElement>("편집 시작").value).toISOString()).toBe(expectedStart);
      expect(new Date(screen.getByLabelText<HTMLInputElement>("편집 종료 (선택)").value).toISOString()).toBe(expectedEnd);
      expect(manageStudioScopedWritePolicy).not.toHaveBeenCalled();
      clock.mockReturnValue(selectedAt + 30_000);
      fireEvent.click(screen.getByRole("button", { name: "담당 편집 배정" }));
      await waitFor(() => expect(manageStudioScopedWritePolicy).toHaveBeenCalledTimes(1));
      expect(vi.mocked(manageStudioScopedWritePolicy).mock.calls[0]?.[1]).toMatchObject({ command: {
        type: "grant", assignmentId: "artist-role", startsAt: expectedStart, endsAt: expectedEnd,
      } });
    } finally { cleanup(); clock.mockRestore(); }
  });

  it("unknown ACK는 새로고침 뒤 자동 재시도 없이 같은 mutation·본문으로만 확인한다", async () => {
    const f = setup(); vi.mocked(manageStudioScopedWritePolicy).mockRejectedValueOnce(new Error("응답 연결이 끊겼습니다."));
    const first = render(<ProductionScopedWritePanel aggregate={f.aggregate} />);
    fireEvent.click(await screen.findByRole("button", { name: "원고 범위 회수" }));
    await screen.findByRole("button", { name: "같은 요청 결과 확인" });
    await waitFor(() => expect(manageStudioScopedWritePolicy).toHaveBeenCalledTimes(1));
    const original = vi.mocked(manageStudioScopedWritePolicy).mock.calls[0]?.[1];
    expect(loadScopedManagementRecovery("owner", "work")).toEqual(original);
    first.unmount(); render(<ProductionScopedWritePanel aggregate={f.aggregate} />);
    const check = await screen.findByRole("button", { name: "같은 요청 결과 확인" });
    await waitFor(() => expect((check as HTMLButtonElement).disabled).toBe(false));
    expect(manageStudioScopedWritePolicy).toHaveBeenCalledTimes(1);
    fireEvent.click(check);
    await waitFor(() => expect(manageStudioScopedWritePolicy).toHaveBeenCalledTimes(2));
    expect(vi.mocked(manageStudioScopedWritePolicy).mock.calls[1]?.[1]).toEqual(original);
    await waitFor(() => expect(loadScopedManagementRecovery("owner", "work")).toBeNull());
  });
});
