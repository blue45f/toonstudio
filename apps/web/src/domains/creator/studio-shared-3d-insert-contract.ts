/**
 * Shared Stage fields carried by a BG3D insert without transferring VRM ownership to the raster.
 * This leaf stays type-only so the document controller never imports renderer/runtime code.
 */

/** 같은 컷에서 실제로 보인 배우와 해당 배우가 차지한 화소 수. */
export interface StudioBg3dSixPassActorPixels {
  readonly elementId: string;
  readonly sourceHash: `sha256:${string}`;
  readonly placementHash: `sha256:${string}`;
  readonly pixels: number;
}

export interface StudioBg3dSharedStageInsertProjection {
  /** Full-fidelity VRM sources baked in this capture; Studio may hide, but never delete, them. */
  readonly linkedCharacterCapture?: {
    readonly kind: "full-fidelity-linked-vrm-capture";
    readonly elementIds: readonly string[];
    /** Exact root placement captured for this background; the VRM source is not rewritten. */
    readonly stagePlacements: readonly {
      readonly elementId: string;
      readonly expectedRuntimeKey: string;
      readonly transform: {
        readonly position: readonly [number, number, number];
        readonly rotationY: number;
      };
    }[];
  };
  /** Explicit user intent for the page-owned background/character association. */
  readonly sharedStageMutation?: {
    readonly kind: "background-only" | "connect" | "refresh" | "relink" | "unlink";
  };
  /** Output representation is independent from the shared Stage relationship mutation. */
  readonly materialization?: {
    readonly kind: "editable-lt-bundle" | "detached-editable-composite";
  };
}
