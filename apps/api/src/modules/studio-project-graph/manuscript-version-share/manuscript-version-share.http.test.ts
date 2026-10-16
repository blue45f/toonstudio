import "reflect-metadata";

import { Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { AllExceptionsFilter } from "../../../platform/http/all-exceptions.filter";
import { ManuscriptVersionShareController } from "./manuscript-version-share.controller";
import {
  ManuscriptVersionShareRepository,
  type VersionShareResolution,
} from "./manuscript-version-share.repository";
import { ManuscriptVersionShareService } from "./manuscript-version-share.service";

import type { AddressInfo } from "node:net";

// 실제 Nest HTTP 경계(컨트롤러 -> 서비스 -> 가드, 전역 예외 필터)에서 비밀번호 시도 한도의 응답 계약을 본다:
// 상태 코드, 본문의 code·retryAfterSeconds, Retry-After 헤더. 웹 클라이언트(ky 재시도 정책과 안내 문구)는 이 계약에 기댄다.

const RIGHT_PASSWORD = "right-password";
const okResolution: VersionShareResolution = {
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
    revisionKind: "commit",
    revisionMessage: null,
    createdBy: "user-1",
    createdAt: "2026-10-03T00:00:00.000Z",
  },
  revision: {
    id: "rev-1",
    artifactId: "artifact-1",
    kind: "commit",
    parentIds: [],
    rootGraphHash: "a".repeat(64),
    operationFirst: 1,
    operationLast: 2,
    createdBy: "user-1",
    deviceId: "device-1",
    createdAt: "2026-10-03T00:00:00.000Z",
    message: null,
  },
};

/**
 * DB 연결 + scrypt 를 흉내 내는 지연이 있는 저장소. 지연 동안 확인과 기록 사이에 await 가 끼는 실제 상황이 된다.
 * 지연은 100건이 도착하는 데 걸리는 시간보다 충분히 길게 잡아, 느린 실행 환경에서도 첫 요청들이 끝나기 전에 나머지가
 * 도착한다(도착 간격에 기대는 단언을 피하려는 것이지 속도를 단언하려는 것은 아니다).
 */
const VERIFY_DELAY_MS = 150;
const resolveShare = vi.fn(async (_token: string, password?: string): Promise<VersionShareResolution> => {
  await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS));
  if (!password) return { kind: "password_required" };
  return password === RIGHT_PASSWORD ? okResolution : { kind: "password_invalid" };
});

@Module({
  controllers: [ManuscriptVersionShareController],
  providers: [
    ManuscriptVersionShareService,
    { provide: ManuscriptVersionShareRepository, useValue: { resolveShare } },
  ],
})
class VersionShareHttpTestModule {}

let app: INestApplication;
let baseUrl: string;

beforeAll(async () => {
  app = await NestFactory.create(VersionShareHttpTestModule, { logger: false });
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(0, "127.0.0.1");
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
});

afterAll(async () => {
  await app.close();
});

interface Reply {
  readonly status: number;
  readonly retryAfter: string | null;
  readonly body: { code?: string; retryAfterSeconds?: number; message?: string };
}

async function resolve(token: string, password?: string, signal?: AbortSignal): Promise<Reply> {
  const response = await fetch(`${baseUrl}/studio-project-graph/version-shares/${token}`, {
    headers: { "x-user-id": "user-1", ...(password ? { "x-version-share-password": password } : {}) },
    ...(signal ? { signal } : {}),
  });
  return {
    status: response.status,
    retryAfter: response.headers.get("retry-after"),
    body: (await response.json()) as Reply["body"],
  };
}

const tokenFor = (name: string) => `${name}-token-0123456789`;

