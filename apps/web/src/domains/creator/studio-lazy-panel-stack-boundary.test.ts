import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

interface ModuleEdges {
  readonly allImports: readonly string[];
  readonly dynamicImports: readonly string[];
  readonly source: string;
  readonly syntax: ts.SourceFile;
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
    ts.ScriptKind.TSX
  );
  const allImports: string[] = [];
  const dynamicImports: string[] = [];
  const valueImports: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      allImports.push(node.moduleSpecifier.text);
      const clause = node.importClause;
      const namedBindings = clause?.namedBindings;
      const hasRuntimeValue = !clause || (
        !clause.isTypeOnly
        && (
          Boolean(clause.name)
          || Boolean(namedBindings && ts.isNamespaceImport(namedBindings))
          || Boolean(
            namedBindings
            && ts.isNamedImports(namedBindings)
            && namedBindings.elements.some((specifier) => !specifier.isTypeOnly)
          )
        )
      );
      if (hasRuntimeValue) valueImports.push(node.moduleSpecifier.text);
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
  return { allImports, dynamicImports, source, syntax: file, valueImports };
}

function callbackSource(module: ModuleEdges, name: string): string {
  const declarations: ts.VariableDeclaration[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name) declarations.push(node);
    ts.forEachChild(node, visit);
  };
  visit(module.syntax);
  const initializer = declarations[0]?.initializer;
  if (declarations.length !== 1 || !initializer || !ts.isCallExpression(initializer)
    || !ts.isIdentifier(initializer.expression) || initializer.expression.text !== "useCallback") {
    throw new Error(`${name}: 실제 useCallback 선언이 하나 필요합니다.`);
  }
  const callback = initializer.arguments[0];
  if (!callback || !ts.isArrowFunction(callback)) throw new Error(`${name}: 실제 검증 콜백이 없습니다.`);
  return callback.getText(module.syntax);
}

const STACK_OPTIONAL_MODULES = [
  "./ai/StudioAiProvenancePanel",
  "./StudioAutoActionsPanel",
  "./bg3d/StudioBackground3D",
  "./StudioCharacterBiblePanel",
  "./StudioCheckpointPanel",
  "./StudioColorWheelOverlay",
  "./StudioCommentsPanelSession",
  "./StudioContinuityPanel",
  "./StudioPageReviewPanel",
  "./StudioProductionInsightsPanel",
  "./StudioPublicationOperationsPanel",
  "./StudioPublishPackagePanel",
  "./StudioPublishPreflightPanel",
  "./StudioQuickActionsMenu",
  "./StudioReferencePanel",
  "./StudioScenarioAutoLayoutPanel",
  "./StudioScrollPreviewPanel",
  "./StudioStoryboardGridPanel",
  "./StudioTeamPanel",
  "./StudioTimelapsePanel",
  "./vrm/StudioVrmPoser",
  "./scene3d/StudioTeamVrmCutEditorGate",
  "./StudioWriterRoomPanel",
  "./WorkFxPanel",
] as const;

