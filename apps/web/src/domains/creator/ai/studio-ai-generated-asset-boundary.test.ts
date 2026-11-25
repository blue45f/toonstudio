import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const fileUrl = new URL("../StudioCuttoonEditorHost.tsx", import.meta.url);
const source = readFileSync(fileUrl, "utf8");
const modalsSource = readFileSync(
  new URL("../canvas/StudioCanvasModalsBody.tsx", import.meta.url),
  "utf8",
);
const sourceFiles = [
  ts.createSourceFile(fileUrl.pathname, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX),
  ...[
    new URL("./studio-scenario-image-generation.ts", import.meta.url),
    new URL("../studio-cuttoon-edit/studio-image-ai-executors.ts", import.meta.url),
  ].map((url) =>
    ts.createSourceFile(url.pathname, readFileSync(url, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  ),
];

function functionSource(name: string): string {
  function find(node: ts.Node): ts.FunctionDeclaration | undefined {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) return node;
    return ts.forEachChild(node, find);
  }
  for (const file of sourceFiles) {
    const match = find(file);
    if (match) return match.getText(file);
  }
  throw new Error(`Missing function ${name}`);
}

function expectInOrder(value: string, fragments: readonly string[]): void {
  let cursor = -1;
  for (const fragment of fragments) {
    const next = value.indexOf(fragment, cursor + 1);
    expect(next, `Expected ${JSON.stringify(fragment)} after index ${cursor}`).toBeGreaterThan(cursor);
    cursor = next;
  }
}

function expectProvenanceBeforeFirstAwait(name: string): void {
  const value = functionSource(name);
  const captureIndex = value.indexOf("captureStudioAiGeneratedAssetProvenance");
  const firstAwaitIndex = value.indexOf("await ");
  expect(captureIndex, `${name} must capture request provenance`).toBeGreaterThanOrEqual(0);
  expect(firstAwaitIndex, `${name} must perform an asynchronous image request`).toBeGreaterThanOrEqual(0);
  expect(
    captureIndex,
    `${name} must capture provenance before its first await`,
  ).toBeLessThan(firstAwaitIndex);
}

describe("Studio AI generated asset fail-closed boundary", () => {
  it("discards the pending notice action before closing and wires the named cancel handler", () => {
    expectInOrder(functionSource("cancelAiNotice"), [
      "aiNoticePendingActionRef.current = null",
      "setAiNoticeOpen(false)",
    ]);
    expect(modalsSource).toContain("<AiAssetNotice onCancel={cancelAiNotice}");
    expect(modalsSource).toContain("cancelAiNotice: () => void;");
    expect(modalsSource).not.toContain("setAiNoticeOpen={setAiNoticeOpen}");
  });

  it("keeps asset generation BYOK-only and fails closed without an operator-paid fallback", () => {
    const value = functionSource("executeGenerateAsset");
    expectInOrder(value, [
      "if (!isStudioAiConfigured(aiSettings))",
      "setError(t(\"studio.hostStatus.apiKeyRequired\", \"설정에서 사용자 API 키를 등록한 뒤 다시 시도해 주세요.\"))",
      "return;",
      "const provider = studioImageAiProviderContext(aiSettings)",
      "captureStudioAiGeneratedAssetProvenance(provider, \"generated\")",
      "beginTrackedStudioAiOperation",
      "await generateBackgroundImage",
      "saveStudioAssetMutation",
      "addRenderedImage",
    ]);
    expect(value).not.toContain('import("@/platform/creator-client")');
    expect(value).not.toContain("await generateAsset");
    expect(value).not.toContain('transport: "server"');
  });

  it("loads image executors only after AI notice and rechecks the mutation ticket before use", () => {
    for (const name of ["onGenerateAiBackground", "requestColorize", "onGenerateAiCharacter"]) {
      expectInOrder(functionSource(name), ["runWithAiNotice", "runImageAiRequest"]);
    }
    expectInOrder(functionSource("runImageAiRequest"), [
      "captureStudioMutationTicket()",
      "setBusy(true)",
      "await import(",
      "canApplyStudioMutation(ticket)",
      "await execute(",
    ]);
    expect(source).not.toMatch(/^import [^{]*\{\s*createStudioImageAiExecutors\b/mu);
  });

  it("captures request provenance before image awaits and never derives it after completion", () => {
    for (const functionName of [
      "executeGenerateAsset",
      "executeAiBackgroundGenerate",
      "executeAiColorize",
      "executeAiCharacterConsistency",
      "executeGenerateScenarioImages",
      "executeRegenerateScenarioImage",
    ] as const) {
      expectProvenanceBeforeFirstAwait(functionName);
    }
    for (const file of sourceFiles) expect(file.text).not.toContain("currentImageAiProvenance");
  });

  it("fails closed before recording or paying for unresolved scenario references", () => {
    for (const functionName of [
      "executeGenerateScenarioImages",
      "executeRegenerateScenarioImage",
    ]) {
      const value = functionSource(functionName);
      expectInOrder(value, [
        "scenarioImageReferenceResolution.missing.length > 0",
        "return;",
        "beginTrackedStudioAiOperation",
        "await generateImageWithRoleReferences",
      ]);
      expect(value).toContain(
        "scenarioImageReferenceResolution.trackingAssetIds"
      );
      expect(value).toContain(
        "trackedReferenceAssetIds.map((assetId) => ({ assetId }))"
      );
    }
  });

  it("captures the character reference identity, source, and size before the notice gate", () => {
    expectInOrder(functionSource("onGenerateAiCharacter"), [
      "const reference = {",
      "elementId: selected.id",
      "src: selected.src",
      "width: selected.width",
      "height: selected.height",
      "runWithAiNotice",
    ]);
    expect(functionSource("executeAiCharacterConsistency")).toContain(
      "references: [{ assetId: reference.elementId }]"
    );
  });

  it("keeps prompts and menus open when a generated result cannot be committed", () => {
    expectInOrder(functionSource("executeGenerateAsset"), [
      "finalizeStudioAiGeneratedAssetProvenance(requestProvenance",
      "model: generated.model",
      "if (!addRenderedImage",
      "return;",
      "setAssetPrompt(\"\")",
      "setMenu(null)",
    ]);
    expectInOrder(functionSource("executeAiBackgroundGenerate"), [
      "if (!insertAiBackgroundImage",
      "setFailure",
      "return;",
      "setMenu(null)",
    ]);
    expectInOrder(functionSource("executeAiCharacterConsistency"), [
      "requestPageId !== currentPageIdRef.current",
      "return commitPages(",
      "addRenderedImage",
      "if (!addedOk)",
      "setFailure",
      "return;",
      "setMenu(null)",
    ]);
    expectInOrder(functionSource("executeAiColorize"), [
      "if (!patchImageElOnPage(requestPageId, elId",
      "setFailure",
      "return;",
    ]);
    expectInOrder(functionSource("patchImageElOnPage"), [
      "if (pageId === currentPageIdRef.current) return patchEl(elId, patch);",
      "rejectElementSourceReplacement(target, patch)",
      "return commitPages(",
    ]);
    expectInOrder(functionSource("rejectElementSourceReplacement"), [
      "studioWorkAssetSourceReplacementReason",
      "studioLinked3dPassSourceReplacementReason",
      "setError(reason)",
    ]);
  });

  it("requires a successful document commit before dismissing a scenario preview", () => {
    const applyScenario = functionSource("onApplyScenarioPreview");
    expect(applyScenario).toContain("if (!commitPages(populatedPages))");
    expect(applyScenario).toContain("if (!commit([...elements, ...newEls]");
    expectInOrder(applyScenario, [
      "if (!commit([...elements, ...newEls]",
      "return;",
      "setScenarioResult(null)",
      "setScenarioOpen(false)",
    ]);
  });
});
