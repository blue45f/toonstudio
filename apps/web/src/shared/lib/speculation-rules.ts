// Speculation Rules — 문서 이동(document navigation) 대상을 미리 렌더링한다.
//
// 툰스튜디오는 공개 페이지와 스튜디오가 COOP/COEP 경계 때문에 문서 이동으로 오간다
// (app/studio-document-navigation). SPA 내부 이동에는 효과가 없고, 이 경계를 넘는
// 이동에서만 체감 이득이 있다 — 그래서 대상은 스튜디오 진입 같은 문서 이동 목적지로
// 좁게 유지한다. eagerness "moderate"(포인터를 올린 동안)라 가만히 있는 페이지에서
// 무거운 문서를 미리 띄우는 낭비도 없다.
// 지원: Chromium 계열 전용 (Chrome 109+ prefetch, 문서 규칙·prerender는 121+).
// Firefox·Safari는 스크립트 태그 자체를 무시한다 — 폴백이 필요 없는 점진적 강화다.

export interface SpeculationRules {
  readonly prerender: readonly {
    readonly source: "list";
    readonly urls: readonly string[];
    readonly eagerness: "moderate";
  }[];
}

/** 같은 오리진 절대 경로만 허용한다 — 외부 URL이나 프로토콜 상대 경로는 버린다. */
function sanitizeUrls(urls: readonly string[]): string[] {
  const seen = new Set<string>();
  for (const url of urls) {
    if (typeof url !== "string") continue;
    if (!url.startsWith("/") || url.startsWith("//")) continue;
    seen.add(url);
  }
  return [...seen];
}

/** 공개 페이지가 미리 준비하는 문서 이동 대상. 바꾸면 CSP 의 규칙 해시도 바뀐다(cloudflare-static-rules.mjs). */
export const STUDIO_PRERENDER_URLS = ["/studio"] as const;

export function buildSpeculationRules(urls: readonly string[]): SpeculationRules {
  return {
    prerender: [
      { source: "list", urls: sanitizeUrls(urls), eagerness: "moderate" },
    ],
  };
}

export function buildSpeculationRulesJson(urls: readonly string[]): string {
  return JSON.stringify(buildSpeculationRules(urls));
}

export function isSpeculationRulesSupported(): boolean {
  try {
    if (typeof HTMLScriptElement === "undefined") return false;
    const supports = (HTMLScriptElement as unknown as Record<string, unknown>)["supports"];
    return typeof supports === "function"
      && (supports as (type: string) => boolean).call(HTMLScriptElement, "speculationrules");
  } catch {
    // 감지 실패는 미지원과 동일하게 취급한다.
    return false;
  }
}

/**
 * 프리렌더된 문서는 사용자가 실제로 이동해 활성화될 때까지 task 를 미룬다. 프리렌더가 아니면 곧바로(동기로)
 * 실행하고, 활성화 없이 버려진 프리렌더에서는 끝내 실행하지 않는다.
 *
 * 스튜디오 문서는 그리는 순간 페이지뷰 전송, 로컬 SQLite 소유 잠금, 라이브러리 동기화가 시작된다. 숨은 문서가
 * 그 잠금을 쥐면 이미 열린 편집기 탭이 세션 전용 저장으로 떨어지므로, 앱 부팅 전체를 이 경계 뒤에 둔다.
 */
export function runWhenDocumentActivated(task: () => void, doc: Document = document): void {
  if ((doc as Document & { readonly prerendering?: boolean }).prerendering !== true) {
    task();
    return;
  }
  doc.addEventListener("prerenderingchange", () => task(), { once: true });
}

let installed = false;

/**
 * 규칙 스크립트를 문서 head에 한 번만 주입한다.
 * 이미 규칙이 있거나, 미지원이거나, 대상 URL이 비면 아무 일도 하지 않고 false를 돌려준다.
 */
export function installSpeculationRules(options: {
  readonly urls: readonly string[];
  readonly isEnabled: () => boolean;
}): boolean {
  if (installed) return false;
  try {
    if (typeof document === "undefined" || !document.head) return false;
    if (!options.isEnabled()) return false;
    if (!isSpeculationRulesSupported()) return false;
    const urls = sanitizeUrls(options.urls);
    if (urls.length === 0) return false;
    if (document.querySelector('script[type="speculationrules"]')) return false;
    const script = document.createElement("script");
    script.type = "speculationrules";
    script.textContent = buildSpeculationRulesJson(urls);
    document.head.appendChild(script);
    installed = true;
    return true;
  } catch {
    // 주입 실패(CSP 등)는 조용한 부재로 처리한다 — 원래 이동 경로가 그대로 동작한다.
    return false;
  }
}
