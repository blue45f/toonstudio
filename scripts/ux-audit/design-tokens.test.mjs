import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { COLOR_PREFIX, PALETTE_NAMES, classifyColorClass, normalizeClass, parseCustomClassNames, parseDeclaredColorTokens, splitVariants, summarizeClassUsage } from "./design-tokens.mjs";

const { describe, it } = process.env.VITEST ? await import("vitest") : await import("node:test");

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const context = {
  declaredColors: new Set(["canvas", "panel", "card", "raised", "line", "line-strong", "fg", "fg-2", "fg-3", "accent", "accent-2", "accent-soft", "on-accent", "bg", "danger-soft"]),
  customClasses: new Set(["text-gradient-brand"]),
};
const kind = (token) => classifyColorClass(token, context)?.kind ?? null;

describe("design-tokens: 변형과 정규화", () => {
  it("변형을 떼고 대괄호 안의 콜론은 구분자로 보지 않는다", () => {
    assert.deepEqual(splitVariants("hover:bg-red-500"), { variants: ["hover"], base: "bg-red-500" });
    assert.deepEqual(splitVariants("data-[state=open]:md:bg-card"), { variants: ["data-[state=open]", "md"], base: "bg-card" });
    assert.equal(normalizeClass("!-translate-x-1"), "translate-x-1");
  });
});

describe("design-tokens: 색 클래스 분류", () => {
  it("원시 Tailwind 팔레트를 찾는다", () => {
    assert.equal(kind("bg-red-500"), "palette");
    assert.equal(kind("hover:text-slate-400/80"), "palette");
    assert.equal(kind("md:dark:border-gray-200"), "palette");
  });

  it("white·black 은 이름 있는 원시 색이고 transparent·current 는 허용한다", () => {
    assert.equal(kind("bg-white"), "named");
    assert.equal(kind("text-black/70"), "named");
    assert.equal(kind("bg-transparent"), null);
    assert.equal(kind("fill-current"), null);
  });

  it("색 리터럴 임의값은 위반, OKLCH 리터럴은 참고 분류, 변수·길이는 무시한다", () => {
    assert.equal(kind("bg-[#fff]"), "arbitrary");
    assert.equal(kind("text-[rgb(1,2,3)]"), "arbitrary");
    assert.equal(kind("bg-[oklch(0.5_0.1_20)]"), "oklch");
    assert.equal(kind("bg-[var(--surface)]"), null);
    assert.equal(kind("text-[0.68rem]"), null);
  });

  it("선언되지 않은 테마 색 토큰(accent-hover · fg-4 · bg-2)을 찾는다", () => {
    assert.equal(kind("bg-accent-hover"), "undeclared");
    assert.equal(kind("text-fg-4"), "undeclared");
    assert.equal(kind("bg-bg-2"), "undeclared");
  });

  it("선언된 토큰은 불투명도·변형이 붙어도 통과한다", () => {
    for (const token of ["bg-card/60", "text-fg-3", "border-line-strong", "from-accent", "focus-visible:outline-accent", "bg-danger-soft/20", "text-on-accent"]) {
      assert.equal(kind(token), null, token);
    }
  });

  it("색이 아닌 유틸리티는 미선언으로 오탐하지 않는다", () => {
    const nonColors = [
      "text-sm", "text-2xl", "text-center", "text-balance", "text-ellipsis", "border-t", "border-b", "border-x", "border-2", "border-dashed",
      "bg-cover", "bg-no-repeat", "bg-clip-text", "bg-gradient-to-r", "bg-linear-to-b", "shadow-lg", "shadow-none", "ring-1", "ring-inset",
      "ring-offset-2", "outline-none", "outline-offset-2", "stroke-2", "divide-y", "divide-x", "decoration-2", "from-10%", "accent-auto",
    ];
    for (const token of nonColors) assert.equal(kind(token), null, token);
  });

  it("CSS 에서 직접 정의한 클래스는 토큰으로 보지 않는다", () => {
    assert.equal(kind("text-gradient-brand"), null);
  });
});

describe("design-tokens: CSS 파싱", () => {
  it("@theme 블록의 --color-* 만 선언 토큰으로 읽는다", () => {
    const css = `@import "tailwindcss";
@theme { --color-canvas: oklch(0.1 0 0); --font-sans: x; --color-fg-2: oklch(0.7 0 0); }
:root { --color-ghost: red; }
@theme inline { --color-accent: var(--x); }`;
    assert.deepEqual([...parseDeclaredColorTokens(css)].sort(), ["accent", "canvas", "fg-2"]);
  });

  it("클래스 선택자와 @utility 를 모으되 소수점·파일 이름은 클래스로 보지 않는다", () => {
    const css = `/* .commented */ .site-header__bar:hover{margin:.5rem} .text-brand\\:x{} @utility tab-size-4 { tab-size: 4 }
a{background:url(./hero.png)} .md\\:w-1\\.5{}`;
    const names = parseCustomClassNames(css);
    assert.ok(names.has("site-header__bar"));
    assert.ok(names.has("tab-size-4"));
    assert.ok(names.has("md:w-1.5"));
    assert.ok(!names.has("commented"));
    assert.ok(!names.has("5rem"));
    assert.ok(!names.has("png"));
  });
});

describe("design-tokens: 요약", () => {
  it("분류별 종류 수와 요소 수를 모으고 raw 에는 OKLCH 참고 분류를 넣지 않는다", () => {
    const summary = summarizeClassUsage([
      { name: "bg-red-500", elements: 3, sample: "div" },
      { name: "hover:bg-red-500", elements: 2, sample: "div" },
      { name: "bg-white", elements: 1 },
      { name: "bg-accent-hover", elements: 4 },
      { name: "text-[oklch(0.5_0.1_20)]", elements: 9 },
      { name: "p-4", elements: 99 },
    ], context);
    assert.equal(summary.palette.distinct, 1);
    assert.equal(summary.palette.elements, 5);
    assert.equal(summary.raw.distinct, 2);
    assert.equal(summary.undeclared.elements, 4);
    assert.equal(summary.oklch.distinct, 1);
  });
});

describe("design-tokens: ESLint 규칙과의 동기화", () => {
  it("접두어 정규식과 팔레트 이름이 설치된 @shadcn/lint 와 같다(플러그인을 올리면 여기서 알려 준다)", () => {
    const source = readFileSync(join(ROOT, "node_modules/@shadcn/lint/dist/similar.js"), "utf8");
    const prefix = source.match(/const COLOR_PREFIX = (\/.+\/);/u)?.[1];
    assert.equal(COLOR_PREFIX.toString(), prefix);
    const palette = [...(source.match(/const PALETTE = \[([\s\S]*?)\];/u)?.[1] ?? "").matchAll(/"([a-z]+)"/gu)].map((match) => match[1]);
    assert.deepEqual([...PALETTE_NAMES], palette);
  });
});
