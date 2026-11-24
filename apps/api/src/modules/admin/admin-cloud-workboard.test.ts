import { randomUUID } from "node:crypto";

import { BadRequestException, ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { blankCheck, blankTask, effectiveCI, effectiveStage, emptyBoard, type Board, type CloudWorkboardSave } from "@toonstudio/contracts/admin-cloud-workboard";
import { Pool, type PoolClient } from "pg";
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


/** SQL을 실행하지 않는 저장소 경계 대역. UPDATE 전 검증과 이력 보존만 관찰한다. */
function storedRepositoryFixture(initial: Board, revision = 1) {
  let payload = initial;
  let currentRevision = revision;
  const storedAt = new Date("2026-11-18T04:00:00.000Z");
  const calls: string[] = [];
  const query = vi.fn(async (sql: string, values?: readonly unknown[]) => {
    calls.push(sql);
    if (sql.includes('SELECT role FROM "user"')) return { rows: [{ role: "admin" }] };
    if (sql.includes("SELECT payload,revision::text,stored_at")) return { rows: [{ payload, revision: String(currentRevision), stored_at: storedAt }] };
    if (sql.startsWith("UPDATE admin_cloud_workboard SET")) {
      payload = JSON.parse(String(values?.[2])) as Board;
      currentRevision += 1;
      return { rows: [{ payload, revision: String(currentRevision), stored_at: storedAt }] };
    }
    return { rows: [] };
  });
  const release = vi.fn();
  const pool = new Pool();
  vi.spyOn(pool, "connect").mockResolvedValue({ query, release } as unknown as PoolClient);
  return { repository: new AdminCloudWorkboardRepository(pool), pool, calls, release };
}

function saveInput(board: Board, expectedRevision = 1): CloudWorkboardSave {
  return { board, expectedRevision, mutationId: randomUUID() };
}

describe("작업 보드의 변경 주장 검증", () => {
  it("근거 없는 새 완료 주장은 잠긴 이전 기록과 비교한 뒤 쓰기 전에 400으로 거부한다", async () => {
    const fixture = storedRepositoryFixture(emptyBoard());
    const task = { ...blankTask(), title: "검증 근거가 없는 새 완료", stage: "검증 완료" as const };
    try {
      await expect(fixture.repository.save("session-admin", saveInput({ ...emptyBoard(), tasks: [task] })))
        .rejects.toMatchObject({ status: 400, response: { code: "cloud_workboard_invalid" } });
      expect(fixture.calls.some((sql) => sql.includes("FOR UPDATE"))).toBe(true);
      expect(fixture.calls.some((sql) => sql.startsWith("UPDATE admin_cloud_workboard SET"))).toBe(false);
      expect(fixture.calls.some((sql) => sql.includes("INSERT INTO admin_cloud_workboard_audit"))).toBe(false);
      expect(fixture.calls).toContain("ROLLBACK");
      expect(fixture.release).toHaveBeenCalledOnce();
    } finally { await fixture.pool.end(); }
  });

  it("오래된 기록의 메모 편집은 원본 근거·확인 시각·미검증 출처 이력을 보존한다", async () => {
    const task = { ...blankTask(), title: "지난 완료 기록", stage: "검증 완료" as const, notes: "이전 메모" };
    const source = { id: "source-note", at: "", taskId: "", title: "Sites 원본", detail: "서버 감사 이력이 아닌 가져온 기록" };
    const before = { ...emptyBoard(), tasks: [task], sourceHistory: [source] };
    const fixture = storedRepositoryFixture(before);
    const next = { ...before, tasks: [{ ...task, notes: "이전 근거를 유지한 메모" }] };
    try {
      const result = await fixture.repository.save("session-admin", saveInput(next));
      expect(result.revision).toBe(2);
      expect(result.board.tasks[0]?.notes).toBe("이전 근거를 유지한 메모");
      expect(result.board.tasks[0]?.verifiedAt).toBe(task.verifiedAt);
      expect(result.board.tasks[0]?.evidence).toEqual(task.evidence);
      expect(result.board.sourceHistory).toEqual([source]);
      expect(result.board.audit).toEqual([]);
      expect(fixture.calls).toContain("COMMIT");
    } finally { await fixture.pool.end(); }
  });

  it("오래된 revision은 변경 주장 검사보다 먼저 409로 거부하며 저장하지 않는다", async () => {
    const fixture = storedRepositoryFixture(emptyBoard(), 2);
    const task = { ...blankTask(), title: "동시 변경으로 오래된 요청", stage: "검증 완료" as const };
    try {
      await expect(fixture.repository.save("session-admin", saveInput({ ...emptyBoard(), tasks: [task] }, 1)))
        .rejects.toMatchObject({ status: 409, response: { code: "cloud_workboard_conflict" } });
      expect(fixture.calls.some((sql) => sql.startsWith("UPDATE admin_cloud_workboard SET"))).toBe(false);
      expect(fixture.calls).toContain("ROLLBACK");
    } finally { await fixture.pool.end(); }
  });

  it("명시적 과거 가져오기는 지난 검증·CI 원문과 시각을 보존하고 현재 판정은 미확인이다", async () => {
    const old = "2020-01-01T00:00:00.000Z";
    const sha = "a".repeat(40);
    const url = "https://github.com/example/project/actions/runs/1";
    const task = { ...blankTask(), title: "지난 Sites 관측값", stage: "검증 완료" as const,
      remoteSha: sha, ciStatus: "통과" as const, ciSha: sha, ciLink: url, verifiedAt: old,
      evidence: [{ id: "old-proof", title: "이전 결과", kind: "GitHub" as const, url,
        summary: "가져온 원본 결과", observedAt: old, occurredAt: old, subjectSha: sha }],
      verificationChecks: [{ ...blankCheck(), state: "통과" as const, subjectSha: sha,
        evidenceUrl: url, observedAt: old, reason: "이전 검사 결과" }],
    };
    const fixture = storedRepositoryFixture(emptyBoard());
    try {
      const result = await fixture.repository.save("session-admin", { ...saveInput({ ...emptyBoard(), tasks: [task] }), importHistory: true });
      const imported = result.board.tasks[0]!;
      expect(imported.verifiedAt).toBe(old);
      expect(imported.evidence).toEqual(task.evidence);
      expect(imported.verificationChecks).toEqual(task.verificationChecks);
      expect(imported.stage).toBe("검증 완료");
      expect(imported.ciStatus).toBe("통과");
      expect(effectiveStage(imported)).toBe("미확인");
      expect(effectiveCI(imported)).toBe("미확인");
      expect(result.revision).toBe(2);
    } finally { await fixture.pool.end(); }
  });

  it("과거 가져오기로도 실행 조치를 승인 대기 밖으로 저장할 수 없다", () => {
    const { controller, repository } = fixture();
    const task = { ...blankTask(), title: "승인이 필요한 조치", action: "브랜치 삭제" as const, stage: "검증 완료" as const };
    const input = { ...saveInput({ ...emptyBoard(), tasks: [task] }), importHistory: true };
    expect(() => controller.save(input, "session-admin")).toThrow(BadRequestException);
    expect(repository.save).not.toHaveBeenCalled();
  });

});
