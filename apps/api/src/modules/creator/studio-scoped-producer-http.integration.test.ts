import "reflect-metadata";
import type { INestApplication, LoggerService } from "@nestjs/common";
import type { AddressInfo } from "node:net";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { Pool } from "pg";
import { Image, encodePng } from "image-js";
import * as Y from "yjs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ProductionProjectAggregate, ProductionTask } from "@toonstudio/core/production";
import { createProductionWorkflowProfile } from "@toonstudio/contracts/production-workflow";
import { STUDIO_ROLE_PIPELINE_STAGE_IDS, type StudioRolePipelineConfiguration } from "@toonstudio/contracts/studio-role-pipeline";
import type { StudioScopedWriteContext, StudioScopedWriteManagementCommand, StudioScopedWritePolicy,
  StudioScopedWriteSourceSchema } from "@toonstudio/contracts/studio-scoped-write";
import { materializeStudioAuthoringFromCrdt } from "@toonstudio/contracts/studio-crdt-authoring";
import type { z } from "zod";
import { validatePostgresIntegrationUrl } from "../../../../../scripts/run-postgres-integration-tests.mjs";
import type { PrivateObjectStoragePort } from "../../platform/adapters/private-object-storage/private-object-storage.port";
import type { StudioCrdtService } from "./studio-crdt.service";
import type { CreatorCollaborationInvitation, CreatorCollaborationInvitationResponse } from "./creator-collaboration.repository";
import { hasValidStudioCrdtRootSchema } from "./studio-crdt-root-schema";
import { studioReviewPreviewDigest, type StudioReviewPreviewCapture,
  type StudioReviewPreviewIntent } from "../studio-project-graph/studio-review-preview-producer.contract";

const url = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim() || process.env.TEST_DATABASE_URL?.trim();
const browserOrigin = process.env.TOONSTUDIO_RBAC_BROWSER_ORIGIN?.trim();
if (browserOrigin) {
  const parsed = new URL(browserOrigin);
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !parsed.port || parsed.username || parsed.password) throw new Error("화면 검증은 명시 포트의 loopback 웹에서만 실행합니다.");
}
if (process.env.CI && !url) throw new Error("공개 제한 편집 producer 검증에는 준비된 로컬 PostgreSQL URL이 필요합니다.");
type Actor = { id: string; email: string; password: string; cookie: string };
type Subject = z.infer<typeof StudioScopedWriteSourceSchema>;
type Shared = { workId: string; revision: number; crdtServerSequence: string; role: string;
  capabilities: { view: boolean; edit: boolean }; document: { doc: Record<string, unknown>; cover: string; pages: string[] } };
type Project = { aggregate: ProductionProjectAggregate; access: { view: boolean; edit: boolean; manage: boolean } };
type Saved = { workId: string; revision: number; updatedAt: string };
type Team = { members: Array<{ userId: string; role: string; status: string; invitationId?: string }> };

// PNG는 명시적인 업로드 픽셀 fixture다. 실제 Canvas 렌더·Socket.IO·브라우저 C8 증거를 대신하지 않는다.
const png = Buffer.from(encodePng(new Image(2, 1, {
  data: new Uint8Array([20, 30, 40, 255, 60, 70, 80, 255]), colorModel: "RGBA",
})));
const manuscript = () => ({ version: 3, width: 2, pagesList: [{ id: "page", canvasH: 1, elements: [
  { id: "own", type: "draw", points: [0.1, 0.1, 0.8, 0.8], stroke: "#111111", strokeWidth: 0.1, noClip: false, frameClipId: "frame-own" },
  { id: "outside", type: "draw", points: [1.1, 0.1, 1.8, 0.8], stroke: "#222222", strokeWidth: 0.1, noClip: false, frameClipId: "frame-outside" },
  { id: "frame-own", type: "frame", x: 0, y: 0, width: 1, height: 1, rotation: 0 },
  { id: "frame-outside", type: "frame", x: 1, y: 0, width: 1, height: 1, rotation: 0 },
] }] });

