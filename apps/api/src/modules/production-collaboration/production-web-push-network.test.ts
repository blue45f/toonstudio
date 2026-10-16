import { Agent, request as httpsRequest } from "node:https";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductionPushSubscriptionSchema } from "./production-integration.dto";
import { sendProductionNotification } from "./production-notification-provider";
import {
  classifyWebPushEndpoint,
  createPublicOnlyHttpsAgent,
  createPublicOnlyLookup,
  parseWebPushEndpoint,
} from "./production-web-push-network";
import { resolveWebPushPolicy } from "./production-web-push-policy";

import type { ProductionIntegrationConfig } from "./production-integration-config";
import type { ProductionPushSubscriptionRecord } from "./production-integration.repository";

const webPush = vi.hoisted(() => ({
  setVapidDetails: vi.fn(),
  sendNotification: vi.fn(),
}));

vi.mock("web-push", () => ({ default: webPush }));

// 브라우저가 실제로 발급하는 표준 푸시 서비스 endpoint. 기본 허용 목록을 그대로 통과해야 한다.
const PUBLIC_PUSH_ENDPOINTS = [
  "https://fcm.googleapis.com/fcm/send/abcDEF123:APA91bExample",
  "https://fcm.googleapis.com/wp/abcDEF123-ExampleToken",
  "https://updates.push.services.mozilla.com/wpush/v2/gAAAAAB",
  "https://web.push.apple.com/QGxyz123",
  "https://wns2-par02p.notify.windows.com/w/?token=BQYAAAExample",
  "https://db5p.notify.windows.com/?token=AwYAAAExample",
];

