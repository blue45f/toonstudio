import { FIXTURE_LAYERS } from "./engineering-diagram.fixtures";
import type { EngineeringMap } from "./engineering-map-types";

/** 지도 화면·검증 테스트용 예시 지도. 실제 콘텐츠가 아니라 계약을 보여준다. */
export const FIXTURE_MAP_FREE_TIER: EngineeringMap = {
  id: "free-tier",
  title: { ko: "무료로 세운 서비스 (예시)", en: "Services built on free tiers (fixture)" },
  intro: {
    ko: "서버 비용을 거의 쓰지 않고 서비스를 세우기 위해 무료 요금제를 어떻게 골랐는지 한 표로 봅니다.",
    en: "A single table of how free plans were chosen so the service runs at almost no server cost.",
  },
  takeaway: {
    ko: "무료 한도는 공급자가 바꿀 수 있으므로 날짜와 함께 읽고, 한도를 넘기 전에 멈추도록 만들었습니다.",
    en: "Free limits can change, so read them with their date; the service stops before the limit is crossed.",
  },
  columns: [
    { id: "role", label: { ko: "맡은 일", en: "Role" } },
    { id: "limit", label: { ko: "기록된 무료 한도", en: "Recorded free limit" } },
    { id: "plan", label: { ko: "요금제", en: "Plan" }, narrow: true },
  ],
  rows: [
    {
      id: "cloudflare-workers",
      name: "Cloudflare Workers",
      cells: {
        role: { ko: "정적 화면과 엣지 함수를 전 세계에 전달합니다.", en: "Serves static pages and edge functions worldwide." },
        limit: { ko: "—", en: "—" },
        plan: { ko: "무료", en: "Free" },
      },
      status: "live",
      link: { title: "Cloudflare Workers pricing", url: "https://developers.cloudflare.com/workers/platform/pricing/" },
      evidence: ["apps/web/src/domains/creator/studio-opfs-filesystem.ts"],
      atlasIds: ["fixture-opfs"],
      asOf: "2026-10-07",
    },
    {
      id: "quota-ledger",
      name: "Quota ledger",
      cells: {
        role: { ko: "무료 AI 호출 전에 예산을 확인합니다.", en: "Checks the budget before a free AI call." },
        limit: { ko: "—", en: "—" },
        plan: { ko: "자체 구현", en: "In-house" },
      },
      status: "configured",
      evidence: ["apps/web/src/shared/ai/free-ai-runtime-budget.ts"],
      asOf: "2026-10-07",
    },
  ],
  diagram: { ...FIXTURE_LAYERS, id: "fixture-map-free-tier-diagram" },
  notes: [
    { ko: "한도 수치는 저장소에 기록된 값만 쓰고 확인한 날짜를 함께 적습니다.", en: "Limits use only values recorded in the repository, with the date they were checked." },
  ],
  reviewedAt: "2026-10-07",
};
