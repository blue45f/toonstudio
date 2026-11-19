/** 표준 Base64의 문자와 끝 패딩을 검증한다. 빈 값과 크기 한도는 호출자가 결정한다. */
export function isStandardBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  // 큰 PNG에서도 네 글자 묶음을 정규식 스택에 쌓지 않고 한 번 훑는다.
  return !/[^A-Za-z0-9+/]/u.test(value.slice(0, value.length - padding));
}
