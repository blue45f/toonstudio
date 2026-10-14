import { describe, expect, it } from "vitest";
import type {
  AssetRequirement,
  ProductionProjectAggregate,
  ProductionRoleType,
  ProductionTask,
} from "@toonstudio/core/production";

import {
  buildSharedResourceBoard,
  checkAssetLicense,
  evaluateAssetAllocations,
  scoreSharedTaskPriority,
  type AssetLicenseMetadata,
} from "./shared-resource-priority-license-model";

// 2026-10-14(수) 09:00 UTC. 부하 창은 기본 14일 → 10-28까지.
const NOW = new Date("2026-10-14T09:00:00.000Z");

function task(overrides: Partial<ProductionTask> & { id: string }): ProductionTask {
  return {
    projectId: "p1",
    scope: { kind: "project", id: "p1", ancestors: [] },
    processKey: "color",
    title: `작업 ${overrides.id}`,
    status: "ready",
    assignmentIds: [],
    reviewerAssignmentIds: [],
    inputRevisionRefs: [],
    outputDeliverableIds: [],
    dependencyTaskIds: [],
    dueAt: "2026-10-16T00:00:00.000Z",
    estimateHours: { optimistic: 8, likely: 10, pessimistic: 15 },
    completionCriteria: [],
    sourceAgreementMilestoneId: null,
    ...overrides,
  } as ProductionTask;
}

function requirement(overrides: Partial<AssetRequirement> & { id: string }): AssetRequirement {
  return {
    projectId: "p1",
    scope: { kind: "project", id: "p1", ancestors: [] },
    category: "location",
    title: `에셋 ${overrides.id}`,
    specification: "",
    sourcePlanRefs: [],
    sourcing: "existing",
    rightsRequirements: [],
    requiredByAt: null,
    status: "ready",
    ...overrides,
  } as AssetRequirement;
}

function license(overrides: Partial<AssetLicenseMetadata> & { assetId: string }): AssetLicenseMetadata {
  return {
    title: `에셋 ${overrides.assetId}`,
    licenseId: "CC0-1.0",
    commercialUse: "allowed",
    redistribution: "allowed",
    allowedProjectIds: null,
    allowedUses: null,
    expiresAt: null,
    attributionRequired: false,
    rightsConfirmed: true,
    ...overrides,
  };
}

interface ProjectOptions {
  projectId?: string;
  title?: string;
  weeklyHoursByAssignment?: Readonly<Record<string, number>>;
  requirements?: readonly AssetRequirement[];
  cutPlans?: readonly unknown[];
  withWorkflow?: boolean;
}

