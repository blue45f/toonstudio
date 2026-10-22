import { timingSafeEqual } from "node:crypto";

import type { NextFunction, Request, Response } from "express";

export const EDGE_ORIGIN_AUTH_HEADER = "x-toonstudio-origin-secret";
const MINIMUM_SECRET_BYTES = 32;

export type EdgeOriginAuthEnvironment = Partial<
  Record<"CLOUDFLARE_EDGE_ORIGIN_SECRET", string | undefined>
>;

export type EdgeOriginAuthStatus = "enforced" | "disabled";

type EdgeOriginAuthStartupEnvironment = EdgeOriginAuthEnvironment
  & Partial<Record<"NODE_ENV" | "API_RUNTIME_ROLE", string | undefined>>;

export class EdgeOriginAuthConfigurationError extends Error {
  constructor() {
    super("Cloudflare edge origin authentication configuration is invalid.");
    this.name = "EdgeOriginAuthConfigurationError";
  }
}

function configuredSecret(
  environment: EdgeOriginAuthEnvironment,
): Buffer | null {
  const raw = environment.CLOUDFLARE_EDGE_ORIGIN_SECRET;
  if (raw === undefined || raw === "") return null;
  const normalized = raw.trim();
  const bytes = Buffer.from(normalized, "utf8");
  if (
    raw !== normalized
    || bytes.byteLength < MINIMUM_SECRET_BYTES
  ) {
    throw new EdgeOriginAuthConfigurationError();
  }
  return bytes;
}

/**
 * 에지 출처 인증 공유 비밀을 해석한다. 설정이 없으면 null, 형식이 틀리면(공백 포함·32바이트 미만)
 * EdgeOriginAuthConfigurationError 를 던진다. 클라이언트 IP 전용 헤더 신뢰처럼 같은 비밀로 출처를 증명해야
 * 하는 다른 경계가 같은 검증을 쓰게 한다.
 */
export function resolveEdgeOriginSecret(
  environment: EdgeOriginAuthEnvironment,
): Buffer | null {
  return configuredSecret(environment);
}

/**
 * 요청이 보낸 비밀이 기대값과 같은지 상수 시간으로 비교한다. 문자열 한 개만 인정한다(배열·누락은 불일치).
 */
export function edgeOriginSecretMatches(
  supplied: string | string[] | undefined,
  expected: Buffer,
): boolean {
  if (typeof supplied !== "string") return false;
  const bytes = Buffer.from(supplied, "utf8");
  return bytes.byteLength === expected.byteLength
    && timingSafeEqual(bytes, expected);
}

/**
 * 이 설정으로 에지 출처 인증이 실제로 집행되는지. 공유 비밀이 없거나(선택 사항) 잘못된 값이면 "disabled" 다.
 * 잘못된 값은 미들웨어 생성이 실패해 서버가 뜨지 못하므로 집행 중이라고 말하지 않는다.
 */
export function resolveEdgeOriginAuthStatus(
  environment: EdgeOriginAuthEnvironment,
): EdgeOriginAuthStatus {
  try {
    return configuredSecret(environment) === null ? "disabled" : "enforced";
  } catch {
    return "disabled";
  }
}

/**
 * production 의 공개 웹 API 역할(full)인데 공유 비밀이 없으면 시작 시 남길 한국어 경고 문구를 돌려준다.
 * 비밀이 선택 사항이라 부팅을 막지 않는다(막으면 비밀이 없는 운영 환경의 API 가 내려간다). 대신 눈에 띄는
 * 오류 로그와 /api/health/capabilities 의 edgeOriginAuth 로 운영자가 놓치지 않게 한다.
 * studio-live·capability-worker 역할은 별도 경로와 자체 인증을 쓰므로 대상이 아니다. 값은 문구에 넣지 않는다.
 */
export function edgeOriginAuthStartupFinding(
  environment: EdgeOriginAuthStartupEnvironment,
): string | null {
  if (environment.NODE_ENV !== "production") return null;
  if ((environment.API_RUNTIME_ROLE?.trim() || "full") !== "full") return null;
  const raw = environment.CLOUDFLARE_EDGE_ORIGIN_SECRET;
  // 값이 있으면(형식이 틀려도) 미들웨어가 집행하거나 부팅 단계에서 닫힌다.
  if (raw !== undefined && raw !== "") return null;
  return "production 웹 API 인데 CLOUDFLARE_EDGE_ORIGIN_SECRET 이 설정되지 않아 에지 출처 인증이 꺼져 있습니다. "
    + "Cloudflare 게이트웨이를 거치지 않고 API 원본 주소로 직접 들어오는 요청도 모두 처리합니다. "
    + "32바이트 이상의 비밀을 이 API 의 환경변수와 게이트웨이 Worker 의 CORE_ORIGIN_SECRET 에 같은 값으로 설정하세요. "
    + "배포 후 /api/health/capabilities 의 edgeOriginAuth 가 enforced 인지 확인합니다(DEPLOY.md 5절).";
}

function isHealthProbe(request: Request): boolean {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  return request.path === "/api/health"
    || request.path === "/api/health/live"
    || request.path === "/api/health/ready";
}

export function createEdgeOriginAuthMiddleware(
  environment: EdgeOriginAuthEnvironment = process.env,
) {
  const expected = configuredSecret(environment);
  return (request: Request, response: Response, next: NextFunction): void => {
    if (expected === null || isHealthProbe(request)) {
      next();
      return;
    }

    const accepted = edgeOriginSecretMatches(
      request.headers[EDGE_ORIGIN_AUTH_HEADER],
      expected,
    );
    if (!accepted) {
      response.status(403).json({
        statusCode: 403,
        error: "forbidden",
        message: "Trusted edge origin is required",
      });
      return;
    }

    next();
  };
}
