import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./studio-canvas-start-dock.css", import.meta.url), "utf8");

describe("시작 도크의 독립 조작 영역", () => {
  it("전역 #main-content 기본 높이보다 좁은 범위에서 44px를 보장한다", () => {
    const ownRule = css.match(/#main-content \.studio-canvas-start :where\(button\)\s*\{([^}]+)\}/u)?.[1];
    expect(ownRule).toContain("min-block-size: 44px;");
    expect(ownRule).toContain("min-inline-size: 44px;");
  });

  it("가로 스크롤 예시 목록에도 일반·고대비 focus-visible 윤곽선을 제공한다", () => {
    const focusRules = css.match(/\.studio-canvas-start :where\(button, \.studio-cinematic-canvas-welcome__scene-strip\):focus-visible\s*\{[^}]+\}/gu) ?? [];
    expect(focusRules).toHaveLength(2);
    expect(focusRules[0]).toContain("outline: 2px solid var(--color-accent)");
    expect(focusRules[1]).toContain("outline-color: Highlight");
  });
});