// 공개 도메인이지만 표준 푸시 서비스가 아닌 호스트. 서버가 대신 POST 를 보내는 증폭 경로가 되므로
// 운영자가 환경 변수로 명시하기 전에는 등록할 수 없다.
const NON_STANDARD_PUBLIC_ENDPOINTS = [
  "https://push.example-vendor.com/subscription/42",
  "https://attacker.example.net/collect",
  "https://fcm.googleapis.com.attacker.example.net/fcm/send/abc",
  "https://evil.fcm.googleapis.com/fcm/send/abc",
  "https://web.push.apple.com.attacker.example.net/QGxyz123",
  "https://notify.windows.com/w/?token=apex",
  "https://evilnotify.windows.com/w/?token=lookalike",
  "https://push.services.mozilla.com.attacker.example.net/wpush/v2/gAAAAAB",
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

describe("웹 푸시 endpoint 호스트 허용 목록", () => {
  const keys = { p256dh: "p".repeat(64), auth: "a".repeat(22) };

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(NON_STANDARD_PUBLIC_ENDPOINTS)(
    "공개 도메인이어도 표준 푸시 서비스가 아니면 기본 설정에서 거부한다: %s",
    (endpoint) => {
      expect(parseWebPushEndpoint(endpoint)).toBeNull();
      expect(ProductionPushSubscriptionSchema.safeParse({ endpoint, keys }).success).toBe(false);
    },
  );

  it("구분해서 알려 주므로 허용 목록 밖 호스트와 형식 위반을 다르게 처리할 수 있다", () => {
    const allowed = resolveWebPushPolicy({}).allowedHosts;
    expect(classifyWebPushEndpoint(PUBLIC_PUSH_ENDPOINTS[0] ?? "", allowed)).toMatchObject({
      kind: "accepted",
    });
    expect(classifyWebPushEndpoint("https://push.example-vendor.com/sub/1", allowed)).toEqual({
      kind: "host-not-allowed",
      hostname: "push.example-vendor.com",
    });
    expect(classifyWebPushEndpoint("https://127.0.0.1/x", allowed)).toEqual({ kind: "rejected" });
    expect(classifyWebPushEndpoint("http://fcm.googleapis.com/x", allowed)).toEqual({
      kind: "rejected",
    });
  });

  it("운영자가 환경 변수로 더한 호스트와 하위 도메인만 추가로 허용한다", () => {
    vi.stubEnv(
      "PRODUCTION_WEB_PUSH_EXTRA_ALLOWED_HOSTS",
      "push.example-vendor.com, *.unifiedpush.example.org",
    );
    const accepted = [
      "https://push.example-vendor.com/subscription/42",
      "https://relay.unifiedpush.example.org/up/abc",
    ];
    for (const endpoint of accepted) {
      expect(parseWebPushEndpoint(endpoint), endpoint).not.toBeNull();
      expect(ProductionPushSubscriptionSchema.safeParse({ endpoint, keys }).success).toBe(true);
    }
    for (const endpoint of [
      "https://attacker.example.net/collect",
      "https://push.example-vendor.com.attacker.example.net/subscription/42",
      "https://unifiedpush.example.org/up/abc",
    ]) {
      expect(parseWebPushEndpoint(endpoint), endpoint).toBeNull();
    }
    // 허용 목록을 넓혀도 내부망·IP 주소 같은 기존 차단은 그대로다.
    expect(parseWebPushEndpoint("https://127.0.0.1/x")).toBeNull();
    for (const endpoint of PUBLIC_PUSH_ENDPOINTS) {
      expect(parseWebPushEndpoint(endpoint), endpoint).not.toBeNull();
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
  function configWith(overrides: Partial<ReturnType<typeof resolveWebPushPolicy>> = {}) {
    return {
      notification: {
        vapidSubject: "mailto:ops@example.com",
        vapidPublicKey: "public-key",
        vapidPrivateKey: "private-key",
        webPush: { ...resolveWebPushPolicy({}), ...overrides },
      },
    } as unknown as ProductionIntegrationConfig;
  }

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

  function send(
    subscriptions: readonly ProductionPushSubscriptionRecord[],
    config: ProductionIntegrationConfig = configWith(),
  ) {
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

  it("허용 목록 밖 공개 호스트 구독은 요청 없이 건너뛰되 삭제하지 않는다(운영자가 목록을 넓히면 다시 쓸 수 있다)", async () => {
    const result = await send([
      subscription("https://push.example-vendor.com/subscription/42", "hash-vendor"),
      subscription("https://fcm.googleapis.com/fcm/send/abc", "hash-ok"),
    ]);
    expect(webPush.sendNotification).toHaveBeenCalledOnce();
    expect(webPush.sendNotification.mock.calls[0]?.[0]).toMatchObject({
      endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    });
    expect(result.sent).toBe(1);
    expect(result.removedEndpointHashes).toEqual([]);
    expect(result.providerResponse).toMatchObject({ attempted: 2, sent: 1, skippedHostNotAllowed: 1 });

    webPush.sendNotification.mockClear();
    const extended = await send(
      [subscription("https://push.example-vendor.com/subscription/42", "hash-vendor")],
      configWith(resolveWebPushPolicy({
        PRODUCTION_WEB_PUSH_EXTRA_ALLOWED_HOSTS: "push.example-vendor.com",
      })),
    );
    expect(extended.sent).toBe(1);
    expect(webPush.sendNotification).toHaveBeenCalledOnce();
  });

  it("동시에 진행하는 전송 요청 수를 설정한 상한으로 제한한다", async () => {
    let active = 0;
    let peak = 0;
    webPush.sendNotification.mockReset().mockImplementation(async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((done) => setTimeout(done, 5));
      active -= 1;
      return { statusCode: 201 };
    });
    const many = Array.from({ length: 12 }, (_unused, index) =>
      subscription(`https://fcm.googleapis.com/fcm/send/token-${index}`, `hash-${index}`));
    const result = await send(many, configWith({ fanOutConcurrency: 3 }));
    expect(result.sent).toBe(12);
    expect(webPush.sendNotification).toHaveBeenCalledTimes(12);
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("만료(404·410)된 endpoint 정리 결과는 동시성 제한 아래서도 구독과 어긋나지 않는다", async () => {
    webPush.sendNotification.mockReset().mockImplementation(async (target: { endpoint: string }) => {
      if (target.endpoint.endsWith("/gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (target.endpoint.endsWith("/missing")) throw Object.assign(new Error("missing"), { statusCode: 404 });
      return { statusCode: 201 };
    });
    const result = await send([
      subscription("https://fcm.googleapis.com/fcm/send/a", "hash-a"),
      subscription("https://fcm.googleapis.com/fcm/send/gone", "hash-gone"),
      subscription("https://fcm.googleapis.com/fcm/send/b", "hash-b"),
      subscription("https://fcm.googleapis.com/fcm/send/missing", "hash-missing"),
    ], configWith({ fanOutConcurrency: 2 }));
    expect(result.sent).toBe(2);
    expect(result.removedEndpointHashes).toEqual(["hash-gone", "hash-missing"]);
  });
});
