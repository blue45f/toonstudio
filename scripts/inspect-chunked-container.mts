/**
 * 청크형 SQLite 문서 컨테이너(.clip / .lip) 구조 검사 CLI.
 *
 * 사용자가 소유한 실제 샘플로 `chunked-sqlite-container.ts`의 가정(헤더 필드 순서, 청크 레이아웃,
 * 외부 블록 형태)을 검증하기 위한 도구다. 구조 정보만 출력한다: 청크 목록, 헤더 판정, SQLite 테이블·컬럼
 * 이름과 행 수. 픽셀, 행 내용, 사용자 텍스트는 출력하지 않으며, 파일은 해시와 파일명(경로 제외)으로만
 * 식별한다. 출력은 샘플 파일을 공유하지 않고도 가설 검증 결과를 공유할 수 있게 하려는 것이다.
 *
 * 사용법:
 *   pnpm exec tsx scripts/inspect-chunked-container.mts [--json] [--no-sqlite] <파일>...
 */

import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { pathToFileURL } from "node:url";

import { parseClipContainer } from "../packages/studio-format-gateway/src/chunked-sqlite-container.ts";

import type { ClipContainerParseResult } from "../packages/studio-format-gateway/src/chunked-sqlite-container.ts";

const MAX_LISTED_CHUNKS = 200;
const MAX_TABLES = 512;
const MAX_COLUMNS_PER_TABLE = 512;
const MAX_ERROR_CHARACTERS = 200;

export interface SqliteColumnSummary {
  readonly name: string;
  readonly type: string;
}

export interface SqliteTableSummary {
  readonly name: string;
  readonly columns: readonly SqliteColumnSummary[];
  /** 행 수. 센 수 없으면 null 이고 이유가 `error`에 있다. */
  readonly rowCount: number | null;
  readonly error?: string;
}

export interface SqliteSchemaSummary {
  readonly tables: readonly SqliteTableSummary[];
  /** 테이블이 한도(MAX_TABLES)를 넘어 일부만 담았는지 여부. */
  readonly tablesOmitted: boolean;
}

export type SqliteSchemaReader = (databaseBytes: Uint8Array) => SqliteSchemaSummary;

export interface ContainerChunkSummary {
  readonly index: number;
  readonly type: string;
  readonly offset: number;
  readonly payloadLength: number;
}

export interface ChunkedContainerReport {
  readonly byteLength: number;
  readonly sha256: string;
  readonly kind: ClipContainerParseResult["kind"];
  readonly headerLayout: ClipContainerParseResult["headerLayout"];
  readonly declaredChunkStart: number | null;
  readonly declaredFileLength: number | null;
  readonly truncated: boolean;
  readonly chunkTypeCounts: Readonly<Record<string, number>>;
  readonly chunks: readonly ContainerChunkSummary[];
  readonly chunksOmitted: number;
  readonly externalBlocks: {
    readonly total: number;
    readonly parsed: number;
    readonly unparsed: number;
    readonly dataBytes: number;
    readonly externalIdLengths: readonly number[];
  };
  readonly sqlite: null | {
    readonly payloadOffset: number;
    readonly payloadLength: number;
    readonly container: string;
    readonly pageSize: number | null;
    readonly textEncoding: string | null;
    readonly schemaFormat: number | null;
    readonly pageCount: number | null;
    readonly schema?: SqliteSchemaSummary;
    readonly schemaError?: string;
  };
  readonly issues: ReadonlyArray<{ readonly code: string; readonly message: string }>;
}

export interface DescribeOptions {
  /** 주입하지 않으면 SQLite 스키마를 읽지 않는다. */
  readonly readSqliteSchema?: SqliteSchemaReader;
}

function describeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > MAX_ERROR_CHARACTERS ? `${message.slice(0, MAX_ERROR_CHARACTERS)}…` : message;
}

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * `node:sqlite`로 임베디드 DB의 스키마(테이블·컬럼 이름과 행 수)만 읽는다. DB는 임시 파일에 쓰고
 * 읽기 전용으로 열며, 행 내용은 조회하지 않는다. 신뢰할 수 없는 파일이므로 `sqlite_master` 목록과
 * `PRAGMA table_info`, `COUNT(*)` 외에는 실행하지 않는다.
 */
