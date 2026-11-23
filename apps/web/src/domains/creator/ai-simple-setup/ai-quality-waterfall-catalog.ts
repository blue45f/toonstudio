/**
 * 초보자용 AI 설정 초단순화 · 작업별 스마트 기본값 및 BYOK 공급자 3초 발급 가이드 카탈로그.
 */

export type AiWaterfallTierId =
  | "tier-1-gemini-free"
  | "tier-2-openrouter-free"
  | "tier-3-user-byok"
  | "tier-4-local-offline";

export type AiTierAvailabilityStatus =
  | "ready"
  | "low"
  | "exhausted"
  | "user-key-required";

export type AiTaskCategory =
  | "story-dialogue"
  | "vision-reference"
  | "code-script"
  | "fast-assist";

export type UserByokProviderId =
  | "gemini"
  | "openrouter"
  | "openai"
  | "anthropic"
  | "ollama";

export type AiSignalTone = "good" | "warn" | "bad" | "cool";

export interface AiTaskSmartDefault {
  readonly category: AiTaskCategory;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly tier1GeminiModel: string;
  readonly tier2OpenRouterModel: string;
  readonly tier4LocalModel: string;
  readonly defaultTemperature: number;
  readonly defaultMaxOutputTokens: number;
  readonly defaultSystemPromptNote: string;
}

export interface UserByokProviderGuide {
  readonly id: UserByokProviderId;
  readonly labelKo: string;
  readonly freeTierBadgeKo: string;
  readonly hasFreeTier: boolean;
  readonly requiresEndpointUrl: boolean;
  readonly signupUrl: string;
  readonly signupHostLabel: string;
  readonly defaultModel: string;
  readonly keyFormatHintKo: string;
  readonly stepsKo: readonly [string, string, string];
}

export const AI_FREE_LOW_THRESHOLD_RATIO = 0.2;
export const AI_DEFAULT_TIER1_FREE_TOKENS = 120_000;
export const AI_DEFAULT_TIER2_FREE_TOKENS = 80_000;

export const AI_TASK_SMART_DEFAULTS: Readonly<Record<AiTaskCategory, AiTaskSmartDefault>> = Object.freeze({
  "story-dialogue": Object.freeze({
    category: "story-dialogue",
    labelKo: "스토리 · 대사 · 연출",
    summaryKo: "웹툰 회차 비트, 말풍선 대사 다듬기, 컷 호흡 제안에 맞춘 기본값입니다.",
    tier1GeminiModel: "gemini-2.5-pro",
    tier2OpenRouterModel: "deepseek/deepseek-r1:free",
    tier4LocalModel: "onnx-webgpu-story-assist-v1",
    defaultTemperature: 0.72,
    defaultMaxOutputTokens: 2048,
    defaultSystemPromptNote: "자연스러운 구어체 웹툰 대사와 컷 연출 위주로 간결하게 답하세요.",
  }),
  "vision-reference": Object.freeze({
    category: "vision-reference",
    labelKo: "이미지 · 구도 · 색감 분석",
    summaryKo: "스케치 구도 점검, 광원·채색 팔레트 추출, 3D 카메라 각도 제안에 맞춥니다.",
    tier1GeminiModel: "gemini-2.5-pro",
    tier2OpenRouterModel: "meta-llama/llama-4-maverick:free",
    tier4LocalModel: "webgpu-vision-palette-local-v1",
    defaultTemperature: 0.35,
    defaultMaxOutputTokens: 1536,
    defaultSystemPromptNote: "시선 흐름, 명도 대비, 광원 방향을 구체적 수치와 함께 짚어 주세요.",
  }),
  "code-script": Object.freeze({
    category: "code-script",
    labelKo: "자동화 스크립트 · 3D 스펙",
    summaryKo: "브러시 액션, 3D 파라메트릭 스펙, 검수 규칙 생성을 정확하게 처리합니다.",
    tier1GeminiModel: "gemini-2.5-pro",
    tier2OpenRouterModel: "qwen/qwen3-coder:free",
    tier4LocalModel: "onnx-procedural-spec-local-v1",
    defaultTemperature: 0.2,
    defaultMaxOutputTokens: 3072,
    defaultSystemPromptNote: "정확한 수치와 구조화된 출력 형식을 우선해 생성하세요.",
  }),
  "fast-assist": Object.freeze({
    category: "fast-assist",
    labelKo: "빠른 오탈자 · 제목 보조",
    summaryKo: "말풍선 오탈자 확인, 해시태그, 짧은 요약처럼 응답 속도가 중요한 작업용입니다.",
    tier1GeminiModel: "gemini-2.5-flash",
    tier2OpenRouterModel: "google/gemma-3-27b-it:free",
    tier4LocalModel: "onnx-fast-local-proofreader-v1",
    defaultTemperature: 0.3,
    defaultMaxOutputTokens: 1024,
    defaultSystemPromptNote: "원문 의도를 바꾸지 말고 필요한 수정점만 바로 보여 주세요.",
  }),
});

