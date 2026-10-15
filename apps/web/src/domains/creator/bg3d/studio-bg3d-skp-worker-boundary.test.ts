import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

// SKP 변환 Worker 의 모듈 그래프 경계. Worker 는 요청마다 새로 만들어지므로 번들이 가벼워야 하고,
// 보고서 스키마 검증(zod)은 결과를 받는 메인 스레드·저장소 쪽에서만 한다.

const DIRECTORY = path.dirname(fileURLToPath(import.meta.url));
const ENTRY = "studio-bg3d-skp.worker.ts";

interface ModuleImports {
  /** 런타임에 남는 정적 import/export-from 대상(`import type` 은 제외, 인라인 type 만 있는 import 는 남는 것으로 본다). */
  readonly runtime: string[];
  readonly dynamic: string[];
}

function scanImports(fileName: string): ModuleImports {
  const filePath = path.join(DIRECTORY, fileName);
  const file = ts.createSourceFile(filePath, readFileSync(filePath, "utf8"), ts.ScriptTarget.Latest, true);
  const runtime: string[] = [];
  const dynamic: string[] = [];
  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier) && !node.importClause?.isTypeOnly) {
      runtime.push(node.moduleSpecifier.text);
    }
    if (
      ts.isExportDeclaration(node)
      && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
      && !node.isTypeOnly
    ) {
      runtime.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      dynamic.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { runtime, dynamic };
}

function resolveRelative(specifier: string): string {
  const base = specifier.replace(/^\.\//u, "");
  for (const candidate of [`${base}.ts`, `${base}.tsx`, base]) {
    if (existsSync(path.join(DIRECTORY, candidate)) && /\.tsx?$/u.test(candidate)) return candidate;
  }
  throw new Error(`해석할 수 없는 모듈: ${specifier}`);
}

/** Worker 진입점에서 정적으로 닿는 같은 디렉터리 모듈과, 그 모듈들이 정적으로 가져오는 바깥 패키지. */
function workerGraph(): { readonly files: string[]; readonly packages: string[] } {
  const files: string[] = [];
  const packages = new Set<string>();
  const pending = [ENTRY];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || files.includes(current)) continue;
    files.push(current);
    for (const specifier of scanImports(current).runtime) {
      if (specifier.startsWith(".")) pending.push(resolveRelative(specifier));
      else packages.add(specifier);
    }
  }
  return { files: files.sort(), packages: [...packages].sort() };
}

describe("SKP conversion Worker module graph", () => {
  const graph = workerGraph();

  it("never loads zod or the report schema, which only the receiving side needs", () => {
    expect(graph.packages).not.toContain("zod");
    expect(graph.files).not.toContain("studio-bg3d-skp-import-report.ts");
    // 보고서를 만드는 쪽(생성기)은 Worker 에 있어야 한다.
    expect(graph.files).toContain("studio-bg3d-skp-report-builder.ts");
  });

  it("stays free of three.js, React and the import pipeline", () => {
    for (const forbidden of ["three", "react", "react-dom"]) {
      expect(graph.packages).not.toContain(forbidden);
    }
    expect(graph.packages.some((name) => name.startsWith("three/"))).toBe(false);
    for (const file of graph.files) {
      expect(file).not.toMatch(/model-import|Panel|session|worker-client/u);
    }
  });

  it("reaches the converter only through a dynamic import so it is not parsed before it is needed", () => {
    expect(graph.packages).not.toContain("openskp");
    expect(scanImports("studio-bg3d-skp-worker-runtime.ts").dynamic).toContain("openskp");
  });

  it("lists exactly the modules it depends on, so a new dependency is a conscious choice", () => {
    expect(graph.files).toEqual([
      "studio-bg3d-skp-contract.ts",
      "studio-bg3d-skp-conversion-core.ts",
      "studio-bg3d-skp-glb-scale.ts",
      "studio-bg3d-skp-mesh-analysis.ts",
      "studio-bg3d-skp-mesh-merge.ts",
      "studio-bg3d-skp-model-summary.ts",
      "studio-bg3d-skp-preflight.ts",
      "studio-bg3d-skp-report-builder.ts",
      "studio-bg3d-skp-report-constants.ts",
      "studio-bg3d-skp-unit.ts",
      "studio-bg3d-skp-worker-protocol.ts",
      "studio-bg3d-skp-worker-runtime.ts",
      "studio-bg3d-skp-zip-index.ts",
      "studio-bg3d-skp.worker.ts",
    ]);
    expect(graph.packages).toEqual([]);
  });
});
