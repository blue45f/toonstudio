/**
 * 팀 파일럿 템플릿 — 순수 모델 + 저장소.
 *
 * 문제 (근거 사례):
 * - Mighty Studios는 ShotGrid를 팀 전체에 한 번에 깔지 않고 파일럿으로
 *   도입해 검증한 순서를 파이프라인으로 굳혔다 (Cartoon Brew 사례).
 * - ORKA는 전면 도입이 실패한 뒤 파일럿부터 다시 시작해 성공했다
 *   (Autodesk ShotGrid 성공 사례).
 * 즉 협업 도입의 실패는 도구 문제가 아니라 "검증 없이 전파"하는 순서
 * 문제다. 빈 프로젝트로 기능을 눌러 보는 것으로는 초대 메일이 실제로
 * 닿는지, 합류자가 권한 안에서 첫 화면을 여는지, 검수·승인이 실제로
 * 기록되는지를 알 수 없다.
 *
 * 이 모듈이 제공하는 것:
 * 1. 파일럿 템플릿 — 실제 회차 1건을 만드는 명세(컷 수·공정·검수 레인·
 *    초대 역할)와 초대→합류→제작→검수→승인 5단계 체크포인트.
 *    각 체크포인트는 "무엇이 보이면 통과인가"(successSignal)를 가진다.
 * 2. 파일럿 실행(run) — 단계는 순서대로만 완료할 수 있다. 앞 단계가
 *    끝나지 않았는데 다음 단계를 완료로 표시할 수 없게 해서, 검증이
 *    실제로 일어난 순서가 기록으로 남는다.
 * 3. 팀 기본 템플릿 고정 — 완료된 실행만 템플릿으로 승격할 수 있다.
 *    성공하지 않은 순서는 팀 기본값이 될 수 없다. 고정된 템플릿으로는
 *    다음 프로젝트·다음 팀원 온보딩 파일럿을 같은 명세로 다시 시작한다.
 *
 * 저장 방식은 플레이북·복선 장부와 같은 관례(워크스페이스별
 * localStorage 키, 파서로 검증한 스냅샷, 업데이트 이벤트)를 따른다.
 * 서버 동기화는 후속이며, 데이터 모양은 워크스페이스 id를 모든
 * 레코드에 박아 둬 이관 시 그대로 쓸 수 있다.
 */
import type { InvitableWorkspaceRole } from "@toonstudio/contracts/production-workspace";
import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import type { ReviewLane } from "@toonstudio/core/production";

import type { StudioProjectDiagnosticSourceStorage } from "../studio-project-diagnostic-source-store";
import type { BilingualLabel } from "./production-labels";

/* ------------------------------------------------------------------ */
/* 체크포인트 정의                                                      */
/* ------------------------------------------------------------------ */

/**
 * 파일럿 체크포인트 순서 — 초대→합류→제작→검수→승인.
 * 제작 단계가 가운데 있는 이유: 검수할 실물이 없으면 검수·승인 단계는
 * 빈 화면을 눌러 보는 것으로 끝나 검증이 되지 않기 때문이다.
 */
export const PILOT_STEP_IDS = [
  "invite",
  "join",
  "produce",
  "review",
  "approve",
] as const;

export type PilotStepId = (typeof PILOT_STEP_IDS)[number];

export interface PilotStepDefinition {
  readonly id: PilotStepId;
  /** 누가 이 단계를 수행하는가. */
  readonly actor: BilingualLabel;
  readonly label: BilingualLabel;
  /** 이 단계가 무엇을 검증하는가. */
  readonly purpose: BilingualLabel;
  /** 무엇이 보이면 통과인가 — 체크포인트 판정 기준. */
  readonly successSignal: BilingualLabel;
}

