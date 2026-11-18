import "reflect-metadata";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BoardSnapshot } from "@toonstudio/contracts/ai-operations";

import { AiOperationsController } from "./ai-operations.controller";
import { AiOperationsRepository } from "./ai-operations.repository";
import { AdminMutationGuard } from "../admin-mutation.guard";

vi.mock("../admin-mutation.guard", () => ({ AdminMutationGuard: class AdminMutationGuard {} }));

const snapshot: BoardSnapshot = {
  meta: { title: "합성 운영 기록", snapshotAt: "", mainSha: "", mainCommitUrl: "", deadline: "", noticeUrl: "", caveats: [] },
  items: [], sources: [],
};
const body = () => ({ expectedRevision: 0, mutationId: "10000000-0000-4000-8000-000000000001", snapshot });

describe("AI 운영 보드 controller 입력 경계", () => {
  const repository = { read: vi.fn(), save: vi.fn() };
  const controller = new AiOperationsController(repository as unknown as AiOperationsRepository);
  beforeEach(() => vi.clearAllMocks());

  it("미인증 요청은 저장소를 호출하지 않는다", () => {
    expect(() => controller.read()).toThrow(ForbiddenException);
    expect(() => controller.save(null)).toThrow(ForbiddenException);
    expect(repository.read).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("POST에는 기존 관리자 전용 guard가 적용된다", () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AiOperationsController.prototype.save)).toContain(AdminMutationGuard);
  });

  it("잘못된 본문·큰 입력은 저장소에 전달하지 않는다", () => {
    expect(() => controller.save({ ...body(), execute: "deploy" }, "admin")).toThrow(BadRequestException);
    expect(() => controller.save({ ...body(), snapshot: { ...snapshot, meta: { ...snapshot.meta, title: "x".repeat(3_000_000) } } }, "admin"))
      .toThrow(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it("검증된 요청을 인증 주체와 함께 전달한다", () => {
    controller.save(body(), "admin");
    expect(repository.save).toHaveBeenCalledWith("admin", body());
  });

  it("저장소 오류를 성공 응답으로 바꾸지 않는다", async () => {
    repository.read.mockRejectedValueOnce(new Error("test storage unavailable"));
    await expect(controller.read("admin")).rejects.toThrow("test storage unavailable");
  });
});
