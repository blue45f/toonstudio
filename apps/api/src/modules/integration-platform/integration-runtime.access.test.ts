import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";

import type { ProductionCollaborationService } from "../production-collaboration/production-collaboration.service";
import {
  IntegrationRuntimeAccessPolicy,
  parseIntegrationRuntimeOperatorGrants,
} from "./integration-runtime.access";
import {
  IntegrationRuntimeActionSchema,
  type IntegrationRuntimeActionDto,
} from "./integration-runtime.dto";
import { integrationRuntimeConnectorStatus } from "./integration-runtime.providers";
import type {
  IntegrationRuntimeProviderEngine,
} from "./integration-runtime.providers";
import type { IntegrationRuntimeRepository } from "./integration-runtime.repository";
import { IntegrationRuntimeService } from "./integration-runtime.service";

type ProviderId = IntegrationRuntimeActionDto["providerId"];

const HANGUL = /[가-힣]/u;

// 운영자 인증 정보를 쓰는 9개 커넥터와, 대상(container) 필드 및 ID로 기존 항목을 고치는 필드.
// 입력은 실제 DTO 스키마로 파싱해 기본값까지 채운다.
const OPERATOR_CASES = [
  { providerId: "notion", action: "task.upsert", target: { dataSourceId: "ds-allowed" }, other: { dataSourceId: "ds-other" }, update: { pageId: "page-1" }, base: { title: "에피소드 QA" } },
  { providerId: "linear", action: "task.upsert", target: { teamId: "team-allowed" }, other: { teamId: "team-other" }, update: { issueId: "issue-1" }, base: { title: "에피소드 QA" } },
  { providerId: "jira", action: "task.upsert", target: { projectKey: "WEBTOON" }, other: { projectKey: "SECRET" }, update: { issueKey: "WEBTOON-12" }, base: { title: "에피소드 QA" } },
  { providerId: "trello", action: "task.upsert", target: { listId: "list-allowed" }, other: { listId: "list-other" }, update: { cardId: "card-1" }, base: { title: "에피소드 QA" } },
  { providerId: "figma", action: "design.inspect", target: { fileKey: "FileKeyAllowed1" }, other: { fileKey: "FileKeyOther0001" }, update: null, base: {} },
  { providerId: "zoom", action: "meeting.create", target: { userId: "zoom-user-allowed" }, other: { userId: "zoom-user-other" }, update: null, base: { topic: "리뷰", startTime: "2026-10-02T14:00:00+09:00", durationMinutes: 30 } },
] as const;

const TARGETLESS_CASES = [
  { providerId: "slack", action: "message.send", input: { text: "리뷰 요청" } },
  { providerId: "microsoft-teams", action: "message.send", input: { text: "리뷰 요청" } },
  {
    providerId: "naver-datalab",
    action: "trends.read",
    input: {
      startDate: "2026-09-01",
      endDate: "2026-09-25",
      timeUnit: "date",
      keywordGroups: [{ groupName: "작품명", keywords: ["작품명"] }],
    },
  },
] as const;

const PUBLIC_CASES = [
  { providerId: "wikidata", action: "trends.read", input: { query: "작품명" } },
  { providerId: "google-books", action: "trends.read", input: { query: "작품명" } },
] as const;

function parsed(providerId: ProviderId, action: string, input: Record<string, unknown>) {
  return IntegrationRuntimeActionSchema.parse({ providerId, action, input });
}

function policyWith(
  grants: string | undefined,
  admins: readonly string[] = [],
  failAdminLookup = false,
) {
  const isAdministrator = vi.fn(async (userId: string) => {
    if (failAdminLookup) throw new Error("database unavailable");
    return admins.includes(userId);
  });
  const policy = IntegrationRuntimeAccessPolicy.fromEnvironment(
    { INTEGRATION_RUNTIME_OPERATOR_GRANTS: grants },
    isAdministrator,
  );
  return { policy, isAdministrator };
}

