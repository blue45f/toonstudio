import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CreatorService } from "../creator/creator.service";
import {
  UnitySpaceDefinitionSchema,
  UnitySpaceLayoutParamsSchema,
  SaveUnitySpaceLayoutBodySchema,
} from "./studio-unity-space-layout.dto";
import { StudioUnitySpaceLayoutService } from "./studio-unity-space-layout.service";

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

const definition = {
  v: 1 as const,
  id: "street",
  name: "거리",
  size: [2400, 1200] as [number, number],
  zones: [
    { id: "plaza", kind: "meeting" as const, name: "광장", rect: [780, 310, 840, 460] as [number, number, number, number] },
  ],
  props: [
    { kind: "bench" as const, rect: [900, 800, 120, 48] as [number, number, number, number] },
  ],
};

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
  const service = new StudioUnitySpaceLayoutService(
    { getWorkTeam } as unknown as CreatorService,
  );
  return { service, getWorkTeam };
}

// pg-proxy는 컬럼을 선언 순서 위치 배열로 돌려준다.
// 순서: workId, spaceId, definition, revision, updatedByUserId, updatedAt
const ROW = ["work-1", "street", definition, 3, "u1", new Date("2026-10-11T00:00:00.000Z")];

beforeEach(() => {
  boundary.query.mockReset();
});

