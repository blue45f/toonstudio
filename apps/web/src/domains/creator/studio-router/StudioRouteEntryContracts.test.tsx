// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resolveStudioRoute } from "./studio-route-manifest";
import { StudioRoutePlaceholder } from "./StudioRouteFallbacks";

afterEach(cleanup);

describe("Studio collaboration route gateways", () => {
  // Review is now an actual production surface, not a placeholder. Keep its
  // work/remix route ownership covered without reintroducing the retired guide.
  it.each([
    "/studio/review",
    "/studio/work/work-1/review",
    "/studio/remix/source-1/review",
  ])("routes %s to the production review workspace instead of a dead end", (pathname) => {
    const route = resolveStudioRoute({ pathname });
    expect(route).toMatchObject({
      kind: "production",
      surface: "review",
      canonicalPathname: pathname,
      ownsDocumentTitle: true,
    });
  });

  // Work/remix assets are now an actual asset grid surface, not a placeholder.
  // The unscoped /studio/assets guidance below stays only as the hub-shadowed fallback.
  it.each([
    ["/studio/work/work-1/assets", "/studio/work/work-1/canvas", "work-1", null],
    ["/studio/remix/source-1/assets", "/studio/remix/source-1/canvas", null, "source-1"],
  ])("routes %s to the work asset grid instead of the placeholder", (pathname, editorHref, workId, remixSourceWorkId) => {
    const route = resolveStudioRoute({ pathname });
    expect(route).toMatchObject({
      kind: "assets",
      canonicalPathname: pathname,
      ownsDocumentTitle: true,
      editorHref,
      workId,
      remixSourceWorkId,
    });
    expect(route).not.toHaveProperty("placeholderId");
  });

  it("keeps asset guidance and its working editor exit outside the collaboration contract", () => {    const onOpenStudio = vi.fn();
    render(
      <MemoryRouter>
        <StudioRoutePlaceholder placeholderId="assets" onOpenStudio={onOpenStudio} />
      </MemoryRouter>
    );

    expect(document.querySelector("[data-studio-collaboration-gateway]")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("에셋");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "에셋을 사용할 Studio 열기" }));
    expect(onOpenStudio).toHaveBeenCalledOnce();
  });
});
