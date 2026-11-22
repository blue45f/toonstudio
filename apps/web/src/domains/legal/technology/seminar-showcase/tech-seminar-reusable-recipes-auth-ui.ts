/**
 * 타 사이트 표준 재사용 실무 레시피 6선 — 인증 · UI 인터랙션 영역 (1~3번).
 *
 * 발췌 코드·API 엔드포인트·파일 경로는 ToonStudio 실제 소스에서 직접 읽어 사실만 기록한다.
 */

import type { TechSeminarReusableRecipe } from "./tech-seminar-reusable-recipes";

export const SEMINAR_RECIPES_AUTH_AND_UI: readonly TechSeminarReusableRecipe[] = Object.freeze([
  {
    id: "kakao-oauth-unlink",
    order: 1,
    category: "auth",
    badge: "인증 · 웹훅",
    title: "카카오 계정 연동 & Unlink 웹훅",
    analogy:
      "아파트 출입카드 등록과 분실 신고 창구입니다. 입주민이 관리사무소(카카오 앱)에서 카드를 해지하면, 문지기 서버가 즉시 출입증을 찢고 기록을 정리해야 합니다.",
    oneLineSummary:
      "카카오 로그인은 REST API 키와 opt-in 이메일 스코프로 분리하고, 연결 해제 웹훅은 KakaoAK 상수 시간 검증 뒤 세션을 먼저 폐기합니다.",
    relatedChapterId: "oauth-pkce-unlink",
    diagram: {
      ariaLabel: "카카오 OAuth 로그인과 연결 해제 웹훅 처리 흐름",
      caption: "로그인 인가 흐름과 비동기 Unlink 웹훅의 세션 선폐기 순서",
      nodes: [
        { title: "1. 인가 시작", detail: "profile_nickname + state 쿠키", tone: "accent" },
        { title: "2. 토큰 교환", detail: "kauth 토큰 → kapi v2/user/me", tone: "cool" },
        { title: "3. Unlink 수신", detail: "POST /webhooks/kakao/unlink", tone: "warn" },
        { title: "4. 세션 선폐기", detail: "세션 차단 → 연동 삭제/탈퇴", tone: "good" },
      ],
      edgeLabels: ["__Host- state 쿠키", "KakaoAK 상수 비교", "200 OK · no-store"],
      guardNote:
        "보안 불변식: timingSafeEqual로 KakaoAK 검증 → 내부 정리가 일시 실패해도 카카오 재시도 폭주를 막기 위해 HTTP 200 응답 유지, PII는 로그에서 제외",
    },
    apiSpecs: [
      {
        endpointOrSymbol: "GET /api/auth/oauth/kakao",
        methodOrKind: "HTTP 302",
        requestOrInput: "브라우저 진입 (KAKAO_ACCOUNT_EMAIL_SCOPE_ENABLED=true일 때만 account_email 추가)",
        responseOrOutput: "Set-Cookie: __Host-toonstudio-oauth-state-kakao (HttpOnly; Secure; SameSite=Lax; Max-Age=600)",
        errorContract: "키 미설정 시 503 ServiceUnavailableException",
      },
      {
        endpointOrSymbol: "GET /api/auth/oauth/kakao/callback",
        methodOrKind: "HTTP 302",
        requestOrInput: "Query: code, state + Cookie: __Host-toonstudio-oauth-state-kakao",
        responseOrOutput: "HttpOnly 세션 JWT 발급 후 /auth/callback#session=1 리다이렉트 (URL에 PII 미노출)",
        errorContract: "state 불일치 시 /auth/callback#error=bad_state (중복 콜백은 기존 세션 검증 후 복구)",
      },
      {
        endpointOrSymbol: "POST /webhooks/kakao/unlink",
        methodOrKind: "HTTP 200",
        requestOrInput:
          "Header: Authorization: KakaoAK <KAKAO_ADMIN_KEY> · Body: { app_id: string, user_id: string, referrer_type: KakaoUnlinkReferrerType }",
        responseOrOutput: '200 { "ok": true } + Header: Cache-Control: no-store',
        errorContract: "키 미설정 503 · 헤더/app_id 불일치 401 · user_id/referrer_type 형식 오류 400",
      },
    ],
    codeExcerpt: {
      title: "카카오 Unlink 웹훅 상수 시간 검증 및 세션 선폐기",
      language: "ts",
      sourcePath: "apps/api/src/modules/auth/kakao-unlink-webhook.ts",
      code: `function constantTimeEqual(value: string, expected: string): boolean {
  const valueBytes = Buffer.from(value, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  return valueBytes.length === expectedBytes.length
    && timingSafeEqual(valueBytes, expectedBytes);
}

export function parseKakaoUnlinkWebhook(
  authorization: string | undefined,
  payload: unknown,
  env: NodeJS.ProcessEnv = process.env,
): KakaoUnlinkEvent {
  const adminKey = configured(env, "KAKAO_ADMIN_KEY");
  const expectedAppId = configured(env, "KAKAO_APP_ID");
  if (
    typeof authorization !== "string"
    || !constantTimeEqual(authorization.trim(), \`KakaoAK \${adminKey}\`)
  ) {
    throw new KakaoWebhookAuthenticationError("invalid Kakao webhook authority");
  }
  // app_id · user_id 숫자 형식과 허용된 referrer_type 5종만 통과시킨다.
  // ...
}

export async function processKakaoUnlink(
  event: KakaoUnlinkEvent,
  store: KakaoUnlinkStore = databaseKakaoUnlinkStore,
): Promise<"not-linked" | "link-removed" | "account-deleted"> {
  const state = await store.findAccountState(event.userId);
  if (!state) return "not-linked";
  if (!state.hasAnotherLoginMethod) {
    await store.softDelete(state.userId, \`kakao-unlink:\${event.referrerType}\`);
    return "account-deleted";
  }
  // 세션을 먼저 폐기해 연동 삭제가 일시 실패해도 다음 웹훅 재시도가 안전하다.
  await store.revokeSessions(state.userId);
  await store.removeKakaoLink(state.userId, event.userId);
  return "link-removed";
}`,
    },
    repoEvidencePaths: [
      "apps/api/src/modules/auth/kakao-unlink-webhook.ts",
      "apps/api/src/modules/auth/kakao-unlink-webhook.controller.ts",
      "apps/api/src/server/oauth.ts",
    ],
    adoptionSteps: [
      {
        step: 1,
        title: "동의 항목과 이메일 스코프를 환경변수로 분리",
        action:
          "기본 스코프는 profile_nickname, profile_image만 요청하고, 비즈앱 승인 후에만 KAKAO_ACCOUNT_EMAIL_SCOPE_ENABLED=true로 account_email을 켭니다.",
        check: "권한 없는 개발 앱에서도 로그인 거부(KOE205) 없이 즉시 로그인 성공",
      },
      {
        step: 2,
        title: "Unlink 웹훅 검증기와 저장소 인터페이스 분리",
        action:
          "Authorization: KakaoAK 헤더와 app_id를 timingSafeEqual로 검증하는 순수 파서를 두고, DB 작업은 KakaoUnlinkStore 인터페이스로 주입합니다.",
        check: "단위 테스트에서 잘못된 Admin Key·app_id·referrer_type이 401/400으로 거절되는지 검증",
      },
      {
        step: 3,
        title: "다른 로그인 수단 유무에 따라 분기하고 세션 먼저 폐기",
        action:
          "비밀번호나 타 OAuth 계정이 없으면 softDelete, 있으면 revokeSessions → removeKakaoLink 순서로 실행하고 컨트롤러는 Cache-Control: no-store와 200을 반환합니다.",
        check: "동일 Unlink 페이로드를 두 번 전송해도 2회차에 not-linked로 멱등 종료",
      },
    ],
    gotchas: [
      "카카오 비즈앱 심사를 받기 전에 account_email 스코프를 무조건 넣으면 전체 로그인 화면이 막힙니다. 반드시 opt-in 플래그로 여세요.",
      "프로필 사진 조회 시 https://kapi.kakao.com/v2/user/me?secure_resource=true 옵션을 빼면 HTTP 이미지 URL이 내려와 HTTPS 사이트에서 Mixed Content 경고가 뜹니다.",
      "연동 행을 먼저 지우고 세션을 나중에 폐기하면, 중간 장애 시 재시도 웹훅이 사용자를 찾지 못해 탈퇴된 계정의 세션이 살아남습니다.",
    ],
    speakerNotes: [
      "카카오 로그인을 붙일 때 제일 많이 놓치는 부분이 '연결 끊기 웹훅'입니다. 사용자가 카카오톡 설정에서 앱 연결을 끊으면 우리 서버로 POST가 옵니다.",
      "ToonStudio는 parseKakaoUnlinkWebhook에서 Admin Key를 문자열 === 비교 대신 timingSafeEqual로 비교하고, app_id까지 대조합니다.",
      "특히 processKakaoUnlink 마지막 3줄을 보시면 세션을 먼저 폐기한 뒤 accounts 행을 지웁니다. 그래야 중간에 DB 오류가 나도 재시도 때 세션이 남지 않습니다.",
    ],
    officialLinks: [
      {
        label: "Kakao Developers · 카카오 로그인 REST API",
        url: "https://developers.kakao.com/docs/latest/ko/kakaologin/rest-api",
        kind: "공식 문서",
      },
      {
        label: "Kakao Developers · 연결 끊기 웹훅",
        url: "https://developers.kakao.com/docs/latest/ko/kakaologin/callback",
        kind: "웹훅 명세",
      },
      {
        label: "RFC 6749 · OAuth 2.0 Authorization Framework",
        url: "https://datatracker.ietf.org/doc/html/rfc6749",
        kind: "표준 스펙",
      },
      {
        label: "Node.js Crypto · timingSafeEqual",
        url: "https://nodejs.org/api/crypto.html#cryptotimingsafeequala-b",
        kind: "런타임 API",
      },
    ],
  },
  {
    id: "google-oauth-state-cookie",
    order: 2,
    category: "auth",
    badge: "인증 · 보안 쿠키",
    title: "구글 OAuth & Signed HttpOnly State Cookie",
    analogy:
      "공항 수하물 표와 같습니다. 출발할 때 내 브라우저 주머니(__Host- 쿠키)에 서명된 반쪽을 넣고, 돌아올 때 항공사(OAuth 콜백)가 건넨 반쪽과 1글자도 안 틀리는지 맞춥니다.",
    oneLineSummary:
      "구글 GIS ID 토큰은 서버에서 서명·aud·iss·email_verified를 검증하고, 리다이렉트 OAuth는 HMAC 서명 state와 __Host- HttpOnly 쿠키를 상수 시간 대조합니다.",
    relatedChapterId: "oauth-pkce-unlink",
    diagram: {
      ariaLabel: "구글 GIS ID 토큰 검증 및 서명된 HttpOnly State Cookie 보안 흐름",
      caption: "이중 경로(GIS ID 토큰 + 리다이렉트 OAuth)의 CSRF 차단과 계정 병합 경계",
      nodes: [
        { title: "1. 쿠키·PKCE 발급", detail: "__Host- state + S256 verifier", tone: "accent" },
        { title: "2. Origin/State 대조", detail: "timingSafeEqual · TTL 10분", tone: "cool" },
        { title: "3. ID 토큰 검증", detail: "JWK 서명 · aud · iss · sub", tone: "warn" },
        { title: "4. 명시적 연결", detail: "자동 이메일 병합 금지(409)", tone: "good" },
      ],
      edgeLabels: ["HttpOnly; Secure; Path=/", "검증 후 즉시 쿠키 소각", "canAutoLink = false"],
      guardNote:
        "보안 불변식: 이메일은 변경 가능한 프로필 값이라 자동 병합을 금지하고(409 ACCOUNT_LINK_REQUIRED), 기존 로그인 세션 안에서만 계정 연결 허용",
    },
    apiSpecs: [
      {
        endpointOrSymbol: "POST /api/auth/oauth/google/id-token",
        methodOrKind: "HTTP 200 / 409",
        requestOrInput: "Header: Origin(허용 도메인 검증) · Body: { idToken: string (<= 16,384 bytes) }",
        responseOrOutput: "Set-Cookie 세션 JWT + 200 { ok: true, user }",
        errorContract: "Origin 불일치 403 · 토큰 만료/위조 401 · 동일 이메일 기존 계정 존재 시 409 ACCOUNT_LINK_REQUIRED",
      },
      {
        endpointOrSymbol: "POST /api/auth/oauth/google/link",
        methodOrKind: "HTTP 200",
        requestOrInput: "Header: x-user-id(인증 세션), Origin · Body: { idToken: string }",
        responseOrOutput: "현재 로그인된 계정에 Google subject(sub) 명시적 연결",
        errorContract: "타 계정에 이미 연결된 Google sub이면 409 OAuthIdentityAlreadyLinkedError",
      },
      {
        endpointOrSymbol: "resolveOAuthStateCookieOptions(provider)",
        methodOrKind: "TS Contract",
        requestOrInput: 'provider: "google" | "apple" | "kakao" | "naver" | "github"',
        responseOrOutput:
          '{ httpOnly: true, secure: true, sameSite: provider === "apple" ? "none" : "lax", path: prod ? "/" : "/api/auth/oauth/:p", maxAge: 600_000 }',
        errorContract: "프로덕션 __Host- 접두사 규칙(Secure + Path=/ + Domain 미지정) 위반 시 브라우저가 쿠키 거부",
      },
    ],
    codeExcerpt: {
      title: "Google ID 토큰 서버 검증 · 브라우저 바인딩 State · __Host- 쿠키 옵션",
      language: "ts",
      sourcePath: "apps/api/src/server/oauth.ts",
      code: `export async function verifyGoogleIdToken(idToken: string): Promise<NormalizedProfile> {
  const audience = googleClientId();
  if (!audience) throw new GoogleAuthConfigurationError();
  const token = typeof idToken === "string" ? idToken.trim() : "";
  if (!token || token.length > GOOGLE_ID_TOKEN_MAX_LENGTH || token.split(".").length !== 3) {
    throw new GoogleAuthCredentialError("invalid id_token format");
  }
  const ticket = await getGoogleVerifier().verifyIdToken({ idToken: token, audience });
  const payload = ticket.getPayload();
  if (!payload?.sub) throw new GoogleAuthCredentialError("invalid id_token payload");
  if (payload.iss !== "accounts.google.com" && payload.iss !== "https://accounts.google.com") {
    throw new GoogleAuthCredentialError("invalid issuer");
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new GoogleAuthCredentialError("google email is missing or unverified");
  }
  return {
    providerAccountId: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: true,
    name: payload.name ?? payload.given_name ?? null,
    image: payload.picture ?? null,
  };
}

export function verifyBrowserBoundState(
  id: OAuthProviderId,
  state: unknown,
  cookieState: unknown,
  maxAgeMs = 10 * 60_000,
): boolean {
  if (
    typeof state !== "string"
    || typeof cookieState !== "string"
    || cookieState.length !== state.length
    || !verifyState(id, state, maxAgeMs)
  ) return false;
  return timingSafeEqual(Buffer.from(state, "utf8"), Buffer.from(cookieState, "utf8"));
}

export function canAutoLinkOAuthEmail(): boolean {
  return false; // 이메일은 변경 가능한 프로필 값 — 인증된 명시적 연결만 허용
}`,
    },
    repoEvidencePaths: [
      "apps/api/src/server/oauth.ts",
      "apps/api/src/oauth-state-cookie.ts",
      "apps/api/src/modules/auth/auth.controller.ts",
    ],
    adoptionSteps: [
      {
        step: 1,
        title: "__Host- 접두사 HttpOnly State·PKCE 쿠키 발급",
        action:
          "HMAC-SHA256으로 서명한 state(제공자·nonce·발급시각·목적 login|link 포함)를 만들고, 프로덕션에서는 __Host- 접두사 + Secure + Path=/ + TTL 10분 쿠키에 담습니다.",
        check: "콜백에서 URL state와 쿠키 state가 일치한 뒤에만 쿠키를 삭제(stale 탭이 새 탭 쿠키를 지우지 않도록 방지)",
      },
      {
        step: 2,
        title: "Google GIS ID 토큰을 google-auth-library로 서버 검증",
        action:
          "클라이언트가 전달한 JWT를 신뢰하지 말고 서버에서 OAuth2Client 싱글턴(JWK 캐시 재사용)으로 aud·iss·exp·email_verified·sub를 모두 확인합니다.",
        check: "Origin 허용 목록 검사 + 요청 레이트 리밋 + 16KB 길이 상한을 진입점에서 선차단",
      },
      {
        step: 3,
        title: "자동 이메일 병합 금지(Account Takeover 차단)",
        action:
          "provider+sub로 못 찾았는데 같은 이메일 계정이 있으면 자동 합치지 말고 409 ACCOUNT_LINK_REQUIRED를 반환해 로그인 후 /oauth/google/link로 연결하게 합니다.",
        check: "타인이 같은 이메일로 사전 가입해 둔 계정이 소셜 로그인으로 탈취되지 않는지 통합 테스트 검증",
      },
    ],
    gotchas: [
      "Apple form_post처럼 크로스 사이트 POST 콜백이 오는 제공자는 SameSite=Lax 쿠키가 빠지므로 sameSite: 'none'을 분기해야 합니다(oauth-state-cookie.ts:33).",
      "콜백 검증에 실패했을 때 무조건 state 쿠키를 지워 버리면, 사용자가 탭을 두 개 열어 로그인할 때 먼저 돌아온 오래된 콜백이 정상 탭의 쿠키를 망가뜨립니다.",
      "ID 토큰 원문은 로그인 순간의 검증 증명일 뿐입니다. DB나 세션에 저장하지 말고 검증 직후 payload.sub만 키로 쓰세요.",
    ],
    speakerNotes: [
      "OAuth 구현에서 가장 치명적인 두 가지 실수가 'State를 서버 세션에만 두고 쿠키 바인딩을 빼먹는 것'과 '이메일이 같다고 기존 계정에 자동 병합하는 것'입니다.",
      "ToonStudio는 oauth-state-cookie.ts에서 프로덕션 쿠키에 __Host- 접두사를 붙여 서브도메인 쿠키 주입 자체를 브라우저 스펙 단계에서 차단합니다.",
      "그리고 canAutoLinkOAuthEmail()은 아예 상수로 false를 돌려줍니다. 불편해 보여도 계정 탈취(Pre-Account Takeover)를 근본적으로 막는 가장 확실한 경계입니다.",
    ],
    officialLinks: [
      {
        label: "Google Identity · 서버에서 Google ID 토큰 검증",
        url: "https://developers.google.com/identity/gsi/web/guides/verify-google-id-token",
        kind: "공식 문서",
      },
      {
        label: "Google OAuth 2.0 프로토콜 가이드",
        url: "https://developers.google.com/identity/protocols/oauth2",
        kind: "공식 문서",
      },
      {
        label: "RFC 7636 · PKCE (Proof Key for Code Exchange)",
        url: "https://datatracker.ietf.org/doc/html/rfc7636",
        kind: "표준 스펙",
      },
      {
        label: "MDN · Set-Cookie __Host- 접두사 규약",
        url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie",
        kind: "웹 표준",
      },
    ],
  },
  {
    id: "pointer-dnd-a11y",
    order: 3,
    category: "ui",
    badge: "UI · 60fps · 접근성",
    title: "60fps 접근성 드래그 앤 드롭(레이어·컷 스트립·칸반)",
    analogy:
      "자석 보드 위에서 포스트잇을 옮길 때, 살짝 건드린 건 클릭으로 두고 5mm 넘게 밀었을 때만 반투명 그림자가 따라오게 만든 구조입니다.",
    oneLineSummary:
      "외부 DnD 패키지 없이 Pointer Events, 5px 임계치, 순수 드롭 의도 함수, 키보드(Space·방향키·Enter) 조작을 한 패턴으로 묶었습니다.",
    relatedChapterId: "pointer-dnd-60fps",
    diagram: {
      ariaLabel: "포인터 캡처 기반 60fps 드래그 앤 드롭 상태 전이 흐름",
      caption: "입력 장치 분기(마우스·터치·키보드) → 60fps 고스트 → 순수 드롭 판정 → 상태 커밋",
      nodes: [
        { title: "1. 입력 진입", detail: "마우스 5px / 터치 손잡이 / Space", tone: "accent" },
        { title: "2. 고스트·스크롤", detail: "will-change + rAF 엣지 가속", tone: "cool" },
        { title: "3. 순수 의도 판정", detail: "앞/뒤·그룹(28~72%)·RTL", tone: "warn" },
        { title: "4. 커밋·오클릭 차단", detail: "onDrop + suppressNextClick", tone: "good" },
      ],
      edgeLabels: ["touch-action: none", "elementFromPoint", "blur/Esc 즉시 취소"],
      guardNote:
        "아키텍처 경계: DnD 훅은 '어디에 놓았는지(onDrop)'만 계산해 알리고, 실제 배열 재정렬·Undo 스택·저장은 도메인 컨트롤러가 소유한다",
    },
    apiSpecs: [
      {
        endpointOrSymbol: "useBoardDnd(options: UseBoardDndOptions)",
        methodOrKind: "React Hook",
        requestOrInput: "{ root, enabled, contextKey, columnIds, idsFor, locate, locked?, onDrop }",
        responseOrOutput: "BoardDragState ({ ids, sourceId, kind: 'pointer' | 'keyboard', target: BoardDropTarget | null })",
        errorContract: "contextKey 변경 · window blur · document.hidden 시 고스트와 rAF를 즉시 해제",
      },
      {
        endpointOrSymbol: "resolveStudioLayerGroupDropIntent(input)",
        methodOrKind: "Pure Function",
        requestOrInput: "{ payload: StudioLayerDragPayload, targetKey, targetGroupId, targetId, relativeY }",
        responseOrOutput: "StudioLayerDropIntent | null (relativeY 0.28..0.72 구간은 into-group, 상/하단은 front|back)",
        errorContract: "자기 자신·소속 그룹에 드롭 시 null 반환(제자리 연산 차단)",
      },
      {
        endpointOrSymbol: "stripDropSlotFromPointer(targetIndex, rect, clientX, rtl)",
        methodOrKind: "Pure Function",
        requestOrInput: "targetIndex: number, rect: { left, width }, clientX: number, rtl?: boolean",
        responseOrOutput: "삽입 슬롯 인덱스 (0..count), isNoopDropSlot(dragIndex, slot)로 무효 이동 사전 제외",
        errorContract: "rect.width <= 0이면 안전하게 ratio=0 처리",
      },
    ],
    codeExcerpt: {
      title: "레이어 그룹 중앙(28~72%) 드롭 판정 + 직후 오클릭 1회 차단",
      language: "ts",
      sourcePath: "apps/web/src/domains/creator/layer/studio-layer-drag.ts",
      code: `export function resolveStudioLayerGroupDropIntent(input: {
  payload: StudioLayerDragPayload;
  targetKey: string;
  targetGroupId: string;
  targetId: string | null;
  relativeY: number;
}): StudioLayerDropIntent | null {
  const { payload, targetKey, targetGroupId, targetId } = input;
  const safeRelativeY = Number.isFinite(input.relativeY) ? input.relativeY : 0.5;
  const relativeY = Math.max(0, Math.min(1, safeRelativeY));
  if (payload.kind === "group" && payload.groupId === targetGroupId) return null;

  // 그룹 행의 중앙 28%~72%에 놓으면 그룹 안으로 편입, 위/아래 가장자리는 인접 이동
  const centerDrop = relativeY >= 0.28 && relativeY <= 0.72;
  if (
    payload.kind === "items" &&
    payload.sourceGroupId !== "mixed" &&
    payload.sourceGroupId !== targetGroupId &&
    centerDrop
  ) {
    return { kind: "into-group", targetKey, groupId: targetGroupId };
  }
  if (!targetId) return null;

  const side: LayerSelectionDropSide = relativeY < 0.5 ? "front" : "back";
  return typeof payload.sourceGroupId === "string"
    ? { kind: "around", mode: "to-root", targetKey, targetId, side }
    : { kind: "around", mode: "units", targetKey, targetId, side };
}

// apps/web/src/domains/creator/production-hub/board/use-board-dnd.ts
function suppressNextClick(): void {
  const stop = (event: Event) => { event.preventDefault(); event.stopPropagation(); };
  window.addEventListener("click", stop, true);
  window.setTimeout(() => window.removeEventListener("click", stop, true), 0);
}`,
    },
    repoEvidencePaths: [
      "apps/web/src/domains/creator/layer/studio-layer-drag.ts",
      "apps/web/src/domains/creator/page/studio-page-strip-dnd.ts",
      "apps/web/src/domains/creator/production-hub/board/use-board-dnd.ts",
    ],
    adoptionSteps: [
      {
        step: 1,
        title: "드롭 수학(좌표 → 슬롯·의도)을 DOM 없는 순수 함수로 분리",
        action:
          "앞/뒤 절반 판정, 그룹 중앙 구간(0.28~0.72), RTL 반전, 제자리 드롭 무시를 React 밖 순수 TypeScript 파일에 작성해 Vitest로 먼저 고정합니다.",
        check: "경계값(NaN, width=0, 자기 자신 드롭, RTL)이 모두 단위 테스트로 검증됨",
      },
      {
        step: 2,
        title: "마우스 5px 임계치 + 터치 손잡이 분리 + 고스트 transform 이동",
        action:
          "pointerdown에서 5px 이상 이동할 때만 고스트를 붙이고, 모바일 터치는 손잡이 버튼(touch-action: none)에서만 드래그를 시작해 세로 스크롤을 살립니다.",
        check: "고스트에 pointer-events: none과 id 제거(중복 DOM id 방지)를 적용했는지 확인",
      },
      {
        step: 3,
        title: "키보드 조작(Space·방향키·Enter·Esc)과 이탈 정리를 함께 구현",
        action:
          "손잡이 버튼의 onKeyDown에서 Space로 집고 방향키로 열/위치를 옮긴 뒤 Enter로 확정합니다. window blur·visibilitychange·contextKey 변경 시 진행 중인 드래그를 자동 취소합니다.",
        check: "마우스 없이 키보드만으로 카드 이동과 취소가 끝나고, 드롭 직후 카드 상세 모달이 오작동으로 열리지 않음",
      },
    ],
    gotchas: [
      "HTML5 Drag API(studio-page-strip-dnd.ts)를 쓸 때 dataTransfer.setData('text/plain', ...)를 빠뜨리면 Firefox에서 아예 드래그가 시작되지 않습니다.",
      "고스트를 cloneNode(true)로 만들 때 내부 [id] 속성을 지우지 않으면 접근성 레이블(aria-labelledby) 대상이 중복되어 스크린 리더가 꼬입니다.",
      "드롭이 끝나고 포인터를 떼는 순간 브라우저가 뒤따라 click 이벤트를 발사합니다. suppressNextClick()으로 캡처 단계에서 1회만 막아야 카드가 열리지 않습니다.",
    ],
    speakerNotes: [
      "많은 팀이 칸반이나 레이어 트리를 만들 때 무거운 DnD 라이브러리를 먼저 설치했다가 모바일 스크롤 충돌과 키보드 접근성 때문에 다시 뜯어고칩니다.",
      "ToonStudio는 드롭 계산(studio-layer-drag.ts)과 포인터 제스처(use-board-dnd.ts)를 완전히 분리했습니다. 마우스는 5px 임계치, 터치는 손잡이 전용, 키보드는 Space/방향키/Enter를 지원합니다.",
      "특히 드래그 직후 발생하는 유령 클릭을 막는 suppressNextClick 5줄과 cloneNode 시 id 속성을 제거하는 습관은 어떤 프로젝트에 복붙해도 바로 효과를 봅니다.",
    ],
    officialLinks: [
      {
        label: "MDN · Pointer Events API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events",
        kind: "웹 표준",
      },
      {
        label: "W3C · Pointer Events Level 3 Specification",
        url: "https://www.w3.org/TR/pointerevents/",
        kind: "표준 스펙",
      },
      {
        label: "MDN · HTML Drag and Drop API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API",
        kind: "웹 표준",
      },
      {
        label: "W3C WAI-ARIA · Authoring Practices Guide",
        url: "https://www.w3.org/WAI/ARIA/apg/",
        kind: "접근성 가이드",
      },
    ],
  },
]);
