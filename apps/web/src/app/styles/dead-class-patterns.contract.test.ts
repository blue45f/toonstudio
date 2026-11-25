import { readFileSync, readdirSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import * as ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 죽은 클래스(선언이 없어 생성되지 않는 유틸리티) 재발 방지 계약.
 *
 * @shadcn/lint 파일럿 실측(2026-10-06)에서 두 묶음이 실제로 무력화돼 있었다.
 * - 시맨틱 토큰 별칭: 컴포넌트들이 danger/success/bg/good-soft/bad-soft 이름을 쓰는데
 *   @theme에 선언이 없어 text-danger·bg-success·bg-bg·bg-good-soft 류가 클래스로
 *   생성되지 않아 무색으로 렌더됐다. globals.css @theme에 bad/good/canvas를 가리키는
 *   별칭으로 선언해 살렸고(warning 별칭과 같은 방식), 이 테스트가 선언 소실을 막는다.
 * - tailwindcss-animate 관용구: 이 프로젝트에는 그 플러그인이 없어 animate-in·fade-in·
 *   zoom-in-95·slide-in-from-* 토큰은 아무 규칙도 만들지 못했다. 전부 프로젝트
 *   애니메이션 유틸(animate-fade-in/-fade-up/-hud-in)로 교체했고, 재도입을 막는다.
 *
 * 범위는 이 두 패턴으로 한정한다. 팔레트 하드코딩 같은 스타일 위반은 린트 담당이다.
 */
const SRC_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const GLOBALS_CSS = join(SRC_ROOT, "app/styles/globals.css");
const SELF = "app/styles/dead-class-patterns.contract.test.ts";

/** 별칭 토큰 → 값이 가리켜야 하는 단일 출처 토큰. 새 색 값을 만들지 않는다는 결정을 고정한다. */
const COLOR_ALIASES: Readonly<Record<string, string>> = {
  danger: "--color-bad",
  success: "--color-good",
  bg: "--color-canvas",
  "bg-2": "--color-panel",
  "panel-2": "--color-raised",
  "surface-2": "--color-raised",
  field: "--color-panel",
  "fg-1": "--color-fg",
  "fg-4": "--color-fg-3",
  ink: "--color-fg",
  "accent-hover": "--color-accent-2",
  "accent-contrast": "--color-on-accent",
  "accent-foreground": "--color-on-accent",
  info: "--color-cool",
  "bad-light": "--color-bad-soft",
  "warning-strong": "--color-warn",
  primary: "--color-accent",
  "primary-foreground": "--color-on-accent",
  background: "--color-canvas",
  foreground: "--color-fg",
  muted: "--color-raised",
  "muted-foreground": "--color-fg-2",
  border: "--color-line",
  destructive: "--color-bad",
};
/** 별칭과 함께 선언돼야 하는 soft 파생 토큰(기반 토큰의 /0.14 — accent-soft·warning-soft와 같은 방식). */
const SOFT_TOKENS: readonly string[] = ["danger-soft", "success-soft", "good-soft", "bad-soft", "info-soft"];
/** 교체에 쓴 프로젝트 애니메이션 유틸과 그 근거 키프레임. */
const ANIMATION_UTILS: Readonly<Record<string, string>> = {
  "fade-in": "fade-in",
  "fade-up": "fade-up",
  "hud-in": "hud-in",
};

/**
 * `fade-in` 단독 문자열은 가상스튜디오 구역 전환 상태 기계의 phase 식별자로도 쓰인다
 * (클래스가 아니라 코드 상수). 기술 도감 평면 라벨의 영어 문구("Fade-out and fade-in")도
 * 클래스가 아니라 UI 카피다. 그 파일들만 bare fade-in 검사에서 제외한다.
 */
const BARE_FADE_IN_EXCLUDED = new Set([
  "domains/creator/virtual-space/studio-virtual-space-zone-transition.ts",
  "domains/creator/virtual-space/studio-virtual-space-zone-transition.test.ts",
  "domains/legal/technology/engineering-atlas-web-platform-surface.ts",
]);

function isPhaseRead(node: ts.Node): boolean {
  return (ts.isIdentifier(node) && node.text === "phase")
    || (ts.isPropertyAccessExpression(node) && node.name.text === "phase");
}

function phaseLiteralOffsets(text: string): ReadonlySet<number> {
  const offsets = new Set<number>();
  const source = ts.createSourceFile("fixture.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node: ts.Node): void => {
    if (ts.isStringLiteralLike(node) && node.text === "fade-in") {
      const parent = node.parent;
      const phaseAssignment = ts.isBinaryExpression(parent)
        && [ts.SyntaxKind.EqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken,
          ts.SyntaxKind.ExclamationEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(parent.operatorToken.kind)
        && isPhaseRead(parent.left === node ? parent.right : parent.left);
      const phaseProperty = ts.isPropertyAssignment(parent)
        && ((ts.isIdentifier(parent.name) || ts.isStringLiteral(parent.name)) && parent.name.text === "phase");
      const expectation = ts.isCallExpression(parent) && ts.isPropertyAccessExpression(parent.expression)
        && ["toBe", "toEqual"].includes(parent.expression.name.text) ? parent.expression.expression : undefined;
      const phaseExpectation = expectation && ts.isCallExpression(expectation)
        && ts.isIdentifier(expectation.expression) && expectation.expression.text === "expect"
        && expectation.arguments.length === 1 && expectation.arguments[0] && isPhaseRead(expectation.arguments[0]);
      if (ts.isLiteralTypeNode(parent) || phaseAssignment || phaseProperty || phaseExpectation) offsets.add(node.getStart(source) + 1);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return offsets;
}

function hasBareFadeInClass(text: string): boolean {
  const candidates = [...text.matchAll(/["'`]([^"'`\n]*)["'`]/g)].filter((literal) =>
    (literal[1] ?? "").split(/\s+/).some((token) => (token.split(":").pop() ?? token) === "fade-in"));
  if (candidates.length === 0) return false;
  const phaseOffsets = phaseLiteralOffsets(text);
  return candidates.some((literal) => !phaseOffsets.has(literal.index + 1));
}

function listSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    const kind = entry.isSymbolicLink() ? statSync(path) : entry;
    if (kind.isDirectory()) return entry.name === "node_modules" ? [] : listSourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

/** globals.css의 모든 @theme 블록 본문을 합쳐 돌려준다. */
function themeBlocks(css: string): string {
  const blocks: string[] = [];
  let searchFrom = 0;
  for (;;) {
    const start = css.indexOf("@theme", searchFrom);
    if (start === -1) return blocks.join("\n");
    const open = css.indexOf("{", start);
    let depth = 0;
    let index = open;
    for (; index < css.length; index += 1) {
      if (css[index] === "{") depth += 1;
      else if (css[index] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    blocks.push(css.slice(open + 1, index));
    searchFrom = index + 1;
  }
}

describe("죽은 클래스 패턴 계약", () => {
  const globalsCss = readFileSync(GLOBALS_CSS, "utf8");
  const theme = themeBlocks(globalsCss);

  it("시맨틱 토큰 별칭이 @theme에 단일 출처를 가리키며 선언돼 있다", () => {
    for (const [alias, target] of Object.entries(COLOR_ALIASES)) {
      const declaration = new RegExp(`--color-${alias}\\s*:\\s*var\\(${target}\\)`);
      expect(theme, `--color-${alias} 별칭 선언`).toMatch(declaration);
    }
    for (const soft of SOFT_TOKENS) {
      expect(theme, `--color-${soft} 선언`).toMatch(new RegExp(`--color-${soft}\\s*:`));
    }
  });

  it("교체에 쓴 애니메이션 유틸의 토큰과 키프레임이 globals.css에 있다", () => {
    for (const [utility, keyframes] of Object.entries(ANIMATION_UTILS)) {
      expect(theme, `--animate-${utility} 선언`).toMatch(new RegExp(`--animate-${utility}\\s*:`));
      expect(globalsCss, `@keyframes ${keyframes}`).toContain(`@keyframes ${keyframes} {`);
    }
  });

  it.each([
    'type Phase = "fade-in" | "sustain";',
    'phase = "fade-in"; if (track.phase === "fade-in") {}',
    'const track = { phase: "fade-in" };',
    'expect(track.phase).toBe("fade-in");',
  ])("상태 값은 클래스 위반으로 세지 않는다: %s", (text) => {
    expect(hasBareFadeInClass(text)).toBe(false);
  });

  it.each([
    'const className = "fade-in";',
    '<div className="fade-in" />',
    '<div className={phase === "fade-in" ? "fade-in" : "animate-fade-in"} />',
    'const track = { phase: "fade-in" }; const css = "fade-in";',
    'expect(className).toBe("fade-in");',
  ])("상태 코드와 함께 있어도 죽은 클래스는 차단한다: %s", (text) => {
    expect(hasBareFadeInClass(text)).toBe(true);
  });

  it("tailwindcss-animate 관용구 토큰이 소스에 남아 있지 않다", async () => {
    const offenders: string[] = [];
    // animate-in / zoom-in-95 / slide-in-from-* / variant:fade-in 은 어떤 문맥에서도 클래스 관용구다.
    const alwaysDead = /\banimate-in\b|\bzoom-in-\d|\bslide-in-from-[\w-]+|(?:[a-z-]+:)fade-in\b/;
    // 값싼 사전 필터 — 바늘 중 하나라도 없는 파일은 토큰화까지 가지 않는다.
    const anyNeedle = /animate-in|fade-in|zoom-in-\d|slide-in-from-/;
    const files = listSourceFiles(SRC_ROOT);
    let nextFile = 0;
    // 같은 전체 소스를 검사하되 파일 읽기는 여덟 개로 제한해 겹친 디스크 작업을 기다린다.
    await Promise.all(Array.from({ length: Math.min(8, files.length) }, async () => {
      for (;;) {
        const file = files[nextFile++];
        if (!file) return;
        const rel = relative(SRC_ROOT, file);
        if (rel === SELF) continue;
        const text = await readFile(file, "utf8");
        if (!anyNeedle.test(text)) continue;
        if (alwaysDead.test(text)) offenders.push(`${rel}: animate-in/zoom-in/slide-in-from/variant fade-in`);
        if (BARE_FADE_IN_EXCLUDED.has(rel)) continue;
        // 상태 값은 문법으로 구분한다. 같은 파일에 실제 죽은 클래스가 있으면 계속 차단한다.
        if (hasBareFadeInClass(text)) offenders.push(`${rel}: bare fade-in`);
      }
    }));
    expect(offenders.sort()).toEqual([]);
  });
});
