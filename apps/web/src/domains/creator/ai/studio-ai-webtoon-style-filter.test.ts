import { describe, expect, it } from "vitest";

import {
  StudioAiWebtoonStyleFilterEngine,
  WEBTOON_ART_STYLES,
} from "./studio-ai-webtoon-style-filter";

describe("StudioAiWebtoonStyleFilterEngine", () => {
  const engine = new StudioAiWebtoonStyleFilterEngine();

  it("lists all 5 major webtoon art styles with genre metadata", () => {
    const styles = engine.listStyles();
    expect(styles.length).toBe(5);

    expect(WEBTOON_ART_STYLES["romance-manhwa"].name).toContain("로맨스");
    expect(WEBTOON_ART_STYLES["action-shonen-ink"].name).toContain("액션");
    expect(WEBTOON_ART_STYLES["fantasy-noble-cel"].name).toContain("판타지");
    expect(WEBTOON_ART_STYLES["thriller-noir-grit"].name).toContain("스릴러");
    expect(WEBTOON_ART_STYLES["anime-cel"].name).toContain("애니");
  });

  it("compiles anime cel prompts with flat cel shading and rejects photorealism", () => {
    const result = engine.compilePrompt(
      "anime-cel",
      "주인공이 교실 창가에서 노을을 바라본다",
    );

    expect(result.positivePrompt).toContain("Japanese anime style");
    expect(result.positivePrompt).toContain("cel shading");
    expect(result.positivePrompt).toContain("주인공이 교실 창가에서 노을을 바라본다");
    expect(result.negativePrompt).toContain("photorealistic");
    expect(result.recommendedSettings.lineFactor).toBe(1.0);
    // img2img 화풍 변환 용도라 구조 보존 하한(0.35)과 과변환 상한(0.75) 안쪽.
    expect(result.denoiseStrength).toBeGreaterThanOrEqual(0.35);
    expect(result.denoiseStrength).toBeLessThanOrEqual(0.75);
  });

  it("compiles romance manhwa prompts with fine lines and soft lighting", () => {
    const result = engine.compilePrompt(
      "romance-manhwa",
      "주인공 남녀가 벚꽃 나무 아래에서 마주보고 웃는다",
    );

    expect(result.positivePrompt).toContain("Korean romance manhwa style");
    expect(result.positivePrompt).toContain("주인공 남녀가 벚꽃 나무 아래에서 마주보고 웃는다");
    expect(result.negativePrompt).toContain("rough heavy hatching");
    expect(result.recommendedSettings.lineFactor).toBeLessThan(1.0);
    expect(result.denoiseStrength).toBe(0.55);
  });

  it("compiles action ink prompts with heavy lineart and high contrast", () => {
    const result = engine.compilePrompt(
      "action-shonen-ink",
      "주인공이 검을 휘두르며 돌진하는 극적인 액션 씬",
      ["spark effects", "motion blur"],
    );

    expect(result.positivePrompt).toContain("Korean action webtoon style");
    expect(result.positivePrompt).toContain("spark effects");
    expect(result.recommendedSettings.contrast).toBeGreaterThan(1.2);
    expect(result.recommendedSettings.lineFactor).toBeGreaterThan(1.4);
  });

  it("safely falls back to default style on unknown ID", () => {
    const style = engine.getStyle("unknown" as any);
    expect(style.id).toBe("romance-manhwa");
  });
});
