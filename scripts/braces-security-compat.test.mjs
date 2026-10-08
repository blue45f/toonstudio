import { createRequire } from "node:module";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";
import { describe, expect, it } from "vitest";

// GHSA-vfj7-8cjw-p6xm(CVE-2026-93687) 완화 회귀 테스트.
// braces <=3.0.3은 업스트림 수정 릴리스가 없어 pnpm-workspace.yaml의 override가 취약 3.x 범위를
// 저장소 포크(patches/braces)로 대체한다. 포크는 레지스트리 패키지가 아니라 pnpm audit이 검사하지
// 않으므로, 실제 깊이 가드와 기존 패치 동작은 이 테스트가 지킨다.
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FORK_DIRECTORY = join(ROOT, "patches", "braces");
const OVERRIDE_KEY = "braces@>=3.0.0 <3.0.4";
const FORK_SPECIFIER = "file:patches/braces";
const FORK_RUNTIME_FILES = [
  "index.js",
  "lib/compile.js",
  "lib/constants.js",
  "lib/expand.js",
  "lib/parse.js",
  "lib/stringify.js",
  "lib/utils.js",
];
const DEPTH_ERROR = /^Nesting depth \(101\), exceeds max depth \(100\)$/u;

const workspace = parse(readFileSync(join(ROOT, "pnpm-workspace.yaml"), "utf8"));
const lock = parse(readFileSync(join(ROOT, "pnpm-lock.yaml"), "utf8"));

// 실제 소비 경로(@heejun/eslint-config -> eslint-plugin-boundaries[-> @boundaries/elements]
// -> micromatch -> braces)를 따라 해석해 설치된 산출물을 검사한다.
function resolveConsumerChain() {
  const eslintConfigRequire = createRequire(
    realpathSync(join(ROOT, "node_modules", "@heejun", "eslint-config", "package.json")),
  );
  const boundariesPluginPath = eslintConfigRequire.resolve("eslint-plugin-boundaries");
  const boundariesPluginRequire = createRequire(boundariesPluginPath);
  const elementsRequire = createRequire(boundariesPluginRequire.resolve("@boundaries/elements"));
  const micromatchPaths = [
    boundariesPluginRequire.resolve("micromatch"),
    elementsRequire.resolve("micromatch"),
  ];
  const bracesPaths = micromatchPaths.map((micromatchPath) =>
    realpathSync(createRequire(micromatchPath).resolve("braces")),
  );
  const micromatchRequire = createRequire(micromatchPaths[0]);
  return {
    bracesPaths,
    micromatch: micromatchRequire(micromatchPaths[0]),
    braces: micromatchRequire(bracesPaths[0]),
  };
}

const nest = (open, close, depth, inner) => open.repeat(depth) + inner + close.repeat(depth);

// 파서를 거치지 않고 호출자가 직접 넘기는 AST(compile/expand/stringify가 그대로 받는다).
function nestedBraceAst(depth) {
  const root = { type: "root", nodes: [] };
  let block = root;
  for (let level = 0; level < depth; level += 1) {
    const child = { type: "brace", open: true, close: true, commas: 1, ranges: 0, nodes: [] };
    block.nodes.push(child);
    block = child;
  }
  block.nodes.push({ type: "text", value: "x" });
  return root;
}

describe("vendored braces fork in the dependency graph", () => {
  it("overrides only the vulnerable 3.x range with the repository fork", () => {
    expect(workspace.overrides?.[OVERRIDE_KEY]).toBe(FORK_SPECIFIER);
    expect(lock.overrides?.[OVERRIDE_KEY]).toBe(FORK_SPECIFIER);
    // 포크가 기존 patches/braces@3.0.3.patch 수정을 담으므로 레지스트리 braces 패치 항목은 없어야 한다.
    expect(Object.keys(workspace.patchedDependencies ?? {}).filter((key) => key.startsWith("braces@"))).toEqual([]);
  });

  it("keeps registry braces releases out of the resolved package graph", () => {
    const registryBraces = (key) => /^braces@\d/u.test(key);
    expect(Object.keys(lock.packages ?? {}).filter(registryBraces)).toEqual([]);
    expect(Object.keys(lock.snapshots ?? {}).filter(registryBraces)).toEqual([]);
    expect(lock.packages?.["braces@file:patches/braces"]?.resolution).toEqual({
      directory: "patches/braces",
      type: "directory",
    });
    expect(lock.snapshots?.["micromatch@4.0.8"]?.dependencies?.braces).toBe(FORK_SPECIFIER);
  });
});

