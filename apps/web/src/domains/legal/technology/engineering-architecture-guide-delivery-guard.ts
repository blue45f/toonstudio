import { t } from "./engineering-architecture-guide-kit";

import type { ArchitectureGuideSection } from "./engineering-architecture-guide-types";

/**
 * 아키텍처 해설 · 만들고 지키는 구조 3/3 — 품질을 지키는 문(11번)과 AI와 함께 만드는 개발 방식(12번).
 * 사실은 2026-10-08 기준 훅·워크플로·검사 스크립트·설정 파일로 확인했다. GitHub 브랜치 보호 설정과 AI 도구의 실제 사용량은 저장소로 확인할 수 없어 쓰지 않았다.
 * 구간에 쓴 숫자는 engineering-architecture-guide-delivery.test.ts 가 코드와 대조한다.
 */

const QUALITY_GATES: ArchitectureGuideSection = {
  id: "quality-gates",
  group: "delivery",
  number: 11,
  title: t("무엇이 품질을 지키나", "What guards quality"),
  question: t("래칫·테스트·접근성·보안 검사는 어디서 막나?", "Where do ratchets, tests, accessibility and security checks block a change?"),
  oneLine: t(
    "내 컴퓨터의 훅, PR 의 CI core, 빌드·배포 스크립트의 검사, 사람이 여는 수동 배포 관문까지 단계마다 다른 문이 막습니다.",
    "Different gates block at each step: local hooks, the CI core, checks in the build and deploy scripts, and the manual release gate a person opens.",
  ),
  easy: t(
    "공항처럼 문이 여러 개입니다. 집 앞 보안 검색(훅), 탑승구 검사(CI), 활주로 점검(빌드 검사), 기장 승인(수동 배포)을 차례로 지나야 비행기가 뜹니다.",
    "It is like an airport with several gates: the security check at the door (hooks), the boarding-gate check (CI), the runway inspection (build checks) and the captain's approval (manual release) must all be passed before a plane takes off.",
  ),
  diagram: {
    id: "quality-gates-diagram",
    kind: "layers",
    title: t("검사가 막는 일곱 개의 문", "Seven gates where checks block a change"),
    caption: t(
      "위쪽일수록 빨리 걸리는 가벼운 검사이고, 맨 아래 수동 배포 관문만 사람이 엽니다.",
      "Higher gates are lighter checks that catch problems sooner, and only the manual release gate at the bottom is opened by a person.",
    ),
    alt: t(
      "첫째 문은 내 컴퓨터의 커밋과 푸시 훅으로 하네스와 잠금 파일과 lint와 비밀값을 봅니다. 둘째는 PR 의 CI core 로 일곱 개 잡이 모두 실제로 성공해야 합니다. 셋째는 import 와 파일 수와 경고 수를 기록된 상한에 묶는 구조 래칫이고, 넷째는 접근성 스모크와 시험의 정직성 검사, 다섯째는 비밀값과 취약점과 코드 분석입니다. 여섯째는 빌드와 배포 스크립트 안에서 프리캐시 예산과 CSP 와 헤더 규칙을 보는 검사이고, 마지막 일곱째는 사람이 여는 수동 배포 관문입니다.",
      "The first gate is the commit and push hooks on my machine, which look at the harness, the lockfile, lint and secrets. The second is CI core on a PR, where all seven jobs must truly succeed. The third is the structure ratchets that tie imports, file counts and warning counts to recorded ceilings, the fourth is the accessibility smoke test and the honesty checks on tests, and the fifth is secrets, vulnerabilities and code analysis. The sixth is the checks inside the build and deploy scripts on the precache budget, CSP and header rules, and the seventh is the manual release gate that a person opens.",
    ),
    layers: [
      {
        id: "hooks",
        label: t("① 내 컴퓨터 · 커밋과 푸시", "1 My machine: commit and push"),
        sub: t("커밋엔 하네스·lint·비밀값, 푸시엔 경계·타입", "commit: harness, lint, secrets; push: boundaries, types"),
        tone: "local",
        chips: ["Husky", "commitlint", "lint-staged", "Secretlint"],
      },
      {
        id: "ci",
        label: t("② PR · CI core 7개 잡", "2 PR: the 7 jobs of CI core"),
        sub: t("lint·타입·회귀 5샤드·성능·접근성·빌드·DB, 모두 실제 성공", "lint, types, 5 regression shards, perf, a11y, build, DB: all truly pass"),
        tone: "external",
        chips: ["GitHub Actions", "Vitest", "Playwright"],
      },
      {
        id: "ratchet",
        label: t("③ 구조 래칫", "3 Structure ratchets"),
        sub: t("import 17규칙 · 파일 수 · 경고 수 · 번들 크기 · 새 파일 1,000줄", "17 import rules, file counts, warnings, bundle size, 1,000-line new files"),
        tone: "good",
      },
      {
        id: "tests",
        label: t("④ 접근성과 시험의 정직성", "4 Accessibility and honest tests"),
        sub: t("axe 스모크 · 직렬 레인 · 시험 수집 하한", "axe smoke test, serial lane, test-collection floors"),
        tone: "neutral",
        chips: ["axe-core", "Playwright", "Vitest"],
      },
      {
        id: "security",
        label: t("⑤ 보안과 공급망", "5 Security and supply chain"),
        sub: t("비밀값 스캔 · audit(푸시·야간) · CodeQL(주 1회)", "secret scan, audit (push, nightly), CodeQL (weekly)"),
        tone: "neutral",
        chips: ["Secretlint", "pnpm audit", "CodeQL"],
      },
      {
        id: "build",
        label: t("⑥ 빌드·배포 스크립트 검사", "6 Build and deploy checks"),
        sub: t("프리캐시 예산 · CSP · 헤더 --check · sw.js · Zod와 기배포 SQL 고정", "precache budget, CSP, headers --check, sw.js, pinned Zod and shipped SQL"),
        tone: "neutral",
      },
      {
        id: "manual",
        label: t("⑦ 수동 배포 관문", "7 The manual release gate"),
        sub: t("승인 SHA · 승인형 DB 워크플로 · 배포 후 점검", "approved SHA, gated DB workflow, post-release checks"),
        tone: "warn",
      },
    ],
    brackets: [
      { label: t("기계가 막는 문", "Gates machines enforce"), layerIds: ["hooks", "ci", "ratchet", "tests", "security", "build"] },
      { label: t("사람이 여는 문", "The gate a person opens"), layerIds: ["manual"] },
    ],
  },
  steps: [
    t(
      "커밋할 때는 하네스·잠금 파일·lint·비밀값과 한글 제목을, 푸시할 때는 경계 검사·타입·변경 파일 lint 를 확인합니다.",
      "A commit checks the harness, lockfile, lint, secrets and Korean subject; a push checks boundaries, types and lint of changed files.",
    ),
    t(
      "PR 에서는 CI core 의 7개 잡(lint·타입·회귀·성능·접근성·빌드·DB)이 모두 실제로 성공해야 합니다.",
      "On a PR, all 7 jobs of CI core (lint, types, regression, performance, accessibility, build, DB) must truly succeed.",
    ),
    t(
      "구조 래칫이 나쁜 import·파일 수·경고 수·새 파일 크기·번들 크기를 기록된 값에 묶어 늘어나지 못하게 합니다.",
      "Structure ratchets tie bad imports, file counts, warning counts, new-file sizes and bundle size to recorded values so they cannot grow.",
    ),
    t(
      "접근성은 핵심 화면을 axe 로 검사하고, 시간을 재는 시험은 직렬 레인에서 돌며, 시험이 줄면 수집 하한이 막습니다.",
      "Accessibility is checked on key screens with axe, timing tests run in a serial lane, and a drop in tests trips the collection floor.",
    ),
    t(
      "빌드와 배포 스크립트 안에서는 프리캐시 예산·CSP·헤더 규칙·서비스 워커 파일을 검사하고, 운영 배포는 사람의 승인이 마지막 문입니다.",
      "The build and deploy scripts check the precache budget, CSP, header rules and service-worker file, and a person's approval is the last gate for production.",
    ),
  ],
  background: [
    t(
      "품질은 한 번의 큰 검사로 지켜지지 않습니다. 검사가 너무 늦으면 고치는 비용이 커지고, 너무 무거우면 사람들이 우회하고 싶어집니다. 그래서 ToonStudio 는 빠른 검사는 내 컴퓨터의 훅에, 무거운 검사는 PR 의 CI 에, 사람의 판단이 필요한 일은 수동 배포 관문에 나눠 두었습니다. 문마다 보는 것이 다릅니다.",
      "Quality is not kept by one big check. A check that comes too late makes fixing expensive, and one that is too heavy tempts people to skip it. So ToonStudio puts fast checks in the hooks on my machine, heavy checks in CI on a PR, and what needs human judgment in the manual release gate. Each gate looks at something different.",
    ),
    t(
      "래칫(ratchet)은 한쪽으로만 도는 톱니입니다. 나쁜 import 개수, 폴더별 파일 수, 린트 경고 수, 웹의 새 파일 크기(1,000줄), 스튜디오 번들 크기(마지막으로 받아들인 측정값의 2%까지)를 지금 값에 못 박아 '더 나빠지지는 않게' 합니다. 접근성은 PR 마다 핵심 화면 시나리오를 열어 axe 로 검사하고 심각·치명 위반만 실패로 치며, 전체 화면 전수 감사는 수동입니다. 보안은 비밀값 스캔을 core 에 두고 취약점 감사(pnpm audit)는 푸시·야간·수동으로 돌리며, 서비스 워커 프리캐시가 예산을 넘으면 빌드가 실패합니다.",
      "A ratchet is a gear that turns only one way. Bad import counts, files per folder, the lint warning count, the size of new web files (1,000 lines) and the Studio bundle size (within 2% of the last accepted measurement) are nailed to today's values so things cannot get worse. For accessibility, every PR opens key-screen scenarios and checks them with axe, failing only on serious and critical violations, while the exhaustive whole-site audit is manual. For security, the secret scan sits in core and the vulnerability audit (pnpm audit) runs on push, nightly and manually, and the build fails if the service-worker precache passes its budget.",
    ),
    t(
      "0건이 아니라 동결이라 위반이 남아 있고, 상한은 PR 로 올릴 수 있어 마지막 방어선은 사람의 리뷰입니다. 병합을 막는 것은 core 의 7개 잡이며, 취약점 감사·전수 접근성·CodeQL 같은 검사는 푸시·야간·주간·수동이라 매 PR 의 관문이 아닙니다. GitHub 브랜치 보호 설정은 저장소 파일로 확인할 수 없어, core 가 머지 조건이라는 DEPLOY.md 서술을 근거로 합니다.",
      "These are freezes, not zeros, so violations remain, and since a PR can raise a ceiling the last line of defense is human review. What blocks a merge are the 7 jobs of core; checks such as the vulnerability audit, the exhaustive accessibility audit and CodeQL run on push, nightly, weekly or by hand, so they are not a gate on every PR. GitHub branch-protection settings cannot be confirmed from the repository, so this rests on DEPLOY.md saying core is a merge condition.",
    ),
  ],
  inService: [
    {
      what: t("커밋·푸시 훅", "Commit and push hooks"),
      role: t(
        "커밋엔 하네스·잠금 파일·lint-staged·한글 제목을, 푸시엔 경계 검사·타입·변경 파일 lint·비밀값을 확인합니다.",
        "A commit checks the harness, lockfile, lint-staged and Korean subject; a push checks boundaries, types, changed-file lint and secrets.",
      ),
      paths: [".husky/pre-commit", ".husky/pre-push", "commitlint.config.cjs", "scripts/agent-harness.mjs"],
    },
    {
      what: t("CI core (병합 조건)", "CI core (the merge condition)"),
      role: t(
        "7개 잡이 모두 실제 성공이어야 core 가 통과하고, 회귀 시험은 5개 샤드로 나눠 돕니다.",
        "Core passes only when all 7 jobs truly succeed, and regression tests are split into 5 shards.",
      ),
      paths: [".github/workflows/ci.yml", "scripts/ci-core-regression-shards-impl.mjs", "docs/operations/ci-merge-reliability.md"],
    },
    {
      what: t("구조·크기 래칫과 시험 수집 하한", "Structure and size ratchets, test floors"),
      role: t(
        "import 17규칙·파일 수·경고 수·새 파일 줄 수·번들 크기를 기록된 값에 묶고, 시험이 조용히 줄면 하한이 막습니다.",
        "Imports (17 rules), file counts, warnings, new-file lines and bundle size are tied to recorded values, and a floor trips if tests quietly shrink.",
      ),
      paths: [
        "config/architecture-boundary-ratchet.json",
        "config/architecture-source-ratchet.json",
        "apps/web/src/shared/lib/__tests__/file-size-ratchet.test.ts",
        "scripts/check-studio-bundle.mjs",
        "scripts/bundle-baseline.json",
        "scripts/verify-toolchain-coverage.mjs",
      ],
    },
    {
      what: t("접근성 스모크", "Accessibility smoke test"),
      role: t(
        "핵심 화면을 실제 브라우저로 열어 axe 로 검사하고 심각·치명 위반만 실패로 치며, 전수 감사는 별도 수동 스크립트입니다.",
        "Key screens are opened in a real browser and checked with axe, failing only on serious and critical violations; the exhaustive audit is a separate manual script.",
      ),
      paths: ["e2e/a11y-smoke.spec.ts", "scripts/audit-sitewide-visual-ux.mjs"],
    },
    {
      what: t("보안과 공급망 점검", "Security and supply-chain checks"),
      role: t(
        "비밀값 스캔은 core 에서, 취약점 감사는 푸시·야간에, 코드 분석(CodeQL)은 PR·main push 와 주 1회 돕니다.",
        "The secret scan runs in core, the vulnerability audit on push and nightly, and code analysis (CodeQL) on PRs, main pushes and weekly.",
      ),
      paths: [
        "scripts/secretlint-files.mjs",
        ".github/workflows/codeql.yml",
        ".github/workflows/main-full-qa-fast-diagnostics.yml",
        "pnpm-workspace.yaml",
      ],
    },
  ],
  decisions: [
    {
      choice: t("무거운 보증은 CI 한 곳에, 가벼운 검사는 로컬에", "Heavy assurance in CI, light checks locally"),
      because: t(
        "예전엔 푸시 훅이 20~45분짜리 전체 검증을 돌렸고, 커밋 훅의 전체 타입 검사가 무관한 오류로 커밋을 막았습니다.",
        "The push hook once ran a 20 to 45 minute full chain, and the commit hook's full type check blocked commits over unrelated errors.",
      ),
      cost: t(
        "로컬 검증만으로는 전체 보증이 아니고, UI·API 변경은 브라우저·통합 시험을 따로 돌려야 합니다.",
        "Local checks alone are not full assurance, and UI or API changes need browser and integration tests run separately.",
      ),
    },
    {
      choice: t("병합 조건은 7개 잡, 느린 전수 검사는 따로", "Seven jobs gate merging; slow exhaustive audits run apart"),
      because: t(
        "전수 접근성 감사와 야간 진단을 매 PR 에 얹으면 대기열이 길어져 병합이 지연됩니다.",
        "Putting the exhaustive accessibility audit and the nightly diagnostics on every PR would lengthen the queue and delay merges.",
      ),
      cost: t(
        "전수 감사·취약점 감사 결과는 병합 뒤에야 알 수 있고, 야간 진단은 병합을 막지 않습니다.",
        "Exhaustive-audit and vulnerability results arrive only after merging, and nightly diagnostics do not block a merge.",
      ),
    },
    {
      choice: t("시험이 조용히 줄어드는 것도 검사", "Also check that tests are not quietly dropped"),
      because: t(
        "초록 불은 아무것도 보지 않아도 켜질 수 있어서, 수집한 시험 파일 수와 타입 검사 입력 수에 하한을 둡니다.",
        "A green light can show even when nothing was examined, so floors are set on collected test files and type-check inputs.",
      ),
      cost: t(
        "시험을 일부러 지울 때도 하한을 갱신하는 변경을 남겨야 합니다.",
        "Deleting tests on purpose also needs a visible change that updates the floor.",
      ),
    },
  ],
  pitfall: t(
    "'모든 PR 이 취약점 감사와 전수 접근성 검사를 통과한다'고 말하면 틀립니다. pnpm audit 는 core 에 없고 푸시·야간·수동에서 돌며, 전수 접근성 감사는 수동입니다.",
    "Saying every PR passes the vulnerability audit and the exhaustive accessibility check is wrong. pnpm audit is not in core and runs on push, nightly and manually, and the exhaustive accessibility audit is manual.",
  ),
  facts: [
    { value: "7", label: t("CI core 가 요구하는 필수 잡 수", "Required jobs behind CI core"), source: ".github/workflows/ci.yml" },
    {
      value: "17",
      label: t("import 경계 래칫 규칙 수", "Import-boundary ratchet rules"),
      source: "config/architecture-boundary-ratchet.json",
    },
    {
      value: "5",
      label: t("CI core 의 회귀 시험 샤드 수", "Regression-test shards inside CI core"),
      source: "scripts/ci-core-regression-shards-impl.mjs",
    },
    {
      value: "2,421 / 16",
      label: t(
        "2026-10-08 기준: lint:strict 경고 상한 / PR 마다 도는 axe 스모크 시나리오 수(데스크톱 10 · 모바일 4 · 터치 2)",
        "On 2026-10-08: the lint:strict warning ceiling / axe smoke scenarios per PR (10 desktop, 4 mobile, 2 touch)",
      ),
      source: "config/architecture-source-ratchet.json",
    },
  ],
  status: "live",
  atlasIds: [
    "module-boundary-ratchet",
    "axe-a11y-matrix",
    "test-honesty-and-time-budget-isolation",
    "security-supply-chain-chain",
    "fault-injection-and-soak",
    "drawing-quality-gates",
    "oss-supply-chain-pinning",
  ],
  chapterIds: ["quality", "troubleshooting-evidence"],
  glossaryIds: ["ratchet", "axe-wcag", "fault-injection", "soak-test", "lockfile-supply-chain", "csp"],
};

