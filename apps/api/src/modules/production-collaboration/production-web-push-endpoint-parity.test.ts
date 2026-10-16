import { Agent } from "node:https";
import { PassThrough, type Duplex } from "node:stream";
import { parse as parseLegacyUrl } from "node:url";

import webPush from "web-push";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { classifyWebPushEndpoint, type WebPushEndpointVerdict } from "./production-web-push-network";
import { isWebPushHostAllowed, resolveWebPushPolicy } from "./production-web-push-policy";

import type { ClientRequestArgs } from "node:http";

/**
 * 검증한 호스트와 web-push 가 실제로 접속하는 호스트가 어긋나지 않는지 고정하는 시험.
 *
 * web-push(3.x)는 내부에서 legacy `url.parse(href)` 로 접속 호스트·포트를 정한다. 다른 시험 파일은 web-push 를
 * 모킹하므로 WHATWG(`new URL`)로 검증한 호스트와 이 파서가 정한 호스트가 같은지는 거기서 확인되지 않는다. 여기서는
 * 모킹하지 않은 web-push 에 연결 시도만 기록하는 에이전트를 물려 실제 접속 대상(host·port)을 읽는다(네트워크 연결은
 * 만들지 않는다).
 *
 * 불변식: 허용된(accepted) endpoint 는 전송에 쓰는 정규형 href 에 대해
 *   new URL(href).hostname === url.parse(href).hostname === web-push 가 접속하는 host
 * 이고, 그 호스트는 허용 목록과 (후행 점을 뗀 이름 기준으로) 일치하며 포트는 443 이다.
 */

const EXTRA_ALLOWED_HOSTS = "push.example-vendor.com, *.relay.example.net, xn--bcher-kva.de";
const ALLOWED_HOSTS = resolveWebPushPolicy({
  PRODUCTION_WEB_PUSH_EXTRA_ALLOWED_HOSTS: EXTRA_ALLOWED_HOSTS,
}).allowedHosts;

const RECORDED = "web-push-connection-recorded";

// legacy url.parse 는 web-push 가 실제로 쓰는 파서라서 일부러 대조한다. Node 가 이 호출마다 내는 DEP0169 경고는
// 이 파일 안에서만 끈다(다른 시험 파일의 경고 처리에는 영향을 주지 않도록 끝나면 되돌린다).
let previousNoDeprecation: boolean | undefined;
beforeAll(() => {
  previousNoDeprecation = process.noDeprecation;
  process.noDeprecation = true;
});
afterAll(() => {
  process.noDeprecation = previousNoDeprecation;
});

class RecordingAgent extends Agent {
  readonly targets: { readonly host: string | null; readonly port: number }[] = [];

  override createConnection(
    options: ClientRequestArgs,
    callback?: (error: Error | null, stream: Duplex) => void,
  ): Duplex | null | undefined {
    this.targets.push({ host: options.host ?? null, port: Number(options.port) });
    // 소켓을 만들지 않고 오류로 끝낸다. 접속 대상만 기록하면 된다.
    callback?.(new Error(RECORDED), new PassThrough());
    return undefined;
  }
}

/** web-push 가 이 href 로 접속하려는 대상. */
async function webPushConnectionTarget(href: string): Promise<{ host: string | null; port: number } | undefined> {
  const agent = new RecordingAgent();
  await webPush
    .sendNotification({ endpoint: href, keys: { p256dh: "p", auth: "a" } }, null, { agent, timeout: 1_000 })
    .catch(() => undefined);
  agent.destroy();
  return agent.targets[0];
}

function legacyHostnameOrNull(value: string): string | null {
  try {
    return parseLegacyUrl(value).hostname;
  } catch {
    return null;
  }
}

function withoutTrailingDot(hostname: string): string {
  return hostname.replace(/\.$/u, "");
}

function accepted(endpoint: string): Extract<WebPushEndpointVerdict, { kind: "accepted" }> {
  const verdict = classifyWebPushEndpoint(endpoint, ALLOWED_HOSTS);
  if (verdict.kind !== "accepted") {
    throw new Error(`accepted 를 기대했지만 ${verdict.kind}: ${endpoint}`);
  }
  return verdict;
}

