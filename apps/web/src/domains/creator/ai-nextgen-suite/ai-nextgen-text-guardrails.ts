import {
  redactCreatorSensitiveText,
  type RedactedCreatorText,
} from "@toonstudio/contracts/studio-pii-redactor";

/**
 * 차세대 창작 AI 스위트 공용 개인정보 재점검·한국어 번역투 배제·JSON 정제 유틸리티.
 * 모든 문자열 탐색과 코드 펜스 제거는 무한 역추적 정규식 없이 선형 시간(`O(n)`)으로 동작한다.
 */

const WORD_SHIELD_SENTINEL = "\uE000";

const SAFE_LATIN_WORD_PATTERN =
  /(?<![@\w.-])(?!(?:sk-|ghp_|github_pat_|AIza|xox[baprs]-))[A-Za-z]{1,24}(?:-[A-Za-z]{1,24}){0,2}(?![@\w.-])/gu;

const LABELED_HANDLE_UNSHIELD_PATTERN =
  /((?:카카오톡|카톡|인스타그램|인스타|Instagram|IG|텔레그램|Telegram|라인|LINE|트위터|스레드|Threads)(?:[ \t]?(?:아이디|ID|계정|핸들))?(?:[ \t]{0,2}[:：][ \t]{0,2}|[ \t]{1,3}))([^\s,)"'<>]{2,34})/giu;

/**
 * `@toonstudio/contracts/studio-pii-redactor`를 호출하되, 일반 영어 단어(`high-angle`, `lighting`,
 * `nightmare` 등) 내부 철자 `ig`/`line`이 SNS 라벨(`IG`/`LINE`)로 오탐되는 경우만 정밀 보호한다.
 */
export function redactNextGenSensitiveText(raw: string): RedactedCreatorText {
  if (!raw) return { sanitizedText: raw, redactedCount: 0 };

  const cleanedInput = raw.includes(WORD_SHIELD_SENTINEL)
    ? raw.split(WORD_SHIELD_SENTINEL).join("")
    : raw;

  const shielded = cleanedInput.replace(SAFE_LATIN_WORD_PATTERN, (word) => {
    const lower = word.toLowerCase();
    if (
      lower === "ig" ||
      lower === "line" ||
      lower === "instagram" ||
      lower === "telegram" ||
      lower === "threads"
    ) {
      return word;
    }
    if (!lower.includes("ig") && !lower.includes("line")) return word;
    return word
      .replace(/ig/giu, (m) => `${m[0]}${WORD_SHIELD_SENTINEL}${m[1]}`)
      .replace(/line/giu, (m) => `${m.slice(0, 2)}${WORD_SHIELD_SENTINEL}${m.slice(2)}`);
  });

  const restoredHandles = shielded.replace(
    LABELED_HANDLE_UNSHIELD_PATTERN,
    (_match, prefix: string, handle: string) =>
      `${prefix}${handle.split(WORD_SHIELD_SENTINEL).join("")}`,
  );

  const redacted = redactCreatorSensitiveText(restoredHandles);
  return {
    sanitizedText: redacted.sanitizedText.split(WORD_SHIELD_SENTINEL).join(""),
    redactedCount: redacted.redactedCount,
  };
}

export interface TranslationeseRule {
  readonly label: string;
  readonly needle: string;
  readonly replacement: string;
}

export const KOREAN_TRANSLATIONESE_RULES: readonly TranslationeseRule[] = Object.freeze([
  { label: "하는 것을 가능하게", needle: "하는 것을 가능하게 합니다", replacement: "하도록 돕습니다" },
  { label: "하는 것이 가능합", needle: "하는 것이 가능합니다", replacement: "할 수 있습니다" },
  { label: "직관적인 경험을 제공", needle: "직관적인 경험을 제공합니다", replacement: "한눈에 흐름이 잡힙니다" },
  { label: "원활한 워크플로우를 보장", needle: "원활한 워크플로우를 보장합니다", replacement: "작업 흐름이 끊기지 않습니다" },
  { label: "극대화하는 데 기여", needle: "극대화하는 데 기여합니다", replacement: "끌어올립니다" },
  { label: "에 있어서", needle: "에 있어서 ", replacement: "에서 " },
  { label: "의 경우에는", needle: "의 경우에는 ", replacement: "에는 " },
  { label: "하는 바입니다", needle: "하는 바입니다", replacement: "합니다" },
  { label: "되어지고 있", needle: "되어지고 있", replacement: "되고 있" },
  { label: "가지고 있습니다", needle: "특징을 가지고 있습니다", replacement: "특징이 드러납니다" },
]);

function countSubstringOccurrences(haystack: string, needle: string): number {
  if (!needle || !haystack) return 0;
  let count = 0;
  let cursor = 0;
  while (cursor <= haystack.length - needle.length) {
    const found = haystack.indexOf(needle, cursor);
    if (found < 0) break;
    count += 1;
    cursor = found + needle.length;
  }
  return count;
}

/**
 * 한국어 문장 안의 번역투 구문과 과도한 `및`/`통해` 연쇄를 선형 시간(`O(n)`)으로 검출한다.
 */
export function detectKoreanTranslationese(text: string): readonly string[] {
  if (!text) return [];
  const hits: string[] = [];
  for (const rule of KOREAN_TRANSLATIONESE_RULES) {
    if (text.includes(rule.needle)) {
      hits.push(rule.label);
    }
  }
  const clauses = text.split(/[.!?\r\n]/u);
  for (const clause of clauses) {
    if (countSubstringOccurrences(clause, "통해") >= 3 && !hits.includes("통해 과다 연쇄")) {
      hits.push("통해 과다 연쇄");
    }
    if (countSubstringOccurrences(clause, " 및 ") >= 3 && !hits.includes("및 과다 연쇄")) {
      hits.push("및 과다 연쇄");
    }
  }
  return hits;
}

/**
 * 출력 문자열에 남은 어색한 번역투 표현을 자연스러운 한국어 표현으로 다듬는다.
 */
export function polishKoreanTranslationese(text: string): string {
  if (!text) return text;
  let result = text;
  for (const rule of KOREAN_TRANSLATIONESE_RULES) {
    if (result.includes(rule.needle)) {
      result = result.split(rule.needle).join(rule.replacement);
    }
  }
  return result;
}

/**
 * 임의 구조의 입력·출력 값에서 문자열 리프를 순회하며 PII 마스킹 및 선택적 한국어 다듬기를 적용한다.
 */
export function sanitizeValueStringsDeep<T>(
  value: T,
  options: { readonly polishKorean?: boolean } = {},
  maxDepth = 12,
): { readonly sanitized: T; readonly redactedCount: number } {
  let redactedCount = 0;

  const visit = (node: unknown, depth: number): unknown => {
    if (depth > maxDepth) throw new RangeError("입력 구조의 깊이 제한을 초과했습니다.");
    if (node === null || node === undefined) {
      return node;
    }
    if (typeof node === "string") {
      const pii = redactNextGenSensitiveText(node);
      redactedCount += pii.redactedCount;
      return options.polishKorean
        ? polishKoreanTranslationese(pii.sanitizedText)
        : pii.sanitizedText;
    }
    if (Array.isArray(node)) {
      return node.map((item) => visit(item, depth + 1));
    }
    if (typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([key, entry]) => [key, visit(entry, depth + 1)]),
      );
    }
    return node;
  };

  return {
    sanitized: visit(value, 0) as T,
    redactedCount,
  };
}

