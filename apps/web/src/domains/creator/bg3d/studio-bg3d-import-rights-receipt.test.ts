import { describe, expect, it } from "vitest";

import { normalizeStudioBg3dAssetMetadata, STUDIO_BG3D_ASSET_METADATA_VERSION } from "./studio-bg3d-asset-metadata";
import {
  STUDIO_BG3D_IMPORT_LICENSE_PLACEHOLDER,
  listStudioBg3dImportRightsReceipts,
  pickStudioBg3dImportedMetadata,
} from "./studio-bg3d-import-rights-receipt";

const HASH = `sha256:${"a".repeat(64)}` as const;

function build(receipt: object) {
  return normalizeStudioBg3dAssetMetadata({
    version: STUDIO_BG3D_ASSET_METADATA_VERSION,
    contentHash: HASH,
    name: "모델",
    format: "glb",
    createdAt: 1,
    updatedAt: 1,
    byteSize: 10,
    triangles: null,
    textures: null,
    favorite: false,
    collections: [],
    tags: [],
    rights: receipt,
  });
}

describe("listStudioBg3dImportRightsReceipts", () => {
  it("이름이 있는 구매·허가는 원래 이름, 자리표시 이름, 이름 없음 순으로 시도하고 팀 공유는 늘 막는다", () => {
    const list = listStudioBg3dImportRightsReceipts({ status: "licensed", commercialUse: true, licenseName: "약관" }, { aiGenerated: "yes" });
    expect(list.map((receipt) => receipt.license)).toEqual(["약관", STUDIO_BG3D_IMPORT_LICENSE_PLACEHOLDER, undefined]);
    for (const receipt of list) {
      expect(receipt).toMatchObject({ status: "licensed", commercialUse: true, teamShareAllowed: false, aiGenerated: "yes" });
    }
  });

  it("이름이 없던 구매·허가에는 자리표시 이름을 만들어 주지 않는다(상태를 넓히지 않는다)", () => {
    const list = listStudioBg3dImportRightsReceipts({ status: "licensed", commercialUse: true }, undefined);
    expect(list.map((receipt) => receipt.license)).toEqual([undefined]);
  });

  it("권리 확인 전이면 상업 사용을 허용으로 옮기지 않는다", () => {
    const [receipt] = listStudioBg3dImportRightsReceipts({ status: "unknown", commercialUse: true }, { aiTraining: "prohibited" });
    expect(receipt).toMatchObject({ status: "unknown", commercialUse: false, aiTraining: "prohibited" });
  });
});

describe("pickStudioBg3dImportedMetadata", () => {
  it("라이브러리와 같은 권리 상태를 지키는 첫 기록을 고른다", () => {
    const record = pickStudioBg3dImportedMetadata({ status: "licensed", commercialUse: true, licenseName: "표준 <상업>" }, undefined, build);
    expect(record?.rights).toMatchObject({ status: "licensed", commercialUse: true, license: STUDIO_BG3D_IMPORT_LICENSE_PLACEHOLDER });
  });

  it("어느 후보도 상태를 지키지 못하면 저장 규칙이 내린 기록을 그대로 쓴다(넓히지 않는다)", () => {
    const record = pickStudioBg3dImportedMetadata({ status: "licensed", commercialUse: true }, { aiGenerated: "no" }, build);
    expect(record?.rights).toMatchObject({ status: "unknown", commercialUse: false, aiGenerated: "no" });
  });

  it("기록을 하나도 만들 수 없으면 null 이다", () => {
    expect(pickStudioBg3dImportedMetadata({ status: "owned", commercialUse: true }, undefined, () => null)).toBeNull();
  });
});
