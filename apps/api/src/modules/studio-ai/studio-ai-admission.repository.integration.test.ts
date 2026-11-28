import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { StudioOpenAiAssistIdempotency, type CreativeAssistSendBoundary } from "./openai-assist/studio-openai-assist-idempotency";
import { StudioOpenAiCreativeAssistService } from "./studio-openai-creative-assist.service";
import { preflightStudioAiAdmissionSchema } from "./studio-ai-admission-schema-preflight";
import { PostgresStudioAiAdmissionRepository } from "./studio-ai-admission.repository";
import {
  STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS,
  studioAiCanonicalRequestHash,
  studioAiUserIdempotencyKeyHash,
} from "./studio-ai-idempotency";
import { preflightStudioAiIdempotencySchema } from "./studio-ai-idempotency-schema-preflight";

import type { StudioAiRequestIdentity } from "./studio-ai-admission";

const INTEGRATION_URL = process.env.STUDIO_LIVE_POSTGRES_INTEGRATION_URL?.trim();
if (process.env.CI && !INTEGRATION_URL) {
  throw new Error(
    "CI must provide STUDIO_LIVE_POSTGRES_INTEGRATION_URL; Studio AI admission fencing cannot be skipped"
  );
}
const describeWithDirectPostgres = INTEGRATION_URL ? describe : describe.skip;

function forwardMigrationBody(source: string, migrationName: string): string {
  const beginAt = source.indexOf("BEGIN;");
  const commitAt = source.lastIndexOf("COMMIT;");
  if (beginAt < 0 || commitAt <= beginAt) {
    throw new Error(`${migrationName} must keep one explicit outer transaction`);
  }
  return source.slice(beginAt + "BEGIN;".length, commitAt);
}

function requestIdentity(
  userId: string,
  requestLabel: string,
  operationId = `integration-${randomUUID()}`
): StudioAiRequestIdentity {
  return {
    userKeyHash: studioAiUserIdempotencyKeyHash(userId, operationId),
    requestHash: studioAiCanonicalRequestHash({
      task: "composition",
      promptVersion: 1,
      system: "integration boundary",
      user: requestLabel,
    }),
  };
}

