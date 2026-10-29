/** IMAGE 손 추론 포트의 직렬화. 사진과 연속 입력이 같은 모델을 동시에 호출하지 않게 한다. */
import { failVisible } from "../../contracts";

import type { HandDetectorPort, LoadedModel } from "./vision-ports";

export function serializeHandModel(model: LoadedModel<HandDetectorPort>): LoadedModel<HandDetectorPort> {
  let chain: Promise<unknown> = Promise.resolve();
  let active = false;
  let closed = false;
  let released = false;
  const release = (): void => {
    if (closed && !active && !released) { released = true; model.dispose(); }
  };
  return {
    ...model,
    port: {
      detect(image) {
        const pending = chain.then(async () => {
          if (closed) throw failVisible("vision-model-disposed", "손 모델이 해제되어 추론을 취소했습니다.");
          active = true;
          try { return await model.port.detect(image); }
          finally { active = false; release(); }
        });
        chain = pending.catch(() => undefined);
        return pending;
      },
    },
    dispose() { closed = true; release(); },
  };
}
