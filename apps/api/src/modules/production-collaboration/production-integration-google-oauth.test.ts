import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionIntegrationGoogleStartQuerySchema } from "./production-integration.dto";
import { ProductionIntegrationService } from "./production-integration.service";

import type { ProductionCollaborationService } from "./production-collaboration.service";
import type { ProductionIntegrationRepository } from "./production-integration.repository";

const google = vi.hoisted(() => ({
  authorizationUrl: vi.fn(),
  exchange: vi.fn(),
  userInfo: vi.fn(),
}));

vi.mock("./production-google-workspace", () => ({
  createGoogleGmailDraft: vi.fn(),
  exchangeGoogleAuthorizationCode: google.exchange,
  googleAuthorizationUrl: google.authorizationUrl,
  googleUserInfo: google.userInfo,
  refreshGoogleCredential: vi.fn(),
  syncGoogleCalendar: vi.fn(),
  uploadGoogleDriveArtifact: vi.fn(),
}));

const OWNER = "owner-user";
const ATTACKER_BROWSER_USER = "someone-else";
const PROJECT_ID = "project-1";
const STATE = "s".repeat(43);

function fixture(redirectPath = "/production/projects/project-1?tab=files") {
  const projects = {
    getProject: vi.fn().mockResolvedValue({
      aggregate: { title: "Project" },
      access: { view: true, comment: true, edit: true, manage: true, owner: true, role: "owner" },
    }),
  };
  const repository = {
    createOauthState: vi.fn().mockResolvedValue(undefined),
    consumeOauthState: vi.fn().mockResolvedValue({
      projectId: PROJECT_ID,
      actorUserId: OWNER,
      redirectPath,
    }),
    upsertConnection: vi.fn().mockResolvedValue(undefined),
  };
  const service = new ProductionIntegrationService(
    projects as unknown as ProductionCollaborationService,
    repository as unknown as ProductionIntegrationRepository,
  );
  return { projects, repository, service };
}

beforeEach(() => {
  vi.stubEnv("PRODUCTION_GOOGLE_OAUTH_CLIENT_ID", "test-client-id");
  vi.stubEnv("PRODUCTION_GOOGLE_OAUTH_CLIENT_SECRET", "test-client-secret");
  vi.stubEnv(
    "PRODUCTION_GOOGLE_OAUTH_REDIRECT_URI",
    "https://www.toonstudio.cloud/api/integrations/google/callback",
  );
  vi.stubEnv("PRODUCTION_INTEGRATION_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  google.authorizationUrl.mockReset().mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?state=x");
  google.exchange.mockReset().mockResolvedValue({
    accessToken: "access",
    refreshToken: "refresh",
    scope: "openid email",
    expiresAt: Date.now() + 3_600_000,
  });
  google.userInfo.mockReset().mockResolvedValue({ sub: "google-sub", email: "owner@example.com" });
});

afterEach(() => vi.unstubAllEnvs());

