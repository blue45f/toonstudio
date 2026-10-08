import { codePair, t } from "./engineering-atlas-platform-ops-build-kit";
import { PLATFORM_OPS_BUILD_RELEASE_CARDS } from "./engineering-atlas-platform-ops-build-release";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · platform-ops 카테고리 — 프런트엔드와 백엔드의 빌드·배포·버전을 맞추는 기술 6장.
 * 이 파일은 지문 지도·공유 계약·버전 고정 3장을 담고, 캐시 계약·버전 어긋남·릴리스 순서 3장은
 * engineering-atlas-platform-ops-build-release.ts 에 있다. 사실은 2026-10-08 기준 코드·시험·문서와 공식 문서로 확인했다.
 * 운영 대시보드(Cloudflare·Render·GitHub)의 실제 값과 운영 응답 헤더는 열람하지 않았다.
 */

const BUILD_FINGERPRINT_MAP: EngineeringAtlasEntry = {
  id: "build-fingerprint-map",
  category: "platform-ops",
  name: "Build fingerprints",
  title: t(
    "빌드 지문 지도: 프런트는 내용 해시, 백엔드는 SHA와 체크섬",
    "A map of build fingerprints: content hash on the front, SHA and checksums on the back",
  ),
  status: "live",
  tagline: t(
    "프런트 번들은 커밋 SHA 없이 내용 해시로, DB 원장은 SHA와 체크섬으로 자기 정체를 남깁니다.",
    "The front bundle identifies itself by content hash without a commit SHA; the database ledger records a SHA and checksums.",
  ),
  background: [
    t(
      "두 덩어리가 같은 빌드에서 나왔는지 확인하려면 각자 지문이 있어야 합니다. 그런데 ToonStudio의 지문은 종류가 다릅니다. 프런트의 JS·CSS 번들에는 커밋 번호(SHA)도 날짜도 새겨져 있지 않고, 파일 이름의 해시와 서비스 워커(sw.js)에 박힌 12자리 내용 지문(buildId)이 있을 뿐입니다. 반대로 DB 마이그레이션 원장에는 SQL 파일의 SHA-256 체크섬과, 그것을 적용한 커밋 SHA(releaseSha)가 행마다 적힙니다. 택배로 치면 한쪽은 내용물 사진, 다른 쪽은 송장 번호입니다.",
      "To tell whether two pieces came from the same build, each needs a fingerprint, and ToonStudio's fingerprints are of different kinds. The front end's JS and CSS bundle carries neither a commit number (SHA) nor a date, only hashes in its file names and a 12-character content fingerprint (buildId) baked into the service worker, sw.js. The database migration ledger, on the other hand, records on every row the SHA-256 checksum of the SQL file and the commit SHA that applied it (releaseSha). In parcel terms, one side has a photo of the contents and the other a tracking number.",
    ),
    t(
      "프런트 지문은 이렇게 만들어집니다. Vite가 빌드하며 파일 목록(manifest.json)을 남기면, 서비스 워커 플러그인이 앱 셸 파일의 SHA-256을 구합니다. 필수 JS·CSS와 고정 정적 파일 23개가 대상입니다. 이 목록과 지문, 예열할 번역 사전, 오프라인 그리기 팩 목록을 하나의 문자열로 이어 다시 해시해 앞 12자리를 buildId로 삼고 sw.js에 박습니다. 서비스 워커는 이 id로 precache 저장소 이름을 짓고 활성화 때 이름이 다른 옛 저장소를 지웁니다. 시계도 커밋도 넣지 않아 내용이 같으면 id도 같습니다.",
      "The front-end fingerprint is made like this. While Vite builds it leaves a file list (manifest.json), and a service-worker plugin takes the SHA-256 of the app-shell files: the required JS and CSS plus 23 fixed static files. That list, the fingerprints, the translation dictionaries to warm and the offline-drawing pack list are joined into one string and hashed again, and the first 12 characters become the buildId baked into sw.js. The worker names its precache bucket with this id and on activation deletes older buckets with a different name. No clock and no commit go in, so identical content gives an identical id.",
    ),
    t(
      "SHA는 따로 쓰입니다. 정적 웹 배포 스크립트는 HEAD가 승인 SHA와 같은지 확인할 뿐 그 값을 번들에 넣지 않습니다. 마이그레이션 워크플로는 release_sha가 main의 조상일 때만 돌아 원장에 남기고, 수동 컨테이너 워크플로는 이미지에 :<SHA> 태그를 붙입니다. 트래픽 분석 Worker만 운영 배포 때 RELEASE_SHA 변수를 심지만 그 코드는 값을 읽지 않습니다. 프런트와 백엔드를 이어 주는 것은 같은 승인 SHA 하나와 사람이 적는 릴리스 기록이며, 번들이나 서버가 스스로 말하는 버전이 아닙니다.",
      "SHAs are used separately. The static-site deploy script only checks that HEAD equals the approved SHA and does not put the value into the bundle. The migration workflow runs only when release_sha is an ancestor of main and keeps it in the ledger, and the manual container workflow tags an image with :<SHA>. Only the traffic-analytics Worker gets a RELEASE_SHA variable at a production deploy, and its code does not read it. What ties front and back together is one approved SHA plus a release record that people write, not a version that the bundle or the server states about itself.",
    ),
    t(
      "그래서 운영 사이트에서 '떠 있는 번들이나 서버가 어느 커밋인가'를 읽어 낼 방법이 코드에는 없습니다. API 헬스 응답(ready는 status 하나, capabilities는 기능 11개의 상태)에도 버전 필드가 없고, Render가 주는 커밋 환경 변수(RENDER_GIT_COMMIT)도 저장소 코드가 읽지 않습니다. 빌드 때 SHA를 번들과 헬스 응답에 넣는 방법은 흔한 대안이지만 지금 코드에는 없는 설계 후보입니다.",
      "So the code has no way to read from the production site which commit the running bundle or server comes from. The API health replies (ready carries just a status, capabilities carries the state of 11 features) have no version field either, and the commit variable Render provides (RENDER_GIT_COMMIT) is not read by any repository code. Stamping a SHA into the bundle and the health reply at build time is a common alternative, but it is only a design candidate, not in the code today.",
    ),
  ],
  keyPoints: [
    t("프런트: 파일 이름 해시와 sw.js buildId(내용 해시 12자)", "Front end: file-name hashes and an sw.js buildId (12-char content hash)"),
    t("백엔드: SQL SHA-256 체크섬과 적용 커밋 releaseSha", "Back end: SQL SHA-256 checksums and the applying commit's releaseSha"),
    t("번들과 API 헬스 응답에는 커밋 SHA가 없음(코드 기준)", "No commit SHA in the bundle or API health replies (per the code)"),
    t("둘을 잇는 것은 승인 SHA 하나와 릴리스 기록", "One approved SHA and a release record tie the two together"),
  ],
  diagram: {
    id: "build-fingerprint-map-diagram",
    kind: "layers",
    title: t("배포 단위마다 붙는 지문", "The fingerprint each deploy unit carries"),
    caption: t(
      "프런트는 내용 해시, DB는 SHA와 체크섬을 갖고, 번들과 API 응답은 커밋 SHA를 말하지 않습니다.",
      "The front end carries a content hash and the database a SHA and checksums; neither the bundle nor the API replies state a commit SHA.",
    ),
    alt: t(
      "맨 위 정적 웹 번들은 파일 이름 해시와 sw.js의 12자리 buildId를 갖지만 커밋 SHA는 없습니다. 엣지 게이트웨이 Worker는 오리진 주소 변수만 갖고, Core API도 헬스 응답에 버전이 없습니다. 반면 DB 원장은 SQL 체크섬과 적용 커밋 SHA를 행마다 적고, 수동 컨테이너 워크플로는 이미지에 SHA 태그를 붙입니다. 이 지문들을 맞춰 보는 일은 사람이 적는 릴리스 기록이 맡습니다.",
      "At the top, the static web bundle carries file-name hashes and a 12-character buildId in sw.js but no commit SHA. The edge gateway Worker holds only origin-address variables and the Core API has no version in its health replies. The database ledger, by contrast, records a SQL checksum and the applying commit SHA on every row, and the manual container workflow tags an image with the SHA. Matching these fingerprints against each other is left to a release record that people write.",
    ),
    layers: [
      {
        id: "web",
        label: t("정적 웹 번들", "Static web bundle"),
        sub: t("이름 해시 + sw.js buildId(12자) · 커밋 SHA 없음", "Name hashes + sw.js buildId (12 chars) · no commit SHA"),
        tone: "edge",
        chips: ["Vite", "SHA-256"],
      },
      {
        id: "gateway",
        label: t("엣지 게이트웨이 Worker", "Edge gateway Worker"),
        sub: t("변수는 오리진 주소뿐 · Worker 이름 고정", "Only origin variables · Worker name frozen"),
        tone: "edge",
        chips: ["Cloudflare Workers"],
      },
      {
        id: "api",
        label: t("Core API", "Core API"),
        sub: t("헬스 응답에 버전·SHA 없음 · Render 소스 빌드", "No version or SHA in health replies · Render source build"),
        tone: "server",
        chips: ["NestJS", "Render"],
      },
      {
        id: "ledger",
        label: t("DB 마이그레이션 원장", "Database migration ledger"),
        sub: t("SQL 체크섬(SHA-256) + 적용 커밋 releaseSha", "SQL checksum (SHA-256) + applying commit releaseSha"),
        tone: "server",
        chips: ["PostgreSQL", "SHA-256"],
      },
      {
        id: "image",
        label: t("수동 컨테이너 이미지", "Manual container image"),
        sub: t("이미지 태그가 SHA · 운영 사용 여부는 미확인", "Image tag is the SHA · production use unconfirmed"),
        tone: "neutral",
        chips: ["GitHub Actions"],
      },
      {
        id: "record",
        label: t("릴리스 기록 (사람이 작성)", "Release record (written by people)"),
        sub: t("승인 SHA·deploy ID·Worker version을 적어 둠", "Approved SHA, deploy ID, Worker version noted down"),
        tone: "warn",
      },
    ],
    brackets: [
      { label: t("번들·응답에 SHA 없음", "No SHA in bundle or replies"), layerIds: ["web", "gateway", "api"] },
      { label: t("SHA가 남는 곳", "Where a SHA is kept"), layerIds: ["ledger", "image"] },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 · 오프라인 준비와 새 버전 감지", "Studio · offline readiness and new-version detection"),
      role: t(
        "빌드가 내용 해시로 만든 id를 sw.js에 박고, 서비스 워커가 그 id로 precache 저장소 이름을 지어 이름이 다른 옛 저장소를 활성화 때 지웁니다.",
        "The build bakes the content-hash id into sw.js, and the worker names its precache bucket with it and deletes buckets with a different name on activation.",
      ),
      paths: [
        "apps/web/vite.config.ts",
        "apps/web/src/app/service-worker/studio-service-worker-precache-plan.ts#studioServiceWorkerBuildId",
        "apps/web/src/app/service-worker/studio-service-worker-policy.ts#studioServiceWorkerCacheNames",
      ],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · 오프라인 도구 자동 준비", "Studio · automatic offline-tool preparation"),
      role: t(
        "워커가 buildId를 담은 상태 보고({schema, buildId, ready})를 보내고, 페이지는 같은 빌드에 대해 자동 준비를 한 번만 시도합니다(재시도 허용 때 제외).",
        "The worker reports its state with the buildId ({schema, buildId, ready}), and the page tries automatic preparation only once per build unless a retry is allowed.",
      ),
      paths: [
        "apps/web/src/domains/creator/offline/StudioOfflineRuntime.tsx",
        "apps/web/src/domains/creator/offline/studio-offline-client.ts",
        "apps/web/src/shared/lib/studio-offline-protocol.ts",
      ],
      route: "/studio",
    },
    {
      feature: t("정적 배포 직전 산출물 점검", "Pre-release artifact check for the static site"),
      role: t(
        "dist/sw.js가 있고 HTML이 아니며 buildId가 들어 있는지 확인합니다. 없으면 배포를 멈춥니다(없는 파일을 SPA가 HTML로 답하기 때문).",
        "It checks that dist/sw.js exists, is not HTML and contains a buildId, and stops the release otherwise (a missing file would be answered with HTML by the SPA fallback).",
      ),
      paths: ["scripts/verify-static-service-worker.mjs", "scripts/deploy-cloudflare-static.mjs"],
    },
    {
      feature: t("DB 마이그레이션 원장의 SHA 기록", "SHA records in the database migration ledger"),
      role: t(
        "승인형 워크플로가 release_sha를 받아 러너에 넘기고, 원장 행마다 체크섬과 releaseSha를 남깁니다. 두 값 모두 형식 CHECK 제약이 있습니다.",
        "The approval-gated workflow passes release_sha to the runner, which stores a checksum and the releaseSha on every ledger row. Both values have format CHECK constraints.",
      ),
      paths: [
        ".github/workflows/production-database-migrations.yml",
        "apps/api/src/platform/database/migrations/0023_production_migration_ledger.sql",
        "scripts/run-production-database-migrations.mjs",
      ],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("시계도 커밋도 없이 내용으로 buildId 만들기", "Making a buildId from content, with no clock and no commit"),
      language: "ts",
      ...codePair(`
interface Plan {
  criticalUrls: readonly string[];
  criticalFingerprints: readonly string[]; //~ 'url:내용 SHA-256' 항목들 ## entries like 'url:content SHA-256'
  warmUrls: readonly string[];
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

//~ 목록과 내용이 같으면 id 도 같다: 날짜·커밋 번호는 넣지 않는다 ## Same list and content, same id: no date and no commit number
export async function buildId(plan: Plan, offlineUrls: readonly string[]): Promise<string> {
  const fingerprint = [
    ...plan.criticalUrls,
    "--critical-content--",
    ...plan.criticalFingerprints,
    "--warm--",
    ...plan.warmUrls,
  ].join("\\n");
  return (await sha256Hex(fingerprint + offlineUrls.join("\\n"))).slice(0, 12);
}
`),
      explain: t(
        "실제 코드는 해시 함수를 주입받고(빌드에서는 Node의 createHash), 지문 항목은 파일마다 SHA-256으로 미리 구합니다. 순서가 바뀌면 다른 id가 되므로 단위 시험이 같은 입력은 같은 id, 이름이 같아도 내용이 바뀌면 다른 id임을 고정합니다.",
        "The real code receives the hash function (Node's createHash at build time) and computes each entry's SHA-256 beforehand. Order matters, so unit tests pin that the same input gives the same id and that changed content under the same name gives a different one.",
      ),
      source: "apps/web/src/app/service-worker/studio-service-worker-precache-plan.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("두 개의 시계: 빌드 id와 계약 버전", "Two clocks: the build id and the contract version"),
      language: "ts",
      ...codePair(`
const PREFIX = "toonstudio-sw-";
//~ 캐시된 응답을 더는 재생할 수 없을 때만 사람이 올리는 번호: 빌드 id 와 별개다 ## Raised by a person only when cached responses can no longer be replayed: separate from the build id
const CONTRACT_VERSION = 5;

export function cacheNames(buildId: string) {
  return {
    precache: PREFIX + "precache-v" + CONTRACT_VERSION + "-" + buildId, //~ 빌드마다 새 저장소 ## a new bucket for every build
    immutable: PREFIX + "immutable-v" + CONTRACT_VERSION, //~ 해시 이름 파일은 배포를 넘어 살아남는다 ## hashed files survive deploys
  };
}

//~ 활성화 때 우리 접두사 중 현재 이름이 아닌 것만 지운다 ## On activation delete only our own caches that are not current
export function staleCacheNames(existing: readonly string[], buildId: string): string[] {
  const current = new Set(Object.values(cacheNames(buildId)));
  return existing.filter((name) => name.startsWith(PREFIX) && !current.has(name));
}
`),
      explain: t(
        "실제 코드는 저장소가 6개(precache·immutable·heavy·media·data·cover)이고 구형 워커의 저장소 이름도 함께 지웁니다. 해시 이름 파일은 스스로 무효화되므로 배포마다 버리지 않고, 오직 precache만 빌드 id를 이름에 넣습니다.",
        "The real code has six buckets (precache, immutable, heavy, media, data, cover) and also clears the bucket names of the older worker. Hashed files invalidate themselves, so they are not thrown away on every deploy; only the precache bucket carries the build id in its name.",
      ),
      source: "apps/web/src/app/service-worker/studio-service-worker-policy.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "MDN · Service Worker API",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API",
      kind: "docs",
      note: t("서비스 워커의 설치·활성화·캐시 개념", "Install, activate and cache concepts of service workers"),
    },
    {
      title: "web.dev · The service worker lifecycle",
      url: "https://web.dev/articles/service-worker-lifecycle",
      kind: "guide",
      note: t("새 워커가 설치되고 대기하는 순서", "How a new worker installs and waits"),
    },
    {
      title: "Vite · Backend integration (manifest.json)",
      url: "https://vite.dev/guide/backend-integration.html",
      kind: "docs",
      note: t("해시가 붙은 파일 이름을 manifest.json이 이어 주는 방식", "How manifest.json maps source files to hashed output names"),
    },
    {
      title: "Chrome for Developers · Workbox precaching",
      url: "https://developer.chrome.com/docs/workbox/modules/workbox-precaching",
      kind: "guide",
      note: t("파일별 revision 해시로 바뀐 파일만 받는 방식: 이 카드와 비교", "Per-file revision hashes so only changed files are fetched: compare with this card"),
    },
    {
      title: "MDN · SubtleCrypto.digest()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest",
      kind: "docs",
      note: t("브라우저에서 SHA-256을 구하는 표준 API", "The standard API for SHA-256 in the browser"),
    },
  ],
  chapterIds: ["pwa-continuity", "delivery"],
  talk: {
    pitch: t(
      "프런트와 백엔드가 같은 빌드인지 묻는다면, 둘의 지문이 서로 다른 종류라고 먼저 답합니다. 프런트 번들은 커밋 번호 대신 파일 이름 해시와, 서비스 워커에 새긴 12자리 내용 해시 id를 가집니다. DB는 SQL 파일의 SHA-256 체크섬과 그것을 적용한 커밋 SHA를 원장에 적습니다. 둘을 잇는 것은 승인한 SHA 하나와 릴리스 기록이고, 번들이나 서버가 자기 버전을 말하는 장치는 아직 없습니다.",
      "If you ask whether front and back are the same build, the first answer is that their fingerprints are of different kinds. The front bundle has file-name hashes and a 12-character content-hash id baked into the service worker, instead of a commit number. The database writes the SHA-256 checksum of each SQL file and the commit SHA that applied it into its ledger. One approved SHA and a release record tie them together; there is not yet any mechanism for the bundle or the server to state its own version.",
    ),
    analogy: t(
      "택배 상자에 내용물 사진(프런트)과 송장 번호(DB 원장)가 따로 붙어 있고, 둘을 맞춰 보는 일은 배송 기록부가 맡는 셈입니다.",
      "A parcel carries a photo of its contents (front end) and a tracking number (database ledger) separately, and the delivery log is what matches the two.",
    ),
    questions: [
      {
        question: t("지금 운영 중인 프런트가 어느 커밋인가요?", "Which commit is the front end running in production?"),
        answer: t(
          "코드로는 알 수 없습니다. 번들에 커밋 SHA가 없고 정적 웹 배포 스크립트는 HEAD가 승인 SHA와 같은지만 확인합니다. 릴리스 기록과 Cloudflare 대시보드의 배포 이력으로 확인해야 하며, 이번에는 대시보드를 열람하지 않았습니다.",
          "The code cannot tell. The bundle has no commit SHA, and the static deploy script only checks that HEAD equals the approved SHA. It has to be checked in the release record and the deployment history on the Cloudflare dashboard, which was not opened for this card.",
        ),
      },
      {
        question: t("같은 SHA로 빌드하면 번들이 바이트까지 같은가요?", "Does building the same SHA give a byte-identical bundle?"),
        answer: t(
          "보장하지 않습니다. 배포 스크립트가 CI의 dist를 올리는 대신 운영자 환경에서 다시 빌드하므로 Node와 의존성 버전이 같아야 하고(고정 장치는 '같은 도구, 같은 버전' 카드), 정적 카탈로그 home.json에는 빌드 시각(generatedAt)이 들어가 같은 SHA를 다시 빌드해도 dist가 바이트까지 같지는 않습니다. 두 빌드의 buildId를 비교하는 자동 절차는 찾지 못했습니다.",
          "It is not guaranteed. The deploy script rebuilds in the operator's environment instead of uploading CI's dist, so Node and dependency versions must match (the pins are on the 'Same tools, same versions' card), and the static catalog's home.json carries a build time (generatedAt), so rebuilding the same SHA does not give a byte-identical dist. No automatic procedure that compares the buildIds of two builds was found.",
        ),
      },
      {
        question: t("왜 SHA를 번들에 넣지 않았나요?", "Why isn't the SHA put into the bundle?"),
        answer: t(
          "이유를 적은 문서는 찾지 못했습니다. 코드로 확인되는 장점은, 내용 해시 id는 실제 내용이 달라질 때만 바뀌어 같은 워커를 다시 설치시키지 않는다는 점입니다.",
          "No document states the reason. What the code does show is the benefit that a content-hash id changes only when the content really changes, so the same worker is not reinstalled.",
        ),
      },
    ],
    pitfall: t(
      "'프런트와 백엔드가 같은 SHA로 묶여 있다'고 말하지 마세요. 같은 승인 SHA를 쓰는 것은 절차이고, 번들과 API 응답은 SHA를 말하지 않습니다. 이 카드는 코드와 시험을 읽어 확인했으며 운영 사이트의 sw.js, 응답 헤더, 대시보드는 열람하지 않았습니다.",
      "Do not say that front and back are tied by the same SHA. Using the same approved SHA is a procedure, and neither the bundle nor the API replies state a SHA. This card was checked by reading code and tests; the production sw.js, response headers and dashboards were not inspected.",
    ),
  },
  technologies: ["Vite", "Service Worker", "SHA-256", "PostgreSQL", "Cloudflare Workers"],
  facts: [
    {
      value: "12",
      label: t("buildId 길이(해시 16진수의 앞 12자리)", "Length of the buildId (first 12 hex characters of the hash)"),
      source: "apps/web/src/app/service-worker/studio-service-worker-precache-plan.ts",
    },
    {
      value: "23",
      label: t("buildId 지문에 내용이 들어가는 고정 정적 critical 파일 수", "Fixed static critical files whose content feeds the buildId"),
      source: "apps/web/src/app/service-worker/studio-service-worker-precache-plan.ts",
    },
    {
      value: "40",
      label: t("원장 releaseSha의 길이(CHECK 제약)", "Length of the ledger releaseSha (CHECK constraint)"),
      source: "apps/api/src/platform/database/migrations/0023_production_migration_ledger.sql",
    },
  ],
  reviewedAt: "2026-10-08",
};

