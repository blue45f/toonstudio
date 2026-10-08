import type { RawStage } from "./raw-stage";
import type { RawSample } from "../../core/types";

/**
 * 단계 체인 합성. 앞 단계의 출력이 뒤 단계의 입력이다. 합성 결과도 `RawStage`라서 중첩할 수 있다.
 * - `apply`: 표본을 앞 단계부터 차례로 통과시킨다.
 * - `flush`: 앞 단계의 마무리 표본을 뒤 단계에 먹인 뒤 뒤 단계 자신의 마무리를 이어 붙인다
 *   (앞 단계가 `up`을 보류하면 그 `up`이 뒤 단계에 도착하는 시점은 앞 단계의 flush 때다).
 * - 단계가 0개면 통과 단계와 같다.
 */
export function composeStages(stages: readonly RawStage[]): RawStage {
  const list = [...stages];
  return {
    id: list.length === 0 ? "passthrough" : list.map((s) => s.id).join(">"),
    label: list.length === 0 ? "통과(보정 없음)" : list.map((s) => s.label).join(" → "),
    apply(samples) {
      let cur: RawSample[] = samples.map((s) => ({ ...s }));
      for (const stage of list) cur = stage.apply(cur);
      return cur;
    },
    flush() {
      let carry: RawSample[] = [];
      for (const stage of list) {
        const out = carry.length > 0 ? stage.apply(carry) : [];
        // 스프레드(`push(...arr)`)는 인자 수 한도(수만~수십만)를 넘으면 던지므로 반복으로 이어 붙인다.
        for (const o of stage.flush()) out.push(o);
        carry = out;
      }
      return carry;
    },
    reset() {
      for (const stage of list) stage.reset();
    },
  };
}

/** `dst.push(...src)`와 같되 인자 수 한도에 걸리지 않는다. */
function appendAll(dst: RawSample[], src: readonly RawSample[]): void {
  for (const item of src) dst.push(item);
}

/**
 * 획 스트림 적용: 표본 배열을 단계에 통과시키되, `up` 표본이 있으면 그 자리에서 `flush()`를 이어 붙인다.
 * 한 배열 안에 여러 획(`up` 뒤에 `down`)이 있어도 획 경계마다 마무리한다. 결과는 `up`으로 끝나는 획 단위의 완결된 표본열이다
 * (실시간 세션이 포인터 이벤트 배치마다 부르는 형태: 획이 끝나는 배치에서 마무리 표본이 같은 배치로 나간다).
 */
export function applyStrokeStream(stage: RawStage, samples: readonly RawSample[]): RawSample[] {
  const out: RawSample[] = [];
  let start = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const s = samples[i];
    if (!s || s.source === "predicted" || s.phase !== "up") continue;
    appendAll(out, stage.apply(samples.slice(start, i + 1)));
    appendAll(out, stage.flush());
    start = i + 1;
  }
  if (start < samples.length) appendAll(out, stage.apply(samples.slice(start)));
  return out;
}
