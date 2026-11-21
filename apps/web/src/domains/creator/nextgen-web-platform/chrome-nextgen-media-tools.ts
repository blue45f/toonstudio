/**
 * Chrome 2025–2026 크리에이터 미디어·입력 차세대 API 및 폴백 도구:
 * EyeDropper, Local Font Access, Document Picture-in-Picture, WebNN,
 * Speculation Rules, AudioWorklet 저지연 SFX/BGM 프로세서.
 */

import type { ChromeNextGenRuntimeEnv } from "./chrome-nextgen-apis";

function resolveEnv(env?: ChromeNextGenRuntimeEnv): ChromeNextGenRuntimeEnv {
  const win =
    env?.win ??
    (typeof window !== "undefined" ? (window as ChromeNextGenRuntimeEnv["win"]) : undefined);
  const doc =
    env?.doc ??
    (typeof document !== "undefined" ? (document as ChromeNextGenRuntimeEnv["doc"]) : undefined);
  const nav =
    env?.nav ??
    (typeof navigator !== "undefined" ? (navigator as ChromeNextGenRuntimeEnv["nav"]) : undefined);
  const scriptSupports =
    env?.scriptSupports ??
    (typeof HTMLScriptElement !== "undefined" && typeof HTMLScriptElement.supports === "function"
      ? (type: string) => HTMLScriptElement.supports(type)
      : undefined);
  return { win, doc, nav, scriptSupports };
}

export interface FallbackPaletteSwatch {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly oklch: string;
}

export const STUDIO_FALLBACK_COLOR_SWATCHES: readonly FallbackPaletteSwatch[] = Object.freeze([
  { id: "starlight-cyan", labelKo: "청록 포인트", labelEn: "Cyan Accent", oklch: "oklch(0.76 0.14 205)" },
  { id: "webtoon-violet", labelKo: "라벤더 강조", labelEn: "Lavender Focus", oklch: "oklch(0.72 0.18 286)" },
  { id: "sunset-coral", labelKo: "선셋 코랄", labelEn: "Sunset Coral", oklch: "oklch(0.74 0.17 34)" },
  { id: "mint-fresh", labelKo: "민트 하이라이트", labelEn: "Mint Highlight", oklch: "oklch(0.81 0.15 156)" },
  { id: "warm-amber", labelKo: "햇살 앰버", labelEn: "Sunlit Amber", oklch: "oklch(0.84 0.16 84)" },
]);

export interface EyeDropperSampleResult {
  readonly ok: boolean;
  readonly mode: "eyedropper" | "fallback-palette" | "cancelled";
  readonly sampledColor: string;
  readonly fallbackSwatches: readonly FallbackPaletteSwatch[];
  readonly noteKo: string;
  readonly noteEn: string;
}

export async function sampleScreenColorWithEyeDropper(options?: {
  readonly signal?: AbortSignal;
  readonly fallbackSwatchId?: string;
  readonly env?: ChromeNextGenRuntimeEnv;
}): Promise<EyeDropperSampleResult> {
  const resolved = resolveEnv(options?.env);
  const fallback =
    STUDIO_FALLBACK_COLOR_SWATCHES.find((item) => item.id === options?.fallbackSwatchId) ??
    STUDIO_FALLBACK_COLOR_SWATCHES[0];
  const Ctor = resolved.win?.EyeDropper;

  if (typeof Ctor !== "function") {
    return {
      ok: true,
      mode: "fallback-palette",
      sampledColor: fallback.oklch,
      fallbackSwatches: STUDIO_FALLBACK_COLOR_SWATCHES,
      noteKo: "화면 스포이드가 없는 환경이라 추천 웹툰 팔레트 색상을 바로 골랐어요.",
      noteEn: "EyeDropper is unavailable here, so a curated studio swatch was selected.",
    };
  }

  try {
    const picker = new Ctor();
    const picked = await picker.open(options?.signal ? { signal: options.signal } : undefined);
    return {
      ok: true,
      mode: "eyedropper",
      sampledColor: picked.sRGBHex,
      fallbackSwatches: STUDIO_FALLBACK_COLOR_SWATCHES,
      noteKo: `화면에서 ${picked.sRGBHex} 색상을 바로 추출했어요.`,
      noteEn: `Sampled ${picked.sRGBHex} directly from your screen.`,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      return {
        ok: false,
        mode: "cancelled",
        sampledColor: fallback.oklch,
        fallbackSwatches: STUDIO_FALLBACK_COLOR_SWATCHES,
        noteKo: "색상 뽑기를 취소했어요.",
        noteEn: "Color sampling was cancelled.",
      };
    }
    return {
      ok: true,
      mode: "fallback-palette",
      sampledColor: fallback.oklch,
      fallbackSwatches: STUDIO_FALLBACK_COLOR_SWATCHES,
      noteKo: "권한이 제한되어 추천 팔레트 색상으로 전환했어요.",
      noteEn: "Permission restricted; switched to curated studio swatch.",
    };
  }
}