/**
 * 마크다운 코드 펜스나 앞뒤 안내 문구가 섞인 LLM 응답에서 순수 JSON 본문만 선형 시간(`O(n)`)에 추출한다.
 */
export function extractJsonBodySafely(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      JSON.parse(trimmed);
      return trimmed;
    } catch {
      // 코드 펜스 또는 후행 문구가 붙은 경우 아래 경계 추출로 진행한다.
    }
  }
  const fenceStart = trimmed.indexOf("```");
  const firstBrace = trimmed.indexOf("{");
  if (fenceStart >= 0 && (firstBrace < 0 || fenceStart < firstBrace)) {
    const afterFence = trimmed.slice(fenceStart + 3);
    const newlineIdx = afterFence.indexOf("\n");
    const bodyStart = newlineIdx >= 0 ? fenceStart + 3 + newlineIdx + 1 : fenceStart + 3;
    const fenceEnd = trimmed.lastIndexOf("```");
    if (fenceEnd > bodyStart) {
      return trimmed.slice(bodyStart, fenceEnd).trim();
    }
  }
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1).trim();
  }
  return trimmed;
}

/**
 * OpenAI Strict JSON Schema에서 `additionalProperties`를 제거해 Gemini `responseSchema` 호환 트리로 변환한다.
 */
export function toGeminiResponseSchema(
  schemaNode: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const converted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schemaNode)) {
    if (key === "additionalProperties") continue;
    if (key === "properties" && value && typeof value === "object" && !Array.isArray(value)) {
      const nextProps: Record<string, unknown> = {};
      for (const [propKey, propSchema] of Object.entries(value as Record<string, unknown>)) {
        if (propSchema && typeof propSchema === "object" && !Array.isArray(propSchema)) {
          nextProps[propKey] = toGeminiResponseSchema(propSchema as Record<string, unknown>);
        } else {
          nextProps[propKey] = propSchema;
        }
      }
      converted.properties = nextProps;
      continue;
    }
    if (key === "items" && value && typeof value === "object" && !Array.isArray(value)) {
      converted.items = toGeminiResponseSchema(value as Record<string, unknown>);
      continue;
    }
    converted[key] = value;
  }
  return converted;
}
