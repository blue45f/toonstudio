/**
 * SVG 원문 살균 검사에 쓰는 선형 시간 스캐너.
 *
 * 살균기는 밖에서 받은 SVG(원문 예산 2 MiB)를 정규식으로 훑는다. 같은 문자에 걸친 인접 수량자(`\s*\/?\s*`)나
 * 끝 표지를 못 찾으면 문서 끝까지 가는 지연 수량자(`[\s\S]*?`)를 시작 위치마다 다시 돌리면 입력 길이의 제곱 시간이 든다
 * (CodeQL js/polynomial-redos). 수백 KB 한 장으로 탭이 수 초, 2 MiB 면 수십 분 멈춘다.
 * 이 모듈의 함수들은 같은 판정을 입력을 한 번씩만 훑어 내린다.
 */

const FORBIDDEN_ELEMENT_PATTERN =
  /<\s*(?:\/\s*)?(?:script|foreignObject|iframe|object|embed|audio|video|canvas|frame|frameset|portal)\b/iu;

/**
 * 실행되거나 외부 자원을 끌어오는 요소의 여는·닫는 태그가 있는지 본다. `<`, `</`, `< /` 처럼 공백이 낀 표기도 잡는다.
 * 슬래시 앞뒤 공백을 `\s*\/?\s*` 로 쓰면 같은 공백을 두 수량자가 나눠 가질 수 있어 제곱 시간이 되므로 `\s*(?:\/\s*)?` 로 쓴다.
 * 받아들이는 문자열 집합은 같다.
 */
export function hasForbiddenSvgElement(text: string): boolean {
  return FORBIDDEN_ELEMENT_PATTERN.test(text);
}

// 영숫자·밑줄·하이픈 한 덩어리(속성 이름 후보)와 뒤따르는 공백, 선택적인 등호를 한 번에 읽는다.
// 뒤 두 조각이 모두 선택이라 어떤 입력에서도 매칭이 실패하지 않는다. 되돌림이 없고 덩어리마다 한 번씩만 읽는다.
const NAME_RUN_PATTERN = /([a-z0-9_-]+)\s*(=?)/giu;
// 덩어리 맨 앞이나 하이픈 바로 뒤에서 시작하고, 뒤에 이름 글자가 하나 이상 더 있는 `on`.
const EVENT_NAME_PATTERN = /(?:^|-)on[a-z0-9_-]/iu;

/**
 * `onload=` 같은 이벤트 핸들러 속성이 있는지 본다. `\bon[a-z0-9_-]+\s*=` 와 같은 판정이다.
 * 그 식은 `on-on-on-...` 처럼 단어 경계가 잇따르는 덩어리에서 시작점마다 덩어리 끝까지 다시 읽어 제곱 시간이 된다.
 * 이름 글자 덩어리는 하이픈 말고는 모두 단어 글자라 `\b` 는 덩어리 맨 앞이나 하이픈 뒤에서만 성립하고,
 * 이어지는 `[a-z0-9_-]+\s*=` 는 덩어리 끝에서만 이어질 수 있다. 그래서 덩어리 단위로 한 번씩만 보면 된다.
 */
export function hasEventHandlerAttribute(text: string): boolean {
  for (const match of text.matchAll(NAME_RUN_PATTERN)) {
    if (match[2] === "=" && EVENT_NAME_PATTERN.test(match[1] ?? "")) return true;
  }
  return false;
}

// CSS url() 문법: 따옴표로 시작하면 같은 따옴표가 닫힐 때까지, 아니면 `)` 앞까지가 대상이다.
const CSS_URL_PATTERN = /url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*))\s*\)/giu;

/**
 * 문서 안 모든 `url(...)` 의 대상 문자열(바깥 따옴표 제외)을 앞에서부터 돌려준다.
 * 마지막 `)` 뒤에서 시작하는 `url(` 은 어차피 닫히지 못한다. 그 꼬리를 잘라 내야 닫는 괄호를 끝내 못 찾는
 * 시작점마다 문서 끝까지 읽는 일이 없다. 짝이 어긋난 따옴표(`url("#a"x")`)는 따옴표째 대상이 돼 거부 쪽으로 읽힌다.
 */
export function cssUrlTargets(text: string): string[] {
  const lastClose = text.lastIndexOf(")");
  if (lastClose < 0) return [];
  const targets: string[] = [];
  for (const match of text.slice(0, lastClose + 1).matchAll(CSS_URL_PATTERN)) {
    targets.push(match[1] ?? match[2] ?? match[3] ?? "");
  }
  return targets;
}

const IMAGE_ELEMENT_PATTERN = /<\s*(?:image|feImage)\b[\s\S]*?>/giu;

/**
 * `<image ...>`·`<feImage ...>` 여는 태그 원문을 앞에서부터 돌려준다. 닫히지 않은 태그는 돌려주지 않는다.
 * 마지막 `>` 뒤의 꼬리는 어떤 태그도 닫지 못한다. 그 꼬리를 잘라 내야 `>` 를 끝내 못 찾는 시작점마다
 * 문서 끝까지 읽는 일이 없다.
 */
export function imageElementTags(text: string): string[] {
  const lastClose = text.lastIndexOf(">");
  if (lastClose < 0) return [];
  return Array.from(
    text.slice(0, lastClose + 1).matchAll(IMAGE_ELEMENT_PATTERN),
    (match) => match[0],
  );
}
