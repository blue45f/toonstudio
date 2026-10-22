import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 지연 로드되는 소재 권리·배치 모듈의 값 import 허용 목록.
 *
 * 번들러는 "같은 곳에서 도달 가능한 모듈"을 한 청크로 묶는다. 지연 로드되는 모듈이 편집기 활성화 그래프(StudioBackground3D 의
 * 정적 import 폐포)에 이미 있는 모듈을 값으로 가져오면, 그 모듈이 활성화 본체 청크에서 떨어져 나와 별도 공유 청크가 되고
 * 활성화 정적 청크 수가 늘어 번들 래칫을 넘는다(2026-10-17 통합 빌드에서 활성화 청크 93 → 97 로 걸렸다).
 *
 * 그래서 아래 모듈은 활성화 그래프에 있는 모듈을 값으로 가져오지 않는다. 필요한 값은 활성화 쪽 접합부가 정적으로 가져와 실행
 * 때 인자로 넘기고(타입만 가져온다), 한두 줄짜리 판정은 사본을 두고 표 시험으로 원본과 같은 결과를 지킨다.
 *
 * 이 목록에 값 import 를 더하려면 먼저 그 모듈이 활성화 그래프에 있는지 확인한다. 있다면 위 두 방법 중 하나로 푼다.
 */

const FILE_ROOT = new URL("./", import.meta.url);

function moduleImports(fileName: string) {
  const fileUrl = new URL(fileName, FILE_ROOT);
  const file = ts.createSourceFile(fileUrl.pathname, readFileSync(fileUrl, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const valueImports: string[] = [];
  const typeImports: string[] = [];
  const dynamicImports: string[] = [];
  const reExports: string[] = [];
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      (node.importClause?.isTypeOnly ? typeImports : valueImports).push(node.moduleSpecifier.text);
    }
    if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier) && !node.isTypeOnly) {
      reExports.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node)
      && node.expression.kind === ts.SyntaxKind.ImportKeyword
      && node.arguments.length === 1
      && ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicImports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return { valueImports, typeImports, dynamicImports, reExports };
}

/** 편집기 활성화 그래프에 있어서 지연 모듈이 값으로 가져오면 안 되는 모듈(이 기능이 쓰던 것들). */
const ACTIVATION_GRAPH_MODULES = [
  "./studio-bg3d-import-ai-use",
  "./studio-bg3d-physics-ui",
  "./studio-bg3d-scene-edit-readiness",
  "./studio-bg3d-editor-derivations",
  "./studio-bg3d-modal-operation-coordinator",
  "./studio-bg3d-model-placement-admission",
  "./studio-bg3d-scene-document-types",
  "./studio-bg3d-scale-guide",
  "./studio-bg3d-placement-recipe",
  "./studio-bg3d-object-ops",
] as const;

interface LazyModuleContract {
  readonly file: string;
  readonly valueImports: readonly string[];
  readonly dynamicImports: readonly string[];
}

const LAZY_MODULES: readonly LazyModuleContract[] = [
  {
    file: "studio-bg3d-editor-recipe-run.ts",
    valueImports: [
      "../studio-background-3d-model",
      "./studio-bg3d-asset-placement-catalog",
      "./studio-bg3d-asset-placement-recipes",
      "./studio-bg3d-camera-application",
      "./studio-bg3d-environment-catalog",
      "./studio-bg3d-wall-probe",
    ],
    dynamicImports: [],
  },
  { file: "studio-bg3d-asset-placement-recipes.ts", valueImports: ["./studio-bg3d-asset-placement-catalog"], dynamicImports: [] },
  { file: "studio-bg3d-asset-placement-catalog.ts", valueImports: [], dynamicImports: [] },
  { file: "studio-bg3d-wall-probe.ts", valueImports: ["three", "./studio-bg3d-camera-application"], dynamicImports: [] },
  {
    file: "studio-bg3d-import-asset-metadata.ts",
    valueImports: [
      "./studio-bg3d-asset-metadata",
      "./studio-bg3d-asset-rights-refresh",
      "./studio-bg3d-import-ai-use-lazy",
      "./studio-bg3d-import-rights-receipt",
      "./studio-bg3d-import-save-interrupt",
    ],
    dynamicImports: ["./studio-bg3d-asset-metadata-store"],
  },
  {
    file: "studio-bg3d-skp-import-run.ts",
    valueImports: [
      "./studio-bg3d-import-ai-use-lazy",
      "./studio-bg3d-skp-asset-metadata",
      "./studio-bg3d-skp-import-session",
    ],
    dynamicImports: [],
  },
  {
    file: "studio-bg3d-skp-asset-metadata.ts",
    valueImports: [
      "./studio-bg3d-asset-metadata",
      "./studio-bg3d-asset-rights-refresh",
      "./studio-bg3d-import-rights-receipt",
      "./studio-bg3d-import-save-interrupt",
    ],
    dynamicImports: ["./studio-bg3d-asset-metadata-store"],
  },
  // 의존하는 모듈이 없는 잎. 값 import 가 하나도 없어야 여러 지연 모듈이 나눠 써도 새 청크가 갈라지지 않는다.
  { file: "studio-bg3d-import-ai-use-lazy.ts", valueImports: [], dynamicImports: [] },
  { file: "studio-bg3d-import-save-interrupt.ts", valueImports: [], dynamicImports: [] },
  { file: "studio-bg3d-asset-rights-refresh.ts", valueImports: [], dynamicImports: [] },
  { file: "studio-bg3d-import-rights-receipt.ts", valueImports: [], dynamicImports: [] },
];

