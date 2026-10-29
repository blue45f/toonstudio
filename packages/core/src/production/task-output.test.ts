import { describe, expect, it } from "vitest";

import { createProductionProjectAggregate } from "./aggregate";
import { sameProductionRevision } from "./revision";
import { episodeScope, projectScope } from "./scope";
import { validateProductionStudioRevisionLink } from "./studio-revision";
import { applyProductionTaskOutput, ProductionTaskOutputError } from "./task-output";
import { validateSubmission } from "./versioning";
import { productionTaskHasCurrentApprovedOutputs, productionTaskHasCurrentDependencyInputs, productionTaskHasCurrentReviewOutputs, transitionProductionTask } from "./workflow";

import type { ProductionTaskOutputCaptures, SubmitProductionTaskOutputCommand, VerifiedProductionTaskOutputCapture } from "./task-output-contract";
import type { Deliverable, ProductionProjectAggregate, ProductionTask, RevisionRef, Submission } from "./types";

const AT = "2026-10-29T06:00:00.000Z";
const ACTOR = "actual-owner";
const ASSIGNMENT = "assignment:owner:producer";
const scope = episodeScope("production-project", "episode-1");

function capture(id = "output", revision = 9): VerifiedProductionTaskOutputCapture {
  return { subject: { schemaVersion: 1, workId: "work", projectId: "graph-project", artifactId: "capture-artifact",
    reviewId: `review-${id}`, revisionId: `snapshot-${id}`, rootGraphHash: "a".repeat(64) },
  sourceServerRevision: revision, captureSequence: 42, createdAt: AT,
  pages: [{ pageId: "page/one", ordinal: 0, sha256: "b".repeat(64), frameIds: ["frame@one", "frame-two"] },
    { pageId: "page-two", ordinal: 1, sha256: "c".repeat(64), frameIds: ["frame-three"] }] };
}

function fixture() {
  const base = createProductionProjectAggregate({ projectId: "production-project", workId: "work", title: "첫 제출",
    collaborationModel: "studio-production", ownerPartyId: "owner", ownerUserId: ACTOR, ownerDisplayName: "담당자", at: AT });
  const task: ProductionTask = { id: "task", projectId: base.projectId, scope, title: "선화", processKey: "line-art",
    status: "draft", assignmentIds: [], reviewerAssignmentIds: [], inputRevisionRefs: [], outputDeliverableIds: [],
    dependencyTaskIds: [], dueAt: null, estimateHours: null, completionCriteria: ["선화 확인"], sourceAgreementMilestoneId: null };
  const output = capture(), initial = capture("initial", 7);
  const command: SubmitProductionTaskOutputCommand = { type: "submit-task-output", taskId: task.id, submissionId: "submission-new",
    submittedByAssignmentId: ASSIGNMENT, documentRole: "lineart", source: { subject: output.subject }, selection: { mode: "document" },
    inputs: { mode: "initial-capture", source: { subject: initial.subject } },
    target: { kind: "create", deliverableId: "deliverable-new", type: "line-art", expectedFormat: "studio-document", completionCriteria: ["정본 확인"] } };
  const aggregate: ProductionProjectAggregate = { ...base, tasks: [task] };
  const captures: ProductionTaskOutputCaptures = { output, initial };
  return { aggregate, task, command, captures };
}

function apply(f = fixture(), command = f.command, aggregate = f.aggregate, captures = f.captures) {
  return applyProductionTaskOutput(aggregate, command, ACTOR, AT, captures);
}

function firstSubmission(aggregate: ProductionProjectAggregate): Submission {
  const submission = aggregate.submissions[0];
  if (!submission) throw new Error("제출 fixture가 필요합니다.");
  return submission;
}

function expectOutputError(action: () => unknown, code: ProductionTaskOutputError["code"]): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught).toBeInstanceOf(ProductionTaskOutputError);
  expect(caught).toMatchObject({ code });
}

