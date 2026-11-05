import { readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { hasValidStudioCrdtRootSchema as directRootValidator } from "../../../../../../apps/api/src/modules/creator/studio-crdt-root-schema";
import { hasValidStudioCrdtRootSchema as compatibilityRootValidator } from "../../../../../../apps/api/src/modules/creator/studio-crdt.service";

function moduleImports(fileName: string) {
  const fileUrl = new URL(fileName, import.meta.url);
  const source = readFileSync(fileUrl, "utf8");
  const file = ts.createSourceFile(
    fileUrl.pathname,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const valueImports: string[] = [];
  const dynamicImports: string[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.importClause?.isTypeOnly
    ) {
      valueImports.push(node.moduleSpecifier.text);
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
  return { dynamicImports, source, valueImports };
}

describe("Studio CRDT root schema ownership boundary", () => {
  it("preserves the service's public validator export", () => {
    expect(compatibilityRootValidator).toBe(directRootValidator);
  });

  it("keeps validation pure and one-way from the service", () => {
    const schema = moduleImports("../../../../../../apps/api/src/modules/creator/studio-crdt-root-schema.ts");
    const service = moduleImports("../../../../../../apps/api/src/modules/creator/studio-crdt.service.ts");

    expect(service.valueImports).toContain("./studio-crdt-root-schema");
    expect(schema.valueImports).toEqual([
      "./studio-crdt-psd-metadata",
      "@toonstudio/contracts/studio-linked-3d-correction",
      "@toonstudio/contracts/studio-legacy-pigment-archive",
      "./studio-crdt-identifiers",
      "./studio-crdt-bg3d-bundle",
      "@toonstudio/contracts/studio-brush-material-program-contract",
      "yjs",
      "@toonstudio/contracts/studio-brush-r8-grain-asset-contract",
      "@toonstudio/contracts/studio-crdt-raster-document-contract",
      "@toonstudio/contracts/studio-filter-mask-surface-contract",
      "@toonstudio/contracts/studio-ink-input-contract",
      "@toonstudio/contracts/studio-work-asset-contract",
    ]);
    expect(schema.valueImports).not.toContain("./studio-crdt.service");
    expect(schema.valueImports).not.toContain("./studio-crdt.repository");
    expect(schema.valueImports.some((specifier) => specifier.includes("web/src"))).toBe(false);
    expect(schema.dynamicImports).toEqual([]);
    expect(schema.source).not.toMatch(/@Injectable|@Inject\(|\bLogger\b|\bOnModuleDestroy\b/u);
  });

  it("leaves hydration, queues, compaction, and errors in the service owner", () => {
    const schema = moduleImports("../../../../../../apps/api/src/modules/creator/studio-crdt-root-schema.ts").source;
    const service = moduleImports("../../../../../../apps/api/src/modules/creator/studio-crdt.service.ts").source;

    for (const declaration of [
      "function validateSceneElementRoot",
      "function validatePageRoot",
      "function validateLayerGroupRoot",
      "function validateStrokeRoot",
      "function validateStudioCrdtDeletionRoots",
      "function snapshotStudioWorkAssetReferences",
    ]) {
      expect(schema).toContain(declaration);
      expect(service).not.toContain(declaration);
    }

    const r8Snapshot = moduleImports("../../../../../../apps/api/src/modules/creator/studio-crdt-r8-reference-snapshot.ts");
    expect(schema).toContain('from "./studio-crdt-r8-reference-snapshot"');
    expect(r8Snapshot.source).toContain("export function snapshotStudioCrdtR8GrainReferences");
    expect(r8Snapshot.valueImports).toEqual([
      "yjs", "@toonstudio/contracts/studio-brush-r8-grain-asset-contract", "./studio-crdt-identifiers",
    ]);
    expect(r8Snapshot.dynamicImports).toEqual([]);
    expect(service).not.toContain("function snapshotStudioCrdtR8GrainReferences");

    const contracts = moduleImports("../../../../../../apps/api/src/modules/creator/studio-crdt-service-contracts.ts");
    expect(service).toContain('from "./studio-crdt-service-contracts"');
    for (const errorClass of ["class StudioCrdtInvalidPayloadError", "class StudioCrdtStorageCorruptionError"]) {
      expect(contracts.source).toContain(errorClass);
      expect(schema).not.toContain(errorClass);
    }
    expect(contracts.valueImports.some((specifier) => specifier.includes("web/src"))).toBe(false);
    expect(contracts.dynamicImports).toEqual([]);

    for (const serviceResponsibility of [
      "class StudioCrdtService",
      "private async catchUpDocument",
      "private async maybeCompact",
      "private withWorkLock",
    ]) {
      expect(service).toContain(serviceResponsibility);
      expect(schema).not.toContain(serviceResponsibility);
    }
  });
});
