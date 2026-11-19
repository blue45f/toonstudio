import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleEdges {
  readonly source: string;
  readonly valueImports: readonly string[];
}

function moduleEdges(relativePath: string): ModuleEdges {
  const fileUrl = new URL(relativePath, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  );
  const valueImports: string[] = [];

  function visit(node: ts.Node): void {
    if (
      ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier)
      && !node.importClause?.isTypeOnly
    ) {
      valueImports.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return { source, valueImports };
}

describe("Studio canvas leaf boundaries", () => {
  it("statically imports each leaf exactly once from StudioPage", () => {
    const page = moduleEdges("../studio-cuttoon-editor/StudioCuttoonEditorContextMenu.tsx");
    const viewport = moduleEdges("./StudioCanvasViewport.tsx");

    expect(
      viewport.valueImports.filter((specifier) => specifier === "./StudioCanvasStatusRail")
    ).toEqual(["./StudioCanvasStatusRail"]);
    expect(
      page.valueImports.filter((specifier) => specifier === "../canvas/StudioCanvasContextMenu")
    ).toEqual(["../canvas/StudioCanvasContextMenu"]);
  });

  it("keeps GPU, CRDT, brush, Konva, and editor ownership out of both leaves", () => {
    const leaves = [
      moduleEdges("./StudioCanvasStatusRail.tsx"),
      moduleEdges("./StudioCanvasContextMenu.tsx"),
    ];
    const forbiddenImport = /(?:studio-(?:webgpu|crdt|drawing-pointer|brush)|StudioPage|react-konva|konva)/iu;

    for (const leaf of leaves) {
      expect(leaf.valueImports.filter((specifier) => forbiddenImport.test(specifier))).toEqual([]);
      expect(leaf.source).not.toContain("onStageDown");
      expect(leaf.source).not.toContain("onStageUp");
      expect(leaf.source).not.toContain("publishStudio");
    }
  });

  it("메뉴 수명과 3D 판독은 호스트의 명령·레이어 복구 모듈에 둔다", () => {
    const page = moduleEdges("../StudioCuttoonEditorHost.tsx");
    const resume = moduleEdges("../studio-cuttoon-editor/runtime/studio-bg3d-layer-resume.ts");
    const viewport = moduleEdges("./StudioCanvasViewportStageHost.tsx");
    const menu = moduleEdges("./StudioCanvasContextMenu.tsx");

    expect(page.source).toContain("const [contextMenu, setContextMenu] = useState");
    expect(page.source).toContain('globalThis.addEventListener("click", handleCloseMenu)');
    expect(page.valueImports).toContain("./studio-cuttoon-editor/runtime/studio-bg3d-layer-resume");
    expect(page.source).toContain("studioBg3dLayerEditSource(element, { linked3dRender, shared3dStage }, elements)");
    expect(resume.valueImports).toContain("../../studio-background-3d-metadata");
    expect(resume.source).toContain('parseStudio3dTool(element.src) === "bg3d"');
    const commands = moduleEdges("../studio-cuttoon-editor/StudioCuttoonEditorContextMenu.tsx");
    expect(commands.valueImports).toContain("../studio-background-3d-metadata");
    expect(commands.source).toContain("parseStudio3dTool(contextMenuEl.src)");
    expect(viewport.source).toContain("onContextMenu={(e) =>");
    expect(menu.valueImports).not.toContain("../studio-background-3d-metadata");
    expect(menu.valueImports).not.toContain("../studio-background-3d-loader");
    expect(menu.valueImports).not.toContain("../studio-element-model");
    expect(menu.valueImports).not.toContain("../studio-cuttoon-editor/runtime/studio-bg3d-layer-resume");
    expect(menu.source).not.toContain("parseStudio3dTool");
  });

  it("keeps Emeres save independent from the generic close helper", () => {
    const menu = moduleEdges("./StudioCanvasContextMenu.tsx").source;

    expect(menu).toContain("onClick={onSaveAsEmeres}");
    expect(menu).not.toMatch(/runAndClose\(onSaveAsEmeres/u);
  });

  it("passes only a fill preview message into the status leaf", () => {
    const viewport = moduleEdges("./StudioCanvasViewport.tsx").source;
    const rail = moduleEdges("./StudioCanvasStatusRail.tsx").source;

    expect(viewport).toContain("advancedFillPreviewMessage={advancedFillPreview?.message ?? null}");
    expect(rail).toContain("advancedFillPreviewMessage: string | null");
    expect(rail).not.toContain("StudioAdvancedFillPreview");
  });
});