function project(tasks: readonly ProductionTask[], options: ProjectOptions = {}): ProductionProjectAggregate {
  const projectId = options.projectId ?? "p1";
  const calendars = Object.entries(options.weeklyHoursByAssignment ?? {}).map(([assignmentId, weeklyHours], index) => ({
    id: `cal-${projectId}-${index}`,
    projectId,
    assignmentId,
    timezone: "Asia/Seoul",
    weeklyHours,
    dailyHours: 8,
    workingWeekdays: [1, 2, 3, 4, 5],
    exceptions: [],
    revision: 1,
    updatedAt: "2026-10-01T00:00:00.000Z",
  }));
  return {
    projectId,
    workId: `w-${projectId}`,
    title: options.title ?? `작품 ${projectId}`,
    parties: [
      { id: "party-kim", accountUserId: "u-kim", legalIdentityRef: null, publicDisplayName: "김선화", internalDisplayName: "김선화", contactPartyId: null, agencyPartyId: null, status: "active" },
      { id: "party-lee", accountUserId: "u-lee", legalIdentityRef: null, publicDisplayName: "이채색", internalDisplayName: "이채색", contactPartyId: null, agencyPartyId: null, status: "active" },
      { id: "party-bae", accountUserId: "u-bae", legalIdentityRef: null, publicDisplayName: "배배경", internalDisplayName: "배배경", contactPartyId: null, agencyPartyId: null, status: "active" },
    ],
    assignments: [
      { id: `as-kim-${projectId}`, projectId, partyId: "party-kim", roleType: "line-artist" as ProductionRoleType, scope: { kind: "project", id: projectId, ancestors: [] }, startsAt: "2026-10-01T00:00:00.000Z", endsAt: null, capabilities: [], agreementRevisionRef: null, publicCreditRole: null, status: "active", lead: true },
      { id: `as-lee-${projectId}`, projectId, partyId: "party-lee", roleType: "colorist" as ProductionRoleType, scope: { kind: "project", id: projectId, ancestors: [] }, startsAt: "2026-10-01T00:00:00.000Z", endsAt: null, capabilities: [], agreementRevisionRef: null, publicCreditRole: null, status: "active", lead: false },
      { id: `as-bae-${projectId}`, projectId, partyId: "party-bae", roleType: "background-artist" as ProductionRoleType, scope: { kind: "project", id: projectId, ancestors: [] }, startsAt: "2026-10-01T00:00:00.000Z", endsAt: null, capabilities: [], agreementRevisionRef: null, publicCreditRole: null, status: "active", lead: false },
    ],
    tasks,
    assetRequirements: options.requirements ?? [],
    cutPlans: options.cutPlans ?? [],
    workflowProfile: options.withWorkflow === false
      ? null
      : {
          id: "production-workflow",
          projectId,
          name: "스튜디오 제작",
          scale: "studio",
          revision: 1,
          steps: [
            { key: "storyboard", name: "콘티", description: "", defaultRole: "storyboard-artist" as ProductionRoleType, estimateHours: 8, dependsOn: [], wipLimit: 6, reviewRequired: false, completionCriteria: [] },
            { key: "line-art", name: "선화", description: "", defaultRole: "line-artist" as ProductionRoleType, estimateHours: 16, dependsOn: [], wipLimit: 6, reviewRequired: false, completionCriteria: [] },
            { key: "background", name: "배경", description: "", defaultRole: "background-artist" as ProductionRoleType, estimateHours: 12, dependsOn: [], wipLimit: 6, reviewRequired: false, completionCriteria: [] },
            { key: "color", name: "채색", description: "", defaultRole: "colorist" as ProductionRoleType, estimateHours: 12, dependsOn: ["line-art"], wipLimit: 6, reviewRequired: false, completionCriteria: [] },
            { key: "lettering", name: "식자", description: "", defaultRole: "letterer" as ProductionRoleType, estimateHours: 6, dependsOn: ["color"], wipLimit: 6, reviewRequired: false, completionCriteria: [] },
          ],
          updatedAt: "2026-10-01T00:00:00.000Z",
        },
    resourceCalendars: calendars,
  } as unknown as ProductionProjectAggregate;
}

describe("scoreSharedTaskPriority", () => {
  it("마감 경과+긴급+후반 공정+후행 대기가 겹치면 P0가 되고 근거가 남는다", () => {
    const score = scoreSharedTaskPriority({
      task: task({ id: "t1", dueAt: "2026-10-10T00:00:00.000Z", priority: "urgent", processKey: "lettering" }),
      workflowStepIndex: 4,
      workflowStepCount: 5,
      downstreamWaitingCount: 1,
      now: NOW,
    });
    // 40(경과) + 15(최종 단계) + 20(긴급) + 5(후행 대기) = 80
    expect(score.score).toBe(80);
    expect(score.band).toBe("P0");
    expect(score.reasons).toEqual(
      expect.arrayContaining(["overdue", "explicit-urgent", "late-stage", "downstream-waiting"]),
    );
    expect(score.stageKnown).toBe(true);
  });

  it("마감이 멀고 낮음 지정이면 P3, 프로필이 없으면 stageKnown=false", () => {
    const score = scoreSharedTaskPriority({
      task: task({ id: "t1", dueAt: "2026-12-01T00:00:00.000Z", priority: "low", processKey: "color" }),
      workflowStepIndex: null,
      workflowStepCount: 0,
      downstreamWaitingCount: 0,
      now: NOW,
    });
    expect(score.score).toBe(0);
    expect(score.band).toBe("P3");
    expect(score.stageKnown).toBe(false);
  });

  it("막힌 작업은 +10, 후행 대기는 최대 +15에서 접힌다", () => {
    const score = scoreSharedTaskPriority({
      task: task({ id: "t1", dueAt: null, status: "blocked" }),
      workflowStepIndex: 0,
      workflowStepCount: 5,
      downstreamWaitingCount: 9,
      now: NOW,
    });
    expect(score.score).toBe(25);
    expect(score.reasons).toEqual(expect.arrayContaining(["task-blocked", "downstream-waiting"]));
  });
});

