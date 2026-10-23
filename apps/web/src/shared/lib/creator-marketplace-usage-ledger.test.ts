import { describe, expect, it } from "vitest";

import type { CreatorMarketplaceResourceRecord } from "./creator-marketplace-resource-contract";

import {
  analyzeCreatorMarketplaceAssetChangeImpact,
  createCreatorMarketplaceUsageLedger,
  creatorMarketplaceUsageEntryFromRecord,
  describeCreatorMarketplaceAssetChangeImpact,
  parseCreatorMarketplaceUsageLedger,
  readCreatorMarketplaceUsageLedgerJson,
  recordCreatorMarketplaceUsage,
  removeCreatorMarketplaceUsage,
  serializeCreatorMarketplaceUsageLedger,
  type CreatorMarketplaceUsageLedger,
} from "./creator-marketplace-usage-ledger";

const UUID_PREFIX = ["123e4567", "e89b", "42d3", "a456", "4266141740"].join("-");
const RELEASE_V1 = `${UUID_PREFIX}01`;
const RELEASE_V2 = `${UUID_PREFIX}02`;
const PUBLISHER_ID = `${UUID_PREFIX}03`;

function record(
  overrides: Partial<CreatorMarketplaceResourceRecord> = {},
): CreatorMarketplaceResourceRecord {
  return {
    schemaVersion: 1,
    id: RELEASE_V1,
    packageId: "test/brush/inking",
    name: "테스트 잉킹 브러시",
    description: "",
    kind: "brush",
    resourceVersion: "1.0.0",
    minimumStudioVersion: "0.1.0",
    tags: [],
    license: "toonspectrum-standard",
    attributionText: "",
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [],
    manifestHash: "1".repeat(64),
    manifestByteSize: 200,
    publisher: { id: PUBLISHER_ID, name: "테스트 제작자", avatar: null },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    isOwner: false,
    access: "free",
    ...overrides,
  } as CreatorMarketplaceResourceRecord;
}

const headRecord = record({
  id: RELEASE_V2,
  resourceVersion: "1.1.0",
  manifestHash: "2".repeat(64),
});

function ledgerWith(
  projectId: string,
  source: CreatorMarketplaceResourceRecord,
  locationId: string,
  usedAt = 1_000,
): CreatorMarketplaceUsageLedger {
  return recordCreatorMarketplaceUsage(
    createCreatorMarketplaceUsageLedger(projectId),
    creatorMarketplaceUsageEntryFromRecord(
      source,
      { locationId, locationKind: "tool-slot", episodeId: "ep-1" },
      usedAt,
    ),
  );
}

describe("Creator Market project asset usage ledger", () => {
  it("pins the release version and manifest hash at use time", () => {
    const ledger = ledgerWith("project-a", record(), "slot-1");
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0]).toMatchObject({
      releaseId: RELEASE_V1,
      resourceVersion: "1.0.0",
      manifestHash: "1".repeat(64),
      locationId: "slot-1",
      episodeId: "ep-1",
    });
    expect(ledger.entries[0]!.logicalPackId).toMatch(/^community:[0-9a-f]{64}$/u);
  });

  it("touches lastUsedAt for the same release and re-pins only on explicit new release at the same location", () => {
    const first = ledgerWith("project-a", record(), "slot-1", 1_000);
    const touched = recordCreatorMarketplaceUsage(
      first,
      creatorMarketplaceUsageEntryFromRecord(
        record(),
        { locationId: "slot-1", locationKind: "tool-slot" },
        2_000,
      ),
    );
    expect(touched.entries).toHaveLength(1);
    expect(touched.entries[0]).toMatchObject({ firstUsedAt: 1_000, lastUsedAt: 2_000 });

    const repinned = recordCreatorMarketplaceUsage(
      touched,
      creatorMarketplaceUsageEntryFromRecord(
        headRecord,
        { locationId: "slot-1", locationKind: "tool-slot" },
        3_000,
      ),
    );
    expect(repinned.entries).toHaveLength(1);
    expect(repinned.entries[0]).toMatchObject({
      releaseId: RELEASE_V2,
      resourceVersion: "1.1.0",
      firstUsedAt: 1_000,
      lastUsedAt: 3_000,
    });
    // The previous ledger value is untouched (immutable update).
    expect(first.entries[0]!.resourceVersion).toBe("1.0.0");
  });

  it("roundtrips through JSON and rejects tampered or duplicated entries", () => {
    const ledger = ledgerWith("project-a", record(), "slot-1");
    const json = serializeCreatorMarketplaceUsageLedger(ledger);
    expect(json).not.toBeNull();
    expect(readCreatorMarketplaceUsageLedgerJson(json)).toEqual(ledger);
    expect(parseCreatorMarketplaceUsageLedger(JSON.parse(json!))).toEqual(ledger);

    const tamperedVersion = JSON.parse(json!) as { entries: Array<{ resourceVersion: string }> };
    tamperedVersion.entries[0]!.resourceVersion = "not-a-version";
    expect(parseCreatorMarketplaceUsageLedger(tamperedVersion)).toBeNull();

    const duplicated = JSON.parse(json!) as { entries: unknown[] };
    duplicated.entries.push(duplicated.entries[0]);
    expect(parseCreatorMarketplaceUsageLedger(duplicated)).toBeNull();

    const unknownKey = JSON.parse(json!) as Record<string, unknown>;
    unknownKey.extra = true;
    expect(parseCreatorMarketplaceUsageLedger(unknownKey)).toBeNull();
    expect(readCreatorMarketplaceUsageLedgerJson("{broken")).toBeNull();
  });

  it("removes one location, or every usage of a pack when no location is given", () => {
    let ledger = ledgerWith("project-a", record(), "slot-1");
    ledger = recordCreatorMarketplaceUsage(
      ledger,
      creatorMarketplaceUsageEntryFromRecord(
        record(),
        { locationId: "slot-2", locationKind: "tool-slot" },
        2_000,
      ),
    );
    const packId = ledger.entries[0]!.logicalPackId;
    const oneLeft = removeCreatorMarketplaceUsage(ledger, packId, "slot-1");
    expect(oneLeft.entries.map((entry) => entry.locationId)).toEqual(["slot-2"]);
    expect(removeCreatorMarketplaceUsage(oneLeft, packId).entries).toHaveLength(0);
    expect(removeCreatorMarketplaceUsage(oneLeft, "community:" + "0".repeat(64)))
      .toBe(oneLeft);
  });
});

