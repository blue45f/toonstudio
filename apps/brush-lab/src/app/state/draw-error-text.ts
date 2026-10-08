import { codeOf, messageOf } from "./run-compare";

/**
 * 획 도중 레인 오류를 사용자에게 보여 줄 한글 문구로 바꾼다. 원문 메시지는 항상 뒤에 붙여 무음 변환이 없게 한다.
 *
 * `stroke-budget-exceeded`는 빠른 획에서 흔히 나는 엔진 한계다: `StrokePipeline`이 프레임별 dab 배치 용량을
 * "그 프레임 안의 경로 길이"로만 추정해, 직전 프레임 끝에서 이번 프레임 첫 표본까지의 간격(빠른 획에서 크다)을 세지 않는다.
 * 앱은 레인을 바꾸거나 입력을 몰래 보정하지 않고(ADR-0018) 획을 버렸다는 사실과 원인만 알린다.
 */
export function describeLaneError(error: unknown): string {
  const code = codeOf(error);
  const raw = messageOf(error);
  if (code === "stroke-budget-exceeded") {
    return `획이 너무 빨라 한 프레임에 놓을 dab 수가 엔진의 배치 용량 추정을 넘었다(엔진 추정 한계 — 가는 간격의 브러시를 빠르게 그을 때 난다. 천천히 그으면 된다): ${raw}`;
  }
  return `레인 오류: ${raw}`;
}
