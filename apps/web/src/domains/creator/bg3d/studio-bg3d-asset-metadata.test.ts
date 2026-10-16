import { describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_BG3D_ASSET_RIGHTS,
  STUDIO_BG3D_ASSET_METADATA_LIMITS,
  STUDIO_BG3D_ASSET_METADATA_VERSION,
  canonicalizeStudioBg3dAssetContentHash,
  filterStudioBg3dAssetMetadata,
  migrateStudioBg3dAssetMetadata,
  normalizeStudioBg3dAssetMetadata,
  normalizeStudioBg3dAssetMetadataCollection,
  queryStudioBg3dAssetMetadata,
  sortStudioBg3dAssetMetadata,
  type StudioBg3dAssetMetadata,
} from "./studio-bg3d-asset-metadata";
import { createSkpReportFixture } from "./studio-bg3d-skp.test-fixture";

const HASH_A = `sha256:${"a".repeat(64)}` as const;
const HASH_B = `sha256:${"b".repeat(64)}` as const;
const HASH_C = `sha256:${"c".repeat(64)}` as const;
const HASH_D = `sha256:${"d".repeat(64)}` as const;

function metadata(
  contentHash: `sha256:${string}`,
  overrides: Record<string, unknown> = {},
): StudioBg3dAssetMetadata {
  const normalized = normalizeStudioBg3dAssetMetadata({
    version: STUDIO_BG3D_ASSET_METADATA_VERSION,
    contentHash,
    name: "기본 모델",
    format: "glb",
    createdAt: 100,
    updatedAt: 100,
    byteSize: 1_000,
    triangles: 100,
    textures: 2,
    favorite: false,
    collections: [],
    tags: [],
    rights: DEFAULT_STUDIO_BG3D_ASSET_RIGHTS,
    ...overrides,
  });
  if (!normalized) throw new Error("invalid test fixture");
  return normalized;
}

