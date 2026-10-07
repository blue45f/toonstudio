// 법무·신뢰 문서군의 단일 목록 — 관련 문서 이동(LegalRelatedDocs)이 이 목록에서만 파생한다.
// 이름·설명은 각 문서 페이지의 실제 제목과 본문에서 확인한 것만 적는다 (없는 신뢰 정보를 만들지 않는다).
export interface LegalDocumentEntry {
  readonly id: "terms" | "privacy" | "copyright" | "crawler" | "accessibility" | "data";
  readonly href: string;
  readonly name: { readonly ko: string; readonly en: string };
  readonly summary: { readonly ko: string; readonly en: string };
}

export const LEGAL_DOCUMENTS: readonly LegalDocumentEntry[] = [
  {
    id: "terms",
    href: "/terms",
    name: { ko: "이용약관", en: "Terms of Service" },
    summary: {
      ko: "서비스 이용의 권리와 의무, 창작물의 권리가 누구에게 남는지를 정합니다.",
      en: "The rights and duties of using the service, and who keeps the rights to creations.",
    },
  },
  {
    id: "privacy",
    href: "/privacy",
    name: { ko: "개인정보처리방침", en: "Privacy Policy" },
    summary: {
      ko: "어떤 정보를 왜 처리하는지, 열람·정정·삭제를 요청하는 방법을 안내합니다.",
      en: "What information is processed and why, and how to request access, correction or deletion.",
    },
  },
  {
    id: "copyright",
    href: "/copyright",
    name: { ko: "저작권·콘텐츠 안내", en: "Copyright & Content Notice" },
    summary: {
      ko: "작품 메타데이터와 표지의 권리·출처 표시, 삭제 요청 방법을 설명합니다.",
      en: "Rights and attribution for work metadata and covers, and how to request removal.",
    },
  },
  {
    id: "crawler",
    href: "/about/crawler",
    name: { ko: "크롤러 정책", en: "Crawler Policy" },
    summary: {
      ko: "공개 데이터를 수집하는 방식과 수집하거나 우회하지 않는 정보를 밝힙니다.",
      en: "How public data is collected, and what is never collected or bypassed for.",
    },
  },
  {
    id: "accessibility",
    href: "/accessibility",
    name: { ko: "접근성", en: "Accessibility" },
    summary: {
      ko: "키보드·터치·확대·모션 감소까지, 누구나 핵심 작업을 끝낼 수 있게 하는 기준입니다.",
      en: "The baseline that keeps core tasks finishable for everyone — keyboard, touch, zoom and reduced motion.",
    },
  },
  {
    id: "data",
    href: "/about/data",
    name: { ko: "데이터 출처", en: "Data Sources" },
    summary: {
      ko: "자료 제공처와 수집·권리 판정 방식을 그대로 공개합니다.",
      en: "Data providers and how collection and rights decisions are made, published as-is.",
    },
  },
];
