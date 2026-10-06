import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * fx.css 모션 키트 계약 — 마이크로 인터랙션 유틸(fx-lift/fx-press)의 존재와
 * 접근성 게이트를 고정한다. CSS는 런타임에 조용히 사라져도 테스트가 없으면
 * 아무도 모르기 때문에, 파일 텍스트를 직접 대조한다(웹의 CSS 계약 테스트 관행).
 */
const FX_CSS = readFileSync(fileURLToPath(new URL("./fx.css", import.meta.url)), "utf8");

describe("fx.css 모션 키트 계약", () => {
  it("리프트 그림자 토큰이 :root에 정의돼 있다", () => {
    expect(FX_CSS).toContain("--ts-fx-lift-shadow:");
  });

  it("fx-lift는 transform·box-shadow 트랜지션만으로 정의된다", () => {
    expect(FX_CSS).toMatch(/\.fx-lift\s*\{[^}]*transition:[^}]*transform[^}]*box-shadow/s);
  });

  it("fx-lift 호버는 모션 허용 + 가는 포인터 미디어 안에서만 켜진다", () => {
    expect(FX_CSS).toMatch(
      /@media \(prefers-reduced-motion: no-preference\) and \(pointer: fine\) \{\s*\.fx-lift:hover \{[^}]*translateY\(-2px\)/s,
    );
  });

  it("fx-press는 누르는 동안만 축소된다", () => {
    expect(FX_CSS).toMatch(/\.fx-press:active\s*\{[^}]*transform: scale\(0\.98\)/s);
  });

  it("reduced-motion 블록이 fx-lift/fx-press를 무효화한다", () => {
    const reduceBlock = FX_CSS.slice(FX_CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reduceBlock).toContain(".fx-lift");
    expect(reduceBlock).toContain(".fx-press");
    expect(reduceBlock).toMatch(/\.fx-press:active\s*\{\s*transform: none;/s);
  });

  it("기존 reveal 체계가 함께 유지된다(덮어쓰기 방지)", () => {
    expect(FX_CSS).toContain(".reveal.is-revealed");
    expect(FX_CSS).toContain("--reveal-delay");
  });
});
