// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyProductionTaskOutput, type SubmitProductionTaskOutputCommand, type VerifiedProductionTaskOutputCapture } from "@toonstudio/core/production";
import { createEmptyStudioWriterRoomDocument } from "../studio-writer-room";
import { getStudioWriterRoomCapture } from "../writer-room/studio-writer-room-capture-client";
import { getAuthSessionRevision, listeners } from "@/domains/auth/public/session/auth-session-state";
import { scopedManagementUiFixture } from "./studio-scoped-write-management.test-fixture";
import ProductionSubmissionWriterRoom from "./ProductionSubmissionWriterRoom";
import type { StudioWriterRoomCaptureResponse } from "@toonstudio/contracts/studio-writer-room";

const auth = vi.hoisted(() => ({ actor: "owner", revision: 1 }));
vi.mock("../writer-room/studio-writer-room-capture-client", () => ({ getStudioWriterRoomCapture: vi.fn() }));
vi.mock("@/domains/auth/public/session/auth-session-state", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/domains/auth/public/session/auth-session-state")>(), getAuthUserId: () => auth.actor,
  getAuthSessionRevision: () => auth.revision,
}));
beforeEach(() => { auth.actor = "owner"; auth.revision = 1; vi.clearAllMocks(); });
afterEach(() => cleanup());
function fixture(graphProjectId = "graph-project-one") {
  const f = scopedManagementUiFixture(), empty = createEmptyStudioWriterRoomDocument();
  const writerRoom = { ...empty, stages: { ...empty.stages, premise: { text: "첫 기획 문단\n\n마지막 기획 문단", characterIds: [] },
    synopsis: { text: "고정 시놉시스", characterIds: [] }, "episode-outline": { title: "회차 제목", summary: "회차 줄거리", characterIds: [] },
    "panel-plan": { items: Array.from({ length: 60 }, (_, index) => ({ id: `panel-${index}`, order: index, sceneId: "", shot: `샷 ${index}`, action: `본문 ${index}\n끝 문단 ${index}`, characterIds: [] })) },
    "dialogue-sfx": { ...empty.stages["dialogue-sfx"], dialogue: [{ id: "dialogue", order: 0, panelId: "panel-59", characterId: null, text: "고정 대사\n마지막 대사" }] },
  } };
  const capture: VerifiedProductionTaskOutputCapture = { subject: { ...f.choice.subject, projectId: graphProjectId }, sourceServerRevision: 3, captureSequence: 7, createdAt: f.at,
    pages: [{ pageId: "page/one", ordinal: 0, sha256: "b".repeat(64), frameIds: ["frame@one"] }] };
  const command: SubmitProductionTaskOutputCommand = { type: "submit-task-output", taskId: "line-task", submissionId: "story-submission", submittedByAssignmentId: "artist-role", documentRole: "story",
    source: { subject: capture.subject }, selection: { mode: "document" }, inputs: { mode: "initial-capture", source: { subject: capture.subject } },
    target: { kind: "create", deliverableId: "story-deliverable", type: "story", expectedFormat: "writer-room", completionCriteria: ["고정 대본 확인"] } };
  const aggregate = applyProductionTaskOutput(f.aggregate, command, "artist", "2026-10-29T06:00:00.000Z", { output: capture, initial: capture }).aggregate;
  const submission = aggregate.submissions.find((entry) => entry.id === command.submissionId);
  if (!submission) throw new Error("대본 제출 fixture가 없습니다.");
  const response: StudioWriterRoomCaptureResponse = { contract: "studio-writer-room-capture-v1", productionProjectId: aggregate.projectId,
    submissionId: submission.id, subject: capture.subject, sourceServerRevision: 3, captureSequence: 7, reviewStatus: "open", status: "available", writerRoom };
  vi.mocked(getStudioWriterRoomCapture).mockResolvedValue(response);
  return { aggregate, submission, writerRoom, response };
}

