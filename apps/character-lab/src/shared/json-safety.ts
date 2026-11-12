/**
 * 레시피·프리셋 텍스트 입력의 JSON 무결성 검사기(순수, 외부 의존 없음).
 * - UTF-8 BOM(`\uFEFF`) 자동 제거 복구
 * - 바이너리 파일(GLB·PNG·PSD·ZIP·NUL 포함 파일) 오선택 판별 및 한글 안내
 * - 잘린 JSON / 구문 오류의 줄·열 위치 및 원인 요약
 * - RFC 8259 객체 내 중복 키(`{"hair":"a","hair":"b"}` 등 `JSON.parse`가 무경고 덮어쓰는 결함) 탐지
 */

export type BinarySignatureKind = "glb" | "png" | "psd" | "zip" | "binary";

export interface DetectedBinarySignature {
  readonly kind: BinarySignatureKind;
  readonly reasonKo: string;
}

export type SafeJsonParseResult =
  | {
      readonly ok: true;
      readonly value: unknown;
      readonly bomStripped: boolean;
    }
  | {
      readonly ok: false;
      readonly code: "recipe-json-syntax" | "recipe-duplicate-id";
      readonly reasonKo: string;
      readonly detail?: unknown;
    };

/** 선두 UTF-8 BOM(`\uFEFF`)이 있으면 한 글자를 제거한다. */
export function stripUtf8Bom(text: string): { readonly text: string; readonly bomStripped: boolean } {
  if (text.length > 0 && text.charCodeAt(0) === 0xfeff) {
    return { text: text.slice(1), bomStripped: true };
  }
  return { text, bomStripped: false };
}

/** 텍스트로 읽힌 바이너리 파일 매직 헤더·NUL 바이트를 판별한다. */
export function detectBinaryFileSignature(rawText: string): DetectedBinarySignature | null {
  const { text } = stripUtf8Bom(rawText);
  if (text.length >= 4) {
    if (text.startsWith("glTF") && (text.length >= 12 && (text.charCodeAt(4) <= 0x05 || text.includes("\u0000")))) {
      return {
        kind: "glb",
        reasonKo:
          "레시피 파일이 올바른 JSON이 아닙니다: 선택한 파일은 GLB 3D 모델 바이너리입니다. 제작 패키지는 '제작 패키지' 탭에서 불러오세요.",
      };
    }
    if (text.startsWith("\u0089PNG") || text.startsWith("\ufffdPNG")) {
      return {
        kind: "png",
        reasonKo:
          "레시피 파일이 올바른 JSON이 아닙니다: 선택한 파일은 PNG 이미지 바이너리입니다. 레시피(.character.json) 또는 프리셋(.preset) 텍스트 파일을 선택하세요.",
      };
    }
    if (text.startsWith("8BPS\u0000") || (text.startsWith("8BPS") && text.includes("\u0000"))) {
      return {
        kind: "psd",
        reasonKo:
          "레시피 파일이 올바른 JSON이 아닙니다: 선택한 파일은 PSD 문서 바이너리입니다. 레시피(.character.json) 텍스트 파일을 선택하세요.",
      };
    }
    if (text.startsWith("PK\u0003\u0004") || text.startsWith("PK\u0005\u0006")) {
      return {
        kind: "zip",
        reasonKo:
          "레시피 파일이 올바른 JSON이 아닙니다: 선택한 파일은 ZIP/아카이브 바이너리입니다. 압축을 해제하거나 .character.json / .preset 텍스트 파일을 선택하세요.",
      };
    }
  }
  if (text.includes("\u0000")) {
    return {
      kind: "binary",
      reasonKo:
        "레시피 파일이 올바른 JSON이 아닙니다: 바이너리(NUL) 데이터가 포함되어 있어 텍스트 레시피로 읽을 수 없습니다.",
    };
  }
  return null;
}

function offsetToLineCol(text: string, offset: number): { readonly line: number; readonly column: number } {
  const clamped = Math.max(0, Math.min(text.length, offset));
  let line = 1;
  let lastNewline = -1;
  for (let i = 0; i < clamped; i += 1) {
    if (text.charCodeAt(i) === 10) {
      line += 1;
      lastNewline = i;
    }
  }
  return { line, column: clamped - lastNewline };
}

function looksTruncatedJson(trimmed: string, rawMessage: string): boolean {
  if (/unexpected end of json|unterminated string/iu.test(rawMessage)) return true;
  if (trimmed.startsWith("{") && !trimmed.endsWith("}")) return true;
  if (trimmed.startsWith("[") && !trimmed.endsWith("]")) return true;
  return false;
}

/** `JSON.parse` 예외를 한글 원인·잘림 여부·줄/열 위치가 포함된 안내문으로 변환한다. */
export function describeJsonSyntaxErrorKo(text: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const posMatch = /\bposition\s+(\d+)\b/iu.exec(message);
  let locationNote = "";
  if (posMatch?.[1] !== undefined) {
    const offset = Number.parseInt(posMatch[1], 10);
    if (Number.isFinite(offset)) {
      const { line, column } = offsetToLineCol(text, offset);
      locationNote = ` (줄 ${line}, 열 ${column})`;
    }
  }
  const trimmed = text.trim();
  const truncatedNote = looksTruncatedJson(trimmed, message)
    ? " — 파일 끝이 잘렸거나 괄호·따옴표가 닫히지 않았습니다"
    : "";
  return `레시피 파일이 올바른 JSON이 아닙니다${locationNote}${truncatedNote}: ${message}`;
}

