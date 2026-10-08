import { codeOf, messageOf } from "./run-compare";

/**
 * 획 도중 레인 오류를 사용자에게 보여 줄 한글 문구로 바꾼다. 원문 메시지는 항상 뒤에 붙여 무음 변환이 없게 한다.
 *
 * `stroke-budget-exceeded`: 예전에는 빠른 획(약 2000 px/s 이상)에서 흔히 났지만, `StrokePipeline`이 프레임 경계 구간과 적응 간격을
 * 용량 추정에 넣도록 고쳐진(2026-10-08, BL-1b) 뒤에는 한 프레임에 수만 px를 건너뛰는 **비정상 입력**(포인터 좌표 오류·캡처 상실 직후의 점프)이나
 * 다른 용량 한계일 때만 난다. 앱은 레인을 바꾸거나 입력을 몰래 보정하지 않고(ADR-0018) 획을 버렸다는 사실과 원인만 알린다.
 */
export function describeLaneError(error: unknown): string {
  const code = codeOf(error);
  const raw = messageOf(error);
  if (code === "stroke-budget-exceeded") {
    const detail = reasonKoOf(error);
    return `획이 엔진의 dab 배치 상한을 넘어 버려졌다(한 프레임에 수만 px를 건너뛰는 비정상 입력이나 용량 한계일 때만 난다. 평범하게 빠른 획은 그려진다)${detail ? ` — ${detail}` : ""}: ${raw}`;
  }
  return `레인 오류: ${raw}`;
}

/** SumiError.details.reasonKo(엔진이 붙인 한글 사유)가 있으면 돌려준다. */
function reasonKoOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const details = (error as { details?: unknown }).details;
  if (typeof details !== "object" || details === null) return null;
  const reason = (details as { reasonKo?: unknown }).reasonKo;
  return typeof reason === "string" && reason.length > 0 ? reason : null;
}
