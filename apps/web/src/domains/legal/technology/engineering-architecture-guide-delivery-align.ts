import { t } from "./engineering-architecture-guide-kit";

import type { ArchitectureGuideSection } from "./engineering-architecture-guide-types";

/**
 * 아키텍처 해설 · 만들고 지키는 구조 2/3 — 프런트와 백엔드를 한 버전으로 맞추기(10번).
 * 사용자 요청: "SHA 처럼 백엔드·프런트 빌드를 맞추는 기술". 코드로 확인되는 장치만 쓰고, 코드에 없는 것은 없다고 쓴다.
 * 근거는 2026-10-08 기준 scripts/deploy-cloudflare-static.mjs, production-database-migrations.yml, verify-render-core-origin.mjs,
 * 서비스 워커 프리캐시 계획, packages/contracts 와 프로토콜 버전 시험이다. 운영 대시보드와 운영 응답 헤더는 열람하지 않았다.
 * 도감의 빌드 정렬 카드(engineering-atlas-platform-ops-build*.ts)와 같은 사실을 구조·흐름으로만 엮는다.
 */

const FRONT_BACK_ALIGNMENT: ArchitectureGuideSection = {
  id: "front-back-alignment",
  group: "delivery",
  number: 10,
  title: t("프런트와 백엔드를 한 버전으로 맞추기", "Keeping front end and back end on one version"),
  question: t("화면과 서버가 서로 다른 빌드를 보지 않게 하는 장치는?", "What keeps the screen and the server from seeing different builds?"),
  oneLine: t(
    "승인한 SHA 하나를 단위마다 관문에서 확인하고, 번들과 서버는 SHA 대신 내용 해시와 프로토콜 버전으로 어긋남을 거릅니다.",
    "One approved SHA is checked at each unit's gate, and bundle and server sift out mismatches with a content hash and a protocol version, not the SHA.",
  ),
  easy: t(
    "두 공장(서버·화면)에 같은 설계도 번호(SHA)로 납품하지만, 번호는 출하 서류에만 적히고 제품에는 내용물 지문과 규격 번호가 붙습니다. 규격이 다른 주문은 접수대(서버)가 돌려보냅니다.",
    "Two factories (server and screen) are supplied from the same blueprint number (the SHA), but the number appears only on shipping papers, while the products carry a content fingerprint and a spec number. The reception desk (the server) turns away an order of another spec.",
  ),
  diagram: {
    id: "front-back-alignment-diagram",
    kind: "sequence",
    title: t("승인 SHA 하나가 서버와 화면을 맞추는 순서", "How one approved SHA lines up server and screen"),
    caption: t(
      "단위마다 SHA 관문을 지나고, 도착한 번들은 내용 해시와 프로토콜 버전으로 서버와의 어긋남을 가립니다.",
      "Each unit passes an SHA gate, and the arrived bundle sifts out a mismatch with the server by content hash and protocol version.",
    ),
    alt: t(
      "운영자가 승인한 SHA 를 먼저 DB 워크플로에 넣으면 main 의 조상인지 확인하고 원장에 체크섬과 SHA 를 남깁니다. 다음으로 Core API 를 손으로 올리고 origin 검증 스크립트가 live·ready 응답 계약을 확인합니다. 마지막으로 같은 SHA 로 정적 웹을 배포하면 스크립트가 규칙 검사와 빌드와 sw.js 점검을 하고 새 번들을 보냅니다. 번들의 새 버전 표지는 SHA 가 아니라 내용 해시이며, 서버는 다른 프로토콜 버전의 실시간 메시지를 거절합니다.",
      "The operator enters the approved SHA into the DB workflow first, which checks that it is an ancestor of main and keeps the checksum and SHA in the ledger. Next the Core API is deployed by hand and an origin script checks the live and ready reply contract. Last, deploying the static site with the same SHA makes the script run the rules check, build and sw.js check, then ship the new bundle. The bundle's new-version marker is a content hash, not the SHA, and the server refuses realtime messages of another protocol version.",
    ),
    actors: [
      { id: "op", label: t("운영자", "Operator"), sub: t("승인한 main SHA", "approved main SHA"), tone: "warn" },
      { id: "db", label: t("DB 워크플로", "DB workflow"), sub: t("GitHub Actions · 승인형", "GitHub Actions, gated"), tone: "server" },
      { id: "api", label: t("Core API", "Core API"), sub: t("Render · 수동 배포", "Render, manual deploy"), tone: "server" },
      { id: "web", label: t("정적 웹 배포", "Static deploy"), sub: t("스크립트 + Cloudflare", "script + Cloudflare"), tone: "edge" },
      { id: "tab", label: t("사용자 탭", "User's tab"), sub: t("브라우저의 번들", "the bundle in a browser"), tone: "local" },
    ],
    messages: [
      { from: "op", to: "db", label: t("release_sha 입력", "enter release_sha"), note: t("형식·HEAD·main 조상 확인", "format, HEAD, main ancestor") },
      {
        from: "db",
        to: "db",
        label: t("체크섬·SHA 를 원장에 기록", "ledger keeps checksum, SHA"),
        note: t("구조·권한 검증이 끝나야 다음", "next only after verification"),
      },
      { from: "op", to: "api", label: t("Render 수동 배포", "manual Render deploy"), note: t("autoDeployTrigger 꺼짐", "autoDeployTrigger is off") },
      {
        from: "op",
        to: "api",
        label: t("verify:render-core-origin", "verify:render-core-origin"),
        note: t("live·ready 응답 계약, 리다이렉트 없음", "live and ready contract, no redirect"),
      },
      {
        from: "op",
        to: "web",
        label: t("같은 SHA 로 production 배포", "production deploy, same SHA"),
        note: t("승인 문구·40자리·main·깨끗한 트리·HEAD", "phrase, 40 chars, main, clean, HEAD"),
      },
      { from: "web", to: "web", label: t("규칙 --check · 빌드 · sw.js 점검", "rules --check, build, sw.js check"), note: t("어긋나면 배포 중단", "a mismatch stops the deploy") },
      {
        from: "web",
        to: "tab",
        label: t("새 HTML · sw.js", "new HTML + sw.js"),
        style: "dashed",
        note: t("buildId 는 내용 해시, SHA 아님", "buildId is a content hash, not the SHA"),
      },
      { from: "tab", to: "api", label: t("저장 요청 + CSRF 헤더", "save request + CSRF header"), note: t("헤더 이름은 contracts 한 파일", "header name from one contracts file") },
      {
        from: "tab",
        to: "api",
        label: t("실시간 메시지(프로토콜 버전)", "realtime message (protocol version)"),
        note: t("웹·API 상수 8, 시험이 같음을 단언", "web and API constant 8, a test asserts equal"),
      },
      {
        from: "api",
        to: "tab",
        label: t("다른 버전이면 거절", "another version is refused"),
        style: "dashed",
        note: t("z.literal(8) · 서버는 자기 SHA 를 답하지 않음", "z.literal(8); the server never states its SHA"),
      },
    ],
  },
  steps: [
    t(
      "운영자가 승인한 main SHA 하나로 DB → Core API → 정적 웹 순서를 정하고, 단위마다 같은 SHA 를 씁니다.",
      "One approved main SHA sets the order database, Core API, static site, and every unit uses that same SHA.",
    ),
    t(
      "DB 워크플로는 SHA 가 main 의 조상인지 확인하고, SQL 체크섬과 SHA 를 원장에 남깁니다.",
      "The DB workflow checks that the SHA is an ancestor of main and keeps the SQL checksum and the SHA in the ledger.",
    ),
    t(
      "Core API 를 올린 뒤 verify:render-core-origin 이 live·ready 응답 계약을 확인해야 화면을 올립니다.",
      "After the Core API is up, verify:render-core-origin must confirm the live and ready reply contract before the screen ships.",
    ),
    t(
      "정적 웹 스크립트는 HEAD 가 승인 SHA 와 같을 때만 규칙 검사·빌드·sw.js 점검·배포를 돌립니다.",
      "The static-site script runs the rules check, build, sw.js check and deploy only when HEAD equals the approved SHA.",
    ),
    t(
      "브라우저에 도착한 번들은 SHA 대신 내용 해시(buildId)와 해시 이름 파일로 새 버전임을 알립니다.",
      "A bundle that reaches the browser announces a new version through a content hash (buildId) and hashed file names, not the SHA.",
    ),
    t(
      "서버는 다른 프로토콜 버전의 실시간 메시지를 거절해 어긋난 옛 탭이 조용히 섞이지 않게 합니다.",
      "The server refuses realtime messages of another protocol version, so a mismatched old tab never blends in silently.",
    ),
  ],
  background: [
    t(
      "화면(프런트)과 서버(백엔드)는 따로 만들어져 따로 올라갑니다. 둘이 서로 다른 시점의 코드를 보면, 서버가 요구하는 이름을 화면이 틀리게 보내거나 화면이 찾는 파일이 사라지는 일이 생깁니다. 그래서 '같은 커밋'이라는 약속(SHA)을 기준으로 삼고, 그 약속이 지켜졌는지는 사람의 기억이 아니라 코드가 단계마다 확인합니다.",
      "The screen (front end) and the server (back end) are built and shipped separately. If they see code from different moments, the screen may send a name the server no longer expects, or a file the screen looks for may be gone. So the promise of the same commit (the SHA) is the baseline, and code, not human memory, checks at each step that the promise holds.",
    ),
    t(
      "SHA(커밋의 40자리 지문) 관문은 코드로 세 곳에 있습니다. 정적 웹 배포 스크립트는 승인 문구, 소문자 40자리 SHA, main 브랜치, 깨끗한 작업 트리, HEAD 일치를 모두 요구하고, DB 워크플로는 release_sha 가 main 의 조상인지 확인한 뒤 원장에 남기며, 수동 컨테이너 워크플로는 이미지 태그에 SHA 를 새깁니다. 서버와 화면 사이의 약속은 packages/contracts 와 프로토콜 버전 문이 맡고, 화면 쪽 새 버전 표지는 내용 해시 buildId 와 해시 이름 파일이 맡습니다.",
      "The SHA (a 40-character fingerprint of a commit) gate sits in code in three places. The static deploy script demands the approval phrase, a lowercase 40-character SHA, the main branch, a clean worktree and HEAD equal to the SHA, the DB workflow checks that release_sha is an ancestor of main before keeping it in the ledger, and the manual container workflow stamps the SHA into the image tag. The promise between server and screen is carried by packages/contracts and a protocol-version gate, and the screen's new-version marker is carried by a content-hash buildId and hashed file names.",
    ),
    t(
      "다만 SHA 가 번들이나 서버 응답에 새겨져 있지는 않습니다. 운영 사이트에서 '지금 어느 커밋인가'는 코드로 읽을 수 없고 릴리스 기록과 대시보드로 확인해야 합니다. 배포 순서도 사람이 따르는 절차라 어기면 막는 코드는 없고, 정적 웹은 CI 의 dist 가 아니라 운영자 환경에서 다시 빌드합니다. 빌드 때 SHA 를 번들과 헬스 응답에 넣는 방법은 흔한 대안이지만 지금은 설계 후보일 뿐입니다.",
      "However, the SHA is not stamped into the bundle or the server replies. Which commit is live on the production site cannot be read from the code and has to be checked in the release record and the dashboards. The release order is a procedure people follow and no code blocks a wrong order, and the static site is rebuilt in the operator's environment rather than taken from CI's dist. Stamping the SHA into the bundle and the health reply at build time is a common alternative, but today it is only a design candidate.",
    ),
  ],
  inService: [
    {
      what: t("정적 웹 SHA 승인 문", "The SHA approval gate for the static site"),
      role: t(
        "production 배포는 승인 문구·40자리 SHA·main·깨끗한 트리·HEAD 일치를 모두 통과해야 검사와 배포가 시작됩니다.",
        "A production deploy starts its checks and release only after the approval phrase, a 40-character SHA, main, a clean tree and HEAD equal to the SHA all pass.",
      ),
      paths: ["scripts/deploy-cloudflare-static.mjs", "scripts/deploy-cloudflare-static.test.mjs"],
    },
    {
      what: t("DB 원장과 이미지의 SHA 기록", "SHA records in the DB ledger and the image"),
      role: t(
        "DB 워크플로는 SHA 가 main 의 조상인지 보고 원장에 남기고, 컨테이너 워크플로는 이미지 태그에 SHA 를 새깁니다.",
        "The DB workflow checks that the SHA is an ancestor of main and keeps it in the ledger, and the container workflow stamps the SHA into the image tag.",
      ),
      paths: [
        ".github/workflows/production-database-migrations.yml",
        "apps/api/src/platform/database/migrations/0023_production_migration_ledger.sql",
        ".github/workflows/api-container-release.yml",
      ],
    },
    {
      what: t("빌드 산출물의 지문과 점검", "Fingerprints and checks on build output"),
      role: t(
        "헤더 규칙 --check, 프리캐시 예산 실패, buildId 박기, dist/sw.js 점검이 배포 전에 어긋남을 막습니다.",
        "The headers --check, the precache budget failure, the buildId stamp and the dist/sw.js check block a mismatch before deploy.",
      ),
      paths: [
        "apps/web/vite.config.ts",
        "apps/web/src/app/service-worker/studio-service-worker-precache-plan.ts",
        "scripts/verify-static-service-worker.mjs",
        "scripts/cloudflare-static-rules.mjs",
      ],
    },
    {
      what: t("Core API origin 검증", "Core API origin verification"),
      role: t(
        "배포한 API 가 live·ready 응답 계약대로인지, 리다이렉트와 Vercel 흔적이 없는지 화면을 올리기 전 절차로 확인합니다.",
        "Before the screen ships, a step confirms that the deployed API follows the live and ready contract, with no redirects or Vercel traces.",
      ),
      paths: ["scripts/verify-render-core-origin.mjs", ".github/workflows/production-readiness.yml"],
    },
    {
      what: t("공유 계약과 버전 문", "Shared contract and version gate"),
      role: t(
        "CSRF 헤더 이름은 contracts 한 파일에서, CRDT 프로토콜 8은 웹·API 상수와 통합 시험과 서버의 z.literal 로 맞춥니다.",
        "The CSRF header name comes from one contracts file, and CRDT protocol 8 is aligned by web and API constants, an integration test and the server's z.literal.",
      ),
      paths: [
        "packages/contracts/src/security/csrf.ts",
        "apps/api/src/modules/creator/studio-live.protocol.ts#STUDIO_CRDT_PROTOCOL_VERSION",
        "apps/web/src/domains/creator/live/studio-crdt-protocol.ts#STUDIO_CRDT_PROTOCOL_VERSION",
        "tests/integration/api-web/api/modules/creator/studio-live.protocol.test.ts",
      ],
    },
  ],
  decisions: [
    {
      choice: t("승인 SHA 로 관문을 열고 번들엔 새기지 않음", "Open gates with the approved SHA, not stamp it into the bundle"),
      because: t(
        "내용이 같으면 buildId 도 같아서, 바뀐 것이 없는 재빌드가 같은 서비스 워커를 다시 설치시키지 않습니다.",
        "Identical content gives an identical buildId, so a rebuild with no change does not make browsers reinstall the same service worker.",
      ),
      cost: t(
        "지금 운영이 어느 커밋인지 코드로 읽을 수 없고, 이렇게 정한 이유를 적은 문서는 찾지 못했습니다.",
        "Which commit is live cannot be read from code, and no document explaining why it was chosen this way was found.",
      ),
    },
    {
      choice: t("공유 파일 + 버전 문 + 시험으로 약속 맞추기", "Align promises with a shared file, a version gate and tests"),
      because: t(
        "한 파일을 양쪽이 가져다 쓰면 어긋날 수 없고, 복사본은 시험이 같은지 대조하며, 다른 버전의 실시간 메시지는 서버가 거절합니다.",
        "One file imported by both sides cannot drift, tests compare the copies, and the server refuses realtime messages of another version.",
      ),
      cost: t(
        "교차 시험이 없는 복사본은 리뷰에 의존하고, 일반 HTTP API 에는 클라이언트 버전을 확인하는 장치를 찾지 못했습니다.",
        "Copies without a cross test rely on review, and no client-version check was found for the ordinary HTTP API.",
      ),
    },
    {
      choice: t("서버가 먼저 바뀌는 릴리스는 expand → contract 두 번", "Server-first releases ship in two parts: expand, then contract"),
      because: t(
        "옛 탭과 옛 서버 바이너리가 남아 있어도 추가만 있는 DB 변경은 함께 쓸 수 있습니다.",
        "An additive-only database change keeps working with old tabs and old server binaries still around.",
      ),
      cost: t(
        "두 번 나눠 내는 순서는 문서 정책이며 코드가 강제하지 않고, DB 는 자동으로 되돌리지 않습니다.",
        "The two-part order is a documented policy that code does not enforce, and the database is not rolled back automatically.",
      ),
    },
  ],
  pitfall: t(
    "'프런트와 백엔드가 같은 SHA 로 묶여 있다'고 말하지 마세요. 같은 승인 SHA 를 쓰는 것은 절차이고, 번들과 API 응답은 SHA 를 말하지 않습니다. 운영의 현재 SHA 와 대시보드는 열람하지 않았습니다.",
    "Do not say front end and back end are bound by the same SHA. Using the same approved SHA is a procedure, and neither the bundle nor the API replies state a SHA. The dashboards and the SHA currently live were not inspected.",
  ),
  facts: [
    {
      value: "40",
      label: t("승인 SHA 의 자릿수(소문자 16진, 배포 스크립트가 요구)", "Length of the approved SHA (lowercase hex, demanded by the deploy script)"),
      source: "scripts/deploy-cloudflare-static.mjs",
    },
    {
      value: "12",
      label: t("buildId 의 길이(내용 해시의 앞 12자리)", "Length of the buildId (first 12 characters of a content hash)"),
      source: "apps/web/src/app/service-worker/studio-service-worker-precache-plan.ts",
    },
    {
      value: "8",
      label: t("서버가 z.literal 로 강제하는 실시간 CRDT 프로토콜 버전(웹도 같은 값)", "Realtime CRDT protocol version the server enforces with z.literal (the web declares the same)"),
      source: "apps/api/src/modules/creator/studio-live.protocol.ts",
    },
  ],
  status: "configured",
  atlasIds: [
    "build-fingerprint-map",
    "shared-contract-patterns",
    "version-pin-layers",
    "hashed-assets-cache-contract",
    "version-skew-chunk-reload-recovery",
    "release-order-expand-contract-rollback",
    "manual-sha-release-gate",
    "user-approved-update-kill-switch",
  ],
  chapterIds: ["pwa-continuity", "infrastructure", "quality"],
  glossaryIds: [
    "build-fingerprint",
    "manual-sha-release",
    "version-skew",
    "contract-test",
    "expand-contract",
    "hashed-name-immutable-cache",
    "lockfile-supply-chain",
  ],
};

export const ARCHITECTURE_DELIVERY_ALIGN_SECTIONS: readonly ArchitectureGuideSection[] = [FRONT_BACK_ALIGNMENT];
