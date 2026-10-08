import { t } from "./engineering-architecture-guide-kit";

import type { ArchitectureGuideSection } from "./engineering-architecture-guide-types";

/**
 * 아키텍처 해설 · 만들고 지키는 구조 1/3 — 코드 구성(8번)과 커밋에서 운영까지의 길(9번).
 * 사실은 2026-10-08 기준 코드·설정·시험으로 확인했다. 운영 대시보드(Cloudflare·Render·GitHub)의 실제 값은 열람하지 않았다.
 * 구간에 쓴 숫자는 engineering-architecture-guide-delivery.test.ts 가 코드와 대조한다.
 */

const MONOREPO_LAYOUT: ArchitectureGuideSection = {
  id: "monorepo-layout",
  group: "delivery",
  number: 8,
  title: t("코드는 어떻게 나뉘어 있나", "How the code is divided"),
  question: t("앱·패키지·도메인은 어떤 규칙으로 나뉘나?", "By what rules are apps, packages and domains divided?"),
  oneLine: t(
    "앱끼리는 서로의 코드를 가져다 쓰지 않고, 함께 쓰는 약속만 좁은 패키지에 둡니다.",
    "Apps never import each other's code; only shared promises live in narrow packages.",
  ),
  easy: t(
    "한 건물(저장소) 안에 가게(앱)가 여럿 입주해 있지만 서로의 벽에는 구멍을 내지 않습니다. 같이 써야 하는 물건만 공용 창고(패키지)에 두고, 경비(래칫)가 벽의 구멍 수를 숫자로 셉니다.",
    "Several shops (apps) share one building (the repository) but never cut holes in each other's walls. Only what must be shared goes into a common storeroom (a package), and a guard (the ratchet) counts the holes by number.",
  ),
  diagram: {
    id: "monorepo-layout-diagram",
    kind: "layers",
    title: t("한 저장소를 나누는 여섯 층", "Six layers that divide one repository"),
    caption: t(
      "앱은 서로 모르고, 앱 안은 한 방향으로만 의존하며, 어긴 개수는 숫자로 잠깁니다.",
      "Apps do not know each other, each app depends in one direction, and violations are locked by count.",
    ),
    alt: t(
      "맨 위의 앱 7개(제품 5, 실험 2)는 서로의 소스를 가져다 쓰지 않습니다. 웹 앱 안은 app, domains, platform, shared 네 영역으로 나뉘어 위에서 아래로만 의존하고, 기능은 도메인 폴더에 모입니다. 여러 앱이 실제로 함께 쓰는 약속만 공유 패키지 13개에 두고, 앱 사이를 가로지르는 시험은 tests/integration 에서만 하며, 맨 아래 래칫이 나쁜 import 개수를 JSON 상한에 못 박습니다.",
      "The 7 apps at the top (5 product, 2 lab) never import each other's source. Inside the web app there are four areas, app, domains, platform and shared, which depend only downward, and features gather in domain folders. Only promises that several apps really share go into 13 shared packages, tests that cross apps live only in tests/integration, and the ratchet at the bottom nails the count of bad imports to a JSON ceiling.",
    ),
    layers: [
      {
        id: "apps",
        label: t("앱 7개 · 제품 5, 실험 2", "7 apps: 5 product, 2 lab"),
        sub: t("web · admin-web · api · mobile · desktop-sync + 실험 2개", "web · admin-web · api · mobile · desktop-sync + 2 labs"),
        tone: "neutral",
        chips: ["Vite", "NestJS", "Capacitor"],
      },
      {
        id: "areas",
        label: t("웹 앱 안의 네 영역", "Four areas inside the web app"),
        sub: t("위에서 아래로만 부르고, 거꾸로는 금지", "calls go downward only; backwards is banned"),
        tone: "neutral",
        chips: ["app", "domains", "platform", "shared"],
      },
      {
        id: "domains",
        label: t("도메인 · 기능 단위 폴더", "Domains by capability"),
        sub: t("웹은 domains, API 는 modules 폴더", "domains in the web app, modules in the API"),
        tone: "neutral",
      },
      {
        id: "packages",
        label: t("공유 패키지 13개", "13 shared packages"),
        sub: t("둘 이상의 앱이 실제로 쓸 때만 올림", "only when two or more apps really use it"),
        tone: "neutral",
        chips: ["contracts", "core", "studio-*"],
      },
      {
        id: "tests",
        label: t("교차 앱 시험", "Cross-app tests"),
        sub: t("앱 사이 시험은 tests/integration 에만", "tests that span apps live only in tests/integration"),
        tone: "good",
        chips: ["Vitest"],
      },
      {
        id: "ratchet",
        label: t("경계 래칫 17개 규칙", "17 boundary ratchet rules"),
        sub: t("개수를 JSON 상한에 동결, 늘면 CI 실패", "counts frozen at a JSON ceiling; CI fails if one grows"),
        tone: "good",
      },
    ],
    brackets: [
      { label: t("제품 코드를 나누는 층", "Layers that divide product code"), layerIds: ["apps", "areas", "domains", "packages"] },
      { label: t("규칙을 지키는 장치", "Devices that keep the rules"), layerIds: ["tests", "ratchet"] },
    ],
  },
  steps: [
    t(
      "저장소 한 곳에 앱 7개(apps)와 공유 패키지 13개(packages)를 두고 pnpm 작업공간으로 묶습니다.",
      "One repository holds 7 apps and 13 shared packages, tied together as a pnpm workspace.",
    ),
    t(
      "앱끼리는 서로의 소스를 가져다 쓰지 않습니다. 함께 쓸 약속만 packages 로 나눕니다.",
      "Apps do not import each other's source; only shared promises are split out into packages.",
    ),
    t(
      "웹 앱 안은 app → domains → platform → shared 방향으로만 의존하고, 기능은 도메인 폴더에 둡니다.",
      "Inside the web app, dependencies run only app → domains → platform → shared, and features live in domain folders.",
    ),
    t(
      "앱 사이를 가로지르는 시험은 tests/integration 아래에만 둡니다.",
      "Tests that cross apps live only under tests/integration.",
    ),
    t(
      "나쁜 import 는 개수를 세어 JSON 상한에 고정하고, 늘어나면 CI 가 멈춥니다.",
      "Bad imports are counted and frozen at a JSON ceiling, and CI stops when one grows.",
    ),
  ],
  background: [
    t(
      "서비스가 커지면 '누가 누구의 코드를 가져다 쓰는가'가 엉킵니다. 화면 하나를 고쳤더니 관리자 화면이 깨지고, 서버를 바꿨더니 웹이 빌드되지 않고, 앱을 따로 올릴 수도 없게 됩니다. 그래서 ToonStudio 는 코드를 앱·패키지·도메인으로 나누는 규칙을 몇 개 정하고, 사람의 기억이 아니라 검사 스크립트가 지키게 했습니다.",
      "As a service grows, who imports whose code gets tangled. Fixing one screen breaks the admin screen, changing the server stops the web app from building, and apps can no longer be shipped separately. So ToonStudio set a few rules for dividing code into apps, packages and domains, and lets check scripts, not human memory, keep them.",
    ),
    t(
      "한 저장소(모노레포)의 pnpm 작업공간이 apps/*, packages/*, tests/integration/* 를 묶습니다. 앱은 따로 빌드·검사하는 단위(제품 앱 5개, 실험 앱 2개)이고, 웹·관리자·API 사이의 직접 소스 참조 6방향은 모두 0건으로 고정돼 있습니다. 웹 앱 안은 app, domains, platform, shared 네 영역이며 기능은 domains 아래 기능별 폴더에 모입니다. 둘 이상의 앱이 실제로 같은 구현을 쓸 때만 packages 로 올리고, 대표인 packages/contracts 는 React·NestJS·DB·Node 전용 import 를 금지해 브라우저와 서버가 함께 읽습니다.",
      "A pnpm workspace in one repository (a monorepo) ties together apps/*, packages/* and tests/integration/*. An app is a unit built and checked on its own (5 product apps, 2 lab apps), and direct source imports in all six directions among web, admin and API are frozen at zero. Inside the web app there are four areas, app, domains, platform and shared, and features gather in per-capability folders under domains. Code moves into packages only when two or more apps really use the same implementation, and the main one, packages/contracts, bans imports of React, NestJS, database and Node-only modules so browser and server can both read it.",
    ),
    t(
      "기능 구현을 packages/domains 로 올리는 방식도 있지만, 재사용 가능성만으로 올리면 앱 사이의 결합을 감추게 되어 택하지 않았습니다. 정리가 끝난 상태도 아닙니다. 2026-10-08 기준 웹의 shared 가 domains 를 거꾸로 부르는 25건과 도메인 간 깊은 import(상한 58)가 남아 있고, 관리자 화면 일부와 creator 도메인 최상위 파일도 아직 웹에 많이 남아 단계적으로 옮기는 중입니다.",
      "Moving feature code into packages/domains is another option, but promoting code only because it could be reused would hide coupling between apps, so it was not chosen. The cleanup is not finished either: as of 2026-10-08, 25 imports where web's shared code calls back into domains and deep cross-domain imports (ceiling 58) remain, and part of the admin screens and many top-level files of the creator domain still live in the web app, being moved step by step.",
    ),
  ],
  inService: [
    {
      what: t("웹 앱의 네 영역과 도메인", "The web app's four areas and domains"),
      role: t(
        "기능 코드는 domains 아래 기능별 폴더에 두고, 영역 사이 의존 방향은 ESLint 와 래칫이 지킵니다.",
        "Feature code sits in per-capability folders under domains, and ESLint and the ratchet guard the direction between areas.",
      ),
      paths: [
        "apps/web/src/domains",
        "apps/web/src/app",
        "apps/web/src/platform",
        "apps/web/src/shared",
        "docs/architecture/frontend-layered-architecture.md",
      ],
    },
    {
      what: t("작업공간과 앱·패키지 목록", "Workspace and the app and package list"),
      role: t(
        "pnpm-workspace.yaml 이 apps/*, packages/*, tests/integration/* 를 한 작업공간으로 묶습니다.",
        "pnpm-workspace.yaml ties apps/*, packages/* and tests/integration/* into one workspace.",
      ),
      paths: ["pnpm-workspace.yaml", "ARCHITECTURE.md", "package.json"],
    },
    {
      what: t("공유 계약 패키지", "The shared contracts package"),
      role: t(
        "브라우저와 서버가 함께 읽는 상수·검증 스키마·순수 함수만 두고, 환경 전용 import 는 금지합니다.",
        "It holds only constants, validation schemas and pure functions that browser and server both read, and bans environment-specific imports.",
      ),
      paths: ["packages/contracts/package.json", "packages/contracts/src/index.ts", "packages/contracts/README.md"],
    },
    {
      what: t("경계 래칫", "The boundary ratchet"),
      role: t(
        "import 를 읽어 17개 규칙별로 세고, JSON 상한을 넘으면 CI 가 실패합니다.",
        "It reads imports, counts them per 17 rules, and CI fails when a count passes its JSON ceiling.",
      ),
      paths: [
        "scripts/validate-app-boundaries.mjs",
        "config/architecture-boundary-ratchet.json",
        ".github/workflows/architecture-boundaries.yml",
        "eslint.config.mjs",
      ],
    },
    {
      what: t("스튜디오는 예외", "Studio is the exception"),
      role: t(
        "스튜디오는 페이지 폴더 대신 문서·명령·저장·렌더 권위로 나누고, 렌더러 역할은 기계 원장이 지킵니다.",
        "Studio is divided by document, command, storage and render authority instead of page folders, and a machine ledger keeps renderer roles.",
      ),
      paths: ["docs/architecture/studio-current-boundaries.md", "packages/studio-engine-registry/src/renderer-roles.ts"],
    },
  ],
  decisions: [
    {
      choice: t("앱끼리 직접 import 하지 않음", "Apps never import each other directly"),
      because: t(
        "따로 배포하고 따로 타입 검사·빌드할 수 있어야 하고, 한 앱의 변경이 다른 앱을 조용히 깨뜨리면 안 됩니다.",
        "Each app must be shippable, type-checkable and buildable on its own, and a change in one must not silently break another.",
      ),
      cost: t(
        "같은 코드를 두 앱이 쓰려면 packages 로 올리는 작업이 필요하고, '실제 두 번째 소비자가 생긴 범위만'이라는 기준을 지켜야 합니다.",
        "Sharing code between two apps takes the extra work of promoting it to a package, under the rule 'only where a real second consumer exists'.",
      ),
    },
    {
      choice: t("도메인 구현을 packages 로 올리지 않음", "Domain code is not promoted to packages"),
      because: t(
        "재사용 가능성만으로 공유 위치를 바꾸면 앱 사이의 결합이 가려져 경계 검사가 의미를 잃습니다.",
        "Moving code to a shared place just because it could be reused hides coupling between apps and robs the boundary check of meaning.",
      ),
      cost: t(
        "두 앱이 같은 구현을 쓰게 되면 그때 좁은 패키지로 옮기는 별도 작업이 필요합니다.",
        "When two apps come to use the same implementation, moving it into a narrow package is a separate piece of work.",
      ),
    },
    {
      choice: t("0이 아니라 현재 수치를 동결(래칫)", "Freeze today's numbers (ratchet), not demand zero"),
      because: t(
        "쌓인 위반을 한 번에 갚으면 기능 개발이 멈추므로, 새 위반만 막고 정리할 때마다 상한을 내립니다.",
        "Paying off every old violation at once would stall feature work, so only new violations are blocked and the ceiling is lowered as cleanup lands.",
      ),
      cost: t(
        "위반이 그대로 남아 있고, 상한은 PR 로 올릴 수 있어 막는 것은 리뷰뿐인데 CODEOWNERS 파일은 없고 브랜치 보호는 저장소로 확인하지 못했습니다.",
        "Violations remain, and a PR can raise the ceiling, so only review stops it, yet there is no CODEOWNERS file and branch protection could not be confirmed from the repository.",
      ),
    },
  ],
  pitfall: t(
    "'경계가 모두 0건'이라고 말하면 틀립니다. 앱 사이 직접 import 는 0이지만, 2026-10-08 기준 웹 안 shared→domains 25건이 남았고 도메인 간 깊은 import 도 상한 58 이하로 남아 있습니다(실측은 검증 스크립트가 매번 셉니다).",
    "Saying all boundaries are at zero is wrong. Direct imports between apps are zero, but as of 2026-10-08, 25 shared-to-domains imports remain in the web app, and deep cross-domain imports also remain at or under a ceiling of 58 (the validation script counts the measured value every time).",
  ),
  facts: [
    { value: "7", label: t("apps 폴더의 앱 수(제품 5 · 실험 2)", "Apps in the apps folder (5 product, 2 lab)"), source: "apps" },
    { value: "13", label: t("packages 폴더의 공유 패키지 수", "Shared packages in the packages folder"), source: "packages" },
    {
      value: "17",
      label: t("경계 래칫 규칙 수(앱 사이 직접 import 6방향 포함)", "Boundary ratchet rules (including the 6 directions between apps)"),
      source: "config/architecture-boundary-ratchet.json",
    },
    {
      value: "25 / 58",
      label: t(
        "2026-10-08 기준 상한: 웹 shared→domains / 도메인 간 깊은 import(정리하며 낮춤)",
        "Ceilings on 2026-10-08: web shared-to-domains / deep cross-domain imports (lowered as cleanup lands)",
      ),
      source: "config/architecture-boundary-ratchet.json",
    },
  ],
  status: "live",
  atlasIds: ["module-boundary-ratchet", "shared-contract-patterns", "renderer-role-ledger", "implemented-not-wired-modules"],
  chapterIds: ["architecture", "quality"],
  glossaryIds: ["monorepo", "ratchet", "renderer-role-ledger"],
};