export function readSqliteSchemaWithNodeSqlite(databaseBytes: Uint8Array): SqliteSchemaSummary {
  const directory = mkdtempSync(join(tmpdir(), "chunked-container-"));
  const filePath = join(directory, "document.sqlite");
  try {
    writeFileSync(filePath, databaseBytes, { mode: 0o600 });
    const database = new DatabaseSync(filePath, { readOnly: true });
    try {
      const rows = database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all() as Array<{ name: string }>;
      const listed = rows.slice(0, MAX_TABLES);
      const tables = listed.map((row): SqliteTableSummary => {
        const quoted = quoteIdentifier(row.name);
        try {
          const columns = (
            database.prepare(`PRAGMA table_info(${quoted})`).all() as Array<{ name: string; type: string }>
          )
            .slice(0, MAX_COLUMNS_PER_TABLE)
            .map((column) => ({ name: column.name, type: column.type }));
          const counted = database.prepare(`SELECT COUNT(*) AS n FROM ${quoted}`).get() as { n: number | bigint };
          return { name: row.name, columns, rowCount: Number(counted.n) };
        } catch (error) {
          return { name: row.name, columns: [], rowCount: null, error: describeError(error) };
        }
      });
      return { tables, tablesOmitted: rows.length > listed.length };
    } finally {
      database.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** 컨테이너 바이트를 구조 보고서로 요약한다. 행 내용·픽셀·사용자 텍스트는 포함하지 않는다. */
export function describeChunkedContainer(
  bytes: Uint8Array,
  options: DescribeOptions = {},
): ChunkedContainerReport {
  const parsed = parseClipContainer(bytes);

  const chunkTypeCounts: Record<string, number> = {};
  for (const chunk of parsed.chunks) {
    chunkTypeCounts[chunk.type] = (chunkTypeCounts[chunk.type] ?? 0) + 1;
  }

  const listed = parsed.chunks.slice(0, MAX_LISTED_CHUNKS).map(
    (chunk, index): ContainerChunkSummary => ({
      index,
      type: chunk.type,
      offset: chunk.headerOffset,
      payloadLength: chunk.payloadLength,
    }),
  );

  const idLengths = new Set<number>();
  let dataBytes = 0;
  let parsedBlocks = 0;
  for (const block of parsed.externalBlocks) {
    dataBytes += block.dataLength;
    if (block.parsed) {
      parsedBlocks += 1;
      idLengths.add(block.externalId.length);
    }
  }

  let sqlite: ChunkedContainerReport["sqlite"] = null;
  if (parsed.sqlite !== null) {
    const { payloadOffset, payloadLength, inspection } = parsed.sqlite;
    const base = {
      payloadOffset,
      payloadLength,
      container: inspection.container,
      pageSize: inspection.pageSize,
      textEncoding: inspection.textEncoding,
      schemaFormat: inspection.schemaFormat,
      pageCount: inspection.pageCount,
    };
    if (options.readSqliteSchema !== undefined && inspection.container === "sqlite3") {
      try {
        const schema = options.readSqliteSchema(bytes.subarray(payloadOffset, payloadOffset + payloadLength));
        sqlite = { ...base, schema };
      } catch (error) {
        sqlite = { ...base, schemaError: describeError(error) };
      }
    } else {
      sqlite = base;
    }
  }

  return {
    byteLength: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    kind: parsed.kind,
    headerLayout: parsed.headerLayout,
    declaredChunkStart: parsed.declaredChunkStart,
    declaredFileLength: parsed.declaredFileLength,
    truncated: parsed.truncated,
    chunkTypeCounts,
    chunks: listed,
    chunksOmitted: Math.max(0, parsed.chunks.length - listed.length),
    externalBlocks: {
      total: parsed.externalBlocks.length,
      parsed: parsedBlocks,
      unparsed: parsed.externalBlocks.length - parsedBlocks,
      dataBytes,
      externalIdLengths: [...idLengths].sort((a, b) => a - b),
    },
    sqlite,
    issues: parsed.issues.map((issue) => ({ code: issue.code, message: issue.message })),
  };
}

export function formatReportText(fileName: string, report: ChunkedContainerReport): string {
  const lines: string[] = [];
  lines.push(`== ${fileName} (${report.byteLength.toLocaleString("en-US")} bytes, sha256 ${report.sha256})`);
  lines.push(
    `kind=${report.kind} headerLayout=${report.headerLayout} declared(start=${String(report.declaredChunkStart)}, length=${String(report.declaredFileLength)}) truncated=${String(report.truncated)}`,
  );
  const counts = Object.entries(report.chunkTypeCounts)
    .map(([type, count]) => `${type}×${count}`)
    .join(" ");
  lines.push(`chunks: ${counts.length > 0 ? counts : "(없음)"}${report.chunksOmitted > 0 ? ` (목록은 ${MAX_LISTED_CHUNKS}개까지)` : ""}`);
  const external = report.externalBlocks;
  lines.push(
    `external: total=${external.total} parsed=${external.parsed} unparsed=${external.unparsed} data=${external.dataBytes.toLocaleString("en-US")} bytes idLengths=[${external.externalIdLengths.join(",")}]`,
  );
  if (report.sqlite === null) {
    lines.push("sqlite: (없음)");
  } else {
    const sqlite = report.sqlite;
    lines.push(
      `sqlite: container=${sqlite.container} pageSize=${String(sqlite.pageSize)} encoding=${String(sqlite.textEncoding)} payload=${sqlite.payloadLength.toLocaleString("en-US")} bytes`,
    );
    if (sqlite.schemaError !== undefined) lines.push(`  스키마 읽기 실패: ${sqlite.schemaError}`);
    for (const table of sqlite.schema?.tables ?? []) {
      const names = table.columns.map((column) => `${column.name} ${column.type}`.trim()).join(", ");
      const rows = table.rowCount === null ? "행 수 불명" : `${table.rowCount} rows`;
      lines.push(`  table ${table.name} (${rows}): ${names}${table.error === undefined ? "" : ` [오류: ${table.error}]`}`);
    }
    if (sqlite.schema?.tablesOmitted === true) lines.push(`  (테이블이 ${MAX_TABLES}개를 넘어 일부만 표시)`);
  }
  if (report.issues.length === 0) {
    lines.push("issues: (없음)");
  } else {
    lines.push("issues:");
    for (const issue of report.issues) lines.push(`  - ${issue.code}: ${issue.message}`);
  }
  return lines.join("\n");
}

const USAGE = [
  "사용법: pnpm exec tsx scripts/inspect-chunked-container.mts [--json] [--no-sqlite] <파일>...",
  "",
  "  --json        구조 보고서를 JSON 배열로 출력한다.",
  "  --no-sqlite   임베디드 SQLite 스키마를 읽지 않는다(헤더 판정만).",
  "",
  "구조 정보(청크 목록, SQLite 테이블·컬럼 이름, 행 수)만 출력한다. 픽셀, 행 내용, 사용자 텍스트는",
  "출력하지 않는다. 사용자가 소유하거나 사용 허락을 받은 파일만 검사하고, 샘플을 저장소에 커밋하지 않는다.",
].join("\n");

export interface CliDeps {
  readonly readFile: (path: string) => Uint8Array;
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
  readonly readSqliteSchema: SqliteSchemaReader;
}

const DEFAULT_DEPS: CliDeps = {
  readFile: (path) => readFileSync(path),
  stdout: (text) => {
    process.stdout.write(text);
  },
  stderr: (text) => {
    process.stderr.write(text);
  },
  readSqliteSchema: readSqliteSchemaWithNodeSqlite,
};

/** 종료 코드: 0 정상, 1 파일 읽기 실패, 2 사용법 오류. */
export function runInspectCli(argv: readonly string[], deps: CliDeps = DEFAULT_DEPS): number {
  let json = false;
  let readSchema = true;
  const files: string[] = [];
  for (const arg of argv) {
    if (arg === "--json") json = true;
    else if (arg === "--no-sqlite") readSchema = false;
    else if (arg === "--help" || arg === "-h") {
      deps.stdout(`${USAGE}\n`);
      return 0;
    } else if (arg.startsWith("--")) {
      deps.stderr(`알 수 없는 옵션: ${arg}\n${USAGE}\n`);
      return 2;
    } else files.push(arg);
  }
  if (files.length === 0) {
    deps.stderr(`검사할 파일이 없습니다.\n${USAGE}\n`);
    return 2;
  }

  let exitCode = 0;
  const reports: Array<{ file: string; report: ChunkedContainerReport }> = [];
  for (const filePath of files) {
    let bytes: Uint8Array;
    try {
      bytes = deps.readFile(filePath);
    } catch (error) {
      deps.stderr(`${basename(filePath)}: 읽기 실패: ${describeError(error)}\n`);
      exitCode = 1;
      continue;
    }
    const report = describeChunkedContainer(bytes, readSchema ? { readSqliteSchema: deps.readSqliteSchema } : {});
    reports.push({ file: basename(filePath), report });
  }

  if (json) {
    deps.stdout(`${JSON.stringify(reports, null, 2)}\n`);
  } else {
    for (const { file, report } of reports) deps.stdout(`${formatReportText(file, report)}\n`);
  }
  return exitCode;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runInspectCli(process.argv.slice(2));
}
