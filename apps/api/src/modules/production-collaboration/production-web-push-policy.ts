import { isIP } from "node:net";

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

export interface WebPushPolicy {
  /** 정규화된 허용 항목: 정확한 호스트이거나 ".suffix" 형태의 하위 도메인 접미사. */
  readonly allowedHosts: readonly string[];
  /** 환경 변수의 추가 항목 중 형식이 잘못돼 버린 개수(값은 남기지 않는다). */
  readonly ignoredHostEntries: number;
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

/** 한 항목을 정규화한다. 공개 도메인 이름(또는 그 하위 도메인 접미사)이 아니면 null. */
function normalizeHostEntry(entry: string): string | null {
  let candidate = entry.trim().toLowerCase().replace(/\.$/u, "");
  const suffix = candidate.startsWith("*.") || candidate.startsWith(".");
  if (suffix) candidate = candidate.replace(/^\*?\./u, "");
  // EXACT_HOST 가 두 레이블 이상을 요구하므로 ".com" 처럼 모든 도메인을 열어 버리는 최상위 접미사도 걸러진다.
  if (
    !EXACT_HOST.test(candidate)
    || isIP(candidate) !== 0
    || INTERNAL_HOST_SUFFIX.test(candidate)
  ) {
    return null;
  }
  return suffix ? `.${candidate}` : candidate;
}

export function resolveWebPushPolicy(env: EnvLike = process.env): WebPushPolicy {
  const allowedHosts = [...DEFAULT_WEB_PUSH_ALLOWED_HOSTS];
  let ignoredHostEntries = 0;
  for (const entry of (env[WEB_PUSH_EXTRA_ALLOWED_HOSTS_ENV] ?? "").split(/[\s,;]+/u)) {
    if (!entry) continue;
    const normalized = normalizeHostEntry(entry);
    if (normalized === null) ignoredHostEntries += 1;
    else if (!allowedHosts.includes(normalized)) allowedHosts.push(normalized);
  }
  return {
    allowedHosts,
    ignoredHostEntries,
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