const BUILD_AND_SHIP: ArchitectureGuideSection = {
  id: "build-and-ship",
  group: "delivery",
  number: 9,
  title: t("코드가 서비스가 되는 길", "How code becomes a service"),
  question: t("커밋에서 운영까지 무엇을 거치나?", "What does a commit pass through on its way to production?"),
  oneLine: t(
    "병합은 배포가 아닙니다. CI 를 통과한 뒤 사람이 승인한 커밋 하나를 단위별로 손으로 올립니다.",
    "Merging is not releasing: after CI, one human-approved commit is shipped by hand, unit by unit.",
  ),
  easy: t(
    "공장 검수(CI)를 마친 제품도 출하 도장(승인 SHA)이 찍혀야 나갑니다. 창고가 셋(DB·서버·화면)이라 같은 제품 번호로 하나씩 차례로 싣고, 문제가 생기면 창고마다 직전 상태로 되돌립니다.",
    "A product that passed factory inspection (CI) still ships only with a release stamp (the approved SHA). There are three warehouses (database, server, screen), so the same product number is loaded into them one at a time, and each warehouse returns to its previous state if something goes wrong.",
  ),
  diagram: {
    id: "build-and-ship-diagram",
    kind: "graph",
    title: t("커밋이 운영에 오르는 길", "The road from commit to production"),
    caption: t(
      "자동 검사를 통과한 뒤에는 사람이 승인한 SHA 하나가 DB, API, 정적 웹 순서로 손을 거쳐 오릅니다.",
      "After the automatic checks, one human-approved SHA climbs by hand through the database, the API and the static site in that order.",
    ),
    alt: t(
      "PR 이 CI core 의 필수 7개 잡을 통과하고 main 에 병합되지만 이것은 배포가 아닙니다. 그다음 사람이 40자리 SHA 하나를 승인하면 DB 마이그레이션, Core API, 정적 웹 순서로 단위마다 손으로 올립니다. 정적 웹 뒤에는 로그인과 업로드 같은 배포 후 점검을 하고, 문제가 있으면 단위마다 직전에 검증한 SHA 나 버전으로 되돌립니다.",
      "A PR passes the seven required jobs of CI core and merges into main, but that is not a release. A person then approves one 40-character SHA, and it is shipped by hand unit by unit in the order database migration, Core API, static site. After the static site come post-release checks such as sign-in and upload, and if something is wrong each unit returns to its previously verified SHA or version.",
    ),
    nodes: [
      { id: "ci", label: t("PR · CI core", "PR and CI core"), sub: t("필수 7개 잡 통과", "7 required jobs pass"), tone: "external", at: [0, 0] },
      { id: "main", label: t("main 병합", "Merge to main"), sub: t("배포가 아님", "not a release"), tone: "neutral", at: [1, 0] },
      { id: "approve", label: t("사람의 승인", "Human approval"), sub: t("40자리 SHA 1개", "one 40-char SHA"), tone: "warn", at: [2, 0] },
      { id: "db", label: t("① DB 변경", "1 Database"), sub: t("승인형 워크플로", "approval workflow"), tone: "server", at: [3, 0] },
      { id: "api", label: t("② Core API", "2 Core API"), sub: t("Render 수동 배포", "manual Render deploy"), tone: "server", at: [4, 0] },
      { id: "web", label: t("③ 정적 웹", "3 Static site"), sub: t("Cloudflare 수동 배포", "manual Cloudflare deploy"), tone: "edge", at: [5, 0] },
      { id: "check", label: t("배포 후 점검", "Smoke checks"), sub: t("로그인·업로드·실시간", "sign-in, upload, realtime"), tone: "local", at: [5, 1] },
      { id: "rollback", label: t("되돌리기", "Rollback"), sub: t("단위별 직전 SHA·version", "previous SHA or version"), tone: "warn", at: [4, 1] },
    ],
    edges: [
      { from: "ci", to: "main", label: t("통과", "pass") },
      { from: "main", to: "approve", label: t("별도 절차", "separate") },
      { from: "approve", to: "db", label: t("SHA 입력", "enter SHA") },
      { from: "db", to: "api", label: t("검증 뒤", "verified") },
      { from: "api", to: "web", label: t("origin 통과", "origin ok") },
      { from: "web", to: "check" },
      { from: "check", to: "rollback", style: "dashed", label: t("문제 시", "if broken") },
    ],
    groups: [
      { id: "auto", label: t("자동 · GitHub", "Automatic: GitHub"), nodeIds: ["ci", "main"], tone: "neutral" },
      { id: "manual", label: t("수동 · 사람이 승인하고 실행", "Manual: a person approves and runs"), nodeIds: ["approve", "db", "api", "web"], tone: "warn" },
    ],
  },
  steps: [
    t(
      "PR 에서는 CI core 의 필수 7개 잡이 모두 실제로 성공해야 하고, 문서는 이를 main 병합 조건으로 정합니다.",
      "On a PR, all 7 required CI core jobs must truly succeed, and the docs make that the condition for merging into main.",
    ),
    t(
      "main 에 합쳐도 배포되지 않습니다. Render 자동 배포는 꺼져 있고 push 만으로 운영이 바뀌지 않습니다.",
      "Merging into main deploys nothing: Render auto-deploy is off and a push alone changes nothing in production.",
    ),
    t(
      "사람이 승인한 40자리 main SHA 와 바꿀 배포 단위를 먼저 기록합니다.",
      "A person first records the approved 40-character main SHA and the deploy units that changed.",
    ),
    t(
      "DB 변경이 있으면 승인형 마이그레이션을 먼저 하고, 그다음 Core API 를 손으로 올려 origin 을 검증합니다.",
      "If the database changes, the approval-gated migration goes first, then the Core API is deployed by hand and its origin verified.",
    ),
    t(
      "마지막에 정적 웹을 dry-run 한 뒤 Cloudflare 에 올리고 로그인·업로드·실시간을 점검합니다.",
      "Last, the static site is dry-run, shipped to Cloudflare, and sign-in, upload and realtime are checked.",
    ),
    t(
      "문제가 생기면 단위마다 직전에 검증한 SHA 나 버전으로 되돌립니다.",
      "If something breaks, each unit returns to its previously verified SHA or version.",
    ),
  ],
  background: [
    t(
      "코드를 합치는 일과 사용자에게 내보내는 일을 한 버튼에 묶으면, 덜 검토된 코드나 비용이 드는 설정이 한꺼번에 나갈 수 있습니다. ToonStudio 는 둘을 떼어 놓았습니다. 커밋과 PR 은 GitHub 에서 자동으로 검사받고, 운영에 올리는 일은 사람이 승인한 커밋 하나로 단위별로 직접 합니다.",
      "Tying merging code and shipping it to users to one button can send half-reviewed code or a cost-bearing setting out together. ToonStudio keeps the two apart. Commits and PRs are checked automatically on GitHub, while putting something into production is done by hand, unit by unit, from one commit that a person approved.",
    ),
    t(
      "배포 단위는 셋입니다. 화면은 Vite 가 만든 dist 를 Cloudflare Static Assets 로 제공하고, 동적 요청만 Worker 가 Core API 로 넘깁니다. 서버(NestJS Core API)는 Render 에서 돌고, DB 변경은 승인형 GitHub 워크플로로 합니다. 정적 웹 배포 스크립트는 CI 가 만든 dist 를 올리지 않고 운영자 환경에서 규칙 검사, 빌드, 에셋 준비, 서비스 워커 점검, R2 동기화, wrangler 배포를 한 번에 순서대로 돌립니다.",
      "There are three deploy units. The screen is the dist built by Vite, served through Cloudflare Static Assets, and only dynamic requests are passed on to the Core API by a Worker. The server (the NestJS Core API) runs on Render, and database changes go through an approval-gated GitHub workflow. The static-site deploy script does not upload CI's dist; in the operator's environment it runs the rules check, build, asset preparation, service-worker check, R2 sync and wrangler deploy in one go, in order.",
    ),
    t(
      "대안은 push 마다 자동 배포하는 방식입니다. 빠르지만 비용과 검토 통제를 잃기 때문에 소유자가 2026-09-15 에 수동 승인 정책을 정했습니다. 대신 수동 절차가 병목이 될 수 있고, 지금 운영에 어떤 SHA 가 떠 있는지는 코드로 읽을 수 없어 릴리스 기록과 대시보드로 확인해야 합니다.",
      "The alternative is deploying automatically on every push. It is fast but loses cost and review control, so the owner set a manual-approval policy on 2026-09-15. In exchange a manual step can become a bottleneck, and which SHA is live in production cannot be read from the code, so it has to be checked in the release record and the dashboards.",
    ),
  ],
  inService: [
    {
      what: t("CI core: 병합 조건 7개 잡", "CI core: the 7 jobs behind a merge"),
      role: t(
        "lint·타입·회귀 5샤드·성능·접근성·빌드·DB 불변식을 모아, 모두 실제 성공이어야 core 가 통과합니다.",
        "It gathers lint, types, 5 regression shards, performance, accessibility, build and DB invariants, and core passes only if all truly succeed.",
      ),
      paths: [".github/workflows/ci.yml", "scripts/ci-core-regression-shards-impl.mjs", "docs/operations/ci-merge-reliability.md"],
    },
    {
      what: t("정적 웹 수동 배포 스크립트", "Manual deploy script for the static site"),
      role: t(
        "승인 SHA 등을 확인한 뒤 같은 실행에서 규칙 검사, 빌드, 에셋 준비, 서비스 워커 점검, R2 동기화, wrangler 배포를 돌립니다.",
        "After checking the approved SHA and more, one run does the rules check, build, asset preparation, service-worker check, R2 sync and wrangler deploy.",
      ),
      paths: [
        "scripts/deploy-cloudflare-static.mjs",
        "scripts/deploy-cloudflare-static.test.mjs",
        "deploy/cloudflare-static/wrangler.jsonc",
        "deploy/cloudflare-static/README.md",
      ],
    },
    {
      what: t("Core API 서비스와 origin 검증", "The Core API service and its origin check"),
      role: t(
        "Render 서비스 둘은 자동 배포가 꺼져 있고, 화면을 올리기 전 live·ready 응답 계약을 확인합니다.",
        "Both Render services have auto-deploy off, and the live and ready reply contract is checked before the screen ships.",
      ),
      paths: ["render.yaml", "scripts/verify-render-core-origin.mjs"],
    },
    {
      what: t("승인형 DB 마이그레이션", "Approval-gated database migration"),
      role: t(
        "release_sha 가 main 의 조상인지 확인한 뒤 체크섬 순서대로 적용하고 구조·권한을 검증합니다.",
        "It checks that release_sha is an ancestor of main, applies SQL in checksum-led order and verifies structure and permissions.",
      ),
      paths: [
        ".github/workflows/production-database-migrations.yml",
        "scripts/run-production-database-migrations.mjs",
        "scripts/production-database-migrations.manifest",
      ],
    },
    {
      what: t("배포 금지를 코드로 검사", "The deploy ban is checked by code"),
      role: t(
        "정책 스캐너가 워크플로 안의 wrangler 배포나 Render 배포 요청을 찾아 실패시킵니다(verify:free-infrastructure).",
        "A policy scanner fails the check when a workflow holds a wrangler deploy or a Render deploy request (verify:free-infrastructure).",
      ),
      paths: [
        "scripts/release-workflow-policy.mjs",
        "scripts/free-infrastructure-policy.mjs",
        "docs/operations/minimum-cost-deployment-policy.md",
      ],
    },
  ],
  decisions: [
    {
      choice: t("머지와 배포를 나누고 수동 승인", "Split merging from releasing, with manual approval"),
      because: t(
        "push 만으로 운영이 바뀌지 않아 덜 검토된 코드와 비용이 드는 설정이 함께 나가지 않습니다.",
        "A push alone changes nothing in production, so half-reviewed code and cost-bearing settings do not go out together.",
      ),
      cost: t(
        "수동 절차가 병목이 될 수 있고, 누가 언제 올렸는지는 별도 릴리스 기록에 남겨야 합니다.",
        "A manual step can become a bottleneck, and who shipped what and when has to be kept in a separate release record.",
      ),
    },
    {
      choice: t("DB·서버·화면을 따로 올리는 세 단위로 분리", "Three separate deploy units: database, server, screen"),
      because: t(
        "단위마다 쓰기 권위와 되돌릴 방법이 달라서, 바뀐 단위만 올리고 실패하면 그 단위만 되돌릴 수 있습니다.",
        "Each unit has its own write authority and way back, so only changed units ship and a failure rolls back only that unit.",
      ),
      cost: t(
        "세 단계가 각각 수동이고, 순서를 어기면 막는 코드는 찾지 못해 절차를 사람이 지켜야 합니다.",
        "Each of the three steps is manual, and no code that blocks a wrong order was found, so people must follow the procedure.",
      ),
    },
  ],
  pitfall: t(
    "'버튼 한 번에 DB·API·웹이 같은 SHA 로 올라간다'고 말하면 틀립니다. 세 단계는 각각 수동이고 정적 웹은 운영자 환경에서 다시 빌드합니다. 운영 대시보드의 현재 SHA는 열람하지 않았습니다.",
    "Saying one button ships the database, API and web with the same SHA is wrong. The three steps are separate manual procedures and the static site is rebuilt in the operator's environment. The dashboards' current SHA was not inspected.",
  ),
  facts: [
    { value: "7", label: t("CI core 가 요구하는 필수 잡 수", "Required jobs behind CI core"), source: ".github/workflows/ci.yml" },
    {
      value: "40",
      label: t("승인 SHA 의 자릿수(소문자 16진)", "Length of the approved SHA (lowercase hex)"),
      source: "scripts/deploy-cloudflare-static.mjs",
    },
    {
      value: "6",
      label: t("정적 웹 배포 스크립트가 순서대로 돌리는 명령 수", "Commands the static deploy script runs in order"),
      source: "scripts/deploy-cloudflare-static.mjs",
    },
    {
      value: "2",
      label: t("autoDeployTrigger 를 끈 Render 서비스 수", "Render services with autoDeployTrigger turned off"),
      source: "render.yaml",
    },
  ],
  status: "configured",
  atlasIds: [
    "manual-sha-release-gate",
    "static-first-edge-gateway",
    "release-order-expand-contract-rollback",
    "checksum-migration-ledger",
    "large-asset-delivery-r2-range",
  ],
  chapterIds: ["infrastructure", "cost-engineering"],
  glossaryIds: ["ci-cd", "manual-sha-release", "migration-checksum-ledger", "health-live-ready"],
};

export const ARCHITECTURE_DELIVERY_LAYOUT_SECTIONS: readonly ArchitectureGuideSection[] = [MONOREPO_LAYOUT, BUILD_AND_SHIP];
