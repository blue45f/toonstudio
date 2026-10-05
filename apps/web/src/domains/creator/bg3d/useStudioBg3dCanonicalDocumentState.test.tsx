// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { BgPrimitive } from "../studio-background-3d-primitives";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";
import { useStudioBg3dCanonicalDocumentState } from "./useStudioBg3dCanonicalDocumentState";

function primitive(id: string): BgPrimitive {
  return {
    id,
    kind: "box",
    name: id,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    color: "#ffffff",
    visible: true,
    locked: false,
    parentId: null,
  };
}

describe("useStudioBg3dCanonicalDocumentState", () => {
  it("publishes one synchronous revision for an atomic scene replacement", () => {
    const { result } = renderHook(() => useStudioBg3dCanonicalDocumentState({
      initialDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    }));
    const nextDocument = {
      ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
      background: {
        ...DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT.background,
        color: "#123456",
      },
    };

    act(() => {
      result.current.replaceCanonicalDocumentState({
        primitives: [primitive("cube")],
        customModels: [],
        document: nextDocument,
      });
    });

    expect(result.current.canonicalRevision).toBe(1);
    expect(result.current.liveSceneRef.current).toMatchObject({
      revision: 1,
      primitives: [{ id: "cube" }],
      customModels: [],
      document: { background: { color: "#123456" } },
    });
    expect(result.current.primitives[0]?.id).toBe("cube");
    expect(result.current.sceneBaseDocument.background.color).toBe("#123456");
  });

  it("keeps transient no-op setter calls outside canonical history", () => {
    const { result } = renderHook(() => useStudioBg3dCanonicalDocumentState({
      initialDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    }));
    act(() => {
      result.current.setPrimitives((current) => current);
      result.current.setCustomModels((current) => current);
      result.current.setSceneBaseDocument((current) => current);
    });
    expect(result.current.canonicalRevision).toBe(0);
    expect(result.current.liveSceneRef.current.revision).toBe(0);
  });

  it("serializes consecutive functional updates against the live revision fence", () => {
    const { result } = renderHook(() => useStudioBg3dCanonicalDocumentState({
      initialDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    }));
    act(() => {
      result.current.setPrimitives((current) => [...current, primitive("a")]);
      result.current.setPrimitives((current) => [...current, primitive("b")]);
    });
    expect(result.current.liveSceneRef.current.primitives.map(({ id }) => id)).toEqual([
      "a",
      "b",
    ]);
    expect(result.current.canonicalRevision).toBe(2);
  });

  it("syncs a linked clone's appearance from its root on every commit", () => {
    const { result } = renderHook(() => useStudioBg3dCanonicalDocumentState({
      initialDocument: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    }));
    const root = { ...primitive("root"), color: "#ff0000" };
    const clone = { ...primitive("clone"), color: "#00ff00", linkedSourceId: "root" };
    act(() => {
      result.current.replaceCanonicalDocumentState({ primitives: [root, clone] });
    });
    // The clone was born stale on purpose: the fence syncs it to the root immediately.
    expect(result.current.liveSceneRef.current.primitives[1]?.color).toBe("#ff0000");

    act(() => {
      result.current.replaceCanonicalDocumentState({
        primitives: [{ ...root, color: "#0000ff" }, clone],
      });
    });
    expect(result.current.liveSceneRef.current.primitives[1]?.color).toBe("#0000ff");
    // The clone keeps its own transform and link.
    expect(result.current.liveSceneRef.current.primitives[1]?.linkedSourceId).toBe("root");
  });
});
