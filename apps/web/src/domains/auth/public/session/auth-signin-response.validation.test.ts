// @vitest-environment jsdom
// 중앙 검사 순서에서 기존 인증 회귀와 함께 실행한다.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAuthSession,
  getAuthToken,
  persistSession,
  readStoredSession,
  signIn,
  signInWithGoogleIdToken,
} from "./auth-session-store";

const apiRaw = vi.hoisted(() => vi.fn());
vi.mock("@/platform/api", () => ({
  api: { raw: apiRaw },
  apiPath: (path: string) => `/api${path}`,
  WRITE_TIMEOUT_MS: 75_000,
}));

type Provider = "credentials" | "google";
function attempt(provider: Provider) {
  return provider === "google"
    ? signInWithGoogleIdToken("synthetic.payload.signature")
    : signIn("credentials", { email: "fixture@example.test", password: "synthetic-fixture-only" });
}
function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  apiRaw.mockReset();
  persistSession(null);
});
afterEach(() => { persistSession(null); });

const malformedUsers = [
  ["빈 사용자", {}],
  ["공백 식별자", { id: "   " }],
  ["문자열이 아닌 식별자", { id: 42 }],
  ["배열 사용자", []],
  ["원시값 사용자", "not-a-user"],
  ["저장 상한을 넘는 UTF-8 프로필", {
    id: "valid-id", name: "가".repeat(4096), email: "나".repeat(4096), image: "다".repeat(4096),
  }],
] as const;

describe.each(["credentials", "google"] as const)("%s 로그인 응답 검증", (provider) => {
  it.each(malformedUsers)("%s를 성공으로 반환하거나 기존 세션을 지우지 않는다", async (_label, user) => {
    persistSession({ user: { id: "existing-user", name: "기존 사용자" }, token: null });
    const before = getAuthSession();
    const storedBefore = readStoredSession();
    apiRaw.mockResolvedValue(response({ user }));

    const result = await attempt(provider);

    expect(result).toMatchObject({ ok: false, status: 200 });
    expect(typeof result.error).toBe("string");
    expect(result.error).toBeTruthy();
    expect(getAuthSession()).toBe(before);
    expect(readStoredSession()).toEqual(storedBefore);
    expect(apiRaw).toHaveBeenCalledOnce();
  });

  it("게스트의 잘못된 성공 응답을 로그인 완료로 처리하지 않는다", async () => {
    apiRaw.mockResolvedValue(response({ user: {} }));
    const result = await attempt(provider);
    expect(result.ok).toBe(false);
    expect(getAuthSession()).toBeNull();
    expect(readStoredSession()).toBeNull();
    expect(apiRaw).toHaveBeenCalledOnce();
  });

  it("유효한 응답은 정규화한 공개 프로필만 반영하고 bearer를 남기지 않는다", async () => {
    apiRaw.mockResolvedValue(response({
      user: { id: "  next-user  ", name: "새 이름" },
      token: "synthetic-response-must-not-be-persisted",
    }));
    const result = await attempt(provider);
    expect(result).toMatchObject({ ok: true, error: null, status: 200 });
    expect(getAuthSession()).toEqual({ user: { id: "next-user", name: "새 이름" }, token: null });
    expect(readStoredSession()).toEqual(getAuthSession());
    expect(getAuthToken()).toBeNull();
    expect(apiRaw).toHaveBeenCalledOnce();
  });
});

describe("자격 로그인 오류 메시지 계약", () => {
  it.each([
    { error: { message: "잘못된 객체" } },
    { error: ["잘못된 배열"] },
    { error: 42 },
    { error: "   " },
  ])("비문자열·빈 오류를 안전한 기존 문자열로 대체한다: %j", async (payload) => {
    persistSession({ user: { id: "existing-user" }, token: null });
    const before = getAuthSession();
    apiRaw.mockResolvedValue(response(payload, 401));
    await expect(attempt("credentials")).resolves.toMatchObject({
      ok: false, status: 401, error: "auth-failed", url: null,
    });
    expect(getAuthSession()).toBe(before);
    expect(apiRaw).toHaveBeenCalledOnce();
  });
});
