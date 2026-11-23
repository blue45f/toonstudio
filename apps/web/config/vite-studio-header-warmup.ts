import type { ServerOptions } from "vite";

/** 원고 화면 검증 전에 지연 로드되는 저장 상태 의존성의 Vite 변환을 시작한다. */
export function studioHeaderWarmup(flag: string | undefined): ServerOptions["warmup"] {
  if (flag !== "1") return undefined;
  return {
    clientFiles: [
      "./src/domains/creator/StudioCuttoonEditorHost.tsx",
      "./src/domains/creator/StudioSaveStatusChromeMount.tsx",
      "./src/domains/creator/StudioSaveSyncStatusCenter.tsx",
      "./src/domains/creator/offline/StudioOfflinePanel.tsx",
    ],
  };
}
