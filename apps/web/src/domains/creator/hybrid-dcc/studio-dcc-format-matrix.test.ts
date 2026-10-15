import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_SKP_CONVERSION_TIMEOUT_MS,
  STUDIO_BG3D_SKP_MAX_SOURCE_BYTES,
  STUDIO_BG3D_SKP_MIN_SUPPORTED_MAJOR_VERSION,
  STUDIO_BG3D_SKP_MOBILE_MAX_SOURCE_BYTES,
} from "../bg3d/studio-bg3d-skp-contract";

import {
  STUDIO_DCC_FORMAT_MATRIX,
  assertNoProprietaryInBrowserCore,
  lookupStudioFormat,
} from "./studio-dcc-format-matrix";

const MIB = 1024 * 1024;

describe("SketchUp row of the DCC format matrix", () => {
  const skp = lookupStudioFormat(".skp");

  it("describes the real implementation: browser-direct conversion with partial support, not a bridge", () => {
    expect(skp).not.toBeNull();
    expect(skp?.id).toBe("skp");
    expect(skp?.grade).toBe("B");
    expect(skp?.path).toContain("OpenSKP");
    expect(skp?.path).toContain("Worker");
    expect(skp?.path.toLowerCase()).not.toContain("bridge");
    expect(assertNoProprietaryInBrowserCore()).not.toContain("skp");
  });

  it("states the limits with the numbers the converter actually enforces", () => {
    const notes = skp?.notes ?? "";
    expect(notes).toContain(`SketchUp ${STUDIO_BG3D_SKP_MIN_SUPPORTED_MAJOR_VERSION + 2000}+`);
    expect(notes).toContain(`${STUDIO_BG3D_SKP_MAX_SOURCE_BYTES / MIB}MiB desktop`);
    expect(notes).toContain(`${STUDIO_BG3D_SKP_MOBILE_MAX_SOURCE_BYTES / MIB}MiB mobile`);
    expect(notes).toContain(`${STUDIO_BG3D_SKP_CONVERSION_TIMEOUT_MS / 1000}s limit`);
    expect(notes).toContain("static geometry only");
    expect(notes).toContain("unofficial parser (not Trimble)");
  });

  it("is reachable by id and by extension, and no other row claims the extension", () => {
    expect(lookupStudioFormat("skp")).toBe(skp);
    expect(STUDIO_DCC_FORMAT_MATRIX.filter((entry) => entry.extensions.includes(".skp"))).toHaveLength(1);
  });
});
