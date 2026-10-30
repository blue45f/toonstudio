import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { describe, expect, it } from "vitest";

import {
  encodeClipContainer,
  encodeClipExternalChunkPayload,
  encodeClipHeadPayload,
  planClipContainerLayout,
} from "../packages/studio-format-gateway/src/chunked-sqlite-container";

import {
  describeChunkedContainer,
  readSqliteSchemaWithNodeSqlite,
  runInspectCli,
  type CliDeps,
} from "./inspect-chunked-container.mts";

const SENTINEL = "SENTINEL-LAYER-NAME-DO-NOT-PRINT";
const EXTERNAL_ID = `extrnlid${"0".repeat(32)}`;

/** 실제 SQLite 파일을 임시로 만들어 바이트를 읽는다(`serialize`가 없는 Node 22에서도 동작한다). */
function buildSqliteBytes(): Uint8Array {
  const directory = mkdtempSync(join(tmpdir(), "inspect-container-test-"));
  try {
    const path = join(directory, "document.sqlite");
    const database = new DatabaseSync(path);
    database.exec(
      "CREATE TABLE Layer (MainId INTEGER PRIMARY KEY, LayerName TEXT, LayerOpacity INTEGER)",
    );
    database.exec('CREATE TABLE "Odd""Name" (payload BLOB)');
    const insert = database.prepare("INSERT INTO Layer (LayerName, LayerOpacity) VALUES (?, ?)");
    insert.run(SENTINEL, 256);
    insert.run("two", 128);
    database.close();
    return new Uint8Array(readFileSync(path));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function buildContainer(): Uint8Array {
  const exta = encodeClipExternalChunkPayload({ externalId: EXTERNAL_ID, data: Uint8Array.from([1, 2, 3]) });
  const sqlite = buildSqliteBytes();
  const layout = planClipContainerLayout([40, exta.byteLength, sqlite.byteLength, 0]);
  return encodeClipContainer({
    chunks: [
      { label: "Head", payload: encodeClipHeadPayload({ sqliteChunkOffset: layout.headerOffsets[2]!, fileId: Uint8Array.from({ length: 16 }, (_, index) => index + 1) }) },
      { label: "CHNKExta", payload: exta },
      { label: "SQLi", payload: sqlite },
      { label: "Foot", payload: new Uint8Array(0) },
    ],
  });
}

function makeCli(files: Record<string, Uint8Array>, schemaCalls?: { count: number }) {
  const out: string[] = [];
  const err: string[] = [];
  const deps: CliDeps = {
    readFile: (path) => {
      const bytes = files[path];
      if (bytes === undefined) throw new Error(`ENOENT: no such file, open '${path}'`);
      return bytes;
    },
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    readSqliteSchema: (databaseBytes) => {
      if (schemaCalls !== undefined) schemaCalls.count += 1;
      return readSqliteSchemaWithNodeSqlite(databaseBytes);
    },
  };
  return { deps, out, err };
}

describe("청크형 SQLite 컨테이너 구조 검사", () => {
  it("구조를 요약하되 행 내용은 담지 않는다", () => {
    const bytes = buildContainer();
    const report = describeChunkedContainer(bytes, { readSqliteSchema: readSqliteSchemaWithNodeSqlite });

    expect(report.kind).toBe("csfchunk");
    expect(report.headerLayout).toBe("length-then-offset");
    expect(report.truncated).toBe(false);
    expect(report.issues).toEqual([]);
    expect(report.head).toMatchObject({ version: 256, fileIdLength: 16 });
    expect(report.head?.sqliteChunkOffset).toBeGreaterThan(0);
    expect(report.chunkTypeCounts).toEqual({ Head: 1, Exta: 1, SQLi: 1, Foot: 1 });
    expect(report.externalBlocks).toMatchObject({
      total: 1,
      parsed: 1,
      unparsed: 0,
      dataBytes: 3,
      externalIdLengths: [EXTERNAL_ID.length],
    });
    expect(report.sha256).toBe(createHash("sha256").update(bytes).digest("hex"));

    const tables = report.sqlite?.schema?.tables ?? [];
    expect(tables.map((table) => table.name)).toEqual(["Layer", 'Odd"Name']);
    expect(tables[0]).toMatchObject({ rowCount: 2 });
    expect(tables[0]?.columns.map((column) => column.name)).toEqual([
      "MainId",
      "LayerName",
      "LayerOpacity",
    ]);
    // 따옴표가 든 식별자도 안전하게 인용되어 세어진다.
    expect(tables[1]).toMatchObject({ rowCount: 0 });

    expect(JSON.stringify(report)).not.toContain(SENTINEL);
  });

  it("스키마 판독기를 주입하지 않으면 SQLite 헤더 판정만 한다", () => {
    const report = describeChunkedContainer(buildContainer());

    expect(report.sqlite?.container).toBe("sqlite3");
    expect(report.sqlite?.schema).toBeUndefined();
    expect(report.sqlite?.schemaError).toBeUndefined();
  });

  it("SQLite 페이로드가 손상됐으면 예외 대신 schemaError로 보고한다", () => {
    const corrupt = new Uint8Array(200);
    corrupt.set(new TextEncoder().encode("SQLite format 3\0"), 0);
    const container = encodeClipContainer({
      chunks: [
        { label: "SQLi", payload: corrupt },
        { label: "Foot", payload: new Uint8Array(0) },
      ],
    });

    const report = describeChunkedContainer(container, {
      readSqliteSchema: readSqliteSchemaWithNodeSqlite,
    });

    expect(report.sqlite?.schema).toBeUndefined();
    expect(report.sqlite?.schemaError).toEqual(expect.any(String));
  });

  it("CLI는 JSON 보고서에 파일명만 쓰고 경로와 행 내용을 출력하지 않는다", () => {
    const path = "/private/home/user/Drawing.clip";
    const { deps, out, err } = makeCli({ [path]: buildContainer() });

    const code = runInspectCli(["--json", path], deps);

    expect(code).toBe(0);
    expect(err).toEqual([]);
    const text = out.join("");
    const parsed = JSON.parse(text) as Array<{ file: string; report: { kind: string } }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]?.file).toBe("Drawing.clip");
    expect(parsed[0]?.report.kind).toBe("csfchunk");
    expect(text).not.toContain("/private/home/user");
    expect(text).not.toContain(SENTINEL);
  });

  it("CLI 텍스트 출력은 가설 검증에 필요한 구조를 담고 행 내용은 담지 않는다", () => {
    const path = "sample.clip";
    const { deps, out } = makeCli({ [path]: buildContainer() });

    const code = runInspectCli([path], deps);

    expect(code).toBe(0);
    const text = out.join("");
    expect(text).toContain("headerLayout=length-then-offset");
    expect(text).toMatch(/head: version=256 sqliteChunkOffset=\d+ fileIdLength=16/);
    expect(text).toContain("chunks: Head×1 Exta×1 SQLi×1 Foot×1");
    expect(text).toContain("table Layer (2 rows): MainId INTEGER, LayerName TEXT, LayerOpacity INTEGER");
    expect(text).toContain("issues: (없음)");
    expect(text).not.toContain(SENTINEL);
  });

  it("--no-sqlite는 스키마 판독기를 호출하지 않는다", () => {
    const calls = { count: 0 };
    const { deps, out } = makeCli({ "a.clip": buildContainer() }, calls);

    const code = runInspectCli(["--no-sqlite", "a.clip"], deps);

    expect(code).toBe(0);
    expect(calls.count).toBe(0);
    expect(out.join("")).toContain("sqlite: container=sqlite3");
    expect(out.join("")).not.toContain("table Layer");
  });

  it("사용법 오류는 종료 코드 2를 돌려준다", () => {
    const noFiles = makeCli({});
    expect(runInspectCli([], noFiles.deps)).toBe(2);
    expect(noFiles.err.join("")).toContain("사용법");

    const unknownOption = makeCli({});
    expect(runInspectCli(["--bogus", "a.clip"], unknownOption.deps)).toBe(2);
    expect(unknownOption.err.join("")).toContain("알 수 없는 옵션");
  });

  it("읽을 수 없는 파일이 있어도 나머지는 검사하고 종료 코드 1을 돌려준다", () => {
    const { deps, out, err } = makeCli({ "ok.clip": buildContainer() });

    const code = runInspectCli(["missing.clip", "ok.clip"], deps);

    expect(code).toBe(1);
    expect(err.join("")).toContain("missing.clip: 읽기 실패");
    expect(out.join("")).toContain("== ok.clip");
  });
});
