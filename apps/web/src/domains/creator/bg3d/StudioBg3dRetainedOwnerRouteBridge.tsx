import { cloneElement, useContext, useLayoutEffect, useMemo, useRef, useSyncExternalStore } from "react";

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

import {
  detachStudioBg3dRetainedOwnerRoute,
  publishStudioBg3dRetainedOwnerLease,
  studioBg3dRetainedOwnerSource,
  updateStudioBg3dRetainedOwnerLease,
  type StudioBg3dRetainedElement,
  type StudioBg3dRetainedElementProps,
} from "./studio-bg3d-retained-owner";

interface StudioBg3dRetainedRouteContextProps extends StudioBg3dRetainedElementProps {
  readonly element: StudioBg3dRetainedElement;
  readonly authority: StudioLocalToolImportAuthority | null;
  readonly layout: StudioDocumentLayoutRuntime | null;
  readonly runtime: StudioDocumentRuntimeLifecycle | null;
}

function StudioBg3dRetainedRouteContext({
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

/** AppShell의 다른 Provider 조상 경로에서도 원래 route의 문서·권한 값을 보존한다. */
function useStudioBg3dRetainedRouteElement(
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

export interface StudioBg3dRetainedOwnerRouteBridgeProps {
  readonly element: StudioBg3dRetainedElement | null;
  readonly open: boolean;
}

/**
 * Route-side publisher. Its cleanup is synchronous: it detaches authority and asks the already
 * published element to close before React removes RouteStage. The element itself remains rendered
 * by AppShell until cleanupPending returns false.
 */
export function StudioBg3dRetainedOwnerRouteBridge({
  element,
  open,
}: StudioBg3dRetainedOwnerRouteBridgeProps) {
  const retainedElement = useStudioBg3dRetainedRouteElement(element);
  const generationRef = useRef(0);
  const elementRef = useRef(retainedElement);
  const openRef = useRef(open);
  elementRef.current = retainedElement;
  openRef.current = open;
  const ownerSnapshot = useSyncExternalStore(
    studioBg3dRetainedOwnerSource.subscribe,
    studioBg3dRetainedOwnerSource.getSnapshot,
    studioBg3dRetainedOwnerSource.getSnapshot,
  );

  useLayoutEffect(() => {
    if (generationRef.current !== 0) return;
    const generation = publishStudioBg3dRetainedOwnerLease({
      element: elementRef.current,
      logicalOpen: openRef.current,
    });
    if (generation === null) return;
    generationRef.current = generation;
  }, [ownerSnapshot]);

  useLayoutEffect(() => () => {
    const generation = generationRef.current;
    generationRef.current = 0;
    if (generation !== 0) detachStudioBg3dRetainedOwnerRoute(generation);
  }, []);

  useLayoutEffect(() => {
    updateStudioBg3dRetainedOwnerLease(generationRef.current, {
      element: retainedElement,
      logicalOpen: open,
    });
  }, [retainedElement, open]);

  return null;
}
