import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  loadStudioPsdExportModule,
  loadStudioWillExportModule,
  loadStudioPsdImportModule,
  loadStudioSvgExportModule,
} from "./studio-document-export-loaders";

describe("studio document export loaders", () => {
  it("coalesces concurrent SVG engine requests into one analyzable module promise", async () => {
    const first = loadStudioSvgExportModule();
    const second = loadStudioSvgExportModule();

    expect(second).toBe(first);
    await expect(first).resolves.toMatchObject({
      SVG_EXPORT_MIME: "image/svg+xml;charset=utf-8",
      exportPageToSvg: expect.any(Function),
      svgExportFileName: expect.any(Function),
    });
  });

  it("coalesces concurrent PSD export engine requests", async () => {
    const first = loadStudioPsdExportModule();
    const second = loadStudioPsdExportModule();

    expect(second).toBe(first);
    await expect(first).resolves.toMatchObject({
      exportPagePsd: expect.any(Function),
      psdExportFileName: expect.any(Function),
    });
  });

  it("coalesces concurrent PSD import engine requests independently from export", async () => {
    const first = loadStudioPsdImportModule();
    const second = loadStudioPsdImportModule();

    expect(second).toBe(first);
    await expect(first).resolves.toMatchObject({
      importPsdFile: expect.any(Function),
      psdImportResultMessage: expect.any(Function),
    });
  });
});


it("loads WILL preparation only on demand and coalesces concurrent requests", async () => {
  const first = loadStudioWillExportModule();
  expect(loadStudioWillExportModule()).toBe(first);
  await expect(first).resolves.toMatchObject({ exportStudioPageToWillV1: expect.any(Function) });
});


it("keeps WILL host snapshot and export admission ahead of the optional loader", () => {
  const source = readFileSync("apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx", "utf8");
  expect(source).not.toContain('import { exportStudioPageToWillV1 }');
  const handler = source.slice(source.indexOf("  async function exportCurrentPageToWillV1()"),
    source.indexOf("  async function exportCurrentPageToPsd()"));
  expect(handler.indexOf("ensureSharedDocumentAvailableForExport")).toBeLessThan(handler.indexOf("await loadStudioWillExportModule()"));
  expect(handler.indexOf("const snapshot =")).toBeLessThan(handler.indexOf("await loadStudioWillExportModule()"));
  expect(handler).toContain("return exportStudioPageToWillV1(snapshot)");
});
