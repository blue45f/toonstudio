/**
 * 브라우저 내장 온디바이스 AI API (`globalThis.LanguageModel` · `globalThis.ai.languageModel` · `globalThis.Translator`)
 * 타임아웃 안전 기능 탐지 및 세션 생명주기(자동 `destroy()`) 관리 어댑터.
 */

export const DEFAULT_PROBE_TIMEOUT_MS = 1_500;
export const DEFAULT_ONDEVICE_INVOKE_TIMEOUT_MS = 8_000;

export type OnDeviceApiStatus =
  | "available"
  | "downloadable"
  | "downloading"
  | "unavailable"
  | "timeout"
  | "error";
export type PromptApiSurface = "global-language-model" | "ai-language-model" | "none";
export type TranslatorApiSurface = "global-translator" | "ai-translator" | "none";

export interface BrowserLanguageModelSession {
  prompt(input: string, options?: { readonly signal?: AbortSignal }): Promise<string>;
  destroy?: () => void;
}

export interface BrowserLanguageModelApi {
  availability?: (options?: Record<string, unknown>) => Promise<string>;
  capabilities?: () => Promise<{ readonly available?: string }>;
  create(options?: {
    readonly systemPrompt?: string;
    readonly signal?: AbortSignal;
  }): Promise<BrowserLanguageModelSession>;
}

export interface BrowserTranslatorInstance {
  translate(input: string): Promise<string>;
  destroy?: () => void;
}

export interface BrowserTranslatorApi {
  availability?: (options: {
    readonly sourceLanguage: string;
    readonly targetLanguage: string;
  }) => Promise<string>;
  capabilities?: () => Promise<{ readonly available?: string }>;
  create(options: {
    readonly sourceLanguage: string;
    readonly targetLanguage: string;
  }): Promise<BrowserTranslatorInstance>;
}

export interface BrowserBuiltInAiGlobal {
  readonly LanguageModel?: BrowserLanguageModelApi;
  readonly Translator?: BrowserTranslatorApi;
  readonly ai?: {
    readonly languageModel?: BrowserLanguageModelApi;
    readonly translator?: BrowserTranslatorApi;
  };
}

export interface OnDeviceAiCapabilities {
  readonly promptApiSurface: PromptApiSurface;
  readonly promptApiStatus: OnDeviceApiStatus;
  readonly promptApiReady: boolean;
  readonly translatorSurface: TranslatorApiSurface;
  readonly translatorStatus: OnDeviceApiStatus;
  readonly translatorReady: boolean;
  readonly probedAtMs: number;
  readonly probeDurationMs: number;
}

export type OnDeviceInvokeResult =
  | { readonly ok: true; readonly content: string; readonly label: string }
  | { readonly ok: false; readonly reason: string };

function normalizeAvailabilityStatus(raw: unknown): OnDeviceApiStatus {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (value === "available" || value === "readily") return "available";
  if (value === "downloadable" || value === "after-download") return "downloadable";
  if (value === "downloading") return "downloading";
  return "unavailable";
}

