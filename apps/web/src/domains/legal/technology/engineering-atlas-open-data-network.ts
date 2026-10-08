import { codePair, t } from "./engineering-atlas-open-data-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * open-data 카드 2: SSRF 방어(허용 목록·DNS 핀닝) · 표지 이미지 프록시 · 서킷 브레이커와 쿨다운 · 브라우저 직접 호출과 CSP.
 * 사실 근거는 카드마다 usage.paths 와 facts.source 에 둔 파일이다(2026-10-07 코드와 대조).
 */
export const OPEN_DATA_NETWORK_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "ssrf-allowlist-dns-pinning",
    category: "open-data",
    name: "SSRF allowlist + DNS pinning",
    title: t("서버가 대신 열어 주는 주소를 공개 주소로만 제한한다", "Let the server open only public addresses on a user's behalf"),
    status: "live",
    tagline: t("사용자가 준 주소는 DNS 응답 전체를 검사하고, 검증한 바로 그 IP 로만 연결합니다.", "A user-supplied address gets its whole DNS answer checked, then only the verified IP is used."),
    background: [
      t(
        "사용자가 이미지 주소를 붙여 넣으면 우리 서버가 대신 그 주소를 열어 줍니다. 이때 누군가 서버 안쪽 관리 주소를 넣으면 서버가 자기 안쪽 문을 열어 보여 주는 사고가 납니다. 이것이 SSRF(서버 측 요청 위조)입니다. 경비가 손님이 적어 준 방 번호를 확인 없이 열어 주는 것과 같아서, 서버는 인터넷에 공개된 곳으로만 나가도록 제한해야 합니다.",
        "When a user pastes an image address, our server opens it on their behalf. If someone enters an internal admin address, the server can end up opening its own back doors. That is SSRF (server-side request forgery). It is like a guard opening any room number a visitor writes down, so the server must be limited to publicly reachable places.",
      ),
      t(
        "순서는 네 단계입니다. ① 주소 모양 검사(https, 표준 포트, 자격증명 없음, 내부 이름 거절) ② DNS 조회 결과 전체가 공개 주소인지 확인(사설·루프백·링크로컬 대역이 하나라도 있으면 전체 거절) ③ 검증한 바로 그 IP 로만 연결(lookup 함수를 고정하는 핀닝) ④ 리디렉션이 오면 처음부터 다시 검사(최대 3번). 핀닝은 검사할 때와 연결할 때 DNS 가 다른 답을 주는 DNS 리바인딩 수법을 막습니다.",
        "It runs in four steps: 1 check the address shape (https, standard port, no credentials, no internal names); 2 verify that the whole DNS answer is public, rejecting everything if one private, loopback or link-local address appears; 3 connect only to that verified IP by fixing the lookup function (pinning); 4 on a redirect, start over with the checks (at most three times). Pinning defeats DNS rebinding, where DNS answers differently at check time and connect time.",
      ),
      t(
        "대안은 허용 목록(allowlist)입니다. 아는 호스트만 열어 주면 가장 안전하지만, 사용자가 임의의 이미지 주소를 넣는 기능에는 쓸 수 없습니다. 그래서 두 방식을 나눠 씁니다. 표지 프록시와 공급자 호출은 고정 허용 목록을, 사용자 URL 과 운영자 웹훅은 공개 주소 검사와 핀닝을 씁니다. 허용 목록은 단순하고 강하지만 목록 관리가 필요하고, 공개 주소 검사는 유연하지만 차단 대역 목록을 직접 유지해야 합니다.",
        "The alternative is an allowlist. Opening only known hosts is safest but impossible for a feature where users enter arbitrary image addresses, so the two approaches split the work. The cover proxy and provider calls use a fixed allowlist; user URLs and operator webhooks use the public-address check plus pinning. An allowlist is simple and strong but needs upkeep; the public-address check is flexible but means maintaining the blocked ranges by hand.",
      ),
      t(
        "정직한 한계가 있습니다. 같은 방어가 세 곳(운영자 웹훅, 참조 이미지 가져오기, 운세 공급자)에 따로 구현돼 있고, 차단 대역 목록의 세부가 서로 다릅니다. 한 곳을 고쳐도 다른 곳이 따라오지 않으므로 하나의 공용 모듈로 합치는 것이 정리 과제입니다.",
        "There is an honest limit. The same defence is implemented separately in three places (operator webhook, reference-image import, fortune provider) and their blocked-range lists differ in detail. Fixing one does not fix the others, so merging them into one shared module remains a cleanup task.",
      ),
    ],
    keyPoints: [
      t("주소 검사 → DNS 응답 전체 검사 → 그 IP 로만 연결", "Check the address, check the whole DNS answer, use that IP only"),
      t("사설 주소가 하나라도 섞이면 응답 전체를 거절", "One private address rejects the entire DNS answer"),
      t("같은 방어가 세 곳에 중복 구현돼 있다", "The same defence is duplicated in three places"),
    ],
    diagram: {
      id: "ssrf-allowlist-dns-pinning-diagram",
      kind: "sequence",
      title: t("DNS 핀닝 순서", "The DNS pinning order"),
      caption: t("검사한 IP 와 연결하는 IP 가 같도록, 조회 결과를 연결 단계에 그대로 고정합니다.", "The verified IP is fixed into the connection so the IP checked and the IP used are the same."),
      alt: t(
        "브라우저가 이미지 주소를 보내면 서버가 주소 모양을 검사하고 DNS 에서 호스트의 모든 주소를 받습니다. 하나라도 사설 주소면 전체를 거절하고, 모두 공개 주소면 그 IP 로만 대상 서버에 연결합니다. 대상이 리디렉션을 보내면 주소 검사부터 다시 하고, 검사를 통과한 이미지만 브라우저에 돌려줍니다.",
        "The browser sends an image address; the server checks its shape and asks DNS for every address of the host. If any address is private the whole answer is rejected; if all are public the server connects to the target using only that IP. A redirect restarts the checks, and only a checked image goes back to the browser.",
      ),
      actors: [
        { id: "web", label: t("브라우저", "Browser"), tone: "local" },
        { id: "srv", label: t("ToonStudio 서버", "ToonStudio server"), tone: "server" },
        { id: "dns", label: t("DNS", "DNS"), tone: "external" },
        { id: "tgt", label: t("대상 서버", "Target server"), sub: t("이미지가 있는 곳", "where the image lives"), tone: "external" },
      ],
      messages: [
        { from: "web", to: "srv", label: t("이미지 주소 붙여넣기", "Paste an image address"), note: t("스튜디오 참고 이미지 가져오기", "studio reference-image import") },
        { from: "srv", to: "srv", label: t("주소 모양 검사", "Address shape check"), note: t("https·표준 포트·자격증명 없음", "https, standard port, no credentials") },
        { from: "srv", to: "dns", label: t("호스트 이름 조회(전체)", "Resolve the host (all)"), note: t("응답의 모든 주소를 받는다", "take every address in the answer") },
        { from: "dns", to: "srv", label: t("주소 목록", "Address list"), style: "dashed" },
        { from: "srv", to: "srv", label: t("전부 공개 주소인가?", "Are all of them public?"), note: t("사설이 하나라도 있으면 전체 거절", "one private address rejects all") },
        { from: "srv", to: "tgt", label: t("검증한 IP 로만 연결", "Connect to the verified IP only"), note: t("TLS 이름·Host 는 원래 도메인 유지", "TLS name and Host keep the domain") },
        { from: "tgt", to: "srv", label: t("이미지 응답", "Image reply"), style: "dashed", note: t("리디렉션이면 2번부터 다시(최대 3번)", "on a redirect, restart at step 2 (max 3)") },
        { from: "srv", to: "web", label: t("검사한 이미지만 전달", "Return only the checked image"), style: "dashed", note: t("3MB 상한·형식 확인", "3 MB cap, format check") },
      ],
    },
    usage: [
      {
        feature: t("스튜디오 · 참고 이미지 주소로 가져오기", "Studio · import a reference image by URL"),
        role: t("붙여 넣은 이미지 주소를 서버가 대신 받아 오되, 공개 주소만 허용하고 검증한 IP 로만 연결합니다. 리디렉션은 최대 3번이며 매번 다시 검사합니다.", "The server fetches the pasted image URL, allows public addresses only and connects to the verified IP. Redirects are limited to three and re-checked each time."),
        paths: ["apps/api/src/modules/creator/studio-remote-reference-image.network.ts", "apps/api/src/modules/creator/studio-remote-reference-image.service.ts"],
        route: "/studio",
      },
      {
        feature: t("운영 알림 웹훅", "Operator notification webhook"),
        role: t("운영자가 설정한 알림 주소 한 곳으로만 보내며, 공개 HTTPS 주소인지 확인하고 리디렉션은 막습니다.", "Sends only to the one destination the operator configured, requires a public HTTPS address and refuses redirects."),
        paths: ["apps/api/src/platform/adapters/network/public-endpoint.ts", "apps/api/src/modules/production-collaboration/production-webhook-network.ts"],
      },
      {
        feature: t("운세 공급자 호출", "Fortune provider calls"),
        role: t("고정 허용 목록의 HTTPS 오리진만 받고, DNS 로 확인한 주소에 핀닝해 응답 크기를 32KiB 로 제한합니다.", "Accepts only HTTPS origins on a fixed allowlist, pins to the DNS-verified address and caps the reply at 32 KiB."),
        paths: ["apps/api/src/modules/fortune/fortune-provider-network.ts"],
      },
      {
        feature: t("크리에이터 인텔리전스 · 메시 산출물", "Creator Intelligence · mesh artifacts"),
        role: t("외부 산출물 주소를 가져올 때 참조 이미지와 같은 네트워크 정책 함수를 재사용합니다.", "Reuses the reference-image network policy functions when fetching external artifact URLs."),
        paths: ["apps/api/src/modules/creator-intelligence/creator-intelligence-mesh-artifact.service.ts"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("공개 주소만 허용하고 검증한 IP 에 핀닝", "Allow public addresses only and pin to the verified IP"),
        language: "ts",
        ...codePair(`
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
const blocked = new BlockList();
for (const [net, bits] of [["10.0.0.0", 8], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16]] as const) blocked.addSubnet(net, bits, "ipv4"); //~ 사설·루프백·링크로컬(일부만) ## private, loopback, link-local (partial list)

//~ ① DNS 응답 전체가 공개 주소여야 한다. 하나라도 사설이면 전체를 거절한다. ## 1) The whole DNS answer must be public; one private address rejects it all.
async function resolvePublic(host: string) {
  const answers = await lookup(host, { all: true, family: 4 });
  const first = answers[0];
  if (!first || answers.some((a) => isIP(a.address) !== 4 || blocked.check(a.address, "ipv4"))) throw new Error("forbidden_address");
  return first.address;
}
//~ ② 검증한 그 주소로만 연결한다(핀닝). TLS 이름은 원래 도메인을 유지한다. ## 2) Connect only to the verified address (pinning); the TLS name keeps the domain.
export async function getPublic(raw: string): Promise<Buffer> {
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("invalid_url");
  const pin = await resolvePublic(url.hostname);
  return new Promise((resolve, reject) => {
    const req = request(url, { servername: url.hostname, signal: AbortSignal.timeout(10_000), lookup: (_h, _o, cb) => cb(null, pin, 4) }, (res) => {
      const chunks: Buffer[] = [];
      let size = 0;
      res.on("data", (c: Buffer) => { size += c.length; if (size > 3_000_000) res.destroy(new Error("too_large")); else chunks.push(c); }); //~ 크기 상한 ## size cap
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject); //~ https.request 는 리디렉션을 따라가지 않는다: 따라가려면 처음부터 다시 검사 ## https.request never follows redirects; following one means re-checking from the start
    });
    req.on("error", reject);
    req.end();
  });
}`),
        explain: t(
          "public-endpoint.ts 와 참조 이미지 가져오기 코드를 줄인 Node 전용 예제입니다(IPv6 대역 생략). 핵심은 두 가지입니다. DNS 응답을 전부 확인하고, 연결에는 확인한 주소를 lookup 으로 고정해 검사와 연결 사이의 틈을 없앱니다. Node 전용이라 구문만 검증합니다.",
          "A Node-only reduction of public-endpoint.ts and the reference-image fetcher (IPv6 ranges omitted). Two things matter: check every DNS answer, and fix the verified address through lookup so there is no gap between check and connect. Because it is Node-only, only the syntax is verified.",
        ),
        source: "apps/api/src/platform/adapters/network/public-endpoint.ts",
        verify: "syntax",
      },
    ],
    links: [
      { title: "OWASP · Server-Side Request Forgery Prevention Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html", kind: "guide", note: t("허용 목록과 공개 주소 검사 중 어느 쪽을 고를지", "When to choose an allowlist or a public-address check") },
      { title: "Node.js · net.BlockList", url: "https://nodejs.org/api/net.html#class-netblocklist", kind: "docs" },
      { title: "Node.js · dns.lookup()", url: "https://nodejs.org/api/dns.html", kind: "docs", note: t("all 옵션으로 모든 주소 받기", "Taking every address with the all option") },
      { title: "IANA · IPv4 Special-Purpose Address Registry", url: "https://www.iana.org/assignments/iana-ipv4-special-registry/iana-ipv4-special-registry.xhtml", kind: "spec", note: t("막아야 할 대역의 공식 목록", "The official list of ranges to block") },
      { title: "RFC 6890 · Special-Purpose IP Address Registries", url: "https://www.rfc-editor.org/rfc/rfc6890", kind: "spec" },
    ],
    chapterIds: ["open-api-data", "infrastructure"],
    talk: {
      pitch: t(
        "사용자가 이미지 주소를 붙여 넣으면 서버가 대신 받아 옵니다. 서버 안쪽 주소로 길을 돌리는 공격을 막으려고, 먼저 도메인이 가리키는 모든 IP 가 공개 주소인지 확인하고, 확인한 바로 그 IP 로만 연결합니다. 리디렉션이 오면 처음부터 다시 검사합니다.",
        "When a user pastes an image address, the server fetches it. To stop attacks that steer it toward internal addresses, it first checks that every IP behind the domain is public, then connects only to that verified IP. A redirect sends it back to the start of the checks.",
      ),
      analogy: t(
        "경비가 손님이 적어 준 방 번호를 그대로 열어 주지 않고, 먼저 확인한 뒤 그 방까지만 직접 안내하는 것과 같습니다.",
        "A guard does not unlock whatever room number a visitor writes down; the guard verifies first and then personally escorts the visitor to that room only.",
      ),
      questions: [
        {
          question: t("허용 목록만 쓰면 더 안전하지 않나요?", "Wouldn't an allowlist alone be safer?"),
          answer: t(
            "맞습니다. 그래서 표지 프록시와 공급자 호출은 허용 목록을 씁니다. 사용자가 임의의 이미지 주소를 넣는 기능은 목록을 만들 수 없어 공개 주소 검사와 핀닝을 씁니다.",
            "Yes, and that is why the cover proxy and provider calls use one. A feature where users enter arbitrary image URLs cannot have a list, so it uses the public-address check plus pinning.",
          ),
        },
        {
          question: t("DNS 핀닝이 왜 필요하죠?", "Why is DNS pinning needed?"),
          answer: t(
            "검사할 때와 연결할 때 DNS 가 다른 답을 주는 DNS 리바인딩을 막기 위해서입니다. 검사한 IP 를 연결에도 그대로 쓰면 그 틈이 사라집니다.",
            "It defeats DNS rebinding, where DNS answers differently at check time and connect time. Using the very IP that was checked removes that gap.",
          ),
        },
        {
          question: t("그러면 완전히 안전한가요?", "So is it completely safe?"),
          answer: t(
            "목록 기반 방어라 새 대역이 생기면 직접 추가해야 하고, 세 곳에 복사돼 있어 한 곳만 고치면 어긋납니다. 안전하다고 단정하지 않고 구조를 설명합니다.",
            "It is a list-based defence, so new ranges must be added by hand, and with three copies a fix in one place can drift from the others. We explain the structure instead of declaring it safe.",
          ),
        },
      ],
      pitfall: t(
        "SSRF 를 완전히 막는다고 말하지 마세요. 이 카드는 코드에 있는 방어의 구조를 설명합니다. 세 구현은 차단 대역 목록의 세부(예: IPv6)가 서로 다르고, 운영에서 실제 공격 시험을 한 기록은 확인하지 못했습니다.",
        "Do not say SSRF is fully prevented. This card explains the structure of the defence in code. The three implementations differ in the details of their blocked ranges (IPv6, for example), and no record of a real attack test in production was found.",
      ),
    },
    technologies: ["SSRF", "DNS pinning", "BlockList", "Node.js"],
    facts: [
      { value: "3", label: t("같은 방어를 따로 구현한 곳", "Separate implementations of the same defence"), source: "apps/api/src/platform/adapters/network/public-endpoint.ts" },
      { value: "3", label: t("참조 이미지 리디렉션 허용 횟수", "Redirects allowed for a reference image"), source: "packages/contracts/src/studio-remote-reference-image-contract.ts" },
      { value: "3 MB", label: t("참조 이미지 크기 상한", "Reference-image size cap"), source: "packages/contracts/src/studio-remote-reference-image-contract.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "cover-image-proxy-killswitch",
    category: "open-data",
    name: "Cover image proxy",
    title: t("허용한 오리진만 중계하고 한 번에 끌 수 있는 표지 프록시", "A cover proxy for allowed origins only, with a single off switch"),
    status: "live",
    tagline: t("방문자 IP 가 외부에 새지 않게 표지를 서버가 받아 오되, 허용 호스트만 중계합니다.", "Covers are fetched by our server so visitor IPs do not leak, but only allowed hosts are relayed."),
    background: [
      t(
        "웹툰 표지 이미지는 네이버·카카오 같은 외부 서버에 있습니다. 방문자 브라우저가 그 주소를 직접 열면 방문자의 IP 와 보던 페이지(리퍼러, 어느 페이지에서 왔는지 알리는 정보)가 외부 플랫폼에 그대로 알려집니다. 그래서 표지는 우리 서버(/api/cover)가 대신 받아 전달합니다. 우편물을 대리 수령해 전해 주듯, 외부에는 우리 서버만 보이게 합니다.",
        "Webtoon cover images live on external servers such as Naver and Kakao. If a visitor's browser opens those addresses directly, the visitor's IP and the page they were viewing (the referrer, which tells where a request came from) become visible to the platform. So our server (/api/cover) fetches the cover and passes it on, like receiving mail on someone's behalf so that outsiders only see us.",
      ),
      t(
        "프록시가 열린 문이 되면 안 되므로 네 겹으로 닫습니다. ① 킬스위치: 환경변수 COVER_IMAGE_POLICY=off 면 404 로 즉시 중계를 멈춥니다. ② 호스트는 사용자 입력이 아니라 서버 상수 33곳에서 새로 만들고, 사용자 입력에서는 경로와 쿼리만 가져옵니다. ③ 리디렉션은 따라가지 않고(manual) 매번 같은 목록으로 다시 검사하며 최대 4번 요청합니다. ④ 응답은 10MiB 상한과 이미지 매직바이트(파일 맨 앞 몇 바이트의 서명)로 확인한 뒤 전달합니다.",
        "Because a proxy must not become an open door, four layers close it. 1 Kill switch: COVER_IMAGE_POLICY=off stops relaying at once with a 404. 2 The host is rebuilt from 33 server constants, never taken from user input, which supplies only path and query. 3 Redirects are not followed automatically (manual), are re-checked against the same list every time, and at most four requests are made. 4 The reply is checked against a 10 MiB cap and image magic bytes (the signature in the first bytes of a file) before it is passed on.",
      ),
      t(
        "대안은 두 가지입니다. 브라우저가 직접 열게 두면 프라이버시가 샙니다. 이미지를 우리 저장소에 복사해 두면 저장 비용과 권리 관리 부담이 커집니다. 프록시는 복사하지 않고 지나가게만 하고, 캐시도 브라우저 1시간·엣지 1일로 짧게 두며 immutable 은 쓰지 않아, 정책이 바뀌면 빨리 빠지게 합니다. 허용 호스트인데 프록시가 실패하면 직접 연결로 되돌리지 않고 대체 표지로 갑니다.",
        "There are two alternatives. Letting browsers open covers directly leaks privacy; copying images into our own storage adds storage cost and rights-management burden. The proxy copies nothing and only passes bytes through, with short caching (1 hour in the browser, 1 day at the edge) and no immutable flag so content disappears quickly when policy changes. If an allowed host fails through the proxy, the page shows a fallback cover instead of connecting directly.",
      ),
      t(
        "한계도 있습니다. 허용 목록이 API(catalog-url-policy.ts)와 웹(cover-proxy.ts)에 두 벌이고, 둘이 같은지 비교하는 자동 시험은 찾지 못해 사람이 맞춥니다. 이 카드는 코드 사실만 다루며 표지 이용의 정책·약관 판단은 다루지 않습니다.",
        "There are limits too. The allowlist exists twice, in the API (catalog-url-policy.ts) and in the web app (cover-proxy.ts), and no automated test comparing the two was found, so people keep them in sync. This card covers code facts only, not policy or terms judgments about using covers.",
      ),
    ],
    keyPoints: [
      t("킬스위치: COVER_IMAGE_POLICY=off 면 즉시 404", "Kill switch: COVER_IMAGE_POLICY=off returns 404 at once"),
      t("호스트는 서버 상수 33곳에서 새로 만든다", "The host is rebuilt from 33 server constants"),
      t("10MiB 상한, 헤더가 아닌 매직바이트로 이미지 판별", "10 MiB cap; images are identified by magic bytes, not headers"),
    ],
    diagram: {
      id: "cover-image-proxy-killswitch-diagram",
      kind: "graph",
      title: t("표지 한 장이 지나는 길", "The path of one cover image"),
      caption: t("꺼짐 → 허용 오리진 → 서버가 받기 → 크기·형식 검사의 순서로 통과한 이미지만 나갑니다.", "Only an image that passes off-switch, allowed origin, server fetch and size-and-format checks goes out."),
      alt: t(
        "표지 요청은 먼저 킬스위치를 확인하고, 주소가 서버 상수 허용 오리진에 있는지 봅니다. 통과하면 서버가 플랫폼 CDN 에서 직접 받아 크기와 형식을 검사한 뒤 브라우저로 전달합니다. 킬스위치가 켜졌거나 허용되지 않았거나 검사에 실패하면 거절 응답이 됩니다.",
        "A cover request first meets the kill switch, then a check that the address belongs to an allowed origin held in server constants. If it passes, the server fetches from the platform CDN itself, checks size and format and passes the image to the browser. A kill switch, a disallowed origin or a failed check ends in a refusal.",
      ),
      nodes: [
        { id: "req", label: t("표지 요청", "Cover request"), sub: t("/api/cover?u=원본주소", "/api/cover?u=source"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "kill", label: t("킬스위치", "Kill switch"), sub: t("off 이면 404", "off means 404"), tone: "warn", shape: "diamond", at: [1, 0] },
        { id: "allow", label: t("허용 오리진?", "Allowed origin?"), sub: t("서버 상수 33곳", "33 constants"), tone: "warn", shape: "diamond", at: [2, 0] },
        { id: "fetch", label: t("서버가 받기", "Server fetch"), sub: t("수동 리디렉션·최대 4회", "manual redirects, max 4"), tone: "server", at: [3, 0] },
        { id: "cdn", label: t("플랫폼 CDN", "Platform CDN"), sub: t("네이버·카카오 등", "Naver, Kakao and others"), tone: "external", shape: "cloud", at: [4, 0] },
        { id: "check", label: t("크기·형식 검사", "Size and format"), sub: t("10MiB·매직바이트", "10 MiB, magic bytes"), tone: "server", at: [4, 1] },
        { id: "out", label: t("브라우저로 전달", "To the browser"), sub: t("캐시 1시간·엣지 1일", "cache 1 h, edge 1 day"), tone: "local", shape: "pill", at: [5, 1] },
        { id: "deny", label: t("거절", "Refuse"), sub: t("404·403·415·502", "404, 403, 415, 502"), tone: "warn", at: [2, 1] },
      ],
      edges: [
        { from: "req", to: "kill", label: t("원본 주소", "source URL") },
        { from: "kill", to: "allow", label: t("꺼짐 아님", "not off") },
        { from: "allow", to: "fetch", label: t("목록에 있음", "listed") },
        { from: "fetch", to: "cdn", label: t("GET", "GET") },
        { from: "cdn", to: "check", label: t("응답", "reply") },
        { from: "check", to: "out", label: t("통과", "pass") },
        { from: "kill", to: "deny", label: t("켜짐", "on"), style: "dashed" },
        { from: "allow", to: "deny", label: t("목록에 없음", "not listed"), style: "dashed" },
        { from: "check", to: "deny", label: t("실패", "fail"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("카탈로그 · 작품 표지", "Catalog · title covers"),
        role: t("외부 플랫폼 표지를 /api/cover 로 받아 방문자 IP·리퍼러가 외부에 알려지지 않게 합니다. 허용 호스트인데 실패하면 직접 연결로 되돌리지 않고 대체 표지를 보여 줍니다.", "Fetches platform covers through /api/cover so visitor IPs and referrers stay private. If an allowed host fails, a fallback cover shows instead of a direct connection."),
        paths: ["apps/api/src/modules/catalog/catalog.controller.ts#proxyCover", "apps/api/src/modules/catalog/catalog-url-policy.ts#resolveCoverFetchUrl", "apps/web/src/shared/lib/cover-proxy.ts#proxiedCoverSrc"],
        route: "/explore",
      },
      {
        feature: t("표지 노출 킬스위치", "Cover display kill switch"),
        role: t("COVER_IMAGE_POLICY=off 면 카탈로그 적재 단계에서 표지를 제거하고, 프록시도 한 번 더 404 로 막아 이미 배포된 목록의 표지 주소까지 무력화합니다.", "With COVER_IMAGE_POLICY=off, covers are stripped at catalog load time and the proxy returns 404 again, disarming cover URLs already present in published data."),
        paths: ["packages/core/src/catalog/cover-policy.ts#coverImagePolicy", "apps/api/src/config/env.ts"],
      },
      {
        feature: t("허용 오리진 시험", "Allowed-origin tests"),
        role: t("권한(호스트)은 허용 목록에서 만들고 경로·쿼리만 사용자 입력에서 가져오는지 시험합니다.", "Tests that the authority comes from the allowlist while only path and query come from user input."),
        paths: ["apps/api/src/modules/catalog/catalog-url-policy.test.ts"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("허용 목록으로 호스트를 새로 만들고 매직바이트로 판별", "Rebuild the host from an allowlist and sniff magic bytes"),
        language: "ts",
        ...codePair(`
const ALLOWED = ["https://img.cdn-a.test", "https://cover.cdn-b.test"]; //~ 서버 상수: 사용자 입력이 아니다 ## server constants, not user input
declare function readCapped(res: Response, max: number): Promise<Uint8Array<ArrayBuffer> | null>; //~ 상한까지만 읽는 함수(카드 1) ## reads up to a cap (card 1)

//~ 사용자 입력에서는 경로·쿼리만 가져오고, 호스트는 허용 목록에서 새로 만든다. ## Take only path and query from user input; rebuild the host from the allowlist.
function allowedUrl(raw: string): URL | null {
  const url = URL.canParse(raw) ? new URL(raw) : null;
  const origin = url && ALLOWED.find((o) => o === url.origin);
  if (!url || !origin || url.protocol !== "https:" || url.username || url.password || url.port) return null;
  return Object.assign(new URL(origin), { pathname: url.pathname, search: url.search });
}

//~ 헤더가 아니라 파일 맨 앞 몇 바이트(매직바이트)로 이미지를 판별한다. ## Identify images by the first bytes (magic bytes), not by the header.
const SIGNATURES: [string, number[]][] = [["image/jpeg", [0xff, 0xd8, 0xff]], ["image/png", [0x89, 0x50, 0x4e, 0x47]]];
const sniff = (b: Uint8Array) => SIGNATURES.find(([, sig]) => sig.every((v, i) => b[i] === v))?.[0] ?? null;

async function relay(raw: string): Promise<Response> {
  let url = allowedUrl(raw);
  for (let hop = 0; url && hop < 4; hop += 1) {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    if (res.status >= 300 && res.status < 400) { //~ 리디렉션 대상도 매번 허용 목록으로 다시 검사 ## re-check every redirect target against the allowlist
      url = allowedUrl(new URL(res.headers.get("location") ?? "", url).href);
      continue;
    }
    const body = res.ok ? await readCapped(res, 10 * 1024 * 1024) : null;
    const type = body ? sniff(body) : null;
    return type ? new Response(body, { headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600" } }) : new Response(null, { status: 502 });
  }
  return new Response(null, { status: 403 });
}
`),
        explain: t(
          "catalog-url-policy.ts 의 resolveCoverFetchUrl 과 catalog.controller.ts 의 proxyCover 를 줄인 것입니다. 호스트(네트워크 권한)는 서버 상수에서만 만들고, 응답이 이미지인지는 Content-Type 이 아니라 첫 바이트로 판단합니다. 실제 코드는 JPEG·PNG 외에 GIF·WebP·AVIF 도 판별하고 상한을 넘으면 읽기를 중단합니다.",
          "A reduction of resolveCoverFetchUrl in catalog-url-policy.ts and proxyCover in catalog.controller.ts. The host (network authority) is built only from server constants, and whether a reply is an image is judged from its first bytes rather than Content-Type. The real code also recognizes GIF, WebP and AVIF and stops reading when the cap is exceeded.",
        ),
        source: "apps/api/src/modules/catalog/catalog.controller.ts",
        verify: "types",
      },
    ],
    links: [
      { title: "OWASP · Server-Side Request Forgery Prevention Cheat Sheet", url: "https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html", kind: "guide" },
      { title: "WHATWG · MIME Sniffing Standard", url: "https://mimesniff.spec.whatwg.org/", kind: "spec", note: t("이미지 매직바이트 서명 표", "The image signature tables") },
      { title: "MDN · Cache-Control", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control", kind: "docs", note: t("max-age·s-maxage·immutable 의 뜻", "What max-age, s-maxage and immutable mean") },
      { title: "RFC 5861 · stale-while-revalidate", url: "https://www.rfc-editor.org/rfc/rfc5861", kind: "spec" },
    ],
    chapterIds: ["open-api-data", "infrastructure"],
    talk: {
      pitch: t(
        "작품 표지는 외부 플랫폼에 있어서, 브라우저가 직접 열면 방문자 IP 가 그쪽에 알려집니다. 그래서 우리 서버가 대신 받아 전달합니다. 서버는 허용 목록에 있는 33곳만, 10MiB 이하의 진짜 이미지만 전달하고, 환경변수 하나로 중계 전체를 즉시 멈출 수 있습니다.",
        "Covers live on external platforms, so a browser opening them directly would reveal the visitor's IP. Our server fetches them instead. It relays only the 33 allowlisted origins and only real images under 10 MiB, and one environment variable can stop the whole relay immediately.",
      ),
      analogy: t(
        "우편물 대리 수령입니다. 집 주소(방문자 IP)를 발송인에게 알리지 않고, 대리인(우리 서버)이 받아 내용물이 우편물이 맞는지 확인한 뒤 전해 줍니다.",
        "It is like having mail received by an agent. The sender never learns your home address (the visitor's IP); the agent receives the parcel, checks that it really is mail and then hands it over.",
      ),
      questions: [
        {
          question: t("프록시가 아무 주소나 열어 주지는 않나요?", "Could the proxy be made to open any address?"),
          answer: t(
            "호스트는 사용자 입력이 아니라 서버 상수 33곳에서 새로 만들고, 리디렉션도 매번 같은 목록으로 다시 검사합니다. 목록 밖이면 403 입니다.",
            "The host is rebuilt from 33 server constants rather than taken from the request, and every redirect is re-checked against the same list. Anything outside it gets a 403.",
          ),
        },
        {
          question: t("킬스위치는 어떻게 쓰나요?", "How is the kill switch used?"),
          answer: t(
            "환경변수 COVER_IMAGE_POLICY 를 off 로 두면 프록시가 404 를 돌려주고 화면은 글자만 있는 대체 표지로 갑니다. 이미 배포된 정적 목록의 표지 주소도 같이 무력화됩니다.",
            "Setting the COVER_IMAGE_POLICY environment variable to off makes the proxy return 404 and pages switch to a text-only fallback cover. Cover URLs already in published static data are disarmed too.",
          ),
        },
        {
          question: t("이미지 형식은 왜 헤더가 아니라 바이트로 보나요?", "Why judge the format from bytes, not headers?"),
          answer: t(
            "일부 CDN 은 실제 이미지를 application/octet-stream 으로 응답합니다. 헤더만 믿으면 정상 이미지를 막고, 헤더를 거짓으로 쓰는 응답도 못 거릅니다. 바이트가 이미지가 아니면 415 로 거절합니다.",
            "Some CDNs answer real images as application/octet-stream. Trusting headers alone would block good images and let mislabeled replies through. If the bytes are not an image the response is rejected with 415.",
          ),
        },
      ],
      pitfall: t(
        "표지 이용의 정책·약관 판단은 이 카드의 범위가 아닙니다. 외부 요청 헤더와 약관에 관한 서술은 문서마다 달라 이 카드에서는 단정하지 않습니다. 허용 목록이 API 와 웹에 두 벌이고 자동 비교 시험이 없다는 점, 운영 실호출 성공은 확인하지 못했다는 점도 함께 말합니다.",
        "Policy or terms judgments about using covers are outside this card. Statements about outgoing request headers and platform terms differ between documents, so this card does not assert them. Also mention that the allowlist exists twice with no automated comparison, and that live production success was not verified.",
      ),
    },
    technologies: ["Cover proxy", "Cache-Control", "MIME sniffing", "SSRF"],
    facts: [
      { value: "33", label: t("프록시 허용 오리진 수", "Allowed proxy origins"), source: "apps/api/src/modules/catalog/catalog-url-policy.ts" },
      { value: "10 MiB", label: t("표지 한 장 중계 상한", "Relay cap per cover"), source: "apps/api/src/modules/catalog/catalog.controller.ts" },
      { value: "1h / 1d", label: t("Cache-Control 브라우저 / 엣지", "Cache-Control browser / edge"), source: "apps/api/src/modules/catalog/catalog.controller.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "circuit-breaker-and-cooldown",
    category: "open-data",
    name: "Circuit breaker",
    title: t("분산 서킷과 프로세스 쿨다운, 두 종류의 차단기", "Two kinds of breakers: a distributed circuit and a process cooldown"),
    status: "configured",
    tagline: t("실패가 쌓이면 끊고 예산은 호출 전에 차감하며, 두 차단기는 상태가 사는 곳이 다릅니다.", "Piled-up failures are cut off and budget is spent before a call; the two breakers keep state in different places."),
    background: [
      t(
        "외부 서비스가 아플 때 계속 두드리면 우리도 느려지고 상대는 더 힘들어집니다. 전기 차단기가 과전류에서 집을 지키듯, 실패가 쌓이면 일정 시간 호출 자체를 끊는 장치가 서킷 브레이커입니다. ToonStudio 에는 성격이 다른 차단기가 두 종류 있습니다.",
        "Hammering a sick service makes us slow and hurts it more. A circuit breaker is like an electrical breaker protecting a house from overcurrent: once failures pile up, it cuts off calls for a while. ToonStudio has two breakers of different kinds.",
      ),
      t(
        "① 프로세스 쿨다운(ResourceEngine): 공급자가 429나 503을 보내면 Retry-After 만큼(1~120초, 없으면 30초) 그 호스트 호출을 멈춥니다. 서버 프로세스 메모리에 있어 서버 한 대 안에서만 유효합니다. ② 분산 서킷(Upstash): 운세 공급자(KASI·Free Horoscope)는 호출 전에 서킷 상태를 읽고, 일일 예산을 먼저 차감하며, 실패가 3번 쌓이면 60초 동안 서킷을 엽니다(실패 기록은 5분 뒤 사라짐). 서버가 여러 대여도 상태를 공유합니다.",
        "1 Process cooldown (ResourceEngine): when a provider answers 429 or 503, calls to that host pause for Retry-After (1-120 s, 30 s when absent). It lives in server process memory and only holds on one server. 2 Distributed circuit (Upstash): the fortune providers (KASI, Free Horoscope) read the circuit state before calling, spend the daily budget first, and open the circuit for 60 seconds once three failures have piled up (the failure record disappears after five minutes). The state is shared across servers.",
      ),
      t(
        "분산 방식은 외부 저장소(Upstash Redis)가 필요하고 호출마다 왕복이 늘며, 저장소가 없으면 메모리로 대신하지 않고 안전하게 로컬 결과로 내려갑니다. 프로세스 쿨다운은 가볍고 의존성이 없지만 서버 수만큼 한도가 늘어납니다. 분산 서킷·예산은 현재 운세 공급자, Creator Intelligence 유료 승인, 백엔드 capability 게이트에만 연결돼 있고 ResourceEngine·KMAS 에는 없습니다.",
        "The distributed way needs an external store (Upstash Redis) and adds a round trip per call; without the store it falls back safely to local results instead of using memory. The process cooldown is light and dependency-free, but ceilings multiply with the number of servers. Today the distributed circuit and budget are wired only into the fortune providers, Creator Intelligence paid approval and the backend capability gate, not into ResourceEngine or KMAS.",
      ),
      t(
        "정직한 한계가 있습니다. 분산 예산의 하루는 UTC 기준(한국 시간 오전 9시 갱신)입니다. 운세 경로는 성공해도 실패 카운터를 지우지 않고 5분 뒤에야 사라지므로, 실패가 5분 이내 간격으로 3번 쌓이면 서킷이 열립니다. 분산 장치는 UPSTASH_COORDINATION_ENABLED 설정이 있어야 켜지며, 운영에서 켜져 있는지는 코드로 확인하지 못했습니다.",
        "There are honest limits. The distributed budget's day is UTC (it resets at 09:00 Korea time). The fortune path does not clear its failure counter on success and the record only expires after five minutes, so the circuit opens when three failures pile up at intervals under five minutes. The distributed pieces turn on only with the UPSTASH_COORDINATION_ENABLED setting, and whether it is on in production could not be confirmed from code.",
      ),
    ],
    keyPoints: [
      t("프로세스 쿨다운은 서버 메모리, 분산 서킷은 Upstash", "Process cooldown lives in memory; the distributed circuit in Upstash"),
      t("실패 3회 누적 → 60초 차단, 예산은 호출 전에 차감", "Three piled-up failures open it for 60 s; budget is spent first"),
      t("분산 서킷·예산은 운세·유료 승인·capability 게이트에만 연결", "The distributed circuit serves only fortune, paid approval and the capability gate"),
    ],
    diagram: {
      id: "circuit-breaker-and-cooldown-diagram",
      kind: "layers",
      title: t("차단기의 상태는 어디에 사는가", "Where each breaker keeps its state"),
      caption: t("같은 차단기라도 서버 메모리에 사는 것과 여러 서버가 함께 보는 것은 보장 범위가 다릅니다.", "A breaker held in server memory and one shared by many servers give different guarantees."),
      alt: t(
        "맨 위 화면은 상태 없이 실패 이유만 보여 줍니다. 그 아래 프로세스 쿨다운은 서버 한 대의 메모리에서 429·503 응답 뒤 호스트를 잠시 막습니다. 분산 서킷과 일일 예산은 Upstash 에 있어 서버 여러 대가 공유합니다. 막히면 로컬 결과로 내려가고, 맨 아래가 공급자 API 입니다.",
        "At the top the screen is stateless and only shows the failure reason. The process cooldown below it pauses a host for a while after a 429 or 503, in one server's memory. The distributed circuit and daily budget live in Upstash and are shared by many servers. When blocked, the flow falls back to local results, and the provider API sits at the bottom.",
      ),
      layers: [
        { id: "screen", label: t("화면", "Screen"), sub: t("상태 없음: 실패 이유를 그대로 보여 준다", "Stateless: shows the failure reason as is"), tone: "local" },
        { id: "process", label: t("프로세스 쿨다운", "Process cooldown"), sub: t("429·503 → Retry-After 동안 호스트 차단 · 서버 1대 범위", "429/503 pauses the host for Retry-After; one server only"), tone: "server", chips: ["ResourceEngine"] },
        { id: "dist", label: t("분산 서킷 + 일일 예산", "Distributed circuit + daily budget"), sub: t("실패 3회 누적 → 60초 차단 · 서버 여러 대가 공유", "3 failures open it for 60 s; shared by all servers"), tone: "edge", chips: ["Upstash", "Redis"] },
        { id: "fallback", label: t("대체 경로", "Fallback"), sub: t("로컬 결과와 이유 표시 · 자동 유료 전환 없음", "Local result plus the reason; no automatic paid switch"), tone: "good" },
        { id: "provider", label: t("공급자 API", "Provider API"), sub: t("KASI·Free Horoscope·원격 유료 공급자", "KASI, Free Horoscope, remote paid providers"), tone: "external" },
      ],
      brackets: [{ label: t("차단기는 두 종류, 사는 곳이 다르다", "Two breakers, two homes"), layerIds: ["process", "dist"] }],
    },
    usage: [
      {
        feature: t("운세 · 달력·특일·별자리 보강", "Fortune · calendar, special-day and horoscope enrichment"),
        role: t("공급자를 부르기 전에 서킷 상태와 일일 예산을 분산 저장소에서 확인하고, 막히면 로컬 계산 결과를 이유와 함께 보여 줍니다.", "Before calling a provider it reads the circuit and daily budget from the shared store, and when blocked it shows the locally computed result with the reason."),
        paths: ["apps/api/src/modules/fortune/fortune-enrichment.service.ts", "apps/api/src/platform/adapters/upstash-coordination/upstash-coordination.port.ts"],
        route: "/fortune",
      },
      {
        feature: t("원격 공급자 승인 게이트", "Remote provider admission gate"),
        role: t("capability 게이트는 서킷·동시 실행 자리·일일 예산을, 유료 승인은 일일 예산을 분산 저장소에서 확인합니다.", "The capability gate checks circuit, concurrency slots and daily budget; paid approval checks the daily budget, both in the shared store."),
        paths: ["apps/api/src/platform/adapters/backend-capabilities/backend-capability-coordination-gate.ts", "apps/api/src/modules/creator-intelligence/creator-intelligence-paid-admission.ts"],
      },
      {
        feature: t("자료 엔진 호스트 쿨다운", "Resource engine host cooldown"),
        role: t("공급자가 429·503 을 보내면 Retry-After 만큼 그 호스트만 멈추고 다른 공급자는 계속 부릅니다.", "When a provider sends 429 or 503, only that host pauses for Retry-After while other providers keep working."),
        paths: ["apps/api/src/modules/creator-resources/resource-engine.ts", "packages/contracts/src/creator-resource-workflow.ts#upstreamRetrySeconds"],
        route: "/research/assets",
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("예산 선차감 + 서킷 + 이유 있는 폴백", "Spend budget first, break the circuit, fall back with a reason"),
        language: "ts",
        ...codePair(`
type Reason = "budget-exhausted" | "provider-unavailable";
interface Outcome<T> { status: "external" | "local-fallback"; reason?: Reason; data: T }
let failures = 0;
let openUntil = 0;
let used = 0;
let day = "";

//~ 무료 쿼터는 안전장치가 아니다. 호출 전에 예산을 차감하고, 연속 실패는 서킷으로 막고, 실패하면 이유와 함께 로컬 결과로 내려간다. ## A free quota is no safeguard: spend budget before the call, break on repeated failure, fall back with a reason.
async function withFallback<T>(call: () => Promise<T>, local: T, dailyLimit = 100, now = Date.now()): Promise<Outcome<T>> {
  const today = new Date(now).toISOString().slice(0, 10); //~ UTC 기준 하루(분산 예산도 UTC 일 단위) ## UTC day (the distributed budget also resets per UTC day)
  if (day !== today) { day = today; used = 0; }
  const fallback = (reason: Reason): Outcome<T> => ({ status: "local-fallback", reason, data: local });
  if (now < openUntil) return fallback("provider-unavailable"); //~ 서킷이 열림: 호출하지 않는다 ## circuit open: make no call
  if (used >= dailyLimit) return fallback("budget-exhausted"); //~ 예산 소진: 유료로 넘어가지 않는다 ## budget spent: never roll over to a paid path
  used += 1;
  try {
    const data = await call();
    failures = 0;
    return { status: "external", data };
  } catch {
    if (++failures >= 3) openUntil = now + 60_000; //~ 연속 3회 실패 → 60초 차단 ## three failures in a row, block for 60 s
    return fallback("provider-unavailable"); //~ 가짜 값을 만들지 않고 로컬 결과와 이유를 돌려준다 ## no fake values: return the local result and why
  }
}
`),
        explain: t(
          "fortune-enrichment.service.ts 의 흐름을 아이디어만 남긴 예제입니다. 실제 코드는 상태(서킷·예산)를 변수가 아니라 Upstash 에 두어 서버 여러 대가 공유하고, 호출 제한 시간은 2.5초입니다. 예제는 성공하면 카운터를 0으로 되돌리지만 운세 경로의 실제 코드는 지우지 않고 5분 TTL 로 만료시키며(원격 공급자 게이트는 성공 시 서킷을 닫습니다), 분산 저장소가 없으면 호출 자체를 하지 않고 로컬 결과로 내려갑니다.",
          "This keeps only the idea of the flow in fortune-enrichment.service.ts. The real code keeps circuit and budget in Upstash rather than in variables so many servers share them, and calls have a 2.5-second limit. The sample resets its counter on success, whereas the real fortune path does not clear it and lets it expire after a 5-minute TTL (the remote-provider gate closes the circuit on success); without the shared store the real code makes no call and falls back to the local result.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Martin Fowler · Circuit Breaker", url: "https://martinfowler.com/bliki/CircuitBreaker.html", kind: "article", note: t("개념의 출발점", "The concept's starting point") },
      { title: "Microsoft Azure Architecture · Circuit Breaker pattern", url: "https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker", kind: "guide" },
      { title: "MDN · Retry-After", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After", kind: "docs" },
      { title: "Upstash · Redis documentation", url: "https://upstash.com/docs/redis/overall/getstarted", kind: "docs" },
      { title: "Redis · Scripting with Lua (EVAL)", url: "https://redis.io/docs/latest/develop/interact/programmability/eval-intro/", kind: "docs", note: t("원자적 카운터를 만드는 방법", "How atomic counters are built") },
    ],
    chapterIds: ["open-api-data", "cost-engineering"],
    talk: {
      pitch: t(
        "외부 서비스가 아플 때 계속 두드리지 않도록 차단기를 두 종류 둡니다. 자료 엔진은 서버 메모리에서 429·503 뒤 그 호스트만 잠시 멈추고, 운세 같은 한도가 있는 공급자는 Upstash 에서 서버들이 함께 서킷과 일일 예산을 봅니다. 막히면 가짜 값을 만들지 않고 로컬 결과와 이유를 보여 줍니다.",
        "Two kinds of breakers stop us from hammering a struggling service. The resource engine pauses just that host in server memory after a 429 or 503, while limited providers such as fortune share circuit and daily budget across servers through Upstash. When blocked, we show the local result and the reason instead of inventing values.",
      ),
      analogy: t(
        "집 분전반 차단기와 건물 전체 차단기입니다. 방마다 있는 작은 차단기(프로세스 쿨다운)는 그 방만 끊고, 건물 전체 차단기(분산 서킷)는 모든 층이 함께 봅니다.",
        "Think of a room breaker and a building breaker. The small one in each room (process cooldown) cuts only that room, while the building-wide one (distributed circuit) is seen by every floor.",
      ),
      questions: [
        {
          question: t("왜 전부 분산 서킷으로 통일하지 않나요?", "Why not use the distributed circuit everywhere?"),
          answer: t(
            "분산 방식은 외부 저장소가 필요하고 호출마다 왕복이 늘어납니다. 현재는 일일 한도나 승인이 걸린 경로에만 쓰고, 나머지는 가벼운 쿨다운으로 둔 것이 코드 상태입니다. 왜 그렇게 정했는지의 문서화된 근거는 찾지 못했습니다.",
            "The distributed way needs an external store and adds a round trip per call. In code it is used only on paths with daily limits or approval, and the rest use the light cooldown. A documented rationale for that split was not found.",
          ),
        },
        {
          question: t("Upstash 가 없으면 어떻게 되나요?", "What if Upstash is unavailable?"),
          answer: t(
            "메모리로 대신하지 않습니다. 운세 보강은 호출 없이 로컬 계산 결과로 내려가고 이유가 coordination-unavailable 로 표시됩니다.",
            "There is no in-memory substitute. Fortune enrichment makes no call and falls back to the locally computed result, with the reason shown as coordination-unavailable.",
          ),
        },
        {
          question: t("유료 API 로 자동 전환되나요?", "Does it switch to a paid API automatically?"),
          answer: t(
            "아니요. 운세 보강의 capabilities 는 paidFallback: false 이고, 예산이 끝나면 로컬 결과로 내려갑니다.",
            "No. The fortune capabilities report paidFallback: false, and when the budget runs out it falls back to local results.",
          ),
        },
      ],
      pitfall: t(
        "분산 서킷을 모든 외부 호출에 쓴다고 말하지 마세요. 자료 엔진과 KMAS 에는 없습니다. 분산 장치가 운영에서 켜져 있는지, 예산 하루가 UTC 기준이라는 점(한국 시간 오전 9시)도 함께 말하세요. 코드는 있으나 운영 설정이 남은 상태라 configured 로 표시했습니다.",
        "Do not say the distributed circuit guards every external call; the resource engine and KMAS do not use it. Mention that its production activation is unconfirmed and that the budget day is UTC (09:00 Korea time). The code exists but production settings remain, hence configured.",
      ),
    },
    technologies: ["Circuit breaker", "Upstash", "Redis", "Retry-After"],
    facts: [
      { value: "3 → 60s", label: t("누적 실패 횟수 → 서킷 열림 시간", "Piled-up failures → circuit open time"), source: "apps/api/src/modules/fortune/fortune-enrichment.service.ts" },
      { value: "2.5s", label: t("운세 공급자 호출 제한 시간", "Fortune provider call limit"), source: "apps/api/src/modules/fortune/fortune-enrichment.service.ts" },
      { value: "1-120s", label: t("Retry-After 반영 범위(없으면 30초)", "Retry-After range applied (30 s when absent)"), source: "packages/contracts/src/creator-resource-workflow.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "browser-direct-calls-under-csp",
    category: "open-data",
    name: "CSP connect-src",
    title: t("브라우저가 직접 부르는 5곳을 CSP 허용 목록이 강제한다", "A CSP allowlist enforces the five places the browser calls directly"),
    status: "live",
    tagline: t("서버를 거치지 않는 호출은 코드의 약속이 아니라 브라우저 규칙(connect-src)이 지킵니다.", "Calls that skip the server are guarded by a browser rule (connect-src), not by a code promise."),
    background: [
      t(
        "대부분의 외부 데이터는 서버가 대신 받아 오지만, 다섯 곳은 방문자의 브라우저가 직접 호출합니다. 서버 비용을 쓰지 않으려는 원칙 때문입니다. 대신 브라우저에서는 어디로 나갈 수 있는지를 코드의 약속이 아니라 브라우저 규칙이 지켜 줘야 합니다. 그 규칙이 CSP(콘텐츠 보안 정책)의 connect-src 입니다. 출입증에 갈 수 있는 층이 적혀 있는 것과 같습니다.",
        "Most external data is fetched by the server, but five places are called directly by the visitor's browser, following a principle of not spending server cost. In a browser, where a call may go must be guarded by a browser rule rather than a promise in code. That rule is connect-src in the CSP (Content Security Policy), like a badge that lists the floors you may enter.",
      ),
      t(
        "직접 호출 5곳은 ① Open Creation(시카고·클리블랜드 미술관, Wikimedia Commons, 한국어 위키백과) ② Unsplash(사용자 본인 키) ③ Open-Meteo(배경 날씨) ④ MyMemory(번역) ⑤ IPFS 게이트웨이입니다. 운영 응답 헤더의 connect-src 는 'self' 와 blob: 을 포함해 26개 항목만 허용하고, 목록에 없는 곳으로 가는 fetch 는 브라우저가 막습니다. 코드 검사가 놓친 주소가 있어도 마지막 방어선이 됩니다.",
        "The five direct calls are 1 Open Creation (the Chicago and Cleveland museums, Wikimedia Commons, Korean Wikipedia), 2 Unsplash (the user's own key), 3 Open-Meteo (background weather), 4 MyMemory (translation) and 5 IPFS gateways. The production connect-src allows only 26 entries including 'self' and blob:, and the browser blocks fetches to anything else, a last line of defence even if code checks miss an address.",
      ),
      t(
        "서버 프록시와 비교하면 직접 호출은 서버 비용이 없지만 크기·타임아웃·권리 검사를 브라우저 코드가 따로 갖춰야 합니다. Open Creation 은 15초 타임아웃, 리디렉션 차단, 2MiB 스트림 읽기, 24시간 캐시를 갖췄고 서버 엔진과 같은 권리 조건(AIC·Cleveland)을 한 번 더 구현했습니다. Unsplash 클라이언트에는 fetch 타임아웃이 없습니다.",
        "Compared with a server proxy, direct calls cost nothing on the server but browser code must supply its own size, timeout and rights checks. Open Creation has a 15 s timeout, refused redirects, 2 MiB streamed reading and a 24-hour cache, and re-implements the same rights conditions as the server engine (AIC, Cleveland). The Unsplash client has no fetch timeout.",
      ),
      t(
        "한계를 그대로 적습니다. 운영 Permissions-Policy 가 geolocation=() 라서 내 위치 날씨는 운영에서 동작하지 않고 서울 기본 위치로 표시됩니다. MyMemory 와 IPFS 게이트웨이 3곳은 connect-src 목록에 없어 운영 브라우저에서 막힐 가능성이 있지만, 실제 브라우저로 확인하지는 못했습니다.",
        "The limits, stated plainly: the production Permissions-Policy is geolocation=(), so the my-location weather does not work in production and Seoul is used by default. MyMemory and the three IPFS gateways are missing from connect-src and may be blocked in production browsers, but this was not checked in a real browser.",
      ),
    ],
    keyPoints: [
      t("직접 호출 5곳: 허용 여부는 코드가 아닌 CSP 가 강제", "Five direct calls: the CSP, not the code, enforces what is allowed"),
      t("connect-src 26항목 밖의 fetch 는 브라우저가 막는다", "The browser blocks fetches outside the 26 connect-src entries"),
      t("위치 날씨는 운영 geolocation=() 로 동작하지 않는다", "My-location weather cannot work under geolocation=() in production"),
    ],
    diagram: {
      id: "browser-direct-calls-under-csp-diagram",
      kind: "graph",
      title: t("브라우저 직접 호출과 CSP 문", "Direct browser calls and the CSP gate"),
      caption: t("다섯 호출 중 세 곳은 허용 목록에 있고, 두 곳은 목록에 없어 운영에서 막힐 수 있습니다.", "Three of the five calls are on the allowlist; two are not and may be blocked in production."),
      alt: t(
        "브라우저가 CSP connect-src 문을 거쳐 외부로 나갑니다. Open Creation, Unsplash, Open-Meteo 는 허용 목록에 있어 통과합니다. MyMemory 번역과 IPFS 게이트웨이는 목록에 없어 점선으로 표시하며, 운영 브라우저에서 막힐 가능성이 있지만 실제 확인은 하지 못했습니다.",
        "The browser goes out through the CSP connect-src gate. Open Creation, Unsplash and Open-Meteo are on the allowlist and pass. MyMemory translation and the IPFS gateways are not on it and are drawn dashed: they may be blocked in production browsers, though this was not confirmed.",
      ),
      nodes: [
        { id: "browser", label: t("브라우저", "Browser"), sub: t("방문자 기기에서 직접 호출", "calls straight from the device"), tone: "local", shape: "pill", at: [0, 2] },
        { id: "csp", label: t("CSP connect-src", "CSP connect-src"), sub: t("26항목 허용", "26 entries"), tone: "warn", shape: "diamond", at: [2, 2] },
        { id: "oc", label: t("Open Creation", "Open Creation"), sub: t("미술관·Commons·위키백과", "museums, Commons, Wikipedia"), tone: "external", shape: "cloud", at: [4, 0] },
        { id: "us", label: t("Unsplash", "Unsplash"), sub: t("사용자 본인 키(BYOK)", "the user's own key (BYOK)"), tone: "external", shape: "cloud", at: [4, 1] },
        { id: "om", label: t("Open-Meteo", "Open-Meteo"), sub: t("배경 날씨·기본 위치 서울", "ambient weather, Seoul default"), tone: "external", shape: "cloud", at: [4, 2] },
        { id: "mm", label: t("MyMemory", "MyMemory"), sub: t("번역 · 목록에 없음", "translation, not listed"), tone: "warn", shape: "cloud", at: [4, 3] },
        { id: "ipfs", label: t("IPFS 게이트웨이", "IPFS gateways"), sub: t("3곳 · 목록에 없음", "three hosts, not listed"), tone: "warn", shape: "cloud", at: [4, 4] },
      ],
      edges: [
        { from: "browser", to: "csp", label: t("fetch", "fetch") },
        { from: "csp", to: "oc", label: t("허용", "allowed") },
        { from: "csp", to: "us", label: t("허용", "allowed") },
        { from: "csp", to: "om", label: t("허용", "allowed") },
        { from: "csp", to: "mm", label: t("목록 없음", "unlisted"), style: "dashed" },
        { from: "csp", to: "ipfs", label: t("목록 없음", "unlisted"), style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("열린 창작 · 공개 API 검색", "Open Creation · public API search"),
        role: t("브라우저가 미술관·위키 API 를 직접 호출합니다(15초 타임아웃, 쿠키 없음, 리디렉션 차단, 2MiB 읽기 상한, 24시간 캐시).", "The browser calls museum and wiki APIs directly (15 s timeout, no cookies, redirects refused, 2 MiB read cap, 24-hour cache)."),
        paths: ["apps/web/src/domains/creator-resources/OpenCreationPage.tsx", "apps/web/src/domains/creator-resources/open-creation-transport.ts"],
        route: "/research/open-creation",
      },
      {
        feature: t("스튜디오 · 스톡 이미지 검색(Unsplash)", "Studio · stock image search (Unsplash)"),
        role: t("사용자 본인의 Access Key 를 탭 sessionStorage 에만 두고 api.unsplash.com 을 브라우저가 직접 호출합니다. 키는 서버를 거치지 않습니다.", "The user's own access key stays in tab sessionStorage and the browser calls api.unsplash.com directly. The key never goes through our server."),
        paths: ["apps/web/src/domains/creator/studio-stock-image-client.ts"],
        route: "/studio",
      },
      {
        feature: t("배경 날씨 효과", "Ambient weather effects"),
        role: t("Open-Meteo 로 현재 날씨를 읽고 위치는 기본 서울입니다. 내 위치는 설정을 켠 경우에만 쓰이는데 운영 헤더가 geolocation 을 막습니다.", "Reads current weather from Open-Meteo, defaulting to Seoul. My-location is used only when enabled, and the production header blocks geolocation."),
        paths: ["apps/web/src/shared/ambient/ambient-weather.ts", "config/http-response-headers.json"],
      },
      {
        feature: t("운영 응답 헤더 검사", "Production response-header check"),
        role: t("connect-src 허용 목록과 Permissions-Policy 를 배포 설정에 두고, 스크립트가 unsafe-eval 부재와 connect-src 의 느슨함을 검사합니다.", "The connect-src allowlist and Permissions-Policy live in deploy config, and a script checks for the absence of unsafe-eval and for a too-open connect-src."),
        paths: ["config/http-response-headers.json", "scripts/verify-static-csp.mjs"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("배포 전 connect-src 느슨함 검사", "A pre-release check that connect-src is not too open"),
        language: "ts",
        ...codePair(`
//~ 지시문 하나를 찾아 토큰 배열로 돌려준다. ## Find one directive and return its tokens.
function directive(csp: string, name: string): string[] {
  const part = csp.split(";").map((p) => p.trim()).find((p) => p === name || p.startsWith(name + " "));
  return part ? part.split(/\\s+/u).slice(1) : [];
}

//~ 배포 전 점검: connect-src 가 통째로 열리지 않았고, 꼭 필요한 곳이 정확히 있는지 본다. ## Pre-release check: connect-src is not wide open and holds the exact origins we need.
function assertConnectSrc(csp: string, required: readonly string[]): void {
  const sources = directive(csp, "connect-src");
  if (sources.includes("https:") || sources.includes("wss:")) throw new Error("unrestricted network scheme");
  if (!sources.includes("'self'")) throw new Error("'self' is missing");
  for (const origin of required) {
    if (!sources.includes(origin)) throw new Error("missing exact origin: " + origin);
  }
}

const csp = "default-src 'self'; connect-src 'self' https://api.artic.edu https://api.open-meteo.com";
assertConnectSrc(csp, ["https://api.artic.edu"]); //~ 통과 ## passes
console.log(directive(csp, "connect-src").includes("https://ipfs.io")); //~ false: 목록에 없으니 브라우저가 막는다 ## false: not listed, so the browser blocks it
`),
        explain: t(
          "scripts/verify-static-csp.mjs 의 connect-src 검사 아이디어를 줄인 예제입니다. 실제 스크립트는 통째로 여는 https:·wss: 를 거절하고, 'self'·blob: 각 1개, 실시간 서버와 분석 비콘의 정확한 오리진, Supabase 단일 오리진까지 확인합니다.",
          "A reduction of the connect-src checks in scripts/verify-static-csp.mjs. The real script rejects the wide-open https: and wss: schemes and also verifies 'self' and exactly one blob:, the exact realtime and analytics beacon origins, and a single Supabase origin.",
        ),
        source: "scripts/verify-static-csp.mjs",
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · CSP connect-src", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src", kind: "docs" },
      { title: "MDN · Permissions-Policy: geolocation", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Permissions-Policy/geolocation", kind: "docs", note: t("geolocation=() 가 의미하는 것", "What geolocation=() means") },
      { title: "W3C · Content Security Policy Level 3", url: "https://www.w3.org/TR/CSP3/", kind: "spec" },
      { title: "Open-Meteo · API documentation", url: "https://open-meteo.com/en/docs", kind: "docs" },
      { title: "Unsplash · API documentation", url: "https://unsplash.com/documentation", kind: "docs" },
    ],
    chapterIds: ["open-api-data", "infrastructure"],
    talk: {
      pitch: t(
        "서버가 대신 받아 오는 외부 데이터가 대부분이지만, 다섯 곳은 방문자 브라우저가 직접 부릅니다. 어디로 나갈 수 있는지는 코드의 약속이 아니라 운영 응답 헤더의 CSP connect-src 26항목이 강제하고, 목록 밖 주소로는 브라우저가 요청을 막습니다.",
        "Most external data is fetched by the server, but five places are called by the visitor's browser itself. Where those calls may go is enforced not by a promise in code but by the 26 connect-src entries in the production response headers, and the browser blocks anything outside the list.",
      ),
      analogy: t(
        "출입증에 갈 수 있는 층이 적혀 있는 것과 같습니다. 직원(코드)이 어디로 가려 해도, 문(브라우저)은 출입증 목록에 없는 층을 열어 주지 않습니다.",
        "It is a badge listing the floors you may enter. Whichever floor an employee (the code) tries to reach, the door (the browser) will not open for floors missing from the badge.",
      ),
      questions: [
        {
          question: t("직접 호출이 서버 프록시보다 나은가요?", "Are direct calls better than a server proxy?"),
          answer: t(
            "서버 비용은 줄지만 크기·시간·권리 검사를 브라우저 코드가 따로 갖춰야 합니다. 현재는 Open Creation 만 서버 엔진과 같은 권리 조건을 브라우저에 한 번 더 구현해 두었습니다.",
            "It saves server cost but browser code must carry its own size, time and rights checks. Today only Open Creation re-implements the server engine's rights conditions in the browser.",
          ),
        },
        {
          question: t("날씨는 내 위치로 나오나요?", "Does the weather use my location?"),
          answer: t(
            "운영 헤더가 geolocation 을 막아 내 위치 날씨는 동작하지 않고 서울 기본 위치로 나옵니다. 설정에서 켜는 코드는 있지만 운영 헤더에 막힙니다.",
            "The production header blocks geolocation, so my-location weather does not work and Seoul is used. The setting exists in code but the header overrules it.",
          ),
        },
        {
          question: t("CSP 가 막으면 사용자에게는 어떻게 보이나요?", "What does the user see when the CSP blocks a call?"),
          answer: t(
            "배경 날씨는 조용히 실패하고 계절 효과로 대체합니다(코드 주석). 번역과 IPFS 가 운영에서 실제로 막히는지는 실제 브라우저로 확인하지 못했습니다.",
            "Ambient weather fails silently and switches to seasonal effects (per a code comment). Whether translation and IPFS are really blocked in production was not checked in a real browser.",
          ),
        },
      ],
      pitfall: t(
        "모든 외부 호출을 서버가 한다고 말하지 마세요. 5곳은 브라우저 직접 호출입니다. 소스 레지스트리는 Open-Meteo 를 운영 비활성(상업 플랜 필요)으로 적지만 브라우저 날씨는 무료 공개 엔드포인트를 직접 부르며, 약관 대조는 이 카드에서 하지 않았습니다. MyMemory·IPFS 의 운영 차단 여부는 미확인입니다.",
        "Do not say the server makes every external call; five are direct browser calls. The source registry lists Open-Meteo as inactive in production (commercial plan needed), yet browser weather calls the free public endpoint directly, and terms were not compared for this card. Whether MyMemory and IPFS are blocked in production is unconfirmed.",
      ),
    },
    technologies: ["CSP connect-src", "Permissions-Policy", "Open-Meteo", "Unsplash"],
    facts: [
      { value: "26", label: t("운영 CSP connect-src 항목 수('self'·blob: 포함)", "Production CSP connect-src entries (incl. 'self', blob:)"), source: "config/http-response-headers.json" },
      { value: "geolocation=()", label: t("운영 Permissions-Policy 의 위치 정보 설정", "Geolocation setting in the production Permissions-Policy"), source: "config/http-response-headers.json" },
    ],
    reviewedAt: "2026-10-07",
  },
];
