import { lookup as systemLookup } from "node:dns/promises";
import { Agent } from "node:https";
import { isIP } from "node:net";

import { isPublicOutboundAddress } from "../../platform/adapters/network/public-endpoint";

import type { LookupFunction } from "node:net";

const MAXIMUM_ENDPOINT_LENGTH = 4_096;
const MAXIMUM_DNS_ANSWERS = 64;
const INTERNAL_HOST_SUFFIX = /\.(?:internal|localhost|local|localdomain|home|lan|test|invalid|example)$/u;

export const WEB_PUSH_REQUEST_TIMEOUT_MS = 10_000;

// 파서마다 백슬래시와 공백 처리가 달라, 검증한 호스트와 실제 접속 호스트가 어긋날 수 있다.
function containsAmbiguousCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x20 || code === 0x7f || character === "\\") return true;
  }
  return false;
}

/**
 * 브라우저가 발급하는 웹 푸시 구독 endpoint 로 허용할 수 있는 주소인지 판정한다.
 * 서버가 이 주소로 직접 요청을 보내므로, 공개 도메인 이름을 가진 표준 포트(443)의 HTTPS 만 인정하고
 * IP 리터럴, localhost, 내부 도메인 접미사, 인증 정보, 비표준 포트를 거부한다.
 * 통과하면 WHATWG 로 정규화한 URL 을 돌려준다(전송에도 이 정규형을 쓴다).
 */
export function parseWebPushEndpoint(value: string): URL | null {
  if (value.length === 0 || value.length > MAXIMUM_ENDPOINT_LENGTH) return null;
  if (containsAmbiguousCharacter(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || (url.port && url.port !== "443")
  ) {
    return null;
  }
  const hostname = url.hostname.replace(/^\[|\]$/gu, "").replace(/\.$/u, "").toLowerCase();
  if (
    !hostname
    || isIP(hostname) !== 0
    || hostname === "localhost"
    || !hostname.includes(".")
    || INTERNAL_HOST_SUFFIX.test(hostname)
  ) {
    return null;
  }
  return url;
}

export interface WebPushDnsAnswer {
  readonly address: string;
  readonly family: number;
}

export type WebPushDnsResolver = (hostname: string) => Promise<readonly WebPushDnsAnswer[]>;

const systemResolver: WebPushDnsResolver = (hostname) =>
  systemLookup(hostname, { all: true, verbatim: true });

/**
 * 연결 시점에 호스트 이름을 해석해 모든 답이 공개 주소일 때만 연결을 허용한다. 구독 등록 때 공개
 * 도메인이던 이름이 나중에 사설 주소로 바뀌거나 처음부터 사설 주소를 가리키는 경우를 막는다.
 * 하나라도 사설 주소면 전체를 거부해 분할 DNS 로 우회하지 못하게 한다.
 */
export function createPublicOnlyLookup(
  resolve: WebPushDnsResolver = systemResolver,
): LookupFunction {
  return ((
    hostname: string,
    options: unknown,
    callback: (...args: unknown[]) => void,
  ) => {
    const wantsAll = typeof options === "object"
      && options !== null
      && "all" in options
      && options.all === true;
    resolve(hostname).then(
      (answers) => {
        const first = answers[0];
        if (
          !first
          || answers.length > MAXIMUM_DNS_ANSWERS
          || answers.some(({ address, family }) =>
            (family !== 4 && family !== 6)
            || isIP(address) !== family
            || !isPublicOutboundAddress(address))
        ) {
          callback(new Error("web-push-destination-not-public"));
          return;
        }
        if (wantsAll) {
          callback(null, answers.map(({ address, family }) => ({ address, family })));
        } else {
          callback(null, first.address, first.family);
        }
      },
      (error: unknown) => callback(error),
    );
  }) as LookupFunction;
}

/** 공개 주소로만 접속하는 전용 HTTPS 에이전트. 소켓을 재사용하지 않는다. */
export function createPublicOnlyHttpsAgent(resolve?: WebPushDnsResolver): Agent {
  return new Agent({
    keepAlive: false,
    maxSockets: 16,
    lookup: createPublicOnlyLookup(resolve),
  });
}
