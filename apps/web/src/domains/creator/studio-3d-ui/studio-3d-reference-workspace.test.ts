import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./studio-3d-reference-workspace.css", import.meta.url), "utf8");
function block(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`필수 스타일 누락: ${selector}`);
  return css.slice(start, css.indexOf("}", start));
}
function color(source: string, token: string): string {
  const match = new RegExp(`${token}:\\s*(#[0-9a-f]{6});`, "u").exec(source);
  if (!match) throw new Error(`색상 토큰 누락: ${token}`);
  return match[1]!;
}
function luminance(hex: string): number {
  return [0.2126, 0.7152, 0.0722].reduce((sum, weight, index) => {
    const channel = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
    return sum + weight * (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  }, 0);
}
function contrast(a: string, b: string): number {
  const values = [luminance(a), luminance(b)].sort((left, right) => right - left);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("3D 작업면의 잠금 상태 가독성", () => {
  it.each(["[data-studio-3d-reference=\"tooncraft\"]", ":root[data-theme=\"light\"] [data-studio-3d-reference=\"tooncraft\"]"])("%s 설명과 입력값이 AA 대비를 유지한다", (selector) => {
    const palette = block(selector);
    expect(contrast(color(palette, "--color-fg-3"), color(palette, "--color-card"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color(palette, "--color-fg-2"), color(palette, "--color-panel"))).toBeGreaterThanOrEqual(4.5);
  });
  it("잠금 여부를 바꾸지 않고 설명과 비활성 입력값의 이중 투명도만 제거한다", () => {
    expect(block('[data-studio-3d-reference="tooncraft"] [data-character-slot-card] > span:last-child')).toContain("opacity: 1;");
    const disabled = block(':root[data-design-theme] [data-studio-3d-reference="tooncraft"] :is([data-character-range], [data-character-color]) input:disabled');
    expect(disabled).toContain("opacity: 1;");
    expect(disabled).toContain("color: var(--color-fg-2);");
    expect(disabled).not.toContain("pointer-events");
  });
});

it("3D 참조 작업면과 캐릭터 셰이퍼에 도메인 조작 색을 연결하고 고대비 색을 유지한다", () => {
  const reference = ':root[data-theme] [data-studio-3d-reference="tooncraft"]';
  const shaper = ':root[data-theme] [data-studio-3d-reference="tooncraft"][data-character-shaper="true"]';
  const lightReference = ':root[data-theme="light"] [data-studio-3d-reference="tooncraft"]';
  expect(css).toContain(`@media (forced-colors: none) {\n  ${reference} {`);
  expect(css.indexOf(reference)).toBeGreaterThan(css.indexOf(lightReference));
  for (const [selector, pigment] of [[reference, "3d"], [shaper, "character"]] as const) {
    const palette = block(selector);
    expect(palette).toContain(`--color-accent: var(--spectrum-pigment-${pigment});`);
    expect(palette).toContain(`--color-accent-soft: var(--spectrum-pigment-${pigment}-soft);`);
    expect(palette).toContain(`--color-on-accent: var(--spectrum-pigment-${pigment}-on);`);
  }
  const contrastSelector = ':root[data-theme][data-design-theme="contrast"] [data-studio-3d-reference="tooncraft"]';
  const contrastPalette = block(contrastSelector);
  expect(css.indexOf(contrastSelector)).toBeGreaterThan(css.indexOf(shaper));
  expect(contrastPalette).toContain("--color-accent: var(--ui-palette-accent);");
  expect(contrastPalette).toContain("--color-on-accent: var(--ui-palette-on-accent);");
  expect(css).toContain("--color-on-accent: HighlightText;");
});
