import { describe, expect, it } from "vitest";

import { checkDialogueSync } from "../studio-dialogue-sync";

describe("studio-dialogue-sync", () => {
  it("세 가지 불일치를 모두 찾아낸다", () => {
    const mismatches = checkDialogueSync({
      storyboard: [
        { cutId: "c1", lines: ["안녕"] },
        { cutId: "c2", lines: ["잘 가"] },
        { cutId: "c3", lines: [] },
      ],
      balloons: [
        { cutId: "c1", text: "안녕" },
        { cutId: "c2", text: "또 봐" },
        { cutId: "c9", text: "없던 대사" },
      ],
    });
    expect(mismatches.map((item) => `${item.cutId}:${item.kind}`)).toEqual([
      "c2:changed",
      "c9:missing-storyboard",
    ]);
  });

  it("일치하면 빈 목록을 돌려준다", () => {
    expect(
      checkDialogueSync({
        storyboard: [{ cutId: "c1", lines: ["안녕"] }],
        balloons: [{ cutId: "c1", text: "안녕" }],
      }),
    ).toEqual([]);
  });
});
