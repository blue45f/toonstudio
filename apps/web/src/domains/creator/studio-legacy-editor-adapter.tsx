import "../../shared/styles/studio-route.css";

import { Profiler } from "react";

import { recordStudioRenderProfile } from "./canvas/studio-canvas-shared-runtime";
import { studioEditorSourceRoute } from "./studio-editor-source-scope";
import { useStudioNoAutoTranslate } from "./studio-no-auto-translate";
import { StudioCuttoonEditor } from "./StudioPage";

import type { StudioWorkspaceRoute } from "./studio-workspace-route";

export interface LegacyStudioEditorAdapterProps {
  /** Canonical path identity supplied by StudioRouter; never re-read from a query alias. */
  readonly remixId: string | null;
  readonly studioRoute: StudioWorkspaceRoute;
}

/**
 * Temporary adapter around the monolithic editor while feature panels are extracted in parallel.
 * URL parsing, canonical navigation, publish routing, and editor instance ownership live in
 * `studio-router`; this module owns editor behavior only.
 */
export function LegacyStudioEditorAdapter({
  remixId,
  studioRoute,
}: LegacyStudioEditorAdapterProps) {
  // 편집기 UI 와 대사 입력이 브라우저 자동 번역에 흩어지지 않게 한다(공개 사이트의 번역은 그대로 둔다).
  useStudioNoAutoTranslate();
  const sourceRoute = studioEditorSourceRoute(studioRoute);
  return (
    <Profiler id="studio:editor" onRender={recordStudioRenderProfile}>
      <StudioCuttoonEditor remixId={remixId} studioRoute={sourceRoute} />
    </Profiler>
  );
}
