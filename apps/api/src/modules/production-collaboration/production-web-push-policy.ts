import { isIP } from "node:net";

import { Logger } from "@nestjs/common";

/**
 * 웹 푸시 구독 endpoint 호스트 허용 목록, 구독 수 상한, 전송 동시성 상한.
 *
 * 서버는 사용자가 등록한 endpoint 로 직접 요청을 보낸다. 사설 주소 차단(SSRF)만으로는 "공개 도메인이면 어떤
 * 호스트든" 서버가 대신 POST 를 보내는 증폭 경로가 남으므로, 브라우저가 실제로 발급하는 표준 푸시 서비스만
 * 기본으로 허용한다. 자체 호스팅 푸시 중계(UnifiedPush 등)는 운영자가 환경 변수로 명시해 더한다.
 */
type EnvLike = Partial<Record<string, string | undefined>>;

/** 정확한 호스트이거나, 점으로 시작하면 그 아래 하위 도메인만(본체 제외) 뜻한다. */
export const DEFAULT_WEB_PUSH_ALLOWED_HOSTS: readonly string[] = Object.freeze([
  "fcm.googleapis.com", // Chrome·Edge·Brave·Opera·Samsung Internet
  "web.push.apple.com", // Safari·iOS 웹 앱
  ".push.services.mozilla.com", // Firefox (updates.push.services.mozilla.com)
  ".notify.windows.com", // Windows 알림 서비스(WNS)
]);

export const WEB_PUSH_EXTRA_ALLOWED_HOSTS_ENV = "PRODUCTION_WEB_PUSH_EXTRA_ALLOWED_HOSTS";
export const DEFAULT_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_PROJECT = 200;
export const DEFAULT_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_USER = 10;
export const DEFAULT_WEB_PUSH_FAN_OUT_CONCURRENCY = 8;

const MAXIMUM_SUBSCRIPTIONS_PER_PROJECT = 1_000;
const MAXIMUM_SUBSCRIPTIONS_PER_USER = 100;
const MAXIMUM_FAN_OUT_CONCURRENCY = 32;

// 점으로 구분된 두 레이블 이상의 DNS 이름. 마지막 레이블(TLD)은 영문자로 시작해 숫자뿐인 IP 모양을 걸러 낸다.
const HOST_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
const TOP_LEVEL_LABEL = "[a-z](?:[a-z0-9-]{0,61}[a-z0-9])";
const EXACT_HOST = new RegExp(`^(?:${HOST_LABEL}\\.)+${TOP_LEVEL_LABEL}$`, "u");
const INTERNAL_HOST_SUFFIX = /\.(?:internal|localhost|local|localdomain|home|lan|test|invalid|example)$/u;
// 문자·숫자·점·하이픈만으로 된 호스트 이름 모양(비ASCII 문자는 별도로 가려낸다).
const BARE_HOSTNAME_CHARACTERS = /^[\p{L}\p{N}.-]+$/u;
const NON_ASCII_CHARACTER = /\P{ASCII}/u;

/**
 * 와일드카드(`*.`·`.`) 항목에서 접두어를 뗀 접미사가 가져야 하는 최소 레이블 수. 공용 접미사 목록 없이는 `example.com` 과
 * `co.uk`·`github.io`·`pages.dev`·`googleapis.com`(남이 하위 도메인을 얻을 수 있는 공용·공유 접미사)을 레이블 수로 가를 수
 * 없으므로, 두 레이블 접미사는 모두 거부하고 한 단계 더 깊은 이름(`*.push.example.com`)만 받는다. 기본 허용 목록의
 * 접미사 항목(push.services.mozilla.com, notify.windows.com)은 3레이블 이상이라 영향이 없다. 두 레이블 호스트 하나만 열려면
 * 와일드카드 대신 정확한 호스트로 적는다.
 */
const MINIMUM_WILDCARD_SUFFIX_LABELS = 3;
const MAXIMUM_LOGGED_ENTRIES_PER_ISSUE = 10;

