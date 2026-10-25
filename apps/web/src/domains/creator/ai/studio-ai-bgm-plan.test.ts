import { describe, expect, it } from "vitest";

import {
  buildBgmPlacementPrompt,
  parseBgmPlacement,
} from "./studio-ai-bgm-plan";

describe("studio-ai-bgm-plan", () => {
  it("컷 목록을 배치 계획 프롬프트로 만든다", () => {
    const prompt = buildBgmPlacementPrompt([
      { cutId: "cut-1", moodHint: "긴장", dialogues: [] },
    ]);
    expect(prompt).toContain("cut-1");
    expect(prompt).toContain("bgmMood");
  });

  it("배치 계획 결과를 검증한다", () => {
    const parsed = parseBgmPlacement(
      JSON.stringify({
        placements: [{ cutId: "cut-1", bgmMood: "tension", sfxCues: ["heartbeat"] }],
      }),
    );
    expect(parsed).toHaveLength(1);
    expect(
      parseBgmPlacement(
        JSON.stringify({
          placements: [{ cutId: "cut-1", bgmMood: "unknown", sfxCues: [] }],
        }),
      ),
    ).toBeNull();
  });
});
