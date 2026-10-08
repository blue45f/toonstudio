import type { EngineeringMapRow } from "./engineering-map-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 지도 · free-tier 의 표 행.
 *
 * 쓰기 규칙(상위 계약은 engineering-map-types.ts):
 * - 공급자의 무료 한도·가격은 저장소 문서·코드·JSON에 적힌 값만 옮긴다. 기억으로 쓰지 않는다.
 * - "공급자 한도"와 "우리가 건 상한"(앱 cap 비율, 일일 예산 기본값)을 문장에서 구분한다.
 * - 수치 기록이 없으면 NO_RECORD 문구를 그대로 쓴다.
 * - asOf 는 수치를 기록한 문서의 날짜, 날짜 없는 코드 상수는 이 저장소를 확인한 2026-10-07.
 * - 운영 대시보드의 실제 요금제·사용량은 확인하지 않았다(코드·설정·문서로 확인한 구성만 적는다).
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/** 한도 수치가 저장소에 없을 때 쓰는 고정 문구. */
const NO_RECORD_KO = "저장소에 한도 수치 기록 없음(공급자 요금표 확인 필요)";
const NO_RECORD_EN = "No limit figure is recorded in the repository (check the provider's price list)";

const INFRA = t("인프라", "Infrastructure");
const AI_TOKEN = t("AI 토큰", "AI tokens");
const ON_DEVICE = t("기기 안 추론", "On-device");
const DEV_TOOL = t("개발 도구", "Dev tooling");

