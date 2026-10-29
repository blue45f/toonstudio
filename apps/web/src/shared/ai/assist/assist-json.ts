/**
 * 모델 답에서 구조화 출력(JSON)을 꺼내고, 형식이 어긋난 이유를 사람이 읽을 수 있는 줄로 정리한다.
 *
 * 관리형 경로(ToonStudio AI)는 운영 고성능 모델이 바쁘거나 예산을 다 쓰면 무료 모델로 이어 처리한다.
 * 무료 모델은 JSON 앞뒤에 설명을 붙이거나 코드 펜스로 감싸 오는 일이 잦아, 답 속의 JSON 객체 후보를 모두 꺼내고
 * 호출 쪽이 같은 Zod 스키마로 차례로 검증해 처음 통과하는 것을 쓴다(이 모듈은 값을 고치지 않는다).
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

export interface JsonCandidate {
  readonly value: unknown;
  /**
   * 답 전체·코드 펜스·짝이 맞는 바깥 블록에서 꺼냈으면 true. 짝이 맞지 않는 `{` 뒤에서 찾은 객체면 false다.
   * 그런 객체는 설명 속 괄호 뒤의 진짜 답일 수도, 끝이 잘린 바깥 객체 안의 중첩 객체일 수도 있어서
   * 스키마를 통과할 때만 답으로 쓴다(형식 진단에는 쓰지 않는다).
   */
  readonly topLevel: boolean;
}

export interface JsonExtraction {
  /** 앞에서부터 찾은 순서의 후보. 호출 쪽이 스키마로 차례로 검사해 처음 통과하는 것을 쓴다. */
  readonly candidates: readonly JsonCandidate[];
  /** 바깥 블록의 JSON 문법 문제(JSON.parse 메시지). 바깥 후보가 없을 때 형식 진단으로 쓴다. */
  readonly syntaxIssue: string | null;
}

function parseError(text: string): string {
  try {
    JSON.parse(text);
    return "";
  } catch (error) {
    return error instanceof Error ? error.message.slice(0, 200) : "JSON 문법 오류";
  }
}

/**
 * 답에서 JSON 후보를 꺼낸다. 답 전체가 JSON이면 그것 하나, 아니면 코드 펜스 안과 앞뒤 설명 사이의 객체들이다.
 * 짝이 맞는 블록이 JSON이 아니면 그 안의 중첩 객체는 고르지 않고 블록 뒤에서 다시 찾는다(바깥 문법이 틀린 답의
 * 안쪽 객체로 엉뚱한 형식 진단을 붙이지 않게).
 */
export function extractJsonCandidates(text: string): JsonExtraction {
  const trimmed = text.trim();
  if (!trimmed) return { candidates: [], syntaxIssue: null };
  const whole = tryParse(trimmed);
  if (whole.ok) return { candidates: [{ value: whole.value, topLevel: true }], syntaxIssue: null };
  const candidates: JsonCandidate[] = [];
  let syntaxIssue: string | null = null;
  const fenced = /```(?:json)?[^\S\n]*\n([\s\S]*?)\n?[^\S\n]*```/iu.exec(trimmed)?.[1];
  if (fenced) {
    const inner = tryParse(fenced.trim());
    if (inner.ok) candidates.push({ value: inner.value, topLevel: true });
  }
  let afterUnmatched = false;
  let attempts = 0;
  for (let start = trimmed.indexOf("{"); start >= 0 && attempts < MAX_CANDIDATE_ATTEMPTS; attempts += 1) {
    const end = matchingBrace(trimmed, start);
    if (end < 0) {
      // 짝이 없는 `{`: 끝이 잘린 바깥 객체일 수 있다. 그 문법 문제를 기억하고, 뒤의 객체는 바깥 후보로 보지 않는다.
      if (!afterUnmatched) syntaxIssue ??= parseError(trimmed.slice(start));
      afterUnmatched = true;
      start = trimmed.indexOf("{", start + 1);
      continue;
    }
    const block = trimmed.slice(start, end + 1);
    const sliced = tryParse(block);
    if (sliced.ok) candidates.push({ value: sliced.value, topLevel: !afterUnmatched });
    else if (!afterUnmatched) syntaxIssue ??= parseError(block);
    start = trimmed.indexOf("{", end + 1);
  }
  return { candidates, syntaxIssue };
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
