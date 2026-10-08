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

describe("StudioBrushLabPage 비-리믹스 상태 표시 (2026-10-08 소형 잔여 처분)", () => {
  it("적용 범위 밴드의 렌더 조건은 리믹스 하나뿐이다", () => {
    const bandConditions = SOURCE.match(/context\.kind === "[a-z]+"/g) ?? [];
    expect(bandConditions).toEqual(['context.kind === "remix"']);
  });

  it("모든 컨텍스트의 상태 표시는 헤더 제목·컨텍스트 라벨이 담당한다", () => {
    expect(SOURCE).toContain("{context.workspaceTitle}");
    expect(SOURCE).toContain("{context.contextLabel}");
  });

  it("제작 프로젝트 현황 스트립은 붙이지 않는다 — 이 표면은 제작 프로젝트 종속이 아니다", () => {
    // ProductionProjectStatusStrip은 ProductionProjectAggregate가 전제라
    // 작품·문서 스코프 편집 표면인 브러시 랩에는 해당하지 않는다.
    // (페이지 주석이 이름으로 언급하므로 import·렌더 사용 여부로 검사한다.)
    expect(SOURCE).not.toMatch(/import[^;]*ProductionProjectStatusStrip/);
    expect(SOURCE).not.toContain("<ProductionProjectStatusStrip");
  });
});
