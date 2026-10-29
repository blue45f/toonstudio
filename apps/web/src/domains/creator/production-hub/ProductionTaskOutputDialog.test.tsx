// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { applyProductionTaskOutput, createProductionProjectAggregate, episodeScope, type ProductionProjectAggregate, type ProductionTask,
  type VerifiedProductionTaskOutputCapture } from "@toonstudio/core/production";
import { deriveStudioReviewPageMapping } from "@toonstudio/studio-project-model";
import { api, AppApiError } from "@/platform/api";
import ProductionTaskOutputDialog from "./ProductionTaskOutputDialog";
import { buildTaskOutputCommand, emptyTaskOutputDraft, taskOutputActorAssignments } from "./production-task-output-model";
import { loadTaskOutputCaptureChoices, loadTaskOutputCapturePages, refreshTaskOutputCapturePage } from "./production-task-output-source";
import { submissionCaptureVisualFixture } from "./production-submission-visual-review.test-fixture";
import type { ProductionClientCommand } from "./production-api";
import { taskOutputRejectionDisposition } from "./production-task-output-rejection";
import { productionCommandRecoveryKey } from "./production-command-recovery";
import { createTaskOutputSaveExpectation, hasConfirmedTaskOutputSave } from "./production-task-output-save-confirmation";
import { useProductionProjectSession } from "./use-production-project-session";
import { ProductionTaskOutputRefreshContext } from "./production-task-output-refresh-context";

const auth = vi.hoisted(() => ({ actorId: "task-output-owner", revision: 1 }));
vi.mock("@/domains/auth/public/session/auth-session-state", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/domains/auth/public/session/auth-session-state")>(),
  getAuthSession: () => ({ user: { id: auth.actorId } }), getAuthSessionRevision: () => auth.revision,
}));

