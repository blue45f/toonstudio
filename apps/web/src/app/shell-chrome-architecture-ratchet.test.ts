import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 셸 크롬 아키텍처 래칫 — 전역 크롬의 소유 단일화를 동결한다 (표준 S-1·S-4).
 *
 * 표준 문서: `~/workspace/goals/toonstudio-site-modernization/hidden_files/shell-nav-2026-10-02/nav-standard.md`
 * 감사: `~/workspace/goals/toonstudio-site-modernization/hidden_files/shell-consistency-audit-2026-10-07.md` §6 U-7
 *
 * 규칙:
 * - 전역 헤더(`site-header`)와 푸터(`site-footer`)는 `app/App.tsx`만 import한다.
 *   AppShell은 헤더·푸터를 props로 받을 뿐 직접 만들지 않는다.
 * - 몰입(전역 크롬 제거) 판정은 `app/shell-chrome-policy.ts`가 단일 기준이고,
 *   그 모듈을 import하는 production 파일은 `app/AppShell.tsx`뿐이다.
 * - 라우트 그룹·페이지·도메인이 위 모듈들을 새로 import하면 — 즉 정책 파일을 거치지 않고
 *   자체 전역 크롬을 만들거나 몰입 판정을 복제하면 — 이 테스트가 실패한다.
 *   새 몰입 예외가 필요하면 정책 파일의 명시 목록에 추가하는 것이 유일한 경로다.
 *
 * 동결 목록은 "현재 소유자"의 실측이다. 소유자를 옮기는 변경은 이 목록을 함께 고쳐야 하고,
 * 목록을 넓히는 변경은 자체 크롬이 늘어난다는 뜻이므로 표준 문서와 함께 검토한다.
 * CSS에서 `.site-header` 같은 클래스 선택자로 스타일만 얹는 것은 크롬 생성이 아니므로 세지 않는다.
 */
const APP_DIR = fileURLToPath(new URL("./", import.meta.url));
const SRC_DIR = path.resolve(APP_DIR, "..");

const SKIPPED_DIRECTORIES = new Set(["node_modules", "dist", "build", "coverage", ".vite"]);
const TEST_FILE_PATTERN = /\.(test|spec)\.(ts|tsx)$/;

/** 모듈 식별자 끝 이름 → 그 모듈을 import할 수 있는 유일한 production 파일(동결). */
const CHROME_MODULE_OWNERS: readonly {
  readonly moduleTail: string;
  readonly owners: readonly string[];
}[] = [
  { moduleTail: "site-header", owners: ["app/App.tsx"] },
  { moduleTail: "site-footer", owners: ["app/App.tsx"] },
  { moduleTail: "shell-chrome-policy", owners: ["app/AppShell.tsx"] },
];

const PREFILTER_TOKENS = CHROME_MODULE_OWNERS.map((entry) => entry.moduleTail);

function collectSourceFiles(directory: string, output: string[] = []): string[] {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".") || SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) collectSourceFiles(absolutePath, output);
    else if (/\.tsx?$/.test(entry.name) && !TEST_FILE_PATTERN.test(entry.name)) output.push(absolutePath);
  }
  return output;
}

function moduleSpecifiers(sourceFile: ts.SourceFile): string[] {
  const result: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) {
      result.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      result.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

/** "@/shared/components/site-header"·"./site-header"·"./site-header.ts"를 끝 이름으로 맞춘다. */
function moduleTailOf(specifier: string): string {
  const withoutExtension = specifier.replace(/\.(ts|tsx|js|jsx)$/u, "");
  return withoutExtension.split("/").pop() ?? withoutExtension;
}

function scanChromeImporters(): ReadonlyMap<string, readonly string[]> {
  const importers = new Map<string, string[]>(CHROME_MODULE_OWNERS.map((entry) => [entry.moduleTail, []]));
  for (const file of collectSourceFiles(SRC_DIR)) {
    const source = readFileSync(file, "utf8");
    if (!PREFILTER_TOKENS.some((token) => source.includes(token))) continue;
    const sourceFile = ts.createSourceFile(
      file,
      source,
      ts.ScriptTarget.Latest,
      true,
      file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    const tails = new Set(moduleSpecifiers(sourceFile).map(moduleTailOf));
    const relative = path.relative(SRC_DIR, file).split(path.sep).join("/");
    for (const entry of CHROME_MODULE_OWNERS) {
      if (tails.has(entry.moduleTail)) importers.get(entry.moduleTail)?.push(relative);
    }
  }
  for (const list of importers.values()) list.sort((a, b) => a.localeCompare(b));
  return importers;
}

const importers = scanChromeImporters();

describe("셸 크롬 아키텍처 래칫", () => {
  it("전역 헤더는 App.tsx만 import한다 — 라우트·페이지의 자체 전역 헤더를 금지한다", () => {
    expect(importers.get("site-header")).toEqual(["app/App.tsx"]);
  });

  it("전역 푸터는 App.tsx만 import한다 — 라우트·페이지의 자체 전역 푸터를 금지한다", () => {
    expect(importers.get("site-footer")).toEqual(["app/App.tsx"]);
  });

  it("몰입 판정 정책은 AppShell만 import한다 — 정책 밖 몰입 판정 복제를 금지한다", () => {
    expect(importers.get("shell-chrome-policy")).toEqual(["app/AppShell.tsx"]);
  });
});
