import {
  ALL_STUDIO_OPENAI_ASSIST_MODES,
  validateAssistModeStructuredOutput,
  type StudioOpenAiAssistMode,
} from "@toonstudio/contracts/studio-openai-assist-result";

import { withCsrfProtection } from "@/shared/lib/csrf";
import { useApp } from "@/shared/lib/store";

export {
  ALL_STUDIO_OPENAI_ASSIST_MODES,
  type StudioOpenAiAssistMode,
} from "@toonstudio/contracts/studio-openai-assist-result";

const STUDIO_OPENAI_ASSIST_MODE_SET: ReadonlySet<string> = new Set(
  ALL_STUDIO_OPENAI_ASSIST_MODES,
);

export function isStudioOpenAiAssistMode(value: unknown): value is StudioOpenAiAssistMode {
  return typeof value === "string" && STUDIO_OPENAI_ASSIST_MODE_SET.has(value);
}

export type StudioOpenAiTargetPlatform =
  | "vertical-webtoon"
  | "cuttoon"
  | "page-comic"
  | "general";

export interface StudioOpenAiModeDescriptor {
  readonly id: StudioOpenAiAssistMode;
  readonly labelKo: string;
  readonly descriptionKo: string;
}

export interface StudioOpenAiAssistStatus {
  readonly configured: boolean;
  readonly provider: "openai";
  readonly model: string;
  readonly keyLocation: "server-env-only";
  readonly storeData: false;
  readonly piiMasking: true;
  readonly autoBillingDisabled: boolean | null;
  readonly modelConfigurationError: "retired" | null;
  readonly modes: readonly StudioOpenAiModeDescriptor[];
  readonly limits: {
    readonly burstPerMinute: number;
    readonly hourlyRequests: number;
    readonly dailyRequests: number;
    readonly maxInputChars: number;
  };
  readonly setupNoticeKo: string;
  readonly offlineFallback?: boolean;
}

export interface StudioOpenAiIdeaRemixData {
  readonly summary: string;
  readonly angles: readonly {
    readonly lens:
      | "contrarian"
      | "personal-hook"
      | "detail-evidence"
      | "four-cut-playbook"
      | "missed-angle";
    readonly lensLabelKo: string;
    readonly headline: string;
    readonly pitch: string;
    readonly firstCutHint: string;
  }[];
}

export interface StudioOpenAiScriptToCutsData {
  readonly episodeGoal: string;
  readonly pacingTip: string;
  readonly cuts: readonly {
    readonly cutNumber: number;
    readonly beatKind:
      | "setup"
      | "dialogue"
      | "action"
      | "reaction"
      | "reveal"
      | "transition";
    readonly shotType: string;
    readonly visualAction: string;
    readonly dialogue: string;
    readonly scrollGapHint: string;
  }[];
}

export interface StudioOpenAiDialoguePolishData {
  readonly readabilityNote: string;
  readonly balloons: readonly {
    readonly toneLabel: string;
    readonly line: string;
    readonly subBubble: string;
    readonly reason: string;
  }[];
}

export interface StudioOpenAiExportCoachData {
  readonly readinessSummary: string;
  readonly episodeBlurbSuggestion: string;
  readonly checks: readonly {
    readonly category: string;
    readonly severity: "pass" | "tip" | "fix";
    readonly detail: string;
  }[];
}

export interface StudioOpenAiCharacterBibleForgeData {
  readonly characterName: string;
  readonly archetypeKo: string;
  readonly speechTone: string;
  readonly appearancePalette: string;
  readonly coreMotivation: string;
  readonly forbiddenLines: readonly string[];
  readonly relationshipHooks: readonly {
    readonly target: string;
    readonly dynamic: string;
  }[];
  readonly visualConsistencyCue: string;
}

export interface StudioOpenAiContinuityPlotAuditData {
  readonly overallConsistencyScore: number;
  readonly summary: string;
  readonly issues: readonly {
    readonly severity: "critical" | "warn" | "tip";
    readonly category: string;
    readonly locationHint: string;
    readonly conflictDetail: string;
    readonly fixSuggestion: string;
  }[];
}

export interface StudioOpenAiBg3dCameraBlockingData {
  readonly sceneSummary: string;
  readonly camera: {
    readonly lensMm: number;
    readonly fovDeg: number;
    readonly angleLabel: string;
    readonly position: readonly [number, number, number];
    readonly target: readonly [number, number, number];
    readonly rollDeg: number;
  };
  readonly lighting: {
    readonly timeOfDay: string;
    readonly keyLightColor: string;
    readonly rimLightNote: string;
    readonly ambientRatio: number;
  };
  readonly propsToPlace: readonly string[];
  readonly blockingNotes: readonly string[];
}