function decide(
  policy: IntegrationRuntimeAccessPolicy,
  request: IntegrationRuntimeActionDto,
  options: { actorUserId?: string; projectId?: string } = {},
) {
  return policy.authorize({
    actorUserId: options.actorUserId ?? "user-1",
    projectId: options.projectId ?? "project-1",
    request,
    connector: integrationRuntimeConnectorStatus(request.providerId, {}),
  });
}

function grantJson(...entries: readonly Record<string, unknown>[]): string {
  return JSON.stringify(entries);
}

describe("parseIntegrationRuntimeOperatorGrants", () => {
  it("설정이 없거나 비어 있으면 허용 항목 없이 정상으로 본다(관리자 전용)", () => {
    for (const raw of [undefined, "", "   "]) {
      expect(parseIntegrationRuntimeOperatorGrants(raw)).toEqual({ grants: [], issue: null });
    }
  });

  it("프로젝트·공급자·대상 허용 목록을 읽고 같은 프로젝트·공급자 항목은 합친다", () => {
    const result = parseIntegrationRuntimeOperatorGrants(grantJson(
      { projectId: "project-1", providerId: "notion", targets: ["ds-a"] },
      { projectId: "project-1", providerId: "notion", targets: ["ds-b"] },
      { projectId: "project-1", providerId: "slack" },
    ));
    expect(result.issue).toBeNull();
    expect(result.grants).toEqual([
      { projectId: "project-1", providerId: "notion", targets: ["ds-a", "ds-b"] },
      { projectId: "project-1", providerId: "slack", targets: [] },
    ]);
  });

  it.each([
    ["JSON 이 아님", "{not-json"],
    ["배열이 아님", JSON.stringify({ projectId: "p", providerId: "notion" })],
    ["알 수 없는 공급자", grantJson({ projectId: "p", providerId: "unknown", targets: [] })],
    ["프로젝트 ID 누락", grantJson({ providerId: "notion", targets: ["a"] })],
    ["알 수 없는 속성", grantJson({ projectId: "p", providerId: "notion", targets: ["a"], wildcard: true })],
    ["빈 대상 문자열", grantJson({ projectId: "p", providerId: "notion", targets: [""] })],
  ])("형식이 잘못되면(%s) 항목을 모두 버리고 사유만 남긴다", (_name, raw) => {
    const result = parseIntegrationRuntimeOperatorGrants(raw);
    expect(result.grants).toEqual([]);
    expect(result.issue).toMatch(HANGUL);
    expect(result.issue).not.toContain("not-json");
  });

  it("너무 큰 설정 값은 거부한다", () => {
    const entries = Array.from({ length: 2_000 }, (_unused, index) => ({
      projectId: `project-${index}`,
      providerId: "slack",
    }));
    expect(parseIntegrationRuntimeOperatorGrants(JSON.stringify(entries)).grants).toEqual([]);
  });
});