/** 인프라: 엣지·서버·데이터베이스·저장소·메일·연합 후보. */
export const FREE_TIER_INFRA_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "cloudflare-static-assets",
    name: "Cloudflare Static Assets",
    cells: {
      use: t(
        "화면(SPA)과 웹툰 카탈로그 JSON을 Cloudflare 네트워크에서 바로 내려줍니다. 일반 화면 요청은 코드를 실행하지 않아 Worker 호출량을 쓰지 않습니다.",
        "Serves the app screens (SPA) and the webtoon catalog JSON straight from Cloudflare's network. Ordinary page requests run no code, so they use no Worker invocations.",
      ),
      limit: t(
        `파일 하나당 25 MiB(코드 상수). 요청 수·대역폭 등 나머지: ${NO_RECORD_KO}.`,
        `25 MiB per file (a code constant). Everything else, such as requests and bandwidth: ${NO_RECORD_EN}.`,
      ),
      "on-exceed": t(
        "25 MiB를 넘는 파일은 배포 전 검사가 막고, 검토된 대형 자산 6개만 압축 사본→R2 순으로 내려줍니다. 둘 다 안 되고 별도 원본도 없으면 Core API를 깨우지 않고 503으로 답합니다.",
        "Files over 25 MiB are stopped by a pre-deploy check; only six reviewed large assets are served, from a compressed copy first and then R2. If both fail and no separate origin is set, it answers 503 without waking the Core API.",
      ),
      kind: INFRA,
    },
    status: "live",
    link: { title: "Cloudflare Static Assets limits", url: "https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/" },
    evidence: [
      "deploy/cloudflare-static/wrangler.jsonc",
      "deploy/cloudflare-static/README.md",
      "deploy/cloudflare-static/src/large-static-assets.ts",
      "docs/FREE_INFRASTRUCTURE.md",
    ],
    asOf: "2026-10-07",
  },
  {
    id: "cloudflare-workers",
    name: "Cloudflare Workers",
    cells: {
      use: t(
        "정적 파일이 아닌 요청(로그인·API·실시간·링크 미리보기 등)만 먼저 받아 알맞은 서버로 전달하는 문지기입니다. 서버가 잠든 동안에도 '살아 있음' 확인에는 직접 답합니다.",
        "A gatekeeper that takes only non-static requests (sign-in, API, realtime, link previews) and forwards them to the right server. It answers the 'is it alive' health check itself while the server sleeps.",
      ),
      limit: t(
        `${NO_RECORD_KO}. 요금제는 Workers Free(US$0)로 2026-09-26 대시보드에서 확인했다고 기록. 우리 상한: 정책 비율 0.8.`,
        `${NO_RECORD_EN}. The plan is recorded as Workers Free (US$0), checked on the dashboard on 2026-09-26. Our cap: policy ratio 0.8.`,
      ),
      "on-exceed": t(
        "정책상 한도의 80%에서 먼저 멈추도록 정했지만 Worker에서 이를 집행하는 코드는 확인하지 못했습니다. 연결 설정이 잘못되면 몰래 우회하지 않고 503으로 닫습니다. 자동 유료 전환은 금지입니다.",
        "Policy says to stop at 80% of the limit, but no code that enforces it in the Worker was found. A bad origin setting is closed with a 503 instead of being bypassed quietly. Automatic paid upgrades are forbidden.",
      ),
      kind: INFRA,
    },
    status: "live",
    link: { title: "Cloudflare Workers pricing", url: "https://developers.cloudflare.com/workers/platform/pricing/" },
    evidence: [
      "deploy/cloudflare-static/wrangler.jsonc",
      "deploy/cloudflare-static/src/index.ts",
      "docs/operations/federated-free-database-data-plane.md",
      "config/free-infrastructure-policy.json",
    ],
    asOf: "2026-09-26",
  },
  {
    id: "cloudflare-durable-objects",
    name: "Cloudflare Durable Objects",
    cells: {
      use: t(
        "공동 작업 중 접속 표시·커서, 댓글 새로고침 알림, 화면 공유 연결 신호처럼 잠깐만 필요한 실시간 상태를 방(room)마다 하나씩 맡습니다. 작품 원본은 저장하지 않습니다.",
        "Holds short-lived realtime state for each room during collaboration: who is present and where their cursor is, comment refresh alerts and screen-share connection signals. It never stores the artwork itself.",
      ),
      limit: t(
        `${NO_RECORD_KO}. 우리 상한(코드 설정): 방당 연결 64개·사용자당 4개, 정책 비율 0.8.`,
        `${NO_RECORD_EN}. Our caps (code settings): 64 connections per room, 4 per user, policy ratio 0.8.`,
      ),
      "on-exceed": t(
        "공급자가 막히면 그 기능만 멈추고 더 약한 대체 구현으로 자동 전환하지 않습니다. 작품 저장의 원장은 Core API와 PostgreSQL이라 영향받지 않습니다.",
        "If the provider is blocked, only that feature stops, and nothing switches automatically to a weaker substitute. The ledger for saved work is the Core API plus PostgreSQL, so it is unaffected.",
      ),
      kind: INFRA,
    },
    status: "live",
    link: { title: "Durable Objects pricing", url: "https://developers.cloudflare.com/durable-objects/platform/pricing/" },
    evidence: [
      "deploy/cloudflare-realtime/wrangler.jsonc",
      "deploy/cloudflare-realtime/README.md",
      "DEPLOY.md",
      "docs/operations/canonical-database-topology.md",
    ],
    asOf: "2026-09-26",
  },
  {
    id: "cloudflare-r2",
    name: "Cloudflare R2",
    cells: {
      use: t(
        "25 MiB를 넘는 큰 파일(3D·AI 런타임 WASM, 채색 모델, 소개 영상 등)과 공개 에셋을 담는 창고입니다. 이름이 바뀌지 않는 파일이라 1년 캐시로 반복 요청을 줄입니다.",
        "A store for files over 25 MiB (3D and AI runtime WASM, the colorizing model, an intro video) and public assets. The files never change under the same name, so a one-year cache cuts repeat requests.",
      ),
      limit: t(
        `${NO_RECORD_KO}. 우리 상한: 정책 비율 0.8.`,
        `${NO_RECORD_EN}. Our cap: policy ratio 0.8.`,
      ),
      "on-exceed": t(
        "비공개 객체를 쓰기 전에 공급자 상태·측정 신선도·용량×비율을 점검하는 코드가 있고(운영 스위치 값은 미확인), 모자라면 다른 공급자로 몰래 옮기지 않고 거절합니다.",
        "Before a private object is written, code checks provider health, how fresh the usage reading is, and capacity times the cap (the production switch was not checked). If short, it refuses instead of quietly moving to another provider.",
      ),
      kind: INFRA,
    },
    status: "live",
    link: { title: "Cloudflare R2 pricing", url: "https://developers.cloudflare.com/r2/pricing/" },
    evidence: [
      "deploy/cloudflare-static/wrangler.jsonc",
      "deploy/cloudflare-static/src/large-static-assets.ts",
      "docs/FREE_INFRASTRUCTURE.md",
      "apps/api/src/platform/adapters/private-object-storage/private-object-storage-write-admission.ts",
    ],
    asOf: "2026-09-26",
  },
  {
    id: "cloudflare-d1",
    name: "Cloudflare D1",
    cells: {
      use: t(
        "방문 통계(페이지 조회·접속 유지 신호)를 잠시 쌓아 두는 작은 창고입니다. 개인 작품이 아니라 서비스 이용 통계만 다루며, 운영 경로 전환은 아직 대기 중입니다.",
        "A small buffer for visit statistics (page views and keep-alive signals). It handles usage statistics only, never personal artwork, and the switch to the production path is still pending.",
      ),
      limit: t(
        "공급자 한도(연합 정책 JSON 기록): DB 10개·저장 5 GiB·읽기 500만 행/일·쓰기 10만 행/일, 계정 전체가 공유. 우리 상한: 정책 비율 0.8.",
        "Provider limits recorded in the federation policy JSON: 10 databases, 5 GiB storage, 5,000,000 row reads per day and 100,000 row writes per day, shared by the whole account. Our cap: policy ratio 0.8.",
      ),
      "on-exceed": t(
        "D1이 실패해도 PostgreSQL에 대신 기록하지 않고, 결과가 불분명한 쓰기는 자동으로 다시 실행하지 않습니다. 시험(canary)에서 쓴 행이 12→9로 줄었지만 일일 처리량 보장은 아닙니다.",
        "If D1 fails, nothing is written to PostgreSQL instead, and a write with an unclear result is not retried automatically. In a test (canary) the rows written fell from 12 to 9, which is not a guaranteed daily throughput.",
      ),
      kind: INFRA,
    },
    status: "configured",
    link: { title: "Cloudflare D1 pricing", url: "https://developers.cloudflare.com/d1/platform/pricing/" },
    evidence: [
      "config/free-database-federation.json",
      "docs/operations/federated-free-database-data-plane.md",
      "docs/FREE_INFRASTRUCTURE.md",
      "scripts/deploy-cloudflare-analytics.mjs",
      "deploy/cloudflare-analytics/src/index.ts",
    ],
    asOf: "2026-09-26",
  },
  {
    id: "render-free-web-service",
    name: "Render Free web service",
    cells: {
      use: t(
        "Core API(로그인·권한·결제·원장 트랜잭션을 맡는 서버)를 Render 무료 웹 서비스로 돌립니다. 정적 화면과 생존 확인은 Cloudflare가 대신 답해서 이 서버를 깨우지 않습니다.",
        "Runs the Core API (the server for sign-in, permissions, payments and ledger transactions) as a Render free web service. Cloudflare answers static pages and health checks, so this server is not woken for them.",
      ),
      limit: t(
        "DEPLOY.md 기록: 15분 무요청 시 절전·첫 응답 약 1분, 워크스페이스 월 750 무료 인스턴스 시간, 인스턴스 1개, 배포 전 명령 불가. 실제 요금제·사용량은 미확인.",
        "Recorded in DEPLOY.md: sleeps after 15 minutes without requests, about one minute for the first reply, 750 free instance-hours per month for the workspace, one instance, no pre-deploy command. The actual plan and usage were not checked.",
      ),
      "on-exceed": t(
        "절전 뒤 첫 요청은 오류가 아니라 '연결 준비 중'으로 안내하고 6초마다 다시 확인합니다. 2026-09-25 무료 빌드 시간이 소진됐을 때는 NEIS 검색을 엣지로 옮겨 유지했습니다. 유료 승격은 별도 승인뿐입니다.",
        "After sleep, the first request shows 'connecting' instead of an error and is rechecked every 6 seconds. When free build time ran out on 2026-09-25, the NEIS search was moved to the edge to keep working. Upgrading to a paid plan needs separate approval.",
      ),
      kind: INFRA,
    },
    status: "live",
    link: { title: "Render free instances", url: "https://render.com/docs/free" },
    evidence: [
      "render.yaml",
      "DEPLOY.md",
      "apps/web/src/platform/service-capability-state.ts",
      "docs/operations/minimum-cost-deployment-policy.md",
      "docs/operations/free-api-access-register-2026-09-15.md",
    ],
    asOf: "2026-10-07",
  },
  {
    id: "supabase-postgresql",
    name: "Supabase PostgreSQL",
    cells: {
      use: t(
        "회원·세션·작품·커뮤니티·결제·협업 등 서비스의 '기록'을 보관하는 원장 DB입니다. 지금 쓰기 권위는 여기 하나이고, 데이터마다 쓰기 권위를 하나만 두는 것이 규칙입니다.",
        "The ledger database that keeps the service's records: members, sessions, artwork, community, payments and collaboration. It is the only current write authority, and each kind of data keeps exactly one.",
      ),
      limit: t(
        "공급자 한도(연합 JSON 기록): 활성 프로젝트 2개, 프로젝트당 DB 500,000,000 B. 요금제는 Supabase 조직 Free(2026-09-26 확인 기록). 우리 상한: 정책 비율 0.8(DB 용량 집행 코드는 미확인).",
        "Provider limits recorded in the federation JSON: 2 active projects, 500,000,000 B of database per project. The plan is recorded as Supabase organization Free (checked 2026-09-26). Our cap: policy ratio 0.8 (code enforcing DB size was not found).",
      ),
      "on-exceed": t(
        "자동 이중 쓰기와 자동 failover는 없습니다. Neon 무료 한도에 막히자 2026-09-26 사용자 승인으로 Supabase에서 빈 상태로 새로 시작했고, 옛 Neon은 보존합니다. 새 권위에 쓴 뒤에는 자동으로 되돌리지 않습니다.",
        "There is no automatic double write or failover. When the Neon free limit blocked it, a fresh start on Supabase was approved on 2026-09-26 and the old Neon is kept. Once the new authority is written to, nothing rolls back automatically.",
      ),
      kind: INFRA,
    },
    status: "live",
    link: { title: "Supabase pricing", url: "https://supabase.com/pricing" },
    evidence: [
      "docs/operations/canonical-database-topology.md",
      "render.yaml",
      "config/free-database-federation.json",
      "docs/FREE_INFRASTRUCTURE.md",
      "apps/api/src/platform/database/pg-connection.ts",
      "deploy/trust/README.md",
    ],
    asOf: "2026-09-26",
  },
  {
    id: "neon-postgresql-legacy",
    name: "Neon PostgreSQL (legacy)",
    cells: {
      use: t(
        "예전 원장 DB입니다. 지금은 새 데이터를 쓰지 않고 옛 원본으로 보존만 합니다. 무료 한도에 막혀 원장을 옮긴 사례의 출발점이라, 무료 계층의 현실적인 위험을 보여 줍니다.",
        "The former ledger database. It no longer receives new data and is only kept as the old original. It is the starting point of a case where a free limit forced a move, which shows the real risk of free tiers.",
      ),
      limit: t(
        "공급자 한도(연합 JSON 기록): 프로젝트 10개·프로젝트당 저장 512 MiB·compute 180,000초/월·외부 전송 5 GiB/월. 우리 상한: 정책 비율 0.8.",
        "Provider limits recorded in the federation JSON: 10 projects, 512 MiB storage per project, 180,000 compute seconds per month and 5 GiB of egress per month. Our cap: policy ratio 0.8.",
      ),
      "on-exceed": t(
        "할당량 초과로 HTTP 402가 나와 원본 데이터를 읽어 옮기는 일이 끝나지 않았고, 정상 복구(rollback) 대상으로도 보지 않습니다. 새 쓰기 권위로 되돌리지 않습니다.",
        "A quota error (HTTP 402) left the move of the original data unfinished, and it is not treated as a normal rollback target. It will not be made the write authority again.",
      ),
      kind: INFRA,
    },
    status: "retired",
    link: { title: "Neon pricing", url: "https://neon.com/pricing" },
    evidence: [
      "docs/operations/canonical-database-topology.md",
      "docs/FREE_INFRASTRUCTURE.md",
      "config/free-database-federation.json",
      "docs/operations/federated-free-database-data-plane.md",
    ],
    asOf: "2026-09-26",
  },
  {
    id: "upstash-redis",
    name: "Upstash Redis",
    cells: {
      use: t(
        "로그인 시도 횟수 제한, 같은 요청을 두 번 처리하지 않는 영수증, 짧은 잠금처럼 빨리 읽고 쓰는 작은 메모를 맡습니다. 작품 내용이나 프롬프트는 저장하지 않습니다.",
        "Holds small, fast notes: sign-in attempt limits, receipts so the same request is never processed twice, and short locks. It never stores artwork content or prompts.",
      ),
      limit: t(
        "공급자 한도(연합 JSON 기록): 저장 256 MiB·명령 500,000회/월·대역폭 10 GiB/월. 우리 상한: 정책 비율 0.75.",
        "Provider limits recorded in the federation JSON: 256 MiB storage, 500,000 commands per month and 10 GiB of bandwidth per month. Our cap: policy ratio 0.75.",
      ),
      "on-exceed": t(
        "켜는 스위치(UPSTASH_COORDINATION_ENABLED)가 꺼져 있으면 이 기능은 빠지고 메모리 대체물이 없습니다. 분산 로그인 제한 모드에서 Upstash가 꺼져 있으면 설정 오류로 막힙니다. 월 명령 소진 때 동작은 미확인.",
        "If the switch (UPSTASH_COORDINATION_ENABLED) is off, this feature is dropped with no in-memory substitute. In distributed sign-in limiting mode, a missing Upstash is a configuration error. Behavior after the monthly command quota is used up was not checked.",
      ),
      kind: INFRA,
    },
    status: "configured",
    link: { title: "Upstash Redis pricing", url: "https://upstash.com/pricing/redis" },
    evidence: [
      "apps/api/src/platform/adapters/upstash-coordination/README.md",
      "apps/api/src/modules/auth/auth-rate-limit.config.ts",
      "config/free-database-federation.json",
      "docs/operations/canonical-database-topology.md",
      "render.yaml",
    ],
    asOf: "2026-09-26",
  },
  {
    id: "backblaze-b2",
    name: "Backblaze B2",
    cells: {
      use: t(
        "백업·보관용 창고 후보입니다. 비공개 파일을 R2·Supabase·B2 중 용도별로 고정해 저장하는 어댑터는 있지만, R2 파일이 자동으로 B2에 복제되는 것은 아닙니다.",
        "A candidate store for backups and archives. An adapter can pin private files to R2, Supabase or B2 by purpose, but R2 files are not copied to B2 automatically.",
      ),
      limit: t(
        `${NO_RECORD_KO}. 우리 상한: 정책 비율 0.8.`,
        `${NO_RECORD_EN}. Our cap: policy ratio 0.8.`,
      ),
      "on-exceed": t(
        "R2와 같은 쓰기 점검 경로를 쓰며, 모자라도 다른 공급자로 자동 전환하지 않습니다. 정기 백업과 복구 연습은 아직 목표 단계(target)입니다.",
        "It shares the write check used for R2 and never switches to another provider automatically when short. Regular backups and restore drills are still a target stage.",
      ),
      kind: INFRA,
    },
    status: "configured",
    link: { title: "Backblaze B2 pricing", url: "https://www.backblaze.com/cloud-storage/pricing" },
    evidence: [
      "docs/FREE_INFRASTRUCTURE.md",
      "config/free-infrastructure-policy.json",
      "apps/api/src/platform/adapters/private-object-storage/private-object-storage.config.ts",
      "docs/operations/canonical-database-topology.md",
    ],
    asOf: "2026-09-26",
  },
  {
    id: "resend-email",
    name: "Resend",
    cells: {
      use: t(
        "이메일 가입 확인과 비밀번호 재설정 메일을 보냅니다. 메일은 보안에 필요한 기능이라 비용 때문에 건너뛰지 않는다는 원칙을 문서에 적어 두었습니다.",
        "Sends the email address confirmation and password reset mails. Mail is a security feature, so the docs state a rule that it is never skipped just to save cost.",
      ),
      limit: t(
        `${NO_RECORD_KO}. 우리 상한: 정책 비율 0.8.`,
        `${NO_RECORD_EN}. Our cap: policy ratio 0.8.`,
      ),
      "on-exceed": t(
        "설정(API 키·보내는 주소)이 없으면 이메일 가입·재설정은 '설정이 완료되지 않았다'는 503으로 막히고, 전달이 실패하면 오류로 끝납니다. 대체 공급자 코드는 없습니다. 운영 설정 여부는 미확인.",
        "Without the settings (API key and sender address) email sign-up and reset stop with a 503 saying setup is incomplete, and a failed delivery ends as an error. There is no substitute provider in code. Whether production is configured was not checked.",
      ),
      kind: INFRA,
    },
    status: "configured",
    link: { title: "Resend pricing", url: "https://resend.com/pricing" },
    evidence: [
      "apps/api/src/server/auth-email.ts",
      "config/free-infrastructure-policy.json",
      "docs/FREE_INFRASTRUCTURE.md",
      ".env.production.example",
    ],
    asOf: "2026-10-07",
  },
  {
    id: "browser-opfs",
    name: "Browser OPFS",
    cells: {
      use: t(
        "작업 중인 프로젝트와 레이어는 사용자 브라우저 저장소(OPFS)에 둡니다. 서버 저장 용량을 쓰지 않고, 큰 개인 파일은 사용자 소유 저장소(BYOS)를 기본 확장 경로로 정했습니다(구현은 단계적).",
        "Work-in-progress projects and layers live in the user's own browser storage (OPFS), using no server space. Big personal files are meant to go to user-owned storage (BYOS), which is being built in stages.",
      ),
      limit: t(
        `${NO_RECORD_KO}. 한도는 브라우저·기기마다 달라 서버 요금이 들지 않습니다. 정책 비율 0.95(기기 소유).`,
        `${NO_RECORD_EN}. The limit depends on each browser and device, so no server cost arises. Policy ratio 0.95 (device-owned).`,
      ),
      "on-exceed": t(
        "서버가 잠들거나 멈춰도 정적 화면·카탈로그·로컬 편집은 계속됩니다(상태 점검에서 두 기능을 항상 사용 가능으로 고정). 클라우드 저장·협업·게시는 기능별로 따로 '사용 불가'가 표시됩니다.",
        "If the server sleeps or stops, the static app, the catalog and local editing keep working (the health report pins those two as always available). Cloud save, collaboration and publishing are flagged unavailable one by one.",
      ),
      kind: INFRA,
    },
    status: "live",
    link: { title: "MDN: Origin private file system", url: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system" },
    evidence: [
      "config/free-infrastructure-policy.json",
      "docs/FREE_INFRASTRUCTURE.md",
      "apps/api/src/modules/health/health.service.ts",
      "apps/web/src/domains/creator/studio-opfs-filesystem.ts",
    ],
    asOf: "2026-10-07",
  },
  {
    id: "kmas-open-api",
    name: "KMAS Open API",
    cells: {
      use: t(
        "한국만화영상진흥원 만화규장각(KMAS)이 제공하는 무료 공공 API로 작품 정보를 검색·보강합니다. 키는 서버에만 두고, 전부 긁어 오지 않고 사용자 검색과 제한적 보강에만 씁니다.",
        "A free public API from the Korea Manhwa Contents Agency archive (KMAS), used to search and enrich title data. The key stays on the server, and it is used for user searches and limited enrichment, not bulk collection.",
      ),
      limit: t(
        "공급자 한도(연동 대장 기록): 하루 1,000회, 관리자 승인 키는 2027-07-06에 만료.",
        "Provider limit recorded in the access register: 1,000 calls per day, and the approved key expires on 2027-07-06.",
      ),
      "on-exceed": t(
        "하루 1,000회를 아끼려고 자동 전체 수집 대신 사용자 검색·제한적 보강을 우선합니다. 한도를 넘었을 때의 코드 동작은 확인하지 못했고, 만료일 전에 키를 갱신해야 합니다.",
        "To protect the 1,000 daily calls it prefers user searches and limited enrichment over automatic bulk collection. What the code does past the limit was not checked, and the key must be renewed before its expiry date.",
      ),
      kind: INFRA,
    },
    status: "configured",
    link: { title: "KMAS (Korea Manhwa Gyujanggak)", url: "https://www.kmas.or.kr/" },
    evidence: [
      "docs/operations/free-api-access-register-2026-09-15.md",
      "docs/kmas-integration.md",
      "docs/operations/production-environment.md",
    ],
    asOf: "2026-09-16",
  },
  {
    id: "gcp-free-data",
    name: "Firestore · RTDB · BigQuery",
    cells: {
      use: t(
        "알림함·접속 상태·분석에 쓸 수 있도록 무료 자원과 규칙을 만들어 두었습니다(결제 연결 비활성). 하지만 제품 코드에 아직 연결하지 않아 운영 트래픽을 나누는 것으로 계산하지 않습니다.",
        "Free resources and rules were created for notifications, presence and analytics (billing is disabled). They are not yet wired into product code, so they do not count as shared production traffic.",
      ),
      limit: t(
        "공급자 한도(연합 JSON 기록): Firestore 저장 1 GiB·읽기 5만/일·쓰기 2만/일, RTDB 저장 1 GB·동시 연결 100, BigQuery 저장 10 GiB(평생 누적)·쿼리 1 TiB/월. 우리 상한 0.75~0.8.",
        "Provider limits recorded in the federation JSON: Firestore 1 GiB storage, 50,000 reads and 20,000 writes per day; RTDB 1 GB storage and 100 concurrent connections; BigQuery 10 GiB storage (lifetime total) and 1 TiB of queries per month. Our caps 0.75 to 0.8.",
      ),
      "on-exceed": t(
        "연결 전이라 지금 서비스 동작에는 영향이 없습니다. BigQuery는 스트리밍 입력이 막혀 D1 버퍼에서 묶음(batch)으로만 적재할 계획이며, 주기 삭제로 원시 이벤트를 영구 보관하는 용도로 계산하지 않습니다.",
        "Not connected yet, so today's service is unaffected. BigQuery blocks streaming inserts, so the plan is batch loads from the D1 buffer only, and it is not counted as permanent storage for raw events through periodic deletion.",
      ),
      kind: INFRA,
    },
    status: "configured",
    link: { title: "BigQuery sandbox limits", url: "https://docs.cloud.google.com/bigquery/docs/sandbox" },
    evidence: [
      "config/free-database-federation.json",
      "docs/operations/federated-free-database-data-plane.md",
      "docs/FREE_INFRASTRUCTURE.md",
      "deploy/gcp-free-data",
    ],
    asOf: "2026-09-26",
  },
  {
    id: "federated-data-plane",
    name: "Federated data plane",
    cells: {
      use: t(
        "무료 DB 16곳을 어디에 어떻게 나눠 쓸지 정한 계획·검사 코드입니다(후보 16곳·논리 구획 21·경로 36). 기본은 꺼져 있어, 지금 DB를 16곳에 나눠 쓰는 것은 아닙니다.",
        "Planning and checking code for how 16 free databases could be shared (16 candidates, 21 logical shards, 36 routes). It is off by default, so data is not spread over 16 databases today.",
      ),
      limit: t(
        "공급자별 한도는 config/free-database-federation.json(2026-09-26 확인). 우리 규칙: 데이터마다 쓰기 권위 하나, 자동 유료 전환 금지, 15분 넘은 사용량 측정값은 거부.",
        "Per-provider limits are in config/free-database-federation.json (checked 2026-09-26). Our rules: one write authority per data set, no automatic paid overflow, and usage readings older than 15 minutes are rejected.",
      ),
      "on-exceed": t(
        "정책 문서가 정한 단계: 60% 경고·70% 소진 예측·80% 큰 파일 로컬 유도·85% 개인 대형 파일 쓰기 중단·95% 원장 외 쓰기 중단. 정책 검사기는 있으나 실행 코드는 객체 저장소 쓰기 점검만 확인했습니다.",
        "Stages set by the policy doc: 60% warn, 70% forecast exhaustion, 80% steer big files to local storage, 85% stop writes of big personal files, 95% stop writes other than the ledger. A policy checker exists, but only the object-storage write check was confirmed in running code.",
      ),
      kind: INFRA,
    },
    status: "configured",
    evidence: [
      "config/free-database-federation.json",
      "config/free-infrastructure-policy.json",
      "docs/operations/federated-free-database-data-plane.md",
      "docs/FREE_INFRASTRUCTURE.md",
      "scripts/free-infrastructure-policy.mjs",
      "apps/api/src/platform/federated-data-plane/federated-data-plane-routing.ts",
    ],
    asOf: "2026-09-26",
  },
  {
    id: "federation-candidates",
    name: "Federation candidates",
    cells: {
      use: t(
        "나중에 독립된 데이터(계정·프로젝트·감사 기록·AI 작업 등)를 옮길 수 있는 후보 9곳입니다. 인증·측정값·연결 코드·권한·시험이 끝나기 전에는 운영 처리량으로 계산하지 않습니다.",
        "Nine candidates that could later hold independent data such as accounts, projects, audit records and AI jobs. Until authentication, usage readings, connection code, permissions and tests are done, they do not count as production capacity.",
      ),
      limit: t(
        "공급자 한도 중 저장만 발췌(연합 JSON 기록): TiDB 25 GiB·CockroachDB 10 GiB·Turso 5 GB·Cosmos 25 GB·DynamoDB 25 GiB·Atlas M0 512 MiB·Convex 512 MiB·Appwrite 2 GiB·MotherDuck 10 GB.",
        "Storage limits only, from the federation JSON: TiDB 25 GiB, CockroachDB 10 GiB, Turso 5 GB, Cosmos 25 GB, DynamoDB 25 GiB, Atlas M0 512 MiB, Convex 512 MiB, Appwrite 2 GiB, MotherDuck 10 GB. Request limits are in the JSON.",
      ),
      "on-exceed": t(
        "연결 전이라 서비스에는 영향이 없습니다. 연결한 뒤에도 사용량 측정값이 없거나 오래되면 실패로 처리하고, 한도가 차도 다른 공급자로 자동 쓰기 전환이나 유료 전환은 하지 않습니다.",
        "Not connected yet, so the service is unaffected. Once connected, a missing or stale usage reading counts as a failure, and a full limit never triggers an automatic write switch to another provider or a paid upgrade.",
      ),
      kind: INFRA,
    },
    status: "planned",
    evidence: [
      "config/free-database-federation.json",
      "docs/operations/canonical-database-topology.md",
      "docs/FREE_INFRASTRUCTURE.md",
      "deploy/federated-data-plane",
    ],
    asOf: "2026-09-26",
  },
];

