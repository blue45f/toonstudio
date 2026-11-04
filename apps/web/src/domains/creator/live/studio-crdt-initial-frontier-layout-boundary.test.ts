import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { readStudioPageCompositionSource } from "../studio-cuttoon-editor/read-studio-cuttoon-editor-source";

const source = readStudioPageCompositionSource();
const binding = readFileSync(new URL("./studio-crdt-frontier-reconciliation-binding.ts", import.meta.url), "utf8");
describe("Studio 최초 CRDT frontier layout 경계", () => {
  it("기존 동기 projection은 첫 editable paint 이전 layout effect에서 실행한다", () => {
    const call = source.indexOf("return runtime.bindFrontierReconciliation({");
    expect(call).toBeGreaterThan(-1);
    expect(source.slice(call - 210, call)).toContain("useLayoutEffect(() => {");
    expect(binding).toContain("applyFrontier(offline.studioOfflineDocumentFrontier(input.document), null)");
    const plain = binding.indexOf("if (!frontier.pages.some");
    expect(binding.slice(plain, plain + 180)).toContain("applyResolved(frontier, changedIds, forceOfflineProjection); return;");
    expect(binding).toContain("input.setReconciled(input.document)");
  });
});
