import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const campusCss = readFileSync(new URL("./campus.css", import.meta.url), "utf8");
const workspaceCss = readFileSync(new URL("../workspace/workspace-visual-v3.css", import.meta.url), "utf8");
const fortuneCss = ["fortune-observatory.css", "fortune-cinematic.css"]
  .map((file) => readFileSync(new URL(`../../../domains/fortune/${file}`, import.meta.url), "utf8"))
  .join("\n");

describe("spatial campus theme contract", () => {
  it("keeps the dark observatory palette opaque inside light site themes", () => {
    expect(campusCss).toContain(
      "[data-campus-domain=fortune]{padding:0!important;max-width:none!important;background:var(--fo-bg)!important}",
    );
    expect(campusCss).not.toContain("background:transparent!important");
  });

  it("uses the scene foreground pair for its directory and the gold accent for the selected room", () => {
    // 웨이브 20부터 디렉터리는 관측소 밤 장면 밴드 위에 뜬다 — 장면은 테마 불변이라
    // 본문 전경은 장면 고정 흰색 쌍을 쓰고, 선택된 방만 관측소 골드 액센트를 유지한다.
    expect(campusCss).toContain(".fortune-campus-directory{position:relative");
    expect(campusCss).toContain("color:#fff");
    expect(campusCss).toContain("color:oklch(1 0 0/0.8)");
    expect(campusCss).toContain("color:var(--fo-gold,var(--color-accent))");
    expect(campusCss).toContain("background:oklch(1 0 0/0.14)");
  });

  it("keeps selected campus modes readable instead of using the bright accent gradient", () => {
    expect(campusCss).toContain(
      "background:color-mix(in srgb,var(--color-accent) 18%,var(--color-panel));color:var(--color-fg)",
    );
    expect(workspaceCss).toContain(
      "background:color-mix(in srgb,var(--color-accent) 20%,var(--color-panel));color:var(--color-fg)",
    );
    expect(workspaceCss).not.toContain(
      '.campus-modes button[aria-pressed="true"]{background:linear-gradient',
    );
  });

  it("does not render readable fortune copy below ten pixels", () => {
    expect(fortuneCss).not.toMatch(/font-size:[6-9]px/u);
  });
});
