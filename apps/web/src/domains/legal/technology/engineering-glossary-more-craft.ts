import { t } from "./engineering-glossary-more-kit";

import type { GlossaryTerm } from "./engineering-glossary-content";

/** 확장 용어집 · 개발 문화 · 배포. 팀이 코드를 다루고 내보내는 방식. */
export const GLOSSARY_MORE_CRAFT: readonly GlossaryTerm[] = [
  {
    id: "ratchet",
    category: "craft",
    term: t("래칫 (한 방향으로만 조이기)", "Ratchet (tighten one way only)"),
    definition: t(
      "나쁜 수치(파일 길이, 레거시 예외 수 등)를 지금 수준에서 얼려 두고 늘어나지 못하게만 막다가, 줄어들면 새 기준으로 다시 얼리는 규칙입니다.",
      "A rule that freezes a bad number (file length, count of legacy exceptions) at today's level, forbids growth and, when it shrinks, freezes the new lower level.",
    ),
    analogy: t(
      "한 방향으로만 돌아가는 래칫 렌치와 같습니다. 조이는 쪽으로는 돌아가고 풀리는 쪽으로는 걸려서 되돌아가지 않습니다.",
      "Like a ratchet wrench that turns only one way: it advances when tightening and catches so it never slips back.",
    ),
    inToonstudio: t(
      "파일 크기 래칫(scripts/check-source-file-size.mjs, 전체 시험에서는 shared/lib/__tests__/file-size-ratchet.test.ts)은 단일 파일이 비대해지는 일을 막으려는 것입니다. StudioCuttoonEditorHost.tsx 는 테스트 주석에 29,642줄까지 커졌다고 적혀 있고 지금도 약 2만 9천 줄로 가장 큰 파일입니다. 새 파일은 800줄이 상한이고, 기준선(scripts/source-file-size-baseline.json)에 기록된 기존 초과 파일은 기록된 줄 수 이상 자랄 수 없으며 줄이면 --tighten 으로 같은 변경에서 숫자도 낮춥니다.",
      "The file-size ratchet (scripts/check-source-file-size.mjs, and shared/lib/__tests__/file-size-ratchet.test.ts in the full tests) exists to stop single files from ballooning. A test comment says StudioCuttoonEditorHost.tsx once grew to 29,642 lines, and it is still the biggest file at roughly 29,000 lines. New files are capped at 800 lines, existing oversized files in the baseline (scripts/source-file-size-baseline.json) cannot grow past their recorded size, and when one shrinks the number is lowered with --tighten in the same change.",
    ),
    chapters: ["quality", "quality-gates"],
  },
  {
    id: "fault-injection",
    category: "craft",
    term: t("결함 주입 (일부러 고장 내 보기)", "Fault injection"),
    definition: t(
      "테스트 중에 일부러 파일 로딩을 실패시키거나 요청을 끊어, 시스템이 고장 났을 때 제대로 버티고 복구하는지 확인하는 시험입니다.",
      "A test that deliberately fails a file load or cuts a request to confirm the system holds up and recovers when something breaks.",
    ),
    analogy: t(
      "소방 훈련과 같습니다. 불이 나기를 기다리지 않고 경보를 울려 사람들이 제대로 대피하는지 미리 봅니다.",
      "Like a fire drill: instead of waiting for a real fire, sound the alarm and watch whether people actually evacuate.",
    ),
    inToonstudio: t(
      "scripts/check-studio-workspace-recovery.mjs 가 브라우저에서 선택 기능(가상 공간)의 코드 조각을 에러로 바꾸거나 에셋 요청을 abort 시켜, ‘선택 기능만 실패하고 메뉴와 목록 복구는 그대로 되는지’를 확인합니다. 이런 장애 시험은 코드가 아니라 실행 증거로 말하기 위한 장치입니다.",
      "scripts/check-studio-workspace-recovery.mjs makes the browser throw in an optional feature's code chunk (the virtual space) or abort an asset request, then confirms that only the optional part fails while menus and list recovery keep working. Such failure drills exist to speak from run evidence, not from code reading.",
    ),
    chapters: ["troubleshooting-evidence", "quality"],
  },
  {
    id: "soak-test",
    category: "craft",
    term: t("소크 테스트 (오래 켜 두고 보기)", "Soak test"),
    definition: t(
      "짧은 시험으로는 안 보이는 문제를 찾으려고 같은 화면을 몇 시간씩 켜 두고 쓰면서 메모리와 오류가 쌓이는지 지켜보는 시험입니다.",
      "A test that keeps one screen running and in use for hours to catch problems short checks miss, watching for memory growth and accumulating errors.",
    ),
    analogy: t(
      "자동차의 장거리 시험 주행과 같습니다. 5분 시운전에선 멀쩡해도 몇 시간 달려야 과열이 드러납니다.",
      "Like a long-distance road test for a car: fine on a five-minute spin, but overheating shows up only after hours.",
    ),
    inToonstudio: t(
      "scripts/verify-studio-five-hour-soak.mts 는 편집기 페이지 하나를 5시간(TOONSPECTRUM_SOAK_MINUTES=300) 켜 둔 채 실제로 그리고 붓을 바꾸고 되돌리며, 래스터가 살아 있는지·GC 뒤 JS 힙·긴 작업·예외·WebGPU 장치 손실을 표본 추출합니다. 현장에서 10분쯤부터 GPU·상태 오류가 쌓인다는 제보에서 출발했습니다. 이 글은 시험 도구의 존재를 말할 뿐 통과 결과는 말하지 않습니다.",
      "scripts/verify-studio-five-hour-soak.mts keeps one editor page alive for five hours (TOONSPECTRUM_SOAK_MINUTES=300) while really drawing, switching brushes and undoing, sampling raster liveness, JS heap after GC, long tasks, exceptions and WebGPU device loss. It started from field reports of GPU and state errors piling up around the 10-minute mark. This entry says the tool exists, not that it passed.",
    ),
    chapters: ["troubleshooting-evidence", "performance"],
  },
  {
    id: "axe-wcag",
    category: "craft",
    term: t("axe · WCAG (접근성 자동 점검)", "axe and WCAG (automated accessibility checks)"),
    definition: t(
      "WCAG 는 웹을 장애와 상관없이 쓸 수 있게 하는 국제 접근성 기준이고, axe 는 화면에서 그 기준 위반을 자동으로 찾아내는 도구입니다.",
      "WCAG is the international accessibility standard for making the web usable regardless of disability, and axe is a tool that finds violations on a page automatically.",
    ),
    analogy: t(
      "건물 준공 검사의 자동 측정기와 같습니다. 문 폭, 경사로 기울기 같은 기준을 사람이 일일이 재지 않아도 기계가 먼저 훑어 줍니다.",
      "Like an automatic gauge at a building inspection: door widths and ramp slopes are scanned by machine before a person checks each one.",
    ),
    inToonstudio: t(
      "pnpm test:a11y 가 e2e/a11y-smoke.spec.ts 를 돌려 @axe-core/playwright 로 데스크톱 10개·모바일 4개 경로를 검사하고, serious·critical 위반이 있으면 실패합니다. 자동 도구는 일부만 잡으므로 키보드 대체 경로와 스크린 리더 안내는 별도로 설계하고 도감 카드에 빈틈도 적어 둡니다. 자동 통과가 접근성 보증은 아닙니다.",
      "pnpm test:a11y runs e2e/a11y-smoke.spec.ts with @axe-core/playwright over 10 desktop and 4 mobile routes and fails on any serious or critical violation. Automated tools catch only part of the picture, so keyboard alternatives and screen-reader announcements are designed separately and gaps are listed in the atlas cards. Passing automatically is not an accessibility guarantee.",
    ),
    chapters: ["quality", "quality-gates"],
    atlasIds: ["keyboard-alternatives-for-drag"],
  },
  {
    id: "fail-visible",
    category: "craft",
    term: t("실패를 숨기지 않기 (fail-visible)", "Fail visible (no silent fallback)"),
    definition: t(
      "문제가 생겼을 때 조용히 다른 방법으로 갈아타 ‘성공한 것처럼’ 보이게 하지 않고, 실패 사실을 그대로 드러내는 설계 원칙입니다.",
      "A design principle of showing the failure as it is, instead of quietly switching to another way and looking successful.",
    ),
    analogy: t(
      "비행기 계기판의 경고등과 같습니다. 엔진 이상을 감춘 채 다른 엔진으로 몰래 날면, 정작 정비는 영영 못 합니다.",
      "Like a warning light on an aircraft panel: if the fault is hidden and another engine quietly takes over, the real repair never happens.",
    ),
    inToonstudio: t(
      "ADR-0018(2026-08-31)이 ‘자동 엔진 폴백 금지’를 정했습니다. 예전에는 실행 실패 뒤 다른 엔진으로 픽셀 권한을 넘겨 장치 손실을 다른 엔진의 성공으로 가렸고, 테스트 상태와 사용자가 본 픽셀이 어긋났습니다. 지금은 획 시작 때 레인을 고정하고 실패를 드러내며, AI 경로도 무료 풀 공급자의 402·429 같은 한도·결제 신호만 다음 공급자로 넘기고 나머지 실패는 그대로 알립니다.",
      "ADR-0018 (2026-08-31) forbids automatic engine fallback. Previously, after an execution failure pixel authority passed to another engine, hiding device loss behind another engine's success so tested state and user-visible pixels diverged. Now the lane is fixed at stroke start and failure is surfaced, and AI routes likewise pass only quota and payment signals such as a free-pool provider's 402 and 429 to the next provider and report every other failure as it is.",
    ),
    chapters: ["brush-render-authority", "troubleshooting-evidence"],
    atlasIds: ["stroke-surface-route-pointerdown", "webgpu-explicit-engine"],
  },
  {
    id: "feature-rollout",
    category: "craft",
    term: t("점진 롤아웃 (퍼센트 단위 공개)", "Gradual rollout (percentage release)"),
    definition: t(
      "새 기능을 모두에게 한꺼번에 켜지 않고 1%, 10%처럼 일부에게만 먼저 열어 문제가 없을 때 비율을 올려 가는 배포 방식입니다.",
      "Releasing a new feature to a small share first, such as 1% then 10%, and raising the share only while nothing goes wrong.",
    ),
    analogy: t(
      "새 메뉴를 가게 전체에 내기 전에 몇 테이블에만 시식으로 내 보는 것과 같습니다. 반응이 나쁘면 그 테이블만 거두면 됩니다.",
      "Like trying a new dish on a few tables before adding it to the whole menu: if the reaction is bad, only those tables are affected.",
    ),
    inToonstudio: t(
      "studio-feature-rollout.ts 의 버킷 수는 10,000(STUDIO_FEATURE_ROLLOUT_BUCKET_COUNT)이고, 라이브 잉크는 이 버킷을 브라우저에 저장해(studio-live-ink-rollout.ts) 배포 비율에 들어가는지 판정합니다. 이 버킷은 사용자나 기기의 식별자가 아니고 서버로 보내지 않습니다. 비율이 없으면 가능한 브라우저 모두에게 열리고, 잘못된 비율은 다른 렌더러로 바꾸지 않고 그 레인만 끕니다(라이브 잉크 롤아웃 정책).",
      "studio-feature-rollout.ts defines 10,000 buckets (STUDIO_FEATURE_ROLLOUT_BUCKET_COUNT), and live ink stores one in the browser (studio-live-ink-rollout.ts) to decide whether it falls inside the release share. The bucket is not a user or device identifier and is never sent to the server. A missing percentage admits every capable browser, and a malformed one turns that lane off instead of swapping renderers (live-ink rollout policy).",
    ),
    chapters: ["delivery", "cost-engineering"],
  },
  {
    id: "agent-harness",
    category: "craft",
    term: t("에이전트 하네스 (AI 코딩 도구의 작업 규칙)", "Agent harness (rules for AI coding tools)"),
    definition: t(
      "AI 코딩 도구가 어떤 규칙으로 일하고 어떤 검사를 통과해야 하는지를 파일과 스크립트로 못 박아 둔 작업 틀입니다. 도구가 바뀌어도 규칙은 같습니다.",
      "A working frame that pins down, as files and scripts, which rules AI coding tools follow and which checks they must pass, so the rules stay the same when the tool changes.",
    ),
    analogy: t(
      "공장의 작업 표준서와 검수 라인 같습니다. 새 작업자(도구)가 와도 같은 표준서를 읽고 같은 검수를 거칩니다.",
      "Like a factory's work-standard manual and inspection line: a new worker (tool) reads the same manual and passes the same inspection.",
    ),
    inToonstudio: t(
      "루트 AGENTS.md 가 단일 기준이고 Claude·Codex·Copilot 등의 어댑터는 이를 복제하지 않고 참조합니다. pnpm harness:doctor / check / verify(scripts/agent-harness.mjs)가 필수 파일 존재, 락파일 검증, 변경 파일 린트·시크릿 검사, 영역별 타입·구조 검증을 돌립니다. 지시가 겹치면 사용자 요구, 가까운 AGENTS.md, 루트 AGENTS.md 순으로 따릅니다.",
      "The root AGENTS.md is the single standard; adapters for Claude, Codex, Copilot and others refer to it instead of copying it. pnpm harness:doctor / check / verify (scripts/agent-harness.mjs) run required-file checks, lockfile verification, lint and secret scans on changed files, and area-specific type and structure checks. When instructions collide, the user's request wins, then the nearest AGENTS.md, then the root one.",
    ),
    chapters: ["ai-assisted-engineering", "quality-gates"],
    atlasIds: ["agent-harness-verify-gates", "agents-md-single-policy"],
  },
  {
    id: "openwiki",
    category: "craft",
    term: t("OpenWiki (상태를 밝히는 설명 문서)", "OpenWiki (explanations that state their status)"),
    definition: t(
      "코드를 대신하는 문서가 아니라, 코드·테스트·결정 기록으로 가는 길을 안내하는 설명 문서입니다. 모든 설명에 지금 상태가 붙어 있습니다.",
      "Explanatory docs that do not replace the code but guide readers to code, tests and decision records, with the current status on every explanation.",
    ),
    analogy: t(
      "관광 안내판과 같습니다. 건물 자체가 정답이고, 안내판은 어디에 무엇이 있는지와 ‘공사 중’ 같은 상태를 알려 줍니다.",
      "Like a tourist signboard: the building itself is the truth, and the board says what is where and whether it is ‘under construction’.",
    ),
    inToonstudio: t(
      "openwiki/ 의 작성 규칙(INSTRUCTIONS.md)은 모든 아키텍처 설명에 현재·마이그레이션·목표·레거시 예외·역사 자료 중 하나를 밝히게 합니다. 사실이 충돌하면 source/tests → accepted ADR → architecture docs → OpenWiki 순서로 판정하므로, 문서가 코드를 이기는 일은 없습니다(AGENTS.md §1).",
      "The writing rules of openwiki/ (INSTRUCTIONS.md) require every architecture explanation to state one of current, migration, target, legacy exception or historical material. When facts collide they are judged in the order source and tests, accepted ADR, architecture docs, then OpenWiki, so documentation never overrides code (AGENTS.md section 1).",
    ),
    chapters: ["ai-assisted-engineering", "architecture"],
    atlasIds: ["openwiki-fact-precedence"],
  },
  {
    id: "conventional-commits",
    category: "craft",
    term: t("컨벤셔널 커밋 (커밋 메시지 규칙)", "Conventional Commits"),
    definition: t(
      "커밋 제목을 type(scope): 요약 형식으로 쓰자는 약속입니다. 변경의 종류가 제목 첫머리에서 바로 보입니다.",
      "A convention for writing commit titles as type(scope): summary, so the kind of change shows right at the start.",
    ),
    analogy: t(
      "서류철의 색깔 라벨과 같습니다. 열어 보지 않아도 ‘수리 / 신규 / 정리’ 중 무엇인지 겉에서 알 수 있습니다.",
      "Like colour labels on file folders: you know whether it is repair, new or cleanup without opening it.",
    ),
    inToonstudio: t(
      "commitlint.config.cjs 가 type 을 build·chore·ci·docs·feat·fix·perf·refactor·revert·style·test 로 제한하고 제목 100자 이하를 요구하며, 제목에 한글이 있는지도 검사합니다(type/scope 와 식별자는 영문 유지, 자동화 scope 는 예외). 예: fix(studio): 레이어 선택 상태 복구. 한 커밋에는 하나의 논리적 변경만 담습니다.",
      "commitlint.config.cjs limits the type to build, chore, ci, docs, feat, fix, perf, refactor, revert, style and test, requires titles of at most 100 characters and checks that the subject contains Korean (type, scope and identifiers stay in English; automation scopes are exempt). Example: fix(studio): restore layer selection state. One commit carries one logical change.",
    ),
    chapters: ["quality", "ai-assisted-engineering"],
  },
  {
    id: "global-4culture-flipper-branching-webtoon",
    category: "craft",
    term: t("4대 문화권 반전 대합 & 무-eval 정적 분기 웹툰", "4-culture involution flipper & no-eval branching webtoon"),
    definition: t(
      "한국·일본·북미·중화권 읽기 방향 반전을 대합(f(f(x))=x)으로 보장하고 통화·도량형·1.38× 팽창을 검수하며, 막다른 길·eval() 없는 정적 인터랙티브 분기 웹툰 번들을 만드는 도구입니다.",
      "A ₩0 local toolchain enforcing exact involution (f(f(x))=x) across ko/jp/en/zh reading flips with unit/overflow QA, plus a no-eval static branching webtoon exporter blocking soft-locks.",
    ),
    analogy: t(
      "거울에 두 번 비추면 원위치로 정확히 돌아오는 해외 수출 검수판과, 독자가 막다른 길에 갇히지 않게 모든 갈래를 출판 전 점검하는 정적 게임북 컴파일러입니다.",
      "Like a reversible translation mirror for global editions paired with a gamebook validator proving no reader hits a dead end.",
    ),
    inToonstudio: t(
      "wasm64-supergap-global-ip-branch/ 의 auditAndFlipGlobalLocalization(전치사 'in' 오탐 방지·CNY 식별)과 InteractiveBranchingWebtoonExporter(소프트락·무가드 루프 차단·CSP 안전 HTML)를 검증했습니다.",
      "auditAndFlipGlobalLocalization (preposition 'in' guard, CNY detection) and InteractiveBranchingWebtoonExporter (soft-lock & loop checks, CSP-safe HTML) pass unit tests.",
    ),
    chapters: ["on-device-translation", "share-distribution-boundary"],
    atlasIds: ["global-4culture-flipper-branching-webtoon-narrative"],
  },
  {
    id: "smart-license-guardian-subcanvas-ip-studio",
    category: "craft",
    term: t("스마트 라이선스 가디언 · 서브캔버스 위임 · IP 파생 스튜디오", "Smart license guardian, sub-canvas delegation & IP studio"),
    definition: t(
      "만료·비상업·폰트 임베딩 위반을 내보내기 직전 하드 차단하고, AES-GCM 어시스턴트 부분 위임·정산 BOM 과 4종 2차 저작(CMYK·스프라이트·360°·15초 트레일러) SHA-256 봉인을 묶었습니다.",
      "Combines hard pre-export license blocking (+ XMP/iTXt/C2PA), AES-GCM scoped sub-canvas delegation with payout BOMs and 4-way SHA-256 sealed creator IP derivative bundling.",
    ),
    analogy: t(
      "외주 담당자에게는 맡은 컷만 봉인해 건네고, 출고 직전 라이선스 세관 심사를 통과한 원고만 아크릴 스탠디·스프라이트·360° 턴테이블·트레일러 상자에 봉인 테이프를 붙이는 공정입니다.",
      "Like scoping assistant pages under seal, clearing a rights customs gate and sealing standee, sprite, 360° turntable and trailer packages with SHA-256.",
    ),
    inToonstudio: t(
      "SmartLicenseGuardian(PNG iTXt CRC-32·C2PA), SubCanvasDelegationManager(미허용 변조 거부·정산 BOM), packageCreatorIpDerivatives(CMYK TAC≤300%·1바이트 변조 감지 봉인)를 검증했습니다.",
      "Verified in SmartLicenseGuardian (PNG iTXt CRC-32, C2PA), SubCanvasDelegationManager (scope guard + payout BOM) and packageCreatorIpDerivatives (SHA-256 seal).",
    ),
    chapters: ["licenses", "share-distribution-boundary"],
    atlasIds: ["smart-license-guardian-subcanvas-delegation-ip-studio"],
  },
  {
    id: "morphological-spline-rgss-capillary-ink",
    category: "brush",
    term: t("모폴로지 스플라인 · 4× RGSS 서브픽셀 · 모세관 번짐", "Morphological spline, 4× RGSS subpixel & capillary ink"),
    definition: t(
      "형태학적 필터로 스타일러스 선폭 튐을 정돈해 제어점을 줄이고, 4× 회전 격자·5탭 LCD 서브픽셀 선화와 섬유 이방성 모세관 수묵 번짐을 함께 처리하는 드로잉 커널입니다.",
      "Smooths stylus width spikes to prune spline knots while rendering 4× RGSS 5-tap LCD subpixel line-art and mass-conserving anisotropic capillary ink bleed.",
    ),
    analogy: t(
      "손떨림 자국은 매끄럽게 정돈해 가볍게 저장하고, 화면에서는 서브픽셀 눈금으로 날카로운 만화 펜선을, 젖은 한지 위에서는 결을 따라 번지는 먹물을 재현하는 화구입니다.",
      "Like smoothing jittery pen marks for compact storage while rendering sharp subpixel manga ink and fiber-guided sumi-e bleed on wet paper.",
    ),
    inToonstudio: t(
      "합성 스타일러스 입력에서 매듭 수 60% 이상 감소를 확인했습니다. 타일 요청 계획과 5탭 LCD 필터, 안료 질량 보존도 각각 단위 테스트로 확인했습니다. /studio 연결은 후속 단계입니다.",
      "Synthetic stylus input verified over 60% knot reduction. Separate unit tests cover tile-request planning, the 5-tap LCD filter and pigment conservation. /studio integration is a follow-up.",
    ),
    chapters: ["brush-engine", "performance"],
    atlasIds: ["morphological-spline-rgss-subpixel-capillary-ink"],
  },
];
