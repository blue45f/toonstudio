/**
 * 투고 패키지 — 취소(AbortError) 판별.
 *
 * `AbortSignal` 이 만드는 `DOMException` 은 브라우저에서는 `Error` 를 상속하지만 다른 전역(iframe)이나 jsdom 같은
 * 환경에서는 그렇지 않을 수 있다. `instanceof Error` 로 가르면 사용자가 누른 취소가 '오류'로 보이므로 이름만 본다.
 */
export function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}
