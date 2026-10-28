import { readFileSync } from "node:fs";

import { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { reviewPenStrokesSchema } from "@toonstudio/studio-project-model";
import { describe, expect, it } from "vitest";

import { studioReviewComments } from "../../platform/database/schema/studio-project-graph.schema";

const migration = readFileSync(new URL(
  "../../platform/database/migrations/0114_studio_review_comment_pen_strokes.sql", import.meta.url,
), "utf8");
const executable = migration.split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
const dialect = new PgDialect();
const stroke = (id: string, count = 2) => ({ id, color: "#e5484d", width: 2,
  points: Array.from({ length: count }, (_, index) => ({ x: index, y: index })) });

describe("검수 펜 획 영속화 migration 계약", () => {
  it("신규 스키마에 빈 JSON 배열 기본값과 동일한 배열·바이트 예산을 등록한다", () => {
    const table = getTableConfig(studioReviewComments);
    const column = table.columns.find((item) => item.name === "strokes");
    expect(column?.columnType).toBe("PgJsonb");
    expect(column?.notNull).toBe(true);
    expect(column?.hasDefault).toBe(true);
    if (!(column?.default instanceof SQL)) throw new Error("획의 SQL 기본값이 필요합니다.");
    expect(dialect.sqlToQuery(column.default).sql).toBe("'[]'::jsonb");
    const budget = table.checks.find((item) => item.name === "studio_review_comment_strokes_budget_check");
    expect(budget).toBeDefined();
    const check = dialect.sqlToQuery(budget!.value).sql;
    expect(check).toContain("case when jsonb_typeof(");
    expect(check).toContain("<= 50");
    expect(check).toContain("<= 2097152");
    expect(check).toContain("else false end");
  });

  it("기존 댓글을 보존하며 반복 적용하고 기존 anchor와 해결 상태 trigger를 유지한다", () => {
    expect(executable.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(executable.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(executable).toContain("ADD COLUMN IF NOT EXISTS strokes jsonb NOT NULL DEFAULT '[]'::jsonb");
    expect(executable).toContain("conrelid = 'studio_review_comment'::regclass");
    expect(executable).toContain("CREATE OR REPLACE FUNCTION studio_validate_review_comment_strokes()");
    expect(executable).toContain("DROP TRIGGER IF EXISTS studio_review_comment_strokes_check");
    expect(executable).toContain("BEFORE INSERT OR UPDATE ON studio_review_comment");
    expect(executable).toContain("NEW.strokes IS DISTINCT FROM OLD.strokes");
    expect(executable).toContain("REVOKE ALL ON FUNCTION studio_validate_review_comment_strokes() FROM PUBLIC");
    expect(executable).not.toMatch(/(?:DROP|DISABLE)\s+TRIGGER[^;]*studio_review_comment_anchor_check/iu);
    expect(executable).not.toMatch(/\b(?:DROP\s+(?:TABLE|COLUMN)|TRUNCATE|UPDATE\s+studio_review_comment)\b/iu);
    expect(executable).not.toMatch(/NEW\.(?:anchor|body|status)\s*:=/iu);
  });

  it("공유 입력과 DB 모두 ID·strict 필드·획/점 수·숫자 예산 경계를 유지한다", () => {
    expect(reviewPenStrokesSchema.safeParse([]).success).toBe(true);
    expect(reviewPenStrokesSchema.safeParse(Array.from({ length: 50 }, (_, index) => stroke(`pen-${index}`, 500))).success).toBe(true);
    for (const value of [Array.from({ length: 51 }, (_, index) => stroke(`pen-${index}`)), [stroke("pen", 501)],
      [stroke("pen"), stroke("pen")], [stroke("x".repeat(65))], [{ ...stroke("pen"), extra: true }],
      [{ ...stroke("pen"), points: [{ x: -1, y: 0 }, { x: 1, y: 1 }] }]]) {
      expect(reviewPenStrokesSchema.safeParse(value).success).toBe(false);
    }
    for (const guard of ["jsonb_array_length(NEW.strokes) > 50", "octet_length(NEW.strokes::text) > 2097152",
      "length(stroke->>'id') NOT BETWEEN 1 AND 64", "stroke - ARRAY['id', 'points', 'color', 'width']",
      "stroke->>'id' = ANY(identifiers)", "jsonb_array_length(stroke->'points') NOT BETWEEN 2 AND 500",
      "point_count > 25000", "point - ARRAY['x', 'y']", "(point->>'x')::numeric NOT BETWEEN 0 AND",
      "NEW.anchor->>'kind' IS DISTINCT FROM 'region'", "jsonb_typeof(NEW.anchor->'source') IS DISTINCT FROM 'object'"]) {
      expect(executable).toContain(guard);
    }
  });

  it("획이 있는 댓글의 anchor와 양수 float64 최소 폭을 정본으로 보존한다", () => {
    expect(executable).toContain("IF TG_OP = 'UPDATE' THEN");
    expect(executable).toContain("jsonb_array_length(OLD.strokes) > 0 AND NEW.anchor IS DISTINCT FROM OLD.anchor");
    expect(executable).toContain("ERRCODE = '23514', MESSAGE = 'review comment stroke anchors are immutable'");
    expect(executable).toContain("(stroke->>'width')::numeric < 4.9406564584124654e-324");
    const minimum = [{ ...stroke("minimum"), width: Number.MIN_VALUE }];
    const canonical: unknown = JSON.parse(JSON.stringify(minimum));
    expect(JSON.stringify(minimum)).toContain('"width":5e-324');
    expect(reviewPenStrokesSchema.safeParse(canonical).success).toBe(true);
    const underflow: unknown = JSON.parse('[{"id":"tiny","color":"#e5484d","width":1e-1000,"points":[{"x":0,"y":0},{"x":1,"y":1}]}]');
    expect(reviewPenStrokesSchema.safeParse(underflow).success).toBe(false);
  });
});