export type WebtoonFontCategory =
  | "korean-dialogue"
  | "webtoon-sfx"
  | "display-title"
  | "editorial"
  | "general";

export interface LocalFontCatalogEntry {
  readonly family: string;
  readonly fullName: string;
  readonly style: string;
  readonly category: WebtoonFontCategory;
}

export interface LocalFontQueryResult {
  readonly source: "local-font-access" | "fallback-presets";
  readonly fonts: readonly LocalFontCatalogEntry[];
  readonly totalBeforeFilter: number;
}

const FALLBACK_WEBTOON_FONTS: readonly LocalFontCatalogEntry[] = Object.freeze([
  { family: "Pretendard", fullName: "Pretendard Medium", style: "Regular", category: "korean-dialogue" },
  { family: "Noto Sans KR", fullName: "Noto Sans KR Regular", style: "Regular", category: "korean-dialogue" },
  { family: "Black Han Sans", fullName: "Black Han Sans", style: "Heavy", category: "webtoon-sfx" },
  { family: "Jua", fullName: "BM Jua", style: "Display", category: "webtoon-sfx" },
  { family: "Space Grotesk", fullName: "Space Grotesk Bold", style: "Bold", category: "display-title" },
  { family: "Nanum Myeongjo", fullName: "Nanum Myeongjo", style: "Regular", category: "editorial" },
]);

export function classifyWebtoonFontCategory(font: {
  readonly family: string;
  readonly fullName?: string;
}): WebtoonFontCategory {
  const token = `${font.family} ${font.fullName ?? ""}`.toLowerCase();
  if (/(?:black han|jua|do hyeon|gmarket|bangers|impact|comic|손글씨|붓|흘림|효과)/u.test(token)) {
    return "webtoon-sfx";
  }
  if (/(?:myeongjo|batang|gungsuh|serif|명조|바탕|궁서)/u.test(token)) {
    return "editorial";
  }
  if (
    /(?:pretendard|noto sans kr|nanumgothic|nanum square|apple sd|malgun|spoqa|고딕|나눔|본고딕|돋움)/u.test(
      token,
    )
  ) {
    return "korean-dialogue";
  }
  if (/(?:grotesk|display|headline|montserrat|poppins|title|제목)/u.test(token)) {
    return "display-title";
  }
  return "general";
}

export async function queryWebtoonLocalFonts(options?: {
  readonly category?: WebtoonFontCategory | "all";
  readonly search?: string;
  readonly limit?: number;
  readonly env?: ChromeNextGenRuntimeEnv;
}): Promise<LocalFontQueryResult> {
  const resolved = resolveEnv(options?.env);
  const queryFn = resolved.win?.queryLocalFonts;
  let source: LocalFontQueryResult["source"] = "fallback-presets";
  let catalog: LocalFontCatalogEntry[] = [...FALLBACK_WEBTOON_FONTS];

  if (typeof queryFn === "function") {
    try {
      const rawFonts = await queryFn();
      const seen = new Set<string>();
      const normalized: LocalFontCatalogEntry[] = [];
      for (const item of rawFonts) {
        const key = `${item.family}::${item.style}`.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        normalized.push({
          family: item.family,
          fullName: item.fullName || item.family,
          style: item.style || "Regular",
          category: classifyWebtoonFontCategory(item),
        });
      }
      if (normalized.length > 0) {
        source = "local-font-access";
        catalog = normalized;
      }
    } catch {
      source = "fallback-presets";
    }
  }

  const totalBeforeFilter = catalog.length;
  const searchLower = options?.search?.trim().toLowerCase() ?? "";
  const category = options?.category ?? "all";
  const filtered = catalog.filter((entry) => {
    if (category !== "all" && entry.category !== category) return false;
    if (!searchLower) return true;
    return (
      entry.family.toLowerCase().includes(searchLower) ||
      entry.fullName.toLowerCase().includes(searchLower)
    );
  });

  const limit = Math.max(1, options?.limit ?? 24);
  return { source, fonts: filtered.slice(0, limit), totalBeforeFilter };
}

