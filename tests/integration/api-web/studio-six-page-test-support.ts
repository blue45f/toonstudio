import { randomBytes, randomUUID, createHash } from "node:crypto";

import { createProductionWorkflowProfile } from "@toonstudio/contracts/production-workflow";
import { STUDIO_ROLE_PIPELINE_STAGE_IDS } from "@toonstudio/contracts/studio-role-pipeline";
import { expect } from "vitest";

import type { createCanvasHarness } from "../../../apps/api/src/modules/creator/studio-role-pipeline-canvas-test-harness";
import type { StudioReviewPreviewSubject } from "../../../apps/api/src/modules/studio-project-graph/studio-review-preview";
import type { StudioScopedWriteManagementCommand, StudioScopedWritePolicy, StudioScopedWriteContext } from "@toonstudio/contracts/studio-scoped-write";
import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";

export type CanvasHarness = Awaited<ReturnType<typeof createCanvasHarness>>;
export interface Actor { id: string; email: string; password: string; cookie: string }
export interface SharedWork {
  workId: string; revision: number; crdtServerSequence: string; role: string;
  document: { doc: Record<string, unknown>; cover: string; pages: string[] };
}
interface Project { aggregate: ProductionProjectAggregate }
export const digest = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

/** 메일·저장소 port 외에는 기존 실제 AppModule 하네스를 그대로 사용한다. */
export async function registerActors(h: CanvasHarness): Promise<readonly [Actor, Actor]> {
  const actors: Actor[] = [];
  for (const name of ["6컷 제작 관리자", "6컷 공동 작업자"]) {
    const email = `six-page-${randomUUID()}@example.test`, password = `Aa7!${randomBytes(24).toString("base64url")}`;
    expect((await h.request("/auth/signup", { body: { email, password, name } })).status).toBe(201);
    const token = h.outbox.get(email);
    if (!token) throw new Error("실제 인증 메일의 시험 토큰이 없습니다.");
    expect((await h.request("/auth/email/verify", { body: { token } })).status).toBe(201);
    const login = await h.request<{ user: { id: string; role: string }; token?: string }>("/auth/login", { body: { email, password } });
    expect(login.status).toBe(201); expect(login.body.user.role).toBe("user"); expect(login.body.token).toBeUndefined();
    if (!login.cookie) throw new Error("실제 계정의 세션 쿠키가 없습니다.");
    actors.push({ id: login.body.user.id, email, password, cookie: login.cookie });
  }
  const owner = actors[0], worker = actors[1];
  if (!owner || !worker) throw new Error("두 실제 시험 계정이 필요합니다.");
  return [owner, worker];
}

export async function shared(h: CanvasHarness, workId: string, actor: Actor): Promise<SharedWork> {
  const result = await h.request<SharedWork>(`/creator/works/${workId}/team/document`, { cookie: actor.cookie });
  expect(result.status).toBe(200); return result.body;
}