/** 추가 허용 호스트 항목을 받아들이지 못한 이유. */
export type WebPushHostEntryIssue =
  | "not-a-bare-hostname"
  | "non-ascii-hostname"
  | "ip-address"
  | "internal-name"
  | "too-few-labels"
  | "invalid-hostname"
  | "wildcard-too-broad";

export interface IgnoredWebPushHostEntry {
  readonly issue: WebPushHostEntryIssue;
  /**
   * 입력 원문. 호스트 이름 모양(문자·숫자·`.`·`-`·`_`·`*`, 레이블 63자 이하)일 때만 담고, 스킴·경로·포트·사용자 정보가
   * 섞였거나 모양이 이상한 값은 비밀이 섞였을 수 있어 null 로 둔다.
   */
  readonly entry: string | null;
}

export interface WebPushPolicy {
  /** 정규화된 허용 항목: 정확한 호스트이거나 ".suffix" 형태의 하위 도메인 접미사. */
  readonly allowedHosts: readonly string[];
  /** 환경 변수의 추가 항목 중 받아들이지 못해 버린 개수. */
  readonly ignoredHostEntries: number;
  /** 버린 항목과 이유(시작 로그용). 개수는 ignoredHostEntries 와 같다. */
  readonly ignoredHostEntryDetails: readonly IgnoredWebPushHostEntry[];
  readonly maxSubscriptionsPerProject: number;
  readonly maxSubscriptionsPerUser: number;
  readonly fanOutConcurrency: number;
}

function boundedInteger(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const normalized = raw?.trim();
  if (!normalized) return fallback;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
}

/**
 * 호스트 이름 모양(문자·숫자·`.`·`-`·`_`·`*`, 레이블 63자 이하, 10레이블 이하)인지. 이런 값만 로그에 원문으로 남긴다.
 * 스킴·경로·포트·사용자 정보가 섞인 값은 비밀(토큰·비밀번호)이 섞였을 수 있어 남기지 않는다.
 */
function isHostnameShaped(raw: string): boolean {
  // 와일드카드 접두어(`*.`·`.`)와 끝의 점은 이름의 일부로 보지 않는다.
  const labels = raw.replace(/^\*?\./u, "").replace(/\.$/u, "").split(".");
  return raw.length <= 253
    && labels.length <= 10
    && labels.every((label) => /^[\p{L}\p{N}*_-]{1,63}$/u.test(label));
}

type HostEntryResolution =
  | { readonly accepted: string }
  | { readonly issue: WebPushHostEntryIssue };

/**
 * 한 항목을 정규화한다. 공개 도메인 이름(또는 그 하위 도메인 접미사)이 아니면 받아들이지 못한 이유를 돌려준다.
 * 접미사(`*.x.y`·`.x.y`)는 접두어를 뗀 이름이 MINIMUM_WILDCARD_SUFFIX_LABELS 레이블 이상일 때만 받는다.
 */
function resolveHostEntry(entry: string): HostEntryResolution {
  let candidate = entry.trim().toLowerCase().replace(/\.$/u, "");
  if (candidate === "*") return { issue: "wildcard-too-broad" };
  const suffix = candidate.startsWith("*.") || candidate.startsWith(".");
  if (suffix) candidate = candidate.replace(/^\*?\./u, "");
  if (isIP(candidate) !== 0) return { issue: "ip-address" };
  if (!BARE_HOSTNAME_CHARACTERS.test(candidate)) return { issue: "not-a-bare-hostname" };
  if (NON_ASCII_CHARACTER.test(candidate)) return { issue: "non-ascii-hostname" };
  if (candidate === "localhost" || INTERNAL_HOST_SUFFIX.test(candidate)) {
    return { issue: "internal-name" };
  }
  const labelCount = candidate.split(".").length;
  if (suffix && labelCount < MINIMUM_WILDCARD_SUFFIX_LABELS) {
    return { issue: "wildcard-too-broad" };
  }
  // EXACT_HOST 가 두 레이블 이상을 요구하므로 "intranet" 같은 단일 레이블 이름도 걸러진다.
  if (!EXACT_HOST.test(candidate)) {
    return { issue: labelCount < 2 ? "too-few-labels" : "invalid-hostname" };
  }
  return { accepted: suffix ? `.${candidate}` : candidate };
}