const SHARED_CONTRACT_PATTERNS: EngineeringAtlasEntry = {
  id: "shared-contract-patterns",
  category: "platform-ops",
  name: "Shared contract patterns",
  title: t(
    "같은 약속을 두 곳이 쓰는 법: 한 파일, 복사본 + 시험, 설정값 고정",
    "How two sides keep one promise: one file, a copy plus a test, pinned config",
  ),
  status: "live",
  tagline: t(
    "한 파일을 양쪽이 import하는 것이 기본이고, 복사본은 통합 시험과 설정 고정 시험으로 잠급니다.",
    "Importing one file on both sides is the default; copies are locked by integration and config-pinning tests.",
  ),
  background: [
    t(
      "프런트(브라우저)와 백엔드(서버)는 따로 올라가므로 두 쪽이 같은 약속을 쓰는지가 가장 먼저 어긋납니다. 예를 들어 서버가 요구하는 보안 헤더 이름과 브라우저가 붙이는 이름이 다르면 모든 저장 요청이 거절됩니다. 주방과 홀이 메뉴판을 각자 베껴 쓰면 언젠가 메뉴가 달라지는 것과 같아서, ToonStudio는 메뉴판을 한 장만 두는 쪽을 먼저 택하고, 그럴 수 없는 곳은 시험으로 두 장이 같은지 대조합니다.",
      "Front end (browser) and back end (server) ship separately, so whether both use the same promise is the first thing to drift. If the security-header name the server demands differs from the one the browser sends, every save request is refused. Just as a kitchen and a dining room copying a menu by hand will eventually disagree, ToonStudio prefers a single menu, and where that is impossible it uses tests to compare the two copies.",
    ),
    t(
      "가장 강한 방법은 같은 파일을 두 쪽이 import하는 것입니다. packages/contracts는 exports 68개 키로 상수·Zod 검증 스키마·순수 함수를 내보내고, 웹(시험을 뺀 파일 109개), API(104개), 관리자 웹(3개)이 가져다 씁니다. CSRF 헤더 이름 x-toonstudio-csrf가 대표 예입니다. 브라우저와 서버가 모두 읽어야 하므로 이 패키지는 React·NestJS·pg·express·socket.io·node: 같은 환경 전용 import와 앱 import가 금지돼 있고 위반 수는 0으로 동결됩니다. 같은 TS 소스를 웹은 Vite가, API는 tsc가 따로 컴파일합니다.",
      "The strongest method is for both sides to import the same file. packages/contracts exports constants, Zod validation schemas and pure functions through 68 export keys, and the web (109 non-test files), the API (104) and the admin web (3) use them. The CSRF header name x-toonstudio-csrf is the typical example. Because browser and server must both read it, the package is forbidden from importing environment-specific modules such as React, NestJS, pg, express, socket.io and node:, or any app, and the violation count is frozen at 0. Vite compiles the same TS source for the web and tsc compiles it for the API.",
    ),
    t(
      "복사본이 불가피한 곳은 시험이 묶습니다. 실시간 CRDT 프로토콜 버전 8은 웹과 API가 각자 상수로 선언하고, tests/integration/api-web의 통합 시험이 두 값이 같다고 단언합니다(앱끼리 직접 import는 금지라, 앱을 넘나드는 시험은 tests/integration 아래에만 둡니다). 실시간 Worker의 발급자·수신자 이름은 wrangler 설정 3종과 환경 예시 2종이 같은 절대값을 갖는지 시험이 읽어 대조하고, 웹의 Cloudflare 어댑터는 Worker의 protocol.ts 원본을 직접 import해 같은 파일을 두 번들이 씁니다.",
      "Where a copy is unavoidable, tests bind it. The web and the API each declare realtime CRDT protocol version 8 as a constant, and an integration test in tests/integration/api-web asserts the two are equal (apps may not import each other, so tests that cross apps live only under tests/integration). A test reads three wrangler configs and two env examples to compare the realtime Worker's issuer and audience names as absolute values, and the web's Cloudflare adapter imports the Worker's own protocol.ts so two bundles use one file.",
    ),
    t(
      "약한 곳도 있습니다. creator-analytics 응답은 API DTO 주석이 '웹에 동일 스키마의 복사본을 둔다'고 적었고, /api/health/capabilities의 모양도 API의 TS 타입과 웹의 Zod 스키마가 따로 있으며, 두 쪽을 묶는 교차 시험은 찾지 못했습니다. Pact 같은 소비자 주도 계약 시험 도구는 의존성에서 찾지 못했고, 공통 DTO를 contracts로 올리는 기준은 AGENTS.md가 '실제 두 번째 소비자가 생긴 범위만'으로 정합니다.",
      "There are weak spots. The creator-analytics response has a comment in its API DTO saying the web keeps a copy of the same schema, and the shape of /api/health/capabilities exists separately as an API TS type and a web Zod schema; no cross test binding the two sides was found. A consumer-driven contract tool such as Pact was not found among the dependencies, and AGENTS.md sets the rule for promoting a shared DTO into contracts as 'only where a real second consumer exists'.",
    ),
  ],
  keyPoints: [
    t("원천은 한 파일: contracts를 웹·API·관리자가 함께 import", "One source file: web, API and admin all import contracts"),
    t("복사본은 통합 시험이 단언: CRDT 프로토콜 버전 8", "Copies are asserted by an integration test: CRDT protocol 8"),
    t("설정값은 시험이 절대값으로 고정: 발급자·수신자 이름", "Config values pinned as absolutes by tests: issuer and audience"),
    t("교차 시험이 없는 복사본도 있음: capabilities 등", "Some copies have no cross test: capabilities and others"),
  ],
  diagram: {
    id: "shared-contract-patterns-diagram",
    kind: "graph",
    title: t("약속이 웹과 서버에 닿는 네 가지 길", "Four ways a promise reaches both web and server"),
    caption: t(
      "같은 패키지를 두 번 컴파일하고, 같은 protocol.ts를 두 번들이 쓰며, 복사본은 시험이 대조합니다.",
      "One package is compiled twice, one protocol.ts serves two bundles, and tests compare the copies.",
    ),
    alt: t(
      "맨 위 packages/contracts는 웹 번들에는 Vite로, Core API에는 tsc로 따로 컴파일되어 들어갑니다. 웹과 API가 각자 선언한 프로토콜 버전은 가운데 교차 시험이 같은지 단언합니다. 아래쪽에서는 실시간 Worker의 protocol.ts를 웹과 Worker가 같은 파일로 쓰고, wrangler 계약 시험이 Worker 설정과 API 환경 예시의 발급자·수신자 이름을 대조합니다.",
      "At the top, packages/contracts is compiled separately into the web bundle with Vite and into the Core API with tsc. A cross test in the middle asserts that the protocol version each side declares is equal. At the bottom the web and the Worker use the realtime Worker's protocol.ts as one file, and a wrangler contract test compares the issuer and audience names in the Worker config and the API env examples.",
    ),
    nodes: [
      { id: "pkg", label: t("packages/contracts", "packages/contracts"), sub: t("68키 · 환경 중립", "68 keys · neutral"), tone: "neutral", shape: "cylinder", at: [2, 0] },
      { id: "web", label: t("웹 번들", "Web bundle"), sub: t("Vite로 컴파일", "Compiled by Vite"), tone: "local", at: [0, 1] },
      { id: "parity", label: t("교차 시험", "Cross test"), sub: t("버전 8 단언", "asserts v8"), tone: "good", shape: "diamond", at: [2, 1] },
      { id: "api", label: t("Core API", "Core API"), sub: t("tsc + 스테이징", "tsc + staging"), tone: "server", at: [4, 1] },
      { id: "proto", label: t("Worker protocol.ts", "Worker protocol.ts"), sub: t("한 파일을 두 번들이", "One file, two bundles"), tone: "edge", shape: "cylinder", at: [0, 3] },
      { id: "worker", label: t("실시간 Worker", "Realtime Worker"), sub: t("Durable Objects", "Durable Objects"), tone: "edge", at: [2, 3] },
      { id: "pins", label: t("wrangler 시험", "wrangler test"), sub: t("발급자·수신자 고정", "pins issuer, audience"), tone: "good", at: [4, 3] },
    ],
    edges: [
      { from: "pkg", to: "web", label: t("Vite", "Vite") },
      { from: "pkg", to: "api", label: t("tsc", "tsc") },
      { from: "web", to: "parity", label: t("상수 8", "const 8") },
      { from: "api", to: "parity", label: t("상수 8", "const 8") },
      { from: "proto", to: "web", label: t("import", "import") },
      { from: "proto", to: "worker", label: t("같은 파일", "same file") },
      { from: "pins", to: "worker", label: t("wrangler 3종", "3 configs") },
      { from: "pins", to: "api", style: "dashed", label: t(".env 2종", "2 env files") },
    ],
  },
  usage: [
    {
      feature: t("공유 계약 패키지 (웹·API·관리자 공통)", "Shared contracts package (web, API and admin)"),
      role: t(
        "한 TS 소스를 웹은 Vite가, API는 tsc가 따로 컴파일합니다. API 쪽은 스테이징 스크립트가 실행용 패키지 껍데기를 만들고, import 검사가 모든 require가 배포 폴더 안에서 풀리는지 확인합니다.",
        "Vite compiles one TS source for the web and tsc for the API. On the API side a staging script creates runtime package shims and an import check confirms that every require resolves inside the release folder.",
      ),
      paths: [
        "packages/contracts/package.json",
        "scripts/stage-api-workspace-runtime.mjs",
        "scripts/verify-api-runtime-imports.mjs",
      ],
    },
    {
      feature: t("저장 요청 보호와 래스터 공동 편집 스위치", "Save-request protection and the raster co-editing switch"),
      role: t(
        "CSRF 헤더 이름과 보호 대상 메서드, 래스터 게시의 옵트인 토큰을 contracts 한 곳에서 정합니다. 웹은 헤더를 붙이고 API는 검사하며, 래스터 게시는 웹 빌드 변수와 서버 환경 변수가 모두 같은 토큰일 때만 켜집니다.",
        "The CSRF header name, the protected methods and the raster-publication opt-in token are defined once in contracts. The web attaches the header and the API checks it, and raster publication turns on only when both the web build variable and the server variable equal the token.",
      ),
      paths: [
        "packages/contracts/src/security/csrf.ts",
        "apps/web/src/shared/lib/csrf.ts",
        "apps/api/src/csrf-middleware.ts",
        "packages/contracts/src/studio-raster-asset-admission.ts",
        "apps/web/src/domains/creator/render/studio-raster-publication-feature.ts",
      ],
    },
    {
      feature: t("실시간 협업 프로토콜 버전", "Realtime collaboration protocol version"),
      role: t(
        "CRDT 프로토콜 버전 8을 웹과 API가 각자 선언하고, 서버는 z.literal로 다른 버전의 메시지를 거절합니다. 통합 시험이 두 상수가 같다고 단언합니다.",
        "The web and the API each declare CRDT protocol version 8, and the server rejects messages of other versions with z.literal. An integration test asserts that the two constants are equal.",
      ),
      paths: [
        "apps/api/src/modules/creator/studio-live.protocol.ts#STUDIO_CRDT_PROTOCOL_VERSION",
        "apps/web/src/domains/creator/live/studio-crdt-protocol.ts#STUDIO_CRDT_PROTOCOL_VERSION",
        "tests/integration/api-web/api/modules/creator/studio-live.protocol.test.ts",
      ],
      route: "/studio",
    },
    {
      feature: t("실시간 Worker와 API의 약속", "The promise between the realtime Worker and the API"),
      role: t(
        "웹 어댑터가 Worker의 protocol.ts를 직접 import해 같은 파일을 두 번들이 쓰고, 발급자·수신자 이름은 wrangler 계약 시험이 설정 파일과 환경 예시를 읽어 대조합니다.",
        "The web adapter imports the Worker's protocol.ts directly so two bundles use one file, and a wrangler contract test reads the config files and env examples to compare the issuer and audience names.",
      ),
      paths: [
        "apps/web/src/domains/creator/studio-realtime-provider-cloudflare-adapter.ts",
        "deploy/cloudflare-realtime/src/protocol.ts",
        "deploy/cloudflare-realtime/src/wrangler-contract.test.ts",
      ],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("한 파일의 상수를 브라우저와 서버가 함께 쓰기", "A browser and a server sharing the constants of one file"),
      language: "ts",
      ...codePair(`
//~ 계약 파일: 브라우저 전용·서버 전용 import 를 쓰지 않는다 ## Contract file: imports nothing browser-only or server-only
export const CSRF_HEADER = "x-toonstudio-csrf";
export const CSRF_HEADER_VALUE = "1";
const PROTECTED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function isCsrfProtectedMethod(method: string | undefined): boolean {
  return PROTECTED_METHODS.has((method ?? "GET").toUpperCase());
}

//~ 브라우저 쪽: 쓰기 요청에만 헤더를 붙인다 ## Browser side: attach the header to write requests only
export function withCsrfProtection(init: RequestInit): RequestInit {
  if (!isCsrfProtectedMethod(init.method)) return init;
  const headers = new Headers(init.headers);
  headers.set(CSRF_HEADER, CSRF_HEADER_VALUE);
  return { ...init, headers };
}

//~ 서버 쪽: 같은 상수로 확인한다 (헤더 이름은 소문자 키로 읽는다) ## Server side: check with the same constants (header names read as lowercase keys)
export function passesCsrf(method: string, headers: Record<string, string | undefined>): boolean {
  return !isCsrfProtectedMethod(method) || headers[CSRF_HEADER] === CSRF_HEADER_VALUE;
}
`),
      explain: t(
        "실제 API 미들웨어는 Origin·Sec-Fetch 검사와 인증 경로 예외까지 더합니다. 여기서는 '이름과 대상 메서드를 한 파일에서 정한다'만 남겼습니다. 같은 커밋 안에서는 웹과 API가 함께 바뀌어 소스상으로 어긋나지 않지만, 배포 시점이 다른 옛 탭과의 어긋남은 따로 다뤄야 합니다('옛 탭이 새 배포를 만났을 때' 카드).",
        "The real API middleware adds Origin and Sec-Fetch checks and an exception for authentication paths. This keeps only 'the name and the protected methods are decided in one file'. Within one commit web and API change together, so they cannot drift in source; skew with an old tab deployed at another time has to be handled separately (the 'When an old tab meets a new deploy' card).",
      ),
      source: "packages/contracts/src/security/csrf.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("버전이 다른 메시지는 서버 입구에서 거절하기", "Refusing messages of another version at the server entrance"),
      language: "ts",
      ...codePair(`
import { z } from "zod";

const PROTOCOL_VERSION = 8 as const;

//~ 서버 입구: 버전이 다른 메시지는 파싱 단계에서 걸러진다 ## Server entrance: messages with another version fail at parsing
export const CrdtUpdateSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  updateId: z.uuid(),
  payload: z.string().max(1_000_000),
});

export function acceptUpdate(raw: unknown) {
  const parsed = CrdtUpdateSchema.safeParse(raw);
  //~ 옛 탭이 재질 획을 조용히 빠뜨리지 않도록 받지 않고 이유만 돌려준다 ## Refuse an old tab instead of letting it silently drop material strokes
  return parsed.success
    ? { ok: true as const, update: parsed.data }
    : { ok: false as const, reason: "version-or-shape" };
}
`),
      explain: t(
        "코드 주석은 v8이 stroke payload v6(엔진 프로그램)을 받는 첫 방 프로토콜이라 v1~v7을 거절해 옛 탭이 재질 획을 몰래 빠뜨리는 일을 막는다고 적습니다. 실제 스키마는 훨씬 많은 필드를 검사합니다.",
        "A code comment says v8 is the first room protocol that accepts stroke payload v6 (engine programs), so v1 to v7 are rejected to stop old tabs from silently dropping material strokes. The real schema checks many more fields.",
      ),
      source: "apps/api/src/modules/creator/studio-live.protocol.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "Zod 공식 문서",
      url: "https://zod.dev/api",
      kind: "docs",
      note: t("literal·object·safeParse 등 스키마 API", "Schema API such as literal, object and safeParse"),
    },
    {
      title: "Node.js · Modules: Packages (exports)",
      url: "https://nodejs.org/api/packages.html",
      kind: "docs",
      note: t("패키지가 어떤 하위 경로를 내보내는지 정하는 exports", "How exports decides which subpaths a package exposes"),
    },
    {
      title: "pnpm · Workspaces",
      url: "https://pnpm.io/workspaces",
      kind: "docs",
      note: t("workspace:* 로 같은 저장소의 패키지를 연결하는 방식", "Linking packages of one repository with workspace:*"),
    },
    {
      title: "Martin Fowler · ContractTest",
      url: "https://martinfowler.com/bliki/ContractTest.html",
      kind: "article",
      note: t("두 쪽이 같은 약속을 지키는지 시험하는 개념", "The idea of testing that two sides keep the same promise"),
    },
    {
      title: "Cloudflare · Wrangler configuration",
      url: "https://developers.cloudflare.com/workers/wrangler/configuration/",
      kind: "docs",
      note: t("Worker 이름과 vars가 적히는 설정 파일", "The config file where the Worker name and vars live"),
    },
  ],
  chapterIds: ["architecture", "quality"],
  talk: {
    pitch: t(
      "프런트와 백엔드가 따로 올라가니, 같은 약속을 쓰는지가 제일 먼저 어긋납니다. ToonStudio는 약속을 한 파일에 두고 양쪽이 가져다 쓰는 것을 첫째로 삼았습니다. 보안 헤더 이름 같은 값은 packages/contracts 한 곳에서 웹과 서버가 함께 읽습니다. 어쩔 수 없이 복사본이 있는 곳은 통합 시험이 두 값이 같은지 확인하고, 실시간 서버는 버전이 다른 메시지를 아예 거절합니다. 시험이 없는 곳이 있다는 점도 숨기지 않습니다.",
      "Front end and back end ship separately, so whether they use the same promise is the first thing to drift. ToonStudio's first choice is to keep the promise in one file that both sides import. Values such as the security-header name are read by web and server together from packages/contracts. Where a copy is unavoidable, an integration test checks that the values are equal, and the realtime server flatly refuses messages of another version. We also do not hide that some places have no such test.",
    ),
    analogy: t(
      "메뉴판을 한 장만 두고 주방과 홀이 같이 보는 것이 가장 좋고, 복사본이 필요하면 마감 때 두 장이 같은지 대조하는 담당자를 둡니다.",
      "Best is one menu that the kitchen and the dining room read together; where a copy is needed, someone compares the two sheets at closing time.",
    ),
    questions: [
      {
        question: t("왜 전부 공유 패키지로 합치지 않나요?", "Why not put everything into the shared package?"),
        answer: t(
          "AGENTS.md는 공통 DTO·스키마를 실제로 두 번째 소비자가 생긴 범위만 contracts 후보로 올린다고 정합니다. 또 웹·관리자·API가 서로의 앱 소스를 직접 import하는 것은 경계 검사가 금지하고 위반 수를 0으로 동결합니다.",
          "AGENTS.md says shared DTOs and schemas are promoted to contracts only where a real second consumer exists, and the boundary check forbids web, admin and API from importing each other's app source, with the violation count frozen at 0.",
        ),
      },
      {
        question: t("두 값이 어긋나면 어떻게 알아챕니까?", "How would you notice if two values drifted?"),
        answer: t(
          "CRDT 프로토콜 버전은 통합 시험이 같은지 단언하고 서버는 다른 버전을 거절합니다. 실시간 Worker의 발급자·수신자 이름은 wrangler 계약 시험이 읽습니다. 시험이 없는 곳(capabilities 응답 모양, creator-analytics)은 사람의 리뷰에 의지합니다.",
          "An integration test asserts that the CRDT protocol versions are equal and the server refuses other versions. The wrangler contract test reads the realtime Worker's issuer and audience names. Places without a test (the capabilities response shape, creator-analytics) rely on human review.",
        ),
      },
      {
        question: t("클라이언트-서버 계약 시험 도구는 안 쓰나요?", "Don't you use a client-server contract-testing tool?"),
        answer: t(
          "Pact 같은 소비자 주도 계약 도구는 의존성에서 찾지 못했습니다. 대신 공유 패키지, tests/integration 아래의 교차 시험, 설정 고정 시험이 같은 역할을 나눠 맡습니다.",
          "A consumer-driven tool such as Pact was not found among the dependencies. Instead the shared package, the cross tests under tests/integration and the config-pinning tests share that role.",
        ),
      },
    ],
    pitfall: t(
      "'모든 계약이 한 패키지에서 나온다'고 말하면 틀립니다. 한 파일 공유, 복사본 + 통합 시험, 설정값 고정, 받는 쪽 Zod 검사, 주석으로 약속한 복사본이 섞여 있고 마지막 둘 일부는 교차 시험을 찾지 못했습니다. 이 카드는 코드와 시험 파일을 읽어 확인했고, 해당 통합 시험을 이번에 실행하지는 않았습니다.",
      "Saying that every contract comes from one package would be wrong. One shared file, a copy plus an integration test, pinned config values, receiver-side Zod checks and copies promised by a comment are all mixed, and for some of the last two no cross test was found. This card was checked by reading code and test files; those integration tests were not run for it.",
    ),
  },
  technologies: ["Zod", "pnpm", "TypeScript", "Vite", "NestJS", "Cloudflare Workers", "Vitest"],
  facts: [
    {
      value: "68",
      label: t("contracts 패키지의 exports 키 수(package.json)", "Export keys of the contracts package (package.json)"),
      source: "packages/contracts/package.json",
    },
    {
      value: "8",
      label: t("서버가 z.literal로 강제하는 CRDT 프로토콜 버전(웹도 같은 값 선언)", "CRDT protocol version the server enforces with z.literal (the web declares the same value)"),
      source: "apps/api/src/modules/creator/studio-live.protocol.ts",
    },
  ],
  reviewedAt: "2026-10-08",
};