export const PILOT_STEP_DEFINITIONS: readonly PilotStepDefinition[] = Object.freeze([
  {
    id: "invite",
    actor: { ko: "팀 관리자", en: "Team manager" },
    label: { ko: "초대 보내기", en: "Send the invite" },
    purpose: {
      ko: "파일럿 회차를 함께 만들 사람을 역할과 함께 초대합니다. 초대가 실제 메일·링크로 닿는지부터 확인합니다.",
      en: "Invite the people who will make the pilot episode, with roles. First check the invite actually arrives by mail or link.",
    },
    successSignal: {
      ko: "초대한 사람의 이름과 역할이 팀 구성원 목록의 '초대 중'에 보입니다.",
      en: "The invited person's name and role appear as pending in the member list.",
    },
  },
  {
    id: "join",
    actor: { ko: "초대받은 사람", en: "The invitee" },
    label: { ko: "합류 확인", en: "Confirm the join" },
    purpose: {
      ko: "초대받은 사람이 직접 수락해 팀에 들어오고, 자기 권한으로 파일럿 작품을 열 수 있는지 확인합니다. 관리자가 대신 눌러 주면 검증이 아닙니다.",
      en: "The invitee accepts in person, joins the team, and can open the pilot work with their own access. A manager clicking through for them is not a pilot.",
    },
    successSignal: {
      ko: "합류한 사람이 구성원 목록에 '활동 중'으로 보이고, 본인 화면에서 파일럿 회차가 열립니다.",
      en: "The joined person shows as active in the member list, and the pilot episode opens on their own screen.",
    },
  },
  {
    id: "produce",
    actor: { ko: "합류한 작업자", en: "The joined creator" },
    label: { ko: "파일럿 회차 작업 제출", en: "Submit pilot work" },
    purpose: {
      ko: "합류한 작업자가 파일럿 회차의 목표 컷을 실제로 작업해 제출합니다. 검수할 실물이 생기는 단계입니다.",
      en: "The joined creator actually produces and submits the pilot episode's target cuts. This creates something real to review.",
    },
    successSignal: {
      ko: "공정 보드에 파일럿 회차의 제출물이 목표 컷 수만큼 쌓여 있습니다.",
      en: "The process board holds submissions for the pilot episode up to the target cut count.",
    },
  },
  {
    id: "review",
    actor: { ko: "검수자", en: "The reviewer" },
    label: { ko: "검수 한 바퀴", en: "One review round" },
    purpose: {
      ko: "검수자가 제출물에 핀·의견을 남기고 검수 결정을 요청합니다. 지적이 말로만 오가지 않고 회차에 기록으로 남는지 확인합니다.",
      en: "The reviewer leaves pins and notes on the submission and requests a decision. Check that feedback lands as records on the episode, not just in chat.",
    },
    successSignal: {
      ko: "파일럿 회차에 검수 핀 1건 이상과 검수 요청이 기록돼 있습니다.",
      en: "The pilot episode holds at least one review pin and a review request.",
    },
  },
  {
    id: "approve",
    actor: { ko: "승인권자", en: "The approver" },
    label: { ko: "승인으로 닫기", en: "Close with approval" },
    purpose: {
      ko: "승인권자가 검수 레인에서 승인을 기록해 파일럿 회차를 닫습니다. 초대부터 승인까지 전 과정이 기록으로 이어졌는지가 파일럿의 판정입니다.",
      en: "The approver records approval on the review lane and closes the pilot episode. The pilot passes only if the whole chain from invite to approval is on record.",
    },
    successSignal: {
      ko: "파일럿 회차가 승인 완료 상태이고, 이 실행의 다섯 단계가 모두 완료로 표시됩니다.",
      en: "The pilot episode is approved, and all five steps of this run show complete.",
    },
  },
]);

export function pilotStepDefinition(stepId: PilotStepId): PilotStepDefinition {
  const definition = PILOT_STEP_DEFINITIONS.find((entry) => entry.id === stepId);
  if (!definition) throw new Error(`Unknown pilot step: ${stepId}`);
  return definition;
}

/* ------------------------------------------------------------------ */
/* 파일럿 명세와 내장 템플릿                                             */
/* ------------------------------------------------------------------ */