describe("같은 제출 버전의 고정 대본 읽기", () => {
  it("7단계·60컷·여러 문단을 자르지 않고 같은 고정 검수 링크로 연결한다", async () => {
    const f = fixture(), view = render(<ProductionSubmissionWriterRoom aggregate={f.aggregate} submission={f.submission} />);
    expect(getStudioWriterRoomCapture).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "제출 고정 대본 열기" }));
    await screen.findByLabelText("고정 Writer Room 전체 본문");
    expect(view.container.textContent).toContain("첫 기획 문단\n\n마지막 기획 문단");
    expect(view.container.textContent).toContain("본문 59\n끝 문단 59");
    expect(view.container.textContent).toContain("고정 대사\n마지막 대사");
    expect(screen.getByRole("region", { name: "장면" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "이 고정 검수의 의견·결정 열기" }).getAttribute("href")).toContain("review");
    expect(vi.mocked(getStudioWriterRoomCapture).mock.calls[0]?.[0]).toEqual({ productionProjectId: f.aggregate.projectId, submissionId: f.submission.id, subject: f.response.subject });
  });

  it("내용이 같은 aggregate 재조회는 고정 본문 요청을 다시 만들지 않는다", async () => {
    const f = fixture(), view = render(<ProductionSubmissionWriterRoom aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 고정 대본 열기" }));
    await screen.findByLabelText("고정 Writer Room 전체 본문");
    view.rerender(<ProductionSubmissionWriterRoom aggregate={structuredClone(f.aggregate)} submission={structuredClone(f.submission)} />);
    expect(getStudioWriterRoomCapture).toHaveBeenCalledTimes(1);
  });

  it("누락·손상은 명시 상태이고 현재 Writer Room이나 빈 본문으로 대체하지 않는다", async () => {
    const f = fixture();
    vi.mocked(getStudioWriterRoomCapture).mockResolvedValue({ contract: f.response.contract, productionProjectId: f.aggregate.projectId,
      submissionId: f.submission.id, subject: f.response.subject, sourceServerRevision: 3, captureSequence: 7, reviewStatus: "open", status: "missing" });
    render(<ProductionSubmissionWriterRoom aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 고정 대본 열기" }));
    expect(await screen.findByText("이 고정 원고에는 Writer Room 본문이 없습니다.")).toBeTruthy();
    expect(screen.queryByLabelText("고정 Writer Room 전체 본문")).toBeNull();
  });

  it("strict 고정 검수 식별자가 아니면 본문·링크 대신 명시 오류로 수집한다", async () => {
    const f = fixture("graph/project@one");
    render(<ProductionSubmissionWriterRoom aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 고정 대본 열기" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Invalid pinned review subject");
    expect(getStudioWriterRoomCapture).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText("고정 Writer Room 전체 본문")).toBeNull();
    expect(screen.queryByRole("link", { name: "이 고정 검수의 의견·결정 열기" })).toBeNull();
  });

  it("계정 전환 뒤 늦은 성공은 사라지고 새 계정에 비공개 본문을 남기지 않는다", async () => {
    const f = fixture(); let complete: ((response: StudioWriterRoomCaptureResponse) => void) | undefined;
    vi.mocked(getStudioWriterRoomCapture).mockImplementationOnce(() => new Promise((resolve) => { complete = resolve; }));
    render(<ProductionSubmissionWriterRoom aggregate={f.aggregate} submission={f.submission} />);
    fireEvent.click(screen.getByRole("button", { name: "제출 고정 대본 열기" }));
    await waitFor(() => expect(getStudioWriterRoomCapture).toHaveBeenCalledTimes(1));
    act(() => { auth.actor = "other"; auth.revision = getAuthSessionRevision() + 1; for (const listener of listeners) listener(null); });
    await act(async () => { if (!complete) throw new Error("대기 응답이 없습니다."); complete(f.response); await Promise.resolve(); });
    expect(screen.queryByLabelText("고정 Writer Room 전체 본문")).toBeNull();
    expect(getStudioWriterRoomCapture).toHaveBeenCalledTimes(1);
  });
});
