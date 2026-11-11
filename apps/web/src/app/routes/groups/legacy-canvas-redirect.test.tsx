// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { legacyRedirectRoutes } from "./legacy.routes";

const routers: ReturnType<typeof createMemoryRouter>[] = [];
function openRedirect(entry: string, routeId = "legacy-canvas", previous?: string) {
  const route = legacyRedirectRoutes.find((item) => item.id === routeId);
  if (!route?.path) throw new Error("검증할 별칭 경로가 없습니다.");
  const router = createMemoryRouter([
    { path: route.path, element: route.element },
    { path: "*", element: null },
  ], { initialEntries: previous ? [previous, entry] : [entry] });
  routers.push(router);
  render(<RouterProvider router={router} />);
  return router;
}
afterEach(() => {
  cleanup();
  for (const router of routers) router.dispose();
  routers.length = 0;
});

describe("캔버스 별칭의 작업 문맥 보존", () => {
  it.each([
    ["/canvas", "", ""],
    ["/canvas?uiMode=focus&startTool=draw#page-2", "?uiMode=focus&startTool=draw", "#page-2"],
    ["/canvas?id=work-1&room=team-a&memo=a%20b&memo=c+d#page%3A2", "?id=work-1&room=team-a&memo=a%20b&memo=c+d", "#page%3A2"],
    ["/canvas?uiMode=basic&uiMode=full#layer-3", "?uiMode=basic&uiMode=full", "#layer-3"],
  ])("%s의 query/hash를 파싱하거나 바꾸지 않고 정본으로 넘긴다", async (entry, search, hash) => {
    const router = openRedirect(entry);
    await waitFor(() => expect(router.state.location.pathname).toBe("/studio/canvas"));
    expect(router.state.location.search).toBe(search);
    expect(router.state.location.hash).toBe(hash);
    expect(router.state.historyAction).toBe("REPLACE");
  });

  it("뒤로 가기가 별칭으로 되돌아와 다시 이동하지 않는다", async () => {
    const router = openRedirect("/canvas?id=work-1&uiMode=basic#page-1", "legacy-canvas", "/before");
    await waitFor(() => expect(router.state.location.pathname).toBe("/studio/canvas"));
    await act(async () => { await router.navigate(-1); });
    expect(router.state.location.pathname).toBe("/before");
  });

  it("캔버스 문맥 전달을 무관한 별칭으로 넓히지 않는다", async () => {
    const router = openRedirect("/new?uiMode=focus#page-1", "legacy-new");
    await waitFor(() => expect(router.state.location.pathname).toBe("/create"));
    expect(router.state.location.search).toBe("");
    expect(router.state.location.hash).toBe("");
    expect(router.state.historyAction).toBe("REPLACE");
  });
});
