import { describe, expect, it, vi } from "vitest";

import { inspectLocalCloudflareOAuth, readLocalWranglerOAuthToken } from "./cloudflare-local-oauth.mjs";

const accountId = "a".repeat(32);
const sample = "synthetic-session";
const unavailable = { auth: "unavailable", workerStatus: null, r2Status: null };

describe("로컬 Wrangler OAuth", () => {
  it("기본 프로필을 격리된 CLI로 읽고 출력과 오류를 메모리에서만 받는다", () => {
    const run = vi.fn(() => ({ status: 0, stdout: JSON.stringify({ type: "oauth", token: sample }) }));
    const env = {
      HOME: "/test/profile", PATH: "/test/bin", CLOUDFLARE_ACCOUNT_ID: accountId,
      CLOUDFLARE_API_TOKEN: "ambient-fixture", CF_API_KEY: "ambient-key",
      CF_API_BASE_URL: "https://example.invalid", WRANGLER_LOG: "debug", WRANGLER_WRITE_LOGS: "true",
    };
    expect(readLocalWranglerOAuthToken(env, run)).toBe(sample);
    expect(run).toHaveBeenCalledWith("pnpm", ["exec", "wrangler", "auth", "token", "--json", "--env-file", "/dev/null"], expect.objectContaining({
      stdio: ["ignore", "pipe", "pipe"],
      env: { HOME: env.HOME, PATH: env.PATH, CLOUDFLARE_ACCOUNT_ID: accountId, WRANGLER_LOG: "log", WRANGLER_WRITE_LOGS: "false", WRANGLER_SEND_METRICS: "false" },
    }));
    expect(env.WRANGLER_LOG).toBe("debug");
  });

  it.each([
    { status: 1, stdout: sample, stderr: sample },
    { status: 0, stdout: sample },
    { status: 0, stdout: JSON.stringify({ type: "api_token", token: sample }) },
    { status: 0, stdout: JSON.stringify({ type: "oauth", token: sample + "\n" }) },
  ])("실패 시 CLI 응답이나 다른 종류의 인증을 내보내지 않는다", (result) => {
    const read = () => readLocalWranglerOAuthToken({}, () => result);
    expect(read).toThrow(/로컬 Wrangler OAuth/u);
    expect(read).not.toThrow(sample);
  });

  it("잘못된 계정, 비로컬 실행은 CLI와 네트워크에 접근하지 않는다", async () => {
    const readToken = vi.fn();
    const fetchImpl = vi.fn();
    for (const options of [{ accountId: "../" }, { accountId, env: { CI: "true" } }, { accountId, env: { GITHUB_ACTIONS: "true" } }]) {
      expect(await inspectLocalCloudflareOAuth({ env: {}, readToken, fetchImpl, ...options })).toEqual(unavailable);
    }
    expect(readToken).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("Worker와 R2의 GET 결과를 개별 보고하고 응답과 자격 정보는 버린다", async () => {
    const fetchImpl = vi.fn(async (url) => new Response(sample, { status: url.includes("/workers/") ? 200 : 403 }));
    const result = await inspectLocalCloudflareOAuth({ accountId, env: {}, readToken: () => sample, fetchImpl });
    expect(result).toEqual({ auth: "oauth", workerStatus: 200, r2Status: 403 });
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/toonspectrum-web/versions?per_page=1`,
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/toonspectrum-public-assets/objects?per_page=1`,
    ]);
    for (const [, init] of fetchImpl.mock.calls) {
      expect(init).toMatchObject({ method: "GET", redirect: "error", headers: { authorization: "Bearer " + sample } });
    }
  });

  it("로그인 실패와 일부 네트워크 실패를 구분한다", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.includes("/workers/")) throw new Error(sample);
      return new Response(null, { status: 200 });
    });
    expect(await inspectLocalCloudflareOAuth({ accountId, env: {}, readToken: () => { throw new Error(sample); }, fetchImpl })).toEqual(unavailable);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await inspectLocalCloudflareOAuth({ accountId, env: {}, readToken: () => sample, fetchImpl })).toEqual({ auth: "oauth", workerStatus: null, r2Status: 200 });
  });
});
