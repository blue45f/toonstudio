// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, matchRoutes, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { STUDIO_ROUTE_REGISTRY } from "../../../domains/creator/studio-route-registry";
import { appRoutes } from "./app-routes";
import { creatorRoutes } from "./creator.routes";

afterEach(() => {
  cleanup();
});

/**
 * 레지스트리 별칭 계약 (F-B21-1 재발 방지).
 *
 * `STUDIO_ROUTE_REGISTRY`의 `aliases`는 선언만으로 라우팅이 생기지 않는다 —
 * 실제 전이는 라우트 테이블에 별도 항목(Navigate 또는 와일드카드 내부 처리)이
 * 있어야 한다. /motion-webtoon이 선언만 있고 항목이 없어 전역 404로 떨어진
 * 사고가 있어서, 선언된 별칭 전수가 not-found가 아닌 실제 라우트에 닿는지를
 * 고정한다.
 */
describe("studio route registry alias contract", () => {
  it("resolves every declared registry alias to a real route, never the global 404", () => {
    const unresolved: string[] = [];
    for (const registration of STUDIO_ROUTE_REGISTRY) {
      for (const alias of registration.aliases) {
        const matchedId = matchRoutes(appRoutes, alias)?.at(-1)?.route.id;
        if (!matchedId || matchedId === "not-found") {
          unresolved.push(`${registration.id}: ${alias}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it("matches /motion-webtoon to its dedicated alias route", () => {
    expect(matchRoutes(appRoutes, "/motion-webtoon")?.at(-1)?.route.id).toBe("creator-motion-webtoon");
    expect(matchRoutes(appRoutes, "/studio/motion-webtoon")?.at(-1)?.route.id).toBe(
      "creator-studio-motion-webtoon",
    );
  });

  it("replaces /motion-webtoon with the canonical /studio/motion-webtoon", async () => {
    const aliasRoute = creatorRoutes.find((route) => route.id === "creator-motion-webtoon");
    expect(aliasRoute).toBeDefined();
    const router = createMemoryRouter(
      [
        { path: aliasRoute!.path, element: aliasRoute!.element },
        { path: "/studio/motion-webtoon", element: null },
        { path: "*", element: null },
      ],
      { initialEntries: ["/motion-webtoon"] },
    );
    render(<RouterProvider router={router} />);
    await waitFor(() => expect(router.state.location.pathname).toBe("/studio/motion-webtoon"));
    expect(router.state.historyAction).toBe("REPLACE");
  });
});