/** 파일럿 회차 1건의 명세. 템플릿과 실행이 공유한다. */
export interface PilotEpisodeSpec {
  readonly episodeTitle: BilingualLabel;
  /** 검수할 실물이 생기는 최소 작업량. 너무 크면 파일럿이 본작업이 된다. */
  readonly targetCuts: number;
  /** 파일럿에서 돌려 볼 공정 (canonical 키). */
  readonly processKeys: readonly string[];
  /** 파일럿에서 돌려 볼 검수 레인. */
  readonly reviewLanes: readonly ReviewLane[];
  /** 파일럿에 초대할 역할. owner는 초대할 수 없어 제외된 타입을 쓴다. */
  readonly inviteRoles: readonly InvitableWorkspaceRole[];
}

export interface PilotTemplateDefinition {
  readonly id: string;
  readonly name: BilingualLabel;
  readonly description: BilingualLabel;
  readonly spec: PilotEpisodeSpec;
  readonly steps: readonly PilotStepDefinition[];
}

export const TEAM_PILOT_TEMPLATE_ID = "team-pilot-v1";

/**
 * 내장 파일럿 템플릿 — 실제 회차 1건, 컷 6개, 핵심 공정 4개, 검수 레인 2개.
 * 한 회차 전체(수십 컷)를 파일럿으로 삼으면 검증이 끝나기 전에 본작업이
 * 돼 버리므로, 전 과정을 한 바퀴 돌 수 있는 최소 크기로 잡았다.
 */
export const TEAM_PILOT_TEMPLATE: PilotTemplateDefinition = Object.freeze({
  id: TEAM_PILOT_TEMPLATE_ID,
  name: { ko: "팀 파일럿 — 첫 회차로 전 과정 검증", en: "Team pilot — verify the full flow with one real episode" },
  description: {
    ko: "빈 프로젝트가 아니라 실제 회차 1건으로 초대→합류→제작→검수→승인을 한 바퀴 돌려 봅니다. 다섯 단계가 모두 끝나면, 성공한 그 순서를 팀 기본 템플릿으로 고정할 수 있어요.",
    en: "Run invite → join → produce → review → approve once with a real episode, not an empty project. When all five steps finish, you can pin that proven order as the team's default template.",
  },
  spec: Object.freeze({
    episodeTitle: { ko: "파일럿 1화", en: "Pilot episode 1" },
    targetCuts: 6,
    processKeys: Object.freeze(["storyboard", "line-art", "color", "lettering"]),
    reviewLanes: Object.freeze(["narrative", "visual-direction"] as const),
    inviteRoles: Object.freeze(["member", "guest"] as const),
  }),
  steps: PILOT_STEP_DEFINITIONS,
});

/* ------------------------------------------------------------------ */
/* 파일럿 실행(run)                                                     */
/* ------------------------------------------------------------------ */

export type PilotRunStatus = "in-progress" | "completed" | "abandoned";
export type PilotStepStatus = "pending" | "done";

export interface PilotStepProgress {
  readonly stepId: PilotStepId;
  readonly status: PilotStepStatus;
  /** 완료로 표시한 사람 (계정·이름 식별자). 남이 대신 누른 검증과 구분하는 기록이다. */
  readonly completedBy: string | null;
  readonly completedAt: string | null;
  /** 실제로 일어난 일의 메모 (예: "초대 링크로 합류, 게스트 권한으로 회차 열림 확인"). */
  readonly evidenceNote: string | null;
}

export interface TeamPilotRun {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  /** 출발한 템플릿 id (내장 템플릿 또는 고정된 팀 기본 템플릿). */
  readonly templateId: string;
  readonly spec: PilotEpisodeSpec;
  readonly status: PilotRunStatus;
  readonly steps: readonly PilotStepProgress[];
  readonly startedBy: string;
  readonly startedAt: string;
  readonly finishedAt: string | null;
}

function requireText(value: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(message);
  return trimmed;
}

function requireTimestamp(now: string): string {
  if (!Number.isFinite(Date.parse(now))) {
    throw new Error("A valid pilot timestamp is required.");
  }
  return now;
}

