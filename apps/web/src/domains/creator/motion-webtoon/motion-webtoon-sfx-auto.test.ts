import { describe, expect, it } from "vitest";

import { buildCutSfxCues, mapCutToSfxKinds } from "./motion-webtoon-sfx-auto";

describe("motion-webtoon-sfx-auto", () => {
  it("대사 단서에서 효과음 종류를 고른다", () => {
    expect(
      mapCutToSfxKinds({ dialogues: ["심장이 두근거려"], moodHint: "" }),
    ).toEqual(["heartbeat"]);
    expect(mapCutToSfxKinds({ dialogues: ["조용히 속삭였다"], moodHint: "" })).toEqual([
      "soft",
    ]);
  });

  it("단서가 없으면 빈 큐를 만든다", () => {
    expect(buildCutSfxCues({ dialogues: ["안녕"], moodHint: "" })).toEqual([]);
  });
});
