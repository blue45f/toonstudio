import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  PayloadTooLargeException,
} from "@nestjs/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  STUDIO_VIRTUAL_DECORATION_MAX_LAYOUTS_PER_USER,
  StudioVirtualSpaceDecorationService,
} from "./studio-virtual-space-decoration.service";

const boundary = vi.hoisted(() => ({
  query: vi.fn(),
}));

vi.mock("../../platform/database", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const { studioVirtualSpaceDecorationLayouts } = await import(
    "../../platform/database/schema/studio-virtual-space-decoration.schema"
  );
  const { users } = await import("../../platform/database/schema/auth.schema");
  return {
    studioVirtualSpaceDecorationLayouts,
    users,
    db: drizzle((query, parameters, method) => boundary.query(query, parameters, method)),
  };
});

const service = new StudioVirtualSpaceDecorationService();

function placement(overrides: Record<string, unknown> = {}) {
  return { id: "bench-1", type: "bench", x: 10, y: 20, rotation: 0, scale: 1, ...overrides };
}

const SCOPE = '["proj-1","office","personal"]';

function saveBody(overrides: Record<string, unknown> = {}) {
  return {
    scopeKey: SCOPE,
    districtKey: "story-terrace",
    presetKey: "minimal",
    presentationMode: "minimal",
    placements: [placement()],
    expectedRevision: 0,
    layoutWidth: 1280,
    layoutHeight: 960,
    ...overrides,
  };
}

// pg-proxy는 컬럼을 위치 배열로 돌려준다. 객체로 주면 status가 undefined가 된다.
const ACTIVE_USER = { rows: [["active"]] };

beforeEach(() => {
  boundary.query.mockReset();
  boundary.query.mockResolvedValue(ACTIVE_USER);
});

describe("ownership", () => {
  it("refuses an anonymous caller", async () => {
    await expect(service.getState(undefined, SCOPE, "sky-port")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses a blank user id", async () => {
    await expect(service.getState("   ", SCOPE, "sky-port")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses a suspended account", async () => {
    boundary.query.mockResolvedValue({ rows: [["suspended"]] });

    await expect(service.getState("u1", SCOPE, "sky-port")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects an unknown district", async () => {
    await expect(service.getState("u1", SCOPE, "moon-base")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("범위 키 해석", () => {
  it("퍼센트 인코딩이 깨진 범위 키는 URIError(500)가 아니라 404 로 답한다", async () => {
    await expect(service.getState("u1", "%E0%A4%A", "sky-port")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.save("u1", "%", "story-terrace", saveBody())).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("read", () => {
  it("returns the empty state at revision 0 when nothing is stored", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE_USER)
      .mockResolvedValueOnce({ rows: [] });

    await expect(service.getState("u1", SCOPE, "sky-port")).resolves.toEqual({
      scopeKey: SCOPE,
      districtKey: "sky-port",
      presetKey: "minimal",
      presentationMode: "minimal",
      placements: [],
      revision: 0,
      layoutWidth: 1280,
      layoutHeight: 960,
    });
  });
});

describe("first write", () => {
  it("inserts and does not overwrite a row another device already created", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE_USER)
      .mockResolvedValueOnce({ rows: [[0]] }) // 보관 개수 조회
      .mockResolvedValueOnce({ rows: [] });

    await expect(service.save("u1", SCOPE, "story-terrace", saveBody())).rejects.toBeInstanceOf(ConflictException);

    const [insertSql] = boundary.query.mock.calls[2];
    expect(insertSql).toContain("insert into");
    expect(insertSql).toMatch(/on conflict do nothing/i);
  });

  it("returns revision 1 after a successful first write", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE_USER)
      .mockResolvedValueOnce({ rows: [[0]] }) // 보관 개수 조회
      .mockResolvedValueOnce({ rows: [[1]] });

    const saved = await service.save("u1", SCOPE, "story-terrace", saveBody());

    expect(saved.revision).toBe(1);
    expect(saved.placements).toHaveLength(1);
  });
});

describe("per-account layout cap (새 범위 저장의 계정별 상한)", () => {
  function insertCount(): number {
    return boundary.query.mock.calls.filter(([sql]) => String(sql).includes("insert into")).length;
  }

  it("보관한 배치 수가 상한이면 새 범위 저장을 413 으로 거절하고 INSERT 하지 않는다", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE_USER)
      .mockResolvedValueOnce({ rows: [[STUDIO_VIRTUAL_DECORATION_MAX_LAYOUTS_PER_USER]] });

    await expect(service.save("u1", SCOPE, "story-terrace", saveBody())).rejects.toBeInstanceOf(
      PayloadTooLargeException,
    );
    expect(insertCount()).toBe(0);
  });

  it("상한 직전(상한-1)까지는 새 범위를 저장한다", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE_USER)
      .mockResolvedValueOnce({ rows: [[STUDIO_VIRTUAL_DECORATION_MAX_LAYOUTS_PER_USER - 1]] })
      .mockResolvedValueOnce({ rows: [[1]] });

    await expect(service.save("u1", SCOPE, "story-terrace", saveBody())).resolves.toMatchObject({ revision: 1 });
    expect(insertCount()).toBe(1);
  });

  it("개수는 요청한 계정의 행만 센다", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE_USER)
      .mockResolvedValueOnce({ rows: [[0]] })
      .mockResolvedValueOnce({ rows: [[1]] });

    await service.save("u1", SCOPE, "story-terrace", saveBody());

    const [countSql, countParams] = boundary.query.mock.calls[1] as [string, unknown[]];
    expect(countSql).toContain("count(");
    expect(countSql).toMatch(/"studio_virtual_space_decoration_layout"\."userId" = \$/u);
    expect(countParams).toEqual(["u1"]);
  });

  it("이미 있는 범위의 갱신(expectedRevision > 0)은 상한에 걸리지 않고 개수도 세지 않는다", async () => {
    boundary.query.mockResolvedValueOnce(ACTIVE_USER).mockResolvedValueOnce({ rows: [[1]] });

    const saved = await service.save("u1", SCOPE, "story-terrace", saveBody({ expectedRevision: 3 }));

    expect(saved.revision).toBe(4);
    expect(boundary.query.mock.calls.some(([sql]) => String(sql).includes("count("))).toBe(false);
  });
});

