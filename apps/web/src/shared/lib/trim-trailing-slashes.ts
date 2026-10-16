/**
 * 문자열 끝의 `/` 를 모두 뗀다. (`value.replace(/\/+$/u, "")` 와 같은 결과)
 *
 * 주소 경로는 누구나 만들어 보낼 수 있는 입력이다. `/\/+$/` 는 슬래시가 길게 이어진 뒤에 다른 글자가 오면 시작점마다 그 열을
 * 끝까지 다시 읽어 입력 길이의 제곱 시간이 든다(CodeQL js/polynomial-redos). 뒤에서 앞으로 한 번만 훑는다.
 */
export function trimTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value.charCodeAt(end - 1) === 47) end -= 1;
  return end === value.length ? value : value.slice(0, end);
}