export async function sixPageProduction(h: CanvasHarness, owner: Actor, worker: Actor, workId: string) {
  const projectId = randomUUID(), episodeId = "short-comic-episode-1";
  const get = async () => {
    const result = await h.request<Project>(`/production/projects/${projectId}`, { cookie: owner.cookie });
    expect(result.status).toBe(200); return result.body.aggregate;
  };
  const command = async (value: unknown, actor = owner) => {
    const aggregate = await get();
    const result = await h.request<Project>(`/production/projects/${projectId}/commands`, {
      cookie: actor.cookie, body: { expectedRevision: aggregate.revision, mutationId: randomUUID(), command: value },
    });
    expect(result.status, `제작 명령 ${typeof value === "object" && value ? Reflect.get(value, "type") : "unknown"}`).toBe(201);
    return result.body.aggregate;
  };
  const made = await h.request<Project>("/production/projects", { cookie: owner.cookie, body: { projectId, workId,
    title: "우산을 돌려주는 날 · 같은 6컷", collaborationModel: "studio-production", ownerPartyId: "six-owner-party",
    ownerDisplayName: "6컷 제작 관리자", clientMutationId: randomUUID() } });
  expect(made.status).toBe(201);
  const initial = made.body.aggregate, ownerParty = initial.parties.find(p => p.accountUserId === owner.id);
  const ownerAssignment = initial.assignments.find(a => a.partyId === ownerParty?.id);
  if (!ownerParty || !ownerAssignment) throw new Error("실제 제작 소유자 배정이 없습니다.");
  const at = new Date().toISOString(), startsAt = new Date(Date.now() - 3_600_000).toISOString();
  const endsAt = new Date(Date.now() + 86_400_000).toISOString();
  const scope = { kind: "episode" as const, id: episodeId, ancestors: [{ kind: "project" as const, id: projectId }] };
  await command({ type: "upsert-episode", episode: { id: "six-episode", projectId, episodeId, revision: 0,
    state: "episode-planning", narrativeRevisionRef: null, visualRevisionRef: null, integratedRevisionRef: null,
    activeHandoffId: null, openBlockerCount: 0, storyLockApproved: false, thumbnailLockApproved: false,
    jointProofApproved: false, creditPreflightPassed: false, publicationPreflightPassed: false, updatedAt: at } });
  await command({ type: "configure-collaboration", parties: [...initial.parties,
    { ...ownerParty, id: "six-worker-party", accountUserId: worker.id, publicDisplayName: "6컷 공동 작업자", internalDisplayName: "6컷 공동 작업자" }],
    assignments: [...initial.assignments,
      { ...ownerAssignment, id: "six-worker-role", partyId: "six-worker-party", roleType: "line-artist", scope, startsAt, endsAt, lead: false, status: "active" },
      { ...ownerAssignment, id: "six-reviewer-role", roleType: "editor", lead: false }], authorityRules: initial.authorityRules });
  await command({ type: "configure-workflow", profile: createProductionWorkflowProfile(projectId, "studio", at), expectedWorkflowRevision: 0 });
  const task: ProductionTask = { id: "six-current-task", projectId, scope, processKey: "line-art", title: "같은 6컷 원고 확인",
    status: "draft", priority: "normal", assignmentIds: ["six-worker-role"], reviewerAssignmentIds: [], inputRevisionRefs: [],
    outputDeliverableIds: [], dependencyTaskIds: [], dueAt: null, estimateHours: null, completionCriteria: ["6컷 동일성 확인"],
    briefBlocks: [], sourceAgreementMilestoneId: null };
  const stageTasks = STUDIO_ROLE_PIPELINE_STAGE_IDS.map((stageId, i) => ({ stageId, taskId: i === 0 ? task.id : `six-${stageId}` }));
  for (const stage of stageTasks) await command({ type: "upsert-task", task: { ...task, id: stage.taskId } });
  const policy = async (actor = owner) => {
    const result = await h.request<StudioScopedWritePolicy>(`/creator/works/${workId}/scoped-write`, { cookie: actor.cookie });
    expect(result.status).toBe(200); return result.body;
  };
  const manage = async (value: StudioScopedWriteManagementCommand["command"]) => {
    const current = await policy();
    const result = await h.request<StudioScopedWritePolicy>(`/creator/works/${workId}/scoped-write`, { cookie: owner.cookie,
      body: { mutationId: randomUUID(), expectedPolicyVersion: current.policyVersion, command: value } });
    expect(result.status).toBe(200); return result.body;
  };
  const configure = async (source: StudioReviewPreviewSubject, pages: readonly { id: string; elements: readonly { id: string; type: string }[] }[]) => {
    for (const [i, page] of pages.entries()) await manage({ type: "register-target", target: { id: `six-target-${i}`, productionProjectId: projectId,
      taskId: task.id, scope, pageId: page.id, frameId: null, layerId: null,
      entities: page.elements.map(e => ({ kind: e.type === "draw" ? "stroke" as const : "element" as const, id: e.id })), source } });
    const configured = await manage({ type: "configure-role-pipeline", configuration: { productionProjectId: projectId,
      roleBindings: [{ roleId: "creator", assignmentId: "six-worker-role" }],
      groupMappings: [{ groupId: "story-notes", targetIds: pages.map((_, i) => `six-target-${i}`) }], stageTasks } });
    const granted = await policy(worker), grant = granted.grants.find(g => g.id.startsWith("role-pipeline:") && g.actorUserId === worker.id && g.revokedAt === null);
    if (!grant) throw new Error("실제 6컷 담당자 grant가 없습니다.");
    const context: StudioScopedWriteContext = { version: 1, policyVersion: configured.policyVersion, grantIds: [grant.id], creations: [], restorations: [] };
    return context;
  };
  const approve = async (source: StudioReviewPreviewSubject, pageIds: readonly string[], context: StudioScopedWriteContext) => {
    const submissionId = `six-submission-${randomUUID()}`;
    let aggregate = await command({ type: "submit-task-output", taskId: task.id, submissionId,
      submittedByAssignmentId: "six-worker-role", documentRole: "lineart", source: { subject: source },
      selection: { mode: "pages", pages: pageIds.map((pageId, ordinal) => ({ pageId, ordinal })) },
      inputs: { mode: "initial-capture", source: { subject: source } },
      target: { kind: "create", deliverableId: `six-deliverable-${randomUUID()}`, type: "line-art", expectedFormat: "PNG", completionCriteria: ["6페이지 보존"] },
      writeContext: context }, worker);
    const output = aggregate.submissions.find(s => s.id === submissionId), current = aggregate.tasks.find(t => t.id === task.id);
    if (!output || !current) throw new Error("동일 6컷의 실제 제출본이 없습니다.");
    const reviewPolicy = { id: "six-review-policy", projectId, scope, responseDueHours: 24, expiredReviewAction: "escalate", quorumBasis: "accounts",
      lanes: [{ lane: "production", eligibleAssignmentIds: ["six-reviewer-role"], requiredAssignmentIds: ["six-reviewer-role"], quorum: 1, vetoAssignmentIds: [], blocksPublication: true }] };
    await command({ type: "upsert-review-policy", policy: reviewPolicy });
    await command({ type: "upsert-task", task: { ...current, reviewerAssignmentIds: ["six-reviewer-role"] } });
    for (const [fromStatus, toStatus] of [["draft", "ready"], ["ready", "in-progress"]]) await command({ type: "transition-task-batch", transitions: [{ taskId: task.id, fromStatus, toStatus }] });
    await command({ type: "upsert-submission", submission: { ...output, status: "in-review" } });
    await command({ type: "transition-task-batch", transitions: [{ taskId: task.id, fromStatus: "in-progress", toStatus: "internal-review" }] });
    await command({ type: "record-review-decision", policyId: reviewPolicy.id, decision: { id: "six-approved-decision", reviewRoundId: output.id,
      lane: "production", assignmentId: "six-reviewer-role", value: "approve", reasonCode: "automated-preservation-check",
      evidenceScopeRefs: [scope], conditions: [], createdAt: new Date().toISOString() } });
    // 이 결정은 픽셀·순서의 자동 회귀 근거다. 권리·등급·창작 품질의 사람 확인이 아니다.
    aggregate = await command({ type: "upsert-submission", submission: { ...output, status: "approved", evidenceRefs: ["six-approved-decision"] } });
    expect(aggregate.tasks.find(t => t.id === task.id)?.status).toBe("approved");
    const next = aggregate.tasks.find(t => t.id === "six-storyboard-conte");
    if (!next) throw new Error("실제 다음 공정이 없습니다.");
    await command({ type: "upsert-task", task: { ...next, dependencyTaskIds: [task.id], inputRevisionRefs: [output.revisionRef] } });
    return { submissionId, revision: output.revisionRef };
  };
  return { projectId, episodeId, get, command, policy, configure, approve };
}
