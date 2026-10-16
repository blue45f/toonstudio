/**
 * 참 바 본체의 지연 경계. `import()` 와 예열만 두고 구현은 정적으로 가져오지 않는다.
 * 실패하면 캐시를 비워 다음 호출이 다시 시도한다(`createStudioIntentLazyLoader`).
 */

import { createStudioIntentLazyLoader } from "../studio-intent-lazy-loader";

const loader = createStudioIntentLazyLoader(() => import("./StudioCharmBar"));

export const loadStudioCharmBar = loader.load;
export const preloadStudioCharmBar = loader.preload;
