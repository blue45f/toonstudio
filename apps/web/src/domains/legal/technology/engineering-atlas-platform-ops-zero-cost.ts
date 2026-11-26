import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · platform-ops · ₩0 무료 인프라 4-Lane 목적별 엣지 API 분산 & 5계층 저장소 연합 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_PLATFORM_OPS_ZERO_COST: readonly EngineeringAtlasEntry[] = [
  {
    id: "zero-cost-4lane-edge-5tier-storage",
    category: "platform-ops",
    name: "4-Lane Edge API & 5-Tier ₩0 Storage",
    title: t("목적별 4-Lane 엣지 분산과 5계층 ₩0 저장소 연합", "Purpose-based 4-Lane edge routing & 5-tier ₩0 storage"),
    status: "configured",
    tagline: t(
      "Singleflight 엣지 캐시·9단 무료 AI·DO/P2P·서울 onpod 4개 레인과 5계층 무료 저장소로 ₩0 구조를 지킵니다.",
      "Splits traffic into four edge/origin lanes with Singleflight coalescing and five ₩0 storage tiers.",
    ),
    background: [
      t(
        "모든 트래픽을 단일 백엔드 서버로 몰면 무료 인프라 한도가 읽기 폭주 한 번에 소진됩니다. deploy/cloudflare-static/edge-api-lane-router.mjs 와 edge-cache-coalescer.mjs 는 요청을 목적별 4-Lane 으로 분리합니다. ① 공개 읽기(edge-public-read)는 엣지 캐시 실드와 Singleflight(동시 N건 미스를 원점 1회 호출로 병합) + SWR 로 막고, 인증·쿠키·변경 요청은 fail-closed 로 공유 캐시를 우회합니다.",
        "Funneling every request into one origin burns free-tier limits on a single read spike. deploy/cloudflare-static/edge-api-lane-router.mjs and edge-cache-coalescer.mjs split traffic into four lanes: (1) edge-public-read shields public GET/HEAD with Singleflight coalescing (N concurrent misses → 1 origin fetch) and SWR, bypassing shared cache fail-closed whenever auth, cookies or mutations appear.",
      ),
      t(
        "② 무료 AI 레인(edge-ai-assist)은 브라우저 온디바이스 0-토큰 선행 라우터(ondevice-zero-token-router.ts)와 서버 9단 무료 AI 카탈로그(studio-free-ai-provider-catalog.ts)로 유료 전환 없이 분산합니다. ③ 실시간 레인(realtime-do)은 Cloudflare Durable Objects/D1 과 STUN 전용 P2P WebRTC(중계 과금 없음)로 처리하고, ④ 서울 onpod 코어(core-stateful-onpod)는 인증·결제·원고 메타데이터 같은 상태 변경만 private, no-store 로 담당합니다.",
        "(2) edge-ai-assist combines the browser on-device zero-token router (ondevice-zero-token-router.ts) with the 9-pool free AI catalog (studio-free-ai-provider-catalog.ts) without paid auto-upgrade. (3) realtime-do handles live presence via Cloudflare Durable Objects/D1 and STUN-only WebRTC P2P, while (4) core-stateful-onpod handles auth, billing and stateful mutations as private, no-store.",
      ),
      t(
        "데이터 저장소도 역할을 5계층 ₩0 연합으로 쪼갭니다. ① 무거운 캔버스 원고·타일은 기기 로컬 OPFS(SQLite WASM + 64비트 타일 매퍼)가 쥐고, ② 사용자 장기 백업은 개인 클라우드(BYO Google Drive 등), ③ 공용 대용량 정적 미디어는 Cloudflare R2 무료 10GB, ④ 경량 메타·인증·실시간 상태는 서울 onpod PostgreSQL + Cloudflare D1, ⑤ 해시된 앱 번들과 .wasm 은 Cloudflare Static Assets 가 담당합니다.",
        "Storage is federated across five zero-cost tiers: (1) heavy manuscripts and tiles stay in local OPFS (SQLite WASM + 64-bit tile mapper), (2) user backups go to BYO Cloud (e.g. Google Drive), (3) shared static media rides Cloudflare R2's 10 GB free tier, (4) lightweight metadata and auth live on Seoul onpod PostgreSQL + D1, and (5) hashed bundles and .wasm ship from Cloudflare Static Assets.",
      ),
      t(
        "현재 구현(Current)과 운영 활성화(Target)를 구분합니다. 4-Lane 라우터·Singleflight 병합기·9단 무료 AI 카탈로그·온디바이스 0-토큰 라우터·5계층 로컬/정적 모듈은 코드와 테스트로 검증됐습니다(2026-11-26). 다만 운영 엣지 워커 반영과 공급자별 무료 키 활성화는 수동 SHA 배포 및 배포 환경 설정 절차를 거친 뒤 효력이 생깁니다.",
        "Current vs Target: the 4-Lane router, Singleflight coalescer, 9-pool free AI catalog, on-device zero-token router and local/static tiers are implemented and tested (2026-11-26). Production edge rollout and live provider keys take effect only after manual SHA deployment and environment configuration.",
      ),
    ],
    keyPoints: [
      t("4-Lane 분리: 공개 읽기 · 무료 AI · 실시간 DO/P2P · 서울 onpod", "4 lanes: public read, free AI, realtime DO/P2P, Seoul onpod"),
      t("Singleflight 로 동시 N건 공개 캐시 미스를 원점 1회로 병합", "Singleflight merges N concurrent public misses into 1 fetch"),
      t("인증·쿠키·변경 요청은 fail-closed 로 공유 캐시 완전 우회", "Auth, cookie & mutation traffic bypasses cache fail-closed"),
      t("5계층 ₩0 저장소: OPFS · BYO · R2(10GB) · onpod+D1 · Static", "5-tier ₩0 storage: OPFS, BYO, R2 10GB, onpod+D1, Static"),
    ],
    diagram: {
      id: "zero-cost-4lane-edge-5tier-storage-diagram",
      kind: "layers",
      title: t("4-Lane 목적별 API 분산과 5계층 ₩0 저장소 계층", "4-Lane API routing and 5-tier ₩0 storage federation"),
      caption: t(
        "트래픽 성격과 파일 무게에 따라 엣지·로컬·무료 저장소로 나누어 서울 원점 부하를 최소화합니다.",
        "Routes each workload and byte size to edge, local or free-tier storage so the Seoul origin stays lean.",
      ),
      alt: t(
        "위에서부터 1번 공개 읽기 레인은 Singleflight 와 SWR 엣지 캐시, 2번 무료 AI 레인은 온디바이스 0-토큰 라우터와 9단 무료 AI 풀, 3번 실시간 레인은 Durable Objects 와 STUN P2P, 4번 상태 코어는 서울 onpod API 와 PostgreSQL 이 맡습니다. 아래 5계층 저장소는 로컬 OPFS, BYO 클라우드, R2 10GB, onpod+D1, Static Assets 로 나뉩니다.",
        "From top to bottom: Lane 1 public reads use Singleflight + SWR edge cache; Lane 2 free AI pairs an on-device zero-token router with a 9-pool free cascade; Lane 3 realtime uses Durable Objects and STUN P2P; Lane 4 stateful core runs on Seoul onpod + PostgreSQL, paired with five zero-cost storage tiers (OPFS, BYO, R2 10 GB, onpod+D1, Static Assets).",
      ),
      layers: [
        {
          id: "lane-read",
          label: t("Lane 1 · 공개 읽기 실드", "Lane 1 · Public read shield"),
          sub: t("Singleflight(N→1 병합) + SWR · 인증 헤더 시 fail-closed 우회", "Singleflight (N→1) + SWR; fail-closed auth bypass"),
          tone: "edge",
          chips: ["edge-public-read", "Singleflight", "SWR"],
        },
        {
          id: "lane-ai",
          label: t("Lane 2 · ₩0 AI 보조", "Lane 2 · ₩0 AI assist"),
          sub: t("온디바이스 0-토큰 선행 → 9단 무료 AI 풀 (90% 안전 차단)", "On-device 0-token first → 9-pool free cascade"),
          tone: "ai",
          chips: ["edge-ai-assist", "9-Pool Free AI", "ONNX Local"],
        },
        {
          id: "lane-rt",
          label: t("Lane 3 · 실시간 협업", "Lane 3 · Realtime collab"),
          sub: t("Cloudflare DO/D1 시그널링 + STUN 전용 P2P WebRTC", "Cloudflare DO/D1 signaling + STUN-only P2P WebRTC"),
          tone: "edge",
          chips: ["realtime-do", "Durable Objects", "STUN P2P"],
        },
        {
          id: "lane-core",
          label: t("Lane 4 · 서울 onpod 코어", "Lane 4 · Seoul onpod core"),
          sub: t("인증·권한·결제·상태 변경 전용 (private, no-store)", "Auth, permissions, ledger & writes (private, no-store)"),
          tone: "server",
          chips: ["core-stateful-onpod", "PostgreSQL", "NestJS"],
        },
        {
          id: "storage-5",
          label: t("5계층 ₩0 저장소 연합", "5-Tier ₩0 storage federation"),
          sub: t("①OPFS 로컬 · ②BYO 클라우드 · ③R2 10GB · ④onpod+D1 · ⑤Static", "1:OPFS · 2:BYO Cloud · 3:R2 10GB · 4:onpod+D1 · 5:Static"),
          tone: "local",
          chips: ["OPFS", "BYO Cloud", "R2 10GB", "onpod+D1", "Static Assets"],
        },
      ],
      brackets: [
        { label: t("목적별 4-Lane 분산", "4-Lane workload split"), layerIds: ["lane-read", "lane-ai", "lane-rt", "lane-core"] },
      ],
    },
    usage: [
      {
        feature: t("목적별 4-Lane 엣지 라우터 & Singleflight 캐시 실드", "4-Lane edge router & Singleflight cache shield"),
        role: t(
          "요청을 4개 레인으로 분류하고 공개 GET 동시 캐시 미스를 1건의 원점 호출로 합치며 민감 헤더는 무조건 우회합니다.",
          "Classifies requests into four lanes, coalesces concurrent public GET misses into one origin fetch, and bypasses sensitive headers.",
        ),
        paths: [
          "deploy/cloudflare-static/edge-api-lane-router.mjs",
          "deploy/cloudflare-static/edge-cache-coalescer.mjs",
        ],
      },
      {
        feature: t("9단 무료 AI 카탈로그 & ₩0 라우터", "9-pool free AI catalog & zero-bill router"),
        role: t(
          "무료 허용 모델만 9개 공급자 순서대로 시도하고 90% 안전 차단선·402/429 감지로 유료 전환을 막습니다.",
          "Cascades allowlisted free models across nine pools with a 90% safety cutoff and 402/429 guards to prevent paid fallback.",
        ),
        paths: [
          "apps/api/src/modules/studio-ai/openai-assist/studio-free-ai-provider-catalog.ts",
          "apps/api/src/modules/studio-ai/studio-free-ai-zero-bill-router.ts",
        ],
      },
      {
        feature: t("브라우저 온디바이스 0-토큰 선행 라우터", "Browser on-device zero-token router"),
        role: t(
          "로컬 코사인 색인과 브라우저 온디바이스 AI 로 풀 수 있는 질의를 먼저 처리해 외부 무료 API 한도를 아낍니다.",
          "Resolves eligible queries locally via a semantic cosine index and browser on-device AI before spending remote free quotas.",
        ),
        paths: [
          "apps/web/src/domains/creator/free-ai-edge-optimizer/ondevice-zero-token-router.ts",
          "apps/web/src/shared/ai/free-ai-zero-bill-cascade.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("5계층 저장소 정본 지도", "5-tier storage authority map"),
        role: t(
          "OPFS 로컬, BYO 클라우드, R2 10GB, 서울 onpod+D1, Cloudflare Static Assets 의 역할과 비밀값 경계를 고정합니다.",
          "Documents roles and secret boundaries across local OPFS, BYO Cloud, R2 10 GB, Seoul onpod+D1 and Cloudflare Static Assets.",
        ),
        paths: ["docs/operations/infrastructure-map.md", "docs/operations/free-ai-runtime.md"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("Singleflight 동시 요청 병합기 최소 구현", "Minimal Singleflight concurrent request coalescer"),
        language: "ts",
        ...sampleSource([
          ["export function createSingleflight<V>() {"],
          ["  const inFlight = new Map<string, Promise<V>>();"],
          ["  return (key: string, load: () => Promise<V>): Promise<V> => {"],
          ["    const existing = inFlight.get(key);"],
          ["    if (existing) return existing;", "동시 미스 N건을 원점 1회로 병합", "coalesce N concurrent misses into 1 fetch"],
          ["    const pending = load().finally(() => inFlight.delete(key));"],
          ["    inFlight.set(key, pending);"],
          ["    return pending;"],
          ["  };"],
          ["}"],
        ]),
        explain: t(
          "같은 공개 캐시 키에 요청이 동시에 몰려도 원점 fetch 는 한 번만 실행하고, 완료되면 맵에서 지워 다음 갱신 주기를 준비합니다.",
          "Concurrent requests for the same public cache key share one in-flight origin fetch and clear the entry once settled.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("인증·쿠키 요청을 공유 캐시에서 차단하는 fail-closed 검사", "Fail-closed guard excluding auth/cookie requests from shared cache"),
        language: "ts",
        ...sampleSource([
          ['const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "x-session-token", "x-api-key"]);'],
          [""],
          ["export function isPublicEdgeCacheCandidate(method: string, headers: Headers): boolean {"],
          ['  if (method !== "GET" && method !== "HEAD") return false;', "변경 요청은 무조건 우회", "mutations always bypass shared cache"],
          ["  for (const name of SENSITIVE_HEADERS) {"],
          ["    if (headers.has(name)) return false;", "인증·쿠키가 하나라도 있으면 캐시 금지", "any auth/cookie header forces bypass"],
          ["  }"],
          ["  return true;"],
          ["}"],
        ]),
        explain: t(
          "실제 edge-api-lane-router.mjs 는 여기에 응답 쪽 Set-Cookie·private Cache-Control 검사까지 더해 개인 데이터가 공유 캐시에 섞이지 않게 막습니다.",
          "The real edge-api-lane-router.mjs also inspects response Set-Cookie and private Cache-Control headers so private data never enters shared cache.",
        ),
        source: "deploy/cloudflare-static/edge-api-lane-router.mjs",
        verify: "types",
      },
    ],
    links: [
      {
        title: "Cloudflare Workers · Cache API & waitUntil",
        url: "https://developers.cloudflare.com/workers/runtime-apis/cache/",
        kind: "docs",
        note: t("엣지 캐시 실드와 백그라운드 SWR 갱신 API", "Edge cache shield and background SWR refresh API"),
      },
      {
        title: "Cloudflare R2 · Pricing & Free Tier",
        url: "https://developers.cloudflare.com/r2/pricing/",
        kind: "docs",
        note: t("송신료 0원·10GB 무료 R2 스토리지 한도 확인", "Zero-egress 10 GB free R2 storage tier"),
      },
      {
        title: "RFC 5861 · HTTP Cache-Control stale-while-revalidate",
        url: "https://datatracker.ietf.org/doc/html/rfc5861",
        kind: "spec",
      },
    ],
    chapterIds: ["infrastructure", "free-ai-routing", "cost-engineering"],
    talk: {
      pitch: t(
        "무료 인프라로 버티려면 트래픽을 한 서버에 몰면 안 됩니다. 공개 읽기는 Singleflight 엣지 캐시, AI 는 온디바이스 0-토큰과 9단 무료 풀, 실시간은 DO+P2P, 상태 변경만 서울 onpod 로 나누는 4-Lane 과 OPFS·BYO·R2·onpod+D1·Static 5계층 저장소로 ₩0 구조를 설계했습니다.",
        "Staying at ₩0 means never funneling all traffic into one server: 4-Lane routing separates Singleflight public reads, on-device plus 9-pool free AI, DO/P2P realtime, and Seoul onpod writes, paired with five zero-cost storage tiers.",
      ),
      analogy: t(
        "안내 데스크(엣지)가 자주 묻는 질문은 한 번만 물어보고 모두에게 답해 주며, 개인 물품(원고)은 각자 사물함(OPFS·개인 드라이브)에 보관해 본관 창구(서울 onpod)가 밀리지 않게 하는 운영법입니다.",
        "Like a lobby desk (edge) answering common questions from one check while visitors keep heavy bags in their own lockers (OPFS/BYO) so the main counter stays fast.",
      ),
      questions: [
        {
          question: t("엣지 캐시가 다른 사용자의 개인 응답을 잘못 보여 줄 위험은 없나요?", "Could edge caching leak another user's private response?"),
          answer: t(
            "요청에 Authorization·Cookie·세션·API 키 헤더가 있거나 응답에 Set-Cookie·private 지시가 있으면 fail-closed 규칙으로 공유 캐시 저장과 조회를 모두 건너뜁니다.",
            "Fail-closed rules bypass both cache reads and writes whenever requests carry Authorization, Cookie, session or API-key headers or responses include Set-Cookie or private Cache-Control.",
          ),
        },
        {
          question: t("9단 무료 AI 한도가 다 닳으면 유료 과금이 발생하나요?", "Does exhausting the 9 free AI pools trigger paid billing?"),
          answer: t(
            "발생하지 않습니다. 무료 허용 목록과 90% 안전 차단선, 결제 수단 미연결 정책에 따라 한도가 끝나면 로컬 폴백으로 내려가거나 정직하게 중단합니다.",
            "No. Free-only allowlists, a 90% safety cutoff and no-billing guards fall back locally or stop cleanly instead of converting to paid calls.",
          ),
        },
      ],
      pitfall: t(
        "무료 티어 한도와 무료 AI 제공자 정책은 예고 없이 바뀔 수 있으므로 '항상 무료 보장'이 아니라 '₩0 우선 설계 + 한도 소진 시 유료 자동 전환 차단'이 정확한 표현입니다.",
        "Free-tier limits and AI provider policies change without notice; describe this as zero-cost-first design with hard blocks against automatic paid conversion, not a permanent guarantee.",
      ),
    },
    technologies: ["Cloudflare Workers", "Cloudflare R2", "Durable Objects", "OPFS", "OpenRouter"],
    facts: [
      {
        value: "4 Lanes",
        label: t("공개 읽기 · 무료 AI · 실시간 DO/P2P · 서울 onpod 분산", "Public read, free AI, realtime DO/P2P & Seoul onpod lanes"),
        source: "deploy/cloudflare-static/edge-api-lane-router.mjs",
      },
      {
        value: "9 Pools / 90%",
        label: t("₩0 무료 AI 카탈로그 9단 순서 · 90% 안전 차단선", "9-pool zero-bill free AI cascade with 90% safety cutoff"),
        source: "apps/api/src/modules/studio-ai/openai-assist/studio-free-ai-provider-catalog.ts",
      },
      {
        value: "5 Tiers (₩0)",
        label: t("OPFS · BYO 클라우드 · R2(10GB) · onpod+D1 · Static Assets", "OPFS, BYO Cloud, R2 (10 GB), onpod+D1 & Static Assets"),
        source: "docs/operations/infrastructure-map.md",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