type ContainerFrame =
  | {
      readonly kind: "object";
      readonly path: string;
      readonly keys: Set<string>;
      state: "expect-key-or-end" | "expect-key" | "expect-colon" | "expect-value" | "expect-comma-or-end";
      pendingKey: string | null;
    }
  | {
      readonly kind: "array";
      readonly path: string;
      index: number;
      state: "expect-value-or-end" | "expect-value" | "expect-comma-or-end";
    };

function isJsonWhitespace(code: number): boolean {
  return code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d;
}

function readJsonStringEnd(text: string, startQuote: number): number {
  let i = startQuote + 1;
  while (i < text.length) {
    const ch = text.charCodeAt(i);
    if (ch === 0x22) return i + 1;
    if (ch === 0x5c) {
      i += 2;
      continue;
    }
    i += 1;
  }
  return text.length;
}

function readJsonPrimitiveEnd(text: string, start: number): number {
  let i = start;
  while (i < text.length) {
    const ch = text.charCodeAt(i);
    if (isJsonWhitespace(ch) || ch === 0x2c || ch === 0x7d || ch === 0x5d || ch === 0x3a) break;
    i += 1;
  }
  return Math.max(start + 1, i);
}

/**
 * 구문상 유효한 JSON 텍스트를 비재귀 스캔해 동일 객체 내 중복 키 경로 목록(예: `["slots.hair", "pose.head"]`)을 반환한다.
 * 유니코드 이스케이프(`\u0068air` === `hair`)도 표준 JSON 문자열 디코딩 후 비교한다.
 */
export function findDuplicateJsonObjectKeys(validJsonText: string): readonly string[] {
  const { text } = stripUtf8Bom(validJsonText);
  const stack: ContainerFrame[] = [];
  const duplicates: string[] = [];
  const seenDuplicatePaths = new Set<string>();

  const completeValueOnParent = (): void => {
    const parent = stack[stack.length - 1];
    if (!parent) return;
    if (parent.kind === "object") {
      parent.state = "expect-comma-or-end";
      parent.pendingKey = null;
    } else {
      parent.index += 1;
      parent.state = "expect-comma-or-end";
    }
  };

  const childPathOfTop = (): string => {
    const top = stack[stack.length - 1];
    if (!top) return "";
    if (top.kind === "object") {
      const key = top.pendingKey ?? "";
      return top.path.length > 0 ? `${top.path}.${key}` : key;
    }
    return top.path.length > 0 ? `${top.path}[${top.index}]` : `[${top.index}]`;
  };

  let i = 0;
  while (i < text.length) {
    const ch = text.charCodeAt(i);
    if (isJsonWhitespace(ch)) {
      i += 1;
      continue;
    }
    if (ch === 0x7b) {
      // '{'
      const path = childPathOfTop();
      stack.push({ kind: "object", path, keys: new Set<string>(), state: "expect-key-or-end", pendingKey: null });
      i += 1;
      continue;
    }
    if (ch === 0x7d) {
      // '}'
      stack.pop();
      completeValueOnParent();
      i += 1;
      continue;
    }
    if (ch === 0x5b) {
      // '['
      const path = childPathOfTop();
      stack.push({ kind: "array", path, index: 0, state: "expect-value-or-end" });
      i += 1;
      continue;
    }
    if (ch === 0x5d) {
      // ']'
      stack.pop();
      completeValueOnParent();
      i += 1;
      continue;
    }
    if (ch === 0x3a) {
      // ':'
      const top = stack[stack.length - 1];
      if (top?.kind === "object") top.state = "expect-value";
      i += 1;
      continue;
    }
    if (ch === 0x2c) {
      // ','
      const top = stack[stack.length - 1];
      if (top?.kind === "object") top.state = "expect-key";
      else if (top?.kind === "array") top.state = "expect-value";
      i += 1;
      continue;
    }
    if (ch === 0x22) {
      // '"'
      const end = readJsonStringEnd(text, i);
      const top = stack[stack.length - 1];
      if (top?.kind === "object" && (top.state === "expect-key-or-end" || top.state === "expect-key")) {
        const decodedKey = JSON.parse(text.slice(i, end)) as string;
        const keyPath = top.path.length > 0 ? `${top.path}.${decodedKey}` : decodedKey;
        if (top.keys.has(decodedKey) && !seenDuplicatePaths.has(keyPath)) {
          seenDuplicatePaths.add(keyPath);
          duplicates.push(keyPath);
        }
        top.keys.add(decodedKey);
        top.pendingKey = decodedKey;
        top.state = "expect-colon";
      } else {
        completeValueOnParent();
      }
      i = end;
      continue;
    }

    const end = readJsonPrimitiveEnd(text, i);
    completeValueOnParent();
    i = end;
  }

  return duplicates;
}

/** BOM 제거 · 바이너리 오선택 감지 · 잘림/위치 진단 · 중복 키 차단을 통합 수행한다. */
export function parseJsonSafely(rawText: string): SafeJsonParseResult {
  const binary = detectBinaryFileSignature(rawText);
  if (binary) {
    return { ok: false, code: "recipe-json-syntax", reasonKo: binary.reasonKo };
  }
  const { text, bomStripped } = stripUtf8Bom(rawText);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      code: "recipe-json-syntax",
      reasonKo: describeJsonSyntaxErrorKo(text, error),
      detail: error,
    };
  }
  if (typeof value === "object" && value !== null) {
    const duplicates = findDuplicateJsonObjectKeys(text);
    if (duplicates.length > 0) {
      return {
        ok: false,
        code: "recipe-duplicate-id",
        reasonKo: `레시피 JSON 객체에 중복된 키가 있습니다(${duplicates.slice(0, 5).join(", ")}). 중복 항목을 정리한 뒤 다시 불러오세요.`,
      };
    }
  }
  return { ok: true, value, bomStripped };
}