describe("지연 모듈의 값 import 허용 목록", () => {
  it.each(LAZY_MODULES)("$file: 값 import 와 동적 import 가 허용 목록과 같다", ({ file, valueImports, dynamicImports }) => {
    const imports = moduleImports(file);
    expect(imports.valueImports).toEqual(valueImports);
    expect(imports.dynamicImports).toEqual(dynamicImports);
    // 다시 내보내기도 값 import 와 같은 효과가 있다.
    expect(imports.reExports).toEqual([]);
  });

  it.each(LAZY_MODULES)("$file: 활성화 그래프의 모듈은 타입으로만 가져온다", ({ file }) => {
    const imports = moduleImports(file);
    const leaked = imports.valueImports.filter((source) => (ACTIVATION_GRAPH_MODULES as readonly string[]).includes(source));
    expect(leaked, "활성화 그래프의 모듈을 값으로 가져오면 활성화 청크가 갈라진다. 접합부 주입이나 사본 + 표 시험으로 푼다").toEqual([]);
  });

  it("검사 대상이 실제로 활성화 그래프 모듈을 타입으로는 가져오고 있다(빈 검사가 아니다)", () => {
    const typed = LAZY_MODULES.flatMap(({ file }) => moduleImports(file).typeImports)
      .filter((source) => (ACTIVATION_GRAPH_MODULES as readonly string[]).includes(source));
    expect(typed).toEqual(expect.arrayContaining([
      "./studio-bg3d-physics-ui",
      "./studio-bg3d-scene-edit-readiness",
      "./studio-bg3d-editor-derivations",
      "./studio-bg3d-import-ai-use",
    ]));
  });
});

describe("편집기 활성화 그래프에 올라가는 접합부", () => {
  it("편집기 정적 그래프에 올라가는 접합부의 값 import 는 이미 활성화 그래프에 있는 모듈뿐이다", () => {
    const imports = moduleImports("studio-bg3d-editor-recipe-host.ts");
    expect(imports.valueImports).toEqual([
      "./studio-bg3d-editor-derivations",
      "./studio-bg3d-model-placement-admission",
      "./studio-bg3d-modal-operation-coordinator",
      "./studio-bg3d-object-ops",
      "./studio-bg3d-physics-ui",
      "./studio-bg3d-placement-recipe",
      "./studio-bg3d-scene-document-types",
      "./studio-bg3d-scene-edit-readiness",
    ]);
    expect(imports.valueImports.every((source) => (ACTIVATION_GRAPH_MODULES as readonly string[]).includes(source))).toBe(true);
    expect(imports.typeImports).toEqual(["./studio-bg3d-editor-recipe-run"]);
    expect(imports.dynamicImports).toEqual(["./studio-bg3d-editor-recipe-run"]);
  });

  it("AI 표기 읽기·안내 모듈은 활성화 그래프의 잎이라 값 import 가 없다", () => {
    expect(moduleImports("studio-bg3d-import-ai-use.ts").valueImports).toEqual([]);
  });
});
