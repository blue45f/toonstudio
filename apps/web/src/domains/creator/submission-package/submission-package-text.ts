/**
 * 투고 패키지 — 사용자가 적은 글을 표지·매니페스트에 안전하게 옮기는 순수 도우미.
 *
 * 작품명·시놉시스·캐릭터 설명은 사용자가 마음대로 적은 문자열이다. 표지(Markdown)는 다른 사람의 뷰어에서
 * 열리므로 제어 문자·방향 전환 문자를 걷어 내고 Markdown/HTML 구조를 깨는 문자를 이스케이프한다.
 */

/** 코드 포인트 단위로 자른다(한글·이모지가 반으로 갈라지지 않는다). */
export function clampCodePoints(value: string, maxCodePoints: number): string {
  if (maxCodePoints <= 0) return "";
  const points = Array.from(value);
  return points.length <= maxCodePoints ? value : points.slice(0, maxCodePoints).join("");
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}

function isDroppedCodePoint(code: number): boolean {
  // 줄바꿈(\n)과 탭(\t)은 남기고 나머지 C0 제어 문자와 DEL 을 지운다.
  if (code <= 0x1f) return code !== 0x0a && code !== 0x09;
  if (code === 0x7f) return true;
  // 방향 전환·방향 표시 문자: 표시 순서를 바꿔 다른 글자처럼 보이게 할 수 있다.
  if (code >= 0x202a && code <= 0x202e) return true;
  if (code >= 0x2066 && code <= 0x2069) return true;
  return code === 0x200e || code === 0x200f || code === 0x061c;
}

/**
 * 제어·방향 전환 문자를 지우고 줄바꿈을 `\n` 으로 통일한 뒤 앞뒤 공백을 다듬는다.
 * 길이는 자르지 않는다 — 너무 길면 점검이 오류로 알려 사용자가 고치게 한다.
 */
export function normalizeUserText(value: string): string {
  let output = "";
  for (const character of value.normalize("NFC").replace(/\r\n?/gu, "\n")) {
    const code = character.codePointAt(0) ?? 0;
    if (!isDroppedCodePoint(code)) output += character;
  }
  return output.trim();
}

/** 한 줄 값(작품명 등): 줄바꿈과 탭을 공백 하나로 접는다. */
export function normalizeSingleLine(value: string): string {
  return normalizeUserText(value).replace(/\s+/gu, " ");
}

const INLINE_ESCAPES: Readonly<Record<string, string>> = Object.freeze({
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  "\\": "\\\\",
  "`": "\\`",
  "*": "\\*",
  "_": "\\_",
  "[": "\\[",
  "]": "\\]",
  "|": "\\|",
  "~": "\\~",
});

/** 문장 중간에 끼워 넣는 값용: HTML 구조와 강조·링크·표 구분자를 무력화한다. */
export function escapeMarkdownInline(value: string): string {
  return value.replace(/[&<>\\`*_[\]|~]/gu, (character) => INLINE_ESCAPES[character] ?? character);
}

const LINE_START_MARKER = /^(\s*)([#+-]|\d+[.)]|=)/u;

/** 한 줄 전체가 본문이 되는 값용: 줄머리 제목·목록 표시도 막는다. */
export function escapeMarkdownLine(value: string): string {
  const escaped = escapeMarkdownInline(value);
  return escaped.replace(LINE_START_MARKER, (_match, indent: string, marker: string) => `${indent}\\${marker}`);
}

/** 여러 줄 글을 인용 블록으로 옮긴다. 빈 줄도 인용 안에 남겨 단락을 보존한다. */
export function toMarkdownQuote(value: string): string {
  const text = normalizeUserText(value);
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => (line.trim() ? `> ${escapeMarkdownLine(line)}` : ">"))
    .join("\n");
}

const naturalCollator = new Intl.Collator("ko", { numeric: true, sensitivity: "base" });

/** 파일 이름을 숫자 크기 순으로 비교한다(`p2` < `p10`). */
export function compareNaturalNames(left: string, right: string): number {
  return naturalCollator.compare(left, right);
}
