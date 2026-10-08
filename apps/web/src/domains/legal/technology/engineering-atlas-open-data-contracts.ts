import { codePair, t } from "./engineering-atlas-open-data-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * open-data 카드 3: 우리가 제공하는 개발자용 Open API(매니페스트 선언) · IPFS 콘텐츠 주소 검증.
 * 사실 근거는 카드마다 usage.paths 와 facts.source 에 둔 파일이다(2026-10-07 코드와 대조).
 */
export const OPEN_DATA_CONTRACT_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "developer-open-api-manifest",
    category: "open-data",
    name: "Developer manifest",
    title: t("개발자용 Open API 는 지금 계약 선언까지입니다", "The developer Open API is, for now, a published contract"),
    status: "documented",
    tagline: t("scopes 10·events 14·actions 14를 선언해 공개하고, 키 발급과 권한 강제는 아직 없습니다.", "It publishes 10 scopes, 14 events and 14 actions; key issuance and enforcement do not exist yet."),
    background: [
      t(
        "다른 개발자가 ToonStudio와 연동하려면 무엇을 할 수 있고 어떤 알림을 받는지 적힌 설명서가 먼저 필요합니다. 식당으로 치면 메뉴판입니다. 지금 공개한 것이 이 메뉴판(매니페스트)입니다. GET /api/integrations/developer-manifest 한 번으로 권한 범위(scope) 10개, 이벤트 14개, 액션 14개, 웹훅 서명 규칙, 기본 안전 규칙을 JSON 으로 받습니다. 로그인 없이 읽을 수 있고 5분간 캐시됩니다.",
        "A developer who wants to integrate with ToonStudio first needs a document saying what can be done and which notices arrive: a menu, in restaurant terms. What is published today is that menu, the manifest. One GET /api/integrations/developer-manifest returns 10 permission scopes, 14 events, 14 actions, the webhook signing rules and the default safety rules as JSON. It can be read without logging in and is cached for five minutes.",
      ),
      t(
        "메뉴판만 있고 주문을 받는 창구는 아직 없습니다. 코드에서 찾지 못한 것은 외부 개발자용 API 키 발급·검증, OAuth 앱 등록, 스코프 강제(scope 문자열은 매니페스트에만 있음), OpenAPI 문서, 개발자별 웹훅 구독, 버전 정책입니다. 개발자 페이지(/developers)도 키 발급과 OAuth 앱 심사는 운영자가 활성화하는 단계라고 밝힙니다. 그래서 발표에서는 계약 공개와 단계적 활성화로만 설명합니다.",
        "There is a menu but no counter to take orders yet. Not found in code: API key issuance and verification for outside developers, OAuth app registration, scope enforcement (the scope strings exist only in the manifest), OpenAPI documents, per-developer webhook subscriptions and a versioning policy. The developer page (/developers) itself says key issuance and OAuth app review are operator activation steps, so talks should describe it only as a published contract with staged activation.",
      ),
      t(
        "지금 실제로 나가는 서명 웹훅은 운영자가 정한 알림 주소 한 곳으로 가는 알림입니다. 헤더 네 개를 붙입니다. X-ToonStudio-Signature(본문의 HMAC), Delivery-Id, Delivery-Timestamp, Delivery-Signature(타임스탬프·배달 ID·본문을 함께 서명). 받는 쪽은 서명을 다시 계산하고 5분 밖의 요청과 이미 받은 배달 ID 를 거절해 재전송 공격을 막을 수 있습니다. 5분 규칙은 받는 쪽 권고이고 보내는 쪽이 강제하지 않습니다.",
        "The signed webhook that actually goes out today is a notice to the single destination the operator configured. It carries four headers: X-ToonStudio-Signature (HMAC of the body), Delivery-Id, Delivery-Timestamp and Delivery-Signature (signing timestamp, delivery id and body together). A receiver can recompute the signature and reject requests older than five minutes and delivery ids it has already seen, which blocks replay. The five-minute rule is advice for receivers; the sender does not enforce it.",
      ),
      t(
        "짚어야 할 불일치가 있습니다. 매니페스트의 timestampHeader 는 x-toonstudio-timestamp 인데 실제로 보내는 헤더는 X-ToonStudio-Delivery-Timestamp 입니다. 또 연동 카탈로그의 ready 상태는 필요한 환경변수가 채워졌는지만 보고 실행 코드가 있는지는 보지 않습니다.",
        "There are mismatches to point out. The manifest declares timestampHeader as x-toonstudio-timestamp while the header actually sent is X-ToonStudio-Delivery-Timestamp. And the integration catalog's ready status only checks that the required environment variables are filled, not that execution code exists.",
      ),
    ],
    keyPoints: [
      t("공개된 것은 선언(매니페스트)뿐: 키·OAuth·스코프 강제 없음", "Only the declaration is public: no keys, OAuth or scope enforcement"),
      t("서명 웹훅은 운영자 1곳으로 가는 알림, 헤더 4개", "The signed webhook goes to one operator destination, four headers"),
      t("매니페스트와 실제 송신의 타임스탬프 헤더명이 다르다", "The manifest and the real sender disagree on the timestamp header"),
    ],
    diagram: {
      id: "developer-open-api-manifest-diagram",
      kind: "layers",
      title: t("계약 공개와 단계적 활성화", "A published contract with staged activation"),
      caption: t("외부에 열린 것은 맨 위 선언 하나이고, 아래 둘은 운영자와 로그인 사용자용이며, 맨 아래는 아직 코드에 없습니다.", "Only the top declaration is open to outsiders; the next two serve the operator and signed-in users, and the bottom is not in code yet."),
      alt: t(
        "맨 위는 공개 매니페스트 선언으로 scope 10, 이벤트 14, 액션 14를 알려 줍니다. 그 아래는 운영자가 정한 한 곳으로 가는 서명 웹훅과 로그인한 사용자가 쓰는 연동 API입니다. 맨 아래 칸은 API 키, OAuth 앱, 스코프 강제, OpenAPI 문서, 개발자별 웹훅, 버전 정책으로 아직 코드에 없습니다.",
        "The top layer is the public manifest declaring 10 scopes, 14 events and 14 actions. Below it are the signed webhook to the single operator-set destination and the integration APIs used by signed-in users. The bottom layer lists API keys, OAuth apps, scope enforcement, OpenAPI documents, developer webhooks and a versioning policy, none of which are in code yet.",
      ),
      layers: [
        { id: "declared", label: t("① 계약 선언 (공개)", "1 Published contract"), sub: t("GET /api/integrations/developer-manifest · 5분 캐시", "GET /api/integrations/developer-manifest, cached 5 min"), tone: "good" },
        { id: "hook", label: t("② 운영자 알림 웹훅", "2 Operator webhook"), sub: t("운영자가 정한 주소 1곳 · 서명 헤더 4개", "One operator-set destination, 4 signed headers"), tone: "server", chips: ["HMAC-SHA256"] },
        { id: "user", label: t("③ 로그인 사용자용 연동 API", "3 Signed-in integration APIs"), sub: t("카탈로그·레시피·실행 영수증 (로그인 세션 필요)", "Catalog, recipes, receipts (signed-in session needed)"), tone: "server" },
        { id: "missing", label: t("④ 코드에 아직 없음", "4 Not in code yet"), sub: t("API 키·OAuth 앱·스코프 강제·OpenAPI·개발자 웹훅·버전 정책", "API keys, OAuth apps, scope checks, OpenAPI, dev webhooks, versioning"), tone: "warn" },
      ],
      brackets: [
        { label: t("외부에 열린 것은 선언뿐", "Open to outsiders: the declaration"), layerIds: ["declared"] },
        { label: t("운영자·로그인 사용자용", "For the operator and signed-in users"), layerIds: ["hook", "user"] },
      ],
    },
    usage: [
      {
        feature: t("개발자 페이지 · 계약 불러오기", "Developer page · load the contract"),
        role: t("매니페스트를 불러와 scopes·events·actions·webhook·safety 를 그대로 보여 주고 JSON 으로 내려받게 합니다.", "Loads the manifest, renders scopes, events, actions, webhook and safety fields as they are, and lets people download the JSON."),
        paths: ["apps/api/src/modules/integration-platform/integration-platform.controller.ts#developerManifest", "apps/api/src/modules/integration-platform/integration-platform.service.ts#developerManifest", "apps/web/src/domains/integrations/DeveloperPlatformPage.tsx"],
        route: "/developers",
      },
      {
        feature: t("운영 알림 웹훅 서명", "Operator notification webhook signing"),
        role: t("운영자가 정한 한 곳으로 보내는 알림에 HMAC 서명 헤더 4개를 붙입니다.", "Attaches four HMAC signature headers to the notice sent to the single operator-set destination."),
        paths: ["apps/api/src/modules/production-collaboration/production-notification-provider.ts", "apps/api/src/modules/production-collaboration/production-integration-http.ts#webhookSignature"],
      },
      {
        feature: t("연동 센터 · 공급자 상태", "Integration center · provider status"),
        role: t("공급자별 상태(ready, configuration-required 등)를 필요한 환경변수의 유무로 판정해 보여 줍니다.", "Shows each provider's status (ready, configuration-required and so on) decided by whether the required environment variables are present."),
        paths: ["apps/api/src/modules/integration-platform/integration-platform.catalog.ts#resolveIntegrationProviderStatus"],
        route: "/settings/integrations",
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("받는 쪽의 웹훅 서명 검증과 재전송 방어", "Receiver-side webhook verification with replay defence"),
        language: "ts",
        ...codePair(`
const enc = new TextEncoder();
const hex = (s: string) => Uint8Array.from(s.match(/../gu) ?? [], (h) => parseInt(h, 16));
const seen = new Set<string>(); //~ 운영에서는 TTL 이 있는 저장소를 쓴다 ## use a store with a TTL in production

//~ 원본 바이트로 HMAC 을 다시 계산하고, 5분 밖의 요청과 이미 처리한 배달 ID 는 거절한다. ## Recompute the HMAC over the raw body; refuse requests older than 5 minutes and delivery ids already seen.
async function verifyDelivery(secret: string, rawBody: string, h: Headers, nowSec: number): Promise<string> {
  const ts = h.get("x-toonstudio-delivery-timestamp") ?? "";
  const id = h.get("x-toonstudio-delivery-id") ?? "";
  const given = (h.get("x-toonstudio-delivery-signature") ?? "").replace(/^sha256=/u, "");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const signed = enc.encode(ts + "\\n" + id + "\\n" + rawBody); //~ 타임스탬프·배달 ID 까지 서명 대상에 포함 ## the timestamp and delivery id are signed too
  const valid = /^[0-9a-f]{64}$/u.test(given) && (await crypto.subtle.verify("HMAC", key, hex(given), signed)); //~ 시간 상수 비교 ## constant-time comparison
  if (!valid) return "bad-signature";
  if (!/^\\d{10}$/u.test(ts) || Math.abs(nowSec - Number(ts)) > 300) return "stale"; //~ 재전송 방어 ## replay defence
  if (seen.has(id)) return "duplicate"; //~ 같은 배달은 한 번만 ## each delivery only once
  seen.add(id);
  return "ok";
}
`),
        explain: t(
          "production-notification-provider.ts 가 보내는 헤더 이름과 서명 대상(타임스탬프, 배달 ID, 본문)에 맞춘 수신 예제입니다. 보내는 쪽은 5분 규칙을 강제하지 않으므로 이 검사는 받는 쪽이 직접 해야 합니다.",
          "A receiver example matched to the header names and the signed content (timestamp, delivery id, body) sent by production-notification-provider.ts. The sender does not enforce the five-minute rule, so the receiver must apply this check itself.",
        ),
        source: "apps/api/src/modules/production-collaboration/production-notification-provider.ts",
        verify: "types",
      },
    ],
    links: [
      { title: "RFC 2104 · HMAC", url: "https://www.rfc-editor.org/rfc/rfc2104", kind: "spec", note: t("서명 방식의 원문", "The signing scheme itself") },
      { title: "MDN · SubtleCrypto.verify()", url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/verify", kind: "docs", note: t("브라우저·Workers 에서 서명 검증하기", "Verifying signatures in browsers and Workers") },
      { title: "Standard Webhooks specification", url: "https://github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md", kind: "spec", note: t("ID·타임스탬프·본문을 함께 서명하는 업계 규약", "An industry convention that signs id, timestamp and body") },
      { title: "OpenAPI Specification", url: "https://spec.openapis.org/oas/latest.html", kind: "spec", note: t("우리에게 아직 없는 API 문서의 표준", "The standard for API documents we do not have yet") },
      { title: "RFC 6749 · The OAuth 2.0 Authorization Framework", url: "https://www.rfc-editor.org/rfc/rfc6749", kind: "spec", note: t("scope 개념의 출처", "Where the idea of scopes comes from") },
    ],
    chapterIds: ["open-api-data", "architecture"],
    talk: {
      pitch: t(
        "우리가 외부 개발자에게 내놓은 것은 아직 메뉴판입니다. 요청 한 번으로 권한 범위 10개, 이벤트 14개, 액션 14개와 웹훅 서명 규칙을 공개합니다. API 키 발급, 권한 강제, OpenAPI 문서는 코드에 아직 없고, 단계적으로 활성화한다는 계획만 페이지에 적혀 있습니다.",
        "What we offer outside developers is still a menu. One request publishes 10 scopes, 14 events, 14 actions and the webhook signing rules. API key issuance, permission enforcement and OpenAPI documents are not in code yet; only the plan to activate them in stages is stated on the page.",
      ),
      analogy: t(
        "식당 메뉴판은 입구에 붙어 있지만 주문 창구는 아직 열지 않은 상태입니다.",
        "The menu is posted at the entrance, but the order counter has not opened yet.",
      ),
      questions: [
        {
          question: t("지금 외부 개발자가 API 를 쓸 수 있나요?", "Can outside developers use the API today?"),
          answer: t(
            "공개 매니페스트를 읽을 수는 있지만, 키 발급과 스코프 강제가 코드에 없어 외부 개발자용 API 로 호출할 수는 없습니다. 로그인한 사용자 세션으로 쓰는 연동 API 는 별개입니다.",
            "They can read the public manifest, but with no key issuance or scope enforcement in code there is no external developer API to call. The integration APIs used with a signed-in session are separate.",
          ),
        },
        {
          question: t("웹훅은 개발자가 구독하나요?", "Do developers subscribe to webhooks?"),
          answer: t(
            "아니요. 지금은 운영자가 정한 알림 주소 한 곳으로 나갑니다. 개발자별 구독 코드는 찾지 못했습니다.",
            "No. Today it goes to the one notification address the operator configured. No per-developer subscription code was found.",
          ),
        },
        {
          question: t("서명은 어떻게 검증하나요?", "How is the signature verified?"),
          answer: t(
            "본문 원문으로 HMAC-SHA256 을 다시 계산해 헤더와 비교합니다. 타임스탬프와 배달 ID 도 서명에 들어 있어, 5분 밖 요청과 이미 받은 ID 를 거절하면 재전송을 막을 수 있습니다.",
            "Recompute HMAC-SHA256 over the raw body and compare it with the header. Because timestamp and delivery id are signed too, rejecting requests older than five minutes and ids already seen blocks replay.",
          ),
        },
      ],
      pitfall: t(
        "개발자 API 를 공개했다고 말하지 마세요. 공개된 것은 계약 선언이고 키·OAuth·스코프 강제·OpenAPI·개발자별 웹훅·버전 정책은 코드에 없습니다. 매니페스트의 timestampHeader(x-toonstudio-timestamp)는 실제 송신 헤더(X-ToonStudio-Delivery-Timestamp)와 다릅니다. 이 이유로 상태를 documented 로 표시했습니다.",
        "Do not say a developer API has been released. What is public is a contract declaration; keys, OAuth, scope enforcement, OpenAPI, per-developer webhooks and a versioning policy are not in code. The manifest's timestampHeader (x-toonstudio-timestamp) differs from the header actually sent (X-ToonStudio-Delivery-Timestamp). For these reasons the status is documented.",
      ),
    },
    technologies: ["HMAC-SHA256", "OAuth 2.0", "Webhook", "NestJS"],
    facts: [
      { value: "10 · 14 · 14", label: t("선언된 scopes · events · actions 수", "Declared scopes, events and actions"), source: "apps/api/src/modules/integration-platform/integration-platform.service.ts" },
      { value: "5분", label: t("매니페스트 공개 캐시 시간(max-age 300)", "Public cache time of the manifest (max-age 300)"), source: "apps/api/src/modules/integration-platform/integration-platform.controller.ts" },
      { value: "49", label: t("매니페스트가 알리는 연동 공급자 수", "Integration providers the manifest reports"), source: "apps/api/src/modules/integration-platform/integration-platform.catalog.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "ipfs-content-address-verification",
    category: "open-data",
    name: "CID verification",
    title: t("내려받은 바이트를 해시로 직접 대조하는 IPFS 가져오기", "IPFS fetch that checks the downloaded bytes against their hash"),
    status: "configured",
    tagline: t("multiformats 로 CID 를 만들고, 게이트웨이가 준 바이트의 SHA-256 을 직접 다시 계산해 맞춰 봅니다.", "multiformats builds the CID, and the SHA-256 of whatever a gateway returns is recomputed and compared."),
    background: [
      t(
        "인터넷 주소(URL)는 어디에 있는지는 알려 주지만 안의 내용이 바뀌었는지는 알려 주지 않습니다. IPFS 의 CID(콘텐츠 식별자)는 거꾸로 내용 자체를 주소로 삼습니다. 내용의 지문(해시)이 곧 주소라서 같은 바이트는 언제 어디서나 같은 CID 가 됩니다. 택배를 송장 번호 대신 내용물의 지문으로 찾는 셈입니다.",
        "A web address (URL) says where something is but not whether its content changed. An IPFS CID (content identifier) does the opposite: the content itself is the address. The fingerprint (hash) of the content is the address, so identical bytes always give the same CID. It is like finding a parcel by the fingerprint of its contents instead of a tracking number.",
      ),
      t(
        "ToonStudio 는 multiformats 라이브러리로 CID 를 만들고 검증합니다. 가져오기는 공개 게이트웨이 3곳(trustless-gateway.link, ipfs.io, dweb.link)을 차례로 시도해 바이트를 받고, 받은 바이트의 SHA-256 을 CID 안의 해시와 직접 대조합니다. 일치할 때만 응답을 돌려주고 불일치면 오류로 멈춥니다. 게이트웨이가 거짓 데이터를 주어도 걸러지는 구조입니다.",
        "ToonStudio builds and verifies CIDs with the multiformats library. A fetch tries three public gateways in order (trustless-gateway.link, ipfs.io, dweb.link) to get the bytes, then compares the SHA-256 of the received bytes directly with the hash inside the CID. Only a match returns the response; a mismatch stops with an error. Even a gateway that sends false data gets filtered out.",
      ),
      t(
        "@helia/verified-fetch(검증 가져오기 전용 라이브러리)는 전이 의존성 보안 권고가 해소되지 않아 도입하지 않았고, 이미 넣었던 것도 제거했습니다(커밋 844e7efe). 그래서 지금은 multiformats 와 평범한 fetch 에 해시 대조를 직접 구현한 형태입니다. 대신 범위가 좁습니다. raw 코덱과 sha2-256 CID 만 바이트로 판정하고, 큰 파일을 UnixFS 로 쪼갠 dag-pb CID 는 unsupported-codec 으로 구분해 거짓 성공을 만들지 않습니다.",
        "The @helia/verified-fetch library was not adopted because transitive-dependency security advisories were unresolved, and the copy that had been added was removed (commit 844e7efe). What exists now is multiformats plus a plain fetch with a hand-written hash comparison. The scope is narrow in return: only raw-codec sha2-256 CIDs are judged from bytes, and dag-pb CIDs for big UnixFS-chunked files are reported as unsupported-codec instead of faking a success.",
      ),
      t(
        "한계도 있습니다. 브라우저에서 콘텐츠를 네트워크에 제공(provide)하는 기능은 없고, 응답은 크기 상한 없이 arrayBuffer 로 읽습니다. 게이트웨이 3곳은 운영 CSP connect-src 목록에 없어 그 헤더가 적용되는 브라우저에서는 막힐 것으로 읽히지만, 실제 브라우저에서는 확인하지 못했습니다.",
        "There are limits too. The browser cannot provide content to the network, and replies are read with arrayBuffer without a size cap. The three gateways are missing from the production CSP connect-src list, so a browser applying that header should block them, but this was not confirmed in a real browser.",
      ),
    ],
    keyPoints: [
      t("내용의 지문이 곧 주소: 받은 바이트를 직접 해시해 대조", "The content fingerprint is the address: hash the received bytes"),
      t("Helia verified-fetch 는 제거됨: multiformats + fetch", "Helia verified-fetch was removed: multiformats plus fetch"),
      t("raw + sha2-256 CID 만 판정, 게이트웨이 CSP 는 미확인", "Only raw + sha2-256 is judged; gateway CSP is unconfirmed"),
    ],
    diagram: {
      id: "ipfs-content-address-verification-diagram",
      kind: "sequence",
      title: t("해시 대조 순서", "The hash comparison order"),
      caption: t("게이트웨이의 말을 믿지 않고, 받은 바이트를 브라우저가 직접 해시해 CID 와 맞춥니다.", "The browser does not trust the gateway: it hashes the received bytes itself and matches them to the CID."),
      alt: t(
        "화면이 CID 를 파싱한 뒤 공개 게이트웨이에 해당 CID 의 바이트를 요청합니다. 응답이 오면 multiformats 로 받은 바이트의 SHA-256 을 계산해 CID 안의 해시와 비교하고, 일치할 때만 응답을 돌려줍니다. 불일치면 오류로 멈추고 다른 게이트웨이로 넘어가지 않습니다.",
        "The screen parses the CID and asks a public gateway for its bytes. When bytes arrive, multiformats computes their SHA-256 and compares it with the hash inside the CID, and only a match returns the response. A mismatch stops with an error and does not move on to another gateway.",
      ),
      actors: [
        { id: "ui", label: t("화면", "Screen"), sub: t("IPFS 패널", "IPFS panel"), tone: "local" },
        { id: "lib", label: t("multiformats", "multiformats"), sub: t("CID·SHA-256", "CID, SHA-256"), tone: "local" },
        { id: "gw", label: t("공개 게이트웨이", "Public gateway"), sub: t("3곳을 차례로", "three, in order"), tone: "external" },
      ],
      messages: [
        { from: "ui", to: "lib", label: t("CID 파싱", "Parse the CID"), note: t("형식이 틀리면 invalid-cid", "a bad format gives invalid-cid") },
        { from: "ui", to: "gw", label: t("GET /ipfs/CID", "GET /ipfs/CID"), note: t("15초 제한, 실패하면 다음 게이트웨이", "15 s limit; on failure try the next one") },
        { from: "gw", to: "ui", label: t("바이트 응답", "Bytes reply"), style: "dashed", note: t("아직 믿지 않는다", "not trusted yet") },
        { from: "ui", to: "lib", label: t("받은 바이트의 SHA-256", "SHA-256 of the bytes"), note: t("브라우저에서 직접 계산", "computed in the browser") },
        { from: "lib", to: "lib", label: t("CID 안의 해시와 비교", "Compare with the CID's hash"), note: t("raw + sha2-256 만 판정", "only raw + sha2-256 is judged") },
        { from: "lib", to: "ui", label: t("match 또는 mismatch", "match or mismatch"), style: "dashed" },
        { from: "ui", to: "ui", label: t("일치할 때만 응답 반환", "Return only on a match"), note: t("불일치면 던지고 멈춘다", "a mismatch throws and stops") },
      ],
    },
    usage: [
      {
        feature: t("연동 센터 · IPFS 콘텐츠 주소", "Integration center · IPFS content address"),
        role: t("파일을 올리면 브라우저에서 SHA-256 으로 raw CID 를 만들고, CID 를 넣으면 게이트웨이에서 받아 해시를 직접 대조합니다.", "Uploading a file builds its raw CID from a SHA-256 in the browser; entering a CID fetches it from a gateway and compares the hash directly."),
        paths: ["apps/web/src/domains/integrations/ipfs-content-address.ts", "apps/web/src/domains/integrations/IpfsContentAddressPanel.tsx"],
        route: "/settings/integrations",
      },
      {
        feature: t("CID 시험", "CID tests"),
        role: t("빈 바이트의 알려진 CID, 같은 바이트는 같은 CID, 내용이 다르면 mismatch, dag-pb 구분을 시험합니다.", "Tests the known CID of empty bytes, same bytes giving the same CID, mismatch on different content and the dag-pb distinction."),
        paths: ["apps/web/src/domains/integrations/ipfs-content-address.test.ts"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("게이트웨이가 준 바이트를 해시로 직접 대조", "Check gateway bytes against the CID's own hash"),
        language: "ts",
        ...codePair(`
import { CID } from "multiformats/cid";
import * as raw from "multiformats/codecs/raw";
import { sha256 } from "multiformats/hashes/sha2";

//~ 게이트웨이를 믿지 않는다: 해시를 다시 계산해 CID 안의 해시와 비교한다. ## Trust nothing from the gateway: recompute the hash and compare it with the one in the CID.
export async function matchesCid(bytes: Uint8Array, cidText: string): Promise<boolean> {
  const cid = CID.parse(cidText);
  if (cid.code !== raw.code || cid.multihash.code !== sha256.code) return false; //~ raw + sha2-256 만 바이트로 판정 ## only raw + sha2-256 can be judged from bytes
  const actual = (await sha256.digest(bytes)).digest;
  return actual.length === cid.multihash.digest.length && actual.every((v, i) => v === cid.multihash.digest[i]);
}

//~ 게이트웨이를 차례로 시도하되, 내용이 틀리면 다음으로 넘어가지 않고 멈춘다. ## Try gateways in order, but stop at once if the content does not match.
export async function fetchChecked(cidText: string, gateways: readonly string[]): Promise<Uint8Array> {
  let last: unknown = new Error("no gateway");
  for (const gateway of gateways) {
    try {
      const res = await fetch(gateway + "/ipfs/" + cidText, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      if (await matchesCid(bytes, cidText)) return bytes;
      throw new Error("cid_mismatch");
    } catch (error) {
      if (error instanceof Error && error.message === "cid_mismatch") throw error;
      last = error;
    }
  }
  throw last;
}
`),
        explain: t(
          "ipfs-content-address.ts 의 verifyContentBytes 와 게이트웨이 순회를 줄인 것입니다. 실제 코드는 CID 형식·해시 종류별 결과(invalid-cid, unsupported-hash, unsupported-codec)를 구분해 돌려주며, 주입된 fetch 로 시험할 수 있습니다.",
          "A reduction of verifyContentBytes and the gateway loop in ipfs-content-address.ts. The real code returns separate results for a bad CID, an unsupported hash and an unsupported codec, and can be tested with an injected fetch.",
        ),
        source: "apps/web/src/domains/integrations/ipfs-content-address.ts",
        verify: "types",
      },
    ],
    links: [
      { title: "IPFS Docs · Content addressing and CIDs", url: "https://docs.ipfs.tech/concepts/content-addressing/", kind: "docs" },
      { title: "multiformats · js-multiformats", url: "https://github.com/multiformats/js-multiformats", kind: "repo", note: t("CID·멀티해시 라이브러리", "The CID and multihash library") },
      { title: "multiformats · CID specification", url: "https://github.com/multiformats/cid", kind: "spec" },
      { title: "IPFS Specs · Trustless Gateway", url: "https://specs.ipfs.tech/http-gateways/trustless-gateway/", kind: "spec", note: t("게이트웨이를 믿지 않고 검증하는 방식", "Verifying content without trusting the gateway") },
      { title: "MDN · SubtleCrypto.digest()", url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest", kind: "docs", note: t("브라우저의 SHA-256 계산", "SHA-256 in the browser") },
    ],
    chapterIds: ["content-addressing", "open-api-data"],
    talk: {
      pitch: t(
        "IPFS 주소(CID)는 파일의 지문 자체입니다. 게이트웨이에서 파일을 받으면 우리 브라우저가 SHA-256 을 직접 다시 계산해 주소 속 지문과 맞는지 확인하고, 맞을 때만 쓰며 틀리면 멈춥니다. 외부 라이브러리가 대신 믿어 주지 않습니다.",
        "An IPFS address (CID) is the fingerprint of the file itself. When a file comes from a gateway, our browser recomputes its SHA-256, checks it against the fingerprint in the address, uses it only on a match and stops otherwise. No outside library does the trusting for us.",
      ),
      analogy: t(
        "지문 대조입니다. 받은 상자의 내용물 지문을 직접 찍어 송장에 적힌 지문과 비교하고, 다르면 개봉하지 않습니다.",
        "It is fingerprint matching: take the fingerprint of what is in the box you received, compare it with the one on the label, and do not open the box if they differ.",
      ),
      questions: [
        {
          question: t("Helia 를 쓰나요?", "Do you use Helia?"),
          answer: t(
            "아니요. 전이 의존성 보안 권고가 해소되지 않아 도입하지 않았고, 넣었던 것도 제거했습니다(커밋 844e7efe). 지금은 multiformats 와 평범한 fetch 에 해시 대조를 직접 구현했습니다.",
            "No. It was not adopted because transitive-dependency advisories were unresolved, and the copy that had been added was removed (commit 844e7efe). Today it is multiformats plus a plain fetch with a hand-written hash comparison.",
          ),
        },
        {
          question: t("큰 파일도 검증되나요?", "Are large files verified too?"),
          answer: t(
            "raw 코덱 + sha2-256 CID 만 바이트로 판정합니다. 큰 파일을 UnixFS 로 쪼갠 dag-pb CID 는 unsupported-codec 으로 구분하고, 그 검증은 UnixFS 재조립이 필요해 아직 하지 않습니다.",
            "Only raw-codec sha2-256 CIDs are judged from bytes. A dag-pb CID for a big UnixFS-chunked file is reported as unsupported-codec, because verifying it needs UnixFS reassembly, which is not done yet.",
          ),
        },
        {
          question: t("게이트웨이가 거짓 데이터를 주면?", "What if a gateway returns false data?"),
          answer: t(
            "받은 바이트의 해시를 다시 계산해 CID 안의 해시와 비교하므로 불일치로 걸러지고 그 자리에서 오류로 멈춥니다. 다만 게이트웨이가 아예 응답하지 않는 경우까지 막지는 못해 다음 게이트웨이로 넘어갑니다.",
            "The hash of the received bytes is recomputed and compared with the one in the CID, so false data is rejected and the flow stops with an error. A gateway that simply fails to answer cannot be prevented, so the next gateway is tried.",
          ),
        },
      ],
      pitfall: t(
        "Helia 로 검증한다고 말하지 마세요. 구현은 multiformats + 게이트웨이 fetch + 해시 대조입니다(제품 화면 문구도 이 구현에 맞게 고쳤습니다). 게이트웨이 3곳은 운영 CSP connect-src 에 없어 막힐 가능성이 있지만 실제 브라우저 확인은 못 했습니다. 응답 크기 상한이 없다는 점도 한계입니다. 코드는 있으나 운영 CSP 설정이 남아 있어 상태를 configured 로 표시했습니다.",
        "Do not say verification is done with Helia. The implementation is multiformats plus gateway fetch plus a hash comparison (the product screen copy was corrected to match). The three gateways are missing from the production CSP connect-src, so they may be blocked, though no real browser was checked. The lack of a response size cap is also a limit. The code exists but the production CSP setting is outstanding, hence the configured status.",
      ),
    },
    technologies: ["multiformats", "IPFS CID", "IPFS", "SubtleCrypto"],
    facts: [
      { value: "3", label: t("차례로 시도하는 공개 게이트웨이 수", "Public gateways tried in order"), source: "apps/web/src/domains/integrations/ipfs-content-address.ts" },
      { value: "15s", label: t("게이트웨이당 가져오기 제한 시간", "Fetch timeout per gateway"), source: "apps/web/src/domains/integrations/ipfs-content-address.ts" },
      { value: "0x55 · 0x12", label: t("판정 가능한 코덱(raw)과 해시(sha2-256) 코드", "Judgeable codec (raw) and hash (sha2-256) codes"), source: "apps/web/src/domains/integrations/ipfs-content-address.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
];
