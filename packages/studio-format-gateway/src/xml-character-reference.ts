/**
 * XML 숫자 문자 참조(`&#x41;`·`&#65;` 에서 `#x41`·`#65` 부분)를 문자로 푼다.
 * 값은 바깥 파일이 정하므로 코드 포인트 범위(U+10FFFF)를 넘거나 대리쌍 영역(U+D800–U+DFFF)에 들면
 * `String.fromCodePoint` 가 RangeError 를 던진다. 그런 값과 숫자가 아닌 값은 풀지 않고 `null` 을 돌려,
 * 부른 쪽이 원문을 그대로 두게 한다.
 */
export function decodeNumericCharacterReference(body: string): string | null {
  const hex = body.startsWith("#x") || body.startsWith("#X");
  const code = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
  if (!Number.isSafeInteger(code) || code < 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return null;
  return String.fromCodePoint(code);
}