export interface StudioOpenAiColorMoodDirectorData {
  readonly emotionLabel: string;
  readonly moodSummary: string;
  readonly palette: readonly {
    readonly role: string;
    readonly nameKo: string;
    readonly oklch: string;
    readonly usageTip: string;
  }[];
  readonly lightingGuide: string;
  readonly contrastWarning: string;
}

export interface StudioOpenAiSfxOnomatopoeiaLabData {
  readonly sceneEnergy: string;
  readonly suggestions: readonly {
    readonly ko: string;
    readonly ja: string;
    readonly en: string;
    readonly intent: string;
    readonly typographyTip: string;
    readonly placementHint: string;
  }[];
}

export interface StudioOpenAiPhotoshopFxRecipeData {
  readonly lookNameKo: string;
  readonly summary: string;
  readonly layerStyles: readonly {
    readonly effect: string;
    readonly blendMode: string;
    readonly opacityPct: number;
    readonly paramsSummary: string;
  }[];
  readonly cameraRaw: {
    readonly exposure: number;
    readonly contrast: number;
    readonly clarity: number;
    readonly dehaze: number;
    readonly temperatureShift: number;
    readonly grainPct: number;
  };
  readonly nonDestructiveTip: string;
}

export interface StudioOpenAiScrollPacingAuditorData {
  readonly rhythmVerdict: string;
  readonly averageGapPx: number;
  readonly cliffhangerScore: number;
  readonly cliffhangerTip: string;
  readonly beatPacing: readonly {
    readonly section: string;
    readonly pacing: "tight" | "steady" | "breath" | "drop";
    readonly recommendedGapPx: number;
    readonly readerRetentionNote: string;
  }[];
}

export interface StudioOpenAiThumbnailHookOptimizerData {
  readonly hookDiagnosis: string;
  readonly titleVariants: readonly {
    readonly variantLabel: string;
    readonly title: string;
    readonly subCopy: string;
    readonly hookReason: string;
  }[];
  readonly thumbnailSpec: {
    readonly focalSubject: string;
    readonly contrastNote: string;
    readonly textOverlayMaxChars: number;
    readonly cropSafetyTip: string;
  };
}

export interface StudioOpenAiLocalizationGlossaryCheckData {
  readonly targetLocales: readonly string[];
  readonly glossary: readonly {
    readonly termKo: string;
    readonly en: string;
    readonly ja: string;
    readonly ruleNote: string;
  }[];
  readonly culturalNotes: readonly {
    readonly severity: "info" | "warn";
    readonly topic: string;
    readonly adaptationTip: string;
  }[];
}

export interface StudioOpenAiMcpWorkflowMacroData {
  readonly macroTitle: string;
  readonly summary: string;
  readonly zeroCostSafe: boolean;
  readonly steps: readonly {
    readonly stepOrder: number;
    readonly toolName: string;
    readonly reasonKo: string;
    readonly argumentsJson: string;
  }[];
}

export type StudioOpenAiExtendedStructuredResult =
  | { readonly mode: "character-bible-forge"; readonly data: StudioOpenAiCharacterBibleForgeData }
  | { readonly mode: "continuity-plot-audit"; readonly data: StudioOpenAiContinuityPlotAuditData }
  | { readonly mode: "bg3d-camera-blocking"; readonly data: StudioOpenAiBg3dCameraBlockingData }
  | { readonly mode: "color-mood-director"; readonly data: StudioOpenAiColorMoodDirectorData }
  | { readonly mode: "sfx-onomatopoeia-lab"; readonly data: StudioOpenAiSfxOnomatopoeiaLabData }
  | { readonly mode: "photoshop-fx-recipe"; readonly data: StudioOpenAiPhotoshopFxRecipeData }
  | { readonly mode: "scroll-pacing-auditor"; readonly data: StudioOpenAiScrollPacingAuditorData }
  | { readonly mode: "thumbnail-hook-optimizer"; readonly data: StudioOpenAiThumbnailHookOptimizerData }
  | { readonly mode: "localization-glossary-check"; readonly data: StudioOpenAiLocalizationGlossaryCheckData }
  | { readonly mode: "mcp-workflow-macro"; readonly data: StudioOpenAiMcpWorkflowMacroData };

