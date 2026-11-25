import { typesetKoreanBalloon, type BalloonTypesetOptions, type KoreanBalloonTypesetResult } from "./korean-balloon-typesetter";
import { generateSfxVectorEnvelope, type SfxVectorOptions, type SfxVectorEnvelopeResult } from "./sfx-vector-path-generator";

type Preview<T> = { readonly result: T; readonly error: null } | { readonly result: null; readonly error: string };

/** 계산 실패는 입력 상태와 분리한다. 원문을 대체하는 기본 결과를 만들지 않는다. */
function calculate<T>(run: () => T): Preview<T> {
  try { return { result: run(), error: null }; }
  catch (error) { return { result: null, error: error instanceof Error ? error.message : "예제 계산에 실패했습니다." }; }
}

export function calculateBalloonPreview(text: string, options: BalloonTypesetOptions): Preview<KoreanBalloonTypesetResult> {
  return calculate(() => typesetKoreanBalloon(text, options));
}

export function calculateSfxPreview(text: string, options: SfxVectorOptions): Preview<SfxVectorEnvelopeResult> {
  return calculate(() => generateSfxVectorEnvelope(text, options));
}
