export const IR_BRIEF_SECTIONS = [
  { id: "problem", group: "product", ko: "창작자의 문제", en: "Creator problems" },
  { id: "landscape", group: "product", ko: "경쟁 지형", en: "Landscape" },
  { id: "flow", group: "product", ko: "제작 흐름", en: "Production flow" },
  { id: "difference", group: "product", ko: "차별화", en: "Differentiation" },
  { id: "product", group: "product", ko: "제품 역량", en: "Product capabilities" },
  { id: "market", group: "business", ko: "시장", en: "Market" },
  { id: "model", group: "business", ko: "사업 모델·검증", en: "Model and validation" },
  { id: "founder", group: "team", ko: "팀·협력 제안", en: "Team and collaboration" },
  { id: "downloads", group: "team", ko: "발표 자료·질문", en: "Deck and questions" },
] as const;
export const IR_BRIEF_GROUPS = [
  { id: "product", start: "problem", ko: "제품과 문제", en: "Product and problem", detailKo: "제작 흐름 · 차별화 · 실제 제품", detailEn: "Workflow, differentiation and the product" },
  { id: "business", start: "market", ko: "사업과 검증", en: "Business and validation", detailKo: "시장 · 사업 모델 · 검증 계획", detailEn: "Market, model and validation plan" },
  { id: "team", start: "founder", ko: "팀과 자료", en: "Team and materials", detailKo: "예비 창업 도전자 · 협력 제안 · 발표 자료", detailEn: "Aspiring founder, collaboration and the deck" },
] as const;

export function resolveIrBriefSection(search: string, hash: string): string {
  const requested = new URLSearchParams(search).get("brief");
  if (IR_BRIEF_SECTIONS.some(section => section.id === requested)) return requested!;
  return IR_BRIEF_SECTIONS.find(section => hash === `#ir-${section.id}-title`)?.id ?? "overview";
}

