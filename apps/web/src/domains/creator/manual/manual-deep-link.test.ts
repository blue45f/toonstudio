import { describe, expect, it } from "vitest";

import { parseReturnContext } from "@/shared/navigation/return-context";

import { manualSectionToolHref, manualWorkspaceHref } from "./manual-deep-link";

describe("manual-deep-link (S2-9 매뉴얼 도착 지점)", () => {
  it("carries the return-context contract on workspace links", () => {
    const href = manualWorkspaceHref({ id: "music-ost", workspace: "/studio/assets/audio" });
    expect(href).toBe(
      "/studio/assets/audio?returnTo=%2Fstudio%2Fmanual%2Fmusic-ost&intent=manual-deep-link",
    );
    // 도착 표면(S2-8 ReturnContextBanner)이 읽는 계약으로 왕복된다.
    const search = href.slice(href.indexOf("?"));
    expect(parseReturnContext(search)).toEqual({
      returnTo: "/studio/manual/music-ost",
      intent: "manual-deep-link",
    });
  });

  it("keeps the section anchor as execution context on section tool links", () => {
    const href = manualSectionToolHref("music-ost", { href: "/studio/assets/audio#music-import" });
    expect(href).toBe(
      "/studio/assets/audio?returnTo=%2Fstudio%2Fmanual%2Fmusic-ost&intent=manual-deep-link#music-import",
    );
    const search = href.slice(href.indexOf("?"), href.indexOf("#"));
    expect(parseReturnContext(search)).toEqual({
      returnTo: "/studio/manual/music-ost",
      intent: "manual-deep-link",
    });
  });

  it("adds the contract to section tools without an anchor, unchanged otherwise", () => {
    expect(manualSectionToolHref("getting-started", { href: "/studio/new" })).toBe(
      "/studio/new?returnTo=%2Fstudio%2Fmanual%2Fgetting-started&intent=manual-deep-link",
    );
    expect(manualSectionToolHref("ai-director", { href: "/settings/ai" })).toBe(
      "/settings/ai?returnTo=%2Fstudio%2Fmanual%2Fai-director&intent=manual-deep-link",
    );
  });
});
