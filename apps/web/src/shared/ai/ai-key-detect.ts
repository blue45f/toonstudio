/**
 * 붙여 넣은 API 키의 **형식만** 보고 어느 AI 서비스의 키인지 가늠한다.
 *
 * - 네트워크를 쓰지 않고 키를 저장·기록하지 않는다. 판정 결과에는 키를 담지 않는다(키는 호출자만 가진다).
 * - 접두사가 공식적으로 고유한 키(예: `sk-ant-`, `gsk_`, `AIza`)는 하나로 확정하고,
 *   형식이 겹치는 키는 가능성이 높은 순서로 후보를 여러 개 돌려줘 사용자가 고르게 한다.
 * - 판정은 등록을 쉽게 하려는 추정일 뿐이다. 실제 유효성은 등록할 때 공급자의 모델 목록 호출로 확인한다.
 */

export type AiKeyProviderId =
  | "anthropic"
  | "openai"
  | "gemini"
  | "groq"
  | "openrouter"
  | "cerebras"
  | "huggingface"
  | "github"
  | "mistral"
  | "sambanova"
  | "zai"
  | "siliconflow"
  | "deepseek"
  | "xai"
  | "fal";

/** 사용자 비용: free = 공급자 무료 범위, paid = 내 계정에 청구될 수 있음. */
export type AiKeyCost = "free" | "paid";

export interface AiKeyProvider {
  readonly id: AiKeyProviderId;
  /** 화면에 보이는 서비스 이름(고유명사라 번역하지 않는다). */
  readonly name: string;
  readonly cost: AiKeyCost;
  /** 이 키로 쓰는 기능. 이미지 키(fal)는 AI 설정이 아니라 연동 키 화면에서 등록한다. */
  readonly capability: "text" | "image";
  /** 키를 만드는 공식 페이지. */
  readonly keyPageUrl: string;
}

export const AI_KEY_PROVIDERS: Readonly<Record<AiKeyProviderId, AiKeyProvider>> = Object.freeze({
  anthropic: { id: "anthropic", name: "Claude", cost: "paid", capability: "text", keyPageUrl: "https://console.anthropic.com/settings/keys" },
  openai: { id: "openai", name: "OpenAI", cost: "paid", capability: "text", keyPageUrl: "https://platform.openai.com/api-keys" },
  gemini: { id: "gemini", name: "Google Gemini", cost: "free", capability: "text", keyPageUrl: "https://aistudio.google.com/apikey" },
  groq: { id: "groq", name: "Groq", cost: "free", capability: "text", keyPageUrl: "https://console.groq.com/keys" },
  openrouter: { id: "openrouter", name: "OpenRouter", cost: "free", capability: "text", keyPageUrl: "https://openrouter.ai/settings/keys" },
  cerebras: { id: "cerebras", name: "Cerebras", cost: "free", capability: "text", keyPageUrl: "https://cloud.cerebras.ai/platform" },
  huggingface: { id: "huggingface", name: "Hugging Face", cost: "free", capability: "text", keyPageUrl: "https://huggingface.co/settings/tokens" },
  github: { id: "github", name: "GitHub Models", cost: "free", capability: "text", keyPageUrl: "https://github.com/settings/personal-access-tokens" },
  mistral: { id: "mistral", name: "Mistral", cost: "free", capability: "text", keyPageUrl: "https://console.mistral.ai/api-keys" },
  sambanova: { id: "sambanova", name: "SambaNova", cost: "free", capability: "text", keyPageUrl: "https://cloud.sambanova.ai/apis" },
  zai: { id: "zai", name: "Z.AI", cost: "free", capability: "text", keyPageUrl: "https://z.ai/manage-apikey/apikey-list" },
  siliconflow: { id: "siliconflow", name: "SiliconFlow", cost: "free", capability: "text", keyPageUrl: "https://cloud.siliconflow.cn/account/ak" },
  deepseek: { id: "deepseek", name: "DeepSeek", cost: "paid", capability: "text", keyPageUrl: "https://platform.deepseek.com/api_keys" },
  xai: { id: "xai", name: "xAI Grok", cost: "paid", capability: "text", keyPageUrl: "https://console.x.ai" },
  fal: { id: "fal", name: "fal.ai", cost: "paid", capability: "image", keyPageUrl: "https://fal.ai/dashboard/keys" },
});

/** 키 형식을 몰라 사용자가 직접 고를 때 보여 줄 순서: 무료 → 유료, 많이 쓰는 순. */
export const AI_KEY_PROVIDER_PICK_ORDER: readonly AiKeyProviderId[] = Object.freeze([
  "gemini",
  "groq",
  "openrouter",
  "cerebras",
  "mistral",
  "huggingface",
  "github",
  "sambanova",
  "zai",
  "siliconflow",
  "anthropic",
  "openai",
  "deepseek",
  "xai",
]);

export interface AiKeyDetection {
  /** 가능성이 높은 순서. 비어 있으면 형식을 모른다(사용자가 고른다). */
  readonly candidates: readonly AiKeyProviderId[];
  /** 접두사가 고유해 하나로 확정했는지. */
  readonly exact: boolean;
}