const VERSION_PIN_LAYERS: EngineeringAtlasEntry = {
  id: "version-pin-layers",
  category: "platform-ops",
  name: "Version pinning layers",
  title: t(
    "같은 도구, 같은 버전: 빌드 앞에 겹겹이 거는 고정",
    "Same tools, same versions: pins layered in front of the build",
  ),
  status: "live",
  tagline: t(
    "Node·pnpm·잠금 파일·Zod·기배포 SQL까지 빌드 앞에서 맞는지 확인하고, 어긋나면 멈춥니다.",
    "Node, pnpm, lockfile, Zod and shipped SQL are checked in front of the build, and a mismatch stops it.",
  ),
  background: [
    t(
      "'내 컴퓨터에서는 되는데 서버에서는 안 되는' 문제의 흔한 원인은 도구와 라이브러리 버전이 다른 것입니다. 프런트와 백엔드가 같은 코드 한 벌을 각자 따로 빌드하는 ToonStudio에서는 더 중요합니다. 같은 Zod(입력 검사 라이브러리)가 브라우저와 서버에서 다른 버전으로 돌면 같은 데이터를 한쪽은 통과시키고 다른 쪽은 거절할 수 있습니다. 그래서 '무엇을 같게 맞출지'를 층으로 나누어 각 층을 기계가 확인하게 합니다.",
      "A common cause of 'works on my machine, not on the server' is different tool and library versions, and it matters more for ToonStudio, where front end and back end each build one set of code separately. If the same Zod (an input-validation library) runs in different versions in the browser and on the server, one side can accept data the other refuses. So 'what must be the same' is split into layers, each checked by a machine.",
    ),
    t(
      "① 도구: package.json이 pnpm@11.4.0(packageManager)과 Node >=24.16.0(engines)을 적고, .nvmrc는 24.16.0이며, Render 빌드는 corepack enable로 pnpm을 맞추고 API 컨테이너 워크플로는 node:24.16.0 이미지를 씁니다. ② 잠금 파일: CI·Render·컨테이너 빌드 모두 pnpm install --frozen-lockfile이라 잠금 파일과 다르면 설치가 멈추고, 커밋·푸시 훅의 verify-pnpm-lockfile이 잠금 파일의 패키지 목록이 실제 워크스페이스와 같은지 봅니다. ③ 공유 라이브러리: Zod는 8개 매니페스트에 4.4.3으로 선언돼 있고, 그중 6곳은 빌드 앞 검사가 선언값과 설치값이 모두 같은지 봅니다.",
      "(1) Tools: package.json states pnpm@11.4.0 (packageManager) and Node >=24.16.0 (engines), .nvmrc says 24.16.0, the Render build aligns pnpm with corepack enable, and the API container workflow uses the node:24.16.0 image. (2) Lockfile: CI, Render and the container build all run pnpm install --frozen-lockfile, so an install stops if the lockfile disagrees, and the verify-pnpm-lockfile commit and push hooks check that the lockfile's package list equals the real workspace. (3) Shared library: Zod is declared as 4.4.3 in 8 manifests, and a pre-build check on 6 of them verifies that both the declared and the installed value agree.",
    ),
    t(
      "④ 이미 나간 것: 같은 검사가 운영에 나간 SQL 92개의 SHA-256, 운영 Worker 이름(toonspectrum-web), R2 버킷 바인딩이 바뀌지 않았는지도 봅니다. 이 검사는 웹 쪽 prebuild와 API 빌드 첫 단계에 똑같이 걸려 있어 두 빌드가 같은 기준을 씁니다. ⑤ 작업 폴더: 워크스페이스 링크가 다른 체크아웃을 가리키면 prebuild·predev·typecheck가 실패합니다. 대안인 Renovate·Dependabot 같은 자동 갱신은 설정 파일을 찾지 못했고, 올리는 시점은 사람이 정합니다.",
      "(4) What already shipped: the same check also verifies that the SHA-256 of the 92 SQL files already in production, the production Worker name (toonspectrum-web) and the R2 bucket binding have not changed. It hangs identically on the web side's prebuild and at the start of the API build, so both builds use the same standard. (5) Working folder: if a workspace link points to another checkout, prebuild, predev and typecheck fail. Automatic updaters such as Renovate or Dependabot have no config file here, so people decide when to upgrade.",
    ),
    t(
      "빈틈도 있습니다. 워크플로 98개 파일에서 node-version은 24가 97줄, 24.16.0이 22줄, .nvmrc 참조가 4줄이고, CI 코어 잡 7개는 24(24.x 중 최신)를 씁니다. engines는 상한이 없는 >=24.16.0이며 engine-strict 설정은 찾지 못했습니다. Render 문서의 우선순위(NODE_VERSION, .node-version, .nvmrc, engines)대로면 .nvmrc가 적용되지만, 대시보드에 NODE_VERSION이 따로 있는지와 실제 값은 확인하지 못했습니다.",
      "There are gaps. Across the 98 workflow files, node-version is 24 on 97 lines, 24.16.0 on 22 lines and a .nvmrc reference on 4 lines, and the 7 core CI jobs use 24 (the latest 24.x). engines is the unbounded >=24.16.0 and no engine-strict setting was found. By Render's documented precedence (NODE_VERSION, .node-version, .nvmrc, engines) the .nvmrc applies, but whether a NODE_VERSION is set on the dashboard, and the real value, was not checked.",
    ),
  ],
  keyPoints: [
    t("도구 → 잠금 파일 → 공유 라이브러리 → 기배포물, 네 층", "Four layers: tools, lockfile, shared library, shipped artifacts"),
    t("Zod 4.4.3은 정확 고정, ^4.4.3 같은 범위 표기는 거부", "Zod 4.4.3 is pinned exactly; a range like ^4.4.3 is refused"),
    t("같은 검사가 웹 prebuild와 API 빌드에 모두 들어 있음", "The same check sits in both the web prebuild and the API build"),
    t("CI는 Node 24(최신), .nvmrc·컨테이너는 24.16.0", "CI uses Node 24 (latest); .nvmrc and the container use 24.16.0"),
  ],
  diagram: {
    id: "version-pin-layers-diagram",
    kind: "layers",
    title: t("무엇을 같게 맞추는가: 다섯 층과 빈틈", "What is kept the same: five layers and the gaps"),
    caption: t(
      "도구에서 작업 폴더까지 층마다 기계가 확인하고, 맨 아래에 알려진 빈틈을 따로 적습니다.",
      "A machine checks each layer from tools to the working folder, and the known gaps are listed separately at the bottom.",
    ),
    alt: t(
      "첫째 층은 Node와 pnpm 같은 도구 버전을 package.json, .nvmrc, 컨테이너 이미지로 적습니다. 둘째는 잠금 파일로 설치를 고정합니다. 셋째는 웹과 API가 같이 쓰는 Zod를 정확한 버전으로 맞추고, 넷째는 이미 운영에 나간 SQL과 Worker 이름이 바뀌지 않았는지 봅니다. 다섯째는 워크스페이스 링크가 이 체크아웃을 가리키는지 봅니다. 마지막 칸에는 CI의 Node가 최신 24라는 점 등 알려진 빈틈을 적습니다.",
      "The first layer states tool versions such as Node and pnpm in package.json, .nvmrc and the container image. The second fixes installs with the lockfile. The third pins Zod, shared by web and API, to an exact version, and the fourth checks that SQL and Worker names already in production have not changed. The fifth checks that workspace links point at this checkout. The last row lists known gaps such as CI using the latest Node 24.",
    ),
    layers: [
      {
        id: "tool",
        label: t("① 도구 · Node와 pnpm", "1 Tools: Node and pnpm"),
        sub: t("pnpm@11.4.0 · Node >=24.16.0 · .nvmrc 24.16.0", "pnpm@11.4.0 · Node >=24.16.0 · .nvmrc 24.16.0"),
        tone: "neutral",
        chips: ["Node.js", "pnpm"],
      },
      {
        id: "lock",
        label: t("② 잠금 파일 · 설치", "2 Lockfile: installs"),
        sub: t("--frozen-lockfile로 설치, 훅이 패키지 목록 대조", "Installs with --frozen-lockfile; hooks compare the list"),
        tone: "server",
        chips: ["pnpm", "GitHub Actions"],
      },
      {
        id: "lib",
        label: t("③ 공유 라이브러리 · Zod", "3 Shared library: Zod"),
        sub: t("Zod 4.4.3을 8곳에 정확 고정, 6곳은 설치값 대조", "Zod 4.4.3 pinned in 8 places; 6 compare installed"),
        tone: "server",
        chips: ["Zod"],
      },
      {
        id: "shipped",
        label: t("④ 이미 나간 것 · SQL·Worker·R2", "4 Already shipped: SQL, Worker, R2"),
        sub: t("SQL 92개 체크섬 · Worker 이름 · R2 바인딩 고정", "92 SQL checksums · Worker name · R2 binding frozen"),
        tone: "server",
        chips: ["SHA-256", "R2"],
      },
      {
        id: "links",
        label: t("⑤ 작업 폴더 · 워크스페이스 링크", "5 Working folder: workspace links"),
        sub: t("다른 체크아웃을 가리키는 링크는 실패", "A link pointing at another checkout fails"),
        tone: "local",
      },
      {
        id: "gaps",
        label: t("알려진 빈틈", "Known gaps"),
        sub: t("CI Node 24(최신) ≠ 24.16.0 · engines 상한 없음", "CI Node 24 (latest) ≠ 24.16.0 · no engines ceiling"),
        tone: "warn",
      },
    ],
    brackets: [{ label: t("빌드 앞 자동 확인", "Checked by machine"), layerIds: ["lock", "lib", "shipped", "links"] }],
  },
  usage: [
    {
      feature: t("설치·CI·Render 빌드", "Install, CI and Render build"),
      role: t(
        "세 곳 모두 frozen-lockfile로 설치합니다. 코어 CI(ci.yml)는 version 없이 pnpm/action-setup을 써서 packageManager의 pnpm 버전을 따르지만, 다른 워크플로 17개 파일의 18개 단계는 version: 11.4.0을 직접 적어서 pnpm을 올릴 때 고칠 곳이 더 있습니다. Render 빌드는 corepack enable로 pnpm을 맞춥니다.",
        "All three install with frozen-lockfile. The core CI (ci.yml) uses pnpm/action-setup without a version and follows the pnpm version in packageManager, but 18 steps in 17 other workflow files write version: 11.4.0 themselves, so a pnpm upgrade has more places to edit. The Render build aligns pnpm with corepack enable.",
      ),
      paths: [
        "package.json",
        "render.yaml",
        ".github/workflows/ci.yml",
        ".github/workflows/studio-cc0-library.yml",
        ".nvmrc",
      ],
    },
    {
      feature: t("커밋·푸시 훅", "Commit and push hooks"),
      role: t(
        "pre-commit과 pre-push가 잠금 파일의 importer 목록을 워크스페이스와 대조하고, 의존성 파일이 바뀐 푸시에는 보안·라이선스 감사를 붙입니다.",
        "pre-commit and pre-push compare the lockfile's importer list with the workspace, and a push that changes dependency files adds the security and license audits.",
      ),
      paths: [".husky/pre-commit", ".husky/pre-push", "scripts/verify-pnpm-lockfile.mjs"],
    },
    {
      feature: t("웹·API 빌드 앞단의 호환 검사", "Compatibility check in front of the web and API builds"),
      role: t(
        "Zod 정확 버전, 기배포 SQL 체크섬, 운영 Worker·R2 식별자를 확인합니다. 같은 스크립트가 루트 prebuild와 API build 첫 단계에 들어 있습니다.",
        "It checks the exact Zod version, the shipped SQL checksums and the production Worker and R2 identifiers. The same script sits in the root prebuild and at the start of the API build.",
      ),
      paths: [
        "scripts/verify-production-release-compatibility.mjs",
        "apps/api/package.json",
        "config/production-migration-baseline.json",
      ],
    },
    {
      feature: t("작업 폴더 소유권 검사", "Working-folder ownership check"),
      role: t(
        "workspace:* 의존성이 다른 체크아웃의 패키지가 아니라 이 저장소의 패키지를 가리키는지 확인합니다(prebuild·predev·typecheck).",
        "It checks that workspace:* dependencies point at this repository's packages rather than another checkout's (prebuild, predev, typecheck).",
      ),
      paths: ["scripts/verify-workspace-package-links.mjs"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("공유 라이브러리는 정확한 같은 버전만 허용하기", "Allowing only the exact same version of a shared library"),
      language: "ts",
      ...codePair(`
interface Consumer {
  path: string;
  declared?: string; //~ package.json 에 적힌 값 ## the value written in package.json
  installed: string; //~ 실제로 설치되어 풀리는 값 ## the value that actually resolves
}

//~ 첫 소비자의 정확한 버전을 기준으로 삼고, ^ 같은 범위 표기는 거부한다 ## Use the first consumer's exact version as the baseline and refuse ranges like ^
export function compareExactVersions(consumers: readonly Consumer[]): string[] {
  const expected = consumers[0]?.declared;
  if (!expected || !/^[0-9]+[.][0-9]+[.][0-9]+$/u.test(expected)) {
    return ["not-exact-version"];
  }
  return consumers.flatMap((consumer) =>
    consumer.declared === expected && consumer.installed === expected
      ? []
      : ["version-mismatch:" + consumer.path],
  );
}
`),
      explain: t(
        "실제 검사는 루트·API·계약 등 6개 매니페스트를 읽고 설치된 zod/package.json의 버전까지 대조하며, 오류 문구는 한국어입니다. 단위 시험은 4.5.4가 섞이거나 ^4.4.3으로 적으면 거절되는지 고정합니다.",
        "The real check reads six manifests such as the root, API and contracts and also compares the version in the installed zod/package.json, with Korean error messages. Unit tests pin that mixing in 4.5.4 or writing ^4.4.3 is refused.",
      ),
      source: "scripts/verify-production-release-compatibility.mjs",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("CI가 도구 버전을 고르는 세 줄", "Three lines where CI picks its tool versions"),
      language: "yaml",
      ...codePair(
        `
- uses: pnpm/action-setup@v6          #~ version 을 생략하면 package.json 의 packageManager(pnpm@11.4.0)를 쓴다 ## Without a version it follows packageManager (pnpm@11.4.0) in package.json
- uses: actions/setup-node@v6
  with:
    node-version: 24                  #~ 24.x 중 최신: .nvmrc(24.16.0)보다 느슨하다 ## The latest 24.x: looser than .nvmrc (24.16.0)
    cache: pnpm
- run: pnpm install --frozen-lockfile --prefer-offline  #~ 잠금 파일과 다르면 설치가 멈춘다 ## Stops if the lockfile disagrees
`,
        "#",
      ),
      explain: t(
        "코어 CI 잡 7개가 이 모양입니다. 같은 저장소에서 컨테이너 릴리스 워크플로는 node-version을 24.16.0으로 정확히 적습니다. 두 방식이 섞여 있다는 점이 이 카드의 '빈틈'입니다.",
        "The 7 core CI jobs look like this, while the container release workflow in the same repository writes node-version as exactly 24.16.0. That the two styles coexist is the 'gap' this card names.",
      ),
      source: ".github/workflows/ci.yml",
      verify: "none",
    },
  ],
  links: [
    {
      title: "pnpm · pnpm install (--frozen-lockfile)",
      url: "https://pnpm.io/cli/install",
      kind: "docs",
      note: t("잠금 파일과 어긋나면 멈추는 설치", "An install that stops when the lockfile disagrees"),
    },
    {
      title: "pnpm · Workspaces",
      url: "https://pnpm.io/workspaces",
      kind: "docs",
      note: t("한 저장소 안의 패키지를 workspace:* 로 잇는 방식", "Linking packages in one repository with workspace:*"),
    },
    {
      title: "Node.js · Corepack",
      url: "https://github.com/nodejs/corepack",
      kind: "repo",
      note: t("package.json의 packageManager 버전을 맞추는 도구", "The tool that honors the packageManager version in package.json"),
    },
    {
      title: "npm Docs · package.json (engines)",
      url: "https://docs.npmjs.com/cli/v10/configuring-npm/package-json/",
      kind: "docs",
      note: t("지원하는 Node 범위를 적는 engines 필드", "The engines field that states the supported Node range"),
    },
    {
      title: "Render · Setting your Node.js version",
      url: "https://render.com/docs/node-version",
      kind: "docs",
      note: t("NODE_VERSION, .node-version, .nvmrc, engines의 우선순위", "Precedence of NODE_VERSION, .node-version, .nvmrc and engines"),
    },
    {
      title: "GitHub · pnpm/action-setup",
      url: "https://github.com/pnpm/action-setup",
      kind: "repo",
      note: t("version을 생략하면 packageManager를 따르는 CI 액션", "The CI action that follows packageManager when version is omitted"),
    },
  ],
  chapterIds: ["delivery", "quality"],
  talk: {
    pitch: t(
      "프런트와 백엔드가 같은 코드를 각자 빌드하니, 도구와 라이브러리 버전이 같아야 합니다. ToonStudio는 맞출 것을 층으로 나눕니다. Node와 pnpm 버전, 잠금 파일, 양쪽이 같이 쓰는 Zod 버전, 이미 운영에 나간 SQL과 Worker 이름입니다. 잠금 파일은 설치 단계에서, 나머지는 빌드 앞단 검사에서 어긋나면 멈춥니다. 다만 CI가 Node 24의 최신을, 컨테이너와 .nvmrc가 24.16.0을 쓰는 틈은 아직 남아 있습니다.",
      "Front end and back end each build the same code, so tool and library versions must match. ToonStudio splits what must match into layers: Node and pnpm versions, the lockfile, the Zod version both sides share, and the SQL and Worker names already in production. The lockfile stops an install and the rest stop the build in a pre-build check when they disagree. A gap remains, though: CI uses the latest Node 24 while the container and .nvmrc use 24.16.0.",
    ),
    analogy: t(
      "요리 전에 재료 규격표(잠금 파일)를 확인하고, 같은 레시피를 쓰는 주방 두 곳(웹·API)의 저울 눈금(Zod 버전)이 같은지 점검하는 일입니다.",
      "It is like checking the ingredient spec sheet (the lockfile) before cooking, and making sure the scales (the Zod version) in the two kitchens using one recipe (web and API) read the same.",
    ),
    questions: [
      {
        question: t("왜 Zod 버전까지 맞추나요?", "Why even match the Zod version?"),
        answer: t(
          "같은 스키마를 브라우저와 서버가 모두 실행합니다. 버전이 갈라지면 기본값과 검증 의미가 달라질 수 있어, 단위 시험이 '패키지 간 Zod 기본값의 의미가 달라지는 버전 분리'를 거절하는지 고정합니다(^4.4.3 같은 범위 표기도 거절).",
          "Both the browser and the server run the same schemas. If versions split, defaults and validation meaning can differ, so a unit test pins that a version split between packages is refused (a range such as ^4.4.3 is refused too).",
        ),
      },
      {
        question: t("의존성은 자동으로 올리나요?", "Are dependencies upgraded automatically?"),
        answer: t(
          "Dependabot·Renovate 설정은 찾지 못했고 pnpm-workspace.yaml의 minimumReleaseAge도 0입니다. 올리는 시점은 사람이 정하며, 의존성 파일이 바뀐 푸시에는 보안·라이선스 감사가 붙습니다.",
          "No Dependabot or Renovate config was found, and minimumReleaseAge in pnpm-workspace.yaml is 0. People decide when to upgrade, and a push that changes dependency files adds the security and license audits.",
        ),
      },
      {
        question: t("Render는 어떤 Node를 쓰나요?", "Which Node does Render use?"),
        answer: t(
          "render.yaml에는 Node 버전이 없고, Render 문서의 우선순위대로면 .nvmrc(24.16.0)가 적용될 것으로 읽힙니다. 대시보드의 NODE_VERSION 유무와 실제 배포된 버전은 확인하지 못했습니다.",
          "render.yaml names no Node version, and by Render's documented precedence the .nvmrc (24.16.0) should apply. Whether a NODE_VERSION exists on the dashboard, and the version actually deployed, was not checked.",
        ),
      },
    ],
    pitfall: t(
      "'모든 환경이 같은 버전'이라고 말하지 마세요. CI는 24(최신 24.x), 컨테이너 릴리스와 .nvmrc는 24.16.0이고 engines는 상한이 없습니다. 이 검사들은 '버전 선언이 서로 같은가'를 볼 뿐 번들이 바이트까지 같다는 증명이 아니며, 정적 웹 배포 스크립트는 CI가 만든 dist를 올리지 않고 운영자 환경에서 다시 빌드합니다.",
      "Do not say that every environment has the same version. CI uses 24 (the latest 24.x), the container release and .nvmrc use 24.16.0, and engines has no ceiling. These checks only see whether version declarations agree; they do not prove a byte-identical bundle, and the static-site deploy script does not upload CI's dist but rebuilds in the operator's environment.",
    ),
  },
  technologies: ["pnpm", "Node.js", "Zod", "GitHub Actions", "Render", "Corepack"],
  facts: [
    {
      value: "4.4.3",
      label: t("루트 package.json의 Zod 선언 버전(8개 매니페스트 공통)", "Zod version declared in the root package.json (shared by 8 manifests)"),
      source: "package.json",
    },
    {
      value: "22 / 97",
      label: t("node-version을 24.16.0 / 24로 적은 워크플로 줄 수(파일 98개, 2026-10-08)", "Workflow lines writing node-version as 24.16.0 / 24 (98 files, 2026-10-08)"),
      source: ".github/workflows",
    },
    {
      value: "92",
      label: t("동결된 기배포 SQL 마이그레이션 수", "Shipped SQL migrations that are frozen"),
      source: "config/production-migration-baseline.json",
    },
  ],
  reviewedAt: "2026-10-08",
};

export const PLATFORM_OPS_BUILD_CARDS: readonly EngineeringAtlasEntry[] = [
  BUILD_FINGERPRINT_MAP,
  SHARED_CONTRACT_PATTERNS,
  VERSION_PIN_LAYERS,
  ...PLATFORM_OPS_BUILD_RELEASE_CARDS,
];