describe.skipIf(!url)("공개 HTTP producer로 배정한 제한 원고의 PostgreSQL 인계", () => {
  let h: Awaited<ReturnType<typeof createHarness>>;
  const actors: Actor[] = [], workIds: string[] = [];
  const owner = () => actors[0]!, viewer = () => actors[1]!, commenter = () => actors[2]!;
  beforeAll(async () => {
    h = await createHarness(url!, workIds);
    for (const name of ["제작 관리자", "담당 열람자", "담당 댓글자"]) {
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
  }, 60_000);
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
    expect(uploaded.status).toBe(200);
    const body = { intent, pages: [{ ordinal: 0, sha256: uploaded.body.sha256 }] };
    const completed = await h.request<{ status: string; subject: Subject }>("/studio-project-graph/review-captures/complete", { cookie: actor.cookie, body });
    expect(completed.status).toBe(201); expect(completed.body.status).toBe("completed");
    const status = await h.request<{ status: string; subject: Subject }>("/studio-project-graph/review-captures/status", { cookie: actor.cookie, body: intent });
    expect(status.status).toBe(201); expect(status.body).toEqual(completed.body);
    const retried = await h.request("/studio-project-graph/review-captures/complete", { cookie: actor.cookie, body });
    expect(retried.status).toBe(201); expect(retried.body).toEqual(completed.body);
    return { subject: completed.body.subject, intent, sha256: uploaded.body.sha256 };
  }

  async function fixture(role: "viewer" | "commenter" = "viewer", expired = false) {
    const actor = role === "viewer" ? viewer() : commenter(), projectId = randomUUID();
    const created = await h.request<{ id: string; revision: number }>("/creator/works", { cookie: owner().cookie,
      body: { title: "공개 API 생성 원고", format: "cuttoon", status: "draft", cover: "", pages: [], doc: manuscript() } });
    expect(created.status).toBe(201); const workId = created.body.id; workIds.push(workId);
    for (const [member, memberRole] of [[viewer(), "viewer"], [commenter(), "commenter"]] as const) {
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
      endsAt: new Date(now + (expired ? -3_600_000 : 3_600_000)).toISOString() });
    const context: StudioScopedWriteContext = { version: 1, policyVersion: current.policyVersion, grantIds: ["worker-grant"], creations: [], restorations: [] };
    expect(current.targets[0]?.definition.taskId).toBe("registration-task"); expect(current.grants[0]?.taskId).toBe("current-task");
    expect((await shared(workId, actor)).capabilities).toEqual({ view: true, edit: false });
    expect((await policy(workId, actor)).scopedWrite).toBe(!expired);
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
  async function durableWrite(f: Fixture, binary = false) {
    const current = await shared(f.workId, f.actor), doc = new Y.Doc();
    try {
      addStroke(doc, "own", "#ff0000"); expect(hasValidStudioCrdtRootSchema(doc)).toBe(true);
      const updateId = randomUUID(), data = Y.encodeStateAsUpdate(doc);
      // 실제 서비스 + Drizzle append다. HTTP/Socket 인증이나 브라우저 이벤트 통과로 표현하지 않는다.
      const request = { workId: f.workId, actorUserId: f.actor.id, updateId, data, writeContext: f.context };
      const applied = binary ? await h.crdt.applyUpdateBytes(request)
        : await h.crdt.applyUpdate({ ...request, data: Buffer.from(data).toString("base64") });
      expect(applied).toMatchObject({ duplicate: false, updateId });
      expect(BigInt(applied.serverSequence)).toBeGreaterThan(0n);
      const projected = materializeStudioAuthoringFromCrdt({ baseline: current.document.doc, doc });
      if (!projected || typeof projected !== "object" || Array.isArray(projected)) throw new Error("공용 원고 투영 실패");
      const body = saveBody({ ...current, crdtServerSequence: applied.serverSequence }, f.context, projected as Record<string, unknown>);
      const saved = await h.request<Saved>(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: f.actor.cookie, body });
      const errorBody: unknown = saved.body;
      const errorCode = errorBody !== null && typeof errorBody === "object" && !Array.isArray(errorBody)
        ? Reflect.get(errorBody, "code") : undefined;
      const errorMessage = errorBody !== null && typeof errorBody === "object" && !Array.isArray(errorBody)
        ? Reflect.get(errorBody, "message") : undefined;
      const publicError = { ...(typeof errorCode === "string" ? { code: errorCode.slice(0, 160) } : {}),
        ...(typeof errorMessage === "string" ? { message: errorMessage.slice(0, 500) } : {}) };
      expect(saved.status, `팀 원고 저장 응답: ${JSON.stringify(publicError)}`).toBe(200);
      expect(saved.body.revision).toBe(current.revision + 1);
      expect(new Date(saved.body.updatedAt).toISOString()).toBe(saved.body.updatedAt);
      return { request, body, saved: saved.body, serverSequence: applied.serverSequence };
    } finally { doc.destroy(); }
  }
  async function state(f: Fixture) {
    const rows = await h.pool.query(`SELECT work.revision,work.doc,
      (SELECT count(*)::int FROM creator_work_crdt_update WHERE "workId"=work.id) AS updates,
      (SELECT count(*)::int FROM creator_work_scoped_write_receipt WHERE "workId"=work.id AND kind='rest') AS saves,
      (SELECT count(*)::int FROM creator_work_scoped_write_receipt WHERE "workId"=work.id AND kind='submission') AS submissions
      FROM creator_work work WHERE work.id=$1`, [f.workId]);
    return rows.rows[0];
  }

  it.each(["viewer", "commenter"] as const)("%s가 실제 캡처·target·현재 task grant로 저장하고 고정 원고를 제출한다", async (role) => {
    const f = await fixture(role), initial = await shared(f.workId, f.actor);
    expect((await h.request(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: f.actor.cookie,
      body: { baseRevision: initial.revision, crdtServerSequence: initial.crdtServerSequence, doc: initial.document.doc } })).status).toBe(403);
    await durableWrite(f, role === "commenter");
    const derived = await completeCapture(f.workId, f.actor, f.context), submitted = submit(f, derived.subject);
    const currentProject = await project(f.projectId), submissionBody = { expectedRevision: currentProject.aggregate.revision, mutationId: randomUUID(), command: submitted };
    const submissionRoute = `/production/projects/${f.projectId}/commands`;
    const result = await h.request<Project>(submissionRoute, { cookie: f.actor.cookie, body: submissionBody });
    const submissionError: unknown = result.body;
    const submissionCode = submissionError !== null && typeof submissionError === "object" && !Array.isArray(submissionError)
      ? Reflect.get(submissionError, "code") : undefined;
    const submissionMessage = submissionError !== null && typeof submissionError === "object" && !Array.isArray(submissionError)
      ? Reflect.get(submissionError, "message") : undefined;
    const publicSubmissionError = { ...(typeof submissionCode === "string" ? { code: submissionCode.slice(0, 160) } : {}),
      ...(typeof submissionMessage === "string" ? { message: submissionMessage.slice(0, 500) } : {}) };
    expect(result.status, `작업물 제출 응답: ${JSON.stringify(publicSubmissionError)}`).toBe(201);
    const retried = await h.request<Project>(submissionRoute, { cookie: f.actor.cookie, body: submissionBody });
    expect(retried.status).toBe(201); expect(retried.body).toEqual(result.body);
    const output = result.body.aggregate.submissions.find((entry) => entry.id === submitted.submissionId);
    expect(output).toMatchObject({ submittedByAssignmentId: "worker-role", revisionRef: { productionSubmissionId: submitted.submissionId },
      sourceEvidence: { taskId: "current-task", subject: derived.subject, sourceServerRevision: 2, selectionMode: "frames",
        pages: [{ pageId: "page", ordinal: 0, frameIds: ["frame-own"], sha256: derived.sha256 }] } });
    expect(output?.sourceEvidence?.captureSequence).toBeGreaterThan(0);
    expect(output?.inputRevisionRefs[0]?.digest).toBe(`sha256:${f.source.subject.rootGraphHash}`);
    const saved = await shared(f.workId, f.actor);
    expect(saved.role).toBe(role); expect(saved.capabilities.edit).toBe(false);
    expect(saved.document.cover).toBe(initial.document.cover); expect(saved.document.pages).toEqual(initial.document.pages);
    expect(element(saved.document.doc, "outside")).toEqual(element(initial.document.doc, "outside"));
    expect(await state(f)).toMatchObject({ revision: 2, updates: 1, saves: 1, submissions: 1 });
  }, 30_000);

  it("실제 cookie/CSRF와 담당 컷 경계에서 외부 저장·CRDT·제출을 원자적으로 거절한다", async () => {
    const f = await fixture(), current = await shared(f.workId, f.actor), before = await state(f);
    const body = saveBody(current, f.context, changedStroke(current.document.doc, "outside"));
    const attempts: Array<{ cookie?: string; body: typeof body; headers?: Record<string, string> }> = [
      { cookie: f.actor.cookie, body },
      { body, headers: { "x-user-id": owner().id } },
      { cookie: f.actor.cookie, body, headers: { "x-toonstudio-csrf": "" } },
      { cookie: f.actor.cookie, body, headers: { Origin: "https://untrusted.example" } },
    ];
    for (const options of attempts) expect((await h.request(`/creator/works/${f.workId}/team/document`, { ...options, method: "PATCH" })).status).toBe(403);
    const y = new Y.Doc();
    try {
      addStroke(y, "outside", "#ff0000");
      await expect(h.crdt.applyUpdateBytes({ workId: f.workId, actorUserId: f.actor.id, updateId: randomUUID(),
        data: Y.encodeStateAsUpdate(y), writeContext: f.context })).rejects.toMatchObject({ code: "scope" });
    } finally { y.destroy(); }
    expect((await command(f.projectId, submit(f, f.source.subject, "frame-outside"), f.actor)).status).toBe(403);
    expect(await state(f)).toEqual(before);
  }, 30_000);

  it("공개 API로 만든 만료 grant는 다른 현재 선택을 추정하지 않고 모든 새 writer를 거절한다", async () => {
    const f = await fixture("viewer", true), before = await state(f), current = await shared(f.workId, f.actor);
    expect((await h.request(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: f.actor.cookie,
      body: saveBody(current, f.context) })).status).toBe(403);
    await expectDeniedCrdt(f);
    expect((await h.request("/studio-project-graph/review-captures/prepare", { cookie: f.actor.cookie,
      body: await captureInput(f.workId, f.actor, f.context) })).status).toBe(403);
    expect((await command(f.projectId, submit(f), f.actor)).status).toBe(403);
    expect(await state(f)).toEqual(before);
  }, 30_000);

  it("Production 역할 회수는 살아 있는 viewer 세션과 기존 outbox context에도 즉시 적용한다", async () => {
    const f = await fixture(), current = await project(f.projectId), before = await state(f);
    const prepared = await h.request<StudioReviewPreviewIntent>("/studio-project-graph/review-captures/prepare", {
      cookie: f.actor.cookie, body: await captureInput(f.workId, f.actor, f.context),
    });
    expect(prepared.status).toBe(201);
    const form = new FormData(); form.set("intent", JSON.stringify(prepared.body));
    form.set("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "fixture.png");
    const page = await h.request<{ sha256: string }>("/studio-project-graph/review-captures/pages/0", { method: "PUT", cookie: f.actor.cookie, body: form });
    expect(page.status).toBe(200);
    expect((await command(f.projectId, { type: "configure-collaboration", parties: current.aggregate.parties,
      assignments: current.aggregate.assignments.map((role) => role.id === "worker-role" ? { ...role, status: "paused" } : role),
      authorityRules: current.aggregate.authorityRules })).status).toBe(201);
    expect((await h.request("/auth/session", { cookie: f.actor.cookie })).status).toBe(200);
    expect((await shared(f.workId, f.actor)).role).toBe("viewer"); expect((await policy(f.workId, f.actor)).scopedWrite).toBe(false);
    expect((await h.request(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: f.actor.cookie,
      body: saveBody(await shared(f.workId, f.actor), f.context) })).status).toBe(403);
    await expectDeniedCrdt(f);
    expect((await h.request("/studio-project-graph/review-captures/prepare", { cookie: f.actor.cookie,
      body: await captureInput(f.workId, f.actor, f.context) })).status).toBe(403);
    expect((await h.request("/studio-project-graph/review-captures/complete", { cookie: f.actor.cookie,
      body: { intent: prepared.body, pages: [{ ordinal: 0, sha256: page.body.sha256 }] } })).status).toBe(403);
    expect((await h.request("/studio-project-graph/review-captures/status", { cookie: f.actor.cookie, body: prepared.body })).status).toBe(403);
    expect((await h.request("/studio-project-graph/review-captures/cancel", { cookie: f.actor.cookie, body: { intent: prepared.body } })).status).toBe(403);
    expect((await command(f.projectId, submit(f), f.actor)).status).toBe(403);
    expect(await state(f)).toEqual(before);
  }, 30_000);

  async function approveScopedTask(f: Fixture) {
    await durableWrite(f);
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

  it("실제 제출본의 검수 승인은 이전 담당 작업의 새 저장·CRDT·재제출을 차단한다", async () => {
    const f = await fixture(), persisted = await approveScopedTask(f);
    expect((await policy(f.workId, f.actor)).scopedWrite).toBe(false);
    const before = await state(f), current = await shared(f.workId, f.actor);
    expect((await h.request(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: f.actor.cookie,
      body: saveBody(current, f.context, changedStroke(current.document.doc, "own", "#00ff00")) })).status).toBe(403);
    await expectDeniedCrdt(f);
    expect((await command(f.projectId, submit(f), f.actor)).status).toBe(403);
    expect(await state(f)).toEqual(before);
    expect((await project(f.projectId)).aggregate).toEqual(persisted);
  }, 30_000);

  it("재로그인과 새 정책 조회는 담당 범위와 저장 원고를 복원하고 회수된 역할을 다시 허용하지 않는다", async () => {
    const f = await fixture(), initial = await shared(f.workId, f.actor), assigned = await policy(f.workId, f.actor);
    const relogin = async () => {
      const oldCookie = f.actor.cookie;
      expect((await h.request("/auth/logout", { cookie: oldCookie, body: {} })).status).toBe(201);
      expect((await h.request(`/creator/works/${f.workId}/scoped-write`, { cookie: oldCookie })).status).toBe(403);
      const login = await h.request<{ user: { id: string } }>("/auth/login", {
        body: { email: f.actor.email, password: f.actor.password },
      });
      expect(login.status).toBe(201); expect(login.body.user.id).toBe(f.actor.id);
      if (!login.cookie) throw new Error("재로그인 세션 쿠키가 없습니다.");
      f.actor.cookie = login.cookie;
    };
    await relogin();
    expect(await policy(f.workId, f.actor)).toEqual(assigned);
    expect(await shared(f.workId, f.actor)).toEqual(initial);
    await durableWrite(f);
    const saved = await shared(f.workId, f.actor), before = await state(f);
    expect(element(saved.document.doc, "own").stroke).toBe("#ff0000");
    expect(element(saved.document.doc, "outside")).toEqual(element(initial.document.doc, "outside"));
    expect((await h.request(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: f.actor.cookie,
      body: saveBody(saved, f.context, changedStroke(saved.document.doc, "outside")) })).status).toBe(403);
    const current = await project(f.projectId);
    expect((await command(f.projectId, { type: "configure-collaboration", parties: current.aggregate.parties,
      assignments: current.aggregate.assignments.map((role) => role.id === "worker-role" ? { ...role, status: "paused" } : role),
      authorityRules: current.aggregate.authorityRules })).status).toBe(201);
    await relogin();
    expect((await policy(f.workId, f.actor)).scopedWrite).toBe(false);
    expect(await shared(f.workId, f.actor)).toEqual(saved);
    expect((await h.request(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: f.actor.cookie,
      body: saveBody(saved, f.context, changedStroke(saved.document.doc, "own", "#00ff00")) })).status).toBe(403);
    await expectDeniedCrdt(f);
    expect(await state(f)).toEqual(before);
  }, 30_000);

  it("같은 UUID의 ACK·본문 충돌·다른 계정과 grant 회수 후 새 실행을 실제 영수증으로 구분한다", async () => {
    const f = await fixture(), written = await durableWrite(f), route = `/creator/works/${f.workId}/team/document`;
    const replay = () => h.request<Saved>(route, { method: "PATCH", cookie: f.actor.cookie, body: written.body });
    expect((await replay()).body).toEqual(written.saved);
    expect(await h.crdt.applyUpdateBytes(written.request)).toMatchObject({ duplicate: true, serverSequence: written.serverSequence });
    expect((await h.request(route, { method: "PATCH", cookie: f.actor.cookie,
      body: { ...written.body, doc: changedStroke(written.body.doc, "own", "#00ff00") } })).status).toBe(409);
    expect((await h.request(route, { method: "PATCH", cookie: commenter().cookie, body: written.body })).status).toBe(409);
    await expect(h.crdt.applyUpdateBytes({ ...written.request, actorUserId: commenter().id })).rejects.toMatchObject({ code: "policy" });
    const altered = new Y.Doc();
    try { addStroke(altered, "own", "#00ff00");
      await expect(h.crdt.applyUpdateBytes({ ...written.request, data: Y.encodeStateAsUpdate(altered) })).rejects.toMatchObject({ status: 409 });
    } finally { altered.destroy(); }
    await manage(f.workId, { type: "revoke-grant", grantId: "worker-grant" });
    // REST는 이미 성공한 같은 actor/body의 ACK만 재현한다. CRDT는 현재 policy로 재검사한다.
    const acknowledged = await replay(); expect(acknowledged.status).toBe(200); expect(acknowledged.body).toEqual(written.saved);
    expect((await h.request(route, { method: "PATCH", cookie: f.actor.cookie,
      body: { ...written.body, mutationId: randomUUID() } })).status).toBe(409);
    await expect(h.crdt.applyUpdateBytes(written.request)).rejects.toMatchObject({ status: 409 });
    expect(await state(f)).toMatchObject({ revision: 2, updates: 1, saves: 1, submissions: 0 });
  }, 30_000);

  it("작품 멤버십 회수 후 과거 성공 UUID로 원고·캡처·제출을 재노출하지 않는다", async () => {
    const f = await fixture(), written = await durableWrite(f), before = await state(f);
    const prepared = await captureInput(f.workId, f.actor, f.context);
    expect((await h.request(`/creator/works/${f.workId}/team/members/${f.actor.id}`, { method: "DELETE", cookie: owner().cookie })).status).toBe(200);
    expect((await h.request("/auth/session", { cookie: f.actor.cookie })).status).toBe(200);
    expect((await h.request(`/creator/works/${f.workId}/team/document`, { cookie: f.actor.cookie })).status).toBe(403);
    for (const body of [written.body, { ...written.body, mutationId: randomUUID() }]) {
      expect((await h.request(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: f.actor.cookie, body })).status).toBe(403);
    }
    await expect(h.crdt.applyUpdateBytes(written.request)).rejects.toMatchObject({ status: 403 });
    expect((await h.request("/studio-project-graph/review-captures/prepare", { cookie: f.actor.cookie, body: prepared })).status).toBe(403);
    expect((await command(f.projectId, submit(f), f.actor)).status).toBe(403);
    expect(await state(f)).toEqual(before);
  }, 30_000);

  async function expectDeniedCrdt(f: Fixture) {
    const doc = new Y.Doc();
    try { addStroke(doc, "own", "#ff0000");
      await expect(h.crdt.applyUpdateBytes({ workId: f.workId, actorUserId: f.actor.id, updateId: randomUUID(),
        data: Y.encodeStateAsUpdate(doc), writeContext: f.context })).rejects.toMatchObject({ code: "policy" });
    } finally { doc.destroy(); }
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

  it("명시적 프로젝트 보호는 전체 편집자의 매핑 밖 기능을 보존하고 소유자·직군 사칭도 보호 범위를 우회하지 못한다", async () => {
    const f = await fixture(), configuration = await enablePipeline(f), route = `/creator/works/${f.workId}/team/document`;
    expect((await h.request(`/creator/works/${f.workId}/scoped-write`, { cookie: f.actor.cookie,
      body: { mutationId: randomUUID(), expectedPolicyVersion: f.context.policyVersion, command: { type: "configure-role-pipeline", configuration } } })).status).toBe(403);
    expect((await h.request(`/creator/works/${f.workId}/team/members/${f.actor.id}`, { method: "PATCH", cookie: owner().cookie, body: { role: "editor" } })).status).toBe(200);
    expect((await h.request(`/creator/works/${f.workId}/scoped-write`, { cookie: owner().cookie,
      body: { mutationId: randomUUID(), expectedPolicyVersion: f.context.policyVersion, command: { type: "revoke-target", targetId: "target" } } })).status).toBe(409);
    const oldGrant = (await policy(f.workId, f.actor)).grants.find((grant) => grant.id === f.context.grantIds[0]);
    if (!oldGrant) throw new Error("현재 담당자의 명시 배정이 없습니다.");
    await manage(f.workId, { type: "revoke-grant", grantId: oldGrant.id });
    const renewed = await manage(f.workId, { type: "grant", id: "renewed-editor", productionProjectId: f.projectId,
      assignmentId: oldGrant.assignmentId, taskId: oldGrant.taskId, targetIds: oldGrant.targetIds, startsAt: oldGrant.startsAt, endsAt: oldGrant.endsAt });
    f.context = { ...f.context, policyVersion: renewed.policyVersion, grantIds: ["renewed-editor"] };
    const initial = await shared(f.workId);
    const ordinary = (current: Shared, doc: Record<string, unknown>) => ({ baseRevision: current.revision, crdtServerSequence: current.crdtServerSequence, doc });
    expect((await h.request(route, { method: "PATCH", cookie: owner().cookie, body: ordinary(initial, changedStroke(initial.document.doc, "own")) })).status).toBe(403);
    expect((await h.request(`/creator/works/${f.workId}`, { method: "PATCH", cookie: owner().cookie,
      body: { baseRevision: initial.revision, doc: changedStroke(initial.document.doc, "own") } })).status).toBe(403);
    expect((await h.request(route, { method: "PATCH", cookie: f.actor.cookie,
      body: ordinary(initial, changedStroke(initial.document.doc, "own")) })).status).toBe(403);
    const outside = await h.request(route, { method: "PATCH", cookie: f.actor.cookie,
      body: { ...ordinary(initial, changedStroke(initial.document.doc, "outside")), title: "기존 전체 편집 기능 보존" } });
    expect(outside.status).toBe(200);
    const current = await shared(f.workId, f.actor);
    expect((await h.request(route, { method: "PATCH", cookie: f.actor.cookie,
      body: saveBody(current, f.context, changedStroke(current.document.doc, "own")) })).status).toBe(200);
    expect((await policy(f.workId, f.actor)).fullEdit).toBe(true);
    const reloaded = await policy(f.workId, f.actor);
    expect(reloaded.rolePipeline?.enabled).toBe(true);
    expect(reloaded.rolePipelineAccess?.editableTargetIds).toEqual(["target"]);
    await manage(f.workId, { type: "disable-role-pipeline" });
    const legacy = await shared(f.workId, f.actor);
    expect((await h.request(route, { method: "PATCH", cookie: f.actor.cookie,
      body: ordinary(legacy, changedStroke(legacy.document.doc, "own", "#00ff00")) })).status).toBe(200);
  }, 30_000);

  it("승인·인계 잠금은 정책 끄기·매핑 교체로 풀리지 않고 새 작업의 개정본으로만 재시작한다", async () => {
    const f = await fixture(), configuration = await enablePipeline(f), approved = await approveScopedTask(f);
    const denyManagement = async (command: StudioScopedWriteManagementCommand["command"]) => h.request(`/creator/works/${f.workId}/scoped-write`, {
      cookie: owner().cookie, body: { mutationId: randomUUID(), expectedPolicyVersion: (await policy(f.workId)).policyVersion, command },
    });
    expect((await denyManagement({ type: "disable-role-pipeline" })).status).toBe(409);
    expect((await denyManagement({ type: "configure-role-pipeline", configuration })).status).toBe(409);
    const nextTask = approved.tasks.find((task) => task.id === configuration.stageTasks[1]?.taskId);
    const submission = approved.submissions.find((entry) => entry.status === "approved");
    if (!nextTask || !submission) throw new Error("실제 다음 작업과 승인 입력이 없습니다.");
    expect((await denyManagement({ type: "handoff-role-pipeline", expectedProjectRevision: approved.revision })).status).toBe(400);
    expect((await command(f.projectId, { type: "upsert-task", task: { ...nextTask, dependencyTaskIds: ["current-task"],
      inputRevisionRefs: [submission.revisionRef] } })).status).toBe(201);
    const handed = await manage(f.workId, { type: "handoff-role-pipeline", expectedProjectRevision: (await project(f.projectId)).aggregate.revision });
    expect(handed.rolePipeline).toMatchObject({ activeStageId: "storyboard-conte", frozenStageIds: ["story-script"] });
    const afterHandoff = await shared(f.workId), before = await state(f);
    expect((await h.request(`/creator/works/${f.workId}/team/document`, { method: "PATCH", cookie: owner().cookie,
      body: { baseRevision: afterHandoff.revision, crdtServerSequence: afterHandoff.crdtServerSequence,
        doc: changedStroke(afterHandoff.document.doc, "own", "#00ff00") } })).status).toBe(403);
    expect(await state(f)).toEqual(before);
    const replacement = await pipelineConfiguration(f, "rework");
    const restarted = await manage(f.workId, { type: "restart-role-pipeline", configuration: replacement, expectedWorkRevision: afterHandoff.revision });
    expect(restarted.rolePipeline).toMatchObject({ activeStageId: "story-script", frozenStageIds: [], approvedAt: null });
    expect(restarted.rolePipeline?.history.map((entry) => entry.kind)).toEqual(["handoff", "restart"]);
    expect((await shared(f.workId)).revision).toBe(afterHandoff.revision + 1);
    expect((await project(f.projectId)).aggregate.submissions.find((entry) => entry.id === submission.id)).toEqual(submission);
  }, 30_000);

  it.runIf(Boolean(browserOrigin))("실제 브라우저의 관리자 설정·새로고침과 담당자 재로그인은 같은 API 정책을 유지한다", async () => {
    const f = await fixture(), configuration = await pipelineConfiguration(f);
    const { chromium } = await import("playwright"), { mkdir } = await import("node:fs/promises");
    const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH ?? chromium.executablePath() });
    const contexts: import("playwright").BrowserContext[] = [];
    const open = async (actor: Actor) => {
      const context = await browser.newContext({ locale: "ko-KR", viewport: { width: 1440, height: 1000 }, serviceWorkers: "block" });
      contexts.push(context);
      // 응답 fixture 대신 실제 Nest API로 전달한다. 외부 저장소만 위의 메모리 port를 사용한다.
      await context.route("**/api/**", async (route) => {
        const target = new URL(route.request().url());
        const response = await route.fetch({ url: `${h.base}${target.pathname}${target.search}`, maxRedirects: 0 });
        await route.fulfill({ response });
      });
      const page = await context.newPage();
      await page.goto(`${browserOrigin}/auth/login`, { waitUntil: "domcontentloaded" });
      const form = page.locator('[data-auth-form="true"]'); await form.waitFor({ timeout: 120_000 });
      await form.locator('input[type="email"]').fill(actor.email);
      await form.locator('input[autocomplete="current-password"]').fill(actor.password);
      await form.locator('button[type="submit"]').click();
      await page.getByRole("heading", { name: /이미 로그인되어 있어요|already signed in/iu }).waitFor({ timeout: 60_000 });
      return page;
    };
    const panel = async (page: import("playwright").Page) => {
      await page.goto(`${browserOrigin}/production/projects/${f.projectId}/settings`, { waitUntil: "domcontentloaded" });
      await page.getByText("실제 원고의 담당 편집 범위 배정", { exact: true }).click({ timeout: 120_000 });
      const section = page.getByRole("region", { name: "실제 직군별 원고 보호", exact: true });
      await section.waitFor(); return section;
    };
    try {
      const manager = await open(owner()), section = await panel(manager);
      expect(await section.getByRole("status").textContent()).toContain("꺼짐");
      await section.getByRole("listbox", { name: "제작 직군 총괄 1인작가", exact: true }).selectOption(["worker-role"]);
      await section.getByRole("checkbox", { name: /target$/u }).check();
      for (const mapping of configuration.stageTasks) {
        const label = STUDIO_ROLE_PIPELINE_STAGE_IDS.indexOf(mapping.stageId);
        await section.getByRole("combobox", { name: /^실제 공정/u }).nth(label).selectOption(mapping.taskId);
      }
      await section.getByRole("checkbox", { name: "연결한 실제 범위에 전체 편집자도 포함하는 보호를 적용함을 확인했습니다.", exact: true }).check();
      await section.getByRole("button", { name: "이 프로젝트의 원고 보호 켜기", exact: true }).click();
      await section.getByRole("status").filter({ hasText: "켜짐" }).waitFor();
      expect((await policy(f.workId)).rolePipeline).toMatchObject({ ...configuration, enabled: true });
      await manager.reload({ waitUntil: "domcontentloaded" });
      const restored = await panel(manager); expect(await restored.getByRole("status").textContent()).toContain("켜짐");
      await mkdir(".qa/role-pipeline", { recursive: true });
      await restored.evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
      await manager.screenshot({ path: ".qa/role-pipeline/manager-enabled.png" });
      const { default: AxeBuilder } = await import("@axe-core/playwright");
      const audit = await new AxeBuilder({ page: manager }).include('[aria-label="실제 직군별 원고 보호"]')
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(audit.violations.map((entry) => entry.id)).toEqual([]);
      await manager.setViewportSize({ width: 390, height: 900 });
      expect(await restored.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
      await restored.evaluate((element) => element.scrollIntoView({ block: "start", behavior: "instant" }));
      await manager.screenshot({ path: ".qa/role-pipeline/manager-mobile.png" });
      const worker = await open(f.actor), restricted = await panel(worker);
      expect(await restricted.getByRole("button", { name: "이 프로젝트의 보호 끄기", exact: true }).count()).toBe(0);
      expect(await restricted.getByRole("listbox").count()).toBe(0);
      await worker.context().clearCookies(); await worker.close();
      const relogged = await open(f.actor), current = await panel(relogged);
      expect(await current.getByRole("status").textContent()).toContain("켜짐");
      await relogged.setViewportSize({ width: 390, height: 900 });
      await current.screenshot({ path: ".qa/role-pipeline/worker-relogin-mobile.png" });
    } catch (error) {
      await mkdir(".qa/role-pipeline", { recursive: true });
      for (const [index, context] of contexts.entries()) {
        const page = context.pages().at(-1);
        if (page && !new URL(page.url()).pathname.startsWith("/auth/")) await page.screenshot({ path: `.qa/role-pipeline/failure-${index}.png` });
      }
      throw error;
    } finally { for (const context of contexts) await context.close(); await browser.close(); }
  }, 180_000);
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
function addStroke(doc: Y.Doc, id: "own" | "outside", color: string) {
  const record = new Y.Map<unknown>();
  for (const [key, value] of Object.entries({ id, pageId: "page", layerId: "page-root", status: "finalized", deleted: false,
    payloadVersion: 1, type: "draw", mode: "pen", kind: "freehand", stroke: color, strokeWidth: 0.1,
    extensions: { noClip: false, frameClipId: id === "own" ? "frame-own" : "frame-outside" } })) record.set(key, value);
  record.set("points", Y.Array.from(id === "own" ? [0.1, 0.1, 0.8, 0.8] : [1.1, 0.1, 1.8, 0.8]));
  for (const key of ["pressures", "tiltXs", "tiltYs", "twists", "speeds", "tangentialPressures"]) record.set(key, Y.Array.from([1, 1]));
  doc.getMap<Y.Map<unknown>>("strokes").set(id, record);
  const order = new Y.Map<unknown>();
  for (const [key, value] of Object.entries({ strokeId: id, pageId: "page", layerId: "page-root", active: true })) order.set(key, value);
  doc.getArray<Y.Map<unknown>>("stroke-order").push([order]);
}

