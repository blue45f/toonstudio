import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * 개연성 점검 허브 스타일 계약.
 *
 * 화면 컴포넌트가 쓰는 클래스가 스타일 시트에 실제로 있는지, 랩 셸의 색 토큰만 가져다 쓰는지,
 * 좁은 화면·움직임 줄이기·고대비 같은 접근성 조건이 빠지지 않았는지 지킨다. 브라우저 없이 소스 글자만 본다.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const HUB_CSS = read("./studio-story-plausibility.css");
const SHELL_CSS = read("../studio-storyworld-lab.css");

const COMPONENT_FILES = [
  "./StudioStoryPlausibilityDetail.tsx",
  "./StudioStoryPlausibilityFindingList.tsx",
  "./StudioStoryPlausibilityHub.tsx",
  "./StudioStoryPlausibilityManuscript.tsx",
  "./StudioStoryPlausibilityParts.tsx",
  "./StudioStoryPlausibilityQuestionForms.tsx",
  "./StudioStoryPlausibilityQuestionnaire.tsx",
  "./StudioStoryPlausibilityReportView.tsx",
  "./StudioStoryPlausibilityScopePanel.tsx",
] as const;

/** 클래스 이름 뒤에 식이 붙는 곳(`row--${severity}` 등)이 만들 수 있는 값. */
const DYNAMIC_VARIANTS: Readonly<Record<string, readonly string[]>> = {
  "plausibility-row--": ["error", "warning", "suggestion"],
  "plausibility-badge--": ["error", "warning", "suggestion"],
  "plausibility-meter--": ["low", "high"],
};

function definedClasses(css: string): ReadonlySet<string> {
  return new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/gu)].map((match) => match[1] ?? ""));
}

function usedClassTokens(source: string): string[] {
  const tokens: string[] = [];
  for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/gu)) {
    const raw = match[1] ?? match[2] ?? "";
    for (const token of raw.replace(/\$\{[^}]*\}/gu, " ").split(/\s+/u)) {
      if (token) tokens.push(token);
    }
  }
  // meterTone 같은 도우미가 돌려주는 글자 상수도 클래스로 쓰인다(name·id 속성 값은 클래스가 아니므로 뺀다).
  const withoutAttributeIds = source.replace(/\b(?:name|id|htmlFor)="[^"]*"/gu, "");
  for (const match of withoutAttributeIds.matchAll(/"(plausibility-[\w-]+)"/gu)) {
    if (match[1]) tokens.push(match[1]);
  }
  return tokens;
}

describe("개연성 허브 스타일 시트", () => {
  const defined = definedClasses(HUB_CSS);
  const shellDefined = definedClasses(SHELL_CSS);

  it("컴포넌트가 쓰는 plausibility- 클래스는 모두 스타일 시트에 정의되어 있다", () => {
    const missing: string[] = [];
    for (const file of COMPONENT_FILES) {
      for (const token of usedClassTokens(read(file))) {
        if (!token.startsWith("plausibility-")) continue;
        if (token in DYNAMIC_VARIANTS) continue; // 접두사만 남은 동적 이름은 아래에서 따로 확인한다.
        if (!defined.has(token)) missing.push(`${file}: ${token}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("동적으로 이어 붙이는 클래스의 모든 변형이 정의되어 있다", () => {
    for (const [prefix, variants] of Object.entries(DYNAMIC_VARIANTS)) {
      for (const variant of variants) {
        expect(defined.has(`${prefix}${variant}`), `${prefix}${variant}`).toBe(true);
      }
    }
  });

  it("랩 셸 클래스(storyworld-)를 쓰면 셸 스타일 시트에 이미 있는 것만 쓴다", () => {
    const missing: string[] = [];
    for (const file of COMPONENT_FILES) {
      for (const token of usedClassTokens(read(file))) {
        if (token.startsWith("storyworld-") && !shellDefined.has(token) && !defined.has(token)) missing.push(`${file}: ${token}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("색은 랩 셸 토큰(--storyworld-*)을 참조하고, 참조한 토큰은 셸에 선언되어 있다", () => {
    const referenced = new Set([...HUB_CSS.matchAll(/var\((--storyworld-[\w-]+)/gu)].map((match) => match[1] ?? ""));
    expect(referenced.size).toBeGreaterThan(8);
    const undeclared = [...referenced].filter((name) => !new RegExp(`${name}\\s*:`, "u").test(SHELL_CSS));
    expect(undeclared).toEqual([]);
  });

  it("고정 색 값은 토큰의 대체값과 강조 표시 배경 한 곳에만 쓴다", () => {
    const withoutTokenFallbacks = HUB_CSS.replace(/var\(--storyworld-[\w-]+,\s*#[0-9a-fA-F]{3,8}\)/gu, "var(token)");
    const rawColors = [...withoutTokenFallbacks.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/gu)].map((match) => match[0]);
    expect(rawColors).toEqual(["rgb(255 210 122 / 28%)"]);
  });

  it("3단 → 2단 → 1단 배치 경계와 접근성 미디어 조건이 모두 있다", () => {
    for (const query of [
      "(max-width: 1240px)",
      "(min-width: 1241px)",
      "(max-width: 900px)",
      "(pointer: coarse)",
      "(prefers-reduced-motion: reduce)",
      "(prefers-contrast: more)",
      "(forced-colors: active)",
    ]) {
      expect(HUB_CSS, query).toContain(`@media ${query}`);
    }
  });

  it("움직임 줄이기를 켜면 전환과 애니메이션을 끈다", () => {
    const block = HUB_CSS.slice(HUB_CSS.indexOf("@media (prefers-reduced-motion: reduce)"));
    const body = block.slice(0, block.indexOf("\n}\n") + 3);
    expect(body).toMatch(/animation:\s*none/u);
    expect(body).toMatch(/transition-duration:\s*0\.01ms/u);
    expect(body).toMatch(/animation-duration:\s*0\.01ms/u);
    expect(body).toMatch(/scroll-behavior:\s*auto/u);
  });

  it("키보드 초점 표시를 숨기지 않는다", () => {
    expect(HUB_CSS).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid/u);
    expect(HUB_CSS).not.toMatch(/outline:\s*(?:none|0)\b/u);
  });

  it("좁은 화면에서 가로 스크롤을 만드는 고정 폭을 두지 않는다", () => {
    const fixedWidths = [...HUB_CSS.matchAll(/(?<![-\w])width:\s*(\d{4,})px/gu)].map((match) => match[0]);
    expect(fixedWidths).toEqual([]);
  });
});