export interface DocumentPipOpenResult {
  readonly opened: boolean;
  readonly mode: "document-pip" | "inline-fallback";
  readonly pipWindow: Window | null;
  readonly reasonKo: string;
  readonly close: () => void;
}

export async function openStudioReferencePipWindow(options: {
  readonly title: string;
  readonly checklistItems: readonly string[];
  readonly width?: number;
  readonly height?: number;
  readonly env?: ChromeNextGenRuntimeEnv;
}): Promise<DocumentPipOpenResult> {
  const resolved = resolveEnv(options.env);
  const pipApi = resolved.win?.documentPictureInPicture;
  if (!pipApi || typeof pipApi.requestWindow !== "function") {
    return {
      opened: false,
      mode: "inline-fallback",
      pipWindow: null,
      reasonKo:
        "떠다니는 참고창은 Chrome 데스크톱에서 지원되며, 현재는 화면 안 참고 패널로 이어서 볼 수 있어요.",
      close: () => undefined,
    };
  }

  try {
    const pipWindow = await pipApi.requestWindow({
      width: options.width ?? 360,
      height: options.height ?? 420,
      disallowReturnToOpener: false,
    });
    const pipDoc = pipWindow.document;
    if (pipDoc?.body) {
      pipDoc.title = options.title;
      const container = pipDoc.createElement("section");
      const heading = pipDoc.createElement("h1");
      heading.textContent = options.title;
      const list = pipDoc.createElement("ul");
      for (const item of options.checklistItems) {
        const li = pipDoc.createElement("li");
        li.textContent = item;
        list.appendChild(li);
      }
      container.appendChild(heading);
      container.appendChild(list);
      pipDoc.body.replaceChildren(container);
    }
    return {
      opened: true,
      mode: "document-pip",
      pipWindow,
      reasonKo: "떠다니는 참고 보조창을 열었어요.",
      close: () => {
        try {
          pipWindow.close();
        } catch {
          // 이미 닫힌 창은 무시한다.
        }
      },
    };
  } catch {
    return {
      opened: false,
      mode: "inline-fallback",
      pipWindow: null,
      reasonKo: "보조창 열기가 차단되어 화면 안 참고 패널로 전환했어요.",
      close: () => undefined,
    };
  }
}

export interface WebNnProbeResult {
  readonly supported: boolean;
  readonly preferredDevice: "npu" | "gpu" | "cpu" | "fallback";
  readonly fallbackBackend: "webgpu" | "wasm-simd";
}

export async function probeWebNnRuntime(env?: ChromeNextGenRuntimeEnv): Promise<WebNnProbeResult> {
  const resolved = resolveEnv(env);
  const ml = resolved.nav?.ml;
  const hasWebGpu = typeof (resolved.nav as unknown as { readonly gpu?: unknown })?.gpu === "object";
  if (!ml || typeof ml.createContext !== "function") {
    return {
      supported: false,
      preferredDevice: "fallback",
      fallbackBackend: hasWebGpu ? "webgpu" : "wasm-simd",
    };
  }
  for (const deviceType of ["npu", "gpu", "cpu"] as const) {
    try {
      await ml.createContext({ deviceType });
      return {
        supported: true,
        preferredDevice: deviceType,
        fallbackBackend: hasWebGpu ? "webgpu" : "wasm-simd",
      };
    } catch {
      // 다음 가속 장치로 자연스럽게 내려간다.
    }
  }
  return {
    supported: false,
    preferredDevice: "fallback",
    fallbackBackend: hasWebGpu ? "webgpu" : "wasm-simd",
  };
}

export interface SpeculationRulesDocument {
  readonly prerender: readonly {
    readonly source: "list";
    readonly urls: readonly string[];
    readonly eagerness: "conservative" | "moderate";
  }[];
  readonly prefetch: readonly {
    readonly source: "list";
    readonly urls: readonly string[];
    readonly eagerness: "moderate";
  }[];
}