/**
 * 환경 변수에서 정책을 읽는다. 숫자 설정은 허용 범위로 고정한다(0·음수는 최솟값 1, 상한 초과는 상한). 숫자가 아니거나
 * 비어 있으면 기본값을 쓴다. 호스트 추가 항목 중 받아들이지 못한 것은 버리고 이유를 ignoredHostEntryDetails 에 남긴다
 * (시작 때 한 번 reportIgnoredWebPushHostEntries 로 알린다. 이 함수는 요청마다 불리므로 직접 로그를 남기지 않는다).
 */
export function resolveWebPushPolicy(env: EnvLike = process.env): WebPushPolicy {
  const allowedHosts = [...DEFAULT_WEB_PUSH_ALLOWED_HOSTS];
  const ignoredHostEntryDetails: IgnoredWebPushHostEntry[] = [];
  for (const entry of (env[WEB_PUSH_EXTRA_ALLOWED_HOSTS_ENV] ?? "").split(/[\s,;]+/u)) {
    if (!entry) continue;
    const resolution = resolveHostEntry(entry);
    if ("issue" in resolution) {
      ignoredHostEntryDetails.push({
        issue: resolution.issue,
        entry: isHostnameShaped(entry) ? entry : null,
      });
    } else if (!allowedHosts.includes(resolution.accepted)) {
      allowedHosts.push(resolution.accepted);
    }
  }
  return {
    allowedHosts,
    ignoredHostEntries: ignoredHostEntryDetails.length,
    ignoredHostEntryDetails,
    maxSubscriptionsPerProject: boundedInteger(
      env.PRODUCTION_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_PROJECT,
      DEFAULT_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_PROJECT,
      1,
      MAXIMUM_SUBSCRIPTIONS_PER_PROJECT,
    ),
    maxSubscriptionsPerUser: boundedInteger(
      env.PRODUCTION_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_USER,
      DEFAULT_WEB_PUSH_MAX_SUBSCRIPTIONS_PER_USER,
      1,
      MAXIMUM_SUBSCRIPTIONS_PER_USER,
    ),
    fanOutConcurrency: boundedInteger(
      env.PRODUCTION_WEB_PUSH_FANOUT_CONCURRENCY,
      DEFAULT_WEB_PUSH_FAN_OUT_CONCURRENCY,
      1,
      MAXIMUM_FAN_OUT_CONCURRENCY,
    ),
  };
}

const HOST_ENTRY_ISSUE_GUIDANCE: Readonly<Record<WebPushHostEntryIssue, string>> = Object.freeze({
  "not-a-bare-hostname":
    "호스트 이름만 적어야 합니다(https:// 같은 스킴·경로·포트·사용자 정보는 쓸 수 없음)",
  "non-ascii-hostname": "한글 등 비ASCII 도메인은 punycode(xn--…)로 적어야 합니다",
  "ip-address": "IP 주소는 허용하지 않습니다",
  "internal-name": "localhost 와 내부 도메인(.internal·.local 등)은 허용하지 않습니다",
  "too-few-labels": "점으로 구분된 두 레이블 이상의 공개 도메인이어야 합니다",
  "invalid-hostname": "도메인 이름 형식이 올바르지 않습니다",
  "wildcard-too-broad":
    `와일드카드(*. 또는 .)는 ${MINIMUM_WILDCARD_SUFFIX_LABELS}레이블 이상의 접미사만 쓸 수 있습니다`
    + "(예: *.push.example.com). 그보다 짧으면 정확한 호스트로 적으세요",
});

/**
 * 무시한 추가 허용 호스트 항목을 서버 시작 때 한 번 경고 로그로 알린다. 호스트 이름은 비밀이 아니므로 이름 모양인 항목은
 * 원문과 이유를 적고, 스킴·경로·포트·사용자 정보가 섞인 값은 개수만 적는다. 무시한 항목이 없으면 아무것도 남기지 않는다.
 */
