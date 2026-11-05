import { existsSync, readFileSync } from "node:fs";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { hasValidStudioCrdtRootSchema as directRootValidator } from "../../../../../../apps/api/src/modules/creator/studio-crdt-root-schema";
import { StudioCrdtInvalidPayloadError, StudioCrdtStorageCorruptionError } from "../../../../../../apps/api/src/modules/creator/studio-crdt-service-contracts";
import { hasValidStudioCrdtRootSchema as compatibilityRootValidator, StudioCrdtInvalidPayloadError as compatibilityPayloadError, StudioCrdtStorageCorruptionError as compatibilityStorageError } from "../../../../../../apps/api/src/modules/creator/studio-crdt.service";

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
  const valueExports: string[] = [];

  function visit(node: ts.Node) {
    if (
      ts.isExportDeclaration(node) && !node.isTypeOnly && node.moduleSpecifier
      && ts.isStringLiteral(node.moduleSpecifier)
    ) valueExports.push(node.moduleSpecifier.text);
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
  return { dynamicImports, source, valueImports, valueExports };
}

describe("Studio CRDT root schema ownership boundary", () => {
  it("preserves the service's public validator export", () => {
    expect(compatibilityRootValidator).toBe(directRootValidator);
    expect(compatibilityPayloadError).toBe(StudioCrdtInvalidPayloadError);
    expect(compatibilityStorageError).toBe(StudioCrdtStorageCorruptionError);
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
      "./studio-crdt-bg3d-shape",
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

  it("순수 validator의 간접 import·재export에도 Nest·DB·서비스가 들어오지 않는다", () => {
    const pending = [new URL("../../../../../../apps/api/src/modules/creator/studio-crdt-root-schema.ts", import.meta.url)];
    const visited = new Set<string>();
    while (pending.length) {
      const url = pending.pop()!;
      if (visited.has(url.href)) continue;
      visited.add(url.href);
      const parsed = moduleImports(url.href);
      expect(parsed.dynamicImports, url.pathname).toEqual([]);
      expect(parsed.source, url.pathname).not.toMatch(/@Injectable|@Inject\(|\bLogger\b|\bOnModuleDestroy\b/u);
      for (const specifier of [...parsed.valueImports, ...parsed.valueExports]) {
        expect(specifier, url.pathname).not.toMatch(/@nestjs|(?:^|\/)(?:pg|postgres|drizzle-orm)(?:\/|$)|(?:service|repository)$|(?:^|\/)database(?:\/|$)|web\/src/u);
        if (specifier.startsWith(".") || specifier.startsWith("@toonstudio/contracts/")) {
          const dependency = specifier.startsWith(".") ? new URL(specifier, url)
            : new URL(`../../../../../../packages/contracts/src/${specifier.slice("@toonstudio/contracts/".length)}`, import.meta.url);
          const suffix = /\.[cm]?[jt]s$/u.test(dependency.pathname) ? "" : ".ts";
          const file = new URL(dependency.href.replace(/\.js$/u, ".ts") + suffix);
          expect(existsSync(file), `${url.pathname} → ${specifier}`).toBe(true);
          pending.push(file);
        } else expect(specifier, url.pathname).toMatch(/^(?:yjs|zod(?:\/.*)?|node:crypto)$/u);
      }
    }
    expect([...visited].some((url) => url.endsWith("/studio-crdt-bg3d-shape.ts"))).toBe(true);
    expect([...visited].some((url) => url.endsWith("/studio-crdt-r8-reference-snapshot.ts"))).toBe(true);
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

    const r8 = moduleImports("../../../../../../apps/api/src/modules/creator/studio-crdt-r8-reference-snapshot.ts");
    expect(schema).toContain('export { snapshotStudioCrdtR8GrainReferences, type StudioCrdtR8GrainReferenceSnapshot } from "./studio-crdt-r8-reference-snapshot"');
    expect(r8.source).toContain("export function snapshotStudioCrdtR8GrainReferences");
    expect(service).not.toContain("function snapshotStudioCrdtR8GrainReferences");
    expect(r8.valueImports).toEqual(["yjs", "@toonstudio/contracts/studio-brush-r8-grain-asset-contract", "./studio-crdt-identifiers"]);
    expect(r8.dynamicImports).toEqual([]);

    const contractModule = moduleImports("../../../../../../apps/api/src/modules/creator/studio-crdt-service-contracts.ts");
    expect(service).toContain('from "./studio-crdt-service-contracts"');
    for (const errorClass of ["class StudioCrdtInvalidPayloadError", "class StudioCrdtStorageCorruptionError"]) {
      expect(contractModule.source).toContain(errorClass);
      expect(schema).not.toContain(errorClass);
    }
    expect(contractModule.valueImports.some((specifier) => specifier.includes("web/src"))).toBe(false);
    expect(contractModule.dynamicImports).toEqual([]);

    for (const serviceResponsibility of [
      "class StudioCrdtService",
      "private async catchUpDocument",
      "private async maybeCompact",
      "private withWorkLock",
    ]) {
      expect(service).toContain(serviceResponsibility);
      expect(schema).not.toContain(serviceResponsibility);
    }
    const contracts = moduleImports("../../../../../../apps/api/src/modules/creator/studio-crdt-service-contracts.ts").source;
    for (const name of ["StudioCrdtInvalidPayloadError", "StudioCrdtStorageCorruptionError"]) {
      expect(contracts).toContain(`class ${name}`);
      expect(service).toContain(`throw new ${name}`);
      expect(service).not.toContain(`class ${name}`);
      expect(schema).not.toContain(`class ${name}`);
    }
    expect(service).toContain('export * from "./studio-crdt-service-contracts"');
  });
});