describe("studio BG3D asset metadata normalization", () => {
  it("canonicalizes hash/text/list data into deeply immutable current-version metadata", () => {
    const decomposedKorean = "한옥";
    const raw = {
      version: STUDIO_BG3D_ASSET_METADATA_VERSION,
      contentHash: "A".repeat(64),
      name: "  전통   찻집  ",
      format: "GLB",
      createdAt: 10,
      updatedAt: 11,
      byteSize: 4_096,
      triangles: 1_200,
      textures: 3,
      favorite: true,
      collections: [
        { id: "z-last", name: "외부" },
        { id: "a-first", name: "배경" },
      ],
      tags: [decomposedKorean, "밤", "한옥"],
      rights: {
        status: "licensed",
        commercialUse: true,
        teamShareAllowed: true,
        provider: "ACON 3D",
        author: "스튜디오 봄",
        license: "Commercial Standard",
        purchaseOrDownloadDate: "2026-07-22",
      },
      ignoredSecret: "must-not-survive",
    };

    const normalized = normalizeStudioBg3dAssetMetadata(raw);

    expect(normalized).toEqual({
      version: STUDIO_BG3D_ASSET_METADATA_VERSION,
      contentHash: HASH_A,
      name: "전통 찻집",
      format: "glb",
      createdAt: 10,
      updatedAt: 11,
      byteSize: 4_096,
      triangles: 1_200,
      textures: 3,
      favorite: true,
      collections: [
        { id: "a-first", name: "배경" },
        { id: "z-last", name: "외부" },
      ],
      tags: ["밤", "한옥"],
      rights: {
        status: "licensed",
        commercialUse: true,
        teamShareAllowed: true,
        provider: "ACON 3D",
        author: "스튜디오 봄",
        license: "Commercial Standard",
        purchaseOrDownloadDate: "2026-07-22",
      },
    });
    expect(Object.isFrozen(normalized)).toBe(true);
    expect(Object.isFrozen(normalized?.collections)).toBe(true);
    expect(Object.isFrozen(normalized?.collections[0])).toBe(true);
    expect(Object.isFrozen(normalized?.tags)).toBe(true);
    expect(Object.isFrozen(normalized?.rights)).toBe(true);
    expect(raw.name).toBe("  전통   찻집  ");
  });

  it("migrates V1 metric/collection aliases and always denies legacy team sharing", () => {
    const migrated = migrateStudioBg3dAssetMetadata({
      version: 1,
      contentHash: HASH_B,
      name: "Legacy Classroom",
      format: "obj",
      createdAt: 20,
      byteSize: 2_000,
      triangleCount: 400,
      textureCount: 4,
      favorite: true,
      collection: { id: "school", name: "학교" },
      tags: ["교실"],
      rights: {
        status: "licensed",
        commercialUse: true,
        teamShareAllowed: true,
        provider: "Model Store",
        license: "Team License",
      },
    });

    expect(migrated).toMatchObject({
      version: STUDIO_BG3D_ASSET_METADATA_VERSION,
      updatedAt: 20,
      triangles: 400,
      textures: 4,
      collections: [{ id: "school", name: "학교" }],
      rights: {
        status: "licensed",
        commercialUse: true,
        teamShareAllowed: false,
      },
    });
    expect(normalizeStudioBg3dAssetMetadata({ ...migrated, version: 1 })).toBeNull();
    expect(migrateStudioBg3dAssetMetadata({ ...migrated, version: 99 })).toBeNull();
  });

  it("fails closed for hostile identifiers, invalid bounds, unknown formats, and future schemas", () => {
    const base = metadata(HASH_A);
    expect(canonicalizeStudioBg3dAssetContentHash(HASH_A.toUpperCase())).toBe(HASH_A);
    expect(canonicalizeStudioBg3dAssetContentHash(`${HASH_A}0`)).toBeNull();
    expect(normalizeStudioBg3dAssetMetadata({ ...base, version: STUDIO_BG3D_ASSET_METADATA_VERSION + 1 })).toBeNull();
    // normalize 는 현재 버전만 받는다. 옛 버전은 migrate 를 거쳐야 한다.
    expect(normalizeStudioBg3dAssetMetadata({ ...base, version: 2 })).toBeNull();
    expect(migrateStudioBg3dAssetMetadata({ ...base, version: 2 })).not.toBeNull();
    expect(normalizeStudioBg3dAssetMetadata({ ...base, format: "exe" })).toBeNull();
    expect(normalizeStudioBg3dAssetMetadata({ ...base, byteSize: Number.POSITIVE_INFINITY })).toBeNull();
    expect(normalizeStudioBg3dAssetMetadata({ ...base, updatedAt: 99 })).toBeNull();
    expect(normalizeStudioBg3dAssetMetadata({
      ...base,
      collections: [{ id: "__proto__", name: "위험" }],
    })).toBeNull();
    expect(normalizeStudioBg3dAssetMetadata({
      ...base,
      tags: Array.from({ length: STUDIO_BG3D_ASSET_METADATA_LIMITS.tags + 1 }, (_, index) => `태그 ${index}`),
    })).toBeNull();
    expect(normalizeStudioBg3dAssetMetadata({
      ...base,
      name: "가".repeat(STUDIO_BG3D_ASSET_METADATA_LIMITS.nameCodePoints + 1),
    })).toBeNull();
  });

  it("strips hostile receipt fields by downgrading all privileges instead of persisting a URL or secret", () => {
    const hostile = normalizeStudioBg3dAssetMetadata({
      ...metadata(HASH_A),
      rights: {
        status: "licensed",
        commercialUse: true,
        teamShareAllowed: true,
        provider: "Model Store",
        license: "https://assets.invalid/license?access_token=secret",
        purchaseOrDownloadDate: "2026-02-30",
      },
      downloadUrl: "https://assets.invalid/model.glb",
      apiKey: "sk-not-persisted-value",
    });

    expect(hostile?.rights).toEqual(DEFAULT_STUDIO_BG3D_ASSET_RIGHTS);
    expect(JSON.stringify(hostile)).not.toContain("https://");
    expect(JSON.stringify(hostile)).not.toContain("access_token");
    expect(JSON.stringify(hostile)).not.toContain("sk-not-persisted");
  });

  it("defaults every missing, unknown, or malformed team-share claim to denied", () => {
    expect(metadata(HASH_A, { rights: undefined }).rights.teamShareAllowed).toBe(false);
    expect(metadata(HASH_B, {
      rights: { status: "unknown", commercialUse: true, teamShareAllowed: true },
    }).rights).toEqual(DEFAULT_STUDIO_BG3D_ASSET_RIGHTS);
    expect(metadata(HASH_C, {
      rights: { status: "licensed", commercialUse: true, teamShareAllowed: true },
    }).rights).toEqual(DEFAULT_STUDIO_BG3D_ASSET_RIGHTS);
    expect(metadata(HASH_D, {
      rights: {
        status: "owned",
        commercialUse: true,
        provider: "직접 제작",
      },
    }).rights.teamShareAllowed).toBe(false);
  });

  it("deduplicates identical hashes but removes conflicting metadata for the same binary", () => {
    const first = metadata(HASH_A, { name: "같은 모델" });
    const conflicting = metadata(HASH_A, { name: "권리 충돌", favorite: true });
    const unique = metadata(HASH_B);

    expect(normalizeStudioBg3dAssetMetadataCollection([first, first, unique])).toEqual([first, unique]);
    expect(normalizeStudioBg3dAssetMetadataCollection([first, conflicting, unique])).toEqual([unique]);
    expect(Object.isFrozen(normalizeStudioBg3dAssetMetadataCollection([unique]))).toBe(true);
  });
});

