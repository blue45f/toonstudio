import {
  materialRefinePrompt,
  parseRefinedMaterialSentence,
} from "@/domains/creator-resources/material-hub/material-hub-refine";

/**
 * 문장 허브의 "AI로 다듬기" — 기존 무료 풀 AI(/api/studio-ai/chat)를 쓴다.
 * - 사용자가 버튼을 누른 때에만 호출된다(마운트·입력·제출에서는 부르지 않는다).
 * - 무료 풀 클라이언트는 도메인 경계(creator-resources → creator)를 넘으므로 앱 계층에서 주입하고,
 *   번들 예산을 위해 누를 때 처음 내려받는다.
 * - 실패(로그인 필요·한도 소진·형식 오류)는 모두 null 이고, 허브는 규칙 기반 해석을 그대로 둔다.
 *   네트워크 예외는 그대로 던지며, 호출한 허브가 조용히 규칙 기반 해석을 유지한다.
 */
export async function refineMaterialSentenceWithFreeAi(sentence: string, signal: AbortSignal): Promise<string | null> {
  const { completeAutomaticFreeText } = await import("@/domains/creator/studio-server-ai-client");
  const prompt = materialRefinePrompt(sentence);
  const result = await completeAutomaticFreeText(prompt.system, prompt.user, signal);
  return result.ok ? parseRefinedMaterialSentence(result.data.content, sentence) : null;
}
