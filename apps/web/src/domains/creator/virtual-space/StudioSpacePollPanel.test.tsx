// @vitest-environment jsdom
import { cleanup, fireEvent, render, renderHook, screen, waitFor, act } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { StudioSpacePollSnapshot } from "@toonstudio/contracts/studio-space-poll";
import { apiFetch } from "@/platform/api";
import { StudioSpacePollPanel } from "./StudioSpacePollPanel";
import { useStudioSpacePoll } from "./use-studio-space-poll";

import { createSpaceDeviceRecordFixture } from "./studio-space-device-record.test-fixture";

const db = createSpaceDeviceRecordFixture();
const ownership = vi.hoisted(() => ({ busy: false, reset: vi.fn(async () => { ownership.busy = false; return true; }) }));
vi.mock("../studio-local-database-runtime", () => ({
  acquireStudioLocalDatabase: async () => {
    if (ownership.busy) throw new Error("DedicatedWorker ownership lock failed");
    return db;
  },
  resetFailedStudioLocalDatabaseOwnership: ownership.reset,
}));
vi.mock("@/platform/api", () => ({ apiFetch: vi.fn() }));
const actor = { localOnly: false, workId: "work-qa", world: "office", actor: "member", name: "작업자" };
const empty: StudioSpacePollSnapshot = { canVote: false, canClose: false, canCreate: true, didVote: false, poll: null };
const current: StudioSpacePollSnapshot = {
  ...empty, canVote: true, poll: { id: "f432ce01-0da1-4141-be01-d16f14245e02", question: "다음 컷은?", anonymous: true,
    closed: false, createdAt: 1, createdByName: "감독", deadlineMs: null, options: [
      { text: "야간", count: 0, voters: [] }, { text: "낮", count: 0, voters: [] },
    ] },
};
const send = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const draft = { question: "다음 컷은?", options: ["밤", "낮"], anonymous: true, closesInMs: null };

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.mocked(apiFetch).mockReset(); localStorage.clear(); db.records.clear(); });

describe("팀 공간 투표", () => {
  it("응답을 잃은 투표는 같은 요청으로 다시 확인하고 집계와 참여권을 함께 갱신한다", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(send(current)).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(send({ ...current, canVote: false, didVote: true }));
    render(<StudioSpacePollPanel {...actor} />);
    expect(screen.getByRole("status")).toBeTruthy();
    fireEvent.click(await screen.findByRole("button", { name: /야간.*투표/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(await screen.findByText("투표 완료")).toBeTruthy();
    const posts = vi.mocked(apiFetch).mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(2);
    expect(posts[0][1]?.body).toBe(posts[1][1]?.body);
  });

  it("작품 접근을 잃은 계정에는 이전 집계를 띄우지 않는다", async () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    vi.mocked(apiFetch).mockResolvedValueOnce(send(current)).mockResolvedValueOnce(send({}, 403));
    render(<StudioSpacePollPanel {...actor} />);
    await screen.findByText("다음 컷은?");
    fireEvent.focus(window);
    await screen.findByRole("alert");
    expect(screen.queryByText("다음 컷은?")).toBeNull();
    expect(screen.queryByText("투표 만들기")).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });

  it("권한이 없는 팀원이 빈 공간을 열면 빈 상태를 안내한다", async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(send({ ...empty, canCreate: false }));
    render(<StudioSpacePollPanel {...actor} />);
    await screen.findByText("진행 중인 투표가 없어요.");
    expect(screen.queryByRole("button", { name: /투표 시작/ })).toBeNull();
  });

  it("이전 공간에서 늦게 도착한 응답이 현재 공간 투표를 바꾸지 않는다", async () => {
    let finish: (response: Response) => void = () => { throw new Error("요청 대기 실패"); };
    vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValueOnce(send(current));
    const panel = render(<StudioSpacePollPanel {...actor} />);
    panel.rerender(<StudioSpacePollPanel {...actor} world="meeting" />);
    await screen.findByText("다음 컷은?");
    await act(async () => { finish(send(empty)); });
    expect(screen.getByText("다음 컷은?")).toBeTruthy();
  });
});

describe("기기에 저장하는 투표", () => {
  it("저장 실패 뒤 재시도해 마감과 재열기를 복원하며 계정별로 분리한다", async () => {
    const hook = renderHook(() => useStudioSpacePoll("space-user-a", "a", "감독"));
    await waitFor(() => expect(hook.result.current.state.loading).toBeFalsy());
    db.kvSet.mockRejectedValueOnce(new Error("quota"));
    await act(async () => { await hook.result.current.create(draft); });
    expect(hook.result.current.state.failed).toBe(true);
    await act(async () => { await hook.result.current.retry(); });
    const option = hook.result.current.state.poll?.options[0].id;
    if (!option) throw new Error("투표 선택지가 없습니다.");
    await act(async () => { await hook.result.current.vote(option); });
    await act(async () => { await hook.result.current.vote(option); });
    await act(async () => { await hook.result.current.close(); });
    expect(db.kvSet).toHaveBeenCalled();
    hook.unmount();
    const restored = renderHook(() => useStudioSpacePoll("space-user-a", "a", "감독"));
    await waitFor(() => expect(restored.result.current.state.loading).toBeFalsy());
    expect(restored.result.current.state.poll).toMatchObject({ closed: true, votes: [{ optionId: option, voterName: "", voterSessionId: "" }] });
    expect(restored.result.current.state.poll?.votes).toHaveLength(1);
    const other = renderHook(() => useStudioSpacePoll("space-user-b", "b", "동료"));
    await waitFor(() => expect(other.result.current.state.loading).toBeFalsy());
    expect(other.result.current.state.poll).toBeNull();
  });

  it("다른 탭이 놓은 OPFS 소유권을 다시 얻어 같은 투표를 연다", async () => {
    ownership.busy = true;
    ownership.reset.mockClear();
    const hook = renderHook(() => useStudioSpacePoll("busy", "owner", "감독"));
    await waitFor(() => expect(hook.result.current.state.failed).toBe(true));
    expect(ownership.reset).not.toHaveBeenCalled();
    await act(async () => { await hook.result.current.retry(); });
    await waitFor(() => expect(hook.result.current.state.failed).toBe(false));
    expect(ownership.reset).toHaveBeenCalledTimes(1);
    await act(async () => { await hook.result.current.create(draft); });
    expect(hook.result.current.state.poll?.question).toBe(draft.question);
  });

  it("손상된 기존 결과에 새 투표를 덮어쓰지 않는다", async () => {
    localStorage.setItem("space-corrupt", "broken");
    const hook = renderHook(() => useStudioSpacePoll("space-corrupt", "a", "감독"));
    await act(async () => { await hook.result.current.create(draft); });
    await waitFor(() => expect(hook.result.current.state.failed).toBe(true));
    expect(localStorage.getItem("space-corrupt")).toBe("broken");
    await act(async () => { await hook.result.current.keepCopyAndRestart(); });
    const kept = [...db.records.keys()].find(key => key.startsWith("space-corrupt:recovery:"));
    expect(kept && JSON.parse(db.records.get(kept)!)).toBe("broken");
    expect(localStorage.getItem("space-corrupt")).toBe("broken");
    expect(hook.result.current.state).toMatchObject({ failed: false, poll: null });
    await act(async () => { await hook.result.current.create(draft); });
    expect(hook.result.current.state.poll?.question).toBe(draft.question);
  });
});
