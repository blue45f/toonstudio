// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStudioWorldAuthoringDraft,
  parseStudioWorldAuthoringImport,
  readStudioWorldAuthoringDraft,
  readStudioWorldAuthoringDraftRecord,
  studioWorldDraftStorageKey,
  studioWorldManifestToTiledMap,
  writeStudioWorldAuthoringDraft,
} from "./studio-virtual-space-world-authoring";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  validateStudioWorldManifest,
} from "./studio-virtual-space-world-manifest";
import { createSpaceDeviceRecordFixture } from "./studio-space-device-record.test-fixture";

const db = createSpaceDeviceRecordFixture();
vi.mock("../studio-local-database-runtime", () => ({ acquireStudioLocalDatabase: async () => db }));
beforeEach(() => { db.records.clear(); vi.clearAllMocks(); });


class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("Virtual Studio world authoring", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips the editable manifest through Tiled JSON", () => {
    const tiled = studioWorldManifestToTiledMap(DEFAULT_STUDIO_WORLD_MANIFEST);
    const restored = parseStudioWorldAuthoringImport(
      JSON.stringify(tiled),
      DEFAULT_STUDIO_WORLD_MANIFEST,
    );

    expect(validateStudioWorldManifest(restored)).toEqual([]);
    expect(restored).toMatchObject({
      id: DEFAULT_STUDIO_WORLD_MANIFEST.id,
      version: DEFAULT_STUDIO_WORLD_MANIFEST.version,
      width: DEFAULT_STUDIO_WORLD_MANIFEST.width,
      height: DEFAULT_STUDIO_WORLD_MANIFEST.height,
      backgroundUrl: DEFAULT_STUDIO_WORLD_MANIFEST.backgroundUrl,
    });
    expect(restored.rooms.map((room) => room.id)).toEqual(
      DEFAULT_STUDIO_WORLD_MANIFEST.rooms.map((room) => room.id),
    );
    expect(restored.props.map((prop) => prop.id)).toEqual(
      DEFAULT_STUDIO_WORLD_MANIFEST.props.map((prop) => prop.id),
    );
    expect(restored.colliders).toHaveLength(DEFAULT_STUDIO_WORLD_MANIFEST.colliders.length);
    expect(restored.occlusionLayers).toEqual(DEFAULT_STUDIO_WORLD_MANIFEST.occlusionLayers);
    expect(restored.npcActivityAnchors).toEqual(DEFAULT_STUDIO_WORLD_MANIFEST.npcActivityAnchors);
    expect(restored.acousticZones).toEqual(DEFAULT_STUDIO_WORLD_MANIFEST.acousticZones);
    expect(tiled).toMatchObject({
      width: DEFAULT_STUDIO_WORLD_MANIFEST.width,
      height: DEFAULT_STUDIO_WORLD_MANIFEST.height,
      tilewidth: 1,
      tileheight: 1,
    });
  });

  it("preserves explicit acoustic policies and never inherits missing acoustic access geometry", () => {
    const manifest = { ...DEFAULT_STUDIO_WORLD_MANIFEST, acousticZones: DEFAULT_STUDIO_WORLD_MANIFEST.acousticZones!.map((zone, index) =>
      index === 0 ? { ...zone, policy: "private" as const, doorId: "lounge-door" } : zone) };
    const tiled = studioWorldManifestToTiledMap(manifest);
    expect(parseStudioWorldAuthoringImport(JSON.stringify(tiled), manifest).acousticZones).toEqual(manifest.acousticZones);
    const layers = tiled.layers as { name: string; objects?: { properties?: { name: string; value: unknown }[] }[] }[];
    const missing = { ...tiled, layers: layers.filter((layer) => layer.name !== "acoustic-zones") };
    expect(parseStudioWorldAuthoringImport(JSON.stringify(missing), manifest).acousticZones).toEqual([]);
    const malformed = { ...tiled, layers: layers.map((layer) => layer.name === "acoustic-zones"
      ? { ...layer, objects: layer.objects?.map((object) => ({ ...object, properties: object.properties?.filter((property) => property.name !== "policy") })) } : layer) };
    expect(() => parseStudioWorldAuthoringImport(JSON.stringify(malformed), manifest)).toThrow(/acoustic zone/iu);
  });

  it("exports odd integer pixel dimensions as valid integer Tiled dimensions", () => {
    const manifest = { ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 869, height: 813 };
    const tiled = studioWorldManifestToTiledMap(manifest);
    expect(tiled).toMatchObject({ width: 869, height: 813, tilewidth: 1, tileheight: 1 });
    expect(validateStudioWorldManifest({ ...manifest, width: 869.5 })).toContain(
      "world dimensions must be integer pixels between 32 and 10000",
    );
  });

  it("persists a valid project-scoped browser draft and clears it", async () => {
    const projectId = "authoring-demo";
    const manifest = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      version: DEFAULT_STUDIO_WORLD_MANIFEST.version + 1,
      rooms: DEFAULT_STUDIO_WORLD_MANIFEST.rooms.map((room, index) =>
        index === 0 ? { ...room, labelEn: "Edited Lounge" } : room
      ),
    };

    expect(await writeStudioWorldAuthoringDraft(projectId, manifest)).toBe(true);
    expect(db.records.has(studioWorldDraftStorageKey(projectId))).toBe(true);
    expect(localStorage.getItem(studioWorldDraftStorageKey(projectId))).toBeNull();
    const restored = await readStudioWorldAuthoringDraft(projectId);
    expect(restored?.version).toBe(manifest.version);
    expect(restored?.rooms[0]).toMatchObject({ labelEn: "Edited Lounge" });

    await clearStudioWorldAuthoringDraft(projectId);
    expect(await readStudioWorldAuthoringDraft(projectId)).toBeNull();
  });

  it("does not persist invalid drafts", async () => {
    const invalid = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      rooms: [],
    };

    expect(await writeStudioWorldAuthoringDraft("bad-world", invalid)).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it("preserves the exact publication origin across remounts and never guesses a legacy draft base", async () => {
    expect(await writeStudioWorldAuthoringDraft("pinned-draft", DEFAULT_STUDIO_WORLD_MANIFEST, "published-A")).toBe(true);
    expect(await readStudioWorldAuthoringDraftRecord("pinned-draft")).toEqual({ manifest: DEFAULT_STUDIO_WORLD_MANIFEST, basePublishedRevisionId: "published-A" });
    expect(await writeStudioWorldAuthoringDraft("unpublished-draft", DEFAULT_STUDIO_WORLD_MANIFEST, null)).toBe(true);
    expect((await readStudioWorldAuthoringDraftRecord("unpublished-draft"))?.basePublishedRevisionId).toBeNull();
    localStorage.setItem(studioWorldDraftStorageKey("legacy-draft"), JSON.stringify(DEFAULT_STUDIO_WORLD_MANIFEST));
    expect(await readStudioWorldAuthoringDraftRecord("legacy-draft")).toEqual({ manifest: DEFAULT_STUDIO_WORLD_MANIFEST });
    expect(await writeStudioWorldAuthoringDraft("legacy-draft", DEFAULT_STUDIO_WORLD_MANIFEST)).toBe(true);
    expect((await readStudioWorldAuthoringDraftRecord("legacy-draft"))?.basePublishedRevisionId).toBeUndefined();
  });

  it("rejects malformed persisted origin data without discarding another project's draft", async () => {
    await writeStudioWorldAuthoringDraft("valid-base", DEFAULT_STUDIO_WORLD_MANIFEST, "published-A");
    localStorage.setItem(studioWorldDraftStorageKey("bad-base"), JSON.stringify({ contract: "studio-world-browser-draft-v2", manifest: DEFAULT_STUDIO_WORLD_MANIFEST, basePublishedRevisionId: 123 }));
    expect(await readStudioWorldAuthoringDraftRecord("bad-base")).toBeNull();
    expect((await readStudioWorldAuthoringDraftRecord("valid-base"))?.basePublishedRevisionId).toBe("published-A");
  });

  it("does not persist a draft that would hide the editor behind an unsafe world", async () => {
    const invalid = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      props: [],
      colliders: [{
        x: 0,
        y: 0,
        width: DEFAULT_STUDIO_WORLD_MANIFEST.width,
        height: DEFAULT_STUDIO_WORLD_MANIFEST.height,
      }],
    };

    expect(await writeStudioWorldAuthoringDraft("blocked-world", invalid)).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it("accepts a direct manifest import and rejects unsupported JSON", () => {
    const imported = parseStudioWorldAuthoringImport(
      JSON.stringify(DEFAULT_STUDIO_WORLD_MANIFEST),
      DEFAULT_STUDIO_WORLD_MANIFEST,
    );
    expect(imported.id).toBe(DEFAULT_STUDIO_WORLD_MANIFEST.id);

    expect(() => parseStudioWorldAuthoringImport(
      JSON.stringify({ nope: true }),
      DEFAULT_STUDIO_WORLD_MANIFEST,
    )).toThrow("Unsupported world JSON format");
  });
  it("clears only the requested project's draft", async () => {
    expect(await writeStudioWorldAuthoringDraft("project-a", DEFAULT_STUDIO_WORLD_MANIFEST)).toBe(true);
    expect(await writeStudioWorldAuthoringDraft("project-b", DEFAULT_STUDIO_WORLD_MANIFEST)).toBe(true);
    await clearStudioWorldAuthoringDraft("project-a");
    expect(await readStudioWorldAuthoringDraft("project-a")).toBeNull();
    expect(await readStudioWorldAuthoringDraft("project-b")).toEqual(DEFAULT_STUDIO_WORLD_MANIFEST);
  });
  it("reports blocked browser writes and rejects corrupt stored JSON", async () => {
    localStorage.setItem(studioWorldDraftStorageKey("corrupt"), "{");
    expect(await readStudioWorldAuthoringDraft("corrupt")).toBeNull();
    db.kvSet.mockRejectedValueOnce(new Error("quota"));
    expect(await writeStudioWorldAuthoringDraft("blocked", DEFAULT_STUDIO_WORLD_MANIFEST)).toBe(false);
    expect(await readStudioWorldAuthoringDraft("blocked")).toBeNull();
  });


  it("rejects direct JSON with missing required interaction and portal fields", () => {
    const malformed = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      interactions: [{
        id: "missing-interaction-fields",
        zoneId: DEFAULT_STUDIO_WORLD_MANIFEST.rooms[0]!.id,
      }],
      portals: [{
        id: "missing-portal-radius",
        point: { x: 420, y: 520 },
        targetPoint: { x: 430, y: 530 },
      }],
    };

    expect(() => parseStudioWorldAuthoringImport(
      JSON.stringify(malformed),
      DEFAULT_STUDIO_WORLD_MANIFEST,
    )).toThrow(/interaction geometry is invalid|interaction action is invalid/u);
    expect(() => parseStudioWorldAuthoringImport(
      JSON.stringify({ ...malformed, interactions: DEFAULT_STUDIO_WORLD_MANIFEST.interactions }),
      DEFAULT_STUDIO_WORLD_MANIFEST,
    )).toThrow(/portal geometry is invalid/u);
  });

  it("rejects direct JSON whose required entity id is missing", () => {
    const [firstRoom, ...remainingRooms] = DEFAULT_STUDIO_WORLD_MANIFEST.rooms;
    const malformed = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      rooms: [{ ...firstRoom, id: undefined }, ...remainingRooms],
    };

    expect(() => parseStudioWorldAuthoringImport(
      JSON.stringify(malformed),
      DEFAULT_STUDIO_WORLD_MANIFEST,
    )).toThrow(/invalid room id/u);
  });
});

