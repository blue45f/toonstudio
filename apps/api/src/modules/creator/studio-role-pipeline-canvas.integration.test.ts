import "reflect-metadata";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import { createCanvasHarness } from "./studio-role-pipeline-canvas-test-harness";
import { randomBytes, randomUUID } from "node:crypto";
import * as Y from "yjs";
import { materializeStudioAuthoringFromCrdt } from "@toonstudio/contracts/studio-crdt-authoring";
import { Image, encodePng } from "image-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";
import { createProductionWorkflowProfile } from "@toonstudio/contracts/production-workflow";
import { STUDIO_ROLE_PIPELINE_STAGE_IDS, type StudioRolePipelineConfiguration } from "@toonstudio/contracts/studio-role-pipeline";
import type { StudioScopedWriteContext, StudioScopedWriteManagementCommand, StudioScopedWritePolicy,
  StudioScopedWriteSourceSchema } from "@toonstudio/contracts/studio-scoped-write";
import type { z } from "zod";
import type { CreatorCollaborationInvitation, CreatorCollaborationInvitationResponse } from "./creator-collaboration.repository";
import { studioReviewPreviewDigest, type StudioReviewPreviewCapture,
  type StudioReviewPreviewIntent } from "../studio-project-graph/studio-review-preview-producer.contract";

const url = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim() || process.env.TEST_DATABASE_URL?.trim();
const browserOrigin = process.env.TOONSTUDIO_RBAC_BROWSER_ORIGIN?.trim();
if (browserOrigin) {
  const parsed = new URL(browserOrigin);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !parsed.port || parsed.username || parsed.password) throw new Error("화면 검증은 명시 포트의 loopback 웹에서만 실행합니다.");
}
if (browserOrigin && !url) throw new Error("공개 제한 편집 producer 검증에는 준비된 로컬 PostgreSQL URL이 필요합니다.");
type Actor = { id: string; email: string; password: string; cookie: string };
type Subject = z.infer<typeof StudioScopedWriteSourceSchema>;
type Shared = { workId: string; revision: number; crdtServerSequence: string; role: string;
  capabilities: { view: boolean; edit: boolean }; document: { doc: Record<string, unknown>; cover: string; pages: string[] } };
type Project = { aggregate: ProductionProjectAggregate; access: { view: boolean; edit: boolean; manage: boolean } };
type Team = { members: Array<{ userId: string; role: string; status: string; invitationId?: string }> };

// PNG는 명시적인 업로드 픽셀 fixture다. 실제 Canvas 렌더·Socket.IO·브라우저 편집 증거를 대신하지 않는다.
const png = Buffer.from(encodePng(new Image(2, 1, {
  data: new Uint8Array([20, 30, 40, 255, 60, 70, 80, 255]), colorModel: "RGBA",
})));
const manuscript = () => ({ version: 3, width: 720, currentPageId: "page", pagesList: [{ id: "page", bg: "#ffffff", bgGrad: null, canvasH: 768, elements: [
  { id: "frame-own", type: "frame", x: 0, y: 0, width: 360, height: 768 },
  { id: "frame-outside", type: "frame", x: 360, y: 0, width: 360, height: 768 },
  { id: "own", type: "draw", points: [100, 100, 300, 300], stroke: "#111111", strokeWidth: 4, noClip: false, frameClipId: "frame-own" },
  { id: "outside", type: "draw", points: [440, 100, 600, 300], stroke: "#222222", strokeWidth: 4, noClip: false, frameClipId: "frame-outside" },
] }] });