beforeEach(() => { auth.actorId = "task-output-owner"; auth.revision = 1; window.sessionStorage.clear(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-29T12:00:00.000Z")); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); });
const AT = "2026-10-29T00:00:00.000Z";
function fixture(pageCount = 2) {
  // UI·HTTP 계약용 합성 문서다. 실제 브라우저 작화나 PNG decode 증거가 아니다.
  const f = submissionCaptureVisualFixture(), artifact = f.project.artifacts.find((item) => item.kind === "review-snapshot");
  const first = f.revisions["capture-artifact"][0], firstReview = f.reviews["capture-artifact"][0];
  if (!artifact || !first || !firstReview) throw new Error("저장 capture fixture가 없습니다.");
  const doc = { width: 800, pagesList: Array.from({ length: pageCount }, (_, ordinal) => ({ id: `page-${ordinal}`, canvasH: 1200,
    elements: [{ id: `frame-${ordinal}`, type: "frame", x: 40, y: 60, width: 600, height: 900 }] })) };
  const previews = doc.pagesList.map((_, ordinal) => ({ ordinal, sha256: (ordinal + 1).toString(16).padStart(64, "0"),
    mediaType: "image/png" as const, byteLength: 123, url: `https://images.unit.test/page-${ordinal}.png`, expiresAt: Date.now() + 120000,
    mapping: deriveStudioReviewPageMapping(doc, { ordinal, sourceServerRevision: 7, sourceContentDigest: first.rootGraphHash, renderWidth: 800, renderHeight: 1200 }) }));
  const revision = { ...first, operationFirst: 5, operationLast: 5, blobRefs: previews.map(({ ordinal, sha256 }) => ({ ordinal, sha256, role: "preview" as const })) };
  const review = { ...firstReview, title: "저장 검수 원고", status: "approved" as const };
  const project = { ...f.project, workId: "task-output-work", artifacts: [artifact] };
  const subject = { schemaVersion: 1 as const, projectId: project.id, workId: project.workId, artifactId: artifact.id,
    reviewId: review.id, revisionId: revision.id, rootGraphHash: revision.rootGraphHash };
  const base = createProductionProjectAggregate({ projectId: "task-output-project", workId: project.workId, title: "실제 저장 원고 제출 계약",
    collaborationModel: "studio-production", ownerPartyId: "output-party", ownerUserId: auth.actorId, ownerDisplayName: "제작 담당자", at: AT });
  const task: ProductionTask = { id: "task-output-task", projectId: base.projectId, scope: episodeScope(base.projectId, "episode-one"),
    processKey: "line-art", title: "첫 선화 작업", status: "in-progress", assignmentIds: [], reviewerAssignmentIds: [],
    inputRevisionRefs: [{ id: "previous-input", lineage: "visual", revision: 2, digest: `sha256:${"c".repeat(64)}`, createdAt: AT }],
    outputDeliverableIds: [], dependencyTaskIds: [], dueAt: null, estimateHours: null, completionCriteria: ["선화 확인"], sourceAgreementMilestoneId: null };
  const aggregate = { ...base, tasks: [task] };
  const response = (cursor: string | null) => {
    const start = cursor ? Number(cursor.split(".")[0]) + 1 : 0, batch = previews.slice(start, start + 32), last = batch[batch.length - 1];
    return { ok: true as const, subject, previews: batch, nextCursor: start + batch.length < previews.length && last ? `${last.ordinal}.${last.sha256}` : null };
  };
  return { aggregate, task, project, revision, review, subject, previews, response };
}
function mockHttp(f: ReturnType<typeof fixture>, preview = async (cursor: string | null) => f.response(cursor)) {
  return vi.spyOn(api, "get").mockImplementation(async (path) => {
    const url = new URL(path, "https://api.unit.test");
    if (url.pathname.endsWith("/project")) return f.project;
    if (url.pathname.endsWith("/revisions")) return [f.revision];
    if (url.pathname.endsWith("/reviews")) return [f.review];
    if (url.pathname.endsWith("/previews")) return preview(url.searchParams.get("cursor"));
    throw new Error(`예상하지 않은 단위 HTTP 경로: ${url.pathname}`);
  });
}
function deferred<T>() {
  let complete: ((value: T) => void) | undefined, fail: ((reason: unknown) => void) | undefined;
  return { promise: new Promise<T>((resolve, reject) => { complete = resolve; fail = reject; }),
    resolve(value: T) { if (!complete) throw new Error("대기 응답이 없습니다."); complete(value); },
    reject(reason: unknown) { if (!fail) throw new Error("대기 응답이 없습니다."); fail(reason); } };
}
async function chooseOutput() {
  const group = screen.getByRole("group", { name: "제출 원고" });
  const option = await within(group).findByRole("option", { name: /저장 검수 원고/ });
  if (!(option instanceof HTMLOptionElement)) throw new Error("원고 선택지가 없습니다.");
  fireEvent.change(within(group).getByRole("combobox"), { target: { value: option.value } });
  await screen.findByRole("img", { name: "제출 원고 1페이지" });
}
function fillDefinition(f: ReturnType<typeof fixture>) {
  fireEvent.change(screen.getByRole("combobox", { name: "제출 역할" }), { target: { value: f.aggregate.assignments[0]?.id } });
  fireEvent.change(screen.getByRole("combobox", { name: "문서 역할" }), { target: { value: "lineart" } });
  fireEvent.change(screen.getByRole("combobox", { name: "제출할 산출물" }), { target: { value: "new" } });
  fireEvent.change(screen.getByRole("textbox", { name: "산출물 종류" }), { target: { value: "선화" } });
  fireEvent.change(screen.getByRole("textbox", { name: "예상 형식" }), { target: { value: "PNG" } });
  fireEvent.change(screen.getByRole("textbox", { name: "완료 기준 · 한 줄에 하나" }), { target: { value: "선화 확인" } });
  fireEvent.change(screen.getByRole("combobox", { name: "고정 입력 기준" }), { target: { value: "current" } });
}
function rejected(status: 400 | 403 | 409) {
  return new Error("서버가 변경을 거절했습니다.", { cause: new AppApiError("정의·권한을 확인하세요.", {
    kind: status === 403 ? "forbidden" : status === 409 ? "conflict" : "validation", status,
    ...(status === 409 ? { code: "production_revision_conflict" } : {}),
  }) });
}
function captureProof(f: ReturnType<typeof fixture>): VerifiedProductionTaskOutputCapture {
  return { subject: f.subject, sourceServerRevision: 7, captureSequence: 5, createdAt: f.revision.createdAt,
    pages: f.previews.map((page) => ({ pageId: `page-${page.ordinal}`, ordinal: page.ordinal, sha256: page.sha256, frameIds: [`frame-${page.ordinal}`] })) };
}

describe("첫 작업 원고 선택과 실제 Graph client 경계", () => {
  it("실제 session이 ACK 유실을 같은 영수증 요청으로 복구하면 추가 제출 없이 창을 닫는다", async () => {
    const f = fixture(), onClose = vi.fn();
    const access = { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" as const };
    let saved: ProductionProjectAggregate | null = null;
    const record = () => ({ aggregate: saved ?? f.aggregate, access });
    vi.spyOn(api, "get").mockImplementation(async (path) => {
      const url = new URL(path, "https://api.unit.test");
      if (url.pathname === `/production/projects/${f.aggregate.projectId}`) return record();
      if (url.pathname.endsWith("/project")) return f.project;
      if (url.pathname.endsWith("/revisions")) return [f.revision];
      if (url.pathname.endsWith("/reviews")) return [f.review];
      if (url.pathname.endsWith("/previews")) return f.response(url.searchParams.get("cursor"));
      throw new Error("예상하지 않은 실제 session 단위 HTTP 경로");
    });
    const post = vi.spyOn(api, "post").mockRejectedValueOnce(new Error("저장 후 ACK 유실")).mockImplementation(async () => {
      if (!saved) throw new Error("복구할 저장 결과가 없습니다.");
      return { aggregate: saved };
    });
    const demo = { create: () => f.aggregate, reduce: (aggregate: ProductionProjectAggregate) => aggregate };
    function Harness() {
      const session = useProductionProjectSession(f.aggregate.projectId, auth.actorId, demo);
      const [closed, close] = useState(false);
      if (!session.aggregate) return <p>프로젝트 조회 중</p>;
      const aggregate = session.aggregate, task = aggregate.tasks.find((item) => item.id === f.task.id);
      if (!task) throw new Error("복구 대상 작업이 없습니다.");
      return <ProductionTaskOutputRefreshContext.Provider value={session.refresh}>
        {closed ? <p>제출 저장 확인 완료</p> : <ProductionTaskOutputDialog aggregate={aggregate} task={task} actorId={auth.actorId}
          authRevision={auth.revision} canEdit execute={async (command, message) => {
            if (command.type !== "submit-task-output") throw new Error("예상하지 않은 제출 명령");
            saved = { ...applyProductionTaskOutput(aggregate, command, auth.actorId, AT, { output: captureProof(f) }).aggregate, revision: aggregate.revision + 1 };
            await session.executeStrict(command, message);
          }} onClose={() => { onClose(); close(true); }} />}
      </ProductionTaskOutputRefreshContext.Provider>;
    }
    render(<Harness />); await screen.findByRole("combobox", { name: "제출 역할" });
    fillDefinition(f); await chooseOutput();
    fireEvent.change(screen.getByRole("combobox", { name: "사용 범위" }), { target: { value: "document" } });
    fireEvent.click(screen.getByRole("button", { name: "원고 제출 저장" }));
    await screen.findByRole("alert"); expect(onClose).not.toHaveBeenCalled(); expect(post).toHaveBeenCalledOnce();
    // 모달 안에서 실제 session.refresh를 호출하며 같은 영수증 요청만 재전송한다.
    expect(screen.queryByRole("button", { name: "같은 내용으로 다시 제출" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "저장 상태 확인" }));
    await screen.findByText("제출 저장 확인 완료"); expect(onClose).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledTimes(2); expect(post.mock.calls[1]?.[1]).toEqual(post.mock.calls[0]?.[1]);
    expect(window.sessionStorage.getItem(productionCommandRecoveryKey(auth.actorId, f.aggregate.projectId))).toBeNull();
  });

  it("복구 후보는 실제 입력·선택 원고·작업 연결까지 일치해야 성공 처리한다", async () => {
    const f = fixture(); mockHttp(f);
    const choice = (await loadTaskOutputCaptureChoices(f.project.workId))[0];
    if (!choice) throw new Error("저장 원고 후보가 없습니다.");
    const source = await loadTaskOutputCapturePages(choice), assignmentId = f.aggregate.assignments[0]?.id;
    if (!assignmentId) throw new Error("제출 담당자가 없습니다.");
    const command = buildTaskOutputCommand({ aggregate: f.aggregate, task: f.task, actorId: auth.actorId,
      draft: { ...emptyTaskOutputDraft(), assignmentId, documentRole: "lineart", targetId: "new", newType: "선화", newFormat: "PNG", criteria: "선화 확인",
        selectionMode: "pages", pageIds: ["page-0"], inputMode: "current" }, source, initialSource: null,
      ids: { submissionId: "confirmed-submission", deliverableId: "confirmed-output" }, at: Date.parse(AT) });
    const expected = createTaskOutputSaveExpectation(f.aggregate, f.task, command, source, null);
    if (!expected) throw new Error("저장 확인 기준이 없습니다.");
    const saved = { ...applyProductionTaskOutput(f.aggregate, command, auth.actorId, AT, { output: captureProof(f) }).aggregate, revision: f.aggregate.revision + 1 };
    expect(hasConfirmedTaskOutputSave(saved, expected)).toBe(true);
    const submission = saved.submissions[0];
    const firstPage = submission?.sourceEvidence?.pages[0];
    if (!submission?.sourceEvidence || !firstPage) throw new Error("실제 제출 근거가 없습니다.");
    expect(hasConfirmedTaskOutputSave({ ...saved, tasks: [{ ...f.task, outputDeliverableIds: [] }] }, expected)).toBe(false);
    expect(hasConfirmedTaskOutputSave({ ...saved, submissions: [{ ...submission, inputRevisionRefs: [] }] }, expected)).toBe(false);
    expect(hasConfirmedTaskOutputSave({ ...saved, submissions: [{ ...submission, id: "다른-제출" }] }, expected)).toBe(false);
    expect(hasConfirmedTaskOutputSave({ ...saved, submissions: [{ ...submission, sourceEvidence: { ...submission.sourceEvidence,
      selectionMode: "document" } }] }, expected)).toBe(false);
    expect(hasConfirmedTaskOutputSave({ ...saved, submissions: [{ ...submission, sourceEvidence: { ...submission.sourceEvidence,
      pages: [{ ...firstPage, frameIds: ["다른-프레임"] }] } }] }, expected)).toBe(false);
    expect(hasConfirmedTaskOutputSave({ ...saved, tasks: saved.tasks.map((task) => ({ ...task, status: "done" as const })) }, expected)).toBe(true);
  });

  it("같은 제출 ID라도 복구 결과가 불완전하면 닫거나 새 mutation을 보내지 않는다", async () => {
    const f = fixture(), onClose = vi.fn(), execute = vi.fn(async (_command: ProductionClientCommand, _message: string) => { throw new Error("응답 미확인"); }); mockHttp(f);
    const props = { aggregate: f.aggregate, task: f.task, actorId: auth.actorId, authRevision: auth.revision, canEdit: true, execute, onClose };
    const view = render(<ProductionTaskOutputDialog {...props} />); fillDefinition(f); await chooseOutput();
    fireEvent.change(screen.getByRole("combobox", { name: "사용 범위" }), { target: { value: "document" } });
    fireEvent.click(screen.getByRole("button", { name: "원고 제출 저장" })); await screen.findByRole("alert");
    const command = execute.mock.calls[0]?.[0];
    if (command?.type !== "submit-task-output") throw new Error("고정한 제출 명령이 없습니다.");
    const saved = applyProductionTaskOutput(f.aggregate, command, auth.actorId, AT, { output: captureProof(f) }).aggregate;
    const aggregate = { ...saved, revision: f.aggregate.revision + 1, submissions: saved.submissions.map((item) => ({ ...item, inputRevisionRefs: [] })) };
    const task = aggregate.tasks[0]; if (!task) throw new Error("저장된 작업 연결이 없습니다.");
    view.rerender(<ProductionTaskOutputDialog {...props} aggregate={aggregate} task={task} />);
    expect(screen.getByRole("button", { name: "같은 내용으로 다시 제출" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/같은 제출 ID의 저장 기록을 확인했습니다/)).toBeTruthy(); expect(onClose).not.toHaveBeenCalled();
    const form = screen.getByRole("dialog").querySelector("form"); if (!form) throw new Error("제출 폼이 없습니다.");
    fireEvent.submit(form); expect(execute).toHaveBeenCalledOnce(); expect(onClose).not.toHaveBeenCalled();
  });

  it("모달의 저장 상태 확인은 중복 요청을 막고 실패·계정 교체 뒤에도 새 제출을 만들지 않는다", async () => {
    const f = fixture(), first = deferred<void>(), late = deferred<void>(), onClose = vi.fn(); mockHttp(f);
    const refresh = vi.fn<() => Promise<void>>().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => late.promise);
    const execute = vi.fn(async (_command: ProductionClientCommand, _message: string) => { throw new Error("저장 응답 미확인"); });
    const props = { aggregate: f.aggregate, task: f.task, actorId: auth.actorId, authRevision: auth.revision, canEdit: true, execute, onClose };
    const view = render(<ProductionTaskOutputRefreshContext.Provider value={refresh}><ProductionTaskOutputDialog {...props} /></ProductionTaskOutputRefreshContext.Provider>);
    fillDefinition(f); await chooseOutput(); fireEvent.change(screen.getByRole("combobox", { name: "사용 범위" }), { target: { value: "document" } });
    fireEvent.click(screen.getByRole("button", { name: "원고 제출 저장" })); await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "저장 상태 확인" }));
    expect(screen.getByRole("button", { name: "저장 상태 확인 중" }).hasAttribute("disabled")).toBe(true);
    const form = screen.getByRole("dialog").querySelector("form"); if (!form) throw new Error("제출 폼이 없습니다.");
    fireEvent.submit(form); expect(refresh).toHaveBeenCalledOnce(); expect(execute).toHaveBeenCalledOnce();
    await act(async () => { first.reject(new Error("현재 권한으로 저장 결과를 조회하지 못했습니다.")); });
    expect(screen.getByRole("alert").textContent).toContain("현재 권한"); expect(onClose).not.toHaveBeenCalled();
    expect((screen.getByRole("textbox", { name: "산출물 종류" }) as HTMLInputElement).value).toBe("선화");
    fireEvent.click(screen.getByRole("button", { name: "저장 상태 확인" })); expect(refresh).toHaveBeenCalledTimes(2);
    view.unmount(); auth.revision += 1;
    render(<ProductionTaskOutputRefreshContext.Provider value={refresh}><ProductionTaskOutputDialog {...props} authRevision={auth.revision} /></ProductionTaskOutputRefreshContext.Provider>);
    await act(async () => { late.reject(new Error("이전 계정 세대의 늦은 복구 오류")); });
    expect(screen.queryByRole("alert")).toBeNull(); expect(onClose).not.toHaveBeenCalled(); expect(execute).toHaveBeenCalledOnce();
  });

  it("열린 폼의 역할 기간이 끝나면 초안을 유지하며 제출을 막고 닫기를 남긴다", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    const f = fixture(), assignment = f.aggregate.assignments[0];
    if (!assignment) throw new Error("제출 역할이 없습니다.");
    const aggregate = { ...f.aggregate, assignments: [{ ...assignment, endsAt: new Date(Date.now() + 1000).toISOString() }] };
    mockHttp(f);
    render(<ProductionTaskOutputDialog aggregate={aggregate} task={f.task} actorId={auth.actorId} authRevision={auth.revision}
      canEdit execute={vi.fn(async () => undefined)} onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("combobox", { name: "제출할 산출물" }), { target: { value: "new" } });
    fireEvent.change(screen.getByRole("textbox", { name: "산출물 종류" }), { target: { value: "유지할 선화 초안" } });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect((screen.getByRole("textbox", { name: "산출물 종류" }) as HTMLInputElement).value).toBe("유지할 선화 초안");
    expect(screen.getByText(/현재 시각에 유효한 제출 역할이 없습니다/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "원고 제출 저장" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "대화상자 닫기" }).hasAttribute("disabled")).toBe(false);
  });

  it.each(["conditionally-approved", "approved", "done", "cancelled", "out-of-scope"] as const)("%s 작업은 현재 입력을 유지하되 새 제출 명령을 만들지 않는다", async (status) => {
    const f = fixture(), task = { ...f.task, status }; mockHttp(f);
    const choice = (await loadTaskOutputCaptureChoices(f.project.workId))[0]; if (!choice) throw new Error("저장 원고가 없습니다.");
    const source = await loadTaskOutputCapturePages(choice);
    expect(() => buildTaskOutputCommand({ aggregate: { ...f.aggregate, tasks: [task] }, task, actorId: auth.actorId,
      draft: emptyTaskOutputDraft(), source, initialSource: null, ids: { submissionId: "closed-submission", deliverableId: "closed-output" }, at: Date.parse(AT) })).toThrow("후속 작업");
  });
  it("historical 승인 capture도 실제 snapshot tuple로 읽고 모든 mapped 페이지를 확인한다", async () => {
    const f = fixture(); mockHttp(f);
    const choices = await loadTaskOutputCaptureChoices(f.project.workId), choice = choices[0];
    if (!choice) throw new Error("저장된 원고 선택지가 없습니다.");
    expect(choice.subject).toEqual(f.subject);
    const source = await loadTaskOutputCapturePages(choice);
    expect(source.pages.map(({ pageId, ordinal, frameIds }) => ({ pageId, ordinal, frameIds }))).toEqual([
      { pageId: "page-0", ordinal: 0, frameIds: ["frame-0"] }, { pageId: "page-1", ordinal: 1, frameIds: ["frame-1"] },
    ]);
    expect(source.sourceServerRevision).toBe(7);
  });

  it("33번째 cursor가 끝나기 전에는 선택 완료를 반환하지 않고 suffix subject 변경을 거절한다", async () => {
    const f = fixture(33), pending = deferred<ReturnType<typeof f.response>>();
    const read = mockHttp(f, (cursor) => cursor ? pending.promise : Promise.resolve(f.response(null)));
    const choice = (await loadTaskOutputCaptureChoices(f.project.workId))[0];
    if (!choice) throw new Error("저장된 원고 선택지가 없습니다.");
    let finished = false;
    const load = loadTaskOutputCapturePages(choice).finally(() => { finished = true; });
    await waitFor(() => expect(read.mock.calls.filter(([path]) => path.includes("/previews"))).toHaveLength(2));
    expect(finished).toBe(false);
    const suffix = f.response(`31.${f.previews[31]?.sha256}`);
    pending.resolve({ ...suffix, subject: { ...suffix.subject, workId: "another-work" } });
    await expect(load).rejects.toThrow("원본·페이지 연결");
  });

  it("manifest hash가 다르면 선택을 거절한다", async () => {
    const f = fixture(), first = f.previews[0];
    if (!first) throw new Error("프리뷰 페이지 fixture가 없습니다.");
    mockHttp(f, async () => ({ ...f.response(null), previews: [{ ...first, sha256: "f".repeat(64) }] }));
    const choice = (await loadTaskOutputCaptureChoices(f.project.workId))[0];
    if (!choice) throw new Error("저장된 원고 선택지가 없습니다.");
    await expect(loadTaskOutputCapturePages(choice)).rejects.toThrow();
  });

  it("취소된 늦은 cursor 결과를 선택 완료로 돌려주지 않는다", async () => {
    const f = fixture(33), pending = deferred<ReturnType<typeof f.response>>(); mockHttp(f, (cursor) => cursor ? pending.promise : Promise.resolve(f.response(null)));
    const choice = (await loadTaskOutputCaptureChoices(f.project.workId))[0];
    if (!choice) throw new Error("저장된 원고 선택지가 없습니다.");
    const controller = new AbortController(), load = loadTaskOutputCapturePages(choice, { signal: controller.signal });
    await waitFor(() => expect(vi.mocked(api.get).mock.calls.filter(([path]) => path.includes("/previews"))).toHaveLength(2));
    controller.abort(); pending.resolve(f.response(`31.${f.previews[31]?.sha256}`));
    await expect(load).rejects.toMatchObject({ name: "AbortError" });
  });

  it("33번째 이미지 갱신은 이전 manifest cursor의 한 batch만 확인한다", async () => {
    const f = fixture(33), read = mockHttp(f), choice = (await loadTaskOutputCaptureChoices(f.project.workId))[0];
    if (!choice) throw new Error("저장된 원고 선택지가 없습니다.");
    const source = await loadTaskOutputCapturePages(choice); read.mockClear();
    const fresh = await refreshTaskOutputCapturePage(source, 32);
    expect(fresh.ordinal).toBe(32); expect(read).toHaveBeenCalledOnce();
    expect(read.mock.calls[0]?.[0]).toContain(encodeURIComponent(`31.${f.previews[31]?.sha256}`));
  });

  it("역할은 현재 UID·active 기간·task scope로 고르고 null party는 제외한다", () => {
    const f = fixture(), party = f.aggregate.parties[0], assignment = f.aggregate.assignments[0];
    if (!party || !assignment) throw new Error("실계정 역할 fixture가 없습니다.");
    expect(taskOutputActorAssignments(f.aggregate, f.task, auth.actorId, Date.parse(AT))).toEqual([assignment]);
    expect(taskOutputActorAssignments(f.aggregate, f.task, null, Date.parse(AT))).toEqual([]);
    expect(taskOutputActorAssignments({ ...f.aggregate, parties: [{ ...party, accountUserId: null }] }, f.task, auth.actorId, Date.parse(AT))).toEqual([]);
    expect(taskOutputActorAssignments({ ...f.aggregate, assignments: [{ ...assignment, endsAt: AT }] }, f.task, auth.actorId, Date.parse(AT))).toEqual([]);
  });

  it("이미지와 번호로 프레임을 고르며 command에는 선택 ID만 보내고 ACK 전 초안·같은 IDs를 유지한다", async () => {
    const f = fixture(), pending = deferred<void>(), onClose = vi.fn(); mockHttp(f);
    const execute = vi.fn<(command: ProductionClientCommand, message: string) => Promise<void>>().mockRejectedValueOnce(new Error("ACK 응답 불확실")).mockImplementationOnce(() => pending.promise);
    render(<ProductionTaskOutputDialog aggregate={f.aggregate} task={f.task} actorId={auth.actorId} authRevision={auth.revision} canEdit execute={execute} onClose={onClose} />);
    fillDefinition(f); await chooseOutput();
    fireEvent.change(screen.getByRole("combobox", { name: "사용 범위" }), { target: { value: "frames" } });
    fireEvent.click(screen.getByRole("button", { name: "프레임 1" }));
    expect(screen.getByRole("button", { name: "프레임 1" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "원고 제출 저장" }));
    await screen.findByRole("alert"); expect(onClose).not.toHaveBeenCalled();
    const first = execute.mock.calls[0]?.[0];
    expect(first).toMatchObject({ type: "submit-task-output", documentRole: "lineart", source: { subject: f.subject },
      selection: { mode: "frames", pages: [{ pageId: "page-0", ordinal: 0, frameIds: ["frame-0"] }] }, inputs: { mode: "current" } });
    expect(JSON.stringify(first)).not.toContain("https://"); expect(first).not.toHaveProperty("sourceEvidence");
    fireEvent.click(screen.getByRole("button", { name: "같은 내용으로 다시 제출" }));
    expect(execute.mock.calls[1]?.[0]).toBe(first); expect(onClose).not.toHaveBeenCalled();
    await act(async () => pending.resolve(undefined));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("실 shared HTTP 400의 미적용 거절 뒤에는 초안을 수정하고 같은 업무 ID로 다시 제출한다", async () => {
    const f = fixture(), onClose = vi.fn(); mockHttp(f);
    const execute = vi.fn<(command: ProductionClientCommand, message: string) => Promise<void>>().mockRejectedValueOnce(rejected(400)).mockResolvedValueOnce(undefined);
    render(<ProductionTaskOutputDialog aggregate={f.aggregate} task={f.task} actorId={auth.actorId} authRevision={auth.revision} canEdit execute={execute} onClose={onClose} />);
    fillDefinition(f); await chooseOutput();
    fireEvent.change(screen.getByRole("combobox", { name: "사용 범위" }), { target: { value: "document" } });
    fireEvent.click(screen.getByRole("button", { name: "원고 제출 저장" }));
    await screen.findByRole("alert");
    const type = screen.getByRole("textbox", { name: "산출물 종류" });
    await waitFor(() => expect(type.matches(":disabled")).toBe(false)); expect(onClose).not.toHaveBeenCalled();
    fireEvent.change(type, { target: { value: "수정한 선화 정의" } });
    const first = execute.mock.calls[0]?.[0];
    if (first?.type !== "submit-task-output") throw new Error("첫 제출 명령이 없습니다.");
    fireEvent.click(screen.getByRole("button", { name: "원고 제출 저장" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(execute.mock.calls[1]?.[0]).toMatchObject({ submissionId: first.submissionId,
      target: { kind: "create", deliverableId: first.target.deliverableId, type: "수정한 선화 정의" } });
    expect(execute.mock.calls[1]?.[0]).not.toBe(first);
  });

  it("실 shared HTTP 403의 미적용 거절은 권한 안내와 수정·닫기를 남긴다", async () => {
    const f = fixture(), execute = vi.fn(async () => { throw rejected(403); }); mockHttp(f);
    render(<ProductionTaskOutputDialog aggregate={f.aggregate} task={f.task} actorId={auth.actorId} authRevision={auth.revision} canEdit execute={execute} onClose={vi.fn()} />);
    fillDefinition(f); await chooseOutput();
    fireEvent.change(screen.getByRole("combobox", { name: "사용 범위" }), { target: { value: "document" } });
    fireEvent.click(screen.getByRole("button", { name: "원고 제출 저장" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("권한을 다시 확인"));
    expect(screen.getByRole("textbox", { name: "산출물 종류" }).matches(":disabled")).toBe(false);
    expect(screen.getByRole("button", { name: "대화상자 닫기" }).hasAttribute("disabled")).toBe(false);
  });

  it("terminal 분류는 실제 오류 class와 pending 부재 증명이 필요하고 불명확한 409·5xx·위조 status는 고정한다", () => {
    const f = fixture();
    expect(taskOutputRejectionDisposition(rejected(400), auth.actorId, f.aggregate.projectId)).toBe("editable");
    expect(taskOutputRejectionDisposition(rejected(403), auth.actorId, f.aggregate.projectId)).toBe("permission-denied");
    expect(taskOutputRejectionDisposition(rejected(409), auth.actorId, f.aggregate.projectId)).toBe("editable");
    for (const error of [new Error("ACK 응답 유실"), { status: 400 },
      new AppApiError("불명확한 충돌", { status: 409, kind: "conflict" }), new AppApiError("서버 응답 실패", { status: 503, kind: "server" })]) {
      expect(taskOutputRejectionDisposition(error, auth.actorId, f.aggregate.projectId)).toBe("sealed");
    }
    window.sessionStorage.setItem(productionCommandRecoveryKey(auth.actorId, f.aggregate.projectId), "unconfirmed");
    expect(taskOutputRejectionDisposition(rejected(400), auth.actorId, f.aggregate.projectId)).toBe("sealed");
    window.sessionStorage.removeItem(productionCommandRecoveryKey(auth.actorId, f.aggregate.projectId));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("저장소 상태 미확인"); });
    expect(taskOutputRejectionDisposition(rejected(400), auth.actorId, f.aggregate.projectId)).toBe("sealed");
  });

  it("페이지 교체 뒤 이전 갱신의 catch·finally가 새 페이지나 다음 pending 갱신을 바꾸지 않는다", async () => {
    const f = fixture(), first = deferred<ReturnType<typeof f.response>>(), second = deferred<ReturnType<typeof f.response>>();
    let calls = 0;
    mockHttp(f, async (cursor) => { calls += 1; return calls === 1 ? f.response(cursor) : calls === 2 ? first.promise : second.promise; });
    render(<ProductionTaskOutputDialog aggregate={f.aggregate} task={f.task} actorId={auth.actorId} authRevision={auth.revision} canEdit execute={vi.fn(async () => undefined)} onClose={vi.fn()} />);
    await chooseOutput(); fireEvent.click(screen.getByRole("button", { name: "현재 페이지 이미지 다시 확인" }));
    fireEvent.change(screen.getByRole("combobox", { name: "미리 볼 원고 페이지" }), { target: { value: "1" } });
    await screen.findByRole("img", { name: "제출 원고 2페이지" });
    fireEvent.click(screen.getByRole("button", { name: "현재 페이지 이미지 다시 확인" }));
    await waitFor(() => expect(calls).toBe(3));
    await act(async () => first.reject(new AppApiError("이전 페이지 권한 오류", { status: 403, kind: "forbidden" })));
    expect(screen.getByRole("img", { name: "제출 원고 2페이지" })).toBeTruthy(); expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "페이지 접근 확인 중" }).hasAttribute("disabled")).toBe(true);
    await act(async () => second.resolve(f.response(`0.${f.previews[0]?.sha256}`)));
    await waitFor(() => expect(screen.getByRole("button", { name: "현재 페이지 이미지 다시 확인" }).hasAttribute("disabled")).toBe(false));
  });

  it("동일 hash의 다른 capture로 교체한 뒤 이전 갱신 오류가 새 source를 폐기하지 않는다", async () => {
    const f = fixture(), pending = deferred<ReturnType<typeof f.response>>();
    const nextRevision = { ...f.revision, id: "second-capture-revision" }, nextReview = { ...f.review, id: "second-capture-review", revisionId: "second-capture-revision", title: "다른 저장 원고" };
    const nextSubject = { ...f.subject, revisionId: nextRevision.id, reviewId: nextReview.id }, nextUrl = "https://images.unit.test/second-capture-page-0.png";
    let firstReads = 0;
    vi.spyOn(api, "get").mockImplementation(async (path) => {
      const url = new URL(path, "https://api.unit.test");
      if (url.pathname.endsWith("/project")) return f.project;
      if (url.pathname.endsWith("/revisions")) return [f.revision, nextRevision];
      if (url.pathname.endsWith("/reviews")) return [f.review, nextReview];
      if (url.pathname.includes(`/reviews/${nextReview.id}/previews`)) return { ...f.response(null), subject: nextSubject,
        previews: f.previews.map((page) => ({ ...page, url: page.ordinal === 0 ? nextUrl : page.url })) };
      if (url.pathname.endsWith("/previews")) { firstReads += 1; return firstReads === 1 ? f.response(null) : pending.promise; }
      throw new Error("예상하지 않은 단위 HTTP 경로");
    });
    render(<ProductionTaskOutputDialog aggregate={f.aggregate} task={f.task} actorId={auth.actorId} authRevision={auth.revision} canEdit execute={vi.fn(async () => undefined)} onClose={vi.fn()} />);
    await chooseOutput(); fireEvent.click(screen.getByRole("button", { name: "현재 페이지 이미지 다시 확인" }));
    await waitFor(() => expect(firstReads).toBe(2));
    const group = screen.getByRole("group", { name: "제출 원고" }), option = within(group).getByRole("option", { name: /다른 저장 원고/ });
    if (!(option instanceof HTMLOptionElement)) throw new Error("새 원고 선택지가 없습니다.");
    fireEvent.change(within(group).getByRole("combobox"), { target: { value: option.value } });
    await waitFor(() => expect(screen.getByRole("img", { name: "제출 원고 1페이지" }).getAttribute("src")).toBe(nextUrl));
    await act(async () => pending.reject(new AppApiError("이전 원고 권한 오류", { status: 403, kind: "forbidden" })));
    expect(screen.getByRole("img", { name: "제출 원고 1페이지" }).getAttribute("src")).toBe(nextUrl); expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("button", { name: "현재 페이지 이미지 다시 확인" }).hasAttribute("disabled")).toBe(false);
  });

  it("고정 입력이 없는 최초 작업은 별도 검증한 capture를 initial-capture로 보낸다", async () => {
    const f = fixture(); mockHttp(f);
    const choice = (await loadTaskOutputCaptureChoices(f.project.workId))[0];
    if (!choice) throw new Error("저장된 원고 선택지가 없습니다.");
    const source = await loadTaskOutputCapturePages(choice), assignment = f.aggregate.assignments[0];
    if (!assignment) throw new Error("제출 역할 fixture가 없습니다.");
    const task = { ...f.task, inputRevisionRefs: [] };
    const draft = { ...emptyTaskOutputDraft(), assignmentId: assignment.id, documentRole: "lineart" as const,
      targetId: "new", newType: "선화", newFormat: "PNG", criteria: "선화 확인", selectionMode: "document" as const, inputMode: "initial-capture" as const };
    const command = buildTaskOutputCommand({ aggregate: { ...f.aggregate, tasks: [task] }, task, actorId: auth.actorId, draft, source, initialSource: source,
      ids: { submissionId: "first-submission", deliverableId: "first-output" }, at: Date.parse(AT) });
    expect(command.inputs).toEqual({ mode: "initial-capture", source: { subject: f.subject } });
    expect(command.selection).toEqual({ mode: "document" }); expect(command.target.kind).toBe("create");
  });

  it("계정 epoch가 바뀌면 이전 source의 늦은 suffix가 선택·이미지를 복구하지 않는다", async () => {
    const f = fixture(33), pending = deferred<ReturnType<typeof f.response>>(), execute = vi.fn(async () => undefined);
    const read = mockHttp(f, (cursor) => cursor ? pending.promise : Promise.resolve(f.response(null)));
    const props = { aggregate: f.aggregate, task: f.task, actorId: auth.actorId, canEdit: true, execute, onClose: vi.fn() };
    const view = render(<ProductionTaskOutputDialog {...props} authRevision={auth.revision} />);
    const group = screen.getByRole("group", { name: "제출 원고" }), option = await within(group).findByRole("option", { name: /저장 검수 원고/ });
    if (!(option instanceof HTMLOptionElement)) throw new Error("원고 선택지가 없습니다.");
    fireEvent.change(within(group).getByRole("combobox"), { target: { value: option.value } });
    await waitFor(() => expect(read.mock.calls.filter(([path]) => path.includes("/previews"))).toHaveLength(2));
    auth.revision += 1; view.rerender(<ProductionTaskOutputDialog {...props} authRevision={auth.revision} />);
    await act(async () => pending.resolve(f.response(`31.${f.previews[31]?.sha256}`)));
    await waitFor(() => {
      const current = within(group).getByRole("combobox");
      if (!(current instanceof HTMLSelectElement)) throw new Error("원고 선택 필드가 없습니다.");
      expect(current.value).toBe("");
    });
    expect(screen.queryByRole("img", { name: "제출 원고 1페이지" })).toBeNull(); expect(execute).not.toHaveBeenCalled();
  });

  it("preview 권한 조회 실패는 선택 완료나 제출로 해석하지 않고 수동 재확인을 남긴다", async () => {
    const f = fixture(), execute = vi.fn(async () => undefined); mockHttp(f, async () => { throw new Error("현재 원고 접근 권한 없음"); });
    render(<ProductionTaskOutputDialog aggregate={f.aggregate} task={f.task} actorId={auth.actorId} authRevision={auth.revision} canEdit execute={execute} onClose={vi.fn()} />);
    const group = screen.getByRole("group", { name: "제출 원고" }), option = await within(group).findByRole("option", { name: /저장 검수 원고/ });
    if (!(option instanceof HTMLOptionElement)) throw new Error("원고 선택지가 없습니다.");
    fireEvent.change(within(group).getByRole("combobox"), { target: { value: option.value } });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("접근 권한 없음"));
    expect(screen.getByRole("button", { name: "원고 제출 저장" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "저장 원고 다시 확인" }).hasAttribute("disabled")).toBe(false); expect(execute).not.toHaveBeenCalled();
  });
});