describe("checkAssetLicense", () => {
  const ctx = { projectId: "p1", use: "cross-project-share" as const, commercialContext: true, at: NOW };
  const fallback = { assetId: "a1", title: "에셋 a1" };

  it("메타데이터가 없으면 차단이다 (통과로 지어내지 않는다)", () => {
    const result = checkAssetLicense(null, ctx, fallback);
    expect(result.verdict).toBe("block");
    expect(result.issues[0]?.code).toBe("metadata-missing");
  });

  it("깨끗한 CC0는 허용, 출처표기 필요는 경고로 허용하되 의무를 남긴다", () => {
    expect(checkAssetLicense(license({ assetId: "a1" }), ctx, fallback).verdict).toBe("allow");
    const attribution = checkAssetLicense(license({ assetId: "a1", attributionRequired: true }), ctx, fallback);
    expect(attribution.verdict).toBe("warn");
    expect(attribution.issues.map((issue) => issue.code)).toContain("attribution-required");
  });

  it("비상업 라이선스는 상업 맥락에서 차단, 비상업 맥락에서는 그 사유로 차단하지 않는다", () => {
    const meta = license({ assetId: "a1", licenseId: "CC-BY-NC-4.0", commercialUse: "forbidden" });
    const blocked = checkAssetLicense(meta, ctx, fallback);
    expect(blocked.verdict).toBe("block");
    expect(blocked.issues.map((issue) => issue.code)).toContain("noncommercial-license");
    const noncommercial = checkAssetLicense(meta, { ...ctx, commercialContext: false }, fallback);
    expect(noncommercial.issues.map((issue) => issue.code)).not.toContain("noncommercial-license");
  });

  it("재배포 금지는 공유에서만 차단하고 내부 제작은 막지 않는다", () => {
    const meta = license({ assetId: "a1", redistribution: "forbidden" });
    expect(checkAssetLicense(meta, ctx, fallback).verdict).toBe("block");
    const internal = checkAssetLicense(meta, { ...ctx, use: "internal-production" }, fallback);
    expect(internal.issues.map((issue) => issue.code)).not.toContain("redistribution-forbidden");
  });

  it("허용 작품·용도 밖이면 차단, 만료는 차단·임박은 경고, 권리 미확인은 차단", () => {
    expect(
      checkAssetLicense(license({ assetId: "a1", allowedProjectIds: ["p2"] }), ctx, fallback).verdict,
    ).toBe("block");
    expect(
      checkAssetLicense(license({ assetId: "a1", allowedUses: ["publication"] }), ctx, fallback).verdict,
    ).toBe("block");
    expect(
      checkAssetLicense(license({ assetId: "a1", expiresAt: "2026-10-01T00:00:00.000Z" }), ctx, fallback)
        .issues.map((issue) => issue.code),
    ).toContain("license-expired");
    const soon = checkAssetLicense(
      license({ assetId: "a1", expiresAt: "2026-10-30T00:00:00.000Z" }),
      ctx,
      fallback,
    );
    expect(soon.verdict).toBe("warn");
    expect(soon.issues.map((issue) => issue.code)).toContain("license-expiring-soon");
    expect(
      checkAssetLicense(license({ assetId: "a1", rightsConfirmed: false }), ctx, fallback).verdict,
    ).toBe("block");
  });
});

describe("evaluateAssetAllocations", () => {
  it("배분 시점 게이트: 차단된 에셋만 allocatable=false가 된다", () => {
    const decisions = evaluateAssetAllocations({
      licenses: [
        license({ assetId: "ok" }),
        license({ assetId: "nc", licenseId: "CC-BY-NC-4.0", commercialUse: "forbidden" }),
      ],
      requests: [
        { assetId: "ok", title: "ok", projectId: "p1", use: "cross-project-share" },
        { assetId: "nc", title: "nc", projectId: "p1", use: "cross-project-share" },
        { assetId: "missing", title: "missing", projectId: "p1", use: "publication" },
      ],
      at: NOW,
    });
    expect(decisions.map((decision) => decision.allocatable)).toEqual([true, false, false]);
  });
});

