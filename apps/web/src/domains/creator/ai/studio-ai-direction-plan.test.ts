import { describe, expect, it } from "vitest";

import {
  buildDirectionPlanPrompt,
  parseDirectionPlan,
} from "./studio-ai-direction-plan";

describe("studio-ai-direction-plan", () => {
  it("컷 목록을 연출 설계 프롬프트로 만든다", () => {
    const prompt = buildDirectionPlanPrompt([
      { cutId: "cut-1", summary: "재회", dialogues: ["안녕"] },
    ]);
    expect(prompt).toContain("cut-1");
    expect(prompt).toContain("cameraMove");
  });

  it("연출 설계 결과를 검증하고 허용 목록 밖 값은 거부한다", () => {
    const parsed = parseDirectionPlan(
      JSON.stringify({
        plans: [
          {
            cutId: "cut-1",
            cameraMove: "zoom-in",
            transition: "fade",
            bgmMood: "romance",
            sfxCues: ["soft"],
          },
        ],
      }),
    );
    expect(parsed).toHaveLength(1);
    expect(
      parseDirectionPlan(
        JSON.stringify({
          plans: [
            {
              cutId: "cut-1",
              cameraMove: "fly",
              transition: "fade",
              bgmMood: "romance",
              sfxCues: [],
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("코드 펜스로 감싼 JSON도 파싱한다", () => {
    const parsed = parseDirectionPlan(
      "```json\n" +
        JSON.stringify({
          plans: [
            {
              cutId: "cut-1",
              cameraMove: "zoom-in",
              transition: "fade",
              bgmMood: "romance",
              sfxCues: ["soft"],
            },
          ],
        }) +
        "\n```",
    );
    expect(parsed).toHaveLength(1);
  });
});
