import { describe, expect, it } from "vitest";

import {
  WEBTOON_ART_STYLES,
  compileWebtoonModelerToImageGen,
  createDefaultWebtoonModelerScene,
} from "./webtoon-modeler-imagegen";

describe("webtoon-modeler-imagegen", () => {
  it("8종 웹툰 화풍과 4패스 선화 보존 옵션을 정확히 컴파일한다", () => {
    expect(WEBTOON_ART_STYLES.length).toBe(8);
    const scene = createDefaultWebtoonModelerScene();
    const compiled = compileWebtoonModelerToImageGen(scene);

    expect(compiled.width).toBe(800);
    expect(compiled.height).toBe(1424);
    expect(compiled.renderPasses).toEqual(["lineart", "flat-color", "cel-shade", "composite"]);
    expect(compiled.characterConsistencyTokens).toEqual([
      { characterId: "char-lead-1", name: "강지훈", token: "CHAR-JIHUN-V1" },
    ]);
    expect(compiled.positivePrompt).toContain("CHAR-JIHUN-V1");
    expect(compiled.previewSvg).toContain("<svg");
    expect(compiled.previewSvg).toContain("강지훈");
  });

  it("선화 패스 보존을 끄면 composite 단일 패스로 컴파일하고 조립형 3D 키트와 부분 수정을 반영한다", () => {
    const scene = {
      ...createDefaultWebtoonModelerScene(),
      aspectRatio: "1:1" as const,
      preserveLineartPass: false,
      modular3dKit: "rofan-palace-hall" as const,
      sceneAnchorId: "ANCHOR-PALACE-02",
      partialInpaintRegion: "character-face" as const,
    };
    const compiled = compileWebtoonModelerToImageGen(scene);
    expect(compiled.width).toBe(960);
    expect(compiled.height).toBe(960);
    expect(compiled.renderPasses).toEqual(["composite"]);
    expect(compiled.positivePrompt).toContain("ANCHOR-PALACE-02");
    expect(compiled.positivePrompt).toContain("character-face");
    expect(compiled.positivePrompt).toContain("baroque fantasy palace");
  });
});
