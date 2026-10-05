// 차세대·실험 웹 API 능력 감지 레지스트리.
//
// 툰스튜디오의 실험 기능(설정의 "실험 기능" 섹션)이 공통으로 쓰는 단일 감지 지점이다.
// 원칙: 감지는 절대 던지지 않는다 — API가 없거나 접근이 막히면 그냥 "미지원"이다.
// 감지 결과는 "이 환경에서 켜도 되는가"만 알려 줄 뿐, 폴백 구현을 강제하지 않는다
// (실험 기능은 미지원 환경에서 조용히 없는 것이 허용된다는 운용 방침).

export const NEXTGEN_CAPABILITY_IDS = [
  "compute-pressure",
  "idle-detection",
  "screen-wake-lock",
  "eye-dropper",
  "view-transitions",
  "speculation-rules",
  "scroll-driven-animations",
  "webnn",
  "webxr",
  "temporal",
  "window-management",
  "web-midi",
  "built-in-ai",
  "navigation-api",
  "long-animation-frames",
  "move-before",
  "file-system-observer",
  "webmcp",
  "document-pip",
  "storage-buckets",
  "digital-credentials",
  "popover-api",
  "anchor-positioning",
  "field-sizing",
  "scroll-state-queries",
  "handwriting-recognition",
  "virtual-keyboard",
] as const;

export type NextgenCapabilityId = (typeof NEXTGEN_CAPABILITY_IDS)[number];

export type NextgenCapabilityMap = Readonly<Record<NextgenCapabilityId, boolean>>;

type GlobalLike = Record<string, unknown>;

function globalLike(): GlobalLike {
  return globalThis as unknown as GlobalLike;
}

function navigatorLike(): GlobalLike | null {
  try {
    if (typeof navigator === "undefined") return null;
    return navigator as unknown as GlobalLike;
  } catch {
    return null;
  }
}

function documentLike(): GlobalLike | null {
  try {
    if (typeof document === "undefined") return null;
    return document as unknown as GlobalLike;
  } catch {
    return null;
  }
}

function hasConstructor(name: string): boolean {
  try {
    return typeof globalLike()[name] === "function";
  } catch {
    return false;
  }
}

function navigatorHas(key: string): boolean {
  const nav = navigatorLike();
  if (!nav) return false;
  try {
    return key in nav && nav[key] != null;
  } catch {
    return false;
  }
}

function cssSupports(declaration: string): boolean {
  try {
    if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
    return CSS.supports(declaration);
  } catch {
    return false;
  }
}

function globalHas(key: string): boolean {
  try {
    return typeof globalLike()[key] !== "undefined";
  } catch {
    return false;
  }
}