describe("공유 링크 비밀번호 시도 한도 HTTP 계약", () => {
  it("틀린 비밀번호를 동시에 100건 보내면 검증은 10건, 401 10건, 나머지 90건은 429(일시 차단 또는 잠금)이고 직후엔 잠금이다", async () => {
    const token = tokenFor("burst-wrong");
    resolveShare.mockClear();

    const replies = await Promise.all(Array.from({ length: 100 }, (_, index) => resolve(token, `guess-${index}`)));

    expect(resolveShare).toHaveBeenCalledTimes(10);
    expect(replies.filter((reply) => reply.status === 401)).toHaveLength(10);
    const blocked = replies.filter((reply) => reply.status === 429);
    expect(blocked).toHaveLength(90);
    // 요청이 한꺼번에 도착하는 동안은 오답이 아직 확정되지 않아 일시 차단(busy)이고, 늦게 도착한 요청은 확정된 오답을 보고
    // 잠금(locked)이다. 어느 쪽이든 코드와 Retry-After 가 서로 맞아야 하고, 초기 요청은 반드시 busy 다.
    expect(blocked.filter((reply) => reply.body.code === "version_share_password_busy").length).toBeGreaterThan(0);
    for (const reply of blocked) {
      if (reply.body.code === "version_share_password_busy") {
        expect(reply.body.retryAfterSeconds).toBe(1);
        expect(reply.retryAfter).toBe("1");
      } else {
        expect(reply.body.code).toBe("version_share_password_locked");
        expect(Number(reply.retryAfter)).toBeGreaterThan(60);
        expect(reply.body.retryAfterSeconds).toBe(Number(reply.retryAfter));
      }
    }

    // 오답 10건이 확정된 뒤에는 정답도 창이 끝날 때까지 막힌다. 이쪽은 잠금이고 Retry-After 는 남은 초다.
    const locked = await resolve(token, RIGHT_PASSWORD);
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe("version_share_password_locked");
    expect(Number(locked.retryAfter)).toBeGreaterThan(60);
    expect(Number(locked.retryAfter)).toBeLessThanOrEqual(900);
    expect(locked.body.retryAfterSeconds).toBe(Number(locked.retryAfter));
    expect(resolveShare).toHaveBeenCalledTimes(10);

    // 다른 링크는 영향받지 않는다.
    expect((await resolve(tokenFor("burst-other"), RIGHT_PASSWORD)).status).toBe(200);
  });

  it("정답을 동시에 50건 보내면 선점으로 일부가 일시 차단(busy)되지만 잠기지는 않아서, 직후 정답은 다시 열린다", async () => {
    const token = tokenFor("burst-right");

    const replies = await Promise.all(Array.from({ length: 50 }, () => resolve(token, RIGHT_PASSWORD)));

    // 도착 간격에 따라 열리는 수는 10건 이상이지만, 한도(10건)를 넘는 동시 검증은 없었다.
    const opened = replies.filter((reply) => reply.status === 200);
    const blocked = replies.filter((reply) => reply.status === 429);
    expect(opened.length + blocked.length).toBe(50);
    expect(opened.length).toBeGreaterThanOrEqual(10);
    expect(blocked.length).toBeGreaterThan(0);
    expect(resolveShare.mock.calls.filter(([calledToken]) => calledToken === token)).toHaveLength(opened.length);
    for (const reply of blocked) {
      // 오답이 없으니 확정된 오답도 없다: 잠금(locked)일 수 없고 항상 일시 차단이다.
      expect(reply.body).toMatchObject({ code: "version_share_password_busy", retryAfterSeconds: 1 });
      expect(reply.retryAfter).toBe("1");
    }
    expect((await resolve(token, RIGHT_PASSWORD)).status).toBe(200);
  });

  it("비밀번호 없는 요청과 정상 응답에는 Retry-After 가 없다", async () => {
    const token = tokenFor("plain");
    const required = await resolve(token);
    expect(required.status).toBe(401);
    expect(required.body.code).toBe("version_share_password_required");
    expect(required.retryAfter).toBeNull();

    const ok = await resolve(token, RIGHT_PASSWORD);
    expect(ok.status).toBe(200);
    expect(ok.retryAfter).toBeNull();
  });

  it("검증 중에 연결을 끊어도 선점이 남지 않는다(끊긴 요청도 서버에서 끝까지 정산된다)", async () => {
    const token = tokenFor("abort");
    const controller = new AbortController();
    const dropped = Array.from({ length: 10 }, (_, index) =>
      resolve(token, `guess-${index}`, controller.signal).catch(() => null),
    );
    await new Promise((resolve) => setTimeout(resolve, 5));
    controller.abort();
    await Promise.all(dropped);
    // 서버의 검증(VERIFY_DELAY_MS)이 모두 끝나 오답 10건이 확정될 때까지 기다린다.
    await new Promise((resolve) => setTimeout(resolve, VERIFY_DELAY_MS * 3));

    // 끊긴 10건이 모두 오답으로 확정됐으므로 이 링크는 잠겼고(잠금), 선점이 남아 영구 일시 차단이 되지는 않았다.
    const after = await resolve(token, RIGHT_PASSWORD);
    expect(after.status).toBe(429);
    expect(after.body.code).toBe("version_share_password_locked");
    // 선점이 샜다면 다른 링크의 정답도 영향받지 않아야 한다는 점으로 한 번 더 확인한다.
    expect((await resolve(tokenFor("abort-other"), RIGHT_PASSWORD)).status).toBe(200);
  });
});
