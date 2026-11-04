// @vitest-environment jsdom

import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { parseStudioBg3dSixPassBundleManifest, parseStudioBg3dSixPassBundleState, STUDIO_BG3D_SIX_PASS_ROLES } from "@toonstudio/contracts/studio-bg3d-six-pass-bundle";
import { useStudioPageHistorySnapshots } from "./useStudioPageHistorySnapshots";

afterEach(cleanup);

describe("useStudioPageHistorySnapshots", () => {
  it("seeds the requested initial page sequence for a local project document", () => {
    const { result } = renderHook(() => useStudioPageHistorySnapshots({
      effectiveWorkId: "local-document",
      markStudioDocumentChanged: () => true,
      workId: null,
      initialCanvasHeight: 1350,
      initialPageCount: 8,
      initialPage: (_pageId, pageIndex) => ({
        canvasH: 1350,
        elements: [],
        name: `카드 ${pageIndex + 1}`,
      }),
    }));

    expect(result.current.pages).toHaveLength(8);
    expect(result.current.pages.map((page) => page.name)).toEqual([
      "카드 1",
      "카드 2",
      "카드 3",
      "카드 4",
      "카드 5",
      "카드 6",
      "카드 7",
      "카드 8",
    ]);
    expect(result.current.pages.every((page) => page.canvasH === 1350)).toBe(true);
  });

  it("keeps cloud work hydration single-page and clamps unsafe local counts", () => {
    const cloud = renderHook(() => useStudioPageHistorySnapshots({
      effectiveWorkId: "cloud-work",
      markStudioDocumentChanged: () => true,
      workId: "cloud-work",
      initialPageCount: 24,
    }));
    expect(cloud.result.current.pages).toHaveLength(1);
    cloud.unmount();

    const local = renderHook(() => useStudioPageHistorySnapshots({
      effectiveWorkId: "local-work",
      markStudioDocumentChanged: () => true,
      workId: null,
      initialPageCount: 5000,
    }));
    expect(local.result.current.pages).toHaveLength(200);
  });
  it("첫 native 6패스 push 뒤 undo·redo와 즉시 autosave ref가 같은 보존 원본을 사용한다", async () => {
    const { result } = renderHook(() => useStudioPageHistorySnapshots({ effectiveWorkId: "history-proof", markStudioDocumentChanged: () => true, workId: null }));
    const before = result.current.pages[0], digest = `sha256:${"a".repeat(64)}`;
    const artifact = { contentHash: digest, byteSize: 70, width: 1, height: 1, mimeType: "image/png" };
    const manifest = parseStudioBg3dSixPassBundleManifest({ contract: "toonstudio.bg3d-sixpass-bundle.v1", version: 1,
      minimumReaderCapability: "bg3d-sixpass-bundle.v1", minimumProjectVersion: 5, bundleId: "bundle-one", renderRevisionId: "revision-one", parentRevisionId: null,
      pageId: before.id, groupId: "group-one", anchorElementId: "el-main-line", width: 1, height: 1, cameraHash: digest, outputSettingsHash: digest,
      scene: { documentVersion: 4, contentHash: digest, byteSize: 90, mimeType: "application/json", activeShotId: null },
      layers: STUDIO_BG3D_SIX_PASS_ROLES.map((role) => ({ role, elementId: `el-${role}`, artifact, blendMode: "normal", opacity: 1, visible: true })) });
    const state = parseStudioBg3dSixPassBundleState({ contract: "toonstudio.bg3d-sixpass-bundles.v1", version: 1, minimumReaderCapability: "bg3d-sixpass-bundle.v1",
      minimumProjectVersion: 5, bundles: [{ bundleId: manifest.bundleId, activeRevisionId: manifest.renderRevisionId, revisions: [manifest] }] });
    const inserted = { ...before, bg3dLtBundles: state, elements: manifest.layers.map((layer) => ({ id: layer.elementId, type: "image" as const,
      src: `studio-opfs-cas:${digest}`, x: 0, y: 0, width: 1, height: 1, rotation: 0 })) };
    act(() => result.current.setPagesHistoryState([[before]]));
    const setter = result.current.setPagesHistoryState;
    act(() => {
      const next = [...result.current.pagesHistoryRef.current, [inserted]];
      result.current.pagesHistoryRef.current = next;
      result.current.setPagesHistoryState(next);
      expect(result.current.pagesHistoryRef.current[0][0].bg3dLtBundles?.bundles[0].activeRevisionId).toBeNull();
    });
    expect(result.current.setPagesHistoryState).toBe(setter);
    expect(result.current.pages[0].elements).toEqual([]);
    expect(result.current.pages[0].bg3dLtBundles?.bundles[0].revisions).toHaveLength(1);
    act(() => result.current.setPagesHiState(1));
    expect(result.current.pages[0].elements).toHaveLength(6);
    act(() => result.current.setPagesHiState(0));
    expect(result.current.pages[0].elements).toEqual([]);
    expect(result.current.pages[0].bg3dLtBundles?.bundles[0].activeRevisionId).toBeNull();
    act(() => result.current.setPagesHiState(1));
    expect(result.current.pages[0].bg3dLtBundles?.bundles[0].activeRevisionId).toBe(manifest.renderRevisionId);
    act(() => {
      const opened = [[before]];
      result.current.pagesHistoryRef.current = opened;
      result.current.setPagesHistoryState(opened);
      expect(result.current.pagesHistoryRef.current[0][0].bg3dLtBundles).toBeUndefined();
      result.current.setPagesHiState(0);
    });
    expect(result.current.pages[0].bg3dLtBundles).toBeUndefined();
  });
  it("일반 functional setter를 한 batch에 여러 번 호출해도 순서를 보존한다", () => {
    const { result } = renderHook(() => useStudioPageHistorySnapshots({ effectiveWorkId: "batch-proof", markStudioDocumentChanged: () => true, workId: null }));
    act(() => {
      result.current.setPagesHistoryState((history) => [...history, history[0]]);
      result.current.setPagesHistoryState((history) => [...history, history[0]]);
      expect(result.current.pagesHistoryRef.current).toHaveLength(3);
    });
    expect(result.current.pagesHistory).toHaveLength(3);
  });

});
