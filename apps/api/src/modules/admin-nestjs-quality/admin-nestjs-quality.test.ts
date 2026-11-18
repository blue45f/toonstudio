import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { createNestBoardDocument } from "@toonstudio/contracts/admin-nestjs-quality-seed";
import { AdminNestjsQualityController } from "./admin-nestjs-quality.controller";
import { AdminNestjsQualityRepository, nestBoardDigest, stampNestBoardDocument } from "./admin-nestjs-quality.repository";

describe("관리자 NestJS 검증 보드 입력 경계", () => {
  function controller() {
    const repository = { read: vi.fn(), save: vi.fn(), history: vi.fn() };
    return { repository, controller: new AdminNestjsQualityController(repository as unknown as AdminNestjsQualityRepository) };
  }

  it("로그인 전에는 문서·이력 조회와 저장을 거부한다", () => {
    const target = controller();
    expect(() => target.controller.read()).toThrowError(expect.objectContaining({ status: 401 }));
    expect(() => target.controller.save({})).toThrowError(expect.objectContaining({ status: 401 }));
    expect(() => target.controller.history("1")).toThrowError(expect.objectContaining({ status: 401 }));
    expect(target.repository.read).not.toHaveBeenCalled();
    expect(target.repository.save).not.toHaveBeenCalled();
  });

  it("잘못된 입력·이력 식별자는 DB에 전달하지 않는다", () => {
    const target = controller();
    expect(() => target.controller.save({ expectedRevision: -1 }, "admin")).toThrowError(expect.objectContaining({ status: 400 }));
    for (const revision of ["0", "-1", "1 OR 1=1", "2147483648"]) {
      expect(() => target.controller.history(revision, "admin")).toThrowError(expect.objectContaining({ status: 400 }));
    }
    expect(target.repository.save).not.toHaveBeenCalled();
    expect(target.repository.history).not.toHaveBeenCalled();
  });

  it("공유 계약으로 검증한 요청과 인증된 사용자만 저장소에 전달한다", () => {
    const target = controller();
    const input = { expectedRevision: 0, mutationId: randomUUID(), document: createNestBoardDocument(), reason: "근거 확인" };
    target.controller.save(input, "admin");
    expect(target.repository.save).toHaveBeenCalledWith("admin", input);
  });
});

describe("검증 보드의 서버 수정 메타데이터", () => {
  it("클라이언트 수정 번호·시각 변조는 무시하고 실제 변경 항목만 증가시킨다", () => {
    const before = createNestBoardDocument();
    const task = before.tasks[0];
    const at = "2026-11-18T00:00:00.000Z";
    const unchanged = { ...before, tasks: before.tasks.map(item => ({ ...item, revision: 999, updatedAt: at })) };
    expect(stampNestBoardDocument(before, unchanged, at).document.tasks).toEqual(before.tasks);
    const changed = { ...before, tasks: before.tasks.map(item => item.id === task.id ? { ...item, notes: "새 확인 근거", revision: 999 } : item) };
    const result = stampNestBoardDocument(before, changed, at);
    expect(result.changedTaskIds).toEqual([task.id]);
    expect(result.document.tasks[0]).toMatchObject({ revision: task.revision + 1, updatedAt: at });
    expect(result.snapshotChanged).toBe(false);
  });

  it("기존 승인 요구는 삭제하거나 일반 작업으로 낮출 수 없다", () => {
    const before = createNestBoardDocument();
    const task = before.tasks.find(item => item.approvalRequired)!;
    expect(task).toBeDefined();
    const remove = { ...before, tasks: before.tasks.filter(item => item.id !== task.id) };
    const downgrade = { ...before, tasks: before.tasks.map(item => item.id === task.id ? { ...item, approvalRequired: false } : item) };
    expect(() => stampNestBoardDocument(before, remove, new Date().toISOString())).toThrowError(expect.objectContaining({ status: 400 }));
    expect(() => stampNestBoardDocument(before, downgrade, new Date().toISOString())).toThrowError(expect.objectContaining({ status: 400 }));
  });

  it("동일 요청은 객체 키 순서와 무관하게 같은 재전송 지문을 갖는다", () => {
    expect(nestBoardDigest({ a: 1, b: { c: 2, d: 3 } })).toBe(nestBoardDigest({ b: { d: 3, c: 2 }, a: 1 }));
    expect(nestBoardDigest({ a: [1, 2] })).not.toBe(nestBoardDigest({ a: [2, 1] }));
  });
});

describe("검증 보드 저장소 장애", () => {
  it("DB 연결 실패를 seed 성공으로 바꾸지 않고 비밀 없는 503으로 보고한다", async () => {
    const pool = { connect: vi.fn().mockRejectedValue(new Error("private-connection-detail")) } as unknown as Pool;
    const repository = new AdminNestjsQualityRepository(pool);
    await expect(repository.read("admin")).rejects.toMatchObject({ status: 503,
      response: { code: "nestjs_board_unavailable" } });
    await expect(repository.read("admin")).rejects.not.toThrow("private-connection-detail");
  });

  it("스키마가 없으면 초기 문서를 쓰거나 반환하지 않고 트랜잭션을 원복한다", async () => {
    const query = vi.fn(async (statement: string) => {
      if (statement.includes('FROM "user"')) return { rows: [{ role: "admin" }] };
      if (statement.includes("FROM admin_nestjs_quality_board")) throw Object.assign(new Error("missing relation"), { code: "42P01" });
      return { rows: [] };
    });
    const client = { query, release: vi.fn() };
    const repository = new AdminNestjsQualityRepository({ connect: async () => client } as unknown as Pool);
    await expect(repository.read("admin")).rejects.toMatchObject({ status: 503 });
    expect(query).toHaveBeenCalledWith("ROLLBACK");
    expect(query.mock.calls.some(([sql]) => /INSERT|CREATE/u.test(sql))).toBe(false);
    expect(client.release).toHaveBeenCalled();
  });

  it("운영자 저장과 정지 계정은 초기 행 생성 전에 거부한다", async () => {
    for (const role of ["operator", null]) {
      const query = vi.fn(async (statement: string) => ({ rows: statement.includes('FROM "user"') && role ? [{ role }] : [] }));
      const client = { query, release: vi.fn() };
      const repository = new AdminNestjsQualityRepository({ connect: async () => client } as unknown as Pool);
      await expect(repository.save("operator", { expectedRevision: 0, mutationId: randomUUID(),
        document: createNestBoardDocument(), reason: "권한 확인" })).rejects.toMatchObject({ status: 403 });
      expect(query.mock.calls.some(([sql]) => /INSERT/u.test(sql))).toBe(false);
    }
  });
});
