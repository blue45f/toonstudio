import { describe, expect, it } from "vitest";

import {
  STUDIO_VIRTUAL_PLACES,
  studioVirtualPlacesForMode,
} from "./studio-virtual-space-place-catalog";

describe("Virtual Studio place catalog", () => {
  it("각 장소를 실제 번들 미리보기와 룸 식별자에 연결한다", () => {
    expect(STUDIO_VIRTUAL_PLACES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(STUDIO_VIRTUAL_PLACES.map((item) => item.id)).size).toBe(STUDIO_VIRTUAL_PLACES.length);
    for (const place of STUDIO_VIRTUAL_PLACES) {
      expect(place.previewUrl).toMatch(/^\/assets\/virtual-studio\/(imagegen25-v7\/places\/[a-z0-9-]+\.webp|toon-office-v1\/hq-preview\.webp|office-themes-v1\/(forest-atelier|orbital-observatory|tidal-atelier)\.png)$/u);
      expect(place.roomId.length).toBeGreaterThan(0);
    }
  });

  it("removes project-only rooms from personal mode", () => {
    expect(studioVirtualPlacesForMode(true).some((item) => item.projectOnly)).toBe(false);
    expect(studioVirtualPlacesForMode(false).some((item) => item.projectOnly)).toBe(true);
  });
});
