import { getNextgenLabSettingsSnapshot } from "@/shared/lib/nextgen-lab-settings";
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
  /** DOM 주입·재사용 여부이며 브라우저의 선행 요청 실행을 보증하지 않는다. */
  readonly installed: boolean;
  readonly status: "installed" | "already-installed" | "disabled" | "unsupported" | "no-document";
  /** 이 호출이 주입·재사용한 list 규칙의 URL. 미주입·해석 불가이면 비어 있다. */
  readonly urls: readonly string[];
}

export interface MotionContrastPreferences {
  readonly prefersReducedMotion: boolean;
  readonly prefersContrastMore: boolean;
  readonly forcedColors: boolean;
}

const SPECULATION_MARKER_ATTR = "data-toonstudio-speculation";
const SPECULATION_MARKER_VALUE = "showcase-prefetch";

/** @deprecated 호환용 prefetch 목록. 기본 동작은 정본 STUDIO_PRERENDER_URLS를 사용한다. */
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

function readExistingSpeculationUrls(script: Element): readonly string[] {
  try {
    const parsed: unknown = JSON.parse(script.textContent ?? "");
    if (typeof parsed !== "object" || parsed === null) return [];
    const rules = parsed as Record<string, unknown>;
    const urls = new Set<string>();
    for (const mode of ["prefetch", "prerender"]) {
      const entries: unknown = rules[mode];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (typeof entry !== "object" || entry === null) continue;
        const targets: unknown = (entry as Record<string, unknown>).urls;
        if (!Array.isArray(targets)) continue;
        for (const url of targets) if (typeof url === "string") urls.add(url);
      }
    }
    return [...urls];
  } catch {
    return [];
  }
}

/**
 * 기본 동작은 사용자 설정을 따르는 정본 /studio prerender이며 명시한 urls는 기존 prefetch를 유지한다.
 */
export function installSpeculationRulesOnce(
  options?: SpeculationRulesOptions,
): SpeculationRulesInstallResult {
  const urls = options?.urls ?? STUDIO_PRERENDER_URLS;
  const eagerness = options?.eagerness ?? "moderate";
  const targetDoc = options?.doc ?? (typeof document !== "undefined" ? document : undefined);

  if (!targetDoc?.head) {
    return { installed: false, status: "no-document", urls: [] };
  }

  if (!options?.urls && !getNextgenLabSettingsSnapshot().studioPrerender) {
    return { installed: false, status: "disabled", urls: [] };
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
    return { installed: false, status: "unsupported", urls: [] };
  }

  const existing = targetDoc.head.querySelector(
    `script[${SPECULATION_MARKER_ATTR}="${SPECULATION_MARKER_VALUE}"], script[type="speculationrules"]`,
  );
  if (existing) {
    return { installed: true, status: "already-installed", urls: readExistingSpeculationUrls(existing) };
  }

  const script = targetDoc.createElement("script");
  script.type = "speculationrules";
  script.setAttribute(SPECULATION_MARKER_ATTR, SPECULATION_MARKER_VALUE);
  // 운영 정적 CSP의 script-src 해시(STUDIO_PRERENDER_URLS)와 일치하는 정본 JSON을 사용해
  // 라이브 환경에서 인라인 Speculation Rules CSP 위반 콘솔 오류를 방지한다.
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