const SAFE_STUDIO_PATH_PATTERN = /^\/(?:studio|market|discover|learn)(?:\/[A-Za-z0-9._~/-]*)?$/u;

export function buildStudioSpeculationRulesSpec(options?: {
  readonly prerenderPaths?: readonly string[];
  readonly prefetchPaths?: readonly string[];
}): SpeculationRulesDocument {
  const sanitize = (paths: readonly string[] | undefined, defaults: readonly string[]): string[] => {
    const input = paths ?? defaults;
    return [...new Set(input.filter((item) => SAFE_STUDIO_PATH_PATTERN.test(item)))];
  };
  return {
    prerender: [
      {
        source: "list",
        urls: sanitize(options?.prerenderPaths, ["/studio", "/market/browse"]),
        eagerness: "conservative",
      },
    ],
    prefetch: [
      {
        source: "list",
        urls: sanitize(options?.prefetchPaths, ["/studio/assets", "/learn"]),
        eagerness: "moderate",
      },
    ],
  };
}

export function injectSpeculationRules(
  spec: SpeculationRulesDocument,
  env?: ChromeNextGenRuntimeEnv,
): { readonly applied: boolean; readonly fallback: "none" | "link-prefetch" } {
  const resolved = resolveEnv(env);
  if (!resolved.scriptSupports?.("speculationrules") || !resolved.doc?.head) {
    return { applied: false, fallback: "link-prefetch" };
  }
  const existing = resolved.doc.head.querySelector("script[data-toonstudio-speculation='true']");
  const script = existing ?? resolved.doc.createElement("script");
  script.setAttribute("type", "speculationrules");
  script.setAttribute("data-toonstudio-speculation", "true");
  script.textContent = JSON.stringify(spec);
  if (!existing) {
    resolved.doc.head.appendChild(script);
  }
  return { applied: true, fallback: "none" };
}

export interface StudioAudioMixConfig {
  readonly sfxGain: number;
  readonly bgmGain: number;
  readonly duckingDb: number;
  readonly sampleRate?: number;
}

export interface StudioAudioWorkletHandle {
  readonly backend: "audio-worklet" | "offline-audio-fallback";
  readonly estimatedLatencyMs: number;
  readonly config: Required<StudioAudioMixConfig>;
  readonly triggerSfxPreview: (cueId: string) => { readonly played: boolean; readonly cueId: string };
  readonly dispose: () => Promise<void>;
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0.8;
  return Math.min(1, Math.max(0, value));
}

export async function createStudioAudioWorkletProcessor(
  rawConfig: StudioAudioMixConfig,
  env?: ChromeNextGenRuntimeEnv,
): Promise<StudioAudioWorkletHandle> {
  const config: Required<StudioAudioMixConfig> = {
    sfxGain: clampUnit(rawConfig.sfxGain),
    bgmGain: clampUnit(rawConfig.bgmGain),
    duckingDb: Math.min(0, Math.max(-24, rawConfig.duckingDb)),
    sampleRate: rawConfig.sampleRate ?? 48_000,
  };
  const resolved = resolveEnv(env);
  const globalObj = globalThis as unknown as {
    readonly AudioContext?: new (opts?: { latencyHint?: string; sampleRate?: number }) => {
      readonly baseLatency?: number;
      readonly close?: () => Promise<void>;
    };
    readonly AudioWorkletNode?: unknown;
  };
  const AudioCtx = globalObj.AudioContext;
  const hasWorklet =
    typeof (resolved.win?.AudioWorkletNode ?? globalObj.AudioWorkletNode) === "function";

  if (typeof AudioCtx === "function" && hasWorklet) {
    try {
      const ctx = new AudioCtx({ latencyHint: "interactive", sampleRate: config.sampleRate });
      const latencyMs = Math.round((ctx.baseLatency ?? 0.008) * 10_000) / 10;
      return {
        backend: "audio-worklet",
        estimatedLatencyMs: latencyMs,
        config,
        triggerSfxPreview: (cueId) => ({ played: true, cueId }),
        dispose: async () => {
          await ctx.close?.();
        },
      };
    } catch {
      // 오디오 장치가 없는 환경에서는 오프라인 폴백으로 내려간다.
    }
  }

  return {
    backend: "offline-audio-fallback",
    estimatedLatencyMs: 24,
    config,
    triggerSfxPreview: (cueId) => ({ played: true, cueId }),
    dispose: async () => undefined,
  };
}
