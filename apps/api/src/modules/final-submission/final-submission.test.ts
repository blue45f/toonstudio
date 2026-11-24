import "reflect-metadata";
import { randomBytes } from "node:crypto";

import { ForbiddenException, Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { createEmptyFinalSubmissionBoard, type FinalSubmissionRecord, type SaveFinalSubmissionRequest } from "@toonstudio/contracts/final-submission";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { configureApiBodyParserBoundary } from "../../config/api-body-parser-boundary";
import { createCsrfProtectionMiddleware } from "../../csrf-middleware";
import { signSession } from "../../server/session";
import { sessionAuth } from "../../session-middleware";
import { FinalSubmissionController } from "./final-submission.controller";
import { parseSaveFinalSubmissionRequest } from "./final-submission.dto";
import { FinalSubmissionRepository, finalSubmissionDigest } from "./final-submission.repository";
import { submissionRequest } from "./final-submission.test-support";

vi.mock("../../server/user-lifecycle", () => ({ isSessionAllowed: vi.fn(async () => true) }));

describe("최종 제출 저장 입력과 실패 경계", () => {
  it("미확인과 승인 대기를 그대로 보존하고 원문은 복제한다", () => {
    const input = submissionRequest();
    const parsed = parseSaveFinalSubmissionRequest(input);
    expect(parsed).toEqual(input);
    expect(parsed.board).not.toBe(input.board);
    expect(parsed.board.documents.every((document) => document.platform.status === "미확인")).toBe(true);
    expect(parsed.board.tasks.filter((task) => task.approvalRequired)).toHaveLength(4);
  });

  it.each([
    { actorUserId: "another-user" }, { ownerUserId: "another-user" }, { history: [] },
    { expectedRevision: -1 }, { expectedRevision: 0.5 }, { expectedRevision: 2_147_483_647 },
    { expectedRevision: "0" }, { expectedRevision: 1 }, { mutationId: "invalid" },
    { summary: "" }, { summary: "  " }, { summary: "x".repeat(501) }, { board: null },
  ])("신원 주입·잘못된 요청·서버 기준 버전 불일치를 거부한다: %j", (change) => {
    expect(() => parseSaveFinalSubmissionRequest({ ...submissionRequest(), ...change })).toThrow();
  });

  it("최초 가져오기에서도 고정 승인 삭제·해제·실행 완료를 거부한다", () => {
    for (const edit of ["delete", "unlock", "complete"]) {
      const board = createEmptyFinalSubmissionBoard();
      const task = board.tasks.find((item) => item.id === "ACTION-01")!;
      if (edit === "delete") board.tasks = board.tasks.filter((item) => item.id !== task.id);
      if (edit === "unlock") task.approvalRequired = false;
      if (edit === "complete") task.status = "최종 확인";
      expect(() => parseSaveFinalSubmissionRequest(submissionRequest(board))).toThrow();
    }
  });

  it("요약을 포함한 digest는 키 순서에만 독립적이다", () => {
    expect(finalSubmissionDigest({ b: { y: 2, x: 1 }, a: [2, 1] })).toBe(finalSubmissionDigest({ a: [2, 1], b: { x: 1, y: 2 } }));
    const input = submissionRequest();
    expect(finalSubmissionDigest(input)).not.toBe(finalSubmissionDigest({ ...input, summary: "다른 변경 요약" }));
  });

  it("연결 실패는 사용자 원문·SQL·연결 문자열 없는 503으로 반환한다", async () => {
    const pool = { connect: vi.fn(async () => { throw new Error("private-db-detail"); }) };
    const repository = new FinalSubmissionRepository(pool as unknown as Pool);
    for (const action of [() => repository.read("admin-a"), () => repository.export("admin-a"), () => repository.save("admin-a", submissionRequest())]) {
      await expect(action()).rejects.toMatchObject({ status: 503, response: { code: "final_submission_storage_unavailable" } });
      try { await action(); } catch (error) { expect(String(error)).not.toContain("private-db-detail"); }
    }
  });
});

const emptyRecord = (ownerUserId: string): FinalSubmissionRecord => ({ ownerUserId, board: null, revision: 0, updatedAt: null, history: [] });
const repository = {
  read: vi.fn(async (actor: string): Promise<FinalSubmissionRecord> => emptyRecord(actor)),
  export: vi.fn(async (actor: string): Promise<FinalSubmissionRecord> => emptyRecord(actor)),
  save: vi.fn(async (actor: string, input: SaveFinalSubmissionRequest): Promise<FinalSubmissionRecord> => {
    const at = new Date().toISOString();
    return { ownerUserId: actor, board: { ...input.board, revision: 1, updatedAt: at }, revision: 1, updatedAt: at, history: [{ id: input.mutationId, revision: 1, changedAt: at, summary: input.summary }] };
  }),
};

@Module({ controllers: [FinalSubmissionController], providers: [{ provide: FinalSubmissionRepository, useValue: repository }] })
class FinalSubmissionHttpTestModule {}

describe("최종 제출 실제 HTTP 세션·CSRF·개인 범위", () => {
  let app: INestApplication;
  let origin: string;
  let token: string;
  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AUTH_SESSION_SECRET", randomBytes(40).toString("hex"));
    token = signSession("verified-admin", 1);
    app = await NestFactory.create(FinalSubmissionHttpTestModule, { logger: false, bodyParser: false });
    app.setGlobalPrefix("api");
    app.use(sessionAuth);
    app.use(createCsrfProtectionMiddleware(process.env));
    configureApiBodyParserBoundary(app, null);
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });
  const get = (suffix = "", headers: Record<string, string> = {}) => fetch(`${origin}/api/admin/final-submission${suffix}`, { headers });
  const post = (body: unknown, headers: Record<string, string> = {}, suffix = "save") => fetch(`${origin}/api/admin/final-submission/${suffix}`, {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });

  it("미인증·평문 actor 헤더·위조 토큰은 저장소에 닿지 않는다", async () => {
    for (const headers of [{}, { "x-user-id": "verified-admin" }, { "x-user-id": `${token}tampered` }]) {
      for (const suffix of ["", "/export"]) {
        const response = await get(suffix, headers);
        expect(response.status).toBe(403);
        expect(response.headers.get("cache-control")).toBe("private, no-store");
      }
    }
    expect(repository.read).not.toHaveBeenCalled();
    expect(repository.export).not.toHaveBeenCalled();
  });

  it("쿼리의 다른 owner를 무시하고 현재 검증된 신원을 응답에 명시한다", async () => {
    const response = await get("?ownerUserId=other-admin", { "x-user-id": token });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(emptyRecord("verified-admin"));
    expect(repository.read).toHaveBeenCalledExactlyOnceWith("verified-admin");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("내보내기도 별도 요청에서 현재 신원을 다시 검사한다", async () => {
    const response = await get("/export", { "x-user-id": token });
    expect(response.status).toBe(200);
    expect(repository.export).toHaveBeenCalledExactlyOnceWith("verified-admin");
    repository.export.mockRejectedValueOnce(new ForbiddenException("권한 철회"));
    const denied = await get("/export", { "x-user-id": token });
    expect(denied.status).toBe(403);
    expect(denied.headers.get("cache-control")).toBe("private, no-store");
  });

  it("쿠키 저장에는 같은 출처·CSRF 헤더가 필요하며 owner 주입은 거부한다", async () => {
    const cookie = `toonstudio-auth-session=${token}`;
    const headers = { Cookie: cookie, Origin: origin, "x-toonstudio-csrf": "1" };
    expect((await post(submissionRequest(), { Cookie: cookie, Origin: origin })).status).toBe(403);
    expect((await post(submissionRequest(), { ...headers, Origin: "https://foreign.example" })).status).toBe(403);
    expect((await post({ ...submissionRequest(), ownerUserId: "other" }, headers)).status).toBe(400);
    expect(repository.save).not.toHaveBeenCalled();
    const input = submissionRequest();
    const response = await post(input, headers);
    expect(response.status).toBe(200);
    expect((await response.json()).ownerUserId).toBe("verified-admin");
    expect(repository.save).toHaveBeenCalledExactlyOnceWith("verified-admin", input);
  });

  it("원본 문서·외부 제출·첨부 교체·계정 접근 실행 엔드포인트가 없다", async () => {
    for (const suffix of ["submit", "replace-file", "edit-document", "connect-account", "approve", "execute"]) {
      expect((await post({}, { "x-user-id": token }, suffix)).status).toBe(404);
    }
    expect(repository.save).not.toHaveBeenCalled();
  });
});
