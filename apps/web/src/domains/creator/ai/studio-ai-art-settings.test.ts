import { describe, expect, it } from "vitest";

import {
  applyArtSettingsToNewEpisode,
  sanitizeArtSettings,
} from "./studio-ai-art-settings";

describe("studio-ai-art-settings", () => {
  it("팔레트 중복을 제거하고 신규 회차 기본값으로 주입한다", () => {
    const defaults = applyArtSettingsToNewEpisode({
      styleDnaProfileId: "style-1",
      palette: ["파스텔", "파스텔", "  "],
      lineStyle: "얇은 선",
    });
    expect(defaults.palette).toEqual(["파스텔"]);
    expect(defaults.inheritedFromWork).toBe(true);
  });

  it("빈 설정은 상속 없음으로 표시한다", () => {
    const defaults = applyArtSettingsToNewEpisode(
      sanitizeArtSettings({
        styleDnaProfileId: null,
        palette: [],
        lineStyle: null,
      }),
    );
    expect(defaults.inheritedFromWork).toBe(false);
  });
});
