import { isIP } from "node:net";

import { z } from "zod";

/**
 * The API must not accept a client supplied forwarding header merely because it
 * exists.  A forwarding header is authoritative only after the directly
 * connected peer is explicitly allowlisted as a trusted proxy.
 *
 * Exact IP allowlists are deliberately used here instead of a permissive
 * `trust proxy` switch.  Deployment owners can safely expand the allowlist at
 * their ingress boundary without turning arbitrary `x-forwarded-for` values
 * into rate-limit identities.
 */
const ClientIpHeaderSchema = z.enum([
  "x-forwarded-for",
  "x-real-ip",
  "cf-connecting-ip",
]);

const BooleanEnvironmentSchema = z.enum(["true", "false"]);

const MaximumForwardedHopsSchema = z
  .string()
  .regex(/^[1-9][0-9]*$/u)
  .transform(Number)
  .pipe(z.number().int().min(1).max(32));

export type AuthClientIpHeader = z.infer<typeof ClientIpHeaderSchema>;

export type AuthClientIpPolicy =
  | {
      readonly mode: "direct";
    }
  | {
      readonly mode: "trusted-proxy";
      readonly trustedProxyIps: ReadonlySet<string>;
      readonly clientIpHeader: AuthClientIpHeader;
      readonly maximumForwardedHops: number;
    };

export type AuthClientIpEnvironment = Partial<
  Record<
    | "AUTH_TRUSTED_PROXY_ENABLED"
    | "AUTH_TRUSTED_PROXY_IPS"
    | "AUTH_TRUSTED_CLIENT_IP_HEADER"
    | "AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS",
    string | undefined
  >
>;

export class AuthClientIpConfigurationError extends Error {
  constructor() {
    super("Auth trusted proxy configuration is invalid.");
    this.name = "AuthClientIpConfigurationError";
  }
}

/**
 * Validates the forwarding boundary at boot.  Missing or disabled configuration
 * keeps the conservative direct-socket identity policy; it never enables a
 * proxy header implicitly.
 */
export function resolveAuthClientIpPolicy(
  environment: AuthClientIpEnvironment,
): AuthClientIpPolicy {
  const enabled = environment.AUTH_TRUSTED_PROXY_ENABLED;
  if (enabled === undefined || enabled === "" || enabled === "false") {
    return { mode: "direct" };
  }
  if (BooleanEnvironmentSchema.safeParse(enabled).success === false || enabled !== "true") {
    throw new AuthClientIpConfigurationError();
  }

  const clientIpHeader = ClientIpHeaderSchema.safeParse(
    environment.AUTH_TRUSTED_CLIENT_IP_HEADER,
  );
  const maximumForwardedHops = MaximumForwardedHopsSchema.safeParse(
    environment.AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS ?? "8",
  );
  const trustedProxyIps = parseTrustedProxyIps(
    environment.AUTH_TRUSTED_PROXY_IPS,
  );

  if (
    !clientIpHeader.success ||
    !maximumForwardedHops.success ||
    trustedProxyIps === null
  ) {
    throw new AuthClientIpConfigurationError();
  }

  return {
    mode: "trusted-proxy",
    trustedProxyIps,
    clientIpHeader: clientIpHeader.data,
    maximumForwardedHops: maximumForwardedHops.data,
  };
}

export interface AuthClientIpRequest {
  readonly headers?: Readonly<Record<string, string | string[] | undefined>>;
  readonly socket?: { readonly remoteAddress?: string | undefined };
}

/**
 * Returns an address only after it has passed the configured trust boundary.
 * For X-Forwarded-For-style headers we walk from the proxy-side (right) toward
 * the browser-side (left), stopping at the first non-proxy address.  This is
 * robust when a trusted proxy appends the direct peer to a client-provided
 * chain: an injected left-most address cannot replace the right-most client.
 */
export function resolveAuthClientIp(
  request: AuthClientIpRequest,
  policy: AuthClientIpPolicy,
): string {
  const remoteAddress = normalizeIp(request.socket?.remoteAddress);
  if (policy.mode === "direct" || remoteAddress === null) {
    return remoteAddress ?? "unknown";
  }

  if (!policy.trustedProxyIps.has(remoteAddress)) {
    return remoteAddress;
  }

  const rawHeader = readHeader(request.headers, policy.clientIpHeader);
  if (rawHeader === undefined) return remoteAddress;

  const forwarded = parseForwardedHeader(
    rawHeader,
    policy.clientIpHeader,
    policy.maximumForwardedHops,
  );
  if (forwarded === null || forwarded.length === 0) return remoteAddress;

  if (policy.clientIpHeader !== "x-forwarded-for") {
    return forwarded[0] ?? remoteAddress;
  }

  for (let index = forwarded.length - 1; index >= 0; index -= 1) {
    const candidate = forwarded[index];
    if (candidate !== undefined && !policy.trustedProxyIps.has(candidate)) {
      return candidate;
    }
  }

  // All listed hops are also trusted proxies.  Keep a deterministic identity
  // from the chain rather than trusting a malformed/missing browser value.
  return forwarded[0] ?? remoteAddress;
}

