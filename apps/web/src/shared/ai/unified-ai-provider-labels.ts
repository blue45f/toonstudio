import type { UserAiServerProviderId } from "./user-ai-types";

/**
 * 서버 무료 AI 풀 공급자 id → 화면 표시 이름. 풀 상태 응답에 라벨이 없거나 아직 준비되지
 * 않았을 때 순서 목록에 쓰는 이름이다.
 * (2026-10-09 파일 크기 래칫 해소로 UnifiedAiSettings에서 추출 — 동작 변경 없음.)
 */
export const SERVER_PROVIDER_LABELS: Readonly<Record<UserAiServerProviderId, string>> = Object.freeze({
  gemini: "Google Gemini",
  qwen: "Qwen",
  groq: "Groq",
  sambanova: "SambaNova",
  zai: "Z.AI",
  mistral: "Mistral",
  cloudflare: "Cloudflare AI",
  openrouter: "OpenRouter",
  siliconflow: "SiliconFlow",
});