describe("studio BG3D asset search, facets, and stable sorting", () => {
  const hanok = metadata(HASH_A, {
    name: "전통 한옥 찻집",
    format: "glb",
    updatedAt: 400,
    byteSize: 8_000,
    triangles: 900,
    textures: 8,
    favorite: true,
    collections: [{ id: "architecture", name: "한국 건축" }],
    tags: ["한옥", "야간"],
    rights: {
      status: "licensed",
      commercialUse: true,
      teamShareAllowed: false,
      license: "Commercial Standard",
      author: "김모델",
    },
  });
  const school = metadata(HASH_B, {
    name: "학교 교실",
    format: "obj",
    updatedAt: 300,
    byteSize: 4_000,
    triangles: 500,
    textures: 4,
    collections: [{ id: "school", name: "교육 시설" }],
    tags: ["실내", "낮"],
    rights: { status: "owned", commercialUse: true, teamShareAllowed: true },
  });
  const street = metadata(HASH_C, {
    name: "골목 거리",
    format: "fbx",
    updatedAt: 200,
    byteSize: 12_000,
    triangles: 1_500,
    textures: 12,
    favorite: true,
    collections: [{ id: "architecture", name: "한국 건축" }],
    tags: ["야외", "야간"],
    rights: DEFAULT_STUDIO_BG3D_ASSET_RIGHTS,
  });
  const unprofiled = metadata(HASH_D, {
    name: "미분석 소품",
    format: "glb",
    updatedAt: 100,
    byteSize: 500,
    triangles: null,
    textures: null,
    tags: ["소품"],
  });
  const assets = [street, school, hanok, unprofiled];

  it("matches composed Korean metadata with decomposed Korean search text", () => {
    const decomposedHanok = "한옥";
    const result = filterStudioBg3dAssetMetadata(assets, undefined, `${decomposedHanok} 김모델`);
    expect(result.map(({ contentHash }) => contentHash)).toEqual([HASH_A]);
  });

  it("intersects every facet while using OR inside multi-value format/tag/collection facets", () => {
    const result = filterStudioBg3dAssetMetadata(assets, {
      format: ["glb", "obj"],
      commercial: true,
      triangles: { min: 400, max: 1_000 },
      textures: { min: 2, max: 8 },
      bytes: { min: 1_000, max: 10_000 },
      tags: ["야간", "실내"],
      collection: ["architecture"],
      favorite: true,
    });

    expect(result.map(({ contentHash }) => contentHash)).toEqual([HASH_A]);
    expect(filterStudioBg3dAssetMetadata(assets, { triangles: { min: 0 } }))
      .not.toContainEqual(unprofiled);
  });

  it("fails closed for invalid facet values and ranges", () => {
    expect(filterStudioBg3dAssetMetadata(assets, {
      format: ["exe"],
    } as never)).toEqual([]);
    expect(filterStudioBg3dAssetMetadata(assets, { triangles: { min: 10, max: 1 } })).toEqual([]);
    expect(queryStudioBg3dAssetMetadata(assets, { sort: "random" } as never)).toEqual([]);
  });

  it("implements recent/name/bytes/triangles ordering and places unknown metrics last", () => {
    expect(sortStudioBg3dAssetMetadata(assets, "recent").map(({ contentHash }) => contentHash))
      .toEqual([HASH_A, HASH_B, HASH_C, HASH_D]);
    expect(sortStudioBg3dAssetMetadata(assets, "bytes").map(({ contentHash }) => contentHash))
      .toEqual([HASH_C, HASH_A, HASH_B, HASH_D]);
    expect(sortStudioBg3dAssetMetadata(assets, "triangles").map(({ contentHash }) => contentHash))
      .toEqual([HASH_C, HASH_A, HASH_B, HASH_D]);
    expect(sortStudioBg3dAssetMetadata(assets, "name").map(({ name }) => name))
      .toEqual(["골목 거리", "미분석 소품", "전통 한옥 찻집", "학교 교실"]);
  });

  it("uses original input order as the final stable tie-breaker without mutating the source", () => {
    const first = metadata(HASH_A, {
      name: "Same",
      createdAt: 5,
      updatedAt: 5,
      byteSize: 5,
      triangles: 5,
    });
    const second = metadata(HASH_B, {
      name: "same",
      createdAt: 5,
      updatedAt: 5,
      byteSize: 5,
      triangles: 5,
    });
    const source = Object.freeze([second, first]);

    for (const sort of ["recent", "name", "bytes", "triangles"] as const) {
      expect(sortStudioBg3dAssetMetadata(source, sort).map(({ contentHash }) => contentHash))
        .toEqual([HASH_B, HASH_A]);
    }
    expect(source).toEqual([second, first]);
  });

  it("combines Korean search, facets, and sorting into one immutable deterministic query", () => {
    const result = queryStudioBg3dAssetMetadata(assets, {
      search: "야간",
      facets: { favorite: true, collection: ["architecture"] },
      sort: "bytes",
    });

    expect(result.map(({ contentHash }) => contentHash)).toEqual([HASH_C, HASH_A]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.every((item) => Object.isFrozen(item))).toBe(true);
  });
});

