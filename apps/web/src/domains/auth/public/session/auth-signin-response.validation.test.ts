// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getAuthSession,
  getAuthToken,
  persistSession,
  signIn,
  signInWithGoogleIdToken,
} from "./auth-session-store";
import { SESSION_KEY } from "./auth-session-storage";

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
    headers: "Content-Type: application/json" as never,
  });
}
