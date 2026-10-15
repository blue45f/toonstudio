import { Agent, request as httpsRequest } from "node:https";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionPushSubscriptionSchema } from "./production-integration.dto";
import { sendProductionNotification } from "./production-notification-provider";
import {
  createPublicOnlyHttpsAgent,
  createPublicOnlyLookup,
  parseWebPushEndpoint,
} from "./production-web-push-network";

import type { ProductionIntegrationConfig } from "./production-integration-config";
import type { ProductionPushSubscriptionRecord } from "./production-integration.repository";

const webPush = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("web-push", () => ({ default: webPush }));

const PUBLIC_PUSH_ENDPOINTS = [
  "https://fcm.googleapis.com/fcm/send/abcDEF123:APA91bExample",
  "https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB",
  "https://web.push.apple.com/QGxyz123",
  "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAExample",
  "https://push.example-vendor.com/subscription/42",
];

// 사용자가 등록한 구독 endpoint 로 서버가 요청을 보내므로, 내부망·로컬·메타데이터 주소로 향하는
// 값이 등록되면 서버가 대신 내부 서비스에 접속한다(SSRF). 응답 코드(2xx/404/410)가 전송 결과로
// 되돌아와 내부 서비스 존재 여부를 알려 주는 오라클도 된다.
const FORBIDDEN_PUSH_ENDPOINTS = [
  "https://127.0.0.1/x",
  "https://127.0.0.1:4001/api/health/ready",
  "https://localhost/x",
  "https://LOCALHOST./x",
  "https://[::1]/x",
  "https://10.0.0.5/x",
  "https://169.254.169.254/latest/meta-data/",
  "https://2130706433/x",
  "https://0x7f.1/x",
  "https://metadata.google.internal/computeMetadata/v1/",
  "https://service.internal/x",
  "https://db.local/x",
  "https://intranet/x",
  // 인증 정보가 포함된 URL 리터럴은 비밀 스캐너가 오탐하므로 런타임에 조립한다.
  ["https://", "user", ":", "pw", "@fcm.googleapis.com/x"].join(""),
  "https://fcm.googleapis.com:8443/x",
  "https://fcm.googleapis.com\\@127.0.0.1/x",
  "https://fcm.googleapis.com/x y",
  "http://fcm.googleapis.com/x",
  "ftp://fcm.googleapis.com/x",
];

describe("웹 푸시 구독 endpoint 검증", () => {
  it.each(PUBLIC_PUSH_ENDPOINTS)("공개 HTTPS 푸시 서비스 주소는 허용한다: %s", (endpoint) => {
    expect(parseWebPushEndpoint(endpoint)).not.toBeNull();
  });

  it.each(FORBIDDEN_PUSH_ENDPOINTS)("내부망·로컬·비표준 주소는 거부한다: %s", (endpoint) => {
    expect(parseWebPushEndpoint(endpoint)).toBeNull();
  });

  it("DTO 스키마도 같은 기준으로 구독 등록을 거부한다", () => {
    const keys = { p256dh: "p".repeat(64), auth: "a".repeat(22) };
    for (const endpoint of PUBLIC_PUSH_ENDPOINTS) {
      expect(ProductionPushSubscriptionSchema.safeParse({ endpoint, keys }).success).toBe(true);
    }
    for (const endpoint of FORBIDDEN_PUSH_ENDPOINTS) {
      expect(ProductionPushSubscriptionSchema.safeParse({ endpoint, keys }).success).toBe(false);
    }
  });
});

