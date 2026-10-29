import type { StudioBundleSourceCreditSchema } from "./studio-bundle-source-credit";
import type { StudioLiveAdjustmentMetadataSchema } from "./studio-live-adjustment-contract";
import type { StudioWorkAssetSmartFiltersSchema } from "./studio-smart-filter-stack-contract";
import type {
  StudioWorkAssetBlurFxSchema,
  StudioWorkAssetLensBlurSchema,
  StudioWorkAssetFieldIrisBlurSchema,
  StudioWorkAssetTiltShiftBlurSchema,
  StudioWorkAssetSelectiveGaussianBlurSchema,
  StudioWorkAssetTileableBlurSchema,
  StudioWorkAssetDifferenceOfGaussiansSchema,
  StudioWorkAssetDustScratchesSchema,
  StudioWorkAssetColorToAlphaSchema,
  StudioWorkAssetBorderEffectSchema,
  StudioWorkAssetCurveSchema,
  StudioWorkAssetCurveChannelsSchema,
  StudioWorkAssetEdgeAwareDenoiseSchema,
  StudioWorkAssetJpegArtifactReductionSchema,
  StudioWorkAssetLineCleanupSchema,
  StudioWorkAssetScreentoneRemovalSchema,
} from "./studio-work-asset-contract";
import type { z } from "zod";

export type StudioWorkAssetStructuredEditValue =
  | z.infer<typeof StudioWorkAssetBlurFxSchema>
  | z.infer<typeof StudioWorkAssetLensBlurSchema>
  | z.infer<typeof StudioWorkAssetFieldIrisBlurSchema>
  | z.infer<typeof StudioWorkAssetTiltShiftBlurSchema>
  | z.infer<typeof StudioWorkAssetSelectiveGaussianBlurSchema>
  | z.infer<typeof StudioWorkAssetTileableBlurSchema>
  | z.infer<typeof StudioWorkAssetDifferenceOfGaussiansSchema>
  | z.infer<typeof StudioWorkAssetDustScratchesSchema>
  | z.infer<typeof StudioWorkAssetColorToAlphaSchema>
  | z.infer<typeof StudioWorkAssetBorderEffectSchema>
  | z.infer<typeof StudioWorkAssetCurveSchema>
  | z.infer<typeof StudioWorkAssetCurveChannelsSchema>
  | z.infer<typeof StudioWorkAssetEdgeAwareDenoiseSchema>
  | z.infer<typeof StudioWorkAssetJpegArtifactReductionSchema>
  | z.infer<typeof StudioWorkAssetLineCleanupSchema>
  | z.infer<typeof StudioWorkAssetScreentoneRemovalSchema>
  | z.infer<typeof StudioWorkAssetSmartFiltersSchema>
  | z.infer<typeof StudioLiveAdjustmentMetadataSchema>
  | z.infer<typeof StudioBundleSourceCreditSchema>;
