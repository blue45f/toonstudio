import { describe, expect, it } from "vitest";
import { legacyStudioEditorHref } from "./studio-entry-redirect";
import { STUDIO_DRAFT_CANVAS_PATHNAME } from "@/domains/creator/studio-workspace-route";

describe("market editor entry", () => {
  it.each(["?id=work-1&room=team-a", "?remix=source-1", "?tool=draw"])("첫 편집기 이동에서도 앵커를 유지한다: %s", (search) => {
    expect(legacyStudioEditorHref("/studio", search, "#studio-canvas-workspace"))
      .toBe(`${STUDIO_DRAFT_CANVAS_PATHNAME}${search}#studio-canvas-workspace`);
  });
  it.each([
    "?installMarketResource=release-1&assetMarket=community",
    "?assetMarket=community&installMarketResource=release-2",
    "?assetMarket=community&communityView=share",
    "?tool=draw", "?id=existing-work&mode=edit",
  ])("preserves the complete editor query: %s", search => {
    expect(legacyStudioEditorHref("/studio", search)).toBe(`${STUDIO_DRAFT_CANVAS_PATHNAME}${search}`);
  });
  it.each(["", "?utm_source=market", "?assetMarket=community"])("does not create an editor from unrelated home state: %s", search => {
    expect(legacyStudioEditorHref("/studio", search)).toBeNull();
  });
  it.each(["/market", "/studio/canvas", "/studio/work/existing"])("preserves non-home routes: %s", pathname => {
    expect(legacyStudioEditorHref(pathname, "?installMarketResource=release-1")).toBeNull();
  });
});
