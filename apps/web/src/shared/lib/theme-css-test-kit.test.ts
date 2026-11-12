import { describe, expect, it } from "vitest";

import { readThemeCustomProperties, readThemeCustomPropertiesFromCss, resolveThemeCustomProperty } from "./theme-css-test-kit";

const SAMPLE_CSS = `
  :root[data-design-theme="sample"], [data-appearance-preview="sample"] {
    --ui-palette-canvas: #070a14;
    --ui-palette-fg: #f1f4ff;
  }
  :root:is([data-design-theme="sample"],[data-design-theme="other"]) {
    --color-canvas: var(--ui-palette-canvas);
    --color-fg: var(--ui-palette-fg);
  }
  @media (forced-colors: active) {
    :root[data-design-theme] { --color-canvas: Canvas; --color-fg: CanvasText; }
  }
  @media (min-width: 640px) {
    :root[data-design-theme] { --ui-palette-canvas: #ff0000; }
    @media (forced-colors: active) {
      :root[data-design-theme] { --color-canvas: LinkText; }
    }
  }
  @supports (color: color-mix(in oklch, black, white)) {
    :root[data-design-theme] { --color-canvas: transparent; }
  }
  :root[data-design-theme] .workspace-shell { --color-canvas: #ffffff; }
`;

describe("테마 토큰 파서의 조건·별칭 경계", () => {
  it("일반 모드는 forced-colors·화면폭·supports·후손 규칙을 root 팔레트에 합치지 않는다", () => {
    const tokens = readThemeCustomPropertiesFromCss("sample", SAMPLE_CSS);
    expect(tokens.get("--color-canvas")).toBe("var(--ui-palette-canvas)");
    expect(resolveThemeCustomProperty(tokens, "--color-canvas")).toBe("#070a14");
    expect(resolveThemeCustomProperty(tokens, "--color-fg")).toBe("#f1f4ff");
  });

  it("명시한 강제 색상 모드는 시스템 색상을 유지하며 미확정 부모 조건을 우회하지 않는다", () => {
    const tokens = readThemeCustomPropertiesFromCss("sample", SAMPLE_CSS, "forced-colors");
    expect(resolveThemeCustomProperty(tokens, "--color-canvas")).toBe("Canvas");
    expect(resolveThemeCustomProperty(tokens, "--color-fg")).toBe("CanvasText");
    expect(tokens.get("--ui-palette-canvas")).toBe("#070a14");
  });

  it("실제 별빛 정본의 일반 팔레트와 forced-colors는 별도 의미를 갖는다", () => {
    const normal = readThemeCustomProperties("starlight", true);
    const forced = readThemeCustomProperties("starlight", true, "forced-colors");
    expect(resolveThemeCustomProperty(normal, "--color-canvas")).toBe("#070a14");
    expect(resolveThemeCustomProperty(normal, "--unified-canvas")).toBe("#070a14");
    expect(resolveThemeCustomProperty(forced, "--color-canvas")).toBe("Canvas");
    expect(resolveThemeCustomProperty(forced, "--unified-fg")).toBe("CanvasText");
  });

  it("누락된 별칭은 임의 색으로 대체하지 않고 실제 누락 토큰을 보고한다", () => {
    const tokens = readThemeCustomPropertiesFromCss("sample", SAMPLE_CSS
      + ":root[data-design-theme] { --color-fg: var(--missing-fg); }");
    expect(() => resolveThemeCustomProperty(tokens, "--color-fg"))
      .toThrow("테마 토큰이 없습니다: --missing-fg");
  });

  it("순환 별칭과 존재하지 않는 테마는 실패를 유지한다", () => {
    const tokens = readThemeCustomPropertiesFromCss("sample", SAMPLE_CSS
      + ":root[data-design-theme] { --color-fg: var(--color-cycle); --color-cycle: var(--color-fg); }");
    expect(() => resolveThemeCustomProperty(tokens, "--color-fg")).toThrow("테마 별칭 순환");
    expect(() => readThemeCustomPropertiesFromCss("missing", SAMPLE_CSS)).toThrow("테마 원시 팔레트가 없습니다: missing");
  });
});
