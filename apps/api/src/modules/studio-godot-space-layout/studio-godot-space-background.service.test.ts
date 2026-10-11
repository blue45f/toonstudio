import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreatorService } from "../creator/creator.service";
import { StudioGodotSpaceBackgroundService } from "./studio-godot-space-background.service";

const boundary = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../../platform/database", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  return {
    ...actual,
    db: drizzle((query, parameters, method) => boundary.query(query, parameters, method)),
  };
});

function buildGlb(document: Record<string, unknown>): Buffer {
  const jsonText = JSON.stringify(document);
  const jsonPadded = jsonText + " ".repeat((4 - (jsonText.length % 4)) % 4);
  const jsonBuffer = Buffer.from(jsonPadded, "utf-8");
  const binBuffer = Buffer.alloc(16, 7);
  const totalLength = 12 + 8 + jsonBuffer.length + 8 + binBuffer.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonBuffer.length, 0);
  jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4);
  const binChunkHeader = Buffer.alloc(8);
  binChunkHeader.writeUInt32LE(binBuffer.length, 0);
  binChunkHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonChunkHeader, jsonBuffer, binChunkHeader, binBuffer]);
}

const VALID_GLB = buildGlb({
  asset: { version: "2.0" },
  meshes: [{ primitives: [] }],
  scenes: [{ nodes: [] }],
});

function viewerTeam(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "u1" },
    viewer: {
      userId: "u1",
      status: "active",
      capabilities: { view: true, edit: true },
      ...overrides,
    },
    members: [],
  };
}

function makeService(team: unknown) {
  const getWorkTeam = vi.fn().mockResolvedValue(team);
  const service = new StudioGodotSpaceBackgroundService(
    { getWorkTeam } as unknown as CreatorService,
  );
  return { service, getWorkTeam };
}

const CREATED = new Date("2026-10-12T00:00:00.000Z");
// pg-proxy 위치 배열 — 선언 순서: workId, assetId, fileName, byteSize,
// sha256, payload, uploadedByUserId, createdAt
function fullRow(assetId: string, fileName = "room.glb") {
  return [
    "work-1",
    assetId,
    fileName,
    VALID_GLB.byteLength,
    "a".repeat(64),
    VALID_GLB,
    "u1",
    CREATED,
  ];
}

beforeEach(() => {
  boundary.query.mockReset();
});

describe("authorization", () => {
  it("rejects anonymous upload before any query", async () => {
    const { service } = makeService(viewerTeam());
    await expect(
      service.upload(undefined, "work-1", { buffer: VALID_GLB }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(boundary.query).not.toHaveBeenCalled();
  });

  it("rejects a non-active member on list and remove", async () => {
    const { service } = makeService(viewerTeam({ status: "invited" }));
    await expect(service.list("u1", "work-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.remove("u1", "work-1", "00000000-0000-4000-8000-000000000000"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe("upload", () => {
  it("rejects a missing file with 400", async () => {
    const { service } = makeService(viewerTeam());
    await expect(service.upload("u1", "work-1", undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("rejects a non-GLB payload with 400", async () => {
    const { service } = makeService(viewerTeam());
    await expect(
      service.upload("u1", "work-1", { buffer: Buffer.from("definitely not a glb...") }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a meshopt-required GLB with the extension named", async () => {
    const { service } = makeService(viewerTeam());
    const glb = buildGlb({
      asset: { version: "2.0" },
      meshes: [{ primitives: [] }],
      extensionsUsed: ["EXT_meshopt_compression"],
      extensionsRequired: ["EXT_meshopt_compression"],
    });
    await expect(
      service.upload("u1", "work-1", { buffer: glb, originalname: "room-web.glb" }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof BadRequestException &&
        error.message.includes("EXT_meshopt_compression"),
    );
    expect(boundary.query).not.toHaveBeenCalled();
  });

  it("stores a valid GLB and returns the uploads/ reference", async () => {
    const { service } = makeService(viewerTeam());
    boundary.query.mockImplementation((sql: string) => {
      // insert ... returning — assetId는 서비스가 발급한 UUID가 파라미터에 있다
      if (sql.includes("insert into")) {
        return { rows: [fullRow("11111111-2222-4333-8444-555555555555", "my room.glb")] };
      }
      throw new Error(`unexpected query: ${sql}`);
    });

    const dto = await service.upload("u1", "work-1", {
      buffer: VALID_GLB,
      originalname: "my room.glb",
    });
    expect(dto.glbRef).toBe("uploads/11111111-2222-4333-8444-555555555555.glb");
    expect(dto.fileName).toBe("my room.glb");
    expect(dto.byteSize).toBe(VALID_GLB.byteLength);
    expect(dto.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(dto.createdAt).toBe("2026-10-12T00:00:00.000Z");
  });
});

describe("list and content", () => {
  it("lists metadata without payloads", async () => {
    const { service } = makeService(viewerTeam());
    boundary.query.mockResolvedValueOnce({
      rows: [
        ["work-1", "aaaaaaaa-0000-4000-8000-000000000000", "a.glb", 10, "b".repeat(64), "u1", CREATED],
      ],
    });
    const items = await service.list("u1", "work-1");
    expect(items).toHaveLength(1);
    expect(items[0].glbRef).toBe("uploads/aaaaaaaa-0000-4000-8000-000000000000.glb");
    const [sql] = boundary.query.mock.calls[0];
    expect(sql.toLowerCase()).not.toContain("payload");
  });

  it("serves stored content without an auth header (capability id)", async () => {
    const { service } = makeService(viewerTeam());
    boundary.query.mockResolvedValueOnce({
      rows: [fullRow("aaaaaaaa-0000-4000-8000-000000000000")],
    });
    const content = await service.getContent(
      "work-1",
      "aaaaaaaa-0000-4000-8000-000000000000",
    );
    expect(content.byteSize).toBe(VALID_GLB.byteLength);
    expect(content.payload.equals(VALID_GLB)).toBe(true);
  });

  it("404s content for an unknown asset", async () => {
    const { service } = makeService(viewerTeam());
    boundary.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      service.getContent("work-1", "aaaaaaaa-0000-4000-8000-000000000000"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("remove", () => {
  it("deletes an existing asset", async () => {
    const { service } = makeService(viewerTeam());
    boundary.query.mockResolvedValueOnce({
      rows: [["aaaaaaaa-0000-4000-8000-000000000000"]],
    });
    await expect(
      service.remove("u1", "work-1", "aaaaaaaa-0000-4000-8000-000000000000"),
    ).resolves.toEqual({ deleted: true });
  });

  it("404s when deleting an unknown asset", async () => {
    const { service } = makeService(viewerTeam());
    boundary.query.mockResolvedValueOnce({ rows: [] });
    await expect(
      service.remove("u1", "work-1", "aaaaaaaa-0000-4000-8000-000000000000"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
