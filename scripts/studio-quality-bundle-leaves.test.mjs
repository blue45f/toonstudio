import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// The maintained workflow uses Node; the root suite uses Vitest. Keep both real registrations.
const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

const leaves = ["studio-page-review.ts", "studio-frame-animation-timing.ts"];
for (const name of leaves) {
  test(name + " remains a dependency-free document chunk leaf", () => {
    const path = "apps/web/src/domains/creator/" + name;
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if (ts.isImportDeclaration(node)) assert.equal(node.importClause?.isTypeOnly, true);
      if (ts.isExportDeclaration(node) && node.moduleSpecifier) assert.equal(node.isTypeOnly, true);
    }
    const config = readFileSync("apps/web/config/vite-manual-chunks.ts", "utf8");
    const start = config.indexOf('id.endsWith("/src/domains/creator/studio-layers.ts")');
    const end = config.indexOf('return "studio-document-micro-models";', start);
    assert.ok(start >= 0 && end > start);
    assert.ok(config.slice(start, end).includes('/src/domains/creator/' + name));
  });
}

// 2026-10-15 번들 기준선 복구: 아래 잎 모듈은 기존 청크 그룹에 합쳐졌다. 합쳐도 정적·지연 폐포가
// 변하지 않으려면 값 import가 없어야 한다(그룹 청크가 끌고 들어올 의존성이 없다).
// 값 import가 생기면 그 의존성이 그룹과 함께 모든 소비자의 정적 폐포로 들어오므로 이 테스트가 먼저 막는다.
const coLocatedLeaves = [
  { path: "studio-macro-recorder.ts", chunk: "studio-editing-micro-models", allowedValueImports: [] },
  { path: "studio-pathfinder-vector-engine.ts", chunk: "studio-editing-micro-models", allowedValueImports: [] },
  { path: "studio-advanced-fill-tap.ts", chunk: "studio-editing-micro-models", allowedValueImports: [] },
  // 콜드롭은 탭 판정 하나만 import하고, 그 모듈이 같은 그룹이다.
  {
    path: "studio-colordrop-gesture.ts",
    chunk: "studio-editing-micro-models",
    allowedValueImports: ["./studio-advanced-fill-tap"],
  },
  { path: "drawing/studio-perspective-guide.ts", chunk: "studio-placement-guide-contracts", allowedValueImports: [] },
  // 퀵 선택은 같은 그룹의 매직완드만 import한다.
  {
    path: "studio-quick-selection.ts",
    chunk: "studio-selection-tools",
    allowedValueImports: ["./studio-magic-wand"],
  },
];
for (const leaf of coLocatedLeaves) {
  test(leaf.path + " stays a leaf of " + leaf.chunk, () => {
    const path = "apps/web/src/domains/creator/" + leaf.path;
    const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const valueImports = [];
    for (const node of source.statements) {
      if (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) {
        valueImports.push(node.moduleSpecifier.text);
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && !node.isTypeOnly) {
        valueImports.push(node.moduleSpecifier.text);
      }
    }
    assert.deepEqual(valueImports.sort(), [...leaf.allowedValueImports].sort());

    const config = readFileSync("apps/web/config/vite-manual-chunks.ts", "utf8");
    const end = config.indexOf('return "' + leaf.chunk + '";');
    assert.ok(end > 0, leaf.chunk + " rule must exist");
    const start = config.lastIndexOf("    if (", end);
    assert.ok(start >= 0 && config.slice(start, end).includes(leaf.path.replace(/\.ts$/u, "")));
  });
}