export async function withSafeTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<{ readonly timedOut: false; readonly value: T } | { readonly timedOut: true }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<{ readonly timedOut: true }>((resolve) => {
      timer = setTimeout(() => resolve({ timedOut: true }), Math.max(10, Math.trunc(timeoutMs)));
    });
    return await Promise.race([
      promise.then((value) => ({ timedOut: false as const, value })),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function resolvePromptApi(g: BrowserBuiltInAiGlobal): {
  readonly surface: PromptApiSurface;
  readonly api: BrowserLanguageModelApi | null;
} {
  if (g.LanguageModel && typeof g.LanguageModel.create === "function") {
    return { surface: "global-language-model", api: g.LanguageModel };
  }
  if (g.ai?.languageModel && typeof g.ai.languageModel.create === "function") {
    return { surface: "ai-language-model", api: g.ai.languageModel };
  }
  return { surface: "none", api: null };
}

function resolveTranslatorApi(g: BrowserBuiltInAiGlobal): {
  readonly surface: TranslatorApiSurface;
  readonly api: BrowserTranslatorApi | null;
} {
  if (g.Translator && typeof g.Translator.create === "function") {
    return { surface: "global-translator", api: g.Translator };
  }
  if (g.ai?.translator && typeof g.ai.translator.create === "function") {
    return { surface: "ai-translator", api: g.ai.translator };
  }
  return { surface: "none", api: null };
}

async function probeApiStatus(probePromise: Promise<unknown>, timeoutMs: number): Promise<OnDeviceApiStatus> {
  try {
    const res = await withSafeTimeout(probePromise, timeoutMs);
    if (res.timedOut) return "timeout";
    const val = res.value;
    if (val && typeof val === "object" && "available" in val) {
      return normalizeAvailabilityStatus((val as { readonly available?: unknown }).available);
    }
    return normalizeAvailabilityStatus(val);
  } catch {
    return "error";
  }
}

export async function probeOnDeviceAiCapabilities(options: {
  readonly globalObject?: BrowserBuiltInAiGlobal;
  readonly probeTimeoutMs?: number;
  readonly sourceLanguage?: string;
  readonly targetLanguage?: string;
  readonly now?: () => number;
} = {}): Promise<OnDeviceAiCapabilities> {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const g = options.globalObject ?? (globalThis as unknown as BrowserBuiltInAiGlobal);
  const timeoutMs = Math.max(20, Math.trunc(options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS));
  const promptResolved = resolvePromptApi(g);
  const translatorResolved = resolveTranslatorApi(g);

  const promptPromise: Promise<OnDeviceApiStatus> = !promptResolved.api
    ? Promise.resolve("unavailable")
    : typeof promptResolved.api.availability === "function"
      ? probeApiStatus(promptResolved.api.availability(), timeoutMs)
      : typeof promptResolved.api.capabilities === "function"
        ? probeApiStatus(promptResolved.api.capabilities(), timeoutMs)
        : Promise.resolve("available");

  const translatorPromise: Promise<OnDeviceApiStatus> = !translatorResolved.api
    ? Promise.resolve("unavailable")
    : typeof translatorResolved.api.availability === "function"
      ? probeApiStatus(
          translatorResolved.api.availability({
            sourceLanguage: options.sourceLanguage ?? "ko",
            targetLanguage: options.targetLanguage ?? "en",
          }),
          timeoutMs,
        )
      : typeof translatorResolved.api.capabilities === "function"
        ? probeApiStatus(translatorResolved.api.capabilities(), timeoutMs)
        : Promise.resolve("available");

  const [promptApiStatus, translatorStatus] = await Promise.all([promptPromise, translatorPromise]);
  const finishedAt = now();
  return {
    promptApiSurface: promptResolved.surface,
    promptApiStatus,
    promptApiReady: promptApiStatus === "available",
    translatorSurface: translatorResolved.surface,
    translatorStatus,
    translatorReady: translatorStatus === "available",
    probedAtMs: finishedAt,
    probeDurationMs: Math.max(0, finishedAt - startedAt),
  };
}

export async function invokeOnDevicePrompt(options: {
  readonly globalObject: BrowserBuiltInAiGlobal;
  readonly prompt: string;
  readonly systemPrompt?: string;
  readonly invokeTimeoutMs: number;
}): Promise<OnDeviceInvokeResult> {
  const { api, surface } = resolvePromptApi(options.globalObject);
  if (!api) return { ok: false, reason: "prompt_api_missing" };
  let session: BrowserLanguageModelSession | undefined;
  try {
    const res = await withSafeTimeout(
      api.create(options.systemPrompt ? { systemPrompt: options.systemPrompt } : undefined).then((s) => {
        session = s;
        return s.prompt(options.prompt);
      }),
      options.invokeTimeoutMs,
    );
    if (res.timedOut) return { ok: false, reason: "ondevice_prompt_timeout" };
    if (!res.value.trim()) return { ok: false, reason: "ondevice_prompt_empty" };
    return { ok: true, content: res.value, label: `browser:${surface}` };
  } catch {
    return { ok: false, reason: "ondevice_prompt_error" };
  } finally {
    session?.destroy?.();
  }
}

export async function invokeOnDeviceTranslator(options: {
  readonly globalObject: BrowserBuiltInAiGlobal;
  readonly text: string;
  readonly sourceLanguage: string;
  readonly targetLanguage: string;
  readonly invokeTimeoutMs: number;
}): Promise<OnDeviceInvokeResult> {
  const { api, surface } = resolveTranslatorApi(options.globalObject);
  if (!api) return { ok: false, reason: "translator_missing" };
  let instance: BrowserTranslatorInstance | undefined;
  try {
    const res = await withSafeTimeout(
      api
        .create({ sourceLanguage: options.sourceLanguage, targetLanguage: options.targetLanguage })
        .then((tr) => {
          instance = tr;
          return tr.translate(options.text);
        }),
      options.invokeTimeoutMs,
    );
    if (res.timedOut) return { ok: false, reason: "ondevice_translator_timeout" };
    if (!res.value.trim()) return { ok: false, reason: "ondevice_translator_empty" };
    return { ok: true, content: res.value, label: `browser:${surface}` };
  } catch {
    return { ok: false, reason: "ondevice_translator_error" };
  } finally {
    instance?.destroy?.();
  }
}
