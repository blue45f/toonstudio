import { describe, expect, it } from "vitest";

import {
  DEFAULT_WEB_PUSH_ALLOWED_HOSTS,
  DEFAULT_WEB_PUSH_FAN_OUT_CONCURRENCY,
  DEFAULT_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_PROJECT,
  DEFAULT_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_USER,
  evaluateWebPushSubscriptionLimits,
  isWebPushHostAllowed,
  resolveWebPushPolicy,
  settleWithConcurrency,
} from "./production-web-push-policy";

describe("웹 푸시 허용 호스트", () => {
  it("기본 허용 목록은 표준 푸시 서비스(FCM·Apple·Mozilla·Windows)만 담는다", () => {
    expect(resolveWebPushPolicy({}).allowedHosts).toEqual(DEFAULT_WEB_PUSH_ALLOWED_HOSTS);
    expect([...DEFAULT_WEB_PUSH_ALLOWED_HOSTS]).toEqual([
      "fcm.googleapis.com",
      "web.push.apple.com",
      ".push.services.mozilla.com",
      ".notify.windows.com",
    ]);
  });

  it.each([
    "fcm.googleapis.com",
    "web.push.apple.com",
    "updates.push.services.mozilla.com",
    "wns2-par02p.notify.windows.com",
    "DB5P.NOTIFY.WINDOWS.COM",
  ])("표준 푸시 서비스 호스트 %s 는 허용한다", (hostname) => {
    expect(isWebPushHostAllowed(hostname, DEFAULT_WEB_PUSH_ALLOWED_HOSTS)).toBe(true);
  });

  it.each([
    "push.example-vendor.com",
    "attacker.example.net",
    // 정확한 호스트 항목은 하위 도메인이나 앞뒤에 붙인 이름을 허용하지 않는다.
    "evil.fcm.googleapis.com",
    "fcm.googleapis.com.attacker.example",
    "web.push.apple.com.attacker.example",
    "googleapis.com",
    // 접미사 항목은 하위 도메인만 허용하고 본체나 레이블 일부만 같은 이름은 거부한다.
    "push.services.mozilla.com",
    "notify.windows.com",
    "evilnotify.windows.com",
    "notify.windows.com.attacker.example",
    "mozilla.com",
  ])("표준 목록 밖이거나 이름만 비슷한 호스트 %s 는 거부한다", (hostname) => {
    expect(isWebPushHostAllowed(hostname, DEFAULT_WEB_PUSH_ALLOWED_HOSTS)).toBe(false);
  });

  it("환경 변수로 호스트와 접미사를 기본 목록에 더하고 기본 항목은 유지한다", () => {
    const policy = resolveWebPushPolicy({
      PRODUCTION_WEB_PUSH_EXTRA_ALLOWED_HOSTS:
        "Push.Example-Vendor.com, *.unifiedpush.example.org;  .relay.example.net\n",
    });
    expect(policy.allowedHosts).toEqual([
      ...DEFAULT_WEB_PUSH_ALLOWED_HOSTS,
      "push.example-vendor.com",
      ".unifiedpush.example.org",
      ".relay.example.net",
    ]);
    expect(policy.ignoredHostEntries).toBe(0);
    expect(isWebPushHostAllowed("push.example-vendor.com", policy.allowedHosts)).toBe(true);
    expect(isWebPushHostAllowed("a.unifiedpush.example.org", policy.allowedHosts)).toBe(true);
    expect(isWebPushHostAllowed("unifiedpush.example.org", policy.allowedHosts)).toBe(false);
    expect(isWebPushHostAllowed("fcm.googleapis.com", policy.allowedHosts)).toBe(true);
  });

  it("중복 항목은 합치고 잘못된 항목은 버린 뒤 개수만 알려 준다", () => {
    const policy = resolveWebPushPolicy({
      PRODUCTION_WEB_PUSH_EXTRA_ALLOWED_HOSTS: [
        "push.example-vendor.com",
        "PUSH.EXAMPLE-VENDOR.COM.",
        "127.0.0.1",
        "10.0.0.5",
        "localhost",
        "metadata.google.internal",
        "service.local",
        "intranet",
        "https://push.example-vendor.com",
        "push.example-vendor.com/path",
        "push.example-vendor.com:8443",
        "*",
        ".com",
        "*.com",
        "user@push.example-vendor.com",
        "-bad-.example.com",
      ].join(","),
    });
    expect(policy.allowedHosts).toEqual([
      ...DEFAULT_WEB_PUSH_ALLOWED_HOSTS,
      "push.example-vendor.com",
    ]);
    expect(policy.ignoredHostEntries).toBe(14);
  });

  it("값이 비어 있거나 공백뿐이면 기본 목록만 쓴다", () => {
    for (const raw of [undefined, "", "   ", ",,;"]) {
      expect(resolveWebPushPolicy({ PRODUCTION_WEB_PUSH_EXTRA_ALLOWED_HOSTS: raw }).allowedHosts)
        .toEqual(DEFAULT_WEB_PUSH_ALLOWED_HOSTS);
    }
  });
});

