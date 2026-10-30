/**
 * 테스트·검사 도구용 `ClipSqliteOpener`: 문서 DB 바이트를 임시 파일에 쓰고 `node:sqlite`로 읽기 전용으로 연다.
 * 앱에서는 sqlite-wasm 같은 다른 구현을 주입한다. 이 판독기는 `ClipSqliteDatabase`의 약속(가져오기가 만든 SELECT만 실행, 식별자는 검증)을 지킨다.
 *
 * 한계: `limit` 열을 `substr`로 자르므로 SQLite 엔진이 큰 셀 전체를 엔진 메모리에 올릴 수 있다(JS 힙으로 옮기는 양만 제한된다). 신뢰할 수 없는
 * 큰 파일을 여는 앱의 판독기는 `length()`로 크기를 먼저 보고 큰 셀을 읽지 않아야 한다(`ClipSqliteColumn.limit`의 설명 참조).
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import type {
  ClipSqliteColumn,
  ClipSqliteDatabase,
  ClipSqliteOpener,
  ClipSqliteSelect,
  ClipSqliteValue,
} from "../../../packages/studio-format-gateway/src/chunked-sqlite-document-types";

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/u;

function identifier(name: string): string {
  if (!IDENTIFIER.test(name)) throw new Error(`허용하지 않는 식별자: ${JSON.stringify(name)}`);
  return `"${name}"`;
}

function projection(column: ClipSqliteColumn, alias: string): string {
  const name = identifier(column.name);
  switch (column.mode ?? "value") {
    case "present":
      return `(${name} IS NOT NULL) AS ${alias}`;
    case "length":
      return `length(${name}) AS ${alias}`;
    default: {
      if (column.limit === undefined) return `${name} AS ${alias}`;
      if (!Number.isSafeInteger(column.limit) || column.limit < 1) throw new Error(`limit은 1 이상의 정수여야 한다: ${String(column.limit)}`);
      // TEXT·BLOB만 데이터베이스 안에서 자르고 정수·실수 셀은 그대로 돌려준다(`substr`은 숫자 셀을 문자열로 바꾸기 때문이다).
      return `CASE WHEN typeof(${name}) IN ('text', 'blob') THEN substr(${name}, 1, ${column.limit}) ELSE ${name} END AS ${alias}`;
    }
  }
}

export interface NodeSqliteCallLog {
  readonly selects: ClipSqliteSelect[];
  tableColumnCalls: number;
  closed: boolean;
}

export interface NodeSqliteOptions {
  /** 임시 파일 디렉터리를 만들 곳. 기본은 OS 임시 디렉터리이며, 시험이 자기 디렉터리만 세고 싶을 때 따로 준다. */
  readonly tempRoot?: string;
  /** 호출을 기록한다(조회 횟수·요청 모양 확인용). */
  readonly log?: NodeSqliteCallLog;
  /** 지정한 번째(0부터) `select`에서 이 오류를 던진다. */
  readonly failSelectAt?: { readonly call: number; readonly error: Error };
  /** 열 때 던진다. */
  readonly failOpen?: Error;
  /** `select` 결과를 바꾼다(판독기 약속 위반 시험용). */
  readonly transformRows?: (request: ClipSqliteSelect, rows: ClipSqliteValue[][]) => ClipSqliteValue[][];
}

export function createNodeSqliteOpener(options: NodeSqliteOptions = {}): ClipSqliteOpener {
  return (databaseBytes) => {
    if (options.failOpen !== undefined) throw options.failOpen;
    const directory = mkdtempSync(join(options.tempRoot ?? tmpdir(), "clip-reader-"));
    const filePath = join(directory, "document.sqlite");
    let database: DatabaseSync | undefined;
    try {
      writeFileSync(filePath, databaseBytes, { mode: 0o600 });
      database = new DatabaseSync(filePath, { readOnly: true });
      // 신뢰할 수 없는 파일의 스키마(뷰·트리거·생성 열)가 안전하지 않은 SQL 함수를 부르지 못하게 한다.
      database.exec("PRAGMA trusted_schema = OFF");
    } catch (error) {
      database?.close();
      rmSync(directory, { recursive: true, force: true });
      throw error;
    }
    const opened = database;
    let selectCalls = 0;
    const adapter: ClipSqliteDatabase = {
      tableColumns(table) {
        if (options.log !== undefined) options.log.tableColumnCalls += 1;
        const rows = opened.prepare(`PRAGMA table_info(${identifier(table)})`).all() as Array<{ name: string }>;
        return Promise.resolve(rows.length === 0 ? null : rows.map((row) => row.name));
      },
      select(request) {
        const call = selectCalls;
        selectCalls += 1;
        options.log?.selects.push(request);
        if (options.failSelectAt !== undefined && options.failSelectAt.call === call) throw options.failSelectAt.error;
        const aliases = request.columns.map((_, index) => `c${index}`);
        const where = request.where === undefined ? "" : ` WHERE ${identifier(request.where.column)} IN (${request.where.in.map(() => "?").join(", ")})`;
        const order = request.orderBy === undefined ? "" : ` ORDER BY ${identifier(request.orderBy)}`;
        const sql = `SELECT ${request.distinct === true ? "DISTINCT " : ""}${request.columns.map((column, index) => projection(column, aliases[index]!)).join(", ")} FROM ${identifier(request.table)}${where}${order} LIMIT ${Math.trunc(request.limit)}`;
        // 정수는 bigint로 받아 2^53을 넘는 값이 조용히 뭉개지지 않게 한다(가져오기가 안전 정수로 환산하고 아니면 값 없음으로 본다).
        const statement = opened.prepare(sql);
        statement.setReadBigInts(true);
        const rows = statement.all(...(request.where?.in ?? [])) as Array<Record<string, ClipSqliteValue>>;
        let arrays: ClipSqliteValue[][] = rows.map((row) => aliases.map((alias) => row[alias] ?? null));
        if (options.transformRows !== undefined) arrays = options.transformRows(request, arrays);
        return Promise.resolve(arrays);
      },
      close() {
        if (options.log !== undefined) options.log.closed = true;
        opened.close();
        rmSync(directory, { recursive: true, force: true });
      },
    };
    return adapter;
  };
}

export const openNodeSqlite: ClipSqliteOpener = createNodeSqliteOpener();
