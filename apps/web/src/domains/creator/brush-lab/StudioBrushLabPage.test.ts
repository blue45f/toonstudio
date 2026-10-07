import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const SOURCE = readFileSync(
  new URL("./StudioBrushLabPage.tsx", import.meta.url),
  "utf8",
);

describe("StudioBrushLabPage remix context", () => {
  it("리믹스 컨텍스트에서만 적용 범위를 알리는 상태 밴드를 보여 준다", () => {
    // 밴드는 remix 종류일 때만 렌더링한다 — 다른 진입(새 브러시·원고·브러시 편집)에는 붙지 않는다.
    expect(SOURCE).toContain('context.kind === "remix"');
    expect(SOURCE).toContain("리믹스 작업 중");
    expect(SOURCE).toContain("리믹스 원고에만 적용되고, 원본 작품은 바뀌지 않아요");
  });

  it("편집 본체(카탈로그·워크벤치)는 컨텍스트와 무관하게 유지한다", () => {
    expect(SOURCE).toContain("<StudioBrushProductCataloguePanel");
    expect(SOURCE).toContain("<StudioBrushIntegratedWorkbench scope={context.scope} />");
  });
});