describe.skipIf(!url || !browserOrigin)("실제 Canvas와 제한 PostgreSQL runtime의 직군별 원고 보호", () => {
  let h: Awaited<ReturnType<typeof createCanvasHarness>>;
  const actors: Actor[] = [], workIds: string[] = [];
  const owner = () => actors[0]!, viewer = () => actors[1]!;
  beforeAll(async () => {
    h = await createCanvasHarness(url!, workIds, browserOrigin!, validatePostgresIntegrationUrl);
    for (const name of ["제작 관리자", "담당 열람자"]) {
      const email = `scoped-producer-${randomUUID()}@example.test`, password = `Aa7!${randomBytes(24).toString("base64url")}`;
      expect((await h.request("/auth/signup", { body: { email, password, name } })).status).toBe(201);
      const token = h.outbox.get(email);
      if (!token) throw new Error("실제 가입 메일의 인증 토큰이 없습니다.");
      expect((await h.request("/auth/email/verify", { body: { token } })).status).toBe(201);
      const login = await h.request<{ user: { id: string; role: string }; token?: string }>("/auth/login", { body: { email, password } });
      expect(login.status).toBe(201); expect(login.body.user.role).toBe("user"); expect(login.body.token).toBeUndefined();
      if (!login.cookie) throw new Error("실제 로그인 세션 쿠키가 없습니다.");
      actors.push({ id: login.body.user.id, email, password, cookie: login.cookie });
    }
  }, 180_000);
  afterAll(async () => { await h?.close(); });

  async function shared(workId: string, actor = owner()) {
    const result = await h.request<Shared>(`/creator/works/${workId}/team/document`, { cookie: actor.cookie });
    expect(result.status).toBe(200); return result.body;
  }
  async function project(projectId: string, actor = owner()) {
    const result = await h.request<Project>(`/production/projects/${projectId}`, { cookie: actor.cookie });
    expect(result.status).toBe(200); return result.body;
  }
  async function command(projectId: string, value: unknown, actor = owner()) {
    const current = await project(projectId);
    return h.request<Project>(`/production/projects/${projectId}/commands`, {
      cookie: actor.cookie, body: { expectedRevision: current.aggregate.revision, mutationId: randomUUID(), command: value },
    });
  }
  async function policy(workId: string, actor = owner()) {
    const result = await h.request<StudioScopedWritePolicy>(`/creator/works/${workId}/scoped-write`, { cookie: actor.cookie });
    expect(result.status).toBe(200); return result.body;
  }
  async function manage(workId: string, value: StudioScopedWriteManagementCommand["command"]) {
    const current = await policy(workId);
    const result = await h.request<StudioScopedWritePolicy>(`/creator/works/${workId}/scoped-write`, {
      cookie: owner().cookie, body: { mutationId: randomUUID(), expectedPolicyVersion: current.policyVersion, command: value },
    });
    expect(result.status).toBe(200); return result.body;
  }
  async function captureInput(workId: string, actor: Actor, writeContext?: StudioScopedWriteContext): Promise<StudioReviewPreviewCapture> {
    const current = await shared(workId, actor);
    return { intentId: randomUUID(), workId, sourceServerRevision: current.revision,
      sourceContentDigest: studioReviewPreviewDigest(current.document.doc), pageCount: 1,
      title: "HTTP 업로드 픽셀 fixture", deviceId: "producer-http-test", createdAt: new Date().toISOString(),
      ...(writeContext ? { writeContext } : {}) };
  }
  async function completeCapture(workId: string, actor: Actor, writeContext?: StudioScopedWriteContext) {
    const input = await captureInput(workId, actor, writeContext);
    const prepared = await h.request<StudioReviewPreviewIntent>("/studio-project-graph/review-captures/prepare", { cookie: actor.cookie, body: input });
    expect(prepared.status).toBe(201); expect(prepared.body.writeContext).toEqual(writeContext);
    const intent = prepared.body, form = new FormData();
    form.set("intent", JSON.stringify(intent)); form.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "fixture.png");
    const uploaded = await h.request<{ ordinal: number; sha256: string }>("/studio-project-graph/review-captures/pages/0", {
      method: "PUT", cookie: actor.cookie, body: form,
    });
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(200);
    const retryUpload = await h.request("/studio-project-graph/review-captures/pages/0", { method: "PUT", cookie: actor.cookie, body: form });
    expect(retryUpload.status).toBe(200); expect(retryUpload.body).toEqual(uploaded.body);
    const body = { intent, pages: [{ ordinal: 0, sha256: uploaded.body.sha256 }] };
    const completed = await h.request<{ status: string; subject: Subject }>("/studio-project-graph/review-captures/complete", { cookie: actor.cookie, body });
    expect(completed.status).toBe(201); expect(completed.body.status).toBe("completed");
    const status = await h.request<{ status: string; subject: Subject }>("/studio-project-graph/review-captures/status", { cookie: actor.cookie, body: intent });
    expect(status.status).toBe(201); expect(status.body).toEqual(completed.body);
    const retried = await h.request("/studio-project-graph/review-captures/complete", { cookie: actor.cookie, body });
    expect(retried.status).toBe(201); expect(retried.body).toEqual(completed.body);
    return { subject: completed.body.subject, intent, sha256: uploaded.body.sha256 };
  }

  async function fixture() {
    const actor = viewer(), projectId = randomUUID();
    const created = await h.request<{ id: string; revision: number }>("/creator/works", { cookie: owner().cookie,
      body: { title: "공개 API 생성 원고", format: "cuttoon", status: "draft", cover: "", pages: [], doc: manuscript() } });
    expect(created.status, JSON.stringify(created.body)).toBe(201); const workId = created.body.id; workIds.push(workId);
    for (const [member, memberRole] of [[viewer(), "viewer"]] as const) {
      const invited = await h.request<Team>(`/creator/works/${workId}/team`, { cookie: owner().cookie, body: { userId: member.id, role: memberRole } });
      expect(invited.status).toBe(201);
      const pendingMember = invited.body.members.find((entry) => entry.userId === member.id);
      expect(pendingMember).toMatchObject({ userId: member.id, role: memberRole, status: "pending" });
      expect(pendingMember).not.toHaveProperty("invitationId");
      const inbox = await h.request<CreatorCollaborationInvitation[]>("/creator/team/invitations?limit=50", {
        method: "GET", cookie: member.cookie,
      });
      expect(inbox.status).toBe(200);
      const pendingInvitations = inbox.body.filter((entry) => entry.workId === workId);
      expect(pendingInvitations).toHaveLength(1);
      const invitation = pendingInvitations[0];
      if (!invitation) throw new Error("초대받은 계정의 공개 inbox에 현재 작품 초대가 없습니다.");
      expect(invitation.role).toBe(memberRole);
      const accepted = await h.request<CreatorCollaborationInvitationResponse>(`/creator/works/${workId}/team/invitations/respond`, {
        cookie: member.cookie, body: { action: "accept", invitationId: invitation.invitationId },
      });
      expect(accepted.status).toBe(201);
      expect(accepted.body).toEqual({ workId, role: memberRole, status: "active" });
    }
    const made = await h.request<Project>("/production/projects", { cookie: owner().cookie, body: { projectId, workId,
      title: "공개 API 제작 프로젝트", collaborationModel: "studio-production", ownerPartyId: "owner-party",
      ownerDisplayName: "제작 관리자", clientMutationId: randomUUID() } });
    expect(made.status).toBe(201);
    const initial = made.body.aggregate, ownerParty = initial.parties.find((party) => party.accountUserId === owner().id);
    const ownerRole = initial.assignments.find((assignment) => assignment.partyId === ownerParty?.id);
    if (!ownerParty || !ownerRole) throw new Error("공개 프로젝트의 소유자 역할이 없습니다.");
    const scope = { kind: "cut" as const, id: "production-cut", ancestors: [{ kind: "project" as const, id: projectId }] };
    const now = (await h.pool.query<{ now: Date }>("SELECT clock_timestamp() AS now")).rows[0]!.now.getTime();
    const startsAt = new Date(now - 86_400_000).toISOString(), endsAt = new Date(now + 86_400_000).toISOString();
    expect((await command(projectId, { type: "configure-collaboration", parties: [...initial.parties,
      { ...ownerParty, id: "worker-party", accountUserId: actor.id, publicDisplayName: "담당자", internalDisplayName: "담당자" }],
      assignments: [...initial.assignments, { ...ownerRole, id: "worker-role", partyId: "worker-party", roleType: "line-artist", scope,
        startsAt, endsAt, lead: false, status: "active" }], authorityRules: initial.authorityRules,
    })).status).toBe(201);
    expect((await command(projectId, { type: "configure-workflow", profile: createProductionWorkflowProfile(projectId, "studio", new Date(now).toISOString()),
      expectedWorkflowRevision: 0 })).status).toBe(201);
    const task = (id: string): ProductionTask => ({ id, projectId, scope, processKey: "line-art", title: id, status: "draft", priority: "normal",
      assignmentIds: ["worker-role"], reviewerAssignmentIds: [], inputRevisionRefs: [], outputDeliverableIds: [], dependencyTaskIds: [],
      dueAt: null, estimateHours: null, completionCriteria: ["담당 선화 확인"], briefBlocks: [], sourceAgreementMilestoneId: null });
    for (const id of ["registration-task", "current-task"]) expect((await command(projectId, { type: "upsert-task", task: task(id) })).status).toBe(201);
    const source = await completeCapture(workId, owner());
    await manage(workId, { type: "register-target", target: { id: "target", productionProjectId: projectId, taskId: "registration-task", scope,
      pageId: "page", frameId: "frame-own", layerId: null, entities: [{ kind: "stroke", id: "own" }], source: source.subject } });
    const current = await manage(workId, { type: "grant", id: "worker-grant", productionProjectId: projectId, assignmentId: "worker-role",
      taskId: "current-task", targetIds: ["target"], startsAt: new Date(now - 7_200_000).toISOString(),
      endsAt: new Date(now + 3_600_000).toISOString() });
    const context: StudioScopedWriteContext = { version: 1, policyVersion: current.policyVersion, grantIds: ["worker-grant"], creations: [], restorations: [] };
    expect(current.targets[0]?.definition.taskId).toBe("registration-task"); expect(current.grants[0]?.taskId).toBe("current-task");
    expect((await shared(workId, actor)).capabilities).toEqual({ view: true, edit: false });
    expect((await policy(workId, actor)).scopedWrite).toBe(true);
    return { workId, projectId, actor, context, source };
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  function saveBody(current: Shared, context: StudioScopedWriteContext, doc: Record<string, unknown> = changedStroke(current.document.doc, "own")) {
    return { baseRevision: current.revision, crdtServerSequence: current.crdtServerSequence, doc, mutationId: randomUUID(), writeContext: context };
  }
  function submit(f: Fixture, subject = f.source.subject, frameId = "frame-own") {
    return { type: "submit-task-output", taskId: "current-task", submissionId: `submission-${randomUUID()}`,
      submittedByAssignmentId: "worker-role", documentRole: "lineart", source: { subject },
      selection: { mode: "frames", pages: [{ pageId: "page", ordinal: 0, frameIds: [frameId] }] },
      inputs: { mode: "initial-capture", source: { subject: f.source.subject } },
      target: { kind: "create", deliverableId: `deliverable-${randomUUID()}`, type: "line-art", expectedFormat: "PNG", completionCriteria: ["선화 확인"] },
      writeContext: f.context };
  }
  async function approveScopedTask(f: Fixture) {
    const capture = await completeCapture(f.workId, f.actor, f.context), submitted = submit(f, capture.subject);
    const result = await command(f.projectId, submitted, f.actor);
    expect(result.status).toBe(201);
    const aggregate = result.body.aggregate, task = aggregate.tasks.find((entry) => entry.id === "current-task");
    const output = aggregate.submissions.find((entry) => entry.id === submitted.submissionId);
    const ownerParty = aggregate.parties.find((entry) => entry.accountUserId === owner().id);
    const ownerRole = aggregate.assignments.find((entry) => entry.partyId === ownerParty?.id);
    if (!task || !output || !ownerRole) throw new Error("실제 제출 작업·원고·검수 계정 배정이 없습니다.");
    const reviewerId = "owner-review-role";
    const reviewer = await command(f.projectId, { type: "configure-collaboration", parties: aggregate.parties,
      assignments: [...aggregate.assignments, { ...ownerRole, id: reviewerId, roleType: "editor", lead: false }],
      authorityRules: aggregate.authorityRules });
    expect(reviewer.status, "실제 검수자 배정").toBe(201);
    const reviewPolicy = { id: "current-task-review", projectId: f.projectId, scope: task.scope,
      responseDueHours: 24, expiredReviewAction: "escalate", quorumBasis: "accounts",
      lanes: [{ lane: "production", eligibleAssignmentIds: [reviewerId], requiredAssignmentIds: [reviewerId],
        quorum: 1, vetoAssignmentIds: [], blocksPublication: true }] };
    expect((await command(f.projectId, { type: "upsert-review-policy", policy: reviewPolicy })).status, "계정 기준 필수 검수 정책").toBe(201);
    expect((await command(f.projectId, { type: "upsert-task", task: { ...task, reviewerAssignmentIds: [reviewerId] } })).status, "작업 검수자 연결").toBe(201);
    for (const [fromStatus, toStatus] of [["draft", "ready"], ["ready", "in-progress"]]) {
      expect((await command(f.projectId, { type: "transition-task-batch", transitions: [{ taskId: task.id, fromStatus, toStatus }] })).status,
        `작업 상태 ${fromStatus} → ${toStatus}`).toBe(201);
    }
    expect((await command(f.projectId, { type: "upsert-submission", submission: { ...output, status: "in-review" } })).status, "제출본 검수 시작").toBe(201);
    expect((await command(f.projectId, { type: "transition-task-batch", transitions: [
      { taskId: task.id, fromStatus: "in-progress", toStatus: "internal-review" },
    ] })).status, "작업 내부 검수 시작").toBe(201);
    expect((await command(f.projectId, { type: "record-review-decision", policyId: reviewPolicy.id, decision: {
      id: "current-task-approved", reviewRoundId: output.id, lane: "production", assignmentId: reviewerId,
      value: "approve", reasonCode: "checked", evidenceScopeRefs: [task.scope], conditions: [], createdAt: new Date().toISOString(),
    } })).status, "실제 검수 계정의 승인 결정").toBe(201);
    const approved = await command(f.projectId, { type: "upsert-submission", submission: {
      ...output, status: "approved", evidenceRefs: ["current-task-approved"],
    } });
    expect(approved.status, "현재 제출본의 승인 확정").toBe(201);
    const persisted = (await project(f.projectId)).aggregate;
    expect(persisted.tasks.find((entry) => entry.id === task.id)?.status).toBe("approved");
    expect(persisted.submissions.find((entry) => entry.id === output.id)).toMatchObject({ status: "approved", sourceEvidence: output.sourceEvidence });
    expect(persisted.deliverables.find((entry) => entry.id === output.deliverableId)?.approvedSubmissionId).toBe(output.id);
    return persisted;
  }

  async function pipelineConfiguration(f: Fixture, prefix = "pipeline"): Promise<StudioRolePipelineConfiguration> {
    const aggregate = (await project(f.projectId)).aggregate, template = aggregate.tasks.find((task) => task.id === "current-task");
    if (!template) throw new Error("실제 제작 작업이 없습니다.");
    const stageTasks = STUDIO_ROLE_PIPELINE_STAGE_IDS.map((stageId, index) => ({ stageId,
      taskId: prefix === "pipeline" && index === 0 ? "current-task" : `${prefix}-${stageId}` }));
    for (const { taskId } of stageTasks.filter((entry) => entry.taskId !== "current-task")) {
      expect((await command(f.projectId, { type: "upsert-task", task: { ...template, id: taskId, status: "draft",
        outputDeliverableIds: [], inputRevisionRefs: [], dependencyTaskIds: [], reviewerAssignmentIds: [] } })).status).toBe(201);
    }
    return { productionProjectId: f.projectId, roleBindings: [{ roleId: "creator", assignmentId: "worker-role" }],
      groupMappings: [{ groupId: "story-notes", targetIds: ["target"] }], stageTasks };
  }
  async function enablePipeline(f: Fixture) {
    const configuration = await pipelineConfiguration(f);
    const current = await manage(f.workId, { type: "configure-role-pipeline", configuration });
    const actorPolicy = await policy(f.workId, f.actor);
    const grant = actorPolicy.grants.find((entry) => entry.id.startsWith("role-pipeline:") && entry.actorUserId === f.actor.id && entry.revokedAt === null);
    if (!grant) throw new Error("실제 직군 연결로 만든 현재 공정 배정이 없습니다.");
    f.context = { ...f.context, policyVersion: current.policyVersion, grantIds: [grant.id] };
    return configuration;
  }

  it.each(["editor", "viewer"] as const)("두 실계정이 같은 캔버스에서 담당 편집·타계정 차단·실제 인계·재로그인을 유지한다 (%s)", async (workerRole) => {
    const f = await fixture();
    expect((await h.request(`/creator/works/${f.workId}/team/members/${f.actor.id}`, { method: "PATCH", cookie: owner().cookie, body: { role: workerRole } })).status).toBe(200);
    const { chromium } = await import("playwright");
    const { mkdir, writeFile } = await import("node:fs/promises");
    const artifactDir = ".qa/rbac-canvas/" + workerRole;
    await mkdir(artifactDir, { recursive: true });
    await writeFile(".qa/rbac-canvas/accounts.json", JSON.stringify(actors.map(({ email, password }) => ({ email, password }))), { mode: 0o600 });
    const browserServer = await chromium.launchServer({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH });
    await writeFile(".qa/rbac-canvas/browser.endpoint", browserServer.wsEndpoint(), { mode: 0o600 });
    const browser = await chromium.connect(browserServer.wsEndpoint());
    const pages: import("playwright").Page[] = [];
    const savePatches = new Map<import("playwright").Page, Record<string, unknown>>();
    const liveProof = new Map<import("playwright").Page, { synced: boolean; mappedSent: number; mappedAck: number; rejected: number }>();
    const open = async (actor: Actor) => {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "ko-KR", serviceWorkers: "block" });
      const page = await context.newPage(); pages.push(page);
      const proof = { synced: false, mappedSent: 0, mappedAck: 0, rejected: 0 }; liveProof.set(page, proof);
      page.on("websocket", (socket) => {
        const events = new Map<string, string>(), mapped = new Set<string>();
        socket.on("framesent", ({ payload }) => { if (typeof payload !== "string") return; const index = payload.indexOf("["); if (index < 0) return;
          try { const wire = JSON.parse(payload.slice(index)), event = wire[0], id = /,(\d+)$/u.exec(payload.slice(0, index))?.[1];
            if (typeof event === "string") { if (id) { events.set(id, event); if (event === "studio:crdt:update:binary:v1" && wire[1]?.writeContext) { mapped.add(id); proof.mappedSent++; } } if (/studio:(?:crdt|op)/u.test(event)) process.stderr.write(JSON.stringify({ sent: event, context: Boolean(wire[1]?.writeContext), creations: wire[1]?.writeContext?.creations?.length, restorations: wire[1]?.writeContext?.restorations?.length, grants: wire[1]?.writeContext?.grantIds?.length, keys: Object.keys(wire[1] ?? {}) }) + "\n"); }
          } catch { process.stderr.write("Canvas 이진 제어 프레임\n"); }
        });
        socket.on("framereceived", ({ payload }) => { if (typeof payload !== "string" || !/^4[36]/u.test(payload)) return; const index = payload.indexOf("[");
          try { const ack = JSON.parse(payload.slice(index))?.[0], id = /,(\d+)$/u.exec(payload.slice(0, index))?.[1]; if (ack?.ok && id && events.get(id) === "studio:crdt:sync:binary:v1") proof.synced = true; if (id && mapped.has(id) && ack?.ok) proof.mappedAck++; if (ack?.ok === false) proof.rejected++; if (id && /studio:(?:crdt|op)/u.test(events.get(id) ?? "")) process.stderr.write(JSON.stringify({ ack: id ? events.get(id) : undefined, ok: ack?.ok, binary: payload.startsWith("46"), dataKeys: Object.keys(ack?.data ?? {}), fragmentCount: ack?.data?.fragmentCount, wireBytes: ack?.data?.wireBytes, code: ack?.code, message: typeof ack?.message === "string" ? ack.message.slice(0, 180) : undefined }) + "\n"); }
          catch { process.stderr.write("Canvas ACK 프레임 형식 확인 실패\n"); }
        });
      });
      page.on("request", (request) => { if (request.method() === "PATCH" && /\/team\/document$/u.test(new URL(request.url()).pathname)) { const body: unknown = request.postDataJSON(); if (body && typeof body === "object") savePatches.set(page, body as Record<string, unknown>); } });
      page.on("response", async (response) => {
        if (response.status() !== 403 || !new URL(response.url()).pathname.endsWith("/team/document")) return;
        const body: unknown = await response.json();
        if (body && typeof body === "object") await writeFile(artifactDir + "/rest-denial.json", JSON.stringify({
          status: 403, code: Reflect.get(body, "code") as unknown, message: Reflect.get(body, "message") as unknown,
        }));
      });
      page.on("response", (response) => { const path = new URL(response.url()).pathname; if (/^\/api\/(?:creator|auth|studio-project-graph)/u.test(path)) process.stderr.write(JSON.stringify({ canvasHttp: path.replace(/[a-f0-9]{8}-[a-f0-9-]{27,}/gu, ":fixture"), status: response.status() }) + "\n"); });
      page.on("pageerror", (error) => { process.stderr.write(JSON.stringify({ canvasError: error.name, message: error.message.slice(0, 500) }) + "\n"); });
      const login = await context.request.post(browserOrigin + "/api/auth/login", {
        headers: { Origin: browserOrigin!, "x-toonstudio-csrf": "1" }, data: { email: actor.email, password: actor.password }, timeout: 30_000,
      });
      expect(login.status()).toBe(201);
      actor.cookie = (await context.cookies(browserOrigin!)).map(({ name, value }) => `${name}=${value}`).join("; ");
      if (!actor.cookie) throw new Error("실제 브라우저 로그인 세션이 없습니다.");
      await page.goto(browserOrigin + "/studio/work/" + f.workId + "/canvas", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await expect.poll(() => proof.synced, { timeout: 120_000 }).toBe(true);
      await page.getByText("변경 동기화 완료", { exact: true }).first().waitFor({ timeout: 120_000 });
      const sqlite = await page.evaluate(`(async () => { const runtime = await import("/src/domains/creator/studio-local-database-runtime.ts"); return await runtime.probeStudioLocalDatabaseRuntime(); })()`);
      await writeFile(artifactDir + `/sqlite-runtime-${pages.length}.json`, JSON.stringify(sqlite));
      expect(sqlite).toEqual({ wasm: true, opfs: true });
      return page;
    };
      const draw = async (page: import("playwright").Page, x: number) => {
        await page.bringToFront();
        const surface = page.locator("[data-studio-post-processing-scope] .konvajs-content:visible").first();
        await surface.waitFor({ state: "visible", timeout: 120_000 });
        const box = await page.evaluate<{ x: number; y: number; width: number; height: number }>(`(async () => {
          const {studioKonvaRuntime: runtime} = await import("/src/domains/creator/render/studio-konva-runtime.ts");
          const stage = runtime.stages.find((node) => node.container().closest("[data-studio-post-processing-scope]"));
          const paper = stage?.findOne(".bg");
          if (!paper) throw new Error("실제 원고 종이 노드가 없습니다.");
          const rect = paper.getClientRect(), container = stage.container().getBoundingClientRect();
          return {x: container.x + rect.x, y: container.y + rect.y, width: rect.width, height: rect.height};
        })()`);
        const path = await page.evaluate(({ box, x }) => {
          for (const y of [0.12, 0.1, 0.2, 0.26, 0.32, 0.04]) {
            const start = { x: box.x + box.width * x, y: box.y + box.height * y };
            const end = { x: box.x + box.width * (x + 0.08), y: box.y + box.height * (y + 0.04) };
            const clear = Array.from({ length: 9 }, (_, index) => {
              const ratio = index / 8, element = document.elementFromPoint(start.x + (end.x - start.x) * ratio, start.y + (end.y - start.y) * ratio);
              return element?.tagName === "CANVAS" && Boolean(element.closest("[data-studio-post-processing-scope]"));
            }).every(Boolean);
            if (clear) return { start, end };
          }
          return null;
        }, { box, x });
        if (!path) throw new Error("요청한 실제 frame 안에 HUD에 가리지 않은 원고 pointer 경로가 없습니다.");
        await page.mouse.move(path.start.x, path.start.y);
        await page.mouse.down();
        await page.mouse.move(path.end.x, path.end.y, { steps: 8 });
        await page.mouse.up();
      };
      const counters = async () => (await h.pool.query<{ revision: number; updates: number }>(
        'SELECT revision,((SELECT count(*) FROM creator_work_crdt_update WHERE "workId"=creator_work.id)+(SELECT count(*) FROM creator_work_op_log WHERE "workId"=creator_work.id))::int AS updates FROM creator_work WHERE id=$1', [f.workId])).rows[0]!;
    try {
      // Web 앱 안에서 정본 직렬화기를 사용하고 실제 소유자 쓰기로 기존 원고를 초기화한다.
      const setupContext = await browser.newContext();
      try {
        const setup = await setupContext.newPage();
        await setup.goto(browserOrigin!, { waitUntil: "domcontentloaded" });
        const bytes = await setup.evaluate<number[]>(`(async (source) => {
          const prefix = "/src/domains/creator/live/";
          const { StudioCrdtDocument } = await import(prefix + "studio-crdt-document.ts");
          const bridge = await import(prefix + "studio-crdt-page-bridge.ts");
          const document = new StudioCrdtDocument();
          try {
            for (const page of source.pagesList) {
              document.addPage(bridge.studioPageToCrdtPage(page));
              for (const element of page.elements) {
                if (element.type === "draw") document.addStroke(bridge.studioDrawElementToCrdtStroke(page.id, element));
                else document.addSceneElement(bridge.studioElementToCrdtSceneElement(page.id, element));
              }
            }
            return Array.from(document.encodeStateAsUpdate());
          } finally { document.destroy(); }
        })(${JSON.stringify(manuscript())})`);
        const seed = new Y.Doc();
        try {
          Y.applyUpdate(seed, Uint8Array.from(bytes));
          const initial = await shared(f.workId);
          const canonical = materializeStudioAuthoringFromCrdt({ baseline: initial.document.doc, doc: seed });
          expect(canonical.pagesList).toHaveLength(1);
          expect((canonical.pagesList as Array<{ elements: Array<{ id: string }> }>)[0]!.elements.map((entry) => entry.id)).toEqual(manuscript().pagesList[0]!.elements.map((entry) => entry.id));
          for (const id of ["own", "outside", "frame-own", "frame-outside"]) expect(element(canonical, id)).toMatchObject(element(manuscript(), id));
          const seeded = await h.crdt.applyUpdateBytes({ workId: f.workId, actorUserId: owner().id, updateId: randomUUID(), data: Uint8Array.from(bytes) });
          expect((await h.request(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: owner().cookie,
            body: { baseRevision: initial.revision, crdtServerSequence: seeded.serverSequence, doc: canonical } })).status).toBe(200);
          expect((await shared(f.workId)).document.doc).toEqual(canonical);
          expect((await h.crdt.syncBytes(f.workId)).serverSequence).toBe(seeded.serverSequence);
        } finally { seed.destroy(); }
      } finally { await setupContext.close(); }
      const manager = await open(owner());
      await manager.locator("[data-studio-post-processing-scope] .konvajs-content:visible").first().waitFor({ timeout: 180_000 });
      await manager.keyboard.press("b");
      const baseline = await counters();
      await draw(manager, 0.7);
      await expect.poll(async () => (await counters()).updates, { timeout: 30_000 }).toBeGreaterThan(baseline.updates);
      await manager.screenshot({ path: artifactDir + "/owner-control-drawn.png" });
      await manager.getByRole("button", { name: "초안 저장", exact: true }).click();
      await expect.poll(async () => (await counters()).revision, { timeout: 30_000 }).toBeGreaterThan(baseline.revision);
      await manager.screenshot({ path: artifactDir + "/owner-before-protection.png" });
      await enablePipeline(f);
      const actorPolicy = await policy(f.workId, f.actor);
      await writeFile(artifactDir + "/worker-policy.json", JSON.stringify({ fullEdit: actorPolicy.fullEdit, scopedWrite: actorPolicy.scopedWrite, access: actorPolicy.rolePipelineAccess }, null, 2));
      const worker = await open(f.actor);
      await worker.screenshot({ path: artifactDir + "/worker-initial.png" });
      await manager.screenshot({ path: artifactDir + "/manager-initial.png" });
      await writeFile(artifactDir + "/worker-dom.txt", await worker.locator("body").innerText());
      await worker.getByRole("region", { name: "담당 원고 편집", exact: true }).waitFor({ timeout: 180_000 });
      await worker.screenshot({ path: artifactDir + "/worker-ready.png" });
      await writeFile(artifactDir + "/worker-dom-ready.txt", await worker.locator("body").innerText());
      const select = worker.getByRole("region", { name: "담당 원고 편집", exact: true }).locator("select");
      await select.selectOption(JSON.stringify(["target", f.context.grantIds[0]]));
      await worker.getByRole("button", { name: "이 범위에서 그리기", exact: true }).click();
      await worker.screenshot({ path: artifactDir + "/worker-selected.png" });
      const stage = worker.locator("[data-studio-post-processing-scope] .konvajs-content:visible").first();
      await stage.waitFor({ state: "visible", timeout: 180_000 });
      expect(await worker.getByText("올바르지 않은 ToonStudio 프로젝트 파일입니다.", { exact: true }).count()).toBe(0);
      await worker.getByText("맞춤", { exact: true }).click();
      await worker.getByRole("button", { name: "이 범위에서 그리기", exact: true }).click();
      const before = await counters(), beforeWorker = await shared(f.workId);
      const beforeIds = new Set((beforeWorker.document.doc.pagesList as Array<{ elements: Array<{ id: string }> }>).flatMap((page) => page.elements.map((entry) => entry.id)));
      let workerCreation: { id: string; points: number[] } | undefined;
      await draw(worker, 0.2);
      await worker.screenshot({ path: artifactDir + "/worker-drawn.png" });
      await expect.poll(async () => (await counters()).updates, { timeout: 30_000 }).toBeGreaterThan(before.updates);
      await expect.poll(() => liveProof.get(worker)?.mappedAck ?? 0, { timeout: 30_000 }).toBeGreaterThan(0);
      const afterPointer = await policy(f.workId, f.actor), canonicalSync = await h.crdt.syncBytes(f.workId);
      const serverDocument = new Y.Doc();
      try {
        Y.applyUpdate(serverDocument, canonicalSync.update);
        const projected = materializeStudioAuthoringFromCrdt({ baseline: (await shared(f.workId)).document.doc, doc: serverDocument });
        const originalIds = beforeIds;
        const fresh = (projected.pagesList as Array<{ elements: Array<{ id: string; type: string; points?: number[]; frameClipId?: string }> }>).flatMap((page) => page.elements).filter((entry) => !originalIds.has(entry.id));
        await writeFile(artifactDir + "/server-pointer.json", JSON.stringify({ count: fresh.length, shapes: fresh.map((entry) => ({type: entry.type, samples: entry.points?.length})), owned: afterPointer.ownedEntities.length }));
        expect(fresh).toHaveLength(1);
        const created = fresh[0]!;
        expect(created).toMatchObject({ type: "draw", frameClipId: "frame-own" });
        expect(created.points!.length).toBeGreaterThan(4);
        workerCreation = { id: created.id, points: created.points! };
      } finally { serverDocument.destroy(); }
      const saveButton = worker.getByRole("button", { name: "공동 저장", exact: true });
      await expect.poll(() => saveButton.isEnabled(), { timeout: 20_000 }).toBe(true);
      await saveButton.click();
      await expect.poll(async () => (await counters()).revision, { timeout: 30_000 }).toBeGreaterThan(before.revision);
      const saved = await shared(f.workId, f.actor);
      expect(liveProof.get(worker)?.rejected).toBe(0);
      const pointerLiveProof = { ...liveProof.get(worker)! };
      if (!workerCreation) throw new Error("실제 pointer의 서버 승인 획이 없습니다.");
      expect(element(saved.document.doc, workerCreation.id).points).toEqual(workerCreation.points);
      await worker.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
      await worker.getByText("변경 동기화 완료", { exact: true }).first().waitFor({ timeout: 120_000 });
      const refreshedScope = worker.getByRole("region", { name: "담당 원고 편집", exact: true });
      await refreshedScope.locator("select").selectOption(JSON.stringify(["target", f.context.grantIds[0]]));
      expect(element((await shared(f.workId, f.actor)).document.doc, workerCreation.id).points).toEqual(workerCreation.points);
      await worker.screenshot({ path: artifactDir + "/worker-refreshed.png" });
      await manager.goto(browserOrigin + "/studio/work/" + f.workId + "/canvas", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await manager.locator("[data-studio-post-processing-scope] .konvajs-content:visible").first().waitFor({ timeout: 180_000 });
      await manager.getByText("변경 동기화 완료", { exact: true }).first().waitFor({ timeout: 120_000 });
      await manager.getByText("맞춤", { exact: true }).click(); await manager.keyboard.press("b");
      const protectedBefore = protectedEntities((await shared(f.workId)).document.doc);
      const ownDenied = await counters(); await draw(manager, 0.2);
      await manager.screenshot({ path: artifactDir + "/manager-denied.png" });
      await new Promise((resolve) => setTimeout(resolve, 750));
      expect(await counters()).toEqual(ownDenied);
      const managerCurrent = await shared(f.workId);
      const forged = await h.request(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: owner().cookie, body: saveBody(managerCurrent, f.context) });
      expect(forged.status).toBe(403);
      await draw(manager, 0.7);
      await expect.poll(async () => (await counters()).updates, { timeout: 30_000 }).toBeGreaterThan(ownDenied.updates);
      await manager.getByRole("button", { name: "초안 저장", exact: true }).click();
      await expect.poll(async () => (await counters()).revision, { timeout: 30_000 }).toBeGreaterThan(ownDenied.revision);
      expect(protectedEntities((await shared(f.workId)).document.doc)).toEqual(protectedBefore);
      const approved = await approveScopedTask(f);
      const approvedPolicy = await policy(f.workId, f.actor), approvedWork = await shared(f.workId, f.actor);
      expect(approvedPolicy.rolePipelineAccess?.frozenTargetIds).toContain("target");
      const frozenContext = { ...f.context, policyVersion: approvedPolicy.policyVersion };
      const approvedBoundary = await counters();
      expect((await h.request(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: f.actor.cookie,
        body: saveBody(approvedWork, frozenContext) })).status).toBe(403);
      // UI를 우회해도 실제 인증된 Socket.IO gateway가 승인 원고 쓰기를 거절해야 한다.
      const ticket = await h.request<{ ticket: string }>("/creator/studio-live/auth-ticket", { cookie: f.actor.cookie, body: { version: 1 } });
      expect(ticket.status).toBe(200);
      const { io } = await import("socket.io-client");
      const socket = io(h.base + "/studio-live", { transports: ["websocket"], reconnection: false, autoConnect: false, timeout: 8_000,
        auth: { sessionToken: ticket.body.ticket }, extraHeaders: { Origin: browserOrigin! } });
      const deniedDocument = new Y.Doc();
      try {
        await new Promise<void>((resolve, reject) => { socket.once("connect", resolve); socket.once("connect_error", reject); socket.connect(); });
        expect(await socket.timeout(8_000).emitWithAck("studio:join", { workId: f.workId, clientInstanceId: randomUUID() })).toMatchObject({ ok: true });
        Y.applyUpdate(deniedDocument, (await h.crdt.syncBytes(f.workId)).update);
        const vector = Y.encodeStateVector(deniedDocument);
        deniedDocument.getMap<Y.Map<unknown>>("strokes").get("own")!.set("stroke", "#ff0000");
        const { STUDIO_CRDT_PROTOCOL_VERSION, StudioLiveCrdtUpdateSchema } = await import("./studio-live.protocol");
        const packet = StudioLiveCrdtUpdateSchema.parse({ protocolVersion: STUDIO_CRDT_PROTOCOL_VERSION,
          workId: f.workId, updateId: randomUUID(), clientSequence: 1,
          update: Buffer.from(Y.encodeStateAsUpdate(deniedDocument, vector)).toString("base64"), writeContext: frozenContext });
        const deniedAck = await socket.timeout(8_000).emitWithAck("studio:crdt:update", packet);
        expect(deniedAck).toMatchObject({ ok: false, code: "forbidden" });
        await writeFile(artifactDir + "/approved-boundary.json", JSON.stringify({ restStatus: 403, liveAck: { ok: false, code: "forbidden" } }));
      } finally { socket.disconnect(); deniedDocument.destroy(); }
      expect(await counters()).toEqual(approvedBoundary);
      const next = approved.tasks.find((task) => task.id === "pipeline-storyboard-conte"), submission = approved.submissions.find((entry) => entry.status === "approved");
      if (!next || !submission) throw new Error("다음 공정과 승인 제출본이 없습니다.");
      expect((await command(f.projectId, { type: "upsert-task", task: { ...next, dependencyTaskIds: ["current-task"], inputRevisionRefs: [submission.revisionRef] } })).status).toBe(201);
      await worker.goto(browserOrigin + "/production/projects/" + f.projectId + "/settings", { waitUntil: "domcontentloaded", timeout: 120_000 });
      await worker.getByText("실제 원고의 담당 편집 범위 배정", { exact: true }).click();
      const panel = worker.getByRole("region", { name: "실제 직군별 원고 보호", exact: true });
      await panel.getByRole("button", { name: "승인된 제출을 확인하고 실제 다음 공정으로 인계", exact: true }).click();
      await expect.poll(async () => (await policy(f.workId, f.actor)).rolePipeline?.activeStageId).toBe("storyboard-conte");
      expect((await policy(f.workId, f.actor)).rolePipeline?.frozenStageIds).toContain("story-script");
      await panel.screenshot({ path: artifactDir + "/worker-handed-off.png" });
      const logout = await worker.context().request.post(browserOrigin + "/api/auth/logout", { headers: { Origin: browserOrigin!, "x-toonstudio-csrf": "1" }, data: {} });
      expect(logout.status()).toBe(201);
      expect((await h.request(`/creator/works/${f.workId}/scoped-write`, { cookie: f.actor.cookie })).status).toBe(403);
      await worker.context().close();
      const relogged = await open(f.actor);
      await relogged.getByRole("region", { name: "담당 원고 편집", exact: true }).getByText(/인계·승인되어 잠긴 원고 범위/).waitFor({ timeout: 180_000 });
      expect(await relogged.getByRole("region", { name: "담당 원고 편집", exact: true }).locator("option").count()).toBe(1);
      const frozen = await counters();
      await relogged.keyboard.press("b");
      await draw(relogged, 0.2);
      await new Promise((resolve) => setTimeout(resolve, 750));
      expect(await counters()).toEqual(frozen);
      await relogged.screenshot({ path: artifactDir + "/worker-relogged-frozen.png" });
      const currentFrozen = await policy(f.workId, f.actor), frozenWork = await shared(f.workId, f.actor);
      expect((await h.request(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: f.actor.cookie,
        body: saveBody(frozenWork, { ...f.context, policyVersion: currentFrozen.policyVersion }) })).status).toBe(403);
      expect((await manager.context().request.post(browserOrigin + "/api/auth/logout", { headers: { Origin: browserOrigin!, "x-toonstudio-csrf": "1" }, data: {} })).status()).toBe(201);
      await manager.context().close();
      const ownerRelogged = await open(owner());
      const ownerFrozen = await counters();
      await ownerRelogged.keyboard.press("b"); await draw(ownerRelogged, 0.2);
      await new Promise((resolve) => setTimeout(resolve, 750));
      expect(await counters()).toEqual(ownerFrozen);
      expect((await shared(f.workId)).document.doc).toEqual(frozenWork.document.doc);
      await ownerRelogged.screenshot({ path: artifactDir + "/owner-relogged-protected.png" });
      await writeFile(artifactDir + "/flow-proof.json", JSON.stringify({ workerRole, livePointer: pointerLiveProof,
        laterPermissionOrSessionRejections: liveProof.get(worker)?.rejected,
        setup: { baseline: "정본 Web serializer → OFF 실제 owner 승인 저장", externalTestPorts: ["email", "private-object-storage"], previewCapture: "명시 PNG fixture의 실제 업로드" },
        actualPointerSaved: true, refreshPreserved: true, ownerProtectedScopeDenied: true, ownerUnmappedEditPreserved: true,
        approvedRestAndLiveDenied: true, handoffStage: "storyboard-conte", previousStageFrozen: true,
        bothAccountsRelogged: true, frozenPointersUnchanged: true }, null, 2));
    } catch (error) {
      try {
      const syncFailure = await h.crdt.syncBytes(f.workId), failureDocument = new Y.Doc();
      try {
        Y.applyUpdate(failureDocument, syncFailure.update);
        const baseline = (await h.pool.query<{ doc: Record<string, unknown> }>("SELECT doc FROM creator_work WHERE id=$1", [f.workId])).rows[0]?.doc;
        if (!baseline) throw new Error("시험 원고 진단 기준본이 없습니다.", { cause: error });
        const canonical = materializeStudioAuthoringFromCrdt({ baseline, doc: failureDocument });
        for (const [index, page] of pages.entries()) {
          const patch = savePatches.get(page);
          if (patch) await writeFile(artifactDir + `/save-diff-${index}.json`, JSON.stringify({ fields: Object.keys(patch), paths: diffPaths(canonical, patch.doc) }, null, 2));
        }
      } finally { failureDocument.destroy(); }
      for (const [index, page] of pages.entries()) if (!page.isClosed()) {
        await page.screenshot({ path: `${artifactDir}/failure-${index}.png` });
        await writeFile(`${artifactDir}/failure-${index}.txt`, await page.locator("body").innerText());
      }
      } catch (diagnosticError) { process.stderr.write(JSON.stringify({ diagnosticFailure: diagnosticError instanceof Error ? diagnosticError.name : typeof diagnosticError }) + "\n"); }
      throw error;
    } finally { for (const page of pages) await page.context().close(); await browser.close(); await browserServer.close(); }
  }, 600_000);
});
function element(doc: Record<string, unknown>, id: string): Record<string, unknown> {
  if (!Array.isArray(doc.pagesList)) throw new Error("fixture 원고 페이지가 없습니다.");
  for (const page of doc.pagesList as unknown[]) {
    if (!page || typeof page !== "object") throw new Error("fixture 페이지 형식 오류");
    const elements: unknown = Reflect.get(page, "elements");
    if (!Array.isArray(elements)) throw new Error("fixture 요소 목록 오류");
    const found: unknown = (elements as unknown[]).find((value) => value !== null && typeof value === "object" && Reflect.get(value, "id") === id);
    if (found && typeof found === "object") return found as Record<string, unknown>;
  }
  throw new Error("fixture 원고의 실제 요소 ID가 없습니다.");
}
function changedStroke(doc: Record<string, unknown>, id: string, color = "#ff0000") {
  const result = structuredClone(doc); element(result, id).stroke = color; return result;
}

function protectedEntities(doc: Record<string, unknown>): unknown[] {
  if (!Array.isArray(doc.pagesList)) throw new Error("원고 페이지가 없습니다.");
  return (doc.pagesList as Array<{ elements: Array<{ id: string; frameClipId?: string }> }>).flatMap((page) => page.elements)
    .filter((entry) => entry.id === "frame-own" || entry.frameClipId === "frame-own");
}

function diffPaths(left: unknown, right: unknown, path = "$", out: string[] = []): string[] {
  if (JSON.stringify(left) === JSON.stringify(right) || out.length >= 100) return out;
  if (left && right && typeof left === "object" && typeof right === "object") {
    for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) diffPaths(Reflect.get(left, key), Reflect.get(right, key), path + "." + key, out);
  } else out.push(path);
  return out;
}