function dependencyFixture() {
  const f = fixture();
  const baseline: RevisionRef = { id: "baseline", lineage: "integrated", revision: 1, digest: `sha256:${"d".repeat(64)}`, createdAt: AT };
  const old: RevisionRef = { ...baseline, id: "dependency-old", lineage: "visual", revision: 2 };
  const current: RevisionRef = { ...old, id: "dependency-current", revision: 3 };
  const unrelated: RevisionRef = { ...old, id: "unrelated-visual" };
  const dependency: ProductionTask = { ...f.task, id: "dependency", status: "approved", inputRevisionRefs: [baseline], outputDeliverableIds: ["dependency-output"] };
  const output: Deliverable = { id: "dependency-output", projectId: f.aggregate.projectId, scope, type: "thumbnail",
    expectedFormat: "studio-document", completionCriteria: ["기준"], currentSubmissionId: "dependency-current-submission", approvedSubmissionId: "dependency-current-submission" };
  const submission: Submission = { id: "dependency-current-submission", projectId: f.aggregate.projectId, deliverableId: output.id,
    revisionRef: current, submittedByAssignmentId: ASSIGNMENT, submittedAt: AT, status: "approved", inputRevisionRefs: [baseline], evidenceRefs: ["decision"] };
  const history: Submission = { ...submission, id: "dependency-old-submission", revisionRef: old, status: "superseded" };
  const task = { ...f.task, inputRevisionRefs: [unrelated, old], dependencyTaskIds: [dependency.id] };
  return { ...f, aggregate: { ...f.aggregate, tasks: [task, dependency], deliverables: [output], submissions: [history, submission] },
    task, command: { ...f.command, inputs: { mode: "approved-dependencies" as const } }, unrelated, old, current };
}

