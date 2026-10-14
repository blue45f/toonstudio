import { describe, expect, it } from "vitest";

import { STUDIO_UI_CHROME_REGIONS, type StudioUiFirstScreenExposure } from "../../studio-ui-density";
import { STUDIO_WORK_MODES, studioWorkModeExposure } from "../../studio-work-mode";
import {
  composeStudioChromeExposure,
  studioChromeExposureFor,
  studioWorkModeAllowsRegion,
} from "./studio-work-mode-gating";

const DENSITY_VERDICTS: readonly StudioUiFirstScreenExposure[] = ["visible", "folded", "hidden"];

describe("composeStudioChromeExposure", () => {
  it("work mode 'all' is the identity on the work axis (no regression)", () => {
    for (const region of STUDIO_UI_CHROME_REGIONS) {
      for (const density of DENSITY_VERDICTS) {
        for (const expanded of [false, true]) {
          expect(studioChromeExposureFor("all", region, density, expanded)).toBe(density);
        }
      }
    }
  });

  it("density hidden is never resurrected and work mode never hides", () => {
    for (const mode of STUDIO_WORK_MODES) {
      for (const region of STUDIO_UI_CHROME_REGIONS) {
        expect(studioChromeExposureFor(mode, region, "hidden", false)).toBe("hidden");
        expect(studioChromeExposureFor(mode, region, "visible", false)).not.toBe("hidden");
      }
    }
  });

  it("folded work regions fold unless the user expanded the folded chrome", () => {
    // lettering folds toolbar-draw; draw is primary for toolbar-draw.
    expect(studioChromeExposureFor("lettering", "toolbar-draw", "visible", false)).toBe("folded");
    expect(studioChromeExposureFor("lettering", "toolbar-draw", "visible", true)).toBe("visible");
    expect(studioChromeExposureFor("lettering", "toolbar-draw", "folded", true)).toBe("folded");
  });

  it("primary regions are never folded by the work-mode axis", () => {
    for (const mode of STUDIO_WORK_MODES) {
      for (const region of STUDIO_UI_CHROME_REGIONS) {
        if (studioWorkModeExposure(mode, region) === "primary") {
          expect(studioChromeExposureFor(mode, region, "visible", false)).toBe("visible");
        }
      }
    }
  });

  it("page-strip and status-rail keep their density verdict in every mode", () => {
    for (const mode of STUDIO_WORK_MODES) {
      for (const region of ["page-strip", "status-rail"] as const) {
        expect(studioChromeExposureFor(mode, region, "visible", false)).toBe("visible");
      }
    }
  });

  it("compose keeps a density fold when the work axis is visible", () => {
    expect(composeStudioChromeExposure("folded", "visible", false)).toBe("folded");
    expect(composeStudioChromeExposure("visible", "folded", false)).toBe("folded");
    expect(composeStudioChromeExposure("visible", "primary", false)).toBe("visible");
  });
});

describe("studioWorkModeAllowsRegion", () => {
  it("is true for every region in 'all' mode", () => {
    for (const region of STUDIO_UI_CHROME_REGIONS) {
      expect(studioWorkModeAllowsRegion("all", region, false)).toBe(true);
    }
  });

  it("blocks exactly the folded regions of a stage mode", () => {
    for (const region of STUDIO_UI_CHROME_REGIONS) {
      const folded = studioWorkModeExposure("storyboard", region) === "folded";
      expect(studioWorkModeAllowsRegion("storyboard", region, false)).toBe(!folded);
      expect(studioWorkModeAllowsRegion("storyboard", region, true)).toBe(true);
    }
  });
});
