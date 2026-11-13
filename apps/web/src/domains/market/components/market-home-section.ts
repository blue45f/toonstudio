export const MARKET_HOME_SECTIONS = [
  { id: "buy", label: ["소재 찾기", "Find materials"], title: ["장면에 필요한 소재", "Materials for your scene"] },
  { id: "explore", label: ["소재 둘러보기", "Explore materials"], title: ["작업에 맞는 소재를 골라요", "Choose materials for your work"] },
  { id: "sell", label: ["소재 공유", "Share materials"], title: ["내가 만든 소재를 나눠요", "Share materials you made"] },
  { id: "guide", label: ["이용 안내", "Usage guide"], title: ["소재를 사용하기 전에", "Before using a material"] },
] as const;

export type MarketHomeSection = (typeof MARKET_HOME_SECTIONS)[number]["id"];

/** 기존의 마켓 주소를 유지하며 목적 화면만 URL로 선택한다. */
export function marketHomeSectionFromSearch(search: string): MarketHomeSection {
  const requested = new URLSearchParams(search).get("section");
  return requested === "explore" || requested === "sell" || requested === "guide"
    ? requested
    : "buy";
}