function cloneSpec(spec: PilotEpisodeSpec): PilotEpisodeSpec {
  return Object.freeze({
    episodeTitle: Object.freeze({ ...spec.episodeTitle }),
    targetCuts: spec.targetCuts,
    processKeys: Object.freeze(
      spec.processKeys.map((key) => canonicalProductionProcessKey(key.trim())),
    ),
    reviewLanes: Object.freeze([...spec.reviewLanes]),
    inviteRoles: Object.freeze([...spec.inviteRoles]),
  });
}

function validateSpec(spec: PilotEpisodeSpec): PilotEpisodeSpec {
  if (!Number.isInteger(spec.targetCuts) || spec.targetCuts < 1) {
    throw new Error("A pilot spec requires a positive integer target cut count.");
  }
  requireText(spec.episodeTitle.ko, "A pilot spec requires an episode title.");
  requireText(spec.episodeTitle.en, "A pilot spec requires an episode title.");
  if (spec.processKeys.length === 0) {
    throw new Error("A pilot spec requires at least one process.");
  }
  if (spec.reviewLanes.length === 0) {
    throw new Error("A pilot spec requires at least one review lane.");
  }
  if (spec.inviteRoles.length === 0) {
    throw new Error("A pilot spec requires at least one invite role.");
  }
  return cloneSpec(spec);
}

function pendingSteps(): readonly PilotStepProgress[] {
  return Object.freeze(
    PILOT_STEP_IDS.map((stepId) =>
      Object.freeze({
        stepId,
        status: "pending" as const,
        completedBy: null,
        completedAt: null,
        evidenceNote: null,
      }),
    ),
  );
}

export interface CreatePilotRunInput {
  readonly id: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly episodeId: string;
  readonly startedBy: string;
  readonly now: string;
  /** 출발 템플릿. 없으면 내장 파일럿 템플릿으로 시작한다. */
  readonly template?: PilotTemplateDefinition;
}

/** 파일럿 실행 시작 — 다섯 단계가 전부 대기 상태로 열린다. */
export function createPilotRun(input: CreatePilotRunInput): TeamPilotRun {
  requireText(input.id, "A pilot run requires an id.");
  requireText(input.workspaceId, "A pilot run requires a workspace id.");
  requireText(input.projectId, "A pilot run requires a project id.");
  requireText(input.episodeId, "A pilot run requires an episode id.");
  requireText(input.startedBy, "A pilot run requires who started it.");
  requireTimestamp(input.now);
  const template = input.template ?? TEAM_PILOT_TEMPLATE;
  return Object.freeze({
    id: input.id,
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    episodeId: input.episodeId,
    templateId: template.id,
    spec: validateSpec(template.spec),
    status: "in-progress" as const,
    steps: pendingSteps(),
    startedBy: input.startedBy,
    startedAt: input.now,
    finishedAt: null,
  });
}

/**
 * 체크포인트 완료 표시 — 순서 강제가 이 항목의 핵심 규칙이다.
 * 앞 단계가 남아 있는데 다음 단계를 완료로 표시하면 "검증한 순서"가
 * 기록이 아니라 선언이 되므로, 그런 호출은 오류로 막는다.
 * 마지막 단계까지 끝나면 실행은 completed가 되고 그때부터 템플릿으로
 * 고정할 수 있다.
 */
export function completePilotStep(
  run: TeamPilotRun,
  stepId: PilotStepId,
  input: { readonly by: string; readonly at: string; readonly evidenceNote?: string },
): TeamPilotRun {
  if (run.status !== "in-progress") {
    throw new Error("Only an in-progress pilot run can record step completion.");
  }
  requireText(input.by, "Step completion requires who confirmed it.");
  requireTimestamp(input.at);
  const index = run.steps.findIndex((step) => step.stepId === stepId);
  if (index < 0) throw new Error(`Unknown pilot step: ${stepId}`);
  const target = run.steps[index]!;
  if (target.status === "done") {
    throw new Error(`Pilot step already completed: ${stepId}`);
  }
  const blocking = run.steps
    .slice(0, index)
    .find((step) => step.status !== "done");
  if (blocking) {
    throw new Error(
      `Pilot steps must complete in order: finish "${blocking.stepId}" before "${stepId}".`,
    );
  }
  const evidenceNote = input.evidenceNote?.trim() ? input.evidenceNote.trim() : null;
  const steps = Object.freeze(
    run.steps.map((step, stepIndex) =>
      stepIndex === index
        ? Object.freeze({
            stepId: step.stepId,
            status: "done" as const,
            completedBy: input.by,
            completedAt: input.at,
            evidenceNote,
          })
        : step,
    ),
  );
  const allDone = steps.every((step) => step.status === "done");
  return Object.freeze({
    ...run,
    steps,
    status: allDone ? ("completed" as const) : run.status,
    finishedAt: allDone ? input.at : run.finishedAt,
  });
}