describe("IntegrationRuntimeAccessPolicy", () => {
  describe.each(PUBLIC_CASES)("공개 프로토콜 커넥터 $providerId", ({ providerId, action, input }) => {
    it("운영자 인증 정보를 쓰지 않으므로 관리자 조회 없이 누구나 쓸 수 있다", async () => {
      const { policy, isAdministrator } = policyWith(undefined);
      await expect(decide(policy, parsed(providerId, action, input))).resolves.toEqual({
        allowed: true,
        basis: "not-required",
      });
      expect(isAdministrator).not.toHaveBeenCalled();
    });
  });

  describe.each(OPERATOR_CASES)("운영자 토큰 커넥터 $providerId", (testCase) => {
    const { providerId, action } = testCase;
    const inputFor = (...parts: readonly Record<string, unknown>[]) =>
      parsed(
        providerId,
        action,
        parts.reduce<Record<string, unknown>>(
          (merged, part) => ({ ...merged, ...part }),
          { ...testCase.base },
        ),
      );

    it("허용 목록 설정이 없으면 일반 사용자는 거부한다(fail-closed) — 자기 프로젝트의 임의 대상이어도 마찬가지", async () => {
      const { policy } = policyWith(undefined);
      const decision = await decide(policy, inputFor(testCase.target));
      expect(decision).toMatchObject({ allowed: false, code: "operator_connector_admin_only" });
      if (decision.allowed) throw new Error("거부되어야 합니다.");
      expect(decision.message).toMatch(HANGUL);
      expect(decision.message).toContain(
        integrationRuntimeConnectorStatus(providerId, {}).name,
      );
      expect(decision.message).toContain("관리자");
    });

    it("관리자는 허용 목록과 무관하게 모든 대상을 쓸 수 있다", async () => {
      const { policy } = policyWith(undefined, ["admin-1"]);
      await expect(decide(policy, inputFor(testCase.other), { actorUserId: "admin-1" }))
        .resolves.toEqual({ allowed: true, basis: "administrator" });
    });

    it("다른 프로젝트나 다른 공급자만 허용돼 있으면 거부한다", async () => {
      const { policy } = policyWith(grantJson(
        { projectId: "project-other", providerId, targets: Object.values(testCase.target) },
        { projectId: "project-1", providerId: providerId === "notion" ? "linear" : "notion", targets: ["x"] },
      ));
      const decision = await decide(policy, inputFor(testCase.target));
      expect(decision).toMatchObject({
        allowed: false,
        code: "operator_connector_project_not_allowed",
      });
      if (decision.allowed) throw new Error("거부되어야 합니다.");
      expect(decision.message).toMatch(HANGUL);
    });

    it("허용 목록에 연결된 프로젝트라도 목록 밖 대상은 거부한다", async () => {
      const { policy } = policyWith(grantJson({
        projectId: "project-1",
        providerId,
        targets: Object.values(testCase.target),
      }));
      const decision = await decide(policy, inputFor(testCase.other));
      expect(decision).toMatchObject({
        allowed: false,
        code: "operator_connector_target_not_allowed",
      });
      if (decision.allowed) throw new Error("거부되어야 합니다.");
      expect(decision.message).toMatch(HANGUL);
      // 요청에 담긴 대상 값을 사유에 되풀이하지 않는다.
      for (const value of Object.values(testCase.other)) {
        expect(decision.message).not.toContain(value);
      }
    });

    it("허용 목록에 연결된 프로젝트의 허용 대상은 일반 사용자도 쓸 수 있다", async () => {
      const { policy } = policyWith(grantJson({
        projectId: "project-1",
        providerId,
        targets: Object.values(testCase.target),
      }));
      await expect(decide(policy, inputFor(testCase.target))).resolves.toEqual({
        allowed: true,
        basis: "operator-grant",
      });
    });

    it("대상 목록이 비어 있는 항목은 아무 대상도 허용하지 않는다", async () => {
      const { policy } = policyWith(grantJson({ projectId: "project-1", providerId, targets: [] }));
      await expect(decide(policy, inputFor(testCase.target))).resolves.toMatchObject({
        allowed: false,
        code: "operator_connector_target_not_allowed",
      });
    });

    it("관리자 조회가 실패하면 관리자가 아닌 것으로 보고 거부한다(예외를 던지지 않는다)", async () => {
      const { policy } = policyWith(undefined, ["admin-1"], true);
      await expect(decide(policy, inputFor(testCase.target), { actorUserId: "admin-1" }))
        .resolves.toMatchObject({ allowed: false, code: "operator_connector_admin_only" });
    });

    if (testCase.update) {
      it("ID 로 기존 항목을 고치는 요청은 허용 목록 프로젝트에서도 관리자만 쓸 수 있다", async () => {
        const grants = grantJson({
          projectId: "project-1",
          providerId,
          targets: Object.values(testCase.target),
        });
        const request = inputFor(testCase.target, testCase.update);

        const nonAdmin = policyWith(grants);
        const denied = await decide(nonAdmin.policy, request);
        expect(denied).toMatchObject({
          allowed: false,
          code: "operator_connector_object_update_admin_only",
        });
        if (denied.allowed) throw new Error("거부되어야 합니다.");
        expect(denied.message).toMatch(HANGUL);

        const admin = policyWith(grants, ["admin-1"]);
        await expect(decide(admin.policy, request, { actorUserId: "admin-1" }))
          .resolves.toEqual({ allowed: true, basis: "administrator" });
      });
    }
  });

  describe.each(TARGETLESS_CASES)("대상 지정이 없는 운영자 커넥터 $providerId", ({ providerId, action, input }) => {
    it("허용 목록이 없으면 일반 사용자는 거부하고 관리자는 허용한다", async () => {
      const { policy } = policyWith(undefined, ["admin-1"]);
      await expect(decide(policy, parsed(providerId, action, input)))
        .resolves.toMatchObject({ allowed: false, code: "operator_connector_admin_only" });
      await expect(decide(policy, parsed(providerId, action, input), { actorUserId: "admin-1" }))
        .resolves.toMatchObject({ allowed: true, basis: "administrator" });
    });

    it("프로젝트와 공급자가 허용 목록에 있으면 대상 목록 없이도 일반 사용자가 쓸 수 있다", async () => {
      const { policy } = policyWith(grantJson({ projectId: "project-1", providerId }));
      await expect(decide(policy, parsed(providerId, action, input))).resolves.toEqual({
        allowed: true,
        basis: "operator-grant",
      });
      await expect(decide(policy, parsed(providerId, action, input), { projectId: "project-2" }))
        .resolves.toMatchObject({ allowed: false, code: "operator_connector_project_not_allowed" });
    });
  });

  describe("대상 식별자 비교", () => {
    it("Notion·Linear UUID 는 하이픈과 대소문자가 달라도 같은 값으로 본다", async () => {
      const dashed = "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d";
      const { policy } = policyWith(grantJson(
        { projectId: "project-1", providerId: "notion", targets: [dashed] },
        { projectId: "project-1", providerId: "linear", targets: [dashed.toUpperCase()] },
      ));
      const compact = dashed.replaceAll("-", "");
      await expect(decide(policy, parsed("notion", "task.upsert", { dataSourceId: compact, title: "x" })))
        .resolves.toMatchObject({ allowed: true });
      await expect(decide(policy, parsed("linear", "task.upsert", { teamId: compact.toUpperCase(), title: "x" })))
        .resolves.toMatchObject({ allowed: true });
      await expect(decide(policy, parsed("notion", "task.upsert", {
        dataSourceId: "0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4e",
        title: "x",
      }))).resolves.toMatchObject({ allowed: false });
    });

    it("대소문자를 구분하는 식별자(Figma 파일 키·Zoom 사용자)는 정확히 같아야 한다", async () => {
      const { policy } = policyWith(grantJson(
        { projectId: "project-1", providerId: "figma", targets: ["AbCdEfGh12"] },
        { projectId: "project-1", providerId: "zoom", targets: ["KDcuGIm1QgePTO8WbOqwIQ"] },
      ));
      await expect(decide(policy, parsed("figma", "design.inspect", { fileKey: "abcdefgh12" })))
        .resolves.toMatchObject({ allowed: false, code: "operator_connector_target_not_allowed" });
      await expect(decide(policy, parsed("figma", "design.inspect", { fileKey: "AbCdEfGh12" })))
        .resolves.toMatchObject({ allowed: true });
      await expect(decide(policy, parsed("zoom", "meeting.create", {
        userId: "kdcugim1qgepto8wboqwiq",
        topic: "리뷰",
        startTime: "2026-10-02T14:00:00+09:00",
        durationMinutes: 30,
      }))).resolves.toMatchObject({ allowed: false });
    });
  });

  it("허용 목록 설정이 깨져 있으면 아무 항목도 열지 않고 사유를 노출한다", async () => {
    const { policy } = policyWith("{broken");
    expect(policy.configurationIssue).toMatch(HANGUL);
    await expect(decide(policy, parsed("notion", "task.upsert", { dataSourceId: "ds", title: "x" })))
      .resolves.toMatchObject({ allowed: false, code: "operator_connector_admin_only" });
  });
});

