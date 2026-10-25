import { describe, expect, it } from "vitest";

import {
  buildThumbnailRecord,
  selectRepresentativeThumbnail,
} from "./studio-thumbnail-select";

describe("studio-thumbnail-select", () => {
  it("명시 선택이 있으면 그것을 쓰고 없으면 첫 페이지를 쓴다", () => {
    const pages = [
      { pageId: "p1", isFirst: true },
      { pageId: "p2", isFirst: false },
    ];
    expect(selectRepresentativeThumbnail({ pages, explicitPageId: "p2" })).toEqual({
      pageId: "p2",
      source: "explicit",
    });
    expect(selectRepresentativeThumbnail({ pages })).toEqual({
      pageId: "p1",
      source: "first-page",
    });
    expect(selectRepresentativeThumbnail({ pages: [] })).toEqual({
      pageId: null,
      source: "none",
    });
  });

  it("빈 작품 식별자는 기록을 만들지 않는다", () => {
    expect(
      buildThumbnailRecord({
        workId: "  ",
        selection: { pageId: "p1", source: "first-page" },
      }),
    ).toBeNull();
  });
});