/** 파일럿 중단 — 실패한 시도를 지우지 않고 abandoned로 남긴다 (ORKA식 재시작의 근거 기록). */
export function abandonPilotRun(run: TeamPilotRun, at: string): TeamPilotRun {
  if (run.status !== "in-progress") {
    throw new Error("Only an in-progress pilot run can be abandoned.");
  }
  requireTimestamp(at);
  return Object.freeze({ ...run, status: "abandoned" as const, finishedAt: at });
}

export interface PilotProgress {
  readonly doneCount: number;
  readonly totalCount: number;
  readonly percent: number;
  /** 지금 할 단계. 진행 중이 아니거나 전부 끝났으면 null. */
  readonly currentStepId: PilotStepId | null;
  readonly isComplete: boolean;
}

export function derivePilotProgress(run: TeamPilotRun): PilotProgress {
  const doneCount = run.steps.filter((step) => step.status === "done").length;
  const totalCount = run.steps.length;
  const current =
    run.status === "in-progress"
      ? (run.steps.find((step) => step.status === "pending") ?? null)
      : null;
  return Object.freeze({
    doneCount,
    totalCount,
    percent: totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 100),
    currentStepId: current ? current.stepId : null,
    isComplete: run.status === "completed",
  });
}

/* ------------------------------------------------------------------ */
/* 팀 기본 템플릿 고정                                                  */
/* ------------------------------------------------------------------ */

export interface TeamDefaultTemplate {
  readonly id: string;
  readonly workspaceId: string;
  readonly name: BilingualLabel;
  /** 성공한 실행의 순서와 명세를 그대로 복사한다 — 성공한 것만 고정된다. */
  readonly sourcePilotRunId: string;
  readonly sourceProjectId: string;
  readonly spec: PilotEpisodeSpec;
  readonly stepOrder: readonly PilotStepId[];
  readonly createdBy: string;
  readonly createdAt: string;
}

/**
 * 성공한 파일럿 → 팀 기본 템플릿 고정.
 * 완료되지 않은 실행은 고정할 수 없다 — 검증되지 않은 순서를 팀
 * 기본값으로 만들면 파일럿을 한 의미가 없어지기 때문이다.
 */
export function promotePilotRunToTeamTemplate(
  run: TeamPilotRun,
  input: {
    readonly id: string;
    readonly createdBy: string;
    readonly now: string;
    readonly name?: BilingualLabel;
  },
): TeamDefaultTemplate {
  if (run.status !== "completed") {
    throw new Error("Only a completed pilot run can be pinned as the team default template.");
  }
  requireText(input.id, "A team template requires an id.");
  requireText(input.createdBy, "A team template requires who pinned it.");
  requireTimestamp(input.now);
  return Object.freeze({
    id: input.id,
    workspaceId: run.workspaceId,
    name: input.name
      ? Object.freeze({ ...input.name })
      : Object.freeze({ ...TEAM_PILOT_TEMPLATE.name }),
    sourcePilotRunId: run.id,
    sourceProjectId: run.projectId,
    spec: cloneSpec(run.spec),
    stepOrder: Object.freeze(run.steps.map((step) => step.stepId)),
    createdBy: input.createdBy,
    createdAt: input.now,
  });
}

