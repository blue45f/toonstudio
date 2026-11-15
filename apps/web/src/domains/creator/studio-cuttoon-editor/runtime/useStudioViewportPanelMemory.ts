import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type { StudioDrawingPaletteLayout } from "../../brush/studio-drawing-palettes";
import { acquireProductStudioUiPreferencesRepository } from "../../studio-legacy-editor-runtime-helpers";
import type { StudioWorkspaceLayoutSource } from "../../studio-menu-session-model";
import type { StudioUiPreferencesRepository } from "../../studio-ui-preferences-sqlite";
import type { StudioWorkspaceDesktopLayout, StudioWorkspaceLayout } from "../../studio-workspaces";
import {
  areStudioViewportPanelSnapshotsEqual,
  normalizeStudioViewportPanelSnapshot,
  resolveStudioViewportMaxLeftPanelWidth,
  resolveStudioViewportMaxRightPanelWidth,
  resolveStudioViewportPanelBucket,
  seedCompactViewportPanelSnapshot,
  type StudioViewportPanelBucket,
  type StudioViewportPanelSnapshot,
} from "./studio-viewport-panel-layout";

type ViewportMemoryRepository = Pick<
  StudioUiPreferencesRepository,
  "loadViewportPanelMemory" | "saveViewportPanelMemory"
>;

function readViewportWidth(): number {
  if (typeof window !== "undefined" && Number.isFinite(window.innerWidth) && window.innerWidth > 0) {
    return window.innerWidth;
  }
  return 1_440;
}

