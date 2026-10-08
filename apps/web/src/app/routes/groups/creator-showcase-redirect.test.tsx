// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, matchRoutes, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { appRoutes } from "./app-routes";
import { creatorRoutes } from "./creator.routes";

afterEach(() => {
  cleanup();
});

const REDIRECT_ROUTE_IDS = ["creator-challenges", "creator-promo", "creator-series", "creator-work"] as const;

function renderRedirect(initialEntry: string) {
  const routes = creatorRoutes
    .filter((route) => (REDIRECT_ROUTE_IDS as readonly string[]).includes(route.id))
    .map((route) => ({ path: route.path, element: route.element }));
  const router = createMemoryRouter(
    [...routes, { path: "*", element: null }],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("쇼케이스/크리에이트 일원화 (O-04)", () => {
  it("옛 /create 상세 주소와 정식 /showcase 주소가 각자 올바른 라우트에 매칭된다", () => {
    const expectations: ReadonlyArray<readonly [string, string]> = [
      ["/create", "creator-gallery"],
      ["/create/challenges", "creator-challenges"],
      ["/create/promo", "creator-promo"],
      ["/create/series/abc", "creator-series"],
      ["/create/abc", "creator-work"],
      ["/showcase", "creator-showcase"],
      ["/showcase/challenges", "creator-showcase-challenges"],
      ["/showcase/promo", "creator-showcase-promo"],
      ["/showcase/series/abc", "creator-showcase-series"],
      ["/showcase/work/abc", "creator-showcase-work"],
    ];
    for (const [pathname, routeId] of expectations) {
      expect(matchRoutes(appRoutes, pathname)?.at(-1)?.route.id, pathname).toBe(routeId);
    }
  });

  it("알 수 없는 주소는 여전히 404 라우트로 간다", () => {
    expect(matchRoutes(appRoutes, "/definitely-not-a-page")?.at(-1)?.route.id).toBe("not-found");
  });

  it.each([
    ["/create/challenges", "/showcase/challenges", ""],
    ["/create/challenges?c=autumn", "/showcase/challenges", "?c=autumn"],
    ["/create/promo", "/showcase/promo", ""],
    ["/create/series/s%201", "/showcase/series/s%201", ""],
    ["/create/work-1?view=reader&publicPreview=1", "/showcase/work/work-1", "?view=reader&publicPreview=1"],
  ])("옛 주소 %s를 정식 주소로 replace 리다이렉트한다", async (entry, pathname, search) => {
    const router = renderRedirect(entry);
    await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
    expect(router.state.location.search).toBe(search);
    expect(router.state.historyAction).toBe("REPLACE");
  });
});
