import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_ASSET_RIGHTS,
  STUDIO_BG3D_ASSET_METADATA_VERSION,
  normalizeStudioBg3dAssetMetadata,
  type StudioBg3dAssetMetadata,
} from "./studio-bg3d-asset-metadata";
import {
  getStudioBg3dAssetMetadata,
  putStudioBg3dAssetMetadataAtomically,
  updateStudioBg3dAssetRights,
  updateStudioBg3dAssetTags,
} from "./studio-bg3d-asset-metadata-store";
import { resolveStudioBg3dAssetPatchValue } from "./studio-bg3d-asset-rights-merge";

import type { StudioBg3dLibrariesAuthority } from "./studio-bg3d-libraries-sqlite-opfs-authority";

const HASH = `sha256:${"a".repeat(64)}` as const;

const RIGHTS = { status: "licensed", commercialUse: true, teamShareAllowed: false, license: "표준" } as const;
const WITH_AI = { ...RIGHTS, aiGenerated: "yes", aiTraining: "prohibited" } as const;

function record(rights: unknown): StudioBg3dAssetMetadata {
  const value = normalizeStudioBg3dAssetMetadata({
    version: STUDIO_BG3D_ASSET_METADATA_VERSION,
    contentHash: HASH,
    name: "의자",
    format: "glb",
    createdAt: 10,
    updatedAt: 10,
    byteSize: 1_000,
    triangles: 10,
    textures: 1,
    favorite: false,
    collections: [],
    tags: [],
    rights,
  });
  if (!value) throw new Error("invalid fixture");
  return value;
}

/** 패치를 저장 규칙으로 정규화한 기록(저장소가 같은 방식으로 만든다). */
const validated = (rights: unknown) => record(rights);

function resolve(existingRights: unknown, askedRights: unknown) {
  return resolveStudioBg3dAssetPatchValue(record(existingRights), "rights", askedRights, validated(askedRights));
}

describe("resolveStudioBg3dAssetPatchValue", () => {
  it("권리가 아닌 패치는 정규화된 값을 그대로 쓴다", () => {
    const tagged = normalizeStudioBg3dAssetMetadata({ ...record(RIGHTS), tags: ["한옥", "야간"] });
    expect(resolveStudioBg3dAssetPatchValue(record(WITH_AI), "tags", ["한옥", "야간"], tagged as StudioBg3dAssetMetadata))
      .toEqual(tagged?.tags);
  });

  it("새 영수증이 AI 칸을 말하지 않으면 저장된 AI 표기를 지킨다", () => {
    expect(resolve(WITH_AI, { ...RIGHTS, status: "owned", license: undefined })).toMatchObject({
      status: "owned",
      aiGenerated: "yes",
      aiTraining: "prohibited",
    });
  });

  it("새 영수증이 AI 칸을 말하면 그 값으로 바꾸고 말하지 않은 칸만 지킨다", () => {
    expect(resolve(WITH_AI, { ...RIGHTS, aiGenerated: "no" })).toMatchObject({
      aiGenerated: "no",
      aiTraining: "prohibited",
    });
    expect(resolve(WITH_AI, { ...RIGHTS, aiTraining: "allowed" })).toMatchObject({
      aiGenerated: "yes",
      aiTraining: "allowed",
    });
  });

  it("'unknown' 을 명시하면 그 칸을 지운다", () => {
    const result = resolve(WITH_AI, { ...RIGHTS, aiGenerated: "unknown", aiTraining: "unknown" }) as Record<string, unknown>;
    expect(result).not.toHaveProperty("aiGenerated");
    expect(result).not.toHaveProperty("aiTraining");
  });

  it("값이 undefined 인 칸은 말하지 않은 것과 같다", () => {
    expect(resolve(WITH_AI, { ...RIGHTS, aiGenerated: undefined, aiTraining: undefined })).toMatchObject({
      aiGenerated: "yes",
      aiTraining: "prohibited",
    });
  });

  it("저장된 AI 표기가 없으면 아무것도 만들어 내지 않는다", () => {
    const result = resolve(RIGHTS, RIGHTS) as Record<string, unknown>;
    expect(result).not.toHaveProperty("aiGenerated");
    expect(result).not.toHaveProperty("aiTraining");
  });

  it("알 수 없는 AI 값이 든 영수증은 통째로 기본값으로 내려가고 그 칸도 지운다", () => {
    const result = resolve(WITH_AI, { ...RIGHTS, aiGenerated: "maybe" }) as Record<string, unknown>;
    expect(result).toMatchObject({ status: "unknown", commercialUse: false });
    expect(result).not.toHaveProperty("aiGenerated");
    // 같이 말하지 않은 칸은 지킨다.
    expect(result.aiTraining).toBe("prohibited");
  });

  it("영수증이 객체가 아니어도 던지지 않고 저장된 AI 표기를 지킨다", () => {
    const result = resolveStudioBg3dAssetPatchValue(record(WITH_AI), "rights", "owned", validated(undefined));
    expect(result).toMatchObject({ ...DEFAULT_STUDIO_BG3D_ASSET_RIGHTS, aiGenerated: "yes", aiTraining: "prohibited" });
  });
});