const DIRECT_CLIENT_IP_POLICY: AuthClientIpPolicy = Object.freeze({ mode: "direct" });
const MAXIMUM_CACHED_ENVIRONMENT_POLICIES = 16;
const policiesByEnvironment = new Map<string, AuthClientIpPolicy>();

function clientIpEnvironmentKey(environment: AuthClientIpEnvironment): string {
  return [
    environment.AUTH_TRUSTED_PROXY_ENABLED,
    environment.AUTH_TRUSTED_PROXY_IPS,
    environment.AUTH_TRUSTED_CLIENT_IP_HEADER,
    environment.AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS,
  ]
    .map((value) => value ?? "\u0000")
    .join("\u0001");
}

function clientIpPolicyFromEnvironment(
  environment: AuthClientIpEnvironment,
): AuthClientIpPolicy {
  const key = clientIpEnvironmentKey(environment);
  const cached = policiesByEnvironment.get(key);
  if (cached) return cached;
  let policy: AuthClientIpPolicy;
  try {
    policy = resolveAuthClientIpPolicy(environment);
  } catch (error) {
    if (!(error instanceof AuthClientIpConfigurationError)) throw error;
    // 부팅 시 AuthModule 이 잘못된 설정을 이미 거부한다. 그래도 요청 경로에서는 헤더를
    // 신뢰하는 쪽으로 열리지 않고 직접 연결 주소만 쓰는 쪽으로 닫는다.
    policy = DIRECT_CLIENT_IP_POLICY;
  }
  if (policiesByEnvironment.size >= MAXIMUM_CACHED_ENVIRONMENT_POLICIES) {
    policiesByEnvironment.clear();
  }
  policiesByEnvironment.set(key, policy);
  return policy;
}

/**
 * 인증 컨트롤러 밖의 요청 단위 속도 제한이 같은 신뢰 경계를 쓰게 하는 단일 진입점이다.
 *
 * 클라이언트가 임의로 보낼 수 있는 `X-Forwarded-For`·`X-Real-IP`·`CF-Connecting-IP` 값을
 * 그대로 신원으로 쓰면 요청마다 값을 바꿔 제한을 우회할 수 있다. `AUTH_TRUSTED_PROXY_*` 로
 * 명시한 신뢰 프록시가 직접 연결한 요청에서만 전달 헤더를 인정하고, 그 외에는 소켓 주소를 쓴다.
 */
export function resolveRequestClientIp(
  request: AuthClientIpRequest,
  environment: AuthClientIpEnvironment = process.env,
): string {
  return resolveAuthClientIp(request, clientIpPolicyFromEnvironment(environment));
}

function parseTrustedProxyIps(value: string | undefined): ReadonlySet<string> | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const entries = value.split(",").map((entry) => normalizeIp(entry));
  if (entries.length === 0 || entries.some((entry) => entry === null)) {
    return null;
  }
  return new Set(entries as string[]);
}

function readHeader(
  headers: AuthClientIpRequest["headers"],
  name: AuthClientIpHeader,
): string | undefined {
  if (!headers) return undefined;
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.length === 1 ? value[0] : undefined;
  return typeof value === "string" ? value : undefined;
}

function parseForwardedHeader(
  raw: string,
  header: AuthClientIpHeader,
  maximumForwardedHops: number,
): string[] | null {
  const candidates =
    header === "x-forwarded-for"
      ? raw.split(",")
      : [raw];
  if (candidates.length === 0 || candidates.length > maximumForwardedHops) {
    return null;
  }

  const normalized = candidates.map((candidate) => normalizeIp(candidate));
  if (normalized.some((candidate) => candidate === null)) return null;
  return normalized as string[];
}

function normalizeIp(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const withoutBrackets =
    trimmed.startsWith("[") && trimmed.endsWith("]")
      ? trimmed.slice(1, -1)
      : trimmed;
  const mappedIpv4 = withoutBrackets.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/iu);
  const candidate = mappedIpv4?.[1] ?? withoutBrackets;
  return isIP(candidate) === 0 ? null : candidate.toLowerCase();
}
