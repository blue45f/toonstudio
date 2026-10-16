import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveVersionShare } from "./production-manuscript-version-share-api";

import type { AddressInfo } from "node:net";

// 실제 ky(공용 api 클라이언트)와 로컬 가짜 서버로 비밀번호를 실은 해석 요청의 재시도 동작을 본다. api.get 을 모킹한 시험은
// ky 의 재시도 정책(Retry-After 를 따라 기다림, 총 30초 제한)을 볼 수 없어 수정 전에는 이 결함을 잡지 못했다.
// 서버가 받은 요청 수가 핵심 단언이다: 비밀번호 확인은 서버가 시도 횟수를 세므로 자동 재시도가 요청을 늘리면 안 된다.

const TOKEN = "token-value-123456";
const PASSWORD = "moon-1234";

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

interface Scripted {
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  /** 응답 없이 연결을 끊는다(네트워크 오류). */
  readonly drop?: boolean;
}

/** 서버(apps/api)가 실제로 내리는 응답과 같은 모양이다(전역 예외 필터가 path·timestamp·requestId 를 더한다). */
const envelope = (statusCode: number, code: string, extra: Record<string, unknown> = {}) => ({
  statusCode,
  code,
  message: "서버 메시지",
  path: `/api/studio-project-graph/version-shares/${TOKEN}`,
  timestamp: "2026-10-16T00:00:00.000Z",
  requestId: "req_1",
  ...extra,
});

const BUSY: Scripted = {
  status: 429,
  headers: { "Retry-After": "1" },
  body: envelope(429, "version_share_password_busy", { retryAfterSeconds: 1 }),
};
const LOCKED: Scripted = {
  status: 429,
  headers: { "Retry-After": "900" },
  body: envelope(429, "version_share_password_locked", { retryAfterSeconds: 900 }),
};
const OK: Scripted = { status: 200, body: OK_BODY };

interface Received {
  readonly at: number;
  readonly password: string | undefined;
}

let server: Server;
let script: Scripted[] = [];
let received: Received[] = [];

function handle(request: IncomingMessage, response: ServerResponse): void {
  received.push({ at: Date.now(), password: request.headers["x-version-share-password"] as string | undefined });
  const next = script.length > 1 ? script.shift()! : script[0]!;
  if (next.drop) {
    request.socket.destroy();
    return;
  }
  response.writeHead(next.status, { "Content-Type": "application/json", ...next.headers });
  response.end(JSON.stringify(next.body ?? {}));
}

beforeAll(async () => {
  server = createServer(handle);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  vi.stubEnv("VITE_API_BASE", `http://127.0.0.1:${(server.address() as AddressInfo).port}`);
});

afterAll(async () => {
  vi.unstubAllEnvs();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  script = [];
  received = [];
});

// 수정 전에는 잠금 응답에서 30초를 기다리다 총 시간 제한에 걸린다. 그 경우 이 제한(10초)에서 시험이 실패한다.
const TEST_TIMEOUT_MS = 10_000;

describe("비밀번호를 실은 해석 요청의 ky 재시도(실제 ky, 로컬 서버)", () => {
  it("잠금(429, Retry-After 900)은 기다리거나 다시 보내지 않고 곧바로 잠금 판정과 서버가 알린 시간을 돌려준다", async () => {
    script = [LOCKED];

    const resolution = await resolveVersionShare(TOKEN, PASSWORD);

    expect(resolution).toEqual({ status: "password_locked", retryAfterSeconds: 900 });
    expect(received).toHaveLength(1);
  }, TEST_TIMEOUT_MS);

  it("일시 차단(429 busy, Retry-After 1)은 Retry-After 만큼 기다린 뒤 한 번 다시 보내 열린다", async () => {
    script = [BUSY, OK];

    const resolution = await resolveVersionShare(TOKEN, PASSWORD);

    expect(resolution.status).toBe("ok");
    expect(received).toHaveLength(2);
    // 같은 비밀번호를 한 번 더 보냈고, 서버가 알린 시간(1초)만큼 기다렸다(타이머 오차를 감안한 하한).
    expect(received.map((entry) => entry.password)).toEqual([PASSWORD, PASSWORD]);
    expect(received[1]!.at - received[0]!.at).toBeGreaterThanOrEqual(900);
  }, TEST_TIMEOUT_MS);

  it("서버가 더 오래 기다리라고 해도(Retry-After 30) 대기는 2초로 묶인다", async () => {
    script = [{ ...BUSY, headers: { "Retry-After": "30" } }, OK];

    const resolution = await resolveVersionShare(TOKEN, PASSWORD);

    expect(resolution.status).toBe("ok");
    expect(received).toHaveLength(2);
    // 30초를 따랐다면 이 시험의 제한(10초)에 걸려 실패한다. 하한은 묶인 대기(2초)를 따랐다는 뜻이다.
    expect(received[1]!.at - received[0]!.at).toBeGreaterThanOrEqual(1_900);
  }, TEST_TIMEOUT_MS);

  it("다시 보내도 계속 막혀 있으면 한 번만 재시도하고 일시 차단 판정을 돌려준다", async () => {
    script = [BUSY];

    const resolution = await resolveVersionShare(TOKEN, PASSWORD);

    expect(resolution).toEqual({ status: "password_busy" });
    expect(received).toHaveLength(2);
  }, TEST_TIMEOUT_MS);

  it("서버가 시도를 이미 셌을 수 있는 실패(503·연결 끊김)는 자동으로 다시 보내지 않아 시도 횟수를 늘리지 않는다", async () => {
    script = [{ status: 503, body: envelope(503, "SERVICE_NOT_READY") }, OK];
    await expect(resolveVersionShare(TOKEN, PASSWORD)).rejects.toMatchObject({ status: 503 });
    expect(received).toHaveLength(1);

    received = [];
    script = [{ status: 200, drop: true }, OK];
    await expect(resolveVersionShare(TOKEN, PASSWORD)).rejects.toBeTruthy();
    expect(received).toHaveLength(1);
  }, TEST_TIMEOUT_MS);

  it("코드가 다른 429(일반 속도 제한)도 다시 보내지 않고 재시도 가능한 오류로 던진다", async () => {
    script = [{ status: 429, headers: { "Retry-After": "1" }, body: envelope(429, "rate_limited", { retryAfterSeconds: 1 }) }, OK];

    await expect(resolveVersionShare(TOKEN, PASSWORD)).rejects.toMatchObject({ status: 429, code: "rate_limited" });
    expect(received).toHaveLength(1);
  }, TEST_TIMEOUT_MS);

  it("비밀번호가 없는 첫 확인 요청은 시도로 세어지지 않으므로 공용 읽기 정책의 재시도를 그대로 받는다", async () => {
    script = [{ status: 503, body: envelope(503, "SERVICE_NOT_READY") }, OK];

    const resolution = await resolveVersionShare(TOKEN);

    expect(resolution.status).toBe("ok");
    expect(received).toHaveLength(2);
    expect(received.every((entry) => entry.password === undefined)).toBe(true);
  }, TEST_TIMEOUT_MS);
});

describe("해석 판정(실제 ky 와 서버 응답 모양)", () => {
  it.each([
    [404, "version_share_not_found", "not_found"],
    [410, "version_share_revoked", "revoked"],
    [410, "version_share_expired", "expired"],
  ] as const)("서버의 %s %s 응답을 %s 판정으로 바꾼다", async (status, code, expected) => {
    script = [{ status, body: envelope(status, code) }];

    await expect(resolveVersionShare(TOKEN)).resolves.toEqual({ status: expected });
  }, TEST_TIMEOUT_MS);
});