describe("later writes use compare-and-swap", () => {
  it("updates only when the stored revision still matches the caller's", async () => {
    boundary.query.mockResolvedValueOnce(ACTIVE_USER).mockResolvedValueOnce({ rows: [[1]] });

    const saved = await service.save("u1", SCOPE, "story-terrace", saveBody({ expectedRevision: 7 }));

    const [updateSql, updateParams] = boundary.query.mock.calls[1];
    expect(updateSql).toContain("update");
    expect(updateSql).toMatch(/"studio_virtual_space_decoration_layout"\."revision" = \$/);
    expect(updateParams).toContain(7);
    expect(saved.revision).toBe(8);
  });

  it("refuses to overwrite a newer row and hands back the current state", async () => {
    boundary.query
      .mockResolvedValueOnce(ACTIVE_USER)
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce(ACTIVE_USER)
      .mockResolvedValueOnce({ rows: [["u1", SCOPE, "story-terrace", "festival", "festival", [], 9, 1280, 960, new Date(0)]] });

    const failure = await service.save("u1", SCOPE, "story-terrace", saveBody({ expectedRevision: 7 })).catch((e) => e);

    expect(failure).toBeInstanceOf(ConflictException);
    expect(failure.getResponse()).toMatchObject({ current: { revision: 9 } });
  });
});

describe("payload", () => {
  it("refuses a body whose district disagrees with the path", async () => {
    await expect(
      service.save("u1", SCOPE, "sky-port", saveBody({ districtKey: "story-terrace" })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a payload that the shared contract rejects", async () => {
    await expect(
      service.save("u1", SCOPE, "story-terrace", saveBody({ placements: [placement({ type: "weapon-rack" })] })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a body whose scope disagrees with the path", async () => {
    await expect(
      service.save("u1", SCOPE, "story-terrace", saveBody({ scopeKey: "other" })),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses a scope key longer than the contract allows", async () => {
    await expect(
      service.save("u1", "x".repeat(300), "story-terrace", saveBody()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses a stale negative revision", async () => {
    await expect(
      service.save("u1", SCOPE, "story-terrace", saveBody({ expectedRevision: -3 })),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
