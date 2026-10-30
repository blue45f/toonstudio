import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { buildCustomerSupportRuntimeAclSql, buildCustomerSupportRuntimeAclViolationSql } from "../../../../../scripts/customer-support-database-contract.mjs";
import { CUSTOMER_SUPPORT_ACL_READY_SQL } from "../health/health-customer-support-acl";

import { PostgresCustomerSupportRepository } from "./customer-support.repository";

const target = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
const describePostgres = target ? describe : describe.skip;
const role = `support_runtime_${randomUUID().replaceAll("-", "")}`;
const migrationUrl = new URL("../../platform/database/migrations/0116_customer_support.sql", import.meta.url);

describePostgres("비공개 고객상담 PostgreSQL 권한·순서·AI 예약", () => {
  let owner: Pool;
  let runtime: Pool;
  let repository: PostgresCustomerSupportRepository;
  let migration: string;
  let roleCreated = false;
  const users: string[] = [];

  beforeAll(async () => {
    if (!target) throw new Error("고객상담 통합 테스트 DB가 필요합니다.");
    const url = new URL(target);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/test/iu.test(url.pathname)) {
      throw new Error("고객상담 통합 테스트에는 로컬 전용 test DB만 허용합니다.");
    }
    owner = new Pool({ connectionString: target, max: 4 });
    await owner.query('CREATE TABLE IF NOT EXISTS public."user" (id text PRIMARY KEY,name text,role text DEFAULT \'user\')');
    migration = await readFile(migrationUrl, "utf8");
    await owner.query(migration);
    await owner.query(`CREATE ROLE ${role} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`);
    roleCreated = true;
    await owner.query(`GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT ON public."user" TO ${role}`);
    await owner.query(buildCustomerSupportRuntimeAclSql(role));
    runtime = new Pool({ connectionString: target, options: `-c role=${role}`, max: 4 });
    repository = new PostgresCustomerSupportRepository(runtime);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (users.length) await owner.query('DELETE FROM public."user" WHERE id=ANY($1::text[])', [users.splice(0)]);
  });

  afterAll(async () => {
    await runtime?.end();
    if (owner) {
      if (roleCreated) await owner.query(`DROP OWNED BY ${role}; DROP ROLE ${role}`);
      await owner.end();
    }
  });

  async function user(): Promise<string> {
    const id = randomUUID();
    await owner.query('INSERT INTO public."user" (id,name) VALUES ($1,$2)', [id, "상담 통합 검증"]);
    users.push(id);
    return id;
  }

  async function question(ownerId: string) {
    const detail = await repository.create(ownerId, { subject: "저장 방법 문의", mode: "ai" });
    await repository.send(detail.conversation.id, ownerId, { content: "작업 저장은 어떻게 하나요?", clientMessageId: randomUUID() }, false);
    return detail.conversation.id;
  }

  it("새 테이블과 인덱스를 생성하고 기존 대화를 유지하며 재적용한다", async () => {
    const ownerId = await user();
    const id = await question(ownerId);
    await owner.query(migration);
    expect((await repository.detail(id, ownerId)).messages).toHaveLength(1);
    expect((await owner.query(`SELECT ${buildCustomerSupportRuntimeAclViolationSql(role)} AS invalid`)).rows[0].invalid).toBe(false);
    expect((await runtime.query(`SELECT ${CUSTOMER_SUPPORT_ACL_READY_SQL} AS ready`)).rows[0].ready).toBe(true);
  });

  it("빈 스키마에 추가형 migration을 적용하고 기존 자료를 보존하며 재적용한다", async () => {
    const schema = `support_fresh_${randomUUID().replaceAll("-", "")}`;
    const client = await owner.connect();
    try {
      await client.query("BEGIN");
      await client.query(`CREATE SCHEMA ${schema}; CREATE TABLE ${schema}."user" (id text PRIMARY KEY)`);
      const body = migration.slice(migration.indexOf("BEGIN;") + 6, migration.lastIndexOf("COMMIT;")).replaceAll("public.", `${schema}.`);
      await client.query(body);
      const id = randomUUID();
      await client.query(`INSERT INTO ${schema}."user" VALUES ('owner'); INSERT INTO ${schema}.customer_support_conversation(id,"ownerId",subject) VALUES ('${id}','owner','기존 자료')`);
      await client.query(body);
      expect((await client.query(`SELECT count(*)::int AS count FROM ${schema}.customer_support_conversation`)).rows[0].count).toBe(1);
      expect((await client.query(`SELECT count(*)::int AS count FROM pg_tables WHERE schemaname=$1`, [schema])).rows[0].count).toBe(4);
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
  });

  it("비소유자는 대화 조회·메시지·전환·AI 예약에 접근할 수 없다", async () => {
    const ownerId = await user();
    const outsider = await user();
    const id = await question(ownerId);
    await expect(repository.detail(id, outsider)).rejects.toMatchObject({ status: 404 });
    await expect(repository.send(id, outsider, { content: "다른 사용자", clientMessageId: randomUUID() }, false)).rejects.toMatchObject({ status: 404 });
    await expect(repository.setStatus(id, outsider, "waiting")).rejects.toMatchObject({ status: 404 });
    await expect(repository.reserveAi(id, outsider)).rejects.toMatchObject({ status: 404 });
    expect((await repository.list(outsider, undefined, 50)).total).toBe(0);
  });

  it("재전송은 한 번만 저장하고 메시지 내용 변경은 거부하며 순서를 유지한다", async () => {
    const ownerId = await user();
    const { conversation } = await repository.create(ownerId, { subject: "계정 로그인 문의", mode: "human" });
    const input = { content: "첫 질문", clientMessageId: randomUUID() };
    expect(await repository.send(conversation.id, ownerId, input, false)).toBe(true);
    expect(await repository.send(conversation.id, ownerId, input, false)).toBe(false);
    await expect(repository.send(conversation.id, ownerId, { ...input, content: "다른 질문" }, false)).rejects.toMatchObject({ status: 409 });
    await repository.send(conversation.id, ownerId, { content: "다음 질문", clientMessageId: randomUUID() }, false);
    expect((await repository.detail(conversation.id, ownerId)).messages.map((entry) => entry.content)).toEqual(["첫 질문", "다음 질문"]);
  });

  it("사용자 문의와 관리자 답변을 같은 비공개 대화에 저장한다", async () => {
    const ownerId = await user();
    const adminId = await user();
    await owner.query('UPDATE public."user" SET role=\'admin\' WHERE id=$1', [adminId]);
    expect(await repository.isOperator(ownerId)).toBe(false);
    expect(await repository.isOperator(adminId)).toBe(true);
    const { conversation } = await repository.create(ownerId, { subject: "상담원 연결 문의", mode: "human" });
    await repository.send(conversation.id, ownerId, { content: "복구 방법을 확인하고 싶어요.", clientMessageId: randomUUID() }, false);
    await repository.send(conversation.id, adminId, { content: "저장 버전 메뉴에서 복구할 수 있어요.", clientMessageId: randomUUID() }, true);
    const detail = await repository.detail(conversation.id, ownerId);
    expect(detail.conversation.status).toBe("open");
    expect(detail.messages.map((entry) => entry.role)).toEqual(["user", "admin"]);
    expect((await repository.list(null, "open", 50)).items.some((entry) => entry.id === conversation.id)).toBe(true);
  });

  it("동시에 요청해도 AI 예약은 하나이며 응답은 한 번만 저장한다", async () => {
    const ownerId = await user();
    const id = await question(ownerId);
    const attempts = await Promise.all([repository.reserveAi(id, ownerId), repository.reserveAi(id, ownerId)]);
    const lease = attempts.find((entry) => entry.lease)?.lease;
    expect(attempts.filter((entry) => entry.lease)).toHaveLength(1);
    expect(attempts.find((entry) => entry.error)?.error?.code).toBe("SUPPORT_AI_BUSY");
    if (!lease) throw new Error("AI 예약이 필요합니다.");
    await repository.finishAi(id, lease, "저장 메뉴를 확인해 주세요.");
    await repository.finishAi(id, lease, "중복 응답");
    expect((await repository.detail(id, ownerId)).messages.map((entry) => entry.role)).toEqual(["user", "assistant"]);
  });

  it("일일 사용자 예산 경계의 동시 예약 중 한 건만 승인한다", async () => {
    const ownerId = await user();
    const first = await question(ownerId);
    const second = await question(ownerId);
    await owner.query('INSERT INTO public.customer_support_ai_attempt(id,"conversationId","ownerId") SELECT gen_random_uuid(),$1,$2 FROM generate_series(1,29)', [first, ownerId]);
    const attempts = await Promise.all([repository.reserveAi(first, ownerId), repository.reserveAi(second, ownerId)]);
    expect(attempts.filter((entry) => entry.lease)).toHaveLength(1);
    expect(attempts.find((entry) => entry.error)?.error?.code).toBe("SUPPORT_AI_LIMIT");
  });

  it.each([
    "STUDIO_AI_PREMIUM_USER_DAILY_REQUEST_LIMIT",
    "STUDIO_AI_PREMIUM_GLOBAL_DAILY_REQUEST_LIMIT",
    "STUDIO_AI_PREMIUM_GLOBAL_DAILY_TOKEN_LIMIT",
  ])("운영 예산 %s 가 0이면 유료 AI를 예약하지 않는다", async (name) => {
    vi.stubEnv(name, "0");
    const ownerId = await user();
    const id = await question(ownerId);
    expect((await repository.reserveAi(id, ownerId)).error?.code).toBe("SUPPORT_AI_LIMIT");
    expect((await owner.query('SELECT count(*)::int AS count FROM public.customer_support_ai_attempt WHERE "ownerId"=$1', [ownerId])).rows[0].count).toBe(0);
  });

  it("토큰 예산 경계에서 동시 유료 요청 한 건만 예약한다", async () => {
    vi.stubEnv("STUDIO_AI_PREMIUM_GLOBAL_DAILY_TOKEN_LIMIT", "15000");
    const ownerId = await user();
    const first = await question(ownerId);
    const second = await question(ownerId);
    const attempts = await Promise.all([repository.reserveAi(first, ownerId), repository.reserveAi(second, ownerId)]);
    expect(attempts.filter((entry) => entry.lease)).toHaveLength(1);
    expect(attempts.find((entry) => entry.error)?.error?.code).toBe("SUPPORT_AI_LIMIT");
  });

  it.each([
    "STUDIO_AI_PREMIUM_USER_DAILY_REQUEST_LIMIT",
    "STUDIO_AI_PREMIUM_GLOBAL_DAILY_REQUEST_LIMIT",
  ])("낮춘 운영 요청 한도 %s 를 동시 예약에도 적용한다", async (name) => {
    vi.stubEnv(name, "1");
    const ownerId = await user();
    const first = await question(ownerId);
    const second = await question(ownerId);
    const attempts = await Promise.all([repository.reserveAi(first, ownerId), repository.reserveAi(second, ownerId)]);
    expect(attempts.filter((entry) => entry.lease)).toHaveLength(1);
    expect(attempts.find((entry) => entry.error)?.error?.code).toBe("SUPPORT_AI_LIMIT");
  });

  it("전체 일일 요청 400건 경계의 동시 예약 중 한 건만 승인한다", async () => {
    const previousOwner = await user();
    const previous = await question(previousOwner);
    await owner.query('INSERT INTO public.customer_support_ai_attempt(id,"conversationId","ownerId","reservedTokens") SELECT gen_random_uuid(),$1,$2,0 FROM generate_series(1,399)', [previous, previousOwner]);
    const ownerId = await user();
    const first = await question(ownerId);
    const second = await question(ownerId);
    const attempts = await Promise.all([repository.reserveAi(first, ownerId), repository.reserveAi(second, ownerId)]);
    expect(attempts.filter((entry) => entry.lease)).toHaveLength(1);
    expect(attempts.find((entry) => entry.error)?.error?.code).toBe("SUPPORT_AI_LIMIT");
  });

  it("잘못된 저장 요청을 rollback한 뒤 정상 메시지를 저장한다", async () => {
    const ownerId = await user();
    const { conversation } = await repository.create(ownerId, { subject: "저장 오류 검증", mode: "human" });
    await expect(repository.send(conversation.id, ownerId, { content: "", clientMessageId: randomUUID() }, false)).rejects.toMatchObject({ code: "23514" });
    expect((await repository.detail(conversation.id, ownerId)).messages).toHaveLength(0);
    await repository.send(conversation.id, ownerId, { content: "정상 질문", clientMessageId: randomUUID() }, false);
    expect((await repository.detail(conversation.id, ownerId)).messages).toHaveLength(1);
  });

  it("상담원 전환 뒤 도착한 AI 응답을 버리고 종료 후 메시지를 거부한다", async () => {
    const ownerId = await user();
    const id = await question(ownerId);
    const { lease } = await repository.reserveAi(id, ownerId);
    if (!lease) throw new Error("AI 예약이 필요합니다.");
    await repository.setStatus(id, ownerId, "waiting");
    await repository.finishAi(id, lease, "뒤늦은 AI 응답");
    expect((await repository.detail(id, ownerId)).messages).toHaveLength(1);
    await repository.setStatus(id, null, "closed");
    await expect(repository.send(id, ownerId, { content: "종료 후 질문", clientMessageId: randomUUID() }, false)).rejects.toMatchObject({ status: 409 });
    await expect(repository.setStatus(id, ownerId, "waiting")).rejects.toMatchObject({ status: 409 });
    await repository.setStatus(id, null, "open");
    expect((await repository.detail(id, ownerId)).conversation.status).toBe("open");
  });

  it("대화 소유자·기록·과금 예약 변조를 DB 권한으로 막고 권한 오염을 복구한다", async () => {
    const ownerId = await user();
    const id = await question(ownerId);
    await expect(runtime.query('UPDATE public.customer_support_conversation SET "ownerId"=$1 WHERE id=$2', [ownerId, id])).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query("UPDATE public.customer_support_message SET content='변조' WHERE \"conversationId\"=$1", [id])).rejects.toMatchObject({ code: "42501" });
    await expect(runtime.query('DELETE FROM public.customer_support_ai_attempt WHERE "conversationId"=$1', [id])).rejects.toMatchObject({ code: "42501" });
    await owner.query(`GRANT UPDATE(content) ON public.customer_support_message TO ${role}`);
    expect((await owner.query(`SELECT ${buildCustomerSupportRuntimeAclViolationSql(role)} AS invalid`)).rows[0].invalid).toBe(true);
    expect((await runtime.query(`SELECT ${CUSTOMER_SUPPORT_ACL_READY_SQL} AS ready`)).rows[0].ready).toBe(false);
    await owner.query(buildCustomerSupportRuntimeAclSql(role));
    expect((await runtime.query(`SELECT ${CUSTOMER_SUPPORT_ACL_READY_SQL} AS ready`)).rows[0].ready).toBe(true);
  });
});