describe("buildSharedResourceBoard", () => {
  it("사람 부하를 작품 간 합산하되 용량은 작품 수로 불리지 않는다", () => {
    const board = buildSharedResourceBoard(
      [
        project([task({ id: "t1", assignmentIds: ["as-lee-p1"] })], {
          weeklyHoursByAssignment: { "as-lee-p1": 30 },
        }),
        project([task({ id: "t2", projectId: "p2", assignmentIds: ["as-lee-p2"] })], {
          projectId: "p2",
          weeklyHoursByAssignment: { "as-lee-p2": 40 },
        }),
      ],
      { now: NOW },
    );
    const lee = board.people.find((person) => person.partyId === "party-lee");
    expect(lee?.projectIds).toEqual(["p1", "p2"]);
    expect(lee?.loadHours).toBe(20);
    // 용량 = max(30, 40) × 2주 창 = 80. 작품별로 합산한 140이 아니다.
    expect(lee?.capacityHours).toBe(80);
    expect(lee?.capacitySource).toBe("calendar");
  });

  it("풀(역할) 단위 부하와 지연을 한 축으로 모은다", () => {
    const board = buildSharedResourceBoard(
      [
        project([
          task({ id: "t1", assignmentIds: ["as-lee-p1"], dueAt: "2026-10-10T00:00:00.000Z" }),
          task({ id: "t2", assignmentIds: ["as-lee-p1"] }),
        ]),
      ],
      { now: NOW },
    );
    const colorPool = board.pools.find((pool) => pool.roleType === "colorist");
    expect(colorPool?.openTaskCount).toBe(2);
    expect(colorPool?.loadHours).toBe(20);
    expect(colorPool?.overdueCount).toBe(1);
    expect(colorPool?.memberCount).toBe(1);
  });

  it("큐는 점수 순으로 정렬되고 견적 없는 작업은 unknown으로 센다", () => {
    const board = buildSharedResourceBoard(
      [
        project([
          task({ id: "low", dueAt: "2026-12-01T00:00:00.000Z", priority: "low" }),
          task({ id: "hot", dueAt: "2026-10-10T00:00:00.000Z", priority: "urgent" }),
          task({ id: "no-estimate", dueAt: "2026-10-20T00:00:00.000Z", estimateHours: null }),
        ]),
      ],
      { now: NOW },
    );
    expect(board.queue.map((entry) => entry.taskId)).toEqual(["hot", "no-estimate", "low"]);
    expect(board.unknownEstimateCount).toBe(1);
    expect(board.queue.find((entry) => entry.taskId === "no-estimate")?.remainingHours).toBeNull();
  });

  it("에셋 자동 검사: 메타데이터 없는 요구는 차단, 등록된 CC0는 허용", () => {
    const board = buildSharedResourceBoard(
      [
        project([], {
          requirements: [requirement({ id: "req-blocked" }), requirement({ id: "req-ok" })],
        }),
      ],
      { now: NOW, licenses: [license({ assetId: "req-ok" })] },
    );
    expect(board.blockedAssetCount).toBe(1);
    expect(board.assetChecks[0]?.requirementId).toBe("req-blocked");
    expect(board.assetChecks[0]?.verdict).toBe("block");
    expect(board.assetChecks.find((check) => check.requirementId === "req-ok")?.verdict).toBe("allow");
    // 재사용(sourcing=existing) 요구는 공유 용도로 검사한다.
    expect(board.assetChecks[0]?.use).toBe("cross-project-share");
  });

  it("라이선스 차단 에셋이 필요한 작업은 큐에 표시되고 배분 제안에서 빠진다", () => {
    const board = buildSharedResourceBoard(
      [
        project(
          [
            task({
              id: "blocked-task",
              scope: { kind: "cut", id: "cut-1", ancestors: [] },
            }),
            task({ id: "free-task" }),
          ],
          {
            requirements: [requirement({ id: "req-blocked" })],
            cutPlans: [{ id: "cutplan-1", cutId: "cut-1", assetRequirementIds: ["req-blocked"] }],
          },
        ),
      ],
      { now: NOW },
    );
    const blocked = board.queue.find((entry) => entry.taskId === "blocked-task");
    expect(blocked?.licenseBlocked).toBe(true);
    expect(blocked?.licenseBlockedAssetIds).toEqual(["req-blocked"]);
    expect(board.suggestions.map((suggestion) => suggestion.taskId)).toEqual(["free-task"]);
    expect(board.suggestions[0]?.toPartyId).toBe("party-lee");
    expect(board.suggestions[0]?.reason).toBe("unassigned");
  });

  it("진행 중 작업은 재배분 제안을 만들지 않는다", () => {
    const board = buildSharedResourceBoard(
      [project([task({ id: "doing", status: "in-progress" })])],
      { now: NOW },
    );
    expect(board.suggestions).toEqual([]);
  });
});
