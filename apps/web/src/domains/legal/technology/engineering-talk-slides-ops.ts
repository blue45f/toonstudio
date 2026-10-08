import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";
import { sourcedTable, statusCell, t, type TalkTableSources } from "./engineering-talk-kit";
import type { TalkSlide } from "./engineering-talk-types";

/**
 * 세미나 발표 뒷부분: 품질과 검증(AI 개발 방식 포함) → 운영과 비용 → 배운 점과 한계 → 질의응답(9장, 565초).
 *
 * - 수치는 `facts`에 라벨과 함께 두고 콘텐츠 테스트가 소스 값(래칫 JSON·번들 기준선·워크플로 수·상수)과 대조한다.
 * - 무료 서비스·Open API 표는 기술 지도 행에서 옮겼다. 상태·기록일·숫자는 근거 행과 같아야 한다.
 */

/** 링크 라벨의 챕터 수는 발행 챕터 목록에서 계산한다(손으로 쓴 숫자가 낡는 일을 막는다). */
const CHAPTER_COUNT = PUBLISHED_ENGINEERING_CHAPTERS.length;

/* ── 무료로 세운 서비스 ───────────────────────────────────────────────────── */

const FREE_INFRA = sourcedTable(
  [t("서비스", "Service"), t("맡은 일", "Role"), t("무료 한도(기록일)", "Free limit (recorded)"), t("상태", "Status")],
  [
    [
      "cloudflare-static-assets",
      t("Cloudflare Static Assets", "Cloudflare Static Assets"),
      t("화면·카탈로그를 엣지에서 제공", "Serves the app and catalog at the edge"),
      t("파일당 25 MiB · 10-07", "25 MiB per file · 10-07"),
      statusCell("live"),
    ],
    [
      "cloudflare-durable-objects",
      t("Cloudflare Durable Objects", "Cloudflare Durable Objects"),
      t("방마다 접속·커서·화면 공유 신호", "Per-room presence, cursors, screen-share signals"),
      t("우리 상한 방당 64연결 · 09-26", "Our cap: 64 connections per room · 09-26"),
      statusCell("live"),
    ],
    [
      "render-free-web-service",
      t("Render Free web service", "Render Free web service"),
      t("Core API(로그인·권한·원장)", "Core API (sign-in, permissions, ledger)"),
      t("15분 무요청 시 절전 · 월 750시간 · 10-07", "Sleeps after 15 min idle · 750 hours a month · 10-07"),
      statusCell("live"),
    ],
    [
      "supabase-postgresql",
      t("Supabase PostgreSQL", "Supabase PostgreSQL"),
      t("원장 DB — 지금의 쓰기 권위", "Ledger DB — today's single write authority"),
      t("DB 500,000,000 B · 09-26", "500,000,000 B of database · 09-26"),
      statusCell("live"),
    ],
    [
      "neon-postgresql-legacy",
      t("Neon PostgreSQL (legacy)", "Neon PostgreSQL (legacy)"),
      t("예전 원장 — 새 쓰기 없이 보존", "The former ledger — kept without new writes"),
      t("저장 512 MiB · 한도에 막혀 이전 · 09-26", "512 MiB storage · moved after hitting the limit · 09-26"),
      statusCell("retired", t("legacy 보존", "kept as legacy")),
    ],
    [
      "browser-opfs",
      t("Browser OPFS", "Browser OPFS"),
      t("작업 중 프로젝트·레이어(기기 안)", "Working projects and layers (on device)"),
      t("서버 용량을 쓰지 않음 · 10-07", "Uses no server capacity · 10-07"),
      statusCell("live"),
    ],
    [
      "ai-browser-budget-ledger",
      t("Browser budget ledger", "Browser budget ledger"),
      t("개인 무료 AI 호출 전 한도 예약", "Reserves budget before a free-key AI call"),
      t("경로마다 하루 25회 · 64,000토큰 · 10-07", "Per route: 25 calls a day · 64,000 tokens · 10-07"),
      statusCell("live"),
    ],
    [
      "ai-shared-free-pool",
      t("Shared free pool", "Shared free pool"),
      t("키 없는 로그인 사용자용 AI 풀", "AI pool for signed-in users without keys"),
      t("확인된 공급자 아직 없음 · 10-06", "No confirmed provider yet · 10-06"),
      statusCell("configured"),
    ],
  ],
  t(
    "26곳 중 대표 8곳 · 한도는 공급자가 바꿀 수 있어 기록일(2026년)을 함께 봅니다 · 수치는 지도에 기록된 값만",
    "8 of 26 services · providers can change limits, so check the recorded date (2026) · figures are only those recorded in the map",
  ),
);

