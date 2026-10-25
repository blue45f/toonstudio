import { describe, expect, it } from "vitest";

import { copySettingsToNewWork } from "./studio-settings-handover";

describe("studio-settings-handover", () => {
  it("선택한 설정만 사본으로 이관하고 계보를 남긴다", () => {
    const handover = copySettingsToNewWork({
      source: {
        workId: "sample",
        bibleSummary: "민지 설정",
        styleDnaProfileId: "style-1",
        palette: ["파스텔"],
        synopsis: "전체 줄거리",
      },
      toWorkId: "new-1",
      includeBible: true,
      includeStyle: false,
      includeSynopsis: true,
      now: 7,
    });
    expect(handover?.bibleSummary).toBe("민지 설정");
    expect(handover?.styleDnaProfileId).toBeNull();
    expect(handover?.copiedFields).toEqual(["bible", "synopsis"]);
    expect(handover?.copiedAt).toBe(7);
  });

  it("빈 새 작품 식별자는 이관하지 않는다", () => {
    expect(
      copySettingsToNewWork({
        source: {
          workId: "sample",
          bibleSummary: null,
          styleDnaProfileId: null,
          palette: [],
          synopsis: null,
        },
        toWorkId: "  ",
        includeBible: true,
        includeStyle: true,
        includeSynopsis: true,
      }),
    ).toBeNull();
  });
});
