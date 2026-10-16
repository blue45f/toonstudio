/**
 * 형식 어댑터 가운데 Studio 정적 진입 그래프에 닿는 모듈(abr·abr-preview)이 쓰는 아주 작은 문자열 도우미.
 *
 * `format-common.ts` 는 MD5·안전 XML 해석기까지 담은 큰 모듈이라, 정적 모듈이 가져오면 번들러가 그 전체를 Studio 첫
 * 청크 그래프에 묶는다. 그래서 같은 함수를 여기에 두고 두 정적 모듈만 이쪽을 가져온다.
 * 이 파일을 `format-common.ts` 가 다시 내보내게 하면 안 된다 — 지연 로드되는 어댑터들과 정적 모듈이 이 모듈을 함께 쓰게 되어
 * 번들러가 이 모듈을 별도 청크로 떼어 내 Studio 정적 청크가 늘어난다. 두 구현이 같은 결과를 내는지는
 * `__tests__/nul-text-parity.test.ts` 가 지킨다.
 */

/**
 * 문자열 끝의 NUL 문자를 모두 뗀다. UTF-16 이름처럼 파일이 길이를 정하는 문자열에 `/\0+$/` 를 쓰면, 앞쪽에 NUL 이 길게
 * 이어질 때 시작점마다 그 열을 끝까지 다시 읽어 입력 길이의 제곱 시간이 된다(CodeQL js/polynomial-redos).
 */
export function stripTrailingNuls(text: string): string {
  let end = text.length;
  while (end > 0 && text.charCodeAt(end - 1) === 0) end -= 1;
  return end === text.length ? text : text.slice(0, end);
}
