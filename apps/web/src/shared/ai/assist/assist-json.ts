/**
 * 모델 답에서 구조화 출력(JSON)을 꺼내고, 형식이 어긋난 이유를 사람이 읽을 수 있는 줄로 정리한다.
 *
 * 관리형 경로(ToonStudio AI)는 운영 고성능 모델이 바쁘거나 예산을 다 쓰면 무료 모델로 이어 처리한다.
 * 무료 모델은 JSON 앞뒤에 설명을 붙이거나 코드 펜스로 감싸 오는 일이 잦아, 첫 번째로 완결된 JSON 객체를
 * 찾아 쓴다. 꺼낸 값은 호출 쪽이 같은 Zod 스키마로 다시 검증한다(이 모듈은 값을 고치지 않는다).
 */
import type { z } from "zod";

type ParseAttempt = { readonly ok: true; readonly value: unknown } | { readonly ok: false };

/** 앞뒤 설명에 `{`가 아주 많아도 탐색이 길어지지 않게 시도하는 후보 수의 상한. */
const MAX_CANDIDATE_ATTEMPTS = 64;

function tryParse(text: string): ParseAttempt {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** `start`의 `{`와 짝이 맞는 `}`의 위치. 문자열 안의 괄호·이스케이프는 세지 않는다. 짝이 없으면 -1. */
function matchingBrace(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === "\"") inString = false;
      continue;
    }
    if (char === "\"") inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

/**
 * 답 전체가 JSON이면 그대로, 아니면 코드 펜스 안이나 앞뒤 설명 사이의 첫 번째 완결된 JSON 객체를 돌려준다.
 * 찾지 못하면 `undefined`.
 */
export function extractJsonCandidate(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const whole = tryParse(trimmed);
  if (whole.ok) return whole.value;
  const fenced = /```(?:json)?[^\S\n]*\n([\s\S]*?)\n?[^\S\n]*```/iu.exec(trimmed)?.[1];
  if (fenced) {
    const inner = tryParse(fenced.trim());
    if (inner.ok) return inner.value;
  }
  // 바깥 객체 단위로 찾는다: 짝이 맞는 블록이 JSON이 아니면 그 안의 중첩 객체를 고르지 않고 블록 뒤에서 다시 찾는다
  // (바깥 문법이 틀린 답에서 안쪽 객체를 골라 엉뚱한 형식 진단을 붙이지 않게). 짝이 없는 `{`는 건너뛴다.
  let attempts = 0;
  for (let start = trimmed.indexOf("{"); start >= 0 && attempts < MAX_CANDIDATE_ATTEMPTS; attempts += 1) {
    const end = matchingBrace(trimmed, start);
    if (end < 0) {
      start = trimmed.indexOf("{", start + 1);
      continue;
    }
    const sliced = tryParse(trimmed.slice(start, end + 1));
    if (sliced.ok) return sliced.value;
    start = trimmed.indexOf("{", end + 1);
  }
  return undefined;
}

/** Zod 검증 문제를 "경로: 이유" 줄로 정리한다. 형식 복구 요청에 붙인다. */
export function describeSchemaIssues(error: z.ZodError, limit = 8): readonly string[] {
  const lines = error.issues.slice(0, limit).map((issue) => {
    const where = issue.path.length > 0 ? issue.path.map(String).join(".") : "(최상위)";
    return `${where}: ${issue.message}`;
  });
  if (error.issues.length > limit) lines.push(`그 밖에 ${error.issues.length - limit}건`);
  return lines;
}
