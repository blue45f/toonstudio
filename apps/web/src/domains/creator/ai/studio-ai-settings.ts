/**
 * Studio AI 클라이언트 설정 저장 — 주입받은 Web Storage(session/persistent)에 BYOK 설정을
 * 읽고 쓰는 순수 로직. studio-ai-client.ts에서 분리했다(파일 크기 래칫 해소).
 *
 * 필드 단위 기본값 폴백이 정책이다: 저장값 하나가 깨졌다고 나머지까지 잃지 않는다.
 */
/** Web Storage 호환 인터페이스 — 호출자가 수명(session/persistent)을 명시적으로 선택한다. */
export interface StudioAiStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export const STUDIO_AI_SETTINGS_KEY = "toonstudio-studio-ai-settings";

export interface StudioAiSettings {
  /** 예: "https://api.openai.com/v1" (끝에 슬래시 없이). 아래 세 경로가 이 뒤에 그대로 붙는다. */
  baseUrl: string;
  /** 절대 앱 서버로 전송하지 않는다 — 탭 세션에만 보관하고 브라우저→제공자 직접 fetch에 사용. */
  apiKey: string;
  imageModel: string;
  textModel: string;
  /** 배경 생성(POST, JSON body) 경로. 기본값은 OpenAI Images Generations. */
  imageGenerationPath: string;
  /** 자동 채색(POST, multipart/form-data) 경로. 기본값은 OpenAI Images Edits. */
  imageEditPath: string;
  /** 콘티→구도 제안(POST, JSON body) 경로. 기본값은 OpenAI Chat Completions. */
  chatCompletionsPath: string;
}

export const STUDIO_AI_DEFAULT_SETTINGS: StudioAiSettings = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  imageModel: "dall-e-3",
  textModel: "gpt-4o-mini",
  imageGenerationPath: "/images/generations",
  imageEditPath: "/images/edits",
  chatCompletionsPath: "/chat/completions",
};

/**
 * 저장된 설정 로드 — 저장소 부재·손상 JSON·필드 누락은 필드 단위로 기본값 폴백한다
 * (studio-reference-panel.deserializeReferencePanelSettings와 동일한 "관대한" 정책 — baseUrl
 * 하나가 깨졌다고 apiKey까지 통째로 잃게 하지 않는다).
 */