describe("웹 푸시 전송 연결 시점 주소 검증", () => {
  function lookupWith(answers: readonly { address: string; family: number }[]) {
    return createPublicOnlyLookup(async () => answers);
  }

  function resolve(lookup: ReturnType<typeof lookupWith>, all: boolean) {
    return new Promise<{ error: Error | null; result: unknown[] }>((done) => {
      (lookup as unknown as (
        hostname: string,
        options: object,
        callback: (...args: unknown[]) => void,
      ) => void)("push.example.com", all ? { all: true } : {}, (error, ...result) =>
        done({ error: (error as Error | null) ?? null, result }));
    });
  }

  it("공개 주소로만 해석되는 호스트는 허용한다", async () => {
    const single = await resolve(lookupWith([{ address: "8.8.8.8", family: 4 }]), false);
    expect(single.error).toBeNull();
    expect(single.result).toEqual(["8.8.8.8", 4]);

    const all = await resolve(
      lookupWith([
        { address: "142.250.190.14", family: 4 },
        { address: "2607:f8b0:4005:80a::200e", family: 6 },
      ]),
      true,
    );
    expect(all.error).toBeNull();
    expect(all.result[0]).toEqual([
      { address: "142.250.190.14", family: 4 },
      { address: "2607:f8b0:4005:80a::200e", family: 6 },
    ]);
  });

  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.9",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "fc00::1",
    "fe80::1",
    "::ffff:10.0.0.1",
  ])("공개 도메인이 사설 주소 %s 로 해석되면 연결을 거부한다", async (address) => {
    const family = address.includes(":") ? 6 : 4;
    const outcome = await resolve(lookupWith([{ address, family }]), false);
    expect(outcome.error).toBeInstanceOf(Error);
  });

  it("해석 결과 중 하나라도 사설 주소면 전체를 거부한다(분할 DNS)", async () => {
    const outcome = await resolve(
      lookupWith([
        { address: "8.8.8.8", family: 4 },
        { address: "10.0.0.8", family: 4 },
      ]),
      true,
    );
    expect(outcome.error).toBeInstanceOf(Error);
  });

  it("전용 에이전트는 실제 연결 시도에서 사설 주소로의 접속을 소켓 생성 전에 막는다", async () => {
    // 가드가 적용되지 않았다면 127.0.0.1:443 연결을 시도해 ECONNREFUSED 등 다른 오류가 난다.
    const agent = createPublicOnlyHttpsAgent(async () => [{ address: "127.0.0.1", family: 4 }]);
    const attempt = new Promise((resolve, reject) => {
      const outgoing = httpsRequest(
        { hostname: "push.example.com", port: 443, path: "/", method: "POST", agent, timeout: 2_000 },
        resolve,
      );
      outgoing.once("error", reject);
      outgoing.end();
    });
    await expect(attempt).rejects.toThrow("web-push-destination-not-public");
    agent.destroy();
  });

  it("해석 결과가 비어 있으면 거부한다", async () => {
    expect((await resolve(lookupWith([]), false)).error).toBeInstanceOf(Error);
  });
});

describe("웹 푸시 알림 전송", () => {
  const config = {
    notification: {
      vapidSubject: "mailto:ops@example.com",
      vapidPublicKey: "public-key",
      vapidPrivateKey: "private-key",
    },
  } as unknown as ProductionIntegrationConfig;

  function subscription(endpoint: string, hash: string): ProductionPushSubscriptionRecord {
    return {
      projectId: "project-1",
      actorUserId: "user-1",
      endpointHash: hash,
      endpoint,
      p256dh: "p".repeat(64),
      auth: "a".repeat(22),
      expirationTime: null,
    };
  }

  function send(subscriptions: readonly ProductionPushSubscriptionRecord[]) {
    return sendProductionNotification({
      config,
      projectId: "project-1",
      projectTitle: "Project",
      notification: {
        mutationId: "11111111-1111-4111-8111-111111111111",
        channel: "web-push",
        title: "알림",
        body: "내용",
      },
      subscriptions,
    });
  }

  beforeEach(() => {
    webPush.setVapidDetails.mockReset();
    webPush.sendNotification.mockReset().mockResolvedValue({ statusCode: 201 });
  });

  it("공개 주소만 해석하는 전용 에이전트와 시간 제한으로 전송한다", async () => {
    const result = await send([subscription("https://fcm.googleapis.com/fcm/send/abc", "hash-a")]);
    expect(result.sent).toBe(1);
    expect(webPush.sendNotification).toHaveBeenCalledOnce();
    const options = webPush.sendNotification.mock.calls[0]?.[2] as {
      agent?: unknown;
      timeout?: unknown;
    };
    expect(options.agent).toBeInstanceOf(Agent);
    expect(typeof options.timeout).toBe("number");
  });

  it("이미 저장돼 있던 내부 주소 구독은 요청 없이 건너뛰고 정리 대상으로 돌려준다", async () => {
    const result = await send([
      subscription("https://127.0.0.1:4001/api/health/ready", "hash-internal"),
      subscription("https://169.254.169.254/latest/meta-data/", "hash-metadata"),
      subscription("https://fcm.googleapis.com/fcm/send/abc", "hash-ok"),
    ]);
    expect(webPush.sendNotification).toHaveBeenCalledOnce();
    expect(webPush.sendNotification.mock.calls[0]?.[0]).toMatchObject({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    });
    expect(result.sent).toBe(1);
    expect(result.removedEndpointHashes).toEqual(["hash-internal", "hash-metadata"]);
  });
});
