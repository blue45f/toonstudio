import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_ASSET_METADATA_VERSION,
  normalizeStudioBg3dAssetMetadata,
  type StudioBg3dAssetMetadata,
} from "./studio-bg3d-asset-metadata";
import { loadStudioBg3dAssetRightsSources } from "./studio-bg3d-asset-rights-source";

import type { StudioBg3dAttachmentRights } from "./studio-bg3d-scene-document-types";

const HASH = `sha256:${"a".repeat(64)}` as const;
const LICENSED: StudioBg3dAttachmentRights = {
  status: "licensed",
  commercialUse: true,
  attributionRequired: false,
  licenseName: "표준 라이선스",
};

function metadata(): StudioBg3dAssetMetadata {
  const value = normalizeStudioBg3dAssetMetadata({
    version: STUDIO_BG3D_ASSET_METADATA_VERSION,
    contentHash: HASH,
    name: "기록",
    format: "glb",
    createdAt: 1,
    updatedAt: 1,
    byteSize: 100,
    triangles: null,
    textures: null,
    favorite: false,
    collections: [],
    tags: [],
    rights: { status: "owned", commercialUse: true, teamShareAllowed: false, aiGenerated: "no" },
  });
  if (!value) throw new Error("invalid fixture");
  return value;
}

describe("loadStudioBg3dAssetRightsSources", () => {
  it("두 원천을 읽어 행 ID 와 콘텐츠 해시로 찾을 수 있게 모은다", async () => {
    const result = await loadStudioBg3dAssetRightsSources({
      readLibraryRights: async () => new Map([["row-1", LICENSED]]),
      readMetadata: async () => [metadata()],
    });
    expect(result.libraryRightsById.get("row-1")).toEqual(LICENSED);
    expect(result.metadataByHash.get(HASH)?.rights.aiGenerated).toBe("no");
    expect(result.failed).toEqual({ library: false, metadata: false });
  });

  it("한쪽을 읽지 못해도 다른 쪽 결과를 쓰고 어느 쪽이 실패했는지 알린다", async () => {
    const libraryDown = await loadStudioBg3dAssetRightsSources({
      readLibraryRights: async () => {
        throw new Error("manifest-corrupt");
      },
      readMetadata: async () => [metadata()],
    });
    expect(libraryDown.failed).toEqual({ library: true, metadata: false });
    expect(libraryDown.libraryRightsById.size).toBe(0);
    expect(libraryDown.metadataByHash.size).toBe(1);

    const metadataDown = await loadStudioBg3dAssetRightsSources({
      readLibraryRights: async () => new Map([["row-1", LICENSED]]),
      readMetadata: async () => {
        throw new Error("storage-unavailable");
      },
    });
    expect(metadataDown.failed).toEqual({ library: false, metadata: true });
    expect(metadataDown.libraryRightsById.size).toBe(1);
    expect(metadataDown.metadataByHash.size).toBe(0);
  });

  it("두 원천이 모두 실패해도 던지지 않고 빈 결과와 실패 표시를 돌려준다", async () => {
    const result = await loadStudioBg3dAssetRightsSources({
      readLibraryRights: () => Promise.reject(new Error("a")),
      readMetadata: () => Promise.reject(new Error("b")),
    });
    expect(result.failed).toEqual({ library: true, metadata: true });
    expect(result.libraryRightsById.size + result.metadataByHash.size).toBe(0);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