export function loadStudioAiSettings(storage: StudioAiStorage | null | undefined): StudioAiSettings {
  if (!storage) return { ...STUDIO_AI_DEFAULT_SETTINGS };
  try {
    const raw = storage.getItem(STUDIO_AI_SETTINGS_KEY);
    if (!raw) return { ...STUDIO_AI_DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return { ...STUDIO_AI_DEFAULT_SETTINGS };
    const o = parsed as Record<string, unknown>;
    const str = (key: keyof StudioAiSettings, allowEmpty = false): string => {
      const v = o[key];
      if (typeof v !== "string") return STUDIO_AI_DEFAULT_SETTINGS[key];
      if (!allowEmpty && v.trim().length === 0) return STUDIO_AI_DEFAULT_SETTINGS[key];
      return v;
    };
    return {
      baseUrl: str("baseUrl"),
      apiKey: str("apiKey", true), // 빈 문자열(미설정 상태)도 유효한 값이다.
      imageModel: str("imageModel"),
      textModel: str("textModel"),
      imageGenerationPath: str("imageGenerationPath"),
      imageEditPath: str("imageEditPath"),
      chatCompletionsPath: str("chatCompletionsPath"),
    };
  } catch {
    return { ...STUDIO_AI_DEFAULT_SETTINGS };
  }
}

/** 저장 — 실패(쿼터 초과·시크릿 모드 등)는 조용히 무시한다(studio-brand-kit.ts persist와 동일 정책). */
export function saveStudioAiSettings(storage: StudioAiStorage | null | undefined, settings: StudioAiSettings): void {
  if (!storage) return;
  try {
    storage.setItem(STUDIO_AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 무시.
  }
}

/** 민감 키가 든 설정을 제거한다. removeItem 미지원 테스트 저장소도 기본값 덮어쓰기로 키를 폐기한다. */
export function clearStudioAiSettings(storage: StudioAiStorage | null | undefined): void {
  if (!storage) return;
  try {
    if (storage.removeItem) storage.removeItem(STUDIO_AI_SETTINGS_KEY);
    else storage.setItem(STUDIO_AI_SETTINGS_KEY, JSON.stringify(STUDIO_AI_DEFAULT_SETTINGS));
  } catch {
    // 저장소가 차단돼도 현재 메모리 설정은 호출부가 별도로 비운다.
  }
}

/**
 * Loads BYOK settings from the current tab session. A legacy localStorage value is migrated once
 * for compatibility and then securely removed, so refreshing the same tab keeps the connection
 * while closing the tab ends credential persistence.
 */
export function loadStudioAiSessionSettings(
  sessionStorage: StudioAiStorage | null | undefined,
  legacyPersistentStorage?: StudioAiStorage | null
): StudioAiSettings {
  let hasSessionValue = false;
  try {
    hasSessionValue = Boolean(sessionStorage?.getItem(STUDIO_AI_SETTINGS_KEY));
  } catch {
    // sessionStorage가 차단된 환경은 아래 메모리-only 경로로 폴백한다.
  }
  const settings = hasSessionValue
    ? loadStudioAiSettings(sessionStorage)
    : loadStudioAiSettings(legacyPersistentStorage);
  if (!hasSessionValue && legacyPersistentStorage) saveStudioAiSettings(sessionStorage, settings);
  if (legacyPersistentStorage && legacyPersistentStorage !== sessionStorage) {
    clearStudioAiSettings(legacyPersistentStorage);
  }
  return settings;
}

/** baseUrl과 apiKey가 둘 다 채워져 있어야 "설정 완료"로 간주한다(모델/경로는 기본값으로도 동작). */
export function isStudioAiConfigured(settings: StudioAiSettings): boolean {
  return settings.baseUrl.trim().length > 0 && settings.apiKey.trim().length > 0;
}

export const GITHUB_MODELS_INFERENCE_BASE_URL = "https://models.github.ai/inference";
export const GITHUB_MODELS_DEFAULT_TEXT_MODEL = "openai/gpt-4o-mini";

const DEFAULT_ENV_TOKEN_KEYS = [
  "VITE_STUDIO_DEFAULT_GITHUB_MODELS_KEY",
  "STUDIO_AI_FREE_GITHUB_MODELS_API_KEY",
  "GITHUB_MODELS_API_KEY",
  "GITHUB_PERSONAL_ACCESS_TOKEN",
  "GITHUB_TOKEN",
] as const;

function readRuntimeEnvMap(
  envOverride?: Readonly<Record<string, string | undefined>>,
): Readonly<Record<string, string | undefined>> {
  if (envOverride) return envOverride;
  const merged: Record<string, string | undefined> = {};
  try {
    const proc = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
    if (proc?.env) Object.assign(merged, proc.env);
  } catch {
    // 브라우저 런타임에서 process 미정의 시 무시
  }
  try {
    const metaEnv = (import.meta as unknown as { env?: Record<string, unknown> }).env;
    if (metaEnv && typeof metaEnv === "object") {
      for (const [k, v] of Object.entries(metaEnv)) {
        if (typeof v === "string") merged[k] = v;
      }
    }
  } catch {
    // 무시
  }
  return merged;
}

/**
 * 로컬/환경변수(.env.infrastructure.local, .env.local 등)에 기본 세팅된
 * GitHub Models / Personal Access Token을 읽는다. 키 원문은 외부 로그로 출력하지 않는다.
 */
export function readStudioDefaultEnvToken(
  envOverride?: Readonly<Record<string, string | undefined>>,
): string {
  const env = readRuntimeEnvMap(envOverride);
  for (const key of DEFAULT_ENV_TOKEN_KEYS) {
    const candidate = env[key]?.trim();
    if (candidate) return candidate;
  }
  return "";
}

/**
 * BYOK 수동 입력이 없어도 환경변수 기본 토큰이 세팅되어 있으면
 * GitHub Models OpenAI 호환 엔드포인트로 즉시 동작하는 기본 설정을 만든다.
 */
export function resolveStudioDefaultEnvAiSettings(
  envOverride?: Readonly<Record<string, string | undefined>>,
): StudioAiSettings {
  const env = readRuntimeEnvMap(envOverride);
  const token = readStudioDefaultEnvToken(env);
  if (!token) return { ...STUDIO_AI_DEFAULT_SETTINGS };
  const baseUrl = env["VITE_STUDIO_DEFAULT_AI_BASE_URL"]?.trim() || GITHUB_MODELS_INFERENCE_BASE_URL;
  const textModel = env["VITE_STUDIO_DEFAULT_AI_TEXT_MODEL"]?.trim() || GITHUB_MODELS_DEFAULT_TEXT_MODEL;
  return {
    ...STUDIO_AI_DEFAULT_SETTINGS,
    baseUrl,
    apiKey: token,
    textModel,
  };
}

export type StudioEffectiveAiSettingsSource = "byok-session" | "env-default" | "unconfigured";

export interface StudioEffectiveAiSettingsResolution {
  readonly settings: StudioAiSettings;
  readonly source: StudioEffectiveAiSettingsSource;
}

/**
 * 현재 탭의 BYOK 세션 설정을 우선 확인하고, 비어 있으면 환경변수 기본 토큰(GitHub Models 등)으로
 * 자동 폴백해 BYOK 수동 등록 없이도 기본 동작하도록 한다.
 */
export function loadEffectiveStudioAiSettings(
  sessionStorage?: StudioAiStorage | null,
  legacyPersistentStorage?: StudioAiStorage | null,
  envOverride?: Readonly<Record<string, string | undefined>>,
): StudioEffectiveAiSettingsResolution {
  const sessionSettings = loadStudioAiSessionSettings(sessionStorage, legacyPersistentStorage);
  if (isStudioAiConfigured(sessionSettings)) {
    return { settings: sessionSettings, source: "byok-session" };
  }
  const envSettings = resolveStudioDefaultEnvAiSettings(envOverride);
  if (isStudioAiConfigured(envSettings)) {
    return { settings: envSettings, source: "env-default" };
  }
  return { settings: sessionSettings, source: "unconfigured" };
}

