import { describe, expect, it, vi } from "vitest";

import {
  OAuthReauthRequiredError,
  classifyOAuthRecoveryError,
  computeOAuthRetryDelayMs,
  constantTimeStringEqual,
  createSingleFlightTokenRefresher,
  executeWithOAuthBackoff,
  isRestrictedInAppBrowserUserAgent,
  isRetryableOAuthFailure,
  isValidPkceCodeVerifier,
  parseRetryAfterMs,
  resolveOAuthPopupFallback,
  validateOAuthCallbackSecurity,
} from "./oauth-recovery-kit";

const VALID_VERIFIER = "aB3dE5fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5zA7bC9dE1fG";

describe("OAuth PKCE / state 콜백 보안 검증", () => {
  it("상수 시간 비교가 동일 문자열·다른 문자열·길이 차이를 정확히 구분한다", () => {
    expect(constantTimeStringEqual("state-token-123", "state-token-123")).toBe(true);
    expect(constantTimeStringEqual("state-token-123", "state-token-124")).toBe(false);
    expect(constantTimeStringEqual("short", "shorter")).toBe(false);
    expect(constantTimeStringEqual("", "")).toBe(true);
  });

  it("정상 state와 유효한 PKCE verifier·challenge가 모두 일치하면 통과한다", () => {
    const result = validateOAuthCallbackSecurity({
      provider: "google",
      receivedState: "signed-state-abc",
      expectedState: "signed-state-abc",
      issuedAtMs: 1_000,
      nowMs: 5_000,
      requirePkce: true,
      codeVerifier: VALID_VERIFIER,
      expectedCodeChallenge: "challenge-xyz",
      computedCodeChallenge: "challenge-xyz",
      codeChallengeMethod: "S256",
    });

    expect(result.ok).toBe(true);
    expect(result.failureCode).toBeNull();
    expect(result.shouldClearStateCookie).toBe(true);
    expect(result.classification).toBeNull();
  });

  it("state 불일치 시 CSRF로 거절하고 다른 정상 탭의 쿠키를 지우지 않는다", () => {
    const result = validateOAuthCallbackSecurity({
      provider: "kakao",
      receivedState: "attacker-state",
      expectedState: "browser-cookie-state",
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("state_mismatch");
    expect(result.shouldClearStateCookie).toBe(false);
    expect(result.recommendedAction).toBe("relogin");
    expect(result.classification?.category).toBe("security");
  });

  it("이미 인증 세션이 있는 상태의 중복 콜백은 오류 대신 기존 세션 유지로 복구한다", () => {
    const result = validateOAuthCallbackSecurity({
      provider: "kakao",
      receivedState: "already-consumed-state",
      expectedState: null,
      hasExistingAuthenticatedSession: true,
    });

    expect(result.ok).toBe(false);
    expect(result.failureCode).toBe("duplicate_callback");
    expect(result.recoverable).toBe(true);
    expect(result.recommendedAction).toBe("reuse-existing-session");
  });

  it("state TTL 만료와 PKCE verifier 누락·불일치를 각각 감지한다", () => {
    const expired = validateOAuthCallbackSecurity({
      provider: "google",
      receivedState: "same",
      expectedState: "same",
      issuedAtMs: 0,
      nowMs: 11 * 60_000,
    });
    expect(expired.ok).toBe(false);
    expect(expired.failureCode).toBe("state_expired");
    expect(expired.shouldClearStateCookie).toBe(true);

    const missingPkce = validateOAuthCallbackSecurity({
      provider: "google",
      receivedState: "same",
      expectedState: "same",
      requirePkce: true,
      codeVerifier: "",
    });
    expect(missingPkce.failureCode).toBe("pkce_missing_verifier");

    expect(isValidPkceCodeVerifier("too-short")).toBe(false);
    expect(isValidPkceCodeVerifier(VALID_VERIFIER)).toBe(true);

    const pkceMismatch = validateOAuthCallbackSecurity({
      provider: "google",
      receivedState: "same",
      expectedState: "same",
      requirePkce: true,
      codeVerifier: VALID_VERIFIER,
      expectedCodeChallenge: "expected-hash",
      computedCodeChallenge: "different-hash",
    });
    expect(pkceMismatch.failureCode).toBe("pkce_mismatch");
  });
});

describe("팝업 차단 · 인앱 웹뷰 리다이렉트 폴백 판단", () => {
  it("팝업 핸들이 null이거나 차단 오류면 같은 창 리다이렉트로 폴백한다", () => {
    const blocked = resolveOAuthPopupFallback({
      provider: "kakao",
      popupWindow: null,
      redirectAuthorizeUrl: "https://kauth.kakao.com/oauth/authorize?client_id=demo",
    });

    expect(blocked.shouldFallbackToRedirect).toBe(true);
    expect(blocked.strategy).toBe("redirect");
    expect(blocked.reasonCode).toBe("popup_blocked");
    expect(blocked.redirectUrl).toContain("kauth.kakao.com");
  });

  it("카카오톡·인스타그램 인앱 브라우저에서 Google 로그인 시 외부 브라우저 전환을 안내한다", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 KAKAOTALK 11.0.0";
    expect(isRestrictedInAppBrowserUserAgent(ua)).toBe(true);

    const decision = resolveOAuthPopupFallback({
      provider: "google",
      userAgent: ua,
      popupWindow: { closed: false },
      redirectAuthorizeUrl: "/api/auth/oauth/google",
    });
    expect(decision.shouldFallbackToRedirect).toBe(true);
    expect(decision.strategy).toBe("external-browser-handoff");
    expect(decision.reasonCode).toBe("in_app_webview_disallowed");
  });

  it("사용자가 직접 팝업을 닫은 경우 강제 리다이렉트하지 않는다", () => {
    const decision = resolveOAuthPopupFallback({
      provider: "google",
      popupError: { code: "popup_closed_by_user" },
      popupWindow: { closed: true },
    });

    expect(decision.shouldFallbackToRedirect).toBe(false);
    expect(decision.reasonCode).toBe("user_cancelled");
  });
});

describe("일시적 5xx · 429 · 네트워크 오류 지수 백오프 재시도", () => {
  it("5xx와 네트워크 오류만 지수 백오프로 재시도하고 401/409/invalid_grant는 즉시 실패한다", async () => {
    expect(isRetryableOAuthFailure({ status: 503 })).toBe(true);
    expect(isRetryableOAuthFailure({ status: 429 })).toBe(true);
    expect(isRetryableOAuthFailure(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryableOAuthFailure({ status: 401 })).toBe(false);
    expect(isRetryableOAuthFailure({ status: 409, code: "ACCOUNT_LINK_REQUIRED" })).toBe(false);
    expect(isRetryableOAuthFailure({ code: "invalid_grant" })).toBe(false);

    const delays: number[] = [];
    let callCount = 0;
    const result = await executeWithOAuthBackoff(
      async () => {
        callCount += 1;
        if (callCount === 1) throw { status: 503, message: "Service Unavailable" };
        if (callCount === 2) throw new TypeError("Failed to fetch");
        return "ok-token";
      },
      {
        maxRetries: 3,
        baseDelayMs: 200,
        maxDelayMs: 2_000,
        jitterRatio: 0,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );

    expect(result.value).toBe("ok-token");
    expect(result.attempts).toBe(3);
    expect(delays).toEqual([200, 400]);
    expect(result.totalWaitMs).toBe(600);
  });

  it("Retry-After 헤더(초·HTTP 날짜)를 해석해 백오프 대기 시간에 반영한다", () => {
    expect(parseRetryAfterMs("2")).toBe(2000);
    expect(parseRetryAfterMs(1.5)).toBe(1500);
    const future = new Date(1_700_000_005_000).toUTCString();
    expect(parseRetryAfterMs(future, 1_700_000_000_000)).toBe(5000);

    expect(
      computeOAuthRetryDelayMs(0, {
        baseDelayMs: 200,
        maxDelayMs: 5_000,
        retryAfterMs: 3_000,
      }),
    ).toBe(3_000);
  });

  it("409 ACCOUNT_LINK_REQUIRED는 재시도 없이 즉시 예외를 전파한다", async () => {
    const operation = vi.fn().mockRejectedValue({ status: 409, code: "ACCOUNT_LINK_REQUIRED" });
    await expect(
      executeWithOAuthBackoff(operation, {
        maxRetries: 3,
        sleep: async () => undefined,
      }),
    ).rejects.toMatchObject({ status: 409, code: "ACCOUNT_LINK_REQUIRED" });
    expect(operation).toHaveBeenCalledTimes(1);
  });
});

describe("동시 401 단일 flight 토큰 갱신 큐", () => {
  it("동시에 5개 요청이 401을 받아도 refresh는 1회만 실행하고 모두 새 토큰으로 재시도한다", async () => {
    let resolveRefresh!: (token: string) => void;
    const refreshMock = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRefresh = resolve;
        }),
    );

    let clock = 10_000;
    const refresher = createSingleFlightTokenRefresher({
      refresh: refreshMock,
      dedupeWindowMs: 1_500,
      now: () => clock,
    });

    const requests = [1, 2, 3, 4, 5].map((id) =>
      refresher.executeWithAuthRetry({
        request: async (token) => {
          if (!token) throw { status: 401, message: "expired" };
          return `${id}:${token}`;
        },
      }),
    );

    // 5개 요청이 모두 401을 던지고 단일 flight에 합류할 때까지 마이크로태스크 대기
    await Promise.resolve();
    await Promise.resolve();
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(refresher.getStats().inFlight).toBe(true);

    resolveRefresh("fresh-token-v2");
    const results = await Promise.all(requests);

    expect(results).toEqual([
      "1:fresh-token-v2",
      "2:fresh-token-v2",
      "3:fresh-token-v2",
      "4:fresh-token-v2",
      "5:fresh-token-v2",
    ]);
    expect(refreshMock).toHaveBeenCalledTimes(1);
    expect(refresher.getStats().coalescedRequests).toBe(4);

    // 짧은 병합 창 내 도착한 지연 401도 새 토큰을 재사용해 중복 refresh를 막는다.
    clock += 500;
    const delayed = await refresher.refresh();
    expect(delayed).toBe("fresh-token-v2");
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });

  it("refresh 엔드포인트가 invalid_grant(401)를 반환하면 OAuthReauthRequiredError로 무한 루프를 차단한다", async () => {
    const onReauthRequired = vi.fn();
    const refresher = createSingleFlightTokenRefresher({
      refresh: vi.fn().mockRejectedValue({ status: 401, code: "invalid_grant" }),
      onReauthRequired,
    });

    await expect(refresher.refresh()).rejects.toBeInstanceOf(OAuthReauthRequiredError);
    expect(onReauthRequired).toHaveBeenCalledTimes(1);
    expect(refresher.getStats().reauthRequired).toBe(true);

    // 재인증 필요 상태에서는 추가 refresh 호출을 서버로 보내지 않는다.
    await expect(refresher.refresh()).rejects.toBeInstanceOf(OAuthReauthRequiredError);
    expect(refresher.getStats().executedRefreshes).toBe(1);
  });
});

describe("카카오 · 구글 사용자 친화적 한글 오류 분류기", () => {
  it("카카오 KOE205·계정 충돌 409·일시적 503을 정확한 한글 안내와 행동으로 분류한다", () => {
    const kakaoScope = classifyOAuthRecoveryError({ code: "KOE205" }, "kakao");
    expect(kakaoScope.code).toBe("koe205");
    expect(kakaoScope.provider).toBe("kakao");
    expect(kakaoScope.retryable).toBe(false);
    expect(kakaoScope.titleKo).toContain("카카오 동의 항목");

    const linkRequired = classifyOAuthRecoveryError(
      { status: 409, code: "ACCOUNT_LINK_REQUIRED" },
      "google",
    );
    expect(linkRequired.recommendedAction).toBe("link-existing-account");
    expect(linkRequired.messageKo).toContain("자동 병합하지 않습니다");

    const transient = classifyOAuthRecoveryError({ status: 503 }, "google");
    expect(transient.retryable).toBe(true);
    expect(transient.recommendedAction).toBe("retry");
    expect(transient.messageKo).not.toMatch(/하는 것을 가능하게 합니다|원활한 워크플로우/u);
  });
});
