import { describe, expect, it } from "vitest";

import { studioCharmFavoriteIds } from "./studio-charm-favorites";

describe("기존 즐겨찾기 → 참 ID", () => {
  it("자산 즐겨찾기는 네임스페이스에 맞는 참으로, 요소 즐겨찾기는 요소 참으로 옮긴다", () => {
    const result = studioCharmFavoriteIds(
      ["raster:builtin-raster-daily-cafe", "local:asset-1", "community:shared-9", "nonsense", "raster:bad id"],
      ["decor-burst-lines", "bad id"],
    );
    expect([...result].sort()).toEqual([
      "element:decor-burst-lines",
      "library:asset-1",
      "raster:builtin-raster-daily-cafe",
    ]);
  });

  it("입력이 비어 있으면 빈 집합이다", () => {
    expect(studioCharmFavoriteIds([], []).size).toBe(0);
  });
});