describe("Google Workspace 연동 시작 redirectPath", () => {
  // 정규화 후 `//host`가 되는 경로는 콜백의 303 리다이렉트를 외부로 보낸다(오픈 리다이렉트).
  it.each([
    "/production/..//evil.example/x",
    "/production/../\\evil.example",
    "/production/%2e%2e//evil.example",
    "/production/%2E%2E//evil.example",
    "/production\\..\\\\evil.example",
    "/production/..",
    "/production/../admin",
    "//evil.example/production",
    "/productionx",
    "https://evil.example/production",
  ])("정규화 뒤 /production 밖으로 나가는 값은 거부한다: %s", (redirectPath) => {
    expect(ProductionIntegrationGoogleStartQuerySchema.safeParse({ redirectPath }).success).toBe(false);
  });

  it.each([
    "/production",
    "/production/",
    "/production/projects/project-1",
    "/production/projects/project-1?tab=files&view=grid",
    "/production/projects/a/../b",
  ])("정상적인 앱 내부 경로는 허용한다: %s", (redirectPath) => {
    expect(ProductionIntegrationGoogleStartQuerySchema.safeParse({ redirectPath }).success).toBe(true);
  });

  it("값이 없으면 /production 으로 기본 설정한다", () => {
    expect(ProductionIntegrationGoogleStartQuerySchema.parse({}).redirectPath).toBe("/production");
  });

  it("서비스도 직접 호출된 위험 경로를 상태 저장소에 쓰지 않는다", async () => {
    const test = fixture();
    await expect(
      test.service.googleConnectUrl(OWNER, PROJECT_ID, "/production/..//evil.example/x"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(test.repository.createOauthState).not.toHaveBeenCalled();
  });

  it("정상 경로는 정규화된 형태로 상태에 저장한다", async () => {
    const test = fixture();
    await test.service.googleConnectUrl(OWNER, PROJECT_ID, "/production/projects/a/../b?tab=files");
    expect(test.repository.createOauthState).toHaveBeenCalledWith(
      expect.objectContaining({ redirectPath: "/production/projects/b?tab=files" }),
    );
  });
});

describe("Google Workspace 콜백 리다이렉트", () => {
  it("이미 저장된 위험 경로(수정 전 발급된 상태)도 스킴 상대 URL로 내보내지 않는다", async () => {
    const test = fixture("/production/..//evil.example/x");
    const result = await test.service.googleCallback({ state: STATE, code: "code" }, OWNER);
    expect(result.redirectPath.startsWith("//")).toBe(false);
    expect(result.redirectPath.startsWith("/production")).toBe(true);
    expect(new URL(result.redirectPath, "https://www.toonstudio.cloud").origin).toBe(
      "https://www.toonstudio.cloud",
    );
  });

  it("거부 응답(error) 경로에서도 같은 방어가 적용된다", async () => {
    const test = fixture("/production/..//evil.example/x");
    const result = await test.service.googleCallback({ state: STATE, error: "access_denied" }, OWNER);
    expect(result.redirectPath.startsWith("//")).toBe(false);
    expect(result.redirectPath).toContain("status=denied");
  });

  it("정상 경로는 쿼리를 보존하며 연결 결과를 덧붙인다", async () => {
    const test = fixture("/production/projects/project-1?tab=files");
    const result = await test.service.googleCallback({ state: STATE, code: "code" }, OWNER);
    expect(result.redirectPath).toBe(
      "/production/projects/project-1?tab=files&integration=google&status=connected",
    );
  });
});

describe("Google Workspace 콜백 브라우저 바인딩", () => {
  // 공격자가 자기 프로젝트용 state 로 만든 동의 URL 을 피해자가 완료하면, 피해자의 Google
  // 자격증명(calendar·gmail.compose·drive.file)이 공격자 프로젝트에 연결된다(OAuth 로그인 CSRF).
  it("연결을 시작한 계정과 다른 세션의 브라우저가 완료하려 하면 거부하고 토큰을 교환하지 않는다", async () => {
    const test = fixture();
    await expect(
      test.service.googleCallback({ state: STATE, code: "victim-code" }, ATTACKER_BROWSER_USER),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(google.exchange).not.toHaveBeenCalled();
    expect(google.userInfo).not.toHaveBeenCalled();
    expect(test.repository.upsertConnection).not.toHaveBeenCalled();
  });

  it("로그인 세션이 없는 브라우저도 거부한다", async () => {
    const test = fixture();
    await expect(
      test.service.googleCallback({ state: STATE, code: "victim-code" }, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(google.exchange).not.toHaveBeenCalled();
    expect(test.repository.upsertConnection).not.toHaveBeenCalled();
  });

  it("거부(error) 응답 처리에서도 시작한 계정이 아니면 경로 정보를 돌려주지 않는다", async () => {
    const test = fixture();
    await expect(
      test.service.googleCallback({ state: STATE, error: "access_denied" }, ATTACKER_BROWSER_USER),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("시작한 계정의 브라우저는 기존처럼 연결을 완료한다", async () => {
    const test = fixture();
    const result = await test.service.googleCallback({ state: STATE, code: "code" }, OWNER);
    expect(google.exchange).toHaveBeenCalledOnce();
    expect(test.repository.upsertConnection).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT_ID, actorUserId: OWNER }),
    );
    expect(result.redirectPath).toContain("status=connected");
  });
});