const DETECTORS: Readonly<Record<NextgenCapabilityId, () => boolean>> = {
  // Compute Pressure — Chrome/Edge 125+ 데스크톱. Firefox·Safari 미지원.
  "compute-pressure": () => hasConstructor("PressureObserver"),
  // Idle Detection — Chrome 94+, 권한 필요. Firefox·Safari 미지원.
  "idle-detection": () => hasConstructor("IdleDetector"),
  "screen-wake-lock": () => {
    const nav = navigatorLike();
    if (!nav) return false;
    const wakeLock = nav["wakeLock"] as GlobalLike | undefined;
    return Boolean(wakeLock) && typeof wakeLock?.["request"] === "function";
  },
  "eye-dropper": () => hasConstructor("EyeDropper"),
  "view-transitions": () => {
    const doc = documentLike();
    return Boolean(doc) && typeof doc?.["startViewTransition"] === "function";
  },
  "speculation-rules": () => {
    try {
      if (typeof HTMLScriptElement === "undefined") return false;
      const supports = (HTMLScriptElement as unknown as GlobalLike)["supports"];
      return typeof supports === "function"
        && (supports as (type: string) => boolean).call(HTMLScriptElement, "speculationrules");
    } catch {
      return false;
    }
  },
  "scroll-driven-animations": () => cssSupports("animation-timeline: scroll()"),
  // WebNN — W3C CR 단계, Chromium 계열에서만 플래그/오리진 트라이얼로 노출된다.
  "webnn": () => navigatorHas("ml"),
  "webxr": () => navigatorHas("xr"),
  // Temporal — ES2026(Stage 4). Chrome/Edge 144·Firefox 139 출시, Safari 미출시.
  "temporal": () => globalHas("Temporal"),
  // Window Management — Window.getScreenDetails, Chrome 100+.
  "window-management": () => {
    try {
      return typeof globalLike()["getScreenDetails"] === "function";
    } catch {
      return false;
    }
  },
  "web-midi": () => {
    const nav = navigatorLike();
    return Boolean(nav) && typeof nav?.["requestMIDIAccess"] === "function";
  },
  // Chrome 내장 AI — Prompt API(LanguageModel)는 Chrome 148부터 오픈 웹 정식.
  "built-in-ai": () => {
    if (globalHas("LanguageModel")) return true;
    try {
      const legacy = globalLike()["ai"] as GlobalLike | undefined;
      return Boolean(legacy) && typeof legacy?.["languageModel"] !== "undefined";
    } catch {
      return false;
    }
  },
  "navigation-api": () => globalHas("navigation"),
  "long-animation-frames": () => {
    try {
      if (typeof PerformanceObserver === "undefined") return false;
      const types = (PerformanceObserver as unknown as GlobalLike)["supportedEntryTypes"];
      return Array.isArray(types) && types.includes("long-animation-frame");
    } catch {
      return false;
    }
  },
  "move-before": () => {
    try {
      return typeof Element !== "undefined" && "moveBefore" in Element.prototype;
    } catch {
      return false;
    }
  },
  "file-system-observer": () => hasConstructor("FileSystemObserver"),
  // WebMCP — 현행 초안의 진입점은 document.modelContext (navigator.modelContext는 구 별칭).
  "webmcp": () => {
    const doc = documentLike();
    if (doc && doc["modelContext"] != null) return true;
    return navigatorHas("modelContext");
  },
  "document-pip": () => globalHas("documentPictureInPicture"),
  "storage-buckets": () => navigatorHas("storageBuckets"),
  // Digital Credentials — Chrome 141·Safari 26 출시, W3C 작업 초안.
  "digital-credentials": () => globalHas("DigitalCredential"),
  "popover-api": () => {
    try {
      return typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype;
    } catch {
      return false;
    }
  },
  "anchor-positioning": () => cssSupports("anchor-name: --nextgen-probe"),
  "field-sizing": () => cssSupports("field-sizing: content"),
  "scroll-state-queries": () => cssSupports("container-type: scroll-state"),
  // Handwriting Recognition — Chrome 99~ ChromeOS 한정으로만 노출됐던 진입점.
  // 데스크톱·모바일 Chrome과 타 브라우저에는 존재하지 않으므로 보통 미지원이다.
  "handwriting-recognition": () => {
    const nav = navigatorLike();
    return Boolean(nav) && typeof nav?.["createHandwritingRecognizer"] === "function";
  },
  // VirtualKeyboard — Chrome 94+ (ChromeOS·Android 중심). overlaysContent opt-in형.
  "virtual-keyboard": () => navigatorHas("virtualKeyboard"),
};

/** 현재 환경의 차세대 API 지원 여부를 전부 감지한다. 어떤 경우에도 던지지 않는다. */
export function detectNextgenCapabilities(): NextgenCapabilityMap {
  const result = {} as Record<NextgenCapabilityId, boolean>;
  for (const id of NEXTGEN_CAPABILITY_IDS) {
    result[id] = isNextgenCapabilitySupported(id);
  }
  return result;
}

export function isNextgenCapabilitySupported(id: NextgenCapabilityId): boolean {
  try {
    return DETECTORS[id]();
  } catch {
    return false;
  }
}