it("같은 작품의 두 계정과 구 기기 초안을 격리하고 손상된 원본도 보존한다", async () => {
  const session = await import("@/domains/auth/public/session/auth-session-state");
  let actor: string | null = "alice";
  const current = vi.spyOn(session, "getAuthUserId").mockImplementation(() => actor);
  const project = "shared-work";
  const key = studioWorldDraftStorageKey(project);
  localStorage.setItem(key, JSON.stringify(DEFAULT_STUDIO_WORLD_MANIFEST));
  try {
    expect(await readStudioWorldAuthoringDraft(project)).toBeNull();
    const privateWorld = { ...DEFAULT_STUDIO_WORLD_MANIFEST, id: "alice-world" };
    expect(await writeStudioWorldAuthoringDraft(project, privateWorld)).toBe(true);
    actor = "bob";
    expect(await readStudioWorldAuthoringDraft(project)).toBeNull();
    actor = "alice";
    expect(await readStudioWorldAuthoringDraft(project)).toEqual(privateWorld);
    const delayed = Promise.withResolvers<string | null>();
    db.kvGet.mockReturnValueOnce(delayed.promise);
    const stale = writeStudioWorldAuthoringDraft(project, { ...privateWorld, id: "stale" });
    await vi.waitFor(() => expect(db.kvGet.mock.results.some(result => result.value === delayed.promise)).toBe(true));
    actor = "bob";
    delayed.resolve(null);
    expect(await stale).toBe(false);
    actor = null;
    expect(await readStudioWorldAuthoringDraft(project)).toEqual(DEFAULT_STUDIO_WORLD_MANIFEST);
    expect(await clearStudioWorldAuthoringDraft(project)).toBe(true);
    expect(await readStudioWorldAuthoringDraft(project)).toBeNull();
    const corrupt = studioWorldDraftStorageKey("damaged");
    localStorage.setItem(corrupt, "broken");
    expect(await writeStudioWorldAuthoringDraft("damaged", privateWorld)).toBe(true);
    expect([...db.records].some(([id, value]) => id.startsWith(corrupt + ":recovery:") && JSON.parse(value) === "broken")).toBe(true);
  } finally { current.mockRestore(); localStorage.clear(); }
});