describe("analyzeCreatorMarketplaceAssetChangeImpact", () => {
  const packIdOf = (ledger: CreatorMarketplaceUsageLedger) =>
    ledger.entries[0]!.logicalPackId;

  it("reports deletion impact across projects before the asset is delisted", () => {
    const a = ledgerWith("project-a", record(), "slot-1");
    const b = ledgerWith("project-b", record(), "slot-9");
    const impact = analyzeCreatorMarketplaceAssetChangeImpact([a, b], {
      type: "package-delisted",
      logicalPackId: packIdOf(a),
    });
    expect(impact.affectedProjectCount).toBe(2);
    expect(impact.totalUsageCount).toBe(2);
    expect(impact.blockingProjectCount).toBe(2);
    expect(impact.projects.map((project) => project.projectId))
      .toEqual(["project-a", "project-b"]);
    expect(describeCreatorMarketplaceAssetChangeImpact(impact))
      .toContain("다시 받거나 협업자에게 공유할 수 없어요");
  });

  it("scopes release delisting to projects pinned to that exact release", () => {
    const pinnedOld = ledgerWith("project-a", record(), "slot-1");
    const pinnedNew = ledgerWith("project-b", headRecord, "slot-1");
    const impact = analyzeCreatorMarketplaceAssetChangeImpact(
      [pinnedOld, pinnedNew],
      { type: "release-delisted", logicalPackId: packIdOf(pinnedOld), releaseId: RELEASE_V1 },
    );
    expect(impact.projects.map((project) => project.projectId)).toEqual(["project-a"]);
    expect(impact.projects[0]!.pinnedVersions).toEqual(["1.0.0"]);
  });

  it("treats a new release as a notice: pinned projects keep their version", () => {
    const pinnedOld = ledgerWith("project-a", record(), "slot-1");
    const impact = analyzeCreatorMarketplaceAssetChangeImpact([pinnedOld], {
      type: "new-release",
      logicalPackId: packIdOf(pinnedOld),
      releaseId: RELEASE_V2,
      resourceVersion: "1.1.0",
      manifestHash: "2".repeat(64),
    });
    expect(impact.blockingProjectCount).toBe(0);
    expect(impact.projects[0]!.severity).toBe("notice");
    expect(describeCreatorMarketplaceAssetChangeImpact(impact))
      .toContain("그대로 유지해요");
  });

  it("flags a same-release hash change as blocking and ignores unrelated packs", () => {
    const pinnedOld = ledgerWith("project-a", record(), "slot-1");
    const impact = analyzeCreatorMarketplaceAssetChangeImpact([pinnedOld], {
      type: "new-release",
      logicalPackId: packIdOf(pinnedOld),
      releaseId: RELEASE_V1,
      resourceVersion: "1.0.0",
      manifestHash: "9".repeat(64),
    });
    expect(impact.projects[0]!.severity).toBe("blocking");

    const unrelated = analyzeCreatorMarketplaceAssetChangeImpact([pinnedOld], {
      type: "package-delisted",
      logicalPackId: "community:" + "0".repeat(64),
    });
    expect(unrelated.affectedProjectCount).toBe(0);
    expect(describeCreatorMarketplaceAssetChangeImpact(unrelated))
      .toContain("영향 없이 진행할 수 있어요");
  });

  it("rejects a new-release change whose version is not SemVer", () => {
    const pinnedOld = ledgerWith("project-a", record(), "slot-1");
    expect(() => analyzeCreatorMarketplaceAssetChangeImpact([pinnedOld], {
      type: "new-release",
      logicalPackId: packIdOf(pinnedOld),
      releaseId: RELEASE_V2,
      resourceVersion: "latest",
      manifestHash: "2".repeat(64),
    })).toThrow(TypeError);
  });
});
