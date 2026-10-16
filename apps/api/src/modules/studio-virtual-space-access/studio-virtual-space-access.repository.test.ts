import type { Pool, PoolClient } from "pg";
import { describe, expect, it } from "vitest";

import { StudioVirtualSpaceAccessRepository } from "./studio-virtual-space-access.repository";

interface RecordedQuery {
  readonly sql: string;
  readonly params: readonly unknown[];
}

interface QueryResult {
  readonly rows: readonly Record<string, unknown>[];
  readonly rowCount: number;
}

const EMPTY: QueryResult = { rows: [], rowCount: 0 };

/**
 * 입장코드 검증 경로가 보내는 SQL 만 흉내 내는 최소 풀이다. DB 가 없어도 "어떤 행을 만들었는가"를
 * 검사할 수 있게 하려는 것이고, 실제 Postgres 동작은 integration 시험이 맡는다.
 */
function fakePool(options: { readonly issuedSpaces: ReadonlySet<string> }): {
  readonly pool: Pool;
  readonly queries: RecordedQuery[];
} {
  const queries: RecordedQuery[] = [];
  const client = {
    async query(sql: string, params: readonly unknown[] = []): Promise<QueryResult> {
      queries.push({ sql, params });
      const text = sql.replace(/\s+/gu, " ").trim();
      if (/^(BEGIN|COMMIT|ROLLBACK)$/u.test(text)) return EMPTY;
      // 공간에 발급된 코드가 하나라도 있는가(코드 해시 조건이 없는 존재 확인)
      if (
        text.startsWith('SELECT 1 FROM "studio_virtual_space_entry_code"')
        && !text.includes('"codeHash"')
      ) {
        return options.issuedSpaces.has(String(params[0]))
          ? { rows: [{ "?column?": 1 }], rowCount: 1 }
          : EMPTY;
      }
      if (text.startsWith('SELECT "failedAttempts", "lockedUntil"')) {
        return { rows: [{ failedAttempts: 0, lockedUntil: null }], rowCount: 1 };
      }
      // 살아 있는 코드 조회·회수 코드 조회: 맞는 코드가 없다.
      if (text.includes('FROM "studio_virtual_space_entry_code"')) return EMPTY;
      // 시도 기록 INSERT / UPDATE
      return { rows: [], rowCount: 1 };
    },
    release(): void {},
  };
  const pool = { connect: async () => client as unknown as PoolClient } as unknown as Pool;
  return { pool, queries };
}

function attemptWrites(queries: readonly RecordedQuery[]): RecordedQuery[] {
  // `SELECT ... FOR UPDATE` 는 쓰기가 아니므로 문장이 INSERT/UPDATE 로 시작하는 것만 센다.
  return queries.filter((query) => query.sql.includes('"studio_virtual_space_entry_attempt"')
    && /^\s*(INSERT|UPDATE)\b/u.test(query.sql));
}

describe("입장코드 검증의 시도 기록(익명 호출)", () => {
  it("코드가 한 번도 발급되지 않은 공간은 시도 기록 행을 만들지 않는다", async () => {
    const { pool, queries } = fakePool({ issuedSpaces: new Set() });
    const repository = new StudioVirtualSpaceAccessRepository(pool);

    const result = await repository.verifyEntryCode({ spaceId: "ghost-space", code: "ABCDEF" });

    expect(result).toMatchObject({ valid: false, reason: "not-found" });
    expect(attemptWrites(queries)).toEqual([]);
  });

  it("임의 공간 식별자를 바꿔 가며 호출해도 행이 늘지 않는다", async () => {
    const { pool, queries } = fakePool({ issuedSpaces: new Set(["real-space"]) });
    const repository = new StudioVirtualSpaceAccessRepository(pool);

    for (let index = 0; index < 50; index += 1) {
      await repository.verifyEntryCode({ spaceId: `rotating-${index}`, code: "ABCDEF" });
    }

    expect(attemptWrites(queries)).toEqual([]);
  });

  it("발급된 공간의 실패는 기존처럼 센다(INSERT 후 남은 횟수 UPDATE)", async () => {
    const { pool, queries } = fakePool({ issuedSpaces: new Set(["real-space"]) });
    const repository = new StudioVirtualSpaceAccessRepository(pool);

    const result = await repository.verifyEntryCode({ spaceId: "real-space", code: "ABCDEF" });

    expect(result).toEqual({ valid: false, reason: "not-found", attemptsRemaining: 4 });
    const writes = attemptWrites(queries).map((query) => query.sql.trimStart().split(/\s+/u)[0]);
    expect(writes).toEqual(["INSERT", "UPDATE"]);
  });

  it("첫 실패의 응답 모양은 발급 여부와 무관하게 같다(존재 여부를 첫 호출로 알 수 없다)", async () => {
    const { pool } = fakePool({ issuedSpaces: new Set(["real-space"]) });
    const repository = new StudioVirtualSpaceAccessRepository(pool);

    const known = await repository.verifyEntryCode({ spaceId: "real-space", code: "ABCDEF" });
    const unknown = await repository.verifyEntryCode({ spaceId: "ghost-space", code: "ABCDEF" });

    expect(unknown).toEqual(known);
  });
});