describe("SketchUp import report in asset metadata", () => {
  function skpRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      version: STUDIO_BG3D_ASSET_METADATA_VERSION,
      contentHash: HASH_A,
      name: "방 모델",
      format: "skp",
      createdAt: 10,
      updatedAt: 10,
      byteSize: 2_048,
      triangles: 80,
      textures: 0,
      favorite: false,
      collections: [],
      tags: [],
      rights: { status: "owned", commercialUse: true, teamShareAllowed: false },
      skpImport: createSkpReportFixture(),
      ...overrides,
    };
  }

  it("accepts skp as an asset format, also as a search facet", () => {
    const record = normalizeStudioBg3dAssetMetadata(skpRecord());
    expect(record?.format).toBe("skp");
    expect(filterStudioBg3dAssetMetadata([record, metadata(HASH_B)], { format: ["skp"] }).map(({ contentHash }) => contentHash))
      .toEqual([HASH_A]);
  });

  it("keeps the validated report, deeply frozen, and normalizing it again changes nothing", () => {
    const record = normalizeStudioBg3dAssetMetadata(skpRecord());
    expect(record?.skpImport).toEqual(createSkpReportFixture());
    expect(Object.isFrozen(record?.skpImport)).toBe(true);
    expect(Object.isFrozen(record?.skpImport?.names)).toBe(true);
    expect(Object.isFrozen(record?.skpImport?.names.components.items)).toBe(true);
    // V12 저장소는 저장된 기록을 다시 정규화해 JSON 이 같은지 검사한다.
    expect(JSON.stringify(normalizeStudioBg3dAssetMetadata(record))).toBe(JSON.stringify(record));
  });

  it("does not add the field to records without a report, so existing rows are unchanged", () => {
    const plain = metadata(HASH_C);
    expect("skpImport" in plain).toBe(false);
    expect("skpImport" in (normalizeStudioBg3dAssetMetadata(skpRecord({ skpImport: undefined })) ?? {})).toBe(false);
  });

  it("drops a report that fails the report schema but keeps the rest of the record", () => {
    const broken = { ...createSkpReportFixture(), version: 2 };
    const missing = { ...createSkpReportFixture() } as Record<string, unknown>;
    delete missing.counts;
    for (const skpImport of [broken, missing, "not a report", 42, null]) {
      const record = normalizeStudioBg3dAssetMetadata(skpRecord({ skpImport }));
      expect(record).not.toBeNull();
      expect(record?.skpImport).toBeUndefined();
      expect(record?.name).toBe("방 모델");
    }
  });

  it("does not persist unknown report fields", () => {
    const record = normalizeStudioBg3dAssetMetadata(skpRecord({
      skpImport: { ...createSkpReportFixture(), sourcePath: "C:/Users/me/room.skp", token: "secret" },
    }));
    expect(JSON.stringify(record)).not.toContain("room.skp");
    expect(JSON.stringify(record)).not.toContain("secret");
  });

  it("filters hostile names and marks the list as shortened instead of rejecting the record", () => {
    const report = createSkpReportFixture({
      names: {
        components: { available: true, items: ["Chair", "<img src=x onerror=alert(1)>", "https://assets.invalid/chair"], total: 3, truncated: false },
        tags: { available: true, items: ["Layer0"], total: 1, truncated: false },
        scenes: { available: false, items: [], total: 0, truncated: false },
      },
      warnings: [{ code: "texture-missing", severity: "warning", count: 1, detail: "access_token=abc123" }],
    });
    const record = normalizeStudioBg3dAssetMetadata(skpRecord({ skpImport: report }));
    expect(record?.skpImport?.names.components).toEqual({ available: true, items: ["Chair"], total: 3, truncated: true });
    expect(record?.skpImport?.names.tags).toEqual({ available: true, items: ["Layer0"], total: 1, truncated: false });
    expect(record?.skpImport?.names.scenes.available).toBe(false);
    expect(record?.skpImport?.warnings).toEqual([{ code: "texture-missing", severity: "warning", count: 1, detail: null }]);
    expect(JSON.stringify(record)).not.toContain("onerror");
    expect(JSON.stringify(record)).not.toContain("https://");
    expect(JSON.stringify(record)).not.toContain("access_token");
    expect(JSON.stringify(normalizeStudioBg3dAssetMetadata(record))).toBe(JSON.stringify(record));
  });

  it("drops a report that is larger than the stored-report limit", () => {
    const longName = "가".repeat(STUDIO_BG3D_ASSET_METADATA_LIMITS.nameCodePoints);
    const items = Array.from({ length: 64 }, (_, index) => `${index % 10}${longName.slice(1)}`.slice(0, 160));
    const heavy = createSkpReportFixture({
      names: {
        components: { available: true, items, total: 64, truncated: false },
        tags: { available: true, items, total: 64, truncated: false },
        scenes: { available: true, items, total: 64, truncated: false },
      },
    });
    const record = normalizeStudioBg3dAssetMetadata(skpRecord({ skpImport: heavy }));
    expect(record).not.toBeNull();
    expect(record?.skpImport).toBeUndefined();

    // 같은 형태라도 이름이 몇 개뿐이면 한도 안이므로 그대로 저장된다(크기 때문에 버려졌음을 확인).
    const light = createSkpReportFixture({
      names: {
        components: { available: true, items: items.slice(0, 2), total: 2, truncated: false },
        tags: { available: true, items: items.slice(0, 2), total: 2, truncated: false },
        scenes: { available: true, items: items.slice(0, 2), total: 2, truncated: false },
      },
    });
    expect(normalizeStudioBg3dAssetMetadata(skpRecord({ skpImport: light }))?.skpImport).toBeDefined();
  });

  it("ignores a report on any other format and on migrated V1 rows", () => {
    expect(normalizeStudioBg3dAssetMetadata(skpRecord({ format: "glb" }))?.skpImport).toBeUndefined();
    const migrated = migrateStudioBg3dAssetMetadata({
      version: 1,
      contentHash: HASH_B,
      name: "Legacy Room",
      format: "skp",
      createdAt: 20,
      byteSize: 2_000,
      skpImport: createSkpReportFixture(),
    });
    expect(migrated).toMatchObject({ version: STUDIO_BG3D_ASSET_METADATA_VERSION, format: "skp" });
    expect(migrated?.skpImport).toBeUndefined();
  });

  it("keeps the report when a V2 skp row is read through the V3 migration", () => {
    const migrated = migrateStudioBg3dAssetMetadata(skpRecord({ version: 2 }));
    expect(migrated).toMatchObject({ version: STUDIO_BG3D_ASSET_METADATA_VERSION, format: "skp" });
    expect(migrated?.skpImport).toEqual(createSkpReportFixture());
  });
});

