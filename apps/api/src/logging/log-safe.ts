const DEFAULT_MAXIMUM_LOGGED_VALUE_LENGTH = 300;

function isLogControlCode(code: number): boolean {
  return (
    code <= 0x1f
    || (code >= 0x7f && code <= 0x9f)
    // 줄 구분자로 해석되는 유니코드 문자도 로그 뷰어에서 줄바꿈처럼 보인다.
    || code === 0x2028
    || code === 0x2029
  );
}

/**
 * 요청에서 온 값을 한 줄짜리 텍스트 로그에 남기기 전에 정화한다.
 * 줄바꿈·제어 문자를 공백으로 바꿔 가짜 로그 줄을 끼워 넣지 못하게 하고(CWE-117), 길이를 제한한다.
 */
export function sanitizeLogValue(
  value: unknown,
  maximumLength = DEFAULT_MAXIMUM_LOGGED_VALUE_LENGTH,
): string {
  const text = typeof value === "string"
    ? value
    : Array.isArray(value)
      ? value.map(String).join(",")
      : value === undefined || value === null
        ? ""
        : String(value);
  let output = "";
  for (const character of text) {
    if (output.length >= maximumLength) return `${output}…`;
    output += isLogControlCode(character.codePointAt(0) ?? 0) ? " " : character;
  }
  return output;
}
