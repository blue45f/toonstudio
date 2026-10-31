import { cloneElement } from "react";

import {
  StudioDocumentLayoutContext,
  type StudioDocumentLayoutRuntime,
} from "../studio-router/studio-document-layout-context";
import {
  StudioDocumentRuntimeContext,
  type StudioDocumentRuntimeLifecycle,
} from "../studio-router/studio-document-runtime-context";
import {
  StudioLocalToolImportAuthorityContext,
  type StudioLocalToolImportAuthority,
} from "../toolchain/studio-local-tool-import-authority";

import type {
  StudioBg3dRetainedElement,
  StudioBg3dRetainedElementProps,
} from "./studio-bg3d-retained-owner";

interface StudioBg3dRetainedRouteContextProps extends StudioBg3dRetainedElementProps {
  readonly element: StudioBg3dRetainedElement;
  readonly authority: StudioLocalToolImportAuthority | null;
  readonly layout: StudioDocumentLayoutRuntime | null;
  readonly runtime: StudioDocumentRuntimeLifecycle | null;
}

export function StudioBg3dRetainedRouteContext({
  element,
  authority,
  layout,
  runtime,
  open,
  onWebXrCleanupPendingChange,
}: StudioBg3dRetainedRouteContextProps) {
  return (
    <StudioDocumentRuntimeContext.Provider value={runtime}>
      <StudioDocumentLayoutContext.Provider value={layout}>
        <StudioLocalToolImportAuthorityContext.Provider value={authority}>
          {cloneElement(element, { open, onWebXrCleanupPendingChange })}
        </StudioLocalToolImportAuthorityContext.Provider>
      </StudioDocumentLayoutContext.Provider>
    </StudioDocumentRuntimeContext.Provider>
  );
}
