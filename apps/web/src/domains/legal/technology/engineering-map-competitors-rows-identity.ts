import { D, row, t } from "./engineering-map-competitors-kit";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 경쟁·참고 제품 지도의 행 — 계정·로그인 영역(소셜 로그인 공급자 비교).
 * 이 영역은 경쟁 제품이 아니라 ‘로그인 공급자를 비교해 고른 기록’이다. 채택(연동)한 곳, 후속 후보, 제외한 곳을 공급자별로 적는다.
 * 비교 기준 문서(social-login-provider-setup)의 선정표는 낡은 부분이 있어, 코드(auth.controller)와 어긋나는 곳은 그 사실을 행에 적는다.
 * 쓰는 규칙은 engineering-map-competitors-kit.ts 머리말을 따른다. 자격 증명 값은 어디에도 싣지 않는다.
 */

const SETUP = "docs/social-login-provider-setup.md";
const AUTH_CONTROLLER = "apps/api/src/modules/auth/auth.controller.ts";
const PROVIDER_DISCOVERY = "apps/web/src/domains/auth/components/auth-provider-discovery.ts";

export const COMPETITOR_ROWS_IDENTITY: readonly EngineeringMapRow[] = [
  row({
    id: "google-sign-in",
    name: "Google sign-in",
    domain: D.identity,
    url: "https://developers.google.com/identity/gsi/web/guides/overview",
    urlTitle: "Google Identity Services for web",
    what: t(
      "Google 계정으로 로그인하는 방식입니다. 비교 문서는 범용 계정이라는 점을 들어 ‘유지·보강’으로 정했습니다.",
      "Signing in with a Google account. The comparison document kept and reinforced it because it is a general-purpose account.",
    ),
    learned: t(
      "채택: 구글 아이덴티티 서비스(GIS)의 ID 토큰 흐름을 쓰고 서버가 클라이언트 ID를 대상으로 검증. 예전 리다이렉트 방식은 폴백일 때만 비밀 값이 필요.",
      "Adopted: the Google Identity Services (GIS) ID-token flow, with the server verifying against the client ID. The older redirect flow needs a secret only as a fallback.",
    ),
    overlap: t("로그인 창의 Google 버튼과 서버 로그인 검증.", "The Google button in the sign-in dialog and server-side verification."),
    evidence: [SETUP, AUTH_CONTROLLER, "apps/web/src/domains/auth/components/google-identity-button.tsx"],
  }),
  row({
    id: "kakao-sign-in",
    name: "Kakao sign-in",
    domain: D.identity,
    url: "https://developers.kakao.com/",
    what: t(
      "카카오 계정으로 로그인하는 방식입니다. 비교 문서는 국내 사용자 전환에 가장 중요하다고 보아 실연동으로 정했습니다.",
      "Signing in with a Kakao account. The comparison document chose a real integration because it matters most for converting Korean users.",
    ),
    learned: t(
      "채택: 닉네임·프로필 이미지만 선택 동의로 요청하고 이메일 범위는 승인 뒤에만 켬. 연결 해제 웹훅이 헤더와 앱 ID를 모두 검증하고, 다른 로그인 수단이 남으면 카카오 연동만 제거.",
      "Adopted: request only nickname and profile image as optional consent, and turn on the email scope only after approval. The unlink webhook checks both header and app ID and removes only the Kakao link when other sign-in methods remain.",
    ),
    overlap: t("서버 카카오 로그인과 연결 해제 웹훅.", "Server Kakao sign-in and the unlink webhook."),
    evidence: [SETUP, AUTH_CONTROLLER, "apps/api/src/modules/auth/kakao-unlink-webhook.ts", PROVIDER_DISCOVERY],
  }),
  row({
    id: "naver-sign-in",
    name: "Naver sign-in",
    domain: D.identity,
    url: "https://developers.naver.com/",
    what: t(
      "네이버 계정으로 로그인하는 방식입니다. 비교 문서는 국내 계정 보급과 웹툰 사용자 친화성을 들어 실연동으로 정했습니다.",
      "Signing in with a Naver account. The comparison document chose a real integration citing domestic account reach and friendliness to webtoon users.",
    ),
    learned: t(
      "채택: 별명·프로필 이미지만 추가 동의로 받고 이메일은 요청하지 않으며 기존 계정과 자동 병합하지 않음. 연결 해제 콜백은 시각과 서명을 검증해 처리.",
      "Adopted: take only nickname and profile image as extra consent, never request email, and never auto-merge with an existing account. The unlink callback is processed after checking timestamp and signature.",
    ),
    overlap: t("서버 네이버 로그인과 연결 해제 콜백.", "Server Naver sign-in and the unlink callback."),
    evidence: [SETUP, AUTH_CONTROLLER, "apps/api/src/modules/auth/naver-unlink-webhook.ts", PROVIDER_DISCOVERY],
  }),
  row({
    id: "github-sign-in",
    name: "GitHub sign-in",
    domain: D.identity,
    url: "https://docs.github.com/en/apps/oauth-apps",
    urlTitle: "GitHub OAuth apps",
    what: t(
      "GitHub 계정으로 로그인하는 방식입니다. 비교 문서는 창작 도구·개발자·오픈소스 사용자에게 맞는다고 보아 새 실연동으로 정했습니다.",
      "Signing in with a GitHub account. The comparison document chose a new real integration as a good fit for creative-tool, developer and open-source users.",
    ),
    learned: t(
      "채택: 인가 코드 흐름에 S256 PKCE를 쓰고 검증된 이메일만 사용, 없으면 GitHub 사용자 ID 기반 별도 계정. 로그인이 끝나면 접근·갱신 토큰을 저장하지 않음.",
      "Adopted: S256 PKCE on the authorization-code flow and only verified emails; without one, a separate account is made from the GitHub user ID. Access and refresh tokens are not stored after sign-in.",
    ),
    overlap: t("서버 GitHub 로그인.", "Server GitHub sign-in."),
    evidence: [SETUP, AUTH_CONTROLLER, PROVIDER_DISCOVERY],
  }),
  row({
    id: "apple-sign-in",
    name: "Apple sign-in",
    domain: D.identity,
    url: "https://developer.apple.com/sign-in-with-apple/",
    what: t(
      "Apple 계정으로 로그인하는 방식입니다. 비교 문서의 선정표는 ‘유료 개발자 프로그램이 필요해 제외’라고 적었습니다.",
      "Signing in with an Apple account. The comparison document's selection table lists it as excluded because it needs a paid developer program.",
    ),
    learned: t(
      "표가 낡음: 같은 문서 뒤 절과 코드에는 Apple 로그인(서비스 ID, ES256 클라이언트 비밀, form_post)이 있음. 이메일 대신 Apple의 사용자 식별자를 정본으로 쓰고 같은 이메일이라는 이유로 자동 병합하지 않음.",
      "The table is stale: a later section of the same document and the code both have Apple sign-in (services ID, ES256 client secret, form_post). Apple's user identifier, not email, is authoritative, and accounts are not auto-merged by matching email.",
    ),
    overlap: t("서버 Apple 로그인(auth.controller)과 로그인 공급자 탐지.", "Server Apple sign-in (auth.controller) and sign-in provider discovery."),
    evidence: [SETUP, AUTH_CONTROLLER, PROVIDER_DISCOVERY],
  }),
  row({
    id: "line-sign-in",
    name: "LINE sign-in",
    domain: D.identity,
    url: "https://developers.line.biz/en/services/line-login/",
    urlTitle: "LINE Login",
    what: t(
      "LINE 계정으로 로그인하는 방식입니다. 비교 문서는 일본·대만으로 넓힐 때 먼저 검토할 후속 후보로 적었습니다.",
      "Signing in with a LINE account. The comparison document lists it as a follow-up candidate to consider first when expanding to Japan and Taiwan.",
    ),
    learned: t(
      "도입하지 않음: 지금의 국내 중심 가입 화면에는 과하다고 판단. 로그인 화면의 선택 피로와 개인정보 동의 범위를 우선함.",
      "Not adopted: judged too much for today's Korea-focused sign-up screen. Choice fatigue and the scope of privacy consent come first.",
    ),
    overlap: t("겹치는 기능 없음(후속 후보로만 기록).", "No overlapping feature (recorded only as a follow-up candidate)."),
    evidence: [SETUP],
  }),
  row({
    id: "microsoft-sign-in",
    name: "Microsoft sign-in",
    domain: D.identity,
    url: "https://learn.microsoft.com/en-us/entra/identity-platform/",
    urlTitle: "Microsoft identity platform",
    what: t(
      "Microsoft 계정(기업·학교 포함)으로 로그인하는 방식입니다. 비교 문서는 기업·학교 계정 수요가 확인될 때 도입할 후속 후보로 적었습니다.",
      "Signing in with a Microsoft account, including work and school accounts. The comparison document lists it as a follow-up candidate once demand for such accounts is confirmed.",
    ),
    learned: t(
      "도입하지 않음: 수요가 확인되기 전에는 공급자를 늘리지 않음.",
      "Not adopted: providers are not added before demand is confirmed.",
    ),
    overlap: t("겹치는 기능 없음(후속 후보로만 기록).", "No overlapping feature (recorded only as a follow-up candidate)."),
    evidence: [SETUP],
  }),
  row({
    id: "discord-sign-in",
    name: "Discord sign-in",
    domain: D.identity,
    url: "https://docs.discord.com/developers/topics/oauth2",
    urlTitle: "Discord OAuth2",
    what: t(
      "Discord 계정으로 로그인하는 방식입니다. 비교 문서는 커뮤니티 서버 연동 요구가 생길 때 도입할 후속 후보로 적었습니다.",
      "Signing in with a Discord account. The comparison document lists it as a follow-up candidate for when a community-server integration need arises.",
    ),
    learned: t(
      "도입하지 않음: 연동 요구가 생기기 전에는 공급자를 늘리지 않음.",
      "Not adopted: providers are not added before such a need arises.",
    ),
    overlap: t("겹치는 기능 없음(후속 후보로만 기록).", "No overlapping feature (recorded only as a follow-up candidate)."),
    evidence: [SETUP],
  }),
  row({
    id: "facebook-sign-in",
    name: "Facebook sign-in",
    domain: D.identity,
    url: "https://developers.facebook.com/documentation/facebook-login",
    urlTitle: "Facebook Login",
    what: t(
      "Facebook·Instagram 계정으로 로그인하는 방식입니다. 비교 문서는 핵심 사용자 적합도가 낮고 앱 검수와 데이터 사용 고지가 더해져 제외한다고 적었습니다.",
      "Signing in with a Facebook or Instagram account. The comparison document excludes it because fit with core users is low and app review and data-use disclosures would be added.",
    ),
    learned: t(
      "도입하지 않음: 얻는 것에 비해 검수·고지 부담이 크다고 판단.",
      "Not adopted: the review and disclosure burden outweighs what it adds.",
    ),
    overlap: t("겹치는 기능 없음(제외한 사례로만 기록).", "No overlapping feature (recorded only as an excluded case)."),
    evidence: [SETUP],
  }),
];
