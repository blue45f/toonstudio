import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

function moduleSource(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

function moduleImports(fileName: string) {
  const fileUrl = new URL(fileName, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const valueImports: string[] = [];
  const typeImports: string[] = [];
  const dynamicImports: string[] = [];

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const target = node.importClause?.isTypeOnly ? typeImports : valueImports;
      target.push(node.moduleSpecifier.text);
    }
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      dynamicImports.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(file);
  return { dynamicImports, typeImports, valueImports };
}

describe("Studio BG3D asset-library ownership boundary", () => {
  it("keeps the canonical leaf panel renderer-free and prevents a reverse editor import", () => {
    const imports = moduleImports("./StudioBg3dAssetLibraryPanel.tsx");
    expect(imports.valueImports).toEqual([
      "lucide-react",
      "react",
      "@/shared/lib/i18n-bilingual-copy",
      "@/shared/lib/i18n",
      "../studio-bg3d-panel-status-i18n",
      "./StudioBg3dAssetAiUseFields",
      "./StudioBg3dAssetCardRightsActions",
      "./StudioBg3dAssetNameMatchHint",
      "./StudioBg3dAssetRightsFilterBar",
      "./StudioBg3dAssetRightsInfo",
      "./StudioBg3dSkpImportPanel",
      "./studio-bg3d-asset-placement-catalog",
      "./studio-bg3d-asset-rights-catalog",
      "./studio-bg3d-asset-rights-copy",
      "./studio-bg3d-asset-rights-view",
      "./studio-bg3d-environment-catalog",
      "./studio-bg3d-skp-import-copy",
    ]);
    expect(imports.typeImports).toEqual([
      "./bg3d-model-library",
      "./studio-bg3d-asset-metadata",
      "./studio-bg3d-asset-placement-catalog",
      "./studio-bg3d-asset-rights-copy",
      "./studio-bg3d-asset-rights-view",
      "./useStudioBg3dAssetRights",
    ]);
    expect(imports.dynamicImports).toEqual(["./studio-bg3d-canonical-glb-download"]);
    expect([...imports.valueImports, ...imports.typeImports]).not.toContain("./StudioBackground3D");
    expect(imports.valueImports).not.toContain("three");
    expect(imports.valueImports.some((source) => source.startsWith("@react-three/"))).toBe(false);
  });

  it("keeps the reference-rebuild wrapper renderer-free and delegates to the canonical file input", () => {
    const imports = moduleImports("./StudioBg3dAssetLibraryPanelWithPresets.tsx");
    expect(imports.valueImports).toEqual([
      "react",
      "./StudioBg3dAssetLibraryPanel",
      "./StudioBg3dBundleThemePackPanel",
      "./StudioReferenceRebuildPresets",
      "./studio-bg3d-asset-rights-catalog",
      "./useStudioBg3dAssetRights",
      // 상태 문구를 번역 함수로 그리면서 번역기와 문구 사전 등록 모듈이 값 import 로 들어왔다. 둘 다 렌더러·파일 입력과 무관하다.
      "@/shared/lib/i18n",
      "../studio-bg3d-panel-status-i18n",
    ]);
    expect(imports.dynamicImports).toEqual([]);
    const wrapper = moduleSource("./StudioBg3dAssetLibraryPanelWithPresets.tsx");
    // 읽은 권리 보기는 속성으로만 넘기고 패널이 파일 입력과 가져오기 권리 폼을 계속 소유한다.
    expect(wrapper).toContain("<ExistingAssetLibraryPanel");
    expect(wrapper).toContain("{...props}");
    expect(wrapper).toContain("rightsViews={props.rightsViews ?? rights.views}");
    expect(wrapper).toContain("input.files = transfer.files");
    expect(wrapper).toContain('input.dispatchEvent(new Event("change", { bubbles: true }))');
    expect(wrapper).toContain("importButton.disabled");
    expect(wrapper).not.toContain("saveVerifiedBg3dModel");
    expect(wrapper).not.toContain("importVerifiedBg3dModelsAtomically");
    // The presets component owns no browser API itself: the module worker that builds GLB
    // meshes is constructed by a renderer-free client module (studio-host-architecture-ratchet
    // keeps `new Worker(` out of creator components).
    const presets = moduleImports("./StudioReferenceRebuildPresets.tsx");
    // 번역 함수와 상태 문구 사전 등록(부수 효과 모듈) 둘만 더해졌고 렌더러·브라우저 API 는 여전히 없다.
    expect(presets.valueImports).toEqual([
      "react",
      "./studio-reference-rebuild-worker-client",
      "@/shared/lib/i18n",
      "../studio-bg3d-panel-status-i18n",
      "../status-i18n/studio-bg3d-panel-status-i18n-r4cat5",
    ]);
    expect(presets.dynamicImports).toEqual([]);
    const workerClient = moduleImports("./studio-reference-rebuild-worker-client.ts");
    expect(workerClient.valueImports).toEqual([]);
    expect(workerClient.dynamicImports).toEqual([]);
  });

  it("keeps the rights UI parts renderer-free and leaves storage reads to the composition hook", () => {
    for (const file of [
      "./StudioBg3dAssetAiUseFields.tsx",
      "./StudioBg3dAssetCardRightsActions.tsx",
      "./StudioBg3dAssetNameMatchHint.tsx",
      "./StudioBg3dAssetRecipeMenu.tsx",
      "./StudioBg3dAssetRightsFilterBar.tsx",
      "./StudioBg3dAssetRightsInfo.tsx",
    ]) {
      const imports = moduleImports(file);
      expect([...imports.valueImports, ...imports.typeImports]).not.toContain("three");
      expect(imports.valueImports.some((source) => source.startsWith("@react-three/"))).toBe(false);
      expect(imports.dynamicImports).toEqual([]);
      expect(imports.valueImports.some((source) => /store|authority|model-library/u.test(source))).toBe(false);
    }
    const panelSource = moduleSource("./StudioBg3dAssetLibraryPanel.tsx");
    for (const storageToken of ["readManifest", "listStudioBg3dAssetMetadata", "loadStudioBg3dAssetRightsSources", "parseV12ModelManifest"]) {
      expect(panelSource).not.toContain(storageToken);
    }
    // 저장소를 읽는 쪽은 훅과 읽기 원천뿐이며, 둘 다 지연 로딩되는 라이브러리 패널 아래에서만 쓰인다.
    expect(moduleImports("./useStudioBg3dAssetRights.ts").valueImports).toContain("./studio-bg3d-asset-rights-source");
    const sourceImports = moduleImports("./studio-bg3d-asset-rights-source.ts");
    expect(sourceImports.valueImports).toEqual([]);
    expect(sourceImports.dynamicImports).toEqual([
      "./studio-bg3d-libraries-sqlite-opfs-authority",
      "./bg3d-model-library",
      "./studio-bg3d-asset-metadata-store",
    ]);
  });

  it("keeps persistence, validation, resource disposal, scene, history, and selection in the parent", () => {
    const editorSource = [
      moduleSource("./StudioBackground3D.tsx"),
      moduleSource("./studio-bg3d-editor-lt-host.ts"),
      moduleSource("./StudioBg3dEditorSidebarExtras.tsx"),
    ].join("\n");
    const editorImports = moduleImports("./StudioBackground3D.tsx");
    const panelSource = moduleSource("./StudioBg3dAssetLibraryPanel.tsx");
    const editorOwnedSource = `${editorSource}\n${
      moduleSource("./studio-bg3d-editor-model-import-actions.ts")
    }\n${moduleSource("./useStudioBg3dEditor.ts")}\n${
      moduleSource("./studio-bg3d-editor-scene-ops-host.ts")
    }\n${moduleSource("./useStudioBg3dEditorState.ts")}`;

    expect(editorImports.valueImports).not.toContain("./StudioBg3dAssetLibraryPanel");
    expect(editorImports.valueImports).not.toContain("./StudioBg3dAssetLibraryPanelWithPresets");
    expect(editorImports.dynamicImports).toContain("./StudioBg3dAssetLibraryPanelWithPresets");
    expect(editorSource).toContain("<LazyStudioBg3dAssetLibraryPanel");
    expect(editorSource).toContain('if (tab === "models") setModelsPanelActivated(true)');
    expect(editorSource).toContain("modelsPanelActivated ? (");
    for (const ownerToken of [
      "handleUploadModelFiles",
      "importVerifiedBg3dModelsAtomically",
      "deleteStoredBg3dModel",
      "modelImportAbortRef",
      "modelRootCacheRef",
      "cacheEntry.dispose()",
      "removeSceneEntities",
      "historyRef",
      "setSelectedIds",
    ]) {
      expect(editorOwnedSource).toContain(ownerToken);
      expect(panelSource).not.toContain(ownerToken);
    }
    expect(editorSource).not.toContain('aria-label="3D 모델 및 연결 파일 선택"');
    expect(panelSource).toContain('aria-label={translateCurrentStaticSourceText("domains.creator.bg3d.StudioBg3dAssetLibraryPanel", "ko", "3D 모델 및 연결 파일 선택")}');
  });

  it("delays SQLite/OPFS model, template, and LT preset authorities until their product surfaces activate", () => {
    const editorSource = [
      moduleSource("./StudioBackground3D.tsx"),
      moduleSource("./useStudioBg3dEditorEffects.ts"),
      moduleSource("./studio-bg3d-editor-lt-host.ts"),
    ].join("\n");
    const _editorImports = moduleImports("./studio-bg3d-editor-runtime-bindings.ts");
    const bindingsSource = moduleSource("./studio-bg3d-editor-runtime-bindings.ts");
    const modelLoaderImports = moduleImports("./studio-bg3d-model-library-loader.ts");
    const templateLoaderImports = moduleImports("./studio-bg3d-template-library-loader.ts");
    const presetLoaderImports = moduleImports("./studio-bg3d-lt-preset-repository-loader.ts");

    expect(bindingsSource).toContain('from "./studio-bg3d-model-library-loader"');
    expect(bindingsSource).toContain('from "./studio-bg3d-template-library-loader"');
    expect(bindingsSource).toContain('from "./studio-bg3d-lt-preset-repository-loader"');
    expect(bindingsSource).not.toContain('from "./bg3d-model-library"');
    expect(bindingsSource).not.toContain('from "./bg3d-template-library"');
    expect(bindingsSource).not.toContain(
      "../scene-3d/studio-mannequin-bg3d-preset-sqlite-repository",
    );
    expect(modelLoaderImports.dynamicImports).toEqual(["./bg3d-model-library"]);
    expect(templateLoaderImports.dynamicImports).toEqual(["./bg3d-template-library"]);
    expect(presetLoaderImports.dynamicImports).toEqual([
      "../scene-3d/studio-mannequin-bg3d-preset-sqlite-repository",
    ]);
    expect(editorSource).toContain("if (!open || !modelsPanelActivated) return;");
    expect(editorSource).toContain("if (!open || !ltPresetPanelActivated) return;");
    expect(editorSource).toContain('if (tab === "models") setModelsPanelActivated(true)');
    expect(editorSource).toContain('if (tab === "lt") setLtPresetPanelActivated(true)');
  });

  it("projects bundled environments before OPFS and degrades only the local library on failure", () => {
    const editorSource = [
      moduleSource("./StudioBackground3D.tsx"),
      moduleSource("./useStudioBg3dEditorState.ts"),
      moduleSource("./useStudioBg3dEditorEffects.ts"),
    ].join("\n");
    const _editorImports = moduleImports("./studio-bg3d-editor-runtime-bindings.ts");
    const effectStart = editorSource.indexOf(
      "// 모델 라이브러리 목록은 모달이 열릴 때 한 번 읽어온다",
    );
    const effectEnd = editorSource.indexOf(
      "setTemplateLibraryStatus(\"loading\")",
      effectStart,
    );
    const modelLibraryEffect = editorSource.slice(effectStart, effectEnd);

    expect(moduleSource("./studio-bg3d-editor-runtime-bindings.ts")).toContain(
      'from "./studio-bg3d-bundled-environment-library"',
    );
    expect(moduleSource("./studio-bg3d-editor-runtime-bindings.ts")).not.toContain(
      'from "./bg3d-model-library"',
    );
    expect(editorSource).toContain(
      "useState<Bg3dModelLibraryEntry[]>(\n    copyStudioBg3dBundledEnvironmentLibraryEntries,",
    );
    expect(modelLibraryEffect).toContain(
      "setModelLibrary(copyStudioBg3dBundledEnvironmentLibraryEntries());",
    );
    expect(modelLibraryEffect).toContain('setModelLibraryStatus("degraded")');
    expect(modelLibraryEffect).not.toContain('setModelLibraryStatus("error")');
    expect(modelLibraryEffect.indexOf("copyStudioBg3dBundledEnvironmentLibraryEntries"))
      .toBeLessThan(modelLibraryEffect.indexOf("listBg3dModelLibraryEntries()"));
  });

  it("keeps the editor operation lifecycle active before the optional Models surface opens", () => {
    const editorSource = moduleSource("./useStudioBg3dEditorEffects.ts");
    const activeAssignment = editorSource.indexOf("componentActiveRef.current = true;");
    const lifecycleStart = editorSource.lastIndexOf("useEffect(() => {", activeAssignment);
    const lifecycleEnd = editorSource.indexOf("}, [", activeAssignment);
    const lifecycleSource = editorSource.slice(lifecycleStart, lifecycleEnd);

    expect(activeAssignment).toBeGreaterThanOrEqual(0);
    expect(lifecycleStart).toBeGreaterThanOrEqual(0);
    expect(lifecycleEnd).toBeGreaterThan(activeAssignment);
    expect(lifecycleSource).toContain("if (!open) return;");
    expect(lifecycleSource).not.toContain("modelsPanelActivated");
  });

  it("preserves the single analyzable lazy editor boundary", () => {
    const loaderImports = moduleImports("../studio-background-3d-loader.ts");

    expect(loaderImports.valueImports).not.toContain("./bg3d/StudioBackground3D");
    expect(loaderImports.dynamicImports).toEqual(["./bg3d/StudioBackground3D"]);
  });
});