describe("vendored braces depth guard (GHSA-vfj7-8cjw-p6xm)", () => {
  const { bracesPaths, braces, micromatch } = resolveConsumerChain();

  it("routes every eslint-plugin-boundaries micromatch path to the current fork", () => {
    expect(new Set(bracesPaths).size).toBe(1);
    const installedDirectory = dirname(bracesPaths[0]);
    for (const file of FORK_RUNTIME_FILES) {
      expect(
        readFileSync(join(installedDirectory, file), "utf8"),
        `설치된 braces/${file}가 patches/braces와 다릅니다. pnpm install로 node_modules를 다시 연결하세요.`,
      ).toBe(readFileSync(join(FORK_DIRECTORY, file), "utf8"));
    }
  });

  it("rejects the advisory proof of concept before recursion exhausts the stack", () => {
    // 문자 수 상한(10,000) 아래의 깊은 중첩: 원본 3.0.3은 RangeError(스택 소진)로 죽는다.
    const deepBraces = nest("{", "}", 4990, "a,b");
    const deepParens = nest("(", ")", 4999, "");
    expect(deepBraces.length).toBeLessThan(10_000);
    for (const run of [
      () => braces(deepBraces),
      () => braces(deepBraces, { expand: true }),
      () => braces.expand(deepBraces),
      () => braces(deepParens),
      () => braces.expand(deepParens),
      () => micromatch.braces(deepBraces),
      () => micromatch.braceExpand(deepBraces),
    ]) {
      expect(run).toThrow(SyntaxError);
      expect(run).toThrow(DEPTH_ERROR);
    }
  });

  it("accepts exactly 100 nested containers and rejects the 101st", () => {
    expect(braces.expand(nest("{", "}", 100, "a,b"))).toEqual([
      nest("{", "}", 99, "a"),
      nest("{", "}", 99, "b"),
    ]);
    expect(braces(nest("{", "}", 100, "a,b"))).toEqual([nest("{", "}", 99, "(a|b)")]);
    expect(() => braces(nest("{", "}", 101, "a,b"))).toThrow(DEPTH_ERROR);
    expect(() => braces(nest("{(", ")}", 50, "{a,b}"))).toThrow(DEPTH_ERROR);
  });

  it("guards caller-supplied ASTs that bypass the parser", () => {
    expect(() => braces.compile(nestedBraceAst(100))).not.toThrow();
    for (const depth of [101, 5_000]) {
      expect(() => braces.compile(nestedBraceAst(depth))).toThrow(DEPTH_ERROR);
      expect(() => braces.expand(nestedBraceAst(depth))).toThrow(DEPTH_ERROR);
      expect(() => braces.stringify(nestedBraceAst(depth))).toThrow(DEPTH_ERROR);
    }
  });

  it.each([
    // 업스트림 master(e53730e6f9)의 unpaired quote 수정 — 원본 3.0.3에서는 모두 실패한다.
    ["'{x,y}", {}, ["'x", "'y"]],
    ['"{x,y}', {}, ['"x', '"y']],
    ["`{x,y}", {}, ["`x", "`y"]],
    ["a'bc{x,y}", { keepQuotes: true }, ["a'bcx", "a'bcy"]],
    ["a'b\"c`{x,y}", {}, ["a'b\"c`x", "a'b\"c`y"]],
    ["a'b{x,y}\\'", {}, ["a'bx'", "a'by'"]],
    // 업스트림 master의 범위 연산자를 담은 집합 수정(issue #56) — 원본 3.0.3에서는 모두 실패한다.
    ["{..a,b}", {}, ["..a", "b"]],
    ["{{..,..},a,b}", {}, ["..", "..", "a", "b"]],
    ["..{1..3}{..,..}", {}, ["..1..", "..1..", "..2..", "..2..", "..3..", "..3.."]],
  ])("keeps the previously patched upstream fix for %j", (input, options, expected) => {
    expect(braces.expand(input, options)).toEqual(expected);
  });

  it("keeps ordinary brace compilation and expansion unchanged", () => {
    expect(braces("a/{b,c}/d")).toEqual(["a/(b|c)/d"]);
    expect(braces.expand("a/{b,c}/d")).toEqual(["a/b/d", "a/c/d"]);
    expect(braces("{1..3}")).toEqual(["([1-3])"]);
    expect(braces("x{01..10}")).toEqual(["x(0[1-9]|10)"]);
    expect(braces.expand("{a,b}{1..2}")).toEqual(["a1", "a2", "b1", "b2"]);
    expect(braces.expand("a{b,{c,d}}e")).toEqual(["abe", "ace", "ade"]);
    expect(braces.expand("{1\\.2}")).toEqual(["{1.2}"]);
  });

  it("keeps the eslint.config.mjs boundaries element patterns matching", () => {
    const sharedPattern = "apps/web/src/shared/{navigation,seo,hooks}/**/*";
    expect(micromatch.isMatch("apps/web/src/shared/hooks/use-media.ts", sharedPattern)).toBe(true);
    expect(micromatch.isMatch("apps/web/src/shared/components/button.tsx", sharedPattern)).toBe(false);
    expect(micromatch.braceExpand(sharedPattern)).toEqual([
      "apps/web/src/shared/navigation/**/*",
      "apps/web/src/shared/seo/**/*",
      "apps/web/src/shared/hooks/**/*",
    ]);
  });
});
