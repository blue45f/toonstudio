import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatMarkdownReport } from "../analyze-bundle-treeshake.mjs";
import { renderStudioCompetitorWatchMarkdown } from "../studio-competitor-watch.mjs";
import { renderStudioResearchWatchMarkdown } from "../studio-research-watch.mjs";
import {
  escapeMarkdownTableCell,
  serializeSafeInlineJsString,
} from "./safe-text-serialization.mjs";

describe("escapeMarkdownTableCell (CodeQL #247 회귀 방지)", () => {
  it("역슬래시를 먼저 이스케이프한 뒤 파이프를 이스케이프해 셀 탈출을 차단한다", () => {
    assert.equal(escapeMarkdownTableCell("a|b"), "a\\|b");
    assert.equal(escapeMarkdownTableCell("a\\|b"), "a\\\\\\|b");
    assert.equal(escapeMarkdownTableCell("trailing\\"), "trailing\\\\");
    assert.equal(escapeMarkdownTableCell("\\\\|"), "\\\\\\\\\\|");
  });

  it("개행과 유니코드 줄 분리자를 공백으로 치환해 표 행 깨짐을 방지한다", () => {
    assert.equal(escapeMarkdownTableCell("첫줄\n둘째줄"), "첫줄 둘째줄");
    assert.equal(escapeMarkdownTableCell("win\r\nmac\runix\nnext"), "win mac unix next");
    assert.equal(escapeMarkdownTableCell("ls\u2028ps\u2029end"), "ls ps end");
  });

  it("collapseWhitespace 옵션으로 연속 공백과 앞뒤 공백을 정리하면서도 이스케이프 순서를 보존한다", () => {
    assert.equal(
      escapeMarkdownTableCell("  foo\\|bar\r\n   baz  ", { collapseWhitespace: true }),
      "foo\\\\\\|bar baz",
    );
    assert.equal(
      escapeMarkdownTableCell("  padded  "),
      "  padded  ",
    );
  });

  it("null·undefined 및 비문자열 입력을 안전하게 문자열화한다", () => {
    assert.equal(escapeMarkdownTableCell(null), "");
    assert.equal(escapeMarkdownTableCell(undefined), "");
    assert.equal(escapeMarkdownTableCell(42), "42");
    assert.equal(escapeMarkdownTableCell(false), "false");
  });
});

describe("serializeSafeInlineJsString (CodeQL #246 회귀 방지)", () => {
  it("</script>, HTML 주석, &, /, U+2028, U+2029를 안전한 유니코드 이스케이프로 직렬화한다", () => {
    const payload = "</script><script>alert('xss')&1/2</script><!--\u2028\u2029-->";
    const serialized = serializeSafeInlineJsString(payload);

    assert.doesNotMatch(serialized, /[<>&/\u2028\u2029]/u);
    assert.ok(serialized.includes("\\u003c"));
    assert.ok(serialized.includes("\\u003e"));
    assert.ok(serialized.includes("\\u0026"));
    assert.ok(serialized.includes("\\u002f"));
    assert.ok(serialized.includes("\\u2028"));
    assert.ok(serialized.includes("\\u2029"));
    assert.equal(JSON.parse(serialized), payload);
  });

  it("객체·배열·중첩 문자열의 원복 동등성을 유지하면서 위험 문자를 모두 제거한다", () => {
    const input = {
      closingTag: "</script>",
      htmlComment: "<!-- secret -->",
      query: "a=1&b=2/3",
      separators: "line1\u2028line2\u2029line3",
      quotesAndBackslash: "quote\"single'slash\\",
      nested: ["<b>bold</b>", 123, true, null],
    };
    const serialized = serializeSafeInlineJsString(input);

    assert.doesNotMatch(serialized, /[<>&/\u2028\u2029]/u);
    assert.deepEqual(JSON.parse(serialized), input);
  });

  it("undefined·함수·심볼 등 JSON 직렬화 불가 최상위 값을 안전하게 null로 반환한다", () => {
    assert.equal(serializeSafeInlineJsString(undefined), "null");
    assert.equal(serializeSafeInlineJsString(null), "null");
    assert.equal(serializeSafeInlineJsString(() => {}), "null");
    assert.equal(serializeSafeInlineJsString(Symbol("x")), "null");
  });

  it("인라인 JS 리터럴로 평가했을 때 원본 문자열과 정확히 일치한다", () => {
    const original = "hello </script> & a/b \\ \" ' \n \u2028 \u2029";
    const serialized = serializeSafeInlineJsString(original);
    const parsed = JSON.parse(serialized);
    assert.equal(parsed, original);
    assert.equal(serialized.includes("</script>"), false);
  });
});

describe("기존 scripts/ 마크다운 셀 생성기 연동 회귀 테스트", () => {
  it("analyze-bundle-treeshake 리포트 셀이 역슬래시+파이프와 개행을 안전하게 이스케이프한다", () => {
    const markdown = formatMarkdownReport({
      entries: ["apps/web/src/app/main.tsx"],
      graphSummary: { totalModules: 1, totalKiB: 1.0 },
      elapsedMs: 10,
      counts: { totalCandidates: 1, barrelReexport: 1, namespaceImport: 0, unusedStaticImport: 0 },
      exactGraphSaveableKiB: 1.0,
      exactGraphSaveableModules: 1,
      estimatedTotalSaveableKiB: 1.0,
      topCandidates: [
        {
          category: "barrel-reexport",
          file: "src\\a|b.ts",
          line: 7,
          target: "mod\\|x",
          savingsKind: "exact",
          saveableKiB: 1.0,
          pulledKiB: 2.0,
          recommendationKo: "줄1\n줄2\\|끝",
        },
      ],
    });
    assert.ok(markdown.includes("`src\\\\a\\|b.ts:7`"));
    assert.ok(markdown.includes("`mod\\\\\\|x`"));
    assert.ok(markdown.includes("줄1 줄2\\\\\\|끝"));
  });

  it("studio-competitor-watch와 studio-research-watch 마크다운 표가 역슬래시+파이프 셀 탈출을 차단한다", () => {
    const competitorMd = renderStudioCompetitorWatchMarkdown({
      generatedAt: "2026-11-23T00:00:00Z",
      selectedCount: 1,
      okCount: 1,
      failedCount: 0,
      aggregateHash: "a".repeat(64),
      results: [
        {
          name: "App\\|Pro",
          category: "draw\\cat",
          ok: true,
          status: 200,
          title: "Line1\nLine2\\|Tail",
          lastModified: "-",
          contentHash: "b".repeat(64),
          errorCode: "",
          error: "",
        },
      ],
    });
    assert.ok(competitorMd.includes("App\\\\\\|Pro"));
    assert.ok(competitorMd.includes("draw\\\\cat"));
    assert.ok(competitorMd.includes("Line1 Line2\\\\\\|Tail"));

    const researchMd = renderStudioResearchWatchMarkdown({
      generatedAt: "2026-11-23T00:00:00Z",
      seedReport: { okCount: 1, selectedCount: 1 },
      queryReports: [{ id: "q1", ok: true, status: 200 }],
      discoveredCount: 1,
      aggregateHash: "c".repeat(64),
      entries: [
        {
          updated: "2026-11-23T00:00:00Z",
          published: "2026-11-23T00:00:00Z",
          title: "Paper\\|Title\r\nSubtitle",
          categories: ["cs.GR"],
          focus: ["brush\\|core"],
        },
      ],
    });
    assert.ok(researchMd.includes("Paper\\\\\\|Title Subtitle"));
    assert.ok(researchMd.includes("brush\\\\\\|core"));
  });
});
