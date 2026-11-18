import "reflect-metadata";
import { randomBytes, randomUUID } from "node:crypto";
import { ForbiddenException, Module, type INestApplication } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  BUSINESS_PLAN_MAX_IMPORT_BYTES, createEmptyBusinessPlanState,
  type BusinessPlanRecord, type BusinessPlanState, type SaveBusinessPlanRequest,
} from "@toonstudio/contracts/business-plan";
import type { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { configureApiBodyParserBoundary } from "../../config/api-body-parser-boundary";
import { createCsrfProtectionMiddleware } from "../../csrf-middleware";
import { signSession } from "../../server/session";
import { sessionAuth } from "../../session-middleware";
import { BusinessPlanController } from "./business-plan.controller";
import { parseSaveBusinessPlanRequest } from "./business-plan.dto";
import { BusinessPlanRepository, businessPlanDigest } from "./business-plan.repository";

vi.mock("../../server/user-lifecycle", () => ({ isSessionAllowed: vi.fn(async () => true) }));

const now = new Date("2026-01-15T03:00:00.000Z");
const board = () => createEmptyBusinessPlanState(now);
const request = (value = board()): SaveBusinessPlanRequest => ({ board: value, expectedRevision: 0, mutationId: randomUUID() });

function maximumBoard(): BusinessPlanState {
  const state = board();
  state.documents[0]!.workingText = "x".repeat(524_288);
  state.documents[0]!.previousText = "y".repeat(524_288);
  state.documents[1]!.workingText = "z".repeat(524_288);
  const remaining = BUSINESS_PLAN_MAX_IMPORT_BYTES - Buffer.byteLength(JSON.stringify(state), "utf8");
  if (remaining < 0 || remaining > 524_288) throw new Error("2MiB 테스트 보드를 만들 수 없습니다.");
  state.documents[1]!.previousText = "w".repeat(remaining);
  return state;
}

describe("사업계획서 저장 요청 경계", () => {
  it("v1 문서 원문·null 후보·미확인 주장을 보존한다", () => {
    const input = request();
    const parsed = parseSaveBusinessPlanRequest(input, now);
    expect(parsed).toEqual(input);
    expect(parsed.board.claims.every((claim) => claim.factStatus === "미확인")).toBe(true);
    expect(parsed.board.documents[0]!.submission).toBeNull();
  });

  it.each([
    { expectedRevision: -1 }, { expectedRevision: 0.5 }, { expectedRevision: 2_147_483_647 },
    { expectedRevision: "0" }, { mutationId: "not-a-uuid" }, { actorUserId: "admin" },
    { updatedAt: "2026-01-15T03:00:00Z" }, { board: null },
  ])("잘못된 봉투·권한 주입을 거절한다: %j", (change) => {
    expect(() => parseSaveBusinessPlanRequest({ ...request(), ...change }, now)).toThrow();
  });

  it("확인되지 않은 근거를 확인 완료로 바꾸거나 외부 실행 상태를 가져올 수 없다", () => {
    const noEvidence = board();
    noEvidence.claims[0]!.factStatus = "근거 확인";
    expect(() => parseSaveBusinessPlanRequest(request(noEvidence), now)).toThrow();
    for (let index = 0; index < 4; index += 1) {
      const state = board();
      const unsafe = { ...state, approvals: state.approvals.map((approval, i) => i === index ? { ...approval, status: "실행 완료" } : approval) };
      expect(() => parseSaveBusinessPlanRequest({ ...request(), board: unsafe }, now)).toThrow();
    }
  });

  it("2MiB 보드는 수용하고 한 바이트 초과는 거절한다", () => {
    const state = maximumBoard();
    expect(Buffer.byteLength(JSON.stringify(state), "utf8")).toBe(BUSINESS_PLAN_MAX_IMPORT_BYTES);
    expect(parseSaveBusinessPlanRequest(request(state), now).board).toEqual(state);
    state.documents[1]!.previousText += "x";
    expect(() => parseSaveBusinessPlanRequest(request(state), now)).toThrow();
  });

  it("멱등성 digest는 JSON 객체 키 순서에 의존하지 않는다", () => {
    expect(businessPlanDigest({ b: { y: 2, x: 1 }, a: [2, 1] })).toBe(businessPlanDigest({ a: [2, 1], b: { x: 1, y: 2 } }));
    expect(businessPlanDigest([1, 2])).not.toBe(businessPlanDigest([2, 1]));
  });

  it("DB 연결 실패를 내용·연결 정보 없는 503으로 처리한다", async () => {
    const pool = { connect: vi.fn(async () => { throw new Error("sensitive-connection-detail"); }) };
    const repository = new BusinessPlanRepository(pool as unknown as Pool);
    await expect(repository.read("admin")).rejects.toMatchObject({ status: 503, response: { code: "business_plan_storage_unavailable" } });
    await expect(repository.save("admin", request())).rejects.toMatchObject({ status: 503 });
    try { await repository.read("admin"); } catch (error) { expect(String(error)).not.toContain("sensitive-connection-detail"); }
  });
});

const repository = {
  read: vi.fn(async (_actor: string): Promise<BusinessPlanRecord> => ({ board: null, revision: 0, updatedAt: null })),
  save: vi.fn(async (_actor: string, input: SaveBusinessPlanRequest): Promise<BusinessPlanRecord> => ({ board: input.board, revision: 1, updatedAt: now.toISOString() })),
};

@Module({ controllers: [BusinessPlanController], providers: [{ provide: BusinessPlanRepository, useValue: repository }] })
class BusinessPlanHttpTestModule {}

describe("사업계획서 실제 HTTP 인증·CSRF·본문 경계", () => {
  let app: INestApplication;
  let origin: string;
  let token: string;
  beforeAll(async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("AUTH_SESSION_SECRET", randomBytes(40).toString("hex"));
    token = signSession("verified-admin", 1);
    app = await NestFactory.create(BusinessPlanHttpTestModule, { logger: false, bodyParser: false });
    app.setGlobalPrefix("api");
    app.use(sessionAuth);
    app.use(createCsrfProtectionMiddleware(process.env));
    configureApiBodyParserBoundary(app, null);
    await app.listen(0, "127.0.0.1");
    origin = await app.getUrl();
  });
  beforeEach(() => { vi.clearAllMocks(); });
  afterAll(async () => { await app?.close(); vi.unstubAllEnvs(); });
  const get = (headers: Record<string, string> = {}) => fetch(`${origin}/api/admin/business-plan`, { headers });
  const post = (body: unknown, headers: Record<string, string> = {}, suffix = "save") => fetch(`${origin}/api/admin/business-plan/${suffix}`, {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
  });

  it("미인증·평문 헤더·위조 토큰은 저장소에 접근하지 못한다", async () => {
    for (const headers of [{}, { "x-user-id": "verified-admin" }, { "x-user-id": `${token}tampered` }]) {
      const response = await get(headers);
      expect(response.status).toBe(403);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(repository.read).not.toHaveBeenCalled();
  });

  it("검증된 세션 신원만 저장소로 전달하고 응답을 캐시하지 않는다", async () => {
    const response = await get({ "x-user-id": token });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ board: null, revision: 0, updatedAt: null });
    expect(repository.read).toHaveBeenCalledExactlyOnceWith("verified-admin");
  });

  it("권한 거절 응답도 private no-store를 유지한다", async () => {
    repository.read.mockRejectedValueOnce(new ForbiddenException("관리자만 이용할 수 있습니다."));
    const response = await get({ "x-user-id": token });
    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it("쿠키 저장은 기존 CSRF 헤더·동일 출처 증명이 있어야 한다", async () => {
    const cookie = `toonstudio-auth-session=${token}`;
    expect((await post(request(), { Cookie: cookie, Origin: origin })).status).toBe(403);
    expect((await post(request(), { Cookie: cookie, Origin: "https://foreign.example", "x-toonstudio-csrf": "1" })).status).toBe(403);
    expect(repository.save).not.toHaveBeenCalled();
    const input = request();
    const response = await post(input, { Cookie: cookie, Origin: origin, "x-toonstudio-csrf": "1" });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(repository.save).toHaveBeenCalledExactlyOnceWith("verified-admin", input);
  });

  it("Core API parser가 2MiB 보드와 봉투를 함께 받고 초과 보드는 저장하지 않는다", async () => {
    const state = maximumBoard();
    const response = await post(request(state), { "x-user-id": token });
    expect(response.status).toBe(200);
    expect((await response.json()).board).toEqual(state);
    state.documents[1]!.previousText += "x";
    const tooLarge = await post(request(state), { "x-user-id": token });
    expect(tooLarge.status).toBe(400);
    expect(tooLarge.headers.get("cache-control")).toBe("private, no-store");
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it("승인 기록을 실행하거나 배포하는 경로를 제공하지 않는다", async () => {
    for (const suffix of ["approve", "submit", "deploy", "execute"]) {
      expect((await post({}, { "x-user-id": token }, suffix)).status).toBe(404);
    }
    expect(repository.save).not.toHaveBeenCalled();
  });
});