async function createHarness(connectionString: string, workIds: string[]) {
  validatePostgresIntegrationUrl(connectionString);
  const originalFetch = globalThis.fetch, outbox = new Map<string, string>(), stored = new Map<string, Buffer>();
  let app: INestApplication | null = null, pool: Pool | null = null, crdt: StudioCrdtService | null = null;
  vi.stubEnv("DATABASE_URL", connectionString); vi.stubEnv("AUTH_SESSION_SECRET", randomBytes(48).toString("base64url"));
  vi.stubEnv("AUTH_EMAIL_PROVIDER", "resend"); vi.stubEnv("AUTH_EMAIL_FROM", "test@example.test");
  vi.stubEnv("RESEND_API_KEY", randomBytes(24).toString("base64url")); vi.stubEnv("WEB_APP_BASE_URL", "http://127.0.0.1:5199");
  vi.stubEnv("STUDIO_WORK_ASSET_ADMISSION", "enable-immutable-readonly-work-assets-v1");
  const close = async () => {
    const failures: unknown[] = [];
    for (const action of [() => app ? app.close() : crdt?.onModuleDestroy(), async () => {
      if (!pool) return;
      const cleanup = await pool.connect();
      try {
        await cleanup.query("BEGIN");
        if (workIds.length) {
          // 불변 revision의 createdBy SET NULL보다 소유 work의 Graph 이력을 먼저 정리한다.
          const revisions = 'SELECT revision.id FROM studio_revision revision JOIN studio_artifact artifact ON artifact.id=revision."artifactId" JOIN studio_project_graph project ON project.id=artifact."projectId" WHERE project."workId"=ANY($1::text[])';
          await cleanup.query(`DELETE FROM studio_review WHERE "revisionId" IN (${revisions})`, [workIds]);
          await cleanup.query(`DELETE FROM studio_revision_parent WHERE "revisionId" IN (${revisions})`, [workIds]);
          await cleanup.query(`DELETE FROM studio_operation WHERE "resultRevisionId" IN (${revisions})`, [workIds]);
          await cleanup.query(`DELETE FROM studio_mutation_receipt WHERE "resultRevisionId" IN (${revisions})`, [workIds]);
          await cleanup.query('DELETE FROM creator_work WHERE id=ANY($1::text[])', [workIds]);
        }
        const emails = [...outbox.keys()];
        await cleanup.query('DELETE FROM "session" WHERE "userId" IN (SELECT id FROM "user" WHERE email=ANY($1::text[]))', [emails]);
        await cleanup.query('DELETE FROM "verificationToken" WHERE identifier=ANY($1::text[])', [emails]);
        await cleanup.query('DELETE FROM "user" WHERE email=ANY($1::text[])', [emails]);
        await cleanup.query("COMMIT");
      } catch (error) { await cleanup.query("ROLLBACK"); throw error; }
      finally { cleanup.release(); }
    }, () => pool?.end()]) { try { await action(); } catch (error) { failures.push(error); } }
    vi.unstubAllGlobals(); vi.unstubAllEnvs(); outbox.clear(); stored.clear();
    if (failures.length) throw new AggregateError(failures, "공개 producer 검증 환경 정리에 실패했습니다.");
  };
  try {
    vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
      const href = input instanceof Request ? input.url : String(input);
      if (href === "https://api.resend.com/emails") {
        const mail = JSON.parse(String(init?.body)) as { to: string[]; text: string };
        const link = mail.text.split("\n").find((line) => line.startsWith("http://127.0.0.1:"));
        const token = link ? new URL(link).searchParams.get("token") : null;
        if (!token || !mail.to[0]) throw new Error("테스트 인증 메일 형식 오류");
        outbox.set(mail.to[0], token); return new Response(JSON.stringify({ id: randomUUID() }));
      }
      if (new URL(href).hostname !== "127.0.0.1") throw new Error("검증 중 외부 통신 차단");
      return originalFetch(input, init);
    });
    const storage: PrivateObjectStoragePort = {
      async verifyPrivatePurposeBuckets() { return { ready: true, privatePurposeBuckets: 3 }; },
      async uploadImmutable(input) {
        const hash = createHash("sha256").update(input.bytes).digest("hex");
        const object = { contractVersion: "toonspectrum.private-object-storage.v2" as const, providerId: "cloudflare-r2" as const,
          purpose: input.purpose, digest: `sha256:${hash}`, objectPath: `sha256/${hash.slice(0, 2)}/${hash}`,
          byteLength: input.bytes.length, contentType: input.contentType };
        stored.set(`${object.purpose}:${object.digest}`, Buffer.from(input.bytes)); return object;
      },
      async createSignedReadUrl({ object, expiresInSeconds }) {
        if (!stored.has(`${object.purpose}:${object.digest}`)) throw new Error("테스트 저장 객체가 없습니다.");
        return { url: `https://preview.invalid/${object.digest.slice(7)}`, expiresAtEpochMs: Date.now() + expiresInSeconds * 1000 };
      },
      async deleteGeneratedObject({ object }) { stored.delete(`${object.purpose}:${object.digest}`); },
    };
    const { dbPool } = await import("../../platform/database"); pool = dbPool;
    const { Module } = await import("@nestjs/common"), { NestFactory } = await import("@nestjs/core"), { json } = await import("express");
    const { AuthController } = await import("../auth/auth.controller");
    const { AUTH_CLIENT_IP_POLICY, AUTH_RATE_LIMIT_CONFIG } = await import("../auth/auth.tokens");
    const { UPSTASH_COORDINATION_PORT } = await import("../../platform/adapters/upstash-coordination/upstash-coordination.port");
    const { StudioRealtimeRevocationService } = await import("../../platform/adapters/studio-realtime-revocation/studio-realtime-revocation.client");
    const { CreatorController } = await import("./creator.controller"), { CreatorService } = await import("./creator.service");
    const { CreatorCollaborationRepository } = await import("./creator-collaboration.repository");
    const { creatorDraftCollaborationRepositoryProvider } = await import("./creator-draft-collaboration.repository");
    const { DrizzleStudioWorkAssetRepository } = await import("./studio-work-asset.repository");
    const { StudioWorkAssetService } = await import("./studio-work-asset.service");
    const { StudioProjectGraphRepository } = await import("../studio-project-graph/studio-project-graph.repository");
    const { StudioReviewPreviewProducerRepository } = await import("../studio-project-graph/studio-review-preview-producer.repository");
    const { StudioReviewPreviewProducerService } = await import("../studio-project-graph/studio-review-preview-producer.service");
    const { StudioReviewPreviewProducerController } = await import("../studio-project-graph/studio-review-preview-producer.controller");
    const { StudioScopedWriteRepository } = await import("./studio-scoped-write.repository");
    const { StudioScopedWriteController, StudioScopedWriteService } = await import("./studio-scoped-write.controller");
    const { ProductionCollaborationRepository } = await import("../production-collaboration/production-collaboration.repository");
    const { ProductionCollaborationService } = await import("../production-collaboration/production-collaboration.service");
    const { ProductionCollaborationController } = await import("../production-collaboration/production-collaboration.controller");
    const { StudioCrdtService: CrdtService } = await import("./studio-crdt.service");
    const { DrizzleStudioCrdtRepository } = await import("./studio-crdt.repository");
    const { StudioRasterAssetService } = await import("./studio-raster-asset.service");
    const { DrizzleStudioRasterAssetRepository } = await import("./studio-raster-asset.repository");
    const { studioCrdtClusterLoadRepositoryProvider } = await import("./studio-crdt-cluster-load.repository");
    const { sessionAuth } = await import("../../session-middleware");
    const { createCsrfProtectionMiddleware } = await import("../../csrf-middleware");
    const revocation = new StudioRealtimeRevocationService({ enabled: false }), assets = new StudioWorkAssetService(new DrizzleStudioWorkAssetRepository(), storage);
    const creator = new CreatorService(new CreatorCollaborationRepository(), creatorDraftCollaborationRepositoryProvider.useFactory(), assets, revocation);
    const preview = new StudioReviewPreviewProducerService(new StudioReviewPreviewProducerRepository(new StudioProjectGraphRepository()), assets);
    const realtime = new CrdtService(new DrizzleStudioCrdtRepository(), new StudioRasterAssetService(new DrizzleStudioRasterAssetRepository()),
      assets, studioCrdtClusterLoadRepositoryProvider.useFactory());
    crdt = realtime;
    @Module({ controllers: [AuthController, CreatorController, ProductionCollaborationController, StudioScopedWriteController, StudioReviewPreviewProducerController],
      providers: [{ provide: AUTH_RATE_LIMIT_CONFIG, useValue: { distributed: false } }, { provide: AUTH_CLIENT_IP_POLICY, useValue: { mode: "direct" } },
        { provide: UPSTASH_COORDINATION_PORT, useValue: null }, { provide: StudioRealtimeRevocationService, useValue: revocation },
        { provide: CreatorService, useValue: creator }, { provide: StudioScopedWriteService, useValue: new StudioScopedWriteService(new StudioScopedWriteRepository()) },
        { provide: ProductionCollaborationService, useValue: new ProductionCollaborationService(new ProductionCollaborationRepository()) },
        { provide: StudioReviewPreviewProducerService, useValue: preview }, { provide: CrdtService, useValue: realtime }] })
    class IntegrationModule {}
    const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
    const diagnosticLogger: LoggerService = {
      log: () => undefined, warn: () => undefined, debug: () => undefined,
      verbose: () => undefined, fatal: () => undefined,
      error(message: unknown, ...details: unknown[]) {
        const unexpectedError = message instanceof Error ? message : undefined;
        const causeType = unexpectedError ? unexpectedError.name.replace(/[^A-Za-z0-9_$.-]/gu, "?").slice(0, 80) : typeof message === "string"
          ? /^Creator collaboration save_shared_document failed for work=.*; cause=([A-Za-z0-9_$?.-]{1,80})$/u.exec(message)?.[1]
          : undefined;
        if (!causeType) return;
        const frames = new Set<string>();
        for (const detail of unexpectedError ? [unexpectedError.stack] : details) {
          if (typeof detail !== "string") continue;
          for (const line of detail.split("\n")) {
            if (!/^\s+at\s/u.test(line)) continue;
            const rootIndex = line.indexOf(repositoryRoot);
            if (rootIndex < 0) continue;
            const frame = /^((?:apps|packages|scripts)\/[A-Za-z0-9_./-]+\.[cm]?[jt]sx?:[1-9]\d*):[1-9]\d*\)?$/u
              .exec(line.slice(rootIndex + repositoryRoot.length))?.[1];
            if (frame && !frame.includes("/node_modules/") && frames.size < 12) frames.add(frame);
          }
        }
        const marker = unexpectedError ? "SCOPED_SUBMISSION_FAILURE" : "SCOPED_SAVE_FAILURE";
        process.stderr.write(`[${marker}] ${JSON.stringify({ causeType, frames: [...frames] })}\n`);
      },
    };
    app = await NestFactory.create(IntegrationModule, { logger: diagnosticLogger, bodyParser: false });
    app.use(sessionAuth); app.use(createCsrfProtectionMiddleware({ NODE_ENV: "test", API_CORS_ALLOWED_ORIGINS: ["http://127.0.0.1:5199", browserOrigin].filter(Boolean).join(",") }));
    app.use(json({ limit: "2mb" })); app.setGlobalPrefix("api"); await app.listen(0, "127.0.0.1");
    const address = app.getHttpServer().address() as AddressInfo, base = `http://127.0.0.1:${address.port}`;
    async function request<T = Record<string, unknown>>(route: string, options: {
      method?: string; body?: unknown; cookie?: string; headers?: Record<string, string>;
    } = {}) {
      const multipart = options.body instanceof FormData;
      const response = await originalFetch(`${base}/api${route}`, {
        method: options.method ?? (options.body === undefined ? "GET" : "POST"), redirect: "error",
        headers: { ...(options.body !== undefined && !multipart ? { "Content-Type": "application/json" } : {}), Origin: "http://127.0.0.1:5199",
          "x-toonstudio-csrf": "1", ...(options.cookie ? { Cookie: options.cookie } : {}), ...options.headers },
        ...(options.body === undefined ? {} : { body: multipart ? options.body as FormData : JSON.stringify(options.body) }), signal: AbortSignal.timeout(15_000),
      });
      return { status: response.status, body: await response.json() as T, cookie: response.headers.get("set-cookie")?.split(";")[0] ?? null };
    }
    return { request, outbox, pool: dbPool, crdt: realtime, close, base };
  } catch (cause) {
    try { await close(); } catch (cleanupError) { throw new AggregateError([cause, cleanupError], "공개 producer 초기화와 정리에 실패했습니다.", { cause: cleanupError }); }
    throw cause;
  }
}
