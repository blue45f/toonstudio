import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * D4 GLB 텍스처 페인트 호스트 마운트 계약 (2026-10-22 후속) —
 * 패널·컨트롤러·SceneNodes 계약은 완성돼 있었지만 호스트 핸들러와 사이드바
 * 마운트가 없어 소비처가 끊겨 있었다. 이 테스트는 그 배선이 사라지면 실패한다.
 */
const EDITOR = "apps/web/src/domains/creator/bg3d/useStudioBg3dEditor.ts";
const HOOK = "apps/web/src/domains/creator/bg3d/useStudioBg3dGlbTexturePaintHost.ts";
const MOUNT = "apps/web/src/domains/creator/bg3d/StudioBg3dGlbTexturePaintMount.tsx";
const SIDEBAR = "apps/web/src/domains/creator/bg3d/StudioBg3dEditorSidebar.tsx";
const SCENE_GRAPH = "apps/web/src/domains/creator/bg3d/StudioBg3dEditorSceneGraph.tsx";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("bg3d glb texture paint host mount", () => {
  it("editor hook composes the paint host and exposes the SceneGraph handler", () => {
    const editor = read(EDITOR);
    expect(editor).toContain("useStudioBg3dGlbTexturePaintHost({");
    expect(editor).toContain("instance: h.selectedCustomModel ?? null");
    expect(editor).toContain(
      "h.handleModelTexturePaintPointer = glbTexturePaint.handleModelTexturePaintPointer",
    );
    expect(editor).toContain("h.glbTexturePaint = glbTexturePaint");
    const graph = read(SCENE_GRAPH);
    expect(graph).toContain('typeof h.handleModelTexturePaintPointer === "function"');
  });

  it("handler exists only while paint mode is on and the model is paintable", () => {
    const hook = read(HOOK);
    expect(hook).toContain(
      'paintActive && input.instance && paintability?.status === "paintable"',
    );
    expect(hook).toContain(": undefined;");
    // 확정 획은 세션 콜백으로 정본 상태(setCustomModels)에만 들어간다.
    expect(hook).toContain("new StudioBg3dGlbTexturePaintSession({");
    expect(hook).toContain("appendStudioBg3dGlbPaintStroke(");
    // 페인트 가능 판정은 저장 레코드의 실제 GLB 바이트가 근거다.
    expect(hook).toContain("getStoredBg3dModel(modelId)");
    expect(hook).toContain("analyzeStudioBg3dGlbPaintabilityFromBytes(bytes)");
  });

  it("sidebar mounts the paint panel for the selected model on the models tab", () => {
    const sidebar = read(SIDEBAR);
    expect(sidebar).toContain("<StudioBg3dGlbTexturePaintMount h={h} />");
    const mount = read(MOUNT);
    expect(mount).toContain("StudioBg3dGlbTexturePaintPanel");
    expect(mount).toContain("paintability={paint.paintability}");
    expect(mount).toContain("onPaintChange={paint.onPaintChange}");
    expect(mount).toContain('h.hideOnTab("models")');
    expect(mount).toContain("if (!paint?.instance) return null;");
  });
});
