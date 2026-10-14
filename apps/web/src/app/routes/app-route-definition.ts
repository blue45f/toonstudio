import type { ReactElement } from "react";

import type { AppRouteGovernanceDeclaration } from "./route-manifest";

/**
 * Declarative URL contract owned by the application layer.
 *
 * Domain route groups provide only match metadata and a lazy page element. The root router owns
 * React Router's `<Route>` components and all cross-domain boundaries, which keeps URL ownership
 * searchable without spreading router lifecycle concerns through feature modules.
 *
 * Route governance (BLUEPRINT §1.3): a route that is also a public surface must be
 * registered in `route-manifest.ts` with a full governance declaration (canonical
 * group, one-sentence role, tier, stage). The manifest enforces the declaration
 * with required fields plus route-governance.test.ts, so an undeclared new
 * top-level surface fails CI. Router definitions may mirror the same declaration
 * in `governance` when a domain group needs it locally; the manifest remains the
 * source of truth and the two must not diverge.
 */
export interface AppRouteDefinition {
  readonly id: string;
  readonly path: string;
  readonly element: ReactElement;
  readonly governance?: AppRouteGovernanceDeclaration;
}

export function defineAppRoutes<const TRoutes extends readonly AppRouteDefinition[]>(
  routes: TRoutes,
): TRoutes {
  return routes;
}
