// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";

import { writeStudioExactResumeContext } from "../studio-exact-resume-context";
import { resolveStudioDocumentScopedInitialToolDecision } from "./studio-document-tool-isolation";

beforeEach(() => {
  window.localStorage.clear();
});

describe("resolveStudioDocumentScopedInitialToolDecision", () => {
  it("isolates brand-new canonical documents from a previous project's remembered select tool", () => {
    const decision = resolveStudioDocumentScopedInitialToolDecision({
      projectId: "project-new",
      documentId: "doc-new",
      focus: null,
      hasAutosave: false,
      hasElements: true,
      rememberedPrimaryTool: "select",
      requestedPrimaryTool: null,
      storage: window.localStorage,
    });

    expect(decision).toEqual({
      savedDocumentContext: null,
      rememberedPrimaryTool: null,
      requestedPrimaryTool: null,
      hasExistingContent: false,
    });
  });

  it("still honors an explicit requested launch tool on a brand-new canonical document", () => {
    const decision = resolveStudioDocumentScopedInitialToolDecision({
      projectId: "project-new",
      documentId: "doc-new",
      focus: null,
      hasAutosave: false,
      hasElements: false,
      rememberedPrimaryTool: "draw",
      requestedPrimaryTool: "select",
      storage: window.localStorage,
    });

    expect(decision.requestedPrimaryTool).toBe("select");
    expect(decision.rememberedPrimaryTool).toBeNull();
  });

  it("preserves an existing document's saved resume context over another project's remembered tool", () => {
    writeStudioExactResumeContext(window.localStorage, {
      projectId: "project-a",
      documentId: "doc-a",
      workspace: "comic",
      pageId: "page-2",
      selectedElementIds: ["layer-1"],
      tool: "draw",
      drawMode: "eraser",
    });

    const decision = resolveStudioDocumentScopedInitialToolDecision({
      projectId: "project-a",
      documentId: "doc-a",
      focus: null,
      hasAutosave: true,
      hasElements: true,
      rememberedPrimaryTool: "select",
      requestedPrimaryTool: "draw",
      storage: window.localStorage,
    });

    expect(decision.savedDocumentContext).toMatchObject({
      projectId: "project-a",
      documentId: "doc-a",
      tool: "draw",
      drawMode: "eraser",
    });
    expect(decision.rememberedPrimaryTool).toBeNull();
    expect(decision.requestedPrimaryTool).toBeNull();
    expect(decision.hasExistingContent).toBe(true);
  });
});