describe("보고된 악용 경로: 로그인한 일반 사용자가 자기 프로젝트에서 임의 대상으로 운영자 토큰을 쓰는 요청", () => {
  function wiredService(grants: string | undefined) {
    const production = {
      getProject: vi.fn().mockResolvedValue({
        aggregate: { projectId: "my-own-project" },
        access: { view: true, edit: true, manage: true },
      }),
    };
    const repository = {
      beginMutation: vi.fn().mockResolvedValue({ replay: null }),
      completeMutation: vi.fn().mockResolvedValue(undefined),
      failMutation: vi.fn().mockResolvedValue(undefined),
      listReceipts: vi.fn().mockResolvedValue([]),
    };
    const engine = {
      connectors: vi.fn(() => []),
      status: vi.fn((providerId: ProviderId) => integrationRuntimeConnectorStatus(providerId, {
        NOTION_API_TOKEN: "operator-notion-token-placeholder",
        LINEAR_API_TOKEN: "operator-linear-token-placeholder",
      })),
      execute: vi.fn().mockResolvedValue({ externalId: "page-1", response: { providerId: "notion" } }),
    };
    const { policy } = policyWith(grants, ["admin-1"]);
    const service = new IntegrationRuntimeService(
      production as unknown as ProductionCollaborationService,
      repository as unknown as IntegrationRuntimeRepository,
      engine as unknown as IntegrationRuntimeProviderEngine,
      policy,
    );
    return { service, engine, repository };
  }

  const body = (providerId: ProviderId, action: string, input: Record<string, unknown>, dryRun: boolean) => ({
    projectId: "my-own-project",
    mutationId: "11111111-1111-4111-8111-111111111111",
    dryRun,
    confirm: !dryRun,
    request: parsed(providerId, action, input),
  });

  async function forbiddenBody(promise: Promise<unknown>): Promise<unknown> {
    const error = await promise.then(() => null, (cause: unknown) => cause);
    expect(error).toBeInstanceOf(ForbiddenException);
    return (error as ForbiddenException).getResponse();
  }

  it("Notion: 임의 dataSourceId 로 운영자 토큰을 쓰려 하면 공급자 호출 없이 403 과 한국어 사유를 받는다", async () => {
    const { service, engine, repository } = wiredService(undefined);
    const response = await forbiddenBody(service.execute("user-1", body("notion", "task.upsert", {
      dataSourceId: "someone-elses-private-database",
      title: "탈취 시도",
    }, false)));
    expect(response).toMatchObject({
      code: "operator_connector_admin_only",
      message: expect.stringMatching(HANGUL),
    });
    expect(engine.execute).not.toHaveBeenCalled();
    expect(repository.beginMutation).not.toHaveBeenCalled();
  });

  it("Linear: 임의 teamId 와 issueId 로 기존 이슈를 수정하려 해도 막힌다", async () => {
    const { service, engine } = wiredService(grantJson({
      projectId: "my-own-project",
      providerId: "linear",
      targets: ["team-mine"],
    }));
    expect(await forbiddenBody(service.execute("user-1", body("linear", "task.upsert", {
      teamId: "team-mine",
      issueId: "someone-elses-issue",
      title: "덮어쓰기 시도",
    }, false)))).toMatchObject({ code: "operator_connector_object_update_admin_only" });
    expect(await forbiddenBody(service.execute("user-1", body("linear", "task.upsert", {
      teamId: "team-of-another-customer",
      title: "다른 팀에 이슈 만들기",
    }, true)))).toMatchObject({ code: "operator_connector_target_not_allowed" });
    expect(engine.execute).not.toHaveBeenCalled();
  });

  it("관리자와 허용 목록에 연결된 프로젝트·대상은 기존처럼 실행된다", async () => {
    const granted = wiredService(grantJson({
      projectId: "my-own-project",
      providerId: "notion",
      targets: ["ds-shared-with-integration"],
    }));
    await expect(granted.service.execute("user-1", body("notion", "task.upsert", {
      dataSourceId: "ds-shared-with-integration",
      title: "정상 생성",
    }, false))).resolves.toMatchObject({ state: "succeeded" });
    expect(granted.engine.execute).toHaveBeenCalledOnce();

    const admin = wiredService(undefined);
    await expect(admin.service.execute("admin-1", body("notion", "task.upsert", {
      dataSourceId: "any-data-source",
      title: "관리자 실행",
    }, false))).resolves.toMatchObject({ state: "succeeded" });
  });
});
