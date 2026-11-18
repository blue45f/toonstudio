import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { emptyBoard } from "@toonstudio/contracts/admin-cloud-workboard";
import { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";

import { AdminCloudWorkboardController } from "./admin-cloud-workboard.controller";
import { AdminCloudWorkboardRepository } from "./admin-cloud-workboard.repository";

function fixture() {
  const snapshot = { board: emptyBoard(), revision: 0, storedAt: null };
  const repository = {
    read: vi.fn<AdminCloudWorkboardRepository["read"]>().mockResolvedValue(snapshot),
    save: vi.fn<AdminCloudWorkboardRepository["save"]>().mockResolvedValue(snapshot),
  };
  return { controller: new AdminCloudWorkboardController(repository), repository, snapshot };
}

describe("관리자 개인 작업 보드 입력 경계", () => {
  it.each([undefined, "", "   "])("로그인 정보가 없으면 저장소에 접근하지 않는다: %s", (actor) => {
    const { controller, repository } = fixture();
    expect(() => controller.read(actor)).toThrow(ForbiddenException);
    expect(() => controller.save({}, actor)).toThrow(ForbiddenException);
    expect(repository.read).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("검증한 세션 행위자를 전달하고 저장소 응답을 반환한다", async () => {
    const { controller, repository, snapshot } = fixture();
    const input = { board: emptyBoard(), expectedRevision: 0, mutationId: randomUUID() };
    expect(await controller.read("session-admin")).toEqual(snapshot);
    expect(await controller.save(input, "session-admin")).toEqual(snapshot);
    expect(repository.read).toHaveBeenCalledWith("session-admin");
    expect(repository.save).toHaveBeenCalledWith("session-admin", input);
  });

  it.each([
    { owner_user_id: "another-admin" },
    { boardId: "another-board" },
    { expectedRevision: -1 },
    { expectedRevision: Number.MAX_SAFE_INTEGER + 1 },
    { mutationId: "not-a-uuid" },
    { board: { ...emptyBoard(), tasks: [{ id: "incomplete-task" }] } },
  ])("소유자 주입과 잘못된 변경 요청을 거부한다", (override) => {
    const { controller, repository } = fixture();
    const input = { board: emptyBoard(), expectedRevision: 0, mutationId: randomUUID(), ...override };
    expect(() => controller.save(input, "session-admin")).toThrow(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("저장소 오류를 빈 보드로 대체하지 않는다", async () => {
    const { controller, repository } = fixture();
    repository.read.mockRejectedValue(new ServiceUnavailableException("unavailable"));
    await expect(controller.read("session-admin")).rejects.toMatchObject({ status: 503 });
  });

  it("연결 실패 시 내부 접속 정보를 노출하지 않는 503을 반환한다", async () => {
    const pool = new Pool();
    vi.spyOn(pool, "connect").mockRejectedValue(new Error("private-database-connection-detail"));
    try {
      const repository = new AdminCloudWorkboardRepository(pool);
      await expect(repository.read("session-admin")).rejects.toMatchObject({
        status: 503,
        response: {
          code: "cloud_workboard_unavailable",
          message: "작업 보드 저장소를 확인할 수 없습니다. 데이터베이스 준비 상태를 확인해주세요.",
        },
      });
    } finally {
      await pool.end();
    }
  });
});