function memoryAuthority(initialRaw: string | null) {
  let raw = initialRaw;
  const authority: StudioBg3dLibrariesAuthority = {
    readManifest: async () => raw,
    readBlob: async () => {
      throw new Error("blob-not-used");
    },
    mutate: async (_slot, _refs, operation) => {
      const outcome = await operation({
        now: 1_000,
        currentRaw: raw,
        putBlob: async () => {
          throw new Error("blob-not-used");
        },
        getBlob: async () => {
          throw new Error("blob-not-used");
        },
      });
      raw = outcome.nextRaw;
      return outcome.result;
    },
  };
  return authority;
}

describe.each([
  ["OPFS 매니페스트 길", () => ({ authority: memoryAuthority(null) })],
  ["IndexedDB 길", () => ({ indexedDb: new IDBFactory() })],
] as const)("updateStudioBg3dAssetRights — %s", (_label, makeOptions) => {
  it("AI 표기를 말하지 않은 권리 갱신이 저장된 AI 표기를 지운다는 회귀를 막는다", async () => {
    const options = makeOptions();
    await putStudioBg3dAssetMetadataAtomically([record(WITH_AI)], options);

    const updated = await updateStudioBg3dAssetRights(
      HASH,
      { status: "owned", commercialUse: true, teamShareAllowed: false },
      { ...options, now: 2_000 },
    );
    expect(updated.rights).toMatchObject({ status: "owned", aiGenerated: "yes", aiTraining: "prohibited" });
    expect((await getStudioBg3dAssetMetadata(HASH, options))?.rights).toMatchObject({
      status: "owned",
      aiGenerated: "yes",
      aiTraining: "prohibited",
    });
  });

  it("말한 칸은 바꾸고 'unknown' 은 지운다", async () => {
    const options = makeOptions();
    await putStudioBg3dAssetMetadataAtomically([record(WITH_AI)], options);

    const changed = await updateStudioBg3dAssetRights(
      HASH,
      { ...RIGHTS, aiGenerated: "no", aiTraining: "unknown" },
      { ...options, now: 2_000 },
    );
    expect(changed.rights.aiGenerated).toBe("no");
    expect(changed.rights).not.toHaveProperty("aiTraining");
    expect(await getStudioBg3dAssetMetadata(HASH, options)).toEqual(changed);
  });

  it("권리가 아닌 갱신은 AI 표기에 손대지 않는다", async () => {
    const options = makeOptions();
    await putStudioBg3dAssetMetadataAtomically([record(WITH_AI)], options);
    const tagged = await updateStudioBg3dAssetTags(HASH, ["한옥"], { ...options, now: 2_000 });
    expect(tagged.rights).toMatchObject({ aiGenerated: "yes", aiTraining: "prohibited" });
  });
});