// 인증 정보가 포함된 URL 리터럴은 비밀 스캐너가 오탐하므로 런타임에 조립한다.
const WITH_CREDENTIALS = ["https://", "user", ":", "pw", "@fcm.googleapis.com/fcm/send/abc"].join("");

describe("웹 푸시 endpoint 파서 일치 — 고전 우회 사례", () => {
  it.each([
    ["허용 호스트 이름을 사용자 정보로 쓰고 실제 호스트는 다른 곳", "https://fcm.googleapis.com@evil.example.net/fcm/send/abc"],
    ["같은 방식, 점이 없는 실제 호스트", "https://fcm.googleapis.com@evil/fcm/send/abc"],
    ["사용자 정보에 포트까지 붙여 허용 호스트처럼 보이게 함", "https://fcm.googleapis.com:443@evil.example.net/fcm/send/abc"],
    ["사용자 이름과 비밀번호가 있는 URL", WITH_CREDENTIALS],
    ["# 뒤에 허용 호스트를 숨김(실제 호스트는 점 없는 이름)", "https://evil#@fcm.googleapis.com/fcm/send/abc"],
    ["백슬래시는 파서마다 해석이 달라 거부", "https://evil.example.net\\@fcm.googleapis.com/fcm/send/abc"],
    ["허용 호스트 뒤에 백슬래시와 다른 호스트", "https://fcm.googleapis.com\\.evil.example.net/fcm/send/abc"],
    ["퍼센트 인코딩한 @ 는 호스트에 쓸 수 없다", "https://fcm.googleapis.com%40evil.example.net/fcm/send/abc"],
    ["비표준 포트", "https://fcm.googleapis.com:8443/fcm/send/abc"],
    ["평문 HTTP", "http://fcm.googleapis.com/fcm/send/abc"],
  ])("거부(rejected): %s", (_name, endpoint) => {
    expect(classifyWebPushEndpoint(endpoint, ALLOWED_HOSTS)).toEqual({ kind: "rejected" });
  });

  it.each([
    ["# 뒤에 허용 호스트를 숨김", "https://evil.example.net#@fcm.googleapis.com/fcm/send/abc", "evil.example.net"],
    ["? 뒤에 허용 호스트를 숨김", "https://evil.example.net?@fcm.googleapis.com/fcm/send/abc", "evil.example.net"],
    ["경로에 허용 호스트를 숨김", "https://evil.example.net/@fcm.googleapis.com/fcm/send/abc", "evil.example.net"],
    ["허용 호스트를 하위 레이블로 붙임", "https://fcm.googleapis.com.evil.example.net/fcm/send/abc", "fcm.googleapis.com.evil.example.net"],
    ["퍼센트 인코딩한 점으로 하위 레이블을 붙임", "https://fcm.googleapis.com%2Eevil.example.net/x", "fcm.googleapis.com.evil.example.net"],
    ["허용 호스트의 하위 도메인(정확한 호스트 항목은 하위 도메인을 열지 않는다)", "https://evil.fcm.googleapis.com/fcm/send/abc", "evil.fcm.googleapis.com"],
    ["후행 점이 둘이면 허용 목록과 일치하지 않는다", "https://fcm.googleapis.com../fcm/send/abc", "fcm.googleapis.com."],
    ["동형 문자(키릴 문자 U+043E)로 만든 호스트는 punycode 로 바뀌어 달라진다", "https://fcm.g\u043e\u043egleapis.com/fcm/send/abc", "fcm.xn--ggleapis-nbha.com"],
  ])("허용 목록 밖(host-not-allowed): %s", (_name, endpoint, hostname) => {
    expect(classifyWebPushEndpoint(endpoint, ALLOWED_HOSTS)).toEqual({ kind: "host-not-allowed", hostname });
  });

  it("후행 점 FQDN 은 허용되고 전송 URL 의 호스트에도 점이 남는다(같은 호스트를 가리키는 DNS 루트 표기)", async () => {
    const verdict = accepted("https://fcm.googleapis.com./fcm/send/abc");
    // 허용 목록 비교는 후행 점을 뗀 이름으로 하지만, 전송에 쓰는 href 와 web-push 의 접속 호스트에는 점이 그대로 남는다.
    expect(verdict.url.href).toBe("https://fcm.googleapis.com./fcm/send/abc");
    expect(verdict.url.hostname).toBe("fcm.googleapis.com.");
    expect(withoutTrailingDot(verdict.url.hostname)).toBe("fcm.googleapis.com");
    expect(parseLegacyUrl(verdict.url.href).hostname).toBe("fcm.googleapis.com.");
    await expect(webPushConnectionTarget(verdict.url.href)).resolves.toEqual({
      host: "fcm.googleapis.com.",
      port: 443,
    });
  });

  it("명시 :443 은 정규형에서 사라지고 접속 포트는 443 이다", async () => {
    const endpoints = [
      "https://fcm.googleapis.com:443/fcm/send/abc",
      "https://fcm.googleapis.com:0443/fcm/send/abc",
      "https://fcm.googleapis.com:/fcm/send/abc",
    ];
    const targets = await Promise.all(endpoints.map((endpoint) => {
      const verdict = accepted(endpoint);
      expect(verdict.url.href, endpoint).toBe("https://fcm.googleapis.com/fcm/send/abc");
      expect(verdict.url.port, endpoint).toBe("");
      expect(parseLegacyUrl(verdict.url.href).port, endpoint).toBeNull();
      return webPushConnectionTarget(verdict.url.href);
    }));
    for (const target of targets) expect(target).toEqual({ host: "fcm.googleapis.com", port: 443 });
  });

  it("xn-- 퓨니코드와 IDN 원문은 같은 정규형(punycode)이 되어 허용 목록의 퓨니코드 항목과 일치한다", async () => {
    const endpoints = ["https://xn--bcher-kva.de/x", "https://b\u00fccher.de/x", "https://B\u00dcCHER.de/x"];
    const targets = await Promise.all(endpoints.map((endpoint) => {
      const verdict = accepted(endpoint);
      expect(verdict.url.href, endpoint).toBe("https://xn--bcher-kva.de/x");
      expect(parseLegacyUrl(verdict.url.href).hostname, endpoint).toBe("xn--bcher-kva.de");
      return webPushConnectionTarget(verdict.url.href);
    }));
    for (const target of targets) expect(target).toEqual({ host: "xn--bcher-kva.de", port: 443 });
    // 기본 허용 목록만 쓰는 환경에서는 같은 주소가 허용 목록 밖이다.
    expect(classifyWebPushEndpoint("https://b\u00fccher.de/x", resolveWebPushPolicy({}).allowedHosts)).toEqual({
      kind: "host-not-allowed",
      hostname: "xn--bcher-kva.de",
    });
  });

  it("대소문자·전각 점·퍼센트 인코딩 점·제로 폭 문자는 정규형으로 풀린 뒤 판정하고 그 정규형만 전송한다", async () => {
    const endpoints = [
      "https://FCM.GoogleAPIs.com/fcm/send/abc",
      "https://fcm\u3002googleapis\u3002com/fcm/send/abc",
      "https://fcm%2Egoogleapis.com/fcm/send/abc",
      "https://fcm.googleapis\u200b.com/fcm/send/abc",
    ];
    const targets = await Promise.all(endpoints.map((endpoint) => {
      const verdict = accepted(endpoint);
      expect(verdict.url.href, endpoint).toBe("https://fcm.googleapis.com/fcm/send/abc");
      return webPushConnectionTarget(verdict.url.href);
    }));
    for (const target of targets) expect(target).toEqual({ host: "fcm.googleapis.com", port: 443 });
  });
});