const AI_ASSISTED_DEV: ArchitectureGuideSection = {
  id: "ai-assisted-dev",
  group: "delivery",
  number: 12,
  title: t("AI와 함께 만드는 개발 방식", "Building with AI under rules"),
  question: t("AI 도구를 쓸 때 규칙과 검증은 어떻게 걸었나?", "How are rules and checks applied when AI tools help build?"),
  oneLine: t(
    "규칙은 AGENTS.md 한 곳에 두고, AI 의 '다 했어요'도 같은 훅·CI 문을 지나며 운영 배포엔 사람의 승인이 필요합니다.",
    "One AGENTS.md holds the rules, an AI's 'done' passes the same hooks and CI as anyone's, and a production release needs a person's approval.",
  ),
  easy: t(
    "조수가 여럿 와도 사무실 규칙은 벽에 붙은 한 장(AGENTS.md)뿐입니다. 조수가 '끝났어요'라고 해도 출입구 검사(훅·CI)를 지나야 하고, 건물 밖으로 내보내는 일(운영 배포)은 책임자 서명(사람의 승인)이 있어야 합니다.",
    "However many assistants come, the office rules are one sheet on the wall (AGENTS.md). Even when an assistant says 'finished', it must pass the entrance check (hooks and CI), and sending anything out of the building (a production release) needs a manager's signature (a person's approval).",
  ),
  diagram: {
    id: "ai-assisted-dev-diagram",
    kind: "graph",
    title: t("AI 의 변경이 지나는 문", "The gates an AI's change passes"),
    caption: t(
      "규칙은 한 곳에서 읽고, 결과는 사람의 변경과 같은 훅·CI 를 지나며, 운영 배포만 사람이 승인합니다.",
      "Rules are read from one place, the result passes the same hooks and CI as a person's change, and only the production release is approved by a person.",
    ),
    alt: t(
      "여러 AI 코딩 도구의 안내 파일은 AGENTS.md 한 곳의 규칙을 먼저 읽도록 가리킵니다. AI 는 그 규칙에 따라 변경을 제안하고, OpenWiki 는 코드를 찾는 길잡이로만 쓰입니다. 제안은 하네스와 훅, CI core 를 사람이 쓴 변경과 똑같이 통과해야 합니다. 그 뒤 사람의 리뷰가 강제되는지는 저장소로 확인하지 못했고, 운영 배포는 이 모든 것과 별개로 사용자의 명시적 승인이 있어야 합니다.",
      "The guide files of several AI coding tools point them to read the rules in one AGENTS.md first. The AI proposes changes under those rules, and OpenWiki serves only as a guide to find code. The proposal must pass the harness, the hooks and CI core exactly like a change written by a person. Whether a person's review after that is enforced could not be confirmed from the repository, and a production release needs the user's explicit approval apart from all of this.",
    ),
    nodes: [
      { id: "wiki", label: t("OpenWiki", "OpenWiki"), sub: t("길잡이 · 설정 필요", "a guide, setup needed"), tone: "external", at: [2, 0] },
      { id: "tools", label: t("AI 코딩 도구", "AI coding tools"), sub: t("어댑터 5개가 가리킴", "5 adapters point to rules"), tone: "ai", at: [0, 1] },
      { id: "rules", label: t("AGENTS.md", "AGENTS.md"), sub: t("루트 1 + 영역별 9", "1 root + 9 area files"), tone: "good", shape: "cylinder", at: [1, 1] },
      { id: "work", label: t("변경 제안", "Proposed change"), sub: t("근거 경로 먼저 · 작게", "evidence first, small"), tone: "ai", at: [2, 1] },
      { id: "local", label: t("내 쪽 검증", "Checks on my side"), sub: t("harness:verify · 훅", "harness:verify, hooks"), tone: "local", at: [3, 1] },
      { id: "ci", label: t("CI core", "CI core"), sub: t("필수 7개 실제 성공", "7 required, truly passed"), tone: "external", at: [4, 1] },
      { id: "human", label: t("사람의 리뷰", "Human review"), sub: t("강제 여부는 미확인", "enforcement unconfirmed"), tone: "warn", at: [5, 1] },
      { id: "release", label: t("수동 배포", "Manual release"), sub: t("별도 명시적 승인", "separate explicit approval"), tone: "edge", at: [5, 2] },
    ],
    edges: [
      { from: "tools", to: "rules", label: t("읽도록 안내", "told to read") },
      { from: "rules", to: "work", label: t("규칙 적용", "applies") },
      { from: "wiki", to: "work", style: "dashed", label: t("길잡이", "guide") },
      { from: "work", to: "local", label: t("제출", "submit") },
      { from: "local", to: "ci", label: t("푸시·PR", "push, PR") },
      { from: "ci", to: "human", label: t("통과 뒤", "after pass") },
      { from: "human", to: "release", label: t("병합은 승인 아님", "merge ≠ approval") },
    ],
    groups: [{ id: "same-gates", label: t("AI 도 사람과 같은 문", "Same gates as people"), nodeIds: ["local", "ci"], tone: "good" }],
  },
  steps: [
    t(
      "도구마다 다른 안내 파일(CLAUDE.md 등)은 규칙을 베끼지 않고 AGENTS.md 를 먼저 읽으라고 가리킵니다.",
      "Each tool's own guide file (CLAUDE.md and others) copies no rules and only points to AGENTS.md first.",
    ),
    t(
      "AI 는 근거 경로를 먼저 찾고, 한글 기록·증거 우선·비밀값 금지 규칙에 따라 작은 변경을 제안합니다.",
      "The AI finds evidence paths first and proposes small changes under the rules: Korean records, evidence first, no secrets.",
    ),
    t(
      "작성자는 harness:verify 로 바뀐 범위의 lint·비밀값·경계·타입을 확인하고, 커밋·푸시 훅이 한 번 더 막습니다.",
      "The author runs harness:verify for lint, secrets, boundaries and types in the changed scope, and the commit and push hooks block again.",
    ),
    t(
      "PR 에서는 사람이 쓴 변경과 똑같이 CI core 의 필수 7개 잡이 실제로 성공해야 합니다.",
      "On a PR, the 7 required CI core jobs must truly succeed, exactly as for a change written by a person.",
    ),
    t(
      "병합 전 사람의 리뷰는 강제 여부를 확인하지 못했고, 운영 배포는 별개로 사용자의 명시적 승인이 필요합니다.",
      "Whether a person's review before merging is enforced could not be confirmed, and a production release separately needs the user's explicit approval.",
    ),
    t(
      "문서와 코드가 다르면 소스·테스트가 먼저이고, OpenWiki 는 길잡이로만 씁니다.",
      "When documents and code disagree, source and tests come first and OpenWiki serves only as a guide.",
    ),
  ],
  background: [
    t(
      "AI 코딩 도구는 '다 했어요'라고 자신 있게 말하지만, 실제로 돌려 보았는지는 알 수 없습니다. 그래서 ToonStudio 는 AI 를 쓰는 규칙을 사람의 당부가 아니라 파일과 스크립트로 걸었습니다. 도구가 여럿이어도 같은 규칙을 읽고, 결과물은 사람이 만든 변경과 같은 문을 지나게 한 것입니다.",
      "An AI coding tool says 'done' with confidence, but you cannot tell whether it actually ran anything. So ToonStudio set the rules for using AI in files and scripts rather than in a person's reminders. However many tools there are, they read the same rules, and their output passes the same gates as a change made by a person.",
    ),
    t(
      "규칙은 루트 AGENTS.md 한 곳(한글 기본, 증거 우선, 완료 전 검증, 비밀값 금지, 운영 배포는 별도 승인)에 두고, 영역별 규칙은 하위 AGENTS.md 가 더합니다. 도구별 파일은 그곳을 가리키는 얇은 포인터입니다. harness:check 는 필수 파일 19개와 정책 문장이 남아 있는지 보고, harness:verify 는 바뀐 범위에 맞는 검사를 고르며, 한글 커밋 제목은 commitlint 가 훅과 CI 에서 확인합니다. 사실이 충돌하면 소스·테스트, 승인된 ADR(결정 기록), 아키텍처 문서, OpenWiki 순으로 판정합니다.",
      "The rules live in one root AGENTS.md (Korean by default, evidence first, verify before finishing, no secrets, production release only by separate approval), and nested AGENTS.md files add area rules. Each tool's file is a thin pointer to it. harness:check verifies that 19 required files and the policy passages remain, harness:verify picks the checks that fit the changed scope, and commitlint checks Korean commit subjects in the hooks and in CI. When facts conflict, they are judged in the order source and tests, accepted ADRs (decision records), architecture docs, then OpenWiki.",
    ),
    t(
      "한계도 분명합니다. 하네스는 어댑터가 AGENTS.md 를 '언급하는지'만 볼 뿐 도구가 실제로 읽었다는 증명이 아니고, harness:verify 는 전체 테스트를 기본으로 돌리지 않아(--full 필요) 전체 보증은 CI 의 몫입니다. 상한 같은 숫자는 고치면 바뀌므로 사람의 리뷰가 필요합니다.",
      "The limits are plain too. The harness only checks that an adapter mentions AGENTS.md, which does not prove a tool read it, and harness:verify does not run the full tests by default (--full is needed), so full assurance is CI's job. Numbers such as ceilings change when edited, so they need human review.",
    ),
  ],
  inService: [
    {
      what: t("에이전트 작업 규칙(AGENTS.md)", "Agent working rules (AGENTS.md)"),
      role: t(
        "한글 기본·증거 우선·검증·비밀값 금지·배포 승인 규칙을 한 곳에 두고, 영역별 규칙은 하위 파일이 더합니다.",
        "Korean by default, evidence first, verification, no secrets and release approval live in one place, and nested files add area rules.",
      ),
      paths: ["AGENTS.md", "apps/web/AGENTS.md", "apps/api/AGENTS.md", "scripts/AGENTS.md"],
    },
    {
      what: t("도구별 어댑터", "Tool adapters"),
      role: t(
        "Claude·Gemini·Copilot·Cursor·OpenCode 가 AGENTS.md 를 읽도록 안내하는 짧은 포인터 파일입니다.",
        "Short pointer files that send Claude, Gemini, Copilot, Cursor and OpenCode to AGENTS.md.",
      ),
      paths: ["CLAUDE.md", "GEMINI.md", ".github/copilot-instructions.md", ".cursor/rules/toonstudio.mdc", ".opencode/agent/toonstudio.md"],
    },
    {
      what: t("하네스와 훅", "The harness and hooks"),
      role: t(
        "필수 파일·정책 문장 점검(check), 변경 범위별 검증(verify), 한글 커밋 제목, PR 템플릿을 연결합니다.",
        "They tie together the check of required files and policy passages, scope-based verification, Korean commit subjects and the PR template.",
      ),
      paths: [
        "scripts/agent-harness.mjs",
        "docs/operations/agent-harness.md",
        ".husky/pre-commit",
        "commitlint.config.cjs",
        ".github/pull_request_template.md",
      ],
    },
    {
      what: t("OpenWiki 길잡이", "The OpenWiki guide"),
      role: t(
        "코드를 찾아가는 연결 위키와 작성 절차 스킬을 두되, 사실 판정은 코드·테스트가 먼저입니다.",
        "A linked wiki and a writing-procedure skill help find code, while code and tests decide what is true.",
      ),
      paths: ["openwiki/INSTRUCTIONS.md", ".agents/skills/openwiki/SKILL.md", ".github/workflows/openwiki-update.yml"],
    },
  ],
  decisions: [
    {
      choice: t("규칙 복사 대신 AGENTS.md 한 곳과 얇은 어댑터", "One AGENTS.md and thin adapters instead of copied rules"),
      because: t(
        "복사본은 시간이 지나며 서로 달라지므로 규칙을 한 파일에만 두고, 하네스가 연결이 남아 있는지 검사합니다.",
        "Copies drift apart over time, so the rules live in one file and the harness checks that the links remain.",
      ),
      cost: t(
        "'읽도록 시킴'과 '실제로 읽음'은 다르고, 하네스는 언급 여부만 확인합니다.",
        "Telling a tool to read is not the same as it reading, and the harness only checks for a mention.",
      ),
    },
    {
      choice: t("AI 의 말보다 소스·테스트와 실행한 검증을 증거로", "Evidence is source, tests and executed checks, not an AI's word"),
      because: t(
        "규칙이 소스·테스트를 먼저 보게 하고, 완료 보고에는 실제로 실행한 검증만 쓰게 하기 때문입니다.",
        "The rules make tools look at source and tests first and report only the checks that were actually run.",
      ),
      cost: t(
        "사람의 리뷰와 실제 실행 비용은 사라지지 않고, 자동화 범위가 넓을수록 승인 경계가 더 중요해집니다.",
        "Review and execution costs do not go away, and the wider the automation, the more the approval boundary matters.",
      ),
    },
    {
      choice: t("가벼운 검사는 로컬 훅에, 무거운 보증은 CI에", "Light checks in local hooks, heavy assurance in CI"),
      because: t(
        "예전에는 같은 보증을 커밋·푸시·CI 에서 세 번 치러 느렸고, 무관한 파일의 오류가 커밋을 막았습니다(훅 주석의 기록).",
        "The same assurance used to be paid for three times, at commit, push and CI, which was slow, and errors in unrelated files blocked commits (recorded in the hook comments).",
      ),
      cost: t(
        "하네스는 변경 범위의 빠른 게이트라서 UI·API 변경에는 브라우저·통합 시험이 더 필요하다는 안내만 냅니다.",
        "The harness is a fast gate scoped to the change, so for UI or API changes it only reminds you that browser and integration tests are needed.",
      ),
    },
  ],
  pitfall: t(
    "AI 도구를 실제로 얼마나 썼는지, Gemini·Copilot·Cursor 가 쓰였는지, OpenWiki 주간 갱신이 PR 을 냈는지, 병합 전 사람의 리뷰가 강제되는지는 저장소로 확인하지 못했습니다. 이 구간은 규칙과 검증 장치의 구조를 설명합니다.",
    "How much AI tooling was actually used, whether Gemini, Copilot or Cursor were used, whether the weekly OpenWiki update ever opened a PR, and whether a person's review before merging is enforced could not be confirmed from the repository. This section describes the structure of the rules and checks.",
  ),
  facts: [
    {
      value: "19",
      label: t("harness:check 가 매번 확인하는 필수 파일 수", "Required files that harness:check verifies every time"),
      source: "scripts/agent-harness.mjs",
    },
    {
      value: "1 + 9",
      label: t("AGENTS.md 개수(루트 1 + 영역별 하위 9)", "AGENTS.md files (1 root + 9 area files)"),
      source: "scripts/agent-harness.mjs",
    },
    {
      value: "5",
      label: t("AGENTS.md 를 가리키는 도구 어댑터 수", "Tool adapters that point to AGENTS.md"),
      source: "scripts/agent-harness.mjs",
    },
    { value: "7", label: t("CI core 가 요구하는 필수 잡 수", "Required jobs behind CI core"), source: ".github/workflows/ci.yml" },
  ],
  status: "live",
  atlasIds: ["agents-md-single-policy", "agent-harness-verify-gates", "openwiki-fact-precedence", "opencode-loop-commands"],
  chapterIds: ["ai-assisted-engineering", "troubleshooting-evidence", "quality"],
  glossaryIds: ["agent-harness", "openwiki", "conventional-commits", "adr"],
};

export const ARCHITECTURE_DELIVERY_GUARD_SECTIONS: readonly ArchitectureGuideSection[] = [QUALITY_GATES, AI_ASSISTED_DEV];