export function useStudioViewportPanelBounds(): {
  readonly viewportWidth: number;
  readonly bucket: StudioViewportPanelBucket;
  readonly maxLeftPanelWidth: number;
  readonly maxRightPanelWidth: number;
} {
  const [viewportWidth, setViewportWidth] = useState<number>(readViewportWidth);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => {
      const next = readViewportWidth();
      setViewportWidth((prev) => (prev === next ? prev : next));
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return {
    viewportWidth,
    bucket: resolveStudioViewportPanelBucket(viewportWidth),
    maxLeftPanelWidth: resolveStudioViewportMaxLeftPanelWidth(viewportWidth),
    maxRightPanelWidth: resolveStudioViewportMaxRightPanelWidth(viewportWidth),
  };
}

export interface UseStudioViewportPanelMemoryInput {
  readonly viewportWidth: number;
  readonly ownerScope: string;
  readonly initialDesktop: StudioWorkspaceDesktopLayout;
  readonly initialDrawingPalettes: StudioDrawingPaletteLayout;
  readonly leftPanelOpen: boolean;
  readonly rightPanelOpen: boolean;
  readonly leftPanelWidth: number;
  readonly rightPanelWidth: number;
  readonly leftDragging: boolean;
  readonly rightDragging: boolean;
  readonly drawingPaletteDragging: boolean;
  readonly drawingPaletteLayout: StudioDrawingPaletteLayout;
  readonly setLeftPanelOpenWithOverride: (next: boolean) => void;
  readonly setRightPanelOpenWithOverride: (next: boolean) => void;
  readonly leftResizeSetWidthRef: MutableRefObject<(width: number) => void>;
  readonly rightResizeSetWidthRef: MutableRefObject<(width: number) => void>;
  readonly setDrawingPaletteLayout: Dispatch<SetStateAction<StudioDrawingPaletteLayout>>;
  readonly cancelDrawingPaletteDrag?: () => void;
  readonly acquireUiPreferences?: () => Promise<ViewportMemoryRepository> | undefined;
}

export interface StudioViewportPanelMemoryHandle {
  readonly bucket: StudioViewportPanelBucket;
  readonly authoredDesktop: StudioWorkspaceDesktopLayout;
  readonly authoredDrawingPalettes: StudioDrawingPaletteLayout;
  readonly onWorkspaceLayoutApplied: (
    presented: StudioWorkspaceLayout,
    source: StudioWorkspaceLayoutSource,
  ) => void;
}

export function useStudioViewportPanelMemory(
  input: UseStudioViewportPanelMemoryInput,
): StudioViewportPanelMemoryHandle {
  const {
    viewportWidth, ownerScope, initialDesktop, initialDrawingPalettes,
    leftPanelOpen, rightPanelOpen, leftPanelWidth, rightPanelWidth,
    leftDragging, rightDragging, drawingPaletteDragging, drawingPaletteLayout,
    setLeftPanelOpenWithOverride, setRightPanelOpenWithOverride,
    leftResizeSetWidthRef, rightResizeSetWidthRef, setDrawingPaletteLayout,
    cancelDrawingPaletteDrag,
    acquireUiPreferences = acquireProductStudioUiPreferencesRepository,
  } = input;

  const bucket = resolveStudioViewportPanelBucket(viewportWidth);
  const [appliedBucket, setAppliedBucket] = useState<StudioViewportPanelBucket>(bucket);

  const [largeSnapshot, setLargeSnapshot] = useState<StudioViewportPanelSnapshot>(
    () =>
      normalizeStudioViewportPanelSnapshot({
        desktop: initialDesktop,
        drawingPalettes: initialDrawingPalettes,
      }) ?? { desktop: initialDesktop, drawingPalettes: initialDrawingPalettes },
  );
  const largeSnapshotRef = useRef<StudioViewportPanelSnapshot>(largeSnapshot);
  const compactSnapshotRef = useRef<StudioViewportPanelSnapshot | null>(null);
  const bucketRef = useRef<StudioViewportPanelBucket>(bucket);
  const appliedBucketRef = useRef<StudioViewportPanelBucket>(appliedBucket);
  const viewportWidthRef = useRef<number>(viewportWidth);
  const ownerScopeRef = useRef<string>(ownerScope);
  const editedBucketsRef = useRef<{ compact: boolean; large: boolean }>({ compact: false, large: false });
  const didSeedInitialCompactRef = useRef(false);

  bucketRef.current = bucket;
  appliedBucketRef.current = appliedBucket;
  viewportWidthRef.current = viewportWidth;
  ownerScopeRef.current = ownerScope;

  const applySnapshotToScreen = useCallback(
    (snapshot: StudioViewportPanelSnapshot, clampWidth?: number | null) => {
      const next = normalizeStudioViewportPanelSnapshot(snapshot, snapshot, clampWidth) ?? snapshot;
      cancelDrawingPaletteDrag?.();
      setLeftPanelOpenWithOverride(next.desktop.leftPanelOpen);
      setRightPanelOpenWithOverride(next.desktop.rightPanelOpen);
      leftResizeSetWidthRef.current(next.desktop.leftPanelWidth);
      rightResizeSetWidthRef.current(next.desktop.rightPanelWidth);
      setDrawingPaletteLayout(next.drawingPalettes);
    },
    [
      cancelDrawingPaletteDrag, leftResizeSetWidthRef, rightResizeSetWidthRef,
      setDrawingPaletteLayout, setLeftPanelOpenWithOverride, setRightPanelOpenWithOverride,
    ],
  );

  const persistMemory = useCallback(
    (scope: string, compact: StudioViewportPanelSnapshot | null, large: StudioViewportPanelSnapshot | null) => {
      const pending = acquireUiPreferences();
      if (!pending || typeof pending.then !== "function") return;
      void pending
        .then((repo) => repo?.saveViewportPanelMemory?.({ version: 1, compact, large }, scope))
        .catch(() => undefined);
    },
    [acquireUiPreferences],
  );

  useLayoutEffect(() => {
    if (didSeedInitialCompactRef.current) return;
    didSeedInitialCompactRef.current = true;
    if (bucketRef.current === "compact") {
      const seeded = seedCompactViewportPanelSnapshot(largeSnapshotRef.current, viewportWidthRef.current);
      leftResizeSetWidthRef.current(seeded.desktop.leftPanelWidth);
      rightResizeSetWidthRef.current(seeded.desktop.rightPanelWidth);
    }
  }, [leftResizeSetWidthRef, rightResizeSetWidthRef]);

  useLayoutEffect(() => {
    if (bucket === appliedBucket) return;
    if (bucket === "compact") {
      const target =
        compactSnapshotRef.current
        ?? seedCompactViewportPanelSnapshot(largeSnapshotRef.current, viewportWidth);
      applySnapshotToScreen(target, viewportWidth);
      setAppliedBucket("compact");
      return;
    }
    applySnapshotToScreen(largeSnapshotRef.current, null);
    setAppliedBucket("large");
  }, [appliedBucket, applySnapshotToScreen, bucket, viewportWidth]);

  useEffect(() => {
    if (bucket !== appliedBucket || leftDragging || rightDragging || drawingPaletteDragging) return;
    const current = normalizeStudioViewportPanelSnapshot(
      {
        desktop: { leftPanelOpen, rightPanelOpen, leftPanelWidth, rightPanelWidth },
        drawingPalettes: drawingPaletteLayout,
      },
      undefined,
      appliedBucket === "compact" ? viewportWidth : null,
    );
    if (!current) return;
    if (appliedBucket === "large") {
      if (areStudioViewportPanelSnapshotsEqual(largeSnapshotRef.current, current)) return;
      editedBucketsRef.current.large = true;
      largeSnapshotRef.current = current;
      setLargeSnapshot(current);
      persistMemory(ownerScope, compactSnapshotRef.current, current);
      return;
    }
    const baseline =
      compactSnapshotRef.current
      ?? seedCompactViewportPanelSnapshot(largeSnapshotRef.current, viewportWidth);
    if (areStudioViewportPanelSnapshotsEqual(baseline, current)) return;
    editedBucketsRef.current.compact = true;
    compactSnapshotRef.current = current;
    persistMemory(ownerScope, current, largeSnapshotRef.current);
  }, [
    appliedBucket, bucket, drawingPaletteDragging, drawingPaletteLayout,
    leftDragging, leftPanelOpen, leftPanelWidth, ownerScope, persistMemory,
    rightDragging, rightPanelOpen, rightPanelWidth, viewportWidth,
  ]);

  useEffect(() => {
    editedBucketsRef.current = { compact: false, large: false };
    compactSnapshotRef.current = null;
    const pending = acquireUiPreferences();
    if (!pending || typeof pending.then !== "function") return;
    let cancelled = false;
    void pending
      .then((repo) => repo?.loadViewportPanelMemory?.(ownerScope))
      .then((memory) => {
        if (cancelled || !memory || ownerScopeRef.current !== ownerScope) return;
        if (memory.compact && !editedBucketsRef.current.compact) {
          compactSnapshotRef.current = memory.compact;
          if (appliedBucketRef.current === "compact") {
            applySnapshotToScreen(memory.compact, viewportWidthRef.current);
          }
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [acquireUiPreferences, applySnapshotToScreen, ownerScope]);

  const onWorkspaceLayoutApplied = useCallback(
    (presented: StudioWorkspaceLayout, source: StudioWorkspaceLayoutSource) => {
      const nextLarge =
        normalizeStudioViewportPanelSnapshot({
          desktop: presented.desktop,
          drawingPalettes: presented.drawingPalettes,
        }) ?? { desktop: presented.desktop, drawingPalettes: presented.drawingPalettes };
      largeSnapshotRef.current = nextLarge;
      setLargeSnapshot(nextLarge);
      if (source === "switch" || source === "reload" || source === "active-workspace-delete") {
        compactSnapshotRef.current = null;
        persistMemory(ownerScopeRef.current, null, nextLarge);
      }
      if (bucketRef.current === "compact") {
        const target =
          compactSnapshotRef.current
          ?? seedCompactViewportPanelSnapshot(nextLarge, viewportWidthRef.current);
        applySnapshotToScreen(target, viewportWidthRef.current);
      }
    },
    [applySnapshotToScreen, persistMemory],
  );

  const liveDesktop = useMemo<StudioWorkspaceDesktopLayout>(
    () => ({ leftPanelOpen, rightPanelOpen, leftPanelWidth, rightPanelWidth }),
    [leftPanelOpen, leftPanelWidth, rightPanelOpen, rightPanelWidth],
  );
  const largeActive = bucket === "large" && appliedBucket === "large";

  return {
    bucket,
    authoredDesktop: largeActive ? liveDesktop : largeSnapshot.desktop,
    authoredDrawingPalettes: largeActive ? drawingPaletteLayout : largeSnapshot.drawingPalettes,
    onWorkspaceLayoutApplied,
  };
}
