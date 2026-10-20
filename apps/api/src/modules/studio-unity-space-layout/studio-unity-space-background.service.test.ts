import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreatorService } from "../creator/creator.service";
import {
  UNITY_SPACE_BACKGROUND_MAX_ASSETS_PER_WORK,
  UNITY_SPACE_BACKGROUND_MAX_TOTAL_BYTES_PER_WORK,
} from "./studio-unity-background-glb";
import { StudioUnitySpaceBackgroundService } from "./studio-unity-space-background.service";

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
  const service = new StudioUnitySpaceBackgroundService(
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

// 협업 역할 정책(creator-collaboration.policy)에서 edit 권한이 없는 읽기 전용 역할이다.
const READ_ONLY_ROLES: ReadonlyArray<
  readonly [role: string, capabilities: Readonly<Record<string, boolean>>]
> = [
  ["viewer", { view: true, comment: false, edit: false, manageMembers: false }],
  ["commenter", { view: true, comment: true, edit: false, manageMembers: false }],
];

describe("write authorization (읽기 전용 협업 역할은 배경 자산을 바꿀 수 없다)", () => {
  it.each(READ_ONLY_ROLES)(
    "%s 역할의 업로드는 DB 에 닿기 전에 403 으로 막힌다",
    async (_role, capabilities) => {
      const { service } = makeService(viewerTeam({ capabilities }));
      await expect(
        service.upload("u1", "work-1", { buffer: VALID_GLB, originalname: "room.glb" }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(boundary.query).not.toHaveBeenCalled();
    },
  );

  it.each(READ_ONLY_ROLES)(
    "%s 역할의 삭제는 DB 에 닿기 전에 403 으로 막힌다",
    async (_role, capabilities) => {
      const { service } = makeService(viewerTeam({ capabilities }));
      await expect(
        service.remove("u1", "work-1", "aaaaaaaa-0000-4000-8000-000000000000"),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(boundary.query).not.toHaveBeenCalled();
    },
  );

  it.each(READ_ONLY_ROLES)(
    "%s 역할도 배경 목록은 볼 수 있다",
    async (_role, capabilities) => {
      const { service } = makeService(viewerTeam({ capabilities }));
      boundary.query.mockResolvedValueOnce({
        rows: [
          ["work-1", "aaaaaaaa-0000-4000-8000-000000000000", "a.glb", 10, "b".repeat(64), "u1", CREATED],
        ],
      });
      await expect(service.list("u1", "work-1")).resolves.toHaveLength(1);
    },
  );
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
      // 작품별 보관량 조회(개수·총 용량) — 한도 안이다
      if (sql.includes("count(")) return { rows: [[0, "0"]] };
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

describe("upload quota (작품당 배경 보관 상한)", () => {
  const STORED_ID = "11111111-2222-4333-8444-555555555555";

  function stubStored(count: number, bytes: number) {
    boundary.query.mockImplementation((sql: string) => {
      if (sql.includes("count(")) return { rows: [[count, String(bytes)]] };
      if (sql.includes("insert into")) return { rows: [fullRow(STORED_ID)] };
      throw new Error(`unexpected query: ${sql}`);
    });
  }

  function insertCount(): number {
    return boundary.query.mock.calls.filter(([sql]) => String(sql).includes("insert into")).length;
  }

  it("개수 상한에 닿으면 413 으로 거절하고 아무것도 저장하지 않는다", async () => {
    const { service } = makeService(viewerTeam());
    stubStored(UNITY_SPACE_BACKGROUND_MAX_ASSETS_PER_WORK, 1024);
    await expect(
      service.upload("u1", "work-1", { buffer: VALID_GLB, originalname: "room.glb" }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(insertCount()).toBe(0);
  });

  it("총 용량 상한을 넘기는 업로드는 413 으로 거절한다", async () => {
    const { service } = makeService(viewerTeam());
    stubStored(
      1,
      UNITY_SPACE_BACKGROUND_MAX_TOTAL_BYTES_PER_WORK - VALID_GLB.byteLength + 1,
    );
    await expect(
      service.upload("u1", "work-1", { buffer: VALID_GLB }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
    expect(insertCount()).toBe(0);
  });

  it("상한 직전까지는 저장한다(개수 상한-1, 총 용량이 정확히 상한과 같아지는 경우)", async () => {
    const { service } = makeService(viewerTeam());
    stubStored(
      UNITY_SPACE_BACKGROUND_MAX_ASSETS_PER_WORK - 1,
      UNITY_SPACE_BACKGROUND_MAX_TOTAL_BYTES_PER_WORK - VALID_GLB.byteLength,
    );
    await expect(
      service.upload("u1", "work-1", { buffer: VALID_GLB, originalname: "room.glb" }),
    ).resolves.toMatchObject({ assetId: STORED_ID });
    expect(insertCount()).toBe(1);
  });

  it("보관량은 요청한 작품(workId)만 센다", async () => {
    const { service } = makeService(viewerTeam());
    stubStored(0, 0);
    await service.upload("u1", "work-1", { buffer: VALID_GLB });
    const usageCall = boundary.query.mock.calls.find(([sql]) => String(sql).includes("count("));
    expect(usageCall?.[1]).toEqual(["work-1"]);
  });

  it("거절 사유가 올바른 형식 검증(400)보다 먼저 보이지 않는다(형식 오류는 그대로 400)", async () => {
    const { service } = makeService(viewerTeam());
    stubStored(UNITY_SPACE_BACKGROUND_MAX_ASSETS_PER_WORK, 0);
    await expect(
      service.upload("u1", "work-1", { buffer: Buffer.from("definitely not a glb...") }),
    ).rejects.toBeInstanceOf(BadRequestException);
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
