import { readFileSync } from "node:fs";

import Color from "colorjs.io";
import { describe, expect, it } from "vitest";

import { THEME_PRESETS } from "@/shared/lib/theme-presets";

/**
 * AI 학습 허용 표기 UI 의 색 대비 계약. 모든 디자인 테마(`design-themes.css`)의 토큰 값으로 계산한다.
 *
 * 컴포넌트 클래스와 짝이 되는 가정(클래스 자체는 `CreatorAiTrainingBadge.test.tsx`가 고정한다):
 * - 허용 칩: 글자 `text-fg`, 아이콘 `text-cool`, 배경 `bg-cool/10`
 * - 불허 칩: 글자 `text-fg`, 아이콘 `text-warn`, 배경 `bg-warn/10`
 * - 미지정 칩: 글자 `text-fg-2`, 아이콘·점선 경계 `fg-3`, 배경 `bg-card`
 * - 선택된 옵션 행과 변경 확인 문구: 배경 `bg-accent-soft/70`, 글자 `text-fg`·`text-fg-2`·`text-fg-3`
 *
 * 의미 토큰 색 글자(`text-cool`)는 라이트·세피아 테마의 칩 배경 위에서 AA(4.5:1)에 못 미쳐 글자색에서 뺐다.
 * 이 테스트는 토큰 값에 대한 계산이며 브라우저 화면 검증을 대신하지 않는다.
 */
const css = readFileSync(new URL("../../../app/styles/design-themes.css", import.meta.url), "utf8");

const SURFACES = ["canvas", "panel", "card", "raised"] as const;
const TEXT = 4.5;
const NON_TEXT = 3;

function tokensOf(id: string): Record<string, string> {
  const block = css.split(`[data-appearance-preview="${id}"] {`)[1]?.split("}")[0] ?? "";
  return Object.fromEntries(
    [...block.matchAll(/--color-([\w-]+):\s*([^;]+);/gu)].map((match) => [match[1], match[2]]),
  );
}

function color(tokens: Record<string, string>, name: string): Color {
  const value = tokens[name];
  if (value === undefined) throw new Error(`테마 토큰 --color-${name} 이 없습니다.`);
  return new Color(value);
}

function tint(base: Color, tone: Color, alpha: number): Color {
  return base.mix(tone, alpha, { space: "srgb" });
}

function ratio(foreground: Color, background: Color): number {
  return foreground.contrast(background, "WCAG21");
}

describe("AI 학습 허용 표기 색 대비", () => {
  it.each(THEME_PRESETS)("$id: 허용·불허 칩의 글자는 4.5:1, 아이콘은 3:1 이상이다", ({ id }) => {
    const tokens = tokensOf(id);
    const fg = color(tokens, "fg");
    for (const surface of SURFACES) {
      const base = color(tokens, surface);
      for (const [label, tone] of [
        ["허용", color(tokens, "cool")],
        ["불허", color(tokens, "warn")],
      ] as const) {
        const chip = tint(base, tone, 0.1);
        expect(ratio(fg, chip), `${id}: ${label} 칩 글자(fg)/${surface}`).toBeGreaterThanOrEqual(TEXT);
        expect(ratio(tone, chip), `${id}: ${label} 칩 아이콘/${surface}`).toBeGreaterThanOrEqual(NON_TEXT);
      }
    }
  });

  it.each(THEME_PRESETS)("$id: 미지정 칩의 글자는 4.5:1, 아이콘과 점선 경계는 3:1 이상이다", ({ id }) => {
    const tokens = tokensOf(id);
    const card = color(tokens, "card");
    expect(ratio(color(tokens, "fg-2"), card), `${id}: 글자(fg-2)/card`).toBeGreaterThanOrEqual(TEXT);
    expect(ratio(color(tokens, "fg-3"), card), `${id}: 아이콘·점선(fg-3)/card`).toBeGreaterThanOrEqual(NON_TEXT);
  });

  it.each(THEME_PRESETS)("$id: 선택된 옵션 행과 변경 확인 문구의 글자는 4.5:1 이상이다", ({ id }) => {
    const tokens = tokensOf(id);
    const accent = color(tokens, "accent");
    const alpha = color(tokens, "accent-soft").alpha * 0.7;
    for (const surface of ["canvas", "card"] as const) {
      const selected = tint(color(tokens, surface), accent, alpha);
      for (const foreground of ["fg", "fg-2", "fg-3"]) {
        expect(
          ratio(color(tokens, foreground), selected),
          `${id}: ${foreground}/accent-soft70+${surface}`,
        ).toBeGreaterThanOrEqual(TEXT);
      }
    }
  });

  it.each(THEME_PRESETS)("$id: 독자용 설명과 한계 고지(fg-2·fg-3)는 표면 위에서 4.5:1 이상이다", ({ id }) => {
    const tokens = tokensOf(id);
    for (const surface of SURFACES) {
      const base = color(tokens, surface);
      expect(ratio(color(tokens, "fg-2"), base), `${id}: fg-2/${surface}`).toBeGreaterThanOrEqual(TEXT);
      expect(ratio(color(tokens, "fg-3"), base), `${id}: fg-3/${surface}`).toBeGreaterThanOrEqual(TEXT);
    }
  });
});
