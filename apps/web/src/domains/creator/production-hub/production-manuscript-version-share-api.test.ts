// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { api } from "@/platform/api";

import { resolveVersionShare } from "./production-manuscript-version-share-api";

vi.mock("@/platform/api", () => ({
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn() },
  isAppApiError: (error: unknown): boolean =>
    typeof error === "object" && error !== null && "__appApiError" in error,
}));

const get = vi.mocked(api.get);

function apiError(status: number, code: string | null, retryAfterSeconds: number | null = null): Error {
  return Object.assign(new Error("api error"), { __appApiError: true, status, code, retryAfterSeconds });
}

const OK_BODY = {
  kind: "ok",
  permission: "view",
  watermark: false,
  workId: "work-1",
  projectId: "project-1",
  artifactId: "artifact-1",
  artifactTitle: "1화 원고",
  workTitle: "달빛 기사",
  snapshot: {
    id: "snap-1",
    artifactId: "artifact-1",
    name: "v3",
    memo: "",
    revisionId: "rev-1",
    rootGraphHash: "a".repeat(64),
    revisionKind: "checkpoint",
    revisionMessage: null,
    createdBy: "user-1",
    createdAt: "2026-10-03T00:00:00.000Z",
  },
  revision: {
    id: "rev-1",
    artifactId: "artifact-1",
    kind: "checkpoint",
    parentIds: [],
    rootGraphHash: "a".repeat(64),
    operationFirst: 1,
    operationLast: 4,
    createdBy: "user-1",
    deviceId: "device-1",
    createdAt: "2026-10-03T00:00:00.000Z",
    message: null,
  },
};

describe("resolveVersionShare", () => {
  it("정상 응답은 ok 판정과 함께 돌려준다", async () => {
    get.mockResolvedValue(OK_BODY);
    const resolution = await resolveVersionShare("token-value-123456");
    expect(resolution.status).toBe("ok");
    if (resolution.status === "ok") {
      expect(resolution.share.workTitle).toBe("달빛 기사");
      expect(resolution.share.snapshot.name).toBe("v3");
    }
  });

  it("재시도 정책은 비밀번호를 실은 요청에만 따로 지정한다(첫 확인 요청은 공용 읽기 정책을 그대로 쓴다)", async () => {
    get.mockResolvedValue(OK_BODY);
    await resolveVersionShare("token-value-123456");
    expect((get.mock.calls.at(-1)?.[1] as { retry?: unknown }).retry).toBeUndefined();

    await resolveVersionShare("token-value-123456", "moon-1234");
    const retry = (get.mock.calls.at(-1)?.[1] as { retry?: Record<string, unknown> }).retry;
    // 동작(실제 ky 가 따르는지)은 production-manuscript-version-share-api.ky.test.ts 가 본다.
    expect(retry).toMatchObject({ limit: 1, statusCodes: [429], maxRetryAfter: 2_000, retryOnTimeout: false });
    expect(typeof retry?.shouldRetry).toBe("function");
  });

  it("비밀번호는 헤더로만 보낸다", async () => {
    get.mockResolvedValue(OK_BODY);
    await resolveVersionShare("token-value-123456", "moon-1234");
    const options = get.mock.calls.at(-1)?.[1] as { headers?: Record<string, string> };
    expect(options.headers).toEqual({ "x-version-share-password": "moon-1234" });
    expect(get.mock.calls.at(-1)?.[0]).not.toContain("moon-1234");
  });

  it.each([
    [404, "version_share_not_found", "not_found"],
    [410, "version_share_revoked", "revoked"],
    [410, "version_share_expired", "expired"],
    [401, "version_share_password_required", "password_required"],
    [401, "version_share_password_invalid", "password_invalid"],
    [429, "version_share_password_busy", "password_busy"],
  ] as const)("서버 코드 %s를 %s 판정으로 바꾼다", async (status, code, expected) => {
    get.mockRejectedValue(apiError(status, code));
    await expect(resolveVersionShare("token-value-123456")).resolves.toEqual({ status: expected });
  });

  it("비밀번호 시도 한도 429 는 잠금 판정으로 바꾸고 서버가 알려 준 재시도 초를 싣는다", async () => {
    get.mockRejectedValue(apiError(429, "version_share_password_locked", 900));
    await expect(resolveVersionShare("token-value-123456", "wrong")).resolves.toEqual({
      status: "password_locked",
      retryAfterSeconds: 900,
    });
  });

  it("코드가 다른 429(일반 속도 제한)는 잠금이 아니라 재시도 오류로 던진다", async () => {
    get.mockRejectedValue(apiError(429, "rate_limited", 30));
    await expect(resolveVersionShare("token-value-123456")).rejects.toMatchObject({ status: 429 });
  });

  it.each(["constructor", "toString", "__proto__", "hasOwnProperty"])(
    "판정 표에 없는 서버 코드 %s 는 객체 프로토타입의 속성으로 오인하지 않고 던진다",
    async (code) => {
      get.mockRejectedValue(apiError(400, code));
      await expect(resolveVersionShare("token-value-123456")).rejects.toMatchObject({ status: 400, code });
    },
  );

  it("403은 로그인 필요로 바꾼다", async () => {
    get.mockRejectedValue(apiError(403, null));
    await expect(resolveVersionShare("token-value-123456")).resolves.toEqual({
      status: "login_required",
    });
  });

  it("모르는 오류는 그대로 던져 페이지가 재시도를 안내하게 한다", async () => {
    get.mockRejectedValue(new Error("network down"));
    await expect(resolveVersionShare("token-value-123456")).rejects.toThrow("network down");
  });
});