export const USER_BYOK_PROVIDER_GUIDES: readonly UserByokProviderGuide[] = Object.freeze([
  Object.freeze({
    id: "gemini",
    labelKo: "Google Gemini",
    freeTierBadgeKo: "무료 발급 가능",
    hasFreeTier: true,
    requiresEndpointUrl: false,
    signupUrl: "https://aistudio.google.com/apikey",
    signupHostLabel: "Google AI Studio",
    defaultModel: "gemini-2.5-pro",
    keyFormatHintKo: "Google AI Studio에서 발급한 개인 API 키를 붙여 넣으세요.",
    stepsKo: Object.freeze([
      "Google AI Studio에 로그인하고 'Create API key'를 누릅니다.",
      "생성된 키 옆 복사 버튼을 눌러 클립보드에 복사합니다.",
      "아래 입력칸에 붙여 넣고 '키 검증 후 바로 연결'을 누르면 끝입니다.",
    ] as const),
  }),
  Object.freeze({
    id: "openrouter",
    labelKo: "OpenRouter",
    freeTierBadgeKo: "무료 모델 다수",
    hasFreeTier: true,
    requiresEndpointUrl: false,
    signupUrl: "https://openrouter.ai/keys",
    signupHostLabel: "OpenRouter Keys",
    defaultModel: "qwen/qwen3-coder:free",
    keyFormatHintKo: "OpenRouter 계정에서 만든 개인 API 키를 입력하면 무료·고성능 모델을 함께 씁니다.",
    stepsKo: Object.freeze([
      "OpenRouter에 로그인해 Keys 메뉴로 이동합니다.",
      "'Create Key'로 새 키를 만들고 값을 복사합니다.",
      "아래 입력칸에 붙여 넣으면 코딩·비전·텍스트 무료 라우터가 바로 열립니다.",
    ] as const),
  }),
  Object.freeze({
    id: "openai",
    labelKo: "OpenAI",
    freeTierBadgeKo: "개인 키 연결",
    hasFreeTier: false,
    requiresEndpointUrl: false,
    signupUrl: "https://platform.openai.com/api-keys",
    signupHostLabel: "OpenAI Platform",
    defaultModel: "gpt-4.1",
    keyFormatHintKo: "OpenAI Platform에서 생성한 개인 API 키를 입력하세요.",
    stepsKo: Object.freeze([
      "OpenAI Platform의 API keys 화면을 엽니다.",
      "'Create new secret key'로 키를 발급받아 복사합니다.",
      "아래 칸에 붙여 넣으면 상위 보안 설정으로 위임해 연결합니다.",
    ] as const),
  }),
  Object.freeze({
    id: "anthropic",
    labelKo: "Anthropic",
    freeTierBadgeKo: "개인 키 연결",
    hasFreeTier: false,
    requiresEndpointUrl: false,
    signupUrl: "https://console.anthropic.com/settings/keys",
    signupHostLabel: "Anthropic Console",
    defaultModel: "claude-sonnet-4-5",
    keyFormatHintKo: "Anthropic Console에서 발급한 개인 API 키를 입력하세요.",
    stepsKo: Object.freeze([
      "Anthropic Console의 API Keys 메뉴로 들어갑니다.",
      "'Create Key'로 새 키를 만들고 클립보드에 복사합니다.",
      "아래 입력칸에 붙여 넣으면 메모리/보안 설정 위임 방식으로 연결됩니다.",
    ] as const),
  }),
  Object.freeze({
    id: "ollama",
    labelKo: "Local Ollama",
    freeTierBadgeKo: "내 PC ₩0 실행",
    hasFreeTier: true,
    requiresEndpointUrl: true,
    signupUrl: "https://ollama.com/download",
    signupHostLabel: "Ollama 공식 앱",
    defaultModel: "qwen2.5:14b",
    keyFormatHintKo: "외부 API 키 없이 내 PC의 로컬 주소(예: http://127.0.0.1:11434)를 입력합니다.",
    stepsKo: Object.freeze([
      "내 컴퓨터에 Ollama를 설치하고 원하는 모델을 받습니다.",
      "로컬 서버 주소(기본 http://127.0.0.1:11434)가 실행 중인지 확인합니다.",
      "아래 주소칸을 확인하고 연결을 누르면 외부 전송 없이 바로 작동합니다.",
    ] as const),
  }),
]);

export function getUserByokProviderGuide(providerId: UserByokProviderId): UserByokProviderGuide {
  return USER_BYOK_PROVIDER_GUIDES.find((guide) => guide.id === providerId) ?? USER_BYOK_PROVIDER_GUIDES[0]!;
}