/** 고정된 팀 기본 템플릿을 파일럿 실행 시작용 템플릿 정의로 되돌린다. */
export function pilotTemplateFromTeamDefault(
  template: TeamDefaultTemplate,
): PilotTemplateDefinition {
  return Object.freeze({
    id: template.id,
    name: Object.freeze({ ...template.name }),
    description: {
      ko: "검증된 파일럿에서 고정된 팀 기본 템플릿입니다. 같은 명세와 순서로 다음 파일럿을 시작합니다.",
      en: "The team default template pinned from a proven pilot. Start the next pilot with the same spec and order.",
    },
    spec: cloneSpec(template.spec),
    steps: PILOT_STEP_DEFINITIONS,
  });
}

/* ------------------------------------------------------------------ */
/* 저장소 (플레이북·장부와 같은 관례, 워크스페이스 단위)                  */
/* ------------------------------------------------------------------ */

export const STUDIO_TEAM_PILOT_UPDATED_EVENT = "toonspectrum:studio:team-pilot-updated";

export interface StudioTeamPilotState {
  readonly schemaVersion: 1;
  readonly workspaceId: string;
  readonly runs: readonly TeamPilotRun[];
  readonly defaultTemplate: TeamDefaultTemplate | null;
}

export interface StudioTeamPilotEventTarget {
  dispatchEvent(event: Event): boolean;
}

