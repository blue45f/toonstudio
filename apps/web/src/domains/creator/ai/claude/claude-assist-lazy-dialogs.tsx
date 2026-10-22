import { lazy } from "react";

/** 대화상자는 처음 열 때만 내려받는다. 컴포넌트만 내보내는 파일이라 Fast Refresh가 그대로 동작한다. */
export const ArtDirectorDialog = lazy(() =>
  import("./ClaudeArtDirectorDialog").then((module) => ({ default: module.ClaudeArtDirectorDialog })),
);
export const CommandPlanDialog = lazy(() =>
  import("./ClaudeCommandPlanDialog").then((module) => ({ default: module.ClaudeCommandPlanDialog })),
);
export const LocalizeDialog = lazy(() =>
  import("./ClaudeLocalizeDialog").then((module) => ({ default: module.ClaudeLocalizeDialog })),
);
export const AltTextDialog = lazy(() =>
  import("./ClaudeAltTextDialog").then((module) => ({ default: module.ClaudeAltTextDialog })),
);
