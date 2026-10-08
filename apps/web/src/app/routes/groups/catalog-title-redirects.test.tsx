// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, matchRoutes, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { appRoutes } from "./app-routes";
import { catalogRoutes } from "./catalog.routes";

afterEach(() => {
  cleanup();
});

function renderRedirect(initialEntry: string) {
  const routes = catalogRoutes
    .filter((route) => route.id === "catalog-title-episodes")
    .map((route) => ({ path: route.path, element: route.element }));
  const router = createMemoryRouter(
    [...routes, { path: "*", element: null }],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("작품 회차 목록 주소 호환 (F-B13-2)", () => {
  it("/title/:slug/episodes가 전용 라우트에 매칭되고 상세·뷰어 라우트는 그대로다", () => {
    expect(matchRoutes(appRoutes, "/title/nw-20853/episodes")?.at(-1)?.route.id).toBe("catalog-title-episodes");
    expect(matchRoutes(appRoutes, "/title/nw-20853")?.at(-1)?.route.id).toBe("catalog-title");
    expect(matchRoutes(appRoutes, "/title/nw-20853/read/3")?.at(-1)?.route.id).toBe("catalog-title-read");
  });

  it.each([
    ["/title/nw-20853/episodes", "/title/nw-20853", "", "#episodes"],
    ["/title/nw-20853/episodes?from=share", "/title/nw-20853", "?from=share", "#episodes"],
    ["/title/s%201/episodes", "/title/s%201", "", "#episodes"],
  ])("옛 주소 %s를 작품 상세 회차 섹션으로 replace 리다이렉트한다", async (entry, pathname, search, hash) => {
    const router = renderRedirect(entry);
    await waitFor(() => expect(router.state.location.pathname).toBe(pathname));
    expect(router.state.location.search).toBe(search);
    expect(router.state.location.hash).toBe(hash);
    expect(router.state.historyAction).toBe("REPLACE");
  });
});