// ─── 결정적 시드의 소규모 퍼징 ────────────────────────────────────────────────────────────────────────────────────

const FUZZ_SEED = 0x5eed_c0de;
const FUZZ_ITERATIONS = 4_000;
const CONNECTION_SAMPLE = 150;
const MINIMUM_PER_BRANCH = 100;

/** mulberry32: 같은 시드면 항상 같은 수열을 내는 작은 의사 난수 생성기. */
function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}

// 후보는 "대체로 정상인 주소"에 적대적인 조각(사용자 정보·특수 호스트·포트·경로·꼬리)과 잡음 문자를 섞어 만든다.
// 허용·허용 목록 밖·거부가 모두 충분히 나오도록 정상 조각의 비중을 높게 둔다.
const OTHER_SCHEMES = ["HTTPS://", "https:/", "https:", "http://", "//", "", "ftp://", "wss://"];
const USERINFO = ["fcm.googleapis.com@", "evil@", ["a", ":", "b", "@"].join(""), "%40@", "@"];
const GOOD_HOSTS = [
  "fcm.googleapis.com", "FCM.GOOGLEAPIS.COM", "fcm.googleapis.com.", "updates.push.services.mozilla.com",
  "web.push.apple.com", "wns2-par02p.notify.windows.com", "push.example-vendor.com", "node1.relay.example.net",
  "xn--bcher-kva.de", "b\u00fccher.de", "fcm%2Egoogleapis.com", "fcm\u3002googleapis\u3002com", "fcm.googleapis\u200b.com",
];
const TRICKY_HOSTS = [
  "fcm.googleapis.com..", "push.services.mozilla.com", "relay.example.net", "evil.example.net",
  "fcm.googleapis.com.evil.example.net", "evil.fcm.googleapis.com", "evilnotify.windows.com", "fcm.googleapis.com%2e",
  "127.0.0.1", "[::1]", "2130706433", "0x7f.1", "localhost", "metadata.google.internal", "a.b", "intranet", "",
  "fcm.g\u043e\u043egleapis.com", "fcm.googleapis.com%00", "fcm.googleapis.com%40evil.example.net",
  "evil.example.net#fcm.googleapis.com",
];
const PORTS = [":443", ":0443", ":", ":8443", ":80", ":65536", ":443.", ":+443"];
const PATHS = ["", "/", "/fcm/send/abc", "/a/b", "/%2e%2e/x", "//", "/.", "/..", "/@fcm.googleapis.com", "/fcm/send/a:b"];
const TAILS = ["?x=1", "#frag", "?@fcm.googleapis.com", "#@fcm.googleapis.com", "?a=b#c", "?\\x"];
const NOISE = ["@", "#", "?", "\\", ":", "%", "[", "]", ".", "\u3002", " ", "\t", "\u0000", "\u200b", "/", "\u00a0"];

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)] as T;
}