export type StudioOpenAiStructuredResult =
  | { readonly mode: "idea-remix"; readonly data: StudioOpenAiIdeaRemixData }
  | { readonly mode: "script-to-cuts"; readonly data: StudioOpenAiScriptToCutsData }
  | { readonly mode: "dialogue-polish"; readonly data: StudioOpenAiDialoguePolishData }
  | { readonly mode: "export-preflight-coach"; readonly data: StudioOpenAiExportCoachData }
  | StudioOpenAiExtendedStructuredResult;

export interface StudioOpenAiAssistSuccess {
  readonly provider: "openai";
  readonly model: string;
  readonly result: StudioOpenAiStructuredResult;
  readonly privacy: {
    readonly storeData: false;
    readonly piiRedactedCount: number;
  };
  readonly quota: {
    readonly remainingDaily: number;
    readonly dailyLimit: number;
  };
  readonly usage: {
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
  };
}

export type StudioOpenAiAssistCallResult =
  | { readonly ok: true; readonly data: StudioOpenAiAssistSuccess }
  | {
      readonly ok: false;
      readonly status: number;
      readonly code: string;
      readonly message: string;
    };

export interface StudioOpenAiCreativeAssistInput {
  readonly mode: StudioOpenAiAssistMode;
  readonly inputText: string;
  readonly projectTitle?: string;
  readonly genreOrTone?: string;
  readonly targetPlatform?: StudioOpenAiTargetPlatform;
}

export const DEFAULT_STUDIO_OPENAI_MODES: readonly StudioOpenAiModeDescriptor[] = [
  {
    id: "idea-remix",
    labelKo: "5가지 발상 리믹스",
    descriptionKo: "한 줄 소재를 반전·공감·디테일·4컷 전개·빈틈 시선 5가지 각도로 넓힙니다.",
  },
  {
    id: "script-to-cuts",
    labelKo: "대본 → 컷 분할",
    descriptionKo: "줄거리나 대본을 웹툰 컷 번호·구도·행동·대사·여백 호흡으로 나눕니다.",
  },
  {
    id: "dialogue-polish",
    labelKo: "말풍선 대사 다듬기",
    descriptionKo: "길거나 딱딱한 대사를 모바일 말풍선에 잘 읽히는 3가지 톤으로 다듬습니다.",
  },
  {
    id: "export-preflight-coach",
    labelKo: "마감·소개글 점검",
    descriptionKo: "내보내기 전 어색한 문구, 말풍선 밀도, 회차 소개글을 빠르게 점검합니다.",
  },
] as const;

