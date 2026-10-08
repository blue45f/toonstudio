import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · platform-ops 카테고리 — 엣지 신뢰 경계 카드(원점 인증·신뢰 프록시 IP·읽기 전용 복제 풀).
 * 사실은 2026-10-07 기준 코드·테스트로 확인했다. 환경변수는 이름만 적었고 값은 열람하지 않았다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const EDGE_ORIGIN_AUTH_TRUSTED_PROXY: EngineeringAtlasEntry = {
  id: "edge-origin-auth-trusted-proxy",
  category: "platform-ops",
  name: "Edge origin authentication and trusted-proxy IP",
  title: t("Cloudflare를 거친 요청만 받고, 진짜 방문자 IP로 로그인 시도를 셉니다", "Accept only requests that came through Cloudflare, and count sign-in attempts by the real visitor IP"),
  status: "configured",
  tagline: t(
    "원점 비밀 헤더로 Cloudflare 밖의 요청을 403으로 막고, 신뢰 프록시 규칙으로 방문자 IP를 가려냅니다.",
    "A secret origin header turns away requests from outside Cloudflare, and a trusted-proxy rule picks out the visitor IP.",
  ),
  background: [
    t(
      "무료 서버(Render)에는 누구나 직접 접속할 수 있는 onrender.com 주소가 따로 있습니다. 그대로 두면 Cloudflare가 걸어 둔 보호를 건너뛰고 서버를 직접 두드릴 수 있습니다. 그래서 Worker는 Core API로 보내는 요청에만 32바이트 이상의 비밀 헤더를 붙이고, API는 비밀이 설정된 환경에서 이 헤더가 맞지 않으면 403 'Trusted edge origin is required'로 돌려보냅니다(비밀이 설정되지 않으면 검사를 건너뜁니다). 예외는 헬스체크 경로(GET/HEAD) 몇 개뿐입니다. 정문 대신 뒷문으로 들어오는 사람을 출입증으로 걸러 내는 것과 같습니다.",
      "The free server (Render) also has its own onrender.com address that anyone can reach directly. Left alone, someone could skip Cloudflare's protection and knock on the server directly. So the Worker adds a secret header of at least 32 bytes only to requests sent to the Core API, and in an environment where the secret is configured the API answers 403 'Trusted edge origin is required' when it does not match (without a configured secret the check is skipped). The only exceptions are a few health-check paths (GET/HEAD). It is like checking a pass for anyone who walks in the back door instead of the front.",
    ),
    t(
      "로그인 시도를 IP별로 세려면 방문자의 진짜 IP를 알아야 합니다. 그런데 X-Forwarded-For 같은 헤더는 방문자가 마음대로 써서 보낼 수 있습니다. 규칙은 '헤더가 있으니 믿는다'가 아니라 '바로 연결된 상대가 내가 아는 프록시일 때만 믿는다'입니다. 허용 목록(정확한 IP)에 있는 프록시가 보낸 경우에만 헤더를 읽고, 오른쪽(프록시 쪽)에서 왼쪽으로 걸으며 처음 만나는 비신뢰 주소를 방문자로 봅니다. 그래서 방문자가 왼쪽에 끼워 넣은 가짜 주소가 이기지 못합니다.",
      "To count sign-in attempts per IP, the server needs the visitor's real IP, yet a header such as X-Forwarded-For can be written freely by the visitor. The rule is not 'trust it because it is there' but 'trust it only when the directly connected peer is a proxy I know'. The header is read only when it comes from a proxy on an allow list (exact IPs), walking from the right (proxy side) to the left and taking the first untrusted address as the visitor. A fake address the visitor inserts on the left cannot win.",
    ),
    t(
      "레이트리밋은 한 번에 두 주체를 셉니다. IP 하나와 계정·토큰 같은 보조 주체를 각각 '고정 접두어 + 동작 + 종류 + 값'의 SHA-256 지문으로 만들어 소비하므로, 한쪽만 바꿔 가며 우회하기 어렵고 한 엔드포인트가 다른 엔드포인트의 버킷을 비우지 못합니다. 10분 고정 창에서 로그인 10회, 가입 5회, 인증메일 재발송 3회 같은 한도를 둡니다. 분산 모드는 Upstash(Lua 카운터)를, 로컬 모드는 프로세스 메모리를 쓰고, 로컬 저장소가 가득 차면 새 사용자를 503으로 닫습니다. 운영에서는 AUTH_RATE_LIMIT_MODE를 명시하지 않으면 설정 오류입니다.",
      "The rate limiter counts two subjects at once. An IP and a secondary subject such as an account or token are each turned into a SHA-256 fingerprint of a fixed prefix, the action, the kind and the value, so bypassing by rotating only one is hard and one endpoint cannot drain another's bucket. Within a fixed 10-minute window the limits are 10 sign-ins, 5 sign-ups and 3 verification-mail resends, for example. Distributed mode uses Upstash (a Lua counter) and local mode uses process memory; when the local store is full, a new subject is closed out with a 503. In production, leaving AUTH_RATE_LIMIT_MODE unset is a configuration error.",
    ),
    t(
      "한계도 있습니다. 고정 창은 창 경계에서 한도의 두 배가 순간적으로 통과할 수 있고, 원점 비밀은 하나를 Worker와 API가 나눠 가져서 회전이 수동입니다. 무중단 회전 절차는 문서에서 찾지 못했습니다. 신뢰 프록시 목록은 정확한 IP만 받고 대역(CIDR)은 받지 않습니다.",
      "There are limits. A fixed window can let twice the limit through for a moment at a boundary, and the single origin secret is shared by the Worker and the API, so rotation is manual; a zero-downtime rotation procedure was not found in the docs. The trusted-proxy list takes exact IPs only, not ranges (CIDR).",
    ),
  ],
  keyPoints: [
    t("Worker가 붙인 비밀 헤더가 없으면 API가 403으로 거절", "Without the Worker's secret header the API answers 403"),
    t("X-Forwarded-For는 신뢰 프록시가 보낼 때만, 오른쪽부터 읽음", "X-Forwarded-For counts only from a trusted proxy, read from the right"),
    t("IP와 계정을 따로 해시해 세어 한쪽 우회를 어렵게 함", "IP and account are hashed and counted separately"),
    t("로컬 카운터가 가득 차면 새 요청을 닫는 fail-closed", "A full local counter fails closed for new subjects"),
  ],
  diagram: {
    id: "edge-origin-auth-trusted-proxy-diagram",
    kind: "sequence",
    title: t("로그인 요청이 원점에서 걸러지는 순서", "How a sign-in request is vetted at the origin"),
    caption: t(
      "Worker가 방문자의 헤더를 지우고 다시 쓰며, API는 비밀과 프록시 신뢰를 확인한 뒤에야 횟수를 셉니다.",
      "The Worker wipes and rewrites visitor headers; the API counts attempts only after checking the secret and proxy trust.",
    ),
    alt: t(
      "방문자가 가짜 X-Forwarded-For를 넣어 로그인을 요청하면 Worker가 클라이언트 IP 헤더를 모두 지우고 검증된 접속 IP만 다시 씁니다. Worker는 비밀 헤더를 붙여 Core API로 보내고, API는 비밀이 맞는지 확인한 뒤 허용된 프록시일 때만 헤더를 오른쪽부터 해석해 IP와 계정을 따로 센 결과를 Upstash에서 받습니다. Cloudflare를 건너뛰고 직접 접속하면 비밀 헤더가 없어 403을 받습니다.",
      "When a visitor signs in with a fake X-Forwarded-For, the Worker wipes every client IP header and rewrites only the verified connecting IP. It adds the secret header and forwards to the Core API, which checks the secret, reads the header from the right only for an allowed proxy, and gets separate IP and account counts from Upstash. Someone who skips Cloudflare and connects directly has no secret header and receives a 403.",
    ),
    actors: [
      { id: "direct", label: t("직접 접속", "Direct hit"), sub: t("Cloudflare를 건너뜀", "Skips Cloudflare"), tone: "warn" },
      { id: "visitor", label: t("방문자", "Visitor"), sub: t("헤더를 마음대로 씀", "Writes headers freely"), tone: "local" },
      { id: "worker", label: t("Worker", "Worker"), sub: t("비밀 헤더 + 검증된 IP", "Secret header + verified IP"), tone: "edge" },
      { id: "api", label: t("Core API", "Core API"), sub: t("비밀 검사 · IP 해석", "Secret check, IP parsing"), tone: "server" },
      { id: "redis", label: t("Upstash", "Upstash"), sub: t("분산 카운터(Lua)", "Distributed counter (Lua)"), tone: "external" },
    ],
    messages: [
      { from: "visitor", to: "worker", label: t("로그인 요청 (가짜 XFF 포함)", "Sign-in with a fake XFF"), note: t("방문자가 헤더를 임의로 써서 보냄", "The visitor writes the header freely") },
      { from: "worker", to: "worker", label: t("클라이언트 IP 헤더 삭제", "Wipe client IP headers"), note: t("접속 IP만 XFF로 다시 씀", "Rewrite only the connecting IP") },
      { from: "worker", to: "api", label: t("비밀 헤더 + 재구성한 XFF", "Secret header + rebuilt XFF"), note: t("비밀은 Core 오리진에만 붙임", "Secret goes to the Core origin only") },
      { from: "api", to: "api", label: t("비밀 일치? 아니면 403", "Secret matches? else 403"), note: t("상수 시간 비교", "Constant-time comparison") },
      { from: "api", to: "api", label: t("허용 프록시일 때만 XFF 해석", "Parse XFF only for allowed proxy"), note: t("오른쪽부터 처음 만난 비신뢰 IP", "First untrusted IP from the right") },
      { from: "api", to: "redis", label: t("IP·계정 지문을 각각 카운트", "Count IP and account separately"), note: t("SHA-256 지문을 다시 HMAC 키로", "SHA-256 fingerprint, HMAC'd again as key") },
      { from: "redis", to: "api", label: t("허용 · 한도 초과", "Allowed or over limit"), style: "dashed" },
      { from: "direct", to: "api", label: t("onrender.com 직접 요청", "Direct request to onrender.com"), note: t("Worker의 비밀 헤더가 없음", "No secret header from the Worker") },
      { from: "api", to: "direct", label: t("403으로 거절", "Rejected with 403"), style: "dashed", note: t("응답 문구: Trusted edge origin is required", "Message: Trusted edge origin is required") },
    ],
  },
  usage: [
    {
      feature: t("Cloudflare를 거치지 않은 직접 접속 차단", "Blocking direct access that skips Cloudflare"),
      role: t(
        "Worker는 Core 오리진으로 가는 요청에만 비밀 헤더를 붙이고, API 미들웨어가 상수 시간으로 비교해 틀리면 403을 냅니다. 설정이 잘못되면 Worker도 503으로 닫습니다.",
        "The Worker adds the secret header only to requests bound for the Core origin, and API middleware compares it in constant time and answers 403 on mismatch. If the setting is malformed, the Worker closes with 503 too.",
      ),
      paths: [
        "apps/api/src/config/edge-origin-auth.ts",
        "deploy/cloudflare-static/src/index.ts#createUpstreamApiRequest",
      ],
    },
    {
      feature: t("로그인·가입·비밀번호 재설정의 무차별 대입 방지", "Brute-force protection for sign-in, sign-up and password reset"),
      role: t(
        "동작마다 정해진 한도를 IP와 계정(또는 토큰) 두 주체로 따로 세고, 분산 모드에서는 Upstash 카운터를 씁니다. 카운터 인프라가 응답하지 않으면 통과시키지 않고 503을 냅니다.",
        "Each action's limit is counted separately for the IP and for the account or token, using the Upstash counter in distributed mode. If the counter infrastructure does not answer, requests are not waved through; the API answers 503.",
      ),
      paths: [
        "apps/api/src/modules/auth/auth-rate-limit.ts",
        "apps/api/src/modules/auth/auth-rate-limit.config.ts",
        "apps/api/src/modules/auth/auth.controller.ts",
      ],
    },
    {
      feature: t("방문자 IP 해석 (신뢰 프록시)", "Visitor IP resolution (trusted proxy)"),
      role: t(
        "허용 목록에 있는 프록시가 보낸 헤더만 읽고 오른쪽부터 해석합니다. 설정이 잘못되면 서버가 부팅 때 구성 오류로 멈춥니다.",
        "It reads headers only from proxies on the allow list and parses from the right. A bad setting stops the server at boot with a configuration error.",
      ),
      paths: [
        "apps/api/src/modules/auth/auth-client-ip.ts#resolveAuthClientIp",
        "apps/api/src/modules/auth/auth.module.ts",
      ],
    },
    {
      feature: t("분산 카운터와 짧은 영수증 (Upstash 조정)", "Distributed counters and short receipts (Upstash coordination)"),
      role: t(
        "Lua EVAL로 비교-갱신을 원자적으로 처리하고, 식별자는 HMAC-SHA-256으로 바꿔 저장합니다. 켜지지 않으면 메모리 폴백 없이 모듈이 빠집니다.",
        "Lua EVAL makes compare-and-update atomic, identifiers are stored after HMAC-SHA-256, and when it is off the module is left out with no in-memory fallback.",
      ),
      paths: ["apps/api/src/platform/adapters/upstash-coordination/README.md"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("신뢰 프록시일 때만 오른쪽부터 방문자 IP 찾기", "Finding the visitor IP from the right, only for a trusted proxy"),
      language: "ts",
      code: [
        "export function clientIp(peer: string, xff: string | undefined, trusted: ReadonlySet<string>): string {",
        "  if (!trusted.has(peer) || !xff) return peer; // 신뢰 프록시가 아니면 헤더를 무시한다",
        '  const chain = xff.split(",").map((ip) => ip.trim()).filter(Boolean);',
        "  for (let i = chain.length - 1; i >= 0; i -= 1) {",
        "    // 프록시가 덧붙인 오른쪽부터 거슬러 올라가 처음 만난 '비신뢰' 주소가 방문자다",
        "    const candidate = chain[i];",
        "    if (candidate !== undefined && !trusted.has(candidate)) return candidate;",
        "  }",
        "  return chain[0] ?? peer;",
        "}",
        "",
        '// 방문자가 왼쪽에 끼워 넣은 "6.6.6.6"은 무시되고, 프록시가 덧붙인 진짜 IP가 선택된다',
        'const trusted = new Set(["10.0.0.1"]);',
        'console.log(clientIp("10.0.0.1", "6.6.6.6, 203.0.113.9, 10.0.0.1", trusted)); // 203.0.113.9',
      ].join("\n"),
      codeEn: [
        "export function clientIp(peer: string, xff: string | undefined, trusted: ReadonlySet<string>): string {",
        "  if (!trusted.has(peer) || !xff) return peer; // not a trusted proxy: ignore the header",
        '  const chain = xff.split(",").map((ip) => ip.trim()).filter(Boolean);',
        "  for (let i = chain.length - 1; i >= 0; i -= 1) {",
        "    // walk left from what the proxy appended; the first untrusted address is the visitor",
        "    const candidate = chain[i];",
        "    if (candidate !== undefined && !trusted.has(candidate)) return candidate;",
        "  }",
        "  return chain[0] ?? peer;",
        "}",
        "",
        '// the "6.6.6.6" a visitor inserted on the left is ignored; the proxy-appended real IP wins',
        'const trusted = new Set(["10.0.0.1"]);',
        'console.log(clientIp("10.0.0.1", "6.6.6.6, 203.0.113.9, 10.0.0.1", trusted)); // 203.0.113.9',
      ].join("\n"),
      explain: t(
        "예시의 IP는 문서용 주소입니다. 실제 구현은 허용 헤더 3종과 최대 전달 홉 수를 검증하고, 목록이 비어 있으면 부팅 때 구성 오류를 던집니다.",
        "The IPs in the example are documentation addresses. The real implementation validates the three allowed headers and a maximum hop count, and throws a configuration error at boot if the list is empty.",
      ),
      source: "apps/api/src/modules/auth/auth-client-ip.ts",
      verify: "types",
    },
    {
      kind: "teaching",
      title: t("상수 시간 비교와 고정 창 한도", "Constant-time comparison and a fixed-window limit"),
      language: "ts",
      code: [
        "// 길이가 같으면 모든 바이트를 끝까지 비교한다(조기 종료가 없어 비교 시간이 새지 않는다)",
        "export function sameSecret(supplied: Uint8Array, expected: Uint8Array): boolean {",
        "  if (supplied.byteLength !== expected.byteLength) return false;",
        "  let diff = 0;",
        "  for (let i = 0; i < expected.byteLength; i += 1) diff |= (supplied[i] ?? 0) ^ (expected[i] ?? 0);",
        "  return diff === 0;",
        "}",
        "",
        "interface Hit { count: number; resetAt: number }",
        "",
        "// 고정 창: 창이 끝나면 처음부터 다시 센다. true 면 허용",
        "export function allow(hits: Map<string, Hit>, id: string, limit: number, windowMs: number, now = Date.now()): boolean {",
        "  const current = hits.get(id);",
        "  const hit = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };",
        "  hits.set(id, { count: hit.count + 1, resetAt: hit.resetAt });",
        "  return hit.count < limit;",
        "}",
      ].join("\n"),
      codeEn: [
        "// With equal lengths every byte is compared to the end (no early exit, so timing does not leak)",
        "export function sameSecret(supplied: Uint8Array, expected: Uint8Array): boolean {",
        "  if (supplied.byteLength !== expected.byteLength) return false;",
        "  let diff = 0;",
        "  for (let i = 0; i < expected.byteLength; i += 1) diff |= (supplied[i] ?? 0) ^ (expected[i] ?? 0);",
        "  return diff === 0;",
        "}",
        "",
        "interface Hit { count: number; resetAt: number }",
        "",
        "// Fixed window: counting restarts when the window ends. true means allowed",
        "export function allow(hits: Map<string, Hit>, id: string, limit: number, windowMs: number, now = Date.now()): boolean {",
        "  const current = hits.get(id);",
        "  const hit = current && current.resetAt > now ? current : { count: 0, resetAt: now + windowMs };",
        "  hits.set(id, { count: hit.count + 1, resetAt: hit.resetAt });",
        "  return hit.count < limit;",
        "}",
      ].join("\n"),
      explain: t(
        "실제 코드는 node:crypto의 timingSafeEqual을 쓰고, 로컬 카운터는 식별자 수 상한(10,000)과 만료 정리를 더합니다. 여기서는 두 아이디어만 따로 떼어 보였습니다.",
        "The real code uses timingSafeEqual from node:crypto, and the local counter adds a cap on the number of identities (10,000) and expiry sweeps. Only the two core ideas are shown here.",
      ),
      verify: "types",
    },
  ],
  links: [
    {
      title: "Cloudflare · Authenticated Origin Pulls",
      url: "https://developers.cloudflare.com/ssl/origin-configuration/authenticated-origin-pull/",
      kind: "docs",
      note: t("대안: 인증서로 원점을 잠그는 방식", "An alternative: locking the origin with certificates"),
    },
    {
      title: "Cloudflare · HTTP request headers (CF-Connecting-IP)",
      url: "https://developers.cloudflare.com/fundamentals/reference/http-headers/",
      kind: "docs",
      note: t("Cloudflare가 붙이는 방문자 IP 헤더", "The visitor-IP header Cloudflare adds"),
    },
    {
      title: "MDN · X-Forwarded-For",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/X-Forwarded-For",
      kind: "docs",
      note: t("헤더를 그대로 믿으면 안 되는 이유와 신뢰 홉 계산", "Why the header cannot be taken at face value, and counting trusted hops"),
    },
    {
      title: "OWASP · Authentication Cheat Sheet",
      url: "https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html",
      kind: "guide",
      note: t("무차별 대입과 계정 열거 방어 지침", "Guidance on brute-force and account-enumeration defense"),
    },
    {
      title: "Upstash · Redis REST API",
      url: "https://upstash.com/docs/redis/features/restapi",
      kind: "docs",
      note: t("분산 카운터가 호출하는 HTTP 인터페이스", "The HTTP interface the distributed counter calls"),
    },
  ],
  chapterIds: ["authentication", "infrastructure"],
  talk: {
    pitch: t(
      "우리 API는 Cloudflare를 거치지 않고 들어오는 요청에는 403을 돌려줍니다. Worker가 방문자가 보낸 IP 헤더를 모두 지우고 자기가 확인한 값만 다시 쓰며, API는 직접 연결된 상대가 허용된 프록시일 때만 그 헤더를 믿습니다. 그래서 로그인 시도를 가짜 IP로 쪼개 피해 가기 어렵고, IP와 계정을 따로 세어 한쪽만 바꿔서 우회하는 것도 어렵습니다.",
      "Our API answers 403 to requests that arrive without passing through Cloudflare. The Worker wipes every IP header a visitor sent and rewrites only what it verified, and the API trusts that header only when the directly connected peer is an allowed proxy. That makes it hard to dodge sign-in limits with fake IPs, and counting IP and account separately makes rotating just one hard too.",
    ),
    analogy: t(
      "정문(Cloudflare)에서 출입증을 달아 주고, 건물 안 경비(API)는 출입증이 없는 사람을 돌려보냅니다. 방문자가 적어 둔 '내 이름은 이것'이라는 쪽지는 경비가 믿지 않고 정문 기록만 믿습니다.",
      "The front gate (Cloudflare) issues a pass and the guard inside (the API) turns away anyone without one. The guard ignores a note saying 'my name is this' that a visitor wrote and trusts only the gate's record.",
    ),
    questions: [
      {
        question: t("원점 비밀이 새면 어떻게 하나요?", "What if the origin secret leaks?"),
        answer: t(
          "수동으로 회전해야 합니다. Worker 쪽 변수와 API 쪽 환경변수를 함께 바꿔야 하는데, 무중단 회전 절차를 적은 문서는 찾지 못했습니다. 짝이 되는 두 이름(Worker의 CORE_ORIGIN_SECRET, API의 CLOUDFLARE_EDGE_ORIGIN_SECRET)은 코드와 render.yaml에만 있습니다.",
          "It must be rotated by hand. The Worker variable and the API environment variable must change together, and no document describing a zero-downtime rotation was found. The two paired names (CORE_ORIGIN_SECRET in the Worker, CLOUDFLARE_EDGE_ORIGIN_SECRET in the API) appear only in code and render.yaml.",
        ),
      },
      {
        question: t("서버가 한 대인데 왜 분산 모드가 필요하죠?", "With a single server, why a distributed mode?"),
        answer: t(
          "무료 플랜은 인스턴스가 하나지만 재시작하면 프로세스 안 카운터가 초기화되고, 승격해서 여러 대가 되면 각자 따로 셉니다. 운영 정본 문서는 AUTH_RATE_LIMIT_MODE=distributed를 운영 값으로 적어 두었습니다.",
          "The free plan has one instance, but a restart resets in-process counters, and after a promotion to several instances each would count on its own. The canonical operations document lists AUTH_RATE_LIMIT_MODE=distributed as the production value.",
        ),
      },
      {
        question: t("존재하는 이메일인지 알아낼 수 있나요?", "Can someone find out whether an email exists?"),
        answer: t(
          "비밀번호 재설정과 인증 메일 재발송은 계정이 있든 없든 같은 문구로 답해 계정 존재를 알려 주지 않도록 설계했습니다.",
          "Password reset and verification-mail resend answer with the same wording whether or not the account exists, so the response does not reveal that.",
        ),
      },
    ],
    pitfall: t(
      "미실증 잠재 구성 이슈: render.yaml에는 AUTH_TRUSTED_PROXY_ENABLED=true와 헤더·홉 설정이 있지만 AUTH_TRUSTED_PROXY_IPS는 없고, 코드는 목록이 없으면 구성 오류를 던집니다. 대시보드에서 따로 넣었을 수 있어 실제 문제인지는 확인하지 못했습니다. 또 이 카드는 비밀 값과 운영 설정 상태를 열람하지 않았습니다.",
      "Unverified potential configuration issue: render.yaml has AUTH_TRUSTED_PROXY_ENABLED=true plus the header and hop settings but not AUTH_TRUSTED_PROXY_IPS, and the code throws a configuration error when the list is missing. It may be supplied separately in the dashboard, so whether this is a real problem was not verified. This card also did not read secret values or the live configuration.",
    ),
  },
  technologies: ["Cloudflare Workers", "Render", "NestJS", "Upstash Redis", "HMAC"],
  facts: [
    {
      value: "32 bytes",
      label: t("원점 비밀 헤더의 최소 길이", "Minimum length of the origin secret"),
      source: "apps/api/src/config/edge-origin-auth.ts",
    },
    {
      value: "10 · 5 · 3",
      label: t("10분 창의 로그인·가입·인증메일 재발송 한도", "Limits per 10-minute window: sign-in, sign-up, verification resend"),
      source: "apps/api/src/modules/auth/auth-rate-limit.ts",
    },
    {
      value: "10,000",
      label: t("로컬 카운터가 보관하는 식별자 수 상한", "Cap on identities the local counter keeps"),
      source: "apps/api/src/modules/auth/auth-rate-limit.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

const READ_REPLICA_HRW_POOL: EngineeringAtlasEntry = {
  id: "read-replica-hrw-pool",
  category: "platform-ops",
  name: "Read-replica pool with rendezvous hashing",
  title: t("읽기는 나누고 쓰기는 나누지 않는 서버 풀", "A server pool that splits reads but never writes"),
  status: "configured",
  tagline: t(
    "공개 읽기는 최대 8개 복제 서버에 해시 순서로 나누고, 쓰기는 두 번째 서버로 보내지 않습니다.",
    "Public reads are spread over up to 8 replicas by hash order; writes are never sent to a second server.",
  ),
  background: [
    t(
      "서버 한 대(무료 플랜)가 모든 읽기 요청을 받으면 금방 한도에 닿습니다. 그래서 같은 계약을 가진 읽기 전용 서버(복제본)를 여러 대 두고 나누는 준비를 해 두었습니다. 단, 나누는 것은 홈·랭킹·검색·작품 상세처럼 로그인 없이 보는 공개 읽기뿐이고, 글을 쓰거나 결제하는 요청은 어떤 상황에서도 한 서버로만 갑니다. 같은 일을 두 서버에 시키면 이중 쓰기와 서로 다른 장부(split-brain) 위험이 생기기 때문입니다.",
      "If one server on a free plan receives every read, it hits its limit quickly. So the project prepared to spread reads over several read-only servers (replicas) that share the same contract. What is spread is only public reads that need no sign-in, such as Home, Ranking, Search and work details; a request that writes or pays goes to one server under all circumstances, because asking two servers to do the same work risks duplicate writes and two disagreeing ledgers (split-brain).",
    ),
    t(
      "고르는 방법은 랑데부(HRW, Highest Random Weight) 해싱입니다. 각 서버에 '요청 키 + 서버 주소'로 점수를 매겨 높은 순으로 줄을 세웁니다. 서버가 한 대 빠져도 나머지의 상대 순서가 그대로라 재배치가 최소이고, 첫 서버가 502·503·504나 네트워크 오류를 내면 줄의 다음 서버로 재시도합니다. 재시도는 GET·HEAD·OPTIONS 같은 안전한 요청에서만 하고, 실패한 응답의 본문은 취소해 연결과 메모리를 돌려받습니다.",
      "The selection method is rendezvous hashing (HRW, Highest Random Weight). Each server gets a score from 'request key plus server address', and servers are lined up from the highest. If one server leaves, the others keep their relative order, so reshuffling is minimal, and when the first server returns 502, 503, 504 or a network error the request retries on the next in line. Retries happen only for safe requests such as GET, HEAD and OPTIONS, and the body of a failed response is cancelled to release the connection and memory.",
    ),
    t(
      "복제 서버에는 사용자별 권위가 없으므로 인증 정보를 모두 지웁니다. Authorization·Cookie·x-user-*·x-admin-*·x-csrf-*·x-session-* 헤더와 방문자 IP 헤더를 삭제하고 IP도 전달하지 않습니다. 설정이 틀리면 숨기지 않고 닫습니다. 풀은 최대 8개, 중복 금지, 경로·쿼리·자격증명이 없는 HTTPS 오리진만 받고, 목록에 현재 게이트웨이 자신이 들어 있으면 재귀 프록시를 막으려고 전체를 fail-closed 합니다. 헬스·설정·관리자 경로는 읽기여도 풀에 넣지 않습니다.",
      "A replica has no per-user authority, so every credential is removed: Authorization, Cookie, x-user-*, x-admin-*, x-csrf-* and x-session-* headers and the visitor IP headers are deleted, and the IP is not forwarded either. A wrong setting is not hidden but closed. The pool holds at most 8 origins, no duplicates, only HTTPS origins without path, query or credentials, and if the list contains the current gateway itself the whole thing fails closed to prevent a recursive proxy. Health, config and admin paths stay out of the pool even when they are reads.",
    ),
    t(
      "정직하게 말하면 이 분배는 캐시 친화적인 고정 배치가 아닙니다. 요청 키에 요청마다 다른 Cloudflare 식별자(cf-ray)를 섞기 때문에 같은 주소도 요청마다 다른 서버가 첫 후보가 될 수 있고, README의 '안정적 배치'는 한 요청의 재시도 순서가 결정적이라는 뜻에 가깝습니다. 또 기본 설정은 Core 단일 오리진이고 풀은 선택 기능이어서, 운영에서 둘 이상 쓰는지는 저장소로 확인하지 못했습니다.",
      "To be honest, this is not a cache-friendly fixed placement. The request key mixes in a Cloudflare identifier (cf-ray) that differs per request, so the same URL can start at a different server each time, and the README's 'stable placement' is closer to meaning that the retry order of one request is deterministic. Also the default is a single Core origin and the pool is optional, so whether production uses two or more could not be confirmed from the repository.",
    ),
  ],
  keyPoints: [
    t("공개 읽기만 최대 8개 복제 서버에 점수순으로 나눔", "Only public reads are spread, over up to 8 replicas by score"),
    t("502·503·504와 네트워크 오류만 다음 서버로 재시도", "Only 502/503/504 and network errors retry on the next server"),
    t("POST·PUT·PATCH·DELETE는 어떤 경우에도 복수 서버로 안 감", "Writes never go to more than one server"),
    t("복제 서버로 가는 요청에서는 쿠키·토큰·IP를 모두 제거", "Cookies, tokens and IPs are stripped for replica requests"),
  ],
  diagram: {
    id: "read-replica-hrw-pool-diagram",
    kind: "graph",
    title: t("읽기만 풀로 가는 갈림길", "The fork where only reads enter the pool"),
    caption: t(
      "안전한 공개 읽기만 점수순 줄을 타고, 나머지는 한 곳의 권위로 곧장 갑니다.",
      "Only safe public reads join the score-ordered line; everything else goes straight to a single authority.",
    ),
    alt: t(
      "방문자의 요청을 Worker가 받아 공개 읽기이면서 안전한 메서드인지 판단합니다. 맞으면 요청 키와 서버 주소로 점수를 매긴 순서대로 복제본에 보내고, 첫 복제본이 502·503·504를 내면 다음 복제본으로 재시도합니다. 아니면 쓰기를 포함한 모든 요청은 Core 한 곳으로만 보냅니다.",
      "The Worker receives a visitor's request and decides whether it is a public read with a safe method. If so, it sends it to replicas in the order scored from the request key and server address, and retries on the next replica if the first returns 502, 503 or 504. Otherwise every request, writes included, goes to the single Core only.",
    ),
    nodes: [
      { id: "visitor", label: t("방문자", "Visitor"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "worker", label: t("Worker", "Worker"), sub: t("자격증명 제거", "Strips credentials"), tone: "edge", at: [1, 1] },
      { id: "gate", label: t("안전한 공개 읽기?", "Safe public read?"), sub: t("GET·HEAD", "GET, HEAD"), tone: "neutral", shape: "diamond", at: [2, 1] },
      { id: "rank", label: t("점수순 줄 세우기", "Rank by score"), sub: t("요청 키 + 서버 주소", "Request key + address"), tone: "edge", at: [3, 0] },
      { id: "core", label: t("Core 한 곳", "One Core"), sub: t("쓰기는 복수 전송 없음", "Writes never fan out"), tone: "server", at: [3, 2] },
      { id: "a", label: t("복제본 A", "Replica A"), sub: t("1순위", "First choice"), tone: "server", at: [4, 0] },
      { id: "b", label: t("복제본 B", "Replica B"), sub: t("다음 후보", "Next candidate"), tone: "server", at: [5, 0] },
    ],
    edges: [
      { from: "visitor", to: "worker" },
      { from: "worker", to: "gate" },
      { from: "gate", to: "rank", label: t("예", "yes") },
      { from: "gate", to: "core", label: t("아니오", "no") },
      { from: "rank", to: "a" },
      { from: "a", to: "b", style: "dashed", label: t("재시도", "retry") },
    ],
  },
  usage: [
    {
      feature: t("홈·랭킹·검색·작품 상세의 공개 읽기 API", "Public read APIs for Home, Ranking, Search and work details"),
      role: t(
        "고정 경로 12개와 /api/public·/api/titles·/api/authors 아래의 안전한 읽기 요청만 풀의 줄 순서대로 시도합니다.",
        "Only safe reads on 12 fixed paths and under /api/public, /api/titles and /api/authors are tried in the pool's order.",
      ),
      paths: [
        "deploy/cloudflare-static/src/index.ts#orderedReadOrigins",
        "deploy/cloudflare-static/src/index.ts#classifyDynamicRoute",
        "deploy/cloudflare-static/README.md",
      ],
      route: "/",
    },
    {
      feature: t("쓰기·로그인·관리자·실시간 요청", "Write, sign-in, admin and realtime requests"),
      role: t(
        "복수 서버로 재전송하지 않고 한 권위로만 보냅니다. 테스트가 쓰기 503이 복제본 폴백 없이 그대로 나오는지 확인합니다.",
        "They are never resent to several servers and go to one authority. A test confirms a write 503 comes back as it is, with no replica fallback.",
      ),
      paths: ["deploy/cloudflare-static/src/index.test.ts"],
    },
    {
      feature: t("배포 때 풀 설정 검증", "Validating the pool setting at release time"),
      role: t(
        "풀 목록이 HTTPS 형식이고 중복이 없으며 8개 이하인지 배포 스크립트가 검사한 뒤 Worker 변수로 넘깁니다.",
        "The release script checks that the pool list is HTTPS, has no duplicates and has at most 8 entries before passing it to the Worker as a variable.",
      ),
      paths: ["scripts/deploy-cloudflare-static.mjs"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("랑데부 순위와 읽기 전용 재시도", "Rendezvous ranking and read-only retries"),
      language: "ts",
      code: [
        "// 실제 구현은 cyrb53 해시를 쓰지만, 아이디어는 같다(여기서는 FNV-1a)",
        "const score = (key: string, node: string): number => {",
        "  let h = 2166136261;",
        "  for (const ch of `${key}\\0${node}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;",
        "  return h;",
        "};",
        "",
        "// 서버마다 점수를 매겨 높은 순으로 줄 세운다. 한 대가 빠져도 나머지의 상대 순서는 그대로다.",
        "export const rank = (key: string, nodes: readonly string[]): string[] =>",
        "  [...nodes].sort((a, b) => score(key, b) - score(key, a) || a.localeCompare(b));",
        "",
        "const RETRY_STATUSES = new Set([502, 503, 504]);",
        "",
        "export async function safeRead(key: string, nodes: readonly string[], get: (node: string) => Promise<Response>) {",
        "  let last: Response | undefined;",
        "  for (const node of rank(key, nodes)) {",
        "    try {",
        "      last = await get(node);",
        "      if (!RETRY_STATUSES.has(last.status)) return last; // 일시 오류가 아니면 거기서 끝",
        "    } catch {",
        "      // 네트워크 오류도 다음 후보로 넘어간다",
        "    }",
        "  }",
        "  return last ?? new Response(null, { status: 502 });",
        "}",
      ].join("\n"),
      codeEn: [
        "// The real implementation uses a cyrb53 hash; the idea is the same (FNV-1a here)",
        "const score = (key: string, node: string): number => {",
        "  let h = 2166136261;",
        "  for (const ch of `${key}\\0${node}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;",
        "  return h;",
        "};",
        "",
        "// Score every server and sort from the highest. If one leaves, the rest keep their relative order.",
        "export const rank = (key: string, nodes: readonly string[]): string[] =>",
        "  [...nodes].sort((a, b) => score(key, b) - score(key, a) || a.localeCompare(b));",
        "",
        "const RETRY_STATUSES = new Set([502, 503, 504]);",
        "",
        "export async function safeRead(key: string, nodes: readonly string[], get: (node: string) => Promise<Response>) {",
        "  let last: Response | undefined;",
        "  for (const node of rank(key, nodes)) {",
        "    try {",
        "      last = await get(node);",
        "      if (!RETRY_STATUSES.has(last.status)) return last; // not a transient error: done",
        "    } catch {",
        "      // a network error also moves on to the next candidate",
        "    }",
        "  }",
        "  return last ?? new Response(null, { status: 502 });",
        "}",
      ].join("\n"),
      explain: t(
        "safeRead는 읽기 요청에서만 부르는 함수라는 전제가 중요합니다. 쓰기에 이 재시도를 쓰면 같은 일이 두 번 일어날 수 있어, 실제 게이트웨이는 읽기 경로에서만 줄 전체를 돌립니다.",
        "The premise is that safeRead is called only for reads. Using this retry for a write could do the same thing twice, so the real gateway walks the whole line only on read paths.",
      ),
      source: "deploy/cloudflare-static/src/index.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("복제 서버로 보내기 전에 자격증명 지우기", "Stripping credentials before a replica request"),
      language: "ts",
      code: [
        'const CREDENTIAL_PREFIXES = ["x-user-", "x-admin-", "x-csrf-", "x-session-"];',
        "",
        "// 읽기 복제 서버에는 사용자별 권위가 없으므로 인증 정보를 모두 지운다",
        "export function stripCredentials(headers: Headers): Headers {",
        "  const clean = new Headers(headers);",
        '  for (const name of ["authorization", "proxy-authorization", "cookie"]) clean.delete(name);',
        "  for (const name of [...clean.keys()]) {",
        "    if (CREDENTIAL_PREFIXES.some((prefix) => name.startsWith(prefix))) clean.delete(name);",
        "  }",
        "  return clean;",
        "}",
      ].join("\n"),
      codeEn: [
        'const CREDENTIAL_PREFIXES = ["x-user-", "x-admin-", "x-csrf-", "x-session-"];',
        "",
        "// A read replica has no per-user authority, so every credential is removed",
        "export function stripCredentials(headers: Headers): Headers {",
        "  const clean = new Headers(headers);",
        '  for (const name of ["authorization", "proxy-authorization", "cookie"]) clean.delete(name);',
        "  for (const name of [...clean.keys()]) {",
        "    if (CREDENTIAL_PREFIXES.some((prefix) => name.startsWith(prefix))) clean.delete(name);",
        "  }",
        "  return clean;",
        "}",
      ].join("\n"),
      explain: t(
        "복제 서버가 침해되거나 잘못 설정되어도 사용자의 세션이 새지 않게 하는 방어선입니다. 실제 코드는 방문자 IP 헤더도 함께 지우고 복제 서버에는 IP를 전달하지 않습니다.",
        "A line of defense so that a compromised or misconfigured replica cannot leak user sessions. The real code also deletes visitor IP headers and forwards no IP to replicas.",
      ),
      source: "deploy/cloudflare-static/src/index.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "Wikipedia · Rendezvous hashing",
      url: "https://en.wikipedia.org/wiki/Rendezvous_hashing",
      kind: "article",
      note: t("HRW 해싱의 정의와 일관 해싱과의 비교", "Definition of HRW hashing and a comparison with consistent hashing"),
    },
    {
      title: "Cloudflare · Workers fetch handler",
      url: "https://developers.cloudflare.com/workers/runtime-apis/handlers/fetch/",
      kind: "docs",
      note: t("요청을 받아 다른 오리진으로 보내는 진입점", "The entry point that receives a request and forwards it to another origin"),
    },
    {
      title: "MDN · Safe (HTTP methods)",
      url: "https://developer.mozilla.org/en-US/docs/Glossary/Safe/HTTP",
      kind: "docs",
      note: t("재시도해도 되는 '안전한' 메서드의 정의", "What counts as a 'safe' method that may be retried"),
    },
    {
      title: "Cloudflare · HTTP request headers (CF-Ray)",
      url: "https://developers.cloudflare.com/fundamentals/reference/http-headers/",
      kind: "docs",
      note: t("요청 키에 섞이는 cf-ray 식별자", "The cf-ray identifier mixed into the request key"),
    },
  ],
  chapterIds: ["infrastructure", "cost-engineering"],
  talk: {
    pitch: t(
      "읽기는 나눠도 되지만 쓰기는 나누면 안 됩니다. 그래서 로그인 없이 보는 공개 읽기만 최대 8개의 복제 서버에 점수순으로 나누고, 일시 오류가 나면 다음 서버로 넘깁니다. 글쓰기나 결제는 어떤 경우에도 한 서버로만 가고, 복제 서버에는 쿠키나 토큰을 한 줄도 보내지 않습니다. 지금 기본 설정은 Core 한 곳이고, 풀은 필요할 때 켜는 준비 기능입니다.",
      "Reads may be split but writes must not. So only public reads that need no sign-in are spread over up to 8 replicas in score order, moving to the next on a transient error. A write or payment always goes to exactly one server, and not a single cookie or token is sent to a replica. By default there is one Core; the pool is a ready-made option for when it is needed.",
    ),
    analogy: t(
      "도서관 안내 데스크 여러 곳은 '책 위치 묻기'(읽기)를 나눠 받아도 되지만, 대출 장부(쓰기)는 한 곳에서만 적습니다.",
      "Several help desks in a library can share 'where is this book' questions (reads), but the lending ledger (writes) is written at one desk only.",
    ),
    questions: [
      {
        question: t("왜 라운드로빈이 아닌가요?", "Why not round-robin?"),
        answer: t(
          "Worker는 요청 사이에 상태가 없어 순번을 기억할 곳이 없습니다. 해시 점수는 상태 없이 순서를 정하고, 재시도 순서도 결정적입니다.",
          "A Worker keeps no state between requests, so there is nowhere to remember a turn counter. Hash scores decide the order without state, and the retry order is deterministic too.",
        ),
      },
      {
        question: t("복제 서버의 DB는 어떻게 나누나요?", "How is the database behind the replicas split?"),
        answer: t(
          "이 카드는 HTTP 읽기 풀만 다룹니다. DB 분산은 연합 무료 데이터 플레인 카드에서 다루며 그쪽도 기본 비활성 후보 계획입니다.",
          "This card covers only the HTTP read pool. Splitting databases belongs to the federated free data plane card, which is also an off-by-default candidate plan.",
        ),
      },
      {
        question: t("서버가 둘 다 죽으면요?", "What if every replica is down?"),
        answer: t(
          "재시도는 줄에 다음 서버가 남아 있을 때만 합니다. 마지막 서버가 502·503·504를 내면 그 응답이 그대로 전달되고, Worker 자신의 오류(502, CORE_API_UPSTREAM_FAILED)는 모든 시도가 예외로 끝났을 때만 나옵니다. 읽기 요청이라도 헬스·설정·관리자 경로는 풀에 넣지 않고 Core가 직접 받습니다.",
          "A retry happens only while another server remains in the line. If the last server returns 502, 503 or 504 that response is passed through as is, and the Worker's own error (502, CORE_API_UPSTREAM_FAILED) appears only when every attempt ended in an exception. Even among reads, health, config and admin paths stay out of the pool and are served by Core directly.",
        ),
      },
    ],
    pitfall: t(
      "'구현과 시험은 있으나 운영에서 풀을 쓰는지는 확인하지 못했다'가 정확한 상태입니다. 같은 폴더의 federated-gateway.ts(정적 읽기 모델 폴백)는 wrangler의 진입점이 아니라 시험에서만 불러오는 실험 코드입니다. 'cf-ray' 때문에 같은 주소가 항상 같은 서버로 가는 것도 아닙니다.",
      "The accurate state is 'implemented and tested, but whether production uses the pool was not confirmed'. federated-gateway.ts in the same folder (a static read-model fallback) is experimental code imported only by tests, not the wrangler entry point. And because of cf-ray, the same URL does not always go to the same server.",
    ),
  },
  technologies: ["Cloudflare Workers", "Rendezvous hashing", "Cloudflare", "Render"],
  facts: [
    {
      value: "8",
      label: t("공개 읽기 풀의 최대 오리진 수", "Maximum origins in the public read pool"),
      source: "deploy/cloudflare-static/src/index.ts",
    },
    {
      value: "502 · 503 · 504",
      label: t("다음 서버로 재시도하는 응답 상태", "Statuses that trigger a retry on the next server"),
      source: "deploy/cloudflare-static/src/index.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

export const PLATFORM_OPS_TRUST_CARDS: readonly EngineeringAtlasEntry[] = [
  EDGE_ORIGIN_AUTH_TRUSTED_PROXY,
  READ_REPLICA_HRW_POOL,
];