describeWithDirectPostgres("Studio AI admission PostgreSQL fencing", () => {
  const userIds: string[] = [];
  let observerPool: Pool;
  let poolA: Pool;
  let poolB: Pool;
  let repositoryA: PostgresStudioAiAdmissionRepository;
  let repositoryB: PostgresStudioAiAdmissionRepository;

  beforeAll(() => {
    if (!INTEGRATION_URL) throw new Error("integration URL was not provided");
    observerPool = new Pool({ connectionString: INTEGRATION_URL, max: 2 });
    poolA = new Pool({ connectionString: INTEGRATION_URL, max: 1 });
    poolB = new Pool({ connectionString: INTEGRATION_URL, max: 1 });
    repositoryA = new PostgresStudioAiAdmissionRepository(poolA);
    repositoryB = new PostgresStudioAiAdmissionRepository(poolB);
  });

  afterEach(async () => {
    const ids = userIds.splice(0);
    if (ids.length > 0) {
      await observerPool.query('DELETE FROM "user" WHERE "id" = ANY($1::text[])', [ids]);
    }
  });

  afterAll(async () => {
    await Promise.all([observerPool?.end(), poolA?.end(), poolB?.end()]);
  });

  async function createUser(): Promise<string> {
    const userId = randomUUID();
    await observerPool.query('INSERT INTO "user" ("id", "name") VALUES ($1, $2)', [
      userId,
      "Studio AI admission integration",
    ]);
    userIds.push(userId);
    return userId;
  }

  const assistInput = { mode: "dialogue-polish", inputText: "우산을 돌려주는 장면에서 대사를 줄여 주세요." } as const;
  const assistEnv = { OPENAI_API_KEY: "offline-placeholder", OPENAI_MODEL: "gpt-6.2-astra" };
  function assistResponse() {
    const balloons = [
      { toneLabel: "구어체", line: "돌아갈까?", subBubble: "", reason: "질문" },
      { toneLabel: "핵심형", line: "이제 가자.", subBubble: "", reason: "제안" },
    ];
    return Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify({ readabilityNote: "두 가지 대안", balloons }) } }] });
  }
  function assistService(repository: PostgresStudioAiAdmissionRepository) {
    return new StudioOpenAiCreativeAssistService(undefined, new StudioOpenAiAssistIdempotency(repository));
  }

  it("창작 요청의 키와 원고를 사용자별로 구분하고 같은 원고의 성공은 재전송 없이 재생한다", async () => {
    const userId = await createUser();
    const actor = "user:" + userId;
    const key = randomUUID();
    const a = assistService(repositoryA);
    const b = assistService(repositoryB);
    const entered = Promise.withResolvers<void>();
    const finish = Promise.withResolvers<void>();
    const fetchImpl = vi.fn(async () => { entered.resolve(); await finish.promise; return assistResponse(); });
    const immediate = vi.fn(async () => assistResponse());
    const options = { env: assistEnv, idempotencyKey: key, fetchImpl };
    const first = a.assist(actor, assistInput, options);
    await entered.promise;
    try {
      await expect(b.assist(actor, assistInput, options)).rejects.toMatchObject({ status: 425, response: { code: "OPENAI_REQUEST_IN_PROGRESS" } });
      await expect(b.assist(actor, { ...assistInput, inputText: "다른 원고입니다." }, options)).rejects.toMatchObject({ status: 409, response: { code: "OPENAI_IDEMPOTENCY_KEY_REUSED" } });
      // 다른 창작 의도는 첫 작업 중에도 병렬 실행할 수 있다.
      await b.assist(actor, assistInput, { ...options, idempotencyKey: randomUUID(), fetchImpl: immediate });
    } finally { finish.resolve(); }
    const result = await first;
    expect(await a.assist(actor, assistInput, options)).toEqual(result);
    await expect(b.assist(actor, assistInput, options)).rejects.toMatchObject({ status: 409, response: { code: "OPENAI_RESULT_ALREADY_PRODUCED" } });
    await b.assist("user:" + await createUser(), assistInput, { ...options, fetchImpl: immediate });
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(immediate).toHaveBeenCalledTimes(2);
  });

  it("영수증 확정 중 취소하면 미전송 요청만 해제하고 실제 전송 후 취소는 다시 보내지 않는다", async () => {
    const actor = "user:" + await createUser();
    const a = assistService(repositoryA);
    const b = assistService(repositoryB);
    const cancel = new AbortController();
    const actualMarkSent = repositoryA.markSent.bind(repositoryA);
    const before = vi.spyOn(repositoryA, "markSent").mockImplementationOnce(async (receipt) => {
      const marked = await actualMarkSent(receipt);
      cancel.abort();
      return marked;
    });
    const fetchImpl = vi.fn(async () => assistResponse());
    const options = { env: assistEnv, idempotencyKey: randomUUID(), fetchImpl };
    try {
      await expect(a.assist(actor, assistInput, { ...options, signal: cancel.signal })).rejects.toMatchObject({ status: 499 });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally { before.mockRestore(); }
    await b.assist(actor, assistInput, options);
    expect(fetchImpl).toHaveBeenCalledOnce();

    const after = new AbortController();
    const sent = vi.fn(async () => { after.abort(); throw new Error("전송 후 연결 중단"); });
    const second = { env: assistEnv, idempotencyKey: randomUUID(), fetchImpl: sent };
    await expect(a.assist(actor, assistInput, { ...second, signal: after.signal })).rejects.toMatchObject({ status: 499 });
    await expect(b.assist(actor, assistInput, second)).rejects.toMatchObject({ status: 409, response: { code: "OPENAI_REQUEST_OUTCOME_UNKNOWN" } });
    expect(sent).toHaveBeenCalledOnce();
  });

  it("DB 전송 승인 응답이 유실돼도 미전송 영수증만 해제하고 같은 키로 복구한다", async () => {
    const actor = "user:" + await createUser();
    const a = assistService(repositoryA);
    const fetchImpl = vi.fn(async () => assistResponse());
    const options = { env: assistEnv, idempotencyKey: randomUUID(), fetchImpl };
    const mark = repositoryA.markSent.bind(repositoryA);
    const fault = vi.spyOn(repositoryA, "markSent").mockImplementationOnce(async receipt => {
      await mark(receipt);
      throw new Error("DB 응답 유실");
    });
    try {
      await expect(a.assist(actor, assistInput, options)).rejects.toMatchObject({ status: 503, response: { code: "OPENAI_IDEMPOTENCY_UNAVAILABLE" } });
      expect(fetchImpl).not.toHaveBeenCalled();
    } finally { fault.mockRestore(); }
    await assistService(repositoryB).assist(actor, assistInput, options);
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("사용량이 있는 출력 잘림과 형식 오류는 같은 키로 유료 생성을 반복하지 않는다", async () => {
    const actor = "user:" + await createUser();
    const a = assistService(repositoryA);
    for (const choice of [
      { finish_reason: "length", message: { content: "" } },
      { finish_reason: "stop", message: { content: "{}" } },
    ]) {
      const fetchImpl = vi.fn(async () => Response.json({ choices: [choice], usage: { total_tokens: 15 } }));
      const options = { env: assistEnv, idempotencyKey: randomUUID(), fetchImpl };
      await expect(a.assist(actor, assistInput, options)).rejects.toMatchObject({ status: 502 });
      await expect(a.assist(actor, assistInput, options)).rejects.toMatchObject({ status: 409, response: { code: "OPENAI_REQUEST_OUTCOME_UNKNOWN" } });
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  });

  it("전송 전 선점이 만료되면 다른 워커만 재선점하고 지연된 소유자는 전송할 수 없다", async () => {
    const userId = await createUser();
    const identity = requestIdentity(userId, "창작 선점");
    const original = { ...identity, userId, fence: "1" };
    const replacement = { ...original, fence: "2" };
    expect(await repositoryA.claimCreativeAssist(original)).toBeNull();
    const expires = await observerPool.query<{ remaining: number }>(
      `SELECT EXTRACT(EPOCH FROM ("expiresAt" - clock_timestamp()))::float8 AS remaining
       FROM "studio_ai_request_receipt" WHERE "userId" = $1`, [userId],
    );
    expect(expires.rows[0].remaining).toBeGreaterThan(0);
    expect(expires.rows[0].remaining).toBeLessThanOrEqual(15);
    expect(await repositoryB.claimCreativeAssist(replacement)).toBe("request_admitted");
    await observerPool.query(
      `UPDATE "studio_ai_request_receipt" SET "expiresAt" = clock_timestamp() WHERE "userId" = $1`, [userId],
    );
    expect(await repositoryA.markSent(original)).toBe(false);
    expect(await repositoryB.claimCreativeAssist(replacement)).toBeNull();
    expect(await repositoryA.markSent(original)).toBe(false);
    expect(await repositoryA.abandonBeforeSend(original)).toBe(false);
    expect(await repositoryB.markSent(replacement)).toBe(true);
    expect(await repositoryB.markSucceeded(replacement)).toBe(true);
  });

  it("생성 전 확정된 인증·한도 거절은 같은 키로 재시도하고 불명확한 오류는 보류한다", async () => {
    for (const [status, code] of [[429, "rate_limit_exceeded"], [401, "invalid_api_key"], [403, "permission_denied"]] as const) {
      const actor = "user:" + await createUser();
      const a = assistService(repositoryA);
      const fetchImpl = vi.fn(async () => assistResponse()).mockResolvedValueOnce(Response.json({ error: { code } }, { status }));
      const options = { env: assistEnv, idempotencyKey: randomUUID(), fetchImpl };
      await expect(a.assist(actor, assistInput, options)).rejects.toMatchObject({ status: status === 429 ? 429 : 503 });
      const result = await a.assist(actor, assistInput, options);
      expect(await a.assist(actor, assistInput, options)).toEqual(result);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    }
    for (const status of [429, 500]) {
      const actor = "user:" + await createUser();
      const a = assistService(repositoryA);
      const fetchImpl = vi.fn(async () => Response.json({ error: { code: "unknown" } }, { status }));
      const options = { env: assistEnv, idempotencyKey: randomUUID(), fetchImpl };
      await expect(a.assist(actor, assistInput, options)).rejects.toBeInstanceOf(Error);
      await expect(a.assist(actor, assistInput, options)).rejects.toMatchObject({ response: { code: "OPENAI_REQUEST_OUTCOME_UNKNOWN" } });
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  });

  it("모든 계정의 결과를 합쳐 캐시 항목·UTF-8 크기·보존 시간을 제한한다", async () => {
    const a = new StudioOpenAiAssistIdempotency(repositoryA);
    const actor = "user:" + await createUser();
    const other = "user:" + await createUser();
    async function complete(boundary: CreativeAssistSendBoundary, result = "결과") {
      await boundary.authorize();
      boundary.dispatched();
      return result;
    }
    const oldest = randomUUID();
    await a.run(actor, assistInput, oldest, complete);
    for (let index = 0; index < 64; index++) {
      await a.run(other, assistInput, randomUUID(), complete);
    }
    const retry = vi.fn(complete);
    const lost = { response: { code: "OPENAI_RESULT_ALREADY_PRODUCED" } };
    await expect(a.run(actor, assistInput, oldest, retry)).rejects.toMatchObject(lost);
    const oversized = randomUUID();
    await a.run(actor, assistInput, oversized, boundary => complete(boundary, "한".repeat(22_000)));
    await expect(a.run(actor, assistInput, oversized, retry)).rejects.toMatchObject(lost);
    const last = randomUUID();
    await a.run(actor, assistInput, last, complete);
    expect(await a.run(actor, assistInput, last, retry)).toBe("결과");
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + STUDIO_AI_IDEMPOTENCY_RECEIPT_RETENTION_MS + 1);
    try {
      await expect(a.run(actor, assistInput, last, retry)).rejects.toMatchObject(lost);
    } finally { clock.mockRestore(); }
    expect(retry).not.toHaveBeenCalled();
  });

  it("accepts the exact migrated schema through the real catalog preflight", async () => {
    await expect(preflightStudioAiAdmissionSchema(observerPool)).resolves.toBeUndefined();
    await expect(preflightStudioAiIdempotencySchema(observerPool)).resolves.toBeUndefined();
  });

  it("transactionally repairs a weak same-name lease CHECK on migration reapply", async () => {
    const migration = forwardMigrationBody(
      await readFile(
        new URL(
          "../../platform/database/migrations/0018_studio_ai_request_gate.sql",
          import.meta.url
        ),
        "utf8"
      ),
      "0018_studio_ai_request_gate.sql"
    );
    const client = await observerPool.connect();
    let transactionOpen = false;
    try {
      await client.query("BEGIN");
      transactionOpen = true;
      await client.query(
        "SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended($1, 0))",
        ["toonstudio-schema-repair-0018"]
      );
      await client.query("SAVEPOINT studio_ai_schema_repair");
      await client.query(`
        ALTER TABLE "studio_ai_request_gate"
          DROP CONSTRAINT "studio_ai_request_gate_lease_state_check";
        ALTER TABLE "studio_ai_request_gate"
          ADD CONSTRAINT "studio_ai_request_gate_lease_state_check"
          CHECK (
            ("leaseTokenHash" IS NULL AND "leaseExpiresAt" IS NULL)
            OR (
              octet_length("leaseTokenHash") = 32
              AND "leaseExpiresAt" IS NOT NULL
            )
            OR true
          );
      `);

      await expect(preflightStudioAiAdmissionSchema(client)).rejects.toThrow(
        /0018_studio_ai_request_gate\.sql/u
      );

      await client.query(migration);
      await expect(preflightStudioAiAdmissionSchema(client)).resolves.toBeUndefined();

      const userId = randomUUID();
      await client.query('INSERT INTO "user" ("id", "name") VALUES ($1, $2)', [
        userId,
        "Studio AI schema repair",
      ]);
      await client.query(
        `INSERT INTO "studio_ai_request_gate" ("userId", "requestTimes", "leaseFence")
         VALUES ($1, '{}'::timestamptz[], 0)`,
        [userId]
      );
      await client.query("SAVEPOINT studio_ai_invalid_row");
      let rejection: { code?: string; constraint?: string } | undefined;
      try {
        await client.query(
          `UPDATE "studio_ai_request_gate"
           SET "leaseTokenHash" = NULL,
               "leaseExpiresAt" = clock_timestamp() + interval '30 seconds'
           WHERE "userId" = $1`,
          [userId]
        );
      } catch (error) {
        rejection = error as { code?: string; constraint?: string };
        await client.query("ROLLBACK TO SAVEPOINT studio_ai_invalid_row");
      }
      expect(rejection).toMatchObject({
        code: "23514",
        constraint: "studio_ai_request_gate_lease_state_check",
      });

      await client.query("ROLLBACK TO SAVEPOINT studio_ai_schema_repair");
      await client.query("COMMIT");
      transactionOpen = false;
    } finally {
      if (transactionOpen) await client.query("ROLLBACK");
      client.release();
    }
  });

  it("renews an expired exact identity but rejects it after a newer fenced acquire", async () => {
    const userId = await createUser();
    const acquired = await repositoryA.acquire({
      userId,
      identity: requestIdentity(userId, "first renewable request"),
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    });
    expect(acquired.status).toBe("acquired");
    if (acquired.status !== "acquired") throw new Error("expected the first lease to be acquired");

    await observerPool.query(
      'UPDATE "studio_ai_request_gate" SET "leaseExpiresAt" = clock_timestamp() - interval \'1 second\' WHERE "userId" = $1',
      [userId]
    );
    await expect(repositoryA.renew({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
      leaseMs: 30_000,
    })).resolves.toMatchObject({ fence: acquired.lease.fence });

    await observerPool.query(
      'UPDATE "studio_ai_request_gate" SET "leaseExpiresAt" = clock_timestamp() - interval \'1 second\' WHERE "userId" = $1',
      [userId]
    );
    const replacement = await repositoryB.acquire({
      userId,
      identity: requestIdentity(userId, "replacement request"),
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    });
    expect(replacement.status).toBe("acquired");
    if (replacement.status !== "acquired") throw new Error("expected a replacement lease");
    expect(BigInt(replacement.lease.fence)).toBeGreaterThan(BigInt(acquired.lease.fence));

    await expect(repositoryA.renew({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
      leaseMs: 30_000,
    })).resolves.toBeNull();
    await expect(repositoryA.release({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
    })).resolves.toBe(false);
    await expect(repositoryB.release({
      userId,
      token: replacement.lease.token,
      fence: replacement.lease.fence,
    })).resolves.toBe(true);
  });

  it("serializes the one-request rolling window across two pools", async () => {
    const userId = await createUser();
    const firstInput = {
      userId,
      identity: requestIdentity(userId, "rate window request A"),
      requestLimit: 1,
      windowMs: 60_000,
      leaseMs: 30_000,
    };
    const secondInput = {
      ...firstInput,
      identity: requestIdentity(userId, "rate window request B"),
    };

    const results = await Promise.all([
      repositoryA.acquire(firstInput),
      repositoryB.acquire(secondInput),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual(["acquired", "rate_limited"]);
    const acquired = results.find((result) => result.status === "acquired");
    if (!acquired || acquired.status !== "acquired") throw new Error("expected one acquired lease");
    await expect(repositoryA.release({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
    })).resolves.toBe(true);
  });

  it("serializes one canonical request across pools and blocks a changed request reusing its key", async () => {
    const userId = await createUser();
    const operationId = `integration-${randomUUID()}`;
    const identity = requestIdentity(userId, "same paid request", operationId);
    const input = {
      userId,
      identity,
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    };

    const results = await Promise.all([repositoryA.acquire(input), repositoryB.acquire(input)]);
    expect(results.filter((result) => result.status === "acquired")).toHaveLength(1);
    expect(results).toContainEqual({
      status: "idempotency_conflict",
      reason: "request_admitted",
    });
    const acquired = results.find((result) => result.status === "acquired");
    if (!acquired || acquired.status !== "acquired") throw new Error("expected one acquired receipt");

    await expect(repositoryB.acquire({
      ...input,
      identity: requestIdentity(userId, "changed paid request", operationId),
    })).resolves.toEqual({
      status: "idempotency_conflict",
      reason: "key_reused_with_different_request",
    });
    await expect(repositoryA.abandonBeforeSend({
      userId,
      ...acquired.receipt,
    })).resolves.toBe(true);
    await expect(repositoryA.release({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
    })).resolves.toBe(true);
  });

  it("keeps sent and ambiguous outcomes replay-blocking for a different operation key", async () => {
    const userId = await createUser();
    const identity = requestIdentity(userId, "ambiguous paid request");
    const acquired = await repositoryA.acquire({
      userId,
      identity,
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    });
    if (acquired.status !== "acquired") throw new Error("expected acquired receipt");
    const mutation = { userId, ...acquired.receipt };

    await expect(repositoryA.markSent(mutation)).resolves.toBe(true);
    await expect(repositoryA.release({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
    })).resolves.toBe(true);
    await expect(repositoryB.acquire({
      userId,
      identity: requestIdentity(userId, "ambiguous paid request"),
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    })).resolves.toEqual({ status: "idempotency_conflict", reason: "request_sent" });

    await expect(repositoryA.markAmbiguous(mutation)).resolves.toBe(true);
    await expect(repositoryB.acquire({
      userId,
      identity: requestIdentity(userId, "ambiguous paid request"),
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    })).resolves.toEqual({ status: "idempotency_conflict", reason: "request_ambiguous" });
  });

  it("keeps succeeded outcomes replay-blocking but removes a verified pre-send admission", async () => {
    const userId = await createUser();
    const identity = requestIdentity(userId, "successful paid request");
    const input = {
      userId,
      identity,
      requestLimit: 20,
      windowMs: 60_000,
      leaseMs: 30_000,
    };
    const acquired = await repositoryA.acquire(input);
    if (acquired.status !== "acquired") throw new Error("expected acquired receipt");
    const mutation = { userId, ...acquired.receipt };
    await expect(repositoryA.markSent(mutation)).resolves.toBe(true);
    await expect(repositoryA.markSucceeded(mutation)).resolves.toBe(true);
    await expect(repositoryA.release({
      userId,
      token: acquired.lease.token,
      fence: acquired.lease.fence,
    })).resolves.toBe(true);

    await expect(repositoryB.acquire({
      ...input,
      identity: requestIdentity(userId, "successful paid request"),
    })).resolves.toEqual({ status: "idempotency_conflict", reason: "request_succeeded" });

    const secondUserId = await createUser();
    const retryableInput = {
      ...input,
      userId: secondUserId,
      identity: requestIdentity(secondUserId, "pre-send retry"),
    };
    const retryable = await repositoryA.acquire(retryableInput);
    if (retryable.status !== "acquired") throw new Error("expected retryable admission");
    await expect(repositoryA.abandonBeforeSend({
      userId: secondUserId,
      ...retryable.receipt,
    })).resolves.toBe(true);
    await expect(repositoryA.release({
      userId: secondUserId,
      token: retryable.lease.token,
      fence: retryable.lease.fence,
    })).resolves.toBe(true);
    const retried = await repositoryB.acquire(retryableInput);
    expect(retried.status).toBe("acquired");
    if (retried.status !== "acquired") throw new Error("expected a safe retry");
    await repositoryB.abandonBeforeSend({ userId: secondUserId, ...retried.receipt });
    await repositoryB.release({
      userId: secondUserId,
      token: retried.lease.token,
      fence: retried.lease.fence,
    });
  });

  it("rejects a NULL token digest paired with a non-NULL expiry", async () => {
    const userId = await createUser();
    await observerPool.query(
      `INSERT INTO "studio_ai_request_gate" ("userId", "requestTimes", "leaseFence")
       VALUES ($1, '{}'::timestamptz[], 0)`,
      [userId]
    );

    let rejection: { code?: string; constraint?: string } | undefined;
    try {
      await observerPool.query(
        `UPDATE "studio_ai_request_gate"
         SET "leaseTokenHash" = NULL,
             "leaseExpiresAt" = clock_timestamp() + interval '30 seconds'
         WHERE "userId" = $1`,
        [userId]
      );
    } catch (error) {
      rejection = error as { code?: string; constraint?: string };
    }
    expect(rejection).toMatchObject({
      code: "23514",
      constraint: "studio_ai_request_gate_lease_state_check",
    });
  });
});
