/**
 * 선택 가능 씬 오버레이 호스트 (제로 의존성 네이티브 Canvas 2D 지연 로드).
 *
 * Konva 스테이지 위에 전용 투명·포인터 비활성(`<canvas style="pointer-events:none">`)
 * 선택 오버레이를 올린다. 기존 `pixi.js`(76.68 MiB) 의존을 제거하고
 * `studio-native-scene-overlay-provider`를 선택 항목이 실제로 존재할 때만 동적 로드한다.
 *
 * 표면 경제 규칙(docs/perf/canvas-findings.md §7-1):
 *   1. 선택 오버레이가 1개 이상 있을 때만 표면을 생성한다.
 *   2. 스테이지 크기·줌 변화는 살아 있는 표면을 리사이즈하며 재생성하지 않는다.
 */

import { useEffect, useMemo, useRef } from "react";

import {
  buildStudioPixiSelectableOverlaysForSelection,
  planStudioPixiOverlaySync,
  studioPixiSceneHostIsAlwaysOn,
  type StudioPixiHostElementLike,
} from "./render/studio-pixi-scene-host-admission";

import type { StudioNativeSceneOverlayProvider } from "./render/studio-native-scene-overlay-provider";
import type {
  StudioSceneDocumentTransform,
  StudioSceneSelectableOverlay,
} from "./studio-scene-provider";

export interface StudioPixiSceneOverlayHostProps {
  readonly enabled?: boolean;
  /** Stage host that already has `position: relative` (e.g. Konva stage wrap). */
  readonly mountParent: HTMLElement | null;
  readonly width: number;
  readonly height: number;
  readonly dpr?: number;
  readonly elements: readonly StudioPixiHostElementLike[];
  readonly selectedIds: readonly string[];
  /**
   * Document → surface placement, mirroring the Konva stage. Overlay geometry is authored in
   * document units, so without this the chrome only lands correctly at 100% zoom.
   */
  readonly documentTransform?: StudioSceneDocumentTransform;
  /** Page box; a selection that covers it is a tool composite, not artist-authored chrome. */
  readonly documentWidth?: number;
  readonly documentHeight?: number;
}

export function StudioPixiSceneOverlayHost({
  enabled = studioPixiSceneHostIsAlwaysOn(),
  mountParent,
  width,
  height,
  dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  elements,
  selectedIds,
  documentTransform,
  documentWidth,
  documentHeight,
}: StudioPixiSceneOverlayHostProps) {
  const providerRef = useRef<StudioNativeSceneOverlayProvider | null>(null);
  const trackedIdsRef = useRef<string[]>([]);
  const generationRef = useRef(0);

  const overlays = useMemo(
    () =>
      buildStudioPixiSelectableOverlaysForSelection(elements, selectedIds, {
        documentWidth,
        documentHeight,
      }),
    [elements, selectedIds, documentWidth, documentHeight],
  );
  /** Nothing selected means nothing is drawn; the surface is pure cost. */
  const presentable = overlays.length > 0;

  // Geometry is read through refs inside the lifecycle effect so a stage resize
  // never re-runs it. Resizing is the separate effect below.
  const geometryRef = useRef({ width, height, dpr, documentTransform });
  geometryRef.current = { width, height, dpr, documentTransform };
  const overlaysRef = useRef<readonly StudioSceneSelectableOverlay[]>(overlays);
  overlaysRef.current = overlays;

  // Create / destroy provider for the presentable lifecycle.
  useEffect(() => {
    if (!enabled || !mountParent || !presentable) return;
    const initial = geometryRef.current;
    if (initial.width <= 0 || initial.height <= 0) return;

    let cancelled = false;
    const generation = generationRef.current + 1;
    generationRef.current = generation;

    void (async () => {
      try {
        const { createStudioNativeSceneOverlayProvider } = await import(
          "./render/studio-native-scene-overlay-provider"
        );
        const provider = await createStudioNativeSceneOverlayProvider({
          width: initial.width,
          height: initial.height,
          dpr: Math.max(1, Math.min(3, initial.dpr)),
          ...(initial.documentTransform
            ? { documentTransform: initial.documentTransform }
            : {}),
          ownerDocument: mountParent.ownerDocument,
        });
        if (cancelled || generation !== generationRef.current) {
          provider.destroy();
          return;
        }
        const canvas = provider.canvas;
        canvas.style.zIndex = "18";
        mountParent.appendChild(canvas);
        providerRef.current = provider;
        // Creation is async, so the selection that asked for this surface has
        // already been through the sync effect below. Seed it here or the first
        // selection after a cold start would present an empty overlay.
        const current = geometryRef.current;
        if (
          current.width !== initial.width
          || current.height !== initial.height
          || current.documentTransform !== initial.documentTransform
        ) {
          provider.resize({
            width: current.width,
            height: current.height,
            dpr: Math.max(1, Math.min(3, current.dpr)),
            ...(current.documentTransform
              ? { documentTransform: current.documentTransform }
              : {}),
          });
        }
        for (const overlay of overlaysRef.current) provider.upsertSelectableOverlay(overlay);
        trackedIdsRef.current = overlaysRef.current.map((overlay) => overlay.documentId);
        provider.render();
      } catch {
        // Headless / no GPU: leave Konva overlays as sole selection chrome.
        providerRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
      generationRef.current += 1;
      const provider = providerRef.current;
      providerRef.current = null;
      trackedIdsRef.current = [];
      if (provider) {
        try {
          provider.destroy();
        } catch {
          /* ignore */
        }
      }
    };
  }, [enabled, mountParent, presentable]);

  // Sync selection overlays every selection/layout change.
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider || provider.destroyed) return;

    const plan = planStudioPixiOverlaySync(trackedIdsRef.current, overlays);
    for (const id of plan.removeIds) {
      provider.removeSelectableOverlay(id);
    }
    for (const overlay of plan.upsert) {
      provider.upsertSelectableOverlay(overlay);
    }
    trackedIdsRef.current = overlays.map((overlay) => overlay.documentId);
    provider.render();
  }, [overlays]);

  // Resize / re-place when stage metrics change, without remounting the provider. The document
  // transform rides along: zoom, flip and rotation change the placement, never the geometry.
  useEffect(() => {
    const provider = providerRef.current;
    if (!provider || provider.destroyed) return;
    if (width <= 0 || height <= 0) return;
    try {
      provider.resize({
        width,
        height,
        dpr: Math.max(1, Math.min(3, dpr)),
        ...(documentTransform ? { documentTransform } : {}),
      });
      provider.render();
    } catch {
      /* provider may be mid-destroy */
    }
  }, [width, height, dpr, documentTransform]);

  return null;
}
