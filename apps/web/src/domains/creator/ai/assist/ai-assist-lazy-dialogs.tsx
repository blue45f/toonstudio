import { lazy } from "react";

/** 대화상자는 처음 열 때만 내려받는다. 컴포넌트만 내보내는 파일이라 Fast Refresh가 그대로 동작한다. */
export const ArtDirectorDialog = lazy(() =>
  import("./AssistArtDirectorDialog").then((module) => ({ default: module.AssistArtDirectorDialog })),
);
export const CommandPlanDialog = lazy(() =>
  import("./AssistCommandPlanDialog").then((module) => ({ default: module.AssistCommandPlanDialog })),
);
export const LocalizeDialog = lazy(() =>
  import("./AssistLocalizeDialog").then((module) => ({ default: module.AssistLocalizeDialog })),
);
export const AltTextDialog = lazy(() =>
  import("./AssistAltTextDialog").then((module) => ({ default: module.AssistAltTextDialog })),
);
