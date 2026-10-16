import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * 이 모듈들은 번들러가 아니라 **순수 Node**(`node --test`, 타입 제거 실행)도 직접 읽는다 —
 * `scripts/nonstudio-journey-contract.test.mjs` 가 `site-experience-model.ts` 에서 시작해 아래 파일들까지 따라 들어간다.
 * 순수 Node 는 tsconfig 의 `@/` 별칭을 해석하지 못하고 확장자 없는 상대 경로도 읽지 못한다. 별칭이나 확장자 없는 import 가
 * 끼면 비필수 워크플로(nonstudio-journey-audit)에서만 `ERR_MODULE_NOT_FOUND` 로 터져 PR 에서 늦게 발견된다.
 */
const NODE_LOADED_MODULES = [
  "../site-public-routes.ts",
  "../workspace/workspace-task-route.ts",
  "./site-experience-model.ts",
  "./site-experience-policy.ts",
] as const;

const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)["']([^"']+)["']/gu;

function specifiersOf(relativePath: string): string[] {
  const source = readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), "utf8");
  return [...source.matchAll(IMPORT_SPECIFIER)].map((match) => match[1] ?? "");
}

describe("순수 Node 가 읽는 모듈의 import 규약", () => {
  it.each(NODE_LOADED_MODULES)("%s 는 `@/` 별칭 없이 확장자 있는 상대 경로만 쓴다", (path) => {
    const specifiers = specifiersOf(path);
    expect(specifiers.filter((specifier) => specifier.startsWith("@/"))).toEqual([]);
    const relative = specifiers.filter((specifier) => specifier.startsWith("."));
    expect(relative.filter((specifier) => !/\.(?:[cm]?[jt]sx?|json)$/u.test(specifier))).toEqual([]);
  });

  it("검사 대상이 실제 import 를 읽고 있다(빈 목록으로 통과하지 않는다)", () => {
    expect(specifiersOf("./site-experience-model.ts").length).toBeGreaterThan(0);
  });
});