export function reportIgnoredWebPushHostEntries(
  policy: Pick<WebPushPolicy, "ignoredHostEntries" | "ignoredHostEntryDetails">,
  logger: Pick<Logger, "warn"> = new Logger("ProductionWebPush"),
): void {
  if (policy.ignoredHostEntries === 0) return;
  const byIssue = new Map<WebPushHostEntryIssue, IgnoredWebPushHostEntry[]>();
  for (const detail of policy.ignoredHostEntryDetails) {
    byIssue.set(detail.issue, [...(byIssue.get(detail.issue) ?? []), detail]);
  }
  const groups = [...byIssue].map(([issue, details]) => {
    const named = details.flatMap(({ entry }) => (entry === null ? [] : [entry]));
    const listed = named.slice(0, MAXIMUM_LOGGED_ENTRIES_PER_ISSUE).join(", ");
    const more = named.length - MAXIMUM_LOGGED_ENTRIES_PER_ISSUE;
    const hidden = details.length - named.length;
    const subject = [
      listed,
      more > 0 ? `외 ${more}개` : "",
      hidden > 0 ? `값을 남기지 않은 항목 ${hidden}개` : "",
    ].filter(Boolean).join(" · ");
    return `[${HOST_ENTRY_ISSUE_GUIDANCE[issue]}] ${subject}`;
  });
  logger.warn(
    `${WEB_PUSH_EXTRA_ALLOWED_HOSTS_ENV} 의 ${policy.ignoredHostEntries}개 항목을 무시했습니다. `
    + `이 항목의 호스트로는 웹 푸시 구독을 받지 못합니다. ${groups.join(" ")}`,
  );
}

export function isWebPushHostAllowed(
  hostname: string,
  allowedHosts: readonly string[],
): boolean {
  const host = hostname.toLowerCase();
  return allowedHosts.some((entry) =>
    entry.startsWith(".")
      ? host.endsWith(entry) && host.length > entry.length
      : host === entry);
}

export interface WebPushSubscriptionLimitInput {
  readonly alreadyRegistered: boolean;
  readonly projectCount: number;
  readonly userCount: number;
  readonly maxPerProject: number;
  readonly maxPerUser: number;
}

export interface WebPushSubscriptionLimitViolation {
  readonly scope: "user" | "project";
  readonly limit: number;
}

/**
 * 새 endpoint 를 추가할 수 있는지 판정한다. 이미 등록된 endpoint 의 키 갱신은 행이 늘지 않으므로 항상 허용한다.
 * 둘 다 가득 찼다면 사용자가 스스로 정리할 수 있는 사용자 상한을 먼저 알린다.
 */
export function evaluateWebPushSubscriptionLimits(
  input: WebPushSubscriptionLimitInput,
): WebPushSubscriptionLimitViolation | null {
  if (input.alreadyRegistered) return null;
  if (input.userCount >= input.maxPerUser) return { scope: "user", limit: input.maxPerUser };
  if (input.projectCount >= input.maxPerProject) {
    return { scope: "project", limit: input.maxPerProject };
  }
  return null;
}

/**
 * Promise.allSettled 와 같은 결과 형태(입력 순서 유지)를 돌려주되, 동시에 진행하는 작업을 concurrency 개로
 * 제한한다. 구독이 많은 프로젝트에서 한 번의 알림이 무제한 병렬 요청을 만들지 못하게 한다.
 */
export async function settleWithConcurrency<TItem, TResult>(
  items: readonly TItem[],
  concurrency: number,
  task: (item: TItem, index: number) => Promise<TResult>,
): Promise<PromiseSettledResult<TResult>[]> {
  const results = new Array<PromiseSettledResult<TResult>>(items.length);
  const pending = items.entries();
  const workerCount = Math.min(items.length, Math.max(1, Math.floor(concurrency) || 1));
  const worker = async (): Promise<void> => {
    for (const [index, item] of pending) {
      try {
        results[index] = { status: "fulfilled", value: await task(item, index) };
      } catch (reason: unknown) {
        results[index] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}