describe("Studio lazy panel stack boundary", () => {
  it("keeps one-way static ownership from StudioPage", () => {
    const page = moduleEdges("./StudioCuttoonEditorHost.tsx");
    const editorView = moduleEdges("./studio-cuttoon-editor/StudioCuttoonEditorPanels.tsx");
    const stack = moduleEdges("./StudioLazyPanelStack.tsx");
    const previewStack = moduleEdges("./StudioThreeDPreviewPanelStack.tsx");

    expect(
      editorView.valueImports.filter((specifier) => specifier === "../StudioLazyPanelStack")
    ).toEqual(["../StudioLazyPanelStack"]);
    expect(editorView.source.match(/<StudioLazyPanelStack\b/g)).toHaveLength(1);
    expect(page.source).not.toContain("interface StudioLazyPanelStackProps");
    expect(page.source).not.toContain("interface StudioLazyPanelStackHandlers");
    expect(stack.allImports).not.toContain("./StudioPage");
    expect(stack.dynamicImports).toEqual([]);
    expect(stack.source).not.toContain('"use no memo"');
    expect(stack.source).toContain("export interface StudioLazyPanelStackHandlers");
    expect(stack.source).toContain("export interface StudioLazyPanelStackProps");
    expect(stack.source).toContain("export const StudioLazyPanelStack = memo(");
    expect(
      stack.valueImports.filter(
        (specifier) => specifier === "./StudioThreeDPreviewPanelStack"
      )
    ).toEqual(["./StudioThreeDPreviewPanelStack"]);
    expect(previewStack.allImports).toContain("./StudioLazyPanelStack");
    expect(previewStack.valueImports).not.toContain("./StudioLazyPanelStack");
    expect(previewStack.dynamicImports).toEqual([]);
    expect(previewStack.source).not.toContain('"use no memo"');
    expect(previewStack.source).toContain(
      "export type StudioThreeDPreviewPanelStackProps = Pick<"
    );
    expect(previewStack.source).toContain(
      "export type StudioScrollScenarioPreviewPanelStackProps = Pick<"
    );
    expect(previewStack.source).toContain(
      "export const StudioThreeDPreviewPanelStack = memo("
    );
    expect(previewStack.source).toContain(
      "export const StudioScrollScenarioPreviewPanelStack = memo("
    );

    for (const specifier of [...stack.valueImports, ...previewStack.valueImports]) {
      expect(specifier).not.toMatch(/^(?:konva|react-konva|three)(?:\/|$)/);
    }
  });

  it("uses the neutral lazy registry instead of importing optional panel implementations", () => {
    const stack = moduleEdges("./StudioLazyPanelStack.tsx");
    const previewStack = moduleEdges("./StudioThreeDPreviewPanelStack.tsx");
    const commentsSession = moduleEdges("./StudioCommentsPanelSession.tsx");
    const registry = moduleEdges("./studio-page-lazy-ui.ts");
    const background3dLoader = moduleEdges("./studio-background-3d-loader.ts");

    expect(stack.valueImports).toContain("./studio-page-lazy-ui");
    expect(previewStack.valueImports).toContain("./studio-page-lazy-ui");
    for (const optionalModule of STACK_OPTIONAL_MODULES) {
      expect(stack.valueImports, `${optionalModule} must not be eager`).not.toContain(optionalModule);
      expect(stack.dynamicImports, `${optionalModule} must not bypass the registry`).not.toContain(optionalModule);
      expect(previewStack.valueImports, `${optionalModule} must not be eager`).not.toContain(optionalModule);
      expect(previewStack.dynamicImports, `${optionalModule} must not bypass the registry`).not.toContain(optionalModule);
      expect(registry.valueImports, `${optionalModule} must remain optional`).not.toContain(optionalModule);
      if (optionalModule === "./bg3d/StudioBackground3D") {
        expect(registry.valueImports).toContain("./studio-background-3d-loader");
        expect(
          background3dLoader.dynamicImports.filter((specifier) => specifier === optionalModule)
        ).toEqual([optionalModule]);
      } else {
        expect(
          registry.dynamicImports.filter((specifier) => specifier === optionalModule),
          `${optionalModule} must have exactly one registry loader`
        ).toEqual([optionalModule]);
      }
    }
    expect(stack.valueImports).not.toContain("./vrm/StudioVrmPoser");
    expect(commentsSession.valueImports).toContain("./StudioCommentsPanel");
    expect(commentsSession.dynamicImports).toEqual([]);
    expect(commentsSession.valueImports).not.toContain("./studio-page-lazy-ui");
    expect(commentsSession.allImports).toContain("./StudioLazyPanelStack");
    expect(commentsSession.valueImports).not.toContain("./StudioLazyPanelStack");
  });

  it("preserves semantic 3D transactions and initial-scene cleanup", () => {
    const page = moduleEdges("./StudioCuttoonEditorHost.tsx").source;
    const editorView = moduleEdges("./studio-cuttoon-editor/StudioCuttoonEditorPanels.tsx").source;
    const stack = moduleEdges("./StudioLazyPanelStack.tsx").source;
    const previewStack = moduleEdges("./StudioThreeDPreviewPanelStack.tsx").source;
    const stackUseStart = editorView.indexOf("<StudioLazyPanelStack");
    const stackUseEnd = editorView.indexOf("/>", stackUseStart);
    const stackUse = editorView.slice(stackUseStart, stackUseEnd);

    expect(stackUseStart).toBeGreaterThan(-1);
    expect(stackUseEnd).toBeGreaterThan(stackUseStart);
    expect(page).toContain(
      "const studioLazyPanelStackHandlers = useStudioStableHandlers<StudioLazyPanelStackHandlers>({"
    );
    expect(page).toContain(
      "const studioCommentSharedReplyHandlers = useStudioStableHandlers<Pick<"
    );
    expect(page).toContain("const studioCommentSharedReplyController = useMemo<");
    expect(editorView).toContain("stableHandlers={studioLazyPanelStackHandlers}");
    expect(page).toContain("setCurrentPageId,");
    expect(stackUse).not.toContain("setCurrentPageId={setCurrentPageId}");
    expect(page).toContain("insertVrmResult: (result) => applyStudioVrmInsertResult({");
    expect(page).toContain("insertBg3dResult: (result) => {");
    expect(page).toContain("return applyStudioBg3dInsertResult({");
    expect(stack).toContain("capture: StudioBg3dAiMethodReferenceCapture");
    expect(stack).toContain("<StudioThreeDPreviewPanelStack");
    expect(stack).toContain("validateRecoveryAccess={validateRecoveryAccess}");
    expect(stack).toContain("<StudioScrollScenarioPreviewPanelStack");
    expect(previewStack).toContain('| "useBg3dFrameAsAiMethodReference"');
    expect(previewStack).toContain("onInsert={insertVrmResult}");
    expect(previewStack).toContain("onInsert={insertBg3dResult}");
    expect(previewStack).toContain(
      "onUseAsAiMethodReference={useBg3dFrameAsAiMethodReference}"
    );
    expect(previewStack).toContain("validateRecoveryAccess={validateRecoveryAccess}");
    expect(previewStack).toContain("initialScene={poserInitialScene}");
    expect(previewStack).toContain("setPoserInitialElementId(undefined)");
    expect(previewStack).toContain("setBg3dInitialElementId(undefined)");
    expect(previewStack).not.toContain("applyStudioVrmInsertResult");
    expect(previewStack).not.toContain("applyStudioBg3dInsertResult");
  });

  it("keeps durable BG3D recovery behind current server access and persisted target proof", () => {
    const pageModule = moduleEdges("./StudioCuttoonEditorHost.tsx");
    const page = pageModule.source;
    const contracts = moduleEdges("./studio-page-editor-runtime-contracts.ts").source;
    const accessGate = moduleEdges("./bg3d/studio-bg3d-recovery-access-lease.ts").source;
    const helperStart = contracts.indexOf("function hasStudioBg3dServerPersistedTarget(");
    const helperEnd = contracts.indexOf("function isStudioBg3dRecoveryScopeLocallyCurrent(", helperStart);
    const helper = contracts.slice(helperStart, helperEnd);
    const validator = callbackSource(pageModule, "validateRecoveryAccess");

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);
    expect(helper).toContain("creatorWorkSnapshotToStudioProject(document)");
    expect(helper).toContain(
      "matchingPageCount === 1 && matchingElementCount === 1 && matchingImageCount === 1"
    );
    expect(page).toContain("sharedDocument?.document ?? null");
    expect(page).toContain("bg3dServerPersistedTargetExists");
    expect(page).toContain("authorizedWorkAssetScopeId === workId");
    expect(page).toContain('durability: "memory"');
    expect(contracts).toContain("scope !== snapshot.recoveryScope");
    expect(page).toContain("sharedDocument?.revision,");
    expect(validator).toContain("isStudioBg3dRecoveryScopeLocallyCurrent(scope, before)");
    expect(validator).toContain("getStudioSharedDocumentMeta(scope.workId, signal)");
    expect(validator).toContain("bg3dRecoveryAccessGateRef.current.authorize({");
    expect(validator).toContain("isStudioBg3dRecoveryScopeLocallyCurrent(scope, current)");
    expect(validator).toContain("current.sharedDocumentRevision === expectedRevision");
    expect(validator).toContain(
      "studioRevisionProjectGenerationRef.current !== projectGeneration"
    );
    expect(validator).toContain("fresh.revision === expectedRevision");
    expect(validator).toContain("return false;");
    expect(accessGate).toContain("catch {");
    expect(accessGate).toContain("return false;");
  });

  it("keeps all seven modal loading overlays colocated with their Suspense owners", () => {
    const stack = moduleEdges("./StudioThreeDPreviewPanelStack.tsx").source;
    const retained = moduleEdges("./bg3d/StudioBg3dRetainedOwnerHost.tsx");
    const retainedBg3dHost = retained.source;
    const contracts = [
      ["PoserLoadingOverlay", "포저를 여는 중"],
      ["MannequinLoadingOverlay", "3D 데생 인형을 여는 중"],
      ["TimelapseLoadingOverlay", "타임랩스 도구를 여는 중"],
      ["StoryboardGridLoadingOverlay", "스토리보드 그리드를 여는 중"],
      ["ScrollPreviewLoadingOverlay", "스크롤 미리보기를 여는 중"],
      ["ScenarioAutoLayoutLoadingOverlay", "시나리오 자동 생성 도구를 여는 중"],
    ] as const;

    for (const [name, label] of contracts) {
      expect(stack).toContain(`function ${name}()`);
      expect(stack).toContain(label);
      expect(stack).toContain(`<Suspense fallback={<${name} />}>`);
    }
    const overlay = retained.syntax.statements.find((node): node is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(node) && node.name?.text === "Bg3DRetainedLoadingOverlay");
    const returned = overlay?.body?.statements.find(ts.isReturnStatement)?.expression;
    const root = returned && ts.isParenthesizedExpression(returned) ? returned.expression : returned;
    if (!root || !ts.isJsxElement(root)) throw new Error("BG3D loading overlay의 실제 JSX 반환이 없습니다.");
    const attributes = Object.fromEntries(root.openingElement.attributes.properties
      .filter(ts.isJsxAttribute)
      .map(attribute => [attribute.name.getText(retained.syntax),
        attribute.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : null]));
    expect(retainedBg3dHost).toContain("장면 도우미를 여는 중");
    expect(retainedBg3dHost).toContain(
      "<Suspense fallback={lease.logicalOpen ? <Bg3DRetainedLoadingOverlay /> : null}>",
    );
    expect(`${stack}\n${retainedBg3dHost}`.match(/aria-live="polite"/g)).toHaveLength(7);
    expect(stack.match(/<Loader2\b/g)).toHaveLength(6);
    // BG3D는 단계별 준비 안내와 장면 아이콘으로 로딩을 표시한다.
    expect(attributes).toMatchObject({ role: "status", "aria-live": "polite", "aria-busy": "true" });
    expect(retainedBg3dHost.match(/<Boxes\b/g)).toHaveLength(1);
  });

  it("guards optional surfaces with their existing open or mounted flags", () => {
    const rootStack = moduleEdges("./StudioLazyPanelStack.tsx").source;
    const previewStack = moduleEdges("./StudioThreeDPreviewPanelStack.tsx").source;
    const commentsSession = moduleEdges("./StudioCommentsPanelSession.tsx").source;
    const stack = `${rootStack}\n${previewStack}`;

    for (const condition of [
      "poserVrmOpen ? (",
      "bg3dOpen ? (",
      "timelapseOpen ? (",
      "storyboardGridOpen ? (",
      "pageReviewOpen ? (",
      "commentsPanelMounted ? (",
      "teamPanelOpen ? (",
      "continuityOpen ? (",
      "scrollPreviewOpen ? (",
      "scenarioOpen ? (",
      "publicationOperationsOpen ? (",
      "publishPackageOpen && publishPackagePlan ? (",
      "aiProvenanceOpen ? (",
      "writerRoomOpen ? (",
      "characterBibleOpen ? (",
      "autoActionsOpen ? (",
      "checkpointPanelOpen ? (",
      "referencePanelOpen ? (",
      "colorWheelOpen ? (",
    ] as const) {
      expect(stack).toContain(condition);
    }
    expect(rootStack).toContain("<StudioCommentsPanelSession");
    expect(commentsSession).toContain("<StudioCommentsPanel");
    expect(commentsSession).toContain("open={commentsOpen}");
    expect(commentsSession).not.toContain("commentsOpen ? (");
    expect(commentsSession).not.toContain("key={commentsOpen}");
  });

  it("keeps the split at the original DOM seam with stable Pick-based contracts", () => {
    const stack = moduleEdges("./StudioLazyPanelStack.tsx").source;
    const previewStack = moduleEdges("./StudioThreeDPreviewPanelStack.tsx").source;
    const commentsSession = moduleEdges("./StudioCommentsPanelSession.tsx").source;
    const firstPreview = stack.indexOf("<StudioThreeDPreviewPanelStack");
    const comments = stack.indexOf("commentsPanelMounted ? (");
    const continuity = stack.indexOf("continuityOpen ? (");
    const secondPreview = stack.indexOf("<StudioScrollScenarioPreviewPanelStack");

    expect(firstPreview).toBeGreaterThan(-1);
    expect(comments).toBeGreaterThan(firstPreview);
    expect(continuity).toBeGreaterThan(comments);
    expect(secondPreview).toBeGreaterThan(continuity);
    expect(previewStack).toContain("type StudioThreeDPreviewPanelStackHandlers = Pick<");
    expect(previewStack).toContain("type StudioScrollScenarioPreviewPanelStackHandlers = Pick<");
    expect(commentsSession).toContain("type StudioCommentsPanelSessionHandlers = Pick<");
    expect(commentsSession).toContain("export type StudioCommentsPanelSessionProps = Pick<");
    expect(previewStack.match(/stableHandlers: Studio\w+Handlers;/g)).toHaveLength(2);
    expect(commentsSession).toContain("stableHandlers: StudioCommentsPanelSessionHandlers;");
    expect(stack.match(/stableHandlers=\{stableHandlers\}/g)).toHaveLength(3);
  });
});