export function createOfflineOpenAiStatusFallback(): StudioOpenAiAssistStatus {
  return {
    configured: false,
    provider: "openai",
    model: "gpt-4o-mini",
    keyLocation: "server-env-only",
    storeData: false,
    piiMasking: true,
    autoBillingDisabled: null,
    modelConfigurationError: null,
    modes: DEFAULT_STUDIO_OPENAI_MODES,
    limits: {
      burstPerMinute: 5,
      hourlyRequests: 20,
      dailyRequests: 60,
      maxInputChars: 6_000,
    },
    setupNoticeKo:
      "현재 API 서버와 연결되지 않았거나 서버 환경변수(OPENAI_API_KEY)가 설정되지 않았습니다. 키 없이도 기획·원고 편집·내보내기는 그대로 사용할 수 있어요.",
    offlineFallback: true,
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 서버와 같은 규격으로 결과 본문을 검증한다. */
export function isValidStudioOpenAiStructuredResult(
  value: unknown,
): value is StudioOpenAiStructuredResult {
  const result = asRecord(value);
  return result !== null &&
    isStudioOpenAiAssistMode(result.mode) &&
    validateAssistModeStructuredOutput(result.mode, result.data) !== null;
}

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** 응답과 저장본에 공통으로 필요한 정보와 모드별 본문을 확인한다. */
export function isValidStudioOpenAiAssistSuccess(value: unknown): value is StudioOpenAiAssistSuccess {
  const response = asRecord(value);
  if (!response || response.provider !== "openai" ||
    typeof response.model !== "string" || !response.model.trim()) return false;
  const privacy = asRecord(response.privacy);
  const quota = asRecord(response.quota);
  const usage = asRecord(response.usage);
  return privacy !== null &&
    privacy.storeData === false &&
    isNonNegativeInteger(privacy.piiRedactedCount) &&
    quota !== null &&
    isNonNegativeInteger(quota.remainingDaily) &&
    isNonNegativeInteger(quota.dailyLimit) &&
    usage !== null &&
    isNonNegativeInteger(usage.promptTokens) &&
    isNonNegativeInteger(usage.completionTokens) &&
    isNonNegativeInteger(usage.totalTokens) &&
    isValidStudioOpenAiStructuredResult(response.result);
}

function extractErrorDetails(
  body: unknown,
  fallbackMessage: string,
): { readonly code: string; readonly message: string } {
  const parsed = asRecord(body);
  if (!parsed) {
    return { code: "OPENAI_CLIENT_HTTP_ERROR", message: fallbackMessage };
  }
  const nestedError = asRecord(parsed.error);
  const code =
    (typeof parsed.code === "string" && parsed.code.trim()) ||
    (typeof nestedError?.code === "string" && nestedError.code.trim()) ||
    "OPENAI_CLIENT_HTTP_ERROR";

  const rawMessage = parsed.message ?? nestedError?.message;
  if (typeof rawMessage === "string" && rawMessage.trim()) {
    return { code, message: rawMessage.trim() };
  }
  if (Array.isArray(rawMessage)) {
    const joined = rawMessage
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .join(" ");
    if (joined) return { code, message: joined };
  }
  return { code, message: fallbackMessage };
}

/**
 * 서버 측 OpenAI 창작 도우미 상태를 확인한다.
 * API 키 값은 절대 브라우저로 내려오지 않으며 configured 여부와 한도 정보만 조회한다.
 */
export async function fetchStudioOpenAiAssistStatus(options: {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
} = {}): Promise<StudioOpenAiAssistStatus> {
  const baseUrl = (options.baseUrl ?? "/api/studio-ai/openai-assist").replace(/\/$/u, "");
  const fetchFn = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) return createOfflineOpenAiStatusFallback();

  try {
    const response = await fetchFn(`${baseUrl}/status`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
      signal: options.signal,
    });
    if (!response.ok) return createOfflineOpenAiStatusFallback();
    const json = (await response.json()) as Partial<StudioOpenAiAssistStatus>;
    if (typeof json.configured !== "boolean") return createOfflineOpenAiStatusFallback();
    return {
      configured: json.configured,
      provider: "openai",
      model: typeof json.model === "string" ? json.model : "gpt-4o-mini",
      keyLocation: "server-env-only",
      storeData: false,
      piiMasking: true,
      // 키 설정 상태만으로 계정의 잔액·자동 충전·후불 과금 여부를 판정하지 않는다.
      autoBillingDisabled: null,
      modelConfigurationError: json.modelConfigurationError === "retired" ? "retired" : null,
      modes: (() => {
        if (!Array.isArray(json.modes) || json.modes.length === 0) {
          return DEFAULT_STUDIO_OPENAI_MODES;
        }
        const valid = json.modes.filter(
          (item): item is StudioOpenAiModeDescriptor =>
            Boolean(item) &&
            typeof item === "object" &&
            isStudioOpenAiAssistMode((item as { id?: unknown }).id) &&
            typeof (item as { labelKo?: unknown }).labelKo === "string",
        );
        return valid.length > 0 ? valid : DEFAULT_STUDIO_OPENAI_MODES;
      })(),
      limits: json.limits ?? {
        burstPerMinute: 5,
        hourlyRequests: 20,
        dailyRequests: 60,
        maxInputChars: 6_000,
      },
      setupNoticeKo:
        typeof json.setupNoticeKo === "string" && json.setupNoticeKo.trim()
          ? json.setupNoticeKo
          : createOfflineOpenAiStatusFallback().setupNoticeKo,
    };
  } catch {
    return createOfflineOpenAiStatusFallback();
  }
}

/**
 * 서버 전용 OpenAI API 엔드포인트를 호출해 창작 보조 결과를 받아 온다.
 * 브라우저는 OpenAI API를 직접 호출하지 않으며, 서버가 키 보호·개인정보 마스킹·사용량 제한을 맡는다.
 */