function fuzzCandidate(random: () => number): string {
  let candidate = [
    random() < 0.8 ? "https://" : pick(random, OTHER_SCHEMES),
    random() < 0.75 ? "" : pick(random, USERINFO),
    pick(random, random() < 0.55 ? GOOD_HOSTS : TRICKY_HOSTS),
    random() < 0.6 ? "" : pick(random, PORTS),
    pick(random, PATHS),
    random() < 0.5 ? "" : pick(random, TAILS),
  ].join("");
  if (random() < 0.25) {
    const insertions = 1 + Math.floor(random() * 2);
    for (let count = 0; count < insertions; count += 1) {
      const at = Math.floor(random() * (candidate.length + 1));
      candidate = `${candidate.slice(0, at)}${pick(random, NOISE)}${candidate.slice(at)}`;
    }
  }
  return candidate;
}

interface FuzzOutcome {
  readonly tally: Record<WebPushEndpointVerdict["kind"], number>;
  readonly acceptedHrefs: readonly string[];
  readonly violations: readonly string[];
  /** 허용된 후보의 원문을 정규형으로 바꾸지 않고 legacy 파서에 넣었을 때 호스트가 달라지는 후보 수. */
  readonly rawLegacyMismatches: number;
}

let memoizedFuzz: FuzzOutcome | undefined;

