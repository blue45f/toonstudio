import { normalizeMaterialIntentInput, planMaterialIntent } from "@toonstudio/core/material-intent-plan";

/**
 * "AI로 다듬기"의 프롬프트와 응답 정리. 순수 함수만 있고 네트워크는 부르지 않는다.
 * 실제 호출(무료 풀 AI)은 도메인 경계를 넘으므로 앱 계층(app/routes)이 주입하고, 사용자가 버튼을 눌렀을 때만 일어난다.
 */

export interface MaterialRefinePrompt {
  readonly system: string;
  readonly user: string;
}

const SYSTEM_PROMPT = [
  "당신은 웹툰 작가의 소재 검색을 돕는 편집자입니다.",
  "사용자가 적은 장면·소재 설명을 검색에 쓸 한국어 문장 하나로 다듬어 주세요.",
  "규칙:",
  "- 장소, 사물, 날씨, 시간대, 계절, 시대, 복식, 인물 자세, 한국 지명처럼 검색에 쓸 단서만 남깁니다.",
  "- 새로운 사실, 고유명사, 작품명, 인물 이름을 지어내지 않습니다.",
  "- 비유와 줄임말은 흔한 낱말로 풀어 씁니다.",
  "- 80자 이내의 문장 하나만 출력합니다. 설명, 따옴표, 번호, 마크다운은 쓰지 않습니다.",
  "예) 비 와서 으스스한 동네 뒷길 → 비 오는 골목 밤 풍경",
].join("\n");

export function materialRefinePrompt(sentence: string): MaterialRefinePrompt {
  return { system: SYSTEM_PROMPT, user: normalizeMaterialIntentInput(sentence).text };
}

const LEADING_MARKS = /^(?:[-*>#]+|\d+[.)])\s*/u;
const LABEL_PREFIX = /^(?:문장|결과|답변?|출력|output|sentence)\s*[:：]\s*/iu;
const WRAPPING_QUOTES = /^["'“”‘’`「『]+|["'“”‘’`」』]+$/gu;

/**
 * AI 응답에서 다듬은 문장 하나를 꺼낸다. 쓸 수 없으면 null 이고, 호출한 쪽은 규칙 기반 해석을 그대로 둔다.
 * 쓸 수 없는 경우: 빈 응답, 80자를 넘는 응답, 원문과 같은 응답, 계획기가 아무 단서도 못 읽는 응답.
 */
export function parseRefinedMaterialSentence(content: string, original: string): string | null {
  const firstLine = content.replace(/\r/gu, "").split("\n").map((line) => line.trim()).find((line) => line.length > 0);
  if (!firstLine) return null;
  const cleaned = firstLine.replace(LEADING_MARKS, "").replace(LABEL_PREFIX, "").replace(WRAPPING_QUOTES, "").trim();
  const normalized = normalizeMaterialIntentInput(cleaned);
  if (!normalized.text || normalized.truncated) return null;
  if (normalized.text === normalizeMaterialIntentInput(original).text) return null;
  if (planMaterialIntent(normalized.text).status === "empty") return null;
  return normalized.text;
}