describe("AI use disclosure in the rights receipt (V3)", () => {
  const licensedRights = {
    status: "licensed",
    commercialUse: true,
    teamShareAllowed: false,
    provider: "ACON 3D",
    license: "상업용 표준",
  };

  function rawRecord(version: number, rights: unknown): Record<string, unknown> {
    return {
      version,
      contentHash: HASH_A,
      name: "옛 기록",
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
    };
  }

  it("reads V1 and V2 rows without error and reports the AI use as unconfirmed (field absent)", () => {
    for (const version of [1, 2]) {
      const migrated = migrateStudioBg3dAssetMetadata(rawRecord(version, licensedRights));
      expect(migrated).not.toBeNull();
      expect(migrated?.version).toBe(STUDIO_BG3D_ASSET_METADATA_VERSION);
      expect(migrated?.rights.status).toBe("licensed");
      expect("aiGenerated" in (migrated?.rights ?? {})).toBe(false);
      expect("aiTraining" in (migrated?.rights ?? {})).toBe(false);
    }
  });

  it("ignores AI fields on legacy versions instead of trusting a record that predates the contract", () => {
    const migrated = migrateStudioBg3dAssetMetadata(
      rawRecord(2, { ...licensedRights, aiGenerated: "no", aiTraining: "allowed" }),
    );
    expect(migrated?.rights).toEqual({
      status: "licensed",
      commercialUse: true,
      teamShareAllowed: false,
      provider: "ACON 3D",
      license: "상업용 표준",
    });
  });

  it("stores explicit AI answers in canonical order, frozen, and round-trips byte for byte", () => {
    const record = normalizeStudioBg3dAssetMetadata(
      rawRecord(STUDIO_BG3D_ASSET_METADATA_VERSION, {
        aiTraining: "prohibited",
        aiGenerated: "yes",
        ...licensedRights,
      }),
    );
    expect(Object.keys(record?.rights ?? {})).toEqual([
      "status", "commercialUse", "teamShareAllowed", "provider", "license", "aiGenerated", "aiTraining",
    ]);
    expect(record?.rights).toMatchObject({ aiGenerated: "yes", aiTraining: "prohibited" });
    expect(Object.isFrozen(record?.rights)).toBe(true);
    expect(JSON.stringify(normalizeStudioBg3dAssetMetadata(record))).toBe(JSON.stringify(record));
    expect(JSON.stringify(migrateStudioBg3dAssetMetadata(JSON.parse(JSON.stringify(record))))).toBe(JSON.stringify(record));
  });

  it("omits the unknown literal and absent answers so old and new unconfirmed rows serialize identically", () => {
    const explicit = normalizeStudioBg3dAssetMetadata(rawRecord(
      STUDIO_BG3D_ASSET_METADATA_VERSION,
      { ...licensedRights, aiGenerated: "unknown", aiTraining: "unknown" },
    ));
    const absent = normalizeStudioBg3dAssetMetadata(rawRecord(STUDIO_BG3D_ASSET_METADATA_VERSION, licensedRights));
    expect(JSON.stringify(explicit)).toBe(JSON.stringify(absent));
    expect("aiGenerated" in (explicit?.rights ?? {})).toBe(false);
  });

  it("keeps an AI answer even while the license itself is unconfirmed, without granting any privilege", () => {
    const record = normalizeStudioBg3dAssetMetadata(rawRecord(STUDIO_BG3D_ASSET_METADATA_VERSION, {
      status: "unknown",
      commercialUse: true,
      teamShareAllowed: true,
      aiGenerated: "yes",
    }));
    expect(record?.rights).toEqual({
      status: "unknown",
      commercialUse: false,
      teamShareAllowed: false,
      aiGenerated: "yes",
    });
    expect(record?.rights).not.toBe(DEFAULT_STUDIO_BG3D_ASSET_RIGHTS);
  });

  it("keeps valid AI answers when another receipt field is rejected, while the permissions are still downgraded", () => {
    const record = normalizeStudioBg3dAssetMetadata(rawRecord(STUDIO_BG3D_ASSET_METADATA_VERSION, {
      status: "licensed",
      commercialUse: true,
      teamShareAllowed: true,
      license: "https://assets.invalid/license?access_token=secret",
      aiGenerated: "yes",
      aiTraining: "prohibited",
    }));
    expect(record?.rights).toEqual({
      status: "unknown",
      commercialUse: false,
      teamShareAllowed: false,
      aiGenerated: "yes",
      aiTraining: "prohibited",
    });
    expect(JSON.stringify(record)).not.toContain("access_token");
  });

  it("downgrades a receipt with an unrecognized AI answer instead of guessing", () => {
    for (const bad of [{ aiGenerated: "maybe" }, { aiGenerated: true }, { aiTraining: "yes" }, { aiTraining: null }]) {
      const record = normalizeStudioBg3dAssetMetadata(
        rawRecord(STUDIO_BG3D_ASSET_METADATA_VERSION, { ...licensedRights, ...bad }),
      );
      expect(record).not.toBeNull();
      expect(record?.rights).toEqual(DEFAULT_STUDIO_BG3D_ASSET_RIGHTS);
    }
  });
});