describe("작업 출력의 원자적 첫 제출", () => {
  it("Graph 식별자의 문자 계약을 Production 프로젝트 ID와 혼동하지 않는다", () => {
    const f = fixture(), initial = f.captures.initial;
    if (!initial) throw new Error("최초 입력 원고가 없습니다.");
    const projectId = "graph/project@one";
    const output = { ...f.captures.output, subject: { ...f.captures.output.subject, projectId } };
    const baseline = { ...initial, subject: { ...initial.subject, projectId } };
    const command: SubmitProductionTaskOutputCommand = { ...f.command, source: { subject: output.subject },
      inputs: { mode: "initial-capture", source: { subject: baseline.subject } } };
    const result = applyProductionTaskOutput(f.aggregate, command, ACTOR, AT, { output, initial: baseline });
    expect(firstSubmission(result.aggregate).sourceEvidence?.subject.projectId).toBe(projectId);
    expect(result.aggregate.projectId).toBe("production-project");
  });
  it.each(["forbidden", "invalid-output", "invalid-inputs", "duplicate-id", "closed-task"] as const)("%s 코드는 유지하고 사용자에게 한글 교정 안내를 제공한다", (code) => {
    const error = new ProductionTaskOutputError(code);
    expect(error.code).toBe(code);
    expect(error.message).toMatch(/[가-힣]/u);
    expect(error.message).not.toContain(code);
  });

  it("작품의 실제 capture와 명시 기준을 새 산출물·출력·제출 포인터에 고정하고 원본을 보존한다", () => {
    const f = fixture(), before = JSON.stringify(f);
    const result = apply(f), submission = firstSubmission(result.aggregate);
    expect(result.deliverableId).toBe("deliverable-new");
    expect(result.submissionId).toBe("submission-new");
    expect(result.aggregate.tasks[0]).toMatchObject({ status: "draft", outputDeliverableIds: [result.deliverableId],
      inputRevisionRefs: [{ id: "snapshot-initial", lineage: "integrated", revision: 7 }] });
    expect(result.aggregate.deliverables[0]).toMatchObject({ scope, currentSubmissionId: submission.id, approvedSubmissionId: null });
    expect(submission).toMatchObject({ status: "submitted", revisionRef: { id: "snapshot-output", lineage: "visual", revision: 9 },
      sourceEvidence: { taskId: "task", documentRole: "lineart", sourceServerRevision: 9, captureSequence: 42,
        subject: { projectId: "graph-project", workId: "work" }, selectionMode: "document",
        pages: [{ pageId: "page/one", ordinal: 0, frameIds: [] }, { pageId: "page-two", ordinal: 1, frameIds: [] }] } });
    expect(JSON.stringify(f)).toBe(before);
    expect(Object.isFrozen(submission.sourceEvidence?.subject)).toBe(true);
    expect(Object.isFrozen(submission.sourceEvidence?.pages[0]?.frameIds)).toBe(true);
  });

  it.each(["lettering", "final"] as const)("%s 역할을 원본 종류 변경 없이 integrated 업무 참조로 투영한다", (documentRole) => {
    const f = fixture();
    expect(firstSubmission(apply(f, { ...f.command, documentRole }).aggregate).revisionRef.lineage).toBe("integrated");
  });

  it("배정 목록에 없는 project producer도 자기 실제 범위로 제출할 수 있다", () => {
    const f = fixture();
    expect(f.task.assignmentIds).toEqual([]);
    expect(f.aggregate.assignments[0]?.scope).toEqual(projectScope(f.aggregate.projectId));
    expect(apply(f).aggregate.submissions).toHaveLength(1);
  });

  it("호출 뒤 원본 capture 객체를 바꿔도 검증한 subject와 선택 근거를 보존한다", () => {
    const f = fixture(), subject = { ...f.captures.output.subject }, frameIds = ["frame@one"];
    const pages = [{ pageId: "page/one", ordinal: 0, sha256: "b".repeat(64), frameIds }];
    const result = apply(f, f.command, f.aggregate, { ...f.captures, output: { ...f.captures.output, subject, pages } });
    subject.rootGraphHash = "f".repeat(64); frameIds.push("later-frame");
    for (const page of pages) page.sha256 = "e".repeat(64);
    const evidence = firstSubmission(result.aggregate).sourceEvidence;
    expect(evidence?.subject.rootGraphHash).toBe("a".repeat(64));
    expect(evidence?.pages).toEqual([{ pageId: "page/one", ordinal: 0, sha256: "b".repeat(64), frameIds: [] }]);
  });

  it.each([
    ["다른 계정", (f: ReturnType<typeof fixture>) => ({ ...f.aggregate, parties: f.aggregate.parties.map((party) => ({ ...party, accountUserId: "other" })) })],
    ["비활성 party", (f: ReturnType<typeof fixture>) => ({ ...f.aggregate, parties: f.aggregate.parties.map((party) => ({ ...party, status: "paused" as const })) })],
    ["미시작", (f: ReturnType<typeof fixture>) => ({ ...f.aggregate, assignments: f.aggregate.assignments.map((entry) => ({ ...entry, startsAt: "2026-10-30T00:00:00.000Z" })) })],
    ["종료시각", (f: ReturnType<typeof fixture>) => ({ ...f.aggregate, assignments: f.aggregate.assignments.map((entry) => ({ ...entry, endsAt: AT })) })],
    ["다른 회차", (f: ReturnType<typeof fixture>) => ({ ...f.aggregate, assignments: f.aggregate.assignments.map((entry) => ({ ...entry, scope: episodeScope(f.aggregate.projectId, "other") })) })],
    ["onboarding", (f: ReturnType<typeof fixture>) => ({ ...f.aggregate, assignments: f.aggregate.assignments.map((entry) => ({ ...entry, status: "onboarding" as const })) })],
  ] as const)("%s assignment를 권한으로 사용하지 않는다", (_name, change) => {
    const f = fixture();
    expectOutputError(() => apply(f, f.command, change(f)), "forbidden");
  });

  it("빈 actor를 미연결 party와 일치시키지 않는다", () => {
    const f = fixture();
    expectOutputError(() => applyProductionTaskOutput(f.aggregate, f.command, "", AT, f.captures), "forbidden");
  });

  it.each([0, -1, 1.5, 2_147_483_648])("CreatorWork revision %s를 거절한다", (sourceServerRevision) => {
    const f = fixture();
    expectOutputError(() => apply(f, f.command, f.aggregate, { ...f.captures, output: { ...f.captures.output, sourceServerRevision } }), "invalid-output");
  });

  it("다른 작품·변조된 subject·초기 기준 subject를 거절한다", () => {
    const f = fixture();
    for (const subject of [{ ...f.command.source.subject, workId: "other" }, { ...f.command.source.subject, rootGraphHash: "d".repeat(64) }]) {
      expectOutputError(() => apply(f, { ...f.command, source: { subject } }), "invalid-output");
    }
    expectOutputError(() => apply(f, { ...f.command, inputs: { mode: "initial-capture", source: f.command.source } }), "invalid-output");
  });

  it("실제 page/frame만 고르고 evidence에 정본 hash와 canonical 순서를 보존한다", () => {
    const f = fixture();
    const result = apply(f, { ...f.command, selection: { mode: "frames", pages: [
      { pageId: "page-two", ordinal: 1, frameIds: ["frame-three"] },
      { pageId: "page/one", ordinal: 0, frameIds: ["frame-two", "frame@one"] },
    ] } });
    expect(firstSubmission(result.aggregate).sourceEvidence?.pages).toEqual([
      { ...f.captures.output.pages[0], frameIds: ["frame@one", "frame-two"] }, f.captures.output.pages[1],
    ]);
    expect(firstSubmission(apply(f, { ...f.command, selection: { mode: "pages", pages: [{ pageId: "page-two", ordinal: 1 }] } }).aggregate)
      .sourceEvidence?.pages).toEqual([{ pageId: "page-two", ordinal: 1, sha256: "c".repeat(64), frameIds: [] }]);
  });

  it.each([
    { mode: "pages", pages: [] },
    { mode: "pages", pages: [{ pageId: "missing", ordinal: 0 }] },
    { mode: "pages", pages: [{ pageId: "page/one", ordinal: 1 }] },
    { mode: "pages", pages: [{ pageId: "page/one", ordinal: 0 }, { pageId: "page/one", ordinal: 0 }] },
    { mode: "frames", pages: [{ pageId: "page/one", ordinal: 0, frameIds: [] }] },
    { mode: "frames", pages: [{ pageId: "page/one", ordinal: 0, frameIds: ["frame-three"] }] },
    { mode: "frames", pages: [{ pageId: "page/one", ordinal: 0, frameIds: ["frame@one", "frame@one"] }] },
  ] satisfies readonly SubmitProductionTaskOutputCommand["selection"][])("없는 선택·중복·전체페이지/컷 혼용을 거절한다: %j", (selection) => {
    const f = fixture();
    expectOutputError(() => apply(f, { ...f.command, selection }), "invalid-output");
  });

  it("신규 정의의 빈 형식·완료조건과 기존 ID 재사용을 거절한다", () => {
    const f = fixture();
    const target = { kind: "create" as const, deliverableId: "deliverable-new", type: "line-art", expectedFormat: "", completionCriteria: ["확인"] };
    expectOutputError(() => apply(f, { ...f.command, target }), "invalid-output");
    expectOutputError(() => apply(f, { ...f.command, target: { ...target, expectedFormat: "studio", completionCriteria: [" "] } }), "invalid-output");
    const first = apply(f);
    expectOutputError(() => apply(f, f.command, first.aggregate), "duplicate-id");
    expectOutputError(() => apply(f, { ...f.command, submissionId: "different", inputs: { mode: "current" } }, first.aggregate), "duplicate-id");
  });

  it("과거 검수회차 ID를 새 submission ID로 재사용하지 않는다", () => {
    const f = fixture();
    const aggregate = { ...f.aggregate, reviewDecisions: [{ id: "decision", reviewRoundId: f.command.submissionId, lane: "visual-direction" as const,
      assignmentId: ASSIGNMENT, value: "approve" as const, reasonCode: null, evidenceScopeRefs: [], conditions: [], createdAt: AT }] };
    expectOutputError(() => apply(f, f.command, aggregate), "duplicate-id");
  });

  it("기존 출력 재제출은 새 ID로 이력·검수근거를 보존하고 승인 포인터만 해제한다", () => {
    const f = fixture(), first = apply(f), old = firstSubmission(first.aggregate);
    const approved = { ...old, status: "approved" as const, evidenceRefs: ["prior-decision"] };
    const aggregate = { ...first.aggregate, submissions: [approved], deliverables: first.aggregate.deliverables.map((entry) => ({ ...entry, approvedSubmissionId: old.id })) };
    const result = apply(f, { ...f.command, submissionId: "submission-next", inputs: { mode: "current" },
      target: { kind: "existing", deliverableId: first.deliverableId } }, aggregate);
    expect(result.aggregate.submissions[0]).toBe(approved);
    expect(result.aggregate.submissions[0]?.evidenceRefs).toEqual(["prior-decision"]);
    expect(result.aggregate.deliverables[0]).toMatchObject({ currentSubmissionId: "submission-next", approvedSubmissionId: null });
    expect(result.aggregate.tasks[0]?.outputDeliverableIds).toEqual([first.deliverableId]);
  });

  it.each(["conditionally-approved", "approved", "done", "cancelled", "out-of-scope"] as const)("%s 작업의 첫 제출·재제출을 거절하여 확정 상태와 출력 포인터를 보존한다", (status) => {
    const f = fixture();
    const unopened = { ...f.aggregate, tasks: [{ ...f.task, status }] };
    const unopenedBefore = JSON.stringify(unopened);
    expectOutputError(() => apply(f, f.command, unopened), "closed-task");
    expect(JSON.stringify(unopened)).toBe(unopenedBefore);
    const first = apply(f), old = firstSubmission(first.aggregate);
    const closed = { ...first.aggregate, tasks: first.aggregate.tasks.map((task) => ({ ...task, status })),
      submissions: [{ ...old, status: "approved" as const, evidenceRefs: ["prior-decision"] }],
      deliverables: first.aggregate.deliverables.map((entry) => ({ ...entry, approvedSubmissionId: old.id })) };
    const before = JSON.stringify(closed);
    expectOutputError(() => apply(f, { ...f.command, submissionId: "closed-next", inputs: { mode: "current" },
      target: { kind: "existing", deliverableId: first.deliverableId } }, closed), "closed-task");
    expect(JSON.stringify(closed)).toBe(before);
    if (status === "approved" || status === "conditionally-approved") {
      const reopened = { ...closed, tasks: closed.tasks.map((task) => transitionProductionTask(task, "changes-requested", [])) };
      const next = apply(f, { ...f.command, submissionId: "reopened-next", inputs: { mode: "current" },
        target: { kind: "existing", deliverableId: first.deliverableId } }, reopened).aggregate;
      expect(next.tasks[0]?.status).toBe("changes-requested");
      expect(next.deliverables[0]?.currentSubmissionId).toBe("reopened-next");
      expect(next.submissions[0]).toBe(closed.submissions[0]);
    }
  });

  it("명시적 역할을 기록한 산출물은 같은 역할로만 재제출하고 서로 모순되는 과거 역할은 거절한다", () => {
    const f = fixture(), first = apply(f), saved = firstSubmission(first.aggregate);
    if (!saved.sourceEvidence) throw new Error("명시 역할 fixture가 필요합니다.");
    const command: SubmitProductionTaskOutputCommand = { ...f.command, submissionId: "same-role", inputs: { mode: "current" },
      target: { kind: "existing", deliverableId: first.deliverableId } };
    expect(apply(f, command, first.aggregate).aggregate.submissions[1]?.sourceEvidence?.documentRole).toBe("lineart");
    expectOutputError(() => apply(f, { ...command, documentRole: "color" }, first.aggregate), "invalid-output");
    const conflict: Submission = { ...saved, id: "conflicting-history", status: "superseded",
      revisionRef: { ...saved.revisionRef, productionSubmissionId: "conflicting-history" },
      sourceEvidence: { ...saved.sourceEvidence, documentRole: "color" } };
    expectOutputError(() => apply(f, command, { ...first.aggregate, submissions: [...first.aggregate.submissions, conflict] }), "invalid-output");
    expect(saved.sourceEvidence.documentRole).toBe("lineart");
  });

  it("명시 역할 없는 legacy 산출물에는 type 문구를 강제하지 않고 첫 명시 역할을 기록한다", () => {
    const f = fixture(), first = apply(f), saved = firstSubmission(first.aggregate);
    const { sourceEvidence, ...withoutEvidence } = saved;
    const { productionSubmissionId, ...rawRevision } = saved.revisionRef;
    expect(sourceEvidence?.documentRole).toBe("lineart");
    expect(productionSubmissionId).toBe(saved.id);
    const legacy: Submission = { ...withoutEvidence, revisionRef: rawRevision };
    const aggregate = { ...first.aggregate, submissions: [legacy] };
    const result = apply(f, { ...f.command, submissionId: "first-color", documentRole: "color", inputs: { mode: "current" },
      target: { kind: "existing", deliverableId: first.deliverableId } }, aggregate);
    expect(result.aggregate.deliverables[0]?.type).toBe("line-art");
    expect(result.aggregate.submissions[1]?.sourceEvidence?.documentRole).toBe("color");
  });

  it("연결 안 된 출력·다른 회차·깨진 current pointer를 기존target으로 받지 않는다", () => {
    const f = fixture(), first = apply(f);
    const command: SubmitProductionTaskOutputCommand = { ...f.command, submissionId: "next", inputs: { mode: "current" },
      target: { kind: "existing", deliverableId: first.deliverableId } };
    for (const aggregate of [
      { ...first.aggregate, tasks: first.aggregate.tasks.map((task) => ({ ...task, outputDeliverableIds: [] })) },
      { ...first.aggregate, deliverables: first.aggregate.deliverables.map((entry) => ({ ...entry, scope: episodeScope(f.aggregate.projectId, "other") })) },
      { ...first.aggregate, submissions: [] },
    ]) expectOutputError(() => apply(f, command, aggregate), "invalid-output");
  });

  it("current 입력의 빈 목록과 선행 승인 이후 낡은 핀을 거절한다", () => {
    const f = fixture();
    expectOutputError(() => apply(f, { ...f.command, inputs: { mode: "current" } }), "invalid-inputs");
    const deps = dependencyFixture();
    expectOutputError(() => apply(deps, { ...deps.command, inputs: { mode: "current" } }), "invalid-inputs");
  });

  it("기존 합법 fnv1a64 입력을 그대로 보존하고 새 출력은 sha256 정본으로 만든다", () => {
    const f = fixture();
    const input: RevisionRef = { id: "legacy-input", lineage: "narrative", revision: 3,
      digest: "fnv1a64:0123456789abcdef", createdAt: AT };
    const aggregate = { ...f.aggregate, tasks: [{ ...f.task, inputRevisionRefs: [input] }] };
    const result = apply(f, { ...f.command, inputs: { mode: "current" } }, aggregate);
    expect(firstSubmission(result.aggregate).inputRevisionRefs).toEqual([input]);
    expect(firstSubmission(result.aggregate).revisionRef.digest).toBe(`sha256:${"a".repeat(64)}`);
  });

  it("bound 입력은 실제 제출 tuple과 일치해야 하며 무관 과거 baseline에 현재 승인을 요구하지 않는다", () => {
    const f = fixture(), first = apply(f), saved = firstSubmission(first.aggregate), revisionRef = saved.revisionRef;
    const baseline: Submission = { ...saved, status: "superseded" };
    const consumer = { ...f.task, id: "baseline-consumer", inputRevisionRefs: [revisionRef] };
    const aggregate = { ...first.aggregate, tasks: [...first.aggregate.tasks, consumer], submissions: [baseline],
      deliverables: first.aggregate.deliverables.map((deliverable) => ({ ...deliverable, currentSubmissionId: null, approvedSubmissionId: null })) };
    const command: SubmitProductionTaskOutputCommand = { ...f.command, taskId: consumer.id, submissionId: "consumer-submission", inputs: { mode: "current" },
      target: { kind: "create", deliverableId: "consumer-output", type: "line-art", expectedFormat: "studio-document", completionCriteria: ["확인"] } };
    expect(apply(f, command, aggregate).aggregate.submissions[1]?.inputRevisionRefs).toEqual([revisionRef]);
    expectOutputError(() => apply(f, command, { ...aggregate, submissions: [] }), "invalid-inputs");
    expectOutputError(() => apply(f, command, { ...aggregate, submissions: [{ ...baseline,
      revisionRef: { ...revisionRef, digest: `sha256:${"e".repeat(64)}` } }] }), "invalid-inputs");
  });

  it("현재 승인 선행본만 명시 고정하며 같은 lineage의 무관 입력을 보존한다", () => {
    const f = dependencyFixture(), result = apply(f);
    expect(result.aggregate.tasks[0]?.inputRevisionRefs).toEqual([f.unrelated, f.current]);
    expect(result.aggregate.submissions[2]?.inputRevisionRefs).toEqual([f.unrelated, f.current]);
    expect(f.task.inputRevisionRefs).toEqual([f.unrelated, f.old]);
    const dependency = f.aggregate.tasks[1];
    if (!dependency) throw new Error("선행 fixture가 필요합니다.");
    expectOutputError(() => apply(f, f.command, { ...f.aggregate, tasks: [f.task, { ...dependency, status: "changes-requested" }] }), "invalid-inputs");
  });

  it("선행 revision ID만 같은 다른 lineage 핀은 보존하고 createdAt 차이만 있는 이전 선행 핀은 치환한다", () => {
    const f = dependencyFixture();
    const unrelated: RevisionRef = { ...f.old, lineage: "narrative" };
    const task = { ...f.task, inputRevisionRefs: [unrelated, { ...f.old, createdAt: "2026-10-28T00:00:00.000Z" }] };
    const aggregate = { ...f.aggregate, tasks: f.aggregate.tasks.map((entry) => entry.id === task.id ? task : entry) };
    expect(apply(f, f.command, aggregate).aggregate.tasks[0]?.inputRevisionRefs).toEqual([unrelated, f.current]);
  });

  it("같은 capture의 다른 페이지 출력은 실제 제출 ID로 독립 고정하고 재제출한 의존만 낡은 입력으로 판정한다", () => {
    const f = fixture();
    const taskA = { ...f.task, id: "task-a" }, taskB = { ...f.task, id: "task-b" };
    const command = (taskId: string, suffix: string, pageId: string, ordinal: number): SubmitProductionTaskOutputCommand => ({
      ...f.command, taskId, submissionId: `submission-${suffix}`,
      target: { kind: "create", deliverableId: `deliverable-${suffix}`, type: "line-art", expectedFormat: "studio-document", completionCriteria: ["선택 확인"] },
      selection: { mode: "pages", pages: [{ pageId, ordinal }] },
    });
    const a = command(taskA.id, "a", "page/one", 0), b = command(taskB.id, "b", "page-two", 1);
    const first = apply(f, a, { ...f.aggregate, tasks: [taskA, taskB] });
    const second = apply(f, b, first.aggregate);
    const outputA = second.aggregate.submissions.find((entry) => entry.id === a.submissionId);
    const outputB = second.aggregate.submissions.find((entry) => entry.id === b.submissionId);
    if (!outputA || !outputB) throw new Error("독립 출력 fixture가 필요합니다.");
    expect(outputA.revisionRef.id).toBe(outputB.revisionRef.id);
    expect(outputA.revisionRef.productionSubmissionId).toBe(outputA.id);
    expect(outputB.revisionRef.productionSubmissionId).toBe(outputB.id);
    expect(outputA.inputRevisionRefs[0]?.productionSubmissionId).toBeUndefined();
    expect(sameProductionRevision(outputA.revisionRef, outputB.revisionRef)).toBe(false);
    const approved: ProductionProjectAggregate = { ...second.aggregate,
      tasks: second.aggregate.tasks.map((task) => ({ ...task, status: "approved" as const })),
      submissions: second.aggregate.submissions.map((submission) => ({ ...submission, status: "approved" as const, evidenceRefs: ["prior-decision"] })),
      deliverables: second.aggregate.deliverables.map((deliverable) => ({ ...deliverable, approvedSubmissionId: deliverable.currentSubmissionId })),
    };
    const consumerA: ProductionTask = { ...f.task, id: "consumer-a", dependencyTaskIds: [taskA.id], inputRevisionRefs: [outputA.revisionRef] };
    const consumerB: ProductionTask = { ...f.task, id: "consumer-b", dependencyTaskIds: [taskB.id], inputRevisionRefs: [outputB.revisionRef] };
    expect(productionTaskHasCurrentDependencyInputs(consumerA, approved)).toBe(true);
    expect(productionTaskHasCurrentDependencyInputs(consumerB, approved)).toBe(true);
    expect(productionTaskHasCurrentDependencyInputs({ ...consumerA, inputRevisionRefs: [outputB.revisionRef] }, approved)).toBe(false);
    const both = { ...consumerA, dependencyTaskIds: [taskA.id, taskB.id] };
    expect(productionTaskHasCurrentDependencyInputs(both, approved)).toBe(false);
    expect(productionTaskHasCurrentDependencyInputs({ ...both, inputRevisionRefs: [outputA.revisionRef, outputB.revisionRef] }, approved)).toBe(true);
    const reopened = { ...approved, tasks: approved.tasks.map((task) => task.id === taskA.id
      ? { ...task, status: "changes-requested" as const } : task) };
    const next = apply(f, { ...a, submissionId: "submission-a-next", inputs: { mode: "current" },
      target: { kind: "existing", deliverableId: "deliverable-a" } }, reopened).aggregate;
    const reapproved: ProductionProjectAggregate = { ...next,
      tasks: next.tasks.map((task) => task.id === taskA.id ? { ...task, status: "approved" as const } : task),
      submissions: next.submissions.map((submission) => submission.id === "submission-a-next"
        ? { ...submission, status: "approved" as const, evidenceRefs: ["new-decision"] } : submission),
      deliverables: next.deliverables.map((deliverable) => deliverable.id === "deliverable-a"
        ? { ...deliverable, approvedSubmissionId: "submission-a-next" } : deliverable),
    };
    expect(productionTaskHasCurrentDependencyInputs(consumerA, reapproved)).toBe(false);
    expect(productionTaskHasCurrentDependencyInputs(consumerB, reapproved)).toBe(true);
    expect(reapproved.submissions.find((submission) => submission.id === outputA.id)).toBe(approved.submissions[0]);
    expect(approved.submissions[0]?.revisionRef.productionSubmissionId).toBe("submission-a");
    expect(productionTaskHasCurrentDependencyInputs(consumerA, approved)).toBe(true);
    const consumer = { ...consumerA, inputRevisionRefs: [outputA.revisionRef, outputB.revisionRef] };
    const refreshed = apply(f, { ...command(consumer.id, "consumer", "page/one", 0), inputs: { mode: "approved-dependencies" } },
      { ...reapproved, tasks: [...reapproved.tasks, consumer] });
    const nextA = reapproved.submissions.find((submission) => submission.id === "submission-a-next");
    if (!nextA) throw new Error("새 선행 제출 fixture가 필요합니다.");
    expect(refreshed.aggregate.tasks.find((task) => task.id === consumer.id)?.inputRevisionRefs)
      .toEqual([outputB.revisionRef, nextA.revisionRef]);
  });

  it("현재 출력·검수 준비 검사는 같은 원본의 다른 업무 입력을 대신 사용하지 않는다", () => {
    const f = dependencyFixture(), dependency = f.aggregate.tasks[1];
    if (!dependency) throw new Error("선행 fixture가 필요합니다.");
    const raw = dependency.inputRevisionRefs[0];
    if (!raw) throw new Error("입력 fixture가 필요합니다.");
    const task = { ...dependency, inputRevisionRefs: [{ ...raw, productionSubmissionId: "input-a" }] };
    const aggregate = { ...f.aggregate, submissions: f.aggregate.submissions.map((submission) => ({
      ...submission, inputRevisionRefs: [{ ...raw, productionSubmissionId: "input-b" }],
    })) };
    expect(productionTaskHasCurrentApprovedOutputs(task, aggregate)).toBe(false);
    expect(productionTaskHasCurrentReviewOutputs(task, aggregate)).toBe(false);
  });

  it("초기 capture 기준을 기존 출력이나 선행 작업이 있는 task에 소급하지 않는다", () => {
    const f = fixture(), first = apply(f);
    expectOutputError(() => apply(f, { ...f.command, submissionId: "next", target: { kind: "existing", deliverableId: first.deliverableId } }, first.aggregate), "invalid-inputs");
    const deps = dependencyFixture();
    expectOutputError(() => apply(deps, { ...deps.command, inputs: f.command.inputs }), "invalid-inputs");
  });

  it("일반 upsert의 evidence 주입·삭제·변조를 막고 키순서만 다른 동일 근거는 허용한다", () => {
    const f = fixture(), result = apply(f), submission = firstSubmission(result.aggregate), deliverable = result.aggregate.deliverables[0];
    if (!deliverable || !submission.sourceEvidence) throw new Error("근거 fixture가 필요합니다.");
    const validate = (next: Submission, current?: Submission) => validateSubmission({ submission: next, current, deliverable, activeAssignmentIds: [ASSIGNMENT] });
    expect(validate(submission)).toContain("submission-source-evidence-server-managed");
    const { sourceEvidence, ...without } = submission;
    expect(validate(without, submission)).toContain("submission-source-evidence-mutated");
    expect(validate({ ...submission, sourceEvidence: { ...sourceEvidence, captureSequence: 99 } }, submission)).toContain("submission-source-evidence-mutated");
    const changed = { ...submission, revisionRef: { ...submission.revisionRef, productionSubmissionId: "other-submission" } };
    expect(validate(changed, submission)).toContain("submission-content-mutated");
    expect(validate(changed, submission)).toContain("submission-source-evidence-binding-mismatch");
    const boundInput: RevisionRef = { id: "input", lineage: "visual",
      revision: 1, digest: `sha256:${"a".repeat(64)}`, createdAt: AT, productionSubmissionId: "input-a" };
    const withBoundInput = { ...submission, inputRevisionRefs: [boundInput] };
    expect(validate({ ...withBoundInput, inputRevisionRefs: [{ ...boundInput, productionSubmissionId: "input-b" }] }, withBoundInput))
      .toContain("submission-content-mutated");
    const link = { id: "link", projectId: f.aggregate.projectId, workId: f.aggregate.workId, episodeId: null,
      studioDocumentRef: submission.revisionRef.id, documentRole: "lineart" as const, studioRevisionRef: submission.revisionRef,
      deliverableId: submission.deliverableId, submissionId: submission.id, linkedByAssignmentId: ASSIGNMENT,
      status: "submitted" as const, linkedAt: AT, approvedAt: null };
    expect(validateProductionStudioRevisionLink({ aggregate: result.aggregate, link })).toEqual([]);
    expect(validateProductionStudioRevisionLink({ aggregate: result.aggregate, link: { ...link, documentRole: "color" } }))
      .toContain("studio-link-submission-role-mismatch");
    expect(validateProductionStudioRevisionLink({ aggregate: result.aggregate, link: { ...link, studioRevisionRef: changed.revisionRef } }))
      .toContain("studio-link-submission-revision-mismatch");
    const subject = sourceEvidence.subject;
    expect(validate({ ...submission, sourceEvidence: { ...sourceEvidence, subject: { rootGraphHash: subject.rootGraphHash,
      revisionId: subject.revisionId, reviewId: subject.reviewId, artifactId: subject.artifactId, projectId: subject.projectId,
      workId: subject.workId, schemaVersion: subject.schemaVersion } } }, submission)).toEqual([]);
  });
});
