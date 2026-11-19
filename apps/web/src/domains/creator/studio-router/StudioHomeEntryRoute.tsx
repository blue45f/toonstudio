import { Suspense } from "react";
import { useLocation } from "react-router-dom";

import type { ReactNode } from "react";

import { StudioHomeLoadingSkeleton } from "../studio-shell/StudioHomeLoadingSkeleton";
import { StudioWorkspaceLibraryShell } from "../workspace/StudioWorkspaceLibraryShell";

/**
 * The shell is part of the route module, so it paints immediately. Only the lazily loaded home
 * body suspends; the page therefore never falls back to the generic full-page route skeleton.
 */
function StudioHomeBody({ children }: { readonly children: ReactNode }) {
  return <Suspense fallback={<StudioHomeLoadingSkeleton />}>{children}</Suspense>;
}

/** Identity-bearing legacy URLs must reach the canonical resolver, including invalid/empty values. */
export function StudioHomeEntryRoute({ home, legacy }: { home: ReactNode; legacy: ReactNode }) {
  const { search } = useLocation();
  const query = new URLSearchParams(search);
  if (query.has("id") || query.has("remix") || query.has("mode")) return legacy;

  return <StudioWorkspaceLibraryShell><StudioHomeBody>{home}</StudioHomeBody></StudioWorkspaceLibraryShell>;
}