/** AI 토큰: 무료 우선 라우팅의 허용 목록·예산 원장·공유 풀·유료 경로 잠금. */
export const FREE_TIER_AI_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "ai-free-first-allowlist",
    name: "Free-first allowlist",
    cells: {
      use: t(
        "개인 AI 키로 클라우드를 부르기 전에 '정말 무료 조건인가'를 코드가 확인합니다. 비용 정책 4종 중 '미확인'은 호출 자체를 막고, 자동 무료 경로는 글(텍스트)만 허용합니다.",
        "Before any cloud call with a personal AI key, code checks whether the connection really meets a free condition. Of four cost policies, 'unverified' blocks the call itself, and the automatic free path allows text only.",
      ),
      limit: t(
        `${NO_RECORD_KO}. 우리가 건 허용 목록: 공식 주소 8곳+Qwen 베이징 워크스페이스+OpenRouter(검토 2026-09-16), 연결마다 키 12개·모델 32개, 연결 24개까지.`,
        `${NO_RECORD_EN}. Our allowlist: eight official hosts plus the Qwen Beijing workspace and OpenRouter (reviewed 2026-09-16), up to 12 keys and 32 models per connection, 24 connections.`,
      ),
      "on-exceed": t(
        "조건에 안 맞는 연결은 호출 전에 거절합니다(예: Z.AI는 glm-4.7-flash·glm-4.5-flash만, OpenRouter는 openrouter/free 또는 :free 모델만). 무료가 소진돼도 유료 모델로 자동 전환하지 않습니다.",
        "A connection that does not fit is refused before the call (for example Z.AI only allows glm-4.7-flash and glm-4.5-flash, OpenRouter only openrouter/free or :free models). Even when free quota runs out, nothing switches to a paid model automatically.",
      ),
      kind: AI_TOKEN,
    },
    status: "live",
    evidence: [
      "apps/web/src/shared/ai/free-ai-policy.ts",
      "apps/web/src/shared/ai/user-ai-types.ts",
      "apps/web/src/shared/ai/user-ai-transport.ts",
      "docs/operations/free-ai-runtime.md",
    ],
    asOf: "2026-09-16",
  },
  {
    id: "ai-browser-budget-ledger",
    name: "Browser budget ledger",
    cells: {
      use: t(
        "개인 무료 키로 AI를 부를 때, 보내기 전에 오늘 몇 번·토큰 몇 개까지 쓸지를 브라우저 장부에 먼저 잡아 둡니다. 장부에는 횟수와 시각만 남기고 프롬프트·응답·키는 저장하지 않습니다.",
        "When a personal free key calls an AI, the browser first reserves in a ledger how many calls and tokens may be used today. The ledger keeps only counts and times, never prompts, replies or keys.",
      ),
      limit: t(
        "우리가 건 상한(공급자 한도 아님): 경로마다 하루(UTC) 25회·예약 토큰 64,000개·출력 1,024 토큰, 요청 256 KiB·응답 2 MiB.",
        "Our caps, not provider limits: per route per UTC day 25 calls, 64,000 reserved tokens and 1,024 output tokens, 256 KiB per request and 2 MiB per reply.",
      ),
      "on-exceed": t(
        "호출 전에 멈춥니다. 402는 사용자가 풀기 전까지 잠그고, 429는 15분(두 번째는 다음 UTC 자정), 401·403은 10분 멈춥니다. 유료로 자동 전환하지 않으며, 브라우저 데이터를 지우면 장부가 초기화됩니다.",
        "It stops before the call. A 402 locks until the user clears it, a 429 pauses 15 minutes (the second one until the next UTC midnight), and 401 or 403 pauses 10 minutes. Nothing upgrades to paid automatically, and clearing browser data resets the ledger.",
      ),
      kind: AI_TOKEN,
    },
    status: "live",
    evidence: [
      "apps/web/src/shared/ai/free-ai-runtime-budget.ts",
      "apps/web/src/shared/ai/free-ai-runtime-budget.test.ts",
      "apps/web/src/shared/ai/user-ai-transport.ts",
      "docs/operations/free-ai-runtime.md",
    ],
    asOf: "2026-10-07",
  },
  {
    id: "ai-personal-free-keys",
    name: "Personal free keys",
    cells: {
      use: t(
        "사용자가 자기 무료 API 키를 붙이면 브라우저가 공급자로 바로 보냅니다: Gemini·Groq·Mistral·SambaNova·Cerebras·Hugging Face·Qwen·Z.AI·SiliconFlow·OpenRouter. 키는 우리 서버를 거치지 않고 기본은 메모리에만 둡니다.",
        "When users add their own free API key, the browser sends requests straight to the provider: Gemini, Groq, Mistral, SambaNova, Cerebras, Hugging Face, Qwen, Z.AI, SiliconFlow or OpenRouter. Keys never pass through our server and by default stay in memory only.",
      ),
      limit: t(
        `${NO_RECORD_KO}. 계정이 결제 없는 무료 계정인지는 코드가 알 수 없어 사용자 확인 사항으로 남깁니다.`,
        `${NO_RECORD_EN}. Code cannot tell whether an account has billing disabled, so that stays a check for the user.`,
      ),
      "on-exceed": t(
        "402·429면 다음 키·모델로 넘어가고 모두 소진되면 멈춥니다(유료·로컬 자동 전환 없음). 단 운영 CSP가 허용한 AI 주소는 4곳뿐이라 나머지는 브라우저에서 막힐 수 있습니다(실브라우저 미검증).",
        "On 402 or 429 it moves to the next key or model, and stops when all are used (no automatic paid or local switch). But the production CSP allows only four AI hosts, so the others may be blocked in the browser (not verified in a real browser).",
      ),
      kind: AI_TOKEN,
    },
    status: "configured",
    evidence: [
      "apps/web/src/shared/ai/free-ai-policy.ts",
      "apps/web/src/shared/ai/user-ai-transport.ts",
      "apps/web/src/shared/ai/user-ai-store.ts",
      "config/http-response-headers.json",
      "docs/operations/free-ai-runtime.md",
    ],
    asOf: "2026-09-16",
  },
  {
    id: "ai-shared-free-pool",
    name: "Shared free pool",
    cells: {
      use: t(
        "키가 없는 로그인 사용자도 글·대사·번역·콘티 도움을 받도록, 서버가 무료 티어 9곳을 Gemini→Qwen→Groq→SambaNova→Z.AI→Mistral→Cloudflare→OpenRouter→SiliconFlow 순으로 시도하게 만들었습니다(운영자 확인이 끝난 곳만 참여).",
        "So logged-in users without a key still get help with text, dialogue, translation and storyboards, the server is built to try nine free tiers in this order: Gemini, Qwen, Groq, SambaNova, Z.AI, Mistral, Cloudflare, OpenRouter, SiliconFlow (only operator-confirmed providers take part).",
      ),
      limit: t(
        `${NO_RECORD_KO}. 데이터 약관(2026-10-06 검토): Gemini·Mistral은 학습에 쓰일 수 있고 Groq는 아니며, OpenRouter는 모델마다 다르고 나머지는 확인 안 됨. 이 약관 배지는 아직 화면에 표시되지 않음.`,
        `${NO_RECORD_EN}. Data terms (reviewed 2026-10-06): Gemini and Mistral may train on inputs, Groq does not, OpenRouter varies by model, the rest are unconfirmed. This terms badge is not shown on screen yet.`,
      ),
      "on-exceed": t(
        "공급자는 서버 키와 운영자 확인(CONFIRMED)이 있어야 참여합니다. 저장소 설정상 풀은 켜졌지만 확인된 공급자는 없습니다(대시보드 값 미확인). 모두 소진되면 429로 끝내고 유료로 가지 않습니다.",
        "A provider joins only with a server key and an operator CONFIRMED flag. In the repository settings the pool is on but no provider is confirmed (dashboard values not checked). When all are used up it ends with a 429 and never goes paid.",
      ),
      kind: AI_TOKEN,
    },
    status: "configured",
    evidence: [
      "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
      "apps/api/src/modules/studio-ai/studio-ai.service.ts",
      "render.yaml",
      "docs/operations/free-ai-runtime.md",
      "apps/web/src/shared/ai/free-ai-pool-status.ts",
    ],
    asOf: "2026-10-06",
  },
  {
    id: "ai-server-quota-ledger",
    name: "Server quota ledger",
    cells: {
      use: t(
        "서버 공유 풀로 나가는 요청마다 호출 전에 PostgreSQL 한 문장으로 한도를 예약하고, 끝나면 정산합니다. 같은 요청은 한 번만 보내도록 영수증을 남기며 프롬프트·응답은 저장하지 않습니다.",
        "For every request to the shared pool, one PostgreSQL statement reserves the quota before the call and settles it afterwards. A receipt makes sure the same request is sent once, and prompts and replies are not stored.",
      ),
      limit: t(
        "우리가 건 상한(환경변수로 조정): 사용자 하루 200회·1,000,000 토큰, 서비스 전체 하루 500회·2,000,000 토큰, 사용자당 분당 20회.",
        "Our caps (adjustable by environment variables): per user per day 200 calls and 1,000,000 tokens, whole service per day 500 calls and 2,000,000 tokens, and 20 calls per user per minute.",
      ),
      "on-exceed": t(
        "한도를 넘으면 공급자를 부르기 전에 거절합니다. 공급자가 사용량을 알려주지 않으면 예약량 전체를 청구해 넉넉히 막습니다. 하루 경계는 UTC(한국 09:00)이고, 운영 DB 마이그레이션 적용은 대기 중입니다.",
        "Past a cap the request is refused before any provider is called. If the provider reports no usage, the full reservation is charged, which errs on the side of blocking. The day boundary is UTC (09:00 in Korea), and applying the production DB migration is still pending.",
      ),
      kind: AI_TOKEN,
    },
    status: "configured",
    evidence: [
      "apps/api/src/modules/studio-ai/studio-ai-usage.ts",
      "apps/api/src/modules/studio-ai/studio-ai-usage.repository.ts",
      "apps/api/src/modules/studio-ai/studio-ai-admission.ts",
      "apps/api/src/modules/studio-ai/README.md",
    ],
    asOf: "2026-10-07",
  },
  {
    id: "ai-paid-routes-gated",
    name: "Paid routes (gated)",
    cells: {
      use: t(
        "돈이 드는 경로는 따로 잠가 둡니다. 사용자가 직접 결제하는 키(BYOK)는 사용자가 명시적으로 켠 뒤에만 쓰고, 서버 유료 AI(음성·효과음·번역·3D·이미지 검사)는 운영에서 기본 꺼짐입니다.",
        "Routes that cost money are locked separately. A key the user pays for (BYOK) is used only after the user turns it on explicitly, and server-side paid AI (voice, sound effects, translation, 3D, image checks) is off by default in production.",
      ),
      limit: t(
        `우리가 건 서버 상한(사용자 하루): 음성 120·효과음 24·번역 200·3D 8·이미지 검사 100회. 공급자 가격: ${NO_RECORD_KO}.`,
        `Our server caps (per user per day): 120 voice, 24 sound-effect, 200 translation, 8 3D and 100 image-check calls. Provider prices: ${NO_RECORD_EN}.`,
      ),
      "on-exceed": t(
        "한도·확인 실패 때는 유료 호출을 시작하지 않고, 분산 예산 서비스에 연결하지 못하면 중지합니다. 음성은 실패하면 브라우저 무료 음성으로 잇습니다. 음악(ElevenLabs)은 무료 플랜 약관이 개인 사용 전용이라 켜지 않았습니다.",
        "Past a cap or on a failed check no paid call starts, and without the shared budget service it stops. Voice falls back to the browser's free speech. Music (ElevenLabs) is left off because its free plan terms allow personal use only.",
      ),
      kind: AI_TOKEN,
    },
    status: "configured",
    evidence: [
      "apps/web/src/shared/ai/user-ai-types.ts",
      "apps/api/src/modules/creator-intelligence/creator-intelligence-paid-admission.ts",
      "render.yaml",
      "docs/ai-music-provider-operations.md",
    ],
    asOf: "2026-10-07",
  },
];

