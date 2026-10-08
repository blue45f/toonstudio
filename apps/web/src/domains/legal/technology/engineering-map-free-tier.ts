import {
  FREE_TIER_AI_ROWS,
  FREE_TIER_DEVICE_AND_TOOL_ROWS,
  FREE_TIER_INFRA_ROWS,
} from "./engineering-map-free-tier-rows";
import type { EngineeringMap } from "./engineering-map-types";
import type { LocalizedText } from "./engineering-story-content";

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/**
 * 기술 지도 · free-tier — 무료 토큰·무료 인프라로 서비스를 세운 방법.
 * 계약과 작성 규칙은 engineering-map-types.ts 를 따르고, 행은 engineering-map-free-tier-rows.ts 에 있다.
 * 한도 수치는 저장소 문서·코드·JSON에 기록된 값만 쓴다. 운영 대시보드의 실제 요금제·사용량은 확인하지 않았다.
 */
export const ENGINEERING_MAP_FREE_TIER: EngineeringMap | null = {
  id: "free-tier",
  title: t("무료로 세운 서비스", "Services built on free tiers"),
  intro: t(
    "ToonStudio는 서버비를 거의 쓰지 않는 것을 목표로 무료 요금제 위에 세웠습니다. 어떤 무료 서비스와 무료 AI 토큰을 어디에 썼는지, 한도에 닿으면 서비스가 어떻게 행동하는지를 저장소에 기록된 것만으로 정리했습니다.",
    "ToonStudio was built on free plans with the aim of almost no server bill. This table shows which free services and free AI tokens are used where, and how the service behaves when a limit is reached, using only what the repository records.",
  ),
  takeaway: t(
    "무료는 공짜가 아니라 한도가 있는 조건입니다. 한도와 경계를 숨기지 않고, 호출 전에 확인해 닿기 전에 멈추는 것을 원칙으로 설계했습니다.",
    "Free is not 'no cost'; it comes with limits. We do not hide the limits or boundaries, and the design principle is to check before a call and stop before the limit is reached.",
  ),
  columns: [
    { id: "use", label: t("어디에 쓰이나 · 쉬운 설명", "Where it is used · plain explanation") },
    { id: "limit", label: t("저장소에 기록된 무료 한도·가격", "Free limit or price recorded in the repo") },
    { id: "on-exceed", label: t("한도·장애 시 서비스 동작", "What happens at the limit or on failure") },
    { id: "kind", label: t("구분", "Type"), narrow: true },
  ],
  rows: [...FREE_TIER_INFRA_ROWS, ...FREE_TIER_AI_ROWS, ...FREE_TIER_DEVICE_AND_TOOL_ROWS],
  diagram: {
    id: "free-tier-flow-diagram",
    kind: "graph",
    title: t("무료 자원이 놓인 자리", "Where the free tiers sit"),
    caption: t(
      "화면은 Cloudflare, 기록은 Supabase, 계산은 사용자 기기가 맡고, AI 호출은 허용 목록·승인·예산 원장을 거쳐야 나갑니다.",
      "Cloudflare serves the screens, Supabase keeps the records and the user's device does the computing; an AI call goes out only after the allowlist, approval and budget ledger.",
    ),
    alt: t(
      "사용자 브라우저가 Cloudflare 엣지로 요청을 보내면, 화면과 큰 파일은 엣지가 직접 내려주고 동적 요청만 Render 무료 코어로 전달됩니다. 코어는 Supabase에 기록하고 Upstash로 요청 횟수를 제한합니다. AI 호출은 허용 목록, 승인 단계, 예산 원장을 차례로 통과한 뒤에만 무료 AI 공급자에게 나갑니다.",
      "When the user's browser sends a request to the Cloudflare edge, the edge itself serves the pages and big files and forwards only dynamic requests to the free Render core. The core records data in Supabase and limits request rates with Upstash. An AI call reaches a free AI provider only after passing the allowlist, the approval step and the budget ledger in turn.",
    ),
    nodes: [
      { id: "browser", label: t("사용자 브라우저", "User's browser"), sub: t("기기 안 추론 · 토큰 0", "On-device · 0 tokens"), tone: "local", shape: "pill", at: [1, 0] },
      { id: "edge", label: t("Cloudflare 엣지", "Cloudflare edge"), sub: t("정적 화면·Worker 무료", "Static pages · Worker (free)"), tone: "edge", at: [1, 1] },
      { id: "files", label: t("R2 · B2 파일", "R2 · B2 files"), sub: t("큰 파일 · B2 백업 후보", "Big files · B2 backup candidate"), tone: "edge", shape: "cylinder", at: [2, 1] },
      { id: "upstash", label: t("Upstash Redis", "Upstash Redis"), sub: t("제한·멱등 영수증", "Rate limits · receipts"), tone: "external", shape: "cylinder", at: [0, 2] },
      { id: "core", label: t("Render 무료 코어", "Render free core"), sub: t("15분 무요청 후 절전", "Sleeps after 15 min idle"), tone: "server", at: [1, 2] },
      { id: "db", label: t("Supabase", "Supabase"), sub: t("PostgreSQL · 원장 DB", "PostgreSQL · ledger DB"), tone: "server", shape: "cylinder", at: [2, 2] },
      { id: "allow", label: t("허용 목록", "Allowlist"), sub: t("공식 주소 · 무료 모델만", "Official hosts · free models only"), tone: "ai", at: [1, 3] },
      { id: "gate", label: t("승인 단계", "Approval"), sub: t("유료는 옵트인", "Paid: opt-in"), tone: "warn", shape: "diamond", at: [2, 3] },
      { id: "ledger", label: t("예산 원장", "Budget ledger"), sub: t("호출 전에 예약", "Reserve before the call"), tone: "server", at: [3, 3] },
      { id: "providers", label: t("무료 AI 공급자", "Free AI APIs"), sub: t("Gemini · Groq 등", "Gemini · Groq and more"), tone: "external", shape: "cloud", at: [4, 3] },
    ],
    edges: [
      { from: "browser", to: "edge", label: t("화면·API 요청", "Pages · API") },
      { from: "edge", to: "core", label: t("동적 요청만", "Dynamic only") },
      { from: "edge", to: "files", label: t("큰 파일", "Files") },
      { from: "core", to: "db", label: t("원장", "Ledger") },
      { from: "core", to: "upstash", label: t("제한", "Limits") },
      { from: "core", to: "allow", label: t("서버 공유 풀", "Shared pool") },
      { from: "allow", to: "gate", label: t("통과", "Pass") },
      { from: "gate", to: "ledger", label: t("승인", "OK") },
      { from: "ledger", to: "providers", label: t("호출", "Call") },
    ],
  },
  notes: [
    t(
      "무료 한도와 요금제는 공급자가 바꿀 수 있습니다. 이 표의 수치는 저장소 문서·코드·JSON에 적힌 값만 옮겼고, 행마다 그 값을 기록한 날짜(asOf)를 붙였습니다. 날짜가 없는 코드 상수는 이 저장소를 확인한 2026-10-07로 적었습니다.",
      "Free limits and plans can be changed by the provider. Figures in this table are copied only from values written in repository docs, code and JSON, and each row carries the date those values were recorded (asOf). Code constants without a date use 2026-10-07, the day this repository was checked.",
    ),
    t(
      "'무료 우선'은 공짜라는 뜻이 아니라 비용이 생기는 지점을 숨기지 않는다는 뜻입니다. 호출 전에 예산을 확인하고, 한도에 닿으면 품질을 몰래 낮추거나 유료로 바꾸지 않고 눈에 보이는 실패로 알립니다. '우리가 건 상한'은 공급자 한도와 다른 값입니다.",
      "'Free-first' does not mean costless; it means the points where cost can arise are not hidden. The budget is checked before a call, and at a limit the service shows a visible failure instead of quietly lowering quality or switching to a paid plan. 'Our cap' is a different number from the provider's limit.",
    ),
    t(
      "이 표는 코드·설정·문서로 확인한 구성입니다. Cloudflare·Render·Supabase 등 운영 대시보드의 실제 요금제와 사용량은 확인하지 않았습니다. 정책 JSON에 이름이 있어도(예: KV·Queues·Images) 배포 설정에 연결이 없으면 쓴다고 적지 않았습니다.",
      "This table reflects what was confirmed from code, settings and documents. The real plans and usage on production dashboards such as Cloudflare, Render and Supabase were not checked. A name in the policy JSON (for example KV, Queues or Images) is not listed as used when no deployment setting connects it.",
    ),
    t(
      "무료 계층은 한도뿐 아니라 약관과 정책도 바뀔 수 있습니다. 그래서 정적 화면·카탈로그·로컬 편집은 서버 없이도 열리게 하고, 데이터마다 쓰기 권위를 하나로 두며, 옛 DB를 보존하고, 자동 유료 전환과 자동 failover는 일부러 만들지 않았습니다. 이는 코드와 문서로 확인한 범위입니다.",
      "Free tiers can change their terms and policies, not only their limits. So the static app, the catalog and local editing open without a server, each kind of data keeps one write authority, the old database is preserved, and automatic paid upgrades and automatic failover are deliberately absent. This covers only what code and docs confirm.",
    ),
  ],
  reviewedAt: "2026-10-07",
};
