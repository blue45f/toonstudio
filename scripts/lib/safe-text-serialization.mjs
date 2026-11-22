/**
 * 스크립트·리포트·인라인 브라우저 하네스용 공통 안전 텍스트 직렬화 유틸리티.
 *
 * - `escapeMarkdownTableCell`: CodeQL `js/incomplete-sanitization` (#247) 재발 방지를 위해
 *   반드시 역슬래시(`\`)를 먼저 `\\`로 치환한 뒤 파이프(`|`)와 개행 문자를 치환한다.
 * - `serializeSafeInlineJsString`: CodeQL `js/bad-code-sanitization` (#246) 재발 방지를 위해
 *   `JSON.stringify` 결과의 `<`, `>`, `&`, `/`, U+2028, U+2029 문자를 유니코드 이스케이프로 치환한다.
 */

const INLINE_JS_ESCAPE_MAP = Object.freeze({
  "<": "\\u003c",
  ">": "\\u003e",
  "&": "\\u0026",
  "/": "\\u002f",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
});

/**
 * 마크다운 표 셀 문자열을 안전하게 이스케이프한다.
 *
 * @param {unknown} value
 * @param {{ collapseWhitespace?: boolean }} [options]
 * @returns {string}
 */
export function escapeMarkdownTableCell(value, { collapseWhitespace = false } = {}) {
  const escaped = String(value ?? "")
    .replace(/\\/gu, "\\\\")
    .replace(/\|/gu, "\\|")
    .replace(/\r\n|\r|\n|\u2028|\u2029/gu, " ");
  return collapseWhitespace ? escaped.replace(/\s+/gu, " ").trim() : escaped;
}

/**
 * 인라인 `<script>` 또는 동적 JS 소스 문자열 안에 값을 안전하게 직렬화한다.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function serializeSafeInlineJsString(value) {
  const serialized = JSON.stringify(value === undefined ? null : value);
  if (typeof serialized !== "string") {
    return "null";
  }
  return serialized.replace(
    /[<>&/\u2028\u2029]/gu,
    (character) => INLINE_JS_ESCAPE_MAP[character],
  );
}
