import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const body = readFileSync(
  new URL("./StudioInspectorAsideBody.tsx", import.meta.url),
  "utf8",
);
const shell = readFileSync(
  new URL("./StudioInspectorAsideShell.tsx", import.meta.url),
  "utf8",
);
const selection = readFileSync(
  new URL("./StudioInspectorSelectionSection.tsx", import.meta.url),
  "utf8",
);

describe("Inspector text and balloon primary action", () => {
  it("puts content editing before geometry and the long property stack", () => {
    const primary = body.indexOf('data-studio-inspector-primary-text-edit="true"');
    const geometry = body.indexOf("<StudioFigmaDesignPanel");
    const selectionPanel = body.indexOf("<StudioInspectorSelectionSection");

    expect(primary).toBeGreaterThan(-1);
    expect(primary).toBeLessThan(geometry);
    expect(primary).toBeLessThan(selectionPanel);
    expect(body).toContain('data-inspector-priority="essential"');
    expect(body).toContain('data-inspector-control-id="element.edit-text"');
  });

  it("uses dialogue-first copy for balloons and keeps one execution owner", () => {
    expect(body).toContain('selected.type === "bubble" ? "대사 편집" : "글자 편집"');
    expect(body.match(/startEditText\(selected\.id\)/gu)).toHaveLength(1);
    expect(selection).not.toContain("startEditText");
  });
});

describe("Inspector 3D primary action", () => {
  it("mounts after navigation, before summary and details, with the single-selection edit gate", () => {
    const slot = shell.indexOf("<StudioInspectorSceneEditActions");
    expect(slot).toBeGreaterThan(shell.indexOf("<StudioInspectorNavigator"));
    expect(slot).toBeLessThan(shell.indexOf("<StudioEditTargetSummary"));
    expect(slot).toBeLessThan(shell.indexOf("{children}"));
    expect(shell.slice(slot)).toMatch(
      /active=\{\s*inspectorLayout.primary === "properties"\s*&& inspectorContentMode === "selection"\s*&& marqueeIds.length <= 1\s*\}/u,
    );
    expect(shell).toContain("gate={inspectorInteractionPolicy.selection}");
    expect(selection).not.toContain("<StudioInspectorSceneEditActions");
  });
});
