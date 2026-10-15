import { HttpException, HttpStatus } from "@nestjs/common";

import {
  resolveRequestClientIp,
  type AuthClientIpEnvironment,
  type AuthClientIpRequest,
} from "./auth-client-ip";
import { LocalAuthRateLimiter } from "./auth-rate-limit";

export interface AnonymousClientLimiterOptions {
  /** 한도를 나누는 이름. 같은 이름은 같은 버킷을 쓴다. */
  readonly name: string;
  readonly limit: number;
  readonly windowMs: number;
  readonly maximumIdentities?: number;
  readonly now?: () => number;
  /** 테스트용. 기본값은 프로세스 환경(AUTH_TRUSTED_PROXY_*)이다. */
  readonly environment?: AuthClientIpEnvironment;
}

export interface AnonymousClientLimiter {
  /** 한도를 넘으면 429 HttpException 을 던진다. */
  enforce(request: AuthClientIpRequest): void;
}

/**
 * 로그인 없이 호출할 수 있으면서 서버 키로 외부 API(쿼터 소모)를 부르는 엔드포인트용 클라이언트별
 * 고정 창 제한이다. 신원은 신뢰 프록시 정책을 거친 클라이언트 주소라서 `X-Forwarded-For` 를
 * 바꿔 한도를 새로 얻을 수 없고, 활성 신원 슬롯이 가득 차면 새 신원도 거부한다(회전 우회 방지).
 * 프로세스 로컬이므로 인스턴스가 여러 개면 인스턴스별 한도다.
 */
export function createAnonymousClientLimiter(
  options: AnonymousClientLimiterOptions,
): AnonymousClientLimiter {
  const limiter = new LocalAuthRateLimiter({
    maximumIdentities: options.maximumIdentities ?? 5_000,
    ...(options.now ? { now: options.now } : {}),
  });
  return {
    enforce(request) {
      const client = options.environment
        ? resolveRequestClientIp(request, options.environment)
        : resolveRequestClientIp(request);
      const decision = limiter.consume(
        `${options.name}:${client}`,
        options.limit,
        options.windowMs,
      );
      if (decision.status === "accepted") return;
      const retryAfterSeconds = decision.status === "rate-limited"
        ? Math.max(1, Math.ceil(decision.remainingTtlMs / 1_000))
        : Math.max(1, Math.ceil(options.windowMs / 1_000));
      throw new HttpException(
        {
          code: "rate_limited",
          message: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
          retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    },
  };
}
