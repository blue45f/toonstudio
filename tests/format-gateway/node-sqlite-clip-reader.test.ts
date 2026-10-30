import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { createNodeSqliteOpener, openNodeSqlite } from "../corpus/formats/node-sqlite-clip-reader";

import type { ClipSqliteDatabase } from "../../packages/studio-format-gateway/src/chunked-sqlite-document-types";

const TEMP_PREFIX = "clip-reader-";
/** 이 파일의 시험만 쓰는 임시 디렉터리 루트. 다른 시험 파일이 병렬로 열고 닫는 판독기의 디렉터리가 세어지지 않게 한다. */
const PRIVATE_ROOT = mkdtempSync(join(tmpdir(), "clip-reader-root-"));
const privateOpener = createNodeSqliteOpener({ tempRoot: PRIVATE_ROOT });

function leftoverDirectories(): string[] {
  return readdirSync(PRIVATE_ROOT).filter((name) => name.startsWith(TEMP_PREFIX));
}

/** 표 `T(id, name, data, ratio)`를 가진 작은 SQLite 파일의 바이트. */
function sampleDatabase(): Uint8Array {
  const directory = mkdtempSync(join(tmpdir(), "clip-reader-test-"));
  try {
    const path = join(directory, "sample.sqlite");
    const database = new DatabaseSync(path);
    database.exec("CREATE TABLE T (id INTEGER, name TEXT, data BLOB, ratio REAL)");
    const insert = database.prepare("INSERT INTO T VALUES (?, ?, ?, ?)");
    insert.run(1, "가나다라마바사", Uint8Array.of(1, 2, 3, 4, 5, 6), 0.5);
    insert.run(2, "ab", Uint8Array.of(9), 1.25);
    insert.run(3, null, null, null);
    insert.run(2 ** 62, "big", Uint8Array.of(), 2);
    // 숫자 매개변수는 실수로 묶이므로 정수 셀이 필요하면 bigint로 넘긴다. BLOB 친화성 열은 값을 바꾸지 않고 그대로 담는다.
    insert.run(7, "xyz", 67890n, 1e300);
    database.close();
    return new Uint8Array(readFileSync(path));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

const opened: ClipSqliteDatabase[] = [];

async function open(bytes = sampleDatabase()): Promise<ClipSqliteDatabase> {
  const database = await openNodeSqlite(bytes, {});
  opened.push(database);
  return database;
}

afterEach(async () => {
  for (const database of opened.splice(0)) await database.close();
});

afterAll(() => {
  rmSync(PRIVATE_ROOT, { recursive: true, force: true });
});

describe("node:sqlite ClipSqliteOpener", () => {
  it("tableColumns는 열 이름을 선언 순서로 돌려주고 없는 표는 null이다", async () => {
    const database = await open();

    expect(await database.tableColumns("T")).toEqual(["id", "name", "data", "ratio"]);
    expect(await database.tableColumns("Nope")).toBeNull();
  });

  it("정수 셀은 bigint로 돌려줘 2^53을 넘는 값이 뭉개지지 않는다", async () => {
    const database = await open();
    const rows = await database.select({ table: "T", columns: [{ name: "id" }], orderBy: "id", limit: 10 });

    expect(rows.map((row) => row[0])).toEqual([1n, 3n, 7n, 2n, 4611686018427387904n].sort((left, right) => (left < right ? -1 : 1)));
    expect(typeof rows[0]![0]).toBe("bigint");
  });

  it("실수는 수로, 글자·BLOB·NULL은 그대로 돌려준다", async () => {
    const database = await open();
    const rows = await database.select({ table: "T", columns: [{ name: "name" }, { name: "data" }, { name: "ratio" }], where: { column: "id", in: [1, 3] }, orderBy: "id", limit: 10 });

    expect(rows[0]![0]).toBe("가나다라마바사");
    expect(Array.from(rows[0]![1] as Uint8Array)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows[0]![2]).toBe(0.5);
    expect(rows[1]).toEqual([null, null, null]);
  });

  it("limit 열은 TEXT는 글자, BLOB은 바이트 단위로 앞에서 자르고 숫자·NULL은 그대로 둔다", async () => {
    const database = await open();
    const rows = await database.select({ table: "T", columns: [{ name: "name", limit: 3 }, { name: "data", limit: 4 }, { name: "ratio", limit: 2 }], where: { column: "id", in: [1, 2, 3] }, orderBy: "id", limit: 10 });

    expect(rows[0]![0]).toBe("가나다");
    expect(Array.from(rows[0]![1] as Uint8Array)).toEqual([1, 2, 3, 4]);
    expect(rows[0]![2]).toBe(0.5);
    // 짧은 값은 그대로다.
    expect(rows[1]![0]).toBe("ab");
    expect(Array.from(rows[1]![1] as Uint8Array)).toEqual([9]);
    expect(rows[2]).toEqual([null, null, null]);
  });

  it("limit 열에 든 숫자 셀은 글자로 바뀌지 않고 그대로 돌려준다(BLOB 열에 정수가 든 경우)", async () => {
    const database = await open();
    const rows = await database.select({ table: "T", columns: [{ name: "name", limit: 2 }, { name: "data", limit: 2 }], where: { column: "id", in: [7] }, limit: 10 });

    expect(rows[0]).toEqual(["xy", 67890n]);
  });

  it("limit이 1 이상의 정수가 아니면 던진다", async () => {
    const database = await open();
    for (const limit of [0, -1, 1.5, Number.NaN]) {
      await expect(Promise.resolve().then(() => database.select({ table: "T", columns: [{ name: "name", limit }], limit: 1 }))).rejects.toThrow("limit은 1 이상의 정수여야 한다");
    }
  });

  it("present·length 모드와 where·distinct·orderBy·limit을 처리한다", async () => {
    const database = await open();
    const modes = await database.select({
      table: "T",
      columns: [{ name: "data", mode: "present" }, { name: "name", mode: "length" }, { name: "data", mode: "length" }],
      where: { column: "id", in: [1, 2, 3] },
      orderBy: "id",
      limit: 10,
    });
    expect(modes).toEqual([[1n, 7n, 6n], [1n, 2n, 1n], [0n, null, null]]);

    const limited = await database.select({ table: "T", columns: [{ name: "id" }], orderBy: "id", limit: 2 });
    expect(limited.map((row) => row[0])).toEqual([1n, 2n]);
    const distinct = await database.select({ table: "T", columns: [{ name: "ratio", mode: "present" }], distinct: true, orderBy: "ratio", limit: 10 });
    expect(distinct.map((row) => row[0]).sort()).toEqual([0n, 1n]);
  });

  it("식별자가 올바르지 않으면 던진다", async () => {
    const database = await open();

    expect(() => database.select({ table: 'T"; DROP TABLE T; --', columns: [{ name: "id" }], limit: 1 })).toThrow("허용하지 않는 식별자");
    expect(() => database.select({ table: "T", columns: [{ name: "id) FROM T; --" }], limit: 1 })).toThrow("허용하지 않는 식별자");
    expect(() => database.tableColumns("1T")).toThrow("허용하지 않는 식별자");
  });

  it("close는 임시 파일을 지운다(이 시험의 임시 루트만 센다)", async () => {
    expect(leftoverDirectories()).toEqual([]);
    const database = await privateOpener(sampleDatabase(), {});
    expect(leftoverDirectories()).toHaveLength(1);
    await database.close();

    expect(leftoverDirectories()).toEqual([]);
  });

  it("열다가 실패하면 임시 파일을 남기지 않고 던진다", () => {
    expect(() => privateOpener(5 as never, {})).toThrow();
    expect(leftoverDirectories()).toEqual([]);
  });

  it("호출을 기록하고 지정한 조회에서 오류를 던지며 열기 오류와 행 변환도 시험용으로 지원한다", async () => {
    const log = { selects: [] as never[], tableColumnCalls: 0, closed: false };
    const failure = new Error("조회 실패");
    const opener = createNodeSqliteOpener({ log, failSelectAt: { call: 1, error: failure }, transformRows: (_request, rows) => rows.slice(0, 1) });
    const database = await opener(sampleDatabase(), {});
    opened.push(database);

    await database.tableColumns("T");
    expect(log.tableColumnCalls).toBe(1);
    expect(await database.select({ table: "T", columns: [{ name: "id" }], limit: 10 })).toHaveLength(1);
    expect(() => database.select({ table: "T", columns: [{ name: "id" }], limit: 10 })).toThrow(failure);
    expect(log.selects).toHaveLength(2);
    expect(() => createNodeSqliteOpener({ failOpen: new Error("열기 실패") })(sampleDatabase(), {})).toThrow("열기 실패");
  });
});
