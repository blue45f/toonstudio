// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, matchRoutes, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { appRoutes } from "./app-routes";
import { communityRoutes } from "./community.routes";

afterEach(() => {
  cleanup();
});

function renderRedirect(initialEntry: string) {
  const routes = communityRoutes
    .filter((route) => route.id === "collaboration-workspace")
    .map((route) => ({ path: route.path, element: route.element }));
  const router = createMemoryRouter(
    [...routes, { path: "*", element: null }],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("구인 워크스페이스 URL 일원화 (O-10)", () => {
  it("정식 /team/recruiting과 옛 /collaborate/workspace가 각자 올바른 라우트에 매칭된다", () => {
    const expectations: ReadonlyArray<readonly [string, string]> = [
      ["/team/recruiting", "team-recruiting"],
      ["/collaborate/workspace", "collaboration-workspace"],
    ];
    for (const [pathname, routeId] of expectations) {
      expect(matchRoutes(appRoutes, pathname)?.at(-1)?.route.id, pathname).toBe(routeId);
    }
  });

  it.each([
    ["/collaborate/workspace", "/team/recruiting", "", ""],
    ["/collaborate/workspace?panel=availability", "/team/recruiting", "?panel=availability", ""],
    ["/collaborate/workspace#offer", "/team/recruiting", "", "#offer"],
  ])("옛 주소 %s를 정식 주소로 replace 리다이렉트한다", async (entry, pathname, search, hash) => {
    const router = renderRedirect(entry);
    await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
    expect(router.state.location.search).toBe(search);
    expect(router.state.location.hash).toBe(hash);
    expect(router.state.historyAction).toBe("REPLACE");
  });
});
