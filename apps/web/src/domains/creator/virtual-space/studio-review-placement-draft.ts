import type { StudioReviewMappedPage, StudioReviewSpatialSelection } from "@toonstudio/studio-project-model";

export type StudioReviewPlacementMode = StudioReviewSpatialSelection["kind"] | "pen";
export interface StudioReviewPlacementFields {
  readonly mode: StudioReviewPlacementMode;
  readonly frameId: string;
  readonly elementId: string;
  readonly numbers: { x: string; y: string; width: string; height: string };
}
export const initialPlacement: StudioReviewPlacementFields = {
  mode: "page", frameId: "", elementId: "", numbers: { x: "50", y: "50", width: "10", height: "10" },
};
export function reviewPlacementPageKey(mapping: StudioReviewMappedPage, sha256: string): string {
  return JSON.stringify([sha256, mapping.page.ordinal, mapping.page.id, mapping.sourceServerRevision, mapping.sourceContentDigest]);
}
