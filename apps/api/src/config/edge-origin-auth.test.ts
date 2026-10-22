import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

import {
  createEdgeOriginAuthMiddleware,
  EdgeOriginAuthConfigurationError,
  EDGE_ORIGIN_AUTH_HEADER,
  edgeOriginAuthStartupFinding,
  edgeOriginSecretMatches,
  resolveEdgeOriginAuthStatus,
  resolveEdgeOriginSecret,
} from "./edge-origin-auth";

function request(
  path: string,
  secret?: string,
  method = "GET",
): Request {
  return {
    method,
    path,
    headers: secret ? { [EDGE_ORIGIN_AUTH_HEADER]: secret } : {},
  } as unknown as Request;
}

function response() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));
  return {
    value: { status } as unknown as Response,
    status,
    json,
  };
}

describe("Cloudflare edge origin authentication", () => {
  const secret = "edge-origin-secret-with-at-least-thirty-two-bytes";

  it("is disabled when no shared secret is configured", () => {
    const next = vi.fn<NextFunction>();
    createEdgeOriginAuthMiddleware({})(request("/api/projects"), response().value, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows Render health probes without exposing the shared secret", () => {
    const next = vi.fn<NextFunction>();
    createEdgeOriginAuthMiddleware({
      CLOUDFLARE_EDGE_ORIGIN_SECRET: secret,
    })(request("/api/health/ready"), response().value, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects direct non-health traffic without the exact secret", () => {
    const next = vi.fn<NextFunction>();
    const output = response();
    createEdgeOriginAuthMiddleware({
      CLOUDFLARE_EDGE_ORIGIN_SECRET: secret,
    })(request("/api/projects", "wrong-secret"), output.value, next);
    expect(next).not.toHaveBeenCalled();
    expect(output.status).toHaveBeenCalledWith(403);
    expect(output.json).toHaveBeenCalledWith(expect.objectContaining({
      error: "forbidden",
    }));
  });

  it("accepts traffic authenticated by the Cloudflare gateway", () => {
    const next = vi.fn<NextFunction>();
    createEdgeOriginAuthMiddleware({
      CLOUDFLARE_EDGE_ORIGIN_SECRET: secret,
    })(request("/api/projects", secret), response().value, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("fails closed for weak or padded production configuration", () => {
    expect(() => createEdgeOriginAuthMiddleware({
      CLOUDFLARE_EDGE_ORIGIN_SECRET: "too-short",
    })).toThrow(EdgeOriginAuthConfigurationError);
    expect(() => createEdgeOriginAuthMiddleware({
      CLOUDFLARE_EDGE_ORIGIN_SECRET: `${secret} `,
    })).toThrow(EdgeOriginAuthConfigurationError);
  });
});

describe("Cloudflare edge origin shared secret helpers", () => {
  const secret = "edge-origin-secret-with-at-least-thirty-two-bytes";

  it("resolves the shared secret or null, and rejects weak or padded values", () => {
    expect(resolveEdgeOriginSecret({})).toBeNull();
    expect(resolveEdgeOriginSecret({ CLOUDFLARE_EDGE_ORIGIN_SECRET: "" })).toBeNull();
    expect(
      resolveEdgeOriginSecret({ CLOUDFLARE_EDGE_ORIGIN_SECRET: secret })?.equals(
        Buffer.from(secret, "utf8"),
      ),
    ).toBe(true);
    expect(() => resolveEdgeOriginSecret({ CLOUDFLARE_EDGE_ORIGIN_SECRET: "too-short" }))
      .toThrow(EdgeOriginAuthConfigurationError);
    expect(() => resolveEdgeOriginSecret({ CLOUDFLARE_EDGE_ORIGIN_SECRET: `${secret} ` }))
      .toThrow(EdgeOriginAuthConfigurationError);
  });

  it("matches only one exact string value", () => {
    const expected = Buffer.from(secret, "utf8");
    expect(edgeOriginSecretMatches(secret, expected)).toBe(true);
    expect(edgeOriginSecretMatches(`${secret}x`, expected)).toBe(false);
    expect(edgeOriginSecretMatches(secret.slice(0, -1), expected)).toBe(false);
    expect(edgeOriginSecretMatches("x".repeat(secret.length), expected)).toBe(false);
    expect(edgeOriginSecretMatches(undefined, expected)).toBe(false);
    expect(edgeOriginSecretMatches([secret], expected)).toBe(false);
    expect(edgeOriginSecretMatches("", expected)).toBe(false);
  });
});

describe("Cloudflare edge origin authentication status", () => {
  const secret = "edge-origin-secret-with-at-least-thirty-two-bytes";

  it("reports enforced only when a valid shared secret is configured", () => {
    expect(resolveEdgeOriginAuthStatus({})).toBe("disabled");
    expect(resolveEdgeOriginAuthStatus({ CLOUDFLARE_EDGE_ORIGIN_SECRET: "" })).toBe("disabled");
    expect(resolveEdgeOriginAuthStatus({ CLOUDFLARE_EDGE_ORIGIN_SECRET: secret })).toBe("enforced");
    // 잘못된 값은 미들웨어 생성이 실패해 부팅하지 못하므로 집행 중이라고 말하지 않는다.
    expect(resolveEdgeOriginAuthStatus({ CLOUDFLARE_EDGE_ORIGIN_SECRET: "too-short" })).toBe("disabled");
    expect(resolveEdgeOriginAuthStatus({ CLOUDFLARE_EDGE_ORIGIN_SECRET: `${secret} ` })).toBe("disabled");
  });

  it("matches what the middleware actually does for a valid configuration", () => {
    const next = vi.fn<NextFunction>();
    const output = response();
    const environment = { CLOUDFLARE_EDGE_ORIGIN_SECRET: secret };
    expect(resolveEdgeOriginAuthStatus(environment)).toBe("enforced");
    createEdgeOriginAuthMiddleware(environment)(request("/api/projects"), output.value, next);
    expect(next).not.toHaveBeenCalled();
    expect(output.status).toHaveBeenCalledWith(403);
  });
});

describe("Cloudflare edge origin authentication startup finding", () => {
  const secret = "edge-origin-secret-with-at-least-thirty-two-bytes";

  it("reports a Korean error naming the variable and the capabilities field for the production web API without a secret", () => {
    for (const environment of [
      { NODE_ENV: "production" },
      { NODE_ENV: "production", API_RUNTIME_ROLE: "full" },
      { NODE_ENV: "production", API_RUNTIME_ROLE: "full", CLOUDFLARE_EDGE_ORIGIN_SECRET: "" },
    ]) {
      const finding = edgeOriginAuthStartupFinding(environment);
      expect(finding, JSON.stringify(environment)).toEqual(expect.stringContaining("CLOUDFLARE_EDGE_ORIGIN_SECRET"));
      expect(finding).toContain("edgeOriginAuth");
      expect(finding).toMatch(/[가-힣]/u);
    }
  });

  it("stays quiet when the secret is configured or the runtime does not serve the public web API", () => {
    expect(edgeOriginAuthStartupFinding({
      NODE_ENV: "production",
      CLOUDFLARE_EDGE_ORIGIN_SECRET: secret,
    })).toBeNull();
    expect(edgeOriginAuthStartupFinding({ NODE_ENV: "development" })).toBeNull();
    expect(edgeOriginAuthStartupFinding({ NODE_ENV: "test" })).toBeNull();
    expect(edgeOriginAuthStartupFinding({})).toBeNull();
    expect(edgeOriginAuthStartupFinding({
      NODE_ENV: "production",
      API_RUNTIME_ROLE: "capability-worker",
    })).toBeNull();
    expect(edgeOriginAuthStartupFinding({
      NODE_ENV: "production",
      API_RUNTIME_ROLE: "studio-live",
    })).toBeNull();
  });

  it("leaves an invalid secret to the fail-closed middleware instead of repeating it in the log", () => {
    expect(edgeOriginAuthStartupFinding({
      NODE_ENV: "production",
      CLOUDFLARE_EDGE_ORIGIN_SECRET: "too-short",
    })).toBeNull();
  });

  it("never includes a secret value", () => {
    const finding = edgeOriginAuthStartupFinding({ NODE_ENV: "production" });
    expect(finding).not.toContain(secret);
  });
});
