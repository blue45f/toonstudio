import { describe, expect, it } from "vitest";

import {
  extractPngRightsTextChunk,
  injectPngRightsTextChunk,
  isValidPngBytes,
} from "./studio-png-rights-chunk-codec";

// Minimal valid 1x1 transparent PNG
const MINIMAL_PNG = new Uint8Array([
  137, 80, 78, 71, 13, 10, 26, 10, // PNG signature
  0, 0, 0, 13, 73, 72, 68, 82, // IHDR length + type
  0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, // IHDR data
  31, 21, 196, 137, // IHDR CRC
  0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130, // IEND
]);

describe("studio-png-rights-chunk-codec", () => {
  it("injects and extracts a ToonStudioRightsBOM tEXt chunk round-trip with UTF-8 Korean payload", () => {
    const payload = JSON.stringify({
      packId: "rofan-episode1-starter",
      packName: "로맨스판타지 1화 세팅 팩",
      cleared: true,
      hash: "fnv1a-1a2b3c4d",
    });

    const injected = injectPngRightsTextChunk(MINIMAL_PNG, "ToonStudioRightsBOM", payload);
    expect(isValidPngBytes(injected)).toBe(true);
    expect(injected.length).toBeGreaterThan(MINIMAL_PNG.length);

    const extracted = extractPngRightsTextChunk(injected, "ToonStudioRightsBOM");
    expect(extracted).toBe(payload);
  });

  it("returns null for non-PNG bytes or missing keyword", () => {
    expect(extractPngRightsTextChunk(new Uint8Array([1, 2, 3, 4]))).toBeNull();
    expect(extractPngRightsTextChunk(MINIMAL_PNG, "ToonStudioRightsBOM")).toBeNull();
  });
});
