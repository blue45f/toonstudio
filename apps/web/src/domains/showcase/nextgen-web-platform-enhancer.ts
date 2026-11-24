import { buildSpeculationRulesJson, STUDIO_PRERENDER_URLS } from "@/shared/lib/speculation-rules";

/**
 * 차세대 크롬 웹 플랫폼 API 점진적 향상 헬퍼:
 * - View Transitions API (`startSafeViewTransition`)
 * - Speculation Rules API (`installSpeculationRulesOnce`)
 * - 모션 감소 / 고대비 환경 감지 (`readMotionAndContrastPreferences`)
 *
 * 모든 함수는 SSR·jsdom·구형 브라우저에서도 예외 없이 안전하게 폴백한다.
 */

export interface ViewTransitionResult {
  readonly usedViewTransition: boolean;
  readonly reason: "view-transition" | "reduced-motion" | "unsupported" | "fallback-error";
}

export interface SpeculationRulesOptions {
  readonly urls?: readonly string[];
  readonly eagerness?: "conservative" | "moderate" | "eager";
  readonly doc?: Document;
  readonly scriptSupports?: (type: string) => boolean;
}

export interface SpeculationRulesInstallResult {
  readonly installed: boolean;
  readonly status: "installed" | "already-installed" | "unsupported" | "no-document";
  readonly urls: readonly string[];
}

export interface MotionContrastPreferences {
  readonly prefersReducedMotion: boolean;
  readonly prefersContrastMore: boolean;
  readonly forcedColors: boolean;
}

const SPECULATION_MARKER_ATTR = "data-toonstudio-speculation";
const SPECULATION_MARKER_VALUE = "showcase-prefetch";

export const DEFAULT_SHOWCASE_PREFETCH_URLS: readonly string[] = [
  "/compare/studio",
  "/tech",
  "/compare",
  "/studio/new",
  "/about/technology",
];

export function readMotionAndContrastPreferences(
  win: Pick<Window, "matchMedia"> | undefined = typeof window !== "undefined" ? window : undefined,
): MotionContrastPreferences {
  const matches = (query: string): boolean => {
    try {
      return Boolean(win?.matchMedia?.(query).matches);
    } catch {
      return false;
    }
  };
  return {
    prefersReducedMotion: matches("(prefers-reduced-motion: reduce)"),
    prefersContrastMore: matches("(prefers-contrast: more)"),
    forcedColors: matches("(forced-colors: active)"),
  };
}

interface ViewTransitionDocument {
  startViewTransition?: (callback: () => void) => { finished?: Promise<unknown> };
}

/**
 * View Transitions API가 지원되고 사용자가 모션 감소를 켜지 않았을 때만
 * 문서 뷰 전환을 감싸며, 미지원·예외·모션감소 시 즉시 동기 업데이트한다.
 */
export function startSafeViewTransition(
  update: () => void,
  options?: {
    readonly doc?: ViewTransitionDocument;
    readonly win?: Pick<Window, "matchMedia">;
  },
): ViewTransitionResult {
  const prefs = readMotionAndContrastPreferences(options?.win);
  if (prefs.prefersReducedMotion) {
    update();
    return { usedViewTransition: false, reason: "reduced-motion" };
  }

  const targetDoc =
    options?.doc
    ?? (typeof document !== "undefined" ? (document as unknown as ViewTransitionDocument) : undefined);

  if (!targetDoc || typeof targetDoc.startViewTransition !== "function") {
    update();
    return { usedViewTransition: false, reason: "unsupported" };
  }

  let invoked = false;
  const runOnce = () => {
    if (invoked) return;
    invoked = true;
    update();
  };

  try {
    const transition = targetDoc.startViewTransition(runOnce);
    if (transition?.finished && typeof transition.finished.catch === "function") {
      void transition.finished.catch(() => {
        // 전환 중 연타로 취소된 경우(AbortError)는 정상 흐름이므로 무시한다.
      });
    }
    return { usedViewTransition: true, reason: "view-transition" };
  } catch {
    runOnce();
    return { usedViewTransition: false, reason: "fallback-error" };
  }
}

/**
 * 크롬 Speculation Rules API를 지원할 때 안전 프리페치 규칙을 `<head>`에 1회만 주입한다.
 */
export function installSpeculationRulesOnce(
  options?: SpeculationRulesOptions,
): SpeculationRulesInstallResult {
  const urls = options?.urls ?? DEFAULT_SHOWCASE_PREFETCH_URLS;
  const eagerness = options?.eagerness ?? "moderate";
  const targetDoc = options?.doc ?? (typeof document !== "undefined" ? document : undefined);

  if (!targetDoc?.head) {
    return { installed: false, status: "no-document", urls };
  }

  const supportsSpeculation =
    options?.scriptSupports
    ?? ((type: string): boolean => {
      if (typeof HTMLScriptElement === "undefined") return false;
      const supportsFn = (HTMLScriptElement as unknown as { supports?: (candidate: string) => boolean }).supports;
      if (typeof supportsFn !== "function") return false;
      try {
        return supportsFn.call(HTMLScriptElement, type);
      } catch {
        return false;
      }
    });

  if (!supportsSpeculation("speculationrules")) {
    return { installed: false, status: "unsupported", urls };
  }

  const existing = targetDoc.head.querySelector(
    `script[${SPECULATION_MARKER_ATTR}="${SPECULATION_MARKER_VALUE}"], script[type="speculationrules"]`,
  );
  if (existing) {
    return { installed: true, status: "already-installed", urls };
  }

  const script = targetDoc.createElement("script");
  script.type = "speculationrules";
  script.setAttribute(SPECULATION_MARKER_ATTR, SPECULATION_MARKER_VALUE);
  // 운영 정적 CSP의 script-src 해시(STUDIO_PRERENDER_URLS)와 일치하는 정본 JSON을 사용해
  // 라이브 환경에서 인라인 Speculation Rules CSP 위반 콘솔 오류를 원천 차단한다.
  script.textContent = options?.urls
    ? JSON.stringify({
        prefetch: [
          {
            source: "list",
            urls: [...urls],
            eagerness,
          },
        ],
      })
    : buildSpeculationRulesJson(STUDIO_PRERENDER_URLS);
  targetDoc.head.appendChild(script);

  return { installed: true, status: "installed", urls };
}