function storageKey(workspaceId: string): string {
  return `toonstudio:team-pilot:v1:${encodeURIComponent(workspaceId)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireWorkspaceId(workspaceId: string): string {
  const normalized = workspaceId.trim();
  if (!normalized || normalized === "." || normalized === ".." || normalized.includes("\\")) {
    throw new Error("A valid Studio workspace id is required.");
  }
  return normalized;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isBilingualLabel(value: unknown): value is BilingualLabel {
  return (
    isRecord(value) &&
    typeof value.ko === "string" &&
    value.ko.length > 0 &&
    typeof value.en === "string" &&
    value.en.length > 0
  );
}

function isSpecLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    isBilingualLabel(value.episodeTitle) &&
    typeof value.targetCuts === "number" &&
    Number.isInteger(value.targetCuts) &&
    value.targetCuts >= 1 &&
    isStringArray(value.processKeys) &&
    value.processKeys.length > 0 &&
    isStringArray(value.reviewLanes) &&
    value.reviewLanes.length > 0 &&
    isStringArray(value.inviteRoles) &&
    value.inviteRoles.length > 0
  );
}

function isStepProgressLike(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    (PILOT_STEP_IDS as readonly string[]).includes(value.stepId as string) &&
    (value.status === "pending" || value.status === "done") &&
    (value.completedBy === null || typeof value.completedBy === "string") &&
    (value.completedAt === null || typeof value.completedAt === "string") &&
    (value.evidenceNote === null || typeof value.evidenceNote === "string")
  );
}

function isRunLike(value: unknown, workspaceId: string): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.workspaceId === workspaceId &&
    typeof value.projectId === "string" &&
    value.projectId.length > 0 &&
    typeof value.episodeId === "string" &&
    value.episodeId.length > 0 &&
    typeof value.templateId === "string" &&
    value.templateId.length > 0 &&
    isSpecLike(value.spec) &&
    (value.status === "in-progress" || value.status === "completed" || value.status === "abandoned") &&
    Array.isArray(value.steps) &&
    value.steps.length === PILOT_STEP_IDS.length &&
    value.steps.every(isStepProgressLike) &&
    typeof value.startedBy === "string" &&
    typeof value.startedAt === "string" &&
    (value.finishedAt === null || typeof value.finishedAt === "string")
  );
}

function isTemplateLike(value: unknown, workspaceId: string): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    value.workspaceId === workspaceId &&
    isBilingualLabel(value.name) &&
    typeof value.sourcePilotRunId === "string" &&
    value.sourcePilotRunId.length > 0 &&
    typeof value.sourceProjectId === "string" &&
    isSpecLike(value.spec) &&
    isStringArray(value.stepOrder) &&
    value.stepOrder.length === PILOT_STEP_IDS.length &&
    typeof value.createdBy === "string" &&
    typeof value.createdAt === "string"
  );
}

export function parseStudioTeamPilot(
  value: unknown,
  expectedWorkspaceId?: string,
): StudioTeamPilotState | null {
  if (!isRecord(value)) return null;
  if (
    value.schemaVersion !== 1 ||
    typeof value.workspaceId !== "string" ||
    !value.workspaceId.trim() ||
    (expectedWorkspaceId !== undefined && value.workspaceId !== expectedWorkspaceId) ||
    !Array.isArray(value.runs) ||
    !value.runs.every((run) => isRunLike(run, value.workspaceId as string)) ||
    !(
      value.defaultTemplate === null ||
      isTemplateLike(value.defaultTemplate, value.workspaceId as string)
    )
  ) {
    return null;
  }
  return Object.freeze(plainClone(value) as unknown as StudioTeamPilotState);
}

export function readStudioTeamPilot(
  storage: StudioProjectDiagnosticSourceStorage,
  workspaceId: string,
): StudioTeamPilotState | null {
  if (!workspaceId.trim()) return null;
  const raw = storage.getItem(storageKey(workspaceId));
  if (raw === null) return null;
  try {
    return parseStudioTeamPilot(JSON.parse(raw) as unknown, workspaceId);
  } catch {
    return null;
  }
}

export function writeStudioTeamPilot(
  storage: StudioProjectDiagnosticSourceStorage,
  state: StudioTeamPilotState,
  target?: StudioTeamPilotEventTarget,
): StudioTeamPilotState {
  const parsed = parseStudioTeamPilot(state, state.workspaceId);
  if (!parsed) throw new Error("A structurally valid team pilot state is required.");
  storage.setItem(storageKey(state.workspaceId), JSON.stringify(parsed));
  target?.dispatchEvent(
    new CustomEvent(STUDIO_TEAM_PILOT_UPDATED_EVENT, { detail: parsed }),
  );
  return parsed;
}

/** 저장된 상태를 돌려주고, 없으면 빈 상태를 만들어 저장한 뒤 돌려준다. */
export function ensureStudioTeamPilot(
  storage: StudioProjectDiagnosticSourceStorage,
  workspaceId: string,
): StudioTeamPilotState {
  const normalizedWorkspaceId = requireWorkspaceId(workspaceId);
  const current = readStudioTeamPilot(storage, normalizedWorkspaceId);
  if (current) return current;
  const initial: StudioTeamPilotState = Object.freeze({
    schemaVersion: 1,
    workspaceId: normalizedWorkspaceId,
    runs: Object.freeze([]),
    defaultTemplate: null,
  });
  return writeStudioTeamPilot(storage, initial);
}

/** id 기준으로 실행을 교체하거나 끝에 붙인다 — 실행 기록의 유일한 갱신 경로. */
export function upsertPilotRun(
  state: StudioTeamPilotState,
  run: TeamPilotRun,
): StudioTeamPilotState {
  if (run.workspaceId !== state.workspaceId) {
    throw new Error("A pilot run belongs to a different workspace.");
  }
  const exists = state.runs.some((entry) => entry.id === run.id);
  return Object.freeze({
    ...state,
    runs: Object.freeze(
      exists
        ? state.runs.map((entry) => (entry.id === run.id ? run : entry))
        : [...state.runs, run],
    ),
  });
}

/** 팀 기본 템플릿 고정의 유일한 경로. 새 고정은 이전 고정을 교체한다. */
export function setTeamDefaultTemplate(
  state: StudioTeamPilotState,
  template: TeamDefaultTemplate,
): StudioTeamPilotState {
  if (template.workspaceId !== state.workspaceId) {
    throw new Error("A team template belongs to a different workspace.");
  }
  return Object.freeze({ ...state, defaultTemplate: template });
}

/** 진행 중인 실행 (가장 최근 것). 없으면 null. */
export function activePilotRun(
  state: StudioTeamPilotState,
): TeamPilotRun | null {
  const active = state.runs.filter((run) => run.status === "in-progress");
  return active.length > 0 ? active[active.length - 1]! : null;
}

/** 가장 최근 실행 (상태 무관). 없으면 null. */
export function latestPilotRun(
  state: StudioTeamPilotState,
): TeamPilotRun | null {
  return state.runs.length > 0 ? state.runs[state.runs.length - 1]! : null;
}