/* ── 서비스가 활용한 Open API ─────────────────────────────────────────────── */

const OPEN_API = sourcedTable(
  [t("공급자", "Provider"), t("가져오는 것 → 쓰이는 곳", "What it brings → where it is used"), t("보호 장치", "Guard"), t("상태", "Status")],
  [
    [
      "met",
      t("The Met", "The Met"),
      t("소장품 검색 → 콘텐츠 팩", "Collection search → content packs"),
      t("목록 표시를 믿지 않고 상세에서 권리 재확인", "Does not trust list flags; re-checks rights on the detail record"),
      statusCell("live"),
    ],
    [
      "polyhaven",
      t("Poly Haven", "Poly Haven"),
      t("CC0 3D·HDRI·텍스처 → 3D 재료실", "CC0 3D, HDRIs, textures → the 3D material room"),
      t("썸네일·출처 호스트 고정, 큰 파일은 원문", "Pinned thumbnail and source hosts; big files stay at the origin"),
      statusCell("live"),
    ],
    [
      "nasa",
      t("NASA Images", "NASA Images"),
      t("이미지 메타데이터 → 우주 레퍼런스", "Image metadata → space references"),
      t("권리 미확정 — ‘참고 전용’으로만", "Rights unconfirmed, so reference-only"),
      statusCell("live"),
    ],
    [
      "wikimedia-pageviews",
      t("Wikimedia Pageviews", "Wikimedia Pageviews"),
      t("최근 30일 조회수 → 관심 신호", "Last 30 days of views → interest signal"),
      t("형식이 틀리면 응답 전체 폐기 · 합산 금지", "One malformed point discards the response; never summed"),
      statusCell("live"),
    ],
    [
      "open-creation",
      t("Open Creation (browser)", "Open Creation (browser)"),
      t("CC0 작품(브라우저 직접) → 자료 보드", "CC0 works fetched by the browser → reference board"),
      t("15초 중단 · 쿠키 없음 · 2MiB · 24시간 캐시", "15 s abort · no cookies · 2 MiB · 24 h cache"),
      statusCell("live"),
    ],
    [
      "googlefonts",
      t("Google Fonts", "Google Fonts"),
      t("글꼴·한글 지원 → 폰트 매처", "Fonts and Hangul support → font matcher"),
      t("키는 헤더로만 · 2MiB 안 모양 검사 · 등록 대기", "Key in a header only · shape-checked within 2 MiB · registration pending"),
      statusCell("configured"),
    ],
    [
      "kmas-strict",
      t("KMAS (strict path)", "KMAS (strict path)"),
      t("만화·웹툰 서지 → 만화 레퍼런스", "Comic and webtoon bibliographies → references"),
      t("kmas.or.kr만 · 8초·2MiB · 승인키 일 1,000회", "kmas.or.kr only · 8 s and 2 MiB · approved key 1,000 a day"),
      statusCell("configured"),
    ],
    [
      "developer-manifest",
      t("ToonStudio developer manifest", "ToonStudio developer manifest"),
      t("우리가 여는 쪽: 계약 선언 JSON 1개", "What we open: 1 contract-declaration JSON"),
      t("API 키·OAuth·범위 강제는 아직 없음", "No API keys, OAuth or scope enforcement yet"),
      statusCell("documented"),
    ],
  ],
  t(
    "43곳 중 대표 8곳 · 빌려 쓰는 쪽과 우리가 여는 쪽을 함께 보여 줍니다",
    "8 of 43 APIs · both the ones we borrow and the one we open",
  ),
);

export const OPS_TABLE_SOURCES = {
  "talk-free-infra": { kind: "map", mapId: "free-tier", rowIds: FREE_INFRA.sourceIds },
  "talk-open-api": { kind: "map", mapId: "open-api", rowIds: OPEN_API.sourceIds },
} as const satisfies TalkTableSources;

