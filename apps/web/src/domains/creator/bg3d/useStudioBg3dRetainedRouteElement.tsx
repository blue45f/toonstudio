import { useContext, useMemo } from "react";

import { StudioDocumentLayoutContext } from "../studio-router/studio-document-layout-context";
import { StudioDocumentRuntimeContext } from "../studio-router/studio-document-runtime-context";
import { StudioLocalToolImportAuthorityContext } from "../toolchain/studio-local-tool-import-authority";

import { StudioBg3dRetainedRouteContext } from "./StudioBg3dRetainedRouteContext";

import type { StudioBg3dRetainedElement } from "./studio-bg3d-retained-owner";

/** AppShell의 다른 Provider 조상 경로에서도 원래 route의 문서·권한 값을 보존한다. */
export function useStudioBg3dRetainedRouteElement(
  element: StudioBg3dRetainedElement | null,
): StudioBg3dRetainedElement | null {
  const authority = useContext(StudioLocalToolImportAuthorityContext);
  const layout = useContext(StudioDocumentLayoutContext);
  const runtime = useContext(StudioDocumentRuntimeContext);

  return useMemo(() => element === null ? null : (
    <StudioBg3dRetainedRouteContext
      element={element}
      authority={authority}
      layout={layout}
      runtime={runtime}
      open={element.props.open}
      onWebXrCleanupPendingChange={element.props.onWebXrCleanupPendingChange}
    />
  ), [authority, element, layout, runtime]);
}
