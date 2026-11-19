import { describe, expect, it } from "vitest";

import { BUILTIN_STUDIO_WORKFLOW_PACKS } from "./studio-workflow-pack";
import {
  WORKFLOW_PACK_QUERY_PARAM,
  buildWorkflowPackShareUrl,
  decodeWorkflowPackDeepLink,
  encodeWorkflowPackDeepLink,
  extractWorkflowPackFromSearch,
} from "./studio-workflow-pack-deeplink";

describe("studio-workflow-pack-deeplink", () => {
  it("encodes and decodes a Korean workflow pack losslessly", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[0];
    const token = encodeWorkflowPackDeepLink(pack);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeWorkflowPackDeepLink(token)).toEqual(pack);
  });

  it("builds a share URL and extracts the workflow pack back from location.search", () => {
    const pack = BUILTIN_STUDIO_WORKFLOW_PACKS[2];
    const shareUrl = buildWorkflowPackShareUrl(pack, "http://localhost:5173/studio");
    const parsed = new URL(shareUrl);
    expect(parsed.searchParams.has(WORKFLOW_PACK_QUERY_PARAM)).toBe(true);
    expect(extractWorkflowPackFromSearch(parsed.search)).toEqual(pack);
  });

  it("returns null for malformed, oversized, or non-matching deep links", () => {
    expect(decodeWorkflowPackDeepLink("")).toBeNull();
    expect(decodeWorkflowPackDeepLink("!!!invalid-base64!!!")).toBeNull();
    expect(decodeWorkflowPackDeepLink("a".repeat(9000))).toBeNull();
    expect(extractWorkflowPackFromSearch("?other=1")).toBeNull();
  });
});