/** 기기 안 추론(서버 AI 비용 0)과 개발 도구. */
export const FREE_TIER_DEVICE_AND_TOOL_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "onnx-runtime-web",
    name: "ONNX Runtime Web",
    cells: {
      use: t(
        "스튜디오 이미지 도구의 기기 채색·AI 업스케일·애니풍 변환·사진에서 선 추출·배경 제거(일반 피사체)를 사용자 컴퓨터에서 돌립니다. 이미지를 서버로 보내지 않고 AI 토큰도 쓰지 않습니다.",
        "Runs the studio image tools on the user's own computer: on-device colorizing, AI upscaling, anime-style conversion, line extraction from photos and background removal for general subjects. Images are not sent to a server and no AI tokens are used.",
      ),
      limit: t(
        "서버 AI 비용 0(기기가 계산). 처음 쓸 때 모델 파일 6개 합계 119,438,571 B(채색 79,269,994 B 포함, 코드 기록)와 런타임 WASM 26,827,543 B(설치 패키지 실측)를 내려받습니다. 우리 안전 한도: 모델 1 GiB·텐서 512 MiB.",
        "No server AI cost (the device computes). On first use it downloads six model files totalling 119,438,571 B (79,269,994 B for colorizing, recorded in code) plus 26,827,543 B of runtime WASM (measured from the installed package). Our safety limits: 1 GiB per model, 512 MiB per tensor.",
      ),
      "on-exceed": t(
        "WebGPU를 못 쓰면 느린 WASM 경로로 넘어가고(실패한 경로는 다시 쓰지 않음), 모델 해시가 등록값과 다르면 거부합니다. 추론이 끝났을 때 문서가 바뀌었으면 결과를 버립니다.",
        "Without WebGPU it falls back to the slower WASM path (a failed path is not tried again), and a model whose hash differs from the registered value is rejected. If the document changed while it ran, the result is discarded.",
      ),
      kind: ON_DEVICE,
    },
    status: "live",
    link: { title: "ONNX Runtime Web tutorials", url: "https://onnxruntime.ai/docs/tutorials/web/" },
    evidence: [
      "apps/web/src/domains/creator/studio-onnx-inference-provider.ts",
      "apps/web/src/domains/creator/studio-onnx-model-registry.ts",
      "apps/web/src/domains/creator/assets",
      "package.json",
    ],
    asOf: "2026-10-07",
  },
  {
    id: "mediapipe-vision",
    name: "MediaPipe Vision",
    cells: {
      use: t(
        "웹캠·사진으로 얼굴·손·몸 자세를 따라 3D 아바타와 마네킹을 움직이고, 인물 배경을 분리하고, 아바타 참고 이미지를 추천합니다. 영상은 서버로 보내지 않고 기기 안에서 처리합니다.",
        "Follows face, hand and body pose from a webcam or photo to move 3D avatars and mannequins, separates a person from the background and suggests avatar reference images. Video is processed on the device and not sent to a server.",
      ),
      limit: t(
        "서버 AI 비용 0(기기가 계산). 처음 쓸 때 WASM 11,153,617 B(설치 패키지 실측)와 Google 저장소의 모델 파일을 내려받으며, 모델 크기는 저장소에 기록 없음(이미지 임베더만 4,117,670 B).",
        "No server AI cost (the device computes). On first use it downloads 11,153,617 B of WASM (measured from the installed package) and model files from Google storage; model sizes are not recorded in the repository (only the image embedder, 4,117,670 B).",
      ),
      "on-exceed": t(
        "GPU를 기본으로 쓰고 CPU는 사용자가 미리 고른 경우에만 쓰며 몰래 바꾸지 않습니다. 모델 중 이미지 임베더만 해시로 고정되고 나머지는 Google 저장소의 파일을 그대로 받습니다.",
        "It uses the GPU by default and the CPU only when chosen beforehand, never switching quietly. Of the models only the image embedder is pinned by hash; the rest are fetched as they are from Google's storage.",
      ),
      kind: ON_DEVICE,
    },
    status: "live",
    link: { title: "MediaPipe solutions guide", url: "https://developers.google.com/edge/mediapipe/solutions/guide" },
    evidence: [
      "apps/web/src/domains/creator/studio-mediapipe-vision-assets.ts",
      "apps/web/src/domains/creator/vrm/studio-vrm-webcam-tracking.ts",
      "apps/web/src/domains/creator/vrm/studio-vrm-avatar-reference-recommendation.ts",
      "package.json",
    ],
    asOf: "2026-10-07",
  },
  {
    id: "transformers-js-translation",
    name: "Transformers.js (OPUS-MT)",
    cells: {
      use: t(
        "리서치 데스크의 한글 검색어를 영어로 옮깁니다(사전 → 기기 안 번역 모델 → 부분 사전 → 원문 순). 번역 API에 검색어를 보내지 않고, 실패해도 검색은 계속됩니다.",
        "Translates Korean search terms to English in the research desk (dictionary, then an on-device model, then a partial dictionary, then the original). Terms are not sent to a translation API, and search continues even if it fails.",
      ),
      limit: t(
        "서버 AI 비용 0(기기가 계산). 모델 파일 합계 123,110,000 B(약 123.1 MB)를 처음 한 번 내려받습니다. 단 모델 파일은 저장소에 없어 배포 때 배치해야 켜집니다.",
        "No server AI cost (the device computes). It downloads model files totalling 123,110,000 B (about 123.1 MB) once. The model files are not in the repository and must be placed at deploy time to switch it on.",
      ),
      "on-exceed": t(
        "모델이 없거나 실패하면 조용히 사전 번역·원문 검색으로 이어집니다. 모델 파일을 둬도 번역 런타임이 운영 CSP에 막힐 수 있어(정적 분석 의심, 실브라우저 미검증) 스테이징 확인이 남았습니다.",
        "If the model is missing or fails, it quietly falls back to the dictionary and the original term. Even with the files in place, the production CSP may block the translation runtime (suspected from static analysis, not verified in a browser), so a staging check remains.",
      ),
      kind: ON_DEVICE,
    },
    status: "configured",
    link: { title: "Transformers.js documentation", url: "https://huggingface.co/docs/transformers.js/index" },
    evidence: [
      "apps/web/src/domains/creator-resources/research-query-mt.ts",
      "apps/web/src/domains/creator-resources/research-query-translation.ts",
      "package.json",
    ],
    asOf: "2026-10-07",
  },
  {
    id: "github-actions",
    name: "GitHub Actions",
    cells: {
      use: t(
        "코드를 합치기 전에 타입·린트·테스트·빌드·접근성 검사를 자동으로 돌립니다(워크플로 98개). 운영 배포는 일부러 여기서 하지 않고, 배포 명령이 workflow에 들어오면 검사기가 실패시킵니다.",
        "Runs type, lint, test, build and accessibility checks automatically before code is merged (98 workflows). Production deploys are deliberately not done here, and a policy checker fails the build if a deploy command enters a workflow.",
      ),
      limit: t(
        `${NO_RECORD_KO}. 우리 상한: 정기 진단 매트릭스당 병렬 2개(2026-09-20 결정), 유료 러너는 별도 승인 없이 쓰지 않음. 정책 비율 0.8.`,
        `${NO_RECORD_EN}. Our caps: at most two parallel jobs per scheduled diagnostic matrix (decided 2026-09-20), and no paid runners without separate approval. Policy ratio 0.8.`,
      ),
      "on-exceed": t(
        "무료 시간이 모자랄 때의 자동 동작은 기록이 없습니다. 유료 러너·플랜 변경은 별도 승인 없이는 하지 않고, 비용을 이유로 검사를 우회하는 것도 금지합니다(AGENTS.md).",
        "What happens automatically when free minutes run short is not recorded. Paid runners and plan changes need separate approval, and skipping checks to save cost is forbidden (AGENTS.md).",
      ),
      kind: DEV_TOOL,
    },
    status: "live",
    link: { title: "GitHub Actions billing", url: "https://docs.github.com/en/billing/concepts/product-billing/github-actions" },
    evidence: [
      ".github/workflows/ci.yml",
      "docs/operations/ci-throughput-policy.md",
      "scripts/release-workflow-policy.mjs",
      "AGENTS.md",
      "config/free-infrastructure-policy.json",
    ],
    asOf: "2026-09-20",
  },
];
