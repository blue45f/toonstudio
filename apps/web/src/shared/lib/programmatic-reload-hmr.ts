import { allowStudioProgrammaticReload } from "./programmatic-reload";

if (import.meta.hot) {
  import.meta.hot.on("vite:beforeFullReload", () => {
    allowStudioProgrammaticReload();
  });
}

export function ensureProgrammaticReloadHmr(): void {
  // 모듈 평가 시 이미 Vite HMR full-reload 훅을 등록한다.
}