describe("웹 푸시 상한 설정", () => {
  it("기본값은 프로젝트 200개, 사용자 10개, 동시 전송 8개다", () => {
    expect(resolveWebPushPolicy({})).toMatchObject({
      maxSubscriptionsPerProject: DEFAULT_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_PROJECT,
      maxSubscriptionsPerUser: DEFAULT_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_USER,
      fanOutConcurrency: DEFAULT_WEB_PUSH_FAN_OUT_CONCURRENCY,
    });
    expect(DEFAULT_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_PROJECT).toBe(200);
    expect(DEFAULT_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_USER).toBe(10);
    expect(DEFAULT_WEB_PUSH_FAN_OUT_CONCURRENCY).toBe(8);
  });

  it("환경 변수 값은 허용 범위로 고정하고 숫자가 아니면 기본값을 쓴다", () => {
    expect(resolveWebPushPolicy({
      PRODUCTION_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_PROJECT: "50",
      PRODUCTION_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_USER: "3",
      PRODUCTION_WEB_PUSH_FANOUT_CONCURRENCY: "4",
    })).toMatchObject({
      maxSubscriptionsPerProject: 50,
      maxSubscriptionsPerUser: 3,
      fanOutConcurrency: 4,
    });
    expect(resolveWebPushPolicy({
      PRODUCTION_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_PROJECT: "999999",
      PRODUCTION_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_USER: "0",
      PRODUCTION_WEB_PUSH_FANOUT_CONCURRENCY: "-5",
    })).toMatchObject({
      maxSubscriptionsPerProject: 1_000,
      maxSubscriptionsPerUser: 1,
      fanOutConcurrency: 1,
    });
    expect(resolveWebPushPolicy({
      PRODUCTION_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_PROJECT: "many",
      PRODUCTION_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_USER: "",
      PRODUCTION_WEB_PUSH_FANOUT_CONCURRENCY: "NaN",
    })).toMatchObject({
      maxSubscriptionsPerProject: DEFAULT_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_PROJECT,
      maxSubscriptionsPerUser: DEFAULT_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_USER,
      fanOutConcurrency: DEFAULT_WEB_PUSH_FAN_OUT_CONCURRENCY,
    });
  });
});

describe("구독 수 상한 판정", () => {
  const limits = { maxPerProject: 5, maxPerUser: 2 } as const;

  it("이미 등록된 endpoint 의 갱신은 상한에 걸리지 않는다", () => {
    expect(evaluateWebPushSubscriptionLimits({
      alreadyRegistered: true,
      projectCount: 5,
      userCount: 2,
      ...limits,
    })).toBeNull();
  });

  it("새 endpoint 는 사용자 상한과 프로젝트 상한에 도달하면 거부한다", () => {
    expect(evaluateWebPushSubscriptionLimits({
      alreadyRegistered: false,
      projectCount: 1,
      userCount: 1,
      ...limits,
    })).toBeNull();
    expect(evaluateWebPushSubscriptionLimits({
      alreadyRegistered: false,
      projectCount: 1,
      userCount: 2,
      ...limits,
    })).toEqual({ scope: "user", limit: 2 });
    expect(evaluateWebPushSubscriptionLimits({
      alreadyRegistered: false,
      projectCount: 5,
      userCount: 1,
      ...limits,
    })).toEqual({ scope: "project", limit: 5 });
    // 둘 다 가득 찼다면 사용자가 스스로 정리할 수 있는 사용자 상한을 먼저 알린다.
    expect(evaluateWebPushSubscriptionLimits({
      alreadyRegistered: false,
      projectCount: 5,
      userCount: 2,
      ...limits,
    })).toEqual({ scope: "user", limit: 2 });
  });
});

describe("settleWithConcurrency", () => {
  function deferred() {
    let resolve: () => void = () => undefined;
    const promise = new Promise<void>((done) => {
      resolve = done;
    });
    return { promise, resolve };
  }

  it("동시에 진행하는 작업 수를 상한으로 제한하고 결과 순서를 입력 순서에 맞춘다", async () => {
    let active = 0;
    let peak = 0;
    const gates = Array.from({ length: 10 }, () => deferred());
    const run = settleWithConcurrency(gates, 3, async (gate, index) => {
      active += 1;
      peak = Math.max(peak, active);
      await gate.promise;
      active -= 1;
      return index * 2;
    });
    // 첫 묶음만 시작됐는지 확인한 뒤 하나씩 풀어 준다.
    await new Promise((done) => setTimeout(done, 5));
    expect(active).toBe(3);
    for (const gate of [...gates].reverse()) {
      gate.resolve();
      await new Promise((done) => setTimeout(done, 1));
    }
    const results = await run;
    expect(peak).toBe(3);
    expect(results.map((result) => (result.status === "fulfilled" ? result.value : null)))
      .toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);
  });

  it("거부된 작업도 자리를 비우고 다음 작업을 이어 가며 사유를 보존한다", async () => {
    const results = await settleWithConcurrency([1, 2, 3, 4], 2, async (value) => {
      if (value % 2 === 0) throw new Error(`failed-${value}`);
      return value;
    });
    expect(results.map((result) => result.status)).toEqual([
      "fulfilled",
      "rejected",
      "fulfilled",
      "rejected",
    ]);
    expect(results[1]).toMatchObject({ reason: expect.objectContaining({ message: "failed-2" }) });
  });

  it("빈 입력, 항목 수보다 큰 상한, 1 미만 상한을 안전하게 처리한다", async () => {
    await expect(settleWithConcurrency([], 4, async () => 1)).resolves.toEqual([]);
    const wide = await settleWithConcurrency([1, 2], 50, async (value) => value);
    expect(wide).toEqual([
      { status: "fulfilled", value: 1 },
      { status: "fulfilled", value: 2 },
    ]);
    let active = 0;
    let peak = 0;
    await settleWithConcurrency([1, 2, 3], 0, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((done) => setTimeout(done, 1));
      active -= 1;
    });
    expect(peak).toBe(1);
  });
});
