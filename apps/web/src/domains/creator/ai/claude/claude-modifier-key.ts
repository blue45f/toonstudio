/** 이 기기의 주 단축키 수식어. 맥·iOS는 ⌘, 그 밖에는 Ctrl. */
export function primaryModifierLabel(): "⌘" | "Ctrl" {
  if (typeof navigator === "undefined") return "Ctrl";
  const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
  return /mac|iphone|ipad|ipod/iu.test(platform) ? "⌘" : "Ctrl";
}