const MIN_KEY_LENGTH = 16;
const MAX_KEY_LENGTH = 512;

interface Rule {
  readonly test: RegExp;
  readonly candidates: readonly AiKeyProviderId[];
  readonly exact: boolean;
}

// 순서가 중요하다: 더 구체적인 접두사(sk-ant-, sk-or-, sk-proj-)를 일반적인 sk- 보다 먼저 본다.
const RULES: readonly Rule[] = Object.freeze([
  { test: /^sk-ant-/u, candidates: ["anthropic"], exact: true },
  { test: /^sk-or-/u, candidates: ["openrouter"], exact: true },
  { test: /^sk-(?:proj|svcacct|admin)-/u, candidates: ["openai"], exact: true },
  { test: /^gsk_/u, candidates: ["groq"], exact: true },
  { test: /^AIza[0-9A-Za-z_-]{30,}$/u, candidates: ["gemini"], exact: true },
  { test: /^hf_/u, candidates: ["huggingface"], exact: true },
  { test: /^csk-/u, candidates: ["cerebras"], exact: true },
  { test: /^xai-/u, candidates: ["xai"], exact: true },
  { test: /^(?:github_pat_|ghp_)/u, candidates: ["github"], exact: true },
  { test: /^[0-9a-f]{32}\.[0-9A-Za-z]{16}$/u, candidates: ["zai"], exact: true },
  // fal 키는 "키 ID:비밀" 형식으로 알려져 있지만 공식 형식이 문서로 확정되지 않아 단정하지 않는다.
  { test: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{16,}$/iu, candidates: ["fal"], exact: false },
  { test: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu, candidates: ["sambanova"], exact: false },
  { test: /^sk-[0-9a-f]{32}$/u, candidates: ["deepseek", "openai"], exact: false },
  { test: /^sk-[a-z]{40,}$/u, candidates: ["siliconflow", "openai"], exact: false },
  { test: /^sk-[0-9A-Za-z_-]{20,}$/u, candidates: ["openai", "siliconflow", "deepseek"], exact: false },
  { test: /^[0-9A-Za-z]{32}$/u, candidates: ["mistral"], exact: false },
]);

/** 키 하나를 정리한다: 따옴표·`Bearer `를 벗긴다. 키로 볼 수 없는 길이·공백이면 빈 문자열. */
export function normalizePastedAiKey(raw: string): string {
  const value = raw.trim().replace(/^Bearer\s+/iu, "").replace(/^["'`]+|["'`,;]+$/gu, "").trim();
  if (value.length < MIN_KEY_LENGTH || value.length > MAX_KEY_LENGTH || /\s/u.test(value)) return "";
  return value;
}

// `OPENAI_API_KEY=sk-...`·`export GROQ_API_KEY="gsk_..."`처럼 환경 변수 줄을 통째로 붙여도 값만 쓴다.
// Windows의 `set NAME=값`·PowerShell `$env:NAME="값"`·JSON `"NAME": "값",`과 값 뒤의 ` # 메모`도 받는다.
// fal의 "키 ID:비밀"(UUID 형식)은 이름 규칙(문자로 시작, 하이픈 없음)에 걸리지 않는다.
const ENV_ASSIGNMENT = /^(?:export\s+|set\s+|\$env:)?["']?[A-Za-z_][A-Za-z0-9_]*["']?\s*[=:]\s*(\S+?)\s*(?:\s#.*)?$/iu;
// 공백으로 나눈 줄(예: `setx NAME 값`)에서 환경 변수 이름 자체는 키로 보지 않는다.
const ENV_NAME_TOKEN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/u;

/** 여러 키를 한 번에 붙여 넣은 글을 키 목록으로 나눈다(줄바꿈·공백·쉼표 구분, 환경 변수 줄은 값만, 중복 제거). */
export function splitPastedAiKeys(raw: string): string[] {
  const keys: string[] = [];
  for (const line of raw.split(/\r?\n/u)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const assignment = ENV_ASSIGNMENT.exec(trimmed);
    const tokens = assignment ? [assignment[1]!] : trimmed.split(/[\s,;]+/u);
    for (const token of tokens) {
      const key = normalizePastedAiKey(token);
      if (key && !ENV_NAME_TOKEN.test(key)) keys.push(key);
    }
  }
  return [...new Set(keys)];
}

export function detectAiKeyProvider(key: string): AiKeyDetection {
  const value = normalizePastedAiKey(key);
  if (!value) return { candidates: [], exact: false };
  const rule = RULES.find((item) => item.test.test(value));
  return rule ? { candidates: rule.candidates, exact: rule.exact } : { candidates: [], exact: false };
}

/** 화면에 키를 보여 줄 때 쓰는 가림 표기(앞 4자·끝 4자만). */
export function maskAiKey(key: string): string {
  const value = key.trim();
  if (value.length <= 12) return "••••";
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