describe("authorization", () => {
  it("rejects an anonymous caller before any query", async () => {
    const { service } = makeService(viewerTeam());
    await expect(service.getLayout(undefined, "work-1", "street")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(boundary.query).not.toHaveBeenCalled();
  });

  it("rejects a viewer without an active membership", async () => {
    const { service } = makeService(viewerTeam({ status: "invited" }));
    await expect(service.getLayout("u1", "work-1", "street")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("rejects a viewer without the view capability", async () => {
    const { service } = makeService(
      viewerTeam({ capabilities: { view: false, edit: false } }),
    );
    await expect(
      service.saveLayout("u1", "work-1", "street", { definition, expectedRevision: 0 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("hides works the caller is not a member of (team lookup 404 propagates)", async () => {
    const getWorkTeam = vi.fn().mockRejectedValue(new NotFoundException("없음"));
    const service = new StudioUnitySpaceLayoutService(
      { getWorkTeam } as unknown as CreatorService,
    );
    await expect(service.getLayout("u9", "work-x", "street")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

// 협업 역할 정책(creator-collaboration.policy)에서 edit 권한이 없는 읽기 전용 역할이다.
const READ_ONLY_ROLES: ReadonlyArray<
  readonly [role: string, capabilities: Readonly<Record<string, boolean>>]
> = [
  ["viewer", { view: true, comment: false, edit: false, manageMembers: false }],
  ["commenter", { view: true, comment: true, edit: false, manageMembers: false }],
];

describe("write authorization (읽기 전용 협업 역할은 공간 정의를 바꿀 수 없다)", () => {
  it.each(READ_ONLY_ROLES)(
    "%s 역할의 저장 요청은 DB 에 닿기 전에 403 으로 막힌다",
    async (_role, capabilities) => {
      const { service } = makeService(viewerTeam({ capabilities }));
      await expect(
        service.saveLayout("u1", "work-1", "street", { definition, expectedRevision: 0 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.saveLayout("u1", "work-1", "street", { definition, expectedRevision: 3 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(boundary.query).not.toHaveBeenCalled();
    },
  );

  it.each(READ_ONLY_ROLES)(
    "%s 역할은 본문이 잘못돼도 400 이 아니라 403 을 받는다(인가가 먼저)",
    async (_role, capabilities) => {
      const { service } = makeService(viewerTeam({ capabilities }));
      await expect(
        service.saveLayout("u1", "work-1", "studio-room", { definition, expectedRevision: 0 }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it.each(READ_ONLY_ROLES)(
    "%s 역할도 저장된 공간 정의는 읽을 수 있다",
    async (_role, capabilities) => {
      const { service } = makeService(viewerTeam({ capabilities }));
      boundary.query.mockResolvedValueOnce({ rows: [ROW] });
      const layout = await service.getLayout("u1", "work-1", "street");
      expect(layout.revision).toBe(3);
    },
  );
});

describe("read", () => {
  it("returns the stored layout with its revision", async () => {
    const { service } = makeService(viewerTeam());
    boundary.query.mockResolvedValueOnce({ rows: [ROW] });

    const layout = await service.getLayout("u1", "work-1", "street");
    expect(layout.revision).toBe(3);
    expect(layout.definition.id).toBe("street");
    expect(layout.updatedAt).toBe("2026-10-11T00:00:00.000Z");
  });

  it("404s when nothing is stored for the space", async () => {
    const { service } = makeService(viewerTeam());
    boundary.query.mockResolvedValueOnce({ rows: [] });
    await expect(service.getLayout("u1", "work-1", "street")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});

describe("save", () => {
  it("rejects a definition whose id differs from the path spaceId", async () => {
    const { service } = makeService(viewerTeam());
    await expect(
      service.saveLayout("u1", "work-1", "studio-room", { definition, expectedRevision: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(boundary.query).not.toHaveBeenCalled();
  });

  it("inserts a first save at revision 1 with on-conflict-do-nothing", async () => {
    const { service } = makeService(viewerTeam());
    boundary.query.mockResolvedValueOnce({ rows: [[...ROW.slice(0, 3), 1, "u1", ROW[5]]] });

    const saved = await service.saveLayout("u1", "work-1", "street", {
      definition,
      expectedRevision: 0,
    });
    expect(saved.revision).toBe(1);
    const [insertSql] = boundary.query.mock.calls[0];
    expect(insertSql).toContain("insert into");
    expect(insertSql).toMatch(/on conflict .*do nothing/i);
  });

  it("conflicts when another editor created the row first", async () => {
    const { service } = makeService(viewerTeam());
    boundary.query
      .mockResolvedValueOnce({ rows: [] }) // insert → conflict, no row back
      .mockResolvedValueOnce({ rows: [[2]] }); // current revision probe

    const error = await service
      .saveLayout("u1", "work-1", "street", { definition, expectedRevision: 0 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ currentRevision: 2 });
  });

  it("updates only when the stored revision matches (compare-and-swap)", async () => {
    const { service } = makeService(viewerTeam());
    boundary.query.mockResolvedValueOnce({ rows: [[...ROW.slice(0, 3), 4, "u1", ROW[5]]] });

    const saved = await service.saveLayout("u1", "work-1", "street", {
      definition,
      expectedRevision: 3,
    });
    expect(saved.revision).toBe(4);
    const [updateSql, updateParams] = boundary.query.mock.calls[0];
    expect(updateSql).toContain("update");
    expect(updateParams).toContain(3);
  });

  it("conflicts instead of overwriting a newer revision", async () => {
    const { service } = makeService(viewerTeam());
    boundary.query
      .mockResolvedValueOnce({ rows: [] }) // update matched nothing
      .mockResolvedValueOnce({ rows: [[9]] });

    await expect(
      service.saveLayout("u1", "work-1", "street", { definition, expectedRevision: 3 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe("contract validation (controller boundary schemas)", () => {
  it("accepts the built-in street definition shape", () => {
    expect(UnitySpaceDefinitionSchema.parse(definition).zones).toHaveLength(1);
    expect(
      SaveUnitySpaceLayoutBodySchema.parse({ definition, expectedRevision: 0 })
        .expectedRevision,
    ).toBe(0);
  });

  it("rejects an external background URL", () => {
    const bad = {
      ...definition,
      background: { glb: "https://evil.example.com/x.glb" },
    };
    expect(() => UnitySpaceDefinitionSchema.parse(bad)).toThrow();
  });

  it("rejects oversized zone lists and bad rects", () => {
    const zone = definition.zones[0];
    expect(() =>
      UnitySpaceDefinitionSchema.parse({
        ...definition,
        zones: Array.from({ length: 25 }, () => zone),
      }),
    ).toThrow();
    expect(() =>
      UnitySpaceDefinitionSchema.parse({
        ...definition,
        zones: [{ ...zone, rect: [0, 0, 4, 4] }],
      }),
    ).toThrow();
  });

  it("rejects a negative expectedRevision and a bad spaceId", () => {
    expect(() =>
      SaveUnitySpaceLayoutBodySchema.parse({ definition, expectedRevision: -1 }),
    ).toThrow();
    expect(() =>
      UnitySpaceLayoutParamsSchema.parse({ workId: "w", spaceId: "Bad Id!" }),
    ).toThrow();
  });
});
