import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  compositeStudioColor,
  studioColorContrast,
} from "./studio-accessibility-audit";

const contractCss = readFileSync(
  new URL("../../app/styles/unified-theme-contract.css", import.meta.url),
  "utf8",
);

const THEME_IDS = [
  "aurora", "blossom", "starlight", "dark", "light",
  "graphite", "midnight", "sepia", "contrast",
] as const;

const BACKGROUNDS = ["canvas", "panel", "card", "raised"] as const;
const TEXT_TOKENS = ["fg", "fg-2", "fg-3", "accent", "accent-2"] as const;

/** WCAG AA: 4.5:1 for text, 3:1 for non-text component boundaries (1.4.11). */
const TEXT_MINIMUM = 4.5;
const BOUNDARY_MINIMUM = 3;

type ThemeTokens = ReadonlyMap<string, string>;

function tokensFor(themeId: string): ThemeTokens {
  const block = new RegExp(
    `:root\\[data-design-theme="${themeId}"\\] \\{([^}]*)\\}`,
    "u",
  ).exec(contractCss);
  if (!block?.[1]) throw new Error(`Unified theme block is missing: ${themeId}`);
  const tokens = new Map<string, string>();
  for (const match of block[1].matchAll(/(--unified-[a-z0-9-]+):\s*([^;]+);/gu)) {
    if (match[1] && match[2]) tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

function token(tokens: ThemeTokens, name: string): string {
  const value = tokens.get(`--unified-${name}`);
  if (!value) throw new Error(`Unified token is missing: --unified-${name}`);
  return value;
}

describe("unified theme token contrast (9 themes x primary surfaces)", () => {
  it("declares exactly the nine selectable themes in the contract", () => {
    const declared = [...contractCss.matchAll(/:root\[data-design-theme="([a-z-]+)"\] \{/gu)]
      .map((match) => match[1])
      .slice(0, THEME_IDS.length);
    expect(declared).toEqual([...THEME_IDS]);
  });

  for (const themeId of THEME_IDS) {
    describe(themeId, () => {
      const tokens = tokensFor(themeId);

      it("keeps every text token at WCAG AA 4.5:1 on every surface", () => {
        for (const foreground of TEXT_TOKENS) {
          for (const background of BACKGROUNDS) {
            const ratio = studioColorContrast(
              token(tokens, foreground),
              token(tokens, background),
            );
            expect(
              ratio,
              `${themeId}: --unified-${foreground} on --unified-${background} is ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(TEXT_MINIMUM);
          }
        }
      });

      it("keeps on-accent text readable on both accent fills", () => {
        for (const fill of ["accent", "accent-2"] as const) {
          const ratio = studioColorContrast(
            token(tokens, "on-accent"),
            token(tokens, fill),
          );
          expect(
            ratio,
            `${themeId}: --unified-on-accent on --unified-${fill} is ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(TEXT_MINIMUM);
        }
      });

      it("keeps text readable on accent-soft tinted surfaces", () => {
        for (const background of ["canvas", "panel", "card"] as const) {
          const tinted = compositeStudioColor(
            token(tokens, "accent-soft"),
            token(tokens, background),
          );
          for (const foreground of ["fg", "fg-2", "accent"] as const) {
            const ratio = studioColorContrast(token(tokens, foreground), tinted);
            expect(
              ratio,
              `${themeId}: --unified-${foreground} on accent-soft/${background} is ${ratio.toFixed(2)}:1`,
            ).toBeGreaterThanOrEqual(TEXT_MINIMUM);
          }
        }
      });

      it("keeps the strong boundary at WCAG 1.4.11 3:1 on every surface", () => {
        // --unified-line-strong is the static fallback for
        // --color-control-border, so it carries the non-text criterion.
        // --unified-line is a decorative hairline and is reported, not gated.
        for (const background of BACKGROUNDS) {
          const ratio = studioColorContrast(
            token(tokens, "line-strong"),
            token(tokens, background),
          );
          expect(
            ratio,
            `${themeId}: --unified-line-strong on --unified-${background} is ${ratio.toFixed(2)}:1`,
          ).toBeGreaterThanOrEqual(BOUNDARY_MINIMUM);
        }
      });
    });
  }
});