export async function runStudioOpenAiCreativeAssist(
  input: StudioOpenAiCreativeAssistInput,
  options: {
    readonly baseUrl?: string;
    readonly fetchImpl?: typeof fetch;
    readonly signal?: AbortSignal;
    readonly sessionToken?: string | null;
    readonly timeoutMs?: number;
  } = {},
): Promise<StudioOpenAiAssistCallResult> {
  const trimmed = input.inputText.trim();
  if (trimmed.length < 2) {
    return {
      ok: false,
      status: 400,
      code: "INPUT_TOO_SHORT",
      message: "도우미에게 전달할 아이디어나 대본을 두 글자 이상 입력해 주세요.",
    };
  }
  if (trimmed.length > 6_000) {
    return {
      ok: false,
      status: 400,
      code: "INPUT_TOO_LONG",
      message: "한 번에 6,000자까지 보낼 수 있어요. 장면을 나누어 입력해 주세요.",
    };
  }

  const baseUrl = (options.baseUrl ?? "/api/studio-ai/openai-assist").replace(/\/$/u, "");
  const fetchFn = options.fetchImpl ?? globalThis.fetch?.bind(globalThis);
  if (!fetchFn) {
    return {
      ok: false,
      status: 0,
      code: "FETCH_UNAVAILABLE",
      message: "현재 환경에서 서버 요청을 보낼 수 없어요.",
    };
  }

  const sessionToken =
    options.sessionToken?.trim() || useApp.getState().sessionToken?.trim() || null;

  const controller = new AbortController();
  let timedOut = false;
  const onExternalAbort = () => {
    if (!controller.signal.aborted) controller.abort();
  };
  options.signal?.addEventListener("abort", onExternalAbort, { once: true });
  if (options.signal?.aborted) onExternalAbort();
  const timeoutMs = options.timeoutMs ?? 65_000;
  const timer = setTimeout(() => {
    timedOut = true;
    if (!controller.signal.aborted) controller.abort();
  }, timeoutMs);

  let responseStatus: number | undefined;
  try {
    if (options.signal?.aborted) {
      return { ok: false, status: 499, code: "CLIENT_ABORTED", message: "요청을 취소했어요." };
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (sessionToken) headers["x-user-id"] = sessionToken;

    const response = await fetchFn(
      baseUrl,
      withCsrfProtection({
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          mode: input.mode,
          inputText: trimmed,
          ...(input.projectTitle?.trim() ? { projectTitle: input.projectTitle.trim().slice(0, 120) } : {}),
          ...(input.genreOrTone?.trim() ? { genreOrTone: input.genreOrTone.trim().slice(0, 80) } : {}),
          ...(input.targetPlatform ? { targetPlatform: input.targetPlatform } : {}),
        }),
        signal: controller.signal,
      }),
    );
    responseStatus = response.status;

    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      return {
        ok: false,
        status: response.status,
        code: "PARSE_ERROR",
        message: "서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.",
      };
    }

    if (!response.ok) {
      const details = extractErrorDetails(
        body,
        `요청을 처리하지 못했어요 (상태 코드 ${response.status}). 잠시 후 다시 시도해 주세요.`,
      );
      return {
        ok: false,
        status: response.status,
        code: details.code,
        message: details.message,
      };
    }

    if (!isValidStudioOpenAiAssistSuccess(body) || body.result.mode !== input.mode) {
      return {
        ok: false,
        status: 502,
        code: "INVALID_SERVER_PAYLOAD",
        message: "도우미 응답 형식이 올바르지 않아요. 다시 한 번 눌러 주세요.",
      };
    }

    return {
      ok: true,
      data: body,
    };
  } catch {
    if (timedOut) {
      return {
        ok: false,
        status: 504,
        code: "CLIENT_TIMEOUT",
        message: "응답 시간이 길어 요청을 중단했어요. 입력 내용을 조금 줄여 다시 시도해 주세요.",
      };
    }
    if (options.signal?.aborted) {
      return {
        ok: false,
        status: 499,
        code: "CLIENT_ABORTED",
        message: "요청을 취소했어요.",
      };
    }
    if (responseStatus !== undefined) {
      return {
        ok: false,
        status: responseStatus,
        code: "PARSE_ERROR",
        message: "서버 응답을 읽지 못했어요. 잠시 후 다시 시도해 주세요.",
      };
    }
    return {
      ok: false,
      status: 0,
      code: "NETWORK_ERROR",
      message: "창작 도우미 서버에 연결하지 못했어요. 잠시 후 다시 시도하거나 편집기 도우미를 이용해 주세요.",
    };
  } finally {
    // 헤더 수신 뒤 본문을 읽는 동안에도 취소와 타임아웃을 유지한다.
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onExternalAbort);
  }
}
