import type { StudioAsset, StudioAssetContentHash, StudioAssetRightsMetadata } from "../studio-asset-library";

export interface StudioAssetManifestEntry {
  readonly bundleSourceCredit?: StudioAsset["bundleSourceCredit"];
  readonly id: string;
  readonly name: string;
  readonly contentHash: StudioAssetContentHash;
  readonly byteSize: number;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly createdAt: number;
  readonly kind: string | null;
  readonly rights: StudioAssetRightsMetadata;
}
