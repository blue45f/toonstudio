// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, matchRoutes, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { appRoutes } from "./app-routes";
import { productionRoutes } from "./production.routes";

afterEach(() => {
  cleanup();
});

const REDIRECT_ROUTE_IDS = [
  "production-workspaces",
  "production-workspace-join",
  "production-workspace-detail",
  "production-workspace-usage",
] as const;

function renderRedirect(initialEntry: string) {
  const routes = productionRoutes
    .filter((route) => (REDIRECT_ROUTE_IDS as readonly string[]).includes(route.id))
    .map((route) => ({ path: route.path, element: route.element }));
  const router = createMemoryRouter(
    [...routes, { path: "*", element: null }],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("팀 워크스페이스 URL 일원화 (O-03)", () => {
  it("옛 /production/workspaces 주소와 정식 /team/people 주소가 각자 올바른 라우트에 매칭된다", () => {
    const expectations: ReadonlyArray<readonly [string, string]> = [
      ["/team/people", "team-people"],
      ["/team/people/join", "team-people-join"],
      ["/team/people/ws-1", "team-people-detail"],
      ["/team/people/ws-1/usage", "team-people-usage"],
      ["/production/workspaces", "production-workspaces"],
      ["/production/workspaces/join", "production-workspace-join"],
      ["/production/workspaces/ws-1", "production-workspace-detail"],
      ["/production/workspaces/ws-1/usage", "production-workspace-usage"],
    ];
    for (const [pathname, routeId] of expectations) {
      expect(matchRoutes(appRoutes, pathname)?.at(-1)?.route.id, pathname).toBe(routeId);
    }
  });

  it.each([
    ["/production/workspaces", "/team/people", "", ""],
    ["/production/workspaces?tab=members", "/team/people", "?tab=members", ""],
    ["/production/workspaces/join", "/team/people/join", "", ""],
    ["/production/workspaces/join?token=abc123", "/team/people/join", "?token=abc123", ""],
    ["/production/workspaces/join#invite=xyz", "/team/people/join", "", "#invite=xyz"],
    ["/production/workspaces/ws-1", "/team/people/ws-1", "", ""],
    ["/production/workspaces/ws%201", "/team/people/ws%201", "", ""],
    ["/production/workspaces/ws-1/usage", "/team/people/ws-1/usage", "", ""],
    ["/production/workspaces/ws-1/usage?from=hub", "/team/people/ws-1/usage", "?from=hub", ""],
  ])("옛 주소 %s를 정식 주소로 replace 리다이렉트한다", async (entry, pathname, search, hash) => {
    const router = renderRedirect(entry);
    await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
    expect(router.state.location.search).toBe(search);
    expect(router.state.location.hash).toBe(hash);
    expect(router.state.historyAction).toBe("REPLACE");
  });
});