export const OPS_SLIDES = [
  {
    id: "talk-quality",
    section: "quality",
    layout: "metrics",
    eyebrow: t("05 · 품질과 검증", "05 · QUALITY AND VERIFICATION"),
    title: t("좋은 데모를 반복 가능한 증거로 바꿉니다", "Turning a good demo into repeatable evidence"),
    lead: t(
      "타입·린트 → 단위·컴포넌트 → 브라우저 E2E·접근성 → 성능·보안·라이선스 순서로 게이트를 나눴습니다.",
      "Gates are layered: types and lint → unit and component → browser E2E and accessibility → performance, security and licenses.",
    ),
    facts: [
      { value: "5,300+", label: t("웹 테스트 파일(Vitest, git 추적 기준)", "Web test files (Vitest, tracked by git)") },
      { value: "49", label: t("E2E 스펙(Playwright)", "E2E specs (Playwright)") },
      { value: "98", label: t("GitHub Actions 워크플로 파일", "GitHub Actions workflow files") },
      { value: "0", label: t("앱 간 직접 import(래칫)", "Cross-app imports (ratchet)") },
    ],
    points: [
      t("래칫: 레거시 경계 위반은 상한(25·58)에 묶여 늘면 CI가 실패 — 도메인 간 깊은 import 실측은 49", "Ratchet: legacy boundary violations are capped (25 and 58) and CI fails if they grow — measured deep imports are 49"),
      t("접근성: 코어 필수 게이트는 axe 스모크(기본 설정, 모션 감소 없음) — 모션 감소·강제 색상은 수동 매트릭스, 키보드 점검은 스모크에 없음", "Accessibility: the required core gate is an axe smoke (default config, no reduced motion) — reduced motion and forced colors are a manual matrix and keyboard checks are not in the smoke"),
      t("5,300+는 수집 규모이지 매 PR 게이트가 아님 — 병합을 막는 코어는 큐레이션한 394개 대상, 정본은 CI", "5,300+ is the collected scale, not a per-PR gate — the merge-blocking core lists 394 curated targets, and CI is the source of truth"),
    ],
    stack: ["Vitest", "Testing Library", "Playwright", "@axe-core/playwright", "GitHub Actions"],
    notes: t(
      "건강검진표처럼 오늘 센 값만 읽습니다. 웹 테스트 파일 5,300개 이상, E2E 스펙 49개, 워크플로 98개입니다.\n래칫: 앱 간 import는 0, 레거시 shared→domain(25)과 도메인 간 깊은 import(58)는 상한이라 늘면 CI가 실패하며, 깊은 import 실측은 49입니다.\n접근성은 코어 게이트가 axe 스모크(기본 설정, 모션 감소 없음), 모션 감소·강제 색상은 수동, 키보드 점검은 스모크에 없습니다. 근거는 architecture-boundary-ratchet.json입니다. 다음은 성능입니다. 질문이 나오면 ‘Architecture boundary ratchet’ 카드를 엽니다.",
      "Read it like a health-check sheet: only values counted today. Web test files exceed 5,300, with 49 E2E specs and 98 workflows.\nRatchet: cross-app imports stay at 0, and legacy shared→domain (25) and cross-domain deep imports (58) are caps, so CI fails if they grow; measured deep imports are 49.\nAccessibility: the core gate is an axe smoke (default config, no reduced motion), reduced motion and forced colors are manual and keyboard checks are not in the smoke. The basis is architecture-boundary-ratchet.json. Next, performance. If asked, open the ‘Architecture boundary ratchet’ card.",
    ),
    chapterId: "quality",
    evidence: [
      "config/architecture-boundary-ratchet.json",
      "scripts/validate-app-boundaries.mjs",
      "scripts/ci-required-vitest-targets.txt",
      "package.json",
      "e2e/a11y-smoke.spec.ts",
      ".github/workflows",
    ],
    relatedAtlasIds: ["module-boundary-ratchet", "axe-a11y-matrix", "test-honesty-and-time-budget-isolation"],
    seconds: 80,
  },
  {
    id: "talk-performance",
    section: "quality",
    layout: "metrics",
    eyebrow: t("05 · 성능 게이트", "05 · PERFORMANCE GATE"),
    title: t("성능 예산은 관찰값, 막는 것은 +2% 래칫", "Performance budgets observe; a +2% ratchet blocks"),
    lead: t(
      "참고 예산은 관찰용이고 이미 크게 넘었습니다. 빌드를 실패시키는 것은 마지막 승인 측정 대비 +2% 래칫입니다.",
      "Reference budgets are observational and already far exceeded. What fails the build is a +2% ratchet against the last accepted measurement.",
    ),
    facts: [
      { value: "1.2 MiB", label: t("앱 진입 번들 raw · 참고 예산(0.5 MiB)의 2.5배", "App entry bundle, raw · 2.5× its 0.5 MiB reference") },
      { value: "7.2 MiB", label: t("스튜디오 라우트 raw · 참고 예산(2.9 MiB)의 2.5배", "Studio route, raw · 2.5× its 2.9 MiB reference") },
      { value: "+2%", label: t("빌드 실패 기준: 마지막 승인 측정 대비", "Build-failing limit: against the last accepted measurement") },
      { value: "309", label: t("스튜디오 라우트 정적 청크 수(마지막 승인값)", "Static chunks in the Studio route (last accepted)") },
    ],
    points: [
      t("참고 예산은 ‘설계 목표에서 얼마나 멀어졌나’를 보는 관찰값 — 넘어도 빌드를 막지 않음", "Reference budgets show how far we are from the design target — exceeding them does not block the build"),
      t("실제로 막는 것은 마지막 승인값 대비 +2% — 늘리려면 사람이 한 번 결정해 기준선을 갱신", "What blocks is +2% over the last accepted value — raising it takes one human decision to update the baseline"),
      t("3D·CRDT 같은 무거운 엔진이 첫 화면 번들로 돌아오면 별도 가드가 실패", "A separate guard fails if heavy engines such as 3D or CRDT return to the first-screen bundle"),
    ],
    stack: ["Lazy routes", "Web Workers", "WASM", "Bundle budget"],
    notes: t(
      "가계부로 말하면 목표 지출선은 이미 크게 넘었고, 실제로 막는 건 지난달 대비 +2% 한도입니다. 참고 예산은 관찰용입니다. 앱 진입 번들은 1.2MiB로 참고의 2.5배, 스튜디오 라우트는 7.2MiB로 역시 2.5배입니다.\n눈금을 올리려면 사람이 결정해야 합니다. 근거는 bundle-baseline.json입니다. 다음은 AI 개발 방식입니다. 질문이 나오면 ‘Quality gates’ 카드를 엽니다.",
      "In household-ledger terms, the target spending line is already far exceeded, and what really blocks is the +2% limit against last month. The reference budgets are observational: the app entry bundle is 1.2 MiB, 2.5 times its reference, and the Studio route is 7.2 MiB, also 2.5 times.\nRaising the line takes a human decision. The basis is bundle-baseline.json. Next, how we build with AI. If asked, open the ‘Quality gates’ card.",
    ),
    chapterId: "performance",
    evidence: [
      "scripts/bundle-baseline.json",
      "scripts/check-studio-bundle.mjs",
      "docs/perf/bundle-gate.md",
      "vitest.perf.config.ts",
    ],
    relatedAtlasIds: ["drawing-quality-gates", "precache-budget-offline-core", "large-asset-delivery-r2-range", "main-thread-yielding"],
    seconds: 55,
  },
  {
    id: "talk-ai-dev",
    section: "quality",
    layout: "atlas",
    eyebrow: t("05 · AI 개발 방식", "05 · BUILDING WITH AI"),
    title: t("AI의 ‘다 했어요’를 확인하는 문", "Gates that check an AI's “done”"),
    lead: t(
      "규칙은 AGENTS.md 한 곳이고, 완료 판정은 AI의 말이 아니라 하네스·훅·CI와 사람의 승인이 합니다.",
      "One rulebook in AGENTS.md; ‘done’ is judged by the harness, hooks, CI and a human approval, not by the AI's word.",
    ),
    points: [
      t("규칙은 AGENTS.md 한 곳 — 도구별 파일은 핵심만 요약해 가리키고 하네스가 연결을 검사", "One rulebook in AGENTS.md — tool files summarize and point to it and the harness checks the links"),
      t("harness:verify → 커밋·푸시 훅 → CI core 필수 7개 검사를 정책상 AI의 변경도 똑같이 통과", "harness:verify, then commit and push hooks, then the 7 required CI core checks — by policy AI changes pass the same gates"),
      t("OpenWiki는 길잡이일 뿐 — 사실은 소스·테스트가 먼저, 갱신은 주 1회 PR(자동 병합 없음)", "OpenWiki is a guide only — source and tests win; it updates weekly by PR with no auto-merge"),
      t("루프 명령 23개는 외부 플러그인의 이름표 — 실행 기록과 효과 수치는 확인 못 해 ‘설정 필요’", "The 23 loop commands are name tags for an external plugin — no run history or effect figures, so ‘setup required’"),
    ],
    facts: [
      { value: "10", label: t("하네스가 확인하는 AGENTS.md 파일 수(루트 1 + 영역 9)", "AGENTS.md files the harness checks (1 root + 9 areas)") },
      { value: "7", label: t("CI core가 요구하는 필수 검사 수", "Required checks of the CI core gate") },
      { value: "23", label: t("loop 명령 파일 수", "Loop command files") },
    ],
    atlas: { id: "agent-harness-verify-gates", view: "diagram" },
    notes: t(
      "AI가 ‘다 했습니다’라고 해도 확인합니다. 규칙은 AGENTS.md 한 곳이고 도구별 파일은 핵심만 요약해 가리킵니다. 공항 검색대처럼 정책상 AI의 변경도 harness:verify와 훅, CI core 필수 7개 검사를 지나고, 운영 배포는 사람이 따로 승인합니다.\n정직하게, OpenWiki는 길잡이일 뿐 코드가 먼저이고, 루프 명령 23개는 외부 플러그인의 이름표라 실행 기록을 확인하지 못했으며 효과 수치도 없습니다. 근거는 agent-harness.mjs입니다. 다음은 운영입니다. 질문이 나오면 ‘AGENTS.md’ 카드를 엽니다.",
      "We check an AI's ‘done’ rather than believe it. The rulebook is AGENTS.md and tool files summarize and point to it. Like airport security, by policy an AI's change goes through harness:verify, the hooks and the 7 required CI core checks, and a human approves any production release separately.\nBe honest: OpenWiki is only a guide and code comes first, and the 23 loop commands are name tags for an external plugin whose run history we could not confirm; there are no effect figures either. The basis is agent-harness.mjs. Next, operations. If asked, open the ‘AGENTS.md’ card.",
    ),
    chapterId: "ai-assisted-engineering",
    evidence: [
      "AGENTS.md",
      "scripts/agent-harness.mjs",
      "docs/operations/agent-harness.md",
      ".github/workflows/ci.yml",
      ".github/workflows/openwiki-update.yml",
      "opencode.json",
    ],
    relatedAtlasIds: ["agents-md-single-policy", "openwiki-fact-precedence", "opencode-loop-commands"],
    seconds: 70,
  },
  {
    id: "talk-free-infra",
    section: "operations",
    layout: "table",
    eyebrow: t("06 · 무료로 세운 서비스", "06 · BUILT ON FREE TIERS"),
    title: t("무료 요금제와 무료 AI 토큰 위에 세웠습니다", "Built on free tiers and free AI tokens"),
    lead: t(
      "무료는 공짜가 아니라 한도가 있는 조건입니다. 어디에 무엇을 썼는지 지도에 기록된 값만 옮겼습니다.",
      "Free is not zero-cost; it is a limited condition. Only values recorded in the map are transcribed, with where each is used.",
    ),
    points: [],
    table: FREE_INFRA.table,
    notes: t(
      "무료 요금제 위에 세웠습니다. 지도 26곳 중 8곳이고, 무료는 한도가 있는 조건이라 지도에 적힌 값만 기록일과 함께 옮겼습니다.\n두 줄을 봐 주세요. Neon은 무료 한도에 막혀 원장을 옮긴 사례라 legacy로 보존만 하고, 서버 공유 무료 AI 풀은 확인된 공급자가 없어 설정 필요입니다. 시식은 공짜여도 계산대는 따로입니다. 근거는 engineering-map-free-tier.ts입니다. 다음은 Open API입니다. 질문이 나오면 ‘Federated free data plane’ 카드를 엽니다.",
      "We built on free tiers: 8 of the 26 services in the map. Free is a limited condition, so limits are transcribed only as written in the map, with their recorded dates.\nTwo rows deserve a look. Neon is where the ledger moved after hitting a free limit, so it is only kept as legacy, and the server's shared free AI pool has no confirmed provider, so it is still setup required. A tasting stand is free, the checkout is not. The basis is engineering-map-free-tier.ts. Next, Open APIs. If asked, open the ‘Federated free data plane’ card.",
    ),
    evidence: [
      "apps/web/src/domains/legal/technology/engineering-map-free-tier.ts",
      "apps/web/src/domains/legal/technology/engineering-map-free-tier-rows.ts",
      "docs/operations/canonical-database-topology.md",
      "apps/web/src/shared/ai/free-ai-runtime-budget.ts",
    ],
    relatedAtlasIds: ["federated-free-data-plane", "supabase-single-writer-authority", "quota-ledger-budget", "free-first-ai-routing"],
    seconds: 65,
  },
  {
    id: "talk-open-api",
    section: "operations",
    layout: "table",
    eyebrow: t("06 · Open API 활용", "06 · USING OPEN APIS"),
    title: t("남이 열어 둔 창구를, 믿기 전에 거르며 빌립니다", "Borrowing others' open windows, filtering before trusting"),
    lead: t(
      "43곳 중 운영 경로 18 · 설정 필요 24 · 문서화 1 — 정해진 시간·크기·출처 안에서만 받고 권리가 확인된 것만 올립니다.",
      "Of 43: 18 live, 24 setup required, 1 documented — responses are taken only within set time, size and origin, and only rights-cleared items are promoted.",
    ),
    points: [],
    table: OPEN_API.table,
    notes: t(
      "Open API는 남이 열어 둔 창구를 빌려 쓰는 일입니다. 43곳 중 운영 경로는 18곳, 설정 필요가 24곳입니다.\n맨 아래 줄이 중요합니다. 우리가 밖에 여는 개발자용 Open API는 아직 계약 선언 JSON까지입니다. 근거는 engineering-map-open-api.ts입니다. 다음은 운영입니다. 질문이 나오면 ‘ResourceEngine’ 카드를 엽니다.",
      "Open APIs mean borrowing windows others have opened. Of 43, 18 are live and 24 need setup.\nThe last row matters: the developer Open API we expose is still only a contract-declaration JSON. The basis is engineering-map-open-api.ts. Next, operations. If asked, open the ‘ResourceEngine’ card.",
    ),
    evidence: [
      "apps/web/src/domains/legal/technology/engineering-map-open-api.ts",
      "apps/web/src/domains/legal/technology/engineering-map-open-api-rows.ts",
    ],
    relatedAtlasIds: ["resource-engine-one-contract", "rights-provenance-receipt", "ssrf-allowlist-dns-pinning", "developer-open-api-manifest"],
    seconds: 50,
  },
  {
    id: "talk-operations",
    section: "operations",
    layout: "atlas",
    eyebrow: t("06 · 운영과 비용", "06 · OPERATIONS AND COST"),
    title: t("무료 우선, 유료 전환은 사람이 승인", "Free-first; paid upgrades need human approval"),
    lead: t(
      "정적 SPA는 Cloudflare, 동적 API는 Render, 원장은 Supabase PostgreSQL(Neon은 legacy 보존), 실시간은 Durable Objects — 자동 과금·자동 배포는 쓰지 않습니다.",
      "Static SPA on Cloudflare, dynamic API on Render, ledger on Supabase PostgreSQL (Neon kept as legacy), realtime on Durable Objects — no automatic billing or deploys.",
    ),
    points: [
      t("승인한 40자리 main SHA 하나만 손으로 배포 — 머지는 배포가 아니고, 실패하면 서버·화면만 직전 검증 SHA로 되돌림(DB 자동 복구 없음)", "Only one approved 40-character main SHA is deployed by hand — merging is not releasing, and a failure rolls the server and site back to the last verified SHA, not the DB"),
      t("render.yaml 기준 Render Core API는 무료 플랜 · 자동 배포 꺼짐 — 유휴 시 절전", "Per render.yaml, the Render Core API is on the free plan with auto-deploy off — it sleeps when idle"),
      t("원장 DB의 쓰기 권위는 Supabase 하나 — Neon은 legacy 보존, 자동 이중 쓰기·failover 없음", "The ledger database has one writer, Supabase — Neon is kept as legacy with no automatic dual writes or failover"),
      t("대가: 무료 플랜은 콜드 스타트가 있고 SLA가 없음 — 필요하면 비용과 책임을 함께 승인해 올림", "Trade-off: free plans have cold starts and no SLA — when needed, cost and responsibility are upgraded together"),
    ],
    facts: [
      { value: t("무료 플랜", "Free plan"), label: t("Render Core API(유휴 시 슬립)", "Render Core API (sleeps when idle)") },
      { value: t("수동 배포", "Manual deploys"), label: t("자동 배포 꺼짐(autoDeployTrigger off)", "Auto-deploy off (autoDeployTrigger off)") },
    ],
    stack: ["Cloudflare Static Assets", "Workers", "Durable Objects", "Render", "Supabase PostgreSQL"],
    atlas: { id: "manual-sha-release-gate", view: "diagram" },
    notes: t(
      "근거는 render.yaml입니다. Core API는 free 플랜이고 autoDeployTrigger가 꺼져 있어 push만으로는 운영이 바뀌지 않습니다.\n핵심은 ‘머지는 배포가 아니다’입니다. 원고를 합치는 일과 인쇄 승인이 다르듯, 사람이 승인한 40자리 main 커밋 하나만 손으로 올리고, core 밖의 배포 금지 검사가 워크플로 안의 배포 명령을 막고, 실패하면 서버·화면만 직전 SHA로 되돌리며 DB는 자동 복구가 없습니다.\n원장 DB의 쓰기 권위는 Supabase 하나이고 Neon은 legacy입니다. 대가는 콜드 스타트와 SLA 부재라, 필요하면 비용과 책임을 함께 승인해 올립니다. 다음은 배운 점입니다. 질문이 나오면 ‘Manual SHA release gate’ 카드를 엽니다.",
      "The basis is render.yaml: the Core API is on the free plan and autoDeployTrigger is off, so a push alone changes nothing in production.\nThe key idea is that merging is not releasing. Just as merging a manuscript differs from approving the print run, only one human-approved 40-character main commit is deployed by hand, a deploy-ban check outside core blocks deploy commands inside workflows, and a failure rolls only the server and site back to the last SHA; the DB has no automatic undo.\nThe ledger database has one writer, Supabase, and Neon is legacy. The price is cold starts and no SLA, so when needed cost and responsibility are upgraded together by approval. Next, lessons. If asked, open the ‘Manual SHA release gate’ card.",
    ),
    chapterId: "cost-engineering",
    evidence: [
      "render.yaml",
      "DEPLOY.md",
      "docs/operations/minimum-cost-deployment-policy.md",
      "docs/operations/canonical-database-topology.md",
      "scripts/deploy-cloudflare-static.mjs",
      "scripts/release-workflow-policy.mjs",
    ],
    relatedAtlasIds: ["manual-sha-release-gate", "health-live-ready-capabilities", "static-first-edge-gateway"],
    seconds: 85,
  },
  {
    id: "talk-lessons",
    section: "lessons",
    layout: "lessons",
    eyebrow: t("07 · 배운 점", "07 · LESSONS"),
    title: t("기능보다 경계, 데모보다 증거", "Boundaries over features, evidence over demos"),
    lead: t(
      "다른 서비스에도 그대로 가져갈 수 있는 네 가지 교훈입니다.",
      "Four lessons you can take to any other product.",
    ),
    points: [
      t("데이터마다 주인을 하나로 정하면 협업·오프라인·AI가 서로를 망가뜨리지 않습니다", "One owner per data type keeps collaboration, offline work and AI from breaking each other"),
      t("상태를 정직하게 표시합니다: 운영 중·설정 필요·실험을 섞지 않습니다", "Label status honestly: never mix live, configured and experimental"),
      t("모호한 실패는 몰래 재시도하지 않고 사용자에게 보여줍니다", "Show ambiguous failures instead of silently retrying"),
      t("데모에서 찾은 버그는 회귀 테스트로 남깁니다", "Every bug found in a demo becomes a regression test"),
    ],
    notes: t(
      "4가지를 천천히 읽으며 오늘의 예시를 붙입니다. 주인 하나는 원장 DB, 정직한 상태는 상태 배지, 모호한 실패는 AI 재전송 금지, 회귀 테스트는 서비스 워커 연속성 테스트입니다.\n근거는 user-ai-transport.test.ts입니다. ‘여러분 서비스에서 먼저 주인을 정할 데이터는 무엇인가요?’ 다음은 한계입니다. 질문이 나오면 ‘Ambiguous-failure rule’ 카드를 엽니다.",
      "Read the 4 lessons slowly and tie each to an example from today: one owner is the ledger database, honest status is the status badges, ambiguous failures are the no-resend AI rule, and regression tests are the service worker continuity tests.\nThe basis is user-ai-transport.test.ts. Ask: ‘Which data in your product needs a single owner first?’ Next, the limits. If asked, open the ‘Ambiguous-failure rule’ card.",
    ),
    chapterId: "troubleshooting-evidence",
    evidence: [
      "docs/operations/canonical-database-topology.md",
      "apps/web/src/domains/legal/technology/engineering-atlas-content.test.ts",
      "apps/web/src/shared/ai/user-ai-transport.test.ts",
      "apps/api/src/modules/studio-ai/studio-ai-provider.test.ts",
      "apps/web/src/shared/ai/free-ai-runtime-budget.test.ts",
      "apps/web/src/app/service-worker/studio-service-worker-continuity.test.ts",
    ],
    relatedAtlasIds: ["ambiguous-failure-no-retry", "implemented-not-wired-modules", "drawing-quality-gates"],
    seconds: 50,
  },
  {
    id: "talk-limits",
    section: "lessons",
    layout: "lessons",
    eyebrow: t("07 · 한계와 다음 단계", "07 · LIMITS AND NEXT STEPS"),
    title: t("아직 실험 중인 것을 먼저 말합니다", "Saying what is still experimental, first"),
    lead: t(
      "아래 상태는 기술 스토리 챕터의 현재 상태를 그대로 가져온 것입니다.",
      "The statuses below come directly from the engineering story chapters.",
    ),
    points: [
      t("구현과 적용은 다릅니다: 테스트가 있어도 제품이 부르지 않는 모듈은 ‘연결 대기’로 따로 분류", "Implemented is not wired: tested modules the product never calls are tracked as awaiting wiring"),
      t("P2P 허들은 원격 3명까지(64·23·8·3 사다리) — 큰 회의·방송은 SFU 같은 구조가 필요하고 구현이 없음", "Huddles cap at 3 remote peers (64·23·8·3 ladder); large meetings need an SFU-like design that does not exist yet"),
      t("무료 인프라의 대가는 콜드 스타트와 SLA 부재 — 필요하면 비용·책임을 함께 승인해 올림", "Free infrastructure costs cold starts and no SLA — cost and responsibility are upgraded together by approval"),
      t("브라우저 저장소는 영구 백업이 아님 — 내보내기·개인 클라우드를 안내", "Browser storage is not a permanent backup — export and personal cloud are recommended"),
    ],
    notes: t(
      "한계를 먼저 말하면 질문이 대화가 됩니다. 배지는 기술 스토리 챕터의 상태 그대로입니다.\n가장 큰 한계는 구현과 적용의 차이입니다. 테스트가 있어도 제품이 부르지 않는 모듈은 연결 대기이고, 허들은 원격 3명까지라 큰 회의에는 SFU가 필요합니다. 근거는 studio-p2p-huddle-protocol.ts입니다. 다음은 질의응답입니다. 질문이 나오면 ‘Wiring audit’ 카드를 엽니다.",
      "Naming limits first turns questions into a conversation. The badges come straight from the engineering story chapters.\nThe biggest limit is the gap between implemented and wired: modules with tests that the product never calls are awaiting wiring, and huddles allow 3 remote peers, so large meetings would need an SFU. The basis is studio-p2p-huddle-protocol.ts. Next, Q&A. If asked, open the ‘Wiring audit’ card.",
    ),
    chapterId: "webrtc-media-authority",
    statusChapterIds: [
      "brush-engine",
      "collaborative-crdt-boundary",
      "webrtc-media-authority",
      "web-3d-engine",
      "virtual-studio-world-authority",
      "free-ai-routing",
      "nextgen-web-experiments",
    ],
    evidence: ["docs/studio-p2p-huddle.md", "render.yaml", "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-protocol.ts"],
    relatedAtlasIds: ["implemented-not-wired-modules", "webrtc-mesh-limits", "proximity-hysteresis-160-220", "hokusai-wasm-natural-media"],
    seconds: 50,
  },
  {
    id: "talk-qa",
    section: "qa",
    layout: "qa",
    eyebrow: t("08 · 질의응답", "08 · Q&A"),
    title: t("질문 받겠습니다", "Questions welcome"),
    lead: t(
      "답은 구현된 경로, 실제로 검증한 결과, 아직 확인하지 않은 범위로 나눠 드립니다. QR로 도감과 지도를 직접 열어 보세요.",
      "Answers are split into the implemented path, what was actually verified and what is not yet verified. Scan the QR code to open the atlas and maps yourself.",
    ),
    points: [],
    links: [
      { href: "/about/technology/story", label: t(`제작 스토리 — ${CHAPTER_COUNT}개 챕터와 근거`, `Engineering story — ${CHAPTER_COUNT} chapters with evidence`) },
      { href: "/about/technology/guides", label: t("적용 가이드 — 우리 서비스에 옮기기", "Guides — apply it to your product") },
      { href: "/about/technology/glossary", label: t("용어집 — 쉬운 말로 다시 듣기", "Glossary — terms in plain language") },
    ],
    qr: { href: "/about/technology/atlas", label: t("기술 도감·지도 열기", "Open the tech atlas and maps") },
    notes: t(
      "모르는 질문에는 ‘기술 스토리의 근거를 확인하고 답변드리겠습니다’라고 답하고, 추측으로 수치를 말하지 않습니다. 답은 구현된 경로, 실제로 검증한 결과, 아직 확인하지 않은 범위로 나눠 드립니다.\nQR을 찍으면 기술 도감과 지도 5개가 열려, 오늘 본 도식과 코드를 그 자리에서 다시 볼 수 있습니다. 시간이 남으면 청중에게 자기 서비스에서 먼저 분리하고 싶은 경계를 묻습니다. 질문이 나오면 ‘Wiring audit’ 카드를 엽니다.",
      "For questions you cannot answer, say ‘Let me verify against the engineering story evidence and follow up’, and never guess numbers. Answers are split into the implemented path, what was actually verified and what is not yet verified.\nScanning the QR opens the tech atlas and the 5 maps so the diagrams and code from today can be revisited on the spot. If time remains, ask which boundary the audience would separate first in their own product. If asked, open the ‘Wiring audit’ card.",
    ),
    evidence: ["apps/web/src/domains/legal/technology/engineering-tech-pages.ts"],
    relatedAtlasIds: ["implemented-not-wired-modules", "free-first-ai-routing", "webrtc-mesh-limits"],
    seconds: 60,
  },
] as const satisfies readonly TalkSlide[];