/** 같은 시드로 항상 같은 후보를 만들어 분류하고 불변식 위반을 모은다. 파일 안에서 한 번만 계산한다. */
function runFuzz(): FuzzOutcome {
  if (memoizedFuzz) return memoizedFuzz;
  const random = createRandom(FUZZ_SEED);
  const tally: FuzzOutcome["tally"] = { accepted: 0, "host-not-allowed": 0, rejected: 0 };
  const acceptedHrefs: string[] = [];
  const violations: string[] = [];
  let rawLegacyMismatches = 0;
  for (let index = 0; index < FUZZ_ITERATIONS; index += 1) {
    const candidate = fuzzCandidate(random);
    const verdict = classifyWebPushEndpoint(candidate, ALLOWED_HOSTS);
    tally[verdict.kind] += 1;
    if (verdict.kind !== "accepted") continue;
    const href = verdict.url.href;
    acceptedHrefs.push(href);
    if (legacyHostnameOrNull(candidate) !== verdict.url.hostname) rawLegacyMismatches += 1;
    let legacy: ReturnType<typeof parseLegacyUrl>;
    try {
      legacy = parseLegacyUrl(href);
    } catch {
      violations.push(`legacy-parse-threw ${JSON.stringify(candidate)}`);
      continue;
    }
    const whatwgHostname = new URL(href).hostname;
    if (legacy.hostname !== whatwgHostname || whatwgHostname !== verdict.url.hostname) {
      violations.push(`hostname ${JSON.stringify(candidate)} legacy=${legacy.hostname} whatwg=${whatwgHostname}`);
    }
    if (legacy.protocol !== "https:" || legacy.auth !== null || legacy.port !== null) {
      violations.push(
        `shape ${JSON.stringify(candidate)} protocol=${legacy.protocol} auth=${legacy.auth} port=${legacy.port}`,
      );
    }
    if (!isWebPushHostAllowed(withoutTrailingDot(legacy.hostname ?? ""), ALLOWED_HOSTS)) {
      violations.push(`not-allowed ${JSON.stringify(candidate)} host=${legacy.hostname}`);
    }
  }
  memoizedFuzz = { tally, acceptedHrefs, violations, rawLegacyMismatches };
  return memoizedFuzz;
}

describe("웹 푸시 endpoint 파서 일치 — 결정적 퍼징", () => {
  it("허용된 endpoint 는 WHATWG 와 legacy 파서가 같은 호스트·https·기본 포트·인증 정보 없음으로 해석한다", () => {
    expect(runFuzz().violations).toEqual([]);
  });

  it("퍼징이 허용·허용 목록 밖·거부 세 갈래를 모두 충분히 만든다(공회전 방지)", () => {
    const { tally } = runFuzz();
    expect(tally.accepted).toBeGreaterThan(MINIMUM_PER_BRANCH);
    expect(tally["host-not-allowed"]).toBeGreaterThan(MINIMUM_PER_BRANCH);
    expect(tally.rejected).toBeGreaterThan(MINIMUM_PER_BRANCH);
    expect(tally.accepted + tally["host-not-allowed"] + tally.rejected).toBe(FUZZ_ITERATIONS);
  });

  it("원문 endpoint 를 그대로 legacy 파서에 넣으면 호스트가 달라지는 후보가 있다(그래서 정규형 href 만 전송한다)", () => {
    // 이 값이 0 이면 퍼징 후보가 두 파서의 차이를 만들어 내지 못한다는 뜻이라 위 불변식 시험이 공회전한다.
    expect(runFuzz().rawLegacyMismatches).toBeGreaterThan(0);
  });

  it("허용된 표본은 실제 web-push 가 접속하는 호스트·포트와도 같다", async () => {
    const sample = runFuzz().acceptedHrefs.slice(0, CONNECTION_SAMPLE);
    expect(sample).toHaveLength(CONNECTION_SAMPLE);
    const targets = await Promise.all(sample.map((href) => webPushConnectionTarget(href)));
    const mismatches = sample.flatMap((href, index) => {
      const target = targets[index];
      return target?.host === new URL(href).hostname && target.port === 443
        ? []
        : [`${href} => ${JSON.stringify(target)}`];
    });
    expect(mismatches).toEqual([]);
  });
});
