import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · platform-ops · 모놀리스 정적 경계 분해·레거시 0-임포트 래칫·Cloudflare 4-레인 엣지 실드·적응형 샤드 타입체크 카드.
 */
export const PLATFORM_OPS_MONOLITH_EDGE_SHIELD_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "monolith-girvan-newman-audit-and-edge-4lane-shield",
    category: "platform-ops",
    name: "Monolith Decomposition · 0-Import Ratchet · 4-Lane Edge Shield",
    title: t(
      "모놀리스 정적 경계 분해 · 레거시 0-임포트 래칫 & Cloudflare 4-레인 엣지 실드",
      "Monolith boundary decomposition, 0-import legacy ratchet & Cloudflare 4-lane edge shield",
    ),
    status: "live",
    tagline: t(
      "대형 컴포넌트 경계 분해·레거시 0-임포트 감사, 인증 요청 fail-closed 4-레인 엣지 라우터, 적응형 샤드 타입체크를 결합했습니다.",
      "Unites static monolith decomposition & 0-import ratchets, fail-closed 4-lane Cloudflare edge routing and adaptive shard typechecking.",
    ),
    background: [
      t(
        "수천 줄 규모로 자란 에디터 호스트 파일은 상태 훅과 순수 도우미가 얽혀 리팩터링 회귀 위험이 크고, 퇴역 대상 레거시 패키지가 새 코드에 다시 스며들거나, 반대로 서울 원점(onpod) 부하를 줄이려 엣지 캐시를 켰다가 인증·쿠키 응답이 공유 캐시에 섞이는 사고는 절대 일어나선 안 됩니다.",
        "Multi-thousand-line studio host files entangle React hooks with pure helpers, retired packages risk creeping back into imports, and edge caching in front of the Seoul origin must never cache authenticated traffic.",
      ),
      t(
        "host-characterization-audit/monolith-decomposition-analyzer.ts 는 외부 AST 의존성 없는 TS 어휘 토크나이저와 스코프 추출기로 훅 클러스터·순수 함수 추출 후보·Strangler-Fig 단계별 분리 계획을 산출하고, LEGACY_WASM64_RATCHET_PACKAGES 역행 유입이 0건인지 정적으로 감사합니다(실험·진단 도구).",
        "monolith-decomposition-analyzer.ts tokenizes TypeScript scopes without external AST dependencies to rank pure-helper extractions, hook clusters and Strangler-Fig steps while auditing 0 legacy package regressions.",
      ),
      t(
        "운영 경로(Live)에서는 deploy/cloudflare-static/edge-api-lane-router.mjs 가 모든 /api 요청을 4개 레인(공개 읽기 · AI 보조 · 실시간 DO · 서울 코어 onpod)으로 가르되 Authorization·Cookie·세션 헤더나 변경 메서드는 단 한 건도 예외 없이 private, no-store 로 우회하며, scripts/typecheck-shards.mjs 는 호스트 RAM(CI 8GiB ~ 로컬 32GiB+)에 맞춰 프로젝트를 나눠 타입을 검사합니다.",
        "In production (Live), edge-api-lane-router.mjs routes /api traffic into 4 workload lanes while forcing private, no-store bypass on any cookie/auth/mutation request, backed by RAM-adaptive shard typechecking in scripts/typecheck-shards.mjs.",
      ),
    ],
    keyPoints: [
      t("무의존성 TS 토크나이저 기반 순수 함수·훅 클러스터 Strangler-Fig 분해", "Zero-dep TS lexical scope analyzer & Strangler-Fig extraction planner"),
      t("퇴역 대상 패키지 재유입 0건 강제 정적 의존성 래칫 감사기", "Static dependency ratchet enforcing 0 re-imports of retired packages"),
      t("4-레인 엣지 API 라우터 — 쿠키·인증·변경 요청 100% private/no-store", "4-lane Cloudflare edge router; fail-closed private/no-store on auth"),
      t("CI(8GiB) · 로컬(24~48GiB+) 물리 RAM 인지 적응형 샤드 타입체크", "Adaptive TypeScript shard size and heap settings"),
    ],
    diagram: {
      id: "monolith-girvan-newman-audit-and-edge-4lane-shield-diagram",
      kind: "graph",
      title: t("빌드 시점 정적 경계·샤드 게이트와 운영 4-레인 fail-closed 엣지 실드", "Build-time static boundary/shard gates & live 4-lane fail-closed edge shield"),
      caption: t(
        "코드 병합 전에는 모놀리스·래칫·샤드 타입체크가 경계를 지키고, 운영 요청은 4-레인 라우터가 공개 캐시와 인증 원점을 엄격히 분리합니다.",
        "Static decomposition and shard typechecks guard merges, while the 4-lane edge router isolates public cache from stateful origin APIs.",
      ),
      alt: t(
        "왼쪽 위 소스 코드가 모놀리스 분해·레거시 래칫 감사와 적응형 샤드 타입체크 게이트를 통과하고, 왼쪽 아래 사용자 /api 요청이 4-레인 엣지 라우터 분기 노드를 거쳐 공개 무인증 읽기만 엣지 캐시 실드로, 인증·세션·실시간 요청은 DO 또는 서울 onpod 원점 직통으로 나뉩니다.",
        "Source edits pass monolith/ratchet audits and adaptive shard typechecking, while live /api requests hit the 4-lane edge router, sending anonymous GETs to the edge cache shield and routing auth/realtime traffic straight to DO or Seoul onpod.",
      ),
      nodes: [
        { id: "src", label: t("모노레포 소스", "Monorepo code"), sub: t("호스트 · 패키지 경계", "Host & workspace"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "aud", label: t("모놀리스 · 래칫", "Boundary & ratchet"), sub: t("훅 분해 · 적응형 샤드", "Scope & RAM shards"), tone: "good", at: [1, 0] },
        { id: "req", label: t("클라이언트 /api", "Client /api req"), sub: t("GET/POST · 헤더 검사", "Method & header check"), tone: "local", shape: "pill", at: [0, 2] },
        { id: "rtr", label: t("4-레인 엣지 라우터", "4-lane edge router"), sub: t("쿠키·인증 즉시 우회", "Fail-closed auth guard"), tone: "edge", at: [1, 2] },
        { id: "pub", label: t("공개 읽기 실드", "Public read cache"), sub: t("카탈로그 · 합승(Coalesce)", "Catalog & coalescing"), tone: "edge", at: [2, 1] },
        { id: "cor", label: t("실시간 DO · 서울 코어", "DO & Seoul onpod"), sub: t("private, no-store 직통", "Stateful origin lane"), tone: "server", at: [2, 3] },
      ],
      edges: [
        { from: "src", to: "aud", label: t("정적 검증", "Verify") },
        { from: "req", to: "rtr", label: t("요청 유입", "Ingress") },
        { from: "rtr", to: "pub", label: t("무인증 GET", "Anon GET") },
        { from: "rtr", to: "cor", label: t("인증·변경", "Auth/Write") },
      ],
    },
    usage: [
      {
        feature: t("Cloudflare 4-레인 엣지 API 라우터 및 fail-closed 캐시 자격 판별기 (운영)", "Cloudflare 4-lane edge API router & fail-closed cache classifier (Live)"),
        role: t(
          "공개 읽기·AI 보조·실시간 DO·서울 코어 4개 레인을 분류하고 민감 헤더·경로는 공유 캐시에서 100% 배제합니다.",
          "Classifies requests into 4 workload lanes and guarantees zero shared caching on auth, cookie or mutation paths.",
        ),
        paths: [
          "deploy/cloudflare-static/edge-api-lane-router.mjs",
          "deploy/cloudflare-static/edge-cache-coalescer.mjs",
        ],
      },
      {
        feature: t("모놀리스 경계 분해·레거시 래칫 감사기 & 호스트 RAM 적응형 샤드 타입체크", "Monolith decomposition/ratchet auditor & RAM-adaptive shard typecheck"),
        role: t(
          "대형 TS 파일의 순수 함수·훅 클러스터 분해 순서를 도출하고 호스트 물리 메모리에 맞춰 샤드 힙 상한을 조절합니다.",
          "Extracts pure-helper/hook clusters for Strangler-Fig refactoring and scales tsc shard heap limits to host RAM.",
        ),
        paths: [
          "apps/web/src/domains/creator/host-characterization-audit/monolith-decomposition-analyzer.ts",
          "apps/web/src/domains/creator/host-characterization-audit/host-characterization-audit.test.ts",
          "scripts/typecheck-shards.mjs",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("민감 요청 헤더·쿠키 존재 시 공유 엣지 캐시 즉시 차단(Fail-Closed)", "Fail-closed shared edge cache bypass on sensitive request headers"),
        language: "ts",
        ...sampleSource([
          ["const SENSITIVE_HEADERS = new Set([\"authorization\", \"cookie\", \"x-session-token\", \"x-api-key\"]);"],
          ["export function canUsePublicEdgeCache(method: string, headerNames: readonly string[]): boolean {"],
          ["  if (method !== \"GET\" && method !== \"HEAD\") return false;"],
          ["  for (const raw of headerNames) {"],
          ["    const h = raw.toLowerCase();"],
          ["    if (SENSITIVE_HEADERS.has(h) || h.startsWith(\"x-auth-\") || h.startsWith(\"x-session-\")) return false;", "인증·세션 단서가 하나라도 있으면 코어 원점으로 직통 우회", "any auth or session hint forces private, no-store bypass"],
          ["  }"],
          ["  return true;"],
          ["}"],
        ]),
        explain: t(
          "실제 edge-api-lane-router.mjs 는 요청 단계뿐 아니라 원점 응답의 Set-Cookie·Vary: *·private 헤더까지 다시 검사하는 이중 잠금으로 개인정보 캐시 오염을 차단합니다.",
          "edge-api-lane-router.mjs double-checks both request headers and origin response Set-Cookie / Cache-Control before storing anything.",
        ),
        source: "deploy/cloudflare-static/edge-api-lane-router.mjs",
        verify: "types",
      },
    ],
    links: [
      {
        title: "IETF RFC 9111 · HTTP Caching (private / no-store Directives)",
        url: "https://datatracker.ietf.org/doc/html/rfc9111",
        kind: "spec",
        note: t("공유 프록시·CDN 캐시 저장 금지 및 개인 응답 격리 HTTP 표준", "HTTP caching standard governing shared cache prohibition and private responses"),
      },
      {
        title: "Martin Fowler · Strangler Fig Application Modernization Pattern",
        url: "https://martinfowler.com/bliki/StranglerFigApplication.html",
        kind: "docs",
        note: t("동작을 깨지 않고 대형 모놀리스에서 순수 모듈부터 단계적으로 분리하는 전략", "Incremental boundary extraction pattern without risky big-bang rewrites"),
      },
    ],
    chapterIds: ["architecture", "infrastructure", "quality"],
    talk: {
      pitch: t(
        "안으로는 수천 줄 모놀리스를 안전하게 해체하고 저장소 타입체크를 메모리 한도 안에서 돌리며, 밖으로는 4-레인 엣지 실드로 서울 원점 서버 부하와 캐시 사고를 함께 막습니다.",
        "Safely decomposes monoliths and shard-typechecks 30K+ files internally while shielding the Seoul origin with a fail-closed 4-lane edge router.",
      ),
      analogy: t(
        "건물 내부 배선을 무정전 상태로 구역별 분전반으로 나누는 리모델링 도면과, 입구에서 일반 방문객 안내문과 금고 출입자를 철저히 다른 통로로 보내는 보안 게이트의 결합입니다.",
        "Like pairing a live electrical panel sub-circuit blueprint with an entrance gate separating public brochures from vault visitors.",
      ),
      questions: [
        {
          question: t("공개 카탈로그 경로(/api/catalog)라도 로그인 쿠키가 실려 오면 어떻게 처리하나요?", "What if a logged-in browser sends a Cookie header to a public catalog endpoint?"),
          answer: t(
            "경로가 공개 허용 목록에 있더라도 Cookie 나 Authorization 헤더가 단 하나라도 감지되면 즉시 공유 캐시 자격을 박탈하고 private, no-store 로 처리해 계정별 응답 혼입을 원천 차단합니다.",
            "Even on allowlisted paths, any Cookie or Authorization header immediately revokes shared-cache eligibility and enforces private, no-store.",
          ),
        },
      ],
    },
    technologies: ["Cloudflare Workers", "Lexical Scope Audit", "TypeScript Shards", "RFC 9111"],
    facts: [
      { value: "4 lanes", label: t("공개 읽기 · AI 보조 · 실시간 DO · 서울 코어 엣지 분기", "Workload-isolated edge API routing lanes"), source: "deploy/cloudflare-static/edge-api-lane-router.mjs" },
      { value: "8–24 GiB", label: t("CI 및 로컬 RAM 규모별 적응형 샤드 타입체크 힙 범위", "Host-RAM adaptive tsc shard heap tiers"), source: "scripts/typecheck-shards.mjs" },
    ],
    reviewedAt: "2026-11-26",
  },
];
