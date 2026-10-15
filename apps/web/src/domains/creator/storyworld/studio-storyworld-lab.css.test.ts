import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * 스토리월드 랩 화면 스타일 계약.
 *
 * 화면 컴포넌트가 쓰는 `storyworld-` 클래스가 스타일 시트에 실제로 있는지 지킨다. 브라우저 없이 소스 글자만 본다.
 * 예전에는 수동 스크립트(scripts/verify-storyworld-lab.mjs)만 이 확인을 했고 CI 에 연결되어 있지 않아,
 * 설정 불러오기 안내의 순서 목록 스타일이 빠진 채 출하되었다. 개연성 허브의 같은 계약은
 * plausibility/studio-story-plausibility.css.test.ts 가 지킨다.
 */
const read = (name: string) => readFileSync(new URL(`./${name}`, import.meta.url), "utf8");

const LAB_CSS = read("studio-storyworld-lab.css");

const COMPONENT_FILES = [
  "StudioStoryworldBoard.tsx",
  "StudioStoryworldIssues.tsx",
  "StudioStoryworldLabPage.tsx",
  "StudioStoryworldLabShared.tsx",
  "StudioStoryworldSettings.tsx",
  "StudioStoryworldUniverse.tsx",
] as const;

/** 스타일 없이 구조 표식으로만 쓰는 클래스(자식 요소의 클래스가 모양을 정한다). */
const MARKER_CLASSES: ReadonlySet<string> = new Set(["storyworld-board"]);

function definedClasses(css: string): ReadonlySet<string> {
  return new Set([...css.matchAll(/\.([A-Za-z_][\w-]*)/gu)].map((match) => match[1] ?? ""));
}

/** 이름이 통째로 글자로 적힌 클래스만 모은다. `--${식}` 처럼 식이 붙는 이름은 아래 변형 검사가 맡는다. */
function staticClassTokens(source: string): string[] {
  const tokens: string[] = [];
  for (const match of source.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/gu)) {
    const raw = match[1] ?? match[2] ?? "";
    for (const token of raw.replace(/\S*\$\{[^}]*\}\S*/gu, " ").split(/\s+/u)) {
      if (token) tokens.push(token);
    }
  }
  return tokens;
}

describe("스토리월드 랩 스타일 시트", () => {
  const defined = definedClasses(LAB_CSS);

  it("화면 컴포넌트가 쓰는 storyworld- 클래스는 모두 스타일 시트에 정의되어 있다", () => {
    const missing: string[] = [];
    for (const file of COMPONENT_FILES) {
      for (const token of staticClassTokens(read(file))) {
        if (!token.startsWith("storyworld-") || MARKER_CLASSES.has(token)) continue;
        if (!defined.has(token)) missing.push(`${file}: ${token}`);
      }
    }
    expect([...new Set(missing)]).toEqual([]);
  });

  it("상태에 따라 이어 붙이는 클래스의 변형이 정의되어 있다", () => {
    const variants: Readonly<Record<string, readonly string[]>> = {
      "storyworld-tone--": ["good", "warn", "bad"],
      "storyworld-issue--": ["error", "warning", "info"],
      "storyworld-save-state--": ["saved", "error"],
    };
    const missing = Object.entries(variants).flatMap(([prefix, names]) =>
      names.map((name) => `${prefix}${name}`).filter((className) => !defined.has(className)));
    expect(missing).toEqual([]);
  });
});
