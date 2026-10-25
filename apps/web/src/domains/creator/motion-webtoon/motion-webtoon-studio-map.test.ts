import { describe, expect, it } from "vitest";

import { mapStudioCutsToMotionEpisode } from "./motion-webtoon-studio-map";

describe("motion-webtoon-studio-map", () => {
  it("스튜디오 컷을 기본 연출이 입혀진 모션 회차로 바꾼다", () => {
    const result = mapStudioCutsToMotionEpisode({
      episodeId: "ep-1",
      titleKo: "1화",
      cuts: [
        { id: "c1", imageUrl: "https://예시.example/c1.png", altKo: "첫 컷", dialogues: [] },
        { id: "c2", imageUrl: "https://예시.example/c2.png", altKo: "둘째 컷", dialogues: [] },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.episode.cuts).toHaveLength(2);
    expect(result.episode.cuts[0]?.transitionIn).toBe("cut");
    expect(result.episode.cuts[0]?.bgm.sceneMood).toBe("daily");
  });

  it("빈 컷 목록과 빈 이미지는 거부한다", () => {
    expect(
      mapStudioCutsToMotionEpisode({ episodeId: "e", titleKo: "t", cuts: [] }),
    ).toEqual({ ok: false, reason: "empty_cuts" });
    expect(
      mapStudioCutsToMotionEpisode({
        episodeId: "e",
        titleKo: "t",
        cuts: [{ id: "c1", imageUrl: "", altKo: "", dialogues: [] }],
      }),
    ).toEqual({ ok: false, reason: "empty_image" });
  });
});
