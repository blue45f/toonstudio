import { t } from "./engineering-glossary-more-kit";

import type { GlossaryTerm } from "./engineering-glossary-content";

/** 확장 용어집 · 저장 · 백엔드 · 보안. 작품이 안전하게 남고 오가는 방법. */
export const GLOSSARY_MORE_DATA: readonly GlossaryTerm[] = [
  {
    id: "data-authority-ledger",
    category: "data",
    term: t("원장 (데이터 권위)", "Ledger (data authority)"),
    definition: t(
      "같은 정보가 여러 곳에 있을 때 ‘진짜는 여기 하나’라고 정해 둔 곳입니다. 다른 사본은 이곳을 따라가며, 어긋나면 이곳이 이깁니다.",
      "The one place declared the truth when the same information lives in several places; other copies follow it, and where they disagree, it wins.",
    ),
    analogy: t(
      "은행의 통장 정리와 같습니다. 영수증이나 앱 화면이 달라도 은행 원장에 적힌 잔액이 정답입니다.",
      "Like a bank statement: whatever the receipt or app screen says, the balance in the bank's ledger is the answer.",
    ),
    inToonstudio: t(
      "데이터마다 권위를 하나로 둡니다. 계정·세션·작품·커뮤니티·결제 같은 동적 제품 데이터의 영속 원장은 Supabase PostgreSQL이고 Neon은 legacy로 보존합니다. 접속 상태·화면 공유 신호는 Cloudflare Durable Objects, 개인 창작 원본은 OPFS·로컬·BYOS가 사용자 쪽 권위입니다(docs/operations/canonical-database-topology.md).",
      "Each kind of data has one authority. The persistent ledger for dynamic product data, such as accounts, sessions, works, community and commerce, is Supabase PostgreSQL, with Neon kept as legacy. Presence and screen-share signals live in Cloudflare Durable Objects, and personal creative originals sit with the user in OPFS, local storage or BYOS (docs/operations/canonical-database-topology.md).",
    ),
    chapters: ["infrastructure", "storage-migration"],
    atlasIds: ["supabase-single-writer-authority", "federated-free-data-plane"],
  },
  {
    id: "idempotency-key",
    category: "data",
    term: t("멱등 키 (Idempotency-Key)", "Idempotency key"),
    definition: t(
      "같은 요청이 두 번 도착해도 한 번만 처리되게 하는 고유 표식입니다. 네트워크가 흔들려 다시 보내도 이중 결제나 이중 실행이 없습니다.",
      "A unique marker that makes a request count once even if it arrives twice, so a retry after a network hiccup causes no double charge or double run.",
    ),
    analogy: t(
      "식당 주문서의 번호와 같습니다. 같은 번호의 주문이 두 번 들어오면 주방은 한 번만 만듭니다.",
      "Like the number on an order slip: if the same number arrives twice, the kitchen cooks it once.",
    ),
    inToonstudio: t(
      "AI 호출은 Idempotency-Key(ASCII 16~128자) 헤더를 받습니다. 저장소에는 원본 키가 아니라 SHA-256(사용자 ID + 키)만 남기고(studio-ai-admission.ts), 같은 요청의 영수증은 30분 보관해 모호한 실패 뒤에도 이중 실행을 막습니다(studio-ai-idempotency.ts). 결제 어댑터(supporter-toss.provider.ts)도 같은 헤더를 씁니다.",
      "AI calls take an Idempotency-Key header (16-128 ASCII characters). The store keeps only SHA-256(user ID + key), not the raw key (studio-ai-admission.ts), and a request receipt is kept for 30 minutes so even an ambiguous failure cannot cause a double run (studio-ai-idempotency.ts). The payment adapter (supporter-toss.provider.ts) sends the same header.",
    ),
    chapters: ["free-ai-routing", "cost-engineering"],
    atlasIds: ["ambiguous-failure-no-retry", "payment-idempotency-webhook-reconcile", "external-writes-uncertain-receipts"],
  },
  {
    id: "advisory-lock",
    category: "data",
    term: t("advisory lock (PostgreSQL 자문 잠금)", "Advisory lock (PostgreSQL)"),
    definition: t(
      "PostgreSQL 이 이름이나 번호에 거는 ‘잠깐 내가 쓰는 중’ 표지입니다. 표를 잠그지 않고 코드 규칙으로 한 번에 한 작업만 하게 만듭니다.",
      "A PostgreSQL ‘I am using this for a moment’ marker placed on a name or number; it keeps work to one task at a time by convention, without locking tables.",
    ),
    analogy: t(
      "화장실 문고리의 ‘사용 중’ 표지와 같습니다. 문 자체를 못 열게 하는 건 아니지만 모두가 표지를 지키면 부딪히지 않습니다.",
      "Like the ‘occupied’ sign on a restroom door: it does not physically block the door, but if everyone respects it nobody collides.",
    ),
    inToonstudio: t(
      "작품 단위로 직렬화가 필요한 곳에 pg_advisory_xact_lock 을 씁니다. 실시간 락 저장소는 작품별 잠금 안에서 revision 시계를 1씩 올리며 한 번에 하나만 판정하고(studio-live-lock.repository.ts), AI 입장 판정·3D 생성 접수도 사용자나 이름 해시로 잠가 이중 접수를 막습니다. 트랜잭션이 끝나면 자동으로 풀립니다(xact).",
      "pg_advisory_xact_lock serializes work wherever a per-work or per-user ordering is needed. The realtime lock repository bumps a revision clock by 1 and judges one request at a time inside a per-work lock (studio-live-lock.repository.ts); AI admission and 3D generation intake lock by user or name hash to block double intake. It releases automatically when the transaction ends (xact).",
    ),
    chapters: ["collaborative-crdt-boundary", "infrastructure"],
    atlasIds: ["crdt-lock-revision"],
  },
  {
    id: "hmac",
    category: "data",
    term: t("HMAC (비밀키 서명)", "HMAC (keyed signature)"),
    definition: t(
      "비밀키를 아는 쪽만 만들 수 있는 짧은 도장입니다. 내용이 바뀌었거나 남이 만든 것이면 도장이 맞지 않아 바로 알 수 있습니다.",
      "A short stamp that only someone holding the secret key can produce; if the content changed or someone else made it, the stamp no longer matches.",
    ),
    analogy: t(
      "비밀 인장 반지로 찍은 밀랍 봉인과 같습니다. 반지를 가진 사람만 같은 문양을 찍을 수 있어, 뜯어 고치면 티가 납니다.",
      "Like a wax seal pressed with a secret signet ring: only the ring's owner can reproduce the pattern, so tampering shows.",
    ),
    inToonstudio: t(
      "세션 서명은 HMAC-SHA256(base64url)이고 비교는 항상 상수 시간 함수 timingSafeEqual 로 합니다(apps/api/src/server/session.ts). 작업실 입장권(60초)과 실시간 서버 티켓도 서명 토큰입니다. 화면 공유용 coturn 자격은 표준이 요구하는 HMAC-SHA1 로 만들고, 개인 작품·사용자 식별은 SHA-256 계열을 씁니다.",
      "Session signatures are HMAC-SHA256 (base64url) and are always compared with the constant-time timingSafeEqual (apps/api/src/server/session.ts). The 60-second studio admission ticket and realtime-server tickets are signed tokens too. Screen-share coturn credentials use HMAC-SHA1 because that standard requires it, while private work and user identity use the SHA-256 family.",
    ),
    chapters: ["authentication", "turn-credential-issuance"],
    atlasIds: ["socket-io-room-tickets"],
  },
  {
    id: "csrf",
    category: "data",
    term: t("CSRF (교차 사이트 요청 위조) 방어", "CSRF (cross-site request forgery) defence"),
    definition: t(
      "다른 사이트가 사용자의 로그인 상태를 몰래 이용해 요청을 대신 보내는 공격이고, 요청이 우리 화면에서 왔는지 확인해 막습니다.",
      "An attack where another site quietly reuses your logged-in state to send requests on your behalf; defended by checking that a request really came from our own page.",
    ),
    analogy: t(
      "은행 창구에서 ‘본인이 직접 쓴 서명인지’ 확인하는 것과 같습니다. 열쇠(쿠키)만 들고 왔다고 아무 요청이나 받아 주지 않습니다.",
      "Like a bank teller checking the signature was written by you: carrying the key (the cookie) alone does not get any request accepted.",
    ),
    inToonstudio: t(
      "상태를 바꾸는 요청은 공용 HTTP 계층(csrf-middleware)에서 검사합니다. 계약 패키지의 CSRF 헤더 값을 요구하고 Origin 이 같은 출처이거나 허용 목록일 때만 통과시킵니다. 공유 링크 요청은 Origin 이 없어도 Sec-Fetch-Site: same-origin 메타데이터가 맞을 때만 받습니다(pinned-share-request.ts).",
      "State-changing requests are checked in the shared HTTP layer (csrf-middleware): the CSRF header value from the contracts package is required, and the Origin must be same-origin or allowlisted. A shared-link request without an Origin is accepted only when Sec-Fetch-Site: same-origin metadata matches (pinned-share-request.ts).",
    ),
    chapters: ["authentication", "oauth"],
    atlasIds: ["session-token-csrf-oauth-cookie"],
  },
  {
    id: "session-version",
    category: "data",
    term: t("세션 버전 (한 번에 전부 로그아웃)", "Session version (sign everyone out at once)"),
    definition: t(
      "사용자 기록에 번호를 하나 두고 로그인 세션에 그 번호를 새겨, 번호를 올리면 이전 세션이 모두 무효가 되게 하는 방식입니다.",
      "A number on the user record that is stamped into each login session, so raising it invalidates every earlier session at once.",
    ),
    analogy: t(
      "호텔 방 열쇠의 세대 번호와 같습니다. 보안이 걱정되면 번호를 올려 예전 열쇠를 전부 쓸모없게 만듭니다.",
      "Like the generation number on hotel room keys: if security is a worry, bump the number and every old key stops working.",
    ),
    inToonstudio: t(
      "user.sessionVersion 을 세션에 담고 요청마다 DB 값과 맞는지 비교합니다(auth.controller.ts). 운영자의 ‘모든 세션 무효화’ 기능은 이 값을 전원 1씩 올립니다(admin-metrics.service.ts 의 revokeAllSessions). 토큰을 하나씩 찾아 지우지 않아도 한 번의 UPDATE 로 끝나는 것이 이유입니다.",
      "user.sessionVersion is carried in the session and compared with the database value on each request (auth.controller.ts). The operator action ‘revoke all sessions’ raises everyone's value by 1 (revokeAllSessions in admin-metrics.service.ts). The reason: a single UPDATE finishes the job without hunting down tokens one by one.",
    ),
    chapters: ["authentication", "social-identity-lifecycle"],
    atlasIds: ["session-token-csrf-oauth-cookie"],
  },
  {
    id: "weighted-rendezvous-hashing",
    category: "data",
    term: t("HRW (랑데부) 해시 라우팅", "HRW (rendezvous) hash routing"),
    definition: t(
      "같은 키는 늘 같은 서버로 가고, 서버가 늘거나 줄어도 옮겨 가는 키가 최소가 되도록 대상을 고르는 해시 방식입니다. 가중치를 줄 수도 있습니다.",
      "A hash method that sends the same key to the same server every time and, when servers come or go, moves as few keys as possible; weights can be added.",
    ),
    analogy: t(
      "단골 손님마다 ‘담당 직원’을 정해 두는 것과 같습니다. 직원이 한 명 빠져도 그 손님들만 다른 직원에게 갈 뿐, 모든 손님이 자리를 바꾸지 않습니다.",
      "Like assigning each regular customer a personal clerk: if one clerk leaves, only those customers move, and everyone else keeps their seat.",
    ),
    inToonstudio: t(
      "연합 데이터 평면의 라우터(platform/federated-data-plane/federated-data-plane-routing.ts)는 정책에서 trafficDistribution 이 ‘weighted-rendezvous’ 인 경로에 routingKey 가 없으면 계획 자체를 거부합니다(POLICY_INVALID). 후보 샤드의 한도 스냅샷을 읽어 쓸 수 있는 대상만 고르며, 읽기 복제본 분산에 쓰도록 설계됐습니다. 운영 활성 범위는 코드로 확인하지 못했습니다(미확인).",
      "The federated data-plane router (platform/federated-data-plane/federated-data-plane-routing.ts) rejects a plan with POLICY_INVALID when a route's policy says trafficDistribution is ‘weighted-rendezvous’ but no routingKey is given. It reads quota snapshots of candidate shards and picks only usable targets, designed for spreading reads over replicas. How far it is active in production could not be confirmed from code (unconfirmed).",
    ),
    chapters: ["free-first-infra", "infrastructure"],
    atlasIds: ["read-replica-hrw-pool", "federated-free-data-plane"],
  },
  {
    id: "migration-checksum-ledger",
    category: "data",
    term: t("마이그레이션 체크섬 (배포 전용 장부)", "Migration checksum (deployment-only ledger)"),
    definition: t(
      "DB 구조를 바꾸는 변경 파일마다 지문(체크섬)을 장부에 남겨, 검토된 파일과 실제 적용된 파일이 같은지 확인하고 애매하면 멈추는 방식입니다.",
      "Recording a fingerprint (checksum) for each schema-change file in a ledger so reviewed and applied files can be compared, and stopping when things are ambiguous.",
    ),
    analogy: t(
      "공사 승인 도면에 도장을 찍어 두는 것과 같습니다. 현장에서 쓴 도면이 승인 도면과 한 줄이라도 다르면 공사를 멈춥니다.",
      "Like stamping approved construction drawings: if the drawing used on site differs by a single line from the approved one, work stops.",
    ),
    inToonstudio: t(
      "toonspectrum_ops.deployment_migration 표에 파일 id, 64자리 16진 checksum, 상태(applying/applied/failed), releaseSha 를 기록합니다(0023_production_migration_ledger.sql). 제품 런타임은 이 스키마에 쓰지 못하고, 승인된 마이그레이션 러너만 쓰며 중단되거나 모호한 적용 뒤에는 닫힌 채 멈춥니다(fail closed).",
      "The table toonspectrum_ops.deployment_migration records the file id, a 64-hex checksum, a state (applying/applied/failed) and the releaseSha (0023_production_migration_ledger.sql). Product runtimes cannot write to this schema; only the approved migration runner can, and after an interrupted or ambiguous apply it stops and stays closed (fail closed).",
    ),
    chapters: ["infrastructure", "troubleshooting-evidence"],
    atlasIds: ["checksum-migration-ledger"],
  },
  {
    id: "cas-cid",
    category: "data",
    term: t("내용 주소 (CAS · CID)", "Content addressing (CAS · CID)"),
    definition: t(
      "파일의 위치가 아니라 내용의 해시를 주소로 쓰는 방식입니다. 내용이 한 비트라도 바뀌면 주소가 바뀌므로, 받은 파일이 맞는지 스스로 검증됩니다.",
      "Using the hash of a file's content as its address instead of its location; change one bit and the address changes, so a download can verify itself.",
    ),
    analogy: t(
      "책 표지의 제목 대신 책 전체의 지문을 이름으로 쓰는 도서관과 같습니다. 같은 지문이면 같은 책이고, 한 글자라도 다르면 다른 책입니다.",
      "Like a library that names books by a fingerprint of the whole text instead of the title: same fingerprint, same book; one changed letter, a different book.",
    ),
    inToonstudio: t(
      "IPFS CID 도구(domains/integrations/ipfs-content-address.ts)는 multiformats 로 raw 코덱(0x55) 단일 블록 CID 를 만들고, 공개 게이트웨이에서 받은 바이트를 CID 해시와 직접 대조합니다. @helia/verified-fetch 는 쓰지 않습니다. 월드 발행 정보도 SHA-256 contentHash 로 브라우저가 다시 확인합니다. 큰 파일을 쪼갠 dag-pb CID 와는 주소가 서로 호환되지 않습니다.",
      "The IPFS CID tool (domains/integrations/ipfs-content-address.ts) builds raw-codec (0x55) single-block CIDs with multiformats and compares bytes fetched from a public gateway against the CID hash directly. @helia/verified-fetch is not used. World publications are likewise re-verified by the browser through a SHA-256 contentHash. A CID for a large file split into dag-pb blocks has a different, incompatible address.",
    ),
    chapters: ["content-addressing", "virtual-studio-world-authority"],
    atlasIds: ["world-authority-cas-projection"],
  },
  {
    id: "rate-limit",
    category: "data",
    term: t("레이트 리밋 (요청 횟수 제한)", "Rate limiting"),
    definition: t(
      "일정 시간 안에 한 사용자나 주소가 보낼 수 있는 요청 수를 제한해, 남용과 과부하로부터 서비스를 지키는 장치입니다.",
      "A cap on how many requests one user or address may send within a time window, protecting the service from abuse and overload.",
    ),
    analogy: t(
      "놀이공원의 ‘한 번에 한 번만 탑승’ 줄과 같습니다. 인기 놀이기구를 한 사람이 계속 타지 못하게 해 모두에게 순서가 돌아갑니다.",
      "Like a ride's ‘one go per visit’ queue rule: nobody can hog the popular ride, so everyone gets a turn.",
    ),
    inToonstudio: t(
      "공유 링크 요청은 주소와 접근 키를 SHA-256 으로 가린 키로 60초 창에서 읽기 120·이미지 40·댓글 20회까지 받습니다(pinned-share-request.ts, LocalAuthRateLimiter). 이 제한기는 서버 한 대 안(프로세스 로컬)의 보조 장치이고, 영속 할당량은 PostgreSQL 에서 강제하며 여러 대에 걸친 제한은 Upstash 조정 계약에 속합니다.",
      "Shared-link requests allow 120 reads, 40 image loads and 20 comments per 60-second window, keyed by SHA-256 of the address and access key (pinned-share-request.ts, LocalAuthRateLimiter). This limiter is a process-local helper; durable quotas are enforced in PostgreSQL, and cross-instance limits belong to the Upstash coordination contract.",
    ),
    chapters: ["authentication", "free-first-infra"],
  },
  {
    id: "circuit-breaker",
    category: "data",
    term: t("서킷 브레이커 (연속 실패 차단기)", "Circuit breaker"),
    definition: t(
      "외부 서비스가 연속으로 실패하면 한동안 호출을 아예 끊어 두고, 잠시 뒤 다시 시험해 보는 안전장치입니다. 고장 난 곳을 계속 두드리지 않습니다.",
      "A safeguard that stops calling an external service for a while after repeated failures and tries again later, instead of hammering a broken thing.",
    ),
    analogy: t(
      "집 분전반의 차단기와 같습니다. 합선이 반복되면 전기를 끊고, 원인이 풀린 뒤에 다시 올립니다.",
      "Like the breaker in a fuse box: repeated shorts cut the power, and it is switched back on once the cause is cleared.",
    ),
    inToonstudio: t(
      "운세 보강 공급자(modules/fortune/fortune-enrichment.service.ts)는 연속 실패 3회에 60초 쿨다운(failureThreshold 3, cooldownMs 60000)을 조정 포트에 기록하고, 호출 한도는 2.5초입니다. 이 보강은 선택 기능이라 실패해도 본 기능이 멈추지 않습니다. 상태 저장 위치가 모듈마다 달라 ‘설정됨’ 단계입니다.",
      "The fortune enrichment provider (modules/fortune/fortune-enrichment.service.ts) records 3 consecutive failures and a 60-second cooldown (failureThreshold 3, cooldownMs 60000) on a coordination port, with a 2.5-second call limit. The enrichment is optional, so failure never stops the main feature. State lives in different places per module, so its status is ‘configured’.",
    ),
    chapters: ["open-api-data", "troubleshooting-evidence"],
    atlasIds: ["circuit-breaker-and-cooldown"],
  },
  {
    id: "ssrf-dns-pinning",
    category: "data",
    term: t("SSRF 방어와 DNS 핀닝", "SSRF defence and DNS pinning"),
    definition: t(
      "서버가 사용자가 준 주소로 접속할 때, 그 주소가 내부망을 가리키도록 속이는 공격(SSRF)을 막는 방어입니다. 검사한 바로 그 IP 로만 연결하는 것이 DNS 핀닝입니다.",
      "A defence for servers that fetch user-supplied URLs against tricks that aim them at internal networks (SSRF); DNS pinning connects only to the exact IP that was checked.",
    ),
    analogy: t(
      "택배 기사가 주소를 확인한 뒤 같은 건물에만 배달하는 것과 같습니다. 확인할 때와 배달할 때 주소가 바뀌는 속임수를 막습니다.",
      "Like a courier who checks the address and then delivers only to that very building, blocking the trick of swapping the address between checking and delivery.",
    ),
    inToonstudio: t(
      "웹훅 목적지는 https·443·계정정보/쿼리 없음만 허용하고(parsePublicWebhookDestination), DNS 응답 전체(최대 64개)가 공개 주소일 때만 통과시킵니다(resolvePublicOutboundAddress). 연결은 검사한 IP 로 고정합니다(pinnedPublicLookup). 사설·루프백·링크로컬 대역은 BlockList 로 막습니다(platform/adapters/network/public-endpoint.ts). 같은 방어를 3곳에서 따로 구현했습니다.",
      "Webhook destinations must be https on 443 with no credentials or query (parsePublicWebhookDestination), and pass only if every DNS answer (up to 64) is a public address (resolvePublicOutboundAddress). The connection is pinned to the checked IP (pinnedPublicLookup), and private, loopback and link-local ranges are blocked with a BlockList (platform/adapters/network/public-endpoint.ts). The same defence is implemented separately in three places.",
    ),
    chapters: ["open-api-data", "open-api-adapter"],
    atlasIds: ["ssrf-allowlist-dns-pinning"],
  },
  {
    id: "kill-switch",
    category: "data",
    term: t("킬 스위치 (긴급 차단 스위치)", "Kill switch"),
    definition: t(
      "문제가 생겼을 때 코드를 다시 배포하지 않고 설정 값 하나로 기능을 즉시 끄는 비상 스위치입니다.",
      "An emergency switch that turns a feature off instantly through one setting, without redeploying code.",
    ),
    analogy: t(
      "가스 밸브와 같습니다. 어디선가 가스가 샌다는 걸 알면 배관을 뜯기 전에 먼저 밸브부터 잠급니다.",
      "Like a gas shut-off valve: when you smell a leak you close the valve first, before tearing into the pipes.",
    ),
    inToonstudio: t(
      "표지 이미지 중계는 COVER_IMAGE_POLICY 가 ‘off’ 면 404 로 응답하며 꺼집니다(apps/api/src/config/env.ts, catalog.controller.ts). 서비스 워커에는 kill 메시지(killStudioServiceWorker)가 있어 문제가 생긴 캐시를 앱이 가진 접두사로 모두 찾아 지웁니다. 둘 다 코드 수정 없이 켜고 끄는 안전 경로입니다.",
      "The cover-image proxy turns off with a 404 when COVER_IMAGE_POLICY is ‘off’ (apps/api/src/config/env.ts, catalog.controller.ts). The Service Worker has a kill message (killStudioServiceWorker) that finds and clears every cache the app owns by its shared prefix. Both are safe paths to switch things on and off without editing code.",
    ),
    chapters: ["pwa-safe-update", "troubleshooting-runbook"],
    atlasIds: ["cover-image-proxy-killswitch", "user-approved-update-kill-switch"],
  },
  {
    id: "manual-sha-release",
    category: "data",
    term: t("수동 SHA 배포 게이트", "Manual SHA release gate"),
    definition: t(
      "사람이 승인한 커밋 번호(40자리 SHA) 하나만 운영에 올리고, 그 외에는 배포 명령 자체가 실패하게 만든 장치입니다.",
      "A gate where only one human-approved commit (a 40-character SHA) can reach production; any other state makes the deploy command itself fail.",
    ),
    analogy: t(
      "비행기 이륙 전 체크리스트와 같습니다. 항목이 하나라도 안 맞으면 활주로에 들어가기 전에 멈춥니다.",
      "Like a pre-flight checklist: if a single item is off, the plane stops before entering the runway.",
    ),
    inToonstudio: t(
      "scripts/deploy-cloudflare-static.mjs 는 승인 문구(TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL), 소문자 16진 40자리 TOONSPECTRUM_APPROVED_MAIN_SHA, main 브랜치, 깨끗한 작업 트리, HEAD 가 승인 SHA 와 같음을 모두 요구합니다. PR 병합은 배포 승인이 아니며, 원격 자동 빌드와 자동 재배포는 쓰지 않습니다(AGENTS.md §8).",
      "scripts/deploy-cloudflare-static.mjs requires the approval phrase (TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL), a lowercase 40-hex TOONSPECTRUM_APPROVED_MAIN_SHA, the main branch, a clean worktree and HEAD equal to the approved SHA. Merging a PR is not deploy approval, and no automatic remote builds or redeploys are used (AGENTS.md section 8).",
    ),
    chapters: ["delivery", "free-first-infra"],
    atlasIds: ["manual-sha-release-gate"],
  },
  {
    id: "health-live-ready",
    category: "data",
    term: t("헬스 체크 (live · ready · capabilities)", "Health checks (live, ready, capabilities)"),
    definition: t(
      "서버가 살아 있는지(live), 일할 준비가 됐는지(ready), 기능별로 어디까지 되는지(capabilities)를 따로 알려 주는 점검 주소 세 개입니다.",
      "Three check endpoints that separately report whether the server is alive (live), ready to work (ready) and which features currently work (capabilities).",
    ),
    analogy: t(
      "식당 입구의 ‘영업 중’ 간판(live), 주방이 재료를 다 갖췄는지 확인(ready), 오늘 가능한 메뉴판(capabilities)과 같습니다.",
      "Like a restaurant's ‘open’ sign (live), the kitchen's check that ingredients are in (ready) and today's available-menu board (capabilities).",
    ),
    inToonstudio: t(
      "HealthController 가 GET live / capabilities / ready 를 따로 제공합니다(apps/api/src/modules/health/health.controller.ts). live 는 DB 를 깨우지 않아 무료 DB 를 불필요하게 깨우지 않고, ready 는 배포 점검에서 필수 릴레이션을 확인하며, capabilities 가 기능별 상태를 말해 화면의 ‘일부 기능 지연’ 배너(ServiceDegradedBanner)가 이를 읽습니다.",
      "HealthController serves GET live, capabilities and ready separately (apps/api/src/modules/health/health.controller.ts). live does not wake the database, so a free-tier database is not woken needlessly; ready checks required relations during deploy verification; capabilities reports per-feature state, which the ‘some features delayed’ banner (ServiceDegradedBanner) reads.",
    ),
    chapters: ["infrastructure", "troubleshooting-runbook"],
    atlasIds: ["health-live-ready-capabilities"],
  },
];
